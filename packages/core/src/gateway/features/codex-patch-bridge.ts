/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { IncomingHttpHeaders } from "node:http";
import { Readable, Transform } from "node:stream";
import type { AppConfig } from "@ccr/core/contracts/app";
import { normalizeRouteSelector } from "@ccr/core/routing/model-registry";
import { isRecord, rawStringValue, stringValue } from "@ccr/core/gateway/internal/value";
import { readHeader } from "@ccr/core/gateway/http/io";
import { codexPatchBridgeInstructionText, codexPatchBridgeShellToolGuidance, virtualApplyPatchLarkGrammar, virtualApplyPatchToolName } from "@ccr/core/gateway/internal/shared";
import { parseJsonObjectSafe, serializeJsonBody } from "@ccr/core/gateway/http/body";
import { requestProtocolForPath } from "@ccr/core/routing/protocol-endpoints";


export function prepareCodexApplyPatchBridgeRequest(input: {
  body?: Buffer;
  config: AppConfig;
  headers: IncomingHttpHeaders;
  method: string;
  path: string;
  routedModel?: string;
}): { body: Buffer; diagnostic: string } | undefined {
  if (!codexApplyPatchBridgeEnabled(input.config, input.headers, input.method, input.path)) {
    return undefined;
  }
  const parsedBody = parseJsonObjectSafe(input.body);
  if (!parsedBody) {
    return undefined;
  }
  const model = input.routedModel || stringValue(parsedBody.model);
  if (!codexPatchBridgeModelEligible(model)) {
    return undefined;
  }
  const transformed = transformCodexApplyPatchBridgeRequestBody(parsedBody);
  if (!transformed.changed) {
    return undefined;
  }
  return {
    body: serializeJsonBody(transformed.body),
    diagnostic: `${model ?? "unknown"}:${transformed.changedParts.join(",")}`
  };
}


export function transformCodexApplyPatchBridgeRequestBody(body: Record<string, unknown>): {
  body: Record<string, unknown>;
  changed: boolean;
  changedParts: string[];
} {
  const next = { ...body };
  const changedParts: string[] = [];
  const tools = transformCodexApplyPatchBridgeTools(body.tools);
  if (tools.changed) {
    next.tools = tools.value;
    changedParts.push("tools");
    const instructions = transformCodexApplyPatchBridgeInstructions(body.instructions);
    if (instructions.changed) {
      next.instructions = instructions.value;
      changedParts.push("instructions");
    }
    const input = transformCodexApplyPatchBridgeInput(body.input);
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


function transformCodexApplyPatchBridgeTools(value: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  const hasApplyPatchTool = value.some((tool) => isRecord(tool) && tool.type === "custom" && tool.name === "apply_patch");
  if (!hasApplyPatchTool) {
    return { value, changed: false };
  }
  let changed = false;
  const tools = value.map((tool) => {
    if (isRecord(tool) && tool.type === "custom" && tool.name === "apply_patch") {
      changed = true;
      return virtualApplyPatchToolSpec();
    }
    const shellTool = transformCodexPatchBridgeShellTool(tool);
    if (shellTool.changed) {
      changed = true;
      return shellTool.value;
    }
    return tool;
  });
  return { value: tools, changed };
}


function transformCodexApplyPatchBridgeInstructions(value: unknown): { value: unknown; changed: boolean } {
  const text = rawStringValue(value);
  if (text === undefined) {
    return value === undefined
      ? { value: codexPatchBridgeInstructionText, changed: true }
      : { value, changed: false };
  }
  if (text.includes(codexPatchBridgeInstructionText)) {
    return { value, changed: false };
  }
  return {
    value: `${text.trimEnd()}\n\n${codexPatchBridgeInstructionText}`,
    changed: true
  };
}


function transformCodexPatchBridgeShellTool(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value) || value.type !== "function") {
    return { value, changed: false };
  }
  const name = stringValue(value.name);
  if (name !== "exec_command" && name !== "write_stdin") {
    return { value, changed: false };
  }
  let changed = false;
  const next: Record<string, unknown> = { ...value };
  const description = rawStringValue(value.description) ?? "";
  if (!description.includes(codexPatchBridgeShellToolGuidance)) {
    next.description = description
      ? `${description} ${codexPatchBridgeShellToolGuidance}`
      : codexPatchBridgeShellToolGuidance;
    changed = true;
  }
  if (name === "exec_command") {
    const parameters = transformCodexPatchBridgeExecCommandParameters(value.parameters);
    if (parameters.changed) {
      next.parameters = parameters.value;
      changed = true;
    }
  }
  return { value: changed ? next : value, changed };
}


function transformCodexPatchBridgeExecCommandParameters(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value) || !isRecord(value.properties) || !isRecord(value.properties.cmd)) {
    return { value, changed: false };
  }
  const cmd = value.properties.cmd;
  const description = rawStringValue(cmd.description) ?? "";
  if (description.includes(codexPatchBridgeShellToolGuidance)) {
    return { value, changed: false };
  }
  return {
    value: {
      ...value,
      properties: {
        ...value.properties,
        cmd: {
          ...cmd,
          description: description
            ? `${description} ${codexPatchBridgeShellToolGuidance}`
            : codexPatchBridgeShellToolGuidance
        }
      }
    },
    changed: true
  };
}


function transformCodexApplyPatchBridgeInput(value: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  const applyPatchCallIds = new Set<string>();
  for (const item of value) {
    if (isRecord(item) && item.type === "custom_tool_call" && item.name === "apply_patch") {
      const callId = stringValue(item.call_id);
      if (callId) {
        applyPatchCallIds.add(callId);
      }
    }
  }
  let changed = false;
  const items = value.map((item) => {
    const transformed = transformCodexApplyPatchBridgeInputItem(item, applyPatchCallIds);
    changed ||= transformed.changed;
    return transformed.value;
  });
  return { value: items, changed };
}


function transformCodexApplyPatchBridgeInputItem(value: unknown, applyPatchCallIds: Set<string>): { value: unknown; changed: boolean } {
  if (!isRecord(value)) {
    return { value, changed: false };
  }
  if (value.type === "custom_tool_call" && value.name === "apply_patch") {
    const { input: patchInput, name: _name, type: _type, ...rest } = value;
    return {
      value: {
        ...rest,
        type: "function_call",
        name: virtualApplyPatchToolName,
        arguments: JSON.stringify({ patch: rawStringValue(patchInput) ?? "" })
      },
      changed: true
    };
  }
  if (
    value.type === "custom_tool_call_output" &&
    (applyPatchCallIds.has(stringValue(value.call_id) ?? "") || value.name === "apply_patch")
  ) {
    const { name: _name, type: _type, ...rest } = value;
    return {
      value: {
        ...rest,
        type: "function_call_output"
      },
      changed: true
    };
  }
  return { value, changed: false };
}


function virtualApplyPatchToolSpec(): Record<string, unknown> {
  return {
    type: "function",
    name: virtualApplyPatchToolName,
    description: [
      "Edit files by returning exactly one complete apply_patch patch.",
      "The patch field must be raw patch grammar text starting with *** Begin Patch and ending with *** End Patch.",
      "Do not wrap the patch in JSON, markdown fences, shell commands, cat, sed, perl, or python.",
      "The patch field must match this Lark grammar:",
      virtualApplyPatchLarkGrammar
    ].join("\n\n"),
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["patch"],
      properties: {
        patch: {
          type: "string",
          description: [
            "Raw apply_patch grammar text matching this Lark grammar:",
            virtualApplyPatchLarkGrammar
          ].join("\n\n")
        }
      }
    }
  };
}


function codexApplyPatchBridgeEnabled(config: AppConfig, headers: IncomingHttpHeaders, method: string, path: string): boolean {
  const codexRule = config.Router.builtInRules?.codex;
  return (method || "GET").toUpperCase() === "POST" &&
    requestProtocolForPath(path) === "openai_responses" &&
    isCodexUserAgent(headers) &&
    codexRule?.enabled !== false;
}


function isCodexUserAgent(headers: IncomingHttpHeaders): boolean {
  return readHeader(headers["user-agent"])?.toLowerCase().includes("codex") ?? false;
}


function codexPatchBridgeModelEligible(model: string | undefined): boolean {
  const modelName = modelNameForPatchBridge(model);
  return Boolean(modelName) && !modelName.toLowerCase().includes("gpt");
}


function modelNameForPatchBridge(model: string | undefined): string {
  const normalized = normalizeRouteSelector(model) ?? "";
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}


export function codexApplyPatchBridgeResponseStream(input: Readable, headers: Headers): Readable {
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
          const transformed = transformCodexApplyPatchBridgeResponseValue(parsed);
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


export function transformCodexApplyPatchBridgeResponseValue(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value)) {
    return { value, changed: false };
  }
  let changed = false;
  const next = { ...value };
  if (isRecord(value.item)) {
    const item = transformVirtualApplyPatchFunctionCall(value.item, value.type === "response.output_item.added");
    if (item.changed) {
      next.item = item.value;
      changed = true;
    }
  }
  if (Array.isArray(value.output)) {
    const output = transformCodexApplyPatchBridgeResponseItems(value.output);
    if (output.changed) {
      next.output = output.value;
      changed = true;
    }
  }
  if (isRecord(value.response) && Array.isArray(value.response.output)) {
    const output = transformCodexApplyPatchBridgeResponseItems(value.response.output);
    if (output.changed) {
      next.response = {
        ...value.response,
        output: output.value
      };
      changed = true;
    }
  }
  const item = transformVirtualApplyPatchFunctionCall(next, false);
  if (item.changed) {
    return item;
  }
  return { value: next, changed };
}


function transformCodexApplyPatchBridgeResponseItems(items: unknown[]): { value: unknown[]; changed: boolean } {
  let changed = false;
  const value = items.map((item) => {
    const transformed = isRecord(item)
      ? transformVirtualApplyPatchFunctionCall(item, false)
      : { value: item, changed: false };
    changed ||= transformed.changed;
    return transformed.value;
  });
  return { value, changed };
}


function transformVirtualApplyPatchFunctionCall(item: Record<string, unknown>, allowEmptyInput: boolean): { value: unknown; changed: boolean } {
  if (item.type !== "function_call" || item.name !== virtualApplyPatchToolName) {
    return { value: item, changed: false };
  }
  const patch = patchInputFromVirtualApplyPatchArguments(item.arguments);
  if (patch === undefined && !allowEmptyInput) {
    return { value: item, changed: false };
  }
  const { arguments: _arguments, name: _name, type: _type, ...rest } = item;
  return {
    value: {
      ...rest,
      type: "custom_tool_call",
      name: "apply_patch",
      input: patch ?? ""
    },
    changed: true
  };
}


function patchInputFromVirtualApplyPatchArguments(value: unknown): string | undefined {
  if (isRecord(value)) {
    return rawStringValue(value.patch);
  }
  const text = rawStringValue(value);
  if (text === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? rawStringValue(parsed.patch) : undefined;
  } catch {
    return undefined;
  }
}


function transformSseChunk(stream: Transform, chunk: Buffer | string): void {
  const state = stream as Transform & { __ccrCodexPatchBridgeSsePending?: string };
  state.__ccrCodexPatchBridgeSsePending = (state.__ccrCodexPatchBridgeSsePending ?? "") + chunk.toString();
  while (state.__ccrCodexPatchBridgeSsePending) {
    const match = /\r?\n\r?\n/.exec(state.__ccrCodexPatchBridgeSsePending);
    if (!match || match.index === undefined) {
      break;
    }
    const block = state.__ccrCodexPatchBridgeSsePending.slice(0, match.index);
    const delimiter = match[0];
    state.__ccrCodexPatchBridgeSsePending = state.__ccrCodexPatchBridgeSsePending.slice(match.index + delimiter.length);
    stream.push(transformCodexApplyPatchBridgeSseEvent(block) + delimiter);
  }
}


function flushSseTransform(stream: Transform): void {
  const state = stream as Transform & { __ccrCodexPatchBridgeSsePending?: string };
  if (state.__ccrCodexPatchBridgeSsePending) {
    stream.push(transformCodexApplyPatchBridgeSseEvent(state.__ccrCodexPatchBridgeSsePending));
    state.__ccrCodexPatchBridgeSsePending = "";
  }
}


export function transformCodexApplyPatchBridgeSseEvent(block: string): string {
  const lines = block.split(/\r?\n/g);
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data || data === "[DONE]") {
    return block;
  }
  try {
    const parsed = JSON.parse(data);
    const transformed = transformCodexApplyPatchBridgeResponseValue(parsed);
    if (!transformed.changed) {
      return block;
    }
    const event = stringValue((transformed.value as Record<string, unknown>).type) || stringValue(parsed.type);
    return [
      event ? `event: ${event}` : undefined,
      `data: ${JSON.stringify(transformed.value)}`
    ].filter(Boolean).join("\n");
  } catch {
    return block;
  }
}
