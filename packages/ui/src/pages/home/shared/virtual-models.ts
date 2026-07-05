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
import appLogoUrl from "@/assets/logo.png";
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
import trayCyanIconUrl from "@/assets/tray-cyan.png";
import trayOrangeIconUrl from "@/assets/tray-orange.png";
import trayVioletIconUrl from "@/assets/tray-violet.png";
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
} from "@ccr/core/contracts/app";
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
} from "@ccr/core/contracts/app";
import {
  customProviderPresetId,
  defaultProviderAccountConfig,
  standardProviderAccountConfig,
  type ProviderIdentitySafetyIssue,
  type ProviderPreset,
  type ProviderPresetEndpoint
} from "@ccr/core/providers/presets/types";
import {
  findProviderPresetByBaseUrlInList,
  findProviderPresetInList,
  primaryProviderPresetEndpoint as primaryProviderPresetEndpointFromPreset,
  providerApiKeySafetyIssueInList,
  providerEndpointCanReceiveProviderApiKeyInList,
  providerIdentitySafetyIssueInList
} from "@ccr/core/providers/presets/utils";
import { normalizeProviderBaseUrl, providerUrlWithDefaultScheme } from "@ccr/core/providers/url";
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


import { isPlainRecord, stringValue, uniqueStrings } from "./common";
import { sanitizeConfigId } from "./extensions";
import { createRouteModelOptions, numberValue } from "./providers";
import { clampNumber } from "./services";
import { fusionCustomToolMetadataKey, fusionVisionMetadataKey, fusionWebSearchMetadataKey } from "./types";
import type { KeyValueDraftRow, McpServerDraft, VirtualModelDraft, VirtualModelMatchMode, VirtualModelToolDraft } from "./types";

export function createVirtualModelDraft(config: AppConfig): VirtualModelDraft {
  const profiles = config.virtualModelProfiles ?? [];
  const key = uniqueVirtualModelKey(profiles);
  const defaultModel = createRouteModelOptions(config.Providers)[0]?.value ?? "";
  return {
    baseModelMode: "fixed",
    clientToolsPolicy: "allow",
    customMcpServer: createMcpServerDraft(config.agent?.mcpServers ?? []),
    customToolName: customFusionToolName,
    description: "",
    descriptionTemplate: "",
    displayName: "Fusion",
    displayNameTemplate: "{profileDisplayName}",
    enabled: true,
    exactAliasesText: key,
    fixedModel: defaultModel,
    id: uniqueVirtualModelId(profiles, key),
    includeInGatewayModels: true,
    instructionsAppend: "",
    instructionsPrepend: "",
    instructionsReplace: "",
    key,
    materializationEnabled: true,
    matchMultimodal: true,
    matchMode: "alias",
    matchWebSearch: false,
    maxToolCalls: "8",
    maxTurns: "6",
    prefixesText: "",
    suffixesText: "",
    toolChoiceText: "",
    tools: [],
    toolsText: BUILTIN_FUSION_VISION_TOOL_NAME,
    visionModel: defaultModel,
    webSearchEnvRows: createFusionWebSearchEnvRows(defaultFusionWebSearchProvider),
    webSearchProvider: defaultFusionWebSearchProvider,
    executionMode: "tool_loop"
  };
}

export function createVirtualModelDraftFromProfile(profile: VirtualModelProfileConfig, config?: AppConfig): VirtualModelDraft {
  const exactAliases = profile.match?.exactAliases ?? [];
  const prefixes = profile.match?.prefixes ?? [];
  const suffixes = profile.match?.suffixes ?? [];
  const matchMode = virtualModelMatchModeFromProfile(profile);
  const matchValues = matchMode === "prefix" ? prefixes : matchMode === "suffix" ? suffixes : exactAliases;
  const toolDrafts = (profile.tools ?? []).map((tool, index) => createVirtualModelToolDraft(tool, index));
  const visionConfig = fusionVisionConfigFromProfile(profile);
  const webSearchConfig = fusionWebSearchConfigFromProfile(profile);
  const selectedToolNames = selectedFusionToolNamesFromProfile(toolDrafts, profile);
  const flags = fusionToolExecutionFlagsFromTools(selectedToolNames);
  const routeModelOptions = createRouteModelOptions(config?.Providers ?? []);
  const defaultVisionModel = routeModelOptions[0]?.value ?? "";
  const customToolConfig = fusionCustomToolConfigFromProfile(profile);
  const customToolName = selectedToolNames.find((toolName) => !isBuiltInFusionToolName(toolName)) ?? customFusionToolName;
  const configuredMcpServers = config?.agent?.mcpServers ?? [];
  const customMcpServerConfig = customToolConfig?.mcpServerName
    ? configuredMcpServers.find((server) => server.name === customToolConfig.mcpServerName)
    : undefined;
  const customMcpServerDraft = customMcpServerConfig
    ? createMcpServerDraftFromConfig(customMcpServerConfig)
    : createMcpServerDraft(configuredMcpServers);
  if (!customMcpServerConfig && customToolConfig?.env) {
    customMcpServerDraft.envRows = keyValueRowsFromRecord(customToolConfig.env);
  }
  return {
    baseModelMode: "fixed",
    clientToolsPolicy: "allow",
    customMcpServer: customMcpServerDraft,
    customToolName,
    description: profile.description ?? "",
    descriptionTemplate: profile.materialization?.descriptionTemplate ?? "",
    displayName: profile.displayName ?? profile.key,
    displayNameTemplate: profile.materialization?.displayNameTemplate ?? "",
    enabled: profile.enabled !== false,
    exactAliasesText: matchValues.length ? matchValues.join(", ") : profile.key,
    fixedModel: profile.baseModel?.fixedModel ?? "",
    id: profile.id,
    includeInGatewayModels: profile.materialization?.includeInGatewayModels !== false,
    instructionsAppend: profile.instructions?.append ?? "",
    instructionsPrepend: profile.instructions?.prepend ?? "",
    instructionsReplace: profile.instructions?.replace ?? "",
    key: profile.key,
    materializationEnabled: profile.materialization?.enabled !== false,
    matchMultimodal: flags.matchMultimodal,
    matchMode: "alias",
    matchWebSearch: flags.matchWebSearch,
    maxToolCalls: String(profile.execution?.maxToolCalls ?? 8),
    maxTurns: String(profile.execution?.maxTurns ?? 6),
    prefixesText: (profile.match?.prefixes ?? []).join(", "),
    suffixesText: (profile.match?.suffixes ?? []).join(", "),
    toolChoiceText: formatVirtualModelToolChoice(profile.toolChoice),
    tools: toolDrafts,
    toolsText: selectedToolNames.join(", "),
    visionModel: visionConfig?.modelSelector ?? visionConfig?.model ?? defaultVisionModel,
    webSearchEnvRows: createFusionWebSearchEnvRows(webSearchConfig?.provider ?? defaultFusionWebSearchProvider, keyValueRowsFromRecord(webSearchConfig?.env ?? {})),
    webSearchProvider: webSearchConfig?.provider ?? defaultFusionWebSearchProvider,
    executionMode: "tool_loop"
  };
}

export function createVirtualModelToolDraft(tool?: Partial<VirtualModelProfileConfig["tools"][number]>, index = 0): VirtualModelToolDraft {
  return {
    description: tool?.description ?? "",
    id: `tool-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    inputSchemaText: tool?.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : "",
    name: tool?.name ?? "",
    visibility: tool?.visibility === "client" ? "client" : "internal"
  };
}

export function virtualModelMatchModeFromProfile(profile: VirtualModelProfileConfig): VirtualModelMatchMode {
  if (profile.match?.prefixes?.length) {
    return "prefix";
  }
  if (profile.match?.suffixes?.length) {
    return "suffix";
  }
  return "alias";
}

export function virtualModelMatchModeLabel(mode: VirtualModelMatchMode): string {
  if (mode === "prefix") {
    return "Prefix";
  }
  if (mode === "suffix") {
    return "Suffix";
  }
  return "Alias";
}

export function normalizeVirtualModelDraftPatch(current: VirtualModelDraft, patch: Partial<VirtualModelDraft>): VirtualModelDraft {
  const next = { ...current, ...patch };
  if (patch.matchMode === "alias") {
    next.baseModelMode = "fixed";
  } else if (patch.matchMode === "prefix") {
    next.baseModelMode = "strip_prefix";
  } else if (patch.matchMode === "suffix") {
    next.baseModelMode = "strip_suffix";
  }
  if (patch.exactAliasesText !== undefined) {
    const matchValue = parseVirtualModelTextList(patch.exactAliasesText)[0];
    if (matchValue) {
      next.key = sanitizeConfigId(matchValue) || matchValue;
      next.displayName = titleFromConfigKey(matchValue) || matchValue;
    }
  }
  if (patch.key !== undefined && (!current.displayName.trim() || current.displayName === "Virtual Model" || current.displayName === "Fusion")) {
    next.displayName = titleFromConfigKey(patch.key) || current.displayName;
  }
  if (patch.key !== undefined && current.exactAliasesText.trim() === current.key) {
    next.exactAliasesText = patch.key.trim();
  }
  if (patch.executionMode === "decorate_only" && current.tools.every((tool) => tool.visibility === "internal")) {
    next.tools = current.tools.map((tool) => ({ ...tool, visibility: "client" }));
  }
  return next;
}

export function fusionVisionConfigFromProfile(profile: VirtualModelProfileConfig): VirtualModelFusionVisionConfig | undefined {
  const value = profile.metadata?.[fusionVisionMetadataKey];
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const config: VirtualModelFusionVisionConfig = {
    apiKey: stringValue(value.apiKey),
    baseUrl: stringValue(value.baseUrl),
    model: stringValue(value.model),
    modelSelector: stringValue(value.modelSelector),
    toolName: stringValue(value.toolName)
  };
  const timeoutMs = typeof value.timeoutMs === "number"
    ? value.timeoutMs
    : typeof value.timeoutMs === "string"
      ? numberValue(value.timeoutMs)
      : 0;
  if (timeoutMs) {
    config.timeoutMs = timeoutMs;
  }
  return config.apiKey || config.baseUrl || config.model || config.modelSelector || config.toolName || config.timeoutMs ? config : undefined;
}

export function fusionVisionConfigFromDraft(draft: VirtualModelDraft, key: string): VirtualModelFusionVisionConfig | undefined {
  if (!fusionToolExecutionFlagsFromTools(selectedFusionToolNames(draft.toolsText)).matchMultimodal) {
    return undefined;
  }
  const model = draft.visionModel.trim();
  if (!model) {
    return undefined;
  }
  return {
    ...(model ? { modelSelector: model } : {}),
    toolName: fusionVisionToolName(key)
  };
}

export function fusionVisionToolName(key: string): string {
  const normalized = sanitizeConfigId(key).replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return `vision_understand_${normalized || "fusion"}`;
}

export function fusionWebSearchConfigFromProfile(profile: VirtualModelProfileConfig): VirtualModelFusionWebSearchConfig | undefined {
  const value = profile.metadata?.[fusionWebSearchMetadataKey];
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const provider = parseFusionWebSearchProvider(value.provider);
  const env = isPlainRecord(value.env) ? stringRecordValue(value.env) : {};
  const config: VirtualModelFusionWebSearchConfig = {
    ...(Object.keys(env).length ? { env } : {}),
    ...(provider ? { provider } : {}),
    toolName: stringValue(value.toolName)
  };
  const timeoutMs = typeof value.timeoutMs === "number"
    ? value.timeoutMs
    : typeof value.timeoutMs === "string"
      ? numberValue(value.timeoutMs)
      : 0;
  if (timeoutMs) {
    config.timeoutMs = timeoutMs;
  }
  const resultCount = typeof value.resultCount === "number"
    ? value.resultCount
    : typeof value.resultCount === "string"
      ? numberValue(value.resultCount)
      : 0;
  if (resultCount) {
    config.resultCount = resultCount;
  }
  return config.env || config.provider || config.toolName || config.timeoutMs || config.resultCount ? config : undefined;
}

export function fusionWebSearchConfigFromDraft(draft: VirtualModelDraft, key: string): VirtualModelFusionWebSearchConfig | undefined {
  if (!fusionToolExecutionFlagsFromTools(selectedFusionToolNames(draft.toolsText)).matchWebSearch) {
    return undefined;
  }
  const env = recordFromKeyValueRows(draft.webSearchEnvRows);
  return {
    ...(Object.keys(env).length ? { env } : {}),
    provider: draft.webSearchProvider,
    toolName: fusionWebSearchToolName(key)
  };
}

export function fusionWebSearchToolName(key: string): string {
  const normalized = sanitizeConfigId(key).replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return `${normalized || "fusion"}_web_search`;
}

export function fusionCustomToolConfigFromProfile(profile: VirtualModelProfileConfig): VirtualModelFusionCustomToolConfig | undefined {
  const value = profile.metadata?.[fusionCustomToolMetadataKey];
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const env = isPlainRecord(value.env) ? stringRecordValue(value.env) : {};
  const mcpServerName = stringValue(value.mcpServerName);
  return Object.keys(env).length || mcpServerName ? { ...(Object.keys(env).length ? { env } : {}), ...(mcpServerName ? { mcpServerName } : {}) } : undefined;
}

export function fusionCustomToolConfigFromDraft(draft: VirtualModelDraft): VirtualModelFusionCustomToolConfig | undefined {
  const selectedTools = selectedFusionToolNames(draft.toolsText);
  if (!selectedTools.some((toolName) => !isBuiltInFusionToolName(toolName))) {
    return undefined;
  }
  const mcpServerName = draft.customMcpServer.name.trim();
  return mcpServerName ? { mcpServerName } : undefined;
}

export function fusionCustomMcpServerFromDraft(
  draft: VirtualModelDraft,
  existingServers: GatewayMcpServerConfig[],
  editIndex?: number
): GatewayMcpServerConfig | undefined {
  const selectedTools = selectedFusionToolNames(draft.toolsText);
  if (!selectedTools.some((toolName) => !isBuiltInFusionToolName(toolName))) {
    return undefined;
  }
  return mcpServerConfigFromDraft(draft.customMcpServer, existingServers, editIndex);
}

export function parseFusionWebSearchProvider(value: unknown): VirtualModelFusionWebSearchProvider | undefined {
  const normalized = stringValue(value)?.toLowerCase() ?? "";
  return fusionWebSearchProviderOptions.some((option) => option.value === normalized)
    ? normalized as VirtualModelFusionWebSearchProvider
    : undefined;
}

export function createFusionWebSearchEnvRows(
  provider: VirtualModelFusionWebSearchProvider,
  currentRows: KeyValueDraftRow[] = []
): KeyValueDraftRow[] {
  const templateKeys = fusionWebSearchEnvKeysByProvider[provider] ?? [];
  const currentByKey = new Map(
    currentRows
      .map((row) => [row.key.trim(), row.value] as const)
      .filter(([rowKey]) => Boolean(rowKey))
  );
  const templateRows = templateKeys.map((rowKey) => createKeyValueDraftRow(rowKey, currentByKey.get(rowKey) ?? ""));
  const extraRows = currentRows
    .filter((row) => {
      const rowKey = row.key.trim();
      return rowKey && !templateKeys.includes(rowKey);
    })
    .map((row) => createKeyValueDraftRow(row.key, row.value));
  const rows = [...templateRows, ...extraRows];
  return rows.length ? rows : [createKeyValueDraftRow()];
}

export function validateVirtualModelDraft(draft: VirtualModelDraft): string {
  const matchValues = parseVirtualModelTextList(draft.exactAliasesText);
  const selectedTools = selectedFusionToolNames(draft.toolsText);
  const flags = fusionToolExecutionFlagsFromTools(selectedTools);
  if (matchValues.length === 0) {
    return "New model is required.";
  }
  if (!draft.fixedModel.trim()) {
    return "Base model is required.";
  }
  if (selectedTools.length === 0) {
    return "Tool is required.";
  }
  if (flags.matchMultimodal && !draft.visionModel.trim()) {
    return "Vision model is required.";
  }
  if (flags.matchWebSearch && !validateKeyValueRows(draft.webSearchEnvRows)) {
    return "Environment variable keys are required when values are set.";
  }
  if (selectedTools.some((toolName) => !isBuiltInFusionToolName(toolName))) {
    if (!selectedTools.some((toolName) => !isBuiltInFusionToolName(toolName) && toolName.trim())) {
      return "Tool name is required.";
    }
    return validateMcpServerDraft(draft.customMcpServer);
  }
  return "";
}

export function virtualModelProfileFromDraft(
  draft: VirtualModelDraft,
  existingProfiles: VirtualModelProfileConfig[],
  editIndex: number | undefined
): VirtualModelProfileConfig {
  const matchValues = parseVirtualModelTextList(draft.exactAliasesText);
  const primaryMatchValue = matchValues[0] ?? draft.key.trim();
  const key = sanitizeConfigId(primaryMatchValue) || sanitizeConfigId(draft.key) || primaryMatchValue || draft.key.trim();
  const id = editIndex === undefined ? uniqueVirtualModelId(existingProfiles, key, editIndex) : draft.id || uniqueVirtualModelId(existingProfiles, key, editIndex);
  const displayName = titleFromConfigKey(primaryMatchValue) || primaryMatchValue || draft.displayName.trim() || key;
  const fusionVisionConfig = fusionVisionConfigFromDraft(draft, id);
  const fusionWebSearchConfig = fusionWebSearchConfigFromDraft(draft, id);
  const fusionCustomToolConfig = fusionCustomToolConfigFromDraft(draft);
  const selectedTools = selectedFusionToolNames(draft.toolsText);
  const toolNames = selectedTools.map((toolName) => {
    if (fusionVisionConfig?.toolName && isFusionVisionToolName(toolName)) {
      return fusionVisionConfig.toolName;
    }
    if (fusionWebSearchConfig?.toolName && isFusionWebSearchToolName(toolName)) {
      return fusionWebSearchConfig.toolName;
    }
    return toolName;
  });
  const tools = virtualModelToolsFromDraft(draft, toolNames);
  const maxToolCalls = numberValue(draft.maxToolCalls);
  const maxTurns = numberValue(draft.maxTurns);
  const flags = fusionToolExecutionFlagsFromTools(toolNames);
  const metadata = {
    ...(fusionVisionConfig ? { [fusionVisionMetadataKey]: fusionVisionConfig } : {}),
    ...(fusionWebSearchConfig ? { [fusionWebSearchMetadataKey]: fusionWebSearchConfig } : {}),
    ...(fusionCustomToolConfig ? { [fusionCustomToolMetadataKey]: fusionCustomToolConfig } : {})
  };
  return {
    baseModel: virtualModelBaseModelFromDraft(draft),
    displayName,
    enabled: draft.enabled,
    execution: {
      clientToolsPolicy: "allow",
      ...flags,
      maxToolCalls: clampNumber(maxToolCalls || Math.max(tools.length, 1), 1, 50),
      maxTurns: clampNumber(maxTurns || 6, 1, 50),
      mode: "tool_loop",
      streamMode: "optimistic"
    },
    id,
    key,
    match: {
      exactAliases: matchValues,
      prefixes: [],
      suffixes: []
    },
    materialization: {
      displayNameTemplate: "{profileDisplayName}",
      enabled: true,
      includeInGatewayModels: true
    },
    ...(Object.keys(metadata).length ? { metadata } : {}),
    tools
  };
}

export function virtualModelBaseModelFromDraft(draft: VirtualModelDraft): VirtualModelProfileConfig["baseModel"] {
  return {
    fixedModel: normalizeCoreModelSelector(draft.fixedModel),
    mode: "fixed"
  };
}

export function virtualModelMatchFromDraft(
  draft: VirtualModelDraft,
  matchValues: string[]
): VirtualModelProfileConfig["match"] {
  if (draft.matchMode === "prefix") {
    return {
      exactAliases: [],
      prefixes: matchValues,
      suffixes: []
    };
  }
  if (draft.matchMode === "suffix") {
    return {
      exactAliases: [],
      prefixes: [],
      suffixes: matchValues
    };
  }
  return {
    exactAliases: matchValues,
    prefixes: [],
    suffixes: []
  };
}

export function virtualModelToolsFromDraft(draft: VirtualModelDraft, selectedToolNames = selectedFusionToolNames(draft.toolsText)): VirtualModelProfileConfig["tools"] {
  const existingTools = new Map(
    draft.tools
      .map((tool) => [normalizeFusionToolName(tool.name.trim()), tool] as const)
      .filter(([name]) => Boolean(name))
  );

  return uniqueStrings(selectedToolNames.map(normalizeFusionToolName))
    .filter(isFusionToolName)
    .map((name) => {
      const existingTool = existingTools.get(name) ?? existingTools.get(fusionToolBaseName(name));
      const inputSchema = existingTool ? parseVirtualModelJsonObject(existingTool.inputSchemaText) : undefined;
      const description = existingTool?.description.trim() || fusionToolDescription(name);
      return {
        ...(description ? { description } : {}),
        ...(inputSchema?.ok && inputSchema.value ? { inputSchema: inputSchema.value } : {}),
        name,
        visibility: "internal" as const
      };
    });
}

export function parseVirtualModelJsonObject(value: string): { ok: true; value?: Record<string, unknown> } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isPlainRecord(parsed) ? { ok: true, value: parsed } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function formatVirtualModelToolChoice(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function parseVirtualModelTextList(value: string): string[] {
  return uniqueStrings(
    value
      .split(/\r?\n|,/g)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function normalizeCoreModelSelector(value: string): string {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : trimmed;
  }
  return trimmed;
}

export function uniqueVirtualModelKey(profiles: VirtualModelProfileConfig[]): string {
  const existing = new Set(profiles.map((profile) => profile.key));
  for (let index = profiles.length + 1; index < 1000; index += 1) {
    const candidate = `fusion-${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `fusion-${Date.now()}`;
}

export function uniqueVirtualModelId(profiles: VirtualModelProfileConfig[], key: string, editIndex?: number): string {
  const base = sanitizeConfigId(key) || "fusion";
  const existing = new Set(profiles.filter((_, index) => index !== editIndex).map((profile) => profile.id));
  if (!existing.has(base)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

export function titleFromConfigKey(value: string): string {
  const words = value
    .trim()
    .split(/[-_\s.]+/g)
    .filter(Boolean);
  return words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(" ");
}

export function virtualModelMatchesQuery(profile: VirtualModelProfileConfig, query: string): boolean {
  if (!query) {
    return true;
  }
  return [
    profile.id,
    profile.key,
    profile.displayName,
    profile.description ?? "",
    virtualModelMatchSummary(profile),
    virtualModelBaseModelSummary(profile),
    virtualModelToolSummary(profile),
    virtualModelExecutionSummary(profile)
  ].some((value) => value.toLowerCase().includes(query));
}

export function virtualModelMatchSummary(profile: VirtualModelProfileConfig): string {
  const match = profile.match ?? { exactAliases: [], prefixes: [], suffixes: [] };
  if (match.exactAliases?.length) {
    return match.exactAliases.join(", ");
  }
  const parts = [
    ...(match.prefixes ?? []).map((value) => `${value}*`),
    ...(match.suffixes ?? []).map((value) => `*${value}`)
  ];
  return parts.length ? parts.join(", ") : "-";
}

export function virtualModelBaseModelSummary(profile: VirtualModelProfileConfig): string {
  const base = profile.baseModel;
  if (!base) {
    return "request";
  }
  if (base.fixedModel) {
    return base.fixedModel;
  }
  if (base.mode === "strip_prefix") {
    return "strip prefix";
  }
  if (base.mode === "strip_suffix") {
    return "strip suffix";
  }
  return base.mode || "request";
}

export function virtualModelToolSummary(profile: VirtualModelProfileConfig): string {
  if (!profile.tools?.length) {
    return "-";
  }
  const visionConfig = fusionVisionConfigFromProfile(profile);
  const webSearchConfig = fusionWebSearchConfigFromProfile(profile);
  const customToolConfig = fusionCustomToolConfigFromProfile(profile);
  return profile.tools.map((tool) => {
    if (visionConfig?.toolName && tool.name === visionConfig.toolName) {
      return `${fusionToolDisplayName(BUILTIN_FUSION_VISION_TOOL_NAME)}${visionConfig.modelSelector || visionConfig.model ? ` (${visionConfig.modelSelector || visionConfig.model})` : ""}`;
    }
    if (webSearchConfig?.toolName && tool.name === webSearchConfig.toolName) {
      return `${fusionToolDisplayName(BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME)}${webSearchConfig.provider ? ` (${fusionWebSearchProviderLabel(webSearchConfig.provider)})` : ""}`;
    }
    return customToolConfig?.mcpServerName
      ? `${customToolConfig.mcpServerName} / ${fusionToolDisplayName(tool.name)}`
      : fusionToolDisplayName(tool.name);
  }).join(", ");
}

export function normalizeFusionToolName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === legacyUnimcpPackageName || trimmed === legacyUnimcpServerName) {
    return BUILTIN_FUSION_VISION_TOOL_NAME;
  }
  return trimmed;
}

export function isFusionToolName(name: string): boolean {
  return Boolean(normalizeFusionToolName(name));
}

export function isBuiltInFusionToolName(name: string): boolean {
  const normalized = normalizeFusionToolName(name);
  return isFusionVisionToolName(normalized) || isFusionWebSearchToolName(normalized);
}

export function isFusionVisionToolName(name: string): boolean {
  const normalized = normalizeFusionToolName(name);
  return normalized === BUILTIN_FUSION_VISION_TOOL_NAME || normalized.startsWith(`${BUILTIN_FUSION_VISION_TOOL_NAME}_`);
}

export function isFusionWebSearchToolName(name: string): boolean {
  const normalized = normalizeFusionToolName(name);
  return normalized === BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME ||
    normalized.startsWith(`${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}_`) ||
    normalized.endsWith(`_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`) ||
    normalized.includes("search_web");
}

export function selectedFusionToolName(toolsText: string): string {
  return selectedFusionToolNames(toolsText)[0] ?? BUILTIN_FUSION_VISION_TOOL_NAME;
}

export function selectedFusionToolNames(toolsText: string): string[] {
  return uniqueStrings(parseVirtualModelTextList(toolsText).map(normalizeFusionToolName).filter(isFusionToolName));
}

export function selectedFusionToolNameFromProfile(toolDrafts: VirtualModelToolDraft[], profile: VirtualModelProfileConfig): string {
  return selectedFusionToolNamesFromProfile(toolDrafts, profile)[0] ?? BUILTIN_FUSION_VISION_TOOL_NAME;
}

export function selectedFusionToolNamesFromProfile(toolDrafts: VirtualModelToolDraft[], profile: VirtualModelProfileConfig): string[] {
  const visionConfig = fusionVisionConfigFromProfile(profile);
  const webSearchConfig = fusionWebSearchConfigFromProfile(profile);
  const directTools = uniqueStrings(
    toolDrafts
      .map((tool) => normalizeFusionToolName(tool.name))
      .filter(isFusionToolName)
      .map((toolName) => {
        if (visionConfig?.toolName && toolName === visionConfig.toolName) {
          return BUILTIN_FUSION_VISION_TOOL_NAME;
        }
        if (webSearchConfig?.toolName && toolName === webSearchConfig.toolName) {
          return BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME;
        }
        return toolName;
      })
  );
  if (directTools.length > 0) {
    return directTools;
  }
  if (profile.execution?.matchWebSearch && !profile.execution?.matchMultimodal) {
    return [BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME];
  }
  if (profile.execution?.matchWebSearch && profile.execution?.matchMultimodal) {
    return [BUILTIN_FUSION_VISION_TOOL_NAME, BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME];
  }
  return [BUILTIN_FUSION_VISION_TOOL_NAME];
}

export function fusionToolExecutionFlags(name: string): Pick<VirtualModelDraft, "matchMultimodal" | "matchWebSearch"> {
  const normalized = normalizeFusionToolName(name);
  return {
    matchMultimodal: isFusionVisionToolName(normalized),
    matchWebSearch: isFusionWebSearchToolName(normalized)
  };
}

export function fusionToolExecutionFlagsFromTools(names: string[]): Pick<VirtualModelDraft, "matchMultimodal" | "matchWebSearch"> {
  const flags = names.map(fusionToolExecutionFlags);
  return {
    matchMultimodal: flags.some((flag) => flag.matchMultimodal),
    matchWebSearch: flags.some((flag) => flag.matchWebSearch)
  };
}

export function fusionWebSearchProviderLabel(provider: VirtualModelFusionWebSearchProvider): string {
  return fusionWebSearchProviderOptions.find((option) => option.value === provider)?.label ?? provider;
}

export function fusionToolDescription(name: string): string {
  const option = fusionToolOptions.find((item) => item.value === fusionToolBaseName(name));
  return option?.description ?? "";
}

export function fusionToolDisplayName(name: string): string {
  const normalized = fusionToolBaseName(name);
  const option = fusionToolOptions.find((item) => item.value === normalized);
  return option?.label ?? normalized;
}

export function fusionToolBaseName(name: string): string {
  const normalized = normalizeFusionToolName(name);
  if (isFusionVisionToolName(normalized)) {
    return BUILTIN_FUSION_VISION_TOOL_NAME;
  }
  if (isFusionWebSearchToolName(normalized)) {
    return BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME;
  }
  return normalized;
}

export function createMcpToolOptions(mcpServers: GatewayMcpServerConfig[], selectedToolsText: string): Array<{ available: boolean; description: string; label: string; value: string }> {
  const options = mcpServers.map((server) => ({
    available: true,
    description: mcpServerEndpointSummary(server),
    label: server.name,
    value: server.name
  }));
  const known = new Set(options.map((option) => option.value));
  for (const name of parseVirtualModelTextList(selectedToolsText)) {
    if (!known.has(name)) {
      options.push({
        available: false,
        description: "Unavailable",
        label: name,
        value: name
      });
    }
  }
  return options;
}

export function virtualModelExecutionSummary(profile: VirtualModelProfileConfig): string {
  const execution = profile.execution;
  const features = [
    execution?.matchMultimodal ? "image" : "",
    execution?.matchWebSearch ? "web search" : ""
  ].filter(Boolean);
  return `${execution?.mode || "tool_loop"} · ${execution?.maxTurns ?? 6}/${execution?.maxToolCalls ?? 8}${features.length ? ` · ${features.join(", ")}` : ""}`;
}

export function createMcpServerDraft(servers: GatewayMcpServerConfig[] = []): McpServerDraft {
  return {
    apiKey: "",
    apiKeyEnv: "",
    argsText: "",
    command: "",
    cwd: "",
    envRows: [],
    headerRows: [],
    name: uniqueMcpServerName(servers),
    protocolVersion: "2024-11-05",
    requestTimeoutMs: "30000",
    startupTimeoutMs: String(mcpServerStartupTimeoutMs),
    stdioMessageMode: "content-length",
    transport: "stdio",
    url: ""
  };
}

export function createMcpServerDraftFromConfig(server: GatewayMcpServerConfig): McpServerDraft {
  const remote = server.transport !== "stdio";
  return {
    apiKey: remote ? server.apiKey ?? "" : "",
    apiKeyEnv: remote ? server.apiKeyEnv ?? "" : "",
    argsText: server.transport === "stdio" ? server.args.join(", ") : "",
    command: server.transport === "stdio" ? server.command : "",
    cwd: server.transport === "stdio" ? server.cwd ?? "" : "",
    envRows: server.transport === "stdio" ? keyValueRowsFromRecord(server.env) : [],
    headerRows: remote ? keyValueRowsFromRecord(server.headers) : [],
    name: server.name,
    protocolVersion: server.protocolVersion,
    requestTimeoutMs: String(server.requestTimeoutMs),
    startupTimeoutMs: String(server.startupTimeoutMs || mcpServerStartupTimeoutMs),
    stdioMessageMode: server.transport === "stdio" ? server.stdioMessageMode : "content-length",
    transport: server.transport,
    url: remote ? server.url : ""
  };
}

export function validateMcpServerDraft(draft: McpServerDraft): string {
  if (!draft.name.trim()) {
    return "Name is required.";
  }
  if (draft.transport === "stdio" && !draft.command.trim()) {
    return "Command is required.";
  }
  if (draft.transport !== "stdio" && !draft.url.trim()) {
    return "URL is required.";
  }
  if (numberValue(draft.requestTimeoutMs) < 100) {
    return "Request timeout must be at least 100 ms.";
  }
  if (numberValue(draft.startupTimeoutMs) < 100) {
    return "Startup timeout must be at least 100 ms.";
  }
  if (draft.transport === "stdio" && !validateKeyValueRows(draft.envRows)) {
    return "Env rows require keys.";
  }
  if (draft.transport !== "stdio" && !validateKeyValueRows(draft.headerRows)) {
    return "Header rows require keys.";
  }
  return "";
}

export function mcpServerConfigFromDraft(
  draft: McpServerDraft,
  existingServers: GatewayMcpServerConfig[],
  editIndex: number | undefined
): GatewayMcpServerConfig {
  const base = {
    name: draft.name.trim() || uniqueMcpServerName(existingServers, editIndex),
    protocolVersion: draft.protocolVersion.trim() || "2024-11-05",
    requestTimeoutMs: clampNumber(numberValue(draft.requestTimeoutMs), 100, 600000),
    startupTimeoutMs: clampNumber(numberValue(draft.startupTimeoutMs), 100, 600000)
  };

  if (draft.transport !== "stdio") {
    return {
      ...base,
      ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
      ...(draft.apiKeyEnv.trim() ? { apiKeyEnv: draft.apiKeyEnv.trim() } : {}),
      headers: recordFromKeyValueRows(draft.headerRows),
      transport: draft.transport,
      url: draft.url.trim()
    };
  }

  return {
    ...base,
    args: parseVirtualModelTextList(draft.argsText),
    command: draft.command.trim(),
    ...(draft.cwd.trim() ? { cwd: draft.cwd.trim() } : {}),
    env: recordFromKeyValueRows(draft.envRows),
    stdioMessageMode: draft.stdioMessageMode,
    transport: "stdio"
  };
}

export function normalizeMcpServers(value: unknown): GatewayMcpServerConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): GatewayMcpServerConfig | undefined => {
      if (!isPlainRecord(item)) {
        return undefined;
      }
      const draft = createMcpServerDraftFromUnknown(item);
      return validateMcpServerDraft(draft) ? undefined : mcpServerConfigFromDraft(draft, [], undefined);
    })
    .filter((server): server is GatewayMcpServerConfig => Boolean(server));
}

export function createMcpServerDraftFromUnknown(value: Record<string, unknown>): McpServerDraft {
  const transport = parseMcpServerTransportValue(value.transport);
  const remote = transport !== "stdio";
  return {
    apiKey: stringValue(value.apiKey) ?? "",
    apiKeyEnv: stringValue(value.apiKeyEnv) ?? "",
    argsText: Array.isArray(value.args) ? value.args.map((item) => stringValue(item)).filter(Boolean).join(", ") : "",
    command: stringValue(value.command) ?? "",
    cwd: stringValue(value.cwd) ?? "",
    envRows: transport === "stdio" ? keyValueRowsFromRecord(isPlainRecord(value.env) ? stringRecordValue(value.env) : {}) : [],
    headerRows: remote ? keyValueRowsFromRecord(isPlainRecord(value.headers) ? stringRecordValue(value.headers) : {}) : [],
    name: stringValue(value.name) ?? "",
    protocolVersion: stringValue(value.protocolVersion) ?? "2024-11-05",
    requestTimeoutMs: String(numberValue(String(value.requestTimeoutMs ?? "")) || 30000),
    startupTimeoutMs: String(numberValue(String(value.startupTimeoutMs ?? "")) || mcpServerStartupTimeoutMs),
    stdioMessageMode: stringValue(value.stdioMessageMode) === "newline-json" ? "newline-json" : "content-length",
    transport,
    url: stringValue(value.url) ?? ""
  };
}

export function mcpServerEndpointSummary(server: GatewayMcpServerConfig): string {
  if (server.transport !== "stdio") {
    return server.url;
  }
  return [server.command, ...server.args].join(" ");
}

export function parseMcpServerTransportValue(value: unknown): GatewayMcpServerTransport {
  const normalized = stringValue(value)
    ?.toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  if (normalized === "sse") {
    return "sse";
  }
  if (normalized === "streamable-http" || normalized === "streamble-http" || normalized === "websocket") {
    return "streamable-http";
  }
  return "stdio";
}

export function createKeyValueDraftRow(key = "", value = ""): KeyValueDraftRow {
  return {
    id: `key-value-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    value
  };
}

export function keyValueRowsFromRecord(value: Record<string, string>): KeyValueDraftRow[] {
  return Object.entries(value).map(([key, itemValue]) => createKeyValueDraftRow(key, itemValue));
}

export function validateKeyValueRows(rows: KeyValueDraftRow[]): boolean {
  return rows.every((row) => !row.value.trim() || Boolean(row.key.trim()));
}

export function validateProfileEnvRows(rows: KeyValueDraftRow[]): boolean {
  return rows.every((row) => {
    const key = row.key.trim();
    return (!row.value.trim() || Boolean(key)) && (!key || isProfileEnvName(key));
  });
}

export function isProfileEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export function recordFromKeyValueRows(rows: KeyValueDraftRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    result[key] = row.value;
  }
  return result;
}

export function uniqueMcpServerName(servers: GatewayMcpServerConfig[], editIndex?: number): string {
  const existing = new Set(servers.filter((_, index) => index !== editIndex).map((server) => server.name));
  for (let index = servers.length + 1; index < 1000; index += 1) {
    const candidate = `mcp-${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `mcp-${Date.now()}`;
}

export function parseKeyValueText(value: string): { ok: true; value: Record<string, string> } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return isPlainRecord(parsed) ? { ok: true, value: stringRecordValue(parsed) } : { ok: false };
    } catch {
      return { ok: false };
    }
  }
  const result: Record<string, string> = {};
  for (const rawLine of value.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      return { ok: false };
    }
    const key = line.slice(0, separator).trim();
    const itemValue = line.slice(separator + 1).trim();
    if (!key) {
      return { ok: false };
    }
    result[key] = itemValue;
  }
  return { ok: true, value: result };
}

export function formatKeyValueText(value: Record<string, string>): string {
  return Object.entries(value).map(([key, itemValue]) => `${key}=${itemValue}`).join("\n");
}

export function stringRecordValue(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, itemValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    if (normalizedKey && typeof itemValue === "string") {
      result[normalizedKey] = itemValue;
    }
  }
  return result;
}
