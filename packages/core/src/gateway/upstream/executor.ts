/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { Readable } from "node:stream";
import type { AppConfig, GatewayProviderConfig, GatewayProviderProtocol, ProviderCredentialConfig, RequestRouteTraceChange, RouterFallbackConfig } from "@ccr/core/contracts/app";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import { createRouteExecutionPlan } from "@ccr/core/routing/execution-plan";
import { rewriteRouteModelInUrl } from "@ccr/core/routing/protocol-adapter";
import { modelRegistryForConfig, normalizeRouteSelector, parseProviderModelSelector, providerRuntimeId } from "@ccr/core/routing/model-registry";
import { requestProtocolForPath } from "@ccr/core/routing/protocol-endpoints";
import { resolveConfiguredProviderModelSelector, resolveUniqueConfiguredProviderModelSelector } from "@ccr/core/routing/model-resolution";
import { estimateLimitUsage } from "@ccr/core/gateway/limits/window-limiter";
import { providerCredentialLimitState, readProviderCredentialCooldown, recordProviderCredentialOutcome } from "@ccr/core/providers/credential-pool";
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";
import { isLocalClaudeCodeOauthProviderPlugin, mergeAnthropicBetaValues } from "@ccr/core/providers/oauth-plugin";
import { abortSignalMessage, formatError, omitLocalObservabilityHeaders, shouldSendBody, withCoreGatewayAuthHeader } from "@ccr/core/gateway/http/io";
import { parseJsonObjectSafe, releaseJsonObject, serializeJsonBody, serializeJsonBodyWithModel } from "@ccr/core/gateway/http/body";
import { resolveGatewayPublicModelId } from "@ccr/core/gateway/features/model-discovery";
import { activeProviderCredentials, findProviderByPublicOrInternalName, findProviderCredentialBySlug, normalizedProviderCapabilities, parseProviderCredentialInternalName, providerCapabilityForClientProtocol, providerCapabilityInternalName, providerCapabilityNameMatches, providerCredentialInternalName, providerCredentialPriority, providerCredentialRuntimeId, providerCredentialSlug, providerProtocolForClientProtocol, sanitizeHeaderValue } from "@ccr/core/providers/runtime-topology";
import { delay } from "@ccr/core/gateway/internal/clock";
import { retryDelayAfterNetworkError, retryDelayAfterStatus, shouldFallbackAfterStatus } from "@ccr/core/gateway/upstream/retry-policy";
import { claudeCodeOauthBetaHeader, claudeCodeOauthRequiredBeta, UpstreamRequestError } from "@ccr/core/gateway/internal/shared";
import type { ApiKeyLimitUsage, ProviderCredentialRoutingTarget, UpstreamAttempt, UpstreamFailedAttempt, UpstreamFetchResult } from "@ccr/core/gateway/internal/shared";
import type { RouteTraceObserver } from "@ccr/core/observability/route-trace";

const providerCredentialSpilloverThreshold = 0.8;
const openRouterDiscountModelHeader = "x-ccr-openrouter-discount-model";
const openRouterDiscountProviderHeader = "x-ccr-openrouter-discount-provider-id";


export function applyProviderCapabilityRouting(input: {
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

  const targetProviderName = firstTargetProviderHeader(input.headers);
  const routedModel = rewriteModelSelectorForProtocol(input.routedModel, input.config, protocol, targetProviderName);
  const fallback = rewriteFallbackForProtocol(input.fallback, input.config, protocol);
  const body = rewriteBodyModelForProtocol(input.body, input.config, protocol, targetProviderName);
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
    body: serializeJsonBody(input.body),
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


function rewriteBodyModelForProtocol(
  body: Buffer | undefined,
  config: AppConfig,
  protocol: GatewayProviderProtocol,
  targetProviderName?: string
): Buffer | undefined {
  const parsedBody = parseJsonObjectSafe(body);
  if (!parsedBody) {
    return body;
  }
  const model = stringValue(parsedBody.model);
  const rewrittenModel = rewriteModelSelectorForProtocol(model, config, protocol, targetProviderName);
  if (!rewrittenModel || rewrittenModel === model) {
    return body;
  }
  return serializeJsonBody({ ...parsedBody, model: rewrittenModel });
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
  protocol: GatewayProviderProtocol,
  targetProviderName?: string
): string | undefined {
  const normalized = normalizeRouteSelector(model);
  if (!normalized) {
    return model;
  }
  const publicModel = resolveGatewayPublicModelId(normalized, config) ?? normalized;
  const resolved = modelRegistryForConfig(config).resolve(
    publicModel,
    targetProviderName ? { providerName: targetProviderName } : {}
  );
  const selector = resolved?.kind === "provider"
    ? { model: resolved.model, provider: resolved.provider }
    : undefined;
  const providerName = selector ? providerSelectorNameForProtocol(selector.provider, protocol, Boolean(targetProviderName)) : undefined;
  return selector && providerName
    ? `${providerName}/${selector.model}`
    : publicModel;
}


function providerSelectorNameForProtocol(
  provider: GatewayProviderConfig,
  protocol: GatewayProviderProtocol,
  allowRuntimeProvider: boolean
): string | undefined {
  const capability = providerCapabilityForClientProtocol(provider, protocol);
  if (capability) {
    return providerCapabilityInternalName(provider, capability.type);
  }
  return allowRuntimeProvider && providerProtocolForClientProtocol(provider, protocol)
    ? providerRuntimeId(provider)
    : undefined;
}


export function rewriteCapabilityResponseHeaders(headers: Headers, config: AppConfig): Headers {
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


export async function fetchUpstreamWithFallback(input: {
  body?: Buffer;
  config: AppConfig;
  coreAuthToken: string;
  fallback: RouterFallbackConfig;
  headers: Record<string, string>;
  method: string;
  path: string;
  preparationChanges?: readonly RequestRouteTraceChange[];
  routedModel?: string;
  signal?: AbortSignal;
  trace?: RouteTraceObserver;
  upstreamUrl: string;
}): Promise<UpstreamFetchResult> {
  const fallbackMode = input.fallback.mode;
  const planningHeaders = { ...input.headers };
  const planningRouting = applyProviderCapabilityRouting({
    body: input.body,
    config: input.config,
    fallback: input.fallback,
    headers: planningHeaders,
    path: input.path,
    routedModel: input.routedModel
  });
  const attempts = buildUpstreamAttempts(
    input.config,
    planningRouting.fallback,
    input.method,
    input.path,
    planningRouting.body,
    planningRouting.routedModel
  );
  const failedAttempts: UpstreamFailedAttempt[] = [];
  const attemptRoutingCache = new Map<string | undefined, {
    body?: Buffer;
    headers: Record<string, string>;
    routedModel?: string;
    sourceBody?: Buffer;
    sourceRoutedModel?: string;
  }>();
  const primaryAttempt = attempts[0];
  const parsedInputBody = parseJsonObjectSafe(input.body);
  const planningBodyCanSeedPrimary = requestProtocolForPath(input.path) === "gemini_generate_content" ||
    !parsedInputBody ||
    !primaryAttempt?.model ||
    stringValue(parsedInputBody.model) !== undefined;
  if (primaryAttempt && planningBodyCanSeedPrimary) {
    attemptRoutingCache.set(primaryAttempt.model, {
      body: planningRouting.body,
      headers: planningHeaders,
      routedModel: primaryAttempt.model,
      sourceBody: input.body,
      sourceRoutedModel: input.routedModel
    });
  }
  input.trace?.capture({
    changes: [
      routeTraceChange("routing", "/routing/fallback", input.fallback, planningRouting.fallback)
    ].filter(isRouteTraceChange),
    decision: { reason: `fallback:${fallbackMode}`, source: "execution-plan" },
    kind: "decision",
    name: "fallback.execution-plan",
    phase: "planning",
    target: attempts[0]?.model ? { model: attempts[0].model } : undefined
  });

  for (let index = 0; index < attempts.length; index += 1) {
    if (input.signal?.aborted) {
      throw new UpstreamRequestError(abortSignalMessage(input.signal), {
        failedAttempts
      });
    }

    const attemptNumber = index + 1;
    const plannedAttempt = attempts[index];
    const capabilityRoutingStartedAt = Date.now();
    let cachedAttemptRouting = attemptRoutingCache.get(plannedAttempt.model);
    if (!cachedAttemptRouting) {
      const routedHeaders = { ...input.headers };
      const sourceBody = buildAttemptBody(input.body, input.path, plannedAttempt.model, {
        discountModel: input.headers[openRouterDiscountModelHeader],
        discountProvider: input.headers[openRouterDiscountProviderHeader]
      });
      const routing = applyProviderCapabilityRouting({
        body: sourceBody,
        config: input.config,
        fallback: input.fallback,
        headers: routedHeaders,
        path: input.path,
        routedModel: plannedAttempt.model
      });
      cachedAttemptRouting = {
        body: routing.body,
        headers: routedHeaders,
        routedModel: routing.routedModel,
        sourceBody,
        sourceRoutedModel: plannedAttempt.model
      };
      attemptRoutingCache.set(plannedAttempt.model, cachedAttemptRouting);
    }
    const attemptHeaders = { ...cachedAttemptRouting.headers };
    const attemptSourceBody = cachedAttemptRouting.sourceBody;
    const capabilityProviderHeadersBefore = {
      gateway: input.headers["x-gateway-target-provider"],
      list: input.headers["x-target-providers"],
      target: input.headers["x-target-provider"]
    };
    input.trace?.capture({
      attempt: attemptNumber,
      changes: [
        ...(attemptSourceBody === cachedAttemptRouting.body
          ? []
          : [{ operation: "replace" as const, path: "/body/model", scope: "body" as const }]),
        routeTraceChange("routing", "/routing/model", cachedAttemptRouting.sourceRoutedModel, cachedAttemptRouting.routedModel),
        routeTraceChange("headers", "/headers/x-target-provider", capabilityProviderHeadersBefore.target, attemptHeaders["x-target-provider"]),
        routeTraceChange("headers", "/headers/x-target-providers", capabilityProviderHeadersBefore.list, attemptHeaders["x-target-providers"]),
        routeTraceChange("headers", "/headers/x-gateway-target-provider", capabilityProviderHeadersBefore.gateway, attemptHeaders["x-gateway-target-provider"])
      ].filter(isRouteTraceChange),
      durationMs: Date.now() - capabilityRoutingStartedAt,
      kind: "mutation",
      name: "provider.capability-routing",
      phase: "capability",
      startedAtMs: capabilityRoutingStartedAt,
      target: cachedAttemptRouting.routedModel ? { model: cachedAttemptRouting.routedModel } : undefined
    });
    const attemptPreparationStartedAt = Date.now();
    const attempt = prepareUpstreamCredentialAttempt({
      attempt: {
        ...plannedAttempt,
        body: cachedAttemptRouting.body,
        model: cachedAttemptRouting.routedModel ?? plannedAttempt.model
      },
      config: input.config,
      headers: attemptHeaders,
      method: input.method,
      path: input.path
    });
    const hasNextAttempt = index < attempts.length - 1;
    const attemptUrl = rewriteRouteModelInUrl(input.upstreamUrl, attempt.model);
    const upstreamHeaders = {
      ...withCoreGatewayAuthHeader(
        omitLocalObservabilityHeaders(attempt.headers ?? input.headers),
        input.coreAuthToken
      ),
      // Core raw traces use a unique request id for every fallback attempt,
      // while turnKey identifies the outer gateway request. Keep both and mark
      // the attempt so only the final response may refine the stored outcome.
      "x-ccr-route-attempt": String(attemptNumber)
    };
    const attemptProvider = attempt.logicalProvider ?? (
      attempt.target?.kind === "provider" ? attempt.target.provider.name : undefined
    );
    const attemptStartedAt = Date.now();
    input.trace?.capture({
      attempt: attemptNumber,
      changes: [
        ...(index === 0 ? input.preparationChanges ?? [] : []),
        ...(attempt.model && attempt.model !== input.routedModel
          ? [{
              ...(input.routedModel === undefined ? {} : { before: input.routedModel }),
              after: attempt.model,
              operation: input.routedModel === undefined ? "add" as const : "replace" as const,
              path: "/body/model",
              scope: "body" as const
            }]
          : []),
        ...(attemptUrl !== input.upstreamUrl
          ? [{ after: attemptUrl, before: input.upstreamUrl, operation: "replace" as const, path: "/url", scope: "url" as const }]
          : [])
      ],
      durationMs: attemptStartedAt - attemptPreparationStartedAt,
      kind: "attempt",
      name: "upstream.attempt.prepare",
      phase: "attempt",
      startedAtMs: attemptPreparationStartedAt,
      target: {
        ...(attempt.credentialIds?.[0] ? { credentialId: attempt.credentialIds[0] } : {}),
        ...(attempt.credentialIds?.length ? { credentialCandidates: attempt.credentialIds } : {}),
        ...(attempt.model ? { model: attempt.model } : {}),
        ...(attempt.credentialProtocol ? { protocol: attempt.credentialProtocol } : {}),
        ...(attemptProvider ? { provider: attemptProvider } : {})
      }
    });

    releaseJsonObject(attempt.body);
    releaseJsonObject(attemptSourceBody);
    releaseJsonObject(input.body);

    try {
      const response = await fetchWithSystemProxy(attemptUrl, {
        body: shouldSendBody(input.method) ? attempt.body?.toString("utf8") : undefined,
        headers: upstreamHeaders,
        method: input.method,
        signal: input.signal
      });

      if (hasNextAttempt && shouldFallbackAfterStatus(response.status, fallbackMode)) {
        const delayMs = retryDelayAfterStatus(response.headers, failedAttempts.length);
        input.trace?.capture({
          attempt: attemptNumber,
          durationMs: Date.now() - attemptStartedAt,
          kind: "outcome",
          name: "upstream.attempt.outcome",
          outcome: {
            fallbackReason: `http:${response.status}`,
            retryDelayMs: delayMs,
            statusCode: response.status
          },
          phase: "outcome",
          startedAtMs: attemptStartedAt,
          status: "error",
          target: {
            ...(attempt.model ? { model: attempt.model } : {}),
            ...(attemptProvider ? { provider: attemptProvider } : {})
          }
        });
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
          await delay(delayMs, input.signal);
        }
        continue;
      }

      input.trace?.capture({
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        kind: "outcome",
        name: "upstream.attempt.outcome",
        outcome: { statusCode: response.status },
        phase: "outcome",
        startedAtMs: attemptStartedAt,
        status: response.ok ? "ok" : "error",
        target: {
          ...(attempt.model ? { model: attempt.model } : {}),
          ...(attemptProvider ? { provider: attemptProvider } : {})
        }
      });

      return {
        attempt,
        failedAttempts,
        response
      };
    } catch (error) {
      const message = formatError(error);
      const delayMs = hasNextAttempt && !input.signal?.aborted
        ? retryDelayAfterNetworkError(failedAttempts.length)
        : 0;
      input.trace?.capture({
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        kind: "outcome",
        name: "upstream.attempt.outcome",
        outcome: {
          error: message,
          ...(hasNextAttempt ? { fallbackReason: "network-error", retryDelayMs: delayMs } : {})
        },
        phase: "outcome",
        startedAtMs: attemptStartedAt,
        status: "error",
        target: {
          ...(attempt.model ? { model: attempt.model } : {}),
          ...(attemptProvider ? { provider: attemptProvider } : {})
        }
      });
      failedAttempts.push({
        credentialChain: attempt.credentialChain,
        credentialIds: attempt.credentialIds,
        delayMs,
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
        if (delayMs > 0) {
          await delay(delayMs, input.signal);
        }
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
  const target = resolvePlannedProviderCredentialRoutingTarget(input.attempt, input.path) ??
    resolveProviderCredentialRoutingTarget(input.config, input.headers, input.path, input.attempt.body);
  const attemptBody = (body: Buffer | undefined) => usageAwareOpenAiChatAttemptBody({
    body,
    config: input.config,
    path: input.path,
    target
  });
  if (!target) {
    const body = normalizedBody?.body ?? input.attempt.body;
    return {
      ...input.attempt,
      body: attemptBody(body),
      headers: input.headers
    };
  }

  const attemptHeaders = withClaudeCodeOauthBetaHeader(input.headers, input.config, target);

  const credentials = activeProviderCredentials(target.provider);
  if (credentials.length === 0) {
    const preserveModelSelector = shouldPreserveCapabilityModelSelector(input.attempt.body, target);
    const targetHeaders = targetProviderFallbackHeaders(attemptHeaders, target.provider, target.protocol);
    const targetBody = target.body ?? normalizedBody?.body ?? input.attempt.body;
    const providerQualifiedTargetBody = providerQualifiedTargetModelBody(
      targetBody,
      target.model,
      targetHeaders["x-target-provider"]
    );
    return {
      ...input.attempt,
      body: attemptBody(preserveModelSelector ? input.attempt.body : providerQualifiedTargetBody ?? targetBody),
      headers: preserveModelSelector
        ? clearTargetProviderHeaders(attemptHeaders)
        : targetHeaders
    };
  }

  const usage = estimateLimitUsage(input.method, input.attempt.body ?? Buffer.alloc(0));
  const selection = selectProviderCredentials(target.provider, target.protocol, credentials, usage);
  if (selection.credentials.length === 0) {
    const preserveModelSelector = shouldPreserveCapabilityModelSelector(input.attempt.body, target);
    return {
      ...input.attempt,
      body: attemptBody(preserveModelSelector ? input.attempt.body : target.body ?? normalizedBody?.body ?? input.attempt.body),
      headers: preserveModelSelector
        ? clearTargetProviderHeaders(attemptHeaders)
        : targetProviderFallbackHeaders(attemptHeaders, target.provider, target.protocol)
    };
  }

  const headers: Record<string, string> = {
    ...attemptHeaders,
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
    body: attemptBody(target.body ?? normalizedBody?.body ?? input.attempt.body),
    credentialChain: selection.credentials.map((candidate) => candidate.internalName),
    credentialIds: selection.credentials.map((candidate) => candidate.credentialId),
    credentialProtocol: target.protocol,
    headers,
    logicalProvider: target.provider.name
  };
}


function withClaudeCodeOauthBetaHeader(
  headers: Record<string, string>,
  config: AppConfig,
  target: ProviderCredentialRoutingTarget
): Record<string, string> {
  if (
    target.protocol !== "anthropic_messages" ||
    !claudeCodeOauthPluginMatchesTarget(config, target.provider, target.protocol)
  ) {
    return headers;
  }

  const existingEntry = Object.entries(headers)
    .find(([name]) => name.trim().toLowerCase() === claudeCodeOauthBetaHeader);
  const merged = mergeAnthropicBetaValues(existingEntry?.[1], claudeCodeOauthRequiredBeta);
  if (existingEntry?.[0] === claudeCodeOauthBetaHeader && existingEntry[1] === merged) {
    return headers;
  }

  const next = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.trim().toLowerCase() !== claudeCodeOauthBetaHeader)
  );
  next[claudeCodeOauthBetaHeader] = merged;
  return next;
}


function claudeCodeOauthPluginMatchesTarget(
  config: AppConfig,
  provider: GatewayProviderConfig,
  protocol: GatewayProviderProtocol
): boolean {
  const targetNames = new Set([
    provider.name,
    providerRuntimeId(provider),
    providerCapabilityInternalName(provider, protocol)
  ].map((name) => name.trim().toLowerCase()));
  return (config.providerPlugins ?? []).some((plugin) => {
    if (!isLocalClaudeCodeOauthProviderPlugin(plugin)) {
      return false;
    }
    const providerName = stringValue(plugin.providerName)?.toLowerCase();
    return Boolean(providerName && targetNames.has(providerName));
  });
}


function targetProviderFallbackHeaders(
  headers: Record<string, string>,
  provider: GatewayProviderConfig,
  protocol: GatewayProviderProtocol
): Record<string, string> {
  const next = { ...headers };
  next["x-target-provider"] = targetProviderHeaderValue(provider, protocol);
  delete next["x-target-providers"];
  delete next["x-gateway-target-provider"];
  return next;
}


function clearTargetProviderHeaders(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  delete next["x-target-provider"];
  delete next["x-target-providers"];
  delete next["x-gateway-target-provider"];
  return next;
}


function shouldPreserveCapabilityModelSelector(body: Buffer | undefined, target: ProviderCredentialRoutingTarget): boolean {
  if (target.source === "header" || target.protocol !== "gemini_interactions") {
    return false;
  }
  return Boolean(parseProviderModelSelector(stringValue(parseJsonObjectSafe(body)?.model)));
}


function providerQualifiedTargetModelBody(
  body: Buffer | undefined,
  model: string | undefined,
  providerSelector: string | undefined
): Buffer | undefined {
  if (!model || !providerSelector || !parseProviderModelSelector(model)) {
    return undefined;
  }
  const parsedBody = parseJsonObjectSafe(body);
  if (!parsedBody) {
    return undefined;
  }
  return serializeJsonBodyWithModel(parsedBody, `${providerSelector}/${model}`);
}


function resolvePlannedProviderCredentialRoutingTarget(
  attempt: UpstreamAttempt,
  path: string
): ProviderCredentialRoutingTarget | undefined {
  if (attempt.target?.kind !== "provider") {
    return undefined;
  }
  const clientProtocol = requestProtocolForPath(path);
  const protocol = clientProtocol
    ? providerProtocolForClientProtocol(attempt.target.provider, clientProtocol)
    : undefined;
  if (!protocol) {
    return undefined;
  }
  const parsedBody = parseJsonObjectSafe(attempt.body);
  return {
    body: parsedBody && clientProtocol !== "gemini_generate_content"
      ? serializeJsonBodyWithModel(parsedBody, attempt.target.model)
      : attempt.body,
    model: attempt.target.model,
    provider: attempt.target.provider,
    protocol,
    source: "plan"
  };
}


function targetProviderHeaderValue(provider: GatewayProviderConfig, protocol: GatewayProviderProtocol): string {
  const capability = normalizedProviderCapabilities(provider).find((item) => item.type === protocol);
  return capability ? providerCapabilityInternalName(provider, capability.type) : providerRuntimeId(provider);
}


function usageAwareOpenAiChatAttemptBody(input: {
  body: Buffer | undefined;
  config: AppConfig;
  path: string;
  target?: { protocol: GatewayProviderProtocol };
}): Buffer | undefined {
  const clientProtocol = requestProtocolForPath(input.path);
  const parsedBody = parseJsonObjectSafe(input.body);
  const modelSelector = resolveConfiguredProviderModelSelector(stringValue(parsedBody?.model), input.config);
  const providerProtocol = input.target?.protocol ?? (
    modelSelector && clientProtocol
      ? providerProtocolForClientProtocol(modelSelector.provider, clientProtocol)
      : undefined
  );
  if (providerProtocol !== "openai_chat_completions" && providerProtocol !== "openai_responses") {
    return input.body;
  }
  const sanitizedBody = stripUnsupportedOpenAiRequestParameters(input.body);
  return providerProtocol === "openai_chat_completions"
    ? usageAwareOpenAiChatBody(sanitizedBody)
    : sanitizedBody;
}


function stripUnsupportedOpenAiRequestParameters(body: Buffer | undefined): Buffer | undefined {
  const parsedBody = parseJsonObjectSafe(body);
  if (!parsedBody || (!("thinking" in parsedBody) && !("reasoning_split" in parsedBody))) {
    return body;
  }
  const next = { ...parsedBody };
  delete next.thinking;
  delete next.reasoning_split;
  return serializeJsonBody(next);
}


function usageAwareOpenAiChatBody(body: Buffer | undefined): Buffer | undefined {
  const parsedBody = parseJsonObjectSafe(body);
  if (!parsedBody || parsedBody.stream !== true) {
    return body;
  }
  const streamOptions = isRecord(parsedBody.stream_options)
    ? parsedBody.stream_options
    : isRecord(parsedBody.streamOptions)
      ? parsedBody.streamOptions
      : {};
  if (streamOptions.include_usage === true || streamOptions.includeUsage === true) {
    return body;
  }
  return serializeJsonBody({
    ...parsedBody,
    stream_options: {
      ...streamOptions,
      include_usage: true
    }
  });
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




function resolveProviderCredentialRoutingTarget(
  config: AppConfig,
  headers: Record<string, string>,
  path: string,
  body: Buffer | undefined
): ProviderCredentialRoutingTarget | undefined {
  const protocol = requestProtocolForPath(path);
  if (!protocol) {
    return undefined;
  }

  const parsedBody = parseJsonObjectSafe(body);
  const bodyModel = stringValue(parsedBody?.model);
  const targetProviderName = firstTargetProviderHeader(headers);
  const headerProvider = targetProviderName ? findProviderByPublicOrInternalName(config, targetProviderName) : undefined;
  const headerProviderProtocol = headerProvider ? providerProtocolForClientProtocol(headerProvider, protocol) : undefined;
  const exactHeaderProviderModel = headerProvider ? resolveExactModelForProvider(bodyModel, headerProvider) : undefined;
  if (headerProvider && headerProviderProtocol && exactHeaderProviderModel) {
    return {
      body: parsedBody && exactHeaderProviderModel !== bodyModel
        ? serializeJsonBodyWithModel(parsedBody, exactHeaderProviderModel)
        : body,
      model: exactHeaderProviderModel,
      provider: headerProvider,
      protocol: headerProviderProtocol,
      source: "header"
    };
  }

  const modelSelector = resolveConfiguredProviderModelSelector(bodyModel, config) ??
    resolveUniqueConfiguredProviderModelSelector(bodyModel, config);
  if (modelSelector) {
    const provider = modelSelector.provider;
    const providerProtocol = provider ? providerProtocolForClientProtocol(provider, protocol) : undefined;
    if (provider && providerProtocol) {
      return {
        body: parsedBody ? serializeJsonBodyWithModel(parsedBody, modelSelector.model) : body,
        model: modelSelector.model,
        provider,
        protocol: providerProtocol,
        source: "model"
      };
    }
  }

  if (!targetProviderName) {
    return undefined;
  }

  const provider = headerProvider ?? findProviderByPublicOrInternalName(config, targetProviderName);
  if (!provider) {
    return undefined;
  }
  const providerProtocol = headerProviderProtocol ?? providerProtocolForClientProtocol(provider, protocol);
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
    protocol: providerProtocol,
    source: "header"
  };
}


function resolveExactModelForProvider(
  value: string | undefined,
  provider: GatewayProviderConfig
): string | undefined {
  const normalized = normalizeRouteSelector(value);
  return normalized && providerHasModel(provider, normalized) ? normalized : undefined;
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


function buildUpstreamAttempts(
  config: AppConfig,
  fallback: RouterFallbackConfig,
  method: string,
  path: string,
  body: Buffer | undefined,
  routedModel: string | undefined
): UpstreamAttempt[] {
  const parsedBody = parseJsonObjectSafe(body);
  const modelInPath = requestProtocolForPath(path) === "gemini_generate_content";
  const plan = createRouteExecutionPlan({
    bodyModel: modelInPath ? undefined : stringValue(parsedBody?.model),
    fallback,
    hasRequestBody: shouldSendBody(method) && (fallback.mode !== "model-chain" || Boolean(parsedBody)),
    modelRegistry: modelRegistryForConfig(config),
    primaryModel: routedModel
  });
  return plan.attempts.map((attempt) => ({
    index: attempt.index,
    model: attempt.model,
    target: attempt.target
  }));
}


function buildAttemptBody(
  body: Buffer | undefined,
  path: string,
  model: string | undefined,
  options: {
    discountModel?: string;
    discountProvider?: string;
  } = {}
): Buffer | undefined {
  if (!body || !model || requestProtocolForPath(path) === "gemini_generate_content") {
    return body;
  }
  const parsedBody = parseJsonObjectSafe(body);
  if (!parsedBody || stringValue(parsedBody.model) === model) {
    return body;
  }
  if (shouldRemoveOpenRouterDiscountProvider(parsedBody, model, options)) {
    const { provider: _provider, ...rest } = parsedBody;
    return serializeJsonBody({ ...rest, model });
  }
  return serializeJsonBodyWithModel(parsedBody, model);
}

function shouldRemoveOpenRouterDiscountProvider(
  body: Record<string, unknown>,
  model: string,
  options: {
    discountModel?: string;
    discountProvider?: string;
  }
): boolean {
  if (!options.discountModel || !isRecord(body.provider)) {
    return false;
  }
  return !selectorMatchesOpenRouterDiscountTarget(model, options.discountModel, options.discountProvider);
}

function selectorMatchesOpenRouterDiscountTarget(
  model: string,
  discountModel: string,
  discountProvider: string | undefined
): boolean {
  const normalizedModel = normalizeRouteSelector(model)?.toLowerCase() ?? "";
  const normalizedDiscountModel = normalizeRouteSelector(discountModel)?.toLowerCase() ?? "";
  if (!normalizedModel || !normalizedDiscountModel) {
    return false;
  }
  if (normalizedModel === normalizedDiscountModel) {
    return true;
  }
  if (!normalizedModel.endsWith(`/${normalizedDiscountModel}`)) {
    return false;
  }
  const providerPrefix = normalizedModel.slice(0, normalizedModel.length - normalizedDiscountModel.length - 1);
  const providerKey = normalizeProviderHint(discountProvider);
  const normalizedProviderPrefix = normalizeProviderHint(providerPrefix);
  return normalizedProviderPrefix.includes("openrouter") ||
    Boolean(providerKey && normalizedProviderPrefix.includes(providerKey));
}

function normalizeProviderHint(value: unknown): string {
  return (stringValue(value) ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}


function routeTraceChange(
  scope: RequestRouteTraceChange["scope"],
  path: string,
  before: unknown,
  after: unknown
): RequestRouteTraceChange | undefined {
  if (before === after) {
    return undefined;
  }
  return {
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    operation: before === undefined ? "add" : after === undefined ? "remove" : "replace",
    path,
    scope
  };
}


function isRouteTraceChange(value: RequestRouteTraceChange | undefined): value is RequestRouteTraceChange {
  return Boolean(value);
}


async function drainResponseBody(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    // The failed attempt is already being skipped; body drain errors should not block the next attempt.
  }
}


export async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The client already disconnected; best-effort upstream cleanup must not mask that expected path.
  }
}


export function uniqueStreams(streams: Readable[]): Readable[] {
  return [...new Set(streams)];
}


export function destroyResponseStreams(streams: Readable[]): void {
  for (const stream of streams) {
    if (!stream.destroyed) {
      // A downstream client close is an expected abort path. Destroying with
      // an Error would emit another error event on Readable/Transform stages,
      // and intermediate stages may not be the final responseBody listener.
      stream.destroy();
    }
  }
}


export function mergeFallbackResponseHeaders(headers: Headers, result: UpstreamFetchResult): Headers {
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


export function upstreamResponseHeaders(result: UpstreamFetchResult): Headers {
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
