// Keep the public body-capture setting bounded for in-memory previews and
// admission accounting. Raw trace sources can write larger parts because the
// request-log store moves them into sidecar files instead of keeping them
// inline in SQLite.
export const rawTraceHardMaxBodyBytes = 50 * 1024 * 1024;
export const maxRequestLogBodyBytes = rawTraceHardMaxBodyBytes;
export const defaultRequestLogBodyBytes = rawTraceHardMaxBodyBytes;
export const rawTraceMaxPartBytes = Number.MAX_SAFE_INTEGER;

export function resolveRawTraceBodyLimit(value: number | undefined): number {
  const configured = value ?? defaultRequestLogBodyBytes;
  if (!Number.isFinite(configured)) return defaultRequestLogBodyBytes;
  return Math.max(0, Math.min(rawTraceHardMaxBodyBytes, Math.floor(configured)));
}
