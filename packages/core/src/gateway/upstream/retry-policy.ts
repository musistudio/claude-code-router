import type { RouterFallbackMode } from "@ccr/core/contracts/app";
import { classifyRouteFailure } from "@ccr/core/routing/failure-classifier";
import { clampNumber } from "@ccr/core/gateway/internal/collections";

const upstreamRetryBackoffBaseMs = 1_000;
const upstreamRetryBackoffMaxMs = 30_000;
const upstreamRetryAfterMaxMs = 60_000;

export function shouldFallbackAfterStatus(statusCode: number, mode: RouterFallbackMode): boolean {
  return classifyRouteFailure(statusCode, mode).shouldFallback;
}

export function retryDelayAfterStatus(headers: Headers, failedAttemptIndex: number): number {
  const retryAfterMs = parseRetryAfterHeaderMs(headers.get("retry-after"));
  if (retryAfterMs !== undefined && retryAfterMs > 0) {
    return clampNumber(retryAfterMs, 1, upstreamRetryAfterMaxMs);
  }
  return exponentialRetryBackoffMs(failedAttemptIndex);
}

export function retryDelayAfterNetworkError(failedAttemptIndex: number): number {
  return exponentialRetryBackoffMs(failedAttemptIndex);
}

export function fallbackRetryDelayAfterStatusForTest(input: {
  failedAttemptIndex?: number;
  retryAfter?: string | null;
  statusCode: number;
}): number {
  const headers = new Headers();
  if (input.retryAfter !== undefined && input.retryAfter !== null) {
    headers.set("retry-after", input.retryAfter);
  }
  return retryDelayAfterStatus(headers, input.failedAttemptIndex ?? 0);
}

export function fallbackRetryDelayAfterNetworkErrorForTest(failedAttemptIndex = 0): number {
  return retryDelayAfterNetworkError(failedAttemptIndex);
}

function parseRetryAfterHeaderMs(value: string | null): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : undefined;
}

function exponentialRetryBackoffMs(failedAttemptIndex: number): number {
  const exponent = Math.min(10, Math.max(0, failedAttemptIndex));
  return Math.min(upstreamRetryBackoffMaxMs, upstreamRetryBackoffBaseMs * 2 ** exponent);
}
