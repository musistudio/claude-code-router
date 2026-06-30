const rpcEndpoint = "/api/ccr/rpc";
const webAuthHeader = "x-ccr-web-auth";
const webAuthQueryParam = "ccr_web_token";
const webAuthStorageKey = "ccr.webAuthToken";
const webAuthToken = readWebAuthToken();

type RpcResponse =
  | { ok: true; value: unknown }
  | { error: { message: string; stack?: string }; ok: false };

async function rpc(method: string, args: unknown[] = []): Promise<unknown> {
  const response = await fetch(rpcEndpoint, {
    body: JSON.stringify({ args, method }),
    headers: {
      "content-type": "application/json",
      ...(webAuthToken ? { [webAuthHeader]: webAuthToken } : {})
    },
    method: "POST"
  });
  let payload: RpcResponse | undefined;
  try {
    payload = await response.json() as RpcResponse;
  } catch {
    payload = undefined;
  }
  if (!response.ok || !payload?.ok) {
    const message = payload && !payload.ok
      ? payload.error.message
      : `CCR web API failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload.value;
}

function readWebAuthToken(): string {
  const tokenFromUrl = readWebAuthTokenFromUrl();
  if (tokenFromUrl) {
    writeStoredWebAuthToken(tokenFromUrl);
    return tokenFromUrl;
  }
  return readStoredWebAuthToken();
}

function readWebAuthTokenFromUrl(): string {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get(webAuthQueryParam)?.trim() ?? "";
    if (!token) {
      return "";
    }
    url.searchParams.delete(webAuthQueryParam);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return token;
  } catch {
    return "";
  }
}

function readStoredWebAuthToken(): string {
  try {
    return window.sessionStorage.getItem(webAuthStorageKey)?.trim() ?? "";
  } catch {
    return "";
  }
}

function writeStoredWebAuthToken(token: string): void {
  try {
    window.sessionStorage.setItem(webAuthStorageKey, token);
  } catch {
    // The in-memory token still works for the current page load if storage is unavailable.
  }
}

function noopSubscription(): () => void {
  return () => undefined;
}

async function selectPluginDirectory(): Promise<unknown> {
  const directory = window.prompt("Plugin directory path");
  if (!directory?.trim()) {
    return undefined;
  }
  return rpc("selectPluginDirectory", [directory.trim()]);
}

window.ccr = {
  applyClaudeAppGateway: (config) => rpc("applyClaudeAppGateway", [config]) as ReturnType<NonNullable<typeof window.ccr>["applyClaudeAppGateway"]>,
  applyProfile: () => rpc("applyProfile") as ReturnType<NonNullable<typeof window.ccr>["applyProfile"]>,
  cancelBotGatewayQrLogin: (request) => rpc("cancelBotGatewayQrLogin", [request]) as ReturnType<NonNullable<typeof window.ccr>["cancelBotGatewayQrLogin"]>,
  checkProviderConnectivity: (request) => rpc("checkProviderConnectivity", [request]) as ReturnType<NonNullable<typeof window.ccr>["checkProviderConnectivity"]>,
  clearProxyNetworkCaptures: () => rpc("clearProxyNetworkCaptures") as ReturnType<NonNullable<typeof window.ccr>["clearProxyNetworkCaptures"]>,
  closeBotGatewayQrWindow: (request) => rpc("closeBotGatewayQrWindow", [request]) as ReturnType<NonNullable<typeof window.ccr>["closeBotGatewayQrWindow"]>,
  closeTray: () => Promise.resolve(),
  detectProviderIcon: (request) => rpc("detectProviderIcon", [request]) as ReturnType<NonNullable<typeof window.ccr>["detectProviderIcon"]>,
  exportData: () => rpc("exportData") as ReturnType<NonNullable<typeof window.ccr>["exportData"]>,
  fetchProviderManifest: (request) => rpc("fetchProviderManifest", [request]) as ReturnType<NonNullable<typeof window.ccr>["fetchProviderManifest"]>,
  getAgentAnalysis: (filter) => rpc("getAgentAnalysis", [filter]) as ReturnType<NonNullable<typeof window.ccr>["getAgentAnalysis"]>,
  getAgentTracePayload: (request) => rpc("getAgentTracePayload", [request]) as ReturnType<NonNullable<typeof window.ccr>["getAgentTracePayload"]>,
  getAppInfo: () => rpc("getAppInfo") as ReturnType<NonNullable<typeof window.ccr>["getAppInfo"]>,
  getConfig: () => rpc("getConfig") as ReturnType<NonNullable<typeof window.ccr>["getConfig"]>,
  getGatewayStatus: () => rpc("getGatewayStatus") as ReturnType<NonNullable<typeof window.ccr>["getGatewayStatus"]>,
  getLocalAgentProviderCandidates: () => rpc("getLocalAgentProviderCandidates") as ReturnType<NonNullable<typeof window.ccr>["getLocalAgentProviderCandidates"]>,
  getOnboardingFinished: () => rpc("getOnboardingFinished") as ReturnType<NonNullable<typeof window.ccr>["getOnboardingFinished"]>,
  getPendingProviderDeepLinks: () => Promise.resolve([]),
  getPluginMarketplace: () => rpc("getPluginMarketplace") as ReturnType<NonNullable<typeof window.ccr>["getPluginMarketplace"]>,
  getProfileOpenCommand: (request) => rpc("getProfileOpenCommand", [request]) as ReturnType<NonNullable<typeof window.ccr>["getProfileOpenCommand"]>,
  getProfileRuntimeStatus: () => rpc("getProfileRuntimeStatus") as ReturnType<NonNullable<typeof window.ccr>["getProfileRuntimeStatus"]>,
  getProviderAccountSnapshots: (provider, options) => rpc("getProviderAccountSnapshots", [provider, options]) as ReturnType<NonNullable<typeof window.ccr>["getProviderAccountSnapshots"]>,
  getProviderCatalogModels: (request) => rpc("getProviderCatalogModels", [request]) as ReturnType<NonNullable<typeof window.ccr>["getProviderCatalogModels"]>,
  getProviderPresets: () => rpc("getProviderPresets") as ReturnType<NonNullable<typeof window.ccr>["getProviderPresets"]>,
  getProxyCertificateStatus: () => rpc("getProxyCertificateStatus") as ReturnType<NonNullable<typeof window.ccr>["getProxyCertificateStatus"]>,
  getProxyNetworkCaptures: () => rpc("getProxyNetworkCaptures") as ReturnType<NonNullable<typeof window.ccr>["getProxyNetworkCaptures"]>,
  getProxyStatus: () => rpc("getProxyStatus") as ReturnType<NonNullable<typeof window.ccr>["getProxyStatus"]>,
  getRequestLogDetail: (request) => rpc("getRequestLogDetail", [request]) as ReturnType<NonNullable<typeof window.ccr>["getRequestLogDetail"]>,
  getRequestLogs: (filter) => rpc("getRequestLogs", [filter]) as ReturnType<NonNullable<typeof window.ccr>["getRequestLogs"]>,
  getUpdateStatus: () => rpc("getUpdateStatus") as ReturnType<NonNullable<typeof window.ccr>["getUpdateStatus"]>,
  getUsageStats: (range, filter) => rpc("getUsageStats", [range, filter]) as ReturnType<NonNullable<typeof window.ccr>["getUsageStats"]>,
  importLocalAgentProvider: (request) => rpc("importLocalAgentProvider", [request]) as ReturnType<NonNullable<typeof window.ccr>["importLocalAgentProvider"]>,
  installProxyCertificate: () => rpc("installProxyCertificate") as ReturnType<NonNullable<typeof window.ccr>["installProxyCertificate"]>,
  listMcpServerTools: (serverName) => rpc("listMcpServerTools", [serverName]) as ReturnType<NonNullable<typeof window.ccr>["listMcpServerTools"]>,
  onBeforeQuit: noopSubscription,
  onOpenSettingsRequest: noopSubscription,
  onOpenUpdateRequest: noopSubscription,
  onProviderDeepLink: noopSubscription,
  onUpdateStatusChanged: noopSubscription,
  openBotGatewayQrWindow: (request) => rpc("openBotGatewayQrWindow", [request]) as ReturnType<NonNullable<typeof window.ccr>["openBotGatewayQrWindow"]>,
  openBuiltInBrowser: () => rpc("openBuiltInBrowser") as ReturnType<NonNullable<typeof window.ccr>["openBuiltInBrowser"]>,
  openExternal: (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  },
  openProfile: (request) => rpc("openProfile", [request]) as ReturnType<NonNullable<typeof window.ccr>["openProfile"]>,
  probeProvider: (request) => rpc("probeProvider", [request]) as ReturnType<NonNullable<typeof window.ccr>["probeProvider"]>,
  probeProviderCandidates: (request) => rpc("probeProviderCandidates", [request]) as ReturnType<NonNullable<typeof window.ccr>["probeProviderCandidates"]>,
  quitApp: () => rpc("quitApp") as ReturnType<NonNullable<typeof window.ccr>["quitApp"]>,
  restartGateway: () => rpc("restartGateway") as ReturnType<NonNullable<typeof window.ccr>["restartGateway"]>,
  restartProxy: () => rpc("restartProxy") as ReturnType<NonNullable<typeof window.ccr>["restartProxy"]>,
  revealProxyCertificate: () => rpc("revealProxyCertificate") as ReturnType<NonNullable<typeof window.ccr>["revealProxyCertificate"]>,
  saveApiKeys: (apiKeys) => rpc("saveApiKeys", [apiKeys]) as ReturnType<NonNullable<typeof window.ccr>["saveApiKeys"]>,
  saveConfig: (config, options) => rpc("saveConfig", [config, options]) as ReturnType<NonNullable<typeof window.ccr>["saveConfig"]>,
  scanBotHandoffBluetoothTargets: () => rpc("scanBotHandoffBluetoothTargets") as ReturnType<NonNullable<typeof window.ccr>["scanBotHandoffBluetoothTargets"]>,
  scanBotHandoffWifiTargets: () => rpc("scanBotHandoffWifiTargets") as ReturnType<NonNullable<typeof window.ccr>["scanBotHandoffWifiTargets"]>,
  selectPluginDirectory: () => selectPluginDirectory() as ReturnType<NonNullable<typeof window.ccr>["selectPluginDirectory"]>,
  setOnboardingFinished: () => rpc("setOnboardingFinished") as ReturnType<NonNullable<typeof window.ccr>["setOnboardingFinished"]>,
  setProxyNetworkCaptureEnabled: (enabled) => rpc("setProxyNetworkCaptureEnabled", [enabled]) as ReturnType<NonNullable<typeof window.ccr>["setProxyNetworkCaptureEnabled"]>,
  setTrayDetailOpen: () => Promise.resolve(),
  showMainWindow: () => Promise.resolve(),
  startBotGatewayQrLogin: (request) => rpc("startBotGatewayQrLogin", [request]) as ReturnType<NonNullable<typeof window.ccr>["startBotGatewayQrLogin"]>,
  startGateway: () => rpc("startGateway") as ReturnType<NonNullable<typeof window.ccr>["startGateway"]>,
  stopGateway: () => rpc("stopGateway") as ReturnType<NonNullable<typeof window.ccr>["stopGateway"]>,
  stopProfile: (request) => rpc("stopProfile", [request]) as ReturnType<NonNullable<typeof window.ccr>["stopProfile"]>,
  testProviderAccountConnector: (request) => rpc("testProviderAccountConnector", [request]) as ReturnType<NonNullable<typeof window.ccr>["testProviderAccountConnector"]>,
  updateCheck: () => rpc("updateCheck") as ReturnType<NonNullable<typeof window.ccr>["updateCheck"]>,
  updateDownload: () => rpc("updateDownload") as ReturnType<NonNullable<typeof window.ccr>["updateDownload"]>,
  updateInstall: () => rpc("updateInstall") as ReturnType<NonNullable<typeof window.ccr>["updateInstall"]>,
  waitBotGatewayQrLogin: (request) => rpc("waitBotGatewayQrLogin", [request]) as ReturnType<NonNullable<typeof window.ccr>["waitBotGatewayQrLogin"]>
};
