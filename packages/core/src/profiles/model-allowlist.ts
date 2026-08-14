import type { ApiKeyConfig, AppConfig, ProfileConfig } from "@ccr/core/contracts/app";
import { resolveClaudeAppGatewayRouteModel } from "@ccr/core/agents/claude-app/gateway-routes";
import { profileApiKeyId } from "@ccr/core/profiles/api-key";
import { modelRegistryForConfig, normalizeRouteSelector } from "@ccr/core/routing/model-registry";

export type ProfileModelAllowlistConfig = Pick<AppConfig, "Providers" | "profile" | "virtualModelProfiles">;
export type ModelAllowlistResolutionConfig = Pick<AppConfig, "Providers" | "virtualModelProfiles"> & Partial<Pick<AppConfig, "profile">>;

export function profileForApiKey(
  config: Partial<Pick<AppConfig, "profile">>,
  apiKey: ApiKeyConfig | undefined
): ProfileConfig | undefined {
  if (!config.profile || config.profile.enabled === false) {
    return undefined;
  }
  const apiKeyId = apiKey?.id?.trim();
  if (!apiKeyId) {
    return undefined;
  }
  return config.profile.profiles.find((profile) =>
    profile.enabled && profileApiKeyId(profile) === apiKeyId
  );
}

export function profileAllowedModels(profile: ProfileConfig | undefined): string[] | undefined {
  const explicit = uniqueModels((profile?.availableModels ?? []).map(normalizeAllowlistModel));
  if (!profile || explicit.length === 0) {
    return undefined;
  }
  return uniqueModels([
    normalizeAllowlistModel(profile.model),
    ...explicit
  ]);
}

export function filterModelIdsForProfile(
  config: ModelAllowlistResolutionConfig,
  ids: string[],
  profile: ProfileConfig | undefined
): string[] {
  return filterModelIdsByAllowedModels(config, ids, profileAllowedModels(profile));
}

export function filterModelIdsByAllowedModels(
  config: ModelAllowlistResolutionConfig | undefined,
  ids: string[],
  allowedModels: string[] | undefined
): string[] {
  const allowed = modelAllowlistKeys(config, allowedModels);
  if (!allowed) {
    return uniqueModels(ids);
  }
  return uniqueModels(ids).filter((id) =>
    modelKeys(config, id).some((key) => allowed.has(key))
  );
}

export function isModelAllowedForProfile(
  config: ModelAllowlistResolutionConfig,
  profile: ProfileConfig | undefined,
  model: string | undefined
): boolean {
  const allowed = modelAllowlistKeys(config, profileAllowedModels(profile));
  if (!allowed) {
    return true;
  }
  const modelKeysToCheck = modelKeys(config, model);
  return modelKeysToCheck.length === 0 || modelKeysToCheck.some((key) => allowed.has(key));
}

function modelAllowlistKeys(
  config: ModelAllowlistResolutionConfig | undefined,
  allowedModels: string[] | undefined
): Set<string> | undefined {
  const normalized = uniqueModels((allowedModels ?? []).map(normalizeAllowlistModel));
  if (normalized.length === 0) {
    return undefined;
  }
  const keys = new Set<string>();
  for (const model of normalized) {
    for (const key of modelKeys(config, model)) {
      keys.add(key);
    }
  }
  return keys;
}

function modelKeys(
  config: ModelAllowlistResolutionConfig | undefined,
  model: string | undefined
): string[] {
  const normalized = normalizeAllowlistModel(model);
  if (!normalized) {
    return [];
  }
  const registry = config ? modelRegistryForConfig(config) : undefined;
  const rawModelIsConfigured = Boolean(registry?.resolve(normalized));
  const claudeAppTarget = resolveClaudeAppRouteTarget(config, normalized);
  const seeds = uniqueModels([
    ...modelKeySeeds(normalized, { includeDiscoveryAliases: !rawModelIsConfigured }),
    ...(claudeAppTarget ? [claudeAppTarget] : [])
  ]);
  const keys = new Set<string>();
  for (const seed of seeds) {
    addKey(keys, seed);
  }
  if (!config || !registry) {
    return [...keys];
  }

  for (const seed of seeds) {
    const resolved = registry.resolve(seed);
    if (resolved) {
      addKey(keys, resolved.selector);
      addKey(keys, resolved.canonicalSelector);
      if (resolved.kind === "provider") {
        addKey(keys, `${resolved.provider.name}/${resolved.model}`);
      } else {
        addKey(keys, resolved.model);
      }
    }
  }
  return [...keys];
}

function resolveClaudeAppRouteTarget(
  config: ModelAllowlistResolutionConfig | undefined,
  model: string
): string | undefined {
  if (!config?.profile) {
    return undefined;
  }
  return resolveClaudeAppGatewayRouteModel(model, {
    Providers: config.Providers,
    profile: config.profile,
    virtualModelProfiles: config.virtualModelProfiles
  });
}

function modelKeySeeds(
  normalized: string,
  options: { includeDiscoveryAliases: boolean }
): string[] {
  if (!options.includeDiscoveryAliases) {
    return [normalized];
  }
  const withoutOneMillionContext = stripOneMillionContextSuffix(normalized);
  const withoutClaudePrefix = stripClaudeDiscoveryPrefix(normalized);
  const withoutClaudePrefixAndContext = stripOneMillionContextSuffix(withoutClaudePrefix);
  return uniqueModels([
    normalized,
    withoutOneMillionContext,
    withoutClaudePrefix,
    withoutClaudePrefixAndContext
  ]);
}

function normalizeAllowlistModel(model: string | undefined): string {
  return normalizeRouteSelector(model) ?? "";
}

function stripClaudeDiscoveryPrefix(model: string): string {
  return model.toLowerCase().startsWith("claude-") ? model.slice("claude-".length).trim() : model;
}

function stripOneMillionContextSuffix(model: string): string {
  return model.replace(/\[1m\]$/i, "").trim();
}

function addKey(keys: Set<string>, value: string | undefined): void {
  const normalized = normalizeAllowlistModel(value);
  if (normalized) {
    keys.add(normalized.toLowerCase());
  }
}

function uniqueModels(models: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const model of models) {
    const normalized = normalizeAllowlistModel(model);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
