export {};

import type {
  AgentAnalysisFilter,
  AgentAnalysisSnapshot,
  AppConfig,
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
  GatewayMcpServerConfig,
  GatewayMcpToolInfo,
  GatewayProviderProbeRequest,
  GatewayProviderProbeResult,
  GatewayStatus,
  PluginDirectorySelection,
  PluginMarketplaceEntry,
  ProfileOpenCommandResult,
  ProfileOpenRequest,
  ProfileOpenResult,
  ProviderAccountTestRequest,
  ProviderAccountTestResult,
  ProviderIconDetectionRequest,
  ProviderIconDetectionResult,
  ProviderAccountSnapshot,
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
} from "../../shared/app";

declare global {
  interface Window {
    ccr?: {
      applyClaudeAppGateway: (config?: AppConfig) => Promise<ClaudeAppGatewayApplyResult>;
      applyProfile: () => Promise<ProfileApplyResult>;
      cancelBotGatewayQrLogin: (request: BotGatewayQrLoginCancelRequest) => Promise<BotGatewayQrLoginCancelResult>;
      closeBotGatewayQrWindow: (request: BotGatewayQrWindowCloseRequest) => Promise<BotGatewayQrWindowCloseResult>;
      clearProxyNetworkCaptures: () => Promise<ProxyNetworkSnapshot>;
      closeTray: () => Promise<void>;
      detectProviderIcon: (request: ProviderIconDetectionRequest) => Promise<ProviderIconDetectionResult>;
      fetchProviderManifest: (request: ProviderManifestFetchRequest) => Promise<ProviderManifestFetchResult>;
      getAgentAnalysis: (filter?: AgentAnalysisFilter) => Promise<AgentAnalysisSnapshot>;
      getAppInfo: () => Promise<AppInfo>;
      getConfig: () => Promise<AppConfig>;
      getGatewayStatus: () => Promise<GatewayStatus>;
      getOnboardingFinished: () => Promise<boolean>;
      getPendingProviderDeepLinks: () => Promise<ProviderDeepLinkRequest[]>;
      getProfileOpenCommand: (request: ProfileOpenRequest) => Promise<ProfileOpenCommandResult>;
      getProviderAccountSnapshots: (provider?: string) => Promise<ProviderAccountSnapshot[]>;
      getPluginMarketplace: () => Promise<PluginMarketplaceEntry[]>;
      getProxyCertificateStatus: () => Promise<ProxyCertificateStatus>;
      getProxyNetworkCaptures: () => Promise<ProxyNetworkSnapshot>;
      getProxyStatus: () => Promise<ProxyStatus>;
      getRequestLogs: (filter?: RequestLogListFilter) => Promise<RequestLogPage>;
      getUpdateStatus: () => Promise<AppUpdateStatus>;
      getUsageStats: (range?: UsageStatsRange, filter?: UsageStatsFilter) => Promise<UsageStatsSnapshot>;
      installProxyCertificate: () => Promise<ProxyCertificateInstallResult>;
      listMcpServerTools: (server: GatewayMcpServerConfig) => Promise<GatewayMcpToolInfo[]>;
      openBuiltInBrowser: () => Promise<void>;
      openBotGatewayQrWindow: (request: BotGatewayQrWindowOpenRequest) => Promise<BotGatewayQrWindowOpenResult>;
      openExternal: (url: string) => Promise<void>;
      openProfile: (request: ProfileOpenRequest) => Promise<ProfileOpenResult>;
      probeProvider: (request: GatewayProviderProbeRequest) => Promise<GatewayProviderProbeResult>;
      quitApp: () => Promise<void>;
      revealProxyCertificate: () => Promise<void>;
      restartGateway: () => Promise<GatewayStatus>;
      restartProxy: () => Promise<ProxyStatus>;
      saveApiKeys: (apiKeys: ApiKeyConfig[]) => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<AppConfig>;
      selectPluginDirectory: () => Promise<PluginDirectorySelection | undefined>;
      setOnboardingFinished: () => Promise<boolean>;
      setProxyNetworkCaptureEnabled: (enabled: boolean) => Promise<ProxyNetworkSnapshot>;
      setTrayDetailOpen: (open: boolean, provider?: string) => Promise<void>;
      showMainWindow: () => Promise<void>;
      startGateway: () => Promise<GatewayStatus>;
      startBotGatewayQrLogin: (request: BotGatewayQrLoginStartRequest) => Promise<BotGatewayQrLoginStartResult>;
      stopGateway: () => Promise<GatewayStatus>;
      scanBotHandoffBluetoothTargets: () => Promise<BotHandoffScanTarget[]>;
      scanBotHandoffWifiTargets: () => Promise<BotHandoffScanTarget[]>;
      testProviderAccountConnector: (request: ProviderAccountTestRequest) => Promise<ProviderAccountTestResult>;
      updateCheck: () => Promise<AppUpdateStatus>;
      updateDownload: () => Promise<AppUpdateStatus>;
      updateInstall: () => Promise<void>;
      waitBotGatewayQrLogin: (request: BotGatewayQrLoginWaitRequest) => Promise<BotGatewayQrLoginWaitResult>;
      onBeforeQuit: (callback: () => void) => () => void;
      onProviderDeepLink: (callback: (request: ProviderDeepLinkRequest) => void) => () => void;
      onUpdateStatusChanged: (callback: (status: AppUpdateStatus) => void) => () => void;
    };
  }
}
