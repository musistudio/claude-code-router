import { contextBridge, ipcRenderer } from "electron";
import { browserErrorI18nLanguage, formatLocalizedErrorMessage } from "../shared/i18n";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import type {
  AgentAnalysisFilter,
  AgentAnalysisSnapshot,
  AgentAnalysisTracePayloadFullResult,
  AgentAnalysisTracePayloadRequest,
  AppConfig,
  AppDataExportResult,
  AppInfo,
  AppUpdateStatus,
  ApiKeyConfig,
  BotGatewayQrLoginCancelRequest,
  BotGatewayQrLoginCancelResult,
  BotGatewayQrLoginStartRequest,
  BotGatewayQrLoginStartResult,
  BotGatewayQrLoginWaitRequest,
  BotGatewayQrLoginWaitResult,
  BotGatewayQrWindowCloseRequest,
  BotGatewayQrWindowCloseResult,
  BotGatewayQrWindowOpenRequest,
  BotGatewayQrWindowOpenResult,
  BotHandoffScanTarget,
  ClaudeAppGatewayApplyResult,
  GatewayMcpToolInfo,
  GatewayProviderConnectivityCheckReport,
  GatewayProviderConnectivityCheckRequest,
  GatewayProviderProbeCandidateResult,
  GatewayProviderProbeCandidatesRequest,
  GatewayProviderProbeRequest,
  GatewayProviderProbeResult,
  GatewayStatus,
  LocalAgentProviderCandidate,
  LocalAgentProviderImportRequest,
  LocalAgentProviderImportResult,
  PluginDirectorySelection,
  PluginMarketplaceEntry,
  ProfileOpenCommandResult,
  ProfileOpenRequest,
  ProfileOpenResult,
  ProfileRuntimeStatus,
  ProfileStopResult,
  ProviderAccountSnapshotRequestOptions,
  ProviderAccountTestRequest,
  ProviderAccountTestResult,
  ProviderIconDetectionRequest,
  ProviderIconDetectionResult,
  ProviderAccountSnapshot,
  ProviderCatalogModelsRequest,
  ProviderCatalogModelsResult,
  ProviderDeepLinkRequest,
  ProviderManifestFetchRequest,
  ProviderManifestFetchResult,
  ProfileApplyResult,
  ProxyCertificateInstallResult,
  ProxyCertificateStatus,
  ProxyNetworkSnapshot,
  ProxyStatus,
  RequestLogListFilter,
  RequestLogPage,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot
} from "../shared/app";
import type { ProviderPreset } from "../shared/provider-presets";

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(channel, ...args).catch((error) => {
    throw localizedIpcError(error);
  });
}

function localizedIpcError(error: unknown): Error {
  const localized = new Error(formatLocalizedErrorMessage(browserErrorI18nLanguage(), error));
  if (error instanceof Error && error.stack) {
    localized.stack = error.stack.replace(error.message, localized.message);
  }
  return localized;
}

contextBridge.exposeInMainWorld("ccr", {
  applyClaudeAppGateway: (config?: AppConfig) => invoke(IPC_CHANNELS.appApplyClaudeAppGateway, config) as Promise<ClaudeAppGatewayApplyResult>,
  applyProfile: () => invoke(IPC_CHANNELS.appApplyProfile) as Promise<ProfileApplyResult>,
  cancelBotGatewayQrLogin: (request: BotGatewayQrLoginCancelRequest) => invoke(IPC_CHANNELS.appBotGatewayQrLoginCancel, request) as Promise<BotGatewayQrLoginCancelResult>,
  checkProviderConnectivity: (request: GatewayProviderConnectivityCheckRequest) => invoke(IPC_CHANNELS.appCheckProviderConnectivity, request) as Promise<GatewayProviderConnectivityCheckReport>,
  closeBotGatewayQrWindow: (request: BotGatewayQrWindowCloseRequest) => invoke(IPC_CHANNELS.appBotGatewayQrWindowClose, request) as Promise<BotGatewayQrWindowCloseResult>,
  clearProxyNetworkCaptures: () => invoke(IPC_CHANNELS.appClearProxyNetworkCaptures) as Promise<ProxyNetworkSnapshot>,
  closeTray: () => invoke(IPC_CHANNELS.appCloseTray) as Promise<void>,
  detectProviderIcon: (request: ProviderIconDetectionRequest) => invoke(IPC_CHANNELS.appDetectProviderIcon, request) as Promise<ProviderIconDetectionResult>,
  exportData: () => invoke(IPC_CHANNELS.appExportData) as Promise<AppDataExportResult>,
  fetchProviderManifest: (request: ProviderManifestFetchRequest) => invoke(IPC_CHANNELS.appFetchProviderManifest, request) as Promise<ProviderManifestFetchResult>,
  getAgentAnalysis: (filter?: AgentAnalysisFilter) => invoke(IPC_CHANNELS.appGetAgentAnalysis, filter) as Promise<AgentAnalysisSnapshot>,
  getAgentTracePayload: (request: AgentAnalysisTracePayloadRequest) => invoke(IPC_CHANNELS.appGetAgentTracePayload, request) as Promise<AgentAnalysisTracePayloadFullResult>,
  getAppInfo: () => invoke(IPC_CHANNELS.appGetInfo) as Promise<AppInfo>,
  getConfig: () => invoke(IPC_CHANNELS.appGetConfig) as Promise<AppConfig>,
  getGatewayStatus: () => invoke(IPC_CHANNELS.appGetGatewayStatus) as Promise<GatewayStatus>,
  getLocalAgentProviderCandidates: () => invoke(IPC_CHANNELS.appGetLocalAgentProviderCandidates) as Promise<LocalAgentProviderCandidate[]>,
  getOnboardingFinished: () => invoke(IPC_CHANNELS.appGetOnboardingFinished) as Promise<boolean>,
  getPendingProviderDeepLinks: () => invoke(IPC_CHANNELS.appGetPendingProviderDeepLinks) as Promise<ProviderDeepLinkRequest[]>,
  getProfileOpenCommand: (request: ProfileOpenRequest) => invoke(IPC_CHANNELS.appGetProfileOpenCommand, request) as Promise<ProfileOpenCommandResult>,
  getProfileRuntimeStatus: () => invoke(IPC_CHANNELS.appGetProfileRuntimeStatus) as Promise<ProfileRuntimeStatus>,
  getProviderAccountSnapshots: (provider?: string, options?: ProviderAccountSnapshotRequestOptions) => invoke(IPC_CHANNELS.appGetProviderAccountSnapshots, provider, options) as Promise<ProviderAccountSnapshot[]>,
  getProviderCatalogModels: (request: ProviderCatalogModelsRequest) => invoke(IPC_CHANNELS.appGetProviderCatalogModels, request) as Promise<ProviderCatalogModelsResult>,
  getProviderPresets: () => invoke(IPC_CHANNELS.appGetProviderPresets) as Promise<ProviderPreset[]>,
  getPluginMarketplace: () => invoke(IPC_CHANNELS.appGetPluginMarketplace) as Promise<PluginMarketplaceEntry[]>,
  getProxyCertificateStatus: () => invoke(IPC_CHANNELS.appGetProxyCertificateStatus) as Promise<ProxyCertificateStatus>,
  getProxyNetworkCaptures: () => invoke(IPC_CHANNELS.appGetProxyNetworkCaptures) as Promise<ProxyNetworkSnapshot>,
  getProxyStatus: () => invoke(IPC_CHANNELS.appGetProxyStatus) as Promise<ProxyStatus>,
  getRequestLogs: (filter?: RequestLogListFilter) => invoke(IPC_CHANNELS.appGetRequestLogs, filter) as Promise<RequestLogPage>,
  getUpdateStatus: () => invoke(IPC_CHANNELS.appGetUpdateStatus) as Promise<AppUpdateStatus>,
  getUsageStats: (range?: UsageStatsRange, filter?: UsageStatsFilter) => invoke(IPC_CHANNELS.appGetUsageStats, range, filter) as Promise<UsageStatsSnapshot>,
  installProxyCertificate: () => invoke(IPC_CHANNELS.appInstallProxyCertificate) as Promise<ProxyCertificateInstallResult>,
  importLocalAgentProvider: (request: LocalAgentProviderImportRequest) => invoke(IPC_CHANNELS.appImportLocalAgentProvider, request) as Promise<LocalAgentProviderImportResult>,
  listMcpServerTools: (serverName: string) => invoke(IPC_CHANNELS.appListMcpServerTools, serverName) as Promise<GatewayMcpToolInfo[]>,
  openBuiltInBrowser: () => invoke(IPC_CHANNELS.appOpenBuiltInBrowser) as Promise<void>,
  openBotGatewayQrWindow: (request: BotGatewayQrWindowOpenRequest) => invoke(IPC_CHANNELS.appBotGatewayQrWindowOpen, request) as Promise<BotGatewayQrWindowOpenResult>,
  openExternal: (url: string) => invoke(IPC_CHANNELS.appOpenExternal, url) as Promise<void>,
  openProfile: (request: ProfileOpenRequest) => invoke(IPC_CHANNELS.appOpenProfile, request) as Promise<ProfileOpenResult>,
  probeProviderCandidates: (request: GatewayProviderProbeCandidatesRequest) => invoke(IPC_CHANNELS.appProbeProviderCandidates, request) as Promise<GatewayProviderProbeCandidateResult | undefined>,
  probeProvider: (request: GatewayProviderProbeRequest) => invoke(IPC_CHANNELS.appProbeProvider, request) as Promise<GatewayProviderProbeResult>,
  quitApp: () => invoke(IPC_CHANNELS.appQuit) as Promise<void>,
  revealProxyCertificate: () => invoke(IPC_CHANNELS.appRevealProxyCertificate) as Promise<void>,
  restartGateway: () => invoke(IPC_CHANNELS.appRestartGateway) as Promise<GatewayStatus>,
  restartProxy: () => invoke(IPC_CHANNELS.appRestartProxy) as Promise<ProxyStatus>,
  saveApiKeys: (apiKeys: ApiKeyConfig[]) => invoke(IPC_CHANNELS.appSaveApiKeys, apiKeys) as Promise<AppConfig>,
  saveConfig: (config: AppConfig) => invoke(IPC_CHANNELS.appSaveConfig, config) as Promise<AppConfig>,
  selectPluginDirectory: () => invoke(IPC_CHANNELS.appSelectPluginDirectory) as Promise<PluginDirectorySelection | undefined>,
  setOnboardingFinished: () => invoke(IPC_CHANNELS.appSetOnboardingFinished) as Promise<boolean>,
  setProxyNetworkCaptureEnabled: (enabled: boolean) => invoke(IPC_CHANNELS.appSetProxyNetworkCaptureEnabled, enabled) as Promise<ProxyNetworkSnapshot>,
  setTrayDetailOpen: (open: boolean, provider?: string) => invoke(IPC_CHANNELS.appSetTrayDetailOpen, open, provider) as Promise<void>,
  showMainWindow: () => invoke(IPC_CHANNELS.appShowMainWindow) as Promise<void>,
  startGateway: () => invoke(IPC_CHANNELS.appStartGateway) as Promise<GatewayStatus>,
  startBotGatewayQrLogin: (request: BotGatewayQrLoginStartRequest) => invoke(IPC_CHANNELS.appBotGatewayQrLoginStart, request) as Promise<BotGatewayQrLoginStartResult>,
  stopGateway: () => invoke(IPC_CHANNELS.appStopGateway) as Promise<GatewayStatus>,
  stopProfile: (request: ProfileOpenRequest) => invoke(IPC_CHANNELS.appStopProfile, request) as Promise<ProfileStopResult>,
  scanBotHandoffBluetoothTargets: () => invoke(IPC_CHANNELS.appBotHandoffBluetoothTargetsScan) as Promise<BotHandoffScanTarget[]>,
  scanBotHandoffWifiTargets: () => invoke(IPC_CHANNELS.appBotHandoffWifiTargetsScan) as Promise<BotHandoffScanTarget[]>,
  testProviderAccountConnector: (request: ProviderAccountTestRequest) => invoke(IPC_CHANNELS.appTestProviderAccountConnector, request) as Promise<ProviderAccountTestResult>,
  updateCheck: () => invoke(IPC_CHANNELS.appUpdateCheck) as Promise<AppUpdateStatus>,
  updateDownload: () => invoke(IPC_CHANNELS.appUpdateDownload) as Promise<AppUpdateStatus>,
  updateInstall: () => invoke(IPC_CHANNELS.appUpdateInstall) as Promise<void>,
  waitBotGatewayQrLogin: (request: BotGatewayQrLoginWaitRequest) => invoke(IPC_CHANNELS.appBotGatewayQrLoginWait, request) as Promise<BotGatewayQrLoginWaitResult>,
  onBeforeQuit: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.appBeforeQuit, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appBeforeQuit, handler);
  },
  onProviderDeepLink: (callback: (request: ProviderDeepLinkRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: ProviderDeepLinkRequest) => callback(request);
    ipcRenderer.on(IPC_CHANNELS.appProviderDeepLink, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appProviderDeepLink, handler);
  },
  onOpenSettingsRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.appOpenSettings, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appOpenSettings, handler);
  },
  onUpdateStatusChanged: (callback: (status: AppUpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.appUpdateStatusChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appUpdateStatusChanged, handler);
  }
});
