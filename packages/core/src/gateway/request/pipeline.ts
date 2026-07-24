import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ApiKeyConfig, AppConfig, RequestRouteTraceChange } from "@ccr/core/contracts/app";
import {
  createSseErrorDetector,
  markGatewayRequestLogDropped,
  recordGatewayRequestLog
} from "@ccr/core/observability/request-log-store";
import { requestLogRequestedModel, requestLogResponseModel } from "@ccr/core/observability/request-log-model";
import { recordGatewayUsageCapture, type UsageCaptureInput } from "@ccr/core/usage/store";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin";
import {
  codexCompactResponseStream,
  contextArchiveHandoffResponseStream,
  failContextArchiveRequest,
  finalizeContextArchiveRequest,
  prepareContextArchiveRequest,
  type ContextArchiveRecord,
  type ContextArchiveReplayInput,
  type ContextArchiveReplayResult
} from "@ccr/core/gateway/context-archive";
import {
  prepareCodexCompactCompatRequest,
  prepareContextArchiveToolContinuationRequest,
  resolveContextArchiveToolContinuation
} from "@ccr/core/gateway/features/context-archive-continuation";
import { isCodexResponsesCompactPath, type ContextArchiveResponseMode } from "@ccr/core/gateway/context-archive/protocol";
import { adaptRouteRequestBody, restoreRouteRequestBody } from "@ccr/core/routing/protocol-adapter";
import { reserveApiKeyLimits } from "@ccr/core/gateway/auth/api-key-authorizer";
import { recordProviderCredentialOutcome } from "@ccr/core/providers/credential-pool";
import { codexApplyPatchBridgeResponseStream, prepareCodexApplyPatchBridgeRequest } from "@ccr/core/gateway/features/codex-patch-bridge";
import { prepareCursorOpenAICompatChatBody } from "@ccr/core/gateway/features/cursor-compat";
import { filteredResponseHeaders, formatError, formatUpstreamErrorForLog, forwardHeaders, inferGatewayClient, readRequestBody, sendJson, shouldCaptureGatewayUsage, shouldSendBody, stripLocalGatewayAuthHeaders } from "@ccr/core/gateway/http/io";
import { serializeJsonBody, takeJsonObject } from "@ccr/core/gateway/http/body";
import { createGatewayModelsResponse, prepareClaudeAppDiscoveredModelRequest, prepareClaudeCodeDiscoveredModelRequest, shouldServeGatewayModelsResponse } from "@ccr/core/gateway/features/model-discovery";
import { resolveProviderLogName, resolveResponseProviderProtocol, sanitizeHeaderValue } from "@ccr/core/providers/runtime-topology";
import { createBodySampler, requestLogSampled, shouldRecordRequestLogs } from "@ccr/core/observability/raw-trace-sync";
import { RequestRouteTraceRecorder } from "@ccr/core/observability/route-trace";
import { endpoint } from "@ccr/core/gateway/core-runtime/supervisor";
import { coreGatewayUsageAttributionConfig } from "@ccr/core/gateway/core-runtime/config-compiler";
import { providerModelPricingForUsage } from "@ccr/core/models/pricing-service";
import { clientClosedRequestStatusCode, clientDisconnectMessage, resolveStreamRequestLogOutcome, UpstreamRequestError } from "@ccr/core/gateway/internal/shared";
import type { BrowserWebSearchMcpIntegration, BrowserWebSearchProtocolRecord, UpstreamFetchResult } from "@ccr/core/gateway/internal/shared";
import { applyProviderCapabilityRouting, cancelResponseBody, destroyResponseStreams, fetchUpstreamWithFallback, mergeFallbackResponseHeaders, rewriteCapabilityResponseHeaders, uniqueStreams, upstreamResponseHeaders } from "@ccr/core/gateway/upstream/executor";
import { requestProtocolForPath, shouldApplyGatewayRouting } from "@ccr/core/routing/protocol-endpoints";
import { createClaudeCodeWebSearchContinuationContext, createHostedWebSearchProtocolContext, hostedWebSearchProtocolResponseStream, hostedWebSearchUnavailableMessage, prepareClaudeCodeWebSearchContinuationRequestBody, prepareHostedWebSearchProtocolRequestBody, selectClaudeCodeWebSearchContinuationRecords, selectHostedWebSearchProtocolRecords } from "@ccr/core/gateway/features/hosted-web-search/index";

export type GatewayRequestPipelineDependencies = {
  getBrowserWebSearchMcpIntegration: () => BrowserWebSearchMcpIntegration | undefined;
  getConfig: () => AppConfig | undefined;
  getCoreAuthToken: () => string;
  getPlugin: () => ClaudeCodeRouterPlugin | undefined;
  getStatus: () => { coreEndpoint: string; endpoint: string };
};

function reportedRouteChange(
  scope: RequestRouteTraceChange["scope"],
  path: string,
  before: unknown,
  after: unknown
): RequestRouteTraceChange | undefined {
  if (Object.is(before, after)) {
    return undefined;
  }
  return {
    ...(after === undefined ? {} : { after }),
    ...(before === undefined ? {} : { before }),
    operation: before === undefined ? "add" : after === undefined ? "remove" : "replace",
    path,
    scope
  };
}

function isReportedRouteChange(change: RequestRouteTraceChange | undefined): change is RequestRouteTraceChange {
  return change !== undefined;
}

export class GatewayRequestPipeline {
  constructor(private readonly dependencies: GatewayRequestPipelineDependencies) {}

  private get browserWebSearchMcpIntegration() { return this.dependencies.getBrowserWebSearchMcpIntegration(); }
  private get config() { return this.dependencies.getConfig(); }
  private get coreAuthToken() { return this.dependencies.getCoreAuthToken(); }
  private get plugin() { return this.dependencies.getPlugin(); }
  private get status() { return this.dependencies.getStatus(); }

  async proxyRequest(request: IncomingMessage, response: ServerResponse, path: string, apiKey?: ApiKeyConfig): Promise<void> {
      if (!this.config || !this.plugin) {
        sendJson(response, 503, { error: { message: "Gateway service is not configured." } });
        return;
      }

      const method = request.method ?? "GET";
      const requestBody = await readRequestBody(request);
      const requestedModel = requestLogRequestedModel(requestBody, path);
      const startedAt = Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const requestId = randomUUID();
      const requestUrl = new URL(request.url || path, this.status.endpoint || "http://127.0.0.1").toString();
      const routeTrace = shouldRecordRequestLogs(this.config)
        ? new RequestRouteTraceRecorder(startedAt)
        : undefined;
      routeTrace?.captureIngress();
      const headerNormalizationStartedAt = Date.now();
      const headers = forwardHeaders(request.headers);
      const previousAuthorization = headers.authorization;
      const previousApiKey = headers["x-api-key"];
      const previousLegacyApiKey = headers["api-key"];
      const previousAuthApiKeyId = headers["x-auth-api-key-id"];
      const previousAuthSub = headers["x-auth-sub"];
      const previousClientRequestId = headers["x-client-request-id"];
      if (apiKey) {
        stripLocalGatewayAuthHeaders(headers);
        headers["x-auth-api-key-id"] = apiKey.id;
        headers["x-auth-sub"] = apiKey.id;
      }
      headers["x-client-request-id"] = requestId;
      routeTrace?.capture({
        changes: [
          ...(apiKey ? [
            reportedRouteChange("headers", "/headers/authorization", previousAuthorization, undefined),
            reportedRouteChange("headers", "/headers/x-api-key", previousApiKey, undefined),
            reportedRouteChange("headers", "/headers/api-key", previousLegacyApiKey, undefined),
            reportedRouteChange("headers", "/headers/x-auth-api-key-id", previousAuthApiKeyId, apiKey.id),
            reportedRouteChange("headers", "/headers/x-auth-sub", previousAuthSub, apiKey.id)
          ] : []),
          reportedRouteChange("headers", "/headers/x-client-request-id", previousClientRequestId, requestId)
        ].filter(isReportedRouteChange),
        durationMs: Date.now() - headerNormalizationStartedAt,
        kind: "mutation",
        name: "gateway.header-normalization",
        phase: "ingress",
        startedAtMs: headerNormalizationStartedAt
      });
      const client = inferGatewayClient(apiKey, request.headers);
      const cursorCompatStartedAt = Date.now();
      const cursorCompatPreparation = prepareCursorOpenAICompatChatBody(this.config, client, method, path, requestBody);
      if (cursorCompatPreparation) {
        headers["x-ccr-cursor-openai-compat"] = sanitizeHeaderValue(cursorCompatPreparation.diagnostic);
      }
      let bodyToForward: Buffer | undefined = cursorCompatPreparation?.body ?? requestBody;
      if (cursorCompatPreparation) {
        routeTrace?.capture({
          changes: [
            { operation: "replace", path: "/body", scope: "body" },
            { after: headers["x-ccr-cursor-openai-compat"], operation: "add", path: "/headers/x-ccr-cursor-openai-compat", scope: "headers" }
          ],
          durationMs: Date.now() - cursorCompatStartedAt,
          kind: "mutation",
          name: "compatibility.cursor-openai",
          phase: "compatibility",
          startedAtMs: cursorCompatStartedAt
        });
      }
      let routeFallback = this.config.Router.fallback;
      let routedModel: string | undefined;
      let codexApplyPatchBridgeActive = false;
      const claudeModelRewriteStartedAt = Date.now();
      const claudeModelRewrite = prepareClaudeCodeDiscoveredModelRequest(this.config, request.headers, method, path, bodyToForward);
      if (claudeModelRewrite) {
        headers["x-ccr-claude-model-discovery"] = sanitizeHeaderValue(claudeModelRewrite.diagnostic);
        bodyToForward = claudeModelRewrite.body;
        routeTrace?.capture({
          changes: [
            { operation: "replace", path: "/body/model", scope: "body" },
            { after: headers["x-ccr-claude-model-discovery"], operation: "add", path: "/headers/x-ccr-claude-model-discovery", scope: "headers" }
          ],
          durationMs: Date.now() - claudeModelRewriteStartedAt,
          kind: "mutation",
          name: "model-discovery.claude-code",
          phase: "compatibility",
          startedAtMs: claudeModelRewriteStartedAt
        });
      }
      const claudeAppModelRewriteStartedAt = Date.now();
      const claudeAppModelRewrite = prepareClaudeAppDiscoveredModelRequest(this.config, method, path, bodyToForward);
      if (claudeAppModelRewrite) {
        headers["x-ccr-claude-app-model-rewrite"] = sanitizeHeaderValue(claudeAppModelRewrite.diagnostic);
        bodyToForward = claudeAppModelRewrite.body;
        routedModel = claudeAppModelRewrite.routedModel;
        routeTrace?.capture({
          changes: [
            { after: routedModel, operation: "replace", path: "/body/model", scope: "body" },
            { after: headers["x-ccr-claude-app-model-rewrite"], operation: "add", path: "/headers/x-ccr-claude-app-model-rewrite", scope: "headers" }
          ],
          durationMs: Date.now() - claudeAppModelRewriteStartedAt,
          kind: "mutation",
          name: "model-discovery.claude-app",
          phase: "compatibility",
          startedAtMs: claudeAppModelRewriteStartedAt,
          target: routedModel ? { model: routedModel } : undefined
        });
      }
      if (!reserveApiKeyLimits(apiKey, request, response, bodyToForward)) {
        return;
      }
      const usageAttributionConfig = coreGatewayUsageAttributionConfig(this.config);
      const recordUsage = (input: Omit<UsageCaptureInput, "config">) => {
        void recordGatewayUsageCapture({ ...input, config: usageAttributionConfig });
      };
      const upstreamAbortController = new AbortController();
      let clientDisconnected = false;
      let responseCompleted = false;
      let onClientDisconnect: (() => void) | undefined;
      let onResponseFinish: (() => void) | undefined;
      const handleClientDisconnect = () => {
        if (responseCompleted || response.writableEnded) {
          return;
        }
        if (!clientDisconnected) {
          clientDisconnected = true;
          upstreamAbortController.abort(new Error(clientDisconnectMessage));
        }
        onClientDisconnect?.();
      };

      response.once("finish", () => {
        responseCompleted = true;
        onResponseFinish?.();
      });
      response.once("close", handleClientDisconnect);
      response.on("error", () => {
        // Client-side write failures (EPIPE / ECONNRESET when the client closes
        // mid-stream, common during tool execution) must not crash the main
        // process as an Uncaught Exception. Swallow them here; the close handler
        // above already records the disconnect via writeStreamLog.
        handleClientDisconnect();
      });

      const writeRequestLog = (
        statusCode: number,
        responseHeaders: Headers,
        responseBodyText = "",
        responseBodyTruncated = false,
        error?: string,
        responseBodySizeBytes = Buffer.byteLength(responseBodyText)
      ) => {
        const config = this.config;
        if (!config || !shouldRecordRequestLogs(config)) {
          return;
        }
        const successful = statusCode >= 200 && statusCode < 400 && !error;
        const successSampleRate = config.observability.requestLogSuccessSampleRate ?? 1;
        if (successful && !requestLogSampled(requestId, successSampleRate)) {
          markGatewayRequestLogDropped(requestId, "sampled");
          return;
        }
        const bodyCapture = config.observability.requestLogBodyCapture ?? "all";
        const captureBody = bodyCapture === "all" || (bodyCapture === "errors" && !successful);
        recordGatewayRequestLog({
          bodyCapturePolicy: bodyCapture,
          captureBody,
          client,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          error,
          fallbackModel: routedModel,
          maxBodyBytes: config.observability.requestLogMaxBodyBytes,
          method,
          model: routedModel,
          path,
          providerName: resolveProviderLogName(responseHeaders, config, routedModel),
          pricing: providerModelPricingForUsage(
            config,
            resolveProviderLogName(responseHeaders, config, routedModel),
            routedModel
          ),
          providerProtocol: resolveResponseProviderProtocol(responseHeaders, this.config),
          requestedModel,
          requestBody: shouldSendBody(method) ? bodyToForward ?? Buffer.alloc(0) : Buffer.alloc(0),
          requestHeaders: headers,
          requestId,
          resolvedModel: routedModel,
          routeTrace: routeTrace?.finish({ captureBodyValues: captureBody }),
          responseBodyText,
          responseBodySizeBytes,
          responseBodyTruncated,
          responseHeaders,
          responseModel: requestLogResponseModel(responseBodyText),
          startedAt: startedAtIso,
          statusCode,
          url: requestUrl
        });
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

      if (shouldApplyGatewayRouting(method, path)) {
        const routeAdaptationStartedAt = Date.now();
        const adaptation = adaptRouteRequestBody(path, takeJsonObject(bodyToForward ?? requestBody));
        if (adaptation.modelLocation === "path") {
          routeTrace?.capture({
            changes: [{ after: adaptation.body.model, operation: "add", path: "/body/model", scope: "body" }],
            durationMs: Date.now() - routeAdaptationStartedAt,
            kind: "mutation",
            name: "protocol-adapter.route-input",
            phase: "routing",
            startedAtMs: routeAdaptationStartedAt
          });
        }
        const routed = await this.plugin.routeRequest({
          body: adaptation.body,
          bodyOwnership: "owned",
          headers: headers as Record<string, string | string[] | undefined>,
          method,
          trace: routeTrace,
          url: request.url ?? path
        });
        const serialized = serializeJsonBody(restoreRouteRequestBody(routed.body, adaptation));
        headers["content-type"] = "application/json";
        headers["x-ccr-route-reason"] = sanitizeHeaderValue(routed.decision.reason);
        headers["x-ccr-route-source"] = routed.decision.source;
        if (routed.decision.diagnostics.length > 0) {
          headers["x-ccr-route-diagnostics"] = String(routed.decision.diagnostics.length);
        }
        routeFallback = routed.decision.fallback ?? routeFallback;
        if (routed.decision.model) {
          headers["x-ccr-routed-model"] = sanitizeHeaderValue(routed.decision.model);
          routedModel = routed.decision.model;
        }
        bodyToForward = serialized;
        routeTrace?.capture({
          changes: [
            { operation: "replace", path: "/body", scope: "body" },
            { after: headers["content-type"], operation: "replace", path: "/headers/content-type", scope: "headers" },
            { after: headers["x-ccr-route-reason"], operation: "add", path: "/headers/x-ccr-route-reason", scope: "headers" },
            { after: headers["x-ccr-route-source"], operation: "add", path: "/headers/x-ccr-route-source", scope: "headers" },
            ...(routedModel ? [{ after: routedModel, operation: "add" as const, path: "/headers/x-ccr-routed-model", scope: "headers" as const }] : [])
          ],
          decision: {
            diagnostics: routed.decision.diagnostics,
            reason: routed.decision.reason,
            source: routed.decision.source
          },
          kind: "mutation",
          name: "router.route-output",
          phase: "routing",
          target: routedModel ? { model: routedModel } : undefined
        });
      }

      const codexBridgeStartedAt = Date.now();
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
        routeTrace?.capture({
          changes: [
            { operation: "replace", path: "/body", scope: "body" },
            { after: headers["x-ccr-codex-patch-bridge"], operation: "add", path: "/headers/x-ccr-codex-patch-bridge", scope: "headers" },
            { after: headers["content-type"], operation: "replace", path: "/headers/content-type", scope: "headers" }
          ],
          durationMs: Date.now() - codexBridgeStartedAt,
          kind: "mutation",
          name: "compatibility.codex-apply-patch",
          phase: "compatibility",
          startedAtMs: codexBridgeStartedAt
        });
      }

      const capabilityRoutingStartedAt = Date.now();
      const capabilityBodyBefore = bodyToForward;
      const capabilityFallbackBefore = routeFallback;
      const capabilityModelBefore = routedModel;
      const capabilityProviderHeadersBefore = {
        gateway: headers["x-gateway-target-provider"],
        list: headers["x-target-providers"],
        target: headers["x-target-provider"]
      };
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
      routeTrace?.capture({
        changes: [
          ...(capabilityBodyBefore === bodyToForward ? [] : [{ operation: "replace" as const, path: "/body/model", scope: "body" as const }]),
          reportedRouteChange("routing", "/routing/model", capabilityModelBefore, routedModel),
          ...(capabilityFallbackBefore === routeFallback ? [] : [{ after: routeFallback, before: capabilityFallbackBefore, operation: "replace" as const, path: "/routing/fallback", scope: "routing" as const }]),
          reportedRouteChange("headers", "/headers/x-target-provider", capabilityProviderHeadersBefore.target, headers["x-target-provider"]),
          reportedRouteChange("headers", "/headers/x-target-providers", capabilityProviderHeadersBefore.list, headers["x-target-providers"]),
          reportedRouteChange("headers", "/headers/x-gateway-target-provider", capabilityProviderHeadersBefore.gateway, headers["x-gateway-target-provider"])
        ].filter(isReportedRouteChange),
        durationMs: Date.now() - capabilityRoutingStartedAt,
        kind: "mutation",
        name: "provider.capability-routing",
        phase: "capability",
        startedAtMs: capabilityRoutingStartedAt,
        target: routedModel ? { model: routedModel } : undefined
      });

      const hostedWebSearchProtocolContext = createHostedWebSearchProtocolContext({
        body: bodyToForward,
        config: this.config,
        method,
        path,
        requestId,
        routedModel,
        sinceMs: startedAt - 1_000
      });

      if (hostedWebSearchProtocolContext) {
        const records = await selectHostedWebSearchProtocolRecords(
          hostedWebSearchProtocolContext,
          this.browserWebSearchMcpIntegration,
          this.config
        ).catch((error) => {
          console.warn(`[gateway] Failed to prefetch hosted web search results: ${formatError(error)}`);
          return [] as BrowserWebSearchProtocolRecord[];
        });
        if (records.length > 0) {
          hostedWebSearchProtocolContext.records = records;
          const webSearchEnrichmentStartedAt = Date.now();
          const webSearchContextBody = prepareHostedWebSearchProtocolRequestBody(
            bodyToForward,
            records,
            hostedWebSearchProtocolContext
          );
          if (webSearchContextBody) {
            bodyToForward = webSearchContextBody;
            headers["content-type"] = "application/json";
            headers["x-ccr-hosted-web-search-context"] = hostedWebSearchProtocolContext.protocol;
            routeTrace?.capture({
              changes: [
                { operation: "replace", path: "/body/tools", scope: "body" },
                { after: headers["x-ccr-hosted-web-search-context"], operation: "add", path: "/headers/x-ccr-hosted-web-search-context", scope: "headers" }
              ],
              durationMs: Date.now() - webSearchEnrichmentStartedAt,
              kind: "mutation",
              name: "enrichment.hosted-web-search",
              phase: "enrichment",
              startedAtMs: webSearchEnrichmentStartedAt,
              target: { protocol: hostedWebSearchProtocolContext.protocol }
            });
          }
        }
        if (records.length === 0 && !this.browserWebSearchMcpIntegration) {
          const message = hostedWebSearchUnavailableMessage(this.config, hostedWebSearchProtocolContext.toolName);
          const responseHeaders = new Headers({ "content-type": "application/json; charset=utf-8" });
          const responseBody = JSON.stringify({ error: { message } });
          writeRequestLog(503, responseHeaders, responseBody, false, message);
          sendJson(response, 503, { error: { message } });
          return;
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
        const webSearchContinuationStartedAt = Date.now();
        const webSearchContinuationBody = prepareClaudeCodeWebSearchContinuationRequestBody(
          bodyToForward,
          records,
          claudeCodeWebSearchContinuationContext
        );
        if (webSearchContinuationBody) {
          bodyToForward = webSearchContinuationBody;
          headers["content-type"] = "application/json";
          headers["x-ccr-claude-code-web-search-continuation"] = records.length > 0 ? "in-app-browser-evidence" : "tool-result-evidence";
          routeTrace?.capture({
            changes: [
              { operation: "replace", path: "/body/messages", scope: "body" },
              { after: headers["x-ccr-claude-code-web-search-continuation"], operation: "add", path: "/headers/x-ccr-claude-code-web-search-continuation", scope: "headers" }
            ],
            durationMs: Date.now() - webSearchContinuationStartedAt,
            kind: "mutation",
            name: "enrichment.web-search-continuation",
            phase: "enrichment",
            startedAtMs: webSearchContinuationStartedAt
          });
        }
      }

      let upstreamPath = path;
      const requestProtocol = requestProtocolForPath(path) ?? (isCodexResponsesCompactPath(path) ? "openai_responses" : undefined);
      const contextArchiveToolContinuation = prepareContextArchiveToolContinuationRequest({
        apiKey,
        body: bodyToForward,
        config: this.config,
        method,
        path,
        protocol: requestProtocol
      });
      if (contextArchiveToolContinuation) {
        bodyToForward = contextArchiveToolContinuation.body;
        headers["content-type"] = "application/json";
        headers["x-ccr-context-archive-tool"] = "available";
        routeTrace?.capture({
          changes: [
            { operation: "replace", path: "/body", scope: "body" },
            { after: headers["x-ccr-context-archive-tool"], operation: "add", path: "/headers/x-ccr-context-archive-tool", scope: "headers" },
            { after: headers["content-type"], operation: "replace", path: "/headers/content-type", scope: "headers" }
          ],
          kind: "mutation",
          name: "enrichment.context-archive-tool-continuation",
          phase: "enrichment",
          target: { protocol: contextArchiveToolContinuation.protocol }
        });
      }

      let contextArchiveRecord: ContextArchiveRecord | undefined;
      let contextArchiveResponseContentType: string | undefined;
      let contextArchiveResponseMode: ContextArchiveResponseMode | undefined;
      let codexCompactCompatResponseMode: ContextArchiveResponseMode | undefined;
      const contextArchiveStartedAt = Date.now();
      const contextArchivePreparation = await prepareContextArchiveRequest({
        apiKey,
        body: bodyToForward,
        config: this.config,
        headers,
        method,
        path,
        protocol: requestProtocol,
        requestId
      });
      const contextArchiveRequestConfig = contextArchivePreparation?.config ?? this.config;
      if (contextArchivePreparation) {
        bodyToForward = contextArchivePreparation.body;
        contextArchiveRecord = contextArchivePreparation.record;
        contextArchiveResponseContentType = contextArchivePreparation.responseContentType;
        contextArchiveResponseMode = contextArchivePreparation.responseMode;
        upstreamPath = contextArchivePreparation.upstreamPath ?? upstreamPath;
        headers["content-type"] = "application/json";
        headers["x-ccr-context-archive"] = sanitizeHeaderValue(contextArchivePreparation.diagnostic);
        routeTrace?.capture({
          changes: [
            { operation: "replace", path: "/body", scope: "body" },
            ...(contextArchivePreparation.upstreamPath ? [{ before: path, after: upstreamPath, operation: "replace" as const, path: "/url/path", scope: "url" as const }] : []),
            { after: headers["x-ccr-context-archive"], operation: "add", path: "/headers/x-ccr-context-archive", scope: "headers" },
            { after: headers["content-type"], operation: "replace", path: "/headers/content-type", scope: "headers" }
          ],
          durationMs: Date.now() - contextArchiveStartedAt,
          kind: "mutation",
          name: "enrichment.context-archive",
          phase: "enrichment",
          startedAtMs: contextArchiveStartedAt
        });
      }

      const codexCompactCompatStartedAt = Date.now();
      const codexCompactCompatPreparation = contextArchivePreparation
        ? undefined
        : prepareCodexCompactCompatRequest({
            body: bodyToForward,
            method,
            path,
            protocol: requestProtocol
          });
      if (codexCompactCompatPreparation) {
        bodyToForward = codexCompactCompatPreparation.body;
        contextArchiveResponseContentType = codexCompactCompatPreparation.responseContentType;
        contextArchiveResponseMode = codexCompactCompatPreparation.responseMode;
        codexCompactCompatResponseMode = codexCompactCompatPreparation.responseMode;
        upstreamPath = codexCompactCompatPreparation.upstreamPath ?? upstreamPath;
        headers["content-type"] = "application/json";
        headers["x-ccr-codex-compact"] = sanitizeHeaderValue(codexCompactCompatPreparation.diagnostic);
        routeTrace?.capture({
          changes: [
            { operation: "replace", path: "/body", scope: "body" },
            ...(codexCompactCompatPreparation.upstreamPath ? [{ before: path, after: upstreamPath, operation: "replace" as const, path: "/url/path", scope: "url" as const }] : []),
            { after: headers["x-ccr-codex-compact"], operation: "add", path: "/headers/x-ccr-codex-compact", scope: "headers" },
            { after: headers["content-type"], operation: "replace", path: "/headers/content-type", scope: "headers" }
          ],
          durationMs: Date.now() - codexCompactCompatStartedAt,
          kind: "mutation",
          name: "compatibility.codex-compact",
          phase: "compatibility",
          startedAtMs: codexCompactCompatStartedAt
        });
      }

      const contentLengthHeader = headers["content-length"];
      delete headers["content-length"];
      const upstreamPreparationChanges: RequestRouteTraceChange[] = contentLengthHeader === undefined
        ? []
        : [{ before: contentLengthHeader, operation: "remove", path: "/headers/content-length", scope: "headers" }];
      const upstreamUrl = new URL(upstreamPath, this.status.coreEndpoint).toString();
      let upstreamResult: UpstreamFetchResult;

      try {
        upstreamResult = await fetchUpstreamWithFallback({
          body: bodyToForward,
          config: this.config,
          fallback: routeFallback,
          headers,
          method,
          path: upstreamPath,
          preparationChanges: upstreamPreparationChanges,
          routedModel,
          coreAuthToken: this.coreAuthToken,
          signal: upstreamAbortController.signal,
          trace: routeTrace,
          upstreamUrl
        });
      } catch (error) {
        failContextArchiveRequest(contextArchiveRecord, contextArchiveRequestConfig);
        const failedAttempts = error instanceof UpstreamRequestError ? error.failedAttempts : [];
        const message = formatUpstreamErrorForLog(error, {
          attempts: Math.max(1, failedAttempts.length),
          elapsedMs: Date.now() - startedAt,
          fallbackFailures: Math.max(0, failedAttempts.length - 1),
          operation: "fetch",
          responseStarted: false,
          retryDelayMs: failedAttempts.reduce((total, attempt) => total + Math.max(0, attempt.delayMs ?? 0), 0)
        });
        if (error instanceof UpstreamRequestError) {
          bodyToForward = error.attempt?.body ?? bodyToForward;
          routedModel = error.attempt?.model ?? routedModel;
        }
        if (clientDisconnected || upstreamAbortController.signal.aborted) {
          writeRequestLog(clientClosedRequestStatusCode, new Headers(), "", false, clientDisconnectMessage);
          return;
        }
        if (shouldCaptureUsage) {
          recordUsage({
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
      if (contextArchiveToolContinuation && upstreamResult.response.ok) {
        upstreamResult = await resolveContextArchiveToolContinuation({
          context: contextArchiveToolContinuation,
          coreAuthToken: this.coreAuthToken,
          executor: (input: ContextArchiveReplayInput) => this.replayContextArchive(input),
          fallback: routeFallback,
          headers,
          method,
          path: upstreamPath,
          routedModel,
          signal: upstreamAbortController.signal,
          upstreamResult,
          upstreamUrl
        });
        bodyToForward = upstreamResult.attempt.body ?? bodyToForward;
        routedModel = upstreamResult.attempt.model ?? routedModel;
      }
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
      if (upstreamResponse.ok) {
        finalizeContextArchiveRequest(contextArchiveRecord, {
          credentialChain: upstreamResult.attempt.credentialChain,
          credentialIds: upstreamResult.attempt.credentialIds,
          logicalProvider: upstreamResult.attempt.logicalProvider,
          providerProtocol: upstreamResult.attempt.credentialProtocol,
          routedModel
        }, contextArchiveRequestConfig);
      } else {
        failContextArchiveRequest(contextArchiveRecord, contextArchiveRequestConfig);
      }
      if (clientDisconnected || upstreamAbortController.signal.aborted) {
        await cancelResponseBody(upstreamResponse);
        writeRequestLog(clientClosedRequestStatusCode, responseHeaders, "", false, clientDisconnectMessage);
        return;
      }
      const appendContextArchiveFooter = Boolean(contextArchiveRecord && upstreamResponse.ok);
      const transformCodexCompactResponse = Boolean(!contextArchiveRecord && codexCompactCompatResponseMode && upstreamResponse.ok);
      const contextArchiveSourceContentType = responseHeaders.get("content-type") ?? undefined;
      if (codexApplyPatchBridgeActive || appendContextArchiveFooter || transformCodexCompactResponse) {
        responseHeaders.delete("content-length");
      }
      if ((appendContextArchiveFooter || transformCodexCompactResponse) && contextArchiveResponseContentType) {
        responseHeaders.set("content-type", contextArchiveResponseContentType);
      }
      if (contextArchiveToolContinuation?.executedCalls) {
        responseHeaders.set("x-ccr-context-archive-tool-calls", String(contextArchiveToolContinuation.executedCalls));
      }
      const hostedWebSearchResponseContentType = responseHeaders.get("content-type")?.toLowerCase() ?? "";
      if (
        hostedWebSearchProtocolContext &&
        (hostedWebSearchResponseContentType.includes("application/json") ||
          hostedWebSearchResponseContentType.includes("text/event-stream")) &&
        (hostedWebSearchProtocolContext.records?.length ||
          this.browserWebSearchMcpIntegration?.recentBrowserWebSearchResults ||
          this.browserWebSearchMcpIntegration?.runBrowserWebSearch)
      ) {
        responseHeaders.delete("content-length");
      }
      recordProviderCredentialOutcome(this.config, method, upstreamResult.attempt, upstreamResponse.status, responseHeaders);
      if (clientDisconnected || response.destroyed) {
        await cancelResponseBody(upstreamResponse);
        writeRequestLog(clientClosedRequestStatusCode, responseHeaders, "", false, clientDisconnectMessage);
        return;
      }
      response.writeHead(upstreamResponse.status, Object.fromEntries(filteredResponseHeaders(responseHeaders)));
      if (!upstreamResponse.body) {
        if (shouldCaptureUsage) {
          recordUsage({
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
      const hostedWebSearchResponseBody = hostedWebSearchProtocolContext
        ? hostedWebSearchProtocolResponseStream(
            patchedResponseBody,
            responseHeaders,
            hostedWebSearchProtocolContext,
            this.browserWebSearchMcpIntegration
          )
        : patchedResponseBody;
      const archiveResponseProtocol = requestProtocolForPath(upstreamPath) ?? requestProtocol ?? "anthropic_messages";
      const responseBody = appendContextArchiveFooter && contextArchiveRecord
        ? contextArchiveHandoffResponseStream(
            hostedWebSearchResponseBody,
            contextArchiveRecord,
            archiveResponseProtocol,
            contextArchiveSourceContentType,
            contextArchiveResponseMode
          )
        : transformCodexCompactResponse && codexCompactCompatResponseMode
          ? codexCompactResponseStream(
              hostedWebSearchResponseBody,
              archiveResponseProtocol,
              contextArchiveSourceContentType,
              codexCompactCompatResponseMode
            )
          : hostedWebSearchResponseBody;
      const responseStreams = uniqueStreams([upstreamBody, patchedResponseBody, hostedWebSearchResponseBody, responseBody]);
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
        const outcome = resolveStreamRequestLogOutcome({
          clientDisconnected,
          detectedError: streamDetectedError,
          streamError: error,
          terminalEventSeen: sseErrorDetector.hasTerminalEvent(),
          upstreamStatus: upstreamResponse.status
        });
        writeRequestLog(
          outcome.statusCode,
          responseHeaders,
          sampler.read(),
          sampler.isTruncated(),
          outcome.error,
          sampler.sizeBytes()
        );
      };
      onClientDisconnect = () => {
        streamDetectedError ??= sseErrorDetector.finish();
        writeStreamLog();
        responseBody.unpipe(response);
        destroyResponseStreams(responseStreams);
      };
      onResponseFinish = () => {
        if (upstreamStreamEnded) {
          writeStreamLog();
        }
      };
      const onResponseStreamError = (error: Error) => {
        failContextArchiveRequest(contextArchiveRecord, contextArchiveRequestConfig);
        streamDetectedError ??= sseErrorDetector.finish();
        writeStreamLog(clientDisconnected ? clientDisconnectMessage : formatUpstreamErrorForLog(error, {
          attempts: upstreamResult.failedAttempts.length + 1,
          elapsedMs: Date.now() - startedAt,
          fallbackFailures: upstreamResult.failedAttempts.length,
          operation: "stream",
          responseStarted: true,
          retryDelayMs: upstreamResult.failedAttempts.reduce(
            (total, attempt) => total + Math.max(0, attempt.delayMs ?? 0),
            0
          )
        }));
      };
      for (const stream of responseStreams) {
        stream.on("error", onResponseStreamError);
      }
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
      if (shouldCaptureUsage) {
        responseBody.once("end", () => {
          recordUsage({
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
      if (clientDisconnected || response.destroyed) {
        onClientDisconnect();
        return;
      }
      responseBody.pipe(response);
    }

  async replayContextArchive(input: ContextArchiveReplayInput): Promise<ContextArchiveReplayResult> {
    const config = this.config;
    if (!config || !this.coreAuthToken || !this.status.coreEndpoint) {
      throw new Error("ARCHIVE_REPLAY_UNAVAILABLE: Gateway runtime is not ready.");
    }
    const route = input.snapshot.route;
    if (!route) {
      throw new Error(`ARCHIVE_ROUTE_UNAVAILABLE: Archive ${input.snapshot.archiveId} has no finalized route.`);
    }

    const headers: Record<string, string> = {
      ...input.snapshot.replayHeaders,
      "content-type": "application/json",
      "x-ccr-context-archive-replay": input.snapshot.archiveId,
      "x-client-request-id": randomUUID()
    };
    if (route.credentialChain?.length) {
      headers["x-target-providers"] = route.credentialChain.join(",");
    } else if (route.logicalProvider) {
      headers["x-gateway-target-provider"] = route.logicalProvider;
    }

    const upstreamUrl = new URL(input.snapshot.path, this.status.coreEndpoint).toString();
    const result = await fetchUpstreamWithFallback({
      body: input.body,
      config,
      fallback: { mode: "off", models: [], retryCount: 1 },
      headers,
      method: input.snapshot.method,
      path: input.snapshot.path,
      routedModel: route.routedModel,
      coreAuthToken: this.coreAuthToken,
      signal: input.signal,
      upstreamUrl
    });
    const responseHeaders = upstreamResponseHeaders(result);
    return {
      body: Buffer.from(await result.response.arrayBuffer()),
      contentType: responseHeaders.get("content-type") ?? undefined,
      statusCode: result.response.status
    };
  }
}
