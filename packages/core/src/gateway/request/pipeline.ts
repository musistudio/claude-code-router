import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ApiKeyConfig, AppConfig } from "@ccr/core/contracts/app";
import { createSseErrorDetector, recordGatewayRequestLog, updateGatewayRequestLogFromRawTrace, type RequestLogRawTraceUpdateInput } from "@ccr/core/observability/request-log-store";
import { recordGatewayUsageCapture, type UsageCaptureInput } from "@ccr/core/usage/store";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin";
import { adaptRouteRequestBody, restoreRouteRequestBody } from "@ccr/core/routing/protocol-adapter";
import { reserveApiKeyLimits } from "@ccr/core/gateway/auth/api-key-authorizer";
import { recordProviderCredentialOutcome } from "@ccr/core/providers/credential-pool";
import { codexApplyPatchBridgeResponseStream, prepareCodexApplyPatchBridgeRequest } from "@ccr/core/gateway/features/codex-patch-bridge";
import { prepareCursorOpenAICompatChatBody } from "@ccr/core/gateway/features/cursor-compat";
import { filteredResponseHeaders, formatError, formatUpstreamErrorForLog, forwardHeaders, inferGatewayClient, parseJsonObject, readRequestBody, sendJson, shouldCaptureGatewayUsage, shouldSendBody, stripLocalGatewayAuthHeaders } from "@ccr/core/gateway/http/io";
import { createGatewayModelsResponse, prepareClaudeAppDiscoveredModelRequest, prepareClaudeCodeDiscoveredModelRequest, shouldServeGatewayModelsResponse } from "@ccr/core/gateway/features/model-discovery";
import { resolveProviderLogName, resolveResponseProviderProtocol, sanitizeHeaderValue } from "@ccr/core/providers/runtime-topology";
import { createBodySampler, shouldRecordRequestLogs } from "@ccr/core/observability/raw-trace-sync";
import { endpoint } from "@ccr/core/gateway/core-runtime/supervisor";
import { coreGatewayUsageAttributionConfig } from "@ccr/core/gateway/core-runtime/config-compiler";
import { clientClosedRequestStatusCode, clientDisconnectMessage, resolveStreamRequestLogOutcome, UpstreamRequestError } from "@ccr/core/gateway/internal/shared";
import type { BrowserWebSearchMcpIntegration, BrowserWebSearchProtocolRecord, UpstreamFetchResult } from "@ccr/core/gateway/internal/shared";
import { applyProviderCapabilityRouting, cancelResponseBody, destroyResponseStreams, fetchUpstreamWithFallback, mergeFallbackResponseHeaders, rewriteCapabilityResponseHeaders, uniqueStreams, upstreamResponseHeaders } from "@ccr/core/gateway/upstream/executor";
import { shouldApplyGatewayRouting } from "@ccr/core/routing/protocol-endpoints";
import { createClaudeCodeWebSearchContinuationContext, createHostedWebSearchProtocolContext, hostedWebSearchProtocolResponseStream, hostedWebSearchUnavailableMessage, prepareClaudeCodeWebSearchContinuationRequestBody, prepareHostedWebSearchProtocolRequestBody, selectClaudeCodeWebSearchContinuationRecords, selectHostedWebSearchProtocolRecords } from "@ccr/core/gateway/features/hosted-web-search/index";

export type GatewayRequestPipelineDependencies = {
  getBrowserWebSearchMcpIntegration: () => BrowserWebSearchMcpIntegration | undefined;
  getConfig: () => AppConfig | undefined;
  getCoreAuthToken: () => string;
  getPlugin: () => ClaudeCodeRouterPlugin | undefined;
  getStatus: () => { coreEndpoint: string; endpoint: string };
  takePendingRawTraceUpdate: (requestId: string) => RequestLogRawTraceUpdateInput | undefined;
};

export class GatewayRequestPipeline {
  constructor(private readonly dependencies: GatewayRequestPipelineDependencies) {}

  private get browserWebSearchMcpIntegration() { return this.dependencies.getBrowserWebSearchMcpIntegration(); }
  private get config() { return this.dependencies.getConfig(); }
  private get coreAuthToken() { return this.dependencies.getCoreAuthToken(); }
  private get plugin() { return this.dependencies.getPlugin(); }
  private get status() { return this.dependencies.getStatus(); }
  private takePendingRawTraceUpdate(requestId: string) { return this.dependencies.takePendingRawTraceUpdate(requestId); }

  async proxyRequest(request: IncomingMessage, response: ServerResponse, path: string, apiKey?: ApiKeyConfig): Promise<void> {
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
      const claudeAppModelRewrite = prepareClaudeAppDiscoveredModelRequest(this.config, method, path, bodyToForward);
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
      const usageAttributionConfig = coreGatewayUsageAttributionConfig(this.config);
      const recordUsage = (input: Omit<UsageCaptureInput, "config">) => {
        void recordGatewayUsageCapture({ ...input, config: usageAttributionConfig });
      };
      const requestUrl = new URL(request.url || path, this.status.endpoint || "http://127.0.0.1").toString();
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
  
      if (shouldApplyGatewayRouting(method, path)) {
        const adaptation = adaptRouteRequestBody(path, parseJsonObject(bodyToForward ?? requestBody));
        const routed = await this.plugin.routeRequest({
          body: adaptation.body,
          headers: headers as Record<string, string | string[] | undefined>,
          method,
          url: request.url ?? path
        });
        const serialized = Buffer.from(`${JSON.stringify(restoreRouteRequestBody(routed.body, adaptation))}\n`, "utf8");
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
      if (clientDisconnected || upstreamAbortController.signal.aborted) {
        await cancelResponseBody(upstreamResponse);
        writeRequestLog(clientClosedRequestStatusCode, responseHeaders, "", false, clientDisconnectMessage);
        return;
      }
      if (codexApplyPatchBridgeActive) {
        responseHeaders.delete("content-length");
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
      const responseBody = hostedWebSearchProtocolContext
        ? hostedWebSearchProtocolResponseStream(
            patchedResponseBody,
            responseHeaders,
            hostedWebSearchProtocolContext,
            this.browserWebSearchMcpIntegration
          )
        : patchedResponseBody;
      const responseStreams = uniqueStreams([upstreamBody, patchedResponseBody, responseBody]);
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
          outcome.error
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
}
