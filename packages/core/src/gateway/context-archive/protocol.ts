import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";

type JsonObject = Record<string, unknown>;

export type ContextArchiveResponseMode =
  | "default"
  | "codex_responses_compact_json"
  | "codex_responses_compaction_sse";

export const replayableArchiveProtocols: GatewayProviderProtocol[] = [
  "anthropic_messages",
  "openai_chat_completions",
  "openai_responses"
];

export function parseArchiveBody(body: Buffer | undefined): JsonObject | undefined {
  if (!body?.length) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(body.toString("utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function appendArchiveTask(
  originalBody: Buffer,
  protocol: GatewayProviderProtocol,
  task: string
): Buffer {
  return appendTask(originalBody, protocol, task, { compactHandoff: false, replayTask: true });
}

export function appendCompactHandoffTask(
  originalBody: Buffer,
  protocol: GatewayProviderProtocol,
  task: string
): Buffer {
  return appendTask(originalBody, protocol, task, { compactHandoff: true, replayTask: false });
}

function appendTask(
  originalBody: Buffer,
  protocol: GatewayProviderProtocol,
  task: string,
  options: { compactHandoff: boolean; replayTask: boolean }
): Buffer {
  const body = parseArchiveBody(originalBody);
  if (!body) {
    throw archiveProtocolError("ARCHIVE_INVALID_REQUEST", "The archived request body is not a JSON object.");
  }
  assertAppendableTurn(body, protocol);
  const next = cloneJsonObject(body);
  if (options.compactHandoff) {
    sanitizeCompactHandoffRequest(next, protocol);
  } else if (options.replayTask && protocol === "openai_responses") {
    removeCodexCompactionTriggers(next);
  }

  if (protocol === "openai_responses") {
    if (Array.isArray(next.input)) {
      next.input = [
        ...next.input,
        {
          content: [{ text: task, type: "input_text" }],
          role: "user",
          type: "message"
        }
      ];
    } else if (typeof next.input === "string") {
      next.input = `${next.input}\n\n${task}`;
    } else if (next.input === undefined) {
      next.input = task;
    } else {
      throw archiveProtocolError("ARCHIVE_INVALID_REQUEST", "OpenAI Responses input cannot accept an appended task.");
    }
  } else {
    const messages = next.messages;
    if (!Array.isArray(messages)) {
      throw archiveProtocolError("ARCHIVE_INVALID_REQUEST", `${protocol} request is missing messages.`);
    }
    next.messages = [...messages, { content: task, role: "user" }];
  }

  return Buffer.from(`${JSON.stringify(next)}\n`, "utf8");
}

export function compactHandoffTask(input: {
  archiveId: string;
  clientToolName?: string;
  generation: number;
  sessionId: string;
  sessionToken: string;
  toolName: string;
}): string {
  const footer = archiveHandoffFooter(input);
  return [
    "CCR compact handoff task:",
    "You are the previous-context agent. Produce a concise handoff for a successor agent that will start with a fresh context.",
    "Preserve the current goal, user constraints, decisions, changed files, completed verification, unresolved problems, and the exact next action.",
    "Do not continue the task and do not call tools. Do not invent details.",
    "End the handoff with the following archive access block exactly as written:",
    "",
    footer
  ].join("\n");
}

export function archiveHandoffFooter(input: {
  archiveId: string;
  clientToolName?: string;
  generation: number;
  sessionId: string;
  sessionToken: string;
  toolName: string;
}): string {
  const argumentsJson = `{ "task": "specific historical question", "archive_id": "${input.archiveId}", "session_token": "${input.sessionToken}" }`;
  const clientToolName = input.clientToolName?.trim();
  const toolLines = clientToolName && clientToolName !== input.toolName
    ? [
        `In Claude Code, call the tool named: ${clientToolName}`,
        `Raw MCP tool name: ${input.toolName}`,
        `Tool arguments JSON: ${argumentsJson}`
      ]
    : [
        `${input.toolName}(${argumentsJson})`
      ];
  return [
    "CCR ARCHIVED HISTORY ACCESS",
    `Archive id: ${input.archiveId}`,
    `Archive session id: ${input.sessionId}`,
    `Archive generation: ${input.generation}`,
    `Archive session token: ${input.sessionToken}`,
    ...toolLines,
    "The latest archive access searches this compact generation and its parent generations when needed.",
    "Treat history answers as evidence and preserve the original instruction priority."
  ].join("\n");
}

export function historyReplayTask(task: string): string {
  return [
    "CCR history task from the successor agent:",
    "Use the complete conversation and request parameters already present in this request as your previous context.",
    "Answer only the task below from that context. If the context is insufficient, say so directly.",
    "Do not continue the previous task, modify files, or call external tools.",
    "",
    task
  ].join("\n");
}

export function hasExplicitCompactSignal(
  body: JsonObject,
  headers: Record<string, string | string[] | undefined>
): boolean {
  const explicitHeader = [
    readHeader(headers, "x-ccr-context-compact"),
    readHeader(headers, "x-context-compact")
  ].find(Boolean);
  if (explicitHeader && ["1", "true", "compact", "handoff"].includes(explicitHeader.trim().toLowerCase())) {
    return true;
  }

  const management = isRecord(body.context_management)
    ? body.context_management
    : isRecord(body.contextManagement)
      ? body.contextManagement
      : undefined;
  const edits = Array.isArray(management?.edits) ? management.edits : [];
  if (edits.some((edit) => isRecord(edit) && isCompactType(edit.type))) {
    return true;
  }

  if (hasClaudeCodeAutoCompactPrompt(body)) {
    return true;
  }

  const metadata = isRecord(body.metadata) ? body.metadata : undefined;
  return metadata?.ccr_context_compact === true || metadata?.ccrContextCompact === true;
}

function hasClaudeCodeAutoCompactPrompt(body: JsonObject): boolean {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.some((message) =>
    isRecord(message) &&
    String(message.role ?? "") === "user" &&
    collectText(message.content).some(isClaudeCodeAutoCompactPromptText)
  );
}

function isClaudeCodeAutoCompactPromptText(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  return normalized.includes("CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.") &&
    normalized.includes("Your task is to create a detailed summary of the conversation so far") &&
    normalized.includes("Your entire response must be plain text: an <analysis> block followed by a <summary> block.");
}

export function isCodexResponsesCompactPath(path: string): boolean {
  return /\/responses\/compact\/?$/i.test(path.split("?")[0] ?? path);
}

export function codexResponsesPathForCompact(path: string): string | undefined {
  if (!isCodexResponsesCompactPath(path)) {
    return undefined;
  }
  const pathname = path.split("?")[0] ?? path;
  const replacement = pathname.replace(/\/compact\/?$/i, "");
  return replacement || "/v1/responses";
}

export function hasCodexResponsesCompactionTrigger(body: JsonObject): boolean {
  return Array.isArray(body.input) && body.input.some((item) =>
    isRecord(item) && item.type === "compaction_trigger"
  );
}

export function extractArchiveAssistantText(
  rawText: string,
  protocol: GatewayProviderProtocol,
  contentType?: string
): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return "";
  }
  const isSse = contentType?.toLowerCase().includes("text/event-stream") || /^event:|^data:/m.test(trimmed);
  if (isSse) {
    return normalizeWhitespace(collectSseProtocolText(parseSsePayloads(trimmed), protocol).join(""));
  }
  try {
    return normalizeWhitespace(collectProtocolText(JSON.parse(trimmed) as unknown, protocol).join(""));
  } catch {
    return normalizeWhitespace(rawText);
  }
}

function collectSseProtocolText(payloads: unknown[], protocol: GatewayProviderProtocol): string[] {
  if (protocol === "openai_responses") {
    const deltas = payloads.flatMap((payload) =>
      isRecord(payload) && payload.type === "response.output_text.delta" && typeof payload.delta === "string"
        ? [payload.delta]
        : []
    );
    return deltas.length ? deltas : payloads.flatMap((payload) => collectProtocolText(payload, protocol));
  }
  if (protocol === "anthropic_messages") {
    const deltas = payloads.flatMap((payload) =>
      isRecord(payload) && payload.type === "content_block_delta" ? collectText(payload.delta) : []
    );
    return deltas.length ? deltas : payloads.flatMap((payload) => collectProtocolText(payload, protocol));
  }
  return payloads.flatMap((payload) => collectProtocolText(payload, protocol));
}

export function archiveResponseRequiresTool(rawText: string): boolean {
  const values: unknown[] = [];
  try {
    values.push(JSON.parse(rawText) as unknown);
  } catch {
    values.push(...parseSsePayloads(rawText));
  }
  return values.some(hasStructuredToolCall);
}

export function appendArchiveFooterToResponse(
  rawBody: Buffer,
  protocol: GatewayProviderProtocol,
  contentType: string | undefined,
  footer: string
): Buffer {
  const rawText = rawBody.toString("utf8");
  if (!footer.trim() || rawText.includes(footer)) {
    return rawBody;
  }
  const normalizedType = contentType?.toLowerCase() ?? "";
  if (normalizedType.includes("text/event-stream") || /^event:|^data:/m.test(rawText)) {
    return Buffer.from(appendFooterToSse(rawText, protocol, footer), "utf8");
  }
  try {
    const value = JSON.parse(rawText) as unknown;
    const transformed = appendFooterToJson(value, protocol, footer);
    return transformed.changed ? Buffer.from(`${JSON.stringify(transformed.value)}\n`, "utf8") : rawBody;
  } catch {
    return rawBody;
  }
}

export function codexCompactArchiveResponseContentType(mode: ContextArchiveResponseMode | undefined): string | undefined {
  if (mode === "codex_responses_compact_json") {
    return "application/json; charset=utf-8";
  }
  if (mode === "codex_responses_compaction_sse") {
    return "text/event-stream; charset=utf-8";
  }
  return undefined;
}

export function renderCodexCompactArchiveResponse(
  rawBody: Buffer,
  protocol: GatewayProviderProtocol,
  contentType: string | undefined,
  footer: string,
  mode: ContextArchiveResponseMode
): Buffer {
  const rawText = rawBody.toString("utf8");
  const handoff = ensureFooter(
    extractArchiveAssistantText(rawText, protocol, contentType) ||
      "Context compacted. Use the archive access block below to recover historical details.",
    footer
  );
  const usage = extractOpenAiResponsesUsage(rawText, contentType);
  const compactionItem = {
    encrypted_content: handoff,
    type: "compaction"
  };

  if (mode === "codex_responses_compaction_sse") {
    const completed = {
      response: {
        id: "resp_ccr_context_archive",
        usage: usage ?? {
          input_tokens: 0,
          input_tokens_details: null,
          output_tokens: 0,
          output_tokens_details: null,
          total_tokens: 0
        }
      },
      type: "response.completed"
    };
    return Buffer.from([
      sseBlock("response.output_item.done", {
        item: compactionItem,
        type: "response.output_item.done"
      }),
      sseBlock("response.completed", completed)
    ].join("\n\n") + "\n\n", "utf8");
  }

  return Buffer.from(`${JSON.stringify({
    output: [compactionItem],
    ...(usage ? { usage } : {})
  })}\n`, "utf8");
}

function assertAppendableTurn(body: JsonObject, protocol: GatewayProviderProtocol): void {
  if (protocol === "openai_responses") {
    const input = Array.isArray(body.input) ? body.input : [];
    const tail = input.at(-1);
    if (isRecord(tail) && ["function_call", "computer_call", "custom_tool_call"].includes(String(tail.type ?? ""))) {
      throw archiveProtocolError("ARCHIVE_NOT_AT_TURN_BOUNDARY", "The archived Responses request ends with an unresolved tool call.");
    }
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tail = messages.at(-1);
  if (!isRecord(tail) || String(tail.role ?? "") !== "assistant") {
    return;
  }
  if (Array.isArray(tail.tool_calls) && tail.tool_calls.length > 0) {
    throw archiveProtocolError("ARCHIVE_NOT_AT_TURN_BOUNDARY", "The archived chat request ends with an unresolved tool call.");
  }
  if (Array.isArray(tail.content) && tail.content.some((block) => isRecord(block) && block.type === "tool_use")) {
    throw archiveProtocolError("ARCHIVE_NOT_AT_TURN_BOUNDARY", "The archived Anthropic request ends with an unresolved tool call.");
  }
}

function sanitizeCompactHandoffRequest(body: JsonObject, protocol: GatewayProviderProtocol): void {
  removeCompactSignals(body);
  removeKeys(body, [
    "response_format",
    "responseFormat",
    "stop",
    "stop_sequences",
    "stopSequences"
  ]);

  if (protocol === "openai_responses") {
    removeKeys(body, [
      "parallel_tool_calls",
      "parallelToolCalls",
      "tool_choice",
      "toolChoice",
      "tools"
    ]);
    normalizeOpenAiResponsesTextFormat(body);
    raiseMinimumNumericField(body, ["max_output_tokens", "maxOutputTokens", "max_tokens", "maxTokens"], 2048);
    return;
  }

  removeKeys(body, [
    "function_call",
    "functionCall",
    "functions",
    "parallel_tool_calls",
    "parallelToolCalls",
    "tool_choice",
    "toolChoice",
    "tools"
  ]);
  raiseMinimumNumericField(body, ["max_tokens", "maxTokens"], 2048);
}

function removeCompactSignals(body: JsonObject): void {
  removeCodexCompactionTriggers(body);

  for (const key of ["context_management", "contextManagement"]) {
    const management = isRecord(body[key]) ? cloneJsonObject(body[key] as JsonObject) : undefined;
    if (!management) {
      continue;
    }
    const edits = Array.isArray(management.edits)
      ? management.edits.filter((edit) => !(isRecord(edit) && isCompactType(edit.type)))
      : undefined;
    if (edits !== undefined) {
      if (edits.length > 0) {
        management.edits = edits;
      } else {
        delete management.edits;
      }
    }
    if (Object.keys(management).length > 0) {
      body[key] = management;
    } else {
      delete body[key];
    }
  }

  const metadata = isRecord(body.metadata) ? cloneJsonObject(body.metadata) : undefined;
  if (!metadata) {
    return;
  }
  delete metadata.ccr_context_compact;
  delete metadata.ccrContextCompact;
  if (Object.keys(metadata).length > 0) {
    body.metadata = metadata;
  } else {
    delete body.metadata;
  }
}

function removeCodexCompactionTriggers(body: JsonObject): void {
  if (Array.isArray(body.input)) {
    body.input = body.input.filter((item) => !(isRecord(item) && item.type === "compaction_trigger"));
  }
}

function normalizeOpenAiResponsesTextFormat(body: JsonObject): void {
  if (!isRecord(body.text)) {
    return;
  }
  const text = cloneJsonObject(body.text);
  if (!isRecord(text.format)) {
    return;
  }
  const type = typeof text.format.type === "string" ? text.format.type.toLowerCase() : "";
  if (!type || type === "text") {
    return;
  }
  text.format = { type: "text" };
  body.text = text;
}

function removeKeys(body: JsonObject, keys: string[]): void {
  for (const key of keys) {
    delete body[key];
  }
}

function raiseMinimumNumericField(body: JsonObject, keys: string[], minimum: number): void {
  for (const key of keys) {
    if (typeof body[key] === "number" && Number.isFinite(body[key]) && body[key] < minimum) {
      body[key] = minimum;
    }
  }
}

function appendFooterToJson(
  value: unknown,
  protocol: GatewayProviderProtocol,
  footer: string
): { changed: boolean; value: unknown } {
  if (!isRecord(value)) {
    return { changed: false, value };
  }
  const next = cloneJsonObject(value);
  if (protocol === "anthropic_messages") {
    const content = Array.isArray(next.content) ? next.content : [];
    next.content = [...content, { text: `\n\n${footer}`, type: "text" }];
    return { changed: true, value: next };
  }
  if (protocol === "openai_chat_completions") {
    const choices = Array.isArray(next.choices) ? next.choices : [];
    const first = isRecord(choices[0]) ? choices[0] : undefined;
    const message = first && isRecord(first.message) ? first.message : undefined;
    if (!first || !message) {
      return { changed: false, value };
    }
    const current = message.content;
    message.content = typeof current === "string"
      ? `${current}\n\n${footer}`
      : Array.isArray(current)
        ? [...current, { text: `\n\n${footer}`, type: "text" }]
        : footer;
    first.message = message;
    choices[0] = first;
    next.choices = choices;
    return { changed: true, value: next };
  }

  const output = Array.isArray(next.output) ? next.output : [];
  const messageIndex = output.findIndex((item) => isRecord(item) && item.type === "message");
  if (messageIndex < 0 || !isRecord(output[messageIndex])) {
    return { changed: false, value };
  }
  const message = output[messageIndex] as JsonObject;
  const content = Array.isArray(message.content) ? message.content : [];
  message.content = [...content, { annotations: [], text: `\n\n${footer}`, type: "output_text" }];
  output[messageIndex] = message;
  next.output = output;
  if (typeof next.output_text === "string") {
    next.output_text = `${next.output_text}\n\n${footer}`;
  }
  return { changed: true, value: next };
}

function appendFooterToSse(rawText: string, protocol: GatewayProviderProtocol, footer: string): string {
  const blocks = rawText.split(/(\r?\n\r?\n)/g);
  const eventBlocks = blocks.filter((_block, index) => index % 2 === 0);
  if (protocol === "anthropic_messages") {
    const indexes = eventBlocks.flatMap((block) => {
      const data = parseSseBlockData(block);
      return isRecord(data) && typeof data.index === "number" ? [data.index] : [];
    });
    const index = (indexes.length ? Math.max(...indexes) : -1) + 1;
    const injected = [
      sseBlock("content_block_start", { content_block: { text: "", type: "text" }, index, type: "content_block_start" }),
      sseBlock("content_block_delta", { delta: { text: `\n\n${footer}`, type: "text_delta" }, index, type: "content_block_delta" }),
      sseBlock("content_block_stop", { index, type: "content_block_stop" })
    ].join("\n\n");
    return insertBeforeSseEvent(rawText, injected, (data) => data.type === "message_delta" || data.type === "message_stop");
  }
  if (protocol === "openai_chat_completions") {
    const template = eventBlocks.map(parseSseBlockData).find((data) => isRecord(data) && Array.isArray(data.choices));
    if (!isRecord(template)) {
      return rawText;
    }
    const injected = sseBlock(undefined, {
      ...template,
      choices: [{ delta: { content: `\n\n${footer}` }, finish_reason: null, index: 0 }]
    });
    return insertBeforeSseEvent(rawText, injected, (data) => {
      const choices = Array.isArray(data.choices) ? data.choices : [];
      return choices.some((choice) => isRecord(choice) && choice.finish_reason !== null && choice.finish_reason !== undefined);
    }, true);
  }

  const events = eventBlocks.map(parseSseBlockData).filter(isRecord);
  const textEvent = [...events].reverse().find((event) =>
    ["response.output_text.delta", "response.output_text.done"].includes(String(event.type ?? ""))
  );
  if (!textEvent) {
    return rawText;
  }
  const injected = sseBlock("response.output_text.delta", {
    content_index: Number(textEvent.content_index ?? 0),
    delta: `\n\n${footer}`,
    item_id: String(textEvent.item_id ?? ""),
    output_index: Number(textEvent.output_index ?? 0),
    type: "response.output_text.delta"
  });
  return insertBeforeSseEvent(rawText, injected, (data) =>
    data.type === "response.output_text.done" || data.type === "response.completed"
  );
}

function insertBeforeSseEvent(
  rawText: string,
  injected: string,
  predicate: (data: JsonObject) => boolean,
  beforeDone = false
): string {
  const blocks = rawText.split(/(\r?\n\r?\n)/g);
  for (let index = 0; index < blocks.length; index += 2) {
    const data = parseSseBlockData(blocks[index]);
    if (isRecord(data) && predicate(data)) {
      blocks[index] = `${injected}\n\n${blocks[index]}`;
      return blocks.join("");
    }
    if (beforeDone && blocks[index].includes("[DONE]")) {
      blocks[index] = `${injected}\n\n${blocks[index]}`;
      return blocks.join("");
    }
  }
  return `${rawText.replace(/\s*$/g, "")}\n\n${injected}\n\n`;
}

function parseSseBlockData(block: string): unknown {
  const data = block.split(/\r?\n/g)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
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

function sseBlock(event: string | undefined, data: JsonObject): string {
  return [event ? `event: ${event}` : undefined, `data: ${JSON.stringify(data)}`].filter(Boolean).join("\n");
}

function ensureFooter(text: string, footer: string): string {
  const normalizedText = text.trim();
  const normalizedFooter = footer.trim();
  if (!normalizedFooter || normalizedText.includes(normalizedFooter)) {
    return normalizedText;
  }
  return `${normalizedText}\n\n${normalizedFooter}`;
}

function extractOpenAiResponsesUsage(rawText: string, contentType: string | undefined): JsonObject | undefined {
  const normalizedContentType = contentType?.toLowerCase() ?? "";
  if (normalizedContentType.includes("text/event-stream")) {
    for (const payload of parseSseJsonPayloads(rawText)) {
      const response = isRecord(payload.response) ? payload.response : undefined;
      const usage = isRecord(response?.usage) ? response.usage : undefined;
      if (usage) {
        return usage;
      }
    }
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (!isRecord(parsed)) {
      return undefined;
    }
    if (isRecord(parsed.usage)) {
      return parsed.usage;
    }
    const response = isRecord(parsed.response) ? parsed.response : undefined;
    return isRecord(response?.usage) ? response.usage : undefined;
  } catch {
    return undefined;
  }
}

function parseSseJsonPayloads(text: string): JsonObject[] {
  const payloads: JsonObject[] = [];
  let dataLines: string[] = [];
  const flush = () => {
    if (dataLines.length === 0) {
      return;
    }
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") {
      return;
    }
    try {
      const parsed = JSON.parse(data) as unknown;
      if (isRecord(parsed)) {
        payloads.push(parsed);
      }
    } catch {
      // Ignore non-JSON SSE data.
    }
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  flush();
  return payloads;
}

function collectProtocolText(value: unknown, protocol: GatewayProviderProtocol): string[] {
  if (!isRecord(value)) {
    return [];
  }
  if (protocol === "openai_chat_completions") {
    const choices = Array.isArray(value.choices) ? value.choices : [];
    const text = choices.flatMap((choice) => isRecord(choice)
      ? [...collectText(readPath(choice, ["message", "content"])), ...collectText(readPath(choice, ["delta", "content"]))]
      : []);
    return text.length ? text : collectText(value);
  }
  if (protocol === "openai_responses") {
    return collectText(value.output_text).concat(collectText(value.delta), collectText(value.output), collectText(value.item));
  }
  return collectText(value.content).concat(collectText(value.delta), collectText(value.message));
}

function collectText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }
  if (!isRecord(value)) {
    return [];
  }
  const type = typeof value.type === "string" ? value.type : "";
  const direct = typeof value.text === "string" && (!type || [
    "content_block_delta", "message", "output_text", "summary_text", "text", "text_delta", "response.output_text.delta"
  ].includes(type)) ? [value.text] : [];
  const outputText = typeof value.output_text === "string" ? [value.output_text] : [];
  const content = typeof value.content === "string" ? [value.content] : collectText(value.content);
  return direct.concat(outputText, content, collectText(value.delta), collectText(value.message), collectText(value.output), collectText(value.response), collectText(value.item));
}

function parseSsePayloads(rawText: string): unknown[] {
  const payloads: unknown[] = [];
  for (const event of rawText.split(/\r?\n\r?\n+/g)) {
    const data = event.split(/\r?\n/g)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    try {
      payloads.push(JSON.parse(data) as unknown);
    } catch {
      // Ignore malformed protocol events and continue parsing later events.
    }
  }
  return payloads;
}

function hasStructuredToolCall(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasStructuredToolCall);
  }
  if (!isRecord(value)) {
    return false;
  }
  if (Array.isArray(value.tool_calls) && value.tool_calls.length > 0) {
    return true;
  }
  if (["tool_use", "function_call", "custom_tool_call", "computer_call"].includes(String(value.type ?? ""))) {
    return true;
  }
  return Object.values(value).some(hasStructuredToolCall);
}

function readPath(value: JsonObject, path: string[]): unknown {
  let current: unknown = value;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function readHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  return Array.isArray(value) ? value.join(",") : value;
}

function isCompactType(value: unknown): boolean {
  return typeof value === "string" && /^compact(?:_|$)/i.test(value.trim());
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function archiveProtocolError(code: string, message: string): Error {
  const error = new Error(`${code}: ${message}`);
  error.name = "ContextArchiveError";
  return error;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
