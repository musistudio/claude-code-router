import type {
  AppConfig,
  ProfileConfig,
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
  source: "profile" | "rule";
};

export type CompiledProfileRoutingConfig = {
  active: boolean;
  diagnostics: RouteDiagnostic[];
  profile: ProfileConfig;
  rules: CompiledRouterRule[];
};

export type CompiledRouterConfig = {
  diagnostics: RouteDiagnostic[];
  fallback: RouterFallbackConfig;
  modelRegistry: ModelRegistry;
  profileRoutings: CompiledProfileRoutingConfig[];
  rules: CompiledRouterRule[];
};

export type CompileRouterConfigOptions = {
  scriptValidationErrors?: ReadonlyMap<string, string>;
};

export function compileRouterConfig(config: AppConfig, options: CompileRouterConfigOptions = {}): CompiledRouterConfig {
  const modelRegistry = new ModelRegistry(config);
  const rules = (config.Router.rules ?? []).map((rule) => compileRouterRule(rule, modelRegistry, options, {
    label: `Router rule "${rule.name}"`,
    source: "rule"
  }));
  const profileRoutings = compileProfileRoutings(config, modelRegistry, options);
  const fallbackDiagnostics = fallbackModelDiagnostics(config.Router.fallback, modelRegistry, "default");
  const profileDiagnostics = configuredProfileDiagnostics(config, modelRegistry);
  const validFallbackModels = config.Router.fallback.models.filter((model) => modelRegistry.isConfigured(model));
  return {
    diagnostics: [
      ...rules.flatMap((rule) => rule.diagnostics),
      ...profileRoutings.flatMap((profileRouting) => profileRouting.diagnostics),
      ...fallbackDiagnostics,
      ...profileDiagnostics
    ],
    fallback: fallbackDiagnostics.length === 0
      ? config.Router.fallback
      : { ...config.Router.fallback, models: validFallbackModels },
    modelRegistry,
    profileRoutings,
    rules
  };
}

function compileProfileRoutings(
  config: AppConfig,
  modelRegistry: ModelRegistry,
  options: CompileRouterConfigOptions
): CompiledProfileRoutingConfig[] {
  if (config.profile?.enabled === false) {
    return [];
  }
  return (config.profile?.profiles ?? [])
    .filter((profile) => profile.enabled && profile.routing)
    .map((profile) => {
      const routing = profile.routing;
      if (routing?.enabled === false) {
        return {
          active: false,
          diagnostics: [],
          profile,
          rules: []
        };
      }
      const rules = (routing?.rules ?? []).map((rule) => compileRouterRule(rule, modelRegistry, options, {
        allowScript: false,
        label: `Profile "${profile.name}" route "${rule.name}"`,
        source: "profile"
      }));
      return {
        active: true,
        diagnostics: rules.flatMap((rule) => rule.diagnostics),
        profile,
        rules
      };
    });
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
  options: CompileRouterConfigOptions,
  diagnostic: { allowScript?: boolean; label: string; source: "profile" | "rule" }
): CompiledRouterRule {
  const rewriteResults = routerRuleRewrites(rule).map(compileConfiguredRouteRewrite);
  const rewrites = rewriteResults.flatMap((result) => result.rewrite ? [result.rewrite] : []);
  if (!rule.enabled) {
    return {
      active: false,
      diagnostics: [],
      rewrites,
      rule,
      source: diagnostic.source
    };
  }
  const diagnostics: RouteDiagnostic[] = rewriteResults.flatMap((result) => result.error ? [{
    code: "rule-rewrite-invalid" as const,
    message: `${diagnostic.label} has an invalid rewrite: ${result.error}`,
    ruleId: rule.id,
    source: diagnostic.source
  }] : []);
  diagnostics.push(...scriptRuleDiagnostics(rule, options, diagnostic));
  const providerName = effectiveTargetProviderName(rewrites);
  const targetProvider = providerName ? modelRegistry.findProvider(providerName) : undefined;
  let model: RouteModelRef | undefined;
  const modelRewriteValue = effectiveBodyModelRewriteValue(rewrites);
  if (modelRewriteValue !== undefined) {
    const resolved = modelRegistry.resolve(modelRewriteValue, { providerName });
    if (!resolved) {
      diagnostics.push({
        code: "rule-model-not-configured",
        message: `${diagnostic.label} references unconfigured model "${modelRewriteValue}".`,
        model: modelRewriteValue,
        ruleId: rule.id,
        source: diagnostic.source
      });
    } else {
      model = resolved;
      if (targetProvider && resolved.kind === "provider" && resolved.provider !== targetProvider) {
        diagnostics.push({
          code: "rule-provider-model-conflict",
          message: `${diagnostic.label} targets provider "${providerName}" but model "${modelRewriteValue}" belongs to "${resolved.provider.name}".`,
          model: modelRewriteValue,
          ruleId: rule.id,
          source: diagnostic.source
        });
      }
    }
  }
  diagnostics.push(...fallbackModelDiagnostics(rule.fallback, modelRegistry, diagnostic.source, rule));
  return {
    active: (rule.type === "script" ? Boolean(rule.script) : rewrites.length > 0) && diagnostics.length === 0,
    diagnostics,
    model,
    rewrites,
    rule,
    source: diagnostic.source
  };
}

function scriptRuleDiagnostics(
  rule: RouterRule,
  options: CompileRouterConfigOptions,
  diagnostic: { allowScript?: boolean; label: string; source: "profile" | "rule" }
): RouteDiagnostic[] {
  if (rule.type !== "script") return [];
  if (diagnostic.allowScript === false) {
    return [{
      code: "script-api-unsupported",
      message: `${diagnostic.label} does not support Node.js script rules.`,
      ruleId: rule.id,
      source: diagnostic.source
    }];
  }
  if (!rule.script) {
    return [{
      code: "script-source-invalid",
      message: `${diagnostic.label} does not contain a script.`,
      ruleId: rule.id,
      source: diagnostic.source
    }];
  }
  if (rule.script.apiVersion !== 1 || rule.script.language !== "javascript") {
    return [{
      code: "script-api-unsupported",
      message: `${diagnostic.label} uses an unsupported script API or language.`,
      ruleId: rule.id,
      source: diagnostic.source
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
      message: `${diagnostic.label} requires a local JavaScript file.`,
      ruleId: rule.id,
      source: diagnostic.source
    }];
  }
  if (file && !/\.(?:cjs|js|mjs)$/i.test(file)) {
    return [{
      code: "script-source-invalid",
      message: `${diagnostic.label} script file must use a .js, .mjs, or .cjs extension.`,
      ruleId: rule.id,
      source: diagnostic.source
    }];
  }
  if (!Number.isInteger(rule.script.timeoutMs) || rule.script.timeoutMs < 10 || rule.script.timeoutMs > ROUTER_SCRIPT_MAX_TIMEOUT_MS) {
    return [{
      code: "script-source-invalid",
      message: `${diagnostic.label} script timeout must be between 10 and ${ROUTER_SCRIPT_MAX_TIMEOUT_MS} ms.`,
      ruleId: rule.id,
      source: diagnostic.source
    }];
  }
  const externalError = options.scriptValidationErrors?.get(rule.id);
  return externalError ? [{
    code: "script-source-invalid",
    message: `${diagnostic.label} script failed validation: ${externalError}`,
    ruleId: rule.id,
    source: diagnostic.source
  }] : [];
}

function fallbackModelDiagnostics(
  fallback: RouterFallbackConfig | undefined,
  modelRegistry: ModelRegistry,
  source: "default" | "profile" | "rule",
  rule?: RouterRule,
  profile?: ProfileConfig
): RouteDiagnostic[] {
  if (fallback?.mode !== "model-chain") {
    return [];
  }
  return fallback.models
    .filter((model) => !modelRegistry.isConfigured(model))
    .map((model) => ({
      code: "fallback-model-not-configured" as const,
      message: rule && profile
        ? `Profile "${profile.name}" route "${rule.name}" references unconfigured fallback model "${model}".`
        : rule
        ? `Router rule "${rule.name}" references unconfigured fallback model "${model}".`
        : profile
          ? `Profile "${profile.name}" fallback references unconfigured model "${model}".`
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
