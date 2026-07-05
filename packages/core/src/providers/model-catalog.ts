import type { ProviderCatalogModelsRequest, ProviderCatalogModelsResult } from "@ccr/core/contracts/app";
import { providerUrlWithDefaultScheme } from "@ccr/core/providers/url";
import { loadModelCatalogPayload } from "@ccr/core/models/catalog-file";
import { findProviderPreset, findProviderPresetByBaseUrl } from "@ccr/core/providers/presets/index";

type CatalogProviderEntry = {
  apiUrls: string[];
  models: string[];
  provider: string;
  providerName?: string;
  tokens: string[];
};

type CatalogIndex = {
  loadedFrom?: string;
  providers: CatalogProviderEntry[];
};

type MutableCatalogProviderEntry = Omit<CatalogProviderEntry, "apiUrls" | "models" | "tokens"> & {
  apiUrls: Set<string>;
  models: string[];
  modelSet: Set<string>;
  tokens: Set<string>;
};

type CatalogMatch = {
  entry: CatalogProviderEntry;
  matchedBy: NonNullable<ProviderCatalogModelsResult["matchedBy"]>;
  score: number;
};

const presetCatalogProviderIds: Record<string, string[]> = {
  anthropic: ["anthropic"],
  bailian: ["alibaba-cn"],
  deepseek: ["deepseek"],
  gemini: ["google"],
  "kimi-coding": ["kimi-for-coding"],
  mistral: ["mistral"],
  moonshot: ["moonshotai-cn"],
  "moonshot-global": ["moonshotai"],
  openai: ["openai"],
  openrouter: ["openrouter"],
  siliconflow: ["siliconflow-cn"],
  "zai-global-coding": ["zai-coding-plan"],
  "zai-global-general": ["zai"],
  "zhipu-cn-coding": ["zhipuai-coding-plan"],
  "zhipu-cn-general": ["zhipuai"]
};

const presetCatalogModelOverrides: Record<string, { modelDisplayNames?: Record<string, string>; models: string[]; provider?: string; providerName?: string }> = {
  "kimi-coding": {
    modelDisplayNames: {
      "kimi-for-coding": "K2.7 Code"
    },
    models: ["kimi-for-coding"],
    provider: "kimi-for-coding",
    providerName: "Kimi Code"
  }
};

let catalogIndex: CatalogIndex | undefined;

export function getProviderCatalogModels(request: ProviderCatalogModelsRequest): ProviderCatalogModelsResult {
  const index = loadCatalogIndex();
  const modelOverride = providerCatalogModelOverride(request);
  if (modelOverride) {
    return {
      loadedFrom: index.loadedFrom,
      ...modelOverride
    };
  }

  const match = findBestCatalogProviderMatch(index.providers, request);
  if (!match) {
    return {
      loadedFrom: index.loadedFrom,
      models: []
    };
  }

  return {
    loadedFrom: index.loadedFrom,
    matchedBy: match.matchedBy,
    models: match.entry.models,
    provider: match.entry.provider,
    providerName: match.entry.providerName
  };
}

function providerCatalogModelOverride(request: ProviderCatalogModelsRequest): ProviderCatalogModelsResult | undefined {
  const providerPresetId = request.providerPresetId?.trim() || "";
  const providerPresetOverride = presetCatalogModelOverrides[providerPresetId];
  if (providerPresetOverride) {
    return {
      matchedBy: "provider-id",
      modelDisplayNames: providerPresetOverride.modelDisplayNames,
      models: providerPresetOverride.models,
      provider: providerPresetOverride.provider,
      providerName: providerPresetOverride.providerName
    };
  }

  const baseUrlPresetId = request.baseUrl ? findProviderPresetByBaseUrl(request.baseUrl)?.id ?? "" : "";
  const baseUrlOverride = presetCatalogModelOverrides[baseUrlPresetId];
  if (baseUrlOverride) {
    return {
      matchedBy: "base-url",
      modelDisplayNames: baseUrlOverride.modelDisplayNames,
      models: baseUrlOverride.models,
      provider: baseUrlOverride.provider,
      providerName: baseUrlOverride.providerName
    };
  }

  return undefined;
}

function loadCatalogIndex(): CatalogIndex {
  if (catalogIndex) {
    return catalogIndex;
  }

  try {
    const loaded = loadModelCatalogPayload();
    if (loaded) {
      catalogIndex = buildCatalogIndex(loaded.payload, loaded.loadedFrom);
      return catalogIndex;
    }
  } catch (error) {
    console.warn("Failed to load provider model catalog:", error);
  }

  catalogIndex = {
    providers: []
  };
  return catalogIndex;
}

function buildCatalogIndex(payload: unknown, loadedFrom: string): CatalogIndex {
  const providers = new Map<string, MutableCatalogProviderEntry>();
  const models = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];

  for (const item of models) {
    if (!isRecord(item)) {
      continue;
    }

    const sourceRecords = Array.isArray(item.sourceRecords) ? item.sourceRecords : [];
    for (const sourceRecord of sourceRecords) {
      if (!isRecord(sourceRecord)) {
        continue;
      }
      if (!catalogModelCanRouteText(item, sourceRecord)) {
        continue;
      }
      const provider = stringValue(sourceRecord.provider);
      const model = providerModelName(sourceRecord, item);
      if (!provider || !model) {
        continue;
      }

      const entry = providers.get(provider) ?? createMutableCatalogProviderEntry(provider);
      const providerName = stringValue(sourceRecord.providerName);
      const providerApi = stringValue(sourceRecord.providerApi);
      if (!entry.providerName && providerName) {
        entry.providerName = providerName;
      }
      addSetValue(entry.tokens, normalizeProviderToken(provider));
      addSetValue(entry.tokens, normalizeProviderToken(providerName));
      addSetValue(entry.tokens, normalizeProviderToken(providerApiHost(providerApi)));
      addSetValue(entry.apiUrls, normalizeProviderUrl(providerApi));
      if (!entry.modelSet.has(model)) {
        entry.modelSet.add(model);
        entry.models.push(model);
      }
      providers.set(provider, entry);
    }
  }

  return {
    loadedFrom,
    providers: Array.from(providers.values()).map((entry) => ({
      apiUrls: Array.from(entry.apiUrls),
      models: sortCatalogProviderModels(entry.models),
      provider: entry.provider,
      providerName: entry.providerName,
      tokens: Array.from(entry.tokens)
    }))
  };
}

function createMutableCatalogProviderEntry(provider: string): MutableCatalogProviderEntry {
  return {
    apiUrls: new Set(),
    models: [],
    modelSet: new Set(),
    provider,
    tokens: new Set([normalizeProviderToken(provider)])
  };
}

function providerModelName(sourceRecord: Record<string, unknown>, modelEntry: Record<string, unknown>): string {
  return stringValue(sourceRecord.model) ||
    stringValue(sourceRecord.modelKey) ||
    stringValue(modelEntry.model) ||
    stringValue(modelEntry.id);
}

function sortCatalogProviderModels(models: string[]): string[] {
  return models
    .map((model, index) => ({ index, model }))
    .sort((left, right) =>
      catalogProviderModelRank(left.model) - catalogProviderModelRank(right.model) ||
      left.index - right.index
    )
    .map((item) => item.model);
}

function catalogProviderModelRank(model: string): number {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("ft:") || normalized.includes("/ft:")) {
    return 30;
  }
  if (normalized.includes("sonnet")) return 0;
  if (normalized.includes("gpt-5") || normalized.includes("gpt-4o") || normalized.includes("gpt-4.1")) return 0;
  if (/\bo[34]\b/.test(normalized) || /(^|[-_/])o[34]([-_/]|$)/.test(normalized)) return 1;
  if (normalized.includes("opus")) return 1;
  if (normalized.includes("gemini") && normalized.includes("pro")) return 1;
  if (normalized.includes("deepseek-chat") || normalized.includes("kimi-k2") || normalized.includes("qwen3") || normalized.includes("glm-4.5") || normalized.includes("mistral-large")) return 2;
  if (normalized.includes("haiku") || normalized.includes("flash")) return 3;
  if (normalized.includes("mini") || normalized.includes("lite")) return 4;
  return 10;
}

function catalogModelCanRouteText(modelEntry: Record<string, unknown>, sourceRecord: Record<string, unknown>): boolean {
  const mode = (stringValue(sourceRecord.mode) || stringValue(modelEntry.mode)).toLowerCase();
  if (/embedding|image|audio|speech|transcription|moderation|rerank/.test(mode)) {
    return false;
  }

  const modalities = isRecord(modelEntry.modalities) ? modelEntry.modalities : undefined;
  const output = stringListValue(modalities?.output).map((item) => item.toLowerCase());
  return output.length === 0 || output.includes("text");
}

function findBestCatalogProviderMatch(
  providers: CatalogProviderEntry[],
  request: ProviderCatalogModelsRequest
): CatalogMatch | undefined {
  const urlKeys = providerUrlLookupKeys(request.baseUrl);
  const explicitProviderTokens = explicitProviderLookupTokens(request);
  const nameTokens = providerNameLookupTokens(request);
  const matches = providers
    .map((entry) => catalogProviderMatch(entry, urlKeys, explicitProviderTokens, nameTokens))
    .filter((match): match is CatalogMatch => Boolean(match))
    .sort((left, right) =>
      left.score - right.score ||
      right.entry.models.length - left.entry.models.length ||
      left.entry.provider.localeCompare(right.entry.provider)
    );

  return matches[0];
}

function catalogProviderMatch(
  entry: CatalogProviderEntry,
  urlKeys: ProviderUrlKey[],
  explicitProviderTokens: string[],
  nameTokens: string[]
): CatalogMatch | undefined {
  const urlScore = catalogProviderUrlScore(entry, urlKeys);
  const explicitScore = catalogProviderTokenScore(entry, explicitProviderTokens);
  if (urlScore !== undefined) {
    return {
      entry,
      matchedBy: "base-url",
      score: urlScore + (urlScore >= 12 ? explicitScore ?? 8 : 0)
    };
  }

  if (explicitScore !== undefined) {
    return {
      entry,
      matchedBy: "provider-id",
      score: 20 + explicitScore
    };
  }

  const nameScore = catalogProviderTokenScore(entry, nameTokens);
  if (nameScore !== undefined) {
    return {
      entry,
      matchedBy: "provider-name",
      score: 40 + nameScore
    };
  }

  return undefined;
}

function explicitProviderLookupTokens(request: ProviderCatalogModelsRequest): string[] {
  const presetIds = uniqueStrings([
    request.providerPresetId?.trim() || "",
    request.baseUrl ? findProviderPresetByBaseUrl(request.baseUrl)?.id ?? "" : ""
  ]);
  const presetProviderIds = uniqueStrings(presetIds.flatMap((presetId) => presetCatalogProviderIds[presetId] ?? []));
  const presetTokens = presetProviderIds.length > 0 ? presetProviderIds : presetIds.flatMap((presetId) => {
    const preset = findProviderPreset(presetId);
    return [
      presetId,
      preset?.name ?? "",
      ...(preset?.aliases ?? [])
    ];
  });

  return uniqueStrings([
    ...(request.providerIds ?? []),
    ...presetTokens
  ].map(normalizeProviderToken));
}

function providerNameLookupTokens(request: ProviderCatalogModelsRequest): string[] {
  return uniqueStrings([
    request.name ?? "",
    request.baseUrl ? providerApiHost(request.baseUrl) : ""
  ].map(normalizeProviderToken));
}

function catalogProviderUrlScore(entry: CatalogProviderEntry, urlKeys: ProviderUrlKey[]): number | undefined {
  let bestScore: number | undefined;
  for (const apiUrl of entry.apiUrls) {
    const apiKey = providerUrlKey(apiUrl);
    if (!apiKey) {
      continue;
    }
    for (const key of urlKeys) {
      const score = providerUrlMatchScore(apiKey, key);
      if (score === undefined) {
        continue;
      }
      bestScore = bestScore === undefined ? score : Math.min(bestScore, score);
    }
  }
  return bestScore;
}

function catalogProviderTokenScore(entry: CatalogProviderEntry, tokens: string[]): number | undefined {
  let bestScore: number | undefined;
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    for (const entryToken of entry.tokens) {
      if (!entryToken) {
        continue;
      }
      const score = token === entryToken
        ? 0
        : token.length >= 4 && entryToken.includes(token)
          ? 8
          : entryToken.length >= 4 && token.includes(entryToken)
            ? 10
            : undefined;
      if (score === undefined) {
        continue;
      }
      bestScore = bestScore === undefined ? score : Math.min(bestScore, score);
    }
  }
  return bestScore;
}

type ProviderUrlKey = {
  host: string;
  pathname: string;
  protocol: string;
};

function providerUrlLookupKeys(value: string | undefined): ProviderUrlKey[] {
  const normalized = normalizeProviderUrl(value);
  const key = providerUrlKey(normalized);
  if (!key) {
    return [];
  }

  const rootKey = providerUrlRootKey(key);
  return rootKey.host !== key.host || rootKey.pathname !== key.pathname || rootKey.protocol !== key.protocol
    ? [key, rootKey]
    : [key];
}

function providerUrlKey(value: string): ProviderUrlKey | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(providerUrlWithDefaultScheme(value));
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    return {
      host: url.host.toLowerCase(),
      pathname: normalizeProviderPath(url.pathname),
      protocol: url.protocol.toLowerCase()
    };
  } catch {
    return undefined;
  }
}

function providerUrlRootKey(key: ProviderUrlKey): ProviderUrlKey {
  return {
    ...key,
    pathname: key.pathname.replace(/\/(v1|v1beta)$/i, "") || "/"
  };
}

function providerUrlMatchScore(left: ProviderUrlKey, right: ProviderUrlKey): number | undefined {
  if (left.protocol !== right.protocol || left.host !== right.host) {
    return undefined;
  }
  if (left.pathname === right.pathname) {
    return 0;
  }
  if (left.pathname === "/" || right.pathname === "/") {
    return 12;
  }
  if (right.pathname.startsWith(`${left.pathname}/`) || left.pathname.startsWith(`${right.pathname}/`)) {
    return 4;
  }
  return undefined;
}

function normalizeProviderUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(providerUrlWithDefaultScheme(trimmed));
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    url.pathname = normalizeProviderPath(url.pathname);
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function normalizeProviderPath(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}

function providerApiHost(value: string | undefined): string {
  const normalized = normalizeProviderUrl(value);
  if (!normalized) {
    return "";
  }
  try {
    const host = new URL(providerUrlWithDefaultScheme(normalized)).hostname;
    return host.replace(/^api\./i, "");
  } catch {
    return "";
  }
}

function normalizeProviderToken(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "") ?? "";
}

function addSetValue(values: Set<string>, value: string): void {
  if (value) {
    values.add(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringListValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(stringValue).filter(Boolean)
    : [];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
