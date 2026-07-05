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
  ROUTER_FALLBACK_MAX_RETRY_COUNT,
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
  RouterBuiltInAgentRuleId,
  RouterBuiltInRulesConfig,
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
import { isPlainRecord, stringValue, uniqueStrings } from "./common";
import { sanitizeConfigId } from "./extensions";
import { formatRouterRuleCondition, formatRouterRuleTarget, routerRuleTypeLabel } from "./providers";
import { clampNumber } from "./services";
import type { ClaudeDesignRouteRuleType, ClaudeDesignRoutingDraft, ClaudeDesignRoutingRuleDraft, PluginRoutingConfigItem, RoutingRuleRow } from "./types";

export function normalizeRouterConfig(value: Partial<RouterConfig> | undefined): RouterConfig {
  const router = {
    ...fallbackConfig.Router,
    ...(value || {})
  } as RouterConfig & { default?: unknown };
  const { default: _legacyDefault, ...routerWithoutLegacyDefault } = router;
  const rules = normalizeRouterRules((value as Record<string, unknown> | undefined)?.rules) ?? [];
  return {
    ...routerWithoutLegacyDefault,
    builtInRules: normalizeRouterBuiltInRules((value as Record<string, unknown> | undefined)?.builtInRules),
    fallback: normalizeRouterFallbackConfig((value as Record<string, unknown> | undefined)?.fallback),
    rules
  };
}

export function normalizeRouterBuiltInRules(value: unknown): RouterBuiltInRulesConfig {
  const record = isPlainRecord(value) ? value : {};
  return {
    "claude-code": normalizeRouterBuiltInAgentRule(record["claude-code"] ?? record.claudeCode ?? record.claude),
    codex: normalizeRouterBuiltInAgentRule(record.codex)
  };
}

function normalizeRouterBuiltInAgentRule(value: unknown): { enabled: boolean } {
  if (typeof value === "boolean") {
    return { enabled: value };
  }
  const record = isPlainRecord(value) ? value : {};
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : true
  };
}

export function normalizeRouterFallbackConfig(value: Partial<RouterFallbackConfig> | unknown): RouterFallbackConfig {
  const record = isPlainRecord(value) ? value : {};
  const mode = parseRouterFallbackMode(record.mode) ?? fallbackConfig.Router.fallback.mode;
  const retryCount = clampNumber(Number(record.retryCount), 0, ROUTER_FALLBACK_MAX_RETRY_COUNT);
  const models = Array.isArray(record.models)
    ? uniqueStrings(record.models.map((model) => stringValue(model)).filter((model): model is string => Boolean(model)))
    : [];

  return {
    mode,
    models,
    retryCount: Number.isFinite(retryCount) ? retryCount : fallbackConfig.Router.fallback.retryCount
  };
}

export function parseRouterFallbackMode(value: unknown): RouterFallbackMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return routerFallbackModeOptions.some((option) => option.value === normalized)
    ? normalized as RouterFallbackMode
    : undefined;
}

export function normalizeRouterRules(value: unknown): RouterRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item, index): RouterRule | undefined => {
      if (!isPlainRecord(item)) {
        return undefined;
      }
      const type = parseRouterRuleType(item.type);
      if (!type) {
        return undefined;
      }
      const name = stringValue(item.name) || routerRuleTypeLabel(type);
      const id = stringValue(item.id) || `rule-${index + 1}`;
      if (removedLegacyRouterRuleIds.has(id)) {
        return undefined;
      }
      const pattern = stringValue(item.pattern);
      const target = stringValue(item.target);
      const threshold = Number(item.threshold);
      const condition = normalizeRouterRuleCondition(item.condition ?? item) ?? routerRuleConditionFromLegacy(type, {
        pattern
      });
      const rewrites = normalizeRouterRuleRewrites(item);
      const rawFallback = item.fallback ?? item.failureFallback ?? item.fallbackStrategy;
      const fallback = isPlainRecord(rawFallback) ? normalizeRouterFallbackConfig(rawFallback) : undefined;
      return {
        ...(condition ? { condition } : {}),
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
        ...(fallback ? { fallback } : {}),
        id,
        name,
        ...(pattern ? { pattern } : {}),
        ...(rewrites.length === 1 ? { rewrite: rewrites[0] } : {}),
        ...(rewrites.length > 0 ? { rewrites } : {}),
        ...(target ? { target } : {}),
        ...(Number.isFinite(threshold) && threshold > 0 ? { threshold: Math.trunc(threshold) } : {}),
        type: condition ? "condition" : type
      };
    })
    .filter((item): item is RouterRule => Boolean(item));
}

export function normalizeRouterRuleCondition(value: unknown): RouterRuleCondition | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const left =
    stringValue(value.left) ??
    stringValue(value.path) ??
    stringValue(value.field) ??
    stringValue(value.parameter);
  const operator = parseRouterRuleOperator(value.operator ?? value.op);
  const right = typeof value.right === "string"
    ? value.right.trim()
    : typeof value.value === "string"
      ? value.value.trim()
      : value.right !== undefined
        ? String(value.right)
        : value.value !== undefined
          ? String(value.value)
          : undefined;

  return left && operator && right !== undefined
    ? { left, operator, right }
    : undefined;
}

export function parseRouterRuleOperator(value: unknown): RouterRuleOperator | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return routerRuleOperatorOptions.some((option) => option.value === normalized)
    ? normalized as RouterRuleOperator
    : undefined;
}

function routerRuleConditionFromLegacy(
  type: RouterRuleType,
  input: { pattern?: string }
): RouterRuleCondition | undefined {
  if (type === "model-prefix" && input.pattern) {
    return {
      left: "request.body.model",
      operator: "starts-with",
      right: input.pattern
    };
  }
  return undefined;
}

export function normalizeRouterRuleRewrites(rule: Record<string, unknown>): RouterRuleRewrite[] {
  if (Array.isArray(rule.rewrites)) {
    return rule.rewrites
        .map((item) => normalizeRouterRuleRewrite(item))
        .filter((item): item is RouterRuleRewrite => Boolean(item));
  }
  const rewrite = normalizeRouterRuleRewrite(rule.rewrite ?? rule.action);
  const target = stringValue(rule.target);
  return [
    ...(rewrite ? [rewrite] : []),
    ...(target ? [{ key: "request.body.model", operation: "set" as const, value: target }] : [])
  ];
}

export function normalizeRouterRuleRewrite(value: unknown): RouterRuleRewrite | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const key =
    stringValue(value.key) ??
    stringValue(value.path) ??
    stringValue(value.field) ??
    stringValue(value.parameter);
  const operation = parseRouterRewriteOperation(value.operation ?? value.op ?? value.type) ?? "set";
  const rewriteValue = stringifyRewriteValue(value.value);
  const match = stringifyRewriteValue(value.match);

  if (!key) {
    return undefined;
  }
  if (operation === "delete") {
    return { key, operation };
  }
  if (operation === "array-replace") {
    return match !== undefined && rewriteValue !== undefined
      ? { key, match, operation, value: rewriteValue }
      : undefined;
  }
  return rewriteValue !== undefined
    ? { key, operation, value: rewriteValue }
    : undefined;
}

export function parseRouterRewriteOperation(value: unknown): RouterRuleRewriteOperation | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return routerRewriteOperationOptions.some((option) => option.value === normalized)
    ? normalized as RouterRuleRewriteOperation
    : undefined;
}

function stringifyRewriteValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  return value !== undefined ? String(value) : undefined;
}

export function parseRouterRuleType(value: unknown): RouterRuleType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return isRouterRuleType(normalized) ? normalized : undefined;
}

export function isRouterRuleType(value: string): value is RouterRuleType {
  return routerRuleTypeOptions.some((option) => option.value === value) || legacyRouterRuleTypes.includes(value as RouterRuleType);
}

export function formatProxyTargets(targets: AppConfig["proxy"]["targets"]): string {
  return targets
    .map((target) => [target.host, ...(target.paths ?? [])].join(" "))
    .join("\n");
}

export function parseProxyTargetsText(value: string): AppConfig["proxy"]["targets"] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [host, ...pathParts] = line.split(/[\s,]+/).filter(Boolean);
      return {
        host: host.toLowerCase(),
        paths: pathParts.length ? pathParts.map((item) => (item.startsWith("/") ? item : `/${item}`)) : undefined
      };
    });
}

export type KnownWrapperPluginConfig<TId extends string> = AppConfig["plugins"][number] & { id: TId };

export function isClaudeDesignPluginConfig(item: unknown): item is KnownWrapperPluginConfig<"claude-design"> {
  if (!isPlainRecord(item)) {
    return false;
  }
  const id = stringValue(item.id) || stringValue(item.key);
  return id === "claude-design";
}

export function isCursorProxyPluginConfig(item: unknown): item is KnownWrapperPluginConfig<"cursor-proxy"> {
  if (!isPlainRecord(item)) {
    return false;
  }
  const id = stringValue(item.id) || stringValue(item.key);
  return id === "cursor-proxy";
}

export function createClaudeDesignRoutingDraft(pluginConfig?: unknown): ClaudeDesignRoutingDraft {
  const config = readClaudeDesignRoutingConfig(pluginConfig);
  return {
    defaultTarget: config.defaultTarget,
    enabled: config.enabled,
    rules: config.rules.map((rule) => ({ ...rule }))
  };
}

export function createCursorProxyRoutingDraft(pluginConfig?: unknown): ClaudeDesignRoutingDraft {
  const config = readClaudeDesignRoutingConfig(pluginConfig);
  return {
    defaultTarget: config.defaultTarget,
    enabled: config.enabled,
    rules: config.rules.map((rule) => ({ ...rule }))
  };
}

export function readClaudeDesignRoutingConfig(pluginConfig?: unknown): ClaudeDesignRoutingDraft {
  const configRecord = isPlainRecord(pluginConfig) ? pluginConfig : {};
  const routing = isPlainRecord(configRecord.routing) ? configRecord.routing : {};
  const fallbackTarget = composeRouteTargetValue(configRecord.targetProvider, configRecord.targetModel) || stringValue(configRecord.targetModel) || "";
  const rules: ClaudeDesignRoutingRuleDraft[] = [];

  if (isPlainRecord(routing.modelMap)) {
    for (const [model, target] of Object.entries(routing.modelMap)) {
      const modelValue = stringValue(model);
      const targetValue = stringValue(target);
      if (!modelValue || !targetValue) {
        continue;
      }
      rules.push({
        enabled: true,
        id: `model-${sanitizeConfigId(modelValue)}`,
        model: modelValue,
        name: modelValue,
        pattern: "",
        target: targetValue,
        threshold: "200000",
        type: "model"
      });
    }
  }

  if (Array.isArray(routing.rules)) {
    routing.rules.forEach((rule, index) => {
      const normalized = normalizeClaudeDesignRoutingRuleDraft(rule, index);
      if (normalized) {
        rules.push(normalized);
      }
    });
  }

  return {
    defaultTarget: stringValue(routing.default) || stringValue(routing.defaultTarget) || fallbackTarget,
    enabled: configRecord.routing === false ? false : routing.enabled !== false,
    rules
  };
}

export function normalizeClaudeDesignRoutingRuleDraft(value: unknown, index: number): ClaudeDesignRoutingRuleDraft | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const rawType = stringValue(value.type);
  const parsedType = parseClaudeDesignRouteRuleType(value.type);
  if (rawType && !parsedType) {
    return undefined;
  }
  const type = parsedType ?? "model";
  const target =
    stringValue(value.target) ||
    composeRouteTargetValue(value.targetProvider, value.targetModel) ||
    stringValue(value.targetModel) ||
    "";
  const id = stringValue(value.id) || `${type}-${index + 1}`;
  const model = stringValue(value.model) || stringValue(value.sourceModel) || "";
  const pattern = stringValue(value.pattern) || (type === "model-prefix" ? model : "") || "";
  return {
    enabled: value.enabled !== false,
    id,
    model,
    name: stringValue(value.name) || id,
    pattern,
    target,
    threshold: String(positiveInteger(value.threshold) || positiveInteger(value.tokenThreshold) || 200000),
    type
  };
}

export function createClaudeDesignRoutingRuleDraft(existingRules: ClaudeDesignRoutingRuleDraft[] = []): ClaudeDesignRoutingRuleDraft {
  const id = uniqueClaudeDesignRoutingRuleId(existingRules);
  return {
    enabled: true,
    id,
    model: "claude-opus-4-8",
    name: "Claude Design route",
    pattern: "",
    target: "",
    threshold: "200000",
    type: "model"
  };
}

export function createCursorProxyRoutingRuleDraft(existingRules: ClaudeDesignRoutingRuleDraft[] = []): ClaudeDesignRoutingRuleDraft {
  const id = uniqueClaudeDesignRoutingRuleId(existingRules);
  return {
    enabled: true,
    id,
    model: "default",
    name: "Cursor route",
    pattern: "",
    target: "",
    threshold: "200000",
    type: "model"
  };
}

export function normalizeClaudeDesignRuleTypeChange(
  rule: ClaudeDesignRoutingRuleDraft,
  type: ClaudeDesignRouteRuleType,
  defaults: { model: string; pattern: string } = { model: "claude-opus-4-8", pattern: "claude-" }
): Partial<ClaudeDesignRoutingRuleDraft> {
  const patch: Partial<ClaudeDesignRoutingRuleDraft> = { type };
  if (!rule.name.trim() || rule.name.trim() === claudeDesignRouteRuleTypeLabel(rule.type)) {
    patch.name = claudeDesignRouteRuleTypeLabel(type);
  }
  if (type === "model" && !rule.model.trim()) {
    patch.model = defaults.model;
  }
  if (type === "model-prefix" && !rule.pattern.trim()) {
    patch.pattern = defaults.pattern;
  }
  return patch;
}

export function isClaudeDesignRoutingDraftValid(draft: ClaudeDesignRoutingDraft): boolean {
  if (!draft.enabled) {
    return true;
  }
  return draft.rules.every((rule) => {
    if (!rule.enabled) {
      return true;
    }
    if (!rule.target.trim()) {
      return false;
    }
    if (rule.type === "model") {
      return Boolean(rule.model.trim());
    }
    if (rule.type === "model-prefix") {
      return Boolean(rule.pattern.trim());
    }
    return true;
  });
}

export function claudeDesignRoutingConfigFromDraft(draft: ClaudeDesignRoutingDraft): Record<string, unknown> {
  return {
    enabled: draft.enabled,
    rules: draft.rules.map((rule) => {
      const output: Record<string, unknown> = {
        enabled: rule.enabled,
        id: rule.id.trim() || sanitizeConfigId(rule.name) || "route",
        name: rule.name.trim() || claudeDesignRouteRuleTypeLabel(rule.type),
        target: rule.target.trim(),
        type: rule.type
      };
      if (rule.type === "model") {
        output.model = rule.model.trim();
      }
      if (rule.type === "model-prefix") {
        output.pattern = rule.pattern.trim();
      }
      return output;
    })
  };
}

export function buildRoutingRuleRows(config: AppConfig): RoutingRuleRow[] {
  return [
    ...buildBuiltInAgentRoutingRows(config),
    ...config.Router.rules.map((rule, index): RoutingRuleRow => ({
      condition: formatRouterRuleCondition(rule),
      enabled: rule.enabled,
      index,
      key: `router-${rule.id}-${index}`,
      name: rule.name || "Unnamed",
      readonly: false,
      ruleCount: config.Router.rules.length,
      ruleId: rule.id,
      sourceLabel: "Router",
      target: formatRouterRuleTarget(rule),
      typeLabel: routerRuleTypeLabel(rule.type)
    }))
  ];
}

export function buildBuiltInAgentRoutingRows(config: AppConfig): RoutingRuleRow[] {
  return routerBuiltInAgentRuleIds.map((agent): RoutingRuleRow => {
    const target = routerBuiltInAgentRouteTarget(config, agent);
    const toggleDisabledReason = routerBuiltInAgentRuleDisabledReason(config, agent);
    return {
      builtInAgent: agent,
      condition: `request.header.user-agent contains ${routerBuiltInAgentUserAgentNeedle(agent)}`,
      enabled: routerBuiltInAgentRuleIsActive(config, agent),
      key: `builtin-agent-${agent}`,
      name: routerBuiltInAgentRuleName(agent),
      readonly: false,
      ruleCount: config.Router.rules.length,
      ruleId: `builtin-agent-${agent}`,
      sourceLabel: "Built-in",
      target: target ? `set request.body.model = ${target}` : "Profile model unset",
      toggleDisabled: Boolean(toggleDisabledReason),
      toggleDisabledReason,
      typeLabel: "Condition"
    };
  });
}

const routerBuiltInAgentRuleIds: RouterBuiltInAgentRuleId[] = ["claude-code", "codex"];

export function routerBuiltInAgentRuleIsActive(config: AppConfig, agent: RouterBuiltInAgentRuleId): boolean {
  return routerBuiltInAgentRulePreferenceEnabled(config, agent) &&
    Boolean(routerBuiltInAgentProfile(config, agent)) &&
    Boolean(routerBuiltInAgentRouteTarget(config, agent));
}

export function routerBuiltInAgentRulePreferenceEnabled(config: AppConfig, agent: RouterBuiltInAgentRuleId): boolean {
  return config.Router.builtInRules?.[agent]?.enabled !== false;
}

export function routerBuiltInAgentProfile(config: AppConfig, agent: RouterBuiltInAgentRuleId): ProfileConfig | undefined {
  if (config.profile.enabled === false) {
    return undefined;
  }
  return config.profile.profiles.find((profile) => profile.enabled && profile.agent === agent);
}

export function routerBuiltInAgentRouteTarget(config: AppConfig, agent: RouterBuiltInAgentRuleId): string {
  return routerBuiltInAgentProfile(config, agent)?.model.trim() || "";
}

export function routerBuiltInAgentRuleDisabledReason(config: AppConfig, agent: RouterBuiltInAgentRuleId): string | undefined {
  if (config.profile.enabled === false) {
    return "Agent profiles are disabled.";
  }
  const agentName = routerBuiltInAgentRuleName(agent);
  const profile = routerBuiltInAgentProfile(config, agent);
  if (!profile) {
    return `Enable a ${agentName} profile before enabling this built-in route.`;
  }
  if (!profile.model.trim()) {
    return `Set a model on the ${agentName} profile before enabling this built-in route.`;
  }
  return undefined;
}

export function routerBuiltInAgentRuleName(agent: RouterBuiltInAgentRuleId): string {
  return agent === "claude-code" ? "Claude Code" : "Codex";
}

export function routerBuiltInAgentUserAgentNeedle(agent: RouterBuiltInAgentRuleId): string {
  return agent === "claude-code" ? "claude" : "codex";
}

export function buildPluginRoutingRows(plugin: AppConfig["plugins"][number], pluginIndex: number): RoutingRuleRow[] {
  if (!isClaudeDesignPluginConfig(plugin) && !isCursorProxyPluginConfig(plugin)) {
    return [];
  }
  const pluginName = plugin.id || "plugin";
  const routing = readClaudeDesignRoutingConfig(plugin.config);
  const baseEnabled = plugin.enabled !== false && routing.enabled;
  const rows: RoutingRuleRow[] = [];
  routing.rules.forEach((rule, ruleIndex) => {
    rows.push({
      condition: formatClaudeDesignRoutingRuleCondition(rule),
      enabled: baseEnabled && rule.enabled,
      key: `plugin-${pluginIndex}-${pluginName}-${rule.id}-${ruleIndex}`,
      name: rule.name || claudeDesignRouteRuleTypeLabel(rule.type),
      pluginIndex,
      readonly: true,
      ruleCount: 0,
      ruleId: rule.id,
      sourceLabel: `Plugin: ${pluginName}`,
      target: rule.target,
      typeLabel: claudeDesignRouteRuleTypeLabel(rule.type)
    });
  });
  return rows;
}

export function buildPluginRoutingConfigItems(config: AppConfig): PluginRoutingConfigItem[] {
  return (config.plugins ?? []).flatMap((plugin, index): PluginRoutingConfigItem[] => {
    if (!isClaudeDesignPluginConfig(plugin) && !isCursorProxyPluginConfig(plugin)) {
      return [];
    }
    return [{
      index,
      name: plugin.id || `plugin-${index + 1}`
    }];
  });
}

export function formatClaudeDesignRoutingRuleCondition(rule: ClaudeDesignRoutingRuleDraft): string {
  if (rule.type === "model") {
    return rule.model ? `is ${rule.model}` : "model unset";
  }
  if (rule.type === "model-prefix") {
    return rule.pattern ? `starts with ${rule.pattern}` : "prefix unset";
  }
  return "always";
}

export function parseClaudeDesignRouteRuleType(value: unknown): ClaudeDesignRouteRuleType | undefined {
  const normalized = stringValue(value);
  return normalized && isClaudeDesignRouteRuleType(normalized) ? normalized : undefined;
}

export function isClaudeDesignRouteRuleType(value: string): value is ClaudeDesignRouteRuleType {
  return claudeDesignRouteRuleTypeOptions.some((option) => option.value === value);
}

export function isClaudeDesignStaticRuleType(type: ClaudeDesignRouteRuleType): boolean {
  return type === "always";
}

export function claudeDesignRouteRuleTypeLabel(type: ClaudeDesignRouteRuleType): string {
  return claudeDesignRouteRuleTypeOptions.find((option) => option.value === type)?.label ?? type;
}

export function composeRouteTargetValue(providerValue: unknown, modelValue: unknown): string | undefined {
  const provider = stringValue(providerValue);
  const model = stringValue(modelValue);
  if (provider && model) {
    return `${provider},${model}`;
  }
  return model || provider;
}

export function uniqueClaudeDesignRoutingRuleId(rules: ClaudeDesignRoutingRuleDraft[]): string {
  let index = rules.length + 1;
  let id = `claude-design-route-${index}`;
  while (rules.some((rule) => rule.id === id)) {
    index += 1;
    id = `claude-design-route-${index}`;
  }
  return id;
}
