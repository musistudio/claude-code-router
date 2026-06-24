import type { AppConfig } from "./app";
import { normalizeProfileScopeValue } from "./app";

export const CLAUDE_APP_FALLBACK_MODEL = "claude-sonnet-4-5";
export const CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX = "[1m]";

const CLAUDE_APP_ROUTE_NAMES = [
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-opus-4-5",
  "claude-sonnet-4",
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4"
];

export type ClaudeAppGatewayModelRoute = {
  displayName: string;
  id: string;
  oneMillionContext: boolean;
  targetModel: string;
};

export type ClaudeAppGatewayModelRouteOptions = {
  supportsOneMillionContext?: (model: string) => boolean;
};

export function inferClaudeAppGatewayTargetModel(config: Pick<AppConfig, "Router" | "profile">): string {
  return config.Router.default?.trim() ||
    inferGlobalClaudeProfileModel(config) ||
    CLAUDE_APP_FALLBACK_MODEL;
}

export function buildClaudeAppGatewayModelRoutes(
  config: Pick<AppConfig, "Providers" | "Router" | "profile" | "virtualModelProfiles">,
  options: ClaudeAppGatewayModelRouteOptions = {}
): ClaudeAppGatewayModelRoute[] {
  const targetModels = claudeAppGatewayTargetModels(config).slice(0, CLAUDE_APP_ROUTE_NAMES.length);
  const displayNames = claudeAppGatewayDisplayNames(targetModels);
  return targetModels.map((rawTargetModel, index) => {
    const targetModel = stripClaudeAppGatewayOneMillionContextSuffix(rawTargetModel);
    const oneMillionContext = claudeAppGatewaySupportsOneMillionContext(rawTargetModel, options);
    const routeId = claudeAppGatewayRouteId(index);
    return {
      displayName: oneMillionContext ? `${displayNames[index]} (1M context)` : displayNames[index],
      id: routeId,
      oneMillionContext,
      targetModel
    };
  });
}

export function resolveClaudeAppGatewayRouteModel(
  model: string,
  config: Pick<AppConfig, "Providers" | "Router" | "profile" | "virtualModelProfiles">,
  options: ClaudeAppGatewayModelRouteOptions = {}
): string | undefined {
  const normalized = model.trim().toLowerCase();
  return buildClaudeAppGatewayModelRoutes(config, options).find((route) => {
    const routeId = route.id.toLowerCase();
    return routeId === normalized ||
      stripClaudeAppGatewayOneMillionContextSuffix(routeId).toLowerCase() === normalized;
  })?.targetModel;
}

export function buildClaudeAppGatewayInferenceModels(
  config: Pick<AppConfig, "Providers" | "Router" | "profile" | "virtualModelProfiles">,
  options: ClaudeAppGatewayModelRouteOptions = {}
): Array<{ displayName: string; name: string }> {
  const routes = buildClaudeAppGatewayModelRoutes(config, options);
  return routes.length
    ? routes.map((route) => ({ displayName: route.displayName, name: route.id }))
    : [{ displayName: "Claude Sonnet 4.5", name: CLAUDE_APP_FALLBACK_MODEL }];
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

function claudeAppGatewayTargetModels(config: Pick<AppConfig, "Providers" | "Router" | "profile" | "virtualModelProfiles">): string[] {
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
  options: ClaudeAppGatewayModelRouteOptions
): boolean {
  const baseModel = stripClaudeAppGatewayOneMillionContextSuffix(model);
  return hasClaudeAppGatewayOneMillionContextSuffix(model) ||
    Boolean(options.supportsOneMillionContext?.(baseModel));
}

function claudeAppGatewayRouteId(index: number): string {
  return CLAUDE_APP_ROUTE_NAMES[index] ?? CLAUDE_APP_FALLBACK_MODEL;
}

function claudeAppGatewayDisplayNames(models: string[]): string[] {
  const baseNames = models.map((model) => claudeAppGatewayBaseDisplayName(stripClaudeAppGatewayOneMillionContextSuffix(model)));
  const counts = new Map<string, number>();
  for (const baseName of baseNames) {
    const key = baseName.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return models.map((model, index) => counts.get(baseNames[index].toLowerCase()) === 1
    ? baseNames[index]
    : stripClaudeAppGatewayOneMillionContextSuffix(model));
}

function claudeAppGatewayBaseDisplayName(model: string): string {
  const trimmed = model.trim();
  return trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
