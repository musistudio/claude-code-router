import { ProxyAgent } from "undici";
import { UnifiedChatRequest } from "../types/llm";

// Headers that are Anthropic-specific and must be stripped for non-Anthropic providers
const ANTHROPIC_ONLY_HEADERS = [
  "anthropic-beta",
  "anthropic-version",
];

export function sendUnifiedRequest(
  url: URL | string,
  request: UnifiedChatRequest,
  config: any,
  context: any,
  logger?: any
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.headers) {
    Object.entries(config.headers).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        headers[key] = value as string;
      }
    });
  }
  // Remove Expect header to prevent undici issues
  delete headers["expect"];
  delete headers["Expect"];

  // Strip Anthropic-specific headers when forwarding to non-Anthropic providers
  if (config.stripAnthropicHeaders) {
    for (const headerName of ANTHROPIC_ONLY_HEADERS) {
      delete headers[headerName];
    }
    for (const key of Object.keys(headers)) {
      if (ANTHROPIC_ONLY_HEADERS.includes(key.toLowerCase())) {
        delete headers[key];
      }
    }
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
    (fetchOptions as any).dispatcher = new ProxyAgent(
      new URL(config.httpsProxy).toString()
    );
  }
  logger?.debug(
    {
      reqId: context.req.id,
      request: fetchOptions,
      headers: headers,
      requestUrl: typeof url === "string" ? url : url.toString(),
      useProxy: config.httpsProxy,
    },
    "final request"
  );
  return fetch(typeof url === "string" ? url : url.toString(), fetchOptions);
}
