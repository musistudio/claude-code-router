import type { AppConfig } from "@ccr/core/contracts/app";
import { normalizeProfileScopeValue } from "@ccr/core/contracts/app";

export const CLAUDE_APP_FALLBACK_MODEL = "claude-sonnet-4-5";
export const CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX = "[1m]";
const CLAUDE_APP_ENCODED_ROUTE_PREFIX = "anthropic/claude-ccr-h";
const SAKANA_API_HOSTNAME = "api.sakana.ai";
const SAKANA_ONE_MILLION_CONTEXT_MODELS = new Set(["fugu", "fugu-ultra"]);

export type ClaudeAppGatewayModelRoute = {
  displayName: string;
  id: string;
  legacyId?: string;
  legacyIds?: string[];
  oneMillionContext: boolean;
  targetModel: string;
};

export type ClaudeAppGatewayModelRouteOptions = {
  displayName?: (model: string) => string | undefined;
  supportsOneMillionContext?: (model: string) => boolean;
};

export type ClaudeAppGatewayInferenceModel = {
  labelOverride: string;
  name: string;
  supports1m?: true;
};

export function inferClaudeAppGatewayTargetModel(config: Pick<AppConfig, "profile">): string {
  return inferGlobalClaudeProfileModel(config) ||
    CLAUDE_APP_FALLBACK_MODEL;
}

export function buildClaudeAppGatewayModelRoutes(
  config: Pick<AppConfig, "Providers" | "profile" | "virtualModelProfiles">,
  options: ClaudeAppGatewayModelRouteOptions = {}
): ClaudeAppGatewayModelRoute[] {
  const targetModels = claudeAppGatewayTargetModels(config);
  const displayNames = claudeAppGatewayDisplayNames(targetModels, options);
  const configuredTargetKeys = new Set(targetModels.map((model) =>
    stripClaudeAppGatewayOneMillionContextSuffix(model).toLowerCase()
  ));
  const usedRouteIds = new Set<string>();
  const seenTargets = new Set<string>();
  return targetModels.flatMap((rawTargetModel, index) => {
    const targetModel = stripClaudeAppGatewayOneMillionContextSuffix(rawTargetModel);
    const oneMillionContext = claudeAppGatewaySupportsOneMillionContext(rawTargetModel, config, options);
    const targetKey = `${targetModel.toLowerCase()}::${oneMillionContext ? "1m" : "base"}`;
    if (seenTargets.has(targetKey)) {
      return [];
    }
    seenTargets.add(targetKey);

    const routeId = claudeAppGatewayRouteId(targetModel, usedRouteIds, configuredTargetKeys);
    if (!routeId) {
      return [];
    }

    const legacyIds = uniqueStrings([
      claudeAppGatewayGeneratedRouteId(rawTargetModel),
      rawTargetModel === targetModel ? "" : claudeAppGatewayGeneratedRouteId(targetModel),
      targetModel
    ]).filter((id) => id.toLowerCase() !== routeId.toLowerCase());

    const baseRoute = {
      displayName: displayNames[index],
      id: routeId,
      legacyId: legacyIds[0],
      legacyIds,
      oneMillionContext,
      targetModel
    };

    if (oneMillionContext && !hasClaudeAppGatewayOneMillionContextSuffix(routeId)) {
      const oneMillionRouteId = `${routeId}${CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX}`;
      const oneMillionRoute = {
        displayName: `${displayNames[index]} (1M)`,
        id: oneMillionRouteId,
        legacyId: `${legacyIds[0] || routeId}${CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX}`,
        legacyIds: legacyIds.map((id) => `${id}${CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX}`),
        oneMillionContext: true,
        targetModel
      };
      return [baseRoute, oneMillionRoute];
    }

    return [baseRoute];
  });
}

export function resolveClaudeAppGatewayRouteModel(
  model: string,
  config: Pick<AppConfig, "Providers" | "profile" | "virtualModelProfiles">,
  options: ClaudeAppGatewayModelRouteOptions = {}
): string | undefined {
  const normalized = model.trim().toLowerCase();
  const decodedRouteModel = decodeClaudeAppGatewayRouteId(normalized);
  if (decodedRouteModel) {
    const decodedTarget = claudeAppGatewayTargetModels(config).find((targetModel) =>
      stripClaudeAppGatewayOneMillionContextSuffix(targetModel).toLowerCase() === decodedRouteModel.toLowerCase()
    );
    if (decodedTarget) {
      return stripClaudeAppGatewayOneMillionContextSuffix(decodedTarget);
    }
  }

  return buildClaudeAppGatewayModelRoutes(config, options).find((route) => {
    const normalizedBase = stripClaudeAppGatewayOneMillionContextSuffix(normalized).toLowerCase();
    return claudeAppGatewayRouteMatchIds(route).some((id) => {
      const routeId = id.toLowerCase();
      const routeBaseId = stripClaudeAppGatewayOneMillionContextSuffix(routeId).toLowerCase();
      return routeId === normalized || routeBaseId === normalizedBase;
    });
  })?.targetModel;
}

export function buildClaudeAppGatewayInferenceModels(
  config: Pick<AppConfig, "Providers" | "profile" | "virtualModelProfiles">,
  options: ClaudeAppGatewayModelRouteOptions = {}
): ClaudeAppGatewayInferenceModel[] {
  const routes = buildClaudeAppGatewayModelRoutes(config, options);
  return routes.length
    ? routes.map((route) => ({
        labelOverride: route.displayName,
        name: route.id,
        ...(route.oneMillionContext ? { supports1m: true as const } : {})
      }))
    : [{ labelOverride: "Claude Sonnet 4.5", name: CLAUDE_APP_FALLBACK_MODEL }];
}

export function hasClaudeAppGatewayOneMillionContextSuffix(id: string): boolean {
  return id.trim().toLowerCase().endsWith(CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX);
}

export function stripClaudeAppGatewayOneMillionContextSuffix(id: string): string {
  return id.trim().replace(/\[1m\]$/i, "").trim();
}

function inferGlobalClaudeProfileModel(config: Pick<AppConfig, "profile">): string {
  return config.profile.profiles.find((profile) =>
    profile.enabled &&
    profile.agent === "claude-code" &&
    normalizeProfileScopeValue(profile.scope) === "global" &&
    profile.model.trim()
  )?.model.trim() ?? "";
}

function claudeAppGatewayTargetModels(config: Pick<AppConfig, "Providers" | "profile" | "virtualModelProfiles">): string[] {
  const baseEntries = config.Providers.flatMap((provider) => {
    const providerName = provider.name?.trim();
    if (!providerName || !Array.isArray(provider.models)) {
      return [];
    }
    return provider.models.flatMap((rawModel) => {
      const modelName = rawModel.trim();
      return modelName ? [{ modelName, providerName }] : [];
    });
  });

  return uniqueStrings([
    inferClaudeAppGatewayTargetModel(config),
    ...baseEntries.map((entry) => `${entry.providerName}/${entry.modelName}`),
    ...(config.virtualModelProfiles ?? []).flatMap((profile) => {
      if (
        profile.enabled === false ||
        profile.materialization?.enabled === false ||
        profile.materialization?.includeInGatewayModels === false
      ) {
        return [];
      }
      const derivedModels = baseEntries.flatMap((entry) => [
        ...(profile.match?.prefixes ?? []).flatMap((prefix) => {
          const normalizedPrefix = prefix.trim();
          return normalizedPrefix ? [`${entry.providerName}/${normalizedPrefix}${entry.modelName}`] : [];
        }),
        ...(profile.match?.suffixes ?? []).flatMap((suffix) => {
          const normalizedSuffix = suffix.trim();
          return normalizedSuffix ? [`${entry.providerName}/${entry.modelName}${normalizedSuffix}`] : [];
        })
      ]);
      return [
        ...derivedModels,
        ...(profile.match?.exactAliases ?? []).flatMap((alias) => {
          const normalizedAlias = alias.trim();
          if (!normalizedAlias) {
            return [];
          }
          return normalizedAlias.toLowerCase().startsWith("fusion/")
            ? [normalizedAlias]
            : [`Fusion/${normalizedAlias}`];
        })
      ];
    })
  ]);
}

function claudeAppGatewaySupportsOneMillionContext(
  model: string,
  config: Pick<AppConfig, "Providers">,
  options: ClaudeAppGatewayModelRouteOptions
): boolean {
  const baseModel = stripClaudeAppGatewayOneMillionContextSuffix(model);
  return hasClaudeAppGatewayOneMillionContextSuffix(model) ||
    Boolean(options.supportsOneMillionContext?.(baseModel)) ||
    claudeAppGatewayProviderModelSupportsOneMillionContext(baseModel, config);
}

function claudeAppGatewayProviderModelSupportsOneMillionContext(
  model: string,
  config: Pick<AppConfig, "Providers">
): boolean {
  const target = splitClaudeAppGatewayProviderModelSelector(model);
  if (!target || !SAKANA_ONE_MILLION_CONTEXT_MODELS.has(target.modelName.toLowerCase())) {
    return false;
  }

  const provider = config.Providers.find((candidate) =>
    candidate.name?.trim().toLowerCase() === target.providerName.toLowerCase()
  );
  return provider ? claudeAppGatewayProviderTargetsSakana(provider) : false;
}

function splitClaudeAppGatewayProviderModelSelector(model: string): { modelName: string; providerName: string } | undefined {
  const normalized = stripClaudeAppGatewayOneMillionContextSuffix(model);
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return undefined;
  }
  const providerName = normalized.slice(0, separator).trim();
  const modelName = normalized.slice(separator + 1).trim();
  return providerName && modelName ? { modelName, providerName } : undefined;
}

function claudeAppGatewayProviderTargetsSakana(provider: AppConfig["Providers"][number]): boolean {
  return [
    provider.baseUrl,
    provider.baseurl,
    provider.api_base_url,
    ...(provider.capabilities ?? []).map((capability) => capability.baseUrl)
  ].some(claudeAppGatewayUrlTargetsSakana);
}

function claudeAppGatewayUrlTargetsSakana(value: string | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }
  try {
    return new URL(normalized).hostname.toLowerCase() === SAKANA_API_HOSTNAME;
  } catch {
    return false;
  }
}

function claudeAppGatewayRouteId(
  model: string,
  usedRouteIds: Set<string>,
  configuredTargetKeys: Set<string>
): string | undefined {
  const targetModel = stripClaudeAppGatewayOneMillionContextSuffix(model);
  const candidates = [claudeAppGatewayNativeRouteId(targetModel), claudeAppGatewayEncodedRouteId(targetModel)];

  for (const candidate of candidates) {
    const claimed = claimClaudeAppGatewayRouteId(candidate, usedRouteIds, configuredTargetKeys, targetModel);
    if (claimed) {
      return claimed;
    }
  }

  for (let index = 2; index < 100; index += 1) {
    const claimed = claimClaudeAppGatewayRouteId(
      claudeAppGatewayEncodedRouteId(targetModel, index),
      usedRouteIds,
      configuredTargetKeys,
      targetModel
    );
    if (claimed) {
      return claimed;
    }
  }

  return undefined;
}

function claudeAppGatewayGeneratedRouteId(model: string): string {
  const normalized = model.trim();
  return normalized.toLowerCase().startsWith("claude-") ? normalized : `claude-${normalized}`;
}

function claudeAppGatewayNativeRouteId(model: string): string | undefined {
  const normalized = stripClaudeAppGatewayOneMillionContextSuffix(model);
  const lower = normalized.toLowerCase();
  if (!normalized.includes("/") && claudeAppGatewayNativeModelNameIsSafe(lower)) {
    return normalized;
  }
  if (lower.startsWith("anthropic/")) {
    const anthropicModel = normalized.slice("anthropic/".length);
    return claudeAppGatewayNativeModelNameIsSafe(anthropicModel.toLowerCase()) ? normalized : undefined;
  }
  return undefined;
}

function claudeAppGatewayNativeModelNameIsSafe(model: string): boolean {
  return /^claude-(?:3(?:-[57])?-(?:haiku|sonnet|opus)|(?:haiku|sonnet|opus|fable)(?:[-.:@0-9a-z]+)?|code(?:[-.:@0-9a-z]+)?)$/i.test(model);
}

function claudeAppGatewayEncodedRouteId(model: string, variant?: number): string {
  const routePrefix = variant && variant > 1
    ? `anthropic/claude-ccr${variant}-h`
    : CLAUDE_APP_ENCODED_ROUTE_PREFIX;
  return `${routePrefix}${encodeClaudeAppGatewayRouteModel(model)}`;
}

function encodeClaudeAppGatewayRouteModel(model: string): string {
  return Buffer.from(stripClaudeAppGatewayOneMillionContextSuffix(model), "utf8").toString("hex");
}

function decodeClaudeAppGatewayRouteId(routeId: string): string | undefined {
  const normalized = stripClaudeAppGatewayOneMillionContextSuffix(routeId).toLowerCase();
  const match = /^anthropic\/claude-ccr(?:\d+)?-h([0-9a-f]+)$/.exec(normalized);
  const encoded = match?.[1];
  if (!encoded || encoded.length % 2 !== 0) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(encoded, "hex").toString("utf8").trim();
    return decoded || undefined;
  } catch {
    return undefined;
  }
}

function claimClaudeAppGatewayRouteId(
  routeId: string | undefined,
  usedRouteIds: Set<string>,
  configuredTargetKeys: Set<string>,
  targetModel: string
): string | undefined {
  const normalized = routeId ? stripClaudeAppGatewayOneMillionContextSuffix(routeId) : "";
  if (!normalized) {
    return undefined;
  }
  const key = normalized.toLowerCase();
  const targetKey = stripClaudeAppGatewayOneMillionContextSuffix(targetModel).toLowerCase();
  if (usedRouteIds.has(key) || (configuredTargetKeys.has(key) && key !== targetKey)) {
    return undefined;
  }
  usedRouteIds.add(key);
  return normalized;
}

function claudeAppGatewayRouteMatchIds(route: ClaudeAppGatewayModelRoute): string[] {
  return uniqueStrings([route.id, route.legacyId, ...(route.legacyIds ?? [])]);
}

function claudeAppGatewayDisplayNames(
  models: string[],
  options: ClaudeAppGatewayModelRouteOptions
): string[] {
  const baseNames = models.map((model) => {
    const targetModel = stripClaudeAppGatewayOneMillionContextSuffix(model);
    return claudeAppGatewayDisplayNameWithProvider(
      targetModel,
      options.displayName?.(targetModel) ?? claudeAppGatewayBaseDisplayName(targetModel)
    );
  });
  const counts = new Map<string, number>();
  for (const baseName of baseNames) {
    const key = baseName.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateIndexes = new Map<string, number>();
  return models.map((_model, index) => {
    const baseName = baseNames[index];
    const key = baseName.toLowerCase();
    if (counts.get(key) === 1) {
      return baseName;
    }
    const duplicateIndex = (duplicateIndexes.get(key) ?? 0) + 1;
    duplicateIndexes.set(key, duplicateIndex);
    return `${baseName} #${duplicateIndex}`;
  });
}

function claudeAppGatewayBaseDisplayName(model: string): string {
  const trimmed = model.trim();
  return trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
}

function claudeAppGatewayDisplayNameWithProvider(model: string, displayName: string): string {
  const trimmed = model.trim();
  const separator = trimmed.indexOf("/");
  if (separator <= 0 || separator >= trimmed.length - 1) {
    return displayName;
  }
  const provider = trimmed.slice(0, separator).trim();
  if (!provider || displayName.toLowerCase().startsWith(`${provider.toLowerCase()}/`)) {
    return displayName;
  }
  return `${provider}/${displayName}`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim() ?? "";
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
