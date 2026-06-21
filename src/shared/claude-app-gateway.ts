import type { AppConfig } from "./app";
import { normalizeProfileScopeValue } from "./app";

export const CLAUDE_APP_FALLBACK_MODEL = "claude-sonnet-4-5";

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
  targetModel: string;
};

export function inferClaudeAppGatewayTargetModel(config: Pick<AppConfig, "Router" | "profile">): string {
  return config.Router.default?.trim() ||
    inferGlobalClaudeProfileModel(config) ||
    CLAUDE_APP_FALLBACK_MODEL;
}

export function buildClaudeAppGatewayModelRoutes(config: Pick<AppConfig, "Providers" | "Router" | "profile" | "virtualModelProfiles">): ClaudeAppGatewayModelRoute[] {
  const targetModels = claudeAppGatewayTargetModels(config);
  return targetModels.slice(0, CLAUDE_APP_ROUTE_NAMES.length).map((targetModel, index) => ({
    displayName: claudeAppGatewayDisplayName(targetModel),
    id: CLAUDE_APP_ROUTE_NAMES[index],
    targetModel
  }));
}

export function resolveClaudeAppGatewayRouteModel(model: string, config: Pick<AppConfig, "Providers" | "Router" | "profile" | "virtualModelProfiles">): string | undefined {
  const normalized = model.trim().toLowerCase();
  return buildClaudeAppGatewayModelRoutes(config).find((route) => route.id.toLowerCase() === normalized)?.targetModel;
}

export function buildClaudeAppGatewayInferenceModels(config: Pick<AppConfig, "Providers" | "Router" | "profile" | "virtualModelProfiles">): Array<{ displayName: string; name: string }> {
  const routes = buildClaudeAppGatewayModelRoutes(config);
  return routes.length
    ? routes.map((route) => ({ displayName: route.displayName, name: route.id }))
    : [{ displayName: "Claude Sonnet 4.5", name: CLAUDE_APP_FALLBACK_MODEL }];
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
  return uniqueStrings([
    inferClaudeAppGatewayTargetModel(config),
    ...config.Providers.flatMap((provider) => provider.models.map((model) => `${provider.name}/${model}`)),
    ...(config.virtualModelProfiles ?? []).flatMap((profile) => {
      if (
        profile.enabled === false ||
        profile.materialization?.enabled === false ||
        profile.materialization?.includeInGatewayModels === false
      ) {
        return [];
      }
      return (profile.match?.exactAliases ?? []).flatMap((alias) => {
        const normalizedAlias = alias.trim();
        if (!normalizedAlias) {
          return [];
        }
        return normalizedAlias.toLowerCase().startsWith("fusion/")
          ? [normalizedAlias]
          : [`Fusion/${normalizedAlias}`];
      });
    })
  ]);
}

function claudeAppGatewayDisplayName(model: string): string {
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
