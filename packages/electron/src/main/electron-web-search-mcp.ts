import { BrowserWindow, WebContentsView, app, session, type WebContents } from "electron";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join as pathJoin } from "node:path";
import { backendService } from "@ccr/core/plugins/backend-service";
import type { GatewayMcpServerConfig } from "@ccr/core/contracts/app";
import type {
  BrowserWebSearchMcpIntegration,
  BrowserWebSearchMcpRegistration,
  BrowserWebSearchProtocolRecord
} from "@ccr/core/gateway/service";

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

type BrowserSearchEngine = "bing" | "duckduckgo" | "google";
type BrowserSearchFreshness = "day" | "month" | "week" | "year";

type BrowserSearchInput = {
  after?: string;
  anyTerms: string[];
  before?: string;
  count: number;
  country?: string;
  engine: BrowserSearchEngine;
  exactPhrase?: string;
  excludeDomains: string[];
  excludeTerms: string[];
  freshness?: BrowserSearchFreshness;
  includeDomains: string[];
  includeRaw: boolean;
  keywords: string[];
  language?: string;
  prompt: string;
  safeSearch?: "moderate" | "off" | "strict";
  timeoutMs: number;
};

type BrowserSearchRequest = BrowserSearchInput & {
  query: string;
  searchUrl: string;
};

type BrowserSearchResult = {
  content?: string;
  diagnostics?: string[];
  snippet?: string;
  title: string;
  url: string;
};

type BrowserSearchPageResult = {
  blocked?: string;
  results?: BrowserSearchResult[];
  title?: string;
};

type BrowserSearchResponse = {
  engine: BrowserSearchEngine;
  query: string;
  results: BrowserSearchResult[];
  searchUrl: string;
};

type BrowserSearchWorker = {
  busy: boolean;
  view: WebContentsView;
};

type BrowserSearchQueueEntry = {
  reject: (error: Error) => void;
  resolve: () => void;
};

const ownerId = "ccr-browser-web-search-mcp";
const protocolVersion = "2024-11-05";
const maxMcpRequestBytes = 2 * 1024 * 1024;
const defaultResultCount = 5;
const defaultTimeoutMs = 30_000;
const maxSearchResultCount = 20;
const searchPartition = "persist:ccr-browser-web-search-mcp";
const defaultEngine: BrowserSearchEngine = "bing";
const desktopUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function bundledBrowserWebSearchProxyMcpEntryPath(): string {
  return pathJoin(__dirname, "browser-web-search-proxy-mcp.js");
}

class BrowserWebSearchMcpService implements BrowserWebSearchMcpIntegration {
  private readonly recentResults: BrowserWebSearchProtocolRecord[] = [];
  private readonly servers = new Map<string, BrowserWebSearchToolServer>();
  private readonly searchPool = new HiddenBrowserSearchPool();

  async registerBrowserWebSearchMcpServer(options: BrowserWebSearchMcpRegistration): Promise<GatewayMcpServerConfig | undefined> {
    await app.whenReady();
    const existing = this.servers.get(options.toolName);
    if (existing) {
      return existing.mcpConfig();
    }

    const server = new BrowserWebSearchToolServer(options, this.searchPool, (record) => this.recordSearchResult(record));
    const backend = await backendService.registerHttpBackend(ownerId, {
      handler: (request, response) => server.handleRequest(request, response),
      id: `${ownerId}:${options.name}`
    });
    server.setUrl(`${backend.url}/mcp`);
    this.servers.set(options.toolName, server);
    return server.mcpConfig();
  }

  recentBrowserWebSearchResults(options: { sinceMs: number; toolName?: string }): BrowserWebSearchProtocolRecord[] {
    this.pruneRecentResults();
    return this.recentResults.filter((record) => {
      if (record.completedAtMs < options.sinceMs) {
        return false;
      }
      return !options.toolName || record.toolName === options.toolName;
    });
  }

  async runBrowserWebSearch(options: { count?: number; prompt: string; timeoutMs?: number; toolName?: string }): Promise<BrowserWebSearchProtocolRecord | undefined> {
    const server = options.toolName ? this.servers.get(options.toolName) : this.servers.values().next().value;
    return await server?.searchForProtocolResult(options);
  }

  async stopBrowserWebSearchMcpServers(): Promise<void> {
    this.servers.clear();
    this.recentResults.splice(0);
    await backendService.stopOwner(ownerId);
    this.searchPool.destroy();
  }

  private recordSearchResult(record: BrowserWebSearchProtocolRecord): void {
    this.recentResults.push(record);
    this.pruneRecentResults();
  }

  private pruneRecentResults(): void {
    const cutoff = Date.now() - 5 * 60_000;
    while (this.recentResults.length > 0 && (this.recentResults[0].completedAtMs < cutoff || this.recentResults.length > 50)) {
      this.recentResults.shift();
    }
  }
}

class BrowserWebSearchToolServer {
  private readonly defaultCount: number;
  private readonly defaultEngine: BrowserSearchEngine;
  private readonly defaultLanguage?: string;
  private readonly defaultCountry?: string;
  private readonly defaultSafeSearch?: "moderate" | "off" | "strict";
  private readonly defaultTimeoutMs: number;
  private readonly toolName: string;
  private url = "";

  constructor(
    options: BrowserWebSearchMcpRegistration,
    private readonly searchPool: HiddenBrowserSearchPool,
    private readonly recordSearchResult: (record: BrowserWebSearchProtocolRecord) => void
  ) {
    const env = options.env ?? {};
    this.toolName = options.toolName;
    this.defaultCount = clampInteger(
      options.resultCount ?? readNumber(env.BROWSER_SEARCH_RESULT_COUNT) ?? readNumber(env.SEARCH_RESULT_COUNT) ?? defaultResultCount,
      1,
      maxSearchResultCount
    );
    this.defaultEngine = parseSearchEngine(env.BROWSER_SEARCH_ENGINE || env.SEARCH_ENGINE) ?? defaultEngine;
    this.defaultLanguage = readString(env.BROWSER_SEARCH_LANGUAGE || env.SEARCH_LANGUAGE);
    this.defaultCountry = readString(env.BROWSER_SEARCH_COUNTRY || env.SEARCH_COUNTRY);
    this.defaultSafeSearch = parseSafeSearch(env.BROWSER_SEARCH_SAFE_SEARCH || env.SEARCH_SAFE_SEARCH);
    this.defaultTimeoutMs = clampInteger(
      options.timeoutMs ?? readNumber(env.BROWSER_SEARCH_TIMEOUT_MS) ?? readNumber(env.SEARCH_TIMEOUT_MS) ?? defaultTimeoutMs,
      100,
      600_000
    );
  }

  setUrl(url: string): void {
    this.url = url;
  }

  mcpConfig(): GatewayMcpServerConfig {
    const requestTimeoutMs = clampInteger(this.defaultTimeoutMs + 5_000, 1_000, 600_000);
    return {
      args: [bundledBrowserWebSearchProxyMcpEntryPath()],
      command: process.execPath,
      env: {
        BROWSER_WEB_SEARCH_MCP_URL: this.url,
        BROWSER_WEB_SEARCH_PROXY_TIMEOUT_MS: String(requestTimeoutMs),
        ELECTRON_RUN_AS_NODE: "1"
      },
      name: this.toolName,
      protocolVersion,
      requestTimeoutMs,
      startupTimeoutMs: 60_000,
      stdioMessageMode: "content-length",
      transport: "stdio"
    };
  }

  async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader("MCP-Protocol-Version", protocolVersion);
    const path = request.url ? new URL(request.url, this.url || "http://127.0.0.1").pathname : "/";

    if (request.method === "GET" && (path === "/mcp" || path === "/mcp/")) {
      sendJson(response, 200, {
        endpoint: "/mcp",
        name: this.toolName,
        protocol: "mcp",
        transport: "streamable-http"
      });
      return;
    }

    if (request.method !== "POST" || (path !== "/mcp" && path !== "/mcp/")) {
      sendJson(response, 404, { error: { message: "In-app browser web search MCP endpoint not found." } });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse((await readRequestBody(request, maxMcpRequestBytes)).toString("utf8")) as unknown;
    } catch (error) {
      sendJson(response, 400, jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`));
      return;
    }

    const requests = Array.isArray(payload) ? payload : [payload];
    const responses = await Promise.all(requests.map((item) => this.handleJsonRpcRequest(item)));
    const filtered = responses.filter((item): item is JsonRpcResponse => Boolean(item));
    if (filtered.length === 0) {
      response.writeHead(204);
      response.end();
      return;
    }

    sendJson(response, 200, Array.isArray(payload) ? filtered : filtered[0]);
  }

  private async handleJsonRpcRequest(payload: unknown): Promise<JsonRpcResponse | undefined> {
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
              name: "ccr-browser-web-search",
              title: "CCR In-app Browser Web Search",
              version: "1.0.0"
            }
          });
        case "ping":
          return jsonRpcResult(id, {});
        case "tools/list":
          return jsonRpcResult(id, { tools: [this.tool()] as unknown as JsonValue });
        case "tools/call":
          return jsonRpcResult(id, await this.callTool(request.params) as unknown as JsonValue);
        default:
          return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
      }
    } catch (error) {
      return jsonRpcError(id, -32603, formatError(error));
    }
  }

  private tool(): JsonValue {
    return {
      description:
        "Search the web through a hidden in-app browser window. " +
        "Supports Google, Bing, and DuckDuckGo plus advanced query controls such as domains, keywords, phrases, excluded terms, and date filters.",
      inputSchema: objectSchema({
        after: { description: "Earliest result date as YYYY-MM-DD. Also added to the engine query as after:YYYY-MM-DD.", type: "string" },
        allowedDomains: { description: "Alias for includeDomains; compatible with Anthropic web search declarations.", items: { type: "string" }, type: "array" },
        allowed_domains: { description: "Alias for includeDomains; compatible with Anthropic web_search_20250305.", items: { type: "string" }, type: "array" },
        anyTerms: { description: "Terms where any one may match; encoded as OR terms.", items: { type: "string" }, type: "array" },
        before: { description: "Latest result date as YYYY-MM-DD. Also added to the engine query as before:YYYY-MM-DD.", type: "string" },
        blockedDomains: { description: "Alias for excludeDomains; compatible with Anthropic web search declarations.", items: { type: "string" }, type: "array" },
        blocked_domains: { description: "Alias for excludeDomains; compatible with Anthropic web_search_20250305.", items: { type: "string" }, type: "array" },
        count: { maximum: maxSearchResultCount, minimum: 1, type: "number" },
        country: { description: "Country/region hint such as US, CN, GB.", type: "string" },
        domains: { description: "Alias for includeDomains.", items: { type: "string" }, type: "array" },
        engine: { enum: ["auto", "bing", "google", "duckduckgo"], type: "string" },
        exactPhrase: { description: "Phrase to search exactly.", type: "string" },
        excludeDomain: { description: "Single domain alias for excludeDomains.", type: "string" },
        excludeDomains: { description: "Domains to exclude with -site:domain.", items: { type: "string" }, type: "array" },
        excludeTerms: { description: "Terms to exclude with a leading minus.", items: { type: "string" }, type: "array" },
        freshness: { description: "Relative time filter.", enum: ["day", "week", "month", "year"], type: "string" },
        includeDomains: { description: "Domains to restrict with site:domain.", items: { type: "string" }, type: "array" },
        includeRaw: { description: "Include the engine search URL in the text response.", type: "boolean" },
        keywords: { description: "Additional required keywords. A comma-separated string is also accepted.", items: { type: "string" }, type: "array" },
        language: { description: "Language hint such as en, zh-CN, ja.", type: "string" },
        prompt: { description: "Natural-language query. Search engine operators already present here are preserved.", type: "string" },
        query: { description: "Alias for prompt.", type: "string" },
        safeSearch: { enum: ["off", "moderate", "strict"], type: "string" },
        site: { description: "Single domain alias for includeDomains.", type: "string" },
        timeRange: { description: "Alias for freshness.", enum: ["day", "week", "month", "year"], type: "string" },
        timeoutMs: { minimum: 100, type: "number" }
      }, ["prompt"]),
      name: this.toolName,
      title: "In-app Browser Web Search"
    };
  }

  private async callTool(params: unknown): Promise<ToolCallResult> {
    if (!isRecord(params) || typeof params.name !== "string") {
      throw new Error("tools/call params must include a tool name.");
    }
    if (params.name !== this.toolName) {
      throw new Error(`Unknown in-app browser web search tool: ${params.name}`);
    }

    const args = isRecord(params.arguments) ? params.arguments : {};
    try {
      const input = this.readSearchInput(args);
      const record = await this.search(input);
      return textResult(formatSearchResponse(record, input.includeRaw));
    } catch (error) {
      return {
        ...textResult(formatError(error)),
        isError: true
      };
    }
  }

  async searchForProtocolResult(options: { count?: number; prompt: string; timeoutMs?: number }): Promise<BrowserWebSearchProtocolRecord> {
    return await this.search(this.readSearchInput({
      count: options.count,
      prompt: options.prompt,
      timeoutMs: options.timeoutMs
    }));
  }

  private async search(input: BrowserSearchInput): Promise<BrowserWebSearchProtocolRecord> {
    const response = await this.searchPool.search(input);
    const record = {
      completedAtMs: Date.now(),
      engine: response.engine,
      query: response.query,
      results: response.results,
      searchUrl: response.searchUrl,
      toolName: this.toolName
    };
    this.recordSearchResult(record);
    return record;
  }

  private readSearchInput(args: Record<string, unknown>): BrowserSearchInput {
    const prompt = readString(args.prompt) || readString(args.query);
    if (!prompt) {
      throw new Error(`${this.toolName} requires prompt.`);
    }

    const engine = parseSearchEngine(readString(args.engine)) ?? this.defaultEngine;
    const includeDomains = uniqueStrings([
      ...readStringArray(args.includeDomains),
      ...readStringArray(args.domains),
      ...readStringArray(args.domain),
      ...readStringArray(args.site),
      ...readStringArray(args.allowedDomains),
      ...readStringArray(args.allowed_domains)
    ].map(normalizeDomain).filter((item): item is string => Boolean(item)));
    const excludeDomains = uniqueStrings([
      ...readStringArray(args.excludeDomains),
      ...readStringArray(args.excludeDomain),
      ...readStringArray(args.blockedDomains),
      ...readStringArray(args.blocked_domains)
    ].map(normalizeDomain).filter((item): item is string => Boolean(item)));

    return {
      after: normalizeSearchDate(readString(args.after) || readString(args.since) || readString(args.fromDate)),
      anyTerms: readStringArray(args.anyTerms),
      before: normalizeSearchDate(readString(args.before) || readString(args.until) || readString(args.toDate)),
      count: clampInteger(readNumber(args.count) ?? this.defaultCount, 1, maxSearchResultCount),
      country: readString(args.country) || this.defaultCountry,
      engine,
      exactPhrase: readString(args.exactPhrase),
      excludeDomains,
      excludeTerms: readStringArray(args.excludeTerms),
      freshness: parseFreshness(readString(args.freshness) || readString(args.timeRange)),
      includeDomains,
      includeRaw: args.includeRaw === true,
      keywords: readStringArray(args.keywords),
      language: readString(args.language) || this.defaultLanguage,
      prompt,
      safeSearch: parseSafeSearch(readString(args.safeSearch)) ?? this.defaultSafeSearch,
      timeoutMs: clampInteger(readNumber(args.timeoutMs) ?? this.defaultTimeoutMs, 100, 600_000)
    };
  }
}

class HiddenBrowserSearchPool {
  private configuredSession = false;
  private queue: BrowserSearchQueueEntry[] = [];
  private window?: BrowserWindow;
  private workers: BrowserSearchWorker[] = [];

  async search(input: BrowserSearchInput): Promise<BrowserSearchResponse> {
    const request = buildBrowserSearchRequest(input);
    const worker = await this.acquire(request.timeoutMs);
    let page: BrowserSearchPageResult;
    try {
      page = await runSearchInWorker(worker, request);
    } finally {
      this.release(worker);
    }
    if (page.blocked) {
      throw new Error(page.blocked);
    }
    const results = uniqueSearchResults(page.results ?? []).slice(0, request.count);
    return {
      engine: request.engine,
      query: request.query,
      results: await this.enrichResults(results, request),
      searchUrl: request.searchUrl
    };
  }

  destroy(): void {
    this.queue.splice(0).forEach((entry) => entry.reject(new Error("Browser search service stopped.")));
    this.queue = [];
    for (const worker of this.workers) {
      if (!worker.view.webContents.isDestroyed()) {
        worker.view.webContents.close({ waitForBeforeUnload: false });
      }
    }
    this.workers = [];
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = undefined;
    this.configuredSession = false;
  }

  private async acquire(timeoutMs: number): Promise<BrowserSearchWorker> {
    await app.whenReady();
    this.ensureWindow();
    const maxWorkers = browserSearchConcurrency();
    for (;;) {
      const idle = this.workers.find((worker) => !worker.busy);
      if (idle) {
        idle.busy = true;
        return idle;
      }
      if (this.workers.length < maxWorkers) {
        const worker = this.createWorker();
        worker.busy = true;
        return worker;
      }
      await waitForQueueTurn(this.queue, timeoutMs);
    }
  }

  private release(worker: BrowserSearchWorker): void {
    worker.busy = false;
    const next = this.queue.shift();
    next?.resolve();
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }
    this.configureSearchSession();
    this.window = new BrowserWindow({
      height: 900,
      paintWhenInitiallyHidden: true,
      show: false,
      skipTaskbar: true,
      title: "CCR In-app Browser Web Search",
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        images: false,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      },
      width: 1280
    });
    this.window.on("closed", () => {
      this.workers = [];
      this.window = undefined;
    });
    return this.window;
  }

  private createWorker(): BrowserSearchWorker {
    const window = this.ensureWindow();
    const view = new WebContentsView({
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        images: false,
        nodeIntegration: false,
        partition: searchPartition,
        sandbox: true,
        webSecurity: true
      }
    });
    view.webContents.setAudioMuted(true);
    view.webContents.on("console-message", (event) => {
      event.preventDefault();
    });
    view.setBounds({ height: 900, width: 1280, x: 0, y: 0 });
    window.contentView.addChildView(view);
    const worker = { busy: false, view };
    this.workers.push(worker);
    return worker;
  }

  private configureSearchSession(): void {
    if (this.configuredSession) {
      return;
    }
    const browserSession = session.fromPartition(searchPartition);
    browserSession.setUserAgent(desktopUserAgent);
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      if (details.resourceType === "image" || details.resourceType === "media" || details.resourceType === "font") {
        callback({ cancel: true });
        return;
      }
      callback({});
    });
    this.configuredSession = true;
  }

  private async enrichResults(results: BrowserSearchResult[], request: BrowserSearchRequest): Promise<BrowserSearchResult[]> {
    const openCount = Math.min(results.length, browserSearchOpenResultCount());
    if (openCount <= 0) {
      return results;
    }
    const enriched = await Promise.all(results.slice(0, openCount).map((result) => this.enrichResult(result, request)));
    return results.map((result, index) => enriched[index] ?? result);
  }

  private async enrichResult(result: BrowserSearchResult, request: BrowserSearchRequest): Promise<BrowserSearchResult> {
    if (!shouldOpenSearchResult(result.url)) {
      return result;
    }
    const timeoutMs = browserSearchPageTimeoutMs(request.timeoutMs);
    let worker: BrowserSearchWorker | undefined;
    try {
      worker = await this.acquire(timeoutMs);
      await loadSearchUrl(worker.view.webContents, result.url, timeoutMs);
      const page = await withTimeout(
        worker.view.webContents.executeJavaScript(pageContentExtractionScript(), true) as Promise<{ description?: string; text?: string; title?: string }>,
        timeoutMs,
        "Browser result page extraction timed out."
      );
      const content = compactExtractedContent(page.text);
      const snippet = result.snippet || compactExtractedContent(page.description);
      return {
        ...result,
        ...(content ? { content } : {}),
        ...(!content ? { diagnostics: appendSearchResultDiagnostic(result.diagnostics, "No extractable page content found.") } : {}),
        ...(snippet ? { snippet } : {}),
        ...(page.title && page.title.length > result.title.length ? { title: page.title.slice(0, 240) } : {})
      };
    } catch (error) {
      return {
        ...result,
        diagnostics: appendSearchResultDiagnostic(result.diagnostics, `Page extraction failed: ${formatError(error)}`)
      };
    } finally {
      if (worker) {
        this.release(worker);
      }
    }
  }
}

async function runSearchInWorker(worker: BrowserSearchWorker, request: BrowserSearchRequest): Promise<BrowserSearchPageResult> {
  const webContents = worker.view.webContents;
  if (webContents.isDestroyed()) {
    throw new Error("Browser search view is unavailable.");
  }

  await loadSearchUrl(webContents, request.searchUrl, request.timeoutMs);
  return await pollSearchResults(webContents, request);
}

async function loadSearchUrl(webContents: WebContents, url: string, timeoutMs: number): Promise<void> {
  webContents.stop();
  await withTimeout(
    webContents.loadURL(url, {
      userAgent: desktopUserAgent
    }),
    timeoutMs,
    "Browser search navigation timed out."
  );
}

async function pollSearchResults(webContents: WebContents, request: BrowserSearchRequest): Promise<BrowserSearchPageResult> {
  const deadline = Date.now() + request.timeoutMs;
  let last: BrowserSearchPageResult = { results: [] };
  while (Date.now() < deadline) {
    try {
      last = await withTimeout(
        webContents.executeJavaScript(searchResultExtractionScript(request.engine, request.count), true) as Promise<BrowserSearchPageResult>,
        Math.max(100, Math.min(1000, deadline - Date.now())),
        "Browser search result extraction timed out."
      );
    } catch {
      await sleep(150);
      continue;
    }
    if (last.blocked || (last.results?.length ?? 0) >= Math.min(request.count, 3)) {
      return last;
    }
    await sleep(150);
  }
  return last;
}

function buildBrowserSearchRequest(input: BrowserSearchInput): BrowserSearchRequest {
  const query = buildAdvancedSearchQuery(input);
  const searchUrl = searchUrlForEngine(input, query);
  return {
    ...input,
    query,
    searchUrl
  };
}

function searchUrlForEngine(input: BrowserSearchInput, query: string): string {
  if (input.engine === "google") {
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(Math.min(input.count, 10)));
    url.searchParams.set("filter", "0");
    url.searchParams.set("pws", "0");
    url.searchParams.set("udm", "14");
    if (input.language) url.searchParams.set("hl", input.language);
    if (input.country) url.searchParams.set("gl", input.country);
    if (input.safeSearch) url.searchParams.set("safe", input.safeSearch === "off" ? "off" : "active");
    const tbs = googleTimeFilter(input);
    if (tbs) url.searchParams.set("tbs", tbs);
    return url.toString();
  }

  if (input.engine === "duckduckgo") {
    const url = new URL("https://duckduckgo.com/");
    url.searchParams.set("q", query);
    url.searchParams.set("ia", "web");
    if (input.language) url.searchParams.set("kl", input.language);
    if (input.safeSearch) url.searchParams.set("kp", input.safeSearch === "off" ? "-2" : "1");
    const df = duckDuckGoTimeFilter(input.freshness);
    if (df) url.searchParams.set("df", df);
    return url.toString();
  }

  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(input.count));
  url.searchParams.set("qs", "n");
  url.searchParams.set("form", "QBRE");
  if (input.language) url.searchParams.set("setlang", input.language);
  if (input.country) url.searchParams.set("cc", input.country);
  if (input.safeSearch) url.searchParams.set("safeSearch", bingSafeSearch(input.safeSearch));
  const qft = bingTimeFilter(input.freshness);
  if (qft) url.searchParams.set("qft", qft);
  return url.toString();
}

function buildAdvancedSearchQuery(input: BrowserSearchInput): string {
  const parts = [input.prompt.trim()];
  parts.push(...input.keywords.map(searchTerm));
  if (input.exactPhrase) {
    parts.push(quoteSearchPhrase(input.exactPhrase));
  }
  if (input.anyTerms.length > 0) {
    parts.push(`(${input.anyTerms.map(searchTerm).join(" OR ")})`);
  }
  parts.push(...input.excludeTerms.map((term) => `-${searchTerm(term)}`));
  if (input.includeDomains.length === 1) {
    parts.push(`site:${input.includeDomains[0]}`);
  } else if (input.includeDomains.length > 1) {
    parts.push(`(${input.includeDomains.map((domain) => `site:${domain}`).join(" OR ")})`);
  }
  parts.push(...input.excludeDomains.map((domain) => `-site:${domain}`));
  if (input.after) {
    parts.push(`after:${input.after}`);
  }
  if (input.before) {
    parts.push(`before:${input.before}`);
  }
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function searchTerm(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return /\s/.test(trimmed) && !/^".*"$/.test(trimmed) ? quoteSearchPhrase(trimmed) : trimmed;
}

function quoteSearchPhrase(value: string): string {
  return `"${value.trim().replace(/"/g, " ")}"`;
}

function googleTimeFilter(input: BrowserSearchInput): string | undefined {
  if (input.after || input.before) {
    const parts = ["cdr:1"];
    if (input.after) parts.push(`cd_min:${dateToGoogleDate(input.after)}`);
    if (input.before) parts.push(`cd_max:${dateToGoogleDate(input.before)}`);
    return parts.join(",");
  }
  if (input.freshness === "day") return "qdr:d";
  if (input.freshness === "week") return "qdr:w";
  if (input.freshness === "month") return "qdr:m";
  if (input.freshness === "year") return "qdr:y";
  return undefined;
}

function bingTimeFilter(value: BrowserSearchFreshness | undefined): string | undefined {
  if (value === "day") return "+filterui:age-lt1440";
  if (value === "week") return "+filterui:age-lt10080";
  if (value === "month") return "+filterui:age-lt43200";
  if (value === "year") return "+filterui:age-lt525600";
  return undefined;
}

function duckDuckGoTimeFilter(value: BrowserSearchFreshness | undefined): string | undefined {
  if (value === "day") return "d";
  if (value === "week") return "w";
  if (value === "month") return "m";
  if (value === "year") return "y";
  return undefined;
}

function bingSafeSearch(value: "moderate" | "off" | "strict"): string {
  if (value === "strict") return "Strict";
  if (value === "off") return "Off";
  return "Moderate";
}

function dateToGoogleDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function searchResultExtractionScript(engine: BrowserSearchEngine, count: number): string {
  return `(() => {
    const engine = ${JSON.stringify(engine)};
    const maxResults = ${JSON.stringify(count)};
    const results = [];
    const seen = new Set();
    const blockedText = detectBlocked();
    if (blockedText) return { blocked: blockedText, results, title: document.title || "" };

    function compact(value) {
      return String(value || "").replace(/\\s+/g, " ").trim();
    }
    function absoluteUrl(href) {
      try { return new URL(href, location.href); } catch (_) { return undefined; }
    }
    function decodeMaybeBase64(value) {
      if (!value) return "";
      let raw = value.replace(/-/g, "+").replace(/_/g, "/");
      if (raw.startsWith("a1")) raw = raw.slice(2);
      try {
        const decoded = atob(raw);
        return /^https?:\\/\\//i.test(decoded) ? decoded : "";
      } catch (_) {
        return "";
      }
    }
    function normalizeResultUrl(href) {
      const url = absoluteUrl(href);
      if (!url || !/^https?:$/i.test(url.protocol)) return "";
      const host = url.hostname.toLowerCase();
      if (host.includes("google.") && url.pathname === "/url") {
        const q = url.searchParams.get("q") || url.searchParams.get("url");
        if (q) return normalizeResultUrl(q);
      }
      if (host.endsWith("bing.com") && url.pathname.startsWith("/ck/")) {
        const raw = url.searchParams.get("u");
        const decoded = decodeMaybeBase64(raw || "");
        if (decoded) return normalizeResultUrl(decoded);
      }
      if (host.endsWith("duckduckgo.com") && url.pathname.startsWith("/l/")) {
        const target = url.searchParams.get("uddg");
        if (target) return normalizeResultUrl(target);
      }
      if (isSearchChromeUrl(url)) return "";
      url.hash = "";
      return url.toString();
    }
    function isSearchChromeUrl(url) {
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      if (host === location.hostname.toLowerCase() && (path === "/" || path === "/search" || path.startsWith("/search/"))) return true;
      if (host.includes("google.") && /\\/(preferences|advanced_search|intl|policies|support|sorry|search|aclk|imgres)/.test(path)) return true;
      if (host.endsWith("bing.com") && /\\/(search|account|profile|images|videos|maps|news|aclick)/.test(path)) return true;
      if (host.endsWith("bing.com") && path.startsWith("/ck/")) return true;
      if (host.endsWith("duckduckgo.com") && (path === "/" || path.startsWith("/settings") || path.startsWith("/y.js"))) return true;
      return false;
    }
    function resultContainer(anchor, title) {
      const root = anchor && anchor.closest("li.b_algo, li.b_ad, div.g, div[data-sokoban-container], div[data-testid='result'], article, .result, .result__body, .web-result");
      if (root) return root;
      let node = anchor;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        if (node.matches && node.matches("nav, header, footer, form, aside")) return undefined;
        if (node.matches && node.matches("main, #search, #b_results, #rso")) break;
        const text = compact(node.textContent || "");
        if (text.length > title.length + 40) return node;
      }
      return undefined;
    }
    function isLikelyOrganicResult(anchor, container) {
      if (!anchor || !container) return false;
      if (anchor.closest("nav, header, footer, form, aside")) return false;
      if (anchor.closest("li.b_algo, div.g, div[data-sokoban-container], div[data-testid='result'], article, .result, .result__body, .web-result")) return true;
      const heading = anchor.closest("h1, h2, h3, [role='heading']");
      const searchRegion = anchor.closest("main, #search, #b_results, #rso");
      return Boolean(heading && searchRegion);
    }
    function isAdOrUtilityResult(anchor, container) {
      let node = anchor;
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        const attributes = [
          node.getAttribute && node.getAttribute("aria-label"),
          node.getAttribute && node.getAttribute("data-text-ad"),
          node.getAttribute && node.getAttribute("data-testid"),
          node.className
        ].filter(Boolean).join(" ");
        if (/\\b(?:ad|ads|sponsored|promo|shopping)\\b|广告|赞助|推廣/i.test(attributes)) return true;
      }
      const firstText = compact(container && container.textContent).slice(0, 180);
      if (/^(?:ad|ads|sponsored|promo|shopping)\\b|^(?:广告|赞助|推廣)/i.test(firstText)) return true;
      return false;
    }
    function cleanSnippetCandidate(value, title, url) {
      const host = (() => { try { return new URL(url).hostname.replace(/^www\\./, ""); } catch (_) { return ""; } })();
      return compact(String(value || "")
        .replace(title, " ")
        .replace(url, " ")
        .replace(host, " ")
        .replace(/https?:\\/\\/\\S+/g, " ")
        .replace(/\\b(?:Cached|Translate this page|Similar)\\b/gi, " "));
    }
    function breadcrumbLike(value) {
      const text = compact(value);
      if (!text) return true;
      if (/https?:\\/\\//i.test(text)) return true;
      if (text.length < 35 && /[›/]|^https?:|^www\\./i.test(text)) return true;
      if (/[›]/.test(text) && !/[.!?，。！？]/.test(text)) return true;
      if (!/[.!?:;，。！？：；]/.test(text) && /^[\\w\\s.:-]+(?:[›/]\\s*[\\w\\s.:-]+)+$/i.test(text)) return true;
      return false;
    }
    function snippetFor(anchor, container, title, url) {
      const preferred = container && container.querySelector(".b_caption p, .b_snippet, [data-sncf], .VwiC3b, .IsZvec, [data-result='snippet'], .result__snippet, p");
      const preferredText = cleanSnippetCandidate(preferred && preferred.textContent, title, url);
      if (preferredText && !breadcrumbLike(preferredText)) return preferredText.slice(0, 700);
      const candidates = container
        ? Array.from(container.querySelectorAll("p, span, div"))
          .map((node) => cleanSnippetCandidate(node.textContent, title, url))
          .filter((text) => text.length >= 35 && !breadcrumbLike(text))
        : [];
      const text = candidates.find((candidate) => candidate.length >= 50) || candidates[0] || "";
      if (!text) return "";
      return text.slice(0, 700);
    }
    function titleFor(anchor, titleOverride) {
      const explicit = compact(titleOverride);
      if (explicit && explicit.length >= 2) return explicit;
      const heading = anchor && anchor.querySelector("h1, h2, h3, [role='heading']");
      return compact((heading && heading.textContent) || (anchor && (anchor.textContent || anchor.innerText)));
    }
    function add(anchor, titleOverride) {
      if (!anchor || results.length >= maxResults) return;
      const href = anchor.getAttribute("href") || "";
      const url = normalizeResultUrl(href);
      if (!url || seen.has(url)) return;
      const title = titleFor(anchor, titleOverride);
      if (!title || title.length < 2) return;
      const container = resultContainer(anchor, title);
      if (!isLikelyOrganicResult(anchor, container) || isAdOrUtilityResult(anchor, container)) return;
      seen.add(url);
      results.push({
        snippet: snippetFor(anchor, container, title, url),
        title: title.slice(0, 240),
        url
      });
    }
    function collect(selector) {
      document.querySelectorAll(selector).forEach((node) => {
        const anchor = node.matches && node.matches("a[href]") ? node : node.closest && node.closest("a[href]");
        add(anchor, node.matches && node.matches("h1, h2, h3, [role='heading']") ? node.textContent : "");
      });
    }
    function collectGoogle() {
      collect("#search h3");
      collect("#rso h3");
      collect("a[href] h3");
    }
    function collectBing() {
      collect("li.b_algo h2 a[href]");
      collect("main ol li h2 a[href]");
    }
    function collectDuckDuckGo() {
      collect("a[data-testid='result-title-a']");
      collect(".result__a");
      collect("article h2 a[href]");
    }
    function collectGenericHeadings() {
      collect("main h1 a[href], main h2 a[href], main h3 a[href], #search h3, #b_results h2 a[href], #rso h3, article h2 a[href], article h3 a[href]");
    }
    if (engine === "google") collectGoogle();
    if (engine === "bing") collectBing();
    if (engine === "duckduckgo") collectDuckDuckGo();
    collectGenericHeadings();
    return { results, title: document.title || "" };

    function detectBlocked() {
      const text = compact(document.body && document.body.innerText).toLowerCase();
      if (!text) return "";
      if (text.includes("unusual traffic") || text.includes("detected unusual") || text.includes("not a robot") || text.includes("captcha") || text.includes("验证码") || text.includes("人机验证")) {
        return "Search engine returned an anti-bot or CAPTCHA page.";
      }
      if (text.includes("before you continue to google") || text.includes("consent.google") || text.includes("cookie consent")) {
        return "Google returned a consent page instead of search results.";
      }
      return "";
    }
  })();`;
}

function pageContentExtractionScript(): string {
  return `(() => {
    function compact(value) {
      return String(value || "").replace(/[\\t\\f\\v ]+/g, " ").replace(/\\n\\s*\\n+/g, "\\n").trim();
    }
    function textFrom(node) {
      if (!node) return "";
      const clone = node.cloneNode(true);
      clone.querySelectorAll("script, style, noscript, svg, nav, header, footer, aside, form, button, input, select, textarea, iframe, [aria-hidden='true']").forEach((item) => item.remove());
      const lines = String(clone.innerText || clone.textContent || "")
        .split(/\\n+/)
        .map((line) => compact(line))
        .filter((line) => line.length >= 20)
        .filter((line, index, array) => array.indexOf(line) === index);
      return lines.join("\\n");
    }
    function scoreText(text) {
      const length = text.length;
      const sentenceMarks = (text.match(/[.!?。！？]/g) || []).length;
      return length + sentenceMarks * 80;
    }
    const title = compact(
      document.querySelector("meta[property='og:title']")?.getAttribute("content") ||
      document.querySelector("h1")?.textContent ||
      document.title ||
      ""
    );
    const description = compact(
      document.querySelector("meta[name='description']")?.getAttribute("content") ||
      document.querySelector("meta[property='og:description']")?.getAttribute("content") ||
      ""
    );
    const candidates = [
      ...document.querySelectorAll("article, main, [role='main'], .article, .article-content, .post, .post-content, .entry-content, .content, #content, .main-content")
    ].map(textFrom).filter(Boolean);
    const fallback = textFrom(document.body);
    const text = [...candidates, fallback]
      .filter(Boolean)
      .sort((left, right) => scoreText(right) - scoreText(left))[0] || "";
    return {
      description,
      text: text.slice(0, 5000),
      title
    };
  })();`;
}

function formatSearchResponse(
  response: Pick<BrowserSearchResponse, "query" | "results" | "searchUrl"> & { engine: string },
  includeRaw: boolean
): string {
  if (response.results.length === 0) {
    return [
      `Search engine: ${response.engine}`,
      `Query: ${response.query}`,
      includeRaw ? `Search URL: ${response.searchUrl}` : "",
      "No results."
    ].filter(Boolean).join("\n");
  }

  return [
    `Search engine: ${response.engine}`,
    `Query: ${response.query}`,
    includeRaw ? `Search URL: ${response.searchUrl}` : "",
    ...response.results.map((result, index) => [
      `${index + 1}. ${result.title}`,
      `URL: ${result.url}`,
      result.snippet ? `Snippet: ${result.snippet}` : "",
      result.content ? `Extracted content: ${result.content}` : "",
      result.diagnostics?.length ? `Diagnostics: ${result.diagnostics.join("; ")}` : ""
    ].filter(Boolean).join("\n"))
  ].filter(Boolean).join("\n\n");
}

function appendSearchResultDiagnostic(existing: string[] | undefined, message: string): string[] {
  return uniqueStrings([...(existing ?? []), message]);
}

function uniqueSearchResults(results: BrowserSearchResult[]): BrowserSearchResult[] {
  const seen = new Set<string>();
  const unique: BrowserSearchResult[] = [];
  for (const result of results) {
    if (!result.url || seen.has(result.url)) {
      continue;
    }
    seen.add(result.url);
    unique.push(result);
  }
  return unique;
}

function normalizeDomain(value: string): string | undefined {
  const trimmed = value.trim().replace(/^site:/i, "");
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed.replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
  }
}

function normalizeSearchDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const time = Date.parse(trimmed);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : undefined;
}

function parseSearchEngine(value: string | undefined): BrowserSearchEngine | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!normalized || normalized === "auto") {
    return undefined;
  }
  if (normalized === "google") return "google";
  if (normalized === "bing") return "bing";
  if (normalized === "duckduckgo" || normalized === "duck-duck-go" || normalized === "ddg") return "duckduckgo";
  return undefined;
}

function parseFreshness(value: string | undefined): BrowserSearchFreshness | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "day" || normalized === "24h" || normalized === "d") return "day";
  if (normalized === "week" || normalized === "7d" || normalized === "w") return "week";
  if (normalized === "month" || normalized === "30d" || normalized === "m") return "month";
  if (normalized === "year" || normalized === "365d" || normalized === "y") return "year";
  return undefined;
}

function parseSafeSearch(value: string | undefined): "moderate" | "off" | "strict" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "off" || normalized === "false" || normalized === "0") return "off";
  if (normalized === "strict") return "strict";
  if (normalized === "moderate" || normalized === "medium" || normalized === "on" || normalized === "true" || normalized === "1") return "moderate";
  return undefined;
}

function browserSearchConcurrency(): number {
  return clampInteger(readNumber(process.env.CCR_BROWSER_SEARCH_CONCURRENCY) ?? 2, 1, 4);
}

function browserSearchOpenResultCount(): number {
  return clampInteger(readNumber(process.env.CCR_BROWSER_SEARCH_OPEN_RESULT_COUNT) ?? 3, 0, 8);
}

function browserSearchPageTimeoutMs(requestTimeoutMs: number): number {
  return clampInteger(
    readNumber(process.env.CCR_BROWSER_SEARCH_PAGE_TIMEOUT_MS) ?? Math.min(requestTimeoutMs, 8_000),
    500,
    30_000
  );
}

function shouldOpenSearchResult(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return false;
    }
    return !/\.(?:avi|dmg|docx?|exe|gif|jpe?g|mov|mp3|mp4|pdf|png|pptx?|rar|webp|xlsx?|zip)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function compactExtractedContent(value: string | undefined): string | undefined {
  const compacted = value?.replace(/\s+/g, " ").trim();
  if (!compacted || compacted.length < 40) {
    return undefined;
  }
  return compacted.slice(0, 2_400);
}

function waitForQueueTurn(queue: BrowserSearchQueueEntry[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const entry = {
      reject: (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
      resolve: () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      const index = queue.indexOf(entry);
      if (index >= 0) {
        queue.splice(index, 1);
      }
      reject(new Error("Browser search worker queue timed out."));
    }, timeoutMs);
    queue.push(entry);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textResult(text: string): ToolCallResult {
  return {
    content: [{ text, type: "text" }]
  };
}

function objectSchema(properties: Record<string, JsonValue>, required: string[] = []): JsonValue {
  return {
    additionalProperties: true,
    properties,
    ...(required.length ? { required } : {}),
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

function jsonRpcError(id: null | number | string, code: number, message: string): JsonRpcResponse {
  return {
    error: {
      code,
      message
    },
    id,
    jsonrpc: "2.0"
  };
}

function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(body);
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

function readStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(readString).filter((item): item is string => Boolean(item));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const browserWebSearchMcpService = new BrowserWebSearchMcpService();
