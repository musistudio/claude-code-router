import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { builtInBrowserService } from "./built-in-browser";
import { loadAppConfig, saveApiKeysConfig, saveAppConfig } from "./config";
import { API_KEYS_DB_FILE, APP_NAME, CONFIGDIR, CONFIG_FILE, DATADIR, GATEWAY_CONFIG_FILE, IPC_CHANNELS, ONBOARDING_FINISHED_FILE, PROXY_CA_CERT_FILE, REQUEST_LOGS_DB_FILE, USAGE_DB_FILE } from "./constants";
import { deepLinkService } from "./deep-link";
import { gatewayService } from "./gateway/service";
import { getProviderAccountSnapshots } from "./provider-account-service";
import { detectProviderIcon } from "./provider-icons";
import { probeGatewayProvider } from "./provider-probe";
import { applyProfileConfig } from "./profile-service";
import { ensureProxyCertificateAuthority } from "./proxy/certificates";
import { proxyService } from "./proxy/service";
import { getAgentAnalysis, getRequestLogs } from "./request-log-store";
import trayController from "./tray-controller";
import { getUsageStats } from "./usage-store";
import windowsManager from "./windows";
import type { AgentAnalysisFilter, ApiKeyConfig, AppConfig, AppInfo, GatewayPluginAppConfig, GatewayProviderProbeRequest, GatewayStatus, PluginDependency, PluginDirectorySelection, PluginMarketplaceEntry, ProfileApplyResult, ProviderIconDetectionRequest, RequestLogListFilter, UsageStatsFilter, UsageStatsRange } from "../shared/app";

const pluginMarketplace: PluginMarketplaceEntry[] = [
  {
    apps: [
      {
        description: "Open Claude Design through the CCR browser proxy.",
        id: "claude-design",
        name: "Claude Design",
        url: "https://claude.ai/design"
      }
    ],
    capabilities: ["Wrapper runtime", "Browser app", "Claude Design", "Model routing"],
    dependencies: [],
    description: "Routes Claude Design traffic through the local CCR wrapper backend with configurable model routing.",
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

ipcMain.handle(IPC_CHANNELS.appGetInfo, () => {
  return {
    apiKeysDbFile: API_KEYS_DB_FILE,
    configDir: CONFIGDIR,
    configFile: CONFIG_FILE,
    dataDir: DATADIR,
    gatewayConfigFile: GATEWAY_CONFIG_FILE,
    name: APP_NAME,
    platform: process.platform,
    requestLogsDbFile: REQUEST_LOGS_DB_FILE,
    usageDbFile: USAGE_DB_FILE,
    version: app.getVersion()
  } satisfies AppInfo;
});

ipcMain.handle(IPC_CHANNELS.appGetConfig, () => loadAppConfig());
ipcMain.handle(IPC_CHANNELS.appGetOnboardingFinished, () => existsSync(ONBOARDING_FINISHED_FILE));
ipcMain.handle(IPC_CHANNELS.appGetPendingProviderDeepLinks, () => deepLinkService.consumePendingProviderRequests());
ipcMain.handle(IPC_CHANNELS.appGetProviderAccountSnapshots, (_event, provider?: string) => getProviderAccountSnapshots(provider));
ipcMain.handle(IPC_CHANNELS.appGetAgentAnalysis, (_event, filter?: AgentAnalysisFilter) => getAgentAnalysis(filter));
ipcMain.handle(IPC_CHANNELS.appGetGatewayStatus, () => gatewayService.getStatus());
ipcMain.handle(IPC_CHANNELS.appGetProxyCertificateStatus, () => proxyService.getCertificateStatus());
ipcMain.handle(IPC_CHANNELS.appGetProxyNetworkCaptures, () => proxyService.getNetworkCaptures());
ipcMain.handle(IPC_CHANNELS.appGetProxyStatus, () => proxyService.getStatus());
ipcMain.handle(IPC_CHANNELS.appGetPluginMarketplace, () => pluginMarketplace);
ipcMain.handle(IPC_CHANNELS.appGetRequestLogs, (_event, filter?: RequestLogListFilter) => getRequestLogs(filter));
ipcMain.handle(IPC_CHANNELS.appGetUsageStats, (_event, range?: UsageStatsRange, filter?: UsageStatsFilter) => getUsageStats(range, filter));
ipcMain.handle(IPC_CHANNELS.appInstallProxyCertificate, () => proxyService.installCertificate());
ipcMain.handle(IPC_CHANNELS.appOpenBuiltInBrowser, async () => {
  const config = await loadAppConfig();
  await ensureBuiltInBrowserProxyReady(config);
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
ipcMain.handle(IPC_CHANNELS.appApplyProfile, async () => {
  const config = await loadAppConfig();
  return applyProfileConfig(config);
});
ipcMain.handle(IPC_CHANNELS.appProbeProvider, (_event, request: GatewayProviderProbeRequest) => {
  return probeGatewayProvider(request);
});
ipcMain.handle(IPC_CHANNELS.appQuit, () => {
  app.quit();
});
ipcMain.handle(IPC_CHANNELS.appRevealProxyCertificate, () => {
  ensureProxyCertificateAuthority();
  shell.showItemInFolder(PROXY_CA_CERT_FILE);
});
ipcMain.handle(IPC_CHANNELS.appSaveConfig, async (_event, config: AppConfig) => {
  const previousConfig = await loadAppConfig();
  if (config.proxy.enabled) {
    const certificateStatus = await proxyService.getCertificateStatus();
    if (!certificateStatus.trusted) {
      throw new Error(certificateStatus.message);
    }
  }
  const savedConfig = await saveAppConfig(config);
  let runtimeStatus = gatewayService.getStatus();
  if (shouldRestartForRuntimeChange(previousConfig, savedConfig)) {
    runtimeStatus = await gatewayService.start(savedConfig);
  } else {
    gatewayService.updateConfig(savedConfig);
  }
  await applyProfileIfServiceRunning(savedConfig, runtimeStatus);
  await builtInBrowserService.syncProxy(savedConfig);
  await trayController.refreshIconFromConfig(savedConfig);
  return savedConfig;
});
ipcMain.handle(IPC_CHANNELS.appSaveApiKeys, async (_event, apiKeys: ApiKeyConfig[]) => {
  const savedConfig = await saveApiKeysConfig(apiKeys);
  gatewayService.updateConfig(savedConfig);
  logProfileApplyResult(await applyProfileConfig(savedConfig));
  return savedConfig;
});
ipcMain.handle(IPC_CHANNELS.appSetOnboardingFinished, () => {
  mkdirSync(CONFIGDIR, { recursive: true });
  writeFileSync(ONBOARDING_FINISHED_FILE, `${new Date().toISOString()}\n`, "utf8");
  return true;
});
ipcMain.handle(IPC_CHANNELS.appRestartGateway, async () => {
  const config = await loadAppConfig();
  const status = await gatewayService.start(config);
  await applyProfileIfServiceRunning(config, status);
  await builtInBrowserService.syncProxy(config);
  return status;
});
ipcMain.handle(IPC_CHANNELS.appStartGateway, async () => {
  const config = await loadAppConfig();
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
ipcMain.handle(IPC_CHANNELS.appSetTrayDetailOpen, (_event, open: boolean, provider?: string) => {
  trayController.setDetailOpen(Boolean(open), provider);
});
ipcMain.handle(IPC_CHANNELS.appShowMainWindow, () => {
  trayController.hidePopover();
  windowsManager.showMainWindow();
});
ipcMain.handle(IPC_CHANNELS.appRestartProxy, async () => {
  const config = await loadAppConfig();
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

type ProxyConnectProbeResult = {
  detail?: string;
  ok: boolean;
};

const browserProxyConnectProbeTarget = "claude.ai:443";
const proxyConnectProbeTimeoutMs = 3000;

async function ensureBuiltInBrowserProxyReady(config: AppConfig): Promise<void> {
  if (!config.proxy.enabled) {
    return;
  }

  let proxyStatus = proxyService.getStatus();
  if (proxyStatus.state === "running" && proxyStatus.endpoint) {
    const probe = await probeProxyConnect(proxyStatus.endpoint);
    if (probe.ok) {
      return;
    }
    console.warn(`[browser] Proxy CONNECT probe failed at ${proxyStatus.endpoint}; restarting proxy: ${probe.detail || "unknown error"}`);
  }

  const status = await gatewayService.start(config);
  if (status.state === "error") {
    throw new Error(status.lastError || "Failed to start proxy mode.");
  }

  proxyStatus = proxyService.getStatus();
  if (proxyStatus.state !== "running" || !proxyStatus.endpoint) {
    throw new Error(proxyStatus.lastError || "Proxy mode is not running.");
  }

  const probe = await probeProxyConnect(proxyStatus.endpoint);
  if (probe.ok) {
    return;
  }

  console.warn(
    `[browser] Shared proxy endpoint ${proxyStatus.endpoint} still does not accept CONNECT after restart; starting dedicated proxy endpoint: ${probe.detail || "unknown error"}`
  );
  const dedicatedProxyConfig = await createBuiltInBrowserProxyConfig(config);
  const dedicatedProxyStatus = await proxyService.start(dedicatedProxyConfig);
  if (dedicatedProxyStatus.state !== "running" || !dedicatedProxyStatus.endpoint) {
    throw new Error(dedicatedProxyStatus.lastError || "Failed to start the dedicated proxy endpoint for the built-in browser.");
  }

  const dedicatedProbe = await probeProxyConnect(dedicatedProxyStatus.endpoint);
  if (!dedicatedProbe.ok) {
    const detail = dedicatedProbe.detail ? `: ${dedicatedProbe.detail}` : "";
    throw new Error(`Proxy mode is running at ${dedicatedProxyStatus.endpoint}, but HTTPS CONNECT is not available${detail}.`);
  }
}

async function createBuiltInBrowserProxyConfig(config: AppConfig): Promise<AppConfig> {
  return {
    ...config,
    proxy: {
      ...config.proxy,
      host: "127.0.0.1",
      port: await findAvailableLoopbackPort(),
      systemProxy: false
    }
  };
}

function findAvailableLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address || typeof address === "string") {
          reject(new Error("Failed to allocate a local proxy port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function probeProxyConnect(endpoint: string): Promise<ProxyConnectProbeResult> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      resolve({ detail: `Invalid proxy endpoint: ${endpoint}`, ok: false });
      return;
    }

    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      resolve({ detail: `Invalid proxy port in endpoint: ${endpoint}`, ok: false });
      return;
    }

    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    const socket = net.connect({ host, port });
    let response = "";
    let settled = false;

    const finish = (result: ProxyConnectProbeResult) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const parseResponse = (): ProxyConnectProbeResult | undefined => {
      const firstLine = response.split(/\r?\n/, 1)[0]?.trim();
      if (!firstLine) {
        return undefined;
      }
      if (/^HTTP\/1\.[01]\s+200\b/i.test(firstLine)) {
        return { ok: true };
      }
      if (/^HTTP\/1\.[01]\s+\d{3}\b/i.test(firstLine)) {
        return { detail: firstLine, ok: false };
      }
      return { detail: `Unexpected response: ${firstLine}`, ok: false };
    };

    socket.setTimeout(proxyConnectProbeTimeoutMs, () => {
      finish({ detail: `Timed out after ${proxyConnectProbeTimeoutMs}ms`, ok: false });
    });
    socket.once("error", (error) => {
      finish({ detail: formatError(error), ok: false });
    });
    socket.once("connect", () => {
      socket.write(`CONNECT ${browserProxyConnectProbeTarget} HTTP/1.1\r\nHost: ${browserProxyConnectProbeTarget}\r\n\r\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("latin1");
      const result = parseResponse();
      if (result) {
        finish(result);
      }
    });
    socket.once("close", () => {
      finish(parseResponse() ?? { detail: "Connection closed without a CONNECT response", ok: false });
    });
  });
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
  return {
    ...(apps.length ? { apps } : {}),
    dependencies: readPluginDependencies(directory, manifest, packageJson),
    directory,
    id,
    modulePath: resolvePluginDirectoryModule(directory, moduleValue),
    ...(name ? { name } : {})
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
  return {
    id,
    ...(modulePath ? { modulePath } : {}),
    ...(name ? { name } : {})
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
