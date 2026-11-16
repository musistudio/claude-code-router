import { StringDecoder } from "node:string_decoder";
import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";

/**
 * SSE event boundaries and protocol-native terminal error frames.
 *
 * A truncated upstream stream cannot be retried (its bytes are gone) and cannot
 * be repaired, but the client still has to tell a truncation from a completed
 * response. One terminal frame makes the failure explicit and typed.
 *
 * The frame is only *visible* to the client when it starts at a real SSE event
 * boundary. Text after a blank line is a new event; text appended to a partial
 * line or to a still-open event is absorbed by that event instead, so the
 * client never sees it. Two facts therefore decide the wire bytes:
 *
 * - whether the stream is at a boundary (no partial line, no open event), and
 * - whether a terminal event was already *dispatched* — dispatched means a
 *   complete, blank-line-delimited event, never a newline-terminated field and
 *   never an event that only a flush invented at the end of the stream.
 */

const terminalErrorMessage = "Upstream stream failed before the response completed";
const openAiStreamDonePayload = "[DONE]";

/**
 * Transport phases a client may be told. The table is closed on purpose: an
 * upstream message, a signed URL or an internal address must never reach the
 * client, and a token is only forwarded when it is exactly one of these keys.
 */
const clientSafeTransportCodes: Record<string, true> = {
  aborted: true,
  connect: true,
  dns: true,
  response_body: true,
  response_headers: true,
  tls: true
};

/**
 * The one client-visible transport identity: an allowlisted phase token, or
 * `undefined` when the token is unknown. Never any source text.
 */
export function clientSafeTransportCode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && clientSafeTransportCodes[normalized] ? normalized : undefined;
}

export type SseBoundaryRepair = {
  /** True when a partially received line is still unterminated. */
  partialLine: boolean;
  /** True when a parsed event is buffered but not yet dispatched. */
  openEvent: boolean;
  /**
   * True when the undelivered tail is the protocol's own stream terminator. The
   * repair dispatches it, so a caller must not add a second one.
   */
  pendingTerminator: boolean;
  /** The exact bytes to write first; empty at a true boundary. */
  bytes: string;
};

/**
 * Tracks the SSE parse position over a byte stream so a writer can tell whether
 * its next event would start a new event or be appended to a partial one.
 *
 * The field grammar mirrors an SSE client: lines end at `\n` (an optional `\r`
 * is stripped), a blank line dispatches, `:`-prefixed lines are comments, and
 * only `event`/`data` fields carry state. Bytes are decoded once, through a
 * `StringDecoder`, so a multibyte character split across chunks is one
 * character and not two broken ones.
 */
export type SseBoundaryTracker = {
  /** Consume client bytes. Returns true when a complete event was dispatched. */
  append: (chunk: Buffer | string) => boolean;
  /** Bytes the writer must send before its own frame to start a new event. */
  repair: () => SseBoundaryRepair;
  /** Drop all parse state, e.g. when the tracked body turned out not to be SSE. */
  reset: () => void;
};

export function createSseBoundaryTracker(): SseBoundaryTracker {
  const decoder = new StringDecoder("utf8");
  let pendingLine = "";
  let openEvent = false;
  // The value carried by an undelivered `data:` line, so the caller can tell a
  // truncated terminator from truncated content.
  let pendingData = "";

  const fieldName = (line: string): string => {
    const separator = line.indexOf(":");
    return separator === -1 ? line : line.slice(0, separator);
  };

  const fieldValue = (line: string): string => {
    const separator = line.indexOf(":");
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    return rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
  };

  const isCarryingField = (line: string): boolean => {
    if (line === "" || line.startsWith(":")) {
      return false;
    }
    const field = fieldName(line);
    return field === "event" || field === "data";
  };

  const noteLine = (line: string) => {
    if (line === "") {
      openEvent = false;
      pendingData = "";
      return;
    }
    if (!isCarryingField(line)) {
      return;
    }
    openEvent = true;
    pendingData = fieldName(line) === "data" ? fieldValue(line) : pendingData;
  };

  const consumeText = (text: string): boolean => {
    let dispatched = false;
    pendingLine += text;
    for (;;) {
      const newlineIndex = pendingLine.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const rawLine = pendingLine.slice(0, newlineIndex);
      pendingLine = pendingLine.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line === "" && openEvent) {
        dispatched = true;
      }
      noteLine(line);
    }
    return dispatched;
  };

  return {
    append(chunk) {
      return consumeText(Buffer.isBuffer(chunk) ? decoder.write(chunk) : chunk);
    },
    repair() {
      const partialLine = pendingLine.length > 0;
      // An unterminated line is itself a field in flight: it opens an event
      // exactly like a completed one, so a mid-line cut still needs both the
      // line terminator and the dispatch blank line.
      const open = openEvent || (partialLine && isCarryingField(pendingLine));
      // A partial line needs its own terminator before the blank line that
      // dispatches it; an open event only needs the blank line that closes it.
      const bytes = partialLine ? (open ? "\n\n" : "\n") : open ? "\n" : "";
      // The repair dispatches whatever the tail buffered, so a terminator sitting
      // there must not be written a second time by the caller.
      const tailData = partialLine && fieldName(pendingLine) === "data" ? fieldValue(pendingLine) : pendingData;
      const pendingTerminator = open && tailData.trim() === openAiStreamDonePayload;
      return { bytes, openEvent: open, partialLine, pendingTerminator };
    },
    reset() {
      decoder.end();
      pendingLine = "";
      openEvent = false;
      pendingData = "";
    }
  };
}

/**
 * The protocol-native terminal error frame for a stream that died after its
 * response headers were sent. Returns no bytes when the protocol has no in-band
 * terminal error event, so the caller keeps its socket-close fallback.
 */
export function terminalErrorFrame(
  error: { pendingTerminator?: boolean; transportCode?: string } | undefined,
  protocol: GatewayProviderProtocol | undefined
): Uint8Array {
  const code = clientSafeTransportCode(error?.transportCode);
  // The client text is the fixed generic sentence plus, at most, a closed-set
  // token. No upstream message is ever interpolated here.
  const message = code ? `${terminalErrorMessage} (${code})` : terminalErrorMessage;
  const payload = { code: "upstream_stream_error", message, type: "api_error" };
  // A truncated tail that already is the protocol's own terminator is dispatched
  // by the boundary repair, so adding a second one would duplicate it.
  const terminator = error?.pendingTerminator ? "" : `data: ${openAiStreamDonePayload}\n\n`;
  // Each protocol ends with the terminator its own SDK waits for, so a client
  // that ignores the error event still leaves the stream deliberately.
  let frames: string[];
  switch (protocol) {
    case "anthropic_messages":
      frames = [`event: error\ndata: ${JSON.stringify({ error: { message, type: "api_error" }, type: "error" })}\n\n`];
      break;
    case "openai_chat_completions":
      frames = [`data: ${JSON.stringify({ error: payload })}\n\n`, terminator];
      break;
    case "openai_responses":
      frames = [
        `event: response.failed\ndata: ${JSON.stringify({ response: { error: payload, status: "failed" }, type: "response.failed" })}\n\n`,
        terminator
      ];
      break;
    default:
      return new Uint8Array(0);
  }
  return Buffer.from(frames.join(""), "utf8");
}
