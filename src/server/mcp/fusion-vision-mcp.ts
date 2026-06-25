import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fetchWithSystemProxy } from "../../main/system-proxy-fetch";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonRpcRequest = {
  id?: null | number | string;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | {
      id: null | number | string;
      jsonrpc: "2.0";
      result: JsonValue;
    }
  | {
      error: {
        code: number;
        data?: JsonValue;
        message: string;
      };
      id: null | number | string;
      jsonrpc: "2.0";
    };

type ToolCallResult = {
  content: Array<{ text: string; type: "text" }>;
  isError?: boolean;
};

type FusionBuiltinToolKind = "vision" | "web_search";
type SearchProvider = "auto" | "bing" | "brave" | "exa" | "google_cse" | "serpapi" | "serper" | "tavily";
type SearchInput = {
  count: number;
  country?: string;
  excludeDomains: string[];
  freshness?: string;
  includeDomains: string[];
  includeRaw: boolean;
  language?: string;
  prompt: string;
  safeSearch?: string;
  timeoutMs: number;
};
type SearchResult = {
  snippet?: string;
  title?: string;
  url?: string;
};

const protocolVersion = "2024-11-05";
const defaultVisionBaseUrl = "https://api.openai.com/v1";
const defaultVisionModel = "gpt-4o-mini";
const defaultTimeoutMs = 30000;
const maxLocalImageBytes = 20 * 1024 * 1024;

const toolKind = parseToolKind(env("FUSION_BUILTIN_TOOL_KIND"));
const toolName = env("FUSION_TOOL_NAME") || env("FUSION_VISION_TOOL_NAME") || (toolKind === "web_search" ? "web_search" : "vision_understand");
const toolTitle = env("FUSION_TOOL_TITLE") || env("FUSION_VISION_TOOL_TITLE") || (toolKind === "web_search" ? "Fusion Web Search" : "Fusion Vision Understand");

const visionTool = {
  description: "Analyze one or more images with this Fusion profile's configured OpenAI-compatible vision model.",
  inputSchema: objectSchema({
    detail: { enum: ["auto", "low", "high"], type: "string" },
    imageBase64: { description: "Single raw base64 image payload or data URL.", type: "string" },
    imagePath: { description: "Single local image path.", type: "string" },
    imageUrl: { description: "Single HTTP(S) image URL or data URL.", type: "string" },
    images: {
      items: objectSchema({
        base64: { type: "string" },
        label: { type: "string" },
        mimeType: { type: "string" },
        path: { type: "string" },
        url: { type: "string" }
      }),
      type: "array"
    },
    prompt: { description: "Task instruction for image analysis.", type: "string" },
    systemPrompt: { type: "string" },
    timeoutMs: { minimum: 100, type: "number" }
  }, ["prompt"]),
  name: toolName,
  title: toolTitle
};

const webSearchTool = {
  description: "Search the web with this Fusion profile's configured search provider.",
  inputSchema: objectSchema({
    count: { maximum: 20, minimum: 1, type: "number" },
    country: { type: "string" },
    excludeDomains: { items: { type: "string" }, type: "array" },
    freshness: { enum: ["day", "week", "month"], type: "string" },
    includeDomains: { items: { type: "string" }, type: "array" },
    includeRaw: { type: "boolean" },
    language: { type: "string" },
    prompt: { description: "Natural-language search query.", type: "string" },
    safeSearch: { enum: ["off", "moderate", "strict"], type: "string" },
    timeoutMs: { minimum: 100, type: "number" }
  }, ["prompt"]),
  name: toolName,
  title: toolTitle
};

const activeTool = toolKind === "web_search" ? webSearchTool : visionTool;

let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  drainInputBuffer().catch((error) => {
    writeJsonRpc(jsonRpcError(null, -32603, formatError(error)));
  });
});

process.stdin.resume();

async function drainInputBuffer(): Promise<void> {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return;
    }

    const headerText = inputBuffer.subarray(0, headerEnd).toString("utf8");
    const lengthMatch = headerText.match(/content-length:\s*(\d+)/i);
    if (!lengthMatch) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      writeJsonRpc(jsonRpcError(null, -32600, "Missing Content-Length header."));
      continue;
    }

    const contentLength = Number(lengthMatch[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) {
      return;
    }

    const message = inputBuffer.subarray(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);
    let payload: unknown;
    try {
      payload = JSON.parse(message) as unknown;
    } catch (error) {
      writeJsonRpc(jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`));
      continue;
    }

    const response = await handleJsonRpcRequest(payload);
    if (response) {
      writeJsonRpc(response);
    }
  }
}

async function handleJsonRpcRequest(payload: unknown): Promise<JsonRpcResponse | undefined> {
  if (!isRecord(payload)) {
    return jsonRpcError(null, -32600, "JSON-RPC request must be an object.");
  }

  const request = payload as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.id === undefined && request.method?.startsWith("notifications/")) {
    return undefined;
  }
  if (request.jsonrpc !== "2.0" || !request.method) {
    return jsonRpcError(id, -32600, "Invalid JSON-RPC 2.0 request.");
  }

  try {
    switch (request.method) {
      case "initialize":
        return jsonRpcResult(id, {
          capabilities: {
            tools: {}
          },
          protocolVersion,
          serverInfo: {
            name: "ccr-fusion-builtins",
            title: "CCR Fusion Builtins",
            version: "1.0.0"
          }
        });
      case "ping":
        return jsonRpcResult(id, {});
      case "tools/list":
        return jsonRpcResult(id, { tools: [activeTool] as unknown as JsonValue });
      case "tools/call":
        return jsonRpcResult(id, await callTool(request.params) as unknown as JsonValue);
      default:
        return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
    }
  } catch (error) {
    return jsonRpcError(id, -32603, formatError(error));
  }
}

async function callTool(params: unknown): Promise<ToolCallResult> {
  if (!isRecord(params) || typeof params.name !== "string") {
    throw new Error("tools/call params must include a tool name.");
  }
  if (params.name !== toolName) {
    throw new Error(`Unknown fusion tool: ${params.name}`);
  }

  const args = isRecord(params.arguments) ? params.arguments : {};
  try {
    const text = toolKind === "web_search" ? await analyzeWebSearch(args) : await analyzeVision(args);
    return textResult(text);
  } catch (error) {
    return {
      ...textResult(formatError(error)),
      isError: true
    };
  }
}

async function analyzeVision(args: Record<string, unknown>): Promise<string> {
  const prompt = readString(args.prompt);
  if (!prompt) {
    throw new Error(`${toolName} requires prompt.`);
  }

  const gatewayBaseUrl = env("VISION_GATEWAY_BASE_URL");
  const baseUrl = gatewayBaseUrl || env("VISION_BASE_URL") || env("OPENAI_BASE_URL") || defaultVisionBaseUrl;
  const apiKey = gatewayBaseUrl ? env("VISION_GATEWAY_API_KEY") : env("VISION_API_KEY") || env("OPENAI_API_KEY");
  if (!gatewayBaseUrl && !apiKey) {
    throw new Error("Missing vision API key. Set VISION_API_KEY.");
  }
  const model = env("VISION_MODEL") || env("OPENAI_MODEL") || defaultVisionModel;
  const detail = readString(args.detail);
  const imageParts = await buildImageParts(args, detail === "low" || detail === "high" ? detail : "auto");
  if (imageParts.length === 0) {
    throw new Error(`${toolName} requires imageUrl, imagePath, imageBase64, or images.`);
  }

  const systemPrompt = readString(args.systemPrompt);
  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...imageParts
      ]
    }
  ];
  const timeoutMs = clampInteger(readNumber(args.timeoutMs) ?? readNumber(env("VISION_TIMEOUT_MS")) ?? defaultTimeoutMs, 100, 600000);
  const response = await fetchWithSystemProxy(resolveChatCompletionsUrl(baseUrl), {
    body: JSON.stringify({ model, messages }),
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      "content-type": "application/json"
    },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs)
  });
  const rawText = await response.text();
  const payload = parseJson(rawText);
  if (!response.ok) {
    throw new Error(`Vision request failed (${response.status}): ${extractProviderError(rawText, payload)}`);
  }

  return extractResponseText(payload) || rawText;
}

async function analyzeWebSearch(args: Record<string, unknown>): Promise<string> {
  const prompt = readString(args.prompt);
  if (!prompt) {
    throw new Error(`${toolName} requires prompt.`);
  }

  const provider = resolveSearchProvider();
  const count = clampInteger(readNumber(args.count) ?? readNumber(env("SEARCH_RESULT_COUNT")) ?? 5, 1, 20);
  const timeoutMs = clampInteger(readNumber(args.timeoutMs) ?? readNumber(env("SEARCH_TIMEOUT_MS")) ?? defaultTimeoutMs, 100, 600000);
  const input = {
    count,
    country: readString(args.country),
    excludeDomains: readStringArray(args.excludeDomains),
    freshness: readString(args.freshness),
    includeDomains: readStringArray(args.includeDomains),
    includeRaw: args.includeRaw === true,
    language: readString(args.language),
    prompt,
    safeSearch: readString(args.safeSearch),
    timeoutMs
  };
  const results = await searchWithProvider(provider, input);
  if (results.length === 0) {
    return `Search provider: ${provider}\nNo results.`;
  }
  return [
    `Search provider: ${provider}`,
    ...results.slice(0, count).map((result, index) => [
      `${index + 1}. ${result.title || result.url || "Untitled"}`,
      result.url ? `URL: ${result.url}` : "",
      result.snippet ? `Snippet: ${result.snippet}` : ""
    ].filter(Boolean).join("\n"))
  ].join("\n\n");
}

async function searchWithProvider(
  provider: Exclude<SearchProvider, "auto">,
  input: {
    count: number;
    country?: string;
    excludeDomains: string[];
    freshness?: string;
    includeDomains: string[];
    includeRaw: boolean;
    language?: string;
    prompt: string;
    safeSearch?: string;
    timeoutMs: number;
  }
): Promise<Array<{ snippet?: string; title?: string; url?: string }>> {
  if (provider === "brave") return searchBrave(input);
  if (provider === "bing") return searchBing(input);
  if (provider === "google_cse") return searchGoogleCse(input);
  if (provider === "serper") return searchSerper(input);
  if (provider === "serpapi") return searchSerpApi(input);
  if (provider === "tavily") return searchTavily(input);
  return searchExa(input);
}

async function searchBrave(input: SearchInput): Promise<SearchResult[]> {
  const apiKey = requireEnv("BRAVE_SEARCH_API_KEY", "Brave Search API key");
  const url = new URL(env("BRAVE_SEARCH_ENDPOINT") || "https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", scopedSearchQuery(input));
  url.searchParams.set("count", String(input.count));
  if (input.country) url.searchParams.set("country", input.country);
  if (input.language) url.searchParams.set("search_lang", input.language);
  if (input.safeSearch) url.searchParams.set("safesearch", input.safeSearch);
  const raw = await fetchJson(url.toString(), {
    headers: { "x-subscription-token": apiKey },
    signal: AbortSignal.timeout(input.timeoutMs)
  });
  const items = isRecord(raw) && isRecord(raw.web) && Array.isArray(raw.web.results) ? raw.web.results : [];
  return items.map((item) => normalizeSearchResult(item, "title", "url", "description")).filter(isSearchResult);
}

async function searchBing(input: SearchInput): Promise<SearchResult[]> {
  const apiKey = requireEnv("BING_SEARCH_API_KEY", "Bing Web Search API key");
  const url = new URL(env("BING_SEARCH_ENDPOINT") || "https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", scopedSearchQuery(input));
  url.searchParams.set("count", String(input.count));
  if (input.country || input.language) url.searchParams.set("mkt", [input.language, input.country].filter(Boolean).join("-"));
  if (input.safeSearch) url.searchParams.set("safeSearch", input.safeSearch);
  const raw = await fetchJson(url.toString(), {
    headers: { "ocp-apim-subscription-key": apiKey },
    signal: AbortSignal.timeout(input.timeoutMs)
  });
  const items = isRecord(raw) && isRecord(raw.webPages) && Array.isArray(raw.webPages.value) ? raw.webPages.value : [];
  return items.map((item) => normalizeSearchResult(item, "name", "url", "snippet")).filter(isSearchResult);
}

async function searchGoogleCse(input: SearchInput): Promise<SearchResult[]> {
  const apiKey = requireEnv("GOOGLE_SEARCH_API_KEY", "Google Programmable Search API key");
  const cx = requireEnv("GOOGLE_SEARCH_CX", "Google Programmable Search Engine ID");
  const url = new URL(env("GOOGLE_SEARCH_ENDPOINT") || "https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", scopedSearchQuery(input));
  url.searchParams.set("num", String(Math.min(input.count, 10)));
  if (input.country) url.searchParams.set("gl", input.country);
  if (input.language) url.searchParams.set("hl", input.language);
  const raw = await fetchJson(url.toString(), { signal: AbortSignal.timeout(input.timeoutMs) });
  const items = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  return items.map((item) => normalizeSearchResult(item, "title", "link", "snippet")).filter(isSearchResult);
}

async function searchSerper(input: SearchInput): Promise<SearchResult[]> {
  const apiKey = requireEnv("SERPER_API_KEY", "Serper API key");
  const raw = await fetchJson(env("SERPER_SEARCH_ENDPOINT") || "https://google.serper.dev/search", {
    body: JSON.stringify({
      gl: input.country,
      hl: input.language,
      num: input.count,
      q: scopedSearchQuery(input),
      tbs: freshnessToGoogleTbs(input.freshness)
    }),
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey
    },
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs)
  });
  const items = isRecord(raw) && Array.isArray(raw.organic) ? raw.organic : [];
  return items.map((item) => normalizeSearchResult(item, "title", "link", "snippet")).filter(isSearchResult);
}

async function searchSerpApi(input: SearchInput): Promise<SearchResult[]> {
  const apiKey = requireEnv("SERPAPI_API_KEY", "SerpAPI key");
  const url = new URL(env("SERPAPI_SEARCH_ENDPOINT") || "https://serpapi.com/search.json");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", scopedSearchQuery(input));
  url.searchParams.set("num", String(input.count));
  if (input.country) url.searchParams.set("gl", input.country);
  if (input.language) url.searchParams.set("hl", input.language);
  if (input.safeSearch) url.searchParams.set("safe", input.safeSearch === "off" ? "off" : "active");
  const raw = await fetchJson(url.toString(), { signal: AbortSignal.timeout(input.timeoutMs) });
  const items = isRecord(raw) && Array.isArray(raw.organic_results) ? raw.organic_results : [];
  return items.map((item) => normalizeSearchResult(item, "title", "link", "snippet")).filter(isSearchResult);
}

async function searchTavily(input: SearchInput): Promise<SearchResult[]> {
  const apiKey = requireEnv("TAVILY_API_KEY", "Tavily API key");
  const raw = await fetchJson(env("TAVILY_SEARCH_ENDPOINT") || "https://api.tavily.com/search", {
    body: JSON.stringify({
      api_key: apiKey,
      include_raw_content: input.includeRaw,
      max_results: input.count,
      query: scopedSearchQuery(input),
      search_depth: "basic"
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs)
  });
  const items = isRecord(raw) && Array.isArray(raw.results) ? raw.results : [];
  return items.map((item) => normalizeSearchResult(item, "title", "url", "content")).filter(isSearchResult);
}

async function searchExa(input: SearchInput): Promise<SearchResult[]> {
  const apiKey = requireEnv("EXA_API_KEY", "Exa API key");
  const raw = await fetchJson(env("EXA_SEARCH_ENDPOINT") || "https://api.exa.ai/search", {
    body: JSON.stringify({
      numResults: input.count,
      query: scopedSearchQuery(input)
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs)
  });
  const items = isRecord(raw) && Array.isArray(raw.results) ? raw.results : [];
  return items.map((item) => normalizeSearchResult(item, "title", "url", "text")).filter(isSearchResult);
}

async function buildImageParts(args: Record<string, unknown>, detail: "auto" | "high" | "low"): Promise<JsonValue[]> {
  const inputs: Array<{ base64?: string; label?: string; mimeType?: string; path?: string; url?: string }> = [];
  const imageUrl = readString(args.imageUrl);
  const imagePath = readString(args.imagePath);
  const imageBase64 = readString(args.imageBase64);
  if (imageUrl) inputs.push({ url: imageUrl });
  if (imagePath) inputs.push({ path: imagePath });
  if (imageBase64) inputs.push({ base64: imageBase64, mimeType: readString(args.mimeType) });

  const images = Array.isArray(args.images) ? args.images : [];
  for (const item of images) {
    if (!isRecord(item)) {
      continue;
    }
    inputs.push({
      base64: readString(item.base64),
      label: readString(item.label),
      mimeType: readString(item.mimeType),
      path: readString(item.path),
      url: readString(item.url)
    });
  }

  const parts: JsonValue[] = [];
  for (const input of inputs) {
    const url = await imageInputToUrl(input);
    if (!url) {
      continue;
    }
    if (input.label) {
      parts.push({ text: `Image: ${input.label}`, type: "text" });
    }
    parts.push({
      image_url: {
        detail,
        url
      },
      type: "image_url"
    });
  }
  return parts;
}

async function imageInputToUrl(input: { base64?: string; mimeType?: string; path?: string; url?: string }): Promise<string | undefined> {
  if (input.url) {
    return input.url;
  }
  if (input.base64) {
    return toDataUrl(input.base64, input.mimeType || "image/png");
  }
  if (!input.path) {
    return undefined;
  }
  const buffer = await readFile(input.path);
  if (buffer.byteLength > maxLocalImageBytes) {
    throw new Error(`Local image exceeds ${maxLocalImageBytes} bytes: ${input.path}`);
  }
  return toDataUrl(buffer.toString("base64"), input.mimeType || mimeTypeFromPath(input.path));
}

function toDataUrl(value: string, mimeType: string): string {
  return value.startsWith("data:") ? value : `data:${mimeType};base64,${value}`;
}

function mimeTypeFromPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function extractResponseText(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : undefined;
  const message = isRecord(first?.message) ? first.message : undefined;
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((item) => isRecord(item) ? readString(item.text) : undefined)
      .filter((item): item is string => Boolean(item))
      .join("\n");
    return text || undefined;
  }
  return readString(value.output_text);
}

function extractProviderError(rawText: string, json: unknown): string {
  if (isRecord(json)) {
    const error = json.error;
    if (typeof error === "string") return error;
    if (isRecord(error) && typeof error.message === "string") return error.message;
    if (typeof json.message === "string") return json.message;
  }
  return rawText.slice(0, 500);
}

function parseJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(`Invalid JSON from provider: ${rawText.slice(0, 500)}`);
  }
}

function parseToolKind(value: string | undefined): FusionBuiltinToolKind {
  return value === "web_search" ? "web_search" : "vision";
}

function resolveSearchProvider(): Exclude<SearchProvider, "auto"> {
  const configured = parseSearchProvider(env("SEARCH_PROVIDER")) ?? "auto";
  if (configured !== "auto") {
    return configured;
  }
  const candidates: Array<Exclude<SearchProvider, "auto">> = ["brave", "bing", "google_cse", "serper", "serpapi", "tavily", "exa"];
  const provider = candidates.find(searchProviderIsConfigured);
  if (!provider) {
    throw new Error("No search provider configured. Set SEARCH_PROVIDER and its API key.");
  }
  return provider;
}

function parseSearchProvider(value: string | undefined): SearchProvider | undefined {
  if (
    value === "auto" ||
    value === "brave" ||
    value === "bing" ||
    value === "google_cse" ||
    value === "serper" ||
    value === "serpapi" ||
    value === "tavily" ||
    value === "exa"
  ) {
    return value;
  }
  return undefined;
}

function searchProviderIsConfigured(provider: Exclude<SearchProvider, "auto">): boolean {
  if (provider === "brave") return Boolean(env("BRAVE_SEARCH_API_KEY"));
  if (provider === "bing") return Boolean(env("BING_SEARCH_API_KEY"));
  if (provider === "google_cse") return Boolean(env("GOOGLE_SEARCH_API_KEY") && env("GOOGLE_SEARCH_CX"));
  if (provider === "serper") return Boolean(env("SERPER_API_KEY"));
  if (provider === "serpapi") return Boolean(env("SERPAPI_API_KEY"));
  if (provider === "tavily") return Boolean(env("TAVILY_API_KEY"));
  return Boolean(env("EXA_API_KEY"));
}

function requireEnv(name: string, label: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing ${label}. Set ${name}.`);
  }
  return value;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetchWithSystemProxy(url, init);
  const rawText = await response.text();
  const payload = rawText ? parseJson(rawText) : {};
  if (!response.ok) {
    throw new Error(`Search request failed (${response.status}): ${extractProviderError(rawText, payload)}`);
  }
  return payload;
}

function scopedSearchQuery(input: SearchInput): string {
  const include = input.includeDomains.map((domain) => `site:${domain}`).join(" ");
  const exclude = input.excludeDomains.map((domain) => `-site:${domain}`).join(" ");
  return [input.prompt, include, exclude].filter(Boolean).join(" ");
}

function freshnessToGoogleTbs(value: string | undefined): string | undefined {
  if (value === "day") return "qdr:d";
  if (value === "week") return "qdr:w";
  if (value === "month") return "qdr:m";
  return undefined;
}

function normalizeSearchResult(value: unknown, titleKey: string, urlKey: string, snippetKey: string): SearchResult {
  if (!isRecord(value)) {
    return {};
  }
  return {
    snippet: readString(value[snippetKey]),
    title: readString(value[titleKey]),
    url: readString(value[urlKey])
  };
}

function isSearchResult(value: SearchResult): value is Required<Pick<SearchResult, "url">> & SearchResult {
  return Boolean(value.title || value.url || value.snippet);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(readString).filter((item): item is string => Boolean(item));
}

function textResult(text: string): ToolCallResult {
  return {
    content: [{ text, type: "text" }]
  };
}

function objectSchema(properties: Record<string, JsonValue>, required: string[] = []): JsonValue {
  return {
    additionalProperties: false,
    properties,
    required,
    type: "object"
  };
}

function jsonRpcResult(id: null | number | string, result: JsonValue): JsonRpcResponse {
  return {
    id,
    jsonrpc: "2.0",
    result
  };
}

function jsonRpcError(id: null | number | string, code: number, message: string, data?: JsonValue): JsonRpcResponse {
  return {
    error: {
      code,
      ...(data === undefined ? {} : { data }),
      message
    },
    id,
    jsonrpc: "2.0"
  };
}

function writeJsonRpc(response: JsonRpcResponse): void {
  const payload = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function env(name: string): string | undefined {
  return readString(process.env[name]);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
