/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApiKeyConfig, AppConfig, GatewayStatus, RouteScriptTestRequest, RouteScriptTestResult, RouteScriptValidationRequest, RouteScriptValidationResult, RouterRule } from "@ccr/core/contracts/app";
import { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, hasAvailableGatewayModels } from "@ccr/core/contracts/app";
import { loadAppConfig } from "@ccr/core/config/config";
import { backendService } from "@ccr/core/plugins/backend-service";
import { getSystemProxyUrlForProtocol } from "@ccr/core/proxy/system-proxy-fetch";
import { pluginService } from "@ccr/core/plugins/service";
import { proxyService } from "@ccr/core/proxy/service";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler";
import { isAddressInUseMessage, probeExistingCcrGateway, reloadExistingCcrGatewayConfig } from "@ccr/core/gateway/existing-gateway-probe";
import { closeServer, formatError } from "@ccr/core/gateway/http/io";
import { RawTraceSynchronizer } from "@ccr/core/observability/raw-trace-sync";
import { GatewayBillingSynchronizer } from "@ccr/core/usage/billing-sync";
import { assertLoopbackCoreHost, endpoint, formatCoreGatewayChildExit, gatewayNetworkEndpoints, generateCoreGatewayAuthToken, isCoreGatewayHealthy, loopbackCoreHostError, removeManagedCoreGatewayMarker, shouldRunGatewayRuntime, shouldRunUnifiedServer, spawnGatewayProcess, stopPreviousManagedCoreGateway, waitForCoreGatewayStop, waitForManagedCoreGatewayReady, writeManagedCoreGatewayMarker } from "@ccr/core/gateway/core-runtime/supervisor";
import { coreGatewayAuthHeader } from "@ccr/core/gateway/internal/shared";
import type { BrowserAutomationMcpIntegration, BrowserWebSearchMcpIntegration, GatewayStopOptions } from "@ccr/core/gateway/internal/shared";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline";
import { GatewayHttpRequestHandler } from "@ccr/core/gateway/http/request-handler";
import { gatewayRuntimeConfigRevision } from "@ccr/core/gateway/runtime-config-control";
import { shouldRestartGatewayForRuntimeConfigChange } from "@ccr/core/gateway/runtime-change";
import { RouteScriptRuntime } from "@ccr/core/routing/route-script-runtime";
import { buildRouteScriptInput } from "@ccr/core/routing/route-script-context";
import { compileRouterConfig } from "@ccr/core/routing/config-compiler";
import { normalizeRouteScriptResult, scriptResultPreview } from "@ccr/core/routing/route-script-result";
import { mediaService } from "@ccr/core/media/service";
import { mediaToolsGatewayEndpoint } from "@ccr/core/mcp/grok-media-config";
import { profileApiKeyId } from "@ccr/core/profiles/api-key";

type RouteScriptTestHeaders = Record<string, string | string[] | undefined>;

function routeScriptTestProfileId(
  config: AppConfig,
  headers: RouteScriptTestHeaders
): string | undefined {
  if (config.profile?.enabled === false) {
    return undefined;
  }
  const apiKeyId = readRouteScriptTestHeader(headers, "x-auth-api-key-id")?.trim();
  if (!apiKeyId) {
    return undefined;
  }
  return config.profile?.profiles.find((profile) =>
    profile.enabled && profileApiKeyId(profile) === apiKeyId
  )?.id;
}

function readRouteScriptTestHeader(
  headers: RouteScriptTestHeaders,
  name: string
): string | undefined {
  const normalized = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalized)?.[1];
  return Array.isArray(entry) ? entry[0] : entry;
}

class GatewayService {
  private readonly requestHandler = new GatewayHttpRequestHandler({
    getBrowserAutomationMcpIntegration: () => this.browserAutomationMcpIntegration,
    getConfig: () => this.config,
    getPlugin: () => this.plugin,
    getRuntimeConfigControlStatus: () => ({
      ...(this.runtimeConfigReloadError ? { lastError: this.runtimeConfigReloadError } : {}),
      revision: gatewayRuntimeConfigRevision(this.config)
    }),
    getStatus: () => ({
      coreEndpoint: this.status.coreEndpoint,
      coreManagedExternally: this.status.coreManagedExternally,
      endpoint: this.status.endpoint,
      state: this.status.state
    }),
    handleRawTraceSync: (request, response) => this.rawTraceSynchronizer.handle(request, response),
    handleBillingUsageSync: (request, response) => this.billingSynchronizer.handle(request, response),
    proxyRequest: (request, response, path, apiKey) => this.proxyRequest(request, response, path, apiKey),
    requestRuntimeConfigReload: (expectedRevision, forceRestart) => {
      this.schedulePersistedRuntimeConfigReload(expectedRevision, forceRestart);
    },
    replayContextArchive: (input) => this.requestPipeline.replayContextArchive(input)
  });

  private readonly requestPipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => this.browserWebSearchMcpIntegration,
    getConfig: () => this.config,
    getCoreAuthToken: () => this.coreAuthToken,
    getPlugin: () => this.plugin,
    getStatus: () => ({ coreEndpoint: this.status.coreEndpoint, endpoint: this.status.endpoint })
  });

  private browserAutomationMcpIntegration?: BrowserAutomationMcpIntegration;
  private browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration;
  private readonly billingSynchronizer = new GatewayBillingSynchronizer({
    getConfig: () => this.config,
    getGlobalBillingConfig: () => pluginService.getCoreGatewayConfig().billing
  });
  private child?: ChildProcess;
  private config?: AppConfig;
  private coreAuthToken = "";
  private externalGatewayApiKey?: string;
  private plugin?: ClaudeCodeRouterPlugin;
  private readonly rawTraceSynchronizer = new RawTraceSynchronizer({
    getConfig: () => this.config
  });
  private readonly routeScriptRuntime = new RouteScriptRuntime();
  private runtimeConfigReloadError?: string;
  private runtimeConfigReloadQueue: Promise<void> = Promise.resolve();
  private server?: Server;
  private status: GatewayStatus = {
    coreEndpoint: "",
    endpoint: "",
    networkEndpoints: [],
    state: "stopped"
  };

  setBrowserWebSearchMcpIntegration(integration: BrowserWebSearchMcpIntegration): void {
    this.browserWebSearchMcpIntegration = integration;
  }

  setBrowserAutomationMcpIntegration(integration: BrowserAutomationMcpIntegration): void {
    this.browserAutomationMcpIntegration = integration;
  }

  async start(config: AppConfig): Promise<GatewayStatus> {
    const coreHostError = loopbackCoreHostError(config.gateway.coreHost);
    if (coreHostError) {
      this.status = {
        ...this.getStatus(),
        lastError: coreHostError,
        state: "error"
      };
      return this.status;
    }
    await this.stop({ nextConfig: config });
    this.config = config;
    const coreAuthToken = generateCoreGatewayAuthToken();
    const scriptValidationErrors = await this.routeScriptRuntime.prepare(config.Router.rules);
    this.plugin = new ClaudeCodeRouterPlugin(config, {
      scriptRuntime: this.routeScriptRuntime,
      scriptValidationErrors
    });
    this.status = {
      coreEndpoint: endpoint(config.gateway.coreHost, config.gateway.corePort),
      endpoint: endpoint(config.gateway.host, config.gateway.port),
      networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port),
      state: "starting"
    };

    try {
      mediaService.start(config, mediaToolsGatewayEndpoint(config), {
        authHeader: coreGatewayAuthHeader,
        authToken: coreAuthToken,
        baseUrl: endpoint(config.gateway.coreHost, config.gateway.corePort)
      });
      await pluginService.start(config);
      const shouldRunServer = shouldRunUnifiedServer(config) || pluginService.hasGatewayRoutes() || config.mediaTools.enabled;
      const shouldRunGateway = shouldRunGatewayRuntime(config);
      if (shouldRunGateway && !hasAvailableGatewayModels(config)) {
        throw new Error(NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
      }
      if (!shouldRunServer) {
        await mediaService.stop();
        await pluginService.stop();
        await backendService.stopAll();
        this.coreAuthToken = "";
        this.status = {
          ...this.status,
          state: "stopped"
        };
        return this.status;
      }

      await this.rawTraceSynchronizer.start();
      await this.listen(config);
      if (this.server) {
        const proxyStatus = await proxyService.attach(config, this.server);
        if (proxyStatus.state === "error" && !config.gateway.enabled) {
          throw new Error(proxyStatus.lastError || "Proxy service failed to start.");
        }
      }

      if (shouldRunGateway) {
        await proxyService.refreshUpstreamProxyFromCurrentSystem();
        const upstreamProxyUrl = proxyService.getUpstreamProxyUrl("https") ?? await getSystemProxyUrlForProtocol("https", config);
        const coreGatewayConfig = await compileCoreGatewayConfig(
          config,
          this.rawTraceSynchronizer.token,
          this.billingSynchronizer.token,
          coreAuthToken,
          this.browserWebSearchMcpIntegration,
          upstreamProxyUrl
        );
        await stopPreviousManagedCoreGateway(this.status.coreEndpoint);
        if (await isCoreGatewayHealthy(this.status.coreEndpoint)) {
          throw new Error(`Core gateway endpoint is already in use: ${this.status.coreEndpoint}`);
        }
        const runtimeId = randomUUID();
        const spawnedGateway = spawnGatewayProcess(config, coreGatewayConfig, upstreamProxyUrl, runtimeId, coreAuthToken);
        this.child = spawnedGateway.child;
        this.coreAuthToken = coreAuthToken;
        const managedChild = this.child;
        let markerWritePromise: Promise<void> | undefined;
        let startupFailure: Error | undefined;
        this.child.stdout?.on("data", (chunk) => console.info(`[gateway] ${chunk.toString().trimEnd()}`));
        this.child.stderr?.on("data", (chunk) => console.warn(`[gateway] ${chunk.toString().trimEnd()}`));
        this.child.once("error", (error) => {
          startupFailure ??= new Error(`Core gateway failed to start: ${formatError(error)}`);
          void this.handleCoreGatewayTermination(managedChild, markerWritePromise, startupFailure.message);
        });
        this.child.once("exit", (code, signal) => {
          startupFailure ??= new Error(formatCoreGatewayChildExit(managedChild, code, signal));
          void this.handleCoreGatewayTermination(managedChild, markerWritePromise, startupFailure.message);
        });
        markerWritePromise = writeManagedCoreGatewayMarker(managedChild, runtimeId);
        await Promise.all([markerWritePromise, spawnedGateway.configAccepted]);
        assertManagedGatewayStartupContinues(managedChild, startupFailure);
        await waitForManagedCoreGatewayReady(this.status.coreEndpoint, runtimeId, managedChild);
        assertManagedGatewayStartupContinues(managedChild, startupFailure);
      }

      this.status = {
        ...this.status,
        coreManagedExternally: this.status.coreManagedExternally,
        gatewayManagedExternally: undefined,
        lastStartedAt: new Date().toISOString(),
        pid: this.child?.pid,
        state: "running"
      };
      this.runtimeConfigReloadError = undefined;
      return this.status;
    } catch (error) {
      await this.stop();
      this.status = {
        ...this.status,
        lastError: formatError(error),
        state: "error"
      };
      return this.status;
    }
  }

  async ensureStarted(config: AppConfig): Promise<GatewayStatus> {
    const desiredEndpoint = endpoint(config.gateway.host, config.gateway.port);
    const currentStatus = this.getStatus();
    if (currentStatus.state === "running" && currentStatus.endpoint === desiredEndpoint) {
      if (currentStatus.gatewayManagedExternally) {
        const existingGateway = await probeExistingCcrGateway(config);
        if (existingGateway.state === "usable") {
          this.markExternalGatewayRunning(config, existingGateway.endpoint, existingGateway.apiKey);
          try {
            await this.reloadExternalGatewayConfig(config, false);
          } catch {
            return this.getStatus();
          }
          return this.getStatus();
        }
      }
      if (!currentStatus.gatewayManagedExternally) {
        await this.updateConfig(config);
        return this.getStatus();
      }
    }

    const status = await this.start(config);
    if (status.state !== "error" || !isAddressInUseMessage(status.lastError)) {
      return status;
    }

    const existingGateway = await probeExistingCcrGateway(config);
    if (existingGateway.state !== "usable") {
      return status;
    }

    this.markExternalGatewayRunning(config, existingGateway.endpoint, existingGateway.apiKey);
    try {
      await this.reloadExternalGatewayConfig(config, false);
    } catch {
      return this.getStatus();
    }
    return this.getStatus();
  }

  async restart(config: AppConfig): Promise<GatewayStatus> {
    if (this.status.gatewayManagedExternally) {
      await this.reloadExternalGatewayConfig(config, true);
      return this.getStatus();
    }
    return this.start(config);
  }

  async stop(options: GatewayStopOptions = {}): Promise<GatewayStatus> {
    const child = this.child;
    const childCoreEndpoint = child ? this.status.coreEndpoint : "";
    this.child = undefined;
    this.coreAuthToken = "";
    this.externalGatewayApiKey = undefined;
    if (child && !child.killed) {
      child.kill();
    }
    if (child) {
      await waitForCoreGatewayStop(childCoreEndpoint);
      await removeManagedCoreGatewayMarkerBestEffort();
    }

    const server = this.server;
    this.server = undefined;
    if (server) {
      await closeServer(server);
    }
    await this.rawTraceSynchronizer.stop();
    await this.routeScriptRuntime.close();
    await mediaService.stop();

    await proxyService.stop(options.proxyRestoreTimeoutMs);
    await pluginService.stop(options.nextConfig ? { nextConfig: options.nextConfig } : {});
    await backendService.stopAll();
    await this.browserWebSearchMcpIntegration?.stopBrowserWebSearchMcpServers().catch((error) => {
      console.warn(`[gateway] Failed to stop browser web search MCP: ${formatError(error)}`);
    });
    await this.browserAutomationMcpIntegration?.stopBrowserAutomationMcpServer().catch((error) => {
      console.warn(`[gateway] Failed to stop browser automation MCP: ${formatError(error)}`);
    });

    this.status = {
      ...this.status,
      coreManagedExternally: undefined,
      gatewayManagedExternally: undefined,
      pid: undefined,
      state: "stopped"
    };
    return this.getStatus();
  }

  getStatus(): GatewayStatus {
    return {
      ...this.status,
      networkEndpoints: this.config
        ? gatewayNetworkEndpoints(this.config.gateway.host, this.config.gateway.port)
        : this.status.networkEndpoints
    };
  }

  async updateConfig(config: AppConfig): Promise<void> {
    assertLoopbackCoreHost(config.gateway.coreHost);
    if (this.status.gatewayManagedExternally) {
      await this.reloadExternalGatewayConfig(config, false);
      return;
    }

    const scriptValidationErrors = await this.routeScriptRuntime.prepare(config.Router.rules);
    const nextPlugin = new ClaudeCodeRouterPlugin(config, {
      scriptRuntime: this.routeScriptRuntime,
      scriptValidationErrors
    });
    this.config = config;
    this.plugin = nextPlugin;
    mediaService.updateConfig(config, mediaToolsGatewayEndpoint(config), {
      authHeader: coreGatewayAuthHeader,
      authToken: this.coreAuthToken,
      baseUrl: endpoint(config.gateway.coreHost, config.gateway.corePort)
    });
    proxyService.updateConfig(config);
    this.status = {
      ...this.status,
      coreEndpoint: endpoint(config.gateway.coreHost, config.gateway.corePort),
      endpoint: endpoint(config.gateway.host, config.gateway.port),
      gatewayManagedExternally: undefined,
      networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port)
    };
  }

  validateRouteScript(request: RouteScriptValidationRequest): Promise<RouteScriptValidationResult> {
    return this.routeScriptRuntime.validate(request.script);
  }

  async testRouteScript(config: AppConfig, request: RouteScriptTestRequest): Promise<RouteScriptTestResult> {
    const validation = await this.routeScriptRuntime.validate(request.script);
    if (!validation.ok) return { ...validation, matched: false };
    const rule: RouterRule = {
      enabled: true,
      id: "route-script-test",
      name: "Route script test",
      script: request.script,
      type: "script"
    };
    const testConfig: AppConfig = {
      ...config,
      Router: { ...config.Router, rules: [rule] }
    };
    const compiled = compileRouterConfig(testConfig);
    const compiledRule = compiled.rules[0];
    const routeRequest = {
      body: request.request.body,
      headers: request.request.headers ?? {},
      log: console,
      method: request.request.method ?? "POST",
      sessionId: request.request.sessionId,
      tokenCount: request.request.tokenCount ?? 0,
      url: request.request.url ?? "/v1/messages"
    };
    const context = buildRouteScriptInput(routeRequest, {
      profileId: routeScriptTestProfileId(config, routeRequest.headers)
    });
    const execution = await this.routeScriptRuntime.execute(rule.id, request.script, context, {
      circuitBreaker: false
    });
    if (execution.status !== "ok") {
      return {
        diagnostics: [{
          code: execution.status === "timeout" ? "script-timeout" : "script-runtime-error",
          message: execution.error ?? execution.status
        }],
        durationMs: execution.durationMs,
        matched: false,
        ok: false
      };
    }
    const normalized = normalizeRouteScriptResult({
      compiledRule,
      defaultFallback: compiled.fallback,
      modelRegistry: compiled.modelRegistry,
      value: execution.value
    });
    return {
      diagnostics: normalized.diagnostics.map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message })),
      durationMs: execution.durationMs,
      matched: normalized.matched,
      ok: normalized.diagnostics.length === 0,
      output: scriptResultPreview(execution.value)
    };
  }

  private async listen(config: AppConfig): Promise<void> {
    this.server = createServer((request, response) => {
      if (proxyService.shouldHandleHttpRequest(request)) {
        void proxyService.handleHttpRequest(request, response).catch((error) => {
          response.writeHead(502, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { message: formatError(error) } }));
        });
        return;
      }

      void this.handleRequest(request, response).catch((error) => {
        response.writeHead(502, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: formatError(error) } }));
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(config.gateway.port, config.gateway.host, () => {
        this.server?.off("error", reject);
        resolve();
      });
    });
  }

  private async handleCoreGatewayTermination(
    child: ChildProcess,
    markerWritePromise: Promise<void> | undefined,
    message: string
  ): Promise<void> {
    await markerWritePromise?.catch(() => undefined);
    if (this.child !== child || this.status.state === "stopped") {
      return;
    }
    this.child = undefined;
    this.coreAuthToken = "";
    await removeManagedCoreGatewayMarkerBestEffort();
    this.status = {
      ...this.status,
      coreManagedExternally: undefined,
      lastError: message,
      pid: undefined,
      state: "error"
    };
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    return this.requestHandler.handleRequest(request, response);
  }

  private async proxyRequest(request: IncomingMessage, response: ServerResponse, path: string, apiKey?: ApiKeyConfig): Promise<void> {
    return this.requestPipeline.proxyRequest(request, response, path, apiKey);
  }

  private async reloadExternalGatewayConfig(config: AppConfig, forceRestart: boolean): Promise<void> {
    const currentEndpoint = this.status.endpoint || endpoint(config.gateway.host, config.gateway.port);
    try {
      const externalGateway = await reloadExistingCcrGatewayConfig(
        currentEndpoint,
        config,
        this.externalGatewayApiKey,
        { forceRestart }
      );
      this.markExternalGatewayRunning(config, externalGateway.endpoint, externalGateway.apiKey);
    } catch (error) {
      const message = `Failed to update the externally managed CCR gateway: ${formatError(error)}`;
      this.status = {
        ...this.status,
        lastError: message,
        state: "error"
      };
      throw new Error(message, { cause: error });
    }
  }

  private schedulePersistedRuntimeConfigReload(expectedRevision: string, forceRestart: boolean): void {
    this.runtimeConfigReloadError = undefined;
    this.runtimeConfigReloadQueue = this.runtimeConfigReloadQueue.then(
      () => this.reloadPersistedRuntimeConfig(expectedRevision, forceRestart),
      () => this.reloadPersistedRuntimeConfig(expectedRevision, forceRestart)
    );
  }

  private async reloadPersistedRuntimeConfig(expectedRevision: string, forceRestart: boolean): Promise<void> {
    try {
      const nextConfig = await loadAppConfig();
      const actualRevision = gatewayRuntimeConfigRevision(nextConfig);
      if (actualRevision !== expectedRevision) {
        throw new Error(`Persisted configuration revision ${actualRevision || "(missing)"} does not match the requested revision ${expectedRevision}.`);
      }
      const restartRequired = forceRestart || !this.config ||
        shouldRestartGatewayForRuntimeConfigChange(this.config, nextConfig);
      if (restartRequired) {
        const status = await this.start(nextConfig);
        if (status.state === "error") {
          throw new Error(status.lastError || "CCR gateway failed to restart with the updated configuration.");
        }
      } else {
        await this.updateConfig(nextConfig);
      }
      this.runtimeConfigReloadError = undefined;
    } catch (error) {
      this.runtimeConfigReloadError = formatError(error);
      console.error(`[gateway] Failed to reload persisted runtime configuration: ${this.runtimeConfigReloadError}`);
    }
  }

  private markExternalGatewayRunning(config: AppConfig, externalEndpoint: string, apiKey?: string): void {
    this.config = config;
    this.child = undefined;
    this.server = undefined;
    this.coreAuthToken = "";
    this.externalGatewayApiKey = apiKey;
    this.status = {
      coreEndpoint: endpoint(config.gateway.coreHost, config.gateway.corePort),
      endpoint: externalEndpoint,
      gatewayManagedExternally: true,
      networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port),
      state: "running"
    };
  }

}

function assertManagedGatewayStartupContinues(child: ChildProcess, startupFailure: Error | undefined): void {
  if (startupFailure || child.exitCode !== null || child.signalCode !== null || child.killed) {
    throw startupFailure ?? new Error(formatCoreGatewayChildExit(child));
  }
}

async function removeManagedCoreGatewayMarkerBestEffort(): Promise<void> {
  await removeManagedCoreGatewayMarker().catch((error) => {
    console.warn(`[gateway] Failed to remove gateway runtime marker: ${formatError(error)}`);
  });
}


export const gatewayService = new GatewayService();
