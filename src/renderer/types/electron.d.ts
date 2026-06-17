export {};

import type {
  AgentAnalysisFilter,
  AgentAnalysisSnapshot,
  AppConfig,
  AppInfo,
  ApiKeyConfig,
  GatewayProviderProbeRequest,
  GatewayProviderProbeResult,
  GatewayStatus,
  PluginDirectorySelection,
  PluginMarketplaceEntry,
  ProviderIconDetectionRequest,
  ProviderIconDetectionResult,
  ProviderAccountSnapshot,
  ProviderDeepLinkRequest,
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
      applyProfile: () => Promise<ProfileApplyResult>;
      clearProxyNetworkCaptures: () => Promise<ProxyNetworkSnapshot>;
      closeTray: () => Promise<void>;
      detectProviderIcon: (request: ProviderIconDetectionRequest) => Promise<ProviderIconDetectionResult>;
      getAgentAnalysis: (filter?: AgentAnalysisFilter) => Promise<AgentAnalysisSnapshot>;
      getAppInfo: () => Promise<AppInfo>;
      getConfig: () => Promise<AppConfig>;
      getGatewayStatus: () => Promise<GatewayStatus>;
      getOnboardingFinished: () => Promise<boolean>;
      getPendingProviderDeepLinks: () => Promise<ProviderDeepLinkRequest[]>;
      getProviderAccountSnapshots: (provider?: string) => Promise<ProviderAccountSnapshot[]>;
      getPluginMarketplace: () => Promise<PluginMarketplaceEntry[]>;
      getProxyCertificateStatus: () => Promise<ProxyCertificateStatus>;
      getProxyNetworkCaptures: () => Promise<ProxyNetworkSnapshot>;
      getProxyStatus: () => Promise<ProxyStatus>;
      getRequestLogs: (filter?: RequestLogListFilter) => Promise<RequestLogPage>;
      getUsageStats: (range?: UsageStatsRange, filter?: UsageStatsFilter) => Promise<UsageStatsSnapshot>;
      installProxyCertificate: () => Promise<ProxyCertificateInstallResult>;
      openBuiltInBrowser: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
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
      stopGateway: () => Promise<GatewayStatus>;
      onBeforeQuit: (callback: () => void) => () => void;
      onProviderDeepLink: (callback: (request: ProviderDeepLinkRequest) => void) => () => void;
    };
  }
}
