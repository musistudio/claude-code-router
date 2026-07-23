import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  GatewayProviderConfig,
  GatewayProviderProtocol,
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult,
  ProviderAccountConnectorConfig
} from "@ccr/core/contracts/app";
import {
  apiKeyAuthPlugin,
  bearerAuthPlugin,
  isRecord,
  missingCandidate,
  parseJsoncRecord,
  providerInternalNamePlaceholder,
  providerNamePlaceholder,
  providerNameSlugPlaceholder,
  providerPayload,
  readJsonRecord,
  readJsoncRecord,
  readString,
  uniqueProviderName,
  uniqueStrings
} from "@ccr/core/agents/local-providers/shared";

type OpenCodeCredential = {
  apiKey?: string;
  hasCredential: boolean;
  sourceFile: string;
};

type OpenCodeConfig = {
  record: Record<string, unknown>;
  sourceFile?: string;
};

type OpenCodeCatalog = {
  baseUrl: string;
  modelDisplayNames: Partial<Record<OpenCodeProtocol, Record<string, string>>>;
  models: Record<OpenCodeProtocol, string[]>;
  name: string;
};

type OpenCodeProtocol = Exclude<GatewayProviderProtocol, "gemini_interactions">;

const openCodeProviderId = "opencode";
const openCodeDefaultBaseUrl = "https://opencode.ai/zen/v1";
const openCodeProtocolOrder: OpenCodeProtocol[] = [
  "openai_responses",
  "anthropic_messages",
  "openai_chat_completions",
  "gemini_generate_content"
];
const openCodeProtocolLabels: Record<OpenCodeProtocol, string> = {
  anthropic_messages: "Anthropic",
  gemini_generate_content: "Gemini",
  openai_chat_completions: "Chat Completions",
  openai_responses: "Responses"
};
const openCodeFallbackModels: Record<OpenCodeProtocol, string[]> = {
  anthropic_messages: ["claude-sonnet-4-5"],
  gemini_generate_content: ["gemini-3-flash"],
  openai_chat_completions: ["big-pickle"],
  openai_responses: ["gpt-5.2"]
};

export function opencodeCandidates(): LocalAgentProviderCandidate[] {
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

export function importOpenCodeProvider(
  candidate: LocalAgentProviderCandidate,
  providerNames: string[]
): LocalAgentProviderImportResult {
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

export function removeOpenCodeProviderAccountConfig(provider: GatewayProviderConfig): GatewayProviderConfig {
  const account = provider.account;
  if (!account?.connectors?.some(isGeneratedOpenCodeAccountConnector)) {
    return provider;
  }
  const connectors = account.connectors.filter((connector) => !isGeneratedOpenCodeAccountConnector(connector));
  return {
    ...provider,
    account: connectors.length > 0 ? { ...account, connectors } : undefined
  };
}

function isGeneratedOpenCodeAccountConnector(connector: ProviderAccountConnectorConfig): boolean {
  if (connector.type !== "local-estimate") {
    return false;
  }
  const ids = new Set(connector.windows.map((window) => window.id));
  return ids.has("opencode_monthly_spend") &&
    ids.has("opencode_monthly_tokens") &&
    ids.has("opencode_monthly_requests");
}

function openCodeAuthPlugin(
  protocol: GatewayProviderProtocol,
  suffix: string,
  apiKey: string,
  providerName = providerNamePlaceholder
): Record<string, unknown> {
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

function readOpenCodeCredential(): OpenCodeCredential | undefined {
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

  return configuredApiKeyPresent
    ? { hasCredential: true, sourceFile: config.sourceFile || "OpenCode config" }
    : undefined;
}

function openCodeCredentialFromRecord(
  record: Record<string, unknown> | undefined,
  sourceFile: string
): OpenCodeCredential | undefined {
  if (!record || !(openCodeProviderId in record)) {
    return undefined;
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

function configuredOpenCodeApiKey(config: OpenCodeConfig): string | undefined {
  const value = configuredOpenCodeApiKeyValue(config);
  if (!value) {
    return undefined;
  }
  const environmentReference = value.match(/^\{env:([^}]+)\}$/);
  if (environmentReference) {
    return process.env[environmentReference[1]]?.trim() || undefined;
  }
  const fileReference = value.match(/^\{file:([^}]+)\}$/);
  if (fileReference) {
    try {
      const sourceDirectory = config.sourceFile && !config.sourceFile.startsWith("env:")
        ? path.dirname(config.sourceFile)
        : undefined;
      return readFileSync(resolveOpenCodeReferencePath(fileReference[1], sourceDirectory), "utf8").trim() || undefined;
    } catch {
      return undefined;
    }
  }
  return value;
}

function configuredOpenCodeApiKeyIsPresent(config: OpenCodeConfig): boolean {
  return Boolean(configuredOpenCodeApiKeyValue(config));
}

function configuredOpenCodeApiKeyValue(config: OpenCodeConfig): string | undefined {
  const provider = openCodeProviderConfig(config.record);
  const options = isRecord(provider?.options) ? provider.options : {};
  return readString(options.apiKey) || readString(options.api_key);
}

function readOpenCodeCatalog(options: { publicOnly: boolean }): OpenCodeCatalog {
  const cache = readJsonRecord(openCodeModelsCacheFile());
  const cachedProvider = isRecord(cache?.[openCodeProviderId]) ? cache[openCodeProviderId] : {};
  const config = readOpenCodeConfig().record;
  const configuredProvider = openCodeProviderConfig(config) ?? {};
  const configuredOptions = isRecord(configuredProvider.options) ? configuredProvider.options : {};
  const baseUrl =
    readString(configuredOptions.baseURL) ||
    readString(configuredOptions.baseUrl) ||
    readString(cachedProvider.api) ||
    openCodeDefaultBaseUrl;
  const name = readString(configuredProvider.name) || readString(cachedProvider.name) || "OpenCode Zen";
  const providerNpm = readString(configuredProvider.npm) || readString(cachedProvider.npm) || "@ai-sdk/openai-compatible";
  const cachedModels = isRecord(cachedProvider.models) ? cachedProvider.models : {};
  const configuredModels = isRecord(configuredProvider.models) ? configuredProvider.models : {};
  const configuredModelIds = new Set(Object.keys(configuredModels));
  const mergedModels = new Map<string, Record<string, unknown>>();
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
  const models = emptyOpenCodeProtocolRecord<string[]>(() => []);
  const modelDisplayNames = emptyOpenCodeProtocolRecord<Record<string, string>>(() => ({}));

  for (const configuredModelId of orderedModelIds) {
    const model = mergedModels.get(configuredModelId);
    if (!model || (readString(model.status) === "deprecated" && !configuredModelIds.has(configuredModelId) && !selectedModels.includes(configuredModelId))) {
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
      models[protocol].length > 0
        ? models[protocol]
        : options.publicOnly ? [] : openCodeFallbackModels[protocol]
    );
    const allowedModels = new Set(models[protocol]);
    modelDisplayNames[protocol] = Object.fromEntries(
      Object.entries(modelDisplayNames[protocol]).filter(([modelId]) => allowedModels.has(modelId))
    );
  }

  return { baseUrl, modelDisplayNames, models, name };
}

function openCodeModelIsFree(model: Record<string, unknown>): boolean {
  const cost = isRecord(model.cost) ? model.cost : undefined;
  if (!cost) {
    return false;
  }
  return requiredOpenCodeCostIsFree(cost.input) &&
    requiredOpenCodeCostIsFree(cost.output) &&
    optionalOpenCodeCostFieldsAreFree(cost, [
      "cache_read",
      "cache_write",
      "cacheRead",
      "cacheWrite",
      "input_cache_read",
      "input_cache_write"
    ]);
}

function requiredOpenCodeCostIsFree(value: unknown): boolean {
  return openCodeCostValue(value) === 0;
}

function optionalOpenCodeCostIsFree(value: unknown): boolean {
  const cost = openCodeCostValue(value);
  return cost === undefined || cost === 0;
}

function optionalOpenCodeCostFieldsAreFree(cost: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => optionalOpenCodeCostIsFree(cost[field]));
}

function openCodeCostValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(readString(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function openCodeProtocolFromNpm(value: string): OpenCodeProtocol {
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

function isOpenCodeProtocol(protocol: GatewayProviderProtocol): protocol is OpenCodeProtocol {
  return protocol !== "gemini_interactions";
}

function openCodeModelId(value: string | undefined): string | undefined {
  if (!value?.startsWith(`${openCodeProviderId}/`)) {
    return undefined;
  }
  return readString(value.slice(openCodeProviderId.length + 1));
}

function openCodeProviderConfig(config: Record<string, unknown>): Record<string, unknown> | undefined {
  const providers = isRecord(config.provider) ? config.provider : undefined;
  return isRecord(providers?.[openCodeProviderId]) ? providers[openCodeProviderId] : undefined;
}

function readOpenCodeConfig(): OpenCodeConfig {
  let record: Record<string, unknown> = {};
  let sourceFile: string | undefined;
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

function deepMergeRecords(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    result[key] = isRecord(result[key]) && isRecord(value)
      ? deepMergeRecords(result[key], value)
      : value;
  }
  return result;
}

function emptyOpenCodeProtocolRecord<T>(factory: (protocol: OpenCodeProtocol) => T): Record<OpenCodeProtocol, T> {
  return Object.fromEntries(openCodeProtocolOrder.map((protocol) => [protocol, factory(protocol)])) as Record<OpenCodeProtocol, T>;
}

function openCodeAuthFiles(): string[] {
  return uniqueStrings([
    path.join(openCodeDataRoot(), "auth.json")
  ]);
}

function openCodeConfigFiles(): string[] {
  const customConfig = process.env.OPENCODE_CONFIG?.trim();
  return uniqueStrings([
    path.join(openCodeConfigRoot(), "opencode.json"),
    path.join(openCodeConfigRoot(), "opencode.jsonc"),
    path.join(openCodeDataRoot(), "opencode.json"),
    path.join(openCodeDataRoot(), "opencode.jsonc"),
    customConfig ? resolveOpenCodeReferencePath(customConfig) : undefined
  ]).filter((file) => existsSync(file));
}

function openCodeDataRoot(): string {
  return path.join(openCodeXdgRoot("XDG_DATA_HOME", path.join(".local", "share")), "opencode");
}

function openCodeConfigRoot(): string {
  return path.join(openCodeXdgRoot("XDG_CONFIG_HOME", ".config"), "opencode");
}

function openCodeModelsCacheFile(): string {
  return path.join(openCodeXdgRoot("XDG_CACHE_HOME", ".cache"), "opencode", "models.json");
}

function openCodeXdgRoot(environmentName: "XDG_CACHE_HOME" | "XDG_CONFIG_HOME" | "XDG_DATA_HOME", fallback: string): string {
  const internalHome = process.env.CCR_INTERNAL_HOME_DIR?.trim();
  if (internalHome) {
    return path.join(internalHome, fallback);
  }
  const explicitRoot = process.env[environmentName]?.trim();
  return explicitRoot || path.join(openCodeHomeDir(), fallback);
}

function openCodeHomeDir(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
}

function resolveOpenCodeReferencePath(value: string, baseDirectory?: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return openCodeHomeDir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(openCodeHomeDir(), trimmed.slice(2));
  }
  return path.resolve(baseDirectory || process.cwd(), trimmed);
}
