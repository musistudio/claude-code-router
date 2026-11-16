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

export function shouldRewriteOpenAiResponseModel(input: {
  contentType: string | undefined;
  model: string | undefined;
  protocol: GatewayProviderProtocol | undefined;
}): boolean {
  if (input.protocol !== "openai_chat_completions" && input.protocol !== "openai_responses") {
    return false;
  }
  if (!input.model?.trim()) {
    return false;
  }
  const contentType = input.contentType?.toLowerCase() ?? "";
  return contentType.includes("text/event-stream") || contentType.includes("application/json");
}

export function rewriteAnthropicMessageStartModelStream(
  input: Readable,
  model: string
): Readable {
  // Anthropic carries the model on `message.model` inside message_start, so it
  // needs the block rewriter that knows that shape.
  return rewriteModelStream(input, model, false, rewriteAnthropicSseBlockMessageStartModel);
}

/**
 * OpenAI-protocol responses carry the upstream endpoint's own model id, so a
 * fallback leg would surface its model instead of the one the client asked for.
 * Rewrite both the streaming chunks and the non-streaming JSON body to the
 * client-visible model, matching the Anthropic path.
 */
export function rewriteOpenAiResponseModelStream(
  input: Readable,
  model: string,
  contentType: string | undefined
): Readable {
  return rewriteModelStream(
    input,
    model,
    !contentType?.toLowerCase().includes("text/event-stream"),
    rewriteSseBlockModel
  );
}

function rewriteModelStream(
  input: Readable,
  model: string,
  jsonBody: boolean,
  rewriteBlock: (block: string, replacementModel: string) => string
): Readable {
  const replacementModel = model.trim();
  if (!replacementModel) {
    return input;
  }

  if (jsonBody) {
    const chunks: Buffer[] = [];
    return input.pipe(new Transform({
      transform(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
      flush(callback) {
        const text = Buffer.concat(chunks).toString("utf8");
        const next = rewritePayloadModel(parseJsonData(text), replacementModel);
        this.push(next === undefined || next === null ? text : JSON.stringify(next));
        callback();
      }
    }));
  }

  const rewrite = (block: string): string => rewriteBlock(block, replacementModel);
  const decoder = new StringDecoder("utf8");
  let pending = "";
  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      pending += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      pending = drainSseBlocks(this, pending, rewrite, false);
      callback();
    },
    flush(callback) {
      pending += decoder.end();
      drainSseBlocks(this, pending, rewrite, true);
      pending = "";
      callback();
    }
  }));
}

function drainSseBlocks(
  stream: Transform,
  text: string,
  rewriteBlock: (block: string) => string,
  flush: boolean
): string {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    const index = match.index ?? 0;
    const delimiter = match[0];
    const block = text.slice(cursor, index);
    cursor = index + delimiter.length;
    stream.push(`${rewriteBlock(block)}${delimiter}`);
  }

  const trailing = text.slice(cursor);
  if (!flush) {
    return trailing;
  }
  if (trailing) {
    stream.push(rewriteBlock(trailing));
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

function rewriteSseBlockModel(block: string, replacementModel: string): string {
  if (!block.trim()) {
    return block;
  }

  const parsed = parseSseJsonData(block);
  if (parsed === undefined) {
    return block;
  }
  const next = rewritePayloadModel(parsed, replacementModel);
  return next === undefined ? block : replaceSseDataLines(block, JSON.stringify(next));
}

/**
 * OpenAI's model id sits at the top level of a chat-completion chunk, a
 * Responses event (`response.model`), and their non-streaming bodies.
 */
function rewritePayloadModel(parsed: unknown, replacementModel: string): unknown {
  if (!isRecord(parsed)) {
    return undefined;
  }
  // Only touch payloads that already carry a model; Responses events such as
  // output_text.delta have none and must stay byte-compatible.
  if (stringValue(parsed.model) !== undefined) {
    return parsed.model === replacementModel ? undefined : { ...parsed, model: replacementModel };
  }
  const response = isRecord(parsed.response) ? parsed.response : undefined;
  if (response && stringValue(response.model) !== undefined) {
    return response.model === replacementModel
      ? undefined
      : { ...parsed, response: { ...response, model: replacementModel } };
  }
  return undefined;
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

function parseJsonData(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
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
