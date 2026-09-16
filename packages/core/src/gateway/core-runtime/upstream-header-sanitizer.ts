import { randomUUID } from "node:crypto";
import { applyMetaTokenFloor } from "@ccr/core/gateway/core-runtime/meta-token-floor";
import { applyResponsesSessionAffinity, inboundMetadataUserId, resolveResponsesSessionKey } from "@ccr/core/gateway/core-runtime/responses-session-affinity";
import type { ResponsesSessionAffinityInput } from "@ccr/core/gateway/core-runtime/responses-session-affinity";
import { applyResponsesToolStrictness } from "@ccr/core/gateway/core-runtime/responses-tool-strictness";
import type { ResponsesToolStrictnessInput } from "@ccr/core/gateway/core-runtime/responses-tool-strictness";
import { sdkCompatibleTokenHeaderNames } from "@ccr/core/gateway/internal/shared";

type UpstreamRequest = {
  body: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  headers: Record<string, string>;
  method?: string;
  url: string;
};

type ProviderPluginRequestInput = {
  config?: {
    anthropicBaseUrl?: string;
  };
  request?: {
    body?: unknown;
    id?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
  targetProviderConfig?: {
    apikey?: string;
    baseurl?: string;
    type?: string;
  };
  upstreamRequest: UpstreamRequest;
};

const ccrAuthHeaderNames = new Set([
  "x-auth-api-key-id",
  "x-auth-sub"
]);

const ccrRoutingHeaderNames = new Set([
  "x-gateway-target-provider",
  "x-gateway-target-provider-name",
  "x-target-model",
  "x-target-provider",
  "x-target-providers"
]);

const clientAuthHeaderNames = new Set<string>(sdkCompatibleTokenHeaderNames);

const proxyMetadataHeaderNames = new Set([
  "forwarded",
  "via",
  "x-real-ip"
]);

const transportHeaderNames = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const openCodeSessionFallbackId = randomUUID();
const openCodeSessionHeaderMaxLength = 200;

/**
 * Body fields such as `metadata.user_id` are client-controlled and can carry
 * control characters, non-ByteString code points, or unbounded length. Those
 * values would make Node's fetch throw before the request leaves the process,
 * so reject anything not header-safe and fall back to the generated session id.
 */
function sanitizeOpenCodeSessionHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  for (const character of trimmed) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || code > 0xff) {
      return undefined;
    }
  }
  return trimmed.slice(0, openCodeSessionHeaderMaxLength);
}

function requestHeaderValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  for (const [headerName, headerValue] of Object.entries(headers ?? {})) {
    if (headerName.trim().toLowerCase() !== name) {
      continue;
    }
    const values = Array.isArray(headerValue) ? headerValue : [headerValue];
    for (const value of values) {
      const trimmed = value?.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

/**
 * Removes CCR-owned routing, authentication and observability metadata at the
 * final provider boundary. Provider credentials and non-CCR custom X-Auth
 * headers are deliberately preserved.
 */
export function sanitizeUpstreamProviderHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.trim().toLowerCase();
    if (normalized.startsWith("x-ccr-") || ccrAuthHeaderNames.has(normalized)) continue;
    sanitized[name] = value;
  }
  return sanitized;
}

/**
 * Restores client headers after the core protocol adapter has rebuilt the
 * provider request. Provider-generated auth and content headers win on name
 * collisions, while transport, proxy metadata and CCR-owned headers never
 * cross the boundary.
 */
export function mergeUpstreamProviderHeaders(
  requestHeaders: Record<string, string | string[] | undefined> | undefined,
  upstreamHeaders: Record<string, string>
): Record<string, string> {
  const connectionHeaders = new Set(transportHeaderNames);
  for (const value of headerValues(requestHeaders?.connection)) {
    for (const name of value.split(",")) {
      const normalized = name.trim().toLowerCase();
      if (normalized) connectionHeaders.add(normalized);
    }
  }

  const merged: Record<string, string> = {};
  for (const [name, value] of Object.entries(requestHeaders ?? {})) {
    const normalized = name.trim().toLowerCase();
    if (
      !normalized ||
      value === undefined ||
      normalized.startsWith("x-ccr-") ||
      ccrAuthHeaderNames.has(normalized) ||
      ccrRoutingHeaderNames.has(normalized) ||
      clientAuthHeaderNames.has(normalized) ||
      proxyMetadataHeaderNames.has(normalized) ||
      normalized.startsWith("x-forwarded-") ||
      connectionHeaders.has(normalized)
    ) {
      continue;
    }
    merged[normalized] = Array.isArray(value) ? value.join(",") : value;
  }

  for (const [name, value] of Object.entries(sanitizeUpstreamProviderHeaders(upstreamHeaders))) {
    const normalized = name.trim().toLowerCase();
    if (!normalized || connectionHeaders.has(normalized)) continue;
    merged[normalized] = value;
  }
  return merged;
}

export function rewriteUpstreamProviderUrl(
  upstreamUrl: string,
  targetProviderConfig: ProviderPluginRequestInput["targetProviderConfig"],
  config: ProviderPluginRequestInput["config"]
): string {
  const providerType = targetProviderConfig?.type?.trim().toLowerCase();
  if (providerType !== "anthropic_messages" && providerType !== "anthropic") {
    return upstreamUrl;
  }

  return rewriteUrlBase(upstreamUrl, config?.anthropicBaseUrl, targetProviderConfig?.baseurl);
}

function headerValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function rewriteUrlBase(upstreamUrl: string, fromBaseUrl: string | undefined, toBaseUrl: string | undefined): string {
  if (!fromBaseUrl || !toBaseUrl) {
    return upstreamUrl;
  }

  try {
    const upstream = new URL(upstreamUrl);
    const from = new URL(fromBaseUrl);
    const to = new URL(toBaseUrl);
    if (upstream.protocol !== from.protocol || upstream.host !== from.host) {
      return upstreamUrl;
    }

    const fromPath = basePath(from.pathname);
    if (fromPath && upstream.pathname !== fromPath && !upstream.pathname.startsWith(`${fromPath}/`)) {
      return upstreamUrl;
    }

    const remainderPath = fromPath ? upstream.pathname.slice(fromPath.length) || "/" : upstream.pathname;
    to.pathname = joinUrlPath(basePath(to.pathname), remainderPath);
    to.search = upstream.search;
    to.hash = upstream.hash;
    return to.toString();
  } catch {
    return upstreamUrl;
  }
}

function basePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === "/" ? "" : normalized;
}

function joinUrlPath(base: string, remainder: string): string {
  const normalizedRemainder = remainder.replace(/^\/+/, "");
  if (!base) {
    return `/${normalizedRemainder}`;
  }
  if (!normalizedRemainder) {
    return base;
  }
  return `${base}/${normalizedRemainder}`;
}

export function createGatewayPlugin() {
  return {
    providerHooks: [{
      key: "ccr-upstream-header-sanitizer",
      transformRequest(input: ProviderPluginRequestInput) {
        const upstreamRequest = {
          ...input.upstreamRequest,
          headers: mergeUpstreamProviderHeaders(input.request?.headers, input.upstreamRequest.headers),
          url: rewriteUpstreamProviderUrl(input.upstreamRequest.url, input.targetProviderConfig, input.config)
        };
        const apiKey = input.targetProviderConfig?.apikey?.trim();
        if (!upstreamRequest.headers["x-opencode-session"]?.trim()) {
          try {
            const url = new URL(upstreamRequest.url);
            if (
              url.protocol === "https:" &&
              url.hostname === "opencode.ai" &&
              (url.port === "" || url.port === "443") &&
              /^\/zen\/go\/v1(?:\/|$)/.test(url.pathname)
            ) {
              const explicitClientSession = sanitizeOpenCodeSessionHeaderValue(
                requestHeaderValue(input.request?.headers, "x-opencode-session")
              );
              const claudeSessionId = explicitClientSession || sanitizeOpenCodeSessionHeaderValue(
                resolveResponsesSessionKey(
                  input.request?.headers,
                  inboundMetadataUserId(input.request?.body)
                )
              );
              upstreamRequest.headers["x-opencode-session"] = claudeSessionId || `ccr-${openCodeSessionFallbackId}`;
            }
          } catch {
            // Invalid URLs are reported by the upstream transport.
          }
        }
        if (apiKey?.startsWith("AIza") && /^gemini(?:_|$)/.test(input.targetProviderConfig?.type ?? "")) {
          try {
            const url = new URL(upstreamRequest.url);
            if (url.hostname === "generativelanguage.googleapis.com") {
              if (upstreamRequest.headers.authorization === `Bearer ${apiKey}`) delete upstreamRequest.headers.authorization;
              upstreamRequest.headers["x-goog-api-key"] = apiKey;
              url.searchParams.set("key", apiKey);
              upstreamRequest.url = url.toString();
            }
          } catch {
            // Invalid URLs are reported by the upstream transport.
          }
        }
        return {
          ok: true as const,
          value: applyMetaTokenFloor(upstreamRequest)
        };
      }
    }, {
      key: "ccr-responses-session-affinity",
      transformRequest(input: ResponsesSessionAffinityInput) {
        return {
          ok: true as const,
          value: applyResponsesSessionAffinity(input)
        };
      }
    }, {
      key: "ccr-responses-tool-strictness",
      transformRequest(input: ResponsesToolStrictnessInput) {
        return {
          ok: true as const,
          value: applyResponsesToolStrictness(input)
        };
      }
    }]
  };
}
