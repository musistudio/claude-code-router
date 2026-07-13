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
import { isClaudeDesignPluginConfig, isCursorProxyPluginConfig, readClaudeDesignRoutingConfig } from "./routing";
import type { ExtensionInstallDraft, ExtensionListItem, ExtensionSource, PluginInstallCandidate, PluginSettingsDraft } from "./types";

export function createPluginSettingsDraft(plugin?: AppConfig["plugins"][number]): PluginSettingsDraft {
  return {
    appsText: formatEditableJson(plugin?.apps ?? []),
    configText: formatEditableJson(pluginSettingsConfigWithoutRouting(plugin?.config)),
    enabled: plugin?.enabled !== false,
    modulePath: plugin?.module ?? ""
  };
}

export function pluginSettingsConfigWithoutRouting(config: unknown): Record<string, unknown> {
  if (!isPlainRecord(config)) {
    return {};
  }
  const { routing: _routing, ...rest } = config;
  return rest;
}

export function parsePluginAppsSettingsText(value: string): { ok: true; value?: GatewayPluginAppConfig[] } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, message: "Invalid JSON." };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, message: "Plugin apps must be a JSON array." };
  }

  const apps: GatewayPluginAppConfig[] = [];
  for (const item of parsed) {
    if (!isPlainRecord(item)) {
      return { ok: false, message: "Each plugin app requires name and url." };
    }
    const name = stringValue(item.name);
    const url = stringValue(item.url);
    if (!name || !url) {
      return { ok: false, message: "Each plugin app requires name and url." };
    }
    apps.push({
      ...(stringValue(item.description) ? { description: stringValue(item.description) } : {}),
      ...(stringValue(item.icon) ? { icon: stringValue(item.icon) } : {}),
      ...(stringValue(item.id) ? { id: stringValue(item.id) } : {}),
      name,
      url
    });
  }
  return { ok: true, value: apps };
}

export function parsePluginConfigSettingsText(value: string): { ok: true; value?: Record<string, unknown> } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, message: "Invalid JSON." };
  }

  if (!isPlainRecord(parsed)) {
    return { ok: false, message: "Plugin config must be a JSON object." };
  }

  const { routing: _routing, ...rest } = parsed;
  return { ok: true, value: rest };
}

export function pluginSettingsConfigFromDraft(previousConfig: unknown, nonRoutingConfig: Record<string, unknown> | undefined): unknown {
  const output: Record<string, unknown> = nonRoutingConfig ? { ...nonRoutingConfig } : {};
  if (isPlainRecord(previousConfig) && Object.prototype.hasOwnProperty.call(previousConfig, "routing")) {
    output.routing = previousConfig.routing;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

export function formatEditableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function sanitizeConfigId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildExtensionList(config: AppConfig): ExtensionListItem[] {
  return [
    ...(config.plugins ?? []).map((item, index) => extensionListItem("plugins", item, index)),
    ...providerPluginExtensionList(config.providerPlugins ?? [])
  ];
}

function providerPluginExtensionList(providerPlugins: unknown[]): ExtensionListItem[] {
  const internalIndexesByBaseKey = new Map<string, number[]>();
  const visibleKeys = new Set<string>();

  providerPlugins.forEach((item, index) => {
    const internalBaseKey = localAgentInternalProviderPluginBaseKey(item);
    if (internalBaseKey) {
      internalIndexesByBaseKey.set(internalBaseKey, [...(internalIndexesByBaseKey.get(internalBaseKey) ?? []), index]);
      return;
    }

    const key = extensionKeyValue(item);
    if (key) {
      visibleKeys.add(key);
    }
  });

  return providerPlugins.flatMap((item, index) => {
    const internalBaseKey = localAgentInternalProviderPluginBaseKey(item);
    if (internalBaseKey && visibleKeys.has(internalBaseKey)) {
      return [];
    }

    const extension = extensionListItem("providerPlugins", item, index);
    const key = extensionKeyValue(item);
    const foldedIndexes = key ? internalIndexesByBaseKey.get(key) ?? [] : [];
    if (foldedIndexes.length === 0) {
      return [extension];
    }

    const groupIndexes = uniqueIndexes([index, ...foldedIndexes]);
    const enabled = groupIndexes.every((itemIndex) => pluginEnabled(providerPlugins[itemIndex]));
    return [{
      ...extension,
      enabled,
      groupIndexes,
      status: enabled ? "enabled" : "disabled"
    }];
  });
}

function localAgentInternalProviderPluginBaseKey(item: unknown): string | undefined {
  if (!isPlainRecord(item)) {
    return undefined;
  }

  const key = stringValue(item.key);
  if (!key?.startsWith("ccr-local-agent-") || !key.endsWith("-internal")) {
    return undefined;
  }

  const providerName = stringValue(item.providerName) || stringValue(item.provider);
  if (!providerName?.includes("::")) {
    return undefined;
  }

  return key.slice(0, -"-internal".length) || undefined;
}

function pluginEnabled(item: unknown): boolean {
  return !isPlainRecord(item) || item.enabled !== false;
}

function uniqueIndexes(indexes: number[]): number[] {
  return [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0))];
}

export function resolvePluginInstallPlan(
  root: PluginInstallCandidate,
  marketplace: PluginMarketplaceEntry[],
  installedPlugins: AppConfig["plugins"]
): { items: PluginInstallCandidate[]; missing: string[] } {
  const installedIds = new Set(installedPlugins.map((plugin) => plugin.id));
  const marketplaceById = new Map(marketplace.map((entry) => [entry.id, entry]));
  const planned = new Map<string, PluginInstallCandidate>();
  const missing = new Set<string>();
  const visiting = new Set<string>();

  function visit(candidate: PluginInstallCandidate) {
    if (installedIds.has(candidate.id) || planned.has(candidate.id)) {
      return;
    }
    if (visiting.has(candidate.id)) {
      return;
    }

    visiting.add(candidate.id);
    for (const dependency of candidate.dependencies) {
      const dependencyCandidate = pluginDependencyCandidate(dependency, marketplaceById);
      if (!dependencyCandidate) {
        if (!installedIds.has(dependency.id)) {
          missing.add(dependency.id);
        }
        continue;
      }
      visit(dependencyCandidate);
    }
    visiting.delete(candidate.id);
    planned.set(candidate.id, candidate);
  }

  visit(root);
  return {
    items: [...planned.values()],
    missing: [...missing]
  };
}

export function pluginDependencyCandidate(
  dependency: PluginDependency,
  marketplaceById: Map<string, PluginMarketplaceEntry>
): PluginInstallCandidate | undefined {
  if (dependency.modulePath) {
    return {
      dependencies: [],
      id: dependency.id,
      modulePath: dependency.modulePath,
      name: dependency.name
    };
  }

  const entry = marketplaceById.get(dependency.id);
  if (!entry) {
    return undefined;
  }
  return {
    apps: entry.apps,
    dependencies: entry.dependencies,
    id: entry.id,
    modulePath: entry.modulePath,
    name: entry.name
  };
}

export function formatPluginDependencies(dependencies: PluginDependency[]): string {
  return dependencies.map((dependency) => dependency.name || dependency.id).join(", ");
}

export function extensionListItem(source: ExtensionSource, item: unknown, index: number): ExtensionListItem {
  if (!isPlainRecord(item)) {
    return {
      canConfigure: false,
      canToggle: false,
      capability: "Unsupported format",
      enabled: false,
      groupIndexes: [index],
      index,
      name: stringValue(item) || `Plugin ${index + 1}`,
      source,
      status: "unsupported",
      target: "Not available"
    };
  }

  if (source === "plugins") {
    const enabled = item.enabled !== false;
    return {
      canConfigure: true,
      canToggle: true,
      capability: wrapperPluginCapability(item),
      enabled,
      groupIndexes: [index],
      index,
      name: stringValue(item.id) || stringValue(item.key) || `wrapper-plugin-${index + 1}`,
      source,
      status: enabled ? "enabled" : "disabled",
      target: wrapperPluginTarget(item)
    };
  }

  const enabled = item.enabled !== false;
  return {
    canConfigure: false,
    canToggle: true,
    capability: providerPluginCapability(item),
    enabled,
    groupIndexes: [index],
    index,
    name: stringValue(item.key) || `provider-plugin-${index + 1}`,
    source,
    status: enabled ? "enabled" : "disabled",
    target: stringValue(item.providerName) || stringValue(item.provider) || "All providers"
  };
}

export function extensionMatchesQuery(extension: ExtensionListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    extension.name,
    extension.target,
    extension.capability,
    extension.status,
    extension.source
  ].some((value) => value.toLowerCase().includes(query));
}

export function wrapperPluginCapability(item: Record<string, unknown>): string {
  const capabilities: string[] = ["Wrapper runtime"];
  if (stringValue(item.module)) capabilities.push("Module");
  const apps = Array.isArray(item.apps) ? item.apps.length : 0;
  if (apps > 0) capabilities.push(`${apps} browser ${apps === 1 ? "app" : "apps"}`);

  const proxy = isPlainRecord(item.proxy) ? item.proxy : undefined;
  const proxyRoutes = isPlainRecord(proxy) && Array.isArray(proxy.routes) ? proxy.routes.length : 0;
  if (proxyRoutes > 0) capabilities.push(`${proxyRoutes} proxy ${proxyRoutes === 1 ? "route" : "routes"}`);

  const coreGateway = isPlainRecord(item.coreGateway) ? item.coreGateway : undefined;
  const providerPlugins = isPlainRecord(coreGateway) && Array.isArray(coreGateway.providerPlugins) ? coreGateway.providerPlugins.length : 0;
  if (providerPlugins > 0) capabilities.push(`${providerPlugins} provider ${providerPlugins === 1 ? "plugin" : "plugins"}`);

  const virtualModels = isPlainRecord(coreGateway) && Array.isArray(coreGateway.virtualModelProfiles) ? coreGateway.virtualModelProfiles.length : 0;
  if (virtualModels > 0) capabilities.push(`${virtualModels} Fusion ${virtualModels === 1 ? "profile" : "profiles"}`);

  if (isClaudeDesignPluginConfig(item)) {
    const routing = readClaudeDesignRoutingConfig(item.config);
    const routeCount = routing.rules.length;
    capabilities.push(routeCount > 0 ? `${routeCount} model ${routeCount === 1 ? "route" : "routes"}` : "Configurable routing");
  }
  if (isCursorProxyPluginConfig(item)) {
    const routing = readClaudeDesignRoutingConfig(item.config);
    const routeCount = routing.rules.length;
    capabilities.push(routeCount > 0 ? `${routeCount} model ${routeCount === 1 ? "route" : "routes"}` : "Configurable routing");
  }

  if (isPlainRecord(coreGateway) && isPlainRecord(coreGateway.config)) capabilities.push("Core gateway config");
  return capabilities.join(", ");
}

export function wrapperPluginTarget(item: Record<string, unknown>): string {
  const modulePath = stringValue(item.module);
  if (modulePath) {
    return modulePath;
  }

  const proxy = isPlainRecord(item.proxy) ? item.proxy : undefined;
  const routes = isPlainRecord(proxy) && Array.isArray(proxy.routes) ? proxy.routes : [];
  const hosts = routes
    .filter(isPlainRecord)
    .map((route) => stringValue(route.host))
    .filter((host): host is string => Boolean(host));
  return hosts.length ? hosts.join(", ") : "Wrapper runtime";
}

export function providerPluginCapability(item: Record<string, unknown>): string {
  const capabilities: string[] = ["Provider middleware"];
  if (item.deepseekThinking || item.deepSeekThinking) capabilities.push("DeepSeek thinking");
  if (item.codexOauth) capabilities.push("Codex OAuth");
  if (typeof item.key === "string" && item.key.includes("grok-cli-oauth")) capabilities.push("Grok OAuth");
  if (item.auth) capabilities.push("Auth mutation");
  if (item.request) capabilities.push("Request mutation");
  if (item.response) capabilities.push("Response mutation");
  return capabilities.join(", ");
}

export function createExtensionInstallDraft(): ExtensionInstallDraft {
  return {
    dependencies: [],
    key: "",
    marketplaceId: "",
    modulePath: "",
    selectedName: ""
  };
}

export function providerSelectOptions(providers: GatewayProviderConfig[], value: string): Array<{ label: string; value: string }> {
  const options = [{ label: "Select provider", value: "" }, ...providers.map((provider) => ({ label: provider.name, value: provider.name }))];
  if (value && !options.some((option) => option.value === value)) {
    return [{ label: value, value }, ...options];
  }
  return options;
}

export function uniqueExtensionKey(items: unknown[], preferredKey: string): string {
  const base = slugValue(preferredKey) || "extension";
  const used = new Set(items.map(extensionKeyValue).filter((value): value is string => Boolean(value)));
  let key = base;
  let index = 2;
  while (used.has(key)) {
    key = `${base}-${index}`;
    index += 1;
  }
  return key;
}

export function extensionKeyValue(item: unknown): string | undefined {
  return isPlainRecord(item) ? stringValue(item.key) || stringValue(item.id) : undefined;
}

export function slugValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stringListValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item)) : [];
}
