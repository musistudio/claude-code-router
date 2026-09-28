import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";
import type { BrowserWebSearchProtocolResult } from "@ccr/core/gateway/internal/shared";

export const defaultBailianEnhancedSearchMcpEndpoint = "https://dashscope.aliyuncs.com/api/v1/mcps/EnhancedSearch/mcp";
export const bailianEnhancedSearchEndpointEnv = "BAILIAN_ENHANCED_SEARCH_ENDPOINT";

const bailianEnhancedSearchMcpProtocolVersion = "2024-11-05";
const bailianEnhancedSearchToolName = "search_pro";
const bailianEnhancedSearchMaxQueryLength = 500;
const bailianEnhancedSearchMinQueryLength = 2;

type BailianEnhancedSearchInput = {
  apiKey: string;
  endpoint?: string;
  query: string;
  signal?: AbortSignal;
  timeoutMs: number;
};

class BailianEnhancedSearchError extends Error {
  constructor(message: string, readonly retryable = false, readonly statusCode?: number) {
    super(message);
  }
}

/** Only explicit endpoint HTTP responses identify a rejected search credential. */
export function bailianEnhancedSearchHttpStatus(error: unknown): number | undefined {
  return error instanceof BailianEnhancedSearchError ? error.statusCode : undefined;
}

export function normalizeBailianEnhancedSearchQuery(query: string | undefined): string | undefined {
  const trimmed = query?.trim() ?? "";
  if (trimmed.length < bailianEnhancedSearchMinQueryLength) {
    return undefined;
  }
  return trimmed.slice(0, bailianEnhancedSearchMaxQueryLength);
}

/**
 * Runs one enhanced web search through the Bailian EnhancedSearch MCP endpoint.
 * The endpoint is stateless JSON-RPC over HTTP, but it only serves tools/call
 * after a full initialize/initialized handshake, so every search performs the
 * three-request sequence. One retry covers the observed transient empty 200.
 */
export async function searchBailianEnhancedWeb(input: BailianEnhancedSearchInput): Promise<BrowserWebSearchProtocolResult[]> {
  const query = normalizeBailianEnhancedSearchQuery(input.query);
  if (!query) {
    return [];
  }
  const endpoint = input.endpoint?.trim() ||
    process.env[bailianEnhancedSearchEndpointEnv]?.trim() ||
    defaultBailianEnhancedSearchMcpEndpoint;
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new Error("Bailian enhanced search API key is not configured.");
  }

  // One shared deadline covers the handshake retries, so a hanging first
  // attempt cannot double the worst-case latency of the request path.
  const deadline = AbortSignal.timeout(input.timeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      signal.throwIfAborted();
      return await searchBailianEnhancedWebOnce({ apiKey, endpoint, query, signal });
    } catch (error) {
      if (signal.aborted) {
        throw new DOMException(
          input.signal?.aborted ? "Bailian enhanced search was cancelled." : "Bailian enhanced search timed out.",
          input.signal?.aborted ? "AbortError" : "TimeoutError"
        );
      }
      // Only retry the transient empty 200 observed on this endpoint. Replaying
      // authentication, RPC or tool errors cannot fix them and can duplicate a
      // billable tool call. Never expose upstream error text or fetch URLs.
      if (!(error instanceof BailianEnhancedSearchError)) {
        throw new Error("Bailian enhanced search request failed.");
      }
      if (!error.retryable || attempt === 1) {
        throw error;
      }
    }
  }
  throw new BailianEnhancedSearchError("Bailian enhanced search returned no response.");
}

async function searchBailianEnhancedWebOnce(input: {
  apiKey: string;
  endpoint: string;
  query: string;
  signal: AbortSignal;
}): Promise<BrowserWebSearchProtocolResult[]> {
  const initialize = await postBailianEnhancedSearchRpc(input, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "claude-code-router", version: "1.0.0" },
      protocolVersion: bailianEnhancedSearchMcpProtocolVersion
    }
  }, input.signal);
  if (!isRecord(initialize?.result)) {
    throw new BailianEnhancedSearchError("Bailian enhanced search handshake did not complete.");
  }
  // The server answers notifications/initialized with 202 and an empty body.
  await postBailianEnhancedSearchRpc(input, {
    jsonrpc: "2.0",
    method: "notifications/initialized"
  }, input.signal);
  const call = await postBailianEnhancedSearchRpc(input, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { query: input.query },
      name: bailianEnhancedSearchToolName
    }
  }, input.signal);
  return bailianEnhancedSearchResultsFromToolResult(call);
}

async function postBailianEnhancedSearchRpc(
  input: { apiKey: string; endpoint: string },
  payload: Record<string, unknown>,
  signal: AbortSignal
): Promise<Record<string, unknown> | undefined> {
  signal.throwIfAborted();
  const response = await fetchWithSystemProxy(input.endpoint, {
    body: JSON.stringify(payload),
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json"
    },
    method: "POST",
    signal
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new BailianEnhancedSearchError(`Bailian enhanced search endpoint returned HTTP ${response.status}.`, false, response.status);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  let message: Record<string, unknown> | undefined;
  if (contentType.includes("text/event-stream")) {
    message = await readBailianEnhancedSearchSseMessage(response, payload.id, signal);
  } else {
    const text = await response.text();
    signal.throwIfAborted();
    message = text.trim() ? parseBailianEnhancedSearchRpcJson(text) : undefined;
  }
  if (!message) {
    if (payload.id === undefined) {
      return undefined;
    }
    throw new BailianEnhancedSearchError("Bailian enhanced search endpoint returned an empty response.", response.status === 200);
  }
  if (message.jsonrpc !== "2.0" || (payload.id !== undefined && message.id !== payload.id)) {
    throw new BailianEnhancedSearchError("Bailian enhanced search endpoint returned an unexpected RPC response.");
  }
  if (message.error !== undefined) {
    const code = isRecord(message.error) && typeof message.error.code === "number" && Number.isFinite(message.error.code)
      ? ` (${message.error.code})`
      : "";
    throw new BailianEnhancedSearchError(`Bailian enhanced search RPC failed${code}.`);
  }
  return message;
}

function parseBailianEnhancedSearchRpcJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) {
      throw new BailianEnhancedSearchError("Bailian enhanced search endpoint returned an unexpected payload.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new BailianEnhancedSearchError("Bailian enhanced search endpoint returned an unparseable payload.");
    }
    throw error;
  }
}

async function readBailianEnhancedSearchSseMessage(
  response: Response,
  expectedId: unknown,
  signal: AbortSignal
): Promise<Record<string, unknown> | undefined> {
  const reader = response.body?.getReader();
  if (!reader) {
    return undefined;
  }
  const decoder = new TextDecoder();
  let pending = "";
  let data: string[] = [];
  let hasContent = false;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
      hasContent ||= Boolean(chunk.trim());
      pending += chunk;
      // An SSE event may span chunks and multiple data lines. CR, LF and CRLF
      // are line endings; hold a trailing CR until the next chunk arrives.
      while (pending.length > 0) {
        const ending = /\r\n|\r|\n/.exec(pending);
        if (!ending || (!done && ending[0] === "\r" && ending.index === pending.length - 1)) {
          break;
        }
        const line = pending.slice(0, ending.index);
        pending = pending.slice(ending.index + ending[0].length);
        if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        } else if (line === "" && data.length > 0) {
          const parsed = parseBailianEnhancedSearchRpcJson(data.join("\n"));
          data = [];
          if (parsed.id === expectedId && typeof parsed.method !== "string") {
            return parsed;
          }
        }
      }
      if (done) {
        if (!hasContent) {
          return undefined;
        }
        throw new BailianEnhancedSearchError("Bailian enhanced search stream ended without a matching RPC response.");
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
    // MCP SSE connections may remain open after the response. Stop reading as
    // soon as our id arrives, including when a server sends later notifications.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function bailianEnhancedSearchResultsFromToolResult(value: Record<string, unknown> | undefined): BrowserWebSearchProtocolResult[] {
  const result = value?.result;
  if (!isRecord(result)) {
    throw new BailianEnhancedSearchError("Bailian enhanced search tool call returned no result.");
  }
  const text = bailianEnhancedSearchToolResultText(result);
  if (result.isError === true) {
    throw new BailianEnhancedSearchError("Bailian enhanced search tool call failed.");
  }
  const payload = parseToolResultJson(text);
  if (!isRecord(payload) || !Array.isArray(payload.pages)) {
    throw new BailianEnhancedSearchError("Bailian enhanced search tool returned an unexpected search payload.");
  }
  return payload.pages.map(bailianEnhancedSearchResultFromPage).filter((item): item is BrowserWebSearchProtocolResult => Boolean(item));
}

function bailianEnhancedSearchToolResultText(result: Record<string, unknown>): string | undefined {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .flatMap((part) => isRecord(part) && stringValue(part.type) === "text" && stringValue(part.text) ? [stringValue(part.text)] : [])
    .join("\n")
    .trim();
  return text || undefined;
}

function parseToolResultJson(text: string | undefined): unknown {
  if (!text) {
    throw new BailianEnhancedSearchError("Bailian enhanced search tool returned no search payload.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BailianEnhancedSearchError("Bailian enhanced search tool returned an unparseable search payload.");
  }
}

function bailianEnhancedSearchResultFromPage(page: unknown): BrowserWebSearchProtocolResult | undefined {
  if (!isRecord(page)) {
    return undefined;
  }
  const title = stringValue(page.title) || "";
  const url = stringValue(page.url) || "";
  if (!title && !url) {
    return undefined;
  }
  const snippet = stringValue(page.snippet);
  return {
    ...(snippet ? { snippet } : {}),
    title,
    url
  };
}
