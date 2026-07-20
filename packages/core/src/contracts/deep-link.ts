import type {
  GatewayProviderProtocol,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountMappedMeterConfig,
  ProviderDeepLinkPayload,
  ProviderDeepLinkRequest,
  ProviderManifestDeepLinkPayload,
  ProviderModelCapabilities,
  ProviderModelMetadata,
  ProviderModelPricing
} from "@ccr/core/contracts/app";
import { providerUrlWithDefaultScheme } from "@ccr/core/providers/url";

export const appDeepLinkProtocol = "ccr";
export const providerDeepLinkHost = "provider";

const maxDeepLinkLength = 32_000;
const maxNameLength = 120;
const maxBaseUrlLength = 2_048;
const maxApiKeyLength = 8_192;
const maxIconLength = 8_192;
const maxManifestUrlLength = 2_048;
const maxSourceLength = 2_048;
const maxModelLength = 256;
const maxModelDescriptionLength = 1_000;
const maxModels = 300;

const providerProtocols = new Set<GatewayProviderProtocol>([
  "anthropic_messages",
  "gemini_generate_content",
  "gemini_interactions",
  "openai_chat_completions",
  "openai_responses"
]);

export function isAppDeepLinkUrl(value: string): boolean {
  return value.trim().toLowerCase().startsWith(`${appDeepLinkProtocol}://`);
}

export function createProviderDeepLinkRequest(rawUrl: string, receivedAt = new Date()): ProviderDeepLinkRequest {
  const id = `${receivedAt.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const manifest = parseProviderManifestDeepLinkPayload(rawUrl);
    if (manifest) {
      return {
        id,
        manifest,
        rawUrl,
        receivedAt: receivedAt.toISOString()
      };
    }

    return {
      id,
      provider: parseProviderDeepLinkPayload(rawUrl),
      rawUrl,
      receivedAt: receivedAt.toISOString()
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      id,
      rawUrl,
      receivedAt: receivedAt.toISOString()
    };
  }
}

export function parseProviderManifestDeepLinkPayload(rawUrl: string): ProviderManifestDeepLinkPayload | undefined {
  const value = rawUrl.trim();
  if (value.length > maxDeepLinkLength) {
    throw new Error("Provider link is too long.");
  }

  const url = new URL(value);
  if (url.protocol !== `${appDeepLinkProtocol}:`) {
    throw new Error("Unsupported link protocol.");
  }

  const host = url.hostname.toLowerCase();
  const firstPathSegment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (host !== providerDeepLinkHost && firstPathSegment !== providerDeepLinkHost) {
    throw new Error("Unsupported CCR link target.");
  }

  const payload = readPayloadRecord(url.searchParams);
  const manifestUrl = boundedString(
    firstStringParam(url.searchParams, ["manifest"]) ??
      firstPayloadString(payload, ["manifest"]),
    maxManifestUrlLength,
    "Manifest URL"
  );
  if (!manifestUrl) {
    return undefined;
  }
  validateManifestUrl(manifestUrl);
  return {
    url: manifestUrl
  };
}

export function parseProviderDeepLinkPayload(rawUrl: string): ProviderDeepLinkPayload {
  const value = rawUrl.trim();
  if (value.length > maxDeepLinkLength) {
    throw new Error("Provider link is too long.");
  }

  const url = new URL(value);
  if (url.protocol !== `${appDeepLinkProtocol}:`) {
    throw new Error("Unsupported link protocol.");
  }

  const host = url.hostname.toLowerCase();
  const firstPathSegment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (host !== providerDeepLinkHost && firstPathSegment !== providerDeepLinkHost) {
    throw new Error("Unsupported CCR link target.");
  }

  const params = url.searchParams;
  const payload = readPayloadRecord(params);
  const name = boundedString(
    firstStringParam(params, ["name"]) ??
      firstPayloadString(payload, ["name"]),
    maxNameLength,
    "Provider name"
  );
  const baseUrl = boundedString(
    firstStringParam(params, ["base_url"]) ??
      firstPayloadString(payload, ["base_url"]),
    maxBaseUrlLength,
    "Base URL"
  );
  if (!baseUrl) {
    throw new Error("Base URL is required.");
  }
  validateProviderBaseUrl(baseUrl);

  const apiKey = boundedString(
    firstStringParam(params, ["api_key"]) ??
      firstPayloadString(payload, ["api_key"]),
    maxApiKeyLength,
    "API key"
  );
  const icon = boundedString(
    firstStringParam(params, ["icon"]) ??
      firstPayloadString(payload, ["icon"]),
    maxIconLength,
    "Provider icon"
  );
  const protocol = normalizeProviderProtocol(
    firstStringParam(params, ["protocol"]) ?? firstPayloadString(payload, ["protocol"])
  );
  const models = readDeepLinkModels(params, payload);
  const modelDescriptions = readDeepLinkModelDescriptions(params, payload, models);
  const modelDisplayNames = readDeepLinkModelDisplayNames(params, payload, models);
  const modelMetadata = readDeepLinkModelMetadata(params, payload, models);
  const account = readDeepLinkAccount(params, payload);
  const source = boundedString(
    firstStringParam(params, ["source"]) ??
      firstPayloadString(payload, ["source"]),
    maxSourceLength,
    "Source URL"
  );
  return {
    ...(account ? { account } : {}),
    ...(apiKey ? { apiKey } : {}),
    baseUrl,
    ...(icon ? { icon } : {}),
    ...(modelDescriptions ? { modelDescriptions } : {}),
    ...(modelDisplayNames ? { modelDisplayNames } : {}),
    ...(modelMetadata ? { modelMetadata } : {}),
    models,
    ...(name ? { name } : {}),
    ...(protocol ? { protocol } : {}),
    ...(source ? { source } : {})
  };
}

export function parseProviderManifestPayload(value: unknown, sourceUrl?: string): ProviderDeepLinkPayload {
  if (!isRecord(value)) {
    throw new Error("Provider manifest must be a JSON object.");
  }
  const providerValue = isRecord(value.provider)
    ? value.provider
    : isRecord(value.ccrProvider)
      ? value.ccrProvider
      : value;
  return parseProviderPayloadFields(new URLSearchParams(), providerValue, sourceUrl);
}

function parseProviderPayloadFields(
  params: URLSearchParams,
  payload: Record<string, unknown> | undefined,
  sourceFallback?: string
): ProviderDeepLinkPayload {
  const name = boundedString(
    firstStringParam(params, ["name"]) ??
      firstPayloadString(payload, ["name"]),
    maxNameLength,
    "Provider name"
  );
  const baseUrl = boundedString(
    firstStringParam(params, ["base_url"]) ??
      firstPayloadString(payload, ["base_url"]),
    maxBaseUrlLength,
    "Base URL"
  );
  if (!baseUrl) {
    throw new Error("Base URL is required.");
  }
  validateProviderBaseUrl(baseUrl);

  const apiKey = boundedString(
    firstStringParam(params, ["api_key"]) ??
      firstPayloadString(payload, ["api_key"]),
    maxApiKeyLength,
    "API key"
  );
  const icon = boundedString(
    firstStringParam(params, ["icon"]) ??
      firstPayloadString(payload, ["icon"]),
    maxIconLength,
    "Provider icon"
  );
  const protocol = normalizeProviderProtocol(
    firstStringParam(params, ["protocol"]) ?? firstPayloadString(payload, ["protocol"])
  );
  const models = readDeepLinkModels(params, payload);
  const modelDescriptions = readDeepLinkModelDescriptions(params, payload, models);
  const modelDisplayNames = readDeepLinkModelDisplayNames(params, payload, models);
  const modelMetadata = readDeepLinkModelMetadata(params, payload, models);
  const account = readDeepLinkAccount(params, payload);
  const source = boundedString(
    firstStringParam(params, ["source"]) ??
      firstPayloadString(payload, ["source"]) ??
      sourceFallback,
    maxSourceLength,
    "Source URL"
  );

  return {
    ...(account ? { account } : {}),
    ...(apiKey ? { apiKey } : {}),
    baseUrl,
    ...(icon ? { icon } : {}),
    ...(modelDescriptions ? { modelDescriptions } : {}),
    ...(modelDisplayNames ? { modelDisplayNames } : {}),
    ...(modelMetadata ? { modelMetadata } : {}),
    models,
    ...(name ? { name } : {}),
    ...(protocol ? { protocol } : {}),
    ...(source ? { source } : {})
  };
}

function readDeepLinkAccount(params: URLSearchParams, payload: Record<string, unknown> | undefined): ProviderAccountConfig | undefined {
  const fetchUsage = readDeepLinkBoolean(params, payload, [
    "fetch_usage"
  ]);
  if (fetchUsage === false) {
    return { enabled: false };
  }

  const payloadAccount = normalizeProviderAccountConfig(payload?.account);
  if (payloadAccount) {
    return payloadAccount;
  }

  const endpoint = boundedString(
    firstStringParam(params, ["usage_url"]) ??
      firstPayloadString(payload, ["usage_url"]),
    maxBaseUrlLength,
    "Usage URL"
  );
  if (!endpoint) {
    return undefined;
  }
  validateProviderBaseUrl(endpoint);

  const method = normalizeUsageMethod(
    firstStringParam(params, ["usage_method"]) ??
      firstPayloadString(payload, ["usage_method"])
  );
  const headers = parseJsonRecordParam(params, payload, ["usage_headers"]);
  const body = parseJsonValueParam(params, payload, ["usage_body"]);
  const balancePath =
    firstStringParam(params, ["balance"]) ??
    firstPayloadString(payload, ["balance"]);
  const subscriptionRemaining =
    firstStringParam(params, ["subscription"]) ??
    firstPayloadString(payload, ["subscription"]);
  const subscriptionLimit =
    firstStringParam(params, ["subscription_limit"]) ??
    firstPayloadString(payload, ["subscription_limit"]);
  const subscriptionReset =
    firstStringParam(params, ["subscription_reset"]) ??
    firstPayloadString(payload, ["subscription_reset"]);

  const meters: ProviderAccountMappedMeterConfig[] = [];
  if (balancePath) {
    meters.push({
      id: "balance",
      kind: "balance",
      label: "Balance",
      remaining: balancePath,
      unit: firstStringParam(params, ["balance_unit"]) ?? firstPayloadString(payload, ["balance_unit"]) ?? "USD"
    });
  }
  if (subscriptionRemaining || subscriptionLimit) {
    meters.push({
      id: "subscription",
      kind: "subscription",
      label: "Subscription",
      limit: subscriptionLimit,
      remaining: subscriptionRemaining,
      resetAt: subscriptionReset,
      unit: firstStringParam(params, ["subscription_unit"]) ?? firstPayloadString(payload, ["subscription_unit"]) ?? "tokens",
      window: firstStringParam(params, ["subscription_window"]) ?? firstPayloadString(payload, ["subscription_window"]) ?? "monthly"
    });
  }

  return {
    connectors: [
      {
        auth: "provider-api-key",
        ...(body !== undefined ? { body } : {}),
        endpoint,
        ...(headers ? { headers } : {}),
        mapping: {
          meters
        },
        method,
        type: "http-json"
      }
    ],
    enabled: true
  };
}

function normalizeProviderAccountConfig(value: unknown): ProviderAccountConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const connectorsValue = value.connectors ?? value.connector;
  const connectors = Array.isArray(connectorsValue)
    ? connectorsValue.filter(isRecord).map((connector) => ({ ...connector }) as ProviderAccountConnectorConfig)
    : isRecord(connectorsValue)
      ? [{ ...connectorsValue } as ProviderAccountConnectorConfig]
      : undefined;
  const refreshIntervalMs = typeof value.refreshIntervalMs === "number" && Number.isFinite(value.refreshIntervalMs)
    ? value.refreshIntervalMs
    : undefined;

  if (typeof value.enabled !== "boolean" && !connectors?.length && !refreshIntervalMs) {
    return undefined;
  }

  return {
    ...(connectors?.length ? { connectors } : {}),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    ...(refreshIntervalMs && refreshIntervalMs > 0 ? { refreshIntervalMs } : {})
  };
}

function normalizeUsageMethod(value: string | undefined): "GET" | "POST" {
  return value?.trim().toUpperCase() === "POST" ? "POST" : "GET";
}

function parseJsonRecordParam(
  params: URLSearchParams,
  payload: Record<string, unknown> | undefined,
  names: string[]
): Record<string, string> | undefined {
  const value = parseJsonValueParam(params, payload, names);
  if (!isRecord(value)) {
    return undefined;
  }
  const record: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.trim() && typeof item === "string") {
      record[key.trim()] = item;
    }
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function parseJsonValueParam(
  params: URLSearchParams,
  payload: Record<string, unknown> | undefined,
  names: string[]
): unknown {
  for (const name of names) {
    const payloadValue = payload?.[name];
    if (payloadValue !== undefined) {
      return payloadValue;
    }
    const paramValue = params.get(name);
    if (typeof paramValue === "string" && paramValue.trim()) {
      try {
        return JSON.parse(paramValue);
      } catch {
        return paramValue;
      }
    }
  }
  return undefined;
}

function readPayloadRecord(params: URLSearchParams): Record<string, unknown> | undefined {
  const value = firstStringParam(params, ["payload"]);
  if (!value) {
    return undefined;
  }

  const jsonText = value.trim().startsWith("{") ? value : decodeBase64Url(value);
  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider payload must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = typeof atob === "function"
    ? atob(padded)
    : Buffer.from(padded, "base64").toString("binary");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function firstStringParam(params: URLSearchParams, names: string[]): string | undefined {
  for (const name of names) {
    const value = params.get(name);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function firstPayloadString(payload: Record<string, unknown> | undefined, names: string[]): string | undefined {
  if (!payload) {
    return undefined;
  }

  for (const name of names) {
    const value = payload[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function boundedString(value: string | undefined, maxLength: number, label: string): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }
  return value;
}

function validateProviderBaseUrl(value: string): void {
  const url = new URL(providerUrlWithDefaultScheme(value));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Provider Base URL must use http or https.");
  }
  if (!url.hostname) {
    throw new Error("Provider Base URL is invalid.");
  }
}

function validateManifestUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Provider manifest URL must use https.");
  }
  if (url.username || url.password) {
    throw new Error("Provider manifest URL cannot include credentials.");
  }
  if (!url.hostname) {
    throw new Error("Provider manifest URL is invalid.");
  }
}

function normalizeProviderProtocol(value: string | undefined): GatewayProviderProtocol | undefined {
  if (!value) {
    return undefined;
  }
  const protocol = value.trim();
  if (!providerProtocols.has(protocol as GatewayProviderProtocol)) {
    throw new Error(`Unsupported provider protocol: ${value}`);
  }
  return protocol as GatewayProviderProtocol;
}

function readDeepLinkModels(params: URLSearchParams, payload: Record<string, unknown> | undefined): string[] {
  const values = [
    ...params.getAll("models"),
    ...payloadModels(payload)
  ];
  const seen = new Set<string>();
  const models: string[] = [];

  for (const value of values) {
    for (const model of splitModelValue(value)) {
      if (model.length > maxModelLength) {
        throw new Error("Model name is too long.");
      }
      if (seen.has(model)) {
        continue;
      }
      seen.add(model);
      models.push(model);
      if (models.length > maxModels) {
        throw new Error("Too many models in provider link.");
      }
    }
  }

  return models;
}

function payloadModels(payload: Record<string, unknown> | undefined): string[] {
  if (!payload) {
    return [];
  }
  const value = payload.models;
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "string" ? item : readPayloadModelId(item))
      .filter((item): item is string => Boolean(item));
  }
  return typeof value === "string" ? [value] : [];
}

function readDeepLinkModelDisplayNames(
  params: URLSearchParams,
  payload: Record<string, unknown> | undefined,
  models: string[]
): Record<string, string> | undefined {
  const modelIds = new Set(models);
  const displayNames: Record<string, string> = {};
  const addDisplayName = (rawModel: unknown, rawDisplayName: unknown) => {
    const model = typeof rawModel === "string" ? rawModel.trim() : "";
    const displayName = typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
    if (!model || !displayName || model === displayName || !modelIds.has(model)) {
      return;
    }
    if (displayName.length > maxModelLength) {
      throw new Error("Model display name is too long.");
    }
    displayNames[model] = displayName;
  };

  const explicit = parseJsonValueParam(params, payload, ["modelDisplayNames", "model_display_names"]);
  if (isRecord(explicit)) {
    for (const [model, displayName] of Object.entries(explicit)) {
      addDisplayName(model, displayName);
    }
  }

  const payloadModelList = Array.isArray(payload?.models) ? payload.models : [];
  for (const item of payloadModelList) {
    if (!isRecord(item)) {
      continue;
    }
    addDisplayName(readPayloadModelId(item), readPayloadModelDisplayName(item));
  }

  return Object.keys(displayNames).length > 0 ? displayNames : undefined;
}

function readDeepLinkModelDescriptions(
  params: URLSearchParams,
  payload: Record<string, unknown> | undefined,
  models: string[]
): Record<string, string> | undefined {
  const modelIds = new Set(models);
  const descriptions: Record<string, string> = {};
  const addDescription = (rawModel: unknown, rawDescription: unknown) => {
    const model = typeof rawModel === "string" ? rawModel.trim() : "";
    const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
    if (!model || !description || !modelIds.has(model)) {
      return;
    }
    if (description.length > maxModelDescriptionLength) {
      throw new Error("Model description is too long.");
    }
    descriptions[model] = description;
  };

  const explicit = parseJsonValueParam(params, payload, ["modelDescriptions", "model_descriptions"]);
  if (isRecord(explicit)) {
    for (const [model, description] of Object.entries(explicit)) {
      addDescription(model, description);
    }
  }

  const payloadModelList = Array.isArray(payload?.models) ? payload.models : [];
  for (const item of payloadModelList) {
    if (!isRecord(item)) {
      continue;
    }
    addDescription(readPayloadModelId(item), firstPayloadString(item, ["description", "desc", "summary"]));
  }

  return Object.keys(descriptions).length > 0 ? descriptions : undefined;
}

function readDeepLinkModelMetadata(
  params: URLSearchParams,
  payload: Record<string, unknown> | undefined,
  models: string[]
): Record<string, ProviderModelMetadata> | undefined {
  const modelIds = new Set(models);
  const metadata: Record<string, ProviderModelMetadata> = {};
  const explicit = parseJsonValueParam(params, payload, ["modelMetadata", "model_metadata"]);
  if (!isRecord(explicit)) {
    return undefined;
  }
  for (const [rawModel, rawMetadata] of Object.entries(explicit)) {
    const model = rawModel.trim();
    if (!model || !modelIds.has(model)) {
      continue;
    }
    const normalized = normalizeDeepLinkModelMetadata(rawMetadata);
    if (normalized) {
      metadata[model] = normalized;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeDeepLinkModelMetadata(value: unknown): ProviderModelMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const capabilities = normalizeDeepLinkModelCapabilities(value.capabilities);
  const contextWindow = positiveInteger(value.contextWindow ?? value.context_window);
  const effectiveContextWindowPercent = percentage(value.effectiveContextWindowPercent ?? value.effective_context_window_percent);
  const maxContextWindow = positiveInteger(value.maxContextWindow ?? value.max_context_window);
  const pricing = normalizeDeepLinkModelPricing(value.pricing);
  const defaultReasoningLevelValue = value.defaultReasoningLevel ?? value.default_reasoning_level;
  const defaultReasoningLevel = defaultReasoningLevelValue === null
    ? null
    : normalizedString(defaultReasoningLevelValue);
  const defaultReasoningSummary = normalizedString(value.defaultReasoningSummary ?? value.default_reasoning_summary);
  const supportedReasoningLevels = normalizeDeepLinkReasoningLevels(value.supportedReasoningLevels ?? value.supported_reasoning_levels);
  const supportsReasoningSummariesValue = value.supportsReasoningSummaries ?? value.supports_reasoning_summaries;
  const metadata: ProviderModelMetadata = {
    ...(Array.isArray(value.additionalSpeedTiers) ? { additionalSpeedTiers: value.additionalSpeedTiers } : {}),
    ...(Array.isArray(value.additional_speed_tiers) ? { additionalSpeedTiers: value.additional_speed_tiers } : {}),
    ...(capabilities ? { capabilities } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(defaultReasoningLevel !== undefined ? { defaultReasoningLevel } : {}),
    ...(defaultReasoningSummary ? { defaultReasoningSummary } : {}),
    ...(effectiveContextWindowPercent ? { effectiveContextWindowPercent } : {}),
    ...(maxContextWindow ? { maxContextWindow } : {}),
    ...(pricing ? { pricing } : {}),
    ...(Array.isArray(value.serviceTiers) ? { serviceTiers: value.serviceTiers } : {}),
    ...(Array.isArray(value.service_tiers) ? { serviceTiers: value.service_tiers } : {}),
    ...(supportedReasoningLevels ? { supportedReasoningLevels } : {}),
    ...(typeof supportsReasoningSummariesValue === "boolean" ? { supportsReasoningSummaries: supportsReasoningSummariesValue } : {})
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeDeepLinkReasoningLevels(value: unknown): ProviderModelMetadata["supportedReasoningLevels"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const levels = value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      const effort = item.trim();
      return [{ description: effort, effort }];
    }
    if (!isRecord(item)) {
      return [];
    }
    const effort = normalizedString(item.effort);
    if (!effort) {
      return [];
    }
    return [{ description: normalizedString(item.description) ?? effort, effort }];
  });
  return levels.length > 0 ? levels : value.length === 0 ? [] : undefined;
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeDeepLinkModelCapabilities(value: unknown): ProviderModelCapabilities | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const capabilities: ProviderModelCapabilities = {};
  const fields: Array<keyof ProviderModelCapabilities> = ["imageInput", "webSearch"];
  for (const field of fields) {
    const snakeCaseField = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const candidate = value[field] ?? value[snakeCaseField];
    if (typeof candidate === "boolean") {
      capabilities[field] = candidate;
    }
  }
  return Object.keys(capabilities).length > 0 ? capabilities : undefined;
}

function normalizeDeepLinkModelPricing(value: unknown): ProviderModelPricing | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const pricing: ProviderModelPricing = {};
  const fields: Array<keyof ProviderModelPricing> = [
    "cacheReadUsdPerMillionTokens",
    "cacheWriteUsdPerMillionTokens",
    "cacheWrite1hUsdPerMillionTokens",
    "cacheWrite5mUsdPerMillionTokens",
    "inputUsdPerMillionTokens",
    "outputUsdPerMillionTokens"
  ];
  for (const field of fields) {
    const snakeCaseField = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const durationSnakeCaseField = snakeCaseField.replace(/([a-z])([0-9])/g, "$1_$2");
    const candidate = nonNegativeNumber(value[field] ?? value[durationSnakeCaseField] ?? value[snakeCaseField]);
    if (candidate !== undefined) {
      pricing[field] = candidate;
    }
  }
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function percentage(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed > 0 && parsed <= 100 ? parsed : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function readPayloadModelId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return firstPayloadString(value, ["id", "slug", "model", "name"]);
}

function readPayloadModelDisplayName(value: Record<string, unknown>): string | undefined {
  return firstPayloadString(value, ["display_name", "displayName", "label", "name"]);
}

function splitModelValue(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readDeepLinkBoolean(params: URLSearchParams, payload: Record<string, unknown> | undefined, names: string[]): boolean {
  for (const name of names) {
    if (!params.has(name)) {
      continue;
    }
    const parsedParam = parseBoolean(params.get(name));
    return parsedParam ?? true;
  }

  if (!payload) {
    return false;
  }
  for (const name of names) {
    const parsedPayload = parseBoolean(payload[name]);
    if (parsedPayload !== undefined) {
      return parsedPayload;
    }
  }
  return false;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
