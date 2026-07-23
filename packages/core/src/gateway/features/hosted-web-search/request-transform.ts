import type { AppConfig } from "@ccr/core/contracts/app";
import { isRecord, rawStringValue, stringValue } from "@ccr/core/gateway/internal/value";
import type { AnthropicWebSearchProtocolContext, BrowserWebSearchProtocolRecord, ClaudeCodeWebSearchContinuationContext, HostedWebSearchProtocolContext } from "@ccr/core/gateway/internal/shared";
import { parseJsonObjectSafe, serializeJsonBody } from "@ccr/core/gateway/http/body";
import { uniqueStrings } from "@ccr/core/gateway/internal/collections";
import { requestProtocolForPath } from "@ccr/core/routing/protocol-endpoints";
import { claudeCodeWebSearchToolResultTexts, extractAnthropicWebSearchQueryHint, extractClaudeCodeWebSearchToolResultQuery, extractHostedWebSearchQueryHint, fusionWebSearchToolNameForRequest, hasHostedWebSearchDeclaration, isAnthropicHostedWebSearchTool, isOpenAiHostedWebSearchTool, openAiToolChoiceNamesWebSearch, readHostedWebSearchMaxUses } from "@ccr/core/gateway/features/hosted-web-search/discovery";
import { normalizeSearchComparisonText } from "@ccr/core/gateway/features/hosted-web-search/evidence";



export function createHostedWebSearchProtocolContext(input: {
  body: Buffer | undefined;
  config: AppConfig;
  method: string;
  path: string;
  requestId: string;
  routedModel?: string;
  sinceMs: number;
}): HostedWebSearchProtocolContext | undefined {
  const protocol = requestProtocolForPath(input.path);
  if (input.method !== "POST" || !protocol) {
    return undefined;
  }
  const body = parseJsonObjectSafe(input.body);
  if (!body || !hasHostedWebSearchDeclaration(body, protocol)) {
    return undefined;
  }
  const toolName = fusionWebSearchToolNameForRequest(input.config, stringValue(body.model) || input.routedModel);
  if (!toolName) {
    return undefined;
  }
  return {
    maxUses: readHostedWebSearchMaxUses(body, protocol),
    protocol,
    queryHint: extractHostedWebSearchQueryHint(body, protocol),
    requestId: input.requestId,
    sinceMs: input.sinceMs,
    toolName
  };
}



function createAnthropicWebSearchProtocolContext(input: {
  body: Buffer | undefined;
  config: AppConfig;
  method: string;
  path: string;
  requestId: string;
  sinceMs: number;
}): AnthropicWebSearchProtocolContext | undefined {
  const context = createHostedWebSearchProtocolContext(input);
  return context?.protocol === "anthropic_messages" ? context : undefined;
}



export function createClaudeCodeWebSearchContinuationContext(input: {
  body: Buffer | undefined;
  config: AppConfig;
  method: string;
  path: string;
  routedModel?: string;
  sinceMs: number;
}): ClaudeCodeWebSearchContinuationContext | undefined {
  if (input.method !== "POST" || requestProtocolForPath(input.path) !== "anthropic_messages") {
    return undefined;
  }
  const body = parseJsonObjectSafe(input.body);
  if (!body || claudeCodeWebSearchToolResultTexts(body).length === 0) {
    return undefined;
  }
  const toolName = fusionWebSearchToolNameForRequest(input.config, stringValue(body.model) || input.routedModel);
  if (!toolName) {
    return undefined;
  }
  return {
    queryHint: extractClaudeCodeWebSearchToolResultQuery(body) || extractAnthropicWebSearchQueryHint(body),
    sinceMs: input.sinceMs,
    toolName
  };
}



export function prepareHostedWebSearchProtocolRequestBody(
  body: Buffer | undefined,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint">
): Buffer | undefined {
  if (context.protocol === "anthropic_messages") {
    return prepareAnthropicWebSearchProtocolRequestBody(body, records, context);
  }
  const parsed = parseJsonObjectSafe(body);
  if (!parsed || records.length === 0) {
    return undefined;
  }
  const evidence = hostedWebSearchEvidenceText(records, context.queryHint);
  if (!evidence) {
    return undefined;
  }
  let next: Record<string, unknown> | undefined;
  if (context.protocol === "openai_chat_completions") {
    next = prepareOpenAiChatHostedWebSearchRequestBody(parsed, evidence);
  } else if (context.protocol === "openai_responses") {
    next = prepareOpenAiResponsesHostedWebSearchRequestBody(parsed, evidence);
  } else if (context.protocol === "gemini_generate_content") {
    next = prepareGeminiHostedWebSearchRequestBody(parsed, evidence);
  }
  return next ? serializeJsonBody(next) : undefined;
}



export function prepareAnthropicWebSearchProtocolRequestBody(
  body: Buffer | undefined,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<AnthropicWebSearchProtocolContext, "queryHint">
): Buffer | undefined {
  const parsed = parseJsonObjectSafe(body);
  if (!parsed || records.length === 0) {
    return undefined;
  }
  const evidence = hostedWebSearchEvidenceText(records, context.queryHint);
  if (!evidence) {
    return undefined;
  }
  const next = applyAnthropicWebSearchSynthesisControls(stripAnthropicHostedWebSearchTools({
    ...parsed,
    system: appendAnthropicSystemText(parsed.system, evidence)
  }));
  return serializeJsonBody(next);
}



export function prepareClaudeCodeWebSearchContinuationRequestBody(
  body: Buffer | undefined,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<ClaudeCodeWebSearchContinuationContext, "queryHint">
): Buffer | undefined {
  const parsed = parseJsonObjectSafe(body);
  if (!parsed) {
    return undefined;
  }
  const toolResultTexts = claudeCodeWebSearchToolResultTexts(parsed);
  if (toolResultTexts.length === 0) {
    return undefined;
  }
  const queryHint = context.queryHint || extractClaudeCodeWebSearchToolResultQuery(parsed) || extractAnthropicWebSearchQueryHint(parsed);
  const evidence = claudeCodeWebSearchContinuationEvidenceText(records, queryHint, toolResultTexts);
  if (!evidence) {
    return undefined;
  }
  const next = applyAnthropicWebSearchSynthesisControls(stripClaudeCodeWebSearchContinuationTools({
    ...parsed,
    system: appendAnthropicSystemText(parsed.system, evidence)
  }));
  return serializeJsonBody(next);
}



function applyAnthropicWebSearchSynthesisControls(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  const outputConfig = isRecord(next.output_config) ? { ...next.output_config } : {};
  outputConfig.effort = "low";
  next.output_config = outputConfig;
  delete next.thinking;
  delete next.reasoning;
  return next;
}



function prepareOpenAiChatHostedWebSearchRequestBody(body: Record<string, unknown>, evidence: string): Record<string, unknown> {
  const next = stripOpenAiHostedWebSearchTools({
    ...body,
    messages: appendOpenAiChatSystemText(body.messages, evidence)
  });
  return applyOpenAiHostedWebSearchSynthesisControls(next);
}



function prepareOpenAiResponsesHostedWebSearchRequestBody(body: Record<string, unknown>, evidence: string): Record<string, unknown> {
  const next = stripOpenAiHostedWebSearchTools({
    ...body,
    instructions: appendStringInstruction(body.instructions, evidence)
  });
  return applyOpenAiHostedWebSearchSynthesisControls(next);
}



function prepareGeminiHostedWebSearchRequestBody(body: Record<string, unknown>, evidence: string): Record<string, unknown> {
  return stripGeminiHostedWebSearchTools({
    ...body,
    systemInstruction: appendGeminiSystemInstruction(body.systemInstruction, evidence)
  });
}



function applyOpenAiHostedWebSearchSynthesisControls(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  if (typeof next.reasoning_effort === "string") {
    next.reasoning_effort = "low";
  }
  if (isRecord(next.reasoning)) {
    next.reasoning = { ...next.reasoning, effort: "low" };
  }
  return next;
}



function stripAnthropicHostedWebSearchTools(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) {
    return body;
  }
  const tools = body.tools.filter((tool) => !isAnthropicHostedWebSearchTool(tool));
  if (tools.length === body.tools.length) {
    return body;
  }
  const next = { ...body };
  if (tools.length > 0) {
    next.tools = tools;
  } else {
    delete next.tools;
  }
  const toolChoice = isRecord(next.tool_choice) ? next.tool_choice : undefined;
  const toolChoiceName = stringValue(toolChoice?.name);
  if (tools.length === 0 || toolChoiceName === "web_search") {
    delete next.tool_choice;
  }
  return next;
}



function stripClaudeCodeWebSearchContinuationTools(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) {
    return body;
  }
  const next = { ...body };
  delete next.tools;
  delete next.tool_choice;
  return next;
}



function stripOpenAiHostedWebSearchTools(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  let removedTools = false;
  if (Array.isArray(body.tools)) {
    const tools = body.tools.filter((tool) => !isOpenAiHostedWebSearchTool(tool));
    removedTools = tools.length !== body.tools.length;
    if (tools.length > 0) {
      next.tools = tools;
    } else {
      delete next.tools;
    }
  }
  if (next.web_search_options !== undefined || next.webSearchOptions !== undefined) {
    delete next.web_search_options;
    delete next.webSearchOptions;
    removedTools = true;
  }
  if (removedTools && (!Array.isArray(next.tools) || next.tools.length === 0 || openAiToolChoiceNamesWebSearch(next.tool_choice))) {
    delete next.tool_choice;
    delete next.parallel_tool_calls;
  }
  return next;
}



function stripGeminiHostedWebSearchTools(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) {
    return body;
  }
  let changed = false;
  const tools = body.tools.flatMap((tool) => {
    const transformed = stripGeminiHostedWebSearchTool(tool);
    changed ||= transformed.changed;
    return transformed.value ? [transformed.value] : [];
  });
  if (!changed) {
    return body;
  }
  const next = { ...body };
  if (tools.length > 0) {
    next.tools = tools;
  } else {
    delete next.tools;
  }
  return next;
}



function stripGeminiHostedWebSearchTool(tool: unknown): { changed: boolean; value?: unknown } {
  if (!isRecord(tool)) {
    return { changed: false, value: tool };
  }
  let changed = false;
  const next: Record<string, unknown> = { ...tool };
  for (const key of ["google_search", "googleSearch", "google_search_retrieval", "googleSearchRetrieval"]) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }
  return Object.keys(next).length === 0 ? { changed, value: undefined } : { changed, value: next };
}



function appendAnthropicSystemText(system: unknown, text: string): unknown {
  if (typeof system === "string") {
    return `${system.trimEnd()}\n\n${text}`;
  }
  const block = { text, type: "text" };
  if (Array.isArray(system)) {
    return [...system, block];
  }
  return [block];
}



function appendOpenAiChatSystemText(messages: unknown, text: string): unknown[] {
  const message = { content: text, role: "system" };
  return Array.isArray(messages) ? [message, ...messages] : [message];
}



function appendStringInstruction(value: unknown, text: string): string {
  const existing = rawStringValue(value);
  return existing ? `${existing.trimEnd()}\n\n${text}` : text;
}



function appendGeminiSystemInstruction(value: unknown, text: string): Record<string, unknown> {
  const part = { text };
  if (typeof value === "string") {
    return { parts: [{ text: value }, part] };
  }
  if (isRecord(value)) {
    const parts = Array.isArray(value.parts) ? value.parts : [];
    return {
      ...value,
      parts: [...parts, part]
    };
  }
  return { parts: [part] };
}



function hostedWebSearchEvidenceText(records: BrowserWebSearchProtocolRecord[], queryHint: string | undefined): string {
  const sections = records.flatMap((record, recordIndex) => {
    const resultLines = record.results.slice(0, 8).map((result, resultIndex) => {
      const content = focusedWebSearchContent(result.content, queryHint);
      const details = [
        result.snippet ? `Search snippet: ${result.snippet}` : "",
        content ? `Extracted page content: ${content}` : "",
        result.diagnostics?.length ? `Diagnostics: ${result.diagnostics.join("; ")}` : ""
      ].filter(Boolean).join("\n");
      return [
        `${resultIndex + 1}. ${result.title}`,
        `URL: ${result.url}`,
        details
      ].filter(Boolean).join("\n");
    });
    if (resultLines.length === 0) {
      return [];
    }
    return [
      [
        `Search ${recordIndex + 1}`,
        `Query: ${record.query}`,
        `Engine: ${record.engine}`,
        `Search URL: ${record.searchUrl}`,
        ...resultLines
      ].join("\n\n")
    ];
  });
  if (sections.length === 0) {
    return "";
  }
  return [
    "A hidden in-app browser web search has already been performed for this request.",
    "Use the evidence below to answer the user's question directly in the visible final response, within 5 concise sentences. Do not call another web search tool, do not merely list links, do not expose hidden reasoning, and do not ask the user to open links. If the evidence is insufficient for an exact value, say that clearly and summarize the most relevant findings with source names.",
    queryHint ? `Original search intent: ${queryHint}` : "",
    "Web search evidence:",
    ...sections
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}



function claudeCodeWebSearchContinuationEvidenceText(
  records: BrowserWebSearchProtocolRecord[],
  queryHint: string | undefined,
  toolResultTexts: string[]
): string {
  const browserEvidence = records.length > 0 ? hostedWebSearchEvidenceText(records, queryHint) : "";
  const toolResultEvidence = toolResultTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, 12_000);
  if (!browserEvidence && !toolResultEvidence) {
    return "";
  }
  return [
    "A Claude Code WebSearch tool result has already been returned for this turn.",
    "Answer the user's search question directly in the visible final response. Do not call any tool. Do not merely list links or ask the user to open links. Include the sources you used as markdown links.",
    queryHint ? `Original search intent: ${queryHint}` : "",
    browserEvidence ? `In-app browser extracted evidence:\n\n${browserEvidence}` : "",
    toolResultEvidence ? `Previous WebSearch tool result:\n\n${toolResultEvidence}` : ""
  ].filter(Boolean).join("\n\n");
}



function focusedWebSearchContent(content: string | undefined, queryHint: string | undefined): string | undefined {
  const text = content?.replace(/\s+/g, " ").trim();
  if (!text) {
    return undefined;
  }
  const queryTerms = normalizeSearchComparisonText(queryHint ?? "")
    .split(" ")
    .filter((term) => term.length >= 2);
  const weatherTerms = /天气|weather/i.test(queryHint ?? "")
    ? ["天气", "气温", "温度", "体感", "空气质量", "湿度", "风", "降水", "℃", "晴", "多云", "阴", "雨"]
    : [];
  const terms = uniqueStrings([...queryTerms, ...weatherTerms]);
  const indexes = terms.flatMap((term) => {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    return index >= 0 ? [index] : [];
  });
  if (indexes.length === 0) {
    return text.slice(0, 1_000);
  }
  const center = Math.min(...indexes);
  const start = Math.max(0, center - 300);
  return `${start > 0 ? "..." : ""}${text.slice(start, start + 1_200)}${start + 1_200 < text.length ? "..." : ""}`;
}
