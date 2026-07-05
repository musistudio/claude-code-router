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


import { isPlainRecord, stringValue } from "./common";
import type { AddApiKeyDraft, ApiKeyLimitDraftRow, ApiKeyLimitMetric, ApiKeyListItem, LimitWindowPreset } from "./types";

export function normalizeApiKeys(values: unknown, legacyKey?: string): ApiKeyConfig[] {
  const items = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const result: ApiKeyConfig[] = [];
  for (const [index, value] of [...items, legacyKey ?? ""].entries()) {
    const apiKey = normalizeApiKeyConfig(value, index);
    const trimmed = apiKey?.key.trim();
    if (!apiKey || !trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push({
      createdAt: apiKey.createdAt,
      ...(apiKey.expiresAt ? { expiresAt: apiKey.expiresAt } : {}),
      id: apiKey.id,
      key: trimmed,
      ...(apiKey.limits ? { limits: apiKey.limits } : {}),
      ...(apiKey.name ? { name: apiKey.name } : {})
    });
  }
  return result;
}

export function normalizeApiKeyConfig(value: unknown, index: number): ApiKeyConfig | undefined {
  if (typeof value === "string") {
    return value.trim()
      ? {
          createdAt: new Date(0).toISOString(),
          id: `key-${index + 1}`,
          key: value.trim(),
          name: `API Key ${index + 1}`
        }
      : undefined;
  }
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const key = stringValue(value.key) || stringValue(value.value) || stringValue(value.APIKEY);
  if (!key) {
    return undefined;
  }
  const limits = normalizeApiKeyLimits(value.limits);
  const name = stringValue(value.name);
  return {
    createdAt: stringValue(value.createdAt) || new Date(0).toISOString(),
    ...(stringValue(value.expiresAt) ? { expiresAt: stringValue(value.expiresAt) } : {}),
    id: stringValue(value.id) || `key-${index + 1}`,
    key,
    ...(limits ? { limits } : {}),
    ...(name ? { name } : {})
  };
}

export function normalizeApiKeyLimits(value: unknown): ApiKeyLimitConfig | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const limits: ApiKeyLimitConfig = {};
  for (const key of ["ipd", "iph", "ipm", "maxRequests", "maxTokens", "quotaWindowMs", "rpd", "rph", "rpm", "tpd", "tph", "tpm", "windowMs"] as const) {
    const limit = positiveInteger(value[key]);
    if (limit) {
      limits[key] = limit;
    }
  }
  return Object.keys(limits).length ? limits : undefined;
}

export function createApiKeyList(config: AppConfig): ApiKeyListItem[] {
  return normalizeApiKeys(config.APIKEYS, config.APIKEY).map((key, index) => ({
    expiresAt: key.expiresAt,
    index,
    key,
    keyValue: key.key,
    limits: key.limits,
    masked: maskApiKey(key.key),
    name: key.name?.trim() || `API Key ${index + 1}`
  }));
}

export function createApiKeyDraft(): AddApiKeyDraft {
  return {
    expirationPreset: "never",
    expiresAt: toDatetimeLocalValue(addDays(new Date(), 30)),
    limitRows: [],
    name: ""
  };
}

export function createApiKeyEditDraft(apiKey: ApiKeyConfig): AddApiKeyDraft {
  return {
    expirationPreset: apiKey.expiresAt ? "custom" : "never",
    expiresAt: datetimeLocalValueFromIso(apiKey.expiresAt),
    limitRows: apiKeyLimitRowsFromConfig(apiKey.limits),
    name: apiKey.name ?? ""
  };
}

export function apiKeyMatchesQuery(apiKey: ApiKeyListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    apiKey.name,
    apiKey.keyValue,
    apiKey.masked,
    apiKey.key.id,
    formatApiKeyExpiration(apiKey),
    formatApiKeyLimits(apiKey.limits)
  ].some((value) => value.toLowerCase().includes(query));
}

export function createGeneratedApiKey(draft: AddApiKeyDraft): ApiKeyConfig {
  const key = generateApiKeyValue();
  const limits = apiKeyLimitsFromDraft(draft);
  const expiresAt = expiresAtFromApiKeyDraft(draft);
  return {
    createdAt: new Date().toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
    id: generateApiKeyId(),
    key,
    ...(limits ? { limits } : {}),
    name: draft.name.trim()
  };
}

export function updateApiKeyEditableConfig(apiKey: ApiKeyConfig, draft: AddApiKeyDraft): ApiKeyConfig {
  const limits = apiKeyLimitsFromDraft(draft);
  const expiresAt = expiresAtFromApiKeyDraft(draft);
  return {
    createdAt: apiKey.createdAt,
    id: apiKey.id,
    key: apiKey.key,
    ...(apiKey.name ? { name: apiKey.name } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(limits ? { limits } : {})
  };
}

export function apiKeyLimitsFromDraft(draft: AddApiKeyDraft): ApiKeyLimitConfig | undefined {
  const limits: ApiKeyLimitConfig = {};
  for (const row of draft.limitRows) {
    const value = positiveInteger(row.value);
    if (!value) {
      continue;
    }
    const field = apiKeyLimitField(row.metric, row.window);
    if (field) {
      limits[field] = value;
    }
  }
  return Object.keys(limits).length ? limits : undefined;
}

export function apiKeyLimitRowsFromConfig(limits: ApiKeyLimitConfig | undefined): ApiKeyLimitDraftRow[] {
  if (!limits) {
    return [];
  }
  return [
    createApiKeyLimitDraftRow("requests", "minute", limits.rpm),
    createApiKeyLimitDraftRow("requests", "hour", limits.rph),
    createApiKeyLimitDraftRow("requests", "day", limits.rpd),
    createApiKeyLimitDraftRow("tokens", "minute", limits.tpm),
    createApiKeyLimitDraftRow("tokens", "hour", limits.tph),
    createApiKeyLimitDraftRow("tokens", "day", limits.tpd),
    createApiKeyLimitDraftRow("images", "minute", limits.ipm),
    createApiKeyLimitDraftRow("images", "hour", limits.iph),
    createApiKeyLimitDraftRow("images", "day", limits.ipd),
    createApiKeyLimitDraftRow("requests", limitWindowPresetFromMs(limits.windowMs, "minute"), limits.maxRequests),
    createApiKeyLimitDraftRow("tokens", limitWindowPresetFromMs(limits.quotaWindowMs, "day"), limits.maxTokens)
  ].filter((row): row is ApiKeyLimitDraftRow => Boolean(row));
}

export function createApiKeyLimitDraftRow(
  metric: ApiKeyLimitMetric = "requests",
  window: LimitWindowPreset = "minute",
  value?: number | string
): ApiKeyLimitDraftRow | undefined {
  const normalized = value === undefined || value === "" ? "" : String(value);
  if (value !== undefined && value !== "" && !positiveInteger(value)) {
    return undefined;
  }
  return {
    id: `limit_${randomBase64Url(6)}`,
    metric,
    value: normalized,
    window
  };
}

export function apiKeyLimitField(metric: ApiKeyLimitMetric, window: LimitWindowPreset): keyof ApiKeyLimitConfig | undefined {
  if (metric === "requests") {
    if (window === "minute") return "rpm";
    if (window === "hour") return "rph";
    return "rpd";
  }
  if (metric === "tokens") {
    if (window === "minute") return "tpm";
    if (window === "hour") return "tph";
    return "tpd";
  }
  if (window === "minute") return "ipm";
  if (window === "hour") return "iph";
  return "ipd";
}

export function expiresAtFromApiKeyDraft(draft: AddApiKeyDraft): string | undefined {
  if (draft.expirationPreset === "never") {
    return undefined;
  }
  if (draft.expirationPreset === "custom") {
    const date = new Date(draft.expiresAt);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  const days = draft.expirationPreset === "7d" ? 7 : draft.expirationPreset === "90d" ? 90 : 30;
  return addDays(new Date(), days).toISOString();
}

export function formatApiKeyExpiration(apiKey: ApiKeyListItem): string {
  if (!apiKey.expiresAt) {
    return "Never";
  }
  const date = new Date(apiKey.expiresAt);
  if (!Number.isFinite(date.getTime())) {
    return "Invalid";
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatApiKeyLimits(limits: ApiKeyLimitConfig | undefined): string {
  if (!limits) {
    return "Unlimited";
  }
  const parts = [
    ...formatMetricLimitParts("requests", [
      ["minute", limits.rpm],
      ["hour", limits.rph],
      ["day", limits.rpd],
      [limitWindowPresetFromMs(limits.windowMs, "minute"), limits.maxRequests]
    ]),
    ...formatMetricLimitParts("tokens", [
      ["minute", limits.tpm],
      ["hour", limits.tph],
      ["day", limits.tpd],
      [limitWindowPresetFromMs(limits.quotaWindowMs, "day"), limits.maxTokens]
    ]),
    ...formatMetricLimitParts("images", [
      ["minute", limits.ipm],
      ["hour", limits.iph],
      ["day", limits.ipd]
    ])
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Unlimited";
}

export function formatMetricLimitParts(
  metric: ApiKeyLimitMetric,
  entries: Array<[LimitWindowPreset, number | undefined]>
): string[] {
  const seen = new Set<LimitWindowPreset>();
  const parts: string[] = [];
  for (const [window, value] of entries) {
    if (!value || seen.has(window)) {
      continue;
    }
    seen.add(window);
    parts.push(`${value} ${metric} per ${window}`);
  }
  return parts;
}

export function limitWindowPresetFromMs(value: number | undefined, fallback: LimitWindowPreset): LimitWindowPreset {
  if (value === 60_000) {
    return "minute";
  }
  if (value === 3_600_000) {
    return "hour";
  }
  if (value === 86_400_000) {
    return "day";
  }
  return fallback;
}

export function positiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : undefined;
}

export async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to a temporary textarea for Electron/file contexts where clipboard permissions vary.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.left = "-9999px";
  textarea.style.position = "fixed";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function toDatetimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function datetimeLocalValueFromIso(value: string | undefined): string {
  if (!value) {
    return toDatetimeLocalValue(addDays(new Date(), 30));
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? toDatetimeLocalValue(date) : toDatetimeLocalValue(addDays(new Date(), 30));
}

export function generateApiKeyId(): string {
  return `key_${randomBase64Url(9)}`;
}

export function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return "****";
  }
  return `${trimmed.slice(0, Math.min(18, trimmed.length - 4))}***`;
}

export function generateApiKeyValue(): string {
  return `sk-${randomBase64Url(24)}`;
}

export function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(24);
  const sizedBytes = byteLength === bytes.length ? bytes : new Uint8Array(byteLength);
  const target = sizedBytes;
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(target);
  } else {
    for (let index = 0; index < target.length; index += 1) {
      target[index] = Math.floor(Math.random() * 256);
    }
  }
  const binary = Array.from(target, (byte) => String.fromCharCode(byte)).join("");
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
