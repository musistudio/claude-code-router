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
import grokLogoUrl from "@/assets/agent-logos/grok.ico";
import openCodeLogoUrl from "@/assets/agent-logos/opencode.ico";
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
  CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV,
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


import { isPlainRecord, normalizeProviderModelSelector, stringValue, uniqueStrings } from "./common";
import { virtualModelProfileModelNames } from "./providers";
import { endpointFromHostPort } from "./services";
import { keyValueRowsFromRecord, recordFromKeyValueRows, stringRecordValue, validateProfileEnvRows } from "./virtual-models";
import { isGatewayProviderEnabled } from "@ccr/core/contracts/app";
import type { AddProfileDraft, BotGatewayConfigDraft } from "./types";

export function gatewayEndpointFromConfig(config: AppConfig): string {
  if (config.routerEndpoint) {
    return config.routerEndpoint;
  }

  return endpointFromHostPort(config.gateway.host, config.gateway.port);
}

export function defaultProfileClientModel(config: AppConfig): string {
  const enabledProviders = config.Providers.filter(isGatewayProviderEnabled);
  const preferred = enabledProviders.find((provider) => provider.name === config.preferredProvider) ?? enabledProviders[0];
  if (preferred?.name && preferred.models[0]) {
    return `${preferred.name}/${preferred.models[0]}`;
  }
  return "gpt-5-codex";
}

export function normalizeProfileClientModel(value: string | undefined): string {
  return normalizeProviderModelSelector(value);
}

export type ProfileModelProviderOption = {
  modelDisplayNames?: Record<string, string>;
  models: string[];
  name: string;
};

export const fusionModelProviderName = "Fusion";

export type ParsedProfileModelValue = {
  model: string;
  provider: string;
};

export function profileModelProviderOptions(
  providers: GatewayProviderConfig[],
  virtualModelProfiles: VirtualModelProfileConfig[] = []
): ProfileModelProviderOption[] {
  const providerOptions = providers
    .filter((provider) => isGatewayProviderEnabled(provider) && provider.name?.trim() && Array.isArray(provider.models))
    .map((provider) => ({
      modelDisplayNames: profileModelDisplayNamesForModels(provider.modelDisplayNames, provider.models),
      models: uniqueStrings(provider.models.filter(Boolean)),
      name: provider.name.trim()
    }))
    .filter((provider) => provider.models.length > 0);
  const fusionModels = virtualModelProfileModelNames(virtualModelProfiles);
  return fusionModels.length > 0
    ? [...providerOptions, { models: fusionModels, name: fusionModelProviderName }]
    : providerOptions;
}

export function parseProfileModelValue(
  value: string,
  providers: GatewayProviderConfig[],
  virtualModelProfiles: VirtualModelProfileConfig[] = []
): ParsedProfileModelValue {
  const trimmed = normalizeProfileClientModel(value);
  if (!trimmed) {
    return { model: "", provider: "" };
  }
  const providerOptions = profileModelProviderOptions(providers, virtualModelProfiles);
  for (const provider of providerOptions) {
    const slashPrefix = `${provider.name}/`;
    if (trimmed.startsWith(slashPrefix)) {
      return { model: trimmed.slice(slashPrefix.length).trim(), provider: provider.name };
    }
  }
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    return {
      model: trimmed.slice(slashIndex + 1).trim(),
      provider: trimmed.slice(0, slashIndex).trim()
    };
  }
  return { model: trimmed, provider: "" };
}

export function profileModelDisplayValue(
  value: string,
  parsedValue: ParsedProfileModelValue,
  providers: GatewayProviderConfig[],
  placeholder: string | undefined,
  virtualModelProfiles: VirtualModelProfileConfig[] = []
): string {
  if (!value.trim()) {
    return placeholder?.trim() || "";
  }
  const normalized = normalizeProfileClientModel(value);
  if (parsedValue.provider && parsedValue.model) {
    const provider = profileModelProviderOptions(providers, virtualModelProfiles).find((item) => item.name === parsedValue.provider);
    return `${parsedValue.provider}/${profileModelOptionDisplayName(provider, parsedValue.model)}`;
  }
  const provider = profileModelProviderOptions(providers, virtualModelProfiles).find((item) => item.models.includes(normalized));
  return provider ? `${provider.name}/${profileModelOptionDisplayName(provider, normalized)}` : normalized;
}

export function profileModelProviderMatchesQuery(provider: ProfileModelProviderOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return (
    provider.name.toLowerCase().includes(normalizedQuery) ||
    provider.models.some((model) =>
      model.toLowerCase().includes(normalizedQuery) ||
      profileModelOptionDisplayName(provider, model).toLowerCase().includes(normalizedQuery)
    )
  );
}

export function profileModelMatchesQuery(providerName: string, model: string, query: string, displayName?: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return providerName.toLowerCase().includes(normalizedQuery) ||
    model.toLowerCase().includes(normalizedQuery) ||
    (displayName ?? "").toLowerCase().includes(normalizedQuery);
}

export function profileModelOptionDisplayName(provider: ProfileModelProviderOption | undefined, model: string): string {
  return provider?.modelDisplayNames?.[model]?.trim() || model;
}

function profileModelDisplayNamesForModels(
  value: Record<string, string> | undefined,
  models: string[]
): Record<string, string> | undefined {
  const modelIds = new Set(models);
  const entries = Object.entries(value ?? {})
    .map(([rawModel, rawDisplayName]) => [rawModel.trim(), rawDisplayName.trim()] as const)
    .filter(([model, displayName]) => model && displayName && model !== displayName && modelIds.has(model));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export type BotGatewayAuthInputType = "text" | "password";

export type BotGatewayAuthFieldSpec = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: BotGatewayAuthInputType;
};

export type BotGatewayAuthSpec = {
  fields: readonly BotGatewayAuthFieldSpec[];
  label: string;
  value: string;
};

export type BotGatewayPlatformSpec = {
  auth: readonly BotGatewayAuthSpec[];
  label: string;
  value: string;
};

const botGatewayPlatformSpecs: readonly BotGatewayPlatformSpec[] = [
  {
    value: "weixin-ilink",
    label: "Weixin iLink",
    auth: [
      { value: "qr_login", label: "QR Login", fields: [] },
      {
        value: "bot_token",
        label: "Bot Token",
        fields: [
          { key: "botToken", label: "Bot Token", required: true, type: "password" },
          { key: "accountId", label: "Account ID" },
          { key: "userId", label: "User ID" }
        ]
      }
    ]
  },
  {
    value: "wecom",
    label: "WeCom",
    auth: [
      {
        value: "app_secret",
        label: "App Secret",
        fields: [
          { key: "corpId", label: "Corp ID", required: true },
          { key: "agentId", label: "Agent ID", required: true },
          { key: "secret", label: "Secret", required: true, type: "password" }
        ]
      }
    ]
  },
  {
    value: "slack",
    label: "Slack",
    auth: [
      {
        value: "bot_token",
        label: "Bot Token",
        fields: [
          { key: "botToken", label: "Bot Token", placeholder: "xoxb-...", required: true, type: "password" },
          { key: "signingSecret", label: "Signing Secret", type: "password" },
          { key: "appToken", label: "App Token", placeholder: "xapp-...", type: "password" }
        ]
      },
      {
        value: "oauth2",
        label: "OAuth 2.0",
        fields: [
          { key: "botToken", label: "OAuth Bot Token", placeholder: "xoxb-...", required: true, type: "password" },
          { key: "signingSecret", label: "Signing Secret", type: "password" }
        ]
      }
    ]
  },
  {
    value: "discord",
    label: "Discord",
    auth: [
      {
        value: "bot_token",
        label: "Bot Token",
        fields: [
          { key: "botToken", label: "Bot Token", required: true, type: "password" },
          { key: "applicationId", label: "Application ID" },
          { key: "publicKey", label: "Public Key" }
        ]
      },
      {
        value: "oauth2",
        label: "OAuth 2.0",
        fields: [
          { key: "botToken", label: "OAuth Access Token", required: true, type: "password" },
          { key: "applicationId", label: "Application ID" },
          { key: "publicKey", label: "Public Key" }
        ]
      }
    ]
  },
  {
    value: "telegram",
    label: "Telegram",
    auth: [
      {
        value: "bot_token",
        label: "Bot Token",
        fields: [{ key: "botToken", label: "Bot Token", required: true, type: "password" }]
      }
    ]
  },
  {
    value: "line",
    label: "LINE",
    auth: [
      {
        value: "bot_token",
        label: "Bot Token",
        fields: [
          { key: "channelAccessToken", label: "Channel Access Token", required: true, type: "password" },
          { key: "channelSecret", label: "Channel Secret", type: "password" }
        ]
      }
    ]
  },
  {
    value: "feishu",
    label: "Feishu",
    auth: [
      {
        value: "app_secret",
        label: "App Secret",
        fields: [
          { key: "appId", label: "App ID", required: true },
          { key: "appSecret", label: "App Secret", required: true, type: "password" },
          { key: "verificationToken", label: "Verification Token", type: "password" },
          { key: "domain", label: "Domain" }
        ]
      }
    ]
  },
  {
    value: "dingtalk",
    label: "DingTalk",
    auth: [
      {
        value: "app_secret",
        label: "App Secret",
        fields: [
          { key: "appKey", label: "App Key", required: true },
          { key: "appSecret", label: "App Secret", required: true, type: "password" },
          { key: "robotCode", label: "Robot Code" }
        ]
      }
    ]
  },
  {
    value: "imessage",
    label: "iMessage",
    auth: [{ value: "local", label: "Local App", fields: [] }]
  }
];

export const botGatewayPlatformOptions = botGatewayPlatformSpecs.map(({ label, value }) => ({ label, value }));

export function botGatewayPlatformLabel(platform: string): string {
  const normalized = normalizeBotGatewayPlatform(platform);
  if (normalized === "none") {
    return "Bot";
  }
  return botGatewayPlatformOptions.find((option) => option.value === normalized)?.label ?? normalized;
}

export function botGatewayAuthSpecsForPlatform(platform: string): readonly BotGatewayAuthSpec[] {
  const normalized = normalizeBotGatewayPlatform(platform);
  if (normalized === "none") {
    return [];
  }
  return botGatewayPlatformSpecs.find((option) => option.value === normalized)?.auth || [];
}

export function botGatewayFieldsForAuth(platform: string, authType: string): readonly BotGatewayAuthFieldSpec[] {
  const normalizedAuthType = normalizeBotGatewayAuthType(platform, authType);
  return botGatewayAuthSpecsForPlatform(platform).find((option) => option.value === normalizedAuthType)?.fields || [];
}

export function botGatewayDefaultAuthType(platform: string): string {
  return botGatewayAuthSpecsForPlatform(platform)[0]?.value || "";
}

export function botGatewayPickAuthFields(fields: Record<string, unknown> | undefined, platform: string, authType: string): Record<string, string> {
  const allowedKeys = new Set(botGatewayFieldsForAuth(platform, authType).map((field) => field.key));
  if (allowedKeys.size === 0) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(fields || {})) {
    const normalizedKey = key.trim();
    const value = String(rawValue ?? "").trim();
    if (normalizedKey && value && allowedKeys.has(normalizedKey) && !isWebhookRelatedBotGatewayKey(normalizedKey)) {
      result[normalizedKey] = value;
    }
  }
  return result;
}

function createBotGatewayDraft(botGateway?: BotGatewayRuntimeConfig) {
  const bot = normalizeBotGatewayRuntimeConfig(botGateway) ?? fallbackConfig.botGateway;
  const platform = bot.platform || "none";
  const authType = normalizeBotGatewayAuthType(platform, bot.authType ?? "");
  return {
    botConfigId: "",
    botAuthFields: botGatewayPickAuthFields({ ...(bot.integrationConfig ?? {}), ...(bot.credentials ?? {}) }, platform, authType),
    botAuthType: authType,
    botConfigured: Boolean(botGateway),
    botEnabled: Boolean(bot.enabled),
    botForwardAllAgentMessages: bot.forwardAllAgentMessages !== false,
    botHandoffEnabled: Boolean(bot.handoff.enabled),
    botHandoffIdleSeconds: String(bot.handoff.idleSeconds ?? fallbackConfig.botGateway.handoff.idleSeconds),
    botHandoffPhoneBluetoothTargets: (bot.handoff.phoneBluetoothTargets ?? []).join("\n"),
    botHandoffPhoneWifiTargets: (bot.handoff.phoneWifiTargets ?? []).join("\n"),
    botPlatform: bot.platform || "none"
  };
}

export function createProfileDraft(agent: ProfileConfig["agent"] = "claude-code", name?: string): AddProfileDraft {
  const surface = agent === "zcode" ? "app" : "cli";
  return {
    agent,
    appPath: "",
    availableModels: [],
    ...createBotGatewayDraft(),
    configFile: defaultCodexConfigFile(agent),
    envRows: agent === "claude-code" ? keyValueRowsFromRecord(claudeCodeProfileEnv()) : [],
    managedCompact: false,
    model: "",
    name: name ?? profileAgentLabel(agent),
    providerId: "claude-code-router",
    providerName: "Claude Code Router",
    scope: "ccr",
    settingsFile: "~/.claude/settings.json",
    showAllSessions: false,
    smallFastModel: "",
    surface
  };
}

export function profileDraftWithDetectedAppPath(
  draft: AddProfileDraft,
  chatgptAppPath?: string,
  opencodeAppPath?: string
): AddProfileDraft {
  const detectedPath = (draft.agent === "codex" ? chatgptAppPath : draft.agent === "opencode" ? opencodeAppPath : "")?.trim() || "";
  if (draft.appPath.trim() || !detectedPath) {
    return draft;
  }
  return { ...draft, appPath: detectedPath };
}

export function createProfileDraftFromProfile(profile: ProfileConfig, botConfigs: BotGatewaySavedConfig[] = []): AddProfileDraft {
  const botDraft = createBotGatewayDraft(profile.botGateway);
  const botConfigId = profile.botConfigId || matchingBotConfigId(profile.botGateway, botConfigs);
  const selectedBot = botConfigId ? botConfigs.find((config) => config.id === botConfigId) : undefined;
  if (profile.agent === "claude-code") {
    const surface = normalizeProfileSurfaceForForm(profile.surface);
    return {
      ...createProfileDraft("claude-code", profile.name),
      ...botDraft,
      appPath: profile.appPath ?? "",
      botConfigId,
      botEnabled: surface !== "cli" && Boolean(selectedBot || profile.botGateway?.enabled),
      envRows: keyValueRowsFromRecord(claudeCodeProfileEnv(profile.env ?? {})),
      managedCompact: Boolean(profile.managedCompact),
      model: profile.model,
      scope: normalizeProfileFormScope(profile.scope),
      settingsFile: profile.settingsFile ?? "~/.claude/settings.json",
      smallFastModel: profile.smallFastModel ?? "",
      surface
    };
  }
  if (profile.agent === "grok" || profile.agent === "kimi") {
    return {
      ...createProfileDraft(profile.agent, profile.name),
      availableModels: profile.agent === "kimi"
        ? uniqueStrings([profile.model, ...(profile.availableModels ?? [])].map(normalizeProfileClientModel).filter(Boolean))
        : [],
      envRows: keyValueRowsFromRecord(codexCompatibleProfileEnv(profile.env ?? {})),
      model: profile.model,
      scope: "ccr",
      surface: "cli"
    };
  }
  const surface = profile.agent === "zcode" ? "app" : normalizeProfileSurfaceForForm(profile.surface);
  return {
    ...createProfileDraft(profile.agent, profile.name),
    ...botDraft,
    appPath: profile.appPath ?? "",
    botConfigId,
    botEnabled: surface !== "cli" && Boolean(selectedBot || profile.botGateway?.enabled),
    configFile: profile.configFile ?? defaultCodexConfigFile(profile.agent),
    envRows: keyValueRowsFromRecord(codexCompatibleProfileEnv(profile.env ?? {})),
    managedCompact: Boolean(profile.managedCompact),
    model: profile.model,
    providerId: profile.providerId ?? "claude-code-router",
    providerName: profile.providerName ?? "Claude Code Router",
    scope: normalizeProfileFormScope(profile.scope),
    showAllSessions: profile.agent === "zcode" || profile.agent === "opencode" ? false : Boolean(profile.showAllSessions),
    surface
  };
}

export function isProfileDraftSubmittable(draft: AddProfileDraft): boolean {
  if (!draft.name.trim()) {
    return false;
  }
  if (!validateProfileEnvRows(draft.envRows)) {
    return false;
  }
  const botAllowed = draft.surface !== "cli";
  if (botAllowed && draft.botEnabled && !draft.botConfigId.trim()) {
    return false;
  }
  if (botAllowed && draft.botEnabled && draft.botHandoffEnabled && !isNumberDraftValid(draft.botHandoffIdleSeconds, 30, 86_400)) {
    return false;
  }
  if (draft.agent === "claude-code") {
    return true;
  }
  if (draft.agent === "grok") {
    return true;
  }
  if (draft.agent === "kimi") {
    return Boolean(draft.model.trim()) && draft.availableModels.length > 0;
  }
  return (
    Boolean(draft.providerId.trim()) &&
    Boolean(draft.providerName.trim())
  );
}

function matchingBotConfigId(botGateway: BotGatewayRuntimeConfig | undefined, botConfigs: BotGatewaySavedConfig[]): string {
  if (!botGateway?.enabled) {
    return "";
  }
  const integrationId = botGateway.integrationId?.trim();
  const matched = botConfigs.find((config) =>
    (integrationId && config.botGateway.integrationId === integrationId) ||
    (config.botGateway.platform === botGateway.platform && config.botGateway.tenantId === botGateway.tenantId)
  );
  return matched?.id ?? "";
}

export function profileConfigFromDraft(
  draft: AddProfileDraft,
  existingProfiles: ProfileConfig[],
  existingProfile?: ProfileConfig,
  botConfigs: BotGatewaySavedConfig[] = []
): ProfileConfig {
  const id = existingProfile?.id ?? uniqueProfileId(existingProfiles, draft.name || draft.agent);
  const botAllowed = draft.surface !== "cli";
  const selectedBot = botAllowed && draft.botEnabled
    ? botConfigs.find((config) => config.id === draft.botConfigId.trim())
    : undefined;
  const botGateway = selectedBot
    ? {
        botConfigId: selectedBot.id,
        botGateway: {
          ...selectedBot.botGateway,
          forwardAllAgentMessages: draft.botForwardAllAgentMessages,
          handoff: botGatewayHandoffFromProfileDraft(draft, selectedBot.botGateway.handoff)
        }
      }
    : {};
  return normalizeProfileItem({
    agent: draft.agent,
    appPath: draft.appPath,
    availableModels: draft.agent === "kimi" ? draft.availableModels : undefined,
    ...botGateway,
    configFile: draft.configFile,
    enabled: existingProfile?.enabled ?? true,
    env: draft.agent === "claude-code" ? recordFromKeyValueRows(draft.envRows) : codexCompatibleProfileEnv(recordFromKeyValueRows(draft.envRows)),
    id,
    managedCompact: draft.managedCompact,
    model: draft.model,
    name: draft.name,
    providerId: draft.providerId,
    providerName: draft.providerName,
    scope: draft.scope,
    settingsFile: draft.settingsFile,
    showAllSessions: draft.agent === "zcode" || draft.agent === "opencode" ? false : draft.showAllSessions,
    smallFastModel: draft.smallFastModel,
    surface: draft.surface
  }, existingProfiles.length);
}

function botGatewayHandoffFromProfileDraft(
  draft: AddProfileDraft,
  fallback: BotGatewayRuntimeConfig["handoff"] = fallbackConfig.botGateway.handoff
): BotGatewayRuntimeConfig["handoff"] {
  return {
    ...fallbackConfig.botGateway.handoff,
    ...fallback,
    enabled: draft.botHandoffEnabled,
    idleSeconds: numberDraftValue(draft.botHandoffIdleSeconds, fallback.idleSeconds ?? fallbackConfig.botGateway.handoff.idleSeconds, 30, 86_400),
    phoneBluetoothTargets: splitDraftLines(draft.botHandoffPhoneBluetoothTargets).slice(0, 1),
    phoneWifiTargets: splitDraftLines(draft.botHandoffPhoneWifiTargets).slice(0, 1),
    screenLock: fallback.screenLock ?? fallbackConfig.botGateway.handoff.screenLock,
    userIdle: fallback.userIdle ?? fallbackConfig.botGateway.handoff.userIdle
  };
}

export function createBotGatewayConfigDraft(config?: BotGatewaySavedConfig): BotGatewayConfigDraft {
  const botDraft = createBotGatewayDraft(config?.botGateway);
  const bot = normalizeBotGatewayRuntimeConfig(config?.botGateway) ?? fallbackConfig.botGateway;
  return {
    botAuthFields: botDraft.botAuthFields,
    botAuthType: botDraft.botAuthType,
    botForwardAllAgentMessages: botDraft.botForwardAllAgentMessages,
    botHandoffEnabled: botDraft.botHandoffEnabled,
    botHandoffIdleSeconds: botDraft.botHandoffIdleSeconds,
    botHandoffPhoneBluetoothTargets: botDraft.botHandoffPhoneBluetoothTargets,
    botHandoffPhoneWifiTargets: botDraft.botHandoffPhoneWifiTargets,
    botLanguage: bot.language,
    botMaxAttachmentMb: String(Math.max(1, Math.round(bot.maxAttachmentBytes / (1024 * 1024)))),
    botMaxTurnMinutes: String(Math.max(1, Math.round(bot.maxTurnTimeMs / 60_000))),
    botMediaEnabled: bot.mediaEnabled,
    botMessageChunkChars: String(bot.messageChunkChars),
    botPlatform: botDraft.botPlatform === "none" ? "weixin-ilink" : botDraft.botPlatform,
    botSessionIdleMinutes: String(bot.sessionIdleMinutes),
    botShellEnabled: bot.shellEnabled,
    botStreamReplies: bot.streamReplies,
    name: config?.name ?? ""
  };
}

export function isBotGatewayConfigDraftSubmittable(draft: BotGatewayConfigDraft): boolean {
  if (!draft.name.trim()) {
    return false;
  }
  const platform = normalizeBotGatewayPlatform(draft.botPlatform);
  const authType = normalizeBotGatewayAuthType(platform, draft.botAuthType);
  if (!platform || platform === "none") {
    return false;
  }
  return (
    botGatewayMissingRequiredAuthFields(draft.botAuthFields, platform, authType).length === 0
  );
}

export function botGatewaySavedConfigFromDraft(
  draft: BotGatewayConfigDraft,
  existingConfigs: BotGatewaySavedConfig[],
  existingConfig?: BotGatewaySavedConfig
): BotGatewaySavedConfig {
  const id = existingConfig?.id ?? uniqueBotGatewayConfigId(existingConfigs, draft.name);
  const name = draft.name.trim() || botGatewayPlatformLabel(draft.botPlatform);
  return normalizeBotGatewaySavedConfig({
    botGateway: botGatewayConfigFromDraft({ ...draft, botEnabled: true }, id, name, existingConfig?.botGateway),
    id,
    name,
    updatedAt: new Date().toISOString()
  }) ?? {
    botGateway: fallbackConfig.botGateway,
    id,
    name
  };
}

type BotGatewayConfigDraftInput = BotGatewayConfigDraft & {
  botEnabled?: boolean;
};

function botGatewayConfigFromDraft(
  draft: BotGatewayConfigDraftInput,
  configId: string,
  configName: string,
  existingBotGateway?: BotGatewayRuntimeConfig
): BotGatewayRuntimeConfig {
  const platform = normalizeBotGatewayPlatform(draft.botPlatform);
  const authType = normalizeBotGatewayAuthType(platform, draft.botAuthType);
  const authPayload = botGatewayAuthPayload(platform, authType, draft.botAuthFields);
  const config: BotGatewayRuntimeConfig = {
    ...fallbackConfig.botGateway,
    acknowledgeEvents: true,
    args: [],
    authType,
    autoStartIntegration: true,
    command: "",
    createIntegration: draft.botEnabled !== false && platform !== "none" && authType !== "qr_login",
    credentials: authPayload.credentials,
    cwd: "",
    enabled: draft.botEnabled !== false,
    forwardAllAgentMessages: draft.botForwardAllAgentMessages,
    handoff: {
      ...fallbackConfig.botGateway.handoff
    },
    integrationConfig: authPayload.integrationConfig,
    integrationId: existingBotGateway?.integrationId?.trim() || createBotGatewayIntegrationId(configId),
    language: draft.botLanguage,
    maxAttachmentBytes: numberDraftValue(draft.botMaxAttachmentMb, 20, 1, 100) * 1024 * 1024,
    maxTurnTimeMs: numberDraftValue(draft.botMaxTurnMinutes, 10, 1, 60) * 60_000,
    mediaEnabled: draft.botMediaEnabled,
    messageChunkChars: numberDraftValue(draft.botMessageChunkChars, 3500, 500, 20_000),
    platform,
    pollIntervalMs: fallbackConfig.botGateway.pollIntervalMs,
    requestTimeoutMs: fallbackConfig.botGateway.requestTimeoutMs,
    sessionIdleMinutes: numberDraftValue(draft.botSessionIdleMinutes, 0, 0, 43_200),
    shellEnabled: draft.botShellEnabled,
    sourceDir: "",
    startupTimeoutMs: fallbackConfig.botGateway.startupTimeoutMs,
    stateDir: existingBotGateway?.stateDir?.trim() || createBotGatewayStateDir(configId),
    streamReplies: draft.botStreamReplies,
    tenantId: existingBotGateway?.tenantId?.trim() || createBotGatewayTenantId(configName || configId)
  };
  return config;
}

function botGatewayMissingRequiredAuthFields(fields: Record<string, string>, platform: string, authType: string): BotGatewayAuthFieldSpec[] {
  return botGatewayFieldsForAuth(platform, authType).filter((field) => field.required && !fields[field.key]?.trim());
}

function botGatewayAuthPayload(platform: string, authType: string, fields: Record<string, string>) {
  const authFields = botGatewayPickAuthFields(fields, platform, authType);
  const credentials: Record<string, unknown> = {};
  const integrationConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(authFields)) {
    if (isBotGatewayIntegrationConfigField(platform, key)) {
      integrationConfig[key] = botGatewayConfigValue(key, value);
    } else {
      credentials[key] = value;
    }
  }
  return {
    credentials: sanitizeBotGatewayRecord(credentials),
    integrationConfig: websocketBotGatewayIntegrationConfig(platform, integrationConfig)
  };
}

function isBotGatewayIntegrationConfigField(platform: string, key: string): boolean {
  return (
    [
      "transport",
      "dryRun",
      "applicationId",
      "publicKey",
      "appId",
      "appKey",
      "corpId",
      "agentId",
      "robotCode"
    ].includes(key) ||
    (platform === "weixin-ilink" && ["accountId", "userId", "botAgent", "routeTag"].includes(key)) ||
    (platform === "feishu" && ["domain", "appType", "receiveIdType", "tenantKey", "tenantAccessToken"].includes(key))
  );
}

function botGatewayConfigValue(key: string, value: string): unknown {
  if (key === "dryRun") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return value;
}

function createBotGatewayTenantId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "ccr";
}

function createBotGatewayIntegrationId(profileId: string): string {
  if (isUuidLike(profileId)) {
    return profileId;
  }
  return globalThis.crypto?.randomUUID?.() ?? `bot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBotGatewayStateDir(configId: string): string {
  const safe = configId.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
  return `~/.claude-code-router/bot-gateway/${safe}`;
}

function uniqueBotGatewayConfigId(configs: BotGatewaySavedConfig[], value: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid && !configs.some((config) => config.id === uuid)) {
    return uuid;
  }
  const base = createBotGatewayTenantId(value || "bot");
  const existingIds = new Set(configs.map((config) => config.id));
  if (!existingIds.has(base)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function normalizeBotGatewaySavedConfigs(value: unknown): BotGatewaySavedConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: BotGatewaySavedConfig[] = [];
  for (const item of value) {
    const normalized = normalizeBotGatewaySavedConfig(item, result.length);
    if (!normalized || result.some((config) => config.id === normalized.id)) {
      continue;
    }
    result.push(normalized);
  }
  return result;
}

function normalizeBotGatewaySavedConfig(value: unknown, index = 0): BotGatewaySavedConfig | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const botGateway = normalizeBotGatewayRuntimeConfig(value.botGateway ?? value.bot_gateway ?? value.bot ?? value.config);
  if (!botGateway?.enabled || !botGateway.platform || botGateway.platform === "none") {
    return undefined;
  }
  const id = stringValue(value.id) || stringValue(value.savedConfigId) || stringValue(value.saved_config_id) || botGateway.integrationId || `bot-${index + 1}`;
  const name = stringValue(value.name) || botGatewayPlatformLabel(botGateway.platform);
  const updatedAt = stringValue(value.updatedAt) || stringValue(value.updated_at);
  return {
    botGateway,
    id,
    name,
    ...(updatedAt ? { updatedAt } : {})
  };
}

export function botGatewaySavedConfigLabel(config: BotGatewaySavedConfig, translate: (value: string) => string): string {
  const name = config.name.trim() || translate(botGatewayPlatformLabel(config.botGateway.platform));
  const platform = translate(botGatewayPlatformLabel(config.botGateway.platform));
  return name === platform ? name : `${name} / ${platform}`;
}

function splitDraftLines(value: string): string[] {
  return uniqueStrings(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function isNumberDraftValid(value: string, min: number, max: number): boolean {
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}

function numberDraftValue(value: string, fallback: number, min: number, max: number): number {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeCodexConfigFormat(_value: unknown): CodexProfileConfigFormat {
  return "separate_profile_files";
}

export function normalizeProfileScope(value: unknown): ProfileScope {
  return normalizeProfileScopeValue(value);
}

export function normalizeProfileFormScope(value: unknown): ProfileScope {
  const scope = normalizeProfileScope(value);
  return scope === "custom" ? "ccr" : scope;
}

export function normalizeProfileSurface(value: unknown): ProfileSurface {
  return value === "cli" || value === "app" ? value : "auto";
}

export function normalizeProfileSurfaceForForm(value: unknown): ProfileSurface {
  return normalizeProfileSurface(value);
}

export function claudeCodeProfileEnv(env: Record<string, string> = {}): Record<string, string> {
  return {
    ...CLAUDE_CODE_DEFAULT_ENV,
    ...env
  };
}

function codexCompatibleProfileEnv(env: Record<string, string>): Record<string, string> {
  const { [CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV]: _ignored, ...result } = env;
  return result;
}

export function profileEnvRowsForAgent(agent: ProfileConfig["agent"], envRows: AddProfileDraft["envRows"]): AddProfileDraft["envRows"] {
  if (agent === "claude-code") {
    return envRows;
  }
  return envRows.filter((row) => row.key.trim() !== CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV);
}

export function normalizeBotGatewayPlatform(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized || normalized === "off" || normalized === "disabled") {
    return "none";
  }
  if (normalized === "lark") {
    return "feishu";
  }
  if (normalized === "dingding") {
    return "dingtalk";
  }
  if (["wechat", "weixin", "wx", "weixin-ilink", "weixin_ilink", "ilink"].includes(normalized)) {
    return "weixin-ilink";
  }
  if (["wecom", "wework", "wechat-work", "work-weixin", "enterprise-wechat"].includes(normalized)) {
    return "wecom";
  }
  return botGatewayPlatformOptions.some((option) => option.value === normalized) ? normalized : "none";
}

export function normalizeBotGatewayAuthType(platform: string, value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/-/g, "_") : "";
  if (!platform || platform === "none") {
    return "";
  }
  if (!normalized || normalized === "default" || normalized === "auto" || normalized === "webhook" || normalized === "webhook_secret" || normalized === "outgoing_webhook") {
    return defaultBotGatewayAuthType(platform);
  }
  if (normalized === "appsecret") {
    return authTypeAllowedForPlatform(platform, "app_secret");
  }
  if (normalized === "bottoken" || normalized === "token") {
    return authTypeAllowedForPlatform(platform, "bot_token");
  }
  if (normalized === "oauth" || normalized === "oauth_2") {
    return authTypeAllowedForPlatform(platform, "oauth2");
  }
  if (["qr", "qr_login", "qrcode", "qr_code"].includes(normalized)) {
    return authTypeAllowedForPlatform(platform, "qr_login");
  }
  return authTypeAllowedForPlatform(platform, normalized);
}

function defaultBotGatewayAuthType(platform: string): string {
  return botGatewayDefaultAuthType(platform);
}

function authTypeAllowedForPlatform(platform: string, value: string): string {
  return botGatewayAuthSpecsForPlatform(platform).some((option) => option.value === value)
    ? value
    : defaultBotGatewayAuthType(platform);
}

function websocketBotGatewayIntegrationConfig(platform: string, value: Record<string, unknown>): Record<string, unknown> {
  const config = sanitizeBotGatewayRecord(value);
  delete config.transport;
  delete config.sendMode;
  const transport = botGatewayWebSocketTransport(platform);
  return transport ? { ...config, transport } : config;
}

function botGatewayWebSocketTransport(platform: string): string {
  if (!platform || platform === "none") {
    return "";
  }
  return platform === "slack" ? "socket" : "websocket";
}

function sanitizeBotGatewayRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!isPlainRecord(value)) {
    return result;
  }
  for (const [key, rawValue] of Object.entries(value)) {
    if (!key.trim() || isWebhookRelatedBotGatewayKey(key)) {
      continue;
    }
    result[key] = rawValue;
  }
  return result;
}

function isWebhookRelatedBotGatewayKey(key: string): boolean {
  const normalized = key.trim().toLowerCase().replace(/[_-]+/g, "");
  return normalized.includes("webhook") || normalized === "sendmode";
}

export function normalizeBotGatewayRuntimeConfig(value: unknown): BotGatewayRuntimeConfig | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const record = value as Partial<BotGatewayRuntimeConfig> & Record<string, unknown>;
  const handoffRecord: Record<string, unknown> = isPlainRecord(record.handoff) ? record.handoff : {};
  const platform = normalizeBotGatewayPlatform(record.platform);
  const conversationRef = normalizeBotGatewayConversationRef(record.conversationRef ?? record.conversation_ref ?? record.conversation);
  const config: BotGatewayRuntimeConfig = {
    ...fallbackConfig.botGateway,
    ...record,
    acknowledgeEvents: typeof record.acknowledgeEvents === "boolean" ? record.acknowledgeEvents : fallbackConfig.botGateway.acknowledgeEvents,
    args: Array.isArray(record.args) ? record.args.filter((item): item is string => typeof item === "string") : fallbackConfig.botGateway.args,
    authType: normalizeBotGatewayAuthType(platform, typeof record.authType === "string" ? record.authType : fallbackConfig.botGateway.authType),
    autoStartIntegration: typeof record.autoStartIntegration === "boolean" ? record.autoStartIntegration : fallbackConfig.botGateway.autoStartIntegration,
    command: typeof record.command === "string" ? record.command : fallbackConfig.botGateway.command,
    createIntegration: typeof record.createIntegration === "boolean" ? record.createIntegration : fallbackConfig.botGateway.createIntegration,
    credentials: sanitizeBotGatewayRecord(isPlainRecord(record.credentials) ? record.credentials : {}),
    cwd: typeof record.cwd === "string" ? record.cwd : fallbackConfig.botGateway.cwd,
    enabled: typeof record.enabled === "boolean" ? record.enabled : fallbackConfig.botGateway.enabled,
    forwardAllAgentMessages: typeof record.forwardAllAgentMessages === "boolean" ? record.forwardAllAgentMessages : fallbackConfig.botGateway.forwardAllAgentMessages,
    handoff: {
      ...fallbackConfig.botGateway.handoff,
      ...handoffRecord,
      enabled: typeof handoffRecord.enabled === "boolean" ? handoffRecord.enabled : fallbackConfig.botGateway.handoff.enabled,
      idleSeconds: Number.isFinite(Number(handoffRecord.idleSeconds))
        ? numberDraftValue(String(handoffRecord.idleSeconds), fallbackConfig.botGateway.handoff.idleSeconds, 30, 86_400)
        : fallbackConfig.botGateway.handoff.idleSeconds,
      phoneBluetoothTargets: Array.isArray(handoffRecord.phoneBluetoothTargets)
        ? handoffRecord.phoneBluetoothTargets.filter((item): item is string => typeof item === "string").slice(0, 1)
        : fallbackConfig.botGateway.handoff.phoneBluetoothTargets,
      phoneWifiTargets: Array.isArray(handoffRecord.phoneWifiTargets)
        ? handoffRecord.phoneWifiTargets.filter((item): item is string => typeof item === "string").slice(0, 1)
        : fallbackConfig.botGateway.handoff.phoneWifiTargets,
      screenLock: typeof handoffRecord.screenLock === "boolean" ? handoffRecord.screenLock : fallbackConfig.botGateway.handoff.screenLock,
      userIdle: typeof handoffRecord.userIdle === "boolean" ? handoffRecord.userIdle : fallbackConfig.botGateway.handoff.userIdle
    },
    integrationConfig: websocketBotGatewayIntegrationConfig(platform, isPlainRecord(record.integrationConfig) ? record.integrationConfig : {}),
    integrationId: typeof record.integrationId === "string" ? record.integrationId : fallbackConfig.botGateway.integrationId,
    language: record.language === "en" || record.language === "zh-CN" || record.language === "auto" ? record.language : fallbackConfig.botGateway.language,
    maxAttachmentBytes: Number.isFinite(Number(record.maxAttachmentBytes))
      ? numberDraftValue(String(record.maxAttachmentBytes), fallbackConfig.botGateway.maxAttachmentBytes, 1024, 100 * 1024 * 1024)
      : fallbackConfig.botGateway.maxAttachmentBytes,
    maxTurnTimeMs: Number.isFinite(Number(record.maxTurnTimeMs))
      ? numberDraftValue(String(record.maxTurnTimeMs), fallbackConfig.botGateway.maxTurnTimeMs, 10_000, 3_600_000)
      : fallbackConfig.botGateway.maxTurnTimeMs,
    mediaEnabled: typeof record.mediaEnabled === "boolean" ? record.mediaEnabled : fallbackConfig.botGateway.mediaEnabled,
    messageChunkChars: Number.isFinite(Number(record.messageChunkChars))
      ? numberDraftValue(String(record.messageChunkChars), fallbackConfig.botGateway.messageChunkChars, 500, 20_000)
      : fallbackConfig.botGateway.messageChunkChars,
    platform,
    pollIntervalMs: Number.isFinite(Number(record.pollIntervalMs))
      ? numberDraftValue(String(record.pollIntervalMs), fallbackConfig.botGateway.pollIntervalMs, 500, 60_000)
      : fallbackConfig.botGateway.pollIntervalMs,
    requestTimeoutMs: Number.isFinite(Number(record.requestTimeoutMs))
      ? numberDraftValue(String(record.requestTimeoutMs), fallbackConfig.botGateway.requestTimeoutMs, 1000, 3_600_000)
      : fallbackConfig.botGateway.requestTimeoutMs,
    sessionIdleMinutes: Number.isFinite(Number(record.sessionIdleMinutes))
      ? numberDraftValue(String(record.sessionIdleMinutes), fallbackConfig.botGateway.sessionIdleMinutes, 0, 43_200)
      : fallbackConfig.botGateway.sessionIdleMinutes,
    shellEnabled: typeof record.shellEnabled === "boolean" ? record.shellEnabled : fallbackConfig.botGateway.shellEnabled,
    sourceDir: typeof record.sourceDir === "string" ? record.sourceDir : fallbackConfig.botGateway.sourceDir,
    startupTimeoutMs: Number.isFinite(Number(record.startupTimeoutMs))
      ? numberDraftValue(String(record.startupTimeoutMs), fallbackConfig.botGateway.startupTimeoutMs, 1000, 120_000)
      : fallbackConfig.botGateway.startupTimeoutMs,
    stateDir: typeof record.stateDir === "string" ? record.stateDir : fallbackConfig.botGateway.stateDir,
    streamReplies: typeof record.streamReplies === "boolean" ? record.streamReplies : fallbackConfig.botGateway.streamReplies,
    tenantId: typeof record.tenantId === "string" ? record.tenantId : fallbackConfig.botGateway.tenantId
  };
  if (conversationRef) {
    config.conversationRef = conversationRef;
  } else {
    delete config.conversationRef;
  }
  return config;
}

function normalizeBotGatewayConversationRef(value: unknown): BotGatewayRuntimeConfig["conversationRef"] {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const gatewayConversationId = typeof value.gatewayConversationId === "string"
    ? value.gatewayConversationId
    : typeof value.gateway_conversation_id === "string"
      ? value.gateway_conversation_id
      : "";
  const platformConversationId = typeof value.platformConversationId === "string"
    ? value.platformConversationId
    : typeof value.platform_conversation_id === "string"
      ? value.platform_conversation_id
      : typeof value.conversationId === "string"
        ? value.conversationId
        : typeof value.chatId === "string"
          ? value.chatId
          : typeof value.channelId === "string"
            ? value.channelId
            : "";
  if (!gatewayConversationId.trim() && !platformConversationId.trim()) {
    return undefined;
  }
  const type = value.type === "group" || value.type === "channel" || value.type === "thread" ? value.type : "dm";
  const threadId = typeof value.threadId === "string"
    ? value.threadId
    : typeof value.thread_id === "string"
      ? value.thread_id
      : "";
  return {
    ...(gatewayConversationId.trim() ? { gatewayConversationId: gatewayConversationId.trim() } : {}),
    ...(platformConversationId.trim() ? { platformConversationId: platformConversationId.trim() } : {}),
    ...(threadId.trim() ? { threadId: threadId.trim() } : {}),
    type
  };
}

export function profileSummaryItems(
  profile: ProfileConfig,
  config: AppConfig,
  t: (value: string) => string
): Array<{ label: string; value: string }> {
  const surface = normalizeProfileSurfaceForAgent(profile.agent, profile.surface);
  const envCount = Object.keys(profile.env ?? {}).length;
  const envSummaryItems = envCount > 0
    ? [{ label: t("Environment variables"), value: String(envCount) }]
    : [];
  const appPath = profile.appPath?.trim() || "";
  const appPathSummaryItems = appPath && surface !== "cli" && profile.agent !== "zcode"
    ? [{ label: t(profile.agent === "claude-code" ? "CLAUDE_APP_PATH" : profile.agent === "opencode" ? "OPENCODE_APP_PATH" : "CHATGPT_APP_PATH"), value: appPath }]
    : [];
  const savedBot = profile.botConfigId
    ? config.botConfigs.find((item) => item.id === profile.botConfigId)
    : undefined;
  const resolvedBotGateway = savedBot?.botGateway ?? profile.botGateway ?? config.botGateway;
  const botSummaryItems = surface !== "cli" && resolvedBotGateway?.enabled && resolvedBotGateway.platform !== "none"
    ? [{ label: t("Bot"), value: `${t("Enabled")} (${savedBot ? botGatewaySavedConfigLabel(savedBot, t) : t(botGatewayPlatformLabel(resolvedBotGateway.platform))})` }]
    : surface !== "cli" && profile.botGateway
      ? [{ label: t("Bot"), value: t("Disabled") }]
      : [];
  const managedCompactItems = profile.agent === "zcode"
    ? []
    : [{ label: t("CCR managed compact"), value: profile.managedCompact ? t("Enabled") : t("Disabled") }];
  const smallFastModel = profile.smallFastModel?.trim() || "";
  const modelValue = profile.model.trim()
    ? profileModelDisplayValue(
	      profile.model,
	      parseProfileModelValue(profile.model, config.Providers, config.virtualModelProfiles ?? []),
	      config.Providers,
	      undefined,
	      config.virtualModelProfiles ?? []
	    )
    : profile.agent === "claude-code"
      ? t("Keep Claude Code default")
      : defaultProfileClientModel(config);

  if (profile.agent === "claude-code") {
    return [
      { label: t("Model"), value: modelValue },
      {
        label: t("Small fast model"),
        value: smallFastModel
          ? profileModelDisplayValue(
	            smallFastModel,
	            parseProfileModelValue(smallFastModel, config.Providers, config.virtualModelProfiles ?? []),
	            config.Providers,
	            undefined,
	            config.virtualModelProfiles ?? []
	          )
          : t("Keep Claude Code default")
      },
      ...managedCompactItems,
      ...botSummaryItems,
      ...appPathSummaryItems,
      ...envSummaryItems
    ];
  }

  if (profile.agent === "grok" || profile.agent === "kimi") {
    return [
      { label: t(profile.agent === "kimi" ? "Default model" : "Model"), value: modelValue },
      ...(profile.agent === "kimi"
        ? [{
            label: t("Available models"),
            value: String(uniqueStrings([profile.model, ...(profile.availableModels ?? [])].filter(Boolean)).length)
          }]
        : []),
      ...envSummaryItems
    ];
  }

  return [
    { label: t("Model"), value: modelValue },
    { label: t("Provider ID"), value: profile.providerId ?? "claude-code-router" },
    ...(profile.agent === "zcode" || profile.agent === "opencode" ? [] : [{ label: t("Show all sessions"), value: profile.showAllSessions ? t("Enabled") : t("Disabled") }]),
    ...managedCompactItems,
    ...appPathSummaryItems,
    ...botSummaryItems,
    ...envSummaryItems
  ];
}

export function normalizeProfileItem(profile: ProfileConfig, index: number): ProfileConfig {
  const agent = normalizeProfileAgent(profile.agent);
  const name = profile.name.trim() || profileAgentLabel(profile.agent);
  const model = profile.model.trim();
  const availableModels = uniqueStrings([
    model,
    ...(profile.availableModels ?? []).map(normalizeProfileClientModel)
  ].filter(Boolean));
  const scope = normalizeProfileScope(profile.scope);
  const surface = normalizeProfileSurfaceForAgent(agent, profile.surface);
  const env = isPlainRecord(profile.env) ? stringRecordValue(profile.env) : {};
  const botGateway = surface !== "cli" ? normalizeBotGatewayRuntimeConfig(profile.botGateway) : undefined;
  const botConfigId = surface !== "cli" ? stringValue(profile.botConfigId) : "";
  if (agent === "claude-code") {
    const appPath = profile.appPath?.trim() || "";
    return {
      agent: "claude-code",
      ...(surface !== "cli" && appPath ? { appPath } : {}),
      ...(botConfigId ? { botConfigId } : {}),
      ...(botGateway ? { botGateway } : {}),
      enabled: profile.enabled,
      env: claudeCodeProfileEnv(env),
      id: profile.id || `profile-${index + 1}`,
      managedCompact: Boolean(profile.managedCompact),
      model,
      name,
      scope,
      settingsFile: profile.settingsFile?.trim() || "~/.claude/settings.json",
      smallFastModel: profile.smallFastModel?.trim() || "",
      surface
    };
  }
  if (agent === "grok" || agent === "kimi") {
    return {
      agent,
      ...(agent === "kimi" ? { availableModels } : {}),
      enabled: profile.enabled,
      env: codexCompatibleProfileEnv(env),
      id: profile.id || `profile-${index + 1}`,
      model,
      name,
      scope: "ccr",
      surface: "cli"
    };
  }
  return {
    agent: normalizeCodexCompatibleAgent(agent),
    ...(surface !== "cli" && agent !== "zcode" && profile.appPath?.trim() ? { appPath: profile.appPath.trim() } : {}),
    ...(botConfigId ? { botConfigId } : {}),
    ...(botGateway ? { botGateway } : {}),
    cliMiddleware: true,
    codexCliPath: "",
    codexHome: "",
    configFormat: "separate_profile_files",
    configFile: normalizeCodexConfigFileForAgent(agent, profile.configFile),
    enabled: profile.enabled,
    env: codexCompatibleProfileEnv(env),
    id: profile.id || `profile-${index + 1}`,
    managedCompact: Boolean(profile.managedCompact),
    model,
    name,
    providerId: profile.providerId?.trim() || "claude-code-router",
    providerName: profile.providerName?.trim() || "Claude Code Router",
    scope,
    showAllSessions: agent === "zcode" || agent === "opencode" ? false : Boolean(profile.showAllSessions),
    surface
  };
}

export function normalizeProfileItems(values: unknown): ProfileConfig[] {
  if (!Array.isArray(values)) {
    return fallbackConfig.profile.profiles;
  }
  return enforceSingleEnabledGlobalProfilePerAgent(values
    .map((value, index) => isPlainRecord(value) ? normalizeUnknownProfileItem(value, index) : undefined)
    .filter((profile): profile is ProfileConfig => Boolean(profile)));
}

export function legacyProfileItemsFromProfileConfig(profile: AppConfig["profile"]): ProfileConfig[] {
  return [
    normalizeProfileItem({
      agent: "claude-code",
      enabled: profile.claudeCode.enabled,
      env: claudeCodeProfileEnv(),
      id: "default-claude-code",
      managedCompact: profile.claudeCode.managedCompact,
      model: profile.claudeCode.model,
      name: "Claude Code",
      scope: "global",
      settingsFile: profile.claudeCode.settingsFile,
      smallFastModel: profile.claudeCode.smallFastModel,
      surface: "auto"
    }, 0),
    normalizeProfileItem({
      agent: "codex",
      cliMiddleware: profile.codex.cliMiddleware,
      codexCliPath: profile.codex.codexCliPath,
      codexHome: profile.codex.codexHome,
      configFormat: profile.codex.configFormat,
      configFile: profile.codex.configFile,
      enabled: profile.codex.enabled,
      env: {},
      id: "default-codex",
      managedCompact: profile.codex.managedCompact,
      model: profile.codex.model,
      name: "Codex",
      providerId: profile.codex.providerId,
      providerName: profile.codex.providerName,
      scope: "global",
      showAllSessions: profile.codex.showAllSessions,
      surface: "auto"
    }, 1)
  ];
}

export function normalizeUnknownProfileItem(value: Record<string, unknown>, index: number): ProfileConfig | undefined {
  const rawAgent = typeof value.agent === "string" ? value.agent.trim().toLowerCase() : "";
  const agent = rawAgent === "claude" || rawAgent === "claude-code" || rawAgent === "claude code"
    ? "claude-code"
    : rawAgent === "codex"
      ? "codex"
      : rawAgent === "grok" || rawAgent === "grok-cli" || rawAgent === "grok cli"
        ? "grok"
      : rawAgent === "kimi" || rawAgent === "kimi-cli" || rawAgent === "kimi cli" || rawAgent === "kimi-code" || rawAgent === "kimi code"
        ? "kimi"
      : rawAgent === "opencode" || rawAgent === "open-code" || rawAgent === "open code"
        ? "opencode"
      : rawAgent === "zcode" || rawAgent === "z-code" || rawAgent === "z code"
        ? "zcode"
        : undefined;
  if (!agent) {
    return undefined;
  }
  return normalizeProfileItem({
    agent,
    appPath: typeof value.appPath === "string"
      ? value.appPath
      : typeof value.app_path === "string"
        ? value.app_path
        : typeof value.appExecutablePath === "string"
          ? value.appExecutablePath
          : typeof value.app_executable_path === "string"
            ? value.app_executable_path
            : agent === "claude-code" && typeof value.claudeAppPath === "string"
              ? value.claudeAppPath
              : agent === "claude-code" && typeof value.claude_app_path === "string"
                ? value.claude_app_path
                : agent === "codex" && typeof value.chatgptAppPath === "string"
                  ? value.chatgptAppPath
                  : agent === "codex" && typeof value.chatgpt_app_path === "string"
                    ? value.chatgpt_app_path
                    : agent === "codex" && typeof value.codexAppPath === "string"
                      ? value.codexAppPath
                      : agent === "codex" && typeof value.codex_app_path === "string"
                        ? value.codex_app_path
                        : agent === "opencode" && typeof value.openCodeAppPath === "string"
                          ? value.openCodeAppPath
                          : agent === "opencode" && typeof value.opencodeAppPath === "string"
                            ? value.opencodeAppPath
                            : agent === "opencode" && typeof value.opencode_app_path === "string"
                              ? value.opencode_app_path
                        : undefined,
    availableModels: Array.isArray(value.availableModels)
      ? value.availableModels.filter((model): model is string => typeof model === "string")
      : Array.isArray(value.available_models)
        ? value.available_models.filter((model): model is string => typeof model === "string")
        : Array.isArray(value.models)
          ? value.models.filter((model): model is string => typeof model === "string")
          : undefined,
    botConfigId: typeof value.botConfigId === "string" ? value.botConfigId : typeof value.bot_config_id === "string" ? value.bot_config_id : undefined,
    botGateway: normalizeBotGatewayRuntimeConfig(value.botGateway ?? value.bot_gateway ?? value.bot),
    cliMiddleware: typeof value.cliMiddleware === "boolean" ? value.cliMiddleware : undefined,
    codexCliPath: typeof value.codexCliPath === "string" ? value.codexCliPath : undefined,
    codexHome: typeof value.codexHome === "string" ? value.codexHome : undefined,
    configFormat: typeof value.configFormat === "string" ? normalizeCodexConfigFormat(value.configFormat) : undefined,
    configFile: typeof value.configFile === "string" ? value.configFile : undefined,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    env: isPlainRecord(value.env) ? stringRecordValue(value.env) : {},
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `profile-${index + 1}`,
    managedCompact: typeof value.managedCompact === "boolean"
      ? value.managedCompact
      : typeof value.managed_compact === "boolean"
        ? value.managed_compact
        : typeof value.ccrManagedCompact === "boolean"
          ? value.ccrManagedCompact
          : typeof value.ccr_managed_compact === "boolean"
            ? value.ccr_managed_compact
            : typeof value.contextArchiveCompact === "boolean"
              ? value.contextArchiveCompact
              : typeof value.context_archive_compact === "boolean"
                ? value.context_archive_compact
                : undefined,
    model: typeof value.model === "string" ? value.model : "",
    name: typeof value.name === "string" ? value.name : profileAgentLabel(agent),
    providerId: typeof value.providerId === "string" ? value.providerId : undefined,
    providerName: typeof value.providerName === "string" ? value.providerName : undefined,
    scope: typeof value.scope === "string" ? normalizeProfileScope(value.scope) : "global",
    settingsFile: typeof value.settingsFile === "string" ? value.settingsFile : undefined,
    showAllSessions: typeof value.showAllSessions === "boolean"
      ? value.showAllSessions
      : typeof value.show_all_sessions === "boolean"
        ? value.show_all_sessions
        : undefined,
    smallFastModel: typeof value.smallFastModel === "string" ? value.smallFastModel : undefined,
    surface: typeof value.surface === "string" ? normalizeProfileSurface(value.surface) : "auto"
  }, index);
}

export function uniqueProfileId(existingProfiles: ProfileConfig[], value: string): string {
  const base = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
  const existingIds = new Set(existingProfiles.map((profile) => profile.id));
  if (!existingIds.has(base)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

export function profileAgentLabel(agent: ProfileConfig["agent"]): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  if (agent === "zcode") {
    return "ZCode";
  }
  if (agent === "grok") {
    return "Grok CLI";
  }
  if (agent === "kimi") {
    return "Kimi CLI";
  }
  if (agent === "opencode") {
    return "OpenCode";
  }
  return "Codex";
}

export function profileScopeLabel(scope: ProfileScope): string {
  if (scope === "global") {
    return "System default";
  }
  if (scope === "custom") {
    return "Custom config path";
  }
  return "Only opened from CCR";
}

export function profileSurfaceLabel(surface: ProfileSurface): string {
  if (surface === "cli") {
    return "CLI only";
  }
  if (surface === "app") {
    return "App only";
  }
  return "CLI & APP";
}

export function profileOpenSurfaces(profile: ProfileConfig): ProfileOpenSurface[] {
  if (profile.agent === "zcode") {
    return ["app"];
  }
  if (profile.agent === "grok" || profile.agent === "kimi") {
    return ["cli"];
  }
  const surface = normalizeProfileSurface(profile.surface);
  if (surface === "cli") {
    return ["cli"];
  }
  if (surface === "app") {
    return ["app"];
  }
  return ["cli", "app"];
}

export function profileOpenCommandFallback(profile: ProfileConfig, surface: ProfileOpenSurface = profile.agent === "zcode" ? "app" : "cli"): string {
  const profileRef = profile.name.trim() || profile.id;
  return ["ccr", shellCommandQuote(profileRef), ...(surface === "app" ? ["app"] : [])].join(" ");
}

function shellCommandQuote(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`;
}

export function profileAgentLogoUrl(agent: ProfileConfig["agent"]): string {
  if (agent === "claude-code") {
    return claudeCodeLogoUrl;
  }
  if (agent === "zcode") {
    return zcodeLogoUrl;
  }
  if (agent === "grok") {
    return grokLogoUrl;
  }
  if (agent === "kimi") {
    return moonshotProviderIconUrl;
  }
  if (agent === "opencode") {
    return openCodeLogoUrl;
  }
  return codexLogoUrl;
}

function normalizeCodexCompatibleAgent(agent: ProfileConfig["agent"]): "codex" | "opencode" | "zcode" {
  return agent === "zcode" ? "zcode" : agent === "opencode" ? "opencode" : "codex";
}

function normalizeProfileAgent(agent: ProfileConfig["agent"]): ProfileConfig["agent"] {
  return agent === "zcode" ? "zcode" : agent === "opencode" ? "opencode" : agent === "grok" ? "grok" : agent === "kimi" ? "kimi" : agent === "codex" ? "codex" : "claude-code";
}

function normalizeProfileSurfaceForAgent(agent: ProfileConfig["agent"], surface: unknown): ProfileSurface {
  return agent === "zcode" ? "app" : agent === "grok" || agent === "kimi" ? "cli" : normalizeProfileSurface(surface);
}

function defaultCodexConfigFile(agent: ProfileConfig["agent"]): string {
  return agent === "zcode"
    ? "~/.zcode/cli/config.json"
    : agent === "opencode"
      ? "~/.config/opencode/opencode.jsonc"
      : "~/.codex/config.toml";
}

function normalizeCodexConfigFileForAgent(agent: ProfileConfig["agent"], value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || (agent === "zcode" && trimmed === "~/.zcode/config.toml")) {
    return defaultCodexConfigFile(agent);
  }
  return trimmed;
}
