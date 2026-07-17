/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApiKeyConfig, AppConfig, GatewayStatus } from "@ccr/core/contracts/app";
import { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, hasAvailableGatewayModels } from "@ccr/core/contracts/app";
import { backendService } from "@ccr/core/plugins/backend-service";
import { getSystemProxyUrlForProtocol } from "@ccr/core/proxy/system-proxy-fetch";
import { pluginService } from "@ccr/core/plugins/service";
import { proxyService } from "@ccr/core/proxy/service";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin";
import { writeCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-writer";
import { closeServer, formatError } from "@ccr/core/gateway/http/io";
import { RawTraceSynchronizer } from "@ccr/core/observability/raw-trace-sync";
import { GatewayBillingSynchronizer } from "@ccr/core/usage/billing-sync";
import { assertLoopbackCoreHost, endpoint, gatewayNetworkEndpoints, generateCoreGatewayAuthToken, isCoreGatewayHealthy, loopbackCoreHostError, removeManagedCoreGatewayMarker, shouldRunGatewayRuntime, shouldRunUnifiedServer, spawnGatewayProcess, stopPreviousManagedCoreGateway, writeManagedCoreGatewayMarker } from "@ccr/core/gateway/core-runtime/supervisor";
import type { BrowserAutomationMcpIntegration, BrowserWebSearchMcpIntegration, GatewayStopOptions } from "@ccr/core/gateway/internal/shared";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline";
import { GatewayHttpRequestHandler } from "@ccr/core/gateway/http/request-handler";


class GatewayService {
  private readonly requestHandler = new GatewayHttpRequestHandler({
    getBrowserAutomationMcpIntegration: () => this.browserAutomationMcpIntegration,
    getConfig: () => this.config,
    getPlugin: () => this.plugin,
    getStatus: () => ({
      coreEndpoint: this.status.coreEndpoint,
      coreManagedExternally: this.status.coreManagedExternally,
      endpoint: this.status.endpoint,
      state: this.status.state
    }),
    handleRawTraceSync: (request, response) => this.rawTraceSynchronizer.handle(request, response),
    handleBillingUsageSync: (request, response) => this.billingSynchronizer.handle(request, response),
    proxyRequest: (request, response, path, apiKey) => this.proxyRequest(request, response, path, apiKey)
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
  private plugin?: ClaudeCodeRouterPlugin;
  private readonly rawTraceSynchronizer = new RawTraceSynchronizer({
    getConfig: () => this.config
  });
  private server?: Server;
  private status: GatewayStatus = {
    coreEndpoint: "",
    endpoint: "",
    generatedConfigFile: "",
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
    await this.stop();
    this.config = config;
    const coreAuthToken = generateCoreGatewayAuthToken();
    this.plugin = new ClaudeCodeRouterPlugin(config);
    this.status = {
      coreEndpoint: endpoint(config.gateway.coreHost, config.gateway.corePort),
      endpoint: endpoint(config.gateway.host, config.gateway.port),
      generatedConfigFile: config.gateway.generatedConfigFile,
      networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port),
      state: "starting"
    };

    try {
      await pluginService.start(config);
      const shouldRunServer = shouldRunUnifiedServer(config) || pluginService.hasGatewayRoutes();
      const shouldRunGateway = shouldRunGatewayRuntime(config);
      if (shouldRunGateway && !hasAvailableGatewayModels(config)) {
        throw new Error(NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
      }
      if (!shouldRunServer) {
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
        await writeCoreGatewayConfig(
          config,
          this.rawTraceSynchronizer.token,
          this.billingSynchronizer.token,
          coreAuthToken,
          this.browserWebSearchMcpIntegration,
          upstreamProxyUrl
        );
        await stopPreviousManagedCoreGateway(config, this.status.coreEndpoint);
        if (await isCoreGatewayHealthy(this.status.coreEndpoint)) {
          throw new Error(`Core gateway endpoint is already in use: ${this.status.coreEndpoint}`);
        }
        const runtimeId = randomUUID();
        this.child = spawnGatewayProcess(config, upstreamProxyUrl, runtimeId, coreAuthToken);
        this.coreAuthToken = coreAuthToken;
        const managedChild = this.child;
        writeManagedCoreGatewayMarker(config, this.child, runtimeId);
        this.child.stdout?.on("data", (chunk) => console.info(`[gateway] ${chunk.toString().trimEnd()}`));
        this.child.stderr?.on("data", (chunk) => console.warn(`[gateway] ${chunk.toString().trimEnd()}`));
        this.child.on("exit", (code, signal) => {
          void this.handleCoreGatewayExit(managedChild, code, signal);
        });
      }

      this.status = {
        ...this.status,
        coreManagedExternally: this.status.coreManagedExternally,
        lastStartedAt: new Date().toISOString(),
        pid: this.child?.pid,
        state: "running"
      };
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

  async stop(options: GatewayStopOptions = {}): Promise<GatewayStatus> {
    const child = this.child;
    const config = this.config;
    this.child = undefined;
    this.coreAuthToken = "";
    if (child && !child.killed) {
      child.kill();
    }
    removeManagedCoreGatewayMarker(config);

    const server = this.server;
    this.server = undefined;
    if (server) {
      await closeServer(server);
    }
    await this.rawTraceSynchronizer.stop();

    await proxyService.stop(options.proxyRestoreTimeoutMs);
    await pluginService.stop();
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

  updateConfig(config: AppConfig): void {
    assertLoopbackCoreHost(config.gateway.coreHost);
    this.config = config;
    this.plugin = new ClaudeCodeRouterPlugin(config);
    proxyService.updateConfig(config);
    this.status = {
      ...this.status,
      coreEndpoint: endpoint(config.gateway.coreHost, config.gateway.corePort),
      endpoint: endpoint(config.gateway.host, config.gateway.port),
      generatedConfigFile: config.gateway.generatedConfigFile,
      networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port)
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

  private async handleCoreGatewayExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): Promise<void> {
    if (this.child !== child || this.status.state === "stopped") {
      return;
    }
    removeManagedCoreGatewayMarker(this.config);
    this.status = {
      ...this.status,
      coreManagedExternally: undefined,
      lastError: `Core gateway exited with ${signal ?? code ?? "unknown status"}`,
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

}


export const gatewayService = new GatewayService();
