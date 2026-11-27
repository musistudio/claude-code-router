/**
 * Fixed Claude model tiers for profiles with the "default model list" switch.
 *
 * When enabled, /v1/models ignores the allowlist and provider routes and
 * returns this fixed tier list; requests matching each Claude model family
 * prefix route through the profile tier slots (fableModel/opusModel/sonnetModel/haikuModel).
 * Keep this module dependency-light (contracts + shared constants only) so
 * model-discovery can import it without cycles.
 */
import type { ProfileConfig } from "@ccr/core/contracts/app";
import { stripOneMillionContextSuffix } from "@ccr/core/gateway/internal/shared";

export type ClaudeDefaultModelTier = {
  description: string;
  displayName: string;
  /** Discovery-facing model id, e.g. "claude-fable-5-1[1m]". */
  id: string;
  /** Fallback input limit when the routing target cannot be resolved. */
  maxInputTokens: number;
  /** Canonical base id for discovery and profile allowlists. */
  model: string;
  oneMillionContext: boolean;
  profileSlot: "fableModel" | "opusModel" | "sonnetModel" | "haikuModel";
  /** Request-side family prefix, independent of the advertised version. */
  requestPrefix: string;
};

export const claudeDefaultModelTiers: readonly ClaudeDefaultModelTier[] = [
  {
    description: "Fable 5.1 · Most capable for your hardest and longest-running tasks",
    displayName: "Fable 5.1",
    id: "claude-fable-5-1[1m]",
    maxInputTokens: 1_000_000,
    model: "claude-fable-5-1",
    oneMillionContext: true,
    profileSlot: "fableModel",
    requestPrefix: "claude-fable-"
  },
  {
    description: "Opus 5.5 with 1M context · Best for everyday, complex tasks",
    displayName: "Opus 5.5",
    id: "claude-opus-5-5[1m]",
    maxInputTokens: 1_000_000,
    model: "claude-opus-5-5",
    oneMillionContext: true,
    profileSlot: "opusModel",
    requestPrefix: "claude-opus-"
  },
  {
    description: "Sonnet 5.5 for long sessions",
    displayName: "Sonnet 5.5",
    id: "claude-sonnet-5-5[1m]",
    maxInputTokens: 1_000_000,
    model: "claude-sonnet-5-5",
    oneMillionContext: true,
    profileSlot: "sonnetModel",
    requestPrefix: "claude-sonnet-"
  },
  {
    description: "Haiku 5.5 · Fastest for quick answers",
    displayName: "Haiku 5.5",
    id: "claude-haiku-5-5",
    maxInputTokens: 200_000,
    model: "claude-haiku-5-5",
    oneMillionContext: false,
    profileSlot: "haikuModel",
    requestPrefix: "claude-haiku-"
  }
];

export function isClaudeDefaultModelListEnabled(profile: ProfileConfig | undefined): boolean {
  return profile?.claudeDefaultModelList === true;
}

export function findClaudeDefaultModelTier(model: string | undefined): ClaudeDefaultModelTier | undefined {
  const normalized = stripOneMillionContextSuffix(model ?? "").toLowerCase();
  // Explicit provider selectors keep their selected provider, even when the
  // provider name itself starts with a Claude family prefix.
  if (!normalized || /[/,]/.test(normalized)) {
    return undefined;
  }
  return claudeDefaultModelTiers.find((tier) =>
    normalized.startsWith(tier.requestPrefix) && normalized.length > tier.requestPrefix.length
  );
}

/**
 * Resolve the routing target for a tier model request: the profile tier slot,
 * falling back to the profile default model. Tier slot values may carry the
 * [1m] suffix (launcher-mode convention); strip it before routing upstream.
 * Returns undefined when the model is not a tier name or no target is set,
 * leaving the request on the existing routing path.
 */
export function resolveClaudeDefaultTierTarget(
  profile: ProfileConfig | undefined,
  model: string | undefined
): string | undefined {
  const tier = findClaudeDefaultModelTier(model);
  if (!tier) {
    return undefined;
  }
  const slotValue = profile?.[tier.profileSlot]?.trim();
  const fallback = profile?.model?.trim();
  const target = slotValue || fallback;
  return target ? stripOneMillionContextSuffix(target) : undefined;
}

/**
 * Models that must pass the profile allowlist in default-model-list mode:
 * the tier names clients request plus the slot targets they rewrite to.
 * Keeps allowlist enforcement active for every other model.
 */
export function claudeDefaultTierRoutingModels(profile: ProfileConfig | undefined): string[] {
  if (!isClaudeDefaultModelListEnabled(profile)) {
    return [];
  }
  const values = new Set<string>();
  for (const tier of claudeDefaultModelTiers) {
    values.add(tier.id);
    values.add(tier.model);
    const slotValue = profile?.[tier.profileSlot]?.trim();
    if (slotValue) {
      values.add(slotValue);
      values.add(stripOneMillionContextSuffix(slotValue));
    }
  }
  return [...values].filter(Boolean);
}
