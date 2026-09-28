export const sensitiveRequestLogHeaderNames: ReadonlySet<string> = new Set([
  "api-key",
  "authorization",
  "cookie",
  "ocp-apim-subscription-key",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-auth-api-key-id",
  "x-auth-sub",
  "x-goog-api-key"
]);

// Provider plugins may use arbitrary authentication header names. Match
// security-bearing name segments in addition to the compatibility allowlist
// so a newly introduced x-*-token/secret/key header is fail-closed by default.
const sensitiveRequestLogHeaderPattern =
  /(?:^|[-_.])(?:auth(?:orization)?|bearer|cookie|credential|csrf|jwt|key|pass(?:word|wd)?|secret|signature|token)(?:$|[-_.])/i;

export function isSensitiveRequestLogHeaderName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return sensitiveRequestLogHeaderNames.has(normalized) || sensitiveRequestLogHeaderPattern.test(normalized);
}
