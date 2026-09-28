import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

export function isLocalClaudeCodeOauthProviderPlugin(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const key = stringValue(value.key)?.toLowerCase() ?? "";
  return key.startsWith("ccr-local-agent-") && key.includes("claude-code-oauth");
}

export function mergeAnthropicBetaValues(...values: Array<string | undefined>): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of values) {
    for (const token of value?.split(",") ?? []) {
      const normalized = token.trim();
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      merged.push(normalized);
    }
  }
  return merged.join(",");
}
