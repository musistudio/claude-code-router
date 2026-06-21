import type {
  GatewayProviderProtocol,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountMappedMeterConfig,
  ProviderDeepLinkPayload,
  ProviderDeepLinkRequest,
  ProviderManifestDeepLinkPayload
} from "./app";
import { providerUrlWithDefaultScheme } from "./provider-url";

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
const maxModels = 300;
const providerLinkApiKeyError = "Provider links cannot include API keys. Add the key manually after verifying the endpoint.";

const protocolAliases: Record<string, GatewayProviderProtocol> = {
  anthropic: "anthropic_messages",
  anthropic_messages: "anthropic_messages",
  claude: "anthropic_messages",
  gemini: "gemini_generate_content",
  gemini_generate: "gemini_generate_content",
  gemini_generate_content: "gemini_generate_content",
  google: "gemini_generate_content",
  openai: "openai_chat_completions",
  openai_chat: "openai_chat_completions",
  openai_chat_completions: "openai_chat_completions",
  openai_response: "openai_responses",
  openai_responses: "openai_responses",
  responses: "openai_responses"
};

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
    firstStringParam(url.searchParams, ["manifest_url", "manifestUrl", "manifest"]) ??
      firstPayloadString(payload, ["manifest_url", "manifestUrl", "manifest"]),
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
    firstStringParam(params, ["name", "provider_name", "providerName", "title"]) ??
      firstPayloadString(payload, ["name", "provider_name", "providerName", "title"]),
    maxNameLength,
    "Provider name"
  );
  const baseUrl = boundedString(
    firstStringParam(params, ["base_url", "baseUrl", "api_base_url", "apiBaseUrl", "url", "endpoint"]) ??
      firstPayloadString(payload, ["base_url", "baseUrl", "api_base_url", "apiBaseUrl", "url", "endpoint"]),
    maxBaseUrlLength,
    "Base URL"
  );
  if (!baseUrl) {
    throw new Error("Base URL is required.");
  }
  validateProviderBaseUrl(baseUrl);

  const apiKey = boundedString(
    firstStringParam(params, ["api_key", "apiKey", "apikey", "key", "token"]) ??
      firstPayloadString(payload, ["api_key", "apiKey", "apikey", "key", "token"]),
    maxApiKeyLength,
    "API key"
  );
  if (apiKey) {
    throw new Error(providerLinkApiKeyError);
  }
  const icon = boundedString(
    firstStringParam(params, ["icon", "icon_url", "iconUrl"]) ??
      firstPayloadString(payload, ["icon", "icon_url", "iconUrl"]),
    maxIconLength,
    "Provider icon"
  );
  const protocol = normalizeProviderProtocol(
    firstStringParam(params, ["protocol", "type"]) ?? firstPayloadString(payload, ["protocol", "type"])
  );
  const models = readDeepLinkModels(params, payload);
  const setDefault = readDeepLinkBoolean(params, payload, ["set_default", "setDefault", "default", "preferred"]);
  const replaceExisting = readDeepLinkBoolean(params, payload, ["replace", "replace_existing", "replaceExisting", "update"]);
  const account = readDeepLinkAccount(params, payload);
  const source = boundedString(
    firstStringParam(params, ["source", "source_url", "sourceUrl"]) ??
      firstPayloadString(payload, ["source", "source_url", "sourceUrl"]),
    maxSourceLength,
    "Source URL"
  );
  return {
    ...(account ? { account } : {}),
    baseUrl,
    ...(icon ? { icon } : {}),
    models,
    ...(name ? { name } : {}),
    ...(protocol ? { protocol } : {}),
    replaceExisting,
    setDefault,
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
    firstStringParam(params, ["name", "provider_name", "providerName", "title"]) ??
      firstPayloadString(payload, ["name", "provider_name", "providerName", "title"]),
    maxNameLength,
    "Provider name"
  );
  const baseUrl = boundedString(
    firstStringParam(params, ["base_url", "baseUrl", "api_base_url", "apiBaseUrl", "url", "endpoint"]) ??
      firstPayloadString(payload, ["base_url", "baseUrl", "api_base_url", "apiBaseUrl", "url", "endpoint"]),
    maxBaseUrlLength,
    "Base URL"
  );
  if (!baseUrl) {
    throw new Error("Base URL is required.");
  }
  validateProviderBaseUrl(baseUrl);

  const apiKey = boundedString(
    firstStringParam(params, ["api_key", "apiKey", "apikey", "key", "token"]) ??
      firstPayloadString(payload, ["api_key", "apiKey", "apikey", "key", "token"]),
    maxApiKeyLength,
    "API key"
  );
  const icon = boundedString(
    firstStringParam(params, ["icon", "icon_url", "iconUrl"]) ??
      firstPayloadString(payload, ["icon", "icon_url", "iconUrl"]),
    maxIconLength,
    "Provider icon"
  );
  const protocol = normalizeProviderProtocol(
    firstStringParam(params, ["protocol", "type"]) ?? firstPayloadString(payload, ["protocol", "type"])
  );
  const models = readDeepLinkModels(params, payload);
  const setDefault = readDeepLinkBoolean(params, payload, ["set_default", "setDefault", "default", "preferred"]);
  const replaceExisting = readDeepLinkBoolean(params, payload, ["replace", "replace_existing", "replaceExisting", "update"]);
  const account = readDeepLinkAccount(params, payload);
  const source = boundedString(
    firstStringParam(params, ["source", "source_url", "sourceUrl"]) ??
      firstPayloadString(payload, ["source", "source_url", "sourceUrl"]) ??
      sourceFallback,
    maxSourceLength,
    "Source URL"
  );

  return {
    ...(account ? { account } : {}),
    ...(apiKey ? { apiKey } : {}),
    baseUrl,
    ...(icon ? { icon } : {}),
    models,
    ...(name ? { name } : {}),
    ...(protocol ? { protocol } : {}),
    replaceExisting,
    setDefault,
    ...(source ? { source } : {})
  };
}

function readDeepLinkAccount(params: URLSearchParams, payload: Record<string, unknown> | undefined): ProviderAccountConfig | undefined {
  const fetchUsage = readDeepLinkBoolean(params, payload, [
    "fetch_usage",
    "fetchUsage",
    "usage_enabled",
    "usageEnabled",
    "account_enabled",
    "accountEnabled"
  ]);
  if (fetchUsage === false) {
    return { enabled: false };
  }

  const payloadAccount = normalizeProviderAccountConfig(payload?.account ?? payload?.usage);
  if (payloadAccount) {
    return payloadAccount;
  }

  const endpoint = boundedString(
    firstStringParam(params, ["usage_url", "usageUrl", "account_url", "accountUrl"]) ??
      firstPayloadString(payload, ["usage_url", "usageUrl", "account_url", "accountUrl"]),
    maxBaseUrlLength,
    "Usage URL"
  );
  if (!endpoint) {
    return undefined;
  }
  validateProviderBaseUrl(endpoint);

  const method = normalizeUsageMethod(
    firstStringParam(params, ["usage_method", "usageMethod", "account_method", "accountMethod"]) ??
      firstPayloadString(payload, ["usage_method", "usageMethod", "account_method", "accountMethod"])
  );
  const headers = parseJsonRecordParam(params, payload, ["usage_headers", "usageHeaders", "account_headers", "accountHeaders"]);
  const body = parseJsonValueParam(params, payload, ["usage_body", "usageBody", "account_body", "accountBody"]);
  const balancePath =
    firstStringParam(params, ["balance", "balance_remaining", "balanceRemaining"]) ??
    firstPayloadString(payload, ["balance", "balance_remaining", "balanceRemaining"]);
  const subscriptionRemaining =
    firstStringParam(params, ["subscription", "subscription_remaining", "subscriptionRemaining"]) ??
    firstPayloadString(payload, ["subscription", "subscription_remaining", "subscriptionRemaining"]);
  const subscriptionLimit =
    firstStringParam(params, ["subscription_limit", "subscriptionLimit"]) ??
    firstPayloadString(payload, ["subscription_limit", "subscriptionLimit"]);
  const subscriptionReset =
    firstStringParam(params, ["subscription_reset", "subscriptionReset", "reset_at", "resetAt"]) ??
    firstPayloadString(payload, ["subscription_reset", "subscriptionReset", "reset_at", "resetAt"]);

  const meters: ProviderAccountMappedMeterConfig[] = [];
  if (balancePath) {
    meters.push({
      id: "balance",
      kind: "balance",
      label: "Balance",
      remaining: balancePath,
      unit: firstStringParam(params, ["balance_unit", "balanceUnit"]) ?? firstPayloadString(payload, ["balance_unit", "balanceUnit"]) ?? "USD"
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
      unit: firstStringParam(params, ["subscription_unit", "subscriptionUnit"]) ?? firstPayloadString(payload, ["subscription_unit", "subscriptionUnit"]) ?? "tokens",
      window: firstStringParam(params, ["subscription_window", "subscriptionWindow"]) ?? firstPayloadString(payload, ["subscription_window", "subscriptionWindow"]) ?? "monthly"
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
  const value = firstStringParam(params, ["payload", "config", "data"]);
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
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const protocol = protocolAliases[normalized];
  if (!protocol) {
    throw new Error(`Unsupported provider protocol: ${value}`);
  }
  return protocol;
}

function readDeepLinkModels(params: URLSearchParams, payload: Record<string, unknown> | undefined): string[] {
  const values = [
    ...params.getAll("model"),
    ...params.getAll("models"),
    ...params.getAll("models[]"),
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
  const value = payload.models ?? payload.model;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [];
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
