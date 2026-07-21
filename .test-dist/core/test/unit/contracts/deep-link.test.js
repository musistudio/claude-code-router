"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/test/unit/contracts/deep-link.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/providers/url.ts
function providerUrlWithDefaultScheme(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(value)) {
    return `http://${value}`;
  }
  return `https://${value}`;
}

// packages/core/src/contracts/deep-link.ts
var appDeepLinkProtocol = "ccr";
var providerDeepLinkHost = "provider";
var maxDeepLinkLength = 32e3;
var maxNameLength = 120;
var maxBaseUrlLength = 2048;
var maxApiKeyLength = 8192;
var maxIconLength = 8192;
var maxManifestUrlLength = 2048;
var maxSourceLength = 2048;
var maxModelLength = 256;
var maxModelDescriptionLength = 1e3;
var maxModels = 300;
var providerProtocols = /* @__PURE__ */ new Set([
  "anthropic_messages",
  "gemini_generate_content",
  "gemini_interactions",
  "openai_chat_completions",
  "openai_responses"
]);
function isAppDeepLinkUrl(value) {
  return value.trim().toLowerCase().startsWith(`${appDeepLinkProtocol}://`);
}
function createProviderDeepLinkRequest(rawUrl, receivedAt = /* @__PURE__ */ new Date()) {
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
function parseProviderManifestDeepLinkPayload(rawUrl) {
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
    firstStringParam(url.searchParams, ["manifest"]) ?? firstPayloadString(payload, ["manifest"]),
    maxManifestUrlLength,
    "Manifest URL"
  );
  if (!manifestUrl) {
    return void 0;
  }
  validateManifestUrl(manifestUrl);
  return {
    url: manifestUrl
  };
}
function parseProviderDeepLinkPayload(rawUrl) {
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
    firstStringParam(params, ["name"]) ?? firstPayloadString(payload, ["name"]),
    maxNameLength,
    "Provider name"
  );
  const baseUrl = boundedString(
    firstStringParam(params, ["base_url"]) ?? firstPayloadString(payload, ["base_url"]),
    maxBaseUrlLength,
    "Base URL"
  );
  if (!baseUrl) {
    throw new Error("Base URL is required.");
  }
  validateProviderBaseUrl(baseUrl);
  const apiKey = boundedString(
    firstStringParam(params, ["api_key"]) ?? firstPayloadString(payload, ["api_key"]),
    maxApiKeyLength,
    "API key"
  );
  const icon = boundedString(
    firstStringParam(params, ["icon"]) ?? firstPayloadString(payload, ["icon"]),
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
    firstStringParam(params, ["source"]) ?? firstPayloadString(payload, ["source"]),
    maxSourceLength,
    "Source URL"
  );
  return {
    ...account ? { account } : {},
    ...apiKey ? { apiKey } : {},
    baseUrl,
    ...icon ? { icon } : {},
    ...modelDescriptions ? { modelDescriptions } : {},
    ...modelDisplayNames ? { modelDisplayNames } : {},
    ...modelMetadata ? { modelMetadata } : {},
    models,
    ...name ? { name } : {},
    ...protocol ? { protocol } : {},
    ...source ? { source } : {}
  };
}
function parseProviderManifestPayload(value, sourceUrl) {
  if (!isRecord(value)) {
    throw new Error("Provider manifest must be a JSON object.");
  }
  const providerValue = isRecord(value.provider) ? value.provider : isRecord(value.ccrProvider) ? value.ccrProvider : value;
  return parseProviderPayloadFields(new URLSearchParams(), providerValue, sourceUrl);
}
function parseProviderPayloadFields(params, payload, sourceFallback) {
  const name = boundedString(
    firstStringParam(params, ["name"]) ?? firstPayloadString(payload, ["name"]),
    maxNameLength,
    "Provider name"
  );
  const baseUrl = boundedString(
    firstStringParam(params, ["base_url"]) ?? firstPayloadString(payload, ["base_url"]),
    maxBaseUrlLength,
    "Base URL"
  );
  if (!baseUrl) {
    throw new Error("Base URL is required.");
  }
  validateProviderBaseUrl(baseUrl);
  const apiKey = boundedString(
    firstStringParam(params, ["api_key"]) ?? firstPayloadString(payload, ["api_key"]),
    maxApiKeyLength,
    "API key"
  );
  const icon = boundedString(
    firstStringParam(params, ["icon"]) ?? firstPayloadString(payload, ["icon"]),
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
    firstStringParam(params, ["source"]) ?? firstPayloadString(payload, ["source"]) ?? sourceFallback,
    maxSourceLength,
    "Source URL"
  );
  return {
    ...account ? { account } : {},
    ...apiKey ? { apiKey } : {},
    baseUrl,
    ...icon ? { icon } : {},
    ...modelDescriptions ? { modelDescriptions } : {},
    ...modelDisplayNames ? { modelDisplayNames } : {},
    ...modelMetadata ? { modelMetadata } : {},
    models,
    ...name ? { name } : {},
    ...protocol ? { protocol } : {},
    ...source ? { source } : {}
  };
}
function readDeepLinkAccount(params, payload) {
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
    firstStringParam(params, ["usage_url"]) ?? firstPayloadString(payload, ["usage_url"]),
    maxBaseUrlLength,
    "Usage URL"
  );
  if (!endpoint) {
    return void 0;
  }
  validateProviderBaseUrl(endpoint);
  const method = normalizeUsageMethod(
    firstStringParam(params, ["usage_method"]) ?? firstPayloadString(payload, ["usage_method"])
  );
  const headers = parseJsonRecordParam(params, payload, ["usage_headers"]);
  const body = parseJsonValueParam(params, payload, ["usage_body"]);
  const balancePath = firstStringParam(params, ["balance"]) ?? firstPayloadString(payload, ["balance"]);
  const subscriptionRemaining = firstStringParam(params, ["subscription"]) ?? firstPayloadString(payload, ["subscription"]);
  const subscriptionLimit = firstStringParam(params, ["subscription_limit"]) ?? firstPayloadString(payload, ["subscription_limit"]);
  const subscriptionReset = firstStringParam(params, ["subscription_reset"]) ?? firstPayloadString(payload, ["subscription_reset"]);
  const meters = [];
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
        ...body !== void 0 ? { body } : {},
        endpoint,
        ...headers ? { headers } : {},
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
function normalizeProviderAccountConfig(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const connectorsValue = value.connectors ?? value.connector;
  const connectors = Array.isArray(connectorsValue) ? connectorsValue.filter(isRecord).map((connector) => ({ ...connector })) : isRecord(connectorsValue) ? [{ ...connectorsValue }] : void 0;
  const refreshIntervalMs = typeof value.refreshIntervalMs === "number" && Number.isFinite(value.refreshIntervalMs) ? value.refreshIntervalMs : void 0;
  if (typeof value.enabled !== "boolean" && !connectors?.length && !refreshIntervalMs) {
    return void 0;
  }
  return {
    ...connectors?.length ? { connectors } : {},
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    ...refreshIntervalMs && refreshIntervalMs > 0 ? { refreshIntervalMs } : {}
  };
}
function normalizeUsageMethod(value) {
  return value?.trim().toUpperCase() === "POST" ? "POST" : "GET";
}
function parseJsonRecordParam(params, payload, names) {
  const value = parseJsonValueParam(params, payload, names);
  if (!isRecord(value)) {
    return void 0;
  }
  const record = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.trim() && typeof item === "string") {
      record[key.trim()] = item;
    }
  }
  return Object.keys(record).length > 0 ? record : void 0;
}
function parseJsonValueParam(params, payload, names) {
  for (const name of names) {
    const payloadValue = payload?.[name];
    if (payloadValue !== void 0) {
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
  return void 0;
}
function readPayloadRecord(params) {
  const value = firstStringParam(params, ["payload"]);
  if (!value) {
    return void 0;
  }
  const jsonText = value.trim().startsWith("{") ? value : decodeBase64Url(value);
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider payload must be a JSON object.");
  }
  return parsed;
}
function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function firstStringParam(params, names) {
  for (const name of names) {
    const value = params.get(name);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return void 0;
}
function firstPayloadString(payload, names) {
  if (!payload) {
    return void 0;
  }
  for (const name of names) {
    const value = payload[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return void 0;
}
function boundedString(value, maxLength, label) {
  if (!value) {
    return void 0;
  }
  if (value.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }
  return value;
}
function validateProviderBaseUrl(value) {
  const url = new URL(providerUrlWithDefaultScheme(value));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Provider Base URL must use http or https.");
  }
  if (!url.hostname) {
    throw new Error("Provider Base URL is invalid.");
  }
}
function validateManifestUrl(value) {
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
function normalizeProviderProtocol(value) {
  if (!value) {
    return void 0;
  }
  const protocol = value.trim();
  if (!providerProtocols.has(protocol)) {
    throw new Error(`Unsupported provider protocol: ${value}`);
  }
  return protocol;
}
function readDeepLinkModels(params, payload) {
  const values = [
    ...params.getAll("models"),
    ...payloadModels(payload)
  ];
  const seen = /* @__PURE__ */ new Set();
  const models = [];
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
function payloadModels(payload) {
  if (!payload) {
    return [];
  }
  const value = payload.models;
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item : readPayloadModelId(item)).filter((item) => Boolean(item));
  }
  return typeof value === "string" ? [value] : [];
}
function readDeepLinkModelDisplayNames(params, payload, models) {
  const modelIds = new Set(models);
  const displayNames = {};
  const addDisplayName = (rawModel, rawDisplayName) => {
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
  return Object.keys(displayNames).length > 0 ? displayNames : void 0;
}
function readDeepLinkModelDescriptions(params, payload, models) {
  const modelIds = new Set(models);
  const descriptions = {};
  const addDescription = (rawModel, rawDescription) => {
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
  return Object.keys(descriptions).length > 0 ? descriptions : void 0;
}
function readDeepLinkModelMetadata(params, payload, models) {
  const modelIds = new Set(models);
  const metadata = {};
  const explicit = parseJsonValueParam(params, payload, ["modelMetadata", "model_metadata"]);
  if (!isRecord(explicit)) {
    return void 0;
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
  return Object.keys(metadata).length > 0 ? metadata : void 0;
}
function normalizeDeepLinkModelMetadata(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const capabilities = normalizeDeepLinkModelCapabilities(value.capabilities);
  const contextWindow = positiveInteger(value.contextWindow ?? value.context_window);
  const effectiveContextWindowPercent = percentage(value.effectiveContextWindowPercent ?? value.effective_context_window_percent);
  const maxContextWindow = positiveInteger(value.maxContextWindow ?? value.max_context_window);
  const pricing = normalizeDeepLinkModelPricing(value.pricing);
  const defaultReasoningLevelValue = value.defaultReasoningLevel ?? value.default_reasoning_level;
  const defaultReasoningLevel = defaultReasoningLevelValue === null ? null : normalizedString(defaultReasoningLevelValue);
  const defaultReasoningSummary = normalizedString(value.defaultReasoningSummary ?? value.default_reasoning_summary);
  const supportedReasoningLevels = normalizeDeepLinkReasoningLevels(value.supportedReasoningLevels ?? value.supported_reasoning_levels);
  const supportsReasoningSummariesValue = value.supportsReasoningSummaries ?? value.supports_reasoning_summaries;
  const metadata = {
    ...Array.isArray(value.additionalSpeedTiers) ? { additionalSpeedTiers: value.additionalSpeedTiers } : {},
    ...Array.isArray(value.additional_speed_tiers) ? { additionalSpeedTiers: value.additional_speed_tiers } : {},
    ...capabilities ? { capabilities } : {},
    ...contextWindow ? { contextWindow } : {},
    ...defaultReasoningLevel !== void 0 ? { defaultReasoningLevel } : {},
    ...defaultReasoningSummary ? { defaultReasoningSummary } : {},
    ...effectiveContextWindowPercent ? { effectiveContextWindowPercent } : {},
    ...maxContextWindow ? { maxContextWindow } : {},
    ...pricing ? { pricing } : {},
    ...Array.isArray(value.serviceTiers) ? { serviceTiers: value.serviceTiers } : {},
    ...Array.isArray(value.service_tiers) ? { serviceTiers: value.service_tiers } : {},
    ...supportedReasoningLevels ? { supportedReasoningLevels } : {},
    ...typeof supportsReasoningSummariesValue === "boolean" ? { supportsReasoningSummaries: supportsReasoningSummariesValue } : {}
  };
  return Object.keys(metadata).length > 0 ? metadata : void 0;
}
function normalizeDeepLinkReasoningLevels(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const levels = value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      const effort2 = item.trim();
      return [{ description: effort2, effort: effort2 }];
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
  return levels.length > 0 ? levels : value.length === 0 ? [] : void 0;
}
function normalizedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function normalizeDeepLinkModelCapabilities(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const capabilities = {};
  const fields = ["imageInput", "webSearch"];
  for (const field of fields) {
    const snakeCaseField = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const candidate = value[field] ?? value[snakeCaseField];
    if (typeof candidate === "boolean") {
      capabilities[field] = candidate;
    }
  }
  return Object.keys(capabilities).length > 0 ? capabilities : void 0;
}
function normalizeDeepLinkModelPricing(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const pricing = {};
  const fields = [
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
    if (candidate !== void 0) {
      pricing[field] = candidate;
    }
  }
  return Object.keys(pricing).length > 0 ? pricing : void 0;
}
function finiteNumber(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : void 0;
}
function nonNegativeNumber(value) {
  const parsed = finiteNumber(value);
  return parsed !== void 0 && parsed >= 0 ? parsed : void 0;
}
function percentage(value) {
  const parsed = finiteNumber(value);
  return parsed !== void 0 && parsed > 0 && parsed <= 100 ? parsed : void 0;
}
function positiveInteger(value) {
  const parsed = finiteNumber(value);
  return parsed !== void 0 && parsed > 0 ? Math.trunc(parsed) : void 0;
}
function readPayloadModelId(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  return firstPayloadString(value, ["id", "slug", "model", "name"]);
}
function readPayloadModelDisplayName(value) {
  return firstPayloadString(value, ["display_name", "displayName", "label", "name"]);
}
function splitModelValue(value) {
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}
function readDeepLinkBoolean(params, payload, names) {
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
    if (parsedPayload !== void 0) {
      return parsedPayload;
    }
  }
  return false;
}
function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return void 0;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/test/unit/contracts/deep-link.test.mjs
function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
(0, import_node_test.default)("parseProviderDeepLinkPayload reads payload JSON, models, descriptions, display names, and usage account mapping", () => {
  const payload = {
    account: {
      connectors: {
        auth: "provider-api-key",
        endpoint: "https://usage.example.com/balance",
        mapping: { meters: [{ id: "balance", kind: "balance", remaining: "$.balance" }] },
        type: "http-json"
      },
      enabled: true,
      refreshIntervalMs: 6e4
    },
    api_key: "sk-test",
    base_url: "https://api.example.com/v1",
    fetch_usage: true,
    model_display_names: {
      "model-a": "Model A"
    },
    model_descriptions: {
      "model-a": "Fast general-purpose model."
    },
    model_metadata: {
      "model-a": {
        capabilities: { image_input: true, web_search: true },
        context_window: 128e3,
        pricing: {
          cache_write_1h_usd_per_million_tokens: 6,
          cache_write_5m_usd_per_million_tokens: 3.75,
          input_usd_per_million_tokens: 2,
          output_usd_per_million_tokens: 8
        },
        supported_reasoning_levels: ["low", "medium", "high", "xhigh", "max", "ultra"],
        supports_reasoning_summaries: true
      },
      "not-installed": { context_window: 1 }
    },
    models: [
      { description: "Best at coding tasks.", displayName: "Model B", id: "model-b" },
      "model-a,model-c"
    ],
    name: "Example AI",
    protocol: "openai_chat_completions",
    source: "https://example.com/install"
  };
  const parsed = parseProviderDeepLinkPayload(`ccr://provider?payload=${base64UrlJson(payload)}`);
  import_strict.default.equal(parsed.name, "Example AI");
  import_strict.default.equal(parsed.baseUrl, "https://api.example.com/v1");
  import_strict.default.equal(parsed.apiKey, "sk-test");
  import_strict.default.equal(parsed.protocol, "openai_chat_completions");
  import_strict.default.deepEqual(parsed.models, ["model-b", "model-a", "model-c"]);
  import_strict.default.deepEqual(parsed.modelDisplayNames, {
    "model-a": "Model A",
    "model-b": "Model B"
  });
  import_strict.default.deepEqual(parsed.modelDescriptions, {
    "model-a": "Fast general-purpose model.",
    "model-b": "Best at coding tasks."
  });
  import_strict.default.deepEqual(parsed.modelMetadata, {
    "model-a": {
      capabilities: { imageInput: true, webSearch: true },
      contextWindow: 128e3,
      pricing: {
        cacheWrite1hUsdPerMillionTokens: 6,
        cacheWrite5mUsdPerMillionTokens: 3.75,
        inputUsdPerMillionTokens: 2,
        outputUsdPerMillionTokens: 8
      },
      supportedReasoningLevels: [
        { description: "low", effort: "low" },
        { description: "medium", effort: "medium" },
        { description: "high", effort: "high" },
        { description: "xhigh", effort: "xhigh" },
        { description: "max", effort: "max" },
        { description: "ultra", effort: "ultra" }
      ],
      supportsReasoningSummaries: true
    }
  });
  import_strict.default.equal(parsed.account?.enabled, true);
  import_strict.default.equal(parsed.account?.refreshIntervalMs, 6e4);
  import_strict.default.equal(parsed.account?.connectors?.[0]?.type, "http-json");
});
(0, import_node_test.default)("parseProviderDeepLinkPayload builds usage account config from query params", () => {
  const usageHeaders = encodeURIComponent(JSON.stringify({ "x-usage": "yes", ignored: 123 }));
  const parsed = parseProviderDeepLinkPayload(
    [
      "ccr://provider?name=Query%20AI",
      "base_url=https%3A%2F%2Fapi.example.com%2Fv1",
      "models=model-a%2Cmodel-b",
      "models=model-b%0Amodel-c",
      "fetch_usage=true",
      "usage_url=https%3A%2F%2Fusage.example.com%2Fme",
      "usage_method=post",
      `usage_headers=${usageHeaders}`,
      "balance=%24.balance.remaining",
      "balance_unit=CNY",
      "subscription=%24.quota.remaining",
      "subscription_limit=%24.quota.limit"
    ].join("&")
  );
  import_strict.default.deepEqual(parsed.models, ["model-a", "model-b", "model-c"]);
  const connector = parsed.account?.connectors?.[0];
  import_strict.default.equal(connector?.type, "http-json");
  import_strict.default.equal(connector?.method, "POST");
  import_strict.default.deepEqual(connector?.headers, { "x-usage": "yes" });
  import_strict.default.equal(connector?.mapping.meters.length, 2);
  import_strict.default.equal(connector?.mapping.meters[0].unit, "CNY");
});
(0, import_node_test.default)("provider deeplink manifest parsing accepts only HTTPS manifest URLs", () => {
  import_strict.default.equal(isAppDeepLinkUrl(" ccr://provider?base_url=https://api.example.com "), true);
  import_strict.default.deepEqual(
    parseProviderManifestDeepLinkPayload("ccr://provider?manifest=https%3A%2F%2Fexample.com%2Fccr.json"),
    { url: "https://example.com/ccr.json" }
  );
  import_strict.default.throws(
    () => parseProviderManifestDeepLinkPayload("ccr://provider?manifest=http%3A%2F%2Fexample.com%2Fccr.json"),
    /must use https/
  );
});
(0, import_node_test.default)("createProviderDeepLinkRequest captures parsing errors without throwing", () => {
  const request = createProviderDeepLinkRequest("https://example.com/not-ccr", /* @__PURE__ */ new Date("2026-06-30T00:00:00.000Z"));
  import_strict.default.equal(request.rawUrl, "https://example.com/not-ccr");
  import_strict.default.equal(request.receivedAt, "2026-06-30T00:00:00.000Z");
  import_strict.default.match(request.error ?? "", /Unsupported link protocol/);
});
(0, import_node_test.default)("parseProviderManifestPayload accepts provider wrappers and source fallback", () => {
  const parsed = parseProviderManifestPayload(
    {
      provider: {
        base_url: "https://api.example.com/v1",
        models: [{ display_name: "Display Model", id: "display-model" }],
        name: "Manifest AI"
      }
    },
    "https://example.com/manifest.json"
  );
  import_strict.default.equal(parsed.name, "Manifest AI");
  import_strict.default.equal(parsed.source, "https://example.com/manifest.json");
  import_strict.default.deepEqual(parsed.models, ["display-model"]);
  import_strict.default.deepEqual(parsed.modelDisplayNames, { "display-model": "Display Model" });
});
