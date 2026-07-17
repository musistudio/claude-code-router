import type { AppConfig } from "@ccr/core/contracts/app";
import {
  buildClaudeAppGatewayModelRoutes,
  hasClaudeAppGatewayOneMillionContextSuffix,
  stripClaudeAppGatewayOneMillionContextSuffix,
  type ClaudeAppGatewayModelRoute
} from "@ccr/core/agents/claude-app/gateway-routes";
import { claudeAppGatewayModelRouteOptions } from "@ccr/core/agents/claude-app/model-route-options";
import { modelRegistryForConfig } from "@ccr/core/routing/model-registry";

const maxAllowedModels = 64;
const maxAllowedModelBytes = 512;
const encodedGatewayRoutePattern = /^anthropic\/claude-ccr\d*-h/i;
const nativeClaudeAliasPattern = /^(?:fable|haiku|opus|sonnet)$/i;
const nativeClaudeVersionPrefixPattern = /^(?:fable|haiku|opus|sonnet)-[a-z0-9][a-z0-9._:@-]*$/i;
const nativeClaudeModelPattern = /^(?:anthropic\/)?claude-(?!ccr\d*-h)[a-z0-9][a-z0-9._:@-]*$/i;

export type ClaudeCodeAllowedModelsSettings = {
  availableModels: string[];
  enforceAvailableModels: true;
};

type ClaudeCodeModelCompiler = (rawValue: string, source: "allowedModels" | "profile") => string;

export function compileClaudeCodeAllowedModels(
  config: Pick<AppConfig, "Providers" | "profile" | "virtualModelProfiles">,
  values: readonly string[] | undefined
): ClaudeCodeAllowedModelsSettings | undefined {
  if (!values?.length) {
    return undefined;
  }
  if (values.length > maxAllowedModels) {
    throw new Error(`Claude Code allowedModels accepts at most ${maxAllowedModels} entries.`);
  }

  const compileModel = createClaudeCodeModelCompiler(config);
  const seen = new Set<string>();
  const availableModels: string[] = [];

  for (const rawValue of values) {
    const compiled = compileModel(rawValue, "allowedModels");

    const key = compiled.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      availableModels.push(compiled);
    }
  }

  return {
    availableModels,
    enforceAvailableModels: true
  };
}

export function compileClaudeCodeModelSelector(
  config: Pick<AppConfig, "Providers" | "profile" | "virtualModelProfiles">,
  value: string
): string {
  return createClaudeCodeModelCompiler(config)(value, "profile");
}

export function isClaudeCodeModelAllowedByPolicy(
  settings: ClaudeCodeAllowedModelsSettings,
  model: string
): boolean {
  const normalizedModel = stripClaudeAppGatewayOneMillionContextSuffix(model).toLowerCase();
  const modelFamily = nativeClaudeModelFamily(normalizedModel);
  return settings.availableModels.some((allowedModel) => {
    const normalizedAllowedModel = stripClaudeAppGatewayOneMillionContextSuffix(allowedModel)
      .toLowerCase();
    if (normalizedAllowedModel === normalizedModel) {
      return true;
    }
    if (
      modelFamily &&
      nativeClaudeAliasPattern.test(normalizedAllowedModel)
    ) {
      return normalizedAllowedModel === modelFamily;
    }
    if (nativeClaudeVersionPrefixPattern.test(normalizedAllowedModel)) {
      if (nativeClaudeAliasPattern.test(normalizedModel)) {
        return normalizedAllowedModel.startsWith(`${normalizedModel}-`);
      }
      const concreteModel = stripNativeClaudeModelPrefix(normalizedModel);
      return concreteModel === normalizedAllowedModel ||
        concreteModel.startsWith(`${normalizedAllowedModel}-`);
    }
    return false;
  });
}

function createClaudeCodeModelCompiler(
  config: Pick<AppConfig, "Providers" | "profile" | "virtualModelProfiles">
): ClaudeCodeModelCompiler {
  const routes = buildClaudeAppGatewayModelRoutes(
    config,
    claudeAppGatewayModelRouteOptions(config)
  );
  const registry = modelRegistryForConfig(config);

  return (rawValue, source) => {
    const value = validateModelValue(rawValue, source);
    const oneMillionContext = hasClaudeAppGatewayOneMillionContextSuffix(value);
    const baseValue = stripClaudeAppGatewayOneMillionContextSuffix(value);
    const directRoute = findDirectGatewayRoute(routes, baseValue, oneMillionContext);

    if (directRoute) {
      return routeClientModelId(directRoute, oneMillionContext, value);
    }
    if (encodedGatewayRoutePattern.test(baseValue)) {
      throw unknownModelError(value, source);
    }
    if (isNativeClaudeModel(baseValue)) {
      const nativeModel = nativeClaudeAliasPattern.test(baseValue) ||
        nativeClaudeVersionPrefixPattern.test(baseValue)
        ? baseValue.toLowerCase()
        : baseValue;
      return `${nativeModel}${oneMillionContext ? "[1m]" : ""}`;
    }

    const resolved = registry.resolve(baseValue);
    if (!resolved) {
      if (configuredProviderModelCount(config, baseValue) > 1) {
        throw new Error(
          `Claude Code ${modelSourceLabel(source)} "${value}" is ambiguous. Use a Provider/model selector.`
        );
      }
      throw unknownModelError(value, source);
    }
    const route = findTargetGatewayRoute(routes, resolved.canonicalSelector, oneMillionContext);
    if (!route) {
      throw unknownModelError(value, source);
    }
    return routeClientModelId(route, oneMillionContext, value);
  };
}

function validateModelValue(
  rawValue: string,
  source: "allowedModels" | "profile"
): string {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) {
    throw new Error(`Claude Code ${modelSourceLabel(source)} must be a non-empty string.`);
  }
  if (Buffer.byteLength(value, "utf8") > maxAllowedModelBytes) {
    throw new Error(
      `Claude Code ${modelSourceLabel(source)} must not exceed ${maxAllowedModelBytes} UTF-8 bytes.`
    );
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`Claude Code ${modelSourceLabel(source)} must not contain control characters.`);
  }
  return value;
}

function findDirectGatewayRoute(
  routes: readonly ClaudeAppGatewayModelRoute[],
  value: string,
  oneMillionContext: boolean
): ClaudeAppGatewayModelRoute | undefined {
  const normalized = value.toLowerCase();
  const matches = routes.filter((route) => [route.id, route.legacyId, ...(route.legacyIds ?? [])]
    .some((id) => id?.toLowerCase() === normalized));
  return preferredGatewayRoute(matches, oneMillionContext);
}

function findTargetGatewayRoute(
  routes: readonly ClaudeAppGatewayModelRoute[],
  targetModel: string,
  oneMillionContext: boolean
): ClaudeAppGatewayModelRoute | undefined {
  const normalized = targetModel.toLowerCase();
  return preferredGatewayRoute(
    routes.filter((route) => route.targetModel.toLowerCase() === normalized),
    oneMillionContext
  );
}

function preferredGatewayRoute(
  routes: readonly ClaudeAppGatewayModelRoute[],
  oneMillionContext: boolean
): ClaudeAppGatewayModelRoute | undefined {
  if (oneMillionContext) {
    return routes.find((route) => route.oneMillionContext) ?? routes[0];
  }
  return routes.find((route) => !route.oneMillionContext) ?? routes[0];
}

function routeClientModelId(
  route: ClaudeAppGatewayModelRoute,
  oneMillionContext: boolean,
  sourceValue: string
): string {
  if (oneMillionContext && !route.oneMillionContext) {
    throw new Error(`Claude Code allowed model "${sourceValue}" does not support 1M context.`);
  }
  return oneMillionContext ? `${route.id}[1m]` : route.id;
}

function isNativeClaudeModel(value: string): boolean {
  return nativeClaudeAliasPattern.test(value) ||
    nativeClaudeVersionPrefixPattern.test(value) ||
    nativeClaudeModelPattern.test(value);
}

function stripNativeClaudeModelPrefix(value: string): string {
  const withoutProvider = value.startsWith("anthropic/")
    ? value.slice("anthropic/".length)
    : value;
  return withoutProvider.startsWith("claude-")
    ? withoutProvider.slice("claude-".length)
    : withoutProvider;
}

function nativeClaudeModelFamily(value: string): string | undefined {
  const normalized = value.toLowerCase();
  if (nativeClaudeAliasPattern.test(normalized)) {
    return normalized;
  }
  return normalized.match(/(?:^|[-/])(fable|haiku|opus|sonnet)(?:-|$)/)?.[1];
}

function configuredProviderModelCount(
  config: Pick<AppConfig, "Providers">,
  value: string
): number {
  if (value.includes("/")) {
    return 0;
  }
  const normalized = value.toLowerCase();
  return config.Providers.reduce(
    (count, provider) => count + provider.models.filter((model) => model.trim().toLowerCase() === normalized).length,
    0
  );
}

function modelSourceLabel(source: "allowedModels" | "profile"): string {
  return source === "allowedModels" ? "allowedModels entry" : "profile model selector";
}

function unknownModelError(
  value: string,
  source: "allowedModels" | "profile"
): Error {
  return new Error(
    `Claude Code ${modelSourceLabel(source)} "${value}" is not configured and is not a native Claude model.`
  );
}
