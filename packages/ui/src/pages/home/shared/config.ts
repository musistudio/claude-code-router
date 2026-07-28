import type {
  AppConfig
} from "@ccr/core/contracts/app";
import {
  fallbackConfig
} from "./fallbacks";

import { normalizeApiKeys } from "./api-keys";
import { normalizeOverviewWidgets, normalizeThemePreference, normalizeTrayBalanceProgressConfig, normalizeTrayComponentVariants, normalizeTrayIconPreference, normalizeTrayProgressTargetTokens, normalizeTrayWidgets, normalizeTrayWindowModules } from "./common";
import { legacyProfileItemsFromProfileConfig, normalizeBotGatewayRuntimeConfig, normalizeBotGatewaySavedConfigs, normalizeCodexConfigFormat, normalizeProfileItems } from "./profiles";
import { normalizeRouterConfig } from "./routing";
import { normalizeMcpServers } from "./virtual-models";

export function normalizeConfig(config: AppConfig): AppConfig {
  const router = normalizeRouterConfig(config.Router);
  const apiKeys = normalizeApiKeys(config.APIKEYS, config.APIKEY);
  const profileConfig = config.profile || fallbackConfig.profile;
  const profiles = Array.isArray(profileConfig.profiles)
    ? normalizeProfileItems(profileConfig.profiles)
    : legacyProfileItemsFromProfileConfig(profileConfig);
  const trayBalanceProgress = normalizeTrayBalanceProgressConfig(config.trayBalanceProgress);
  const trayIcon = normalizeTrayIconPreference(config.trayIcon);

  return {
    ...fallbackConfig,
    ...config,
    APIKEY: apiKeys[0]?.key ?? "",
    APIKEYS: apiKeys,
    Providers: Array.isArray(config.Providers) ? config.Providers : [],
    Router: router,
    agent: {
      ...fallbackConfig.agent,
      ...(config.agent || {}),
      mcpServers: Array.isArray(config.agent?.mcpServers) ? normalizeMcpServers(config.agent.mcpServers) : fallbackConfig.agent.mcpServers
    },
    botConfigs: normalizeBotGatewaySavedConfigs(config.botConfigs),
    botGateway: normalizeBotGatewayRuntimeConfig(config.botGateway) ?? fallbackConfig.botGateway,
    contextArchive: normalizeContextArchiveConfig(config.contextArchive),
    gateway: {
      ...fallbackConfig.gateway,
      ...(config.gateway || {}),
      coreHost: fallbackConfig.gateway.coreHost
    },
    mediaTools: normalizeMediaToolsConfig(config.mediaTools),
    launchAtLogin: Boolean(config.launchAtLogin),
    observability: normalizeObservabilityConfig(config.observability),
    proxy: normalizeProxyConfig(config.proxy),
    profile: {
      ...fallbackConfig.profile,
      ...profileConfig,
      claudeCode: {
        ...fallbackConfig.profile.claudeCode,
        ...(profileConfig.claudeCode || {}),
        managedCompact: Boolean(profileConfig.claudeCode?.managedCompact)
      },
      codex: {
        ...fallbackConfig.profile.codex,
        ...(profileConfig.codex || {}),
        cliMiddleware: true,
        configFormat: normalizeCodexConfigFormat(profileConfig.codex?.configFormat),
        managedCompact: Boolean(profileConfig.codex?.managedCompact),
        showAllSessions: Boolean(profileConfig.codex?.showAllSessions)
      },
      profiles
    },
    overviewWidgets: normalizeOverviewWidgets(config.overviewWidgets),
    plugins: Array.isArray(config.plugins) ? config.plugins : [],
    providerPlugins: Array.isArray(config.providerPlugins) ? config.providerPlugins : [],
    theme: normalizeThemePreference(config.theme),
    trayBalanceProgress,
    trayComponentVariants: normalizeTrayComponentVariants(config.trayComponentVariants),
    trayIcon: trayIcon === "progress" && !trayBalanceProgress ? "random" : trayIcon,
    trayProgressTargetTokens: normalizeTrayProgressTargetTokens(config.trayProgressTargetTokens),
    trayWidgets: normalizeTrayWidgets(config.trayWidgets, config.trayWindowModules, config.trayComponentVariants),
    trayWindowModules: normalizeTrayWindowModules(config.trayWindowModules),
    toolHub: normalizeToolHubConfig(config.toolHub),
    virtualModelProfiles: Array.isArray(config.virtualModelProfiles) ? config.virtualModelProfiles : []
  };
}

export function normalizeContextArchiveConfig(config: Partial<AppConfig["contextArchive"]> | undefined): AppConfig["contextArchive"] {
  return {
    enabled: Boolean(config?.enabled),
    maxBytes: finiteNumber(config?.maxBytes, fallbackConfig.contextArchive.maxBytes),
    maxSnapshotBytes: finiteNumber(config?.maxSnapshotBytes, fallbackConfig.contextArchive.maxSnapshotBytes),
    maxSnapshots: finiteNumber(config?.maxSnapshots, fallbackConfig.contextArchive.maxSnapshots),
    mcpEnabled: config?.mcpEnabled !== false,
    replayTimeoutMs: finiteNumber(config?.replayTimeoutMs, fallbackConfig.contextArchive.replayTimeoutMs),
    retentionDays: finiteNumber(config?.retentionDays, fallbackConfig.contextArchive.retentionDays),
    storagePath: typeof config?.storagePath === "string" ? config.storagePath.trim() : "",
    toolName: typeof config?.toolName === "string" && config.toolName.trim()
      ? config.toolName.trim()
      : fallbackConfig.contextArchive.toolName
  };
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeObservabilityConfig(config: Partial<AppConfig["observability"]> | undefined): AppConfig["observability"] {
  return {
    ...fallbackConfig.observability,
    ...(config || {}),
    agentAnalysis: Boolean(config?.agentAnalysis),
    requestLogBodyCapture: config?.requestLogBodyCapture ?? fallbackConfig.observability.requestLogBodyCapture,
    requestLogMaxBodyBytes: config?.requestLogMaxBodyBytes ?? fallbackConfig.observability.requestLogMaxBodyBytes,
    requestLogSuccessSampleRate: config?.requestLogSuccessSampleRate ?? fallbackConfig.observability.requestLogSuccessSampleRate,
    requestLogs: Boolean(config?.requestLogs)
  };
}

export function normalizeProxyConfig(config: Partial<AppConfig["proxy"]> | undefined): AppConfig["proxy"] {
  return {
    ...fallbackConfig.proxy,
    ...(config || {}),
    targets: Array.isArray(config?.targets) ? config.targets : fallbackConfig.proxy.targets,
    upstream: normalizeProxyUpstreamConfig(config?.upstream)
  };
}

export function normalizeProxyUpstreamConfig(config: Partial<AppConfig["proxy"]["upstream"]> | undefined): AppConfig["proxy"]["upstream"] {
  const mode = config?.mode === "none" || config?.mode === "system" || config?.mode === "custom"
    ? config.mode
    : fallbackConfig.proxy.upstream.mode;
  const port = typeof config?.custom?.port === "number" && Number.isFinite(config.custom.port)
    ? Math.min(Math.max(Math.floor(config.custom.port), 1), 65535)
    : fallbackConfig.proxy.upstream.custom.port;
  return {
    ...fallbackConfig.proxy.upstream,
    ...(config || {}),
    custom: {
      ...fallbackConfig.proxy.upstream.custom,
      ...(config?.custom || {}),
      password: typeof config?.custom?.password === "string" ? config.custom.password : fallbackConfig.proxy.upstream.custom.password,
      port,
      server: typeof config?.custom?.server === "string" ? config.custom.server.trim() : fallbackConfig.proxy.upstream.custom.server,
      username: typeof config?.custom?.username === "string" ? config.custom.username.trim() : fallbackConfig.proxy.upstream.custom.username
    },
    mode
  };
}

export function normalizeToolHubConfig(config: Partial<AppConfig["toolHub"]> | undefined): AppConfig["toolHub"] {
  const maxTools = typeof config?.maxTools === "number" && Number.isFinite(config.maxTools)
    ? Math.min(Math.max(Math.floor(config.maxTools), 1), 20)
    : fallbackConfig.toolHub.maxTools;
  const requestTimeoutMs = typeof config?.requestTimeoutMs === "number" && Number.isFinite(config.requestTimeoutMs)
    ? Math.min(Math.max(Math.floor(config.requestTimeoutMs), 8000), 300000)
    : fallbackConfig.toolHub.requestTimeoutMs;
  return {
    ...fallbackConfig.toolHub,
    ...(config || {}),
    browserAutomation: Boolean(config?.browserAutomation),
    enabled: Boolean(config?.enabled),
    llm: {
      ...fallbackConfig.toolHub.llm,
      ...(config?.llm || {}),
      apiKey: typeof config?.llm?.apiKey === "string" ? config.llm.apiKey : "",
      baseUrl: typeof config?.llm?.baseUrl === "string" && config.llm.baseUrl.trim()
        ? config.llm.baseUrl.trim()
        : fallbackConfig.toolHub.llm.baseUrl,
      model: typeof config?.llm?.model === "string" ? config.llm.model.trim() : ""
    },
    mcpServers: Array.isArray(config?.mcpServers) ? normalizeMcpServers(config.mcpServers) : fallbackConfig.toolHub.mcpServers,
    maxTools,
    requestTimeoutMs
  };
}

export function normalizeMediaToolsConfig(config: Partial<AppConfig["mediaTools"]> | undefined): AppConfig["mediaTools"] {
  const clampInteger = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), min), max) : fallback;
  return {
    ...fallbackConfig.mediaTools,
    ...(config || {}),
    allowedInputRoots: Array.isArray(config?.allowedInputRoots)
      ? config.allowedInputRoots.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
      : [],
    artifactTtlHours: clampInteger(config?.artifactTtlHours, fallbackConfig.mediaTools.artifactTtlHours, 1, 720),
    enabled: Boolean(config?.enabled),
    jobTimeoutMs: clampInteger(config?.jobTimeoutMs, fallbackConfig.mediaTools.jobTimeoutMs, 30000, 3600000),
    maxImageConcurrency: clampInteger(config?.maxImageConcurrency, fallbackConfig.mediaTools.maxImageConcurrency, 1, 8),
    maxVideoConcurrency: clampInteger(config?.maxVideoConcurrency, fallbackConfig.mediaTools.maxVideoConcurrency, 1, 4)
  };
}
