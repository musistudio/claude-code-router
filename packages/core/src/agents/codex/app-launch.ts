import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileConfig } from "@ccr/core/contracts/app";
import { botGatewayProfileEnv } from "@ccr/core/agents/bot-gateway/env";
import { buildCodexModelCatalog, type CodexModelCatalog, type CodexModelCatalogItem } from "@ccr/core/agents/codex/model-catalog";
import { prepareCodexAppCdpUserDataDir } from "@ccr/core/agents/codex/media-preview-bridge";
import { buildProfileLaunchPlan, resolveCodexConfigFile } from "@ccr/core/profiles/launch-core";
import { normalizeWindowsDesktopAppCandidate, windowsDesktopAppCandidates } from "@ccr/core/platform/windows-app-discovery";
import { buildZcodeModelCatalog } from "@ccr/core/agents/zcode/model-catalog";
import { writeZcodeGatewayConfig, zcodeHomeFromConfigFile } from "@ccr/core/agents/zcode/profile-config";
import { profileAllowedModels } from "@ccr/core/profiles/model-allowlist";

export type CodexAppLookupResult = {
  checked: string[];
  executable?: string;
};

type CodexCompatibleAppKind = "codex" | "workbuddy" | "zcode";

type CodexCompatibleAppSpec = {
  bundledCliNames: string[];
  defaultCliCommand: string;
  displayName: string;
  envPathKeys: string[];
  kind: CodexCompatibleAppKind;
  linuxCandidates: string[];
  macAppNames: string[];
  modelCatalogFilename: string;
  userDataDirName: string;
  windowsAppDirs: string[];
  windowsExeNames: string[];
  windowsPackageKeywords: string[];
  windowsVendorDirs: string[];
  windowsWhereNames: string[];
};

type CodexCompatibleAppModelCatalogConfig = Partial<Pick<AppConfig, "Providers" | "Router" | "virtualModelProfiles">>;

export type CodexAppLaunchResult = {
  child: ChildProcess;
  command: string;
  pidIsLauncher?: boolean;
  pid?: number;
  userDataDir: string;
};

export type CodexCompatibleAppModelCatalogWriteResult = {
  changed: boolean;
  file: string;
  userDataDir: string;
  workbuddyModelsConfig?: WorkbuddyModelsConfigWriteResult;
  workbuddyVirtualAuth?: WorkbuddyVirtualAuthResult;
};

export type WorkbuddyModelsConfigWriteResult = {
  changed: boolean;
  file: string;
  model: string;
};

export type WorkbuddyVirtualAuthResult = {
  authFile: string;
  changed: boolean;
  configDir: string;
  homeDir: string;
  userDataDir: string;
};

export const codexDesktopAppName = "ChatGPT";
export const workbuddyDesktopAppName = "WorkBuddy AI";

const workbuddyVirtualAuthId = "workbuddy-desktop-ai";
const workbuddyVirtualAuthUserId = "ccr-local-profile";
const workbuddyVirtualAuthToken = "ccr-local-profile";
const workbuddyVirtualAuthExpiresAt = 1_999_999_999_999;

const codexAppSpec: CodexCompatibleAppSpec = {
  bundledCliNames: ["codex", "Codex", "OpenAI Codex"],
  defaultCliCommand: "codex",
  displayName: codexDesktopAppName,
  envPathKeys: ["CCR_CHATGPT_APP_PATH", "CHATGPT_APP_PATH", "CODEXL_CHATGPT_PATH", "CCR_CODEX_APP_PATH", "CODEX_APP_PATH", "CODEXL_CODEX_PATH"],
  kind: "codex",
  linuxCandidates: [
    "/opt/ChatGPT/chatgpt",
    "/opt/ChatGPT/ChatGPT",
    "/opt/OpenAI ChatGPT/chatgpt",
    "/opt/OpenAI ChatGPT/ChatGPT",
    "/usr/local/bin/chatgpt-app",
    "/usr/bin/chatgpt-app",
    "/opt/Codex/codex",
    "/opt/Codex/Codex",
    "/opt/OpenAI Codex/codex",
    "/opt/OpenAI Codex/Codex",
    "/usr/local/bin/codex-app",
    "/usr/bin/codex-app"
  ],
  macAppNames: ["ChatGPT.app", "OpenAI ChatGPT.app", "Codex.app", "OpenAI Codex.app"],
  modelCatalogFilename: "ccr-codex-model-catalog.json",
  userDataDirName: "codex-app-user-data",
  windowsAppDirs: ["ChatGPT", "OpenAI ChatGPT", "OpenAIChatGPT", "Codex", "OpenAI Codex", "OpenAICodex"],
  windowsExeNames: [
    "ChatGPT.exe",
    "chatgpt.exe",
    "OpenAI ChatGPT.exe",
    "OpenAIChatGPT.exe",
    "OpenAIChatGPTApp.exe",
    "chatgpt-app.exe",
    "openai-chatgpt.exe",
    "Codex.exe",
    "codex.exe",
    "OpenAI Codex.exe",
    "OpenAICodex.exe",
    "OpenAICodexApp.exe",
    "codex-app.exe",
    "openai-codex.exe"
  ],
  windowsPackageKeywords: ["chatgpt", "openaichatgpt", "codex", "openaicodex"],
  windowsVendorDirs: ["OpenAI"],
  windowsWhereNames: [
    "ChatGPT",
    "chatgpt",
    "OpenAI ChatGPT",
    "OpenAIChatGPT",
    "OpenAIChatGPTApp",
    "chatgpt-app",
    "openai-chatgpt",
    "Codex",
    "codex",
    "OpenAI Codex",
    "OpenAICodex",
    "OpenAICodexApp",
    "codex-app",
    "openai-codex"
  ]
};

const zcodeAppSpec: CodexCompatibleAppSpec = {
  bundledCliNames: ["glm/zcode.cjs", "zcode", "ZCode", "Z Code", "z-code", "zai-code", "codex", "Codex"],
  defaultCliCommand: "zcode",
  displayName: "ZCode App",
  envPathKeys: ["CCR_ZCODE_APP_PATH", "ZCODE_APP_PATH", "CODEXL_ZCODE_PATH"],
  kind: "zcode",
  linuxCandidates: [
    "/opt/ZCode/zcode",
    "/opt/ZCode/ZCode",
    "/opt/Z Code/zcode",
    "/opt/Z.AI Code/zcode",
    "/usr/local/bin/zcode",
    "/usr/bin/zcode",
    "/usr/local/bin/z-code",
    "/usr/bin/z-code",
    "/usr/local/bin/zai-code",
    "/usr/bin/zai-code"
  ],
  macAppNames: ["ZCode.app", "Z Code.app", "Z.AI Code.app", "ZAI Code.app"],
  modelCatalogFilename: "ccr-zcode-model-catalog.json",
  userDataDirName: "zcode-app-user-data",
  windowsAppDirs: ["ZCode", "Z Code", "ZAI Code", "Z.AI Code", "Zhipu ZCode"],
  windowsExeNames: [
    "ZCode.exe",
    "zcode.exe",
    "Z Code.exe",
    "ZAI Code.exe",
    "ZAICode.exe",
    "z-code.exe",
    "zai-code.exe"
  ],
  windowsPackageKeywords: ["zcode", "z-code", "zaicode", "zai-code"],
  windowsVendorDirs: ["ZCode", "Z.AI", "ZAI", "Zhipu", "ZhipuAI"],
  windowsWhereNames: [
    "ZCode",
    "zcode",
    "Z Code",
    "ZAI Code",
    "ZAICode",
    "z-code",
    "zai-code"
  ]
};

const workbuddyAppSpec: CodexCompatibleAppSpec = {
  bundledCliNames: [
    "app.asar.unpacked/cli/bin/codebuddy",
    "app.asar.unpacked/cli/bin/cbc",
    "app.asar.unpacked/cli/bin/cbc-prewarm",
    "codebuddy",
    "CodeBuddy",
    "workbuddy",
    "WorkBuddy"
  ],
  defaultCliCommand: "codebuddy",
  displayName: workbuddyDesktopAppName,
  envPathKeys: ["CCR_WORKBUDDY_APP_PATH", "WORKBUDDY_APP_PATH", "CODEXL_WORKBUDDY_PATH"],
  kind: "workbuddy",
  linuxCandidates: [
    "/opt/WorkBuddy AI/workbuddy-ai",
    "/opt/WorkBuddy AI/WorkBuddyAI",
    "/opt/WorkBuddy/workbuddy",
    "/opt/WorkBuddy/WorkBuddy",
    "/usr/local/bin/workbuddy-ai",
    "/usr/bin/workbuddy-ai",
    "/usr/local/bin/workbuddy",
    "/usr/bin/workbuddy"
  ],
  macAppNames: ["WorkBuddy AI.app", "WorkBuddy.app", "WorkBuddyAI.app", "Workbuddy.app"],
  modelCatalogFilename: "ccr-workbuddy-model-catalog.json",
  userDataDirName: "workbuddy-app-user-data",
  windowsAppDirs: ["WorkBuddy AI", "WorkBuddyAI", "WorkBuddy", "Workbuddy", "CodeBuddy"],
  windowsExeNames: [
    "WorkBuddy AI.exe",
    "WorkBuddyAI.exe",
    "WorkBuddy.exe",
    "workbuddy-ai.exe",
    "workbuddy.exe",
    "CodeBuddy.exe",
    "codebuddy.exe"
  ],
  windowsPackageKeywords: ["workbuddy", "workbuddyai", "workbuddy-ai", "codebuddy"],
  windowsVendorDirs: ["WorkBuddy", "WorkBuddy AI", "CodeBuddy"],
  windowsWhereNames: [
    "WorkBuddy AI",
    "WorkBuddyAI",
    "WorkBuddy",
    "workbuddy-ai",
    "workbuddy",
    "CodeBuddy",
    "codebuddy"
  ]
};

export function launchCodexAppProfile(configDir: string, profile: ProfileConfig, config?: AppConfig): CodexAppLaunchResult {
  return launchCodexCompatibleAppProfile(configDir, profile, codexAppSpec, config);
}

export function findInstalledCodexAppExecutable(profileAppPath?: string): CodexAppLookupResult {
  return findInstalledCodexCompatibleAppExecutable(codexAppSpec, profileAppPath);
}

export function findInstalledZcodeAppExecutable(profileAppPath?: string): CodexAppLookupResult {
  return findInstalledCodexCompatibleAppExecutable(zcodeAppSpec, profileAppPath);
}

export function launchZcodeAppProfile(configDir: string, profile: ProfileConfig, config?: AppConfig): CodexAppLaunchResult {
  return launchCodexCompatibleAppProfile(configDir, profile, zcodeAppSpec, config);
}

export function findInstalledWorkbuddyAppExecutable(profileAppPath?: string): CodexAppLookupResult {
  return findInstalledCodexCompatibleAppExecutable(workbuddyAppSpec, profileAppPath);
}

export function launchWorkbuddyAppProfile(configDir: string, profile: ProfileConfig, config?: AppConfig): CodexAppLaunchResult {
  return launchCodexCompatibleAppProfile(configDir, profile, workbuddyAppSpec, config);
}

export function refreshCodexCompatibleAppProfileFiles(
  configDir: string,
  profile: ProfileConfig,
  config?: AppConfig
): {
  modelCatalogChanged: boolean;
  modelCatalogFile: string;
  userDataDir: string;
  workbuddyModelsConfig?: WorkbuddyModelsConfigWriteResult;
  workbuddyVirtualAuth?: WorkbuddyVirtualAuthResult;
} {
  const spec = codexCompatibleAppSpecForProfile(profile);
  if (spec.kind === "zcode" && config?.APIKEY) {
    writeZcodeGatewayConfig(config, profile, config.APIKEY, { backup: false });
  }
  const modelCatalog = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
  return {
    modelCatalogChanged: modelCatalog.changed,
    modelCatalogFile: modelCatalog.file,
    userDataDir: modelCatalog.userDataDir,
    workbuddyModelsConfig: modelCatalog.workbuddyModelsConfig,
    workbuddyVirtualAuth: modelCatalog.workbuddyVirtualAuth
  };
}

export function writeCodexCompatibleAppModelCatalog(
  configDir: string,
  profile: ProfileConfig,
  config?: AppConfig
): CodexCompatibleAppModelCatalogWriteResult {
  const spec = codexCompatibleAppSpecForProfile(profile);
  const configFile = resolveCodexConfigFile(configDir, profile);
  const codexHome = codexCompatibleHomeFromConfigFile(spec, configFile);
  if (spec.kind === "codex") {
    removeLegacyCodexVirtualAuthMarker(codexHome);
  }
  const userDataDir = codexElectronUserDataDir(codexHome, profile, spec);
  mkdirSync(userDataDir, { recursive: true });
  const file = codexAppModelCatalogFile(userDataDir, spec);
  const content = codexCompatibleAppModelCatalogJson(config, profile.model, spec.kind, profileAllowedModels(profile));
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous !== content) {
    writeFileSync(file, content, "utf8");
  }
  const workbuddyModelsConfig = spec.kind === "workbuddy"
    ? writeWorkbuddyModelsConfig(codexHome, profile, config)
    : undefined;
  const workbuddyVirtualAuth = spec.kind === "workbuddy"
    ? prepareWorkbuddyAppVirtualAuth(codexHome, userDataDir, profile)
    : undefined;
  return {
    changed: previous !== content || Boolean(workbuddyModelsConfig?.changed),
    file,
    userDataDir,
    workbuddyModelsConfig,
    workbuddyVirtualAuth
  };
}

export function writeWorkbuddyModelsConfig(
  workbuddyConfigDir: string,
  profile: ProfileConfig,
  config?: AppConfig
): WorkbuddyModelsConfigWriteResult {
  const file = path.join(workbuddyConfigDir, "models.json");
  const model = workbuddySelectedModel(profile, config);
  const content = `${JSON.stringify(workbuddyModelsConfig(model, profile, config), null, 2)}\n`;
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous !== content) {
    writeFileSync(file, content, "utf8");
  }
  return { changed: previous !== content, file, model };
}

function workbuddySelectedModel(
  profile: Pick<ProfileConfig, "model">,
  config?: CodexCompatibleAppModelCatalogConfig
): string {
  const configured = profile.model?.trim();
  if (configured) {
    return configured;
  }
  return codexCompatibleAppModelCatalog(config, undefined, "workbuddy").models[0]?.slug || "gpt-5-codex";
}

function workbuddyModelsConfig(
  defaultModel: string,
  profile: ProfileConfig,
  config?: AppConfig
): Record<string, unknown> {
  const allowedModels = profileAllowedModels(profile);
  const catalogItems = codexCompatibleAppModelCatalog(config, defaultModel, "workbuddy", allowedModels).models;
  const models = catalogItems.map((catalogItem) =>
    workbuddyModelConfig(catalogItem.slug || catalogItem.id || catalogItem.model, defaultModel, profile, catalogItem, config)
  );
  if (models.length === 0) {
    models.push(workbuddyModelConfig(defaultModel, defaultModel, profile, undefined, config));
  }
  return {
    availableModels: models.map((item) => String(item.id || "")),
    models
  };
}

function workbuddyModelConfig(
  model: string,
  defaultModel: string,
  profile: Pick<ProfileConfig, "name" | "providerName">,
  catalogItem: CodexModelCatalogItem | undefined,
  config?: AppConfig
): Record<string, unknown> {
  const vendor = workbuddyModelVendor(model, profile.providerName);
  const displayName = model.includes("/") ? model : `${vendor} / ${model}`;
  const workbuddyModel: Record<string, unknown> = {
    apiKey: "${CCR_PROFILE_API_KEY}",
    disabled: false,
    id: model,
    isDefault: model === defaultModel,
    name: displayName,
    supportsImages: Boolean(catalogItem?.supports_image_detail_original),
    supportsReasoning: Boolean(catalogItem?.supports_reasoning_summaries),
    supportsToolCall: true,
    tags: ["chat", "custom"],
    url: workbuddyGatewayBaseUrl(config),
    vendor
  };
  const maxInputTokens = catalogItem?.context_window;
  if (typeof maxInputTokens === "number" && Number.isFinite(maxInputTokens) && maxInputTokens > 0) {
    workbuddyModel.maxInputTokens = Math.trunc(maxInputTokens);
  }
  const reasoningEfforts = catalogItem?.supported_reasoning_efforts;
  if (Array.isArray(reasoningEfforts) && reasoningEfforts.length > 0) {
    workbuddyModel.reasoning = {
      ...(catalogItem?.default_reasoning_effort ? { defaultEffort: catalogItem.default_reasoning_effort } : {}),
      supportedEfforts: reasoningEfforts
    };
  }
  return workbuddyModel;
}

function workbuddyModelVendor(model: string, providerName?: string): string {
  const slashIndex = model.indexOf("/");
  if (slashIndex > 0) {
    const provider = model.slice(0, slashIndex).trim();
    if (provider) {
      return provider;
    }
  }
  return providerName?.trim() || "Claude Code Router";
}

function workbuddyGatewayBaseUrl(config?: Pick<AppConfig, "gateway">): string {
  if (!config?.gateway) {
    return "${CCR_WORKBUDDY_GATEWAY_BASE_URL}";
  }
  const host = config.gateway.host === "0.0.0.0" || config.gateway.host === "::"
    ? "127.0.0.1"
    : config.gateway.host || "127.0.0.1";
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${config.gateway.port}/v1`;
}

function codexCompatibleAppSpecForProfile(profile: Pick<ProfileConfig, "agent">): CodexCompatibleAppSpec {
  if (profile.agent === "zcode") {
    return zcodeAppSpec;
  }
  if (profile.agent === "workbuddy") {
    return workbuddyAppSpec;
  }
  return codexAppSpec;
}

function codexCompatibleAppModelCatalogJson(
  config?: CodexCompatibleAppModelCatalogConfig,
  selectedModel?: string,
  kind: CodexCompatibleAppKind = "codex",
  allowedModels?: string[]
): string {
  return `${JSON.stringify(codexCompatibleAppModelCatalog(config, selectedModel, kind, allowedModels), null, 2)}\n`;
}

function codexCompatibleAppModelCatalog(
  config?: CodexCompatibleAppModelCatalogConfig,
  selectedModel?: string,
  kind: CodexCompatibleAppKind = "codex",
  allowedModels?: string[]
): CodexModelCatalog {
  const catalog = kind === "zcode"
    ? buildZcodeModelCatalog(config, selectedModel, { allowedModels })
    : buildCodexModelCatalog(config, selectedModel, { allowedModels });
  return {
    models: catalog.models.map((model) => codexCompatibleAppModelCatalogItem(model, config))
  };
}

function codexCompatibleAppModelCatalogItem(
  model: CodexModelCatalogItem,
  config?: CodexCompatibleAppModelCatalogConfig
): CodexModelCatalogItem {
  const fallbackReasoningLevels = codexCompatibleAppOpenAiReasoningFallbackLevels(model.slug, config);
  if (!fallbackReasoningLevels) {
    return model;
  }
  return {
    ...model,
    defaultReasoningEffort: "medium",
    default_reasoning_effort: "medium",
    default_reasoning_level: "medium",
    supportedReasoningEfforts: fallbackReasoningLevels.map((level) => ({
      description: level.description,
      reasoningEffort: level.effort,
      reasoning_effort: level.effort
    })),
    supported_reasoning_efforts: fallbackReasoningLevels.map((level) => level.effort),
    supported_reasoning_levels: fallbackReasoningLevels,
    supports_reasoning_summaries: true
  };
}

function codexCompatibleAppOpenAiReasoningFallbackLevels(
  catalogModel: string,
  config?: CodexCompatibleAppModelCatalogConfig
): Array<{ description: string; effort: string }> | undefined {
  const selector = parseCodexCompatibleCatalogModelSelector(catalogModel);
  if (!selector) {
    return undefined;
  }
  if (providerHasExplicitModelMetadata(config, selector.provider, selector.model)) {
    return undefined;
  }
  const normalizedModel = selector.model.trim().toLowerCase();
  if (codexCompatibleAppOpenAiSupportsXHighFallback(normalizedModel)) {
    return [
      { effort: "minimal", description: "Minimal reasoning" },
      { effort: "low", description: "Low reasoning" },
      { effort: "medium", description: "Medium reasoning" },
      { effort: "high", description: "High reasoning" },
      { effort: "xhigh", description: "Extra high reasoning" }
    ];
  }
  return /^gpt-[0-9]/.test(normalizedModel) || /^o[0-9]/.test(normalizedModel)
    ? [
        { effort: "minimal", description: "Minimal reasoning" },
        { effort: "low", description: "Low reasoning" },
        { effort: "medium", description: "Medium reasoning" },
        { effort: "high", description: "High reasoning" }
      ]
    : undefined;
}

function codexCompatibleAppOpenAiSupportsXHighFallback(model: string): boolean {
  const match = model.match(/^gpt-(\d+)(?:[.-](\d+))?/);
  if (!match) return false;
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2] || "0", 10);
  return major > 5 || (major === 5 && minor >= 6);
}

function providerHasExplicitModelMetadata(
  config: CodexCompatibleAppModelCatalogConfig | undefined,
  providerName: string,
  modelName: string
): boolean {
  const normalizedProviderName = providerName.trim().toLowerCase();
  const normalizedModelName = modelName.trim().toLowerCase();
  const provider = (config?.Providers ?? []).find((candidate) => candidate.name.trim().toLowerCase() === normalizedProviderName);
  return Boolean(
    provider?.modelMetadata &&
    Object.keys(provider.modelMetadata).some((candidate) => candidate.trim().toLowerCase() === normalizedModelName)
  );
}

function parseCodexCompatibleCatalogModelSelector(model: string): { model: string; provider: string } | undefined {
  const slashIndex = model.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= model.length - 1) {
    return undefined;
  }
  return {
    provider: model.slice(0, slashIndex),
    model: model.slice(slashIndex + 1)
  };
}

export function removeLegacyCodexVirtualAuthMarker(codexHome: string): boolean {
  const authFile = path.join(codexHome, "auth.json");
  if (!isFile(authFile)) {
    return false;
  }
  try {
    const value = JSON.parse(readFileSync(authFile, "utf8")) as Record<string, unknown>;
    const keys = Object.keys(value).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== "OPENAI_API_KEY" ||
      keys[1] !== "auth_mode" ||
      value.auth_mode !== "apikey" ||
      value.OPENAI_API_KEY !== "ccr-local-profile"
    ) {
      return false;
    }
    unlinkSync(authFile);
    return true;
  } catch {
    return false;
  }
}

function launchCodexCompatibleAppProfile(
  configDir: string,
  profile: ProfileConfig,
  spec: CodexCompatibleAppSpec,
  config?: AppConfig
): CodexAppLaunchResult {
  const lookup = findInstalledCodexCompatibleAppExecutable(spec, profile.appPath);
  if (!lookup.executable) {
    throw new Error([
      `${spec.displayName} was not found. Install ${spec.displayName} or set ${spec.envPathKeys[1]} to its executable, then try again.`,
      lookup.checked.length ? `Checked: ${lookup.checked.join(", ")}` : ""
    ].filter(Boolean).join(" "));
  }

  const plan = buildProfileLaunchPlan(configDir, profile, "app");
  if (path.isAbsolute(plan.command) && !existsSync(plan.command)) {
    throw new Error(`Profile launcher was not found: ${plan.command}. Re-save the profile and try again.`);
  }

  const configFile = resolveCodexConfigFile(configDir, profile);
  const codexHome = codexCompatibleHomeFromConfigFile(spec, configFile);
  const { modelCatalogFile, userDataDir, workbuddyVirtualAuth } = refreshCodexCompatibleAppProfileFiles(configDir, profile, config);
  if (spec.kind === "codex") prepareCodexAppCdpUserDataDir(userDataDir);

  const appEnv: Record<string, string> = {
    ...plan.env,
    ...(config ? botGatewayProfileEnv(config, profile, "app") : {}),
    ...codexProfileEnv(profile, lookup.executable, spec),
    CODEXL_PROFILE_SURFACE: "app",
    CCR_PROFILE_SURFACE: "app",
    ...codexAppAgentEnv(spec, plan.command, codexHome, userDataDir, modelCatalogFile, workbuddyVirtualAuth),
    ...codexCompatibleAppGatewayEnv(spec, config),
    ELECTRON_ENABLE_LOGGING: "1"
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...appEnv
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CCR_CODEX_MODEL_CATALOG_B64;
  delete env.CODEXL_CODEX_MODEL_CATALOG_B64;
  delete env.CCR_ZCODE_MODEL_CATALOG_B64;
  delete env.CODEXL_ZCODE_MODEL_CATALOG_B64;
  sanitizeCodexCompatibleAppEnv(env, spec.kind);

  const launch = codexAppLaunchCommand(lookup.executable, userDataDir);
  const child = spawn(launch.command, launch.args, {
    detached: true,
    env,
    stdio: "ignore"
  });
  child.unref();

  return {
    child,
    command: launch.command,
    pidIsLauncher: launch.pidIsLauncher,
    pid: child.pid,
    userDataDir
  };
}

function codexCompatibleAppGatewayEnv(spec: CodexCompatibleAppSpec, config?: AppConfig): Record<string, string> {
  if (spec.kind !== "workbuddy" || !config) {
    return {};
  }
  const baseUrl = workbuddyGatewayBaseUrl(config);
  const apiKey = config.APIKEY?.trim() || "";
  return {
    ...(apiKey ? { CCR_PROFILE_API_KEY: apiKey, CODEXL_PROFILE_API_KEY: apiKey } : {}),
    CCR_WORKBUDDY_GATEWAY_BASE_URL: baseUrl,
    CODEXL_WORKBUDDY_GATEWAY_BASE_URL: baseUrl
  };
}

function codexProfileEnv(profile: ProfileConfig, appExecutable: string, spec: CodexCompatibleAppSpec): Record<string, string> {
  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
  const realCliPath = profile.codexCliPath?.trim() || bundledCodexCliPath(appExecutable, spec) || spec.defaultCliCommand;
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  if (spec.kind === "zcode") {
    return {
      ...(profile.model.trim() ? { CCR_ZCODE_MODEL: profile.model.trim() } : {}),
      CCR_ZCODE_MODEL_PROVIDER: providerId,
      CCR_ZCODE_PROFILE: providerId,
      CCR_ZCODE_REMOTE_FRONTEND_MODE: remoteFrontendMode,
      CCR_REAL_ZCODE_CLI_PATH: realCliPath,
      CODEXL_REAL_ZCODE_CLI_PATH: realCliPath,
      CODEXL_ZCODE_CORE_MODE: remoteFrontendMode,
      CODEXL_ZCODE_MODEL_PROVIDER: providerId,
      CODEXL_ZCODE_PROFILE: providerId,
      CODEXL_ZCODE_WORKSPACE_NAME: profile.name || providerId
    };
  }
  const codexEnv = {
    ...(profile.model.trim() ? { CCR_CODEX_MODEL: profile.model.trim() } : {}),
    ...(process.env.CCR_CODEX_CLI_MIDDLEWARE_LOG?.trim()
      ? { CCR_CODEX_CLI_MIDDLEWARE_LOG: process.env.CCR_CODEX_CLI_MIDDLEWARE_LOG.trim() }
      : {}),
    ...codexSharedChatGptAuthEnv(),
    CCR_CODEX_MODEL_PROVIDER: providerId,
    CCR_CODEX_PROFILE: providerId,
    CCR_CODEX_REMOTE_FRONTEND_MODE: remoteFrontendMode,
    CCR_BUNDLED_CODEX_CLI_PATH: realCliPath,
    CCR_REAL_CODEX_CLI_PATH: realCliPath,
    CODEXL_BUNDLED_CODEX_CLI_PATH: realCliPath,
    CODEXL_CODEX_CORE_MODE: remoteFrontendMode,
    CODEXL_CODEX_MODEL_PROVIDER: providerId,
    CODEXL_CODEX_PROFILE: providerId,
    CODEXL_CODEX_WORKSPACE_NAME: profile.name || providerId,
    CODEXL_REAL_CODEX_CLI_PATH: realCliPath
  };
  if (spec.kind !== "workbuddy") {
    return codexEnv;
  }
  return {
    ...codexEnv,
    ...(profile.model.trim() ? { CCR_WORKBUDDY_MODEL: profile.model.trim() } : {}),
    CCR_REAL_WORKBUDDY_CLI_PATH: realCliPath,
    CCR_WORKBUDDY_MODEL_PROVIDER: providerId,
    CCR_WORKBUDDY_PROFILE: providerId,
    CCR_WORKBUDDY_REMOTE_FRONTEND_MODE: remoteFrontendMode,
    CODEXL_REAL_WORKBUDDY_CLI_PATH: realCliPath,
    CODEXL_WORKBUDDY_CORE_MODE: remoteFrontendMode,
    CODEXL_WORKBUDDY_MODEL_PROVIDER: providerId,
    CODEXL_WORKBUDDY_PROFILE: providerId,
    CODEXL_WORKBUDDY_WORKSPACE_NAME: profile.name || providerId
  };
}

function codexSharedChatGptAuthEnv(homeDir = os.homedir()): Record<string, string> {
  const authFile = codexSharedChatGptAuthFile(homeDir);
  if (!authFile) {
    return {};
  }
  return {
    CCR_CODEX_CHATGPT_AUTH_FILE: authFile,
    CODEXL_CODEX_CHATGPT_AUTH_FILE: authFile
  };
}

function codexSharedChatGptAuthFile(homeDir: string): string | undefined {
  for (const configured of [
    process.env.CCR_CODEX_CHATGPT_AUTH_FILE,
    process.env.CODEXL_CODEX_CHATGPT_AUTH_FILE
  ]) {
    const resolved = configured?.trim() ? resolveUserPath(configured) : "";
    if (resolved && isUsableChatGptAuthFile(resolved)) {
      return resolved;
    }
  }

  const defaultAuthFile = path.join(homeDir, ".codex", "auth.json");
  return isUsableChatGptAuthFile(defaultAuthFile) ? defaultAuthFile : undefined;
}

function isUsableChatGptAuthFile(authFile: string): boolean {
  if (!isFile(authFile)) return false;
  try {
    const value = JSON.parse(readFileSync(authFile, "utf8")) as Record<string, unknown>;
    if (value.auth_mode !== undefined && value.auth_mode !== "chatgpt") return false;
    const tokens = isRecord(value.tokens) ? value.tokens : undefined;
    const authToken = stringValue(tokens?.access_token) || stringValue(tokens?.accessToken);
    return usableChatGptAuthToken(authToken);
  } catch {
    return false;
  }
}

function usableChatGptAuthToken(token: string | undefined): boolean {
  if (!token) return false;
  const claims = jwtPayloadClaims(token);
  const expiresAt = Number(claims?.exp);
  return !Number.isFinite(expiresAt) || expiresAt > Math.floor(Date.now() / 1000) + 30;
}

function jwtPayloadClaims(token: string): Record<string, unknown> | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const value = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function codexSharedChatGptAuthEnvForTest(homeDir?: string): Record<string, string> {
  return codexSharedChatGptAuthEnv(homeDir);
}

function codexAppAgentEnv(
  spec: CodexCompatibleAppSpec,
  launcher: string,
  home: string,
  userDataDir: string,
  modelCatalogFile: string,
  workbuddyVirtualAuth?: WorkbuddyVirtualAuthResult
): Record<string, string> {
  if (spec.kind === "zcode") {
    return {
        CCR_ZCODE_MODEL_CATALOG_FILE: modelCatalogFile,
        CODEXL_ZCODE_MODEL_CATALOG_FILE: modelCatalogFile,
        ZCODE_CLI_PATH: launcher,
        ZCODE_ELECTRON_USER_DATA_PATH: userDataDir,
        ZCODE_HOME: home,
        ZCODE_STORAGE_DIR: home
      };
  }
  const codexEnv = {
    CCR_CODEX_MODEL_CATALOG_FILE: modelCatalogFile,
    CODEX_CLI_PATH: launcher,
    CODEX_ELECTRON_USER_DATA_PATH: userDataDir,
    CODEX_HOME: home,
    CODEXL_CODEX_MODEL_CATALOG_FILE: modelCatalogFile
  };
  if (spec.kind !== "workbuddy") {
    return codexEnv;
  }
  return {
    ...codexEnv,
    CCR_WORKBUDDY_MODEL_CATALOG_FILE: modelCatalogFile,
    ...(workbuddyVirtualAuth ? workbuddyVirtualAuthEnv(workbuddyVirtualAuth) : {}),
    CODEBUDDY_CLI_PATH: launcher,
    CODEBUDDY_CONFIG_DIR: home,
    CODEBUDDY_ELECTRON_USER_DATA_PATH: userDataDir,
    CODEBUDDY_HOME: home,
    CODEXL_WORKBUDDY_MODEL_CATALOG_FILE: modelCatalogFile,
    WORKBUDDY_CLI_PATH: launcher,
    WORKBUDDY_CONFIG_DIR: home,
    WORKBUDDY_ELECTRON_USER_DATA_PATH: userDataDir,
    WORKBUDDY_HOME: home
  };
}

export function prepareWorkbuddyAppVirtualAuth(
  configDir: string,
  userDataDir: string,
  profile: Pick<ProfileConfig, "id" | "name">
): WorkbuddyVirtualAuthResult {
  const homeDir = workbuddyAppVirtualHomeDir(configDir);
  const authFile = workbuddyAppVirtualAuthFile(homeDir);
  const account = workbuddyVirtualAuthAccount(profile);
  const session = {
    account,
    accounts: [account],
    allAccounts: [account],
    auth: {
      accessToken: workbuddyVirtualAuthToken,
      domain: "www.workbuddy.ai",
      expiresAt: workbuddyVirtualAuthExpiresAt,
      expiresIn: workbuddyVirtualAuthExpiresAt,
      lastRefreshTime: Date.now(),
      refreshExpiresAt: workbuddyVirtualAuthExpiresAt,
      refreshExpiresIn: workbuddyVirtualAuthExpiresAt,
      refreshToken: "",
      scope: "",
      tokenType: "Bearer"
    }
  };
  const content = `${JSON.stringify(session, null, 2)}\n`;
  mkdirSync(path.dirname(authFile), { recursive: true });
  const logoutMarker = `${authFile}.logged-out`;
  if (existsSync(logoutMarker)) {
    unlinkSync(logoutMarker);
  }
  const previous = existsSync(authFile) ? readFileSync(authFile, "utf8") : undefined;
  if (previous !== content) {
    writeFileSync(authFile, content, "utf8");
  }
  return {
    authFile,
    changed: previous !== content,
    configDir,
    homeDir,
    userDataDir
  };
}

function workbuddyVirtualAuthAccount(profile: Pick<ProfileConfig, "id" | "name">): Record<string, unknown> {
  return {
    avatarUrl: "",
    lastLogin: true,
    nickname: profile.name?.trim() || "Claude Code Router",
    pluginEnabled: true,
    type: "personal",
    uid: workbuddyVirtualAuthUserId
  };
}

function workbuddyVirtualAuthEnv(result: WorkbuddyVirtualAuthResult): Record<string, string> {
  return {
    APPDATA: path.join(result.homeDir, "AppData", "Roaming"),
    CCR_WORKBUDDY_VIRTUAL_AUTH_FILE: result.authFile,
    CODEXL_WORKBUDDY_VIRTUAL_AUTH_FILE: result.authFile,
    HOME: result.homeDir,
    LOCALAPPDATA: path.join(result.homeDir, "AppData", "Local"),
    USERPROFILE: result.homeDir,
    WORKBUDDY_USER_DATA_DIR: result.userDataDir
  };
}

function workbuddyAppVirtualHomeDir(configDir: string): string {
  return path.join(configDir, ".claude-code-router", "workbuddy-app-home");
}

function workbuddyAppVirtualAuthFile(homeDir: string): string {
  return path.join(workbuddySharedAuthDir(homeDir), `${workbuddyVirtualAuthId}.info`);
}

function workbuddySharedAuthDir(homeDir: string): string {
  if (process.platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "CodeBuddyExtension", "Data", "Public", "auth");
  }
  if (process.platform === "win32") {
    return path.join(homeDir, "AppData", "Local", "CodeBuddyExtension", "Data", "Public", "auth");
  }
  return path.join(homeDir, ".local", "share", "CodeBuddyExtension", "Data", "Public", "auth");
}

function sanitizeCodexCompatibleAppEnv(env: NodeJS.ProcessEnv, kind: CodexCompatibleAppKind): void {
  const blockedPrefixes = kind === "zcode"
    ? ["CCR_CODEX_", "CODEXL_CODEX_", "CCR_WORKBUDDY_", "CODEXL_WORKBUDDY_"]
    : kind === "workbuddy"
      ? ["CCR_ZCODE_", "CODEXL_ZCODE_"]
      : ["CCR_ZCODE_", "CODEXL_ZCODE_", "CCR_WORKBUDDY_", "CODEXL_WORKBUDDY_"];
  for (const key of Object.keys(env)) {
    if (blockedPrefixes.some((prefix) => key.startsWith(prefix))) {
      delete env[key];
    }
  }
  if (kind === "zcode") {
    delete env.CODEX_CLI_PATH;
    delete env.CODEX_ELECTRON_USER_DATA_PATH;
    delete env.CODEX_HOME;
    delete env.WORKBUDDY_CLI_PATH;
    delete env.WORKBUDDY_ELECTRON_USER_DATA_PATH;
    delete env.WORKBUDDY_HOME;
    delete env.CODEBUDDY_CLI_PATH;
    delete env.CODEBUDDY_CONFIG_DIR;
    delete env.CODEBUDDY_ELECTRON_USER_DATA_PATH;
    delete env.CODEBUDDY_HOME;
    return;
  }
  delete env.ZCODE_CLI_PATH;
  delete env.ZCODE_ELECTRON_USER_DATA_PATH;
  delete env.ZCODE_HOME;
  delete env.ZCODE_STORAGE_DIR;
  if (kind === "codex") {
    delete env.WORKBUDDY_CLI_PATH;
    delete env.WORKBUDDY_ELECTRON_USER_DATA_PATH;
    delete env.WORKBUDDY_HOME;
    delete env.CODEBUDDY_CLI_PATH;
    delete env.CODEBUDDY_CONFIG_DIR;
    delete env.CODEBUDDY_ELECTRON_USER_DATA_PATH;
    delete env.CODEBUDDY_HOME;
  }
}

function bundledCodexCliPath(appExecutable: string, spec: CodexCompatibleAppSpec): string | undefined {
  if (process.platform === "darwin") {
    const appBundle = macAppBundleFromExecutable(appExecutable);
    if (!appBundle) {
      return undefined;
    }
    for (const name of spec.bundledCliNames) {
      const candidate = path.join(appBundle, "Contents", "Resources", name);
      if (isFile(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  if (process.platform === "win32") {
    const appDir = path.dirname(appExecutable);
    const resourceDir = path.join(appDir, "resources");
    for (const name of spec.windowsExeNames) {
      const candidate = path.join(resourceDir, name);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function codexElectronArgs(userDataDir: string): string[] {
  return [
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${userDataDir}`,
    "--remote-allow-origins=*",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows"
  ];
}

export function codexElectronArgsForTest(userDataDir: string): string[] {
  return codexElectronArgs(userDataDir);
}

function codexAppLaunchCommand(executable: string, userDataDir: string): { args: string[]; command: string; pidIsLauncher?: boolean } {
  return {
    command: executable,
    args: codexElectronArgs(userDataDir)
  };
}

function macAppBundleFromExecutable(executable: string): string | undefined {
  const marker = ".app/Contents/MacOS/";
  const index = executable.indexOf(marker);
  if (index < 0) {
    return undefined;
  }
  const appBundle = executable.slice(0, index + ".app".length);
  return isDirectory(appBundle) ? appBundle : undefined;
}

function codexElectronUserDataDir(codexHome: string, profile: ProfileConfig, spec: CodexCompatibleAppSpec): string {
  return path.join(
    codexHome,
    ".claude-code-router",
    spec.userDataDirName,
    sanitizeProfilePathSegment(profile.id || profile.name || "default") || "default"
  );
}

function codexAppModelCatalogFile(userDataDir: string, spec: CodexCompatibleAppSpec): string {
  return path.join(userDataDir, spec.modelCatalogFilename);
}

function codexCompatibleHomeFromConfigFile(spec: CodexCompatibleAppSpec, configFile: string): string {
  return spec.kind === "zcode" ? zcodeHomeFromConfigFile(configFile) : path.dirname(configFile);
}

function findInstalledCodexCompatibleAppExecutable(spec: CodexCompatibleAppSpec, profileAppPath?: string): CodexAppLookupResult {
  const checked: string[] = [];
  const profileCandidate = findFirstExecutable(profileCodexAppPathCandidates(profileAppPath), checked, spec);
  if (profileCandidate) {
    return { checked, executable: profileCandidate };
  }

  const envCandidate = findFirstExecutable(envCodexAppPathCandidates(spec), checked, spec);
  if (envCandidate) {
    return { checked, executable: envCandidate };
  }

  if (process.platform === "darwin") {
    return { checked, executable: findFirstExecutable(macCodexAppCandidates(spec), checked, spec) };
  }
  if (process.platform === "win32") {
    return { checked, executable: findFirstExecutable(windowsCodexAppCandidates(spec), checked, spec) };
  }
  return { checked, executable: findFirstExecutable(linuxCodexAppCandidates(spec), checked, spec) };
}

function findFirstExecutable(candidates: string[], checked: string[], spec: CodexCompatibleAppSpec): string | undefined {
  for (const candidate of candidates) {
    if (!candidate || checked.includes(candidate)) {
      continue;
    }
    checked.push(candidate);
    const executable = normalizeCodexAppCandidate(candidate, spec);
    if (executable) {
      return executable;
    }
  }
  return undefined;
}

function envCodexAppPathCandidates(spec: CodexCompatibleAppSpec): string[] {
  return spec.envPathKeys
    .map((key) => process.env[key]?.trim() || "")
    .filter(Boolean)
    .map(resolveUserPath);
}

function profileCodexAppPathCandidates(value: string | undefined): string[] {
  const trimmed = value?.trim() || "";
  return trimmed ? [resolveUserPath(trimmed)] : [];
}

function macCodexAppCandidates(spec: CodexCompatibleAppSpec): string[] {
  const roots = [
    "/Applications",
    path.join(os.homedir(), "Applications")
  ];
  return roots.flatMap((root) => spec.macAppNames.map((name) => path.join(root, name)));
}

function windowsCodexAppCandidates(spec: CodexCompatibleAppSpec): string[] {
  return windowsDesktopAppCandidates({
    appDirs: spec.windowsAppDirs,
    exeNames: spec.windowsExeNames,
    packageKeywords: spec.windowsPackageKeywords,
    vendorDirs: spec.windowsVendorDirs,
    whereNames: spec.windowsWhereNames
  });
}

function linuxCodexAppCandidates(spec: CodexCompatibleAppSpec): string[] {
  return spec.linuxCandidates;
}

function normalizeCodexAppCandidate(candidate: string, spec: CodexCompatibleAppSpec): string | undefined {
  if (process.platform === "darwin") {
    if (candidate.endsWith(".app")) {
      return executableFromMacAppBundle(candidate, spec);
    }
    return isFile(candidate) ? candidate : undefined;
  }
  if (process.platform === "win32") {
    return normalizeWindowsCodexAppCandidate(candidate, spec);
  }
  return isFile(candidate) ? candidate : undefined;
}

function executableFromMacAppBundle(appPath: string, spec: CodexCompatibleAppSpec): string | undefined {
  if (!isDirectory(appPath)) {
    return undefined;
  }
  const infoPath = path.join(appPath, "Contents", "Info.plist");
  const macosDir = path.join(appPath, "Contents", "MacOS");
  const bundleExecutable = readBundleExecutable(infoPath);
  if (bundleExecutable) {
    const executable = path.join(macosDir, bundleExecutable);
    if (isFile(executable)) {
      return executable;
    }
  }

  const appName = path.basename(appPath, ".app");
  for (const name of [appName, ...spec.bundledCliNames]) {
    const executable = path.join(macosDir, name);
    if (isFile(executable)) {
      return executable;
    }
  }

  try {
    return readdirSync(macosDir)
      .map((entry) => path.join(macosDir, entry))
      .find((entry) => isFile(entry));
  } catch {
    return undefined;
  }
}

function readBundleExecutable(infoPath: string): string | undefined {
  if (!isFile(infoPath)) {
    return undefined;
  }
  try {
    const content = readFileSync(infoPath, "utf8");
    return content.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function normalizeWindowsCodexAppCandidate(candidate: string, spec: CodexCompatibleAppSpec): string | undefined {
  return normalizeWindowsDesktopAppCandidate(candidate, {
    exeNames: spec.windowsExeNames,
    packageKeywords: spec.windowsPackageKeywords
  });
}

function normalizeCodexRemoteFrontendMode(value: ProfileConfig["remoteFrontendMode"]): "app" | "cli" | "claude-code" {
  return value === "cli" || value === "claude-code" ? value : "app";
}

function sanitizeCodexProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function sanitizeProfilePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
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

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}
