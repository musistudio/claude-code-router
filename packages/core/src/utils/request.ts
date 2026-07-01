import { ProxyAgent } from "undici";
import { UnifiedChatRequest } from "../types/llm";
import { parseNoProxy } from "@CCR/shared";

function isIpAddress(s: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return true;
  if (s.includes(":")) return true;
  return false;
}

function shouldBypassProxy(hostname: string, noProxyList: string[]): boolean {
  if (noProxyList.length === 0) return false;

  for (const pattern of noProxyList) {
    if (pattern === "*") return true;

    if (pattern.startsWith(".")) {
      if (!isIpAddress(hostname)) {
        if (hostname.endsWith(pattern) || hostname === pattern.slice(1)) {
          return true;
        }
      }
      continue;
    }

    if (pattern.includes("/")) {
      if (isInCidr(hostname, pattern)) return true;
      continue;
    }

    if (hostname.toLowerCase() === pattern.toLowerCase()) return true;
  }

  return false;
}

function isInCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipToInt(ip);
  const netInt = ipToInt(network);
  if (ipInt === null || netInt === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0;
}

export function sendUnifiedRequest(
  url: URL | string,
  request: UnifiedChatRequest,
  config: any,
  context: any,
  logger?: any
): Promise<Response> {
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
  let combinedSignal: AbortSignal;
  const timeoutSignal = AbortSignal.timeout(config.TIMEOUT ?? 60 * 1000 * 60);

  if (config.signal) {
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    config.signal.addEventListener("abort", abortHandler);
    timeoutSignal.addEventListener("abort", abortHandler);
    combinedSignal = controller.signal;
  } else {
    combinedSignal = timeoutSignal;
  }

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(request),
    signal: combinedSignal,
  };

  if (config.httpsProxy) {
    const targetUrl = typeof url === "string" ? new URL(url) : url;
    const noProxyList = parseNoProxy(config.noProxy);
    const shouldProxy = !shouldBypassProxy(targetUrl.hostname, noProxyList);

    if (shouldProxy) {
      (fetchOptions as any).dispatcher = new ProxyAgent(
        new URL(config.httpsProxy).toString()
      );
    }
  }
  logger?.debug(
    {
      reqId: context.req.id,
      request: fetchOptions,
      headers: Object.fromEntries(headers.entries()),
      requestUrl: typeof url === "string" ? url : url.toString(),
      useProxy: config.httpsProxy,
      noProxy: config.noProxy,
    },
    "final request"
  );
  return fetch(typeof url === "string" ? url : url.toString(), fetchOptions);
}
