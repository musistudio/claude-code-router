import { loadAppConfig, saveAppConfig } from "@ccr/core/config/config";
import {
  isGatewayProviderEnabled,
  type AppConfig,
  type GatewayProviderCapabilityProtocol,
  type GatewayProviderConfig,
  type GatewayProviderProtocol,
  type ProfileConfig,
  type ProviderCredentialConfig,
  type ProviderModelMetadata
} from "@ccr/core/contracts/app";
import { codexDefaultBaseUrl, readCodexLocalModelCatalog } from "@ccr/core/agents/local-providers/codex";
import { localAgentProviderApiKey } from "@ccr/core/agents/local-providers/shared";
import { modelRegistryForConfig, parseProviderModelSelector, providerRuntimeId } from "@ccr/core/routing/model-registry";
import { probeGatewayProvider } from "@ccr/core/providers/probe";
import { normalizeProviderBaseUrl } from "@ccr/core/providers/url";

type ProviderModelProbe = typeof probeGatewayProvider;
type ProviderModelCatalogSnapshot = {
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
};

export const providerModelAutoRefreshIntervalMs = 10 * 60 * 1000;

export type ProviderModelAutoRefreshProviderResult = {
  addedModels: string[];
  error?: string;
  fetchedModels: string[];
  provider: string;
  providerIndex: number;
  skipped?: boolean;
};

export type ProviderModelAutoRefreshResult = {
  changed: boolean;
  config: AppConfig;
  profileAllowlistsUpdated: number;
  providers: ProviderModelAutoRefreshProviderResult[];
};

export type ProviderModelAutoRefreshOptions = {
  logger?: Pick<Console, "warn">;
  probeProvider?: ProviderModelProbe;
};

export type ProviderModelAutoRefreshRuntimeOptions = ProviderModelAutoRefreshOptions & {
  loadConfig?: () => Promise<AppConfig>;
  onConfigChanged?: (config: AppConfig, result: ProviderModelAutoRefreshResult) => Promise<void> | void;
  saveConfig?: (config: AppConfig) => Promise<AppConfig>;
};

let autoRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let autoRefreshEnabled = false;
let autoRefreshInFlight: Promise<ProviderModelAutoRefreshResult> | undefined;
let autoRefreshRuntimeOptions: ProviderModelAutoRefreshRuntimeOptions = {};

export function hasAutoFetchModelProviders(config: Pick<AppConfig, "Providers">): boolean {
  return config.Providers.some((provider) => provider.autoFetchModels && isGatewayProviderEnabled(provider));
}

export function syncProviderModelAutoRefreshService(
  config: Pick<AppConfig, "Providers">,
  options: ProviderModelAutoRefreshRuntimeOptions = {}
): void {
  autoRefreshRuntimeOptions = {
    ...autoRefreshRuntimeOptions,
    ...options
  };

  if (!hasAutoFetchModelProviders(config)) {
    stopProviderModelAutoRefreshService();
    return;
  }

  autoRefreshEnabled = true;
  scheduleProviderModelAutoRefresh(0);
}

export function stopProviderModelAutoRefreshService(): void {
  autoRefreshEnabled = false;
  if (autoRefreshTimer) {
    clearTimeout(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
}

export async function runProviderModelAutoRefreshNow(
  options: ProviderModelAutoRefreshRuntimeOptions = {}
): Promise<ProviderModelAutoRefreshResult> {
  autoRefreshRuntimeOptions = {
    ...autoRefreshRuntimeOptions,
    ...options
  };
  if (autoRefreshInFlight) {
    return autoRefreshInFlight;
  }

  autoRefreshInFlight = runProviderModelAutoRefresh(autoRefreshRuntimeOptions).finally(() => {
    autoRefreshInFlight = undefined;
  });
  return autoRefreshInFlight;
}

export async function refreshAutoFetchProviderModels(
  config: AppConfig,
  options: ProviderModelAutoRefreshOptions = {}
): Promise<ProviderModelAutoRefreshResult> {
  const probeProvider = options.probeProvider ?? probeGatewayProvider;
  let providers = config.Providers;
  const providerResults: ProviderModelAutoRefreshProviderResult[] = [];
  const addedByProvider: Array<{ addedModels: string[]; provider: GatewayProviderConfig }> = [];

  for (const [providerIndex, provider] of config.Providers.entries()) {
    if (!provider.autoFetchModels || !isGatewayProviderEnabled(provider)) {
      continue;
    }

    const providerName = provider.name.trim();
    const baseUrl = providerBaseUrl(provider);
    if (!providerName || !baseUrl) {
      providerResults.push({
        addedModels: [],
        fetchedModels: [],
        provider: providerName,
        providerIndex,
        skipped: true
      });
      continue;
    }

    try {
      const probe = await probeProvider({
        apiKey: providerApiKeyForModelRefresh(provider),
        baseUrl,
        forceRefresh: true,
        mode: "models",
        models: provider.models,
        providerPlugins: providerPluginsForModelRefresh(config, provider),
        protocols: providerModelRefreshProtocols(provider)
      });
      const discovered = mergeProviderModelCatalogSnapshots(probe, localProviderModelCatalogSnapshot(provider));
      const fetchedModels = uniqueModelList(discovered.models);
      const knownModels = mergeModelLists(provider.autoFetchKnownModels ?? [], provider.models);
      const hasKnownModelBaseline = Boolean(provider.autoFetchKnownModels?.length);
      const addedModels = hasKnownModelBaseline ? modelsNotIn(knownModels, fetchedModels) : [];
      const mergedModels = mergeModelLists(provider.models, addedModels);
      const nextKnownModels = mergeModelLists(knownModels, fetchedModels);
      providerResults.push({
        addedModels,
        fetchedModels,
        provider: providerName,
        providerIndex
      });
      if (addedModels.length === 0 && sameModelList(provider.autoFetchKnownModels, nextKnownModels)) {
        continue;
      }

      const nextProvider = {
        ...provider,
        autoFetchKnownModels: nextKnownModels.length > 0 ? nextKnownModels : undefined,
        modelDisplayNames: mergeProviderModelDisplayNames(provider.modelDisplayNames, discovered.modelDisplayNames, mergedModels),
        modelMetadata: mergeProviderModelMetadata(provider.modelMetadata, discovered.modelMetadata, mergedModels),
        models: mergedModels
      };
      providers = replaceAt(providers, providerIndex, nextProvider);
      if (addedModels.length > 0) {
        addedByProvider.push({ addedModels, provider });
      }
    } catch (error) {
      const message = formatError(error);
      options.logger?.warn?.(`[providers] Failed to refresh models for ${providerName}: ${message}`);
      providerResults.push({
        addedModels: [],
        error: message,
        fetchedModels: [],
        provider: providerName,
        providerIndex
      });
    }
  }

  if (providers === config.Providers) {
    return {
      changed: false,
      config,
      profileAllowlistsUpdated: 0,
      providers: providerResults
    };
  }

  const profileUpdate = profileAllowlistsWithAutoFetchedModels(config, addedByProvider);
  return {
    changed: true,
    config: {
      ...config,
      Providers: providers,
      profile: {
        ...config.profile,
        profiles: profileUpdate.profiles
      }
    },
    profileAllowlistsUpdated: profileUpdate.changedCount,
    providers: providerResults
  };
}

async function runProviderModelAutoRefresh(
  options: ProviderModelAutoRefreshRuntimeOptions
): Promise<ProviderModelAutoRefreshResult> {
  const loadConfig = options.loadConfig ?? loadAppConfig;
  const saveConfig = options.saveConfig ?? saveAppConfig;
  const config = await loadConfig();
  const result = await refreshAutoFetchProviderModels(config, options);
  if (!result.changed) {
    return result;
  }

  const latestConfig = await loadConfig();
  const mergedResult = mergeProviderModelAutoRefreshResult(config, latestConfig, result);
  if (!mergedResult.changed) {
    return mergedResult;
  }

  const savedConfig = await saveConfig(mergedResult.config);
  const savedResult = {
    ...mergedResult,
    config: savedConfig
  };
  await options.onConfigChanged?.(savedConfig, savedResult);
  return savedResult;
}

function mergeProviderModelAutoRefreshResult(
  baseConfig: AppConfig,
  currentConfig: AppConfig,
  result: ProviderModelAutoRefreshResult
): ProviderModelAutoRefreshResult {
  let providers = currentConfig.Providers;
  const providerResults = result.providers.map((item) => ({ ...item }));
  const addedByProvider: Array<{ addedModels: string[]; provider: GatewayProviderConfig }> = [];

  for (const [resultIndex, providerResult] of result.providers.entries()) {
    if (providerResult.error || providerResult.skipped) {
      continue;
    }

    const baseProvider = baseConfig.Providers[providerResult.providerIndex];
    const refreshedProvider = result.config.Providers[providerResult.providerIndex];
    if (!baseProvider || !refreshedProvider) {
      continue;
    }

    const currentProviderIndex = findCurrentRefreshProviderIndex(currentConfig.Providers, baseProvider, providerResult.providerIndex);
    if (currentProviderIndex < 0) {
      continue;
    }

    const currentProvider = currentConfig.Providers[currentProviderIndex];
    if (!canApplyProviderModelRefresh(baseConfig, currentConfig, baseProvider, currentProvider)) {
      continue;
    }

    const fetchedModels = uniqueModelList(providerResult.fetchedModels);
    const knownModels = mergeModelLists(currentProvider.autoFetchKnownModels ?? [], currentProvider.models);
    const hasKnownModelBaseline = Boolean(currentProvider.autoFetchKnownModels?.length);
    const addedModels = hasKnownModelBaseline ? modelsNotIn(knownModels, fetchedModels) : [];
    const mergedModels = mergeModelLists(currentProvider.models, addedModels);
    const nextKnownModels = mergeModelLists(knownModels, fetchedModels);
    providerResults[resultIndex] = {
      ...providerResult,
      addedModels,
      provider: currentProvider.name,
      providerIndex: currentProviderIndex
    };

    const nextProvider = {
      ...currentProvider,
      autoFetchKnownModels: nextKnownModels.length > 0 ? nextKnownModels : undefined,
      modelDisplayNames: mergeProviderModelDisplayNames(currentProvider.modelDisplayNames, refreshedProvider.modelDisplayNames, mergedModels),
      modelMetadata: mergeProviderModelMetadata(currentProvider.modelMetadata, refreshedProvider.modelMetadata, mergedModels),
      models: mergedModels
    };
    if (sameAutoRefreshProviderState(currentProvider, nextProvider)) {
      continue;
    }

    providers = replaceAt(providers, currentProviderIndex, nextProvider);
    if (addedModels.length > 0) {
      addedByProvider.push({ addedModels, provider: nextProvider });
    }
  }

  if (providers === currentConfig.Providers) {
    return {
      ...result,
      changed: false,
      config: currentConfig,
      profileAllowlistsUpdated: 0,
      providers: providerResults
    };
  }

  const configWithProviders = {
    ...currentConfig,
    Providers: providers
  };
  const profileUpdate = profileAllowlistsWithAutoFetchedModels(configWithProviders, addedByProvider);
  return {
    ...result,
    changed: true,
    config: {
      ...configWithProviders,
      profile: {
        ...configWithProviders.profile,
        profiles: profileUpdate.profiles
      }
    },
    profileAllowlistsUpdated: profileUpdate.changedCount,
    providers: providerResults
  };
}

function findCurrentRefreshProviderIndex(
  providers: GatewayProviderConfig[],
  baseProvider: GatewayProviderConfig,
  preferredIndex: number
): number {
  const preferredProvider = providers[preferredIndex];
  if (providerRefreshTargetMatches(baseProvider, preferredProvider)) {
    return preferredIndex;
  }
  return providers.findIndex((provider) => providerRefreshTargetMatches(baseProvider, provider));
}

function canApplyProviderModelRefresh(
  baseConfig: AppConfig,
  currentConfig: AppConfig,
  baseProvider: GatewayProviderConfig,
  currentProvider: GatewayProviderConfig
): boolean {
  if (!currentProvider.autoFetchModels || !isGatewayProviderEnabled(currentProvider)) {
    return false;
  }
  if (!providerRefreshTargetMatches(baseProvider, currentProvider)) {
    return false;
  }
  if (providerApiKeyForModelRefresh(baseProvider) !== providerApiKeyForModelRefresh(currentProvider)) {
    return false;
  }
  if (!sameModelList(providerModelRefreshProtocols(baseProvider), providerModelRefreshProtocols(currentProvider))) {
    return false;
  }
  return JSON.stringify(providerPluginsForModelRefresh(baseConfig, baseProvider)) ===
    JSON.stringify(providerPluginsForModelRefresh(currentConfig, currentProvider));
}

function providerRefreshTargetMatches(
  baseProvider: GatewayProviderConfig,
  currentProvider: GatewayProviderConfig | undefined
): currentProvider is GatewayProviderConfig {
  if (!currentProvider) {
    return false;
  }

  const baseId = baseProvider.id?.trim().toLowerCase();
  const currentId = currentProvider.id?.trim().toLowerCase();
  const identityMatches = baseId && currentId
    ? baseId === currentId
    : baseProvider.name.trim().toLowerCase() === currentProvider.name.trim().toLowerCase();
  return Boolean(identityMatches && sameProviderBaseUrl(baseProvider, currentProvider));
}

function sameProviderBaseUrl(left: GatewayProviderConfig, right: GatewayProviderConfig): boolean {
  const leftBaseUrl = normalizeProviderBaseUrl(providerBaseUrl(left)).toLowerCase();
  const rightBaseUrl = normalizeProviderBaseUrl(providerBaseUrl(right)).toLowerCase();
  return Boolean(leftBaseUrl && rightBaseUrl && leftBaseUrl === rightBaseUrl);
}

function sameAutoRefreshProviderState(left: GatewayProviderConfig, right: GatewayProviderConfig): boolean {
  return sameModelList(left.models, right.models) &&
    sameModelList(left.autoFetchKnownModels, right.autoFetchKnownModels) &&
    JSON.stringify(left.modelDisplayNames ?? {}) === JSON.stringify(right.modelDisplayNames ?? {}) &&
    JSON.stringify(left.modelMetadata ?? {}) === JSON.stringify(right.modelMetadata ?? {});
}

function scheduleProviderModelAutoRefresh(delayMs: number): void {
  if (!autoRefreshEnabled) {
    return;
  }
  if (autoRefreshTimer) {
    clearTimeout(autoRefreshTimer);
  }
  autoRefreshTimer = setTimeout(() => {
    autoRefreshTimer = undefined;
    void runProviderModelAutoRefreshNow().catch((error) => {
      autoRefreshRuntimeOptions.logger?.warn?.(`[providers] Auto model refresh failed: ${formatError(error)}`);
    }).finally(() => {
      if (autoRefreshEnabled) {
        scheduleProviderModelAutoRefresh(providerModelAutoRefreshIntervalMs);
      }
    });
  }, delayMs);
  autoRefreshTimer.unref?.();
}

function providerBaseUrl(provider: GatewayProviderConfig): string {
  return provider.api_base_url || provider.baseUrl || provider.baseurl || "";
}

function providerApiKeyForModelRefresh(provider: GatewayProviderConfig): string {
  const direct = provider.api_key || provider.apiKey || provider.apikey || "";
  if (direct.trim()) {
    return direct.trim();
  }
  return provider.credentials
    ?.filter((credential) => credential.enabled !== false)
    .map(providerCredentialApiKey)
    .find(Boolean) ?? "";
}

function providerCredentialApiKey(credential: ProviderCredentialConfig): string {
  return (credential.api_key || credential.apiKey || credential.apikey || "").trim();
}

function providerModelRefreshProtocols(provider: GatewayProviderConfig): GatewayProviderCapabilityProtocol[] {
  return uniqueProtocols([
    ...(provider.capabilities ?? []).map((capability) => capability.type),
    toGatewayProviderProtocol(provider.type),
    toGatewayProviderProtocol(provider.provider)
  ]);
}

function toGatewayProviderProtocol(value: unknown): GatewayProviderProtocol | undefined {
  return typeof value === "string" && gatewayProviderProtocols.has(value as GatewayProviderProtocol)
    ? value as GatewayProviderProtocol
    : undefined;
}

const gatewayProviderProtocols = new Set<GatewayProviderProtocol>([
  "anthropic_messages",
  "gemini_generate_content",
  "gemini_interactions",
  "openai_chat_completions",
  "openai_responses"
]);

function providerPluginsForModelRefresh(config: AppConfig, provider: GatewayProviderConfig): unknown[] {
  return (config.providerPlugins ?? []).filter((plugin) =>
    providerPluginEnabled(plugin) &&
    localAgentProviderPluginMatches(plugin, provider)
  );
}

function localAgentProviderPluginMatches(plugin: unknown, provider: GatewayProviderConfig): boolean {
  if (!isRecord(plugin)) {
    return false;
  }
  const key = readString(plugin.key)?.toLowerCase() ?? "";
  if (!key.startsWith("ccr-local-agent-")) {
    return false;
  }

  const pluginProviderName = readString(plugin.providerName) || readString(plugin.provider);
  return Boolean(pluginProviderName && providerPluginAliases(provider).has(pluginProviderName.trim().toLowerCase()));
}

function providerPluginEnabled(plugin: unknown): boolean {
  return !isRecord(plugin) || plugin.enabled !== false;
}

function providerPluginAliases(provider: GatewayProviderConfig): Set<string> {
  const aliases = providerAliases(provider);
  const protocols = providerModelRefreshProtocols(provider);
  for (const alias of [...aliases]) {
    for (const protocol of protocols) {
      aliases.add(`${alias}::${protocol}`);
    }
  }
  return aliases;
}

function localProviderModelCatalogSnapshot(provider: GatewayProviderConfig): ProviderModelCatalogSnapshot | undefined {
  if (isLocalCodexProvider(provider)) {
    return readCodexLocalModelCatalog();
  }
  return undefined;
}

function isLocalCodexProvider(provider: GatewayProviderConfig): boolean {
  return providerApiKeyForModelRefresh(provider) === localAgentProviderApiKey &&
    normalizeProviderBaseUrl(providerBaseUrl(provider)) === normalizeProviderBaseUrl(codexDefaultBaseUrl);
}

function mergeProviderModelCatalogSnapshots(
  ...snapshots: Array<ProviderModelCatalogSnapshot | undefined>
): ProviderModelCatalogSnapshot {
  const models = mergeModelLists(...snapshots.map((snapshot) => snapshot?.models ?? []));
  const modelDisplayNames = snapshots.reduce<Record<string, string>>((merged, snapshot) => ({
    ...merged,
    ...(snapshot?.modelDisplayNames ?? {})
  }), {});
  const modelMetadata = snapshots.reduce<Record<string, ProviderModelMetadata>>((merged, snapshot) => ({
    ...merged,
    ...(snapshot?.modelMetadata ?? {})
  }), {});

  return {
    modelDisplayNames: mergeProviderModelDisplayNames(undefined, modelDisplayNames, models),
    modelMetadata: mergeProviderModelMetadata(undefined, modelMetadata, models),
    models
  };
}

function profileAllowlistsWithAutoFetchedModels(
  config: AppConfig,
  addedByProvider: Array<{ addedModels: string[]; provider: GatewayProviderConfig }>
): { changedCount: number; profiles: ProfileConfig[] } {
  const registry = modelRegistryForConfig(config);
  let changedCount = 0;
  const profiles = config.profile.profiles.map((profile) => {
    if (!profile.availableModels?.length) {
      return profile;
    }

    const additions = addedByProvider.flatMap(({ addedModels, provider }) =>
      profileUsesProvider(config, registry, profile, provider)
        ? addedModels.map((model) => `${provider.name}/${model}`)
        : []
    );
    if (additions.length === 0) {
      return profile;
    }

    const availableModels = mergeModelLists(profile.availableModels, additions);
    if (availableModels.length === profile.availableModels.length) {
      return profile;
    }

    changedCount += 1;
    return {
      ...profile,
      availableModels
    };
  });

  return {
    changedCount,
    profiles
  };
}

function profileUsesProvider(
  config: AppConfig,
  registry: ReturnType<typeof modelRegistryForConfig>,
  profile: ProfileConfig,
  provider: GatewayProviderConfig
): boolean {
  const aliases = providerAliases(provider);
  if ([profile.providerId, profile.providerName].some((value) => value && aliases.has(value.trim().toLowerCase()))) {
    return true;
  }

  return profileModelSelectors(profile).some((selector) => {
    const parsed = parseProviderModelSelector(selector);
    if (parsed && aliases.has(parsed.provider.trim().toLowerCase())) {
      return true;
    }

    const resolved = registry.resolve(selector);
    return resolved?.kind === "provider" && providersReferToSameProvider(resolved.provider, provider, config);
  });
}

function profileModelSelectors(profile: ProfileConfig): string[] {
  return uniqueModelList([
    profile.model,
    profile.fableModel,
    profile.opusModel,
    profile.sonnetModel,
    profile.haikuModel,
    profile.smallFastModel,
    ...(profile.availableModels ?? [])
  ].filter((value): value is string => Boolean(value)));
}

function providersReferToSameProvider(
  left: GatewayProviderConfig,
  right: GatewayProviderConfig,
  config: Pick<AppConfig, "Providers">
): boolean {
  const leftIndex = config.Providers.indexOf(left);
  const rightIndex = config.Providers.indexOf(right);
  if (leftIndex >= 0 && rightIndex >= 0) {
    return leftIndex === rightIndex;
  }
  const leftId = left.id?.trim();
  const rightId = right.id?.trim();
  if (leftId && rightId) {
    return leftId.toLowerCase() === rightId.toLowerCase();
  }
  return left.name.trim().toLowerCase() === right.name.trim().toLowerCase() &&
    providerBaseUrl(left).trim().toLowerCase() === providerBaseUrl(right).trim().toLowerCase();
}

function providerAliases(provider: GatewayProviderConfig): Set<string> {
  return new Set(
    [provider.name, provider.id, provider.provider, providerRuntimeId(provider)]
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );
}

function mergeProviderModelDisplayNames(
  current: Record<string, string> | undefined,
  discovered: Record<string, string> | undefined,
  models: string[]
): Record<string, string> | undefined {
  const displayNames: Record<string, string> = {};
  const merged = {
    ...(current ?? {}),
    ...(discovered ?? {})
  };
  for (const model of models) {
    const displayName = merged[model]?.trim();
    if (displayName && displayName !== model) {
      displayNames[model] = displayName;
    }
  }
  return Object.keys(displayNames).length > 0 ? displayNames : undefined;
}

function mergeProviderModelMetadata(
  current: Record<string, ProviderModelMetadata> | undefined,
  discovered: Record<string, ProviderModelMetadata> | undefined,
  models: string[]
): Record<string, ProviderModelMetadata> | undefined {
  const metadataByModel: Record<string, ProviderModelMetadata> = {};
  for (const model of models) {
    const currentMetadata = current?.[model] ?? {};
    const metadata = {
      ...currentMetadata,
      ...(discovered?.[model] ?? {}),
      ...(currentMetadata.contextWindowPinned
        ? {
            contextWindow: currentMetadata.contextWindow,
            contextWindowPinned: true,
            maxContextWindow: currentMetadata.maxContextWindow
          }
        : {})
    };
    if (Object.keys(metadata).length > 0) {
      metadataByModel[model] = metadata;
    }
  }
  return Object.keys(metadataByModel).length > 0 ? metadataByModel : undefined;
}

function modelsNotIn(previous: string[], next: string[]): string[] {
  const previousKeys = new Set(uniqueModelList(previous).map((model) => model.toLowerCase()));
  return uniqueModelList(next).filter((model) => !previousKeys.has(model.toLowerCase()));
}

function sameModelList(left: string[] | undefined, right: string[] | undefined): boolean {
  const normalizedLeft = uniqueModelList(left ?? []);
  const normalizedRight = uniqueModelList(right ?? []);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((model, index) => model.toLowerCase() === normalizedRight[index].toLowerCase());
}

function mergeModelLists(...groups: string[][]): string[] {
  return uniqueModelList(groups.flat());
}

function uniqueModelList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function uniqueProtocols(values: Array<GatewayProviderCapabilityProtocol | undefined>): GatewayProviderCapabilityProtocol[] {
  const seen = new Set<string>();
  const result: GatewayProviderCapabilityProtocol[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function replaceAt<T>(values: T[], index: number, value: T): T[] {
  return values.map((item, itemIndex) => itemIndex === index ? value : item);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
