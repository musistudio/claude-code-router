// Raw traces are produced outside the request-log runtime, so keep an
// independent hard ceiling as defense in depth if configuration validation is
// bypassed or its public range grows in the future.
export const rawTraceHardMaxBodyBytes = 50 * 1024 * 1024;
export const maxRequestLogBodyBytes = rawTraceHardMaxBodyBytes;
export const defaultRequestLogBodyBytes = rawTraceHardMaxBodyBytes;

export function resolveRawTraceBodyLimit(value: number | undefined): number {
  const configured = value ?? defaultRequestLogBodyBytes;
  if (!Number.isFinite(configured)) return defaultRequestLogBodyBytes;
  return Math.max(0, Math.min(rawTraceHardMaxBodyBytes, Math.floor(configured)));
}
