import type { GatewayProviderProtocol, ProviderDeepLinkPayload, ProviderDeepLinkRequest } from "./app";
import { providerUrlWithDefaultScheme } from "./provider-url";

export const appDeepLinkProtocol = "ccr";
export const providerDeepLinkHost = "provider";

const maxDeepLinkLength = 32_000;
const maxNameLength = 120;
const maxBaseUrlLength = 2_048;
const maxApiKeyLength = 8_192;
const maxSourceLength = 2_048;
const maxModelLength = 256;
const maxModels = 300;

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
  const protocol = normalizeProviderProtocol(
    firstStringParam(params, ["protocol", "type"]) ?? firstPayloadString(payload, ["protocol", "type"])
  );
  const models = readDeepLinkModels(params, payload);
  const setDefault = readDeepLinkBoolean(params, payload, ["set_default", "setDefault", "default", "preferred"]);
  const replaceExisting = readDeepLinkBoolean(params, payload, ["replace", "replace_existing", "replaceExisting", "update"]);
  const source = boundedString(
    firstStringParam(params, ["source", "source_url", "sourceUrl"]) ??
      firstPayloadString(payload, ["source", "source_url", "sourceUrl"]),
    maxSourceLength,
    "Source URL"
  );

  return {
    ...(apiKey ? { apiKey } : {}),
    baseUrl,
    models,
    ...(name ? { name } : {}),
    ...(protocol ? { protocol } : {}),
    replaceExisting,
    setDefault,
    ...(source ? { source } : {})
  };
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
  return Buffer.from(padded, "base64").toString("utf8");
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
