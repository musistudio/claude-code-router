import { applyResponsesSessionAffinity } from "@ccr/core/gateway/core-runtime/responses-session-affinity";
import type { ResponsesSessionAffinityInput } from "@ccr/core/gateway/core-runtime/responses-session-affinity";
import { applyResponsesToolStrictness } from "@ccr/core/gateway/core-runtime/responses-tool-strictness";
import type { ResponsesToolStrictnessInput } from "@ccr/core/gateway/core-runtime/responses-tool-strictness";

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
    headers?: Record<string, string | string[] | undefined>;
  };
  targetProviderConfig?: {
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

const clientAuthHeaderNames = new Set([
  "api-key",
  "authorization",
  "x-api-key"
]);

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
        return {
          ok: true as const,
          value: {
            ...input.upstreamRequest,
            headers: mergeUpstreamProviderHeaders(input.request?.headers, input.upstreamRequest.headers),
            url: rewriteUpstreamProviderUrl(input.upstreamRequest.url, input.targetProviderConfig, input.config)
          }
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
