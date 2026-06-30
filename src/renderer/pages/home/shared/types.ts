import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Box,
  Boxes,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Database,
  ExternalLink,
  FolderOpen,
  Gauge,
  Globe,
  Info,
  KeyRound,
  Layers3,
  LoaderCircle,
  MoveRight,
  Network,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Route,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverContent } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import appLogoUrl from "../../../../../assets/logo.png";
import claudeCodeLogoUrl from "@/assets/agent-logos/claude-code.png";
import codexLogoUrl from "@/assets/agent-logos/codex.png";
import onboardingMascotSpriteUrl from "@/assets/onboarding/mascot-transition.svg";
import anthropicProviderIconUrl from "@/assets/provider-icons/anthropic.png";
import bailianProviderIconUrl from "@/assets/provider-icons/bailian.ico";
import deepseekProviderIconUrl from "@/assets/provider-icons/deepseek.ico";
import geminiProviderIconUrl from "@/assets/provider-icons/gemini.svg";
import mistralProviderIconUrl from "@/assets/provider-icons/mistral.webp";
import moonshotProviderIconUrl from "@/assets/provider-icons/moonshot.ico";
import openaiProviderIconUrl from "@/assets/provider-icons/openai.png";
import openrouterProviderIconUrl from "@/assets/provider-icons/openrouter.ico";
import siliconflowProviderIconUrl from "@/assets/provider-icons/siliconflow.png";
import zaiGlobalCodingProviderIconUrl from "@/assets/provider-icons/zai-global-coding.svg";
import zaiGlobalGeneralProviderIconUrl from "@/assets/provider-icons/zai-global-general.svg";
import zhipuCnCodingProviderIconUrl from "@/assets/provider-icons/zhipu-cn-coding.png";
import zhipuCnGeneralProviderIconUrl from "@/assets/provider-icons/zhipu-cn-general.png";
import trayCyanIconUrl from "../../../../../assets/tray-cyan.png";
import trayOrangeIconUrl from "../../../../../assets/tray-orange.png";
import trayVioletIconUrl from "../../../../../assets/tray-violet.png";
import {
  BUILTIN_FUSION_TOOL_SERVER_NAME,
  BUILTIN_FUSION_VISION_TOOL_NAME,
  BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME,
  CLAUDE_CODE_DEFAULT_ENV,
  DEFAULT_OVERVIEW_WIDGETS,
  DEFAULT_TRAY_COMPONENT_VARIANTS,
  DEFAULT_TRAY_WIDGETS,
  DEFAULT_TRAY_WINDOW_MODULES,
  enforceSingleEnabledGlobalProfilePerAgent,
  normalizeProfileScopeValue,
  OVERVIEW_WIDGET_SIZE_VALUES,
  TRAY_SINGLETON_WIDGET_TYPES,
  TRAY_TOP_WIDGET_TYPES,
  TRAY_WINDOW_MODULE_IDS
} from "../../../../shared/app";
import type {
  AgentAnalysisFilter,
  AgentAnalysisSessionSelection,
  AgentAnalysisSnapshot,
  AgentKind,
  AppConfig,
  AppInfo,
  AppUpdateStatus,
  ApiKeyConfig,
  ApiKeyLimitConfig,
  BotGatewayQrLoginCancelRequest,
  BotGatewayQrLoginCancelResult,
  BotGatewayQrLoginStartRequest,
  BotGatewayQrLoginStartResult,
  BotGatewayQrLoginWaitRequest,
  BotGatewayQrLoginWaitResult,
  BotGatewayQrWindowOpenResult,
  BotGatewayRuntimeConfig,
  BotGatewaySavedConfig,
  BotHandoffScanTarget,
  GatewayProviderConfig,
  GatewayProviderCapability,
  GatewayPluginAppConfig,
  GatewayProviderConnectivityCheckModelResult,
  GatewayProviderConnectivityCheckReport,
  GatewayProviderProbeCandidate,
  GatewayProviderProbeCandidateResult,
  GatewayProviderProbeResult,
  GatewayProviderProtocol,
  GatewayMcpServerConfig,
  GatewayMcpServerTransport,
  GatewayMcpStdioMessageMode,
  GatewayMcpToolInfo,
  GatewayStatus,
  OverviewMetricKind,
  OverviewWidgetConfig,
  OverviewWidgetSize,
  OverviewWidgetType,
  OverviewWidgetVariant,
  PluginDependency,
  PluginDirectorySelection,
  PluginMarketplaceEntry,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountHttpJsonConnectorConfig,
  ProviderAccountMeter,
  ProviderAccountStandardConnectorConfig,
  ProviderAccountSnapshot,
  ProviderAccountTestPath,
  ProviderAccountTestResult,
  ProviderCredentialConfig,
  ProviderDeepLinkPayload,
  ProviderDeepLinkRequest,
  ProfileConfig,
  ProfileOpenSurface,
  CodexProfileConfigFormat,
  ProfileScope,
  ProfileSurface,
  ProxyCertificateInstallResult,
  ProxyCertificateStatus,
  ProxyNetworkBody,
  ProxyNetworkExchange,
  ProxyNetworkSnapshot,
  ProxyStatus,
  RequestLogBody,
  RequestLogEntry,
  RequestLogListFilter,
  RequestLogPage,
  RequestLogStatusFilter,
  RouterConfig,
  RouterFallbackConfig,
  RouterFallbackMode,
  RouterRule,
  RouterRuleCondition,
  RouterRuleOperator,
  RouterRuleRewrite,
  RouterRuleRewriteOperation,
  RouterRuleType,
  TrayBalanceProgressConfig,
  TrayComponentVariants,
  TrayWidgetConfig,
  TrayWidgetType,
  TrayWidgetVariant,
  TrayWindowModuleId,
  UsageComparisonRow,
  UsageSeriesPoint,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals,
  VirtualModelBaseModelMode,
  VirtualModelExecutionMode,
  VirtualModelFusionCustomToolConfig,
  VirtualModelFusionVisionConfig,
  VirtualModelFusionWebSearchConfig,
  VirtualModelFusionWebSearchProvider,
  VirtualModelProfileConfig,
  VirtualModelToolVisibility
} from "../../../../shared/app";
import {
  customProviderPresetId,
  defaultProviderAccountConfig,
  standardProviderAccountConfig,
  type ProviderIdentitySafetyIssue,
  type ProviderPreset,
  type ProviderPresetEndpoint
} from "../../../../shared/provider-presets";
import {
  findProviderPresetByBaseUrlInList,
  findProviderPresetInList,
  primaryProviderPresetEndpoint as primaryProviderPresetEndpointFromPreset,
  providerApiKeySafetyIssueInList,
  providerEndpointCanReceiveProviderApiKeyInList,
  providerIdentitySafetyIssueInList
} from "../../../../shared/provider-preset-utils";
import { normalizeProviderBaseUrl, providerUrlWithDefaultScheme } from "../../../../shared/provider-url";
import {
  fallbackConfig,
  fallbackGatewayStatus,
  fallbackInfo,
  fallbackProxyCertificateStatus,
  fallbackProxyNetworkSnapshot,
  fallbackProxyStatus,
  fallbackUpdateStatus
} from "./fallbacks";
import {
  AppI18nContext,
  appCopy,
  languagePreferenceStorageKey,
  translateOptions,
  translateText,
  useAppText,
  type AppCopy
} from "./i18n";
import {
  AnimatedDisclosure,
  AnimatedFieldSlot,
  AnimatedListItem,
  disclosureSpringTransition,
  listSpringTransition,
  motionEase,
  pageSpringTransition,
  reducedMotionTransition,
  ViewMotionShell
} from "./motion";
import {
  clientInitial,
  formatBytes,
  formatDuration,
  formatHeaderName,
  formatNetworkDateTime,
  formatNetworkHeaders,
  formatNetworkRequestRaw,
  formatNetworkResponseRaw,
  formatNetworkTime,
  networkCodeLabel,
  networkExchangeMatchesQuery,
  networkHeaderRows,
  networkLifecycleLabel,
  networkQueryRows,
  networkRowId,
  networkStatusLabel,
  networkStatusVariant,
  networkSummaryRows
} from "./network";
import {
  agentKindLabel,
  compactId,
  compactUserAgent,
  createEmptyAgentAnalysis,
  createEmptyAgentConcurrencySeries,
  createEmptyRequestLogPage,
  createEmptyUsageSeries,
  createEmptyUsageStats,
  emptyUsageTotals,
  formatAxisNumber,
  formatCompactNumber,
  formatPercent,
  formatStatusCodeCounts,
  formatToolCounts,
  formatUsdCost,
  logSelectOptions,
  normalizeAgentFilterValue
} from "./usage";
import {
  agentAnalysisRangeOptions,
  agentFilterOptions,
  apiKeyExpirationOptions,
  apiKeyLimitMetricOptions,
  claudeDesignRouteRuleTypeOptions,
  customFusionToolName,
  defaultFusionWebSearchProvider,
  fusionToolOptions,
  fusionWebSearchEnvKeysByProvider,
  fusionWebSearchProviderOptions,
  getDefaultOnboardingStep,
  getNextOnboardingStep,
  isOnboardingProfileReady,
  isOnboardingProviderReady,
  legacyRouterRuleTypes,
  legacyUnimcpPackageName,
  legacyUnimcpServerName,
  limitWindowOptions,
  mcpServerStartupTimeoutMs,
  mcpServerTransportOptions,
  mcpStdioMessageModeOptions,
  navigation,
  onboardingStepOrder,
  overviewMetricOptions,
  overviewWidgetSizeOptions,
  profileAgentOptions,
  profileScopeOptions,
  profileSurfaceOptions,
  providerAccountModeOptions,
  providerPresetIconUrls,
  providerProtocolOptions,
  providerUsageMethodOptions,
  requestLogPageSizeOptions,
  requestLogStatusOptions,
  removedLegacyRouterRuleIds,
  routerConditionSourceOptions,
  routerFallbackModeOptions,
  routerRewriteOperationOptions,
  routerRuleOperatorOptions,
  routerRuleTypeOptions,
  trayMascotIconUrls,
  usageRangeOptions,
  virtualModelBaseModeOptions,
  virtualModelClientToolsPolicyOptions,
  virtualModelExecutionModeOptions,
  virtualModelMatchModeOptions,
  virtualModelToolVisibilityOptions
} from "./options";
import type { AgentFilterValue, RouterConditionSource } from "./options";
import type { MotionSafeDivAttributes } from "./motion";


export type ViewId = "onboarding" | "overview" | "observability" | "api-keys" | "server" | "profile" | "networking" | "logs" | "providers" | "models" | "routing" | "virtual-models" | "extensions";
export type NavigationId = ViewId;
export type OnboardingStepId = "provider" | "profile" | "enter";
export type AppLanguagePreference = "system" | "en" | "zh";
export type ResolvedLanguage = "en" | "zh";
export type ResolvedTheme = "light" | "dark";
export type SettingsPageId = "appearance" | "observability" | "bots" | "tray" | "data";
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
  baseUrl: string;
  credentials: ProviderCredentialDraft[];
  icon: string;
  modelDisplayNames?: Record<string, string>;
  modelSearch: string;
  modelsText: string;
  name: string;
  presetId: string;
  providerPlugins: unknown[];
  protocol: GatewayProviderProtocol;
  selectedModels: string[];
  selectedProtocols: GatewayProviderProtocol[];
  usageBalanceLimitPath: string;
  usageBalanceRemainingPath: string;
  usageBalanceUnit: string;
  usageBalanceUsedPath: string;
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

export type ProviderAccountDraftMode = "standard" | "http-json" | "raw";
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
  model: string;
  name: string;
  providerId: string;
  providerName: string;
  scope: ProfileScope;
  settingsFile: string;
  showAllSessions: boolean;
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
  botPlatform: string;
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
  instructionsAppend: string;
  instructionsPrepend: string;
  instructionsReplace: string;
  key: string;
  materializationEnabled: boolean;
  matchMultimodal: boolean;
  matchMode: VirtualModelMatchMode;
  matchWebSearch: boolean;
  maxToolCalls: string;
  maxTurns: string;
  prefixesText: string;
  suffixesText: string;
  toolChoiceText: string;
  tools: VirtualModelToolDraft[];
  toolsText: string;
  customMcpServer: McpServerDraft;
  customToolName: string;
  visionModel: string;
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
  selectedName: string;
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
  target: string;
};

export type ModelCatalogItem = {
  displayName?: string;
  key: string;
  model: string;
};

export type PluginInstallCandidate = {
  apps?: PluginMarketplaceEntry["apps"];
  dependencies: PluginDependency[];
  id: string;
  modulePath: string;
  name?: string;
};

export type PluginSettingsDraft = {
  appsText: string;
  enabled: boolean;
  modulePath: string;
  configText: string;
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
