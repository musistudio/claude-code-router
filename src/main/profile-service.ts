import { randomBytes } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApiKeyConfig, AppConfig, ProfileApplyResult, ProfileClientApplyStatus, ProfileConfig } from "../shared/app";
import { replacePersistedApiKeys } from "./api-key-store";
import { codexCliMiddlewareRuntimeScript } from "./codex-cli-middleware-runtime";
import { CONFIGDIR } from "./constants";
import { normalizeRouteSelector } from "./gateway/claude-code-router-plugin";

const managedRootStart = "# BEGIN CCR managed profile";
const managedRootEnd = "# END CCR managed profile";
const managedProviderStart = "# BEGIN CCR managed Codex provider";
const managedProviderEnd = "# END CCR managed Codex provider";
const fallbackClientToken = "ccr-local";

export async function applyProfileConfig(config: AppConfig): Promise<ProfileApplyResult> {
  const appliedAt = new Date().toISOString();
  const profiles = profileEntries(config);
  const profileApiKeys = await ensureProfileApiKeys(config, profiles);
  const result: ProfileApplyResult = {
    appliedAt,
    clients: [],
    enabled: profiles.some((profile) => profile.enabled)
  };

  for (const profile of profiles) {
    const token = profileApiKeys.get(profile.id) ?? fallbackClientToken;
    result.clients.push(
      profile.agent === "claude-code"
        ? applyClaudeCodeProfile(config, profile, token, appliedAt)
        : applyCodexProfile(config, profile, token, appliedAt)
    );
  }
  return result;
}

function applyClaudeCodeProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const settingsFile = resolveClaudeCodeSettingsFile(profile);
  if (!profile.enabled) {
    return disabledStatus("claude-code", settingsFile, "Claude Code profile is disabled.");
  }

  try {
    const endpoint = gatewayEndpoint(config);
    const settings = readJsonObject(settingsFile);
    const env = {
      ...Object.fromEntries(stringRecord(settings.env)),
      ...profileEnv(profile)
    };
    env.ANTHROPIC_BASE_URL = endpoint;
    env.ANTHROPIC_API_BASE_URL = endpoint;
    env.CLAUDE_AGENT_API_BASE_URL = endpoint;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.ANTHROPIC_API_KEY;
    if (profile.model.trim()) {
      env.ANTHROPIC_MODEL = normalizeClientModel(profile.model);
    } else {
      delete env.ANTHROPIC_MODEL;
    }
    if (profile.smallFastModel?.trim()) {
      env.ANTHROPIC_SMALL_FAST_MODEL = normalizeClientModel(profile.smallFastModel);
    } else {
      delete env.ANTHROPIC_SMALL_FAST_MODEL;
    }

    const helperResult = writeClaudeCodeApiKeyHelper(profile, token);
    const nextSettings = {
      ...settings,
      apiKeyHelper: helperResult.file,
      env
    };
    const writeResult = writeFileWithBackup(settingsFile, `${JSON.stringify(nextSettings, null, 2)}\n`);
    return {
      appliedAt,
      backupFile: writeResult.backupFile ?? helperResult.backupFile,
      client: "claude-code",
      enabled: true,
      message: writeResult.changed || helperResult.changed
        ? "Claude Code settings are managed by CCR."
        : "Claude Code settings already match CCR.",
      ok: true,
      path: settingsFile
    };
  } catch (error) {
    return {
      client: "claude-code",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: settingsFile
    };
  }
}

function applyCodexProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const configFile = resolveCodexConfigFile(profile);
  if (!profile.enabled) {
    return disabledStatus("codex", configFile, "Codex profile is disabled.");
  }

  try {
    const endpoint = `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`;
    const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
    const providerName = profile.providerName?.trim() || "Claude Code Router";
    const model = normalizeClientModel(profile.model) || defaultClientModel(config);
    const source = existsSync(configFile) ? readFileSync(configFile, "utf8") : "";
    const configFormat = normalizeCodexConfigFormat(profile.configFormat);
    const nextConfig = buildCodexConfigToml(source, {
      baseUrl: endpoint,
      configFormat,
      model,
      providerId,
      providerName,
      token
    });
    const writeResult = writeFileWithBackup(configFile, nextConfig);
    const separateProfileResult = maybeWriteSeparateCodexProfileFile(configFile, source, {
      configFormat,
      model,
      providerId
    });
    const middlewareResult = profile.cliMiddleware
      ? writeCodexCliMiddleware(profile, {
          configFormat,
          configFile,
          model,
          providerId
        })
      : undefined;
    const changed = writeResult.changed || Boolean(separateProfileResult?.changed) || Boolean(middlewareResult?.changed);
    const extras = [
      separateProfileResult?.file ? `profile ${separateProfileResult.file}` : "",
      middlewareResult?.file ? `middleware ${middlewareResult.file}` : ""
    ].filter(Boolean);
    return {
      appliedAt,
      backupFile: writeResult.backupFile,
      client: "codex",
      enabled: true,
      message: changed
        ? `Codex config is managed by CCR${extras.length ? ` (${extras.join(", ")})` : ""}.`
        : "Codex config already matches CCR.",
      ok: true,
      path: configFile
    };
  } catch (error) {
    return {
      client: "codex",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: configFile
    };
  }
}

function profileEntries(config: AppConfig): ProfileConfig[] {
  return config.profile.profiles;
}

async function ensureProfileApiKeys(config: AppConfig, profiles: ProfileConfig[]): Promise<Map<string, string>> {
  const apiKeys = [...(Array.isArray(config.APIKEYS) ? config.APIKEYS : [])];
  const byId = new Map(apiKeys.map((apiKey, index) => [apiKey.id || `key-${index + 1}`, { apiKey, index }]));
  const tokens = new Map<string, string>();
  let changed = false;

  for (const profile of profiles) {
    const id = profileApiKeyId(profile);
    const name = profileApiKeyName(profile);
    const existing = byId.get(id);
    if (existing?.apiKey.key.trim()) {
      tokens.set(profile.id, existing.apiKey.key.trim());
      if (existing.apiKey.name !== name) {
        apiKeys[existing.index] = {
          ...existing.apiKey,
          name
        };
        changed = true;
      }
      continue;
    }

    const apiKey: ApiKeyConfig = {
      createdAt: new Date().toISOString(),
      id,
      key: generateProfileApiKey(),
      name
    };
    apiKeys.push(apiKey);
    byId.set(id, { apiKey, index: apiKeys.length - 1 });
    tokens.set(profile.id, apiKey.key);
    changed = true;
  }

  if (changed) {
    config.APIKEYS = await replacePersistedApiKeys(apiKeys);
    config.APIKEY = config.APIKEYS[0]?.key ?? "";
  }

  return tokens;
}

function profileApiKeyId(profile: ProfileConfig): string {
  return `profile:${sanitizeProfilePathSegment(profile.id || profile.name || profile.agent) || "profile"}`;
}

function profileApiKeyName(profile: ProfileConfig): string {
  return `Profile: ${profile.name?.trim() || profile.id || profile.agent}`;
}

function generateProfileApiKey(): string {
  return `ccr-profile-${randomBase64Url(24)}`;
}

function randomBase64Url(byteLength: number): string {
  return randomBytes(byteLength).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function profilePath(profile: ProfileConfig): string {
  return profile.agent === "claude-code"
    ? resolveClaudeCodeSettingsFile(profile)
    : resolveCodexConfigFile(profile);
}

function resolveClaudeCodeSettingsFile(profile: ProfileConfig): string {
  if (isGeneratedProfileScope(profile.scope)) {
    return path.join(ccrManagedProfileDir(profile), "claude", "settings.json");
  }
  return resolveUserPath(profile.settingsFile || "~/.claude/settings.json");
}

function resolveCodexConfigFile(profile: ProfileConfig): string {
  if (isGeneratedProfileScope(profile.scope)) {
    return path.join(ccrManagedProfileDir(profile), "codex", "config.toml");
  }
  const codexHome = profile.codexHome?.trim();
  if (codexHome) {
    return path.join(resolveUserPath(codexHome), "config.toml");
  }
  return resolveUserPath(profile.configFile || "~/.codex/config.toml");
}

function ccrManagedProfileDir(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent);
  const baseDir = path.join(CONFIGDIR, "profiles", slug || "profile");
  return profile.scope === "custom" ? path.join(baseDir, "custom") : baseDir;
}

function buildCodexConfigToml(
  source: string,
  values: {
    baseUrl: string;
    configFormat: "legacy" | "separate_profile_files";
    model: string;
    providerId: string;
    providerName: string;
    token: string;
  }
): string {
  let content = removeManagedBlock(source, managedRootStart, managedRootEnd);
  content = removeManagedBlock(content, managedProviderStart, managedProviderEnd);
  content = removeCodexProviderTable(content, values.providerId);
  if (values.configFormat === "separate_profile_files") {
    content = removeCodexProfileTable(content, values.providerId);
  }

  const firstTableIndex = firstTomlTableIndex(content);
  const rootSource = firstTableIndex === -1 ? content : content.slice(0, firstTableIndex);
  const restSource = firstTableIndex === -1 ? "" : content.slice(firstTableIndex);
  const cleanedRoot = removeRootTomlKeys(rootSource, ["model", "model_provider", "profile"]);
  const rootBlock = [
    managedRootStart,
    `model_provider = ${tomlString(values.providerId)}`,
    `model = ${tomlString(values.model)}`,
    managedRootEnd,
    ""
  ].join("\n");
  const providerBlock = [
    "",
    managedProviderStart,
    `[model_providers.${tomlKey(values.providerId)}]`,
    `name = ${tomlString(values.providerName)}`,
    `base_url = ${tomlString(values.baseUrl)}`,
    `experimental_bearer_token = ${tomlString(values.token)}`,
    'wire_api = "responses"',
    managedProviderEnd,
    ""
  ].join("\n");

  return `${rootBlock}${trimLeadingBlankLines(cleanedRoot)}${restSource}${providerBlock}`.replace(/\n{4,}/g, "\n\n\n");
}

function maybeWriteSeparateCodexProfileFile(
  configFile: string,
  source: string,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    model: string;
    providerId: string;
  }
): { changed: boolean; file: string } | undefined {
  if (values.configFormat !== "separate_profile_files") {
    return undefined;
  }
  const file = path.join(path.dirname(configFile), `${values.providerId}.config.toml`);
  const previous = existsSync(file)
    ? readFileSync(file, "utf8")
    : legacyCodexProfileTableBody(source, values.providerId);
  const next = buildSeparateCodexProfileToml(previous, values);
  const writeResult = writeFileWithBackup(file, next);
  return {
    changed: writeResult.changed,
    file
  };
}

function buildSeparateCodexProfileToml(
  source: string,
  values: {
    model: string;
    providerId: string;
  }
): string {
  const firstTableIndex = firstTomlTableIndex(source);
  const rootSource = firstTableIndex === -1 ? source : source.slice(0, firstTableIndex);
  const restSource = firstTableIndex === -1 ? "" : source.slice(firstTableIndex);
  const cleanedRoot = removeRootTomlKeys(rootSource, ["model", "model_provider", "model_reasoning_effort"]);
  const rootBlock = [
    `model_provider = ${tomlString(values.providerId)}`,
    `model = ${tomlString(values.model)}`,
    `model_reasoning_effort = "xhigh"`,
    ""
  ].join("\n");
  return ensureTrailingNewline(`${rootBlock}${trimLeadingBlankLines(cleanedRoot)}${restSource}`.replace(/\n{4,}/g, "\n\n\n"));
}

function writeClaudeCodeApiKeyHelper(profile: ProfileConfig, token: string): { backupFile?: string; changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { recursive: true });
  const file = path.join(binDir, claudeCodeApiKeyHelperFilename(profile));
  const content = process.platform === "win32"
    ? claudeCodeApiKeyHelperCmdScript(token)
    : claudeCodeApiKeyHelperShellScript(token);
  const writeResult = writeFileWithBackup(file, content);
  if (process.platform !== "win32") {
    chmodSync(file, 0o755);
  }
  return {
    backupFile: writeResult.backupFile,
    changed: writeResult.changed,
    file
  };
}

function claudeCodeApiKeyHelperFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent) || "claude-code";
  return process.platform === "win32"
    ? `ccr-claude-code-api-key-${slug}.cmd`
    : `ccr-claude-code-api-key-${slug}`;
}

function claudeCodeApiKeyHelperShellScript(token: string): string {
  return [
    "#!/bin/sh",
    `printf '%s\\n' ${shellQuote(token)}`,
    ""
  ].join("\n");
}

function claudeCodeApiKeyHelperCmdScript(token: string): string {
  return [
    "@echo off",
    `echo ${token.replace(/"/g, '\\"')}`,
    ""
  ].join("\r\n");
}

function writeCodexCliMiddleware(
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    model: string;
    providerId: string;
  }
): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { recursive: true });
  const runtimeFile = path.join(binDir, codexMiddlewareRuntimeFilename());
  const runtimeResult = writeFileWithBackup(runtimeFile, codexCliMiddlewareRuntimeScript());
  if (process.platform !== "win32") {
    chmodSync(runtimeFile, 0o755);
  }
  const file = path.join(binDir, codexMiddlewareFilename(profile, values.providerId));
  const content = process.platform === "win32"
    ? codexMiddlewareCmdScript(profile, values, runtimeFile)
    : codexMiddlewareShellScript(profile, values, runtimeFile);
  const writeResult = writeFileWithBackup(file, content);
  if (process.platform !== "win32") {
    chmodSync(file, 0o755);
  }
  return {
    changed: writeResult.changed || runtimeResult.changed,
    file
  };
}

function codexMiddlewareRuntimeFilename(): string {
  return "ccr-codex-cli-middleware.js";
}

function codexMiddlewareFilename(profile: ProfileConfig, providerId: string): string {
  const slug = sanitizeCodexProviderId(profile.id || profile.name || providerId) || "codex";
  return process.platform === "win32"
    ? `ccr-codex-cli-stdio-${slug}.cmd`
    : `ccr-codex-cli-stdio-${slug}`;
}

function codexMiddlewareShellScript(
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    model: string;
    providerId: string;
  },
  runtimeFile: string
): string {
  const codexCli = profile.codexCliPath?.trim() || "codex";
  const codexHome = profile.codexHome?.trim() || path.dirname(values.configFile);
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  const surface = normalizeProfileSurface(profile.surface);
  const envExports = Object.entries(profileEnv(profile)).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  return [
    "#!/bin/sh",
    ...envExports,
    `export CODEX_HOME=${shellQuote(resolveUserPath(codexHome))}`,
    `export CCR_REAL_CODEX_CLI_PATH=${shellQuote(codexCli)}`,
    `export CCR_CODEX_PROFILE=${shellQuote(values.providerId)}`,
    `export CCR_CODEX_MODEL=${shellQuote(values.model)}`,
    `export CCR_CODEX_MODEL_PROVIDER=${shellQuote(values.providerId)}`,
    `export CCR_CODEX_REMOTE_FRONTEND_MODE=${shellQuote(remoteFrontendMode)}`,
    `export CCR_CODEX_PROFILE_CONFIG_FORMAT=${shellQuote(values.configFormat)}`,
    `export CCR_PROFILE_SCOPE=${shellQuote(normalizeProfileScope(profile.scope))}`,
    `export CCR_PROFILE_SURFACE=${shellQuote(surface)}`,
    `export CODEXL_REAL_CODEX_CLI_PATH=${shellQuote(codexCli)}`,
    `export CODEXL_CODEX_PROFILE=${shellQuote(values.providerId)}`,
    `export CODEXL_CODEX_MODEL_PROVIDER=${shellQuote(values.providerId)}`,
    `export CODEXL_CODEX_WORKSPACE_NAME=${shellQuote(profile.name || values.providerId)}`,
    `export CODEXL_CODEX_CORE_MODE=${shellQuote(remoteFrontendMode)}`,
    `export CODEXL_CODEX_PROFILE_CONFIG_FORMAT=${shellQuote(values.configFormat)}`,
    "NODE_BIN=${CCR_NODE_BIN:-node}",
    `exec "$NODE_BIN" ${shellQuote(runtimeFile)} "$@"`,
    ""
  ].join("\n");
}

function codexMiddlewareCmdScript(
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    model: string;
    providerId: string;
  },
  runtimeFile: string
): string {
  const codexCli = profile.codexCliPath?.trim() || "codex";
  const codexHome = profile.codexHome?.trim() || path.dirname(values.configFile);
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  const surface = normalizeProfileSurface(profile.surface);
  const providerId = values.providerId.replace(/"/g, '\\"');
  const workspaceName = (profile.name || values.providerId).replace(/"/g, '\\"');
  const envExports = Object.entries(profileEnv(profile)).map(([key, value]) => `set "${key}=${value.replace(/"/g, '\\"')}"`);
  return [
    "@echo off",
    ...envExports,
    `set "CODEX_HOME=${resolveUserPath(codexHome).replace(/"/g, '\\"')}"`,
    `set "CCR_REAL_CODEX_CLI_PATH=${codexCli.replace(/"/g, '\\"')}"`,
    `set "CCR_CODEX_PROFILE=${providerId}"`,
    `set "CCR_CODEX_MODEL=${values.model.replace(/"/g, '\\"')}"`,
    `set "CCR_CODEX_MODEL_PROVIDER=${providerId}"`,
    `set "CCR_CODEX_REMOTE_FRONTEND_MODE=${remoteFrontendMode}"`,
    `set "CCR_CODEX_PROFILE_CONFIG_FORMAT=${values.configFormat}"`,
    `set "CCR_PROFILE_SCOPE=${normalizeProfileScope(profile.scope)}"`,
    `set "CCR_PROFILE_SURFACE=${surface}"`,
    `set "CODEXL_REAL_CODEX_CLI_PATH=${codexCli.replace(/"/g, '\\"')}"`,
    `set "CODEXL_CODEX_PROFILE=${providerId}"`,
    `set "CODEXL_CODEX_MODEL_PROVIDER=${providerId}"`,
    `set "CODEXL_CODEX_WORKSPACE_NAME=${workspaceName}"`,
    `set "CODEXL_CODEX_CORE_MODE=${remoteFrontendMode}"`,
    `set "CODEXL_CODEX_PROFILE_CONFIG_FORMAT=${values.configFormat}"`,
    "if not defined CCR_NODE_BIN set \"CCR_NODE_BIN=node\"",
    "if \"%~1\"==\"\" (",
    `  "%CCR_NODE_BIN%" "${runtimeFile.replace(/"/g, '\\"')}"`,
    ") else (",
    `  "%CCR_NODE_BIN%" "${runtimeFile.replace(/"/g, '\\"')}" %*`,
    ")",
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

function removeRootTomlKeys(source: string, keys: string[]): string {
  const keyPattern = keys.map(escapeRegExp).join("|");
  const pattern = new RegExp(`^\\s*(?:${keyPattern})\\s*=.*(?:\\n|$)`, "gm");
  return source.replace(pattern, "");
}

function removeCodexProviderTable(source: string, providerId: string): string {
  return removeTomlTable(source, "model_providers", providerId);
}

function removeCodexProfileTable(source: string, providerId: string): string {
  return removeTomlTable(source, "profiles", providerId);
}

function removeTomlTable(source: string, section: string, name: string): string {
  const lines = source.split(/(?<=\n)/);
  const headers = new Set([
    `[${section}.${name}]`,
    `[${section}.${tomlQuotedKey(name)}]`
  ]);
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!headers.has(line.trim())) {
      kept.push(line);
      continue;
    }

    index += 1;
    while (index < lines.length && !/^\s*\[/.test(lines[index])) {
      index += 1;
    }
    index -= 1;
  }
  return kept.join("");
}

function legacyCodexProfileTableBody(source: string, providerId: string): string {
  const headers = new Set([
    `[profiles.${providerId}]`,
    `[profiles.${tomlQuotedKey(providerId)}]`
  ]);
  const lines: string[] = [];
  let inTarget = false;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\s*\[/.test(trimmed)) {
      if (inTarget) {
        break;
      }
      inTarget = headers.has(trimmed);
      continue;
    }
    if (inTarget) {
      lines.push(line);
    }
  }
  return lines.join("\n").trim();
}

function removeManagedBlock(source: string, start: string, end: string): string {
  const pattern = new RegExp(`\\n?${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "g");
  return source.replace(pattern, "\n");
}

function firstTomlTableIndex(source: string): number {
  const match = source.match(/^\s*\[/m);
  return match?.index ?? -1;
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

function writeFileWithBackup(file: string, content: string): { backupFile?: string; changed: boolean } {
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    return { changed: false };
  }
  const backupFile = previous === undefined ? undefined : backupFilePath(file);
  if (backupFile) {
    copyFileSync(file, backupFile);
  }
  writeFileSync(file, content, "utf8");
  return { backupFile, changed: true };
}

function backupFilePath(file: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${file}.ccr-backup-${timestamp}`;
}

function disabledStatus(client: "claude-code" | "codex", file: string, message: string): ProfileClientApplyStatus {
  return {
    client,
    enabled: false,
    message,
    ok: true,
    path: resolveUserPath(file)
  };
}

function gatewayEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" ? "127.0.0.1" : config.gateway.host || "127.0.0.1";
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${config.gateway.port}`;
}

function defaultClientModel(config: AppConfig): string {
  const configuredDefault = normalizeClientModel(config.Router.default);
  if (configuredDefault) {
    return configuredDefault;
  }
  const preferred = config.Providers.find((provider) => provider.name === config.preferredProvider) ?? config.Providers[0];
  if (preferred?.name && preferred.models[0]) {
    return `${preferred.name}/${preferred.models[0]}`;
  }
  return "gpt-5-codex";
}

function normalizeClientModel(value: string | undefined): string {
  return normalizeRouteSelector(value)?.trim() || "";
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed || ".");
}

function sanitizeCodexProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function sanitizeProfilePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeCodexConfigFormat(value: ProfileConfig["configFormat"]): "legacy" | "separate_profile_files" {
  return value === "separate_profile_files" ? "separate_profile_files" : "legacy";
}

function normalizeCodexRemoteFrontendMode(value: ProfileConfig["remoteFrontendMode"]): "app" | "cli" | "claude-code" {
  return value === "cli" || value === "claude-code" ? value : "app";
}

function normalizeProfileScope(value: ProfileConfig["scope"]): "ccr" | "global" | "custom" {
  return value === "ccr" || value === "custom" ? value : "global";
}

function isGeneratedProfileScope(value: ProfileConfig["scope"]): boolean {
  return value === "ccr" || value === "custom";
}

function normalizeProfileSurface(value: ProfileConfig["surface"]): "auto" | "cli" | "app" {
  return value === "cli" || value === "app" ? value : "auto";
}

function profileEnv(profile: ProfileConfig): Record<string, string> {
  return stringRecord(profile.env).filter(([key]) => isEnvName(key)).reduce<Record<string, string>>((result, [key, value]) => {
    result[key] = value;
    return result;
  }, {});
}

function stringRecord(value: unknown): Array<[string, string]> {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value)
    .map(([key, itemValue]) => [key.trim(), itemValue] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string");
}

function isEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function tomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlQuotedKey(value);
}

function tomlQuotedKey(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
}

function tomlStringContent(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function trimLeadingBlankLines(value: string): string {
  return value.replace(/^\s*\n/g, "");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
