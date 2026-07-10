import { app, dialog } from "electron";
import path from "node:path";
import { appDeepLinkProtocol, createProviderDeepLinkRequest as createSharedProviderDeepLinkRequest, isAppDeepLinkUrl } from "@ccr/core/contracts/deep-link";
import type { AppConfig, GatewayPluginAppConfig, ProviderDeepLinkRequest } from "@ccr/core/contracts/app";
import { IPC_CHANNELS } from "@ccr/core/config/constants";
import { loadAppConfig } from "@ccr/core/config/config";
import { syncClaudeAppGatewayConfig } from "@ccr/core/agents/claude-app/gateway-service";
import { gatewayService } from "@ccr/core/gateway/service";
import { providerIdentitySafetyIssue } from "@ccr/core/providers/presets/index";
import windowsManager from "./windows";

type PluginDeepLinkRequest = {
  appId?: string;
  pluginId: string;
  rawUrl: string;
};

const pluginAppExistingGatewayProbeTimeoutMs = 2_000;
const pluginAppStartupProbeTimeoutMs = 12_000;
const pluginAppProbeIntervalMs = 250;
const pluginAppProbeRequestTimeoutMs = 1_200;

class DeepLinkService {
  private pendingProviderRequests: ProviderDeepLinkRequest[] = [];
  private pendingPluginRequests: PluginDeepLinkRequest[] = [];
  private openingPluginRequests = new Set<string>();

  register(): void {
    this.registerProtocolClient();

    app.on("open-url", (event, url) => {
      event.preventDefault();
      this.handleUrl(url);
    });

    void app.whenReady().then(() => this.flushPendingPluginRequests());
  }

  consumePendingProviderRequests(): ProviderDeepLinkRequest[] {
    const requests = [...this.pendingProviderRequests];
    this.pendingProviderRequests = [];
    return requests;
  }

  handleArgv(argv: string[]): boolean {
    const urls = argv.filter((item) => isAppDeepLinkUrl(item));
    for (const url of urls) {
      this.handleUrl(url);
    }
    return urls.length > 0;
  }

  handleUrl(url: string): void {
    let pluginRequest: PluginDeepLinkRequest | undefined;
    try {
      pluginRequest = parsePluginDeepLinkRequest(url);
    } catch (error) {
      const detail = formatError(error);
      console.error(`[deep-link] Invalid plugin link ${url}: ${detail}`);
      if (app.isReady()) {
        try {
          dialog.showErrorBox("Invalid CCR plugin link", detail);
        } catch {
          // The console error above remains available when the dialog API is unavailable.
        }
      }
      return;
    }
    if (pluginRequest) {
      this.handlePluginRequest(pluginRequest);
      return;
    }

    const request = createProviderDeepLinkRequest(url);
    this.pendingProviderRequests.push(request);
    if (this.pendingProviderRequests.length > 20) {
      this.pendingProviderRequests = this.pendingProviderRequests.slice(-20);
    }

    if (!app.isReady()) {
      return;
    }

    windowsManager.showMainWindow();
    windowsManager.broadcast(IPC_CHANNELS.appProviderDeepLink, request);
  }

  openPluginApp(pluginId: string, appId?: string): Promise<void> {
    return this.openPluginRequest({
      ...(appId ? { appId } : {}),
      pluginId,
      rawUrl: `ccr://plugin/${encodeURIComponent(pluginId)}/open`
    });
  }

  private handlePluginRequest(request: PluginDeepLinkRequest): void {
    if (!app.isReady()) {
      this.pendingPluginRequests.push(request);
      this.pendingPluginRequests = this.pendingPluginRequests.slice(-20);
      return;
    }

    void this.openPluginRequest(request);
  }

  private flushPendingPluginRequests(): void {
    const requests = [...this.pendingPluginRequests];
    this.pendingPluginRequests = [];
    for (const request of requests) {
      void this.openPluginRequest(request);
    }
  }

  private async openPluginRequest(request: PluginDeepLinkRequest): Promise<void> {
    const requestKey = `${request.pluginId}:${request.appId || ""}`;
    if (this.openingPluginRequests.has(requestKey)) {
      return;
    }
    this.openingPluginRequests.add(requestKey);

    try {
      const syncedClaudeAppConfig = await syncClaudeAppGatewayConfig(await loadAppConfig());
      const config = syncedClaudeAppConfig.config;
      const pluginApp = resolvePluginApp(config, request);
      if (!pluginApp) {
        throw new Error(`Plugin app is not configured or enabled: ${request.pluginId}`);
      }

      const currentStatus = gatewayService.getStatus();
      const startedGateway = currentStatus.state !== "running";
      const status = startedGateway ? await gatewayService.start(config) : currentStatus;
      if (status.state !== "running") {
        throw new Error(status.lastError || "CCR gateway did not start.");
      }
      const appUrl = resolveGatewayPluginAppUrl(config, pluginApp.url);
      await ensurePluginAppUrlAvailable(config, appUrl, startedGateway);

      windowsManager.openPluginAppWindow({
        id: `${request.pluginId}:${pluginApp.id || pluginApp.name}`,
        title: pluginApp.name,
        url: appUrl
      });
    } catch (error) {
      const detail = formatError(error);
      console.error(`[deep-link] Failed to open plugin app from ${request.rawUrl}: ${detail}`);
      try {
        dialog.showErrorBox("Failed to open CCR plugin app", detail);
      } catch {
        // The console error above remains available when the dialog API is unavailable.
      }
      windowsManager.showMainWindow();
    } finally {
      this.openingPluginRequests.delete(requestKey);
    }
  }

  private registerProtocolClient(): void {
    try {
      if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(appDeepLinkProtocol, process.execPath, [path.resolve(process.argv[1])]);
        return;
      }
      app.setAsDefaultProtocolClient(appDeepLinkProtocol);
    } catch (error) {
      console.warn(`[deep-link] Failed to register ${appDeepLinkProtocol} protocol: ${formatError(error)}`);
    }
  }
}

async function ensurePluginAppUrlAvailable(config: AppConfig, appUrl: string, startedGateway: boolean): Promise<void> {
  try {
    await waitForPluginAppUrl(
      appUrl,
      startedGateway ? pluginAppStartupProbeTimeoutMs : pluginAppExistingGatewayProbeTimeoutMs
    );
    return;
  } catch (error) {
    if (startedGateway) {
      throw error;
    }
    console.warn(`[deep-link] Plugin app URL was not reachable on the running gateway; restarting gateway once. ${formatError(error)}`);
  }

  const restartedStatus = await gatewayService.start(config);
  if (restartedStatus.state !== "running") {
    throw new Error(restartedStatus.lastError || "CCR gateway did not restart.");
  }
  await waitForPluginAppUrl(appUrl, pluginAppStartupProbeTimeoutMs);
}

async function waitForPluginAppUrl(appUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = "timeout";

  while (Date.now() <= deadline) {
    const probe = await probePluginAppUrl(appUrl);
    if (probe.ok) {
      return;
    }
    lastProbe = probe.detail;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await delay(Math.min(pluginAppProbeIntervalMs, remainingMs));
  }

  throw new Error(`Plugin app did not become available at ${appUrl}. Last probe: ${lastProbe}`);
}

async function probePluginAppUrl(appUrl: string): Promise<{ ok: true } | { detail: string; ok: false }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), pluginAppProbeRequestTimeoutMs);
  try {
    const response = await fetch(appUrl, {
      cache: "no-store",
      method: "HEAD",
      signal: controller.signal
    });
    if (response.ok) {
      return { ok: true };
    }
    return {
      detail: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      ok: false
    };
  } catch (error) {
    return {
      detail: formatError(error),
      ok: false
    };
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePluginDeepLinkRequest(rawUrl: string): PluginDeepLinkRequest | undefined {
  const url = new URL(rawUrl.trim());
  if (url.protocol !== `${appDeepLinkProtocol}:`) {
    return undefined;
  }

  const host = url.hostname.toLowerCase();
  const pathSegments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const isPluginHost = host === "plugin";
  const isPluginPath = pathSegments[0]?.toLowerCase() === "plugin";
  if (!isPluginHost && !isPluginPath) {
    return undefined;
  }

  const pluginId = boundedPluginId(
    url.searchParams.get("plugin") ||
      url.searchParams.get("pluginId") ||
      (isPluginHost ? pathSegments[0] : pathSegments[1])
  );
  const action = (isPluginHost ? pathSegments[1] : pathSegments[2])?.toLowerCase();
  if (action && action !== "open") {
    throw new Error(`Unsupported plugin link action: ${action}`);
  }

  const appId = boundedPluginId(url.searchParams.get("app") || url.searchParams.get("appId"), true);
  return {
    ...(appId ? { appId } : {}),
    pluginId,
    rawUrl
  };
}

function boundedPluginId(value: string | null | undefined, optional = false): string {
  const normalized = value?.trim();
  if (!normalized) {
    if (optional) {
      return "";
    }
    throw new Error("Plugin id is required.");
  }
  if (normalized.length > 120 || !/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
    throw new Error(`Invalid plugin id: ${normalized}`);
  }
  return normalized;
}

function resolvePluginApp(config: AppConfig, request: PluginDeepLinkRequest): GatewayPluginAppConfig | undefined {
  const plugin = config.plugins.find((candidate) => candidate.enabled !== false && candidate.id === request.pluginId);
  if (!plugin) {
    return undefined;
  }

  const apps = configuredPluginApps(plugin.id, plugin.apps);
  if (!apps.length) {
    return undefined;
  }

  if (request.appId) {
    return apps.find((app) => (app.id || app.name) === request.appId);
  }
  return apps[0];
}

function configuredPluginApps(_pluginId: string, apps: GatewayPluginAppConfig[] | undefined): GatewayPluginAppConfig[] {
  if (apps?.length) {
    return apps;
  }
  return [];
}

function resolveGatewayPluginAppUrl(config: AppConfig, url: string): string {
  const trimmed = normalizePluginAppUrl(url);
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const urlPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const host = normalizeGatewayPluginAppHost(config.gateway?.host || config.HOST || "127.0.0.1");
  const port = config.gateway?.port || config.PORT || 3456;
  return `http://${host}:${port}${urlPath}`;
}

function normalizePluginAppUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Plugin app URL is required.");
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

function normalizeGatewayPluginAppHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::") {
    return "127.0.0.1";
  }
  if (trimmed.includes(":") && !trimmed.startsWith("[")) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

function createProviderDeepLinkRequest(rawUrl: string): ProviderDeepLinkRequest {
  const request = createSharedProviderDeepLinkRequest(rawUrl);
  if (!request.provider) {
    return request;
  }

  const identityIssue = providerIdentitySafetyIssue({
    baseUrl: request.provider.baseUrl,
    name: request.provider.name
  });
  if (!identityIssue) {
    return request;
  }

  return {
    error: identityIssue.message,
    id: request.id,
    rawUrl: request.rawUrl,
    receivedAt: request.receivedAt
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const deepLinkService = new DeepLinkService();
