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

// packages/core/test/unit/agents/claude-app-gateway-models.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/contracts/app.ts
function isGatewayProviderEnabled(provider) {
  return provider.enabled !== false;
}
var ROUTER_SCRIPT_MAX_SOURCE_BYTES = 64 * 1024;
var CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV = "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY";
var CLAUDE_CODE_DEFAULT_ENV = {
  [CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV]: "1"
};
function availableGatewayModelIds(config) {
  const baseEntries = availableGatewayBaseModelEntries(config.Providers);
  const ids = baseEntries.map((entry) => `${entry.providerName}/${entry.modelName}`);
  for (const profile of config.virtualModelProfiles ?? []) {
    if (!isGatewayModelVisibleVirtualProfile(profile)) {
      continue;
    }
    for (const entry of baseEntries) {
      for (const prefix of profile.match?.prefixes ?? []) {
        const normalizedPrefix = prefix.trim();
        if (normalizedPrefix) {
          ids.push(`${entry.providerName}/${normalizedPrefix}${entry.modelName}`);
        }
      }
      for (const suffix of profile.match?.suffixes ?? []) {
        const normalizedSuffix = suffix.trim();
        if (normalizedSuffix) {
          ids.push(`${entry.providerName}/${entry.modelName}${normalizedSuffix}`);
        }
      }
    }
    for (const alias of profile.match?.exactAliases ?? []) {
      const normalizedAlias = alias.trim();
      if (normalizedAlias && baseEntries.length > 0) {
        ids.push(normalizedAlias.toLowerCase().startsWith("fusion/") ? normalizedAlias : `Fusion/${normalizedAlias}`);
      }
    }
  }
  return uniqueGatewayModelIds(ids);
}
function availableGatewayBaseModelEntries(providers) {
  return providers.flatMap((provider) => {
    const providerName = provider.name?.trim();
    if (!isGatewayProviderEnabled(provider) || !providerName || !Array.isArray(provider.models)) {
      return [];
    }
    return provider.models.flatMap((rawModel) => {
      const modelName = rawModel.trim();
      return modelName ? [{ modelName, providerName }] : [];
    });
  });
}
function isGatewayModelVisibleVirtualProfile(profile) {
  return profile.enabled !== false && profile.materialization?.enabled !== false && profile.materialization?.includeInGatewayModels !== false;
}
function uniqueGatewayModelIds(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
var DEFAULT_TRAY_COMPONENT_VARIANTS = {
  account: "bar",
  modelShare: "bars",
  rings: "rings",
  stats: "cards",
  tokenFlow: "line",
  tokenMix: "bars"
};
var TRAY_WINDOW_MODULE_IDS = [
  "source-tabs",
  "header",
  "account",
  "token-flow",
  "activity",
  "stats",
  "token-mix",
  "rings",
  "model-share",
  "footer"
];
var DEFAULT_TRAY_WINDOW_MODULES = [...TRAY_WINDOW_MODULE_IDS];
var DEFAULT_TRAY_WIDGETS = [
  { id: "source-tabs", type: "source-tabs" },
  { id: "header", type: "header" },
  { id: "account", type: "account", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.account },
  { id: "token-flow", type: "token-flow", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow },
  { id: "activity", type: "activity" },
  { id: "stats", type: "stats", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.stats },
  { id: "token-mix", type: "token-mix", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix },
  { id: "rings", type: "rings", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.rings },
  { id: "model-share", type: "model-share", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare }
];
function normalizeProfileScopeValue(value) {
  return value === "ccr" || value === "custom" ? value : "global";
}

// packages/core/src/routing/model-registry.ts
var import_node_crypto = require("node:crypto");
var ModelRegistry = class {
  constructor(config) {
    this.config = config;
    this.gatewayModels = new Map(
      availableGatewayModelIds(config).map((model) => [model.toLowerCase(), model])
    );
  }
  config;
  gatewayModels;
  resolve(value, options = {}) {
    const normalized = normalizeRouteSelector(value);
    if (!normalized) {
      return void 0;
    }
    const parsed = parseProviderModelSelector(normalized);
    if (parsed) {
      const provider = this.findProvider(parsed.provider);
      const model = provider ? configuredProviderModel(provider, parsed.model) : void 0;
      if (provider && model) {
        return providerModelRef(provider, model, normalized);
      }
    }
    const gatewayModel = this.gatewayModels.get(normalized.toLowerCase());
    if (gatewayModel) {
      return {
        canonicalSelector: gatewayModel,
        kind: "gateway",
        model: gatewayModel,
        selector: gatewayModel
      };
    }
    if (options.providerName) {
      const provider = this.findProvider(options.providerName);
      const model = provider ? configuredProviderModel(provider, normalized) : void 0;
      if (provider && model) {
        return providerModelRef(provider, model, normalized);
      }
    }
    const exactMatches = this.providerModelMatches(normalized, false);
    if (exactMatches.length === 1) {
      return providerModelRef(exactMatches[0].provider, exactMatches[0].model, normalized);
    }
    if (exactMatches.length > 1) {
      return void 0;
    }
    const caseInsensitiveMatches = this.providerModelMatches(normalized, true);
    return caseInsensitiveMatches.length === 1 ? providerModelRef(caseInsensitiveMatches[0].provider, caseInsensitiveMatches[0].model, normalized) : void 0;
  }
  isConfigured(value, options = {}) {
    return Boolean(this.resolve(value, options));
  }
  findProvider(value) {
    const normalized = providerSelectorBase(value).toLowerCase();
    if (!normalized) {
      return void 0;
    }
    return this.config.Providers.find(
      (provider) => isGatewayProviderEnabled(provider) && providerAliases(provider).has(normalized)
    );
  }
  resolveProviderModel(value) {
    const resolved = this.resolve(value);
    return resolved?.kind === "provider" ? { model: resolved.model, provider: resolved.provider } : void 0;
  }
  resolveUniqueProviderModel(value) {
    const normalized = normalizeRouteSelector(value);
    if (!normalized || parseProviderModelSelector(normalized)) {
      return void 0;
    }
    const resolved = this.resolve(normalized);
    return resolved?.kind === "provider" ? { model: resolved.model, provider: resolved.provider } : void 0;
  }
  providerModelMatches(model, caseInsensitive) {
    const normalized = caseInsensitive ? model.toLowerCase() : model;
    const matches = [];
    for (const provider of this.config.Providers) {
      if (!isGatewayProviderEnabled(provider)) {
        continue;
      }
      for (const candidate of provider.models) {
        const configured = candidate.trim();
        const comparable = caseInsensitive ? configured.toLowerCase() : configured;
        if (configured && comparable === normalized) {
          matches.push({ model: configured, provider });
        }
      }
    }
    return matches;
  }
};
var registryCache = /* @__PURE__ */ new WeakMap();
function modelRegistryForConfig(config) {
  const key = config;
  const cached = registryCache.get(key);
  if (cached) {
    return cached;
  }
  const registry = new ModelRegistry(config);
  registryCache.set(key, registry);
  return registry;
}
function normalizeRouteSelector(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return void 0;
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : void 0;
  }
  return trimmed;
}
function parseProviderModelSelector(value) {
  const normalized = normalizeRouteSelector(value);
  if (!normalized) {
    return void 0;
  }
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return void 0;
  }
  const provider = normalized.slice(0, separator).trim();
  const model = normalized.slice(separator + 1).trim();
  return provider && model ? { model, provider } : void 0;
}
function providerRuntimeId(provider) {
  const explicit = sanitizeProviderHeaderId(provider.id);
  if (explicit) {
    return explicit;
  }
  const normalized = provider.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const hash = (0, import_node_crypto.createHash)("sha256").update(`${provider.name}
${providerBaseUrl(provider) ?? ""}`).digest("hex").slice(0, 10);
  return `provider-${normalized || "provider"}-${hash}`;
}
function providerModelRef(provider, model, selector) {
  return {
    canonicalSelector: `${provider.name}/${model}`,
    kind: "provider",
    model,
    provider,
    selector
  };
}
function configuredProviderModel(provider, model) {
  const normalized = model.trim().toLowerCase();
  return provider.models.find((candidate) => candidate.trim().toLowerCase() === normalized)?.trim();
}
function providerAliases(provider) {
  return new Set(
    [provider.name, provider.id, provider.provider, providerRuntimeId(provider)].map((value) => value?.trim().toLowerCase()).filter((value) => Boolean(value))
  );
}
function providerSelectorBase(value) {
  const normalized = value?.trim() ?? "";
  const separator = normalized.indexOf("::");
  if (separator < 0) {
    return normalized;
  }
  const provider = normalized.slice(0, separator).trim();
  const suffix = normalized.slice(separator + 2).trim();
  return provider && isKnownProviderInternalSuffix(suffix) ? provider : normalized;
}
function providerBaseUrl(provider) {
  return provider.baseurl || provider.baseUrl || provider.api_base_url;
}
function isKnownProviderInternalSuffix(value) {
  const credentialMarker = "::cred:";
  const credentialIndex = value.indexOf(credentialMarker);
  const hasCredential = credentialIndex >= 0;
  if (hasCredential && !value.slice(credentialIndex + credentialMarker.length).trim()) {
    return false;
  }
  const protocol = hasCredential ? value.slice(0, credentialIndex) : value;
  return providerInternalProtocols.has(protocol);
}
var providerInternalProtocols = /* @__PURE__ */ new Set([
  "anthropic_messages",
  "gemini_generate_content",
  "gemini_interactions",
  "openai_chat_completions",
  "openai_image_generations",
  "openai_responses",
  "openai_video_generations",
  "xai_video_generations"
]);
function sanitizeProviderHeaderId(value) {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || void 0;
}

// packages/core/src/agents/claude-app/gateway-routes.ts
var CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX = "[1m]";
var CLAUDE_APP_ENCODED_ROUTE_PREFIX = "anthropic/claude-ccr-h";
function inferClaudeAppGatewayTargetModel(config) {
  const profileModel = inferGlobalClaudeProfileModel(config);
  const resolvedProfileModel = profileModel ? canonicalClaudeAppGatewayTargetModel(profileModel, config) : void 0;
  return resolvedProfileModel ?? availableGatewayModelIds(config)[0];
}
function buildClaudeAppGatewayModelRoutes(config, options = {}) {
  const targetModels = claudeAppGatewayTargetModels(config);
  const displayNames = claudeAppGatewayDisplayNames(targetModels, options);
  const configuredTargetKeys = new Set(targetModels.map(
    (model) => stripClaudeAppGatewayOneMillionContextSuffix(model).toLowerCase()
  ));
  const usedRouteIds = /* @__PURE__ */ new Set();
  const seenTargets = /* @__PURE__ */ new Set();
  return targetModels.flatMap((rawTargetModel, index) => {
    const targetModel = stripClaudeAppGatewayOneMillionContextSuffix(rawTargetModel);
    const oneMillionContext = claudeAppGatewaySupportsOneMillionContext(rawTargetModel, config, options);
    const targetKey = `${targetModel.toLowerCase()}::${oneMillionContext ? "1m" : "base"}`;
    if (seenTargets.has(targetKey)) {
      return [];
    }
    seenTargets.add(targetKey);
    const routeId = claudeAppGatewayRouteId(targetModel, usedRouteIds, configuredTargetKeys);
    if (!routeId) {
      return [];
    }
    const legacyIds = uniqueStrings([
      claudeAppGatewayGeneratedRouteId(rawTargetModel),
      rawTargetModel === targetModel ? "" : claudeAppGatewayGeneratedRouteId(targetModel),
      targetModel
    ]).filter((id) => id.toLowerCase() !== routeId.toLowerCase());
    return [{
      displayName: displayNames[index],
      id: routeId,
      legacyId: legacyIds[0],
      legacyIds,
      oneMillionContext,
      targetModel
    }];
  });
}
function resolveClaudeAppGatewayRouteModel(model, config, options = {}) {
  const normalized = model.trim().toLowerCase();
  const decodedRouteModel = decodeClaudeAppGatewayRouteId(normalized);
  if (decodedRouteModel) {
    const decodedTarget = claudeAppGatewayTargetModels(config).find(
      (targetModel) => stripClaudeAppGatewayOneMillionContextSuffix(targetModel).toLowerCase() === decodedRouteModel.toLowerCase()
    );
    if (decodedTarget) {
      return stripClaudeAppGatewayOneMillionContextSuffix(decodedTarget);
    }
  }
  return buildClaudeAppGatewayModelRoutes(config, options).find((route) => {
    const normalizedBase = stripClaudeAppGatewayOneMillionContextSuffix(normalized).toLowerCase();
    return claudeAppGatewayRouteMatchIds(route).some((id) => {
      const routeId = id.toLowerCase();
      const routeBaseId = stripClaudeAppGatewayOneMillionContextSuffix(routeId).toLowerCase();
      return routeId === normalized || routeBaseId === normalizedBase;
    });
  })?.targetModel;
}
function buildClaudeAppGatewayInferenceModels(config, options = {}) {
  const routes = buildClaudeAppGatewayModelRoutes(config, options);
  return routes.map((route) => ({
    labelOverride: route.displayName,
    name: route.id,
    ...route.oneMillionContext ? { supports1m: true } : {}
  }));
}
function hasClaudeAppGatewayOneMillionContextSuffix(id) {
  return id.trim().toLowerCase().endsWith(CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX);
}
function stripClaudeAppGatewayOneMillionContextSuffix(id) {
  return id.trim().replace(/\[1m\]$/i, "").trim();
}
function inferGlobalClaudeProfileModel(config) {
  return config.profile.profiles.find(
    (profile) => profile.enabled && profile.agent === "claude-code" && normalizeProfileScopeValue(profile.scope) === "global" && profile.model.trim()
  )?.model.trim() ?? "";
}
function claudeAppGatewayTargetModels(config) {
  const defaultTargetModel = inferClaudeAppGatewayTargetModel(config);
  return uniqueStrings([
    ...defaultTargetModel ? [defaultTargetModel] : [],
    ...availableGatewayModelIds(config)
  ]);
}
function canonicalClaudeAppGatewayTargetModel(model, config) {
  const oneMillionContext = hasClaudeAppGatewayOneMillionContextSuffix(model);
  const resolved = modelRegistryForConfig(config).resolve(stripClaudeAppGatewayOneMillionContextSuffix(model));
  if (!resolved) {
    return void 0;
  }
  return oneMillionContext ? `${resolved.canonicalSelector}${CLAUDE_APP_ONE_MILLION_CONTEXT_SUFFIX}` : resolved.canonicalSelector;
}
function claudeAppGatewaySupportsOneMillionContext(model, config, options) {
  const baseModel = stripClaudeAppGatewayOneMillionContextSuffix(model);
  if (hasClaudeAppGatewayOneMillionContextSuffix(model)) {
    return true;
  }
  const providerOverride = claudeAppGatewayProviderSupportsOneMillionContext(baseModel, config);
  return providerOverride ?? Boolean(options.supportsOneMillionContext?.(baseModel));
}
function claudeAppGatewayProviderSupportsOneMillionContext(model, config) {
  const resolved = modelRegistryForConfig(config).resolveProviderModel(model);
  if (!resolved) {
    return void 0;
  }
  const normalizedModel = resolved.model.trim().toLowerCase();
  const metadata = resolved.provider.modelMetadata?.[resolved.model] ?? Object.entries(resolved.provider.modelMetadata ?? {}).find(([candidate]) => candidate.trim().toLowerCase() === normalizedModel)?.[1];
  const contextWindow = positiveInteger(metadata?.contextWindow) ?? positiveInteger(metadata?.maxContextWindow);
  if (!contextWindow) {
    return void 0;
  }
  const effectivePercent = percentage(metadata?.effectiveContextWindowPercent) ?? 100;
  return Math.floor(contextWindow * effectivePercent / 100) >= 1e6;
}
function positiveInteger(value) {
  return value !== void 0 && Number.isFinite(value) && value > 0 ? Math.trunc(value) : void 0;
}
function percentage(value) {
  return value !== void 0 && Number.isFinite(value) && value > 0 && value <= 100 ? value : void 0;
}
function claudeAppGatewayRouteId(model, usedRouteIds, configuredTargetKeys) {
  const targetModel = stripClaudeAppGatewayOneMillionContextSuffix(model);
  const candidates = [claudeAppGatewayNativeRouteId(targetModel), claudeAppGatewayEncodedRouteId(targetModel)];
  for (const candidate of candidates) {
    const claimed = claimClaudeAppGatewayRouteId(candidate, usedRouteIds, configuredTargetKeys, targetModel);
    if (claimed) {
      return claimed;
    }
  }
  for (let index = 2; index < 100; index += 1) {
    const claimed = claimClaudeAppGatewayRouteId(
      claudeAppGatewayEncodedRouteId(targetModel, index),
      usedRouteIds,
      configuredTargetKeys,
      targetModel
    );
    if (claimed) {
      return claimed;
    }
  }
  return void 0;
}
function claudeAppGatewayGeneratedRouteId(model) {
  const normalized = model.trim();
  return normalized.toLowerCase().startsWith("claude-") ? normalized : `claude-${normalized}`;
}
function claudeAppGatewayNativeRouteId(model) {
  const normalized = stripClaudeAppGatewayOneMillionContextSuffix(model);
  const lower = normalized.toLowerCase();
  if (!normalized.includes("/") && claudeAppGatewayNativeModelNameIsSafe(lower)) {
    return normalized;
  }
  if (lower.startsWith("anthropic/")) {
    const anthropicModel = normalized.slice("anthropic/".length);
    return claudeAppGatewayNativeModelNameIsSafe(anthropicModel.toLowerCase()) ? normalized : void 0;
  }
  return void 0;
}
function claudeAppGatewayNativeModelNameIsSafe(model) {
  return /^claude-(?:3(?:-[57])?-(?:haiku|sonnet|opus)|(?:haiku|sonnet|opus|fable)(?:[-.:@0-9a-z]+)?|code(?:[-.:@0-9a-z]+)?)$/i.test(model);
}
function claudeAppGatewayEncodedRouteId(model, variant) {
  const routePrefix = variant && variant > 1 ? `anthropic/claude-ccr${variant}-h` : CLAUDE_APP_ENCODED_ROUTE_PREFIX;
  return `${routePrefix}${encodeClaudeAppGatewayRouteModel(model)}`;
}
function encodeClaudeAppGatewayRouteModel(model) {
  return Buffer.from(stripClaudeAppGatewayOneMillionContextSuffix(model), "utf8").toString("hex");
}
function decodeClaudeAppGatewayRouteId(routeId) {
  const normalized = stripClaudeAppGatewayOneMillionContextSuffix(routeId).toLowerCase();
  const match = /^anthropic\/claude-ccr(?:\d+)?-h([0-9a-f]+)$/.exec(normalized);
  const encoded = match?.[1];
  if (!encoded || encoded.length % 2 !== 0) {
    return void 0;
  }
  try {
    const decoded = Buffer.from(encoded, "hex").toString("utf8").trim();
    return decoded || void 0;
  } catch {
    return void 0;
  }
}
function claimClaudeAppGatewayRouteId(routeId, usedRouteIds, configuredTargetKeys, targetModel) {
  const normalized = routeId ? stripClaudeAppGatewayOneMillionContextSuffix(routeId) : "";
  if (!normalized) {
    return void 0;
  }
  const key = normalized.toLowerCase();
  const targetKey = stripClaudeAppGatewayOneMillionContextSuffix(targetModel).toLowerCase();
  if (usedRouteIds.has(key) || configuredTargetKeys.has(key) && key !== targetKey) {
    return void 0;
  }
  usedRouteIds.add(key);
  return normalized;
}
function claudeAppGatewayRouteMatchIds(route) {
  return uniqueStrings([route.id, route.legacyId, ...route.legacyIds ?? []]);
}
function claudeAppGatewayDisplayNames(models, options) {
  const baseNames = models.map((model) => {
    const targetModel = stripClaudeAppGatewayOneMillionContextSuffix(model);
    return claudeAppGatewayDisplayNameWithProvider(
      targetModel,
      options.displayName?.(targetModel) ?? claudeAppGatewayBaseDisplayName(targetModel)
    );
  });
  const counts = /* @__PURE__ */ new Map();
  for (const baseName of baseNames) {
    const key = baseName.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateIndexes = /* @__PURE__ */ new Map();
  return models.map((_model, index) => {
    const baseName = baseNames[index];
    const key = baseName.toLowerCase();
    if (counts.get(key) === 1) {
      return baseName;
    }
    const duplicateIndex = (duplicateIndexes.get(key) ?? 0) + 1;
    duplicateIndexes.set(key, duplicateIndex);
    return `${baseName} #${duplicateIndex}`;
  });
}
function claudeAppGatewayBaseDisplayName(model) {
  const trimmed = model.trim();
  return trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
}
function claudeAppGatewayDisplayNameWithProvider(model, displayName) {
  const trimmed = model.trim();
  const separator = trimmed.indexOf("/");
  if (separator <= 0 || separator >= trimmed.length - 1) {
    return displayName;
  }
  const provider = trimmed.slice(0, separator).trim();
  if (!provider || displayName.toLowerCase().startsWith(`${provider.toLowerCase()}/`)) {
    return displayName;
  }
  return `${provider}/${displayName}`;
}
function uniqueStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    const normalized = value?.trim() ?? "";
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

// packages/core/src/models/catalog-file.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
function loadModelCatalogPayload() {
  const candidate = resolveModelCatalogPath();
  return candidate ? {
    loadedFrom: candidate,
    payload: JSON.parse((0, import_node_fs.readFileSync)(candidate, "utf8"))
  } : void 0;
}
function resolveModelCatalogPath() {
  return modelCatalogPathCandidates().find((candidate) => (0, import_node_fs.existsSync)(candidate));
}
function modelCatalogPathCandidates() {
  return uniqueStrings2([
    process.env.CCR_MODEL_CATALOG_PATH?.trim() || "",
    process.env.CCR_MODELS_JSON_PATH?.trim() || "",
    (0, import_node_path.resolve)(process.cwd(), "models.json"),
    (0, import_node_path.resolve)(process.cwd(), "packages", "core", "models.json"),
    (0, import_node_path.resolve)(process.cwd(), "packages", "cli", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "assets", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "..", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "..", "..", "models.json")
  ]);
}
function uniqueStrings2(values) {
  const seen = /* @__PURE__ */ new Set();
  const strings = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    strings.push(trimmed);
  }
  return strings;
}

// packages/core/src/gateway/model-catalog.ts
var modelCatalogIndex;
function findModelCatalogEntry(model) {
  const index = loadModelCatalogIndex();
  const candidates = modelCatalogLookupKeys(model);
  for (const key of candidates) {
    const entry = index.byKey.get(key);
    if (entry) {
      return entry;
    }
  }
  for (const key of candidates) {
    const modelKey = modelCatalogLastSegmentKey(key);
    if (!modelKey) {
      continue;
    }
    const entry = index.byModelKey.get(modelKey);
    if (entry) {
      return entry;
    }
  }
  return fallbackModelCatalogEntry(model);
}
function fallbackModelCatalogEntry(model) {
  const modelName = modelCatalogLastSegmentKey(normalizeModelCatalogKey(model));
  if (!/^gpt-5\.6(?:-(?:sol|terra|luna)(?:-\d{4}-\d{2}-\d{2})?)?$/.test(modelName)) {
    return void 0;
  }
  return {
    aliases: uniqueStrings3([modelName, `openai/${modelName}`]),
    capabilities: {
      functionCalling: true,
      imageInput: true,
      lowReasoningEffort: true,
      maxReasoningEffort: true,
      noneReasoningEffort: true,
      parallelFunctionCalling: true,
      reasoning: true,
      responseSchema: true,
      structuredOutput: true,
      supports1MContext: true,
      toolCalling: true,
      ultraReasoningEffort: !/^gpt-5\.6-luna(?:-|$)/.test(modelName),
      vision: true,
      webSearch: true,
      xhighReasoningEffort: true
    },
    displayName: gpt56DisplayName(modelName),
    family: "gpt",
    id: `openai/${modelName}`,
    limits: {
      contextTokens: 105e4,
      inputTokens: 105e4,
      maxTokens: 128e3,
      outputTokens: 128e3,
      supports1MContext: true
    },
    modalities: {
      input: ["image", "text"],
      output: ["text"]
    },
    model: modelName,
    providers: ["openai"]
  };
}
function gpt56DisplayName(modelName) {
  const tier = modelName.match(/^gpt-5\.6-(sol|terra|luna)/)?.[1] ?? "sol";
  return `GPT-5.6 ${tier.slice(0, 1).toUpperCase()}${tier.slice(1)}`;
}
function modelCatalogMaxInputTokens(entry) {
  return Math.max(
    0,
    entry?.limits?.contextTokens ?? 0,
    entry?.limits?.inputTokens ?? 0
  );
}
function modelCatalogMaxOutputTokens(entry) {
  return Math.max(
    0,
    entry?.limits?.outputTokens ?? 0,
    entry?.limits?.maxTokens ?? 0
  );
}
function readCatalogCapability(capabilities, key) {
  return capabilities[key] === true;
}
function loadModelCatalogIndex() {
  if (modelCatalogIndex) {
    return modelCatalogIndex;
  }
  try {
    const loaded = loadModelCatalogPayload();
    if (loaded) {
      modelCatalogIndex = buildModelCatalogIndex(loaded.payload, loaded.loadedFrom);
      return modelCatalogIndex;
    }
  } catch (error) {
    console.warn("Failed to load model catalog:", error);
  }
  modelCatalogIndex = {
    byKey: /* @__PURE__ */ new Map(),
    byModelKey: /* @__PURE__ */ new Map()
  };
  return modelCatalogIndex;
}
function buildModelCatalogIndex(payload, loadedFrom) {
  const byKey = /* @__PURE__ */ new Map();
  const byModelKey = /* @__PURE__ */ new Map();
  const models = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];
  for (const item of models) {
    const entry = parseModelCatalogEntry(item);
    if (!entry) {
      continue;
    }
    for (const key of modelCatalogEntryKeys(entry)) {
      byKey.set(key, entry);
    }
    const shortKeys = uniqueStrings3([
      entry.model ? normalizeModelCatalogToken(entry.model) : "",
      ...entry.aliases.map((alias) => modelCatalogLastSegmentKey(normalizeModelCatalogKey(alias)))
    ]);
    for (const key of shortKeys) {
      if (!key) {
        continue;
      }
      if (byModelKey.has(key) && byModelKey.get(key) !== entry) {
        byModelKey.set(key, void 0);
      } else {
        byModelKey.set(key, entry);
      }
    }
  }
  return { byKey, byModelKey, loadedFrom };
}
function parseModelCatalogEntry(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const id = stringValue(value.id);
  if (!id) {
    return void 0;
  }
  const aliases = uniqueStrings3([id, ...stringListValue(value.aliases)]);
  const limits = parseModelCatalogLimits(value.limits);
  const modalities = parseModelCatalogModalities(value.modalities);
  return {
    aliases,
    capabilities: isRecord(value.capabilities) ? value.capabilities : void 0,
    displayName: stringValue(value.displayName),
    family: stringValue(value.family),
    id,
    limits,
    modalities,
    model: stringValue(value.model),
    providers: stringListValue(value.providers)
  };
}
function parseModelCatalogLimits(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const limits = {
    contextTokens: readCatalogPositiveInteger(value.contextTokens),
    inputTokens: readCatalogPositiveInteger(value.inputTokens),
    maxTokens: readCatalogPositiveInteger(value.maxTokens),
    outputTokens: readCatalogPositiveInteger(value.outputTokens),
    supports1MContext: typeof value.supports1MContext === "boolean" ? value.supports1MContext : void 0
  };
  return Object.values(limits).some((item) => item !== void 0) ? limits : void 0;
}
function parseModelCatalogModalities(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const modalities = {
    input: stringListValue(value.input),
    output: stringListValue(value.output)
  };
  return modalities.input?.length || modalities.output?.length ? modalities : void 0;
}
function modelCatalogEntryKeys(entry) {
  return uniqueStrings3([
    normalizeModelCatalogKey(entry.id),
    ...entry.aliases.map(normalizeModelCatalogKey),
    ...(entry.providers ?? []).map((provider) => entry.model ? normalizeModelCatalogKey(`${provider}/${entry.model}`) : "")
  ]);
}
function modelCatalogLookupKeys(value) {
  const raw = String(value || "").trim();
  const normalized = normalizeModelCatalogKey(raw);
  const withoutClaudePrefix = raw.toLowerCase().startsWith("claude-") && raw.includes("/") ? normalizeModelCatalogKey(raw.replace(/^claude-/i, "")) : "";
  return uniqueStrings3([normalized, withoutClaudePrefix]);
}
function normalizeModelCatalogKey(value) {
  return String(value || "").trim().split("/").map(normalizeModelCatalogToken).filter(Boolean).join("/");
}
function normalizeModelCatalogToken(value) {
  return String(value || "").trim().replace(/^hf:/i, "").replace(/^@/, "").replace(/[_\s]+/g, "-").replace(/-+/g, "-").toLowerCase();
}
function modelCatalogLastSegmentKey(value) {
  return value.split("/").filter(Boolean).at(-1) ?? "";
}
function readCatalogPositiveInteger(value) {
  const parsed = numberValue(value);
  return parsed !== void 0 && parsed > 0 ? parsed : void 0;
}
function uniqueStrings3(values) {
  const seen = /* @__PURE__ */ new Set();
  const strings = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    strings.push(trimmed);
  }
  return strings;
}
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function stringListValue(value) {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter((item) => Boolean(item)) : [];
}
function numberValue(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/src/gateway/internal/value.ts
function stringValue2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}

// packages/core/src/config/constants.ts
var import_node_path4 = __toESM(require("node:path"));

// packages/core/src/runtime/app-paths.ts
var import_node_os = __toESM(require("node:os"));
var import_node_path2 = __toESM(require("node:path"));
var APP_NAME = "Claude Code Router";
var APP_STORAGE_NAME = "claude-code-router";
var LEGACY_CONFIGDIR = import_node_path2.default.join(import_node_os.default.homedir(), ".claude-code-router");
var homeDirEnv = "CCR_INTERNAL_HOME_DIR";
var appDataDirEnv = "CCR_INTERNAL_APP_DATA_DIR";
var userDataDirEnv = "CCR_INTERNAL_USER_DATA_DIR";
function resolveRuntimeAppPath(name) {
  const configured = readConfiguredPath(name);
  if (configured) {
    return configured;
  }
  if (name === "home") {
    return import_node_os.default.homedir();
  }
  if (name === "appData") {
    return fallbackAppDataDir();
  }
  return fallbackUserDataDir();
}
function resolveRuntimeConfigDir() {
  if (process.platform === "win32") {
    return import_node_path2.default.join(resolveRuntimeAppPath("appData"), APP_STORAGE_NAME);
  }
  return import_node_path2.default.join(resolveRuntimeAppPath("home"), `.${APP_STORAGE_NAME}`);
}
function resolveRuntimeDataDir() {
  const configured = readConfiguredPath("userData");
  if (configured) {
    return configured;
  }
  if (process.platform === "win32") {
    return resolveRuntimeConfigDir();
  }
  return import_node_path2.default.join(resolveRuntimeConfigDir(), "app-data");
}
function readConfiguredPath(name) {
  const key = name === "home" ? homeDirEnv : name === "appData" ? appDataDirEnv : userDataDirEnv;
  const value = process.env[key]?.trim();
  return value || void 0;
}
function fallbackAppDataDir() {
  if (process.platform === "win32") {
    return process.env.APPDATA || process.env.LOCALAPPDATA || (process.env.USERPROFILE ? import_node_path2.default.join(process.env.USERPROFILE, "AppData", "Roaming") : import_node_path2.default.join(import_node_os.default.homedir(), "AppData", "Roaming"));
  }
  return process.env.XDG_CONFIG_HOME || import_node_path2.default.join(import_node_os.default.homedir(), ".config");
}
function fallbackUserDataDir() {
  return resolveRuntimeDataDir();
}

// packages/core/src/storage/migration.ts
var import_node_fs2 = require("node:fs");
var import_node_path3 = __toESM(require("node:path"));
function copyMissingDirectoryContents(source, target, label) {
  if (!source || !target || sameFilesystemPath(source, target) || !(0, import_node_fs2.existsSync)(source)) {
    return;
  }
  try {
    (0, import_node_fs2.mkdirSync)(target, { recursive: true });
    (0, import_node_fs2.cpSync)(source, target, { errorOnExist: false, force: false, recursive: true });
  } catch (error) {
    console.warn(`Failed to migrate ${label} from ${source} to ${target}: ${formatError(error)}`);
  }
}
function sameFilesystemPath(left, right) {
  return import_node_path3.default.resolve(left).toLowerCase() === import_node_path3.default.resolve(right).toLowerCase();
}
function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

// packages/core/src/config/constants.ts
var LEGACY_CONFIG_FILE = import_node_path4.default.join(LEGACY_CONFIGDIR, "config.json");
var CONFIGDIR = resolveRuntimeConfigDir();
var LEGACY_WINDOWS_CONFIGDIR = import_node_path4.default.join(resolveRuntimeAppPath("appData"), APP_NAME);
var LEGACY_WINDOWS_CONFIG_FILE = import_node_path4.default.join(LEGACY_WINDOWS_CONFIGDIR, "config.json");
var CONFIG_FILE = import_node_path4.default.join(CONFIGDIR, "config.json");
var ONBOARDING_FINISHED_FILE = import_node_path4.default.join(CONFIGDIR, ".onboard_finished");
var DATADIR = resolveRuntimeDataDir();
var APP_CONFIG_DB_FILE = import_node_path4.default.join(CONFIGDIR, "config.sqlite");
var API_KEYS_DB_FILE = import_node_path4.default.join(DATADIR, "api-keys.sqlite");
var LEGACY_APP_CONFIG_DB_FILES = process.platform === "win32" ? [import_node_path4.default.join(LEGACY_WINDOWS_CONFIGDIR, "config.sqlite")] : [];
var LEGACY_API_KEYS_DB_FILES = process.platform === "win32" ? [import_node_path4.default.join(LEGACY_WINDOWS_CONFIGDIR, "api-keys.sqlite")] : [];
var CERTDIR = import_node_path4.default.join(DATADIR, "certs");
var PROVIDER_ICON_CACHE_DIR = import_node_path4.default.join(DATADIR, "provider-icons");
var PROXY_CA_CERT_FILE = import_node_path4.default.join(CERTDIR, "ca.pem");
var PROXY_CA_CERT_DER_FILE = import_node_path4.default.join(CERTDIR, "ca.cer");
var PROXY_CA_KEY_FILE = import_node_path4.default.join(CERTDIR, "key.pem");
var GATEWAY_CONFIG_FILE = import_node_path4.default.join(CONFIGDIR, "gateway.config.json");
var REQUEST_LOGS_DB_FILE = import_node_path4.default.join(DATADIR, "request-logs.sqlite");
var CONTEXT_ARCHIVE_DB_FILE = import_node_path4.default.join(DATADIR, "context-archive.sqlite");
var RAW_TRACE_SPOOL_DIR = import_node_path4.default.join(DATADIR, "raw-trace-spool");
var USAGE_DB_FILE = import_node_path4.default.join(DATADIR, "usage.sqlite");
if (process.platform === "win32") {
  copyMissingDirectoryContents(LEGACY_WINDOWS_CONFIGDIR, CONFIGDIR, "Windows app data directory");
}

// packages/core/src/gateway/internal/shared.ts
var import_node_module = require("node:module");
var fusionModelProviderName = "Fusion";
var claudeCodeOneMillionContextSuffix = "[1m]";
var claudeAppGatewayModelRouteOptions = {
  displayName: (model) => findModelCatalogEntry(model)?.displayName,
  supportsOneMillionContext: (model) => Boolean(findModelCatalogEntry(model)?.limits?.supports1MContext)
};
var requireFromHere = (0, import_node_module.createRequire)(__filename);
var maxUsageCaptureBytes = 8 * 1024 * 1024;
var codexPatchBridgeInstructionText = [
  "When modifying files, call virtual_apply_patch.",
  "Do not use exec_command or write_stdin to edit files, including shell redirection, heredocs, cat >, tee, sed -i, perl -i, python, node scripts, or similar shell-based edits.",
  "Use exec_command only for reading files, listing/searching, running builds/tests, starting servers, and other commands that are not manual file edits."
].join(" ");
var codexPatchBridgeShellToolGuidance = [
  "When virtual_apply_patch is available, do not use this tool to edit files.",
  "Do not write files with shell redirection, heredocs, cat >, tee, sed -i, perl -i, python, node scripts, or similar commands.",
  "Use virtual_apply_patch for manual file changes."
].join(" ");
var virtualApplyPatchLarkGrammar = [
  "start: begin_patch hunk+ end_patch",
  'begin_patch: "*** Begin Patch" LF',
  'end_patch: "*** End Patch" LF?',
  "",
  "hunk: add_hunk | delete_hunk | update_hunk",
  'add_hunk: "*** Add File: " filename LF add_line+',
  'delete_hunk: "*** Delete File: " filename LF',
  'update_hunk: "*** Update File: " filename LF change_move? change?',
  "",
  "filename: /(.+)/",
  'add_line: "+" /(.*)/ LF -> line',
  "",
  'change_move: "*** Move to: " filename LF',
  "change: (change_context | change_line)+ eof_line?",
  'change_context: ("@@" | "@@ " /(.+)/) LF',
  'change_line: ("+" | "-" | " ") /(.*)/ LF',
  'eof_line: "*** End of File" LF',
  "",
  "%import common.LF"
].join("\n");

// packages/core/src/gateway/internal/collections.ts
function uniqueStrings4(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    const item = value?.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

// packages/core/src/mcp/fusion-config.ts
function fusionModelSelector(model) {
  const normalized = fusionModelNameFromSelector(model);
  return normalized ? `${fusionModelProviderName}/${normalized}` : "";
}
function fusionModelNameFromSelector(model) {
  const trimmed = model.trim();
  const prefix = `${fusionModelProviderName}/`;
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase()) ? trimmed.slice(prefix.length).trim() : trimmed;
}

// packages/core/src/gateway/remote-control-service.ts
var import_node_crypto2 = require("node:crypto");
var ccrRemoteControlPathPrefix = "/__ccr/remote";
var maxSessions = 100;
var maxEventsPerSession = 2e3;
var maxInboundEventsPerSession = 500;
var sseHeartbeatMs = 15e3;
var CcrRemoteControlService = class {
  sessions = /* @__PURE__ */ new Map();
  async handleRequest(context) {
    const segments = remotePathSegments(context.path);
    const [root, sessionId, resource] = segments;
    if (segments.length === 0 || context.path === ccrRemoteControlPathPrefix) {
      this.sendCapabilities(context);
      return;
    }
    if (root === "capabilities") {
      this.sendCapabilities(context);
      return;
    }
    if (root !== "sessions") {
      context.sendJson(context.response, 404, { error: { message: "Remote control endpoint not found." } });
      return;
    }
    if (!sessionId) {
      await this.handleSessionsRequest(context);
      return;
    }
    if (!resource) {
      await this.handleSessionRequest(context, sessionId);
      return;
    }
    if (resource === "events") {
      await this.handleEventsRequest(context, sessionId);
      return;
    }
    if (resource === "inbound") {
      await this.handleInboundRequest(context, sessionId);
      return;
    }
    if (resource === "presence") {
      await this.handlePresenceRequest(context, sessionId);
      return;
    }
    context.sendJson(context.response, 404, { error: { message: "Remote control session endpoint not found." } });
  }
  sendCapabilities(context) {
    context.sendJson(context.response, 200, {
      endpoints: {
        createSession: `${context.endpoint}${ccrRemoteControlPathPrefix}/sessions`,
        inbound: `${context.endpoint}${ccrRemoteControlPathPrefix}/sessions/{sessionId}/inbound`,
        sessionEvents: `${context.endpoint}${ccrRemoteControlPathPrefix}/sessions/{sessionId}/events`
      },
      name: "ccr-remote-control",
      protocol: "ccr.remote.v1",
      transport: ["json", "sse"],
      capabilities: {
        catchupReplay: true,
        fanout: true,
        inboundQueue: true,
        presence: true
      }
    });
  }
  async handleSessionsRequest(context) {
    if (context.request.method === "GET") {
      context.sendJson(context.response, 200, {
        sessions: [...this.sessions.values()].map((session2) => this.sessionSummary(session2, context.endpoint))
      });
      return;
    }
    if (context.request.method !== "POST") {
      context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    const body = await this.readJsonBody(context);
    if (!body) {
      return;
    }
    const id = sanitizeSessionId(readString(body.id) || readString(body.sessionId)) || (0, import_node_crypto2.randomUUID)();
    const title = readString(body.title) || readString(body.name) || `CCR Remote ${id.slice(0, 8)}`;
    const metadata = readRecord(body.metadata) ?? {};
    const session = this.ensureSession(id, title, metadata);
    this.appendEvent(session, {
      direction: "system",
      payload: { title },
      source: "ccr-gateway",
      type: "session.created"
    });
    context.sendJson(context.response, 201, {
      session: this.sessionSnapshot(session, context.endpoint)
    });
  }
  async handleSessionRequest(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      context.sendJson(context.response, 404, { error: { message: "Remote session not found." } });
      return;
    }
    if (context.request.method === "GET") {
      context.sendJson(context.response, 200, { session: this.sessionSnapshot(session, context.endpoint) });
      return;
    }
    if (context.request.method === "PATCH") {
      const body = await this.readJsonBody(context);
      if (!body) {
        return;
      }
      const title = readString(body.title) || readString(body.name);
      if (title) {
        session.title = title;
      }
      const metadata = readRecord(body.metadata);
      if (metadata) {
        session.metadata = { ...session.metadata, ...metadata };
      }
      session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.appendEvent(session, {
        direction: "system",
        payload: { metadata: metadata ?? {}, title: title ?? session.title },
        source: "ccr-gateway",
        type: "session.updated"
      });
      context.sendJson(context.response, 200, { session: this.sessionSnapshot(session, context.endpoint) });
      return;
    }
    if (context.request.method === "DELETE") {
      session.archivedAt = (/* @__PURE__ */ new Date()).toISOString();
      session.updatedAt = session.archivedAt;
      this.appendEvent(session, {
        direction: "system",
        payload: { archivedAt: session.archivedAt },
        source: "ccr-gateway",
        type: "session.archived"
      });
      context.sendJson(context.response, 200, { archived: true, session: this.sessionSummary(session, context.endpoint) });
      return;
    }
    context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
  }
  async handleEventsRequest(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      context.sendJson(context.response, 404, { error: { message: "Remote session not found." } });
      return;
    }
    if (context.request.method === "GET") {
      const after = remoteAfterSeq(context.request);
      if (wantsSse(context.request)) {
        this.openSse(context, session, "events", after);
        return;
      }
      context.sendJson(context.response, 200, {
        events: session.events.filter((event) => event.seq > after),
        session: this.sessionSummary(session, context.endpoint)
      });
      return;
    }
    if (context.request.method !== "POST") {
      context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    const body = await this.readJsonBody(context);
    if (!body) {
      return;
    }
    const events = normalizeEventInputs(body).map(
      (event) => this.appendEvent(session, {
        ...event,
        direction: event.direction ?? "local",
        type: event.type || "message"
      })
    );
    context.sendJson(context.response, 202, {
      accepted: events.length,
      events,
      session: this.sessionSummary(session, context.endpoint)
    });
  }
  async handleInboundRequest(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      context.sendJson(context.response, 404, { error: { message: "Remote session not found." } });
      return;
    }
    if (context.request.method === "GET") {
      const after = remoteAfterSeq(context.request);
      if (wantsSse(context.request)) {
        this.openSse(context, session, "inbound", after);
        return;
      }
      context.sendJson(context.response, 200, {
        events: session.inboundEvents.filter((event) => event.seq > after),
        session: this.sessionSummary(session, context.endpoint)
      });
      return;
    }
    if (context.request.method !== "POST") {
      context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    const body = await this.readJsonBody(context);
    if (!body) {
      return;
    }
    const events = normalizeEventInputs(body).map(
      (event) => this.appendEvent(session, {
        ...event,
        direction: "remote",
        type: event.type || "user.message"
      }, true)
    );
    context.sendJson(context.response, 202, {
      accepted: events.length,
      events,
      session: this.sessionSummary(session, context.endpoint)
    });
  }
  async handlePresenceRequest(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      context.sendJson(context.response, 404, { error: { message: "Remote session not found." } });
      return;
    }
    if (context.request.method === "GET") {
      context.sendJson(context.response, 200, { presence: session.presence });
      return;
    }
    if (context.request.method !== "POST") {
      context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    const body = await this.readJsonBody(context);
    if (!body) {
      return;
    }
    const clientId = sanitizeSessionId(readString(body.clientId) || readString(body.id)) || (0, import_node_crypto2.randomUUID)();
    const presence = {
      lastSeenAt: (/* @__PURE__ */ new Date()).toISOString(),
      metadata: readRecord(body.metadata) ?? {},
      name: readString(body.name) || clientId,
      role: readString(body.role) || "client"
    };
    session.presence[clientId] = presence;
    const event = this.appendEvent(session, {
      direction: "system",
      payload: { clientId, presence },
      source: "ccr-gateway",
      type: "presence.updated"
    });
    context.sendJson(context.response, 202, { event, presence: session.presence });
  }
  ensureSession(id, title, metadata) {
    const existing = this.sessions.get(id);
    if (existing) {
      existing.metadata = { ...existing.metadata, ...metadata };
      existing.title = title || existing.title;
      existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      return existing;
    }
    this.pruneSessions();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = {
      createdAt: now,
      events: [],
      id,
      inboundEvents: [],
      lastSeq: 0,
      metadata,
      presence: {},
      seenDedupeKeys: /* @__PURE__ */ new Map(),
      subscribers: /* @__PURE__ */ new Set(),
      title,
      updatedAt: now
    };
    this.sessions.set(id, session);
    return session;
  }
  appendEvent(session, input, inbound = false) {
    const dedupeKey = input.dedupeKey || input.id;
    if (dedupeKey) {
      const duplicate = session.seenDedupeKeys.get(dedupeKey);
      if (duplicate) {
        return duplicate;
      }
    }
    const event = {
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...dedupeKey ? { dedupeKey } : {},
      direction: input.direction ?? "local",
      id: input.id || (0, import_node_crypto2.randomUUID)(),
      payload: input.payload ?? {},
      ...input.role ? { role: input.role } : {},
      seq: ++session.lastSeq,
      sessionId: session.id,
      ...input.source ? { source: input.source } : {},
      ...input.text ? { text: input.text } : {},
      type: input.type || "message"
    };
    session.events.push(event);
    trimArray(session.events, maxEventsPerSession);
    if (inbound || event.direction === "remote" || event.direction === "inbound") {
      session.inboundEvents.push(event);
      trimArray(session.inboundEvents, maxInboundEventsPerSession);
    }
    if (dedupeKey) {
      session.seenDedupeKeys.set(dedupeKey, event);
      while (session.seenDedupeKeys.size > maxEventsPerSession) {
        const oldest = session.seenDedupeKeys.keys().next().value;
        if (!oldest) {
          break;
        }
        session.seenDedupeKeys.delete(oldest);
      }
    }
    session.updatedAt = event.createdAt;
    this.broadcast(session, event);
    return event;
  }
  openSse(context, session, kind, after) {
    context.response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no"
    });
    context.response.write(": connected\n\n");
    const source = kind === "events" ? session.events : session.inboundEvents;
    for (const event of source.filter((item) => item.seq > after)) {
      writeSseEvent(context.response, event);
    }
    const heartbeat = setInterval(() => {
      if (!context.response.destroyed) {
        context.response.write(": keepalive\n\n");
      }
    }, sseHeartbeatMs);
    const subscriber = {
      close: () => clearInterval(heartbeat),
      id: (0, import_node_crypto2.randomUUID)(),
      kind,
      response: context.response
    };
    session.subscribers.add(subscriber);
    context.request.once("close", () => {
      subscriber.close();
      session.subscribers.delete(subscriber);
    });
  }
  broadcast(session, event) {
    for (const subscriber of session.subscribers) {
      if (subscriber.kind === "inbound" && !(event.direction === "remote" || event.direction === "inbound")) {
        continue;
      }
      if (subscriber.response.destroyed) {
        subscriber.close();
        session.subscribers.delete(subscriber);
        continue;
      }
      writeSseEvent(subscriber.response, event);
    }
  }
  sessionSnapshot(session, endpoint) {
    return {
      ...this.sessionSummary(session, endpoint),
      events: session.events,
      inboundEvents: session.inboundEvents,
      metadata: session.metadata,
      presence: session.presence
    };
  }
  sessionSummary(session, endpoint) {
    return {
      ...session.archivedAt ? { archivedAt: session.archivedAt } : {},
      createdAt: session.createdAt,
      endpoints: {
        events: `${endpoint}${ccrRemoteControlPathPrefix}/sessions/${encodeURIComponent(session.id)}/events`,
        inbound: `${endpoint}${ccrRemoteControlPathPrefix}/sessions/${encodeURIComponent(session.id)}/inbound`,
        presence: `${endpoint}${ccrRemoteControlPathPrefix}/sessions/${encodeURIComponent(session.id)}/presence`
      },
      eventCount: session.events.length,
      id: session.id,
      inboundCount: session.inboundEvents.length,
      lastSeq: session.lastSeq,
      subscriberCount: session.subscribers.size,
      title: session.title,
      updatedAt: session.updatedAt
    };
  }
  pruneSessions() {
    while (this.sessions.size >= maxSessions) {
      const oldest = [...this.sessions.values()].sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))[0];
      if (!oldest) {
        return;
      }
      for (const subscriber of oldest.subscribers) {
        subscriber.close();
        subscriber.response.end();
      }
      this.sessions.delete(oldest.id);
    }
  }
  async readJsonBody(context) {
    const body = await context.readBody(context.request);
    if (body.length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(body.toString("utf8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
      context.sendJson(context.response, 400, { error: { message: "Request body must be a JSON object." } });
      return void 0;
    } catch {
      context.sendJson(context.response, 400, { error: { message: "Request body must be valid JSON." } });
      return void 0;
    }
  }
};
var ccrRemoteControlService = new CcrRemoteControlService();
function normalizeEventInputs(body) {
  const rawEvents = Array.isArray(body.events) ? body.events : [body];
  return rawEvents.filter((event) => typeof event === "object" && event !== null && !Array.isArray(event)).map((event) => {
    const payload = Object.prototype.hasOwnProperty.call(event, "payload") ? event.payload : Object.prototype.hasOwnProperty.call(event, "message") ? event.message : {};
    return {
      dedupeKey: readString(event.dedupeKey) || readString(event.uuid) || readString(event.requestId),
      direction: readDirection(event.direction),
      id: readString(event.id),
      payload,
      role: readString(event.role),
      source: readString(event.source),
      text: readString(event.text) || readString(event.content),
      type: readString(event.type)
    };
  });
}
function writeSseEvent(response, event) {
  response.write(`id: ${event.seq}
`);
  response.write(`event: ${event.type.replace(/[\r\n]+/g, "") || "message"}
`);
  response.write(`data: ${JSON.stringify(event)}

`);
}
function wantsSse(request) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  return url.searchParams.get("stream") === "1" || url.searchParams.get("stream") === "true" || readHeader(request.headers.accept)?.toLowerCase().includes("text/event-stream") === true;
}
function remoteAfterSeq(request) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const after = Number(url.searchParams.get("after") ?? readHeader(request.headers["last-event-id"]) ?? 0);
  return Number.isFinite(after) && after > 0 ? Math.floor(after) : 0;
}
function remotePathSegments(path4) {
  const suffix = path4.slice(ccrRemoteControlPathPrefix.length).replace(/^\/+|\/+$/g, "");
  if (!suffix) {
    return [];
  }
  return suffix.split("/").map((segment) => decodeURIComponent(segment)).filter(Boolean);
}
function readDirection(value) {
  return value === "inbound" || value === "local" || value === "remote" || value === "system" ? value : void 0;
}
function readHeader(value) {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function sanitizeSessionId(value) {
  const sanitized = value?.trim().replace(/[^a-zA-Z0-9:._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 128);
  return sanitized || void 0;
}
function trimArray(items, maxLength) {
  if (items.length > maxLength) {
    items.splice(0, items.length - maxLength);
  }
}

// packages/core/src/gateway/http/io.ts
function parseJsonObject(buffer) {
  if (buffer.length === 0) {
    return {};
  }
  const parsed = JSON.parse(buffer.toString("utf8"));
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed;
  }
  throw new Error("Request body must be a JSON object.");
}
function readHeader2(value) {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}

// packages/core/src/gateway/http/body.ts
var parsedJsonObjectCache = /* @__PURE__ */ new WeakMap();
function parseJsonObjectCached(buffer) {
  const cached = parsedJsonObjectCache.get(buffer);
  if (cached) {
    if ("error" in cached) {
      throw cached.error;
    }
    return cached.value;
  }
  try {
    const value = parseJsonObject(buffer);
    parsedJsonObjectCache.set(buffer, { value });
    return value;
  } catch (error) {
    parsedJsonObjectCache.set(buffer, { error });
    throw error;
  }
}
function parseJsonObjectSafe(buffer) {
  if (!buffer || buffer.byteLength === 0) {
    return void 0;
  }
  try {
    return parseJsonObjectCached(buffer);
  } catch {
    return void 0;
  }
}
function serializeJsonBody(body) {
  const buffer = Buffer.from(`${JSON.stringify(body)}
`, "utf8");
  parsedJsonObjectCache.set(buffer, { value: body });
  return buffer;
}
function serializeJsonBodyWithModel(body, model) {
  return serializeJsonBody({ ...body, model });
}

// packages/core/src/gateway/context-archive.ts
var import_node_crypto3 = require("node:crypto");

// packages/core/src/gateway/context-archive/protocol.ts
function parseArchiveBody(body) {
  if (!body?.length) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    return isRecord3(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function appendArchiveTask(originalBody, protocol, task) {
  return appendTask(originalBody, protocol, task, { compactHandoff: false, replayTask: true });
}
function appendTask(originalBody, protocol, task, options) {
  const body = parseArchiveBody(originalBody);
  if (!body) {
    throw archiveProtocolError("ARCHIVE_INVALID_REQUEST", "The archived request body is not a JSON object.");
  }
  assertAppendableTurn(body, protocol);
  const next = cloneJsonObject(body);
  if (options.compactHandoff) {
    sanitizeCompactHandoffRequest(next, protocol);
  } else if (options.replayTask && protocol === "openai_responses") {
    removeCodexCompactionTriggers(next);
  }
  if (protocol === "openai_responses") {
    if (Array.isArray(next.input)) {
      next.input = [
        ...next.input,
        {
          content: [{ text: task, type: "input_text" }],
          role: "user",
          type: "message"
        }
      ];
    } else if (typeof next.input === "string") {
      next.input = `${next.input}

${task}`;
    } else if (next.input === void 0) {
      next.input = task;
    } else {
      throw archiveProtocolError("ARCHIVE_INVALID_REQUEST", "OpenAI Responses input cannot accept an appended task.");
    }
  } else {
    const messages = next.messages;
    if (!Array.isArray(messages)) {
      throw archiveProtocolError("ARCHIVE_INVALID_REQUEST", `${protocol} request is missing messages.`);
    }
    next.messages = [...messages, { content: task, role: "user" }];
  }
  return Buffer.from(`${JSON.stringify(next)}
`, "utf8");
}
function archiveHandoffFooter(input) {
  const argumentsJson = `{ "task": "specific historical question", "archive_id": "${input.archiveId}", "session_token": "${input.sessionToken}" }`;
  const clientToolName = input.clientToolName?.trim();
  const toolLines = clientToolName && clientToolName !== input.toolName ? [
    `In Claude Code, call the tool named: ${clientToolName}`,
    `Raw MCP tool name: ${input.toolName}`,
    `Tool arguments JSON: ${argumentsJson}`
  ] : [
    `${input.toolName}(${argumentsJson})`
  ];
  return [
    "CCR ARCHIVED HISTORY ACCESS",
    `Archive id: ${input.archiveId}`,
    `Archive session id: ${input.sessionId}`,
    `Archive generation: ${input.generation}`,
    `Archive session token: ${input.sessionToken}`,
    ...toolLines,
    "The latest archive access searches this compact generation and its parent generations when needed.",
    "Treat history answers as evidence and preserve the original instruction priority."
  ].join("\n");
}
function historyReplayTask(task) {
  return [
    "CCR history task from the successor agent:",
    "Use the complete conversation and request parameters already present in this request as your previous context.",
    "Answer only the task below from that context. If the context is insufficient, say so directly.",
    "Do not continue the previous task, modify files, or call external tools.",
    "",
    task
  ].join("\n");
}
function extractArchiveAssistantText(rawText, protocol, contentType) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return "";
  }
  const isSse = contentType?.toLowerCase().includes("text/event-stream") || /^event:|^data:/m.test(trimmed);
  if (isSse) {
    return normalizeWhitespace(collectSseProtocolText(parseSsePayloads(trimmed), protocol).join(""));
  }
  try {
    return normalizeWhitespace(collectProtocolText(JSON.parse(trimmed), protocol).join(""));
  } catch {
    return normalizeWhitespace(rawText);
  }
}
function collectSseProtocolText(payloads, protocol) {
  if (protocol === "openai_responses") {
    const deltas = payloads.flatMap(
      (payload) => isRecord3(payload) && payload.type === "response.output_text.delta" && typeof payload.delta === "string" ? [payload.delta] : []
    );
    return deltas.length ? deltas : payloads.flatMap((payload) => collectProtocolText(payload, protocol));
  }
  if (protocol === "anthropic_messages") {
    const deltas = payloads.flatMap(
      (payload) => isRecord3(payload) && payload.type === "content_block_delta" ? collectText(payload.delta) : []
    );
    return deltas.length ? deltas : payloads.flatMap((payload) => collectProtocolText(payload, protocol));
  }
  return payloads.flatMap((payload) => collectProtocolText(payload, protocol));
}
function archiveResponseRequiresTool(rawText) {
  const values = [];
  try {
    values.push(JSON.parse(rawText));
  } catch {
    values.push(...parseSsePayloads(rawText));
  }
  return values.some(hasStructuredToolCall);
}
function assertAppendableTurn(body, protocol) {
  if (protocol === "openai_responses") {
    const input = Array.isArray(body.input) ? body.input : [];
    const tail2 = input.at(-1);
    if (isRecord3(tail2) && ["function_call", "computer_call", "custom_tool_call"].includes(String(tail2.type ?? ""))) {
      throw archiveProtocolError("ARCHIVE_NOT_AT_TURN_BOUNDARY", "The archived Responses request ends with an unresolved tool call.");
    }
    return;
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tail = messages.at(-1);
  if (!isRecord3(tail) || String(tail.role ?? "") !== "assistant") {
    return;
  }
  if (Array.isArray(tail.tool_calls) && tail.tool_calls.length > 0) {
    throw archiveProtocolError("ARCHIVE_NOT_AT_TURN_BOUNDARY", "The archived chat request ends with an unresolved tool call.");
  }
  if (Array.isArray(tail.content) && tail.content.some((block) => isRecord3(block) && block.type === "tool_use")) {
    throw archiveProtocolError("ARCHIVE_NOT_AT_TURN_BOUNDARY", "The archived Anthropic request ends with an unresolved tool call.");
  }
}
function sanitizeCompactHandoffRequest(body, protocol) {
  removeCompactSignals(body);
  removeKeys(body, [
    "response_format",
    "responseFormat",
    "stop",
    "stop_sequences",
    "stopSequences"
  ]);
  if (protocol === "openai_responses") {
    removeKeys(body, [
      "parallel_tool_calls",
      "parallelToolCalls",
      "tool_choice",
      "toolChoice",
      "tools"
    ]);
    normalizeOpenAiResponsesTextFormat(body);
    raiseMinimumNumericField(body, ["max_output_tokens", "maxOutputTokens", "max_tokens", "maxTokens"], 2048);
    return;
  }
  removeKeys(body, [
    "function_call",
    "functionCall",
    "functions",
    "parallel_tool_calls",
    "parallelToolCalls",
    "tool_choice",
    "toolChoice",
    "tools"
  ]);
  raiseMinimumNumericField(body, ["max_tokens", "maxTokens"], 2048);
}
function removeCompactSignals(body) {
  removeCodexCompactionTriggers(body);
  for (const key of ["context_management", "contextManagement"]) {
    const management = isRecord3(body[key]) ? cloneJsonObject(body[key]) : void 0;
    if (!management) {
      continue;
    }
    const edits = Array.isArray(management.edits) ? management.edits.filter((edit) => !(isRecord3(edit) && isCompactType(edit.type))) : void 0;
    if (edits !== void 0) {
      if (edits.length > 0) {
        management.edits = edits;
      } else {
        delete management.edits;
      }
    }
    if (Object.keys(management).length > 0) {
      body[key] = management;
    } else {
      delete body[key];
    }
  }
  const metadata = isRecord3(body.metadata) ? cloneJsonObject(body.metadata) : void 0;
  if (!metadata) {
    return;
  }
  delete metadata.ccr_context_compact;
  delete metadata.ccrContextCompact;
  if (Object.keys(metadata).length > 0) {
    body.metadata = metadata;
  } else {
    delete body.metadata;
  }
}
function removeCodexCompactionTriggers(body) {
  if (Array.isArray(body.input)) {
    body.input = body.input.filter((item) => !(isRecord3(item) && item.type === "compaction_trigger"));
  }
}
function normalizeOpenAiResponsesTextFormat(body) {
  if (!isRecord3(body.text)) {
    return;
  }
  const text = cloneJsonObject(body.text);
  if (!isRecord3(text.format)) {
    return;
  }
  const type = typeof text.format.type === "string" ? text.format.type.toLowerCase() : "";
  if (!type || type === "text") {
    return;
  }
  text.format = { type: "text" };
  body.text = text;
}
function removeKeys(body, keys) {
  for (const key of keys) {
    delete body[key];
  }
}
function raiseMinimumNumericField(body, keys, minimum) {
  for (const key of keys) {
    if (typeof body[key] === "number" && Number.isFinite(body[key]) && body[key] < minimum) {
      body[key] = minimum;
    }
  }
}
function collectProtocolText(value, protocol) {
  if (!isRecord3(value)) {
    return [];
  }
  if (protocol === "openai_chat_completions") {
    const choices = Array.isArray(value.choices) ? value.choices : [];
    const text = choices.flatMap((choice) => isRecord3(choice) ? [...collectText(readPath(choice, ["message", "content"])), ...collectText(readPath(choice, ["delta", "content"]))] : []);
    return text.length ? text : collectText(value);
  }
  if (protocol === "openai_responses") {
    return collectText(value.output_text).concat(collectText(value.delta), collectText(value.output), collectText(value.item));
  }
  return collectText(value.content).concat(collectText(value.delta), collectText(value.message));
}
function collectText(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }
  if (!isRecord3(value)) {
    return [];
  }
  const type = typeof value.type === "string" ? value.type : "";
  const direct = typeof value.text === "string" && (!type || [
    "content_block_delta",
    "message",
    "output_text",
    "summary_text",
    "text",
    "text_delta",
    "response.output_text.delta"
  ].includes(type)) ? [value.text] : [];
  const outputText = typeof value.output_text === "string" ? [value.output_text] : [];
  const content = typeof value.content === "string" ? [value.content] : collectText(value.content);
  return direct.concat(outputText, content, collectText(value.delta), collectText(value.message), collectText(value.output), collectText(value.response), collectText(value.item));
}
function parseSsePayloads(rawText) {
  const payloads = [];
  for (const event of rawText.split(/\r?\n\r?\n+/g)) {
    const data = event.split(/\r?\n/g).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    try {
      payloads.push(JSON.parse(data));
    } catch {
    }
  }
  return payloads;
}
function hasStructuredToolCall(value) {
  if (Array.isArray(value)) {
    return value.some(hasStructuredToolCall);
  }
  if (!isRecord3(value)) {
    return false;
  }
  if (Array.isArray(value.tool_calls) && value.tool_calls.length > 0) {
    return true;
  }
  if (["tool_use", "function_call", "custom_tool_call", "computer_call"].includes(String(value.type ?? ""))) {
    return true;
  }
  return Object.values(value).some(hasStructuredToolCall);
}
function readPath(value, path4) {
  let current = value;
  for (const part of path4) {
    if (!isRecord3(current)) {
      return void 0;
    }
    current = current[part];
  }
  return current;
}
function isCompactType(value) {
  return typeof value === "string" && /^compact(?:_|$)/i.test(value.trim());
}
function cloneJsonObject(value) {
  return JSON.parse(JSON.stringify(value));
}
function normalizeWhitespace(value) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}
function archiveProtocolError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.name = "ContextArchiveError";
  return error;
}
function isRecord3(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// packages/core/src/gateway/context-archive/store.ts
var import_node_fs3 = require("node:fs");
var import_node_path5 = require("node:path");

// packages/core/src/storage/sqlite-native.ts
var import_node_module2 = require("node:module");
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var requireFromHere2 = (0, import_node_module2.createRequire)(__filename);
var resolvedNativeBinding;
var nativeBindingResolved = false;
function createBetterSqliteDatabase(filename, options = {}) {
  const nativeBinding = resolveBetterSqliteNativeBinding();
  return nativeBinding ? new import_better_sqlite3.default(filename, { ...options, nativeBinding }) : new import_better_sqlite3.default(filename, options);
}
function resolveBetterSqliteNativeBinding() {
  if (nativeBindingResolved) {
    return resolvedNativeBinding;
  }
  nativeBindingResolved = true;
  try {
    resolvedNativeBinding = requireFromHere2.resolve("better-sqlite3/build/Release/better_sqlite3.node");
  } catch {
    resolvedNativeBinding = void 0;
  }
  return resolvedNativeBinding;
}

// packages/core/src/gateway/context-archive/store.ts
var ContextArchiveStore = class {
  constructor(dbFile) {
    this.dbFile = dbFile;
    if (dbFile !== ":memory:") {
      const directory = (0, import_node_path5.dirname)(dbFile);
      (0, import_node_fs3.mkdirSync)(directory, { mode: 448, recursive: true });
      securePath(directory, 448);
    }
    this.database = createBetterSqliteDatabase(dbFile);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("synchronous = NORMAL");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS archive_snapshots (
        archive_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        parent_archive_id TEXT,
        request_id TEXT NOT NULL UNIQUE,
        protocol TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        body BLOB NOT NULL,
        body_sha256 TEXT NOT NULL,
        replay_headers_json TEXT NOT NULL,
        route_json TEXT,
        token_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        UNIQUE(session_id, generation)
      );
      CREATE INDEX IF NOT EXISTS archive_snapshots_session_generation
        ON archive_snapshots(session_id, generation DESC);
      CREATE INDEX IF NOT EXISTS archive_snapshots_expires_at
        ON archive_snapshots(expires_at);
    `);
    this.secureFiles();
  }
  dbFile;
  database;
  create(input, retention) {
    const transaction = this.database.transaction(() => {
      const previous = this.database.prepare(`
        SELECT archive_id, generation
        FROM archive_snapshots
        WHERE session_id = ?
        ORDER BY generation DESC
        LIMIT 1
      `).get(input.sessionId);
      const generation = Number(previous?.generation ?? 0) + 1;
      const parentArchiveId = readString2(previous?.archive_id);
      this.database.prepare(`
        INSERT INTO archive_snapshots (
          archive_id, session_id, generation, parent_archive_id, request_id,
          protocol, method, path, body, body_sha256, replay_headers_json,
          token_hash, status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        input.archiveId,
        input.sessionId,
        generation,
        parentArchiveId ?? null,
        input.requestId,
        input.protocol,
        input.method,
        input.path,
        input.body,
        input.bodySha256,
        JSON.stringify(input.replayHeaders),
        input.tokenHash,
        input.createdAt,
        input.expiresAt ?? null
      );
      return { generation, parentArchiveId };
    });
    const lineage = transaction();
    this.extendLineageExpiry(input.archiveId, input.expiresAt, retention);
    this.prune(retention, input.archiveId);
    this.secureFiles();
    return {
      ...input,
      ...lineage,
      status: "pending"
    };
  }
  finalize(archiveId, route) {
    this.database.prepare(`
      UPDATE archive_snapshots
      SET route_json = ?, status = 'ready'
      WHERE archive_id = ? AND status = 'pending'
    `).run(JSON.stringify(route), archiveId);
    this.secureFiles();
  }
  fail(archiveId) {
    this.database.prepare("UPDATE archive_snapshots SET status = 'failed' WHERE archive_id = ?").run(archiveId);
  }
  get(archiveId) {
    const row = this.database.prepare(`
      SELECT * FROM archive_snapshots WHERE archive_id = ? LIMIT 1
    `).get(archiveId);
    return row ? snapshotFromRow(row) : void 0;
  }
  lineage(archiveId, limit = 32) {
    const snapshots = [];
    const seen = /* @__PURE__ */ new Set();
    let currentArchiveId = archiveId;
    while (currentArchiveId && snapshots.length < Math.max(1, Math.floor(limit)) && !seen.has(currentArchiveId)) {
      seen.add(currentArchiveId);
      const snapshot = this.get(currentArchiveId);
      if (!snapshot) {
        break;
      }
      snapshots.push(snapshot);
      currentArchiveId = snapshot.parentArchiveId;
    }
    return snapshots;
  }
  clear() {
    this.database.prepare("DELETE FROM archive_snapshots").run();
  }
  close() {
    this.database.close();
  }
  prune(retention, protectedArchiveId) {
    const protectedIds = this.protectedLineageIds(protectedArchiveId, retention);
    const now = Date.now();
    const expiredRows = this.database.prepare(`
      SELECT archive_id
      FROM archive_snapshots
      WHERE expires_at IS NOT NULL AND expires_at <= ?
    `).all(now);
    for (const row of expiredRows) {
      if (!protectedIds.has(row.archive_id)) {
        this.database.prepare("DELETE FROM archive_snapshots WHERE archive_id = ?").run(row.archive_id);
      }
    }
    const maxSnapshots = Math.max(1, Math.floor(retention.maxSnapshots));
    const snapshotRows = this.database.prepare(`
      SELECT archive_id
      FROM archive_snapshots
      ORDER BY created_at DESC, rowid DESC
    `).all();
    for (let index = maxSnapshots; index < snapshotRows.length; index += 1) {
      const archiveId = snapshotRows[index]?.archive_id;
      if (archiveId && !protectedIds.has(archiveId)) {
        this.database.prepare("DELETE FROM archive_snapshots WHERE archive_id = ?").run(archiveId);
      }
    }
    const maxBytes = Math.max(1, Math.floor(retention.maxBytes));
    const rows = this.database.prepare(`
      SELECT archive_id, length(body) AS body_bytes
      FROM archive_snapshots
      ORDER BY created_at DESC, rowid DESC
    `).all();
    let retainedBytes = 0;
    for (const row of rows) {
      retainedBytes += Number(row.body_bytes ?? 0);
      if (retainedBytes > maxBytes && !protectedIds.has(row.archive_id)) {
        this.database.prepare("DELETE FROM archive_snapshots WHERE archive_id = ?").run(row.archive_id);
      }
    }
  }
  protectedLineageIds(archiveId, retention) {
    return new Set(this.lineage(archiveId, Math.max(1, Math.floor(retention.maxSnapshots))).map((snapshot) => snapshot.archiveId));
  }
  extendLineageExpiry(archiveId, expiresAt, retention) {
    if (expiresAt === void 0) {
      return;
    }
    for (const snapshot of this.lineage(archiveId, Math.max(1, Math.floor(retention.maxSnapshots)))) {
      this.database.prepare(`
        UPDATE archive_snapshots
        SET expires_at = ?
        WHERE archive_id = ? AND (expires_at IS NULL OR expires_at < ?)
      `).run(expiresAt, snapshot.archiveId, expiresAt);
    }
  }
  secureFiles() {
    if (this.dbFile === ":memory:") {
      return;
    }
    securePath(this.dbFile, 384);
    securePath(`${this.dbFile}-wal`, 384);
    securePath(`${this.dbFile}-shm`, 384);
  }
};
function snapshotFromRow(row) {
  return {
    archiveId: requiredString(row.archive_id),
    body: Buffer.from(row.body),
    bodySha256: requiredString(row.body_sha256),
    createdAt: Number(row.created_at),
    expiresAt: optionalNumber(row.expires_at),
    generation: Number(row.generation),
    method: requiredString(row.method),
    parentArchiveId: readString2(row.parent_archive_id),
    path: requiredString(row.path),
    protocol: requiredString(row.protocol),
    replayHeaders: parseRecord(row.replay_headers_json),
    requestId: requiredString(row.request_id),
    route: parseOptionalRoute(row.route_json),
    sessionId: requiredString(row.session_id),
    status: requiredString(row.status),
    tokenHash: requiredString(row.token_hash)
  };
}
function parseRecord(value) {
  const parsed = JSON.parse(requiredString(value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return Object.fromEntries(Object.entries(parsed).filter((entry) => typeof entry[1] === "string"));
}
function parseOptionalRoute(value) {
  const text = readString2(value);
  if (!text) {
    return void 0;
  }
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
}
function requiredString(value) {
  const text = readString2(value);
  if (!text) {
    throw new Error("Context archive database contains an invalid string value.");
  }
  return text;
}
function readString2(value) {
  return typeof value === "string" && value ? value : void 0;
}
function optionalNumber(value) {
  return value === null || value === void 0 ? void 0 : Number(value);
}
function securePath(file, mode) {
  if (process.platform === "win32" || !(0, import_node_fs3.existsSync)(file)) {
    return;
  }
  try {
    (0, import_node_fs3.chmodSync)(file, mode);
  } catch {
  }
}

// packages/core/src/gateway/context-archive.ts
var maxMcpRequestBytes = 2 * 1024 * 1024;
var defaultToolName = "ccr_history_ask";
var maxUpstreamErrorCharacters = 4e3;
var maxLineageReplayDepth = 32;
var CONTEXT_ARCHIVE_MCP_SERVER_NAME = "ccr-context-archive";
var ContextArchiveService = class {
  stores = /* @__PURE__ */ new Map();
  clear(config) {
    if (config) {
      this.store(config).clear();
      return;
    }
    for (const store of this.stores.values()) {
      store.clear();
    }
  }
  close() {
    for (const store of this.stores.values()) {
      store.close();
    }
    this.stores.clear();
  }
  createSnapshot(input) {
    const maxSnapshotBytes = clampInteger(input.config.maxSnapshotBytes, 64 * 1024, 1024 * 1024 * 1024, 32 * 1024 * 1024);
    if (input.body.byteLength > maxSnapshotBytes) {
      throw contextArchiveError(
        "ARCHIVE_SNAPSHOT_TOO_LARGE",
        `Compact request is ${input.body.byteLength} bytes; the configured snapshot limit is ${maxSnapshotBytes} bytes.`
      );
    }
    const archiveId = `arc_${(0, import_node_crypto3.randomBytes)(18).toString("base64url")}`;
    const sessionToken = (0, import_node_crypto3.randomBytes)(32).toString("base64url");
    const createdAt = Date.now();
    const retentionDays = clampInteger(input.config.retentionDays, 1, 3650, 30);
    const snapshot = this.store(input.config).create({
      archiveId,
      body: Buffer.from(input.body),
      bodySha256: sha256(input.body),
      createdAt,
      expiresAt: createdAt + retentionDays * 24 * 60 * 60 * 1e3,
      method: input.method,
      path: input.path,
      protocol: input.protocol,
      replayHeaders: replaySafeHeaders(input.headers),
      requestId: input.requestId,
      sessionId: input.sessionId,
      tokenHash: sha256(sessionToken)
    }, {
      maxBytes: clampInteger(input.config.maxBytes, 1024 * 1024, 64 * 1024 * 1024 * 1024, 512 * 1024 * 1024),
      maxSnapshots: clampInteger(input.config.maxSnapshots, 1, 1e5, 200),
      retentionDays
    });
    const footer = archiveHandoffFooter({
      archiveId,
      clientToolName: contextArchiveClaudeCodeToolName(input.config.toolName || defaultToolName),
      generation: snapshot.generation,
      sessionId: input.sessionId,
      sessionToken,
      toolName: input.config.toolName || defaultToolName
    });
    return {
      record: {
        archiveId,
        footer,
        generation: snapshot.generation,
        sessionId: input.sessionId
      },
      sessionToken
    };
  }
  finalize(record, route, config) {
    if (!record) {
      return;
    }
    this.store(config).finalize(record.archiveId, route);
  }
  fail(record, config) {
    if (!record) {
      return;
    }
    this.store(config).fail(record.archiveId);
  }
  getSnapshot(archiveId, config) {
    return this.store(config).get(archiveId);
  }
  async ask(input, config, executor) {
    const archiveId = input.archiveId.trim();
    const sessionToken = input.sessionToken.trim();
    const task = input.task.trim();
    const toolName = config.toolName || defaultToolName;
    if (!archiveId || !sessionToken || !task) {
      throw contextArchiveError("ARCHIVE_INVALID_ARGUMENT", `${toolName} requires archive_id, session_token, and task.`);
    }
    const store = this.store(config);
    const rootSnapshot = store.get(archiveId);
    if (!rootSnapshot) {
      throw contextArchiveError("ARCHIVE_NOT_FOUND", `Archive ${archiveId} does not exist or has expired.`);
    }
    if (rootSnapshot.expiresAt !== void 0 && rootSnapshot.expiresAt <= Date.now()) {
      throw contextArchiveError("ARCHIVE_EXPIRED", `Archive ${archiveId} has expired.`);
    }
    if (rootSnapshot.status !== "ready") {
      throw contextArchiveError("ARCHIVE_NOT_READY", `Archive ${archiveId} is ${rootSnapshot.status}.`);
    }
    if (!constantTimeEqual(rootSnapshot.tokenHash, sha256(sessionToken))) {
      throw contextArchiveError("ARCHIVE_ACCESS_DENIED", "The archive session token is invalid.");
    }
    if (!executor) {
      throw contextArchiveError("ARCHIVE_REPLAY_UNAVAILABLE", "The gateway replay executor is not available.");
    }
    const lineage = store.lineage(archiveId, maxLineageReplayDepth);
    const searchedGenerations = [];
    let lastInsufficientAnswer;
    for (const snapshot of lineage) {
      if (snapshot.expiresAt !== void 0 && snapshot.expiresAt <= Date.now()) {
        continue;
      }
      if (snapshot.status !== "ready") {
        continue;
      }
      const answer = await replayArchiveSnapshot(snapshot, task, config, executor);
      searchedGenerations.push(snapshot.generation);
      if (isInsufficientArchiveAnswer(answer) && snapshot.parentArchiveId) {
        lastInsufficientAnswer = { answer, snapshot };
        continue;
      }
      return {
        answer,
        archiveId,
        generation: rootSnapshot.generation,
        searchedGenerations,
        sourceArchiveId: snapshot.archiveId,
        sourceGeneration: snapshot.generation,
        task
      };
    }
    if (lastInsufficientAnswer) {
      return {
        answer: lastInsufficientAnswer.answer,
        archiveId,
        generation: rootSnapshot.generation,
        searchedGenerations,
        sourceArchiveId: lastInsufficientAnswer.snapshot.archiveId,
        sourceGeneration: lastInsufficientAnswer.snapshot.generation,
        task
      };
    }
    throw contextArchiveError("ARCHIVE_NOT_READY", `Archive ${archiveId} has no ready lineage snapshots.`);
  }
  store(config) {
    const dbFile = config.storagePath.trim() || CONTEXT_ARCHIVE_DB_FILE;
    let store = this.stores.get(dbFile);
    if (!store) {
      store = new ContextArchiveStore(dbFile);
      this.stores.set(dbFile, store);
    }
    return store;
  }
};
var contextArchiveService = new ContextArchiveService();
function contextArchiveClaudeCodeToolName(toolName) {
  return `mcp__${CONTEXT_ARCHIVE_MCP_SERVER_NAME}__${toolName}`;
}
async function replayArchiveSnapshot(snapshot, task, config, executor) {
  const replayBody = appendArchiveTask(snapshot.body, snapshot.protocol, historyReplayTask(task));
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(contextArchiveError("ARCHIVE_REPLAY_TIMEOUT", "The archived agent replay timed out.")),
    clampInteger(config.replayTimeoutMs, 1e3, 6e5, 6e4)
  );
  let result;
  try {
    result = await executor({ body: replayBody, signal: controller.signal, snapshot });
  } finally {
    clearTimeout(timeout);
  }
  const rawText = Buffer.isBuffer(result.body) ? result.body.toString("utf8") : result.body;
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw contextArchiveError(
      "ARCHIVE_UPSTREAM_ERROR",
      `Archived agent returned HTTP ${result.statusCode}: ${rawText.slice(0, maxUpstreamErrorCharacters)}`
    );
  }
  const answer = extractArchiveAssistantText(rawText, snapshot.protocol, result.contentType);
  if (!answer && archiveResponseRequiresTool(rawText)) {
    throw contextArchiveError(
      "ARCHIVE_REPLAY_TOOL_REQUIRED",
      "The archived agent requested a tool. Exact replay does not execute external client tools."
    );
  }
  if (!answer) {
    throw contextArchiveError("ARCHIVE_EMPTY_ANSWER", "The archived agent returned no textual answer.");
  }
  return answer;
}
function isInsufficientArchiveAnswer(answer) {
  const normalized = answer.toLowerCase().replace(/\s+/g, " ").trim();
  return [
    "context is insufficient",
    "insufficient context",
    "not enough information",
    "not enough context",
    "does not contain",
    "doesn't contain",
    "cannot determine",
    "can't determine",
    "could not determine",
    "unable to determine",
    "unable to find",
    "not mentioned",
    "no relevant",
    "unknown"
  ].some((phrase) => normalized.includes(phrase));
}
function contextArchiveEnabled(config) {
  return Boolean(config?.contextArchive?.enabled);
}
function contextArchiveMcpEnabled(config) {
  return Boolean(config?.contextArchive?.enabled && config.contextArchive.mcpEnabled !== false);
}
function profileManagedCompactEnabled(profile) {
  return Boolean(profile?.enabled && profile.managedCompact === true);
}
function contextArchiveConfigForApiKey(config, apiKey) {
  if (apiKeyMatchesManagedCompactProfile(config, apiKey)) {
    return withManagedContextArchiveEnabled(config);
  }
  if (apiKeyMatchesProfile(config, apiKey)) {
    return void 0;
  }
  return contextArchiveEnabled(config) ? config : void 0;
}
function withManagedContextArchiveEnabled(config) {
  if (config.contextArchive.enabled && config.contextArchive.mcpEnabled !== false) {
    return config;
  }
  return {
    ...config,
    contextArchive: {
      ...config.contextArchive,
      enabled: true,
      mcpEnabled: true
    }
  };
}
function apiKeyMatchesManagedCompactProfile(config, apiKey) {
  const id = apiKey?.id?.trim();
  if (!id || config.profile?.enabled === false) {
    return false;
  }
  const profiles = Array.isArray(config.profile?.profiles) ? config.profile.profiles : [];
  return profiles.some(
    (profile) => profileManagedCompactEnabled(profile) && id === profileApiKeyId(profile)
  );
}
function apiKeyMatchesProfile(config, apiKey) {
  const id = apiKey?.id?.trim();
  if (!id || config.profile?.enabled === false) {
    return false;
  }
  const profiles = Array.isArray(config.profile?.profiles) ? config.profile.profiles : [];
  return profiles.some((profile) => id === profileApiKeyId(profile));
}
function profileApiKeyId(profile) {
  return `profile:${sanitizeProfilePathSegment(profile.id || profile.name || profile.agent) || "profile"}`;
}
function sanitizeProfilePathSegment(value) {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}
function replaySafeHeaders(headers) {
  const allowed = /* @__PURE__ */ new Set([
    "anthropic-beta",
    "anthropic-version",
    "content-type",
    "openai-beta",
    "openai-organization",
    "openai-project",
    "user-agent",
    "x-ccr-client",
    "x-client-name"
  ]);
  const output = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (!allowed.has(normalized) || value === void 0) {
      continue;
    }
    output[normalized] = Array.isArray(value) ? value.join(",") : String(value);
  }
  output["content-type"] = "application/json";
  return output;
}
function sha256(value) {
  return (0, import_node_crypto3.createHash)("sha256").update(value).digest("base64url");
}
function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && (0, import_node_crypto3.timingSafeEqual)(leftBuffer, rightBuffer);
}
function contextArchiveError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.name = "ContextArchiveError";
  return error;
}
function clampInteger(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

// packages/core/src/gateway/features/model-discovery.ts
function prepareClaudeAppDiscoveredModelRequest(config, method, path4, body) {
  if ((method || "GET").toUpperCase() !== "POST" || normalizeGatewayPathname(path4) !== "/v1/messages") {
    return void 0;
  }
  const parsedBody = parseJsonObjectSafe(body);
  const model = stringValue2(parsedBody?.model);
  const normalizedModel = normalizeRouteSelector(model);
  if (!parsedBody || !normalizedModel) {
    return void 0;
  }
  const routedModel = resolveClaudeAppGatewayRouteModel(
    normalizedModel,
    config,
    claudeAppGatewayModelRouteOptions
  );
  if (!routedModel || routedModel.toLowerCase() === normalizedModel.toLowerCase()) {
    return void 0;
  }
  return {
    body: serializeJsonBodyWithModel(parsedBody, routedModel),
    diagnostic: `${model}->${routedModel}`,
    routedModel
  };
}
function createGatewayModelsResponse(config, headers, apiKey) {
  const contextArchiveConfig = contextArchiveConfigForApiKey(config, apiKey);
  const contextArchiveCompact = Boolean(contextArchiveConfig && contextArchiveMcpEnabled(contextArchiveConfig));
  if (isClaudeAppApiKey(apiKey)) {
    return createClaudeAppGatewayModelsResponse(config, { contextArchiveCompact });
  }
  if (isClaudeCodeUserAgent(headers)) {
    return createClaudeAppGatewayModelsResponse(config, { claudeCode: true, contextArchiveCompact });
  }
  return createOpenAICompatibleGatewayModelsResponse(config);
}
function createOpenAICompatibleGatewayModelsResponse(config) {
  const data = buildGatewayDiscoverableModelIds(config).map((id) => {
    const catalogEntry = findModelCatalogEntry(id);
    return {
      id,
      object: "model",
      created: 0,
      owned_by: gatewayModelOwner(id),
      type: "model",
      ...catalogEntry?.displayName ? { display_name: catalogEntry.displayName } : {}
    };
  });
  return {
    object: "list",
    data
  };
}
function createClaudeAppGatewayModelsResponse(config, options = {}) {
  const routes = buildClaudeAppGatewayModelRoutes(config, claudeAppGatewayModelRouteOptions);
  const data = routes.map((route) => {
    const catalogId = stripClaudeCodeOneMillionContextSuffix(route.targetModel);
    const catalogEntry = findModelCatalogEntry(catalogId);
    const modelMetadata = providerModelMetadataForSelector(config, catalogId);
    const maxInputTokens = claudeGatewayModelContextWindow(catalogEntry, route.oneMillionContext, modelMetadata);
    const maxOutputTokens = modelCatalogMaxOutputTokens(catalogEntry);
    const exposeOneMillionContextVariant = options.claudeCode && route.oneMillionContext;
    return {
      id: exposeOneMillionContextVariant ? claudeCodeOneMillionContextModelId(route.id) : route.id,
      capabilities: createClaudeCodeModelCapabilities(catalogEntry, {
        contextArchiveCompact: options.contextArchiveCompact,
        maxInputTokens,
        oneMillionContext: route.oneMillionContext,
        ...providerModelCapabilityOverrides(modelMetadata)
      }),
      created_at: "1970-01-01T00:00:00Z",
      display_name: exposeOneMillionContextVariant ? `${route.displayName} (1M context)` : route.displayName,
      max_input_tokens: maxInputTokens,
      max_tokens: maxOutputTokens,
      type: "model"
    };
  });
  return {
    data,
    first_id: data[0]?.id ?? null,
    has_more: false,
    last_id: data[data.length - 1]?.id ?? null
  };
}
function claudeGatewayModelContextWindow(entry, oneMillionContext, metadata) {
  const providerContextWindow = effectiveProviderContextWindow(metadata);
  if (providerContextWindow) {
    return providerContextWindow;
  }
  const contextWindow = modelCatalogMaxInputTokens(entry);
  if (contextWindow > 0) {
    return contextWindow;
  }
  return oneMillionContext ? 1e6 : 0;
}
function effectiveProviderContextWindow(metadata) {
  const contextWindow = positiveInteger2(metadata?.contextWindow) ?? positiveInteger2(metadata?.maxContextWindow);
  if (!contextWindow) {
    return void 0;
  }
  const effectivePercent = percentage2(metadata?.effectiveContextWindowPercent) ?? 100;
  return Math.max(1, Math.floor(contextWindow * effectivePercent / 100));
}
function providerModelMetadataForSelector(config, selector) {
  const resolved = modelRegistryForConfig(config).resolveProviderModel(selector);
  if (!resolved) {
    return void 0;
  }
  const metadata = resolved.provider.modelMetadata ?? {};
  const direct = metadata[resolved.model];
  if (direct) {
    return direct;
  }
  const normalizedModel = resolved.model.toLowerCase();
  return Object.entries(metadata).find(([model]) => model.trim().toLowerCase() === normalizedModel)?.[1];
}
function percentage2(value) {
  return value !== void 0 && Number.isFinite(value) && value > 0 && value <= 100 ? value : void 0;
}
function positiveInteger2(value) {
  return value !== void 0 && Number.isFinite(value) && value > 0 ? Math.trunc(value) : void 0;
}
function buildGatewayDiscoverableModelIds(config) {
  const baseEntries = [];
  for (const provider of config.Providers) {
    const providerName = provider.name?.trim();
    if (!isGatewayProviderEnabled(provider) || !providerName || !Array.isArray(provider.models)) {
      continue;
    }
    for (const rawModel of provider.models) {
      const modelName = rawModel.trim();
      if (!modelName) {
        continue;
      }
      baseEntries.push({ modelName, providerName });
    }
  }
  const ids = baseEntries.map((entry) => `${entry.providerName}/${entry.modelName}`);
  for (const profile of config.virtualModelProfiles ?? []) {
    if (!isVisibleVirtualModelProfile(profile)) {
      continue;
    }
    for (const entry of baseEntries) {
      for (const prefix of profile.match?.prefixes ?? []) {
        const normalizedPrefix = prefix.trim();
        if (normalizedPrefix) {
          ids.push(`${entry.providerName}/${normalizedPrefix}${entry.modelName}`);
        }
      }
      for (const suffix of profile.match?.suffixes ?? []) {
        const normalizedSuffix = suffix.trim();
        if (normalizedSuffix) {
          ids.push(`${entry.providerName}/${entry.modelName}${normalizedSuffix}`);
        }
      }
    }
    for (const alias of profile.match?.exactAliases ?? []) {
      const normalizedAlias = alias.trim();
      if (!normalizedAlias) {
        continue;
      }
      ids.push(fusionModelSelector(normalizedAlias));
    }
  }
  return uniqueStrings4(ids);
}
function gatewayModelOwner(id) {
  const separator = id.indexOf("/");
  return separator > 0 ? id.slice(0, separator).trim() || "ccr" : "ccr";
}
function isVisibleVirtualModelProfile(profile) {
  return profile.enabled !== false && profile.materialization?.enabled !== false && profile.materialization?.includeInGatewayModels !== false;
}
function claudeCodeOneMillionContextModelId(id) {
  return hasClaudeCodeOneMillionContextSuffix(id) ? id : `${id}${claudeCodeOneMillionContextSuffix}`;
}
function hasClaudeCodeOneMillionContextSuffix(id) {
  return id.trim().toLowerCase().endsWith(claudeCodeOneMillionContextSuffix);
}
function stripClaudeCodeOneMillionContextSuffix(id) {
  return id.trim().replace(/\[1m\]$/i, "").trim();
}
function createClaudeCodeModelCapabilities(entry, options = {}) {
  if (!entry) {
    return createDefaultClaudeCodeModelCapabilities(options);
  }
  const capabilities = entry.capabilities ?? {};
  const inputModalities = new Set((entry.modalities?.input ?? []).map((item) => item.toLowerCase()));
  const outputModalities = new Set((entry.modalities?.output ?? []).map((item) => item.toLowerCase()));
  const supportsReasoning = options.reasoning ?? readCatalogCapability(capabilities, "reasoning");
  const supportsReasoningLevel = (effort) => options.reasoningLevels ? options.reasoningLevels.includes(effort) : supportsReasoning;
  const supportsImageInput = options.imageInput ?? (readCatalogCapability(capabilities, "imageInput") || inputModalities.has("image"));
  const supportsPdfInput = readCatalogCapability(capabilities, "pdfInput") || inputModalities.has("pdf");
  const catalogSupportsStructuredOutput = readCatalogCapability(capabilities, "structuredOutput") || readCatalogCapability(capabilities, "nativeStructuredOutput") || readCatalogCapability(capabilities, "responseSchema");
  const supportsStructuredOutput = catalogSupportsStructuredOutput;
  const supportsCodeExecution = readCatalogCapability(capabilities, "codeExecution");
  const supportsAdaptiveThinking = readCatalogCapability(capabilities, "adaptiveThinking");
  const catalogSupportsToolUse = readCatalogCapability(capabilities, "toolCalling") || readCatalogCapability(capabilities, "functionCalling");
  const supportsToolUse = catalogSupportsToolUse;
  const supportsBatch = readCatalogCapability(capabilities, "batch");
  const supportsCitations = readCatalogCapability(capabilities, "citations");
  const supportsAudioInput = readCatalogCapability(capabilities, "audioInput") || inputModalities.has("audio");
  const supportsAudioOutput = readCatalogCapability(capabilities, "audioOutput") || outputModalities.has("audio");
  const supportsVideoInput = readCatalogCapability(capabilities, "videoInput") || inputModalities.has("video");
  const maxInputTokens = options.maxInputTokens ?? modelCatalogMaxInputTokens(entry);
  const supportsOneMillionContext = maxInputTokens >= 1e6 || Boolean(entry.limits?.supports1MContext);
  return {
    audio_input: { supported: supportsAudioInput },
    audio_output: { supported: supportsAudioOutput },
    batch: { supported: supportsBatch },
    citations: { supported: supportsCitations },
    code_execution: { supported: supportsCodeExecution },
    context_management: {
      clear_thinking_20251015: { supported: supportsReasoning },
      clear_tool_uses_20250919: { supported: supportsToolUse },
      compact_20260112: { supported: options.contextArchiveCompact === true && maxInputTokens > 0 },
      max_input_tokens: maxInputTokens,
      supported: maxInputTokens > 0
    },
    context_window: {
      max_input_tokens: maxInputTokens,
      supported: maxInputTokens > 0,
      supports_1m_context: supportsOneMillionContext,
      one_million_context_variant: options.oneMillionContext === true
    },
    effort: {
      high: { supported: supportsReasoningLevel("high") },
      low: { supported: supportsReasoningLevel("low") },
      max: { supported: supportsReasoningLevel("max") },
      medium: { supported: supportsReasoningLevel("medium") },
      supported: supportsReasoning,
      ultra: { supported: supportsReasoningLevel("ultra") },
      xhigh: { supported: supportsReasoningLevel("xhigh") }
    },
    image_input: { supported: supportsImageInput },
    pdf_input: { supported: supportsPdfInput },
    structured_outputs: { supported: supportsStructuredOutput },
    thinking: {
      supported: supportsReasoning,
      types: {
        adaptive: { supported: supportsAdaptiveThinking },
        enabled: { supported: supportsReasoning }
      }
    },
    tool_use: { supported: supportsToolUse },
    video_input: { supported: supportsVideoInput }
  };
}
function createDefaultClaudeCodeModelCapabilities(options = {}) {
  const maxInputTokens = positiveInteger2(options.maxInputTokens);
  const supportsReasoning = options.reasoning ?? true;
  const supportsReasoningLevel = (effort) => options.reasoningLevels ? options.reasoningLevels.includes(effort) : supportsReasoning;
  return {
    audio_input: { supported: false },
    batch: { supported: true },
    citations: { supported: true },
    code_execution: { supported: true },
    context_management: {
      clear_thinking_20251015: { supported: supportsReasoning },
      clear_tool_uses_20250919: { supported: true },
      compact_20260112: { supported: options.contextArchiveCompact === true },
      ...maxInputTokens ? { max_input_tokens: maxInputTokens } : {},
      supported: true
    },
    ...maxInputTokens ? {
      context_window: {
        max_input_tokens: maxInputTokens,
        one_million_context_variant: options.oneMillionContext === true,
        supported: true,
        supports_1m_context: maxInputTokens >= 1e6
      }
    } : {},
    effort: {
      high: { supported: supportsReasoningLevel("high") },
      low: { supported: supportsReasoningLevel("low") },
      max: { supported: supportsReasoningLevel("max") },
      medium: { supported: supportsReasoningLevel("medium") },
      supported: supportsReasoning,
      ultra: { supported: supportsReasoningLevel("ultra") },
      xhigh: { supported: supportsReasoningLevel("xhigh") }
    },
    image_input: { supported: options.imageInput ?? true },
    pdf_input: { supported: true },
    structured_outputs: { supported: true },
    thinking: {
      supported: supportsReasoning,
      types: {
        adaptive: { supported: supportsReasoning },
        enabled: { supported: supportsReasoning }
      }
    },
    tool_use: { supported: true },
    video_input: { supported: false }
  };
}
function providerModelCapabilityOverrides(metadata) {
  const imageInput = metadata?.capabilities?.imageInput;
  const imageOverride = imageInput === void 0 ? {} : { imageInput };
  if (metadata?.supportedReasoningLevels !== void 0) {
    const reasoningLevels = uniqueStrings4(
      metadata.supportedReasoningLevels.map((level) => level.effort.trim().toLowerCase()).filter(Boolean)
    );
    return {
      ...imageOverride,
      reasoning: reasoningLevels.length > 0,
      reasoningLevels
    };
  }
  return metadata?.supportsReasoningSummaries === void 0 ? imageOverride : { ...imageOverride, reasoning: metadata.supportsReasoningSummaries };
}
function normalizeGatewayPathname(path4) {
  const normalized = path4.trim().replace(/\/+$/, "");
  return normalized || "/";
}
function isClaudeCodeUserAgent(headers) {
  const userAgent = readHeader2(headers["user-agent"]);
  if (!userAgent) {
    return false;
  }
  const normalized = userAgent.toLowerCase();
  return normalized.includes("claude");
}
function isClaudeAppApiKey(apiKey) {
  const name = apiKey?.name?.trim().toLowerCase();
  return name === "claude app";
}

// packages/core/test/unit/agents/claude-app-gateway-models.test.mjs
function createConfig({ profileModel, providers = [], virtualModelProfiles = [] } = {}) {
  return {
    Providers: providers.map((provider) => ({ ...provider })),
    profile: {
      enabled: true,
      profiles: profileModel === void 0 ? [] : [{
        agent: "claude-code",
        enabled: true,
        id: "claude-code-global",
        model: profileModel,
        name: "Claude Code",
        scope: "global"
      }]
    },
    virtualModelProfiles
  };
}
function createClaudeModelsResponse(config) {
  return createGatewayModelsResponse(
    config,
    { "user-agent": "claude-app/1.0" },
    { name: "Claude App" }
  );
}
function createClaudeCodeModelsResponse(config) {
  return createGatewayModelsResponse(config, { "user-agent": "claude-cli/2.1.215" });
}
function assertPublishedRoutesResolveUniquely(config) {
  const registry = new ModelRegistry(config);
  const routes = buildClaudeAppGatewayModelRoutes(config);
  const response = createClaudeModelsResponse(config);
  import_strict.default.deepEqual(response.data.map((model) => model.id), routes.map((route) => route.id));
  for (const route of routes) {
    import_strict.default.equal(resolveClaudeAppGatewayRouteModel(route.id, config), route.targetModel);
    import_strict.default.equal(registry.resolve(route.targetModel)?.canonicalSelector, route.targetModel);
  }
}
(0, import_node_test.default)("issue 1535 Claude App discovery defaults to the first configured provider model", () => {
  const config = createConfig({
    providers: [
      { models: ["gpt-4.1"], name: "Provider-1" },
      { models: ["claude-sonnet-4-5"], name: "Provider-2" }
    ]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);
  const response = createClaudeModelsResponse(config);
  import_strict.default.equal(inferClaudeAppGatewayTargetModel(config), "Provider-1/gpt-4.1");
  import_strict.default.equal(routes[0].targetModel, "Provider-1/gpt-4.1");
  import_strict.default.equal(response.first_id, routes[0].id);
  import_strict.default.equal(routes.some((route) => route.targetModel === "claude-sonnet-4-5"), false);
  assertPublishedRoutesResolveUniquely(config);
});
(0, import_node_test.default)("issue 1535 the discovered default is routable and the bare fallback resolves to a provider", () => {
  const config = createConfig({
    providers: [
      { models: ["AED"], name: "provider-1" },
      { models: ["claude-sonnet-4-5"], name: "provider-2" },
      { models: ["deepseek-v4-flash"], name: "provider-3" }
    ]
  });
  const response = createClaudeModelsResponse(config);
  import_strict.default.equal(
    response.data.some((model) => model.id === "claude-sonnet-4-5"),
    false,
    "the unroutable bare fallback must never be published by GET /v1/models"
  );
  import_strict.default.ok(response.first_id, "discovery must publish a routable default model");
  const rewritten = prepareClaudeAppDiscoveredModelRequest(
    config,
    "POST",
    "/v1/messages",
    Buffer.from(JSON.stringify({ messages: [], model: response.first_id }))
  );
  import_strict.default.equal(
    rewritten?.routedModel,
    "provider-1/AED",
    "the discovered default must round-trip to a provider-prefixed selector instead of model-chain fallback"
  );
  const registry = new ModelRegistry(config);
  import_strict.default.equal(
    registry.resolve("claude-sonnet-4-5")?.canonicalSelector,
    "provider-2/claude-sonnet-4-5",
    "a bare fallback model id must resolve to a provider rather than going unroutable"
  );
});
(0, import_node_test.default)("issue 1535 Claude App discovery canonicalizes a uniquely configured bare profile model", () => {
  const config = createConfig({
    profileModel: "claude-sonnet-4-5",
    providers: [
      { models: ["gpt-4.1"], name: "Provider-1" },
      { models: ["claude-sonnet-4-5"], name: "Provider-2" }
    ]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);
  import_strict.default.equal(inferClaudeAppGatewayTargetModel(config), "Provider-2/claude-sonnet-4-5");
  import_strict.default.equal(routes[0].targetModel, "Provider-2/claude-sonnet-4-5");
  assertPublishedRoutesResolveUniquely(config);
});
(0, import_node_test.default)("issue 1535 duplicate provider model names keep distinct deterministic Claude App routes", () => {
  const config = createConfig({
    profileModel: "claude-sonnet-4-5",
    providers: [
      { models: ["claude-sonnet-4-5"], name: "Provider-1" },
      { models: ["claude-sonnet-4-5"], name: "Provider-2" }
    ]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);
  import_strict.default.equal(inferClaudeAppGatewayTargetModel(config), "Provider-1/claude-sonnet-4-5");
  import_strict.default.deepEqual(
    routes.map((route) => route.targetModel),
    ["Provider-1/claude-sonnet-4-5", "Provider-2/claude-sonnet-4-5"]
  );
  import_strict.default.equal(new Set(routes.map((route) => route.id.toLowerCase())).size, 2);
  assertPublishedRoutesResolveUniquely(config);
});
(0, import_node_test.default)("issue 1535 historical fallback IDs are never special-cased", () => {
  const configuredLegacyModel = createConfig({
    providers: [
      { models: ["gpt-4.1"], name: "Provider-1" },
      { models: ["claude-sonnet-4-5"], name: "Provider-2" }
    ]
  });
  const unconfiguredLegacyModel = createConfig({
    providers: [{ models: ["gpt-4.1"], name: "Provider-1" }]
  });
  const body = Buffer.from(JSON.stringify({ messages: [], model: "claude-sonnet-4-5" }));
  import_strict.default.equal(prepareClaudeAppDiscoveredModelRequest(
    configuredLegacyModel,
    "POST",
    "/v1/messages",
    body
  ), void 0);
  import_strict.default.equal(prepareClaudeAppDiscoveredModelRequest(
    unconfiguredLegacyModel,
    "POST",
    "/v1/messages",
    body
  ), void 0);
  import_strict.default.equal(
    buildClaudeAppGatewayModelRoutes(unconfiguredLegacyModel).some((route) => route.id === "claude-sonnet-4-5" || route.targetModel === "claude-sonnet-4-5"),
    false
  );
});
(0, import_node_test.default)("issue 1535 Claude App discovery publishes no synthetic model without configured providers", () => {
  const config = createConfig();
  const response = createClaudeModelsResponse(config);
  import_strict.default.equal(inferClaudeAppGatewayTargetModel(config), void 0);
  import_strict.default.deepEqual(buildClaudeAppGatewayModelRoutes(config), []);
  import_strict.default.deepEqual(buildClaudeAppGatewayInferenceModels(config), []);
  import_strict.default.deepEqual(response.data, []);
  import_strict.default.equal(response.first_id, null);
  import_strict.default.equal(response.last_id, null);
  import_strict.default.equal(
    prepareClaudeAppDiscoveredModelRequest(
      config,
      "POST",
      "/v1/messages",
      Buffer.from(JSON.stringify({ messages: [], model: "claude-sonnet-4-5" }))
    ),
    void 0
  );
});
(0, import_node_test.default)("issue 1535 canonical profile resolution preserves the Claude App 1M context variant", () => {
  const config = createConfig({
    profileModel: "claude-opus-4-1[1m]",
    providers: [{ models: ["claude-opus-4-1"], name: "Anthropic" }]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);
  import_strict.default.equal(inferClaudeAppGatewayTargetModel(config), "Anthropic/claude-opus-4-1[1m]");
  import_strict.default.equal(routes[0].targetModel, "Anthropic/claude-opus-4-1");
  import_strict.default.equal(routes[0].oneMillionContext, true);
  assertPublishedRoutesResolveUniquely(config);
});
(0, import_node_test.default)("Claude App marks a custom model with a configured 1M context window", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          aaa: {
            contextWindow: 1e6,
            maxContextWindow: 1e6
          }
        },
        models: ["aaa"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      }
    ]
  });
  const route = buildClaudeAppGatewayModelRoutes(config)[0];
  const inferenceModel = buildClaudeAppGatewayInferenceModels(config)[0];
  const discoveredModel = createClaudeModelsResponse(config).data[0];
  import_strict.default.equal(route.oneMillionContext, true);
  import_strict.default.equal(inferenceModel.supports1m, true);
  import_strict.default.equal(discoveredModel.max_input_tokens, 1e6);
  import_strict.default.equal(discoveredModel.capabilities.context_window.max_input_tokens, 1e6);
  import_strict.default.equal(discoveredModel.capabilities.context_window.supports_1m_context, true);
  import_strict.default.equal(discoveredModel.capabilities.context_window.one_million_context_variant, true);
});
(0, import_node_test.default)("Claude Code exposes a configured 1M context window as a visible model variant", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          aaa: {
            contextWindow: 1e6,
            maxContextWindow: 1e6
          }
        },
        models: ["aaa"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      }
    ]
  });
  const discoveredModel = createClaudeCodeModelsResponse(config).data[0];
  import_strict.default.match(discoveredModel.id, /\[1m\]$/);
  import_strict.default.equal(discoveredModel.display_name, "Zhipu AI (China) - Coding Plan/aaa (1M context)");
  import_strict.default.equal(discoveredModel.max_input_tokens, 1e6);
  import_strict.default.equal(discoveredModel.capabilities.context_window.one_million_context_variant, true);
  const rewrite = prepareClaudeAppDiscoveredModelRequest(
    config,
    "POST",
    "/v1/messages",
    Buffer.from(JSON.stringify({ messages: [], model: discoveredModel.id }))
  );
  import_strict.default.equal(rewrite?.routedModel, "Zhipu AI (China) - Coding Plan/aaa");
});
(0, import_node_test.default)("Claude App discovery publishes the effective provider context for uncatalogued models", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          "gpt-5.6-sol": {
            contextWindow: 272e3,
            effectiveContextWindowPercent: 95,
            maxContextWindow: 272e3
          }
        },
        models: ["gpt-5.6-sol"],
        name: "Codex API",
        type: "openai_responses"
      }
    ]
  });
  const route = buildClaudeAppGatewayModelRoutes(config)[0];
  const response = createClaudeModelsResponse(config);
  const model = response.data.find((item) => item.id === route.id);
  import_strict.default.ok(model);
  import_strict.default.equal(model.max_input_tokens, 258400);
  import_strict.default.equal(model.capabilities.context_management.max_input_tokens, 258400);
  import_strict.default.equal(model.capabilities.context_window.max_input_tokens, 258400);
});
(0, import_node_test.default)("Claude App discovery honors configured reasoning levels for uncatalogued models", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          "custom-model": {
            capabilities: { imageInput: false },
            contextWindow: 64e3,
            supportedReasoningLevels: [
              { description: "Low", effort: "low" },
              { description: "High", effort: "high" },
              { description: "Ultra", effort: "ultra" }
            ],
            supportsReasoningSummaries: true
          }
        },
        models: ["custom-model"],
        name: "Custom",
        type: "openai_responses"
      }
    ]
  });
  const response = createClaudeModelsResponse(config);
  const model = response.data[0];
  import_strict.default.ok(model);
  import_strict.default.equal(model.max_input_tokens, 64e3);
  import_strict.default.equal(model.capabilities.image_input.supported, false);
  import_strict.default.equal(model.capabilities.thinking.supported, true);
  import_strict.default.equal(model.capabilities.effort.low.supported, true);
  import_strict.default.equal(model.capabilities.effort.medium.supported, false);
  import_strict.default.equal(model.capabilities.effort.high.supported, true);
  import_strict.default.equal(model.capabilities.effort.xhigh.supported, false);
  import_strict.default.equal(model.capabilities.effort.max.supported, false);
  import_strict.default.equal(model.capabilities.effort.ultra.supported, true);
});
(0, import_node_test.default)("Claude App discovery prefers provider context metadata over the static catalog", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          "gpt-5-codex": {
            contextWindow: 272e3,
            effectiveContextWindowPercent: 90,
            maxContextWindow: 272e3
          }
        },
        models: ["gpt-5-codex"],
        name: "Codex API",
        type: "openai_responses"
      }
    ]
  });
  const route = buildClaudeAppGatewayModelRoutes(config)[0];
  const response = createClaudeModelsResponse(config);
  const model = response.data.find((item) => item.id === route.id);
  import_strict.default.ok(model);
  import_strict.default.equal(model.max_input_tokens, 244800);
  import_strict.default.equal(model.capabilities.context_management.max_input_tokens, 244800);
  import_strict.default.equal(model.capabilities.context_window.max_input_tokens, 244800);
});
