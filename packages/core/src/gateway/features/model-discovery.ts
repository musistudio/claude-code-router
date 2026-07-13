/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { IncomingHttpHeaders } from "node:http";
import type { ApiKeyConfig, AppConfig } from "@ccr/core/contracts/app";
import { CLAUDE_APP_FALLBACK_MODEL, buildClaudeAppGatewayModelRoutes, inferClaudeAppGatewayTargetModel, resolveClaudeAppGatewayRouteModel } from "@ccr/core/agents/claude-app/gateway-routes";
import { normalizeRouteSelector } from "@ccr/core/routing/model-registry";
import { findModelCatalogEntry, modelCatalogMaxInputTokens, modelCatalogMaxOutputTokens, readCatalogCapability, type ModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import { stringValue } from "@ccr/core/gateway/internal/value";
import { fusionModelSelector } from "@ccr/core/mcp/fusion-config";
import { readHeader } from "@ccr/core/gateway/http/io";
import { claudeAppGatewayModelRouteOptions, claudeCodeOneMillionContextSuffix } from "@ccr/core/gateway/internal/shared";
import type { ClaudeCodeDiscoverableModel } from "@ccr/core/gateway/internal/shared";
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


export function prepareClaudeAppFallbackModelRequest(
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


export function createGatewayModelsResponse(config: AppConfig, headers: IncomingHttpHeaders, apiKey?: ApiKeyConfig): Record<string, unknown> {
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


export function resolveGatewayPublicModelId(model: string | undefined, config: AppConfig): string | undefined {
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
