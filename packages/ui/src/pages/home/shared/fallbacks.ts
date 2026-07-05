import type {
  AppConfig,
  AppInfo,
  AppUpdateStatus,
  GatewayStatus,
  ProxyCertificateStatus,
  ProxyNetworkSnapshot,
  ProxyStatus
} from "@ccr/core/contracts/app";
import { createDefaultAppConfig } from "@ccr/core/config/default-config";

export const fallbackInfo: AppInfo = {
  appConfigDbFile: "Browser preview",
  apiKeysDbFile: "Browser preview",
  configDir: "Browser preview",
  configFile: "Browser preview",
  dataDir: "Browser preview",
  gatewayConfigFile: "Browser preview",
  launchAtLoginSupported: /^Mac|^Win/i.test(navigator.platform),
  name: "Claude Code Router",
  platform: navigator.platform,
  requestLogsDbFile: "Browser preview",
  usageDbFile: "Browser preview",
  version: "0.1.0"
};

export const fallbackUpdateStatus: AppUpdateStatus = {
  canCheck: false,
  canDownload: false,
  canInstall: false,
  currentVersion: fallbackInfo.version,
  state: "idle",
  supported: false
};

export const fallbackConfig: AppConfig = createDefaultAppConfig({
  generatedConfigFile: "Browser preview"
});

export const fallbackGatewayStatus: GatewayStatus = {
  coreEndpoint: "http://127.0.0.1:3457",
  endpoint: "http://127.0.0.1:3456",
  generatedConfigFile: "Browser preview",
  networkEndpoints: [],
  state: "stopped"
};

export const fallbackProxyStatus: ProxyStatus = {
  caCertFile: "Browser preview",
  endpoint: "http://127.0.0.1:3456",
  mode: "gateway",
  port: 3456,
  state: "stopped",
  systemProxy: {
    state: "unsupported"
  },
  targetHosts: []
};

export const fallbackProxyCertificateStatus: ProxyCertificateStatus = {
  caCertFile: "Browser preview",
  canInstall: false,
  message: "Certificate detection is available in the Electron app.",
  platform: navigator.platform,
  state: "unknown",
  trusted: false
};

export const fallbackProxyNetworkSnapshot: ProxyNetworkSnapshot = {
  capturedAt: new Date().toISOString(),
  captureEnabled: false,
  items: [],
  maxBodyBytes: 256 * 1024,
  maxEntries: 200
};
