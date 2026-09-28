import type { IncomingHttpHeaders } from "node:http";
import { Readable, Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { AppConfig } from "@ccr/core/contracts/app";
import { normalizeRouteSelector } from "@ccr/core/routing/model-registry";
import { isRecord, rawStringValue, stringValue } from "@ccr/core/gateway/internal/value";
import { readHeader } from "@ccr/core/gateway/http/io";
import { parseJsonObjectSafe, serializeJsonBody } from "@ccr/core/gateway/http/body";
import { requestProtocolForPath } from "@ccr/core/routing/protocol-endpoints";
import { resolveUsageModelAttribution } from "@ccr/core/usage/model-attribution";

const multiAgentNamespaceName = "multi_agent_v1";
const multiAgentFunctionPrefix = `${multiAgentNamespaceName}_`;
const multiAgentToolNames = new Set(["close_agent", "resume_agent", "send_input", "spawn_agent", "wait_agent"]);

export function prepareCodexMultiAgentBridgeRequest(input: {
  body?: Buffer;
  config: AppConfig;
  headers: IncomingHttpHeaders;
  method: string;
  path: string;
  routedModel?: string;
}): { body: Buffer; diagnostic: string } | undefined {
  if (!codexMultiAgentBridgeEnabled(input.headers, input.method, input.path)) {
    return undefined;
  }
  const parsedBody = parseJsonObjectSafe(input.body);
  if (!parsedBody) {
    return undefined;
  }
  const model = input.routedModel || stringValue(parsedBody.model);
  if (!codexMultiAgentBridgeModelEligible(model, input.config)) {
    return undefined;
  }
  const transformed = transformCodexMultiAgentBridgeRequestBody(parsedBody);
  if (!transformed.changed) {
    return undefined;
  }
  return {
    body: serializeJsonBody(transformed.body),
    diagnostic: `${model ?? "unknown"}:${transformed.changedParts.join(",")}`
  };
}

export function transformCodexMultiAgentBridgeRequestBody(body: Record<string, unknown>): {
  body: Record<string, unknown>;
  changed: boolean;
  changedParts: string[];
} {
  const next = { ...body };
  const changedParts: string[] = [];
  const tools = transformCodexMultiAgentBridgeTools(body.tools);
  if (tools.changed) {
    next.tools = tools.value;
    changedParts.push("tools");
    const toolChoice = transformCodexMultiAgentBridgeToolChoice(body.tool_choice);
    if (toolChoice.changed) {
      if (toolChoice.value === undefined) {
        delete next.tool_choice;
      } else {
        next.tool_choice = toolChoice.value;
      }
      changedParts.push("tool_choice");
    }
    const input = transformCodexMultiAgentBridgeInput(body.input);
    if (input.changed) {
      next.input = input.value;
      changedParts.push("input");
    }
  }
  return {
    body: next,
    changed: changedParts.length > 0,
    changedParts
  };
}

function transformCodexMultiAgentBridgeTools(value: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  let changed = false;
  const tools = value.flatMap((tool) => {
    if (!isRecord(tool) || tool.type !== "namespace" || tool.name !== multiAgentNamespaceName) {
      return [tool];
    }
    const namespaceTools = Array.isArray(tool.tools) ? tool.tools : [];
    const flattened = namespaceTools
      .filter((item) => isRecord(item) && item.type === "function" && multiAgentToolNames.has(stringValue(item.name) ?? ""))
      .map((item) => codexMultiAgentFunctionTool(item as Record<string, unknown>));
    if (flattened.length === 0) {
      return [tool];
    }
    changed = true;
    return flattened;
  });
  return { value: tools, changed };
}

function codexMultiAgentFunctionTool(tool: Record<string, unknown>): Record<string, unknown> {
  const name = stringValue(tool.name) ?? "";
  const description = rawStringValue(tool.description) ?? "";
  return {
    ...tool,
    name: codexMultiAgentFunctionName(name),
    description: description
      ? `Namespaced ${multiAgentNamespaceName}.${name} tool.\n\n${description}`
      : `Namespaced ${multiAgentNamespaceName}.${name} tool.`
  };
}

function transformCodexMultiAgentBridgeToolChoice(value: unknown): { value: unknown; changed: boolean } {
  const name = toolChoiceName(value);
  if (!name) {
    return { value, changed: false };
  }
  if (normalizeMultiAgentToolName(name) === undefined && name !== multiAgentNamespaceName) {
    return { value, changed: false };
  }
  if (name === multiAgentNamespaceName) {
    return { value: undefined, changed: true };
  }
  const mappedName = normalizeMultiAgentToolName(name);
  if (!mappedName || mappedName === name) {
    return { value, changed: false };
  }
  if (isRecord(value) && isRecord(value.function)) {
    return {
      value: {
        ...value,
        function: {
          ...value.function,
          name: mappedName
        }
      },
      changed: true
    };
  }
  if (isRecord(value)) {
    return {
      value: {
        ...value,
        name: mappedName,
        type: value.type === "tool" ? "function" : value.type
      },
      changed: true
    };
  }
  return { value, changed: false };
}

function toolChoiceName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return stringValue(value.name) ?? (isRecord(value.function) ? stringValue(value.function.name) : undefined);
}

function transformCodexMultiAgentBridgeInput(value: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  let changed = false;
  const items = value.map((item) => {
    const transformed = transformCodexMultiAgentBridgeRequestItem(item);
    changed ||= transformed.changed;
    return transformed.value;
  });
  return { value: items, changed };
}

function transformCodexMultiAgentBridgeRequestItem(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value) || value.type !== "function_call") {
    return { value, changed: false };
  }
  const mappedName = normalizeMultiAgentToolName(stringValue(value.name) ?? "");
  if (!mappedName || mappedName === value.name) {
    return { value, changed: false };
  }
  const { namespace: _namespace, ...rest } = value;
  return {
    value: {
      ...rest,
      name: mappedName
    },
    changed: true
  };
}

function codexMultiAgentBridgeEnabled(headers: IncomingHttpHeaders, method: string, path: string): boolean {
  return (method || "GET").toUpperCase() === "POST" &&
    requestProtocolForPath(path) === "openai_responses" &&
    isCodexUserAgent(headers);
}

function isCodexUserAgent(headers: IncomingHttpHeaders): boolean {
  return readHeader(headers["user-agent"])?.toLowerCase().includes("codex") ?? false;
}

function codexMultiAgentBridgeModelEligible(model: string | undefined, config: AppConfig): boolean {
  const modelName = modelNameForMultiAgentBridge(model);
  if (!modelName || modelName.toLowerCase().includes("gpt")) {
    return false;
  }
  const baseModelName = modelNameForMultiAgentBridge(resolveUsageModelAttribution(config, model).model);
  return !baseModelName.toLowerCase().includes("gpt");
}

function modelNameForMultiAgentBridge(model: string | undefined): string {
  const normalized = normalizeRouteSelector(model) ?? "";
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function codexMultiAgentFunctionName(name: string): string {
  return `${multiAgentFunctionPrefix}${name}`;
}

function normalizeMultiAgentToolName(name: string): string | undefined {
  const normalized = name.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.startsWith(multiAgentFunctionPrefix)) {
    const inner = normalized.slice(multiAgentFunctionPrefix.length);
    return multiAgentToolNames.has(inner) ? codexMultiAgentFunctionName(inner) : undefined;
  }
  const dottedPrefix = `${multiAgentNamespaceName}.`;
  if (normalized.startsWith(dottedPrefix)) {
    const inner = normalized.slice(dottedPrefix.length);
    return multiAgentToolNames.has(inner) ? codexMultiAgentFunctionName(inner) : undefined;
  }
  return multiAgentToolNames.has(normalized) ? codexMultiAgentFunctionName(normalized) : undefined;
}

function nativeMultiAgentToolName(name: string): string | undefined {
  const normalized = name.trim();
  if (!normalized.startsWith(multiAgentFunctionPrefix)) {
    return undefined;
  }
  const inner = normalized.slice(multiAgentFunctionPrefix.length);
  return multiAgentToolNames.has(inner) ? inner : undefined;
}

export function codexMultiAgentBridgeResponseStream(input: Readable, headers: Headers): Readable {
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/event-stream")) {
    return input.pipe(new Transform({
      transform(chunk, _encoding, callback) {
        transformSseChunk(this, chunk);
        callback();
      },
      flush(callback) {
        flushSseTransform(this);
        callback();
      }
    }));
  }
  if (contentType.includes("application/json")) {
    const chunks: Buffer[] = [];
    return input.pipe(new Transform({
      transform(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
      flush(callback) {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          const parsed = JSON.parse(raw);
          const transformed = transformCodexMultiAgentBridgeResponseValue(parsed);
          this.push(Buffer.from(`${JSON.stringify(transformed.value)}\n`, "utf8"));
        } catch {
          this.push(Buffer.from(raw, "utf8"));
        }
        callback();
      }
    }));
  }
  return input;
}

export function transformCodexMultiAgentBridgeResponseValue(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value)) {
    return { value, changed: false };
  }
  let changed = false;
  const next = { ...value };
  if (isRecord(value.item)) {
    const item = transformMultiAgentFunctionCall(value.item);
    if (item.changed) {
      next.item = item.value;
      changed = true;
    }
  }
  if (Array.isArray(value.output)) {
    const output = transformCodexMultiAgentBridgeResponseItems(value.output);
    if (output.changed) {
      next.output = output.value;
      changed = true;
    }
  }
  if (isRecord(value.response) && Array.isArray(value.response.output)) {
    const output = transformCodexMultiAgentBridgeResponseItems(value.response.output);
    if (output.changed) {
      next.response = {
        ...value.response,
        output: output.value
      };
      changed = true;
    }
  }
  const item = transformMultiAgentFunctionCall(next);
  if (item.changed) {
    return item;
  }
  return { value: next, changed };
}

function transformCodexMultiAgentBridgeResponseItems(items: unknown[]): { value: unknown[]; changed: boolean } {
  let changed = false;
  const value = items.map((item) => {
    const transformed = isRecord(item)
      ? transformMultiAgentFunctionCall(item)
      : { value: item, changed: false };
    changed ||= transformed.changed;
    return transformed.value;
  });
  return { value, changed };
}

function transformMultiAgentFunctionCall(item: Record<string, unknown>): { value: unknown; changed: boolean } {
  if (item.type !== "function_call") {
    return { value: item, changed: false };
  }
  const nativeName = nativeMultiAgentToolName(stringValue(item.name) ?? "");
  if (!nativeName) {
    return { value: item, changed: false };
  }
  return {
    value: {
      ...item,
      name: nativeName,
      namespace: multiAgentNamespaceName
    },
    changed: true
  };
}

type CodexMultiAgentBridgeSseTransform = Transform & {
  __ccrCodexMultiAgentBridgeSseDecoder?: StringDecoder;
  __ccrCodexMultiAgentBridgeSsePending?: string;
};

function transformSseChunk(stream: Transform, chunk: Buffer | string): void {
  const state = stream as CodexMultiAgentBridgeSseTransform;
  const decoder = state.__ccrCodexMultiAgentBridgeSseDecoder ?? new StringDecoder("utf8");
  state.__ccrCodexMultiAgentBridgeSseDecoder = decoder;
  state.__ccrCodexMultiAgentBridgeSsePending = (state.__ccrCodexMultiAgentBridgeSsePending ?? "") +
    decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  while (state.__ccrCodexMultiAgentBridgeSsePending) {
    const match = /\r?\n\r?\n/.exec(state.__ccrCodexMultiAgentBridgeSsePending);
    if (!match || match.index === undefined) {
      break;
    }
    const block = state.__ccrCodexMultiAgentBridgeSsePending.slice(0, match.index);
    const delimiter = match[0];
    state.__ccrCodexMultiAgentBridgeSsePending = state.__ccrCodexMultiAgentBridgeSsePending.slice(match.index + delimiter.length);
    stream.push(transformCodexMultiAgentBridgeSseEvent(block) + delimiter);
  }
}

function flushSseTransform(stream: Transform): void {
  const state = stream as CodexMultiAgentBridgeSseTransform;
  state.__ccrCodexMultiAgentBridgeSsePending = (state.__ccrCodexMultiAgentBridgeSsePending ?? "") +
    (state.__ccrCodexMultiAgentBridgeSseDecoder?.end() ?? "");
  if (state.__ccrCodexMultiAgentBridgeSsePending) {
    stream.push(transformCodexMultiAgentBridgeSseEvent(state.__ccrCodexMultiAgentBridgeSsePending));
    state.__ccrCodexMultiAgentBridgeSsePending = "";
  }
}

export function transformCodexMultiAgentBridgeSseEvent(block: string): string {
  const lines = block.split(/\r?\n/);
  const dataIndex = lines.findIndex((line) => line.startsWith("data: "));
  if (dataIndex < 0) {
    return block;
  }
  const raw = lines[dataIndex].slice("data: ".length);
  try {
    const parsed = JSON.parse(raw);
    const transformed = transformCodexMultiAgentBridgeResponseValue(parsed);
    if (!transformed.changed) {
      return block;
    }
    lines[dataIndex] = `data: ${JSON.stringify(transformed.value)}`;
    return lines.join("\n");
  } catch {
    return block;
  }
}
