/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { IncomingHttpHeaders } from "node:http";
import type { ApiKeyConfig, AppConfig, ProviderModelMetadata } from "@ccr/core/contracts/app";
import {
  buildClaudeAppGatewayModelRoutes,
  effectiveProviderModelContextWindow,
  resolveClaudeAppGatewayRouteModel
} from "@ccr/core/agents/claude-app/gateway-routes";
import { claudeAppGatewayModelRouteOptions } from "@ccr/core/agents/claude-app/model-route-options";
import { modelRegistryForConfig, normalizeRouteSelector } from "@ccr/core/routing/model-registry";
import { findModelCatalogEntry, modelCatalogMaxInputTokens, modelCatalogMaxOutputTokens, readCatalogCapability, type ModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import { stringValue } from "@ccr/core/gateway/internal/value";
import { fusionModelSelector } from "@ccr/core/mcp/fusion-config";
import { readHeader } from "@ccr/core/gateway/http/io";
import { claudeCodeOneMillionContextSuffix } from "@ccr/core/gateway/internal/shared";
import { parseJsonObjectSafe, serializeJsonBodyWithModel } from "@ccr/core/gateway/http/body";
import { uniqueStrings } from "@ccr/core/gateway/internal/collections";


export function shouldServeGatewayModelsResponse(method: string, path: string): boolean {
  return (method || "GET").toUpperCase() === "GET" &&
    normalizeGatewayPathname(path) === "/v1/models";
}


export function prepareClaudeCodeDiscoveredModelRequest(
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


export function prepareClaudeAppDiscoveredModelRequest(
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

  const routedModel = resolveClaudeAppGatewayRouteModel(
    normalizedModel,
    config,
    claudeAppGatewayModelRouteOptions(config)
  );
  if (!routedModel || routedModel.toLowerCase() === normalizedModel.toLowerCase()) {
    return undefined;
  }
  return {
    body: serializeJsonBodyWithModel(parsedBody, routedModel),
    diagnostic: `${model}->${routedModel}`,
    routedModel
  };
}


export function createGatewayModelsResponse(config: AppConfig, headers: IncomingHttpHeaders, apiKey?: ApiKeyConfig): Record<string, unknown> {
  if (isClaudeAppApiKey(apiKey)) {
    return createClaudeAppGatewayModelsResponse(config);
  }
  if (isClaudeCodeUserAgent(headers)) {
    return createClaudeAppGatewayModelsResponse(config, { claudeCode: true });
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


function createClaudeAppGatewayModelsResponse(
  config: AppConfig,
  options: { claudeCode?: boolean } = {}
): Record<string, unknown> {
  const routes = buildClaudeAppGatewayModelRoutes(
    config,
    claudeAppGatewayModelRouteOptions(config)
  );
  const data = routes.map((route) => {
    const catalogId = stripClaudeCodeOneMillionContextSuffix(route.targetModel);
    const catalogEntry = findModelCatalogEntry(catalogId);
    const modelMetadata = providerModelMetadataForSelector(config, catalogId);
    const providerContextWindow = effectiveProviderModelContextWindow(config, catalogId);
    const maxInputTokens = claudeGatewayModelContextWindow(catalogEntry, route.oneMillionContext, providerContextWindow);
    const maxOutputTokens = modelCatalogMaxOutputTokens(catalogEntry);
    const exposeOneMillionContextVariant = options.claudeCode && route.oneMillionContext;
    return {
      id: exposeOneMillionContextVariant ? claudeCodeOneMillionContextModelId(route.id) : route.id,
      capabilities: createClaudeCodeModelCapabilities(catalogEntry, {
        maxInputTokens,
        oneMillionContext: route.oneMillionContext,
        supportsOneMillionContext: route.oneMillionContext,
        ...providerModelCapabilityOverrides(modelMetadata)
      }),
      created_at: "1970-01-01T00:00:00Z",
      display_name: exposeOneMillionContextVariant
        ? `${route.displayName} (1M context)`
        : route.displayName,
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


function claudeGatewayModelContextWindow(
  entry: ModelCatalogEntry | undefined,
  oneMillionContext: boolean,
  providerContextWindow?: number
): number {
  if (providerContextWindow) {
    return providerContextWindow;
  }
  const contextWindow = modelCatalogMaxInputTokens(entry);
  if (contextWindow > 0) {
    return contextWindow;
  }
  return oneMillionContext ? 1_000_000 : 0;
}


function providerModelMetadataForSelector(
  config: AppConfig,
  selector: string
): ProviderModelMetadata | undefined {
  const resolved = modelRegistryForConfig(config).resolveProviderModel(selector);
  if (!resolved) {
    return undefined;
  }
  const metadata = resolved.provider.modelMetadata ?? {};
  const direct = metadata[resolved.model];
  if (direct) {
    return direct;
  }
  const normalizedModel = resolved.model.toLowerCase();
  return Object.entries(metadata).find(
    ([model]) => model.trim().toLowerCase() === normalizedModel
  )?.[1];
}


function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
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


export function resolveGatewayPublicModelId(model: string | undefined, config: AppConfig): string | undefined {
  const normalized = normalizeRouteSelector(model);
  if (!normalized || !normalized.toLowerCase().startsWith("claude-")) {
    return undefined;
  }
  if (isConfiguredGatewayModelSelector(normalized, config)) {
    return undefined;
  }
  return resolveClaudeCodeDiscoveredModelId(normalized, config) ??
    resolveClaudeAppGatewayRouteModel(
      normalized,
      config,
      claudeAppGatewayModelRouteOptions(config)
    );
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


function claudeCodeOneMillionContextModelId(id: string): string {
  return hasClaudeCodeOneMillionContextSuffix(id)
    ? id
    : `${id}${claudeCodeOneMillionContextSuffix}`;
}


function hasClaudeCodeOneMillionContextSuffix(id: string): boolean {
  return id.trim().toLowerCase().endsWith(claudeCodeOneMillionContextSuffix);
}


function stripClaudeCodeOneMillionContextSuffix(id: string): string {
  return id.trim().replace(/\[1m\]$/i, "").trim();
}


function createClaudeCodeModelCapabilities(
  entry?: ModelCatalogEntry,
  options: {
    imageInput?: boolean;
    maxInputTokens?: number;
    oneMillionContext?: boolean;
    reasoning?: boolean;
    reasoningLevels?: string[];
    supportsOneMillionContext?: boolean;
  } = {}
): Record<string, unknown> {
  if (!entry) {
    return createDefaultClaudeCodeModelCapabilities(options);
  }

  const capabilities = entry.capabilities ?? {};
  const inputModalities = new Set((entry.modalities?.input ?? []).map((item) => item.toLowerCase()));
  const outputModalities = new Set((entry.modalities?.output ?? []).map((item) => item.toLowerCase()));
  const supportsReasoning = options.reasoning ?? readCatalogCapability(capabilities, "reasoning");
  const supportsReasoningLevel = (effort: string) => options.reasoningLevels
    ? options.reasoningLevels.includes(effort)
    : supportsReasoning;
  const supportsImageInput = options.imageInput ??
    (readCatalogCapability(capabilities, "imageInput") || inputModalities.has("image"));
  const supportsPdfInput = readCatalogCapability(capabilities, "pdfInput") || inputModalities.has("pdf");
  const catalogSupportsStructuredOutput =
    readCatalogCapability(capabilities, "structuredOutput") ||
    readCatalogCapability(capabilities, "nativeStructuredOutput") ||
    readCatalogCapability(capabilities, "responseSchema");
  const supportsStructuredOutput = catalogSupportsStructuredOutput;
  const supportsCodeExecution = readCatalogCapability(capabilities, "codeExecution");
  const supportsAdaptiveThinking = readCatalogCapability(capabilities, "adaptiveThinking");
  const catalogSupportsToolUse =
    readCatalogCapability(capabilities, "toolCalling") ||
    readCatalogCapability(capabilities, "functionCalling");
  const supportsToolUse = catalogSupportsToolUse;
  const supportsBatch = readCatalogCapability(capabilities, "batch");
  const supportsCitations = readCatalogCapability(capabilities, "citations");
  const supportsAudioInput = readCatalogCapability(capabilities, "audioInput") || inputModalities.has("audio");
  const supportsAudioOutput = readCatalogCapability(capabilities, "audioOutput") || outputModalities.has("audio");
  const supportsVideoInput = readCatalogCapability(capabilities, "videoInput") || inputModalities.has("video");
  const maxInputTokens = options.maxInputTokens ?? modelCatalogMaxInputTokens(entry);
  const supportsOneMillionContext = options.supportsOneMillionContext ??
    (maxInputTokens >= 1_000_000 || Boolean(entry.limits?.supports1MContext));

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
      high: { supported: supportsReasoningLevel("high") },
      low: { supported: supportsReasoningLevel("low") },
      max: { supported: supportsReasoningLevel("max") },
      medium: { supported: supportsReasoningLevel("medium") },
      supported: supportsReasoning,
      ultra: { supported: supportsReasoningLevel("ultra") },
      xhigh: { supported: supportsReasoningLevel("xhigh") }
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


function createDefaultClaudeCodeModelCapabilities(
  options: {
    imageInput?: boolean;
    maxInputTokens?: number;
    oneMillionContext?: boolean;
    reasoning?: boolean;
    reasoningLevels?: string[];
    supportsOneMillionContext?: boolean;
  } = {}
): Record<string, unknown> {
  const maxInputTokens = positiveInteger(options.maxInputTokens);
  const supportsReasoning = options.reasoning ?? true;
  const supportsReasoningLevel = (effort: string) => options.reasoningLevels
    ? options.reasoningLevels.includes(effort)
    : supportsReasoning;
  return {
    audio_input: { supported: false },
    batch: { supported: true },
    citations: { supported: true },
    code_execution: { supported: true },
    context_management: {
      clear_thinking_20251015: { supported: supportsReasoning },
      clear_tool_uses_20250919: { supported: true },
      compact_20260112: { supported: true },
      ...(maxInputTokens ? { max_input_tokens: maxInputTokens } : {}),
      supported: true
    },
    ...(maxInputTokens
      ? {
          context_window: {
            max_input_tokens: maxInputTokens,
            one_million_context_variant: options.oneMillionContext === true,
            supported: true,
            supports_1m_context: options.supportsOneMillionContext ?? maxInputTokens >= 1_000_000
          }
        }
      : {}),
    effort: {
      high: { supported: supportsReasoningLevel("high") },
      low: { supported: supportsReasoningLevel("low") },
      max: { supported: supportsReasoningLevel("max") },
      medium: { supported: supportsReasoningLevel("medium") },
      supported: supportsReasoning,
      ultra: { supported: supportsReasoningLevel("ultra") },
      xhigh: { supported: supportsReasoningLevel("xhigh") }
    },
    image_input: { supported: options.imageInput ?? true },
    pdf_input: { supported: true },
    structured_outputs: { supported: true },
    thinking: {
      supported: supportsReasoning,
      types: {
        adaptive: { supported: supportsReasoning },
        enabled: { supported: supportsReasoning }
      }
    },
    tool_use: { supported: true },
    video_input: { supported: false }
  };
}


function providerModelCapabilityOverrides(
  metadata: ProviderModelMetadata | undefined
): { imageInput?: boolean; reasoning?: boolean; reasoningLevels?: string[] } {
  const imageInput = metadata?.capabilities?.imageInput;
  const imageOverride = imageInput === undefined ? {} : { imageInput };
  if (metadata?.supportedReasoningLevels !== undefined) {
    const reasoningLevels = uniqueStrings(
      metadata.supportedReasoningLevels
        .map((level) => level.effort.trim().toLowerCase())
        .filter(Boolean)
    );
    return {
      ...imageOverride,
      reasoning: reasoningLevels.length > 0,
      reasoningLevels
    };
  }
  return metadata?.supportsReasoningSummaries === undefined
    ? imageOverride
    : { ...imageOverride, reasoning: metadata.supportsReasoningSummaries };
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
