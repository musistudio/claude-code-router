import type { GatewayProviderConfig } from "@ccr/core/contracts/app";
import { isRecord } from "@ccr/core/gateway/internal/value";

// Only ordered effort levels participate. Values such as none/off/auto keep
// their separate semantics, and unknown values are left to the provider.
const effortOrder = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"];

export function normalizeAnthropicReasoningEffort(
  body: Record<string, unknown>,
  provider: GatewayProviderConfig,
  model: string
): { body: Record<string, unknown>; before: string; after: string } | undefined {
  const outputConfig = body.output_config;
  if (!isRecord(outputConfig) || typeof outputConfig.effort !== "string") {
    return undefined;
  }
  const before = outputConfig.effort;
  const requestedRank = effortOrder.indexOf(before.trim().toLowerCase());
  if (requestedRank < 0) {
    return undefined;
  }

  const metadata = provider.modelMetadata ?? {};
  const modelMetadata = metadata[model] ?? Object.entries(metadata)
    .find(([name]) => name.trim().toLowerCase() === model.trim().toLowerCase())?.[1];
  // Use explicit target-model configuration, never a guessed model-family
  // default or the capabilities of the client-visible Claude alias.
  const supported = new Set(modelMetadata?.supportedReasoningLevels
    ?.map((level) => level.effort.trim().toLowerCase()));
  const candidates = effortOrder.filter((effort) => supported.has(effort));
  const after = candidates.find((effort) => effortOrder.indexOf(effort) >= requestedRank) ?? candidates.at(-1);
  if (!after || after === before) {
    return undefined;
  }

  return {
    body: { ...body, output_config: { ...outputConfig, effort: after } },
    before,
    after
  };
}
