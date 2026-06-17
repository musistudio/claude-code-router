export type AppInfo = {
  apiKeysDbFile: string;
  configDir: string;
  configFile: string;
  dataDir: string;
  gatewayConfigFile: string;
  requestLogsDbFile: string;
  name: string;
  platform: string;
  usageDbFile: string;
  version: string;
};

export type GatewayProviderProtocol =
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages"
  | "gemini_generate_content";

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
  extraBody?: unknown;
  extraHeaders?: unknown;
  icon?: string;
  models: string[];
  name: string;
  provider?: string;
  transformer?: unknown;
  type?: GatewayProviderProtocol | string;
};

export type ProviderAccountAuthMode = "provider-api-key" | "none";
export type ProviderAccountConnectorSource = "standard" | "http-json" | "plugin" | "local-estimate" | "merged" | "unsupported";
export type ProviderAccountStatus = "ok" | "warning" | "critical" | "error" | "unsupported";
export type ProviderAccountMeterKind = "balance" | "quota" | "time_window" | "tokens" | "requests";
export type ProviderAccountMeterUnit = "USD" | "CNY" | "hours" | "minutes" | "tokens" | "requests" | string;
export type ProviderAccountMeterWindow = "5h" | "daily" | "weekly" | "monthly" | string;

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

export type ProviderAccountMappedMeterConfig = {
  id: string;
  kind?: ProviderAccountMeterKind;
  label: string;
  limit?: number | string;
  remaining?: number | string;
  resetAt?: string;
  unit?: ProviderAccountMeterUnit;
  used?: number | string;
  window?: ProviderAccountMeterWindow;
};

export type ProviderAccountMeter = {
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
  errors?: ProviderAccountConnectorError[];
  message?: string;
  meters: ProviderAccountMeter[];
  nextRefreshAt?: string;
  provider: string;
  source: ProviderAccountConnectorSource;
  status: ProviderAccountStatus;
  updatedAt: string;
};

export type ProviderDeepLinkPayload = {
  apiKey?: string;
  baseUrl: string;
  models: string[];
  name?: string;
  protocol?: GatewayProviderProtocol;
  replaceExisting: boolean;
  setDefault: boolean;
  source?: string;
};

export type ProviderDeepLinkRequest = {
  error?: string;
  id: string;
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

export type GatewayProviderProbeRequest = {
  apiKey?: string;
  baseUrl: string;
  models?: string[];
  protocols?: GatewayProviderProtocol[];
  skipModelDiscovery?: boolean;
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
  endpoint: string;
  message: string;
  protocol: GatewayProviderProtocol;
  status?: number;
  supported: boolean;
};

export type GatewayProviderProbeResult = {
  capabilities?: GatewayProviderCapability[];
  detectedProtocol?: GatewayProviderProtocol;
  modelSource?: "anthropic" | "gemini" | "openai";
  models: string[];
  normalizedBaseUrl: string;
  protocols: GatewayProviderProbeProtocolResult[];
};

export type RouterRuleType =
  | "always"
  | "image"
  | "long-context"
  | "model-prefix"
  | "subagent"
  | "thinking"
  | "web-search";

export type RouterRule = {
  enabled: boolean;
  fallback?: RouterFallbackConfig;
  id: string;
  name: string;
  pattern?: string;
  target?: string;
  threshold?: number;
  type: RouterRuleType;
};

export type RouterFallbackMode = "off" | "retry" | "model-chain";

export type RouterFallbackConfig = {
  mode: RouterFallbackMode;
  models: string[];
  retryCount: number;
};

export type RouterConfig = {
  background?: string;
  default?: string;
  fallback: RouterFallbackConfig;
  image?: string;
  longContext?: string;
  longContextThreshold: number;
  rules: RouterRule[];
  think?: string;
  webSearch?: string;
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
  streamMode: "buffered";
};

export type VirtualModelMaterializationConfig = {
  descriptionTemplate?: string;
  displayNameTemplate?: string;
  enabled: boolean;
  includeInGatewayModels: boolean;
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
};

export type TrayIconPreference = "random" | "violet" | "orange" | "cyan" | "progress";

export const TRAY_WINDOW_MODULE_IDS = [
  "source-tabs",
  "header",
  "account",
  "token-flow",
  "stats",
  "token-mix",
  "rings",
  "model-share",
  "footer"
] as const;

export type TrayWindowModuleId = (typeof TRAY_WINDOW_MODULE_IDS)[number];

export const DEFAULT_TRAY_WINDOW_MODULES: TrayWindowModuleId[] = [...TRAY_WINDOW_MODULE_IDS];

export type ProfileClientKind = "claude-code" | "codex";
export type CodexProfileConfigFormat = "legacy" | "separate_profile_files";
export type CodexRemoteFrontendMode = "app" | "cli" | "claude-code";
export type ProfileScope = "ccr" | "global" | "custom";
export type ProfileSurface = "auto" | "cli" | "app";

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
  remoteFrontendMode: CodexRemoteFrontendMode;
};

export type ProfileConfig = {
  agent: ProfileClientKind;
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
  gateway: GatewayRuntimeConfig;
  preferredProvider: string;
  plugins: GatewayPluginConfig[];
  profile: ProfileRuntimeConfig;
  proxy: ProxyRuntimeConfig;
  providerPlugins?: unknown[];
  routerEndpoint: string;
  theme: "system" | "light" | "dark";
  trayProgressTargetTokens: number;
  trayIcon: TrayIconPreference;
  trayWindowModules: TrayWindowModuleId[];
  virtualModelProfiles?: VirtualModelProfileConfig[];
};

export type GatewayStatus = {
  coreEndpoint: string;
  coreManagedExternally?: boolean;
  endpoint: string;
  generatedConfigFile: string;
  lastError?: string;
  lastStartedAt?: string;
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

export type BuiltInBrowserState = {
  activeTabId?: string;
  apps: InstalledBrowserApp[];
  tabs: BuiltInBrowserTabState[];
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
  model?: string;
  page?: number;
  pageSize?: number;
  provider?: string;
  query?: string;
  status?: RequestLogStatusFilter;
};

export type RequestLogBody = ProxyNetworkBody;

export type RequestLogEntry = {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  client: string;
  completedAt?: string;
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
  requestBody: RequestLogBody;
  requestHeaders: Record<string, string | string[]>;
  requestId: string;
  responseBody?: RequestLogBody;
  responseHeaders: Record<string, string | string[]>;
  statusCode: number;
  totalTokens: number;
  url: string;
};

export type RequestLogFilterOptions = {
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
  includeProxy?: boolean;
  model?: string;
  provider?: string;
};

export type UsageTotals = {
  avgDurationMs: number;
  cacheRatio: number;
  cacheTokens: number;
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

export type AgentKind = "claude-code" | "codex" | "claude-design" | "unknown";

export type AgentAnalysisFilter = {
  agent?: AgentKind | "all";
  range?: UsageStatsRange;
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
  sessions: AgentAnalysisSessionRow[];
  subagents: AgentAnalysisSubagentRow[];
  tools: AgentAnalysisToolRow[];
  totals: AgentAnalysisTotals;
};
