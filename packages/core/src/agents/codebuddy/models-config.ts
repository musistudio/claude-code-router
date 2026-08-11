import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { availableGatewayModelIds, isGatewayProviderEnabled, type AppConfig, type ProfileConfig } from "@ccr/core/contracts/app";
import { findModelCatalogEntry, modelCatalogMaxInputTokens, modelCatalogMaxOutputTokens } from "@ccr/core/gateway/model-catalog";
import { normalizeRouteSelector } from "@ccr/core/gateway/claude-code-router-plugin";

export type CodeBuddyModelsConfigWriteResult = {
  backupFile?: string;
  changed: boolean;
  file: string;
};

const defaultContextWindow = 128_000;
const defaultMaxOutputTokens = 8_192;

export function resolveCodeBuddyModelsConfigFile(profile: Pick<ProfileConfig, "configFile">): string {
  const configured = profile.configFile?.trim();
  if (configured && /\.json(?:c)?$/i.test(configured)) {
    return resolveUserPath(configured);
  }
  const home = configured && configured !== "~/.codebuddy"
    ? resolveUserPath(configured)
    : resolveUserPath("~/.codebuddy");
  return path.join(home, "models.json");
}

export function codeBuddyHomeFromModelsConfigFile(configFile: string): string {
  return path.basename(configFile) === "models.json" ? path.dirname(configFile) : path.dirname(configFile);
}

export function writeCodeBuddyModelsConfig(
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  options: { backup?: boolean } = {}
): CodeBuddyModelsConfigWriteResult {
  const file = resolveCodeBuddyModelsConfigFile(profile);
  const model = normalizeClientModel(profile.model) || defaultClientModel(config);
  const values = {
    apiKey: token,
    baseUrl: `${gatewayEndpoint(config)}/v1/chat/completions`,
    model,
    models: availableGatewayModelIds(config),
    providerId: sanitizeCodeBuddyProviderId(profile.providerId || "") || "claude-code-router",
    providerName: profile.providerName?.trim() || "Claude Code Router"
  };
  return writeJsonFile(file, buildCodeBuddyModelsConfig(readJsonObject(file), values), options);
}

type CodeBuddyModelsConfigValues = {
  apiKey: string;
  baseUrl: string;
  model: string;
  models: string[];
  providerId: string;
  providerName: string;
};

function buildCodeBuddyModelsConfig(source: Record<string, unknown>, values: CodeBuddyModelsConfigValues): Record<string, unknown> {
  const previousModels = Array.isArray(source.models) ? source.models.filter(isRecord) : [];
  const previousAvailableModels = Array.isArray(source.availableModels)
    ? source.availableModels.filter((value): value is string => typeof value === "string")
    : [];
  const ccrModelId = values.model || values.models[0];
  const ccrEntry = ccrModelId ? codeBuddyModelEntry(ccrModelId, values) : undefined;

  const models = [
    ...(ccrEntry ? [ccrEntry] : []),
    ...previousModels.filter((entry) => {
      const id = entry.id;
      return typeof id !== "string" || !ccrModelId || id !== ccrModelId;
    })
  ];

  const availableModels = uniqueStrings([
    ...(ccrModelId ? [ccrModelId] : []),
    ...previousAvailableModels.filter((id) => id !== ccrModelId)
  ]);

  return {
    ...source,
    availableModels,
    models
  };
}

function codeBuddyModelEntry(model: string, values: CodeBuddyModelsConfigValues): Record<string, unknown> {
  const providerName = providerFromModelSelector(model) || values.providerName;
  const entry = findModelCatalogEntry(model);
  const maxInputTokens = modelCatalogMaxInputTokens(entry) || defaultContextWindow;
  const maxOutputTokens = modelCatalogMaxOutputTokens(entry) || defaultMaxOutputTokens;
  return {
    id: model,
    name: model,
    vendor: providerName,
    apiKey: values.apiKey,
    maxInputTokens,
    maxOutputTokens,
    url: values.baseUrl,
    supportsToolCall: true,
    supportsImages: false,
    supportsReasoning: false
  };
}

function gatewayEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" ? "127.0.0.1" : config.gateway.host || "127.0.0.1";
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${config.gateway.port}`;
}

function defaultClientModel(config: AppConfig): string {
  const enabledProviders = config.Providers.filter(isGatewayProviderEnabled);
  const preferred = enabledProviders.find((provider) => provider.name === config.preferredProvider) ?? enabledProviders[0];
  if (preferred?.name && preferred.models[0]) {
    return `${preferred.name}/${preferred.models[0]}`;
  }
  return "gpt-5-codex";
}

function normalizeClientModel(value: string | undefined): string {
  return normalizeRouteSelector(value)?.trim() || "";
}

function providerFromModelSelector(model: string): string | undefined {
  const slashIndex = model.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= model.length - 1) {
    return undefined;
  }
  return model.slice(0, slashIndex);
}

function sanitizeCodeBuddyProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function writeJsonFile(file: string, value: Record<string, unknown>, options: { backup?: boolean }): CodeBuddyModelsConfigWriteResult {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    return { changed: false, file };
  }
  if (options.backup !== false && previous !== undefined) {
    const backupFile = backupFilePath(file);
    copyFileSync(file, backupFile);
    return { backupFile, changed: true, file };
  }
  writeFileSync(file, content, "utf8");
  return { changed: true, file };
}

function backupFilePath(file: string): string {
  return `${file}.ccr-before`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}
