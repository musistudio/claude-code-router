export type AppInfo = {
  appConfigDbFile: string;
  apiKeysDbFile: string;
  configDir: string;
  configFile: string;
  dataDir: string;
  gatewayConfigFile: string;
  launchAtLoginSupported: boolean;
  requestLogsDbFile: string;
  name: string;
  platform: string;
  usageDbFile: string;
  version: string;
};

export type AppDataExportResult = {
  canceled: boolean;
  exportedAt?: string;
  file?: string;
};

export type AppCaptureElementPngRequest = {
  borderRadius?: number;
  exportId?: string;
  fileName: string;
  output?: {
    height: number;
    width: number;
  };
  rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
};

export type AppCaptureElementPngResult = {
  canceled: boolean;
  file?: string;
};

export type AppImageExportTargetRequest = {
  fileName: string;
};

export type AppImageExportTargetResult = {
  canceled: boolean;
  exportId?: string;
  file?: string;
};

export type AppRenderHtmlPngRequest = {
  borderRadius?: number;
  exportId?: string;
  fileName: string;
  html: string;
  output?: {
    height: number;
    width: number;
  };
  size: {
    height: number;
    width: number;
  };
};

export type AppRenderHtmlPngResult = {
  canceled: boolean;
  file?: string;
};

export type AppUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export type AppUpdateDownloadProgress = {
  bytesPerSecond?: number;
  percent?: number;
  total?: number;
  transferred?: number;
};

export type AppUpdateStatus = {
  availableVersion?: string;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  currentVersion: string;
  downloadedAt?: string;
  feedUrl?: string;
  lastCheckedAt?: string;
  lastError?: string;
  progress?: AppUpdateDownloadProgress;
  releaseDate?: string;
  releaseName?: string;
  releaseNotes?: string;
  state: AppUpdateState;
  supported: boolean;
};

export const BUILTIN_FUSION_TOOL_SERVER_NAME = "ccr-fusion-builtins";
export const BUILTIN_FUSION_VISION_TOOL_NAME = "vision_understand";
export const BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME = "web_search";

export type GatewayProviderProtocol =
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages"
  | "gemini_generate_content"
  | "gemini_interactions";

export type GatewayProviderConfig = {
  account?: ProviderAccountConfig;
  api_base_url?: string;
  api_key?: string;
  apiKey?: string;
  apikey?: string;
  baseUrl?: string;
  baseurl?: string;
  billing?: unknown;
  capabilities?: GatewayProviderCapability[];
  credentials?: ProviderCredentialConfig[];
  extraBody?: unknown;
  extraHeaders?: unknown;
  icon?: string;
  id?: string;
  modelDescriptions?: Record<string, string>;
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
  name: string;
  provider?: string;
  transformer?: unknown;
  type?: GatewayProviderProtocol | string;
};

export type ProviderReasoningLevel = {
  description: string;
  effort: string;
};

export type ProviderModelMetadata = {
  additionalSpeedTiers?: unknown[];
  defaultReasoningLevel?: string | null;
  defaultReasoningSummary?: string;
  serviceTiers?: unknown[];
  supportedReasoningLevels?: ProviderReasoningLevel[];
  supportsReasoningSummaries?: boolean;
};

export type ProviderCredentialConfig = {
  account?: ProviderAccountConfig;
  api_key?: string;
  apiKey?: string;
  apikey?: string;
  enabled?: boolean;
  id?: string;
  label?: string;
  name?: string;
  limits?: ApiKeyLimitConfig;
  priority?: number;
  weight?: number;
};

export type ProviderAccountAuthMode = "provider-api-key" | "provider-api-key-raw" | "none";
export type ProviderAccountConnectorSource = "standard" | "http-json" | "plugin" | "local-estimate" | "merged" | "unsupported";
export type ProviderAccountStatus = "ok" | "warning" | "critical" | "error" | "unsupported";
export type ProviderAccountMeterKind = "balance" | "subscription" | "quota" | "time_window" | "tokens" | "requests";
export type ProviderAccountMeterUnit = "USD" | "CNY" | "hours" | "minutes" | "tokens" | "requests" | string;
export type ProviderAccountMeterWindow = "5h" | "daily" | "weekly" | "monthly" | string;
export type ProviderAccountHttpJsonParser = "grok-subscription" | "kimi-code-usages" | "new-api-key-usage" | "new-api-user-self";

export type ProviderAccountConfig = {
  connectors?: ProviderAccountConnectorConfig[];
  enabled?: boolean;
  refreshIntervalMs?: number;
};

export type ProviderAccountConnectorConfig =
  | ProviderAccountStandardConnectorConfig
  | ProviderAccountHttpJsonConnectorConfig
  | ProviderAccountPluginConnectorConfig
  | ProviderAccountLocalEstimateConnectorConfig;

export type ProviderAccountConnectorBaseConfig = {
  id?: string;
  type: ProviderAccountConnectorSource;
};

export type ProviderAccountStandardConnectorConfig = ProviderAccountConnectorBaseConfig & {
  auth?: ProviderAccountAuthMode;
  endpoint?: string;
  endpoints?: string[];
  headers?: Record<string, string>;
  type: "standard";
};

export type ProviderAccountHttpJsonConnectorConfig = ProviderAccountConnectorBaseConfig & {
  auth?: ProviderAccountAuthMode;
  body?: unknown;
  endpoint: string;
  headers?: Record<string, string>;
  mapping: ProviderAccountMappingConfig;
  method?: "GET" | "POST";
  parser?: ProviderAccountHttpJsonParser;
  type: "http-json";
};

export type ProviderAccountPluginConnectorConfig = ProviderAccountConnectorBaseConfig & {
  connectorId: string;
  options?: unknown;
  pluginId: string;
  type: "plugin";
};

export type ProviderAccountLocalEstimateConnectorConfig = ProviderAccountConnectorBaseConfig & {
  type: "local-estimate";
  windows: ProviderAccountLocalWindowConfig[];
};

export type ProviderAccountLocalWindowConfig = {
  id: string;
  label: string;
  limit: number;
  unit: "hours" | "tokens" | "requests";
  window: ProviderAccountMeterWindow;
};

export type ProviderAccountMappingConfig = {
  meters: ProviderAccountMappedMeterConfig[];
  message?: string;
  status?: string;
};

export type ProviderAccountMappedNumberExpression = number | string | Array<number | string>;
export type ProviderAccountMappedStringExpression = string | string[];

export type ProviderAccountMappedMeterConfig = {
  id: string;
  kind?: ProviderAccountMeterKind;
  label: string;
  limit?: ProviderAccountMappedNumberExpression;
  remaining?: ProviderAccountMappedNumberExpression;
  resetAt?: ProviderAccountMappedStringExpression;
  unit?: ProviderAccountMeterUnit;
  used?: ProviderAccountMappedNumberExpression;
  window?: ProviderAccountMeterWindow;
};

export type ProviderAccountMeterDetail = {
  description?: string;
  effectiveAt?: string;
  expiresAt?: string;
  id?: string;
  label?: string;
  redeemable?: boolean;
  status?: string;
};

export type ProviderAccountMeter = {
  details?: ProviderAccountMeterDetail[];
  id: string;
  kind: ProviderAccountMeterKind;
  label: string;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  source?: ProviderAccountConnectorSource;
  unit: ProviderAccountMeterUnit;
  used?: number;
  window?: ProviderAccountMeterWindow;
};

export type ProviderAccountConnectorError = {
  connectorId?: string;
  message: string;
  source: ProviderAccountConnectorSource;
};

export type ProviderAccountSnapshot = {
  credentialId?: string;
  credentialLabel?: string;
  errors?: ProviderAccountConnectorError[];
  message?: string;
  meters: ProviderAccountMeter[];
  nextRefreshAt?: string;
  provider: string;
  source: ProviderAccountConnectorSource;
  status: ProviderAccountStatus;
  updatedAt: string;
};

export type ProviderAccountSnapshotRequestOptions = {
  forceRefresh?: boolean;
};

export type ProviderDeepLinkPayload = {
  account?: ProviderAccountConfig;
  apiKey?: string;
  baseUrl: string;
  icon?: string;
  modelDescriptions?: Record<string, string>;
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
  name?: string;
  protocol?: GatewayProviderProtocol;
  source?: string;
};

export type ProviderManifestDeepLinkPayload = {
  url: string;
};

export type ProviderManifestFetchRequest = {
  url: string;
};

export type ProviderManifestFetchResult = {
  fetchedAt: string;
  provider: ProviderDeepLinkPayload;
  url: string;
};

export type LocalAgentProviderKind = "claude-code" | "codex" | "grok" | "zcode";

export type LocalAgentProviderStatus = "available" | "locked" | "missing";

export type LocalAgentProviderCandidate = {
  detail?: string;
  id: string;
  importable: boolean;
  kind: LocalAgentProviderKind;
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
  name: string;
  protocol: GatewayProviderProtocol;
  sourceFile?: string;
  status: LocalAgentProviderStatus;
};

export type LocalAgentProviderImportRequest = {
  id: string;
  providerNames?: string[];
};

export type LocalAgentProviderImportResult = {
  candidate: LocalAgentProviderCandidate;
  provider: ProviderDeepLinkPayload;
  providerPlugins: unknown[];
};

export type LocalAgentProviderProbeRequest = {
  forceRefresh?: boolean;
  id: string;
};

export type LocalAgentProviderProbeResult = {
  candidate: LocalAgentProviderCandidate;
  probe: GatewayProviderProbeResult;
};

export type ProviderCatalogModelsRequest = {
  baseUrl?: string;
  name?: string;
  providerIds?: string[];
  providerPresetId?: string;
};

export type ProviderCatalogModelsResult = {
  loadedFrom?: string;
  matchedBy?: "base-url" | "provider-id" | "provider-name";
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
  provider?: string;
  providerName?: string;
};

export type ProviderAccountTestRequest = {
  apiKey?: string;
  baseUrl: string;
  connector: ProviderAccountHttpJsonConnectorConfig;
  providerName?: string;
};

export type ProviderAccountTestPath = {
  path: string;
  preview: string;
  type: "array" | "boolean" | "null" | "number" | "object" | "string";
};

export type ProviderAccountTestResult = {
  message?: string;
  meters: ProviderAccountMeter[];
  paths: ProviderAccountTestPath[];
  payload: unknown;
  status?: ProviderAccountStatus;
};

export type ProviderAccountResetRequest = {
  credentialId?: string;
  creditId: string;
  provider: string;
};

export type ProviderAccountResetResult = {
  code?: string;
  creditId: string;
  ok: boolean;
};

export type ProviderDeepLinkRequest = {
  error?: string;
  id: string;
  manifest?: ProviderManifestDeepLinkPayload;
  provider?: ProviderDeepLinkPayload;
  rawUrl: string;
  receivedAt: string;
};

export type GatewayProviderCapability = {
  baseUrl: string;
  endpoint?: string;
  source?: "detected" | "preset";
  type: GatewayProviderProtocol;
};

export type GatewayProviderDetectedProvider = "new-api";

export type GatewayProviderProbeRequest = {
  apiKey?: string;
  baseUrl: string;
  forceRefresh?: boolean;
  mode?: "connectivity" | "models" | "protocols";
  models?: string[];
  protocols?: GatewayProviderProtocol[];
  skipModelDiscovery?: boolean;
};

export type GatewayProviderProbeCandidate = {
  baseUrl: string;
  declaredProtocols?: GatewayProviderProtocol[];
  label?: string;
  protocols: GatewayProviderProtocol[];
  source: "custom" | "preset";
};

export type GatewayProviderProbeCandidatesRequest = {
  apiKey?: string;
  candidates: GatewayProviderProbeCandidate[];
  forceRefresh?: boolean;
  mode?: "connectivity" | "models" | "protocols";
  models?: string[];
  protocols?: GatewayProviderProtocol[];
};

export type ProviderIconDetectionRequest = {
  baseUrl: string;
  force?: boolean;
  sourceUrls?: string[];
};

export type ProviderIconDetectionResult = {
  cachedFile?: string;
  icon?: string;
  sourceUrl?: string;
};

export type GatewayProviderProbeProtocolResult = {
  baseUrl?: string;
  detectedProvider?: GatewayProviderDetectedProvider;
  endpoint: string;
  message: string;
  protocol: GatewayProviderProtocol;
  status?: number;
  supported: boolean;
};

export type GatewayProviderProbeResult = {
  account?: ProviderAccountConfig;
  capabilities?: GatewayProviderCapability[];
  detectedProvider?: GatewayProviderDetectedProvider;
  detectedProtocol?: GatewayProviderProtocol;
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  modelSource?: "anthropic" | "gemini" | "openai";
  models: string[];
  normalizedBaseUrl: string;
  protocols: GatewayProviderProbeProtocolResult[];
};

export type GatewayProviderProbeCandidateResult = {
  candidate: GatewayProviderProbeCandidate;
  probe: GatewayProviderProbeResult;
};

export type GatewayProviderConnectivityCheckModelResult = {
  message: string;
  model: string;
  protocols: GatewayProviderProbeProtocolResult[];
  supported: boolean;
};

export type GatewayProviderConnectivityCheckRequest = {
  apiKey?: string;
  candidates: GatewayProviderProbeCandidate[];
  forceRefresh?: boolean;
  models: string[];
  protocols?: GatewayProviderProtocol[];
};

export type GatewayProviderConnectivityCheckReport = {
  failed: GatewayProviderConnectivityCheckModelResult[];
  passed: GatewayProviderConnectivityCheckModelResult[];
  probe?: GatewayProviderProbeResult;
  results: GatewayProviderConnectivityCheckModelResult[];
};

export type RouterRuleType =
  | "condition"
  | "model-prefix";

export type RouterRuleOperator =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "contains"
  | "contains-deep"
  | "not-contains"
  | "starts-with";

export type RouterRuleCondition = {
  left: string;
  operator: RouterRuleOperator;
  right: string;
};

export type RouterRuleRewriteOperation =
  | "array-append"
  | "array-prepend"
  | "array-remove"
  | "array-replace"
  | "delete"
  | "set";

export type RouterRuleRewrite = {
  key: string;
  match?: string;
  operation?: RouterRuleRewriteOperation;
  value?: string;
};

export type RouterRule = {
  condition?: RouterRuleCondition;
  enabled: boolean;
  fallback?: RouterFallbackConfig;
  id: string;
  name: string;
  pattern?: string;
  rewrite?: RouterRuleRewrite;
  rewrites?: RouterRuleRewrite[];
  target?: string;
  threshold?: number;
  type: RouterRuleType;
};

export type RouterFallbackMode = "off" | "retry" | "model-chain";

export const ROUTER_FALLBACK_MAX_RETRY_COUNT = 9999;

export type RouterFallbackConfig = {
  mode: RouterFallbackMode;
  models: string[];
  retryCount: number;
};

export type RouterBuiltInAgentRuleId = "claude-code" | "codex";

export type RouterBuiltInAgentRuleConfig = {
  enabled: boolean;
};

export type RouterBuiltInRulesConfig = Record<RouterBuiltInAgentRuleId, RouterBuiltInAgentRuleConfig>;

export type RouterConfig = {
  builtInRules: RouterBuiltInRulesConfig;
  fallback: RouterFallbackConfig;
  rules: RouterRule[];
};

export type GatewayRuntimeConfig = {
  coreHost: string;
  corePort: number;
  enabled: boolean;
  generatedConfigFile: string;
  host: string;
  port: number;
};

export type ProxyMode = "gateway" | "transparent";

export type ProxyForwardMode = ProxyMode | "plugin";

export type ProxyUpstreamMode = "none" | "system" | "custom";

export type ProxyUpstreamCustomConfig = {
  password: string;
  port: number;
  server: string;
  username: string;
};

export type ProxyUpstreamConfig = {
  custom: ProxyUpstreamCustomConfig;
  mode: ProxyUpstreamMode;
};

export type ProxyRouteTarget = {
  host: string;
  paths?: string[];
};

export type GatewayPluginProxyRouteConfig = {
  headers?: Record<string, string>;
  host: string;
  id?: string;
  paths?: string[];
  preserveHost?: boolean;
  rewritePathPrefix?: string;
  stripPathPrefix?: boolean | string;
  upstream: string;
};

export type GatewayPluginAppConfig = {
  description?: string;
  icon?: string;
  id?: string;
  name: string;
  url: string;
};

export type GatewayMcpServerTransport = "stdio" | "streamable-http" | "sse";
export type GatewayMcpStdioMessageMode = "content-length" | "newline-json";

export type GatewayMcpServerBaseConfig = {
  name: string;
  protocolVersion: string;
  requestTimeoutMs: number;
  startupTimeoutMs: number;
  transport: GatewayMcpServerTransport;
};

export type GatewayMcpStdioServerConfig = GatewayMcpServerBaseConfig & {
  args: string[];
  command: string;
  cwd?: string;
  env: Record<string, string>;
  stdioMessageMode: GatewayMcpStdioMessageMode;
  transport: "stdio";
};

export type GatewayMcpRemoteServerConfig = GatewayMcpServerBaseConfig & {
  apiKey?: string;
  apiKeyEnv?: string;
  headers: Record<string, string>;
  transport: "streamable-http" | "sse";
  url: string;
};

export type GatewayMcpServerConfig = GatewayMcpStdioServerConfig | GatewayMcpRemoteServerConfig;

export type GatewayAgentConfig = {
  mcpServers: GatewayMcpServerConfig[];
};

export type ToolHubLlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ToolHubConfig = {
  browserAutomation: boolean;
  enabled: boolean;
  llm: ToolHubLlmConfig;
  mcpServers: GatewayMcpServerConfig[];
  maxTools: number;
  requestTimeoutMs: number;
};

export const CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV = "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY";
export const CLAUDE_CODE_DEFAULT_ENV: Record<string, string> = {
  [CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV]: "1"
};

export type GatewayMcpToolInfo = {
  description?: string;
  inputSchema?: Record<string, unknown>;
  name: string;
};

export type VirtualModelMatchConfig = {
  exactAliases: string[];
  prefixes: string[];
  suffixes: string[];
};

export type VirtualModelBaseModelMode = "fixed" | "request" | "strip_prefix" | "strip_suffix";

export type VirtualModelBaseModelConfig = {
  fixedModel?: string;
  mode?: VirtualModelBaseModelMode;
};

export type VirtualModelInstructionsConfig = {
  append?: string;
  prepend?: string;
  replace?: string;
};

export type VirtualModelToolVisibility = "client" | "internal";

export type VirtualModelToolConfig = {
  description?: string;
  inputSchema?: Record<string, unknown>;
  name: string;
  visibility: VirtualModelToolVisibility;
};

export type VirtualModelExecutionMode = "decorate_only" | "tool_loop";

export type VirtualModelExecutionConfig = {
  clientToolsPolicy: "allow" | "deny";
  matchMultimodal?: boolean;
  matchWebSearch?: boolean;
  maxToolCalls: number;
  maxTurns: number;
  mode: VirtualModelExecutionMode;
  streamMode: "buffered" | "optimistic";
};

export type VirtualModelMaterializationConfig = {
  descriptionTemplate?: string;
  displayNameTemplate?: string;
  enabled: boolean;
  includeInGatewayModels: boolean;
};

export type VirtualModelFusionVisionConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  modelSelector?: string;
  timeoutMs?: number;
  toolName?: string;
};

export type VirtualModelFusionWebSearchProvider =
  | "browser"
  | "brave"
  | "bing"
  | "google_cse"
  | "serper"
  | "serpapi"
  | "tavily"
  | "exa";

export type VirtualModelFusionWebSearchConfig = {
  env?: Record<string, string>;
  provider?: VirtualModelFusionWebSearchProvider;
  resultCount?: number;
  timeoutMs?: number;
  toolName?: string;
};

export type VirtualModelFusionCustomToolConfig = {
  env?: Record<string, string>;
  mcpServerName?: string;
};

export type VirtualModelProfileConfig = {
  baseModel?: VirtualModelBaseModelConfig;
  description?: string;
  displayName: string;
  enabled: boolean;
  execution: VirtualModelExecutionConfig;
  id: string;
  instructions?: VirtualModelInstructionsConfig;
  key: string;
  match: VirtualModelMatchConfig;
  materialization: VirtualModelMaterializationConfig;
  metadata?: Record<string, unknown>;
  toolChoice?: unknown;
  tools: VirtualModelToolConfig[];
};

export const NO_AVAILABLE_GATEWAY_MODELS_MESSAGE =
  "No available models. Configure at least one provider with a model before starting CCR Gateway or opening an agent through CCR.";

export function assertAvailableGatewayModels(config: Pick<AppConfig, "Providers" | "virtualModelProfiles">): void {
  if (!hasAvailableGatewayModels(config)) {
    throw new Error(NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
  }
}

export function hasAvailableGatewayModels(config: Pick<AppConfig, "Providers" | "virtualModelProfiles">): boolean {
  return availableGatewayModelIds(config).length > 0;
}

export function availableGatewayModelIds(config: Pick<AppConfig, "Providers" | "virtualModelProfiles">): string[] {
  const baseEntries = availableGatewayBaseModelEntries(config.Providers);
  const ids = baseEntries.map((entry) => `${entry.providerName}/${entry.modelName}`);

  for (const profile of config.virtualModelProfiles ?? []) {
    if (!isGatewayModelVisibleVirtualProfile(profile)) {
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
      if (normalizedAlias && baseEntries.length > 0) {
        ids.push(normalizedAlias.toLowerCase().startsWith("fusion/") ? normalizedAlias : `Fusion/${normalizedAlias}`);
      }
    }
  }

  return uniqueGatewayModelIds(ids);
}

function availableGatewayBaseModelEntries(providers: GatewayProviderConfig[]): Array<{ modelName: string; providerName: string }> {
  return providers.flatMap((provider) => {
    const providerName = provider.name?.trim();
    if (!providerName || !Array.isArray(provider.models)) {
      return [];
    }
    return provider.models.flatMap((rawModel) => {
      const modelName = rawModel.trim();
      return modelName ? [{ modelName, providerName }] : [];
    });
  });
}

function isGatewayModelVisibleVirtualProfile(profile: VirtualModelProfileConfig): boolean {
  return profile.enabled !== false &&
    profile.materialization?.enabled !== false &&
    profile.materialization?.includeInGatewayModels !== false;
}

function uniqueGatewayModelIds(values: string[]): string[] {
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

export type InstalledBrowserApp = GatewayPluginAppConfig & {
  id: string;
  pluginId: string;
};

export type GatewayPluginConfig = {
  apps?: GatewayPluginAppConfig[];
  config?: unknown;
  coreGateway?: {
    config?: Record<string, unknown>;
    providerPlugins?: unknown[];
    virtualModelProfiles?: VirtualModelProfileConfig[];
  };
  enabled?: boolean;
  id: string;
  module?: string;
  proxy?: {
    routes?: GatewayPluginProxyRouteConfig[];
  };
};

export type PluginDependency = {
  id: string;
  modulePath?: string;
  name?: string;
};

export type PluginDirectorySelection = {
  apps?: GatewayPluginAppConfig[];
  dependencies: PluginDependency[];
  directory: string;
  id: string;
  modulePath: string;
  name?: string;
};

export type PluginMarketplaceEntry = {
  apps?: GatewayPluginAppConfig[];
  capabilities: string[];
  dependencies: PluginDependency[];
  description: string;
  id: string;
  modulePath: string;
  name: string;
};

export type ProxyRuntimeConfig = {
  browserMode: boolean;
  captureNetwork: boolean;
  enabled: boolean;
  host: string;
  mode: ProxyMode;
  port: number;
  systemProxy: boolean;
  targets: ProxyRouteTarget[];
  upstream: ProxyUpstreamConfig;
};

export type ObservabilityConfig = {
  agentAnalysis: boolean;
  requestLogs: boolean;
};

export type TrayIconPreference = "random" | "violet" | "orange" | "cyan" | "progress";

export type TrayBalanceProgressConfig = {
  meterId: string;
  provider: string;
};

export type TrayAccountComponentVariant = "bar" | "compact" | "ring" | "arc" | "stacked";
export type TrayFlowComponentVariant = "line" | "area" | "bar" | "sparkline";
export type TrayStatsComponentVariant = "cards" | "compact" | "pills";
export type TrayTokenMixComponentVariant = "bars" | "stacked" | "donut" | "pie";
export type TrayRingsComponentVariant = "rings" | "arcs" | "gauges";
export type TrayModelShareComponentVariant = "bars" | "list" | "donut" | "pie";
export type TrayWidgetVariant =
  | TrayAccountComponentVariant
  | TrayFlowComponentVariant
  | TrayStatsComponentVariant
  | TrayTokenMixComponentVariant
  | TrayRingsComponentVariant
  | TrayModelShareComponentVariant;

export type TrayComponentVariants = {
  account: TrayAccountComponentVariant;
  modelShare: TrayModelShareComponentVariant;
  rings: TrayRingsComponentVariant;
  stats: TrayStatsComponentVariant;
  tokenFlow: TrayFlowComponentVariant;
  tokenMix: TrayTokenMixComponentVariant;
};

export const DEFAULT_TRAY_COMPONENT_VARIANTS: TrayComponentVariants = {
  account: "bar",
  modelShare: "bars",
  rings: "rings",
  stats: "cards",
  tokenFlow: "line",
  tokenMix: "bars"
};

export type OverviewWidgetType =
  | "account-balance"
  | "client-analysis"
  | "metric"
  | "model-distribution"
  | "provider-analysis"
  | "share-fuel-cockpit"
  | "share-model-leaderboard"
  | "share-route-map"
  | "share-spend-receipt"
  | "share-token-calendar"
  | "share-usage-wrapped"
  | "system-status"
  | "token-activity"
  | "token-mix"
  | "usage-trend";

export const OVERVIEW_WIDGET_SIZE_VALUES = [
  "1:1",
  "2:1",
  "3:1",
  "4:1",
  "1:2",
  "2:2",
  "3:2",
  "4:2",
  "1:3",
  "2:3",
  "3:3",
  "4:3",
  "1:4",
  "2:4",
  "3:4",
  "4:4"
] as const;

export type OverviewWidgetSize = typeof OVERVIEW_WIDGET_SIZE_VALUES[number];
export type OverviewWidgetVariant =
  | "area"
  | "bar"
  | "bars"
  | "card"
  | "cards"
  | "compact"
  | "composed"
  | "donut"
  | "heatmap"
  | "line"
  | "arc"
  | "nested-rings"
  | "pie"
  | "ring"
  | "semicircle"
  | "stacked"
  | "table"
  | "timeline";

export type OverviewMetricKind =
  | "avg-latency"
  | "cache-ratio"
  | "cache-tokens"
  | "errors"
  | "estimated-cost"
  | "input-tokens"
  | "output-tokens"
  | "requests"
  | "success-rate"
  | "total-tokens";

export type OverviewWidgetConfig = {
  accountProvider?: string;
  enabled: boolean;
  id: string;
  metric?: OverviewMetricKind;
  size: OverviewWidgetSize;
  type: OverviewWidgetType;
  variant: OverviewWidgetVariant;
};

export const DEFAULT_OVERVIEW_WIDGETS: OverviewWidgetConfig[] = [
  { enabled: true, id: "system-status", size: "4:1", type: "system-status", variant: "timeline" },
  { enabled: true, id: "account-balance", size: "4:2", type: "account-balance", variant: "cards" },
  { enabled: true, id: "metric-requests", metric: "requests", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-input-tokens", metric: "input-tokens", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-output-tokens", metric: "output-tokens", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-cache-tokens", metric: "cache-tokens", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-cache-ratio", metric: "cache-ratio", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-estimated-cost", metric: "estimated-cost", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "usage-trend", size: "3:2", type: "usage-trend", variant: "composed" },
  { enabled: true, id: "token-activity", size: "4:2", type: "token-activity", variant: "heatmap" },
  { enabled: true, id: "token-mix", size: "1:2", type: "token-mix", variant: "bars" },
  { enabled: true, id: "client-analysis", size: "2:2", type: "client-analysis", variant: "table" },
  { enabled: true, id: "provider-analysis", size: "2:2", type: "provider-analysis", variant: "table" }
];

export const TRAY_WINDOW_MODULE_IDS = [
  "source-tabs",
  "header",
  "account",
  "token-flow",
  "activity",
  "stats",
  "token-mix",
  "rings",
  "model-share",
  "footer"
] as const;

export type TrayWindowModuleId = (typeof TRAY_WINDOW_MODULE_IDS)[number];
export type TrayWidgetType = Exclude<TrayWindowModuleId, "footer">;
export const TRAY_SINGLETON_WIDGET_TYPES = ["source-tabs", "header"] as const satisfies readonly TrayWidgetType[];
export const TRAY_TOP_WIDGET_TYPES = ["source-tabs", "header"] as const satisfies readonly TrayWidgetType[];

export type TrayWidgetConfig = {
  id: string;
  type: TrayWidgetType;
  variant?: TrayWidgetVariant;
};

export const DEFAULT_TRAY_WINDOW_MODULES: TrayWindowModuleId[] = [...TRAY_WINDOW_MODULE_IDS];
export const DEFAULT_TRAY_WIDGETS: TrayWidgetConfig[] = [
  { id: "source-tabs", type: "source-tabs" },
  { id: "header", type: "header" },
  { id: "account", type: "account", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.account },
  { id: "token-flow", type: "token-flow", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow },
  { id: "activity", type: "activity" },
  { id: "stats", type: "stats", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.stats },
  { id: "token-mix", type: "token-mix", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix },
  { id: "rings", type: "rings", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.rings },
  { id: "model-share", type: "model-share", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare }
];

export type ProfileClientKind = "claude-code" | "codex" | "zcode";
export type CodexProfileConfigFormat = "legacy" | "separate_profile_files";
export type CodexRemoteFrontendMode = "app" | "cli" | "claude-code";
export type ProfileScope = "ccr" | "global" | "custom";
export type ProfileSurface = "auto" | "cli" | "app";
export type ProfileOpenSurface = "cli" | "app";

export type ClaudeCodeProfileConfig = {
  enabled: boolean;
  model: string;
  settingsFile: string;
  smallFastModel: string;
};

export type CodexProfileConfig = {
  cliMiddleware: boolean;
  codexCliPath: string;
  codexHome: string;
  configFormat: CodexProfileConfigFormat;
  configFile: string;
  enabled: boolean;
  model: string;
  providerId: string;
  providerName: string;
  remoteFrontendMode?: CodexRemoteFrontendMode;
  showAllSessions: boolean;
};

export type ProfileConfig = {
  agent: ProfileClientKind;
  appPath?: string;
  botConfigId?: string;
  botGateway?: BotGatewayRuntimeConfig;
  configFile?: string;
  cliMiddleware?: boolean;
  codexCliPath?: string;
  codexHome?: string;
  configFormat?: CodexProfileConfigFormat;
  enabled: boolean;
  env?: Record<string, string>;
  id: string;
  model: string;
  name: string;
  providerId?: string;
  providerName?: string;
  remoteFrontendMode?: CodexRemoteFrontendMode;
  scope?: ProfileScope;
  showAllSessions?: boolean;
  settingsFile?: string;
  smallFastModel?: string;
  surface?: ProfileSurface;
};

export type ProfileRuntimeConfig = {
  claudeCode: ClaudeCodeProfileConfig;
  codex: CodexProfileConfig;
  enabled: boolean;
  profiles: ProfileConfig[];
};

export function normalizeProfileScopeValue(value: unknown): ProfileScope {
  return value === "ccr" || value === "custom" ? value : "global";
}

export function isEnabledGlobalProfile(profile: Pick<ProfileConfig, "enabled" | "scope">): boolean {
  return profile.enabled && normalizeProfileScopeValue(profile.scope) === "global";
}

export function enforceSingleEnabledGlobalProfilePerAgent(
  profiles: ProfileConfig[],
  preferredIndex?: number
): ProfileConfig[] {
  const activeGlobalProfileByAgent = new Map<ProfileClientKind, number>();
  const preferredProfileIndex = typeof preferredIndex === "number" ? preferredIndex : undefined;
  const preferredProfile = preferredProfileIndex !== undefined ? profiles[preferredProfileIndex] : undefined;
  if (preferredProfileIndex !== undefined && preferredProfile && isEnabledGlobalProfile(preferredProfile)) {
    activeGlobalProfileByAgent.set(preferredProfile.agent, preferredProfileIndex);
  }

  return profiles.map((profile, index) => {
    if (!isEnabledGlobalProfile(profile)) {
      return profile;
    }
    const activeIndex = activeGlobalProfileByAgent.get(profile.agent);
    if (activeIndex === undefined) {
      activeGlobalProfileByAgent.set(profile.agent, index);
      return profile;
    }
    return activeIndex === index ? profile : { ...profile, enabled: false };
  });
}

export type ProfileClientApplyStatus = {
  appliedAt?: string;
  backupFile?: string;
  client: ProfileClientKind;
  enabled: boolean;
  message: string;
  ok: boolean;
  path: string;
};

export type ProfileApplyResult = {
  appliedAt: string;
  clients: ProfileClientApplyStatus[];
  enabled: boolean;
};

export type ProfileOpenRequest = {
  profileId: string;
  surface: ProfileOpenSurface;
};

export type ProfileOpenCommandResult = {
  command: string;
  profileId: string;
  profileName: string;
  surface: ProfileOpenSurface;
};

export type ProfileOpenResult = {
  message: string;
  profileId: string;
  profileName: string;
  surface: ProfileOpenSurface;
};

export type ProfileRuntimeEntry = {
  agent: AgentKind;
  pid?: number;
  profileId: string;
  profileName: string;
  startedAt: string;
  state: "running";
  surface: ProfileOpenSurface;
};

export type ProfileRuntimeStatus = {
  profiles: ProfileRuntimeEntry[];
};

export type ProfileStopResult = {
  message: string;
  profileId: string;
  profileName: string;
  stopped: boolean;
  surface: ProfileOpenSurface;
};

export type ApiKeyLimitConfig = {
  ipd?: number;
  iph?: number;
  ipm?: number;
  maxRequests?: number;
  maxTokens?: number;
  quotaWindowMs?: number;
  rpd?: number;
  rph?: number;
  rpm?: number;
  tpd?: number;
  tph?: number;
  tpm?: number;
  windowMs?: number;
};

export type ApiKeyConfig = {
  createdAt: string;
  expiresAt?: string;
  id: string;
  key: string;
  limits?: ApiKeyLimitConfig;
  name?: string;
};

export type ProxySystemStatus = {
  lastError?: string;
  state: "active" | "error" | "inactive" | "restored" | "unsupported";
  upstream?: string;
};

export type ProxyCertificateTrustState = "missing" | "trusted" | "unknown" | "unsupported" | "untrusted";

export type ProxyCertificateStatus = {
  caCertFile: string;
  caFingerprintSha256?: string;
  canInstall: boolean;
  message: string;
  platform: string;
  state: ProxyCertificateTrustState;
  trusted: boolean;
};

export type BotGatewayHandoffConfig = {
  enabled: boolean;
  idleSeconds: number;
  phoneBluetoothTargets: string[];
  phoneWifiTargets: string[];
  screenLock: boolean;
  userIdle: boolean;
};

export type BotHandoffScanTarget = {
  detail: string;
  id: string;
  label: string;
  source: "bluetooth" | "selected" | "wifi" | string;
  target: string;
};

export type BotGatewayConversationConfig = {
  gatewayConversationId?: string;
  platformConversationId?: string;
  threadId?: string;
  type: "dm" | "group" | "channel" | "thread";
};

export type BotGatewayRuntimeConfig = {
  acknowledgeEvents: boolean;
  args: string[];
  authType: string;
  autoStartIntegration: boolean;
  command: string;
  conversationRef?: BotGatewayConversationConfig;
  createIntegration: boolean;
  credentials: Record<string, unknown>;
  cwd: string;
  enabled: boolean;
  forwardAllAgentMessages: boolean;
  handoff: BotGatewayHandoffConfig;
  integrationConfig: Record<string, unknown>;
  integrationId: string;
  platform: string;
  pollIntervalMs: number;
  requestTimeoutMs: number;
  sourceDir: string;
  startupTimeoutMs: number;
  stateDir: string;
  tenantId: string;
};

export type BotGatewaySavedConfig = {
  botGateway: BotGatewayRuntimeConfig;
  id: string;
  name: string;
  updatedAt?: string;
};

export type BotGatewayQrLoginStartRequest = {
  config: BotGatewaySavedConfig;
  force?: boolean;
};

export type BotGatewayQrLoginStartResult = {
  botConfigId: string;
  expiresAt: string;
  integrationId: string;
  message: string;
  platform: string;
  qrCodeUrl: string;
  sessionId: string;
  stateDir: string;
  tenantId: string;
};

export type BotGatewayQrLoginWaitRequest = {
  sessionId: string;
  timeoutMs?: number;
  verifyCode?: string;
};

export type BotGatewayQrLoginWaitResult = {
  confirmed: boolean;
  integrationId: string;
  message: string;
  sessionId: string;
  stateDir: string;
  status: string;
  tenantId: string;
};

export type BotGatewayQrLoginCancelRequest = {
  sessionId: string;
};

export type BotGatewayQrLoginCancelResult = {
  canceled: boolean;
};

export type BotGatewayQrWindowOpenRequest = {
  scanTimeoutMs?: number;
  sessionId: string;
  title?: string;
  url: string;
  waitForScan?: boolean;
};

export type BotGatewayQrWindowOpenResult = {
  message?: string;
  observed?: boolean;
  opened: boolean;
  reason?: "closed" | "error" | "scan_detected" | "timeout";
};

export type BotGatewayQrWindowCloseRequest = {
  sessionId: string;
};

export type BotGatewayQrWindowCloseResult = {
  closed: boolean;
};

export type AppConfig = {
  APIKEY: string;
  APIKEYS: ApiKeyConfig[];
  API_TIMEOUT_MS: number | string;
  CUSTOM_ROUTER_PATH: string;
  HOST: string;
  PORT: number;
  Providers: GatewayProviderConfig[];
  Router: RouterConfig;
  agent: GatewayAgentConfig;
  autoStart: boolean;
  botConfigs: BotGatewaySavedConfig[];
  botGateway: BotGatewayRuntimeConfig;
  gateway: GatewayRuntimeConfig;
  launchAtLogin: boolean;
  observability: ObservabilityConfig;
  preferredProvider: string;
  plugins: GatewayPluginConfig[];
  profile: ProfileRuntimeConfig;
  proxy: ProxyRuntimeConfig;
  providerPlugins?: unknown[];
  overviewWidgets: OverviewWidgetConfig[];
  routerEndpoint: string;
  theme: "system" | "light" | "dark";
  trayBalanceProgress?: TrayBalanceProgressConfig;
  trayProgressTargetTokens: number;
  trayComponentVariants: TrayComponentVariants;
  trayIcon: TrayIconPreference;
  trayWidgets: TrayWidgetConfig[];
  trayWindowModules: TrayWindowModuleId[];
  toolHub: ToolHubConfig;
  virtualModelProfiles?: VirtualModelProfileConfig[];
};

export type AppSaveConfigOptions = {
  applyProfile?: boolean;
};

export type ClaudeAppGatewayApplyResult = {
  apiKeyGenerated: boolean;
  configFile: string;
  configLibraryFile: string;
  dataDir: string;
  endpoint: string;
  message: string;
  model: string;
  requiresRestart: boolean;
};

export type GatewayNetworkEndpoint = {
  address: string;
  interfaceName: string;
  endpoint: string;
};

export type GatewayStatus = {
  coreEndpoint: string;
  coreManagedExternally?: boolean;
  endpoint: string;
  generatedConfigFile: string;
  lastError?: string;
  lastStartedAt?: string;
  networkEndpoints: GatewayNetworkEndpoint[];
  pid?: number;
  state: "stopped" | "starting" | "running" | "error";
};

export type ProxyStatus = {
  caCertFile: string;
  endpoint: string;
  lastError?: string;
  lastStartedAt?: string;
  mode: ProxyMode;
  port: number;
  state: "stopped" | "starting" | "running" | "error";
  systemProxy: ProxySystemStatus;
  targetHosts: string[];
};

export type BuiltInBrowserTabState = {
  canGoBack: boolean;
  canGoForward: boolean;
  id: string;
  isLoading: boolean;
  title: string;
  url: string;
};

export type BuiltInBrowserAutomationHandoffKind =
  | "blocked"
  | "human_verification"
  | "login_required"
  | "other"
  | "verification_code";

export type BuiltInBrowserAutomationHandoff = {
  id: string;
  kind: BuiltInBrowserAutomationHandoffKind;
  message: string;
  reason?: string;
  requestedAt: number;
  sessionId?: string;
  status: "pending";
  tabId?: string;
};

export type BuiltInBrowserState = {
  activeTabId?: string;
  apps: InstalledBrowserApp[];
  automationHandoff?: BuiltInBrowserAutomationHandoff;
  tabs: BuiltInBrowserTabState[];
};

export type ChromeLoginImportTarget = "browser" | "browser-and-web-search";

export type ChromeLoginImportStatus =
  | "completed"
  | "expired"
  | "failed"
  | "pending";

export type ChromeLoginImportRequest = {
  domains: string[];
  openConfirmationPage?: boolean;
  target?: ChromeLoginImportTarget;
};

export type ChromeLoginImportResult = {
  completedAt: number;
  cookieImported: number;
  cookieSkipped: number;
  domains: string[];
  errors?: string[];
  imported: number;
  localStorageImported: number;
  localStorageSkipped: number;
  partitions: string[];
  skipped: number;
};

export type ChromeLoginImportJob = {
  confirmUrl: string;
  createdAt: number;
  domains: string[];
  endpointUrl: string;
  expiresAt: number;
  id: string;
  importUrl: string;
  result?: ChromeLoginImportResult;
  status: ChromeLoginImportStatus;
  target: ChromeLoginImportTarget;
};

export type ChromeLoginImportCookie = {
  domain: string;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  name: string;
  partitionKey?: unknown;
  path?: string;
  sameSite?: "lax" | "no_restriction" | "strict" | "unspecified";
  secure?: boolean;
  session?: boolean;
  storeId?: string;
  value: string;
};

export type ChromeLoginImportLocalStorage = {
  items: Record<string, string>;
  origin: string;
};

export type ProxyCertificateInstallResult = {
  caCertFile: string;
  manualCommand?: string;
  message: string;
  ok: boolean;
  status: ProxyCertificateStatus;
};

export type ProxyNetworkCaptureState = "complete" | "error" | "pending";

export type ProxyNetworkBody = {
  contentType?: string;
  decodedFrom?: string;
  encoding: "base64" | "utf8";
  error?: string;
  sizeBytes: number;
  text: string;
  truncated: boolean;
};

export type ProxyNetworkExchange = {
  client: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  host: string;
  id: string;
  method: string;
  mode: ProxyForwardMode;
  path: string;
  protocol: "http" | "https";
  requestBody: ProxyNetworkBody;
  requestHeaders: Record<string, string | string[]>;
  responseBody?: ProxyNetworkBody;
  responseHeaders?: Record<string, string | string[]>;
  routedToGateway: boolean;
  startedAt: string;
  state: ProxyNetworkCaptureState;
  statusCode?: number;
  upstreamUrl: string;
  url: string;
};

export type ProxyNetworkSnapshot = {
  capturedAt: string;
  captureEnabled: boolean;
  items: ProxyNetworkExchange[];
  maxBodyBytes: number;
  maxEntries: number;
};

export type RequestLogStatusFilter = "all" | "error" | "success";

export type RequestLogListFilter = {
  credential?: string;
  model?: string;
  page?: number;
  pageSize?: number;
  provider?: string;
  query?: string;
  status?: RequestLogStatusFilter;
};

export type RequestLogDetailRequest = {
  id: number;
};

export type RequestLogBody = ProxyNetworkBody;

export type RequestLogRetryAttempt = {
  attempt: number;
  delayMs: number;
  final: boolean;
  status?: string;
};

export type RequestLogEntry = {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  client: string;
  completedAt?: string;
  costUsd?: number;
  createdAt: string;
  credentialChain: string[];
  credentialId?: string;
  credentialSaturated: boolean;
  durationMs: number;
  error?: string;
  id: number;
  inputTokens: number;
  isStream: boolean;
  method: string;
  model: string;
  ok: boolean;
  outputTokens: number;
  path: string;
  provider: string;
  reasoningTokens: number;
  requestBody: RequestLogBody;
  requestHeaders: Record<string, string | string[]>;
  requestId: string;
  retryAttempts: RequestLogRetryAttempt[];
  responseBody?: RequestLogBody;
  responseHeaders: Record<string, string | string[]>;
  statusCode: number;
  totalTokens: number;
  url: string;
};

export type RequestLogFilterOptions = {
  credentials: string[];
  models: string[];
  providers: string[];
};

export type RequestLogPage = {
  generatedAt: string;
  items: RequestLogEntry[];
  options: RequestLogFilterOptions;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type UsageStatsRange = "today" | "24h" | "7d" | "30d";

export type UsageStatsFilter = {
  credential?: string;
  includeProxy?: boolean;
  model?: string;
  provider?: string;
};

export type UsageTotals = {
  avgDurationMs: number;
  cacheRatio: number;
  cacheTokens: number;
  costUsd: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  successRate: number;
  totalTokens: number;
};

export type UsageSeriesPoint = UsageTotals & {
  bucket: string;
  label: string;
};

export type UsageComparisonRow = UsageTotals & {
  caption: string;
  client?: string;
  credentialId?: string;
  key: string;
  label: string;
  maxShare: number;
  model?: string;
  provider?: string;
};

export type UsageStatsSnapshot = {
  clientModels: UsageComparisonRow[];
  generatedAt: string;
  models: UsageComparisonRow[];
  providerModels: UsageComparisonRow[];
  range: UsageStatsRange;
  recentRequests: UsageComparisonRow[];
  series: UsageSeriesPoint[];
  totals: UsageTotals;
};

export type AgentKind = "claude-code" | "codex" | "zcode" | "claude-design" | "unknown";

export type AgentAnalysisFilter = {
  agent?: AgentKind | "all";
  range?: UsageStatsRange;
  sessionAgent?: AgentKind;
  sessionId?: string;
};

export type AgentAnalysisTotals = UsageTotals & {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  errorCount: number;
  maxConcurrentRequests: number;
  maxDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  sessionCount: number;
  subagentCallCount: number;
  toolCallCount: number;
};

export type AgentAnalysisAgentRow = AgentAnalysisTotals & {
  agent: AgentKind;
  key: AgentKind;
  label: string;
  maxShare: number;
};

export type AgentAnalysisConcurrencyPoint = {
  bucket: string;
  label: string;
  maxConcurrentRequests: number;
  requestCount: number;
};

export type AgentAnalysisRequestRow = {
  agent: AgentKind;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  client: string;
  concurrentRequests: number;
  costUsd?: number;
  createdAt: string;
  durationMs: number;
  error?: string;
  id: number;
  inputTokens: number;
  method: string;
  model: string;
  ok: boolean;
  outputTokens: number;
  path: string;
  provider: string;
  requestId: string;
  routeReason?: string;
  sessionId: string;
  statusCode: number;
  subagentModel?: string;
  toolCallCount: number;
  tools: string[];
  totalTokens: number;
  userAgent?: string;
};

export type AgentAnalysisSessionRow = AgentAnalysisTotals & {
  agent: AgentKind;
  client: string;
  durationMs: number;
  id: string;
  lastRequestId?: string;
  lastSeenAt: string;
  models: string[];
  providers: string[];
  startedAt: string;
  topTools: Array<{ count: number; name: string }>;
  userAgent?: string;
};

export type AgentAnalysisSessionSelection = {
  agent: AgentKind;
  id: string;
};

export type AgentAnalysisSessionModelRow = AgentAnalysisTotals & {
  key: string;
  lastSeenAt: string;
  model: string;
  provider: string;
};

export type AgentAnalysisToolRow = {
  agents: AgentKind[];
  count: number;
  lastSeenAt: string;
  name: string;
  requestCount: number;
  sessions: number;
};

export type AgentAnalysisSubagentRow = {
  agent: AgentKind;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  count: number;
  lastSeenAt: string;
  model: string;
  provider: string;
  sessionId: string;
  totalTokens: number;
};

export type AgentAnalysisTraceRunKind = "agent" | "llm" | "route" | "subagent" | "tool";

export type AgentAnalysisTraceRunStatus = "error" | "success";

export type AgentAnalysisTracePayloadPreview = {
  kind: "empty" | "json" | "text";
  preview: string;
  sizeBytes: number;
  truncated: boolean;
};

export type AgentAnalysisTracePayloadPart = "tool-input" | "tool-result";

export type AgentAnalysisTracePayloadRequest = {
  callId?: string;
  part: AgentAnalysisTracePayloadPart;
  requestLogId: number;
};

export type AgentAnalysisTracePayloadFullResult = {
  content: string;
  found: boolean;
  kind: "empty" | "json" | "text";
  sizeBytes: number;
  sourceTruncated: boolean;
};

export type AgentAnalysisTraceToolDetail = {
  callId?: string;
  input?: AgentAnalysisTracePayloadPreview;
  result?: AgentAnalysisTracePayloadPreview;
  resultRequestId?: string;
  resultRequestLogId?: number;
};

export type AgentAnalysisTraceRun = {
  agent: AgentKind;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  concurrentRequests: number;
  depth: number;
  durationMs: number;
  endedAt: string;
  error?: string;
  id: string;
  inputTokens: number;
  kind: AgentAnalysisTraceRunKind;
  model?: string;
  name: string;
  offsetMs: number;
  outputTokens: number;
  parentId?: string;
  path?: string;
  provider?: string;
  requestId?: string;
  requestLogId?: number;
  routeReason?: string;
  sessionId: string;
  startedAt: string;
  status: AgentAnalysisTraceRunStatus;
  statusCode?: number;
  tool?: AgentAnalysisTraceToolDetail;
  toolName?: string;
  totalTokens: number;
};

export type AgentAnalysisTrace = {
  agent: AgentKind;
  durationMs: number;
  endedAt: string;
  errorCount: number;
  id: string;
  llmRunCount: number;
  maxDepth: number;
  rootRunId: string;
  runCount: number;
  runs: AgentAnalysisTraceRun[];
  sessionId: string;
  startedAt: string;
  subagentRunCount: number;
  toolRunCount: number;
};

export type AgentObservabilityClientRow = AgentAnalysisTotals & {
  agent: AgentKind;
  key: string;
  label: string;
  lastSeenAt: string;
  userAgent?: string;
};

export type AgentObservabilityEndpointRow = AgentAnalysisTotals & {
  agent: AgentKind;
  key: string;
  lastSeenAt: string;
  method: string;
  model: string;
  path: string;
  provider: string;
  statusCodes: Array<{ count: number; statusCode: number }>;
};

export type AgentObservabilityRouteRow = {
  agent: AgentKind;
  cacheRatio: number;
  errorCount: number;
  key: string;
  lastSeenAt: string;
  model: string;
  p95DurationMs: number;
  provider: string;
  requestCount: number;
  routeReason: string;
  successRate: number;
  totalTokens: number;
};

export type AgentObservabilityErrorRow = {
  agent: AgentKind;
  client: string;
  createdAt: string;
  durationMs: number;
  error?: string;
  id: number;
  method: string;
  model: string;
  path: string;
  provider: string;
  requestId: string;
  routeReason?: string;
  sessionId: string;
  statusCode: number;
  userAgent?: string;
};

export type AgentAnalysisSessionDetail = {
  endpoints: AgentObservabilityEndpointRow[];
  errors: AgentObservabilityErrorRow[];
  models: AgentAnalysisSessionModelRow[];
  requests: AgentAnalysisRequestRow[];
  routes: AgentObservabilityRouteRow[];
  session: AgentAnalysisSessionRow;
  statusCodes: Array<{ count: number; statusCode: number }>;
  subagents: AgentAnalysisSubagentRow[];
  tools: AgentAnalysisToolRow[];
  totals: AgentAnalysisTotals;
  trace: AgentAnalysisTrace;
};

export type AgentAnalysisSnapshot = {
  agents: AgentAnalysisAgentRow[];
  clients: AgentObservabilityClientRow[];
  concurrency: AgentAnalysisConcurrencyPoint[];
  endpoints: AgentObservabilityEndpointRow[];
  errors: AgentObservabilityErrorRow[];
  generatedAt: string;
  range: UsageStatsRange;
  recentRequests: AgentAnalysisRequestRow[];
  routes: AgentObservabilityRouteRow[];
  scannedRequestCount: number;
  selectedSession?: AgentAnalysisSessionDetail;
  sessions: AgentAnalysisSessionRow[];
  subagents: AgentAnalysisSubagentRow[];
  tools: AgentAnalysisToolRow[];
  totals: AgentAnalysisTotals;
};
