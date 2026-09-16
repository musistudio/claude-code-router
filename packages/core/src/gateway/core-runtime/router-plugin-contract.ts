import type { RouterFallbackConfig } from "@ccr/core/contracts/app";

export const ccrRouterPluginKey = "ccr-router";
export const ccrRouterRequestTransformKey = "ccr-router-request-transform";
export const ccrCodexBridgeRequestTransformKey = "ccr-codex-bridge-request-transform";
export const ccrCodexBridgeResponseHookKey = "ccr-codex-bridge-response-hook";
export const ccrCodexBridgeStreamHookKey = "ccr-codex-bridge-stream-hook";
export const ccrOpenRouterDiscountFinalizeResponseHookKey = "ccr-openrouter-discount-finalize-response-hook";
export const ccrOpenRouterDiscountFinalizeStreamHookKey = "ccr-openrouter-discount-finalize-stream-hook";
export const ccrRouterRouteResolverKey = "ccr-router-route-resolver";
export const ccrRouterHttpRouteKey = "ccr-router-route";
export const ccrRouterHttpRoutePath = "/__ccr/route";
export const ccrRawTraceSyncAckRouteKey = "ccr-raw-trace-sync-ack";
export const ccrRuntimeConfigReloadMessageType = "ccr:runtime-config-reload";
export const ccrLiveTokenRateConfigMessageType = "ccr:live-token-rate-config";
export const ccrLiveTokenRateSnapshotMessageType = "ccr:live-token-rate-snapshot";
export const ccrLiveTokenRateStreamHookKey = "ccr-live-token-rate-stream-hook";

export type CcrLiveTokenRateConfigMessage = {
  enabled: boolean;
  protocolVersion: 1;
  type: typeof ccrLiveTokenRateConfigMessageType;
};

export type CcrLiveTokenRateSnapshotMessage = {
  activeRequests: number;
  protocolVersion: 1;
  tokensPerSecond: number;
  type: typeof ccrLiveTokenRateSnapshotMessageType;
};

export const ccrRouteStageHeader = "x-ccr-route-stage";
export const ccrRouteReasonHeader = "x-ccr-route-reason";
export const ccrRouteSourceHeader = "x-ccr-route-source";
export const ccrRouteDiagnosticsHeader = "x-ccr-route-diagnostics";
export const ccrRoutedModelHeader = "x-ccr-routed-model";
// The model the client asked for, before routing moved it. Persists the ask on
// the wire so a raw-trace reader does not have to read the client request body,
// which is allowed to be far larger than a request log ever keeps. The value is
// base64url-encoded because model selectors can carry non-ASCII provider names,
// which `sanitizeHeaderValue` would mangle and header values cannot carry raw.
export const ccrClientModelHeader = "x-ccr-client-model";
export const ccrRouteFallbackHeader = "x-ccr-route-fallback";
export const ccrRouteSessionIdHeader = "x-ccr-route-session-id";
export const ccrRouteTokenCountHeader = "x-ccr-route-token-count";
export const ccrCodexApplyPatchBridgeHeader = "x-ccr-codex-apply-patch-bridge";
export const ccrCodexMultiAgentBridgeHeader = "x-ccr-codex-multi-agent-bridge";
export const ccrOpenRouterDiscountRequestIdHeader = "x-ccr-openrouter-discount-request-id";
export const ccrRouteHeaderNames = [
  ccrClientModelHeader,
  ccrCodexApplyPatchBridgeHeader,
  ccrCodexMultiAgentBridgeHeader,
  ccrOpenRouterDiscountRequestIdHeader,
  ccrRouteDiagnosticsHeader,
  ccrRouteFallbackHeader,
  ccrRouteReasonHeader,
  ccrRouteSessionIdHeader,
  ccrRouteSourceHeader,
  ccrRouteStageHeader,
  ccrRouteTokenCountHeader,
  ccrRoutedModelHeader
] as const;

export type CcrRouterPluginRouteRequest = {
  body: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  url?: string;
};

export type CcrRouterPluginRouteResponse = {
  body: Record<string, unknown>;
  decision: {
    diagnostics: unknown[];
    fallback: RouterFallbackConfig;
    model?: string;
    reason: string;
    sessionId?: string;
    source: string;
    tokenCount: number;
  };
};

export function encodeCcrRouteFallbackHeader(fallback: RouterFallbackConfig): string {
  return Buffer.from(JSON.stringify(fallback), "utf8").toString("base64url");
}

export function decodeCcrRouteFallbackHeader(value: string | undefined): RouterFallbackConfig | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    return isRouterFallbackConfig(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function encodeCcrClientModelHeader(model: string): string {
  return Buffer.from(model, "utf8").toString("base64url");
}

export function decodeCcrClientModelHeader(value: string | undefined): string | undefined {
  const encoded = value?.trim();
  if (!encoded) {
    return undefined;
  }
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  // Round-trip so a value that is not actually encoded (or is not valid UTF-8)
  // yields nothing rather than replacement characters. The comparison uses the
  // decoded text before trimming, so an ask with outer whitespace still matches
  // its encoding and comes back trimmed instead of being rejected.
  return decoded.trim() && Buffer.from(decoded, "utf8").toString("base64url") === encoded
    ? decoded.trim()
    : undefined;
}

function isRouterFallbackConfig(value: unknown): value is RouterFallbackConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as RouterFallbackConfig;
  return (
    (candidate.mode === "off" || candidate.mode === "retry" || candidate.mode === "model-chain") &&
    Array.isArray(candidate.models) &&
    candidate.models.every((model) => typeof model === "string") &&
    typeof candidate.retryCount === "number" &&
    Number.isFinite(candidate.retryCount)
  );
}
