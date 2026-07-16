import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { loadPersistedAppConfig, replacePersistedAppConfig } from "@ccr/core/config/app-config-store";
import { loadPersistedApiKeys, replacePersistedApiKeys } from "@ccr/core/config/api-key-store";
import { CONFIG_FILE, GATEWAY_CONFIG_FILE, LEGACY_CONFIG_FILE, LEGACY_WINDOWS_CONFIG_FILE } from "@ccr/core/config/constants";
import { normalizeCodexProviderAccountConfig } from "@ccr/core/agents/local-providers/codex";
import { normalizeGrokProviderAccountConfig, normalizeGrokProviderMediaCapabilities } from "@ccr/core/agents/local-providers/grok";
import { removeOpenCodeProviderAccountConfig } from "@ccr/core/agents/local-providers/opencode";
import { CLAUDE_CODE_DEFAULT_ENV, CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV, DEFAULT_OVERVIEW_WIDGETS, DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WIDGETS, DEFAULT_TRAY_WINDOW_MODULES, OVERVIEW_WIDGET_SIZE_VALUES, ROUTER_FALLBACK_MAX_RETRY_COUNT, ROUTER_SCRIPT_API_VERSION, ROUTER_SCRIPT_DEFAULT_TIMEOUT_MS, ROUTER_SCRIPT_MAX_TIMEOUT_MS, TRAY_SINGLETON_WIDGET_TYPES, TRAY_TOP_WIDGET_TYPES, TRAY_WINDOW_MODULE_IDS, enforceSingleEnabledGlobalProfilePerAgent, normalizeClaudeCodeConfigModeValue } from "@ccr/core/contracts/app";
import { createDefaultAppConfig } from "@ccr/core/config/default-config";
import { maxRequestLogBodyBytes } from "@ccr/core/observability/request-log-limits";
import { findProviderPresetByBaseUrl, primaryProviderPresetEndpoint, providerApiKeySafetyIssue, providerEndpointCanReceiveProviderApiKey } from "@ccr/core/providers/presets/index";
import type {
  AppConfig,
  ApiKeyConfig,
  ApiKeyLimitConfig,
  BotGatewayRuntimeConfig,
  BotGatewaySavedConfig,
  ClaudeCodeProfileConfig,
  CodexProfileConfig,
  GatewayAgentConfig,
  GatewayMcpServerConfig,
  GatewayMcpServerTransport,
  GatewayPluginConfig,
  GatewayPluginAppConfig,
  GatewayPluginProxyRouteConfig,
  GatewayProviderCapability,
  GatewayProviderCapabilityProtocol,
  GatewayProviderConfig,
  GatewayProviderProtocol,
  MediaToolsConfig,
  ObservabilityConfig,
  OverviewMetricKind,
  OverviewWidgetConfig,
  OverviewWidgetSize,
  OverviewWidgetType,
  OverviewWidgetVariant,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderCredentialConfig,
  ProviderModelCapabilities,
  ProviderModelMetadata,
  ProviderModelPricing,
  ProviderReasoningLevel,
  ProfileConfig,
  ProfileRuntimeConfig,
  ProxyRouteTarget,
  ProxyRuntimeConfig,
  RouterBuiltInRulesConfig,
  RouterConfig,
  RouterFallbackConfig,
  RouterFallbackMode,
  RouterRule,
  RouterRuleCondition,
  RouterRuleOperator,
  RouterRuleRewrite,
  RouterRuleRewriteOperation,
  RouterRuleScript,
  RouterRuleType,
  TrayBalanceProgressConfig,
  TrayComponentVariants,
  TrayIconPreference,
  ToolHubConfig,
  TrayWidgetConfig,
  TrayWidgetType,
  TrayWidgetVariant,
  TrayWindowModuleId
} from "@ccr/core/contracts/app";

type LoadedProfileConfig = Partial<Omit<ProfileRuntimeConfig, "claudeCode" | "codex" | "profiles">> & {
  claudeCode?: Partial<ClaudeCodeProfileConfig>;
  codex?: Partial<CodexProfileConfig>;
  profiles?: ProfileConfig[];
};

type LoadedBotGatewayConfig = Partial<Omit<BotGatewayRuntimeConfig, "handoff">> & {
  handoff?: Partial<BotGatewayRuntimeConfig["handoff"]>;
};

type LoadedAppConfig = Partial<Omit<AppConfig, "Router" | "agent" | "botGateway" | "gateway" | "mediaTools" | "observability" | "profile" | "proxy" | "toolHub">> & {
  Router?: Partial<RouterConfig>;
  agent?: Partial<GatewayAgentConfig>;
  botConfigs?: BotGatewaySavedConfig[];
  botGateway?: LoadedBotGatewayConfig;
  gateway?: Partial<AppConfig["gateway"]>;
  mediaTools?: Partial<MediaToolsConfig>;
  observability?: Partial<ObservabilityConfig>;
  profile?: LoadedProfileConfig;
  proxy?: Partial<ProxyRuntimeConfig>;
  toolHub?: Partial<ToolHubConfig>;
};

export type RawAppConfigSource = "default" | "legacy-json" | "sqlite";

type RawAppConfigLoadResult = {
  source: RawAppConfigSource;
  value: Partial<AppConfig>;
};

const REMOVED_LEGACY_ROUTER_RULE_IDS = new Set([
  "legacy-subagent",
  "legacy-background",
  "legacy-thinking",
  "legacy-web-search",
  "legacy-image"
]);
const INTERNAL_GATEWAY_CORE_HOST = "127.0.0.1";
const GENERATED_GATEWAY_API_KEY_ID = "local-gateway";

const DEFAULT_CONFIG: AppConfig = createDefaultAppConfig({
  coreHost: INTERNAL_GATEWAY_CORE_HOST,
  generatedConfigFile: GATEWAY_CONFIG_FILE
});

function completeBotGatewayConfig(config: LoadedBotGatewayConfig | undefined): BotGatewayRuntimeConfig {
  const platform = normalizeBotGatewayPlatform(config?.platform ?? DEFAULT_CONFIG.botGateway.platform);
  return {
    ...DEFAULT_CONFIG.botGateway,
    ...(config ?? {}),
    authType: normalizeBotGatewayAuthType(platform, config?.authType ?? DEFAULT_CONFIG.botGateway.authType),
    credentials: sanitizeBotGatewayRecord(config?.credentials ?? DEFAULT_CONFIG.botGateway.credentials),
    handoff: {
      ...DEFAULT_CONFIG.botGateway.handoff,
      ...(config?.handoff ?? {})
    },
    integrationConfig: websocketBotGatewayIntegrationConfig(platform, config?.integrationConfig ?? DEFAULT_CONFIG.botGateway.integrationConfig),
    platform
  };
}

function normalizeBotGatewayPlatform(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized || normalized === "off" || normalized === "disabled") {
    return "none";
  }
  if (normalized === "lark") {
    return "feishu";
  }
  if (normalized === "dingding") {
    return "dingtalk";
  }
  if (["wechat", "weixin", "wx", "weixin-ilink", "weixin_ilink", "ilink"].includes(normalized)) {
    return "weixin-ilink";
  }
  if (["wecom", "wework", "wechat-work", "work-weixin", "enterprise-wechat"].includes(normalized)) {
    return "wecom";
  }
  return normalized;
}

function normalizeBotGatewayAuthType(platform: string, value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/-/g, "_") : "";
  if (!platform || platform === "none") {
    return "";
  }
  if (!normalized || normalized === "default" || normalized === "auto" || normalized === "webhook" || normalized === "webhook_secret" || normalized === "outgoing_webhook") {
    return defaultBotGatewayAuthType(platform);
  }
  if (normalized === "appsecret") {
    return "app_secret";
  }
  if (normalized === "bottoken" || normalized === "token") {
    return "bot_token";
  }
  if (normalized === "oauth" || normalized === "oauth_2") {
    return "oauth2";
  }
  if (["qr", "qr_login", "qrcode", "qr_code"].includes(normalized)) {
    return "qr_login";
  }
  return normalized;
}

function defaultBotGatewayAuthType(platform: string): string {
  if (platform === "weixin-ilink") {
    return "qr_login";
  }
  if (platform === "feishu" || platform === "dingtalk" || platform === "wecom") {
    return "app_secret";
  }
  if (platform === "slack" || platform === "discord" || platform === "telegram" || platform === "line") {
    return "bot_token";
  }
  if (platform === "imessage") {
    return "local";
  }
  return "";
}

function websocketBotGatewayIntegrationConfig(platform: string, value: Record<string, unknown>): Record<string, unknown> {
  const config = sanitizeBotGatewayRecord(value);
  delete config.transport;
  delete config.sendMode;
  const transport = botGatewayWebSocketTransport(platform);
  return transport ? { ...config, transport } : config;
}

function botGatewayWebSocketTransport(platform: string): string {
  if (!platform || platform === "none") {
    return "";
  }
  return platform === "slack" ? "socket" : "websocket";
}

function sanitizeBotGatewayRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!isObject(value)) {
    return result;
  }
  for (const [key, rawValue] of Object.entries(value)) {
    if (!key.trim() || isWebhookRelatedBotGatewayKey(key)) {
      continue;
    }
    result[key] = rawValue;
  }
  return result;
}

function isWebhookRelatedBotGatewayKey(key: string): boolean {
  const normalized = key.trim().toLowerCase().replace(/[_-]+/g, "");
  return normalized.includes("webhook") || normalized === "sendmode";
}

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const loadedRawConfig = await loadRawAppConfig();
    const rawValue = loadedRawConfig.value;
    const value = interpolateRawAppConfigEnvVars(rawValue, loadedRawConfig.source) as Partial<AppConfig>;
    const picked = pickConfig(value);
    const providers = picked.Providers ?? DEFAULT_CONFIG.Providers;
    const port = picked.PORT ?? endpointPort(picked.routerEndpoint) ?? DEFAULT_CONFIG.PORT;
    const host = picked.HOST ?? DEFAULT_CONFIG.HOST;
    const endpoint = picked.routerEndpoint ?? `http://${normalizeEndpointHost(host)}:${port}`;
    const gatewayConfig = picked.gateway ?? {};
    const corePort = gatewayConfig.corePort ?? nextPort(port);
    const configFileApiKeys = normalizeApiKeys(picked.APIKEYS, picked.APIKEY).filter((apiKey) => !isDefaultSeedApiKey(apiKey));
    const persistedApiKeys = (await loadPersistedApiKeys()).filter((apiKey) => !isDefaultSeedApiKey(apiKey));
    const loadedApiKeys = uniqueApiKeyConfigs([...persistedApiKeys, ...configFileApiKeys]);
    const apiKeys = ensureGatewayApiKeys(loadedApiKeys);
    const config: AppConfig = withSingleEnabledGlobalProfiles({
      ...DEFAULT_CONFIG,
      ...picked,
      APIKEY: apiKeys[0]?.key ?? "",
      APIKEYS: apiKeys,
      HOST: host,
      PORT: port,
      Providers: providers,
      Router: {
        ...DEFAULT_CONFIG.Router,
        ...picked.Router
      },
      agent: {
        ...DEFAULT_CONFIG.agent,
        ...(picked.agent ?? {}),
        mcpServers: picked.agent?.mcpServers ?? DEFAULT_CONFIG.agent.mcpServers
      },
      botConfigs: picked.botConfigs ?? DEFAULT_CONFIG.botConfigs,
      botGateway: completeBotGatewayConfig(picked.botGateway),
      gateway: {
        ...DEFAULT_CONFIG.gateway,
        ...gatewayConfig,
        coreHost: INTERNAL_GATEWAY_CORE_HOST,
        corePort,
        generatedConfigFile: GATEWAY_CONFIG_FILE,
        host: gatewayConfig.host ?? host,
        port: gatewayConfig.port ?? port
      },
      mediaTools: {
        ...DEFAULT_CONFIG.mediaTools,
        ...(picked.mediaTools ?? {}),
        allowedInputRoots: picked.mediaTools?.allowedInputRoots ?? DEFAULT_CONFIG.mediaTools.allowedInputRoots
      },
      observability: {
        ...DEFAULT_CONFIG.observability,
        ...(picked.observability ?? {})
      },
      preferredProvider:
        picked.preferredProvider || providers[0]?.name || DEFAULT_CONFIG.preferredProvider,
      profile: {
        ...DEFAULT_CONFIG.profile,
        ...(picked.profile ?? {}),
        claudeCode: {
          ...DEFAULT_CONFIG.profile.claudeCode,
          ...(picked.profile?.claudeCode ?? {})
        },
        codex: {
          ...DEFAULT_CONFIG.profile.codex,
          ...(picked.profile?.codex ?? {}),
          cliMiddleware: true
        },
        profiles: picked.profile?.profiles ?? DEFAULT_CONFIG.profile.profiles
      },
      proxy: {
        ...DEFAULT_CONFIG.proxy,
        ...(picked.proxy ?? {}),
        targets: picked.proxy?.targets?.length ? picked.proxy.targets : DEFAULT_CONFIG.proxy.targets
      },
      routerEndpoint: endpoint,
      toolHub: {
        ...DEFAULT_CONFIG.toolHub,
        ...(picked.toolHub ?? {}),
        llm: {
          ...DEFAULT_CONFIG.toolHub.llm,
          ...(picked.toolHub?.llm ?? {})
        },
        mcpServers: picked.toolHub?.mcpServers ?? DEFAULT_CONFIG.toolHub.mcpServers
      }
    });
    const shouldPersistApiKeys = loadedApiKeys.length === 0 || hasConfigFileApiKeys(rawValue) || configFileApiKeys.length > 0;
    const shouldRepairProviderCapabilities = hasUnsupportedNvidiaCapabilities(value.Providers);
    if (shouldPersistApiKeys) {
      await replacePersistedApiKeys(apiKeys);
    }
    if (loadedRawConfig.source !== "sqlite" || shouldPersistApiKeys || shouldRepairProviderCapabilities) {
      await writeSanitizedConfig(config);
    }
    return config;
  } catch (error) {
    console.warn(`[config] Failed to load config: ${formatError(error)}`);
    const persistedApiKeys = await loadPersistedApiKeys().catch((storeError) => {
      console.warn(`[config] Failed to load API keys: ${formatError(storeError)}`);
      return [] as ApiKeyConfig[];
    });
    const apiKeys = ensureGatewayApiKeys(persistedApiKeys.filter((apiKey) => !isDefaultSeedApiKey(apiKey)));
    if (persistedApiKeys.length === 0) {
      await replacePersistedApiKeys(apiKeys).catch((storeError) => {
        console.warn(`[config] Failed to persist generated API key: ${formatError(storeError)}`);
      });
    }
    return {
      ...DEFAULT_CONFIG,
      APIKEY: apiKeys[0]?.key ?? "",
      APIKEYS: apiKeys
    };
  }
}

let appConfigWriteQueue: Promise<void> = Promise.resolve();
let appThemePreferenceOverride: AppConfig["theme"] | undefined;

export async function saveAppConfig(config: AppConfig): Promise<AppConfig> {
  return enqueueAppConfigWrite(() => saveAppConfigNow(config));
}

export async function saveAppThemePreference(theme: unknown): Promise<AppConfig["theme"]> {
  const normalizedTheme = normalizeAppThemePreference(theme);
  appThemePreferenceOverride = normalizedTheme;
  return enqueueAppConfigWrite(async () => {
    const currentConfig = await loadAppConfig();
    await writeSanitizedConfig({
      ...currentConfig,
      theme: normalizedTheme
    });
    return normalizedTheme;
  });
}

async function saveAppConfigNow(config: AppConfig): Promise<AppConfig> {
  const normalizedConfig = withSingleEnabledGlobalProfiles(config);
  assertProviderApiKeysAreSafe(normalizedConfig);
  const apiKeys = ensureGatewayApiKeys(normalizeApiKeys(normalizedConfig.APIKEYS, normalizedConfig.APIKEY).filter((apiKey) => !isDefaultSeedApiKey(apiKey)));
  await replacePersistedApiKeys(apiKeys);
  await writeSanitizedConfig({
    ...normalizedConfig,
    theme: appThemePreferenceOverride ?? normalizedConfig.theme,
    APIKEY: apiKeys[0]?.key ?? "",
    APIKEYS: apiKeys
  });
  return loadAppConfig();
}

function normalizeAppThemePreference(theme: unknown): AppConfig["theme"] {
  if (theme === "system" || theme === "light" || theme === "dark") {
    return theme;
  }
  throw new Error("Invalid theme preference.");
}

function enqueueAppConfigWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = appConfigWriteQueue.then(operation, operation);
  appConfigWriteQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function withSingleEnabledGlobalProfiles(config: AppConfig): AppConfig {
  return {
    ...config,
    Providers: config.Providers.map(normalizeProviderPresetCapabilities),
    profile: {
      ...config.profile,
      profiles: enforceSingleEnabledGlobalProfilePerAgent(config.profile.profiles)
    }
  };
}

function normalizeProviderPresetCapabilities(provider: GatewayProviderConfig): GatewayProviderConfig {
  const preset = findProviderPresetByBaseUrl(providerBaseUrl(provider));
  if (preset?.id !== "nvidia") {
    return provider;
  }

  const chatCapability = provider.capabilities?.find((capability) =>
    capability.type === "openai_chat_completions"
  );
  const presetBaseUrl = primaryProviderPresetEndpoint(preset)?.baseUrl ?? providerBaseUrl(provider);
  return {
    ...provider,
    capabilities: [{
      baseUrl: chatCapability?.baseUrl || presetBaseUrl,
      endpoint: chatCapability?.endpoint,
      source: chatCapability?.source ?? "preset",
      type: "openai_chat_completions"
    }]
  };
}

export function normalizeProviderPresetCapabilitiesForTest(
  provider: GatewayProviderConfig
): GatewayProviderConfig {
  return normalizeProviderPresetCapabilities(provider);
}

function hasUnsupportedNvidiaCapabilities(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((item) => {
    if (!isObject(item)) {
      return false;
    }
    const baseUrl = readString(item.api_base_url) || readString(item.baseUrl) || readString(item.baseurl);
    if (!baseUrl || findProviderPresetByBaseUrl(baseUrl)?.id !== "nvidia" || !Array.isArray(item.capabilities)) {
      return false;
    }
    return item.capabilities.some((capability) => {
      if (!isObject(capability)) {
        return false;
      }
      const protocol = parseProviderCapabilityProtocol(
        readString(capability.type) || readString(capability.protocol)
      );
      return Boolean(protocol && protocol !== "openai_chat_completions");
    });
  });
}

function assertProviderApiKeysAreSafe(config: AppConfig): void {
  for (const provider of config.Providers ?? []) {
    const apiKey = providerApiKey(provider);
    const baseUrl = providerBaseUrl(provider);
    const issue = providerApiKeySafetyIssue({
      apiKey,
      baseUrl,
      name: provider.name
    });
    if (issue) {
      throw new Error(issue.message);
    }
    assertProviderAccountApiKeyTargetsAreSafe(provider, apiKey, baseUrl);
    for (const credential of provider.credentials ?? []) {
      const credentialApiKey = providerCredentialApiKey(credential);
      const credentialIssue = providerApiKeySafetyIssue({
        apiKey: credentialApiKey,
        baseUrl,
        name: provider.name
      });
      if (credentialIssue) {
        throw new Error(credentialIssue.message);
      }
      assertProviderCredentialAccountApiKeyTargetsAreSafe(provider, credential, credentialApiKey, baseUrl);
    }
  }
}

function assertProviderAccountApiKeyTargetsAreSafe(provider: GatewayProviderConfig, apiKey: string, baseUrl: string): void {
  if (!apiKey || provider.account?.enabled === false) {
    return;
  }

  const presetId = findProviderPresetByBaseUrl(baseUrl)?.id;
  for (const connector of provider.account?.connectors ?? []) {
    const endpoints = providerAccountConnectorApiKeyEndpoints(connector);
    for (const endpoint of endpoints) {
      const issue = providerEndpointCanReceiveProviderApiKey({
        apiKey,
        endpoint,
        providerName: provider.name,
        providerPresetId: presetId
      });
      if (issue) {
        throw new Error(issue.message);
      }
    }
  }
}

function assertProviderCredentialAccountApiKeyTargetsAreSafe(
  provider: GatewayProviderConfig,
  credential: ProviderCredentialConfig,
  apiKey: string,
  baseUrl: string
): void {
  if (!apiKey || credential.account?.enabled === false) {
    return;
  }

  const presetId = findProviderPresetByBaseUrl(baseUrl)?.id;
  for (const connector of credential.account?.connectors ?? []) {
    const endpoints = providerAccountConnectorApiKeyEndpoints(connector);
    for (const endpoint of endpoints) {
      const issue = providerEndpointCanReceiveProviderApiKey({
        apiKey,
        endpoint,
        providerName: provider.name,
        providerPresetId: presetId
      });
      if (issue) {
        throw new Error(issue.message);
      }
    }
  }
}

function providerAccountConnectorApiKeyEndpoints(connector: ProviderAccountConnectorConfig): string[] {
  if ("auth" in connector && connector.auth === "none") {
    return [];
  }
  if (connector.type === "http-json") {
    return connector.endpoint ? [connector.endpoint] : [];
  }
  if (connector.type === "standard") {
    return [
      connector.endpoint,
      ...(connector.endpoints ?? [])
    ].filter((endpoint): endpoint is string => Boolean(endpoint?.trim() && /^https?:\/\//i.test(endpoint)));
  }
  return [];
}

function providerBaseUrl(provider: GatewayProviderConfig): string {
  return provider.api_base_url || provider.baseUrl || provider.baseurl || "";
}

function providerApiKey(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || "";
}

function providerCredentialApiKey(credential: ProviderCredentialConfig): string {
  return credential.api_key || credential.apiKey || credential.apikey || "";
}

export async function saveApiKeysConfig(apiKeys: ApiKeyConfig[]): Promise<AppConfig> {
  const normalized = ensureGatewayApiKeys(normalizeApiKeys(apiKeys, undefined).filter((apiKey) => !isDefaultSeedApiKey(apiKey)));
  await replacePersistedApiKeys(normalized);
  return loadAppConfig();
}

async function loadRawAppConfig(): Promise<RawAppConfigLoadResult> {
  const persistedConfig = await loadPersistedAppConfig();
  if (isObject(persistedConfig)) {
    return {
      source: "sqlite",
      value: persistedConfig as Partial<AppConfig>
    };
  }

  const legacyConfig = readLegacyJsonConfig();
  if (legacyConfig) {
    return {
      source: "legacy-json",
      value: legacyConfig
    };
  }

  return {
    source: "default",
    value: {}
  };
}

function readLegacyJsonConfig(): Partial<AppConfig> | undefined {
  const files = uniqueStrings([CONFIG_FILE, LEGACY_WINDOWS_CONFIG_FILE, LEGACY_CONFIG_FILE]);
  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
      if (isObject(parsed)) {
        return parsed as Partial<AppConfig>;
      }
      console.warn(`[config] Ignoring legacy config with non-object root: ${file}`);
    } catch (error) {
      console.warn(`[config] Failed to read legacy config ${file}: ${formatError(error)}`);
    }
  }
  return undefined;
}

async function writeSanitizedConfig(config: AppConfig): Promise<void> {
  await replacePersistedAppConfig(sanitizeConfigForDisk(config));
}

function sanitizeConfigForDisk(config: AppConfig): AppConfig {
  return {
    ...config,
    APIKEY: "",
    APIKEYS: [],
    gateway: {
      ...config.gateway,
      coreHost: INTERNAL_GATEWAY_CORE_HOST
    },
    Providers: withProviderIds(config.Providers),
    profile: sanitizeProfileConfigForDisk(config.profile)
  };
}

function sanitizeProfileConfigForDisk(profile: AppConfig["profile"]): AppConfig["profile"] {
  const { remoteFrontendMode: _remoteFrontendMode, ...codex } = profile.codex as AppConfig["profile"]["codex"] & {
    remoteFrontendMode?: unknown;
  };
  return {
    ...profile,
    codex,
    profiles: profile.profiles.map((profileItem) => {
      if (profileItem.agent !== "codex" && profileItem.agent !== "opencode" && profileItem.agent !== "zcode") {
        return profileItem;
      }
      const {
        coreMode: _coreMode,
        frontendMode: _frontendMode,
        remoteFrontendMode: _itemRemoteFrontendMode,
        ...cleanedProfile
      } = profileItem as ProfileConfig & {
        coreMode?: unknown;
        frontendMode?: unknown;
        remoteFrontendMode?: unknown;
      };
      return cleanedProfile;
    })
  };
}

function pickConfig(value: Partial<AppConfig>): LoadedAppConfig {
  const config: LoadedAppConfig = {};

  const port = readPort((value as Record<string, unknown>).PORT);
  if (port) {
    config.PORT = port;
  }
  if (typeof value.HOST === "string" && value.HOST.trim()) {
    config.HOST = value.HOST.trim();
  }
  if (typeof value.APIKEY === "string") {
    config.APIKEY = value.APIKEY;
  }
  const apiKeys = parseApiKeys((value as Record<string, unknown>).APIKEYS ?? (value as Record<string, unknown>).apiKeys);
  if (apiKeys) {
    config.APIKEYS = apiKeys;
  }
  if (typeof value.API_TIMEOUT_MS === "string" || typeof value.API_TIMEOUT_MS === "number") {
    config.API_TIMEOUT_MS = value.API_TIMEOUT_MS;
  }
  if (typeof value.CUSTOM_ROUTER_PATH === "string") {
    config.CUSTOM_ROUTER_PATH = value.CUSTOM_ROUTER_PATH.trim();
  }
  const providers = parseProviders((value as Record<string, unknown>).Providers ?? (value as Record<string, unknown>).providers);
  if (providers) {
    config.Providers = providers;
  }
  if (Array.isArray((value as Record<string, unknown>).providerPlugins)) {
    config.providerPlugins = (value as Record<string, unknown>).providerPlugins as unknown[];
  }
  const virtualModelProfiles = (value as Record<string, unknown>).virtualModelProfiles;
  if (Array.isArray(virtualModelProfiles)) {
    config.virtualModelProfiles = virtualModelProfiles.map(removeVirtualModelToolLoopLimits) as AppConfig["virtualModelProfiles"];
  }
  const plugins = parseGatewayPlugins((value as Record<string, unknown>).plugins ?? (value as Record<string, unknown>).gatewayPlugins);
  if (plugins) {
    config.plugins = plugins;
  }
  const router = parseRouter((value as Record<string, unknown>).Router);
  if (router) {
    config.Router = router;
  }
  const agent = parseAgent((value as Record<string, unknown>).agent ?? (value as Record<string, unknown>).Agent, (value as Record<string, unknown>).mcpServers);
  if (agent) {
    config.agent = agent;
  }
  const botGateway = parseBotGateway((value as Record<string, unknown>).botGateway ?? (value as Record<string, unknown>).bot_gateway ?? (value as Record<string, unknown>).bot);
  if (botGateway) {
    config.botGateway = botGateway;
  }
  const botConfigs = parseBotGatewaySavedConfigs((value as Record<string, unknown>).botConfigs ?? (value as Record<string, unknown>).bot_configs);
  if (botConfigs) {
    config.botConfigs = botConfigs;
  }
  if (typeof value.autoStart === "boolean") {
    config.autoStart = value.autoStart;
  }
  const launchAtLogin = (value as Record<string, unknown>).launchAtLogin;
  if (typeof launchAtLogin === "boolean") {
    config.launchAtLogin = launchAtLogin;
  }
  if (isObject(value.gateway)) {
    const gateway = value.gateway as Record<string, unknown>;
    const gatewayConfig: Partial<AppConfig["gateway"]> = {};
    if (typeof gateway.enabled === "boolean") {
      gatewayConfig.enabled = gateway.enabled;
    }
    if (typeof gateway.host === "string" && gateway.host.trim()) {
      gatewayConfig.host = gateway.host.trim();
    }
    const gatewayPort = readPort(gateway.port);
    if (gatewayPort) {
      gatewayConfig.port = gatewayPort;
    }
    const gatewayCorePort = readPort(gateway.corePort);
    if (gatewayCorePort) {
      gatewayConfig.corePort = gatewayCorePort;
    }
    config.gateway = gatewayConfig;
  }
  const profile = parseProfile((value as Record<string, unknown>).profile);
  if (profile) {
    config.profile = profile;
  }
  const proxy = parseProxy((value as Record<string, unknown>).proxy);
  if (proxy) {
    config.proxy = proxy;
  }
  const observability = parseObservability((value as Record<string, unknown>).observability);
  if (observability) {
    config.observability = observability;
  }
  const mediaTools = parseMediaTools((value as Record<string, unknown>).mediaTools ?? (value as Record<string, unknown>).media_tools ?? (value as Record<string, unknown>).grokMedia ?? (value as Record<string, unknown>).grok_media);
  if (mediaTools) {
    config.mediaTools = mediaTools;
  }
  const toolHub = parseToolHub((value as Record<string, unknown>).toolHub ?? (value as Record<string, unknown>).tool_hub);
  if (toolHub) {
    config.toolHub = toolHub;
  }
  if (typeof value.preferredProvider === "string" && value.preferredProvider.trim()) {
    config.preferredProvider = value.preferredProvider.trim();
  }
  if (typeof value.routerEndpoint === "string" && value.routerEndpoint.trim()) {
    config.routerEndpoint = value.routerEndpoint.trim();
  }
  if (value.theme === "system" || value.theme === "light" || value.theme === "dark") {
    config.theme = value.theme;
  }
  const trayIcon = parseTrayIconPreference((value as Record<string, unknown>).trayIcon);
  if (trayIcon) {
    config.trayIcon = trayIcon;
  }
  const trayBalanceProgress = parseTrayBalanceProgress((value as Record<string, unknown>).trayBalanceProgress);
  if (trayBalanceProgress) {
    config.trayBalanceProgress = trayBalanceProgress;
  } else if (config.trayIcon === "progress") {
    config.trayIcon = "random";
  }
  const trayProgressTargetTokens = readNumber((value as Record<string, unknown>).trayProgressTargetTokens);
  if (trayProgressTargetTokens && trayProgressTargetTokens > 0) {
    config.trayProgressTargetTokens = clampNumber(trayProgressTargetTokens, 1000, 1_000_000_000);
  }
  const trayComponentVariants = parseTrayComponentVariants((value as Record<string, unknown>).trayComponentVariants);
  if (trayComponentVariants) {
    config.trayComponentVariants = trayComponentVariants;
  }
  const resolvedTrayComponentVariants = trayComponentVariants ?? DEFAULT_TRAY_COMPONENT_VARIANTS;
  const trayWindowModules = parseTrayWindowModules((value as Record<string, unknown>).trayWindowModules);
  if (trayWindowModules !== undefined) {
    config.trayWindowModules = trayWindowModules;
  }
  const trayWidgets = parseTrayWidgets((value as Record<string, unknown>).trayWidgets);
  if (trayWidgets !== undefined) {
    config.trayWidgets = trayWidgets;
  } else if (trayWindowModules !== undefined) {
    config.trayWidgets = trayWidgetsFromModules(trayWindowModules, resolvedTrayComponentVariants);
  }
  const overviewWidgets = parseOverviewWidgets((value as Record<string, unknown>).overviewWidgets);
  if (overviewWidgets !== undefined) {
    config.overviewWidgets = overviewWidgets;
  }

  return config;
}

function removeVirtualModelToolLoopLimits(value: unknown): unknown {
  if (
    !isObject(value) ||
    !isObject(value.execution) ||
    (!("maxTurns" in value.execution) && !("maxToolCalls" in value.execution))
  ) {
    return value;
  }
  const { maxToolCalls: _maxToolCalls, maxTurns: _maxTurns, ...execution } = value.execution;
  return {
    ...value,
    execution
  };
}

export function virtualModelProfileFromRawForTest(value: unknown): unknown {
  return removeVirtualModelToolLoopLimits(value);
}

function parseObservability(value: unknown): Partial<ObservabilityConfig> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const observability: Partial<ObservabilityConfig> = {};
  if (typeof value.requestLogs === "boolean") {
    observability.requestLogs = value.requestLogs;
  }
  if (typeof value.agentAnalysis === "boolean") {
    observability.agentAnalysis = value.agentAnalysis;
  }
  if (value.requestLogBodyCapture === "all" || value.requestLogBodyCapture === "errors" || value.requestLogBodyCapture === "none") {
    observability.requestLogBodyCapture = value.requestLogBodyCapture;
  }
  if (typeof value.requestLogMaxBodyBytes === "number" && Number.isFinite(value.requestLogMaxBodyBytes)) {
    observability.requestLogMaxBodyBytes = Math.max(0, Math.min(maxRequestLogBodyBytes, Math.floor(value.requestLogMaxBodyBytes)));
  }
  if (typeof value.requestLogSuccessSampleRate === "number" && Number.isFinite(value.requestLogSuccessSampleRate)) {
    observability.requestLogSuccessSampleRate = Math.max(0, Math.min(1, value.requestLogSuccessSampleRate));
  }
  return Object.keys(observability).length ? observability : undefined;
}

function parseToolHub(value: unknown): Partial<ToolHubConfig> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const toolHub: Partial<ToolHubConfig> = {};
  if (typeof value.enabled === "boolean") {
    toolHub.enabled = value.enabled;
  }
  const browserAutomation = value.browserAutomation ?? value.browser_automation;
  if (typeof browserAutomation === "boolean") {
    toolHub.browserAutomation = browserAutomation;
  }
  const maxTools = readNumber(value.maxTools ?? value.max_tools);
  if (maxTools !== undefined) {
    toolHub.maxTools = clampNumber(maxTools, 1, 20);
  }
  const requestTimeoutMs = readNumber(value.requestTimeoutMs ?? value.request_timeout_ms);
  if (requestTimeoutMs !== undefined) {
    toolHub.requestTimeoutMs = clampNumber(requestTimeoutMs, 8000, 300000);
  }
  const mcpServers = parseMcpServers(value.mcpServers ?? value.mcp_servers);
  if (mcpServers) {
    toolHub.mcpServers = mcpServers;
  }

  const rawLlm = isObject(value.llm) ? value.llm : value;
  const llm: Partial<ToolHubConfig["llm"]> = {};
  const apiKey = readString(rawLlm.apiKey) || readString(rawLlm.api_key);
  if (apiKey !== undefined) {
    llm.apiKey = apiKey;
  }
  const baseUrl = readString(rawLlm.baseUrl) || readString(rawLlm.base_url);
  if (baseUrl !== undefined) {
    llm.baseUrl = baseUrl;
  }
  const model = readString(rawLlm.model);
  if (model !== undefined) {
    llm.model = model;
  }
  if (Object.keys(llm).length > 0) {
    toolHub.llm = llm as ToolHubConfig["llm"];
  }

  return Object.keys(toolHub).length ? toolHub : undefined;
}

function parseMediaTools(value: unknown): Partial<MediaToolsConfig> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const config: Partial<MediaToolsConfig> = {};
  if (typeof value.enabled === "boolean") config.enabled = value.enabled;
  const rawAllowedInputRoots = value.allowedInputRoots ?? value.allowed_input_roots;
  if (Array.isArray(rawAllowedInputRoots)) {
    config.allowedInputRoots = rawAllowedInputRoots
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim());
  }
  const artifactTtlHours = readNumber(value.artifactTtlHours ?? value.artifact_ttl_hours);
  if (artifactTtlHours !== undefined) config.artifactTtlHours = clampNumber(artifactTtlHours, 1, 720);
  const jobTimeoutMs = readNumber(value.jobTimeoutMs ?? value.job_timeout_ms);
  if (jobTimeoutMs !== undefined) config.jobTimeoutMs = clampNumber(jobTimeoutMs, 30000, 3600000);
  const maxImageConcurrency = readNumber(value.maxImageConcurrency ?? value.max_image_concurrency);
  if (maxImageConcurrency !== undefined) config.maxImageConcurrency = clampNumber(maxImageConcurrency, 1, 8);
  const maxVideoConcurrency = readNumber(value.maxVideoConcurrency ?? value.max_video_concurrency);
  if (maxVideoConcurrency !== undefined) config.maxVideoConcurrency = clampNumber(maxVideoConcurrency, 1, 4);
  return Object.keys(config).length ? config : undefined;
}

export function mediaToolsConfigFromRawForTest(value: unknown): Partial<MediaToolsConfig> | undefined {
  return parseMediaTools(value);
}

function parseOverviewWidgets(value: unknown): OverviewWidgetConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const widgets = value
    .map(parseOverviewWidget)
    .filter((widget): widget is OverviewWidgetConfig => Boolean(widget));
  return widgets;
}

function parseOverviewWidget(value: unknown): OverviewWidgetConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const type = parseOverviewWidgetType(value.type);
  if (!type) {
    return undefined;
  }
  const metric = type === "metric" ? parseOverviewMetricKind(value.metric) ?? "requests" : undefined;
  const accountProvider = type === "account-balance" ? readString(value.accountProvider) : undefined;
  return {
    ...(accountProvider ? { accountProvider } : {}),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    id: readString(value.id) || overviewWidgetId(type, metric),
    ...(metric ? { metric } : {}),
    size: parseOverviewWidgetSize(value.size, type) ?? defaultOverviewWidgetSize(type),
    type,
    variant: parseOverviewWidgetVariant(value.variant) ?? defaultOverviewWidgetVariant(type)
  };
}

function parseOverviewWidgetType(value: unknown): OverviewWidgetType | undefined {
  return parseEnumValue(value, ["account-balance", "client-analysis", "metric", "model-distribution", "provider-analysis", "share-fuel-cockpit", "share-model-leaderboard", "share-route-map", "share-spend-receipt", "share-token-calendar", "share-usage-wrapped", "system-status", "token-activity", "token-mix", "usage-trend"], undefined);
}

function parseOverviewWidgetSize(value: unknown, type: OverviewWidgetType): OverviewWidgetSize | undefined {
  const size = parseEnumValue(value, OVERVIEW_WIDGET_SIZE_VALUES, undefined);
  if (size) {
    return size;
  }
  if (value === "small") {
    return "1:1";
  }
  if (value === "medium" || value === "large") {
    return "2:2";
  }
  if (value === "wide") {
    return "3:2";
  }
  if (value === "full") {
    return type === "system-status" ? "4:1" : "4:2";
  }
  return undefined;
}

function parseOverviewWidgetVariant(value: unknown): OverviewWidgetVariant | undefined {
  return parseEnumValue(value, ["arc", "area", "bar", "bars", "card", "cards", "compact", "composed", "donut", "heatmap", "line", "nested-rings", "pie", "ring", "semicircle", "stacked", "table", "timeline"], undefined);
}

function parseOverviewMetricKind(value: unknown): OverviewMetricKind | undefined {
  return parseEnumValue(value, ["avg-latency", "cache-ratio", "cache-tokens", "errors", "estimated-cost", "input-tokens", "output-tokens", "requests", "success-rate", "total-tokens"], undefined);
}

function defaultOverviewWidgetSize(type: OverviewWidgetType): OverviewWidgetSize {
  if (type === "metric") {
    return "1:1";
  }
  if (type === "model-distribution") {
    return "2:2";
  }
  if (type === "token-mix") {
    return "1:2";
  }
  if (type === "token-activity") {
    return "4:2";
  }
  if (type === "client-analysis" || type === "provider-analysis") {
    return "2:2";
  }
  if (type === "usage-trend") {
    return "3:2";
  }
  if (type === "system-status") {
    return "4:1";
  }
  if (isShareOverviewWidgetType(type)) {
    return "1:4";
  }
  return "4:2";
}

function defaultOverviewWidgetVariant(type: OverviewWidgetType): OverviewWidgetVariant {
  if (type === "account-balance") {
    return "cards";
  }
  if (type === "metric") {
    return "card";
  }
  if (type === "model-distribution") {
    return "pie";
  }
  if (type === "token-mix") {
    return "bars";
  }
  if (type === "token-activity") {
    return "heatmap";
  }
  if (type === "usage-trend") {
    return "composed";
  }
  if (type === "system-status") {
    return "timeline";
  }
  if (isShareOverviewWidgetType(type)) {
    return "card";
  }
  return "table";
}

function overviewWidgetId(type: OverviewWidgetType, metric?: OverviewMetricKind): string {
  return type === "metric" ? `metric-${metric ?? "requests"}` : type;
}

function isShareOverviewWidgetType(type: OverviewWidgetType): boolean {
  return type === "share-fuel-cockpit" ||
    type === "share-model-leaderboard" ||
    type === "share-route-map" ||
    type === "share-spend-receipt" ||
    type === "share-token-calendar" ||
    type === "share-usage-wrapped";
}

function parseTrayIconPreference(value: unknown): TrayIconPreference | undefined {
  if (value === "random" || value === "violet" || value === "orange" || value === "cyan" || value === "progress") {
    return value;
  }
  return undefined;
}

function parseTrayBalanceProgress(value: unknown): TrayBalanceProgressConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const provider = readString(value.provider);
  const meterId = readString(value.meterId);
  return provider && meterId ? { meterId, provider } : undefined;
}

function parseTrayWindowModules(value: unknown): TrayWindowModuleId[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const allowed = new Set<string>(TRAY_WINDOW_MODULE_IDS);
  return uniqueStrings(value.map((item) => readString(item)).filter((item): item is string => Boolean(item)))
    .filter((item): item is TrayWindowModuleId => allowed.has(item));
}

function parseTrayWidgets(value: unknown): TrayWidgetConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return orderTrayWidgetsForLayout(dedupeTraySingletonWidgets(value
    .map(parseTrayWidget)
    .filter((widget): widget is TrayWidgetConfig => Boolean(widget))));
}

function parseTrayWidget(value: unknown): TrayWidgetConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const type = parseTrayWidgetType(value.type);
  if (!type) {
    return undefined;
  }
  const variant = parseTrayWidgetVariant(type, value.variant);
  return {
    id: readString(value.id) || trayWidgetId(type),
    type,
    ...(variant ? { variant } : {})
  };
}

function parseTrayWidgetType(value: unknown): TrayWidgetType | undefined {
  return parseEnumValue(value, ["account", "activity", "header", "model-share", "rings", "source-tabs", "stats", "token-flow", "token-mix"], undefined);
}

function parseTrayWidgetVariant(type: TrayWidgetType, value: unknown): TrayWidgetVariant | undefined {
  const fallback = defaultTrayWidgetVariant(type);
  return fallback === undefined
    ? parseEnumValue(value, trayWidgetVariantValues(type), undefined)
    : parseEnumValue(value, trayWidgetVariantValues(type), fallback);
}

function trayWidgetVariantValues(type: TrayWidgetType): TrayWidgetVariant[] {
  if (type === "account") return ["bar", "compact", "ring", "arc", "stacked"];
  if (type === "model-share") return ["bars", "list", "donut", "pie"];
  if (type === "rings") return ["rings", "arcs", "gauges"];
  if (type === "stats") return ["cards", "compact", "pills"];
  if (type === "token-flow") return ["line", "area", "bar", "sparkline"];
  if (type === "token-mix") return ["bars", "stacked", "donut", "pie"];
  return [];
}

function defaultTrayWidgetVariant(type: TrayWidgetType): TrayWidgetVariant | undefined {
  if (type === "account") return DEFAULT_TRAY_COMPONENT_VARIANTS.account;
  if (type === "model-share") return DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare;
  if (type === "rings") return DEFAULT_TRAY_COMPONENT_VARIANTS.rings;
  if (type === "stats") return DEFAULT_TRAY_COMPONENT_VARIANTS.stats;
  if (type === "token-flow") return DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow;
  if (type === "token-mix") return DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix;
  return undefined;
}

function trayWidgetId(type: TrayWidgetType): string {
  return type;
}

function isTraySingletonWidgetType(type: TrayWidgetType): boolean {
  return (TRAY_SINGLETON_WIDGET_TYPES as readonly string[]).includes(type);
}

function isTrayPinnedTopWidgetType(type: TrayWidgetType): boolean {
  return (TRAY_TOP_WIDGET_TYPES as readonly string[]).includes(type);
}

function orderTrayWidgetsForLayout(widgets: TrayWidgetConfig[]): TrayWidgetConfig[] {
  return [
    ...widgets.filter((widget) => isTrayPinnedTopWidgetType(widget.type)),
    ...widgets.filter((widget) => !isTrayPinnedTopWidgetType(widget.type))
  ];
}

function dedupeTraySingletonWidgets(widgets: TrayWidgetConfig[]): TrayWidgetConfig[] {
  const seenSingletons = new Set<TrayWidgetType>();
  return widgets.filter((widget) => {
    if (!isTraySingletonWidgetType(widget.type)) {
      return true;
    }
    if (seenSingletons.has(widget.type)) {
      return false;
    }
    seenSingletons.add(widget.type);
    return true;
  });
}

function trayWidgetsFromModules(modules: TrayWindowModuleId[], variants: TrayComponentVariants): TrayWidgetConfig[] {
  return orderTrayWidgetsForLayout(modules
    .filter((moduleId): moduleId is TrayWidgetType => moduleId !== "footer")
    .map((type) => ({
      id: trayWidgetId(type),
      type,
      ...((type === "account") ? { variant: variants.account } : {}),
      ...((type === "model-share") ? { variant: variants.modelShare } : {}),
      ...((type === "rings") ? { variant: variants.rings } : {}),
      ...((type === "stats") ? { variant: variants.stats } : {}),
      ...((type === "token-flow") ? { variant: variants.tokenFlow } : {}),
      ...((type === "token-mix") ? { variant: variants.tokenMix } : {})
    })));
}

function parseTrayComponentVariants(value: unknown): TrayComponentVariants | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  return {
    account: parseEnumValue(value.account, ["bar", "compact", "ring", "arc", "stacked"], DEFAULT_TRAY_COMPONENT_VARIANTS.account),
    modelShare: parseEnumValue(value.modelShare, ["bars", "list", "donut", "pie"], DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare),
    rings: parseEnumValue(value.rings, ["rings", "arcs", "gauges"], DEFAULT_TRAY_COMPONENT_VARIANTS.rings),
    stats: parseEnumValue(value.stats, ["cards", "compact", "pills"], DEFAULT_TRAY_COMPONENT_VARIANTS.stats),
    tokenFlow: parseEnumValue(value.tokenFlow, ["line", "area", "bar", "sparkline"], DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow),
    tokenMix: parseEnumValue(value.tokenMix, ["bars", "stacked", "donut", "pie"], DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix)
  };
}

function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T;
function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: undefined): T | undefined;
function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T | undefined): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function parseProviders(value: unknown): GatewayProviderConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const providers = value
    .map((item): GatewayProviderConfig | undefined => {
      if (!isObject(item)) {
        return undefined;
      }
      const name = readString(item.name);
      const models = Array.isArray(item.models)
        ? item.models.map((model) => readString(model)).filter((model): model is string => Boolean(model))
        : [];
      const modelDescriptions = parseModelDescriptions(item.modelDescriptions ?? item.model_descriptions, models);
      const modelDisplayNames = parseModelDisplayNames(item.modelDisplayNames ?? item.model_display_names, models);
      const modelMetadata = parseModelMetadata(item.modelMetadata ?? item.model_metadata, models);

      if (!name) {
        return undefined;
      }

      const provider: GatewayProviderConfig = {
        account: parseProviderAccount(item.account),
        api_base_url: readString(item.api_base_url),
        api_key: readString(item.api_key),
        apiKey: readString(item.apiKey),
        apikey: readString(item.apikey),
        baseUrl: readString(item.baseUrl),
        baseurl: readString(item.baseurl),
        billing: item.billing,
        capabilities: parseProviderCapabilities(item.capabilities),
        credentials: parseProviderCredentials(item.credentials ?? item.keys ?? item.apiKeys),
        extraBody: item.extraBody,
        extraHeaders: item.extraHeaders,
        icon: readString(item.icon),
        id: readString(item.id),
        modelDescriptions,
        modelDisplayNames,
        modelMetadata,
        models,
        name,
        provider: readString(item.provider),
        transformer: item.transformer,
        type: readString(item.type)
      };
      return removeOpenCodeProviderAccountConfig(
        normalizeProviderPresetCapabilities(
          normalizeGrokProviderMediaCapabilities(
            normalizeGrokProviderAccountConfig(normalizeCodexProviderAccountConfig(provider))
          )
        )
      );
    })
    .filter((item): item is GatewayProviderConfig => Boolean(item));

  return withProviderIds(providers);
}

function parseModelDescriptions(value: unknown, models: string[]): Record<string, string> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const modelIds = new Set(models);
  const entries = Object.entries(value)
    .map(([rawModel, rawDescription]) => [rawModel.trim(), readString(rawDescription)] as const)
    .filter((entry): entry is [string, string] => {
      const [model, description] = entry;
      return Boolean(model && description && modelIds.has(model));
    });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseModelDisplayNames(value: unknown, models: string[]): Record<string, string> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const modelIds = new Set(models);
  const entries = Object.entries(value)
    .map(([rawModel, rawDisplayName]) => [rawModel.trim(), readString(rawDisplayName)] as const)
    .filter((entry): entry is [string, string] => {
      const [model, displayName] = entry;
      return Boolean(model && displayName && modelIds.has(model) && model !== displayName);
    });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseModelMetadata(value: unknown, models: string[]): Record<string, ProviderModelMetadata> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const modelIds = new Set(models);
  const entries = Object.entries(value)
    .map(([rawModel, rawMetadata]) => [rawModel.trim(), parseProviderModelMetadata(rawMetadata)] as const)
    .filter((entry): entry is [string, ProviderModelMetadata] => {
      const [model, metadata] = entry;
      return Boolean(model && metadata && modelIds.has(model));
    });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseProviderModelMetadata(value: unknown): ProviderModelMetadata | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const supportedReasoningLevels = parseProviderReasoningLevels(value.supportedReasoningLevels ?? value.supported_reasoning_levels);
  const capabilities = parseProviderModelCapabilities(value.capabilities);
  const contextWindow = readPositiveInteger(value.contextWindow ?? value.context_window);
  const effectiveContextWindowPercent = readPercentage(value.effectiveContextWindowPercent ?? value.effective_context_window_percent);
  const maxContextWindow = readPositiveInteger(value.maxContextWindow ?? value.max_context_window);
  const pricing = parseProviderModelPricing(value.pricing);
  const metadata: ProviderModelMetadata = {
    ...(Array.isArray(value.additionalSpeedTiers) ? { additionalSpeedTiers: value.additionalSpeedTiers } : {}),
    ...(Array.isArray(value.additional_speed_tiers) ? { additionalSpeedTiers: value.additional_speed_tiers } : {}),
    ...(capabilities ? { capabilities } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(value.defaultReasoningLevel === null ? { defaultReasoningLevel: null } : {}),
    ...(readString(value.defaultReasoningLevel) ? { defaultReasoningLevel: readString(value.defaultReasoningLevel) } : {}),
    ...(value.default_reasoning_level === null ? { defaultReasoningLevel: null } : {}),
    ...(readString(value.default_reasoning_level) ? { defaultReasoningLevel: readString(value.default_reasoning_level) } : {}),
    ...(readString(value.defaultReasoningSummary) ? { defaultReasoningSummary: readString(value.defaultReasoningSummary) } : {}),
    ...(readString(value.default_reasoning_summary) ? { defaultReasoningSummary: readString(value.default_reasoning_summary) } : {}),
    ...(effectiveContextWindowPercent ? { effectiveContextWindowPercent } : {}),
    ...(maxContextWindow ? { maxContextWindow } : {}),
    ...(pricing ? { pricing } : {}),
    ...(Array.isArray(value.serviceTiers) ? { serviceTiers: value.serviceTiers } : {}),
    ...(Array.isArray(value.service_tiers) ? { serviceTiers: value.service_tiers } : {}),
    ...(supportedReasoningLevels ? { supportedReasoningLevels } : {}),
    ...(typeof value.supportsReasoningSummaries === "boolean" ? { supportsReasoningSummaries: value.supportsReasoningSummaries } : {}),
    ...(typeof value.supports_reasoning_summaries === "boolean" ? { supportsReasoningSummaries: value.supports_reasoning_summaries } : {})
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function parseProviderModelCapabilities(value: unknown): ProviderModelCapabilities | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const capabilities: ProviderModelCapabilities = {};
  const fields: Array<keyof ProviderModelCapabilities> = ["imageInput", "webSearch"];
  for (const field of fields) {
    const snakeCaseField = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const candidate = value[field] ?? value[snakeCaseField];
    if (typeof candidate === "boolean") {
      capabilities[field] = candidate;
    }
  }
  return Object.keys(capabilities).length > 0 ? capabilities : undefined;
}

function parseProviderModelPricing(value: unknown): ProviderModelPricing | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const pricing: ProviderModelPricing = {};
  const fields: Array<keyof ProviderModelPricing> = [
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
    const parsed = readNonNegativeNumber(value[field] ?? value[durationSnakeCaseField] ?? value[snakeCaseField]);
    if (parsed !== undefined) {
      pricing[field] = parsed;
    }
  }
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

export function providerModelMetadataFromConfigForTest(value: unknown): ProviderModelMetadata | undefined {
  return parseProviderModelMetadata(value);
}

function parseProviderReasoningLevels(value: unknown): ProviderReasoningLevel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const levels = value
    .map((item): ProviderReasoningLevel | undefined => {
      if (!isObject(item)) {
        const effort = readString(item);
        return effort ? { description: effort, effort } : undefined;
      }
      const effort = readString(item.effort);
      if (!effort) {
        return undefined;
      }
      return {
        description: readString(item.description) || effort,
        effort
      };
    })
    .filter((item): item is ProviderReasoningLevel => Boolean(item));
  return levels.length > 0 ? levels : value.length === 0 ? [] : undefined;
}

function withProviderIds(providers: GatewayProviderConfig[]): GatewayProviderConfig[] {
  const counts = new Map<string, number>();
  return providers.map((provider) => {
    const baseId = providerRuntimeIdCandidate(provider);
    const nextCount = (counts.get(baseId) ?? 0) + 1;
    counts.set(baseId, nextCount);
    return {
      ...provider,
      id: nextCount === 1 ? baseId : `${baseId}-${nextCount}`
    };
  });
}

function providerRuntimeIdCandidate(provider: GatewayProviderConfig): string {
  const explicit = sanitizeProviderId(provider.id);
  if (explicit) {
    return explicit;
  }
  const slug = sanitizeProviderId(provider.name) || "provider";
  const source = [
    provider.name,
    provider.provider ?? "",
    providerBaseUrl(provider),
    provider.type ?? ""
  ].join("\n");
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 10);
  return `provider-${slug.slice(0, 48)}-${hash}`;
}

function sanitizeProviderId(value: string | undefined): string | undefined {
  const normalized = value
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || undefined;
}

function parseProviderCredentials(value: unknown): ProviderCredentialConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const credentials = value
    .map((item, index): ProviderCredentialConfig | undefined => {
      if (!isObject(item)) {
        return undefined;
      }

      const apiKey = readString(item.api_key) || readString(item.apiKey) || readString(item.apikey) || readString(item.key) || readString(item.token);
      if (!apiKey) {
        return undefined;
      }

      const legacyLabel = readString(item.label);
      const id = readString(item.id);
      const name = readString(item.name) || legacyLabel || id || `Key ${index + 1}`;
      const priority = readNumber(item.priority);
      const weight = readNumber(item.weight);
      return {
        account: parseProviderAccount(item.account),
        api_key: apiKey,
        enabled: typeof item.enabled === "boolean" ? item.enabled : undefined,
        ...(legacyLabel ? { label: legacyLabel } : {}),
        ...(id ? { id } : {}),
        name,
        limits: parseApiKeyLimits(item.limits),
        priority: priority !== undefined ? priority : undefined,
        weight: weight !== undefined && weight > 0 ? weight : undefined
      };
    })
    .filter((item): item is ProviderCredentialConfig => Boolean(item));

  return credentials.length > 0 ? credentials : undefined;
}

function parseProviderAccount(value: unknown): ProviderAccountConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const refreshIntervalMs = readNumber(value.refreshIntervalMs);
  const connectors = Array.isArray(value.connectors)
    ? value.connectors
      .filter((connector): connector is Record<string, unknown> => isObject(connector))
      .map((connector) => ({ ...connector }) as ProviderAccountConnectorConfig)
    : undefined;

  if (typeof value.enabled !== "boolean" && !refreshIntervalMs && !connectors?.length) {
    return undefined;
  }

  return {
    connectors,
    enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
    refreshIntervalMs: refreshIntervalMs && refreshIntervalMs > 0 ? refreshIntervalMs : undefined
  };
}

function parseProviderCapabilities(value: unknown): GatewayProviderCapability[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const capabilities = value
    .map((item): GatewayProviderCapability | undefined => {
      if (!isObject(item)) {
        return undefined;
      }
      const type = parseProviderCapabilityProtocol(readString(item.type) || readString(item.protocol));
      const baseUrl = readString(item.baseUrl) || readString(item.baseurl) || readString(item.api_base_url);
      if (!type || !baseUrl) {
        return undefined;
      }
      const source = readString(item.source);
      return {
        baseUrl,
        endpoint: readString(item.endpoint),
        source: source === "preset" || source === "detected" ? source : undefined,
        type
      };
    })
    .filter((item): item is GatewayProviderCapability => Boolean(item));

  return capabilities.length > 0 ? capabilities : undefined;
}

function parseProviderCapabilityProtocol(value: string | undefined): GatewayProviderCapabilityProtocol | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai_responses" || normalized === "openai") {
    return "openai_responses";
  }
  if (normalized === "openai_chat" || normalized === "openai_chat_completions") {
    return "openai_chat_completions";
  }
  if (normalized === "openai_image_generations" || normalized === "openai_images") {
    return "openai_image_generations";
  }
  if (normalized === "openai_video_generations" || normalized === "openai_videos") {
    return "openai_video_generations";
  }
  if (normalized === "xai_video_generations" || normalized === "xai_videos") {
    return "xai_video_generations";
  }
  if (normalized === "anthropic" || normalized === "anthropic_messages") {
    return "anthropic_messages";
  }
  if (normalized === "gemini" || normalized === "gemini_generate_content") {
    return "gemini_generate_content";
  }
  if (
    normalized === "gemini_interactions" ||
    normalized === "gemini-interactions" ||
    normalized === "google_interactions" ||
    normalized === "google-interactions" ||
    normalized === "interactions" ||
    normalized === "interaction"
  ) {
    return "gemini_interactions";
  }
  return undefined;
}

function parseRouter(value: unknown): Partial<RouterConfig> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const router: Partial<RouterConfig> = {};
  const builtInRules = parseRouterBuiltInRules(value.builtInRules ?? value.builtinRules ?? value.agentRules);
  if (builtInRules) {
    router.builtInRules = builtInRules;
  }
  const rules = parseRouterRules(value.rules);
  if (rules) {
    router.rules = rules;
  } else {
    router.rules = [];
  }
  const fallback = parseRouterFallback(value.fallback ?? value.failureFallback ?? value.fallbackStrategy);
  if (fallback) {
    router.fallback = fallback;
  }
  return router;
}

function parseRouterBuiltInRules(value: unknown): RouterBuiltInRulesConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  return {
    "claude-code": parseRouterBuiltInAgentRule(value["claude-code"] ?? value.claudeCode ?? value.claude),
    codex: parseRouterBuiltInAgentRule(value.codex)
  };
}

function parseRouterBuiltInAgentRule(value: unknown): { enabled: boolean } {
  if (typeof value === "boolean") {
    return { enabled: value };
  }
  if (!isObject(value)) {
    return { enabled: true };
  }
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true
  };
}

function parseRouterFallback(value: unknown): RouterFallbackConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const mode =
    parseRouterFallbackMode(value.mode) ??
    parseRouterFallbackMode(value.strategy) ??
    inferRouterFallbackMode(value);
  const retryCount = clampNumber(readNumber(value.retryCount ?? value.retries ?? value.maxRetries) ?? 1, 0, ROUTER_FALLBACK_MAX_RETRY_COUNT);
  const models = parseStringList(value.models ?? value.chain ?? value.fallbackModels)
    .map((model) => model.trim())
    .filter(Boolean);

  return {
    mode,
    models: uniqueStrings(models),
    retryCount
  };
}

function inferRouterFallbackMode(value: Record<string, unknown>): RouterFallbackMode {
  if (value.enabled === false) {
    return "off";
  }
  if (parseStringList(value.models ?? value.chain ?? value.fallbackModels).length > 0) {
    return "model-chain";
  }
  if (value.enabled === true) {
    return "retry";
  }
  return "off";
}

function parseRouterFallbackMode(value: unknown): RouterFallbackMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "off" || normalized === "disabled" || normalized === "none") {
    return "off";
  }
  if (normalized === "retry" || normalized === "retries") {
    return "retry";
  }
  if (
    normalized === "model-chain" ||
    normalized === "chain" ||
    normalized === "fallback-chain" ||
    normalized === "switch-model" ||
    normalized === "switch"
  ) {
    return "model-chain";
  }
  return undefined;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => readString(item)).filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) && typeof value !== "string") {
    return undefined;
  }
  const list = parseStringList(value);
  return list.length ? list : undefined;
}

function parseRouterRules(value: unknown): RouterRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item, index): RouterRule | undefined => {
      if (!isObject(item)) {
        return undefined;
      }
      const type = parseRouterRuleType(item.type);
      if (!type) {
        return undefined;
      }
      const id = readString(item.id) || `rule-${index + 1}`;
      if (REMOVED_LEGACY_ROUTER_RULE_IDS.has(id)) {
        return undefined;
      }
      const name = readString(item.name) || routerRuleTypeLabel(type);
      const target = readString(item.target);
      const pattern = readString(item.pattern);
      const threshold = readNumber(item.threshold);
      const condition = parseRouterRuleCondition(item.condition ?? item) ?? routerRuleConditionFromLegacy(type, {
        pattern
      });
      const rewrites = parseRouterRuleRewrites(item);
      const script = type === "script" ? parseRouterRuleScript(item.script ?? item) : undefined;
      const fallback = parseRouterFallback(item.fallback ?? item.failureFallback ?? item.fallbackStrategy);

      return {
        ...(condition ? { condition } : {}),
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
        ...(fallback ? { fallback } : {}),
        id,
        name,
        ...(pattern ? { pattern } : {}),
        ...(rewrites.length === 1 ? { rewrite: rewrites[0] } : {}),
        ...(rewrites.length > 0 ? { rewrites } : {}),
        ...(script ? { script } : {}),
        ...(target ? { target } : {}),
        ...(threshold !== undefined && threshold > 0 ? { threshold } : {}),
        type: type === "script" ? "script" : condition ? "condition" : type
      };
    })
    .filter((item): item is RouterRule => Boolean(item));
}

function parseRouterRuleType(value: unknown): RouterRuleType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "condition" ||
    normalized === "model-prefix" ||
    normalized === "script"
  ) {
    return normalized;
  }
  return undefined;
}

function parseRouterRuleScript(value: unknown): RouterRuleScript | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const file = readString(value.file ?? value.filePath ?? value.path);
  const source = typeof value.source === "string"
    ? value.source
    : typeof value.code === "string"
      ? value.code
      : undefined;
  if (!file && source === undefined) {
    return undefined;
  }
  const language = readString(value.language)?.toLowerCase();
  if (language && language !== "javascript" && language !== "js") {
    return undefined;
  }
  const apiVersion = readNumber(value.apiVersion ?? value.version) ?? ROUTER_SCRIPT_API_VERSION;
  if (apiVersion !== ROUTER_SCRIPT_API_VERSION) {
    return undefined;
  }
  const timeoutValue = readNumber(value.timeoutMs ?? value.timeout);
  const timeoutMs = timeoutValue === undefined
    ? ROUTER_SCRIPT_DEFAULT_TIMEOUT_MS
    : Math.max(10, Math.min(ROUTER_SCRIPT_MAX_TIMEOUT_MS, Math.trunc(timeoutValue)));
  return {
    apiVersion: ROUTER_SCRIPT_API_VERSION,
    ...(file ? { file } : {}),
    language: "javascript",
    ...(source !== undefined ? { source } : {}),
    timeoutMs
  };
}

function parseRouterRuleCondition(value: unknown): RouterRuleCondition | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const left =
    readString(value.left) ??
    readString(value.path) ??
    readString(value.field) ??
    readString(value.parameter);
  const operator = parseRouterRuleOperator(value.operator ?? value.op);
  const right = readConditionValue(value.right ?? value.value);

  return left && operator && right !== undefined
    ? { left, operator, right }
    : undefined;
}

function parseRouterRuleOperator(value: unknown): RouterRuleOperator | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  if (
    normalized === "==" ||
    normalized === "!=" ||
    normalized === ">" ||
    normalized === ">=" ||
    normalized === "<" ||
    normalized === "<=" ||
    normalized === "starts-with" ||
    normalized === "contains" ||
    normalized === "contains-deep" ||
    normalized === "not-contains"
  ) {
    return normalized;
  }
  return undefined;
}

function routerRuleConditionFromLegacy(
  type: RouterRuleType,
  input: { pattern?: string }
): RouterRuleCondition | undefined {
  if (type === "model-prefix" && input.pattern) {
    return {
      left: "request.body.model",
      operator: "starts-with",
      right: input.pattern
    };
  }
  return undefined;
}

function readConditionValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function parseRouterRuleRewrites(rule: Record<string, unknown>): RouterRuleRewrite[] {
  if (Array.isArray(rule.rewrites)) {
    return rule.rewrites
      .map((item) => parseRouterRuleRewrite(item))
      .filter((item): item is RouterRuleRewrite => Boolean(item));
  }
  const rewrite = parseRouterRuleRewrite(rule.rewrite ?? rule.action);
  const target = readString(rule.target);
  return [
    ...(rewrite ? [rewrite] : []),
    ...(target ? [{ key: "request.body.model", operation: "set" as const, value: target }] : [])
  ];
}

function parseRouterRuleRewrite(value: unknown): RouterRuleRewrite | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const key =
    readString(value.key) ??
    readString(value.path) ??
    readString(value.field) ??
    readString(value.parameter);
  const operation = parseRouterRewriteOperation(value.operation ?? value.op ?? value.type) ?? "set";
  const rewriteValue = readRewriteValue(value.value);
  const match = readRewriteValue(value.match);

  if (!key) {
    return undefined;
  }
  if (operation === "delete") {
    return { key, operation };
  }
  if (operation === "array-replace") {
    return match !== undefined && rewriteValue !== undefined
      ? { key, match, operation, value: rewriteValue }
      : undefined;
  }
  return rewriteValue !== undefined
    ? { key, operation, value: rewriteValue }
    : undefined;
}

function parseRouterRewriteOperation(value: unknown): RouterRuleRewriteOperation | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "set" ||
    normalized === "delete" ||
    normalized === "array-append" ||
    normalized === "array-prepend" ||
    normalized === "array-remove" ||
    normalized === "array-replace"
  ) {
    return normalized;
  }
  return undefined;
}

function readRewriteValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function routerRuleTypeLabel(type: RouterRuleType): string {
  return type === "condition" ? "Condition" : type === "script" ? "JavaScript" : "Legacy";
}

function parseAgent(value: unknown, legacyMcpServers?: unknown): Partial<GatewayAgentConfig> | undefined {
  const raw = isObject(value) ? value : {};
  const mcpServers = parseMcpServers(raw.mcpServers ?? legacyMcpServers);
  if (!mcpServers) {
    return undefined;
  }
  return { mcpServers };
}

function parseBotGateway(value: unknown): LoadedBotGatewayConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const config: LoadedBotGatewayConfig = {};
  if (typeof value.enabled === "boolean") {
    config.enabled = value.enabled;
  }
  const sourceDir = readString(value.sourceDir) || readString(value.source_dir) || readString(value.projectDir) || readString(value.project_dir);
  if (sourceDir) {
    config.sourceDir = sourceDir;
  }
  const command = readString(value.command);
  if (command) {
    config.command = command;
  }
  const args = parseStringArray(value.args);
  if (args) {
    config.args = args;
  }
  const cwd = readString(value.cwd) || readString(value.rootDir) || readString(value.root_dir);
  if (cwd) {
    config.cwd = cwd;
  }
  const stateDir = readString(value.stateDir) || readString(value.state_dir);
  if (stateDir) {
    config.stateDir = stateDir;
  }
  const tenantId = readString(value.tenantId) || readString(value.tenant_id);
  if (tenantId) {
    config.tenantId = tenantId;
  }
  const integrationId = readString(value.integrationId) || readString(value.integration_id);
  if (integrationId) {
    config.integrationId = integrationId;
  }
  const platform = readString(value.platform);
  if (platform) {
    config.platform = platform;
  }
  const authType = readString(value.authType) || readString(value.auth_type);
  if (authType) {
    config.authType = authType;
  }
  const credentials = parseUnknownRecord(value.credentials) || parseUnknownRecord(value.authFields) || parseUnknownRecord(value.auth_fields);
  if (credentials) {
    config.credentials = credentials;
  }
  const integrationConfig = parseUnknownRecord(value.integrationConfig) || parseUnknownRecord(value.config);
  if (integrationConfig) {
    config.integrationConfig = integrationConfig;
  }
  const conversationRef = parseBotGatewayConversation(value.conversationRef ?? value.conversation_ref ?? value.conversation);
  if (conversationRef) {
    config.conversationRef = conversationRef;
  }
  if (typeof value.createIntegration === "boolean") {
    config.createIntegration = value.createIntegration;
  } else if (typeof value.create_integration === "boolean") {
    config.createIntegration = value.create_integration;
  }
  if (typeof value.autoStartIntegration === "boolean") {
    config.autoStartIntegration = value.autoStartIntegration;
  } else if (typeof value.auto_start_integration === "boolean") {
    config.autoStartIntegration = value.auto_start_integration;
  }
  if (typeof value.acknowledgeEvents === "boolean") {
    config.acknowledgeEvents = value.acknowledgeEvents;
  } else if (typeof value.acknowledge_events === "boolean") {
    config.acknowledgeEvents = value.acknowledge_events;
  }
  if (typeof value.forwardAllAgentMessages === "boolean") {
    config.forwardAllAgentMessages = value.forwardAllAgentMessages;
  } else if (typeof value.forward_all_agent_messages === "boolean" || typeof value.forward_all_codex_messages === "boolean") {
    config.forwardAllAgentMessages = Boolean(value.forward_all_agent_messages ?? value.forward_all_codex_messages);
  }

  if (typeof value.mediaEnabled === "boolean") {
    config.mediaEnabled = value.mediaEnabled;
  }
  if (typeof value.streamReplies === "boolean") {
    config.streamReplies = value.streamReplies;
  }
  if (typeof value.shellEnabled === "boolean") {
    config.shellEnabled = value.shellEnabled;
  } else if (typeof value.shell_enabled === "boolean") {
    config.shellEnabled = value.shell_enabled;
  }
  const language = readString(value.language);
  if (language === "auto" || language === "en" || language === "zh-CN") {
    config.language = language;
  }

  const requestTimeoutMs = readNumber(value.requestTimeoutMs ?? value.request_timeout_ms);
  if (requestTimeoutMs !== undefined) {
    config.requestTimeoutMs = clampNumber(requestTimeoutMs, 1000, 3_600_000);
  }
  const startupTimeoutMs = readNumber(value.startupTimeoutMs ?? value.startup_timeout_ms);
  if (startupTimeoutMs !== undefined) {
    config.startupTimeoutMs = clampNumber(startupTimeoutMs, 1000, 120_000);
  }
  const pollIntervalMs = readNumber(value.pollIntervalMs ?? value.poll_interval_ms);
  if (pollIntervalMs !== undefined) {
    config.pollIntervalMs = clampNumber(pollIntervalMs, 500, 60_000);
  }
  const maxTurnTimeMs = readNumber(value.maxTurnTimeMs ?? value.max_turn_time_ms);
  if (maxTurnTimeMs !== undefined) {
    config.maxTurnTimeMs = clampNumber(maxTurnTimeMs, 10_000, 3_600_000);
  }
  const maxAttachmentBytes = readNumber(value.maxAttachmentBytes ?? value.max_attachment_bytes);
  if (maxAttachmentBytes !== undefined) {
    config.maxAttachmentBytes = clampNumber(maxAttachmentBytes, 1024, 100 * 1024 * 1024);
  }
  const messageChunkChars = readNumber(value.messageChunkChars ?? value.message_chunk_chars);
  if (messageChunkChars !== undefined) {
    config.messageChunkChars = clampNumber(messageChunkChars, 500, 20_000);
  }
  const sessionIdleMinutes = readNumber(value.sessionIdleMinutes ?? value.session_idle_minutes);
  if (sessionIdleMinutes !== undefined) {
    config.sessionIdleMinutes = clampNumber(sessionIdleMinutes, 0, 43_200);
  }

  const handoff = parseBotGatewayHandoff(value.handoff);
  if (handoff) {
    config.handoff = handoff;
  }

  return config;
}

function parseBotGatewaySavedConfigs(value: unknown): BotGatewaySavedConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result: BotGatewaySavedConfig[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (!isObject(item)) {
      return;
    }
    const rawBot = item.botGateway ?? item.bot_gateway ?? item.bot ?? item.config;
    const parsedBot = parseBotGateway(rawBot);
    if (!parsedBot) {
      return;
    }
    const botGateway = completeBotGatewayConfig(parsedBot);
    if (!botGateway.enabled || !botGateway.platform || botGateway.platform === "none") {
      return;
    }
    const fallbackId = botGateway.integrationId || `bot-${index + 1}`;
    const id = readString(item.id) || readString(item.savedConfigId) || readString(item.saved_config_id) || fallbackId;
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    result.push({
      botGateway,
      id,
      name: readString(item.name) || botGateway.platform || id,
      ...(readString(item.updatedAt) || readString(item.updated_at)
        ? { updatedAt: readString(item.updatedAt) || readString(item.updated_at) }
        : {})
    });
  });
  return result;
}

function parseBotGatewayHandoff(value: unknown): Partial<BotGatewayRuntimeConfig["handoff"]> | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const handoff: Partial<BotGatewayRuntimeConfig["handoff"]> = {};
  if (typeof value.enabled === "boolean") {
    handoff.enabled = value.enabled;
  }
  const idleSeconds = readNumber(value.idleSeconds ?? value.idle_seconds);
  if (idleSeconds !== undefined) {
    handoff.idleSeconds = clampNumber(idleSeconds, 30, 86_400);
  }
  if (typeof value.screenLock === "boolean") {
    handoff.screenLock = value.screenLock;
  } else if (typeof value.screen_lock === "boolean") {
    handoff.screenLock = value.screen_lock;
  }
  if (typeof value.userIdle === "boolean") {
    handoff.userIdle = value.userIdle;
  } else if (typeof value.user_idle === "boolean") {
    handoff.userIdle = value.user_idle;
  }
  const phoneWifiTargets = parseStringArray(value.phoneWifiTargets ?? value.phone_wifi_targets);
  if (phoneWifiTargets) {
    handoff.phoneWifiTargets = uniqueStrings(phoneWifiTargets).slice(0, 1);
  }
  const phoneBluetoothTargets = parseStringArray(value.phoneBluetoothTargets ?? value.phone_bluetooth_targets);
  if (phoneBluetoothTargets) {
    handoff.phoneBluetoothTargets = uniqueStrings(phoneBluetoothTargets).slice(0, 1);
  }
  return Object.keys(handoff).length ? handoff : undefined;
}

function parseBotGatewayConversation(value: unknown): BotGatewayRuntimeConfig["conversationRef"] | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const platformConversationId =
    readString(value.platformConversationId) ||
    readString(value.platform_conversation_id) ||
    readString(value.conversationId) ||
    readString(value.chatId) ||
    readString(value.channelId);
  const gatewayConversationId = readString(value.gatewayConversationId) || readString(value.gateway_conversation_id);
  if (!platformConversationId && !gatewayConversationId) {
    return undefined;
  }
  const type = parseEnumValue(value.type, ["dm", "group", "channel", "thread"], "dm");
  const threadId = readString(value.threadId) || readString(value.thread_id);
  return {
    ...(gatewayConversationId ? { gatewayConversationId } : {}),
    ...(platformConversationId ? { platformConversationId } : {}),
    ...(threadId ? { threadId } : {}),
    type
  };
}

function parseMcpServers(value: unknown): GatewayMcpServerConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const servers = value
    .map((item, index): GatewayMcpServerConfig | undefined => {
      if (!isObject(item)) {
        return undefined;
      }

      const transport = parseMcpServerTransport(item.transport ?? item.type);
      const name = readString(item.name) || (transport !== "stdio" ? readString(item.url) : readString(item.command)) || `mcp-${index + 1}`;
      const protocolVersion = readString(item.protocolVersion) || "2024-11-05";
      const startupTimeoutMs = clampNumber(readNumber(item.startupTimeoutMs) ?? 600000, 100, 600000);
      const requestTimeoutMs = clampNumber(readNumber(item.requestTimeoutMs) ?? 30000, 100, 600000);

      if (transport !== "stdio") {
        const url = readString(item.url);
        if (!url) {
          return undefined;
        }
        return {
          ...(readString(item.apiKey) ? { apiKey: readString(item.apiKey) } : {}),
          ...(readString(item.apiKeyEnv) ? { apiKeyEnv: readString(item.apiKeyEnv) } : {}),
          headers: parseStringRecord(item.headers) ?? {},
          name,
          protocolVersion,
          requestTimeoutMs,
          startupTimeoutMs,
          transport,
          url
        };
      }

      const command = readString(item.command);
      if (!command) {
        return undefined;
      }
      const stdioMessageMode = readString(item.stdioMessageMode) === "newline-json" ? "newline-json" : "content-length";
      return {
        args: parseStringList(item.args),
        command,
        ...(readString(item.cwd) ? { cwd: readString(item.cwd) } : {}),
        env: parseStringRecord(item.env) ?? {},
        name,
        protocolVersion,
        requestTimeoutMs,
        startupTimeoutMs,
        stdioMessageMode,
        transport
      };
    })
    .filter((item): item is GatewayMcpServerConfig => Boolean(item));

  return servers.length ? servers : undefined;
}

function parseMcpServerTransport(value: unknown): GatewayMcpServerTransport {
  const normalized = readString(value)
    ?.toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  if (normalized === "sse") {
    return "sse";
  }
  if (normalized === "http" || normalized === "streamable-http" || normalized === "streamablehttp" || normalized === "streamble-http" || normalized === "websocket") {
    return "streamable-http";
  }
  return "stdio";
}

function parseProxy(value: unknown): Partial<ProxyRuntimeConfig> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const proxy: Partial<ProxyRuntimeConfig> = {};
  const captureNetwork = typeof value.captureNetwork === "boolean"
    ? value.captureNetwork
    : typeof value.networkCaptureEnabled === "boolean"
      ? value.networkCaptureEnabled
      : undefined;
  if (captureNetwork !== undefined) {
    proxy.captureNetwork = captureNetwork;
  }
  const browserMode = typeof value.browserMode === "boolean"
    ? value.browserMode
    : typeof value.builtInBrowser === "boolean"
      ? value.builtInBrowser
      : typeof value.builtInBrowserMode === "boolean"
        ? value.builtInBrowserMode
        : undefined;
  if (browserMode !== undefined) {
    proxy.browserMode = browserMode;
  }
  if (typeof value.enabled === "boolean") {
    proxy.enabled = value.enabled;
  }
  if (typeof value.host === "string" && value.host.trim()) {
    proxy.host = value.host.trim();
  }
  const proxyPort = readPort(value.port);
  if (proxyPort) {
    proxy.port = proxyPort;
  }
  if (value.mode === "gateway" || value.mode === "transparent") {
    proxy.mode = value.mode;
  }
  if (typeof value.systemProxy === "boolean") {
    proxy.systemProxy = value.systemProxy;
  } else if (typeof value.systemProxyEnabled === "boolean") {
    proxy.systemProxy = value.systemProxyEnabled;
  }
  const upstream = parseProxyUpstream(value.upstream ?? value.upstreamProxy ?? value.outboundProxy);
  if (upstream) {
    proxy.upstream = upstream;
  }
  const targets = parseProxyTargets(value.targets);
  if (targets) {
    proxy.targets = targets;
  }
  return proxy;
}

function parseProxyUpstream(value: unknown): ProxyRuntimeConfig["upstream"] | undefined {
  const fallback = DEFAULT_CONFIG.proxy.upstream;
  if (typeof value === "string") {
    const mode = parseProxyUpstreamMode(value);
    return mode ? { ...fallback, mode } : undefined;
  }
  if (!isObject(value)) {
    return undefined;
  }

  const mode = parseProxyUpstreamMode(value.mode ?? value.type);
  const customInput = isObject(value.custom) ? value.custom : value;
  const server = readString(customInput.server ?? customInput.host ?? customInput.hostname);
  const port = readPort(customInput.port);
  const username = readString(customInput.username ?? customInput.user);
  const password = typeof customInput.password === "string"
    ? customInput.password
    : typeof customInput.pass === "string"
      ? customInput.pass
      : undefined;
  const hasCustomInput = server !== undefined || port !== undefined || username !== undefined || password !== undefined;

  return {
    ...fallback,
    custom: {
      ...fallback.custom,
      ...(server !== undefined ? { server } : {}),
      ...(port !== undefined ? { port } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(password !== undefined ? { password } : {})
    },
    mode: mode ?? (hasCustomInput ? "custom" : fallback.mode)
  };
}

function parseProxyUpstreamMode(value: unknown): ProxyRuntimeConfig["upstream"]["mode"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["none", "off", "disabled", "direct", "noproxy"].includes(normalized)) {
    return "none";
  }
  if (["system", "systemproxy", "os", "osproxy", "env", "environment"].includes(normalized)) {
    return "system";
  }
  if (["custom", "manual", "http", "httpproxy"].includes(normalized)) {
    return "custom";
  }
  return undefined;
}

function parseProxyTargets(value: unknown): ProxyRouteTarget[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const targets = value
    .map((item): ProxyRouteTarget | undefined => {
      if (typeof item === "string" && item.trim()) {
        return { host: item.trim().toLowerCase() };
      }
      if (!isObject(item)) {
        return undefined;
      }
      const host = readString(item.host)?.toLowerCase();
      if (!host) {
        return undefined;
      }
      const paths = Array.isArray(item.paths)
        ? item.paths.map((path) => readString(path)).filter((path): path is string => Boolean(path))
        : undefined;
      return {
        host,
        paths: paths?.length ? paths : undefined
      };
    })
    .filter((item): item is ProxyRouteTarget => Boolean(item));

  return targets.length ? targets : undefined;
}

function parseGatewayPlugins(value: unknown): GatewayPluginConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const plugins = value
    .map((item, index): GatewayPluginConfig | undefined => {
      if (!isObject(item)) {
        return undefined;
      }

      const id = readString(item.id) || readString(item.key) || `plugin-${index + 1}`;
      const modulePath = readString(item.module) || readString(item.path);
      const apps = parseGatewayPluginApps(item.apps);
      const proxyRoutes = parseGatewayPluginProxyRoutes(isObject(item.proxy) ? item.proxy.routes : undefined);
      const coreGateway = parseGatewayPluginCoreGateway(item.coreGateway);

      return {
        ...(apps ? { apps } : {}),
        ...(item.config !== undefined ? { config: item.config } : {}),
        ...(coreGateway ? { coreGateway } : {}),
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
        id,
        ...(modulePath ? { module: modulePath } : {}),
        ...(proxyRoutes ? { proxy: { routes: proxyRoutes } } : {})
      };
    })
    .filter((item): item is GatewayPluginConfig => Boolean(item));

  return plugins.length ? plugins : undefined;
}

function parseGatewayPluginApps(value: unknown): GatewayPluginAppConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const apps = value
    .map((item, index): GatewayPluginAppConfig | undefined => {
      if (!isObject(item)) {
        return undefined;
      }
      const name = readString(item.name) || readString(item.title);
      const url = readString(item.url) || readString(item.href) || readString(item.target);
      if (!name || !url) {
        return undefined;
      }
      return {
        ...(readString(item.description) ? { description: readString(item.description) } : {}),
        ...(readString(item.icon) ? { icon: readString(item.icon) } : {}),
        id: readString(item.id) || `app-${index + 1}`,
        name,
        url
      };
    })
    .filter((item): item is GatewayPluginAppConfig => Boolean(item));

  return apps.length ? apps : undefined;
}

function parseGatewayPluginProxyRoutes(value: unknown): GatewayPluginProxyRouteConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const routes = value
    .map((item, index): GatewayPluginProxyRouteConfig | undefined => {
      if (!isObject(item)) {
        return undefined;
      }
      const host = readString(item.host)?.toLowerCase();
      const upstream = readString(item.upstream) || readString(item.target) || readString(item.backend);
      if (!host || !upstream) {
        return undefined;
      }
      const paths = Array.isArray(item.paths)
        ? item.paths.map((path) => readString(path)).filter((path): path is string => Boolean(path))
        : undefined;
      const headers = parseStringRecord(item.headers);
      const stripPathPrefix =
        typeof item.stripPathPrefix === "boolean" || typeof item.stripPathPrefix === "string"
          ? item.stripPathPrefix
          : undefined;
      const rewritePathPrefix = readString(item.rewritePathPrefix);

      return {
        ...(headers ? { headers } : {}),
        host,
        id: readString(item.id) || `route-${index + 1}`,
        ...(paths?.length ? { paths } : {}),
        ...(typeof item.preserveHost === "boolean" ? { preserveHost: item.preserveHost } : {}),
        ...(rewritePathPrefix ? { rewritePathPrefix } : {}),
        ...(stripPathPrefix !== undefined ? { stripPathPrefix } : {}),
        upstream
      };
    })
    .filter((item): item is GatewayPluginProxyRouteConfig => Boolean(item));

  return routes.length ? routes : undefined;
}

function parseGatewayPluginCoreGateway(value: unknown): GatewayPluginConfig["coreGateway"] | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const providerPlugins = Array.isArray(value.providerPlugins) ? value.providerPlugins : undefined;
  const virtualModelProfiles = Array.isArray(value.virtualModelProfiles)
    ? value.virtualModelProfiles as NonNullable<GatewayPluginConfig["coreGateway"]>["virtualModelProfiles"]
    : undefined;
  const config = isObject(value.config) ? { ...(value.config as Record<string, unknown>) } : undefined;

  if (!providerPlugins && !virtualModelProfiles && !config) {
    return undefined;
  }

  return {
    ...(config ? { config } : {}),
    ...(providerPlugins ? { providerPlugins } : {}),
    ...(virtualModelProfiles ? { virtualModelProfiles } : {})
  };
}

function parseProfile(value: unknown): LoadedProfileConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const profile: LoadedProfileConfig = {};
  if (typeof value.enabled === "boolean") {
    profile.enabled = value.enabled;
  }

  const claudeCode = isObject(value.claudeCode) ? value.claudeCode : isObject(value.claude) ? value.claude : undefined;
  if (claudeCode) {
    profile.claudeCode = {};
    if (typeof claudeCode.enabled === "boolean") {
      profile.claudeCode.enabled = claudeCode.enabled;
    }
    const settingsFile = readString(claudeCode.settingsFile) || readString(claudeCode.configFile) || readString(claudeCode.path);
    if (settingsFile) {
      profile.claudeCode.settingsFile = settingsFile;
    }
    const model = readString(claudeCode.model);
    if (model !== undefined) {
      profile.claudeCode.model = model;
    }
    const smallFastModel = readString(claudeCode.smallFastModel) || readString(claudeCode.smallModel);
    if (smallFastModel !== undefined) {
      profile.claudeCode.smallFastModel = smallFastModel;
    }
  }

  const codex = isObject(value.codex) ? value.codex : undefined;
  if (codex) {
    profile.codex = {};
    if (typeof codex.enabled === "boolean") {
      profile.codex.enabled = codex.enabled;
    }
    if (typeof codex.cliMiddleware === "boolean") {
      profile.codex.cliMiddleware = codex.cliMiddleware;
    }
    const codexCliPath = readString(codex.codexCliPath) || readString(codex.cliPath) || readString(codex.codexPath);
    if (codexCliPath) {
      profile.codex.codexCliPath = codexCliPath;
    }
    const codexHome = readString(codex.codexHome) || readString(codex.home);
    if (codexHome) {
      profile.codex.codexHome = codexHome;
    }
    const configFormat = parseCodexProfileConfigFormat(readString(codex.configFormat) || readString(codex.profileConfigFormat));
    if (configFormat) {
      profile.codex.configFormat = configFormat;
    }
    const remoteFrontendMode = parseCodexRemoteFrontendMode(
      readString(codex.remoteFrontendMode) || readString(codex.frontendMode) || readString(codex.coreMode)
    );
    if (remoteFrontendMode) {
      profile.codex.remoteFrontendMode = remoteFrontendMode;
    }
    const configFile = readString(codex.configFile) || readString(codex.settingsFile) || readString(codex.path);
    if (configFile) {
      profile.codex.configFile = configFile;
    }
    const model = readString(codex.model);
    if (model !== undefined) {
      profile.codex.model = model;
    }
    const providerId = readString(codex.providerId) || readString(codex.provider);
    if (providerId) {
      profile.codex.providerId = providerId;
    }
    const providerName = readString(codex.providerName) || readString(codex.name);
    if (providerName) {
      profile.codex.providerName = providerName;
    }
    const showAllSessions = typeof codex.showAllSessions === "boolean"
      ? codex.showAllSessions
      : typeof codex.show_all_sessions === "boolean"
        ? codex.show_all_sessions
        : undefined;
    if (showAllSessions !== undefined) {
      profile.codex.showAllSessions = showAllSessions;
    }
  }

  const profiles = parseProfileConfigs(value.profiles);
  if (profiles) {
    profile.profiles = profiles;
  } else {
    const legacyProfiles: ProfileConfig[] = [];
    if (profile.claudeCode) {
      legacyProfiles.push(profileFromClaudeCodeConfig({
        ...DEFAULT_CONFIG.profile.claudeCode,
        ...profile.claudeCode
      }));
    }
    if (profile.codex) {
      legacyProfiles.push(profileFromCodexConfig({
        ...DEFAULT_CONFIG.profile.codex,
        ...profile.codex
      }));
    }
    if (legacyProfiles.length) {
      profile.profiles = legacyProfiles;
    }
  }

  return profile;
}

export function parseProfileConfigs(value: unknown): ProfileConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item, index): ProfileConfig | undefined => {
      if (!isObject(item)) {
        return undefined;
      }
      const agent = parseProfileAgent(item.agent);
      if (!agent) {
        return undefined;
      }
      const enabled = typeof item.enabled === "boolean" ? item.enabled : true;
      const id = readString(item.id) || `profile-${index + 1}`;
      const name = readString(item.name) || defaultProfileAgentName(agent);
      const model = readString(item.model) ?? "";
      const availableModels = uniqueStrings([
        model,
        ...parseStringList(item.availableModels ?? item.available_models ?? item.models)
      ]);
      const env = parseStringRecord(item.env) ?? {};
      const parsedSurface = parseProfileSurface(readString(item.surface) || readString(item.entry) || readString(item.frontend)) || "auto";
      const surface = agent === "zcode" ? "app" : parsedSurface;
      const botConfigId = surface !== "cli"
        ? readString(item.botConfigId) || readString(item.bot_config_id) || readString(item.savedBotConfigId) || readString(item.saved_bot_config_id)
        : "";
      const parsedBotGateway = parseBotGateway(item.botGateway ?? item.bot_gateway ?? item.bot);
      const botGateway = surface !== "cli" && parsedBotGateway ? completeBotGatewayConfig(parsedBotGateway) : undefined;

      if (agent === "claude-code") {
        const appPath = readProfileAppPath(item, agent);
        const scope = parseProfileScope(readString(item.scope) || readString(item.applyScope) || readString(item.effectScope)) || "global";
        const claudeConfigMode = scope === "ccr" && surface === "cli"
          ? normalizeClaudeCodeConfigModeValue(item.claudeConfigMode)
          : "isolated";
        return {
          agent,
          ...(appPath ? { appPath } : {}),
          ...(botConfigId ? { botConfigId } : {}),
          ...(botGateway ? { botGateway } : {}),
          claudeConfigMode,
          enabled,
          env: claudeCodeProfileEnv(env),
          id,
          model,
          name,
          scope,
          settingsFile: readString(item.settingsFile) || readString(item.configFile) || "~/.claude/settings.json",
          smallFastModel: readString(item.smallFastModel) || readString(item.smallModel) || "",
          surface
        };
      }

      if (agent === "grok" || agent === "kimi") {
        return {
          agent,
          ...(agent === "kimi" ? { availableModels } : {}),
          enabled,
          env: codexCompatibleProfileEnv(env),
          id,
          model,
          name,
          scope: "ccr",
          surface: "cli"
        };
      }

      const appPath = readProfileAppPath(item, agent);
      return {
        agent,
        ...(appPath ? { appPath } : {}),
        ...(botConfigId ? { botConfigId } : {}),
        ...(botGateway ? { botGateway } : {}),
        cliMiddleware: true,
        codexCliPath: readString(item.codexCliPath) || readString(item.cliPath) || readString(item.codexPath) || "",
        codexHome: readString(item.codexHome) || readString(item.home) || "",
        configFormat: parseCodexProfileConfigFormat(readString(item.configFormat) || readString(item.profileConfigFormat)) || "separate_profile_files",
        configFile: normalizeCodexConfigFileForAgent(agent, readString(item.configFile) || readString(item.settingsFile)),
        enabled,
        env: codexCompatibleProfileEnv(env),
        id,
        model,
        name,
        providerId: readString(item.providerId) || readString(item.provider) || "claude-code-router",
        providerName: readString(item.providerName) || "Claude Code Router",
        remoteFrontendMode: parseCodexRemoteFrontendMode(readString(item.remoteFrontendMode) || readString(item.frontendMode) || readString(item.coreMode)) || "app",
        scope: parseProfileScope(readString(item.scope) || readString(item.applyScope) || readString(item.effectScope)) || "global",
        showAllSessions: agent === "zcode" || agent === "opencode"
          ? false
          : typeof item.showAllSessions === "boolean"
            ? item.showAllSessions
            : typeof item.show_all_sessions === "boolean"
              ? item.show_all_sessions
              : false,
        surface
      };
    })
    .filter((item): item is ProfileConfig => Boolean(item));
}

function readProfileAppPath(item: Record<string, unknown>, agent: ProfileConfig["agent"]): string | undefined {
  return readString(item.appPath) ||
    readString(item.app_path) ||
    readString(item.appExecutablePath) ||
    readString(item.app_executable_path) ||
    (agent === "claude-code"
      ? readString(item.claudeAppPath) || readString(item.claude_app_path)
      : agent === "codex"
        ? readString(item.chatgptAppPath) || readString(item.chatgpt_app_path) || readString(item.codexAppPath) || readString(item.codex_app_path)
        : agent === "opencode"
          ? readString(item.openCodeAppPath) || readString(item.opencodeAppPath) || readString(item.opencode_app_path)
        : readString(item.zcodeAppPath) || readString(item.zcode_app_path));
}

function parseProfileAgent(value: unknown): ProfileConfig["agent"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "claude" || normalized === "claude-code" || normalized === "claude code") {
    return "claude-code";
  }
  if (normalized === "codex") {
    return "codex";
  }
  if (normalized === "grok" || normalized === "grok-cli" || normalized === "grok cli") {
    return "grok";
  }
  if (normalized === "kimi" || normalized === "kimi-cli" || normalized === "kimi cli" || normalized === "kimi-code" || normalized === "kimi code") {
    return "kimi";
  }
  if (normalized === "opencode" || normalized === "open-code" || normalized === "open code") {
    return "opencode";
  }
  if (normalized === "zcode" || normalized === "z-code" || normalized === "z code") {
    return "zcode";
  }
  return undefined;
}

function defaultProfileAgentName(agent: ProfileConfig["agent"]): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  if (agent === "zcode") {
    return "ZCode";
  }
  if (agent === "grok") {
    return "Grok CLI";
  }
  if (agent === "kimi") {
    return "Kimi CLI";
  }
  if (agent === "opencode") {
    return "OpenCode";
  }
  return "Codex";
}

function defaultCodexConfigFile(agent: ProfileConfig["agent"]): string {
  return agent === "zcode"
    ? "~/.zcode/cli/config.json"
    : agent === "opencode"
      ? "~/.config/opencode/opencode.jsonc"
      : "~/.codex/config.toml";
}

function normalizeCodexConfigFileForAgent(agent: ProfileConfig["agent"], value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || (agent === "zcode" && trimmed === "~/.zcode/config.toml")) {
    return defaultCodexConfigFile(agent);
  }
  return trimmed;
}

function profileFromClaudeCodeConfig(config: ClaudeCodeProfileConfig): ProfileConfig {
  return {
    agent: "claude-code",
    claudeConfigMode: "isolated",
    enabled: config.enabled,
    env: claudeCodeProfileEnv(),
    id: "default-claude-code",
    model: config.model,
    name: "Claude Code",
    scope: "global",
    settingsFile: config.settingsFile,
    smallFastModel: config.smallFastModel,
    surface: "auto"
  };
}

function claudeCodeProfileEnv(env: Record<string, string> = {}): Record<string, string> {
  return {
    ...CLAUDE_CODE_DEFAULT_ENV,
    ...env
  };
}

function codexCompatibleProfileEnv(env: Record<string, string>): Record<string, string> {
  const { [CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV]: _ignored, ...result } = env;
  return result;
}

function profileFromCodexConfig(config: CodexProfileConfig): ProfileConfig {
  return {
    agent: "codex",
    cliMiddleware: true,
    codexCliPath: config.codexCliPath,
    codexHome: config.codexHome,
    configFormat: config.configFormat,
    configFile: config.configFile,
    enabled: config.enabled,
    env: {},
    id: "default-codex",
    model: config.model,
    name: "Codex",
    providerId: config.providerId,
    providerName: config.providerName,
    remoteFrontendMode: config.remoteFrontendMode,
    scope: "global",
    showAllSessions: config.showAllSessions,
    surface: "auto"
  };
}

function parseProfileScope(value: string | undefined): ProfileConfig["scope"] | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (normalized === "ccr" || normalized === "managed" || normalized === "local" || normalized === "ccr-only" || normalized === "only-ccr") {
    return "ccr";
  }
  if (normalized === "global" || normalized === "system" || normalized === "system-default" || normalized === "default") {
    return "global";
  }
  if (normalized === "custom" || normalized === "custom-path" || normalized === "custom-config") {
    return "custom";
  }
  return undefined;
}

function parseProfileSurface(value: string | undefined): ProfileConfig["surface"] | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (normalized === "auto" || normalized === "automatic") {
    return "auto";
  }
  if (normalized === "cli" || normalized === "command-line") {
    return "cli";
  }
  if (normalized === "app" || normalized === "desktop" || normalized === "desktop-app") {
    return "app";
  }
  return undefined;
}

function parseCodexProfileConfigFormat(value: string | undefined): "legacy" | "separate_profile_files" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  if (normalized === "legacy" || normalized === "profiles" || normalized === "profile_table" || normalized === "profiles_table") {
    return "separate_profile_files";
  }
  if (normalized === "separate" || normalized === "separate_profile_files" || normalized === "profile_files" || normalized === "profile_file" || normalized === "new") {
    return "separate_profile_files";
  }
  return undefined;
}

function parseCodexRemoteFrontendMode(value: string | undefined): "app" | "cli" | "claude-code" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (normalized === "app" || normalized === "codex-app") {
    return "app";
  }
  if (normalized === "cli" || normalized === "codex-cli") {
    return "cli";
  }
  if (normalized === "claude-code" || normalized === "claude") {
    return "claude-code";
  }
  return undefined;
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const normalizedValue = readString(rawValue);
    if (normalizedKey && normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function parseUnknownRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  return { ...value };
}

function parseApiKeys(value: unknown): ApiKeyConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const keys = value
    .map((item, index) => parseApiKeyConfig(item, index))
    .filter((item): item is ApiKeyConfig => Boolean(item));
  return uniqueApiKeyConfigs(keys);
}

function parseApiKeyConfig(value: unknown, index: number): ApiKeyConfig | undefined {
  if (typeof value === "string") {
    const key = readString(value);
    return key ? createApiKeyConfig(key, index) : undefined;
  }
  if (!isObject(value)) {
    return undefined;
  }

  const key = readString(value.key) || readString(value.value) || readString(value.APIKEY);
  if (!key) {
    return undefined;
  }

  const createdAt = readString(value.createdAt) || new Date(0).toISOString();
  const expiresAt = readString(value.expiresAt);
  const limits = parseApiKeyLimits(value.limits);
  const name = readString(value.name);
  return {
    createdAt,
    ...(expiresAt ? { expiresAt } : {}),
    id: readString(value.id) || `key-${index + 1}`,
    key,
    ...(limits ? { limits } : {}),
    ...(name ? { name } : {})
  };
}

function parseApiKeyLimits(value: unknown): ApiKeyLimitConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const limits: ApiKeyLimitConfig = {};
  for (const key of ["ipd", "iph", "ipm", "maxRequests", "maxTokens", "quotaWindowMs", "rpd", "rph", "rpm", "tpd", "tph", "tpm", "windowMs"] as const) {
    const limit = readNumber(value[key]);
    if (limit !== undefined && limit > 0) {
      limits[key] = limit;
    }
  }
  return Object.keys(limits).length ? limits : undefined;
}

function normalizeApiKeys(value: ApiKeyConfig[] | undefined, legacyKey: string | undefined): ApiKeyConfig[] {
  return uniqueApiKeyConfigs([...(value ?? []), ...(legacyKey ? [createApiKeyConfig(legacyKey, value?.length ?? 0)] : [])]);
}

function ensureGatewayApiKeys(apiKeys: ApiKeyConfig[]): ApiKeyConfig[] {
  return apiKeys.length ? apiKeys : [createGeneratedGatewayApiKey()];
}

function createGeneratedGatewayApiKey(): ApiKeyConfig {
  return {
    createdAt: new Date().toISOString(),
    id: GENERATED_GATEWAY_API_KEY_ID,
    key: `sk-ccr-${randomBytes(32).toString("base64url")}`,
    name: "Local Gateway"
  };
}

function createApiKeyConfig(key: string, index: number): ApiKeyConfig {
  return {
    createdAt: new Date(0).toISOString(),
    id: `key-${index + 1}`,
    key: key.trim(),
    name: `API Key ${index + 1}`
  };
}

function uniqueApiKeyConfigs(values: Array<ApiKeyConfig | undefined>): ApiKeyConfig[] {
  const seen = new Set<string>();
  const result: ApiKeyConfig[] = [];
  for (const value of values) {
    const trimmed = value?.key.trim();
    if (!value || !trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push({
      createdAt: value.createdAt,
      ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
      id: value.id,
      key: trimmed,
      ...(value.limits ? { limits: value.limits } : {}),
      ...(value.name ? { name: value.name } : {})
    });
  }
  return result;
}

function hasConfigFileApiKeys(value: Partial<AppConfig>): boolean {
  const record = value as Record<string, unknown>;
  if (typeof record.APIKEY === "string" && record.APIKEY.trim()) {
    return true;
  }

  const values = record.APIKEYS ?? record.apiKeys;
  if (!Array.isArray(values)) {
    return false;
  }

  return values.some((item) => {
    if (typeof item === "string") {
      return Boolean(item.trim());
    }
    if (!isObject(item)) {
      return false;
    }
    return Boolean(readString(item.key) || readString(item.value) || readString(item.APIKEY));
  });
}

function isDefaultSeedApiKey(apiKey: ApiKeyConfig): boolean {
  return (
    apiKey.key === "sk-123" &&
    apiKey.createdAt === new Date(0).toISOString() &&
    (apiKey.id === "key-1" || apiKey.id === "legacy") &&
    (!apiKey.name || apiKey.name === "API Key 1")
  );
}

export function interpolateRawAppConfigEnvVars(value: unknown, source: RawAppConfigSource): unknown {
  return source === "legacy-json" ? interpolateEnvVars(value) : value;
}

function interpolateEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, unbraced) => {
      const envName = braced || unbraced;
      return process.env[envName] ?? match;
    });
  }

  if (Array.isArray(value)) {
    return value.map(interpolateEnvVars);
  }

  if (isObject(value)) {
    const mapped: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      mapped[key] = interpolateEnvVars(item);
    }
    return mapped;
  }

  return value;
}

function endpointPort(endpoint: string | undefined): number | undefined {
  if (!endpoint) {
    return undefined;
  }
  try {
    return readPort(new URL(endpoint).port);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nextPort(port: number) {
  return port >= 65535 ? port - 1 : port + 1;
}

function normalizeEndpointHost(host: string) {
  return host === "0.0.0.0" ? "127.0.0.1" : host;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  const parsed = readNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function readPercentage(value: unknown): number | undefined {
  const parsed = readNumber(value);
  return parsed !== undefined && parsed > 0 && parsed <= 100 ? parsed : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = readNumber(value);
  return parsed !== undefined && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function readPort(value: unknown): number | undefined {
  const parsed = readNumber(value);
  if (!parsed || parsed < 1 || parsed > 65535) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
