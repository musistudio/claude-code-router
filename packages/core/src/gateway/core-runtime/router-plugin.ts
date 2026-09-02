import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ApiKeyConfig, AppConfig, GatewayProviderConfig, GatewayProviderProtocol, ProfileConfig, RouterRule } from "@ccr/core/contracts/app";
import {
  claudeCodeWifTokenPath,
  exchangeClaudeCodeWifToken,
  resolveApiKeyFromHeaders
} from "@ccr/core/gateway/auth/api-key-authorizer";
import { ccrRemoteControlPathPrefix, ccrRemoteControlService } from "@ccr/core/gateway/remote-control-service";
import {
  ClaudeCodeRouterPlugin,
  type ClaudeCodeRouteDecision
} from "@ccr/core/gateway/claude-code-router-plugin";
import {
  ccrCodexApplyPatchBridgeHeader,
  ccrCodexBridgeRequestTransformKey,
  ccrCodexBridgeResponseHookKey,
  ccrCodexBridgeStreamHookKey,
  ccrCodexMultiAgentBridgeHeader,
  ccrOpenRouterDiscountFinalizeResponseHookKey,
  ccrOpenRouterDiscountFinalizeStreamHookKey,
  ccrOpenRouterDiscountRequestIdHeader,
  ccrRouteDiagnosticsHeader,
  ccrRouteFallbackHeader,
  ccrRouteHeaderNames,
  ccrRouteReasonHeader,
  ccrRouteSessionIdHeader,
  ccrRouteSourceHeader,
  ccrRouteStageHeader,
  ccrRouteTokenCountHeader,
  ccrRawTraceSyncAckRouteKey,
  ccrRuntimeConfigReloadMessageType,
  ccrRoutedModelHeader,
  ccrRouterHttpRouteKey,
  ccrRouterHttpRoutePath,
  ccrRouterRouteResolverKey,
  ccrRouterRequestTransformKey,
  encodeCcrRouteFallbackHeader,
  type CcrRouterPluginRouteRequest
} from "@ccr/core/gateway/core-runtime/router-plugin-contract";
import { coreGatewayAuthHeader, rawTraceSyncHeader, rawTraceSyncPath, sdkCompatibleTokenHeaderNames } from "@ccr/core/gateway/internal/shared";
import { gatewayRuntimeConfigControlPath, gatewayRuntimeConfigRevision } from "@ccr/core/gateway/runtime-config-control";
import {
  createClaudeCliBootstrapResponse,
  createGatewayModelsResponse,
  resolveGatewayPublicModelId
} from "@ccr/core/gateway/features/model-discovery";
import {
  codexApplyPatchBridgeResponseStream,
  prepareCodexApplyPatchBridgeRequest,
  transformCodexApplyPatchBridgeResponseValue
} from "@ccr/core/gateway/features/codex-patch-bridge";
import {
  codexMultiAgentBridgeResponseStream,
  prepareCodexMultiAgentBridgeRequest,
  transformCodexMultiAgentBridgeResponseValue
} from "@ccr/core/gateway/features/codex-multi-agent-bridge";
import { requestLogRequestedModel } from "@ccr/core/observability/request-log-model";
import {
  finalizeOpenRouterDiscountProviderRouterSelection,
  openRouterDiscountProviderRouterTransform
} from "@ccr/core/plugins/built-ins/openrouter-discount-provider-router";
import type {
  GatewayPluginRequestTransformContext,
  GatewayPluginRequestTransformInput as CcrGatewayPluginRequestTransformInput
} from "@ccr/core/plugins/service";
import { isModelAllowedForProfile, profileForApiKey } from "@ccr/core/profiles/model-allowlist";
import { adaptRouteRequestBody, restoreRouteRequestBody } from "@ccr/core/routing/protocol-adapter";
import { requestProtocolForPath, shouldApplyGatewayRouting } from "@ccr/core/routing/protocol-endpoints";
import { RouteScriptRuntime } from "@ccr/core/routing/route-script-runtime";
import { modelRegistryForConfig, normalizeRouteSelector, parseProviderModelSelector, providerRuntimeId } from "@ccr/core/routing/model-registry";
import {
  activeProviderCredentials,
  normalizedProviderCapabilities,
  providerCapabilityForClientProtocol,
  providerCapabilityInternalName,
  providerCredentialInternalName,
  providerProtocolForClientProtocol,
  sanitizeHeaderValue,
  sortProviderCredentialsForConfig
} from "@ccr/core/providers/runtime-topology";

type GatewayPluginFactoryInput = {
  plugin?: {
    config?: unknown;
  };
};

type HeaderValue = string | string[] | undefined;
type GatewayPluginHttpRequest = {
  body?: unknown;
  headers?: Record<string, HeaderValue>;
  method?: string;
  raw?: IncomingMessage;
  url?: string;
};
type GatewayPluginHttpReply = {
  code(statusCode: number): {
    send(payload: unknown): unknown;
  };
  hijack?(): void;
  raw?: ServerResponse;
  send(payload: unknown): unknown;
};

type GatewayRequestHookInput = {
  request?: {
    headers?: Record<string, HeaderValue>;
    id?: string;
    method?: string;
    url?: string;
  };
};

type PublicGatewayAuthResult =
  | { ok: true; apiKey?: ApiKeyConfig }
  | { ok: false; error: string; status: number };

type GatewayRequestTransformInput = {
  model?: string;
  request?: {
    headers?: Record<string, HeaderValue>;
    id?: string;
    method?: string;
    url?: string;
  };
  requestBody?: unknown;
  route?: {
    method?: string;
    url?: string;
  };
  stage?: string;
};

type UpstreamRequest = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  url?: string;
};

type GatewayResponseHookInput = {
  model?: string;
  request?: {
    headers?: Record<string, HeaderValue>;
    id?: string;
    method?: string;
    url?: string;
  };
  responseHeaders?: Record<string, string>;
  responsePayload?: unknown;
  statusCode?: number;
  upstreamRequest?: UpstreamRequest;
  upstreamResponse?: Response;
};

type GatewayStreamHookInput = {
  model?: string;
  request?: {
    headers?: Record<string, HeaderValue>;
    id?: string;
    method?: string;
    url?: string;
  };
  upstreamRequest?: UpstreamRequest;
  upstreamResponse: Response;
};

type GatewayRouteResolution = {
  headers?: Record<string, string>;
  model?: string;
  reason?: string;
  requestBody?: Record<string, unknown>;
  targetProviderName?: string;
};

export async function createGatewayPlugin(input: GatewayPluginFactoryInput = {}) {
  const config = readAppConfig(input.plugin?.config);
  if (!config) {
    throw new Error("CCR router plugin requires plugin.config.appConfig.");
  }
  const publicGatewayMode = readPublicGatewayMode(input.plugin?.config);
  const coreAuthToken = readCoreAuthToken(input.plugin?.config);
  const publicAuthKeys = readPublicAuthKeys(input.plugin?.config);

  const scriptRuntime = hasScriptRules(config.Router.rules)
    ? new RouteScriptRuntime()
    : undefined;
  const scriptValidationErrors = scriptRuntime
    ? await scriptRuntime.prepare(config.Router.rules)
    : undefined;
  const router = new ClaudeCodeRouterPlugin(config, {
    scriptRuntime,
    scriptValidationErrors
  });
  const openRouterDiscountContext = openRouterDiscountTransformContext(config);

  return {
    httpRoutes: [{
      auth: "none",
      key: ccrRouterHttpRouteKey,
      method: "POST",
      path: ccrRouterHttpRoutePath,
      handler: async ({ request, reply }: { request: GatewayPluginHttpRequest; reply: GatewayPluginHttpReply }) => {
        if (!isCoreGatewayRequest(request.headers, coreAuthToken)) {
          return reply.code(401).send({ error: { message: "Unauthorized CCR router route." } });
        }
        const payload = readRouteRequestPayload(request.body);
        if (!payload) {
          return reply.code(400).send({
            error: {
              message: "CCR router plugin route requires a JSON body with body, method, and url."
            }
          });
        }

        return routeWithRouter(router, payload);
      }
    }, {
      auth: "none",
      key: "ccr-runtime-config-control",
      method: "ALL",
      path: gatewayRuntimeConfigControlPath,
      priority: "pre",
      handler: async ({ request, reply }: { request: GatewayPluginHttpRequest; reply: GatewayPluginHttpReply }) =>
        handleRuntimeConfigControlRoute(config, request, reply, coreAuthToken, publicAuthKeys)
    }, {
      auth: "none",
      key: ccrRawTraceSyncAckRouteKey,
      method: "POST",
      path: rawTraceSyncPath,
      priority: "pre",
      handler: ({ request, reply, config: gatewayConfig }: {
        request: GatewayPluginHttpRequest;
        reply: GatewayPluginHttpReply;
        config: unknown;
      }) => {
        const expectedToken = readRawTraceSyncToken(gatewayConfig);
        if (!expectedToken || readHeader(request.headers, rawTraceSyncHeader) !== expectedToken) {
          return reply.code(401).send({
            error: {
              message: "Unauthorized raw trace sync."
            }
          });
        }
        return reply.code(202).send({
          accepted: true,
          durable: false,
          localSpool: true,
          ok: true
        });
      }
    }, {
      auth: "none",
      key: "ccr-public-root",
      method: "GET",
      path: "/",
      priority: "pre",
      handler: () => ({
        core: "next-ai-gateway",
        endpoints: [
          "POST /v1/oauth/token",
          "GET /api/claude_cli/bootstrap",
          "POST /v1/messages",
          "POST /v1/messages/count_tokens",
          "GET /models",
          "GET /v1/models"
        ],
        name: "claude-code-router",
        plugin: "claude-code-router",
        wrapperPlugins: config.plugins.filter((plugin) => plugin.enabled !== false).map((plugin) => plugin.id)
      })
    }, {
      auth: "none",
      key: "ccr-public-remote-control-root",
      method: "ALL",
      path: ccrRemoteControlPathPrefix,
      priority: "pre",
      handler: async ({ request, reply }: { request: GatewayPluginHttpRequest; reply: GatewayPluginHttpReply }) =>
        handleRemoteControlRoute(config, request, reply, coreAuthToken, publicAuthKeys)
    }, {
      auth: "none",
      key: "ccr-public-remote-control",
      method: "ALL",
      path: `${ccrRemoteControlPathPrefix}/*`,
      priority: "pre",
      handler: async ({ request, reply }: { request: GatewayPluginHttpRequest; reply: GatewayPluginHttpReply }) =>
        handleRemoteControlRoute(config, request, reply, coreAuthToken, publicAuthKeys)
    }, {
      auth: "none",
      key: "ccr-public-wif-token",
      method: "POST",
      path: claudeCodeWifTokenPath,
      priority: "pre",
      handler: async ({ request, reply }: { request: GatewayPluginHttpRequest; reply: GatewayPluginHttpReply }) => {
        const result = await exchangeClaudeCodeWifToken(config, httpRequestBodyBuffer(request.body), { includePersisted: false });
        return reply.code(result.statusCode).send(result.payload);
      }
    }, {
      auth: "gateway",
      key: "ccr-public-models-v1",
      method: "GET",
      path: "/v1/models",
      priority: "pre",
      handler: async ({ request }: { request: GatewayPluginHttpRequest }) =>
        createGatewayModelsResponse(config, request.headers ?? {}, await resolveApiKey(config, request.headers))
    }, {
      auth: "gateway",
      key: "ccr-public-models",
      method: "GET",
      path: "/models",
      priority: "pre",
      handler: async ({ request }: { request: GatewayPluginHttpRequest }) =>
        createGatewayModelsResponse(config, request.headers ?? {}, await resolveApiKey(config, request.headers))
    }, {
      auth: "gateway",
      key: "ccr-public-claude-cli-bootstrap",
      method: "GET",
      path: "/api/claude_cli/bootstrap",
      priority: "pre",
      handler: async ({ request }: { request: GatewayPluginHttpRequest }) =>
        createClaudeCliBootstrapResponse(config, await resolveApiKey(config, request.headers))
    }, {
      auth: "gateway",
      key: "ccr-public-count-tokens",
      method: "POST",
      path: "/v1/messages/count_tokens",
      priority: "pre",
      handler: async ({ request, reply }: { request: GatewayPluginHttpRequest; reply: GatewayPluginHttpReply }) => {
        const body = isRecord(request.body) ? request.body : {};
        const apiKey = await resolveApiKey(config, request.headers);
        const requestedModel = requestLogRequestedModel(httpRequestBodyBuffer(body), requestPath(request.url ?? "/v1/messages/count_tokens"));
        const profile = profileForApiKey(config, apiKey);
        if (requestedModel && !isModelAllowedForProfile(config, profile, requestedModel)) {
          return reply.code(403).send(profileModelNotAllowedError(requestedModel));
        }
        return router.countTokens(body);
      }
    }],
    requestHooks: [{
      key: "ccr-public-auth-context",
      beforeAuth: async (requestInput: GatewayRequestHookInput) => {
        if (publicGatewayMode) {
          stripUntrustedCcrRouteHeaders(requestInput.request?.headers);
          const authorization = await resolvePublicGatewayAuth(config, requestInput.request?.headers, {
            coreAuthToken,
            publicAuthKeys,
            rejectMissing: false
          });
          if (!authorization.ok) {
            return {
              ok: false,
              status: authorization.status,
              error: authorization.error
            };
          }
          setApiKeyAuthContextHeaders(requestInput.request?.headers, authorization.apiKey);
          return undefined;
        }
        const apiKey = await resolveApiKey(config, requestInput.request?.headers);
        setApiKeyAuthContextHeaders(requestInput.request?.headers, apiKey);
        return undefined;
      }
    }],
    requestTransforms: [{
      key: ccrRouterRequestTransformKey,
      stage: "beforeRouting",
      transform: async (requestInput: GatewayRequestTransformInput) => {
        if (readHeader(requestInput.request?.headers, ccrRoutedModelHeader)) {
          return undefined;
        }

        const method = requestInput.route?.method ?? requestInput.request?.method ?? "GET";
        const url = requestInput.route?.url ?? requestInput.request?.url ?? "/";
        const path = requestPath(url);
        if (!shouldApplyGatewayRouting(method, path) || !isRecord(requestInput.requestBody)) {
          return undefined;
        }

        const apiKey = await resolveApiKey(config, requestInput.request?.headers);
        const profile = profileForApiKey(config, apiKey);
        const modelBeforeRouting = requestedModelFromBody(requestInput.requestBody, path, requestInput.model);
        const routeResponse = await routeWithRouter(router, {
          body: requestInput.requestBody,
          headers: requestInput.request?.headers,
          method,
          path,
          url
        });
        const deniedModel = profileDeniedModel(
          config,
          profile,
          modelBeforeRouting,
          routeResponse.decision.model ?? requestedModelFromBody(routeResponse.body, path, requestInput.model)
        );
        if (deniedModel) {
          return {
            ok: false,
            status: 403,
            error: `Model "${deniedModel}" is not allowed for this profile.`,
            details: {
              code: "profile_model_not_allowed"
            }
          };
        }
        const discountTransform = await applyOpenRouterDiscountTransform(
          routeResponse,
          requestInput,
          method,
          path,
          url,
          openRouterDiscountContext
        );
        const headers = decisionHeaders(routeResponse.decision);
        return {
          headers: {
            ...headers,
            ...(discountTransform?.headers ?? {})
          },
          model: discountTransform?.routedModel ?? routeResponse.decision.model ?? requestInput.model,
          requestBody: discountTransform?.body ?? routeResponse.body,
          ...(discountTransform?.responseHeaders ? { responseHeaders: discountTransform.responseHeaders } : {})
        };
      }
    }, {
      key: ccrCodexBridgeRequestTransformKey,
      stage: "beforeUpstream",
      transform: (requestInput: GatewayRequestTransformInput) =>
        applyCodexBridgeRequestTransform(config, requestInput)
    }],
    responseHooks: [{
      key: ccrCodexBridgeResponseHookKey,
      transformResponse: (responseInput: GatewayResponseHookInput) =>
        applyCodexBridgeResponseTransform(responseInput)
    }, {
      key: ccrOpenRouterDiscountFinalizeResponseHookKey,
      transformResponse: (responseInput: GatewayResponseHookInput) => {
        finalizeOpenRouterDiscountSelection(responseInput);
        return undefined;
      }
    }],
    streamHooks: [{
      key: ccrCodexBridgeStreamHookKey,
      transformResponse: (streamInput: GatewayStreamHookInput) =>
        applyCodexBridgeStreamTransform(streamInput)
    }, {
      key: ccrOpenRouterDiscountFinalizeStreamHookKey,
      transformResponse: (streamInput: GatewayStreamHookInput) => {
        finalizeOpenRouterDiscountSelection(streamInput);
        return undefined;
      }
    }],
    routeResolvers: [{
      key: ccrRouterRouteResolverKey,
      resolve: (requestInput: GatewayRequestTransformInput): GatewayRouteResolution | undefined =>
        resolveCcrGatewayRoute(config, requestInput)
    }]
  };
}

async function handleRuntimeConfigControlRoute(
  config: AppConfig,
  request: GatewayPluginHttpRequest,
  reply: GatewayPluginHttpReply,
  coreAuthToken: string | undefined,
  publicAuthKeys: readonly string[]
): Promise<unknown> {
  const authorization = await resolvePublicGatewayAuth(config, request.headers, {
    coreAuthToken,
    publicAuthKeys,
    rejectMissing: true,
    url: request.url
  });
  if (!authorization.ok) {
    return reply.code(authorization.status).send({ error: { message: authorization.error } });
  }
  if (!config.APIKEY || authorization.apiKey?.key !== config.APIKEY) {
    return reply.code(403).send({ error: { message: "The primary CCR API key is required for runtime configuration control." } });
  }

  const method = (request.method ?? "GET").toUpperCase();
  if (method === "GET") {
    return reply.code(200).send({
      revision: gatewayRuntimeConfigRevision(config),
      state: "running"
    });
  }
  if (method !== "POST") {
    return reply.code(405).send({ error: { message: "Method not allowed." } });
  }

  const body = readJsonObjectBody(request.body);
  const expectedRevision = typeof body.configRevision === "string"
    ? body.configRevision.trim()
    : "";
  if (!/^[a-f0-9]{64}$/i.test(expectedRevision)) {
    return reply.code(400).send({ error: { message: "A valid configRevision is required." } });
  }
  const requested = await requestParentRuntimeConfigReload(expectedRevision, body.forceRestart === true);
  if (!requested.ok) {
    return reply.code(503).send({ error: { message: requested.error } });
  }
  return reply.code(202).send({
    accepted: true,
    configRevision: expectedRevision,
    restarting: body.forceRestart === true
  });
}

async function handleRemoteControlRoute(
  config: AppConfig,
  request: GatewayPluginHttpRequest,
  reply: GatewayPluginHttpReply,
  coreAuthToken: string | undefined,
  publicAuthKeys: readonly string[]
): Promise<unknown> {
  const authorization = await resolvePublicGatewayAuth(config, request.headers, {
    coreAuthToken,
    publicAuthKeys,
    rejectMissing: true,
    url: request.url
  });
  if (!authorization.ok) {
    return reply.code(authorization.status).send({ error: { message: authorization.error } });
  }
  if (!request.raw || !reply.raw || typeof reply.hijack !== "function") {
    return reply.code(500).send({ error: { message: "CCR remote control route requires raw HTTP access." } });
  }

  reply.hijack();
  await ccrRemoteControlService.handleRequest({
    endpoint: pluginPublicEndpoint(config),
    path: requestPath(request.url ?? ccrRemoteControlPathPrefix),
    readBody: async () => httpRequestBodyBuffer(request.body),
    request: request.raw,
    response: reply.raw,
    sendJson: sendRawJson
  });
  return reply;
}

function applyCodexBridgeRequestTransform(
  config: AppConfig,
  requestInput: GatewayRequestTransformInput
): {
  headers: Record<string, string | null>;
  requestBody: Record<string, unknown>;
} | undefined {
  if (!isRecord(requestInput.requestBody)) {
    return undefined;
  }

  const method = requestInput.route?.method ?? requestInput.request?.method ?? "GET";
  const url = requestInput.route?.url ?? requestInput.request?.url ?? "/";
  const path = requestPath(url);
  const headers = requestInput.request?.headers ?? {};
  const routedModel = requestInput.model ??
    readHeader(headers, ccrRoutedModelHeader) ??
    requestedModelFromBody(requestInput.requestBody, path, undefined);
  let bodyBuffer = httpRequestBodyBuffer(requestInput.requestBody);
  let requestBody = requestInput.requestBody;
  const nextHeaders: Record<string, string | null> = {};

  const applyPatchBridge = prepareCodexApplyPatchBridgeRequest({
    body: bodyBuffer,
    config,
    headers,
    method,
    path,
    ...(routedModel ? { routedModel } : {})
  });
  if (applyPatchBridge) {
    bodyBuffer = applyPatchBridge.body;
    requestBody = readJsonObjectBody(bodyBuffer);
    nextHeaders[ccrCodexApplyPatchBridgeHeader] = sanitizeHeaderValue(applyPatchBridge.diagnostic) || "1";
  }

  const multiAgentBridge = prepareCodexMultiAgentBridgeRequest({
    body: bodyBuffer,
    config,
    headers,
    method,
    path,
    ...(routedModel ? { routedModel } : {})
  });
  if (multiAgentBridge) {
    bodyBuffer = multiAgentBridge.body;
    requestBody = readJsonObjectBody(bodyBuffer);
    nextHeaders[ccrCodexMultiAgentBridgeHeader] = sanitizeHeaderValue(multiAgentBridge.diagnostic) || "1";
  }

  if (Object.keys(nextHeaders).length === 0) {
    return undefined;
  }

  return {
    headers: {
      ...nextHeaders,
      "content-length": null,
      "content-type": "application/json"
    },
    requestBody
  };
}

function applyCodexBridgeResponseTransform(
  responseInput: GatewayResponseHookInput
): { responsePayload: unknown } | undefined {
  const bridge = codexBridgeState(responseInput);
  if (!bridge.applyPatch && !bridge.multiAgent) {
    return undefined;
  }

  let value = responseInput.responsePayload;
  let changed = false;
  if (bridge.applyPatch) {
    const transformed = transformCodexApplyPatchBridgeResponseValue(value);
    value = transformed.value;
    changed = changed || transformed.changed;
  }
  if (bridge.multiAgent) {
    const transformed = transformCodexMultiAgentBridgeResponseValue(value);
    value = transformed.value;
    changed = changed || transformed.changed;
  }

  return changed ? { responsePayload: value } : undefined;
}

function applyCodexBridgeStreamTransform(streamInput: GatewayStreamHookInput): Response | undefined {
  const bridge = codexBridgeState(streamInput);
  if (!bridge.applyPatch && !bridge.multiAgent) {
    return undefined;
  }
  if (!streamInput.upstreamResponse.body) {
    return streamInput.upstreamResponse;
  }

  const headers = new Headers(streamInput.upstreamResponse.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  let stream = Readable.fromWeb(streamInput.upstreamResponse.body as ReadableStream<Uint8Array>);
  if (bridge.applyPatch) {
    stream = codexApplyPatchBridgeResponseStream(stream, headers);
  }
  if (bridge.multiAgent) {
    stream = codexMultiAgentBridgeResponseStream(stream, headers);
  }

  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers,
    status: streamInput.upstreamResponse.status,
    statusText: streamInput.upstreamResponse.statusText
  });
}

function codexBridgeState(input: {
  request?: { headers?: Record<string, HeaderValue> };
  upstreamRequest?: { headers?: Record<string, string> };
}): { applyPatch: boolean; multiAgent: boolean } {
  return {
    applyPatch: hasTruthyHeader(input.request?.headers, ccrCodexApplyPatchBridgeHeader) ||
      hasTruthyHeader(input.upstreamRequest?.headers, ccrCodexApplyPatchBridgeHeader),
    multiAgent: hasTruthyHeader(input.request?.headers, ccrCodexMultiAgentBridgeHeader) ||
      hasTruthyHeader(input.upstreamRequest?.headers, ccrCodexMultiAgentBridgeHeader)
  };
}

function finalizeOpenRouterDiscountSelection(input: GatewayResponseHookInput | GatewayStreamHookInput): void {
  const requestId = readGatewayRequestId(input);
  if (!requestId) {
    return;
  }
  finalizeOpenRouterDiscountProviderRouterSelection(requestId, {
    ok: upstreamResponseSuccessful(input.upstreamResponse, input.statusCode),
    routedModel: readHeader(input.request?.headers, ccrRoutedModelHeader) ?? input.model,
    usedCcrFallback: false
  });
}

function readGatewayRequestId(input: {
  request?: { headers?: Record<string, HeaderValue>; id?: string };
  upstreamRequest?: { headers?: Record<string, string> };
}): string | undefined {
  return stringValue(input.request?.id) ??
    readHeader(input.request?.headers, ccrOpenRouterDiscountRequestIdHeader) ??
    readHeader(input.request?.headers, "x-request-id") ??
    readHeader(input.request?.headers, "x-client-request-id") ??
    readHeader(input.upstreamRequest?.headers, ccrOpenRouterDiscountRequestIdHeader) ??
    readHeader(input.upstreamRequest?.headers, "x-request-id") ??
    readHeader(input.upstreamRequest?.headers, "x-client-request-id");
}

function upstreamResponseSuccessful(response: Response | undefined, statusCode: number | undefined): boolean {
  const status = response?.status ?? statusCode;
  return typeof status === "number" && status >= 200 && status < 400;
}

async function applyOpenRouterDiscountTransform(
  routeResponse: { body: Record<string, unknown>; decision: ClaudeCodeRouteDecision },
  requestInput: GatewayRequestTransformInput,
  method: string,
  path: string,
  url: string,
  context: GatewayPluginRequestTransformContext
): Promise<{
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  routedModel?: string;
} | undefined> {
  const requestId = readGatewayRequestId(requestInput) ?? "";
  const result = await openRouterDiscountProviderRouterTransform({
    body: routeResponse.body,
    headers: stringHeaders(requestInput.request?.headers),
    method,
    path,
    requestId,
    ...(routeResponse.decision.model ? { routedModel: routeResponse.decision.model } : {}),
    ...(routeResponse.decision.sessionId ? { sessionId: routeResponse.decision.sessionId } : {}),
    tokenCount: routeResponse.decision.tokenCount,
    url
  } satisfies CcrGatewayPluginRequestTransformInput, context);
  if (!result) {
    return undefined;
  }
  return {
    ...(result.body ? { body: result.body } : {}),
    headers: {
      ...(requestId ? { [ccrOpenRouterDiscountRequestIdHeader]: requestId } : {}),
      ...(cleanStringHeaders(result.headers) ?? {})
    },
    responseHeaders: cleanStringHeaders(result.responseHeaders),
    ...(result.routedModel ? { routedModel: result.routedModel } : {})
  };
}

function openRouterDiscountTransformContext(config: AppConfig): GatewayPluginRequestTransformContext {
  return {
    config,
    logger: console,
    openSqliteStore: async () => {
      throw new Error("OpenRouter discount routing does not use plugin SQLite storage in the core gateway plugin.");
    },
    paths: {
      configDir: "",
      dataDir: "",
      pluginDataDir: ""
    },
    permissions: [],
    pluginConfig: undefined,
    pluginId: "openrouter"
  };
}

async function resolvePublicGatewayAuth(
  config: AppConfig,
  headers: Record<string, HeaderValue> | undefined,
  options: {
    coreAuthToken?: string;
    publicAuthKeys?: readonly string[];
    rejectMissing: boolean;
    url?: string;
  }
): Promise<PublicGatewayAuthResult> {
  const token = readAuthToken(headers) ?? readRemoteControlQueryAuthToken(options.url);
  if (!token) {
    return options.rejectMissing
      ? { ok: false, status: 401, error: "API key is missing." }
      : { ok: true };
  }
  if (isStaticBypassToken(token, options.coreAuthToken, options.publicAuthKeys ?? [])) {
    return { ok: true };
  }

  const apiKey = await resolveApiKey(config, authHeadersForToken(headers, token));
  return apiKey
    ? { ok: true, apiKey }
    : { ok: false, status: 401, error: "Invalid or expired API key." };
}

function setApiKeyAuthContextHeaders(headers: Record<string, HeaderValue> | undefined, apiKey: ApiKeyConfig | undefined): void {
  if (!apiKey || !headers) {
    return;
  }
  headers["x-auth-api-key-id"] = apiKey.id;
  headers["x-auth-sub"] = apiKey.id;
}

async function resolveApiKey(
  config: AppConfig,
  headers: Record<string, HeaderValue> | undefined
): Promise<ApiKeyConfig | undefined> {
  return resolveApiKeyFromHeaders(headers ?? {}, config, { includePersisted: false });
}

async function routeWithRouter(
  router: ClaudeCodeRouterPlugin,
  payload: CcrRouterPluginRouteRequest
): Promise<{ body: Record<string, unknown>; decision: ClaudeCodeRouteDecision }> {
  const path = payload.path ?? requestPath(payload.url ?? "/");
  const adaptation = adaptRouteRequestBody(path, { ...payload.body });
  const routed = await router.routeRequest({
    body: adaptation.body,
    bodyOwnership: "owned",
    headers: payload.headers ?? {},
    method: payload.method ?? "POST",
    url: payload.url ?? path
  });
  return {
    body: restoreRouteRequestBody(routed.body, adaptation),
    decision: routed.decision
  };
}

function decisionHeaders(decision: ClaudeCodeRouteDecision): Record<string, string> {
  return {
    [ccrRouteStageHeader]: "core-gateway-plugin",
    [ccrRouteReasonHeader]: sanitizeHeaderValue(decision.reason),
    [ccrRouteSourceHeader]: decision.source,
    ...(decision.diagnostics.length > 0 ? { [ccrRouteDiagnosticsHeader]: String(decision.diagnostics.length) } : {}),
    ...(decision.model ? { [ccrRoutedModelHeader]: sanitizeHeaderValue(decision.model) } : {}),
    [ccrRouteFallbackHeader]: encodeCcrRouteFallbackHeader(decision.fallback),
    ...(decision.sessionId ? { [ccrRouteSessionIdHeader]: sanitizeHeaderValue(decision.sessionId) } : {}),
    [ccrRouteTokenCountHeader]: String(decision.tokenCount)
  };
}

function readRouteRequestPayload(value: unknown): CcrRouterPluginRouteRequest | undefined {
  if (!isRecord(value) || !isRecord(value.body)) {
    return undefined;
  }
  return {
    body: value.body,
    ...(isHeaderRecord(value.headers) ? { headers: value.headers } : {}),
    ...(typeof value.method === "string" ? { method: value.method } : {}),
    ...(typeof value.path === "string" ? { path: value.path } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {})
  };
}

function requestedModelFromBody(
  body: Record<string, unknown>,
  path: string,
  fallback: string | undefined
): string | undefined {
  return requestLogRequestedModel(httpRequestBodyBuffer(body), path) ?? fallback;
}

function profileDeniedModel(
  config: AppConfig,
  profile: ProfileConfig | undefined,
  modelBeforeRouting: string | undefined,
  effectiveModel: string | undefined
): string | undefined {
  const modelToAuthorize = effectiveModel ?? modelBeforeRouting;
  return modelToAuthorize && !isModelAllowedForProfile(config, profile, modelToAuthorize)
    ? modelToAuthorize
    : undefined;
}

function profileModelNotAllowedError(model: string): Record<string, unknown> {
  return {
    error: {
      code: "profile_model_not_allowed",
      message: `Model "${model}" is not allowed for this profile.`
    }
  };
}

function resolveCcrGatewayRoute(
  config: AppConfig,
  requestInput: GatewayRequestTransformInput
): GatewayRouteResolution | undefined {
  const method = requestInput.route?.method ?? requestInput.request?.method ?? "GET";
  const url = requestInput.route?.url ?? requestInput.request?.url ?? "/";
  const path = requestPath(url);
  const protocol = requestProtocolForPath(path);
  if (!protocol || !shouldApplyGatewayRouting(method, path) || !isRecord(requestInput.requestBody)) {
    return undefined;
  }

  const routedModel = normalizeRouteSelector(
    readHeader(requestInput.request?.headers, ccrRoutedModelHeader) ??
      requestedModelFromBody(requestInput.requestBody, path, requestInput.model)
  );
  if (!routedModel) {
    return undefined;
  }

  const publicModel = resolveGatewayPublicModelId(routedModel, config) ?? routedModel;
  const resolved = modelRegistryForConfig(config).resolve(publicModel);
  if (!resolved) {
    return undefined;
  }

  const requestBody = requestBodyWithModel(requestInput.requestBody, resolved.model);
  if (resolved.kind === "gateway") {
    return {
      model: resolved.model,
      requestBody
    };
  }

  const parsedSelector = parseProviderModelSelector(publicModel);
  const targetProviderName = coreGatewayProviderSelectorName(resolved.provider, protocol, parsedSelector?.provider);
  if (!targetProviderName) {
    return undefined;
  }

  return {
    model: resolved.model,
    reason: readHeader(requestInput.request?.headers, ccrRouteReasonHeader),
    requestBody,
    targetProviderName
  };
}

function requestBodyWithModel(body: Record<string, unknown>, model: string): Record<string, unknown> {
  return body.model === model ? body : { ...body, model };
}

function coreGatewayProviderSelectorName(
  provider: GatewayProviderConfig,
  clientProtocol: GatewayProviderProtocol,
  requestedProviderName?: string
): string | undefined {
  const capability = providerCapabilityForClientProtocol(provider, clientProtocol);
  const explicitCapabilities = normalizedProviderCapabilities(provider);
  const protocol = capability?.type ?? (
    explicitCapabilities.length === 0
      ? providerProtocolForClientProtocol(provider, clientProtocol)
      : undefined
  );
  if (!protocol) {
    return undefined;
  }

  if (requestedProviderName && isCoreGatewayRuntimeProviderName(provider, protocol, requestedProviderName)) {
    return requestedProviderName.trim();
  }

  const credentials = sortProviderCredentialsForConfig(activeProviderCredentials(provider));
  if (credentials.length > 0) {
    return providerCredentialInternalName(provider, protocol, credentials[0]);
  }

  return capability ? providerCapabilityInternalName(provider, capability.type) : providerRuntimeId(provider);
}

function isCoreGatewayRuntimeProviderName(
  provider: GatewayProviderConfig,
  protocol: GatewayProviderProtocol,
  value: string
): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const runtimeId = providerRuntimeId(provider).toLowerCase();
  if (normalized === runtimeId) {
    return true;
  }
  const capabilityName = providerCapabilityInternalName(provider, protocol).toLowerCase();
  return normalized === capabilityName || normalized.startsWith(`${capabilityName}::cred:`);
}

function stripUntrustedCcrRouteHeaders(headers: Record<string, HeaderValue> | undefined): void {
  if (!headers) {
    return;
  }
  for (const header of ccrRouteHeaderNames) {
    delete headers[header];
  }
}

function httpRequestBodyBuffer(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }
  return Buffer.from(JSON.stringify(body));
}

function readJsonObjectBody(body: unknown): Record<string, unknown> {
  const text = Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === "string"
    ? httpRequestBodyBuffer(body).toString("utf8").trim()
    : "";
  if (!text && isRecord(body)) {
    return body;
  }
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readAppConfig(value: unknown): AppConfig | undefined {
  return isRecord(value) && isRecord(value.appConfig)
    ? value.appConfig as AppConfig
    : undefined;
}

function readPublicGatewayMode(value: unknown): boolean {
  return isRecord(value) && value.publicGatewayMode === true;
}

function readCoreAuthToken(value: unknown): string | undefined {
  return isRecord(value) ? stringValue(value.coreAuthToken) : undefined;
}

function readPublicAuthKeys(value: unknown): string[] {
  return isRecord(value) && Array.isArray(value.publicAuthKeys)
    ? value.publicAuthKeys.map((key) => stringValue(key)).filter((key): key is string => Boolean(key))
    : [];
}

function readRawTraceSyncToken(config: unknown): string | undefined {
  if (!isRecord(config) || !isRecord(config.rawTrace)) {
    return undefined;
  }
  const sync = isRecord(config.rawTrace.sync) ? config.rawTrace.sync : undefined;
  const headers = isRecord(sync?.headers) ? sync.headers : undefined;
  return typeof headers?.[rawTraceSyncHeader] === "string"
    ? headers[rawTraceSyncHeader].trim()
    : undefined;
}

function hasScriptRules(rules: readonly RouterRule[] | undefined): boolean {
  return Boolean(rules?.some((rule) => rule.enabled && rule.type === "script" && rule.script));
}

function requestPath(url: string): string {
  try {
    return new URL(url, "http://ccr.local").pathname;
  } catch {
    return url.split("?")[0] || "/";
  }
}

function readHeader(headers: Record<string, HeaderValue> | undefined, name: string): string | undefined {
  const normalized = name.toLowerCase();
  const value = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === normalized)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function hasTruthyHeader(headers: Record<string, HeaderValue> | undefined, name: string): boolean {
  const value = readHeader(headers, name)?.trim().toLowerCase();
  return Boolean(value && value !== "0" && value !== "false");
}

function readAuthToken(headers: Record<string, HeaderValue> | undefined): string | undefined {
  for (const headerName of sdkCompatibleTokenHeaderNames) {
    const raw = readHeader(headers, headerName);
    if (raw) {
      return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw.trim();
    }
  }
  return undefined;
}

function readRemoteControlQueryAuthToken(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url, "http://ccr.local");
    if (parsed.pathname !== ccrRemoteControlPathPrefix && !parsed.pathname.startsWith(`${ccrRemoteControlPathPrefix}/`)) {
      return undefined;
    }
    return parsed.searchParams.get("api_key")?.trim() || parsed.searchParams.get("key")?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function authHeadersForToken(
  headers: Record<string, HeaderValue> | undefined,
  token: string
): Record<string, HeaderValue> {
  return {
    ...(headers ?? {}),
    authorization: `Bearer ${token}`
  };
}

function isStaticBypassToken(token: string, coreAuthToken: string | undefined, publicAuthKeys: readonly string[]): boolean {
  return [coreAuthToken, ...publicAuthKeys]
    .map((value) => value?.trim())
    .some((value) => value === token);
}

function isCoreGatewayRequest(headers: Record<string, HeaderValue> | undefined, coreAuthToken: string | undefined): boolean {
  const token = readHeader(headers, coreGatewayAuthHeader)?.trim();
  return Boolean(token && coreAuthToken && constantTimeEqual(token, coreAuthToken));
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function stringHeaders(headers: Record<string, HeaderValue> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value === undefined) continue;
    result[name] = Array.isArray(value) ? value.join(",") : value;
  }
  return result;
}

function cleanStringHeaders(
  headers: Record<string, string | number | boolean | null | undefined> | undefined
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!name.trim() || value === undefined || value === null) {
      continue;
    }
    result[name] = String(value);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

async function requestParentRuntimeConfigReload(
  configRevision: string,
  forceRestart: boolean
): Promise<{ ok: true } | { error: string; ok: false }> {
  const send = (process as NodeJS.Process & {
    send?: (message: unknown, callback?: (error: Error | null) => void) => boolean;
  }).send;
  if (typeof send !== "function") {
    return {
      ok: false,
      error: "CCR runtime configuration reload requires the managed CCR parent process."
    };
  }
  return new Promise((resolve) => {
    send.call(process, {
      configRevision,
      forceRestart,
      protocolVersion: 1,
      type: ccrRuntimeConfigReloadMessageType
    }, (error: Error | null) => {
      if (error) {
        resolve({ ok: false, error: `Failed to notify the CCR parent process: ${error.message}` });
      } else {
        resolve({ ok: true });
      }
    });
  });
}

function pluginPublicEndpoint(config: AppConfig): string {
  return `http://${formatHost(clientGatewayHost(config.gateway.host))}:${config.gateway.port}`;
}

function formatHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function clientGatewayHost(host: string): string {
  const value = stringValue(host) ?? "127.0.0.1";
  if (value === "0.0.0.0") return "127.0.0.1";
  if (value === "::" || value === "[::]") return "::1";
  return value;
}

function sendRawJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function isHeaderRecord(value: unknown): value is Record<string, HeaderValue> {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every((item) =>
    item === undefined ||
    typeof item === "string" ||
    (Array.isArray(item) && item.every((entry) => typeof entry === "string"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
