import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { Readable } from "node:stream";
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
import { providerApiKeySafetyIssue } from "../../main/presets";
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
let warnedMissingCursorOpenAICompatContext = false;
const rawTraceSyncPath = "/__ccr/raw-trace-sync";
const gatewayEntryOverrideEnv = "CCR_GATEWAY_ENTRY";
const gatewayPackageCandidates = ["@the-next-ai/ai-gateway", "gateway"];
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
  "gemini_generate_content"
];
const privateDirMode = 0o700;
const privateFileMode = 0o600;
const persistedApiKeyCacheTtlMs = 1000;
let persistedApiKeyCache: { loadedAt: number; values: ApiKeyConfig[] } | undefined;

class GatewayService {
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
        writeCoreGatewayConfig(config, this.rawTraceSyncToken);
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
      headers["x-ccr-cursor-openai-compat"] = cursorCompatPreparation.diagnostic;
    }
    let bodyToForward: Buffer | undefined = cursorCompatPreparation?.body ?? requestBody;
    let routeFallback = this.config.Router.fallback;
    let routedModel: string | undefined;
    const claudeModelRewrite = prepareClaudeCodeDiscoveredModelRequest(this.config, request.headers, method, path, bodyToForward);
    if (claudeModelRewrite) {
      headers["x-ccr-claude-model-discovery"] = claudeModelRewrite.diagnostic;
      bodyToForward = claudeModelRewrite.body;
    }
    const claudeAppModelRewrite = prepareClaudeAppFallbackModelRequest(this.config, method, path, bodyToForward);
    if (claudeAppModelRewrite) {
      headers["x-ccr-claude-app-model-rewrite"] = claudeAppModelRewrite.diagnostic;
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
      headers["x-ccr-route-reason"] = routed.decision.reason;
      routeFallback = routed.decision.fallback ?? routeFallback;
      if (routed.decision.model) {
        headers["x-ccr-routed-model"] = routed.decision.model;
        routedModel = routed.decision.model;
      }
      bodyToForward = serialized;
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
      mergeFallbackResponseHeaders(upstreamResponseHeaders(upstreamResult), upstreamResult),
      this.config
    );
    const upstreamResponse = upstreamResult.response;
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
    const responseBody = upstreamBody;
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
    responseBody.once("error", (error) => {
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

function writeCoreGatewayConfig(config: AppConfig, rawTraceSyncToken: string): void {
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
  const builtinToolArtifacts = fusionBuiltinToolArtifacts(virtualModelProfiles, coreEndpoint);
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

  return nextProfile ?? profile;
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

function fusionBuiltinToolArtifacts(
  profiles: unknown[],
  coreEndpoint: string
): { mcpServers: GatewayMcpServerConfig[]; providers: CoreGatewayProvider[] } {
  const providers: CoreGatewayProvider[] = [];
  const mcpServers: GatewayMcpServerConfig[] = [];
  const toolServerKeys = new Set<string>();
  const entry = bundledFusionBuiltinMcpEntryPath();

  profiles.forEach((profile, index) => {
    if (!isRecord(profile) || profile.enabled === false) {
      return;
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
        mcpServers.push(fusionBuiltinMcpServer({
          entry,
          env: {
            FUSION_BUILTIN_TOOL_KIND: "web_search",
            FUSION_TOOL_NAME: webSearchConfig.toolName,
            SEARCH_PROVIDER: webSearchConfig.provider ?? defaultFusionWebSearchProvider,
            ...(webSearchConfig.resultCount ? { SEARCH_RESULT_COUNT: String(webSearchConfig.resultCount) } : {}),
            ...(webSearchConfig.timeoutMs ? { SEARCH_TIMEOUT_MS: String(webSearchConfig.timeoutMs) } : {}),
            ...(webSearchConfig.env ?? {})
          },
          name: `fusion-web-search-${sanitizedProfileId}`
        }));
      }
    }
  });

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
  const tools = fusionFallbackToolDefinitions(profiles);
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

function fusionFallbackToolDefinitions(
  profiles: unknown[]
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
    .find((name) => name === baseToolName || name.startsWith(`${baseToolName}_`));
  if (toolName) {
    return toolName;
  }
  const execution = isRecord(profile.execution) ? profile.execution : {};
  return execution[executionFlag] === true ? baseToolName : undefined;
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
    normalized === "exa"
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

  return {
    body,
    fallback,
    routedModel
  };
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
    return ["openai_responses", "openai_chat_completions", "anthropic_messages"];
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
    "x-ccr-logical-provider": target.provider.name,
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
      merged.set("x-ccr-fallback-model", result.attempt.model);
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

  if (!upstreamProxyUrl) {
    return env;
  }

  env.HTTP_PROXY = upstreamProxyUrl;
  env.HTTPS_PROXY = upstreamProxyUrl;
  env.ALL_PROXY = upstreamProxyUrl;
  env.NO_PROXY = mergeNoProxy(env.NO_PROXY, [
    "127.0.0.1",
    "localhost",
    "::1",
    config.gateway.host,
    config.gateway.coreHost
  ]);
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
      "const proxyUrl = process.env.CCR_UPSTREAM_PROXY_URL;",
      "if (proxyUrl) {",
      "  const undiciModule = process.env.CCR_UNDICI_MODULE || \"undici\";",
      "  const { ProxyAgent, setGlobalDispatcher } = require(undiciModule);",
      "  setGlobalDispatcher(new ProxyAgent(proxyUrl));",
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
  return normalized;
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
  return undefined;
}

function inferProtocol(provider: GatewayProviderConfig): GatewayProviderProtocol {
  const url = readBaseUrl(provider)?.toLowerCase() ?? "";
  const transformerNames = JSON.stringify(provider.transformer ?? "").toLowerCase();
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
