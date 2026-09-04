import type {
  OpenRouterProviderCatalogItem,
  OpenRouterProviderCatalogRequest,
  OpenRouterProviderCatalogResult
} from "@ccr/core/contracts/app";

const providerCache = new Map<string, { fetchedAt: number; providers: OpenRouterProviderCatalogItem[] }>();
const providerCacheTtlMs = 10 * 60_000;
const activityCache = new Map<string, { fetchedAt: number; totals: Map<string, number> }>();

export async function getOpenRouterProviderCatalog(
  request: OpenRouterProviderCatalogRequest
): Promise<OpenRouterProviderCatalogResult> {
  const apiKey = stringValue(request.apiKey);
  const apiRoot = openRouterApiRoot(request.baseUrl);
  const model = stringValue(request.model);
  const cacheKey = model ? `${apiRoot}:model:${model}` : `${apiRoot}:providers`;
  const cached = providerCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < providerCacheTtlMs) {
    return {
      loadedFrom: apiRoot,
      providers: cached.providers
    };
  }

  const endpointPath = model
    ? modelEndpointsPath(model)
    : "/api/v1/providers";
  const response = await fetch(`${trimRight(apiRoot, "/")}${endpointPath}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter providers request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = await response.json() as unknown;
  const record = isRecord(payload) ? payload : {};
  const data = model && isRecord(record.data) && Array.isArray(record.data.endpoints)
    ? record.data.endpoints
    : Array.isArray(record.data)
      ? record.data
      : [];
  const providers = model
    ? mergeProviderActivity(
      normalizeOpenRouterEndpointProviders(data),
      await loadYesterdayProviderTokenTotals(apiRoot, apiKey, model)
    )
    : normalizeOpenRouterProviders(data);
  providerCache.set(cacheKey, { fetchedAt: now, providers });
  return {
    loadedFrom: apiRoot,
    providers
  };
}

function normalizeOpenRouterProviders(values: unknown[]): OpenRouterProviderCatalogItem[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (!isRecord(value)) {
      return [];
    }
    const slug = stringValue(value.slug);
    const name = stringValue(value.name) || slug;
    if (!slug || seen.has(slug)) {
      return [];
    }
    seen.add(slug);
    return [{ name, slug }];
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeOpenRouterEndpointProviders(values: unknown[]): OpenRouterProviderCatalogItem[] {
  const bySlug = new Map<string, OpenRouterProviderCatalogItem>();
  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }
    const explicitName = stringValue(value.provider_name) || stringValue(value.name);
    const slug = baseProviderSlug(
      stringValue(value.provider_slug) ||
      stringValue(value.provider_tag) ||
      stringValue(value.tag) ||
      slugify(explicitName)
    );
    const name = explicitName || providerNameFromSlug(slug);
    if (!slug) {
      continue;
    }
    const uptimePercent = firstFiniteNumber([
      value.uptime_last_1d,
      value.uptime_last_30m,
      value.uptime_last_5m
    ]);
    const existing = bySlug.get(slug);
    const bestUptimePercent = bestPercent(existing?.uptimePercent, uptimePercent);
    const quantizations = uniqueDisplayStrings([
      ...(existing?.quantizations ?? []),
      value.quantization
    ]);
    bySlug.set(slug, {
      name: (existing?.name ?? name) || slug,
      ...(quantizations.length > 0 ? { quantizations } : {}),
      slug,
      ...(bestUptimePercent !== undefined
        ? { uptimePercent: bestUptimePercent }
        : {})
    });
  }
  return [...bySlug.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function loadYesterdayProviderTokenTotals(
  apiRoot: string,
  apiKey: string,
  model: string
): Promise<Map<string, number> | undefined> {
  if (!apiKey) {
    return undefined;
  }
  const date = previousUtcDate();
  const cacheKey = `${apiRoot}:activity:${date}:${model}`;
  const cached = activityCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < providerCacheTtlMs) {
    return cached.totals;
  }

  const url = new URL(`${trimRight(apiRoot, "/")}/api/v1/activity`);
  url.searchParams.set("date", date);
  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    });
    if (!response.ok) {
      return undefined;
    }
    const payload = await response.json() as unknown;
    const record = isRecord(payload) ? payload : {};
    const data = Array.isArray(record.data) ? record.data : [];
    const totals = normalizeOpenRouterActivity(data, model);
    activityCache.set(cacheKey, { fetchedAt: now, totals });
    return totals;
  } catch {
    return undefined;
  }
}

function normalizeOpenRouterActivity(values: unknown[], model: string): Map<string, number> {
  const totals = new Map<string, number>();
  const normalizedModel = model.toLowerCase();
  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }
    const activityModel = (stringValue(value.model_permaslug) || stringValue(value.model)).toLowerCase();
    if (!activityModel || (activityModel !== normalizedModel && !activityModel.startsWith(`${normalizedModel}-`))) {
      continue;
    }
    const slug = baseProviderSlug(
      stringValue(value.provider_slug) ||
      stringValue(value.provider_tag) ||
      stringValue(value.tag) ||
      stringValue(value.provider_name)
    );
    if (!slug) {
      continue;
    }
    const totalTokens = firstFiniteNumber([
      value.total_tokens,
      value.tokens
    ]) ?? sumFiniteNumbers([
      value.prompt_tokens,
      value.completion_tokens,
      value.input_tokens,
      value.output_tokens
    ]);
    if (totalTokens <= 0) {
      continue;
    }
    totals.set(slug, (totals.get(slug) ?? 0) + totalTokens);
  }
  return totals;
}

function mergeProviderActivity(
  providers: OpenRouterProviderCatalogItem[],
  totals: Map<string, number> | undefined
): OpenRouterProviderCatalogItem[] {
  if (!totals || totals.size === 0) {
    return providers;
  }
  return providers.map((provider) => {
    const tokensYesterday = totals.get(provider.slug);
    return tokensYesterday !== undefined
      ? { ...provider, tokensYesterday }
      : provider;
  });
}

function previousUtcDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function bestPercent(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return Math.max(left, right);
}

function modelEndpointsPath(model: string): string {
  const [author, ...slugParts] = model.split("/");
  const slug = slugParts.join("/");
  if (!author || !slug) {
    throw new Error(`OpenRouter model id must be author/slug: ${model}`);
  }
  return `/api/v1/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`;
}

function baseProviderSlug(value: string): string {
  return slugify(value.split("/")[0] ?? "");
}

function providerNameFromSlug(slug: string): string {
  return slug.split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function uniqueDisplayStrings(values: unknown[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const text = stringValue(value);
    const key = text.toLowerCase();
    if (!text || byKey.has(key)) {
      continue;
    }
    byKey.set(key, text);
  }
  return [...byKey.values()].sort((left, right) => left.localeCompare(right));
}

function slugify(value: string): string {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function openRouterApiRoot(baseUrl: unknown): string {
  const raw = stringValue(baseUrl) || "https://openrouter.ai/api/v1";
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function sumFiniteNumbers(values: unknown[]): number {
  let total = 0;
  for (const value of values) {
    total += finiteNumber(value) ?? 0;
  }
  return total;
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
