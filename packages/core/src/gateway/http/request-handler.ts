import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiKeyConfig, AppConfig } from "@ccr/core/contracts/app";
import { handleNetworkCaptureMcpRequest, isNetworkCaptureMcpPath } from "@ccr/core/mcp/network-capture-mcp";
import { LEGACY_GROK_MEDIA_ARTIFACT_PATH_PREFIX, MEDIA_ARTIFACT_PATH_PREFIX, handleMediaArtifactRequest, handleMediaToolsMcpRequest } from "@ccr/core/mcp/grok-media-mcp";
import { LEGACY_GROK_MEDIA_MCP_PATH, MEDIA_TOOLS_MCP_PATH } from "@ccr/core/mcp/grok-media-config";
import { BROWSER_AUTOMATION_MCP_PATH, browserAutomationMcpEnabled } from "@ccr/core/mcp/toolhub-config";
import { pluginService } from "@ccr/core/plugins/service";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin";
import {
  contextArchiveConfigForApiKey,
  handleContextArchiveMcpRequest,
  isContextArchiveMcpPath,
  type ContextArchiveReplayExecutor
} from "@ccr/core/gateway/context-archive";
import { ccrRemoteControlPathPrefix, ccrRemoteControlService } from "@ccr/core/gateway/remote-control-service";
import { authorize, reserveApiKeyLimits } from "@ccr/core/gateway/auth/api-key-authorizer";
import { parseJsonObject, readRequestBody, sendJson } from "@ccr/core/gateway/http/io";
import { shouldRecordRequestLogs } from "@ccr/core/observability/raw-trace-sync";
import { applyCors, endpoint, shouldServeGatewayRequest } from "@ccr/core/gateway/core-runtime/supervisor";
import { billingUsageSyncPath, rawTraceSyncPath } from "@ccr/core/gateway/internal/shared";
import type { BrowserAutomationMcpIntegration } from "@ccr/core/gateway/internal/shared";

export type GatewayHttpRequestHandlerDependencies = {
  getBrowserAutomationMcpIntegration: () => BrowserAutomationMcpIntegration | undefined;
  getConfig: () => AppConfig | undefined;
  getPlugin: () => ClaudeCodeRouterPlugin | undefined;
  getStatus: () => { coreEndpoint: string; coreManagedExternally?: boolean; endpoint: string; state: string };
  handleBillingUsageSync: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  handleRawTraceSync: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  proxyRequest: (request: IncomingMessage, response: ServerResponse, path: string, apiKey?: ApiKeyConfig) => Promise<void>;
  replayContextArchive: ContextArchiveReplayExecutor;
};

export class GatewayHttpRequestHandler {
  constructor(private readonly dependencies: GatewayHttpRequestHandlerDependencies) {}

  private get browserAutomationMcpIntegration() { return this.dependencies.getBrowserAutomationMcpIntegration(); }
  private get config() { return this.dependencies.getConfig(); }
  private get plugin() { return this.dependencies.getPlugin(); }
  private get status() { return this.dependencies.getStatus(); }
  private handleBillingUsageSync(request: IncomingMessage, response: ServerResponse) { return this.dependencies.handleBillingUsageSync(request, response); }
  private handleRawTraceSync(request: IncomingMessage, response: ServerResponse) { return this.dependencies.handleRawTraceSync(request, response); }
  private proxyRequest(request: IncomingMessage, response: ServerResponse, path: string, apiKey?: ApiKeyConfig) { return this.dependencies.proxyRequest(request, response, path, apiKey); }
  private replayContextArchive(input: Parameters<ContextArchiveReplayExecutor>[0]) { return this.dependencies.replayContextArchive(input); }

  async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
      applyCors(response, this.config);

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (!this.config || !this.plugin) {
        sendJson(response, 503, { error: { message: "Gateway service is not configured." } });
        return;
      }

      const requestUrl = new URL(request.url ?? "/", this.status.endpoint || "http://127.0.0.1");
      const path = requestUrl.pathname;
      if (path === billingUsageSyncPath) {
        await this.handleBillingUsageSync(request, response);
        return;
      }
      if (path === rawTraceSyncPath) {
        if (!shouldRecordRequestLogs(this.config)) {
          sendJson(response, 202, { applied: false, disabled: true, ok: true });
          return;
        }
        await this.handleRawTraceSync(request, response);
        return;
      }

      if (path === ccrRemoteControlPathPrefix || path.startsWith(`${ccrRemoteControlPathPrefix}/`)) {
        const authorization = await authorize(request, response, this.config);
        if (!authorization.ok) {
          return;
        }
        await ccrRemoteControlService.handleRequest({
          endpoint: this.status.endpoint,
          path,
          readBody: readRequestBody,
          request,
          response,
          sendJson
        });
        return;
      }

      if (path === BROWSER_AUTOMATION_MCP_PATH || path === `${BROWSER_AUTOMATION_MCP_PATH}/`) {
        if (!browserAutomationMcpEnabled(this.config)) {
          sendJson(response, 404, {
            error: {
              message: "CCR browser automation MCP is disabled."
            }
          });
          return;
        }
        const authorization = await authorize(request, response, this.config);
        if (!authorization.ok) {
          return;
        }
        if (!this.browserAutomationMcpIntegration) {
          sendJson(response, 503, {
            error: {
              message: "CCR browser automation MCP is only available in the Electron desktop app."
            }
          });
          return;
        }
        await this.browserAutomationMcpIntegration.handleBrowserAutomationMcpRequest(request, response);
        return;
      }

      if (isContextArchiveMcpPath(path)) {
        const authorization = await authorize(request, response, this.config);
        if (!authorization.ok) {
          return;
        }
        const contextArchiveConfig = contextArchiveConfigForApiKey(this.config, authorization.apiKey);
        if (!contextArchiveConfig) {
          sendJson(response, 404, { error: { message: "CCR context archive MCP is disabled." } });
          return;
        }
        await handleContextArchiveMcpRequest(
          request,
          response,
          contextArchiveConfig,
          (input) => this.replayContextArchive(input)
        );
        return;
      }

      if ([MEDIA_TOOLS_MCP_PATH, LEGACY_GROK_MEDIA_MCP_PATH].some((mcpPath) => path === mcpPath || path === `${mcpPath}/`)) {
        if (!this.config.mediaTools.enabled) {
          sendJson(response, 404, { error: { message: "CCR Media Tools MCP is disabled." } });
          return;
        }
        const authorization = await authorize(request, response, this.config);
        if (!authorization.ok) return;
        await handleMediaToolsMcpRequest(request, response);
        return;
      }

      if (path.startsWith(MEDIA_ARTIFACT_PATH_PREFIX) || path.startsWith(LEGACY_GROK_MEDIA_ARTIFACT_PATH_PREFIX)) {
        handleMediaArtifactRequest(request, response, requestUrl);
        return;
      }

      if (isNetworkCaptureMcpPath(path)) {
        if (!this.config.proxy.captureNetwork) {
          sendJson(response, 404, { error: { message: "Network capture MCP is disabled." } });
          return;
        }
        const authorization = await authorize(request, response, this.config);
        if (!authorization.ok) {
          return;
        }
        await handleNetworkCaptureMcpRequest(request, response);
        return;
      }

      const pluginRoute = pluginService.matchGatewayRoute(request.method, path);
      if (pluginRoute) {
        if (pluginRoute.auth !== "none") {
          const authorization = await authorize(request, response, this.config);
          if (!authorization.ok) {
            return;
          }
        }
        await pluginService.handleGatewayRoute(pluginRoute, request, response);
        return;
      }

      if (!shouldServeGatewayRequest(this.config, request)) {
        sendJson(response, 503, { error: { message: "Gateway runtime is disabled." } });
        return;
      }

      if (path === "/health") {
        sendJson(response, 200, {
          core: this.status.coreEndpoint,
          coreManagedExternally: this.status.coreManagedExternally || undefined,
          status: this.status.state,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (path === "/") {
        sendJson(response, 200, {
          core: "next-ai-gateway",
          endpoints: ["POST /mcp", "POST /v1/messages", "POST /v1/messages/count_tokens", "GET /v1/models"],
          name: "claude-code-router",
          plugin: "claude-code-router",
          wrapperPlugins: this.config.plugins.filter((plugin) => plugin.enabled !== false).map((plugin) => plugin.id)
        });
        return;
      }

      const authorization = await authorize(request, response, this.config);
      if (!authorization.ok) {
        return;
      }

      if (request.method === "POST" && path === "/v1/messages/count_tokens") {
        const requestBody = await readRequestBody(request);
        const body = parseJsonObject(requestBody);
        if (!reserveApiKeyLimits(authorization.apiKey, request, response, requestBody)) {
          return;
        }
        sendJson(response, 200, this.plugin.countTokens(body));
        return;
      }

      await this.proxyRequest(request, response, path, authorization.apiKey);
    }
}
