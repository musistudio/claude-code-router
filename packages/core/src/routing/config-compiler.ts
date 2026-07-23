import type {
  AppConfig,
  RouterFallbackConfig,
  RouterRule,
  RouterRuleRewrite
} from "@ccr/core/contracts/app";
import { ROUTER_SCRIPT_MAX_SOURCE_BYTES, ROUTER_SCRIPT_MAX_TIMEOUT_MS } from "@ccr/core/contracts/app";
import type { RouteDiagnostic, RouteModelRef } from "@ccr/core/routing/contracts";
import { ModelRegistry } from "@ccr/core/routing/model-registry";
import {
  compileConfiguredRouteRewrite,
  effectiveBodyModelRewriteValue,
  effectiveTargetProviderName,
  type CompiledRouteRewrite
} from "@ccr/core/routing/rewrite";

export type CompiledRouterRule = {
  active: boolean;
  diagnostics: RouteDiagnostic[];
  model?: RouteModelRef;
  rewrites: CompiledRouteRewrite[];
  rule: RouterRule;
};

export type CompiledRouterConfig = {
  diagnostics: RouteDiagnostic[];
  fallback: RouterFallbackConfig;
  modelRegistry: ModelRegistry;
  rules: CompiledRouterRule[];
};

export type CompileRouterConfigOptions = {
  scriptValidationErrors?: ReadonlyMap<string, string>;
};

export function compileRouterConfig(config: AppConfig, options: CompileRouterConfigOptions = {}): CompiledRouterConfig {
  const modelRegistry = new ModelRegistry(config);
  const rules = (config.Router.rules ?? []).map((rule) => compileRouterRule(rule, modelRegistry, options));
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

function compileRouterRule(
  rule: RouterRule,
  modelRegistry: ModelRegistry,
  options: CompileRouterConfigOptions
): CompiledRouterRule {
  const rewriteResults = routerRuleRewrites(rule).map(compileConfiguredRouteRewrite);
  const rewrites = rewriteResults.flatMap((result) => result.rewrite ? [result.rewrite] : []);
  if (!rule.enabled) {
    return {
      active: false,
      diagnostics: [],
      rewrites,
      rule
    };
  }
  const diagnostics: RouteDiagnostic[] = rewriteResults.flatMap((result) => result.error ? [{
    code: "rule-rewrite-invalid" as const,
    message: `Router rule "${rule.name}" has an invalid rewrite: ${result.error}`,
    ruleId: rule.id,
    source: "rule" as const
  }] : []);
  diagnostics.push(...scriptRuleDiagnostics(rule, options));
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
    active: (rule.type === "script" ? Boolean(rule.script) : rewrites.length > 0) && diagnostics.length === 0,
    diagnostics,
    model,
    rewrites,
    rule
  };
}

function scriptRuleDiagnostics(rule: RouterRule, options: CompileRouterConfigOptions): RouteDiagnostic[] {
  if (rule.type !== "script") return [];
  if (!rule.script) {
    return [{
      code: "script-source-invalid",
      message: `Router rule "${rule.name}" does not contain a script.`,
      ruleId: rule.id,
      source: "rule"
    }];
  }
  if (rule.script.apiVersion !== 1 || rule.script.language !== "javascript") {
    return [{
      code: "script-api-unsupported",
      message: `Router rule "${rule.name}" uses an unsupported script API or language.`,
      ruleId: rule.id,
      source: "rule"
    }];
  }
  const file = rule.script.file?.trim();
  const legacySource = rule.script.source;
  const sourceInvalid = !file && (
    legacySource === undefined ||
    !legacySource.trim() ||
    Buffer.byteLength(legacySource, "utf8") > ROUTER_SCRIPT_MAX_SOURCE_BYTES
  );
  if (sourceInvalid) {
    return [{
      code: "script-source-invalid",
      message: `Router rule "${rule.name}" requires a local JavaScript file.`,
      ruleId: rule.id,
      source: "rule"
    }];
  }
  if (file && !/\.(?:cjs|js|mjs)$/i.test(file)) {
    return [{
      code: "script-source-invalid",
      message: `Router rule "${rule.name}" script file must use a .js, .mjs, or .cjs extension.`,
      ruleId: rule.id,
      source: "rule"
    }];
  }
  if (!Number.isInteger(rule.script.timeoutMs) || rule.script.timeoutMs < 10 || rule.script.timeoutMs > ROUTER_SCRIPT_MAX_TIMEOUT_MS) {
    return [{
      code: "script-source-invalid",
      message: `Router rule "${rule.name}" script timeout must be between 10 and ${ROUTER_SCRIPT_MAX_TIMEOUT_MS} ms.`,
      ruleId: rule.id,
      source: "rule"
    }];
  }
  const externalError = options.scriptValidationErrors?.get(rule.id);
  return externalError ? [{
    code: "script-source-invalid",
    message: `Router rule "${rule.name}" script failed validation: ${externalError}`,
    ruleId: rule.id,
    source: "rule"
  }] : [];
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
