import type { WebContents } from "electron";
import type { AppConfig } from "@ccr/core/contracts/app";

export type ClaudeDesignWindowCdpOptions = {
  backendUrl: string;
  hosts: string[];
  logger?: Pick<Console, "warn">;
  paths: string[];
};

type ClaudeDesignPluginStatus = {
  backend?: unknown;
  proxy?: {
    fallbackHosts?: unknown;
    host?: unknown;
    paths?: unknown;
  };
};

type CdpFetchRequestPausedParams = {
  request?: {
    url?: string;
  };
  requestId?: string;
};

type ClaudeDesignWindowCdpState = {
  listener: (event: unknown, method: string, params?: unknown) => void;
  logger: Pick<Console, "warn">;
  options: Required<Pick<ClaudeDesignWindowCdpOptions, "backendUrl" | "hosts" | "paths">>;
};

const claudeDesignAdminPath = "/plugins/claude-design";
const claudeDesignCdpProtocolVersion = "1.3";
const claudeDesignStatusTimeoutMs = 5_000;
const cdpStates = new WeakMap<object, ClaudeDesignWindowCdpState>();

export async function loadClaudeDesignWindowCdpOptions(config: AppConfig): Promise<ClaudeDesignWindowCdpOptions> {
  const statusUrl = new URL(claudeDesignAdminPath, gatewayOriginFromConfig(config));
  const headers = gatewayAuthHeaders(config);
  const response = await fetch(statusUrl, {
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(claudeDesignStatusTimeoutMs)
  });
  if (!response.ok) {
    throw new Error(`Claude Design plugin status returned HTTP ${response.status}.`);
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
  const state = ensureClaudeDesignWindowCdpState(webContents, normalized, logger);

  try {
    if (!webContents.debugger.isAttached()) {
      webContents.debugger.attach(claudeDesignCdpProtocolVersion);
    }
    await webContents.debugger.sendCommand("Fetch.enable", {
      patterns: claudeDesignCdpFetchPatterns(normalized)
    });
    await webContents.debugger.sendCommand("Page.setBypassCSP", { enabled: true }).catch(() => undefined);
  } catch (error) {
    logger.warn(`[claude-design] Failed to attach CDP request redirector: ${formatError(error)}`);
    if (cdpStates.get(webContents) === state) {
      cdpStates.delete(webContents);
      webContents.debugger.removeListener("message", state.listener);
    }
    throw error;
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
  if (!pathMatches(parsed.pathname, normalized.paths)) {
    return undefined;
  }

  const target = new URL(normalized.backendUrl);
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = "";
  return target.toString();
}

function ensureClaudeDesignWindowCdpState(
  webContents: WebContents,
  options: Required<Pick<ClaudeDesignWindowCdpOptions, "backendUrl" | "hosts" | "paths">>,
  logger: Pick<Console, "warn">
): ClaudeDesignWindowCdpState {
  const existing = cdpStates.get(webContents);
  if (existing) {
    existing.options = options;
    existing.logger = logger;
    return existing;
  }

  const state: ClaudeDesignWindowCdpState = {
    listener: (_event, method, params) => {
      if (method !== "Fetch.requestPaused") {
        return;
      }
      void handleClaudeDesignRequestPaused(webContents, state, params as CdpFetchRequestPausedParams);
    },
    logger,
    options
  };
  cdpStates.set(webContents, state);
  webContents.debugger.on("message", state.listener);
  webContents.once("destroyed", () => {
    cdpStates.delete(webContents);
  });
  return state;
}

async function handleClaudeDesignRequestPaused(
  webContents: WebContents,
  state: ClaudeDesignWindowCdpState,
  params: CdpFetchRequestPausedParams
): Promise<void> {
  const requestId = params.requestId;
  if (!requestId || webContents.isDestroyed()) {
    return;
  }
  const requestUrl = params.request?.url || "";
  const redirectUrl = claudeDesignRedirectUrlForRequest(requestUrl, state.options);
  try {
    await webContents.debugger.sendCommand("Fetch.continueRequest", {
      ...(redirectUrl ? { url: redirectUrl } : {}),
      requestId
    });
  } catch (error) {
    state.logger.warn(`[claude-design] Failed to continue CDP request ${requestUrl}: ${formatError(error)}`);
  }
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

function gatewayAuthHeaders(config: AppConfig): Record<string, string> {
  const apiKey = (Array.isArray(config.APIKEYS) ? config.APIKEYS : [])
    .map((item) => item.key?.trim() || "")
    .find(Boolean) || config.APIKEY?.trim();
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
