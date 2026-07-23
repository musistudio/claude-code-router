import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
  Download,
  Eye,
  EyeOff,
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
  DialogStackLayer,
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
  AgentAnalysisTrace,
  AgentAnalysisTracePayloadFullResult,
  AgentAnalysisTracePayloadRequest,
  AgentAnalysisTraceRun,
  AgentAnalysisTraceRunKind,
  AgentKind,
  AppConfig,
  AppInfo,
  AppSaveConfigOptions,
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
  ProfileRuntimeStatus,
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
  findProviderPresetByIdentityInList,
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

export {
  AppI18nContext,
  appCopy,
  languagePreferenceStorageKey,
  translateOptions,
  translateText,
  useAppText
};
export {
  fallbackConfig,
  fallbackGatewayStatus,
  fallbackInfo,
  fallbackProxyCertificateStatus,
  fallbackProxyNetworkSnapshot,
  fallbackProxyStatus,
  fallbackUpdateStatus
};
export {
  AnimatedDisclosure,
  AnimatedFieldSlot,
  AnimatedListItem,
  disclosureSpringTransition,
  listSpringTransition,
  motionEase,
  pageSpringTransition,
  reducedMotionTransition,
  ViewMotionShell
};
export {
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
};
export {
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
};
export {
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
};
export type { AgentFilterValue, AppCopy, MotionSafeDivAttributes, RouterConditionSource };

let providerPresetCache: ProviderPreset[] = [];

function setProviderPresets(nextPresets: ProviderPreset[]): void {
  providerPresetCache = nextPresets;
}

function getProviderPresets(): ProviderPreset[] {
  return providerPresetCache;
}

function findProviderPreset(id: string | undefined): ProviderPreset | undefined {
  return findProviderPresetInList(providerPresetCache, id);
}

function findProviderPresetByBaseUrl(baseUrl: string): ProviderPreset | undefined {
  return findProviderPresetByBaseUrlInList(providerPresetCache, baseUrl);
}

function findProviderPresetByIdentity(name: string | undefined): ProviderPreset | undefined {
  return findProviderPresetByIdentityInList(providerPresetCache, name);
}

function primaryProviderPresetEndpoint(preset: ProviderPreset): ProviderPresetEndpoint | undefined {
  return primaryProviderPresetEndpointFromPreset(preset);
}

function providerIdentitySafetyIssue(input: {
  baseUrl: string;
  name?: string;
  presetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerIdentitySafetyIssueInList(providerPresetCache, input);
}

function providerApiKeySafetyIssue(input: {
  apiKey?: string;
  baseUrl: string;
  name?: string;
  presetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerApiKeySafetyIssueInList(providerPresetCache, input);
}

function providerEndpointCanReceiveProviderApiKey(input: {
  apiKey?: string;
  endpoint: string;
  providerName?: string;
  providerPresetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerEndpointCanReceiveProviderApiKeyInList(providerPresetCache, input);
}

export {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  closestCenter, DndContext, DragOverlay, getFirstCollision, KeyboardSensor, MeasuringStrategy, pointerWithin,
  PointerSensor, rectIntersection, useSensor, useSensors, arrayMove, rectSortingStrategy, SortableContext,
  sortableKeyboardCoordinates, useSortable, CSS, AnimatePresence, LayoutGroup, motion, useReducedMotion,
  Activity, ArrowDown, ArrowUp, Box, Boxes, Braces, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, Database, Download, FolderOpen,
  ExternalLink, Eye, EyeOff, Gauge, Globe, Info, KeyRound, Layers3, LoaderCircle, MoveRight, Network,
  Palette, PanelLeftClose, PanelLeftOpen, Pause, Pencil, Play, Plus,
  Power, QrCode, RefreshCw, Route, Search, Server, Settings, ShieldCheck,
  Terminal, Trash2, UserRound, X, Area, Bar, BarChart, CartesianGrid,
  Cell, ComposedChart, LabelList, Line, Pie, PieChart, Tooltip,
  XAxis, YAxis, Badge, Button, Card, CardContent, CardHeader,
  CardTitle, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogStackLayer,
  DialogTitle, Input, Label, PopoverContent, Select, Switch, Textarea,
  cn, appLogoUrl, claudeCodeLogoUrl, codexLogoUrl, onboardingMascotSpriteUrl, anthropicProviderIconUrl, bailianProviderIconUrl, deepseekProviderIconUrl,
  geminiProviderIconUrl, mistralProviderIconUrl, moonshotProviderIconUrl, openaiProviderIconUrl, openrouterProviderIconUrl, siliconflowProviderIconUrl, zaiGlobalCodingProviderIconUrl,
  zaiGlobalGeneralProviderIconUrl, zhipuCnCodingProviderIconUrl, zhipuCnGeneralProviderIconUrl, trayCyanIconUrl, trayOrangeIconUrl, trayVioletIconUrl, BUILTIN_FUSION_TOOL_SERVER_NAME,
  BUILTIN_FUSION_VISION_TOOL_NAME, BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME, DEFAULT_OVERVIEW_WIDGETS, DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WIDGETS, DEFAULT_TRAY_WINDOW_MODULES, enforceSingleEnabledGlobalProfilePerAgent, OVERVIEW_WIDGET_SIZE_VALUES, TRAY_SINGLETON_WIDGET_TYPES, TRAY_TOP_WIDGET_TYPES, TRAY_WINDOW_MODULE_IDS,
  customProviderPresetId, defaultProviderAccountConfig, findProviderPreset, findProviderPresetByBaseUrl, findProviderPresetByIdentity, primaryProviderPresetEndpoint, providerApiKeySafetyIssue, providerEndpointCanReceiveProviderApiKey,
  providerIdentitySafetyIssue, getProviderPresets, setProviderPresets, standardProviderAccountConfig, normalizeProviderBaseUrl, providerUrlWithDefaultScheme
};
export type {
  HTMLAttributes, ReactDragEvent, ReactPointerEvent, ReactNode, CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent,
  LucideIcon, AgentAnalysisFilter, AgentAnalysisSessionSelection, AgentAnalysisSnapshot, AgentAnalysisTrace, AgentAnalysisTracePayloadFullResult, AgentAnalysisTracePayloadRequest, AgentAnalysisTraceRun, AgentAnalysisTraceRunKind, AgentKind, AppConfig, AppInfo, AppSaveConfigOptions, AppUpdateStatus, ApiKeyConfig,
  ApiKeyLimitConfig, BotGatewayQrLoginCancelRequest, BotGatewayQrLoginCancelResult, BotGatewayQrLoginStartRequest, BotGatewayQrLoginStartResult, BotGatewayQrLoginWaitRequest, BotGatewayQrLoginWaitResult, BotGatewayQrWindowOpenResult, BotGatewayRuntimeConfig, BotGatewaySavedConfig, BotHandoffScanTarget, GatewayProviderConfig, GatewayProviderCapability, GatewayPluginAppConfig, GatewayProviderProbeResult, GatewayProviderProtocol, GatewayMcpServerConfig,
  GatewayMcpServerTransport, GatewayMcpStdioMessageMode, GatewayMcpToolInfo, GatewayStatus, OverviewMetricKind, OverviewWidgetConfig, OverviewWidgetSize, OverviewWidgetType,
  OverviewWidgetVariant, PluginDependency, PluginDirectorySelection, PluginMarketplaceEntry, ProviderAccountConfig, ProviderAccountConnectorConfig, ProviderAccountHttpJsonConnectorConfig,
  ProviderAccountMeter, ProviderAccountStandardConnectorConfig, ProviderAccountSnapshot, ProviderAccountTestPath, ProviderAccountTestResult, ProviderDeepLinkPayload, ProviderDeepLinkRequest,
  ProviderCredentialConfig,
  ProfileConfig, ProfileOpenSurface, ProfileRuntimeStatus, CodexProfileConfigFormat, ProfileScope, ProfileSurface, ProxyCertificateInstallResult, ProxyCertificateStatus, ProxyNetworkBody,
  ProxyNetworkExchange, ProxyNetworkSnapshot, ProxyStatus, RequestLogBody, RequestLogEntry, RequestLogListFilter, RequestLogPage,
  RequestLogStatusFilter, RouterConfig, RouterFallbackConfig, RouterFallbackMode, RouterRule, RouterRuleType, TrayComponentVariants,
  TrayBalanceProgressConfig, TrayWidgetConfig, TrayWidgetType, TrayWidgetVariant, TrayWindowModuleId, UsageComparisonRow, UsageSeriesPoint, UsageStatsFilter, UsageStatsRange, UsageStatsSnapshot, UsageTotals,
  VirtualModelBaseModelMode, VirtualModelExecutionMode, VirtualModelFusionCustomToolConfig, VirtualModelFusionVisionConfig, VirtualModelFusionWebSearchConfig, VirtualModelFusionWebSearchProvider, VirtualModelProfileConfig, VirtualModelToolVisibility, ProviderIdentitySafetyIssue, ProviderPreset, ProviderPresetEndpoint
};
