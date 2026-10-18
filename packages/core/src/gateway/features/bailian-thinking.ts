import { isRecord } from "@ccr/core/gateway/internal/value";

export function isBailianAnthropicBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "dashscope.aliyuncs.com" || url.hostname === "dashscope-intl.aliyuncs.com" ||
        url.hostname.endsWith(".dashscope.aliyuncs.com") || url.hostname.endsWith(".maas.aliyuncs.com")) &&
      url.pathname.replace(/\/+$/, "") === "/apps/anthropic";
  } catch { return false; }
}

/** Bailian's Anthropic endpoint documents enabled/disabled, not adaptive. */
export function normalizeBailianThinking(body: unknown, upstreamUrl: string): unknown {
  if (!isRecord(body) || !isRecord(body.thinking) || body.thinking.type !== "adaptive") {
    return body;
  }
  try {
    const url = new URL(upstreamUrl);
    if (!/^\/apps\/anthropic\/v1\/messages(?:\/count_tokens)?\/?$/.test(url.pathname)) return body;
    url.pathname = "/apps/anthropic";
    if (!isBailianAnthropicBaseUrl(url.toString())) return body;
  } catch { return body; }
  return { ...body, thinking: { ...body.thinking, type: "enabled" } };
}
