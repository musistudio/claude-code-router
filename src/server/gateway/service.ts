import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { Readable, Transform } from "node:stream";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join as pathJoin, resolve as pathResolve, sep as pathSep } from "node:path";
import type {
  ApiKeyConfig,
  ApiKeyLimitConfig,
  AppConfig,
  GatewayMcpServerConfig,
  GatewayNetworkEndpoint,
  GatewayProviderCapability,
  GatewayProviderConfig,
  GatewayProviderProtocol,
  ProviderCredentialConfig,
  GatewayStatus,
  RouterFallbackConfig,
  RouterFallbackMode,
  VirtualModelFusionVisionConfig,
  VirtualModelFusionWebSearchConfig,
  VirtualModelFusionWebSearchProvider
} from "../../shared/app";
import {
  CLAUDE_APP_FALLBACK_MODEL,
  buildClaudeAppGatewayModelRoutes,
  inferClaudeAppGatewayTargetModel,
  resolveClaudeAppGatewayRouteModel,
  type ClaudeAppGatewayModelRouteOptions
} from "../../shared/claude-app-gateway";
import {
  BUILTIN_FUSION_VISION_TOOL_NAME,
  BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME,
  NO_AVAILABLE_GATEWAY_MODELS_MESSAGE,
  ROUTER_FALLBACK_MAX_RETRY_COUNT,
  hasAvailableGatewayModels
} from "../../shared/app";
import { findProviderPresetByBaseUrl, providerApiKeySafetyIssue } from "../../main/presets";
import { normalizeProviderBaseUrl as normalizeProviderBaseUrlInput } from "../../shared/provider-url";
import { backendService } from "../backend-service";
import { RAW_TRACE_SPOOL_DIR } from "../../main/constants";
import { loadPersistedApiKeys } from "../../main/api-key-store";
import { codexDefaultBaseUrl, readCodexAuth } from "../../main/local-agent-provider-service";
import { fetchWithSystemProxy, getSystemProxyUrlForProtocol } from "../../main/system-proxy-fetch";
import { handleNetworkCaptureMcpRequest, isNetworkCaptureMcpPath } from "../mcp/network-capture-mcp";
import { pluginService } from "../../main/plugins/service";
import { proxyService } from "../proxy/service";
import { createSseErrorDetector, recordGatewayRequestLog, updateGatewayRequestLogFromRawTrace, type RequestLogRawTraceUpdateInput } from "../../main/request-log-store";
import { recordGatewayUsageCapture } from "../../main/usage-store";
import { ClaudeCodeRouterPlugin, normalizeRouteSelector } from "./claude-code-router-plugin";
import { ccrRemoteControlPathPrefix, ccrRemoteControlService } from "./remote-control-service";
import {
  claudeCodeEffectiveMaxInputTokens,
  findModelCatalogEntry,
  modelCatalogMaxInputTokens,
  modelCatalogMaxOutputTokens,
  readCatalogCapability,
  type ModelCatalogCapabilities,
  type ModelCatalogEntry
} from "./model-catalog";

type CoreGatewayProvider = {
  apikey?: string;
  baseurl?: string;
  billing?: unknown;
  extraBody?: unknown;
  extraHeaders?: unknown;
  models: string[];
  name: string;
  type: GatewayProviderProtocol;
};

const defaultFusionWebSearchProvider: VirtualModelFusionWebSearchProvider = "brave";
const fusionModelProviderName = "Fusion";
const claudeCodeOneMillionContextSuffix = "[1m]";
const claudeAppGatewayModelRouteOptions: ClaudeAppGatewayModelRouteOptions = {
  displayName: (model) => findModelCatalogEntry(model)?.displayName,
  supportsOneMillionContext: (model) => Boolean(findModelCatalogEntry(model)?.limits?.supports1MContext)
};

type ApiKeyAuthorizationResult =
  | { ok: true; apiKey?: ApiKeyConfig }
  | { ok: false };

type ApiKeyLimitUsage = {
  imageCount: number;
  totalTokens: number;
};

type ApiKeyLimitRule = {
  limit: number;
  metric: "images" | "requests" | "tokens";
  name: string;
  requested: number;
  windowMs: number;
};

type GatewayStopOptions = {
  proxyRestoreTimeoutMs?: number;
};

type HostedWebSearchProtocolContext = {
  maxUses?: number;
  protocol: GatewayProviderProtocol;
  queryHint?: string;
  records?: BrowserWebSearchProtocolRecord[];
  requestId: string;
  sinceMs: number;
  toolName: string;
};

type AnthropicWebSearchProtocolContext = HostedWebSearchProtocolContext;

type ClaudeCodeWebSearchContinuationContext = {
  queryHint?: string;
  sinceMs: number;
  toolName: string;
};

export type BrowserWebSearchMcpRegistration = {
  env?: Record<string, string>;
  name: string;
  resultCount?: number;
  timeoutMs?: number;
  toolName: string;
};

export type BrowserWebSearchProtocolResult = {
  content?: string;
  snippet?: string;
  title: string;
  url: string;
};

export type BrowserWebSearchProtocolRecord = {
  completedAtMs: number;
  engine: string;
  query: string;
  results: BrowserWebSearchProtocolResult[];
  searchUrl: string;
  toolName: string;
};

export type BrowserWebSearchMcpIntegration = {
  registerBrowserWebSearchMcpServer: (options: BrowserWebSearchMcpRegistration) => Promise<GatewayMcpServerConfig | undefined>;
  recentBrowserWebSearchResults?: (options: { sinceMs: number; toolName?: string }) => BrowserWebSearchProtocolRecord[];
  runBrowserWebSearch?: (options: { count?: number; prompt: string; timeoutMs?: number; toolName?: string }) => Promise<BrowserWebSearchProtocolRecord | undefined>;
  stopBrowserWebSearchMcpServers: () => Promise<void>;
};

type CoreGatewayHealth = {
  runtimeId?: string;
  status?: string;
};

type ManagedGatewayRuntimeMarker = {
  generatedConfigFile?: unknown;
  gatewayEntry?: unknown;
  pid?: unknown;
  runtimeId?: unknown;
  startedAt?: unknown;
};

type ApiKeyWindowCounter = {
  expiresAt: number;
  value: number;
  windowStart: number;
};

type PendingRawTraceUpdate = RequestLogRawTraceUpdateInput & {
  receivedAt: number;
};

type RawTracePartText = {
  contentType?: string;
  text: string;
};

type CursorOpenAICompatContext = {
  systemPrompt?: string;
  toolChoice?: unknown;
  tools: unknown[];
};

type CursorOpenAICompatPreparation = {
  body?: Buffer;
  diagnostic: "fallback-injected" | "simplified-missing-context";
};

type ClaudeCodeDiscoverableModel = {
  id: string;
  oneMillionContext: boolean;
};

type UpstreamAttempt = {
  body?: Buffer;
  credentialChain?: string[];
  credentialIds?: string[];
  credentialProtocol?: GatewayProviderProtocol;
  headers?: Record<string, string>;
  index: number;
  logicalProvider?: string;
  model?: string;
};

type UpstreamFailedAttempt = {
  credentialChain?: string[];
  credentialIds?: string[];
  delayMs?: number;
  error?: string;
  model?: string;
  statusCode?: number;
};

type UpstreamFetchResult = {
  attempt: UpstreamAttempt;
  failedAttempts: UpstreamFailedAttempt[];
  response: Response;
};

class UpstreamRequestError extends Error {
  readonly attempt?: UpstreamAttempt;
  readonly failedAttempts: UpstreamFailedAttempt[];

  constructor(message: string, options: { attempt?: UpstreamAttempt; cause?: unknown; failedAttempts: UpstreamFailedAttempt[] }) {
    super(message);
    this.name = "UpstreamRequestError";
    this.attempt = options.attempt;
    this.cause = options.cause;
    this.failedAttempts = options.failedAttempts;
  }
}

const requireFromHere = createRequire(__filename);
const coreGatewayAuthHeader = "x-ccr-core-auth";
const coreGatewayAuthTokenEnv = "CCR_CORE_GATEWAY_AUTH_TOKEN";
const clientClosedRequestStatusCode = 499;
const clientDisconnectMessage = "Client connection closed before response completed.";
const localObservabilityHeaderNames = new Set([
  "x-ccr-claude-app-model-rewrite",
  "x-ccr-codex-patch-bridge",
  "x-ccr-claude-model-discovery",
  "x-ccr-cursor-openai-compat",
  "x-ccr-logical-provider",
  "x-ccr-provider-credential-chain",
  "x-ccr-provider-credential-saturated"
]);
const proxyHeaderDenyList = new Set(["connection", coreGatewayAuthHeader, "host", "upgrade"]);
const responseHeaderDenyList = new Set(["connection", "content-encoding", "transfer-encoding"]);
const maxUsageCaptureBytes = 8 * 1024 * 1024;
const maxPendingRawTraceUpdates = 200;
const pendingRawTraceMaxAgeMs = 5 * 60 * 1000;
const apiKeyLimitCounterRetentionWindows = 2;
const gatewayRuntimeMarkerFile = "gateway-runtime.json";
const rawTraceSyncHeader = "x-ccr-raw-trace-token";
const virtualApplyPatchToolName = "virtual_apply_patch";
let warnedMissingCursorOpenAICompatContext = false;
const rawTraceSyncPath = "/__ccr/raw-trace-sync";
const gatewayEntryOverrideEnv = "CCR_GATEWAY_ENTRY";
const gatewayPackageCandidates = ["@the-next-ai/ai-gateway", "gateway"];
const codexPatchBridgeInstructionText = [
  "When modifying files, call virtual_apply_patch.",
  "Do not use exec_command or write_stdin to edit files, including shell redirection, heredocs, cat >, tee, sed -i, perl -i, python, node scripts, or similar shell-based edits.",
  "Use exec_command only for reading files, listing/searching, running builds/tests, starting servers, and other commands that are not manual file edits."
].join(" ");
const codexPatchBridgeShellToolGuidance = [
  "When virtual_apply_patch is available, do not use this tool to edit files.",
  "Do not write files with shell redirection, heredocs, cat >, tee, sed -i, perl -i, python, node scripts, or similar commands.",
  "Use virtual_apply_patch for manual file changes."
].join(" ");
const virtualApplyPatchLarkGrammar = [
  "start: begin_patch hunk+ end_patch",
  "begin_patch: \"*** Begin Patch\" LF",
  "end_patch: \"*** End Patch\" LF?",
  "",
  "hunk: add_hunk | delete_hunk | update_hunk",
  "add_hunk: \"*** Add File: \" filename LF add_line+",
  "delete_hunk: \"*** Delete File: \" filename LF",
  "update_hunk: \"*** Update File: \" filename LF change_move? change?",
  "",
  "filename: /(.+)/",
  "add_line: \"+\" /(.*)/ LF -> line",
  "",
  "change_move: \"*** Move to: \" filename LF",
  "change: (change_context | change_line)+ eof_line?",
  "change_context: (\"@@\" | \"@@ \" /(.+)/) LF",
  "change_line: (\"+\" | \"-\" | \" \") /(.*)/ LF",
  "eof_line: \"*** End of File\" LF",
  "",
  "%import common.LF"
].join("\n");
const apiKeyLimitCounters = new Map<string, ApiKeyWindowCounter>();
const providerCredentialCooldowns = new Map<string, { reason: string; until: number }>();
const providerCredentialCooldownMs = 60_000;
const providerCredentialSpilloverThreshold = 0.8;
const upstreamRetryBackoffBaseMs = 1_000;
const upstreamRetryBackoffMaxMs = 30_000;
const upstreamRetryAfterMaxMs = 60_000;
const gatewayProviderProtocolFallbackOrder: GatewayProviderProtocol[] = [
  "anthropic_messages",
  "openai_chat_completions",
  "openai_responses",
  "gemini_generate_content",
  "gemini_interactions"
];
const privateDirMode = 0o700;
const privateFileMode = 0o600;
const persistedApiKeyCacheTtlMs = 1000;
let persistedApiKeyCache: { loadedAt: number; values: ApiKeyConfig[] } | undefined;

class GatewayService {
  private browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration;
  private child?: ChildProcess;
  private config?: AppConfig;
  private coreAuthToken = "";
  private plugin?: ClaudeCodeRouterPlugin;
  private readonly pendingRawTraceUpdates = new Map<string, PendingRawTraceUpdate>();
  private readonly rawTraceSyncToken = randomUUID();
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

  async start(config: AppConfig): Promise<GatewayStatus> {
    const coreHostError = loopbackCoreHostError(config.gateway.coreHost);
    if (coreHostError) {
      return {
        ...this.getStatus(),
        lastError: coreHostError,
        state: "error"
      };
    }
    await this.stop();
    this.config = config;
    this.coreAuthToken = generateCoreGatewayAuthToken();
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

      await this.listen(config);
      if (this.server) {
        const proxyStatus = await proxyService.attach(config, this.server);
        if (proxyStatus.state === "error" && !config.gateway.enabled) {
          throw new Error(proxyStatus.lastError || "Proxy service failed to start.");
        }
      }

      if (shouldRunGateway) {
        await writeCoreGatewayConfig(config, this.rawTraceSyncToken, this.browserWebSearchMcpIntegration);
        await stopPreviousManagedCoreGateway(config, this.status.coreEndpoint);
        if (await isCoreGatewayHealthy(this.status.coreEndpoint)) {
          throw new Error(`Core gateway endpoint is already in use: ${this.status.coreEndpoint}`);
        }
        await proxyService.refreshUpstreamProxyFromCurrentSystem();
        const runtimeId = randomUUID();
        const upstreamProxyUrl = proxyService.getUpstreamProxyUrl("https") ?? await getSystemProxyUrlForProtocol("https");
        this.child = spawnGatewayProcess(config, upstreamProxyUrl, runtimeId, this.coreAuthToken);
        writeManagedCoreGatewayMarker(config, this.child, runtimeId);
        this.child.stdout?.on("data", (chunk) => console.info(`[gateway] ${chunk.toString().trimEnd()}`));
        this.child.stderr?.on("data", (chunk) => console.warn(`[gateway] ${chunk.toString().trimEnd()}`));
        this.child.on("exit", (code, signal) => {
          void this.handleCoreGatewayExit(code, signal);
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

    await proxyService.stop(options.proxyRestoreTimeoutMs);
    await pluginService.stop();
    await backendService.stopAll();
    await this.browserWebSearchMcpIntegration?.stopBrowserWebSearchMcpServers().catch((error) => {
      console.warn(`[gateway] Failed to stop browser web search MCP: ${formatError(error)}`);
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

  private async handleCoreGatewayExit(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
    if (this.status.state === "stopped") {
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

    const path = request.url ? new URL(request.url, this.status.endpoint || "http://127.0.0.1").pathname : "/";
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

  private async proxyRequest(request: IncomingMessage, response: ServerResponse, path: string, apiKey?: ApiKeyConfig): Promise<void> {
    if (!this.config || !this.plugin) {
      sendJson(response, 503, { error: { message: "Gateway service is not configured." } });
      return;
    }

    const headers = forwardHeaders(request.headers);
    if (apiKey) {
      stripLocalGatewayAuthHeaders(headers);
      headers["x-auth-api-key-id"] = apiKey.id;
      headers["x-auth-sub"] = apiKey.id;
    }
    const method = request.method ?? "GET";
    const requestBody = await readRequestBody(request);
    const client = inferGatewayClient(apiKey, request.headers);
    const cursorCompatPreparation = prepareCursorOpenAICompatChatBody(this.config, client, method, path, requestBody);
    if (cursorCompatPreparation) {
      headers["x-ccr-cursor-openai-compat"] = sanitizeHeaderValue(cursorCompatPreparation.diagnostic);
    }
    let bodyToForward: Buffer | undefined = cursorCompatPreparation?.body ?? requestBody;
    let routeFallback = this.config.Router.fallback;
    let routedModel: string | undefined;
    let codexApplyPatchBridgeActive = false;
    const claudeModelRewrite = prepareClaudeCodeDiscoveredModelRequest(this.config, request.headers, method, path, bodyToForward);
    if (claudeModelRewrite) {
      headers["x-ccr-claude-model-discovery"] = sanitizeHeaderValue(claudeModelRewrite.diagnostic);
      bodyToForward = claudeModelRewrite.body;
    }
    const claudeAppModelRewrite = prepareClaudeAppFallbackModelRequest(this.config, method, path, bodyToForward);
    if (claudeAppModelRewrite) {
      headers["x-ccr-claude-app-model-rewrite"] = sanitizeHeaderValue(claudeAppModelRewrite.diagnostic);
      bodyToForward = claudeAppModelRewrite.body;
      routedModel = claudeAppModelRewrite.routedModel;
    }
    if (!reserveApiKeyLimits(apiKey, request, response, bodyToForward)) {
      return;
    }
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const requestId = randomUUID();
    headers["x-client-request-id"] = requestId;
    const requestUrl = new URL(request.url || path, this.status.endpoint || "http://127.0.0.1").toString();
    const upstreamAbortController = new AbortController();
    let clientDisconnected = false;
    let responseCompleted = false;
    let onClientDisconnect: (() => void) | undefined;
    let onResponseFinish: (() => void) | undefined;

    response.once("finish", () => {
      responseCompleted = true;
      onResponseFinish?.();
    });
    response.once("close", () => {
      if (responseCompleted || response.writableEnded) {
        return;
      }
      clientDisconnected = true;
      upstreamAbortController.abort(new Error(clientDisconnectMessage));
      onClientDisconnect?.();
    });
    response.on("error", (error) => {
      // Client-side write failures (EPIPE / ECONNRESET when the client closes
      // mid-stream, common during tool execution) must not crash the main
      // process as an Uncaught Exception. Swallow them here; the close handler
      // above already records the disconnect via writeStreamLog.
      if (!clientDisconnected) {
        clientDisconnected = true;
        upstreamAbortController.abort(new Error(clientDisconnectMessage));
      }
    });

    const writeRequestLog = (
      statusCode: number,
      responseHeaders: Headers,
      responseBodyText = "",
      responseBodyTruncated = false,
      error?: string
    ) => {
      const config = this.config;
      if (!config || !shouldRecordRequestLogs(config)) {
        return;
      }
      void (async () => {
        await recordGatewayRequestLog({
          client,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          error,
          fallbackModel: routedModel,
          method,
          path,
          providerName: resolveProviderLogName(responseHeaders, config, routedModel),
          providerProtocol: resolveResponseProviderProtocol(responseHeaders, this.config),
          requestBody: shouldSendBody(method) ? bodyToForward ?? Buffer.alloc(0) : Buffer.alloc(0),
          requestHeaders: headers,
          requestId,
          responseBodyText,
          responseBodyTruncated,
          responseHeaders,
          startedAt: startedAtIso,
          statusCode,
          url: requestUrl
        });
        const pendingRawTraceUpdate = this.takePendingRawTraceUpdate(requestId);
        if (pendingRawTraceUpdate) {
          await updateGatewayRequestLogFromRawTrace(pendingRawTraceUpdate);
        }
      })();
    };

    const shouldCaptureUsage = shouldCaptureGatewayUsage(method, path);
    if (shouldServeGatewayModelsResponse(method, path)) {
      const responseText = `${JSON.stringify(createGatewayModelsResponse(this.config, request.headers, apiKey))}\n`;
      const modelHeaders = new Headers({
        "cache-control": "no-store, max-age=0",
        "content-length": String(Buffer.byteLength(responseText)),
        "content-type": "application/json; charset=utf-8",
        "expires": "0",
        "pragma": "no-cache"
      });
      response.writeHead(200, Object.fromEntries(filteredResponseHeaders(modelHeaders)));
      response.end(responseText);
      return;
    }

    if (method === "POST" && path === "/v1/messages") {
      const body = parseJsonObject(bodyToForward ?? requestBody);
      const routed = await this.plugin.routeRequest({
        body,
        headers: headers as Record<string, string | string[] | undefined>,
        method,
        url: request.url ?? path
      });
      const serialized = Buffer.from(`${JSON.stringify(routed.body)}\n`, "utf8");
      headers["content-type"] = "application/json";
      headers["x-ccr-route-reason"] = sanitizeHeaderValue(routed.decision.reason);
      routeFallback = routed.decision.fallback ?? routeFallback;
      if (routed.decision.model) {
        headers["x-ccr-routed-model"] = sanitizeHeaderValue(routed.decision.model);
        routedModel = routed.decision.model;
      }
      bodyToForward = serialized;
    }
    if (method === "POST" && requestProtocolForPath(path) === "openai_responses" && isCodexUserAgent(request.headers)) {
      const body = parseJsonObject(bodyToForward ?? requestBody);
      const routed = await this.plugin.routeRequest({
        body,
        headers: headers as Record<string, string | string[] | undefined>,
        method,
        url: request.url ?? path
      });
      const serialized = Buffer.from(`${JSON.stringify(routed.body)}\n`, "utf8");
      headers["content-type"] = "application/json";
      headers["x-ccr-route-reason"] = sanitizeHeaderValue(routed.decision.reason);
      routeFallback = routed.decision.fallback ?? routeFallback;
      if (routed.decision.model) {
        headers["x-ccr-routed-model"] = sanitizeHeaderValue(routed.decision.model);
        routedModel = routed.decision.model;
      }
      bodyToForward = serialized;
    }

    const codexApplyPatchBridgeRequest = prepareCodexApplyPatchBridgeRequest({
      body: bodyToForward,
      config: this.config,
      headers: request.headers,
      method,
      path,
      routedModel
    });
    if (codexApplyPatchBridgeRequest) {
      bodyToForward = codexApplyPatchBridgeRequest.body;
      codexApplyPatchBridgeActive = true;
      headers["x-ccr-codex-patch-bridge"] = sanitizeHeaderValue(codexApplyPatchBridgeRequest.diagnostic);
      headers["content-type"] = "application/json";
    }

    const providerCapabilityRouting = applyProviderCapabilityRouting({
      body: bodyToForward,
      config: this.config,
      fallback: routeFallback,
      headers,
      path,
      routedModel
    });
    bodyToForward = providerCapabilityRouting.body;
    routeFallback = providerCapabilityRouting.fallback;
    routedModel = providerCapabilityRouting.routedModel;

    const hostedWebSearchProtocolContext = createHostedWebSearchProtocolContext({
      body: bodyToForward,
      config: this.config,
      method,
      path,
      requestId,
      routedModel,
      sinceMs: startedAt - 1_000
    });

    if (hostedWebSearchProtocolContext && this.browserWebSearchMcpIntegration) {
      const records = await selectHostedWebSearchProtocolRecords(
        hostedWebSearchProtocolContext,
        this.browserWebSearchMcpIntegration
      ).catch((error) => {
        console.warn(`[gateway] Failed to prefetch hosted web search results: ${formatError(error)}`);
        return [] as BrowserWebSearchProtocolRecord[];
      });
      if (records.length > 0) {
        hostedWebSearchProtocolContext.records = records;
        const webSearchContextBody = prepareHostedWebSearchProtocolRequestBody(
          bodyToForward,
          records,
          hostedWebSearchProtocolContext
        );
        if (webSearchContextBody) {
          bodyToForward = webSearchContextBody;
          headers["content-type"] = "application/json";
          headers["x-ccr-hosted-web-search-context"] = hostedWebSearchProtocolContext.protocol;
        }
      }
    }

    const claudeCodeWebSearchContinuationContext = !hostedWebSearchProtocolContext && this.browserWebSearchMcpIntegration
      ? createClaudeCodeWebSearchContinuationContext({
          body: bodyToForward,
          config: this.config,
          method,
          path,
          routedModel,
          sinceMs: startedAt - 5 * 60_000
        })
      : undefined;
    if (claudeCodeWebSearchContinuationContext && this.browserWebSearchMcpIntegration) {
      const records = selectClaudeCodeWebSearchContinuationRecords(
        claudeCodeWebSearchContinuationContext,
        this.browserWebSearchMcpIntegration
      );
      const webSearchContinuationBody = prepareClaudeCodeWebSearchContinuationRequestBody(
        bodyToForward,
        records,
        claudeCodeWebSearchContinuationContext
      );
      if (webSearchContinuationBody) {
        bodyToForward = webSearchContinuationBody;
        headers["content-type"] = "application/json";
        headers["x-ccr-claude-code-web-search-continuation"] = records.length > 0 ? "in-app-browser-evidence" : "tool-result-evidence";
      }
    }

    delete headers["content-length"];
    const upstreamUrl = new URL(request.url || "/", this.status.coreEndpoint).toString();
    let upstreamResult: UpstreamFetchResult;

    try {
      upstreamResult = await fetchUpstreamWithFallback({
        body: bodyToForward,
        config: this.config,
        fallback: routeFallback,
        headers,
        method,
        path,
        routedModel,
        coreAuthToken: this.coreAuthToken,
        signal: upstreamAbortController.signal,
        upstreamUrl
      });
    } catch (error) {
      const message = formatError(error);
      if (error instanceof UpstreamRequestError) {
        bodyToForward = error.attempt?.body ?? bodyToForward;
        routedModel = error.attempt?.model ?? routedModel;
      }
      if (clientDisconnected || upstreamAbortController.signal.aborted) {
        writeRequestLog(clientClosedRequestStatusCode, new Headers(), "", false, clientDisconnectMessage);
        return;
      }
      if (shouldCaptureUsage) {
        void recordGatewayUsageCapture({
          bodyText: "",
          client,
          durationMs: Date.now() - startedAt,
          fallbackModel: routedModel,
          method,
          path,
          providerName: resolveProviderLogName(new Headers(), this.config, routedModel),
          providerProtocol: resolveResponseProviderProtocol(new Headers(), this.config),
          requestId,
          responseHeaders: new Headers(),
          statusCode: 502
        });
      }
      writeRequestLog(502, new Headers(), "", false, message);
      throw error;
    }

    bodyToForward = upstreamResult.attempt.body ?? bodyToForward;
    routedModel = upstreamResult.attempt.model ?? routedModel;
    const responseHeaders = rewriteCapabilityResponseHeaders(
      // Copy into a mutable Headers instance: upstream fetch Response.headers
      // can be immutable (TypeError: immutable on .delete/.set), and
      // mergeFallbackResponseHeaders returns the original object as-is when
      // no fallback occurred. Codex apply_patch / web-search paths call
      // .delete("content-length") below, which would otherwise throw and
      // surface as a 502.
      new Headers(mergeFallbackResponseHeaders(upstreamResponseHeaders(upstreamResult), upstreamResult)),
      this.config
    );
    const upstreamResponse = upstreamResult.response;
    if (codexApplyPatchBridgeActive) {
      responseHeaders.delete("content-length");
    }
    const hostedWebSearchResponseContentType = responseHeaders.get("content-type")?.toLowerCase() ?? "";
    if (
      hostedWebSearchProtocolContext &&
      (hostedWebSearchResponseContentType.includes("application/json") ||
        hostedWebSearchResponseContentType.includes("text/event-stream")) &&
      (this.browserWebSearchMcpIntegration?.recentBrowserWebSearchResults || this.browserWebSearchMcpIntegration?.runBrowserWebSearch)
    ) {
      responseHeaders.delete("content-length");
    }
    recordProviderCredentialOutcome(this.config, method, upstreamResult.attempt, upstreamResponse.status, responseHeaders);
    response.writeHead(upstreamResponse.status, Object.fromEntries(filteredResponseHeaders(responseHeaders)));
    if (!upstreamResponse.body) {
      if (shouldCaptureUsage) {
        void recordGatewayUsageCapture({
          bodyText: "",
          client,
          durationMs: Date.now() - startedAt,
          fallbackModel: routedModel,
          method,
          path,
          providerName: resolveProviderLogName(responseHeaders, this.config, routedModel),
          providerProtocol: resolveResponseProviderProtocol(responseHeaders, this.config),
          requestId,
          responseHeaders,
          statusCode: upstreamResponse.status
        });
      }
      writeRequestLog(upstreamResponse.status, responseHeaders);
      response.end();
      return;
    }

    const upstreamBody = Readable.fromWeb(upstreamResponse.body as unknown as import("node:stream/web").ReadableStream);
    const patchedResponseBody = codexApplyPatchBridgeActive
      ? codexApplyPatchBridgeResponseStream(upstreamBody, responseHeaders)
      : upstreamBody;
    const responseBody = hostedWebSearchProtocolContext
      ? hostedWebSearchProtocolResponseStream(
          patchedResponseBody,
          responseHeaders,
          hostedWebSearchProtocolContext,
          this.browserWebSearchMcpIntegration
        )
      : patchedResponseBody;
    const sampler = createBodySampler();
    const sseErrorDetector = createSseErrorDetector(responseHeaders.get("content-type") ?? undefined);
    let streamDetectedError: string | undefined;
    let upstreamStreamEnded = false;
    let logRecorded = false;
    const writeStreamLog = (error?: string) => {
      if (logRecorded) {
        return;
      }
      logRecorded = true;
      writeRequestLog(
        upstreamResponse.status,
        responseHeaders,
        sampler.read(),
        sampler.isTruncated(),
        error ?? streamDetectedError
      );
    };
    onClientDisconnect = () => {
      writeStreamLog(clientDisconnectMessage);
      responseBody.destroy(new Error(clientDisconnectMessage));
    };
    onResponseFinish = () => {
      if (upstreamStreamEnded) {
        writeStreamLog();
      }
    };
    responseBody.on("data", (chunk) => {
      sampler.append(chunk);
      streamDetectedError ??= sseErrorDetector.append(chunk);
    });
    responseBody.once("end", () => {
      upstreamStreamEnded = true;
      streamDetectedError ??= sseErrorDetector.finish();
      if (responseCompleted || response.writableEnded) {
        writeStreamLog();
      }
    });
    responseBody.on("error", (error) => {
      streamDetectedError ??= sseErrorDetector.finish();
      writeStreamLog(clientDisconnected ? clientDisconnectMessage : formatError(error));
    });
    if (shouldCaptureUsage) {
      responseBody.once("end", () => {
        void recordGatewayUsageCapture({
          bodyText: sampler.read(),
          client,
          durationMs: Date.now() - startedAt,
          fallbackModel: routedModel,
          method,
          path,
          providerName: resolveProviderLogName(responseHeaders, this.config, routedModel),
          providerProtocol: resolveResponseProviderProtocol(responseHeaders, this.config),
          requestId,
          responseHeaders,
          statusCode: upstreamResponse.status
        });
      });
    }
    responseBody.pipe(response);
  }

  private async handleRawTraceSync(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    if (readHeader(request.headers[rawTraceSyncHeader]) !== this.rawTraceSyncToken) {
      sendJson(response, 401, { error: { message: "Unauthorized raw trace sync." } });
      return;
    }

    const manifest = parseJsonObject(await readRequestBody(request));
    const update = readRawTraceRequestLogUpdate(manifest);
    cleanupRawTraceBundle(manifest);
    if (!update) {
      sendJson(response, 202, { applied: false, ok: true });
      return;
    }

    const applied = await updateGatewayRequestLogFromRawTrace(update);
    if (!applied) {
      this.storePendingRawTraceUpdate(update);
    }
    sendJson(response, 200, { applied, ok: true });
  }

  private storePendingRawTraceUpdate(update: RequestLogRawTraceUpdateInput): void {
    this.prunePendingRawTraceUpdates();
    this.pendingRawTraceUpdates.set(update.requestId, {
      ...update,
      receivedAt: Date.now()
    });
    while (this.pendingRawTraceUpdates.size > maxPendingRawTraceUpdates) {
      const oldestKey = this.pendingRawTraceUpdates.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.pendingRawTraceUpdates.delete(oldestKey);
    }
  }

  private takePendingRawTraceUpdate(requestId: string): RequestLogRawTraceUpdateInput | undefined {
    const update = this.pendingRawTraceUpdates.get(requestId);
    if (!update) {
      return undefined;
    }
    this.pendingRawTraceUpdates.delete(requestId);
    const { receivedAt: _receivedAt, ...input } = update;
    return input;
  }

  private prunePendingRawTraceUpdates(): void {
    const cutoff = Date.now() - pendingRawTraceMaxAgeMs;
    for (const [requestId, update] of this.pendingRawTraceUpdates) {
      if (update.receivedAt < cutoff) {
        this.pendingRawTraceUpdates.delete(requestId);
      }
    }
  }
}

export const gatewayService = new GatewayService();

async function writeCoreGatewayConfig(
  config: AppConfig,
  rawTraceSyncToken: string,
  browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration
): Promise<void> {
  assertLoopbackCoreHost(config.gateway.coreHost);
  mkdirSync(dirname(config.gateway.generatedConfigFile), { mode: privateDirMode, recursive: true });
  const pluginCoreGatewayConfig = pluginService.getCoreGatewayConfig();
  const providerPlugins = withCodexOauthRuntimeDefaults([
    ...(config.providerPlugins ?? []),
    ...pluginService.getCoreProviderPlugins()
  ]);
  const codexOauthProviderNames = codexOauthLocalProviderNames(providerPlugins);
  const virtualModelProfiles = normalizeCoreGatewayVirtualModelProfiles(withCodexCompatibleVirtualModelProfiles(withFusionVirtualModelAliases([
    ...(config.virtualModelProfiles ?? []),
    ...pluginService.getVirtualModelProfiles()
  ])), config);
  const coreEndpoint = endpoint(config.gateway.coreHost, config.gateway.corePort);
  const builtinToolArtifacts = await fusionBuiltinToolArtifacts(virtualModelProfiles, coreEndpoint, browserWebSearchMcpIntegration);
  const providers = [
    ...config.Providers
      .flatMap((provider) => toCoreGatewayProviders(withCodexOauthProviderBaseUrl(provider, codexOauthProviderNames)))
      .filter((provider): provider is CoreGatewayProvider => Boolean(provider)),
    ...builtinToolArtifacts.providers
  ];
  const pluginAgentConfig = isRecord(pluginCoreGatewayConfig.agent) ? pluginCoreGatewayConfig.agent : {};
  const pluginMcpServers = Array.isArray(pluginAgentConfig.mcpServers) ? pluginAgentConfig.mcpServers : [];
  const mcpServers = [
    ...builtinToolArtifacts.mcpServers,
    ...pluginMcpServers,
    ...(config.agent?.mcpServers ?? [])
  ];
  const fallbackMcpServer = fusionToolFallbackMcpServer(virtualModelProfiles, mcpServers);
  if (fallbackMcpServer) {
    mcpServers.push(fallbackMcpServer);
  }
  const payload = {
    ...pluginCoreGatewayConfig,
    auth: {
      enabled: true,
      mode: "static_api_key",
      required: true,
      staticApiKeys: {
        keyBearerOnly: false,
        keyEnv: coreGatewayAuthTokenEnv,
        keyHeader: coreGatewayAuthHeader
      }
    },
    billing: {
      enabled: true
    },
    billingQueue: {
      enabled: false
    },
    billingWebhook: {
      enabled: false
    },
    bodyLimitBytes: 50 * 1024 * 1024,
    host: config.gateway.coreHost,
    mcpGateway: {
      enabled: false
    },
    port: config.gateway.corePort,
    upstreamTimeoutMs: Number(config.API_TIMEOUT_MS) || 0,
    agent: {
      ...pluginAgentConfig,
      mcpServers
    },
    rawTrace: buildRawTraceConfig(config, rawTraceSyncToken),
    providerPlugins,
    providers,
    virtualModelProfiles
  };

  writePrivateTextFile(config.gateway.generatedConfigFile, `${JSON.stringify(payload, null, 2)}\n`);
}

function writePrivateTextFile(file: string, content: string): void {
  writeFileSync(file, content, { encoding: "utf8", mode: privateFileMode });
  if (process.platform !== "win32") {
    try {
      chmodSync(file, privateFileMode);
    } catch {
      // Best effort for filesystems that do not support chmod.
    }
  }
}

export function normalizeCoreGatewayVirtualModelProfiles(profiles: unknown[], config: AppConfig): unknown[] {
  return profiles.map((profile) => normalizeCoreGatewayVirtualModelProfile(profile, config));
}

function normalizeCoreGatewayVirtualModelProfile(profile: unknown, config: AppConfig): unknown {
  if (!isRecord(profile)) {
    return profile;
  }

  let nextProfile: Record<string, unknown> | undefined;
  const baseModel = isRecord(profile.baseModel) ? profile.baseModel : undefined;
  const fixedModel = stringValue(baseModel?.fixedModel);
  const rewrittenFixedModel = fixedModel
    ? rewriteModelSelectorForCoreGatewayProfile(fixedModel, config, "anthropic_messages")
    : undefined;
  if (baseModel && rewrittenFixedModel && rewrittenFixedModel !== fixedModel) {
    nextProfile = {
      ...profile,
      baseModel: {
        ...baseModel,
        fixedModel: rewrittenFixedModel
      }
    };
  }

  const sourceProfile = nextProfile ?? profile;
  const metadata = isRecord(sourceProfile.metadata) ? sourceProfile.metadata : undefined;
  const fusionVision = isRecord(metadata?.fusionVision) ? metadata.fusionVision : undefined;
  const visionBaseUrl = stringValue(fusionVision?.baseUrl);
  const visionSelectorField = stringValue(fusionVision?.modelSelector) ? "modelSelector" : stringValue(fusionVision?.model) ? "model" : undefined;
  const visionSelector = visionSelectorField ? stringValue(fusionVision?.[visionSelectorField]) : undefined;
  const rewrittenVisionSelector = fusionVision && !visionBaseUrl && visionSelector
    ? rewriteModelSelectorForCoreGatewayProfile(visionSelector, config, "openai_chat_completions")
    : undefined;

  if (metadata && fusionVision && visionSelectorField && rewrittenVisionSelector && rewrittenVisionSelector !== visionSelector) {
    nextProfile = {
      ...sourceProfile,
      metadata: {
        ...metadata,
        fusionVision: {
          ...fusionVision,
          [visionSelectorField]: rewrittenVisionSelector
        }
      }
    };
  }

  const profileAfterVision = nextProfile ?? profile;
  const profileAfterWebSearchToolName = normalizeFusionWebSearchProfileToolName(profileAfterVision) ?? profileAfterVision;
  return withFusionWebSearchToolInstructions(profileAfterWebSearchToolName) ?? profileAfterWebSearchToolName;
}

function rewriteModelSelectorForCoreGatewayProfile(
  model: string,
  config: AppConfig,
  clientProtocol: GatewayProviderProtocol
): string | undefined {
  const normalized = normalizeRouteSelector(model);
  if (!normalized) {
    return undefined;
  }

  const publicModel = resolveGatewayPublicModelId(normalized, config) ?? normalized;
  const selector =
    resolveConfiguredProviderModelSelector(publicModel, config) ??
    resolveUniqueConfiguredProviderModelSelector(publicModel, config);
  if (!selector) {
    return publicModel;
  }

  const providerName = coreGatewayProviderSelectorName(selector.provider, clientProtocol);
  return providerName ? `${providerName}/${selector.model}` : publicModel;
}

function coreGatewayProviderSelectorName(
  provider: GatewayProviderConfig,
  clientProtocol: GatewayProviderProtocol
): string | undefined {
  const capability = providerCapabilityForClientProtocol(provider, clientProtocol);
  const explicitCapabilities = normalizedProviderCapabilities(provider);
  const protocol = capability?.type ?? (explicitCapabilities.length === 0 ? providerProtocolForClientProtocol(provider, clientProtocol) : undefined);
  if (!protocol) {
    return undefined;
  }

  const credentials = sortProviderCredentialsForConfig(activeProviderCredentials(provider));
  if (credentials.length > 0) {
    return providerCredentialInternalName(provider, protocol, credentials[0]);
  }

  return capability ? providerCapabilityInternalName(provider, protocol) : providerRuntimeId(provider);
}

function withCodexOauthRuntimeDefaults(providerPlugins: unknown[]): unknown[] {
  const codexAuth = readCodexAuth();
  return providerPlugins.map((plugin) => {
    if (!isLocalCodexOauthProviderPlugin(plugin)) {
      return plugin;
    }

    const codexOauth = plugin.codexOauth;
    const nextCodexOauth = {
      ...codexOauth,
      ...(!hasOwn(codexOauth, "accountId") && !hasOwn(codexOauth, "account_id") && codexAuth?.accountId
        ? { accountId: codexAuth.accountId }
        : {})
    };
    const nextPlugin: Record<string, unknown> = {
      ...plugin,
      codexOauth: nextCodexOauth,
      request: withCodexBackendRequestTransform(plugin.request)
    };

    if (codexAuth?.isFedrampAccount) {
      const currentAuth = isRecord(plugin.auth) ? plugin.auth : {};
      const currentHeaders = isRecord(currentAuth.headers) ? currentAuth.headers : {};
      nextPlugin.auth = {
        ...currentAuth,
        headers: {
          ...currentHeaders,
          "X-OpenAI-Fedramp": "true"
        }
      };
    }

    return nextPlugin;
  });
}

function codexOauthLocalProviderNames(providerPlugins: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const plugin of providerPlugins) {
    if (!isLocalCodexOauthProviderPlugin(plugin)) {
      continue;
    }
    addProviderNameVariants(names, stringValue(plugin.providerName));
  }
  return names;
}

function withCodexOauthProviderBaseUrl(
  provider: GatewayProviderConfig,
  codexOauthProviderNames: Set<string>
): GatewayProviderConfig {
  if (!codexOauthProviderNames.has(provider.name)) {
    return provider;
  }

  const protocol =
    normalizeProviderProtocol(provider.type) ??
    normalizeProviderProtocol(provider.provider) ??
    inferProtocol(provider);
  if (protocol !== "openai_responses") {
    return provider;
  }

  const capabilities = Array.isArray(provider.capabilities)
    ? provider.capabilities.map((capability) => {
        const capabilityProtocol = normalizeProviderProtocol(capability.type);
        if (capabilityProtocol !== "openai_responses") {
          return capability;
        }
        return {
          ...capability,
          baseUrl: codexDefaultBaseUrl
        };
      })
    : provider.capabilities;

  return {
    ...provider,
    api_base_url: codexDefaultBaseUrl,
    baseUrl: codexDefaultBaseUrl,
    baseurl: codexDefaultBaseUrl,
    capabilities
  };
}

function isLocalCodexOauthProviderPlugin(value: unknown): value is Record<string, unknown> & { codexOauth: Record<string, unknown> } {
  if (!isRecord(value) || !isRecord(value.codexOauth)) {
    return false;
  }
  const key = stringValue(value.key)?.toLowerCase() ?? "";
  return key.startsWith("ccr-local-agent-") && key.includes("codex-oauth");
}

function withCodexBackendRequestTransform(request: unknown): Record<string, unknown> {
  const currentRequest = isRecord(request) ? request : {};
  const bodyRemove = Array.isArray(currentRequest.bodyRemove)
    ? currentRequest.bodyRemove.map((item) => stringValue(item)).filter((item): item is string => Boolean(item))
    : [];
  return {
    ...currentRequest,
    bodyRemove: uniqueStrings([...bodyRemove, "max_output_tokens"])
  };
}

function addProviderNameVariants(names: Set<string>, providerName: string | undefined): void {
  if (!providerName) {
    return;
  }
  names.add(providerName);
  const capabilitySeparatorIndex = providerName.indexOf("::");
  if (capabilitySeparatorIndex > 0) {
    names.add(providerName.slice(0, capabilitySeparatorIndex));
  }
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

async function fusionBuiltinToolArtifacts(
  profiles: unknown[],
  coreEndpoint: string,
  browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration
): Promise<{ mcpServers: GatewayMcpServerConfig[]; providers: CoreGatewayProvider[] }> {
  const providers: CoreGatewayProvider[] = [];
  const mcpServers: GatewayMcpServerConfig[] = [];
  const toolServerKeys = new Set<string>();
  const entry = bundledFusionBuiltinMcpEntryPath();

  for (const [index, profile] of profiles.entries()) {
    if (!isRecord(profile) || profile.enabled === false) {
      continue;
    }
    const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
    const profileId = stringValue(profile.id) || stringValue(profile.key) || `fusion-${index + 1}`;
    const sanitizedProfileId = sanitizeMcpServerName(profileId);

    const visionConfig = readFusionVisionConfig(metadata?.fusionVision) ?? legacyFusionVisionConfig(profile);
    if (visionConfig?.toolName) {
      const resolvedVision = resolveFusionVisionRuntime(visionConfig);
      providers.push(...resolvedVision.providers);
      const toolServerKey = `vision:${visionConfig.toolName}`;
      if (!toolServerKeys.has(toolServerKey)) {
        toolServerKeys.add(toolServerKey);
        mcpServers.push(fusionBuiltinMcpServer({
          entry,
          env: {
            FUSION_BUILTIN_TOOL_KIND: "vision",
            FUSION_TOOL_NAME: visionConfig.toolName,
            ...(visionConfig.baseUrl ? { VISION_BASE_URL: visionConfig.baseUrl } : { VISION_GATEWAY_BASE_URL: `${coreEndpoint}/v1` }),
            ...(resolvedVision.model ? { VISION_MODEL: resolvedVision.model } : {}),
            ...(visionConfig.baseUrl && visionConfig.apiKey ? { VISION_API_KEY: visionConfig.apiKey } : {}),
            ...(visionConfig.timeoutMs ? { VISION_TIMEOUT_MS: String(visionConfig.timeoutMs) } : {})
          },
          name: `fusion-vision-${sanitizedProfileId}`
        }));
      }
    }

    const webSearchConfig = readFusionWebSearchConfig(metadata?.fusionWebSearch) ?? legacyFusionWebSearchConfig(profile);
    if (webSearchConfig?.toolName) {
      const toolServerKey = `web_search:${webSearchConfig.toolName}`;
      if (!toolServerKeys.has(toolServerKey)) {
        toolServerKeys.add(toolServerKey);
        const provider = webSearchConfig.provider ?? defaultFusionWebSearchProvider;
        if (provider === "browser") {
          const browserMcpServer = await browserWebSearchMcpIntegration?.registerBrowserWebSearchMcpServer({
            env: webSearchConfig.env ?? {},
            name: `fusion-browser-web-search-${sanitizedProfileId}`,
            resultCount: webSearchConfig.resultCount,
            timeoutMs: webSearchConfig.timeoutMs,
            toolName: webSearchConfig.toolName
          });
          if (browserMcpServer) {
            mcpServers.push(browserMcpServer);
          }
        } else {
          mcpServers.push(fusionBuiltinMcpServer({
            entry,
            env: {
              FUSION_BUILTIN_TOOL_KIND: "web_search",
              FUSION_TOOL_NAME: webSearchConfig.toolName,
              SEARCH_PROVIDER: provider,
              ...(webSearchConfig.resultCount ? { SEARCH_RESULT_COUNT: String(webSearchConfig.resultCount) } : {}),
              ...(webSearchConfig.timeoutMs ? { SEARCH_TIMEOUT_MS: String(webSearchConfig.timeoutMs) } : {}),
              ...(webSearchConfig.env ?? {})
            },
            name: `fusion-web-search-${sanitizedProfileId}`
          }));
        }
      }
    }
  }

  return { mcpServers, providers };
}

function fusionBuiltinMcpServer({
  entry,
  env,
  name
}: {
  entry: string;
  env: Record<string, string>;
  name: string;
}): GatewayMcpServerConfig {
  return {
    args: [entry],
    command: process.execPath,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      ...env
    },
    name,
    protocolVersion: "2024-11-05",
    requestTimeoutMs: 600000,
    startupTimeoutMs: 600000,
    stdioMessageMode: "content-length",
    transport: "stdio"
  };
}

function bundledFusionBuiltinMcpEntryPath(): string {
  return pathJoin(__dirname, "fusion-vision-mcp.js");
}

function fusionToolFallbackMcpServer(
  profiles: unknown[],
  existingServers: unknown[]
): GatewayMcpServerConfig | undefined {
  const tools = fusionFallbackToolDefinitions(profiles, fusionToolNamesBackedByMcpServers(existingServers));
  if (tools.length === 0) {
    return undefined;
  }

  return {
    args: [bundledFusionToolFallbackMcpEntryPath()],
    command: process.execPath,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      FUSION_FALLBACK_TOOLS_JSON: JSON.stringify(tools)
    },
    name: uniqueMcpServerName("ccr-fusion-tool-fallback", existingServers),
    protocolVersion: "2024-11-05",
    requestTimeoutMs: 600000,
    startupTimeoutMs: 600000,
    stdioMessageMode: "content-length",
    transport: "stdio"
  };
}

function bundledFusionToolFallbackMcpEntryPath(): string {
  return pathJoin(__dirname, "fusion-tool-fallback-mcp.js");
}

export function fusionFallbackToolDefinitions(
  profiles: unknown[],
  backedToolNames: Set<string> = new Set()
): Array<{ description?: string; inputSchema?: Record<string, unknown>; name: string }> {
  const byName = new Map<string, { description?: string; inputSchema?: Record<string, unknown>; name: string }>();

  for (const profile of profiles) {
    if (!isRecord(profile) || profile.enabled === false || !Array.isArray(profile.tools)) {
      continue;
    }
    for (const tool of profile.tools) {
      if (!isRecord(tool)) {
        continue;
      }
      const name = stringValue(tool.name);
      if (!name) {
        continue;
      }
      if (backedToolNames.has(name)) {
        continue;
      }

      const existing = byName.get(name);
      const description = stringValue(tool.description);
      const inputSchema = isRecord(tool.inputSchema)
        ? tool.inputSchema
        : isRecord(tool.input_schema)
          ? tool.input_schema
          : undefined;
      if (existing) {
        if (!existing.description && description) {
          existing.description = description;
        }
        if (!existing.inputSchema && inputSchema) {
          existing.inputSchema = inputSchema;
        }
        continue;
      }

      byName.set(name, {
        ...(description ? { description } : {}),
        ...(inputSchema ? { inputSchema } : {}),
        name
      });
    }
  }

  return [...byName.values()];
}

export function fusionToolNamesBackedByMcpServers(servers: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const server of servers) {
    if (!isRecord(server)) {
      continue;
    }
    const serverName = stringValue(server.name);
    if (serverName) {
      names.add(serverName);
    }

    const env = isRecord(server.env) ? server.env : undefined;
    const fusionToolName = stringValue(env?.FUSION_TOOL_NAME);
    if (fusionToolName) {
      names.add(fusionToolName);
    }
  }
  return names;
}

function uniqueMcpServerName(baseName: string, servers: unknown[]): string {
  const used = new Set(
    servers
      .map((server) => isRecord(server) ? stringValue(server.name)?.toLowerCase() : undefined)
      .filter((name): name is string => Boolean(name))
  );
  if (!used.has(baseName.toLowerCase())) {
    return baseName;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${baseName}-${index}`;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

function withFusionVirtualModelAliases(profiles: unknown[]): unknown[] {
  return profiles.map((profile) => {
    if (!isRecord(profile)) {
      return profile;
    }
    const match = isRecord(profile.match) ? profile.match : {};
    const exactAliases = stringListValue(match.exactAliases);
    const catalogNames = exactAliases.length > 0
      ? exactAliases
      : [stringValue(profile.key) || stringValue(profile.displayName)].filter((value): value is string => Boolean(value));
    const fusionAliases = catalogNames.flatMap(fusionModelSelectors).filter(Boolean);
    if (fusionAliases.length === 0) {
      return profile;
    }
    return {
      ...profile,
      match: {
        ...match,
        exactAliases: uniqueStrings([...exactAliases, ...fusionAliases])
      }
    };
  });
}

function withCodexCompatibleVirtualModelProfiles(profiles: unknown[]): unknown[] {
  return profiles.map((profile) => {
    if (!isRecord(profile) || profile.enabled === false) {
      return profile;
    }
    const materialization = isRecord(profile.materialization) ? profile.materialization : {};
    if (materialization.enabled === false || materialization.includeInGatewayModels === false) {
      return profile;
    }
    const execution = isRecord(profile.execution) ? profile.execution : {};
    if (execution.clientToolsPolicy === "allow") {
      return profile;
    }
    return {
      ...profile,
      execution: {
        ...execution,
        clientToolsPolicy: "allow"
      }
    };
  });
}

function fusionModelSelector(model: string): string {
  const normalized = fusionModelNameFromSelector(model);
  return normalized ? `${fusionModelProviderName}/${normalized}` : "";
}

function fusionModelSelectors(model: string): string[] {
  const normalized = fusionModelNameFromSelector(model);
  if (!normalized) {
    return [];
  }
  const lowerModel = normalized.toLowerCase();
  return uniqueStrings([
    fusionModelSelector(normalized),
    lowerModel,
    `${fusionModelProviderName}/${lowerModel}`,
    `${fusionModelProviderName.toLowerCase()}/${lowerModel}`
  ]);
}

function fusionModelNameFromSelector(model: string): string {
  const trimmed = model.trim();
  const prefix = `${fusionModelProviderName}/`;
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase())
    ? trimmed.slice(prefix.length).trim()
    : trimmed;
}

function legacyFusionVisionConfig(profile: Record<string, unknown>): VirtualModelFusionVisionConfig | undefined {
  const toolName = legacyFusionBuiltinToolName(profile, BUILTIN_FUSION_VISION_TOOL_NAME, "matchMultimodal");
  return toolName ? { toolName } : undefined;
}

function legacyFusionWebSearchConfig(profile: Record<string, unknown>): VirtualModelFusionWebSearchConfig | undefined {
  const toolName = legacyFusionBuiltinToolName(profile, BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME, "matchWebSearch");
  return toolName ? { provider: defaultFusionWebSearchProvider, toolName } : undefined;
}

function legacyFusionBuiltinToolName(
  profile: Record<string, unknown>,
  baseToolName: string,
  executionFlag: "matchMultimodal" | "matchWebSearch"
): string | undefined {
  const tools = Array.isArray(profile.tools) ? profile.tools : [];
  const toolName = tools
    .map((tool) => isRecord(tool) ? stringValue(tool.name) ?? "" : "")
    .find((name) => fusionBuiltinToolNameMatches(name, baseToolName));
  if (toolName) {
    return toolName;
  }
  const execution = isRecord(profile.execution) ? profile.execution : {};
  return execution[executionFlag] === true ? baseToolName : undefined;
}

function fusionBuiltinToolNameMatches(name: string, baseToolName: string): boolean {
  if (name === baseToolName || name.startsWith(`${baseToolName}_`)) {
    return true;
  }
  if (baseToolName !== BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME) {
    return false;
  }
  return coreGatewayWebSearchToolNameMatches(name);
}

function normalizeFusionWebSearchProfileToolName(profile: Record<string, unknown>): Record<string, unknown> | undefined {
  const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
  const fusionWebSearch = isRecord(metadata?.fusionWebSearch) ? metadata.fusionWebSearch : undefined;
  const configuredToolName = stringValue(fusionWebSearch?.toolName);
  const legacyToolName = configuredToolName ? undefined : legacyFusionWebSearchConfig(profile)?.toolName;
  const toolName = configuredToolName || legacyToolName;
  if (!toolName) {
    return undefined;
  }

  const nextToolName = coreGatewayCompatibleWebSearchToolName(toolName, stringValue(profile.key) || stringValue(profile.id));
  if (nextToolName === toolName) {
    return undefined;
  }

  const tools = Array.isArray(profile.tools)
    ? profile.tools.map((tool) => {
        if (!isRecord(tool) || stringValue(tool.name) !== toolName) {
          return tool;
        }
        return {
          ...tool,
          name: nextToolName
        };
      })
    : profile.tools;

  return {
    ...profile,
    ...(metadata && fusionWebSearch
      ? {
          metadata: {
            ...metadata,
            fusionWebSearch: {
              ...fusionWebSearch,
              toolName: nextToolName
            }
          }
        }
      : {}),
    ...(tools ? { tools } : {})
  };
}

function withFusionWebSearchToolInstructions(profile: Record<string, unknown>): Record<string, unknown> | undefined {
  const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
  const fusionWebSearch = isRecord(metadata?.fusionWebSearch) ? metadata.fusionWebSearch : undefined;
  const toolName = stringValue(fusionWebSearch?.toolName) || legacyFusionWebSearchConfig(profile)?.toolName;
  if (!toolName) {
    return undefined;
  }
  const execution = isRecord(profile.execution) ? profile.execution : {};
  if (execution.matchWebSearch !== true) {
    return undefined;
  }

  const instruction = [
    `When the client request includes a hosted web_search tool declaration, call the ${toolName} function tool before answering.`,
    "Pass the user's search query in the prompt field.",
    "Do not use provider-native web search or claim that web search is unavailable unless this function tool returns an error."
  ].join(" ");
  const instructions = isRecord(profile.instructions) ? profile.instructions : {};
  if ([instructions.prepend, instructions.append, instructions.replace].some((value) => stringValue(value)?.includes(instruction))) {
    return undefined;
  }
  const replace = stringValue(instructions.replace);
  const append = stringValue(instructions.append);
  return {
    ...profile,
    instructions: {
      ...instructions,
      ...(replace
        ? { replace: `${replace.trim()}\n\n${instruction}` }
        : { append: [append, instruction].filter(Boolean).join("\n\n") })
    }
  };
}

function coreGatewayCompatibleWebSearchToolName(toolName: string, fallbackName?: string): string {
  if (coreGatewayWebSearchToolNameMatches(toolName)) {
    return toolName;
  }

  const normalized = sanitizeFusionToolName(toolName);
  const prefix = `${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}_`;
  if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
    return truncateFusionToolName(`${normalized.slice(prefix.length)}_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`);
  }

  const fallback = sanitizeFusionToolName(fallbackName || normalized || "fusion");
  return truncateFusionToolName(`${fallback}_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`);
}

function coreGatewayWebSearchToolNameMatches(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[-.]/g, "_");
  return normalized === BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME ||
    normalized.endsWith(`_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`) ||
    normalized.includes("search_web");
}

function sanitizeFusionToolName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "fusion";
}

function truncateFusionToolName(value: string): string {
  const maxToolNameLength = 64;
  if (value.length <= maxToolNameLength) {
    return value;
  }
  const suffix = `_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`;
  const available = Math.max(1, maxToolNameLength - suffix.length);
  return `${value.slice(0, available).replace(/_+$/g, "")}${suffix}`;
}

function readFusionVisionConfig(value: unknown): VirtualModelFusionVisionConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const toolName = stringValue(value.toolName);
  if (!toolName) {
    return undefined;
  }
  const config: VirtualModelFusionVisionConfig = {
    toolName,
    apiKey: stringValue(value.apiKey),
    baseUrl: stringValue(value.baseUrl),
    model: stringValue(value.model),
    modelSelector: stringValue(value.modelSelector)
  };
  const timeoutMs = numberValue(value.timeoutMs);
  if (timeoutMs) {
    config.timeoutMs = timeoutMs;
  }
  return config;
}

function readFusionWebSearchConfig(value: unknown): VirtualModelFusionWebSearchConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const toolName = stringValue(value.toolName);
  if (!toolName) {
    return undefined;
  }
  const config: VirtualModelFusionWebSearchConfig = {
    toolName,
    env: isRecord(value.env) ? stringRecordFromUnknown(value.env) : undefined,
    provider: parseFusionWebSearchProvider(value.provider)
  };
  const resultCount = numberValue(value.resultCount);
  if (resultCount) {
    config.resultCount = resultCount;
  }
  const timeoutMs = numberValue(value.timeoutMs);
  if (timeoutMs) {
    config.timeoutMs = timeoutMs;
  }
  return config;
}

function resolveFusionVisionRuntime(
  config: VirtualModelFusionVisionConfig
): { model?: string; providers: CoreGatewayProvider[] } {
  const selector = config.modelSelector || config.model;
  if (config.baseUrl) {
    return {
      model: config.model || config.modelSelector,
      providers: []
    };
  }

  const parsed = parseFusionModelSelector(selector);
  if (!parsed) {
    return {
      model: selector ? normalizeGatewayModelSelector(selector) : undefined,
      providers: []
    };
  }

  return {
    model: `${parsed.providerName}/${parsed.model}`,
    providers: []
  };
}

function parseFusionModelSelector(value: string | undefined): { model: string; providerName: string } | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const providerName = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return providerName && model ? { model, providerName } : undefined;
  }
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    const providerName = trimmed.slice(0, slashIndex).trim();
    const model = trimmed.slice(slashIndex + 1).trim();
    return providerName && model ? { model, providerName } : undefined;
  }
  return undefined;
}

function normalizeGatewayModelSelector(value: string): string {
  const parsed = parseFusionModelSelector(value);
  return parsed ? `${parsed.providerName}/${parsed.model}` : value.trim();
}

function parseFusionWebSearchProvider(value: unknown): VirtualModelFusionWebSearchProvider | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  if (
    normalized === "brave" ||
    normalized === "bing" ||
    normalized === "google_cse" ||
    normalized === "serper" ||
    normalized === "serpapi" ||
    normalized === "tavily" ||
    normalized === "exa" ||
    normalized === "browser"
  ) {
    return normalized;
  }
  return undefined;
}

function stringRecordFromUnknown(value: Record<string, unknown>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const normalizedValue = stringValue(rawValue);
    if (normalizedKey && normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function sanitizeMcpServerName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "fusion";
}

function buildRawTraceConfig(config: AppConfig, rawTraceSyncToken: string): Record<string, unknown> {
  const enabled = rawTraceEnabledFromEnv() && shouldRecordRequestLogs(config);
  return {
    deleteLocalAfterUpload: false,
    enabled,
    maxPartBytes: maxUsageCaptureBytes,
    mode: "wire_raw",
    spoolDir: RAW_TRACE_SPOOL_DIR,
    sync: {
      enabled,
      endpoint: `${endpoint(config.gateway.host, config.gateway.port)}${rawTraceSyncPath}`,
      headers: {
        [rawTraceSyncHeader]: rawTraceSyncToken
      },
      timeoutMs: 5000
    }
  };
}

function shouldRecordRequestLogs(config: AppConfig): boolean {
  return Boolean(config.observability?.requestLogs || config.observability?.agentAnalysis);
}

function rawTraceEnabledFromEnv(): boolean {
  const value = (process.env.CCR_RAW_TRACE_ENABLED ?? process.env.CCR_RAW_TRACE ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function readRawTraceRequestLogUpdate(manifest: Record<string, unknown>): RequestLogRawTraceUpdateInput | undefined {
  const requestId = stringValue(manifest.turnKey);
  const parts = Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
  if (!requestId || parts.length === 0) {
    return undefined;
  }

  const upstreamRequestMetadata = readRawTraceJsonPart(parts, "upstream_request_metadata");
  const upstreamResponseMetadata = readRawTraceJsonPart(parts, "upstream_response_metadata");
  const upstreamRequestBody = readRawTraceTextPart(parts, "upstream_request");
  const upstreamResponseStream = readRawTraceTextPart(parts, "response_stream");
  const upstreamResponseBody = upstreamResponseStream ?? readRawTraceTextPart(parts, "upstream_response");
  const target = isRecord(manifest.target) ? manifest.target : {};
  const rawUrl = stringValue(upstreamRequestMetadata?.url);
  const url = sanitizeUrlForLog(rawUrl);

  return {
    method: stringValue(upstreamRequestMetadata?.method) || "POST",
    model: stringValue(target.model),
    path: pathFromUrl(url),
    provider: stringValue(target.providerName) || stringValue(target.provider),
    requestBodyContentType: upstreamRequestBody?.contentType,
    requestBodyText: upstreamRequestBody?.text,
    requestHeaders: headerRecordFromUnknown(upstreamRequestMetadata?.headers),
    requestId,
    isStream: upstreamResponseStream !== undefined,
    responseBodyContentType: upstreamResponseBody?.contentType,
    responseBodyText: upstreamResponseBody?.text,
    responseHeaders: headerRecordFromUnknown(upstreamResponseMetadata?.headers),
    statusCode: numberValue(upstreamResponseMetadata?.statusCode),
    url
  };
}

function readRawTraceJsonPart(parts: Record<string, unknown>[], partType: string): Record<string, unknown> | undefined {
  const text = readRawTraceTextPart(parts, partType)?.text;
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readRawTraceTextPart(parts: Record<string, unknown>[], partType: string): RawTracePartText | undefined {
  const part = parts.find((candidate) => stringValue(candidate.partType) === partType);
  const filePath = stringValue(part?.filePath);
  if (!filePath || !isRawTraceSpoolFile(filePath)) {
    return undefined;
  }
  try {
    return {
      contentType: stringValue(part?.contentType),
      text: readFileSync(filePath, "utf8")
    };
  } catch (error) {
    console.warn(`[gateway] Failed to read raw trace part ${partType}: ${formatError(error)}`);
    return undefined;
  }
}

function cleanupRawTraceBundle(manifest: Record<string, unknown>): void {
  const parts = Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
  const firstFilePath = parts.map((part) => stringValue(part.filePath)).find((value): value is string => Boolean(value));
  if (!firstFilePath || !isRawTraceSpoolFile(firstFilePath)) {
    return;
  }
  try {
    rmSync(dirname(firstFilePath), { force: true, recursive: true });
  } catch (error) {
    console.warn(`[gateway] Failed to clean raw trace bundle: ${formatError(error)}`);
  }
}

function isRawTraceSpoolFile(filePath: string): boolean {
  const spoolDir = pathResolve(RAW_TRACE_SPOOL_DIR);
  const resolvedFile = pathResolve(filePath);
  return dirname(resolvedFile) !== spoolDir && resolvedFile.startsWith(`${spoolDir}${pathSep}`);
}

function headerRecordFromUnknown(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue === undefined || headerValue === null) {
      continue;
    }
    headers[key] = Array.isArray(headerValue)
      ? headerValue.map((item) => String(item)).join(", ")
      : String(headerValue);
  }
  return headers;
}

function sanitizeUrlForLog(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveQueryParam(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function isSensitiveQueryParam(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "key" || normalized === "api_key" || normalized === "apikey" || normalized === "access_token";
}

function pathFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).pathname || undefined;
  } catch {
    return undefined;
  }
}

function createBodySampler() {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let truncated = false;

  return {
    append(chunk: Buffer | string) {
      if (truncated) {
        return;
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (totalBytes + buffer.byteLength > maxUsageCaptureBytes) {
        const remaining = Math.max(0, maxUsageCaptureBytes - totalBytes);
        if (remaining > 0) {
          chunks.push(buffer.subarray(0, remaining));
          totalBytes += remaining;
        }
        truncated = true;
        return;
      }
      chunks.push(buffer);
      totalBytes += buffer.byteLength;
    },
    isTruncated() {
      return truncated;
    },
    read() {
      return Buffer.concat(chunks, totalBytes).toString("utf8");
    }
  };
}

function applyProviderCapabilityRouting(input: {
  body?: Buffer;
  config: AppConfig;
  fallback: RouterFallbackConfig;
  headers: Record<string, string>;
  path: string;
  routedModel?: string;
}): { body?: Buffer; fallback: RouterFallbackConfig; routedModel?: string } {
  const protocol = requestProtocolForPath(input.path);
  if (!protocol) {
    return {
      body: input.body,
      fallback: input.fallback,
      routedModel: input.routedModel
    };
  }

  rewriteProviderHeader(input.headers, "x-target-provider", input.config, protocol);
  rewriteProviderListHeader(input.headers, "x-target-providers", input.config, protocol);
  rewriteProviderHeader(input.headers, "x-gateway-target-provider", input.config, protocol);

  const routedModel = rewriteModelSelectorForProtocol(input.routedModel, input.config, protocol);
  const fallback = rewriteFallbackForProtocol(input.fallback, input.config, protocol);
  const body = rewriteBodyModelForProtocol(input.body, input.config, protocol);
  clearTargetProviderHeadersForModelSelector(input.headers, input.config, body, routedModel);

  return {
    body,
    fallback,
    routedModel
  };
}

export function prepareGatewayUpstreamAttemptForTest(input: {
  body: Record<string, unknown>;
  config: AppConfig;
  fallback?: RouterFallbackConfig;
  headers: Record<string, string>;
  method: string;
  path: string;
  routedModel?: string;
}): {
  body?: Record<string, unknown>;
  credentialChain?: string[];
  credentialIds?: string[];
  credentialProtocol?: GatewayProviderProtocol;
  fallback: RouterFallbackConfig;
  headers?: Record<string, string>;
  logicalProvider?: string;
  model?: string;
  routedModel?: string;
} {
  const headers = { ...input.headers };
  const providerCapabilityRouting = applyProviderCapabilityRouting({
    body: Buffer.from(`${JSON.stringify(input.body)}\n`, "utf8"),
    config: input.config,
    fallback: input.fallback ?? input.config.Router.fallback,
    headers,
    path: input.path,
    routedModel: input.routedModel
  });
  const attempt = prepareUpstreamCredentialAttempt({
    attempt: {
      body: providerCapabilityRouting.body,
      index: 0,
      model: normalizeRouteSelector(providerCapabilityRouting.routedModel)
    },
    config: input.config,
    headers,
    method: input.method,
    path: input.path
  });
  return {
    body: parseJsonObjectSafe(attempt.body),
    credentialChain: attempt.credentialChain,
    credentialIds: attempt.credentialIds,
    credentialProtocol: attempt.credentialProtocol,
    fallback: providerCapabilityRouting.fallback,
    headers: attempt.headers,
    logicalProvider: attempt.logicalProvider,
    model: attempt.model,
    routedModel: providerCapabilityRouting.routedModel
  };
}

export function prepareCodexApplyPatchBridgeRequest(input: {
  body?: Buffer;
  config: AppConfig;
  headers: IncomingHttpHeaders;
  method: string;
  path: string;
  routedModel?: string;
}): { body: Buffer; diagnostic: string } | undefined {
  if (!codexApplyPatchBridgeEnabled(input.config, input.headers, input.method, input.path)) {
    return undefined;
  }
  const parsedBody = parseJsonObjectSafe(input.body);
  if (!parsedBody) {
    return undefined;
  }
  const model = input.routedModel || stringValue(parsedBody.model);
  if (!codexPatchBridgeModelEligible(model)) {
    return undefined;
  }
  const transformed = transformCodexApplyPatchBridgeRequestBody(parsedBody);
  if (!transformed.changed) {
    return undefined;
  }
  return {
    body: Buffer.from(`${JSON.stringify(transformed.body)}\n`, "utf8"),
    diagnostic: `${model ?? "unknown"}:${transformed.changedParts.join(",")}`
  };
}

export function transformCodexApplyPatchBridgeRequestBody(body: Record<string, unknown>): {
  body: Record<string, unknown>;
  changed: boolean;
  changedParts: string[];
} {
  const next = { ...body };
  const changedParts: string[] = [];
  const tools = transformCodexApplyPatchBridgeTools(body.tools);
  if (tools.changed) {
    next.tools = tools.value;
    changedParts.push("tools");
    const instructions = transformCodexApplyPatchBridgeInstructions(body.instructions);
    if (instructions.changed) {
      next.instructions = instructions.value;
      changedParts.push("instructions");
    }
    const input = transformCodexApplyPatchBridgeInput(body.input);
    if (input.changed) {
      next.input = input.value;
      changedParts.push("input");
    }
  }
  return {
    body: next,
    changed: changedParts.length > 0,
    changedParts
  };
}

function transformCodexApplyPatchBridgeTools(value: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  const hasApplyPatchTool = value.some((tool) => isRecord(tool) && tool.type === "custom" && tool.name === "apply_patch");
  if (!hasApplyPatchTool) {
    return { value, changed: false };
  }
  let changed = false;
  const tools = value.map((tool) => {
    if (isRecord(tool) && tool.type === "custom" && tool.name === "apply_patch") {
      changed = true;
      return virtualApplyPatchToolSpec();
    }
    const shellTool = transformCodexPatchBridgeShellTool(tool);
    if (shellTool.changed) {
      changed = true;
      return shellTool.value;
    }
    return tool;
  });
  return { value: tools, changed };
}

function transformCodexApplyPatchBridgeInstructions(value: unknown): { value: unknown; changed: boolean } {
  const text = rawStringValue(value);
  if (text === undefined) {
    return value === undefined
      ? { value: codexPatchBridgeInstructionText, changed: true }
      : { value, changed: false };
  }
  if (text.includes(codexPatchBridgeInstructionText)) {
    return { value, changed: false };
  }
  return {
    value: `${text.trimEnd()}\n\n${codexPatchBridgeInstructionText}`,
    changed: true
  };
}

function transformCodexPatchBridgeShellTool(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value) || value.type !== "function") {
    return { value, changed: false };
  }
  const name = stringValue(value.name);
  if (name !== "exec_command" && name !== "write_stdin") {
    return { value, changed: false };
  }
  let changed = false;
  const next: Record<string, unknown> = { ...value };
  const description = rawStringValue(value.description) ?? "";
  if (!description.includes(codexPatchBridgeShellToolGuidance)) {
    next.description = description
      ? `${description} ${codexPatchBridgeShellToolGuidance}`
      : codexPatchBridgeShellToolGuidance;
    changed = true;
  }
  if (name === "exec_command") {
    const parameters = transformCodexPatchBridgeExecCommandParameters(value.parameters);
    if (parameters.changed) {
      next.parameters = parameters.value;
      changed = true;
    }
  }
  return { value: changed ? next : value, changed };
}

function transformCodexPatchBridgeExecCommandParameters(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value) || !isRecord(value.properties) || !isRecord(value.properties.cmd)) {
    return { value, changed: false };
  }
  const cmd = value.properties.cmd;
  const description = rawStringValue(cmd.description) ?? "";
  if (description.includes(codexPatchBridgeShellToolGuidance)) {
    return { value, changed: false };
  }
  return {
    value: {
      ...value,
      properties: {
        ...value.properties,
        cmd: {
          ...cmd,
          description: description
            ? `${description} ${codexPatchBridgeShellToolGuidance}`
            : codexPatchBridgeShellToolGuidance
        }
      }
    },
    changed: true
  };
}

function transformCodexApplyPatchBridgeInput(value: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  const applyPatchCallIds = new Set<string>();
  for (const item of value) {
    if (isRecord(item) && item.type === "custom_tool_call" && item.name === "apply_patch") {
      const callId = stringValue(item.call_id);
      if (callId) {
        applyPatchCallIds.add(callId);
      }
    }
  }
  let changed = false;
  const items = value.map((item) => {
    const transformed = transformCodexApplyPatchBridgeInputItem(item, applyPatchCallIds);
    changed ||= transformed.changed;
    return transformed.value;
  });
  return { value: items, changed };
}

function transformCodexApplyPatchBridgeInputItem(value: unknown, applyPatchCallIds: Set<string>): { value: unknown; changed: boolean } {
  if (!isRecord(value)) {
    return { value, changed: false };
  }
  if (value.type === "custom_tool_call" && value.name === "apply_patch") {
    const { input: patchInput, name: _name, type: _type, ...rest } = value;
    return {
      value: {
        ...rest,
        type: "function_call",
        name: virtualApplyPatchToolName,
        arguments: JSON.stringify({ patch: rawStringValue(patchInput) ?? "" })
      },
      changed: true
    };
  }
  if (
    value.type === "custom_tool_call_output" &&
    (applyPatchCallIds.has(stringValue(value.call_id) ?? "") || value.name === "apply_patch")
  ) {
    const { name: _name, type: _type, ...rest } = value;
    return {
      value: {
        ...rest,
        type: "function_call_output"
      },
      changed: true
    };
  }
  return { value, changed: false };
}

function virtualApplyPatchToolSpec(): Record<string, unknown> {
  return {
    type: "function",
    name: virtualApplyPatchToolName,
    description: [
      "Edit files by returning exactly one complete apply_patch patch.",
      "The patch field must be raw patch grammar text starting with *** Begin Patch and ending with *** End Patch.",
      "Do not wrap the patch in JSON, markdown fences, shell commands, cat, sed, perl, or python.",
      "The patch field must match this Lark grammar:",
      virtualApplyPatchLarkGrammar
    ].join("\n\n"),
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["patch"],
      properties: {
        patch: {
          type: "string",
          description: [
            "Raw apply_patch grammar text matching this Lark grammar:",
            virtualApplyPatchLarkGrammar
          ].join("\n\n")
        }
      }
    }
  };
}

function codexApplyPatchBridgeEnabled(config: AppConfig, headers: IncomingHttpHeaders, method: string, path: string): boolean {
  const codexRule = config.Router.builtInRules?.codex;
  return (method || "GET").toUpperCase() === "POST" &&
    requestProtocolForPath(path) === "openai_responses" &&
    isCodexUserAgent(headers) &&
    codexRule?.enabled !== false;
}

function isCodexUserAgent(headers: IncomingHttpHeaders): boolean {
  return readHeader(headers["user-agent"])?.toLowerCase().includes("codex") ?? false;
}

function codexPatchBridgeModelEligible(model: string | undefined): boolean {
  const modelName = modelNameForPatchBridge(model);
  return Boolean(modelName) && !modelName.toLowerCase().includes("gpt");
}

function modelNameForPatchBridge(model: string | undefined): string {
  const normalized = normalizeRouteSelector(model) ?? "";
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function codexApplyPatchBridgeResponseStream(input: Readable, headers: Headers): Readable {
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/event-stream")) {
    return input.pipe(new Transform({
      transform(chunk, _encoding, callback) {
        transformSseChunk(this, chunk);
        callback();
      },
      flush(callback) {
        flushSseTransform(this);
        callback();
      }
    }));
  }
  if (contentType.includes("application/json")) {
    const chunks: Buffer[] = [];
    return input.pipe(new Transform({
      transform(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
      flush(callback) {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          const parsed = JSON.parse(raw);
          const transformed = transformCodexApplyPatchBridgeResponseValue(parsed);
          this.push(Buffer.from(`${JSON.stringify(transformed.value)}\n`, "utf8"));
        } catch {
          this.push(Buffer.from(raw, "utf8"));
        }
        callback();
      }
    }));
  }
  return input;
}

export function transformCodexApplyPatchBridgeResponseValue(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value)) {
    return { value, changed: false };
  }
  let changed = false;
  const next = { ...value };
  if (isRecord(value.item)) {
    const item = transformVirtualApplyPatchFunctionCall(value.item, value.type === "response.output_item.added");
    if (item.changed) {
      next.item = item.value;
      changed = true;
    }
  }
  if (Array.isArray(value.output)) {
    const output = transformCodexApplyPatchBridgeResponseItems(value.output);
    if (output.changed) {
      next.output = output.value;
      changed = true;
    }
  }
  if (isRecord(value.response) && Array.isArray(value.response.output)) {
    const output = transformCodexApplyPatchBridgeResponseItems(value.response.output);
    if (output.changed) {
      next.response = {
        ...value.response,
        output: output.value
      };
      changed = true;
    }
  }
  const item = transformVirtualApplyPatchFunctionCall(next, false);
  if (item.changed) {
    return item;
  }
  return { value: next, changed };
}

function transformCodexApplyPatchBridgeResponseItems(items: unknown[]): { value: unknown[]; changed: boolean } {
  let changed = false;
  const value = items.map((item) => {
    const transformed = isRecord(item)
      ? transformVirtualApplyPatchFunctionCall(item, false)
      : { value: item, changed: false };
    changed ||= transformed.changed;
    return transformed.value;
  });
  return { value, changed };
}

function transformVirtualApplyPatchFunctionCall(item: Record<string, unknown>, allowEmptyInput: boolean): { value: unknown; changed: boolean } {
  if (item.type !== "function_call" || item.name !== virtualApplyPatchToolName) {
    return { value: item, changed: false };
  }
  const patch = patchInputFromVirtualApplyPatchArguments(item.arguments);
  if (patch === undefined && !allowEmptyInput) {
    return { value: item, changed: false };
  }
  const { arguments: _arguments, name: _name, type: _type, ...rest } = item;
  return {
    value: {
      ...rest,
      type: "custom_tool_call",
      name: "apply_patch",
      input: patch ?? ""
    },
    changed: true
  };
}

function patchInputFromVirtualApplyPatchArguments(value: unknown): string | undefined {
  if (isRecord(value)) {
    return rawStringValue(value.patch);
  }
  const text = rawStringValue(value);
  if (text === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? rawStringValue(parsed.patch) : undefined;
  } catch {
    return undefined;
  }
}

function transformSseChunk(stream: Transform, chunk: Buffer | string): void {
  const state = stream as Transform & { __ccrCodexPatchBridgeSsePending?: string };
  state.__ccrCodexPatchBridgeSsePending = (state.__ccrCodexPatchBridgeSsePending ?? "") + chunk.toString();
  while (state.__ccrCodexPatchBridgeSsePending) {
    const match = /\r?\n\r?\n/.exec(state.__ccrCodexPatchBridgeSsePending);
    if (!match || match.index === undefined) {
      break;
    }
    const block = state.__ccrCodexPatchBridgeSsePending.slice(0, match.index);
    const delimiter = match[0];
    state.__ccrCodexPatchBridgeSsePending = state.__ccrCodexPatchBridgeSsePending.slice(match.index + delimiter.length);
    stream.push(transformCodexApplyPatchBridgeSseEvent(block) + delimiter);
  }
}

function flushSseTransform(stream: Transform): void {
  const state = stream as Transform & { __ccrCodexPatchBridgeSsePending?: string };
  if (state.__ccrCodexPatchBridgeSsePending) {
    stream.push(transformCodexApplyPatchBridgeSseEvent(state.__ccrCodexPatchBridgeSsePending));
    state.__ccrCodexPatchBridgeSsePending = "";
  }
}

export function transformCodexApplyPatchBridgeSseEvent(block: string): string {
  const lines = block.split(/\r?\n/g);
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data || data === "[DONE]") {
    return block;
  }
  try {
    const parsed = JSON.parse(data);
    const transformed = transformCodexApplyPatchBridgeResponseValue(parsed);
    if (!transformed.changed) {
      return block;
    }
    const event = stringValue((transformed.value as Record<string, unknown>).type) || stringValue(parsed.type);
    return [
      event ? `event: ${event}` : undefined,
      `data: ${JSON.stringify(transformed.value)}`
    ].filter(Boolean).join("\n");
  } catch {
    return block;
  }
}

function createHostedWebSearchProtocolContext(input: {
  body: Buffer | undefined;
  config: AppConfig;
  method: string;
  path: string;
  requestId: string;
  routedModel?: string;
  sinceMs: number;
}): HostedWebSearchProtocolContext | undefined {
  const protocol = requestProtocolForPath(input.path);
  if (input.method !== "POST" || !protocol) {
    return undefined;
  }
  const body = parseJsonObjectSafe(input.body);
  if (!body || !hasHostedWebSearchDeclaration(body, protocol)) {
    return undefined;
  }
  const toolName = fusionWebSearchToolNameForRequest(input.config, stringValue(body.model) || input.routedModel);
  if (!toolName) {
    return undefined;
  }
  return {
    maxUses: readHostedWebSearchMaxUses(body, protocol),
    protocol,
    queryHint: extractHostedWebSearchQueryHint(body, protocol),
    requestId: input.requestId,
    sinceMs: input.sinceMs,
    toolName
  };
}

function createAnthropicWebSearchProtocolContext(input: {
  body: Buffer | undefined;
  config: AppConfig;
  method: string;
  path: string;
  requestId: string;
  sinceMs: number;
}): AnthropicWebSearchProtocolContext | undefined {
  const context = createHostedWebSearchProtocolContext(input);
  return context?.protocol === "anthropic_messages" ? context : undefined;
}

function createClaudeCodeWebSearchContinuationContext(input: {
  body: Buffer | undefined;
  config: AppConfig;
  method: string;
  path: string;
  routedModel?: string;
  sinceMs: number;
}): ClaudeCodeWebSearchContinuationContext | undefined {
  if (input.method !== "POST" || requestProtocolForPath(input.path) !== "anthropic_messages") {
    return undefined;
  }
  const body = parseJsonObjectSafe(input.body);
  if (!body || claudeCodeWebSearchToolResultTexts(body).length === 0) {
    return undefined;
  }
  const toolName = fusionWebSearchToolNameForRequest(input.config, stringValue(body.model) || input.routedModel);
  if (!toolName) {
    return undefined;
  }
  return {
    queryHint: extractClaudeCodeWebSearchToolResultQuery(body) || extractAnthropicWebSearchQueryHint(body),
    sinceMs: input.sinceMs,
    toolName
  };
}

export function prepareHostedWebSearchProtocolRequestBody(
  body: Buffer | undefined,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint">
): Buffer | undefined {
  if (context.protocol === "anthropic_messages") {
    return prepareAnthropicWebSearchProtocolRequestBody(body, records, context);
  }
  const parsed = parseJsonObjectSafe(body);
  if (!parsed || records.length === 0) {
    return undefined;
  }
  const evidence = hostedWebSearchEvidenceText(records, context.queryHint);
  if (!evidence) {
    return undefined;
  }
  let next: Record<string, unknown> | undefined;
  if (context.protocol === "openai_chat_completions") {
    next = prepareOpenAiChatHostedWebSearchRequestBody(parsed, evidence);
  } else if (context.protocol === "openai_responses") {
    next = prepareOpenAiResponsesHostedWebSearchRequestBody(parsed, evidence);
  } else if (context.protocol === "gemini_generate_content") {
    next = prepareGeminiHostedWebSearchRequestBody(parsed, evidence);
  }
  return next ? Buffer.from(`${JSON.stringify(next)}\n`, "utf8") : undefined;
}

export function prepareAnthropicWebSearchProtocolRequestBody(
  body: Buffer | undefined,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<AnthropicWebSearchProtocolContext, "queryHint">
): Buffer | undefined {
  const parsed = parseJsonObjectSafe(body);
  if (!parsed || records.length === 0) {
    return undefined;
  }
  const evidence = hostedWebSearchEvidenceText(records, context.queryHint);
  if (!evidence) {
    return undefined;
  }
  const next = applyAnthropicWebSearchSynthesisControls(stripAnthropicHostedWebSearchTools({
    ...parsed,
    system: appendAnthropicSystemText(parsed.system, evidence)
  }));
  return Buffer.from(`${JSON.stringify(next)}\n`, "utf8");
}

export function prepareClaudeCodeWebSearchContinuationRequestBody(
  body: Buffer | undefined,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<ClaudeCodeWebSearchContinuationContext, "queryHint">
): Buffer | undefined {
  const parsed = parseJsonObjectSafe(body);
  if (!parsed) {
    return undefined;
  }
  const toolResultTexts = claudeCodeWebSearchToolResultTexts(parsed);
  if (toolResultTexts.length === 0) {
    return undefined;
  }
  const queryHint = context.queryHint || extractClaudeCodeWebSearchToolResultQuery(parsed) || extractAnthropicWebSearchQueryHint(parsed);
  const evidence = claudeCodeWebSearchContinuationEvidenceText(records, queryHint, toolResultTexts);
  if (!evidence) {
    return undefined;
  }
  const next = applyAnthropicWebSearchSynthesisControls(stripClaudeCodeWebSearchContinuationTools({
    ...parsed,
    system: appendAnthropicSystemText(parsed.system, evidence)
  }));
  return Buffer.from(`${JSON.stringify(next)}\n`, "utf8");
}

function applyAnthropicWebSearchSynthesisControls(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  const outputConfig = isRecord(next.output_config) ? { ...next.output_config } : {};
  outputConfig.effort = "low";
  next.output_config = outputConfig;
  delete next.thinking;
  delete next.reasoning;
  return next;
}

function prepareOpenAiChatHostedWebSearchRequestBody(body: Record<string, unknown>, evidence: string): Record<string, unknown> {
  const next = stripOpenAiHostedWebSearchTools({
    ...body,
    messages: appendOpenAiChatSystemText(body.messages, evidence)
  });
  return applyOpenAiHostedWebSearchSynthesisControls(next);
}

function prepareOpenAiResponsesHostedWebSearchRequestBody(body: Record<string, unknown>, evidence: string): Record<string, unknown> {
  const next = stripOpenAiHostedWebSearchTools({
    ...body,
    instructions: appendStringInstruction(body.instructions, evidence)
  });
  return applyOpenAiHostedWebSearchSynthesisControls(next);
}

function prepareGeminiHostedWebSearchRequestBody(body: Record<string, unknown>, evidence: string): Record<string, unknown> {
  return stripGeminiHostedWebSearchTools({
    ...body,
    systemInstruction: appendGeminiSystemInstruction(body.systemInstruction, evidence)
  });
}

function applyOpenAiHostedWebSearchSynthesisControls(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  if (typeof next.reasoning_effort === "string") {
    next.reasoning_effort = "low";
  }
  if (isRecord(next.reasoning)) {
    next.reasoning = { ...next.reasoning, effort: "low" };
  }
  return next;
}

function stripAnthropicHostedWebSearchTools(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) {
    return body;
  }
  const tools = body.tools.filter((tool) => !isAnthropicHostedWebSearchTool(tool));
  if (tools.length === body.tools.length) {
    return body;
  }
  const next = { ...body };
  if (tools.length > 0) {
    next.tools = tools;
  } else {
    delete next.tools;
  }
  const toolChoice = isRecord(next.tool_choice) ? next.tool_choice : undefined;
  const toolChoiceName = stringValue(toolChoice?.name);
  if (tools.length === 0 || toolChoiceName === "web_search") {
    delete next.tool_choice;
  }
  return next;
}

function stripClaudeCodeWebSearchContinuationTools(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) {
    return body;
  }
  const next = { ...body };
  delete next.tools;
  delete next.tool_choice;
  return next;
}

function stripOpenAiHostedWebSearchTools(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  let removedTools = false;
  if (Array.isArray(body.tools)) {
    const tools = body.tools.filter((tool) => !isOpenAiHostedWebSearchTool(tool));
    removedTools = tools.length !== body.tools.length;
    if (tools.length > 0) {
      next.tools = tools;
    } else {
      delete next.tools;
    }
  }
  if (next.web_search_options !== undefined || next.webSearchOptions !== undefined) {
    delete next.web_search_options;
    delete next.webSearchOptions;
    removedTools = true;
  }
  if (removedTools && (!Array.isArray(next.tools) || next.tools.length === 0 || openAiToolChoiceNamesWebSearch(next.tool_choice))) {
    delete next.tool_choice;
    delete next.parallel_tool_calls;
  }
  return next;
}

function stripGeminiHostedWebSearchTools(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) {
    return body;
  }
  let changed = false;
  const tools = body.tools.flatMap((tool) => {
    const transformed = stripGeminiHostedWebSearchTool(tool);
    changed ||= transformed.changed;
    return transformed.value ? [transformed.value] : [];
  });
  if (!changed) {
    return body;
  }
  const next = { ...body };
  if (tools.length > 0) {
    next.tools = tools;
  } else {
    delete next.tools;
  }
  return next;
}

function stripGeminiHostedWebSearchTool(tool: unknown): { changed: boolean; value?: unknown } {
  if (!isRecord(tool)) {
    return { changed: false, value: tool };
  }
  let changed = false;
  const next: Record<string, unknown> = { ...tool };
  for (const key of ["google_search", "googleSearch", "google_search_retrieval", "googleSearchRetrieval"]) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }
  return Object.keys(next).length === 0 ? { changed, value: undefined } : { changed, value: next };
}

function appendAnthropicSystemText(system: unknown, text: string): unknown {
  if (typeof system === "string") {
    return `${system.trimEnd()}\n\n${text}`;
  }
  const block = { text, type: "text" };
  if (Array.isArray(system)) {
    return [...system, block];
  }
  return [block];
}

function appendOpenAiChatSystemText(messages: unknown, text: string): unknown[] {
  const message = { content: text, role: "system" };
  return Array.isArray(messages) ? [message, ...messages] : [message];
}

function appendStringInstruction(value: unknown, text: string): string {
  const existing = rawStringValue(value);
  return existing ? `${existing.trimEnd()}\n\n${text}` : text;
}

function appendGeminiSystemInstruction(value: unknown, text: string): Record<string, unknown> {
  const part = { text };
  if (typeof value === "string") {
    return { parts: [{ text: value }, part] };
  }
  if (isRecord(value)) {
    const parts = Array.isArray(value.parts) ? value.parts : [];
    return {
      ...value,
      parts: [...parts, part]
    };
  }
  return { parts: [part] };
}

function hostedWebSearchEvidenceText(records: BrowserWebSearchProtocolRecord[], queryHint: string | undefined): string {
  const sections = records.flatMap((record, recordIndex) => {
    const resultLines = record.results.slice(0, 8).map((result, resultIndex) => {
      const content = focusedWebSearchContent(result.content, queryHint);
      const details = [
        result.snippet ? `Search snippet: ${result.snippet}` : "",
        content ? `Extracted page content: ${content}` : ""
      ].filter(Boolean).join("\n");
      return [
        `${resultIndex + 1}. ${result.title}`,
        `URL: ${result.url}`,
        details
      ].filter(Boolean).join("\n");
    });
    if (resultLines.length === 0) {
      return [];
    }
    return [
      [
        `Search ${recordIndex + 1}`,
        `Query: ${record.query}`,
        `Engine: ${record.engine}`,
        `Search URL: ${record.searchUrl}`,
        ...resultLines
      ].join("\n\n")
    ];
  });
  if (sections.length === 0) {
    return "";
  }
  return [
    "A hidden in-app browser web search has already been performed for this request.",
    "Use the evidence below to answer the user's question directly in the visible final response, within 5 concise sentences. Do not call another web search tool, do not merely list links, do not expose hidden reasoning, and do not ask the user to open links. If the evidence is insufficient for an exact value, say that clearly and summarize the most relevant findings with source names.",
    queryHint ? `Original search intent: ${queryHint}` : "",
    "Web search evidence:",
    ...sections
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

function claudeCodeWebSearchContinuationEvidenceText(
  records: BrowserWebSearchProtocolRecord[],
  queryHint: string | undefined,
  toolResultTexts: string[]
): string {
  const browserEvidence = records.length > 0 ? hostedWebSearchEvidenceText(records, queryHint) : "";
  const toolResultEvidence = toolResultTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, 12_000);
  if (!browserEvidence && !toolResultEvidence) {
    return "";
  }
  return [
    "A Claude Code WebSearch tool result has already been returned for this turn.",
    "Answer the user's search question directly in the visible final response. Do not call any tool. Do not merely list links or ask the user to open links. Include the sources you used as markdown links.",
    queryHint ? `Original search intent: ${queryHint}` : "",
    browserEvidence ? `In-app browser extracted evidence:\n\n${browserEvidence}` : "",
    toolResultEvidence ? `Previous WebSearch tool result:\n\n${toolResultEvidence}` : ""
  ].filter(Boolean).join("\n\n");
}

function focusedWebSearchContent(content: string | undefined, queryHint: string | undefined): string | undefined {
  const text = content?.replace(/\s+/g, " ").trim();
  if (!text) {
    return undefined;
  }
  const queryTerms = normalizeSearchComparisonText(queryHint ?? "")
    .split(" ")
    .filter((term) => term.length >= 2);
  const weatherTerms = /天气|weather/i.test(queryHint ?? "")
    ? ["天气", "气温", "温度", "体感", "空气质量", "湿度", "风", "降水", "℃", "晴", "多云", "阴", "雨"]
    : [];
  const terms = uniqueStrings([...queryTerms, ...weatherTerms]);
  const indexes = terms.flatMap((term) => {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    return index >= 0 ? [index] : [];
  });
  if (indexes.length === 0) {
    return text.slice(0, 1_000);
  }
  const center = Math.min(...indexes);
  const start = Math.max(0, center - 300);
  return `${start > 0 ? "..." : ""}${text.slice(start, start + 1_200)}${start + 1_200 < text.length ? "..." : ""}`;
}

export function hostedWebSearchProtocolResponseStream(
  input: Readable,
  headers: Headers,
  context: HostedWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration | undefined
): Readable {
  if (!integration?.recentBrowserWebSearchResults && !integration?.runBrowserWebSearch) {
    return input;
  }
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/event-stream")) {
    if (context.protocol === "anthropic_messages") {
      return anthropicHostedWebSearchProtocolSseStream(input, context, integration);
    }
    return hostedWebSearchProtocolSseStream(input, context, integration);
  }
  if (!contentType.includes("application/json")) {
    return input;
  }

  const chunks: Buffer[] = [];
  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
    flush(callback) {
      const body = Buffer.concat(chunks).toString("utf8");
      void (async () => {
        const records = await selectHostedWebSearchProtocolRecords(context, integration);
        if (records.length === 0) {
          this.push(body);
          return;
        }

        const parsed = JSON.parse(body) as unknown;
        const transformed = transformHostedWebSearchProtocolResponseValue(parsed, records, context);
        this.push(transformed.changed ? JSON.stringify(transformed.value) : body);
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        this.push(body);
      }).finally(() => callback());
    }
  }));
}

function hostedWebSearchProtocolSseStream(
  input: Readable,
  context: HostedWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration
): Readable {
  const recordsPromise = selectHostedWebSearchProtocolRecords(context, integration);
  let records: BrowserWebSearchProtocolRecord[] | undefined;
  let pending = "";
  let passThrough = false;
  const state: HostedWebSearchSseState = {
    done: false,
    maxOutputIndex: -1,
    visibleText: false
  };

  async function ensureRecords() {
    if (records || passThrough) {
      return;
    }
    records = await recordsPromise;
    passThrough = records.length === 0;
  }

  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      const text = chunk.toString();
      const rawText = pending + text;
      void (async () => {
        await ensureRecords();
        if (passThrough || !records) {
          this.push(text);
          return;
        }
        pending += text;
        drainHostedWebSearchSseBlocks(this, pending, state, records, context, false);
        pending = sseTrailingPartialBlock(pending);
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        this.push(rawText);
        pending = "";
        passThrough = true;
      }).finally(() => callback());
    },
    flush(callback) {
      void (async () => {
        await ensureRecords();
        if (passThrough || !records) {
          if (pending) {
            this.push(pending);
          }
          return;
        }
        drainHostedWebSearchSseBlocks(this, pending, state, records, context, true);
        pending = "";
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        if (pending) {
          this.push(pending);
        }
      }).finally(() => callback());
    }
  }));
}

type HostedWebSearchSseState = {
  done: boolean;
  maxOutputIndex: number;
  visibleText: boolean;
};

function drainHostedWebSearchSseBlocks(
  stream: Transform,
  text: string,
  state: HostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">,
  flush: boolean
): void {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    const index = match.index ?? 0;
    const delimiter = match[0];
    const block = text.slice(cursor, index);
    cursor = index + delimiter.length;
    if (!block.trim()) {
      stream.push(delimiter);
      continue;
    }
    writeHostedWebSearchSseEvent(stream, parseSseEventBlock(block), delimiter, state, records, context);
  }
  if (flush) {
    const block = text.slice(cursor);
    if (block.trim()) {
      writeHostedWebSearchSseEvent(stream, parseSseEventBlock(block), "", state, records, context);
    } else if (block) {
      stream.push(block);
    }
    writeHostedWebSearchSseFallback(stream, state, records, context);
  }
}

function writeHostedWebSearchSseEvent(
  stream: Transform,
  event: ParsedSseEvent,
  delimiter: string,
  state: HostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">
): void {
  updateHostedWebSearchSseState(event, state, context.protocol);
  const isDone = sseEventIsDone(event);
  const isOpenAiResponsesCompleted = context.protocol === "openai_responses" &&
    isRecord(event.data) &&
    stringValue(event.data.type) === "response.completed";
  if ((isDone || isOpenAiResponsesCompleted) && !state.done) {
    writeHostedWebSearchSseFallback(stream, state, records, context);
  }
  const nextEvent = context.protocol === "openai_chat_completions"
    ? updateOpenAiChatSseFinishReason(event)
    : context.protocol === "openai_responses"
      ? updateOpenAiResponsesCompletedStatus(event)
      : event;
  stream.push(`${serializeSseEvent(nextEvent)}${delimiter}`);
}

function updateHostedWebSearchSseState(
  event: ParsedSseEvent,
  state: HostedWebSearchSseState,
  protocol: GatewayProviderProtocol
): void {
  if (protocol === "openai_chat_completions") {
    state.visibleText ||= openAiChatSseContainsVisibleText([event]);
    return;
  }
  if (protocol === "openai_responses") {
    state.visibleText ||= openAiResponsesSseContainsVisibleText([event]);
    if (isRecord(event.data)) {
      const outputIndex = numberValue(event.data.output_index);
      if (outputIndex !== undefined) {
        state.maxOutputIndex = Math.max(state.maxOutputIndex, outputIndex);
      }
    }
    return;
  }
  if (protocol === "gemini_generate_content") {
    state.visibleText ||= geminiSseContainsVisibleText([event]);
  }
}

function writeHostedWebSearchSseFallback(
  stream: Transform,
  state: HostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">
): void {
  if (state.done || state.visibleText) {
    return;
  }
  const answer = synthesizeWebSearchAnswer(records, context.queryHint);
  if (!answer) {
    state.done = true;
    return;
  }
  for (const event of hostedWebSearchSseFallbackEvents(answer, state, context)) {
    stream.push(`${serializeSseEvent(event)}\n\n`);
  }
  state.visibleText = true;
  state.done = true;
}

function hostedWebSearchSseFallbackEvents(
  answer: string,
  state: HostedWebSearchSseState,
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "requestId">
): ParsedSseEvent[] {
  if (context.protocol === "openai_chat_completions") {
    return [sseEventFromValue({
      object: "chat.completion.chunk",
      choices: [
        {
          delta: { content: answer },
          finish_reason: null,
          index: 0
        }
      ]
    })];
  }
  if (context.protocol === "openai_responses") {
    return openAiResponsesSseAnswerEvents(answer, context.requestId, state.maxOutputIndex + 1);
  }
  if (context.protocol === "gemini_generate_content") {
    return [sseEventFromValue(geminiAnswerCandidateChunk(answer))];
  }
  return [];
}

function anthropicHostedWebSearchProtocolSseStream(
  input: Readable,
  context: HostedWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration
): Readable {
  const recordsPromise = selectHostedWebSearchProtocolRecords(context, integration);
  let records: BrowserWebSearchProtocolRecord[] | undefined;
  let pending = "";
  let passThrough = false;
  const state: AnthropicHostedWebSearchSseState = {
    answerInjected: false,
    hasClientToolUse: false,
    hasWebSearchBlocks: false,
    injectedBlockCount: 0,
    insertedSearchBlocks: false,
    maxIndex: -1,
    visibleText: false
  };

  async function ensureRecords() {
    if (records || passThrough) {
      return;
    }
    records = await recordsPromise;
    passThrough = records.length === 0;
  }

  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      const text = chunk.toString();
      const rawText = pending + text;
      void (async () => {
        await ensureRecords();
        if (passThrough || !records) {
          this.push(text);
          return;
        }
        pending += text;
        drainAnthropicHostedWebSearchSseBlocks(this, pending, state, records, context, false);
        pending = sseTrailingPartialBlock(pending);
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        this.push(rawText);
        pending = "";
        passThrough = true;
      }).finally(() => callback());
    },
    flush(callback) {
      void (async () => {
        await ensureRecords();
        if (passThrough || !records) {
          if (pending) {
            this.push(pending);
          }
          return;
        }
        drainAnthropicHostedWebSearchSseBlocks(this, pending, state, records, context, true);
        pending = "";
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        if (pending) {
          this.push(pending);
        }
      }).finally(() => callback());
    }
  }));
}

type AnthropicHostedWebSearchSseState = {
  answerInjected: boolean;
  hasClientToolUse: boolean;
  hasWebSearchBlocks: boolean;
  injectedBlockCount: number;
  insertedSearchBlocks: boolean;
  insertIndex?: number;
  maxIndex: number;
  visibleText: boolean;
};

function drainAnthropicHostedWebSearchSseBlocks(
  stream: Transform,
  text: string,
  state: AnthropicHostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "queryHint" | "requestId">,
  flush: boolean
): void {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    const index = match.index ?? 0;
    const delimiter = match[0];
    const block = text.slice(cursor, index);
    cursor = index + delimiter.length;
    if (!block.trim()) {
      stream.push(delimiter);
      continue;
    }
    writeAnthropicHostedWebSearchSseEvent(
      stream,
      parseSseEventBlock(block),
      delimiter,
      state,
      records,
      context
    );
  }
  if (flush) {
    const block = text.slice(cursor);
    if (block.trim()) {
      writeAnthropicHostedWebSearchSseEvent(
        stream,
        parseSseEventBlock(block),
        "",
        state,
        records,
        context
      );
    } else if (block) {
      stream.push(block);
    }
  }
}

function sseTrailingPartialBlock(text: string): string {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    cursor = (match.index ?? 0) + match[0].length;
  }
  return text.slice(cursor);
}

function writeAnthropicHostedWebSearchSseEvent(
  stream: Transform,
  event: ParsedSseEvent,
  delimiter: string,
  state: AnthropicHostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "queryHint" | "requestId">
): void {
  updateAnthropicHostedWebSearchSseState(event, state);
  const textStartIndex = anthropicSseTextBlockStartIndex(event);
  const isMessageEnd = sseEventIsAnthropicMessageEnd(event);
  const answer = !state.hasClientToolUse && !state.visibleText && !state.answerInjected && isMessageEnd
    ? synthesizeWebSearchAnswer(records, context.queryHint)
    : undefined;

  if (!state.insertedSearchBlocks && (textStartIndex !== undefined || isMessageEnd)) {
    const insertIndex = textStartIndex ?? state.maxIndex + 1;
    insertAnthropicHostedWebSearchSseBlocks(stream, state, records, context.requestId, insertIndex);
  }
  if (answer && isMessageEnd) {
    const answerIndex = state.maxIndex + state.injectedBlockCount + 1;
    insertAnthropicHostedWebSearchSseAnswer(stream, state, answer, answerIndex);
  }

  const nextEvent = updateAnthropicWebSearchSseUsage(
    shiftAnthropicHostedWebSearchSseEvent(event, state),
    records.length,
    Boolean(answer),
    state.hasClientToolUse
  );
  stream.push(`${serializeSseEvent(nextEvent)}${delimiter}`);
}

function updateAnthropicHostedWebSearchSseState(event: ParsedSseEvent, state: AnthropicHostedWebSearchSseState): void {
  if (isRecord(event.data) && Number.isFinite(event.data.index)) {
    state.maxIndex = Math.max(state.maxIndex, Number(event.data.index));
  }
  state.hasWebSearchBlocks ||= sseEventContainsAnthropicWebSearchBlock(event);
  state.hasClientToolUse ||= sseEventContainsAnthropicClientToolUse(event);
  state.visibleText ||= sseEventContainsVisibleText(event);
}

function insertAnthropicHostedWebSearchSseBlocks(
  stream: Transform,
  state: AnthropicHostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  insertIndex: number
): void {
  state.insertedSearchBlocks = true;
  state.insertIndex = insertIndex;
  if (state.hasWebSearchBlocks) {
    return;
  }
  const blocks = anthropicWebSearchProtocolBlocks(records, requestId);
  for (const event of blocks.flatMap((block, offset) => anthropicWebSearchSseEventsForBlock(block, insertIndex + offset))) {
    stream.push(`${serializeSseEvent(event)}\n\n`);
  }
  state.injectedBlockCount += blocks.length;
}

function insertAnthropicHostedWebSearchSseAnswer(
  stream: Transform,
  state: AnthropicHostedWebSearchSseState,
  answer: string,
  answerIndex: number
): void {
  state.answerInjected = true;
  for (const event of anthropicWebSearchSseEventsForBlock({ text: answer, type: "text" }, answerIndex)) {
    stream.push(`${serializeSseEvent(event)}\n\n`);
  }
}

function shiftAnthropicHostedWebSearchSseEvent(
  event: ParsedSseEvent,
  state: AnthropicHostedWebSearchSseState
): ParsedSseEvent {
  if (!state.insertedSearchBlocks || state.insertIndex === undefined || state.injectedBlockCount === 0) {
    return event;
  }
  return shiftSseContentBlockIndex(event, state.insertIndex, state.injectedBlockCount);
}

function transformHostedWebSearchProtocolResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">
): { changed: boolean; value: unknown } {
  if (context.protocol === "anthropic_messages") {
    return transformAnthropicWebSearchProtocolResponseValue(value, records, context.requestId, context.queryHint);
  }
  if (context.protocol === "openai_chat_completions") {
    return transformOpenAiChatHostedWebSearchResponseValue(value, records, context.queryHint);
  }
  if (context.protocol === "openai_responses") {
    return transformOpenAiResponsesHostedWebSearchResponseValue(value, records, context.requestId, context.queryHint);
  }
  if (context.protocol === "gemini_generate_content") {
    return transformGeminiHostedWebSearchResponseValue(value, records, context.queryHint);
  }
  return { changed: false, value };
}

function transformHostedWebSearchProtocolSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">
): string {
  if (context.protocol === "anthropic_messages") {
    return transformAnthropicWebSearchProtocolSseText(body, records, context.requestId, context.queryHint);
  }
  if (context.protocol === "openai_chat_completions") {
    return transformOpenAiChatHostedWebSearchSseText(body, records, context.queryHint);
  }
  if (context.protocol === "openai_responses") {
    return transformOpenAiResponsesHostedWebSearchSseText(body, records, context.requestId, context.queryHint);
  }
  if (context.protocol === "gemini_generate_content") {
    return transformGeminiHostedWebSearchSseText(body, records, context.queryHint);
  }
  return body;
}

export function transformAnthropicWebSearchProtocolResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  queryHint?: string
): { changed: boolean; value: unknown } {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return { changed: false, value };
  }
  const hasWebSearchBlocks = responseValueContainsAnthropicWebSearchBlocks(value);
  const blocks = hasWebSearchBlocks ? [] : anthropicWebSearchProtocolBlocks(records, requestId);
  const hasClientToolUse = responseValueContainsAnthropicClientToolUse(value);
  const answer = hasClientToolUse || responseValueContainsVisibleText(value)
    ? undefined
    : synthesizeWebSearchAnswer(records, queryHint);
  const injectedBlocks = [
    ...blocks,
    ...(answer ? [{ text: answer, type: "text" }] : [])
  ];
  const shouldUpdateUsage = hasWebSearchBlocks || blocks.length > 0;
  if (injectedBlocks.length === 0 && !shouldUpdateUsage) {
    return { changed: false, value };
  }
  const insertAt = webSearchProtocolInsertIndex(value.content, hasWebSearchBlocks);
  const nextValue = {
    ...value,
    ...(shouldUpdateUsage ? { usage: mergeAnthropicWebSearchUsage(value.usage, records.length) } : {}),
    ...(shouldEndAnthropicHostedWebSearchTurn(value.stop_reason, Boolean(answer), hasClientToolUse) ? { stop_reason: "end_turn" } : {}),
    content: injectedBlocks.length > 0
      ? [
          ...value.content.slice(0, insertAt),
          ...injectedBlocks,
          ...value.content.slice(insertAt)
        ]
      : value.content
  };
  return {
    changed: true,
    value: nextValue
  };
}

export function transformAnthropicWebSearchProtocolSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  queryHint?: string
): string {
  const events = parseSseEvents(body);
  if (events.length === 0) {
    return body;
  }
  const hasWebSearchBlocks = sseEventsContainAnthropicWebSearchBlocks(events);
  const blocks = hasWebSearchBlocks ? [] : anthropicWebSearchProtocolBlocks(records, requestId);
  const hasClientToolUse = sseEventsContainAnthropicClientToolUse(events);
  const answer = hasClientToolUse || sseEventsContainVisibleText(events)
    ? undefined
    : synthesizeWebSearchAnswer(records, queryHint);
  const injectedBlocks = [
    ...blocks,
    ...(answer ? [{ text: answer, type: "text" }] : [])
  ];
  const shouldUpdateUsage = hasWebSearchBlocks || blocks.length > 0;
  if (injectedBlocks.length === 0 && !shouldUpdateUsage) {
    return body;
  }

  let maxIndex = -1;
  for (const event of events) {
    if (isRecord(event.data) && Number.isFinite(event.data.index)) {
      maxIndex = Math.max(maxIndex, Number(event.data.index));
    }
  }

  const firstTextIndex = events.findIndex((event) => {
    const data = isRecord(event.data) ? event.data : undefined;
    const contentBlock = isRecord(data?.content_block) ? data.content_block : undefined;
    return data?.type === "content_block_start" && contentBlock?.type === "text";
  });
  const messageEndIndex = events.findIndex((event) => {
    const type = isRecord(event.data) ? stringValue(event.data.type) : undefined;
    return type === "message_delta" || type === "message_stop";
  });
  const insertPosition = firstTextIndex >= 0
    ? firstTextIndex
    : messageEndIndex >= 0
      ? messageEndIndex
      : events.length;
  const insertIndex = firstTextIndex >= 0 && isRecord(events[firstTextIndex].data) && Number.isFinite(events[firstTextIndex].data.index)
      ? Number(events[firstTextIndex].data.index)
      : maxIndex + 1;

  const shiftedEvents = events
    .map((event) => shiftSseContentBlockIndex(event, insertIndex, injectedBlocks.length))
    .map((event) => updateAnthropicWebSearchSseUsage(event, records.length, Boolean(answer), hasClientToolUse));
  const injectedEvents = injectedBlocks.flatMap((block, offset) => anthropicWebSearchSseEventsForBlock(block, insertIndex + offset));
  shiftedEvents.splice(insertPosition, 0, ...injectedEvents);
  return `${shiftedEvents.map(serializeSseEvent).join("\n\n")}\n\n`;
}

export function transformOpenAiChatHostedWebSearchResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  queryHint?: string
): { changed: boolean; value: unknown } {
  if (!isRecord(value) || openAiChatResponseContainsVisibleText(value)) {
    return { changed: false, value };
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer || !Array.isArray(value.choices) || value.choices.length === 0) {
    return { changed: false, value };
  }
  const choices = value.choices.map((choice, index) => {
    if (!isRecord(choice) || index !== 0) {
      return choice;
    }
    const message = isRecord(choice.message) ? choice.message : {};
    return {
      ...choice,
      finish_reason: stringValue(choice.finish_reason) === "length" ? "stop" : choice.finish_reason,
      message: {
        ...message,
        content: answer,
        role: stringValue(message.role) || "assistant"
      }
    };
  });
  return {
    changed: true,
    value: {
      ...value,
      choices
    }
  };
}

export function transformOpenAiChatHostedWebSearchSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  queryHint?: string
): string {
  const events = parseSseEvents(body);
  if (events.length === 0 || openAiChatSseContainsVisibleText(events)) {
    return body;
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer) {
    return body;
  }
  const template = firstSseDataRecord(events);
  const injected = sseEventFromValue({
    ...(template?.id ? { id: template.id } : {}),
    ...(template?.model ? { model: template.model } : {}),
    object: stringValue(template?.object) || "chat.completion.chunk",
    choices: [
      {
        delta: { content: answer },
        finish_reason: null,
        index: 0
      }
    ]
  });
  const shifted = events.map((event) => updateOpenAiChatSseFinishReason(event));
  const insertAt = doneSseEventIndex(shifted);
  shifted.splice(insertAt >= 0 ? insertAt : shifted.length, 0, injected);
  return `${shifted.map(serializeSseEvent).join("\n\n")}\n\n`;
}

export function transformOpenAiResponsesHostedWebSearchResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  queryHint?: string
): { changed: boolean; value: unknown } {
  if (!isRecord(value)) {
    return { changed: false, value };
  }
  const output = Array.isArray(value.output) ? value.output : [];
  const hasSearchCall = output.some((item) => isRecord(item) && stringValue(item.type) === "web_search_call");
  const answer = openAiResponsesValueContainsVisibleText(value) ? undefined : synthesizeWebSearchAnswer(records, queryHint);
  const injected = [
    ...(hasSearchCall ? [] : openAiResponsesWebSearchCallItems(records, requestId)),
    ...(answer ? [openAiResponsesMessageItem(answer, requestId)] : [])
  ];
  if (injected.length === 0) {
    return { changed: false, value };
  }
  const next: Record<string, unknown> = {
    ...value,
    output: [...injected, ...output]
  };
  if (answer && stringValue(next.status) === "incomplete") {
    next.status = "completed";
    delete next.incomplete_details;
  }
  return { changed: true, value: next };
}

export function transformOpenAiResponsesHostedWebSearchSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  queryHint?: string
): string {
  const events = parseSseEvents(body);
  if (events.length === 0) {
    return body;
  }
  const visibleText = openAiResponsesSseVisibleText(events);
  if (visibleText) {
    return serializeOpenAiResponsesSseEvents(normalizeOpenAiResponsesSseEvents(events, visibleText));
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer) {
    return serializeOpenAiResponsesSseEvents(normalizeOpenAiResponsesSseEvents(events));
  }
  const outputIndex = nextOpenAiResponsesOutputIndex(events);
  const injected = openAiResponsesSseAnswerEvents(answer, requestId, outputIndex);
  const shifted = events.map(updateOpenAiResponsesCompletedStatus);
  const insertAt = shifted.findIndex((event) => isRecord(event.data) && stringValue(event.data.type) === "response.completed");
  shifted.splice(insertAt >= 0 ? insertAt : doneSseEventIndex(shifted) >= 0 ? doneSseEventIndex(shifted) : shifted.length, 0, ...injected);
  return serializeOpenAiResponsesSseEvents(normalizeOpenAiResponsesSseEvents(shifted, answer));
}

export function transformGeminiHostedWebSearchResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  queryHint?: string
): { changed: boolean; value: unknown } {
  if (Array.isArray(value)) {
    if (geminiResponseArrayContainsVisibleText(value)) {
      return { changed: false, value };
    }
    const answer = synthesizeWebSearchAnswer(records, queryHint);
    return answer
      ? { changed: true, value: [...value, geminiAnswerCandidateChunk(answer)] }
      : { changed: false, value };
  }
  if (!isRecord(value) || geminiResponseValueContainsVisibleText(value)) {
    return { changed: false, value };
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer) {
    return { changed: false, value };
  }
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  const nextCandidate = candidates.length > 0 && isRecord(candidates[0])
    ? {
        ...candidates[0],
        content: {
          ...(isRecord(candidates[0].content) ? candidates[0].content : {}),
          parts: [{ text: answer }],
          role: "model"
        },
        finishReason: stringValue(candidates[0].finishReason) === "MAX_TOKENS" ? "STOP" : candidates[0].finishReason
      }
    : geminiAnswerCandidate(answer);
  return {
    changed: true,
    value: {
      ...value,
      candidates: [nextCandidate, ...candidates.slice(1)]
    }
  };
}

export function transformGeminiHostedWebSearchSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  queryHint?: string
): string {
  const events = parseSseEvents(body);
  if (events.length === 0 || geminiSseContainsVisibleText(events)) {
    return body;
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer) {
    return body;
  }
  const injected = sseEventFromValue(geminiAnswerCandidateChunk(answer));
  const insertAt = doneSseEventIndex(events);
  events.splice(insertAt >= 0 ? insertAt : events.length, 0, injected);
  return `${events.map(serializeSseEvent).join("\n\n")}\n\n`;
}

function openAiChatResponseContainsVisibleText(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.choices)) {
    return false;
  }
  return value.choices.some((choice) => {
    const message = isRecord(choice) && isRecord(choice.message) ? choice.message : undefined;
    return Boolean(stringValue(message?.content)?.trim());
  });
}

function openAiChatSseContainsVisibleText(events: ParsedSseEvent[]): boolean {
  return events.some((event) => {
    const choices = isRecord(event.data) && Array.isArray(event.data.choices) ? event.data.choices : [];
    return choices.some((choice) => {
      const delta = isRecord(choice) && isRecord(choice.delta) ? choice.delta : undefined;
      return Boolean(stringValue(delta?.content)?.trim());
    });
  });
}

function updateOpenAiChatSseFinishReason(event: ParsedSseEvent): ParsedSseEvent {
  if (!isRecord(event.data) || !Array.isArray(event.data.choices)) {
    return event;
  }
  let changed = false;
  const choices = event.data.choices.map((choice) => {
    if (!isRecord(choice) || stringValue(choice.finish_reason) !== "length") {
      return choice;
    }
    changed = true;
    return { ...choice, finish_reason: "stop" };
  });
  return changed ? { ...event, data: { ...event.data, choices } } : event;
}

function openAiResponsesValueContainsVisibleText(value: Record<string, unknown>): boolean {
  return Array.isArray(value.output) && value.output.some(openAiResponsesItemContainsVisibleText);
}

function openAiResponsesItemContainsVisibleText(item: unknown): boolean {
  if (!isRecord(item)) {
    return false;
  }
  if (stringValue(item.type) === "message" && Array.isArray(item.content)) {
    return item.content.some((part) => isRecord(part) && Boolean(stringValue(part.text)?.trim()));
  }
  return Boolean(stringValue(item.text)?.trim());
}

function openAiResponsesSseContainsVisibleText(events: ParsedSseEvent[]): boolean {
  return Boolean(openAiResponsesSseVisibleText(events));
}

function openAiResponsesSseVisibleText(events: ParsedSseEvent[]): string | undefined {
  let deltaText = "";
  let doneText = "";
  let itemText = "";
  for (const event of events) {
    const data = isRecord(event.data) ? event.data : undefined;
    if (!data) {
      continue;
    }
    const type = stringValue(data.type);
    if (type === "response.output_text.delta") {
      deltaText += stringValue(data.delta) ?? "";
      continue;
    }
    if (type === "response.output_text.done") {
      doneText = stringValue(data.text) ?? doneText;
      continue;
    }
    const item = isRecord(data.item) ? data.item : undefined;
    if (item && openAiResponsesItemContainsVisibleText(item)) {
      itemText = openAiResponsesItemText(item) ?? itemText;
    }
  }
  return nonEmptyText(deltaText) ?? nonEmptyText(doneText) ?? nonEmptyText(itemText);
}

function openAiResponsesItemText(item: unknown): string | undefined {
  if (!isRecord(item)) {
    return undefined;
  }
  if (stringValue(item.type) === "message" && Array.isArray(item.content)) {
    const text = item.content
      .flatMap((part) => isRecord(part) ? [stringValue(part.text) ?? ""] : [])
      .join("");
    return text.trim() ? text : undefined;
  }
  return stringValue(item.text);
}

function nonEmptyText(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

function openAiResponsesWebSearchCallItems(records: BrowserWebSearchProtocolRecord[], requestId: string): Record<string, unknown>[] {
  return records.map((record, index) => ({
    action: {
      query: record.query,
      type: "search"
    },
    id: `ws_${sanitizeAnthropicToolUseId(requestId)}_${index + 1}`,
    status: "completed",
    type: "web_search_call"
  }));
}

function openAiResponsesMessageItem(answer: string, requestId: string): Record<string, unknown> {
  return {
    content: [{ annotations: [], text: answer, type: "output_text" }],
    id: `msg_${sanitizeAnthropicToolUseId(requestId)}_web_search_answer`,
    role: "assistant",
    status: "completed",
    type: "message"
  };
}

function nextOpenAiResponsesOutputIndex(events: ParsedSseEvent[]): number {
  const indexes = events.flatMap((event) => {
    const data = isRecord(event.data) ? event.data : undefined;
    const index = numberValue(data?.output_index);
    return index === undefined ? [] : [index];
  });
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
}

function openAiResponsesSseAnswerEvents(answer: string, requestId: string, outputIndex: number): ParsedSseEvent[] {
  const itemId = `msg_${sanitizeAnthropicToolUseId(requestId)}_web_search_answer`;
  const contentIndex = 0;
  return [
    sseEventFromValue({
      item: {
        id: itemId,
        role: "assistant",
        status: "in_progress",
        type: "message"
      },
      output_index: outputIndex,
      type: "response.output_item.added"
    }),
    sseEventFromValue({
      content_index: contentIndex,
      item_id: itemId,
      output_index: outputIndex,
      part: { annotations: [], text: "", type: "output_text" },
      type: "response.content_part.added"
    }),
    sseEventFromValue({
      content_index: contentIndex,
      delta: answer,
      item_id: itemId,
      output_index: outputIndex,
      type: "response.output_text.delta"
    }),
    sseEventFromValue({
      content_index: contentIndex,
      item_id: itemId,
      output_index: outputIndex,
      text: answer,
      type: "response.output_text.done"
    }),
    sseEventFromValue({
      content_index: contentIndex,
      item_id: itemId,
      output_index: outputIndex,
      part: { annotations: [], text: answer, type: "output_text" },
      type: "response.content_part.done"
    }),
    sseEventFromValue({
      item: {
        content: [{ annotations: [], text: answer, type: "output_text" }],
        id: itemId,
        role: "assistant",
        status: "completed",
        type: "message"
      },
      output_index: outputIndex,
      type: "response.output_item.done"
    })
  ];
}

function updateOpenAiResponsesCompletedStatus(event: ParsedSseEvent): ParsedSseEvent {
  if (!isRecord(event.data) || stringValue(event.data.type) !== "response.completed") {
    return event;
  }
  const response = isRecord(event.data.response) ? event.data.response : undefined;
  if (!response || stringValue(response.status) !== "incomplete") {
    return event;
  }
  const nextResponse: Record<string, unknown> = { ...response, status: "completed" };
  delete nextResponse.incomplete_details;
  return {
    ...event,
    data: {
      ...event.data,
      response: nextResponse
    }
  };
}

function normalizeOpenAiResponsesSseEvents(events: ParsedSseEvent[], visibleText?: string): ParsedSseEvent[] {
  const outputIndexMap = openAiResponsesOutputIndexMap(events);
  return events.flatMap((event) => {
    if (isOpenAiResponsesReasoningSseEvent(event)) {
      return [];
    }
    return [updateOpenAiResponsesCompletedOutput(
      remapOpenAiResponsesOutputIndex(event, outputIndexMap),
      visibleText
    )];
  });
}

function serializeOpenAiResponsesSseEvents(events: ParsedSseEvent[]): string {
  return `${events.map(serializeSseEvent).join("\n\n")}\n\n`;
}

function openAiResponsesOutputIndexMap(events: ParsedSseEvent[]): Map<number, number> {
  const indexes: number[] = [];
  for (const event of events) {
    if (isOpenAiResponsesReasoningSseEvent(event)) {
      continue;
    }
    const data = isRecord(event.data) ? event.data : undefined;
    const index = numberValue(data?.output_index);
    if (index !== undefined && !indexes.includes(index)) {
      indexes.push(index);
    }
  }
  return new Map(indexes.sort((left, right) => left - right).map((index, nextIndex) => [index, nextIndex]));
}

function remapOpenAiResponsesOutputIndex(event: ParsedSseEvent, outputIndexMap: Map<number, number>): ParsedSseEvent {
  if (!isRecord(event.data)) {
    return event;
  }
  const index = numberValue(event.data.output_index);
  if (index === undefined || !outputIndexMap.has(index)) {
    return event;
  }
  return {
    ...event,
    data: {
      ...event.data,
      output_index: outputIndexMap.get(index)
    }
  };
}

function updateOpenAiResponsesCompletedOutput(event: ParsedSseEvent, visibleText?: string): ParsedSseEvent {
  if (!isRecord(event.data) || stringValue(event.data.type) !== "response.completed") {
    return event;
  }
  const response = isRecord(event.data.response) ? event.data.response : undefined;
  if (!response) {
    return event;
  }
  const nextResponse: Record<string, unknown> = { ...response };
  if (Array.isArray(response.output)) {
    nextResponse.output = response.output.filter((item) => !(isRecord(item) && stringValue(item.type) === "reasoning"));
  }
  if (visibleText) {
    nextResponse.output_text = visibleText;
  }
  if (visibleText && stringValue(nextResponse.status) === "incomplete") {
    nextResponse.status = "completed";
    delete nextResponse.incomplete_details;
  }
  return {
    ...event,
    data: {
      ...event.data,
      response: nextResponse
    }
  };
}

function isOpenAiResponsesReasoningSseEvent(event: ParsedSseEvent): boolean {
  const data = isRecord(event.data) ? event.data : undefined;
  if (!data) {
    return false;
  }
  const type = stringValue(data.type);
  if (type?.startsWith("response.reasoning")) {
    return true;
  }
  const item = isRecord(data.item) ? data.item : undefined;
  if (stringValue(item?.type) === "reasoning") {
    return true;
  }
  const part = isRecord(data.part) ? data.part : undefined;
  return stringValue(part?.type) === "reasoning_text";
}

function geminiResponseValueContainsVisibleText(value: Record<string, unknown>): boolean {
  return Array.isArray(value.candidates) && value.candidates.some(geminiCandidateContainsVisibleText);
}

function geminiResponseArrayContainsVisibleText(values: unknown[]): boolean {
  return values.some((value) => isRecord(value) && geminiResponseValueContainsVisibleText(value));
}

function geminiCandidateContainsVisibleText(candidate: unknown): boolean {
  const content = isRecord(candidate) && isRecord(candidate.content) ? candidate.content : undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts.some((part) => isRecord(part) && Boolean(stringValue(part.text)?.trim()));
}

function geminiSseContainsVisibleText(events: ParsedSseEvent[]): boolean {
  return events.some((event) => isRecord(event.data) && geminiResponseValueContainsVisibleText(event.data));
}

function geminiAnswerCandidate(answer: string): Record<string, unknown> {
  return {
    content: {
      parts: [{ text: answer }],
      role: "model"
    },
    finishReason: "STOP",
    index: 0
  };
}

function geminiAnswerCandidateChunk(answer: string): Record<string, unknown> {
  return {
    candidates: [geminiAnswerCandidate(answer)]
  };
}

function firstSseDataRecord(events: ParsedSseEvent[]): Record<string, unknown> | undefined {
  return events.map((event) => isRecord(event.data) ? event.data : undefined).find(Boolean);
}

function doneSseEventIndex(events: ParsedSseEvent[]): number {
  return events.findIndex((event) => event.raw?.includes("[DONE]"));
}

function sseEventIsDone(event: ParsedSseEvent): boolean {
  return Boolean(event.raw?.includes("[DONE]"));
}

function hasAnthropicHostedWebSearchTool(tools: unknown): boolean {
  if (!Array.isArray(tools)) {
    return false;
  }
  return tools.some(isAnthropicHostedWebSearchTool);
}

function hasHostedWebSearchDeclaration(body: Record<string, unknown>, protocol: GatewayProviderProtocol): boolean {
  if (protocol === "anthropic_messages") {
    return hasAnthropicHostedWebSearchTool(body.tools);
  }
  if (protocol === "openai_chat_completions" || protocol === "openai_responses") {
    return hasOpenAiHostedWebSearchDeclaration(body);
  }
  if (protocol === "gemini_generate_content") {
    return hasGeminiHostedWebSearchTool(body.tools);
  }
  return false;
}

function hasOpenAiHostedWebSearchDeclaration(body: Record<string, unknown>): boolean {
  if (body.web_search_options !== undefined || body.webSearchOptions !== undefined) {
    return true;
  }
  return Array.isArray(body.tools) && body.tools.some(isOpenAiHostedWebSearchTool);
}

function hasGeminiHostedWebSearchTool(tools: unknown): boolean {
  if (!Array.isArray(tools)) {
    return false;
  }
  return tools.some((tool) => {
    if (!isRecord(tool)) {
      return false;
    }
    if (tool.google_search !== undefined || tool.googleSearch !== undefined || tool.google_search_retrieval !== undefined || tool.googleSearchRetrieval !== undefined) {
      return true;
    }
    return false;
  });
}

function isAnthropicHostedWebSearchTool(tool: unknown): boolean {
  if (!isRecord(tool)) {
    return false;
  }
  return anthropicHostedWebSearchType(stringValue(tool.type));
}

function isOpenAiHostedWebSearchTool(tool: unknown): boolean {
  if (!isRecord(tool)) {
    return false;
  }
  return openAiHostedWebSearchType(stringValue(tool.type));
}

function openAiToolChoiceNamesWebSearch(value: unknown): boolean {
  if (typeof value === "string") {
    return openAiHostedWebSearchType(value);
  }
  if (!isRecord(value)) {
    return false;
  }
  return openAiHostedWebSearchType(stringValue(value.type));
}

function anthropicHostedWebSearchType(value: string | undefined): boolean {
  const normalized = normalizedToolProtocolName(value);
  return normalized === "web_search" || normalized === "web_search_20250305";
}

function openAiHostedWebSearchType(value: string | undefined): boolean {
  const normalized = normalizedToolProtocolName(value);
  return normalized === "web_search" ||
    normalized === "web_search_preview" ||
    normalized.startsWith("web_search_preview_");
}

function normalizedToolProtocolName(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[-.]/g, "_") ?? "";
}

function readAnthropicWebSearchMaxUses(tools: unknown): number | undefined {
  if (!Array.isArray(tools)) {
    return undefined;
  }
  const tool = tools.find((item) => isRecord(item) && stringValue(item.type)?.toLowerCase() === "web_search_20250305");
  return isRecord(tool) ? numberValue(tool.max_uses ?? tool.maxUses) : undefined;
}

function readHostedWebSearchMaxUses(body: Record<string, unknown>, protocol: GatewayProviderProtocol): number | undefined {
  if (protocol === "anthropic_messages") {
    return readAnthropicWebSearchMaxUses(body.tools);
  }
  if (protocol === "openai_chat_completions" || protocol === "openai_responses") {
    const tool = Array.isArray(body.tools) ? body.tools.find(isOpenAiHostedWebSearchTool) : undefined;
    return isRecord(tool) ? numberValue(tool.max_uses ?? tool.maxUses) : undefined;
  }
  return undefined;
}

export function extractHostedWebSearchQueryHint(body: Record<string, unknown>, protocol: GatewayProviderProtocol): string | undefined {
  if (protocol === "anthropic_messages") {
    return extractAnthropicWebSearchQueryHint(body);
  }
  if (protocol === "openai_chat_completions") {
    return normalizedWebSearchQueryHintFromParts(textPartsFromOpenAiChatMessages(body.messages));
  }
  if (protocol === "openai_responses") {
    return normalizedWebSearchQueryHintFromParts(textPartsFromOpenAiResponsesInput(body.input));
  }
  if (protocol === "gemini_generate_content") {
    return normalizedWebSearchQueryHintFromParts(textPartsFromGeminiContents(body.contents));
  }
  return undefined;
}

function extractAnthropicWebSearchQueryHint(body: Record<string, unknown>): string | undefined {
  const userTexts = Array.isArray(body.messages)
    ? body.messages.flatMap((message) => {
        if (!isRecord(message) || stringValue(message.role) !== "user") {
          return [];
        }
        return textPartsFromAnthropicContent(message.content);
      })
    : [];
  return normalizedWebSearchQueryHintFromParts(userTexts);
}

function extractClaudeCodeWebSearchToolResultQuery(body: Record<string, unknown>): string | undefined {
  for (const text of claudeCodeWebSearchToolResultTexts(body)) {
    const quoted = /Web search results for query:\s*"([^"]+)"/i.exec(text);
    if (quoted?.[1]) {
      return normalizedWebSearchQueryHint(quoted[1]);
    }
    const unquoted = /Web search results for query:\s*([^\n]+)/i.exec(text);
    if (unquoted?.[1]) {
      return normalizedWebSearchQueryHint(unquoted[1].replace(/^["']|["']$/g, ""));
    }
  }
  return undefined;
}

function normalizedWebSearchQueryHintFromParts(parts: string[]): string | undefined {
  const candidates = parts
    .map((part) => part.trim())
    .filter(Boolean);
  for (const candidate of [...candidates].reverse()) {
    const explicit = extractExplicitWebSearchQuery(candidate);
    if (explicit) {
      return normalizedWebSearchQueryHint(explicit);
    }
  }
  for (const candidate of [...candidates].reverse()) {
    if (isRuntimeContextText(candidate)) {
      continue;
    }
    return normalizedWebSearchQueryHint(stripSearchIntentPrefix(candidate));
  }
  return normalizedWebSearchQueryHint(candidates.join("\n"));
}

function normalizedWebSearchQueryHint(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const joined = value.trim();
  if (!joined) {
    return undefined;
  }
  return joined.trim().slice(0, 500);
}

function extractExplicitWebSearchQuery(value: string): string | undefined {
  const explicit = /perform\s+a\s+web\s+search\s+for\s+the\s+query:\s*([\s\S]+)$/i.exec(value.trim());
  return normalizedWebSearchQueryHint(explicit?.[1]);
}

function stripSearchIntentPrefix(value: string): string {
  const trimmed = value.trim();
  const match = /^(?:请)?(?:帮我)?(?:搜索|查询|查一下|帮我查一下|搜一下)\s*[:：]?\s*([\s\S]+)$/i.exec(trimmed);
  return (match?.[1] || trimmed).trim();
}

function isRuntimeContextText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/^<(?:environment_context|permissions instructions|collaboration_mode|skills_instructions|plugins_instructions|apps_instructions)>/i.test(trimmed)) {
    return true;
  }
  return (
    trimmed.includes("<workspace_roots>") ||
    trimmed.includes("<permission_profile") ||
    trimmed.includes("<filesystem>") ||
    trimmed.includes("<current_date>") ||
    trimmed.includes("<writable_roots>")
  );
}

function textPartsFromAnthropicContent(content: unknown): string[] {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((part) => isRecord(part) && typeof part.text === "string" ? [part.text] : []);
}

function claudeCodeWebSearchToolResultTexts(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.messages)) {
    return [];
  }
  const lastMessage = body.messages.at(-1);
  if (!isRecord(lastMessage) || stringValue(lastMessage.role) !== "user" || !Array.isArray(lastMessage.content)) {
    return [];
  }
  const latestToolResults = lastMessage.content.filter((part) => isRecord(part) && stringValue(part.type) === "tool_result");
  if (latestToolResults.length === 0) {
    return [];
  }
  const webSearchToolUseIds = new Set<string>();
  for (let index = body.messages.length - 2; index >= 0; index -= 1) {
    const message = body.messages[index];
    if (!isRecord(message) || stringValue(message.role) !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (!isRecord(part) || stringValue(part.type) !== "tool_use" || stringValue(part.name)?.toLowerCase() !== "websearch") {
        continue;
      }
      const id = stringValue(part.id);
      if (id) {
        webSearchToolUseIds.add(id);
      }
    }
    break;
  }
  if (webSearchToolUseIds.size === 0) {
    return [];
  }
  const texts: string[] = [];
  for (const part of latestToolResults) {
    if (!isRecord(part)) {
      continue;
    }
    const toolUseId = stringValue(part.tool_use_id);
    if (!toolUseId || !webSearchToolUseIds.has(toolUseId)) {
      continue;
    }
    const text = anthropicToolResultContentText(part.content);
    if (text) {
      texts.push(text);
    }
  }
  return texts;
}

function anthropicToolResultContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.flatMap((part) => {
    if (!isRecord(part)) {
      return [];
    }
    const type = stringValue(part.type);
    if (type === "text" || type === "input_text" || type === "output_text") {
      const text = stringValue(part.text);
      return text ? [text] : [];
    }
    return [];
  }).join("\n");
}

function textPartsFromOpenAiChatMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.flatMap((message) => {
    if (!isRecord(message) || stringValue(message.role)?.toLowerCase() !== "user") {
      return [];
    }
    return textPartsFromOpenAiContent(message.content);
  });
}

function textPartsFromOpenAiContent(content: unknown): string[] {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((part) => {
    if (!isRecord(part)) {
      return [];
    }
    const type = stringValue(part.type);
    if (type === "text" || type === "input_text" || type === "output_text") {
      return stringValue(part.text) ? [stringValue(part.text) as string] : [];
    }
    return [];
  });
}

function textPartsFromOpenAiResponsesInput(input: unknown): string[] {
  if (typeof input === "string") {
    return [input];
  }
  if (!Array.isArray(input)) {
    return [];
  }
  return input.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const role = stringValue(item.role)?.toLowerCase();
    if (role && role !== "user") {
      return [];
    }
    return textPartsFromOpenAiContent(item.content);
  });
}

function textPartsFromGeminiContents(contents: unknown): string[] {
  if (!Array.isArray(contents)) {
    return [];
  }
  return contents.flatMap((content) => {
    if (!isRecord(content)) {
      return [];
    }
    const role = stringValue(content.role)?.toLowerCase();
    if (role && role !== "user") {
      return [];
    }
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.flatMap((part) => isRecord(part) && typeof part.text === "string" ? [part.text] : []);
  });
}

export function fusionWebSearchToolNameForRequest(config: AppConfig, model: string | undefined): string | undefined {
  const normalizedModel = model ? fusionModelNameFromSelector(model) : "";
  for (const candidate of fusionBrowserWebSearchToolCandidates(config)) {
    if (!normalizedModel || candidate.aliases.some((alias) => fusionModelNameFromSelector(alias).toLowerCase() === normalizedModel.toLowerCase())) {
      return candidate.toolName;
    }
  }
  return undefined;
}

function fusionBrowserWebSearchToolCandidates(config: AppConfig): Array<{ aliases: string[]; toolName: string }> {
  const rawProfiles = Array.isArray(config.virtualModelProfiles) ? config.virtualModelProfiles : [];
  const profiles = normalizeCoreGatewayVirtualModelProfiles(
    withCodexCompatibleVirtualModelProfiles(withFusionVirtualModelAliases(rawProfiles)),
    config
  );
  const candidates: Array<{ aliases: string[]; toolName: string }> = [];
  for (const profile of profiles) {
    if (!isRecord(profile) || profile.enabled === false) {
      continue;
    }
    const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
    const fusionWebSearch = isRecord(metadata?.fusionWebSearch) ? metadata.fusionWebSearch : undefined;
    const webSearchConfig = readFusionWebSearchConfig(fusionWebSearch);
    if (!webSearchConfig?.toolName || webSearchConfig.provider !== "browser") {
      continue;
    }
    const match = isRecord(profile.match) ? profile.match : undefined;
    const aliases = uniqueStrings([
      stringValue(profile.id),
      stringValue(profile.key),
      stringValue(profile.displayName),
      ...stringListValue(match?.exactAliases)
    ].filter((item): item is string => Boolean(item)));
    candidates.push({ aliases, toolName: webSearchConfig.toolName });
  }
  return candidates;
}

async function selectHostedWebSearchProtocolRecords(
  context: HostedWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration
): Promise<BrowserWebSearchProtocolRecord[]> {
  const records = [
    ...(context.records ?? []),
    ...(integration.recentBrowserWebSearchResults?.({ sinceMs: context.sinceMs, toolName: context.toolName }) ?? [])
  ]
    .filter((record) => record.results.length > 0)
    .filter(uniqueSearchRecordFilter())
    .sort((left, right) => {
      const queryScoreDelta = queryMatchScore(context.queryHint, right.query) - queryMatchScore(context.queryHint, left.query);
      return queryScoreDelta || left.completedAtMs - right.completedAtMs;
    });
  if (records.length > 0) {
    return records.slice(0, 8);
  }
  if (!context.queryHint || !integration.runBrowserWebSearch) {
    return [];
  }
  const record = await integration.runBrowserWebSearch({
    count: Math.trunc(clampNumber(context.maxUses ?? 5, 1, 10)),
    prompt: context.queryHint,
    timeoutMs: 30_000,
    toolName: context.toolName
  });
  return record?.results.length ? [record] : [];
}

function selectClaudeCodeWebSearchContinuationRecords(
  context: ClaudeCodeWebSearchContinuationContext,
  integration: BrowserWebSearchMcpIntegration
): BrowserWebSearchProtocolRecord[] {
  const records = integration.recentBrowserWebSearchResults?.({
    sinceMs: context.sinceMs,
    toolName: context.toolName
  }) ?? [];
  return records
    .filter((record) => record.results.length > 0)
    .filter(uniqueSearchRecordFilter())
    .sort((left, right) => {
      const queryScoreDelta = queryMatchScore(context.queryHint, right.query) - queryMatchScore(context.queryHint, left.query);
      return queryScoreDelta || right.completedAtMs - left.completedAtMs;
    })
    .slice(0, 3);
}

async function selectAnthropicWebSearchProtocolRecords(
  context: AnthropicWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration
): Promise<BrowserWebSearchProtocolRecord[]> {
  return selectHostedWebSearchProtocolRecords(context, integration);
}

function uniqueSearchRecordFilter(): (record: BrowserWebSearchProtocolRecord) => boolean {
  const seen = new Set<string>();
  return (record) => {
    const key = `${record.toolName}\n${record.query}\n${record.searchUrl}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  };
}

function queryMatchScore(queryHint: string | undefined, query: string): number {
  if (!queryHint) {
    return 0;
  }
  const left = normalizeSearchComparisonText(queryHint);
  const right = normalizeSearchComparisonText(query);
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 4;
  }
  if (left.includes(right) || right.includes(left)) {
    return 3;
  }
  const leftTerms = new Set(left.split(" ").filter((item) => item.length > 2));
  const rightTerms = right.split(" ").filter((item) => item.length > 2);
  return rightTerms.reduce((score, term) => score + (leftTerms.has(term) ? 1 : 0), 0);
}

function normalizeSearchComparisonText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function responseValueContainsAnthropicWebSearchBlocks(value: Record<string, unknown>): boolean {
  return Array.isArray(value.content) && value.content.some((block) => {
    const type = isRecord(block) ? stringValue(block.type) : undefined;
    return type === "server_tool_use" || type === "web_search_tool_result";
  });
}

function responseValueContainsVisibleText(value: Record<string, unknown>): boolean {
  return Array.isArray(value.content) && value.content.some((block) => {
    if (!isRecord(block) || stringValue(block.type) !== "text") {
      return false;
    }
    return Boolean(stringValue(block.text)?.trim());
  });
}

function responseValueContainsAnthropicClientToolUse(value: Record<string, unknown>): boolean {
  return Array.isArray(value.content) && value.content.some((block) => {
    return isRecord(block) && stringValue(block.type) === "tool_use";
  });
}

function leadingThinkingBlockCount(content: unknown[]): number {
  let index = 0;
  while (index < content.length) {
    const block = content[index];
    if (!isRecord(block) || stringValue(block.type) !== "thinking") {
      break;
    }
    index += 1;
  }
  return index;
}

function webSearchProtocolInsertIndex(content: unknown[], hasWebSearchBlocks: boolean): number {
  let index = leadingThinkingBlockCount(content);
  if (!hasWebSearchBlocks) {
    return index;
  }
  while (index < content.length) {
    const block = content[index];
    const type = isRecord(block) ? stringValue(block.type) : undefined;
    if (type !== "server_tool_use" && type !== "web_search_tool_result") {
      break;
    }
    index += 1;
  }
  return index;
}

function mergeAnthropicWebSearchUsage(usage: unknown, searchCount: number): Record<string, unknown> {
  const nextUsage = isRecord(usage) ? { ...usage } : {};
  const serverToolUse = isRecord(nextUsage.server_tool_use) ? { ...nextUsage.server_tool_use } : {};
  const webSearchRequests = Math.max(1, Math.trunc(searchCount));
  serverToolUse.web_search_requests = Math.max(numberValue(serverToolUse.web_search_requests) ?? 0, webSearchRequests);
  nextUsage.server_tool_use = serverToolUse;
  return nextUsage;
}

function sseEventsContainAnthropicWebSearchBlocks(events: ParsedSseEvent[]): boolean {
  return events.some((event) => {
    return sseEventContainsAnthropicWebSearchBlock(event);
  });
}

function sseEventsContainVisibleText(events: ParsedSseEvent[]): boolean {
  return events.some(sseEventContainsVisibleText);
}

function sseEventContainsAnthropicWebSearchBlock(event: ParsedSseEvent): boolean {
  const data = isRecord(event.data) ? event.data : undefined;
  const block = isRecord(data?.content_block) ? data.content_block : undefined;
  const type = stringValue(block?.type) || stringValue(data?.type);
  return type === "server_tool_use" || type === "web_search_tool_result";
}

function sseEventContainsVisibleText(event: ParsedSseEvent): boolean {
  const data = isRecord(event.data) ? event.data : undefined;
  if (!data) {
    return false;
  }
  const block = isRecord(data.content_block) ? data.content_block : undefined;
  if (stringValue(data.type) === "content_block_start" && stringValue(block?.type) === "text") {
    return Boolean(stringValue(block?.text)?.trim());
  }
  const delta = isRecord(data.delta) ? data.delta : undefined;
  return stringValue(data.type) === "content_block_delta" &&
    stringValue(delta?.type) === "text_delta" &&
    Boolean(stringValue(delta?.text)?.trim());
}

function sseEventsContainAnthropicClientToolUse(events: ParsedSseEvent[]): boolean {
  return events.some(sseEventContainsAnthropicClientToolUse);
}

function sseEventContainsAnthropicClientToolUse(event: ParsedSseEvent): boolean {
  const data = isRecord(event.data) ? event.data : undefined;
  const block = isRecord(data?.content_block) ? data.content_block : undefined;
  return stringValue(data?.type) === "content_block_start" && stringValue(block?.type) === "tool_use";
}

function anthropicSseTextBlockStartIndex(event: ParsedSseEvent): number | undefined {
  const data = isRecord(event.data) ? event.data : undefined;
  const block = isRecord(data?.content_block) ? data.content_block : undefined;
  if (stringValue(data?.type) !== "content_block_start" || stringValue(block?.type) !== "text") {
    return undefined;
  }
  const index = numberValue(data?.index);
  return index === undefined ? undefined : index;
}

function sseEventIsAnthropicMessageEnd(event: ParsedSseEvent): boolean {
  const type = isRecord(event.data) ? stringValue(event.data.type) : undefined;
  return type === "message_delta" || type === "message_stop";
}

function anthropicWebSearchSseEventsForBlock(block: Record<string, unknown>, index: number): ParsedSseEvent[] {
  if (stringValue(block.type) === "text") {
    const text = stringValue(block.text) ?? "";
    return [
      sseEventFromValue({
        content_block: { text: "", type: "text" },
        index,
        type: "content_block_start"
      }),
      sseEventFromValue({
        delta: { text, type: "text_delta" },
        index,
        type: "content_block_delta"
      }),
      sseEventFromValue({
        index,
        type: "content_block_stop"
      })
    ];
  }
  return [
    sseEventFromValue({
      content_block: block,
      index,
      type: "content_block_start"
    }),
    sseEventFromValue({
      index,
      type: "content_block_stop"
    })
  ];
}

function updateAnthropicWebSearchSseUsage(
  event: ParsedSseEvent,
  searchCount: number,
  didSynthesizeAnswer: boolean,
  hasClientToolUse: boolean
): ParsedSseEvent {
  if (!isRecord(event.data) || stringValue(event.data.type) !== "message_delta") {
    return event;
  }
  const delta = isRecord(event.data.delta) ? { ...event.data.delta } : event.data.delta;
  const nextData: Record<string, unknown> = {
    ...event.data,
    usage: mergeAnthropicWebSearchUsage(event.data.usage, searchCount)
  };
  if (isRecord(delta) && shouldEndAnthropicHostedWebSearchTurn(delta.stop_reason, didSynthesizeAnswer, hasClientToolUse)) {
    nextData.delta = { ...delta, stop_reason: "end_turn" };
  }
  return {
    ...event,
    data: nextData
  };
}

function shouldEndAnthropicHostedWebSearchTurn(
  stopReason: unknown,
  didSynthesizeAnswer: boolean,
  hasClientToolUse: boolean
): boolean {
  if (hasClientToolUse) {
    return false;
  }
  const normalized = stringValue(stopReason);
  return normalized === "tool_use" || (didSynthesizeAnswer && normalized === "max_tokens");
}

function synthesizeWebSearchAnswer(records: BrowserWebSearchProtocolRecord[], queryHint: string | undefined): string | undefined {
  const query = queryHint || records.map((record) => record.query).find(Boolean) || "";
  const weatherAnswer = synthesizeWeatherWebSearchAnswer(records, query);
  if (weatherAnswer) {
    return weatherAnswer;
  }
  const componentChangelogAnswer = synthesizeComponentChangelogWebSearchAnswer(records, query);
  if (componentChangelogAnswer) {
    return componentChangelogAnswer;
  }
  const evidence = topWebSearchEvidenceSentences(records, query, 3);
  if (evidence.length === 0) {
    const sources = webSearchSourceNames(records, 3);
    if (!sources) {
      return undefined;
    }
    return containsCjkText(query)
      ? `搜索已完成，但页面可提取正文不足。较相关的来源包括：${sources}。`
      : `The search completed, but the pages did not expose enough extractable text. The most relevant sources are: ${sources}.`;
  }
  const sources = webSearchSourceNames(records, 3);
  return containsCjkText(query)
    ? `根据搜索结果，${evidence.join("；")}。${sources ? `来源：${sources}。` : ""}`
    : `Based on the search results, ${evidence.join("; ")}.${sources ? ` Sources: ${sources}.` : ""}`;
}

function synthesizeComponentChangelogWebSearchAnswer(records: BrowserWebSearchProtocolRecord[], query: string): string | undefined {
  const normalizedQuery = normalizeSearchComparisonText(query);
  const asksForComponents = /component|components|组件/i.test(query);
  const asksForNewOrChangelog = /new|latest|recent|changelog|release|新增|新组件|最新|更新|官方/i.test(query);
  if (!asksForComponents || !asksForNewOrChangelog) {
    return undefined;
  }
  const items = webSearchEvidenceItems(records);
  const preferred = items.find((item) => {
    const normalized = normalizeSearchComparisonText(`${item.source} ${item.url} ${item.text.slice(0, 500)}`);
    return normalized.includes("changelog") || normalized.includes("official") || normalized.includes("docs") || normalizedQuery.includes("official");
  }) ?? items[0];
  if (!preferred) {
    return undefined;
  }
  const release = extractComponentReleaseTitle(preferred.text);
  const components = extractLikelyComponentNames(preferred.text);
  const sources = webSearchSourceNames(records, 2);
  const cjk = containsCjkText(query);
  if (!release && components.length === 0) {
    return undefined;
  }
  if (cjk) {
    return [
      release ? `官方相关条目是 ${release}` : "官方页面包含新增组件相关内容",
      components.length > 0 ? `可提取到的相关组件包括 ${components.join("、")}` : "",
      sources ? `来源：${sources}。` : ""
    ].filter(Boolean).join("；");
  }
  return [
    release ? `The relevant official entry is ${release}` : "The official page contains new component information",
    components.length > 0 ? `extractable related components include ${components.join(", ")}` : "",
    sources ? `Sources: ${sources}.` : ""
  ].filter(Boolean).join("; ");
}

function extractComponentReleaseTitle(text: string): string | undefined {
  const patterns = [
    /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s*-\s*Components?[^.。!?]{0,90})/i,
    /(\d{4}[-/]\d{1,2}[^.。!?]{0,60}Components?[^.。!?]{0,60})/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const title = match?.[1]?.replace(/\s+/g, " ").trim();
    if (title) {
      return title;
    }
  }
  return undefined;
}

function extractLikelyComponentNames(text: string): string[] {
  const knownNames = [
    "Message Scroller",
    "Message",
    "Attachment",
    "Bubble",
    "Marker",
    "Empty",
    "Item",
    "Field",
    "Input OTP",
    "Button Group"
  ];
  const lower = text.toLowerCase();
  return knownNames.filter((name) => lower.includes(name.toLowerCase())).slice(0, 10);
}

function synthesizeWeatherWebSearchAnswer(records: BrowserWebSearchProtocolRecord[], query: string): string | undefined {
  if (!/天气|气温|温度|weather|forecast|temperature/i.test(query)) {
    return undefined;
  }
  const items = webSearchEvidenceItems(records);
  const text = items.map((item) => item.text).join(" ");
  if (!text) {
    return undefined;
  }
  const cjk = containsCjkText(query);
  const location = extractWeatherLocation(query);
  const temperatureRange = weatherTemperatureRange(text);
  const currentTemperature = firstRegexGroup(text, [
    /(?:当前|现在|实时|实况|气温|温度)[^。；，,\d-]{0,12}(-?\d{1,2}(?:\.\d+)?)\s*℃/i,
    location ? new RegExp(`${escapeRegExp(location)}\\s+(-?\\d{1,2}(?:\\.\\d+)?)\\s*℃`) : undefined
  ]);
  const feelsLike = firstRegexGroup(text, [/体感温度[：:\s]*(-?\d{1,2}(?:\.\d+)?)\s*℃/]);
  const high = firstRegexGroup(text, [/最高气温[：:\s]*(-?\d{1,2}(?:\.\d+)?)\s*℃/]);
  const low = firstRegexGroup(text, [/最低气温[：:\s]*(-?\d{1,2}(?:\.\d+)?)\s*℃/]);
  const humidity = firstRegexGroup(text, [/(?:最大相对湿度|相对湿度)[：:\s]*(-?\d{1,3}(?:\.\d+)?%)/]);
  const aqi = firstRegexGroup(text, [/AQI最高值[：:\s]*(\d{1,3})/i]);
  const airQuality = firstRegexGroup(text, [/空气质量[：:\s]*([^\s，。；,;]{1,12})/]);
  const rain = firstRegexGroup(text, [/(?:过去24小时总降水量|总降水量|降水量)[：:\s]*(-?\d+(?:\.\d+)?mm)/i]);
  const wind = firstRegexGroup(text, [/最大风力[：:\s]*([<>]?\d+级|微风)/, /(东风|东南风|南风|西南风|西风|西北风|北风|东北风)\s*([<>]?\d+级|微风)/]);

  const facts = [
    currentTemperature ? (cjk ? `当前约 ${currentTemperature}℃` : `currently about ${currentTemperature}°C`) : undefined,
    !currentTemperature && temperatureRange ? (cjk ? `气温约 ${temperatureRange}` : `temperatures are around ${temperatureRange}`) : undefined,
    feelsLike ? (cjk ? `体感约 ${feelsLike}℃` : `feels like about ${feelsLike}°C`) : undefined,
    high || low ? (cjk
      ? `过去24小时${high ? `最高 ${high}℃` : ""}${high && low ? "、" : ""}${low ? `最低 ${low}℃` : ""}`
      : `over the past 24 hours ${high ? `the high was ${high}°C` : ""}${high && low ? " and " : ""}${low ? `the low was ${low}°C` : ""}`) : undefined,
    humidity ? (cjk ? `相对湿度最高 ${humidity}` : `relative humidity reached ${humidity}`) : undefined,
    aqi ? (cjk ? `AQI 最高 ${aqi}` : `AQI reached ${aqi}`) : undefined,
    airQuality && !aqi ? (cjk ? `空气质量 ${airQuality}` : `air quality is ${airQuality}`) : undefined,
    rain ? (cjk ? `过去24小时降水量 ${rain}` : `24-hour rainfall is ${rain}`) : undefined,
    wind ? (cjk ? `风力 ${wind}` : `wind ${wind}`) : undefined
  ].filter((item): item is string => Boolean(item));

  if (facts.length === 0) {
    return undefined;
  }
  const sources = webSearchSourceNames(records, 2);
  if (cjk) {
    return `${location ? `${location}天气` : "天气"}：${facts.slice(0, 6).join("，")}。${sources ? `来源：${sources}。` : ""}`;
  }
  return `${location ? `${location} weather` : "Weather"}: ${facts.slice(0, 6).join(", ")}.${sources ? ` Sources: ${sources}.` : ""}`;
}

function webSearchEvidenceItems(records: BrowserWebSearchProtocolRecord[]): Array<{ source: string; text: string; url: string }> {
  return records.flatMap((record) => record.results.map((result) => ({
    source: result.title || hostnameFromUrl(result.url) || record.engine,
    text: sanitizeWebSearchEvidenceText(result.content || result.snippet || ""),
    url: result.url
  }))).filter((item) => item.text);
}

function topWebSearchEvidenceSentences(records: BrowserWebSearchProtocolRecord[], query: string, limit: number): string[] {
  const terms = relevantSearchTerms(query);
  const scored = webSearchEvidenceItems(records).flatMap((item, itemIndex) => {
    const sentences = splitEvidenceSentences(item.text).slice(0, 12);
    return sentences.map((sentence, sentenceIndex) => {
      const normalizedSentence = normalizeSearchComparisonText(sentence);
      const termScore = terms.reduce((score, term) => score + (normalizedSentence.includes(term) ? 2 : 0), 0);
      const sourceBonus = itemIndex === 0 ? 2 : itemIndex === 1 ? 1 : 0;
      const positionBonus = Math.max(0, 4 - sentenceIndex) / 4;
      return {
        score: termScore + sourceBonus + positionBonus,
        sentence
      };
    });
  }).filter((item) => item.sentence.length >= 12 && item.sentence.length <= 260);
  scored.sort((left, right) => right.score - left.score || left.sentence.length - right.sentence.length);
  const seen = new Set<string>();
  return scored.flatMap((item) => {
    const key = normalizeSearchComparisonText(item.sentence).slice(0, 120);
    if (!key || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [item.sentence];
  }).slice(0, limit);
}

function splitEvidenceSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/[。！？!?]\s*|\n+/g)
    .map((sentence) => sentence.trim().replace(/[，,；;：:]\s*$/, ""))
    .filter((sentence) => sentence && !looksLikeNavigationText(sentence));
}

function looksLikeNavigationText(text: string): boolean {
  const punctuationCount = (text.match(/[，,。；;：:]/g) ?? []).length;
  const digitCount = (text.match(/\d/g) ?? []).length;
  return text.length > 160 && punctuationCount < 2 && digitCount < 2;
}

function relevantSearchTerms(query: string): string[] {
  const normalizedTerms = normalizeSearchComparisonText(query)
    .split(" ")
    .filter((term) => term.length >= 2);
  const cjkTerms = query.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  return uniqueStrings([...normalizedTerms, ...cjkTerms].map((term) => term.toLowerCase()));
}

function weatherTemperatureRange(text: string): string | undefined {
  const values = Array.from(text.matchAll(/(-?\d{1,2}(?:\.\d+)?)\s*℃/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > -80 && value < 60)
    .slice(0, 8);
  if (values.length === 0) {
    return undefined;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  return min === max ? `${format(min)}℃` : `${format(min)}-${format(max)}℃`;
}

function extractWeatherLocation(query: string): string | undefined {
  const cleaned = query
    .replace(/perform\s+a\s+web\s+search\s+for\s+the\s+query:\s*/i, "")
    .replace(/天气预报|天气|气温|温度|怎么样|如何|查询|搜索|今天|今日|现在|当前|请问|weather|forecast|temperature/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 24) {
    return undefined;
  }
  return cleaned;
}

function firstRegexGroup(text: string, patterns: Array<RegExp | undefined>): string | undefined {
  for (const pattern of patterns) {
    if (!pattern) {
      continue;
    }
    const match = pattern.exec(text);
    const value = match?.[1];
    if (value) {
      return value.trim();
    }
  }
  return undefined;
}

function sanitizeWebSearchEvidenceText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function containsCjkText(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

function webSearchSourceNames(records: BrowserWebSearchProtocolRecord[], limit: number): string {
  return uniqueStrings(records.flatMap((record) => record.results.map((result) => {
    const title = result.title?.trim();
    return title || hostnameFromUrl(result.url) || record.engine;
  }))).slice(0, limit).join("、");
}

function hostnameFromUrl(value: string): string | undefined {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function anthropicWebSearchProtocolBlocks(records: BrowserWebSearchProtocolRecord[], requestId: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  records.forEach((record, index) => {
    const toolUseId = `srvtoolu_${sanitizeAnthropicToolUseId(requestId)}_${index + 1}`;
    blocks.push({
      id: toolUseId,
      input: { query: record.query },
      name: "web_search",
      type: "server_tool_use"
    });
    blocks.push({
      content: record.results.map(anthropicWebSearchResultBlock),
      tool_use_id: toolUseId,
      type: "web_search_tool_result"
    });
  });
  return blocks;
}

function anthropicWebSearchResultBlock(result: BrowserWebSearchProtocolResult): Record<string, unknown> {
  const snippet = anthropicWebSearchResultSnippet(result);
  return {
    encrypted_content: "",
    ...(snippet ? { snippet: snippet.slice(0, 1_200) } : {}),
    title: result.title,
    type: "web_search_result",
    url: result.url
  };
}

function anthropicWebSearchResultSnippet(result: BrowserWebSearchProtocolResult): string | undefined {
  const parts = [
    result.snippet ? `Search snippet: ${sanitizeWebSearchEvidenceText(result.snippet)}` : "",
    result.content ? `Extracted page content: ${sanitizeWebSearchEvidenceText(result.content)}` : ""
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function sanitizeAnthropicToolUseId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || randomBytes(8).toString("hex");
}

type ParsedSseEvent = {
  data?: unknown;
  event?: string;
  raw?: string;
};

function parseSseEvents(body: string): ParsedSseEvent[] {
  return body
    .split(/\r?\n\r?\n/g)
    .filter((block) => block.trim())
    .map(parseSseEventBlock);
}

function parseSseEventBlock(raw: string): ParsedSseEvent {
  const lines = raw.split(/\r?\n/g);
  const event = lines
    .filter((line) => line.startsWith("event:"))
    .map((line) => line.slice(6).trim())
    .find(Boolean);
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data || data === "[DONE]") {
    return { event, raw };
  }
  try {
    return { data: JSON.parse(data) as unknown, event, raw };
  } catch {
    return { event, raw };
  }
}

function shiftSseContentBlockIndex(event: ParsedSseEvent, startIndex: number, delta: number): ParsedSseEvent {
  if (!isRecord(event.data) || !Number.isFinite(event.data.index) || Number(event.data.index) < startIndex) {
    return event;
  }
  return {
    ...event,
    data: {
      ...event.data,
      index: Number(event.data.index) + delta
    }
  };
}

function sseEventFromValue(data: Record<string, unknown>): ParsedSseEvent {
  return {
    data,
    event: stringValue(data.type)
  };
}

function serializeSseEvent(event: ParsedSseEvent): string {
  if (event.data === undefined) {
    return event.raw ?? "";
  }
  const type = isRecord(event.data) ? stringValue(event.data.type) : undefined;
  return [
    event.event || type ? `event: ${event.event || type}` : undefined,
    `data: ${JSON.stringify(event.data)}`
  ].filter(Boolean).join("\n");
}

function requestProtocolForPath(path: string): GatewayProviderProtocol | undefined {
  const normalized = path.toLowerCase();
  if (normalized === "/v1/messages" || normalized === "/messages" || normalized.endsWith("/v1/messages")) {
    return "anthropic_messages";
  }
  if (normalized === "/v1/chat/completions" || normalized === "/chat/completions" || normalized.endsWith("/chat/completions")) {
    return "openai_chat_completions";
  }
  if (normalized === "/v1/responses" || normalized === "/responses" || normalized.endsWith("/responses")) {
    return "openai_responses";
  }
  if (/\/v1(?:beta)?\/models\/[^/]+:(?:generatecontent|streamgeneratecontent)$/i.test(normalized)) {
    return "gemini_generate_content";
  }
  if (/\/v1(?:beta)?\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i.test(normalized)) {
    return "gemini_interactions";
  }
  return undefined;
}

function rewriteProviderHeader(
  headers: Record<string, string>,
  headerName: string,
  config: AppConfig,
  protocol: GatewayProviderProtocol
): void {
  const value = headers[headerName];
  if (!value) {
    return;
  }
  headers[headerName] = rewriteProviderSelectorForProtocol(value, config, protocol);
}

function rewriteProviderListHeader(
  headers: Record<string, string>,
  headerName: string,
  config: AppConfig,
  protocol: GatewayProviderProtocol
): void {
  const value = headers[headerName];
  if (!value) {
    return;
  }
  headers[headerName] = value
    .split(",")
    .map((item) => rewriteProviderSelectorForProtocol(item.trim(), config, protocol))
    .filter(Boolean)
    .join(",");
}

function rewriteProviderSelectorForProtocol(value: string, config: AppConfig, protocol: GatewayProviderProtocol): string {
  const provider = findProviderByPublicOrInternalName(config, value);
  const capability = provider ? providerCapabilityForClientProtocol(provider, protocol) : undefined;
  return provider && capability ? providerCapabilityInternalName(provider, capability.type) : value;
}

function rewriteFallbackForProtocol(fallback: RouterFallbackConfig, config: AppConfig, protocol: GatewayProviderProtocol): RouterFallbackConfig {
  const models = fallback.models.map((model) => rewriteModelSelectorForProtocol(model, config, protocol) ?? model);
  return models.every((model, index) => model === fallback.models[index])
    ? fallback
    : {
        ...fallback,
        models
      };
}

function rewriteBodyModelForProtocol(body: Buffer | undefined, config: AppConfig, protocol: GatewayProviderProtocol): Buffer | undefined {
  const parsedBody = parseJsonObjectSafe(body);
  if (!parsedBody) {
    return body;
  }
  const model = stringValue(parsedBody.model);
  const rewrittenModel = rewriteModelSelectorForProtocol(model, config, protocol);
  if (!rewrittenModel || rewrittenModel === model) {
    return body;
  }
  return Buffer.from(`${JSON.stringify({ ...parsedBody, model: rewrittenModel })}\n`, "utf8");
}

function clearTargetProviderHeadersForModelSelector(
  headers: Record<string, string>,
  config: AppConfig,
  body: Buffer | undefined,
  routedModel: string | undefined
): void {
  const parsedBody = parseJsonObjectSafe(body);
  const model = stringValue(parsedBody?.model) || routedModel;
  if (!resolveConfiguredProviderModelSelector(model, config)) {
    return;
  }

  delete headers["x-target-provider"];
  delete headers["x-target-providers"];
  delete headers["x-gateway-target-provider"];
}

function rewriteModelSelectorForProtocol(
  model: string | undefined,
  config: AppConfig,
  protocol: GatewayProviderProtocol
): string | undefined {
  const normalized = normalizeRouteSelector(model);
  if (!normalized) {
    return model;
  }
  const publicModel = resolveGatewayPublicModelId(normalized, config) ?? normalized;
  const selector =
    resolveConfiguredProviderModelSelector(publicModel, config) ??
    resolveUniqueConfiguredProviderModelSelector(publicModel, config);
  const capability = selector ? providerCapabilityForClientProtocol(selector.provider, protocol) : undefined;
  return selector && capability
    ? `${providerCapabilityInternalName(selector.provider, capability.type)}/${selector.model}`
    : publicModel;
}

function providerCapabilityForClientProtocol(
  provider: GatewayProviderConfig,
  clientProtocol: GatewayProviderProtocol
): GatewayProviderCapability | undefined {
  const capabilities = normalizedProviderCapabilities(provider);
  for (const protocol of providerProtocolPreferenceForClient(clientProtocol)) {
    const capability = capabilities.find((item) => item.type === protocol);
    if (capability) {
      return capability;
    }
  }
  return undefined;
}

function providerProtocolForClientProtocol(
  provider: GatewayProviderConfig,
  clientProtocol: GatewayProviderProtocol
): GatewayProviderProtocol | undefined {
  const capability = providerCapabilityForClientProtocol(provider, clientProtocol);
  if (capability) {
    return capability.type;
  }
  const directProtocol =
    normalizeProviderProtocol(provider.type) ??
    normalizeProviderProtocol(provider.provider) ??
    inferProtocol(provider);
  return providerProtocolPreferenceForClient(clientProtocol).includes(directProtocol)
    ? directProtocol
    : undefined;
}

function providerProtocolPreferenceForClient(clientProtocol: GatewayProviderProtocol): GatewayProviderProtocol[] {
  if (clientProtocol === "openai_responses") {
    return ["openai_responses", "openai_chat_completions", "anthropic_messages", "gemini_interactions"];
  }
  if (clientProtocol === "anthropic_messages") {
    return uniqueProviderProtocols([clientProtocol, ...gatewayProviderProtocolFallbackOrder]);
  }
  return [clientProtocol];
}

function uniqueProviderProtocols(protocols: GatewayProviderProtocol[]): GatewayProviderProtocol[] {
  const seen = new Set<GatewayProviderProtocol>();
  const output: GatewayProviderProtocol[] = [];
  for (const protocol of protocols) {
    if (seen.has(protocol)) {
      continue;
    }
    seen.add(protocol);
    output.push(protocol);
  }
  return output;
}

function findProviderByPublicOrInternalName(config: AppConfig, name: string): GatewayProviderConfig | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  const credentialInternalName = parseProviderCredentialInternalName(name);
  if (credentialInternalName) {
    const internalProviderId = credentialInternalName.providerId.toLowerCase();
    return config.Providers.find((provider) =>
      provider.name.trim().toLowerCase() === internalProviderId ||
      providerRuntimeId(provider).toLowerCase() === internalProviderId
    );
  }
  return config.Providers.find((provider) =>
    provider.name.trim().toLowerCase() === normalized ||
    provider.id?.trim().toLowerCase() === normalized ||
    provider.provider?.trim().toLowerCase() === normalized ||
    providerRuntimeId(provider).toLowerCase() === normalized ||
    normalizedProviderCapabilities(provider).some((capability) =>
      providerCapabilityNameMatches(provider, capability.type, normalized)
    )
  );
}

function rewriteCapabilityResponseHeaders(headers: Headers, config: AppConfig): Headers {
  const providerName = headers.get("x-gateway-target-provider-name")?.trim();
  if (!providerName) {
    return headers;
  }
  const credentialInternalName = parseProviderCredentialInternalName(providerName);
  if (credentialInternalName) {
    const provider = findProviderByPublicOrInternalName(config, credentialInternalName.providerId);
    if (!provider) {
      return headers;
    }
    const credential = findProviderCredentialBySlug(provider, credentialInternalName.credentialSlug);
    const rewritten = new Headers(headers);
    rewritten.set("x-gateway-target-provider-name", providerRuntimeId(provider));
    rewritten.set("x-ccr-provider-protocol", credentialInternalName.protocol);
    rewritten.set("x-ccr-provider-credential-provider", providerRuntimeId(provider));
    rewritten.set("x-ccr-provider-credential-id", providerCredentialSlug(credential ? providerCredentialRuntimeId(provider, credential) : credentialInternalName.credentialSlug));
    return rewritten;
  }
  const provider = findProviderByPublicOrInternalName(config, providerName);
  if (!provider) {
    return headers;
  }
  const capability = normalizedProviderCapabilities(provider).find((item) =>
    providerCapabilityNameMatches(provider, item.type, providerName)
  );
  const rewritten = new Headers(headers);
  rewritten.set("x-gateway-target-provider-name", providerRuntimeId(provider));
  if (capability) {
    rewritten.set("x-ccr-provider-protocol", capability.type);
  }
  return rewritten;
}

async function fetchUpstreamWithFallback(input: {
  body?: Buffer;
  config: AppConfig;
  coreAuthToken: string;
  fallback: RouterFallbackConfig;
  headers: Record<string, string>;
  method: string;
  path: string;
  routedModel?: string;
  signal?: AbortSignal;
  upstreamUrl: string;
}): Promise<UpstreamFetchResult> {
  const fallbackMode = input.fallback.mode;
  const attempts = buildUpstreamAttempts(input.fallback, input.method, input.body, input.routedModel);
  const failedAttempts: UpstreamFailedAttempt[] = [];

  for (let index = 0; index < attempts.length; index += 1) {
    if (input.signal?.aborted) {
      throw new UpstreamRequestError(abortSignalMessage(input.signal), {
        failedAttempts
      });
    }

    const attempt = prepareUpstreamCredentialAttempt({
      attempt: attempts[index],
      config: input.config,
      headers: input.headers,
      method: input.method,
      path: input.path
    });
    const hasNextAttempt = index < attempts.length - 1;

    try {
      const response = await fetchWithSystemProxy(input.upstreamUrl, {
        body: shouldSendBody(input.method) ? attempt.body?.toString("utf8") : undefined,
        headers: withCoreGatewayAuthHeader(omitLocalObservabilityHeaders(attempt.headers ?? input.headers), input.coreAuthToken),
        method: input.method,
        signal: input.signal
      });

      if (hasNextAttempt && shouldFallbackAfterStatus(response.status, fallbackMode)) {
        const delayMs = retryDelayAfterStatus(response.status, response, failedAttempts.length);
        failedAttempts.push({
          credentialChain: attempt.credentialChain,
          credentialIds: attempt.credentialIds,
          delayMs,
          model: attempt.model,
          statusCode: response.status
        });
        recordProviderCredentialOutcome(input.config, input.method, attempt, response.status, response.headers);
        await drainResponseBody(response);
        if (delayMs > 0) {
          await delay(delayMs);
        }
        continue;
      }

      return {
        attempt,
        failedAttempts,
        response
      };
    } catch (error) {
      const message = formatError(error);
      failedAttempts.push({
        credentialChain: attempt.credentialChain,
        credentialIds: attempt.credentialIds,
        delayMs: 0,
        error: message,
        model: attempt.model
      });
      if (input.signal?.aborted) {
        throw new UpstreamRequestError(abortSignalMessage(input.signal), {
          attempt,
          cause: error,
          failedAttempts
        });
      }
      if (hasNextAttempt) {
        continue;
      }
      throw new UpstreamRequestError(message, {
        attempt,
        cause: error,
        failedAttempts
      });
    }
  }

  throw new UpstreamRequestError("Gateway request failed before reaching an upstream provider.", {
    failedAttempts
  });
}

function prepareUpstreamCredentialAttempt(input: {
  attempt: UpstreamAttempt;
  config: AppConfig;
  headers: Record<string, string>;
  method: string;
  path: string;
}): UpstreamAttempt {
  const normalizedBody = normalizeConfiguredProviderModelBody(input.attempt.body, input.config);
  const target = resolveProviderCredentialRoutingTarget(input.config, input.headers, input.path, input.attempt.body);
  if (!target) {
    return {
      ...input.attempt,
      body: bodyHasConfiguredProviderModelSelector(input.attempt.body, input.config)
        ? input.attempt.body
        : normalizedBody?.body ?? input.attempt.body,
      headers: input.headers
    };
  }

  const credentials = activeProviderCredentials(target.provider);
  if (credentials.length === 0) {
    return {
      ...input.attempt,
      body: target.body ?? normalizedBody?.body ?? input.attempt.body,
      headers: input.headers
    };
  }

  const usage = estimateLimitUsage(input.method, input.attempt.body ?? Buffer.alloc(0));
  const selection = selectProviderCredentials(target.provider, target.protocol, credentials, usage);
  if (selection.credentials.length === 0) {
    return {
      ...input.attempt,
      body: target.body ?? normalizedBody?.body ?? input.attempt.body,
      headers: input.headers
    };
  }

  const headers: Record<string, string> = {
    ...input.headers,
    "x-target-providers": selection.credentials.map((candidate) => candidate.internalName).join(","),
    "x-ccr-logical-provider": providerRuntimeId(target.provider),
    "x-ccr-provider-credential-chain": selection.credentials.map((candidate) => candidate.credentialId).join(",")
  };
  delete headers["x-target-provider"];
  if (selection.saturated) {
    headers["x-ccr-provider-credential-saturated"] = "true";
  }

  return {
    ...input.attempt,
    body: target.body ?? normalizedBody?.body ?? input.attempt.body,
    credentialChain: selection.credentials.map((candidate) => candidate.internalName),
    credentialIds: selection.credentials.map((candidate) => candidate.credentialId),
    credentialProtocol: target.protocol,
    headers,
    logicalProvider: target.provider.name
  };
}

function normalizeConfiguredProviderModelBody(
  body: Buffer | undefined,
  config: AppConfig
): { body: Buffer; model: string } | undefined {
  const parsedBody = parseJsonObjectSafe(body);
  const model = stringValue(parsedBody?.model);
  const selector = resolveConfiguredProviderModelSelector(model, config);
  if (!parsedBody || !selector || selector.model === model) {
    return undefined;
  }
  return {
    body: serializeJsonBodyWithModel(parsedBody, selector.model),
    model: selector.model
  };
}

function bodyHasConfiguredProviderModelSelector(body: Buffer | undefined, config: AppConfig): boolean {
  const parsedBody = parseJsonObjectSafe(body);
  const model = stringValue(parsedBody?.model);
  return Boolean(resolveConfiguredProviderModelSelector(model, config));
}

function resolveProviderCredentialRoutingTarget(
  config: AppConfig,
  headers: Record<string, string>,
  path: string,
  body: Buffer | undefined
): { body?: Buffer; model?: string; provider: GatewayProviderConfig; protocol: GatewayProviderProtocol } | undefined {
  const protocol = requestProtocolForPath(path);
  if (!protocol) {
    return undefined;
  }

  const parsedBody = parseJsonObjectSafe(body);
  const bodyModel = stringValue(parsedBody?.model);
  const modelSelector = resolveConfiguredProviderModelSelector(bodyModel, config);
  if (modelSelector) {
    const provider = modelSelector.provider;
    const providerProtocol = provider ? providerProtocolForClientProtocol(provider, protocol) : undefined;
    if (provider && providerProtocol && activeProviderCredentials(provider).length > 0) {
      return {
        body: parsedBody ? serializeJsonBodyWithModel(parsedBody, modelSelector.model) : body,
        model: modelSelector.model,
        provider,
        protocol: providerProtocol
      };
    }
  }

  const targetProviderName = firstTargetProviderHeader(headers);
  if (!targetProviderName) {
    return undefined;
  }

  const provider = findProviderByPublicOrInternalName(config, targetProviderName);
  if (!provider || activeProviderCredentials(provider).length === 0) {
    return undefined;
  }
  const providerProtocol = providerProtocolForClientProtocol(provider, protocol);
  if (!providerProtocol) {
    return undefined;
  }
  const providerModel = resolveModelForProvider(bodyModel, provider);

  return {
    body: parsedBody && providerModel && providerModel !== bodyModel
      ? serializeJsonBodyWithModel(parsedBody, providerModel)
      : body,
    model: providerModel ?? bodyModel,
    provider,
    protocol: providerProtocol
  };
}

function resolveModelForProvider(
  value: string | undefined,
  provider: GatewayProviderConfig
): string | undefined {
  const normalized = normalizeRouteSelector(value);
  if (!normalized) {
    return undefined;
  }
  if (providerHasModel(provider, normalized)) {
    return normalized;
  }
  const parsed = parseProviderModelSelector(normalized);
  return parsed && providerHasModel(provider, parsed.model) ? parsed.model : undefined;
}

function providerHasModel(provider: GatewayProviderConfig, model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return Boolean(normalized) && provider.models.some((candidate) => candidate.trim().toLowerCase() === normalized);
}

function parseProviderModelSelector(value: string | undefined): { model: string; provider: string } | undefined {
  const normalized = normalizeRouteSelector(value);
  if (!normalized) {
    return undefined;
  }
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return undefined;
  }
  const provider = normalized.slice(0, separator).trim();
  const model = normalized.slice(separator + 1).trim();
  return provider && model ? { model, provider } : undefined;
}

function resolveConfiguredProviderModelSelector(
  value: string | undefined,
  config: AppConfig
): { model: string; provider: GatewayProviderConfig } | undefined {
  let current = normalizeRouteSelector(value);
  if (!current) {
    return undefined;
  }

  let selectedProvider: GatewayProviderConfig | undefined;
  for (let depth = 0; depth < 4; depth += 1) {
    const parsed = parseProviderModelSelector(current);
    if (!parsed) {
      break;
    }

    const provider = findProviderByPublicOrInternalName(config, parsed.provider);
    if (!provider) {
      break;
    }

    selectedProvider = provider;
    current = parsed.model;

    const nested = parseProviderModelSelector(current);
    if (!nested) {
      return current ? { model: current, provider } : undefined;
    }

    const nestedProvider = findProviderByPublicOrInternalName(config, nested.provider);
    if (!nestedProvider || providerRuntimeId(nestedProvider) !== providerRuntimeId(provider)) {
      return current ? { model: current, provider } : undefined;
    }
  }

  return selectedProvider && current ? { model: current, provider: selectedProvider } : undefined;
}

function resolveUniqueConfiguredProviderModelSelector(
  value: string | undefined,
  config: AppConfig
): { model: string; provider: GatewayProviderConfig } | undefined {
  const model = normalizeRouteSelector(value);
  if (!model) {
    return undefined;
  }

  const exactMatches = configuredProviderModelMatches(model, config, false);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    return undefined;
  }

  const caseInsensitiveMatches = configuredProviderModelMatches(model, config, true);
  return caseInsensitiveMatches.length === 1 ? caseInsensitiveMatches[0] : undefined;
}

function configuredProviderModelMatches(
  model: string,
  config: AppConfig,
  caseInsensitive: boolean
): Array<{ model: string; provider: GatewayProviderConfig }> {
  const normalized = caseInsensitive ? model.toLowerCase() : model;
  const matches: Array<{ model: string; provider: GatewayProviderConfig }> = [];
  for (const provider of config.Providers) {
    for (const candidate of provider.models) {
      const configuredModel = candidate.trim();
      if (!configuredModel) {
        continue;
      }
      const comparable = caseInsensitive ? configuredModel.toLowerCase() : configuredModel;
      if (comparable === normalized) {
        matches.push({ model: configuredModel, provider });
      }
    }
  }
  return matches;
}

function firstTargetProviderHeader(headers: Record<string, string>): string | undefined {
  const provider = headers["x-target-provider"] || headers["x-gateway-target-provider"];
  if (provider?.trim()) {
    return provider.trim();
  }
  const providers = headers["x-target-providers"];
  return providers
    ?.split(",")
    .map((item) => item.trim())
    .find(Boolean);
}

function activeProviderCredentials(provider: GatewayProviderConfig): ProviderCredentialConfig[] {
  return (provider.credentials ?? []).filter((credential) =>
    credential.enabled !== false &&
    Boolean(providerCredentialApiKey(credential))
  );
}

function selectProviderCredentials(
  provider: GatewayProviderConfig,
  protocol: GatewayProviderProtocol,
  credentials: ProviderCredentialConfig[],
  usage: ApiKeyLimitUsage
): { credentials: Array<{ credential: ProviderCredentialConfig; credentialId: string; internalName: string }>; saturated: boolean } {
  const candidates = credentials.map((credential, index) => {
    const providerIndex = provider.credentials?.indexOf(credential) ?? index;
    const limitState = providerCredentialLimitState(provider, credential, usage);
    const cooldown = readProviderCredentialCooldown(provider, credential);
    return {
      cooldown,
      credential,
      credentialId: providerCredentialSlug(providerCredentialRuntimeId(provider, credential, providerIndex)),
      index: providerIndex,
      internalName: providerCredentialInternalName(provider, protocol, credential),
      limitState,
      priority: providerCredentialPriority(credential, providerIndex),
      weight: Math.max(1, credential.weight ?? 1)
    };
  });
  const available = candidates.filter((candidate) => !candidate.cooldown && !candidate.limitState.blocked);
  const sorted = sortProviderCredentialCandidates(available.length > 0 ? available : candidates);
  return {
    credentials: sorted.map((candidate) => ({
      credential: candidate.credential,
      credentialId: candidate.credentialId,
      internalName: candidate.internalName
    })),
    saturated: available.length === 0 && candidates.length > 0
  };
}

function sortProviderCredentialCandidates<T extends {
  index: number;
  limitState: { utilization: number };
  priority: number;
  weight: number;
}>(candidates: T[]): T[] {
  const prioritySorted = [...candidates].sort((left, right) =>
    left.priority - right.priority ||
    left.limitState.utilization - right.limitState.utilization ||
    right.weight - left.weight ||
    left.index - right.index
  );
  const primaryPriority = prioritySorted[0]?.priority;
  const primaryCandidates = prioritySorted.filter((candidate) => candidate.priority === primaryPriority);
  const shouldSpillOver = primaryCandidates.length > 0 &&
    primaryCandidates.every((candidate) => candidate.limitState.utilization >= providerCredentialSpilloverThreshold);

  if (shouldSpillOver) {
    return prioritySorted.sort((left, right) =>
      left.limitState.utilization - right.limitState.utilization ||
      left.priority - right.priority ||
      right.weight - left.weight ||
      left.index - right.index
    );
  }

  return prioritySorted;
}

function providerCredentialPriority(credential: ProviderCredentialConfig, index: number): number {
  return Number.isFinite(credential.priority) ? Number(credential.priority) : index + 1;
}

function buildUpstreamAttempts(fallback: RouterFallbackConfig, method: string, body: Buffer | undefined, routedModel: string | undefined): UpstreamAttempt[] {
  const initialAttempt: UpstreamAttempt = {
    body,
    index: 0,
    model: normalizeRouteSelector(routedModel)
  };
  if (fallback.mode === "off" || !shouldSendBody(method)) {
    return [initialAttempt];
  }

  if (fallback.mode === "retry") {
    const retryCount = clampNumber(fallback.retryCount, 0, ROUTER_FALLBACK_MAX_RETRY_COUNT);
    return Array.from({ length: retryCount + 1 }, (_unused, index) => ({
      body,
      index,
      model: initialAttempt.model
    }));
  }

  const parsedBody = parseJsonObjectSafe(body);
  const currentModel = normalizeRouteSelector(stringValue(parsedBody?.model)) ?? initialAttempt.model;
  const configuredModels = uniqueStrings(
    fallback.models
      .map((model) => normalizeRouteSelector(model))
      .filter((model): model is string => Boolean(model))
  );
  const modelChain = uniqueStrings([currentModel, ...configuredModels].filter((model): model is string => Boolean(model)));
  if (modelChain.length === 0 || !parsedBody) {
    return [initialAttempt];
  }

  return modelChain.map((model, index) => ({
    body: serializeJsonBodyWithModel(parsedBody, model),
    index,
    model
  }));
}

function shouldFallbackAfterStatus(statusCode: number, mode: RouterFallbackMode): boolean {
  if (mode === "model-chain" && statusCode >= 400) {
    return true;
  }
  if (statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500) {
    return true;
  }
  return false;
}

function retryDelayAfterStatus(statusCode: number, response: Response, failedAttemptIndex: number): number {
  if (statusCode !== 429) {
    return 0;
  }
  const retryAfterMs = parseRetryAfterHeaderMs(response.headers.get("retry-after"));
  if (retryAfterMs !== undefined) {
    return clampNumber(retryAfterMs, 0, upstreamRetryAfterMaxMs);
  }
  return exponentialRetryBackoffMs(failedAttemptIndex);
}

function parseRetryAfterHeaderMs(value: string | null): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : undefined;
}

function exponentialRetryBackoffMs(failedAttemptIndex: number): number {
  const exponent = Math.min(10, Math.max(0, failedAttemptIndex));
  return Math.min(upstreamRetryBackoffMaxMs, upstreamRetryBackoffBaseMs * 2 ** exponent);
}

async function drainResponseBody(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    // The failed attempt is already being skipped; body drain errors should not block the next attempt.
  }
}

function parseJsonObjectSafe(buffer: Buffer | undefined): Record<string, unknown> | undefined {
  if (!buffer || buffer.byteLength === 0) {
    return undefined;
  }
  try {
    return parseJsonObject(buffer);
  } catch {
    return undefined;
  }
}

function serializeJsonBodyWithModel(body: Record<string, unknown>, model: string): Buffer {
  return Buffer.from(`${JSON.stringify({ ...body, model })}\n`, "utf8");
}

function mergeFallbackResponseHeaders(headers: Headers, result: UpstreamFetchResult): Headers {
  const credentialIds = result.attempt.credentialIds ?? [];
  const credentialSaturated = result.attempt.headers?.["x-ccr-provider-credential-saturated"] === "true";
  if (result.failedAttempts.length === 0 && credentialIds.length === 0 && !credentialSaturated) {
    return headers;
  }

  const merged = new Headers(headers);
  if (result.failedAttempts.length > 0) {
    merged.set("x-ccr-fallback-attempts", String(result.failedAttempts.length + 1));
    merged.set("x-ccr-fallback-failures", formatFallbackFailures(result.failedAttempts));
    if (result.failedAttempts.some((attempt) => (attempt.delayMs ?? 0) > 0)) {
      merged.set("x-ccr-fallback-delays-ms", formatFallbackDelays(result.failedAttempts));
    }
    if (result.attempt.model) {
      merged.set("x-ccr-fallback-model", sanitizeHeaderValue(result.attempt.model));
    }
  }
  if (credentialIds.length) {
    merged.set("x-ccr-provider-credential-chain", credentialIds.join(","));
  }
  if (credentialSaturated) {
    merged.set("x-ccr-provider-credential-saturated", "true");
  }
  return merged;
}

function upstreamResponseHeaders(result: UpstreamFetchResult): Headers {
  return result.response.headers;
}

function formatFallbackFailures(failedAttempts: UpstreamFailedAttempt[]): string {
  return failedAttempts
    .map((attempt) => attempt.statusCode ? String(attempt.statusCode) : attempt.error ? "network" : "failed")
    .join(",");
}

function formatFallbackDelays(failedAttempts: UpstreamFailedAttempt[]): string {
  return failedAttempts
    .map((attempt) => String(Math.max(0, attempt.delayMs ?? 0)))
    .join(",");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(Number.isFinite(value) ? value : min)));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = value?.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

function spawnGatewayProcess(config: AppConfig, upstreamProxyUrl: string | undefined, runtimeId: string, coreAuthToken: string): ChildProcess {
  const gatewayEntry = resolveGatewayEntry();
  const proxyPreloadFile = upstreamProxyUrl ? writeGatewayProxyPreloadFile(config, upstreamProxyUrl) : undefined;
  const env = createGatewayProcessEnv(config, upstreamProxyUrl, runtimeId, coreAuthToken);
  const args = proxyPreloadFile ? ["--require", proxyPreloadFile, gatewayEntry] : [gatewayEntry];
  return spawn(process.execPath, args, {
    cwd: dirname(config.gateway.generatedConfigFile),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function resolveGatewayEntry(): string {
  const override = process.env[gatewayEntryOverrideEnv]?.trim();
  if (override) {
    const entry = pathResolve(override);
    if (!existsSync(entry)) {
      throw new Error(`${gatewayEntryOverrideEnv} points to a missing gateway entry: ${entry}`);
    }
    return entry;
  }

  for (const packageName of gatewayPackageCandidates) {
    try {
      return requireFromHere.resolve(packageName);
    } catch {
      // Try the next known package name.
    }
  }
  return requireFromHere.resolve(gatewayPackageCandidates[0]);
}

function createGatewayProcessEnv(config: AppConfig, upstreamProxyUrl: string | undefined, runtimeId: string, coreAuthToken: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AUTH_ENABLED: "true",
    AUTH_MODE: "static_api_key",
    AUTH_REQUIRED: "true",
    AUTH_STATIC_API_KEY_BEARER_ONLY: "false",
    AUTH_STATIC_API_KEY_ENV: coreGatewayAuthTokenEnv,
    AUTH_STATIC_API_KEY_HEADER: coreGatewayAuthHeader,
    CCR_GATEWAY_RUNTIME_ID: runtimeId,
    [coreGatewayAuthTokenEnv]: coreAuthToken,
    ELECTRON_RUN_AS_NODE: "1",
    GATEWAY_CONFIG_PATH: config.gateway.generatedConfigFile,
    HOST: config.gateway.coreHost,
    PORT: String(config.gateway.corePort)
  };

  const noProxy = mergeNoProxy(env.NO_PROXY || env.no_proxy, [
    "127.0.0.1",
    "localhost",
    "::1",
    config.gateway.host,
    config.gateway.coreHost
  ]);
  env.NO_PROXY = noProxy;
  env.no_proxy = noProxy;

  if (!upstreamProxyUrl) {
    return env;
  }

  env.HTTP_PROXY = upstreamProxyUrl;
  env.HTTPS_PROXY = upstreamProxyUrl;
  env.ALL_PROXY = upstreamProxyUrl;
  env.http_proxy = upstreamProxyUrl;
  env.https_proxy = upstreamProxyUrl;
  env.all_proxy = upstreamProxyUrl;
  env.CCR_UPSTREAM_PROXY_URL = upstreamProxyUrl;
  env.CCR_UNDICI_MODULE = requireFromHere.resolve("undici");
  return env;
}

function writeGatewayProxyPreloadFile(config: AppConfig, upstreamProxyUrl: string): string {
  const file = pathJoin(dirname(config.gateway.generatedConfigFile), "gateway-proxy-preload.cjs");
  writeFileSync(
    file,
    [
      "\"use strict\";",
      "const up = process.env.CCR_UPSTREAM_PROXY_URL;",
      "const um = process.env.CCR_UNDICI_MODULE;",
      "if (up && um) {",
      "  const { ProxyAgent } = require(um);",
      "  const agent = new ProxyAgent(up);",
      "  const realFetch = globalThis.fetch.bind(globalThis);",
      "  const raw = (process.env.NO_PROXY || process.env.no_proxy || '').toLowerCase();",
      "  const byp = raw.split(',').map((s) => s.trim()).filter(Boolean);",
      "  const norm = (h) => h.replace(/^\\[/, '').replace(/\\]$/, '').replace(/\\.$/, '');",
      "  const isLP = (h) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '0.0.0.0' || h.startsWith('127.');",
      "  const shouldBypass = (input) => {",
      "    let h;",
      "    try {",
      "      const u = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input && input.url ? input.url : String(input));",
      "      h = norm(u.hostname);",
      "    } catch { return true; }",
      "    if (!h) return false;",
      "    if (isLP(h)) return true;",
      "    return byp.some((p) => {",
      "      if (p === '*') return true;",
      "      const s = p.split(':');",
      "      const ph = norm(s[0]);",
      "      if (s.length === 2 && s[1]) {",
      "        if (h !== ph) return false;",
      "        try { return new URL(input).port === s[1]; } catch { return false; }",
      "      }",
      "      if (ph.startsWith('*.')) return h.endsWith(ph.slice(1));",
      "      if (ph.startsWith('.')) return h.endsWith(ph) || h === ph.slice(1);",
      "      return h === ph;",
      "    });",
      "  };",
      "  const patched = function(input, init) {",
      "    if (init && init.dispatcher) return realFetch(input, init);",
      "    if (shouldBypass(input)) return realFetch(input, init);",
      "    return realFetch(input, Object.assign({}, init, { dispatcher: agent }));",
      "  };",
      "  if (Object.getOwnPropertyDescriptor(globalThis, 'fetch')?.writable) {",
      "    globalThis.fetch = patched;",
      "  }",
      "}"
    ].join("\n"),
    "utf8"
  );
  return file;
}

function mergeNoProxy(current: string | undefined, values: string[]): string {
  const merged = new Set<string>();
  for (const value of [...(current || "").split(","), ...values]) {
    const trimmed = value.trim();
    if (trimmed) {
      merged.add(trimmed);
    }
  }
  return [...merged].join(",");
}

function toCoreGatewayProviders(provider: GatewayProviderConfig): CoreGatewayProvider[] {
  const capabilities = normalizedProviderCapabilities(provider);
  if (capabilities.length === 0) {
    return toCoreGatewayProvidersForCapability(provider);
  }

  return capabilities
    .flatMap((capability) => toCoreGatewayProvidersForCapability(provider, capability))
    .filter((item): item is CoreGatewayProvider => Boolean(item));
}

function toCoreGatewayProvidersForCapability(
  provider: GatewayProviderConfig,
  capability?: GatewayProviderCapability
): CoreGatewayProvider[] {
  const credentials = activeProviderCredentials(provider);
  if (credentials.length === 0) {
    const coreProvider = toCoreGatewayProvider(provider, capability);
    return coreProvider ? [coreProvider] : [];
  }

  return sortProviderCredentialsForConfig(credentials)
    .map((credential) => toCoreGatewayProvider(provider, capability, credential))
    .filter((item): item is CoreGatewayProvider => Boolean(item));
}

function toCoreGatewayProvider(
  provider: GatewayProviderConfig,
  capability?: GatewayProviderCapability,
  credential?: ProviderCredentialConfig
): CoreGatewayProvider | undefined {
  const type =
    capability?.type ??
    normalizeProviderProtocol(provider.type) ??
    normalizeProviderProtocol(provider.provider) ??
    inferProtocol(provider);
  const baseurl = normalizeProviderRuntimeBaseUrl(capability?.baseUrl ?? readBaseUrl(provider), type);
  const apikey = credential ? providerCredentialApiKey(credential) : provider.apikey || provider.apiKey || provider.api_key;

  if (!provider.name || provider.models.length === 0) {
    return undefined;
  }
  const safetyIssue = providerApiKeySafetyIssue({
    apiKey: apikey,
    baseUrl: baseurl ?? "",
    name: provider.name
  });
  if (safetyIssue) {
    throw new Error(safetyIssue.message);
  }

  return {
    apikey,
    baseurl,
    billing: provider.billing,
    extraBody: provider.extraBody,
    extraHeaders: provider.extraHeaders,
    models: provider.models,
    name: credential
      ? providerCredentialInternalName(provider, type, credential)
      : capability
        ? providerCapabilityInternalName(provider, type)
        : providerRuntimeId(provider),
    type
  };
}

function sortProviderCredentialsForConfig(credentials: ProviderCredentialConfig[]): ProviderCredentialConfig[] {
  return [...credentials].sort((left, right) =>
    providerCredentialPriority(left, 0) - providerCredentialPriority(right, 0) ||
    providerCredentialSortKey(left).localeCompare(providerCredentialSortKey(right))
  );
}

function normalizedProviderCapabilities(provider: GatewayProviderConfig): GatewayProviderCapability[] {
  const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  const normalized: GatewayProviderCapability[] = [];
  const byProtocol = new Map<GatewayProviderProtocol, GatewayProviderCapability>();
  for (const capability of capabilities) {
    const type = normalizeProviderProtocol(capability.type);
    const baseUrl = capability.baseUrl?.trim();
    if (!type || !baseUrl) {
      continue;
    }
    const item = {
      ...capability,
      baseUrl,
      type
    };
    const existing = byProtocol.get(type);
    if (!existing || providerCapabilityPriority(item) < providerCapabilityPriority(existing)) {
      byProtocol.set(type, item);
    }
  }
  for (const capability of capabilities) {
    const type = normalizeProviderProtocol(capability.type);
    const selected = type ? byProtocol.get(type) : undefined;
    if (selected && !normalized.includes(selected)) {
      normalized.push(selected);
    }
  }
  return applyPresetProtocolLock(provider, normalized);
}

function applyPresetProtocolLock(
  provider: GatewayProviderConfig,
  capabilities: GatewayProviderCapability[]
): GatewayProviderCapability[] {
  const lockedProtocols = lockedProviderPresetProtocols(provider, capabilities);
  if (lockedProtocols.length === 0) {
    return capabilities;
  }

  const lockedProtocolSet = new Set(lockedProtocols);
  const lockedCapabilities = capabilities.filter((capability) => lockedProtocolSet.has(capability.type));
  if (lockedCapabilities.length > 0) {
    return lockedCapabilities;
  }

  const lockedProtocol = lockedProtocols[0];
  const baseUrl = readBaseUrl(provider);
  const normalizedBaseUrl = normalizeProviderRuntimeBaseUrl(baseUrl, lockedProtocol);
  return normalizedBaseUrl
    ? [{ baseUrl: normalizedBaseUrl, source: "preset", type: lockedProtocol }]
    : [];
}

function lockedProviderPresetProtocols(
  provider: GatewayProviderConfig,
  capabilities: GatewayProviderCapability[]
): GatewayProviderProtocol[] {
  const baseUrls = [
    readBaseUrl(provider),
    ...capabilities.map((capability) => capability.baseUrl)
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const baseUrl of baseUrls) {
    if (findProviderPresetByBaseUrl(baseUrl)?.id === "gemini") {
      return ["gemini_generate_content", "gemini_interactions"];
    }
  }

  return [];
}

function providerCapabilityPriority(capability: GatewayProviderCapability): number {
  if (capability.source === "preset") {
    return 0;
  }
  if (capability.source === "detected") {
    return 2;
  }
  return 1;
}

function providerCapabilityInternalName(provider: GatewayProviderConfig, protocol: GatewayProviderProtocol): string {
  return `${providerRuntimeId(provider)}::${protocol}`;
}

function providerCapabilityLegacyInternalName(providerName: string, protocol: GatewayProviderProtocol): string {
  return `${providerName}::${protocol}`;
}

function providerCapabilityNameMatches(provider: GatewayProviderConfig, protocol: GatewayProviderProtocol, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return providerCapabilityInternalName(provider, protocol).toLowerCase() === normalized ||
    providerCapabilityLegacyInternalName(provider.name, protocol).toLowerCase() === normalized;
}

function providerRuntimeId(provider: GatewayProviderConfig): string {
  const explicit = sanitizeProviderHeaderId(provider.id);
  if (explicit) {
    return explicit;
  }
  const normalized = provider.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const hash = createHash("sha256").update(`${provider.name}\n${readBaseUrl(provider) ?? ""}`).digest("hex").slice(0, 10);
  return `provider-${normalized || "provider"}-${hash}`;
}

function sanitizeProviderHeaderId(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || undefined;
}

function sanitizeHeaderValue(value: unknown): string {
  // HTTP header values must be ByteString (code point <= 255). Values derived
  // from user-facing names — model selectors like "小米mimo/...", provider
  // names, route reasons — can contain non-ASCII characters that crash Node's
  // fetch/undici with "Cannot convert argument to a ByteString" (surfaced as
  // 502). Normalize to ASCII while preserving case and printable punctuation.
  const text = typeof value === "string" && value.trim() ? value : "unknown";
  const sanitized = text
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}

function providerCredentialInternalName(
  provider: GatewayProviderConfig,
  protocol: GatewayProviderProtocol,
  credential: ProviderCredentialConfig
): string {
  return `${providerCapabilityInternalName(provider, protocol)}::cred:${providerCredentialSlug(providerCredentialRuntimeId(provider, credential))}`;
}

function parseProviderCredentialInternalName(value: string | undefined): {
  credentialSlug: string;
  providerId: string;
  protocol: GatewayProviderProtocol;
} | undefined {
  const marker = "::cred:";
  const markerIndex = value?.lastIndexOf(marker) ?? -1;
  if (!value || markerIndex <= 0) {
    return undefined;
  }
  const baseName = value.slice(0, markerIndex);
  const credentialSlug = value.slice(markerIndex + marker.length).trim();
  const protocolSeparator = baseName.lastIndexOf("::");
  if (!credentialSlug || protocolSeparator <= 0) {
    return undefined;
  }
  const protocol = normalizeProviderProtocol(baseName.slice(protocolSeparator + 2));
  const providerId = baseName.slice(0, protocolSeparator).trim();
  return protocol && providerId ? { credentialSlug, providerId, protocol } : undefined;
}

function providerCredentialSlug(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "key";
}

function providerCredentialRuntimeId(
  provider: GatewayProviderConfig,
  credential: ProviderCredentialConfig,
  index = provider.credentials?.indexOf(credential) ?? -1
): string {
  const explicitId = credential.id?.trim();
  if (explicitId) {
    return explicitId;
  }
  const oneBasedIndex = index >= 0 ? index + 1 : 1;
  const label = credential.name?.trim() || credential.label?.trim();
  return label ? `${providerCredentialSlug(label)}-${oneBasedIndex}` : `key-${oneBasedIndex}`;
}

function providerCredentialSortKey(credential: ProviderCredentialConfig): string {
  return providerCredentialSlug(credential.id || credential.name || credential.label);
}

function providerCredentialApiKey(credential: ProviderCredentialConfig): string {
  return credential.api_key || credential.apiKey || credential.apikey || "";
}

function findProviderCredentialByRuntimeId(
  provider: GatewayProviderConfig,
  credentialId: string
): ProviderCredentialConfig | undefined {
  const normalizedId = credentialId.trim();
  const normalizedSlug = providerCredentialSlug(normalizedId);
  return (provider.credentials ?? []).find((credential, index) => {
    const runtimeId = providerCredentialRuntimeId(provider, credential, index);
    return runtimeId === normalizedId || providerCredentialSlug(runtimeId) === normalizedSlug || credential.id?.trim() === normalizedId;
  });
}

function findProviderCredentialBySlug(
  provider: GatewayProviderConfig,
  credentialSlug: string
): ProviderCredentialConfig | undefined {
  const normalizedSlug = providerCredentialSlug(credentialSlug);
  return (provider.credentials ?? []).find((credential, index) => providerCredentialSlug(providerCredentialRuntimeId(provider, credential, index)) === normalizedSlug);
}

function normalizeProviderProtocol(value: unknown): GatewayProviderProtocol | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai" || normalized === "openai_responses") {
    return "openai_responses";
  }
  if (normalized === "openai_chat" || normalized === "openai_chat_completions") {
    return "openai_chat_completions";
  }
  if (normalized === "anthropic" || normalized === "anthropic_messages") {
    return "anthropic_messages";
  }
  if (normalized === "gemini" || normalized === "gemini_generate_content") {
    return "gemini_generate_content";
  }
  if (
    normalized === "gemini_interactions" ||
    normalized === "gemini-interactions" ||
    normalized === "google_interactions" ||
    normalized === "google-interactions" ||
    normalized === "interactions" ||
    normalized === "interaction"
  ) {
    return "gemini_interactions";
  }
  return undefined;
}

function inferProtocol(provider: GatewayProviderConfig): GatewayProviderProtocol {
  const url = readBaseUrl(provider)?.toLowerCase() ?? "";
  const transformerNames = JSON.stringify(provider.transformer ?? "").toLowerCase();
  if (url.includes("/interactions") || transformerNames.includes("gemini_interactions")) {
    return "gemini_interactions";
  }
  if (url.includes("generativelanguage.googleapis.com") || transformerNames.includes("gemini")) {
    return "gemini_generate_content";
  }
  if (url.includes("anthropic") || transformerNames.includes("anthropic")) {
    return "anthropic_messages";
  }
  return "openai_chat_completions";
}

function resolveResponseProviderProtocol(headers: Headers, config: AppConfig | undefined): GatewayProviderProtocol | undefined {
  const ccrProtocol = normalizeProviderProtocol(headers.get("x-ccr-provider-protocol"));
  if (ccrProtocol) {
    return ccrProtocol;
  }
  const providerName =
    headers.get("x-gateway-target-provider-name")?.trim() ||
    headers.get("x-gateway-target-provider")?.trim();
  if (!providerName) {
    return undefined;
  }
  const credentialInternalName = parseProviderCredentialInternalName(providerName);
  if (credentialInternalName) {
    return credentialInternalName.protocol;
  }
  const provider = config ? findProviderByPublicOrInternalName(config, providerName) : undefined;
  if (!provider) {
    return normalizeProviderProtocol(providerName);
  }
  const capability = normalizedProviderCapabilities(provider).find((item) =>
    providerCapabilityNameMatches(provider, item.type, providerName)
  );
  if (capability) {
    return capability.type;
  }
  return normalizeProviderProtocol(provider.type) ?? normalizeProviderProtocol(provider.provider) ?? inferProtocol(provider);
}

function resolveProviderLogName(headers: Headers, config: AppConfig | undefined, fallbackModel?: string): string | undefined {
  const providerSelector =
    headers.get("x-gateway-target-provider-name")?.trim() ||
    headers.get("x-gateway-target-provider")?.trim();
  const headerProvider = providerSelector && config
    ? findProviderByPublicOrInternalName(config, providerSelector)
    : undefined;
  if (headerProvider) {
    return headerProvider.name;
  }

  const routeProvider = parseProviderModelSelector(fallbackModel)?.provider;
  const modelProvider = routeProvider && config
    ? findProviderByPublicOrInternalName(config, routeProvider)
    : undefined;
  return modelProvider?.name;
}

function providerMatchesName(provider: GatewayProviderConfig, name: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  return [provider.id, provider.name, provider.provider]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .some((value) => value.trim().toLowerCase() === normalizedName);
}

function normalizeProviderRuntimeBaseUrl(value: string | undefined, type: GatewayProviderProtocol): string | undefined {
  if (!value) {
    return undefined;
  }
  return normalizeProviderBaseUrlInput(value, type) || undefined;
}

function readBaseUrl(provider: GatewayProviderConfig): string | undefined {
  return provider.baseurl || provider.baseUrl || provider.api_base_url;
}

function endpoint(host: string, port: number): string {
  const endpointHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return `http://${endpointHost}:${port}`;
}

function gatewayNetworkEndpoints(host: string, port: number): GatewayNetworkEndpoint[] {
  const normalizedHost = normalizeBindHost(host);
  const lanAddresses = physicalLanAddresses();
  const addresses = isWildcardBindHost(normalizedHost)
    ? lanAddresses
    : lanAddresses.filter((entry) => entry.address === normalizedHost);

  return addresses.map((entry) => ({
    address: entry.address,
    endpoint: endpoint(entry.address, port),
    interfaceName: entry.interfaceName
  }));
}

function physicalLanAddresses(): Array<{ address: string; interfaceName: string }> {
  const seen = new Set<string>();
  const result: Array<{ address: string; interfaceName: string }> = [];

  for (const [interfaceName, entries] of Object.entries(networkInterfaces())) {
    if (!entries || isVirtualNetworkInterface(interfaceName)) {
      continue;
    }

    for (const entry of entries) {
      if (entry.internal || entry.family !== "IPv4" || !isPrivateIpv4(entry.address)) {
        continue;
      }

      const key = `${interfaceName}:${entry.address}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push({ address: entry.address, interfaceName });
    }
  }

  return result.sort((left, right) =>
    left.interfaceName.localeCompare(right.interfaceName) ||
    left.address.localeCompare(right.address, undefined, { numeric: true })
  );
}

function normalizeBindHost(host: string): string {
  return host.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function isLoopbackBindHost(host: string): boolean {
  const normalized = normalizeBindHost(host).replace(/\.$/, "");
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}

function isWildcardBindHost(host: string): boolean {
  return host === "" || host === "0.0.0.0" || host === "::" || host === "::0";
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function isVirtualNetworkInterface(interfaceName: string): boolean {
  const normalized = interfaceName.toLowerCase();
  return [
    /^lo\d*$/,
    /^awdl\d*$/,
    /^llw\d*$/,
    /^utun\d*$/,
    /^gif\d*$/,
    /^stf\d*$/,
    /^bridge\d*$/,
    /^br-/,
    /^docker/,
    /^veth/,
    /^vmnet/,
    /^vbox/,
    /^tun\d*$/,
    /^tap\d*$/,
    /^wg\d*$/,
    /\bloopback\b/,
    /\bvirtual\b/,
    /\bvirtualbox\b/,
    /\bvmware\b/,
    /\bhyper-v\b/,
    /\bvethernet\b/,
    /\bwsl\b/,
    /\btunnel\b/,
    /\btailscale\b/,
    /\bzerotier\b/,
    /\bwireguard\b/,
    /\bhamachi\b/,
    /\bparallels\b/,
    /\bvpn\b/
  ].some((pattern) => pattern.test(normalized));
}

async function stopPreviousManagedCoreGateway(config: AppConfig, coreEndpoint: string): Promise<void> {
  const marker = readManagedCoreGatewayMarker(config);
  const markerRuntimeId = stringValue(marker?.runtimeId);
  const pid = numberValue(marker?.pid);
  if (!markerRuntimeId || !pid) {
    return;
  }

  const health = await readCoreGatewayHealth(coreEndpoint);
  if (health?.runtimeId !== markerRuntimeId) {
    return;
  }

  if (!isProcessAlive(pid)) {
    removeManagedCoreGatewayMarker(config);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    removeManagedCoreGatewayMarker(config);
    return;
  }

  if (await waitForCoreGatewayStop(coreEndpoint)) {
    removeManagedCoreGatewayMarker(config);
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process may have exited between the health check and SIGKILL.
  }
  await waitForCoreGatewayStop(coreEndpoint);
  removeManagedCoreGatewayMarker(config);
}

function readManagedCoreGatewayMarker(config: AppConfig): ManagedGatewayRuntimeMarker | undefined {
  const file = managedCoreGatewayMarkerPath(config);
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeManagedCoreGatewayMarker(config: AppConfig, child: ChildProcess, runtimeId: string): void {
  if (!child.pid) {
    return;
  }
  try {
    writeFileSync(
      managedCoreGatewayMarkerPath(config),
      `${JSON.stringify(
        {
          generatedConfigFile: config.gateway.generatedConfigFile,
          gatewayEntry: resolveGatewayEntry(),
          pid: child.pid,
          runtimeId,
          startedAt: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  } catch (error) {
    console.warn(`[gateway] Failed to write gateway runtime marker: ${formatError(error)}`);
  }
}

function removeManagedCoreGatewayMarker(config: AppConfig | undefined): void {
  if (!config) {
    return;
  }
  try {
    rmSync(managedCoreGatewayMarkerPath(config), { force: true });
  } catch (error) {
    console.warn(`[gateway] Failed to remove gateway runtime marker: ${formatError(error)}`);
  }
}

function managedCoreGatewayMarkerPath(config: AppConfig): string {
  return pathJoin(dirname(config.gateway.generatedConfigFile), gatewayRuntimeMarkerFile);
}

async function waitForCoreGatewayStop(coreEndpoint: string): Promise<boolean> {
  for (let index = 0; index < 20; index += 1) {
    if (!(await isCoreGatewayHealthy(coreEndpoint))) {
      return true;
    }
    await delay(100);
  }
  return false;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertLoopbackCoreHost(host: string): void {
  const error = loopbackCoreHostError(host);
  if (error) {
    throw new Error(error);
  }
}

function loopbackCoreHostError(host: string): string | undefined {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1"
    ? undefined
    : "Core gateway host must be 127.0.0.1 or ::1.";
}

function generateCoreGatewayAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

async function isCoreGatewayHealthy(coreEndpoint: string): Promise<boolean> {
  const health = await readCoreGatewayHealth(coreEndpoint);
  return health?.status === "ok";
}

async function readCoreGatewayHealth(coreEndpoint: string): Promise<CoreGatewayHealth | undefined> {
  if (!coreEndpoint) {
    return undefined;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    const healthUrl = new URL("/health", coreEndpoint);
    const response = await fetchWithSystemProxy(healthUrl, { signal: controller.signal });
    if (!response.ok) {
      return undefined;
    }
    const body = await response.json().catch(() => undefined);
    if (!isRecord(body)) {
      return undefined;
    }
    return {
      runtimeId: stringValue(body.runtimeId),
      status: stringValue(body.status)
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function shouldRunUnifiedServer(config: AppConfig): boolean {
  return config.gateway.enabled || config.proxy.enabled;
}

function shouldRunGatewayRuntime(config: AppConfig): boolean {
  return config.gateway.enabled || (config.proxy.enabled && config.proxy.mode === "gateway");
}

function shouldServeGatewayRequest(config: AppConfig, request: IncomingMessage): boolean {
  if (config.gateway.enabled) {
    return true;
  }
  return config.proxy.enabled && config.proxy.mode === "gateway" && readHeader(request.headers["x-ccr-proxy-mode"]) === "gateway";
}

function applyCors(response: ServerResponse, config?: AppConfig): void {
  const origin = config ? endpoint(config.gateway.host, config.gateway.port) : "*";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, Last-Event-ID, Anthropic-Version, Anthropic-Beta, Mcp-Session-Id, MCP-Protocol-Version");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

async function authorize(request: IncomingMessage, response: ServerResponse, config: AppConfig): Promise<ApiKeyAuthorizationResult> {
  let apiKeys = await configuredApiKeys(config);
  if (apiKeys.length === 0) {
    sendJson(response, 403, {
      error: {
        message: "CCR API key is not initialized. Save a gateway API key or restart CCR to generate one."
      }
    });
    return { ok: false };
  }

  const token = readAuthToken(request.headers) || readRemoteControlQueryAuthToken(request);
  let apiKey = token ? apiKeys.find((item) => item.key === token) : undefined;
  if (!apiKey && token) {
    apiKeys = await configuredApiKeys(config, { refresh: true });
    apiKey = apiKeys.find((item) => item.key === token);
  }
  if (apiKey) {
    if (isApiKeyExpired(apiKey)) {
      sendJson(response, 401, { error: { message: "API key is expired." } });
      return { ok: false };
    }
    return { ok: true, apiKey };
  }

  sendJson(response, 401, { error: { message: token ? "Invalid API key." : "API key is missing." } });
  return { ok: false };
}

async function configuredApiKeys(config: AppConfig, options: { refresh?: boolean } = {}): Promise<ApiKeyConfig[]> {
  const persistedApiKeys = await loadPersistedApiKeysCached(options);
  const values = [
    ...persistedApiKeys,
    ...(Array.isArray(config.APIKEYS) ? config.APIKEYS : []),
    ...(config.APIKEY ? [{ createdAt: new Date(0).toISOString(), id: "legacy", key: config.APIKEY }] : [])
  ];
  const seen = new Set<string>();
  const result: ApiKeyConfig[] = [];
  for (const value of values) {
    const key = value?.key?.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...value, key });
  }
  return result;
}

async function loadPersistedApiKeysCached(options: { refresh?: boolean } = {}): Promise<ApiKeyConfig[]> {
  const now = Date.now();
  if (!options.refresh && persistedApiKeyCache && now - persistedApiKeyCache.loadedAt < persistedApiKeyCacheTtlMs) {
    return persistedApiKeyCache.values;
  }
  try {
    const values = await loadPersistedApiKeys();
    persistedApiKeyCache = {
      loadedAt: now,
      values
    };
    return values;
  } catch (error) {
    console.warn(`[gateway] Failed to load persisted API keys: ${formatError(error)}`);
    return [];
  }
}

function isApiKeyExpired(apiKey: ApiKeyConfig): boolean {
  if (!apiKey.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(apiKey.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function reserveApiKeyLimits(apiKey: ApiKeyConfig | undefined, request: IncomingMessage, response: ServerResponse, requestBody: Buffer): boolean {
  if (!apiKey?.limits) {
    return true;
  }

  const usage = estimateApiKeyLimitUsage(request, requestBody);
  const rules = apiKeyLimitRules(apiKey, usage);
  const now = Date.now();
  const checks = rules.map((rule) => {
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    return {
      counterKey: ["api-key", apiKey.id, rule.name, rule.metric, rule.windowMs, windowStart].join("|"),
      rule,
      windowStart
    };
  });

  for (const check of checks) {
    const counter = readApiKeyWindowCounter(check.counterKey, check.windowStart, check.rule.windowMs, now);
    if (counter.value + check.rule.requested > check.rule.limit) {
      sendJson(response, 429, {
        error: {
          code: "rate_limit_exceeded",
          message: `API key ${check.rule.name} limit exceeded.`,
          details: {
            limit: check.rule.limit,
            limit_name: check.rule.name,
            metric: check.rule.metric,
            requested: check.rule.requested,
            used: counter.value,
            window_ms: check.rule.windowMs
          }
        }
      });
      return false;
    }
  }

  for (const check of checks) {
    readApiKeyWindowCounter(check.counterKey, check.windowStart, check.rule.windowMs, now).value += check.rule.requested;
  }
  return true;
}

function apiKeyLimitRules(apiKey: ApiKeyConfig, usage: ApiKeyLimitUsage): ApiKeyLimitRule[] {
  return limitRules(apiKey.limits, usage);
}

function limitRules(limits: ApiKeyLimitConfig | undefined, usage: ApiKeyLimitUsage): ApiKeyLimitRule[] {
  if (!limits) {
    return [];
  }
  const rules: ApiKeyLimitRule[] = [];
  addApiKeyLimitRule(rules, "requests", "requests", limits.windowMs ?? 60_000, limits.maxRequests, 1);
  addApiKeyLimitRule(rules, "rpm", "requests", 60_000, limits.rpm, 1);
  addApiKeyLimitRule(rules, "rph", "requests", 3_600_000, limits.rph, 1);
  addApiKeyLimitRule(rules, "rpd", "requests", 86_400_000, limits.rpd, 1);
  addApiKeyLimitRule(rules, "tpm", "tokens", 60_000, limits.tpm, usage.totalTokens);
  addApiKeyLimitRule(rules, "tph", "tokens", 3_600_000, limits.tph, usage.totalTokens);
  addApiKeyLimitRule(rules, "tpd", "tokens", 86_400_000, limits.tpd, usage.totalTokens);
  addApiKeyLimitRule(rules, "ipm", "images", 60_000, limits.ipm, usage.imageCount);
  addApiKeyLimitRule(rules, "iph", "images", 3_600_000, limits.iph, usage.imageCount);
  addApiKeyLimitRule(rules, "ipd", "images", 86_400_000, limits.ipd, usage.imageCount);
  addApiKeyLimitRule(rules, "quota", "tokens", limits.quotaWindowMs ?? 86_400_000, limits.maxTokens, usage.totalTokens);
  return rules;
}

function providerCredentialLimitState(
  provider: GatewayProviderConfig,
  credential: ProviderCredentialConfig,
  usage: ApiKeyLimitUsage
): { blocked: boolean; utilization: number } {
  const rules = limitRules(credential.limits, usage);
  if (rules.length === 0) {
    return {
      blocked: false,
      utilization: 0
    };
  }

  const now = Date.now();
  let blocked = false;
  let utilization = 0;
  for (const rule of rules) {
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    const counter = readApiKeyWindowCounter(providerCredentialCounterKey(provider, credential, rule, windowStart), windowStart, rule.windowMs, now);
    blocked = blocked || counter.value + rule.requested > rule.limit;
    utilization = Math.max(utilization, (counter.value + rule.requested) / rule.limit);
  }

  return {
    blocked,
    utilization
  };
}

function recordProviderCredentialOutcome(
  config: AppConfig,
  method: string,
  attempt: UpstreamAttempt,
  statusCode: number,
  responseHeaders: Headers
): void {
  if (!attempt.logicalProvider || !attempt.credentialProtocol || !attempt.credentialChain?.length) {
    return;
  }

  const provider = findProviderByPublicOrInternalName(config, attempt.logicalProvider);
  if (!provider) {
    return;
  }

  const responseCredentialId = responseHeaders.get("x-ccr-provider-credential-id")?.trim();
  const responseCredential = responseCredentialId
    ? findProviderCredentialByRuntimeId(provider, responseCredentialId)
    : undefined;
  const fallbackCredential = providerCredentialFromInternalName(provider, attempt.credentialChain[0]);
  const credential = responseCredential ?? fallbackCredential;
  if (!credential) {
    return;
  }

  if (statusCode >= 200 && statusCode < 500 && statusCode !== 401 && statusCode !== 403 && statusCode !== 429) {
    incrementProviderCredentialCounters(provider, credential, estimateLimitUsage(method, attempt.body ?? Buffer.alloc(0)));
    clearProviderCredentialCooldown(provider, credential);
    return;
  }

  if (statusCode === 401 || statusCode === 403 || statusCode === 429 || statusCode >= 500) {
    setProviderCredentialCooldown(provider, credential, providerCredentialCooldownMs, `HTTP ${statusCode}`);
  }
}

function providerCredentialFromInternalName(
  provider: GatewayProviderConfig,
  internalName: string | undefined
): ProviderCredentialConfig | undefined {
  const parsed = parseProviderCredentialInternalName(internalName);
  return parsed ? findProviderCredentialBySlug(provider, parsed.credentialSlug) : undefined;
}

function incrementProviderCredentialCounters(
  provider: GatewayProviderConfig,
  credential: ProviderCredentialConfig,
  usage: ApiKeyLimitUsage
): void {
  const rules = limitRules(credential.limits, usage);
  const now = Date.now();
  for (const rule of rules) {
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    readApiKeyWindowCounter(providerCredentialCounterKey(provider, credential, rule, windowStart), windowStart, rule.windowMs, now).value += rule.requested;
  }
}

function providerCredentialCounterKey(
  provider: GatewayProviderConfig,
  credential: ProviderCredentialConfig,
  rule: ApiKeyLimitRule,
  windowStart: number
): string {
  return ["provider-credential", provider.name, providerCredentialRuntimeId(provider, credential), rule.name, rule.metric, rule.windowMs, windowStart].join("|");
}

function readProviderCredentialCooldown(provider: GatewayProviderConfig, credential: ProviderCredentialConfig): { reason: string; until: number } | undefined {
  const key = providerCredentialStateKey(provider, credential);
  const cooldown = providerCredentialCooldowns.get(key);
  if (!cooldown) {
    return undefined;
  }
  if (cooldown.until > Date.now()) {
    return cooldown;
  }
  providerCredentialCooldowns.delete(key);
  return undefined;
}

function setProviderCredentialCooldown(provider: GatewayProviderConfig, credential: ProviderCredentialConfig, cooldownMs: number, reason: string): void {
  providerCredentialCooldowns.set(providerCredentialStateKey(provider, credential), {
    reason,
    until: Date.now() + cooldownMs
  });
}

function clearProviderCredentialCooldown(provider: GatewayProviderConfig, credential: ProviderCredentialConfig): void {
  providerCredentialCooldowns.delete(providerCredentialStateKey(provider, credential));
}

function providerCredentialStateKey(provider: GatewayProviderConfig, credential: ProviderCredentialConfig): string {
  return `${provider.name}::${providerCredentialRuntimeId(provider, credential)}`;
}

function addApiKeyLimitRule(
  rules: ApiKeyLimitRule[],
  name: string,
  metric: ApiKeyLimitRule["metric"],
  windowMs: number,
  limit: number | undefined,
  requested: number
): void {
  if (!limit || limit <= 0 || windowMs <= 0) {
    return;
  }
  rules.push({
    limit,
    metric,
    name,
    requested,
    windowMs
  });
}

function readApiKeyWindowCounter(key: string, windowStart: number, windowMs: number, now = Date.now()): ApiKeyWindowCounter {
  pruneExpiredApiKeyLimitCounters(now);
  const existing = apiKeyLimitCounters.get(key);
  if (existing && existing.windowStart === windowStart) {
    return existing;
  }
  const fresh = {
    expiresAt: windowStart + windowMs * apiKeyLimitCounterRetentionWindows,
    value: 0,
    windowStart
  };
  apiKeyLimitCounters.set(key, fresh);
  return fresh;
}

function pruneExpiredApiKeyLimitCounters(now: number): void {
  for (const [key, counter] of apiKeyLimitCounters) {
    if (counter.expiresAt <= now) {
      apiKeyLimitCounters.delete(key);
    }
  }
}

function estimateApiKeyLimitUsage(request: IncomingMessage, requestBody: Buffer): ApiKeyLimitUsage {
  return estimateLimitUsage(request.method ?? "GET", requestBody);
}

function estimateLimitUsage(method: string, requestBody: Buffer): ApiKeyLimitUsage {
  if (method.toUpperCase() !== "POST" || requestBody.byteLength === 0) {
    return {
      imageCount: 0,
      totalTokens: 0
    };
  }

  const body = parseJsonObject(requestBody);
  const inputCharacters = countUnknownCharacters(body.messages) + countUnknownCharacters(body.system) + countUnknownCharacters(body.tools);
  const inputTokens = Math.ceil(inputCharacters / 4);
  const outputTokens = readPositiveNumber(body.max_tokens) ?? readPositiveNumber(body.max_output_tokens) ?? 1024;
  return {
    imageCount: countImageInputs(body),
    totalTokens: Math.max(1, inputTokens + outputTokens)
  };
}

function countUnknownCharacters(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length;
  }
  try {
    return JSON.stringify(value)?.length || 0;
  } catch {
    return String(value).length;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function rawStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringListValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item)) : [];
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : undefined;
}

function countImageInputs(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countImageInputs(item), 0);
  }
  if (!isRecord(value)) {
    return 0;
  }
  const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
  const isImage = type === "image" || type === "image_url" || type === "input_image" || value.image_url !== undefined || value.input_image !== undefined;
  return (isImage ? 1 : 0) + Object.values(value).reduce<number>((sum, item) => sum + countImageInputs(item), 0);
}

function readPositiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : undefined;
}

function shouldServeGatewayModelsResponse(method: string, path: string): boolean {
  return (method || "GET").toUpperCase() === "GET" &&
    normalizeGatewayPathname(path) === "/v1/models";
}

function prepareClaudeCodeDiscoveredModelRequest(
  config: AppConfig,
  headers: IncomingHttpHeaders,
  method: string,
  path: string,
  body: Buffer | undefined
): { body: Buffer; diagnostic: string } | undefined {
  if (
    (method || "GET").toUpperCase() !== "POST" ||
    normalizeGatewayPathname(path) !== "/v1/messages" ||
    !isClaudeCodeUserAgent(headers)
  ) {
    return undefined;
  }

  const parsedBody = parseJsonObjectSafe(body);
  const model = stringValue(parsedBody?.model);
  const rewrittenModel = resolveClaudeCodeDiscoveredModelId(model, config);
  if (!parsedBody || !rewrittenModel || rewrittenModel === model) {
    return undefined;
  }

  return {
    body: serializeJsonBodyWithModel(parsedBody, rewrittenModel),
    diagnostic: `${model}->${rewrittenModel}`
  };
}

function prepareClaudeAppFallbackModelRequest(
  config: AppConfig,
  method: string,
  path: string,
  body: Buffer | undefined
): { body: Buffer; diagnostic: string; routedModel: string } | undefined {
  if (
    (method || "GET").toUpperCase() !== "POST" ||
    normalizeGatewayPathname(path) !== "/v1/messages"
  ) {
    return undefined;
  }

  const parsedBody = parseJsonObjectSafe(body);
  const model = stringValue(parsedBody?.model);
  const normalizedModel = normalizeRouteSelector(model);
  if (!parsedBody || !normalizedModel) {
    return undefined;
  }

  const routeModel = resolveClaudeAppGatewayRouteModel(normalizedModel, config, claudeAppGatewayModelRouteOptions);
  const routedModel = routeModel ??
    (normalizedModel.toLowerCase() === CLAUDE_APP_FALLBACK_MODEL ? inferClaudeAppGatewayTargetModel(config) : undefined);
  if (!routedModel || routedModel.toLowerCase() === normalizedModel.toLowerCase()) {
    return undefined;
  }
  if (isConfiguredGatewayModelSelector(normalizedModel, config) && !routeModel) {
    return undefined;
  }

  return {
    body: serializeJsonBodyWithModel(parsedBody, routedModel),
    diagnostic: `${model}->${routedModel}`,
    routedModel
  };
}

function createGatewayModelsResponse(config: AppConfig, headers: IncomingHttpHeaders, apiKey?: ApiKeyConfig): Record<string, unknown> {
  if (isClaudeAppApiKey(apiKey) || isClaudeCodeUserAgent(headers)) {
    return createClaudeAppGatewayModelsResponse(config);
  }
  return createOpenAICompatibleGatewayModelsResponse(config);
}

function createOpenAICompatibleGatewayModelsResponse(config: AppConfig): Record<string, unknown> {
  const data = buildGatewayDiscoverableModelIds(config).map((id) => {
    const catalogEntry = findModelCatalogEntry(id);
    return {
      id,
      object: "model",
      created: 0,
      owned_by: gatewayModelOwner(id),
      type: "model",
      ...(catalogEntry?.displayName ? { display_name: catalogEntry.displayName } : {})
    };
  });

  return {
    object: "list",
    data
  };
}

function createClaudeAppGatewayModelsResponse(config: AppConfig): Record<string, unknown> {
  const routes = buildClaudeAppGatewayModelRoutes(config, claudeAppGatewayModelRouteOptions);
  const data = routes.map((route) => {
    const catalogId = stripClaudeCodeOneMillionContextSuffix(route.targetModel);
    const catalogEntry = findModelCatalogEntry(catalogId);
    const maxInputTokens = claudeGatewayModelContextWindow(catalogEntry, route.oneMillionContext);
    const maxOutputTokens = modelCatalogMaxOutputTokens(catalogEntry);
    return {
      id: route.id,
      capabilities: createClaudeCodeModelCapabilities(catalogEntry, {
        maxInputTokens,
        oneMillionContext: route.oneMillionContext
      }),
      created_at: "1970-01-01T00:00:00Z",
      display_name: route.displayName,
      max_input_tokens: maxInputTokens,
      max_tokens: maxOutputTokens,
      type: "model"
    };
  });

  return {
    data,
    first_id: data[0]?.id ?? null,
    has_more: false,
    last_id: data[data.length - 1]?.id ?? null
  };
}

function createClaudeCodeModelsResponse(config: AppConfig): Record<string, unknown> {
  const models = buildClaudeCodeDiscoverableModels(config);
  const data = models.map((model) => {
    const claudeId = claudeCodeDiscoveryModelId(model.id);
    const catalogId = stripClaudeCodeOneMillionContextSuffix(model.id);
    const catalogEntry = findModelCatalogEntry(catalogId);
    const maxInputTokens = claudeGatewayModelContextWindow(catalogEntry, model.oneMillionContext);
    const maxOutputTokens = modelCatalogMaxOutputTokens(catalogEntry);
    return {
      id: claudeId,
      capabilities: createClaudeCodeModelCapabilities(catalogEntry, {
        maxInputTokens,
        oneMillionContext: model.oneMillionContext
      }),
      created_at: "1970-01-01T00:00:00Z",
      display_name: formatClaudeCodeModelDisplayName(claudeId, catalogEntry, model.oneMillionContext),
      max_input_tokens: maxInputTokens,
      max_tokens: maxOutputTokens,
      type: "model"
    };
  });

  return {
    data,
    first_id: data[0]?.id ?? null,
    has_more: false,
    last_id: data[data.length - 1]?.id ?? null
  };
}

function claudeGatewayModelContextWindow(entry: ModelCatalogEntry | undefined, oneMillionContext: boolean): number {
  const contextWindow = modelCatalogMaxInputTokens(entry);
  if (contextWindow > 0) {
    return contextWindow;
  }
  return oneMillionContext ? 1_000_000 : 0;
}

function buildClaudeCodeDiscoverableModelIds(config: AppConfig): string[] {
  return buildGatewayDiscoverableModelIds(config);
}

function buildGatewayDiscoverableModelIds(config: AppConfig): string[] {
  const baseEntries: Array<{ modelName: string; providerName: string }> = [];
  for (const provider of config.Providers) {
    const providerName = provider.name?.trim();
    if (!providerName || !Array.isArray(provider.models)) {
      continue;
    }
    for (const rawModel of provider.models) {
      const modelName = rawModel.trim();
      if (!modelName) {
        continue;
      }
      baseEntries.push({ modelName, providerName });
    }
  }

  const ids = baseEntries.map((entry) => `${entry.providerName}/${entry.modelName}`);
  for (const profile of config.virtualModelProfiles ?? []) {
    if (!isVisibleVirtualModelProfile(profile)) {
      continue;
    }

    for (const entry of baseEntries) {
      for (const prefix of profile.match?.prefixes ?? []) {
        const normalizedPrefix = prefix.trim();
        if (normalizedPrefix) {
          ids.push(`${entry.providerName}/${normalizedPrefix}${entry.modelName}`);
        }
      }
      for (const suffix of profile.match?.suffixes ?? []) {
        const normalizedSuffix = suffix.trim();
        if (normalizedSuffix) {
          ids.push(`${entry.providerName}/${entry.modelName}${normalizedSuffix}`);
        }
      }
    }

    for (const alias of profile.match?.exactAliases ?? []) {
      const normalizedAlias = alias.trim();
      if (!normalizedAlias) {
        continue;
      }
      ids.push(fusionModelSelector(normalizedAlias));
    }
  }

  return uniqueStrings(ids);
}

function gatewayModelOwner(id: string): string {
  const separator = id.indexOf("/");
  return separator > 0 ? id.slice(0, separator).trim() || "ccr" : "ccr";
}

function buildClaudeCodeDiscoverableModels(config: AppConfig): ClaudeCodeDiscoverableModel[] {
  const seen = new Set<string>();
  const models: ClaudeCodeDiscoverableModel[] = [];

  const pushModel = (id: string, oneMillionContext: boolean) => {
    const normalized = id.trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    models.push({ id: normalized, oneMillionContext });
  };

  for (const id of buildClaudeCodeDiscoverableModelIds(config)) {
    pushModel(id, hasClaudeCodeOneMillionContextSuffix(id));
    const baseId = stripClaudeCodeOneMillionContextSuffix(id);
    if (!hasClaudeCodeOneMillionContextSuffix(id) && findModelCatalogEntry(baseId)?.limits?.supports1MContext) {
      pushModel(claudeCodeOneMillionContextModelId(baseId), true);
    }
  }

  return models;
}

function isVisibleVirtualModelProfile(profile: NonNullable<AppConfig["virtualModelProfiles"]>[number]): boolean {
  return profile.enabled !== false &&
    profile.materialization?.enabled !== false &&
    profile.materialization?.includeInGatewayModels !== false;
}

function resolveClaudeCodeDiscoveredModelId(model: string | undefined, config: AppConfig): string | undefined {
  const normalized = normalizeRouteSelector(model);
  if (!normalized || !normalized.toLowerCase().startsWith("claude-")) {
    return undefined;
  }

  if (isConfiguredGatewayModelSelector(normalized, config)) {
    return undefined;
  }

  const unprefixed = normalized.slice("claude-".length);
  if (isConfiguredGatewayModelSelector(unprefixed, config)) {
    return unprefixed;
  }

  const withoutOneMillionContextSuffix = stripClaudeCodeOneMillionContextSuffix(unprefixed);
  return withoutOneMillionContextSuffix !== unprefixed &&
    isConfiguredGatewayModelSelector(withoutOneMillionContextSuffix, config)
    ? withoutOneMillionContextSuffix
    : undefined;
}

function resolveGatewayPublicModelId(model: string | undefined, config: AppConfig): string | undefined {
  const normalized = normalizeRouteSelector(model);
  if (!normalized || !normalized.toLowerCase().startsWith("claude-")) {
    return undefined;
  }
  if (isConfiguredGatewayModelSelector(normalized, config)) {
    return undefined;
  }
  return resolveClaudeCodeDiscoveredModelId(normalized, config) ??
    resolveClaudeAppGatewayRouteModel(normalized, config, claudeAppGatewayModelRouteOptions);
}

function isConfiguredGatewayModelSelector(model: string, config: AppConfig): boolean {
  const normalized = normalizeRouteSelector(model)?.toLowerCase();
  if (!normalized) {
    return false;
  }

  for (const id of buildClaudeCodeDiscoverableModelIds(config)) {
    if (id.toLowerCase() === normalized) {
      return true;
    }
  }

  for (const provider of config.Providers) {
    if (provider.models.some((candidate) => candidate.trim().toLowerCase() === normalized)) {
      return true;
    }
  }

  return false;
}

function claudeCodeDiscoveryModelId(value: string): string {
  return value.toLowerCase().startsWith("claude-") ? value : `claude-${value}`;
}

function claudeCodeOneMillionContextModelId(id: string): string {
  return hasClaudeCodeOneMillionContextSuffix(id) ? id : `${id}${claudeCodeOneMillionContextSuffix}`;
}

function hasClaudeCodeOneMillionContextSuffix(id: string): boolean {
  return id.trim().toLowerCase().endsWith(claudeCodeOneMillionContextSuffix);
}

function stripClaudeCodeOneMillionContextSuffix(id: string): string {
  return id.trim().replace(/\[1m\]$/i, "").trim();
}

function formatClaudeCodeModelDisplayName(
  id: string,
  entry?: ModelCatalogEntry,
  oneMillionContext = hasClaudeCodeOneMillionContextSuffix(id)
): string {
  if (entry?.displayName) {
    return oneMillionContext ? `${entry.displayName} (1M context)` : entry.displayName;
  }

  const normalized = stripClaudeCodeOneMillionContextSuffix(id.replace(/^claude-/i, ""));
  const model = normalized.includes("/") ? normalized.slice(normalized.lastIndexOf("/") + 1) : normalized;
  const words = model
    .split(/[-_]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? part : part.slice(0, 1).toUpperCase() + part.slice(1)));
  const displayName = ["Claude", ...words].filter(Boolean).join(" ");
  return oneMillionContext ? `${displayName} (1M context)` : displayName;
}

function createClaudeCodeModelCapabilities(
  entry?: ModelCatalogEntry,
  options: { maxInputTokens?: number; oneMillionContext?: boolean } = {}
): Record<string, unknown> {
  if (!entry) {
    return createDefaultClaudeCodeModelCapabilities();
  }

  const capabilities = entry.capabilities ?? {};
  const inputModalities = new Set((entry.modalities?.input ?? []).map((item) => item.toLowerCase()));
  const outputModalities = new Set((entry.modalities?.output ?? []).map((item) => item.toLowerCase()));
  const supportsReasoning = readCatalogCapability(capabilities, "reasoning");
  const supportsImageInput = readCatalogCapability(capabilities, "imageInput") || inputModalities.has("image");
  const supportsPdfInput = readCatalogCapability(capabilities, "pdfInput") || inputModalities.has("pdf");
  const supportsStructuredOutput =
    readCatalogCapability(capabilities, "structuredOutput") ||
    readCatalogCapability(capabilities, "nativeStructuredOutput") ||
    readCatalogCapability(capabilities, "responseSchema");
  const supportsCodeExecution = readCatalogCapability(capabilities, "codeExecution");
  const supportsAdaptiveThinking = readCatalogCapability(capabilities, "adaptiveThinking");
  const supportsToolUse =
    readCatalogCapability(capabilities, "toolCalling") ||
    readCatalogCapability(capabilities, "functionCalling");
  const supportsBatch = readCatalogCapability(capabilities, "batch");
  const supportsCitations = readCatalogCapability(capabilities, "citations");
  const supportsAudioInput = readCatalogCapability(capabilities, "audioInput") || inputModalities.has("audio");
  const supportsAudioOutput = readCatalogCapability(capabilities, "audioOutput") || outputModalities.has("audio");
  const supportsVideoInput = readCatalogCapability(capabilities, "videoInput") || inputModalities.has("video");
  const maxInputTokens = options.maxInputTokens ?? modelCatalogMaxInputTokens(entry);
  const supportsOneMillionContext = Boolean(entry.limits?.supports1MContext);

  return {
    audio_input: { supported: supportsAudioInput },
    audio_output: { supported: supportsAudioOutput },
    batch: { supported: supportsBatch },
    citations: { supported: supportsCitations },
    code_execution: { supported: supportsCodeExecution },
    context_management: {
      clear_thinking_20251015: { supported: supportsReasoning },
      clear_tool_uses_20250919: { supported: supportsToolUse },
      compact_20260112: { supported: maxInputTokens > 0 },
      max_input_tokens: maxInputTokens,
      supported: maxInputTokens > 0
    },
    context_window: {
      max_input_tokens: maxInputTokens,
      supported: maxInputTokens > 0,
      supports_1m_context: supportsOneMillionContext,
      one_million_context_variant: options.oneMillionContext === true
    },
    effort: {
      high: { supported: supportsReasoning },
      low: { supported: supportsReasoning },
      max: { supported: supportsReasoning },
      medium: { supported: supportsReasoning },
      supported: supportsReasoning,
      xhigh: { supported: supportsReasoning }
    },
    image_input: { supported: supportsImageInput },
    pdf_input: { supported: supportsPdfInput },
    structured_outputs: { supported: supportsStructuredOutput },
    thinking: {
      supported: supportsReasoning,
      types: {
        adaptive: { supported: supportsAdaptiveThinking },
        enabled: { supported: supportsReasoning }
      }
    },
    tool_use: { supported: supportsToolUse },
    video_input: { supported: supportsVideoInput }
  };
}

function createDefaultClaudeCodeModelCapabilities(): Record<string, unknown> {
  return {
    batch: { supported: true },
    citations: { supported: true },
    code_execution: { supported: true },
    context_management: {
      clear_thinking_20251015: { supported: true },
      clear_tool_uses_20250919: { supported: true },
      compact_20260112: { supported: true },
      supported: true
    },
    effort: {
      high: { supported: true },
      low: { supported: true },
      max: { supported: true },
      medium: { supported: true },
      supported: true,
      xhigh: { supported: true }
    },
    image_input: { supported: true },
    pdf_input: { supported: true },
    structured_outputs: { supported: true },
    thinking: {
      supported: true,
      types: {
        adaptive: { supported: true },
        enabled: { supported: true }
      }
    }
  };
}

function normalizeGatewayPathname(path: string): string {
  const normalized = path.trim().replace(/\/+$/, "");
  return normalized || "/";
}

function isClaudeCodeUserAgent(headers: IncomingHttpHeaders): boolean {
  const userAgent = readHeader(headers["user-agent"]);
  if (!userAgent) {
    return false;
  }
  const normalized = userAgent.toLowerCase();
  return normalized.includes("claude");
}

function isClaudeAppApiKey(apiKey: ApiKeyConfig | undefined): boolean {
  const name = apiKey?.name?.trim().toLowerCase();
  return name === "claude app";
}

function prepareCursorOpenAICompatChatBody(
  config: AppConfig,
  client: string | undefined,
  method: string,
  path: string,
  requestBody: Buffer
): CursorOpenAICompatPreparation | undefined {
  if ((method || "GET").toUpperCase() !== "POST" || !isOpenAICompatChatCompletionsPath(path) || client !== "Cursor") {
    return undefined;
  }

  let body: Record<string, unknown>;
  try {
    body = parseJsonObject(requestBody);
  } catch {
    return undefined;
  }
  if (!isSimplifiedCursorOpenAICompatChat(body)) {
    return undefined;
  }

  const context = readCursorOpenAICompatContext(config);
  let changed = false;
  if (context.systemPrompt) {
    body.messages = [
      { content: context.systemPrompt, role: "system" },
      ...(Array.isArray(body.messages) ? body.messages : [])
    ];
    changed = true;
  }
  if (context.tools.length > 0) {
    body.tools = context.tools;
    changed = true;
  }
  if (context.toolChoice !== undefined && context.tools.length > 0) {
    body.tool_choice = context.toolChoice;
    changed = true;
  }

  if (!changed) {
    if (!warnedMissingCursorOpenAICompatContext) {
      warnedMissingCursorOpenAICompatContext = true;
      console.warn(
        "[gateway] Cursor sent an OpenAI-compatible chat request with only user messages and no system/tools. " +
        "Configure plugins[].id=\"cursor-proxy\" config.systemPrompt/config.tools to inject fallback context, " +
        "or route Cursor native Agent traffic through the proxy."
      );
    }
    return { diagnostic: "simplified-missing-context" };
  }

  return {
    body: Buffer.from(`${JSON.stringify(body)}\n`, "utf8"),
    diagnostic: "fallback-injected"
  };
}

function isOpenAICompatChatCompletionsPath(path: string): boolean {
  return path === "/chat/completions" ||
    path === "/v1/chat/completions" ||
    path.endsWith("/chat/completions");
}

function isSimplifiedCursorOpenAICompatChat(body: Record<string, unknown>): boolean {
  if (body.system !== undefined || body.systemPrompt !== undefined || body.instructions !== undefined) {
    return false;
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    return false;
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return false;
  }
  return body.messages.every((message) =>
    isRecord(message) &&
    stringValue(message.role)?.toLowerCase() === "user"
  );
}

function readCursorOpenAICompatContext(config: AppConfig): CursorOpenAICompatContext {
  const plugin = config.plugins.find((item) => item.enabled !== false && item.id === "cursor-proxy");
  const pluginConfig = isRecord(plugin?.config) ? plugin.config : {};
  return {
    systemPrompt:
      stringValue(pluginConfig.systemPrompt) ||
      stringValue(pluginConfig.openaiSystemPrompt) ||
      stringValue(pluginConfig.defaultSystemPrompt),
    toolChoice: normalizeCursorToolChoice(
      pluginConfig.toolChoice ?? pluginConfig.openaiToolChoice ?? pluginConfig.defaultToolChoice
    ),
    tools: normalizeCursorTools(pluginConfig.tools ?? pluginConfig.openaiTools ?? pluginConfig.defaultTools)
  };
}

function normalizeCursorTools(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.map(normalizeCursorTool).filter((tool): tool is Record<string, unknown> => Boolean(tool));
  }
  if (isRecord(value)) {
    if (Array.isArray(value.tools) || isRecord(value.tools)) {
      return normalizeCursorTools(value.tools);
    }
    return Object.entries(value)
      .map(([name, item]) => normalizeCursorTool(isRecord(item) ? { ...item, name: stringValue(item.name) || name } : { description: stringValue(item), name }))
      .filter((tool): tool is Record<string, unknown> => Boolean(tool));
  }
  return [];
}

function normalizeCursorTool(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const type = stringValue(value.type);
  if (type && type.toLowerCase().startsWith("web_search")) {
    return { ...value, type };
  }

  const fn = isRecord(value.function) ? value.function : value;
  const name =
    stringValue(fn.name) ||
    stringValue(value.name) ||
    stringValue(value.toolName) ||
    stringValue(value.functionName);
  if (!name) {
    return undefined;
  }
  return {
    function: compactRecord({
      description: stringValue(fn.description) || stringValue(value.description),
      name,
      parameters: normalizeCursorToolParameters(
        fn.parameters ??
        value.parameters ??
        fn.input_schema ??
        value.input_schema ??
        fn.inputSchema ??
        value.inputSchema ??
        fn.schema ??
        value.schema
      )
    }),
    type: "function"
  };
}

function normalizeCursorToolParameters(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to an empty object schema.
    }
  }
  return { properties: {}, type: "object" };
}

function normalizeCursorToolChoice(value: unknown): unknown {
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "auto" || normalized === "none" || normalized === "required") {
      return normalized;
    }
    return { function: { name: value.trim() }, type: "function" };
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const type = stringValue(value.type);
  if (type && ["auto", "none", "required"].includes(type.toLowerCase())) {
    return type.toLowerCase();
  }
  const fn = isRecord(value.function) ? value.function : value;
  const name = stringValue(fn.name) || stringValue(value.name) || stringValue(value.toolName);
  return name ? { function: { name }, type: "function" } : undefined;
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function inferGatewayClient(apiKey: ApiKeyConfig | undefined, headers: IncomingHttpHeaders): string | undefined {
  const explicit =
    readHeader(headers["x-ccr-client"]) ??
    readHeader(headers["x-client-name"]) ??
    readHeader(headers["x-forwarded-client-cert"]);
  if (explicit) {
    return explicit;
  }

  const apiKeyClient = apiKey?.name?.trim() || apiKey?.id?.trim();
  const userAgentClient = inferClientFromUserAgent(headers);
  if (readHeader(headers["x-ccr-proxy-mode"]) === "gateway") {
    return userAgentClient ?? apiKeyClient;
  }
  return apiKeyClient ?? userAgentClient;
}

function inferClientFromUserAgent(headers: IncomingHttpHeaders): string | undefined {
  const userAgent = readHeader(headers["user-agent"]);
  if (!userAgent) {
    return undefined;
  }

  const normalized = userAgent.toLowerCase();
  if (normalized.includes("codex")) {
    return "Codex";
  }
  if (normalized.includes("@anthropic-ai/claude-code") || normalized.includes("claude-code") || normalized.includes("claude code")) {
    return "Claude Code";
  }
  if (normalized.includes("claude")) {
    return "Claude";
  }
  if (normalized.includes("curl")) {
    return "curl";
  }
  if (normalized.includes("python")) {
    return "Python";
  }
  if (normalized.includes("node")) {
    return "Node.js";
  }
  if (normalized.includes("chrome")) {
    return "Google Chrome";
  }
  if (normalized.includes("safari") && !normalized.includes("chrome")) {
    return "Safari";
  }
  return userAgent.split(/[ /]/)[0]?.trim() || undefined;
}

function readAuthToken(headers: IncomingHttpHeaders): string | undefined {
  const raw = readHeader(headers.authorization) || readHeader(headers["x-api-key"]);
  if (!raw) {
    return undefined;
  }
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
}

function readRemoteControlQueryAuthToken(request: IncomingMessage): string | undefined {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname !== ccrRemoteControlPathPrefix && !url.pathname.startsWith(`${ccrRemoteControlPathPrefix}/`)) {
    return undefined;
  }
  return url.searchParams.get("api_key")?.trim() || url.searchParams.get("key")?.trim() || undefined;
}

function forwardHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (proxyHeaderDenyList.has(normalized) || value === undefined) {
      continue;
    }
    forwarded[normalized] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return forwarded;
}

function stripLocalGatewayAuthHeaders(headers: Record<string, string>): void {
  delete headers.authorization;
  delete headers["x-api-key"];
  delete headers["api-key"];
}

function omitLocalObservabilityHeaders(headers: Record<string, string>): Record<string, string> {
  const forwarded = { ...headers };
  for (const name of localObservabilityHeaderNames) {
    delete forwarded[name];
  }
  return forwarded;
}

function withCoreGatewayAuthHeader(headers: Record<string, string>, token: string): Record<string, string> {
  if (!token) {
    throw new Error("Core gateway auth token is not initialized.");
  }
  return {
    ...headers,
    [coreGatewayAuthHeader]: token
  };
}

function filteredResponseHeaders(headers: Headers): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  headers.forEach((value, key) => {
    if (!responseHeaderDenyList.has(key.toLowerCase())) {
      entries.push([key, value]);
    }
  });
  return entries;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortSignalMessage(signal: AbortSignal): string {
  const reason = signal.reason as unknown;
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }
  return "Upstream request was aborted.";
}

function parseJsonObject(buffer: Buffer): Record<string, unknown> {
  if (buffer.length === 0) {
    return {};
  }
  const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error("Request body must be a JSON object.");
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(payload)}\n`);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve();
    };

    try {
      server.closeIdleConnections?.();
      timeout = setTimeout(() => {
        server.closeAllConnections?.();
        finish();
      }, 800);
      server.close(() => finish());
    } catch {
      finish();
    }
  });
}

function shouldSendBody(method: string | undefined): boolean {
  const normalized = method?.toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD";
}

function shouldCaptureGatewayUsage(method: string, _path: string): boolean {
  return shouldSendBody(method);
}
