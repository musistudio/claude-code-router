type CcrApi = NonNullable<Window["ccr"]>;

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
    body: JSON.stringify({ args: trimTrailingUndefined(args), method }),
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
      : response.status === 404
        ? "CCR management service is unavailable. Make sure the CCR app or ccr ui command is running, then retry."
        : `CCR web API failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload.value;
}

function trimTrailingUndefined(args: unknown[]): unknown[] {
  let end = args.length;
  while (end > 0 && args[end - 1] === undefined) {
    end -= 1;
  }
  return end === args.length ? args : args.slice(0, end);
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

function normalizeExternalHttpUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be opened.");
  }
  return url.toString();
}

const webClientBridge: CcrApi = {
  applyClaudeAppGateway: (config) => rpc("applyClaudeAppGateway", [config]) as ReturnType<CcrApi["applyClaudeAppGateway"]>,
  applyProfile: () => rpc("applyProfile") as ReturnType<CcrApi["applyProfile"]>,
  cancelBotGatewayQrLogin: (request) => rpc("cancelBotGatewayQrLogin", [request]) as ReturnType<CcrApi["cancelBotGatewayQrLogin"]>,
  checkProviderConnectivity: (request) => rpc("checkProviderConnectivity", [request]) as ReturnType<CcrApi["checkProviderConnectivity"]>,
  clearProxyNetworkCaptures: () => rpc("clearProxyNetworkCaptures") as ReturnType<CcrApi["clearProxyNetworkCaptures"]>,
  closeBotGatewayQrWindow: (request) => rpc("closeBotGatewayQrWindow", [request]) as ReturnType<CcrApi["closeBotGatewayQrWindow"]>,
  closeTray: () => Promise.resolve(),
  detectProviderIcon: (request) => rpc("detectProviderIcon", [request]) as ReturnType<CcrApi["detectProviderIcon"]>,
  exportData: () => rpc("exportData") as ReturnType<CcrApi["exportData"]>,
  fetchProviderManifest: (request) => rpc("fetchProviderManifest", [request]) as ReturnType<CcrApi["fetchProviderManifest"]>,
  getAgentAnalysis: (filter) => rpc("getAgentAnalysis", [filter]) as ReturnType<CcrApi["getAgentAnalysis"]>,
  getAgentTracePayload: (request) => rpc("getAgentTracePayload", [request]) as ReturnType<CcrApi["getAgentTracePayload"]>,
  getAppInfo: () => rpc("getAppInfo") as ReturnType<CcrApi["getAppInfo"]>,
  getConfig: () => rpc("getConfig") as ReturnType<CcrApi["getConfig"]>,
  getGatewayStatus: () => rpc("getGatewayStatus") as ReturnType<CcrApi["getGatewayStatus"]>,
  getLocalAgentProviderCandidates: () => rpc("getLocalAgentProviderCandidates") as ReturnType<CcrApi["getLocalAgentProviderCandidates"]>,
  getOnboardingFinished: () => rpc("getOnboardingFinished") as ReturnType<CcrApi["getOnboardingFinished"]>,
  getPendingProviderDeepLinks: () => Promise.resolve([]),
  getPluginMarketplace: () => rpc("getPluginMarketplace") as ReturnType<CcrApi["getPluginMarketplace"]>,
  getProfileOpenCommand: (request) => rpc("getProfileOpenCommand", [request]) as ReturnType<CcrApi["getProfileOpenCommand"]>,
  getProfileRuntimeStatus: () => rpc("getProfileRuntimeStatus") as ReturnType<CcrApi["getProfileRuntimeStatus"]>,
  getProviderAccountSnapshots: (provider, options) => rpc("getProviderAccountSnapshots", [provider, options]) as ReturnType<CcrApi["getProviderAccountSnapshots"]>,
  getProviderCatalogModels: (request) => rpc("getProviderCatalogModels", [request]) as ReturnType<CcrApi["getProviderCatalogModels"]>,
  getProviderPresets: () => rpc("getProviderPresets") as ReturnType<CcrApi["getProviderPresets"]>,
  getProxyCertificateStatus: () => rpc("getProxyCertificateStatus") as ReturnType<CcrApi["getProxyCertificateStatus"]>,
  getProxyNetworkCaptures: () => rpc("getProxyNetworkCaptures") as ReturnType<CcrApi["getProxyNetworkCaptures"]>,
  getProxyStatus: () => rpc("getProxyStatus") as ReturnType<CcrApi["getProxyStatus"]>,
  getRequestLogDetail: (request) => rpc("getRequestLogDetail", [request]) as ReturnType<CcrApi["getRequestLogDetail"]>,
  getRequestLogs: (filter) => rpc("getRequestLogs", [filter]) as ReturnType<CcrApi["getRequestLogs"]>,
  getUpdateStatus: () => rpc("getUpdateStatus") as ReturnType<CcrApi["getUpdateStatus"]>,
  getUsageStats: (range, filter) => rpc("getUsageStats", [range, filter]) as ReturnType<CcrApi["getUsageStats"]>,
  importLocalAgentProvider: (request) => rpc("importLocalAgentProvider", [request]) as ReturnType<CcrApi["importLocalAgentProvider"]>,
  installProxyCertificate: () => rpc("installProxyCertificate") as ReturnType<CcrApi["installProxyCertificate"]>,
  listMcpServerTools: (serverName) => rpc("listMcpServerTools", [serverName]) as ReturnType<CcrApi["listMcpServerTools"]>,
  onBeforeQuit: noopSubscription,
  onOpenSettingsRequest: noopSubscription,
  onOpenUpdateRequest: noopSubscription,
  onProviderDeepLink: noopSubscription,
  onUpdateStatusChanged: noopSubscription,
  openBotGatewayQrWindow: (request) => rpc("openBotGatewayQrWindow", [request]) as ReturnType<CcrApi["openBotGatewayQrWindow"]>,
  openBuiltInBrowser: () => rpc("openBuiltInBrowser") as ReturnType<CcrApi["openBuiltInBrowser"]>,
  openExternal: async (url) => {
    window.open(normalizeExternalHttpUrl(url), "_blank", "noopener,noreferrer");
  },
  openProfile: (request) => rpc("openProfile", [request]) as ReturnType<CcrApi["openProfile"]>,
  probeLocalAgentProvider: (request) => rpc("probeLocalAgentProvider", [request]) as ReturnType<NonNullable<CcrApi["probeLocalAgentProvider"]>>,
  probeProvider: (request) => rpc("probeProvider", [request]) as ReturnType<CcrApi["probeProvider"]>,
  probeProviderCandidates: (request) => rpc("probeProviderCandidates", [request]) as ReturnType<CcrApi["probeProviderCandidates"]>,
  quitApp: () => rpc("quitApp") as ReturnType<CcrApi["quitApp"]>,
  restartGateway: () => rpc("restartGateway") as ReturnType<CcrApi["restartGateway"]>,
  restartProxy: () => rpc("restartProxy") as ReturnType<CcrApi["restartProxy"]>,
  revealProxyCertificate: () => rpc("revealProxyCertificate") as ReturnType<CcrApi["revealProxyCertificate"]>,
  resetCodexRateLimitCredit: (request) => rpc("resetCodexRateLimitCredit", [request]) as ReturnType<CcrApi["resetCodexRateLimitCredit"]>,
  saveApiKeys: (apiKeys) => rpc("saveApiKeys", [apiKeys]) as ReturnType<CcrApi["saveApiKeys"]>,
  saveConfig: (config, options) => rpc("saveConfig", [config, options]) as ReturnType<CcrApi["saveConfig"]>,
  scanBotHandoffBluetoothTargets: () => rpc("scanBotHandoffBluetoothTargets") as ReturnType<CcrApi["scanBotHandoffBluetoothTargets"]>,
  scanBotHandoffWifiTargets: () => rpc("scanBotHandoffWifiTargets") as ReturnType<CcrApi["scanBotHandoffWifiTargets"]>,
  selectPluginDirectory: () => selectPluginDirectory() as ReturnType<CcrApi["selectPluginDirectory"]>,
  setOnboardingFinished: () => rpc("setOnboardingFinished") as ReturnType<CcrApi["setOnboardingFinished"]>,
  setProxyNetworkCaptureEnabled: (enabled) => rpc("setProxyNetworkCaptureEnabled", [enabled]) as ReturnType<CcrApi["setProxyNetworkCaptureEnabled"]>,
  setTrayDetailOpen: () => Promise.resolve(),
  showMainWindow: () => Promise.resolve(),
  startBotGatewayQrLogin: (request) => rpc("startBotGatewayQrLogin", [request]) as ReturnType<CcrApi["startBotGatewayQrLogin"]>,
  startGateway: () => rpc("startGateway") as ReturnType<CcrApi["startGateway"]>,
  stopGateway: () => rpc("stopGateway") as ReturnType<CcrApi["stopGateway"]>,
  stopProfile: (request) => rpc("stopProfile", [request]) as ReturnType<CcrApi["stopProfile"]>,
  testProviderAccountConnector: (request) => rpc("testProviderAccountConnector", [request]) as ReturnType<CcrApi["testProviderAccountConnector"]>,
  testRouteScript: (request) => rpc("testRouteScript", [request]) as ReturnType<CcrApi["testRouteScript"]>,
  updateCheck: () => rpc("updateCheck") as ReturnType<CcrApi["updateCheck"]>,
  updateDownload: () => rpc("updateDownload") as ReturnType<CcrApi["updateDownload"]>,
  updateInstall: () => rpc("updateInstall") as ReturnType<CcrApi["updateInstall"]>,
  validateRouteScript: (request) => rpc("validateRouteScript", [request]) as ReturnType<CcrApi["validateRouteScript"]>,
  waitBotGatewayQrLogin: (request) => rpc("waitBotGatewayQrLogin", [request]) as ReturnType<CcrApi["waitBotGatewayQrLogin"]>
};

if (!window.ccr) {
  window.ccr = webClientBridge;
}
