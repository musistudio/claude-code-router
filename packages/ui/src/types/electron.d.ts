export {};

import type {
  AgentAnalysisFilter,
  AgentAnalysisSnapshot,
  AgentAnalysisTracePayloadFullResult,
  AgentAnalysisTracePayloadRequest,
  AppConfig,
  AppCaptureElementPngRequest,
  AppCaptureElementPngResult,
  AppDataExportResult,
  AppInfo,
  AppImageExportTargetRequest,
  AppImageExportTargetResult,
  AppRenderHtmlPngRequest,
  AppRenderHtmlPngResult,
  AppSaveConfigOptions,
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
  ProviderAccountResetRequest,
  ProviderAccountResetResult,
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
  RequestLogDetailRequest,
  RequestLogEntry,
  RequestLogListFilter,
  RequestLogPage,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot
} from "@ccr/core/contracts/app";
import type { ProviderPreset } from "@ccr/core/providers/presets/types";

declare global {
  interface Window {
    ccr?: {
      applyClaudeAppGateway: (config?: AppConfig) => Promise<ClaudeAppGatewayApplyResult>;
      applyProfile: () => Promise<ProfileApplyResult>;
      cancelBotGatewayQrLogin: (request: BotGatewayQrLoginCancelRequest) => Promise<BotGatewayQrLoginCancelResult>;
      captureElementPng?: (request: AppCaptureElementPngRequest) => Promise<AppCaptureElementPngResult>;
      checkProviderConnectivity: (request: GatewayProviderConnectivityCheckRequest) => Promise<GatewayProviderConnectivityCheckReport>;
      closeBotGatewayQrWindow: (request: BotGatewayQrWindowCloseRequest) => Promise<BotGatewayQrWindowCloseResult>;
      clearProxyNetworkCaptures: () => Promise<ProxyNetworkSnapshot>;
      closeTray: () => Promise<void>;
      detectProviderIcon: (request: ProviderIconDetectionRequest) => Promise<ProviderIconDetectionResult>;
      exportData: () => Promise<AppDataExportResult>;
      fetchProviderManifest: (request: ProviderManifestFetchRequest) => Promise<ProviderManifestFetchResult>;
      getAgentAnalysis: (filter?: AgentAnalysisFilter) => Promise<AgentAnalysisSnapshot>;
      getAgentTracePayload: (request: AgentAnalysisTracePayloadRequest) => Promise<AgentAnalysisTracePayloadFullResult>;
      getAppInfo: () => Promise<AppInfo>;
      getConfig: () => Promise<AppConfig>;
      getGatewayStatus: () => Promise<GatewayStatus>;
      getLocalAgentProviderCandidates: () => Promise<LocalAgentProviderCandidate[]>;
      getOnboardingFinished: () => Promise<boolean>;
      getPendingProviderDeepLinks: () => Promise<ProviderDeepLinkRequest[]>;
      getProfileOpenCommand: (request: ProfileOpenRequest) => Promise<ProfileOpenCommandResult>;
      getProfileRuntimeStatus: () => Promise<ProfileRuntimeStatus>;
      getProviderAccountSnapshots: (provider?: string, options?: ProviderAccountSnapshotRequestOptions) => Promise<ProviderAccountSnapshot[]>;
      getProviderCatalogModels: (request: ProviderCatalogModelsRequest) => Promise<ProviderCatalogModelsResult>;
      getProviderPresets: () => Promise<ProviderPreset[]>;
      getPluginMarketplace: () => Promise<PluginMarketplaceEntry[]>;
      getProxyCertificateStatus: () => Promise<ProxyCertificateStatus>;
      getProxyNetworkCaptures: () => Promise<ProxyNetworkSnapshot>;
      getProxyStatus: () => Promise<ProxyStatus>;
      getRequestLogDetail: (request: RequestLogDetailRequest) => Promise<RequestLogEntry | undefined>;
      getRequestLogs: (filter?: RequestLogListFilter) => Promise<RequestLogPage>;
      getUpdateStatus: () => Promise<AppUpdateStatus>;
      getUsageStats: (range?: UsageStatsRange, filter?: UsageStatsFilter) => Promise<UsageStatsSnapshot>;
      installProxyCertificate: () => Promise<ProxyCertificateInstallResult>;
      importLocalAgentProvider: (request: LocalAgentProviderImportRequest) => Promise<LocalAgentProviderImportResult>;
      listMcpServerTools: (serverName: string) => Promise<GatewayMcpToolInfo[]>;
      openBuiltInBrowser: () => Promise<void>;
      openBotGatewayQrWindow: (request: BotGatewayQrWindowOpenRequest) => Promise<BotGatewayQrWindowOpenResult>;
      openExternal: (url: string) => Promise<void>;
      openProfile: (request: ProfileOpenRequest) => Promise<ProfileOpenResult>;
      prepareImageExportTarget?: (request: AppImageExportTargetRequest) => Promise<AppImageExportTargetResult>;
      probeProviderCandidates: (request: GatewayProviderProbeCandidatesRequest) => Promise<GatewayProviderProbeCandidateResult | undefined>;
      probeProvider: (request: GatewayProviderProbeRequest) => Promise<GatewayProviderProbeResult>;
      quitApp: () => Promise<void>;
      revealProxyCertificate: () => Promise<void>;
      renderHtmlPng?: (request: AppRenderHtmlPngRequest) => Promise<AppRenderHtmlPngResult>;
      resetCodexRateLimitCredit: (request: ProviderAccountResetRequest) => Promise<ProviderAccountResetResult>;
      restartGateway: () => Promise<GatewayStatus>;
      restartProxy: () => Promise<ProxyStatus>;
      saveApiKeys: (apiKeys: ApiKeyConfig[]) => Promise<AppConfig>;
      saveConfig: (config: AppConfig, options?: AppSaveConfigOptions) => Promise<AppConfig>;
      selectPluginDirectory: () => Promise<PluginDirectorySelection | undefined>;
      setOnboardingFinished: () => Promise<boolean>;
      setProxyNetworkCaptureEnabled: (enabled: boolean) => Promise<ProxyNetworkSnapshot>;
      setTrayDetailOpen: (open: boolean, provider?: string) => Promise<void>;
      showMainWindow: () => Promise<void>;
      startGateway: () => Promise<GatewayStatus>;
      startBotGatewayQrLogin: (request: BotGatewayQrLoginStartRequest) => Promise<BotGatewayQrLoginStartResult>;
      stopGateway: () => Promise<GatewayStatus>;
      stopProfile: (request: ProfileOpenRequest) => Promise<ProfileStopResult>;
      scanBotHandoffBluetoothTargets: () => Promise<BotHandoffScanTarget[]>;
      scanBotHandoffWifiTargets: () => Promise<BotHandoffScanTarget[]>;
      testProviderAccountConnector: (request: ProviderAccountTestRequest) => Promise<ProviderAccountTestResult>;
      updateCheck: () => Promise<AppUpdateStatus>;
      updateDownload: () => Promise<AppUpdateStatus>;
      updateInstall: () => Promise<void>;
      waitBotGatewayQrLogin: (request: BotGatewayQrLoginWaitRequest) => Promise<BotGatewayQrLoginWaitResult>;
      onBeforeQuit: (callback: () => void) => () => void;
      onOpenSettingsRequest: (callback: () => void) => () => void;
      onOpenUpdateRequest: (callback: () => void) => () => void;
      onProviderDeepLink: (callback: (request: ProviderDeepLinkRequest) => void) => () => void;
      onUpdateStatusChanged: (callback: (status: AppUpdateStatus) => void) => () => void;
    };
  }
}
