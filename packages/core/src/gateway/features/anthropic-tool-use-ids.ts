import { Readable, Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

// Anthropic rejects any tool_use.id outside this pattern. OpenAI-protocol
// providers are free to mint other ids (Moonshot kimi emits "Bash:0" or
// "functions.Bash:0"), and once such an id reaches Claude Code it is replayed
// on every later turn, so a switch to an Anthropic model fails for the rest of
// the session (#1808).
const anthropicToolUseIdPattern = /^[A-Za-z0-9_-]+$/;

export function sanitizeAnthropicToolUseIdValue(id: string): string {
  if (!id || anthropicToolUseIdPattern.test(id)) {
    return id;
  }
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

// Rewrites tool_use / tool_result ids in an Anthropic Messages request body.
// The rewrite is deterministic, so ids sanitized on the way out and ids that
// were already poisoned in the client transcript both end up identical, and a
// tool_result still pairs with its tool_use.
export function prepareAnthropicToolUseIdRequest(input: {
  body?: Buffer;
  method: string;
  protocol?: GatewayProviderProtocol;
}): { body: Buffer; rewritten: number } | undefined {
  if (input.method.toUpperCase() !== "POST" || input.protocol !== "anthropic_messages" || !input.body?.length) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body.toString("utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.messages)) {
    return undefined;
  }
  let rewritten = 0;
  for (const message of parsed.messages) {
    if (!isRecord(message) || !Array.isArray(message.content)) {
      continue;
    }
    for (const block of message.content) {
      if (!isRecord(block)) {
        continue;
      }
      const key = block.type === "tool_use" ? "id" : block.type === "tool_result" ? "tool_use_id" : undefined;
      const id = key ? stringValue(block[key]) : undefined;
      if (!key || !id) {
        continue;
      }
      const sanitized = sanitizeAnthropicToolUseIdValue(id);
      if (sanitized !== id) {
        block[key] = sanitized;
        rewritten += 1;
      }
    }
  }
  return rewritten ? { body: Buffer.from(JSON.stringify(parsed)), rewritten } : undefined;
}

export function shouldSanitizeAnthropicToolUseIdResponse(input: {
  contentType: string | undefined;
  protocol: GatewayProviderProtocol | undefined;
}): boolean {
  const contentType = input.contentType?.toLowerCase() ?? "";
  return input.protocol === "anthropic_messages" &&
    (contentType.includes("text/event-stream") || contentType.includes("application/json"));
}

export function sanitizeAnthropicToolUseIdResponseStream(
  input: Readable,
  contentType: string | undefined
): Readable {
  const decoder = new StringDecoder("utf8");
  const sse = Boolean(contentType?.toLowerCase().includes("text/event-stream"));
  let pending = "";
  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      pending += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      if (sse) {
        pending = drainSseBlocks(this, pending, false);
      }
      callback();
    },
    flush(callback) {
      pending += decoder.end();
      if (sse) {
        drainSseBlocks(this, pending, true);
      } else if (pending) {
        this.push(sanitizeAnthropicMessageJson(pending));
      }
      pending = "";
      callback();
    }
  }));
}

function drainSseBlocks(stream: Transform, text: string, flush: boolean): string {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    const index = match.index ?? 0;
    const delimiter = match[0];
    const block = text.slice(cursor, index);
    cursor = index + delimiter.length;
    stream.push(`${sanitizeSseBlock(block)}${delimiter}`);
  }
  const trailing = text.slice(cursor);
  if (!flush) {
    return trailing;
  }
  if (trailing) {
    stream.push(sanitizeSseBlock(trailing));
  }
  return "";
}

export function sanitizeAnthropicToolUseIdSseBlockForTest(block: string): string {
  return sanitizeSseBlock(block);
}

function sanitizeSseBlock(block: string): string {
  if (!block.includes("tool_use")) {
    return block;
  }
  const parsed = parseSseJsonData(block);
  if (!isRecord(parsed) || parsed.type !== "content_block_start" || !isRecord(parsed.content_block)) {
    return block;
  }
  const id = stringValue(parsed.content_block.id);
  if (parsed.content_block.type !== "tool_use" || !id) {
    return block;
  }
  const sanitized = sanitizeAnthropicToolUseIdValue(id);
  if (sanitized === id) {
    return block;
  }
  return replaceSseDataLines(block, JSON.stringify({
    ...parsed,
    content_block: { ...parsed.content_block, id: sanitized }
  }));
}

function sanitizeAnthropicMessageJson(text: string): string {
  if (!text.includes("tool_use")) {
    return text;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.content)) {
    return text;
  }
  let changed = false;
  for (const block of parsed.content) {
    const id = isRecord(block) && block.type === "tool_use" ? stringValue(block.id) : undefined;
    if (!isRecord(block) || !id) {
      continue;
    }
    const sanitized = sanitizeAnthropicToolUseIdValue(id);
    if (sanitized !== id) {
      block.id = sanitized;
      changed = true;
    }
  }
  return changed ? JSON.stringify(parsed) : text;
}

function parseSseJsonData(block: string): unknown {
  const data = block
    .split(/\r?\n/g)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data || data === "[DONE]") {
    return undefined;
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

function replaceSseDataLines(block: string, data: string): string {
  const newline = block.includes("\r\n") ? "\r\n" : "\n";
  const output: string[] = [];
  let replaced = false;
  for (const line of block.split(/\r?\n/g)) {
    if (!line.startsWith("data:")) {
      output.push(line);
      continue;
    }
    if (!replaced) {
      output.push(`data: ${data}`);
      replaced = true;
    }
  }
  return output.join(newline);
}
