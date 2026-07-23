import type { AppConfig, VirtualModelProfileConfig } from "@ccr/core/contracts/app";
import { modelRegistryForConfig, normalizeRouteSelector, parseProviderModelSelector } from "@ccr/core/routing/model-registry";

export type UsageModelAttribution = {
  logicalModel?: string;
  model?: string;
  provider?: string;
};

type UsageModelAttributionOptions = {
  physicalModel?: boolean;
};

type VirtualModelMatch = {
  kind: "exact" | "prefix" | "suffix";
  profile: VirtualModelProfileConfig;
  token: string;
};

export function resolveUsageModelAttribution(
  config: Pick<AppConfig, "Providers" | "virtualModelProfiles"> | undefined,
  value: string | undefined,
  options: UsageModelAttributionOptions = {}
): UsageModelAttribution {
  const logicalModel = normalizeRouteSelector(value);
  if (!logicalModel) {
    return {};
  }

  if (options.physicalModel) {
    return { logicalModel, model: logicalModel };
  }

  if (!config) {
    return attributionFromSelector(logicalModel, logicalModel);
  }

  const match = findVirtualModelMatch(config.virtualModelProfiles ?? [], logicalModel);
  const targetSelector = match ? resolveVirtualTargetSelector(logicalModel, match) : undefined;
  if (targetSelector) {
    const target = modelRegistryForConfig(config).resolve(targetSelector);
    if (target?.kind === "provider") {
      return {
        logicalModel,
        model: target.model,
        provider: target.provider.name
      };
    }
    return attributionFromSelector(targetSelector, logicalModel, true);
  }

  const direct = modelRegistryForConfig(config).resolve(logicalModel);
  if (direct?.kind === "provider") {
    return {
      logicalModel,
      model: direct.model,
      provider: direct.provider.name
    };
  }

  return attributionFromSelector(logicalModel, logicalModel, isKnownProviderSelector(config, logicalModel));
}

function isKnownProviderSelector(
  config: Pick<AppConfig, "Providers" | "virtualModelProfiles">,
  value: string
): boolean {
  const parsed = parseProviderModelSelector(value);
  return Boolean(parsed && modelRegistryForConfig(config).findProvider(parsed.provider));
}

function findVirtualModelMatch(profiles: VirtualModelProfileConfig[], selector: string): VirtualModelMatch | undefined {
  const parsed = parseProviderModelSelector(selector);
  const model = parsed?.model ?? selector;

  for (const profile of profiles) {
    if (profile.enabled === false) {
      continue;
    }
    for (const alias of profile.match?.exactAliases ?? []) {
      const normalizedAlias = alias.trim();
      if (normalizedAlias && (normalizedAlias === selector || normalizedAlias === model)) {
        return { kind: "exact", profile, token: normalizedAlias };
      }
    }
  }

  const suffixMatch = longestVirtualModelMatch(profiles, model, "suffix");
  if (suffixMatch) {
    return suffixMatch;
  }

  return longestVirtualModelMatch(profiles, model, "prefix");
}

function longestVirtualModelMatch(
  profiles: VirtualModelProfileConfig[],
  model: string,
  kind: "prefix" | "suffix"
): VirtualModelMatch | undefined {
  const matches: VirtualModelMatch[] = [];
  for (const profile of profiles) {
    if (profile.enabled === false) {
      continue;
    }
    const tokens = kind === "prefix" ? profile.match?.prefixes : profile.match?.suffixes;
    for (const token of tokens ?? []) {
      if (
        token &&
        model.length > token.length &&
        (kind === "prefix" ? model.startsWith(token) : model.endsWith(token))
      ) {
        matches.push({ kind, profile, token });
      }
    }
  }

  return matches.sort((left, right) => right.token.length - left.token.length)[0];
}

function resolveVirtualTargetSelector(selector: string, match: VirtualModelMatch): string | undefined {
  const fixedModel = normalizeRouteSelector(match.profile.baseModel?.fixedModel);
  if (match.profile.baseModel?.mode === "fixed" || fixedModel) {
    return fixedModel;
  }

  const parsed = parseProviderModelSelector(selector);
  const model = parsed?.model ?? selector;
  if (match.kind === "prefix" || match.kind === "suffix") {
    const targetModel = match.kind === "prefix"
      ? model.slice(match.token.length)
      : model.slice(0, -match.token.length);
    return parsed ? `${parsed.provider}/${targetModel}` : targetModel;
  }

  return match.profile.baseModel?.mode === "request" ? selector : undefined;
}

function attributionFromSelector(
  selector: string,
  logicalModel: string,
  assumeRouteSelector = true
): UsageModelAttribution {
  const parsed = assumeRouteSelector ? parseProviderModelSelector(selector) : undefined;
  return {
    logicalModel,
    model: parsed?.model ?? selector,
    provider: parsed?.provider
  };
}
