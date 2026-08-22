import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCodexModelCatalog, type CodexModelCatalogItem } from "@ccr/core/agents/codex/model-catalog";
import { parseJsoncRecord } from "@ccr/core/agents/local-providers/shared";
import { isGatewayProviderEnabled, type AppConfig, type GatewayProviderConfig, type ProfileConfig, type ProviderModelMetadata } from "@ccr/core/contracts/app";
import { findModelCatalogEntry, findProviderModelCatalogEntry, type ModelCatalogEntry, modelCatalogMaxInputTokens, modelCatalogMaxOutputTokens } from "@ccr/core/gateway/model-catalog";
import { modelRegistryForConfig } from "@ccr/core/routing/model-registry";
import { resolveUsageModelAttribution } from "@ccr/core/usage/model-attribution";
import { profileAllowedModels } from "@ccr/core/profiles/model-allowlist";

export type OpenCodeProfileConfigWriteResult = {
  backupFile?: string;
  changed: boolean;
  file: string;
  inlineConfig: string;
};

const originalBackupSuffix = ".ccr-original";
const originalMissingSuffix = ".ccr-original-missing";
const defaultOpenCodeContextWindow = 128_000;
const defaultOpenCodeMaxOutputTokens = 8_192;

type OpenCodeModelResolutionConfig = Pick<AppConfig, "Providers" | "virtualModelProfiles">;

type OpenCodeResolvedModelMetadata = {
  catalogEntry?: ModelCatalogEntry;
  providerMetadata?: ProviderModelMetadata;
};

export function resolveOpenCodeConfigFile(configDir: string, profile: ProfileConfig): string {
  if (profile.scope === "ccr" || profile.scope === "custom") {
    const slug = sanitizePathSegment(profile.id || profile.name || "opencode") || "opencode";
    const baseDir = path.join(configDir, "profiles", slug);
    return path.join(profile.scope === "custom" ? path.join(baseDir, "custom") : baseDir, "opencode", "opencode.jsonc");
  }

  const configured = profile.configFile?.trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const root = path.join(openCodeXdgRoot("XDG_CONFIG_HOME", ".config"), "opencode");
  const jsonc = path.join(root, "opencode.jsonc");
  const json = path.join(root, "opencode.json");
  return existsSync(jsonc) || !existsSync(json) ? jsonc : json;
}

export function writeOpenCodeGatewayConfig(
  configDir: string,
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  options: { backup?: boolean } = {}
): OpenCodeProfileConfigWriteResult {
  const file = resolveOpenCodeConfigFile(configDir, profile);
  const source = readJsoncObject(file);
  const overrides = openCodeGatewayOverrides(config, profile, token);
  const providers = isRecord(source.provider) ? { ...source.provider } : {};
  const providerId = openCodeProviderId(profile);
  providers[providerId] = (overrides.provider as Record<string, unknown>)[providerId];
  const next = {
    ...source,
    $schema: typeof source.$schema === "string" && source.$schema.trim()
      ? source.$schema
      : "https://opencode.ai/config.json",
    model: overrides.model,
    provider: providers,
    small_model: overrides.small_model
  };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  const writeResult = writeJsonFile(file, content, options);
  return {
    ...writeResult,
    file,
    inlineConfig: JSON.stringify(overrides)
  };
}

export function isManagedOpenCodeConfigContent(content: string, providerId: string): boolean {
  const config = parseJsoncRecord(content);
  if (!config || !isRecord(config.provider)) {
    return false;
  }
  const provider = config.provider[providerId];
  if (!isRecord(provider) || !isRecord(provider.options)) {
    return false;
  }
  const headers = isRecord(provider.options.headers) ? provider.options.headers : {};
  return headers["x-ccr-client"] === "opencode" || headers["X-CCR-Client"] === "opencode";
}

export function openCodeProviderId(profile: Pick<ProfileConfig, "providerId">): string {
  return sanitizeProviderId(profile.providerId || "") || "claude-code-router";
}

function openCodeGatewayOverrides(config: AppConfig, profile: ProfileConfig, token: string): Record<string, unknown> {
  const providerId = openCodeProviderId(profile);
  const providerName = profile.providerName?.trim() || "Claude Code Router";
  const model = normalizeClientModel(profile.model) || defaultClientModel(config);
  const modelRef = `${providerId}/${model}`;
  const models = openCodeModelConfigs(config, { ...profile, model }, model);
  return {
    $schema: "https://opencode.ai/config.json",
    model: modelRef,
    provider: {
      [providerId]: {
        models,
        name: providerName,
        npm: "@ai-sdk/openai-compatible",
        options: {
          apiKey: token,
          baseURL: `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`,
          headers: {
            "x-ccr-client": "opencode",
            "x-ccr-profile": profile.id || profile.name || "opencode"
          }
        }
      }
    },
    small_model: modelRef
  };
}

function openCodeModelConfigs(config: AppConfig, profile: ProfileConfig, selectedModel: string): Record<string, unknown> {
  const catalog = buildCodexModelCatalog(config, selectedModel, { allowedModels: profileAllowedModels(profile) });
  const resolutionConfig: OpenCodeModelResolutionConfig = {
    Providers: config.Providers ?? [],
    virtualModelProfiles: config.virtualModelProfiles ?? []
  };
  return Object.fromEntries(catalog.models.map((item) => [
    item.slug,
    openCodeModelConfig(item, resolutionConfig)
  ]));
}

function openCodeModelConfig(item: CodexModelCatalogItem, config: OpenCodeModelResolutionConfig): Record<string, unknown> {
  const resolved = openCodeResolvedModelMetadata(config, item.slug);
  const contextWindow = Math.max(
    item.context_window,
    modelCatalogMaxInputTokens(resolved.catalogEntry)
  );
  const maxOutputTokens = positiveNumber(resolved.providerMetadata?.maxOutputTokens)
    ?? modelCatalogMaxOutputTokens(resolved.catalogEntry);
  return {
    name: item.slug,
    limit: {
      context: positiveNumber(contextWindow) ?? defaultOpenCodeContextWindow,
      output: positiveNumber(maxOutputTokens) ?? defaultOpenCodeMaxOutputTokens
    },
    modalities: {
      input: openCodeInputModalities(item.input_modalities),
      output: ["text"]
    }
  };
}

function openCodeResolvedModelMetadata(
  config: OpenCodeModelResolutionConfig | undefined,
  model: string
): OpenCodeResolvedModelMetadata {
  if (!config) {
    return { catalogEntry: findModelCatalogEntry(model) };
  }

  const registry = modelRegistryForConfig(config);
  const attribution = resolveUsageModelAttribution(config, model);
  const physicalModel = attribution.model?.trim();
  const physicalProvider = registry.findProvider(attribution.provider);
  if (physicalProvider && physicalModel) {
    return {
      catalogEntry: findProviderModelCatalogEntry(physicalProvider, physicalModel, [model]),
      providerMetadata: providerModelMetadataFor(physicalProvider, physicalModel)
    };
  }

  if (registry.resolve(model)?.kind === "gateway") {
    return {};
  }

  return { catalogEntry: findModelCatalogEntry(physicalModel || model) };
}

function providerModelMetadataFor(provider: GatewayProviderConfig, model: string): ProviderModelMetadata | undefined {
  const metadata = provider.modelMetadata ?? {};
  const direct = metadata[model];
  if (direct) {
    return direct;
  }
  const normalized = model.trim().toLowerCase();
  const match = Object.entries(metadata).find(([candidate]) => candidate.trim().toLowerCase() === normalized);
  return match?.[1];
}

function openCodeInputModalities(values: string[]): string[] {
  const normalized = new Set<string>(["text"]);
  for (const value of values) {
    const modality = value.trim().toLowerCase();
    if (modality) {
      normalized.add(modality);
    }
  }
  return [...normalized];
}

function readJsoncObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) {
    return {};
  }
  try {
    return parseJsoncRecord(readFileSync(file, "utf8")) ?? {};
  } catch {
    return {};
  }
}

function writeJsonFile(
  file: string,
  content: string,
  options: { backup?: boolean }
): { backupFile?: string; changed: boolean } {
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  chmodPrivateConfigArtifacts(file);
  if (previous === content) {
    return { changed: false };
  }
  if (options.backup !== false) {
    ensureOriginalSnapshot(file, previous);
  }
  const backupFile = options.backup === false || previous === undefined ? undefined : backupFilePath(file);
  if (backupFile) {
    copyFileSync(file, backupFile);
    chmodPrivateFile(backupFile);
  }
  writeFileSync(file, content, { encoding: "utf8", mode: 0o600 });
  chmodPrivateFile(file);
  return { backupFile, changed: true };
}

function ensureOriginalSnapshot(file: string, previous: string | undefined): void {
  const originalBackup = `${file}${originalBackupSuffix}`;
  const originalMissing = `${file}${originalMissingSuffix}`;
  if (existsSync(originalBackup) || existsSync(originalMissing)) {
    return;
  }
  if (previous === undefined) {
    writeFileSync(originalMissing, "", { encoding: "utf8", mode: 0o600 });
    chmodPrivateFile(originalMissing);
    return;
  }
  copyFileSync(file, originalBackup);
  chmodPrivateFile(originalBackup);
}

function chmodPrivateFile(file: string): void {
  if (process.platform === "win32" || !existsSync(file)) {
    return;
  }
  chmodSync(file, 0o600);
}

function chmodPrivateConfigArtifacts(file: string): void {
  chmodPrivateFile(file);
  if (process.platform === "win32") {
    return;
  }
  const basename = path.basename(file);
  let entries: string[];
  try {
    entries = readdirSync(path.dirname(file));
  } catch {
    // The config write can still proceed if artifact discovery is unavailable.
    return;
  }
  for (const entry of entries) {
    if (
      entry === `${basename}${originalBackupSuffix}` ||
      entry === `${basename}${originalMissingSuffix}` ||
      entry.startsWith(`${basename}.ccr-backup-`)
    ) {
      chmodPrivateFile(path.join(path.dirname(file), entry));
    }
  }
}

function backupFilePath(file: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${file}.ccr-backup-${timestamp}`;
}

function gatewayEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" || config.gateway.host === "::" ? "127.0.0.1" : config.gateway.host;
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${normalizedHost}:${config.gateway.port}`;
}

function defaultClientModel(config: AppConfig): string {
  const enabledProviders = config.Providers.filter(isGatewayProviderEnabled);
  const provider = enabledProviders.find((item) => item.name === config.preferredProvider) ?? enabledProviders[0];
  const model = provider?.models[0] ?? "default";
  return provider?.name ? `${provider.name}/${model}` : model;
}

function normalizeClientModel(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : "";
  }
  return trimmed;
}

function positiveNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

function openCodeXdgRoot(environmentName: "XDG_CONFIG_HOME", fallback: string): string {
  const internalHome = process.env.CCR_INTERNAL_HOME_DIR?.trim();
  if (internalHome) {
    return path.join(internalHome, fallback);
  }
  const configured = process.env[environmentName]?.trim();
  return configured ? resolveUserPath(configured) : path.join(os.homedir(), fallback);
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

function sanitizeProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
