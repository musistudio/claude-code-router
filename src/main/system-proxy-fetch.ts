import { ProxyAgent, type Dispatcher } from "undici";
import { loadAppConfig } from "./config";
import { readCurrentSystemUpstreamProxy, systemProxyManager, type UpstreamProxyConfig, type UpstreamProxyServer } from "../server/proxy/system-proxy";
import type { AppConfig } from "../shared/app";

type FetchInitWithDispatcher = RequestInit & {
  dispatcher?: Dispatcher;
};

type SystemProxyCache = {
  expiresAt: number;
  managedEndpointUrl: string;
  upstreamProxy?: UpstreamProxyConfig;
};

const proxyRefreshIntervalMs = 30 * 1000;
const fallbackManagedEndpointUrl = "http://127.0.0.1:65535";

const proxyDispatchers = new Map<string, Dispatcher>();

let systemProxyCache: SystemProxyCache | undefined;
let systemProxyReadPromise: Promise<SystemProxyCache> | undefined;

export async function fetchWithSystemProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = requestUrl(input);
  if (!url || !isHttpUrl(url) || shouldBypassProxy(url)) {
    return fetch(input, init);
  }

  const proxyUrl = await systemProxyUrlForRequest(url);
  if (!proxyUrl) {
    return fetch(input, init);
  }

  return fetch(input, {
    ...init,
    dispatcher: proxyDispatcher(proxyUrl)
  } as FetchInitWithDispatcher);
}

export async function getSystemProxyUrlForProtocol(protocol: "http" | "https" = "https"): Promise<string | undefined> {
  const cache = await readSystemProxy();
  const server = proxyServerForRequest(cache.upstreamProxy, protocol);
  return server ? formatProxyUrl(server) : undefined;
}

async function systemProxyUrlForRequest(url: URL): Promise<string | undefined> {
  const cache = await readSystemProxy();
  const server = proxyServerForRequest(cache.upstreamProxy, url.protocol === "https:" ? "https" : "http");
  return server ? formatProxyUrl(server) : undefined;
}

async function readSystemProxy(): Promise<SystemProxyCache> {
  const now = Date.now();
  const activeManagedEndpointUrl = systemProxyManager.getManagedEndpointUrl();
  if (
    systemProxyCache &&
    systemProxyCache.expiresAt > now &&
    (!activeManagedEndpointUrl || systemProxyCache.managedEndpointUrl === activeManagedEndpointUrl)
  ) {
    return systemProxyCache;
  }
  if (systemProxyReadPromise) {
    return systemProxyReadPromise;
  }

  systemProxyReadPromise = readSystemProxyUncached()
    .then((cache) => {
      systemProxyCache = {
        ...cache,
        expiresAt: Date.now() + proxyRefreshIntervalMs
      };
      return systemProxyCache;
    })
    .finally(() => {
      systemProxyReadPromise = undefined;
    });

  return systemProxyReadPromise;
}

async function readSystemProxyUncached(): Promise<Omit<SystemProxyCache, "expiresAt">> {
  const { managedEndpointUrl, systemProxyActive } = await readManagedProxyEndpoint();
  if (systemProxyActive) {
    const managedUpstreamProxy = systemProxyManager.getUpstreamProxy();
    if (managedUpstreamProxy) {
      return {
        managedEndpointUrl,
        upstreamProxy: managedUpstreamProxy
      };
    }
  }

  try {
    return {
      managedEndpointUrl,
      upstreamProxy: await readCurrentSystemUpstreamProxy(managedEndpointUrl)
    };
  } catch (error) {
    console.warn(`[network] Failed to read system proxy: ${formatError(error)}`);
    return { managedEndpointUrl };
  }
}

async function readManagedProxyEndpoint(): Promise<{ managedEndpointUrl: string; systemProxyActive: boolean }> {
  const activeManagedEndpointUrl = systemProxyManager.getManagedEndpointUrl();
  if (activeManagedEndpointUrl) {
    return {
      managedEndpointUrl: activeManagedEndpointUrl,
      systemProxyActive: true
    };
  }

  try {
    const config = await loadAppConfig();
    return {
      managedEndpointUrl: managedProxyEndpointUrl(config),
      systemProxyActive: config.proxy.enabled && config.proxy.systemProxy
    };
  } catch (error) {
    console.warn(`[network] Failed to read proxy config: ${formatError(error)}`);
  }
  return {
    managedEndpointUrl: fallbackManagedEndpointUrl,
    systemProxyActive: false
  };
}

function managedProxyEndpointUrl(config: AppConfig): string {
  const host = normalizeManagedProxyHost(config.gateway.host);
  return `http://${formatProxyHost(host)}:${config.gateway.port}`;
}

function normalizeManagedProxyHost(host: string): string {
  const normalized = host.trim();
  if (!normalized || normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]") {
    return "127.0.0.1";
  }
  return normalized;
}

function proxyServerForRequest(upstreamProxy: UpstreamProxyConfig | undefined, protocol: "http" | "https"): UpstreamProxyServer | undefined {
  if (!upstreamProxy) {
    return undefined;
  }
  if (protocol === "https") {
    return upstreamProxy.https ?? upstreamProxy.http;
  }
  return upstreamProxy.http ?? upstreamProxy.https;
}

function proxyDispatcher(proxyUrl: string): Dispatcher {
  const existing = proxyDispatchers.get(proxyUrl);
  if (existing) {
    return existing;
  }
  const dispatcher = new ProxyAgent(proxyUrl);
  proxyDispatchers.set(proxyUrl, dispatcher);
  return dispatcher;
}

function formatProxyUrl(server: UpstreamProxyServer): string {
  return `${server.protocol}://${formatProxyHost(server.host)}:${server.port}`;
}

function formatProxyHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function requestUrl(input: RequestInfo | URL): URL | undefined {
  try {
    if (input instanceof URL) {
      return input;
    }
    if (typeof input === "string") {
      return new URL(input);
    }
    return new URL(input.url);
  } catch {
    return undefined;
  }
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function shouldBypassProxy(url: URL): boolean {
  const hostname = normalizeHostname(url.hostname);
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("127.") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "0:0:0:0:0:0:0:1";
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[(.*)]$/, "$1").replace(/\.$/, "");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
