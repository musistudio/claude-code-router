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

export function formatLogDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetHours = offsetMinutes / 60;
  const offset = Number.isInteger(offsetHours)
    ? `GMT${offsetHours >= 0 ? "+" : ""}${offsetHours}`
    : `GMT${offsetHours >= 0 ? "+" : ""}${(offsetMinutes / 60).toFixed(1)}`;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${offset}`;
}

export function formatLogTokenSummary(entry: RequestLogEntry, t: (value: string) => string, locale?: Intl.LocalesArgument): string {
  if (
    entry.totalTokens === 0 &&
    entry.inputTokens === 0 &&
    entry.outputTokens === 0 &&
    entry.reasoningTokens === 0 &&
    entry.cacheReadTokens === 0 &&
    entry.cacheWriteTokens === 0
  ) {
    return "-";
  }
  const values = [
    `${formatCompactNumber(entry.inputTokens, locale)} ${t("入")}`,
    `${formatCompactNumber(entry.outputTokens, locale)} ${t("出")}`
  ];

  if (entry.cacheReadTokens > 0) {
    values.push(`${formatCompactNumber(entry.cacheReadTokens, locale)} ${t("Cache")}`);
  }
  if (entry.cacheWriteTokens > 0) {
    values.push(`${formatCompactNumber(entry.cacheWriteTokens, locale)} ${t("Cache write")}`);
  }
  if (entry.reasoningTokens > 0) {
    values.push(`${formatCompactNumber(entry.reasoningTokens, locale)} ${t("Thinking")}`);
  }

  return values.join("  ");
}

export function logRequestModel(entry: RequestLogEntry): string {
  return logBodyModel(entry.requestBody) || entry.model || "unknown";
}

export function logResponseModel(entry: RequestLogEntry): string {
  return logBodyModel(entry.responseBody) || entry.model || "unknown";
}

export function logBodyModel(body: RequestLogBody | undefined): string | undefined {
  if (!body || body.encoding === "base64" || !body.text.trim()) {
    return undefined;
  }

  const direct = modelFromPayload(parseLogJson(body.text));
  if (direct) {
    return direct;
  }

  for (const payload of parseLogStreamPayloads(body.text)) {
    const model = modelFromPayload(payload);
    if (model) {
      return model;
    }
  }

  return undefined;
}

export function modelFromPayload(payload: unknown): string | undefined {
  if (!isPlainRecord(payload)) {
    return undefined;
  }
  const response = isPlainRecord(payload.response) ? payload.response : payload;
  return stringValue(response.model) ||
    stringValue(payload.model) ||
    stringValue(response.modelVersion) ||
    stringValue(payload.modelVersion);
}

export type FormattedLogBody = {
  json?: unknown;
  text: string;
};

export function logBodyKey(body: RequestLogBody | undefined): string {
  if (!body) {
    return "missing";
  }
  return JSON.stringify([
    body.encoding ?? "",
    body.sizeBytes,
    body.text ?? ""
  ]);
}

export function formatLogBodyView(body: RequestLogBody | undefined): FormattedLogBody {
  if (!body || (!body.text && body.sizeBytes === 0)) {
    return { text: "No body" };
  }
  if (body.encoding === "base64") {
    return { text: body.text || "No body" };
  }

  const text = body.text || "";
  const json = parseLogJson(text);
  if (json !== undefined) {
    const normalizedJson = aggregateParsedStreamJson(json);
    return { json: normalizedJson, text: JSON.stringify(normalizedJson, null, 2) };
  }

  const streamPayloads = parseLogStreamPayloads(text);
  if (streamPayloads.length > 0) {
    const streamedJson = aggregateLogStreamPayloads(streamPayloads);
    return { json: streamedJson, text: JSON.stringify(streamedJson, null, 2) };
  }

  return { text: text || "No body" };
}

export function filterLogText(value: string, query: string): string {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return value;
  }
  const lines = value.split(/\r?\n/);
  const matched = lines.filter((line) => line.toLowerCase().includes(normalized));
  return matched.length > 0 ? matched.join("\n") : "No matching lines";
}

export function parseLogJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function parseLogStreamPayloads(value: string): unknown[] {
  const payloads: unknown[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    const payload = line.startsWith("data:")
      ? line.slice(5).trim()
      : line.startsWith("{") || line.startsWith("[")
        ? line
        : "";
    if (!payload || payload === "[DONE]") {
      continue;
    }
    const parsed = parseLogJson(payload);
    if (parsed !== undefined) {
      payloads.push(parsed);
    }
  }
  return payloads;
}

export function aggregateLogStreamPayloads(payloads: unknown[]): Record<string, unknown> {
  const normalizedPayloads = flattenStreamPayloads(payloads);
  return {
    ...(aggregateKnownStreamPayloads(normalizedPayloads) ?? {}),
    streamed_data: payloads
  };
}

function aggregateParsedStreamJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    const aggregated = aggregateKnownStreamPayloads(flattenStreamPayloads(value));
    return aggregated
      ? { ...aggregated, streamed_data: value }
      : value;
  }

  if (!isPlainRecord(value) || !Array.isArray(value.streamed_data)) {
    return value;
  }

  const aggregated = aggregateKnownStreamPayloads(flattenStreamPayloads(value.streamed_data));
  if (!aggregated) {
    return value;
  }

  const { streamed_data: streamedData, ...rest } = value;
  return {
    ...aggregated,
    ...rest,
    streamed_data: streamedData
  };
}

function flattenStreamPayloads(payloads: unknown[]): unknown[] {
  const flattened: unknown[] = [];
  for (const payload of payloads) {
    if (Array.isArray(payload)) {
      flattened.push(...flattenStreamPayloads(payload));
    } else {
      flattened.push(payload);
    }
  }
  return flattened;
}

function aggregateKnownStreamPayloads(payloads: unknown[]): Record<string, unknown> | undefined {
  return aggregateOpenAiStreamPayloads(payloads) ??
    aggregateOpenAiResponsesStreamPayloads(payloads) ??
    aggregateAnthropicStreamPayloads(payloads) ??
    aggregateGeminiStreamPayloads(payloads);
}

type OpenAiStreamChoiceState = {
  deltaTextParts: Map<string, string[]>;
  deltaValues: Map<string, unknown>;
  finishReason?: unknown;
  functionArgumentsParts: string[];
  functionArgumentsValue?: unknown;
  functionName?: string;
  index: string | number;
  logprobs?: unknown;
  order: number;
  role?: string;
  toolCallIndexKeys: Map<string, string>;
  toolCallOrder: string[];
  toolCalls: Map<string, OpenAiStreamToolCallState>;
};

type OpenAiStreamToolCallState = {
  functionArgumentsParts: string[];
  functionArgumentsValue?: unknown;
  functionName?: string;
  id?: string;
  index?: string | number;
  order: number;
  type?: string;
};

const openAiDeltaTextFields = new Set([
  "content",
  "output_text",
  "reasoning",
  "reasoning_content",
  "reasoning_text",
  "refusal",
  "text",
  "thinking"
]);

function aggregateOpenAiStreamPayloads(payloads: unknown[]): Record<string, unknown> | undefined {
  const choices = new Map<string, OpenAiStreamChoiceState>();
  let created: number | undefined;
  let id: string | undefined;
  let model: string | undefined;
  let object: string | undefined;
  let sawChoices = false;
  let serviceTier: string | undefined;
  let systemFingerprint: string | undefined;
  let usage: unknown;

  for (const payload of payloads) {
    if (!isPlainRecord(payload)) {
      continue;
    }

    id ??= stringValue(payload.id);
    model ??= stringValue(payload.model);
    object ??= stringValue(payload.object);
    serviceTier ??= stringValue(payload.service_tier);
    systemFingerprint ??= stringValue(payload.system_fingerprint);
    if (created === undefined && typeof payload.created === "number" && Number.isFinite(payload.created)) {
      created = payload.created;
    }
    if (isPlainRecord(payload.usage)) {
      usage = payload.usage;
    }

    if (!Array.isArray(payload.choices)) {
      continue;
    }

    sawChoices = true;
    payload.choices.forEach((choice, index) => collectOpenAiStreamChoice(choice, choices, index));
  }

  if (!sawChoices) {
    return undefined;
  }

  const aggregated: Record<string, unknown> = {};
  if (id) {
    aggregated.id = id;
  }
  const normalizedObject = normalizeOpenAiStreamObject(object);
  if (normalizedObject) {
    aggregated.object = normalizedObject;
  }
  if (created !== undefined) {
    aggregated.created = created;
  }
  if (model) {
    aggregated.model = model;
  }
  if (systemFingerprint) {
    aggregated.system_fingerprint = systemFingerprint;
  }
  if (serviceTier) {
    aggregated.service_tier = serviceTier;
  }
  aggregated.choices = Array.from(choices.values())
    .sort((left, right) => left.order - right.order)
    .map(formatOpenAiStreamChoice);
  if (usage !== undefined) {
    aggregated.usage = usage;
  }
  return aggregated;
}

function collectOpenAiStreamChoice(
  choice: unknown,
  choices: Map<string, OpenAiStreamChoiceState>,
  fallbackIndex: number
): void {
  if (!isPlainRecord(choice)) {
    return;
  }

  const key = streamIndexKey(choice.index) ?? `position:${fallbackIndex}`;
  const state = ensureOpenAiStreamChoice(choices, key, choice.index ?? fallbackIndex);

  if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
    state.finishReason = choice.finish_reason;
  }
  if (choice.logprobs !== undefined && choice.logprobs !== null) {
    state.logprobs = choice.logprobs;
  }
  if (typeof choice.text === "string") {
    appendOpenAiDeltaText(state, "text", choice.text);
  }

  collectOpenAiDelta(choice.delta, state);
  collectOpenAiDelta(choice.message, state);
}

function collectOpenAiDelta(delta: unknown, state: OpenAiStreamChoiceState): void {
  if (!isPlainRecord(delta)) {
    return;
  }

  const role = stringValue(delta.role);
  if (role) {
    state.role = role;
  }

  for (const [key, value] of Object.entries(delta)) {
    if (key === "role" || key === "tool_calls" || key === "function_call") {
      continue;
    }
    if (typeof value === "string" && openAiDeltaTextFields.has(key)) {
      appendOpenAiDeltaText(state, key, value);
      continue;
    }
    if (value !== undefined && value !== null) {
      state.deltaValues.set(key, value);
    }
  }

  collectOpenAiStreamToolCalls(delta.tool_calls, state);
  collectOpenAiStreamFunctionCall(delta.function_call, state);
}

function ensureOpenAiStreamChoice(
  choices: Map<string, OpenAiStreamChoiceState>,
  key: string,
  rawIndex: unknown
): OpenAiStreamChoiceState {
  const existing = choices.get(key);
  if (existing) {
    return existing;
  }

  const state: OpenAiStreamChoiceState = {
    deltaTextParts: new Map(),
    deltaValues: new Map(),
    functionArgumentsParts: [],
    index: normalizeStreamIndex(rawIndex) ?? key,
    order: choices.size,
    toolCallIndexKeys: new Map(),
    toolCallOrder: [],
    toolCalls: new Map()
  };
  choices.set(key, state);
  return state;
}

function appendOpenAiDeltaText(state: OpenAiStreamChoiceState, key: string, value: string): void {
  const parts = state.deltaTextParts.get(key) ?? [];
  parts.push(value);
  state.deltaTextParts.set(key, parts);
}

function collectOpenAiStreamFunctionCall(value: unknown, state: OpenAiStreamChoiceState): void {
  if (!isPlainRecord(value)) {
    return;
  }

  const name = stringValue(value.name);
  if (name) {
    state.functionName = name;
  }
  const argumentsValue = value.arguments ?? value.parameters ?? value.input;
  if (typeof argumentsValue === "string") {
    state.functionArgumentsParts.push(argumentsValue);
  } else if (argumentsValue !== undefined && argumentsValue !== null) {
    state.functionArgumentsValue = argumentsValue;
  }
}

function collectOpenAiStreamToolCalls(value: unknown, state: OpenAiStreamChoiceState): void {
  if (!Array.isArray(value)) {
    return;
  }

  value.forEach((item, fallbackIndex) => {
    if (!isPlainRecord(item)) {
      return;
    }

    const rawIndex = normalizeStreamIndex(item.index);
    const indexKey = rawIndex === undefined ? undefined : `index:${rawIndex}`;
    const id = stringValue(item.id) || stringValue(item.call_id) || stringValue(item.tool_call_id);
    const mappedKey = indexKey ? state.toolCallIndexKeys.get(indexKey) : undefined;
    let key = id || mappedKey || indexKey || `position:${fallbackIndex}`;

    if (id && indexKey) {
      key = remapOpenAiStreamToolCall(state, indexKey, id);
    } else if (indexKey && !mappedKey) {
      state.toolCallIndexKeys.set(indexKey, key);
    }

    const tool = ensureOpenAiStreamToolCall(state, key);
    if (id) {
      tool.id = id;
    }
    if (rawIndex !== undefined) {
      tool.index = rawIndex;
    }
    const type = stringValue(item.type);
    if (type) {
      tool.type = type;
    }

    const functionRecord = isPlainRecord(item.function) ? item.function : undefined;
    const functionName = stringValue(functionRecord?.name) || stringValue(item.name);
    if (functionName) {
      tool.functionName = functionName;
    }
    const argumentsValue = functionRecord
      ? functionRecord.arguments ?? functionRecord.parameters ?? functionRecord.input
      : undefined;
    if (typeof argumentsValue === "string") {
      tool.functionArgumentsParts.push(argumentsValue);
    } else if (argumentsValue !== undefined && argumentsValue !== null) {
      tool.functionArgumentsValue = argumentsValue;
    }
  });
}

function remapOpenAiStreamToolCall(state: OpenAiStreamChoiceState, indexKey: string, id: string): string {
  const currentKey = state.toolCallIndexKeys.get(indexKey) ?? indexKey;
  state.toolCallIndexKeys.set(indexKey, id);
  if (currentKey === id || !state.toolCalls.has(currentKey)) {
    return id;
  }

  const tool = state.toolCalls.get(currentKey);
  if (tool) {
    state.toolCalls.delete(currentKey);
    state.toolCalls.set(id, tool);
    const orderIndex = state.toolCallOrder.indexOf(currentKey);
    if (orderIndex >= 0) {
      state.toolCallOrder[orderIndex] = id;
    }
  }
  return id;
}

function ensureOpenAiStreamToolCall(state: OpenAiStreamChoiceState, key: string): OpenAiStreamToolCallState {
  const existing = state.toolCalls.get(key);
  if (existing) {
    return existing;
  }

  const tool: OpenAiStreamToolCallState = {
    functionArgumentsParts: [],
    order: state.toolCallOrder.length
  };
  state.toolCalls.set(key, tool);
  state.toolCallOrder.push(key);
  return tool;
}

function formatOpenAiStreamChoice(state: OpenAiStreamChoiceState): Record<string, unknown> {
  const choice: Record<string, unknown> = {
    index: state.index,
    delta: formatOpenAiStreamChoiceDelta(state)
  };
  if (state.logprobs !== undefined) {
    choice.logprobs = state.logprobs;
  }
  if (state.finishReason !== undefined) {
    choice.finish_reason = state.finishReason;
  }
  return choice;
}

function formatOpenAiStreamChoiceDelta(state: OpenAiStreamChoiceState): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  if (state.role) {
    delta.role = state.role;
  }
  for (const [key, parts] of state.deltaTextParts) {
    delta[key] = parts.join("");
  }
  for (const [key, value] of state.deltaValues) {
    if (delta[key] === undefined) {
      delta[key] = value;
    }
  }

  const toolCalls = formatOpenAiStreamToolCalls(state);
  if (toolCalls.length > 0) {
    delta.tool_calls = toolCalls;
  }
  const functionCall = formatOpenAiStreamFunctionCall(state);
  if (functionCall) {
    delta.function_call = functionCall;
  }
  return delta;
}

function formatOpenAiStreamToolCalls(state: OpenAiStreamChoiceState): Record<string, unknown>[] {
  return state.toolCallOrder
    .map((key) => state.toolCalls.get(key))
    .filter((tool): tool is OpenAiStreamToolCallState => Boolean(tool))
    .sort((left, right) => left.order - right.order)
    .map((tool) => {
      const value: Record<string, unknown> = {};
      if (tool.index !== undefined) {
        value.index = tool.index;
      }
      if (tool.id) {
        value.id = tool.id;
      }
      if (tool.type) {
        value.type = tool.type;
      }
      const functionRecord: Record<string, unknown> = {};
      if (tool.functionName) {
        functionRecord.name = tool.functionName;
      }
      if (tool.functionArgumentsParts.length > 0) {
        functionRecord.arguments = tool.functionArgumentsParts.join("");
      } else if (tool.functionArgumentsValue !== undefined) {
        functionRecord.arguments = tool.functionArgumentsValue;
      }
      if (Object.keys(functionRecord).length > 0) {
        value.function = functionRecord;
      }
      return value;
    });
}

function formatOpenAiStreamFunctionCall(state: OpenAiStreamChoiceState): Record<string, unknown> | undefined {
  const functionCall: Record<string, unknown> = {};
  if (state.functionName) {
    functionCall.name = state.functionName;
  }
  if (state.functionArgumentsParts.length > 0) {
    functionCall.arguments = state.functionArgumentsParts.join("");
  } else if (state.functionArgumentsValue !== undefined) {
    functionCall.arguments = state.functionArgumentsValue;
  }
  return Object.keys(functionCall).length > 0 ? functionCall : undefined;
}

function normalizeOpenAiStreamObject(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.endsWith(".chunk") ? value.slice(0, -".chunk".length) : value;
}

type OpenAiResponseItemState = {
  argumentsParts: string[];
  argumentsValue?: unknown;
  callId?: string;
  content: Map<string, OpenAiResponseContentPartState>;
  extras: Record<string, unknown>;
  id?: string;
  name?: string;
  order: number;
  outputIndex: string | number;
  role?: string;
  status?: string;
  type?: string;
};

type OpenAiResponseContentPartState = {
  annotations?: unknown;
  extras: Record<string, unknown>;
  index: string | number;
  order: number;
  refusalParts: string[];
  refusalValue?: string;
  textParts: string[];
  textValue?: string;
  type?: string;
};

function aggregateOpenAiResponsesStreamPayloads(payloads: unknown[]): Record<string, unknown> | undefined {
  const output = new Map<string, OpenAiResponseItemState>();
  let response: Record<string, unknown> = {};
  let sawResponsesEvent = false;

  for (const payload of payloads) {
    if (!isPlainRecord(payload)) {
      continue;
    }

    const type = stringValue(payload.type);
    const nestedResponse = isPlainRecord(payload.response) ? payload.response : undefined;
    if (type?.startsWith("response.") || nestedResponse) {
      sawResponsesEvent = true;
    }

    if (nestedResponse) {
      response = { ...response, ...nestedResponse };
    }

    if (type === "response.output_item.added" || type === "response.output_item.done") {
      collectOpenAiResponseOutputItem(payload.item, output, payload.output_index);
      continue;
    }

    if (type === "response.content_part.added" || type === "response.content_part.done") {
      collectOpenAiResponseContentPart(payload.part, output, payload.output_index, payload.content_index);
      continue;
    }

    if (type === "response.output_text.delta" || type === "response.refusal.delta") {
      const part = ensureOpenAiResponseContentPart(output, payload.output_index, payload.content_index);
      if (typeof payload.delta === "string") {
        if (type === "response.refusal.delta") {
          part.type = "refusal";
          part.refusalParts.push(payload.delta);
        } else {
          part.type = part.type || "output_text";
          part.textParts.push(payload.delta);
        }
      }
      continue;
    }

    if (type === "response.output_text.done" || type === "response.refusal.done") {
      const part = ensureOpenAiResponseContentPart(output, payload.output_index, payload.content_index);
      if (type === "response.refusal.done") {
        part.type = "refusal";
        if (typeof payload.refusal === "string") {
          part.refusalValue = payload.refusal;
        }
      } else {
        part.type = part.type || "output_text";
        if (typeof payload.text === "string") {
          part.textValue = payload.text;
        }
      }
      continue;
    }

    if (type === "response.reasoning_text.delta" || type === "response.reasoning_summary_text.delta") {
      const part = ensureOpenAiResponseContentPart(output, payload.output_index, payload.content_index);
      if (typeof payload.delta === "string") {
        part.type = type === "response.reasoning_summary_text.delta" ? "summary_text" : "reasoning_text";
        part.textParts.push(payload.delta);
      }
      continue;
    }

    if (type === "response.reasoning_text.done" || type === "response.reasoning_summary_text.done") {
      const part = ensureOpenAiResponseContentPart(output, payload.output_index, payload.content_index);
      part.type = type === "response.reasoning_summary_text.done" ? "summary_text" : "reasoning_text";
      if (typeof payload.text === "string") {
        part.textValue = payload.text;
      }
      continue;
    }

    if (type === "response.function_call_arguments.delta" || type === "response.function_call_arguments.done") {
      const item = ensureOpenAiResponseItem(output, payload.output_index);
      item.type = item.type || "function_call";
      if (typeof payload.delta === "string") {
        item.argumentsParts.push(payload.delta);
      }
      if (typeof payload.arguments === "string") {
        item.argumentsValue = payload.arguments;
      }
    }
  }

  if (!sawResponsesEvent) {
    return undefined;
  }

  const aggregated: Record<string, unknown> = { ...response };
  if (!aggregated.object) {
    aggregated.object = "response";
  }
  const outputItems = Array.from(output.values())
    .sort((left, right) => left.order - right.order)
    .map(formatOpenAiResponseOutputItem);
  if (outputItems.length > 0) {
    aggregated.output = outputItems;
  }

  const outputText = collectOpenAiResponseOutputText(outputItems.length > 0 ? outputItems : aggregated.output);
  if (outputText) {
    aggregated.output_text = outputText;
  }
  return aggregated;
}

function collectOpenAiResponseOutputItem(
  value: unknown,
  output: Map<string, OpenAiResponseItemState>,
  rawOutputIndex: unknown
): void {
  if (!isPlainRecord(value)) {
    return;
  }

  const item = ensureOpenAiResponseItem(output, value.output_index ?? rawOutputIndex);
  item.id = stringValue(value.id) || item.id;
  item.callId = stringValue(value.call_id) || item.callId;
  item.name = stringValue(value.name) || item.name;
  item.role = stringValue(value.role) || item.role;
  item.status = stringValue(value.status) || item.status;
  item.type = stringValue(value.type) || item.type;

  for (const [key, itemValue] of Object.entries(value)) {
    if (["arguments", "call_id", "content", "id", "name", "output_index", "role", "status", "type"].includes(key)) {
      continue;
    }
    if (itemValue !== undefined && itemValue !== null) {
      item.extras[key] = itemValue;
    }
  }

  if (typeof value.arguments === "string") {
    item.argumentsValue = value.arguments;
  } else if (value.arguments !== undefined && value.arguments !== null) {
    item.argumentsValue = value.arguments;
  }

  if (Array.isArray(value.content)) {
    value.content.forEach((part, index) => collectOpenAiResponseContentPart(part, output, item.outputIndex, index));
  }
}

function collectOpenAiResponseContentPart(
  value: unknown,
  output: Map<string, OpenAiResponseItemState>,
  rawOutputIndex: unknown,
  rawContentIndex: unknown
): void {
  if (!isPlainRecord(value)) {
    return;
  }

  const part = ensureOpenAiResponseContentPart(output, rawOutputIndex, value.content_index ?? rawContentIndex);
  part.type = stringValue(value.type) || part.type;
  if (typeof value.text === "string") {
    part.textValue = value.text;
  }
  if (typeof value.refusal === "string") {
    part.refusalValue = value.refusal;
  }
  if (value.annotations !== undefined && value.annotations !== null) {
    part.annotations = value.annotations;
  }
  for (const [key, partValue] of Object.entries(value)) {
    if (["annotations", "content_index", "refusal", "text", "type"].includes(key)) {
      continue;
    }
    if (partValue !== undefined && partValue !== null) {
      part.extras[key] = partValue;
    }
  }
}

function ensureOpenAiResponseItem(output: Map<string, OpenAiResponseItemState>, rawOutputIndex: unknown): OpenAiResponseItemState {
  const outputIndex = normalizeStreamIndex(rawOutputIndex) ?? output.size;
  const key = String(outputIndex);
  const existing = output.get(key);
  if (existing) {
    return existing;
  }

  const item: OpenAiResponseItemState = {
    argumentsParts: [],
    content: new Map(),
    extras: {},
    order: output.size,
    outputIndex
  };
  output.set(key, item);
  return item;
}

function ensureOpenAiResponseContentPart(
  output: Map<string, OpenAiResponseItemState>,
  rawOutputIndex: unknown,
  rawContentIndex: unknown
): OpenAiResponseContentPartState {
  const item = ensureOpenAiResponseItem(output, rawOutputIndex);
  const contentIndex = normalizeStreamIndex(rawContentIndex) ?? item.content.size;
  const key = String(contentIndex);
  const existing = item.content.get(key);
  if (existing) {
    return existing;
  }

  const part: OpenAiResponseContentPartState = {
    extras: {},
    index: contentIndex,
    order: item.content.size,
    refusalParts: [],
    textParts: []
  };
  item.content.set(key, part);
  return part;
}

function formatOpenAiResponseOutputItem(item: OpenAiResponseItemState): Record<string, unknown> {
  const value: Record<string, unknown> = { ...item.extras };
  if (item.id) {
    value.id = item.id;
  }
  if (item.type) {
    value.type = item.type;
  }
  if (item.status) {
    value.status = item.status;
  }
  if (item.role) {
    value.role = item.role;
  }
  if (item.callId) {
    value.call_id = item.callId;
  }
  if (item.name) {
    value.name = item.name;
  }

  const content = Array.from(item.content.values())
    .sort((left, right) => left.order - right.order)
    .map(formatOpenAiResponseContentPart);
  if (content.length > 0) {
    value.content = content;
  }
  if (item.argumentsParts.length > 0) {
    value.arguments = item.argumentsParts.join("");
  } else if (item.argumentsValue !== undefined) {
    value.arguments = item.argumentsValue;
  }
  return value;
}

function formatOpenAiResponseContentPart(part: OpenAiResponseContentPartState): Record<string, unknown> {
  const value: Record<string, unknown> = { ...part.extras };
  if (part.type) {
    value.type = part.type;
  }
  const text = part.textValue ?? (part.textParts.length > 0 ? part.textParts.join("") : undefined);
  if (text !== undefined) {
    value.text = text;
  }
  const refusal = part.refusalValue ?? (part.refusalParts.length > 0 ? part.refusalParts.join("") : undefined);
  if (refusal !== undefined) {
    value.refusal = refusal;
  }
  if (part.annotations !== undefined) {
    value.annotations = part.annotations;
  }
  return value;
}

function collectOpenAiResponseOutputText(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const textParts: string[] = [];
  for (const item of value) {
    if (!isPlainRecord(item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const part of item.content) {
      if (isPlainRecord(part) && stringValue(part.type) === "output_text" && typeof part.text === "string") {
        textParts.push(part.text);
      }
    }
  }
  return textParts.join("");
}

type AnthropicStreamBlockState = {
  extras: Record<string, unknown>;
  id?: string;
  index: string | number;
  inputJsonParts: string[];
  inputValue?: unknown;
  name?: string;
  order: number;
  signature?: string;
  textParts: string[];
  thinkingParts: string[];
  type?: string;
};

function aggregateAnthropicStreamPayloads(payloads: unknown[]): Record<string, unknown> | undefined {
  const content = new Map<string, AnthropicStreamBlockState>();
  let message: Record<string, unknown> = {};
  let sawAnthropicEvent = false;
  let usage: Record<string, unknown> | undefined;

  for (const payload of payloads) {
    if (!isPlainRecord(payload)) {
      continue;
    }

    const type = stringValue(payload.type);
    if (type && [
      "content_block_delta",
      "content_block_start",
      "content_block_stop",
      "message_delta",
      "message_start",
      "message_stop",
      "ping"
    ].includes(type)) {
      sawAnthropicEvent = true;
    }

    if (type === "message_start" && isPlainRecord(payload.message)) {
      message = { ...message, ...payload.message };
      if (isPlainRecord(payload.message.usage)) {
        usage = { ...(usage ?? {}), ...payload.message.usage };
      }
      if (Array.isArray(payload.message.content)) {
        payload.message.content.forEach((block, index) => collectAnthropicContentBlockStart(content, block, index));
      }
      continue;
    }

    if (type === "content_block_start") {
      collectAnthropicContentBlockStart(content, payload.content_block, payload.index);
      continue;
    }

    if (type === "content_block_delta" && isPlainRecord(payload.delta)) {
      collectAnthropicContentBlockDelta(content, payload.delta, payload.index);
      continue;
    }

    if (type === "message_delta") {
      if (isPlainRecord(payload.delta)) {
        message = { ...message, ...payload.delta };
      }
      if (isPlainRecord(payload.usage)) {
        usage = { ...(usage ?? {}), ...payload.usage };
      }
    }
  }

  if (!sawAnthropicEvent) {
    return undefined;
  }

  const aggregated: Record<string, unknown> = { ...message };
  aggregated.type = stringValue(aggregated.type) || "message";
  aggregated.role = stringValue(aggregated.role) || "assistant";
  const contentBlocks = Array.from(content.values())
    .sort((left, right) => left.order - right.order)
    .map(formatAnthropicContentBlock);
  if (contentBlocks.length > 0) {
    aggregated.content = contentBlocks;
  }
  if (usage) {
    aggregated.usage = usage;
  }
  return aggregated;
}

function collectAnthropicContentBlockStart(
  content: Map<string, AnthropicStreamBlockState>,
  value: unknown,
  rawIndex: unknown
): void {
  if (!isPlainRecord(value)) {
    return;
  }

  const block = ensureAnthropicContentBlock(content, rawIndex);
  block.id = stringValue(value.id) || block.id;
  block.name = stringValue(value.name) || block.name;
  block.type = stringValue(value.type) || block.type;
  if (typeof value.text === "string") {
    block.textParts.push(value.text);
  }
  if (typeof value.thinking === "string") {
    block.thinkingParts.push(value.thinking);
  }
  if (value.input !== undefined && value.input !== null) {
    block.inputValue = value.input;
  }
  for (const [key, blockValue] of Object.entries(value)) {
    if (["id", "input", "name", "text", "thinking", "type"].includes(key)) {
      continue;
    }
    if (blockValue !== undefined && blockValue !== null) {
      block.extras[key] = blockValue;
    }
  }
}

function collectAnthropicContentBlockDelta(
  content: Map<string, AnthropicStreamBlockState>,
  delta: Record<string, unknown>,
  rawIndex: unknown
): void {
  const block = ensureAnthropicContentBlock(content, rawIndex);
  const type = stringValue(delta.type);
  if (type === "text_delta" && typeof delta.text === "string") {
    block.type = block.type || "text";
    block.textParts.push(delta.text);
    return;
  }
  if (type === "thinking_delta" && typeof delta.thinking === "string") {
    block.type = block.type || "thinking";
    block.thinkingParts.push(delta.thinking);
    return;
  }
  if (type === "input_json_delta" && typeof delta.partial_json === "string") {
    block.inputJsonParts.push(delta.partial_json);
    return;
  }
  if (type === "signature_delta" && typeof delta.signature === "string") {
    block.signature = delta.signature;
    return;
  }
  for (const [key, value] of Object.entries(delta)) {
    if (key !== "type" && value !== undefined && value !== null) {
      block.extras[key] = value;
    }
  }
}

function ensureAnthropicContentBlock(content: Map<string, AnthropicStreamBlockState>, rawIndex: unknown): AnthropicStreamBlockState {
  const index = normalizeStreamIndex(rawIndex) ?? content.size;
  const key = String(index);
  const existing = content.get(key);
  if (existing) {
    return existing;
  }

  const block: AnthropicStreamBlockState = {
    extras: {},
    index,
    inputJsonParts: [],
    order: content.size,
    textParts: [],
    thinkingParts: []
  };
  content.set(key, block);
  return block;
}

function formatAnthropicContentBlock(block: AnthropicStreamBlockState): Record<string, unknown> {
  const value: Record<string, unknown> = { ...block.extras };
  const type = block.type || (block.inputJsonParts.length > 0 || block.inputValue !== undefined ? "tool_use" : "text");
  value.type = type;
  if (block.id) {
    value.id = block.id;
  }
  if (block.name) {
    value.name = block.name;
  }
  if (block.textParts.length > 0) {
    value.text = block.textParts.join("");
  }
  if (block.thinkingParts.length > 0) {
    value.thinking = block.thinkingParts.join("");
  }
  if (block.signature) {
    value.signature = block.signature;
  }
  if (block.inputJsonParts.length > 0) {
    value.input = parseJsonLikeText(block.inputJsonParts.join(""));
  } else if (block.inputValue !== undefined) {
    value.input = block.inputValue;
  }
  return value;
}

type GeminiCandidateState = {
  contentRole?: string;
  extras: Record<string, unknown>;
  finishReason?: string;
  index: string | number;
  order: number;
  parts: Map<string, GeminiPartState>;
};

type GeminiPartState = {
  extras: Record<string, unknown>;
  index: string | number;
  order: number;
  textParts: string[];
};

function aggregateGeminiStreamPayloads(payloads: unknown[]): Record<string, unknown> | undefined {
  const candidates = new Map<string, GeminiCandidateState>();
  let sawGeminiPayload = false;
  let modelVersion: string | undefined;
  let promptFeedback: unknown;
  let responseId: string | undefined;
  let usageMetadata: unknown;

  for (const payload of payloads) {
    if (!isPlainRecord(payload)) {
      continue;
    }

    if (Array.isArray(payload.candidates) || isPlainRecord(payload.usageMetadata)) {
      sawGeminiPayload = true;
    }
    modelVersion = stringValue(payload.modelVersion) || modelVersion;
    responseId = stringValue(payload.responseId) || responseId;
    if (payload.promptFeedback !== undefined && payload.promptFeedback !== null) {
      promptFeedback = payload.promptFeedback;
    }
    if (isPlainRecord(payload.usageMetadata)) {
      usageMetadata = payload.usageMetadata;
    }
    if (Array.isArray(payload.candidates)) {
      payload.candidates.forEach((candidate, index) => collectGeminiCandidate(candidates, candidate, index));
    }
  }

  if (!sawGeminiPayload) {
    return undefined;
  }

  const aggregated: Record<string, unknown> = {
    candidates: Array.from(candidates.values())
      .sort((left, right) => left.order - right.order)
      .map(formatGeminiCandidate)
  };
  if (usageMetadata !== undefined) {
    aggregated.usageMetadata = usageMetadata;
  }
  if (modelVersion) {
    aggregated.modelVersion = modelVersion;
  }
  if (responseId) {
    aggregated.responseId = responseId;
  }
  if (promptFeedback !== undefined) {
    aggregated.promptFeedback = promptFeedback;
  }
  return aggregated;
}

function collectGeminiCandidate(
  candidates: Map<string, GeminiCandidateState>,
  value: unknown,
  fallbackIndex: number
): void {
  if (!isPlainRecord(value)) {
    return;
  }

  const candidate = ensureGeminiCandidate(candidates, value.index ?? fallbackIndex);
  candidate.finishReason = stringValue(value.finishReason) || candidate.finishReason;
  if (isPlainRecord(value.content)) {
    candidate.contentRole = stringValue(value.content.role) || candidate.contentRole;
    if (Array.isArray(value.content.parts)) {
      value.content.parts.forEach((part, index) => collectGeminiPart(candidate, part, index));
    }
  }
  for (const [key, candidateValue] of Object.entries(value)) {
    if (["content", "finishReason", "index"].includes(key)) {
      continue;
    }
    if (candidateValue !== undefined && candidateValue !== null) {
      candidate.extras[key] = candidateValue;
    }
  }
}

function collectGeminiPart(candidate: GeminiCandidateState, value: unknown, rawIndex: unknown): void {
  if (!isPlainRecord(value)) {
    return;
  }

  const part = ensureGeminiPart(candidate, rawIndex);
  if (typeof value.text === "string") {
    part.textParts.push(value.text);
  }
  for (const [key, partValue] of Object.entries(value)) {
    if (key === "text") {
      continue;
    }
    if (partValue !== undefined && partValue !== null) {
      part.extras[key] = partValue;
    }
  }
}

function ensureGeminiCandidate(candidates: Map<string, GeminiCandidateState>, rawIndex: unknown): GeminiCandidateState {
  const index = normalizeStreamIndex(rawIndex) ?? candidates.size;
  const key = String(index);
  const existing = candidates.get(key);
  if (existing) {
    return existing;
  }

  const candidate: GeminiCandidateState = {
    extras: {},
    index,
    order: candidates.size,
    parts: new Map()
  };
  candidates.set(key, candidate);
  return candidate;
}

function ensureGeminiPart(candidate: GeminiCandidateState, rawIndex: unknown): GeminiPartState {
  const index = normalizeStreamIndex(rawIndex) ?? candidate.parts.size;
  const key = String(index);
  const existing = candidate.parts.get(key);
  if (existing) {
    return existing;
  }

  const part: GeminiPartState = {
    extras: {},
    index,
    order: candidate.parts.size,
    textParts: []
  };
  candidate.parts.set(key, part);
  return part;
}

function formatGeminiCandidate(candidate: GeminiCandidateState): Record<string, unknown> {
  const value: Record<string, unknown> = { ...candidate.extras, index: candidate.index };
  const parts = Array.from(candidate.parts.values())
    .sort((left, right) => left.order - right.order)
    .map(formatGeminiPart);
  if (parts.length > 0 || candidate.contentRole) {
    value.content = {
      parts,
      ...(candidate.contentRole ? { role: candidate.contentRole } : {})
    };
  }
  if (candidate.finishReason) {
    value.finishReason = candidate.finishReason;
  }
  return value;
}

function formatGeminiPart(part: GeminiPartState): Record<string, unknown> {
  const value: Record<string, unknown> = { ...part.extras };
  if (part.textParts.length > 0) {
    value.text = part.textParts.join("");
  }
  return value;
}

function parseJsonLikeText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }
  return parseLogJson(trimmed) ?? value;
}

function normalizeStreamIndex(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function streamIndexKey(value: unknown): string | undefined {
  const index = normalizeStreamIndex(value);
  return index === undefined ? undefined : String(index);
}

export function isJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === "object";
}

export function jsonContainerEntries(value: Record<string, unknown> | unknown[]): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }
  return Object.entries(value);
}

export function createInitialLogJsonExpandedPaths(value: unknown): Set<string> {
  return isJsonContainer(value) ? new Set(["$"]) : new Set();
}

export function jsonChildPath(parentPath: string, key: string): string {
  return `${parentPath}/${encodeURIComponent(key)}`;
}

export function jsonContainerSummary(value: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  return `Object(${Object.keys(value).length})`;
}
