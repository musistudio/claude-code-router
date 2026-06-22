import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import type { GatewayProviderProtocol } from "../../shared/app";

export type ResponseProtocolAdapter = {
  createStreamTransform?: () => Transform;
  headers: Headers;
  transformText?: (text: string) => string;
};

type ResponseProtocolAdapterInput = {
  clientProtocol?: GatewayProviderProtocol;
  providerProtocol?: GatewayProviderProtocol;
  responseHeaders: Headers;
  statusCode: number;
};

type ResponseState = {
  completed: boolean;
  createdAt: number;
  id: string;
  model: string;
  output: Array<Record<string, unknown>>;
  outputText: string;
  sequence: number;
  status: "completed" | "failed" | "in_progress";
  usage?: Record<string, unknown>;
};

type StreamBlockState =
  | {
      args: string;
      callId: string;
      fallbackArgs?: string;
      hasArgsDelta: boolean;
      id: string;
      name: string;
      outputIndex: number;
      type: "tool";
    }
  | {
      contentIndex: number;
      itemId: string;
      outputIndex: number;
      text: string;
      type: "text";
    };

export function createResponseProtocolAdapter(input: ResponseProtocolAdapterInput): ResponseProtocolAdapter | undefined {
  if (
    input.statusCode >= 400 ||
    input.clientProtocol !== "openai_responses" ||
    input.providerProtocol !== "anthropic_messages"
  ) {
    return undefined;
  }

  const headers = new Headers(input.responseHeaders);
  headers.set("x-ccr-response-adapter", "anthropic_messages-to-openai_responses");
  headers.delete("content-encoding");

  if (isEventStream(headers)) {
    headers.set("content-type", "text/event-stream; charset=utf-8");
    headers.delete("content-length");
    return {
      createStreamTransform: () => new AnthropicMessagesToResponsesStream(),
      headers
    };
  }

  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  return {
    headers,
    transformText: (text) => {
      const body = parseJsonObject(text);
      if (!body) {
        return text;
      }
      return `${JSON.stringify(anthropicMessageToResponse(body))}\n`;
    }
  };
}

function anthropicMessageToResponse(message: Record<string, unknown>): Record<string, unknown> {
  const state = createResponseState(message);
  const content = Array.isArray(message.content) ? message.content : [];
  for (const item of content) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.type === "text") {
      const text = stringValue(item.text);
      state.outputText += text;
      state.output.push(responseMessageItem(`msg_${randomUUID()}`, text, "completed"));
    } else if (item.type === "tool_use") {
      const id = stringValue(item.id) || `call_${randomUUID()}`;
      state.output.push(responseFunctionCallItem(
        `fc_${id}`,
        id,
        stringValue(item.name) || "tool",
        JSON.stringify(item.input ?? {}),
        "completed"
      ));
    }
  }
  state.status = "completed";
  state.usage = responseUsage(message.usage);
  return responseObject(state);
}

class AnthropicMessagesToResponsesStream extends Transform {
  private blocks = new Map<number, StreamBlockState>();
  private buffer = "";
  private state = createResponseState({});

  constructor() {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.buffer += chunk.toString("utf8");
    this.flushCompleteEvents(false);
    callback();
  }

  override _flush(callback: (error?: Error | null) => void): void {
    this.flushCompleteEvents(true);
    if (!this.state.completed) {
      this.finishResponse();
    }
    callback();
  }

  private flushCompleteEvents(isEnd: boolean): void {
    let boundary = findSseBoundary(this.buffer);
    while (boundary) {
      const rawEvent = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.endIndex);
      this.handleRawEvent(rawEvent);
      boundary = findSseBoundary(this.buffer);
    }
    if (isEnd && this.buffer.trim()) {
      this.handleRawEvent(this.buffer);
      this.buffer = "";
    }
  }

  private handleRawEvent(rawEvent: string): void {
    const parsed = parseSseEvent(rawEvent);
    if (!parsed || parsed.data.trim() === "[DONE]") {
      return;
    }
    const payload = parseJsonObject(parsed.data);
    if (!payload) {
      return;
    }
    this.handleAnthropicEvent(payload);
  }

  private handleAnthropicEvent(event: Record<string, unknown>): void {
    const type = stringValue(event.type);
    if (type === "message_start") {
      const message = isRecord(event.message) ? event.message : {};
      this.state = createResponseState(message);
      this.pushResponsesEvent("response.created", { response: responseObject(this.state) });
      return;
    }
    if (type === "content_block_start") {
      this.handleContentBlockStart(event);
      return;
    }
    if (type === "content_block_delta") {
      this.handleContentBlockDelta(event);
      return;
    }
    if (type === "content_block_stop") {
      this.handleContentBlockStop(event);
      return;
    }
    if (type === "message_delta") {
      if (isRecord(event.usage)) {
        this.state.usage = responseUsage(event.usage, this.state.usage);
      }
      return;
    }
    if (type === "message_stop") {
      this.finishResponse();
      return;
    }
    if (type === "error") {
      this.state.status = "failed";
      this.pushResponsesEvent("response.failed", { response: responseObject(this.state) });
      this.state.completed = true;
    }
  }

  private handleContentBlockStart(event: Record<string, unknown>): void {
    const index = numberValue(event.index);
    const block = isRecord(event.content_block) ? event.content_block : {};
    if (index === undefined || !block.type) {
      return;
    }
    const outputIndex = this.state.output.length;
    if (block.type === "text") {
      const itemId = `msg_${randomUUID()}`;
      const text = stringValue(block.text);
      const contentIndex = 0;
      const item = responseMessageItem(itemId, "", "in_progress");
      this.blocks.set(index, { contentIndex, itemId, outputIndex, text, type: "text" });
      this.state.output.push(item);
      this.pushResponsesEvent("response.output_item.added", { item, output_index: outputIndex });
      this.pushResponsesEvent("response.content_part.added", {
        content_index: contentIndex,
        item_id: itemId,
        output_index: outputIndex,
        part: { annotations: [], text: "", type: "output_text" }
      });
      if (text) {
        this.pushTextDelta(itemId, outputIndex, contentIndex, text);
      }
      return;
    }
    if (block.type === "tool_use") {
      const callId = stringValue(block.id) || `call_${randomUUID()}`;
      const id = `fc_${callId}`;
      const name = stringValue(block.name) || "tool";
      const fallbackArgs = nonEmptyJsonObjectString(block.input);
      const item = responseFunctionCallItem(id, callId, name, "", "in_progress");
      this.blocks.set(index, {
        args: "",
        callId,
        fallbackArgs,
        hasArgsDelta: false,
        id,
        name,
        outputIndex,
        type: "tool"
      });
      this.state.output.push(item);
      this.pushResponsesEvent("response.output_item.added", { item, output_index: outputIndex });
    }
  }

  private handleContentBlockDelta(event: Record<string, unknown>): void {
    const index = numberValue(event.index);
    const delta = isRecord(event.delta) ? event.delta : {};
    const block = index === undefined ? undefined : this.blocks.get(index);
    if (!block) {
      return;
    }
    if (block.type === "text" && delta.type === "text_delta") {
      const text = stringValue(delta.text);
      if (text) {
        this.pushTextDelta(block.itemId, block.outputIndex, block.contentIndex, text);
      }
      return;
    }
    if (block.type === "tool" && delta.type === "input_json_delta") {
      const partial = stringValue(delta.partial_json);
      if (partial) {
        block.hasArgsDelta = true;
        block.args += partial;
        this.updateOutputItem(
          block.outputIndex,
          responseFunctionCallItem(block.id, block.callId, block.name, block.args, "in_progress")
        );
        this.pushResponsesEvent("response.function_call_arguments.delta", {
          delta: partial,
          item_id: block.id,
          output_index: block.outputIndex
        });
      }
    }
  }

  private handleContentBlockStop(event: Record<string, unknown>): void {
    const index = numberValue(event.index);
    if (index === undefined) {
      return;
    }
    const block = this.blocks.get(index);
    if (!block) {
      return;
    }
    this.blocks.delete(index);
    if (block.type === "text") {
      const item = responseMessageItem(block.itemId, block.text, "completed");
      this.updateOutputItem(block.outputIndex, item);
      this.pushResponsesEvent("response.output_text.done", {
        content_index: block.contentIndex,
        item_id: block.itemId,
        logprobs: [],
        output_index: block.outputIndex,
        text: block.text
      });
      this.pushResponsesEvent("response.content_part.done", {
        content_index: block.contentIndex,
        item_id: block.itemId,
        output_index: block.outputIndex,
        part: { annotations: [], text: block.text, type: "output_text" }
      });
      this.pushResponsesEvent("response.output_item.done", { item, output_index: block.outputIndex });
      return;
    }
    const args = block.args || block.fallbackArgs || "{}";
    const item = responseFunctionCallItem(block.id, block.callId, block.name, args, "completed");
    this.updateOutputItem(block.outputIndex, item);
    if (!block.hasArgsDelta && block.fallbackArgs) {
      this.pushResponsesEvent("response.function_call_arguments.delta", {
        delta: block.fallbackArgs,
        item_id: block.id,
        output_index: block.outputIndex
      });
    }
    this.pushResponsesEvent("response.function_call_arguments.done", {
      arguments: args,
      item_id: block.id,
      name: block.name,
      output_index: block.outputIndex
    });
    this.pushResponsesEvent("response.output_item.done", { item, output_index: block.outputIndex });
  }

  private pushTextDelta(itemId: string, outputIndex: number, contentIndex: number, text: string): void {
    const block = [...this.blocks.values()].find((item) => item.type === "text" && item.itemId === itemId);
    if (block?.type === "text") {
      block.text += text;
      this.updateOutputItem(outputIndex, responseMessageItem(itemId, block.text, "in_progress"));
    }
    this.state.outputText += text;
    this.pushResponsesEvent("response.output_text.delta", {
      content_index: contentIndex,
      delta: text,
      item_id: itemId,
      output_index: outputIndex
    });
  }

  private finishResponse(): void {
    for (const [index, block] of [...this.blocks]) {
      this.handleContentBlockStop({ index });
      if (block.type === "tool") {
        this.blocks.delete(index);
      }
    }
    this.state.status = "completed";
    this.state.completed = true;
    this.pushResponsesEvent("response.completed", { response: responseObject(this.state) });
  }

  private pushResponsesEvent(type: string, payload: Record<string, unknown>): void {
    const event = {
      ...payload,
      sequence_number: ++this.state.sequence,
      type
    };
    this.push(`event: ${type}\n`);
    this.push(`data: ${JSON.stringify(event)}\n\n`);
  }

  private updateOutputItem(index: number, item: Record<string, unknown>): void {
    this.state.output[index] = item;
  }
}

function createResponseState(message: Record<string, unknown>): ResponseState {
  return {
    completed: false,
    createdAt: Math.floor(Date.now() / 1000),
    id: responseId(stringValue(message.id)),
    model: stringValue(message.model),
    output: [],
    outputText: "",
    sequence: 0,
    status: "in_progress",
    usage: responseUsage(message.usage)
  };
}

function responseObject(state: ResponseState): Record<string, unknown> {
  return {
    id: state.id,
    created_at: state.createdAt,
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: state.model,
    object: "response",
    output: state.output,
    output_text: state.outputText,
    parallel_tool_calls: true,
    status: state.status,
    temperature: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
    usage: state.usage ?? responseUsage(undefined)
  };
}

function responseMessageItem(id: string, text: string, status: "completed" | "in_progress"): Record<string, unknown> {
  return {
    id,
    content: [
      {
        annotations: [],
        text,
        type: "output_text"
      }
    ],
    role: "assistant",
    status,
    type: "message"
  };
}

function responseFunctionCallItem(
  id: string,
  callId: string,
  name: string,
  args: string,
  status: "completed" | "in_progress"
): Record<string, unknown> {
  return {
    id,
    arguments: args,
    call_id: callId,
    name,
    status,
    type: "function_call"
  };
}

function responseUsage(value: unknown, previous?: Record<string, unknown>): Record<string, unknown> {
  const usage = isRecord(value) ? value : {};
  const inputTokens =
    numberValue(usage.input_tokens) ??
    numberValue(usage.cache_read_input_tokens) ??
    numberValue(previous?.input_tokens) ??
    0;
  const outputTokens = numberValue(usage.output_tokens) ?? numberValue(previous?.output_tokens) ?? 0;
  const cachedTokens = numberValue(usage.cache_read_input_tokens) ?? numberValue(previous?.input_tokens_details, "cached_tokens") ?? 0;
  return {
    input_tokens: inputTokens,
    input_tokens_details: {
      cached_tokens: cachedTokens
    },
    output_tokens: outputTokens,
    output_tokens_details: {
      reasoning_tokens: 0
    },
    total_tokens: inputTokens + outputTokens
  };
}

function parseSseEvent(rawEvent: string): { data: string; event?: string } | undefined {
  const data: string[] = [];
  let event: string | undefined;
  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
    }
  }
  if (data.length === 0) {
    return undefined;
  }
  return { data: data.join("\n"), event };
}

function findSseBoundary(value: string): { endIndex: number; index: number } | undefined {
  const lf = value.indexOf("\n\n");
  const crlf = value.indexOf("\r\n\r\n");
  if (lf < 0 && crlf < 0) {
    return undefined;
  }
  if (crlf >= 0 && (lf < 0 || crlf <= lf)) {
    return { endIndex: crlf + 4, index: crlf };
  }
  return { endIndex: lf + 2, index: lf };
}

function isEventStream(headers: Headers): boolean {
  return (headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream");
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringifyJsonObject(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function nonEmptyJsonObjectString(value: unknown): string | undefined {
  if (isRecord(value) && Object.keys(value).length === 0) {
    return undefined;
  }
  return stringifyJsonObject(value);
}

function responseId(id: string | undefined): string {
  if (!id) {
    return `resp_${randomUUID()}`;
  }
  return id.startsWith("resp_") ? id : `resp_${id}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, key?: string): number | undefined {
  const target = key && isRecord(value) ? value[key] : value;
  return typeof target === "number" && Number.isFinite(target) ? Math.trunc(target) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
