import {
  ROUTER_FALLBACK_MAX_RETRY_COUNT,
  type RouterFallbackConfig
} from "@ccr/core/contracts/app";
import type { CompiledRouterRule } from "@ccr/core/routing/config-compiler";
import type { RouteDiagnostic, RouteModelRef } from "@ccr/core/routing/contracts";
import type { ModelRegistry } from "@ccr/core/routing/model-registry";
import {
  compileScriptRouteRewrite,
  effectiveBodyModelRewriteValue,
  effectiveTargetProviderName,
  isBodyModelCompiledRewrite,
  type CompiledRouteRewrite
} from "@ccr/core/routing/rewrite";

const maxScriptRewrites = 32;
const maxScriptResultBytes = 64 * 1024;

export type NormalizedRouteScriptResult = {
  diagnostics: RouteDiagnostic[];
  fallback?: RouterFallbackConfig;
  matched: boolean;
  model?: RouteModelRef;
  rewrites: CompiledRouteRewrite[];
};

export function normalizeRouteScriptResult(input: {
  compiledRule: CompiledRouterRule;
  defaultFallback: RouterFallbackConfig;
  modelRegistry: ModelRegistry;
  value: unknown;
}): NormalizedRouteScriptResult {
  const { compiledRule, defaultFallback, modelRegistry, value } = input;
  const rule = compiledRule.rule;
  if (value === undefined || value === null || value === false) {
    return { diagnostics: [], matched: false, rewrites: [] };
  }
  if (value !== true && !isRecord(value)) {
    return invalid(rule.id, "Script result must be null, false, true, or an object.");
  }
  if (isRecord(value) && value.match === false) {
    return { diagnostics: [], matched: false, rewrites: [] };
  }
  const resultBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (resultBytes > maxScriptResultBytes) {
    return invalid(rule.id, `Script result is ${resultBytes} bytes; the limit is ${maxScriptResultBytes} bytes.`);
  }

  const result = isRecord(value) ? value : {};
  const rawRewrites = result.rewrites;
  if (rawRewrites !== undefined && (!Array.isArray(rawRewrites) || rawRewrites.length > maxScriptRewrites)) {
    return invalid(rule.id, `Script result rewrites must be an array with at most ${maxScriptRewrites} entries.`);
  }
  const dynamicResults = Array.isArray(rawRewrites) ? rawRewrites.map(compileScriptRouteRewrite) : [];
  const rewriteError = dynamicResults.find((entry) => entry.error)?.error;
  if (rewriteError) return invalid(rule.id, rewriteError);
  const rewrites = [
    ...compiledRule.rewrites,
    ...dynamicResults.flatMap((entry) => entry.rewrite ? [entry.rewrite] : [])
  ];

  const providerName = effectiveTargetProviderName(rewrites);
  const dynamicModel = typeof result.model === "string" ? result.model.trim() : undefined;
  if (result.model !== undefined && !dynamicModel) return invalid(rule.id, "Script result model must be a non-empty string.");
  const rewrittenModel = effectiveBodyModelRewriteValue(rewrites);
  const hasModelRewrite = rewrites.some(isBodyModelCompiledRewrite);
  const selectedModel = dynamicModel ?? rewrittenModel;
  const model = selectedModel
    ? modelRegistry.resolve(selectedModel, { providerName })
    : hasModelRewrite
      ? undefined
      : compiledRule.model;
  if (selectedModel && !model) {
    return {
      diagnostics: [{
        code: "script-model-not-configured",
        message: `Router script returned unconfigured model "${selectedModel}".`,
        model: selectedModel,
        ruleId: rule.id,
        source: "rule"
      }],
      matched: false,
      rewrites: []
    };
  }
  const targetProvider = providerName ? modelRegistry.findProvider(providerName) : undefined;
  if (targetProvider && model?.kind === "provider" && model.provider !== targetProvider) {
    return invalid(rule.id, `Script model "${model.selector}" conflicts with target provider "${providerName}".`);
  }

  const fallbackResult = normalizeScriptFallback(result.fallback, rule.fallback ?? defaultFallback, modelRegistry);
  if (fallbackResult.error) return invalid(rule.id, fallbackResult.error);
  return {
    diagnostics: [],
    fallback: fallbackResult.fallback,
    matched: true,
    model,
    rewrites
  };
}

export function scriptResultPreview(value: unknown): unknown {
  if (value === undefined) return null;
  return value;
}

function normalizeScriptFallback(
  value: unknown,
  defaultValue: RouterFallbackConfig,
  modelRegistry: ModelRegistry
): { error?: string; fallback?: RouterFallbackConfig } {
  if (value === undefined) return { fallback: defaultValue };
  if (!isRecord(value)) return { error: "Script fallback must be an object." };
  const mode = value.mode;
  if (mode !== "off" && mode !== "retry" && mode !== "model-chain") {
    return { error: "Script fallback mode must be off, retry, or model-chain." };
  }
  const retryCount = value.retryCount ?? 0;
  if (!Number.isInteger(retryCount) || (retryCount as number) < 0 || (retryCount as number) > ROUTER_FALLBACK_MAX_RETRY_COUNT) {
    return { error: `Script fallback retryCount must be between 0 and ${ROUTER_FALLBACK_MAX_RETRY_COUNT}.` };
  }
  const models = value.models ?? [];
  if (!Array.isArray(models) || models.some((model) => typeof model !== "string" || !model.trim())) {
    return { error: "Script fallback models must be an array of non-empty strings." };
  }
  const normalizedModels = models.map((model) => (model as string).trim());
  const missing = normalizedModels.find((model) => !modelRegistry.isConfigured(model));
  if (missing) return { error: `Script fallback references unconfigured model "${missing}".` };
  return {
    fallback: {
      mode,
      models: normalizedModels,
      retryCount: retryCount as number
    }
  };
}

function invalid(ruleId: string, message: string): NormalizedRouteScriptResult {
  return {
    diagnostics: [{
      code: "script-invalid-result",
      message,
      ruleId,
      source: "rule"
    }],
    matched: false,
    rewrites: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
