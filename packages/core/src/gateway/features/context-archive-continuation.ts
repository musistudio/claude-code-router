import type { ApiKeyConfig, AppConfig, GatewayProviderProtocol, RouterFallbackConfig } from "@ccr/core/contracts/app";
import {
  CONTEXT_ARCHIVE_MCP_SERVER_NAME,
  contextArchiveConfigForApiKey,
  contextArchiveMcpEnabled,
  contextArchiveService,
  type ContextArchiveReplayExecutor
} from "@ccr/core/gateway/context-archive";
import {
  appendCompactHandoffTask,
  codexCompactArchiveResponseContentType,
  codexResponsesPathForCompact,
  hasCodexResponsesCompactionTrigger,
  isCodexResponsesCompactPath,
  type ContextArchiveResponseMode
} from "@ccr/core/gateway/context-archive/protocol";
import { parseJsonObjectSafe, serializeJsonBody } from "@ccr/core/gateway/http/body";
import { uniqueStrings } from "@ccr/core/gateway/internal/collections";
import type { UpstreamFetchResult } from "@ccr/core/gateway/internal/shared";
import { isRecord, numberValue, rawStringValue, stringValue } from "@ccr/core/gateway/internal/value";
import { parseSseEvents, type ParsedSseEvent } from "@ccr/core/gateway/features/hosted-web-search/sse";
import { fetchUpstreamWithFallback, upstreamResponseHeaders } from "@ccr/core/gateway/upstream/executor";

type ContextArchiveToolContinuationProtocol = "anthropic_messages" | "openai_responses";

type ContextArchiveToolContinuationContext = {
  acceptedToolNames: string[];
  archiveId: string;
  body: Buffer;
  config: AppConfig;
  executedCalls: number;
  maxIterations: number;
  protocol: ContextArchiveToolContinuationProtocol;
  sessionToken: string;
  toolName: string;
};

type ContextArchiveFunctionCall = {
  arguments: string;
  callId: string;
  name: string;
};

const codexCompactCompatSummaryTask = [
  "Create a compact continuation summary of the conversation so far.",
  "Preserve the current goal, user requirements, decisions, important files, commands run, test results, open issues, and any exact identifiers needed later.",
  "Do not continue the task and do not call tools. Return plain text only."
].join("\n");

export function prepareCodexCompactCompatRequest(input: {
  body?: Buffer;
  method: string;
  path: string;
  protocol?: GatewayProviderProtocol;
}): {
  body: Buffer;
  diagnostic: string;
  responseContentType?: string;
  responseMode: ContextArchiveResponseMode;
  upstreamPath?: string;
} | undefined {
  const protocol = input.protocol ?? (isCodexResponsesCompactPath(input.path) ? "openai_responses" : undefined);
  if (input.method.toUpperCase() !== "POST" || protocol !== "openai_responses") {
    return undefined;
  }
  const parsedBody = parseJsonObjectSafe(input.body);
  if (!parsedBody) {
    return undefined;
  }
  const upstreamPath = codexResponsesPathForCompact(input.path);
  const responseMode: ContextArchiveResponseMode | undefined = upstreamPath
    ? "codex_responses_compact_json"
    : hasCodexResponsesCompactionTrigger(parsedBody)
      ? "codex_responses_compaction_sse"
      : undefined;
  if (!responseMode) {
    return undefined;
  }
  return {
    body: appendCompactHandoffTask(input.body ?? Buffer.alloc(0), protocol, codexCompactCompatSummaryTask),
    diagnostic: upstreamPath ? "responses-compact" : "responses-compaction-trigger",
    responseContentType: codexCompactArchiveResponseContentType(responseMode),
    responseMode,
    upstreamPath
  };
}

export function prepareContextArchiveToolContinuationRequest(input: {
  apiKey?: ApiKeyConfig;
  body: Buffer | undefined;
  config: AppConfig;
  method: string;
  path: string;
  protocol?: GatewayProviderProtocol;
}): ContextArchiveToolContinuationContext | undefined {
  if (input.method !== "POST" || (input.protocol !== "openai_responses" && input.protocol !== "anthropic_messages")) {
    return undefined;
  }
  const config = contextArchiveConfigForApiKey(input.config, input.apiKey);
  if (!config || !contextArchiveMcpEnabled(config)) {
    return undefined;
  }
  const body = parseJsonObjectSafe(input.body);
  if (!body) {
    return undefined;
  }
  const archiveAccess = input.protocol === "anthropic_messages"
    ? anthropicMessagesContextArchiveAccess(body)
    : openAiResponsesContextArchiveAccess(body);
  if (!archiveAccess) {
    return undefined;
  }
  const rawToolName = config.contextArchive.toolName || "ccr_history_ask";
  const toolName = input.protocol === "anthropic_messages"
    ? contextArchiveClaudeCodeToolName(rawToolName)
    : rawToolName;
  const acceptedToolNames = uniqueStrings([toolName, rawToolName, contextArchiveClaudeCodeToolName(rawToolName)]);
  const next = input.protocol === "anthropic_messages"
    ? prepareAnthropicContextArchiveToolContinuationBody(body, toolName)
    : prepareOpenAiResponsesContextArchiveToolContinuationBody(body, toolName);
  return {
    acceptedToolNames,
    archiveId: archiveAccess.archiveId,
    body: serializeJsonBody(next),
    config,
    executedCalls: 0,
    maxIterations: 4,
    protocol: input.protocol,
    sessionToken: archiveAccess.sessionToken,
    toolName
  };
}

export async function resolveContextArchiveToolContinuation(input: {
  context: ContextArchiveToolContinuationContext;
  coreAuthToken: string;
  executor: ContextArchiveReplayExecutor;
  fallback: RouterFallbackConfig;
  headers: Record<string, string>;
  method: string;
  path: string;
  routedModel?: string;
  signal: AbortSignal;
  upstreamResult: UpstreamFetchResult;
  upstreamUrl: string;
}): Promise<UpstreamFetchResult> {
  let requestBody = input.context.body;
  let result = input.upstreamResult;
  for (let iteration = 0; iteration < input.context.maxIterations; iteration += 1) {
    const responseHeaders = upstreamResponseHeaders(result);
    const contentType = responseHeaders.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json") && !contentType.includes("text/event-stream")) {
      return result;
    }
    const responseBody = Buffer.from(await result.response.arrayBuffer());
    const parsedResponse = parseContextArchiveToolResponseBody(responseBody, contentType, input.context.protocol);
    if (!parsedResponse) {
      return withBufferedResponse(result, responseBody);
    }
    const calls = contextArchiveFunctionCalls(parsedResponse, input.context.protocol);
    const archiveCalls = calls.filter((call) => input.context.acceptedToolNames.includes(call.name));
    if (archiveCalls.length === 0) {
      return withBufferedResponse(result, responseBody);
    }
    if (archiveCalls.length !== calls.length) {
      return withBufferedResponse(result, responseBody);
    }

    const toolOutputs: Record<string, unknown>[] = [];
    for (const call of archiveCalls) {
      const output = await executeContextArchiveFunctionCall(input.context, call, input.executor);
      toolOutputs.push({
        call_id: call.callId,
        output: JSON.stringify(output),
        type: "function_call_output"
      });
      input.context.executedCalls += 1;
    }
    const nextBody = appendContextArchiveToolOutputs(requestBody, parsedResponse, toolOutputs, input.context.protocol);
    if (!nextBody) {
      return withBufferedResponse(result, responseBody);
    }
    requestBody = nextBody;

    const headers: Record<string, string> = {
      ...input.headers,
      "content-type": "application/json",
      "x-ccr-context-archive-tool": "continuation",
      "x-ccr-context-archive-tool-calls": String(input.context.executedCalls)
    };
    delete headers["content-length"];
    result = await fetchUpstreamWithFallback({
      body: requestBody,
      config: input.context.config,
      fallback: input.fallback,
      headers,
      method: input.method,
      path: input.path,
      routedModel: input.routedModel,
      coreAuthToken: input.coreAuthToken,
      signal: input.signal,
      upstreamUrl: input.upstreamUrl
    });
  }
  return result;
}

export function prepareContextArchiveToolContinuationRequestForTest(
  input: Parameters<typeof prepareContextArchiveToolContinuationRequest>[0]
): ContextArchiveToolContinuationContext | undefined {
  return prepareContextArchiveToolContinuationRequest(input);
}

export function parseContextArchiveToolResponseBodyForTest(
  responseBody: Buffer,
  contentType: string,
  protocol: ContextArchiveToolContinuationProtocol
): Record<string, unknown> | undefined {
  return parseContextArchiveToolResponseBody(responseBody, contentType, protocol);
}

export function contextArchiveFunctionCallsForTest(
  responseBody: Record<string, unknown>,
  protocol: ContextArchiveToolContinuationProtocol
): ContextArchiveFunctionCall[] {
  return contextArchiveFunctionCalls(responseBody, protocol);
}

export function appendContextArchiveToolOutputsForTest(
  requestBody: Buffer,
  responseBody: Record<string, unknown>,
  toolOutputs: Record<string, unknown>[],
  protocol: ContextArchiveToolContinuationProtocol
): Buffer | undefined {
  return appendContextArchiveToolOutputs(requestBody, responseBody, toolOutputs, protocol);
}

function prepareOpenAiResponsesContextArchiveToolContinuationBody(
  body: Record<string, unknown>,
  toolName: string
): Record<string, unknown> {
  return {
    ...body,
    instructions: appendStringInstruction(body.instructions, contextArchiveToolContinuationGuidance(toolName)),
    tool_choice: contextArchiveOpenAiResponsesToolChoice(body.tool_choice),
    tools: appendContextArchiveOpenAiResponsesTool(body.tools, toolName)
  };
}

function prepareAnthropicContextArchiveToolContinuationBody(
  body: Record<string, unknown>,
  toolName: string
): Record<string, unknown> {
  return {
    ...body,
    system: appendAnthropicSystemText(body.system, contextArchiveToolContinuationGuidance(toolName)),
    tool_choice: contextArchiveAnthropicMessagesToolChoice(body.tool_choice),
    tools: appendContextArchiveAnthropicMessagesTool(body.tools, toolName)
  };
}

function withBufferedResponse(result: UpstreamFetchResult, body: Buffer): UpstreamFetchResult {
  return {
    ...result,
    response: new Response(new Uint8Array(body), {
      headers: new Headers(result.response.headers),
      status: result.response.status,
      statusText: result.response.statusText
    })
  };
}

async function executeContextArchiveFunctionCall(
  context: ContextArchiveToolContinuationContext,
  call: ContextArchiveFunctionCall,
  executor: ContextArchiveReplayExecutor
): Promise<Record<string, unknown>> {
  const args = parseFunctionCallArguments(call.arguments);
  const output = await contextArchiveService.ask({
    archiveId: stringValue(args.archive_id ?? args.archiveId) ?? context.archiveId,
    sessionToken: stringValue(args.session_token ?? args.sessionToken) ?? context.sessionToken,
    task: stringValue(args.task) ?? ""
  }, context.config.contextArchive, executor);
  return output as unknown as Record<string, unknown>;
}

function parseFunctionCallArguments(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseContextArchiveToolResponseBody(
  responseBody: Buffer,
  contentType: string,
  protocol: ContextArchiveToolContinuationProtocol
): Record<string, unknown> | undefined {
  if (contentType.includes("application/json")) {
    return parseJsonObjectSafe(responseBody);
  }
  if (!contentType.includes("text/event-stream")) {
    return undefined;
  }
  const events = parseSseEvents(responseBody.toString("utf8"));
  return protocol === "anthropic_messages"
    ? anthropicMessagesResponseFromSseEvents(events)
    : openAiResponsesResponseFromSseEvents(events);
}

function contextArchiveFunctionCalls(
  responseBody: Record<string, unknown>,
  protocol: ContextArchiveToolContinuationProtocol
): ContextArchiveFunctionCall[] {
  return protocol === "anthropic_messages"
    ? anthropicMessagesFunctionCalls(responseBody)
    : openAiResponsesFunctionCalls(responseBody);
}

function appendContextArchiveToolOutputs(
  requestBody: Buffer,
  responseBody: Record<string, unknown>,
  toolOutputs: Record<string, unknown>[],
  protocol: ContextArchiveToolContinuationProtocol
): Buffer | undefined {
  return protocol === "anthropic_messages"
    ? appendAnthropicMessagesToolOutputs(requestBody, responseBody, toolOutputs)
    : appendOpenAiResponsesToolOutputs(requestBody, responseBody, toolOutputs);
}

function appendOpenAiResponsesToolOutputs(
  requestBody: Buffer,
  responseBody: Record<string, unknown>,
  toolOutputs: Record<string, unknown>[]
): Buffer | undefined {
  const body = parseJsonObjectSafe(requestBody);
  if (!body || toolOutputs.length === 0) {
    return undefined;
  }
  const responseOutput = Array.isArray(responseBody.output) ? responseBody.output : [];
  const input = Array.isArray(body.input)
    ? body.input
    : body.input === undefined
      ? []
      : [body.input];
  return serializeJsonBody({
    ...body,
    input: [...input, ...responseOutput, ...toolOutputs]
  });
}

function appendAnthropicMessagesToolOutputs(
  requestBody: Buffer,
  responseBody: Record<string, unknown>,
  toolOutputs: Record<string, unknown>[]
): Buffer | undefined {
  const body = parseJsonObjectSafe(requestBody);
  if (!body || toolOutputs.length === 0 || !Array.isArray(responseBody.content)) {
    return undefined;
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const toolResultContent = toolOutputs.flatMap((output) => {
    const toolUseId = stringValue(output.call_id);
    if (!toolUseId) {
      return [];
    }
    return [{
      content: stringValue(output.output) ?? JSON.stringify(output.output ?? {}),
      tool_use_id: toolUseId,
      type: "tool_result"
    }];
  });
  if (toolResultContent.length === 0) {
    return undefined;
  }
  return serializeJsonBody({
    ...body,
    messages: [
      ...messages,
      {
        content: responseBody.content,
        role: "assistant"
      },
      {
        content: toolResultContent,
        role: "user"
      }
    ]
  });
}

function openAiResponsesFunctionCalls(responseBody: Record<string, unknown>): ContextArchiveFunctionCall[] {
  const output = Array.isArray(responseBody.output) ? responseBody.output : [];
  return output.flatMap((item) => {
    if (!isRecord(item) || item.type !== "function_call") {
      return [];
    }
    const name = stringValue(item.name);
    const callId = stringValue(item.call_id) ?? stringValue(item.id);
    if (!name || !callId) {
      return [];
    }
    return [{
      arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
      callId,
      name
    }];
  });
}

function anthropicMessagesFunctionCalls(responseBody: Record<string, unknown>): ContextArchiveFunctionCall[] {
  const content = Array.isArray(responseBody.content) ? responseBody.content : [];
  return content.flatMap((item) => {
    if (!isRecord(item) || stringValue(item.type) !== "tool_use") {
      return [];
    }
    const name = stringValue(item.name);
    const callId = stringValue(item.id);
    if (!name || !callId) {
      return [];
    }
    return [{
      arguments: JSON.stringify(isRecord(item.input) ? item.input : {}),
      callId,
      name
    }];
  });
}

function anthropicMessagesResponseFromSseEvents(events: ParsedSseEvent[]): Record<string, unknown> | undefined {
  let message: Record<string, unknown> | undefined;
  const blocks = new Map<number, Record<string, unknown>>();
  const inputJsonByIndex = new Map<number, string>();
  for (const event of events) {
    const data = isRecord(event.data) ? event.data : undefined;
    if (!data) {
      continue;
    }
    const type = stringValue(data.type);
    if (type === "message_start" && isRecord(data.message)) {
      message = { ...data.message };
      continue;
    }
    const index = numberValue(data.index);
    if (index === undefined) {
      if (type === "message_delta" && isRecord(data.delta)) {
        message = {
          ...(message ?? { role: "assistant", type: "message" }),
          ...(data.delta.stop_reason !== undefined ? { stop_reason: data.delta.stop_reason } : {}),
          ...(data.delta.stop_sequence !== undefined ? { stop_sequence: data.delta.stop_sequence } : {})
        };
      }
      continue;
    }
    if (type === "content_block_start" && isRecord(data.content_block)) {
      blocks.set(index, { ...data.content_block });
      continue;
    }
    if (type !== "content_block_delta" || !isRecord(data.delta)) {
      continue;
    }
    const block = blocks.get(index);
    if (!block) {
      continue;
    }
    const deltaType = stringValue(data.delta.type);
    if (deltaType === "text_delta") {
      block.text = `${stringValue(block.text) ?? ""}${stringValue(data.delta.text) ?? ""}`;
    } else if (deltaType === "input_json_delta") {
      inputJsonByIndex.set(index, `${inputJsonByIndex.get(index) ?? ""}${stringValue(data.delta.partial_json) ?? ""}`);
    }
  }
  if (!message && blocks.size === 0) {
    return undefined;
  }
  const content = [...blocks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, block]) => {
      const inputJson = inputJsonByIndex.get(index);
      if (stringValue(block.type) === "tool_use" && inputJson !== undefined) {
        return { ...block, input: parseFunctionCallArguments(inputJson) };
      }
      return block;
    });
  return {
    ...(message ?? { role: "assistant", type: "message" }),
    content
  };
}

function openAiResponsesResponseFromSseEvents(events: ParsedSseEvent[]): Record<string, unknown> | undefined {
  let response: Record<string, unknown> | undefined;
  const items = new Map<number, Record<string, unknown>>();
  const itemIndexById = new Map<string, number>();
  const argumentsByIndex = new Map<number, string>();
  for (const event of events) {
    const data = isRecord(event.data) ? event.data : undefined;
    if (!data) {
      continue;
    }
    const type = stringValue(data.type);
    if (type === "response.completed" && isRecord(data.response)) {
      response = { ...data.response };
      continue;
    }
    const item = isRecord(data.item) ? data.item : undefined;
    if (item && stringValue(item.type) === "function_call") {
      const index = numberValue(data.output_index) ?? items.size;
      items.set(index, { ...item });
      const itemId = stringValue(item.id);
      if (itemId) {
        itemIndexById.set(itemId, index);
      }
      const argumentsText = rawStringValue(item.arguments);
      if (argumentsText !== undefined) {
        argumentsByIndex.set(index, argumentsText);
      }
      continue;
    }
    if (!type?.startsWith("response.function_call_arguments.")) {
      continue;
    }
    const index = openAiResponsesSseFunctionCallIndex(data, itemIndexById);
    if (index === undefined) {
      continue;
    }
    if (type === "response.function_call_arguments.delta") {
      argumentsByIndex.set(index, `${argumentsByIndex.get(index) ?? ""}${stringValue(data.delta) ?? ""}`);
    } else if (type === "response.function_call_arguments.done") {
      const argumentsText = rawStringValue(data.arguments);
      if (argumentsText !== undefined) {
        argumentsByIndex.set(index, argumentsText);
      }
    }
  }
  if (!response && items.size === 0) {
    return undefined;
  }
  const output = [...items.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, item]) => ({
      ...item,
      ...(argumentsByIndex.has(index) ? { arguments: argumentsByIndex.get(index) } : {})
    }));
  return {
    ...(response ?? {}),
    output: output.length > 0 ? output : Array.isArray(response?.output) ? response.output : []
  };
}

function openAiResponsesSseFunctionCallIndex(
  data: Record<string, unknown>,
  itemIndexById: Map<string, number>
): number | undefined {
  const outputIndex = numberValue(data.output_index);
  if (outputIndex !== undefined) {
    return outputIndex;
  }
  const itemId = stringValue(data.item_id);
  return itemId ? itemIndexById.get(itemId) : undefined;
}

function appendContextArchiveOpenAiResponsesTool(tools: unknown, toolName: string): unknown[] {
  const current = Array.isArray(tools) ? tools : [];
  if (current.some((tool) => isRecord(tool) && stringValue(tool.name) === toolName)) {
    return current;
  }
  return [...current, contextArchiveOpenAiResponsesTool(toolName)];
}

function appendContextArchiveAnthropicMessagesTool(tools: unknown, toolName: string): unknown[] {
  const current = Array.isArray(tools) ? tools : [];
  if (current.some((tool) => isRecord(tool) && stringValue(tool.name) === toolName)) {
    return current;
  }
  return [...current, contextArchiveAnthropicMessagesTool(toolName)];
}

function contextArchiveOpenAiResponsesTool(toolName: string): Record<string, unknown> {
  return {
    type: "function",
    name: toolName,
    description: contextArchiveToolDescription(),
    parameters: contextArchiveToolSchema()
  };
}

function contextArchiveAnthropicMessagesTool(toolName: string): Record<string, unknown> {
  return {
    name: toolName,
    description: contextArchiveToolDescription(),
    input_schema: contextArchiveToolSchema()
  };
}

function contextArchiveToolDescription(): string {
  return [
    "Ask the archived pre-compaction agent lineage a natural-language history task.",
    "Use this when the compact handoff says historical details are available in CCR archived history.",
    "Pass archive_id and session_token exactly from the compact handoff.",
    "For many related questions, include every question id and full question text in one task and ask for JSON evidence keyed by question id."
  ].join(" ");
}

function contextArchiveToolSchema(): Record<string, unknown> {
  return {
    additionalProperties: false,
    properties: {
      archive_id: { description: "Exact immutable archive id from the handoff.", type: "string" },
      session_token: { description: "Opaque access token from the same handoff.", type: "string" },
      task: { description: "Natural-language task for the archived previous-context agent.", type: "string" }
    },
    required: ["archive_id", "session_token", "task"],
    type: "object"
  };
}

function contextArchiveToolContinuationGuidance(toolName: string): string {
  return [
    "CCR context archive is available for this compacted continuation.",
    `If the compact handoff indicates missing historical details are stored in archived history, use the ${toolName} tool when that history is needed.`,
    "Use ordinary task judgment: answer directly when the compact handoff and retained tail are sufficient; call the history tool when exact pre-compaction details are needed."
  ].join(" ");
}

function openAiResponsesContextArchiveAccess(body: Record<string, unknown>): { archiveId: string; sessionToken: string } | undefined {
  const input = Array.isArray(body.input) ? body.input : [];
  for (const item of input) {
    if (!isRecord(item) || item.type !== "compaction") {
      continue;
    }
    const access = contextArchiveAccessFromText(rawStringValue(item.encrypted_content) ?? "");
    if (access) {
      return access;
    }
  }
  return undefined;
}

function anthropicMessagesContextArchiveAccess(body: Record<string, unknown>): { archiveId: string; sessionToken: string } | undefined {
  for (const text of anthropicMessagesContextArchiveTexts(body)) {
    const access = contextArchiveAccessFromText(text);
    if (access) {
      return access;
    }
  }
  return undefined;
}

function anthropicMessagesContextArchiveTexts(body: Record<string, unknown>): string[] {
  const texts = [...textPartsFromAnthropicContent(body.system)];
  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      if (isRecord(message)) {
        texts.push(...textPartsFromAnthropicContent(message.content));
      }
    }
  }
  return texts;
}

function contextArchiveAccessFromText(text: string): { archiveId: string; sessionToken: string } | undefined {
  if (!text.includes("CCR ARCHIVED HISTORY ACCESS")) {
    return undefined;
  }
  const archiveId = (/Archive id:\s*([A-Za-z0-9_-]+)/.exec(text) ?? [])[1];
  const sessionToken = (/Archive session token:\s*([A-Za-z0-9_-]+)/.exec(text) ?? [])[1];
  return archiveId && sessionToken ? { archiveId, sessionToken } : undefined;
}

function contextArchiveClaudeCodeToolName(toolName: string): string {
  return `mcp__${CONTEXT_ARCHIVE_MCP_SERVER_NAME}__${toolName}`;
}

function contextArchiveOpenAiResponsesToolChoice(value: unknown): unknown {
  return stringValue(value)?.toLowerCase() === "none" ? "auto" : value;
}

function contextArchiveAnthropicMessagesToolChoice(value: unknown): unknown {
  if (stringValue(value)?.toLowerCase() === "none") {
    return { type: "auto" };
  }
  if (isRecord(value) && stringValue(value.type)?.toLowerCase() === "none") {
    return { ...value, type: "auto" };
  }
  return value;
}

function appendAnthropicSystemText(system: unknown, text: string): unknown {
  if (typeof system === "string" || system === undefined) {
    return appendStringInstruction(system, text);
  }
  if (Array.isArray(system)) {
    return [...system, { text, type: "text" }];
  }
  return system;
}

function appendStringInstruction(value: unknown, text: string): string {
  const current = rawStringValue(value);
  return current ? `${current.trimEnd()}\n\n${text}` : text;
}

function textPartsFromAnthropicContent(content: unknown): string[] {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((part) => {
    if (!isRecord(part) || stringValue(part.type) !== "text") {
      return [];
    }
    const text = rawStringValue(part.text);
    return text === undefined ? [] : [text];
  });
}
