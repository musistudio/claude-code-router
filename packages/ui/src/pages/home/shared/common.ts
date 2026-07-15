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


import { positiveInteger } from "./api-keys";
import type { MetricTone } from "./controls";
import type { AppLanguagePreference, ResolvedLanguage, ResolvedTheme } from "./types";

export function cloneConfig(config: AppConfig): AppConfig {
  return JSON.parse(JSON.stringify(config)) as AppConfig;
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeProviderModelSelector(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : trimmed;
  }
  return trimmed;
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

export function isMacPlatform(platform: string): boolean {
  const normalized = platform.toLowerCase();
  return normalized === "darwin" || normalized.includes("mac");
}

export function isTraySupportedPlatform(platform: string): boolean {
  const normalized = platform.toLowerCase();
  return isMacPlatform(normalized) || normalized === "win32" || normalized.includes("windows");
}

export function readLanguagePreference(): AppLanguagePreference {
  try {
    return normalizeLanguagePreference(window.localStorage.getItem(languagePreferenceStorageKey));
  } catch {
    return "system";
  }
}

export function persistLanguagePreference(language: AppLanguagePreference) {
  try {
    if (language === "system") {
      window.localStorage.removeItem(languagePreferenceStorageKey);
      return;
    }
    window.localStorage.setItem(languagePreferenceStorageKey, language);
  } catch {
    // Language preference is a UI enhancement; ignore unavailable storage.
  }
}

export function detectSystemLanguage(): ResolvedLanguage {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

export function detectSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function normalizeLanguagePreference(value: unknown): AppLanguagePreference {
  return value === "en" || value === "zh" || value === "system" ? value : "system";
}

export function normalizeThemePreference(value: unknown): AppConfig["theme"] {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function normalizeTrayIconPreference(value: unknown): AppConfig["trayIcon"] {
  return value === "random" || value === "violet" || value === "orange" || value === "cyan" || value === "progress"
    ? value
    : "random";
}

export function normalizeTrayBalanceProgressConfig(value: unknown): TrayBalanceProgressConfig | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const provider = typeof value.provider === "string" ? value.provider.trim() : "";
  const meterId = typeof value.meterId === "string" ? value.meterId.trim() : "";
  return provider && meterId ? { meterId, provider } : undefined;
}

export function normalizeTrayProgressTargetTokens(value: unknown): number {
  return Math.min(1_000_000_000, Math.max(1000, positiveInteger(value) ?? 100000));
}

export function normalizeTrayComponentVariants(value: unknown): TrayComponentVariants {
  const record = isPlainRecord(value) ? value : {};
  return {
    account: normalizeEnumValue(record.account, ["bar", "compact", "ring", "arc", "stacked"], DEFAULT_TRAY_COMPONENT_VARIANTS.account),
    modelShare: normalizeEnumValue(record.modelShare, ["bars", "list", "donut", "pie"], DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare),
    rings: normalizeEnumValue(record.rings, ["rings", "arcs", "gauges"], DEFAULT_TRAY_COMPONENT_VARIANTS.rings),
    stats: normalizeEnumValue(record.stats, ["cards", "compact", "pills"], DEFAULT_TRAY_COMPONENT_VARIANTS.stats),
    tokenFlow: normalizeEnumValue(record.tokenFlow, ["line", "area", "bar", "sparkline"], DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow),
    tokenMix: normalizeEnumValue(record.tokenMix, ["bars", "stacked", "donut", "pie"], DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix)
  };
}

export function normalizeTrayWidgets(value: unknown, fallbackModules?: unknown, fallbackVariants?: unknown): TrayWidgetConfig[] {
  if (!Array.isArray(value)) {
    return orderTrayWidgetsForLayout(dedupeTraySingletonWidgets(trayWidgetsFromModules(normalizeTrayWindowModules(fallbackModules), normalizeTrayComponentVariants(fallbackVariants))));
  }
  return orderTrayWidgetsForLayout(dedupeTraySingletonWidgets(value
    .map(normalizeTrayWidget)
    .filter((widget): widget is TrayWidgetConfig => Boolean(widget))));
}

export function normalizeTrayWidget(value: unknown): TrayWidgetConfig | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const type = normalizeTrayWidgetType(value.type);
  if (!type) {
    return undefined;
  }
  const variant = normalizeTrayWidgetVariant(type, value.variant);
  return {
    id: stringValue(value.id) || trayWidgetId(type),
    type,
    ...(variant ? { variant } : {})
  };
}

export function normalizeTrayWidgetType(value: unknown): TrayWidgetType | undefined {
  return typeof value === "string" && ["account", "activity", "header", "model-share", "rings", "source-tabs", "stats", "token-flow", "token-mix"].includes(value)
    ? value as TrayWidgetType
    : undefined;
}

export function normalizeTrayWidgetVariant(type: TrayWidgetType, value: unknown): TrayWidgetVariant | undefined {
  const variants = trayWidgetVariantOptions(type).map((option) => option.value);
  return typeof value === "string" && (variants as readonly string[]).includes(value)
    ? value as TrayWidgetVariant
    : defaultTrayWidgetVariant(type);
}

export function trayWidgetVariantOptions(type: TrayWidgetType): Array<{ label: string; value: TrayWidgetVariant }> {
  if (type === "account") {
    return [
      { label: "Bars", value: "bar" },
      { label: "Compact", value: "compact" },
      { label: "Ring", value: "ring" },
      { label: "Arc", value: "arc" },
      { label: "Stacked", value: "stacked" }
    ];
  }
  if (type === "token-flow") {
    return [
      { label: "Line", value: "line" },
      { label: "Area", value: "area" },
      { label: "Bar", value: "bar" },
      { label: "Sparkline", value: "sparkline" }
    ];
  }
  if (type === "stats") {
    return [
      { label: "Cards", value: "cards" },
      { label: "Compact", value: "compact" },
      { label: "Pills", value: "pills" }
    ];
  }
  if (type === "token-mix") {
    return [
      { label: "Bars", value: "bars" },
      { label: "Stacked", value: "stacked" },
      { label: "Donut", value: "donut" },
      { label: "Pie", value: "pie" }
    ];
  }
  if (type === "rings") {
    return [
      { label: "Rings", value: "rings" },
      { label: "Arc", value: "arcs" },
      { label: "Gauges", value: "gauges" }
    ];
  }
  if (type === "model-share") {
    return [
      { label: "Bars", value: "bars" },
      { label: "List", value: "list" },
      { label: "Donut", value: "donut" },
      { label: "Pie", value: "pie" }
    ];
  }
  return [];
}

export function defaultTrayWidgetVariant(type: TrayWidgetType): TrayWidgetVariant | undefined {
  if (type === "account") return DEFAULT_TRAY_COMPONENT_VARIANTS.account;
  if (type === "model-share") return DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare;
  if (type === "rings") return DEFAULT_TRAY_COMPONENT_VARIANTS.rings;
  if (type === "stats") return DEFAULT_TRAY_COMPONENT_VARIANTS.stats;
  if (type === "token-flow") return DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow;
  if (type === "token-mix") return DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix;
  return undefined;
}

export function trayWidgetId(type: TrayWidgetType): string {
  return type;
}

export function isTraySingletonWidgetType(type: TrayWidgetType): boolean {
  return (TRAY_SINGLETON_WIDGET_TYPES as readonly string[]).includes(type);
}

export function isTrayPinnedTopWidgetType(type: TrayWidgetType): boolean {
  return (TRAY_TOP_WIDGET_TYPES as readonly string[]).includes(type);
}

export function orderTrayWidgetsForLayout(widgets: TrayWidgetConfig[]): TrayWidgetConfig[] {
  return [
    ...widgets.filter((widget) => isTrayPinnedTopWidgetType(widget.type)),
    ...widgets.filter((widget) => !isTrayPinnedTopWidgetType(widget.type))
  ];
}

function dedupeTraySingletonWidgets(widgets: TrayWidgetConfig[]): TrayWidgetConfig[] {
  const seenSingletons = new Set<TrayWidgetType>();
  return widgets.filter((widget) => {
    if (!isTraySingletonWidgetType(widget.type)) {
      return true;
    }
    if (seenSingletons.has(widget.type)) {
      return false;
    }
    seenSingletons.add(widget.type);
    return true;
  });
}

export function trayWidgetsFromModules(modules: TrayWindowModuleId[], variants: TrayComponentVariants): TrayWidgetConfig[] {
  return orderTrayWidgetsForLayout(modules
    .filter((moduleId): moduleId is TrayWidgetType => moduleId !== "footer")
    .map((type) => ({
      id: trayWidgetId(type),
      type,
      ...((type === "account") ? { variant: variants.account } : {}),
      ...((type === "model-share") ? { variant: variants.modelShare } : {}),
      ...((type === "rings") ? { variant: variants.rings } : {}),
      ...((type === "stats") ? { variant: variants.stats } : {}),
      ...((type === "token-flow") ? { variant: variants.tokenFlow } : {}),
      ...((type === "token-mix") ? { variant: variants.tokenMix } : {})
    })));
}

export function normalizeEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

export function normalizeOverviewWidgets(value: unknown): OverviewWidgetConfig[] {
  if (!Array.isArray(value)) {
    return DEFAULT_OVERVIEW_WIDGETS.map((widget) => ({ ...widget }));
  }
  const widgets = value
    .map(normalizeOverviewWidget)
    .filter((widget): widget is OverviewWidgetConfig => Boolean(widget));
  return widgets;
}

export function normalizeOverviewWidget(value: unknown): OverviewWidgetConfig | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const type = normalizeOverviewWidgetType(value.type);
  if (!type) {
    return undefined;
  }
  const metric = type === "metric" ? normalizeOverviewMetricKind(value.metric) ?? "requests" : undefined;
  const variant = normalizeOverviewWidgetVariant(type, value.variant);
  const accountProvider = type === "account-balance" ? stringValue(value.accountProvider) : undefined;
  const size = constrainOverviewWidgetSize(
    normalizeOverviewWidgetSize(value.size, type) ?? defaultOverviewWidgetSize(type),
    type,
    variant,
    accountProvider
  );
  return {
    ...(accountProvider ? { accountProvider } : {}),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    id: stringValue(value.id) || overviewWidgetId(type, metric),
    ...(metric ? { metric } : {}),
    size,
    type,
    variant
  };
}

export function normalizeOverviewWidgetType(value: unknown): OverviewWidgetType | undefined {
  return typeof value === "string" && ["account-balance", "client-analysis", "metric", "model-distribution", "provider-analysis", "share-fuel-cockpit", "share-model-leaderboard", "share-route-map", "share-spend-receipt", "share-token-calendar", "share-usage-wrapped", "system-status", "token-activity", "token-mix", "usage-trend"].includes(value)
    ? value as OverviewWidgetType
    : undefined;
}

export function normalizeOverviewWidgetSize(value: unknown, type: OverviewWidgetType): OverviewWidgetSize | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if ((OVERVIEW_WIDGET_SIZE_VALUES as readonly string[]).includes(value)) {
    return value as OverviewWidgetSize;
  }
  if (value === "small") {
    return "1:1";
  }
  if (value === "medium" || value === "large") {
    return "2:2";
  }
  if (value === "wide") {
    return "3:2";
  }
  if (value === "full") {
    return type === "system-status" ? "4:1" : "4:2";
  }
  return undefined;
}

export function normalizeOverviewMetricKind(value: unknown): OverviewMetricKind | undefined {
  return typeof value === "string" && ["avg-latency", "cache-ratio", "cache-tokens", "errors", "estimated-cost", "input-tokens", "output-tokens", "requests", "success-rate", "total-tokens"].includes(value)
    ? value as OverviewMetricKind
    : undefined;
}

export function overviewWidgetVariantOptions(type: OverviewWidgetType): Array<{ label: string; value: OverviewWidgetVariant }> {
  if (type === "account-balance") {
    return [
      { label: "Cards", value: "cards" },
      { label: "Compact", value: "compact" },
      { label: "Bars", value: "bars" },
      { label: "Ring", value: "ring" },
      { label: "Semicircle", value: "semicircle" },
      { label: "Arc", value: "arc" },
      { label: "Nested rings", value: "nested-rings" }
    ];
  }
  if (type === "metric") {
    return [
      { label: "Cards", value: "card" },
      { label: "Compact", value: "compact" },
      { label: "Bar", value: "bar" },
      { label: "Ring", value: "ring" }
    ];
  }
  if (type === "usage-trend") {
    return [
      { label: "Composed", value: "composed" },
      { label: "Area", value: "area" },
      { label: "Line", value: "line" },
      { label: "Bar", value: "bar" }
    ];
  }
  if (type === "token-activity") {
    return [
      { label: "Heatmap", value: "heatmap" }
    ];
  }
  if (type === "model-distribution" || type === "token-mix") {
    return [
      { label: "Bars", value: "bars" },
      { label: "Stacked", value: "stacked" },
      { label: "Donut", value: "donut" },
      { label: "Pie", value: "pie" }
    ];
  }
  if (type === "system-status") {
    return [
      { label: "Timeline", value: "timeline" },
      { label: "Compact", value: "compact" }
    ];
  }
  if (isShareOverviewWidgetType(type)) {
    return [
      { label: "Card", value: "card" }
    ];
  }
  return [
    { label: "Table", value: "table" },
    { label: "Compact", value: "compact" }
  ];
}

export function normalizeOverviewWidgetVariant(type: OverviewWidgetType, value: unknown): OverviewWidgetVariant {
  const variants = overviewWidgetVariantOptions(type).map((option) => option.value);
  return typeof value === "string" && (variants as readonly string[]).includes(value)
    ? value as OverviewWidgetVariant
    : defaultOverviewWidgetVariant(type);
}

export function defaultOverviewWidgetSize(type: OverviewWidgetType): OverviewWidgetSize {
  if (type === "metric") return "1:1";
  if (type === "model-distribution") return "2:2";
  if (type === "token-mix") return "1:2";
  if (type === "token-activity") return "4:2";
  if (type === "client-analysis" || type === "provider-analysis") return "2:2";
  if (type === "usage-trend") return "3:2";
  if (type === "system-status") return "4:1";
  if (isShareOverviewWidgetType(type)) return "1:4";
  return "4:2";
}

export function defaultOverviewWidgetVariant(type: OverviewWidgetType): OverviewWidgetVariant {
  if (type === "account-balance") return "cards";
  if (type === "metric") return "card";
  if (type === "model-distribution") return "pie";
  if (type === "token-mix") return "bars";
  if (type === "token-activity") return "heatmap";
  if (type === "usage-trend") return "composed";
  if (type === "system-status") return "timeline";
  if (isShareOverviewWidgetType(type)) return "card";
  return "table";
}

export function constrainOverviewWidgetSize(
  size: OverviewWidgetSize,
  type: OverviewWidgetType,
  variant: OverviewWidgetVariant,
  accountProvider?: string
): OverviewWidgetSize {
  if (isShareOverviewWidgetType(type)) {
    return overviewWidgetSizeAtLeast(size, 1, 4);
  }
  if (type !== "account-balance" || variant !== "compact" || accountProvider?.trim()) {
    return size;
  }
  return overviewWidgetSizeAtLeast(size, 2, 2);
}

function isShareOverviewWidgetType(type: OverviewWidgetType): boolean {
  return type === "share-fuel-cockpit" ||
    type === "share-model-leaderboard" ||
    type === "share-route-map" ||
    type === "share-spend-receipt" ||
    type === "share-token-calendar" ||
    type === "share-usage-wrapped";
}

function overviewWidgetSizeAtLeast(size: OverviewWidgetSize, minWidth: 1 | 2 | 3 | 4, minHeight: 1 | 2 | 3 | 4): OverviewWidgetSize {
  const [widthText, heightText] = size.split(":");
  const width = overviewWidgetDimensionAtLeast(widthText, minWidth);
  const height = overviewWidgetDimensionAtLeast(heightText, minHeight);
  return `${width}:${height}` as OverviewWidgetSize;
}

function overviewWidgetDimensionAtLeast(value: string | undefined, minimum: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  const parsed = Number.parseInt(value ?? "", 10);
  const clamped = Number.isFinite(parsed) ? Math.max(minimum, Math.min(4, parsed)) : minimum;
  if (clamped >= 4) return 4;
  if (clamped >= 3) return 3;
  if (clamped >= 2) return 2;
  return 1;
}

export function overviewWidgetId(type: OverviewWidgetType, metric?: OverviewMetricKind): string {
  return type === "metric" ? `metric-${metric ?? "requests"}` : type;
}

export function normalizeTrayWindowModules(value: unknown): TrayWindowModuleId[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TRAY_WINDOW_MODULES;
  }
  const allowed = new Set<string>(TRAY_WINDOW_MODULE_IDS);
  const seen = new Set<string>();
  const result: TrayWindowModuleId[] = [];
  for (const item of value) {
    const moduleId = typeof item === "string" ? item.trim() : "";
    if (!allowed.has(moduleId) || seen.has(moduleId)) {
      continue;
    }
    seen.add(moduleId);
    result.push(moduleId as TrayWindowModuleId);
  }
  return result;
}

export function formatSystemOption(label: string, value: string): string {
  return `${label} (${value})`;
}

export function themeDisplayName(theme: ResolvedTheme, copy: AppCopy): string {
  return theme === "dark" ? copy.settings.themeDark : copy.settings.themeLight;
}

export function languageDisplayName(language: ResolvedLanguage, copy: AppCopy): string {
  return language === "zh" ? copy.settings.languageChinese : copy.settings.languageEnglish;
}

export function metricToneBar(tone: MetricTone) {
  if (tone === "teal") return "bg-teal-500";
  if (tone === "blue") return "bg-blue-500";
  if (tone === "indigo") return "bg-indigo-500";
  if (tone === "amber") return "bg-amber-500";
  if (tone === "slate") return "bg-slate-500";
  return "bg-rose-500";
}

export function metricToneStroke(tone: MetricTone): string {
  if (tone === "teal") return "rgb(20,184,166)";
  if (tone === "blue") return "rgb(59,130,246)";
  if (tone === "indigo") return "rgb(99,102,241)";
  if (tone === "amber") return "rgb(245,158,11)";
  if (tone === "slate") return "rgb(100,116,139)";
  return "rgb(244,63,94)";
}
