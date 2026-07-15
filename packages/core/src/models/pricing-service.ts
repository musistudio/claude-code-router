import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";

type ModelPricingSource = "litellm" | "models.dev" | "openrouter";

export type UsageCostInput = {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  inputTokens?: number;
  model?: string;
  outputTokens?: number;
  provider?: string;
};

export type UsageCostEstimate = {
  amountUsd: number;
  model: string;
  source: ModelPricingSource;
};

type ModelPrice = {
  cacheReadUsdPerToken?: number;
  cacheWriteUsdPerToken?: number;
  inputUsdPerToken: number;
  model: string;
  outputUsdPerToken: number;
  provider?: string;
  source: ModelPricingSource;
};

type PriceCatalog = {
  index: PriceIndex;
  loadedAt: number;
};

type PriceIndex = Map<ModelPricingSource, Map<string, ModelPrice>>;

const catalogTtlMs = 24 * 60 * 60 * 1000;
const fetchTimeoutMs = 5000;
const liteLlmPricesUrl = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const modelsDevPricesUrl = "https://models.dev/api.json";
const openRouterModelsUrl = "https://openrouter.ai/api/v1/models";

let catalog: PriceCatalog | undefined;
let catalogPromise: Promise<PriceCatalog> | undefined;

export async function estimateUsageCostUsd(input: UsageCostInput): Promise<UsageCostEstimate | undefined> {
  if (!hasBillableUsage(input)) {
    return undefined;
  }
  const model = input.model?.trim();
  if (!model || model === "unknown") {
    return undefined;
  }

  const prices = await getPriceCatalog();
  return estimateUsageCostFromIndex(input, prices.index, model);
}

/**
 * Loads the remote catalog without holding a caller's database transaction.
 * Callers that own a write transaction can then use the cache-only estimator.
 */
export async function preloadUsagePriceCatalog(): Promise<void> {
  await getPriceCatalog();
}

export function usagePriceCatalogNeedsRefresh(): boolean {
  return !catalog || Date.now() - catalog.loadedAt >= catalogTtlMs;
}

/** Never performs I/O. Returns undefined when no fresh catalog is loaded. */
export function estimateUsageCostUsdFromLoadedCatalog(
  input: UsageCostInput
): UsageCostEstimate | undefined {
  if (!hasBillableUsage(input)) {
    return undefined;
  }
  const model = input.model?.trim();
  if (!model || model === "unknown" || usagePriceCatalogNeedsRefresh() || !catalog) {
    return undefined;
  }
  return estimateUsageCostFromIndex(input, catalog.index, model);
}

function estimateUsageCostFromIndex(
  input: UsageCostInput,
  index: PriceIndex,
  model: string
): UsageCostEstimate | undefined {
  const price = findModelPrice(index, model, input.provider);
  if (!price) {
    return undefined;
  }

  const inputTokens = normalizeCount(input.inputTokens);
  const outputTokens = normalizeCount(input.outputTokens);
  const cacheReadTokens = normalizeCount(input.cacheReadTokens);
  const cacheWriteTokens = normalizeCount(input.cacheWriteTokens);
  const amountUsd =
    inputTokens * price.inputUsdPerToken +
    outputTokens * price.outputUsdPerToken +
    cacheReadTokens * (price.cacheReadUsdPerToken ?? price.inputUsdPerToken) +
    cacheWriteTokens * (price.cacheWriteUsdPerToken ?? price.inputUsdPerToken);

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return undefined;
  }

  return {
    amountUsd,
    model: price.model,
    source: price.source
  };
}

function hasBillableUsage(input: UsageCostInput): boolean {
  return normalizeCount(input.inputTokens) +
    normalizeCount(input.outputTokens) +
    normalizeCount(input.cacheReadTokens) +
    normalizeCount(input.cacheWriteTokens) > 0;
}

async function getPriceCatalog(): Promise<PriceCatalog> {
  if (catalog && Date.now() - catalog.loadedAt < catalogTtlMs) {
    return catalog;
  }

  catalogPromise ??= loadPriceCatalog();
  try {
    catalog = await catalogPromise;
    return catalog;
  } finally {
    catalogPromise = undefined;
  }
}

async function loadPriceCatalog(): Promise<PriceCatalog> {
  const results = await Promise.allSettled([
    fetchLiteLlmPrices(),
    fetchModelsDevPrices(),
    fetchOpenRouterPrices()
  ]);
  const prices = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return {
    index: buildPriceIndex(prices),
    loadedAt: Date.now()
  };
}

async function fetchLiteLlmPrices(): Promise<ModelPrice[]> {
  const payload = await fetchJson(liteLlmPricesUrl);
  if (!isRecord(payload)) {
    return [];
  }

  return Object.entries(payload)
    .map(([model, value]) => {
      if (model === "sample_spec" || !isRecord(value)) {
        return undefined;
      }
      const inputUsdPerToken = firstNumber(value, [
        "input_cost_per_token",
        "prompt_cost_per_token"
      ]);
      const outputUsdPerToken = firstNumber(value, [
        "output_cost_per_token",
        "completion_cost_per_token",
        "output_cost_per_reasoning_token"
      ]);
      return priceFromTokenCosts({
        cacheReadUsdPerToken: firstNumber(value, [
          "cache_read_input_token_cost",
          "input_cache_read_cost_per_token",
          "cache_read_cost_per_token"
        ]),
        cacheWriteUsdPerToken: firstNumber(value, [
          "cache_creation_input_token_cost",
          "input_cache_write_cost_per_token",
          "cache_write_cost_per_token"
        ]),
        inputUsdPerToken,
        model,
        outputUsdPerToken,
        provider: readString(value.litellm_provider),
        source: "litellm"
      });
    })
    .filter((price): price is ModelPrice => Boolean(price));
}

async function fetchModelsDevPrices(): Promise<ModelPrice[]> {
  const payload = await fetchJson(modelsDevPricesUrl);
  if (!isRecord(payload)) {
    return [];
  }

  const prices: ModelPrice[] = [];
  for (const [providerId, provider] of Object.entries(payload)) {
    if (!isRecord(provider) || !isRecord(provider.models)) {
      continue;
    }
    for (const [modelKey, model] of Object.entries(provider.models)) {
      if (!isRecord(model) || !isRecord(model.cost)) {
        continue;
      }
      const cost = model.cost;
      const price = priceFromMillionTokenCosts({
        cacheReadUsdPerMillionTokens: readNumber(cost.cache_read),
        cacheWriteUsdPerMillionTokens: readNumber(cost.cache_write),
        inputUsdPerMillionTokens: readNumber(cost.input),
        model: readString(model.id) || modelKey,
        outputUsdPerMillionTokens: readNumber(cost.output),
        provider: providerId,
        source: "models.dev"
      });
      if (price) {
        prices.push(price);
      }
    }
  }
  return prices;
}

async function fetchOpenRouterPrices(): Promise<ModelPrice[]> {
  const payload = await fetchJson(openRouterModelsUrl);
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return [];
  }

  return payload.data
    .map((model) => {
      if (!isRecord(model) || !isRecord(model.pricing)) {
        return undefined;
      }
      const pricing = model.pricing;
      return priceFromTokenCosts({
        cacheReadUsdPerToken: readNumber(pricing.input_cache_read),
        cacheWriteUsdPerToken: readNumber(pricing.input_cache_write),
        inputUsdPerToken: readNumber(pricing.prompt),
        model: readString(model.id) || readString(model.canonical_slug),
        outputUsdPerToken: readNumber(pricing.completion),
        provider: "openrouter",
        source: "openrouter"
      });
    })
    .filter((price): price is ModelPrice => Boolean(price));
}

function priceFromMillionTokenCosts(input: {
  cacheReadUsdPerMillionTokens?: number;
  cacheWriteUsdPerMillionTokens?: number;
  inputUsdPerMillionTokens?: number;
  model: string;
  outputUsdPerMillionTokens?: number;
  provider?: string;
  source: ModelPricingSource;
}): ModelPrice | undefined {
  return priceFromTokenCosts({
    cacheReadUsdPerToken: divideByMillion(input.cacheReadUsdPerMillionTokens),
    cacheWriteUsdPerToken: divideByMillion(input.cacheWriteUsdPerMillionTokens),
    inputUsdPerToken: divideByMillion(input.inputUsdPerMillionTokens),
    model: input.model,
    outputUsdPerToken: divideByMillion(input.outputUsdPerMillionTokens),
    provider: input.provider,
    source: input.source
  });
}

function priceFromTokenCosts(input: {
  cacheReadUsdPerToken?: number;
  cacheWriteUsdPerToken?: number;
  inputUsdPerToken?: number;
  model?: string;
  outputUsdPerToken?: number;
  provider?: string;
  source: ModelPricingSource;
}): ModelPrice | undefined {
  const model = input.model?.trim();
  const inputUsdPerToken = normalizePrice(input.inputUsdPerToken);
  const outputUsdPerToken = normalizePrice(input.outputUsdPerToken);
  if (!model || inputUsdPerToken === undefined || outputUsdPerToken === undefined) {
    return undefined;
  }

  return {
    cacheReadUsdPerToken: normalizePrice(input.cacheReadUsdPerToken),
    cacheWriteUsdPerToken: normalizePrice(input.cacheWriteUsdPerToken),
    inputUsdPerToken,
    model,
    outputUsdPerToken,
    provider: input.provider?.trim() || undefined,
    source: input.source
  };
}

function findModelPrice(index: PriceIndex, model: string, provider: string | undefined): ModelPrice | undefined {
  const candidateKeys = modelCandidateKeys(model, provider);
  const providerIsOpenRouter = normalizeKey(provider).includes("openrouter");
  const sourcePriority: ModelPricingSource[] = providerIsOpenRouter
    ? ["openrouter", "models.dev", "litellm"]
    : ["models.dev", "litellm", "openrouter"];

  for (const source of sourcePriority) {
    const sourceIndex = index.get(source);
    if (!sourceIndex) continue;
    for (const key of candidateKeys) {
      const price = sourceIndex.get(key);
      if (price) {
        return price;
      }
    }
  }
  return undefined;
}

function buildPriceIndex(prices: ModelPrice[]): PriceIndex {
  const index: PriceIndex = new Map();
  for (const price of prices) {
    let sourceIndex = index.get(price.source);
    if (!sourceIndex) {
      sourceIndex = new Map();
      index.set(price.source, sourceIndex);
    }
    for (const key of priceIndexKeys(price)) {
      if (!sourceIndex.has(key)) sourceIndex.set(key, price);
    }
  }
  return index;
}

function priceIndexKeys(price: ModelPrice): string[] {
  const keys = [
    normalizeKey(price.model),
    normalizeKey(lastPathSegment(price.model))
  ];
  if (price.provider) {
    keys.push(normalizeKey(`${price.provider}/${price.model}`));
    keys.push(normalizeKey(`${price.provider}/${lastPathSegment(price.model)}`));
  }
  return unique(keys.filter(Boolean));
}

function modelCandidateKeys(model: string, provider: string | undefined): string[] {
  const rawModel = model.trim();
  const rawProvider = provider?.trim() || "";
  const providerPrefixes = providerModelPrefixes(rawProvider);
  const values = [
    rawModel,
    lastPathSegment(rawModel),
    ...providerPrefixes.map((prefix) => `${prefix}/${rawModel}`),
    ...providerPrefixes.map((prefix) => `${prefix}/${lastPathSegment(rawModel)}`)
  ];
  return unique(values.map(normalizeKey).filter(Boolean));
}

function providerModelPrefixes(provider: string): string[] {
  const normalized = normalizeKey(provider);
  const prefixes = new Set<string>();
  const add = (value: string) => prefixes.add(value);

  if (normalized.includes("openai")) add("openai");
  if (normalized.includes("anthropic") || normalized.includes("claude")) add("anthropic");
  if (normalized.includes("gemini") || normalized.includes("google")) add("google");
  if (normalized.includes("deepseek")) add("deepseek");
  if (normalized.includes("moonshot") || normalized.includes("kimi")) add("moonshotai");
  if (normalized.includes("mistral")) add("mistral");
  if (normalized.includes("zhipu") || normalized.includes("bigmodel") || normalized.includes("glm")) add("zhipuai");
  if (normalized.includes("zai") || normalized.includes("z-ai") || normalized.includes("z.ai")) add("z-ai");
  if (normalized.includes("qwen")) add("qwen");
  if (normalized.includes("alibaba") || normalized.includes("bailian") || normalized.includes("dashscope")) add("alibaba");
  if (normalized.includes("siliconflow")) add("siliconflow");
  if (normalized.includes("openrouter")) add("openrouter");

  return Array.from(prefixes);
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetchWithSystemProxy(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePrice(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function divideByMillion(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / 1_000_000;
}

function normalizeCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeKey(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[\s:_]+/g, "-").replace(/-+/g, "-") ?? "";
}

function lastPathSegment(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed.split("/").filter(Boolean).at(-1) ?? trimmed;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
