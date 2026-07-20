import type { GatewayProviderConfig, RouterFallbackConfig } from "@ccr/core/contracts/app";
import type { CompiledRouteRewrite } from "@ccr/core/routing/rewrite";

export type RouteSource = "builtin" | "custom" | "default" | "rule" | "subagent";

export type ProviderModelRef = {
  canonicalSelector: string;
  kind: "provider";
  model: string;
  provider: GatewayProviderConfig;
  selector: string;
};

export type GatewayModelRef = {
  canonicalSelector: string;
  kind: "gateway";
  model: string;
  selector: string;
};

export type RouteModelRef = GatewayModelRef | ProviderModelRef;

export type RouteDiagnosticCode =
  | "custom-model-not-configured"
  | "fallback-model-not-configured"
  | "profile-model-not-configured"
  | "rule-model-not-configured"
  | "rule-provider-model-conflict"
  | "rule-rewrite-invalid"
  | "script-api-unsupported"
  | "script-invalid-result"
  | "script-model-not-configured"
  | "script-runtime-error"
  | "script-source-invalid"
  | "script-timeout";

export type RouteDiagnostic = {
  code: RouteDiagnosticCode;
  message: string;
  model?: string;
  ruleId?: string;
  source: RouteSource;
};

export type RouteDecision = {
  diagnostics: RouteDiagnostic[];
  fallback: RouterFallbackConfig;
  model?: RouteModelRef;
  reason: string;
  rewrites: CompiledRouteRewrite[];
  source: RouteSource;
};

export type RouteRequest = {
  builtInClaudeCodeSubagent?: boolean;
  builtInSubagentModel?: string;
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  log: Pick<Console, "debug" | "error" | "info" | "warn">;
  method: string;
  sessionId?: string;
  tokenCount?: number;
  url: string;
};

export type RouteAttemptPlan = {
  index: number;
  model?: string;
  target?: RouteModelRef;
};

export type RouteExecutionPlan = {
  attempts: RouteAttemptPlan[];
  fallback: RouterFallbackConfig;
  primaryModel?: string;
};
