import { randomBytes } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV, NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, enforceSingleEnabledGlobalProfilePerAgent, hasAvailableGatewayModels, type ApiKeyConfig, type AppConfig, type ProfileApplyResult, type ProfileClientApplyStatus, type ProfileClientKind, type ProfileConfig } from "../shared/app";
import { replacePersistedApiKeys } from "./api-key-store";
import { botGatewayProfileEnv } from "./bot-gateway-env";
import { writeCodexCompatibleAppModelCatalog } from "./codex-app-launch";
import { codexCliMiddlewareRuntimeScript } from "./codex-cli-middleware-runtime";
import { codexModelCatalogJson } from "./codex-model-catalog";
import { CONFIGDIR } from "./constants";
import { resolveZcodeConfigFile, writeZcodeGatewayConfig, zcodeHomeFromConfigFile } from "./zcode-profile-config";
import { normalizeRouteSelector } from "../server/gateway/claude-code-router-plugin";

const managedRootStart = "# BEGIN CCR managed profile";
const managedRootEnd = "# END CCR managed profile";
const managedProviderStart = "# BEGIN CCR managed Codex provider";
const managedProviderEnd = "# END CCR managed Codex provider";
const originalBackupSuffix = ".ccr-original";
const originalMissingSuffix = ".ccr-original-missing";
const fallbackClientToken = "ccr-local";
const privateDirMode = 0o700;
const privateExecutableMode = 0o700;
const privateFileMode = 0o600;
const publicExecutableMode = 0o755;

export async function applyProfileConfig(config: AppConfig): Promise<ProfileApplyResult> {
  const appliedAt = new Date().toISOString();
  const profiles = profileEntries(config);
  const result: ProfileApplyResult = {
    appliedAt,
    clients: [],
    enabled: profiles.some((profile) => profile.enabled)
  };

  if (!result.enabled) {
    result.clients = profiles.map(disabledProfileStatus);
    return result;
  }

  if (!hasAvailableGatewayModels(config)) {
    result.clients = profiles.map((profile) =>
      profile.enabled
        ? unavailableModelStatus(profile, profilePath(profile))
        : disabledProfileStatus(profile)
    );
    return result;
  }

  const profileApiKeys = await ensureProfileApiKeys(config, profiles);

  for (const profile of profiles) {
    const token = profileApiKeys.get(profile.id) ?? fallbackClientToken;
    result.clients.push(
      profile.agent === "claude-code"
        ? applyClaudeCodeProfile(config, profile, token, appliedAt)
        : profile.agent === "zcode"
          ? applyZcodeProfile(config, profile, token, appliedAt)
          : applyCodexProfile(config, profile, token, appliedAt)
    );
  }
  return result;
}

export function applyProfileRuntimeConfig(config: AppConfig, profile: ProfileConfig, token: string): ProfileClientApplyStatus {
  const appliedAt = new Date().toISOString();
  return profile.agent === "claude-code"
    ? applyClaudeCodeProfile(config, profile, token, appliedAt)
    : profile.agent === "zcode"
      ? applyZcodeProfile(config, profile, token, appliedAt)
      : applyCodexProfile(config, profile, token, appliedAt);
}

function applyClaudeCodeProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const settingsFile = resolveClaudeCodeSettingsFile(profile);
  if (!profile.enabled) {
    return restoreDisabledGlobalProfile(profile, settingsFile, "Claude Code profile is disabled.", isManagedClaudeCodeSettingsContent);
  }

  try {
    const endpoint = gatewayEndpoint(config);
    const settings = readJsonObject(settingsFile);
    const env = {
      ...withoutBotGatewayEnv(Object.fromEntries(stringRecord(settings.env))),
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
    const wrapperResult = writeClaudeCodeWrapper(config, profile, helperResult.file);
    const nextSettings = {
      ...settings,
      apiKeyHelper: process.platform === "win32" ? `"${helperResult.file}"` : helperResult.file,
      env
    };
    const writeResult = writeFileWithBackup(settingsFile, `${JSON.stringify(nextSettings, null, 2)}\n`, { mode: privateFileMode });
    const changed = writeResult.changed || helperResult.changed || wrapperResult.changed;
    return {
      appliedAt,
      backupFile: writeResult.backupFile ?? helperResult.backupFile ?? wrapperResult.backupFile,
      client: "claude-code",
      enabled: true,
      message: changed
        ? `Claude Code settings are managed by CCR (wrapper ${wrapperResult.file}).`
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
  const clientName = codexCompatibleClientName(profile.agent);
  const configFile = resolveCodexConfigFile(profile);
  if (!profile.enabled) {
    return restoreDisabledGlobalProfile(
      profile,
      configFile,
      `${clientName} profile is disabled.`,
      (content) => isManagedCodexConfigContent(content, sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router")
    );
  }

  try {
    const endpoint = `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`;
    const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
    const providerName = profile.providerName?.trim() || "Claude Code Router";
    const model = normalizeClientModel(profile.model) || defaultClientModel(config);
    const source = existsSync(configFile) ? readFileSync(configFile, "utf8") : "";
    const configFormat = normalizeCodexConfigFormat(profile.configFormat);
    const modelCatalogFile = codexModelCatalogFile(configFile);
    const modelCatalogResult = writeFileWithBackup(modelCatalogFile, codexModelCatalogJson(config, model));
    const appModelCatalogResult = writeCodexCompatibleAppModelCatalog(CONFIGDIR, { ...profile, model }, config);
    const showAllSessions = profile.agent === "zcode" ? false : Boolean(profile.showAllSessions);
    const nextConfig = buildCodexConfigToml(source, {
      baseUrl: endpoint,
      modelCatalogFile,
      configFormat,
      model,
      providerId,
      providerName,
      showAllSessions,
      token
    });
    const writeResult = writeFileWithBackup(configFile, nextConfig, { mode: privateFileMode });
    const separateProfileResult = maybeWriteSeparateCodexProfileFile(configFile, source, {
      configFormat,
      model,
      providerId,
      showAllSessions
    });
    const middlewareResult = profile.cliMiddleware
      ? writeCodexCliMiddleware(config, profile, {
          configFormat,
          configFile,
          modelCatalogFile,
          model,
          providerId
        })
      : undefined;
    const changed = writeResult.changed ||
      modelCatalogResult.changed ||
      appModelCatalogResult.changed ||
      Boolean(separateProfileResult?.changed) ||
      Boolean(middlewareResult?.changed);
    const extras = [
      modelCatalogFile ? `catalog ${modelCatalogFile}` : "",
      appModelCatalogResult.file ? `app catalog ${appModelCatalogResult.file}` : "",
      separateProfileResult?.file ? `profile ${separateProfileResult.file}` : "",
      middlewareResult?.file ? `middleware ${middlewareResult.file}` : ""
    ].filter(Boolean);
    return {
      appliedAt,
      backupFile: writeResult.backupFile,
      client: profile.agent,
      enabled: true,
      message: changed
        ? `${clientName} config is managed by CCR${extras.length ? ` (${extras.join(", ")})` : ""}.`
        : `${clientName} config already matches CCR.`,
      ok: true,
      path: configFile
    };
  } catch (error) {
    return {
      client: profile.agent,
      enabled: true,
      message: formatError(error),
      ok: false,
      path: configFile
    };
  }
}

function applyZcodeProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const configFile = resolveZcodeConfigFile(profile);
  if (!profile.enabled) {
    return restoreDisabledZcodeProfile(profile, configFile);
  }

  try {
    const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
    const model = normalizeClientModel(profile.model) || defaultClientModel(config);
    const configResult = writeZcodeGatewayConfig(config, profile, token, { backup: true });
    const middlewareResult = profile.cliMiddleware
      ? writeCodexCliMiddleware(config, profile, {
          configFile,
          configFormat: normalizeCodexConfigFormat(profile.configFormat),
          model,
          modelCatalogFile: zcodeMiddlewareModelCatalogFile(configFile),
          providerId
        })
      : undefined;
    const changed = configResult.changed || Boolean(middlewareResult?.changed);
    const extras = [
      middlewareResult?.file ? `middleware ${middlewareResult.file}` : ""
    ].filter(Boolean);
    return {
      appliedAt,
      backupFile: configResult.backupFile,
      client: "zcode",
      enabled: true,
      message: changed
        ? `ZCode config is managed by CCR${extras.length ? ` (${extras.join(", ")})` : ""}.`
        : "ZCode config already matches CCR.",
      ok: true,
      path: configResult.file
    };
  } catch (error) {
    return {
      client: "zcode",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: configFile
    };
  }
}

function profileEntries(config: AppConfig): ProfileConfig[] {
  return enforceSingleEnabledGlobalProfilePerAgent(config.profile.profiles);
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
  if (profile.agent === "zcode") {
    return resolveZcodeConfigFile(profile);
  }
  if (isGeneratedProfileScope(profile.scope)) {
    return path.join(ccrManagedProfileDir(profile), codexConfigSubdir(profile.agent), "config.toml");
  }
  const codexHome = profile.codexHome?.trim();
  if (codexHome) {
    return path.join(resolveUserPath(codexHome), "config.toml");
  }
  return resolveUserPath(profile.configFile || defaultCodexConfigFile(profile.agent));
}

function codexModelCatalogFile(configFile: string): string {
  return path.join(path.dirname(configFile), "ccr-model-catalog.json");
}

function zcodeMiddlewareModelCatalogFile(configFile: string): string {
  return path.join(path.dirname(configFile), "ccr-zcode-middleware-model-catalog.json");
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
    modelCatalogFile: string;
    configFormat: "legacy" | "separate_profile_files";
    model: string;
    providerId: string;
    providerName: string;
    showAllSessions: boolean;
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
  const cleanedRoot = removeRootTomlKeys(rootSource, ["model", "model_catalog_json", "model_provider", "profile", "show_all_sessions"]);
  const rootBlock = [
    managedRootStart,
    `model_provider = ${tomlString(values.providerId)}`,
    `model = ${tomlString(values.model)}`,
    `model_catalog_json = ${tomlString(values.modelCatalogFile)}`,
    ...(values.showAllSessions ? ["show_all_sessions = true"] : []),
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
    showAllSessions: boolean;
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
  const writeResult = writeFileWithBackup(file, next, { mode: privateFileMode });
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
    showAllSessions: boolean;
  }
): string {
  const firstTableIndex = firstTomlTableIndex(source);
  const rootSource = firstTableIndex === -1 ? source : source.slice(0, firstTableIndex);
  const restSource = firstTableIndex === -1 ? "" : source.slice(firstTableIndex);
  const cleanedRoot = removeRootTomlKeys(rootSource, ["model", "model_provider", "model_reasoning_effort", "show_all_sessions"]);
  const rootBlock = [
    `model_provider = ${tomlString(values.providerId)}`,
    `model = ${tomlString(values.model)}`,
    `model_reasoning_effort = "xhigh"`,
    ...(values.showAllSessions ? ["show_all_sessions = true"] : []),
    ""
  ].join("\n");
  return ensureTrailingNewline(`${rootBlock}${trimLeadingBlankLines(cleanedRoot)}${restSource}`.replace(/\n{4,}/g, "\n\n\n"));
}

function writeClaudeCodeApiKeyHelper(profile: ProfileConfig, token: string): { backupFile?: string; changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const file = path.join(binDir, claudeCodeApiKeyHelperFilename(profile));
  const content = process.platform === "win32"
    ? claudeCodeApiKeyHelperCmdScript(token)
    : claudeCodeApiKeyHelperShellScript(token);
  const writeResult = writeFileWithBackup(file, content, { mode: privateExecutableMode });
  if (process.platform !== "win32") {
    chmodSync(file, privateExecutableMode);
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
    `echo ${cmdValue(token)}`,
    ""
  ].join("\r\n");
}

function writeClaudeCodeWrapper(config: AppConfig, profile: ProfileConfig, apiKeyHelperFile: string): { backupFile?: string; changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const runtimeFile = path.join(binDir, codexMiddlewareRuntimeFilename());
  const runtimeResult = writeFileWithBackup(runtimeFile, codexCliMiddlewareRuntimeScript());
  if (process.platform !== "win32") {
    chmodSync(runtimeFile, publicExecutableMode);
  }
  const file = path.join(binDir, claudeCodeWrapperFilename(profile));
  const content = process.platform === "win32"
    ? claudeCodeWrapperCmdScript(config, profile, runtimeFile, apiKeyHelperFile)
    : claudeCodeWrapperShellScript(config, profile, runtimeFile, apiKeyHelperFile);
  const writeResult = writeFileWithBackup(file, content, { mode: privateExecutableMode });
  if (process.platform !== "win32") {
    chmodSync(file, privateExecutableMode);
  }
  return {
    backupFile: writeResult.backupFile ?? runtimeResult.backupFile,
    changed: writeResult.changed || runtimeResult.changed,
    file
  };
}

function claudeCodeWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent).toLowerCase() || "claude-code";
  return process.platform === "win32"
    ? `ccr-claude-code-wrapper-${slug}.cmd`
    : `ccr-claude-code-wrapper-${slug}`;
}

function claudeCodeWrapperShellScript(config: AppConfig, profile: ProfileConfig, runtimeFile: string, apiKeyHelperFile: string): string {
  const realClaude = profile.env?.CCR_CLAUDE_CODE_BIN?.trim() || "claude";
  const surface = normalizeProfileSurface(profile.surface);
  const remoteEndpoint = `${gatewayEndpoint(config)}/__ccr/remote`;
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => key !== "CCR_CLAUDE_CODE_BIN")
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  const botEnvExports = shellBotGatewayEnvExports(config, profile);
  return [
    "#!/bin/sh",
    ...envExports,
    `: "\${CCR_PROFILE_SURFACE:=${surface}}"`,
    "export CCR_PROFILE_SURFACE",
    ...botEnvExports,
    `export CCR_CLAUDE_CODE_WRAPPER=1`,
    `export CCR_REAL_CLAUDE_CODE_BIN=${shellQuote(realClaude)}`,
    `export CODEXL_CLAUDE_CODE_BIN=${shellQuote(realClaude)}`,
    `if [ -z "\${CCR_REMOTE_SYNC_ENABLED:-}" ]; then CCR_REMOTE_SYNC_ENABLED=1; fi`,
    `if [ -z "\${CCR_REMOTE_SYNC_ENDPOINT:-}" ]; then CCR_REMOTE_SYNC_ENDPOINT=${shellQuote(remoteEndpoint)}; fi`,
    `if [ -z "\${CCR_REMOTE_SYNC_API_KEY_HELPER:-}" ]; then CCR_REMOTE_SYNC_API_KEY_HELPER=${shellQuote(apiKeyHelperFile)}; fi`,
    `if [ -z "\${CCR_REMOTE_SYNC_PROFILE_ID:-}" ]; then CCR_REMOTE_SYNC_PROFILE_ID=${shellQuote(profile.id || profile.name || "claude-code")}; fi`,
    `if [ -z "\${CCR_REMOTE_SYNC_PROFILE_NAME:-}" ]; then CCR_REMOTE_SYNC_PROFILE_NAME=${shellQuote(profile.name || profile.id || "Claude Code")}; fi`,
    "export CCR_REMOTE_SYNC_ENABLED CCR_REMOTE_SYNC_ENDPOINT CCR_REMOTE_SYNC_API_KEY_HELPER CCR_REMOTE_SYNC_PROFILE_ID CCR_REMOTE_SYNC_PROFILE_NAME",
    ...nodeRuntimeShellExecLines(runtimeFile),
    ""
  ].join("\n");
}

function claudeCodeWrapperCmdScript(config: AppConfig, profile: ProfileConfig, runtimeFile: string, apiKeyHelperFile: string): string {
  const realClaude = profile.env?.CCR_CLAUDE_CODE_BIN?.trim() || "claude";
  const surface = normalizeProfileSurface(profile.surface);
  const remoteEndpoint = `${gatewayEndpoint(config)}/__ccr/remote`;
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => key !== "CCR_CLAUDE_CODE_BIN")
    .map(([key, value]) => cmdSetLine(key, value));
  const botEnvExports = cmdBotGatewayEnvExports(config, profile);
  return [
    "@echo off",
    ...envExports,
    `if not defined CCR_PROFILE_SURFACE ${cmdSetLine("CCR_PROFILE_SURFACE", surface)}`,
    ...botEnvExports,
    cmdSetLine("CCR_CLAUDE_CODE_WRAPPER", "1"),
    cmdSetLine("CCR_REAL_CLAUDE_CODE_BIN", realClaude),
    cmdSetLine("CODEXL_CLAUDE_CODE_BIN", realClaude),
    `if not defined CCR_REMOTE_SYNC_ENABLED ${cmdSetLine("CCR_REMOTE_SYNC_ENABLED", "1")}`,
    `if not defined CCR_REMOTE_SYNC_ENDPOINT ${cmdSetLine("CCR_REMOTE_SYNC_ENDPOINT", remoteEndpoint)}`,
    `if not defined CCR_REMOTE_SYNC_API_KEY_HELPER ${cmdSetLine("CCR_REMOTE_SYNC_API_KEY_HELPER", apiKeyHelperFile)}`,
    `if not defined CCR_REMOTE_SYNC_PROFILE_ID ${cmdSetLine("CCR_REMOTE_SYNC_PROFILE_ID", profile.id || profile.name || "claude-code")}`,
    `if not defined CCR_REMOTE_SYNC_PROFILE_NAME ${cmdSetLine("CCR_REMOTE_SYNC_PROFILE_NAME", profile.name || profile.id || "Claude Code")}`,
    ...nodeRuntimeCmdExecLines(runtimeFile),
    ""
  ].join("\r\n");
}

function writeCodexCliMiddleware(
  config: AppConfig,
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    modelCatalogFile: string;
    model: string;
    providerId: string;
  }
): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const runtimeFile = path.join(binDir, codexMiddlewareRuntimeFilename());
  const runtimeResult = writeFileWithBackup(runtimeFile, codexCliMiddlewareRuntimeScript());
  if (process.platform !== "win32") {
    chmodSync(runtimeFile, publicExecutableMode);
  }
  const file = path.join(binDir, codexMiddlewareFilename(profile, values.providerId));
  const content = process.platform === "win32"
    ? codexMiddlewareCmdScript(config, profile, values, runtimeFile)
    : codexMiddlewareShellScript(config, profile, values, runtimeFile);
  const writeResult = writeFileWithBackup(file, content, { mode: privateExecutableMode });
  if (process.platform !== "win32") {
    chmodSync(file, privateExecutableMode);
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

function shellProfileSurfaceExports(surface: "auto" | "cli" | "app"): string[] {
  return [
    "if [ -z \"${CCR_PROFILE_SURFACE:-}\" ]; then",
    "  case \"${1:-}\" in",
    "    app|app-server) CCR_PROFILE_SURFACE=app ;;",
    `    *) CCR_PROFILE_SURFACE=${shellQuote(surface)} ;;`,
    "  esac",
    "fi",
    "export CCR_PROFILE_SURFACE"
  ];
}

function shellCodexlProfileSurfaceExports(): string[] {
  return [
    "if [ -z \"${CODEXL_PROFILE_SURFACE:-}\" ]; then",
    "  CODEXL_PROFILE_SURFACE=$CCR_PROFILE_SURFACE",
    "fi",
    "export CODEXL_PROFILE_SURFACE"
  ];
}

function nodeRuntimeShellExecLines(runtimeFile: string): string[] {
  return [
    "if [ -n \"${CCR_NODE_BIN:-}\" ]; then",
    `  exec "$CCR_NODE_BIN" ${shellQuote(runtimeFile)} "$@"`,
    "fi",
    "if command -v node >/dev/null 2>&1; then",
    `  exec node ${shellQuote(runtimeFile)} "$@"`,
    "fi",
    `ELECTRON_RUN_AS_NODE=1 exec ${shellQuote(process.execPath)} ${shellQuote(runtimeFile)} "$@"`
  ];
}

function codexMiddlewareShellScript(
  config: AppConfig,
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    modelCatalogFile: string;
    model: string;
    providerId: string;
  },
  runtimeFile: string
): string {
  const codexCli = profile.codexCliPath?.trim() || defaultCodexCliCommand(profile.agent);
  const codexHome = profile.codexHome?.trim() || defaultCodexCompatibleHome(profile.agent, values.configFile);
  const resolvedCodexHome = resolveUserPath(codexHome);
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  const surface = profile.agent === "zcode" ? "app" : normalizeProfileSurface(profile.surface);
  const envExports = Object.entries(profileEnv(profile)).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  const botEnvExports = shellBotGatewayEnvExports(config, profile);
  const agentEnvExports = profile.agent === "zcode"
    ? [
        `export ZCODE_HOME=${shellQuote(resolvedCodexHome)}`,
        `export ZCODE_STORAGE_DIR=${shellQuote(resolvedCodexHome)}`,
        "if [ -z \"${CCR_REAL_ZCODE_CLI_PATH:-}\" ]; then",
        `  CCR_REAL_ZCODE_CLI_PATH=${shellQuote(codexCli)}`,
        "fi",
        "export CCR_REAL_ZCODE_CLI_PATH",
        `export CCR_ZCODE_PROFILE=${shellQuote(values.providerId)}`,
        `export CCR_ZCODE_MODEL=${shellQuote(values.model)}`,
        `export CCR_ZCODE_MODEL_CATALOG_FILE=${shellQuote(values.modelCatalogFile)}`,
        `export CCR_ZCODE_MODEL_PROVIDER=${shellQuote(values.providerId)}`,
        `export CCR_ZCODE_PROFILE_CONFIG_FORMAT=${shellQuote(values.configFormat)}`,
        `export CCR_PROFILE_SCOPE=${shellQuote(normalizeProfileScope(profile.scope))}`,
        `export CCR_ZCODE_REMOTE_FRONTEND_MODE=${shellQuote(remoteFrontendMode)}`,
        "if [ -z \"${CODEXL_REAL_ZCODE_CLI_PATH:-}\" ]; then",
        "  CODEXL_REAL_ZCODE_CLI_PATH=$CCR_REAL_ZCODE_CLI_PATH",
        "fi",
        "export CODEXL_REAL_ZCODE_CLI_PATH",
        `export CODEXL_ZCODE_PROFILE=${shellQuote(values.providerId)}`,
        `export CODEXL_ZCODE_MODEL_CATALOG_FILE=${shellQuote(values.modelCatalogFile)}`,
        `export CODEXL_ZCODE_MODEL_PROVIDER=${shellQuote(values.providerId)}`,
        `export CODEXL_ZCODE_WORKSPACE_NAME=${shellQuote(profile.name || values.providerId)}`,
        `export CODEXL_ZCODE_PROFILE_CONFIG_FORMAT=${shellQuote(values.configFormat)}`,
        `export CODEXL_ZCODE_CORE_MODE=${shellQuote(remoteFrontendMode)}`
      ]
    : [
        `export CODEX_HOME=${shellQuote(resolvedCodexHome)}`,
        "if [ -z \"${CCR_REAL_CODEX_CLI_PATH:-}\" ]; then",
        `  CCR_REAL_CODEX_CLI_PATH=${shellQuote(codexCli)}`,
        "fi",
        "export CCR_REAL_CODEX_CLI_PATH",
        `export CCR_CODEX_PROFILE=${shellQuote(values.providerId)}`,
        `export CCR_CODEX_MODEL=${shellQuote(values.model)}`,
        `export CCR_CODEX_MODEL_CATALOG_FILE=${shellQuote(values.modelCatalogFile)}`,
        `export CCR_CODEX_MODEL_PROVIDER=${shellQuote(values.providerId)}`,
        `export CCR_CODEX_PROFILE_CONFIG_FORMAT=${shellQuote(values.configFormat)}`,
        `export CCR_PROFILE_SCOPE=${shellQuote(normalizeProfileScope(profile.scope))}`,
        `export CCR_CODEX_REMOTE_FRONTEND_MODE=${shellQuote(remoteFrontendMode)}`,
        "if [ -z \"${CODEXL_REAL_CODEX_CLI_PATH:-}\" ]; then",
        "  CODEXL_REAL_CODEX_CLI_PATH=$CCR_REAL_CODEX_CLI_PATH",
        "fi",
        "export CODEXL_REAL_CODEX_CLI_PATH",
        `export CODEXL_CODEX_PROFILE=${shellQuote(values.providerId)}`,
        `export CODEXL_CODEX_MODEL_CATALOG_FILE=${shellQuote(values.modelCatalogFile)}`,
        `export CODEXL_CODEX_MODEL_PROVIDER=${shellQuote(values.providerId)}`,
        `export CODEXL_CODEX_WORKSPACE_NAME=${shellQuote(profile.name || values.providerId)}`,
        `export CODEXL_CODEX_PROFILE_CONFIG_FORMAT=${shellQuote(values.configFormat)}`,
        `export CODEXL_CODEX_CORE_MODE=${shellQuote(remoteFrontendMode)}`
      ];
  return [
    "#!/bin/sh",
    ...envExports,
    ...agentEnvExports,
    ...shellProfileSurfaceExports(surface),
    ...botEnvExports,
    ...shellCodexlProfileSurfaceExports(),
    ...nodeRuntimeShellExecLines(runtimeFile),
    ""
  ].join("\n");
}

function cmdProfileSurfaceExports(surface: "auto" | "cli" | "app"): string[] {
  return [
    "if not defined CCR_PROFILE_SURFACE (",
    "  if \"%~1\"==\"app\" (",
    cmdSetLine("CCR_PROFILE_SURFACE", "app", "    "),
    "  ) else if \"%~1\"==\"app-server\" (",
    cmdSetLine("CCR_PROFILE_SURFACE", "app", "    "),
    "  ) else (",
    cmdSetLine("CCR_PROFILE_SURFACE", surface, "    "),
    "  )",
    ")"
  ];
}

function cmdCodexlProfileSurfaceExports(): string[] {
  return [
    "if not defined CODEXL_PROFILE_SURFACE set \"CODEXL_PROFILE_SURFACE=%CCR_PROFILE_SURFACE%\""
  ];
}

function nodeRuntimeCmdExecLines(runtimeFile: string): string[] {
  const quotedRuntime = cmdQuote(runtimeFile);
  const quotedHost = cmdQuote(process.execPath);
  return [
    "if defined CCR_NODE_BIN (",
    `  "%CCR_NODE_BIN%" ${quotedRuntime} %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    "where node >nul 2>nul",
    "if %ERRORLEVEL%==0 (",
    `  node ${quotedRuntime} %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    "set \"ELECTRON_RUN_AS_NODE=1\"",
    `${quotedHost} ${quotedRuntime} %*`,
    "exit /b %ERRORLEVEL%"
  ];
}

function codexMiddlewareCmdScript(
  config: AppConfig,
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    modelCatalogFile: string;
    model: string;
    providerId: string;
  },
  runtimeFile: string
): string {
  const codexCli = profile.codexCliPath?.trim() || defaultCodexCliCommand(profile.agent);
  const codexHome = profile.codexHome?.trim() || defaultCodexCompatibleHome(profile.agent, values.configFile);
  const resolvedCodexHome = resolveUserPath(codexHome);
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  const surface = profile.agent === "zcode" ? "app" : normalizeProfileSurface(profile.surface);
  const workspaceName = profile.name || values.providerId;
  const envExports = Object.entries(profileEnv(profile)).map(([key, value]) => cmdSetLine(key, value));
  const botEnvExports = cmdBotGatewayEnvExports(config, profile);
  const agentEnvExports = profile.agent === "zcode"
    ? [
        cmdSetLine("ZCODE_HOME", resolvedCodexHome),
        cmdSetLine("ZCODE_STORAGE_DIR", resolvedCodexHome),
        `if not defined CCR_REAL_ZCODE_CLI_PATH ${cmdSetLine("CCR_REAL_ZCODE_CLI_PATH", codexCli)}`,
        cmdSetLine("CCR_ZCODE_PROFILE", values.providerId),
        cmdSetLine("CCR_ZCODE_MODEL", values.model),
        cmdSetLine("CCR_ZCODE_MODEL_CATALOG_FILE", values.modelCatalogFile),
        cmdSetLine("CCR_ZCODE_MODEL_PROVIDER", values.providerId),
        cmdSetLine("CCR_ZCODE_PROFILE_CONFIG_FORMAT", values.configFormat),
        cmdSetLine("CCR_PROFILE_SCOPE", normalizeProfileScope(profile.scope)),
        cmdSetLine("CCR_ZCODE_REMOTE_FRONTEND_MODE", remoteFrontendMode),
        "if not defined CODEXL_REAL_ZCODE_CLI_PATH set \"CODEXL_REAL_ZCODE_CLI_PATH=%CCR_REAL_ZCODE_CLI_PATH%\"",
        cmdSetLine("CODEXL_ZCODE_PROFILE", values.providerId),
        cmdSetLine("CODEXL_ZCODE_MODEL_CATALOG_FILE", values.modelCatalogFile),
        cmdSetLine("CODEXL_ZCODE_MODEL_PROVIDER", values.providerId),
        cmdSetLine("CODEXL_ZCODE_WORKSPACE_NAME", workspaceName),
        cmdSetLine("CODEXL_ZCODE_PROFILE_CONFIG_FORMAT", values.configFormat),
        cmdSetLine("CODEXL_ZCODE_CORE_MODE", remoteFrontendMode)
      ]
    : [
        cmdSetLine("CODEX_HOME", resolvedCodexHome),
        `if not defined CCR_REAL_CODEX_CLI_PATH ${cmdSetLine("CCR_REAL_CODEX_CLI_PATH", codexCli)}`,
        cmdSetLine("CCR_CODEX_PROFILE", values.providerId),
        cmdSetLine("CCR_CODEX_MODEL", values.model),
        cmdSetLine("CCR_CODEX_MODEL_CATALOG_FILE", values.modelCatalogFile),
        cmdSetLine("CCR_CODEX_MODEL_PROVIDER", values.providerId),
        cmdSetLine("CCR_CODEX_PROFILE_CONFIG_FORMAT", values.configFormat),
        cmdSetLine("CCR_PROFILE_SCOPE", normalizeProfileScope(profile.scope)),
        cmdSetLine("CCR_CODEX_REMOTE_FRONTEND_MODE", remoteFrontendMode),
        "if not defined CODEXL_REAL_CODEX_CLI_PATH set \"CODEXL_REAL_CODEX_CLI_PATH=%CCR_REAL_CODEX_CLI_PATH%\"",
        cmdSetLine("CODEXL_CODEX_PROFILE", values.providerId),
        cmdSetLine("CODEXL_CODEX_MODEL_CATALOG_FILE", values.modelCatalogFile),
        cmdSetLine("CODEXL_CODEX_MODEL_PROVIDER", values.providerId),
        cmdSetLine("CODEXL_CODEX_WORKSPACE_NAME", workspaceName),
        cmdSetLine("CODEXL_CODEX_PROFILE_CONFIG_FORMAT", values.configFormat),
        cmdSetLine("CODEXL_CODEX_CORE_MODE", remoteFrontendMode)
      ];
  return [
    "@echo off",
    ...envExports,
    ...agentEnvExports,
    ...cmdProfileSurfaceExports(surface),
    ...botEnvExports,
    ...cmdCodexlProfileSurfaceExports(),
    ...nodeRuntimeCmdExecLines(runtimeFile),
    ""
  ].join("\r\n");
}

function shellBotGatewayEnvExports(config: AppConfig, profile: ProfileConfig): string[] {
  return [
    'if [ "$CCR_PROFILE_SURFACE" = "app" ]; then',
    ...Object.entries(botGatewayProfileEnv(config, profile, "app")).map(([key, value]) => `  export ${key}=${shellQuote(value)}`),
    "else",
    ...Object.entries(botGatewayProfileEnv(config, profile, "cli")).map(([key, value]) => `  export ${key}=${shellQuote(value)}`),
    "fi"
  ];
}

function cmdBotGatewayEnvExports(config: AppConfig, profile: ProfileConfig): string[] {
  return [
    `if /I "%CCR_PROFILE_SURFACE%"=="app" (`,
    ...Object.entries(botGatewayProfileEnv(config, profile, "app")).map(([key, value]) => cmdSetLine(key, value, "  ")),
    ") else (",
    ...Object.entries(botGatewayProfileEnv(config, profile, "cli")).map(([key, value]) => cmdSetLine(key, value, "  ")),
    ")"
  ];
}

function withoutBotGatewayEnv(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !isBotGatewayEnvKey(key)));
}

function isBotGatewayEnvKey(key: string): boolean {
  return key === "BOT_GATEWAY_STATE_DIR" ||
    key.startsWith("CCR_BOT_") ||
    key.startsWith("CODEXL_BOT_") ||
    key === "CCR_BOT_GATEWAY_SDK_MODULE";
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

function writeFileWithBackup(
  file: string,
  content: string,
  options: { mode?: number } = {}
): { backupFile?: string; changed: boolean } {
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    chmodFileIfRequested(file, options.mode);
    return { changed: false };
  }
  ensureOriginalSnapshot(file, previous, options.mode);
  const backupFile = previous === undefined ? undefined : backupFilePath(file);
  if (backupFile) {
    copyFileSync(file, backupFile);
    chmodFileIfRequested(backupFile, options.mode);
  }
  writeFileSync(file, content, options.mode === undefined ? "utf8" : { encoding: "utf8", mode: options.mode });
  chmodFileIfRequested(file, options.mode);
  return { backupFile, changed: true };
}

type RestoreFileResult = {
  backupFile?: string;
  changed: boolean;
  file: string;
  missingBackup: boolean;
  restored: boolean;
};

function restoreDisabledGlobalProfile(
  profile: ProfileConfig,
  file: string,
  disabledMessage: string,
  isManagedContent: (content: string) => boolean
): ProfileClientApplyStatus {
  if (!isGlobalProfile(profile)) {
    return disabledStatus(profile.agent, file, disabledMessage);
  }

  const restoreResult = restoreGlobalConfigFile(file, { isManagedContent, mode: privateFileMode });
  return disabledRestoreStatus(profile.agent, file, disabledMessage, restoreResult, profile.name || profile.id || profile.agent);
}

function disabledProfileStatus(profile: ProfileConfig): ProfileClientApplyStatus {
  if (profile.agent === "claude-code") {
    return restoreDisabledGlobalProfile(profile, resolveClaudeCodeSettingsFile(profile), "Claude Code profile is disabled.", isManagedClaudeCodeSettingsContent);
  }
  if (profile.agent === "zcode") {
    return restoreDisabledZcodeProfile(profile, resolveZcodeConfigFile(profile));
  }
  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
  return restoreDisabledGlobalProfile(
    profile,
    resolveCodexConfigFile(profile),
    "Codex profile is disabled.",
    (content) => isManagedCodexConfigContent(content, providerId)
  );
}

function restoreDisabledZcodeProfile(profile: ProfileConfig, configFile: string): ProfileClientApplyStatus {
  const disabledMessage = "ZCode profile is disabled.";
  if (!isGlobalProfile(profile)) {
    return disabledStatus("zcode", configFile, disabledMessage);
  }

  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
  const storageRoot = zcodeHomeFromConfigFile(configFile);
  const files = [
    configFile,
    path.join(storageRoot, "v2", "config.json"),
    path.join(storageRoot, "v2", "bots-model-cache.v2.json")
  ];
  const results = files.map((file) =>
    restoreGlobalConfigFile(file, {
      isManagedContent: (content) => isManagedZcodeConfigContent(content, providerId),
      mode: privateFileMode
    })
  );
  const changed = results.some((result) => result.changed);
  const restored = results.some((result) => result.restored);
  const missingBackup = results.some((result) => result.missingBackup);
  return {
    backupFile: results.find((result) => result.backupFile)?.backupFile,
    client: "zcode",
    enabled: false,
    message: missingBackup
      ? `${disabledMessage} No original ZCode config backup was found for ${profile.name || profile.id || "this profile"}.`
      : restored
        ? changed
          ? "ZCode config was restored from the CCR backup because the global profile is disabled."
          : "ZCode config already matches the CCR backup; profile is disabled."
        : disabledMessage,
    ok: !missingBackup,
    path: resolveUserPath(configFile)
  };
}

function disabledRestoreStatus(
  client: ProfileClientKind,
  file: string,
  disabledMessage: string,
  restoreResult: RestoreFileResult,
  profileName: string
): ProfileClientApplyStatus {
  return {
    backupFile: restoreResult.backupFile,
    client,
    enabled: false,
    message: restoreResult.missingBackup
      ? `${disabledMessage} No original ${codexCompatibleClientName(client)} config backup was found for ${profileName}.`
      : restoreResult.restored
        ? restoreResult.changed
          ? `${codexCompatibleClientName(client)} config was restored from the CCR backup because the global profile is disabled.`
          : `${codexCompatibleClientName(client)} config already matches the CCR backup; profile is disabled.`
        : disabledMessage,
    ok: !restoreResult.missingBackup,
    path: resolveUserPath(file)
  };
}

function restoreGlobalConfigFile(
  file: string,
  options: {
    isManagedContent: (content: string) => boolean;
    mode?: number;
  }
): RestoreFileResult {
  const current = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const currentManaged = current !== undefined && options.isManagedContent(current);
  if (current !== undefined && !currentManaged) {
    return { changed: false, file, missingBackup: false, restored: false };
  }

  if (existsSync(originalMissingFilePath(file))) {
    if (currentManaged) {
      const backupFile = backupCurrentConfigFile(file, options.mode);
      rmSync(file, { force: true });
      return { backupFile, changed: true, file, missingBackup: false, restored: true };
    }
    return { changed: false, file, missingBackup: false, restored: current === undefined };
  }

  const snapshot = originalSnapshotCandidate(file, options.isManagedContent);
  if (!snapshot) {
    return {
      changed: false,
      file,
      missingBackup: Boolean(currentManaged),
      restored: false
    };
  }

  if (current === snapshot.content) {
    chmodFileIfRequested(file, options.mode);
    return { changed: false, file, missingBackup: false, restored: true };
  }

  const backupFile = current === undefined ? undefined : backupCurrentConfigFile(file, options.mode);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, snapshot.content, options.mode === undefined ? "utf8" : { encoding: "utf8", mode: options.mode });
  chmodFileIfRequested(file, options.mode);
  return { backupFile, changed: true, file, missingBackup: false, restored: true };
}

function originalSnapshotCandidate(
  file: string,
  isManagedContent: (content: string) => boolean
): { content: string; file: string } | undefined {
  for (const candidate of [originalBackupFilePath(file), ...backupFiles(file)]) {
    if (!existsSync(candidate)) {
      continue;
    }
    const content = readFileSync(candidate, "utf8");
    if (!isManagedContent(content)) {
      return { content, file: candidate };
    }
  }
  return undefined;
}

function backupCurrentConfigFile(file: string, mode: number | undefined): string {
  const backupFile = backupFilePath(file);
  copyFileSync(file, backupFile);
  chmodFileIfRequested(backupFile, mode);
  return backupFile;
}

function backupFiles(file: string): string[] {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.ccr-backup-`;
  try {
    return readdirSync(dir)
      .filter((entry) => entry.startsWith(prefix))
      .sort()
      .map((entry) => path.join(dir, entry));
  } catch {
    return [];
  }
}

function ensureOriginalSnapshot(file: string, previous: string | undefined, mode: number | undefined): void {
  const originalBackup = originalBackupFilePath(file);
  const originalMissing = originalMissingFilePath(file);
  if (existsSync(originalBackup) || existsSync(originalMissing)) {
    return;
  }
  if (previous === undefined) {
    writeFileSync(originalMissing, "", "utf8");
    chmodFileIfRequested(originalMissing, mode);
    return;
  }
  copyFileSync(file, originalBackup);
  chmodFileIfRequested(originalBackup, mode);
}

function chmodFileIfRequested(file: string, mode: number | undefined): void {
  if (mode === undefined || process.platform === "win32") {
    return;
  }
  try {
    chmodSync(file, mode);
  } catch {
    // Best effort; the write itself should still succeed on filesystems without chmod.
  }
}

function backupFilePath(file: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${file}.ccr-backup-${timestamp}`;
}

function originalBackupFilePath(file: string): string {
  return `${file}${originalBackupSuffix}`;
}

function originalMissingFilePath(file: string): string {
  return `${file}${originalMissingSuffix}`;
}

function disabledStatus(client: ProfileClientKind, file: string, message: string): ProfileClientApplyStatus {
  return {
    client,
    enabled: false,
    message,
    ok: true,
    path: resolveUserPath(file)
  };
}

function unavailableModelStatus(profile: ProfileConfig, file: string): ProfileClientApplyStatus {
  return {
    client: profile.agent,
    enabled: true,
    message: NO_AVAILABLE_GATEWAY_MODELS_MESSAGE,
    ok: false,
    path: resolveUserPath(file)
  };
}

function disabledProfileMessage(profile: ProfileConfig): string {
  if (profile.agent === "claude-code") {
    return "Claude Code profile is disabled.";
  }
  return `${codexCompatibleClientName(profile.agent)} profile is disabled.`;
}

function isGlobalProfile(profile: ProfileConfig): boolean {
  return normalizeProfileScope(profile.scope) === "global";
}

function isManagedClaudeCodeSettingsContent(content: string): boolean {
  const settings = parseJsonContent(content);
  if (!settings) {
    return false;
  }
  const apiKeyHelper = typeof settings.apiKeyHelper === "string" ? settings.apiKeyHelper : "";
  if (apiKeyHelper.includes("ccr-claude-code-api-key-")) {
    return true;
  }
  const env = isRecord(settings.env) ? settings.env : {};
  return typeof env.ANTHROPIC_BASE_URL === "string" &&
    typeof env.ANTHROPIC_API_BASE_URL === "string" &&
    typeof env.CLAUDE_AGENT_API_BASE_URL === "string";
}

function isManagedCodexConfigContent(content: string, providerId: string): boolean {
  if (content.includes(managedRootStart) || content.includes(managedProviderStart)) {
    return true;
  }
  const escapedProvider = escapeRegExp(providerId);
  return new RegExp(`^\\s*\\[model_providers\\.(?:${escapedProvider}|${escapeRegExp(tomlQuotedKey(providerId))})\\]`, "m").test(content);
}

function isManagedZcodeConfigContent(content: string, providerId: string): boolean {
  const config = parseJsonContent(content);
  if (!config) {
    return false;
  }
  if (isRecord(config.provider) && hasOwn(config.provider, providerId)) {
    return true;
  }
  if (isRecord(config.model) && typeof config.model.main === "string" && config.model.main.startsWith(`${providerId}/`)) {
    return true;
  }
  for (const key of ["defaultModel", "lastUsed", "lastUsedModel"]) {
    const modelRef = config[key];
    if (isRecord(modelRef) && modelRef.providerId === providerId) {
      return true;
    }
  }
  return Array.isArray(config.providers) && config.providers.some((provider) =>
    isRecord(provider) && provider.id === providerId
  );
}

function parseJsonContent(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
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
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
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

function normalizeCodexConfigFormat(_value: ProfileConfig["configFormat"]): "legacy" | "separate_profile_files" {
  return "separate_profile_files";
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

function codexCompatibleClientName(agent: ProfileConfig["agent"]): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  return agent === "zcode" ? "ZCode" : "Codex";
}

function defaultCodexConfigFile(agent: ProfileConfig["agent"]): string {
  return agent === "zcode" ? "~/.zcode/cli/config.json" : "~/.codex/config.toml";
}

function codexConfigSubdir(agent: ProfileConfig["agent"]): string {
  return agent === "zcode" ? "zcode" : "codex";
}

function defaultCodexCliCommand(agent: ProfileConfig["agent"]): string {
  return agent === "zcode" ? "zcode" : "codex";
}

function defaultCodexCompatibleHome(agent: ProfileConfig["agent"], configFile: string): string {
  return agent === "zcode" ? zcodeHomeFromConfigFile(configFile) : path.dirname(configFile);
}

function profileEnv(profile: ProfileConfig): Record<string, string> {
  return stringRecord(profile.env).filter(([key]) => isEnvName(key)).reduce<Record<string, string>>((result, [key, value]) => {
    if (profile.agent !== "claude-code" && key === CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV) {
      return result;
    }
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

function cmdSetLine(key: string, value: string, indent = ""): string {
  return `${indent}set "${key}=${cmdValue(value)}"`;
}

function cmdQuote(value: string): string {
  return `"${cmdValue(value)}"`;
}

function cmdValue(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\^/g, "^^")
    .replace(/%/g, "%%")
    .replace(/"/g, '^"')
    .replace(/[&|<>()]/g, "^$&");
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

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
