import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";

export type UsageTokenAccounting = {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  inputIncludesCacheTokens?: boolean;
  inputTokens?: number;
};

/**
 * Which artefact the counts were read from. The two disagree whenever the
 * gateway translates between formats — an Anthropic response served from an
 * OpenAI upstream carries billing headers in the upstream's cache-inclusive
 * convention next to a body in Anthropic's cache-exclusive one — so each has
 * to be normalized under its own rule before the two are merged.
 */
export type UsageConventionSource = "providerBilling" | "responseBody";

export type UsageNormalizationOptions = {
  path?: string;
  providerProtocol?: GatewayProviderProtocol;
  source?: UsageConventionSource;
  usageHint?: UsageTokenAccounting;
};

export function normalizeUsageInputTokens<T extends UsageTokenAccounting>(
  usage: T | undefined,
  options: UsageNormalizationOptions = {}
): T | undefined {
  if (!usage) {
    return undefined;
  }

  const includesCacheTokens = inputIncludesCacheTokens(usage, options);
  if (!includesCacheTokens || usage.inputTokens === undefined) {
    return usage;
  }

  const cacheTokens = normalizeCount(usage.cacheReadTokens) + normalizeCount(usage.cacheWriteTokens);
  if (cacheTokens <= 0) {
    return usage;
  }

  return {
    ...usage,
    inputTokens: Math.max(0, normalizeCount(usage.inputTokens) - cacheTokens)
  };
}

function inputIncludesCacheTokens(
  usage: UsageTokenAccounting,
  options: UsageNormalizationOptions
): boolean | undefined {
  if (options.source === "responseBody") {
    // A body describes its own wire format, and the field names we parsed are
    // the direct evidence of it. The upstream protocol is deliberately not
    // consulted: it describes what the gateway talked to, not what it emitted,
    // and reading a translated body under the upstream's rule subtracts the
    // cached prefix a second time — clamping input tokens to zero on any turn
    // where the cache hit exceeds the new input, which is most of them.
    if (usage.inputIncludesCacheTokens !== undefined) {
      return usage.inputIncludesCacheTokens;
    }
    if (options.usageHint?.inputIncludesCacheTokens !== undefined) {
      return options.usageHint.inputIncludesCacheTokens;
    }
    return inputIncludesCacheTokensForPath(options.path);
  }

  // Billing headers and billing events restate the upstream provider's own
  // counters verbatim, so the upstream protocol governs them.
  const protocolValue = inputIncludesCacheTokensForProtocol(options.providerProtocol);
  if (protocolValue !== undefined) {
    return protocolValue;
  }
  if (usage.inputIncludesCacheTokens !== undefined) {
    return usage.inputIncludesCacheTokens;
  }
  if (options.usageHint?.inputIncludesCacheTokens !== undefined) {
    return options.usageHint.inputIncludesCacheTokens;
  }
  return inputIncludesCacheTokensForPath(options.path);
}

function inputIncludesCacheTokensForProtocol(protocol: GatewayProviderProtocol | undefined): boolean | undefined {
  if (protocol === "anthropic_messages") {
    return false;
  }
  if (
    protocol === "openai_chat_completions" ||
    protocol === "openai_responses" ||
    protocol === "gemini_generate_content" ||
    protocol === "gemini_interactions"
  ) {
    return true;
  }
  return undefined;
}

function inputIncludesCacheTokensForPath(path: string | undefined): boolean | undefined {
  const normalized = path?.toLowerCase() ?? "";
  if (!normalized) {
    return undefined;
  }
  if (
    normalized.includes("/chat/completions") ||
    normalized.includes("/responses") ||
    normalized.includes(":generatecontent") ||
    normalized.includes("/interactions")
  ) {
    return true;
  }
  if (normalized.includes("/messages")) {
    return false;
  }
  return undefined;
}

function normalizeCount(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}
