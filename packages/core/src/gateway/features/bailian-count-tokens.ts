import type { IncomingMessage, ServerResponse } from "node:http";
import { isGatewayProviderEnabled, type ApiKeyConfig, type AppConfig, type GatewayProviderConfig } from "@ccr/core/contracts/app";
import type { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin";
import { ccrRouteHeaderNames } from "@ccr/core/gateway/core-runtime/router-plugin-contract";
import { mergeUpstreamProviderHeaders } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer";
import { isBailianAnthropicBaseUrl, normalizeBailianThinking } from "@ccr/core/gateway/features/bailian-thinking";
import { filteredResponseHeaders, forwardHeaders, stripLocalGatewayAuthHeaders } from "@ccr/core/gateway/http/io";
import { isRecord } from "@ccr/core/gateway/internal/value";
import { selectProviderCredentials } from "@ccr/core/gateway/upstream/executor";
import { isModelAllowedForProfile, profileForApiKey } from "@ccr/core/profiles/model-allowlist";
import { activeProviderCredentials, providerCapabilityForClientProtocol, providerProtocolForClientProtocol, toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology";
import { normalizeProviderBaseUrl } from "@ccr/core/providers/url";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import { modelRegistryForConfig } from "@ccr/core/routing/model-registry";

const countTokensTimeoutMs = 30_000;
const maxCountTokensResponseBytes = 1024 * 1024;

export type BailianCountTokensResponse = {
  body: Buffer;
  headers: Record<string, string>;
  statusCode: number;
};

/** Return undefined only when the selected upstream is not native Bailian. */
export async function forwardBailianCountTokens(input: {
  apiKey?: ApiKeyConfig;
  body: Record<string, unknown>;
  config: AppConfig;
  headers: IncomingMessage["headers"];
  request?: IncomingMessage;
  response?: ServerResponse;
  router: ClaudeCodeRouterPlugin;
}): Promise<BailianCountTokensResponse | undefined> {
  if (!input.config.Providers.some(isNativeBailianProvider)) return undefined;
  const headers = forwardHeaders(input.headers);
  stripLocalGatewayAuthHeaders(headers);
  for (const name of ccrRouteHeaderNames) delete headers[name];
  delete headers["x-auth-api-key-id"];
  delete headers["x-auth-sub"];
  if (input.apiKey) {
    headers["x-auth-api-key-id"] = input.apiKey.id;
    headers["x-auth-sub"] = input.apiKey.id;
  }

  // Use the inference route so rules and profile model mappings select the
  // same provider; count_tokens itself is not an inference routing endpoint.
  const routed = await input.router.routeRequest({
    body: input.body,
    headers,
    method: "POST",
    url: "/v1/messages"
  });
  const target = modelRegistryForConfig(input.config).resolve(routed.decision.model);
  if (target?.kind !== "provider" || providerProtocolForClientProtocol(target.provider, "anthropic_messages") !== "anthropic_messages") {
    return undefined;
  }
  const providers = toCoreGatewayProviders(target.provider).filter((provider) => provider.type === "anthropic_messages");
  const first = providers[0];
  if (!first?.baseurl || !isBailianAnthropicBaseUrl(first.baseurl)) return undefined;

  const profile = profileForApiKey(input.config, input.apiKey);
  if (!isModelAllowedForProfile(input.config, profile, target.canonicalSelector)) {
    return countTokensError(403, "permission_error", "The routed model is not allowed for this profile.");
  }
  const credentials = activeProviderCredentials(target.provider);
  const selected = credentials.length
    ? selectProviderCredentials(target.provider, "anthropic_messages", credentials, { imageCount: 0, totalTokens: 0 }).credentials[0]
    : undefined;
  const provider = selected ? providers.find((item) => item.name === selected.internalName) : first;
  if (!provider?.apikey || !provider.baseurl) {
    return countTokensError(503, "api_error", "Bailian token counting has no available upstream API key.");
  }
  const extraHeaders = isRecord(provider.extraHeaders)
    ? Object.fromEntries(Object.entries(provider.extraHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const upstreamHeaders = mergeUpstreamProviderHeaders({ ...input.headers, cookie: undefined }, {
    "content-type": "application/json",
    "anthropic-version": headers["anthropic-version"] || "2023-06-01",
    "x-api-key": provider.apikey,
    ...extraHeaders
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  const onClose = () => { if (!input.response?.writableEnded) abort(); };
  input.request?.once("aborted", abort);
  input.response?.once("close", onClose);
  if (input.request?.aborted || input.response?.destroyed) abort();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(countTokensTimeoutMs)]);
  try {
    const url = `${provider.baseurl.replace(/\/+$/, "")}/v1/messages/count_tokens`;
    const response = await fetchWithSystemProxy(url, {
      body: JSON.stringify(normalizeBailianThinking({ ...routed.body, model: target.model }, url)),
      headers: upstreamHeaders,
      method: "POST",
      redirect: "manual",
      signal
    });
    const body = await readCountTokensResponse(response);
    if (response.ok) {
      let payload: unknown;
      try { payload = JSON.parse(body.toString("utf8")); } catch { /* Validate below. */ }
      if (!isRecord(payload) || !Number.isSafeInteger(payload.input_tokens) || Number(payload.input_tokens) < 0) {
        return countTokensError(502, "api_error", "Bailian returned an invalid token count response.");
      }
    }
    const responseHeaders = new Headers(response.headers);
    // Fetch may decode compression; its original wire length no longer applies.
    responseHeaders.delete("content-length");
    return { body, headers: Object.fromEntries(filteredResponseHeaders(responseHeaders)), statusCode: response.status };
  } catch {
    if (controller.signal.aborted) return countTokensError(499, "api_error", "Client disconnected.");
    return signal.aborted
      ? countTokensError(504, "api_error", "Bailian token counting timed out.")
      : countTokensError(502, "api_error", "Bailian token counting failed.");
  } finally {
    input.request?.removeListener("aborted", abort);
    input.response?.removeListener("close", onClose);
  }
}

function isNativeBailianProvider(provider: GatewayProviderConfig): boolean {
  if (!isGatewayProviderEnabled(provider) || providerProtocolForClientProtocol(provider, "anthropic_messages") !== "anthropic_messages") return false;
  const baseUrl = providerCapabilityForClientProtocol(provider, "anthropic_messages")?.baseUrl ||
    provider.baseurl || provider.baseUrl || provider.api_base_url || "";
  return isBailianAnthropicBaseUrl(normalizeProviderBaseUrl(baseUrl, "anthropic_messages"));
}

async function readCountTokensResponse(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks, bytes);
      bytes += next.value.byteLength;
      if (bytes > maxCountTokensResponseBytes) throw new Error("Token count response is too large.");
      chunks.push(Buffer.from(next.value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function countTokensError(statusCode: number, type: string, message: string): BailianCountTokensResponse {
  return {
    body: Buffer.from(JSON.stringify({ type: "error", error: { type, message } })),
    headers: { "content-type": "application/json" },
    statusCode
  };
}
