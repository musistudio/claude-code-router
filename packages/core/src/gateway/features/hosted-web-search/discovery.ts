import type { AppConfig, GatewayProviderProtocol } from "@ccr/core/contracts/app";
import { isRecord, numberValue, stringListValue, stringValue } from "@ccr/core/gateway/internal/value";
import { normalizeCoreGatewayVirtualModelProfiles } from "@ccr/core/gateway/core-runtime/config-compiler";
import { fusionModelNameFromSelector, readFusionWebSearchConfig, withCodexCompatibleVirtualModelProfiles, withFusionVirtualModelAliases } from "@ccr/core/mcp/fusion-config";
import type { AnthropicWebSearchProtocolContext, BrowserWebSearchMcpIntegration, BrowserWebSearchProtocolRecord, ClaudeCodeWebSearchContinuationContext, HostedWebSearchProtocolContext } from "@ccr/core/gateway/internal/shared";
import { clampNumber, uniqueStrings } from "@ccr/core/gateway/internal/collections";
import { queryMatchScore } from "@ccr/core/gateway/features/hosted-web-search/evidence";



function hasAnthropicHostedWebSearchTool(tools: unknown): boolean {
  if (!Array.isArray(tools)) {
    return false;
  }
  return tools.some(isAnthropicHostedWebSearchTool);
}



export function hasHostedWebSearchDeclaration(body: Record<string, unknown>, protocol: GatewayProviderProtocol): boolean {
  if (protocol === "anthropic_messages") {
    return hasAnthropicHostedWebSearchTool(body.tools);
  }
  if (protocol === "openai_chat_completions" || protocol === "openai_responses") {
    return hasOpenAiHostedWebSearchDeclaration(body);
  }
  if (protocol === "gemini_generate_content") {
    return hasGeminiHostedWebSearchTool(body.tools);
  }
  return false;
}



function hasOpenAiHostedWebSearchDeclaration(body: Record<string, unknown>): boolean {
  if (body.web_search_options !== undefined || body.webSearchOptions !== undefined) {
    return true;
  }
  return Array.isArray(body.tools) && body.tools.some(isOpenAiHostedWebSearchTool);
}



function hasGeminiHostedWebSearchTool(tools: unknown): boolean {
  if (!Array.isArray(tools)) {
    return false;
  }
  return tools.some((tool) => {
    if (!isRecord(tool)) {
      return false;
    }
    if (tool.google_search !== undefined || tool.googleSearch !== undefined || tool.google_search_retrieval !== undefined || tool.googleSearchRetrieval !== undefined) {
      return true;
    }
    return false;
  });
}



export function isAnthropicHostedWebSearchTool(tool: unknown): boolean {
  if (!isRecord(tool)) {
    return false;
  }
  return anthropicHostedWebSearchType(stringValue(tool.type));
}



export function isOpenAiHostedWebSearchTool(tool: unknown): boolean {
  if (!isRecord(tool)) {
    return false;
  }
  return openAiHostedWebSearchType(stringValue(tool.type));
}



export function openAiToolChoiceNamesWebSearch(value: unknown): boolean {
  if (typeof value === "string") {
    return openAiHostedWebSearchType(value);
  }
  if (!isRecord(value)) {
    return false;
  }
  return openAiHostedWebSearchType(stringValue(value.type));
}



function anthropicHostedWebSearchType(value: string | undefined): boolean {
  const normalized = normalizedToolProtocolName(value);
  return normalized === "web_search" || normalized === "web_search_20250305";
}



function openAiHostedWebSearchType(value: string | undefined): boolean {
  const normalized = normalizedToolProtocolName(value);
  return normalized === "web_search" ||
    normalized === "web_search_preview" ||
    normalized.startsWith("web_search_preview_");
}



function normalizedToolProtocolName(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[-.]/g, "_") ?? "";
}



function readAnthropicWebSearchMaxUses(tools: unknown): number | undefined {
  if (!Array.isArray(tools)) {
    return undefined;
  }
  const tool = tools.find((item) => isRecord(item) && stringValue(item.type)?.toLowerCase() === "web_search_20250305");
  return isRecord(tool) ? numberValue(tool.max_uses ?? tool.maxUses) : undefined;
}



export function readHostedWebSearchMaxUses(body: Record<string, unknown>, protocol: GatewayProviderProtocol): number | undefined {
  if (protocol === "anthropic_messages") {
    return readAnthropicWebSearchMaxUses(body.tools);
  }
  if (protocol === "openai_chat_completions" || protocol === "openai_responses") {
    const tool = Array.isArray(body.tools) ? body.tools.find(isOpenAiHostedWebSearchTool) : undefined;
    return isRecord(tool) ? numberValue(tool.max_uses ?? tool.maxUses) : undefined;
  }
  return undefined;
}



export function extractHostedWebSearchQueryHint(body: Record<string, unknown>, protocol: GatewayProviderProtocol): string | undefined {
  if (protocol === "anthropic_messages") {
    return extractAnthropicWebSearchQueryHint(body);
  }
  if (protocol === "openai_chat_completions") {
    return normalizedWebSearchQueryHintFromParts(textPartsFromOpenAiChatMessages(body.messages));
  }
  if (protocol === "openai_responses") {
    return normalizedWebSearchQueryHintFromParts(textPartsFromOpenAiResponsesInput(body.input));
  }
  if (protocol === "gemini_generate_content") {
    return normalizedWebSearchQueryHintFromParts(textPartsFromGeminiContents(body.contents));
  }
  return undefined;
}



export function extractAnthropicWebSearchQueryHint(body: Record<string, unknown>): string | undefined {
  const userTexts = Array.isArray(body.messages)
    ? body.messages.flatMap((message) => {
        if (!isRecord(message) || stringValue(message.role) !== "user") {
          return [];
        }
        return textPartsFromAnthropicContent(message.content);
      })
    : [];
  return normalizedWebSearchQueryHintFromParts(userTexts);
}



export function extractClaudeCodeWebSearchToolResultQuery(body: Record<string, unknown>): string | undefined {
  for (const text of claudeCodeWebSearchToolResultTexts(body)) {
    const quoted = /Web search results for query:\s*"([^"]+)"/i.exec(text);
    if (quoted?.[1]) {
      return normalizedWebSearchQueryHint(quoted[1]);
    }
    const unquoted = /Web search results for query:\s*([^\n]+)/i.exec(text);
    if (unquoted?.[1]) {
      return normalizedWebSearchQueryHint(unquoted[1].replace(/^["']|["']$/g, ""));
    }
  }
  return undefined;
}



function normalizedWebSearchQueryHintFromParts(parts: string[]): string | undefined {
  const candidates = parts
    .map((part) => part.trim())
    .filter(Boolean);
  for (const candidate of [...candidates].reverse()) {
    const explicit = extractExplicitWebSearchQuery(candidate);
    if (explicit) {
      return normalizedWebSearchQueryHint(explicit);
    }
  }
  for (const candidate of [...candidates].reverse()) {
    if (isRuntimeContextText(candidate)) {
      continue;
    }
    return normalizedWebSearchQueryHint(stripSearchIntentPrefix(candidate));
  }
  return normalizedWebSearchQueryHint(candidates.join("\n"));
}



function normalizedWebSearchQueryHint(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const joined = value.trim();
  if (!joined) {
    return undefined;
  }
  return joined.trim().slice(0, 500);
}



function extractExplicitWebSearchQuery(value: string): string | undefined {
  const explicit = /perform\s+a\s+web\s+search\s+for\s+the\s+query:\s*([\s\S]+)$/i.exec(value.trim());
  return normalizedWebSearchQueryHint(explicit?.[1]);
}



function stripSearchIntentPrefix(value: string): string {
  const trimmed = value.trim();
  const match = /^(?:请)?(?:帮我)?(?:搜索|查询|查一下|帮我查一下|搜一下)\s*[:：]?\s*([\s\S]+)$/i.exec(trimmed);
  return (match?.[1] || trimmed).trim();
}



function isRuntimeContextText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/^<(?:environment_context|permissions instructions|collaboration_mode|skills_instructions|plugins_instructions|apps_instructions)>/i.test(trimmed)) {
    return true;
  }
  return (
    trimmed.includes("<workspace_roots>") ||
    trimmed.includes("<permission_profile") ||
    trimmed.includes("<filesystem>") ||
    trimmed.includes("<current_date>") ||
    trimmed.includes("<writable_roots>")
  );
}



function textPartsFromAnthropicContent(content: unknown): string[] {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((part) => isRecord(part) && typeof part.text === "string" ? [part.text] : []);
}



export function claudeCodeWebSearchToolResultTexts(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.messages)) {
    return [];
  }
  const lastMessage = body.messages.at(-1);
  if (!isRecord(lastMessage) || stringValue(lastMessage.role) !== "user" || !Array.isArray(lastMessage.content)) {
    return [];
  }
  const latestToolResults = lastMessage.content.filter((part) => isRecord(part) && stringValue(part.type) === "tool_result");
  if (latestToolResults.length === 0) {
    return [];
  }
  const webSearchToolUseIds = new Set<string>();
  for (let index = body.messages.length - 2; index >= 0; index -= 1) {
    const message = body.messages[index];
    if (!isRecord(message) || stringValue(message.role) !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (!isRecord(part) || stringValue(part.type) !== "tool_use" || stringValue(part.name)?.toLowerCase() !== "websearch") {
        continue;
      }
      const id = stringValue(part.id);
      if (id) {
        webSearchToolUseIds.add(id);
      }
    }
    break;
  }
  if (webSearchToolUseIds.size === 0) {
    return [];
  }
  const texts: string[] = [];
  for (const part of latestToolResults) {
    if (!isRecord(part)) {
      continue;
    }
    const toolUseId = stringValue(part.tool_use_id);
    if (!toolUseId || !webSearchToolUseIds.has(toolUseId)) {
      continue;
    }
    const text = anthropicToolResultContentText(part.content);
    if (text) {
      texts.push(text);
    }
  }
  return texts;
}



function anthropicToolResultContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.flatMap((part) => {
    if (!isRecord(part)) {
      return [];
    }
    const type = stringValue(part.type);
    if (type === "text" || type === "input_text" || type === "output_text") {
      const text = stringValue(part.text);
      return text ? [text] : [];
    }
    return [];
  }).join("\n");
}



function textPartsFromOpenAiChatMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.flatMap((message) => {
    if (!isRecord(message) || stringValue(message.role)?.toLowerCase() !== "user") {
      return [];
    }
    return textPartsFromOpenAiContent(message.content);
  });
}



function textPartsFromOpenAiContent(content: unknown): string[] {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((part) => {
    if (!isRecord(part)) {
      return [];
    }
    const type = stringValue(part.type);
    if (type === "text" || type === "input_text" || type === "output_text") {
      return stringValue(part.text) ? [stringValue(part.text) as string] : [];
    }
    return [];
  });
}



function textPartsFromOpenAiResponsesInput(input: unknown): string[] {
  if (typeof input === "string") {
    return [input];
  }
  if (!Array.isArray(input)) {
    return [];
  }
  return input.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const role = stringValue(item.role)?.toLowerCase();
    if (role && role !== "user") {
      return [];
    }
    return textPartsFromOpenAiContent(item.content);
  });
}



function textPartsFromGeminiContents(contents: unknown): string[] {
  if (!Array.isArray(contents)) {
    return [];
  }
  return contents.flatMap((content) => {
    if (!isRecord(content)) {
      return [];
    }
    const role = stringValue(content.role)?.toLowerCase();
    if (role && role !== "user") {
      return [];
    }
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.flatMap((part) => isRecord(part) && typeof part.text === "string" ? [part.text] : []);
  });
}



export function fusionWebSearchToolNameForRequest(config: AppConfig, model: string | undefined): string | undefined {
  const normalizedModel = model ? fusionModelNameFromSelector(model) : "";
  for (const candidate of fusionWebSearchToolCandidates(config)) {
    if (!normalizedModel || candidate.aliases.some((alias) => fusionModelNameFromSelector(alias).toLowerCase() === normalizedModel.toLowerCase())) {
      return candidate.toolName;
    }
  }
  return undefined;
}



function fusionWebSearchToolCandidates(config: AppConfig): Array<{ aliases: string[]; toolName: string }> {
  const rawProfiles = Array.isArray(config.virtualModelProfiles) ? config.virtualModelProfiles : [];
  const profiles = normalizeCoreGatewayVirtualModelProfiles(
    withCodexCompatibleVirtualModelProfiles(withFusionVirtualModelAliases(rawProfiles)),
    config
  );
  const candidates: Array<{ aliases: string[]; toolName: string }> = [];
  for (const profile of profiles) {
    if (!isRecord(profile) || profile.enabled === false) {
      continue;
    }
    const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
    const fusionWebSearch = isRecord(metadata?.fusionWebSearch) ? metadata.fusionWebSearch : undefined;
    const webSearchConfig = readFusionWebSearchConfig(fusionWebSearch);
    if (!webSearchConfig?.toolName) {
      continue;
    }
    const match = isRecord(profile.match) ? profile.match : undefined;
    const aliases = uniqueStrings([
      stringValue(profile.id),
      stringValue(profile.key),
      stringValue(profile.displayName),
      ...stringListValue(match?.exactAliases)
    ].filter((item): item is string => Boolean(item)));
    candidates.push({ aliases, toolName: webSearchConfig.toolName });
  }
  return candidates;
}



export async function selectHostedWebSearchProtocolRecords(
  context: HostedWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration
): Promise<BrowserWebSearchProtocolRecord[]> {
  const records = [
    ...(context.records ?? []),
    ...(integration.recentBrowserWebSearchResults?.({ sinceMs: context.sinceMs, toolName: context.toolName }) ?? [])
  ]
    .filter((record) => record.results.length > 0)
    .filter(uniqueSearchRecordFilter())
    .sort((left, right) => {
      const queryScoreDelta = queryMatchScore(context.queryHint, right.query) - queryMatchScore(context.queryHint, left.query);
      return queryScoreDelta || left.completedAtMs - right.completedAtMs;
    });
  if (records.length > 0) {
    return records.slice(0, 8);
  }
  if (!context.queryHint || !integration.runBrowserWebSearch) {
    return [];
  }
  const record = await integration.runBrowserWebSearch({
    count: Math.trunc(clampNumber(context.maxUses ?? 5, 1, 10)),
    prompt: context.queryHint,
    timeoutMs: 30_000,
    toolName: context.toolName
  });
  return record?.results.length ? [record] : [];
}



export function selectClaudeCodeWebSearchContinuationRecords(
  context: ClaudeCodeWebSearchContinuationContext,
  integration: BrowserWebSearchMcpIntegration
): BrowserWebSearchProtocolRecord[] {
  const records = integration.recentBrowserWebSearchResults?.({
    sinceMs: context.sinceMs,
    toolName: context.toolName
  }) ?? [];
  return records
    .filter((record) => record.results.length > 0)
    .filter(uniqueSearchRecordFilter())
    .sort((left, right) => {
      const queryScoreDelta = queryMatchScore(context.queryHint, right.query) - queryMatchScore(context.queryHint, left.query);
      return queryScoreDelta || right.completedAtMs - left.completedAtMs;
    })
    .slice(0, 3);
}



async function selectAnthropicWebSearchProtocolRecords(
  context: AnthropicWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration
): Promise<BrowserWebSearchProtocolRecord[]> {
  return selectHostedWebSearchProtocolRecords(context, integration);
}



function uniqueSearchRecordFilter(): (record: BrowserWebSearchProtocolRecord) => boolean {
  const seen = new Set<string>();
  return (record) => {
    const key = `${record.toolName}\n${record.query}\n${record.searchUrl}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  };
}

