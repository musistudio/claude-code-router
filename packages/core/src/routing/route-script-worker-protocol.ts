import type { RouteScriptInput } from "@ccr/core/routing/route-script-context";

export type ResolvedRouteScript = {
  source: string;
  timeoutMs: number;
};

export type RouteScriptWorkerRequest = {
  input?: RouteScriptInput;
  requestId: number;
  script: ResolvedRouteScript;
  type: "execute" | "validate";
};

export type RouteScriptWorkerResponse = {
  durationMs: number;
  error?: string;
  requestId: number;
  result?: unknown;
  status: "error" | "ok" | "timeout";
  type: "response";
};
