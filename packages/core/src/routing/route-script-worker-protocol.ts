export type ResolvedRouteScript = {
  source: string;
  timeoutMs: number;
};

export type RouteScriptWorkerRequest = {
  inputJson?: string;
  requestId: number;
  script: ResolvedRouteScript;
  type: "execute" | "validate";
};

export type RouteScriptWorkerResponse = {
  durationMs: number;
  error?: string;
  requestId: number;
  result?: unknown;
  tokenCount?: number;
  status: "error" | "ok" | "timeout";
  type: "response";
};
