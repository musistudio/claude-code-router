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

// packages/core/test/unit/agents/local-agent-provider-opencode.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_fs3 = require("node:fs");
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/agents/local-providers/opencode.ts
var import_node_fs2 = require("node:fs");
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));

// packages/core/src/agents/local-providers/shared.ts
var import_node_fs = require("node:fs");
var providerNamePlaceholder = "__CCR_PROVIDER_NAME__";
var providerNameSlugPlaceholder = "__CCR_PROVIDER_NAME_SLUG__";
var providerInternalNamePlaceholder = "__CCR_PROVIDER_INTERNAL_NAME__";
var localAgentProviderApiKey = "ccr-local-agent-login";
function missingCandidate(kind, id, name, protocol, models, modelDisplayNames) {
  return {
    detail: "No local login state was found for this agent.",
    id,
    importable: false,
    kind,
    modelDisplayNames: modelDisplayNamesForModels(modelDisplayNames, models),
    models,
    name,
    protocol,
    status: "missing"
  };
}
function providerPayload(candidate, name, baseUrl, account) {
  const models = uniqueStrings(candidate.models).slice(0, 24);
  return {
    account,
    apiKey: localAgentProviderApiKey,
    baseUrl,
    modelDisplayNames: modelDisplayNamesForModels(candidate.modelDisplayNames, models),
    modelMetadata: modelMetadataForModels(candidate.modelMetadata, models),
    models,
    name,
    protocol: candidate.protocol
  };
}
function modelMetadataForModels(value, models) {
  const modelIds = new Set(models);
  const entries = Object.entries(value ?? {}).map(([rawModel, metadata]) => [rawModel.trim(), metadata]).filter(([model, metadata]) => model && modelIds.has(model) && metadata && typeof metadata === "object");
  return entries.length > 0 ? Object.fromEntries(entries) : void 0;
}
function modelDisplayNamesForModels(value, models) {
  const modelIds = new Set(models);
  const entries = Object.entries(value ?? {}).map(([rawModel, rawDisplayName]) => [rawModel.trim(), rawDisplayName.trim()]).filter(([model, displayName]) => model && displayName && model !== displayName && modelIds.has(model));
  return entries.length > 0 ? Object.fromEntries(entries) : void 0;
}
function bearerAuthPlugin(suffix, token, headers = {}, providerName = providerNamePlaceholder) {
  return {
    auth: {
      headers: {
        authorization: `Bearer ${token}`,
        ...headers
      },
      removeHeaders: ["x-api-key"],
      strict: true
    },
    key: `ccr-local-agent-${providerNameSlugPlaceholder}-${suffix}`,
    providerName
  };
}
function apiKeyAuthPlugin(suffix, apiKey, providerName = providerNamePlaceholder) {
  return {
    auth: {
      headers: {
        "x-api-key": apiKey
      },
      removeHeaders: ["authorization"],
      strict: true
    },
    key: `ccr-local-agent-${providerNameSlugPlaceholder}-${suffix}`,
    providerName
  };
}
function readJsonRecord(file) {
  if (!(0, import_node_fs.existsSync)(file)) {
    return void 0;
  }
  try {
    const parsed = JSON.parse((0, import_node_fs.readFileSync)(file, "utf8"));
    return isRecord(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function readJsoncRecord(file) {
  if (!(0, import_node_fs.existsSync)(file)) {
    return void 0;
  }
  try {
    return parseJsoncRecord((0, import_node_fs.readFileSync)(file, "utf8"));
  } catch {
    return void 0;
  }
}
function parseJsoncRecord(value) {
  try {
    const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(value));
    return isRecord(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function stripJsonCommentsAndTrailingCommas(value) {
  let withoutComments = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];
    if (inString) {
      withoutComments += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      withoutComments += character;
      continue;
    }
    if (character === "/" && nextCharacter === "/") {
      withoutComments += "  ";
      index += 1;
      while (index + 1 < value.length && value[index + 1] !== "\n" && value[index + 1] !== "\r") {
        withoutComments += " ";
        index += 1;
      }
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      withoutComments += "  ";
      index += 1;
      while (index + 1 < value.length) {
        const commentCharacter = value[index + 1];
        const commentNextCharacter = value[index + 2];
        if (commentCharacter === "*" && commentNextCharacter === "/") {
          withoutComments += "  ";
          index += 2;
          break;
        }
        withoutComments += commentCharacter === "\n" || commentCharacter === "\r" ? commentCharacter : " ";
        index += 1;
      }
      continue;
    }
    withoutComments += character;
  }
  let result = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let lookahead = index + 1;
      while (lookahead < withoutComments.length && /\s/.test(withoutComments[lookahead])) {
        lookahead += 1;
      }
      if (withoutComments[lookahead] === "}" || withoutComments[lookahead] === "]") {
        continue;
      }
    }
    result += character;
  }
  return result;
}
function uniqueProviderName(existingNames, baseName) {
  const existing = new Set(existingNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (!existing.has(baseName.toLowerCase())) {
    return baseName;
  }
  for (let index = 2; index < 1e3; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${baseName} ${Date.now()}`;
}
function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function uniqueStrings(values) {
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
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/src/agents/local-providers/opencode.ts
var openCodeProviderId = "opencode";
var openCodeDefaultBaseUrl = "https://opencode.ai/zen/v1";
var openCodeProtocolOrder = [
  "openai_responses",
  "anthropic_messages",
  "openai_chat_completions",
  "gemini_generate_content"
];
var openCodeProtocolLabels = {
  anthropic_messages: "Anthropic",
  gemini_generate_content: "Gemini",
  openai_chat_completions: "Chat Completions",
  openai_responses: "Responses"
};
var openCodeFallbackModels = {
  anthropic_messages: ["claude-sonnet-4-5"],
  gemini_generate_content: ["gemini-3-flash"],
  openai_chat_completions: ["big-pickle"],
  openai_responses: ["gpt-5.2"]
};
function opencodeCandidates() {
  const credential = readOpenCodeCredential();
  const invalidCredential = Boolean(credential?.hasCredential && !credential.apiKey);
  const publicOnly = !credential;
  const catalog = readOpenCodeCatalog({ publicOnly });
  const sourceFile = credential?.sourceFile || openCodeModelsCacheFile();
  return openCodeProtocolOrder.map((protocol) => {
    const providerName = publicOnly ? "OpenCode Public" : catalog.name;
    const name = `${providerName} (${openCodeProtocolLabels[protocol]})`;
    const id = `opencode-api-${protocol.replaceAll("_", "-")}`;
    const models = catalog.models[protocol];
    const modelDisplayNames = catalog.modelDisplayNames[protocol];
    if (publicOnly && models.length > 0) {
      return {
        detail: "OpenCode CLI public models detected. No login is required.",
        id,
        importable: true,
        kind: "opencode",
        modelDisplayNames,
        models,
        name,
        protocol,
        sourceFile,
        status: "available"
      };
    }
    if (invalidCredential) {
      return {
        detail: "OpenCode CLI credential was found, but no usable API key was detected.",
        id,
        importable: false,
        kind: "opencode",
        modelDisplayNames,
        models,
        name,
        protocol,
        sourceFile,
        status: "locked"
      };
    }
    if (credential?.apiKey) {
      return {
        detail: "OpenCode CLI login detected. Click Import to add it as a gateway provider.",
        id,
        importable: true,
        kind: "opencode",
        modelDisplayNames,
        models,
        name,
        protocol,
        sourceFile: credential.sourceFile,
        status: "available"
      };
    }
    return missingCandidate("opencode", id, name, protocol, models, modelDisplayNames);
  });
}
function importOpenCodeProvider(candidate, providerNames) {
  const credential = readOpenCodeCredential();
  if (credential?.hasCredential && !credential.apiKey) {
    throw new Error("OpenCode CLI API key was not found.");
  }
  const publicOnly = !credential;
  const catalog = readOpenCodeCatalog({ publicOnly });
  if (!isOpenCodeProtocol(candidate.protocol)) {
    throw new Error(`Unsupported OpenCode protocol: ${candidate.protocol}`);
  }
  const protocol = candidate.protocol;
  if (publicOnly && !candidate.models.every((model) => catalog.models[protocol].includes(model))) {
    throw new Error("OpenCode CLI public models were not found.");
  }
  const provider = providerPayload(
    candidate,
    uniqueProviderName(providerNames, candidate.name),
    catalog.baseUrl
  );
  if (publicOnly) {
    return {
      candidate,
      provider: {
        ...provider,
        apiKey: "public"
      },
      providerPlugins: []
    };
  }
  const apiKey = credential?.apiKey;
  if (!apiKey) {
    throw new Error("OpenCode CLI API key was not found.");
  }
  const authSuffix = `opencode-${candidate.protocol.replaceAll("_", "-")}-api-key`;
  return {
    candidate,
    provider,
    providerPlugins: [
      openCodeAuthPlugin(candidate.protocol, authSuffix, apiKey),
      openCodeAuthPlugin(candidate.protocol, `${authSuffix}-internal`, apiKey, providerInternalNamePlaceholder)
    ]
  };
}
function removeOpenCodeProviderAccountConfig(provider) {
  const account = provider.account;
  if (!account?.connectors?.some(isGeneratedOpenCodeAccountConnector)) {
    return provider;
  }
  const connectors = account.connectors.filter((connector) => !isGeneratedOpenCodeAccountConnector(connector));
  return {
    ...provider,
    account: connectors.length > 0 ? { ...account, connectors } : void 0
  };
}
function isGeneratedOpenCodeAccountConnector(connector) {
  if (connector.type !== "local-estimate") {
    return false;
  }
  const ids = new Set(connector.windows.map((window) => window.id));
  return ids.has("opencode_monthly_spend") && ids.has("opencode_monthly_tokens") && ids.has("opencode_monthly_requests");
}
function openCodeAuthPlugin(protocol, suffix, apiKey, providerName = providerNamePlaceholder) {
  if (protocol === "anthropic_messages") {
    return apiKeyAuthPlugin(suffix, apiKey, providerName);
  }
  if (protocol === "gemini_generate_content" || protocol === "gemini_interactions") {
    return {
      auth: {
        headers: {
          "x-goog-api-key": apiKey
        },
        query: {
          key: apiKey
        },
        removeHeaders: ["authorization", "x-api-key"],
        strict: true
      },
      key: `ccr-local-agent-${providerNameSlugPlaceholder}-${suffix}`,
      providerName
    };
  }
  return bearerAuthPlugin(suffix, apiKey, {}, providerName);
}
function readOpenCodeCredential() {
  const config = readOpenCodeConfig();
  const configuredApiKey = configuredOpenCodeApiKey(config);
  const configuredApiKeyPresent = configuredOpenCodeApiKeyIsPresent(config);
  if (configuredApiKey) {
    return {
      apiKey: configuredApiKey,
      hasCredential: true,
      sourceFile: config.sourceFile || "OpenCode config"
    };
  }
  const inlineAuth = process.env.OPENCODE_AUTH_CONTENT?.trim();
  if (inlineAuth) {
    const record = parseJsoncRecord(inlineAuth);
    const credential = openCodeCredentialFromRecord(record, "env:OPENCODE_AUTH_CONTENT");
    if (credential) {
      return credential;
    }
  }
  for (const sourceFile of openCodeAuthFiles()) {
    const record = readJsonRecord(sourceFile);
    if (!record) {
      continue;
    }
    const credential = openCodeCredentialFromRecord(record, sourceFile);
    if (credential) {
      return credential;
    }
  }
  const environmentApiKey = process.env.OPENCODE_API_KEY?.trim();
  if (environmentApiKey) {
    return { apiKey: environmentApiKey, hasCredential: true, sourceFile: "env:OPENCODE_API_KEY" };
  }
  return configuredApiKeyPresent ? { hasCredential: true, sourceFile: config.sourceFile || "OpenCode config" } : void 0;
}
function openCodeCredentialFromRecord(record, sourceFile) {
  if (!record || !(openCodeProviderId in record)) {
    return void 0;
  }
  const value = record[openCodeProviderId];
  if (typeof value === "string") {
    return {
      apiKey: readString(value),
      hasCredential: true,
      sourceFile
    };
  }
  if (!isRecord(value)) {
    return { hasCredential: true, sourceFile };
  }
  return {
    apiKey: readString(value.key) || readString(value.access) || readString(value.token),
    hasCredential: true,
    sourceFile
  };
}
function configuredOpenCodeApiKey(config) {
  const value = configuredOpenCodeApiKeyValue(config);
  if (!value) {
    return void 0;
  }
  const environmentReference = value.match(/^\{env:([^}]+)\}$/);
  if (environmentReference) {
    return process.env[environmentReference[1]]?.trim() || void 0;
  }
  const fileReference = value.match(/^\{file:([^}]+)\}$/);
  if (fileReference) {
    try {
      const sourceDirectory = config.sourceFile && !config.sourceFile.startsWith("env:") ? import_node_path.default.dirname(config.sourceFile) : void 0;
      return (0, import_node_fs2.readFileSync)(resolveOpenCodeReferencePath(fileReference[1], sourceDirectory), "utf8").trim() || void 0;
    } catch {
      return void 0;
    }
  }
  return value;
}
function configuredOpenCodeApiKeyIsPresent(config) {
  return Boolean(configuredOpenCodeApiKeyValue(config));
}
function configuredOpenCodeApiKeyValue(config) {
  const provider = openCodeProviderConfig(config.record);
  const options = isRecord(provider?.options) ? provider.options : {};
  return readString(options.apiKey) || readString(options.api_key);
}
function readOpenCodeCatalog(options) {
  const cache = readJsonRecord(openCodeModelsCacheFile());
  const cachedProvider = isRecord(cache?.[openCodeProviderId]) ? cache[openCodeProviderId] : {};
  const config = readOpenCodeConfig().record;
  const configuredProvider = openCodeProviderConfig(config) ?? {};
  const configuredOptions = isRecord(configuredProvider.options) ? configuredProvider.options : {};
  const baseUrl = readString(configuredOptions.baseURL) || readString(configuredOptions.baseUrl) || readString(cachedProvider.api) || openCodeDefaultBaseUrl;
  const name = readString(configuredProvider.name) || readString(cachedProvider.name) || "OpenCode Zen";
  const providerNpm = readString(configuredProvider.npm) || readString(cachedProvider.npm) || "@ai-sdk/openai-compatible";
  const cachedModels = isRecord(cachedProvider.models) ? cachedProvider.models : {};
  const configuredModels = isRecord(configuredProvider.models) ? configuredProvider.models : {};
  const configuredModelIds = new Set(Object.keys(configuredModels));
  const mergedModels = /* @__PURE__ */ new Map();
  for (const [modelId, value] of Object.entries(cachedModels)) {
    if (isRecord(value)) {
      mergedModels.set(modelId, value);
    }
  }
  for (const [modelId, value] of Object.entries(configuredModels)) {
    const previous = mergedModels.get(modelId) ?? {};
    mergedModels.set(modelId, isRecord(value) ? deepMergeRecords(previous, value) : previous);
  }
  const selectedModels = uniqueStrings([
    openCodeModelId(readString(config.model)),
    openCodeModelId(readString(config.small_model))
  ]);
  const orderedModelIds = uniqueStrings([...selectedModels, ...mergedModels.keys()]);
  const models = emptyOpenCodeProtocolRecord(() => []);
  const modelDisplayNames = emptyOpenCodeProtocolRecord(() => ({}));
  for (const configuredModelId of orderedModelIds) {
    const model = mergedModels.get(configuredModelId);
    if (!model || readString(model.status) === "deprecated" && !configuredModelIds.has(configuredModelId) && !selectedModels.includes(configuredModelId)) {
      continue;
    }
    if (options.publicOnly && !openCodeModelIsFree(model)) {
      continue;
    }
    const modelId = readString(model.id) || configuredModelId;
    const modelProvider = isRecord(model.provider) ? model.provider : {};
    const protocol = openCodeProtocolFromNpm(readString(modelProvider.npm) || readString(model.npm) || providerNpm);
    models[protocol].push(modelId);
    const displayName = readString(model.name);
    if (displayName && displayName !== modelId) {
      modelDisplayNames[protocol][modelId] = displayName;
    }
  }
  for (const protocol of openCodeProtocolOrder) {
    models[protocol] = uniqueStrings(
      models[protocol].length > 0 ? models[protocol] : options.publicOnly ? [] : openCodeFallbackModels[protocol]
    );
    const allowedModels = new Set(models[protocol]);
    modelDisplayNames[protocol] = Object.fromEntries(
      Object.entries(modelDisplayNames[protocol]).filter(([modelId]) => allowedModels.has(modelId))
    );
  }
  return { baseUrl, modelDisplayNames, models, name };
}
function openCodeModelIsFree(model) {
  const cost = isRecord(model.cost) ? model.cost : void 0;
  if (!cost) {
    return false;
  }
  return requiredOpenCodeCostIsFree(cost.input) && requiredOpenCodeCostIsFree(cost.output) && optionalOpenCodeCostFieldsAreFree(cost, [
    "cache_read",
    "cache_write",
    "cacheRead",
    "cacheWrite",
    "input_cache_read",
    "input_cache_write"
  ]);
}
function requiredOpenCodeCostIsFree(value) {
  return openCodeCostValue(value) === 0;
}
function optionalOpenCodeCostIsFree(value) {
  const cost = openCodeCostValue(value);
  return cost === void 0 || cost === 0;
}
function optionalOpenCodeCostFieldsAreFree(cost, fields) {
  return fields.every((field) => optionalOpenCodeCostIsFree(cost[field]));
}
function openCodeCostValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(readString(value));
  return Number.isFinite(parsed) ? parsed : void 0;
}
function openCodeProtocolFromNpm(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("anthropic")) {
    return "anthropic_messages";
  }
  if (normalized.includes("google")) {
    return "gemini_generate_content";
  }
  if (normalized === "@ai-sdk/openai" || normalized.endsWith("/openai")) {
    return "openai_responses";
  }
  return "openai_chat_completions";
}
function isOpenCodeProtocol(protocol) {
  return protocol !== "gemini_interactions";
}
function openCodeModelId(value) {
  if (!value?.startsWith(`${openCodeProviderId}/`)) {
    return void 0;
  }
  return readString(value.slice(openCodeProviderId.length + 1));
}
function openCodeProviderConfig(config) {
  const providers = isRecord(config.provider) ? config.provider : void 0;
  return isRecord(providers?.[openCodeProviderId]) ? providers[openCodeProviderId] : void 0;
}
function readOpenCodeConfig() {
  let record = {};
  let sourceFile;
  for (const file of openCodeConfigFiles()) {
    const next = readJsoncRecord(file);
    if (!next) {
      continue;
    }
    record = deepMergeRecords(record, next);
    if (openCodeProviderConfig(next)) {
      sourceFile = file;
    }
  }
  const inlineConfig = process.env.OPENCODE_CONFIG_CONTENT?.trim();
  if (inlineConfig) {
    const next = parseJsoncRecord(inlineConfig);
    if (next) {
      record = deepMergeRecords(record, next);
      if (openCodeProviderConfig(next)) {
        sourceFile = "env:OPENCODE_CONFIG_CONTENT";
      }
    }
  }
  return { record, sourceFile };
}
function deepMergeRecords(left, right) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    result[key] = isRecord(result[key]) && isRecord(value) ? deepMergeRecords(result[key], value) : value;
  }
  return result;
}
function emptyOpenCodeProtocolRecord(factory) {
  return Object.fromEntries(openCodeProtocolOrder.map((protocol) => [protocol, factory(protocol)]));
}
function openCodeAuthFiles() {
  return uniqueStrings([
    import_node_path.default.join(openCodeDataRoot(), "auth.json")
  ]);
}
function openCodeConfigFiles() {
  const customConfig = process.env.OPENCODE_CONFIG?.trim();
  return uniqueStrings([
    import_node_path.default.join(openCodeConfigRoot(), "opencode.json"),
    import_node_path.default.join(openCodeConfigRoot(), "opencode.jsonc"),
    import_node_path.default.join(openCodeDataRoot(), "opencode.json"),
    import_node_path.default.join(openCodeDataRoot(), "opencode.jsonc"),
    customConfig ? resolveOpenCodeReferencePath(customConfig) : void 0
  ]).filter((file) => (0, import_node_fs2.existsSync)(file));
}
function openCodeDataRoot() {
  return import_node_path.default.join(openCodeXdgRoot("XDG_DATA_HOME", import_node_path.default.join(".local", "share")), "opencode");
}
function openCodeConfigRoot() {
  return import_node_path.default.join(openCodeXdgRoot("XDG_CONFIG_HOME", ".config"), "opencode");
}
function openCodeModelsCacheFile() {
  return import_node_path.default.join(openCodeXdgRoot("XDG_CACHE_HOME", ".cache"), "opencode", "models.json");
}
function openCodeXdgRoot(environmentName, fallback) {
  const internalHome = process.env.CCR_INTERNAL_HOME_DIR?.trim();
  if (internalHome) {
    return import_node_path.default.join(internalHome, fallback);
  }
  const explicitRoot = process.env[environmentName]?.trim();
  return explicitRoot || import_node_path.default.join(openCodeHomeDir(), fallback);
}
function openCodeHomeDir() {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || import_node_os.default.homedir();
}
function resolveOpenCodeReferencePath(value, baseDirectory) {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return openCodeHomeDir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return import_node_path.default.join(openCodeHomeDir(), trimmed.slice(2));
  }
  return import_node_path.default.resolve(baseDirectory || process.cwd(), trimmed);
}

// packages/core/test/unit/agents/local-agent-provider-opencode.test.mjs
(0, import_node_test.default)("OpenCode local provider imports Zen models using each model's native protocol", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeAuth(home, {
      opencode: {
        key: "opencode-zen-key",
        type: "api"
      }
    });
    writeOpenCodeModels(home, {
      api: "https://opencode.ai/zen/v1",
      models: {
        "gpt-current": {
          name: "GPT Current",
          provider: { npm: "@ai-sdk/openai" }
        },
        "claude-current": {
          name: "Claude Current",
          provider: { npm: "@ai-sdk/anthropic" }
        },
        "chat-current": {
          name: "Chat Current"
        },
        "gemini-current": {
          name: "Gemini Current",
          provider: { npm: "@ai-sdk/google" }
        },
        "gpt-deprecated": {
          name: "GPT Deprecated",
          provider: { npm: "@ai-sdk/openai" },
          status: "deprecated"
        }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    });
    writeOpenCodeConfig(home, `{
      // OpenCode accepts JSONC and trailing commas.
      "model": "opencode/gpt-current",
      "provider": {
        "opencode": {
          "name": "OpenCode Local",
          "options": {
            "baseURL": "https://opencode.example/v1",
          },
          "models": {
            "custom-chat": { "name": "Custom Chat", },
            "custom-chat-alias": { "id": "custom-chat-target", "name": "Custom Chat Alias", },
          },
        },
      },
    }`);
    const candidates = opencodeCandidates();
    import_strict.default.equal(candidates.length, 4);
    import_strict.default.ok(candidates.every((candidate) => candidate.kind === "opencode"));
    import_strict.default.ok(candidates.every((candidate) => candidate.importable));
    import_strict.default.ok(candidates.every((candidate) => candidate.status === "available"));
    const responses = candidateForProtocol(candidates, "openai_responses");
    const anthropic = candidateForProtocol(candidates, "anthropic_messages");
    const chat = candidateForProtocol(candidates, "openai_chat_completions");
    const gemini = candidateForProtocol(candidates, "gemini_generate_content");
    import_strict.default.deepEqual(responses.models, ["gpt-current"]);
    import_strict.default.deepEqual(responses.modelDisplayNames, { "gpt-current": "GPT Current" });
    import_strict.default.deepEqual(anthropic.models, ["claude-current"]);
    import_strict.default.deepEqual(chat.models, ["chat-current", "custom-chat", "custom-chat-target"]);
    import_strict.default.deepEqual(chat.modelDisplayNames, {
      "chat-current": "Chat Current",
      "custom-chat": "Custom Chat",
      "custom-chat-target": "Custom Chat Alias"
    });
    import_strict.default.deepEqual(gemini.models, ["gemini-current"]);
    import_strict.default.ok(!responses.models.includes("gpt-deprecated"));
    const result = importOpenCodeProvider(responses, [responses.name]);
    import_strict.default.equal(result.provider.name, `${responses.name} 2`);
    import_strict.default.equal(result.provider.baseUrl, "https://opencode.example/v1");
    import_strict.default.equal(result.provider.protocol, "openai_responses");
    import_strict.default.equal(result.provider.apiKey, localAgentProviderApiKey);
    import_strict.default.deepEqual(result.provider.models, ["gpt-current"]);
    import_strict.default.equal(result.provider.account, void 0);
    import_strict.default.equal(result.providerPlugins.length, 2);
    import_strict.default.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer opencode-zen-key");
    import_strict.default.equal(result.providerPlugins[0].key, "ccr-local-agent-__CCR_PROVIDER_NAME_SLUG__-opencode-openai-responses-api-key");
    import_strict.default.equal(result.providerPlugins[1].providerName, "__CCR_PROVIDER_INTERNAL_NAME__");
    const anthropicResult = importOpenCodeProvider(anthropic, []);
    import_strict.default.equal(anthropicResult.providerPlugins[0].auth.headers["x-api-key"], "opencode-zen-key");
    import_strict.default.deepEqual(anthropicResult.providerPlugins[0].auth.removeHeaders, ["authorization"]);
    const geminiResult = importOpenCodeProvider(gemini, []);
    import_strict.default.equal(geminiResult.providerPlugins[0].auth.headers["x-goog-api-key"], "opencode-zen-key");
    import_strict.default.equal(geminiResult.providerPlugins[0].auth.query.key, "opencode-zen-key");
  });
});
(0, import_node_test.default)("OpenCode local provider resolves API keys from OpenCode JSONC config", async () => {
  await withOpenCodeHome(async (home) => {
    process.env.CCR_OPENCODE_TEST_KEY = "configured-opencode-key";
    writeOpenCodeConfig(home, `{
      "provider": {
        "opencode": {
          "options": { "apiKey": "{env:CCR_OPENCODE_TEST_KEY}" },
        },
      },
    }`);
    const candidates = opencodeCandidates();
    import_strict.default.ok(candidates.every((candidate) => candidate.importable));
    import_strict.default.ok(candidates.every((candidate) => candidate.sourceFile?.endsWith("opencode.jsonc")));
    import_strict.default.deepEqual(candidateForProtocol(candidates, "openai_responses").models, ["gpt-5.2"]);
    const result = importOpenCodeProvider(candidateForProtocol(candidates, "openai_chat_completions"), []);
    import_strict.default.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer configured-opencode-key");
  });
});
(0, import_node_test.default)("OpenCode local provider imports public free models without a login", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeModels(home, {
      api: "https://opencode.ai/zen/v1",
      models: {
        "chat-free": {
          cost: { input: 0, output: 0 },
          name: "Chat Free"
        },
        "chat-paid": {
          cost: { input: 1, output: 2 },
          name: "Chat Paid"
        },
        "chat-output-paid": {
          cost: { input: 0, output: 1 },
          name: "Chat Output Paid"
        },
        "chat-cache-paid": {
          cost: { cache_read: 1, input: 0, output: 0 },
          name: "Chat Cache Paid"
        },
        "chat-deprecated-free": {
          cost: { input: 0, output: 0 },
          name: "Chat Deprecated Free",
          status: "deprecated"
        },
        "anthropic-free": {
          cost: { input: 0, output: 0 },
          name: "Anthropic Free",
          provider: { npm: "@ai-sdk/anthropic" }
        }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    });
    const candidates = opencodeCandidates();
    const available = candidates.filter((candidate) => candidate.status === "available");
    import_strict.default.equal(available.length, 2);
    import_strict.default.deepEqual(candidateForProtocol(candidates, "openai_chat_completions").models, ["chat-free"]);
    import_strict.default.deepEqual(candidateForProtocol(candidates, "anthropic_messages").models, ["anthropic-free"]);
    import_strict.default.ok(available.every((candidate) => candidate.name.startsWith("OpenCode Public")));
    import_strict.default.ok(available.every((candidate) => candidate.detail.includes("No login is required")));
    const chatResult = importOpenCodeProvider(candidateForProtocol(candidates, "openai_chat_completions"), []);
    import_strict.default.deepEqual(chatResult.providerPlugins, []);
    import_strict.default.equal(chatResult.provider.apiKey, "public");
    import_strict.default.deepEqual(chatResult.provider.models, ["chat-free"]);
    import_strict.default.equal(chatResult.provider.account, void 0);
    const anthropicResult = importOpenCodeProvider(candidateForProtocol(candidates, "anthropic_messages"), []);
    import_strict.default.deepEqual(anthropicResult.providerPlugins, []);
    import_strict.default.equal(anthropicResult.provider.apiKey, "public");
  });
});
(0, import_node_test.default)("OpenCode local provider locks malformed credentials instead of importing public models", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeAuth(home, {
      opencode: {
        type: "api"
      }
    });
    writeOpenCodeModels(home, {
      api: "https://opencode.ai/zen/v1",
      models: {
        "chat-free": {
          cost: { input: 0, output: 0 },
          name: "Chat Free"
        }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    });
    const candidates = opencodeCandidates();
    import_strict.default.ok(candidates.every((candidate) => candidate.status === "locked"));
    import_strict.default.ok(candidates.every((candidate) => !candidate.importable));
    import_strict.default.ok(candidates.every((candidate) => candidate.detail.includes("no usable API key")));
    import_strict.default.throws(
      () => importOpenCodeProvider(candidateForProtocol(candidates, "openai_chat_completions"), []),
      /OpenCode CLI API key was not found/
    );
  });
});
(0, import_node_test.default)("OpenCode local provider preserves nested Zen base URL for Gemini imports", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeAuth(home, {
      opencode: {
        key: "opencode-zen-key",
        type: "api"
      }
    });
    writeOpenCodeModels(home, {
      api: "https://opencode.ai/zen/v1",
      models: {
        "gemini-current": {
          name: "Gemini Current",
          provider: { npm: "@ai-sdk/google" }
        }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    });
    const result = importOpenCodeProvider(candidateForProtocol(opencodeCandidates(), "gemini_generate_content"), []);
    import_strict.default.equal(result.provider.baseUrl, "https://opencode.ai/zen/v1");
    import_strict.default.equal(result.provider.protocol, "gemini_generate_content");
  });
});
(0, import_node_test.default)("OpenCode local provider stays hidden without a login or cached public models", async () => {
  await withOpenCodeHome(async () => {
    const candidates = opencodeCandidates();
    import_strict.default.ok(candidates.every((candidate) => candidate.status === "missing"));
    import_strict.default.ok(candidates.every((candidate) => !candidate.importable));
  });
});
(0, import_node_test.default)("OpenCode removes the previously generated local account usage connector", () => {
  const provider = removeOpenCodeProviderAccountConfig({
    account: {
      connectors: [
        {
          message: "Local usage from CCR history. OpenCode does not expose cloud balance through its API.",
          type: "local-estimate",
          windows: [
            { id: "opencode_monthly_spend", label: "CCR monthly spend", unit: "USD", window: "monthly" },
            { id: "opencode_monthly_tokens", label: "CCR monthly tokens", unit: "tokens", window: "monthly" },
            { id: "opencode_monthly_requests", label: "CCR monthly requests", unit: "requests", window: "monthly" }
          ]
        }
      ],
      enabled: true
    },
    api_key: localAgentProviderApiKey,
    models: ["gpt-5.2"],
    name: "OpenCode Zen (Responses)",
    protocol: "openai_responses"
  });
  import_strict.default.equal(provider.account, void 0);
});
function candidateForProtocol(candidates, protocol) {
  const candidate = candidates.find((item) => item.protocol === protocol);
  import_strict.default.ok(candidate, `Expected OpenCode candidate for ${protocol}`);
  return candidate;
}
async function withOpenCodeHome(run) {
  const environmentNames = [
    "CCR_INTERNAL_HOME_DIR",
    "CCR_OPENCODE_TEST_KEY",
    "OPENCODE_API_KEY",
    "OPENCODE_AUTH_CONTENT",
    "OPENCODE_CONFIG",
    "OPENCODE_CONFIG_CONTENT"
  ];
  const previousEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));
  const home = (0, import_node_fs3.mkdtempSync)(import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-opencode-test-"));
  process.env.CCR_INTERNAL_HOME_DIR = home;
  for (const name of environmentNames.slice(1)) {
    delete process.env[name];
  }
  try {
    await run(home);
  } finally {
    for (const name of environmentNames) {
      restoreEnv(name, previousEnvironment[name]);
    }
    (0, import_node_fs3.rmSync)(home, { force: true, recursive: true });
  }
}
function writeOpenCodeAuth(home, auth) {
  const directory = import_node_path2.default.join(home, ".local", "share", "opencode");
  (0, import_node_fs3.mkdirSync)(directory, { recursive: true });
  (0, import_node_fs3.writeFileSync)(import_node_path2.default.join(directory, "auth.json"), JSON.stringify(auth, null, 2));
}
function writeOpenCodeModels(home, provider) {
  const directory = import_node_path2.default.join(home, ".cache", "opencode");
  (0, import_node_fs3.mkdirSync)(directory, { recursive: true });
  (0, import_node_fs3.writeFileSync)(import_node_path2.default.join(directory, "models.json"), JSON.stringify({ opencode: provider }, null, 2));
}
function writeOpenCodeConfig(home, content) {
  const directory = import_node_path2.default.join(home, ".config", "opencode");
  (0, import_node_fs3.mkdirSync)(directory, { recursive: true });
  (0, import_node_fs3.writeFileSync)(import_node_path2.default.join(directory, "opencode.jsonc"), content);
}
function restoreEnv(name, value) {
  if (value === void 0) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
