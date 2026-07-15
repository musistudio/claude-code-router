import { BUILTIN_FUSION_VISION_TOOL_NAME, BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME } from "@ccr/core/contracts/app";
import type { AppConfig, GatewayProviderConfig, GatewayProviderProtocol, ProviderModelMetadata, ProviderReasoningLevel, VirtualModelProfileConfig } from "@ccr/core/contracts/app";
import {
  findModelCatalogEntry,
  modelCatalogMaxInputTokens,
  readCatalogCapability,
  type ModelCatalogEntry
} from "@ccr/core/gateway/model-catalog";
import { codexDefaultBaseUrl, readCodexLocalModelCatalog } from "@ccr/core/agents/local-providers/codex";
import { localAgentProviderApiKey } from "@ccr/core/agents/local-providers/shared";
import { normalizeProviderBaseUrl } from "@ccr/core/providers/url";

const fusionModelProviderName = "Fusion";
const codexDefaultContextWindow = 128_000;
const codexEffectiveContextWindowPercent = 95;

export type CodexModelCatalog = {
  models: CodexModelCatalogItem[];
};

export type CodexModelCatalogItem = {
  additional_speed_tiers: unknown[];
  apply_patch_tool_type: string | null;
  availability_nux: null;
  base_instructions: string;
  context_window: number;
  default_reasoning_level: string | null;
  default_reasoning_summary: string;
  description: string;
  display_name: string;
  effective_context_window_percent: number;
  experimental_supported_tools: unknown[];
  input_modalities: string[];
  max_context_window: number;
  priority: number;
  service_tiers: unknown[];
  shell_type: string;
  slug: string;
  support_verbosity: boolean;
  supported_in_api: boolean;
  supported_reasoning_levels: Array<{ description: string; effort: string }>;
  supports_image_detail_original: boolean;
  supports_parallel_tool_calls: boolean;
  supports_reasoning_summaries: boolean;
  supports_search_tool: boolean;
  truncation_policy: { limit: number; mode: string };
  upgrade: null;
  visibility: string;
  web_search_tool_type: string;
};

export function buildCodexModelCatalog(config?: Partial<Pick<AppConfig, "Providers" | "Router" | "virtualModelProfiles">>, selectedModel?: string): CodexModelCatalog {
  return {
    models: buildCodexModelCatalogIds(config, selectedModel).map((model, index) => codexModelCatalogItem(model, index, config))
  };
}

export function buildCodexModelCatalogIds(config?: Partial<Pick<AppConfig, "Providers" | "Router" | "virtualModelProfiles">>, selectedModel?: string): string[] {
  const ids: string[] = [];
  pushUniqueModel(ids, normalizeModelSelector(selectedModel));

  const baseEntries: Array<{ modelName: string; providerName: string }> = [];
  for (const provider of config?.Providers ?? []) {
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
      pushUniqueModel(ids, `${providerName}/${modelName}`);
    }
  }

  for (const profile of config?.virtualModelProfiles ?? []) {
    if (!virtualModelIsCatalogVisible(profile)) {
      continue;
    }
    for (const entry of baseEntries) {
      for (const prefix of profile.match?.prefixes ?? []) {
        const normalizedPrefix = prefix.trim();
        if (normalizedPrefix) {
          pushUniqueModel(ids, `${entry.providerName}/${normalizedPrefix}${entry.modelName}`);
        }
      }
      for (const suffix of profile.match?.suffixes ?? []) {
        const normalizedSuffix = suffix.trim();
        if (normalizedSuffix) {
          pushUniqueModel(ids, `${entry.providerName}/${entry.modelName}${normalizedSuffix}`);
        }
      }
    }
    for (const alias of virtualModelRawCatalogNames(profile)) {
      pushUniqueModel(ids, fusionModelSelector(alias));
    }
  }

  return ids;
}

export function codexModelCatalogJson(config?: Partial<Pick<AppConfig, "Providers" | "Router" | "virtualModelProfiles">>, selectedModel?: string): string {
  return `${JSON.stringify(buildCodexModelCatalog(config, selectedModel), null, 2)}\n`;
}

export function codexModelCatalogBase64(config?: Partial<Pick<AppConfig, "Providers" | "Router" | "virtualModelProfiles">>, selectedModel?: string): string {
  const catalog = buildCodexModelCatalog(config, selectedModel);
  return Buffer.from(JSON.stringify(catalog), "utf8").toString("base64");
}

function codexModelCatalogItem(
  model: string,
  priority: number,
  config?: Partial<Pick<AppConfig, "Providers" | "Router" | "virtualModelProfiles">>
): CodexModelCatalogItem {
  const profile = codexModelCapabilityProfile(model, config);
  const contextWindow = positiveInteger(profile.contextWindow) ?? positiveInteger(profile.maxContextWindow) ?? codexModelContextWindow(model, profile.catalogEntry);
  const maxContextWindow = Math.max(contextWindow, positiveInteger(profile.maxContextWindow) ?? contextWindow);
  const effectiveContextWindowPercent = percentage(profile.effectiveContextWindowPercent) ?? codexEffectiveContextWindowPercent;
  return {
    additional_speed_tiers: profile.additionalSpeedTiers,
    apply_patch_tool_type: profile.applyPatchToolType,
    availability_nux: null,
    base_instructions: "You are Codex, a coding agent.",
    context_window: contextWindow,
    default_reasoning_level: profile.defaultReasoningLevel,
    default_reasoning_summary: profile.defaultReasoningSummary,
    description: `CCR gateway model ${model}`,
    display_name: model,
    effective_context_window_percent: effectiveContextWindowPercent,
    experimental_supported_tools: [],
    input_modalities: profile.inputModalities,
    max_context_window: maxContextWindow,
    priority,
    service_tiers: profile.serviceTiers,
    shell_type: "shell_command",
    slug: model,
    support_verbosity: true,
    supported_in_api: true,
    supported_reasoning_levels: profile.supportedReasoningLevels,
    supports_image_detail_original: profile.supportsImageInput,
    supports_parallel_tool_calls: profile.supportsParallelToolCalls,
    supports_reasoning_summaries: profile.supportsReasoning,
    supports_search_tool: profile.supportsSearchTool,
    truncation_policy: { mode: "tokens", limit: 10_000 },
    upgrade: null,
    visibility: "list",
    web_search_tool_type: profile.supportsSearchTool && profile.supportsImageInput ? "text_and_image" : "text"
  };
}

type CodexCapabilityProfile = {
  additionalSpeedTiers: unknown[];
  applyPatchToolType: string | null;
  catalogEntry?: ModelCatalogEntry;
  contextWindow?: number;
  defaultReasoningLevel: string | null;
  defaultReasoningSummary: string;
  effectiveContextWindowPercent?: number;
  inputModalities: string[];
  supportedReasoningLevels: Array<{ description: string; effort: string }>;
  serviceTiers: unknown[];
  maxContextWindow?: number;
  supportsImageInput: boolean;
  supportsParallelToolCalls: boolean;
  supportsReasoning: boolean;
  supportsSearchTool: boolean;
};

function codexModelCapabilityProfile(
  model: string,
  config?: Partial<Pick<AppConfig, "Providers" | "Router" | "virtualModelProfiles">>
): CodexCapabilityProfile {
  const selector = parseModelSelector(model);
  const provider = selector?.provider ? findConfiguredProvider(config, selector.provider) : findConfiguredProviderForModel(config, model);
  const providerModel = selector?.model ?? model;
  const providerModelMetadata = provider
    ? providerModelMetadataFor(provider, providerModel) ?? localCodexModelMetadataFor(provider, providerModel)
    : undefined;
  const catalogEntry = findModelCatalogEntry(model);
  const capabilities = catalogEntry?.capabilities ?? {};
  const providerProtocol = provider ? codexProviderProtocol(provider) : undefined;
  const providerSupportsResponses = provider ? codexProviderSupportsResponses(provider) : false;
  const supportsFusionVision = codexVirtualModelSupportsFusionVision(model, config);
  const supportsFusionWebSearch = codexVirtualModelSupportsFusionWebSearch(model, config);
  const metadataReasoningLevels = normalizeProviderReasoningLevels(providerModelMetadata?.supportedReasoningLevels);
  const supportsReasoning = providerModelMetadata?.supportsReasoningSummaries ?? (metadataReasoningLevels ? true : readCatalogCapability(capabilities, "reasoning"));
  const supportsImageInput = supportsFusionVision || catalogEntrySupportsImageInput(catalogEntry);
  const supportsParallelToolCalls = readCatalogCapability(capabilities, "parallelFunctionCalling");
  const applyPatchToolType = providerSupportsResponses || catalogModelLooksLikeGpt(model, catalogEntry) || codexPatchBridgeApplies(model, catalogEntry, config)
    ? "freeform"
    : null;
  const supportsSearchTool =
    supportsFusionWebSearch ||
    (
      readCatalogCapability(capabilities, "webSearch") &&
      (
        providerProtocol === "openai_responses" ||
        providerProtocol === "anthropic_messages" ||
        providerProtocol === "gemini_interactions"
      )
    );

  return {
    additionalSpeedTiers: providerModelMetadata?.additionalSpeedTiers ?? [],
    applyPatchToolType,
    catalogEntry,
    contextWindow: providerModelMetadata?.contextWindow,
    defaultReasoningLevel: providerModelMetadata && providerModelMetadata.defaultReasoningLevel !== undefined
      ? providerModelMetadata.defaultReasoningLevel
      : supportsReasoning
      ? "medium"
      : null,
    defaultReasoningSummary: providerModelMetadata?.defaultReasoningSummary ?? "none",
    effectiveContextWindowPercent: providerModelMetadata?.effectiveContextWindowPercent,
    inputModalities: supportsImageInput ? ["text", "image"] : ["text"],
    serviceTiers: providerModelMetadata?.serviceTiers ?? [],
    maxContextWindow: providerModelMetadata?.maxContextWindow,
    supportedReasoningLevels: metadataReasoningLevels ?? (supportsReasoning ? supportedReasoningLevels(capabilities) : []),
    supportsImageInput,
    supportsParallelToolCalls,
    supportsReasoning,
    supportsSearchTool
  };
}

function providerModelMetadataFor(provider: GatewayProviderConfig, model: string): ProviderModelMetadata | undefined {
  const metadata = provider.modelMetadata ?? {};
  const direct = metadata[model];
  if (direct) {
    return direct;
  }
  const normalized = model.trim().toLowerCase();
  const match = Object.entries(metadata).find(([candidate]) => candidate.trim().toLowerCase() === normalized);
  return match?.[1];
}

function localCodexModelMetadataFor(provider: GatewayProviderConfig, model: string): ProviderModelMetadata | undefined {
  if (!isLocalCodexProvider(provider)) {
    return undefined;
  }
  return readCodexLocalModelCatalog().modelMetadata?.[model];
}

function isLocalCodexProvider(provider: GatewayProviderConfig): boolean {
  const baseUrl = providerBaseUrl(provider).trim().replace(/\/+$/g, "");
  const normalizedBaseUrl = normalizeProviderBaseUrl(baseUrl);
  const normalizedCodexBaseUrl = normalizeProviderBaseUrl(codexDefaultBaseUrl);
  return (
    providerApiKey(provider) === localAgentProviderApiKey &&
    (
      baseUrl.toLowerCase() === codexDefaultBaseUrl.toLowerCase() ||
      baseUrl.toLowerCase().includes("chatgpt.com/backend-api/codex") ||
      normalizedBaseUrl === normalizedCodexBaseUrl
    )
  );
}

function providerBaseUrl(provider: GatewayProviderConfig): string {
  return provider.api_base_url || provider.baseUrl || provider.baseurl || "";
}

function providerApiKey(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || "";
}

function normalizeProviderReasoningLevels(levels: ProviderReasoningLevel[] | undefined): Array<{ description: string; effort: string }> | undefined {
  const normalized = (levels ?? [])
    .map((level) => ({
      description: level.description.trim() || effortDescription(level.effort),
      effort: level.effort.trim()
    }))
    .filter((level) => level.effort);
  return normalized.length > 0 ? normalized : undefined;
}

function effortDescription(effort: string): string {
  const normalized = effort.trim().toLowerCase();
  if (normalized === "xhigh") {
    return "Extra high reasoning";
  }
  return `${effort.slice(0, 1).toUpperCase()}${effort.slice(1)} reasoning`;
}

function codexModelContextWindow(model: string, entry = findModelCatalogEntry(model)): number {
  return modelCatalogMaxInputTokens(entry) || codexDefaultContextWindow;
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

function catalogEntrySupportsImageInput(entry: ModelCatalogEntry | undefined): boolean {
  const capabilities = entry?.capabilities ?? {};
  const modalities = new Set((entry?.modalities?.input ?? []).map((item) => item.toLowerCase()));
  return modalities.has("image") ||
    readCatalogCapability(capabilities, "imageInput") ||
    readCatalogCapability(capabilities, "vision") ||
    readCatalogCapability(capabilities, "multimodal");
}

function supportedReasoningLevels(capabilities: Record<string, unknown>): Array<{ description: string; effort: string }> {
  const levels: Array<{ description: string; effort: string }> = [];
  if (readCatalogCapability(capabilities, "noneReasoningEffort")) {
    levels.push({ effort: "none", description: "No reasoning" });
  }
  if (readCatalogCapability(capabilities, "minimalReasoningEffort")) {
    levels.push({ effort: "minimal", description: "Minimal reasoning" });
  }
  levels.push(
    { effort: "low", description: "Low reasoning" },
    { effort: "medium", description: "Medium reasoning" },
    { effort: "high", description: "High reasoning" }
  );
  if (readCatalogCapability(capabilities, "xhighReasoningEffort") || readCatalogCapability(capabilities, "maxReasoningEffort")) {
    levels.push({ effort: "xhigh", description: "Extra high reasoning" });
  }
  if (readCatalogCapability(capabilities, "maxReasoningEffort")) {
    levels.push({ effort: "max", description: "Maximum reasoning" });
  }
  return levels;
}

function findConfiguredProvider(
  config: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">> | undefined,
  providerName: string
): GatewayProviderConfig | undefined {
  const normalized = providerName.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return (config?.Providers ?? []).find((provider) => provider.name.trim().toLowerCase() === normalized);
}

function findConfiguredProviderForModel(
  config: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">> | undefined,
  model: string
): GatewayProviderConfig | undefined {
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return (config?.Providers ?? []).find((provider) =>
    provider.models.some((candidate) => candidate.trim().toLowerCase() === normalized)
  );
}

function codexProviderProtocol(provider: GatewayProviderConfig): GatewayProviderProtocol | undefined {
  const capabilityProtocols = uniqueProviderProtocols((provider.capabilities ?? []).map((capability) => normalizeProviderProtocol(capability.type)));
  for (const protocol of ["openai_responses", "openai_chat_completions", "anthropic_messages", "gemini_generate_content", "gemini_interactions"] as GatewayProviderProtocol[]) {
    if (capabilityProtocols.includes(protocol)) {
      return protocol;
    }
  }

  return normalizeProviderProtocol(provider.type) ?? normalizeProviderProtocol(provider.provider) ?? inferProviderProtocol(provider);
}

function codexProviderSupportsResponses(provider: GatewayProviderConfig): boolean {
  return uniqueProviderProtocols((provider.capabilities ?? []).map((capability) => normalizeProviderProtocol(capability.type))).includes("openai_responses") ||
    normalizeProviderProtocol(provider.type) === "openai_responses" ||
    normalizeProviderProtocol(provider.provider) === "openai_responses" ||
    providerEndpointLooksLikeResponses(provider);
}

function inferProviderProtocol(provider: GatewayProviderConfig): GatewayProviderProtocol {
  const url = (provider.baseUrl || provider.baseurl || provider.api_base_url || "").toLowerCase();
  const transformer = JSON.stringify(provider.transformer ?? "").toLowerCase();
  if (providerEndpointLooksLikeResponses(provider)) {
    return "openai_responses";
  }
  if (url.includes("/interactions") || transformer.includes("gemini_interactions")) {
    return "gemini_interactions";
  }
  if (url.includes("generativelanguage.googleapis.com") || transformer.includes("gemini")) {
    return "gemini_generate_content";
  }
  if (url.includes("anthropic") || transformer.includes("anthropic")) {
    return "anthropic_messages";
  }
  return "openai_chat_completions";
}

function providerEndpointLooksLikeResponses(provider: GatewayProviderConfig): boolean {
  const url = (provider.baseUrl || provider.baseurl || provider.api_base_url || "").toLowerCase();
  return url.endsWith("/responses") || url.includes("/responses?");
}

function catalogModelLooksLikeGpt(model: string, entry: ModelCatalogEntry | undefined): boolean {
  return [
    model,
    entry?.id,
    entry?.model
  ].some((value) => typeof value === "string" && value.toLowerCase().includes("gpt"));
}

function codexPatchBridgeApplies(
  model: string,
  entry: ModelCatalogEntry | undefined,
  config?: Partial<Pick<AppConfig, "Router">>
): boolean {
  const codexRule = config?.Router?.builtInRules?.codex;
  if (!codexRule || codexRule.enabled === false) {
    return false;
  }
  return !catalogModelLooksLikeGpt(modelNameForPatchBridge(model), entry);
}

function modelNameForPatchBridge(model: string): string {
  return parseModelSelector(model)?.model ?? model;
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

function uniqueProviderProtocols(values: Array<GatewayProviderProtocol | undefined>): GatewayProviderProtocol[] {
  const seen = new Set<GatewayProviderProtocol>();
  const output: GatewayProviderProtocol[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
}

function parseModelSelector(model: string): { model: string; provider: string } | undefined {
  const normalized = normalizeModelSelector(model);
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= normalized.length - 1) {
    return undefined;
  }
  return {
    provider: normalized.slice(0, slashIndex),
    model: normalized.slice(slashIndex + 1)
  };
}

function codexVirtualModelSupportsFusionWebSearch(
  model: string,
  config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>
): boolean {
  return (config?.virtualModelProfiles ?? []).some((profile) =>
    virtualModelIsCatalogVisible(profile) &&
    virtualModelMatchesCatalogModel(profile, model, config) &&
    virtualModelProfileSupportsFusionWebSearch(profile)
  );
}

function codexVirtualModelSupportsFusionVision(
  model: string,
  config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>
): boolean {
  return (config?.virtualModelProfiles ?? []).some((profile) =>
    virtualModelIsCatalogVisible(profile) &&
    virtualModelMatchesCatalogModel(profile, model, config) &&
    virtualModelProfileSupportsFusionVision(profile)
  );
}

function virtualModelMatchesCatalogModel(
  profile: VirtualModelProfileConfig,
  model: string,
  config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>
): boolean {
  const normalizedModel = normalizeModelSelector(model);
  const normalizedModelLower = normalizedModel.toLowerCase();
  if (!normalizedModelLower) {
    return false;
  }

  for (const alias of virtualModelRawCatalogNames(profile)) {
    const normalizedAlias = alias.trim().toLowerCase();
    if (normalizedAlias && (normalizedModelLower === normalizedAlias || normalizedModelLower === fusionModelSelector(alias).toLowerCase())) {
      return true;
    }
  }

  const selector = parseModelSelector(normalizedModel);
  if (!selector) {
    return false;
  }
  const provider = findConfiguredProvider(config, selector.provider);
  if (!provider) {
    return false;
  }
  const configuredModels = new Set(provider.models.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const selectedModel = selector.model.trim();
  const selectedModelLower = selectedModel.toLowerCase();

  for (const prefix of profile.match?.prefixes ?? []) {
    const normalizedPrefix = prefix.trim();
    if (!normalizedPrefix || !selectedModelLower.startsWith(normalizedPrefix.toLowerCase())) {
      continue;
    }
    const baseModel = selectedModel.slice(normalizedPrefix.length).trim().toLowerCase();
    if (configuredModels.has(baseModel)) {
      return true;
    }
  }

  for (const suffix of profile.match?.suffixes ?? []) {
    const normalizedSuffix = suffix.trim();
    if (!normalizedSuffix || !selectedModelLower.endsWith(normalizedSuffix.toLowerCase())) {
      continue;
    }
    const baseModel = selectedModel.slice(0, selectedModel.length - normalizedSuffix.length).trim().toLowerCase();
    if (configuredModels.has(baseModel)) {
      return true;
    }
  }

  return false;
}

function virtualModelProfileSupportsFusionWebSearch(profile: VirtualModelProfileConfig): boolean {
  const metadata = recordValue(profile.metadata);
  const fusionWebSearch = recordValue(metadata?.fusionWebSearch);
  if (stringRecordValue(fusionWebSearch, "toolName")) {
    return true;
  }

  if (recordValue(profile.execution)?.matchWebSearch === true) {
    return true;
  }

  return (profile.tools ?? []).some((tool) => {
    const name = tool.name.trim();
    return fusionWebSearchToolNameMatches(name);
  });
}

function virtualModelProfileSupportsFusionVision(profile: VirtualModelProfileConfig): boolean {
  const metadata = recordValue(profile.metadata);
  const fusionVision = recordValue(metadata?.fusionVision);
  if (stringRecordValue(fusionVision, "toolName")) {
    return true;
  }

  if (recordValue(profile.execution)?.matchMultimodal === true) {
    return true;
  }

  return (profile.tools ?? []).some((tool) => fusionVisionToolNameMatches(tool.name.trim()));
}

function fusionVisionToolNameMatches(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[-.]/g, "_");
  return normalized === BUILTIN_FUSION_VISION_TOOL_NAME ||
    normalized.startsWith(`${BUILTIN_FUSION_VISION_TOOL_NAME}_`);
}

function fusionWebSearchToolNameMatches(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[-.]/g, "_");
  return normalized === BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME ||
    normalized.startsWith(`${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}_`) ||
    normalized.endsWith(`_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`) ||
    normalized.includes("search_web");
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringRecordValue(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function virtualModelIsCatalogVisible(profile: VirtualModelProfileConfig): boolean {
  return profile.enabled !== false &&
    profile.materialization?.enabled !== false &&
    profile.materialization?.includeInGatewayModels !== false;
}

function virtualModelRawCatalogNames(profile: VirtualModelProfileConfig): string[] {
  const exactAliases = uniqueStrings(profile.match?.exactAliases ?? []);
  if (exactAliases.length > 0) {
    return exactAliases;
  }
  return [profile.key || profile.displayName].filter(Boolean);
}

function fusionModelSelector(model: string): string {
  const normalized = fusionModelNameFromSelector(model);
  return normalized ? `${fusionModelProviderName}/${normalized}` : "";
}

function fusionModelNameFromSelector(model: string): string {
  const trimmed = model.trim();
  const prefix = `${fusionModelProviderName}/`;
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase())
    ? trimmed.slice(prefix.length).trim()
    : trimmed;
}

function normalizeModelSelector(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : "";
  }
  return trimmed;
}

function pushUniqueModel(models: string[], model: string | undefined): void {
  const normalized = model?.trim();
  if (normalized && !models.includes(normalized)) {
    models.push(normalized);
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}
