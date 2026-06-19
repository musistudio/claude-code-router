import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
import trayCyanIconUrl from "../../../../assets/tray-cyan.png";
import trayOrangeIconUrl from "../../../../assets/tray-orange.png";
import trayVioletIconUrl from "../../../../assets/tray-violet.png";
import {
  BUILTIN_FUSION_TOOL_SERVER_NAME,
  BUILTIN_FUSION_VISION_TOOL_NAME,
  BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME,
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
} from "../../../shared/app";
import type {
  AgentAnalysisFilter,
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
  BotGatewayRuntimeConfig,
  BotGatewaySavedConfig,
  GatewayProviderConfig,
  GatewayProviderCapability,
  GatewayPluginAppConfig,
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
  RouterRuleType,
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
} from "../../../shared/app";
import {
  customProviderPresetId,
  defaultProviderAccountConfig,
  findProviderPreset,
  findProviderPresetByBaseUrl,
  primaryProviderPresetEndpoint,
  providerApiKeySafetyIssue,
  providerEndpointCanReceiveProviderApiKey,
  providerIdentitySafetyIssue,
  providerPresets,
  standardProviderAccountConfig,
  type ProviderIdentitySafetyIssue,
  type ProviderPreset,
  type ProviderPresetEndpoint
} from "../../../shared/provider-presets";
import { normalizeProviderBaseUrl, providerUrlWithDefaultScheme } from "../../../shared/provider-url";

export  {
  createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  closestCenter, DndContext, DragOverlay, getFirstCollision, KeyboardSensor, MeasuringStrategy, pointerWithin,
  PointerSensor, rectIntersection, useSensor, useSensors, arrayMove, rectSortingStrategy, SortableContext,
  sortableKeyboardCoordinates, useSortable, CSS, AnimatePresence, LayoutGroup, motion, useReducedMotion,
  Activity, ArrowDown, ArrowUp, Box, Boxes, Braces, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, Database, FolderOpen,
  ExternalLink, Gauge, Globe, KeyRound, Layers3, LoaderCircle, MoveRight, Network,
  Palette, PanelLeftClose, PanelLeftOpen, Pause, Pencil, Play, Plus,
  Power, QrCode, RefreshCw, Route, Search, Server, Settings, ShieldCheck,
  Trash2, UserRound, X, Area, Bar, BarChart, CartesianGrid,
  Cell, ComposedChart, LabelList, Line, Pie, PieChart, Tooltip,
  XAxis, YAxis, Badge, Button, Card, CardContent, CardHeader,
  CardTitle, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, Input, Label, PopoverContent, Select, Switch, Textarea,
  cn, claudeCodeLogoUrl, codexLogoUrl, onboardingMascotSpriteUrl, anthropicProviderIconUrl, bailianProviderIconUrl, deepseekProviderIconUrl,
  geminiProviderIconUrl, mistralProviderIconUrl, moonshotProviderIconUrl, openaiProviderIconUrl, openrouterProviderIconUrl, siliconflowProviderIconUrl, zaiGlobalCodingProviderIconUrl,
  zaiGlobalGeneralProviderIconUrl, zhipuCnCodingProviderIconUrl, zhipuCnGeneralProviderIconUrl, trayCyanIconUrl, trayOrangeIconUrl, trayVioletIconUrl, BUILTIN_FUSION_TOOL_SERVER_NAME,
  BUILTIN_FUSION_VISION_TOOL_NAME, BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME, DEFAULT_OVERVIEW_WIDGETS, DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WIDGETS, DEFAULT_TRAY_WINDOW_MODULES, enforceSingleEnabledGlobalProfilePerAgent, OVERVIEW_WIDGET_SIZE_VALUES, TRAY_SINGLETON_WIDGET_TYPES, TRAY_TOP_WIDGET_TYPES, TRAY_WINDOW_MODULE_IDS,
  customProviderPresetId, defaultProviderAccountConfig, findProviderPreset, findProviderPresetByBaseUrl, primaryProviderPresetEndpoint, providerApiKeySafetyIssue, providerEndpointCanReceiveProviderApiKey,
  providerIdentitySafetyIssue, providerPresets, standardProviderAccountConfig, normalizeProviderBaseUrl, providerUrlWithDefaultScheme
};
export type {
  HTMLAttributes, ReactPointerEvent, ReactNode, CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent,
  LucideIcon, AgentAnalysisFilter, AgentAnalysisSnapshot, AgentKind, AppConfig, AppInfo, AppUpdateStatus, ApiKeyConfig,
  ApiKeyLimitConfig, BotGatewayQrLoginCancelRequest, BotGatewayQrLoginCancelResult, BotGatewayQrLoginStartRequest, BotGatewayQrLoginStartResult, BotGatewayQrLoginWaitRequest, BotGatewayQrLoginWaitResult, BotGatewayRuntimeConfig, BotGatewaySavedConfig, GatewayProviderConfig, GatewayProviderCapability, GatewayPluginAppConfig, GatewayProviderProbeResult, GatewayProviderProtocol, GatewayMcpServerConfig,
  GatewayMcpServerTransport, GatewayMcpStdioMessageMode, GatewayMcpToolInfo, GatewayStatus, OverviewMetricKind, OverviewWidgetConfig, OverviewWidgetSize, OverviewWidgetType,
  OverviewWidgetVariant, PluginDependency, PluginDirectorySelection, PluginMarketplaceEntry, ProviderAccountConfig, ProviderAccountConnectorConfig, ProviderAccountHttpJsonConnectorConfig,
  ProviderAccountMeter, ProviderAccountStandardConnectorConfig, ProviderAccountSnapshot, ProviderAccountTestPath, ProviderAccountTestResult, ProviderDeepLinkPayload, ProviderDeepLinkRequest,
  ProfileConfig, ProfileOpenSurface, CodexProfileConfigFormat, ProfileScope, ProfileSurface, ProxyCertificateInstallResult, ProxyCertificateStatus, ProxyNetworkBody,
  ProxyNetworkExchange, ProxyNetworkSnapshot, ProxyStatus, RequestLogBody, RequestLogEntry, RequestLogListFilter, RequestLogPage,
  RequestLogStatusFilter, RouterConfig, RouterFallbackConfig, RouterFallbackMode, RouterRule, RouterRuleType, TrayComponentVariants,
  TrayWidgetConfig, TrayWidgetType, TrayWidgetVariant, TrayWindowModuleId, UsageComparisonRow, UsageSeriesPoint, UsageStatsFilter, UsageStatsRange, UsageStatsSnapshot, UsageTotals,
  VirtualModelBaseModelMode, VirtualModelExecutionMode, VirtualModelFusionCustomToolConfig, VirtualModelFusionVisionConfig, VirtualModelFusionWebSearchConfig, VirtualModelFusionWebSearchProvider, VirtualModelProfileConfig, VirtualModelToolVisibility, ProviderIdentitySafetyIssue, ProviderPreset, ProviderPresetEndpoint
};


export type ViewId = "onboarding" | "overview" | "observability" | "api-keys" | "server" | "profile" | "networking" | "logs" | "providers" | "models" | "routing" | "virtual-models" | "extensions";
export type NavigationId = ViewId;
export type OnboardingStepId = "provider" | "profile" | "enter";
export type AppLanguagePreference = "system" | "en" | "zh";
export type ResolvedLanguage = "en" | "zh";
export type ResolvedTheme = "light" | "dark";
export type SettingsPageId = "appearance" | "bots" | "tray" | "update";
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

export type AppCopy = {
  navigation: Record<NavigationId, string>;
  settings: {
    appearance: string;
    bots: string;
    button: string;
    close: string;
    done: string;
    language: string;
    languageChinese: string;
    languageEnglish: string;
    languageSystem: string;
    theme: string;
    themeDark: string;
    themeLight: string;
    themeSystem: string;
    tray: string;
    update: string;
    trayIcon: string;
    trayIconCyan: string;
    trayIconOrange: string;
    trayIconProgress: string;
    trayIconRandom: string;
    trayIconViolet: string;
    trayComponentAccount: string;
    trayComponentArc: string;
    trayComponentArea: string;
    trayComponentBar: string;
    trayComponentBars: string;
    trayComponentCards: string;
    trayComponentCompact: string;
    trayComponentDonut: string;
    trayComponentFlow: string;
    trayComponentGauges: string;
    trayComponentLine: string;
    trayComponentList: string;
    trayComponentModelShare: string;
    trayComponentPie: string;
    trayComponentPills: string;
    trayComponentRing: string;
    trayComponentRings: string;
    trayComponentSparkline: string;
    trayComponentStacked: string;
    trayComponentStats: string;
    trayComponentStyles: string;
    trayComponentEnabled: string;
    trayComponentProperties: string;
    trayComponentStyle: string;
    trayComponents: string;
    trayComponentTokenMix: string;
    trayModuleAccount: string;
    trayModuleFooter: string;
    trayModuleHeader: string;
    trayModuleModelShare: string;
    trayModuleRings: string;
    trayModuleSourceTabs: string;
    trayModuleStats: string;
    trayModuleTokenFlow: string;
    trayModuleTokenMix: string;
    trayPreview: string;
    trayPreviewEmpty: string;
    trayProgressTarget: string;
    trayWindowModules: string;
    title: string;
  };
  sidebar: {
    collapse: string;
    expand: string;
    primaryNavigation: string;
  };
  text: Record<string, string>;
};

export const languagePreferenceStorageKey = "ccr.ui.language";

export const appCopy: Record<ResolvedLanguage, AppCopy> = {
  en: {
    navigation: {
      onboarding: "Onboarding",
      "api-keys": "API Keys",
      extensions: "Extensions",
      logs: "Logs",
      networking: "Networking",
      observability: "Observability",
      overview: "Overview",
      profile: "Agent Config",
      providers: "Providers",
      models: "Models",
      routing: "Routing",
      server: "Server",
      "virtual-models": "Fusion"
    },
    settings: {
      appearance: "Appearance",
      bots: "Bots",
      button: "Settings",
      close: "Close",
      done: "Done",
      language: "Language",
      languageChinese: "Chinese",
      languageEnglish: "English",
      languageSystem: "System",
      theme: "Theme",
      themeDark: "Dark",
      themeLight: "Light",
      themeSystem: "System",
      tray: "Tray",
      update: "Updates",
      trayIcon: "Tray mascot",
      trayIconCyan: "Cyan",
      trayIconOrange: "Orange",
      trayIconProgress: "Progress ring",
      trayIconRandom: "Random",
      trayIconViolet: "Violet",
      trayComponentAccount: "Account meter",
      trayComponentArc: "Arc",
      trayComponentArea: "Area",
      trayComponentBar: "Bar",
      trayComponentBars: "Bars",
      trayComponentCards: "Cards",
      trayComponentCompact: "Compact",
      trayComponentDonut: "Donut",
      trayComponentFlow: "Flow chart",
      trayComponentGauges: "Gauges",
      trayComponentLine: "Line",
      trayComponentList: "List",
      trayComponentModelShare: "Model share",
      trayComponentPie: "Pie",
      trayComponentPills: "Pills",
      trayComponentRing: "Ring",
      trayComponentRings: "Rings",
      trayComponentSparkline: "Sparkline",
      trayComponentStacked: "Stacked",
      trayComponentStats: "Stats",
      trayComponentStyles: "Component styles",
      trayComponentEnabled: "Enabled",
      trayComponentProperties: "Component properties",
      trayComponentStyle: "Style",
      trayComponents: "Components",
      trayComponentTokenMix: "Token mix",
      trayModuleAccount: "Account balance",
      trayModuleFooter: "Footer actions",
      trayModuleHeader: "Title and status",
      trayModuleModelShare: "Model share",
      trayModuleRings: "Circular metrics",
      trayModuleSourceTabs: "Provider tabs",
      trayModuleStats: "Token stats",
      trayModuleTokenFlow: "Token flow chart",
      trayModuleTokenMix: "Token mix",
      trayPreview: "Preview",
      trayPreviewEmpty: "No tray modules enabled",
      trayProgressTarget: "Progress target",
      trayWindowModules: "Tray window modules",
      title: "Settings"
    },
    sidebar: {
      collapse: "Collapse sidebar",
      expand: "Expand sidebar",
      primaryNavigation: "Primary navigation"
    },
    text: {
      "上一页": "Previous page",
      "下一页": "Next page",
      "全部状态": "All statuses",
      "成功": "Success",
      "错误": "Error",
      "时间": "Time",
      "状态": "Status",
      "模型": "Model",
      "Stream": "Stream",
      "Streaming": "Streaming",
      "Non-streaming": "Non-streaming",
      "令牌": "Tokens",
      "成本": "Cost",
      "持续时间": "Duration",
      "反馈": "Feedback",
      "Failed requests": "Failed requests",
      "输入": "Input",
      "输出": "Output",
      "缓存读取": "Cache read",
      "缓存写入": "Cache write",
      "总计": "Total",
      "请求": "Request",
      "响应": "Response",
      "复制": "Copy",
      "筛选日志、模型、请求或响应": "Filter logs, models, requests, or responses",
      "全部供应商": "All providers",
      "全部模型": "All models",
      "正在加载日志": "Loading logs",
      "暂无日志": "No logs",
      "No request headers": "No request headers",
      "No response headers": "No response headers",
      "筛选 JSON...": "Filter JSON...",
      "body": "Body",
      "header": "Headers",
      "入": "in",
      "出": "out",
      "No provider presets found": "No provider presets found",
      "After you enter the API endpoint and key, the system will automatically detect supported protocols and available models.": "After you enter the API endpoint and key, the system will automatically detect supported protocols and available models.",
      "Back": "Back",
      "Check": "Check",
      "Connection verified": "Connection verified",
      "Press Enter to add": "Press Enter to add",
      "Service": "Service",
      "Account Balance": "Account Balance",
      "Account component": "Account component",
      "All accounts": "All accounts",
      "Add widget": "Add widget",
      "Analysis component": "Analysis component",
      "Arc": "Arc",
      "Area": "Area",
      "Average latency": "Average latency",
      "Bar": "Bar",
      "Bars": "Bars",
      "Breakdown component": "Breakdown component",
      "Cards": "Cards",
      "Change widget type": "Change widget type",
      "Client Analysis": "Client Analysis",
      "Component properties": "Component properties",
      "Components": "Components",
      "Component category": "Component category",
      "Compact": "Compact",
      "Composed": "Composed",
      "Client or provider": "Client or provider",
      "Data": "Data",
      "Done": "Done",
      "Donut": "Donut",
      "Drag cards to arrange": "Drag cards to arrange",
      "Drag to move": "Drag to move",
      "Edit widgets": "Edit widgets",
      "Full": "Full",
      "Header component": "Header component",
      "Large": "Large",
      "Line": "Line",
      "Medium": "Medium",
      "Metric": "Metric",
      "Metric component": "Metric component",
      "Move down": "Move down",
      "Move up": "Move up",
      "Nested rings": "Nested rings",
      "No widget selected": "No widget selected",
      "No widgets configured": "No widgets configured",
      "Overview layout": "Overview layout",
      "Overview": "Overview",
      "Pie": "Pie",
      "Provider Analysis": "Provider Analysis",
      "Provider component": "Provider component",
      "Preview": "Preview",
      "Requests, tokens, cost": "Requests, tokens, cost",
      "Remove widget": "Remove widget",
      "Reset layout": "Reset layout",
      "Resize widget height": "Resize widget height",
      "Resize widget size": "Resize widget size",
      "Resize widget width": "Resize widget width",
      "Ring": "Ring",
      "Semicircle": "Semicircle",
      "Small": "Small",
      "Stacked": "Stacked",
      "Status component": "Status component",
      "Status timeline": "Status timeline",
      "Style": "Style",
      "Table": "Table",
      "Timeline": "Timeline",
      "Token distribution": "Token distribution",
      "Token mix, rings, model share": "Token mix, rings, model share",
      "Token mix component": "Token mix component",
      "Trend component": "Trend component",
      "Usage over time": "Usage over time",
      "Widget": "Widget",
      "Widget size": "Widget size",
      "Wide": "Wide",
      "Virtual model": "Fusion",
      "Virtual Models": "Fusion",
      "Add Virtual Model": "Add Fusion",
      "Add virtual model": "Add Fusion",
      "Edit Virtual Model": "Edit Fusion",
      "Edit virtual model": "Edit Fusion",
      "Fusion combines a model with another model or tools into a new model.": "Fusion combines a model with another model or tools into a new model.",
      "Fusion example": "Example: GLM 5.2 + GLM 5V Turbo = GLM 5.2V",
      "Vision tool configuration": "Vision tool configuration",
      "Choose a configured gateway model for image understanding.": "Choose a configured gateway model for image understanding.",
      "Vision model": "Vision model",
      "Vision model is required.": "Vision model is required.",
      "Web search configuration": "Web search configuration",
      "Search provider": "Search provider",
	      "Provider configuration": "Provider configuration",
	      "Add variable": "Add variable",
	      "Add custom MCP": "Add custom MCP",
	      "Add custom MCP tool": "Add custom MCP tool",
	      "Custom MCP tool": "Custom MCP tool",
	      "Discover tools": "Discover tools",
	      "MCP tools": "MCP tools",
	      "MCP server": "MCP server",
      "Arguments": "Arguments",
      "Working directory": "Working directory",
      "API key env": "API key env",
      "Tool name": "Tool name",
      "Third-party tool environment": "Third-party tool environment",
      "Environment variables": "Environment variables",
      "Tool name is required.": "Tool name is required.",
	      "Environment variable keys are required when values are set.": "Environment variable keys are required when values are set.",
	      "MCP tool discovery is available in the Electron app.": "MCP tool discovery is available in the Electron app.",
	      "No MCP servers configured": "No MCP servers configured",
	      "No tools discovered": "No tools discovered",
	      "Select tool": "Select tool",
	      "Tool discovery failed": "Tool discovery failed",
	      "Image recognition": "Image recognition",
      "Image recognition and Web Search": "Image recognition and Web Search",
      "Generic image understanding tool for OCR, screenshot analysis, chart reading, UI comparison, error diagnosis, and other multi-image tasks.": "Generic image understanding tool for OCR, screenshot analysis, chart reading, UI comparison, error diagnosis, and other multi-image tasks.",
      "Generic web search tool supporting Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, and Exa.": "Generic web search tool supporting Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, and Exa.",
      "Web Search": "Web Search",
      "New model": "New model",
      "New model is required.": "New model is required.",
      "Base model is required.": "Base model is required.",
      "Tool is required.": "Tool is required.",
      "No matching virtual models": "No matching Fusion profiles",
      "No virtual models configured": "No Fusion profiles configured",
      "Remove virtual model": "Remove Fusion",
      "Search virtual models": "Search Fusion",
      "Virtual": "Fusion",
      "Virtual models": "Fusion",
      "Header中未收到Authorization参数，无法进行身份验证。": "Missing Authorization header, so authentication could not be performed."
    }
  },
  zh: {
    navigation: {
      onboarding: "上手引导",
      "api-keys": "API 密钥",
      extensions: "扩展",
      logs: "日志",
      networking: "网络",
      observability: "观测",
      overview: "概览",
      profile: "Agent配置",
      providers: "供应商",
      models: "模型",
      routing: "路由",
      server: "服务",
      "virtual-models": "Fusion"
    },
    settings: {
      appearance: "外观",
      bots: "Bot 管理",
      button: "设置",
      close: "关闭",
      done: "完成",
      language: "语言",
      languageChinese: "中文",
      languageEnglish: "英文",
      languageSystem: "跟随系统",
      theme: "主题",
      themeDark: "暗色",
      themeLight: "亮色",
      themeSystem: "跟随系统",
      tray: "Tray",
      update: "更新",
      trayIcon: "托盘小精灵",
      trayIconCyan: "青色小精灵",
      trayIconOrange: "橙色小精灵",
      trayIconProgress: "圆形进度条",
      trayIconRandom: "随机",
      trayIconViolet: "紫色小精灵",
      trayComponentAccount: "账户指标",
      trayComponentArc: "弧形",
      trayComponentArea: "面积图",
      trayComponentBar: "柱状图",
      trayComponentBars: "横条",
      trayComponentCards: "卡片",
      trayComponentCompact: "紧凑",
      trayComponentDonut: "环形图",
      trayComponentFlow: "趋势图",
      trayComponentGauges: "仪表盘",
      trayComponentLine: "折线图",
      trayComponentList: "列表",
      trayComponentModelShare: "模型占比",
      trayComponentPie: "饼图",
      trayComponentPills: "胶囊",
      trayComponentRing: "圆环",
      trayComponentRings: "圆环",
      trayComponentSparkline: "迷你折线",
      trayComponentStacked: "堆叠",
      trayComponentStats: "指标",
      trayComponentStyles: "组件样式",
      trayComponentEnabled: "启用组件",
      trayComponentProperties: "组件属性",
      trayComponentStyle: "样式",
      trayComponents: "组件区",
      trayComponentTokenMix: "Token 构成",
      trayModuleAccount: "账户余额",
      trayModuleFooter: "底部操作",
      trayModuleHeader: "标题和状态",
      trayModuleModelShare: "模型占比",
      trayModuleRings: "环形指标",
      trayModuleSourceTabs: "供应商切换",
      trayModuleStats: "Token 指标",
      trayModuleTokenFlow: "Token 趋势图",
      trayModuleTokenMix: "Token 构成",
      trayPreview: "预览",
      trayPreviewEmpty: "未启用 Tray 模块",
      trayProgressTarget: "进度目标",
      trayWindowModules: "Tray 窗口模块",
      title: "设置"
    },
    sidebar: {
      collapse: "收起侧边栏",
      expand: "展开侧边栏",
      primaryNavigation: "主导航"
    },
    text: {
      "24h": "24 小时",
      "7d": "7 天",
      "30d": "30 天",
      "Agent": "Agent",
      "A provider is required before profiles can route traffic.": "需要先配置供应商，配置档案才能路由请求。",
      "Add or verify a model provider.": "添加或确认模型供应商。",
      "Agent Analysis": "Agent 分析",
      "Agent access": "Agent 接入",
      "Agent Mix": "Agent 分布",
      "Agent profiles": "Agent 配置档案",
      "All agents": "全部 Agent",
      "All providers": "全部供应商",
      "API key": "API 密钥",
      "API keys database": "API 密钥数据库",
      "Only enter an API key issued for this endpoint. Official provider keys must only be used with official endpoints.": "只输入由当前端点签发的 API 密钥。官方供应商密钥只能用于官方端点。",
      "Add": "添加",
      "Add env variable": "添加环境变量",
      "Add header": "添加请求头",
      "Add API Key": "添加 API 密钥",
      "Add API key": "添加 API 密钥",
      "Add limit": "添加限制",
      "Add Profile": "添加配置",
      "Add profile": "添加配置",
      "Add Provider": "添加供应商",
      "Add provider": "添加供应商",
      "Add bot": "添加 Bot",
      "Add new bot": "添加新 Bot",
      "Add Routing Rule": "添加路由规则",
      "Add routing rule": "添加路由规则",
      "Advanced Settings...": "高级设置...",
      "Advanced settings": "高级设置",
      "Always": "始终",
      "Alias": "别名",
      "Alias is required.": "别名不能为空。",
      "Applied": "已应用",
      "App only": "仅 App",
      "Args": "参数",
      "API Keys": "API 密钥",
      "API key included": "已包含 API 密钥",
      "API key not included": "未包含 API 密钥",
      "Acknowledge events": "确认事件",
      "Auth type": "认证类型",
      "Auth method": "认证方式",
      "Auto start integration": "自动启动集成",
      "Base URL": "基础 URL",
      "Bot": "Bot",
      "Bot name, platform, and required authentication fields are required.": "Bot 名称、平台和必填认证字段不能为空。",
      "Bot gateway path": "Bot 网关路径",
      "Weixin iLink": "微信",
      "WeCom": "企业微信",
      "Feishu": "飞书",
      "DingTalk": "钉钉",
      "QR Login": "扫码登录",
      "Weixin QR login": "微信扫码登录",
      "Weixin QR code": "微信二维码",
      "QR login is available in the Electron app.": "扫码登录仅在 Electron App 中可用。",
      "Generate QR code": "生成二维码",
      "Generating QR code": "正在生成二维码",
      "Scan the QR code in Weixin.": "请使用微信扫描二维码。",
      "Scan with Weixin to connect this bot.": "使用微信扫码连接这个 Bot。",
      "Waiting for QR code": "等待生成二维码",
      "Waiting for scan": "等待扫码",
      "Scanned, confirm on phone": "已扫码，请在手机上确认",
      "Verification required": "需要验证码",
      "Connected": "已连接",
      "QR code expired": "二维码已过期",
      "Already connected": "已连接过",
      "QR login failed": "扫码登录失败",
      "Regenerate": "重新生成",
      "Bot Token": "Bot Token",
      "Account ID": "账号 ID",
      "User ID": "用户 ID",
      "Corp ID": "企业 ID",
      "Agent ID": "Agent ID",
      "Secret": "Secret",
      "Signing Secret": "Signing Secret",
      "App Token": "App Token",
      "OAuth 2.0": "OAuth 2.0",
      "OAuth Bot Token": "OAuth Bot Token",
      "OAuth Access Token": "OAuth Access Token",
      "Application ID": "应用 ID",
      "Public Key": "公钥",
      "Channel Access Token": "Channel Access Token",
      "Channel Secret": "Channel Secret",
      "App ID": "App ID",
      "App Secret": "App Secret",
      "Verification Token": "Verification Token",
      "Domain": "Domain",
      "App Key": "App Key",
      "Robot Code": "Robot Code",
      "Optional": "可选",
      "Auto": "自动",
      "Back": "返回",
      "Backup": "备份",
      "Cache": "缓存",
      "Cache rate": "缓存率",
      "Cache ratio": "缓存率",
      "Cache tokens": "缓存令牌",
      "Cache write": "缓存写入",
      "Cancel": "取消",
      "Channel": "频道",
      "Check": "检查",
      "Check for updates": "检查更新",
      "Checking for updates": "正在检查更新",
      "Capture network": "捕获网络",
      "Connection verified": "连通性已验证",
      "Check trust": "检查信任",
      "Choose where each agent uses CCR.": "选择每个 Agent 在哪里使用 CCR。",
      "Click Add to create one": "点击添加创建一项",
      "Click Install to add one": "点击安装添加一项",
      "Client": "客户端",
      "Client Analysis": "客户端分析",
      "Client Signals": "客户端信号",
      "Claude Code": "Claude Code",
      "CLI": "CLI",
      "CLI command": "CLI 命令",
      "Close": "关闭",
      "Close dialog": "关闭弹窗",
      "Code": "代码",
      "Codex": "Codex",
      "Codex model": "Codex 模型",
      "CLI only": "仅 CLI",
      "Concurrency": "并发",
      "Condition": "条件",
      "Conversation type": "会话类型",
      "Claude Design": "Claude Design",
      "Claude Design model": "Claude Design 模型",
      "Claude Design routes": "Claude Design 路由",
      "Configure": "配置",
      "Configure provider": "配置供应商",
      "Configure Extension": "配置扩展",
      "Configure extension": "配置扩展",
      "Configure plugin": "配置插件",
      "Configure plugin route": "配置插件路由",
      "Configure Routing": "配置路由",
      "Copy": "复制",
      "Create integration": "创建集成",
      "Credentials JSON": "凭据 JSON",
      "Continue": "继续",
      "Custom config path": "自定义配置路径",
      "Core gateway": "核心网关",
      "Cost": "成本",
      "Estimated cost": "估算成本",
      "Connect agent": "接入 Agent",
      "Create a profile for your agent.": "为你的 Agent 创建配置档案。",
      "Cursor model": "Cursor 模型",
      "Cursor Proxy routes": "Cursor Proxy 路由",
      "Custom": "自定义",
      "Delete": "删除",
      "Delete Extension": "删除扩展",
      "Delete Provider": "删除供应商",
      "Delete Routing Rule": "删除路由规则",
      "Delete this extension from the configuration?": "从配置中删除这个扩展？",
      "Delete this provider from the configuration?": "从配置中删除这个供应商？",
      "Delete this routing rule from the configuration?": "从配置中删除这条路由规则？",
      "Dependencies": "依赖",
      "Default target model": "默认目标模型",
      "Default failure handling": "默认故障处理",
      "Description": "描述",
      "Display name": "显示名称",
      "Double click to copy": "双击复制",
      "Edit": "编辑",
      "Edit bot": "编辑 Bot",
      "Edit API Key": "编辑 API 密钥",
      "Edit API key": "编辑 API 密钥",
      "Edit Profile": "编辑配置",
      "Edit Provider": "编辑供应商",
      "Edit provider": "编辑供应商",
      "Edit Routing Rule": "编辑路由规则",
      "Edit rule": "编辑规则",
      "Effect scope": "作用范围",
      "Enabled": "启用",
      "Endpoint": "端点",
      "Entry mode": "入口模式",
      "Environment variables": "环境变量",
      "Endpoint Health": "端点健康",
      "Endpoint information": "端点信息",
      "Let's start": "开始吧",
      "Errors": "错误数",
      "Failed requests": "失败请求",
      "Expiration": "过期时间",
      "Expires at": "过期于",
      "Exact model": "精确模型",
      "Extensions": "扩展",
      "Fallback": "兜底",
      "Fallback chain": "回退链",
      "Fallback model": "回退模型",
      "Failure handling": "故障处理",
      "First enabled": "首个启用规则",
      "Forward agent messages": "转发 Agent 消息",
      "Gateway conversation ID": "网关会话 ID",
      "Generated config": "生成配置",
      "Generated path": "生成路径",
      "Group": "群组",
      "Headers": "请求头",
      "Header rows require keys.": "请求头行必须填写 Key。",
      "Fetch usage": "获取用量",
      "Fetch manifest": "拉取 manifest",
      "Handoff": "Handoff",
      "Hide advanced settings": "收起高级设置",
      "HTTP JSON request": "HTTP JSON 请求",
      "Host": "主机",
      "ID": "ID",
      "Import": "导入",
      "Import Provider": "导入供应商",
      "Import Provider Manifest": "导入供应商 Manifest",
      "Imported provider": "已导入供应商",
      "Invalid JSON.": "JSON 无效。",
      "Image content": "图像内容",
      "Images": "图像",
      "Idle seconds": "空闲秒数",
      "Input": "输入",
      "Input tokens": "输入令牌",
      "Integration ID": "集成 ID",
      "Install": "安装",
      "Install and restart": "安装并重启",
      "App": "App",
      "Install Extension": "安装扩展",
      "Install extension": "安装扩展",
      "Install CA": "安装 CA",
      "Key": "键",
      "Keep Claude Code default": "保持 Claude Code 默认值",
      "Keep default": "保持默认值",
      "Last apply": "上次应用",
      "Last checked": "上次检查",
      "Last request": "最近请求",
      "Last seen": "最近活跃",
      "Legacy profile table": "旧版配置档案表",
      "Limit": "限制",
      "Limits": "限制",
      "Loading": "加载中",
      "Local": "本地",
      "Logs": "日志",
      "Long context": "长上下文",
      "Long threshold": "长上下文阈值",
      "Max concurrency": "最大并发",
      "Max concurrent": "最大并发",
      "Manage bots used by agent profiles.": "管理 Agent 配置中可选择的 Bot。",
      "Method": "方法",
      "Model": "模型",
      "Model override": "模型覆盖",
      "Model routing": "模型路由",
      "Model prefix": "模型前缀",
      "Models": "模型",
      "Module path": "模块路径",
      "Name": "名称",
      "Networking": "网络",
      "Never": "永不",
      "No API keys": "暂无 API 密钥",
      "No agent activity": "暂无 Agent 行为数据",
      "No client signals": "暂无客户端信号",
      "No client usage yet": "暂无客户端用量",
      "No endpoint activity": "暂无端点活动",
      "No errors": "暂无错误",
      "No provider presets found": "没有匹配的预设供应商",
      "No provider usage yet": "暂无供应商用量",
      "No provider yet": "还没有供应商",
      "No requests captured yet": "暂无请求记录",
      "No bots configured": "尚未配置 Bot",
      "No route activity": "暂无路由活动",
      "None": "无",
      "Not configured": "未配置",
      "Not running": "未运行",
      "Open": "打开",
      "Open Agent": "打开Agent",
      "Open CA": "打开 CA",
      "Open Profile": "打开配置",
      "Only opened from CCR": "仅从 CCR 打开",
      "Open profiles": "查看配置档案",
      "Open providers": "查看供应商",
      "Output": "输出",
      "Output tokens": "输出令牌",
      "Observability": "可观测",
      "Off": "关闭",
      "Onboarding": "上手引导",
      "P50": "P50",
      "P95": "P95",
      "P99": "P99",
      "Path": "路径",
      "Platform": "平台",
      "Platform conversation ID": "平台会话 ID",
      "Phone Bluetooth target": "手机蓝牙目标",
      "Phone Wi-Fi target": "手机 Wi-Fi 目标",
      "Plugin": "插件",
      "Plugin apps must be a JSON array.": "插件 App 必须是 JSON 数组。",
      "Plugin config JSON": "插件配置 JSON",
      "Plugin config must be a JSON object.": "插件配置必须是 JSON 对象。",
      "Plugin route": "插件路由",
      "Plugin Settings": "插件设置",
      "Port": "端口",
      "Process": "进程",
      "Protocol": "协议",
      "Protocol details": "协议详情",
      "External core": "外部 Core",
      "External provider link": "外部供应商链接",
      "Provider": "供应商",
      "Provider Analysis": "供应商分析",
      "Provider ID": "供应商 ID",
      "Provider link failed": "供应商链接失败",
      "Provider links cannot include API keys. Add the key manually after verifying the endpoint.": "供应商链接不能包含 API 密钥。请核验端点后手动添加密钥。",
      "Provider middleware": "供应商中间件",
      "Provider name": "供应商名称",
      "Provider name and Base URL are required.": "供应商名称和基础 URL 不能为空。",
      "Provider name already exists.": "供应商名称已存在。",
      "Provider ready": "供应商已就绪",
      "Provider plugin": "供应商插件",
      "Provider website": "供应商网站",
      "Providers": "供应商",
      "Proxy": "代理",
      "Proxy mode": "代理模式",
      "Preset provider": "预设供应商",
      "Profile": "配置",
      "Profile name": "配置档案名称",
      "Profile name and required target settings are missing.": "请填写配置档案名称和必需的接入目标设置。",
      "Profile name, required target settings, and environment variable keys are required.": "请填写配置档案名称、必需的接入目标设置和环境变量 Key。",
      "Profile no longer exists.": "配置档案已不存在。",
      "Profile ready": "配置档案已就绪",
      "Recent Errors": "最近错误",
      "Recent Requests": "最近请求",
      "Refresh": "刷新",
      "Refresh observability": "刷新可观测",
      "Refresh request logs": "刷新请求日志",
      "Refresh network captures": "刷新网络捕获",
      "Remove": "移除",
      "Remove API key": "移除 API 密钥",
      "Remove extension": "移除扩展",
      "Remove limit": "移除限制",
      "Remove provider": "移除供应商",
      "Remove profile": "移除配置档案",
      "Remove rule": "移除规则",
      "Replace existing provider": "替换已有供应商",
      "Request": "请求",
      "Request ID": "请求 ID",
      "Request logs database": "请求日志数据库",
      "Request timeout ms": "请求超时 ms",
      "Requests": "请求",
      "Retries": "重试次数",
      "Retry": "继续重试",
      "Ready to route": "可以开始路由",
      "Restart proxy": "重启代理",
      "Route": "路由",
      "Route Observability": "路由可观测",
      "Rules": "规则",
      "Save": "保存",
      "Screen lock": "锁屏",
      "Search API keys": "搜索 API 密钥",
      "Search extensions": "搜索扩展",
      "Search models": "搜索模型",
      "Search network captures": "搜索网络捕获",
      "Search providers": "搜索供应商",
      "Search providers or models": "搜索供应商或模型",
      "Search request logs": "搜索请求日志",
      "Search routing rules": "搜索路由规则",
      "Select bot": "选择 Bot",
      "Server": "服务",
      "Startup timeout ms": "启动超时 ms",
      "State directory": "状态目录",
      "Account component": "账户组件",
      "All accounts": "所有账户",
      "Add widget": "添加组件",
      "Analysis component": "分析组件",
      "Arc": "弧形",
      "Area": "面积图",
      "Average latency": "平均延迟",
      "Bar": "柱状图",
      "Bars": "横条",
      "Breakdown component": "构成组件",
      "Cards": "卡片",
      "Change widget type": "切换组件类型",
      "Client or provider": "客户端或供应商",
      "Component properties": "组件属性",
      "Components": "组件",
      "Component category": "组件类型",
      "Compact": "紧凑",
      "Composed": "组合图",
      "Data": "数据",
      "Done": "完成",
      "Donut": "环形图",
      "Edit widgets": "编辑组件",
      "Full": "整行",
      "Header component": "标题组件",
      "Large": "大",
      "Line": "折线图",
      "Medium": "中",
      "Metric": "指标",
      "Metric component": "指标组件",
      "Nested rings": "内外圆",
      "No widget selected": "未选择组件",
      "No widgets configured": "未配置组件",
      "Overview layout": "概览布局",
      "Overview": "概览",
      "Pie": "饼图",
      "Provider component": "供应商组件",
      "Remove widget": "移除组件",
      "Preview": "预览",
      "Requests, tokens, cost": "请求、Token、成本",
      "Reset layout": "重置布局",
      "Resize widget height": "调整组件高度",
      "Resize widget size": "调整组件大小",
      "Resize widget width": "调整组件宽度",
      "Ring": "圆环",
      "Semicircle": "半圆",
      "Small": "小",
      "Stacked": "堆叠",
      "Status component": "状态组件",
      "Status timeline": "状态时间线",
      "Style": "样式",
      "Table": "表格",
      "Timeline": "时间线",
      "Token distribution": "Token 分布",
      "Token mix, rings, model share": "Token 构成、环形指标、模型占比",
      "Token mix component": "Token 构成组件",
      "Trend component": "趋势组件",
      "Usage over time": "按时间查看用量",
      "Widget": "组件",
      "Widget size": "组件大小",
      "Wide": "宽",
      "Set as default provider": "设为默认供应商",
      "Session": "会话",
      "Sessions": "会话",
      "Show all sessions": "显示所有会话",
      "Status": "状态",
      "Status codes": "状态码",
      "Stream": "流式",
      "Streaming": "流式",
      "Non-streaming": "非流式",
      "Subagent": "子代理",
      "Subagent Routing": "Subagent 路由",
      "Subagent calls": "Subagent 调用",
      "Subagents": "Subagent",
      "Success": "成功",
      "Success rate": "成功率",
      "System proxy": "系统代理",
      "System default": "系统默认",
      "Target": "目标",
      "Tenant ID": "租户 ID",
      "Target model": "目标模型",
      "Target model is required.": "目标模型不能为空。",
      "Thread": "线程",
      "Thread ID": "线程 ID",
      "Thinking": "思考",
      "Token Mix": "令牌构成",
      "Total tokens": "总令牌",
      "Today": "今天",
      "Token threshold": "令牌阈值",
      "Tokens": "令牌",
      "tokens": "令牌",
      "Tool": "工具",
      "Tool Usage": "工具使用",
      "Tool calls": "工具调用",
      "Tools": "工具",
      "Top tools": "高频工具",
      "Timeout": "超时",
      "Type": "类型",
      "UA": "UA",
      "Unset": "未设置",
      "URL": "URL",
      "URL is required.": "URL 不能为空。",
      "Usage mode": "用量模式",
      "Usage request URL": "用量请求 URL",
      "Usage request URL is required.": "用量请求 URL 不能为空。",
      "Usage request URL must use http or https.": "用量请求 URL 必须使用 http 或 https。",
      "Usage database": "用量数据库",
      "Usage Trend": "用量趋势",
      "User idle": "用户空闲",
      "Insert example": "插入示例",
      "Virtual model": "Fusion",
      "Virtual Models": "Fusion",
      "Add MCP Server": "添加 MCP 服务",
      "Add MCP server": "添加 MCP 服务",
      "Add Virtual Model": "添加 Fusion",
      "Add virtual model": "添加 Fusion",
      "Append instructions": "追加指令",
      "At least one match alias, prefix, or suffix is required.": "至少需要一个匹配别名、前缀或后缀。",
      "Allow client tools": "允许客户端工具",
      "Base model": "基础模型",
      "Base model mode": "基础模型模式",
      "Client tools": "客户端工具",
      "Client-visible": "客户端可见",
      "Command": "命令",
      "Command is required.": "命令不能为空。",
      "Decorate only": "仅装饰",
      "Decorate only mode cannot use internal tools.": "仅装饰模式不能使用内部工具。",
      "Description template": "描述模板",
      "Display name template": "显示名称模板",
      "Edit MCP Server": "编辑 MCP 服务",
      "Edit MCP server": "编辑 MCP 服务",
      "Edit Virtual Model": "编辑 Fusion",
      "Edit virtual model": "编辑 Fusion",
      "Exact aliases": "精确别名",
      "Exact aliases require a fixed model or original request model.": "精确别名需要固定模型或原始请求模型。",
      "Execution mode": "执行模式",
      "Expose in models": "暴露到模型列表",
      "Fixed base model": "固定基础模型",
      "Fixed base model is required.": "必须选择固定基础模型。",
      "Fixed model": "固定模型",
      "Injected tool names": "注入工具名",
      "Injected tools": "注入工具",
      "Input schema JSON": "输入 schema JSON",
      "Internal": "内部",
      "Invalid input schema JSON for": "输入 schema JSON 无效：",
      "Invalid tool choice JSON.": "Tool choice JSON 无效。",
      "Key is required.": "Key 不能为空。",
      "Materialize": "物化",
      "MCP servers": "MCP 服务",
      "MCP tools": "MCP 工具",
      "Match": "匹配",
      "Match type": "匹配方式",
      "Match multimodal": "匹配多模态",
      "Match web search": "匹配网页搜索",
      "Max tool calls": "最大工具调用",
      "Max tool calls must be greater than zero.": "最大工具调用必须大于 0。",
      "Max turns": "最大轮次",
      "Max turns must be greater than zero.": "最大轮次必须大于 0。",
      "Fusion combines a model with another model or tools into a new model.": "将模型和模型/工具组合起来成为一个新的模型。",
      "Fusion example": "例如：GLM 5.2 + GLM 5V Turbo = GLM 5.2V",
      "Vision tool configuration": "视觉工具配置",
      "Choose a configured gateway model for image understanding.": "选择已配置的网关模型作为图片理解模型。",
      "Vision model": "视觉模型",
      "Vision model is required.": "必须选择视觉模型。",
      "Web search configuration": "Web Search 配置",
      "Search provider": "搜索类型",
	      "Provider configuration": "类型配置",
	      "Add variable": "添加变量",
	      "Add custom MCP": "添加自定义 MCP",
	      "Add custom MCP tool": "添加自定义 MCP 工具",
	      "Custom MCP tool": "自定义 MCP 工具",
	      "Discover tools": "发现工具",
	      "MCP server": "MCP 服务",
      "Arguments": "参数",
      "Working directory": "工作目录",
      "API key env": "API Key 环境变量",
	      "Third-party tool environment": "三方工具环境变量",
	      "Environment variable keys are required when values are set.": "设置变量值时必须填写变量名。",
	      "MCP tool discovery is available in the Electron app.": "MCP 工具发现仅在 Electron App 中可用。",
	      "Image recognition": "图片识别",
      "Image recognition and Web Search": "图片识别和 Web Search",
      "Generic image understanding tool for OCR, screenshot analysis, chart reading, UI comparison, error diagnosis, and other multi-image tasks.": "通用图片理解工具，支持 OCR、截图分析、图表解读、UI 对比、错误诊断等多图任务。",
      "Generic web search tool supporting Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, and Exa.": "通用网络搜索工具，支持 Brave、Bing、Google CSE、Serper、SerpAPI、Tavily、Exa。",
      "Web Search": "网页搜索",
      "New model": "新模型",
      "New model is required.": "新模型不能为空。",
      "Base model is required.": "基础模型不能为空。",
      "Tool is required.": "必须选择工具。",
	      "No matching virtual models": "没有匹配的 Fusion",
	      "No MCP servers configured": "未配置 MCP 服务",
	      "No tools discovered": "未发现工具",
	      "No tools configured": "未配置工具",
	      "No virtual models configured": "尚未配置 Fusion",
      "Original request model": "原始请求模型",
      "Adapt image requests": "适配图像请求",
      "Adapt web search": "适配网页搜索",
      "Prefixes": "前缀",
      "Prefix": "前缀",
      "Prefix is required.": "前缀不能为空。",
      "Prepend instructions": "前置指令",
      "Protocol version": "协议版本",
      "Remove MCP server": "移除 MCP 服务",
      "Remove tool": "移除工具",
      "Remove model": "移除模型",
      "Remove virtual model": "移除 Fusion",
      "Replace instructions": "替换指令",
      "Request timeout": "请求超时",
      "Request timeout must be at least 100 ms.": "请求超时至少为 100 ms。",
	      "Search virtual models": "搜索 Fusion",
	      "Select tool": "选择工具",
	      "Startup timeout": "启动超时",
      "Startup timeout must be at least 100 ms.": "启动超时至少为 100 ms。",
      "Stdio message mode": "Stdio 消息模式",
      "Strip alias prefix": "移除别名前缀",
      "Strip alias suffix": "移除别名后缀",
      "Suffixes": "后缀",
      "Suffix": "后缀",
      "Suffix is required.": "后缀不能为空。",
	      "Tool choice": "Tool choice",
	      "Tool discovery failed": "工具发现失败",
	      "Tool loop": "工具循环",
      "Tool name": "工具名称",
      "Tool name is required.": "工具名称不能为空。",
      "Tool names must be unique.": "工具名称不能重复。",
      "Transport": "传输",
      "Unavailable": "不可用",
      "Visibility": "可见性",
      "WebSocket URL": "WebSocket URL",
      "WebSocket URL is required.": "WebSocket URL 不能为空。",
      "Env must use KEY=VALUE lines or a JSON object.": "Env 必须使用 KEY=VALUE 行或 JSON object。",
      "Env rows require keys.": "环境变量行必须填写 Key。",
      "Headers must use KEY=VALUE lines or a JSON object.": "Headers 必须使用 KEY=VALUE 行或 JSON object。",
      "Value": "值",
      "Web search": "网页搜索",
      "Browser apps JSON": "浏览器 App JSON",
      "Account": "账户",
      "Account Balance": "账户余额",
      "Account balance connectors": "账户余额连接器",
      "Add at least one account connector or disable account balance.": "请至少添加一个账户连接器，或关闭账户余额。",
      "Balance": "余额",
      "Balance field": "余额字段",
      "Balance unit": "余额单位",
      "Body": "请求体",
      "Cash balance": "现金余额",
      "Charge balance": "充值余额",
      "Connectors JSON": "连接器 JSON",
      "Copy provider plugin link": "复制供应商插件链接",
      "Credit balance": "信用余额",
      "CCR will fetch this HTTPS manifest with strict safety checks before showing provider details.": "CCR 会在严格安全检查后拉取这个 HTTPS manifest，再展示供应商详情。",
      "Current balance": "当前余额",
      "Each plugin app requires name and url.": "每个插件 App 都需要 name 和 url。",
      "Wrapper": "包装服务",
      "Wrapper runtime": "包装运行时",
      "Wrapper plugin": "包装插件",
      "5h quota": "5 小时额度",
      "Granted balance": "赠送余额",
      "Monthly budget": "月度预算",
      "Topped-up balance": "充值余额",
      "Total credits": "总额度",
      "Total usage": "总用量",
      "Voucher balance": "代金券余额",
      "Weekly quota": "周额度",
      "All": "全部",
      "API endpoint": "API 地址",
      "Available": "可用",
      "CA certificate": "CA 证书",
      "Capability": "能力",
      "Checking CA certificate...": "正在检查 CA 证书...",
      "Check Trust": "检查信任",
      "Choose folder": "选择目录",
      "Clear": "清除",
      "Clear network captures": "清除网络捕获",
      "Collapse": "收起",
      "Collapse models": "收起模型",
      "Copied": "已复制",
      "Copied API key": "已复制 API 密钥",
      "Copy API key": "复制 API 密钥",
      "Custom models": "自定义模型",
      "Press Enter to add": "按下回车进行添加",
      "Detected automatically": "已自动检测",
      "Detected compatibility": "检测到的兼容方式",
      "Detected endpoint": "检测到的地址",
      "Detecting icon": "正在检测图标",
      "Detecting provider": "正在检测供应商",
      "Disabled": "已禁用",
      "Expand": "展开",
      "Expand models": "展开模型",
      "Expires": "过期",
      "Filter": "筛选",
      "Filter agent": "筛选 Agent",
      "Filter request log model": "筛选请求日志模型",
      "Filter request log provider": "筛选请求日志供应商",
      "Filter request log status": "筛选请求日志状态",
      "Invalid": "无效",
      "Manual install": "手动安装",
      "Manual install command": "手动安装命令",
      "Manifest URL": "Manifest URL",
      "Marketplace": "市场",
      "Model name": "模型名称",
      "Models are required. Ask the provider to include models=... in the link.": "需要模型列表。请让供应商在链接中加入 models=...。",
      "Models will be detected automatically.": "模型会自动探测。",
      "More": "更多",
      "Provider models": "供应商模型",
      "Runtime provider": "运行时供应商",
      "Read only": "只读",
      "Search all models": "搜索全部模型",
      "Source": "来源",
      "Virtual": "Fusion",
      "Virtual models": "Fusion",
      "No models available": "暂无可用模型",
      "Direct": "直连",
      "Drag cards to arrange": "拖动卡片排序",
      "Drag to move": "拖动排序",
      "Move": "移动",
      "Move down": "下移",
      "Move up": "上移",
      "Network capture is paused": "网络捕获已暂停",
      "No API keys configured": "未配置 API 密钥",
      "No body": "无正文",
      "No extensions installed": "未安装扩展",
      "No limits configured": "未配置限制",
      "No matching API keys": "没有匹配的 API 密钥",
      "No matching captures": "没有匹配的捕获",
      "No matching extensions": "没有匹配的扩展",
      "No matching models": "没有匹配的模型",
      "No matching providers": "没有匹配的供应商",
      "No matching routing rules": "没有匹配的路由规则",
      "No account balance connectors configured": "未配置账户余额连接器",
      "No protocol detection yet": "尚未检测协议",
      "No response fields": "没有响应字段",
      "OpenAI Chat": "OpenAI Chat",
      "OpenAI Responses": "OpenAI Responses",
      "Anthropic Messages": "Anthropic Messages",
      "Gemini Generate": "Gemini 生成",
      "Model required before protocol verification.": "需要先填写模型，才能验证协议。",
      "No endpoint candidates available.": "没有可用的端点候选。",
      "Request failed.": "请求失败。",
      "Raw connector JSON": "原始连接器 JSON",
      "Remote provider manifest": "远程供应商 Manifest",
      "Refresh interval ms": "刷新间隔（毫秒）",
      "Response fields": "响应字段",
      "Reset": "重置时间",
      "Select at least one usage response field.": "请至少选择一个用量响应字段。",
      "Showing first response fields only.": "仅显示前面的响应字段。",
      "Standard usage endpoint": "标准用量端点",
      "Standard usage endpoint will try provider-hosted CCR account endpoints.": "标准用量端点会尝试供应商托管的 CCR 账户端点。",
      "Sub limit": "订阅上限",
      "Sub rem": "订阅剩余",
      "Subscription limit field": "订阅上限字段",
      "Subscription remaining field": "订阅剩余字段",
      "Subscription reset field": "订阅重置字段",
      "Subscription unit": "订阅单位",
      "Supports standard, http-json, plugin, and local-estimate connectors.": "支持 standard、http-json、plugin 和 local-estimate 连接器。",
      "Switch to HTTP JSON request to configure method, URL, headers, body, and response fields.": "切换到 HTTP JSON 请求即可配置 method、URL、header、body 和响应字段。",
      "Test usage request": "测试用量请求",
      "No marketplace extensions": "市场暂无扩展",
      "No fallback models configured": "未配置回退模型",
      "No models configured": "未配置模型",
      "Other / custom API endpoint": "其他 / 自定义 API 地址",
      "Pending": "等待中",
      "Select preset provider": "选择预设供应商",
      "Zhipu AI (China)": "智谱 AI (国内)",
      "Zhipu AI (China) - Coding Plan": "智谱 AI (国内) - Coding Plan",
      "Zhipu AI (China) - General Endpoint": "智谱 AI (国内) - 通用端点",
      "Z.ai (Global)": "Z.ai (国外)",
      "Z.ai (Global) - Coding Plan": "Z.ai (国外) - Coding Plan",
      "Z.ai (Global) - General Endpoint": "Z.ai (国外) - 通用端点",
      "After you enter the API endpoint and key, the system will automatically detect supported protocols and available models.": "填写 API 地址和密钥后，系统会自动探测支持的协议和可用模型。",
      "Enter a model manually if automatic detection does not return a model list.": "如果自动检测没有返回模型列表，可以手动输入模型名称。",
      "No network captures": "暂无网络捕获",
      "No plugin routes configured": "未配置插件路由",
      "No profiles for this agent": "当前 Agent 未配置档案",
      "No profiles configured": "尚未配置档案",
      "No providers configured": "未配置供应商",
      "No query parameters": "无查询参数",
      "No request headers": "无请求头",
      "Next step": "下一步",
      "No response headers": "无响应头",
      "No recent agent requests": "暂无最近 Agent 请求",
      "No session activity": "暂无会话活动",
      "No subagent calls": "暂无 Subagent 调用",
      "No tool calls": "暂无工具调用",
      "No routing rules configured": "未配置路由规则",
      "No updates available": "当前已是最新版本",
      "Not installed": "未安装",
      "Not set": "未设置",
      "Pause capture": "暂停捕获",
      "Pause network capture": "暂停网络捕获",
      "Pause service": "暂停服务",
      "Previous page": "上一页",
      "Previous step": "上一步",
      "Proxy not running": "代理未运行",
      "Proxy status": "代理状态",
      "Proxy CA certificate is trusted.": "Proxy CA 证书已信任。",
      "Proxy CA certificate is not trusted.": "Proxy CA 证书未被信任。",
      "Proxy CA certificate is not trusted:": "Proxy CA 证书未被信任：",
      "Proxy CA certificate is not installed. Install the CA certificate before enabling proxy mode.": "Proxy CA 证书尚未安装。启用代理模式前请先安装 CA 证书。",
      "Proxy CA certificate and private key do not match. Recreate the proxy CA certificate, trust the new CA, then restart proxy mode.": "Proxy CA 证书和私钥不匹配。请重新创建 Proxy CA 证书，信任新的 CA，然后重启代理模式。",
      "Proxy CA certificate is installed in the macOS System keychain.": "Proxy CA 证书已安装到 macOS 系统钥匙串。",
      "Proxy CA certificate is installed only in the login keychain. Install it into the macOS System keychain so Chrome can trust HTTPS proxy certificates.": "Proxy CA 证书只安装在登录钥匙串中。请安装到 macOS 系统钥匙串，Chrome 才能信任 HTTPS 代理证书。",
      "Proxy CA certificate is not installed in the macOS System keychain. Install and trust this exact CA certificate before enabling HTTPS proxying.": "Proxy CA 证书尚未安装到 macOS 系统钥匙串。启用 HTTPS 代理前，请安装并信任这份 CA 证书。",
      "Proxy CA certificate could not be read. Reinstall the CA certificate.": "无法读取 Proxy CA 证书。请重新安装 CA 证书。",
      "Proxy CA certificate is trusted by the system trust store.": "Proxy CA 证书已被系统信任存储信任。",
      "Certificate detection is available in the Electron app.": "证书检测仅在 Electron App 中可用。",
      "Certificate install is available in the Electron app.": "证书安装仅在 Electron App 中可用。",
      "Proxy certificate detection is available in the Electron app.": "代理证书检测仅在 Electron App 中可用。",
      "Install and trust the proxy CA certificate before enabling proxy mode.": "启用代理模式前，请先安装并信任 Proxy CA 证书。",
      "Certificate installed and trusted. Proxy mode enabled.": "证书已安装并信任，代理模式已启用。",
      "Certificate installed into the macOS System keychain.": "证书已安装到 macOS 系统钥匙串。",
      "Certificate installed into the current user's Root store.": "证书已安装到当前用户的根证书存储。",
      "Automatic certificate install is not supported on this platform. Import the CA file into the system trust store manually.": "当前平台不支持自动安装证书。请手动将 CA 文件导入系统信任存储。",
      "Certificate installation was cancelled. Install the CA into the macOS System keychain to use HTTPS proxying.": "证书安装已取消。要使用 HTTPS 代理，请将 CA 安装到 macOS 系统钥匙串。",
      "macOS did not allow CCR to request administrator authorization:": "macOS 未允许 CCR 请求管理员授权：",
      "Opened Terminal installer:": "已打开终端安装器：",
      "Could not open Terminal installer:": "无法打开终端安装器：",
      "Click Install CA and approve the administrator prompt to install it into the System keychain.": "点击“安装 CA”，并在管理员提示中批准安装到系统钥匙串。",
      "If trust is still not detected, open Keychain Access > System and find the CCR MITM Proxy certificate.": "如果仍未检测到信任，请打开“钥匙串访问”>“系统”，找到 CCR MITM Proxy 证书。",
      "Open Trust, set When using this certificate to Always Trust, then restart the browser or client.": "展开“信任”，将“使用此证书时”设为“始终信任”，然后重启浏览器或客户端。",
      "Return here and click Check Trust.": "返回这里并点击“检查信任”。",
      "Click Install CA, or open the CA file and import it manually.": "点击“安装 CA”，或打开 CA 文件并手动导入。",
      "Place it under Current User > Trusted Root Certification Authorities > Certificates.": "将它放到“当前用户”>“受信任的根证书颁发机构”>“证书”下。",
      "Restart the browser or client.": "重启浏览器或客户端。",
      "Open the CA file and import it into your OS or browser trust store.": "打开 CA 文件，并将它导入操作系统或浏览器的信任存储。",
      "For Firefox, Java, Python, Node, or other clients with a private CA store, import the CA there as well.": "对于 Firefox、Java、Python、Node 或其他使用独立 CA 存储的客户端，也需要在那里导入这份 CA。",
      "Resume capture": "继续捕获",
      "Resume network capture": "继续网络捕获",
      "Resize list/detail": "调整列表/详情",
      "Resize request and response panels": "调整请求和响应面板",
      "Resize request list and detail panels": "调整请求列表和详情面板",
      "Resize request/response": "调整请求/响应",
      "Response": "响应",
      "Restart Proxy": "重启代理",
      "Select provider": "选择供应商",
      "Selected": "已选择",
      "Service": "服务",
      "Service status": "服务状态",
      "Step": "步骤",
      "Start service": "启动服务",
      "Start using CCR.": "开始使用 CCR。",
      "API Service": "API 服务 (API Service)",
      "Availability": "可用性",
      "Current": "当前",
      "Current version": "当前版本",
      "Current model": "当前模型",
      "Degraded": "降级",
      "Gateway": "网关",
      "Healthy": "正常",
      "Idle": "未启用",
      "Network capture": "网络捕获",
      "Proxy Service": "代理服务",
      "System status": "系统状态",
      "System Proxy": "系统代理",
      "Available version": "可用版本",
      "Download update": "下载更新",
      "Downloading update": "正在下载更新",
      "Feed URL": "更新源",
      "Online updates": "在线更新",
      "Release notes": "更新说明",
      "Update available": "发现新版本",
      "Update downloaded": "更新已下载",
      "Update failed": "更新失败",
      "Update ready to install": "更新已准备安装",
      "Updates are only available in packaged builds.": "在线更新仅在打包后的应用中可用。",
      "This action is applied immediately to the draft config and will auto-save with other changes.": "此操作会立即应用到草稿配置，并随其他变更自动保存。",
      "This provider link came from an external website. Review details before importing.": "这个供应商链接来自外部网站。导入前请确认下面的内容。",
      "Welcome to CCR": "欢迎使用CCR",
      "Trusted": "已信任",
      "Small fast model": "小模型",
      "Unknown": "未知",
      "Unlimited": "无限制",
      "Unnamed": "未命名",
      "Unnamed provider": "未命名供应商",
      "Unnamed rule": "未命名规则",
      "Untrusted": "未信任",
      "body": "正文",
      "active": "已启用",
      "capturing": "捕获中",
      "decoded": "已解码",
      "disabled": "已禁用",
      "enabled": "已启用",
      "header": "标头",
      "inactive": "未启用",
      "models": "模型",
      "meters": "指标",
      "not running": "未运行",
      "ok": "正常",
      "paused": "已暂停",
      "provider": "供应商",
      "query": "查询",
      "raw": "原始",
      "req": "请求",
      "rule": "规则",
      "starting": "启动中",
      "stopped": "已停止",
      "summary": "摘要",
      "truncated": "已截断",
      "unsupported": "不支持",
      "restored": "已恢复",
      "up": "上",
      "down": "下",
      "per day": "每天",
      "per hour": "每小时",
      "per minute": "每分钟",
      "running": "运行中"
    }
  }
};

export const AppI18nContext = createContext<AppCopy>(appCopy.en);

export function useAppText() {
  const copy = useContext(AppI18nContext);
  return (value: string) => translateText(copy, value);
}

export function translateText(copy: AppCopy, value: string): string {
  return copy.text[value] ?? value;
}

export function translateOptions<T extends { label: string; value: string }>(options: T[], t: (value: string) => string): T[] {
  return options.map((option) => ({ ...option, label: t(option.label) }));
}

export const providerProtocolOptions: Array<{ label: string; value: GatewayProviderProtocol }> = [
  { label: "OpenAI Chat", value: "openai_chat_completions" },
  { label: "OpenAI Responses", value: "openai_responses" },
  { label: "Anthropic Messages", value: "anthropic_messages" },
  { label: "Gemini Generate", value: "gemini_generate_content" }
];

export const providerAccountModeOptions: Array<{ label: string; value: ProviderAccountDraftMode }> = [
  { label: "Standard usage endpoint", value: "standard" },
  { label: "HTTP JSON request", value: "http-json" },
  { label: "Raw connector JSON", value: "raw" }
];

export const providerUsageMethodOptions: Array<{ label: string; value: "GET" | "POST" }> = [
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" }
];

export const apiKeyExpirationOptions: Array<{ label: string; value: ApiKeyExpirationPreset }> = [
  { label: "Never", value: "never" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "Custom", value: "custom" }
];

export const limitWindowOptions: Array<{ label: string; value: LimitWindowPreset }> = [
  { label: "per minute", value: "minute" },
  { label: "per hour", value: "hour" },
  { label: "per day", value: "day" }
];

export const apiKeyLimitMetricOptions: Array<{ label: string; value: ApiKeyLimitMetric }> = [
  { label: "Requests", value: "requests" },
  { label: "Tokens", value: "tokens" },
  { label: "Images", value: "images" }
];

export const routerRuleTypeOptions: Array<{ label: string; value: RouterRuleType }> = [
  { label: "Long context", value: "long-context" },
  { label: "Model prefix", value: "model-prefix" },
  { label: "Thinking", value: "thinking" },
  { label: "Web search", value: "web-search" },
  { label: "Image content", value: "image" },
  { label: "Subagent", value: "subagent" },
  { label: "Always", value: "always" }
];

export const routerFallbackModeOptions: Array<{ label: string; value: RouterFallbackMode }> = [
  { label: "Off", value: "off" },
  { label: "Retry", value: "retry" },
  { label: "Fallback chain", value: "model-chain" }
];

export const removedLegacyRouterRuleIds = new Set([
  "legacy-subagent",
  "legacy-background",
  "legacy-thinking",
  "legacy-web-search",
  "legacy-image"
]);

export const claudeDesignRouteRuleTypeOptions: Array<{ label: string; value: ClaudeDesignRouteRuleType }> = [
  { label: "Exact model", value: "model" },
  { label: "Model prefix", value: "model-prefix" },
  { label: "Long context", value: "long-context" },
  { label: "Thinking", value: "thinking" },
  { label: "Web search", value: "web-search" },
  { label: "Image content", value: "image" },
  { label: "Always", value: "always" }
];

export const virtualModelMatchModeOptions: Array<{ label: string; value: VirtualModelMatchMode }> = [
  { label: "Alias", value: "alias" },
  { label: "Prefix", value: "prefix" },
  { label: "Suffix", value: "suffix" }
];

export const virtualModelBaseModeOptions: Array<{ label: string; value: VirtualModelBaseModelMode }> = [
  { label: "Fixed model", value: "fixed" },
  { label: "Original request model", value: "request" },
  { label: "Strip alias prefix", value: "strip_prefix" },
  { label: "Strip alias suffix", value: "strip_suffix" }
];

export const virtualModelExecutionModeOptions: Array<{ label: string; value: VirtualModelExecutionMode }> = [
  { label: "Tool loop", value: "tool_loop" },
  { label: "Decorate only", value: "decorate_only" }
];

export const virtualModelToolVisibilityOptions: Array<{ label: string; value: VirtualModelToolVisibility }> = [
  { label: "Internal", value: "internal" },
  { label: "Client-visible", value: "client" }
];

export const fusionToolOptions: Array<{ description: string; label: string; value: string }> = [
  {
    description: "Generic image understanding tool for OCR, screenshot analysis, chart reading, UI comparison, error diagnosis, and other multi-image tasks.",
    label: `${BUILTIN_FUSION_TOOL_SERVER_NAME} / ${BUILTIN_FUSION_VISION_TOOL_NAME}`,
    value: BUILTIN_FUSION_VISION_TOOL_NAME
  },
  {
    description: "Generic web search tool supporting Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, and Exa.",
    label: `${BUILTIN_FUSION_TOOL_SERVER_NAME} / ${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`,
    value: BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME
  }
];

const legacyUnimcpPackageName = "@musistudio/unimcp";
const legacyUnimcpServerName = "unimcp";
export const customFusionToolName = "custom_mcp_tool";
export const defaultFusionWebSearchProvider: VirtualModelFusionWebSearchProvider = "brave";

export const fusionWebSearchProviderOptions: Array<{ label: string; value: VirtualModelFusionWebSearchProvider }> = [
  { label: "Brave", value: "brave" },
  { label: "Bing", value: "bing" },
  { label: "Google CSE", value: "google_cse" },
  { label: "Serper", value: "serper" },
  { label: "SerpAPI", value: "serpapi" },
  { label: "Tavily", value: "tavily" },
  { label: "Exa", value: "exa" }
];

export const fusionWebSearchEnvKeysByProvider: Record<VirtualModelFusionWebSearchProvider, string[]> = {
  bing: ["BING_SEARCH_API_KEY", "BING_SEARCH_ENDPOINT"],
  brave: ["BRAVE_SEARCH_API_KEY", "BRAVE_SEARCH_ENDPOINT"],
  exa: ["EXA_API_KEY", "EXA_SEARCH_ENDPOINT"],
  google_cse: ["GOOGLE_SEARCH_API_KEY", "GOOGLE_SEARCH_CX", "GOOGLE_SEARCH_ENDPOINT"],
  serper: ["SERPER_API_KEY", "SERPER_SEARCH_ENDPOINT"],
  serpapi: ["SERPAPI_API_KEY", "SERPAPI_SEARCH_ENDPOINT"],
  tavily: ["TAVILY_API_KEY", "TAVILY_SEARCH_ENDPOINT"]
};

export const virtualModelClientToolsPolicyOptions: Array<{ label: string; value: VirtualModelClientToolsPolicy }> = [
  { label: "Allow client tools", value: "allow" },
  { label: "Deny client tools", value: "deny" }
];

export const mcpServerTransportOptions: Array<{ label: string; value: GatewayMcpServerTransport }> = [
  { label: "stdio", value: "stdio" },
  { label: "streamable-http", value: "streamable-http" },
  { label: "sse", value: "sse" }
];

export const mcpStdioMessageModeOptions: Array<{ label: string; value: GatewayMcpStdioMessageMode }> = [
  { label: "content-length", value: "content-length" },
  { label: "newline-json", value: "newline-json" }
];

export const providerPresetIconUrls: Record<string, string> = {
  anthropic: anthropicProviderIconUrl,
  bailian: bailianProviderIconUrl,
  deepseek: deepseekProviderIconUrl,
  gemini: geminiProviderIconUrl,
  mistral: mistralProviderIconUrl,
  moonshot: moonshotProviderIconUrl,
  openai: openaiProviderIconUrl,
  openrouter: openrouterProviderIconUrl,
  siliconflow: siliconflowProviderIconUrl,
  "zai-global-coding": zaiGlobalCodingProviderIconUrl,
  "zai-global-general": zaiGlobalGeneralProviderIconUrl,
  "zhipu-cn-coding": zhipuCnCodingProviderIconUrl,
  "zhipu-cn-general": zhipuCnGeneralProviderIconUrl
};

export const trayMascotIconUrls: Record<"cyan" | "orange" | "violet", string> = {
  cyan: trayCyanIconUrl,
  orange: trayOrangeIconUrl,
  violet: trayVioletIconUrl
};

export const mcpServerStartupTimeoutMs = 600000;

export const navigation: Array<{ icon: LucideIcon; id: NavigationId }> = [
  { icon: Gauge, id: "overview" },
  { icon: Layers3, id: "providers" },
  { icon: UserRound, id: "profile" },
  { icon: Route, id: "routing" },
  { icon: Box, id: "models" },
  { icon: Boxes, id: "virtual-models" },
  { icon: KeyRound, id: "api-keys" },
  { icon: Activity, id: "observability" },
  { icon: Database, id: "logs" },
  { icon: Server, id: "server" },
  { icon: Network, id: "networking" },
  { icon: Braces, id: "extensions" }
];

export const onboardingStepOrder: OnboardingStepId[] = ["provider", "profile", "enter"];

export function isOnboardingProviderReady(config: AppConfig): boolean {
  return config.Providers.length > 0;
}

export function isOnboardingProfileReady(config: AppConfig): boolean {
  return config.profile.profiles.some((profile) => profile.enabled);
}

export function getDefaultOnboardingStep(config: AppConfig): OnboardingStepId {
  if (!isOnboardingProviderReady(config)) {
    return "provider";
  }
  if (!isOnboardingProfileReady(config)) {
    return "profile";
  }
  return "enter";
}

export function getNextOnboardingStep(activeStep: OnboardingStepId, config: AppConfig): OnboardingStepId | undefined {
  const activeIndex = onboardingStepOrder.indexOf(activeStep);
  for (const step of onboardingStepOrder.slice(activeIndex + 1)) {
    if (step === "enter" || step === getDefaultOnboardingStep(config)) {
      return step;
    }
  }
  return undefined;
}

export const motionEase = [0.22, 1, 0.36, 1] as const;
export const reducedMotionTransition = { duration: 0.12, ease: "easeOut" } as const;
export const pageSpringTransition = { damping: 34, mass: 0.78, stiffness: 420, type: "spring" } as const;
export const listSpringTransition = { damping: 32, mass: 0.62, stiffness: 500, type: "spring" } as const;
export const disclosureSpringTransition = { damping: 36, mass: 0.7, stiffness: 480, type: "spring" } as const;
export type MotionSafeDivAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onAnimationStart" | "onDrag" | "onDragCapture" | "onDragEnd" | "onDragEndCapture" | "onDragStart" | "onDragStartCapture"
>;

export function ViewMotionShell({ children, view }: { children: ReactNode; view: ViewId }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="h-full min-h-0"
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.995, y: -6 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.995, y: 10 }}
      transition={shouldReduceMotion ? reducedMotionTransition : pageSpringTransition}
      data-view={view}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedListItem({ children, className, ...props }: MotionSafeDivAttributes) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      layout="position"
      transition={shouldReduceMotion ? reducedMotionTransition : listSpringTransition}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedDisclosure({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={shouldReduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
      className={cn("overflow-hidden", className)}
      exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={shouldReduceMotion ? reducedMotionTransition : disclosureSpringTransition}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedFieldSlot({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      layout
      transition={shouldReduceMotion ? reducedMotionTransition : disclosureSpringTransition}
    >
      {children}
    </motion.div>
  );
}

export const fallbackInfo: AppInfo = {
  apiKeysDbFile: "Browser preview",
  configDir: "Browser preview",
  configFile: "Browser preview",
  dataDir: "Browser preview",
  gatewayConfigFile: "Browser preview",
  name: "Claude Code Router",
  platform: navigator.platform,
  requestLogsDbFile: "Browser preview",
  usageDbFile: "Browser preview",
  version: "0.1.0"
};

export const fallbackUpdateStatus: AppUpdateStatus = {
  canCheck: false,
  canDownload: false,
  canInstall: false,
  currentVersion: fallbackInfo.version,
  state: "idle",
  supported: false
};

export const fallbackConfig: AppConfig = {
  APIKEY: "",
  APIKEYS: [],
  API_TIMEOUT_MS: 600000,
  CUSTOM_ROUTER_PATH: "",
  HOST: "127.0.0.1",
  PORT: 3456,
  Providers: [],
  Router: {
    fallback: {
      mode: "off",
      models: [],
      retryCount: 1
    },
    longContextThreshold: 200000,
    rules: []
  },
  agent: {
    mcpServers: []
  },
  autoStart: false,
  botConfigs: [],
  botGateway: {
    acknowledgeEvents: false,
    args: [],
    authType: "",
    autoStartIntegration: true,
    command: "",
    createIntegration: false,
    credentials: {},
    cwd: "",
    enabled: false,
    forwardAllAgentMessages: true,
    handoff: {
      enabled: false,
      idleSeconds: 30,
      phoneBluetoothTargets: [],
      phoneWifiTargets: [],
      screenLock: true,
      userIdle: true
    },
    integrationConfig: {},
    integrationId: "",
    platform: "none",
    pollIntervalMs: 2000,
    requestTimeoutMs: 600000,
    sourceDir: "/Users/jinhuilee/products/bot-gateway",
    startupTimeoutMs: 10000,
    stateDir: "",
    tenantId: "ccr"
  },
  gateway: {
    coreHost: "127.0.0.1",
    corePort: 3457,
    enabled: true,
    generatedConfigFile: "Browser preview",
    host: "127.0.0.1",
    port: 3456
  },
  preferredProvider: "",
  plugins: [],
  profile: {
    claudeCode: {
      enabled: true,
      model: "",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: ""
    },
    codex: {
      cliMiddleware: true,
      codexCliPath: "",
      codexHome: "",
      configFormat: "separate_profile_files",
      configFile: "~/.codex/config.toml",
      enabled: true,
      model: "",
      providerId: "claude-code-router",
      providerName: "Claude Code Router",
      showAllSessions: false
    },
    enabled: true,
    profiles: [
      {
        agent: "claude-code",
        enabled: true,
        env: {},
        id: "default-claude-code",
        model: "",
        name: "Claude Code",
        scope: "global",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      },
      {
        agent: "codex",
        cliMiddleware: true,
        codexCliPath: "",
        codexHome: "",
        configFormat: "separate_profile_files",
        configFile: "~/.codex/config.toml",
        enabled: true,
        env: {},
        id: "default-codex",
        model: "",
        name: "Codex",
        providerId: "claude-code-router",
        providerName: "Claude Code Router",
        showAllSessions: false,
        scope: "global",
        surface: "auto"
      }
    ]
  },
  proxy: {
    browserMode: true,
    captureNetwork: false,
    enabled: false,
    host: "127.0.0.1",
    mode: "gateway",
    port: 7890,
    systemProxy: false,
    targets: [
      { host: "api.anthropic.com", paths: ["/v1/messages", "/v1/messages/count_tokens"] },
      { host: "api.openai.com", paths: ["/v1/chat/completions", "/v1/responses", "/v1/models"] },
      { host: "generativelanguage.googleapis.com", paths: ["/v1beta/models", "/v1/models"] },
      { host: "openrouter.ai", paths: ["/api/v1/chat/completions", "/api/v1/responses", "/api/v1/models"] },
      { host: "api.deepseek.com", paths: ["/chat/completions", "/v1/chat/completions"] },
      { host: "api.mistral.ai", paths: ["/v1/chat/completions", "/v1/models"] }
    ]
  },
  providerPlugins: [],
  overviewWidgets: DEFAULT_OVERVIEW_WIDGETS,
  routerEndpoint: "http://127.0.0.1:3456",
  theme: "system",
  trayComponentVariants: DEFAULT_TRAY_COMPONENT_VARIANTS,
  trayIcon: "random",
  trayProgressTargetTokens: 100000,
  trayWidgets: DEFAULT_TRAY_WIDGETS,
  trayWindowModules: DEFAULT_TRAY_WINDOW_MODULES,
  virtualModelProfiles: []
};

export const fallbackGatewayStatus: GatewayStatus = {
  coreEndpoint: "http://127.0.0.1:3457",
  endpoint: "http://127.0.0.1:3456",
  generatedConfigFile: "Browser preview",
  state: "stopped"
};

export const fallbackProxyStatus: ProxyStatus = {
  caCertFile: "Browser preview",
  endpoint: "http://127.0.0.1:3456",
  mode: "gateway",
  port: 3456,
  state: "stopped",
  systemProxy: {
    state: "unsupported"
  },
  targetHosts: []
};

export const fallbackProxyCertificateStatus: ProxyCertificateStatus = {
  caCertFile: "Browser preview",
  canInstall: false,
  message: "Certificate detection is available in the Electron app.",
  platform: navigator.platform,
  state: "unknown",
  trusted: false
};

export const fallbackProxyNetworkSnapshot: ProxyNetworkSnapshot = {
  capturedAt: new Date().toISOString(),
  captureEnabled: false,
  items: [],
  maxBodyBytes: 256 * 1024,
  maxEntries: 200
};

export const usageRangeOptions: Array<{ label: string; value: UsageStatsRange }> = [
  { label: "Today", value: "today" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" }
];

export const overviewWidgetSizeOptions: Array<{ label: string; value: OverviewWidgetSize }> = [
  ...OVERVIEW_WIDGET_SIZE_VALUES.map((size) => ({ label: size, value: size }))
];

export const overviewMetricOptions: Array<{ label: string; value: OverviewMetricKind }> = [
  { label: "Requests", value: "requests" },
  { label: "Total tokens", value: "total-tokens" },
  { label: "Input tokens", value: "input-tokens" },
  { label: "Output tokens", value: "output-tokens" },
  { label: "Cache tokens", value: "cache-tokens" },
  { label: "Cache ratio", value: "cache-ratio" },
  { label: "Estimated cost", value: "estimated-cost" },
  { label: "Success rate", value: "success-rate" },
  { label: "Errors", value: "errors" },
  { label: "Average latency", value: "avg-latency" }
];

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

export const agentAnalysisRangeOptions: Array<{ label: string; value: UsageStatsRange }> = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" }
];

export const providerAutoProbeDelayMs = 800;
export const fallbackAgentAnalysis = createEmptyAgentAnalysis("7d");
export const fallbackUsageStats = createEmptyUsageStats("7d");
export const fallbackRequestLogPage = createEmptyRequestLogPage();

export type AgentFilterValue = AgentKind | "all";

export const agentFilterOptions: Array<{ label: string; value: AgentFilterValue }> = [
  { label: "All agents", value: "all" },
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "Claude Design", value: "claude-design" },
  { label: "Unknown", value: "unknown" }
];

export const profileAgentOptions: Array<{ label: string; value: ProfileConfig["agent"] }> = [
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" }
];

export const profileScopeOptions: Array<{ label: string; value: ProfileScope }> = [
  { label: "Only opened from CCR", value: "ccr" },
  { label: "System default", value: "global" }
];

export const profileSurfaceOptions: Array<{ label: string; value: ProfileSurface }> = [
  { label: "Auto", value: "auto" },
  { label: "CLI only", value: "cli" },
  { label: "App only", value: "app" }
];

export const requestLogStatusOptions: Array<{ label: string; value: RequestLogStatusFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "成功", value: "success" },
  { label: "错误", value: "error" }
];

export const requestLogPageSizeOptions = [
  { label: "10 / 页", value: "10" },
  { label: "25 / 页", value: "25" },
  { label: "50 / 页", value: "50" },
  { label: "100 / 页", value: "100" }
];

export type AddProviderDraft = {
  accountConnectorsText: string;
  accountEnabled: boolean;
  accountMode: ProviderAccountDraftMode;
  accountRefreshIntervalMs: string;
  apiKey: string;
  baseUrl: string;
  icon: string;
  modelSearch: string;
  modelsText: string;
  name: string;
  presetId: string;
  protocol: GatewayProviderProtocol;
  selectedModels: string[];
  usageBalanceRemainingPath: string;
  usageBalanceUnit: string;
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

export type ProviderAccountDraftMode = "standard" | "http-json" | "raw";
export type ProviderUsageFieldTarget =
  | "balance"
  | "message"
  | "status"
  | "subscriptionLimit"
  | "subscriptionRemaining"
  | "subscriptionReset";

export type ProviderProbeCandidate = ProviderPresetEndpoint & {
  source: "custom" | "preset";
};

export type ProviderProbeCandidateResult = {
  candidate: ProviderProbeCandidate;
  probe: GatewayProviderProbeResult;
};

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
  enabled: boolean;
  fallback: RouterFallbackConfig;
  name: string;
  pattern: string;
  target: string;
  threshold: string;
  type: RouterRuleType;
};

export type ClaudeDesignRouteRuleType = "always" | "image" | "long-context" | "model" | "model-prefix" | "thinking" | "web-search";

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
  index: number;
  source: ExtensionSource;
};

export type ExtensionListItem = {
  canConfigure: boolean;
  canToggle: boolean;
  capability: string;
  enabled: boolean;
  index: number;
  name: string;
  source: ExtensionSource;
  status: "enabled" | "disabled" | "unsupported";
  target: string;
};

export type ModelCatalogItem = {
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

export function Field({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <Label className={cn("block min-w-0 space-y-1", className)}>
      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

export function AgentLogo({ agent, className }: { agent: ProfileConfig["agent"]; className?: string }) {
  const label = profileAgentLabel(agent);

  return (
    <span
      className={cn("flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[5px]", className)}
      title={label}
    >
      <img alt={`${label} icon`} className="h-full w-full rounded-[inherit] object-cover" src={profileAgentLogoUrl(agent)} />
    </span>
  );
}

export function SelectControl({
  className,
  onChange,
  options,
  value
}: {
  className?: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return <Select className={className} onValueChange={onChange} options={options} value={value} />;
}

export function RouteTargetControl({
  modelOptions,
  onChange,
  value
}: {
  modelOptions: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  value: string;
}) {
  const t = useAppText();

  if (modelOptions.length === 0) {
    return <Input onChange={(event) => onChange(event.target.value)} value={value} />;
  }

  const options = routeTargetOptions(modelOptions, value);
  return <SelectControl onChange={onChange} options={translateOptions(options, t)} value={value} />;
}

export function TextAreaControl({
  className,
  minHeight,
  onChange,
  value
}: {
  className?: string;
  minHeight: number;
  onChange: (value: string) => void;
  value: string;
}) {
  const responsiveMinHeight = `min(${minHeight}px, max(132px, calc(100dvh - 220px)))`;

  return (
    <Textarea
      className={cn(
        "min-h-0",
        className
      )}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      style={{ minHeight: responsiveMinHeight }}
      value={value}
    />
  );
}

export function KeyValueRowsControl({
  addLabel,
  onChange,
  rows
}: {
  addLabel: string;
  onChange: (rows: KeyValueDraftRow[]) => void;
  rows: KeyValueDraftRow[];
}) {
  const t = useAppText();
  const visibleRows = rows.length > 0 ? rows : [createKeyValueDraftRow()];

  function updateRow(index: number, patch: Partial<KeyValueDraftRow>) {
    const nextRows = [...visibleRows];
    nextRows[index] = { ...nextRows[index], ...patch };
    onChange(nextRows);
  }

  function addRow() {
    onChange([...visibleRows, createKeyValueDraftRow()]);
  }

  function removeRow(index: number) {
    onChange(visibleRows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="space-y-2">
      {visibleRows.map((row, index) => (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_28px_28px] gap-2" key={row.id}>
          <Input
            aria-label={t("Key")}
            onChange={(event) => updateRow(index, { key: event.target.value })}
            placeholder={t("Key")}
            value={row.key}
          />
          <Input
            aria-label={t("Value")}
            onChange={(event) => updateRow(index, { value: event.target.value })}
            placeholder={t("Value")}
            value={row.value}
          />
          <Button
            aria-label={addLabel}
            onClick={addRow}
            size="iconSm"
            title={addLabel}
            type="button"
            variant="outline"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label={t("Remove")}
            disabled={visibleRows.length === 1 && !row.key.trim() && !row.value.trim()}
            onClick={() => removeRow(index)}
            size="iconSm"
            title={t("Remove")}
            type="button"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function Toggle({ checked, disabled = false, onChange }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />;
}

export type MetricTone = "amber" | "blue" | "indigo" | "rose" | "slate" | "teal";

export function MetricCard({ label, tone, value }: { label: string; tone: MetricTone; value: string }) {
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className={cn("h-1", metricToneBar(tone))} />
      <CardContent className="flex min-h-[88px] flex-1 flex-col justify-center">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 truncate text-[20px] font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export type SystemStatusTone = "error" | "idle" | "ok" | "warn";

export type SystemStatusPoint = {
  dateLabel: string;
  point: UsageSeriesPoint;
  tone: SystemStatusTone;
};

export function usageStatusTone(point: Pick<UsageTotals, "requestCount" | "successRate">): SystemStatusTone {
  if (point.requestCount <= 0) return "idle";
  if (point.successRate >= 0.995) return "ok";
  if (point.successRate >= 0.98) return "warn";
  return "error";
}

export function formatSystemStatusRange(segments: SystemStatusPoint[], range: UsageStatsRange): string {
  if (segments.length === 0) {
    return range;
  }
  const first = segments[0]?.dateLabel ?? "";
  const last = segments.at(-1)?.dateLabel ?? first;
  return first === last ? first : `${first} - ${last}`;
}

export function formatStatusBucketDate(bucket: string, range: UsageStatsRange): string {
  const parsed = parseStatusBucketDate(bucket);
  if (!parsed) {
    return bucket;
  }
  const dateOptions: Intl.DateTimeFormatOptions = range === "today" || range === "24h"
    ? { day: "2-digit", hour: "2-digit", hour12: false, month: "2-digit" }
    : { day: "2-digit", month: "2-digit" };
  return new Intl.DateTimeFormat(undefined, dateOptions).format(parsed);
}

export function parseStatusBucketDate(bucket: string): Date | undefined {
  const match = bucket.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::00)?)?$/);
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), hour === undefined ? 0 : Number(hour), 0, 0, 0);
}

export function systemStatusPointTooltip(segment: SystemStatusPoint, t: (value: string) => string): string {
  return [
    segment.dateLabel,
    `${t("Requests")}: ${formatCompactNumber(segment.point.requestCount)}`,
    `${t("Success rate")}: ${formatPercent(segment.point.successRate)}`,
    `${t("Failed requests")}: ${formatCompactNumber(segment.point.errorCount)}`,
    `${t("Duration")}: ${formatDuration(segment.point.avgDurationMs)}`
  ].join("\n");
}

export function systemStatusTooltipPositionClass(index: number, total: number): string {
  if (index <= 1) {
    return "left-0";
  }
  if (index >= total - 2) {
    return "right-0";
  }
  return "left-1/2 -translate-x-1/2";
}

export function systemStatusIconClass(tone: SystemStatusTone): string {
  if (tone === "ok") return "bg-emerald-500 text-white";
  if (tone === "warn") return "bg-amber-400 text-amber-950";
  if (tone === "error") return "bg-rose-500 text-white";
  return "bg-muted text-muted-foreground";
}

export function systemStatusSegmentClass(tone: SystemStatusTone): string {
  if (tone === "ok") return "bg-emerald-500";
  if (tone === "warn") return "bg-amber-400";
  if (tone === "error") return "bg-rose-500";
  return "bg-muted-foreground/25";
}

export function ServiceControlButton({
  busy,
  onClick,
  state
}: {
  busy: boolean;
  onClick: () => void;
  state: GatewayStatus["state"];
}) {
  const t = useAppText();
  const active = state === "running" || state === "starting";
  const title = active ? t("Pause service") : t("Start service");
  const Icon = active ? Pause : Play;

  return (
    <Button
      aria-label={title}
      className={cn(
        "app-no-drag app-service-control inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25",
        active && "text-emerald-700 hover:text-emerald-800"
      )}
      disabled={busy}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
      title={title}
      type="button"
      unstyled
    >
      {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function EndpointTitleBar({
  config,
  endpoint,
  gatewayStatus,
  onOpenSettings,
  proxyStatus
}: {
  config: AppConfig;
  endpoint: string;
  gatewayStatus: GatewayStatus;
  onOpenSettings: () => void;
  proxyStatus: ProxyStatus;
}) {
  const t = useAppText();
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const running = gatewayStatus.state === "running";
  const statusLabel = running ? t("running") : t("not running");
  const value = endpoint.trim() || t("Not configured");
  const endpointInfo = endpointDetails(value, config);
  const proxyEndpoint = proxyStatus.endpoint || gatewayEndpointFromConfig(config);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      className="app-no-drag fixed left-1/2 top-2 z-50 w-[min(560px,56vw,calc(100%_-_48px))] min-w-[220px] -translate-x-1/2 max-[720px]:static max-[720px]:w-full max-[720px]:min-w-0 max-[720px]:translate-x-0"
      ref={rootRef}
      title={`${t("Endpoint")} ${value} - ${statusLabel}`}
    >
      <Button
        aria-controls="endpoint-info-panel"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-left shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/40"
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
        unstyled
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            running ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" : "bg-muted-foreground/45"
          )}
        />
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t("Endpoint")}</span>
        <span className="h-3 w-px shrink-0 bg-border" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{value}</span>
        <span className="sr-only">{t("Service status")}: {statusLabel}</span>
      </Button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute left-1/2 top-full z-50 mt-2 w-[288px] max-w-[calc(100vw-24px)] -translate-x-1/2"
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -6 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -6 }}
            transition={shouldReduceMotion ? reducedMotionTransition : { damping: 34, mass: 0.68, stiffness: 520, type: "spring" }}
          >
            <PopoverContent
              aria-label={t("Endpoint information")}
              className="p-3"
              id="endpoint-info-panel"
              role="dialog"
            >
              <div className="mb-2 flex items-center gap-2 border-b border-border/60 pb-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    running ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" : "bg-muted-foreground/45"
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{t("Endpoint")}</span>
                <Badge variant={running ? "success" : "outline"}>{statusLabel}</Badge>
              </div>

              <div className="space-y-1.5">
                <EndpointInfoRow label="IP" value={endpointInfo.host} />
                <EndpointInfoRow label={t("Port")} value={endpointInfo.port} />
                <EndpointInfoRow label="Loopback" value={config.gateway.host || "127.0.0.1"} />
                <EndpointInfoRow label={t("Proxy")} value={proxyEndpoint} />
              </div>

              <Button
                className="mt-3 h-7 w-full rounded-md border border-border bg-background px-2 text-center text-[12px] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/25"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
                type="button"
                unstyled
              >
                {t("Advanced Settings...")}
              </Button>
            </PopoverContent>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function EndpointInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-2 text-[12px]">
      <span className="text-right text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

export function gatewayEndpointFromConfig(config: AppConfig): string {
  if (config.routerEndpoint) {
    return config.routerEndpoint;
  }

  return endpointFromHostPort(config.gateway.host, config.gateway.port);
}

export function defaultProfileClientModel(config: AppConfig): string {
  const configuredDefault = normalizeProfileClientModel(config.Router.default);
  if (configuredDefault) {
    return configuredDefault;
  }
  const preferred = config.Providers.find((provider) => provider.name === config.preferredProvider) ?? config.Providers[0];
  if (preferred?.name && preferred.models[0]) {
    return `${preferred.name}/${preferred.models[0]}`;
  }
  return "gpt-5-codex";
}

export function normalizeProfileClientModel(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : "";
  }
  return trimmed;
}

export type ProfileModelProviderOption = {
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
    .filter((provider) => provider.name?.trim() && Array.isArray(provider.models))
    .map((provider) => ({
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
    const commaPrefix = `${provider.name},`;
    if (trimmed.startsWith(slashPrefix)) {
      return { model: trimmed.slice(slashPrefix.length).trim(), provider: provider.name };
    }
    if (trimmed.startsWith(commaPrefix)) {
      return { model: trimmed.slice(commaPrefix.length).trim(), provider: provider.name };
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
    return `${parsedValue.provider}/${parsedValue.model}`;
  }
  const provider = profileModelProviderOptions(providers, virtualModelProfiles).find((item) => item.models.includes(normalized));
  return provider ? `${provider.name}/${normalized}` : normalized;
}

export function profileModelProviderMatchesQuery(provider: ProfileModelProviderOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return (
    provider.name.toLowerCase().includes(normalizedQuery) ||
    provider.models.some((model) => model.toLowerCase().includes(normalizedQuery))
  );
}

export function profileModelMatchesQuery(providerName: string, model: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return providerName.toLowerCase().includes(normalizedQuery) || model.toLowerCase().includes(normalizedQuery);
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
  return {
    agent,
    ...createBotGatewayDraft(),
    configFile: "~/.codex/config.toml",
    envRows: [],
    model: "",
    name: name ?? profileAgentLabel(agent),
    providerId: "claude-code-router",
    providerName: "Claude Code Router",
    scope: "global",
    settingsFile: "~/.claude/settings.json",
    showAllSessions: false,
    smallFastModel: "",
    surface: "auto"
  };
}

export function createProfileDraftFromProfile(profile: ProfileConfig, botConfigs: BotGatewaySavedConfig[] = []): AddProfileDraft {
  const botDraft = createBotGatewayDraft(profile.botGateway);
  const botConfigId = profile.botConfigId || matchingBotConfigId(profile.botGateway, botConfigs);
  const selectedBot = botConfigId ? botConfigs.find((config) => config.id === botConfigId) : undefined;
  if (profile.agent === "claude-code") {
    return {
      ...createProfileDraft("claude-code", profile.name),
      ...botDraft,
      botConfigId,
      botEnabled: Boolean(selectedBot || profile.botGateway?.enabled),
      envRows: keyValueRowsFromRecord(profile.env ?? {}),
      model: profile.model,
      scope: normalizeProfileFormScope(profile.scope),
      settingsFile: profile.settingsFile ?? "~/.claude/settings.json",
      smallFastModel: profile.smallFastModel ?? "",
      surface: normalizeProfileSurface(profile.surface)
    };
  }
  return {
    ...createProfileDraft("codex", profile.name),
    ...botDraft,
    botConfigId,
    botEnabled: Boolean(selectedBot || profile.botGateway?.enabled),
    configFile: profile.configFile ?? "~/.codex/config.toml",
    envRows: keyValueRowsFromRecord(profile.env ?? {}),
    model: profile.model,
    providerId: profile.providerId ?? "claude-code-router",
    providerName: profile.providerName ?? "Claude Code Router",
    scope: normalizeProfileFormScope(profile.scope),
    showAllSessions: Boolean(profile.showAllSessions),
    surface: normalizeProfileSurface(profile.surface)
  };
}

export function isProfileDraftSubmittable(draft: AddProfileDraft): boolean {
  if (!draft.name.trim()) {
    return false;
  }
  if (!validateProfileEnvRows(draft.envRows)) {
    return false;
  }
  if (draft.botEnabled && !draft.botConfigId.trim()) {
    return false;
  }
  if (draft.agent === "claude-code") {
    return true;
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
  const selectedBot = draft.botEnabled
    ? botConfigs.find((config) => config.id === draft.botConfigId.trim())
    : undefined;
  const botGateway = selectedBot
    ? { botConfigId: selectedBot.id, botGateway: selectedBot.botGateway }
    : {};
  return normalizeProfileItem({
    agent: draft.agent,
    ...botGateway,
    configFile: draft.configFile,
    enabled: existingProfile?.enabled ?? true,
    env: recordFromKeyValueRows(draft.envRows),
    id,
    model: draft.model,
    name: draft.name,
    providerId: draft.providerId,
    providerName: draft.providerName,
    scope: draft.scope,
    settingsFile: draft.settingsFile,
    showAllSessions: draft.showAllSessions,
    smallFastModel: draft.smallFastModel,
    surface: draft.surface
  }, existingProfiles.length);
}

export function createBotGatewayConfigDraft(config?: BotGatewaySavedConfig): BotGatewayConfigDraft {
  const botDraft = createBotGatewayDraft(config?.botGateway);
  return {
    botAuthFields: botDraft.botAuthFields,
    botAuthType: botDraft.botAuthType,
    botForwardAllAgentMessages: botDraft.botForwardAllAgentMessages,
    botHandoffEnabled: botDraft.botHandoffEnabled,
    botHandoffIdleSeconds: botDraft.botHandoffIdleSeconds,
    botHandoffPhoneBluetoothTargets: botDraft.botHandoffPhoneBluetoothTargets,
    botHandoffPhoneWifiTargets: botDraft.botHandoffPhoneWifiTargets,
    botPlatform: botDraft.botPlatform === "none" ? "weixin-ilink" : botDraft.botPlatform,
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
    botGatewayMissingRequiredAuthFields(draft.botAuthFields, platform, authType).length === 0 &&
    isNumberDraftValid(draft.botHandoffIdleSeconds, 30, 86_400)
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
    createIntegration: draft.botEnabled !== false && platform !== "none",
    credentials: authPayload.credentials,
    cwd: "",
    enabled: draft.botEnabled !== false,
    forwardAllAgentMessages: draft.botForwardAllAgentMessages,
    handoff: {
      enabled: draft.botHandoffEnabled,
      idleSeconds: numberDraftValue(draft.botHandoffIdleSeconds, fallbackConfig.botGateway.handoff.idleSeconds, 30, 86_400),
      phoneBluetoothTargets: splitDraftLines(draft.botHandoffPhoneBluetoothTargets).slice(0, 1),
      phoneWifiTargets: splitDraftLines(draft.botHandoffPhoneWifiTargets).slice(0, 1),
      screenLock: true,
      userIdle: true
    },
    integrationConfig: authPayload.integrationConfig,
    integrationId: existingBotGateway?.integrationId?.trim() || createBotGatewayIntegrationId(configId),
    platform,
    pollIntervalMs: fallbackConfig.botGateway.pollIntervalMs,
    requestTimeoutMs: fallbackConfig.botGateway.requestTimeoutMs,
    sourceDir: "",
    startupTimeoutMs: fallbackConfig.botGateway.startupTimeoutMs,
    stateDir: existingBotGateway?.stateDir?.trim() || createBotGatewayStateDir(configId),
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
    platform,
    pollIntervalMs: Number.isFinite(Number(record.pollIntervalMs))
      ? numberDraftValue(String(record.pollIntervalMs), fallbackConfig.botGateway.pollIntervalMs, 500, 60_000)
      : fallbackConfig.botGateway.pollIntervalMs,
    requestTimeoutMs: Number.isFinite(Number(record.requestTimeoutMs))
      ? numberDraftValue(String(record.requestTimeoutMs), fallbackConfig.botGateway.requestTimeoutMs, 1000, 3_600_000)
      : fallbackConfig.botGateway.requestTimeoutMs,
    sourceDir: typeof record.sourceDir === "string" ? record.sourceDir : fallbackConfig.botGateway.sourceDir,
    startupTimeoutMs: Number.isFinite(Number(record.startupTimeoutMs))
      ? numberDraftValue(String(record.startupTimeoutMs), fallbackConfig.botGateway.startupTimeoutMs, 1000, 120_000)
      : fallbackConfig.botGateway.startupTimeoutMs,
    stateDir: typeof record.stateDir === "string" ? record.stateDir : fallbackConfig.botGateway.stateDir,
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
  const envCount = Object.keys(profile.env ?? {}).length;
  const envSummaryItems = envCount > 0
    ? [{ label: t("Environment variables"), value: String(envCount) }]
    : [];
  const savedBot = profile.botConfigId
    ? config.botConfigs.find((item) => item.id === profile.botConfigId)
    : undefined;
  const resolvedBotGateway = savedBot?.botGateway ?? profile.botGateway ?? config.botGateway;
  const botSummaryItems = resolvedBotGateway?.enabled && resolvedBotGateway.platform !== "none"
    ? [{ label: t("Bot"), value: `${t("Enabled")} (${savedBot ? botGatewaySavedConfigLabel(savedBot, t) : t(botGatewayPlatformLabel(resolvedBotGateway.platform))})` }]
    : profile.botGateway
      ? [{ label: t("Bot"), value: t("Disabled") }]
      : [];
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
      ...botSummaryItems,
      ...envSummaryItems
    ];
  }

  return [
    { label: t("Model"), value: modelValue },
    { label: t("Provider ID"), value: profile.providerId ?? "claude-code-router" },
    { label: t("Show all sessions"), value: profile.showAllSessions ? t("Enabled") : t("Disabled") },
    ...botSummaryItems,
    ...envSummaryItems
  ];
}

export function normalizeProfileItem(profile: ProfileConfig, index: number): ProfileConfig {
  const name = profile.name.trim() || profileAgentLabel(profile.agent);
  const model = profile.model.trim();
  const scope = normalizeProfileScope(profile.scope);
  const surface = normalizeProfileSurface(profile.surface);
  const env = isPlainRecord(profile.env) ? stringRecordValue(profile.env) : {};
  const botGateway = normalizeBotGatewayRuntimeConfig(profile.botGateway);
  const botConfigId = stringValue(profile.botConfigId);
  if (profile.agent === "claude-code") {
    return {
      agent: "claude-code",
      ...(botConfigId ? { botConfigId } : {}),
      ...(botGateway ? { botGateway } : {}),
      enabled: profile.enabled,
      env,
      id: profile.id || `profile-${index + 1}`,
      model,
      name,
      scope,
      settingsFile: profile.settingsFile?.trim() || "~/.claude/settings.json",
      smallFastModel: profile.smallFastModel?.trim() || "",
      surface
    };
  }
  return {
    agent: "codex",
    ...(botConfigId ? { botConfigId } : {}),
    ...(botGateway ? { botGateway } : {}),
    cliMiddleware: true,
    codexCliPath: "",
    codexHome: "",
    configFormat: "separate_profile_files",
    configFile: profile.configFile?.trim() || "~/.codex/config.toml",
    enabled: profile.enabled,
    env,
    id: profile.id || `profile-${index + 1}`,
    model,
    name,
    providerId: profile.providerId?.trim() || "claude-code-router",
    providerName: profile.providerName?.trim() || "Claude Code Router",
    scope,
    showAllSessions: Boolean(profile.showAllSessions),
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
      env: {},
      id: "default-claude-code",
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
      : undefined;
  if (!agent) {
    return undefined;
  }
  return normalizeProfileItem({
    agent,
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
  return "Auto";
}

export function profileOpenSurfaces(profile: ProfileConfig): ProfileOpenSurface[] {
  const surface = normalizeProfileSurface(profile.surface);
  if (surface === "cli") {
    return ["cli"];
  }
  if (surface === "app") {
    return ["app"];
  }
  return ["cli", "app"];
}

export function profileOpenCommandFallback(profile: ProfileConfig, surface: ProfileOpenSurface = "cli"): string {
  const profileRef = profile.name.trim() || profile.id;
  return ["ccr", shellCommandQuote(profileRef), ...(surface === "app" ? ["--app"] : [])].join(" ");
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
  return codexLogoUrl;
}

export function endpointFromHostPort(host: string, port: number): string {
  const trimmedHost = host.trim() || "127.0.0.1";
  const endpointHost = trimmedHost === "0.0.0.0" ? "127.0.0.1" : trimmedHost;
  const formattedHost = endpointHost.includes(":") && !endpointHost.startsWith("[") ? `[${endpointHost}]` : endpointHost;
  return `http://${formattedHost}:${port}`;
}

export function proxyRestartMessage(status: ProxyStatus): string {
  if (status.state !== "running") {
    return status.lastError || "Proxy is stopped.";
  }
  if (status.systemProxy.state === "error") {
    return `Proxy restarted, but system proxy switching failed: ${status.systemProxy.lastError || "Unknown error"}`;
  }
  return "Proxy restarted.";
}

export function gatewayServiceMessage(status: GatewayStatus, stopped: boolean): string {
  if (stopped) {
    return "Service paused.";
  }
  if (status.state === "running") {
    return "Service started.";
  }
  return status.lastError || "Service did not start.";
}

export function endpointDetails(endpoint: string, config: AppConfig): { host: string; port: string } {
  try {
    const parsed = new URL(endpoint);
    return {
      host: parsed.hostname || config.gateway.host || "127.0.0.1",
      port: parsed.port || String(config.gateway.port)
    };
  } catch {
    return {
      host: config.gateway.host || "127.0.0.1",
      port: String(config.gateway.port)
    };
  }
}

export function StatusBadge({ state }: { state: GatewayStatus["state"] | ProxyStatus["state"] }) {
  const t = useAppText();
  return <Badge variant={state === "running" ? "success" : state === "error" ? "danger" : state === "starting" ? "warning" : "outline"}>{t(state)}</Badge>;
}

export function certificateStatusLabel(status: ProxyCertificateStatus): string {
  if (status.trusted) {
    return "Trusted";
  }
  if (status.state === "missing") {
    return "Not installed";
  }
  if (status.state === "unsupported") {
    return "Manual install";
  }
  if (status.state === "untrusted") {
    return "Untrusted";
  }
  return "Unknown";
}

export function certificateStatusVariant(status: ProxyCertificateStatus): "danger" | "outline" | "success" | "warning" {
  if (status.trusted) {
    return "success";
  }
  if (status.state === "unsupported" || status.state === "unknown") {
    return "outline";
  }
  if (status.state === "untrusted") {
    return "danger";
  }
  return "warning";
}

export function formatProxyCertificateInstallMessage(
  result: ProxyCertificateInstallResult,
  status: ProxyCertificateStatus | undefined,
  translate: (value: string) => string
): string {
  const resultMessage = translateProxyCertificateMessage(result.message, translate) || translate(result.message);
  if (status?.trusted) {
    return resultMessage;
  }

  const parts = [resultMessage];
  if (status?.message && status.message !== result.message) {
    parts.push(`${translate("Status")}: ${translateProxyCertificateMessage(status.message, translate)}`);
  }
  const message = parts.join("\n\n");
  if (!result.manualCommand) {
    return message;
  }

  return `${message}\n\n${translate("Manual install command")}:\n${result.manualCommand}`;
}

export function translateProxyCertificateMessage(message: string | undefined, translate: (value: string) => string): string {
  if (!message) {
    return "";
  }

  const notTrustedPrefix = "Proxy CA certificate is not trusted: ";
  if (message.startsWith(notTrustedPrefix)) {
    return `${translate("Proxy CA certificate is not trusted:")} ${message.slice(notTrustedPrefix.length)}`;
  }

  const macosAuthorizationPrefix = "macOS did not allow CCR to request administrator authorization: ";
  if (message.startsWith(macosAuthorizationPrefix)) {
    return `${translate("macOS did not allow CCR to request administrator authorization:")} ${translateMacosAuthorizationDetail(message.slice(macosAuthorizationPrefix.length), translate)}`;
  }

  return translate(message);
}

export function translateMacosAuthorizationDetail(detail: string, translate: (value: string) => string): string {
  return detail
    .replace(" Opened Terminal installer:", ` ${translate("Opened Terminal installer:")}`)
    .replace(" Could not open Terminal installer:", ` ${translate("Could not open Terminal installer:")}`);
}

export function proxyCertificateTrustSteps(status: ProxyCertificateStatus): string[] {
  if (status.trusted) {
    return [];
  }

  if (status.platform === "darwin") {
    return [
      "Click Install CA and approve the administrator prompt to install it into the System keychain.",
      "If trust is still not detected, open Keychain Access > System and find the CCR MITM Proxy certificate.",
      "Open Trust, set When using this certificate to Always Trust, then restart the browser or client.",
      "Return here and click Check Trust."
    ];
  }

  if (status.platform === "win32") {
    return [
      "Click Install CA, or open the CA file and import it manually.",
      "Place it under Current User > Trusted Root Certification Authorities > Certificates.",
      "Restart the browser or client.",
      "Return here and click Check Trust."
    ];
  }

  return [
    "Open the CA file and import it into your OS or browser trust store.",
    "For Firefox, Java, Python, Node, or other clients with a private CA store, import the CA there as well.",
    "Restart the browser or client.",
    "Return here and click Check Trust."
  ];
}

export function networkExchangeMatchesQuery(exchange: ProxyNetworkExchange, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    exchange.method,
    exchange.url,
    exchange.upstreamUrl,
    exchange.host,
    exchange.client,
    exchange.path,
    exchange.protocol,
    exchange.mode,
    networkLifecycleLabel(exchange),
    networkCodeLabel(exchange),
    networkStatusLabel(exchange),
    formatNetworkHeaders(exchange.requestHeaders),
    formatNetworkHeaders(exchange.responseHeaders ?? {}),
    exchange.requestBody.text,
    exchange.responseBody?.text ?? "",
    exchange.error ?? ""
  ].some((value) => value.toLowerCase().includes(query));
}

export function networkRowId(exchange: ProxyNetworkExchange, index: number, total: number): string {
  const numeric = Number(exchange.id);
  if (Number.isFinite(numeric) && numeric > 0) {
    return String(numeric);
  }
  return String(Math.max(1, total - index));
}

export function networkLifecycleLabel(exchange: ProxyNetworkExchange): string {
  if (exchange.state === "pending") {
    return "Active";
  }
  if (exchange.state === "error") {
    return "Error";
  }
  return "Completed";
}

export function networkCodeLabel(exchange: ProxyNetworkExchange): string {
  return exchange.statusCode === undefined ? "-" : String(exchange.statusCode);
}

export function networkStatusLabel(exchange: ProxyNetworkExchange): string {
  if (exchange.statusCode !== undefined) {
    return String(exchange.statusCode);
  }
  return exchange.state;
}

export function networkStatusVariant(exchange: ProxyNetworkExchange): "danger" | "outline" | "success" | "warning" {
  if (exchange.state === "pending") {
    return "warning";
  }
  if (exchange.state === "error") {
    return "danger";
  }
  const status = exchange.statusCode ?? 0;
  if (status >= 200 && status < 400) {
    return "success";
  }
  if (status >= 400) {
    return "danger";
  }
  return "outline";
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatNetworkHeaders(headers: Record<string, string | string[]>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n");
}

export function networkHeaderRows(headers: Record<string, string | string[]>): Array<[string, string]> {
  return Object.entries(headers).map(([key, value]) => [formatHeaderName(key), Array.isArray(value) ? value.join(", ") : value]);
}

export function networkQueryRows(url: string): Array<[string, string]> {
  try {
    const parsed = new URL(url);
    return Array.from(parsed.searchParams.entries());
  } catch {
    return [];
  }
}

export function networkSummaryRows(exchange: ProxyNetworkExchange): Array<[string, string]> {
  return [
    ["URL", exchange.url],
    ["Upstream", exchange.upstreamUrl],
    ["Client", exchange.client],
    ["Protocol", exchange.protocol.toUpperCase()],
    ["Mode", exchange.mode],
    ["Method", exchange.method],
    ["Status", networkLifecycleLabel(exchange)],
    ["Code", networkCodeLabel(exchange)],
    ["Started", formatNetworkDateTime(exchange.startedAt)],
    ["Completed", exchange.completedAt ? formatNetworkDateTime(exchange.completedAt) : "-"],
    ["Duration", formatDuration(exchange.durationMs)],
    ["Request size", formatBytes(exchange.requestBody.sizeBytes)],
    ["Response size", exchange.responseBody ? formatBytes(exchange.responseBody.sizeBytes) : "0 B"]
  ];
}

export function formatNetworkRequestRaw(exchange: ProxyNetworkExchange): string {
  const headers = formatNetworkHeaders(exchange.requestHeaders);
  return [
    `${exchange.method} ${exchange.path || "/"} HTTP/1.1`,
    headers,
    "",
    exchange.requestBody.text || ""
  ].join("\n");
}

export function formatNetworkResponseRaw(exchange: ProxyNetworkExchange): string {
  const headers = formatNetworkHeaders(exchange.responseHeaders ?? {});
  return [
    `HTTP/1.1 ${networkCodeLabel(exchange)} ${networkLifecycleLabel(exchange)}`,
    headers,
    "",
    exchange.responseBody?.text || ""
  ].join("\n");
}

export function formatHeaderName(value: string): string {
  return value
    .split("-")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join("-");
}

export function clientInitial(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "CLI";
  }
  if (normalized.toLowerCase().includes("chrome")) {
    return "C";
  }
  if (normalized.toLowerCase().includes("codex")) {
    return "CCR";
  }
  return normalized.slice(0, 3).toUpperCase();
}

export function formatNetworkTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatNetworkDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    year: "numeric"
  });
}

export function formatDuration(value: number | undefined): string {
  if (value === undefined) {
    return "pending";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function createEmptyUsageStats(range: UsageStatsRange): UsageStatsSnapshot {
  return {
    clientModels: [],
    generatedAt: new Date().toISOString(),
    models: [],
    providerModels: [],
    range,
    recentRequests: [],
    series: createEmptyUsageSeries(range),
    totals: emptyUsageTotals()
  };
}

export function createEmptyAgentAnalysis(range: UsageStatsRange): AgentAnalysisSnapshot {
  return {
    agents: [],
    clients: [],
    concurrency: createEmptyAgentConcurrencySeries(range),
    endpoints: [],
    errors: [],
    generatedAt: new Date().toISOString(),
    range,
    recentRequests: [],
    routes: [],
    scannedRequestCount: 0,
    sessions: [],
    subagents: [],
    tools: [],
    totals: {
      ...emptyUsageTotals(),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      errorCount: 0,
      maxConcurrentRequests: 0,
      maxDurationMs: 0,
      p50DurationMs: 0,
      p95DurationMs: 0,
      p99DurationMs: 0,
      sessionCount: 0,
      subagentCallCount: 0,
      toolCallCount: 0
    }
  };
}

export function createEmptyRequestLogPage(filter: RequestLogListFilter = {}): RequestLogPage {
  const pageSize = positiveInteger(filter.pageSize) ?? 25;
  return {
    generatedAt: new Date().toISOString(),
    items: [],
    options: {
      models: [],
      providers: []
    },
    page: positiveInteger(filter.page) ?? 1,
    pageSize,
    total: 0,
    totalPages: 1
  };
}

export function createEmptyAgentConcurrencySeries(range: UsageStatsRange) {
  return createEmptyUsageSeries(range).map((point) => ({
    bucket: point.bucket,
    label: point.label,
    maxConcurrentRequests: 0,
    requestCount: 0
  }));
}

export function createEmptyUsageSeries(range: UsageStatsRange) {
  const now = new Date();
  if (range === "today" || range === "24h") {
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    if (range === "today") {
      start.setHours(0);
    } else {
      start.setHours(start.getHours() - 23);
    }
    const count = range === "today" ? now.getHours() + 1 : 24;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(start);
      date.setHours(start.getHours() + index);
      return {
        ...emptyUsageTotals(),
        bucket: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}`,
        label: `${String(date.getHours()).padStart(2, "0")}:00`
      };
    });
  }

  const count = range === "7d" ? 7 : 30;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (count - 1));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      ...emptyUsageTotals(),
      bucket: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      label: `${date.getMonth() + 1}/${date.getDate()}`
    };
  });
}

export function emptyUsageTotals(): UsageTotals {
  return {
    avgDurationMs: 0,
    cacheRatio: 0,
    cacheTokens: 0,
    costUsd: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    requestCount: 0,
    successRate: 0,
    totalTokens: 0
  };
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard"
  }).format(value);
}

export function formatUsdCost(value: number | undefined): string {
  const normalized = Number.isFinite(value) && value && value > 0 ? value : 0;
  if (normalized === 0) {
    return "$0.00";
  }
  if (normalized < 0.01) {
    return `$${normalized.toFixed(6)}`;
  }
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: normalized >= 100 ? 0 : 2,
    minimumFractionDigits: 2,
    style: "currency"
  }).format(normalized);
}

export function compareProviderAccountSnapshots(a: ProviderAccountSnapshot, b: ProviderAccountSnapshot): number {
  return providerAccountStatusRank(b.status) - providerAccountStatusRank(a.status) || a.provider.localeCompare(b.provider);
}

export function providerAccountStatusRank(status: ProviderAccountSnapshot["status"]): number {
  if (status === "error") return 4;
  if (status === "critical") return 3;
  if (status === "warning") return 2;
  if (status === "ok") return 1;
  return 0;
}

export function primaryProviderAccountMeter(account: ProviderAccountSnapshot): ProviderAccountMeter | undefined {
  return [...account.meters].sort((a, b) => {
    const aRatio = providerAccountMeterRemainingRatio(a) ?? 1;
    const bRatio = providerAccountMeterRemainingRatio(b) ?? 1;
    return aRatio - bRatio;
  })[0];
}

export function providerAccountMetersForDisplay(account: ProviderAccountSnapshot, maxCount: number): ProviderAccountMeter[] {
  return account.meters.slice(0, maxCount);
}

export function providerAccountMeterRemainingRatio(meter: ProviderAccountMeter): number | undefined {
  if (!meter.limit || meter.limit <= 0 || meter.remaining === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(1, meter.remaining / meter.limit));
}

export function providerAccountMeterProgress(meter: ProviderAccountMeter): number | undefined {
  const ratio = providerAccountMeterRemainingRatio(meter);
  return ratio === undefined ? undefined : Math.max(3, Math.round(ratio * 100));
}

export function providerAccountBadgeVariant(status: ProviderAccountSnapshot["status"]): "danger" | "outline" | "success" | "warning" {
  if (status === "critical" || status === "error") {
    return "danger";
  }
  if (status === "warning") {
    return "warning";
  }
  if (status === "ok") {
    return "success";
  }
  return "outline";
}

export function providerAccountProgressClass(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "bg-red-500";
  }
  if (status === "warning") {
    return "bg-amber-500";
  }
  return "bg-emerald-500";
}

export function formatProviderAccountMeterValue(meter: ProviderAccountMeter): string {
  const value = meter.remaining ?? meter.used ?? meter.limit;
  if (value === undefined) {
    return "-";
  }
  if (meter.unit === "USD") {
    return `$${formatProviderAccountNumber(value)}`;
  }
  if (meter.unit === "CNY") {
    return `¥${formatProviderAccountNumber(value)}`;
  }
  if (meter.unit === "EUR") {
    return `€${formatProviderAccountNumber(value)}`;
  }
  if (meter.unit === "%") {
    return `${formatProviderAccountNumber(value)}%`;
  }
  if (meter.unit === "hours") {
    return `${formatProviderAccountNumber(value)}h`;
  }
  if (meter.unit === "minutes") {
    return `${formatProviderAccountNumber(value)}m`;
  }
  return `${formatCompactNumber(value)} ${meter.unit}`;
}

export function formatProviderAccountNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value);
}

export function formatProviderAccountReset(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  if (minutes <= 0) {
    return "soon";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

export function formatAxisNumber(value: number): string {
  return formatCompactNumber(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function logSelectOptions(label: string, values: string[], selected: string | undefined): Array<{ label: string; value: string }> {
  const merged = new Set(values);
  if (selected) {
    merged.add(selected);
  }
  return [
    { label, value: "" },
    ...Array.from(merged).map((value) => ({ label: value, value }))
  ];
}

export function normalizeAgentFilterValue(value: string): AgentFilterValue {
  return value === "claude-code" || value === "codex" || value === "claude-design" || value === "unknown" ? value : "all";
}

export function agentKindLabel(agent: AgentKind): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  if (agent === "claude-design") {
    return "Claude Design";
  }
  if (agent === "codex") {
    return "Codex";
  }
  return "Unknown";
}

export function compactId(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function compactUserAgent(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}

export function formatStatusCodeCounts(values: Array<{ count: number; statusCode: number }>): string {
  return values.map((item) => `${item.statusCode || "-"} x${item.count}`).join(", ") || "-";
}

export function formatToolCounts(values: Array<{ count: number; name: string }>): string {
  return values.map((item) => `${item.name} x${item.count}`).join(", ");
}

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

export function formatLogTokenSummary(entry: RequestLogEntry, t: (value: string) => string): string {
  if (
    entry.totalTokens === 0 &&
    entry.inputTokens === 0 &&
    entry.outputTokens === 0 &&
    entry.cacheReadTokens === 0 &&
    entry.cacheWriteTokens === 0
  ) {
    return "-";
  }
  const values = [
    `${formatCompactNumber(entry.inputTokens)} ${t("入")}`,
    `${formatCompactNumber(entry.outputTokens)} ${t("出")}`
  ];

  if (entry.cacheReadTokens > 0) {
    values.push(`${formatCompactNumber(entry.cacheReadTokens)} ${t("Cache")}`);
  }
  if (entry.cacheWriteTokens > 0) {
    values.push(`${formatCompactNumber(entry.cacheWriteTokens)} ${t("Cache write")}`);
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
    return { json, text: JSON.stringify(json, null, 2) };
  }

  const streamPayloads = parseLogStreamPayloads(text);
  if (streamPayloads.length > 0) {
    const streamedJson = { streamed_data: streamPayloads };
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
    const payload = line.startsWith("data:") ? line.slice(5).trim() : "";
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
  return typeof value === "string" && ["account", "header", "model-share", "rings", "source-tabs", "stats", "token-flow", "token-mix"].includes(value)
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
  return {
    ...(accountProvider ? { accountProvider } : {}),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    id: stringValue(value.id) || overviewWidgetId(type, metric),
    ...(metric ? { metric } : {}),
    size: normalizeOverviewWidgetSize(value.size, type) ?? defaultOverviewWidgetSize(type),
    type,
    variant
  };
}

export function normalizeOverviewWidgetType(value: unknown): OverviewWidgetType | undefined {
  return typeof value === "string" && ["account-balance", "client-analysis", "metric", "provider-analysis", "system-status", "token-mix", "usage-trend"].includes(value)
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
  if (type === "token-mix") {
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
  if (type === "token-mix") return "1:2";
  if (type === "client-analysis" || type === "provider-analysis") return "2:2";
  if (type === "usage-trend") return "3:2";
  if (type === "system-status") return "4:1";
  return "4:2";
}

export function defaultOverviewWidgetVariant(type: OverviewWidgetType): OverviewWidgetVariant {
  if (type === "account-balance") return "cards";
  if (type === "metric") return "card";
  if (type === "token-mix") return "bars";
  if (type === "usage-trend") return "composed";
  if (type === "system-status") return "timeline";
  return "table";
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

export function normalizeConfig(config: AppConfig): AppConfig {
  const router = normalizeRouterConfig(config.Router);
  const apiKeys = normalizeApiKeys(config.APIKEYS, config.APIKEY);
  const profileConfig = config.profile || fallbackConfig.profile;
  const profiles = Array.isArray(profileConfig.profiles)
    ? normalizeProfileItems(profileConfig.profiles)
    : legacyProfileItemsFromProfileConfig(profileConfig);

  return {
    ...fallbackConfig,
    ...config,
    APIKEY: apiKeys[0]?.key ?? "",
    APIKEYS: apiKeys,
    Providers: Array.isArray(config.Providers) ? config.Providers : [],
    Router: router,
    agent: {
      ...fallbackConfig.agent,
      ...(config.agent || {}),
      mcpServers: Array.isArray(config.agent?.mcpServers) ? normalizeMcpServers(config.agent.mcpServers) : fallbackConfig.agent.mcpServers
    },
    botConfigs: normalizeBotGatewaySavedConfigs(config.botConfigs),
    botGateway: normalizeBotGatewayRuntimeConfig(config.botGateway) ?? fallbackConfig.botGateway,
    gateway: {
      ...fallbackConfig.gateway,
      ...(config.gateway || {})
    },
    proxy: {
      ...fallbackConfig.proxy,
      ...(config.proxy || {}),
      targets: Array.isArray(config.proxy?.targets) ? config.proxy.targets : fallbackConfig.proxy.targets
    },
    profile: {
      ...fallbackConfig.profile,
      ...profileConfig,
      claudeCode: {
        ...fallbackConfig.profile.claudeCode,
        ...(profileConfig.claudeCode || {})
      },
      codex: {
        ...fallbackConfig.profile.codex,
        ...(profileConfig.codex || {}),
        cliMiddleware: true,
        configFormat: normalizeCodexConfigFormat(profileConfig.codex?.configFormat),
        showAllSessions: Boolean(profileConfig.codex?.showAllSessions)
      },
      profiles
    },
    overviewWidgets: normalizeOverviewWidgets(config.overviewWidgets),
    plugins: Array.isArray(config.plugins) ? config.plugins : [],
    providerPlugins: Array.isArray(config.providerPlugins) ? config.providerPlugins : [],
    theme: normalizeThemePreference(config.theme),
    trayComponentVariants: normalizeTrayComponentVariants(config.trayComponentVariants),
    trayIcon: normalizeTrayIconPreference(config.trayIcon),
    trayProgressTargetTokens: normalizeTrayProgressTargetTokens(config.trayProgressTargetTokens),
    trayWidgets: normalizeTrayWidgets(config.trayWidgets, config.trayWindowModules, config.trayComponentVariants),
    trayWindowModules: normalizeTrayWindowModules(config.trayWindowModules),
    virtualModelProfiles: Array.isArray(config.virtualModelProfiles) ? config.virtualModelProfiles : []
  };
}

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

export function normalizeRouterConfig(value: Partial<RouterConfig> | undefined): RouterConfig {
  const router = {
    ...fallbackConfig.Router,
    ...(value || {})
  };
  const rules = normalizeRouterRules((value as Record<string, unknown> | undefined)?.rules) ?? [];
  return {
    ...router,
    fallback: normalizeRouterFallbackConfig((value as Record<string, unknown> | undefined)?.fallback),
    longContextThreshold: Number(router.longContextThreshold) > 0 ? numberValue(String(router.longContextThreshold)) : fallbackConfig.Router.longContextThreshold,
    rules
  };
}

export function normalizeRouterFallbackConfig(value: Partial<RouterFallbackConfig> | unknown): RouterFallbackConfig {
  const record = isPlainRecord(value) ? value : {};
  const mode = parseRouterFallbackMode(record.mode) ?? fallbackConfig.Router.fallback.mode;
  const retryCount = clampNumber(Number(record.retryCount), 0, 5);
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
      const rawFallback = item.fallback ?? item.failureFallback ?? item.fallbackStrategy;
      const fallback = isPlainRecord(rawFallback) ? normalizeRouterFallbackConfig(rawFallback) : undefined;
      return {
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
        ...(fallback ? { fallback } : {}),
        id,
        name,
        ...(pattern ? { pattern } : {}),
        ...(target ? { target } : {}),
        ...(Number.isFinite(threshold) && threshold > 0 ? { threshold: Math.trunc(threshold) } : {}),
        type
      };
    })
    .filter((item): item is RouterRule => Boolean(item));
}

export function parseRouterRuleType(value: unknown): RouterRuleType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return isRouterRuleType(normalized) ? normalized : undefined;
}

export function isRouterRuleType(value: string): value is RouterRuleType {
  return routerRuleTypeOptions.some((option) => option.value === value);
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
  const type = parseClaudeDesignRouteRuleType(value.type) ?? "model";
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
  if (type === "long-context" && !rule.threshold.trim()) {
    patch.threshold = "200000";
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
    if (rule.type === "long-context") {
      return numberValue(rule.threshold) > 0;
    }
    return true;
  });
}

export function claudeDesignRoutingConfigFromDraft(draft: ClaudeDesignRoutingDraft): Record<string, unknown> {
  return {
    ...(draft.defaultTarget.trim() ? { default: draft.defaultTarget.trim() } : {}),
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
      if (rule.type === "long-context") {
        output.threshold = numberValue(rule.threshold);
      }
      return output;
    })
  };
}

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
  const selectedToolName = visionConfig
    ? BUILTIN_FUSION_VISION_TOOL_NAME
    : webSearchConfig
      ? BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME
      : selectedFusionToolNameFromProfile(toolDrafts, profile);
  const flags = fusionToolExecutionFlags(selectedToolName);
  const routeModelOptions = createRouteModelOptions(config?.Providers ?? []);
  const defaultVisionModel = routeModelOptions[0]?.value ?? "";
  const customToolConfig = fusionCustomToolConfigFromProfile(profile);
  const customToolName = !isBuiltInFusionToolName(selectedToolName) ? selectedToolName : customFusionToolName;
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
    clientToolsPolicy: profile.execution?.clientToolsPolicy === "deny" ? "deny" : "allow",
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
    toolsText: selectedToolName,
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
  if (!fusionToolExecutionFlags(selectedFusionToolName(draft.toolsText)).matchMultimodal) {
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
  if (!fusionToolExecutionFlags(selectedFusionToolName(draft.toolsText)).matchWebSearch) {
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
  return `web_search_${normalized || "fusion"}`;
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
  const selectedTool = selectedFusionToolName(draft.toolsText);
  if (isBuiltInFusionToolName(selectedTool)) {
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
  const selectedTool = selectedFusionToolName(draft.toolsText);
  if (isBuiltInFusionToolName(selectedTool)) {
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
  const selectedTool = selectedFusionToolName(draft.toolsText);
  const flags = fusionToolExecutionFlags(selectedTool);
  if (matchValues.length === 0) {
    return "New model is required.";
  }
  if (!draft.fixedModel.trim()) {
    return "Base model is required.";
  }
  if (!isFusionToolName(selectedTool)) {
    return "Tool is required.";
  }
  if (flags.matchMultimodal && !draft.visionModel.trim()) {
    return "Vision model is required.";
  }
  if (flags.matchWebSearch && !validateKeyValueRows(draft.webSearchEnvRows)) {
    return "Environment variable keys are required when values are set.";
  }
  if (!flags.matchMultimodal && !flags.matchWebSearch) {
    if (!selectedTool.trim()) {
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
  const selectedTool = fusionVisionConfig?.toolName ?? fusionWebSearchConfig?.toolName ?? selectedFusionToolName(draft.toolsText);
  const tools = virtualModelToolsFromDraft(draft, selectedTool);
  const maxToolCalls = numberValue(draft.maxToolCalls);
  const maxTurns = numberValue(draft.maxTurns);
  const flags = fusionToolExecutionFlags(selectedTool);
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
      clientToolsPolicy: draft.clientToolsPolicy,
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

export function virtualModelToolsFromDraft(draft: VirtualModelDraft, selectedToolName = selectedFusionToolName(draft.toolsText)): VirtualModelProfileConfig["tools"] {
  const existingTools = new Map(
    draft.tools
      .map((tool) => [normalizeFusionToolName(tool.name.trim()), tool] as const)
      .filter(([name]) => Boolean(name))
  );

  return uniqueStrings([selectedToolName])
    .filter(isFusionToolName)
    .map((name) => {
      const existingTool = existingTools.get(name);
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
  if (visionConfig?.toolName && profile.tools.some((tool) => tool.name === visionConfig.toolName)) {
    return `${fusionToolDisplayName(BUILTIN_FUSION_VISION_TOOL_NAME)}${visionConfig.modelSelector || visionConfig.model ? ` (${visionConfig.modelSelector || visionConfig.model})` : ""}`;
  }
  const webSearchConfig = fusionWebSearchConfigFromProfile(profile);
  if (webSearchConfig?.toolName && profile.tools.some((tool) => tool.name === webSearchConfig.toolName)) {
    return `${fusionToolDisplayName(BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME)}${webSearchConfig.provider ? ` (${fusionWebSearchProviderLabel(webSearchConfig.provider)})` : ""}`;
  }
  const customToolConfig = fusionCustomToolConfigFromProfile(profile);
  if (customToolConfig?.mcpServerName) {
    return profile.tools.map((tool) => `${customToolConfig.mcpServerName} / ${fusionToolDisplayName(tool.name)}`).join(", ");
  }
  return profile.tools.map((tool) => fusionToolDisplayName(tool.name)).join(", ");
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
  return normalized === BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME || normalized.startsWith(`${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}_`);
}

export function selectedFusionToolName(toolsText: string): string {
  return parseVirtualModelTextList(toolsText).map(normalizeFusionToolName).find(isFusionToolName) ?? BUILTIN_FUSION_VISION_TOOL_NAME;
}

export function selectedFusionToolNameFromProfile(toolDrafts: VirtualModelToolDraft[], profile: VirtualModelProfileConfig): string {
  const directTool = toolDrafts.map((tool) => normalizeFusionToolName(tool.name)).find(isFusionToolName);
  if (directTool) {
    return directTool;
  }
  if (profile.execution?.matchWebSearch && !profile.execution?.matchMultimodal) {
    return BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME;
  }
  return BUILTIN_FUSION_VISION_TOOL_NAME;
}

export function fusionToolExecutionFlags(name: string): Pick<VirtualModelDraft, "matchMultimodal" | "matchWebSearch"> {
  const normalized = normalizeFusionToolName(name);
  return {
    matchMultimodal: isFusionVisionToolName(normalized),
    matchWebSearch: isFusionWebSearchToolName(normalized)
  };
}

export function fusionWebSearchProviderLabel(provider: VirtualModelFusionWebSearchProvider): string {
  return fusionWebSearchProviderOptions.find((option) => option.value === provider)?.label ?? provider;
}

export function fusionToolDescription(name: string): string {
  const option = fusionToolOptions.find((item) => item.value === normalizeFusionToolName(name));
  return option?.description ?? "";
}

export function fusionToolDisplayName(name: string): string {
  const normalized = normalizeFusionToolName(name);
  const option = fusionToolOptions.find((item) => item.value === normalized);
  return option?.label ?? normalized;
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

export function buildRoutingRuleRows(config: AppConfig): RoutingRuleRow[] {
  return config.Router.rules.map((rule, index): RoutingRuleRow => ({
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
  }));
}

export function buildPluginRoutingRows(plugin: AppConfig["plugins"][number], pluginIndex: number): RoutingRuleRow[] {
  if (!isClaudeDesignPluginConfig(plugin) && !isCursorProxyPluginConfig(plugin)) {
    return [];
  }
  const pluginName = plugin.id || "plugin";
  const routing = readClaudeDesignRoutingConfig(plugin.config);
  const baseEnabled = plugin.enabled !== false && routing.enabled;
  const rows: RoutingRuleRow[] = [];
  if (routing.defaultTarget) {
    rows.push({
      condition: "always",
      enabled: baseEnabled,
      key: `plugin-${pluginIndex}-${pluginName}-default`,
      name: "Default",
      pluginIndex,
      readonly: true,
      ruleCount: 0,
      ruleId: "default",
      sourceLabel: `Plugin: ${pluginName}`,
      target: routing.defaultTarget,
      typeLabel: "Always"
    });
  }
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
  if (rule.type === "long-context") {
    return `>${rule.threshold || "threshold"} tokens`;
  }
  if (rule.type === "thinking") {
    return "thinking enabled";
  }
  if (rule.type === "web-search") {
    return "web_search tool";
  }
  if (rule.type === "image") {
    return "image content";
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
  return type === "always" || type === "image" || type === "thinking" || type === "web-search";
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
    ...(config.providerPlugins ?? []).map((item, index) => extensionListItem("providerPlugins", item, index))
  ];
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
    const routeCount = routing.rules.length + (routing.defaultTarget ? 1 : 0);
    capabilities.push(routeCount > 0 ? `${routeCount} model ${routeCount === 1 ? "route" : "routes"}` : "Configurable routing");
  }
  if (isCursorProxyPluginConfig(item)) {
    const routing = readClaudeDesignRoutingConfig(item.config);
    const routeCount = routing.rules.length + (routing.defaultTarget ? 1 : 0);
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

export function createModelCatalogItems(config: AppConfig): ModelCatalogItem[] {
  const providerModels = config.Providers.flatMap((provider) => mergeProviderModelLists(provider.models));
  const virtualModels = (config.virtualModelProfiles ?? [])
    .filter(virtualModelIsCatalogVisible)
    .flatMap(virtualModelCatalogNames);

  return uniqueStrings([...providerModels, ...virtualModels]).map((model, index) => ({
    key: `model:${index}:${model}`,
    model
  }));
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

  return row.model.toLowerCase().includes(query);
}

export function createRouteModelOptions(providers: GatewayProviderConfig[]): Array<{ label: string; value: string }> {
  return providers.flatMap((provider) => {
    if (!provider.name || !Array.isArray(provider.models)) {
      return [];
    }
    return provider.models
      .filter(Boolean)
      .map((model) => ({
        label: `${provider.name}, ${model}`,
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
  return routerRuleTypeOptions.find((option) => option.value === type)?.label ?? type;
}

export function formatRouterRuleCondition(rule: RouterRule): string {
  if (rule.type === "long-context") {
    return `>${rule.threshold || "threshold"} tokens`;
  }
  if (rule.type === "model-prefix") {
    return rule.pattern ? `starts with ${rule.pattern}` : "prefix unset";
  }
  if (rule.type === "thinking") {
    return "thinking enabled";
  }
  if (rule.type === "web-search") {
    return "web_search tool";
  }
  if (rule.type === "image") {
    return "image content";
  }
  if (rule.type === "subagent") {
    return "subagent marker";
  }
  return "always";
}

export function formatRouterRuleTarget(rule: RouterRule): string {
  const target = rule.type === "subagent" ? "Embedded request model" : rule.target || "Unset";
  return rule.fallback ? `${target} · ${formatRouterFallbackSummary(rule.fallback)}` : target;
}

export function formatRouterFallbackSummary(fallback: RouterFallbackConfig): string {
  if (fallback.mode === "off") {
    return "fallback off";
  }
  if (fallback.mode === "retry") {
    return `retry ${fallback.retryCount}x`;
  }
  return fallback.models.length ? `fallback ${fallback.models.join(" > ")}` : "fallback chain unset";
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
  const modelOptions = createRouteModelOptions(config?.Providers ?? []);
  return {
    enabled: true,
    fallback: normalizeRouterFallbackConfig(config?.Router.fallback),
    name: "Long context",
    pattern: "",
    target: modelOptions[0]?.value ?? "",
    threshold: String(config?.Router.longContextThreshold || 200000),
    type: "long-context"
  };
}

export function createRoutingRuleDraftFromRule(rule: RouterRule, config?: AppConfig): AddRoutingRuleDraft {
  const modelOptions = createRouteModelOptions(config?.Providers ?? []);
  return {
    enabled: rule.enabled,
    fallback: normalizeRouterFallbackConfig(rule.fallback ?? config?.Router.fallback),
    name: rule.name,
    pattern: rule.pattern ?? "",
    target: rule.target ?? modelOptions[0]?.value ?? "",
    threshold: String(rule.threshold ?? config?.Router.longContextThreshold ?? 200000),
    type: rule.type
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

  try {
    return await window.ccr.probeProvider({
      apiKey: undefined,
      baseUrl: payload.baseUrl,
      models: payload.models,
      protocols: payload.protocol ? [payload.protocol] : providerProtocolOptions.map((option) => option.value)
    });
  } catch {
    return undefined;
  }
}

export function createProviderConfigFromDeepLink(
  payload: ProviderDeepLinkPayload,
  providers: GatewayProviderConfig[],
  probe: GatewayProviderProbeResult | undefined,
  replaceIndex: number
): GatewayProviderConfig {
  const protocol = probe?.detectedProtocol ?? payload.protocol ?? "openai_chat_completions";
  const baseUrl = probe?.normalizedBaseUrl || payload.baseUrl;
  const models = payload.models.length > 0
    ? mergeProviderModelLists(payload.models)
    : mergeProviderModelLists(probe?.models ?? []);
  if (models.length === 0) {
    throw new Error("Models are required. Ask the provider to include models=... in the link.");
  }

  const existingName = replaceIndex >= 0 ? providers[replaceIndex]?.name : undefined;
  const baseName = payload.name?.trim() || existingName || inferProviderNameFromBaseUrl(baseUrl);
  const name = replaceIndex >= 0 ? baseName : uniqueProviderName(providers, baseName);
  const keySafetyIssue = providerApiKeySafetyIssue({ apiKey: payload.apiKey, baseUrl, name });
  if (keySafetyIssue) {
    throw new Error(keySafetyIssue.message);
  }
  const identityIssue = providerIdentitySafetyIssue({ baseUrl, name });
  if (identityIssue) {
    throw new Error(identityIssue.message);
  }
  const accountKeySafetyIssue = providerAccountApiKeySafetyIssue(payload.account, {
    apiKey: payload.apiKey,
    baseUrl,
    providerName: name
  });
  if (accountKeySafetyIssue) {
    throw new Error(accountKeySafetyIssue.message);
  }

  const capabilities = mergeProviderCapabilities(
    probe?.capabilities ?? [],
    protocol && baseUrl ? [{ baseUrl, source: probe?.detectedProtocol ? "detected" : "preset", type: protocol }] : []
  );

  return {
    account: payload.account ? cloneProviderAccountConfig(payload.account) : defaultProviderAccountConfigForBaseUrl(baseUrl),
    api_base_url: normalizeProviderBaseUrl(baseUrl, protocol),
    api_key: "",
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    icon: payload.icon?.trim() || undefined,
    models,
    name,
    type: protocol
  };
}

export function findProviderDeepLinkReplacementIndex(
  providers: GatewayProviderConfig[],
  payload: ProviderDeepLinkPayload,
  baseUrl: string
): number {
  const name = payload.name?.trim();
  if (name) {
    const namedIndex = providers.findIndex((provider) => provider.name === name);
    if (namedIndex >= 0) {
      return namedIndex;
    }
  }

  const normalizedBaseUrl = normalizeProviderBaseUrl(baseUrl).toLowerCase();
  return providers.findIndex((provider) => normalizeProviderBaseUrl(providerBaseUrl(provider)).toLowerCase() === normalizedBaseUrl);
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
    icon: "",
    modelSearch: "",
    modelsText: "",
    name: uniqueProviderName(providers),
    presetId: "",
    protocol: "openai_chat_completions",
    selectedModels: []
  };
}

export function createProviderDraftFromProvider(provider: GatewayProviderConfig): AddProviderDraft {
  const baseUrl = providerBaseUrl(provider);
  const preset = findProviderPresetByBaseUrl(baseUrl);
  const accountDraft = createProviderAccountDraftFromConfig(provider.account);
  return {
    ...accountDraft,
    apiKey: providerApiKey(provider),
    baseUrl,
    icon: provider.icon ?? "",
    modelSearch: "",
    modelsText: provider.models.join("\n"),
    name: provider.name,
    presetId: preset?.id ?? customProviderPresetId,
    protocol: toProviderProtocol(provider.type) ?? toProviderProtocol(provider.provider) ?? "openai_chat_completions",
    selectedModels: []
  };
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
  | "usageBalanceRemainingPath"
  | "usageBalanceUnit"
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
    usageBalanceRemainingPath: "",
    usageBalanceUnit: "USD",
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
    usageBalanceRemainingPath: stringValue(balanceMeter?.remaining) || "",
    usageBalanceUnit: stringValue(balanceMeter?.unit) || "USD",
    usageMessagePath: httpJsonConnector.mapping.message ?? "",
    usageRequestBodyText: httpJsonConnector.body === undefined ? "" : formatEditableJson(httpJsonConnector.body),
    usageRequestHeaders: keyValueRowsFromRecord(httpJsonConnector.headers ?? {}),
    usageRequestMethod: httpJsonConnector.method === "POST" ? "POST" : "GET",
    usageRequestUrl: httpJsonConnector.endpoint,
    usageStatusPath: httpJsonConnector.mapping.status ?? "",
    usageSubscriptionLimitPath: stringValue(subscriptionMeter?.limit) || "",
    usageSubscriptionRemainingPath: stringValue(subscriptionMeter?.remaining) || "",
    usageSubscriptionResetPath: subscriptionMeter?.resetAt ?? "",
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
  if (draft.usageBalanceRemainingPath.trim()) {
    meters.push({
      id: "balance",
      kind: "balance",
      label: "Balance",
      remaining: draft.usageBalanceRemainingPath.trim(),
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
  const baseUrl = (probe?.normalizedBaseUrl || draft.baseUrl).trim();
  const protocol = probe?.detectedProtocol ?? draft.protocol;
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

  const payload: ProviderDeepLinkPayload = {
    ...(account ? { account } : {}),
    baseUrl,
    ...(draft.icon.trim() ? { icon: draft.icon.trim() } : {}),
    models,
    name: providerName,
    protocol,
    replaceExisting: false,
    setDefault: false
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
  return cloneProviderAccountConfig(findProviderPreset(presetId)?.account ?? defaultProviderAccountConfig);
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
  if (preset) {
    return preset.endpoints.map((endpoint) => ({
      ...endpoint,
      source: "preset"
    }));
  }

  return [
    {
      baseUrl: draft.baseUrl.trim(),
      protocols: providerProtocolOptions.map((option) => option.value),
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
  models: string[]
): Promise<ProviderProbeCandidateResult | undefined> {
  const results: ProviderProbeCandidateResult[] = [];

  for (const candidate of candidates) {
    try {
      const probe = await window.ccr?.probeProvider({
        apiKey,
        baseUrl: candidate.baseUrl,
        models,
        protocols: candidate.protocols
      });
      if (!probe) {
        continue;
      }

      results.push({ candidate, probe });
    } catch {
      // Try the next candidate. Manual model entry remains the fallback.
    }
  }

  return mergeProviderProbeCandidateResults(results);
}

export function providerProbeResultIsUsable(probe: GatewayProviderProbeResult): boolean {
  return Boolean(probe.detectedProtocol || probe.models.length > 0 || probe.protocols.some((item) => item.supported));
}

export function providerProbeHasSupportedProtocol(probe: GatewayProviderProbeResult | undefined, protocol?: GatewayProviderProtocol): boolean {
  return Boolean(probe?.protocols.some((item) => item.supported && (!protocol || item.protocol === protocol)));
}

export function firstProviderConnectivityModel(draft: AddProviderDraft): string {
  return mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText))[0] ?? "";
}

export function mergeProviderProbeCandidateResults(results: ProviderProbeCandidateResult[]): ProviderProbeCandidateResult | undefined {
  if (results.length === 0) {
    return undefined;
  }

  const usable = results.find((result) => providerProbeResultIsUsable(result.probe)) ?? results[0];
  const capabilities = mergeProviderCapabilities(
    ...results.map((result) => providerProbeCapabilities(result.candidate, result.probe))
  );
  const models = mergeProviderModelLists(...results.map((result) => result.probe.models));
  const protocols = results.flatMap((result) => result.probe.protocols);
  const detectedCapability = capabilities.find((capability) => capability.type === usable.probe.detectedProtocol) ?? capabilities[0];
  const probe: GatewayProviderProbeResult = {
    ...usable.probe,
    capabilities,
    detectedProtocol: detectedCapability?.type ?? usable.probe.detectedProtocol,
    models,
    normalizedBaseUrl: detectedCapability?.baseUrl ?? usable.probe.normalizedBaseUrl,
    protocols
  };

  return {
    candidate: usable.candidate,
    probe
  };
}

export function providerProbeCapabilities(candidate: ProviderProbeCandidate, probe: GatewayProviderProbeResult): GatewayProviderCapability[] {
  const detectedCapabilities = mergeProviderCapabilities(probe.capabilities ?? []);
  if (detectedCapabilities.length > 0) {
    return detectedCapabilities;
  }

  if (candidate.source !== "preset") {
    return [];
  }

  return candidate.protocols.map((type) => ({
    baseUrl: probe.normalizedBaseUrl || candidate.baseUrl,
    source: "preset" as const,
    type
  }));
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

export function applyProviderProbeResult(draft: AddProviderDraft, probe: GatewayProviderProbeResult): AddProviderDraft {
  if (probe.models.length === 0) {
    return {
      ...draft,
      baseUrl: probe.normalizedBaseUrl || draft.baseUrl,
      protocol: probe.detectedProtocol ?? draft.protocol,
      selectedModels: mergeProviderModelLists(draft.selectedModels)
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
    baseUrl: probe.normalizedBaseUrl || draft.baseUrl,
    protocol: probe.detectedProtocol ?? draft.protocol,
    modelsText: customModels.join("\n"),
    selectedModels: nextSelectedModels
  };
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
  if (protocol === "gemini_generate_content" || normalized.includes("gemini")) {
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
  return `${index}:${provider.name || "provider"}`;
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
    ...provider.models
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

  const httpMatch = /^HTTP\s+(\d{3})(?::\s*(.*))?$/i.exec(trimmed);
  if (!httpMatch) {
    return translate(trimmed);
  }

  const status = httpMatch[1];
  const detail = httpMatch[2]?.trim();
  return detail ? `HTTP ${status}: ${translate(detail)}` : `HTTP ${status}`;
}
