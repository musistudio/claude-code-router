import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileConfig } from "../shared/app";
import { normalizeRouteSelector } from "../server/gateway/claude-code-router-plugin";
import { buildCodexModelCatalogIds } from "./codex-model-catalog";

export type ZcodeProfileConfigWriteResult = {
  backupFile?: string;
  changed: boolean;
  file: string;
  files?: string[];
};

type ZcodeGatewayConfigValues = {
  baseUrl: string;
  model: string;
  providerId: string;
  providerName: string;
  token: string;
  models: string[];
};

const legacyZcodeTomlConfigFile = "~/.zcode/config.toml";
const defaultZcodeConfigFile = "~/.zcode/cli/config.json";
const originalBackupSuffix = ".ccr-original";
const originalMissingSuffix = ".ccr-original-missing";

export function resolveZcodeConfigFile(profile: Pick<ProfileConfig, "codexHome" | "configFile">): string {
  const configured = profile.configFile?.trim();
  if (configured && !isLegacyZcodeTomlConfigFile(configured)) {
    return resolveUserPath(configured);
  }
  const zcodeHome = profile.codexHome?.trim() || "~/.zcode";
  return path.join(resolveUserPath(zcodeHome), "cli", "config.json");
}

export function zcodeHomeFromConfigFile(configFile: string): string {
  const dir = path.dirname(configFile);
  return path.basename(configFile) === "config.json" && path.basename(dir) === "cli"
    ? path.dirname(dir)
    : dir;
}

export function writeZcodeGatewayConfig(
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  options: { backup?: boolean } = {}
): ZcodeProfileConfigWriteResult {
  const file = resolveZcodeConfigFile(profile);
  const model = normalizeClientModel(profile.model) || defaultClientModel(config);
  const providerId = sanitizeZcodeProviderId(profile.providerId || "") || "claude-code-router";
  const values: ZcodeGatewayConfigValues = {
    baseUrl: gatewayEndpoint(config),
    model,
    models: buildCodexModelCatalogIds(config, model),
    providerId,
    providerName: profile.providerName?.trim() || "Claude Code Router",
    token
  };
  const cliResult = writeJsonFile(file, buildZcodeGatewayConfig(readJsonObject(file), values), options);
  const storageRoot = zcodeHomeFromConfigFile(file);
  const v2ConfigFile = path.join(storageRoot, "v2", "config.json");
  const v2ConfigResult = writeJsonFile(v2ConfigFile, buildZcodeV2Config(readJsonObject(v2ConfigFile), values), options);
  const v2CacheFile = path.join(storageRoot, "v2", "bots-model-cache.v2.json");
  const v2CacheResult = writeJsonFile(v2CacheFile, buildZcodeV2ModelCache(readJsonObject(v2CacheFile), values), options);
  return {
    backupFile: cliResult.backupFile ?? v2ConfigResult.backupFile ?? v2CacheResult.backupFile,
    changed: cliResult.changed || v2ConfigResult.changed || v2CacheResult.changed,
    file,
    files: [cliResult.file, v2ConfigResult.file, v2CacheResult.file]
  };
}

function buildZcodeGatewayConfig(source: Record<string, unknown>, values: ZcodeGatewayConfigValues): Record<string, unknown> {
  const providers = isRecord(source.provider) ? { ...source.provider } : {};
  const modelRef = `${values.providerId}/${values.model}`;
  providers[values.providerId] = zcodeConfigProvider(values);

  return {
    ...source,
    $schema: typeof source.$schema === "string" && source.$schema.trim() ? source.$schema : "https://opencode.ai/config.json",
    model: {
      ...(isRecord(source.model) ? source.model : {}),
      main: modelRef
    },
    provider: providers
  };
}

function buildZcodeV2Config(source: Record<string, unknown>, values: ZcodeGatewayConfigValues): Record<string, unknown> {
  const providers = isRecord(source.provider) ? { ...source.provider } : {};
  const modelRef = `${values.providerId}/${values.model}`;
  providers[values.providerId] = {
    ...zcodeConfigProvider(values),
    enabled: true,
    source: "custom"
  };
  return {
    ...source,
    $schema: typeof source.$schema === "string" && source.$schema.trim() ? source.$schema : "https://opencode.ai/config.json",
    model: {
      ...(isRecord(source.model) ? source.model : {}),
      main: modelRef
    },
    provider: providers
  };
}

function zcodeConfigProvider(values: ZcodeGatewayConfigValues): Record<string, unknown> {
  return {
    kind: "anthropic",
    name: values.providerName,
    options: {
      apiKey: values.token,
      apiKeyRequired: true,
      baseURL: values.baseUrl
    },
    models: Object.fromEntries(uniqueStrings(values.models).map((model) => [model, zcodeModelConfig(model)]))
  };
}

function buildZcodeV2ModelCache(source: Record<string, unknown>, values: ZcodeGatewayConfigValues): Record<string, unknown> {
  const providers = Array.isArray(source.providers) ? source.providers.filter((provider) => {
    return !isRecord(provider) || provider.id !== values.providerId;
  }) : [];
  const previousProvider = Array.isArray(source.providers)
    ? source.providers.find((provider) => isRecord(provider) && provider.id === values.providerId)
    : undefined;
  const now = Date.now();
  const modelRef = zcodeProtocolModelRef(values);
  return {
    ...source,
    defaultModel: modelRef,
    lastUsed: modelRef,
    lastUsedModel: modelRef,
    providers: [
      ...providers,
      zcodeV2ModelCacheProvider(values, isRecord(previousProvider) ? previousProvider : undefined, now)
    ],
    revision: zcodeV2CacheRevision(source),
    updatedAt: now,
    version: typeof source.version === "number" ? source.version : 2
  };
}

function zcodeModelConfig(model: string): Record<string, unknown> {
  return {
    id: model,
    name: model,
    limit: {
      context: 128_000,
      output: 8_192
    },
    modalities: {
      input: ["text", "image"],
      output: ["text"]
    },
    structured_output: true,
    supportsImages: true,
    supportsStructuredOutput: true,
    supportsToolCall: true,
    tool_call: true
  };
}

function zcodeV2ModelCacheProvider(
  values: ZcodeGatewayConfigValues,
  previousProvider: Record<string, unknown> | undefined,
  now: number
): Record<string, unknown> {
  return {
    id: values.providerId,
    name: values.providerName,
    enabled: true,
    endpoints: {
      baseURL: values.baseUrl,
      paths: {
        anthropic: "/v1/messages"
      }
    },
    apiFormat: "anthropic-messages",
    source: "custom",
    apiKey: "__zcode_cached_api_key_present__",
    apiKeyRequired: true,
    defaultKind: "anthropic",
    models: uniqueStrings(values.models).map((model) => zcodeV2ModelCacheModel(model)),
    createdAt: positiveNumber(previousProvider?.createdAt) ?? now,
    updatedAt: now
  };
}

function zcodeV2ModelCacheModel(model: string): Record<string, unknown> {
  return {
    id: model,
    name: model,
    kinds: ["anthropic"],
    defaultKind: "anthropic",
    modalities: {
      input: ["text", "image"],
      output: ["text"]
    },
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsStructuredOutput: true,
    supportsTools: true
  };
}

function zcodeProtocolModelRef(values: ZcodeGatewayConfigValues): Record<string, unknown> {
  return {
    providerId: values.providerId,
    modelId: values.model
  };
}

function zcodeV2CacheRevision(source: Record<string, unknown>): number {
  const revision = typeof source.revision === "number" && Number.isFinite(source.revision)
    ? Math.floor(source.revision)
    : 0;
  return Math.max(0, revision) + 1;
}

function writeJsonFile(file: string, value: Record<string, unknown>, options: { backup?: boolean }): ZcodeProfileConfigWriteResult {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    return { changed: false, file };
  }
  if (options.backup !== false) {
    ensureOriginalSnapshot(file, previous);
  }
  const backupFile = options.backup === false || previous === undefined ? undefined : backupFilePath(file);
  if (backupFile) {
    copyFileSync(file, backupFile);
  }
  writeFileSync(file, content, "utf8");
  return { backupFile, changed: true, file };
}

function readJsonObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function backupFilePath(file: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${file}.ccr-backup-${timestamp}`;
}

function ensureOriginalSnapshot(file: string, previous: string | undefined): void {
  const originalBackup = `${file}${originalBackupSuffix}`;
  const originalMissing = `${file}${originalMissingSuffix}`;
  if (existsSync(originalBackup) || existsSync(originalMissing)) {
    return;
  }
  if (previous === undefined) {
    writeFileSync(originalMissing, "", "utf8");
    return;
  }
  copyFileSync(file, originalBackup);
}

function isLegacyZcodeTomlConfigFile(value: string): boolean {
  return value === legacyZcodeTomlConfigFile ||
    resolveUserPath(value) === path.join(os.homedir(), ".zcode", "config.toml");
}

function gatewayEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" ? "127.0.0.1" : config.gateway.host || "127.0.0.1";
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${config.gateway.port}`;
}

function defaultClientModel(config: AppConfig): string {
  const preferred = config.Providers.find((provider) => provider.name === config.preferredProvider) ?? config.Providers[0];
  if (preferred?.name && preferred.models[0]) {
    return `${preferred.name}/${preferred.models[0]}`;
  }
  return "gpt-5-codex";
}

function normalizeClientModel(value: string | undefined): string {
  return normalizeRouteSelector(value)?.trim() || "";
}

function sanitizeZcodeProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed || ".");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
