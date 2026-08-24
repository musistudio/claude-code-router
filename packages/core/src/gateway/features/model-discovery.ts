/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { IncomingHttpHeaders } from "node:http";
import { isGatewayProviderEnabled } from "@ccr/core/contracts/app";
import type { ApiKeyConfig, AppConfig, ProfileConfig, ProviderModelMetadata } from "@ccr/core/contracts/app";
import { buildClaudeAppGatewayModelRoutes, resolveClaudeAppGatewayRouteModel } from "@ccr/core/agents/claude-app/gateway-routes";
import { modelRegistryForConfig, normalizeRouteSelector } from "@ccr/core/routing/model-registry";
import { findModelCatalogEntry, modelCatalogMaxInputTokens, modelCatalogMaxOutputTokens, readCatalogCapability, type ModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import { stringValue } from "@ccr/core/gateway/internal/value";
import { fusionModelSelector } from "@ccr/core/mcp/fusion-config";
import { readHeader } from "@ccr/core/gateway/http/io";
import { claudeAppGatewayModelRouteOptions, claudeCodeOneMillionContextSuffix } from "@ccr/core/gateway/internal/shared";
import type { ClaudeCodeDiscoverableModel } from "@ccr/core/gateway/internal/shared";
import { parseJsonObjectSafe, serializeJsonBodyWithModel } from "@ccr/core/gateway/http/body";
import { uniqueStrings } from "@ccr/core/gateway/internal/collections";
import { contextArchiveConfigForApiKey, contextArchiveMcpEnabled } from "@ccr/core/gateway/context-archive";
import { resolveUsageModelAttribution } from "@ccr/core/usage/model-attribution";
import { filterModelIdsForProfile, isModelAllowedForProfile, profileForApiKey } from "@ccr/core/profiles/model-allowlist";


export function shouldServeGatewayModelsResponse(method: string, path: string): boolean {
  return (method || "GET").toUpperCase() === "GET" &&
    ["/models", "/v1/models"].includes(normalizeGatewayPathname(path));
}


export function shouldServeClaudeCliBootstrapResponse(method: string, path: string): boolean {
  return (method || "GET").toUpperCase() === "GET" &&
    normalizeGatewayPathname(path) === "/api/claude_cli/bootstrap";
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
    claudeAppGatewayModelRouteOptions
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
  const contextArchiveConfig = contextArchiveConfigForApiKey(config, apiKey);
  const contextArchiveCompact = Boolean(contextArchiveConfig && contextArchiveMcpEnabled(contextArchiveConfig));
  const profile = profileForApiKey(config, apiKey);
  if (isClaudeAppApiKey(apiKey)) {
    return createClaudeAppGatewayModelsResponse(config, { contextArchiveCompact, profile });
  }
  if (isClaudeCodeUserAgent(headers)) {
    return createClaudeAppGatewayModelsResponse(config, { claudeCode: true, contextArchiveCompact, profile });
  }
  return createOpenAICompatibleGatewayModelsResponse(config, profile);
}


export function createClaudeCliBootstrapResponse(config: AppConfig, apiKey?: ApiKeyConfig): Record<string, unknown> {
  return createClaudeCliBootstrapPayload(config, profileForApiKey(config, apiKey));
}


function createClaudeCliBootstrapPayload(config: AppConfig, profile?: ProfileConfig): Record<string, unknown> {
  const windows = createClaudeCliAutoCompactWindows(config, profile);
  return {
    additional_model_options: createClaudeCliAdditionalModelOptions(config, profile),
    auto_compact_windows: windows,
    client_data: {
      rowan_thicket: { ...windows }
    }
  };
}


export function claudeClientDiscoveryPayloads(
  config: AppConfig,
  options: { contextArchiveCompact?: boolean; profile?: ProfileConfig } = {}
): Record<string, unknown> {
  const { contextArchiveCompact, profile } = options;
  return {
    bootstrap: createClaudeCliBootstrapPayload(config, profile),
    claudeApp: createClaudeAppGatewayModelsResponse(config, { contextArchiveCompact, profile }),
    claudeCode: createClaudeAppGatewayModelsResponse(config, { claudeCode: true, contextArchiveCompact, profile })
  };
}


type ClaudeCliAdditionalModelOption = {
  capabilities: Record<string, unknown>;
  created_at: string;
  description: string;
  display_name: string;
  id: string;
  max_input_tokens: number;
  max_tokens: number;
  model: string;
  name: string;
  type: "model";
};


function createClaudeCliAdditionalModelOptions(config: AppConfig, profile?: ProfileConfig): ClaudeCliAdditionalModelOption[] {
  const options: ClaudeCliAdditionalModelOption[] = [];
  const seen = new Set<string>();
  const routes = buildClaudeAppGatewayModelRoutes(config, claudeAppGatewayModelRouteOptions);
  for (const route of routes) {
    if (!isModelAllowedForProfile(config, profile, route.targetModel)) {
      continue;
    }
    const id = route.oneMillionContext ? claudeCodeOneMillionContextModelId(route.id) : route.id;
    const normalized = id.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const catalogId = stripClaudeCodeOneMillionContextSuffix(route.targetModel);
    const modelDiscovery = providerModelDiscoveryForSelector(config, catalogId);
    const maxInputTokens = claudeGatewayModelContextWindow(
      modelDiscovery.catalogEntry,
      route.oneMillionContext,
      modelDiscovery.metadata
    );
    const maxOutputTokens = claudeGatewayModelMaxOutputTokens(modelDiscovery.catalogEntry, modelDiscovery.metadata);
    const name = route.oneMillionContext ? `${route.displayName} (1M context)` : route.displayName;
    options.push({
      capabilities: createClaudeCodeModelCapabilities(modelDiscovery.catalogEntry, {
        maxInputTokens,
        oneMillionContext: route.oneMillionContext,
        ...providerModelCapabilityOverrides(modelDiscovery.metadata)
      }),
      created_at: "1970-01-01T00:00:00Z",
      description: formatClaudeCliAdditionalModelDescription(maxInputTokens),
      display_name: name,
      id: normalized,
      max_input_tokens: maxInputTokens,
      max_tokens: maxOutputTokens,
      model: normalized,
      name,
      type: "model"
    });
  }
  return options;
}


function formatClaudeCliAdditionalModelDescription(maxInputTokens: number): string {
  const tokens = positiveInteger(maxInputTokens);
  if (!tokens) {
    return "CCR gateway model";
  }
  return `${formatCompactTokenCount(tokens)} context window`;
}


function formatCompactTokenCount(tokens: number): string {
  if (tokens >= 1_000_000 && tokens % 1_000_000 === 0) {
    return `${tokens / 1_000_000}M`;
  }
  if (tokens >= 1_000 && tokens % 1_000 === 0) {
    return `${tokens / 1_000}k`;
  }
  return `${tokens.toLocaleString("en-US")} tokens`;
}


function createOpenAICompatibleGatewayModelsResponse(config: AppConfig, profile?: ProfileConfig): Record<string, unknown> {
  const data = buildGatewayDiscoverableModelIds(config, profile).map((id) => {
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


export function createClaudeCliAutoCompactWindows(config: AppConfig, profile?: ProfileConfig): Record<string, number> {
  const windows: Record<string, number> = {};
  const routes = buildClaudeAppGatewayModelRoutes(config, claudeAppGatewayModelRouteOptions);
  for (const route of routes) {
    if (!isModelAllowedForProfile(config, profile, route.targetModel)) {
      continue;
    }
    const catalogId = stripClaudeCodeOneMillionContextSuffix(route.targetModel);
    const modelDiscovery = providerModelDiscoveryForSelector(config, catalogId);
    const maxInputTokens = claudeGatewayModelContextWindow(
      modelDiscovery.catalogEntry,
      route.oneMillionContext,
      modelDiscovery.metadata
    );
    const compactWindow = claudeCliAutoCompactWindow(maxInputTokens);
    if (!compactWindow) {
      continue;
    }

    const routeId = route.oneMillionContext ? claudeCodeOneMillionContextModelId(route.id) : route.id;
    for (const id of uniqueStrings([routeId, route.id, route.legacyId, ...(route.legacyIds ?? [])])) {
      const key = id.trim();
      if (key) {
        assignClaudeCliAutoCompactWindow(windows, key, compactWindow);
        if (compactWindow > claudeCodeUnknownModelDefaultContextWindow) {
          assignClaudeCliAutoCompactWindow(windows, claudeCodeOneMillionContextModelId(key), compactWindow);
        }
      }
    }
  }
  return windows;
}


function assignClaudeCliAutoCompactWindow(windows: Record<string, number>, key: string, compactWindow: number): void {
  windows[key] = compactWindow;
  const lowerKey = key.toLowerCase();
  if (lowerKey !== key) {
    windows[lowerKey] = compactWindow;
  }
}


const claudeCodeUnknownModelDefaultContextWindow = 200_000;


function claudeCliAutoCompactWindow(maxInputTokens: number): number | undefined {
  const window = positiveInteger(maxInputTokens);
  if (!window) {
    return undefined;
  }
  return Math.min(1_000_000, Math.max(100_000, window));
}


function createClaudeAppGatewayModelsResponse(
  config: AppConfig,
  options: { claudeCode?: boolean; contextArchiveCompact?: boolean; profile?: ProfileConfig } = {}
): Record<string, unknown> {
  const routes = buildClaudeAppGatewayModelRoutes(config, claudeAppGatewayModelRouteOptions)
    .filter((route) => isModelAllowedForProfile(config, options.profile, route.targetModel));
  const data = routes.map((route) => {
    const catalogId = stripClaudeCodeOneMillionContextSuffix(route.targetModel);
    const modelDiscovery = providerModelDiscoveryForSelector(config, catalogId);
    const catalogEntry = modelDiscovery.catalogEntry;
    const modelMetadata = modelDiscovery.metadata;
    const maxInputTokens = claudeGatewayModelContextWindow(catalogEntry, route.oneMillionContext, modelMetadata);
    const maxOutputTokens = claudeGatewayModelMaxOutputTokens(catalogEntry, modelMetadata);
    const exposeOneMillionContextVariant = options.claudeCode && route.oneMillionContext;
    return {
      id: exposeOneMillionContextVariant ? claudeCodeOneMillionContextModelId(route.id) : route.id,
      capabilities: createClaudeCodeModelCapabilities(catalogEntry, {
        contextArchiveCompact: options.contextArchiveCompact,
        maxInputTokens,
        oneMillionContext: route.oneMillionContext,
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


function createClaudeCodeModelsResponse(
  config: AppConfig,
  contextArchiveCompact = false,
  profile?: ProfileConfig
): Record<string, unknown> {
  const models = buildClaudeCodeDiscoverableModels(config, profile);
  const data = models.map((model) => {
    const claudeId = claudeCodeDiscoveryModelId(model.id);
    const catalogId = stripClaudeCodeOneMillionContextSuffix(model.id);
    const modelDiscovery = providerModelDiscoveryForSelector(config, catalogId);
    const catalogEntry = modelDiscovery.catalogEntry;
    const modelMetadata = modelDiscovery.metadata;
    const maxInputTokens = claudeGatewayModelContextWindow(catalogEntry, model.oneMillionContext, modelMetadata);
    const maxOutputTokens = claudeGatewayModelMaxOutputTokens(catalogEntry, modelMetadata);
    return {
      id: claudeId,
      capabilities: createClaudeCodeModelCapabilities(catalogEntry, {
        contextArchiveCompact,
        maxInputTokens,
        oneMillionContext: model.oneMillionContext,
        ...providerModelCapabilityOverrides(modelMetadata)
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

export function createClaudeCodeModelsResponseForTest(config: AppConfig, apiKey?: ApiKeyConfig): Record<string, unknown> {
  const contextArchiveConfig = contextArchiveConfigForApiKey(config, apiKey);
  return createClaudeCodeModelsResponse(
    config,
    Boolean(contextArchiveConfig && contextArchiveMcpEnabled(contextArchiveConfig)),
    profileForApiKey(config, apiKey)
  );
}


function claudeGatewayModelContextWindow(
  entry: ModelCatalogEntry | undefined,
  oneMillionContext: boolean,
  metadata?: ProviderModelMetadata
): number {
  const providerContextWindow = effectiveProviderContextWindow(metadata);
  if (providerContextWindow) {
    return providerContextWindow;
  }
  const contextWindow = modelCatalogMaxInputTokens(entry);
  if (contextWindow > 0) {
    return contextWindow;
  }
  return oneMillionContext ? 1_000_000 : 0;
}


function claudeGatewayModelMaxOutputTokens(
  entry: ModelCatalogEntry | undefined,
  metadata?: ProviderModelMetadata
): number {
  return positiveInteger(metadata?.maxOutputTokens) ?? modelCatalogMaxOutputTokens(entry);
}


function effectiveProviderContextWindow(metadata: ProviderModelMetadata | undefined): number | undefined {
  const contextWindow = positiveInteger(metadata?.contextWindow) ?? positiveInteger(metadata?.maxContextWindow);
  if (!contextWindow) {
    return undefined;
  }
  const effectivePercent = percentage(metadata?.effectiveContextWindowPercent) ?? 100;
  return Math.max(1, Math.floor((contextWindow * effectivePercent) / 100));
}


function providerModelDiscoveryForSelector(
  config: AppConfig,
  selector: string
): { catalogEntry?: ModelCatalogEntry; metadata?: ProviderModelMetadata } {
  const resolved = providerModelResolutionForSelector(config, selector);
  if (!resolved) {
    return {
      catalogEntry: findModelCatalogEntry(selector)
    };
  }
  const physicalSelector = `${resolved.provider.name}/${resolved.model}`;
  return {
    catalogEntry: findModelCatalogEntry(physicalSelector) ?? findModelCatalogEntry(selector),
    metadata: providerModelMetadataForResolvedModel(resolved)
  };
}


function providerModelMetadataForResolvedModel(
  resolved: NonNullable<ReturnType<typeof providerModelResolutionForSelector>>
): ProviderModelMetadata | undefined {
  const metadata = resolved.provider.modelMetadata ?? {};
  const direct = metadata[resolved.model];
  if (direct) {
    return direct;
  }
  const normalizedModel = resolved.model.toLowerCase();
  return Object.entries(metadata).find(([model]) => model.trim().toLowerCase() === normalizedModel)?.[1];
}


function providerModelResolutionForSelector(config: AppConfig, selector: string) {
  const registry = modelRegistryForConfig(config);
  const direct = registry.resolveProviderModel(selector);
  if (direct) {
    return direct;
  }

  const attribution = resolveUsageModelAttribution(config, selector);
  if (!attribution.provider || !attribution.model) {
    return undefined;
  }
  const resolved = registry.resolve(`${attribution.provider}/${attribution.model}`);
  return resolved?.kind === "provider"
    ? { model: resolved.model, provider: resolved.provider }
    : undefined;
}


function gatewayModelSupportsOneMillionContext(config: AppConfig, selector: string): boolean {
  const discovery = providerModelDiscoveryForSelector(config, selector);
  const metadataContextWindow = effectiveProviderContextWindow(discovery.metadata);
  return Boolean(
    (metadataContextWindow && metadataContextWindow >= 1_000_000) ||
    discovery.catalogEntry?.limits?.supports1MContext
  );
}


function percentage(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 && value <= 100
    ? value
    : undefined;
}


function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}


function buildClaudeCodeDiscoverableModelIds(config: AppConfig, profile?: ProfileConfig): string[] {
  return buildGatewayDiscoverableModelIds(config, profile);
}


function buildGatewayDiscoverableModelIds(config: AppConfig, profile?: ProfileConfig): string[] {
  const baseEntries: Array<{ modelName: string; providerName: string }> = [];
  for (const provider of config.Providers) {
    const providerName = provider.name?.trim();
    if (!isGatewayProviderEnabled(provider) || !providerName || !Array.isArray(provider.models)) {
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
  for (const virtualProfile of config.virtualModelProfiles ?? []) {
    if (!isVisibleVirtualModelProfile(virtualProfile)) {
      continue;
    }

    for (const entry of baseEntries) {
      for (const prefix of virtualProfile.match?.prefixes ?? []) {
        const normalizedPrefix = prefix.trim();
        if (normalizedPrefix) {
          ids.push(`${entry.providerName}/${normalizedPrefix}${entry.modelName}`);
        }
      }
      for (const suffix of virtualProfile.match?.suffixes ?? []) {
        const normalizedSuffix = suffix.trim();
        if (normalizedSuffix) {
          ids.push(`${entry.providerName}/${entry.modelName}${normalizedSuffix}`);
        }
      }
    }

    for (const alias of virtualProfile.match?.exactAliases ?? []) {
      const normalizedAlias = alias.trim();
      if (!normalizedAlias) {
        continue;
      }
      ids.push(fusionModelSelector(normalizedAlias));
    }
  }

  return filterModelIdsForProfile(config, uniqueStrings(ids), profile);
}


function gatewayModelOwner(id: string): string {
  const separator = id.indexOf("/");
  return separator > 0 ? id.slice(0, separator).trim() || "ccr" : "ccr";
}


function buildClaudeCodeDiscoverableModels(config: AppConfig, profile?: ProfileConfig): ClaudeCodeDiscoverableModel[] {
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

  for (const id of buildClaudeCodeDiscoverableModelIds(config, profile)) {
    pushModel(id, hasClaudeCodeOneMillionContextSuffix(id));
    const baseId = stripClaudeCodeOneMillionContextSuffix(id);
    if (!hasClaudeCodeOneMillionContextSuffix(id) && gatewayModelSupportsOneMillionContext(config, baseId)) {
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
    if (!isGatewayProviderEnabled(provider)) {
      continue;
    }
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
  options: {
    contextArchiveCompact?: boolean;
    imageInput?: boolean;
    maxInputTokens?: number;
    oneMillionContext?: boolean;
    reasoning?: boolean;
    reasoningLevels?: string[];
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
  const supportsOneMillionContext = maxInputTokens >= 1_000_000 || Boolean(entry.limits?.supports1MContext);

  return {
    audio_input: { supported: supportsAudioInput },
    audio_output: { supported: supportsAudioOutput },
    batch: { supported: supportsBatch },
    citations: { supported: supportsCitations },
    code_execution: { supported: supportsCodeExecution },
    context_management: {
      clear_thinking_20251015: { supported: supportsReasoning },
      clear_tool_uses_20250919: { supported: supportsToolUse },
      compact_20260112: { supported: options.contextArchiveCompact === true && maxInputTokens > 0 },
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
    contextArchiveCompact?: boolean;
    imageInput?: boolean;
    maxInputTokens?: number;
    oneMillionContext?: boolean;
    reasoning?: boolean;
    reasoningLevels?: string[];
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
      compact_20260112: { supported: options.contextArchiveCompact === true },
      ...(maxInputTokens ? { max_input_tokens: maxInputTokens } : {}),
      supported: true
    },
    ...(maxInputTokens
      ? {
          context_window: {
            max_input_tokens: maxInputTokens,
            one_million_context_variant: options.oneMillionContext === true,
            supported: true,
            supports_1m_context: maxInputTokens >= 1_000_000
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
