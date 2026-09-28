import { gunzipSync } from "node:zlib";
import type { Event as ElectronEvent, Session, WebContents } from "electron";
import { loadPersistedApiKeys } from "@ccr/core/config/config-repository";
import {
  CLAUDE_DESIGN_PLUGIN_ID,
  CLAUDE_SHIP_PLUGIN_ID,
  type AppConfig
} from "@ccr/core/contracts/app";

export type ClaudeDesignWindowCdpOptions = {
  backendUrl: string;
  hosts: string[];
  logger?: Pick<Console, "info" | "warn">;
  paths: string[];
};

type ClaudeDesignPluginStatus = {
  backend?: unknown;
  frontendAssetsHost?: unknown;
  frontendAssetsOrigin?: unknown;
  frontendUrl?: unknown;
  proxy?: {
    fallbackHosts?: unknown;
    frontendAssetsHost?: unknown;
    frontendAssetsOrigin?: unknown;
    host?: unknown;
    paths?: unknown;
  };
};

type ClaudeDesignWindowRedirectState = {
  fetchInterceptedWebContentsIds: Set<number>;
  logger: Pick<Console, "info" | "warn">;
  loggedRedirectCount: number;
  options: Required<Pick<ClaudeDesignWindowCdpOptions, "backendUrl" | "hosts" | "paths">>;
};

type ClaudeDesignFetchInterceptorRegistration = {
  handler: (event: ElectronEvent, method: string, params: unknown) => void;
  networkRequests: Map<string, string>;
  requests: Map<string, { originalUrl: string; networkId?: string }>;
  state: ClaudeDesignWindowRedirectState;
};

type CdpFetchRequestPausedParams = {
  networkId?: string;
  request?: {
    hasPostData?: boolean;
    headers?: Record<string, string>;
    method?: string;
    postData?: string;
    postDataEntries?: Array<{ bytes?: string }>;
    url?: string;
  };
  requestId?: string;
  responseErrorReason?: string;
  responseHeaders?: Array<{ name: string; value: string }>;
  responseStatusCode?: number;
  responseStatusText?: string;
};

const claudePluginAdminPaths: Record<string, string> = {
  [CLAUDE_DESIGN_PLUGIN_ID]: "/plugins/claude-design",
  [CLAUDE_SHIP_PLUGIN_ID]: "/plugins/claude-ship"
};
const claudeDesignStatusTimeoutMs = 5_000;
const redirectStates = new WeakMap<object, ClaudeDesignWindowRedirectState>();
const fetchInterceptorRegistrations = new WeakMap<WebContents, ClaudeDesignFetchInterceptorRegistration>();

export function claudePluginAdminPath(pluginId: string): string {
  const path = claudePluginAdminPaths[pluginId];
  if (!path) {
    throw new Error(`Claude browser plugin is not supported: ${pluginId}`);
  }
  return path;
}

export async function loadClaudeDesignWindowCdpOptions(
  config: AppConfig,
  pluginId = CLAUDE_DESIGN_PLUGIN_ID
): Promise<ClaudeDesignWindowCdpOptions> {
  const statusUrl = new URL(claudePluginAdminPath(pluginId), gatewayOriginFromConfig(config));
  const headers = await gatewayAuthHeaders(config);
  const response = await fetch(statusUrl, {
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(claudeDesignStatusTimeoutMs)
  });
  if (!response.ok) {
    throw new Error(`Claude browser plugin status returned HTTP ${response.status}: ${pluginId}.`);
  }
  const status = await response.json() as ClaudeDesignPluginStatus;
  return claudeDesignCdpOptionsFromStatus(status);
}

export function claudeDesignCdpOptionsFromStatus(status: ClaudeDesignPluginStatus): ClaudeDesignWindowCdpOptions {
  const backendUrl = normalizeHttpUrl(status.backend);
  if (!backendUrl) {
    throw new Error("Claude Design plugin did not report a local backend URL.");
  }

  const hosts = normalizeHostList([
    status.proxy?.host,
    status.frontendUrl,
    status.frontendAssetsHost,
    status.frontendAssetsOrigin,
    status.proxy?.frontendAssetsHost,
    status.proxy?.frontendAssetsOrigin,
    ...(Array.isArray(status.proxy?.fallbackHosts) ? status.proxy.fallbackHosts : [])
  ]);
  if (!hosts.length) {
    throw new Error("Claude Design plugin did not report any route hosts.");
  }

  const paths = normalizePathList(Array.isArray(status.proxy?.paths) ? status.proxy.paths : []);
  if (!paths.length) {
    throw new Error("Claude Design plugin did not report any route paths.");
  }

  return {
    backendUrl,
    hosts,
    paths
  };
}

export async function configureClaudeDesignWindowCdp(webContents: WebContents, options: ClaudeDesignWindowCdpOptions): Promise<void> {
  const normalized = normalizeClaudeDesignWindowCdpOptions(options);
  const logger = options.logger || console;
  const state = ensureClaudeDesignWindowRedirectState(webContents.session, normalized, logger);
  state.options = normalized;
  state.logger = logger;
  installClaudeDesignWebRequestRedirector(webContents.session, state);
  const usesFetchInterceptor = await installClaudeDesignFetchInterceptor(webContents, state);
  if (usesFetchInterceptor) {
    state.fetchInterceptedWebContentsIds.add(webContents.id);
    webContents.once("destroyed", () => {
      state.fetchInterceptedWebContentsIds.delete(webContents.id);
    });
  }
}

export function claudeDesignCdpFetchPatterns(options: Pick<ClaudeDesignWindowCdpOptions, "hosts">): Array<{ requestStage: "Request"; urlPattern: string }> {
  return normalizeHostList(options.hosts).flatMap((host) => [
    { requestStage: "Request" as const, urlPattern: `https://${host}/*` },
    { requestStage: "Request" as const, urlPattern: `http://${host}/*` }
  ]);
}

export function claudeDesignRedirectUrlForRequest(
  requestUrl: string,
  options: Pick<ClaudeDesignWindowCdpOptions, "backendUrl" | "hosts" | "paths">
): string | undefined {
  const normalized = normalizeClaudeDesignWindowCdpOptions(options);
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  if (!hostMatches(parsed, normalized.hosts)) {
    return undefined;
  }
  if (!isClaudeDesignRootAuthProbePath(parsed.pathname) && !pathMatches(parsed.pathname, normalized.paths)) {
    return undefined;
  }

  const target = new URL(normalized.backendUrl);
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = "";
  return target.toString();
}

function isClaudeDesignRootAuthProbePath(pathname: string): boolean {
  return normalizePath(pathname) === "/";
}

function ensureClaudeDesignWindowRedirectState(
  session: Session,
  options: Required<Pick<ClaudeDesignWindowCdpOptions, "backendUrl" | "hosts" | "paths">>,
  logger: Pick<Console, "info" | "warn">
): ClaudeDesignWindowRedirectState {
  const existing = redirectStates.get(session);
  if (existing) {
    existing.options = options;
    existing.logger = logger;
    return existing;
  }

  const state: ClaudeDesignWindowRedirectState = {
    fetchInterceptedWebContentsIds: new Set(),
    logger,
    loggedRedirectCount: 0,
    options
  };
  redirectStates.set(session, state);
  return state;
}

function installClaudeDesignWebRequestRedirector(session: Session, state: ClaudeDesignWindowRedirectState): void {
  session.webRequest.onBeforeRequest({ urls: claudeDesignWebRequestUrlPatterns(state.options) }, (details, callback) => {
    if (details.webContentsId !== undefined && state.fetchInterceptedWebContentsIds.has(details.webContentsId)) {
      callback({});
      return;
    }
    const redirectURL = claudeDesignRedirectUrlForRequest(details.url, state.options);
    if (redirectURL) {
      logClaudeDesignRedirect(state, details.url, redirectURL);
      callback({ redirectURL });
      return;
    }
    callback({});
  });
}

async function installClaudeDesignFetchInterceptor(webContents: WebContents, state: ClaudeDesignWindowRedirectState): Promise<boolean> {
  try {
    if (!webContents.debugger.isAttached()) {
      webContents.debugger.attach("1.3");
    }
    ensureClaudeDesignFetchInterceptorHandler(webContents, state);
    // Network.enable can wait for the first renderer navigation. Enable it in
    // parallel so loading that page is not blocked; its completion events
    // discard redirect metadata when a request is cancelled before headers.
    void webContents.debugger.sendCommand("Network.enable").catch(() => undefined);
    await webContents.debugger.sendCommand("Fetch.enable", {
      patterns: claudeDesignCdpFetchPatterns(state.options)
    });
    state.logger.info("[claude-design] CDP Fetch interceptor enabled; preserving Claude Design window origin.");
    return true;
  } catch (error) {
    state.logger.warn(`[claude-design] Failed to enable CDP Fetch interceptor; falling back to URL redirect. ${formatError(error)}`);
    return false;
  }
}

function ensureClaudeDesignFetchInterceptorHandler(webContents: WebContents, state: ClaudeDesignWindowRedirectState): void {
  const existing = fetchInterceptorRegistrations.get(webContents);
  if (existing) {
    existing.state = state;
    return;
  }

  const registration: ClaudeDesignFetchInterceptorRegistration = {
    handler: (_event, method, params) => {
      if (method === "Network.loadingFailed" || method === "Network.loadingFinished") {
        const networkId = (params as { requestId?: string }).requestId;
        const requestId = networkId && registration.networkRequests.get(networkId);
        if (requestId) {
          forgetClaudeDesignFetchRequest(registration, requestId);
        }
        return;
      }
      if (method !== "Fetch.requestPaused") {
        return;
      }
      void routeClaudeDesignFetchRequest(webContents, registration, params as CdpFetchRequestPausedParams);
    },
    networkRequests: new Map(),
    requests: new Map(),
    state
  };
  fetchInterceptorRegistrations.set(webContents, registration);
  webContents.debugger.on("message", registration.handler);

  const cleanup = (reason?: string) => {
    registration.state.fetchInterceptedWebContentsIds.delete(webContents.id);
    fetchInterceptorRegistrations.delete(webContents);
    registration.networkRequests.clear();
    registration.requests.clear();
    try {
      webContents.debugger.off("message", registration.handler);
    } catch {
      // The debugger or webContents may already be torn down.
    }
    if (reason) {
      registration.state.logger.warn(`[claude-design] CDP Fetch interceptor detached: ${reason}`);
    }
  };
  webContents.debugger.once("detach", (_event, reason) => cleanup(reason || "unknown"));
  webContents.once("destroyed", () => cleanup());
}

async function routeClaudeDesignFetchRequest(
  webContents: WebContents,
  registration: ClaudeDesignFetchInterceptorRegistration,
  params: CdpFetchRequestPausedParams
): Promise<void> {
  const state = registration.state;
  const requestId = typeof params.requestId === "string" ? params.requestId : "";
  const request = params.request;
  const requestUrl = typeof request?.url === "string" ? request.url : "";
  if (!requestId || !requestUrl) {
    return;
  }

  if (params.responseStatusCode !== undefined || params.responseErrorReason !== undefined) {
    const originalUrl = registration.requests.get(requestId)?.originalUrl;
    forgetClaudeDesignFetchRequest(registration, requestId);
    try {
      const headers = params.responseHeaders;
      const responseHeaders = originalUrl && headers && params.responseStatusCode !== undefined &&
          params.responseStatusCode >= 300 && params.responseStatusCode < 400 &&
          headers.some((header) => header.name.toLowerCase() === "location")
        ? headers.map((header) => header.name.toLowerCase() === "location"
          ? { ...header, value: claudeDesignRedirectLocation(header.value, originalUrl, requestUrl) }
          : header)
        : undefined;
      // Replacing a redirect is necessary: continueResponse changes headers,
      // but Chromium has already resolved its redirect target against the
      // backend URL. Other responses continue directly, including SSE.
      await webContents.debugger.sendCommand(responseHeaders ? "Fetch.fulfillRequest" : "Fetch.continueResponse", {
        requestId,
        ...(responseHeaders ? {
          body: "",
          responseCode: params.responseStatusCode,
          responsePhrase: params.responseStatusText,
          responseHeaders
        } : {})
      });
    } catch {
      await failClaudeDesignFetchRequest(webContents, requestId);
    }
    return;
  }

  const backendUrl = claudeDesignRedirectUrlForRequest(requestUrl, state.options);
  if (!backendUrl) {
    await continueClaudeDesignFetchRequest(webContents, requestId);
    return;
  }

  try {
    const method = request?.method || "GET";
    const backendRequest = claudeDesignBackendRequestForCdp(method, request);
    if (!isClaudeDesignStreamingRequest(method, requestUrl, backendRequest.headers)) {
      // Keep navigation and ordinary API responses on the original response
      // origin, including Secure cookies. A transparent network URL rewrite
      // preserves the page URL but Chromium associates cookies with its target.
      const response = await fetch(backendUrl, {
        body: fetchBodyInit(backendRequest.body),
        cache: "no-store",
        headers: backendRequest.headers,
        method,
        redirect: "manual"
      });
      const responseBody = method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await response.arrayBuffer());
      await webContents.debugger.sendCommand("Fetch.fulfillRequest", {
        body: responseBody.toString("base64"),
        requestId,
        responseCode: response.status,
        responseHeaders: responseHeadersForCdp(response.headers),
        responsePhrase: response.statusText
      });
      return;
    }
    registration.requests.set(requestId, { originalUrl: requestUrl, networkId: params.networkId });
    if (params.networkId) {
      registration.networkRequests.set(params.networkId, requestId);
    }
    // CDP rewrites the network URL without changing the URL visible to the
    // page. Let Chromium transport the response so SSE, binary bodies and
    // cancellation keep working without buffering the entire response here.
    await webContents.debugger.sendCommand("Fetch.continueRequest", {
      requestId,
      url: backendUrl,
      interceptResponse: true,
      method,
      headers: Object.entries(backendRequest.headers).map(([name, value]) => ({ name, value })),
      ...(backendRequest.body !== undefined
        ? { postData: Buffer.from(backendRequest.body).toString("base64") }
        : {})
    });
  } catch (error) {
    forgetClaudeDesignFetchRequest(registration, requestId);
    state.logger.warn(`[claude-design] Failed to route ${safeUrlForLog(requestUrl)} to local backend. ${formatError(error)}`);
    await failClaudeDesignFetchRequest(webContents, requestId);
  }
}

function isClaudeDesignStreamingRequest(method: string, requestUrl: string, headers: Record<string, string>): boolean {
  if (method.toUpperCase() === "HEAD") {
    return false;
  }
  if (headerValue(headers, "accept").toLowerCase().includes("text/event-stream")) {
    return true;
  }
  const pathname = new URL(requestUrl).pathname;
  const contentType = headerValue(headers, "content-type").split(";", 1)[0].trim().toLowerCase();
  if (method.toUpperCase() === "POST" && (
    contentType === "application/connect+proto" ||
    contentType === "application/connect+json" ||
    pathname === "/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat"
  )) {
    return true;
  }
  if (method.toUpperCase() === "GET" && /^\/v1\/sessions\/sse\/[^/]+\/stream\/?$/.test(pathname)) {
    return true;
  }
  // The bundled frontends also use fetch's default Accept: */* for these
  // streaming routes, including their Design and tokenized preview aliases.
  const designPath = pathname.replace(/^\/design(?=\/)/, "").replace(/^\/_t\/[^/]+(?=\/v1\/design\/)/, "");
  return (method.toUpperCase() === "GET" && /^\/v1\/design\/projects\/[^/]+\/events\/?$/.test(designPath)) ||
    (method.toUpperCase() === "POST" && designPath === "/v1/design/artifact-proxy/v1/messages");
}

function forgetClaudeDesignFetchRequest(registration: ClaudeDesignFetchInterceptorRegistration, requestId: string): void {
  const networkId = registration.requests.get(requestId)?.networkId;
  if (networkId && registration.networkRequests.get(networkId) === requestId) {
    registration.networkRequests.delete(networkId);
  }
  registration.requests.delete(requestId);
}

function claudeDesignRedirectLocation(location: string, originalUrl: string, backendUrl: string): string {
  // Chromium resolves relative redirects against the rewritten backend URL.
  // Keep local redirects on the original frontend origin, just like the page.
  const target = new URL(location, backendUrl);
  if (target.origin !== new URL(backendUrl).origin) {
    return location;
  }
  const original = new URL(originalUrl);
  target.protocol = original.protocol;
  target.hostname = original.hostname;
  target.port = original.port;
  target.username = original.username;
  target.password = original.password;
  return target.toString();
}

async function failClaudeDesignFetchRequest(webContents: WebContents, requestId: string): Promise<void> {
  try {
    // A failed local rewrite must not send local project data to the original
    // remote endpoint instead.
    await webContents.debugger.sendCommand("Fetch.failRequest", { requestId, errorReason: "Failed" });
  } catch {
    // The request may already have been cancelled by navigation.
  }
}

async function continueClaudeDesignFetchRequest(webContents: WebContents, requestId: string): Promise<void> {
  try {
    await webContents.debugger.sendCommand("Fetch.continueRequest", { requestId });
  } catch {
    // The request may have been cancelled by navigation; nothing useful to do.
  }
}

function requestHeadersForBackend(headers: Record<string, string> | undefined): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers || {})) {
    const normalizedName = name.toLowerCase();
    if (normalizedName === "host" || normalizedName === "content-length") {
      continue;
    }
    next[name] = value;
  }
  return next;
}

export function claudeDesignBackendRequestForCdp(
  method: string,
  request: CdpFetchRequestPausedParams["request"] | undefined
): { body?: Buffer | string; headers: Record<string, string> } {
  const headers = requestHeadersForBackend(request?.headers);
  if (method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD") {
    return { headers };
  }

  const postData = cdpRequestPostDataBody(request);
  if (postData === undefined) {
    return { headers };
  }

  if (!hasRequestContentEncoding(headers, "gzip")) {
    return {
      body: postData,
      headers
    };
  }

  const decompressedBody = gunzipCdpPostData(postData);
  if (!decompressedBody) {
    return {
      body: postData,
      headers
    };
  }

  deleteHeader(headers, "content-encoding");
  deleteHeader(headers, "content-length");
  return {
    body: decompressedBody,
    headers
  };
}

function fetchBodyInit(body: Buffer | string | undefined): BodyInit | undefined {
  if (Buffer.isBuffer(body)) {
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  }
  return body;
}

function cdpRequestPostDataBody(request: CdpFetchRequestPausedParams["request"] | undefined): Buffer | string | undefined {
  const entries = Array.isArray(request?.postDataEntries) ? request.postDataEntries : [];
  const entryBuffers = entries
    .map((entry) => typeof entry?.bytes === "string" ? Buffer.from(entry.bytes, "base64") : Buffer.alloc(0))
    .filter((entry) => entry.length > 0);
  if (entryBuffers.length > 0) {
    return Buffer.concat(entryBuffers);
  }

  return typeof request?.postData === "string" ? request.postData : undefined;
}

function hasRequestContentEncoding(headers: Record<string, string>, encoding: string): boolean {
  const expected = encoding.toLowerCase();
  const value = headerValue(headers, "content-encoding").toLowerCase();
  return value
    .split(",")
    .map((item) => item.trim())
    .some((item) => item === expected || item === `x-${expected}`);
}

function headerValue(headers: Record<string, string>, name: string): string {
  const expected = name.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === expected) {
      return value;
    }
  }
  return "";
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  const expected = name.toLowerCase();
  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === expected) {
      delete headers[headerName];
    }
  }
}

function gunzipCdpPostData(postData: Buffer | string): Buffer | undefined {
  if (Buffer.isBuffer(postData)) {
    try {
      return gunzipSync(postData);
    } catch {
      return undefined;
    }
  }

  for (const body of cdpPostDataBufferCandidates(postData)) {
    try {
      return gunzipSync(body);
    } catch {
      // Try the next CDP string representation.
    }
  }
  return undefined;
}

function cdpPostDataBufferCandidates(postData: string): Buffer[] {
  const candidates = [
    Buffer.from(postData, "latin1"),
    Buffer.from(postData, "base64"),
    Buffer.from(postData, "utf8")
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.length}:${candidate.subarray(0, 32).toString("base64")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function claudeDesignWebRequestUrlPatterns(options: Pick<ClaudeDesignWindowCdpOptions, "hosts">): string[] {
  return normalizeHostList(options.hosts).flatMap((host) => [
    `https://${host}/*`,
    `http://${host}/*`
  ]);
}

function responseHeadersForCdp(headers: Headers): Array<{ name: string; value: string }> {
  const blocked = new Set(["connection", "content-encoding", "content-length", "keep-alive", "transfer-encoding"]);
  const responseHeaders: Array<{ name: string; value: string }> = [];
  headers.forEach((value, name) => {
    if (!blocked.has(name.toLowerCase())) {
      responseHeaders.push({ name, value });
    }
  });
  return responseHeaders;
}

function logClaudeDesignRedirect(state: ClaudeDesignWindowRedirectState, requestUrl: string, redirectUrl: string): void {
  if (process.env.NODE_ENV !== "development" || state.loggedRedirectCount >= 40) {
    return;
  }
  state.loggedRedirectCount += 1;
  state.logger.info(
    `[claude-design] Redirecting window request ${safeUrlForLog(requestUrl)} -> ${safeUrlForLog(redirectUrl)}`
  );
}

function normalizeClaudeDesignWindowCdpOptions(
  options: Pick<ClaudeDesignWindowCdpOptions, "backendUrl" | "hosts" | "paths">
): Required<Pick<ClaudeDesignWindowCdpOptions, "backendUrl" | "hosts" | "paths">> {
  const backendUrl = normalizeHttpUrl(options.backendUrl);
  const hosts = normalizeHostList(options.hosts);
  const paths = normalizePathList(options.paths);
  if (!backendUrl || !hosts.length || !paths.length) {
    throw new Error("Claude Design CDP redirect options are incomplete.");
  }
  return {
    backendUrl,
    hosts,
    paths
  };
}

function gatewayOriginFromConfig(config: AppConfig): string {
  const host = normalizeGatewayHost(config.gateway?.host || config.HOST || "127.0.0.1");
  const port = Number.isInteger(config.gateway?.port) && config.gateway.port > 0
    ? config.gateway.port
    : Number.isInteger(config.PORT) && config.PORT > 0
      ? config.PORT
      : 3456;
  return `http://${host}:${port}`;
}

async function gatewayAuthHeaders(config: AppConfig): Promise<Record<string, string>> {
  const apiKey = gatewayAuthKeyFromConfig(config) || await persistedGatewayAuthKey();
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function gatewayAuthKeyFromConfig(config: AppConfig): string {
  return (Array.isArray(config.APIKEYS) ? config.APIKEYS : [])
    .map((item) => item.key?.trim() || "")
    .find(Boolean) || config.APIKEY?.trim() || "";
}

async function persistedGatewayAuthKey(): Promise<string> {
  try {
    return (await loadPersistedApiKeys())
      .map((item) => item.key?.trim() || "")
      .find(Boolean) || "";
  } catch {
    return "";
  }
}

export function gatewayAuthHeadersForTest(config: AppConfig, persistedApiKeys: Array<{ key?: string }> = []): Record<string, string> {
  const apiKey = (Array.isArray(config.APIKEYS) ? config.APIKEYS : [])
    .map((item) => item.key?.trim() || "")
    .find(Boolean) || config.APIKEY?.trim() || persistedApiKeys
      .map((item) => item.key?.trim() || "")
      .find(Boolean);
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function normalizeGatewayHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::" || trimmed === "[::]") {
    return "127.0.0.1";
  }
  if (trimmed.includes(":") && !trimmed.startsWith("[")) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

function normalizeHttpUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeUrlForLog(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.search) {
      url.search = "?...";
    }
    if (url.hash) {
      url.hash = "#...";
    }
    return url.toString();
  } catch {
    return "<invalid-url>";
  }
}

function normalizeHostList(values: unknown[]): string[] {
  const hosts = new Set<string>();
  for (const value of values) {
    const host = normalizeHost(value);
    if (host) {
      hosts.add(host);
    }
  }
  return [...hosts];
}

function normalizeHost(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.host;
  } catch {
    return trimmed.split("/")[0]?.trim() || "";
  }
}

function normalizePathList(values: unknown[]): string[] {
  const paths = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const path = normalizePath(value);
    if (path) {
      paths.add(path);
    }
  }
  return [...paths];
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

function hostMatches(url: URL, hosts: string[]): boolean {
  const requestHost = url.host.toLowerCase();
  const requestHostname = url.hostname.toLowerCase();
  return hosts.some((host) => host.includes(":") ? host === requestHost : host === requestHostname);
}

function pathMatches(pathname: string, paths: string[]): boolean {
  const path = normalizePath(pathname) || "/";
  return paths.some((prefix) =>
    prefix === "/" ||
    path === prefix ||
    path.startsWith(`${prefix}/`)
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
