import type { GatewayProviderConfig, GatewayProviderProtocol, GatewayResponsesReasoningHistoryPolicy, GatewayResponsesReasoningSummaryPolicy } from "@ccr/core/contracts/app";
import { parseJsonObjectSafe, serializeJsonBody } from "@ccr/core/gateway/http/body";
import { isRecord } from "@ccr/core/gateway/internal/value";
import { normalizedProviderCapabilities, providerCapabilityForClientProtocol, providerModelMetadataFor } from "@ccr/core/providers/runtime-topology";

const reasoningEncryptedContentInclude = "reasoning.encrypted_content";

type ResponsesReasoningOptions = {
  historyPolicy: GatewayResponsesReasoningHistoryPolicy;
  summaryPolicy: GatewayResponsesReasoningSummaryPolicy;
};

export function sanitizeOpenAiResponsesReasoningHistory(input: {
  body: Buffer | undefined;
  model?: string;
  provider: GatewayProviderConfig;
  protocol: GatewayProviderProtocol;
}): Buffer | undefined {
  if (input.protocol !== "openai_responses") {
    return input.body;
  }

  const parsedBody = parseJsonObjectSafe(input.body);
  if (!parsedBody) {
    return input.body;
  }

  const options = responsesReasoningOptions(input.provider, input.protocol, input.model);
  let changed = false;
  const nextBody: Record<string, unknown> = { ...parsedBody };

  if (options.historyPolicy !== "encrypted") {
    const nextInclude = filterReasoningEncryptedContentInclude(parsedBody.include);
    if (nextInclude.changed) {
      changed = true;
      if (nextInclude.value === undefined) {
        delete nextBody.include;
      } else {
        nextBody.include = nextInclude.value;
      }
    }
  }

  if (Array.isArray(parsedBody.input)) {
    const nextInput: unknown[] = [];
    for (const item of parsedBody.input) {
      const sanitizedItem = sanitizeReasoningItem(item, options);
      if (sanitizedItem.changed) {
        changed = true;
      }
      if (sanitizedItem.value !== undefined) {
        nextInput.push(sanitizedItem.value);
      }
    }
    if (changed) {
      nextBody.input = nextInput;
    }
  }

  return changed ? serializeJsonBody(nextBody) : input.body;
}

function responsesReasoningOptions(
  provider: GatewayProviderConfig,
  protocol: GatewayProviderProtocol,
  model: string | undefined
): ResponsesReasoningOptions {
  const capability = providerCapabilityForClientProtocol(provider, protocol, model) ??
    normalizedProviderCapabilities(provider).find((item) => item.type === protocol);
  const modelFeatures = providerModelProtocolFeaturesFor(provider, model, protocol);
  return {
    historyPolicy: modelFeatures?.reasoningHistoryPolicy ?? capability?.features?.reasoningHistoryPolicy ?? inferResponsesReasoningHistoryPolicy(provider),
    summaryPolicy: modelFeatures?.reasoningSummaryPolicy ?? capability?.features?.reasoningSummaryPolicy ?? "drop"
  };
}

function providerModelProtocolFeaturesFor(
  provider: GatewayProviderConfig,
  model: string | undefined,
  protocol: GatewayProviderProtocol
) {
  const metadata = providerModelMetadataFor(provider, model);
  return metadata?.protocolFeatures?.[protocol];
}

function inferResponsesReasoningHistoryPolicy(provider: GatewayProviderConfig): GatewayResponsesReasoningHistoryPolicy {
  const baseUrls = [
    provider.api_base_url,
    provider.baseUrl,
    provider.baseurl,
    ...normalizedProviderCapabilities(provider).map((capability) => capability.baseUrl)
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  // Auto mode is intentionally conservative: only official endpoint hosts get
  // provider-specific defaults. Custom gateways must opt in explicitly.
  if (baseUrls.some((value) => value.includes("api.openai.com"))) {
    return "encrypted";
  }
  if (baseUrls.some((value) => value.includes("api.deepseek.com"))) {
    return "plaintext";
  }
  return "strip";
}

function filterReasoningEncryptedContentInclude(value: unknown): {
  changed: boolean;
  value?: unknown[];
} {
  if (!Array.isArray(value)) {
    return { changed: false };
  }
  const filtered = value.filter((item) => item !== reasoningEncryptedContentInclude);
  if (filtered.length === value.length) {
    return { changed: false, value };
  }
  return {
    changed: true,
    value: filtered.length > 0 ? filtered : undefined
  };
}

function sanitizeReasoningItem(
  item: unknown,
  options: ResponsesReasoningOptions
): { changed: boolean; value?: unknown } {
  if (!isRecord(item) || item.type !== "reasoning") {
    return { changed: false, value: item };
  }
  if (options.historyPolicy === "strip") {
    return { changed: true };
  }
  if (options.historyPolicy === "encrypted") {
    return sanitizeEncryptedReasoningItem(item);
  }
  return sanitizePlaintextReasoningItem(item, options.summaryPolicy);
}

function sanitizeEncryptedReasoningItem(item: Record<string, unknown>): { changed: boolean; value?: unknown } {
  const summary = nonEmptyArray(item.summary);
  const encryptedContent = nonEmptyString(item.encrypted_content);
  if (!summary && !encryptedContent) {
    return { changed: true };
  }

  const next = { ...item };
  delete next.content;
  if (!summary) {
    delete next.summary;
  }
  if (encryptedContent) {
    next.encrypted_content = encryptedContent;
  } else {
    delete next.encrypted_content;
  }
  return { changed: true, value: next };
}

function sanitizePlaintextReasoningItem(
  item: Record<string, unknown>,
  summaryPolicy: GatewayResponsesReasoningSummaryPolicy
): { changed: boolean; value?: unknown } {
  const content = nonEmptyArray(item.content);
  const fallbackContent = content ? undefined : summaryPolicyContent(item.summary, summaryPolicy);
  const nextContent = content ?? fallbackContent;
  if (!nextContent) {
    return { changed: true };
  }

  const next: Record<string, unknown> = { ...item, content: nextContent };
  delete next.encrypted_content;
  delete next.summary;
  return { changed: true, value: next };
}

function summaryPolicyContent(
  summary: unknown,
  summaryPolicy: GatewayResponsesReasoningSummaryPolicy
): Array<{ text: string; type: "reasoning_text" }> | undefined {
  if (summaryPolicy !== "as_content" || !Array.isArray(summary)) {
    return undefined;
  }
  const content = summary
    .map(summaryText)
    .filter((text): text is string => Boolean(text))
    .map((text) => ({ text, type: "reasoning_text" as const }));
  return content.length > 0 ? content : undefined;
}

function summaryText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (!isRecord(value) || typeof value.text !== "string") {
    return undefined;
  }
  return value.text.trim() || undefined;
}

function nonEmptyArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
