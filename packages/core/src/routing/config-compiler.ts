import type {
  AppConfig,
  RouterFallbackConfig,
  RouterRule,
  RouterRuleRewrite
} from "@ccr/core/contracts/app";
import type { RouteDiagnostic, RouteModelRef } from "@ccr/core/routing/contracts";
import { ModelRegistry } from "@ccr/core/routing/model-registry";

export type CompiledRouterRule = {
  active: boolean;
  diagnostics: RouteDiagnostic[];
  model?: RouteModelRef;
  rewrites: RouterRuleRewrite[];
  rule: RouterRule;
};

export type CompiledRouterConfig = {
  diagnostics: RouteDiagnostic[];
  fallback: RouterFallbackConfig;
  modelRegistry: ModelRegistry;
  rules: CompiledRouterRule[];
};

export function compileRouterConfig(config: AppConfig): CompiledRouterConfig {
  const modelRegistry = new ModelRegistry(config);
  const rules = (config.Router.rules ?? []).map((rule) => compileRouterRule(rule, modelRegistry));
  const fallbackDiagnostics = fallbackModelDiagnostics(config.Router.fallback, modelRegistry, "default");
  const profileDiagnostics = configuredProfileDiagnostics(config, modelRegistry);
  const validFallbackModels = config.Router.fallback.models.filter((model) => modelRegistry.isConfigured(model));
  return {
    diagnostics: [...rules.flatMap((rule) => rule.diagnostics), ...fallbackDiagnostics, ...profileDiagnostics],
    fallback: fallbackDiagnostics.length === 0
      ? config.Router.fallback
      : { ...config.Router.fallback, models: validFallbackModels },
    modelRegistry,
    rules
  };
}

function configuredProfileDiagnostics(config: AppConfig, modelRegistry: ModelRegistry): RouteDiagnostic[] {
  if (config.profile?.enabled === false) {
    return [];
  }
  return (config.profile?.profiles ?? [])
    .filter((profile) => profile.enabled && profile.model && !modelRegistry.isConfigured(profile.model))
    .map((profile) => ({
      code: "profile-model-not-configured" as const,
      message: `Agent profile "${profile.name}" references unconfigured model "${profile.model}".`,
      model: profile.model,
      source: "builtin" as const
    }));
}

function compileRouterRule(rule: RouterRule, modelRegistry: ModelRegistry): CompiledRouterRule {
  const rewrites = routerRuleRewrites(rule);
  if (!rule.enabled) {
    return {
      active: false,
      diagnostics: [],
      rewrites,
      rule
    };
  }
  const diagnostics: RouteDiagnostic[] = [];
  const providerName = effectiveTargetProviderName(rewrites);
  const targetProvider = providerName ? modelRegistry.findProvider(providerName) : undefined;
  let model: RouteModelRef | undefined;
  const modelRewriteValue = effectiveBodyModelRewriteValue(rewrites);
  if (modelRewriteValue !== undefined) {
    const resolved = modelRegistry.resolve(modelRewriteValue, { providerName });
    if (!resolved) {
      diagnostics.push({
        code: "rule-model-not-configured",
        message: `Router rule "${rule.name}" references unconfigured model "${modelRewriteValue}".`,
        model: modelRewriteValue,
        ruleId: rule.id,
        source: "rule"
      });
    } else {
      model = resolved;
      if (targetProvider && resolved.kind === "provider" && resolved.provider !== targetProvider) {
        diagnostics.push({
          code: "rule-provider-model-conflict",
          message: `Router rule "${rule.name}" targets provider "${providerName}" but model "${modelRewriteValue}" belongs to "${resolved.provider.name}".`,
          model: modelRewriteValue,
          ruleId: rule.id,
          source: "rule"
        });
      }
    }
  }
  diagnostics.push(...fallbackModelDiagnostics(rule.fallback, modelRegistry, "rule", rule));
  return {
    active: rewrites.length > 0 && diagnostics.length === 0,
    diagnostics,
    model,
    rewrites,
    rule
  };
}

function fallbackModelDiagnostics(
  fallback: RouterFallbackConfig | undefined,
  modelRegistry: ModelRegistry,
  source: "default" | "rule",
  rule?: RouterRule
): RouteDiagnostic[] {
  if (fallback?.mode !== "model-chain") {
    return [];
  }
  return fallback.models
    .filter((model) => !modelRegistry.isConfigured(model))
    .map((model) => ({
      code: "fallback-model-not-configured" as const,
      message: rule
        ? `Router rule "${rule.name}" references unconfigured fallback model "${model}".`
        : `Router fallback references unconfigured model "${model}".`,
      model,
      ...(rule ? { ruleId: rule.id } : {}),
      source
    }));
}

function routerRuleRewrites(rule: RouterRule): RouterRuleRewrite[] {
  if (rule.rewrites?.length) {
    return rule.rewrites;
  }
  if (rule.rewrite) {
    return [rule.rewrite];
  }
  return rule.target
    ? [{ key: "request.body.model", operation: "set", value: rule.target }]
    : [];
}

function effectiveBodyModelRewriteValue(rewrites: RouterRuleRewrite[]): string | undefined {
  let value: string | undefined;
  for (const rewrite of rewrites) {
    const path = rewritePath(rewrite.key);
    if (path.scope !== "body" || path.name !== "model") {
      continue;
    }
    const operation = rewrite.operation ?? "set";
    if (operation === "delete") {
      value = undefined;
    } else if (operation === "set") {
      value = rewrite.value;
    }
  }
  return value;
}

function effectiveTargetProviderName(rewrites: RouterRuleRewrite[]): string | undefined {
  const headers: Record<string, string> = {};
  for (const rewrite of rewrites) {
    const path = rewritePath(rewrite.key);
    if (path.scope !== "header" || !isTargetProviderHeader(path.name)) {
      continue;
    }
    if ((rewrite.operation ?? "set") === "delete") {
      delete headers[path.name];
    } else if (rewrite.value !== undefined) {
      headers[path.name] = rewrite.value;
    }
  }
  const provider = headers["x-target-provider"] || headers["x-gateway-target-provider"];
  if (provider?.trim()) {
    return provider.trim();
  }
  return headers["x-target-providers"]
    ?.split(",")
    .map((item) => item.trim())
    .find(Boolean);
}

function isTargetProviderHeader(name: string): boolean {
  return name === "x-target-provider" ||
    name === "x-gateway-target-provider" ||
    name === "x-target-providers";
}

function rewritePath(key: string): { name: string; scope?: "body" | "header" } {
  const parts = key
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  const [scope, section, ...rest] = parts;
  if (scope !== "request") {
    return { name: "" };
  }
  if (section === "header" || section === "headers") {
    return { name: rest.join(".").trim().toLowerCase(), scope: "header" };
  }
  if (section === "body") {
    return { name: rest.join("."), scope: "body" };
  }
  return { name: "" };
}
