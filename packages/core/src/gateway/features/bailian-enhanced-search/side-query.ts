import { createHash, randomUUID } from "node:crypto";
import type { AppConfig, GatewayProviderConfig } from "@ccr/core/contracts/app";
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";
import type { BrowserWebSearchProtocolResult } from "@ccr/core/gateway/internal/shared";
import { bailianEnhancedSearchHttpStatus, normalizeBailianEnhancedSearchQuery, searchBailianEnhancedWeb } from "@ccr/core/gateway/features/bailian-enhanced-search/mcp";
import { modelRegistryForConfig, providerRuntimeId } from "@ccr/core/routing/model-registry";
import { activeProviderCredentials, providerCredentialApiKey, providerCredentialRuntimeId, sortProviderCredentialsForConfig } from "@ccr/core/providers/runtime-topology";
import { reserveProviderCredentialUsage } from "@ccr/core/providers/credential-pool";

const sideQueryTimeoutMs = 15_000;
const maxResults = 8;
const maxDomainFilters = 64;
const maxDomainFilterLength = 2_048;
const claudeCodeWebSearchQueryPrefix = /^perform\s+a\s+web\s+search\s+for\s+the\s+query:\s*/i;
const searchCredentialCooldownMs = 60_000;
const maxSearchCredentialCooldowns = 1_024;
const searchCredentialCooldowns = new Map<string, number>();

type DomainFilter = { hostname: string; path?: string[] };
export type BailianEnhancedSearchSideQueryContext = {
  provider: GatewayProviderConfig;
  query: string;
  model: string;
  stream: boolean;
  allowedDomains?: DomainFilter[];
  blockedDomains?: DomainFilter[];
  validationError?: string;
};
export type BailianEnhancedSearchSideQueryResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
};

/** Prepare only Claude Code's dedicated WebSearch request, after normal routing. */
export function prepareBailianEnhancedSearchSideQuery(input: {
  config: AppConfig;
  method: string;
  path: string;
  body: Buffer | undefined;
  routedModel?: string;
  requestedModel?: string;
}): BailianEnhancedSearchSideQueryContext | undefined {
  if (input.method.toUpperCase() !== "POST" || !/^\/v1\/messages\/?$/.test(input.path) || !input.body) {
    return undefined;
  }
  if (!input.config.Providers.some((provider) => provider.enabled !== false && provider.enhancedSearch?.enabled === true)) {
    return undefined;
  }
  const routed = input.routedModel === undefined ? undefined : modelRegistryForConfig(input.config).resolve(input.routedModel);
  if (input.routedModel !== undefined && (routed?.kind !== "provider" || routed.provider.enhancedSearch?.enabled !== true)) {
    return undefined;
  }
  let body: unknown;
  try {
    body = JSON.parse(input.body.toString("utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(body) || !isBailianEnhancedSearchSideQueryBody(body)) {
    return undefined;
  }
  const resolved = routed ?? modelRegistryForConfig(input.config).resolve(stringValue(body.model));
  if (resolved?.kind !== "provider" || resolved.provider.enhancedSearch?.enabled !== true) {
    return undefined;
  }
  const query = normalizeBailianEnhancedSearchQuery(stripClaudeCodeWebSearchQueryPrefix(sideQueryUserText(body))) ?? "";
  const context: BailianEnhancedSearchSideQueryContext = {
    provider: resolved.provider,
    query,
    model: input.requestedModel?.trim() || stringValue(body.model) || resolved.model,
    stream: body.stream === true
  };
  const tool = (body.tools as Record<string, unknown>[])[0];
  try {
    if (!query) {
      throw new Error("Web search query must contain at least two characters.");
    }
    if (tool.allowed_domains !== undefined && tool.blocked_domains !== undefined) {
      throw new Error("Use either allowed_domains or blocked_domains, not both.");
    }
    context.allowedDomains = parseDomainFilters(tool.allowed_domains);
    context.blockedDomains = parseDomainFilters(tool.blocked_domains);
    if (tool.max_uses !== undefined && (!Number.isInteger(tool.max_uses) || Number(tool.max_uses) < 1)) {
      throw new Error("Web search max_uses must be a positive integer.");
    }
  } catch (error) {
    context.validationError = error instanceof Error ? error.message : "Invalid web search parameters.";
  }
  return context;
}

/** Execute a bounded reply; the caller owns HTTP lifecycle, auth, limits and logs. */
export async function executeBailianEnhancedSearchSideQuery(
  context: BailianEnhancedSearchSideQueryContext,
  signal?: AbortSignal
): Promise<BailianEnhancedSearchSideQueryResponse> {
  signal?.throwIfAborted();
  if (context.validationError) {
    return sideQueryError(400, "invalid_request_error", context.validationError);
  }
  const credential = searchCredential(context.provider);
  if (!credential) {
    return sideQueryError(503, "api_error", "Bailian enhanced web search has no available API key.");
  }
  let results: BrowserWebSearchProtocolResult[];
  try {
    results = (await searchBailianEnhancedWeb({ apiKey: credential.apiKey, query: context.query, signal, timeoutMs: sideQueryTimeoutMs }))
      .filter((result) => resultMatchesDomains(result, context))
      .slice(0, maxResults)
      .map((result) => ({
        title: result.title.slice(0, 500),
        url: result.url.slice(0, 2_000),
        ...(result.snippet ? { snippet: result.snippet.slice(0, 4_000) } : {})
      }));
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    const status = bailianEnhancedSearchHttpStatus(error);
    if (credential.cooldownKey && (status === 401 || status === 403 || status === 429)) {
      // Search authorization is separate from model access. Do not mark the
      // provider's normal model credential unhealthy or replay this request.
      pruneSearchCredentialCooldowns();
      if (searchCredentialCooldowns.size >= maxSearchCredentialCooldowns) {
        const oldest = searchCredentialCooldowns.keys().next().value;
        if (oldest) searchCredentialCooldowns.delete(oldest);
      }
      searchCredentialCooldowns.set(credential.cooldownKey, Date.now() + searchCredentialCooldownMs);
    }
    return error instanceof Error && error.name === "TimeoutError"
      ? sideQueryError(504, "api_error", "Bailian enhanced web search timed out.")
      : sideQueryError(502, "api_error", "Bailian enhanced web search failed.");
  }
  signal?.throwIfAborted();
  const message = buildSideQueryMessage(context.model, context.query, results);
  return {
    statusCode: 200,
    headers: context.stream
      ? { "cache-control": "no-cache", "content-type": "text/event-stream; charset=utf-8", "x-accel-buffering": "no" }
      : { "content-type": "application/json; charset=utf-8" },
    body: context.stream ? sideQuerySse(message) : JSON.stringify(message)
  };
}

export function isBailianEnhancedSearchSideQueryBody(body: Record<string, unknown>): boolean {
  if (!Array.isArray(body.tools) || body.tools.length !== 1) {
    return false;
  }
  const tool = body.tools[0];
  if (!isRecord(tool) || tool.name !== "web_search" || !/^web_search_\d{8}$/.test(stringValue(tool.type) ?? "")) {
    return false;
  }
  if (!Array.isArray(body.messages) || body.messages.length !== 1) {
    return false;
  }
  const text = sideQueryUserText(body);
  if (!text || !claudeCodeWebSearchQueryPrefix.test(text.trimStart())) {
    return false;
  }
  if (body.tool_choice !== undefined) {
    const choice = body.tool_choice;
    if (!isRecord(choice) || !["auto", "any", "tool"].includes(String(choice.type)) ||
      (choice.type === "tool" && choice.name !== "web_search")) {
      return false;
    }
  }
  return true;
}

function sideQueryUserText(body: Record<string, unknown>): string | undefined {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const message = messages[0];
  if (!isRecord(message) || message.role !== "user") {
    return undefined;
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content) || message.content.some((part) => !isRecord(part) || part.type !== "text" || typeof part.text !== "string")) {
    return undefined;
  }
  return message.content.map((part) => part.text).join("\n");
}

export function stripClaudeCodeWebSearchQueryPrefix(query: string | undefined): string | undefined {
  return query?.trimStart().replace(claudeCodeWebSearchQueryPrefix, "");
}

function searchCredential(provider: GatewayProviderConfig): { apiKey: string; cooldownKey?: string } | undefined {
  pruneSearchCredentialCooldowns();
  const dedicated = provider.enhancedSearch?.apiKey?.trim();
  if (dedicated) {
    return { apiKey: dedicated };
  }
  // An explicit pool never falls back to a disabled, stale or saturated key.
  if (provider.credentials?.length) {
    const credentials = sortProviderCredentialsForConfig(activeProviderCredentials(provider));
    for (const credential of credentials) {
      const apiKey = providerCredentialApiKey(credential);
      const cooldownKey = createHash("sha256")
        .update(JSON.stringify([providerRuntimeId(provider), providerCredentialRuntimeId(provider, credential), apiKey]))
        .digest("hex");
      if (!searchCredentialCooldowns.has(cooldownKey) && reserveProviderCredentialUsage(provider, credential, { totalTokens: 0, imageCount: 0 })) {
        return { apiKey, cooldownKey };
      }
    }
    return undefined;
  }
  const apiKey = provider.apikey?.trim() || provider.apiKey?.trim() || provider.api_key?.trim();
  return apiKey ? { apiKey } : undefined;
}

function pruneSearchCredentialCooldowns(): void {
  const now = Date.now();
  for (const [key, until] of searchCredentialCooldowns) {
    if (until <= now) searchCredentialCooldowns.delete(key);
  }
}

function parseDomainFilters(value: unknown): DomainFilter[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("Web search domain filters must be arrays of domains without a URL scheme.");
  }
  if (value.length > maxDomainFilters) {
    throw new Error("Web search domain filters must contain at most 64 entries.");
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || !entry || entry.length > maxDomainFilterLength || /[^\x21-\x7e]|[?#@\\:]/.test(entry)) {
      throw new Error("Invalid web search domain filter.");
    }
    const slash = entry.indexOf("/");
    const hostname = (slash < 0 ? entry : entry.slice(0, slash)).toLowerCase().replace(/\.$/, "");
    if (!hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
      throw new Error("Invalid web search domain filter.");
    }
    const path = slash < 0 ? undefined : entry.slice(slash);
    return {
      hostname,
      ...(path ? { path: path.split("*") } : {})
    };
  });
}

function matchesDomainPath(pathname: string, parts: string[]): boolean {
  // Paths match prefixes. Find literal segments in order without regex backtracking.
  if (!pathname.startsWith(parts[0])) return false;
  let offset = parts[0].length;
  for (let index = 1; index < parts.length; index++) {
    const position = pathname.indexOf(parts[index], offset);
    if (position < 0) return false;
    offset = position + parts[index].length;
  }
  return true;
}

function resultMatchesDomains(result: BrowserWebSearchProtocolResult, context: BailianEnhancedSearchSideQueryContext): boolean {
  let url: URL;
  try {
    url = new URL(result.url);
  } catch {
    return false;
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    return false;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const matches = (filter: DomainFilter) =>
    (hostname === filter.hostname || hostname.endsWith(`.${filter.hostname}`)) && (!filter.path || matchesDomainPath(url.pathname, filter.path));
  return (!context.allowedDomains?.length || context.allowedDomains.some(matches)) && !context.blockedDomains?.some(matches);
}

function buildSideQueryMessage(model: string, query: string, results: BrowserWebSearchProtocolResult[]) {
  const toolUseId = `srvtoolu_ws_${randomUUID().replaceAll("-", "")}`;
  const content: Record<string, unknown>[] = [{
    id: toolUseId, input: { query }, name: "web_search", type: "server_tool_use"
  }, {
    content: results.map((result) => ({ type: "web_search_result", title: result.title, url: result.url })),
    tool_use_id: toolUseId,
    type: "web_search_tool_result"
  }, {
    // This bridge is for isolated Claude Code searches, not Anthropic's opaque
    // encrypted result continuation protocol. Keep evidence in ordinary text.
    text: sideQueryTextSummary(query, results),
    type: "text"
  }];
  return {
    content,
    id: `msg_ws_${randomUUID().replaceAll("-", "")}`,
    model,
    role: "assistant",
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 1 } }
  };
}

function sideQueryTextSummary(query: string, results: BrowserWebSearchProtocolResult[]): string {
  if (results.length === 0) {
    return `No search results found for: ${query}`;
  }
  return [`Here are the search results for "${query}":`, "", ...results.flatMap((result, index) => [
    `${index + 1}. **${result.title}**`, `   ${result.url}`, ...(result.snippet ? [`   ${result.snippet}`] : []), ""
  ])].join("\n");
}

function sideQuerySse(message: ReturnType<typeof buildSideQueryMessage>): string {
  const events: string[] = [];
  const push = (type: string, data: Record<string, unknown>) => events.push(`event: ${type}\ndata: ${JSON.stringify({ ...data, type })}\n\n`);
  push("message_start", { message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } } });
  message.content.forEach((block, index) => {
    const start = block.type === "text" ? { ...block, text: "" }
      : block.type === "server_tool_use" ? { ...block, input: {} } : block;
    push("content_block_start", { content_block: start, index });
    if (block.type === "text") {
      push("content_block_delta", { delta: { text: block.text, type: "text_delta" }, index });
    } else if (block.type === "server_tool_use") {
      push("content_block_delta", { delta: { partial_json: JSON.stringify(block.input), type: "input_json_delta" }, index });
    }
    push("content_block_stop", { index });
  });
  push("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 0, server_tool_use: { web_search_requests: 1 } } });
  push("message_stop", {});
  return events.join("");
}

function sideQueryError(statusCode: number, type: string, message: string): BailianEnhancedSearchSideQueryResponse {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ error: { message, type }, type: "error" }), error: message };
}
