import { Readable, Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

export function shouldRewriteAnthropicMessageStartModel(input: {
  contentType: string | undefined;
  model: string | undefined;
  protocol: GatewayProviderProtocol | undefined;
}): boolean {
  return input.protocol === "anthropic_messages" &&
    Boolean(input.model?.trim()) &&
    Boolean(input.contentType?.toLowerCase().includes("text/event-stream"));
}

export function rewriteAnthropicMessageStartModelStream(
  input: Readable,
  model: string
): Readable {
  const replacementModel = model.trim();
  if (!replacementModel) {
    return input;
  }

  const decoder = new StringDecoder("utf8");
  let pending = "";
  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      pending += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      pending = drainAnthropicSseBlocks(this, pending, replacementModel, false);
      callback();
    },
    flush(callback) {
      pending += decoder.end();
      drainAnthropicSseBlocks(this, pending, replacementModel, true);
      pending = "";
      callback();
    }
  }));
}

function drainAnthropicSseBlocks(
  stream: Transform,
  text: string,
  replacementModel: string,
  flush: boolean
): string {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    const index = match.index ?? 0;
    const delimiter = match[0];
    const block = text.slice(cursor, index);
    cursor = index + delimiter.length;
    stream.push(`${rewriteAnthropicSseBlockMessageStartModel(block, replacementModel)}${delimiter}`);
  }

  const trailing = text.slice(cursor);
  if (!flush) {
    return trailing;
  }
  if (trailing) {
    stream.push(rewriteAnthropicSseBlockMessageStartModel(trailing, replacementModel));
  }
  return "";
}

export function rewriteAnthropicSseBlockMessageStartModelForTest(
  block: string,
  model: string
): string {
  return rewriteAnthropicSseBlockMessageStartModel(block, model);
}

function rewriteAnthropicSseBlockMessageStartModel(block: string, replacementModel: string): string {
  if (!block.trim()) {
    return block;
  }

  const parsed = parseSseJsonData(block);
  if (!isRecord(parsed) || stringValue(parsed.type) !== "message_start" || !isRecord(parsed.message)) {
    return block;
  }
  if (stringValue(parsed.message.model) === replacementModel) {
    return block;
  }

  return replaceSseDataLines(block, JSON.stringify({
    ...parsed,
    message: {
      ...parsed.message,
      model: replacementModel
    }
  }));
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
  const lines = block.split(/\r?\n/g);
  const output: string[] = [];
  let replaced = false;
  for (const line of lines) {
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
