import { ProxyAgent, Pool } from "undici";
import { UnifiedChatRequest } from "../types/llm";

const proxyDispatchers = new Map<string, ProxyAgent>();
const originDispatchers = new Map<
  string,
  { headersTimeout: number; pool: Pool }
>();

const getHeadersTimeout = (rawValue: unknown): number => {
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 0) {
    return rawValue;
  }
  if (typeof rawValue === "string") {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 300000;
};

const getDispatcher = (
  url: URL | string,
  config: any
): ProxyAgent | Pool => {
  const headersTimeout = getHeadersTimeout(config.headersTimeout);

  if (config.httpsProxy) {
    const proxyUrl = new URL(config.httpsProxy).toString();
    let proxyDispatcher = proxyDispatchers.get(proxyUrl);
    if (!proxyDispatcher) {
      proxyDispatcher = new ProxyAgent(proxyUrl);
      proxyDispatchers.set(proxyUrl, proxyDispatcher);
    }
    return proxyDispatcher;
  }

  const targetUrl = typeof url === "string" ? new URL(url) : url;
  const origin = targetUrl.origin;
  const cachedOrigin = originDispatchers.get(origin);

  if (!cachedOrigin) {
    const pool = new Pool(origin, { headersTimeout });
    originDispatchers.set(origin, { headersTimeout, pool });
    return pool;
  }

  if (cachedOrigin.headersTimeout !== headersTimeout) {
    cachedOrigin.pool.close().catch(() => undefined);
    const pool = new Pool(origin, { headersTimeout });
    originDispatchers.set(origin, { headersTimeout, pool });
    return pool;
  }

  return cachedOrigin.pool;
};

export function sendUnifiedRequest(
  url: URL | string,
  request: UnifiedChatRequest,
  config: any,
  context: any,
  logger?: any
): Promise<Response> {
  const requestUrl = typeof url === "string" ? url : url.toString();
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (config.headers) {
    Object.entries(config.headers).forEach(([key, value]) => {
      if (value) {
        headers.set(key, value as string);
      }
    });
  }
  const timeoutSignal = AbortSignal.timeout(config.TIMEOUT ?? 60 * 1000 * 60);
  const combinedSignal = config.signal
    ? AbortSignal.any([config.signal, timeoutSignal])
    : timeoutSignal;

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(request),
    signal: combinedSignal,
  };

  (fetchOptions as any).dispatcher = getDispatcher(url, config);

  logger?.debug(
    {
      reqId: context.req.id,
      request: fetchOptions,
      headers: Object.fromEntries(headers.entries()),
      requestUrl,
      useProxy: config.httpsProxy,
    },
    "final request"
  );
  return fetch(requestUrl, fetchOptions);
}
