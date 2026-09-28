import type { RouterFallbackMode } from "@ccr/core/contracts/app";

export type RouteFailureClass = "client" | "rate-limit" | "retryable" | "server";

export type RouteFailureDecision = {
  failureClass: RouteFailureClass;
  shouldFallback: boolean;
};

export function classifyRouteFailure(statusCode: number, mode: RouterFallbackMode): RouteFailureDecision {
  const failureClass = classifyStatus(statusCode);
  return {
    failureClass,
    shouldFallback: mode === "model-chain"
      ? statusCode >= 400
      : failureClass === "retryable" || failureClass === "rate-limit" || failureClass === "server"
  };
}

function classifyStatus(statusCode: number): RouteFailureClass {
  if (statusCode === 429) {
    return "rate-limit";
  }
  if (statusCode === 408 || statusCode === 409) {
    return "retryable";
  }
  if (statusCode >= 500) {
    return "server";
  }
  return "client";
}
