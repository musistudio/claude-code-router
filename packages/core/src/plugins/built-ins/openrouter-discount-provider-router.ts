import type { AppConfig, GatewayProviderConfig, ProviderModelOpenRouterDiscountRoutingConfig } from "@ccr/core/contracts/app";
import type {
  GatewayPluginRequestTransformHandler,
  GatewayPluginRequestTransformInput,
  GatewayPluginRequestTransformResult
} from "@ccr/core/plugins/service";

const DEFAULT_SETTINGS = {
  allowFallbacks: true,
  cacheHitRate: 0.75,
  endpointTtlMs: 10 * 60_000,
  minOutputTokens: 256,
  minSavingsRatio: 0.05,
  minSavingsUsd: 0.00005,
  minUptime5m: 98,
  outputTokenRatio: 0.35,
  providerBlacklist: [] as string[],
  requireParameters: true,
  respectExistingProviderOrder: false
};

const endpointCacheMaxEntries = 500;
const endpointFailureCooldownMs = 60_000;
const endpointFetchTimeoutMs = 5_000;
const openRouterDiscountModelHeader = "x-ccr-openrouter-discount-model";
const openRouterDiscountProviderHeader = "x-ccr-openrouter-discount-provider-id";

type OpenRouterDiscountRoutingSettings = typeof DEFAULT_SETTINGS;

type OpenRouterDiscountRoutingTarget = {
  model: string;
  provider: GatewayProviderConfig;
  settings: OpenRouterDiscountRoutingSettings;
};

type NormalizedEndpoint = {
  cacheReadPrice: number;
  cacheWritePrice: number;
  cacheWriteTokens: number;
  completionPrice: number;
  dataCollection?: string;
  distillable?: boolean;
  imageCount: number;
  imagePrice?: number;
  maxCompletionTokens?: number;
  maxPromptTokens?: number;
  providerName: string;
  promptPrice: number;
  quantization?: string;
  requestPrice: number;
  searchCount: number;
  searchPrice?: number;
  status?: number;
  supportedParameters: string[];
  supportsImplicitCaching: boolean;
  supportsZdr?: boolean;
  tag: string;
  uncachedCostUsd: number;
  uptimeLast5m?: number;
};

type EndpointCacheEntry = {
  endpoints: unknown[];
  fetchedAt: number;
};

type EndpointFailureEntry = {
  failedAt: number;
  message: string;
};

type PendingSelection = {
  allowFallbacks: boolean;
  model: string;
  providerTag: string;
  sessionKey: string;
  updatedAt: number;
};

const endpointCache = new Map<string, EndpointCacheEntry>();
const endpointFailureCache = new Map<string, EndpointFailureEntry>();
const endpointInflight = new Map<string, Promise<unknown[]>>();
const sessionSelections = new Map<string, { providerTag: string; updatedAt: number }>();
const pendingSelections = new Map<string, PendingSelection>();

export const openRouterDiscountProviderRouterTransform: GatewayPluginRequestTransformHandler = async (
  input,
  context
) => {
  const body = cloneRecord(input.body);
  if (!body) {
    return undefined;
  }
  const target = resolveOpenRouterDiscountRoutingTarget(input, context.config);
  if (!target) {
    return undefined;
  }

  try {
    return await routeOpenRouterRequestByEndpointDiscount(input, body, target);
  } catch (error) {
    context.logger.warn(`OpenRouter discount routing skipped: ${formatError(error)}`);
    return undefined;
  }
};

async function routeOpenRouterRequestByEndpointDiscount(
  input: GatewayPluginRequestTransformInput,
  body: Record<string, unknown>,
  target: OpenRouterDiscountRoutingTarget
): Promise<GatewayPluginRequestTransformResult | undefined> {
  const existingProvider = isRecord(body.provider) ? body.provider : {};
  const existingOrder = readStringArray(existingProvider.order);
  const providerIgnore = mergeStringLists(readStringArray(existingProvider.ignore), target.settings.providerBlacklist);
  if (target.settings.respectExistingProviderOrder && existingOrder.length > 0) {
    return undefined;
  }

  const endpoints = await loadModelEndpoints(target.provider, target.model, target.settings);
  const promptTokens = Math.max(positiveNumber(input.tokenCount) ?? 0, estimatePromptTokens(body));
  const completionTokens = estimateCompletionTokens(body, promptTokens, target.settings);
  const requestCost = estimateRequestCostShape(body, promptTokens);
  const pricedEndpoints = endpoints
    .map((endpoint) => normalizeEndpoint(endpoint, {
      ...requestCost,
      completionTokens,
      promptTokens
    }))
    .filter((endpoint): endpoint is NormalizedEndpoint => Boolean(endpoint))
    .filter((endpoint) => endpoint.status === 0 || endpoint.status === undefined || endpoint.status === null)
    .filter((endpoint) => endpoint.uptimeLast5m === undefined || endpoint.uptimeLast5m >= target.settings.minUptime5m)
    .filter((endpoint) => endpointSatisfiesProviderConstraints(endpoint, existingProvider, body, promptTokens, completionTokens, target.settings))
    .filter((endpoint) => !endpointMatchesProviderList(endpoint, providerIgnore))
    .sort((left, right) => left.uncachedCostUsd - right.uncachedCostUsd);

  if (pricedEndpoints.length === 0) {
    if (providerIgnore.length === 0) {
      return undefined;
    }
    body.provider = {
      ...existingProvider,
      ignore: providerIgnore
    };
    return {
      body,
      headers: cleanHeaders({
        [openRouterDiscountModelHeader]: target.model,
        [openRouterDiscountProviderHeader]: providerStableKey(target.provider)
      }),
      responseHeaders: cleanHeaders({
        "x-ccr-openrouter-discount-ignored-providers": providerIgnore.join(","),
        "x-ccr-openrouter-discount-model": target.model,
        "x-ccr-openrouter-discount-reason": "no-priced-endpoints-after-provider-filters",
        "x-ccr-openrouter-discount-switched": "false"
      })
    };
  }

  const cheapest = pricedEndpoints[0];
  const sessionKey = `${providerStableKey(target.provider)}:${target.model}:${input.sessionId || input.requestId}`;
  const stored = input.sessionId ? sessionSelections.get(sessionKey) : undefined;
  const explicitBaseline = findEndpointByOrder(existingOrder[0], pricedEndpoints);
  const storedBaseline = stored ? findEndpointByOrder(stored.providerTag, pricedEndpoints) : undefined;
  const baseline = explicitBaseline || storedBaseline;
  const decision = chooseEndpoint({
    baseline,
    body,
    cheapest,
    promptTokens,
    settings: target.settings
  });

  if (input.sessionId) {
    rememberPendingSelection(input.requestId, {
      allowFallbacks: providerBoolean(existingProvider, "allow_fallbacks", "allowFallbacks") ?? target.settings.allowFallbacks,
      model: target.model,
      providerTag: decision.selected.tag,
      sessionKey
    });
  }
  body.provider = {
    ...existingProvider,
    allow_fallbacks: providerBoolean(existingProvider, "allow_fallbacks", "allowFallbacks") ?? target.settings.allowFallbacks,
    ...(providerIgnore.length > 0 ? { ignore: providerIgnore } : {}),
    order: [decision.selected.tag],
    require_parameters: providerBoolean(existingProvider, "require_parameters", "requireParameters") ?? target.settings.requireParameters
  };

  return {
    body,
    headers: cleanHeaders({
      [openRouterDiscountModelHeader]: target.model,
      [openRouterDiscountProviderHeader]: providerStableKey(target.provider)
    }),
    responseHeaders: buildResponseHeaders({
      baseline,
      cheapest,
      completionTokens,
      decision,
      cacheWriteTokens: requestCost.cacheWriteTokens,
      model: target.model,
      imageCount: requestCost.imageCount,
      providerIgnore,
      promptTokens,
      searchCount: requestCost.searchCount
    })
  };
}

function chooseEndpoint(input: {
  baseline: NormalizedEndpoint | undefined;
  body: Record<string, unknown>;
  cheapest: NormalizedEndpoint;
  promptTokens: number;
  settings: OpenRouterDiscountRoutingSettings;
}): {
  cacheLossUsd: number;
  grossSavingsUsd: number;
  netSavingsUsd: number;
  potentialNetSavingsUsd: number;
  reason: string;
  selected: NormalizedEndpoint;
  switched: boolean;
} {
  const { baseline, body, cheapest, promptTokens, settings } = input;
  if (!baseline) {
    return {
      cacheLossUsd: 0,
      grossSavingsUsd: 0,
      netSavingsUsd: 0,
      potentialNetSavingsUsd: 0,
      reason: "initial-cheapest",
      selected: cheapest,
      switched: false
    };
  }

  if (sameEndpoint(baseline, cheapest)) {
    return {
      cacheLossUsd: 0,
      grossSavingsUsd: 0,
      netSavingsUsd: 0,
      potentialNetSavingsUsd: 0,
      reason: "already-cheapest",
      selected: baseline,
      switched: false
    };
  }

  const cacheHitRate = shouldAccountForCacheLoss(baseline, body)
    ? clamp(settings.cacheHitRate, 0, 1)
    : 0;
  const cacheReadCostUsd = costWithCacheHitRate(baseline, promptTokens, cacheHitRate);
  const grossSavingsUsd = baseline.uncachedCostUsd - cheapest.uncachedCostUsd;
  const cacheLossUsd = Math.max(0, baseline.uncachedCostUsd - cacheReadCostUsd);
  const netSavingsUsd = grossSavingsUsd - cacheLossUsd;
  const savingsRatio = cacheReadCostUsd > 0 ? netSavingsUsd / cacheReadCostUsd : 0;

  if (grossSavingsUsd <= 0) {
    return {
      cacheLossUsd,
      grossSavingsUsd,
      netSavingsUsd,
      potentialNetSavingsUsd: netSavingsUsd,
      reason: "baseline-cheaper",
      selected: baseline,
      switched: false
    };
  }

  if (netSavingsUsd < settings.minSavingsUsd || savingsRatio < settings.minSavingsRatio) {
    return {
      cacheLossUsd,
      grossSavingsUsd,
      netSavingsUsd,
      potentialNetSavingsUsd: netSavingsUsd,
      reason: "cache-loss-or-threshold",
      selected: baseline,
      switched: false
    };
  }

  return {
    cacheLossUsd,
    grossSavingsUsd,
    netSavingsUsd,
    potentialNetSavingsUsd: netSavingsUsd,
    reason: "switched-cheaper-after-cache-loss",
    selected: cheapest,
    switched: true
  };
}

async function loadModelEndpoints(
  provider: GatewayProviderConfig,
  model: string,
  settings: OpenRouterDiscountRoutingSettings
): Promise<unknown[]> {
  const apiRoot = openRouterApiRoot(provider);
  const cacheKey = `${apiRoot}:${model}`;
  const cached = endpointCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < settings.endpointTtlMs) {
    return cached.endpoints;
  }
  const failure = endpointFailureCache.get(cacheKey);
  if (failure) {
    const cooldownAge = now - failure.failedAt;
    if (cooldownAge < endpointFailureCooldownMs) {
      const remainingMs = endpointFailureCooldownMs - cooldownAge;
      throw new Error(`OpenRouter endpoints request is cooling down after failure (${Math.ceil(remainingMs / 1000)}s left): ${failure.message}`);
    }
    endpointFailureCache.delete(cacheKey);
  }
  const inflight = endpointInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const [author, ...slugParts] = model.split("/");
  const slug = slugParts.join("/");
  if (!author || !slug) {
    throw new Error(`OpenRouter model id must be author/slug: ${model}`);
  }

  const url = `${trimRight(apiRoot, "/")}/api/v1/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`;
  const promise = fetchModelEndpoints(url).then((endpoints) => {
    endpointFailureCache.delete(cacheKey);
    if (endpoints.length > 0) {
      endpointCache.set(cacheKey, { endpoints, fetchedAt: Date.now() });
      pruneEndpointCache();
    }
    return endpoints;
  }).catch((error) => {
    endpointFailureCache.set(cacheKey, {
      failedAt: Date.now(),
      message: formatError(error)
    });
    pruneEndpointFailureCache();
    throw error;
  }).finally(() => {
    endpointInflight.delete(cacheKey);
  });
  endpointInflight.set(cacheKey, promise);
  return promise;
}

async function fetchModelEndpoints(url: string): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`OpenRouter endpoints request timed out after ${endpointFetchTimeoutMs}ms`));
  }, endpointFetchTimeoutMs);
  timer.unref?.();

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`OpenRouter endpoints request timed out after ${endpointFetchTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter endpoints request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = await response.json() as unknown;
  const record = isRecord(payload) ? payload : {};
  const data = isRecord(record.data) ? record.data : {};
  const endpoints = Array.isArray(data.endpoints)
    ? data.endpoints
    : Array.isArray(record.endpoints)
      ? record.endpoints
      : [];
  return endpoints;
}

function pruneEndpointCache(): void {
  if (endpointCache.size <= endpointCacheMaxEntries) {
    return;
  }
  const overflow = endpointCache.size - endpointCacheMaxEntries;
  const oldestKeys = [...endpointCache.entries()]
    .sort((left, right) => left[1].fetchedAt - right[1].fetchedAt)
    .slice(0, Math.max(overflow, 50))
    .map(([key]) => key);
  for (const key of oldestKeys) {
    endpointCache.delete(key);
  }
}

function pruneEndpointFailureCache(): void {
  if (endpointFailureCache.size <= endpointCacheMaxEntries) {
    return;
  }
  const overflow = endpointFailureCache.size - endpointCacheMaxEntries;
  const oldestKeys = [...endpointFailureCache.entries()]
    .sort((left, right) => left[1].failedAt - right[1].failedAt)
    .slice(0, Math.max(overflow, 50))
    .map(([key]) => key);
  for (const key of oldestKeys) {
    endpointFailureCache.delete(key);
  }
}

type RequestCostShape = {
  cacheWriteTokens: number;
  completionTokens: number;
  imageCount: number;
  promptTokens: number;
  searchCount: number;
};

function normalizeEndpoint(endpoint: unknown, request: RequestCostShape): NormalizedEndpoint | undefined {
  if (!isRecord(endpoint)) {
    return undefined;
  }

  const pricing = selectPricingTier(endpoint.pricing, request.promptTokens);
  if (!pricing) {
    return undefined;
  }
  const promptPrice = finiteNumber(pricing.prompt ?? pricing.input);
  const completionPrice = finiteNumber(pricing.completion ?? pricing.output);
  if (promptPrice === undefined || completionPrice === undefined) {
    return undefined;
  }

  const tag = stringValue(endpoint.tag) ||
    stringValue(endpoint.provider_tag) ||
    stringValue(endpoint.provider_slug) ||
    stringValue(endpoint.provider_name) ||
    stringValue(endpoint.name);
  if (!tag) {
    return undefined;
  }

  const requestPrice = firstFiniteNumber([
    pricing.request,
    pricing.request_cost,
    pricing.requestCost
  ]) ?? 0;
  const cacheReadPrice = firstFiniteNumber([
    pricing.cache_read,
    pricing.cache_read_5m,
    pricing.cacheRead5m,
    pricing.cacheRead,
    pricing.cached_prompt,
    pricing.prompt_cache_read,
    pricing.prompt_cache_read_5m,
    pricing.input_cache_read,
    pricing.input_cache_read_5m,
    pricing.inputCacheRead,
    pricing.inputCacheRead5m,
    pricing.input_cached
  ]) ?? promptPrice;
  const cacheWritePrice = firstFiniteNumber([
    pricing.cache_write,
    pricing.cache_write_5m,
    pricing.cache_write_1h,
    pricing.cacheWrite,
    pricing.cacheWrite5m,
    pricing.cacheWrite1h,
    pricing.prompt_cache_write,
    pricing.prompt_cache_write_5m,
    pricing.prompt_cache_write_1h,
    pricing.input_cache_write,
    pricing.input_cache_write_5m,
    pricing.input_cache_write_1h,
    pricing.inputCacheWrite,
    pricing.inputCacheWrite5m,
    pricing.inputCacheWrite1h
  ]) ?? 0;
  const imagePrice = firstFiniteNumber([
    pricing.image,
    pricing.image_input,
    pricing.image_input_price,
    pricing.imageInput,
    pricing.imageInputPrice,
    pricing.input_image,
    pricing.inputImage
  ]);
  const searchPrice = firstFiniteNumber([
    pricing.web_search,
    pricing.web_search_request,
    pricing.webSearch,
    pricing.webSearchRequest,
    pricing.search,
    pricing.search_request,
    pricing.searchRequest
  ]);

  return {
    cacheReadPrice,
    cacheWritePrice,
    cacheWriteTokens: request.cacheWriteTokens,
    completionPrice,
    dataCollection: stringValue(endpoint.data_collection) || stringValue(endpoint.data_policy) || stringValue(endpoint.dataPolicy),
    distillable: booleanValue(endpoint.distillable) ??
      booleanValue(endpoint.is_distillable) ??
      booleanValue(endpoint.supports_distillation) ??
      booleanValue(endpoint.supports_distillable_text),
    imageCount: request.imageCount,
    imagePrice,
    maxCompletionTokens: finiteNumber(endpoint.max_completion_tokens),
    maxPromptTokens: finiteNumber(endpoint.max_prompt_tokens),
    providerName: stringValue(endpoint.provider_name) || stringValue(endpoint.name) || tag,
    promptPrice,
    quantization: stringValue(endpoint.quantization),
    requestPrice,
    searchCount: request.searchCount,
    searchPrice,
    status: finiteNumber(endpoint.status),
    supportedParameters: readStringArray(endpoint.supported_parameters),
    supportsImplicitCaching: endpoint.supports_implicit_caching === true,
    supportsZdr: booleanValue(endpoint.zdr) ??
      booleanValue(endpoint.supports_zdr) ??
      booleanValue(endpoint.is_zdr) ??
      booleanValue(endpoint.zero_data_retention) ??
      booleanValue(endpoint.supports_zero_data_retention),
    tag,
    uncachedCostUsd:
      request.promptTokens * promptPrice +
      request.completionTokens * completionPrice +
      request.cacheWriteTokens * cacheWritePrice +
      request.imageCount * (imagePrice ?? 0) +
      request.searchCount * (searchPrice ?? 0) +
      requestPrice,
    uptimeLast5m: firstFiniteNumber([
      endpoint.uptime_last_5m,
      endpoint.uptime_last_30m,
      endpoint.uptime_last_1h,
      endpoint.uptime
    ])
  };
}

function selectPricingTier(pricing: unknown, tokenCount: number): Record<string, unknown> | undefined {
  if (Array.isArray(pricing)) {
    const tiers = pricing
      .filter(isRecord)
      .map((tier) => ({
        minContext: finiteNumber(tier.min_context) ?? 0,
        tier
      }))
      .sort((left, right) => left.minContext - right.minContext);
    return [...tiers].reverse().find(({ minContext }) => tokenCount >= minContext)?.tier ?? tiers[0]?.tier;
  }
  return isRecord(pricing) ? pricing : undefined;
}

function resolveOpenRouterDiscountRoutingTarget(
  input: GatewayPluginRequestTransformInput,
  config: AppConfig
): OpenRouterDiscountRoutingTarget | undefined {
  const body = isRecord(input.body) ? input.body : {};
  const candidates = [
    input.routedModel,
    body.model
  ].map(stringValue).filter(Boolean);
  if (candidates.length === 0) {
    return undefined;
  }

  for (const provider of config.Providers ?? []) {
    if (provider.enabled === false || !isOpenRouterProvider(provider)) {
      continue;
    }
    for (const model of provider.models ?? []) {
      const routing = provider.modelMetadata?.[model]?.openRouterDiscountRouting;
      if (routing?.enabled !== true) {
        continue;
      }
      if (candidates.some((candidate) => selectorMatchesProviderModel(candidate, provider, model))) {
        return {
          model,
          provider,
          settings: normalizeSettings(routing)
        };
      }
    }
  }
  return undefined;
}

function selectorMatchesProviderModel(selector: string, provider: GatewayProviderConfig, model: string): boolean {
  const normalizedSelector = normalizeSelector(selector);
  const normalizedModel = normalizeSelector(model);
  if (normalizedSelector === normalizedModel) {
    return true;
  }
  const providerNames = [
    provider.name,
    provider.id,
    provider.provider
  ].map(stringValue).filter(Boolean);
  return providerNames.some((providerName) =>
    normalizedSelector === normalizeSelector(`${providerName}/${model}`)
  );
}

function selectorMatchesOpenRouterModel(selector: string, model: string): boolean {
  const normalizedSelector = normalizeSelector(selector);
  const normalizedModel = normalizeSelector(model);
  return normalizedSelector === normalizedModel || normalizedSelector.endsWith(`/${normalizedModel}`);
}

function normalizeSettings(value: ProviderModelOpenRouterDiscountRoutingConfig): OpenRouterDiscountRoutingSettings {
  return {
    allowFallbacks: value.allowFallbacks ?? DEFAULT_SETTINGS.allowFallbacks,
    cacheHitRate: clamp(value.cacheHitRate ?? DEFAULT_SETTINGS.cacheHitRate, 0, 1),
    endpointTtlMs: Math.max(5_000, Math.trunc(value.endpointTtlMs ?? DEFAULT_SETTINGS.endpointTtlMs)),
    minOutputTokens: Math.max(1, Math.trunc(value.minOutputTokens ?? DEFAULT_SETTINGS.minOutputTokens)),
    minSavingsRatio: Math.max(0, value.minSavingsRatio ?? DEFAULT_SETTINGS.minSavingsRatio),
    minSavingsUsd: Math.max(0, value.minSavingsUsd ?? DEFAULT_SETTINGS.minSavingsUsd),
    minUptime5m: clamp(value.minUptime5m ?? DEFAULT_SETTINGS.minUptime5m, 0, 100),
    outputTokenRatio: Math.max(0, value.outputTokenRatio ?? DEFAULT_SETTINGS.outputTokenRatio),
    providerBlacklist: normalizeProviderBlacklist(value.providerBlacklist),
    requireParameters: value.requireParameters ?? DEFAULT_SETTINGS.requireParameters,
    respectExistingProviderOrder: value.respectExistingProviderOrder ?? DEFAULT_SETTINGS.respectExistingProviderOrder
  };
}

function buildResponseHeaders(input: {
  baseline: NormalizedEndpoint | undefined;
  cacheWriteTokens: number;
  cheapest: NormalizedEndpoint;
  completionTokens: number;
  decision: ReturnType<typeof chooseEndpoint>;
  imageCount: number;
  model: string;
  providerIgnore: string[];
  promptTokens: number;
  searchCount: number;
}): Record<string, string> {
  const cheapestOffPct = input.baseline
    ? discountPercent(input.cheapest.uncachedCostUsd, input.baseline.uncachedCostUsd)
    : 0;
  const selectedOffPct = input.baseline
    ? discountPercent(input.decision.selected.uncachedCostUsd, input.baseline.uncachedCostUsd)
    : 0;
  return cleanHeaders({
    "x-ccr-openrouter-discount-baseline-cost-usd": input.baseline ? money(input.baseline.uncachedCostUsd) : "",
    "x-ccr-openrouter-discount-baseline-provider": input.baseline?.tag ?? "",
    "x-ccr-openrouter-discount-cache-loss-usd": money(input.decision.cacheLossUsd),
    "x-ccr-openrouter-discount-cache-write-tokens": String(input.cacheWriteTokens),
    "x-ccr-openrouter-discount-cheapest-cost-usd": money(input.cheapest.uncachedCostUsd),
    "x-ccr-openrouter-discount-cheapest-off-pct": percent(cheapestOffPct),
    "x-ccr-openrouter-discount-completion-tokens": String(input.completionTokens),
    "x-ccr-openrouter-discount-gross-savings-usd": money(input.decision.grossSavingsUsd),
    "x-ccr-openrouter-discount-image-count": String(input.imageCount),
    "x-ccr-openrouter-discount-ignored-providers": input.providerIgnore.join(","),
    "x-ccr-openrouter-discount-model": input.model,
    "x-ccr-openrouter-discount-potential-net-savings-usd": money(input.decision.potentialNetSavingsUsd),
    "x-ccr-openrouter-discount-prompt-tokens": String(input.promptTokens),
    "x-ccr-openrouter-discount-reason": input.decision.reason,
    "x-ccr-openrouter-discount-search-count": String(input.searchCount),
    "x-ccr-openrouter-discount-selected-cost-usd": money(input.decision.selected.uncachedCostUsd),
    "x-ccr-openrouter-discount-selected-off-pct": percent(input.decision.switched ? selectedOffPct : 0),
    "x-ccr-openrouter-discount-selected-provider": input.decision.selected.tag,
    "x-ccr-openrouter-discount-selected-provider-name": input.decision.selected.providerName,
    "x-ccr-openrouter-discount-savings-usd": input.decision.switched ? money(input.decision.netSavingsUsd) : "0",
    "x-ccr-openrouter-discount-switched": input.decision.switched ? "true" : "false"
  });
}

function estimatePromptTokens(body: Record<string, unknown>): number {
  return Math.max(1, estimateTokensForValue({
    input: body.input,
    messages: body.messages,
    prompt: body.prompt,
    system: body.system,
    tools: body.tools
  }));
}

function estimateRequestCostShape(body: Record<string, unknown>, promptTokens: number): Omit<RequestCostShape, "completionTokens" | "promptTokens"> {
  return {
    cacheWriteTokens: Math.min(promptTokens, estimateCacheWriteTokens(body)),
    imageCount: estimateImageInputCount(body),
    searchCount: estimateSearchRequestCount(body)
  };
}

function estimateCacheWriteTokens(body: Record<string, unknown>): number {
  return Math.max(0, estimateCacheControlledTokens(body));
}

function estimateCacheControlledTokens(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.reduce<number>((total, item) => total + estimateCacheControlledTokens(item), 0);
  }
  if (!isRecord(value)) {
    return 0;
  }
  if (recordHasCacheControl(value)) {
    return estimateCacheControlledPayloadTokens(value);
  }
  return Object.values(value).reduce<number>((total, item) => total + estimateCacheControlledTokens(item), 0);
}

function estimateCacheControlledPayloadTokens(value: Record<string, unknown>): number {
  if (typeof value.text === "string") {
    return estimateTokensForText(value.text);
  }
  if (typeof value.content === "string") {
    return estimateTokensForText(value.content);
  }
  if (value.content !== undefined) {
    return estimateTokensForValue(value.content);
  }
  return estimateTokensForValue(recordWithoutCacheControl(value));
}

function estimateTokensForValue(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return estimateTokensForText(value);
  }
  const text = JSON.stringify(value);
  return typeof text === "string" ? estimateTokensForText(text) : 0;
}

function estimateTokensForText(value: string): number {
  return Math.ceil(value.length / 4);
}

function recordWithoutCacheControl(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!cacheControlKeyNames.has(key)) {
      result[key] = item;
    }
  }
  return result;
}

function estimateImageInputCount(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + estimateImageInputCount(item), 0);
  }
  if (!isRecord(value)) {
    return 0;
  }

  const type = stringValue(value.type).toLowerCase();
  const explicitImage =
    type === "image" ||
    type === "image_url" ||
    type === "input_image" ||
    Object.prototype.hasOwnProperty.call(value, "image_url");
  const nested = Object.entries(value)
    .filter(([key]) => key !== "image_url")
    .reduce((total, [, item]) => total + estimateImageInputCount(item), 0);
  return (explicitImage ? 1 : 0) + nested;
}

function estimateSearchRequestCount(body: Record<string, unknown>): number {
  const optionCount = body.web_search_options !== undefined || body.webSearchOptions !== undefined ? 1 : 0;
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const toolCount = tools.reduce((total, tool) => total + (toolRequestsWebSearch(tool) ? 1 : 0), 0);
  return Math.max(optionCount, toolCount);
}

function toolRequestsWebSearch(tool: unknown): boolean {
  if (!isRecord(tool)) {
    return false;
  }
  const type = stringValue(tool.type).toLowerCase();
  const name = stringValue(tool.name).toLowerCase();
  return type.includes("web_search") || name.includes("web_search");
}

function estimateCompletionTokens(
  body: Record<string, unknown>,
  promptTokens: number,
  settings: OpenRouterDiscountRoutingSettings
): number {
  const explicit = firstFiniteNumber([
    body.max_tokens,
    body.max_completion_tokens,
    body.max_output_tokens
  ]);
  if (explicit !== undefined && explicit > 0) {
    return Math.ceil(explicit);
  }
  return Math.ceil(Math.max(settings.minOutputTokens, promptTokens * settings.outputTokenRatio));
}

function findEndpointByOrder(orderValue: unknown, endpoints: NormalizedEndpoint[]): NormalizedEndpoint | undefined {
  const key = normalizeKey(orderValue);
  if (!key) {
    return undefined;
  }
  return endpoints.find((endpoint) =>
    normalizeKey(endpoint.tag) === key ||
    normalizeKey(endpoint.providerName) === key ||
    normalizeKey(slugify(endpoint.providerName)) === key
  );
}

function endpointSatisfiesProviderConstraints(
  endpoint: NormalizedEndpoint,
  provider: Record<string, unknown>,
  body: Record<string, unknown>,
  promptTokens: number,
  completionTokens: number,
  settings: OpenRouterDiscountRoutingSettings
): boolean {
  if (endpoint.maxPromptTokens !== undefined && promptTokens > endpoint.maxPromptTokens) {
    return false;
  }
  if (endpoint.maxCompletionTokens !== undefined && completionTokens > endpoint.maxCompletionTokens) {
    return false;
  }

  const only = readStringArray(provider.only);
  if (only.length > 0 && !endpointMatchesProviderList(endpoint, only)) {
    return false;
  }

  const quantizations = readStringArray(provider.quantizations);
  if (quantizations.length > 0 && !quantizations.some((value) => quantizationMatches(endpoint.quantization, value))) {
    return false;
  }

  const maxPrice = providerObject(provider, "max_price", "maxPrice");
  if (maxPrice && !endpointWithinMaxPrice(endpoint, maxPrice)) {
    return false;
  }

  const dataCollection = stringValue(provider.data_collection) || stringValue(provider.dataCollection);
  if (dataCollection.toLowerCase() === "deny" && !endpointDeniesDataCollection(endpoint)) {
    return false;
  }

  if (providerBoolean(provider, "zdr") === true && endpoint.supportsZdr !== true) {
    return false;
  }

  if (providerBoolean(provider, "enforce_distillable_text", "enforceDistillableText") === true && endpoint.distillable !== true) {
    return false;
  }

  const requireParameters = providerBoolean(provider, "require_parameters", "requireParameters") ?? settings.requireParameters;
  return endpointSupportsRequestParameters(endpoint, body, requireParameters);
}

function endpointWithinMaxPrice(endpoint: NormalizedEndpoint, maxPrice: Record<string, unknown>): boolean {
  const promptMax = firstFiniteNumber([maxPrice.prompt, maxPrice.input]);
  if (promptMax !== undefined && endpoint.promptPrice * 1_000_000 > promptMax) {
    return false;
  }
  const completionMax = firstFiniteNumber([maxPrice.completion, maxPrice.output]);
  if (completionMax !== undefined && endpoint.completionPrice * 1_000_000 > completionMax) {
    return false;
  }
  const requestMax = finiteNumber(maxPrice.request);
  if (requestMax !== undefined && endpoint.requestPrice > requestMax) {
    return false;
  }
  const imageMax = finiteNumber(maxPrice.image);
  if (imageMax !== undefined && endpoint.imagePrice !== undefined && endpoint.imagePrice > imageMax) {
    return false;
  }
  return true;
}

function endpointDeniesDataCollection(endpoint: NormalizedEndpoint): boolean {
  const dataCollection = endpoint.dataCollection?.toLowerCase();
  if (!dataCollection) {
    return endpoint.supportsZdr === true;
  }
  return ["deny", "denied", "none", "no", "zdr", "zero-data-retention", "zero_data_retention"].includes(dataCollection);
}

function quantizationMatches(endpointValue: string | undefined, requestedValue: string): boolean {
  const endpointQuantization = normalizeQuantization(endpointValue);
  const requestedQuantization = normalizeQuantization(requestedValue);
  if (!endpointQuantization || !requestedQuantization) {
    return false;
  }
  if (endpointQuantization === requestedQuantization) {
    return true;
  }
  if (requestedQuantization === "fp8" && endpointQuantization === "mxfp8") {
    return true;
  }
  if (requestedQuantization === "fp4" && ["mxfp4", "nvfp4"].includes(endpointQuantization)) {
    return true;
  }
  return false;
}

function normalizeQuantization(value: unknown): string {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function endpointSupportsRequestParameters(endpoint: NormalizedEndpoint, body: Record<string, unknown>, required: boolean): boolean {
  if (!required || endpoint.supportedParameters.length === 0) {
    return true;
  }
  const requiredParameters = openRouterProviderRequestParameters(body);
  if (requiredParameters.length === 0) {
    return true;
  }
  const supported = new Set(endpoint.supportedParameters.map((value) => normalizeProviderParameterName(value)));
  return requiredParameters.every((parameter) => supported.has(parameter));
}

function openRouterProviderRequestParameters(body: Record<string, unknown>): string[] {
  const supportedRequestParameters = new Set([
    "frequency_penalty",
    "include_reasoning",
    "logit_bias",
    "logprobs",
    "max_tokens",
    "min_p",
    "presence_penalty",
    "reasoning",
    "reasoning_effort",
    "repetition_penalty",
    "response_format",
    "seed",
    "stop",
    "temperature",
    "tool_choice",
    "tools",
    "top_k",
    "top_logprobs",
    "top_p",
    "verbosity",
    "web_search_options"
  ]);
  const aliases = new Map([
    ["maxCompletionTokens", "max_tokens"],
    ["max_completion_tokens", "max_tokens"],
    ["maxOutputTokens", "max_tokens"],
    ["max_output_tokens", "max_tokens"],
    ["responseFormat", "response_format"],
    ["response_format", "response_format"],
    ["toolChoice", "tool_choice"],
    ["tool_choice", "tool_choice"]
  ]);
  const result: string[] = [];
  for (const [name, value] of Object.entries(body)) {
    if (value === undefined) {
      continue;
    }
    const normalized = normalizeProviderParameterName(aliases.get(name) ?? name);
    if (supportedRequestParameters.has(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

function normalizeProviderParameterName(value: string): string {
  return value.trim().replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function endpointMatchesProviderList(endpoint: NormalizedEndpoint, values: string[]): boolean {
  if (values.length === 0) {
    return false;
  }
  const endpointIdentifiers = [
    endpoint.tag,
    endpoint.providerName,
    slugify(endpoint.providerName)
  ].map(normalizeProviderIdentifier).filter(Boolean);
  return values.some((value) => {
    const ignored = normalizeProviderIdentifier(value);
    return Boolean(ignored && endpointIdentifiers.some((identifier) =>
      identifier === ignored || identifier.startsWith(`${ignored}/`)
    ));
  });
}

function costWithCacheHitRate(endpoint: NormalizedEndpoint, promptTokens: number, cacheHitRate: number): number {
  const cachedTokens = promptTokens * cacheHitRate;
  const promptSavings = cachedTokens * (endpoint.promptPrice - endpoint.cacheReadPrice);
  const cacheWriteSavings = Math.min(endpoint.cacheWriteTokens, cachedTokens) * endpoint.cacheWritePrice;
  return Math.max(0, endpoint.uncachedCostUsd - promptSavings - cacheWriteSavings);
}

function shouldAccountForCacheLoss(endpoint: NormalizedEndpoint, body: Record<string, unknown>): boolean {
  return endpoint.supportsImplicitCaching || bodyHasCacheControl(body);
}

const cacheControlKeyNames = new Set(["cache_control", "cacheControl"]);

function bodyHasCacheControl(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(bodyHasCacheControl);
  }
  if (!isRecord(value)) {
    return false;
  }
  if (recordHasCacheControl(value)) {
    return true;
  }
  return Object.values(value).some(bodyHasCacheControl);
}

function recordHasCacheControl(value: Record<string, unknown>): boolean {
  return [...cacheControlKeyNames].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function rememberSessionSelection(sessionKey: string, providerTag: string): void {
  if (!sessionKey || !providerTag) {
    return;
  }
  sessionSelections.set(sessionKey, {
    providerTag,
    updatedAt: Date.now()
  });
  if (sessionSelections.size <= 2_000) {
    return;
  }
  const oldest = [...sessionSelections.entries()]
    .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
    .slice(0, 200);
  for (const [key] of oldest) {
    sessionSelections.delete(key);
  }
}

function rememberPendingSelection(
  requestId: string,
  selection: Omit<PendingSelection, "updatedAt">
): void {
  if (!requestId) {
    return;
  }
  pendingSelections.set(requestId, {
    ...selection,
    updatedAt: Date.now()
  });
  if (pendingSelections.size <= 2_000) {
    return;
  }
  const oldest = [...pendingSelections.entries()]
    .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
    .slice(0, 200);
  for (const [key] of oldest) {
    pendingSelections.delete(key);
  }
}

export function finalizeOpenRouterDiscountProviderRouterSelection(
  requestId: string,
  input: {
    ok: boolean;
    routedModel?: string;
    usedCcrFallback?: boolean;
  }
): void {
  const pending = pendingSelections.get(requestId);
  pendingSelections.delete(requestId);
  if (!pending || !input.ok || input.usedCcrFallback || pending.allowFallbacks) {
    return;
  }
  if (input.routedModel && !selectorMatchesOpenRouterModel(input.routedModel, pending.model)) {
    return;
  }
  rememberSessionSelection(pending.sessionKey, pending.providerTag);
}

function isOpenRouterProvider(provider: GatewayProviderConfig): boolean {
  const text = [
    provider.id,
    provider.name,
    provider.provider,
    provider.baseUrl,
    provider.baseurl,
    provider.api_base_url
  ].map(stringValue).join(" ").toLowerCase();
  return text.includes("openrouter");
}

function openRouterApiRoot(provider: GatewayProviderConfig): string {
  const raw = stringValue(provider.baseUrl) ||
    stringValue(provider.baseurl) ||
    stringValue(provider.api_base_url) ||
    "https://openrouter.ai/api/v1";
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/api\/v1\/?$/i, "") || "/";
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname === "/" ? "" : trimRight(url.pathname, "/")}`;
  } catch {
    return "https://openrouter.ai";
  }
}

function providerStableKey(provider: GatewayProviderConfig): string {
  return stringValue(provider.id) || stringValue(provider.name) || stringValue(provider.api_base_url) || "openrouter";
}

function providerBoolean(provider: Record<string, unknown>, ...names: string[]): boolean | undefined {
  for (const name of names) {
    const value = booleanValue(provider[name]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function providerObject(provider: Record<string, unknown>, ...names: string[]): Record<string, unknown> | undefined {
  for (const name of names) {
    const value = provider[name];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(stringValue).filter(Boolean)
    : typeof value === "string"
      ? value.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
}

function mergeStringLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of lists.flat()) {
    const normalized = normalizeProviderIdentifier(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeProviderBlacklist(value: unknown): string[] {
  return Array.isArray(value)
    ? mergeStringLists(value.map(stringValue).filter(Boolean))
    : [];
}

function sameEndpoint(left: NormalizedEndpoint, right: NormalizedEndpoint): boolean {
  return normalizeKey(left.tag) === normalizeKey(right.tag);
}

function cleanHeaders(headers: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    result[name] = String(value ?? "").replace(/[\r\n]+/g, " ").slice(0, 240);
  }
  return result;
}

function cloneRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : undefined;
}

function firstFiniteNumber(values: unknown[]): number | undefined {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== undefined) {
      return number;
    }
  }
  return undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function discountPercent(cost: number, baselineCost: number): number {
  return baselineCost > 0 ? Math.max(0, (baselineCost - cost) / baselineCost) : 0;
}

function money(value: number): string {
  return Number.isFinite(value) ? value.toFixed(8).replace(/0+$/, "").replace(/\.$/, ".0") : "0";
}

function percent(value: number): string {
  return Number.isFinite(value) ? (value * 100).toFixed(2) : "0";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSelector(value: string): string {
  return value.trim().toLowerCase().replace(/\/+/g, "/");
}

function normalizeKey(value: unknown): string {
  return stringValue(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeProviderIdentifier(value: unknown): string {
  return stringValue(value).split("/").map(slugify).filter(Boolean).join("/");
}

function slugify(value: string): string {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function trimRight(value: string, char: string): string {
  let result = value;
  while (result.endsWith(char)) {
    result = result.slice(0, -1);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
