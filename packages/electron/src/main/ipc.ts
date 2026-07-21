import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, type OpenDialogOptions, type Rectangle, type SaveDialogOptions } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { loadPersistedAppSetting, replacePersistedAppSetting } from "@ccr/core/config/app-config-store";
import { builtInBrowserService } from "./built-in-browser";
import { scanBotHandoffBluetoothTargets, scanBotHandoffWifiTargets } from "@ccr/core/agents/bot-gateway/handoff-scan-service";
import { cancelBotGatewayQrLogin, startBotGatewayQrLogin, waitBotGatewayQrLogin } from "@ccr/core/agents/bot-gateway/qr-login-service";
import { closeBotGatewayQrWindow, openBotGatewayQrWindow } from "./bot-gateway-qr-window-service";
import { syncClaudeAppGatewayConfig } from "@ccr/core/agents/claude-app/gateway-service";
import { findInstalledCodexAppExecutable } from "@ccr/core/agents/codex/app-launch";
import { findInstalledOpenCodeAppExecutable } from "@ccr/core/agents/opencode/app-launch";
import { loadAppConfig, saveApiKeysConfig, saveAppConfig, saveAppThemePreference } from "@ccr/core/config/config";
import { API_KEYS_DB_FILE, APP_CONFIG_DB_FILE, APP_NAME, CONFIGDIR, CONFIG_FILE, DATADIR, GATEWAY_CONFIG_FILE, IPC_CHANNELS, LEGACY_CONFIG_FILE, ONBOARDING_FINISHED_FILE, PROXY_CA_CERT_FILE, REQUEST_LOGS_DB_FILE, USAGE_DB_FILE } from "@ccr/core/config/constants";
import { deepLinkService } from "./deep-link";
import { gatewayService } from "@ccr/core/gateway/service";
import { shouldRestartGatewayForRuntimeConfigChange } from "@ccr/core/gateway/runtime-change";
import { getProviderAccountSnapshots, invalidateProviderAccountSnapshotCache, resetCodexRateLimitCredit, testProviderAccountConnector } from "@ccr/core/providers/account-service";
import { detectProviderIcon } from "@ccr/core/providers/icons";
import { fetchProviderManifest } from "@ccr/core/providers/manifest-service";
import { getLocalAgentProviderCandidates, importLocalAgentProvider, probeLocalAgentProvider } from "@ccr/core/agents/local-providers/service";
import { isLaunchAtLoginSupported, syncLaunchAtLogin } from "./launch-at-login";
import { getProviderCatalogModels } from "@ccr/core/providers/model-catalog";
import { getProviderPresets } from "@ccr/core/providers/presets/index";
import { checkGatewayProviderConnectivity, probeGatewayProvider, probeGatewayProviderCandidates } from "@ccr/core/providers/probe";
import { applyProfileConfig } from "@ccr/core/profiles/service";
import { desktopCliCommandName, getProfileOpenCommand, getProfileRuntimeStatus, openProfileFromCcr, stopProfileFromCcr } from "@ccr/core/profiles/launch-service";
import { getPluginMarketplace } from "@ccr/core/plugins/marketplace";
import { ensureProxyCertificateAuthority } from "@ccr/core/proxy/certificates";
import { proxyService } from "@ccr/core/proxy/service";
import { listMcpServerTools } from "@ccr/core/mcp/tool-discovery";
import { getAgentAnalysis, getAgentTracePayload, getRequestLogDetail, getRequestLogs } from "@ccr/core/observability/request-log-store";
import trayController from "./tray-controller";
import { appUpdateService } from "./update-service";
import { getUsageStats } from "@ccr/core/usage/store";
import { applyNativeThemePreference } from "./native-theme";
import windowsManager from "./windows";
import { GATEWAY_PLUGIN_PERMISSION_IDS, GATEWAY_PLUGIN_SURFACE_IDS, type AgentAnalysisFilter, type AgentAnalysisTracePayloadRequest, type ApiKeyConfig, type AppCaptureElementPngRequest, type AppCaptureElementPngResult, type AppConfig, type AppDataExportResult, type AppImageExportTargetRequest, type AppImageExportTargetResult, type AppInfo, type AppRenderHtmlPngRequest, type AppRenderHtmlPngResult, type AppSaveConfigOptions, type BotGatewayQrLoginCancelRequest, type BotGatewayQrLoginStartRequest, type BotGatewayQrLoginWaitRequest, type BotGatewayQrWindowCloseRequest, type BotGatewayQrWindowOpenRequest, type GatewayPluginAppConfig, type GatewayPluginPermission, type GatewayPluginSurface, type GatewayProviderConnectivityCheckRequest, type GatewayProviderProbeCandidatesRequest, type GatewayProviderProbeRequest, type GatewayStatus, type LocalAgentProviderImportRequest, type PluginDependency, type PluginDirectorySelection, type ProfileApplyResult, type ProfileOpenRequest, type ProviderAccountResetRequest, type ProviderAccountSnapshotRequestOptions, type ProviderAccountTestRequest, type ProviderCatalogModelsRequest, type ProviderIconDetectionRequest, type ProviderManifestFetchRequest, type RequestLogListFilter, type UsageStatsFilter, type UsageStatsRange } from "@ccr/core/contracts/app";
import type { AgentAnalysisFilter, AgentAnalysisTracePayloadRequest, ApiKeyConfig, AppCaptureElementPngRequest, AppCaptureElementPngResult, AppConfig, AppDataExportResult, AppImageExportTargetRequest, AppImageExportTargetResult, AppInfo, AppRenderHtmlPngRequest, AppRenderHtmlPngResult, AppSaveConfigOptions, BotGatewayQrLoginCancelRequest, BotGatewayQrLoginStartRequest, BotGatewayQrLoginWaitRequest, BotGatewayQrWindowCloseRequest, BotGatewayQrWindowOpenRequest, GatewayPluginAppConfig, GatewayProviderConnectivityCheckRequest, GatewayProviderProbeCandidatesRequest, GatewayProviderProbeRequest, GatewayStatus, LocalAgentProviderImportRequest, PluginDependency, PluginDirectorySelection, PluginMarketplaceEntry, ProfileApplyResult, ProfileOpenRequest, ProviderAccountResetRequest, ProviderAccountSnapshotRequestOptions, ProviderAccountTestRequest, ProviderCatalogModelsRequest, ProviderIconDetectionRequest, ProviderManifestFetchRequest, RequestLogListFilter, RouteScriptTestRequest, RouteScriptValidationRequest, UsageStatsFilter, UsageStatsRange } from "@ccr/core/contracts/app";

const pluginMarketplace: PluginMarketplaceEntry[] = [
  {
    capabilities: ["Wrapper runtime", "Claude App proxy", "Claude Design", "Model routing"],
    dependencies: [],
    description: "Routes Claude App Design traffic through the local CCR wrapper backend with configurable model routing.",
    id: "claude-design",
    modulePath: path.join(__dirname, "..", "marketplace", "plugins", "claude-design-plugin.cjs"),
    name: "Claude Design"
  },
  {
    capabilities: ["Wrapper runtime", "Proxy mode", "Cursor", "Model routing", "OpenAI/Anthropic/Gemini forwarding"],
    dependencies: [],
    description: "Routes Cursor-compatible LLM traffic captured by proxy mode into the local CCR gateway.",
    id: "cursor-proxy",
    modulePath: path.join(__dirname, "..", "marketplace", "plugins", "cursor-proxy-plugin.cjs"),
    name: "Cursor Proxy"
  }
];
const onboardingFinishedAtSettingKey = "onboardingFinishedAt";
const imageExportTargets = new Map<string, string>();
const gatewayPluginPermissionIdSet = new Set<string>(GATEWAY_PLUGIN_PERMISSION_IDS);
const gatewayPluginSurfaceIdSet = new Set<string>(GATEWAY_PLUGIN_SURFACE_IDS);

function applyAppThemePreference(theme: AppConfig["theme"]): void {
  applyNativeThemePreference(theme);
  trayController.refreshTheme(theme);
}

ipcMain.handle(IPC_CHANNELS.appGetInfo, () => {
  const chatgptAppPath = findInstalledCodexAppExecutable().executable;
  const opencodeAppPath = findInstalledOpenCodeAppExecutable().executable;
  return {
    appConfigDbFile: APP_CONFIG_DB_FILE,
    apiKeysDbFile: API_KEYS_DB_FILE,
    ...(chatgptAppPath ? { chatgptAppPath } : {}),
    configDir: CONFIGDIR,
    configFile: CONFIG_FILE,
    dataDir: DATADIR,
    gatewayConfigFile: GATEWAY_CONFIG_FILE,
    launchAtLoginSupported: isLaunchAtLoginSupported(),
    name: APP_NAME,
    ...(opencodeAppPath ? { opencodeAppPath } : {}),
    platform: process.platform,
    requestLogsDbFile: REQUEST_LOGS_DB_FILE,
    usageDbFile: USAGE_DB_FILE,
    version: app.getVersion()
  } satisfies AppInfo;
});

ipcMain.handle(IPC_CHANNELS.appExportData, async (event): Promise<AppDataExportResult> => {
  return exportAppData(BrowserWindow.fromWebContents(event.sender));
});
ipcMain.handle(IPC_CHANNELS.appCaptureElementPng, async (event, request: AppCaptureElementPngRequest): Promise<AppCaptureElementPngResult> => {
  return captureElementPng(BrowserWindow.fromWebContents(event.sender), request);
});
ipcMain.handle(IPC_CHANNELS.appPrepareImageExportTarget, async (event, request: AppImageExportTargetRequest): Promise<AppImageExportTargetResult> => {
  return prepareImageExportTarget(BrowserWindow.fromWebContents(event.sender), request);
});
ipcMain.handle(IPC_CHANNELS.appRenderHtmlPng, async (event, request: AppRenderHtmlPngRequest): Promise<AppRenderHtmlPngResult> => {
  return renderHtmlPng(BrowserWindow.fromWebContents(event.sender), request);
});

ipcMain.handle(IPC_CHANNELS.appGetConfig, () => loadAppConfig());
ipcMain.handle(IPC_CHANNELS.appGetOnboardingFinished, async () => {
  const persisted = await loadPersistedAppSetting(onboardingFinishedAtSettingKey);
  return Boolean(readString(persisted) || existsSync(ONBOARDING_FINISHED_FILE));
});
ipcMain.handle(IPC_CHANNELS.appGetPendingProviderDeepLinks, () => deepLinkService.consumePendingProviderRequests());
ipcMain.handle(IPC_CHANNELS.appGetLocalAgentProviderCandidates, () => getLocalAgentProviderCandidates());
ipcMain.handle(IPC_CHANNELS.appGetProfileOpenCommand, async (_event, request: ProfileOpenRequest) => {
  return getProfileOpenCommand(await loadAppConfig(), request, {
    commandName: desktopCliCommandName,
    ensureLauncher: true
  });
});
ipcMain.handle(IPC_CHANNELS.appGetProfileRuntimeStatus, () => {
  return getProfileRuntimeStatus();
});
ipcMain.handle(IPC_CHANNELS.appGetProviderAccountSnapshots, (_event, provider?: string, options?: ProviderAccountSnapshotRequestOptions) => getProviderAccountSnapshots(provider, options));
ipcMain.handle(IPC_CHANNELS.appGetProviderCatalogModels, (_event, request: ProviderCatalogModelsRequest) => getProviderCatalogModels(request));
ipcMain.handle(IPC_CHANNELS.appGetProviderPresets, () => getProviderPresets());
ipcMain.handle(IPC_CHANNELS.appGetAgentAnalysis, (_event, filter?: AgentAnalysisFilter) => getAgentAnalysis(filter));
ipcMain.handle(IPC_CHANNELS.appGetAgentTracePayload, (_event, request: AgentAnalysisTracePayloadRequest) => getAgentTracePayload(request));
ipcMain.handle(IPC_CHANNELS.appGetGatewayStatus, () => gatewayService.getStatus());
ipcMain.handle(IPC_CHANNELS.appGetProxyCertificateStatus, () => proxyService.getCertificateStatus());
ipcMain.handle(IPC_CHANNELS.appGetProxyNetworkCaptures, () => proxyService.getNetworkCaptures());
ipcMain.handle(IPC_CHANNELS.appGetProxyStatus, () => proxyService.getStatus());
ipcMain.handle(IPC_CHANNELS.appGetPluginMarketplace, () => getPluginMarketplace());
ipcMain.handle(IPC_CHANNELS.appGetRequestLogDetail, (_event, request) => getRequestLogDetail(request));
ipcMain.handle(IPC_CHANNELS.appGetRequestLogs, (_event, filter?: RequestLogListFilter) => getRequestLogs(filter));
ipcMain.handle(IPC_CHANNELS.appGetUpdateStatus, () => appUpdateService.getStatus());
ipcMain.handle(IPC_CHANNELS.appGetUsageStats, (_event, range?: UsageStatsRange, filter?: UsageStatsFilter) => getUsageStats(range, filter));
ipcMain.handle(IPC_CHANNELS.appFetchProviderManifest, (_event, request: ProviderManifestFetchRequest) => fetchProviderManifest(request));
ipcMain.handle(IPC_CHANNELS.appImportLocalAgentProvider, (_event, request: LocalAgentProviderImportRequest) => importLocalAgentProvider(request));
ipcMain.handle(IPC_CHANNELS.appProbeLocalAgentProvider, (_event, request) => probeLocalAgentProvider(request));
ipcMain.handle(IPC_CHANNELS.appInstallProxyCertificate, () => proxyService.installCertificate());
ipcMain.handle(IPC_CHANNELS.appListMcpServerTools, async (_event, serverName: string) => {
  const name = typeof serverName === "string" ? serverName.trim() : "";
  if (!name) {
    throw new Error("MCP server name is required.");
  }
  const config = await loadAppConfig();
  const server = config.agent.mcpServers.find((candidate) => candidate.name === name);
  if (!server) {
    throw new Error("MCP server must be saved before tool discovery.");
  }
  return listMcpServerTools(server);
});
ipcMain.handle(IPC_CHANNELS.appOpenBuiltInBrowser, async () => {
  const config = await loadAppConfig();
  if (hasEnabledPluginApp(config, "agent-console")) {
    await deepLinkService.openPluginApp("agent-console");
    return;
  }
  await builtInBrowserService.open(config);
});
ipcMain.handle(IPC_CHANNELS.appCloseTray, () => {
  trayController.hidePopover();
});
ipcMain.handle(IPC_CHANNELS.appDetectProviderIcon, (_event, request: ProviderIconDetectionRequest) => {
  return detectProviderIcon(request);
});
ipcMain.handle(IPC_CHANNELS.appClearProxyNetworkCaptures, () => proxyService.clearNetworkCaptures());
ipcMain.handle(IPC_CHANNELS.appSetProxyNetworkCaptureEnabled, (_event, enabled: boolean) => {
  return proxyService.setNetworkCaptureEnabled(Boolean(enabled));
});
ipcMain.handle(IPC_CHANNELS.appSelectPluginDirectory, async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    buttonLabel: "Select plugin",
    properties: ["openDirectory"],
    title: "Select plugin directory"
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }
  return inspectPluginDirectory(result.filePaths[0]);
});
ipcMain.handle(IPC_CHANNELS.appOpenExternal, async (_event, url: string) => {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs can be opened.");
  }
  await shell.openExternal(parsed.toString());
});
ipcMain.handle(IPC_CHANNELS.appOpenProfile, async (_event, request: ProfileOpenRequest) => {
  const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
  const config = syncedClaudeAppConfig.config;
  const status = await gatewayService.start(config);
  if (status.state !== "running") {
    throw new Error(status.lastError || "CCR gateway did not start.");
  }
  logProfileApplyResult(await applyProfileConfig(config));
  return openProfileFromCcr(config, request);
});
ipcMain.handle(IPC_CHANNELS.appApplyClaudeAppGateway, async (_event, config?: AppConfig) => {
  const previousConfig = await loadAppConfig();
  const baseConfig = config ? await saveAppConfig(config) : previousConfig;
  applyNativeThemePreference(baseConfig.theme);
  const synced = await syncClaudeAppGatewayConfig(baseConfig);
  const savedConfig = synced.config;
  let runtimeStatus = gatewayService.getStatus();

  if (synced.configChanged || shouldRestartGatewayForRuntimeConfigChange(previousConfig, savedConfig) || runtimeStatus.state !== "running") {
    runtimeStatus = await gatewayService.start(savedConfig);
  } else {
    await gatewayService.updateConfig(savedConfig);
  }

  await builtInBrowserService.syncProxy(savedConfig);
  await trayController.refreshIconFromConfig(savedConfig);
  if (config || synced.configChanged) {
    invalidateProviderAccountSnapshotCache();
  }

  const gatewayDetail = runtimeStatus.state === "running"
    ? "CCR gateway is running."
    : `CCR gateway did not start: ${runtimeStatus.lastError || "unknown error"}`;
  const apiKeyDetail = synced.result.apiKeyGenerated ? "Generated a Claude App API key." : "Reused an existing CCR API key.";
  return {
    ...synced.result,
    message: `${synced.result.message}\n${gatewayDetail}\n${apiKeyDetail}`
  };
});
ipcMain.handle(IPC_CHANNELS.appBotGatewayQrLoginStart, (_event, request: BotGatewayQrLoginStartRequest) => {
  return startBotGatewayQrLogin(request);
});
ipcMain.handle(IPC_CHANNELS.appBotGatewayQrLoginWait, (_event, request: BotGatewayQrLoginWaitRequest) => {
  return waitBotGatewayQrLogin(request);
});
ipcMain.handle(IPC_CHANNELS.appBotGatewayQrLoginCancel, (_event, request: BotGatewayQrLoginCancelRequest) => {
  return cancelBotGatewayQrLogin(request);
});
ipcMain.handle(IPC_CHANNELS.appBotGatewayQrWindowOpen, (_event, request: BotGatewayQrWindowOpenRequest) => {
  return openBotGatewayQrWindow(request);
});
ipcMain.handle(IPC_CHANNELS.appBotGatewayQrWindowClose, (_event, request: BotGatewayQrWindowCloseRequest) => {
  return closeBotGatewayQrWindow(request);
});
ipcMain.handle(IPC_CHANNELS.appBotHandoffWifiTargetsScan, () => {
  return scanBotHandoffWifiTargets();
});
ipcMain.handle(IPC_CHANNELS.appBotHandoffBluetoothTargetsScan, () => {
  return scanBotHandoffBluetoothTargets();
});
ipcMain.handle(IPC_CHANNELS.appApplyProfile, async () => {
  const config = await loadAppConfig();
  return applyProfileConfig(config);
});
ipcMain.handle(IPC_CHANNELS.appCheckProviderConnectivity, (_event, request: GatewayProviderConnectivityCheckRequest) => {
  return checkGatewayProviderConnectivity(request);
});
ipcMain.handle(IPC_CHANNELS.appProbeProvider, (_event, request: GatewayProviderProbeRequest) => {
  return probeGatewayProvider(request);
});
ipcMain.handle(IPC_CHANNELS.appProbeProviderCandidates, (_event, request: GatewayProviderProbeCandidatesRequest) => {
  return probeGatewayProviderCandidates(request);
});
ipcMain.handle(IPC_CHANNELS.appResetCodexRateLimitCredit, (_event, request: ProviderAccountResetRequest) => {
  return resetCodexRateLimitCredit(request);
});
ipcMain.handle(IPC_CHANNELS.appTestProviderAccountConnector, (_event, request: ProviderAccountTestRequest) => {
  return testProviderAccountConnector(request);
});
ipcMain.handle(IPC_CHANNELS.appValidateRouteScript, (_event, request: RouteScriptValidationRequest) => {
  return gatewayService.validateRouteScript(request);
});
ipcMain.handle(IPC_CHANNELS.appTestRouteScript, async (_event, request: RouteScriptTestRequest) => {
  return gatewayService.testRouteScript(await loadAppConfig(), request);
});
ipcMain.handle(IPC_CHANNELS.appUpdateCheck, () => appUpdateService.checkForUpdates());
ipcMain.handle(IPC_CHANNELS.appUpdateDownload, () => appUpdateService.downloadUpdate());
ipcMain.handle(IPC_CHANNELS.appUpdateInstall, () => appUpdateService.installUpdate());
ipcMain.handle(IPC_CHANNELS.appQuit, () => {
  app.quit();
});
ipcMain.handle(IPC_CHANNELS.appRevealProxyCertificate, () => {
  ensureProxyCertificateAuthority();
  shell.showItemInFolder(PROXY_CA_CERT_FILE);
});
ipcMain.handle(IPC_CHANNELS.appSaveConfig, async (_event, config: AppConfig, options?: AppSaveConfigOptions) => {
  const previousConfig = await loadAppConfig();
  if (config.proxy.enabled) {
    const certificateStatus = await proxyService.getCertificateStatus();
    if (!certificateStatus.trusted) {
      throw new Error(certificateStatus.message);
    }
  }
  const launchAtLoginChanged = Boolean(config.launchAtLogin) !== Boolean(previousConfig.launchAtLogin);
  let savedConfig = await saveAppConfig(config);
  applyAppThemePreference(savedConfig.theme);
  if (launchAtLoginChanged) {
    try {
      syncLaunchAtLogin(savedConfig);
    } catch (error) {
      await saveAppConfig({
        ...savedConfig,
        launchAtLogin: previousConfig.launchAtLogin
      });
      throw error;
    }
  }
  const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(savedConfig);
  savedConfig = syncedClaudeAppConfig.config;
  let runtimeStatus = gatewayService.getStatus();
  if (syncedClaudeAppConfig.configChanged || shouldRestartGatewayForRuntimeConfigChange(previousConfig, savedConfig)) {
    runtimeStatus = await gatewayService.start(savedConfig);
  } else {
    await gatewayService.updateConfig(savedConfig);
  }
  if (options?.applyProfile !== false) {
    await applyProfileIfServiceRunning(savedConfig, runtimeStatus);
  }
  await builtInBrowserService.syncProxy(savedConfig);
  await trayController.refreshIconFromConfig(savedConfig);
  invalidateProviderAccountSnapshotCache();
  return savedConfig;
});
ipcMain.handle(IPC_CHANNELS.appSetThemePreference, async (_event, theme: unknown) => {
  const savedTheme = await saveAppThemePreference(theme);
  applyAppThemePreference(savedTheme);
  return savedTheme;
});
ipcMain.handle(IPC_CHANNELS.appSaveApiKeys, async (_event, apiKeys: ApiKeyConfig[]) => {
  const savedConfig = await saveApiKeysConfig(apiKeys);
  const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(savedConfig);
  const nextConfig = syncedClaudeAppConfig.config;
  await gatewayService.updateConfig(nextConfig);
  logProfileApplyResult(await applyProfileConfig(nextConfig));
  invalidateProviderAccountSnapshotCache();
  return nextConfig;
});
ipcMain.handle(IPC_CHANNELS.appSetOnboardingFinished, async () => {
  await replacePersistedAppSetting(onboardingFinishedAtSettingKey, new Date().toISOString());
  windowsManager.resizeMainWindowToScreenSize();
  return true;
});
ipcMain.handle(IPC_CHANNELS.appRestartGateway, async () => {
  const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
  const config = syncedClaudeAppConfig.config;
  const status = await gatewayService.start(config);
  await applyProfileIfServiceRunning(config, status);
  await builtInBrowserService.syncProxy(config);
  return status;
});
ipcMain.handle(IPC_CHANNELS.appStartGateway, async () => {
  const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
  const config = syncedClaudeAppConfig.config;
  const status = await gatewayService.start(config);
  await applyProfileIfServiceRunning(config, status);
  await builtInBrowserService.syncProxy(config);
  return status;
});
ipcMain.handle(IPC_CHANNELS.appStopGateway, async () => {
  const status = await gatewayService.stop();
  await builtInBrowserService.clearProxy();
  return status;
});
ipcMain.handle(IPC_CHANNELS.appStopProfile, async (_event, request: ProfileOpenRequest) => {
  return stopProfileFromCcr(await loadAppConfig(), request);
});
ipcMain.handle(IPC_CHANNELS.appSetTrayDetailOpen, (_event, open: boolean, provider?: string) => {
  trayController.setDetailOpen(Boolean(open), provider);
});
ipcMain.handle(IPC_CHANNELS.appShowMainWindow, () => {
  trayController.hidePopover();
  windowsManager.showMainWindow();
});
ipcMain.handle(IPC_CHANNELS.appRestartProxy, async () => {
  const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
  const config = syncedClaudeAppConfig.config;
  const status = await gatewayService.start(config);
  await applyProfileIfServiceRunning(config, status);
  await builtInBrowserService.syncProxy(config);
  return proxyService.getStatus();
});

async function applyProfileIfServiceRunning(config: AppConfig, status: GatewayStatus): Promise<void> {
  if (status.state !== "running") {
    return;
  }
  logProfileApplyResult(await applyProfileConfig(config));
}

function logProfileApplyResult(result: ProfileApplyResult): void {
  for (const client of result.clients) {
    if (client.ok) {
      continue;
    }
    console.warn(`[profile:${client.client}] ${client.message}`);
  }
}

async function exportAppData(window: BrowserWindow | null): Promise<AppDataExportResult> {
  const exportedAt = new Date().toISOString();
  const result = window
    ? await dialog.showSaveDialog(window, dataExportSaveDialogOptions(exportedAt))
    : await dialog.showSaveDialog(dataExportSaveDialogOptions(exportedAt));
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  assertExportTargetIsNotInternalDataFile(result.filePath);
  const config = await loadAppConfig();
  const onboardingFinished = Boolean(
    readString(await loadPersistedAppSetting(onboardingFinishedAtSettingKey)) ||
    existsSync(ONBOARDING_FINISHED_FILE)
  );
  const payload = {
    app: {
      name: APP_NAME,
      platform: process.platform,
      version: app.getVersion()
    },
    appState: {
      onboardingFinished
    },
    config,
    exportedAt,
    files: readDataExportFiles(),
    kind: "claude-code-router-data-export",
    version: 1
  };

  writeFileSync(result.filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    canceled: false,
    exportedAt,
    file: result.filePath
  };
}

async function captureElementPng(window: BrowserWindow | null, request: AppCaptureElementPngRequest): Promise<AppCaptureElementPngResult> {
  if (!window) {
    throw new Error("Window is unavailable.");
  }

  const rect = sanitizeCaptureRect(request.rect);
  const result = await imageExportFile(window, request.fileName, request.exportId);
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const image = await window.webContents.capturePage(rect);
  const png = image.toPNG();
  writeFileSync(result.filePath, pngWithExportProcessing(png, request, rect.width), { mode: 0o600 });
  return { canceled: false, file: result.filePath };
}

async function renderHtmlPng(window: BrowserWindow | null, request: AppRenderHtmlPngRequest): Promise<AppRenderHtmlPngResult> {
  const html = typeof request.html === "string" ? request.html : "";
  if (!html.trim()) {
    throw new Error("Export HTML is empty.");
  }

  const size = sanitizeRenderSize(request.size);
  const result = await imageExportFile(window, request.fileName, request.exportId);
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const renderWindow = new BrowserWindow({
    backgroundColor: "#00000000",
    frame: false,
    height: size.height,
    paintWhenInitiallyHidden: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    useContentSize: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      sandbox: true
    },
    width: size.width
  });

  const tempDir = mkdtempSync(path.join(app.getPath("temp"), "ccr-export-"));
  const tempHtmlFile = path.join(tempDir, "export.html");
  writeFileSync(tempHtmlFile, html, { encoding: "utf8", mode: 0o600 });

  try {
    await renderWindow.loadFile(tempHtmlFile);
    await waitForExportWindowPaint(renderWindow);
    const image = await renderWindow.webContents.capturePage({
      height: size.height,
      width: size.width,
      x: 0,
      y: 0
    });
    const png = image.toPNG();
    writeFileSync(result.filePath, pngWithExportProcessing(png, request, size.width), { mode: 0o600 });
    return { canceled: false, file: result.filePath };
  } finally {
    if (!renderWindow.isDestroyed()) {
      renderWindow.destroy();
    }
    rmSync(tempDir, { force: true, recursive: true });
  }
}

async function prepareImageExportTarget(window: BrowserWindow | null, request: AppImageExportTargetRequest): Promise<AppImageExportTargetResult> {
  const result = window
    ? await dialog.showSaveDialog(window, shareCardSaveDialogOptions(request.fileName))
    : await dialog.showSaveDialog(shareCardSaveDialogOptions(request.fileName));
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const exportId = randomUUID();
  imageExportTargets.set(exportId, result.filePath);
  return {
    canceled: false,
    exportId,
    file: result.filePath
  };
}

async function imageExportFile(window: BrowserWindow | null, fileName: string, exportId?: string): Promise<{ canceled: boolean; filePath?: string }> {
  const targetFile = exportId ? consumeImageExportTarget(exportId) : undefined;
  return targetFile
    ? { canceled: false, filePath: targetFile }
    : window
      ? await dialog.showSaveDialog(window, shareCardSaveDialogOptions(fileName))
      : await dialog.showSaveDialog(shareCardSaveDialogOptions(fileName));
}

function dataExportSaveDialogOptions(exportedAt: string): SaveDialogOptions {
  return {
    buttonLabel: "Export",
    defaultPath: path.join(app.getPath("downloads"), `claude-code-router-data-${fileSafeTimestamp(exportedAt)}.json`),
    filters: [
      { extensions: ["json"], name: "CCR data export" }
    ],
    title: "Export CCR data"
  };
}

function shareCardSaveDialogOptions(fileName: string): SaveDialogOptions {
  return {
    buttonLabel: "Save image",
    defaultPath: path.join(app.getPath("downloads"), safePngFileName(fileName)),
    filters: [
      { extensions: ["png"], name: "PNG image" }
    ],
    title: "Save image"
  };
}

function sanitizeCaptureRect(rect: AppCaptureElementPngRequest["rect"]): Rectangle {
  const x = finiteNumber(rect?.x, "capture x");
  const y = finiteNumber(rect?.y, "capture y");
  const width = finiteNumber(rect?.width, "capture width");
  const height = finiteNumber(rect?.height, "capture height");
  if (width <= 0 || height <= 0) {
    throw new Error("Capture area must not be empty.");
  }
  return {
    height: Math.ceil(height),
    width: Math.ceil(width),
    x: Math.max(0, Math.floor(x)),
    y: Math.max(0, Math.floor(y))
  };
}

function sanitizeRenderSize(size: AppRenderHtmlPngRequest["size"]): { height: number; width: number } {
  const width = finiteNumber(size?.width, "render width");
  const height = finiteNumber(size?.height, "render height");
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    throw new Error("Render size is out of range.");
  }
  return {
    height: Math.ceil(height),
    width: Math.ceil(width)
  };
}

async function waitForExportWindowPaint(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => undefined) : Promise.resolve();
      fontsReady.then(() => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      });
    });
  `);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function safePngFileName(value: string): string {
  const raw = typeof value === "string" ? value : "";
  const safe = path.basename(raw).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "ccr-share-card.png";
  return safe.toLowerCase().endsWith(".png") ? safe : `${safe}.png`;
}

function consumeImageExportTarget(exportId: string): string {
  const target = imageExportTargets.get(exportId);
  imageExportTargets.delete(exportId);
  if (!target) {
    throw new Error("Image export target is unavailable.");
  }
  return target;
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type PngExportProcessingRequest = {
  borderRadius?: number;
  output?: {
    height: number;
    width: number;
  };
};

type DecodedPngPixels = {
  bitDepth: number;
  colorType: 2 | 6;
  height: number;
  pixels: Uint8Array;
  width: number;
};

function pngWithExportProcessing(png: Buffer, request: PngExportProcessingRequest, cssWidth: number): Buffer {
  const radius = typeof request.borderRadius === "number" && Number.isFinite(request.borderRadius) ? Math.max(0, request.borderRadius) : 0;
  const outputWidth = sanitizePngOutputDimension(request.output?.width);
  const outputHeight = sanitizePngOutputDimension(request.output?.height);
  if (radius <= 0 && (!outputWidth || !outputHeight)) {
    return png;
  }

  try {
    const decoded = decodePngPixels(png);
    let width = decoded.width;
    let height = decoded.height;
    let rgba = pngPixelsToRgba(decoded);
    if (outputWidth && outputHeight && (outputWidth !== width || outputHeight !== height)) {
      rgba = resizeRgbaBilinear(rgba, width, height, outputWidth, outputHeight);
      width = outputWidth;
      height = outputHeight;
    }
    if (radius > 0 && cssWidth > 0) {
      const pixelRadius = Math.min(width / 2, height / 2, radius * width / cssWidth);
      applyRoundedAlphaMask(rgba, width, height, pixelRadius);
    }
    return encodeRgbaPng(width, height, rgba);
  } catch (error) {
    console.warn(`[export] Failed to process exported PNG: ${formatError(error)}`);
    const resized = resizePngWithNativeImage(png, outputWidth, outputHeight);
    if (resized) {
      return resized;
    }
    return png;
  }
}

function resizePngWithNativeImage(png: Buffer, width?: number, height?: number): Buffer | undefined {
  if (!width || !height) {
    return undefined;
  }
  try {
    const image = nativeImage.createFromBuffer(png);
    if (image.isEmpty()) {
      return undefined;
    }
    return image.resize({ height, width }).toPNG();
  } catch (error) {
    console.warn(`[export] Failed to resize exported PNG fallback: ${formatError(error)}`);
    return undefined;
  }
}

function sanitizePngOutputDimension(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  return rounded > 0 && rounded <= 4096 ? rounded : undefined;
}

function decodePngPixels(png: Buffer): DecodedPngPixels {
  if (png.length < 33 || !png.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("Invalid PNG file.");
  }

  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    offset += 4;
    const type = png.toString("ascii", offset, offset + 4);
    offset += 4;
    const data = png.subarray(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlaceMethod = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlaceMethod !== 0) {
    throw new Error("Unsupported PNG format.");
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * channels);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previousRow[x] ?? 0;
      const upLeft = x >= channels ? previousRow[x - channels] ?? 0 : 0;
      row[x] = unfilterPngByte(filter, raw, left, up, upLeft);
    }
    pixels.set(row, y * stride);
    previousRow = row;
    sourceOffset += stride;
  }

  return {
    bitDepth,
    colorType: colorType as 2 | 6,
    height,
    pixels,
    width
  };
}

function unfilterPngByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + pngPaethPredictor(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function pngPaethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function pngPixelsToRgba(decoded: DecodedPngPixels): Uint8Array {
  const rgba = new Uint8Array(decoded.width * decoded.height * 4);
  const sourceChannels = decoded.colorType === 6 ? 4 : 3;
  for (let source = 0, target = 0; source < decoded.pixels.length; source += sourceChannels, target += 4) {
    rgba[target] = decoded.pixels[source];
    rgba[target + 1] = decoded.pixels[source + 1];
    rgba[target + 2] = decoded.pixels[source + 2];
    rgba[target + 3] = sourceChannels === 4 ? decoded.pixels[source + 3] : 255;
  }
  return rgba;
}

function resizeRgbaBilinear(source: Uint8Array, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Uint8Array {
  const target = new Uint8Array(targetWidth * targetHeight * 4);
  const xRatio = targetWidth > 1 ? (sourceWidth - 1) / (targetWidth - 1) : 0;
  const yRatio = targetHeight > 1 ? (sourceHeight - 1) / (targetHeight - 1) : 0;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = y * yRatio;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const yWeight = sourceY - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = x * xRatio;
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const xWeight = sourceX - x0;
      const targetOffset = (y * targetWidth + x) * 4;
      const topLeft = (y0 * sourceWidth + x0) * 4;
      const topRight = (y0 * sourceWidth + x1) * 4;
      const bottomLeft = (y1 * sourceWidth + x0) * 4;
      const bottomRight = (y1 * sourceWidth + x1) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = source[topLeft + channel] * (1 - xWeight) + source[topRight + channel] * xWeight;
        const bottom = source[bottomLeft + channel] * (1 - xWeight) + source[bottomRight + channel] * xWeight;
        target[targetOffset + channel] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }

  return target;
}

function applyRoundedAlphaMask(rgba: Uint8Array, width: number, height: number, radius: number): void {
  if (radius <= 0) {
    return;
  }

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const innerHalfWidth = Math.max(0, halfWidth - radius);
  const innerHalfHeight = Math.max(0, halfHeight - radius);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const qx = Math.abs(x + 0.5 - halfWidth) - innerHalfWidth;
      const qy = Math.abs(y + 0.5 - halfHeight) - innerHalfHeight;
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const inside = Math.min(Math.max(qx, qy), 0);
      const distance = outside + inside - radius;
      const coverage = Math.max(0, Math.min(1, 0.5 - distance));
      if (coverage >= 1) {
        continue;
      }
      const alphaOffset = (y * width + x) * 4 + 3;
      rgba[alphaOffset] = Math.round(rgba[alphaOffset] * coverage);
    }
  }
}

function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const target = y * (stride + 1);
    scanlines[target] = 0;
    scanlines.set(rgba.subarray(y * stride, (y + 1) * stride), target + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

let crc32Table: Uint32Array | undefined;

function crc32(buffer: Buffer): number {
  const table = crc32Table ?? createCrc32Table();
  crc32Table = table;
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function readDataExportFiles(): Array<{ base64: string; name: string; path: string; sizeBytes: number }> {
  const files: Array<{ base64: string; name: string; path: string; sizeBytes: number }> = [];
  for (const file of dataExportCandidateFiles()) {
    try {
      if (!existsSync(file)) {
        continue;
      }
      const stat = statSync(file);
      if (!stat.isFile()) {
        continue;
      }
      files.push({
        base64: readFileSync(file).toString("base64"),
        name: path.basename(file),
        path: file,
        sizeBytes: stat.size
      });
    } catch (error) {
      console.warn(`[export] Failed to include ${file}: ${formatError(error)}`);
    }
  }
  return files;
}

function dataExportCandidateFiles(): string[] {
  return uniqueStrings([
    ...sqliteDataFiles(APP_CONFIG_DB_FILE),
    ...sqliteDataFiles(API_KEYS_DB_FILE),
    ...sqliteDataFiles(REQUEST_LOGS_DB_FILE),
    ...sqliteDataFiles(USAGE_DB_FILE)
  ]);
}

function sqliteDataFiles(file: string): string[] {
  return [file, `${file}-wal`, `${file}-shm`];
}

function assertExportTargetIsNotInternalDataFile(file: string): void {
  const target = path.resolve(file);
  const reserved = new Set([
    CONFIG_FILE,
    LEGACY_CONFIG_FILE,
    APP_CONFIG_DB_FILE,
    API_KEYS_DB_FILE,
    REQUEST_LOGS_DB_FILE,
    USAGE_DB_FILE,
    ...dataExportCandidateFiles()
  ].map((item) => path.resolve(item)));
  if (reserved.has(target)) {
    throw new Error("Choose a different export path. Internal CCR data files cannot be overwritten.");
  }
}

function fileSafeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function inspectPluginDirectory(directory: string): PluginDirectorySelection {
  const manifest = readFirstJson([
    path.join(directory, "plugin.json"),
    path.join(directory, "ccr-plugin.json"),
    path.join(directory, ".ccr-plugin", "plugin.json"),
    path.join(directory, ".codex-plugin", "plugin.json")
  ]);
  const packageJson = readFirstJson([path.join(directory, "package.json")]);
  const moduleValue =
    readString(manifest?.module) ||
    readString(manifest?.main) ||
    readString(manifest?.path) ||
    readString(readRecord(packageJson?.ccr)?.module) ||
    readString(readRecord(packageJson?.ccrPlugin)?.module) ||
    readString(packageJson?.main);
  const id =
    pluginIdValue(readString(manifest?.id) || readString(manifest?.key) || readString(packageJson?.name)) ||
    pluginIdValue(path.basename(directory)) ||
    "plugin";
  const name = readString(manifest?.name) || readString(packageJson?.displayName) || readString(packageJson?.name);
  const apps = readPluginApps(manifest, packageJson);
  const permissions = readPluginPermissions(manifest, packageJson);
  const surfaces = readPluginSurfaces(manifest, packageJson);
  return {
    ...(apps.length ? { apps } : {}),
    dependencies: readPluginDependencies(directory, manifest, packageJson),
    directory,
    id,
    modulePath: resolvePluginDirectoryModule(directory, moduleValue, Boolean(manifest || packageJson)),
    ...(name ? { name } : {}),
    ...(permissions ? { permissions } : {}),
    ...(surfaces ? { surfaces } : {})
  };
}

function readPluginApps(
  manifest: Record<string, unknown> | undefined,
  packageJson: Record<string, unknown> | undefined
): GatewayPluginAppConfig[] {
  const values = [
    manifest?.apps,
    readRecord(manifest?.ccr)?.apps,
    readRecord(manifest?.ccrPlugin)?.apps,
    readRecord(packageJson?.ccr)?.apps,
    readRecord(packageJson?.ccrPlugin)?.apps
  ];
  const apps = values.flatMap(parsePluginApps);
  const byId = new Map<string, GatewayPluginAppConfig>();
  for (const app of apps) {
    const key = app.id || `${app.name}:${app.url}`;
    if (byId.has(key)) {
      continue;
    }
    byId.set(key, app);
  }
  return [...byId.values()];
}

function parsePluginApps(value: unknown): GatewayPluginAppConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(parsePluginAppItem).filter((item): item is GatewayPluginAppConfig => Boolean(item));
}

function parsePluginAppItem(value: unknown): GatewayPluginAppConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const name = readString(record.name) || readString(record.title);
  const url = normalizePluginAppUrl(readString(record.url) || readString(record.href) || readString(record.target));
  if (!name || !url) {
    return undefined;
  }
  const id = pluginIdValue(readString(record.id) || name);
  const description = readString(record.description);
  const icon = readString(record.icon);
  return {
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    ...(id ? { id } : {}),
    name,
    url
  };
}

function normalizePluginAppUrl(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return new URL(trimmed).toString();
  }
  if (trimmed.startsWith("//")) {
    throw new Error("Plugin app URL cannot be protocol-relative.");
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    throw new Error("Plugin app URL must be an http(s) URL or a CCR gateway path.");
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function readPluginPermissions(
  manifest: Record<string, unknown> | undefined,
  packageJson: Record<string, unknown> | undefined
): GatewayPluginPermission[] | undefined {
  const values = [
    manifest?.permissions,
    readRecord(manifest?.ccr)?.permissions,
    readRecord(manifest?.ccrPlugin)?.permissions,
    readRecord(packageJson?.ccr)?.permissions,
    readRecord(packageJson?.ccrPlugin)?.permissions
  ];
  const parsedValues = values.map(parsePluginPermissions).filter((value): value is GatewayPluginPermission[] => Boolean(value));
  return parsedValues.length > 0 ? uniquePluginPermissions(parsedValues.flat()) : undefined;
}

function parsePluginPermissions(value: unknown): GatewayPluginPermission[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const permissions: GatewayPluginPermission[] = [];
  const seen = new Set<GatewayPluginPermission>();
  const add = (rawValue: unknown): void => {
    const permission = normalizePluginPermission(rawValue);
    if (!permission || seen.has(permission)) {
      return;
    }
    seen.add(permission);
    permissions.push(permission);
  };

  if (typeof value === "string") {
    add(value);
  } else if (Array.isArray(value)) {
    value.forEach(add);
  } else {
    const record = readRecord(value);
    if (!record) {
      return permissions;
    }
    for (const [key, enabled] of Object.entries(record)) {
      if (enabled === false) {
        continue;
      }
      if (isAllPluginPermissionsKey(key)) {
        GATEWAY_PLUGIN_PERMISSION_IDS.forEach(add);
      } else {
        add(key);
      }
    }
  }

  return permissions;
}

function readPluginSurfaces(
  manifest: Record<string, unknown> | undefined,
  packageJson: Record<string, unknown> | undefined
): PluginDirectorySelection["surfaces"] | undefined {
  const values = [
    manifest?.surfaces,
    manifest?.surface,
    readRecord(manifest?.ccr)?.surfaces,
    readRecord(manifest?.ccr)?.surface,
    readRecord(manifest?.ccrPlugin)?.surfaces,
    readRecord(manifest?.ccrPlugin)?.surface,
    readRecord(packageJson?.ccr)?.surfaces,
    readRecord(packageJson?.ccr)?.surface,
    readRecord(packageJson?.ccrPlugin)?.surfaces,
    readRecord(packageJson?.ccrPlugin)?.surface
  ];
  const parsedValues = values.map(parsePluginSurfaces).filter((value): value is PluginDirectorySelection["surfaces"] => Boolean(value));
  return parsedValues.length > 0 ? Object.assign({}, ...parsedValues) as PluginDirectorySelection["surfaces"] : undefined;
}

function parsePluginSurfaces(value: unknown): PluginDirectorySelection["surfaces"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const surfaces: PluginDirectorySelection["surfaces"] = {};
  const setSurface = (rawValue: unknown, enabled = true): boolean => {
    const surface = normalizePluginSurface(rawValue);
    if (!surface) {
      return false;
    }
    surfaces[surface] = enabled;
    return true;
  };

  if (typeof value === "string") {
    if (isAllPluginSurfacesKey(value)) {
      GATEWAY_PLUGIN_SURFACE_IDS.forEach((surface) => {
        surfaces[surface] = true;
      });
      return surfaces;
    }
    if (!setSurface(value)) {
      return undefined;
    }
    GATEWAY_PLUGIN_SURFACE_IDS.forEach((surface) => {
      surfaces[surface] ??= false;
    });
  } else if (Array.isArray(value)) {
    let matched = false;
    for (const item of value) {
      if (typeof item === "string" && isAllPluginSurfacesKey(item)) {
        GATEWAY_PLUGIN_SURFACE_IDS.forEach((surface) => {
          surfaces[surface] = true;
        });
        matched = true;
      } else {
        matched = setSurface(item) || matched;
      }
    }
    if (!matched) {
      return undefined;
    }
    GATEWAY_PLUGIN_SURFACE_IDS.forEach((surface) => {
      surfaces[surface] ??= false;
    });
  } else {
    const record = readRecord(value);
    if (!record) {
      return undefined;
    }
    for (const [key, enabled] of Object.entries(record)) {
      if (isAllPluginSurfacesKey(key)) {
        GATEWAY_PLUGIN_SURFACE_IDS.forEach((surface) => {
          surfaces[surface] = enabled !== false;
        });
      } else {
        setSurface(key, enabled !== false);
      }
    }
  }

  return Object.keys(surfaces).length > 0 ? surfaces : undefined;
}

function normalizePluginPermission(value: unknown): GatewayPluginPermission | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const mapped = pluginPermissionAlias(normalized);
  return gatewayPluginPermissionIdSet.has(mapped) ? mapped as GatewayPluginPermission : undefined;
}

function normalizePluginSurface(value: unknown): GatewayPluginSurface | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const mapped = pluginSurfaceAlias(normalized);
  return gatewayPluginSurfaceIdSet.has(mapped) ? mapped as GatewayPluginSurface : undefined;
}

function pluginSurfaceAlias(value: string): string {
  switch (value) {
    case "app":
    case "browser-app":
    case "browser-apps":
    case "ui":
      return "apps";
    case "gateway-route":
    case "route":
    case "routes":
    case "gateway-routes":
    case "proxy-route":
    case "proxy":
    case "proxy-routes":
    case "http-backend":
    case "http-backends":
    case "backend":
    case "backends":
    case "core-gateway":
    case "core-gateway-config":
    case "fusion-profile":
    case "fusion-profiles":
    case "virtual-model":
    case "virtual-models":
    case "virtual-model-profile":
    case "virtual-model-profiles":
    case "request":
    case "requests":
      return "gateway";
    case "core-provider-plugin":
    case "provider-plugin":
    case "provider-plugins":
    case "provider-account":
    case "provider-account-connector":
    case "provider-account-connectors":
    case "providers":
      return "provider";
    default:
      return value;
  }
}

function pluginPermissionAlias(value: string): string {
  switch (value) {
    case "code":
    case "execute-code":
    case "trusted":
    case "trusted-code":
      return "trusted-code";
    case "app":
    case "browser-app":
    case "browser-apps":
      return "apps";
    case "gateway-route":
    case "route":
    case "routes":
      return "gateway-routes";
    case "proxy":
    case "proxy-route":
      return "proxy-routes";
    case "backend":
    case "backends":
    case "http-backend":
      return "http-backends";
    case "provider-account":
    case "provider-account-connector":
      return "provider-account-connectors";
    case "core-gateway":
      return "core-gateway-config";
    case "provider-plugin":
    case "provider-plugins":
    case "core-provider-plugin":
      return "core-provider-plugins";
    case "fusion-profile":
    case "fusion-profiles":
    case "virtual-model":
    case "virtual-models":
    case "virtual-model-profile":
      return "virtual-model-profiles";
    case "sqlite":
    case "data-store":
    case "store":
      return "sqlite-store";
    case "launcher":
    case "mac-launcher":
      return "system-launcher";
    default:
      return value;
  }
}

function uniquePluginPermissions(values: GatewayPluginPermission[]): GatewayPluginPermission[] | undefined {
  const unique = [...new Set(values)];
  return unique;
}

function isAllPluginPermissionsKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "*" || normalized === "all";
}

function isAllPluginSurfacesKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "*" || normalized === "all";
}

function readPluginDependencies(
  directory: string,
  manifest: Record<string, unknown> | undefined,
  packageJson: Record<string, unknown> | undefined
): PluginDependency[] {
  const values = [
    manifest?.dependencies,
    manifest?.pluginDependencies,
    readRecord(manifest?.ccr)?.dependencies,
    readRecord(manifest?.ccrPlugin)?.dependencies,
    readRecord(packageJson?.ccr)?.dependencies,
    readRecord(packageJson?.ccrPlugin)?.dependencies
  ];
  const dependencies = values.flatMap((value) => parsePluginDependencies(value, directory));
  const byId = new Map<string, PluginDependency>();
  for (const dependency of dependencies) {
    if (!dependency.id || byId.has(dependency.id)) {
      continue;
    }
    byId.set(dependency.id, dependency);
  }
  return [...byId.values()];
}

function parsePluginDependencies(value: unknown, directory: string): PluginDependency[] {
  if (Array.isArray(value)) {
    return value.map((item) => parsePluginDependencyItem(item, directory)).filter((item): item is PluginDependency => Boolean(item));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([id, item]) => parsePluginDependencyEntry(id, item, directory))
      .filter((item): item is PluginDependency => Boolean(item));
  }

  return [];
}

function parsePluginDependencyEntry(idValue: string, value: unknown, directory: string): PluginDependency | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return parsePluginDependencyItem({ id: idValue, ...(value as Record<string, unknown>) }, directory);
  }

  const id = pluginIdValue(idValue);
  if (!id) {
    return undefined;
  }
  const specifier = readString(value);
  const modulePath = specifier && looksLikeDependencyModulePath(specifier) ? resolveDependencyModulePath(directory, specifier) : undefined;
  return {
    id,
    ...(modulePath ? { modulePath } : {})
  };
}

function parsePluginDependencyItem(value: unknown, directory: string): PluginDependency | undefined {
  if (typeof value === "string") {
    const id = pluginIdValue(value);
    return id ? { id } : undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = pluginIdValue(readString(record.id) || readString(record.key) || readString(record.name));
  if (!id) {
    return undefined;
  }
  const moduleValue = readString(record.module) || readString(record.path) || readString(record.modulePath);
  const modulePath = moduleValue ? resolveDependencyModulePath(directory, moduleValue) : undefined;
  const name = readString(record.name);
  const permissions = parsePluginPermissions(record.permissions);
  return {
    id,
    ...(modulePath ? { modulePath } : {}),
    ...(name ? { name } : {}),
    ...(permissions ? { permissions } : {})
  };
}

function resolveDependencyModulePath(directory: string, value: string): string {
  if (value === "~" || value.startsWith("~/")) {
    return path.join(app.getPath("home"), value.slice(2));
  }
  return path.isAbsolute(value) ? value : path.join(directory, value);
}

function looksLikeDependencyModulePath(value: string): boolean {
  return value.startsWith(".") || value.startsWith("/") || value.startsWith("~");
}

function resolvePluginDirectoryModule(directory: string, moduleValue: string | undefined, hasManifest = false): string {
  if (moduleValue) {
    return path.isAbsolute(moduleValue) ? moduleValue : path.join(directory, moduleValue);
  }
  if (hasManifest) {
    return "";
  }

  for (const filename of ["index.cjs", "index.mjs", "index.js", "plugin.cjs", "plugin.mjs", "plugin.js"]) {
    const candidate = path.join(directory, filename);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  return "";
}

function readFirstJson(files: string[]): Record<string, unknown> | undefined {
  for (const file of files) {
    if (!isFile(file)) {
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore invalid plugin metadata and fall back to directory inference.
    }
  }
  return undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pluginIdValue(value: string | undefined): string {
  return value?.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "";
}

function isFile(file: string): boolean {
  try {
    return existsSync(file) && statSync(file).isFile();
  } catch {
    return false;
  }
}

function hasEnabledPluginApp(config: AppConfig, pluginId: string): boolean {
  return config.plugins.some((plugin) =>
    plugin.id === pluginId &&
    plugin.enabled !== false &&
    plugin.apps?.some((app) => typeof app.url === "string" && app.url.trim())
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
