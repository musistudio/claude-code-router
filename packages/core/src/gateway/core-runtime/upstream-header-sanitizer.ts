import { randomUUID } from "node:crypto";
import { CODEX_NATIVE_IMAGE_GENERATION_HEADER, CODEX_NATIVE_IMAGE_GENERATION_MARKER } from "@ccr/core/contracts/app";
import { applyMetaTokenFloor } from "@ccr/core/gateway/core-runtime/meta-token-floor";
import { applyResponsesSessionAffinity, inboundMetadataUserId, resolveResponsesSessionKey } from "@ccr/core/gateway/core-runtime/responses-session-affinity";
import type { ResponsesSessionAffinityInput } from "@ccr/core/gateway/core-runtime/responses-session-affinity";
import { applyResponsesToolStrictness } from "@ccr/core/gateway/core-runtime/responses-tool-strictness";
import type { ResponsesToolStrictnessInput } from "@ccr/core/gateway/core-runtime/responses-tool-strictness";
import {
  normalizeDeepSeekCacheUsage,
  normalizeDeepSeekCacheUsageStream
} from "@ccr/core/gateway/features/opencode-cache-usage";
import {
  ccrAnthropicBillingHeader,
  decodeCcrAnthropicBillingHeader
} from "@ccr/core/gateway/core-runtime/router-plugin-contract";
import {
  detachClaudeCodeBillingSystemBlock,
  isAnthropicMessagesRequestPath,
  isOfficialAnthropicMessagesTarget,
  restoreClaudeCodeBillingSystemBlock
} from "@ccr/core/gateway/features/claude-code-billing-header";
import { sdkCompatibleTokenHeaderNames } from "@ccr/core/gateway/internal/shared";
import { isRecord } from "@ccr/core/gateway/internal/value";

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
    url?: string;
  };
  targetProviderConfig?: {
    apikey?: string;
    baseurl?: string;
    type?: string;
  };
  upstreamRequest: UpstreamRequest;
};

type ProviderPluginResponseInput = {
  targetProviderConfig?: {
    baseurl?: string;
  };
  upstreamPayload: unknown;
  upstreamRequest: UpstreamRequest;
};

type GatewayPluginStreamInput = {
  targetProviderConfig?: {
    baseurl?: string;
  };
  upstreamRequest?: UpstreamRequest;
  upstreamResponse: Response;
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

const clientAuthHeaderNames = new Set<string>([
  ...sdkCompatibleTokenHeaderNames,
  "cookie"
]);

const proxyMetadataHeaderNames = new Set([
  "cdn-loop",
  "forwarded",
  "true-client-ip",
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

function isOfficialOpenCodeGoUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "opencode.ai" &&
      (url.port === "" || url.port === "443") &&
      /^\/zen\/go\/v1(?:\/|$)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isOfficialOpenCodeGoChatUrl(value: string | undefined): boolean {
  if (!value || !isOfficialOpenCodeGoUrl(value)) return false;
  const url = new URL(value);
  return /^\/zen\/go\/v1\/chat\/completions\/?$/.test(url.pathname);
}

function isOfficialOpenCodeGoChatRequest(
  upstreamUrl: string | undefined,
  configuredBaseUrl: string | undefined
): boolean {
  if (isOfficialOpenCodeGoChatUrl(upstreamUrl)) return true;
  if (!upstreamUrl || !isOfficialOpenCodeGoUrl(configuredBaseUrl)) return false;
  try {
    return /^\/zen\/go\/v1\/chat\/completions\/?$/.test(new URL(upstreamUrl).pathname);
  } catch {
    return false;
  }
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
    if (normalized.startsWith("x-ccr-") || ccrAuthHeaderNames.has(normalized) || isCodexNativeImageGenerationMarker(normalized, value)) continue;
    sanitized[name] = value;
  }
  return sanitized;
}

/**
 * Restores client headers after the core protocol adapter has rebuilt the
 * provider request, excluding client auth, cookies and proxy metadata (including
 * Cloudflare headers). Explicit provider headers win on name collisions and may
 * supply their own cookies or Cloudflare credentials. Transport and CCR-owned
 * headers remain excluded.
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
    const headerValue = Array.isArray(value) ? value.join(",") : value;
    if (
      !normalized ||
      headerValue === undefined ||
      normalized.startsWith("x-ccr-") ||
      ccrAuthHeaderNames.has(normalized) ||
      ccrRoutingHeaderNames.has(normalized) ||
      clientAuthHeaderNames.has(normalized) ||
      isCodexNativeImageGenerationMarker(normalized, headerValue) ||
      proxyMetadataHeaderNames.has(normalized) ||
      normalized.startsWith("cf-") ||
      normalized.startsWith("x-forwarded-") ||
      connectionHeaders.has(normalized)
    ) {
      continue;
    }
    merged[normalized] = headerValue;
  }

  for (const [name, value] of Object.entries(sanitizeUpstreamProviderHeaders(upstreamHeaders))) {
    const normalized = name.trim().toLowerCase();
    if (!normalized || connectionHeaders.has(normalized)) continue;
    merged[normalized] = value;
  }
  return merged;
}

function isCodexNativeImageGenerationMarker(name: string, value: string): boolean {
  return name === CODEX_NATIVE_IMAGE_GENERATION_HEADER
    && value.split(",").some((token) => token.trim() === CODEX_NATIVE_IMAGE_GENERATION_MARKER);
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

type GatewayBillingHeaderTransformInput = {
  model?: string;
  request?: {
    headers?: Record<string, string | string[] | undefined>;
    method?: string;
    url?: string;
  };
  requestBody?: unknown;
  route?: {
    method?: string;
    url?: string;
  };
};

export function createGatewayPlugin() {
  const detachedBillingSystemBlocks = new WeakMap<object, unknown>();
  const restoredUpstreamRequests = new WeakSet<object>();

  return {
    requestTransforms: [{
      key: "ccr-claude-code-billing-header-detach",
      stage: "beforeRouting" as const,
      transform(input: GatewayBillingHeaderTransformInput) {
        const method = (input.route?.method ?? input.request?.method ?? "GET").toUpperCase();
        const url = input.route?.url ?? input.request?.url;
        if (method !== "POST" || !isAnthropicMessagesRequestPath(url) || !input.request) {
          return undefined;
        }
        const headerBlock = decodeCcrAnthropicBillingHeader(
          requestHeaderValue(input.request.headers, ccrAnthropicBillingHeader)
        );
        if (headerBlock !== undefined) {
          detachedBillingSystemBlocks.set(input.request, headerBlock);
          return undefined;
        }
        if (!isRecord(input.requestBody)) {
          return undefined;
        }
        const detached = detachClaudeCodeBillingSystemBlock(input.requestBody);
        if (!detached) {
          return undefined;
        }
        detachedBillingSystemBlocks.set(input.request, detached.block);
        return {
          ...(input.model !== undefined ? { model: input.model } : {}),
          requestBody: detached.body
        };
      }
    }],
    providerHooks: [{
      key: "ccr-upstream-header-sanitizer",
      transformRequest(input: ProviderPluginRequestInput) {
        const rewrittenUrl = rewriteUpstreamProviderUrl(input.upstreamRequest.url, input.targetProviderConfig, input.config);
        const savedBillingBlock = input.request
          ? detachedBillingSystemBlocks.get(input.request) ??
            (isAnthropicMessagesRequestPath(input.request.url)
              ? decodeCcrAnthropicBillingHeader(requestHeaderValue(input.request.headers, ccrAnthropicBillingHeader))
              : undefined)
          : undefined;
        const alreadyRestored = restoredUpstreamRequests.has(input.upstreamRequest);
        const shouldRestore = savedBillingBlock !== undefined &&
          !alreadyRestored &&
          isOfficialAnthropicMessagesTarget(rewrittenUrl, input.targetProviderConfig);
        const body = shouldRestore
          ? restoreClaudeCodeBillingSystemBlock(
              input.upstreamRequest.body,
              savedBillingBlock,
              input.upstreamRequest.bodyEncoding
            )
          : input.upstreamRequest.body;
        const upstreamRequest = {
          ...input.upstreamRequest,
          body,
          headers: mergeUpstreamProviderHeaders(input.request?.headers, input.upstreamRequest.headers),
          url: rewrittenUrl
        };
        const apiKey = input.targetProviderConfig?.apikey?.trim();
        if (!upstreamRequest.headers["x-opencode-session"]?.trim()) {
          try {
            if (isOfficialOpenCodeGoUrl(upstreamRequest.url)) {
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
        const finalized = applyMetaTokenFloor(upstreamRequest);
        if (alreadyRestored || shouldRestore) {
          restoredUpstreamRequests.add(finalized);
        }
        return {
          ok: true as const,
          value: finalized
        };
      },
      transformResponse(input: ProviderPluginResponseInput) {
        const transformed = isOfficialOpenCodeGoChatRequest(
          input.upstreamRequest.url,
          input.targetProviderConfig?.baseurl
        )
          ? normalizeDeepSeekCacheUsage(input.upstreamPayload)
          : { changed: false, value: input.upstreamPayload };
        return {
          ok: true as const,
          value: transformed.value
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
    }],
    streamHooks: [{
      key: "ccr-opencode-go-cache-usage-stream",
      transformResponse(input: GatewayPluginStreamInput) {
        if (!isOfficialOpenCodeGoChatRequest(
          input.upstreamRequest?.url,
          input.targetProviderConfig?.baseurl
        )) return undefined;
        return normalizeDeepSeekCacheUsageStream(input.upstreamResponse);
      }
    }]
  };
}
