import type { GatewayProviderProtocol } from "../shared/app";

export type UsageTokenAccounting = {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  inputIncludesCacheTokens?: boolean;
  inputTokens?: number;
};

export function normalizeUsageInputTokens<T extends UsageTokenAccounting>(
  usage: T | undefined,
  options: {
    path?: string;
    providerProtocol?: GatewayProviderProtocol;
    usageHint?: UsageTokenAccounting;
  } = {}
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
  options: {
    path?: string;
    providerProtocol?: GatewayProviderProtocol;
    usageHint?: UsageTokenAccounting;
  }
): boolean | undefined {
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
  if (protocol === "openai_chat_completions" || protocol === "openai_responses" || protocol === "gemini_generate_content") {
    return true;
  }
  return undefined;
}

function inputIncludesCacheTokensForPath(path: string | undefined): boolean | undefined {
  const normalized = path?.toLowerCase() ?? "";
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes("/chat/completions") || normalized.includes("/responses") || normalized.includes(":generatecontent")) {
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
