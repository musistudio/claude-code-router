/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { Readable } from "node:stream";
import type { AppConfig, GatewayProviderConfig, GatewayProviderProtocol, ProviderCredentialConfig, RouterFallbackConfig } from "@ccr/core/contracts/app";
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
import { parseJsonObjectSafe, serializeJsonBodyWithModel } from "@ccr/core/gateway/http/body";
import { resolveGatewayPublicModelId } from "@ccr/core/gateway/features/model-discovery";
import { activeProviderCredentials, findProviderByPublicOrInternalName, findProviderCredentialBySlug, normalizedProviderCapabilities, parseProviderCredentialInternalName, providerCapabilityForClientProtocol, providerCapabilityInternalName, providerCapabilityNameMatches, providerCredentialInternalName, providerCredentialPriority, providerCredentialRuntimeId, providerCredentialSlug, providerProtocolForClientProtocol, sanitizeHeaderValue } from "@ccr/core/providers/runtime-topology";
import { delay } from "@ccr/core/gateway/internal/clock";
import { retryDelayAfterNetworkError, retryDelayAfterStatus, shouldFallbackAfterStatus } from "@ccr/core/gateway/upstream/retry-policy";
import { claudeCodeOauthBetaHeader, claudeCodeOauthRequiredBeta, UpstreamRequestError } from "@ccr/core/gateway/internal/shared";
import type { ApiKeyLimitUsage, ProviderCredentialRoutingTarget, UpstreamAttempt, UpstreamFailedAttempt, UpstreamFetchResult } from "@ccr/core/gateway/internal/shared";

const providerCredentialSpilloverThreshold = 0.8;


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
  routedModel?: string;
  signal?: AbortSignal;
  upstreamUrl: string;
}): Promise<UpstreamFetchResult> {
  const fallbackMode = input.fallback.mode;
  const attempts = buildUpstreamAttempts(
    input.config,
    input.fallback,
    input.method,
    input.path,
    input.body,
    input.routedModel
  );
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
      const response = await fetchWithSystemProxy(rewriteRouteModelInUrl(input.upstreamUrl, attempt.model), {
        body: shouldSendBody(input.method) ? attempt.body?.toString("utf8") : undefined,
        headers: withCoreGatewayAuthHeader(omitLocalObservabilityHeaders(attempt.headers ?? input.headers), input.coreAuthToken),
        method: input.method,
        signal: input.signal
      });

      if (hasNextAttempt && shouldFallbackAfterStatus(response.status, fallbackMode)) {
        const delayMs = retryDelayAfterStatus(response.headers, failedAttempts.length);
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
      const delayMs = hasNextAttempt && !input.signal?.aborted
        ? retryDelayAfterNetworkError(failedAttempts.length)
        : 0;
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
          await delay(delayMs);
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
    const body = bodyHasConfiguredProviderModelSelector(input.attempt.body, input.config)
      ? input.attempt.body
      : normalizedBody?.body ?? input.attempt.body;
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
    return {
      ...input.attempt,
      body: attemptBody(preserveModelSelector ? input.attempt.body : target.body ?? normalizedBody?.body ?? input.attempt.body),
      headers: preserveModelSelector
        ? clearTargetProviderHeaders(attemptHeaders)
        : targetProviderFallbackHeaders(attemptHeaders, target.provider, target.protocol)
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
  return capability ? providerCapabilityInternalName(provider, capability.type) : provider.name || providerRuntimeId(provider);
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
  return Buffer.from(`${JSON.stringify(next)}\n`, "utf8");
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
  return Buffer.from(`${JSON.stringify({
    ...parsedBody,
    stream_options: {
      ...streamOptions,
      include_usage: true
    }
  })}\n`, "utf8");
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
): ProviderCredentialRoutingTarget | undefined {
  const protocol = requestProtocolForPath(path);
  if (!protocol) {
    return undefined;
  }

  const parsedBody = parseJsonObjectSafe(body);
  const bodyModel = stringValue(parsedBody?.model);
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

  const targetProviderName = firstTargetProviderHeader(headers);
  if (!targetProviderName) {
    return undefined;
  }

  const provider = findProviderByPublicOrInternalName(config, targetProviderName);
  if (!provider) {
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
    protocol: providerProtocol,
    source: "header"
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
    body: parsedBody && !modelInPath && fallback.mode === "model-chain" && attempt.model
      ? serializeJsonBodyWithModel(parsedBody, attempt.model)
      : body,
    index: attempt.index,
    model: attempt.model,
    target: attempt.target
  }));
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
