import {
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  type CollisionDetection
} from "@dnd-kit/core";
import {
  type LucideIcon
} from "lucide-react";
import type {
  ApiKeyConfig,
  ApiKeyLimitConfig,
  GatewayProviderCapability,
  GatewayPluginPermission,
  GatewayPluginSurfacesConfig,
  GatewayProviderConnectivityCheckModelResult,
  GatewayProviderConnectivityCheckReport,
  GatewayProviderProbeCandidate,
  GatewayProviderProbeCandidateResult,
  GatewayProviderProtocol,
  GatewayMcpServerTransport,
  GatewayMcpStdioMessageMode,
  PluginDependency,
  PluginMarketplaceEntry,
  ProviderAccountBrowserCredentialsMode,
  ProviderModelMetadata,
  ProfileConfig,
  ProfileScope,
  ProfileSurface,
  RouterFallbackConfig,
  RouterRule,
  RouterRuleOperator,
  RouterRuleRewriteOperation,
  RouterRuleType,
  TrayComponentVariants,
  TrayWindowModuleId,
  VirtualModelBaseModelMode,
  VirtualModelExecutionMode,
  VirtualModelFusionWebSearchProvider,
  VirtualModelToolVisibility
} from "@ccr/core/contracts/app";
import {
  createEmptyAgentAnalysis,
  createEmptyRequestLogPage,
  createEmptyUsageStats
} from "./usage";
import type { RouterConditionSource } from "./options";

export type ViewId = "onboarding" | "overview" | "observability" | "api-keys" | "server" | "profile" | "networking" | "logs" | "providers" | "models" | "routing" | "virtual-models" | "extensions";
export type NavigationId = ViewId;
export type OnboardingStepId = "provider" | "profile" | "enter";
export type AppLanguagePreference = "system" | "en" | "zh";
export type ResolvedLanguage = "en" | "zh";
export type ResolvedTheme = "light" | "dark";
export type SettingsPageId = "general" | "appearance" | "toolhub" | "observability" | "bots" | "tray";
export type TrayEditableModuleId = Exclude<TrayWindowModuleId, "footer">;
export type TrayComponentOptionGroup = {
  key: keyof TrayComponentVariants;
  label: string;
  options: Array<{ label: string; value: string }>;
};
export type TrayModuleOption = {
  icon: LucideIcon;
  label: string;
  styleKey?: keyof TrayComponentVariants;
  value: TrayEditableModuleId;
};

export const overviewWidgetCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const pointerCollision = getFirstCollision(pointerCollisions, "id");
  if (pointerCollision) {
    return pointerCollisions;
  }

  const rectCollisions = rectIntersection(args);
  const rectCollision = getFirstCollision(rectCollisions, "id");
  if (rectCollision) {
    return rectCollisions;
  }

  return closestCenter(args);
};

export const fallbackAgentAnalysis = createEmptyAgentAnalysis("7d");
export const fallbackUsageStats = createEmptyUsageStats("7d");
export const fallbackRequestLogPage = createEmptyRequestLogPage();

export type AddProviderDraft = {
  accountConnectorsText: string;
  accountEnabled: boolean;
  accountMode: ProviderAccountDraftMode;
  accountRefreshIntervalMs: string;
  apiKey: string;
  autoFetchModels: boolean;
  autoFetchKnownModels: string[];
  baseUrl: string;
  capabilities: GatewayProviderCapability[];
  catalogModelMetadata?: Record<string, ProviderModelMetadata>;
  credentialMode: "apiKey" | "pool";
  credentials: ProviderCredentialDraft[];
  extraBodyText: string;
  extraHeadersText: string;
  icon: string;
  modelDescriptions?: Record<string, string>;
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  modelSearch: string;
  modelsText: string;
  name: string;
  presetId: string;
  protocolDetectionMode: "auto" | "manual";
  providerPlugins: unknown[];
  protocol: GatewayProviderProtocol;
  selectedModels: string[];
  selectedProtocols: GatewayProviderProtocol[];
  usageBalanceLimitPath: string;
  usageBalanceRemainingPath: string;
  usageBalanceUnit: string;
  usageBalanceUsedPath: string;
  usageBrowserCredentials: ProviderAccountBrowserCredentialsMode;
  usageBrowserHeaderTemplates: KeyValueDraftRow[];
  usageBrowserLoginUrl: string;
  usageBrowserRequestOrigin: string;
  usageBrowserTimeoutMs: string;
  usageMessagePath: string;
  usageRequestBodyText: string;
  usageRequestHeaders: KeyValueDraftRow[];
  usageRequestMethod: "GET" | "POST";
  usageRequestUrl: string;
  usageStatusPath: string;
  usageSubscriptionLimitPath: string;
  usageSubscriptionRemainingPath: string;
  usageSubscriptionResetPath: string;
  usageSubscriptionUnit: string;
};

export type ProviderCredentialDraft = {
  apiKey: string;
  enabled: boolean;
  id: string;
  limitsText: string;
  name: string;
  priority: string;
  weight: string;
};

export type ProviderAccountDraftMode = "standard" | "http-json" | "browser" | "raw";
export type ProviderUsageFieldTarget =
  | "balance"
  | "balanceLimit"
  | "balanceUsed"
  | "message"
  | "status"
  | "subscriptionLimit"
  | "subscriptionRemaining"
  | "subscriptionReset";

export type ProviderProbeCandidate = GatewayProviderProbeCandidate;
export type ProviderProbeCandidateResult = GatewayProviderProbeCandidateResult;
export type ProviderConnectivityCheckModelResult = GatewayProviderConnectivityCheckModelResult;
export type ProviderConnectivityCheckReport = GatewayProviderConnectivityCheckReport;

export type AddApiKeyDraft = {
  expirationPreset: ApiKeyExpirationPreset;
  expiresAt: string;
  limitRows: ApiKeyLimitDraftRow[];
  name: string;
};

export type AddProfileDraft = {
  agent: ProfileConfig["agent"];
  appPath: string;
  availableModels: string[];
  botConfigId: string;
  botAuthFields: Record<string, string>;
  botAuthType: string;
  botConfigured: boolean;
  botEnabled: boolean;
  botForwardAllAgentMessages: boolean;
  botHandoffEnabled: boolean;
  botHandoffIdleSeconds: string;
  botHandoffPhoneBluetoothTargets: string;
  botHandoffPhoneWifiTargets: string;
  botPlatform: string;
  configFile: string;
  envRows: KeyValueDraftRow[];
  fableModel: string;
  haikuModel: string;
  managedCompact: boolean;
  model: string;
  name: string;
  opusModel: string;
  providerId: string;
  providerName: string;
  routingEnabled: boolean;
  routingEnhancedRoute: boolean;
  routingRules: RouterRule[];
  scope: ProfileScope;
  settingsFile: string;
  showAllSessions: boolean;
  sonnetModel: string;
  smallFastModel: string;
  surface: ProfileSurface;
};

export type BotGatewayConfigDraft = {
  botAuthFields: Record<string, string>;
  botAuthType: string;
  botForwardAllAgentMessages: boolean;
  botHandoffEnabled: boolean;
  botHandoffIdleSeconds: string;
  botHandoffPhoneBluetoothTargets: string;
  botHandoffPhoneWifiTargets: string;
  botLanguage: "auto" | "en" | "zh-CN";
  botMaxAttachmentMb: string;
  botMaxTurnMinutes: string;
  botMediaEnabled: boolean;
  botMessageChunkChars: string;
  botPlatform: string;
  botSessionIdleMinutes: string;
  botShellEnabled: boolean;
  botStreamReplies: boolean;
  name: string;
};

export type ApiKeyLimitDraftRow = {
  id: string;
  metric: ApiKeyLimitMetric;
  value: string;
  window: LimitWindowPreset;
};

export type ApiKeyLimitMetric = "images" | "requests" | "tokens";
export type ApiKeyExpirationPreset = "7d" | "30d" | "90d" | "custom" | "never";
export type LimitWindowPreset = "day" | "hour" | "minute";

export type ApiKeyListItem = {
  expiresAt?: string;
  index: number;
  key: ApiKeyConfig;
  keyValue: string;
  limits?: ApiKeyLimitConfig;
  masked: string;
  name: string;
};

export type AddRoutingRuleDraft = {
  conditionField: string;
  conditionLeft: string;
  conditionOperator: RouterRuleOperator;
  conditionRight: string;
  conditionSource: RouterConditionSource;
  enabled: boolean;
  fallback: RouterFallbackConfig;
  name: string;
  pattern: string;
  rewriteKey: string;
  rewriteValue: string;
  rewrites: RoutingRewriteDraftRow[];
  scriptFile: string;
  scriptTimeoutMs: string;
  target: string;
  threshold: string;
  type: RouterRuleType;
};

export type RoutingRewriteDraftRow = {
  id: string;
  key: string;
  match: string;
  operation: RouterRuleRewriteOperation;
  value: string;
};

export type ClaudeDesignRouteRuleType = "always" | "model" | "model-prefix";

export type ClaudeDesignRoutingRuleDraft = {
  enabled: boolean;
  id: string;
  model: string;
  name: string;
  pattern: string;
  target: string;
  threshold: string;
  type: ClaudeDesignRouteRuleType;
};

export type ClaudeDesignRoutingDraft = {
  defaultTarget: string;
  enabled: boolean;
  rules: ClaudeDesignRoutingRuleDraft[];
};

export type VirtualModelClientToolsPolicy = "allow" | "deny";
export type VirtualModelMatchMode = "alias" | "prefix" | "suffix";
export const fusionCustomToolMetadataKey = "fusionTool";
export const fusionMediaMetadataKey = "fusionMedia";
export const fusionVisionMetadataKey = "fusionVision";
export const fusionWebSearchMetadataKey = "fusionWebSearch";

export type VirtualModelToolDraft = {
  description: string;
  id: string;
  inputSchemaText: string;
  name: string;
  visibility: VirtualModelToolVisibility;
};

export type VirtualModelDraft = {
  baseModelMode: VirtualModelBaseModelMode;
  clientToolsPolicy: VirtualModelClientToolsPolicy;
  description: string;
  descriptionTemplate: string;
  displayName: string;
  displayNameTemplate: string;
  enabled: boolean;
  exactAliasesText: string;
  fixedModel: string;
  id: string;
  includeInGatewayModels: boolean;
  imageGenerationFallbackModels: string[];
  imageGenerationModel: string;
  imageGenerationRetryCount: string;
  instructionsAppend: string;
  instructionsPrepend: string;
  instructionsReplace: string;
  key: string;
  materializationEnabled: boolean;
  matchMultimodal: boolean;
  matchMode: VirtualModelMatchMode;
  matchWebSearch: boolean;
  prefixesText: string;
  suffixesText: string;
  toolChoiceText: string;
  tools: VirtualModelToolDraft[];
  toolsText: string;
  customMcpServer: McpServerDraft;
  customToolName: string;
  visionFallbackModels: string[];
  visionModel: string;
  visionRetryCount: string;
  videoGenerationFallbackModels: string[];
  videoGenerationModel: string;
  videoGenerationRetryCount: string;
  webSearchEnvRows: KeyValueDraftRow[];
  webSearchProvider: VirtualModelFusionWebSearchProvider;
  executionMode: VirtualModelExecutionMode;
};

export type McpServerDraft = {
  apiKey: string;
  apiKeyEnv: string;
  argsText: string;
  command: string;
  cwd: string;
  envRows: KeyValueDraftRow[];
  headerRows: KeyValueDraftRow[];
  name: string;
  protocolVersion: string;
  requestTimeoutMs: string;
  startupTimeoutMs: string;
  stdioMessageMode: GatewayMcpStdioMessageMode;
  transport: GatewayMcpServerTransport;
  url: string;
};

export type KeyValueDraftRow = {
  id: string;
  key: string;
  value: string;
};

export type ExtensionInstallDraft = {
  apps?: PluginMarketplaceEntry["apps"];
  dependencies: PluginDependency[];
  key: string;
  marketplaceId: string;
  modulePath: string;
  permissions?: GatewayPluginPermission[];
  selectedName: string;
  surfaces?: GatewayPluginSurfacesConfig;
};

export type ExtensionSource = "plugins" | "providerPlugins";

export type PluginRoutingConfigTarget = {
  index: number;
};

export type ExtensionConfigTarget = {
  index: number;
};

export type ExtensionDeleteTarget = {
  groupIndexes: number[];
  index: number;
  source: ExtensionSource;
};

export type ExtensionListItem = {
  canConfigure: boolean;
  canToggle: boolean;
  capability: string;
  enabled: boolean;
  groupIndexes: number[];
  index: number;
  name: string;
  source: ExtensionSource;
  status: "enabled" | "disabled" | "unsupported";
  surfaces?: GatewayPluginSurfacesConfig;
  target: string;
};

export type ModelCatalogItem = {
  description?: string;
  displayName?: string;
  key: string;
  model: string;
  providerIndex?: number;
  providerName?: string;
};

export type PluginInstallCandidate = {
  apps?: PluginMarketplaceEntry["apps"];
  dependencies: PluginDependency[];
  id: string;
  modulePath: string;
  name?: string;
  permissions?: GatewayPluginPermission[];
  surfaces?: GatewayPluginSurfacesConfig;
};

export type PluginSettingsDraft = {
  appsText: string;
  coreGatewayText: string;
  enabled: boolean;
  appsSurfaceEnabled: boolean;
  gatewaySurfaceEnabled: boolean;
  providerSurfaceEnabled: boolean;
  modulePath: string;
  configText: string;
  permissionsText: string;
  proxyText: string;
};

export type RoutingRuleRow = {
  condition: string;
  enabled: boolean;
  index?: number;
  key: string;
  name: string;
  pluginIndex?: number;
  readonly: boolean;
  ruleCount: number;
  ruleId: string;
  sourceLabel: string;
  target: string;
  toggleDisabled?: boolean;
  toggleDisabledReason?: string;
  typeLabel: string;
};

export type PluginRoutingConfigItem = {
  index: number;
  name: string;
};

export type AppToast = {
  id: number;
  message: string;
};

export type ServerActionBusy = "" | "cert" | "proxy";
