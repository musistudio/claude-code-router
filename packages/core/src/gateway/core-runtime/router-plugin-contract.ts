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

export const ccrRouteStageHeader = "x-ccr-route-stage";
export const ccrRouteReasonHeader = "x-ccr-route-reason";
export const ccrRouteSourceHeader = "x-ccr-route-source";
export const ccrRouteDiagnosticsHeader = "x-ccr-route-diagnostics";
export const ccrRoutedModelHeader = "x-ccr-routed-model";
export const ccrRouteFallbackHeader = "x-ccr-route-fallback";
export const ccrRouteSessionIdHeader = "x-ccr-route-session-id";
export const ccrRouteTokenCountHeader = "x-ccr-route-token-count";
export const ccrCodexApplyPatchBridgeHeader = "x-ccr-codex-apply-patch-bridge";
export const ccrCodexMultiAgentBridgeHeader = "x-ccr-codex-multi-agent-bridge";
export const ccrOpenRouterDiscountRequestIdHeader = "x-ccr-openrouter-discount-request-id";
export const ccrRouteHeaderNames = [
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
