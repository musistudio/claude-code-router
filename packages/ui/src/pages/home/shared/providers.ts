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
import zcodeLogoUrl from "@/assets/agent-logos/zcode.png";
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
  LocalAgentProviderKind,
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
  ProviderModelMetadata,
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
import { newApiUserSelfConnectorConfig } from "@ccr/core/providers/new-api";
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


import { normalizeApiKeyLimits, positiveInteger } from "./api-keys";
import { isPlainRecord, stringValue, uniqueStrings } from "./common";
import { formatEditableJson } from "./extensions";
import { findProviderPreset, findProviderPresetByBaseUrl, findProviderPresetByIdentity, providerApiKeySafetyIssue, providerEndpointCanReceiveProviderApiKey, providerIdentitySafetyIssue } from "./external";
import { fusionModelProviderName } from "./profiles";
import { normalizeRouterFallbackConfig } from "./routing";
import { keyValueRowsFromRecord, recordFromKeyValueRows, validateKeyValueRows, virtualModelMatchSummary } from "./virtual-models";
import type { AddProviderDraft, AddRoutingRuleDraft, ModelCatalogItem, ProviderCredentialDraft, ProviderProbeCandidate, ProviderProbeCandidateResult, ProviderUsageFieldTarget, RoutingRewriteDraftRow, RoutingRuleRow, ViewId } from "./types";

export const localAgentProviderIconUrls: Record<LocalAgentProviderKind, string> = {
  "claude-code": claudeCodeLogoUrl,
  codex: codexLogoUrl,
  zcode: zcodeLogoUrl
};

export function createModelCatalogItems(config: AppConfig): ModelCatalogItem[] {
  const rows: ModelCatalogItem[] = [];
  config.Providers.forEach((provider, providerIndex) => {
    const providerName = provider.name?.trim();
    if (!providerName) {
      return;
    }
    for (const model of mergeProviderModelLists(provider.models)) {
      const description = provider.modelDescriptions?.[model]?.trim();
      const displayName = provider.modelDisplayNames?.[model]?.trim();
      rows.push({
        ...(description ? { description } : {}),
        ...(displayName ? { displayName } : {}),
        key: `provider-model:${providerIndex}:${providerName}:${model}`,
        model,
        providerIndex,
        providerName
      });
    }
  });
  const virtualModels = (config.virtualModelProfiles ?? [])
    .filter(virtualModelIsCatalogVisible)
    .flatMap(virtualModelCatalogNames);

  return [
    ...rows,
    ...uniqueStrings(virtualModels).map((model, index) => ({
      key: `virtual-model:${index}:${model}`,
      model
    }))
  ];
}

export function virtualModelIsCatalogVisible(profile: VirtualModelProfileConfig): boolean {
  return profile.enabled !== false &&
    profile.materialization?.enabled !== false &&
    profile.materialization?.includeInGatewayModels !== false;
}

export function virtualModelCatalogNames(profile: VirtualModelProfileConfig): string[] {
  return virtualModelRawCatalogNames(profile).map(fusionModelSelector);
}

export function virtualModelProfileModelNames(profiles: VirtualModelProfileConfig[]): string[] {
  return uniqueStrings(
    profiles
      .filter(virtualModelIsCatalogVisible)
      .flatMap(virtualModelRawCatalogNames)
      .map(fusionModelNameFromSelector)
      .filter(Boolean)
  );
}

export function fusionModelSelector(model: string): string {
  const normalized = fusionModelNameFromSelector(model);
  return normalized ? `${fusionModelProviderName}/${normalized}` : "";
}

export function fusionModelNameFromSelector(model: string): string {
  const trimmed = model.trim();
  const prefix = `${fusionModelProviderName}/`;
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase())
    ? trimmed.slice(prefix.length).trim()
    : trimmed;
}

function virtualModelRawCatalogNames(profile: VirtualModelProfileConfig): string[] {
  const exactAliases = uniqueStrings(profile.match?.exactAliases ?? []);
  if (exactAliases.length > 0) {
    return exactAliases;
  }
  const matchSummary = virtualModelMatchSummary(profile);
  if (matchSummary && matchSummary !== "-") {
    return [matchSummary];
  }
  return [profile.key || profile.displayName].filter(Boolean);
}

export function modelCatalogItemMatchesQuery(row: ModelCatalogItem, query: string): boolean {
  if (!query) {
    return true;
  }

  return row.model.toLowerCase().includes(query) ||
    (row.providerName ?? "").toLowerCase().includes(query) ||
    (row.displayName ?? "").toLowerCase().includes(query) ||
    (row.description ?? "").toLowerCase().includes(query);
}

export function createRouteModelOptions(providers: GatewayProviderConfig[]): Array<{ label: string; value: string }> {
  return providers.flatMap((provider) => {
    if (!provider.name || !Array.isArray(provider.models)) {
      return [];
    }
    return provider.models
      .filter(Boolean)
      .map((model) => ({
        label: `${provider.name}, ${providerModelDisplayName(provider, model)}`,
        value: `${provider.name},${model}`
      }));
  });
}

export function routeTargetOptions(modelOptions: Array<{ label: string; value: string }>, value: string): Array<{ label: string; value: string }> {
  const options = [{ label: "Unset", value: "" }, ...modelOptions];
  if (value && !options.some((option) => option.value === value)) {
    return [{ label: value, value }, ...options];
  }
  return options;
}

export function routerRuleTypeLabel(type: RouterRuleType): string {
  return type === "condition" ? "Condition" : "Legacy";
}

export function formatRouterRuleCondition(rule: RouterRule): string {
  const condition = routerRuleConditionFromRule(rule);
  if (condition) {
    return `${condition.left} ${condition.operator} ${condition.right}`;
  }
  return "condition unset";
}

export function routerRuleConditionFromRule(rule: RouterRule, config?: AppConfig): RouterRuleCondition | undefined {
  if (rule.condition) {
    return rule.condition;
  }
  if (rule.type === "condition") {
    return undefined;
  }
  if (rule.type === "model-prefix") {
    return {
      left: "request.body.model",
      operator: "starts-with",
      right: rule.pattern ?? ""
    };
  }
  return undefined;
}

export function formatRouterRuleTarget(rule: RouterRule): string {
  const rewrites = routerRuleRewritesFromRule(rule);
  const action = rewrites.length
    ? rewrites.map(formatRouterRewriteSummary).join("; ")
    : "No request rewrite";
  return rule.fallback ? `${action} · ${formatRouterFallbackSummary(rule.fallback)}` : action;
}

export function routerRuleRewriteFromRule(rule: RouterRule): RouterRuleRewrite | undefined {
  return routerRuleRewritesFromRule(rule)[0];
}

export function routerRuleRewritesFromRule(rule: RouterRule): RouterRuleRewrite[] {
  if (rule.rewrites?.length) {
    return rule.rewrites;
  }
  if (rule.rewrite) {
    return [rule.rewrite];
  }
  return rule.target
    ? [{ key: "request.body.model", operation: "set", value: rule.target }]
    : [];
}

export function formatRouterRewriteSummary(rewrite: RouterRuleRewrite): string {
  const operation = rewrite.operation ?? "set";
  if (operation === "delete") {
    return `delete ${rewrite.key}`;
  }
  if (operation === "array-replace") {
    return `array-replace ${rewrite.key}: ${rewrite.match ?? ""} -> ${rewrite.value ?? ""}`;
  }
  if (operation.startsWith("array-")) {
    return `${operation} ${rewrite.key}: ${rewrite.value ?? ""}`;
  }
  return `set ${rewrite.key} = ${rewrite.value ?? ""}`;
}

export function formatRouterFallbackSummary(fallback: RouterFallbackConfig): string {
  if (fallback.mode === "off") {
    return "fallback off";
  }
  if (fallback.mode === "retry") {
    return `retry ${fallback.retryCount}x`;
  }
  return fallback.models.length ? `on failure ${fallback.models.join(" > ")}` : "fallback targets unset";
}

export function routerRuleMatchesQuery(rule: RouterRule, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    rule.id,
    rule.name,
    routerRuleTypeLabel(rule.type),
    formatRouterRuleCondition(rule),
    formatRouterRuleTarget(rule)
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(query));
}

export function routingRuleRowMatchesQuery(row: RoutingRuleRow, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    row.condition,
    row.name,
    row.ruleId,
    row.sourceLabel,
    row.target,
    row.typeLabel
  ].some((value) => value.toLowerCase().includes(query));
}

export function createRoutingRuleDraft(config?: AppConfig): AddRoutingRuleDraft {
  const rewrite = createRoutingRewriteDraftRow();
  return {
    conditionField: "",
    conditionLeft: "request.header.",
    conditionOperator: "==",
    conditionRight: "",
    conditionSource: "request.header",
    enabled: true,
    fallback: normalizeRouterFallbackConfig(config?.Router.fallback),
    name: "Condition",
    pattern: "",
    rewriteKey: rewrite.key,
    rewriteValue: rewrite.value,
    rewrites: [rewrite],
    target: "",
    threshold: "200000",
    type: "condition"
  };
}

export function createRoutingRuleDraftFromRule(rule: RouterRule, config?: AppConfig): AddRoutingRuleDraft {
  const condition = routerRuleConditionFromRule(rule, config);
  const conditionPath = splitRouterConditionPath(condition?.left);
  const rewrites = routerRuleRewritesFromRule(rule).map(createRoutingRewriteDraftRowFromRewrite);
  const firstRewrite = rewrites[0] ?? createRoutingRewriteDraftRow();
  return {
    conditionField: conditionPath.field,
    conditionLeft: condition?.left ?? "request.header.",
    conditionOperator: condition?.operator ?? "==",
    conditionRight: condition?.right ?? "",
    conditionSource: conditionPath.source,
    enabled: rule.enabled,
    fallback: normalizeRouterFallbackConfig(rule.fallback ?? config?.Router.fallback),
    name: rule.name,
    pattern: rule.pattern ?? "",
    rewriteKey: firstRewrite.key,
    rewriteValue: firstRewrite.value,
    rewrites: rewrites.length ? rewrites : [firstRewrite],
    target: rule.target ?? "",
    threshold: String(rule.threshold ?? 200000),
    type: "condition"
  };
}

export function buildRouterConditionPath(source: RouterConditionSource, field: string): string {
  const normalizedField = field.trim().replace(/^\.+/, "");
  return normalizedField ? `${source}.${normalizedField}` : `${source}.`;
}

export function splitRouterConditionPath(value: string | undefined): { field: string; source: RouterConditionSource } {
  const path = value?.trim() ?? "";
  const source = routerConditionSourceOptions.find((option) =>
    path === option.value || path.startsWith(`${option.value}.`)
  )?.value ?? "request.header";
  return {
    field: path.startsWith(`${source}.`) ? path.slice(source.length + 1) : "",
    source
  };
}

export function createRoutingRewriteDraftRow(): RoutingRewriteDraftRow {
  return {
    id: `rewrite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key: "request.body.model",
    match: "",
    operation: "set",
    value: ""
  };
}

export function createRoutingRewriteDraftRowFromRewrite(rewrite: RouterRuleRewrite): RoutingRewriteDraftRow {
  return {
    id: `rewrite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key: rewrite.key,
    match: rewrite.match ?? "",
    operation: rewrite.operation ?? "set",
    value: rewrite.value ?? ""
  };
}

export function isRoutingRewriteDraftRowValid(row: RoutingRewriteDraftRow): boolean {
  if (!row.key.trim()) {
    return false;
  }
  if (row.operation === "delete") {
    return true;
  }
  if (row.operation === "array-replace") {
    return Boolean(row.match.trim() && row.value.trim());
  }
  return Boolean(row.value.trim());
}

export function routingRewriteFromDraftRow(row: RoutingRewriteDraftRow): RouterRuleRewrite {
  return {
    key: row.key.trim(),
    ...(row.operation !== "set" ? { operation: row.operation } : { operation: "set" as const }),
    ...(row.operation === "array-replace" ? { match: row.match.trim() } : {}),
    ...(row.operation !== "delete" ? { value: row.value.trim() } : {})
  };
}

export function uniqueRoutingRuleId(rules: RouterRule[]): string {
  let index = rules.length + 1;
  let id = `rule-${index}`;
  while (rules.some((rule) => rule.id === id)) {
    index += 1;
    id = `rule-${index}`;
  }
  return id;
}

export async function probeProviderDeepLinkPayload(payload: ProviderDeepLinkPayload): Promise<GatewayProviderProbeResult | undefined> {
  if (!window.ccr || !shouldAutoProbeProviderBaseUrl(payload.baseUrl)) {
    return undefined;
  }

  const apiKey = payload.apiKey?.trim();
  try {
    return await window.ccr.probeProvider({
      apiKey: apiKey || undefined,
      baseUrl: payload.baseUrl,
      mode: apiKey ? "models" : "protocols",
      models: apiKey ? [] : payload.models,
      protocols: payload.protocol ? [payload.protocol] : providerProtocolOptions.map((option) => option.value)
    });
  } catch {
    return undefined;
  }
}

export type ProviderDeepLinkIconResolution = {
  displayIcon?: string;
  persistentIcon?: string;
  preset?: ProviderPreset;
};

export function resolveProviderDeepLinkPreset(payload: ProviderDeepLinkPayload): ProviderPreset | undefined {
  const baseUrlPreset = findProviderPresetByBaseUrl(payload.baseUrl);
  if (baseUrlPreset) {
    return baseUrlPreset;
  }

  const identityPreset = findProviderPresetByIdentity(payload.name);
  if (!identityPreset) {
    return undefined;
  }

  const identityIssue = providerIdentitySafetyIssue({
    baseUrl: payload.baseUrl,
    name: payload.name,
    presetId: identityPreset.id
  });
  return identityIssue ? undefined : identityPreset;
}

export function providerDeepLinkDisplayIcon(payload: ProviderDeepLinkPayload): string {
  const preset = resolveProviderDeepLinkPreset(payload);
  const presetIcon = preset ? providerPresetIconUrls[preset.id] ?? "" : "";
  return presetIcon || payload.icon?.trim() || "";
}

export function providerDisplayIcon(provider: GatewayProviderConfig): string {
  const icon = provider.icon?.trim();
  if (icon) {
    return icon;
  }

  const preset = findProviderPresetByBaseUrl(providerBaseUrl(provider));
  return preset ? providerPresetIconUrls[preset.id] ?? "" : "";
}

export type ProviderDeepLinkCatalogModelsResolution = {
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
};

export async function resolveProviderDeepLinkCatalogModels(payload: ProviderDeepLinkPayload): Promise<ProviderDeepLinkCatalogModelsResolution> {
  const ccr = window.ccr;
  if (!ccr?.getProviderCatalogModels) {
    return {
      models: []
    };
  }

  const preset = resolveProviderDeepLinkPreset(payload);
  try {
    const result = await ccr.getProviderCatalogModels({
      baseUrl: payload.baseUrl,
      name: payload.name,
      providerPresetId: preset?.id
    });
    return {
      modelDisplayNames: mergeModelDisplayNames(result.modelDisplayNames),
      modelMetadata: modelMetadataForModels(result.modelMetadata, result.models),
      models: mergeProviderModelLists(result.models)
    };
  } catch {
    return {
      models: []
    };
  }
}

function providerPresetModelDisplayNames(preset: ProviderPreset | undefined): Record<string, string> | undefined {
  const entries = Object.entries(preset?.defaultModelDisplayNames ?? {})
    .map(([model, displayName]) => [model.trim(), displayName.trim()] as const)
    .filter(([model, displayName]) => model && displayName && model !== displayName);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export async function resolveProviderDeepLinkIcon(payload: ProviderDeepLinkPayload): Promise<ProviderDeepLinkIconResolution> {
  const existingIcon = payload.icon?.trim();
  const preset = resolveProviderDeepLinkPreset(payload);
  const presetIcon = preset ? providerPresetIconUrls[preset.id] ?? "" : "";
  if (existingIcon || presetIcon) {
    return {
      displayIcon: presetIcon || existingIcon || undefined,
      persistentIcon: existingIcon || undefined,
      preset
    };
  }

  const ccr = window.ccr;
  if (!ccr?.detectProviderIcon) {
    return {};
  }

  try {
    const result = await ccr.detectProviderIcon({ baseUrl: payload.baseUrl });
    const detectedIcon = result.icon?.trim();
    return {
      displayIcon: detectedIcon || undefined,
      persistentIcon: detectedIcon || undefined
    };
  } catch {
    return {};
  }
}

export function createProviderDraftFromDeepLinkPayload(
  payload: ProviderDeepLinkPayload,
  providers: GatewayProviderConfig[]
): AddProviderDraft {
  const baseUrl = payload.baseUrl.trim();
  const preset = resolveProviderDeepLinkPreset(payload);
  const endpoint = preset ? primaryProviderPresetEndpointFromPreset(preset) : undefined;
  const protocol = payload.protocol ?? endpoint?.protocols[0] ?? "openai_chat_completions";
  const accountDraft = createProviderAccountDraftFromConfig(payload.account ?? defaultProviderAccountConfigForBaseUrl(baseUrl));
  const models = mergeProviderModelLists(payload.models.length > 0 ? payload.models : preset?.defaultModels ?? []);
  const baseName = payload.name?.trim() || inferProviderNameFromBaseUrl(baseUrl);

  return {
    ...accountDraft,
    apiKey: payload.apiKey?.trim() || "",
    baseUrl,
    credentials: [],
    icon: payload.icon?.trim() || "",
    modelDescriptions: modelDescriptionsForModels(payload.modelDescriptions, models),
    modelDisplayNames: modelDisplayNamesForModels(
      mergeModelDisplayNames(providerPresetModelDisplayNames(preset), payload.modelDisplayNames),
      models
    ),
    modelMetadata: modelMetadataForModels(payload.modelMetadata, models),
    modelSearch: "",
    modelsText: models.join("\n"),
    name: uniqueProviderName(providers, baseName),
    presetId: preset?.id ?? customProviderPresetId,
    providerPlugins: [],
    protocol,
    selectedModels: [],
    selectedProtocols: uniqueProviderProtocols(preset?.endpoints.flatMap((item) => item.protocols) ?? [protocol])
  };
}

export function createProviderConfigFromDeepLink(
  payload: ProviderDeepLinkPayload,
  providers: GatewayProviderConfig[],
  probe: GatewayProviderProbeResult | undefined
): GatewayProviderConfig {
  const protocol = payload.protocol ?? probe?.detectedProtocol ?? "openai_chat_completions";
  const baseUrl = providerGlobalBaseUrlForProbe(payload.baseUrl, probe, [protocol]);
  const apiKey = payload.apiKey?.trim() || "";
  const models = apiKey && probe?.models.length
    ? mergeProviderModelLists(probe.models)
    : payload.models.length > 0
    ? mergeProviderModelLists(payload.models)
    : mergeProviderModelLists(probe?.models ?? []);
  if (models.length === 0) {
    throw new Error("Models are required. Ask the provider to include models=... in the link.");
  }

  const baseName = payload.name?.trim() || inferProviderNameFromBaseUrl(baseUrl);
  const name = uniqueProviderName(providers, baseName);
  const keySafetyIssue = providerApiKeySafetyIssue({ apiKey: payload.apiKey, baseUrl, name });
  if (keySafetyIssue) {
    throw new Error(keySafetyIssue.message);
  }
  const identityIssue = providerIdentitySafetyIssue({ baseUrl, name });
  if (identityIssue) {
    throw new Error(identityIssue.message);
  }
  const account = payload.account ?? probe?.account ?? defaultProviderAccountConfigForBaseUrl(baseUrl);
  const accountKeySafetyIssue = providerAccountApiKeySafetyIssue(account, {
    apiKey: payload.apiKey,
    baseUrl,
    providerName: name
  });
  if (accountKeySafetyIssue) {
    throw new Error(accountKeySafetyIssue.message);
  }

  const capabilities = providerCapabilitiesForProtocols(payload.baseUrl, [protocol], probe);

  return {
    account: cloneProviderAccountConfig(account),
    api_base_url: normalizeProviderBaseUrl(baseUrl),
    api_key: apiKey,
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    icon: payload.icon?.trim() || undefined,
    modelDescriptions: modelDescriptionsForModels(payload.modelDescriptions, models),
    modelDisplayNames: modelDisplayNamesForModels(mergeModelDisplayNames(payload.modelDisplayNames, probe?.modelDisplayNames), models),
    modelMetadata: modelMetadataForModels(mergeModelMetadata(payload.modelMetadata, probe?.modelMetadata), models),
    models,
    name,
    type: protocol
  };
}

export function inferProviderNameFromBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(providerUrlWithDefaultScheme(baseUrl));
    const host = url.hostname.replace(/^api\./i, "");
    return host || "provider";
  } catch {
    return "provider";
  }
}

export function createProviderDraft(providers: GatewayProviderConfig[]): AddProviderDraft {
  const accountDraft = createDefaultProviderAccountDraft();
  return {
    ...accountDraft,
    apiKey: "",
    baseUrl: "",
    credentials: [],
    icon: "",
    modelDescriptions: undefined,
    modelDisplayNames: undefined,
    modelMetadata: undefined,
    modelSearch: "",
    modelsText: "",
    name: uniqueProviderName(providers),
    presetId: "",
    providerPlugins: [],
    protocol: "openai_chat_completions",
    selectedModels: [],
    selectedProtocols: []
  };
}

export function createProviderDraftFromProvider(provider: GatewayProviderConfig): AddProviderDraft {
  const baseUrl = providerBaseUrl(provider);
  const preset = findProviderPresetByBaseUrl(baseUrl);
  const accountDraft = createProviderAccountDraftFromConfig(provider.account);
  const protocol = toProviderProtocol(provider.type) ?? toProviderProtocol(provider.provider) ?? "openai_chat_completions";
  return {
    ...accountDraft,
    apiKey: providerApiKey(provider),
    baseUrl,
    credentials: (provider.credentials ?? []).map(providerCredentialDraftFromConfig),
    icon: provider.icon ?? "",
    modelDescriptions: modelDescriptionsForModels(provider.modelDescriptions, provider.models),
    modelDisplayNames: modelDisplayNamesForModels(
      mergeModelDisplayNames(providerPresetModelDisplayNames(preset), provider.modelDisplayNames),
      provider.models
    ),
    modelMetadata: modelMetadataForModels(provider.modelMetadata, provider.models),
    modelSearch: "",
    modelsText: provider.models.join("\n"),
    name: provider.name,
    presetId: preset?.id ?? customProviderPresetId,
    providerPlugins: [],
    protocol,
    selectedModels: [],
    selectedProtocols: selectedProviderProtocolsFromCapabilities(provider.capabilities, protocol)
  };
}

export function createProviderCredentialDraft(index = 0): ProviderCredentialDraft {
  return {
    apiKey: "",
    enabled: true,
    id: "",
    limitsText: "",
    name: `Key ${index + 1}`,
    priority: "",
    weight: ""
  };
}

export function providerCredentialDraftFromConfig(credential: ProviderCredentialConfig, index: number): ProviderCredentialDraft {
  return {
    apiKey: credential.api_key || credential.apiKey || credential.apikey || "",
    enabled: credential.enabled !== false,
    id: credential.id ?? "",
    limitsText: credential.limits ? JSON.stringify(credential.limits, null, 2) : "",
    name: credential.name ?? credential.label ?? `Key ${index + 1}`,
    priority: credential.priority !== undefined ? String(credential.priority) : "",
    weight: credential.weight !== undefined ? String(credential.weight) : ""
  };
}

export function providerCredentialsFromDraft(draft: AddProviderDraft): ProviderCredentialConfig[] | string {
  const credentials: ProviderCredentialConfig[] = [];

  for (const [index, row] of draft.credentials.entries()) {
    const apiKey = row.apiKey.trim();
    const name = row.name.trim() || `Key ${index + 1}`;
    const hasAnyValue = Boolean(
      apiKey ||
      row.id.trim() ||
      row.name.trim() ||
      row.priority.trim() ||
      row.weight.trim() ||
      row.limitsText.trim()
    );
    if (!hasAnyValue) {
      continue;
    }
    if (!apiKey) {
      return "Provider credential rows require API keys.";
    }

    const priority = row.priority.trim() ? positiveInteger(row.priority) : undefined;
    if (row.priority.trim() && priority === undefined) {
      return "Provider credential priority must be a positive number.";
    }
    const weight = row.weight.trim() ? positiveInteger(row.weight) : undefined;
    if (row.weight.trim() && weight === undefined) {
      return "Provider credential weight must be a positive number.";
    }

    const limitsResult = providerCredentialLimitsFromText(row.limitsText);
    if (typeof limitsResult === "string") {
      return limitsResult;
    }

    credentials.push({
      api_key: apiKey,
      enabled: row.enabled,
      ...(row.id.trim() ? { id: row.id.trim() } : {}),
      name,
      ...(limitsResult ? { limits: limitsResult } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(weight !== undefined ? { weight } : {})
    });
  }

  return credentials;
}

export function providerCredentialDraftPatchFromJson(text: string): Partial<AddProviderDraft> | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return "Provider credential JSON is invalid.";
  }

  const container = Array.isArray(parsed) ? { credentials: parsed } : parsed;
  if (!isPlainRecord(container)) {
    return "Provider credential JSON must be an array or object.";
  }

  const rawCredentials = Array.isArray(container.credentials)
    ? container.credentials
    : Array.isArray(container.keys)
      ? container.keys
      : Array.isArray(container.apiKeys)
        ? container.apiKeys
        : [];
  const credentials = rawCredentials
    .map((item, index) => providerCredentialDraftFromUnknown(item, index))
    .filter((item): item is ProviderCredentialDraft => Boolean(item));
  if (credentials.length === 0) {
    return "Provider credential JSON did not contain any API keys.";
  }

  return {
    credentials
  };
}

export function providerCredentialImportExample(): string {
  return JSON.stringify({
    credentials: [
      {
        name: "Main key",
        api_key: "sk-..."
      },
      {
        name: "Backup key",
        api_key: "sk-..."
      }
    ]
  }, null, 2);
}

function providerCredentialDraftFromUnknown(value: unknown, index: number): ProviderCredentialDraft | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const apiKey =
    stringValue(value.api_key) ||
    stringValue(value.apiKey) ||
    stringValue(value.apikey) ||
    stringValue(value.key) ||
    stringValue(value.token);
  if (!apiKey) {
    return undefined;
  }
  const name = stringValue(value.name) || stringValue(value.label) || `Key ${index + 1}`;
  return {
    apiKey,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    id: stringValue(value.id) || "",
    limitsText: isPlainRecord(value.limits) ? JSON.stringify(value.limits, null, 2) : "",
    name,
    priority: numberDraftString(value.priority),
    weight: numberDraftString(value.weight)
  };
}

function providerCredentialLimitsFromText(value: string): ApiKeyLimitConfig | undefined | string {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isPlainRecord(parsed)) {
      return "Provider credential limits must be a JSON object.";
    }
    return normalizeApiKeyLimits(parsed);
  } catch {
    return "Provider credential limits JSON is invalid.";
  }
}

function numberDraftString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return stringValue(value) || "";
}

export function parseProviderAccountDraft(draft: AddProviderDraft): GatewayProviderConfig["account"] | string | undefined {
  const refreshIntervalMs = positiveInteger(draft.accountRefreshIntervalMs);
  if (!draft.accountEnabled) {
    return undefined;
  }

  if (draft.accountMode === "standard") {
    return {
      connectors: cloneProviderAccountConnectors(standardProviderAccountConfig.connectors ?? []),
      enabled: true,
      refreshIntervalMs: refreshIntervalMs && refreshIntervalMs > 0 ? refreshIntervalMs : undefined
    };
  }

  if (draft.accountMode === "http-json" || draft.usageRequestUrl.trim()) {
    const connector = providerHttpJsonConnectorFromDraft(draft);
    if (typeof connector === "string") {
      return connector;
    }
    return {
      connectors: [connector],
      enabled: true,
      refreshIntervalMs: refreshIntervalMs && refreshIntervalMs > 0 ? refreshIntervalMs : undefined
    };
  }

  let connectors: unknown;
  try {
    connectors = JSON.parse(draft.accountConnectorsText.trim() || "[]");
  } catch (error) {
    return `Account connectors JSON is invalid: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (!Array.isArray(connectors)) {
    return "Account connectors must be a JSON array.";
  }
  if (connectors.length === 0) {
    return "Add at least one account connector or disable account balance.";
  }

  return {
    connectors: connectors as ProviderAccountConnectorConfig[],
    enabled: true,
    refreshIntervalMs: refreshIntervalMs && refreshIntervalMs > 0 ? refreshIntervalMs : undefined
  };
}

export function createDefaultProviderAccountDraft(): Pick<
  AddProviderDraft,
  | "accountConnectorsText"
  | "accountEnabled"
  | "accountMode"
  | "accountRefreshIntervalMs"
  | "usageBalanceLimitPath"
  | "usageBalanceRemainingPath"
  | "usageBalanceUnit"
  | "usageBalanceUsedPath"
  | "usageMessagePath"
  | "usageRequestBodyText"
  | "usageRequestHeaders"
  | "usageRequestMethod"
  | "usageRequestUrl"
  | "usageStatusPath"
  | "usageSubscriptionLimitPath"
  | "usageSubscriptionRemainingPath"
  | "usageSubscriptionResetPath"
  | "usageSubscriptionUnit"
> {
  return {
    accountConnectorsText: JSON.stringify(defaultProviderAccountConfig.connectors ?? [], null, 2),
    accountEnabled: defaultProviderAccountConfig.enabled !== false,
    accountMode: "standard",
    accountRefreshIntervalMs: "",
    usageBalanceLimitPath: "",
    usageBalanceRemainingPath: "",
    usageBalanceUnit: "USD",
    usageBalanceUsedPath: "",
    usageMessagePath: "",
    usageRequestBodyText: "",
    usageRequestHeaders: [],
    usageRequestMethod: "GET",
    usageRequestUrl: "",
    usageStatusPath: "",
    usageSubscriptionLimitPath: "",
    usageSubscriptionRemainingPath: "",
    usageSubscriptionResetPath: "",
    usageSubscriptionUnit: "tokens"
  };
}

export function createProviderAccountDraftFromConfig(account: ProviderAccountConfig | undefined): ReturnType<typeof createDefaultProviderAccountDraft> {
  const base = createDefaultProviderAccountDraft();
  if (!account) {
    return base;
  }

  const connectors = account.connectors ?? [];
  const httpJsonConnector = connectors.length === 1 && connectors[0]?.type === "http-json"
    ? connectors[0] as ProviderAccountHttpJsonConnectorConfig
    : undefined;
  if (!httpJsonConnector) {
    return {
      ...base,
      accountConnectorsText: JSON.stringify(connectors, null, 2),
      accountEnabled: account.enabled === true,
      accountMode: connectors.length > 0 && !providerAccountConnectorsAreDefaultStandard(connectors) ? "raw" : "standard",
      accountRefreshIntervalMs: account.refreshIntervalMs ? String(account.refreshIntervalMs) : ""
    };
  }
  if (httpJsonConnector.parser) {
    return {
      ...base,
      accountConnectorsText: JSON.stringify(connectors, null, 2),
      accountEnabled: account.enabled === true,
      accountMode: "raw",
      accountRefreshIntervalMs: account.refreshIntervalMs ? String(account.refreshIntervalMs) : ""
    };
  }

  const balanceMeter = httpJsonConnector.mapping.meters.find((meter) => meter.kind === "balance" || meter.id === "balance");
  const subscriptionMeter = httpJsonConnector.mapping.meters.find((meter) =>
    meter.kind === "subscription" || meter.id === "subscription" || meter.kind === "quota" || meter.kind === "tokens" || meter.kind === "time_window"
  );

  return {
    ...base,
    accountConnectorsText: JSON.stringify(connectors, null, 2),
    accountEnabled: account.enabled === true,
    accountMode: "http-json",
    accountRefreshIntervalMs: account.refreshIntervalMs ? String(account.refreshIntervalMs) : "",
    usageBalanceLimitPath: stringValue(balanceMeter?.limit) || "",
    usageBalanceRemainingPath: stringValue(balanceMeter?.remaining) || "",
    usageBalanceUnit: stringValue(balanceMeter?.unit) || "USD",
    usageBalanceUsedPath: stringValue(balanceMeter?.used) || "",
    usageMessagePath: httpJsonConnector.mapping.message ?? "",
    usageRequestBodyText: httpJsonConnector.body === undefined ? "" : formatEditableJson(httpJsonConnector.body),
    usageRequestHeaders: keyValueRowsFromRecord(httpJsonConnector.headers ?? {}),
    usageRequestMethod: httpJsonConnector.method === "POST" ? "POST" : "GET",
    usageRequestUrl: httpJsonConnector.endpoint,
    usageStatusPath: httpJsonConnector.mapping.status ?? "",
    usageSubscriptionLimitPath: stringValue(subscriptionMeter?.limit) || "",
    usageSubscriptionRemainingPath: stringValue(subscriptionMeter?.remaining) || "",
    usageSubscriptionResetPath: stringValue(subscriptionMeter?.resetAt) || "",
    usageSubscriptionUnit: stringValue(subscriptionMeter?.unit) || "tokens"
  };
}

export function providerHttpJsonConnectorFromDraft(draft: AddProviderDraft, options: { requireMeters?: boolean } = { requireMeters: true }): ProviderAccountHttpJsonConnectorConfig | string {
  const endpoint = draft.usageRequestUrl.trim();
  if (!endpoint) {
    return "Usage request URL is required.";
  }
  if (!/^https?:\/\//i.test(endpoint)) {
    return "Usage request URL must use http or https.";
  }
  if (!validateKeyValueRows(draft.usageRequestHeaders)) {
    return "Header rows require keys.";
  }

  let body: unknown;
  if (draft.usageRequestBodyText.trim()) {
    try {
      body = JSON.parse(draft.usageRequestBodyText);
    } catch (error) {
      return `Usage request body JSON is invalid: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const meters: ProviderAccountHttpJsonConnectorConfig["mapping"]["meters"] = [];
  const balanceLimitPath = draft.usageBalanceLimitPath.trim();
  const balanceRemainingPath = draft.usageBalanceRemainingPath.trim();
  const balanceUsedPath = draft.usageBalanceUsedPath.trim();
  if (balanceLimitPath || balanceRemainingPath || balanceUsedPath) {
    meters.push({
      id: "balance",
      kind: "balance",
      label: "Balance",
      limit: balanceLimitPath || undefined,
      remaining: balanceRemainingPath || undefined,
      used: balanceUsedPath || undefined,
      unit: draft.usageBalanceUnit.trim() || "USD"
    });
  }
  if (draft.usageSubscriptionRemainingPath.trim() || draft.usageSubscriptionLimitPath.trim()) {
    meters.push({
      id: "subscription",
      kind: "subscription",
      label: "Subscription",
      limit: draft.usageSubscriptionLimitPath.trim() || undefined,
      remaining: draft.usageSubscriptionRemainingPath.trim() || undefined,
      resetAt: draft.usageSubscriptionResetPath.trim() || undefined,
      unit: draft.usageSubscriptionUnit.trim() || "tokens",
      window: "monthly"
    });
  }

  if (options.requireMeters !== false && meters.length === 0) {
    return "Select at least one usage response field.";
  }

  return {
    auth: "provider-api-key",
    ...(body !== undefined ? { body } : {}),
    endpoint,
    headers: recordFromKeyValueRows(draft.usageRequestHeaders),
    mapping: {
      ...(draft.usageMessagePath.trim() ? { message: draft.usageMessagePath.trim() } : {}),
      meters,
      ...(draft.usageStatusPath.trim() ? { status: draft.usageStatusPath.trim() } : {})
    },
    method: draft.usageRequestMethod,
    type: "http-json"
  };
}

export type ProviderApiKeyTargetSafetyInput = {
  apiKey?: string;
  baseUrl: string;
  providerName?: string;
  providerPresetId?: string;
};

export function providerAccountApiKeySafetyIssue(
  account: ProviderAccountConfig | undefined,
  input: ProviderApiKeyTargetSafetyInput
): ProviderIdentitySafetyIssue | undefined {
  for (const connector of account?.connectors ?? []) {
    const issue = providerAccountConnectorApiKeySafetyIssue(connector, input);
    if (issue) {
      return issue;
    }
  }
  return undefined;
}

export function providerAccountConnectorApiKeySafetyIssue(
  connector: ProviderAccountConnectorConfig,
  input: ProviderApiKeyTargetSafetyInput
): ProviderIdentitySafetyIssue | undefined {
  if (connector.type === "http-json") {
    const httpJsonConnector = connector as ProviderAccountHttpJsonConnectorConfig;
    if ((httpJsonConnector.auth ?? "provider-api-key") === "none") {
      return undefined;
    }
    return providerAccountEndpointApiKeySafetyIssue(httpJsonConnector.endpoint, input);
  }

  if (connector.type === "standard") {
    const standardConnector = connector as ProviderAccountStandardConnectorConfig;
    if ((standardConnector.auth ?? "provider-api-key") === "none") {
      return undefined;
    }
    const endpoints = [
      standardConnector.endpoint,
      ...(standardConnector.endpoints ?? [])
    ].filter((endpoint): endpoint is string => Boolean(endpoint?.trim()));
    for (const endpoint of endpoints) {
      const issue = providerAccountEndpointApiKeySafetyIssue(endpoint, input);
      if (issue) {
        return issue;
      }
    }
  }

  return undefined;
}

export function providerAccountEndpointApiKeySafetyIssue(
  endpoint: string,
  input: ProviderApiKeyTargetSafetyInput
): ProviderIdentitySafetyIssue | undefined {
  return providerEndpointCanReceiveProviderApiKey({
    apiKey: input.apiKey?.trim() || "provider-api-key",
    endpoint: absoluteProviderAccountEndpoint(input.baseUrl, endpoint),
    providerName: input.providerName,
    providerPresetId: findProviderPreset(input.providerPresetId)?.id ?? findProviderPresetByBaseUrl(input.baseUrl)?.id
  });
}

export function absoluteProviderAccountEndpoint(baseUrl: string, endpoint: string): string {
  const trimmedEndpoint = endpoint.trim();
  if (/^https?:\/\//i.test(trimmedEndpoint)) {
    return trimmedEndpoint;
  }
  if (!baseUrl.trim()) {
    return trimmedEndpoint;
  }
  try {
    const url = new URL(providerUrlWithDefaultScheme(normalizeProviderBaseUrl(baseUrl)));
    url.pathname = trimmedEndpoint.startsWith("/") ? trimmedEndpoint : joinProviderAccountPath(url.pathname, trimmedEndpoint);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return trimmedEndpoint;
  }
}

export function joinProviderAccountPath(basePath: string, suffix: string): string {
  const left = basePath.replace(/\/+$/, "");
  const right = suffix.replace(/^\/+/, "");
  if (!left) {
    return `/${right}`;
  }
  return `${left}/${right}`;
}

export function providerUsageFieldPatch(target: ProviderUsageFieldTarget, path: string): Partial<AddProviderDraft> {
  if (target === "balance") {
    return { usageBalanceRemainingPath: path };
  }
  if (target === "balanceLimit") {
    return { usageBalanceLimitPath: path };
  }
  if (target === "balanceUsed") {
    return { usageBalanceUsedPath: path };
  }
  if (target === "message") {
    return { usageMessagePath: path };
  }
  if (target === "status") {
    return { usageStatusPath: path };
  }
  if (target === "subscriptionLimit") {
    return { usageSubscriptionLimitPath: path };
  }
  if (target === "subscriptionRemaining") {
    return { usageSubscriptionRemainingPath: path };
  }
  return { usageSubscriptionResetPath: path };
}

export function createProviderInstallLinkFromDraft(draft: AddProviderDraft, probe: GatewayProviderProbeResult | undefined): string {
  const providerName = draft.name.trim();
  const selectedProtocols = uniqueProviderProtocols(draft.selectedProtocols);
  const protocol = selectedProtocols.includes(draft.protocol)
    ? draft.protocol
    : selectedProtocols.length === 1
    ? selectedProtocols[0]
    : probe?.detectedProtocol ?? draft.protocol;
  const baseUrl = providerGlobalBaseUrlForProbe(draft.baseUrl, probe, selectedProtocols.length > 0 ? selectedProtocols : [protocol]);
  const models = mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText));
  if (!providerName || !baseUrl) {
    return "Provider name and Base URL are required.";
  }
  if (models.length === 0) {
    return "Select or enter at least one model.";
  }
  const keySafetyIssue = providerApiKeySafetyIssue({
    apiKey: draft.apiKey,
    baseUrl,
    name: providerName,
    presetId: draft.presetId
  });
  if (keySafetyIssue) {
    return keySafetyIssue.message;
  }
  const identityIssue = providerIdentitySafetyIssue({
    baseUrl,
    name: providerName,
    presetId: draft.presetId
  });
  if (identityIssue) {
    return identityIssue.message;
  }

  const account = parseProviderAccountDraft(draft);
  if (typeof account === "string") {
    return account;
  }
  const accountKeySafetyIssue = providerAccountApiKeySafetyIssue(account, {
    apiKey: draft.apiKey,
    baseUrl,
    providerName,
    providerPresetId: draft.presetId
  });
  if (accountKeySafetyIssue) {
    return accountKeySafetyIssue.message;
  }

  const modelDescriptions = modelDescriptionsForModels(draft.modelDescriptions, models);
  const modelDisplayNames = modelDisplayNamesForModels(draft.modelDisplayNames, models);
  const modelMetadata = modelMetadataForModels(draft.modelMetadata, models);
  const payload: ProviderDeepLinkPayload = {
    ...(account ? { account } : {}),
    baseUrl,
    ...(draft.icon.trim() ? { icon: draft.icon.trim() } : {}),
    ...(modelDescriptions ? { modelDescriptions } : {}),
    ...(modelDisplayNames ? { modelDisplayNames } : {}),
    ...(modelMetadata ? { modelMetadata } : {}),
    models,
    name: providerName,
    protocol
  };
  return `ccr://provider?payload=${base64UrlEncodeText(JSON.stringify(payload))}`;
}

export function base64UrlEncodeText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function providerAccountConnectorsAreDefaultStandard(connectors: ProviderAccountConnectorConfig[]): boolean {
  return connectors.length === 1 && connectors[0]?.type === "standard";
}

export function cloneProviderAccountConfig(account: ProviderAccountConfig | undefined): ProviderAccountConfig | undefined {
  return account ? JSON.parse(JSON.stringify(account)) as ProviderAccountConfig : undefined;
}

export function cloneProviderAccountConnectors(connectors: ProviderAccountConnectorConfig[]): ProviderAccountConnectorConfig[] {
  return JSON.parse(JSON.stringify(connectors)) as ProviderAccountConnectorConfig[];
}

export function defaultProviderAccountConfigForPreset(presetId: string | undefined): ProviderAccountConfig | undefined {
  if (presetId === "kimi-coding") {
    return cloneProviderAccountConfig(findProviderPreset(presetId)?.account ?? defaultProviderAccountConfig);
  }
  // Keep the advanced settings default on the standard endpoint; main resolves preset-specific connectors at runtime.
  return cloneProviderAccountConfig(defaultProviderAccountConfig);
}

export function defaultProviderAccountConfigForBaseUrl(baseUrl: string): ProviderAccountConfig | undefined {
  return cloneProviderAccountConfig(findProviderPresetByBaseUrl(baseUrl)?.account ?? defaultProviderAccountConfig);
}

export function providerAccountConnectorExample(): string {
  return JSON.stringify([
    {
      type: "standard",
      auth: "provider-api-key"
    },
    {
      type: "http-json",
      endpoint: "https://api.vendor.com/account",
      auth: "provider-api-key",
      mapping: {
        meters: [
          {
            id: "balance",
            label: "Balance",
            kind: "balance",
            unit: "USD",
            remaining: "$.balance.remaining"
          }
        ]
      }
    },
    {
      type: "plugin",
      pluginId: "vendor-plugin",
      connectorId: "account"
    },
    {
      type: "local-estimate",
      windows: [
        {
          id: "weekly",
          label: "Weekly estimate",
          unit: "tokens",
          limit: 1000000,
          window: "weekly"
        }
      ]
    }
  ], null, 2);
}

export function providerAccountConnectorsTextWithNewApiUserBalanceTemplate(connectorsText: string, baseUrl: string, userId: string): string {
  const connector = newApiUserSelfConnectorConfig(baseUrl.trim() || "https://new-api.example/v1");
  connector.headers = {
    ...(connector.headers ?? {}),
    "New-Api-User": userId.trim() || "<user-id>"
  };

  let connectors: unknown[] = [];
  try {
    const parsed = JSON.parse(connectorsText.trim() || "[]") as unknown;
    connectors = Array.isArray(parsed) ? parsed : [];
  } catch {
    connectors = [];
  }

  return JSON.stringify([
    ...connectors.filter((item) => !isNewApiUserSelfConnector(item)),
    connector
  ], null, 2);
}

function isNewApiUserSelfConnector(value: unknown): boolean {
  return isPlainRecord(value) && value.type === "http-json" && value.parser === "new-api-user-self";
}

export function toProviderProtocol(value: string | undefined): GatewayProviderProtocol | undefined {
  return providerProtocolOptions.some((option) => option.value === value) ? value as GatewayProviderProtocol : undefined;
}

export function shouldAutoProbeProviderBaseUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
    const url = new URL(hasScheme ? trimmed : providerUrlWithDefaultScheme(trimmed));
    return hasScheme || url.hostname === "localhost" || url.hostname.includes(".") || url.hostname.includes(":");
  } catch {
    return false;
  }
}

export function providerDraftSafetyIssue(draft: AddProviderDraft, baseUrl = draft.baseUrl): ProviderIdentitySafetyIssue | undefined {
  const targetBaseUrl = baseUrl.trim();
  if (!targetBaseUrl) {
    return undefined;
  }
  const issue = providerApiKeySafetyIssue({
    apiKey: draft.apiKey,
    baseUrl: targetBaseUrl,
    name: draft.name,
    presetId: draft.presetId
  });
  if (issue) {
    return issue;
  }

  const account = parseProviderAccountDraft(draft);
  if (typeof account === "string") {
    return undefined;
  }
  return providerAccountApiKeySafetyIssue(account, {
    apiKey: draft.apiKey,
    baseUrl: targetBaseUrl,
    providerName: draft.name,
    providerPresetId: draft.presetId
  });
}

export function providerProbeCandidates(draft: AddProviderDraft): ProviderProbeCandidate[] {
  const preset = findProviderPreset(draft.presetId);
  const protocols = providerProtocolOptions.map((option) => option.value);
  if (preset) {
    return preset.endpoints.map((endpoint) => ({
      ...endpoint,
      declaredProtocols: endpoint.protocols,
      protocols,
      source: "preset"
    }));
  }

  return [
    {
      baseUrl: draft.baseUrl.trim(),
      protocols,
      source: "custom"
    }
  ];
}

export function isProviderProbeCandidateReady(candidate: ProviderProbeCandidate): boolean {
  return shouldAutoProbeProviderBaseUrl(candidate.baseUrl);
}

export function providerProbeCandidatesApiKeySafetyIssue(
  candidates: ProviderProbeCandidate[],
  apiKey: string,
  providerName: string,
  presetId: string
): ProviderIdentitySafetyIssue | undefined {
  for (const candidate of candidates) {
    const issue = providerApiKeySafetyIssue({
      apiKey,
      baseUrl: candidate.baseUrl,
      name: providerName,
      presetId
    });
    if (issue) {
      return issue;
    }
  }
  return undefined;
}

export function providerProbeInputKey(candidates: ProviderProbeCandidate[], apiKey: string, models: string[]): string {
  return JSON.stringify([
    candidates.map((candidate) => [candidate.baseUrl, candidate.protocols]),
    apiKey,
    models
  ]);
}

export async function probeProviderCandidates(
  candidates: ProviderProbeCandidate[],
  apiKey: string,
  models: string[],
  options: {
    mode?: "connectivity" | "models" | "protocols";
    protocols?: GatewayProviderProtocol[];
  } = {}
): Promise<ProviderProbeCandidateResult | undefined> {
  const mode = options.mode ?? "protocols";
  return await window.ccr?.probeProviderCandidates({
    apiKey: mode === "connectivity" || mode === "models" ? apiKey : undefined,
    candidates,
    mode,
    models: mode === "connectivity" ? models : [],
    protocols: options.protocols
  });
}

export function providerProbeHasSupportedProtocol(probe: GatewayProviderProbeResult | undefined, protocol?: GatewayProviderProtocol): boolean {
  return Boolean(probe?.protocols.some((item) => item.supported && (!protocol || item.protocol === protocol)));
}

export function presetCapabilitiesFromDraft(draft: AddProviderDraft): GatewayProviderCapability[] {
  const preset = findProviderPreset(draft.presetId);
  if (!preset) {
    return [];
  }

  return preset.endpoints.flatMap((endpoint) =>
    endpoint.protocols.map((type) => ({
      baseUrl: endpoint.baseUrl,
      source: "preset" as const,
      type
    }))
  );
}

export function providerSelectableProtocolsFromProbe(probe: GatewayProviderProbeResult | undefined): GatewayProviderProtocol[] {
  if (!probe) {
    return [];
  }

  return uniqueProviderProtocols([
    ...probe.protocols.filter((item) => item.supported).map((item) => item.protocol),
    ...(probe.capabilities ?? []).map((capability) => capability.type)
  ]);
}

export function selectedProviderProtocolsFromCapabilities(
  capabilities: GatewayProviderCapability[] | undefined,
  fallback: GatewayProviderProtocol
): GatewayProviderProtocol[] {
  const selected = uniqueProviderProtocols((capabilities ?? []).map((capability) => capability.type));
  return selected.length > 0 ? selected : [fallback];
}

export function selectedProviderProtocolsForProbe(
  selectedProtocols: GatewayProviderProtocol[],
  probe: GatewayProviderProbeResult,
  fallback: GatewayProviderProtocol,
  presetId?: string
): GatewayProviderProtocol[] {
  const selectable = providerSelectableProtocolsFromProbe(probe);
  if (selectable.length === 0) {
    return [];
  }

  if (selectedProtocolsMatchPresetDefault(selectedProtocols, presetId)) {
    return selectable;
  }

  const selected = uniqueProviderProtocols(selectedProtocols).filter((protocol) => selectable.includes(protocol));
  return selected.length > 0 ? selected : selectable;
}

function selectedProtocolsMatchPresetDefault(
  selectedProtocols: GatewayProviderProtocol[],
  presetId: string | undefined
): boolean {
  const preset = findProviderPreset(presetId);
  if (!preset) {
    return false;
  }

  const selected = uniqueProviderProtocols(selectedProtocols);
  const defaults = uniqueProviderProtocols(preset.endpoints.flatMap((endpoint) => endpoint.protocols));
  return defaults.length > 0 &&
    selected.length === defaults.length &&
    defaults.every((protocol, index) => selected[index] === protocol);
}

export function uniqueProviderProtocols(values: Array<GatewayProviderProtocol | string | undefined>): GatewayProviderProtocol[] {
  const allowed = new Set(providerProtocolOptions.map((option) => option.value));
  const seen = new Set<GatewayProviderProtocol>();
  const selected: GatewayProviderProtocol[] = [];

  for (const value of values) {
    if (!value || !allowed.has(value as GatewayProviderProtocol)) {
      continue;
    }
    const protocol = value as GatewayProviderProtocol;
    if (seen.has(protocol)) {
      continue;
    }
    seen.add(protocol);
    selected.push(protocol);
  }

  return providerProtocolOptions
    .map((option) => option.value)
    .filter((protocol) => seen.has(protocol) && selected.includes(protocol));
}

export function mergeProviderCapabilities(...groups: GatewayProviderCapability[][]): GatewayProviderCapability[] {
  const seen = new Set<string>();
  const capabilities: GatewayProviderCapability[] = [];
  for (const group of groups) {
    for (const capability of group) {
      const baseUrl = capability.baseUrl.trim();
      if (!baseUrl) {
        continue;
      }
      const key = `${capability.type}\n${baseUrl}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      capabilities.push({
        ...capability,
        baseUrl
      });
    }
  }
  return capabilities;
}

export function providerGlobalBaseUrlForProbe(
  inputBaseUrl: string,
  _probe: GatewayProviderProbeResult | undefined,
  _protocols: GatewayProviderProtocol[] = []
): string {
  return normalizeProviderBaseUrl(inputBaseUrl) || inputBaseUrl.trim();
}

export function providerCapabilityBaseUrlForProtocol(
  inputBaseUrl: string,
  protocol: GatewayProviderProtocol,
  probe: GatewayProviderProbeResult | undefined
): string {
  const detectedCapability = (probe?.capabilities ?? []).find((capability) =>
    capability.type === protocol && capability.baseUrl.trim()
  );
  if (detectedCapability) {
    return detectedCapability.baseUrl.trim();
  }

  if (probe?.detectedProtocol === protocol && probe.normalizedBaseUrl.trim()) {
    return probe.normalizedBaseUrl.trim();
  }

  return normalizeProviderBaseUrl(inputBaseUrl, protocol) || normalizeProviderBaseUrl(inputBaseUrl) || inputBaseUrl.trim();
}

export function providerCapabilitiesForProtocols(
  inputBaseUrl: string,
  protocols: GatewayProviderProtocol[],
  probe: GatewayProviderProbeResult | undefined,
  presetCapabilities: GatewayProviderCapability[] = []
): GatewayProviderCapability[] {
  const detectedCapabilities = probe?.capabilities ?? [];
  const selectedCapabilities = uniqueProviderProtocols(protocols)
    .map((type) => {
      const capability =
        detectedCapabilities.find((item) => item.type === type && item.baseUrl.trim()) ??
        presetCapabilities.find((item) => item.type === type && item.baseUrl.trim());
      if (capability) {
        return capability;
      }

      const baseUrl = providerCapabilityBaseUrlForProtocol(inputBaseUrl, type, probe);
      return baseUrl
        ? {
            baseUrl,
            source: probe?.detectedProtocol ? ("detected" as const) : ("preset" as const),
            type
          }
        : undefined;
    })
    .filter((item): item is GatewayProviderCapability => Boolean(item));

  return mergeProviderCapabilities(selectedCapabilities);
}

export function applyProviderProbeResult(draft: AddProviderDraft, probe: GatewayProviderProbeResult): AddProviderDraft {
  const detectedProtocol = probe.detectedProtocol ?? draft.protocol;
  const selectedProtocols = selectedProviderProtocolsForProbe(draft.selectedProtocols, probe, detectedProtocol, draft.presetId);
  const protocol = selectedProtocols.includes(draft.protocol)
    ? draft.protocol
    : selectedProtocols.includes(detectedProtocol)
    ? detectedProtocol
    : selectedProtocols[0] ?? detectedProtocol;
  const modelDisplayNames = mergeModelDisplayNames(draft.modelDisplayNames, probe.modelDisplayNames);
  const modelMetadata = mergeModelMetadata(draft.modelMetadata, probe.modelMetadata);
  const accountDraft = providerProbeAccountDraftPatch(draft, probe.account);
  const baseUrl = providerGlobalBaseUrlForProbe(draft.baseUrl, probe, selectedProtocols);

  if (probe.models.length === 0) {
    return {
      ...draft,
      ...accountDraft,
      baseUrl,
      modelDisplayNames,
      modelMetadata,
      protocol,
      selectedModels: mergeProviderModelLists(draft.selectedModels),
      selectedProtocols
    };
  }

  const detectedModels = new Set(probe.models);
  const typedModels = splitLines(draft.modelsText);
  const selectedCatalogModels = draft.selectedModels.filter((model) => detectedModels.has(model));
  const selectedCustomModels = draft.selectedModels.filter((model) => !detectedModels.has(model));
  const typedCatalogModels = typedModels.filter((model) => detectedModels.has(model));
  const typedCustomModels = typedModels.filter((model) => !detectedModels.has(model));
  const selectedModels = mergeProviderModelLists(selectedCatalogModels, typedCatalogModels);
  const customModels = mergeProviderModelLists(selectedCustomModels, typedCustomModels);
  const nextSelectedModels = selectedModels.length > 0 || customModels.length > 0
    ? selectedModels
    : pickRecommendedProviderModels(probe.models, probe.detectedProtocol);

  return {
    ...draft,
    ...accountDraft,
    baseUrl,
    modelDisplayNames,
    modelMetadata,
    protocol,
    modelsText: customModels.join("\n"),
    selectedModels: nextSelectedModels,
    selectedProtocols
  };
}

function providerProbeAccountDraftPatch(
  draft: AddProviderDraft,
  account: ProviderAccountConfig | undefined
): Partial<AddProviderDraft> {
  if (!account || (draft.accountEnabled && draft.accountMode !== "standard")) {
    return {};
  }
  return createProviderAccountDraftFromConfig(account);
}

export function mergeModelDisplayNames(
  ...groups: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
  const merged: Record<string, string> = {};
  for (const group of groups) {
    for (const [rawModel, rawDisplayName] of Object.entries(group ?? {})) {
      const model = rawModel.trim();
      const displayName = rawDisplayName.trim();
      if (!model || !displayName || model === displayName) {
        continue;
      }
      merged[model] = displayName;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function mergeModelMetadata(
  ...groups: Array<Record<string, ProviderModelMetadata> | undefined>
): Record<string, ProviderModelMetadata> | undefined {
  const merged: Record<string, ProviderModelMetadata> = {};
  for (const group of groups) {
    for (const [rawModel, metadata] of Object.entries(group ?? {})) {
      const model = rawModel.trim();
      if (!model || !metadata || typeof metadata !== "object") {
        continue;
      }
      merged[model] = metadata;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function modelMetadataForModels(
  value: Record<string, ProviderModelMetadata> | undefined,
  models: string[]
): Record<string, ProviderModelMetadata> | undefined {
  const modelIds = new Set(models);
  const entries = Object.entries(value ?? {})
    .map(([rawModel, metadata]) => [rawModel.trim(), metadata] as const)
    .filter(([model, metadata]) => model && modelIds.has(model) && metadata && typeof metadata === "object");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function modelDisplayNamesForModels(
  value: Record<string, string> | undefined,
  models: string[]
): Record<string, string> | undefined {
  const modelIds = new Set(models);
  const entries = Object.entries(value ?? {})
    .map(([rawModel, rawDisplayName]) => [rawModel.trim(), rawDisplayName.trim()] as const)
    .filter(([model, displayName]) => model && displayName && model !== displayName && modelIds.has(model));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function modelDescriptionsForModels(
  value: Record<string, string> | undefined,
  models: string[]
): Record<string, string> | undefined {
  const modelIds = new Set(models);
  const entries = Object.entries(value ?? {})
    .map(([rawModel, rawDescription]) => [rawModel.trim(), rawDescription.trim()] as const)
    .filter(([model, description]) => model && description && modelIds.has(model));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function providerModelDisplayName(provider: GatewayProviderConfig, model: string): string {
  return provider.modelDisplayNames?.[model]?.trim() || model;
}

export function providerModelDisplayTitle(provider: GatewayProviderConfig, model: string): string {
  return providerModelDisplayName(provider, model);
}

export function pickRecommendedProviderModels(models: string[], protocol?: GatewayProviderProtocol): string[] {
  const candidates = mergeProviderModelLists(models);
  if (candidates.length === 0) {
    return [];
  }

  const preferred = candidates.find((model) => recommendedModelRank(model, protocol) === 0) ??
    candidates
      .map((model) => ({ model, rank: recommendedModelRank(model, protocol) }))
      .sort((left, right) => left.rank - right.rank)[0]?.model;

  return preferred ? [preferred] : [candidates[0]];
}

export function recommendedModelRank(model: string, protocol?: GatewayProviderProtocol): number {
  const normalized = model.toLowerCase();
  if (protocol === "anthropic_messages" || normalized.includes("claude")) {
    if (normalized.includes("sonnet")) return 0;
    if (normalized.includes("opus")) return 1;
    if (normalized.includes("haiku")) return 2;
  }
  if (protocol === "gemini_generate_content" || protocol === "gemini_interactions" || normalized.includes("gemini")) {
    if (normalized.includes("pro")) return 0;
    if (normalized.includes("flash")) return 1;
  }
  if (/gpt-4|gpt-5|o3|o4/.test(normalized)) return 0;
  if (/deepseek-chat|qwen|max|kimi|mistral-large|llama/.test(normalized)) return 1;
  return 5;
}

export function mergeProviderModelLists(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const models: string[] = [];
  for (const group of groups) {
    for (const model of group) {
      const trimmed = model.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      models.push(trimmed);
    }
  }
  return models;
}

export function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitModelTagInput(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function providerBaseUrl(provider: GatewayProviderConfig): string {
  return provider.api_base_url || provider.baseurl || provider.baseUrl || "";
}

export function providerApiKey(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || "";
}

export function providerCapabilitiesSummary(provider: GatewayProviderConfig, translate: (value: string) => string = (value) => value): string {
  const capabilities = provider.capabilities ?? [];
  if (capabilities.length === 0) {
    return translatedProviderProtocolLabel(toProviderProtocol(provider.type) ?? toProviderProtocol(provider.provider) ?? "openai_chat_completions", translate);
  }
  return capabilities.map((capability) => translatedProviderProtocolLabel(capability.type, translate)).join(", ");
}

export function providerListItemKey(provider: GatewayProviderConfig, index: number): string {
  return provider.id || `${index}:${provider.name || "provider"}`;
}

export function providerMatchesQuery(provider: GatewayProviderConfig, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    provider.name,
    providerBaseUrl(provider),
    providerCapabilitiesSummary(provider),
    ...(provider.capabilities ?? []).map((capability) => capability.baseUrl),
    ...provider.models,
    ...provider.models.map((model) => providerModelDisplayName(provider, model))
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(query));
}

export function viewUsesInternalScroll(view: ViewId): boolean {
  return view === "observability" || view === "api-keys" || view === "profile" || view === "networking" || view === "logs" || view === "providers" || view === "models" || view === "routing" || view === "virtual-models" || view === "extensions";
}

export function uniqueProviderName(providers: GatewayProviderConfig[], baseName = "provider"): string {
  const trimmedBaseName = baseName.trim();
  if (trimmedBaseName && trimmedBaseName !== "provider") {
    let candidate = trimmedBaseName;
    let index = 2;
    while (providers.some((provider) => providerNameEquals(provider.name, candidate))) {
      candidate = `${trimmedBaseName} ${index}`;
      index += 1;
    }
    return candidate;
  }

  let index = providers.length + 1;
  while (providers.some((provider) => providerNameEquals(provider.name, `provider-${index}`))) {
    index += 1;
  }
  return `provider-${index}`;
}

export function isProviderNameDuplicate(providers: GatewayProviderConfig[], name: string, ignoreIndex?: number): boolean {
  return providers.some((provider, index) => index !== ignoreIndex && providerNameEquals(provider.name, name));
}

export function providerNameEquals(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function providerProtocolLabel(protocol: GatewayProviderProtocol | string): string {
  return providerProtocolOptions.find((option) => option.value === protocol)?.label ?? String(protocol);
}

export function translatedProviderProtocolLabel(protocol: GatewayProviderProtocol | string, translate: (value: string) => string): string {
  return translate(providerProtocolLabel(protocol));
}

export function translateProbeProtocolMessage(message: string | undefined, translate: (value: string) => string): string {
  const trimmed = message?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  if (isProbeAuthorizationMissingMessage(trimmed)) {
    return "";
  }

  const httpMatch = /^HTTP\s+(\d{3})(?::\s*(.*))?$/i.exec(trimmed);
  if (!httpMatch) {
    return translate(trimmed);
  }

  const status = httpMatch[1];
  const detail = httpMatch[2]?.trim();
  return detail ? `HTTP ${status}: ${translate(detail)}` : `HTTP ${status}`;
}

function isProbeAuthorizationMissingMessage(message: string): boolean {
  const normalized = message
    .trim()
    .replace(/[。.\s]+$/g, "")
    .toLowerCase();
  const match = /^http\s+401\s*:\s*(.*)$/i.exec(normalized);
  const detail = match?.[1] ?? normalized;
  return detail.includes("header中未收到authorization参数") && detail.includes("无法进行身份验证");
}
