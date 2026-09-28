/**
 * Fixed Claude model tiers for profiles with the "default model list" switch.
 *
 * When enabled, /v1/models ignores the allowlist and provider routes and
 * returns this fixed tier list; requests for these model names and their dated
 * snapshots route through the profile tier slots (fableModel/opusModel/sonnetModel/haikuModel).
 * Keep this module dependency-light (contracts + shared constants only) so
 * model-discovery can import it without cycles.
 */
import type { ProfileConfig } from "@ccr/core/contracts/app";
import { stripOneMillionContextSuffix } from "@ccr/core/gateway/internal/shared";

/**
 * Request marker header carrying the client-requested model so the response
 * stream hook can rewrite message_start.model back to it. Declared in the
 * router-plugin contract's untrusted-header strip list, so clients cannot
 * forge it at ingress.
 */
export const ccrClientVisibleModelHeader = "x-ccr-client-visible-model";

export type ClaudeDefaultModelTier = {
  description: string;
  displayName: string;
  /** Discovery-facing model id, e.g. "claude-fable-5-1[1m]". */
  id: string;
  /** Fallback input limit when the routing target cannot be resolved. */
  maxInputTokens: number;
  /** Request-side base id without the [1m] suffix, e.g. "claude-fable-5-1". */
  model: string;
  oneMillionContext: boolean;
  profileSlot: "fableModel" | "opusModel" | "sonnetModel" | "haikuModel";
};

export const claudeDefaultModelTiers: readonly ClaudeDefaultModelTier[] = [
  {
    description: "Fable 5.1 · Most capable for your hardest and longest-running tasks",
    displayName: "Fable 5.1",
    id: "claude-fable-5-1[1m]",
    maxInputTokens: 1_000_000,
    model: "claude-fable-5-1",
    oneMillionContext: true,
    profileSlot: "fableModel"
  },
  {
    description: "Opus 5.5 with 1M context · Best for everyday, complex tasks",
    displayName: "Opus 5.5",
    id: "claude-opus-5-5[1m]",
    maxInputTokens: 1_000_000,
    model: "claude-opus-5-5",
    oneMillionContext: true,
    profileSlot: "opusModel"
  },
  {
    description: "Sonnet 5 for long sessions",
    displayName: "Sonnet 5",
    id: "claude-sonnet-5[1m]",
    maxInputTokens: 1_000_000,
    model: "claude-sonnet-5",
    oneMillionContext: true,
    profileSlot: "sonnetModel"
  },
  {
    description: "Haiku 4.5 · Fastest for quick answers",
    displayName: "Haiku 4.5",
    id: "claude-haiku-4-5-20251001",
    maxInputTokens: 200_000,
    model: "claude-haiku-4-5",
    oneMillionContext: false,
    profileSlot: "haikuModel"
  }
];

export function isClaudeDefaultModelListEnabled(profile: ProfileConfig | undefined): boolean {
  return profile?.claudeDefaultModelList === true;
}

export function findClaudeDefaultModelTier(model: string | undefined): ClaudeDefaultModelTier | undefined {
  const normalized = normalizeClaudeDefaultModelKey(model);
  if (!normalized) {
    return undefined;
  }
  return claudeDefaultModelTiers.find((tier) => normalizeClaudeDefaultModelKey(tier.model) === normalized);
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

function normalizeClaudeDefaultModelKey(model: string | undefined): string | undefined {
  // A terminal YYYYMMDD snapshot suffix aliases the same advertised base tier.
  const stripped = stripOneMillionContextSuffix(model ?? "").toLowerCase().replace(/-\d{8}$/, "");
  return stripped || undefined;
}
