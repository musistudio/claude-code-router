import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import packageJson from "../../package.json";
import { loadPersistedAppSetting, replacePersistedAppSetting } from "./app-config-store";
import { scanBotHandoffBluetoothTargets, scanBotHandoffWifiTargets } from "./bot-handoff-scan-service";
import { cancelBotGatewayQrLogin, startBotGatewayQrLogin, waitBotGatewayQrLogin } from "./bot-gateway-qr-login-service";
import { syncClaudeAppGatewayConfig, restoreClaudeAppGatewayConfig } from "./claude-app-gateway-service";
import { loadAppConfig, saveApiKeysConfig, saveAppConfig } from "./config";
import { API_KEYS_DB_FILE, APP_CONFIG_DB_FILE, APP_NAME, CONFIGDIR, CONFIG_FILE, DATADIR, GATEWAY_CONFIG_FILE, LEGACY_CONFIG_FILE, ONBOARDING_FINISHED_FILE, PROXY_CA_CERT_FILE, REQUEST_LOGS_DB_FILE, USAGE_DB_FILE } from "./constants";
import { detectProviderIcon } from "./provider-icons";
import { fetchProviderManifest } from "./provider-manifest-service";
import { getLocalAgentProviderCandidates, importLocalAgentProvider } from "./local-agent-provider-service";
import { getProviderCatalogModels } from "./provider-model-catalog";
import { getProviderPresets } from "./presets";
import { checkGatewayProviderConnectivity, probeGatewayProvider, probeGatewayProviderCandidates } from "./provider-probe";
import { applyProfileConfig } from "./profile-service";
import { getProfileOpenCommand, getProfileRuntimeStatus, openProfileFromCcr, stopProfileFromCcr } from "./profile-launch-service";
import { ensureProxyCertificateAuthority } from "../server/proxy/certificates";
import { proxyService } from "../server/proxy/service";
import { listMcpServerTools } from "../server/mcp/tool-discovery";
import { getAgentAnalysis, getAgentTracePayload, getRequestLogs } from "./request-log-store";
import { getUsageStats } from "./usage-store";
import { gatewayService } from "../server/gateway/service";
import { getProviderAccountSnapshots, invalidateProviderAccountSnapshotCache, testProviderAccountConnector } from "./provider-account-service";
import type {
  AgentAnalysisFilter,
  AgentAnalysisTracePayloadRequest,
  ApiKeyConfig,
  AppConfig,
  AppDataExportResult,
  AppInfo,
  AppSaveConfigOptions,
  AppUpdateStatus,
  BotGatewayQrLoginCancelRequest,
  BotGatewayQrLoginStartRequest,
  BotGatewayQrLoginWaitRequest,
  BotGatewayQrWindowOpenRequest,
  GatewayPluginAppConfig,
  GatewayProviderConnectivityCheckRequest,
  GatewayProviderProbeCandidatesRequest,
  GatewayProviderProbeRequest,
  GatewayStatus,
  LocalAgentProviderImportRequest,
  PluginDependency,
  PluginDirectorySelection,
  PluginMarketplaceEntry,
  ProfileApplyResult,
  ProfileOpenRequest,
  ProviderAccountSnapshotRequestOptions,
  ProviderAccountTestRequest,
  ProviderCatalogModelsRequest,
  ProviderIconDetectionRequest,
  ProviderManifestFetchRequest,
  RequestLogListFilter,
  UsageStatsFilter,
  UsageStatsRange
} from "../shared/app";

export type WebManagementServerOptions = {
  host?: string;
  open?: boolean;
  port?: number;
  startGateway?: boolean;
};

export type WebManagementServerRuntime = {
  close: () => Promise<void>;
  server: Server;
  url: string;
};

type RpcRequest = {
  args?: unknown[];
  method?: string;
};

type RpcHandler = (...args: unknown[]) => Promise<unknown> | unknown;

const defaultWebHost = "127.0.0.1";
const defaultWebPort = 3458;
const onboardingFinishedAtSettingKey = "onboardingFinishedAt";
const maxRpcBodyBytes = 8 * 1024 * 1024;
const staticRoot = path.resolve(__dirname, "..", "renderer");
const homeHtmlFile = path.join(staticRoot, "pages", "home", "index.html");
const rendererAssetsRoot = path.join(staticRoot, "assets");
const webBridgeScriptTag = '    <script src="../../assets/web-client-bridge.js"></script>';

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

export async function startWebManagementServer(options: WebManagementServerOptions = {}): Promise<WebManagementServerRuntime> {
  const host = options.host?.trim() || readEnvString("CCR_WEB_HOST") || defaultWebHost;
  const requestedPort = options.port ?? readEnvPort("CCR_WEB_PORT") ?? defaultWebPort;
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      sendJson(response, 500, { error: { message: formatError(error) }, ok: false });
    });
  });

  const listenedPort = await listenWithFallback(server, requestedPort, host);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : listenedPort;
  const url = `http://${formatListenHost(host)}:${port}/`;

  if (options.startGateway !== false) {
    await startConfiguredServices("web startup");
  }
  if (options.open) {
    await openSystemExternal(url).catch((error) => {
      console.warn(`[web] Failed to open ${url}: ${formatError(error)}`);
    });
  }

  return {
    close: async () => {
      await closeServer(server);
      await stopConfiguredServices();
    },
    server,
    url
  };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = requestUrl(request);
  if (url.pathname === "/api/ccr/rpc") {
    await handleRpcRequest(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }
  if (url.pathname === "/" || url.pathname === "/pages/home/index.html") {
    sendHomeHtml(response, request.method === "HEAD");
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    sendStaticFile(response, rendererAssetsRoot, decodeURIComponent(url.pathname.slice("/assets/".length)), request.method === "HEAD");
    return;
  }
  sendText(response, 404, "Not found");
}

async function handleRpcRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { message: "RPC only supports POST." }, ok: false });
    return;
  }

  let payload: RpcRequest;
  try {
    payload = JSON.parse((await readRequestBody(request, maxRpcBodyBytes)).toString("utf8")) as RpcRequest;
  } catch (error) {
    sendJson(response, 400, { error: { message: `Invalid JSON: ${formatError(error)}` }, ok: false });
    return;
  }

  const method = typeof payload.method === "string" ? payload.method.trim() : "";
  const handler = rpcHandlers[method];
  if (!method || !handler) {
    sendJson(response, 404, { error: { message: `Unknown CCR web RPC method: ${method || "(empty)"}` }, ok: false });
    return;
  }

  try {
    const value = await handler(...(Array.isArray(payload.args) ? payload.args : []));
    sendJson(response, 200, { ok: true, value });
  } catch (error) {
    sendJson(response, 500, { error: { message: formatError(error) }, ok: false });
  }
}

const unsupportedUpdateStatus: AppUpdateStatus = {
  canCheck: false,
  canDownload: false,
  canInstall: false,
  currentVersion: packageJson.version,
  lastError: "Updates are only available in the desktop app.",
  state: "idle",
  supported: false
};

const rpcHandlers: Record<string, RpcHandler> = {
  applyClaudeAppGateway: async (config?: unknown) => {
    const previousConfig = await loadAppConfig();
    const baseConfig = config ? await saveAppConfig(config as AppConfig) : previousConfig;
    const synced = await syncClaudeAppGatewayConfig(baseConfig);
    const savedConfig = synced.config;
    let runtimeStatus = gatewayService.getStatus();
    if (synced.configChanged || shouldRestartForRuntimeChange(previousConfig, savedConfig) || runtimeStatus.state !== "running") {
      runtimeStatus = await gatewayService.start(savedConfig);
    } else {
      gatewayService.updateConfig(savedConfig);
    }
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
  },
  applyProfile: async () => applyProfileConfig(await loadAppConfig()),
  cancelBotGatewayQrLogin: (request) => cancelBotGatewayQrLogin(request as BotGatewayQrLoginCancelRequest),
  checkProviderConnectivity: (request) => checkGatewayProviderConnectivity(request as GatewayProviderConnectivityCheckRequest),
  clearProxyNetworkCaptures: () => proxyService.clearNetworkCaptures(),
  closeBotGatewayQrWindow: (_request) => ({ closed: false }),
  detectProviderIcon: (request) => detectProviderIcon(request as ProviderIconDetectionRequest),
  exportData: () => exportAppData(),
  fetchProviderManifest: (request) => fetchProviderManifest(request as ProviderManifestFetchRequest),
  getAgentAnalysis: (filter) => getAgentAnalysis(filter as AgentAnalysisFilter | undefined),
  getAgentTracePayload: (request) => getAgentTracePayload(request as AgentAnalysisTracePayloadRequest),
  getAppInfo: () => getCliAppInfo(),
  getConfig: () => loadAppConfig(),
  getGatewayStatus: () => gatewayService.getStatus(),
  getLocalAgentProviderCandidates: () => getLocalAgentProviderCandidates(),
  getOnboardingFinished: async () => Boolean(readString(await loadPersistedAppSetting(onboardingFinishedAtSettingKey)) || existsSync(ONBOARDING_FINISHED_FILE)),
  getPluginMarketplace: () => pluginMarketplace,
  getProfileOpenCommand: async (request) => getProfileOpenCommand(await loadAppConfig(), request as ProfileOpenRequest),
  getProfileRuntimeStatus: () => getProfileRuntimeStatus(),
  getProviderAccountSnapshots: (provider, options) => getProviderAccountSnapshots(provider as string | undefined, options as ProviderAccountSnapshotRequestOptions | undefined),
  getProviderCatalogModels: (request) => getProviderCatalogModels(request as ProviderCatalogModelsRequest),
  getProviderPresets: () => getProviderPresets(),
  getProxyCertificateStatus: () => proxyService.getCertificateStatus(),
  getProxyNetworkCaptures: () => proxyService.getNetworkCaptures(),
  getProxyStatus: () => proxyService.getStatus(),
  getRequestLogs: (filter) => getRequestLogs(filter as RequestLogListFilter | undefined),
  getUpdateStatus: () => unsupportedUpdateStatus,
  getUsageStats: (range, filter) => getUsageStats(range as UsageStatsRange | undefined, filter as UsageStatsFilter | undefined),
  importLocalAgentProvider: (request) => importLocalAgentProvider(request as LocalAgentProviderImportRequest),
  installProxyCertificate: () => proxyService.installCertificate(),
  listMcpServerTools: async (serverName) => {
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
  },
  openBotGatewayQrWindow: async (request) => {
    const qrRequest = request as BotGatewayQrWindowOpenRequest;
    await openSystemExternal(qrRequest.url);
    return {
      message: "Opened the QR login URL in your default browser.",
      observed: false,
      opened: true
    };
  },
  openBuiltInBrowser: async () => {
    const config = await loadAppConfig();
    const appUrl = firstConfiguredBrowserAppUrl(config) || "about:blank";
    if (appUrl === "about:blank") {
      throw new Error("No browser app is configured.");
    }
    await openSystemExternal(appUrl);
  },
  openProfile: async (request) => {
    const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
    const config = syncedClaudeAppConfig.config;
    const status = await gatewayService.start(config);
    if (status.state !== "running") {
      throw new Error(status.lastError || "CCR gateway did not start.");
    }
    logProfileApplyResult(await applyProfileConfig(config));
    return openProfileFromCcr(config, request as ProfileOpenRequest);
  },
  probeProvider: (request) => probeGatewayProvider(request as GatewayProviderProbeRequest),
  probeProviderCandidates: (request) => probeGatewayProviderCandidates(request as GatewayProviderProbeCandidatesRequest),
  quitApp: async () => {
    setTimeout(() => process.kill(process.pid, "SIGTERM"), 50).unref();
  },
  restartGateway: async () => {
    const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
    const config = syncedClaudeAppConfig.config;
    const status = await gatewayService.start(config);
    await applyProfileIfServiceRunning(config, status);
    return status;
  },
  restartProxy: async () => {
    const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
    const config = syncedClaudeAppConfig.config;
    const status = await gatewayService.start(config);
    await applyProfileIfServiceRunning(config, status);
    return proxyService.getStatus();
  },
  revealProxyCertificate: async () => {
    ensureProxyCertificateAuthority();
    await revealFile(PROXY_CA_CERT_FILE);
  },
  saveApiKeys: async (apiKeys) => {
    const savedConfig = await saveApiKeysConfig(apiKeys as ApiKeyConfig[]);
    const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(savedConfig);
    const nextConfig = syncedClaudeAppConfig.config;
    gatewayService.updateConfig(nextConfig);
    logProfileApplyResult(await applyProfileConfig(nextConfig));
    invalidateProviderAccountSnapshotCache();
    return nextConfig;
  },
  saveConfig: async (config, options) => {
    const previousConfig = await loadAppConfig();
    const nextInput = config as AppConfig;
    if (nextInput.proxy.enabled) {
      const certificateStatus = await proxyService.getCertificateStatus();
      if (!certificateStatus.trusted) {
        throw new Error(certificateStatus.message);
      }
    }
    let savedConfig = await saveAppConfig(nextInput);
    const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(savedConfig);
    savedConfig = syncedClaudeAppConfig.config;
    let runtimeStatus = gatewayService.getStatus();
    if (syncedClaudeAppConfig.configChanged || shouldRestartForRuntimeChange(previousConfig, savedConfig)) {
      runtimeStatus = await gatewayService.start(savedConfig);
    } else {
      gatewayService.updateConfig(savedConfig);
    }
    if ((options as AppSaveConfigOptions | undefined)?.applyProfile !== false) {
      await applyProfileIfServiceRunning(savedConfig, runtimeStatus);
    }
    invalidateProviderAccountSnapshotCache();
    return savedConfig;
  },
  scanBotHandoffBluetoothTargets: () => scanBotHandoffBluetoothTargets(),
  scanBotHandoffWifiTargets: () => scanBotHandoffWifiTargets(),
  selectPluginDirectory: (directory) => inspectPluginDirectory(readRequiredString(directory, "Plugin directory path is required.")),
  setOnboardingFinished: async () => {
    await replacePersistedAppSetting(onboardingFinishedAtSettingKey, new Date().toISOString());
    return true;
  },
  setProxyNetworkCaptureEnabled: (enabled) => proxyService.setNetworkCaptureEnabled(Boolean(enabled)),
  startBotGatewayQrLogin: (request) => startBotGatewayQrLogin(request as BotGatewayQrLoginStartRequest),
  startGateway: async () => {
    const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
    const config = syncedClaudeAppConfig.config;
    const status = await gatewayService.start(config);
    await applyProfileIfServiceRunning(config, status);
    return status;
  },
  stopGateway: () => gatewayService.stop(),
  stopProfile: async (request) => stopProfileFromCcr(await loadAppConfig(), request as ProfileOpenRequest),
  testProviderAccountConnector: (request) => testProviderAccountConnector(request as ProviderAccountTestRequest),
  updateCheck: () => unsupportedUpdateStatus,
  updateDownload: () => unsupportedUpdateStatus,
  updateInstall: () => {
    throw new Error("Updates are only available in the desktop app.");
  },
  waitBotGatewayQrLogin: (request) => waitBotGatewayQrLogin(request as BotGatewayQrLoginWaitRequest)
};

async function startConfiguredServices(reason: string): Promise<void> {
  try {
    let config = await loadAppConfig();
    try {
      config = (await syncClaudeAppGatewayConfig(config)).config;
    } catch (error) {
      console.error(`Failed to sync Claude App gateway config during ${reason}: ${formatError(error)}`);
    }
    const status = await gatewayService.start(config);
    if (status.state === "error") {
      console.error(`Failed to start gateway during ${reason}: ${status.lastError}`);
    }
    if (status.state === "running") {
      const profileResult = await applyProfileConfig(config);
      logProfileApplyResult(profileResult);
    }
    if (config.proxy.enabled && config.proxy.systemProxy) {
      const proxyStatus = await proxyService.ensureSystemProxyActive();
      if (proxyStatus.systemProxy.state !== "active") {
        const details = proxyStatus.systemProxy.lastError ? `: ${proxyStatus.systemProxy.lastError}` : "";
        console.error(`Proxy mode is enabled, but system proxy is ${proxyStatus.systemProxy.state} during ${reason}${details}`);
      }
    }
  } catch (error) {
    console.error(`Failed to start configured services during ${reason}: ${formatError(error)}`);
  }
}

async function stopConfiguredServices(): Promise<void> {
  await gatewayService.stop({ proxyRestoreTimeoutMs: 30_000 }).catch((error) => {
    console.error(`Failed to stop gateway: ${formatError(error)}`);
  });
  try {
    restoreClaudeAppGatewayConfig();
  } catch (error) {
    console.error(`Failed to restore Claude App gateway config: ${formatError(error)}`);
  }
}

async function applyProfileIfServiceRunning(config: AppConfig, status: GatewayStatus): Promise<void> {
  if (status.state !== "running") {
    return;
  }
  logProfileApplyResult(await applyProfileConfig(config));
}

function logProfileApplyResult(result: ProfileApplyResult): void {
  for (const client of result.clients) {
    if (!client.ok) {
      console.warn(`[profile:${client.client}] ${client.message}`);
    }
  }
}

function shouldRestartForRuntimeChange(previousConfig: AppConfig, nextConfig: AppConfig): boolean {
  return (
    previousConfig.gateway.enabled !== nextConfig.gateway.enabled ||
    previousConfig.gateway.host !== nextConfig.gateway.host ||
    previousConfig.gateway.port !== nextConfig.gateway.port ||
    previousConfig.gateway.coreHost !== nextConfig.gateway.coreHost ||
    previousConfig.gateway.corePort !== nextConfig.gateway.corePort ||
    previousConfig.proxy.enabled !== nextConfig.proxy.enabled ||
    previousConfig.proxy.host !== nextConfig.proxy.host ||
    previousConfig.proxy.mode !== nextConfig.proxy.mode ||
    previousConfig.proxy.port !== nextConfig.proxy.port ||
    previousConfig.proxy.systemProxy !== nextConfig.proxy.systemProxy ||
    JSON.stringify(previousConfig.proxy.targets) !== JSON.stringify(nextConfig.proxy.targets) ||
    JSON.stringify(previousConfig.agent) !== JSON.stringify(nextConfig.agent) ||
    JSON.stringify(previousConfig.Providers) !== JSON.stringify(nextConfig.Providers) ||
    JSON.stringify(previousConfig.plugins) !== JSON.stringify(nextConfig.plugins) ||
    JSON.stringify(previousConfig.providerPlugins) !== JSON.stringify(nextConfig.providerPlugins) ||
    JSON.stringify(previousConfig.virtualModelProfiles) !== JSON.stringify(nextConfig.virtualModelProfiles)
  );
}

function getCliAppInfo(): AppInfo {
  return {
    appConfigDbFile: APP_CONFIG_DB_FILE,
    apiKeysDbFile: API_KEYS_DB_FILE,
    configDir: CONFIGDIR,
    configFile: CONFIG_FILE,
    dataDir: DATADIR,
    gatewayConfigFile: GATEWAY_CONFIG_FILE,
    name: APP_NAME,
    platform: process.platform,
    requestLogsDbFile: REQUEST_LOGS_DB_FILE,
    usageDbFile: USAGE_DB_FILE,
    version: packageJson.version
  };
}

function sendHomeHtml(response: ServerResponse, headOnly: boolean): void {
  if (!existsSync(homeHtmlFile)) {
    sendText(response, 500, "CCR renderer assets were not found. Run npm run build:assets first.");
    return;
  }
  let html = readFileSync(homeHtmlFile, "utf8");
  if (!html.includes("web-client-bridge.js")) {
    html = html.replace('    <script type="module" src="../../assets/main.js"></script>', `${webBridgeScriptTag}\n    <script type="module" src="../../assets/main.js"></script>`);
  }
  sendBuffer(response, 200, Buffer.from(html, "utf8"), "text/html; charset=utf-8", headOnly);
}

function sendStaticFile(response: ServerResponse, root: string, relativePath: string, headOnly: boolean): void {
  const normalizedRelativePath = relativePath.replace(/^[/\\]+/, "");
  const file = path.resolve(root, normalizedRelativePath);
  const resolvedRoot = path.resolve(root);
  if (!file.startsWith(`${resolvedRoot}${path.sep}`) && file !== resolvedRoot) {
    sendText(response, 403, "Forbidden");
    return;
  }
  if (!isFile(file)) {
    sendText(response, 404, "Not found");
    return;
  }
  sendBuffer(response, 200, readFileSync(file), contentTypeForFile(file), headOnly);
}

function sendBuffer(response: ServerResponse, status: number, body: Buffer, contentType: string, headOnly: boolean): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": body.length,
    "content-type": contentType
  });
  if (headOnly) {
    response.end();
    return;
  }
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": body.length,
    "content-type": "application/json; charset=utf-8"
  });
  response.end(body);
}

function sendText(response: ServerResponse, status: number, text: string): void {
  sendBuffer(response, status, Buffer.from(`${text}\n`, "utf8"), "text/plain; charset=utf-8", false);
}

function requestUrl(request: IncomingMessage): URL {
  return new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
}

function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once("end", () => resolve(Buffer.concat(chunks)));
    request.once("error", reject);
  });
}

async function listenWithFallback(server: Server, port: number, host: string): Promise<number> {
  let candidate = port;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await listen(server, candidate, host);
      return candidate;
    } catch (error) {
      if (!isAddressInUseError(error) || candidate >= 65535) {
        throw error;
      }
      candidate += 1;
    }
  }
  throw new Error(`No available CCR web management port found starting at ${port}.`);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function exportAppData(): Promise<AppDataExportResult> {
  const exportedAt = new Date().toISOString();
  const exportDir = defaultExportDir();
  mkdirSync(exportDir, { recursive: true });
  const file = path.join(exportDir, `claude-code-router-data-${fileSafeTimestamp(exportedAt)}.json`);
  assertExportTargetIsNotInternalDataFile(file);
  const payload = {
    app: {
      name: APP_NAME,
      platform: process.platform,
      version: packageJson.version
    },
    appState: {
      onboardingFinished: Boolean(readString(await loadPersistedAppSetting(onboardingFinishedAtSettingKey)) || existsSync(ONBOARDING_FINISHED_FILE))
    },
    config: await loadAppConfig(),
    exportedAt,
    files: readDataExportFiles(),
    kind: "claude-code-router-data-export",
    version: 1
  };

  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    canceled: false,
    exportedAt,
    file
  };
}

function defaultExportDir(): string {
  const downloads = path.join(os.homedir(), "Downloads");
  return existsSync(downloads) ? downloads : CONFIGDIR;
}

function readDataExportFiles(): Array<{ base64: string; name: string; path: string; sizeBytes: number }> {
  const files: Array<{ base64: string; name: string; path: string; sizeBytes: number }> = [];
  for (const file of dataExportCandidateFiles()) {
    try {
      if (!isFile(file)) {
        continue;
      }
      const stat = statSync(file);
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

function inspectPluginDirectory(directory: string): PluginDirectorySelection {
  const manifest = readFirstJson([
    path.join(directory, "plugin.json"),
    path.join(directory, "ccr-plugin.json"),
    path.join(directory, ".ccr-plugin", "plugin.json"),
    path.join(directory, ".codex-plugin", "plugin.json")
  ]);
  const packageJsonManifest = readFirstJson([path.join(directory, "package.json")]);
  const moduleValue =
    readString(manifest?.module) ||
    readString(manifest?.main) ||
    readString(manifest?.path) ||
    readString(readRecord(packageJsonManifest?.ccr)?.module) ||
    readString(readRecord(packageJsonManifest?.ccrPlugin)?.module) ||
    readString(packageJsonManifest?.main);
  const id =
    pluginIdValue(readString(manifest?.id) || readString(manifest?.key) || readString(packageJsonManifest?.name)) ||
    pluginIdValue(path.basename(directory)) ||
    "plugin";
  const name = readString(manifest?.name) || readString(packageJsonManifest?.displayName) || readString(packageJsonManifest?.name);
  const apps = readPluginApps(manifest, packageJsonManifest);
  return {
    ...(apps.length ? { apps } : {}),
    dependencies: readPluginDependencies(directory, manifest, packageJsonManifest),
    directory,
    id,
    modulePath: resolvePluginDirectoryModule(directory, moduleValue),
    ...(name ? { name } : {})
  };
}

function readPluginApps(
  manifest: Record<string, unknown> | undefined,
  packageJsonManifest: Record<string, unknown> | undefined
): GatewayPluginAppConfig[] {
  const values = [
    manifest?.apps,
    readRecord(manifest?.ccr)?.apps,
    readRecord(manifest?.ccrPlugin)?.apps,
    readRecord(packageJsonManifest?.ccr)?.apps,
    readRecord(packageJsonManifest?.ccrPlugin)?.apps
  ];
  const apps = values.flatMap(parsePluginApps);
  const byId = new Map<string, GatewayPluginAppConfig>();
  for (const app of apps) {
    const key = app.id || `${app.name}:${app.url}`;
    if (!byId.has(key)) {
      byId.set(key, app);
    }
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
  const url = readString(record.url) || readString(record.href) || readString(record.target);
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

function readPluginDependencies(
  directory: string,
  manifest: Record<string, unknown> | undefined,
  packageJsonManifest: Record<string, unknown> | undefined
): PluginDependency[] {
  const values = [
    manifest?.dependencies,
    manifest?.pluginDependencies,
    readRecord(manifest?.ccr)?.dependencies,
    readRecord(manifest?.ccrPlugin)?.dependencies,
    readRecord(packageJsonManifest?.ccr)?.dependencies,
    readRecord(packageJsonManifest?.ccrPlugin)?.dependencies
  ];
  const dependencies = values.flatMap((value) => parsePluginDependencies(value, directory));
  const byId = new Map<string, PluginDependency>();
  for (const dependency of dependencies) {
    if (dependency.id && !byId.has(dependency.id)) {
      byId.set(dependency.id, dependency);
    }
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
  return {
    id,
    ...(modulePath ? { modulePath } : {}),
    ...(name ? { name } : {})
  };
}

function resolveDependencyModulePath(directory: string, value: string): string {
  if (value === "~" || value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.isAbsolute(value) ? value : path.join(directory, value);
}

function looksLikeDependencyModulePath(value: string): boolean {
  return value.startsWith(".") || value.startsWith("/") || value.startsWith("~");
}

function resolvePluginDirectoryModule(directory: string, moduleValue: string | undefined): string {
  if (moduleValue) {
    return path.isAbsolute(moduleValue) ? moduleValue : path.join(directory, moduleValue);
  }

  for (const filename of ["index.cjs", "index.mjs", "index.js", "plugin.cjs", "plugin.mjs", "plugin.js"]) {
    const candidate = path.join(directory, filename);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  return directory;
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

function firstConfiguredBrowserAppUrl(config: AppConfig): string | undefined {
  for (const plugin of config.plugins) {
    if (plugin.enabled === false) {
      continue;
    }
    const app = plugin.apps?.find((candidate) => readString(candidate.url));
    if (app?.url) {
      return app.url;
    }
  }
  return undefined;
}

async function revealFile(file: string): Promise<void> {
  if (process.platform === "darwin") {
    await execDetached("/usr/bin/open", ["-R", file]);
    return;
  }
  if (process.platform === "win32") {
    await execDetached("explorer.exe", ["/select,", file]);
    return;
  }
  await openSystemExternal(pathToFileURL(path.dirname(file)).toString());
}

function openSystemExternal(target: string): Promise<void> {
  if (!target || target === "about:blank") {
    return Promise.resolve();
  }
  if (process.platform === "darwin") {
    return execDetached("/usr/bin/open", [target]);
  }
  if (process.platform === "win32") {
    return execDetached("cmd.exe", ["/d", "/s", "/c", "start", "", target]);
  }
  return execDetached("xdg-open", [target]);
}

function execDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function contentTypeForFile(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".gif":
      return "image/gif";
    case ".html":
      return "text/html; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function readRequiredString(value: unknown, message: string): string {
  const text = readString(value);
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readEnvString(key: string): string | undefined {
  return readString(process.env[key]);
}

function readEnvPort(key: string): number | undefined {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : undefined;
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

function fileSafeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function formatListenHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function isAddressInUseError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "EADDRINUSE";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
