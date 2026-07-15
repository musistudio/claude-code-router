import {
  ROUTER_FALLBACK_MAX_RETRY_COUNT,
  type RouterFallbackConfig
} from "@ccr/core/contracts/app";
import type { RouteExecutionPlan } from "@ccr/core/routing/contracts";
import { type ModelRegistry, normalizeRouteSelector } from "@ccr/core/routing/model-registry";

export function createRouteExecutionPlan(input: {
  bodyModel?: string;
  fallback: RouterFallbackConfig;
  hasRequestBody: boolean;
  modelRegistry?: ModelRegistry;
  primaryModel?: string;
}): RouteExecutionPlan {
  const primaryModel = normalizeRouteSelector(input.bodyModel) ?? normalizeRouteSelector(input.primaryModel);
  if (input.fallback.mode === "off" || !input.hasRequestBody) {
    return {
      attempts: [routeAttempt(0, primaryModel, input.modelRegistry)],
      fallback: input.fallback,
      primaryModel
    };
  }

  if (input.fallback.mode === "retry") {
    const retryCount = clamp(input.fallback.retryCount, 0, ROUTER_FALLBACK_MAX_RETRY_COUNT);
    return {
      attempts: Array.from(
        { length: retryCount + 1 },
        (_unused, index) => routeAttempt(index, primaryModel, input.modelRegistry)
      ),
      fallback: input.fallback,
      primaryModel
    };
  }

  const models = uniqueStrings([
    primaryModel,
    ...input.fallback.models.map((model) => normalizeRouteSelector(model))
  ]);
  return {
    attempts: (models.length ? models : [undefined])
      .map((model, index) => routeAttempt(index, model, input.modelRegistry)),
    fallback: input.fallback,
    primaryModel
  };
}

function routeAttempt(index: number, model: string | undefined, modelRegistry: ModelRegistry | undefined) {
  const target = modelRegistry?.resolve(model);
  return {
    index,
    model,
    ...(target ? { target } : {})
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(Number.isFinite(value) ? value : min)));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}
