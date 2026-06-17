import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Cpu,
  Database,
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
  ComposedChart,
  LabelList,
  Line,
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
import { DEFAULT_TRAY_WINDOW_MODULES, TRAY_WINDOW_MODULE_IDS } from "../../../shared/app";
import type {
  AgentAnalysisFilter,
  AgentAnalysisSnapshot,
  AgentKind,
  AppConfig,
  AppInfo,
  ApiKeyConfig,
  ApiKeyLimitConfig,
  GatewayProviderConfig,
  GatewayProviderCapability,
  GatewayPluginAppConfig,
  GatewayProviderProbeResult,
  GatewayProviderProtocol,
  GatewayMcpServerConfig,
  GatewayMcpServerTransport,
  GatewayMcpStdioMessageMode,
  GatewayStatus,
  PluginDependency,
  PluginDirectorySelection,
  PluginMarketplaceEntry,
  ProviderAccountConnectorConfig,
  ProviderAccountMeter,
  ProviderAccountSnapshot,
  ProviderDeepLinkPayload,
  ProviderDeepLinkRequest,
  ProfileConfig,
  CodexProfileConfigFormat,
  CodexRemoteFrontendMode,
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
  TrayWindowModuleId,
  UsageComparisonRow,
  UsageSeriesPoint,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals,
  VirtualModelBaseModelMode,
  VirtualModelExecutionMode,
  VirtualModelProfileConfig,
  VirtualModelToolVisibility
} from "../../../shared/app";
import {
  customProviderPresetId,
  findProviderPreset,
  findProviderPresetByBaseUrl,
  primaryProviderPresetEndpoint,
  providerPresets,
  type ProviderPreset,
  type ProviderPresetEndpoint
} from "../../../shared/provider-presets";
import { normalizeProviderBaseUrl, providerUrlWithDefaultScheme } from "../../../shared/provider-url";

type ViewId = "onboarding" | "overview" | "observability" | "api-keys" | "server" | "profile" | "networking" | "logs" | "providers" | "models" | "routing" | "virtual-models" | "extensions";
type NavigationId = ViewId | "browser";
type OnboardingStepId = "provider" | "profile" | "enter";
type AppLanguagePreference = "system" | "en" | "zh";
type ResolvedLanguage = "en" | "zh";
type ResolvedTheme = "light" | "dark";
type SettingsPageId = "appearance" | "tray";

type AppCopy = {
  navigation: Record<NavigationId, string>;
  settings: {
    appearance: string;
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
    trayIcon: string;
    trayIconCyan: string;
    trayIconOrange: string;
    trayIconProgress: string;
    trayIconRandom: string;
    trayIconViolet: string;
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

const languagePreferenceStorageKey = "ccr.ui.language";

const appCopy: Record<ResolvedLanguage, AppCopy> = {
  en: {
    navigation: {
      onboarding: "Onboarding",
      "api-keys": "API Keys",
      browser: "APPs",
      extensions: "Extensions",
      logs: "Logs",
      networking: "Networking",
      observability: "Observability",
      overview: "Overview",
      profile: "Profile",
      providers: "Providers",
      models: "Models",
      routing: "Routing",
      server: "Server",
      "virtual-models": "Virtual Models"
    },
    settings: {
      appearance: "Appearance",
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
      trayIcon: "Tray mascot",
      trayIconCyan: "Cyan",
      trayIconOrange: "Orange",
      trayIconProgress: "Progress ring",
      trayIconRandom: "Random",
      trayIconViolet: "Violet",
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
      "Header中未收到Authorization参数，无法进行身份验证。": "Missing Authorization header, so authentication could not be performed."
    }
  },
  zh: {
    navigation: {
      onboarding: "上手引导",
      "api-keys": "API 密钥",
      browser: "APPs",
      extensions: "扩展",
      logs: "日志",
      networking: "网络",
      observability: "可观测",
      overview: "概览",
      profile: "Profile",
      providers: "供应商",
      models: "模型",
      routing: "路由",
      server: "服务",
      "virtual-models": "虚拟模型"
    },
    settings: {
      appearance: "外观",
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
      trayIcon: "托盘小精灵",
      trayIconCyan: "青色小精灵",
      trayIconOrange: "橙色小精灵",
      trayIconProgress: "圆形进度条",
      trayIconRandom: "随机",
      trayIconViolet: "紫色小精灵",
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
      "A provider is required before profiles can route traffic.": "需要先配置供应商，Profile 才能路由请求。",
      "Add or verify a model provider.": "添加或确认模型供应商。",
      "Agent Analysis": "Agent 分析",
      "Agent access": "Agent 接入",
      "Agent Mix": "Agent 分布",
      "Agent profiles": "Agent Profile",
      "All agents": "全部 Agent",
      "All providers": "全部供应商",
      "API key": "API 密钥",
      "API keys database": "API 密钥数据库",
      "Add": "添加",
      "Add env variable": "添加环境变量",
      "Add header": "添加请求头",
      "Add API Key": "添加 API 密钥",
      "Add API key": "添加 API 密钥",
      "Add limit": "添加限制",
      "Add Profile": "添加 Profile",
      "Add profile": "添加 Profile",
      "Add Provider": "添加供应商",
      "Add provider": "添加供应商",
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
      "Base URL": "基础 URL",
      "Auto": "自动",
      "Back": "返回",
      "Backup": "备份",
      "Cache": "缓存",
      "Cache rate": "缓存率",
      "Cache ratio": "缓存率",
      "Cache tokens": "缓存令牌",
      "Cache write": "缓存写入",
      "Cancel": "取消",
      "Check": "检查",
      "Capture network": "捕获网络",
      "CCR manages an isolated Claude Code settings file for this profile.": "CCR 会为这个 Profile 管理一份隔离的 Claude Code 设置文件。",
      "CCR manages an isolated Codex config file for this profile.": "CCR 会为这个 Profile 管理一份隔离的 Codex 配置文件。",
      "Connection verified": "连通性已验证",
      "Check trust": "检查信任",
      "Choose where each agent uses CCR. Keep advanced paths hidden unless you need global or custom installs.": "选择每个 Agent 在哪里使用 CCR。除非需要系统默认或自定义安装，否则高级路径会保持收起。",
      "Click Add to create one": "点击添加创建一项",
      "Click Install to add one": "点击安装添加一项",
      "Client": "客户端",
      "Client Analysis": "客户端分析",
      "Client Signals": "客户端信号",
      "Claude Code": "Claude Code",
      "Close": "关闭",
      "Close dialog": "关闭弹窗",
      "Code": "代码",
      "Codex": "Codex",
      "Codex App": "Codex App",
      "Codex CLI": "Codex CLI",
      "Codex CLI path": "Codex CLI 路径",
      "Codex home": "Codex Home",
      "Codex model": "Codex 模型",
      "Claude Code through Codex App": "Claude Code 经 Codex App",
      "CLI middleware": "CLI middleware",
      "CLI only": "仅 CLI",
      "Concurrency": "并发",
      "Condition": "条件",
      "Claude Design": "Claude Design",
      "Claude Design model": "Claude Design 模型",
      "Claude Design routes": "Claude Design 路由",
      "Claude App Gateway": "Claude App 网关",
      "Configure": "配置",
      "Configure Claude App": "配置 Claude App",
      "Configure provider": "配置供应商",
      "Configure Extension": "配置扩展",
      "Configure extension": "配置扩展",
      "Configure plugin": "配置插件",
      "Configure plugin route": "配置插件路由",
      "Configure Routing": "配置路由",
      "Config file": "配置文件",
      "Config format": "配置格式",
      "Continue": "继续",
      "Custom config path": "自定义配置路径",
      "Core gateway": "核心网关",
      "Cost": "成本",
      "Connect agent": "接入 Agent",
      "Create a profile for your agent.": "为你的 Agent 创建 Profile。",
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
      "Edit API Key": "编辑 API 密钥",
      "Edit API key": "编辑 API 密钥",
      "Edit Profile": "编辑 Profile",
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
      "Generated config": "生成配置",
      "Generated path": "生成路径",
      "Headers": "请求头",
      "Header rows require keys.": "请求头行必须填写 Key。",
      "Hide advanced settings": "收起高级设置",
      "Host": "主机",
      "ID": "ID",
      "Import": "导入",
      "Import Provider": "导入供应商",
      "Imported provider": "已导入供应商",
      "Invalid JSON.": "JSON 无效。",
      "Image content": "图像内容",
      "Images": "图像",
      "Input": "输入",
      "Input tokens": "输入令牌",
      "Install": "安装",
      "Install Extension": "安装扩展",
      "Install extension": "安装扩展",
      "Install CA": "安装 CA",
      "Key": "键",
      "Keep Claude Code default": "保持 Claude Code 默认值",
      "Keep default": "保持默认值",
      "Last apply": "上次应用",
      "Last request": "最近请求",
      "Last seen": "最近活跃",
      "Legacy profile table": "旧版 profile 表",
      "Limit": "限制",
      "Limits": "限制",
      "Local": "本地",
      "Logs": "日志",
      "Long context": "长上下文",
      "Long threshold": "长上下文阈值",
      "Max concurrency": "最大并发",
      "Max concurrent": "最大并发",
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
      "No route activity": "暂无路由活动",
      "Not configured": "未配置",
      "Not running": "未运行",
      "Open CA": "打开 CA",
      "Only opened from CCR": "仅从 CCR 打开",
      "Open profiles": "查看 Profile",
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
      "Provider middleware": "供应商中间件",
      "Provider name": "供应商名称",
      "Provider name already exists.": "供应商名称已存在。",
      "Provider ready": "供应商已就绪",
      "Provider plugin": "供应商插件",
      "Provider website": "供应商网站",
      "Providers": "供应商",
      "Proxy": "代理",
      "Remote frontend": "远程前端",
      "Proxy mode": "代理模式",
      "Preset provider": "预设供应商",
      "Profile": "Profile",
      "Profile name": "Profile 名称",
      "Profile name and required target settings are missing.": "请填写 Profile 名称和必需的接入目标设置。",
      "Profile name, required target settings, and environment variable keys are required.": "请填写 Profile 名称、必需的接入目标设置和环境变量 Key。",
      "Profile ready": "Profile 已就绪",
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
      "Remove profile": "移除 Profile",
      "Remove rule": "移除规则",
      "Replace existing provider": "替换已有供应商",
      "Request": "请求",
      "Request ID": "请求 ID",
      "Request logs database": "请求日志数据库",
      "Requests": "请求",
      "Retries": "重试次数",
      "Retry": "继续重试",
      "Ready to route": "可以开始路由",
      "Restart proxy": "重启代理",
      "Route": "路由",
      "Route Observability": "路由可观测",
      "Rules": "规则",
      "Save": "保存",
      "Search API keys": "搜索 API 密钥",
      "Search extensions": "搜索扩展",
      "Search models": "搜索模型",
      "Search network captures": "搜索网络捕获",
      "Search providers": "搜索供应商",
      "Search providers or models": "搜索供应商或模型",
      "Search request logs": "搜索请求日志",
      "Search routing rules": "搜索路由规则",
      "Separate profile files": "独立 profile 文件",
      "Server": "服务",
      "Set as default provider": "设为默认供应商",
      "Settings file": "设置文件",
      "Session": "会话",
      "Sessions": "会话",
      "Status": "状态",
      "Status codes": "状态码",
      "Subagent": "子代理",
      "Subagent Routing": "Subagent 路由",
      "Subagent calls": "Subagent 调用",
      "Subagents": "Subagent",
      "Success": "成功",
      "Success rate": "成功率",
      "System proxy": "系统代理",
      "System default": "系统默认",
      "Target": "目标",
      "Target model": "目标模型",
      "Target model is required.": "目标模型不能为空。",
      "Thinking": "思考",
      "Token Mix": "令牌构成",
      "Total tokens": "总令牌",
      "Today": "今天",
      "Token threshold": "令牌阈值",
      "Tokens": "令牌",
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
      "Usage database": "用量数据库",
      "Usage Trend": "用量趋势",
      "Virtual model": "虚拟模型",
      "Virtual Models": "虚拟模型",
      "Add MCP Server": "添加 MCP 服务",
      "Add MCP server": "添加 MCP 服务",
      "Add Virtual Model": "添加虚拟模型",
      "Add virtual model": "添加虚拟模型",
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
      "Edit Virtual Model": "编辑虚拟模型",
      "Edit virtual model": "编辑虚拟模型",
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
      "MCP service tools": "MCP 服务工具",
      "Match": "匹配",
      "Match type": "匹配方式",
      "Match multimodal": "匹配多模态",
      "Match web search": "匹配网页搜索",
      "Max tool calls": "最大工具调用",
      "Max tool calls must be greater than zero.": "最大工具调用必须大于 0。",
      "Max turns": "最大轮次",
      "Max turns must be greater than zero.": "最大轮次必须大于 0。",
      "No matching virtual models": "没有匹配的虚拟模型",
      "No MCP servers configured": "未配置 MCP 服务",
      "No MCP services available": "暂无 MCP 服务可选",
      "No tools configured": "未配置工具",
      "No virtual models configured": "未配置虚拟模型",
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
      "Remove virtual model": "移除虚拟模型",
      "Replace instructions": "替换指令",
      "Request timeout": "请求超时",
      "Request timeout must be at least 100 ms.": "请求超时至少为 100 ms。",
      "Search virtual models": "搜索虚拟模型",
      "Startup timeout": "启动超时",
      "Startup timeout must be at least 100 ms.": "启动超时至少为 100 ms。",
      "Stdio message mode": "Stdio 消息模式",
      "Strip alias prefix": "移除别名前缀",
      "Strip alias suffix": "移除别名后缀",
      "Suffixes": "后缀",
      "Suffix": "后缀",
      "Suffix is required.": "后缀不能为空。",
      "Tool choice": "Tool choice",
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
      "Each plugin app requires name and url.": "每个插件 App 都需要 name 和 url。",
      "Wrapper": "包装服务",
      "Wrapper runtime": "包装运行时",
      "Wrapper plugin": "包装插件",
      "All": "全部",
      "API endpoint": "API 地址",
      "Available": "可用",
      "CA certificate": "CA 证书",
      "Capability": "能力",
      "Checking CA certificate...": "正在检查 CA 证书...",
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
      "Marketplace": "市场",
      "Model name": "模型名称",
      "Models are required. Ask the provider to include models=... in the link.": "需要模型列表。请让供应商在链接中加入 models=...。",
      "Models will be detected automatically.": "模型会自动探测。",
      "Provider models": "供应商模型",
      "Runtime provider": "运行时供应商",
      "Read only": "只读",
      "Search all models": "搜索全部模型",
      "Source": "来源",
      "Virtual": "虚拟",
      "Virtual models": "虚拟模型",
      "No models available": "暂无可用模型",
      "Direct": "直连",
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
      "No protocol detection yet": "尚未检测协议",
      "OpenAI Chat": "OpenAI Chat",
      "OpenAI Responses": "OpenAI Responses",
      "Anthropic Messages": "Anthropic Messages",
      "Gemini Generate": "Gemini 生成",
      "Model required before protocol verification.": "需要先填写模型，才能验证协议。",
      "No endpoint candidates available.": "没有可用的端点候选。",
      "Request failed.": "请求失败。",
      "No marketplace extensions": "市场暂无扩展",
      "No fallback models configured": "未配置回退模型",
      "No models configured": "未配置模型",
      "Other / custom API endpoint": "其他 / 自定义 API 地址",
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
      "No profiles for this agent": "当前 Agent 未配置 Profile",
      "No profiles configured": "未配置 Profile",
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
      "Not installed": "未安装",
      "Not set": "未设置",
      "Pause capture": "暂停捕获",
      "Pause network capture": "暂停网络捕获",
      "Pause service": "暂停服务",
      "Previous page": "上一页",
      "Previous step": "上一步",
      "Proxy not running": "代理未运行",
      "Proxy status": "代理状态",
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
      "Current model": "当前模型",
      "Degraded": "降级",
      "Gateway": "网关",
      "Healthy": "正常",
      "Idle": "未启用",
      "Network capture": "网络捕获",
      "Proxy Service": "代理服务",
      "System status": "系统状态",
      "System Proxy": "系统代理",
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
      "not running": "未运行",
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

const AppI18nContext = createContext<AppCopy>(appCopy.en);

function useAppText() {
  const copy = useContext(AppI18nContext);
  return (value: string) => translateText(copy, value);
}

function translateText(copy: AppCopy, value: string): string {
  return copy.text[value] ?? value;
}

function translateOptions<T extends { label: string; value: string }>(options: T[], t: (value: string) => string): T[] {
  return options.map((option) => ({ ...option, label: t(option.label) }));
}

const providerProtocolOptions: Array<{ label: string; value: GatewayProviderProtocol }> = [
  { label: "OpenAI Chat", value: "openai_chat_completions" },
  { label: "OpenAI Responses", value: "openai_responses" },
  { label: "Anthropic Messages", value: "anthropic_messages" },
  { label: "Gemini Generate", value: "gemini_generate_content" }
];

const apiKeyExpirationOptions: Array<{ label: string; value: ApiKeyExpirationPreset }> = [
  { label: "Never", value: "never" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "Custom", value: "custom" }
];

const limitWindowOptions: Array<{ label: string; value: LimitWindowPreset }> = [
  { label: "per minute", value: "minute" },
  { label: "per hour", value: "hour" },
  { label: "per day", value: "day" }
];

const apiKeyLimitMetricOptions: Array<{ label: string; value: ApiKeyLimitMetric }> = [
  { label: "Requests", value: "requests" },
  { label: "Tokens", value: "tokens" },
  { label: "Images", value: "images" }
];

const routerRuleTypeOptions: Array<{ label: string; value: RouterRuleType }> = [
  { label: "Long context", value: "long-context" },
  { label: "Model prefix", value: "model-prefix" },
  { label: "Thinking", value: "thinking" },
  { label: "Web search", value: "web-search" },
  { label: "Image content", value: "image" },
  { label: "Subagent", value: "subagent" },
  { label: "Always", value: "always" }
];

const routerFallbackModeOptions: Array<{ label: string; value: RouterFallbackMode }> = [
  { label: "Off", value: "off" },
  { label: "Retry", value: "retry" },
  { label: "Fallback chain", value: "model-chain" }
];

const removedLegacyRouterRuleIds = new Set([
  "legacy-subagent",
  "legacy-background",
  "legacy-thinking",
  "legacy-web-search",
  "legacy-image"
]);

const claudeDesignRouteRuleTypeOptions: Array<{ label: string; value: ClaudeDesignRouteRuleType }> = [
  { label: "Exact model", value: "model" },
  { label: "Model prefix", value: "model-prefix" },
  { label: "Long context", value: "long-context" },
  { label: "Thinking", value: "thinking" },
  { label: "Web search", value: "web-search" },
  { label: "Image content", value: "image" },
  { label: "Always", value: "always" }
];

const virtualModelMatchModeOptions: Array<{ label: string; value: VirtualModelMatchMode }> = [
  { label: "Alias", value: "alias" },
  { label: "Prefix", value: "prefix" },
  { label: "Suffix", value: "suffix" }
];

const virtualModelBaseModeOptions: Array<{ label: string; value: VirtualModelBaseModelMode }> = [
  { label: "Fixed model", value: "fixed" },
  { label: "Original request model", value: "request" },
  { label: "Strip alias prefix", value: "strip_prefix" },
  { label: "Strip alias suffix", value: "strip_suffix" }
];

const virtualModelExecutionModeOptions: Array<{ label: string; value: VirtualModelExecutionMode }> = [
  { label: "Tool loop", value: "tool_loop" },
  { label: "Decorate only", value: "decorate_only" }
];

const virtualModelToolVisibilityOptions: Array<{ label: string; value: VirtualModelToolVisibility }> = [
  { label: "Internal", value: "internal" },
  { label: "Client-visible", value: "client" }
];

const virtualModelClientToolsPolicyOptions: Array<{ label: string; value: VirtualModelClientToolsPolicy }> = [
  { label: "Allow client tools", value: "allow" },
  { label: "Deny client tools", value: "deny" }
];

const mcpServerTransportOptions: Array<{ label: string; value: GatewayMcpServerTransport }> = [
  { label: "stdio", value: "stdio" },
  { label: "streamable-http", value: "streamable-http" },
  { label: "sse", value: "sse" }
];

const mcpStdioMessageModeOptions: Array<{ label: string; value: GatewayMcpStdioMessageMode }> = [
  { label: "content-length", value: "content-length" },
  { label: "newline-json", value: "newline-json" }
];

const providerPresetIconUrls: Record<string, string> = {
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

const trayMascotIconUrls: Record<"cyan" | "orange" | "violet", string> = {
  cyan: trayCyanIconUrl,
  orange: trayOrangeIconUrl,
  violet: trayVioletIconUrl
};

const mcpServerStartupTimeoutMs = 600000;

const navigation: Array<{ icon: LucideIcon; id: NavigationId }> = [
  { icon: Gauge, id: "overview" },
  { icon: Activity, id: "observability" },
  { icon: KeyRound, id: "api-keys" },
  { icon: Server, id: "server" },
  { icon: UserRound, id: "profile" },
  { icon: Globe, id: "browser" },
  { icon: Network, id: "networking" },
  { icon: Database, id: "logs" },
  { icon: Layers3, id: "providers" },
  { icon: Box, id: "models" },
  { icon: Route, id: "routing" },
  { icon: Cpu, id: "virtual-models" },
  { icon: Braces, id: "extensions" }
];

const onboardingStepOrder: OnboardingStepId[] = ["provider", "profile", "enter"];

function isOnboardingProviderReady(config: AppConfig): boolean {
  return config.Providers.length > 0;
}

function isOnboardingProfileReady(config: AppConfig): boolean {
  return config.profile.profiles.some((profile) => profile.enabled);
}

function getDefaultOnboardingStep(config: AppConfig): OnboardingStepId {
  if (!isOnboardingProviderReady(config)) {
    return "provider";
  }
  if (!isOnboardingProfileReady(config)) {
    return "profile";
  }
  return "enter";
}

function getNextOnboardingStep(activeStep: OnboardingStepId, config: AppConfig): OnboardingStepId | undefined {
  const activeIndex = onboardingStepOrder.indexOf(activeStep);
  for (const step of onboardingStepOrder.slice(activeIndex + 1)) {
    if (step === "enter" || step === getDefaultOnboardingStep(config)) {
      return step;
    }
  }
  return undefined;
}

const motionEase = [0.22, 1, 0.36, 1] as const;
const reducedMotionTransition = { duration: 0.12, ease: "easeOut" } as const;
const pageSpringTransition = { damping: 34, mass: 0.78, stiffness: 420, type: "spring" } as const;
const listSpringTransition = { damping: 32, mass: 0.62, stiffness: 500, type: "spring" } as const;
const disclosureSpringTransition = { damping: 36, mass: 0.7, stiffness: 480, type: "spring" } as const;
type MotionSafeDivAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onAnimationStart" | "onDrag" | "onDragCapture" | "onDragEnd" | "onDragEndCapture" | "onDragStart" | "onDragStartCapture"
>;

function ViewMotionShell({ children, view }: { children: ReactNode; view: ViewId }) {
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

function AnimatedListItem({ children, className, ...props }: MotionSafeDivAttributes) {
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

function AnimatedDisclosure({ children, className }: { children: ReactNode; className?: string }) {
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

function AnimatedFieldSlot({ children, className }: { children: ReactNode; className?: string }) {
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

const fallbackInfo: AppInfo = {
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

const fallbackConfig: AppConfig = {
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
      cliMiddleware: false,
      codexCliPath: "",
      codexHome: "",
      configFormat: "legacy",
      configFile: "~/.codex/config.toml",
      enabled: true,
      model: "",
      providerId: "claude-code-router",
      providerName: "Claude Code Router",
      remoteFrontendMode: "app"
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
        cliMiddleware: false,
        codexCliPath: "",
        codexHome: "",
        configFormat: "legacy",
        configFile: "~/.codex/config.toml",
        enabled: true,
        env: {},
        id: "default-codex",
        model: "",
        name: "Codex",
        providerId: "claude-code-router",
        providerName: "Claude Code Router",
        remoteFrontendMode: "app",
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
  routerEndpoint: "http://127.0.0.1:3456",
  theme: "system",
  trayIcon: "random",
  trayProgressTargetTokens: 100000,
  trayWindowModules: DEFAULT_TRAY_WINDOW_MODULES,
  virtualModelProfiles: []
};

const fallbackGatewayStatus: GatewayStatus = {
  coreEndpoint: "http://127.0.0.1:3457",
  endpoint: "http://127.0.0.1:3456",
  generatedConfigFile: "Browser preview",
  state: "stopped"
};

const fallbackProxyStatus: ProxyStatus = {
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

const fallbackProxyCertificateStatus: ProxyCertificateStatus = {
  caCertFile: "Browser preview",
  canInstall: false,
  message: "Certificate detection is available in the Electron app.",
  platform: navigator.platform,
  state: "unknown",
  trusted: false
};

const fallbackProxyNetworkSnapshot: ProxyNetworkSnapshot = {
  capturedAt: new Date().toISOString(),
  captureEnabled: false,
  items: [],
  maxBodyBytes: 256 * 1024,
  maxEntries: 200
};

const usageRangeOptions: Array<{ label: string; value: UsageStatsRange }> = [
  { label: "Today", value: "today" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" }
];

const agentAnalysisRangeOptions: Array<{ label: string; value: UsageStatsRange }> = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" }
];

const providerAutoProbeDelayMs = 800;
const fallbackAgentAnalysis = createEmptyAgentAnalysis("7d");
const fallbackUsageStats = createEmptyUsageStats("7d");
const fallbackRequestLogPage = createEmptyRequestLogPage();

type AgentFilterValue = AgentKind | "all";

const agentFilterOptions: Array<{ label: string; value: AgentFilterValue }> = [
  { label: "All agents", value: "all" },
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "Claude Design", value: "claude-design" },
  { label: "Unknown", value: "unknown" }
];

const profileAgentOptions: Array<{ label: string; value: ProfileConfig["agent"] }> = [
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" }
];

const profileScopeOptions: Array<{ label: string; value: ProfileScope }> = [
  { label: "Only opened from CCR", value: "ccr" },
  { label: "System default", value: "global" },
  { label: "Custom config path", value: "custom" }
];

const profileSurfaceOptions: Array<{ label: string; value: ProfileSurface }> = [
  { label: "Auto", value: "auto" },
  { label: "CLI only", value: "cli" },
  { label: "App only", value: "app" }
];

const codexConfigFormatOptions: Array<{ label: string; value: CodexProfileConfigFormat }> = [
  { label: "Legacy profile table", value: "legacy" },
  { label: "Separate profile files", value: "separate_profile_files" }
];

const codexRemoteFrontendModeOptions: Array<{ label: string; value: CodexRemoteFrontendMode }> = [
  { label: "Codex App", value: "app" },
  { label: "Codex CLI", value: "cli" },
  { label: "Claude Code through Codex App", value: "claude-code" }
];

const requestLogStatusOptions: Array<{ label: string; value: RequestLogStatusFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "成功", value: "success" },
  { label: "错误", value: "error" }
];

const requestLogPageSizeOptions = [
  { label: "10 / 页", value: "10" },
  { label: "25 / 页", value: "25" },
  { label: "50 / 页", value: "50" },
  { label: "100 / 页", value: "100" }
];

type AddProviderDraft = {
  accountConnectorsText: string;
  accountEnabled: boolean;
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
};

type ProviderProbeCandidate = ProviderPresetEndpoint & {
  source: "custom" | "preset";
};

type ProviderProbeCandidateResult = {
  candidate: ProviderProbeCandidate;
  probe: GatewayProviderProbeResult;
};

type AddApiKeyDraft = {
  expirationPreset: ApiKeyExpirationPreset;
  expiresAt: string;
  limitRows: ApiKeyLimitDraftRow[];
  name: string;
};

type AddProfileDraft = {
  agent: ProfileConfig["agent"];
  cliMiddleware: boolean;
  codexCliPath: string;
  codexHome: string;
  configFormat: CodexProfileConfigFormat;
  configFile: string;
  envRows: KeyValueDraftRow[];
  model: string;
  name: string;
  providerId: string;
  providerName: string;
  remoteFrontendMode: CodexRemoteFrontendMode;
  scope: ProfileScope;
  settingsFile: string;
  smallFastModel: string;
  surface: ProfileSurface;
};

type ApiKeyLimitDraftRow = {
  id: string;
  metric: ApiKeyLimitMetric;
  value: string;
  window: LimitWindowPreset;
};

type ApiKeyLimitMetric = "images" | "requests" | "tokens";
type ApiKeyExpirationPreset = "7d" | "30d" | "90d" | "custom" | "never";
type LimitWindowPreset = "day" | "hour" | "minute";

type ApiKeyListItem = {
  expiresAt?: string;
  index: number;
  key: ApiKeyConfig;
  keyValue: string;
  limits?: ApiKeyLimitConfig;
  masked: string;
  name: string;
};

type AddRoutingRuleDraft = {
  enabled: boolean;
  fallback: RouterFallbackConfig;
  name: string;
  pattern: string;
  target: string;
  threshold: string;
  type: RouterRuleType;
};

type ClaudeDesignRouteRuleType = "always" | "image" | "long-context" | "model" | "model-prefix" | "thinking" | "web-search";

type ClaudeDesignRoutingRuleDraft = {
  enabled: boolean;
  id: string;
  model: string;
  name: string;
  pattern: string;
  target: string;
  threshold: string;
  type: ClaudeDesignRouteRuleType;
};

type ClaudeDesignRoutingDraft = {
  defaultTarget: string;
  enabled: boolean;
  rules: ClaudeDesignRoutingRuleDraft[];
};

type VirtualModelClientToolsPolicy = "allow" | "deny";
type VirtualModelMatchMode = "alias" | "prefix" | "suffix";

type VirtualModelToolDraft = {
  description: string;
  id: string;
  inputSchemaText: string;
  name: string;
  visibility: VirtualModelToolVisibility;
};

type VirtualModelDraft = {
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
  executionMode: VirtualModelExecutionMode;
};

type McpServerDraft = {
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

type KeyValueDraftRow = {
  id: string;
  key: string;
  value: string;
};

type ExtensionInstallDraft = {
  apps?: PluginMarketplaceEntry["apps"];
  dependencies: PluginDependency[];
  key: string;
  marketplaceId: string;
  modulePath: string;
  selectedName: string;
};

type ExtensionSource = "plugins" | "providerPlugins" | "virtualModelProfiles";

type PluginRoutingConfigTarget = {
  index: number;
};

type ExtensionConfigTarget = {
  index: number;
};

type ExtensionDeleteTarget = {
  index: number;
  source: ExtensionSource;
};

type ExtensionListItem = {
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

type ModelCatalogItem = {
  key: string;
  model: string;
};

type PluginInstallCandidate = {
  apps?: PluginMarketplaceEntry["apps"];
  dependencies: PluginDependency[];
  id: string;
  modulePath: string;
  name?: string;
};

type PluginSettingsDraft = {
  appsText: string;
  enabled: boolean;
  modulePath: string;
  configText: string;
};

type RoutingRuleRow = {
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

type PluginRoutingConfigItem = {
  index: number;
  name: string;
};

type AppToast = {
  id: number;
  message: string;
};

type ServerActionBusy = "" | "browser" | "cert" | "proxy" | "claude-app";

function App() {
  const [activeView, setActiveView] = useState<ViewId>("onboarding");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStepId>(() => getDefaultOnboardingStep(fallbackConfig));
  const [appInfo, setAppInfo] = useState<AppInfo>(fallbackInfo);
  const [draftConfig, setDraftConfig] = useState<AppConfig>(fallbackConfig);
  const [configLoaded, setConfigLoaded] = useState(() => !window.ccr);
  const [onboardingStatusLoaded, setOnboardingStatusLoaded] = useState(() => !window.ccr);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>(fallbackGatewayStatus);
  const [proxyCertificateStatus, setProxyCertificateStatus] = useState<ProxyCertificateStatus>(fallbackProxyCertificateStatus);
  const [proxyNetworkSnapshot, setProxyNetworkSnapshot] = useState<ProxyNetworkSnapshot>(fallbackProxyNetworkSnapshot);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>(fallbackProxyStatus);
  const [actionBusy, setActionBusy] = useState<ServerActionBusy>("");
  const [gatewayActionBusy, setGatewayActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [profileActionError, setProfileActionError] = useState("");
  const [profileAddOpen, setProfileAddOpen] = useState(false);
  const [profileAgentTab, setProfileAgentTab] = useState<ProfileConfig["agent"]>("claude-code");
  const [profileDraft, setProfileDraft] = useState<AddProfileDraft>(() => createProfileDraft());
  const [profileEditDraft, setProfileEditDraft] = useState<AddProfileDraft>(() => createProfileDraft());
  const [profileEditIndex, setProfileEditIndex] = useState<number>();
  const [apiKeyAddOpen, setApiKeyAddOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState<AddApiKeyDraft>(() => createApiKeyDraft());
  const [apiKeyEditDraft, setApiKeyEditDraft] = useState<AddApiKeyDraft>(() => createApiKeyDraft());
  const [apiKeyEditIndex, setApiKeyEditIndex] = useState<number>();
  const [apiKeyError, setApiKeyError] = useState("");
  const [providerAddOpen, setProviderAddOpen] = useState(false);
  const [providerDeleteIndex, setProviderDeleteIndex] = useState<number>();
  const [providerEditIndex, setProviderEditIndex] = useState<number>();
  const [providerDraft, setProviderDraft] = useState<AddProviderDraft>(() => createProviderDraft(fallbackConfig.Providers));
  const [providerProbe, setProviderProbe] = useState<GatewayProviderProbeResult>();
  const [providerProbeLoading, setProviderProbeLoading] = useState(false);
  const [providerDeepLinkRequest, setProviderDeepLinkRequest] = useState<ProviderDeepLinkRequest>();
  const [providerDeepLinkBusy, setProviderDeepLinkBusy] = useState(false);
  const [providerDeepLinkError, setProviderDeepLinkError] = useState("");
  const [proxyCertificateChecking, setProxyCertificateChecking] = useState(false);
  const [proxyEnablePending, setProxyEnablePending] = useState(false);
  const [providerProbeError, setProviderProbeError] = useState("");
  const [extensionInstallOpen, setExtensionInstallOpen] = useState(false);
  const [extensionInstallDraft, setExtensionInstallDraft] = useState<ExtensionInstallDraft>(() => createExtensionInstallDraft());
  const [extensionInstallError, setExtensionInstallError] = useState("");
  const [extensionConfigTarget, setExtensionConfigTarget] = useState<ExtensionConfigTarget>();
  const [pluginSettingsDraft, setPluginSettingsDraft] = useState<PluginSettingsDraft>(() => createPluginSettingsDraft());
  const [pluginSettingsError, setPluginSettingsError] = useState("");
  const [pluginRoutingConfigTarget, setPluginRoutingConfigTarget] = useState<PluginRoutingConfigTarget>();
  const [extensionDeleteTarget, setExtensionDeleteTarget] = useState<ExtensionDeleteTarget>();
  const [claudeDesignRoutingDraft, setClaudeDesignRoutingDraft] = useState<ClaudeDesignRoutingDraft>(() => createClaudeDesignRoutingDraft());
  const [cursorProxyRoutingDraft, setCursorProxyRoutingDraft] = useState<ClaudeDesignRoutingDraft>(() => createCursorProxyRoutingDraft());
  const [virtualModelDialogOpen, setVirtualModelDialogOpen] = useState(false);
  const [virtualModelDraft, setVirtualModelDraft] = useState<VirtualModelDraft>(() => createVirtualModelDraft(fallbackConfig));
  const [virtualModelEditIndex, setVirtualModelEditIndex] = useState<number>();
  const [virtualModelError, setVirtualModelError] = useState("");
  const [mcpServerDialogOpen, setMcpServerDialogOpen] = useState(false);
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(() => createMcpServerDraft(fallbackConfig.agent.mcpServers));
  const [mcpServerEditIndex, setMcpServerEditIndex] = useState<number>();
  const [mcpServerError, setMcpServerError] = useState("");
  const [pluginMarketplace, setPluginMarketplace] = useState<PluginMarketplaceEntry[]>([]);
  const [routingAddOpen, setRoutingAddOpen] = useState(false);
  const [routingDeleteIndex, setRoutingDeleteIndex] = useState<number>();
  const [routingEditIndex, setRoutingEditIndex] = useState<number>();
  const [routingRuleDraft, setRoutingRuleDraft] = useState<AddRoutingRuleDraft>(() => createRoutingRuleDraft());
  const [savedConfig, setSavedConfig] = useState<AppConfig>(fallbackConfig);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia("(max-width: 720px)").matches);
  const [toast, setToast] = useState<AppToast>();
  const [languagePreference, setLanguagePreference] = useState<AppLanguagePreference>(() => readLanguagePreference());
  const [systemLanguage, setSystemLanguage] = useState<ResolvedLanguage>(() => detectSystemLanguage());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => detectSystemTheme());
  const [requestLogError, setRequestLogError] = useState("");
  const [requestLogFilter, setRequestLogFilter] = useState<RequestLogListFilter>({
    page: 1,
    pageSize: 25,
    status: "all"
  });
  const [requestLogLoading, setRequestLogLoading] = useState(false);
  const [requestLogPage, setRequestLogPage] = useState<RequestLogPage>(fallbackRequestLogPage);
  const [agentAnalysis, setAgentAnalysis] = useState<AgentAnalysisSnapshot>(fallbackAgentAnalysis);
  const [agentAnalysisAgent, setAgentAnalysisAgent] = useState<AgentFilterValue>("all");
  const [agentAnalysisError, setAgentAnalysisError] = useState("");
  const [agentAnalysisLoading, setAgentAnalysisLoading] = useState(false);
  const [agentAnalysisRange, setAgentAnalysisRange] = useState<UsageStatsRange>("7d");
  const [usageRange, setUsageRange] = useState<UsageStatsRange>("7d");
  const [usageStats, setUsageStats] = useState<UsageStatsSnapshot>(fallbackUsageStats);
  const [providerAccountSnapshots, setProviderAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const resolvedLanguage = languagePreference === "system" ? systemLanguage : languagePreference;
  const copy = appCopy[resolvedLanguage];

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateCompactLayout = () => setCompactLayout(mediaQuery.matches);
    updateCompactLayout();
    mediaQuery.addEventListener("change", updateCompactLayout);
    return () => mediaQuery.removeEventListener("change", updateCompactLayout);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const theme = draftConfig.theme || "system";
    if (theme === "system") {
      root.removeAttribute("data-theme");
      return;
    }

    root.dataset.theme = theme;
  }, [draftConfig.theme]);

  useEffect(() => {
    document.documentElement.lang = resolvedLanguage === "zh" ? "zh-CN" : "en";
  }, [resolvedLanguage]);

  useEffect(() => {
    const updateSystemLanguage = () => setSystemLanguage(detectSystemLanguage());
    window.addEventListener("languagechange", updateSystemLanguage);
    return () => window.removeEventListener("languagechange", updateSystemLanguage);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? "dark" : "light");
    updateSystemTheme();
    mediaQuery.addEventListener("change", updateSystemTheme);
    return () => mediaQuery.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    if (!window.ccr) {
      return;
    }

    void window.ccr.getAppInfo().then(setAppInfo);
    void window.ccr.getConfig()
      .then(syncConfigState)
      .catch(() => {
        // Fall back to the bundled defaults; the rest of the UI can still render.
      })
      .finally(() => setConfigLoaded(true));
    void window.ccr.getOnboardingFinished()
      .then((finished) => setActiveView(finished ? "overview" : "onboarding"))
      .catch(() => setActiveView("onboarding"))
      .finally(() => setOnboardingStatusLoaded(true));
    void window.ccr.getPluginMarketplace().then(setPluginMarketplace).catch(() => setPluginMarketplace([]));
    void window.ccr.getProxyCertificateStatus().then(setProxyCertificateStatus);
    const refreshRuntimeStatus = () => {
      void window.ccr?.getGatewayStatus().then(setGatewayStatus);
      void window.ccr?.getProxyStatus().then(setProxyStatus);
    };
    refreshRuntimeStatus();
    const timer = window.setInterval(refreshRuntimeStatus, 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!window.ccr) {
      return;
    }

    const showProviderDeepLink = (request: ProviderDeepLinkRequest) => {
      setProviderAddOpen(false);
      setProviderEditIndex(undefined);
      setProviderProbe(undefined);
      setProviderProbeError("");
      setProviderProbeLoading(false);
      setProviderDeepLinkRequest(request);
      setProviderDeepLinkError("");
      setProviderDeepLinkBusy(false);
      setActiveView("providers");
    };

    const unsubscribe = window.ccr.onProviderDeepLink(showProviderDeepLink);
    void window.ccr.getPendingProviderDeepLinks()
      .then((requests) => {
        for (const request of requests) {
          showProviderDeepLink(request);
        }
      })
      .catch(() => {
        // Deep links are opportunistic; normal app startup should continue.
      });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.ccr) {
      setUsageStats(createEmptyUsageStats(usageRange));
      return;
    }

    let cancelled = false;
    const refreshUsageStats = () => {
      const filter: UsageStatsFilter | undefined = usageRange === "today" ? { includeProxy: true } : undefined;
      void window.ccr?.getUsageStats(usageRange, filter).then((snapshot) => {
        if (!cancelled) {
          setUsageStats(snapshot);
        }
      });
    };
    refreshUsageStats();
    const timer = window.setInterval(refreshUsageStats, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [usageRange]);

  useEffect(() => {
    if (!window.ccr) {
      setProviderAccountSnapshots([]);
      return;
    }

    let cancelled = false;
    const refreshProviderAccounts = () => {
      void window.ccr?.getProviderAccountSnapshots()
        .then((snapshots) => {
          if (!cancelled) {
            setProviderAccountSnapshots(snapshots);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProviderAccountSnapshots([]);
          }
        });
    };
    refreshProviderAccounts();
    const timer = window.setInterval(refreshProviderAccounts, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [draftConfig.Providers]);

  const agentAnalysisFilterKey = JSON.stringify({ agent: agentAnalysisAgent, range: agentAnalysisRange });

  useEffect(() => {
    if (activeView !== "observability") {
      return;
    }
    if (!window.ccr) {
      setAgentAnalysis(createEmptyAgentAnalysis(agentAnalysisRange));
      return;
    }

    let cancelled = false;
    const refreshAgentAnalysis = (showLoading = false) => {
      if (showLoading) {
        setAgentAnalysisLoading(true);
      }
      void window.ccr?.getAgentAnalysis({ agent: agentAnalysisAgent, range: agentAnalysisRange })
        .then((snapshot) => {
          if (!cancelled) {
            setAgentAnalysis(snapshot);
            setAgentAnalysisError("");
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setAgentAnalysisError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setAgentAnalysisLoading(false);
          }
        });
    };

    refreshAgentAnalysis(true);
    const timer = window.setInterval(() => refreshAgentAnalysis(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeView, agentAnalysisFilterKey]);

  const requestLogFilterKey = JSON.stringify(requestLogFilter);

  useEffect(() => {
    if (activeView !== "logs") {
      return;
    }
    if (!window.ccr) {
      setRequestLogPage(createEmptyRequestLogPage(requestLogFilter));
      return;
    }

    let cancelled = false;
    const refreshRequestLogs = (showLoading = false) => {
      if (showLoading) {
        setRequestLogLoading(true);
      }
      void window.ccr?.getRequestLogs(requestLogFilter)
        .then((page) => {
          if (!cancelled) {
            setRequestLogPage(page);
            setRequestLogError("");
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setRequestLogError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setRequestLogLoading(false);
          }
        });
    };

    refreshRequestLogs(true);
    const timer = window.setInterval(() => refreshRequestLogs(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeView, requestLogFilterKey]);

  useEffect(() => {
    if (activeView !== "networking" || !draftConfig.proxy.captureNetwork) {
      return;
    }
    if (!window.ccr) {
      setProxyNetworkSnapshot(fallbackProxyNetworkSnapshot);
      return;
    }

    let cancelled = false;
    const refreshNetworkCaptures = () => {
      void window.ccr?.getProxyNetworkCaptures().then((snapshot) => {
        if (!cancelled) {
          setProxyNetworkSnapshot(snapshot);
        }
      });
    };
    refreshNetworkCaptures();
    const timer = window.setInterval(refreshNetworkCaptures, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeView, draftConfig.proxy.captureNetwork]);

  const dirty = useMemo(() => formatJson(savedConfig) !== formatJson(draftConfig), [draftConfig, savedConfig]);
  const apiKeys = useMemo(() => createApiKeyList(draftConfig), [draftConfig.APIKEY, draftConfig.APIKEYS]);
  const apiKeyEditItem = apiKeyEditIndex === undefined ? undefined : apiKeys.find((apiKey) => apiKey.index === apiKeyEditIndex);
  const providerDeleteItem = providerDeleteIndex === undefined ? undefined : draftConfig.Providers[providerDeleteIndex];
  const routingDeleteRule = routingDeleteIndex === undefined ? undefined : draftConfig.Router.rules[routingDeleteIndex];
  const extensionDeleteItem = useMemo(() => {
    if (!extensionDeleteTarget) {
      return undefined;
    }
    return buildExtensionList(draftConfig).find((extension) =>
      extension.source === extensionDeleteTarget.source && extension.index === extensionDeleteTarget.index
    );
  }, [draftConfig.plugins, draftConfig.providerPlugins, draftConfig.virtualModelProfiles, extensionDeleteTarget]);
  const extensionConfigItem = useMemo(() => {
    if (!extensionConfigTarget) {
      return undefined;
    }
    return buildExtensionList(draftConfig).find((extension) =>
      extension.source === "plugins" && extension.index === extensionConfigTarget.index
    );
  }, [draftConfig.plugins, extensionConfigTarget]);
  const pluginRoutingConfigItem = useMemo(() => {
    if (!pluginRoutingConfigTarget) {
      return undefined;
    }
    return draftConfig.plugins[pluginRoutingConfigTarget.index];
  }, [draftConfig.plugins, pluginRoutingConfigTarget]);
  const providers = useMemo(() => draftConfig.Providers.map((provider, index) => ({ provider, index })), [draftConfig.Providers]);
  const gatewayEndpoint = gatewayStatus.endpoint || draftConfig.routerEndpoint;
  const networkCaptureEnabled = draftConfig.proxy.enabled && draftConfig.proxy.captureNetwork;
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => item.id !== "networking" || networkCaptureEnabled),
    [networkCaptureEnabled]
  );
  const autoSaveRequestId = useRef(0);
  const providerProbeRequestId = useRef(0);
  const toastTimer = useRef<number>();

  const shouldReduceMotion = useReducedMotion();
  const isMac = isMacPlatform(appInfo.platform);
  const needsTrafficLightSafeArea = isMac && !sidebarOpen;
  const providerTypedModels = splitLines(providerDraft.modelsText);
  const providerDialogModels = mergeProviderModelLists(providerDraft.selectedModels, providerTypedModels);
  const providerFormActive = providerAddOpen || (activeView === "onboarding" && onboardingStep === "provider");
  const canSubmitProvider =
    Boolean(providerDraft.name.trim() && providerDraft.baseUrl.trim()) &&
    providerDialogModels.length > 0;
  const canSubmitProfile = isProfileDraftSubmittable(profileDraft);
  const canSubmitProfileEdit = profileEditIndex !== undefined && isProfileDraftSubmittable(profileEditDraft);
  const canSubmitApiKey = Boolean(apiKeyDraft.name.trim()) && (apiKeyDraft.expirationPreset !== "custom" || Boolean(apiKeyDraft.expiresAt.trim()));
  const canSubmitApiKeyEdit = apiKeyEditDraft.expirationPreset !== "custom" || Boolean(apiKeyEditDraft.expiresAt.trim());
  const canSubmitRoutingRule =
    Boolean(routingRuleDraft.name.trim()) &&
    (routingRuleDraft.type === "subagent" || Boolean(routingRuleDraft.target.trim())) &&
    (routingRuleDraft.type !== "model-prefix" || Boolean(routingRuleDraft.pattern.trim()));
  const canSubmitClaudeDesignRouting = isClaudeDesignRoutingDraftValid(claudeDesignRoutingDraft);
  const canSubmitCursorProxyRouting = isClaudeDesignRoutingDraftValid(cursorProxyRoutingDraft);
  const virtualModelValidationError = useMemo(() => validateVirtualModelDraft(virtualModelDraft), [virtualModelDraft]);
  const canSubmitVirtualModel = !virtualModelValidationError;
  const canInstallExtension = Boolean(extensionInstallDraft.key.trim() && extensionInstallDraft.modulePath.trim());

  useEffect(() => {
    if (!networkCaptureEnabled && activeView === "networking") {
      setActiveView("server");
    }
  }, [activeView, networkCaptureEnabled]);

  useEffect(() => {
    if (activeView !== "onboarding" || !configLoaded || !onboardingStatusLoaded) {
      return;
    }
    const defaultStep = getDefaultOnboardingStep(draftConfig);
    const defaultIndex = onboardingStepOrder.indexOf(defaultStep);
    setOnboardingStep((current) => {
      const currentIndex = onboardingStepOrder.indexOf(current);
      return defaultIndex > currentIndex ? defaultStep : current;
    });
  }, [activeView, configLoaded, onboardingStatusLoaded, draftConfig]);

  useEffect(() => {
    if (activeView !== "onboarding" || !configLoaded || !onboardingStatusLoaded || providerAddOpen) {
      return;
    }

    const providerIndex = draftConfig.Providers.findIndex((provider) => provider.name === draftConfig.preferredProvider);
    const resolvedIndex = providerIndex >= 0 ? providerIndex : draftConfig.Providers.length > 0 ? 0 : -1;
    const provider = resolvedIndex >= 0 ? draftConfig.Providers[resolvedIndex] : undefined;
    if (!provider) {
      setProviderEditIndex(undefined);
      return;
    }

    setProviderEditIndex(resolvedIndex);
    setProviderDraft(createProviderDraftFromProvider(provider));
    setProviderProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
  }, [activeView, configLoaded, onboardingStatusLoaded, draftConfig.Providers, draftConfig.preferredProvider, providerAddOpen]);

  useEffect(() => () => {
    if (toastTimer.current !== undefined) {
      window.clearTimeout(toastTimer.current);
    }
  }, []);

  useEffect(() => {
    providerProbeRequestId.current += 1;
    const requestId = providerProbeRequestId.current;
    const candidates = providerProbeCandidates(providerDraft).filter(isProviderProbeCandidateReady);

    if (!providerFormActive || !window.ccr || candidates.length === 0) {
      setProviderProbeLoading(false);
      return;
    }

    const apiKey = providerDraft.apiKey.trim();
    const models = splitLines(providerDraft.modelsText);
    const inputKey = providerProbeInputKey(candidates, apiKey, models);
    setProviderProbeLoading(true);
    const timer = window.setTimeout(() => {
      void probeProviderCandidates(candidates, apiKey, models)
        .then((result) => {
          if (providerProbeRequestId.current !== requestId) {
            return;
          }
          if (!result) {
            return;
          }
          setProviderProbe(result.probe);
          setProviderDraft((current) => {
            const currentCandidates = providerProbeCandidates(current).filter(isProviderProbeCandidateReady);
            const currentKey = providerProbeInputKey(currentCandidates, current.apiKey.trim(), splitLines(current.modelsText));
            if (currentKey !== inputKey) {
              return current;
            }
            return applyProviderProbeResult(current, result.probe);
          });
        })
        .catch(() => {
          // Background probing is best-effort. Manual model entry remains the fallback.
        })
        .finally(() => {
          if (providerProbeRequestId.current === requestId) {
            setProviderProbeLoading(false);
          }
        });
    }, providerAutoProbeDelayMs);

    return () => {
      window.clearTimeout(timer);
      setProviderProbeLoading(false);
    };
  }, [providerFormActive, providerDraft.apiKey, providerDraft.baseUrl, providerDraft.modelsText, providerDraft.presetId]);

  useEffect(() => {
    if (!window.ccr || !dirty) {
      return;
    }

    const requestId = autoSaveRequestId.current + 1;
    autoSaveRequestId.current = requestId;
    const configToSave = draftConfig;
    const timer = window.setTimeout(() => {
      void window.ccr?.saveConfig(configToSave)
        .then((saved) => {
          if (autoSaveRequestId.current === requestId) {
            syncConfigState(saved);
            setActionError("");
          }
        })
        .catch((error) => {
          if (autoSaveRequestId.current === requestId) {
            setActionError(error instanceof Error ? error.message : String(error));
          }
        });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [dirty, draftConfig]);

  function syncConfigState(config: AppConfig) {
    const normalized = normalizeConfig(config);
    setSavedConfig(normalized);
    setDraftConfig(normalized);
  }

  function showToast(message: string) {
    if (toastTimer.current !== undefined) {
      window.clearTimeout(toastTimer.current);
    }
    setToast({ id: Date.now(), message });
    toastTimer.current = window.setTimeout(() => {
      setToast(undefined);
      toastTimer.current = undefined;
    }, 1800);
  }

  function updateConfig(mutator: (config: AppConfig) => AppConfig) {
    setDraftConfig((current) => {
      const next = normalizeConfig(mutator(cloneConfig(current)));
      return next;
    });
  }

  function buildConfigUpdate(mutator: (config: AppConfig) => AppConfig): AppConfig {
    return normalizeConfig(mutator(cloneConfig(draftConfig)));
  }

  function setConfigDraft(config: AppConfig): AppConfig {
    const normalized = normalizeConfig(config);
    setDraftConfig(normalized);
    return normalized;
  }

  async function persistConfig(config: AppConfig, setError: (message: string) => void): Promise<boolean> {
    autoSaveRequestId.current += 1;
    if (!window.ccr) {
      syncConfigState(config);
      return true;
    }

    try {
      const saved = await window.ccr.saveConfig(config);
      syncConfigState(saved);
      setError("");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function persistApiKeys(apiKeys: ApiKeyConfig[], setError: (message: string) => void): Promise<boolean> {
    if (!window.ccr) {
      setError("API key persistence is only available in the Electron app.");
      return false;
    }

    try {
      if (!window.ccr.saveApiKeys) {
        throw new Error("This app build does not expose API key persistence. Rebuild and restart the Electron app.");
      }
      const saved = await window.ccr.saveApiKeys(apiKeys);
      syncConfigState(saved);
      setError("");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  function openAddApiKeyDialog() {
    setApiKeyDraft(createApiKeyDraft());
    setApiKeyError("");
    setApiKeyAddOpen(true);
  }

  function updateApiKeyDraft(patch: Partial<AddApiKeyDraft>) {
    setApiKeyDraft((current) => ({ ...current, ...patch }));
    setApiKeyError("");
  }

  function openEditApiKeyDialog(index: number) {
    const apiKey = apiKeys.find((item) => item.index === index);
    if (!apiKey) {
      return;
    }
    setApiKeyEditIndex(index);
    setApiKeyEditDraft(createApiKeyEditDraft(apiKey.key));
    setApiKeyError("");
  }

  function updateApiKeyEditDraft(patch: Partial<AddApiKeyDraft>) {
    setApiKeyEditDraft((current) => ({ ...current, ...patch }));
    setApiKeyError("");
  }

  async function submitApiKeyDraft() {
    if (!apiKeyDraft.name.trim()) {
      setApiKeyError("Name is required.");
      return;
    }
    if (!canSubmitApiKey) {
      setApiKeyError("Expiration is required.");
      return;
    }
    const apiKey = createGeneratedApiKey(apiKeyDraft);

    const next = buildConfigUpdate((config) => {
      const keys = normalizeApiKeys([...config.APIKEYS, apiKey], config.APIKEY);
      config.APIKEYS = keys;
      config.APIKEY = keys[0]?.key ?? "";
      return config;
    });
    setConfigDraft(next);
    if (await persistApiKeys(next.APIKEYS, setApiKeyError)) {
      setApiKeyAddOpen(false);
    }
  }

  async function submitApiKeyEditDraft() {
    if (apiKeyEditIndex === undefined) {
      return;
    }
    if (!canSubmitApiKeyEdit) {
      setApiKeyError("Expiration is required.");
      return;
    }

    const next = buildConfigUpdate((config) => {
      const keys = normalizeApiKeys(config.APIKEYS, config.APIKEY).map((apiKey, index) =>
        index === apiKeyEditIndex ? updateApiKeyEditableConfig(apiKey, apiKeyEditDraft) : apiKey
      );
      config.APIKEYS = keys;
      config.APIKEY = keys[0]?.key ?? "";
      return config;
    });
    setConfigDraft(next);
    if (await persistApiKeys(next.APIKEYS, setApiKeyError)) {
      setApiKeyEditIndex(undefined);
    }
  }

  async function removeApiKey(index: number) {
    const next = buildConfigUpdate((config) => {
      const keys = normalizeApiKeys(config.APIKEYS, config.APIKEY).filter((_, itemIndex) => itemIndex !== index);
      config.APIKEYS = keys;
      config.APIKEY = keys[0]?.key ?? "";
      return config;
    });
    setConfigDraft(next);
    await persistApiKeys(next.APIKEYS, setApiKeyError);
  }

  function openAddProviderDialog() {
    setProviderEditIndex(undefined);
    setProviderDraft(createProviderDraft(draftConfig.Providers));
    setProviderProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
    setProviderAddOpen(true);
  }

  function openEditProviderDialog(index: number) {
    const provider = draftConfig.Providers[index];
    if (!provider) {
      return;
    }
    setProviderEditIndex(index);
    setProviderDraft(createProviderDraftFromProvider(provider));
    setProviderProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
    setProviderAddOpen(true);
  }

  function updateProviderDraft(patch: Partial<AddProviderDraft>, resetProbe = false) {
    setProviderDraft((current) => {
      const next = { ...current, ...patch };
      if (!resetProbe) {
        return next;
      }
      if (patch.selectedModels !== undefined) {
        return next;
      }

      return {
        ...next,
        modelsText: mergeProviderModelLists(current.selectedModels, splitLines(next.modelsText)).join("\n"),
        selectedModels: []
      };
    });
    setProviderProbeError("");
    if (resetProbe) {
      setProviderProbe(undefined);
      setProviderProbeLoading(false);
    }
  }

  async function checkProviderDraft(): Promise<void> {
    providerProbeRequestId.current += 1;
    const requestId = providerProbeRequestId.current;
    const baseUrl = providerDraft.baseUrl.trim();
    const protocol = providerDraft.protocol;
    const apiKey = providerDraft.apiKey.trim();
    const model = firstProviderConnectivityModel(providerDraft);
    const inputKey = JSON.stringify([baseUrl, protocol, apiKey, model]);

    setProviderProbeError("");
    if (!window.ccr) {
      setProviderProbeError("Request failed.");
      return;
    }
    if (!shouldAutoProbeProviderBaseUrl(baseUrl)) {
      setProviderProbeError("No endpoint candidates available.");
      return;
    }
    if (!model) {
      setProviderProbeError("Select or enter at least one model.");
      return;
    }

    setProviderProbeLoading(true);
    try {
      const probe = await window.ccr.probeProvider({
        apiKey,
        baseUrl,
        models: [model],
        protocols: [protocol],
        skipModelDiscovery: true
      });
      if (providerProbeRequestId.current !== requestId) {
        return;
      }

      setProviderProbe(probe);
      setProviderDraft((current) => {
        const currentKey = JSON.stringify([
          current.baseUrl.trim(),
          current.protocol,
          current.apiKey.trim(),
          firstProviderConnectivityModel(current)
        ]);
        if (currentKey !== inputKey) {
          return current;
        }
        return applyProviderProbeResult(current, probe);
      });

      if (!providerProbeHasSupportedProtocol(probe, protocol)) {
        const message = probe.protocols.find((item) => item.protocol === protocol)?.message || "Request failed.";
        setProviderProbeError(message);
      }
    } catch (error) {
      if (providerProbeRequestId.current === requestId) {
        setProviderProbe(undefined);
        setProviderProbeError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (providerProbeRequestId.current === requestId) {
        setProviderProbeLoading(false);
      }
    }
  }

  async function submitProviderDraft(): Promise<boolean> {
    const probe = providerProbe;

    const usesCatalog = Boolean(probe?.models.length);
    const typedModels = splitLines(providerDraft.modelsText);
    const models = mergeProviderModelLists(providerDraft.selectedModels, typedModels);
    if (models.length === 0) {
      setProviderProbeError(usesCatalog ? "Select or enter at least one model." : "Enter at least one model.");
      return false;
    }

    const providerName = providerDraft.name.trim();
    if (isProviderNameDuplicate(draftConfig.Providers, providerName, providerEditIndex)) {
      setProviderProbeError("Provider name already exists.");
      return false;
    }

    const accountConfig = parseProviderAccountDraft(providerDraft);
    if (typeof accountConfig === "string") {
      setProviderProbeError(accountConfig);
      return false;
    }

    const protocol = probe?.detectedProtocol ?? providerDraft.protocol;
    const baseUrl = probe?.normalizedBaseUrl || providerDraft.baseUrl;
    const capabilities = mergeProviderCapabilities(
      presetCapabilitiesFromDraft(providerDraft),
      probe?.capabilities ?? [],
      protocol && baseUrl ? [{ baseUrl, source: probe?.detectedProtocol ? "detected" : "preset", type: protocol }] : []
    );
    const provider: GatewayProviderConfig = {
      api_base_url: normalizeProviderBaseUrl(baseUrl, protocol),
      api_key: providerDraft.apiKey.trim(),
      capabilities: capabilities.length > 0 ? capabilities : undefined,
      account: accountConfig,
      icon: providerDraft.icon.trim() || undefined,
      models,
      name: providerName,
      type: protocol
    };

    const next = buildConfigUpdate((config) => {
      if (providerEditIndex === undefined) {
        config.Providers.push(provider);
      } else {
        config.Providers[providerEditIndex] = provider;
      }
      if (!config.preferredProvider) {
        config.preferredProvider = provider.name;
      }
      return config;
    });
    setConfigDraft(next);
    if (await persistConfig(next, setProviderProbeError)) {
      setProviderEditIndex(undefined);
      setProviderAddOpen(false);
      if (activeView === "onboarding") {
        setOnboardingStep(getDefaultOnboardingStep(next));
      }
      return true;
    }
    return false;
  }

  async function confirmProviderDeepLinkImport() {
    const request = providerDeepLinkRequest;
    const payload = request?.provider;
    if (!payload || providerDeepLinkBusy) {
      return;
    }

    setProviderDeepLinkBusy(true);
    setProviderDeepLinkError("");
    try {
      const probe = await probeProviderDeepLinkPayload(payload);
      let importedProviderName = payload.name?.trim() || "";
      const next = buildConfigUpdate((config) => {
        const replaceIndex = payload.replaceExisting
          ? findProviderDeepLinkReplacementIndex(config.Providers, payload, probe?.normalizedBaseUrl || payload.baseUrl)
          : -1;
        const provider = createProviderConfigFromDeepLink(payload, config.Providers, probe, replaceIndex);
        importedProviderName = provider.name;
        if (replaceIndex >= 0) {
          config.Providers[replaceIndex] = provider;
        } else {
          config.Providers.push(provider);
        }
        if (payload.setDefault || !config.preferredProvider) {
          config.preferredProvider = provider.name;
        }
        return config;
      });
      setConfigDraft(next);
      const saved = await persistConfig(next, setProviderDeepLinkError);
      setProviderDeepLinkBusy(false);
      if (saved) {
        setProviderDeepLinkRequest(undefined);
        showToast(`${copy.text["Imported provider"] ?? "Imported provider"} ${importedProviderName}`.trim());
        if (activeView === "onboarding") {
          setOnboardingStep(getDefaultOnboardingStep(next));
        }
      }
    } catch (error) {
      setProviderDeepLinkError(error instanceof Error ? error.message : String(error));
      setProviderDeepLinkBusy(false);
    }
  }

  async function removeProvider(index: number): Promise<boolean> {
    const next = buildConfigUpdate((config) => {
      config.Providers.splice(index, 1);
      return config;
    });
    setConfigDraft(next);
    return persistConfig(next, setActionError);
  }

  async function confirmProviderDelete() {
    if (providerDeleteIndex === undefined) {
      return;
    }
    const index = providerDeleteIndex;
    if (await removeProvider(index)) {
      setProviderDeleteIndex(undefined);
    }
  }

  function openAddRoutingRuleDialog() {
    setRoutingEditIndex(undefined);
    setRoutingRuleDraft(createRoutingRuleDraft(draftConfig));
    setRoutingAddOpen(true);
  }

  function openEditRoutingRuleDialog(index: number) {
    const rule = draftConfig.Router.rules[index];
    if (!rule) {
      return;
    }
    setRoutingEditIndex(index);
    setRoutingRuleDraft(createRoutingRuleDraftFromRule(rule, draftConfig));
    setRoutingAddOpen(true);
  }

  function updateRoutingRuleDraft(patch: Partial<AddRoutingRuleDraft>) {
    setRoutingRuleDraft((current) => ({ ...current, ...patch }));
  }

  function submitRoutingRuleDraft() {
    if (!canSubmitRoutingRule) {
      return;
    }

    const threshold = numberValue(routingRuleDraft.threshold);
    const rule: RouterRule = {
      enabled: routingRuleDraft.enabled,
      fallback: normalizeRouterFallbackConfig(routingRuleDraft.fallback),
      id: uniqueRoutingRuleId(draftConfig.Router.rules),
      name: routingRuleDraft.name.trim(),
      ...(routingRuleDraft.pattern.trim() ? { pattern: routingRuleDraft.pattern.trim() } : {}),
      ...(routingRuleDraft.target.trim() && routingRuleDraft.type !== "subagent" ? { target: routingRuleDraft.target.trim() } : {}),
      ...(threshold > 0 ? { threshold } : {}),
      type: routingRuleDraft.type
    };

    updateConfig((config) => {
      if (routingEditIndex === undefined) {
        config.Router.rules = [...config.Router.rules, rule];
      } else {
        config.Router.rules[routingEditIndex] = {
          ...rule,
          id: config.Router.rules[routingEditIndex]?.id ?? rule.id
        };
      }
      return config;
    });
    setRoutingEditIndex(undefined);
    setRoutingAddOpen(false);
  }

  function updateRoutingRule(index: number, patch: Partial<RouterRule>) {
    updateConfig((config) => {
      config.Router.rules = config.Router.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      );
      return config;
    });
  }

  function moveRoutingRule(index: number, direction: -1 | 1) {
    updateConfig((config) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= config.Router.rules.length) {
        return config;
      }
      const rules = [...config.Router.rules];
      const [rule] = rules.splice(index, 1);
      rules.splice(nextIndex, 0, rule);
      config.Router.rules = rules;
      return config;
    });
  }

  function removeRoutingRule(index: number) {
    updateConfig((config) => {
      config.Router.rules.splice(index, 1);
      return config;
    });
  }

  function confirmRoutingRuleDelete() {
    if (routingDeleteIndex === undefined) {
      return;
    }
    removeRoutingRule(routingDeleteIndex);
    setRoutingDeleteIndex(undefined);
  }

  function openAddVirtualModelDialog() {
    setVirtualModelEditIndex(undefined);
    setVirtualModelDraft(createVirtualModelDraft(draftConfig));
    setVirtualModelError("");
    setVirtualModelDialogOpen(true);
  }

  function openEditVirtualModelDialog(index: number) {
    const profile = draftConfig.virtualModelProfiles?.[index];
    if (!profile) {
      return;
    }
    setVirtualModelEditIndex(index);
    setVirtualModelDraft(createVirtualModelDraftFromProfile(profile));
    setVirtualModelError("");
    setVirtualModelDialogOpen(true);
  }

  function updateVirtualModelDraft(patch: Partial<VirtualModelDraft>) {
    setVirtualModelDraft((current) => normalizeVirtualModelDraftPatch(current, patch));
    setVirtualModelError("");
  }

  function submitVirtualModelDraft() {
    if (virtualModelValidationError) {
      setVirtualModelError(virtualModelValidationError);
      return;
    }

    updateConfig((config) => {
      const values = [...(config.virtualModelProfiles ?? [])];
      const profile = virtualModelProfileFromDraft(virtualModelDraft, values, virtualModelEditIndex);
      if (virtualModelEditIndex === undefined) {
        values.push(profile);
      } else {
        values[virtualModelEditIndex] = profile;
      }
      config.virtualModelProfiles = values;
      return config;
    });
    setVirtualModelEditIndex(undefined);
    setVirtualModelDialogOpen(false);
    setVirtualModelError("");
  }

  function setVirtualModelEnabled(index: number, enabled: boolean) {
    updateConfig((config) => {
      const values = [...(config.virtualModelProfiles ?? [])];
      const item = values[index];
      if (!item) {
        return config;
      }
      values[index] = { ...item, enabled };
      config.virtualModelProfiles = values;
      return config;
    });
  }

  function removeVirtualModel(index: number) {
    updateConfig((config) => {
      config.virtualModelProfiles = (config.virtualModelProfiles ?? []).filter((_, itemIndex) => itemIndex !== index);
      return config;
    });
  }

  function openAddMcpServerDialog() {
    setMcpServerEditIndex(undefined);
    setMcpServerDraft(createMcpServerDraft(draftConfig.agent.mcpServers));
    setMcpServerError("");
    setMcpServerDialogOpen(true);
  }

  function openEditMcpServerDialog(index: number) {
    const server = draftConfig.agent.mcpServers[index];
    if (!server) {
      return;
    }
    setMcpServerEditIndex(index);
    setMcpServerDraft(createMcpServerDraftFromConfig(server));
    setMcpServerError("");
    setMcpServerDialogOpen(true);
  }

  function updateMcpServerDraft(patch: Partial<McpServerDraft>) {
    setMcpServerDraft((current) => ({ ...current, ...patch }));
    setMcpServerError("");
  }

  function submitMcpServerDraft() {
    const validationError = validateMcpServerDraft(mcpServerDraft);
    if (validationError) {
      setMcpServerError(validationError);
      return;
    }

    updateConfig((config) => {
      const values = [...config.agent.mcpServers];
      const server = mcpServerConfigFromDraft(mcpServerDraft, values, mcpServerEditIndex);
      if (mcpServerEditIndex === undefined) {
        values.push(server);
      } else {
        values[mcpServerEditIndex] = server;
      }
      config.agent = { ...config.agent, mcpServers: values };
      return config;
    });
    setMcpServerEditIndex(undefined);
    setMcpServerDialogOpen(false);
    setMcpServerError("");
  }

  function removeMcpServer(index: number) {
    updateConfig((config) => {
      config.agent = {
        ...config.agent,
        mcpServers: config.agent.mcpServers.filter((_, itemIndex) => itemIndex !== index)
      };
      return config;
    });
  }

  function openInstallExtensionDialog() {
    setExtensionInstallDraft(createExtensionInstallDraft());
    setExtensionInstallError("");
    setExtensionInstallOpen(true);
  }

  function updateExtensionInstallDraft(patch: Partial<ExtensionInstallDraft>) {
    setExtensionInstallError("");
    setExtensionInstallDraft((current) => ({ ...current, ...patch }));
  }

  async function chooseLocalExtensionDirectory() {
    if (!window.ccr?.selectPluginDirectory) {
      setActionError("Local plugin selection is available in the Electron app.");
      return;
    }

    try {
      const selection = await window.ccr.selectPluginDirectory();
      if (!selection) {
        return;
      }
      setExtensionInstallDraft((current) => ({
        ...current,
        apps: selection.apps,
        dependencies: selection.dependencies,
        key: selection.id,
        marketplaceId: "",
        modulePath: selection.modulePath,
        selectedName: selection.name || selection.id
      }));
      setExtensionInstallError("");
      setActionError("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  function submitExtensionInstallDraft() {
    if (!canInstallExtension) {
      return;
    }

    const installPlan = resolvePluginInstallPlan(
      {
        apps: extensionInstallDraft.apps,
        dependencies: extensionInstallDraft.dependencies,
        id: extensionInstallDraft.key.trim(),
        modulePath: extensionInstallDraft.modulePath.trim(),
        name: extensionInstallDraft.selectedName
      },
      pluginMarketplace,
      draftConfig.plugins ?? []
    );
    if (installPlan.missing.length > 0) {
      setExtensionInstallError(`Missing plugin dependencies: ${installPlan.missing.join(", ")}`);
      return;
    }

    updateConfig((config) => {
      const existingIds = new Set((config.plugins ?? []).map((plugin) => plugin.id));
      const pluginsToAdd = installPlan.items
        .filter((item) => !existingIds.has(item.id))
        .map((item) => ({
          ...(item.apps?.length ? { apps: item.apps } : {}),
          enabled: true,
          id: item.id,
          module: item.modulePath
        }));
      config.plugins = [...(config.plugins ?? []), ...pluginsToAdd];
      return config;
    });
    setActionError("");
    setExtensionInstallError("");

    setExtensionInstallOpen(false);
  }

  function removeExtension(source: ExtensionSource, index: number) {
    updateConfig((config) => {
      if (source === "plugins") {
        config.plugins = (config.plugins ?? []).filter((_, itemIndex) => itemIndex !== index);
      } else if (source === "providerPlugins") {
        config.providerPlugins = (config.providerPlugins ?? []).filter((_, itemIndex) => itemIndex !== index);
      } else {
        config.virtualModelProfiles = (config.virtualModelProfiles ?? []).filter((_, itemIndex) => itemIndex !== index);
      }
      return config;
    });
  }

  function confirmExtensionDelete() {
    if (!extensionDeleteTarget) {
      return;
    }
    removeExtension(extensionDeleteTarget.source, extensionDeleteTarget.index);
    setExtensionDeleteTarget(undefined);
  }

  function openConfigureExtension(source: ExtensionSource, index: number) {
    if (source !== "plugins") {
      return;
    }
    const item = draftConfig.plugins[index];
    if (!item) {
      return;
    }
    setPluginSettingsDraft(createPluginSettingsDraft(item));
    setPluginSettingsError("");
    setExtensionConfigTarget({ index });
  }

  function updatePluginSettingsDraft(patch: Partial<PluginSettingsDraft>) {
    setPluginSettingsDraft((current) => ({ ...current, ...patch }));
    setPluginSettingsError("");
  }

  function submitPluginSettingsDraft() {
    if (!extensionConfigTarget) {
      return;
    }

    const appsResult = parsePluginAppsSettingsText(pluginSettingsDraft.appsText);
    if (!appsResult.ok) {
      setPluginSettingsError(appsResult.message);
      return;
    }

    const configResult = parsePluginConfigSettingsText(pluginSettingsDraft.configText);
    if (!configResult.ok) {
      setPluginSettingsError(configResult.message);
      return;
    }

    updateConfig((config) => {
      const values = [...(config.plugins ?? [])];
      const item = values[extensionConfigTarget.index];
      if (!item) {
        return config;
      }
      const nextConfig = pluginSettingsConfigFromDraft(item.config, configResult.value);
      values[extensionConfigTarget.index] = {
        ...item,
        ...(appsResult.value && appsResult.value.length > 0 ? { apps: appsResult.value } : { apps: undefined }),
        config: nextConfig,
        enabled: pluginSettingsDraft.enabled,
        module: pluginSettingsDraft.modulePath.trim()
      };
      config.plugins = values;
      return config;
    });
    setExtensionConfigTarget(undefined);
    setPluginSettingsError("");
  }

  function openConfigurePluginRouting(index: number) {
    const item = draftConfig.plugins[index];
    if (!item) {
      return;
    }
    if (isClaudeDesignPluginConfig(item)) {
      setClaudeDesignRoutingDraft(createClaudeDesignRoutingDraft(item.config));
    } else if (isCursorProxyPluginConfig(item)) {
      setCursorProxyRoutingDraft(createCursorProxyRoutingDraft(item.config));
    } else {
      return;
    }
    setPluginRoutingConfigTarget({ index });
  }

  function updateClaudeDesignRoutingDraft(patch: Partial<ClaudeDesignRoutingDraft>) {
    setClaudeDesignRoutingDraft((current) => ({ ...current, ...patch }));
  }

  function addClaudeDesignRoutingRule() {
    setClaudeDesignRoutingDraft((current) => ({
      ...current,
      rules: [...current.rules, createClaudeDesignRoutingRuleDraft(current.rules)]
    }));
  }

  function updateClaudeDesignRoutingRule(index: number, patch: Partial<ClaudeDesignRoutingRuleDraft>) {
    setClaudeDesignRoutingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule)
    }));
  }

  function removeClaudeDesignRoutingRule(index: number) {
    setClaudeDesignRoutingDraft((current) => ({
      ...current,
      rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index)
    }));
  }

  function submitClaudeDesignRoutingDraft() {
    if (!pluginRoutingConfigTarget || !canSubmitClaudeDesignRouting) {
      return;
    }

    updateConfig((config) => {
      const values = [...(config.plugins ?? [])];
      const item = values[pluginRoutingConfigTarget.index];
      if (!item || !isClaudeDesignPluginConfig(item)) {
        return config;
      }

      const configRecord = isPlainRecord(item.config) ? { ...item.config } : {};
      values[pluginRoutingConfigTarget.index] = {
        ...item,
        config: {
          ...configRecord,
          routing: claudeDesignRoutingConfigFromDraft(claudeDesignRoutingDraft)
        }
      };
      config.plugins = values;
      return config;
    });
    setPluginRoutingConfigTarget(undefined);
  }

  function updateCursorProxyRoutingDraft(patch: Partial<ClaudeDesignRoutingDraft>) {
    setCursorProxyRoutingDraft((current) => ({ ...current, ...patch }));
  }

  function addCursorProxyRoutingRule() {
    setCursorProxyRoutingDraft((current) => ({
      ...current,
      rules: [...current.rules, createCursorProxyRoutingRuleDraft(current.rules)]
    }));
  }

  function updateCursorProxyRoutingRule(index: number, patch: Partial<ClaudeDesignRoutingRuleDraft>) {
    setCursorProxyRoutingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule)
    }));
  }

  function removeCursorProxyRoutingRule(index: number) {
    setCursorProxyRoutingDraft((current) => ({
      ...current,
      rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index)
    }));
  }

  function submitCursorProxyRoutingDraft() {
    if (!pluginRoutingConfigTarget || !canSubmitCursorProxyRouting) {
      return;
    }

    updateConfig((config) => {
      const values = [...(config.plugins ?? [])];
      const item = values[pluginRoutingConfigTarget.index];
      if (!item || !isCursorProxyPluginConfig(item)) {
        return config;
      }

      const configRecord = isPlainRecord(item.config) ? { ...item.config } : {};
      values[pluginRoutingConfigTarget.index] = {
        ...item,
        config: {
          ...configRecord,
          routing: claudeDesignRoutingConfigFromDraft(cursorProxyRoutingDraft)
        }
      };
      config.plugins = values;
      return config;
    });
    setPluginRoutingConfigTarget(undefined);
  }

  function setExtensionEnabled(source: ExtensionSource, index: number, enabled: boolean) {
    updateConfig((config) => {
      if (source === "plugins") {
        const values = [...(config.plugins ?? [])];
        const item = values[index];
        if (!item) {
          return config;
        }
        values[index] = { ...item, enabled };
        config.plugins = values;
        return config;
      }

      if (source === "providerPlugins") {
        const values = [...(config.providerPlugins ?? [])];
        const item = values[index];
        if (!isPlainRecord(item)) {
          return config;
        }
        values[index] = { ...item, enabled };
        config.providerPlugins = values;
        return config;
      }

      const values = [...(config.virtualModelProfiles ?? [])];
      const item = values[index];
      if (!item) {
        return config;
      }
      values[index] = { ...item, enabled };
      config.virtualModelProfiles = values;
      return config;
    });
  }

  function changeThemePreference(value: string) {
    const theme = normalizeThemePreference(value);
    updateConfig((config) => ({
      ...config,
      theme
    }));
  }

  function changeTrayIconPreference(value: string) {
    const trayIcon = normalizeTrayIconPreference(value);
    updateConfig((config) => ({
      ...config,
      trayIcon
    }));
  }

  function changeTrayProgressTargetTokens(value: string) {
    const trayProgressTargetTokens = normalizeTrayProgressTargetTokens(value);
    updateConfig((config) => ({
      ...config,
      trayProgressTargetTokens
    }));
  }

  function setTrayWindowModuleEnabled(moduleId: TrayWindowModuleId, enabled: boolean) {
    updateConfig((config) => {
      const modules = normalizeTrayWindowModules(config.trayWindowModules);
      const nextModules = enabled
        ? [...modules, moduleId]
        : modules.filter((item) => item !== moduleId);
      return {
        ...config,
        trayWindowModules: normalizeTrayWindowModules(nextModules)
      };
    });
  }

  function changeLanguagePreference(value: string) {
    const language = normalizeLanguagePreference(value);
    setLanguagePreference(language);
    persistLanguagePreference(language);
  }

  async function restartProxy() {
    if (!window.ccr) {
      setActionError("Proxy restart is available in the Electron app.");
      return;
    }

    setActionBusy("proxy");
    setActionError("");
    setActionMessage("");
    try {
      const status = await window.ccr.restartProxy();
      setProxyStatus(status);
      setActionMessage(proxyRestartMessage(status));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy("");
    }
  }

  async function openBuiltInBrowser() {
    if (!window.ccr?.openBuiltInBrowser) {
      setActionError("APPs are available in the Electron app.");
      return;
    }

    setActionBusy("browser");
    setActionError("");
    setActionMessage("");
    try {
      if (dirty && !(await persistConfig(draftConfig, setActionError))) {
        return;
      }
      await window.ccr.openBuiltInBrowser();
      const status = await window.ccr.getProxyStatus();
      setProxyStatus(status);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy("");
    }
  }

  async function applyClaudeAppGateway() {
    if (!window.ccr?.applyClaudeAppGateway) {
      setActionError("Claude App setup is available in the Electron app.");
      return;
    }

    autoSaveRequestId.current += 1;
    setActionBusy("claude-app");
    setActionError("");
    setActionMessage("");
    try {
      const result = await window.ccr.applyClaudeAppGateway(draftConfig);
      const [saved, status, nextProxyStatus] = await Promise.all([
        window.ccr.getConfig(),
        window.ccr.getGatewayStatus(),
        window.ccr.getProxyStatus()
      ]);
      syncConfigState(saved);
      setGatewayStatus(status);
      setProxyStatus(nextProxyStatus);
      setActionMessage(result.message);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy("");
    }
  }

  async function completeOnboarding() {
    if (window.ccr) {
      try {
        await window.ccr.setOnboardingFinished();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    setActiveView("overview");
  }

  function selectNavigationItem(id: NavigationId) {
    if (id === "browser") {
      void openBuiltInBrowser();
      return;
    }
    setActiveView(id);
  }

  async function refreshProxyCertificateStatus(): Promise<ProxyCertificateStatus | undefined> {
    if (!window.ccr) {
      setProxyCertificateStatus(fallbackProxyCertificateStatus);
      return undefined;
    }
    const status = await window.ccr.getProxyCertificateStatus();
    setProxyCertificateStatus(status);
    return status;
  }

  async function checkProxyCertificateStatus() {
    setProxyCertificateChecking(true);
    setActionError("");
    setActionMessage("");
    try {
      const status = await refreshProxyCertificateStatus();
      setActionMessage(status?.trusted ? "Proxy CA certificate is trusted." : status?.message || "Proxy CA certificate is not trusted.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setProxyCertificateChecking(false);
    }
  }

  async function setProxyEnabled(checked: boolean) {
    setActionError("");
    setActionMessage("");
    if (!checked) {
      setProxyEnablePending(false);
      updateConfig((next) => ({ ...next, proxy: { ...next.proxy, enabled: false } }));
      return;
    }
    if (!window.ccr) {
      setActionError("Proxy certificate detection is available in the Electron app.");
      return;
    }

    setProxyCertificateChecking(true);
    try {
      const status = await refreshProxyCertificateStatus();
      if (status?.trusted) {
        setProxyEnablePending(false);
        updateConfig((next) => ({ ...next, proxy: { ...next.proxy, enabled: true } }));
        return;
      }
      setProxyEnablePending(true);
      setActionMessage(status?.message || "Install and trust the proxy CA certificate before enabling proxy mode.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setProxyCertificateChecking(false);
    }
  }

  async function toggleGatewayService() {
    if (!window.ccr) {
      setActionError("Service control is available in the Electron app.");
      return;
    }

    const shouldStop = gatewayStatus.state === "running" || gatewayStatus.state === "starting";
    setGatewayActionBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const status = shouldStop ? await window.ccr.stopGateway() : await window.ccr.startGateway();
      setGatewayStatus(status);
      const nextProxyStatus = await window.ccr.getProxyStatus();
      setProxyStatus(nextProxyStatus);
      setActionMessage(gatewayServiceMessage(status, shouldStop));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setGatewayActionBusy(false);
    }
  }

  async function installProxyCertificate() {
    if (!window.ccr) {
      setActionError("Certificate install is available in the Electron app.");
      return;
    }

    setActionBusy("cert");
    setActionError("");
    setActionMessage("");
    try {
      const result = await window.ccr.installProxyCertificate();
      setProxyCertificateStatus(result.status);
      const status = result.status.trusted ? result.status : await refreshProxyCertificateStatus();
      if (proxyEnablePending && status?.trusted) {
        updateConfig((next) => ({ ...next, proxy: { ...next.proxy, enabled: true } }));
        setProxyEnablePending(false);
        setActionMessage("Certificate installed and trusted. Proxy mode enabled.");
        return;
      }
      setActionMessage(formatProxyCertificateInstallMessage(result, status));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy("");
    }
  }

  async function refreshProxyNetworkCaptures() {
    if (!window.ccr) {
      setProxyNetworkSnapshot(fallbackProxyNetworkSnapshot);
      return;
    }
    setProxyNetworkSnapshot(await window.ccr.getProxyNetworkCaptures());
  }

  async function refreshRequestLogs() {
    if (!window.ccr) {
      setRequestLogPage(createEmptyRequestLogPage(requestLogFilter));
      return;
    }

    setRequestLogLoading(true);
    try {
      setRequestLogPage(await window.ccr.getRequestLogs(requestLogFilter));
      setRequestLogError("");
    } catch (error) {
      setRequestLogError(error instanceof Error ? error.message : String(error));
    } finally {
      setRequestLogLoading(false);
    }
  }

  async function refreshAgentAnalysis() {
    if (!window.ccr) {
      setAgentAnalysis(createEmptyAgentAnalysis(agentAnalysisRange));
      return;
    }

    setAgentAnalysisLoading(true);
    try {
      setAgentAnalysis(await window.ccr.getAgentAnalysis({ agent: agentAnalysisAgent, range: agentAnalysisRange }));
      setAgentAnalysisError("");
    } catch (error) {
      setAgentAnalysisError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentAnalysisLoading(false);
    }
  }

  function updateRequestLogFilter(patch: RequestLogListFilter, resetPage = true) {
    setRequestLogFilter((current) => ({
      ...current,
      ...patch,
      page: resetPage ? 1 : patch.page ?? current.page
    }));
  }

  async function clearProxyNetworkCaptures() {
    if (!window.ccr) {
      setProxyNetworkSnapshot(fallbackProxyNetworkSnapshot);
      return;
    }
    setProxyNetworkSnapshot(await window.ccr.clearProxyNetworkCaptures());
  }

  async function setProxyNetworkCaptureEnabled(enabled: boolean) {
    updateConfig((next) => ({ ...next, proxy: { ...next.proxy, captureNetwork: enabled } }));
    setProxyNetworkSnapshot((current) => ({ ...current, captureEnabled: enabled }));
    if (!enabled && activeView === "networking") {
      setActiveView("server");
    }
    if (!window.ccr) {
      return;
    }
    try {
      setProxyNetworkSnapshot(await window.ccr.setProxyNetworkCaptureEnabled(enabled));
      setActionError("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  function setProxySystemProxyEnabled(enabled: boolean) {
    setActionError("");
    setActionMessage("");
    updateConfig((next) => ({ ...next, proxy: { ...next.proxy, systemProxy: enabled } }));
  }

  function openAddProfileDialog(agent: ProfileConfig["agent"] = profileAgentTab) {
    setProfileAgentTab(agent);
    setProfileDraft(createProfileDraft(agent));
    setProfileActionError("");
    setProfileAddOpen(true);
  }

  function openEditProfileDialog(index: number) {
    const profile = draftConfig.profile.profiles[index];
    if (!profile) {
      return;
    }
    setProfileEditIndex(index);
    setProfileEditDraft(createProfileDraftFromProfile(profile));
    setProfileActionError("");
  }

  function updateProfileDraft(patch: Partial<AddProfileDraft>) {
    setProfileDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.agent && patch.agent !== current.agent) {
        const name = current.name === profileAgentLabel(current.agent) ? undefined : next.name;
        return {
          ...createProfileDraft(patch.agent, name),
          envRows: current.envRows
        };
      }
      return next;
    });
    setProfileActionError("");
  }

  function updateProfileEditDraft(patch: Partial<AddProfileDraft>) {
    setProfileEditDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.agent && patch.agent !== current.agent) {
        const name = current.name === profileAgentLabel(current.agent) ? undefined : next.name;
        return {
          ...createProfileDraft(patch.agent, name),
          envRows: current.envRows
        };
      }
      return next;
    });
    setProfileActionError("");
  }

  async function submitProfileDraft(): Promise<boolean> {
    if (!canSubmitProfile) {
      setProfileActionError("Profile name, required target settings, and environment variable keys are required.");
      return false;
    }
    const profile = profileConfigFromDraft(profileDraft, draftConfig.profile.profiles);
    setProfileAgentTab(profile.agent);
    const next = buildConfigUpdate((config) => ({
      ...config,
      profile: {
        ...config.profile,
        enabled: true,
        profiles: [...config.profile.profiles, profile]
      }
    }));
    setConfigDraft(next);
    if (!(await persistConfig(next, setProfileActionError))) {
      return false;
    }
    setProfileAddOpen(false);
    setProfileDraft(createProfileDraft());
    setProfileActionError("");
    if (activeView === "onboarding") {
      setOnboardingStep("enter");
    }
    return true;
  }

  async function submitProfileEditDraft(): Promise<boolean> {
    if (profileEditIndex === undefined) {
      return false;
    }
    if (!canSubmitProfileEdit) {
      setProfileActionError("Profile name, required target settings, and environment variable keys are required.");
      return false;
    }
    const currentProfile = draftConfig.profile.profiles[profileEditIndex];
    if (!currentProfile) {
      setProfileActionError("Profile no longer exists.");
      return false;
    }
    const nextProfile = profileConfigFromDraft(profileEditDraft, draftConfig.profile.profiles, currentProfile);
    setProfileAgentTab(nextProfile.agent);
    const next = buildConfigUpdate((config) => {
      const profiles = [...config.profile.profiles];
      profiles[profileEditIndex] = nextProfile;
      return {
        ...config,
        profile: {
          ...config.profile,
          profiles
        }
      };
    });
    setConfigDraft(next);
    if (!(await persistConfig(next, setProfileActionError))) {
      return false;
    }
    setProfileEditIndex(undefined);
    setProfileEditDraft(createProfileDraft());
    setProfileActionError("");
    return true;
  }

  function updateProfileItem(index: number, patch: Partial<ProfileConfig>) {
    updateConfig((next) => {
      const profiles = [...next.profile.profiles];
      const current = profiles[index];
      if (!current) {
        return next;
      }
      profiles[index] = normalizeProfileItem({ ...current, ...patch }, index);
      return {
        ...next,
        profile: {
          ...next.profile,
          profiles
        }
      };
    });
  }

  function removeProfile(index: number) {
    updateConfig((next) => ({
      ...next,
      profile: {
        ...next.profile,
        profiles: next.profile.profiles.filter((_, itemIndex) => itemIndex !== index)
      }
    }));
  }

  return (
    <AppI18nContext.Provider value={copy}>
      <LayoutGroup id="home-shell">
      <div className="relative flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-background text-foreground max-[720px]:flex-col">
      {activeView === "onboarding" ? (
        <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
          <div className="app-drag absolute inset-x-0 top-0 z-10 h-10" />
          {configLoaded && onboardingStatusLoaded ? (
            <OnboardingView
              activeStep={onboardingStep}
              canSubmitProfile={canSubmitProfile}
              canSubmitProvider={canSubmitProvider}
              config={draftConfig}
              endpoint={gatewayEndpoint}
              gatewayStatus={gatewayStatus}
              onCheckProvider={checkProviderDraft}
              onComplete={completeOnboarding}
              onChangeProfile={updateProfileDraft}
              onChangeProvider={updateProviderDraft}
              onSelectStep={setOnboardingStep}
              onSubmitProfile={submitProfileDraft}
              onSubmitProvider={submitProviderDraft}
              profileDraft={profileDraft}
              profileError={profileActionError}
              providerDraft={providerDraft}
              providerError={providerProbeError}
              providerProbe={providerProbe}
              providerProbeLoading={providerProbeLoading}
            />
          ) : null}
        </main>
      ) : (
      <>
      <div className={cn("app-no-drag absolute top-2 z-[70] flex items-center gap-1", isMac ? "left-[76px]" : "left-3")}>
        <Button
          aria-controls="primary-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? copy.sidebar.collapse : copy.sidebar.expand}
          className="app-sidebar-toggle inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => setSidebarOpen((current) => !current)}
          title={sidebarOpen ? copy.sidebar.collapse : copy.sidebar.expand}
          type="button"
          unstyled
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </Button>
        <ServiceControlButton
          busy={gatewayActionBusy}
          onClick={toggleGatewayService}
          state={gatewayStatus.state}
        />
      </div>

      <motion.aside
        animate={{
          width: sidebarOpen ? (compactLayout ? "100%" : 248) : 0
        }}
        aria-hidden={!sidebarOpen}
        className={cn(
          "app-sidebar flex shrink-0 flex-col overflow-hidden bg-sidebar/95 max-[720px]:h-auto",
          sidebarOpen && compactLayout && "border-b border-border"
        )}
        id="primary-sidebar"
        initial={false}
        style={{ pointerEvents: sidebarOpen ? "auto" : "none" }}
        transition={shouldReduceMotion ? reducedMotionTransition : { damping: 35, mass: 0.78, stiffness: 430, type: "spring" }}
      >
        {sidebarOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="flex min-h-0 w-[248px] flex-1 flex-col max-[720px]:w-full"
            initial={{ opacity: 0 }}
            transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.14, ease: motionEase }}
          >
            <div className="flex h-14 shrink-0 max-[720px]:h-12">
              <div className="shrink-0" style={{ width: isMac ? 116 : 52 }} />
              <div className="app-drag min-w-0 flex-1" />
            </div>

            <nav className="flex min-h-0 flex-1 flex-col gap-1 px-2 py-3 max-[720px]:flex-none max-[720px]:flex-row max-[720px]:overflow-x-auto max-[720px]:py-2" aria-label={copy.sidebar.primaryNavigation}>
              {visibleNavigation.map((item) => (
                <Button
                  className={cn(
                    "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium text-muted-foreground transition-all duration-150 max-[720px]:min-w-[118px]",
                    item.id !== "browser" && activeView === item.id
                      ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                      : "hover:bg-muted/80 hover:text-foreground"
                  )}
                  key={item.id}
                  onClick={() => selectNavigationItem(item.id)}
                  type="button"
                  unstyled
                >
                  <motion.span
                    className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                    item.id !== "browser" && activeView === item.id && "bg-primary/10 text-primary"
                    )}
                    layout="position"
                    transition={shouldReduceMotion ? reducedMotionTransition : listSpringTransition}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                  </motion.span>
                  <span className="min-w-0 flex-1 truncate">{copy.navigation[item.id]}</span>
                </Button>
              ))}
            </nav>

            <div className="shrink-0 border-t border-border/60 p-2 max-[720px]:border-t max-[720px]:pt-2">
              <Button
                className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium text-muted-foreground transition-all duration-150 hover:bg-muted/80 hover:text-foreground"
                onClick={() => setSettingsOpen(true)}
                title={copy.settings.title}
                type="button"
                unstyled
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                  <Settings className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{copy.settings.button}</span>
              </Button>
            </div>

            <div className="h-3 shrink-0 max-[720px]:hidden" />
          </motion.div>
        ) : null}
      </motion.aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={cn(
            "app-drag relative flex h-12 shrink-0 items-center bg-background/95 px-5 max-[720px]:h-auto max-[720px]:px-3 max-[720px]:py-2",
            needsTrafficLightSafeArea && "pl-[116px] max-[720px]:pl-[116px]"
          )}
        >
          {needsTrafficLightSafeArea ? <div className="app-no-drag absolute left-0 top-0 h-full w-[152px]" /> : null}
          <EndpointTitleBar
            config={draftConfig}
            endpoint={gatewayEndpoint}
            gatewayStatus={gatewayStatus}
            onOpenSettings={() => setActiveView("server")}
            proxyStatus={proxyStatus}
          />
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 px-5 pb-5 pt-5 max-[720px]:px-3 max-[720px]:pb-3 max-[720px]:pt-3",
            viewUsesInternalScroll(activeView) ? "overflow-hidden" : "overflow-auto"
          )}
        >
          <AnimatePresence initial={false} mode="wait">
            <ViewMotionShell key={activeView} view={activeView}>
              {activeView === "overview" ? (
                <OverviewView
                  providerAccounts={providerAccountSnapshots}
                  setUsageRange={setUsageRange}
                  usageRange={usageRange}
                  usageStats={usageStats}
                />
              ) : null}
              {activeView === "observability" ? (
                <AgentAnalysisView
                  agentFilter={agentAnalysisAgent}
                  error={agentAnalysisError}
                  loading={agentAnalysisLoading}
                  refreshAnalysis={() => void refreshAgentAnalysis()}
                  setAgentFilter={setAgentAnalysisAgent}
                  setRange={setAgentAnalysisRange}
                  range={agentAnalysisRange}
                  snapshot={agentAnalysis}
                />
              ) : null}
              {activeView === "api-keys" ? (
                <ApiKeysView
                  addApiKey={openAddApiKeyDialog}
                  apiKeys={apiKeys}
                  editApiKey={openEditApiKeyDialog}
                  error={apiKeyError}
                  notify={showToast}
                  removeApiKey={removeApiKey}
                />
              ) : null}
              {activeView === "server" ? (
                <ServerView
                  actionBusy={actionBusy}
                  actionError={actionError}
                  actionMessage={actionMessage}
                  applyClaudeAppGateway={() => void applyClaudeAppGateway()}
                  config={draftConfig}
                  installProxyCertificate={installProxyCertificate}
                  onProxyEnabledChange={(checked) => void setProxyEnabled(checked)}
                  onProxyNetworkCaptureChange={(enabled) => void setProxyNetworkCaptureEnabled(enabled)}
                  onProxySystemProxyChange={setProxySystemProxyEnabled}
                  proxyCertificateChecking={proxyCertificateChecking}
                  proxyCertificateStatus={proxyCertificateStatus}
                  proxyStatus={proxyStatus}
                  refreshProxyCertificateStatus={() => void checkProxyCertificateStatus()}
                  restartProxy={restartProxy}
                  updateConfig={updateConfig}
                />
              ) : null}
              {activeView === "profile" ? (
                <ProfileView
                  addProfile={openAddProfileDialog}
                  applyError={profileActionError}
                  config={draftConfig}
                  editProfile={openEditProfileDialog}
                  removeProfile={removeProfile}
                  updateProfileItem={updateProfileItem}
                />
              ) : null}
              {activeView === "networking" && networkCaptureEnabled ? (
                <NetworkingView
                  clearCaptures={() => void clearProxyNetworkCaptures()}
                  proxyStatus={proxyStatus}
                  refreshCaptures={() => void refreshProxyNetworkCaptures()}
                  setCaptureEnabled={(enabled) => void setProxyNetworkCaptureEnabled(enabled)}
                  snapshot={proxyNetworkSnapshot}
                />
              ) : null}
              {activeView === "logs" ? (
                <LogsView
                  error={requestLogError}
                  filter={requestLogFilter}
                  loading={requestLogLoading}
                  page={requestLogPage}
                  refreshLogs={() => void refreshRequestLogs()}
                  updateFilter={updateRequestLogFilter}
                />
              ) : null}
              {activeView === "providers" ? (
                <ProvidersView
                  addProvider={openAddProviderDialog}
                  editProvider={openEditProviderDialog}
                  notify={showToast}
                  accountSnapshots={providerAccountSnapshots}
                  providers={providers}
                  removeProvider={setProviderDeleteIndex}
                />
              ) : null}
              {activeView === "models" ? (
                <ModelsView
                  config={draftConfig}
                />
              ) : null}
              {activeView === "routing" ? (
                <RoutingView
                  addRule={openAddRoutingRuleDialog}
                  config={draftConfig}
                  editRule={openEditRoutingRuleDialog}
                  moveRule={moveRoutingRule}
                  providers={draftConfig.Providers}
                  removeRule={setRoutingDeleteIndex}
                  updateFallback={(fallback) => updateConfig((config) => {
                    config.Router.fallback = normalizeRouterFallbackConfig(fallback);
                    return config;
                  })}
                  updateRule={updateRoutingRule}
                />
              ) : null}
              {activeView === "virtual-models" ? (
                <VirtualModelsView
                  addMcpServer={openAddMcpServerDialog}
                  addVirtualModel={openAddVirtualModelDialog}
                  editMcpServer={openEditMcpServerDialog}
                  editVirtualModel={openEditVirtualModelDialog}
                  mcpServers={draftConfig.agent.mcpServers}
                  profiles={draftConfig.virtualModelProfiles ?? []}
                  removeMcpServer={removeMcpServer}
                  removeVirtualModel={removeVirtualModel}
                  setVirtualModelEnabled={setVirtualModelEnabled}
                />
              ) : null}
              {activeView === "extensions" ? (
                <ExtensionsView
                  configureExtension={openConfigureExtension}
                  config={draftConfig}
                  installExtension={openInstallExtensionDialog}
                  removeExtension={(source, index) => setExtensionDeleteTarget({ index, source })}
                  setExtensionEnabled={setExtensionEnabled}
                />
              ) : null}
            </ViewMotionShell>
          </AnimatePresence>
        </div>
      </main>
      </>
      )}

      <AnimatePresence initial={false}>
      {apiKeyAddOpen ? (
        <AddApiKeyDialog
          canSubmit={canSubmitApiKey}
          draft={apiKeyDraft}
          error={apiKeyError}
          onChange={updateApiKeyDraft}
          onClose={() => setApiKeyAddOpen(false)}
          onSubmit={submitApiKeyDraft}
          key="api-key-add"
        />
      ) : null}
      {profileAddOpen ? (
        <AddProfileDialog
          canSubmit={canSubmitProfile}
          draft={profileDraft}
          error={profileActionError}
          mode="add"
          onChange={updateProfileDraft}
          onClose={() => setProfileAddOpen(false)}
          providers={draftConfig.Providers}
          onSubmit={submitProfileDraft}
          key="profile-add"
        />
      ) : null}
      {profileEditIndex !== undefined ? (
        <AddProfileDialog
          canSubmit={canSubmitProfileEdit}
          draft={profileEditDraft}
          error={profileActionError}
          mode="edit"
          onChange={updateProfileEditDraft}
          onClose={() => {
            setProfileEditIndex(undefined);
            setProfileActionError("");
          }}
          providers={draftConfig.Providers}
          onSubmit={submitProfileEditDraft}
          key="profile-edit"
        />
      ) : null}
      {apiKeyEditItem ? (
        <EditApiKeyDialog
          canSubmit={canSubmitApiKeyEdit}
          draft={apiKeyEditDraft}
          error={apiKeyError}
          onChange={updateApiKeyEditDraft}
          onClose={() => setApiKeyEditIndex(undefined)}
          onSubmit={submitApiKeyEditDraft}
          key="api-key-edit"
        />
      ) : null}
      {providerDeepLinkRequest ? (
        <ProviderDeepLinkDialog
          busy={providerDeepLinkBusy}
          error={providerDeepLinkError}
          onClose={() => {
            if (!providerDeepLinkBusy) {
              setProviderDeepLinkRequest(undefined);
            }
          }}
          onSubmit={confirmProviderDeepLinkImport}
          request={providerDeepLinkRequest}
          key="provider-deep-link"
        />
      ) : null}
      {providerAddOpen ? (
        <AddProviderDialog
          canSubmit={canSubmitProvider}
          draft={providerDraft}
          error={providerProbeError}
          onChange={updateProviderDraft}
          mode={providerEditIndex === undefined ? "add" : "edit"}
          onClose={() => {
            setProviderAddOpen(false);
            setProviderEditIndex(undefined);
          }}
          onCheck={checkProviderDraft}
          onSubmit={submitProviderDraft}
          probe={providerProbe}
          probeLoading={providerProbeLoading}
          providers={draftConfig.Providers}
          key="provider-upsert"
        />
      ) : null}
      {providerDeleteItem ? (
        <DeleteProviderDialog
          onClose={() => setProviderDeleteIndex(undefined)}
          onConfirm={confirmProviderDelete}
          provider={providerDeleteItem}
          key="provider-delete"
        />
      ) : null}
      {routingAddOpen ? (
        <AddRoutingRuleDialog
          canSubmit={canSubmitRoutingRule}
          draft={routingRuleDraft}
          mode={routingEditIndex === undefined ? "add" : "edit"}
          onChange={updateRoutingRuleDraft}
          onClose={() => {
            setRoutingAddOpen(false);
            setRoutingEditIndex(undefined);
          }}
          onSubmit={submitRoutingRuleDraft}
          providers={draftConfig.Providers}
          key="routing-upsert"
        />
      ) : null}
      {routingDeleteRule ? (
        <DeleteRoutingRuleDialog
          onClose={() => setRoutingDeleteIndex(undefined)}
          onConfirm={confirmRoutingRuleDelete}
          rule={routingDeleteRule}
          key="routing-delete"
        />
      ) : null}
      {virtualModelDialogOpen ? (
        <VirtualModelDialog
          canSubmit={canSubmitVirtualModel}
          draft={virtualModelDraft}
          error={virtualModelError || virtualModelValidationError}
          mcpServers={draftConfig.agent.mcpServers}
          mode={virtualModelEditIndex === undefined ? "add" : "edit"}
          onChange={updateVirtualModelDraft}
          onClose={() => {
            setVirtualModelDialogOpen(false);
            setVirtualModelEditIndex(undefined);
          }}
          onSubmit={submitVirtualModelDraft}
          providers={draftConfig.Providers}
          key="virtual-model-upsert"
        />
      ) : null}
      {mcpServerDialogOpen ? (
        <McpServerDialog
          canSubmit
          draft={mcpServerDraft}
          error={mcpServerError}
          mode={mcpServerEditIndex === undefined ? "add" : "edit"}
          onChange={updateMcpServerDraft}
          onClose={() => {
            setMcpServerDialogOpen(false);
            setMcpServerEditIndex(undefined);
            setMcpServerError("");
          }}
          onSubmit={submitMcpServerDraft}
          key="mcp-server-upsert"
        />
      ) : null}
      {extensionInstallOpen ? (
        <InstallExtensionDialog
          canSubmit={canInstallExtension}
          draft={extensionInstallDraft}
          error={extensionInstallError}
          marketplace={pluginMarketplace}
          onChange={updateExtensionInstallDraft}
          onChooseLocal={chooseLocalExtensionDirectory}
          onClose={() => setExtensionInstallOpen(false)}
          onSubmit={submitExtensionInstallDraft}
          key="extension-install"
        />
      ) : null}
      {extensionDeleteItem ? (
        <DeleteExtensionDialog
          extension={extensionDeleteItem}
          onClose={() => setExtensionDeleteTarget(undefined)}
          onConfirm={confirmExtensionDelete}
          key="extension-delete"
        />
      ) : null}
      {extensionConfigItem ? (
        <PluginSettingsDialog
          draft={pluginSettingsDraft}
          error={pluginSettingsError}
          extension={extensionConfigItem}
          onChange={updatePluginSettingsDraft}
          onClose={() => setExtensionConfigTarget(undefined)}
          onSubmit={submitPluginSettingsDraft}
          key="extension-settings"
        />
      ) : null}
      {pluginRoutingConfigItem && isClaudeDesignPluginConfig(pluginRoutingConfigItem) ? (
        <ConfigureClaudeDesignDialog
          canSubmit={canSubmitClaudeDesignRouting}
          draft={claudeDesignRoutingDraft}
          routesLabel="Claude Design routes"
          sourceModelLabel="Claude Design model"
          sourceModelDefaults={{ model: "claude-opus-4-8", pattern: "claude-" }}
          onAddRule={addClaudeDesignRoutingRule}
          onChange={updateClaudeDesignRoutingDraft}
          onChangeRule={updateClaudeDesignRoutingRule}
          onClose={() => setPluginRoutingConfigTarget(undefined)}
          onRemoveRule={removeClaudeDesignRoutingRule}
          onSubmit={submitClaudeDesignRoutingDraft}
          providers={draftConfig.Providers}
          key="extension-config"
        />
      ) : null}
      {pluginRoutingConfigItem && isCursorProxyPluginConfig(pluginRoutingConfigItem) ? (
        <ConfigureClaudeDesignDialog
          canSubmit={canSubmitCursorProxyRouting}
          draft={cursorProxyRoutingDraft}
          routesLabel="Cursor Proxy routes"
          sourceModelLabel="Cursor model"
          sourceModelDefaults={{ model: "default", pattern: "cursor-" }}
          onAddRule={addCursorProxyRoutingRule}
          onChange={updateCursorProxyRoutingDraft}
          onChangeRule={updateCursorProxyRoutingRule}
          onClose={() => setPluginRoutingConfigTarget(undefined)}
          onRemoveRule={removeCursorProxyRoutingRule}
          onSubmit={submitCursorProxyRoutingDraft}
          providers={draftConfig.Providers}
          key="cursor-proxy-config"
        />
      ) : null}
      {settingsOpen ? (
        <AppSettingsDialog
          copy={copy}
          isMac={isMac}
          languagePreference={languagePreference}
          onChangeLanguage={changeLanguagePreference}
          onChangeTheme={changeThemePreference}
          onChangeTrayIcon={changeTrayIconPreference}
          onChangeTrayProgressTarget={changeTrayProgressTargetTokens}
          onSetTrayModuleEnabled={setTrayWindowModuleEnabled}
          onClose={() => setSettingsOpen(false)}
          systemLanguage={systemLanguage}
          systemTheme={systemTheme}
          themePreference={draftConfig.theme || "system"}
          trayIconPreference={draftConfig.trayIcon || "random"}
          trayProgressTargetTokens={draftConfig.trayProgressTargetTokens || 100000}
          trayWindowModules={draftConfig.trayWindowModules || DEFAULT_TRAY_WINDOW_MODULES}
          key="settings"
        />
      ) : null}
      </AnimatePresence>
        <LightToast toast={toast} />
      </div>
      </LayoutGroup>
    </AppI18nContext.Provider>
  );
}

type OnboardingMascotTone = "cyan" | "orange" | "violet";

const onboardingStepDetails: Record<OnboardingStepId, {
  description: string;
  icon: LucideIcon;
  title: string;
  tone: OnboardingMascotTone;
}> = {
  provider: {
    description: "Add or verify a model provider.",
    icon: Layers3,
    title: "Configure provider",
    tone: "violet"
  },
  profile: {
    description: "Create a profile for your agent.",
    icon: UserRound,
    title: "Connect agent",
    tone: "orange"
  },
  enter: {
    description: "Start using CCR.",
    icon: Gauge,
    title: "Let's start",
    tone: "cyan"
  }
};

const onboardingMascotPalettes: Record<OnboardingMascotTone, { accent: string; glow: string; main: string; shadow: string }> = {
  cyan: {
    accent: "#8CF7FF",
    glow: "rgba(34, 211, 238, 0.22)",
    main: "#22D3EE",
    shadow: "rgba(8, 145, 178, 0.22)"
  },
  orange: {
    accent: "#FFD166",
    glow: "rgba(249, 115, 22, 0.2)",
    main: "#F97316",
    shadow: "rgba(194, 65, 12, 0.22)"
  },
  violet: {
    accent: "#C084FC",
    glow: "rgba(139, 92, 246, 0.2)",
    main: "#8B5CF6",
    shadow: "rgba(109, 40, 217, 0.22)"
  }
};

function OnboardingView({
  activeStep,
  canSubmitProfile,
  canSubmitProvider,
  config,
  endpoint,
  gatewayStatus,
  onCheckProvider,
  onChangeProfile,
  onChangeProvider,
  onComplete,
  onSelectStep,
  onSubmitProfile,
  onSubmitProvider,
  profileDraft,
  profileError,
  providerDraft,
  providerError,
  providerProbe,
  providerProbeLoading
}: {
  activeStep: OnboardingStepId;
  canSubmitProfile: boolean;
  canSubmitProvider: boolean;
  config: AppConfig;
  endpoint: string;
  gatewayStatus: GatewayStatus;
  onCheckProvider: () => Promise<void>;
  onChangeProfile: (patch: Partial<AddProfileDraft>) => void;
  onChangeProvider: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  onComplete: () => void | Promise<void>;
  onSelectStep: (step: OnboardingStepId) => void;
  onSubmitProfile: () => Promise<boolean>;
  onSubmitProvider: () => Promise<boolean>;
  profileDraft: AddProfileDraft;
  profileError: string;
  providerDraft: AddProviderDraft;
  providerError: string;
  providerProbe?: GatewayProviderProbeResult;
  providerProbeLoading: boolean;
}) {
  const t = useAppText();
  const shouldReduceMotion = useReducedMotion();
  const providerReady = isOnboardingProviderReady(config);
  const profileReady = isOnboardingProfileReady(config);
  const serviceReady = gatewayStatus.state === "running";
  const routeReady = providerReady && profileReady;
  const activeIndex = Math.max(0, onboardingStepOrder.indexOf(activeStep));
  const activeDetails = onboardingStepDetails[activeStep];
  const previousStep = onboardingStepOrder[activeIndex - 1];
  const nextStep = getNextOnboardingStep(activeStep, config);
  const nextDisabled = activeStep === "provider"
    ? !(providerReady || canSubmitProvider)
    : activeStep === "profile"
      ? !(profileReady || (providerReady && canSubmitProfile))
      : !routeReady;

  function goToPreviousStep() {
    if (previousStep) {
      onSelectStep(previousStep);
    }
  }

  async function goToNextStep() {
    if (activeStep === "enter") {
      if (routeReady) {
        await onComplete();
      }
      return;
    }

    if (activeStep === "provider") {
      if (canSubmitProvider) {
        const saved = await onSubmitProvider();
        if (saved) {
          return;
        }
      }
      if (providerReady && nextStep) {
        onSelectStep(nextStep);
      }
      return;
    }

    if (activeStep === "profile" && !profileReady) {
      await onSubmitProfile();
      return;
    }

    if (nextStep) {
      onSelectStep(nextStep);
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 w-full flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-card">
          <motion.div
            className="relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-hidden"
            layout
            style={{ transformPerspective: 900 }}
            transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.28, ease: motionEase }}
          >
            <OnboardingProgress activeIndex={activeIndex} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
              <div className="flex h-8 shrink-0 items-center">
                {previousStep ? (
                  <Button
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
                    onClick={goToPreviousStep}
                    type="button"
                    unstyled
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t("Back")}
                  </Button>
                ) : null}
              </div>

              <div className="flex min-w-0 shrink-0 flex-col items-center gap-2 text-center">
                <OnboardingMascotSprite activeStep={activeStep} />
                <div className="min-w-0">
                  <h2 className="text-[20px] font-semibold tracking-normal">{t(activeDetails.title)}</h2>
                  <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{t(activeDetails.description)}</p>
                </div>
              </div>

              <div className="onboarding-step-panels mt-5 min-h-0 flex-1 overflow-hidden">
                <div
                  aria-hidden={activeStep !== "provider"}
                  className={cn("onboarding-step-panel flex min-w-0 flex-1 flex-col gap-3", activeStep === "provider" && "onboarding-step-panel-active")}
                >
                  <div className="mx-auto w-full max-w-[780px]">
                    <AddProviderForm
                      draft={providerDraft}
                      error={providerError}
                      mode={providerReady ? "edit" : "add"}
                      onCheck={onCheckProvider}
                      onChange={onChangeProvider}
                      probe={providerProbe}
                      probeLoading={providerProbeLoading}
                      providers={config.Providers}
                    />
                  </div>
                </div>

                <div
                  aria-hidden={activeStep !== "profile"}
                  className={cn("onboarding-step-panel flex min-w-0 flex-1 flex-col gap-3", activeStep === "profile" && "onboarding-step-panel-active")}
                >
                  <div className="mx-auto w-full max-w-[720px]">
                    <AddProfileForm
                      draft={profileDraft}
                      error={profileError}
                      onChange={onChangeProfile}
                      providers={config.Providers}
                    />
                  </div>
                </div>

                <div
                  aria-hidden={activeStep !== "enter"}
                  className={cn("onboarding-step-panel flex min-w-0 flex-1 flex-col gap-3", activeStep === "enter" && "onboarding-step-panel-active")}
                >
                  <div className="mx-auto flex w-full max-w-[520px] flex-col overflow-hidden rounded-lg border border-border bg-background/70">
                    <OnboardingStatusRow label={t("Provider")} ready={providerReady} />
                    <OnboardingStatusRow label={t("Profile")} ready={profileReady} />
                    <OnboardingStatusRow label={t("Service")} ready={serviceReady} />
                    <OnboardingDetailRow label={t("Endpoint")} value={endpoint} />
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-center gap-2">
                    {!providerReady ? (
                      <Button onClick={() => onSelectStep("provider")} type="button" variant="outline">
                        {t("Configure provider")}
                      </Button>
                    ) : null}
                    {providerReady && !profileReady ? (
                      <Button onClick={() => onSelectStep("profile")} type="button" variant="outline">
                        {t("Connect agent")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex shrink-0 items-center justify-end gap-3 border-t border-border/60 pt-4">
                <Button disabled={nextDisabled} onClick={() => void goToNextStep()} type="button">
                  {activeStep === "enter" ? <Check className="h-4 w-4" /> : null}
                  {activeStep === "enter" ? t("Let's start") : t("Next step")}
                  {activeStep !== "enter" ? <ChevronRight className="h-4 w-4" /> : null}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function OnboardingProgress({ activeIndex }: { activeIndex: number }) {
  const t = useAppText();
  const stepCount = onboardingStepOrder.length;
  const progressWidth = `${((activeIndex + 1) / stepCount) * 100}%`;

  return (
    <div className="relative shrink-0 border-b border-border/60 bg-card/95" aria-label={`${t("Step")} ${activeIndex + 1} / ${stepCount}`}>
      <div className="mx-auto flex h-11 max-w-[520px] items-center justify-center px-3 text-[13px] font-medium">
        {onboardingStepOrder.map((step, index) => (
          <div className="flex min-w-0 items-center" key={step}>
            <span
              className={cn(
                "max-w-[136px] truncate",
                index === activeIndex ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {t(onboardingStepDetails[step].title)}
            </span>
            {index < stepCount - 1 ? <ChevronRight className="mx-5 h-4 w-4 shrink-0 text-muted-foreground/70 max-[560px]:mx-2" /> : null}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={stepCount} aria-valuenow={activeIndex + 1}>
        <div className="h-full bg-foreground transition-[width] duration-200" style={{ width: progressWidth }} />
      </div>
    </div>
  );
}

function OnboardingStatusRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{label}</span>
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          ready ? "bg-emerald-500/12 text-emerald-600" : "bg-destructive/10 text-destructive"
        )}
      >
        {ready ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </span>
    </div>
  );
}

function OnboardingDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{label}</span>
      <span className="min-w-0 max-w-[68%] truncate text-right font-mono text-[12px] text-muted-foreground" title={value}>{value}</span>
    </div>
  );
}

function OnboardingMascotSprite({ activeStep }: { activeStep: OnboardingStepId }) {
  return (
    <div
      aria-hidden
      className={cn("onboarding-mascot-sprite", `onboarding-mascot-sprite-${activeStep}`)}
      style={{
        backgroundImage: `url(${onboardingMascotSpriteUrl})`
      }}
    />
  );
}

function LightToast({ toast }: { toast?: AppToast }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {toast ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none fixed left-1/2 top-5 z-[10000] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover px-3 py-2 text-[12px] font-medium text-popover-foreground shadow-lg"
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          key={toast.id}
          role="status"
          transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.16, ease: motionEase }}
        >
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">{toast.message}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function AppSettingsDialog({
  copy,
  isMac,
  languagePreference,
  onChangeLanguage,
  onChangeTheme,
  onChangeTrayIcon,
  onChangeTrayProgressTarget,
  onSetTrayModuleEnabled,
  onClose,
  systemLanguage,
  systemTheme,
  themePreference,
  trayIconPreference,
  trayProgressTargetTokens,
  trayWindowModules
}: {
  copy: AppCopy;
  isMac: boolean;
  languagePreference: AppLanguagePreference;
  onChangeLanguage: (value: string) => void;
  onChangeTheme: (value: string) => void;
  onChangeTrayIcon: (value: string) => void;
  onChangeTrayProgressTarget: (value: string) => void;
  onSetTrayModuleEnabled: (moduleId: TrayWindowModuleId, enabled: boolean) => void;
  onClose: () => void;
  systemLanguage: ResolvedLanguage;
  systemTheme: ResolvedTheme;
  themePreference: AppConfig["theme"];
  trayIconPreference: AppConfig["trayIcon"];
  trayProgressTargetTokens: number;
  trayWindowModules: TrayWindowModuleId[];
}) {
  const [activePage, setActivePage] = useState<SettingsPageId>("appearance");
  const trayWindowModuleSet = useMemo(() => new Set(trayWindowModules), [trayWindowModules]);
  const themeOptions = [
    { label: formatSystemOption(copy.settings.themeSystem, themeDisplayName(systemTheme, copy)), value: "system" },
    { label: copy.settings.themeLight, value: "light" },
    { label: copy.settings.themeDark, value: "dark" }
  ];
  const languageOptions = [
    { label: formatSystemOption(copy.settings.languageSystem, languageDisplayName(systemLanguage, copy)), value: "system" },
    { label: copy.settings.languageChinese, value: "zh" },
    { label: copy.settings.languageEnglish, value: "en" }
  ];
  const trayIconOptions: Array<{ label: string; value: AppConfig["trayIcon"] }> = [
    { label: copy.settings.trayIconRandom, value: "random" },
    { label: copy.settings.trayIconViolet, value: "violet" },
    { label: copy.settings.trayIconOrange, value: "orange" },
    { label: copy.settings.trayIconCyan, value: "cyan" },
    { label: copy.settings.trayIconProgress, value: "progress" }
  ];
  const trayModuleOptions: Array<{ label: string; value: TrayWindowModuleId }> = [
    { label: copy.settings.trayModuleSourceTabs, value: "source-tabs" },
    { label: copy.settings.trayModuleHeader, value: "header" },
    { label: copy.settings.trayModuleAccount, value: "account" },
    { label: copy.settings.trayModuleTokenFlow, value: "token-flow" },
    { label: copy.settings.trayModuleStats, value: "stats" },
    { label: copy.settings.trayModuleTokenMix, value: "token-mix" },
    { label: copy.settings.trayModuleRings, value: "rings" },
    { label: copy.settings.trayModuleModelShare, value: "model-share" }
  ];

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[min(660px,calc(100dvh-2rem))] max-w-[960px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{copy.settings.title}</DialogTitle>
          </div>
          <Button aria-label={copy.settings.close} onClick={onClose} size="iconSm" title={copy.settings.close} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody className="flex overflow-hidden p-0 max-[640px]:flex-col">
          <aside className="flex w-[220px] shrink-0 flex-col border-r border-border/70 bg-muted/20 p-2 max-[640px]:w-full max-[640px]:border-b max-[640px]:border-r-0">
            <Button
              className={cn(
                "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium transition-colors",
                activePage === "appearance"
                  ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => setActivePage("appearance")}
              type="button"
              unstyled
            >
              <span className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                activePage === "appearance" ? "bg-primary/10 text-primary" : "text-muted-foreground"
              )}>
                <Palette className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">{copy.settings.appearance}</span>
            </Button>
            {isMac ? (
              <Button
                className={cn(
                  "mt-1 flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium transition-colors",
                  activePage === "tray"
                    ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setActivePage("tray")}
                type="button"
                unstyled
              >
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  activePage === "tray" ? "bg-primary/10 text-primary" : "text-muted-foreground"
                )}>
                  <Gauge className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{copy.settings.tray}</span>
              </Button>
            ) : null}
          </aside>

          <section className="min-h-0 flex-1 overflow-auto p-5">
            {activePage === "appearance" ? (
              <div className="mx-auto grid max-w-[520px] grid-cols-1 gap-5">
                <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.appearance}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <Field label={copy.settings.theme}>
                    <SelectControl onChange={onChangeTheme} options={themeOptions} value={themePreference} />
                  </Field>
                  <Field label={copy.settings.language}>
                    <SelectControl onChange={onChangeLanguage} options={languageOptions} value={languagePreference} />
                  </Field>
                </div>
              </div>
            ) : null}
            {isMac && activePage === "tray" ? (
              <div className="mx-auto grid max-w-[720px] grid-cols-1 gap-5">
                <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.tray}</h3>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                  <div className="grid min-w-0 grid-cols-1 gap-4">
                    <Field label={copy.settings.trayIcon}>
                      <TrayIconSelect onChange={onChangeTrayIcon} options={trayIconOptions} value={trayIconPreference} />
                    </Field>
                    {trayIconPreference === "progress" ? (
                      <Field label={copy.settings.trayProgressTarget}>
                        <Input
                          min={1000}
                          step={1000}
                          type="number"
                          value={String(trayProgressTargetTokens)}
                          onChange={(event) => onChangeTrayProgressTarget(event.target.value)}
                        />
                      </Field>
                    ) : null}
                    <div className="min-w-0 space-y-2">
                      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{copy.settings.trayWindowModules}</div>
                      <div className="grid grid-cols-1 gap-2">
                        {trayModuleOptions.map((option) => (
                          <Label
                            className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[12px] font-medium text-foreground"
                            key={option.value}
                          >
                            <Checkbox
                              checked={trayWindowModuleSet.has(option.value)}
                              onCheckedChange={(checked) => onSetTrayModuleEnabled(option.value, checked)}
                            />
                            <span className="min-w-0 truncate">{option.label}</span>
                          </Label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{copy.settings.trayPreview}</div>
                    <TrayWindowPreview copy={copy} iconPreference={trayIconPreference} modules={trayWindowModuleSet} />
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button">
            {copy.settings.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrayIconSelect({
  onChange,
  options,
  value
}: {
  onChange: (value: string) => void;
  options: Array<{ label: string; value: AppConfig["trayIcon"] }>;
  value: AppConfig["trayIcon"];
}) {
  return (
    <div className="relative min-w-0">
      <TrayIconPreview className="pointer-events-none absolute left-2 top-1/2 z-10 h-5 w-5 -translate-y-1/2 rounded-[5px]" preference={value} />
      <Select className="pl-10" onValueChange={onChange} options={options} value={value} />
    </div>
  );
}

function TrayIconPreview({
  className,
  preference
}: {
  className?: string;
  preference: AppConfig["trayIcon"];
}) {
  const randomIcons: Array<"violet" | "orange" | "cyan"> = ["violet", "orange", "cyan"];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]",
        className
      )}
    >
      {preference === "random" ? (
        randomIcons.map((iconId, index) => (
          <img
            alt=""
            className={cn(
              "absolute h-[66%] w-[66%] object-contain drop-shadow-sm",
              index === 0 && "left-[9%] top-[22%]",
              index === 1 && "left-[22%] top-[11%]",
              index === 2 && "left-[34%] top-[27%]"
            )}
            key={iconId}
            src={trayMascotIconUrls[iconId]}
          />
        ))
      ) : null}
      {isTrayMascotIconPreference(preference) ? (
        <img alt="" className="h-[88%] w-[88%] object-contain drop-shadow-sm" src={trayMascotIconUrls[preference]} />
      ) : null}
      {preference === "progress" ? <TrayProgressPreview /> : null}
    </span>
  );
}

function TrayProgressPreview() {
  const radius = 12.2;
  const circumference = 2 * Math.PI * radius;
  const progress = 0.68;

  return (
    <svg aria-hidden="true" className="h-[80%] w-[80%]" viewBox="0 0 36 36">
      <circle cx="18" cy="18" fill="rgba(15,23,42,.92)" r="15.2" />
      <circle cx="18" cy="18" fill="none" r={radius} stroke="rgba(148,163,184,.55)" strokeWidth="4.2" />
      <circle
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        stroke="rgb(248,250,252)"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        strokeWidth="4.2"
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

function TrayWindowPreview({
  copy,
  iconPreference,
  modules
}: {
  copy: AppCopy;
  iconPreference: AppConfig["trayIcon"];
  modules: ReadonlySet<TrayWindowModuleId>;
}) {
  const hasModules = TRAY_WINDOW_MODULE_IDS.some((moduleId) => moduleId !== "footer" && modules.has(moduleId));
  const showTokenMix = modules.has("token-mix");
  const showRings = modules.has("rings");

  return (
    <div className="min-h-[360px] min-w-0 overflow-hidden rounded-[14px] border border-slate-950/15 bg-slate-950 p-3 text-slate-50 shadow-[0_18px_42px_rgba(15,23,42,.28)]">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-white/10 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <TrayIconPreview className="h-7 w-7 border-white/15 bg-white/10" preference={iconPreference} />
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-slate-50">88.4k tokens</div>
            <div className="truncate text-[10px] font-medium text-slate-400">CCR</div>
          </div>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[.04] text-slate-300" aria-hidden="true">
          <Power className="h-3.5 w-3.5" />
        </span>
      </div>

      {modules.has("source-tabs") ? <TrayPreviewSourceTabs /> : null}
      {modules.has("header") ? <TrayPreviewHeader copy={copy} /> : null}
      {modules.has("account") ? <TrayPreviewAccount title={copy.settings.trayModuleAccount} /> : null}
      {modules.has("token-flow") ? <TrayPreviewTokenFlow copy={copy} title={copy.settings.trayModuleTokenFlow} /> : null}
      {modules.has("stats") ? <TrayPreviewStats copy={copy} /> : null}
      {showTokenMix || showRings ? (
        <div className={cn("mb-2 grid gap-2", showTokenMix && showRings ? "grid-cols-2" : "grid-cols-1")}>
          {showTokenMix ? <TrayPreviewTokenMix copy={copy} /> : null}
          {showRings ? <TrayPreviewRings title={copy.settings.trayModuleRings} /> : null}
        </div>
      ) : null}
      {modules.has("model-share") ? <TrayPreviewModelShare title={copy.settings.trayModuleModelShare} /> : null}
      {!hasModules ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[.03] px-4 text-center text-[12px] font-medium text-slate-400">
          {copy.settings.trayPreviewEmpty}
        </div>
      ) : null}
    </div>
  );
}

function TrayPreviewSourceTabs() {
  return (
    <div className="mb-2 grid min-w-0 grid-cols-4 gap-1.5">
      {["All", "OpenAI", "Claude", "More"].map((label, index) => (
        <div
          className={cn(
            "min-w-0 truncate rounded-md border px-2 py-1 text-center text-[10px] font-semibold",
            index === 0 ? "border-teal-300/35 bg-teal-300/16 text-teal-50" : "border-white/10 bg-white/[.04] text-slate-300"
          )}
          key={label}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function TrayPreviewHeader({ copy }: { copy: AppCopy }) {
  return (
    <div className="mb-2 flex min-w-0 items-start justify-between gap-2 rounded-[8px] border border-white/10 bg-white/[.04] px-2.5 py-2">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold text-slate-50">{copy.settings.trayModuleHeader}</div>
        <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
          {trayPreviewText(copy, "Today", "Today")} - {trayPreviewText(copy, "All providers", "All providers", "全部供应商")}
        </div>
      </div>
      <div className="shrink-0 rounded-md border border-white/10 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">7d</div>
    </div>
  );
}

function TrayPreviewAccount({ title }: { title: string }) {
  return (
    <div className="mb-2 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-[11px] font-bold text-slate-100">{title}</div>
        <span className="shrink-0 rounded-full bg-teal-300/15 px-1.5 py-0.5 text-[9px] font-bold text-teal-100">ok</span>
      </div>
      <div className="flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0 truncate text-[10px] font-medium text-slate-400">Weekly quota</div>
        <div className="shrink-0 text-[13px] font-bold text-slate-50">7.8h</div>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-[62%] rounded-full bg-teal-300" />
      </div>
    </div>
  );
}

function TrayPreviewTokenFlow({ copy, title }: { copy: AppCopy; title: string }) {
  return (
    <div className="mb-2 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[11px] font-bold text-slate-100">{title}</div>
        <div className="shrink-0 text-[10px] font-medium text-slate-400">42 {trayPreviewText(copy, "Requests", "req")}</div>
      </div>
      <svg aria-hidden="true" className="mt-2 h-16 w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 260 72">
        <path d="M0 58 C 34 42, 48 50, 74 35 S 119 15, 146 28 S 189 54, 219 22 S 247 18, 260 11" fill="none" stroke="rgba(45,212,191,.95)" strokeLinecap="round" strokeWidth="4" />
        <path d="M0 62 C 31 55, 55 60, 79 50 S 120 30, 153 38 S 197 65, 260 42" fill="none" stroke="rgba(167,139,250,.72)" strokeLinecap="round" strokeWidth="2.5" />
        {[20, 68, 116, 164, 212].map((x) => (
          <line key={x} stroke="rgba(148,163,184,.12)" strokeWidth="1" x1={x} x2={x} y1="0" y2="72" />
        ))}
      </svg>
    </div>
  );
}

function TrayPreviewStats({ copy }: { copy: AppCopy }) {
  const stats = [
    { label: trayPreviewText(copy, "Input", "Input", "输入"), value: "41k" },
    { label: trayPreviewText(copy, "Output", "Output", "输出"), value: "19k" },
    { label: trayPreviewText(copy, "Cache read", "Cache read", "缓存读取"), value: "28k" },
    { label: trayPreviewText(copy, "Success", "Success", "成功"), value: "99%" }
  ];

  return (
    <div className="mb-2 grid grid-cols-2 gap-1.5">
      {stats.map((stat) => (
        <div className="min-w-0 rounded-[7px] border border-white/10 bg-white/[.04] px-2 py-1.5" key={stat.label}>
          <div className="truncate text-[10px] font-medium text-slate-400">{stat.label}</div>
          <div className="truncate text-[13px] font-bold text-slate-50">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

function TrayPreviewTokenMix({ copy }: { copy: AppCopy }) {
  const bars = [
    { label: trayPreviewText(copy, "Input", "Input", "输入"), value: "72%", className: "bg-blue-400" },
    { label: trayPreviewText(copy, "Output", "Output", "输出"), value: "42%", className: "bg-amber-300" },
    { label: trayPreviewText(copy, "Cache read", "Cache read", "缓存读取"), value: "58%", className: "bg-rose-300" }
  ];

  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{copy.settings.trayModuleTokenMix}</div>
      <div className="space-y-1.5">
        {bars.map((bar) => (
          <div className="min-w-0" key={bar.label}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium text-slate-400">
              <span className="truncate">{bar.label}</span>
              <span className="shrink-0">{bar.value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={cn("h-full rounded-full", bar.className)} style={{ width: bar.value }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrayPreviewRings({ title }: { title: string }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {[74, 91].map((value) => (
          <div className="relative aspect-square min-w-0" key={value}>
            <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 40 40">
              <circle cx="20" cy="20" fill="none" r="15" stroke="rgba(148,163,184,.22)" strokeWidth="4" />
              <circle
                cx="20"
                cy="20"
                fill="none"
                r="15"
                stroke={value > 80 ? "rgb(45,212,191)" : "rgb(129,140,248)"}
                strokeDasharray={2 * Math.PI * 15}
                strokeDashoffset={2 * Math.PI * 15 * (1 - value / 100)}
                strokeLinecap="round"
                strokeWidth="4"
                transform="rotate(-90 20 20)"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-100">{value}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrayPreviewModelShare({ title }: { title: string }) {
  return (
    <div className="mb-2 min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{title}</div>
      {[
        ["claude-sonnet", "48%"],
        ["gpt-4.1", "31%"],
        ["deepseek-chat", "21%"]
      ].map(([model, value]) => (
        <div className="mb-1.5 flex min-w-0 items-center gap-2 last:mb-0" key={model}>
          <div className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-300">{model}</div>
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-teal-300" style={{ width: value }} />
          </div>
          <div className="w-7 shrink-0 text-right text-[10px] font-semibold text-slate-400">{value}</div>
        </div>
      ))}
    </div>
  );
}

function isTrayMascotIconPreference(value: AppConfig["trayIcon"]): value is "cyan" | "orange" | "violet" {
  return value === "cyan" || value === "orange" || value === "violet";
}

function trayPreviewText(copy: AppCopy, key: string, fallback: string, alternateKey?: string): string {
  return copy.text[key] ?? (alternateKey ? copy.text[alternateKey] : undefined) ?? fallback;
}

function OverviewView({
  providerAccounts,
  setUsageRange,
  usageRange,
  usageStats
}: {
  providerAccounts: ProviderAccountSnapshot[];
  setUsageRange: (range: UsageStatsRange) => void;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
}) {
  const t = useAppText();
  const totals = usageStats.totals;
  const tokenMix = [
    { name: t("Input"), value: totals.inputTokens },
    { name: t("Output"), value: totals.outputTokens },
    { name: t("Cache"), value: totals.cacheTokens }
  ];

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="space-y-4"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <SystemStatusBar
        usageRange={usageRange}
        usageStats={usageStats}
      />

      <ProviderAccountsOverview accounts={providerAccounts} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label={t("Requests")} tone="teal" value={formatCompactNumber(totals.requestCount)} />
        <MetricCard label={t("Input tokens")} tone="blue" value={formatCompactNumber(totals.inputTokens)} />
        <MetricCard label={t("Output tokens")} tone="amber" value={formatCompactNumber(totals.outputTokens)} />
        <MetricCard label={t("Cache tokens")} tone="rose" value={formatCompactNumber(totals.cacheTokens)} />
        <MetricCard label={t("Cache ratio")} tone="indigo" value={formatPercent(totals.cacheRatio)} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("Usage Trend")}</CardTitle>
            <div className="flex rounded-md border border-border bg-background p-0.5">
              {usageRangeOptions.map((option) => (
                <Button
                  className={cn(
                    "h-7 rounded px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                    usageRange === option.value && "bg-card text-foreground shadow-sm"
                  )}
                  key={option.value}
                  onClick={() => setUsageRange(option.value)}
                  type="button"
                  unstyled
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              {({ height, width }) => (
                <ComposedChart data={usageStats.series} height={height} margin={{ bottom: 4, left: 0, right: 8, top: 28 }} width={width}>
                  <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" vertical={false} />
                  <XAxis axisLine={false} dataKey="label" tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} />
                  <YAxis axisLine={false} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} yAxisId="tokens" />
                  <YAxis axisLine={false} hide orientation="right" yAxisId="requests" />
                  <Tooltip content={<UsageTooltip />} />
                  <Area dataKey="totalTokens" fill="#0f766e" fillOpacity={0.14} name={t("Total tokens")} stroke="#0f766e" strokeWidth={2} type="monotone" yAxisId="tokens" />
                  <Bar barSize={12} dataKey="requestCount" fill="#2563eb" name={t("Requests")} radius={[3, 3, 0, 0]} yAxisId="requests">
                    <LabelList content={<RequestHealthBarLabel />} dataKey="requestCount" />
                  </Bar>
                  <Line dataKey="cacheTokens" dot={false} name={t("Cache tokens")} stroke="#be123c" strokeWidth={2} type="monotone" yAxisId="tokens" />
                </ComposedChart>
              )}
            </ChartFrame>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("Token Mix")}</CardTitle>
            <Badge variant="outline">{formatCompactNumber(totals.totalTokens)}</Badge>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              {({ height, width }) => (
                <BarChart data={tokenMix} height={height} layout="vertical" margin={{ bottom: 8, left: 8, right: 12, top: 8 }} width={width}>
                  <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" horizontal={false} />
                  <XAxis axisLine={false} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} type="number" />
                  <YAxis axisLine={false} dataKey="name" tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} type="category" width={52} />
                  <Tooltip content={<TokenTooltip />} />
                  <Bar dataKey="value" fill="#d97706" radius={[0, 4, 4, 0]} />
                </BarChart>
              )}
            </ChartFrame>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <UsageAnalysisCard
          columns={[
            { key: "client", label: t("Client") },
            { key: "model", label: t("Model") },
            { key: "provider", label: t("Provider") }
          ]}
          emptyLabel={t("No client usage yet")}
          rows={usageStats.clientModels}
          title={t("Client Analysis")}
        />
        <UsageAnalysisCard
          columns={[
            { key: "provider", label: t("Provider") },
            { key: "model", label: t("Model") }
          ]}
          emptyLabel={t("No provider usage yet")}
          rows={usageStats.providerModels}
          title={t("Provider Analysis")}
        />
      </section>
    </motion.div>
  );
}

type SystemStatusTone = "error" | "idle" | "ok" | "warn";

type SystemStatusPoint = {
  dateLabel: string;
  point: UsageSeriesPoint;
  tone: SystemStatusTone;
};

function SystemStatusBar({
  usageRange,
  usageStats
}: {
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
}) {
  const t = useAppText();
  const segments = usageStats.series.map((point) => ({
    dateLabel: formatStatusBucketDate(point.bucket, usageRange),
    point,
    tone: usageStatusTone(point)
  }));
  const availability = usageStats.totals.requestCount > 0 ? usageStats.totals.successRate : 0;
  const overallTone = usageStatusTone(usageStats.totals);
  const StatusIcon = overallTone === "ok" ? Check : CircleAlert;
  const rangeLabel = formatSystemStatusRange(segments, usageRange);

  return (
    <Card className="min-w-0 overflow-visible border-border/70 bg-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">{t("System status")}</h2>
          <div className="flex shrink-0 items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
            <span>{rangeLabel}</span>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full", systemStatusIconClass(overallTone))}>
                <StatusIcon className="h-3 w-3" />
              </span>
              <span className="min-w-0 truncate text-[13px] font-semibold">{t("API Service")}</span>
            </div>
            <div className="shrink-0 text-[12px] font-medium text-muted-foreground">
              {formatPercent(availability)} {t("Availability")}
            </div>
          </div>

          <div className="flex min-w-0 gap-1" aria-label={t("System status")}>
            {segments.map((segment, index) => (
              <span
                className="group relative flex h-5 min-w-[3px] flex-1"
                key={`${segment.point.bucket}-${index}`}
              >
                <span
                  className={cn("h-full w-full rounded-[3px]", systemStatusSegmentClass(segment.tone))}
                  aria-label={systemStatusPointTooltip(segment, t)}
                />
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-full z-50 mb-2 hidden w-[190px] max-w-[calc(100vw-32px)] rounded-md border border-border/70 bg-popover px-3 py-2 text-left text-[11px] text-popover-foreground shadow-card-elevated group-hover:block",
                    systemStatusTooltipPositionClass(index, segments.length)
                  )}
                >
                  <span className="block font-semibold">{segment.dateLabel}</span>
                  <span className="mt-1 flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Requests")}</span>
                    <span className="font-medium">{formatCompactNumber(segment.point.requestCount)}</span>
                  </span>
                  <span className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Success rate")}</span>
                    <span className="font-medium">{formatPercent(segment.point.successRate)}</span>
                  </span>
                  <span className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Failed requests")}</span>
                    <span className="font-medium">{formatCompactNumber(segment.point.errorCount)}</span>
                  </span>
                  <span className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Duration")}</span>
                    <span className="font-medium">{formatDuration(segment.point.avgDurationMs)}</span>
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderAccountsOverview({ accounts }: { accounts: ProviderAccountSnapshot[] }) {
  const t = useAppText();
  const visibleAccounts = accounts
    .filter((account) => account.meters.length > 0 || account.status === "error")
    .sort(compareProviderAccountSnapshots)
    .slice(0, 6);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Account Balance")}</CardTitle>
        <Badge variant="outline">{accounts.length}</Badge>
      </CardHeader>
      <CardContent>
        {visibleAccounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-7 text-center text-[12px] text-muted-foreground">
            {t("No account balance connectors configured")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleAccounts.map((account) => {
              const meter = primaryProviderAccountMeter(account);
              return (
                <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3" key={account.provider}>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{account.provider}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{account.source}</div>
                    </div>
                    <Badge variant={providerAccountBadgeVariant(account.status)}>{account.status}</Badge>
                  </div>
                  {meter ? (
                    <div className="mt-3 min-w-0">
                      <div className="flex min-w-0 items-end justify-between gap-3">
                        <div className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{meter.label}</div>
                        <div className="shrink-0 text-[18px] font-semibold tracking-tight">{formatProviderAccountMeterValue(meter)}</div>
                      </div>
                      {providerAccountMeterProgress(meter) !== undefined ? (
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                          <div className={cn("h-full rounded-full", providerAccountProgressClass(account.status))} style={{ width: `${providerAccountMeterProgress(meter)}%` }} />
                        </div>
                      ) : null}
                      {meter.resetAt ? <div className="mt-2 truncate text-[11px] text-muted-foreground">{t("Resets")} {formatProviderAccountReset(meter.resetAt)}</div> : null}
                    </div>
                  ) : (
                    <div className="mt-3 truncate text-[12px] text-muted-foreground">{account.message || account.errors?.[0]?.message || t("Unavailable")}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentAnalysisView({
  agentFilter,
  error,
  loading,
  range,
  refreshAnalysis,
  setAgentFilter,
  setRange,
  snapshot
}: {
  agentFilter: AgentFilterValue;
  error: string;
  loading: boolean;
  range: UsageStatsRange;
  refreshAnalysis: () => void;
  setAgentFilter: (value: AgentFilterValue) => void;
  setRange: (range: UsageStatsRange) => void;
  snapshot: AgentAnalysisSnapshot;
}) {
  const t = useAppText();
  const totals = snapshot.totals;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-auto pr-1"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border bg-background p-0.5">
          {agentAnalysisRangeOptions.map((option) => (
            <Button
              className={cn(
                "h-7 rounded px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                range === option.value && "bg-card text-foreground shadow-sm"
              )}
              key={option.value}
              onClick={() => setRange(option.value)}
              type="button"
              unstyled
            >
              {t(option.label)}
            </Button>
          ))}
        </div>
        <Select
          aria-label={t("Filter agent")}
          className="h-8 w-[160px] bg-[length:14px] px-2 pr-7 text-[12px]"
          onValueChange={(value) => setAgentFilter(normalizeAgentFilterValue(value))}
          options={translateOptions(agentFilterOptions, t)}
          value={agentFilter}
        />
        <div className="min-w-0 flex-1" />
        <Button aria-label={t("Refresh observability")} onClick={refreshAnalysis} size="iconSm" title={t("Refresh observability")} type="button" variant="outline">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-start gap-2">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label={t("Requests")} tone="teal" value={formatCompactNumber(totals.requestCount)} />
        <MetricCard label={t("Success rate")} tone="blue" value={formatPercent(totals.successRate)} />
        <MetricCard label={t("P95")} tone="amber" value={formatDuration(totals.p95DurationMs)} />
        <MetricCard label={t("Errors")} tone="rose" value={formatCompactNumber(totals.errorCount)} />
        <MetricCard label={t("Max concurrency")} tone="indigo" value={formatCompactNumber(totals.maxConcurrentRequests)} />
        <MetricCard label={t("Cache ratio")} tone="rose" value={formatPercent(totals.cacheRatio)} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("Concurrency")}</CardTitle>
            <Badge variant="outline">{formatCompactNumber(totals.errorCount)} {t("Errors")}</Badge>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              {({ height, width }) => (
                <ComposedChart data={snapshot.concurrency} height={height} margin={{ bottom: 4, left: 0, right: 8, top: 8 }} width={width}>
                  <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" vertical={false} />
                  <XAxis axisLine={false} dataKey="label" tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} />
                  <YAxis axisLine={false} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} yAxisId="requests" />
                  <YAxis axisLine={false} hide orientation="right" yAxisId="concurrency" />
                  <Tooltip content={<UsageTooltip />} />
                  <Bar barSize={12} dataKey="requestCount" fill="#2563eb" name={t("Requests")} radius={[3, 3, 0, 0]} yAxisId="requests" />
                  <Line dataKey="maxConcurrentRequests" dot={false} name={t("Max concurrent")} stroke="#0f766e" strokeWidth={2} type="monotone" yAxisId="concurrency" />
                </ComposedChart>
              )}
            </ChartFrame>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("Agent Mix")}</CardTitle>
            <Badge variant="outline">{snapshot.agents.length}</Badge>
          </CardHeader>
          <CardContent>
            {snapshot.agents.length === 0 ? (
              <AnalysisEmptyState label={t("No agent activity")} />
            ) : (
              <div className="space-y-3">
                {snapshot.agents.map((agent) => (
                  <div className="min-w-0" key={agent.key}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                      <span className="truncate font-semibold">{t(agent.label)}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatCompactNumber(agent.totalTokens)} tokens</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(2, Math.round(agent.maxShare * 100))}%` }} />
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                      <span>{formatCompactNumber(agent.sessionCount)} {t("Sessions")}</span>
                      <span>{formatCompactNumber(agent.toolCallCount)} {t("Tools")}</span>
                      <span>{formatPercent(agent.cacheRatio)} {t("Cache")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <AgentEndpointsCard endpoints={snapshot.endpoints} />
        <AgentClientsCard clients={snapshot.clients} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,.85fr)_minmax(0,1.15fr)]">
        <AgentRoutesCard routes={snapshot.routes} />
        <AgentErrorsCard errors={snapshot.errors} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <AgentSessionsCard sessions={snapshot.sessions} />
        <AgentToolsCard tools={snapshot.tools} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,.8fr)_minmax(0,1.2fr)]">
        <AgentSubagentsCard subagents={snapshot.subagents} />
        <AgentRecentRequestsCard requests={snapshot.recentRequests} />
      </section>
    </motion.div>
  );
}

function AgentEndpointsCard({ endpoints }: { endpoints: AgentAnalysisSnapshot["endpoints"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Endpoint Health")}</CardTitle>
        <Badge variant="outline">{endpoints.length}</Badge>
      </CardHeader>
      <CardContent>
        {endpoints.length === 0 ? (
          <AnalysisEmptyState label={t("No endpoint activity")} />
        ) : (
          <div className="max-h-[380px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[980px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Path")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Success rate")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("P95")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Max concurrent")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Status codes")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {endpoints.map((endpoint) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={endpoint.key}>
                    <td className="max-w-[260px] px-3 py-2" title={`${endpoint.method} ${endpoint.path}`}>
                      <span className="font-mono font-semibold">{endpoint.method}</span> {endpoint.path}
                    </td>
                    <td className="px-3 py-2">{t(agentKindLabel(endpoint.agent))}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(endpoint.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(endpoint.successRate)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(endpoint.p95DurationMs)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(endpoint.maxConcurrentRequests)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(endpoint.cacheRatio)}</td>
                    <td className="px-3 py-2">{formatStatusCodeCounts(endpoint.statusCodes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentClientsCard({ clients }: { clients: AgentAnalysisSnapshot["clients"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Client Signals")}</CardTitle>
        <Badge variant="outline">{clients.length}</Badge>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <AnalysisEmptyState label={t("No client signals")} />
        ) : (
          <div className="max-h-[380px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[720px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Client")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Sessions")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Success rate")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("P95")}</th>
                  <th className="px-3 py-2 font-semibold">{t("UA")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {clients.map((client) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={client.key}>
                    <td className="max-w-[160px] px-3 py-2 font-semibold" title={client.label}>{client.label}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(client.agent))}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(client.sessionCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(client.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(client.successRate)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(client.p95DurationMs)}</td>
                    <td className="max-w-[260px] px-3 py-2 font-mono" title={client.userAgent}>{compactUserAgent(client.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentRoutesCard({ routes }: { routes: AgentAnalysisSnapshot["routes"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Route Observability")}</CardTitle>
        <Badge variant="outline">{routes.length}</Badge>
      </CardHeader>
      <CardContent>
        {routes.length === 0 ? (
          <AnalysisEmptyState label={t("No route activity")} />
        ) : (
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[700px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Success rate")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("P95")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {routes.map((route) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={route.key}>
                    <td className="max-w-[180px] px-3 py-2 font-semibold" title={route.routeReason}>{route.routeReason}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(route.agent))}</td>
                    <td className="max-w-[220px] px-3 py-2" title={`${route.provider}/${route.model}`}>{route.provider}/{route.model}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(route.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(route.successRate)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(route.p95DurationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentErrorsCard({ errors }: { errors: AgentAnalysisSnapshot["errors"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Recent Errors")}</CardTitle>
        <Badge variant="outline">{errors.length}</Badge>
      </CardHeader>
      <CardContent>
        {errors.length === 0 ? (
          <AnalysisEmptyState label={t("No errors")} />
        ) : (
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[900px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Time")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Path")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {errors.map((error) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={error.id}>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(error.createdAt)}</td>
                    <td className="px-3 py-2 font-semibold" title={error.error}>{error.statusCode || "-"}</td>
                    <td className="max-w-[260px] px-3 py-2" title={`${error.method} ${error.path}`}>{error.method} {error.path}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(error.agent))}</td>
                    <td className="max-w-[140px] px-3 py-2" title={error.routeReason}>{error.routeReason || "-"}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(error.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentSessionsCard({ sessions }: { sessions: AgentAnalysisSnapshot["sessions"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Sessions")}</CardTitle>
        <Badge variant="outline">{sessions.length}</Badge>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <AnalysisEmptyState label={t("No session activity")} />
        ) : (
          <div className="max-h-[380px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[1120px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Session")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Client")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tools")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Subagents")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Max concurrent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Top tools")}</th>
                  <th className="px-3 py-2 font-semibold">{t("UA")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Last seen")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sessions.map((session) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={`${session.agent}:${session.id}`}>
                    <td className="max-w-[180px] px-3 py-2 font-mono font-semibold" title={session.id}>{compactId(session.id)}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(session.agent))}</td>
                    <td className="max-w-[150px] px-3 py-2" title={session.client}>{session.client}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.toolCallCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.subagentCallCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.cacheTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.maxConcurrentRequests)}</td>
                    <td className="max-w-[220px] px-3 py-2" title={formatToolCounts(session.topTools)}>{formatToolCounts(session.topTools) || "-"}</td>
                    <td className="max-w-[220px] px-3 py-2 font-mono" title={session.userAgent}>{compactUserAgent(session.userAgent)}</td>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(session.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentToolsCard({ tools }: { tools: AgentAnalysisSnapshot["tools"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Tool Usage")}</CardTitle>
        <Badge variant="outline">{tools.length}</Badge>
      </CardHeader>
      <CardContent>
        {tools.length === 0 ? (
          <AnalysisEmptyState label={t("No tool calls")} />
        ) : (
          <div className="max-h-[380px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[560px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Tool")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tool calls")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Sessions")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {tools.map((tool) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={tool.name}>
                    <td className="max-w-[220px] px-3 py-2 font-semibold" title={tool.name}>{tool.name}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(tool.count)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(tool.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(tool.sessions)}</td>
                    <td className="px-3 py-2">{tool.agents.map(agentKindLabel).map(t).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentSubagentsCard({ subagents }: { subagents: AgentAnalysisSnapshot["subagents"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Subagent Routing")}</CardTitle>
        <Badge variant="outline">{subagents.length}</Badge>
      </CardHeader>
      <CardContent>
        {subagents.length === 0 ? (
          <AnalysisEmptyState label={t("No subagent calls")} />
        ) : (
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[620px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Session")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {subagents.map((subagent) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={`${subagent.agent}:${subagent.sessionId}:${subagent.provider}:${subagent.model}`}>
                    <td className="max-w-[160px] px-3 py-2 font-mono font-semibold" title={subagent.sessionId}>{compactId(subagent.sessionId)}</td>
                    <td className="max-w-[240px] px-3 py-2" title={`${subagent.provider}/${subagent.model}`}>{subagent.provider}/{subagent.model}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(subagent.count)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(subagent.totalTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(subagent.cacheReadTokens + subagent.cacheWriteTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentRecentRequestsCard({ requests }: { requests: AgentAnalysisSnapshot["recentRequests"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Recent Requests")}</CardTitle>
        <Badge variant="outline">{requests.length}</Badge>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <AnalysisEmptyState label={t("No recent agent requests")} />
        ) : (
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[1240px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Time")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Client")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Session")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tools")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Subagents")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Concurrency")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {requests.map((request) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={request.id}>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(request.createdAt)}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(request.agent))}</td>
                    <td className="max-w-[160px] px-3 py-2" title={request.userAgent || request.client}>{request.client}</td>
                    <td className="px-3 py-2 font-semibold">{request.statusCode || "-"}</td>
                    <td className="max-w-[150px] px-3 py-2 font-mono font-semibold" title={request.sessionId}>{compactId(request.sessionId)}</td>
                    <td className="max-w-[130px] px-3 py-2" title={request.routeReason}>{request.routeReason || "-"}</td>
                    <td className="max-w-[240px] px-3 py-2" title={`${request.provider}/${request.model}`}>{request.provider}/{request.model}</td>
                    <td className="px-3 py-2 text-right" title={request.tools.join(", ")}>{formatCompactNumber(request.toolCallCount)}</td>
                    <td className="px-3 py-2 text-right">{request.subagentModel ? request.subagentModel : "-"}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(request.cacheReadTokens + request.cacheWriteTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(request.concurrentRequests)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(request.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnalysisEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">
      {label}
    </div>
  );
}

type UsageAnalysisColumn = {
  key: "client" | "model" | "provider";
  label: string;
};

function UsageAnalysisCard({
  columns,
  emptyLabel,
  rows,
  title
}: {
  columns: UsageAnalysisColumn[];
  emptyLabel: string;
  rows: UsageComparisonRow[];
  title: string;
}) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant="outline">{rows.length}</Badge>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[760px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  {columns.map((column) => (
                    <th className="px-3 py-2 font-semibold" key={column.key}>{column.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Input")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Output")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache rate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((row) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={row.key}>
                    {columns.map((column) => (
                      <td className="max-w-[180px] px-3 py-2 font-medium" key={column.key}>
                        <span className="block truncate" title={row[column.key] ?? "unknown"}>{row[column.key] ?? "unknown"}</span>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold">{formatCompactNumber(row.totalTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.inputTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.outputTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.cacheTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(row.cacheRatio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type UsageTooltipPayloadItem = {
  color?: string;
  name?: string;
  payload?: UsageSeriesPoint;
  value?: number | string;
};

type RequestHealthBarLabelProps = {
  payload?: UsageSeriesPoint;
  value?: number | string;
  width?: number | string;
  x?: number | string;
  y?: number | string;
};

function RequestHealthBarLabel({ payload, value, width, x, y }: RequestHealthBarLabelProps) {
  const requestCount = Number(value ?? payload?.requestCount ?? 0);
  const xValue = Number(x);
  const yValue = Number(y);
  const widthValue = Number(width);
  if (!payload || requestCount <= 0 || !Number.isFinite(xValue) || !Number.isFinite(yValue) || !Number.isFinite(widthValue)) {
    return null;
  }

  const label = `${formatPercent(payload.successRate)} / ${formatCompactNumber(payload.errorCount)}`;
  return (
    <text
      className="fill-muted-foreground"
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
      x={xValue + widthValue / 2}
      y={Math.max(12, yValue - 7)}
    >
      {label}
    </text>
  );
}

function UsageTooltip({
  active,
  label,
  payload
}: {
  active?: boolean;
  label?: string;
  payload?: UsageTooltipPayloadItem[];
}) {
  const t = useAppText();
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload.find((item) => item.payload)?.payload;

  return (
    <div className="rounded-lg border border-border/60 bg-card/95 glass-surface px-3 py-2.5 text-[11px] shadow-card-elevated">
      <div className="mb-1 font-semibold">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div className="flex min-w-[150px] items-center justify-between gap-4" key={item.name}>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || "#0f766e" }} />
              {item.name}
            </span>
            <span className="font-medium">{formatCompactNumber(Number(item.value) || 0)}</span>
          </div>
        ))}
        {point ? (
          <>
            <div className="flex min-w-[150px] items-center justify-between gap-4 border-t border-border/60 pt-1">
              <span className="text-muted-foreground">{t("Success rate")}</span>
              <span className="font-medium">{formatPercent(point.successRate)}</span>
            </div>
            <div className="flex min-w-[150px] items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("Failed requests")}</span>
              <span className="font-medium">{formatCompactNumber(point.errorCount)}</span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ChartFrame({ children }: { children: (size: { height: number; width: number }) => ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = (width: number, height: number) => {
      const next = {
        height: Math.max(0, Math.floor(height)),
        width: Math.max(0, Math.floor(width))
      };
      setSize((current) => (current.height === next.height && current.width === next.width ? current : next));
    };

    const rect = container.getBoundingClientRect();
    updateSize(rect.width, rect.height);

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-[260px] min-w-0" ref={containerRef}>
      {size.height > 0 && size.width > 0 ? children(size) : null}
    </div>
  );
}

function TokenTooltip({
  active,
  label,
  payload
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ value?: number | string }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/95 glass-surface px-3 py-2.5 text-[11px] shadow-card-elevated">
      <div className="font-semibold">{label}</div>
      <div className="mt-1 text-muted-foreground">{formatCompactNumber(Number(payload[0]?.value) || 0)} tokens</div>
    </div>
  );
}

function ApiKeysView({
  addApiKey,
  apiKeys,
  editApiKey,
  error,
  notify,
  removeApiKey
}: {
  addApiKey: () => void;
  apiKeys: ApiKeyListItem[];
  editApiKey: (index: number) => void;
  error: string;
  notify: (message: string) => void;
  removeApiKey: (index: number) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleApiKeys = useMemo(
    () => apiKeys.filter((apiKey) => apiKeyMatchesQuery(apiKey, normalizedQuery)),
    [apiKeys, normalizedQuery]
  );

  async function copyApiKey(apiKey: ApiKeyListItem) {
    await copyTextToClipboard(apiKey.keyValue);
    notify(t("Copied API key"));
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search API keys")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search API keys")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add API key")} onClick={addApiKey} title={t("Add API key")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {error ? <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-start gap-2"><CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span></div> : null}
          {apiKeys.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <KeyRound className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No API keys configured")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Add to create one")}</div>
            </div>
          ) : null}
          {apiKeys.length > 0 && visibleApiKeys.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching API keys")}</div>
          ) : null}
          {visibleApiKeys.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(140px,0.7fr)_minmax(390px,1.7fr)_132px_minmax(160px,0.7fr)_76px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Key")}</div>
                  <div className="truncate">{t("Expires")}</div>
                  <div className="truncate">{t("Limits")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {visibleApiKeys.map((apiKey) => (
                    <AnimatedListItem
                      className="grid min-h-[58px] grid-cols-[minmax(140px,0.7fr)_minmax(390px,1.7fr)_132px_minmax(160px,0.7fr)_76px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                      key={`${apiKey.keyValue}-${apiKey.index}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold" title={apiKey.name}>{apiKey.name}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="break-all text-[12px] font-semibold leading-5" title={apiKey.keyValue}>
                          <span className="font-mono">{apiKey.keyValue}</span>
                          <Button
                            className="ml-1.5 align-[-6px]"
                            aria-label={t("Copy API key")}
                            onClick={() => void copyApiKey(apiKey)}
                            size="iconSm"
                            title={t("Copy API key")}
                            type="button"
                            variant="ghost"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={t(formatApiKeyExpiration(apiKey))}>
                        {t(formatApiKeyExpiration(apiKey))}
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={t(formatApiKeyLimits(apiKey.limits))}>
                        {t(formatApiKeyLimits(apiKey.limits))}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button aria-label={t("Edit API key")} onClick={() => editApiKey(apiKey.index)} size="iconSm" title={t("Edit API key")} type="button" variant="ghost">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button aria-label={t("Remove API key")} onClick={() => removeApiKey(apiKey.index)} size="iconSm" title={t("Remove API key")} type="button" variant="ghost">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </AnimatedListItem>
                  ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function AddApiKeyDialog({
  canSubmit,
  draft,
  error,
  onChange,
  onClose,
  onSubmit
}: {
  canSubmit: boolean;
  draft: AddApiKeyDraft;
  error: string;
  onChange: (patch: Partial<AddApiKeyDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();
  const expirationOptions = translateOptions(apiKeyExpirationOptions, t);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Add API Key")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2" layout transition={disclosureSpringTransition}>
            <Field label={t("Name")}>
              <Input autoFocus value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
            </Field>
            <Field label={t("Expiration")}>
              <SelectControl
                value={draft.expirationPreset}
                onChange={(expirationPreset) => onChange({ expirationPreset: expirationPreset as ApiKeyExpirationPreset })}
                options={expirationOptions}
              />
            </Field>
            {draft.expirationPreset === "custom" ? (
              <Field className="sm:col-span-2" label={t("Expires at")}>
                <Input type="datetime-local" value={draft.expiresAt} onChange={(event) => onChange({ expiresAt: event.target.value })} />
              </Field>
            ) : null}
          </motion.div>
          <ApiKeyAdvancedSettings draft={draft} onChange={onChange} />

          {error ? <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-start gap-2"><CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span></div> : null}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditApiKeyDialog({
  canSubmit,
  draft,
  error,
  onChange,
  onClose,
  onSubmit
}: {
  canSubmit: boolean;
  draft: AddApiKeyDraft;
  error: string;
  onChange: (patch: Partial<AddApiKeyDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();
  const expirationOptions = translateOptions(apiKeyExpirationOptions, t);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Edit API Key")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Expiration")}>
              <SelectControl
                value={draft.expirationPreset}
                onChange={(expirationPreset) => onChange({ expirationPreset: expirationPreset as ApiKeyExpirationPreset })}
                options={expirationOptions}
              />
            </Field>
            {draft.expirationPreset === "custom" ? (
              <Field label={t("Expires at")}>
                <Input type="datetime-local" value={draft.expiresAt} onChange={(event) => onChange({ expiresAt: event.target.value })} />
              </Field>
            ) : null}
          </div>

          <ApiKeyAdvancedSettings defaultOpen draft={draft} onChange={onChange} />

          {error ? <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-start gap-2"><CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span></div> : null}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            <Check className="h-4 w-4" />
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeyAdvancedSettings({
  defaultOpen = false,
  draft,
  onChange
}: {
  defaultOpen?: boolean;
  draft: AddApiKeyDraft;
  onChange: (patch: Partial<AddApiKeyDraft>) => void;
}) {
  const t = useAppText();
  const limitMetricOptions = translateOptions(apiKeyLimitMetricOptions, t);
  const limitWindowSelectOptions = translateOptions(limitWindowOptions, t);
  const [advancedOpen, setAdvancedOpen] = useState(defaultOpen);
  const updateLimitRow = (id: string, patch: Partial<ApiKeyLimitDraftRow>) => {
    onChange({
      limitRows: draft.limitRows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    });
  };
  const addLimitRow = () => {
    const row = createApiKeyLimitDraftRow();
    if (row) {
      onChange({ limitRows: [...draft.limitRows, row] });
    }
  };
  const removeLimitRow = (id: string) => {
    onChange({ limitRows: draft.limitRows.filter((row) => row.id !== id) });
  };

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border bg-background">
      <Button
        aria-expanded={advancedOpen}
        className="flex h-10 w-full items-center justify-between gap-3 px-3 text-left text-[12px] font-medium transition-colors hover:bg-muted/40"
        onClick={() => setAdvancedOpen((value) => !value)}
        type="button"
        unstyled
      >
        <span className="min-w-0 truncate">{t("Advanced settings")}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
      </Button>
      <AnimatePresence initial={false}>
        {advancedOpen ? (
          <AnimatedDisclosure key="api-key-advanced">
            <div className="space-y-2 border-t border-border p-3">
              {draft.limitRows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-5 text-center text-[12px] text-muted-foreground">
                  {t("No limits configured")}
                </div>
              ) : null}
              <AnimatePresence initial={false}>
                {draft.limitRows.map((row) => (
                  <AnimatedListItem className="grid grid-cols-[minmax(110px,0.9fr)_126px_minmax(0,1fr)_28px] gap-2" key={row.id}>
                    <SelectControl
                      value={row.metric}
                      onChange={(metric) => updateLimitRow(row.id, { metric: metric as ApiKeyLimitMetric })}
                      options={limitMetricOptions}
                    />
                    <SelectControl
                      value={row.window}
                      onChange={(window) => updateLimitRow(row.id, { window: window as LimitWindowPreset })}
                      options={limitWindowSelectOptions}
                    />
                    <Input type="number" value={row.value} onChange={(event) => updateLimitRow(row.id, { value: event.target.value })} />
                    <Button aria-label={t("Remove limit")} onClick={() => removeLimitRow(row.id)} size="iconSm" title={t("Remove limit")} type="button" variant="ghost">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AnimatedListItem>
                ))}
              </AnimatePresence>
              <Button onClick={addLimitRow} size="sm" type="button" variant="outline">
                <Plus className="h-3.5 w-3.5" />
                {t("Add limit")}
              </Button>
            </div>
          </AnimatedDisclosure>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ServerView({
  actionBusy,
  actionError,
  actionMessage,
  applyClaudeAppGateway,
  config,
  installProxyCertificate,
  onProxyEnabledChange,
  onProxyNetworkCaptureChange,
  onProxySystemProxyChange,
  proxyCertificateChecking,
  proxyCertificateStatus,
  proxyStatus,
  refreshProxyCertificateStatus,
  restartProxy,
  updateConfig
}: {
  actionBusy: ServerActionBusy;
  actionError: string;
  actionMessage: string;
  applyClaudeAppGateway: () => void;
  config: AppConfig;
  installProxyCertificate: () => void;
  onProxyEnabledChange: (checked: boolean) => void;
  onProxyNetworkCaptureChange: (enabled: boolean) => void;
  onProxySystemProxyChange: (enabled: boolean) => void;
  proxyCertificateChecking: boolean;
  proxyCertificateStatus: ProxyCertificateStatus;
  proxyStatus: ProxyStatus;
  refreshProxyCertificateStatus: () => void;
  restartProxy: () => void;
  updateConfig: (mutator: (config: AppConfig) => AppConfig) => void;
}) {
  const t = useAppText();
  const trustSteps = proxyCertificateTrustSteps(proxyCertificateStatus);
  const claudeAppEndpoint = endpointFromHostPort(config.gateway.host || config.HOST, config.gateway.port || config.PORT);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-3xl"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t("Server")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Host")}>
              <Input
                value={config.HOST}
                onChange={(event) => updateConfig((next) => {
                  const host = event.target.value;
                  return {
                    ...next,
                    HOST: host,
                    gateway: { ...next.gateway, host },
                    routerEndpoint: endpointFromHostPort(host, next.PORT)
                  };
                })}
              />
            </Field>
            <Field label={t("Port")}>
              <Input
                type="number"
                value={String(config.PORT)}
                onChange={(event) => updateConfig((next) => {
                  const port = numberValue(event.target.value);
                  return {
                    ...next,
                    PORT: port,
                    gateway: { ...next.gateway, port },
                    routerEndpoint: endpointFromHostPort(next.HOST, port)
                  };
                })}
              />
            </Field>
            <Field className="sm:col-span-2" label={t("Proxy mode")}>
              <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {proxyCertificateChecking ? t("Checking CA certificate...") : config.proxy.enabled ? t("Enabled") : t("Disabled")}
                </span>
                <Toggle checked={config.proxy.enabled} disabled={proxyCertificateChecking} onChange={onProxyEnabledChange} />
              </div>
            </Field>
            {config.proxy.enabled ? (
              <>
                <Field label={t("System proxy")}>
                  <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {config.proxy.systemProxy ? t("Enabled") : t("Disabled")}
                    </span>
                    <Toggle checked={config.proxy.systemProxy} onChange={onProxySystemProxyChange} />
                  </div>
                </Field>
                <Field label={t("Capture network")}>
                  <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {config.proxy.captureNetwork ? t("Enabled") : t("Disabled")}
                    </span>
                    <Toggle checked={config.proxy.captureNetwork} onChange={onProxyNetworkCaptureChange} />
                  </div>
                </Field>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-3">
            <div className="min-w-0">
              <div className="text-[12px] font-medium">{t("Claude App Gateway")}</div>
              <div className="break-all font-mono text-[11px] text-muted-foreground">{claudeAppEndpoint}</div>
            </div>
            <Button disabled={Boolean(actionBusy)} onClick={applyClaudeAppGateway} size="sm" type="button" variant="outline">
              {actionBusy === "claude-app" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Route className="h-3.5 w-3.5" />}
              {t("Configure Claude App")}
            </Button>
          </div>

          {config.proxy.enabled || !proxyCertificateStatus.trusted ? (
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[12px] font-medium">{t("CA certificate")}</span>
                <Badge variant={certificateStatusVariant(proxyCertificateStatus)}>
                  {t(certificateStatusLabel(proxyCertificateStatus))}
                </Badge>
              </div>
              {!proxyCertificateStatus.trusted ? (
                <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <div className="font-medium">{proxyCertificateStatus.message}</div>
                  <div className="grid gap-1.5">
                    {trustSteps.map((step, index) => (
                      <div className="flex gap-2" key={step}>
                        <span className="shrink-0 font-semibold">{index + 1}.</span>
                        <span className="min-w-0">{step}</span>
                      </div>
                    ))}
                  </div>
                  <div className="break-all font-mono text-[11px] text-amber-950/80">{proxyCertificateStatus.caCertFile}</div>
                </div>
              ) : null}
              {config.proxy.enabled ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[12px] font-medium">{t("Proxy status")}</span>
                  <StatusBadge state={proxyStatus.state} />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={Boolean(actionBusy) || !proxyCertificateStatus.canInstall} onClick={installProxyCertificate} size="sm" type="button" variant="outline">
                  {actionBusy === "cert" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {t("Install CA")}
                </Button>
                <Button disabled={Boolean(actionBusy) || proxyCertificateChecking} onClick={refreshProxyCertificateStatus} size="sm" type="button" variant="outline">
                  {proxyCertificateChecking ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {t("Check Trust")}
                </Button>
                {config.proxy.enabled ? (
                  <Button disabled={Boolean(actionBusy)} onClick={restartProxy} size="sm" type="button" variant="outline">
                    {actionBusy === "proxy" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {t("Restart Proxy")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {actionError || actionMessage ? (
            <div className={cn(
              "whitespace-pre-wrap rounded-lg border px-3 py-2 text-[12px]",
              actionError ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border/60 bg-background/80 text-muted-foreground"
            )}>
              {actionError || actionMessage}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ProfileView({
  addProfile,
  applyError,
  config,
  editProfile,
  removeProfile,
  updateProfileItem
}: {
  addProfile: (agent?: ProfileConfig["agent"]) => void;
  applyError: string;
  config: AppConfig;
  editProfile: (index: number) => void;
  removeProfile: (index: number) => void;
  updateProfileItem: (index: number, patch: Partial<ProfileConfig>) => void;
}) {
  const t = useAppText();
  const profiles = config.profile.profiles;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-4xl"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>{t("Agent access")}</CardTitle>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t("Choose where each agent uses CCR. Keep advanced paths hidden unless you need global or custom installs.")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={() => addProfile()} size="sm" type="button">
                <Plus className="h-3.5 w-3.5" />
                {t("Add profile")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {profiles.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-[12px] text-muted-foreground">
                {t("No profiles configured")}
              </div>
            ) : null}
            {profiles.map((profile, index) => {
              const scope = normalizeProfileScope(profile.scope);
              const surface = normalizeProfileSurface(profile.surface);
              const summaryItems = profileSummaryItems(profile, config, t);

              return (
                <div className="rounded-md border border-border bg-muted/20 p-3" key={profile.id}>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <AgentLogo agent={profile.agent} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="min-w-0 max-w-[180px] truncate text-[13px] font-semibold sm:max-w-[260px] md:max-w-[320px]">{profile.name || t("Unnamed")}</span>
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {!profile.enabled ? <Badge variant="outline">{t("Disabled")}</Badge> : null}
                            <Badge variant="secondary">{t(profileAgentLabel(profile.agent))}</Badge>
                            <Badge variant={scope === "ccr" ? "success" : scope === "global" ? "warning" : "outline"}>
                              {t(profileScopeLabel(scope))}
                            </Badge>
                            <Badge variant="outline">{t(profileSurfaceLabel(surface))}</Badge>
                          </div>
                        </div>
                        <div className="mt-2 min-w-0 space-y-1.5">
                          {summaryItems.map((item) => (
                            <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-baseline gap-2 text-[12px] sm:grid-cols-[128px_minmax(0,1fr)]" key={item.label}>
                              <div className="truncate text-muted-foreground">{item.label}</div>
                              <div className="min-w-0 truncate font-medium text-foreground" title={item.value}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Toggle checked={profile.enabled} onChange={(enabled) => updateProfileItem(index, { enabled })} />
                      <Button aria-label={`${t("Edit")} ${profile.name || t("Profile")}`} onClick={() => editProfile(index)} size="iconSm" title={t("Edit")} type="button" variant="ghost">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button aria-label={t("Remove profile")} onClick={() => removeProfile(index)} size="iconSm" title={t("Remove profile")} type="button" variant="ghost">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {applyError ? (
            <div className="whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {applyError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ProfileAgentTabs({
  activeAgent,
  profiles,
  setActiveAgent
}: {
  activeAgent: ProfileConfig["agent"];
  profiles: ProfileConfig[];
  setActiveAgent: (agent: ProfileConfig["agent"]) => void;
}) {
  const t = useAppText();

  return (
    <div
      aria-label={t("Agent profiles")}
      className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/20 p-1"
      role="tablist"
    >
      {profileAgentOptions.map((option) => {
        const agent = option.value;
        const selected = activeAgent === agent;
        const count = profiles.filter((profile) => profile.agent === agent).length;

        return (
          <button
            aria-selected={selected}
            className={cn(
              "flex h-11 min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
              selected
                ? "bg-background text-foreground shadow-card"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
            key={agent}
            onClick={() => setActiveAgent(agent)}
            role="tab"
            type="button"
          >
            <AgentLogo agent={agent} className="h-6 w-6 rounded-[5px]" />
            <span className="min-w-0 flex-1 truncate">{t(profileAgentLabel(agent))}</span>
            <Badge className="shrink-0" variant={selected ? "secondary" : "outline"}>
              {count}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

function AgentSelectControl({
  onChange,
  value
}: {
  onChange: (agent: ProfileConfig["agent"]) => void;
  value: ProfileConfig["agent"];
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        aria-controls="profile-agent-select-options"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-[12px] font-medium shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-[background-color,border-color,box-shadow,color] hover:border-muted-foreground/45 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/40"
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        type="button"
      >
        <AgentLogo agent={value} className="h-5 w-5 rounded-[5px]" />
        <span className="min-w-0 flex-1 truncate">{t(profileAgentLabel(value))}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute left-0 right-0 top-full z-50 mt-1"
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <PopoverContent
              className="overflow-hidden p-1"
              id="profile-agent-select-options"
              role="listbox"
            >
              {profileAgentOptions.map((option) => {
                const agent = option.value;
                const selected = value === agent;

                return (
                  <button
                    aria-selected={selected}
                    className={cn(
                      "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
                      selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                    )}
                    key={agent}
                    onClick={() => {
                      onChange(agent);
                      setOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <AgentLogo agent={agent} className="h-6 w-6 rounded-[5px]" />
                    <span className="min-w-0 flex-1 truncate">{t(profileAgentLabel(agent))}</span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                );
              })}
            </PopoverContent>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProfileModelSelector({
  onChange,
  placeholder,
  providers,
  value
}: {
  onChange: (value: string) => void;
  placeholder?: string;
  providers: GatewayProviderConfig[];
  value: string;
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [popoverLayout, setPopoverLayout] = useState<{
    gridHeight: number;
    left: number;
    maxHeight: number;
    offset: number;
    placement: "above" | "below";
    width: number;
  }>();
  const parsedValue = useMemo(() => parseProfileModelValue(value, providers), [providers, value]);
  const providerOptions = useMemo(() => profileModelProviderOptions(providers), [providers]);
  const filteredProviders = useMemo(
    () => providerOptions.filter((provider) => profileModelProviderMatchesQuery(provider, query)),
    [providerOptions, query]
  );
  const [activeProviderName, setActiveProviderName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const activeProvider =
    filteredProviders.find((provider) => provider.name === activeProviderName) ??
    filteredProviders.find((provider) => provider.name === parsedValue.provider) ??
    filteredProviders[0];
  const filteredModels = activeProvider
    ? activeProvider.models.filter((model) => profileModelMatchesQuery(activeProvider.name, model, query))
    : [];
  const displayValue = profileModelDisplayValue(value, parsedValue, providers, placeholder);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverLayout(undefined);
      return;
    }

    function updatePopoverLayout() {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const anchor = root.getBoundingClientRect();
      const margin = 12;
      const gap = 6;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = Math.max(240, viewportWidth - margin * 2);
      const width = Math.min(560, availableWidth);
      const left = Math.min(Math.max(margin, anchor.left), viewportWidth - margin - width);
      const below = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
      const above = Math.max(0, anchor.top - margin - gap);
      const placement = below < 240 && above > below ? "above" : "below";
      const availableHeight = Math.max(144, placement === "above" ? above : below);
      const maxHeight = Math.min(360, availableHeight);
      const gridHeight = Math.max(128, Math.min(280, maxHeight - 58));
      setPopoverLayout({
        gridHeight,
        left,
        maxHeight,
        offset: placement === "above" ? viewportHeight - anchor.top + gap : anchor.bottom + gap,
        placement,
        width
      });
    }

    updatePopoverLayout();
    window.addEventListener("resize", updatePopoverLayout);
    window.addEventListener("scroll", updatePopoverLayout, true);
    return () => {
      window.removeEventListener("resize", updatePopoverLayout);
      window.removeEventListener("scroll", updatePopoverLayout, true);
    };
  }, [open]);

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

  useEffect(() => {
    if (!open) {
      return;
    }
    if (activeProviderName && filteredProviders.some((provider) => provider.name === activeProviderName)) {
      return;
    }
    setActiveProviderName(parsedValue.provider || filteredProviders[0]?.name || "");
  }, [activeProviderName, filteredProviders, open, parsedValue.provider]);

  function chooseModel(providerName: string, model: string) {
    onChange(`${providerName}/${model}`);
    setOpen(false);
    setQuery("");
    setActiveProviderName(providerName);
  }

  function openSelector() {
    setOpen(true);
    setQuery("");
    setActiveProviderName(parsedValue.provider || providerOptions[0]?.name || "");
  }

  function clearValue(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onChange("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <div
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-[12px] shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-[background-color,border-color,box-shadow,color] hover:border-muted-foreground/45 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/40",
          !value.trim() && "text-muted-foreground"
        )}
      >
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className="min-w-0 flex-1 truncate text-left outline-none"
          onClick={openSelector}
          type="button"
        >
          {displayValue}
        </button>
        {value.trim() ? (
          <button
            aria-label={t("Clear")}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
            onClick={clearValue}
            title={t("Clear")}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          aria-label={open ? t("Collapse") : t("Expand")}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
          onClick={openSelector}
          title={open ? t("Collapse") : t("Expand")}
          type="button"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="fixed z-[70]"
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            style={popoverLayout
              ? {
                left: `${popoverLayout.left}px`,
                maxHeight: `${popoverLayout.maxHeight}px`,
                width: `${popoverLayout.width}px`,
                ...(popoverLayout.placement === "above"
                  ? { bottom: `${popoverLayout.offset}px` }
                  : { top: `${popoverLayout.offset}px` })
              }
              : undefined}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <PopoverContent className="w-full overflow-hidden p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  aria-label={t("Search models")}
                  className="h-9 pl-8"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("Search providers or models")}
                  value={query}
                />
              </div>

              {providerOptions.length === 0 ? (
                <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">
                  {t("No models configured")}
                </div>
              ) : (
                <div
                  className="mt-2 grid grid-cols-[minmax(112px,0.38fr)_minmax(0,1fr)] overflow-hidden rounded-md border border-border"
                  style={{ height: `${popoverLayout?.gridHeight ?? 220}px` }}
                >
                  <div className="min-w-0 overflow-auto border-r border-border bg-muted/30 p-1">
                    {filteredProviders.length === 0 ? (
                      <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">{t("No matching providers")}</div>
                    ) : null}
                    {filteredProviders.map((provider) => {
                      const active = provider.name === activeProvider?.name;
                      return (
                        <button
                          className={cn(
                            "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/25",
                            active && "bg-background text-primary"
                          )}
                          key={provider.name}
                          onClick={() => setActiveProviderName(provider.name)}
                          type="button"
                        >
                          <span className="min-w-0 flex-1 truncate">{provider.name}</span>
                          <Badge className="shrink-0" variant="outline">{provider.models.length}</Badge>
                        </button>
                      );
                    })}
                  </div>
                  <div className="min-w-0 overflow-auto bg-background p-1">
                    {!activeProvider ? (
                      <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
                    ) : null}
                    {activeProvider && filteredModels.length === 0 ? (
                      <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
                    ) : null}
                    {activeProvider && filteredModels.map((model) => {
                      const selected = parsedValue.provider === activeProvider.name && parsedValue.model === model;
                      return (
                        <button
                          className={cn(
                            "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/25",
                            selected && "bg-primary/10 text-primary"
                          )}
                          key={`${activeProvider.name}/${model}`}
                          onClick={() => chooseModel(activeProvider.name, model)}
                          type="button"
                        >
                          <span className="min-w-0 flex-1 truncate font-mono">{model}</span>
                          {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </PopoverContent>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AddProfileForm({
  draft,
  error,
  onChange,
  providers
}: {
  draft: AddProfileDraft;
  error: string;
  onChange: (patch: Partial<AddProfileDraft>) => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("Agent")}>
          <AgentSelectControl
            onChange={(agent) => onChange({ agent })}
            value={draft.agent}
          />
        </Field>
        <Field label={t("Profile name")}>
          <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        <Field label={t("Effect scope")}>
          <SelectControl
            onChange={(scope) => onChange({ scope: normalizeProfileScope(scope) })}
            options={translateOptions(profileScopeOptions, t)}
            value={draft.scope}
          />
        </Field>
        <Field label={t("Entry mode")}>
          <SelectControl
            onChange={(surface) => onChange({ surface: normalizeProfileSurface(surface) })}
            options={translateOptions(profileSurfaceOptions, t)}
            value={draft.surface}
          />
        </Field>
        {draft.agent === "claude-code" ? (
          <>
            {!profileScopeUsesGeneratedPath(draft.scope) ? (
              <Field className="sm:col-span-2" label={t("Settings file")}>
                <Input value={draft.settingsFile} onChange={(event) => onChange({ settingsFile: event.target.value })} />
              </Field>
            ) : (
              <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
                {t("CCR manages an isolated Claude Code settings file for this profile.")}
              </div>
            )}
            <Field label={t("Model override")}>
              <ProfileModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.model}
                onChange={(model) => onChange({ model })}
              />
            </Field>
            <Field label={t("Small fast model")}>
              <ProfileModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.smallFastModel}
                onChange={(smallFastModel) => onChange({ smallFastModel })}
              />
            </Field>
          </>
        ) : (
          <>
            {!profileScopeUsesGeneratedPath(draft.scope) ? (
              <Field className="sm:col-span-2" label={t("Config file")}>
                <Input value={draft.configFile} onChange={(event) => onChange({ configFile: event.target.value })} />
              </Field>
            ) : (
              <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
                {t("CCR manages an isolated Codex config file for this profile.")}
              </div>
            )}
            <Field label={t("Config format")}>
              <SelectControl
                onChange={(configFormat) => onChange({ configFormat: normalizeCodexConfigFormat(configFormat) })}
                options={translateOptions(codexConfigFormatOptions, t)}
                value={draft.configFormat}
              />
            </Field>
            <Field label={t("Codex home")}>
              <Input value={draft.codexHome} onChange={(event) => onChange({ codexHome: event.target.value })} />
            </Field>
            <Field label={t("Provider ID")}>
              <Input value={draft.providerId} onChange={(event) => onChange({ providerId: event.target.value })} />
            </Field>
            <Field label={t("Provider name")}>
              <Input value={draft.providerName} onChange={(event) => onChange({ providerName: event.target.value })} />
            </Field>
            <Field label={t("Remote frontend")}>
              <SelectControl
                onChange={(remoteFrontendMode) => onChange({ remoteFrontendMode: normalizeCodexRemoteFrontendMode(remoteFrontendMode) })}
                options={translateOptions(codexRemoteFrontendModeOptions, t)}
                value={draft.remoteFrontendMode}
              />
            </Field>
            <Field label={t("CLI middleware")}>
              <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {draft.cliMiddleware ? t("Enabled") : t("Disabled")}
                </span>
                <Toggle checked={draft.cliMiddleware} onChange={(cliMiddleware) => onChange({ cliMiddleware })} />
              </div>
            </Field>
            <Field className="sm:col-span-2" label={t("Codex model")}>
              <ProfileModelSelector
                placeholder={providers[0]?.models[0] && providers[0]?.name ? `${providers[0].name}/${providers[0].models[0]}` : ""}
                providers={providers}
                value={draft.model}
                onChange={(model) => onChange({ model })}
              />
            </Field>
            <Field className="sm:col-span-2" label={t("Codex CLI path")}>
              <Input value={draft.codexCliPath} onChange={(event) => onChange({ codexCliPath: event.target.value })} />
            </Field>
          </>
        )}
        <Field className="sm:col-span-2" label={t("Environment variables")}>
          <KeyValueRowsControl
            addLabel={t("Add env variable")}
            rows={draft.envRows}
            onChange={(envRows) => onChange({ envRows })}
          />
        </Field>
      </div>
      {error ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      ) : null}
    </>
  );
}

function AddProfileDialog({
  canSubmit,
  draft,
  error,
  mode = "add",
  onChange,
  onClose,
  providers,
  onSubmit
}: {
  canSubmit: boolean;
  draft: AddProfileDraft;
  error: string;
  mode?: "add" | "edit";
  onChange: (patch: Partial<AddProfileDraft>) => void;
  onClose: () => void;
  providers: GatewayProviderConfig[];
  onSubmit: () => Promise<boolean> | boolean | void;
}) {
  const t = useAppText();

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{mode === "edit" ? t("Edit Profile") : t("Add Profile")}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogBody>
          <AddProfileForm draft={draft} error={error} onChange={onChange} providers={providers} />
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              {t("Cancel")}
            </Button>
            <Button disabled={!canSubmit} onClick={() => void onSubmit()} type="button">
              {mode === "add" ? <Plus className="h-4 w-4" /> : null}
              {mode === "edit" ? t("Save") : t("Add")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type NetworkRequestTab = "body" | "header" | "query" | "raw" | "summary";
type NetworkResponseTab = "body" | "header" | "raw";

function NetworkingView({
  clearCaptures,
  proxyStatus,
  refreshCaptures,
  setCaptureEnabled,
  snapshot
}: {
  clearCaptures: () => void;
  proxyStatus: ProxyStatus;
  refreshCaptures: () => void;
  setCaptureEnabled: (enabled: boolean) => void;
  snapshot: ProxyNetworkSnapshot;
}) {
  const t = useAppText();
  const [requestTab, setRequestTab] = useState<NetworkRequestTab>("header");
  const [responseTab, setResponseTab] = useState<NetworkResponseTab>("body");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [listHeightPercent, setListHeightPercent] = useState(48);
  const [requestWidthPercent, setRequestWidthPercent] = useState(50);
  const networkBodyRef = useRef<HTMLDivElement>(null);
  const networkDetailPanesRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const captures = useMemo(
    () => snapshot.items.filter((item) => networkExchangeMatchesQuery(item, normalizedQuery)),
    [normalizedQuery, snapshot.items]
  );
  const selected = captures.find((item) => item.id === selectedId) ?? captures[0];

  useEffect(() => {
    if (selectedId && captures.some((item) => item.id === selectedId)) {
      return;
    }
    setSelectedId(captures[0]?.id);
  }, [captures, selectedId]);

  function startListResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const container = networkBodyRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const update = (pointerEvent: PointerEvent) => {
      const next = ((pointerEvent.clientY - rect.top) / rect.height) * 100;
      setListHeightPercent(clampNumber(next, 22, 78));
    };
    const stop = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function startDetailResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const container = networkDetailPanesRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const update = (pointerEvent: PointerEvent) => {
      const next = ((pointerEvent.clientX - rect.left) / rect.width) * 100;
      setRequestWidthPercent(clampNumber(next, 24, 76));
    };
    const stop = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="network-view min-w-0"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="network-shell flex min-h-0 flex-col overflow-hidden rounded-lg border">
        <div className="network-toolbar flex h-10 min-w-0 shrink-0 items-center gap-2 border-b px-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="network-search-icon pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2" />
            <input
              aria-label={t("Search network captures")}
              className="network-filter-input h-7 w-full rounded-md border pl-8 pr-2 text-[12px] font-semibold outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Filter")}
              value={query}
            />
          </div>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
            proxyStatus.state === "running" ? "network-service-running" : "network-service-muted"
          )}>
            {t(proxyStatus.state)}
          </span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
            snapshot.captureEnabled ? "network-service-running" : "network-service-paused"
          )}>
            {snapshot.captureEnabled ? t("capturing") : t("paused")}
          </span>
          <span className="network-count rounded-full px-2 py-0.5 text-[11px] font-semibold">{captures.length}</span>
          <button
            aria-label={snapshot.captureEnabled ? t("Pause network capture") : t("Resume network capture")}
            className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={() => setCaptureEnabled(!snapshot.captureEnabled)}
            title={snapshot.captureEnabled ? t("Pause capture") : t("Resume capture")}
            type="button"
          >
            {snapshot.captureEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button aria-label={t("Refresh network captures")} className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring/30" onClick={refreshCaptures} title={t("Refresh")} type="button">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button aria-label={t("Clear network captures")} className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring/30" disabled={snapshot.items.length === 0} onClick={clearCaptures} title={t("Clear")} type="button">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="network-workspace flex min-h-0 flex-1 flex-col" ref={networkBodyRef}>
          <div
            className="network-table-scroll min-h-0 overflow-auto border-b"
            style={{ flex: selected ? `0 0 ${listHeightPercent}%` : "1 1 auto" }}
          >
            <div className="min-w-[1180px]">
              <div className="network-table-header sticky top-0 z-10 grid h-9 grid-cols-[34px_64px_minmax(460px,1fr)_220px_104px_116px_88px] items-center border-b text-[12px] font-semibold">
                <NetworkHeaderCell label="" />
                <NetworkHeaderCell label="ID" />
                <NetworkHeaderCell label="URL" />
                <NetworkHeaderCell label={t("Client")} />
                <NetworkHeaderCell label={t("Method")} />
                <NetworkHeaderCell label={t("Status")} />
                <NetworkHeaderCell label={t("Code")} />
              </div>

              {captures.length === 0 ? (
                <div className="network-empty flex h-[320px] flex-col items-center justify-center gap-2 text-center text-[12px]">
                  <Network className="network-empty-icon h-7 w-7" />
                  <div>{snapshot.items.length === 0 ? (snapshot.captureEnabled ? t("No network captures") : t("Network capture is paused")) : t("No matching captures")}</div>
                  <div className="network-empty-subtle font-mono text-[11px]">{proxyStatus.endpoint || t("Proxy not running")}</div>
                </div>
              ) : null}

              {captures.map((item, index) => (
                <button
                  className={cn(
                    "network-row grid h-9 w-full grid-cols-[34px_64px_minmax(460px,1fr)_220px_104px_116px_88px] items-center border-0 px-0 text-left text-[12px] font-semibold outline-none transition-colors",
                    index % 2 === 0 ? "network-row-even" : "network-row-odd",
                    selected?.id === item.id && "network-row-selected"
                  )}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <div className="flex justify-center">
                    <NetworkStatusDot exchange={item} />
                  </div>
                  <div className="network-row-id truncate px-2 text-right">{networkRowId(item, index, captures.length)}</div>
                  <div className="truncate px-2" title={item.url}>{item.url}</div>
                  <div className="min-w-0 px-2">
                    <NetworkClientCell client={item.client} />
                  </div>
                  <div className="network-row-secondary truncate px-2">{item.method}</div>
                  <div className="network-row-secondary truncate px-2">{networkLifecycleLabel(item)}</div>
                  <div className="network-row-secondary truncate px-2">{networkCodeLabel(item)}</div>
                </button>
              ))}
            </div>
          </div>

          {selected ? (
            <>
              <button
                aria-label={t("Resize request list and detail panels")}
                className="network-resize-handle-y shrink-0"
                onPointerDown={startListResize}
                title={t("Resize list/detail")}
                type="button"
              />
              <div className="network-detail flex min-h-0 flex-1 flex-col">
                <div className="network-detail-bar flex h-12 min-w-0 shrink-0 items-center gap-2 border-b px-3">
                  <span className="network-method-pill rounded-full px-3 py-1 text-[12px] font-bold">{selected.method}</span>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-[12px] font-bold uppercase",
                    selected.state === "pending" ? "network-state-pill-active" : selected.state === "error" ? "network-state-pill-error" : "network-state-pill-completed"
                  )}>
                    {networkLifecycleLabel(selected)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold" title={selected.url}>
                    <span className="network-url-scheme">{selected.protocol}://</span>
                    <span className="network-url-host">{selected.host}</span>
                    <span className="network-url-path">{selected.path}</span>
                  </span>
                </div>

                <div className="network-detail-panes flex min-h-0 flex-1" ref={networkDetailPanesRef}>
                  <div className="min-w-0" style={{ flex: `0 0 ${requestWidthPercent}%` }}>
                    <NetworkRequestInspector exchange={selected} selectedTab={requestTab} setSelectedTab={setRequestTab} />
                  </div>
                  <button
                    aria-label={t("Resize request and response panels")}
                    className="network-resize-handle-x shrink-0"
                    onPointerDown={startDetailResize}
                    title={t("Resize request/response")}
                    type="button"
                  />
                  <div className="min-w-0 flex-1">
                    <NetworkResponseInspector exchange={selected} selectedTab={responseTab} setSelectedTab={setResponseTab} />
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function LogsView({
  error,
  filter,
  loading,
  page,
  refreshLogs,
  updateFilter
}: {
  error: string;
  filter: RequestLogListFilter;
  loading: boolean;
  page: RequestLogPage;
  refreshLogs: () => void;
  updateFilter: (patch: RequestLogListFilter, resetPage?: boolean) => void;
}) {
  const t = useAppText();
  const [expandedId, setExpandedId] = useState<number>();
  const firstItem = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const lastItem = Math.min(page.total, page.page * page.pageSize);

  useEffect(() => {
    if (!expandedId || page.items.some((item) => item.id === expandedId)) {
      return;
    }
    setExpandedId(undefined);
  }, [expandedId, page.items]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="network-view min-w-0"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="network-shell flex min-h-0 flex-col overflow-hidden rounded-lg border">
        <div className="network-toolbar flex min-h-10 min-w-0 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="network-search-icon pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2" />
            <input
              aria-label={t("Search request logs")}
              className="network-filter-input h-7 w-full rounded-md border pl-8 pr-2 text-[12px] font-semibold outline-none"
              onChange={(event) => updateFilter({ query: event.target.value })}
              placeholder={t("筛选日志、模型、请求或响应")}
              value={filter.query ?? ""}
            />
          </div>
          <Select
            aria-label={t("Filter request log status")}
            className="h-7 w-[118px] bg-[length:14px] px-2 pr-7 text-[11px]"
            onValueChange={(value) => updateFilter({ status: value as RequestLogStatusFilter })}
            options={translateOptions(requestLogStatusOptions, t)}
            value={filter.status ?? "all"}
          />
          <Select
            aria-label={t("Filter request log provider")}
            className="h-7 w-[148px] bg-[length:14px] px-2 pr-7 text-[11px]"
            onValueChange={(value) => updateFilter({ provider: value || undefined })}
            options={logSelectOptions(t("全部供应商"), page.options.providers, filter.provider)}
            value={filter.provider ?? ""}
          />
          <Select
            aria-label={t("Filter request log model")}
            className="h-7 w-[168px] bg-[length:14px] px-2 pr-7 text-[11px]"
            onValueChange={(value) => updateFilter({ model: value || undefined })}
            options={logSelectOptions(t("全部模型"), page.options.models, filter.model)}
            value={filter.model ?? ""}
          />
          <span className="network-count rounded-full px-2 py-0.5 text-[11px] font-semibold">{page.total}</span>
          <button
            aria-label={t("Previous page")}
            className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={page.page <= 1}
            onClick={() => updateFilter({ page: page.page - 1 }, false)}
            title={t("上一页")}
            type="button"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="network-count min-w-[132px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold">
            {firstItem}-{lastItem} / {page.total}
          </span>
          <button
            aria-label={t("Next page")}
            className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={page.page >= page.totalPages}
            onClick={() => updateFilter({ page: page.page + 1 }, false)}
            title={t("下一页")}
            type="button"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <Select
            aria-label={t("Request log page size")}
            className="h-7 w-[92px] bg-[length:14px] px-2 pr-7 text-[11px]"
            onValueChange={(value) => updateFilter({ pageSize: Number(value) })}
            options={requestLogPageSizeOptions}
            value={String(page.pageSize)}
          />
          <button
            aria-label={t("Refresh request logs")}
            className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={refreshLogs}
            title={t("Refresh")}
            type="button"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>

        {error ? (
          <div className="network-error-box mx-3 mt-3 rounded-md border px-3 py-2 text-[12px]">{error}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="network-table-scroll min-h-0 flex-1 overflow-auto">
            <div className="w-full min-w-0">
              <div className="network-table-header sticky top-0 z-10 grid h-9 grid-cols-[minmax(0,0.9fr)_minmax(96px,0.45fr)_minmax(0,0.95fr)_minmax(0,0.85fr)_84px] items-center border-b text-[12px] font-semibold">
                <NetworkHeaderCell label={t("时间")} />
                <NetworkHeaderCell label={t("状态")} />
                <NetworkHeaderCell label={t("模型")} />
                <NetworkHeaderCell label={t("令牌")} />
                <NetworkHeaderCell label={t("持续时间")} />
              </div>

              {page.items.length === 0 ? (
                <div className="network-empty flex h-[240px] flex-col items-center justify-center gap-2 text-center text-[12px]">
                  <Database className="network-empty-icon h-7 w-7" />
                  <div>{loading ? t("正在加载日志") : t("暂无日志")}</div>
                </div>
              ) : null}

              {page.items.map((item, index) => {
                const expanded = expandedId === item.id;
                return (
                  <AnimatedListItem key={item.id}>
                    <button
                      aria-expanded={expanded}
                      className={cn(
                        "network-row grid h-10 w-full grid-cols-[minmax(0,0.9fr)_minmax(96px,0.45fr)_minmax(0,0.95fr)_minmax(0,0.85fr)_84px] items-center border-0 px-0 text-left text-[12px] font-semibold outline-none transition-colors",
                        index % 2 === 0 ? "network-row-even" : "network-row-odd",
                        expanded && "network-row-selected"
                      )}
                      onClick={() => setExpandedId((current) => current === item.id ? undefined : item.id)}
                      type="button"
                    >
                      <div className="truncate px-3 font-mono text-[11px]" title={formatLogDateTime(item.createdAt)}>
                        {formatLogDateTime(item.createdAt)}
                      </div>
                      <div className="flex min-w-0 items-center gap-2 px-2">
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-180")} />
                        <LogStatusDot entry={item} />
                        <span className="network-row-secondary truncate">{item.statusCode || "-"}</span>
                      </div>
                      <LogModelRouteCell entry={item} />
                      <div className="network-row-secondary truncate px-2" title={formatLogTokenSummary(item, t)}>{formatLogTokenSummary(item, t)}</div>
                      <div className="network-row-secondary truncate px-2">{formatDuration(item.durationMs)}</div>
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded ? <LogExpandedDetails entry={item} /> : null}
                    </AnimatePresence>
                  </AnimatedListItem>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LogExpandedDetails({ entry }: { entry: RequestLogEntry }) {
  const t = useAppText();

  return (
    <AnimatedDisclosure className="network-detail border-b">
      <div className="network-detail-bar flex min-h-10 min-w-0 items-center gap-2 border-b px-3 py-1.5">
        <span className={cn(
          "rounded-full px-3 py-1 text-[12px] font-bold uppercase",
          entry.ok ? "network-state-pill-completed" : "network-state-pill-error"
        )}>
          HTTP {entry.statusCode || "-"}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold" title={entry.url}>
          {entry.method} {entry.path}
        </span>
      </div>
      <div className="network-body-meta grid grid-cols-2 gap-y-2 border-b px-3 py-2 text-[12px] sm:grid-cols-4 lg:grid-cols-6">
        <LogMetric label={t("持续时间")} value={formatDuration(entry.durationMs)} />
        <LogMetric label={t("输入")} value={formatCompactNumber(entry.inputTokens)} />
        <LogMetric label={t("输出")} value={formatCompactNumber(entry.outputTokens)} />
        <LogMetric label={t("缓存读取")} value={formatCompactNumber(entry.cacheReadTokens)} />
        <LogMetric label={t("缓存写入")} value={formatCompactNumber(entry.cacheWriteTokens)} />
        <LogMetric label={t("总计")} value={formatCompactNumber(entry.totalTokens)} />
      </div>
      <div className="network-detail-panes grid h-[440px] min-h-0 grid-cols-1 lg:grid-cols-2">
        <LogJsonPanel body={entry.requestBody} headerEmptyLabel="No request headers" headers={entry.requestHeaders} title={t("请求")} />
        <LogJsonPanel
          body={entry.responseBody}
          className="border-t lg:border-l lg:border-t-0"
          headerEmptyLabel="No response headers"
          headers={entry.responseHeaders}
          subtitle={`HTTP ${entry.statusCode || "-"}`}
          title={t("响应")}
        />
      </div>
    </AnimatedDisclosure>
  );
}

function LogMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="network-muted truncate text-[11px]">{label}</div>
      <div className="truncate font-mono text-[12px] font-semibold">{value}</div>
    </div>
  );
}

function LogModelRouteCell({ entry }: { entry: RequestLogEntry }) {
  const requestModel = logRequestModel(entry);
  const responseModel = logResponseModel(entry);
  const title = `${requestModel} -> ${responseModel}`;

  return (
    <div className="flex min-w-0 items-center px-2" title={title}>
      <span className="min-w-0 max-w-[45%] truncate">{requestModel}</span>
      <MoveRight className="mx-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 max-w-[45%] truncate">{responseModel}</span>
    </div>
  );
}

function LogStatusDot({ entry }: { entry: RequestLogEntry }) {
  return (
    <span className={cn("h-3 w-3 shrink-0 rounded-full", entry.ok ? "network-dot-completed" : "network-dot-error")} />
  );
}

type LogPayloadTab = "body" | "header";

function LogJsonPanel({
  body,
  className,
  headerEmptyLabel = "No values",
  headers,
  subtitle,
  title
}: {
  body?: RequestLogBody;
  className?: string;
  headerEmptyLabel?: string;
  headers?: Record<string, string | string[]>;
  subtitle?: string;
  title: string;
}) {
  const t = useAppText();
  const [selectedTab, setSelectedTab] = useState<LogPayloadTab>("body");
  const [query, setQuery] = useState("");
  const bodyKey = logBodyKey(body);
  const bodyView = useMemo(() => formatLogBodyView(body), [bodyKey]);
  const formatted = bodyView.text;
  const visible = useMemo(() => filterLogText(formatted, query), [formatted, query]);
  const headerRows = useMemo(() => networkHeaderRows(headers ?? {}), [headers]);
  const [expandedJsonPaths, setExpandedJsonPaths] = useState<Set<string>>(() => createInitialLogJsonExpandedPaths(bodyView.json));
  const showJsonTree = bodyView.json !== undefined && query.trim() === "";

  useEffect(() => {
    setExpandedJsonPaths(createInitialLogJsonExpandedPaths(bodyView.json));
  }, [bodyKey]);

  function toggleJsonPath(path: string) {
    setExpandedJsonPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className={cn("network-pane-split flex min-h-0 min-w-0 flex-col", className)}>
      <div className="network-pane-header flex h-10 min-w-0 shrink-0 items-center gap-3 border-b px-3">
        <span className="network-pane-title shrink-0 text-[14px] font-bold">{title}</span>
        {subtitle ? <span className="network-muted shrink-0 text-[12px] font-semibold">{subtitle}</span> : null}
        <div className="flex min-w-0 items-center gap-3">
          {(["body", "header"] as const).map((tab) => (
            <button
              className={cn(
                "network-tab border-0 bg-transparent p-0 text-[12px] font-semibold capitalize outline-none",
                selectedTab === tab && "network-tab-active"
              )}
              key={tab}
              onClick={() => setSelectedTab(tab)}
              type="button"
            >
              {t(tab)}
            </button>
          ))}
        </div>
      </div>
      <div className="network-pane-body flex min-h-0 flex-1 flex-col overflow-hidden">
        {selectedTab === "body" ? (
          <>
            <div className="network-body-meta flex min-h-9 shrink-0 items-center gap-2 border-b px-3 py-1.5">
              <div className="relative min-w-[180px] flex-1">
                <Search className="network-search-icon pointer-events-none absolute left-2 top-1/2 z-[1] h-3 w-3 -translate-y-1/2" />
                <input
                  aria-label={`${t("Filter")} ${title} JSON`}
                  className="network-filter-input h-6 w-full rounded border pl-7 pr-2 text-[11px] font-semibold outline-none"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("筛选 JSON...")}
                  value={query}
                />
              </div>
              {body?.contentType ? <span className="network-muted hidden shrink-0 text-[11px] font-semibold sm:inline">{body.contentType}</span> : null}
              {body?.truncated ? <span className="network-service-paused rounded-full px-2 py-0.5 text-[11px] font-semibold">{t("truncated")}</span> : null}
            </div>
            <LogBodyViewer copyLabel={`${t("Copy")} ${title} ${t("body")}`} copyText={formatted}>
              {showJsonTree ? (
                <LogJsonTree expandedPaths={expandedJsonPaths} onToggle={toggleJsonPath} value={bodyView.json} />
              ) : (
                <pre className="network-code min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 pr-12 font-mono text-[11px] leading-5">{visible}</pre>
              )}
            </LogBodyViewer>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <NetworkKeyValueTable emptyLabel={headerEmptyLabel} rows={headerRows} />
          </div>
        )}
      </div>
    </div>
  );
}

function LogBodyViewer({
  children,
  copyLabel,
  copyText
}: {
  children: ReactNode;
  copyLabel: string;
  copyText: string;
}) {
  const t = useAppText();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1300);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyBody() {
    await copyTextToClipboard(copyText);
    setCopied(true);
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <button
        aria-label={copyLabel}
        className={cn(
          "network-control-button absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded border outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          copied && "network-json-copy-success"
        )}
        onClick={() => void copyBody()}
        title={copied ? t("Copied") : t("复制")}
        type="button"
      >
        <AnimatePresence initial={false} mode="wait">
          {copied ? (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center"
              exit={{ opacity: 0, scale: 0.85 }}
              initial={{ opacity: 0, scale: 0.85 }}
              key="copied"
              transition={{ duration: 0.12 }}
            >
              <Check className="h-3.5 w-3.5" />
            </motion.span>
          ) : (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center"
              exit={{ opacity: 0, scale: 0.85 }}
              initial={{ opacity: 0, scale: 0.85 }}
              key="copy"
              transition={{ duration: 0.12 }}
            >
              <Copy className="h-3.5 w-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      {children}
    </div>
  );
}

function LogJsonTree({
  expandedPaths,
  onToggle,
  value
}: {
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  value: unknown;
}) {
  return (
    <div className="network-code min-h-0 flex-1 overflow-auto p-3 pr-12 font-mono text-[11px] leading-5">
      <JsonTreeNode expandedPaths={expandedPaths} onToggle={onToggle} path="$" value={value} />
    </div>
  );
}

function JsonTreeNode({
  depth = 0,
  expandedPaths,
  label,
  labelKind = "key",
  onToggle,
  path,
  trailingComma = false,
  value
}: {
  depth?: number;
  expandedPaths: Set<string>;
  label?: string;
  labelKind?: "index" | "key";
  onToggle: (path: string) => void;
  path: string;
  trailingComma?: boolean;
  value: unknown;
}) {
  const t = useAppText();

  if (!isJsonContainer(value)) {
    return (
      <div className="min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: depth * 16 }}>
        {label !== undefined ? <JsonTreeLabel kind={labelKind} label={label} /> : null}
        <JsonPrimitiveValue value={value} />
        {trailingComma ? <span>,</span> : null}
      </div>
    );
  }

  const entries = jsonContainerEntries(value);
  const expanded = expandedPaths.has(path);
  const open = Array.isArray(value) ? "[" : "{";
  const close = Array.isArray(value) ? "]" : "}";

  if (entries.length === 0) {
    return (
      <div className="min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: depth * 16 }}>
        <span className="inline-block w-4" />
        {label !== undefined ? <JsonTreeLabel kind={labelKind} label={label} /> : null}
        <span>{open}{close}</span>
        {trailingComma ? <span>,</span> : null}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: depth * 16 }}>
        <button
          aria-expanded={expanded}
          aria-label={expanded ? `${t("Collapse")} JSON` : `${t("Expand")} JSON`}
          className="network-control-button mr-1 inline-flex h-4 w-4 items-center justify-center rounded border align-[-2px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={() => onToggle(path)}
          title={expanded ? t("Collapse") : t("Expand")}
          type="button"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {label !== undefined ? <JsonTreeLabel kind={labelKind} label={label} /> : null}
        <span>{open}</span>
        {!expanded ? (
          <>
            <span className="network-muted"> {jsonContainerSummary(value)} </span>
            <span>{close}</span>
            {trailingComma ? <span>,</span> : null}
          </>
        ) : null}
      </div>
      {expanded ? (
        <>
          {entries.map(([key, childValue], index) => (
            <JsonTreeNode
              depth={depth + 1}
              expandedPaths={expandedPaths}
              key={`${path}/${key}`}
              label={key}
              labelKind={Array.isArray(value) ? "index" : "key"}
              onToggle={onToggle}
              path={jsonChildPath(path, key)}
              trailingComma={index < entries.length - 1}
              value={childValue}
            />
          ))}
          <div className="min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: depth * 16 }}>
            <span className="inline-block w-4" />
            <span>{close}</span>
            {trailingComma ? <span>,</span> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function JsonTreeLabel({ kind, label }: { kind: "index" | "key"; label: string }) {
  return (
    <>
      <span className={kind === "index" ? "network-muted" : "text-[color:var(--network-accent)]"}>
        {kind === "index" ? label : JSON.stringify(label)}
      </span>
      <span>: </span>
    </>
  );
}

function JsonPrimitiveValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <span className="text-emerald-600 dark:text-emerald-300">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-blue-600 dark:text-blue-300">{String(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-purple-600 dark:text-purple-300">{String(value)}</span>;
  }
  if (value === null) {
    return <span className="network-muted">null</span>;
  }
  return <span>{String(value)}</span>;
}

function NetworkHeaderCell({ label }: { label: string }) {
  return (
    <div className="network-header-cell min-w-0 border-l px-2 first:border-l-0">
      <span className="truncate">{label}</span>
    </div>
  );
}

function NetworkStatusDot({ exchange }: { exchange: ProxyNetworkExchange }) {
  return (
    <span
      className={cn(
        "h-3 w-3 rounded-full",
        exchange.state === "error"
          ? "network-dot-error"
          : exchange.state === "pending"
            ? "network-dot-active"
            : (exchange.statusCode ?? 0) >= 400
              ? "network-dot-error"
              : "network-dot-completed"
      )}
    />
  );
}

function NetworkClientCell({ client }: { client: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="network-client-icon flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[8px] font-bold">
        {clientInitial(client)}
      </span>
      <span className="min-w-0 truncate" title={client}>{client}</span>
    </div>
  );
}

function NetworkRequestInspector({
  exchange,
  selectedTab,
  setSelectedTab
}: {
  exchange: ProxyNetworkExchange;
  selectedTab: NetworkRequestTab;
  setSelectedTab: (tab: NetworkRequestTab) => void;
}) {
  const t = useAppText();

  return (
    <div className="network-pane-split flex h-full min-w-0 flex-col">
      <div className="network-pane-header flex h-10 min-w-0 shrink-0 items-center gap-3 border-b px-3">
        <span className="network-pane-title shrink-0 text-[14px] font-bold">{t("Request")}</span>
        <div className="flex min-w-0 items-center gap-3">
          {(["header", "query", "body", "raw", "summary"] as const).map((tab) => (
            <button
              className={cn(
                "network-tab border-0 bg-transparent p-0 text-[12px] font-semibold capitalize outline-none",
                selectedTab === tab && "network-tab-active"
              )}
              key={tab}
              onClick={() => setSelectedTab(tab)}
              type="button"
            >
              {t(tab)}
            </button>
          ))}
          <span className="network-tab-divider h-4 w-px border-l" />
          <button className="network-tab border-0 bg-transparent p-0" type="button">+</button>
        </div>
      </div>

      <div className="network-pane-body min-h-0 flex-1 overflow-auto">
        {selectedTab === "header" ? <NetworkKeyValueTable rows={networkHeaderRows(exchange.requestHeaders)} /> : null}
        {selectedTab === "query" ? <NetworkKeyValueTable rows={networkQueryRows(exchange.url)} emptyLabel={t("No query parameters")} /> : null}
        {selectedTab === "body" ? <NetworkBodyViewer body={exchange.requestBody} /> : null}
        {selectedTab === "raw" ? <NetworkInspectorCode value={formatNetworkRequestRaw(exchange)} /> : null}
        {selectedTab === "summary" ? <NetworkKeyValueTable rows={networkSummaryRows(exchange)} /> : null}
      </div>
    </div>
  );
}

function NetworkResponseInspector({
  exchange,
  selectedTab,
  setSelectedTab
}: {
  exchange: ProxyNetworkExchange;
  selectedTab: NetworkResponseTab;
  setSelectedTab: (tab: NetworkResponseTab) => void;
}) {
  const t = useAppText();

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="network-pane-header flex h-10 min-w-0 shrink-0 items-center justify-between gap-3 border-b px-3">
        <span className="network-pane-title shrink-0 text-[14px] font-bold">{t("Response")}</span>
        <div className="flex items-center gap-3">
          {(["body", "header", "raw"] as const).map((tab) => (
            <button
              className={cn(
                "network-tab border-0 bg-transparent p-0 text-[12px] font-semibold capitalize outline-none",
                selectedTab === tab && "network-tab-active"
              )}
              key={tab}
              onClick={() => setSelectedTab(tab)}
              type="button"
            >
              {t(tab)}
            </button>
          ))}
        </div>
      </div>

      <div className="network-pane-body min-h-0 flex-1 overflow-auto">
        {exchange.error ? (
          <div className="network-error-box m-4 rounded-md border px-3 py-2 text-[12px]">{exchange.error}</div>
        ) : null}
        {selectedTab === "body" ? <NetworkBodyViewer body={exchange.responseBody} /> : null}
        {selectedTab === "header" ? <NetworkKeyValueTable rows={networkHeaderRows(exchange.responseHeaders ?? {})} emptyLabel={t("No response headers")} /> : null}
        {selectedTab === "raw" ? <NetworkInspectorCode value={formatNetworkResponseRaw(exchange)} /> : null}
      </div>
    </div>
  );
}

function NetworkKeyValueTable({ emptyLabel = "No values", rows }: { emptyLabel?: string; rows: Array<[string, string]> }) {
  const t = useAppText();

  if (rows.length === 0) {
    return <div className="network-kv-empty px-4 py-10 text-center text-[12px] font-semibold">{t(emptyLabel)}</div>;
  }

  return (
    <div className="min-w-[520px]">
      <div className="network-kv-header grid h-9 grid-cols-[minmax(180px,0.9fr)_minmax(280px,1.6fr)] items-center border-b text-[12px] font-bold">
        <div className="network-kv-key-head border-r px-3">{t("Key")}</div>
        <div className="px-3">{t("Value")}</div>
      </div>
      {rows.map(([key, value], index) => (
        <div
          className={cn(
            "network-kv-row grid min-h-9 grid-cols-[minmax(180px,0.9fr)_minmax(280px,1.6fr)] items-start text-[12px] font-semibold",
            index % 2 === 0 ? "network-kv-row-even" : "network-kv-row-odd"
          )}
          key={`${key}-${index}`}
        >
          <div className="network-kv-key min-w-0 px-3 py-2">{key}</div>
          <div className="network-kv-value min-w-0 whitespace-pre-wrap break-words px-3 py-2">{value}</div>
        </div>
      ))}
    </div>
  );
}

function NetworkBodyViewer({ body }: { body?: ProxyNetworkBody }) {
  const t = useAppText();

  if (!body || (!body.text && body.sizeBytes === 0)) {
    return <div className="px-4 py-10 text-center text-[12px] font-semibold text-[#777d86]">{t("No body")}</div>;
  }

  return (
    <div className="min-w-0">
      <div className="network-body-meta flex min-h-9 flex-wrap items-center gap-2 border-b px-3 py-1.5 text-[11px] font-semibold">
        <span>{formatBytes(body.sizeBytes)}</span>
        {body.contentType ? <span>{body.contentType}</span> : null}
        {body.encoding === "base64" ? <span>base64</span> : null}
        {body.decodedFrom ? <span>{body.decodedFrom} {t("decoded")}</span> : null}
        {body.truncated ? <span>{t("truncated")}</span> : null}
      </div>
      {body.error ? <div className="network-body-warning border-b px-3 py-2 text-[12px]">{body.error}</div> : null}
      <NetworkInspectorCode value={body.text || t("No body")} />
    </div>
  );
}

function NetworkInspectorCode({ value }: { value: string }) {
  return (
    <pre className="network-code min-h-[240px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5">{value}</pre>
  );
}

function ProvidersView({ accountSnapshots, addProvider, editProvider, notify, providers, removeProvider }: {
  accountSnapshots: ProviderAccountSnapshot[];
  addProvider: () => void;
  editProvider: (index: number) => void;
  notify: (message: string) => void;
  providers: Array<{ provider: GatewayProviderConfig; index: number }>;
  removeProvider: (index: number) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set());
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProviders = useMemo(
    () => providers.filter(({ provider }) => providerMatchesQuery(provider, normalizedQuery)),
    [normalizedQuery, providers]
  );
  const accountSnapshotByProvider = useMemo(
    () => new Map(accountSnapshots.map((snapshot) => [snapshot.provider, snapshot])),
    [accountSnapshots]
  );

  function toggleProvider(provider: GatewayProviderConfig, index: number) {
    const key = providerListItemKey(provider, index);
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function copyModel(model: string) {
    await copyTextToClipboard(model);
    notify(`${t("Copied")} ${model}`);
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search providers")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search providers")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add provider")} onClick={addProvider} title={t("Add provider")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {providers.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Layers3 className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No providers configured")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Add to create one")}</div>
            </div>
          ) : null}
          {providers.length > 0 && visibleProviders.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching providers")}</div>
          ) : null}
          {visibleProviders.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[1080px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(160px,0.8fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(150px,0.65fr)_80px_84px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Base URL")}</div>
                  <div className="truncate">{t("Capability")}</div>
                  <div className="truncate">{t("Account")}</div>
                  <div className="truncate">{t("Models")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {visibleProviders.map(({ provider, index }) => {
                    const itemKey = providerListItemKey(provider, index);
                    const expanded = expandedProviders.has(itemKey);
                    const accountSnapshot = accountSnapshotByProvider.get(provider.name);
                    return (
                      <AnimatedListItem key={itemKey}>
                        <div
                          className="grid min-h-[58px] cursor-pointer grid-cols-[minmax(160px,0.8fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(150px,0.65fr)_80px_84px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                          onClick={() => toggleProvider(provider, index)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleProvider(provider, index);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              aria-expanded={expanded}
                              aria-label={`${expanded ? t("Collapse") : t("Expand")} ${provider.name || t("provider")} ${t("models")}`}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleProvider(provider, index);
                              }}
                              title={expanded ? t("Collapse models") : t("Expand models")}
                              type="button"
                            >
                              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            <div className="min-w-0">
                              <div className="truncate text-[12px] font-semibold">{provider.name || t("Unnamed")}</div>
                            </div>
                          </div>
                          <div className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={providerBaseUrl(provider)}>
                            {providerBaseUrl(provider) || t("Not set")}
                          </div>
                          <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={providerCapabilitiesSummary(provider, t)}>
                            {providerCapabilitiesSummary(provider, t)}
                          </div>
                          <ProviderAccountListCell provider={provider} snapshot={accountSnapshot} />
                          <div className="min-w-0">
                            <button
                              aria-expanded={expanded}
                              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleProvider(provider, index);
                              }}
                              title={expanded ? t("Collapse models") : t("Expand models")}
                              type="button"
                            >
                              <Badge variant={provider.models.length > 0 ? "outline" : "warning"}>{provider.models.length}</Badge>
                            </button>
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              aria-label={`${t("Edit")} ${provider.name || t("provider")}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                editProvider(index);
                              }}
                              size="iconSm"
                              title={t("Edit provider")}
                              type="button"
                              variant="ghost"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              aria-label={`${t("Remove")} ${provider.name || t("provider")}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeProvider(index);
                              }}
                              size="iconSm"
                              title={t("Remove provider")}
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded ? (
                            <AnimatedDisclosure key="provider-models">
                              <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                                {provider.capabilities?.length ? (
                                  <div className="mb-3 flex flex-wrap gap-2">
                                    {provider.capabilities.map((capability) => (
                                      <Badge key={`${capability.type}:${capability.baseUrl}`} variant="secondary">
                                        {translatedProviderProtocolLabel(capability.type, t)}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null}
                                {provider.models.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-border bg-background/60 px-3 py-4 text-center text-[12px] text-muted-foreground">{t("No models configured")}</div>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {provider.models.map((model) => {
                                      const modelKey = `${itemKey}:${model}`;
                                      return (
                                        <button
                                          aria-label={`${t("Double click to copy")} ${model}`}
                                          className="inline-flex max-w-full items-center rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] leading-4 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                          key={modelKey}
                                          onDoubleClick={() => void copyModel(model)}
                                          title={t("Double click to copy")}
                                          type="button"
                                        >
                                          <span className="min-w-0 truncate">{model}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </AnimatedDisclosure>
                          ) : null}
                        </AnimatePresence>
                      </AnimatedListItem>
                    );
                  })}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ModelsView({ config }: { config: AppConfig }) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => createModelCatalogItems(config), [config]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = useMemo(
    () => rows.filter((row) => modelCatalogItemMatchesQuery(row, normalizedQuery)),
    [normalizedQuery, rows]
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="min-w-0">{t("Models")}</CardTitle>
            </div>
          </div>
          <div className="relative w-[320px] max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search all models")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search all models")}
              value={query}
            />
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {rows.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Box className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No models available")}</div>
            </div>
          ) : null}
          {rows.length > 0 && visibleRows.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
          ) : null}
          {visibleRows.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[360px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(0,1fr)] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Model")}</div>
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {visibleRows.map((row) => (
                      <AnimatedListItem
                        className="grid min-h-[48px] grid-cols-[minmax(0,1fr)] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                        key={row.key}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[12px] font-semibold text-foreground" title={row.model}>
                            {row.model}
                          </div>
                        </div>
                      </AnimatedListItem>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ProviderAccountListCell({ provider, snapshot }: { provider: GatewayProviderConfig; snapshot?: ProviderAccountSnapshot }) {
  const t = useAppText();
  const meter = snapshot ? primaryProviderAccountMeter(snapshot) : undefined;

  if (!provider.account?.enabled) {
    return <div className="min-w-0 truncate text-[11px] text-muted-foreground">{t("Disabled")}</div>;
  }

  if (!snapshot) {
    return <div className="min-w-0 truncate text-[11px] text-muted-foreground">{t("Pending")}</div>;
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <Badge variant={providerAccountBadgeVariant(snapshot.status)}>{snapshot.status}</Badge>
        {meter ? <span className="min-w-0 truncate text-[11px] font-medium">{formatProviderAccountMeterValue(meter)}</span> : null}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
        {meter?.label ?? snapshot.message ?? snapshot.errors?.[0]?.message ?? snapshot.source}
      </div>
    </div>
  );
}

function DeleteProviderDialog({
  onClose,
  onConfirm,
  provider
}: {
  onClose: () => void;
  onConfirm: () => void;
  provider: GatewayProviderConfig;
}) {
  const t = useAppText();
  const name = provider.name || t("Unnamed provider");
  const baseUrl = providerBaseUrl(provider);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Delete Provider")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("Delete this provider from the configuration?")}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate">
                <span className="font-medium text-foreground">{t("Name")}:</span> {name}
              </div>
              <div className="truncate" title={baseUrl}>
                <span className="font-medium text-foreground">{t("Base URL")}:</span> {baseUrl || t("Not set")}
              </div>
              <div>{t("This action is applied immediately to the draft config and will auto-save with other changes.")}</div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button autoFocus onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button onClick={onConfirm} type="button" variant="destructive">
            <Trash2 className="h-4 w-4" />
            {t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProviderDeepLinkDialog({
  busy,
  error,
  onClose,
  onSubmit,
  request
}: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  request: ProviderDeepLinkRequest;
}) {
  const t = useAppText();
  const provider = request.provider;
  const displayName = provider ? provider.name?.trim() || inferProviderNameFromBaseUrl(provider.baseUrl) : "";
  const modelPreview = provider?.models.slice(0, 8) ?? [];

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[580px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{provider ? t("Import Provider") : t("Provider link failed")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} disabled={busy} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          {provider ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <div className="flex items-start gap-2 text-[12px] font-medium text-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t("External provider link")}</span>
                </div>
                <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {t("This provider link came from an external website. Review details before importing.")}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
                <ProviderDeepLinkDetail label={t("Name")} value={displayName} />
                <ProviderDeepLinkDetail label={t("Protocol")} value={provider.protocol ? translatedProviderProtocolLabel(provider.protocol, t) : t("Detected automatically")} />
                <ProviderDeepLinkDetail className="sm:col-span-2" label={t("Base URL")} value={provider.baseUrl} mono />
                {provider.source ? (
                  <ProviderDeepLinkDetail className="sm:col-span-2" label={t("Provider website")} value={provider.source} mono />
                ) : null}
                <ProviderDeepLinkDetail
                  label={t("API key")}
                  value={provider.apiKey ? t("API key included") : t("API key not included")}
                />
                <ProviderDeepLinkDetail
                  label={t("Models")}
                  value={provider.models.length > 0 ? String(provider.models.length) : t("Models will be detected automatically.")}
                />
              </div>

              {modelPreview.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {modelPreview.map((model) => (
                    <Badge key={model} variant="outline">
                      <span className="max-w-[210px] truncate font-mono">{model}</span>
                    </Badge>
                  ))}
                  {provider.models.length > modelPreview.length ? (
                    <Badge variant="secondary">+{provider.models.length - modelPreview.length}</Badge>
                  ) : null}
                </div>
              ) : null}

              {(provider.setDefault || provider.replaceExisting) ? (
                <div className="flex flex-wrap gap-2">
                  {provider.setDefault ? <Badge variant="secondary">{t("Set as default provider")}</Badge> : null}
                  {provider.replaceExisting ? <Badge variant="secondary">{t("Replace existing provider")}</Badge> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{request.error || t("Invalid")}</span>
              </div>
            </div>
          )}

          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t(error)}</span>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button disabled={busy} onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          {provider ? (
            <Button disabled={busy} onClick={() => void onSubmit()} type="button">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("Import")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProviderDeepLinkDetail({
  className,
  label,
  mono = false,
  value
}: {
  className?: string;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-md border border-border bg-background px-3 py-2", className)}>
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 min-w-0 truncate text-[12px] text-foreground", mono && "font-mono text-[11px]")} title={value}>
        {value}
      </div>
    </div>
  );
}

type ProviderPresetComboboxOption = {
  iconUrl?: string;
  label: string;
  preset?: ProviderPreset;
  value: string;
};

function ProviderPresetCombobox({
  onChange,
  options,
  value
}: {
  onChange: (value: string) => void;
  options: ProviderPresetComboboxOption[];
  value: string;
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => providerPresetOptionMatchesQuery(option, normalizedQuery))
    : options;

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function chooseOption(nextValue: string) {
    onChange(nextValue);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        aria-controls="provider-preset-options"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-[12px] font-medium shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-[background-color,border-color,box-shadow,color] hover:border-muted-foreground/45 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/40"
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        type="button"
      >
        <ProviderPresetIcon className="h-4 w-4 rounded-[4px]" iconUrl={selected?.iconUrl} preset={selected?.preset} />
        <span className="min-w-0 flex-1 truncate">{selected ? selected.label : t("Select preset provider")}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute left-0 right-0 top-full z-50 mt-1"
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <PopoverContent className="overflow-hidden p-1">
              <div className="relative mb-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={t("Filter")}
                  className="h-8 pl-8"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const first = filteredOptions[0];
                      if (first) {
                        chooseOption(first.value);
                      }
                    }
                  }}
                  placeholder={t("Filter")}
                  ref={inputRef}
                  value={query}
                />
              </div>
              <div className="max-h-[240px] overflow-auto" id="provider-preset-options" role="listbox">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => {
                    const selectedOption = option.value === value;
                    return (
                      <button
                        aria-selected={selectedOption}
                        className={cn(
                          "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
                          selectedOption ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                        )}
                        key={option.value}
                        onClick={() => chooseOption(option.value)}
                        role="option"
                        type="button"
                      >
                        <ProviderPresetIcon className="h-5 w-5 rounded-[5px]" iconUrl={option.iconUrl} preset={option.preset} />
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {selectedOption ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-2 py-5 text-center text-[12px] text-muted-foreground">{t("No provider presets found")}</div>
                )}
              </div>
            </PopoverContent>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProviderPresetIcon({ className, iconUrl: explicitIconUrl, preset }: { className?: string; iconUrl?: string; preset?: ProviderPreset }) {
  const [failed, setFailed] = useState(false);
  const resolvedIconUrl = explicitIconUrl || (preset ? providerPresetIconUrls[preset.id] : "");
  const iconUrl = !failed ? resolvedIconUrl : "";
  const label = preset?.name.trim().slice(0, 1).toUpperCase() || "";

  useEffect(() => {
    setFailed(false);
  }, [preset?.id, resolvedIconUrl]);

  if (iconUrl) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-border bg-background", className)}>
        <img
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setFailed(true)}
          src={iconUrl}
        />
      </span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center border border-border bg-muted text-[10px] font-semibold text-muted-foreground", className)}>
      {label || <Globe className="h-3.5 w-3.5" />}
    </span>
  );
}

function providerPresetOptionMatchesQuery(
  option: ProviderPresetComboboxOption,
  query: string
): boolean {
  const preset = option.preset;
  const haystack = [
    option.label,
    option.value,
    preset?.id,
    preset?.name,
    ...(preset?.aliases ?? []),
    ...(preset?.endpoints.map((endpoint) => endpoint.baseUrl) ?? [])
  ].filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(query);
}

function AddProviderForm({
  draft,
  error,
  mode,
  onCheck,
  onChange,
  probe,
  probeLoading,
  providers
}: {
  draft: AddProviderDraft;
  error: string;
  mode: "add" | "edit";
  onCheck?: () => Promise<void>;
  onChange: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  probe?: GatewayProviderProbeResult;
  probeLoading: boolean;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const shouldReduceMotion = useReducedMotion();
  const [advancedOpen, setAdvancedOpen] = useState(mode === "edit");
  const [iconDetecting, setIconDetecting] = useState(false);
  const iconDetectionRequestRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const hasModelCatalog = Boolean(probe?.models.length);
  const selectedPreset = findProviderPreset(draft.presetId);
  const customEndpoint = draft.presetId === customProviderPresetId;
  const showBaseUrl = customEndpoint || mode === "edit";
  const detectedProtocol = probe?.detectedProtocol ?? draft.protocol;
  const detectedBaseUrl = probe?.normalizedBaseUrl || draft.baseUrl;
  const providerPresetOptions = [
    { label: t("Select preset provider"), value: "" },
    ...providerPresets.map((preset) => ({ label: t(preset.name), preset, value: preset.id })),
    { iconUrl: draft.icon, label: t("Other / custom API endpoint"), value: customProviderPresetId }
  ];

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const requestId = iconDetectionRequestRef.current + 1;
    iconDetectionRequestRef.current = requestId;
    setIconDetecting(false);

    const baseUrl = draft.baseUrl.trim();
    const ccr = window.ccr;
    if (!customEndpoint || !baseUrl || draft.icon || !ccr?.detectProviderIcon) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIconDetecting(true);
      void ccr.detectProviderIcon({ baseUrl })
        .then((result) => {
          if (iconDetectionRequestRef.current === requestId && result.icon) {
            onChangeRef.current({ icon: result.icon });
          }
        })
        .catch(() => {
          // Icon detection is optional; provider probing and saving should continue normally.
        })
        .finally(() => {
          if (iconDetectionRequestRef.current === requestId) {
            setIconDetecting(false);
          }
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [customEndpoint, draft.baseUrl, draft.icon]);

  function updatePreset(presetId: string) {
    if (!presetId) {
      onChange({
        baseUrl: "",
        icon: "",
        modelSearch: "",
        presetId,
        selectedModels: []
      }, true);
      return;
    }

    if (presetId === customProviderPresetId) {
      onChange({
        baseUrl: "",
        icon: "",
        modelSearch: "",
        presetId,
        selectedModels: []
      }, true);
      return;
    }

    const preset = findProviderPreset(presetId);
    const endpoint = preset ? primaryProviderPresetEndpoint(preset) : undefined;
    const generatedName = !draft.name.trim() || /^provider-\d+$/i.test(draft.name.trim());
    onChange({
      baseUrl: endpoint?.baseUrl ?? "",
      icon: "",
      modelSearch: "",
      modelsText: draft.modelsText.trim() || preset?.defaultModels?.join("\n") || "",
      name: mode === "add" && preset && generatedName ? uniqueProviderName(providers, t(preset.name)) : draft.name,
      presetId,
      protocol: endpoint?.protocols[0] ?? draft.protocol,
      selectedModels: []
    }, true);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("Preset provider")}>
          <ProviderPresetCombobox
            value={draft.presetId}
            onChange={updatePreset}
            options={providerPresetOptions}
          />
        </Field>
        <Field label={t("Name")}>
          <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        {showBaseUrl ? (
          <Field className="sm:col-span-2" label={t("API endpoint")}>
            <Input value={draft.baseUrl} onChange={(event) => onChange({ baseUrl: event.target.value, icon: "" }, true)} />
            {customEndpoint ? (
              <div className="flex min-h-4 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
                {iconDetecting ? <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" /> : null}
                <span className="min-w-0">
                  {iconDetecting
                    ? t("Detecting icon")
                    : t("After you enter the API endpoint and key, the system will automatically detect supported protocols and available models.")}
                </span>
              </div>
            ) : null}
          </Field>
        ) : null}
        <Field className="sm:col-span-2" label={t("API key")}>
          <Input type="password" value={draft.apiKey} onChange={(event) => onChange({ apiKey: event.target.value }, true)} />
        </Field>
        {selectedPreset && !showBaseUrl ? (
          <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate" title={detectedBaseUrl}>{detectedBaseUrl}</span>
            </div>
          </div>
        ) : null}
        <Field className="sm:col-span-2" label={t("Models")}>
          {hasModelCatalog && probe ? (
            <div className="space-y-2">
              <ModelMultiSelect
                models={probe.models}
                onQueryChange={(modelSearch) => onChange({ modelSearch })}
                onSelectedChange={(selectedModels) => onChange({ selectedModels })}
                query={draft.modelSearch}
                selected={draft.selectedModels}
              />
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Custom models")}</span>
                  <span className="shrink-0 text-[11px] font-medium leading-4 text-muted-foreground/75">{t("Press Enter to add")}</span>
                </div>
                <ModelTagInput
                  ariaLabel={t("Custom models")}
                  onChange={(models) => onChange({ modelsText: models.join("\n") })}
                  placeholder={t("Model name")}
                  value={splitLines(draft.modelsText)}
                />
              </div>
            </div>
          ) : (
            <ModelTagInput
              ariaLabel={t("Models")}
              onChange={(models) => onChange({ modelsText: models.join("\n") }, true)}
              placeholder={t("Model name")}
              value={splitLines(draft.modelsText)}
            />
          )}
        </Field>
        <div className="sm:col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <div className="min-w-0 flex-1">
            {probeLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                {t("Detecting provider")}
              </span>
            ) : providerProbeHasSupportedProtocol(probe) ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Check className="h-3.5 w-3.5" />
                {t("Connection verified")}
              </span>
            ) : probe?.detectedProtocol ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Check className="h-3.5 w-3.5" />
                {t("Detected automatically")}
              </span>
            ) : draft.baseUrl.trim() ? (
              <span>{t("Enter a model manually if automatic detection does not return a model list.")}</span>
            ) : null}
          </div>
          {onCheck ? (
            <Button
              className="h-8 shrink-0 px-2"
              disabled={probeLoading}
              onClick={() => void onCheck()}
              type="button"
              variant="outline"
            >
              {probeLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {t("Check")}
            </Button>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <button
            aria-expanded={advancedOpen}
            className="inline-flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-[12px] font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
            onClick={() => setAdvancedOpen((value) => !value)}
            type="button"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
            <span>{t("Advanced settings")}</span>
          </button>
        </div>

        <AnimatePresence initial={false}>
          {advancedOpen ? (
            <motion.div
              animate={{ height: "auto", opacity: 1 }}
              className="sm:col-span-2 overflow-hidden"
              exit={{ height: 0, opacity: 0 }}
              initial={{ height: 0, opacity: 0 }}
              transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.18, ease: motionEase }}
            >
              <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2">
                {selectedPreset && !customEndpoint && mode === "add" ? (
                  <Field className="sm:col-span-2" label={t("API endpoint")}>
                    <Input value={draft.baseUrl} onChange={(event) => onChange({ baseUrl: event.target.value }, true)} />
                  </Field>
                ) : null}
                <Field label={t("Detected compatibility")}>
                  <Input readOnly value={translatedProviderProtocolLabel(detectedProtocol, t)} />
                </Field>
                <Field label={t("Detected endpoint")}>
                  <Input readOnly value={detectedBaseUrl} />
                </Field>
                <div className="sm:col-span-2 space-y-2 rounded-md border border-border bg-background/60 p-3">
                  <Label className="flex min-w-0 items-center gap-2 text-[12px] font-semibold">
                    <Checkbox
                      checked={draft.accountEnabled}
                      onCheckedChange={(checked) => onChange({ accountEnabled: checked })}
                    />
                    <span className="min-w-0 truncate">{t("Account balance connectors")}</span>
                  </Label>
                  {draft.accountEnabled ? (
                    <div className="grid grid-cols-1 gap-3">
                      <Field label={t("Refresh interval ms")}>
                        <Input
                          min={30000}
                          placeholder="300000"
                          type="number"
                          value={draft.accountRefreshIntervalMs}
                          onChange={(event) => onChange({ accountRefreshIntervalMs: event.target.value })}
                        />
                      </Field>
                      <Field label={t("Connectors JSON")}>
                        <Textarea
                          className="min-h-[180px] font-mono text-[11px]"
                          value={draft.accountConnectorsText}
                          onChange={(event) => onChange({ accountConnectorsText: event.target.value })}
                        />
                        <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="min-w-0 truncate">{t("Supports standard, http-json, plugin, and local-estimate connectors.")}</span>
                          <button
                            className="shrink-0 text-primary hover:underline"
                            type="button"
                            onClick={() => onChange({ accountConnectorsText: providerAccountConnectorExample() })}
                          >
                            {t("Insert example")}
                          </button>
                        </div>
                      </Field>
                    </div>
                  ) : null}
                </div>
                <Field className="sm:col-span-2" label={t("Protocol details")}>
                  <div className="max-h-[128px] overflow-auto rounded-md border border-border bg-background p-2">
                    {probe?.protocols.length ? (
                      <div className="space-y-1.5">
                        {probe.protocols.map((item) => (
                          <div className="grid grid-cols-[minmax(118px,0.7fr)_72px_minmax(0,1fr)] gap-2 text-[11px]" key={`${item.protocol}-${item.endpoint}`}>
                            <span className="truncate font-medium">{translatedProviderProtocolLabel(item.protocol, t)}</span>
                            <span className={cn("truncate", item.supported ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground")}>
                              {item.supported ? t("Available") : t("Unavailable")}
                            </span>
                            <span className="truncate text-muted-foreground" title={translateProbeProtocolMessage(item.message, t)}>{translateProbeProtocolMessage(item.message, t)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">{t("No protocol detection yet")}</div>
                    )}
                  </div>
                </Field>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {error ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span></div> : null}
    </>
  );
}

function AddProviderDialog({
  canSubmit,
  draft,
  error,
  mode,
  onCheck,
  onChange,
  onClose,
  onSubmit,
  probe,
  probeLoading,
  providers
}: {
  canSubmit: boolean;
  draft: AddProviderDraft;
  error: string;
  mode: "add" | "edit";
  onCheck?: () => Promise<void>;
  onChange: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  onClose: () => void;
  onSubmit: () => Promise<boolean>;
  probe?: GatewayProviderProbeResult;
  probeLoading: boolean;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();

  return (
    <Dialog className="items-start" onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="mt-[clamp(12px,4dvh,36px)] max-h-[calc(100dvh-1.5rem-clamp(12px,4dvh,36px))] max-w-[780px] origin-top sm:mt-[clamp(16px,6dvh,56px)] sm:max-h-[calc(100dvh-3rem-clamp(16px,6dvh,56px))]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{mode === "edit" ? t("Edit Provider") : t("Add Provider")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <AddProviderForm
            draft={draft}
            error={error}
            mode={mode}
            onCheck={onCheck}
            onChange={onChange}
            probe={probe}
            probeLoading={probeLoading}
            providers={providers}
          />
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void onSubmit()} type="button">
            {mode === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mode === "edit" ? t("Save") : t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModelTagInput({
  ariaLabel,
  onChange,
  placeholder,
  value
}: {
  ariaLabel: string;
  onChange: (value: string[]) => void;
  placeholder: string;
  value: string[];
}) {
  const t = useAppText();
  const [draft, setDraft] = useState("");
  const models = mergeProviderModelLists(value);

  function addModels(rawValue = draft) {
    const nextModels = splitModelTagInput(rawValue);
    if (nextModels.length === 0) {
      return;
    }
    onChange(mergeProviderModelLists(models, nextModels));
    setDraft("");
  }

  function removeModel(model: string) {
    onChange(models.filter((item) => item !== model));
  }

  return (
    <>
      <Input
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addModels();
          }
        }}
        placeholder={placeholder}
        value={draft}
      />
      {models.length > 0 ? (
        <div className="flex max-h-[120px] flex-wrap gap-1.5 overflow-auto">
          {models.map((model) => (
            <Badge className="max-w-full pr-1" key={model} variant="secondary">
              <span className="min-w-0 max-w-[260px] truncate">{model}</span>
              <button
                aria-label={`${t("Remove model")} ${model}`}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                onClick={() => removeModel(model)}
                title={t("Remove model")}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ModelMultiSelect({
  models,
  onQueryChange,
  onSelectedChange,
  query,
  selected
}: {
  models: string[];
  onQueryChange: (value: string) => void;
  onSelectedChange: (value: string[]) => void;
  query: string;
  selected: string[];
}) {
  const t = useAppText();
  const normalized = query.trim().toLowerCase();
  const visibleModels = normalized ? models.filter((model) => model.toLowerCase().includes(normalized)) : models;

  function toggleModel(model: string) {
    onSelectedChange(selected.includes(model) ? selected.filter((item) => item !== model) : [...selected, model]);
  }

  function selectVisibleModels() {
    onSelectedChange(Array.from(new Set([...selected, ...visibleModels])));
  }

  return (
    <div className="rounded-md border border-input bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={t("Search models")} className="pl-8" onChange={(event) => onQueryChange(event.target.value)} placeholder={t("Search models")} value={query} />
        </div>
        <Button disabled={visibleModels.length === 0} onClick={selectVisibleModels} size="sm" type="button" variant="outline">
          {t("All")}
        </Button>
        <Button disabled={selected.length === 0} onClick={() => onSelectedChange([])} size="sm" type="button" variant="outline">
          {t("Clear")}
        </Button>
      </div>
      <div className="max-h-[220px] overflow-auto p-2">
        {visibleModels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleModels.map((model) => {
            const checked = selected.includes(model);
            return (
              <Label
                className={cn(
                  "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 text-left text-[12px] transition-colors hover:bg-muted",
                  checked && "border-primary bg-accent"
                )}
                key={model}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleModel(model)} />
                <span className="min-w-0 flex-1 truncate">{model}</span>
              </Label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoutingView({
  addRule,
  config,
  editRule,
  moveRule,
  providers,
  removeRule,
  updateFallback,
  updateRule
}: {
  addRule: () => void;
  config: AppConfig;
  editRule: (index: number) => void;
  moveRule: (index: number, direction: -1 | 1) => void;
  providers: GatewayProviderConfig[];
  removeRule: (index: number) => void;
  updateFallback: (fallback: RouterFallbackConfig) => void;
  updateRule: (index: number, patch: Partial<RouterRule>) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const rows = useMemo(() => buildRoutingRuleRows(config), [config.Router.rules]);
  const fallback = config.Router.fallback;
  const visibleRules = useMemo(
    () => rows.filter((row) => routingRuleRowMatchesQuery(row, normalizedQuery)),
    [rows, normalizedQuery]
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search routing rules")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search routing rules")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add routing rule")} onClick={addRule} title={t("Add routing rule")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          <div className="border-b border-border/60 px-4 py-3">
            <RouterFallbackControl
              fallback={fallback}
              label={t("Default failure handling")}
              onChange={updateFallback}
              providers={providers}
            />
          </div>
          {rows.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Route className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No routing rules configured")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Add to create one")}</div>
            </div>
          ) : null}
          {rows.length > 0 && visibleRules.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching routing rules")}</div>
          ) : null}
          {visibleRules.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[940px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(160px,0.8fr)_minmax(220px,1fr)_minmax(240px,1.15fr)_84px_148px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Condition")}</div>
	                  <div className="truncate">{t("Path")}</div>
                  <div className="truncate">{t("Status")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {visibleRules.map((row) => (
                    <AnimatedListItem
                      className="grid min-h-[58px] grid-cols-[minmax(160px,0.8fr)_minmax(220px,1fr)_minmax(240px,1.15fr)_84px_148px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                      key={row.key}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-[12px] font-semibold">{row.name || t("Unnamed")}</div>
                          {row.readonly ? <Badge variant="outline">{t("Plugin")}</Badge> : null}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={`${row.sourceLabel}: ${row.ruleId}`}>
                          {row.sourceLabel}: {row.ruleId}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline">{t(row.typeLabel)}</Badge>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={row.condition}>
                            {row.condition}
                          </span>
                        </div>
                      </div>
                      <div className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={row.target}>
                        {row.target}
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <Toggle checked={row.enabled} disabled={row.readonly} onChange={(enabled) => row.index !== undefined && updateRule(row.index, { enabled })} />
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button aria-label={`${t("Move")} ${row.name || t("rule")} ${t("up")}`} disabled={row.readonly || row.index === undefined || row.index === 0} onClick={() => row.index !== undefined && moveRule(row.index, -1)} size="iconSm" title={t("Move up")} type="button" variant="ghost">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button aria-label={`${t("Move")} ${row.name || t("rule")} ${t("down")}`} disabled={row.readonly || row.index === undefined || row.index === row.ruleCount - 1} onClick={() => row.index !== undefined && moveRule(row.index, 1)} size="iconSm" title={t("Move down")} type="button" variant="ghost">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          aria-label={`${t("Edit")} ${row.name || t("rule")}`}
                          disabled={row.readonly || row.index === undefined}
                          onClick={() => {
                            if (row.index !== undefined) {
                              editRule(row.index);
                            }
                          }}
                          size="iconSm"
                          title={t("Edit rule")}
                          type="button"
                          variant="ghost"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button aria-label={`${t("Remove")} ${row.name || t("rule")}`} disabled={row.readonly || row.index === undefined} onClick={() => row.index !== undefined && removeRule(row.index)} size="iconSm" title={t("Remove rule")} type="button" variant="ghost">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </AnimatedListItem>
                  ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RouterFallbackControl({
  className,
  fallback,
  label,
  onChange,
  providers
}: {
  className?: string;
  fallback: RouterFallbackConfig;
  label: string;
  onChange: (fallback: RouterFallbackConfig) => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const [fallbackModelDraft, setFallbackModelDraft] = useState("");
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const fallbackModeOptions = translateOptions(routerFallbackModeOptions, t);

  function updateFallbackPatch(patch: Partial<RouterFallbackConfig>) {
    onChange(normalizeRouterFallbackConfig({
      ...fallback,
      ...patch
    }));
  }

  function addFallbackModel() {
    const model = fallbackModelDraft.trim();
    if (!model) {
      return;
    }
    updateFallbackPatch({ models: uniqueStrings([...fallback.models, model]) });
    setFallbackModelDraft("");
  }

  function moveFallbackModel(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fallback.models.length) {
      return;
    }
    const models = [...fallback.models];
    const [model] = models.splice(index, 1);
    models.splice(nextIndex, 0, model);
    updateFallbackPatch({ models });
  }

  function removeFallbackModel(index: number) {
    updateFallbackPatch({ models: fallback.models.filter((_, modelIndex) => modelIndex !== index) });
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(180px,220px)_minmax(120px,160px)_1fr]">
        <Field label={label}>
          <SelectControl
            onChange={(mode) => updateFallbackPatch({ mode: mode as RouterFallbackMode })}
            options={fallbackModeOptions}
            value={fallback.mode}
          />
        </Field>
        {fallback.mode === "retry" ? (
          <Field label={t("Retries")}>
            <Input
              max={5}
              min={0}
              onChange={(event) => updateFallbackPatch({ retryCount: clampNumber(Number(event.target.value), 0, 5) })}
              type="number"
              value={String(fallback.retryCount)}
            />
          </Field>
        ) : null}
        {fallback.mode === "model-chain" ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:col-span-2">
            <Field label={t("Fallback model")}>
              <RouteTargetControl
                modelOptions={modelOptions}
                onChange={setFallbackModelDraft}
                value={fallbackModelDraft}
              />
            </Field>
            <Button disabled={!fallbackModelDraft.trim()} onClick={addFallbackModel} type="button">
              <Plus className="h-4 w-4" />
              {t("Add")}
            </Button>
          </div>
        ) : null}
      </div>
      {fallback.mode === "model-chain" ? (
        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          {fallback.models.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">{t("No fallback models configured")}</div>
          ) : (
            fallback.models.map((model, index) => (
              <div className="flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-1" key={`${model}-${index}`}>
                <span className="min-w-0 truncate font-mono text-[11px]" title={model}>{model}</span>
                <Button aria-label={`${t("Move")} ${model} ${t("up")}`} disabled={index === 0} onClick={() => moveFallbackModel(index, -1)} size="iconSm" title={t("Move up")} type="button" variant="ghost">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button aria-label={`${t("Move")} ${model} ${t("down")}`} disabled={index === fallback.models.length - 1} onClick={() => moveFallbackModel(index, 1)} size="iconSm" title={t("Move down")} type="button" variant="ghost">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button aria-label={`${t("Remove")} ${model}`} onClick={() => removeFallbackModel(index)} size="iconSm" title={t("Remove")} type="button" variant="ghost">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function DeleteRoutingRuleDialog({
  onClose,
  onConfirm,
  rule
}: {
  onClose: () => void;
  onConfirm: () => void;
  rule: RouterRule;
}) {
  const t = useAppText();
  const name = rule.name || t("Unnamed rule");
  const condition = formatRouterRuleCondition(rule);
  const target = formatRouterRuleTarget(rule);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Delete Routing Rule")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("Delete this routing rule from the configuration?")}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate" title={name}>
                <span className="font-medium text-foreground">{t("Name")}:</span> {name}
              </div>
              <div className="truncate" title={condition}>
                <span className="font-medium text-foreground">{t("Condition")}:</span> {condition}
              </div>
              <div className="truncate" title={target}>
                <span className="font-medium text-foreground">{t("Target")}:</span> {target}
              </div>
              <div>{t("This action is applied immediately to the draft config and will auto-save with other changes.")}</div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button autoFocus onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button onClick={onConfirm} type="button" variant="destructive">
            <Trash2 className="h-4 w-4" />
            {t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddRoutingRuleDialog({
  canSubmit,
  draft,
  mode,
  onChange,
  onClose,
  onSubmit,
  providers
}: {
  canSubmit: boolean;
  draft: AddRoutingRuleDraft;
  mode: "add" | "edit";
  onChange: (patch: Partial<AddRoutingRuleDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const ruleTypeOptions = translateOptions(routerRuleTypeOptions, t);
  const requiresTarget = draft.type !== "subagent";
  const showsPattern = draft.type === "model-prefix";
  const showsThreshold = draft.type === "long-context";

  function changeType(value: string) {
    const type = value as RouterRuleType;
    const previousDefaultName = routerRuleTypeLabel(draft.type);
    const patch: Partial<AddRoutingRuleDraft> = { type };
    if (!draft.name.trim() || draft.name.trim() === previousDefaultName) {
      patch.name = routerRuleTypeLabel(type);
    }
    if (type === "model-prefix" && !draft.pattern.trim()) {
      patch.pattern = "claude-3-5-haiku";
    }
    if (type === "long-context" && !draft.threshold.trim()) {
      patch.threshold = "200000";
    }
    onChange(patch);
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{mode === "edit" ? t("Edit Routing Rule") : t("Add Routing Rule")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2" layout transition={disclosureSpringTransition}>
            <Field label={t("Name")}>
              <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
            </Field>
            <Field label={t("Condition")}>
              <SelectControl
                value={draft.type}
                onChange={changeType}
                options={ruleTypeOptions}
              />
            </Field>
            <AnimatePresence initial={false}>
              {requiresTarget ? (
                <AnimatedFieldSlot className="sm:col-span-2" key="routing-target">
                  <Field label={t("Target model")}>
                    <RouteTargetControl
                      modelOptions={modelOptions}
                      onChange={(target) => onChange({ target })}
                      value={draft.target}
                    />
                  </Field>
                </AnimatedFieldSlot>
              ) : null}
              {showsPattern ? (
                <AnimatedFieldSlot className="sm:col-span-2" key="routing-pattern">
                  <Field label={t("Model prefix")}>
                    <Input value={draft.pattern} onChange={(event) => onChange({ pattern: event.target.value })} />
                  </Field>
                </AnimatedFieldSlot>
              ) : null}
              {showsThreshold ? (
                <AnimatedFieldSlot key="routing-threshold">
                  <Field label={t("Token threshold")}>
                    <Input type="number" value={draft.threshold} onChange={(event) => onChange({ threshold: event.target.value })} />
                  </Field>
                </AnimatedFieldSlot>
              ) : null}
            </AnimatePresence>
            <Field label={t("Enabled")}>
              <Toggle checked={draft.enabled} onChange={(enabled) => onChange({ enabled })} />
            </Field>
            <RouterFallbackControl
              className="sm:col-span-2"
              fallback={draft.fallback}
              label={t("Failure handling")}
              onChange={(fallback) => onChange({ fallback })}
              providers={providers}
            />
          </motion.div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            {mode === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mode === "edit" ? t("Save") : t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtensionsView({
  configureExtension,
  config,
  installExtension,
  removeExtension,
  setExtensionEnabled
}: {
  configureExtension: (source: ExtensionSource, index: number) => void;
  config: AppConfig;
  installExtension: () => void;
  removeExtension: (source: ExtensionSource, index: number) => void;
  setExtensionEnabled: (source: ExtensionSource, index: number, enabled: boolean) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const extensions = useMemo(() => buildExtensionList(config), [config.plugins, config.providerPlugins, config.virtualModelProfiles]);
  const visibleExtensions = useMemo(
    () => extensions.filter((extension) => extensionMatchesQuery(extension, normalizedQuery)),
    [extensions, normalizedQuery]
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search extensions")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search extensions")}
              value={query}
            />
          </div>
          <Button aria-label={t("Install extension")} onClick={installExtension} title={t("Install extension")} type="button">
            <Plus className="h-4 w-4" />
            {t("Install")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {extensions.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Braces className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No extensions installed")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Install to add one")}</div>
            </div>
          ) : null}
          {extensions.length > 0 && visibleExtensions.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching extensions")}</div>
          ) : null}
          {visibleExtensions.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(180px,0.95fr)_minmax(220px,1.15fr)_minmax(240px,1.2fr)_116px_84px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Path")}</div>
                  <div className="truncate">{t("Capability")}</div>
                  <div className="truncate">{t("Status")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {visibleExtensions.map((extension) => (
                    <AnimatedListItem
                      className="grid min-h-[58px] grid-cols-[minmax(180px,0.95fr)_minmax(220px,1.15fr)_minmax(240px,1.2fr)_116px_84px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                      key={`${extension.source}-${extension.index}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold">{extension.name}</div>
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={extension.target}>
                        {extension.target}
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={extension.capability}>
                        {extension.capability}
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        {extension.canToggle ? (
                          <Toggle checked={extension.enabled} onChange={(enabled) => setExtensionEnabled(extension.source, extension.index, enabled)} />
                        ) : null}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          aria-label={`${t("Configure")} ${extension.name}`}
                          disabled={!extension.canConfigure}
                          onClick={() => configureExtension(extension.source, extension.index)}
                          size="iconSm"
                          title={t("Configure plugin")}
                          type="button"
                          variant="ghost"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button aria-label={`${t("Remove")} ${extension.name}`} onClick={() => removeExtension(extension.source, extension.index)} size="iconSm" title={t("Remove extension")} type="button" variant="ghost">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </AnimatedListItem>
                  ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function DeleteExtensionDialog({
  extension,
  onClose,
  onConfirm
}: {
  extension: ExtensionListItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useAppText();

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Delete Extension")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("Delete this extension from the configuration?")}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate" title={extension.name}>
                <span className="font-medium text-foreground">{t("Name")}:</span> {extension.name}
              </div>
              <div className="truncate" title={extension.target}>
                <span className="font-medium text-foreground">{t("Path")}:</span> {extension.target}
              </div>
              <div className="truncate" title={extension.capability}>
                <span className="font-medium text-foreground">{t("Capability")}:</span> {extension.capability}
              </div>
              <div>{t("This action is applied immediately to the draft config and will auto-save with other changes.")}</div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button autoFocus onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button onClick={onConfirm} type="button" variant="destructive">
            <Trash2 className="h-4 w-4" />
            {t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PluginSettingsDialog({
  draft,
  error,
  extension,
  onChange,
  onClose,
  onSubmit
}: {
  draft: PluginSettingsDraft;
  error: string;
  extension: ExtensionListItem;
  onChange: (patch: Partial<PluginSettingsDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Plugin Settings")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
              <Field label={t("Enabled")}>
                <Toggle checked={draft.enabled} onChange={(enabled) => onChange({ enabled })} />
              </Field>
              <Field label={t("Name")}>
                <Input readOnly value={extension.name} />
              </Field>
              <Field className="sm:col-span-2" label={t("Module path")}>
                <Input value={draft.modulePath} onChange={(event) => onChange({ modulePath: event.target.value })} />
              </Field>
            </div>

            <Field label={t("Browser apps JSON")}>
              <TextAreaControl minHeight={132} value={draft.appsText} onChange={(appsText) => onChange({ appsText })} />
            </Field>

            <Field label={t("Plugin config JSON")}>
              <TextAreaControl minHeight={160} value={draft.configText} onChange={(configText) => onChange({ configText })} />
            </Field>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{t(error)}</div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button onClick={onSubmit} type="button">
            <Check className="h-4 w-4" />
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigureClaudeDesignDialog({
  canSubmit,
  draft,
  routesLabel = "Claude Design routes",
  sourceModelLabel = "Claude Design model",
  sourceModelDefaults = { model: "claude-opus-4-8", pattern: "claude-" },
  onAddRule,
  onChange,
  onChangeRule,
  onClose,
  onRemoveRule,
  onSubmit,
  providers
}: {
  canSubmit: boolean;
  draft: ClaudeDesignRoutingDraft;
  routesLabel?: string;
  sourceModelLabel?: string;
  sourceModelDefaults?: { model: string; pattern: string };
  onAddRule: () => void;
  onChange: (patch: Partial<ClaudeDesignRoutingDraft>) => void;
  onChangeRule: (index: number, patch: Partial<ClaudeDesignRoutingRuleDraft>) => void;
  onClose: () => void;
  onRemoveRule: (index: number) => void;
  onSubmit: () => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const ruleTypeOptions = translateOptions(claudeDesignRouteRuleTypeOptions, t);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Configure Routing")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
              <Field label={t("Model routing")}>
                <Toggle checked={draft.enabled} onChange={(enabled) => onChange({ enabled })} />
              </Field>
              <Field label={t("Default target model")}>
                <RouteTargetControl
                  modelOptions={modelOptions}
                  onChange={(defaultTarget) => onChange({ defaultTarget })}
                  value={draft.defaultTarget}
                />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t(routesLabel)}</div>
                <Button onClick={onAddRule} size="sm" type="button" variant="outline">
                  <Plus className="h-3.5 w-3.5" />
                  {t("Add")}
                </Button>
              </div>

              {draft.rules.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">{t("No plugin routes configured")}</div>
              ) : null}

              <div className="space-y-2">
                <AnimatePresence initial={false}>
                {draft.rules.map((rule, index) => (
                  <AnimatedListItem className="rounded-md border border-border bg-card p-3" key={rule.id || index}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label={t("Name")}>
                        <Input value={rule.name} onChange={(event) => onChangeRule(index, { name: event.target.value })} />
                      </Field>
                      <Field label={t("Condition")}>
                        <SelectControl
                          value={rule.type}
                          onChange={(type) => onChangeRule(index, normalizeClaudeDesignRuleTypeChange(rule, type as ClaudeDesignRouteRuleType, sourceModelDefaults))}
                          options={ruleTypeOptions}
                        />
                      </Field>
                      {rule.type === "model" ? (
                        <Field label={t(sourceModelLabel)}>
                          <Input value={rule.model} onChange={(event) => onChangeRule(index, { model: event.target.value })} />
                        </Field>
                      ) : null}
                      {rule.type === "model-prefix" ? (
                        <Field label={t("Model prefix")}>
                          <Input value={rule.pattern} onChange={(event) => onChangeRule(index, { pattern: event.target.value })} />
                        </Field>
                      ) : null}
                      {rule.type === "long-context" ? (
                        <Field label={t("Token threshold")}>
                          <Input type="number" value={rule.threshold} onChange={(event) => onChangeRule(index, { threshold: event.target.value })} />
                        </Field>
                      ) : null}
                      {isClaudeDesignStaticRuleType(rule.type) ? (
                        <div className="flex min-h-[58px] items-end rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-[12px] text-muted-foreground">{t(claudeDesignRouteRuleTypeLabel(rule.type))}</div>
                      ) : null}
                      <Field label={t("Target model")}>
                        <RouteTargetControl
                          modelOptions={modelOptions}
                          onChange={(target) => onChangeRule(index, { target })}
                          value={rule.target}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                      <Label className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                        <Toggle checked={rule.enabled} onChange={(enabled) => onChangeRule(index, { enabled })} />
                        <span>{t("Enabled")}</span>
                      </Label>
                      <Button aria-label={`${t("Remove")} ${rule.name || t("Plugin route")}`} onClick={() => onRemoveRule(index)} size="iconSm" title={t("Remove rule")} type="button" variant="ghost">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </AnimatedListItem>
                ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            <Check className="h-4 w-4" />
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VirtualModelsView({
  addMcpServer,
  addVirtualModel,
  editMcpServer,
  editVirtualModel,
  mcpServers,
  profiles,
  removeMcpServer,
  removeVirtualModel,
  setVirtualModelEnabled
}: {
  addMcpServer: () => void;
  addVirtualModel: () => void;
  editMcpServer: (index: number) => void;
  editVirtualModel: (index: number) => void;
  mcpServers: GatewayMcpServerConfig[];
  profiles: VirtualModelProfileConfig[];
  removeMcpServer: (index: number) => void;
  removeVirtualModel: (index: number) => void;
  setVirtualModelEnabled: (index: number, enabled: boolean) => void;
}) {
  const t = useAppText();
  const [activeTab, setActiveTab] = useState<"virtual-models" | "mcp-services">("virtual-models");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProfiles = useMemo(
    () => profiles
      .map((profile, index) => ({ index, profile }))
      .filter(({ profile }) => virtualModelMatchesQuery(profile, normalizedQuery)),
    [profiles, normalizedQuery]
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col gap-3"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 p-1" role="tablist">
        <button
          aria-selected={activeTab === "virtual-models"}
          className={cn(
            "inline-flex h-8 min-w-[150px] flex-1 items-center justify-center gap-1.5 rounded-md border px-3 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
            activeTab === "virtual-models"
              ? "border-border bg-card text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.12)]"
              : "border-transparent bg-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
          )}
          onClick={() => setActiveTab("virtual-models")}
          role="tab"
          type="button"
        >
          <Cpu className="h-3.5 w-3.5" />
          {t("Virtual Models")}
        </button>
        <button
          aria-selected={activeTab === "mcp-services"}
          className={cn(
            "inline-flex h-8 min-w-[150px] flex-1 items-center justify-center gap-1.5 rounded-md border px-3 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
            activeTab === "mcp-services"
              ? "border-border bg-card text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.12)]"
              : "border-transparent bg-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
          )}
          onClick={() => setActiveTab("mcp-services")}
          role="tab"
          type="button"
        >
          <Server className="h-3.5 w-3.5" />
          {t("MCP servers")}
        </button>
      </div>

      {activeTab === "mcp-services" ? (
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle className="min-w-0 flex-1 truncate">{t("MCP servers")}</CardTitle>
          <Button aria-label={t("Add MCP server")} onClick={addMcpServer} title={t("Add MCP server")} type="button" variant="outline">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {mcpServers.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-[12px] text-muted-foreground">{t("No MCP servers configured")}</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid h-9 grid-cols-[minmax(180px,0.9fr)_120px_minmax(220px,1.1fr)_minmax(150px,0.75fr)_84px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Transport")}</div>
                  <div className="truncate">{t("Endpoint")}</div>
                  <div className="truncate">{t("Timeout")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  {mcpServers.map((server, index) => (
                    <div className="grid min-h-[52px] grid-cols-[minmax(180px,0.9fr)_120px_minmax(220px,1.1fr)_minmax(150px,0.75fr)_84px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35" key={`${server.name}-${index}`}>
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold" title={server.name}>{server.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground/70" title={server.protocolVersion}>{server.protocolVersion}</div>
                      </div>
                      <div className="min-w-0">
                        <Badge variant="outline">{server.transport}</Badge>
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={mcpServerEndpointSummary(server)}>
                        {mcpServerEndpointSummary(server)}
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground">
                        {server.startupTimeoutMs} / {server.requestTimeoutMs} ms
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button aria-label={`${t("Edit MCP server")} ${server.name}`} onClick={() => editMcpServer(index)} size="iconSm" title={t("Edit MCP server")} type="button" variant="ghost">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button aria-label={`${t("Remove MCP server")} ${server.name}`} onClick={() => removeMcpServer(index)} size="iconSm" title={t("Remove MCP server")} type="button" variant="ghost">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeTab === "virtual-models" ? (
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search virtual models")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search virtual models")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add virtual model")} onClick={addVirtualModel} title={t("Add virtual model")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {profiles.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Cpu className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No virtual models configured")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Add to create one")}</div>
            </div>
          ) : null}
          {profiles.length > 0 && visibleProfiles.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching virtual models")}</div>
          ) : null}
          {visibleProfiles.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[780px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.1fr)_minmax(220px,1.1fr)_minmax(170px,0.85fr)_112px_96px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Alias")}</div>
                  <div className="truncate">{t("Target model")}</div>
                  <div className="truncate">{t("Injected tools")}</div>
                  <div className="truncate">{t("Status")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {visibleProfiles.map(({ index, profile }) => (
                      <AnimatedListItem
                        className="grid min-h-[58px] grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.1fr)_minmax(220px,1.1fr)_minmax(170px,0.85fr)_112px_96px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                        key={`${profile.id || profile.key}-${index}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold" title={profile.displayName || profile.key}>{profile.displayName || profile.key}</div>
                          <div className="truncate text-[11px] text-muted-foreground" title={profile.key}>{profile.key}</div>
                        </div>
                        <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={virtualModelMatchSummary(profile)}>
                          {virtualModelMatchSummary(profile)}
                        </div>
                        <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={virtualModelBaseModelSummary(profile)}>
                          {virtualModelBaseModelSummary(profile)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] text-muted-foreground" title={virtualModelToolSummary(profile)}>
                            {virtualModelToolSummary(profile)}
                          </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <Toggle checked={profile.enabled !== false} onChange={(enabled) => setVirtualModelEnabled(index, enabled)} />
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <Button aria-label={`${t("Edit virtual model")} ${profile.displayName || profile.key}`} onClick={() => editVirtualModel(index)} size="iconSm" title={t("Edit virtual model")} type="button" variant="ghost">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button aria-label={`${t("Remove virtual model")} ${profile.displayName || profile.key}`} onClick={() => removeVirtualModel(index)} size="iconSm" title={t("Remove virtual model")} type="button" variant="ghost">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </AnimatedListItem>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}
    </motion.div>
  );
}

function VirtualModelDialog({
  canSubmit,
  draft,
  error,
  mcpServers,
  mode,
  onChange,
  onClose,
  onSubmit,
  providers
}: {
  canSubmit: boolean;
  draft: VirtualModelDraft;
  error: string;
  mcpServers: GatewayMcpServerConfig[];
  mode: "add" | "edit";
  onChange: (patch: Partial<VirtualModelDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const mcpToolOptions = useMemo(() => createMcpToolOptions(mcpServers, draft.toolsText), [mcpServers, draft.toolsText]);
  const selectedTools = parseVirtualModelTextList(draft.toolsText);
  const matchModeOptions = translateOptions(virtualModelMatchModeOptions, t);

  function toggleMcpTool(name: string, checked: boolean) {
    const nextTools = checked
      ? uniqueStrings([...selectedTools, name])
      : selectedTools.filter((tool) => tool !== name);
    onChange({
      toolsText: nextTools.join("\n"),
      ...(nextTools.length === 0 ? { matchMultimodal: false, matchWebSearch: false } : {})
    });
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{mode === "edit" ? t("Edit Virtual Model") : t("Add Virtual Model")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("Match type")}>
                <SelectControl
                  onChange={(matchMode) => onChange({ matchMode: matchMode as VirtualModelMatchMode })}
                  options={matchModeOptions}
                  value={draft.matchMode}
                />
              </Field>
              <Field label={t(virtualModelMatchModeLabel(draft.matchMode))}>
                <Input value={draft.exactAliasesText} onChange={(event) => onChange({ exactAliasesText: event.target.value })} />
              </Field>
              <Field label={t("Enabled")}>
                <Toggle checked={draft.enabled} onChange={(enabled) => onChange({ enabled })} />
              </Field>
              {draft.matchMode === "alias" ? (
                <Field label={t("Target model")}>
                  <RouteTargetControl modelOptions={modelOptions} onChange={(fixedModel) => onChange({ fixedModel })} value={draft.fixedModel} />
                </Field>
              ) : null}
              <div className="space-y-3 sm:col-span-2">
                <Field label={t("MCP service tools")}>
                  <div className="max-h-[220px] overflow-auto rounded-md border border-border bg-card">
                    {mcpToolOptions.length === 0 ? (
                      <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">{t("No MCP services available")}</div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {mcpToolOptions.map((option) => (
                          <label className="flex min-w-0 cursor-pointer items-start gap-2 px-3 py-2.5 transition-colors hover:bg-muted/35" key={option.value}>
                            <Checkbox
                              checked={selectedTools.includes(option.value)}
                              onCheckedChange={(checked) => toggleMcpTool(option.value, checked)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-[12px] font-medium">{option.label}</span>
                                {!option.available ? <Badge variant="outline">{t("Unavailable")}</Badge> : null}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={option.description}>
                                {option.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>

                {selectedTools.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={t("Adapt image requests")}>
                      <Toggle checked={draft.matchMultimodal} onChange={(matchMultimodal) => onChange({ matchMultimodal })} />
                    </Field>
                    <Field label={t("Adapt web search")}>
                      <Toggle checked={draft.matchWebSearch} onChange={(matchWebSearch) => onChange({ matchWebSearch })} />
                    </Field>
                  </div>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{t(error)}</div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            {mode === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mode === "edit" ? t("Save") : t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function McpServerDialog({
  canSubmit,
  draft,
  error,
  mode,
  onChange,
  onClose,
  onSubmit
}: {
  canSubmit: boolean;
  draft: McpServerDraft;
  error: string;
  mode: "add" | "edit";
  onChange: (patch: Partial<McpServerDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();
  const transportOptions = translateOptions(mcpServerTransportOptions, t);
  const messageModeOptions = translateOptions(mcpStdioMessageModeOptions, t);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{mode === "edit" ? t("Edit MCP Server") : t("Add MCP Server")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Name")}>
              <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
            </Field>
            <Field label={t("Transport")}>
              <SelectControl
                onChange={(transport) => onChange({ transport: transport as GatewayMcpServerTransport })}
                options={transportOptions}
                value={draft.transport}
              />
            </Field>

            {draft.transport === "stdio" ? (
              <>
                <Field label={t("Command")}>
                  <Input value={draft.command} onChange={(event) => onChange({ command: event.target.value })} />
                </Field>
                <Field label={t("Args")}>
                  <Input value={draft.argsText} onChange={(event) => onChange({ argsText: event.target.value })} />
                </Field>
                <Field label={t("Stdio message mode")}>
                  <SelectControl
                    onChange={(stdioMessageMode) => onChange({ stdioMessageMode: stdioMessageMode as GatewayMcpStdioMessageMode })}
                    options={messageModeOptions}
                    value={draft.stdioMessageMode}
                  />
                </Field>
                <Field label={t("Path")}>
                  <Input value={draft.cwd} onChange={(event) => onChange({ cwd: event.target.value })} />
                </Field>
                <Field className="sm:col-span-2" label="Env">
                  <KeyValueRowsControl
                    addLabel={t("Add env variable")}
                    rows={draft.envRows}
                    onChange={(envRows) => onChange({ envRows })}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field className="sm:col-span-2" label={t("URL")}>
                  <Input value={draft.url} onChange={(event) => onChange({ url: event.target.value })} />
                </Field>
                <Field label="API Key">
                  <Input value={draft.apiKey} onChange={(event) => onChange({ apiKey: event.target.value })} />
                </Field>
                <Field label="API Key Env">
                  <Input value={draft.apiKeyEnv} onChange={(event) => onChange({ apiKeyEnv: event.target.value })} />
                </Field>
                <Field className="sm:col-span-2" label={t("Headers")}>
                  <KeyValueRowsControl
                    addLabel={t("Add header")}
                    rows={draft.headerRows}
                    onChange={(headerRows) => onChange({ headerRows })}
                  />
                </Field>
              </>
            )}

            <Field label={t("Protocol version")}>
              <Input value={draft.protocolVersion} onChange={(event) => onChange({ protocolVersion: event.target.value })} />
            </Field>
            <Field label={t("Request timeout")}>
              <Input type="number" value={draft.requestTimeoutMs} onChange={(event) => onChange({ requestTimeoutMs: event.target.value })} />
            </Field>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive sm:col-span-2">{t(error)}</div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            {mode === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mode === "edit" ? t("Save") : t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstallExtensionDialog({
  canSubmit,
  draft,
  error,
  marketplace,
  onChange,
  onChooseLocal,
  onClose,
  onSubmit
}: {
  canSubmit: boolean;
  draft: ExtensionInstallDraft;
  error: string;
  marketplace: PluginMarketplaceEntry[];
  onChange: (patch: Partial<ExtensionInstallDraft>) => void;
  onChooseLocal: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();

  function selectMarketplace(entry: PluginMarketplaceEntry) {
    onChange({
      key: entry.id,
      apps: entry.apps,
      dependencies: entry.dependencies,
      marketplaceId: entry.id,
      modulePath: entry.modulePath,
      selectedName: entry.name
    });
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Install Extension")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-3">
            <div className="space-y-2">
              {marketplace.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">{t("No marketplace extensions")}</div>
              ) : (
                marketplace.map((entry) => (
                  <button
                    className={cn(
                      "flex w-full min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-left text-[12px] transition-colors",
                      draft.marketplaceId === entry.id ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                    )}
                    key={entry.id}
                    onClick={() => selectMarketplace(entry)}
                    type="button"
                  >
                    <span className="truncate font-semibold text-foreground">{entry.name}</span>
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">{entry.description}</span>
                    <span className="truncate text-[10px] text-muted-foreground/80">{entry.capabilities.join(", ")}</span>
                    {entry.dependencies.length > 0 ? (
                      <span className="truncate text-[10px] text-muted-foreground/80">{t("Dependencies")}: {formatPluginDependencies(entry.dependencies)}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{error}</div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter className="justify-between">
          <Button onClick={onChooseLocal} type="button" variant="outline">
            <FolderOpen className="h-4 w-4" />
            {t("Choose folder")}
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              {t("Cancel")}
            </Button>
            <Button disabled={!canSubmit} onClick={onSubmit} type="button">
              <Plus className="h-4 w-4" />
              {t("Install")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <Label className={cn("block min-w-0 space-y-1", className)}>
      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

function AgentLogo({ agent, className }: { agent: ProfileConfig["agent"]; className?: string }) {
  const label = profileAgentLabel(agent);

  return (
    <span
      className={cn("flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background", className)}
      title={label}
    >
      <img alt={`${label} icon`} className="h-5 w-5 object-contain" src={profileAgentLogoUrl(agent)} />
    </span>
  );
}

function SelectControl({
  onChange,
  options,
  value
}: {
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return <Select onValueChange={onChange} options={options} value={value} />;
}

function RouteTargetControl({
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

function TextAreaControl({
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

function KeyValueRowsControl({
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
        </div>
      ))}
    </div>
  );
}

function Toggle({ checked, disabled = false, onChange }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />;
}

function MetricCard({ label, tone, value }: { label: string; tone: "amber" | "blue" | "indigo" | "rose" | "teal"; value: string }) {
  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <div className={cn("h-1", metricToneBar(tone))} />
      <CardContent className="flex h-full min-h-[88px] flex-col justify-center">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 truncate text-[20px] font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function usageStatusTone(point: Pick<UsageTotals, "requestCount" | "successRate">): SystemStatusTone {
  if (point.requestCount <= 0) return "idle";
  if (point.successRate >= 0.995) return "ok";
  if (point.successRate >= 0.98) return "warn";
  return "error";
}

function formatSystemStatusRange(segments: SystemStatusPoint[], range: UsageStatsRange): string {
  if (segments.length === 0) {
    return range;
  }
  const first = segments[0]?.dateLabel ?? "";
  const last = segments.at(-1)?.dateLabel ?? first;
  return first === last ? first : `${first} - ${last}`;
}

function formatStatusBucketDate(bucket: string, range: UsageStatsRange): string {
  const parsed = parseStatusBucketDate(bucket);
  if (!parsed) {
    return bucket;
  }
  const dateOptions: Intl.DateTimeFormatOptions = range === "today" || range === "24h"
    ? { day: "2-digit", hour: "2-digit", hour12: false, month: "2-digit" }
    : { day: "2-digit", month: "2-digit" };
  return new Intl.DateTimeFormat(undefined, dateOptions).format(parsed);
}

function parseStatusBucketDate(bucket: string): Date | undefined {
  const match = bucket.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::00)?)?$/);
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), hour === undefined ? 0 : Number(hour), 0, 0, 0);
}

function systemStatusPointTooltip(segment: SystemStatusPoint, t: (value: string) => string): string {
  return [
    segment.dateLabel,
    `${t("Requests")}: ${formatCompactNumber(segment.point.requestCount)}`,
    `${t("Success rate")}: ${formatPercent(segment.point.successRate)}`,
    `${t("Failed requests")}: ${formatCompactNumber(segment.point.errorCount)}`,
    `${t("Duration")}: ${formatDuration(segment.point.avgDurationMs)}`
  ].join("\n");
}

function systemStatusTooltipPositionClass(index: number, total: number): string {
  if (index <= 1) {
    return "left-0";
  }
  if (index >= total - 2) {
    return "right-0";
  }
  return "left-1/2 -translate-x-1/2";
}

function systemStatusIconClass(tone: SystemStatusTone): string {
  if (tone === "ok") return "bg-emerald-500 text-white";
  if (tone === "warn") return "bg-amber-400 text-amber-950";
  if (tone === "error") return "bg-rose-500 text-white";
  return "bg-muted text-muted-foreground";
}

function systemStatusSegmentClass(tone: SystemStatusTone): string {
  if (tone === "ok") return "bg-emerald-500";
  if (tone === "warn") return "bg-amber-400";
  if (tone === "error") return "bg-rose-500";
  return "bg-muted-foreground/25";
}

function ServiceControlButton({
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
        "app-no-drag inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25",
        active && "text-emerald-700 hover:text-emerald-800"
      )}
      disabled={busy}
      onClick={onClick}
      title={title}
      type="button"
      unstyled
    >
      {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </Button>
  );
}

function EndpointTitleBar({
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

function EndpointInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-2 text-[12px]">
      <span className="text-right text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

function gatewayEndpointFromConfig(config: AppConfig): string {
  if (config.routerEndpoint) {
    return config.routerEndpoint;
  }

  return endpointFromHostPort(config.gateway.host, config.gateway.port);
}

function defaultProfileClientModel(config: AppConfig): string {
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

function normalizeProfileClientModel(value: string | undefined): string {
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

type ProfileModelProviderOption = {
  models: string[];
  name: string;
};

type ParsedProfileModelValue = {
  model: string;
  provider: string;
};

function profileModelProviderOptions(providers: GatewayProviderConfig[]): ProfileModelProviderOption[] {
  return providers
    .filter((provider) => provider.name?.trim() && Array.isArray(provider.models))
    .map((provider) => ({
      models: uniqueStrings(provider.models.filter(Boolean)),
      name: provider.name.trim()
    }))
    .filter((provider) => provider.models.length > 0);
}

function parseProfileModelValue(value: string, providers: GatewayProviderConfig[]): ParsedProfileModelValue {
  const trimmed = normalizeProfileClientModel(value);
  if (!trimmed) {
    return { model: "", provider: "" };
  }
  const providerOptions = profileModelProviderOptions(providers);
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

function profileModelDisplayValue(
  value: string,
  parsedValue: ParsedProfileModelValue,
  providers: GatewayProviderConfig[],
  placeholder: string | undefined
): string {
  if (!value.trim()) {
    return placeholder?.trim() || "";
  }
  const normalized = normalizeProfileClientModel(value);
  if (parsedValue.provider && parsedValue.model) {
    return `${parsedValue.provider}/${parsedValue.model}`;
  }
  const provider = profileModelProviderOptions(providers).find((item) => item.models.includes(normalized));
  return provider ? `${provider.name}/${normalized}` : normalized;
}

function profileModelProviderMatchesQuery(provider: ProfileModelProviderOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return (
    provider.name.toLowerCase().includes(normalizedQuery) ||
    provider.models.some((model) => model.toLowerCase().includes(normalizedQuery))
  );
}

function profileModelMatchesQuery(providerName: string, model: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return providerName.toLowerCase().includes(normalizedQuery) || model.toLowerCase().includes(normalizedQuery);
}

function createProfileDraft(agent: ProfileConfig["agent"] = "claude-code", name?: string): AddProfileDraft {
  return {
    agent,
    cliMiddleware: false,
    codexCliPath: "",
    codexHome: "",
    configFormat: "legacy",
    configFile: "~/.codex/config.toml",
    envRows: [],
    model: "",
    name: name ?? profileAgentLabel(agent),
    providerId: "claude-code-router",
    providerName: "Claude Code Router",
    remoteFrontendMode: "app",
    scope: "global",
    settingsFile: "~/.claude/settings.json",
    smallFastModel: "",
    surface: "auto"
  };
}

function createProfileDraftFromProfile(profile: ProfileConfig): AddProfileDraft {
  if (profile.agent === "claude-code") {
    return {
      ...createProfileDraft("claude-code", profile.name),
      envRows: keyValueRowsFromRecord(profile.env ?? {}),
      model: profile.model,
      scope: normalizeProfileScope(profile.scope),
      settingsFile: profile.settingsFile ?? "~/.claude/settings.json",
      smallFastModel: profile.smallFastModel ?? "",
      surface: normalizeProfileSurface(profile.surface)
    };
  }
  return {
    ...createProfileDraft("codex", profile.name),
    cliMiddleware: Boolean(profile.cliMiddleware),
    codexCliPath: profile.codexCliPath ?? "",
    codexHome: profile.codexHome ?? "",
    configFile: profile.configFile ?? "~/.codex/config.toml",
    configFormat: normalizeCodexConfigFormat(profile.configFormat),
    envRows: keyValueRowsFromRecord(profile.env ?? {}),
    model: profile.model,
    providerId: profile.providerId ?? "claude-code-router",
    providerName: profile.providerName ?? "Claude Code Router",
    remoteFrontendMode: normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode),
    scope: normalizeProfileScope(profile.scope),
    surface: normalizeProfileSurface(profile.surface)
  };
}

function isProfileDraftSubmittable(draft: AddProfileDraft): boolean {
  if (!draft.name.trim()) {
    return false;
  }
  if (!validateProfileEnvRows(draft.envRows)) {
    return false;
  }
  if (draft.agent === "claude-code") {
    return profileScopeUsesGeneratedPath(draft.scope) || Boolean(draft.settingsFile.trim());
  }
  return (
    (profileScopeUsesGeneratedPath(draft.scope) || Boolean(draft.configFile.trim())) &&
    Boolean(draft.providerId.trim()) &&
    Boolean(draft.providerName.trim())
  );
}

function profileConfigFromDraft(
  draft: AddProfileDraft,
  existingProfiles: ProfileConfig[],
  existingProfile?: ProfileConfig
): ProfileConfig {
  const id = existingProfile?.id ?? uniqueProfileId(existingProfiles, draft.name || draft.agent);
  return normalizeProfileItem({
    agent: draft.agent,
    cliMiddleware: draft.cliMiddleware,
    codexCliPath: draft.codexCliPath,
    codexHome: draft.codexHome,
    configFormat: draft.configFormat,
    configFile: draft.configFile,
    enabled: existingProfile?.enabled ?? true,
    env: recordFromKeyValueRows(draft.envRows),
    id,
    model: draft.model,
    name: draft.name,
    providerId: draft.providerId,
    providerName: draft.providerName,
    remoteFrontendMode: draft.remoteFrontendMode,
    scope: draft.scope,
    settingsFile: draft.settingsFile,
    smallFastModel: draft.smallFastModel,
    surface: draft.surface
  }, existingProfiles.length);
}

function normalizeCodexConfigFormat(value: unknown): CodexProfileConfigFormat {
  return value === "separate_profile_files" ? "separate_profile_files" : "legacy";
}

function normalizeCodexRemoteFrontendMode(value: unknown): CodexRemoteFrontendMode {
  return value === "cli" || value === "claude-code" ? value : "app";
}

function normalizeProfileScope(value: unknown): ProfileScope {
  return value === "ccr" || value === "custom" ? value : "global";
}

function normalizeProfileSurface(value: unknown): ProfileSurface {
  return value === "cli" || value === "app" ? value : "auto";
}

function profileScopeUsesGeneratedPath(scope: ProfileScope): boolean {
  return scope === "ccr" || scope === "custom";
}

function profileSummaryItems(
  profile: ProfileConfig,
  config: AppConfig,
  t: (value: string) => string
): Array<{ label: string; value: string }> {
  const scope = normalizeProfileScope(profile.scope);
  const generatedPath = profileScopeUsesGeneratedPath(scope);
  const envCount = Object.keys(profile.env ?? {}).length;
  const envSummaryItems = envCount > 0
    ? [{ label: t("Environment variables"), value: String(envCount) }]
    : [];
  const smallFastModel = profile.smallFastModel?.trim() || "";
  const modelValue = profile.model.trim()
    ? profileModelDisplayValue(
      profile.model,
      parseProfileModelValue(profile.model, config.Providers),
      config.Providers,
      undefined
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
            parseProfileModelValue(smallFastModel, config.Providers),
            config.Providers,
            undefined
          )
          : t("Keep Claude Code default")
      },
      {
        label: t("Settings file"),
        value: generatedPath ? t("Generated path") : (profile.settingsFile ?? "~/.claude/settings.json")
      },
      ...envSummaryItems
    ];
  }

  return [
    { label: t("Model"), value: modelValue },
    { label: t("Provider ID"), value: profile.providerId ?? "claude-code-router" },
    {
      label: t("Config file"),
      value: generatedPath ? t("Generated path") : (profile.configFile ?? "~/.codex/config.toml")
    },
    {
      label: t("Remote frontend"),
      value: t(codexRemoteFrontendModeLabel(normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode)))
    },
    ...envSummaryItems
  ];
}

function normalizeProfileItem(profile: ProfileConfig, index: number): ProfileConfig {
  const name = profile.name.trim() || profileAgentLabel(profile.agent);
  const model = profile.model.trim();
  const scope = normalizeProfileScope(profile.scope);
  const surface = normalizeProfileSurface(profile.surface);
  const env = isPlainRecord(profile.env) ? stringRecordValue(profile.env) : {};
  if (profile.agent === "claude-code") {
    return {
      agent: "claude-code",
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
    cliMiddleware: Boolean(profile.cliMiddleware),
    codexCliPath: profile.codexCliPath?.trim() || "",
    codexHome: profile.codexHome?.trim() || "",
    configFormat: normalizeCodexConfigFormat(profile.configFormat),
    configFile: profile.configFile?.trim() || "~/.codex/config.toml",
    enabled: profile.enabled,
    env,
    id: profile.id || `profile-${index + 1}`,
    model,
    name,
    providerId: profile.providerId?.trim() || "claude-code-router",
    providerName: profile.providerName?.trim() || "Claude Code Router",
    remoteFrontendMode: normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode),
    scope,
    surface
  };
}

function normalizeProfileItems(values: unknown): ProfileConfig[] {
  if (!Array.isArray(values)) {
    return fallbackConfig.profile.profiles;
  }
  return values
    .map((value, index) => isPlainRecord(value) ? normalizeUnknownProfileItem(value, index) : undefined)
    .filter((profile): profile is ProfileConfig => Boolean(profile));
}

function legacyProfileItemsFromProfileConfig(profile: AppConfig["profile"]): ProfileConfig[] {
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
      remoteFrontendMode: profile.codex.remoteFrontendMode,
      scope: "global",
      surface: "auto"
    }, 1)
  ];
}

function normalizeUnknownProfileItem(value: Record<string, unknown>, index: number): ProfileConfig | undefined {
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
    remoteFrontendMode: typeof value.remoteFrontendMode === "string"
      ? normalizeCodexRemoteFrontendMode(value.remoteFrontendMode)
      : typeof value.frontendMode === "string"
        ? normalizeCodexRemoteFrontendMode(value.frontendMode)
        : typeof value.coreMode === "string"
          ? normalizeCodexRemoteFrontendMode(value.coreMode)
          : undefined,
    scope: typeof value.scope === "string" ? normalizeProfileScope(value.scope) : "global",
    settingsFile: typeof value.settingsFile === "string" ? value.settingsFile : undefined,
    smallFastModel: typeof value.smallFastModel === "string" ? value.smallFastModel : undefined,
    surface: typeof value.surface === "string" ? normalizeProfileSurface(value.surface) : "auto"
  }, index);
}

function uniqueProfileId(existingProfiles: ProfileConfig[], value: string): string {
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

function profileAgentLabel(agent: ProfileConfig["agent"]): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  return "Codex";
}

function profileScopeLabel(scope: ProfileScope): string {
  if (scope === "global") {
    return "System default";
  }
  if (scope === "custom") {
    return "Custom config path";
  }
  return "Only opened from CCR";
}

function profileSurfaceLabel(surface: ProfileSurface): string {
  if (surface === "cli") {
    return "CLI only";
  }
  if (surface === "app") {
    return "App only";
  }
  return "Auto";
}

function codexRemoteFrontendModeLabel(mode: CodexRemoteFrontendMode): string {
  return codexRemoteFrontendModeOptions.find((option) => option.value === mode)?.label ?? "Codex App";
}

function profileAgentLogoUrl(agent: ProfileConfig["agent"]): string {
  if (agent === "claude-code") {
    return claudeCodeLogoUrl;
  }
  return codexLogoUrl;
}

function endpointFromHostPort(host: string, port: number): string {
  const trimmedHost = host.trim() || "127.0.0.1";
  const endpointHost = trimmedHost === "0.0.0.0" ? "127.0.0.1" : trimmedHost;
  const formattedHost = endpointHost.includes(":") && !endpointHost.startsWith("[") ? `[${endpointHost}]` : endpointHost;
  return `http://${formattedHost}:${port}`;
}

function proxyRestartMessage(status: ProxyStatus): string {
  if (status.state !== "running") {
    return status.lastError || "Proxy is stopped.";
  }
  if (status.systemProxy.state === "error") {
    return `Proxy restarted, but system proxy switching failed: ${status.systemProxy.lastError || "Unknown error"}`;
  }
  return "Proxy restarted.";
}

function gatewayServiceMessage(status: GatewayStatus, stopped: boolean): string {
  if (stopped) {
    return "Service paused.";
  }
  if (status.state === "running") {
    return "Service started.";
  }
  return status.lastError || "Service did not start.";
}

function endpointDetails(endpoint: string, config: AppConfig): { host: string; port: string } {
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

function StatusBadge({ state }: { state: GatewayStatus["state"] | ProxyStatus["state"] }) {
  const t = useAppText();
  return <Badge variant={state === "running" ? "success" : state === "error" ? "danger" : state === "starting" ? "warning" : "outline"}>{t(state)}</Badge>;
}

function certificateStatusLabel(status: ProxyCertificateStatus): string {
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

function certificateStatusVariant(status: ProxyCertificateStatus): "danger" | "outline" | "success" | "warning" {
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

function formatProxyCertificateInstallMessage(result: ProxyCertificateInstallResult, status: ProxyCertificateStatus | undefined): string {
  if (status?.trusted) {
    return result.message;
  }

  const parts = [result.message];
  if (status?.message && status.message !== result.message) {
    parts.push(`Status: ${status.message}`);
  }
  const message = parts.join("\n\n");
  if (!result.manualCommand) {
    return message;
  }

  return `${message}\n\nManual install command:\n${result.manualCommand}`;
}

function proxyCertificateTrustSteps(status: ProxyCertificateStatus): string[] {
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

function networkExchangeMatchesQuery(exchange: ProxyNetworkExchange, query: string): boolean {
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

function networkRowId(exchange: ProxyNetworkExchange, index: number, total: number): string {
  const numeric = Number(exchange.id);
  if (Number.isFinite(numeric) && numeric > 0) {
    return String(numeric);
  }
  return String(Math.max(1, total - index));
}

function networkLifecycleLabel(exchange: ProxyNetworkExchange): string {
  if (exchange.state === "pending") {
    return "Active";
  }
  if (exchange.state === "error") {
    return "Error";
  }
  return "Completed";
}

function networkCodeLabel(exchange: ProxyNetworkExchange): string {
  return exchange.statusCode === undefined ? "-" : String(exchange.statusCode);
}

function networkStatusLabel(exchange: ProxyNetworkExchange): string {
  if (exchange.statusCode !== undefined) {
    return String(exchange.statusCode);
  }
  return exchange.state;
}

function networkStatusVariant(exchange: ProxyNetworkExchange): "danger" | "outline" | "success" | "warning" {
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNetworkHeaders(headers: Record<string, string | string[]>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n");
}

function networkHeaderRows(headers: Record<string, string | string[]>): Array<[string, string]> {
  return Object.entries(headers).map(([key, value]) => [formatHeaderName(key), Array.isArray(value) ? value.join(", ") : value]);
}

function networkQueryRows(url: string): Array<[string, string]> {
  try {
    const parsed = new URL(url);
    return Array.from(parsed.searchParams.entries());
  } catch {
    return [];
  }
}

function networkSummaryRows(exchange: ProxyNetworkExchange): Array<[string, string]> {
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

function formatNetworkRequestRaw(exchange: ProxyNetworkExchange): string {
  const headers = formatNetworkHeaders(exchange.requestHeaders);
  return [
    `${exchange.method} ${exchange.path || "/"} HTTP/1.1`,
    headers,
    "",
    exchange.requestBody.text || ""
  ].join("\n");
}

function formatNetworkResponseRaw(exchange: ProxyNetworkExchange): string {
  const headers = formatNetworkHeaders(exchange.responseHeaders ?? {});
  return [
    `HTTP/1.1 ${networkCodeLabel(exchange)} ${networkLifecycleLabel(exchange)}`,
    headers,
    "",
    exchange.responseBody?.text || ""
  ].join("\n");
}

function formatHeaderName(value: string): string {
  return value
    .split("-")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join("-");
}

function clientInitial(value: string): string {
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

function formatNetworkTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatNetworkDateTime(value: string): string {
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

function formatDuration(value: number | undefined): string {
  if (value === undefined) {
    return "pending";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function createEmptyUsageStats(range: UsageStatsRange): UsageStatsSnapshot {
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

function createEmptyAgentAnalysis(range: UsageStatsRange): AgentAnalysisSnapshot {
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

function createEmptyRequestLogPage(filter: RequestLogListFilter = {}): RequestLogPage {
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

function createEmptyAgentConcurrencySeries(range: UsageStatsRange) {
  return createEmptyUsageSeries(range).map((point) => ({
    bucket: point.bucket,
    label: point.label,
    maxConcurrentRequests: 0,
    requestCount: 0
  }));
}

function createEmptyUsageSeries(range: UsageStatsRange) {
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

function emptyUsageTotals(): UsageTotals {
  return {
    avgDurationMs: 0,
    cacheRatio: 0,
    cacheTokens: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    requestCount: 0,
    successRate: 0,
    totalTokens: 0
  };
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard"
  }).format(value);
}

function compareProviderAccountSnapshots(a: ProviderAccountSnapshot, b: ProviderAccountSnapshot): number {
  return providerAccountStatusRank(b.status) - providerAccountStatusRank(a.status) || a.provider.localeCompare(b.provider);
}

function providerAccountStatusRank(status: ProviderAccountSnapshot["status"]): number {
  if (status === "error") return 4;
  if (status === "critical") return 3;
  if (status === "warning") return 2;
  if (status === "ok") return 1;
  return 0;
}

function primaryProviderAccountMeter(account: ProviderAccountSnapshot): ProviderAccountMeter | undefined {
  return [...account.meters].sort((a, b) => {
    const aRatio = providerAccountMeterRemainingRatio(a) ?? 1;
    const bRatio = providerAccountMeterRemainingRatio(b) ?? 1;
    return aRatio - bRatio;
  })[0];
}

function providerAccountMeterRemainingRatio(meter: ProviderAccountMeter): number | undefined {
  if (!meter.limit || meter.limit <= 0 || meter.remaining === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(1, meter.remaining / meter.limit));
}

function providerAccountMeterProgress(meter: ProviderAccountMeter): number | undefined {
  const ratio = providerAccountMeterRemainingRatio(meter);
  return ratio === undefined ? undefined : Math.max(3, Math.round(ratio * 100));
}

function providerAccountBadgeVariant(status: ProviderAccountSnapshot["status"]): "danger" | "outline" | "success" | "warning" {
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

function providerAccountProgressClass(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "bg-red-500";
  }
  if (status === "warning") {
    return "bg-amber-500";
  }
  return "bg-emerald-500";
}

function formatProviderAccountMeterValue(meter: ProviderAccountMeter): string {
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
  if (meter.unit === "hours") {
    return `${formatProviderAccountNumber(value)}h`;
  }
  if (meter.unit === "minutes") {
    return `${formatProviderAccountNumber(value)}m`;
  }
  return `${formatCompactNumber(value)} ${meter.unit}`;
}

function formatProviderAccountNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value);
}

function formatProviderAccountReset(value: string): string {
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

function formatAxisNumber(value: number): string {
  return formatCompactNumber(value);
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function logSelectOptions(label: string, values: string[], selected: string | undefined): Array<{ label: string; value: string }> {
  const merged = new Set(values);
  if (selected) {
    merged.add(selected);
  }
  return [
    { label, value: "" },
    ...Array.from(merged).map((value) => ({ label: value, value }))
  ];
}

function normalizeAgentFilterValue(value: string): AgentFilterValue {
  return value === "claude-code" || value === "codex" || value === "claude-design" || value === "unknown" ? value : "all";
}

function agentKindLabel(agent: AgentKind): string {
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

function compactId(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function compactUserAgent(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}

function formatStatusCodeCounts(values: Array<{ count: number; statusCode: number }>): string {
  return values.map((item) => `${item.statusCode || "-"} x${item.count}`).join(", ") || "-";
}

function formatToolCounts(values: Array<{ count: number; name: string }>): string {
  return values.map((item) => `${item.name} x${item.count}`).join(", ");
}

function formatLogDateTime(value: string): string {
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

function formatLogTokenSummary(entry: RequestLogEntry, t: (value: string) => string): string {
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

function logRequestModel(entry: RequestLogEntry): string {
  return logBodyModel(entry.requestBody) || entry.model || "unknown";
}

function logResponseModel(entry: RequestLogEntry): string {
  return logBodyModel(entry.responseBody) || entry.model || "unknown";
}

function logBodyModel(body: RequestLogBody | undefined): string | undefined {
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

function modelFromPayload(payload: unknown): string | undefined {
  if (!isPlainRecord(payload)) {
    return undefined;
  }
  const response = isPlainRecord(payload.response) ? payload.response : payload;
  return stringValue(response.model) ||
    stringValue(payload.model) ||
    stringValue(response.modelVersion) ||
    stringValue(payload.modelVersion);
}

type FormattedLogBody = {
  json?: unknown;
  text: string;
};

function logBodyKey(body: RequestLogBody | undefined): string {
  if (!body) {
    return "missing";
  }
  return JSON.stringify([
    body.encoding ?? "",
    body.sizeBytes,
    body.text ?? ""
  ]);
}

function formatLogBodyView(body: RequestLogBody | undefined): FormattedLogBody {
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

function filterLogText(value: string, query: string): string {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return value;
  }
  const lines = value.split(/\r?\n/);
  const matched = lines.filter((line) => line.toLowerCase().includes(normalized));
  return matched.length > 0 ? matched.join("\n") : "No matching lines";
}

function parseLogJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseLogStreamPayloads(value: string): unknown[] {
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

function isJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === "object";
}

function jsonContainerEntries(value: Record<string, unknown> | unknown[]): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }
  return Object.entries(value);
}

function createInitialLogJsonExpandedPaths(value: unknown): Set<string> {
  return isJsonContainer(value) ? new Set(["$"]) : new Set();
}

function jsonChildPath(parentPath: string, key: string): string {
  return `${parentPath}/${encodeURIComponent(key)}`;
}

function jsonContainerSummary(value: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  return `Object(${Object.keys(value).length})`;
}

function cloneConfig(config: AppConfig): AppConfig {
  return JSON.parse(JSON.stringify(config)) as AppConfig;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: string[]): string[] {
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

function isMacPlatform(platform: string): boolean {
  const normalized = platform.toLowerCase();
  return normalized === "darwin" || normalized.includes("mac");
}

function readLanguagePreference(): AppLanguagePreference {
  try {
    return normalizeLanguagePreference(window.localStorage.getItem(languagePreferenceStorageKey));
  } catch {
    return "system";
  }
}

function persistLanguagePreference(language: AppLanguagePreference) {
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

function detectSystemLanguage(): ResolvedLanguage {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function detectSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function normalizeLanguagePreference(value: unknown): AppLanguagePreference {
  return value === "en" || value === "zh" || value === "system" ? value : "system";
}

function normalizeThemePreference(value: unknown): AppConfig["theme"] {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function normalizeTrayIconPreference(value: unknown): AppConfig["trayIcon"] {
  return value === "random" || value === "violet" || value === "orange" || value === "cyan" || value === "progress"
    ? value
    : "random";
}

function normalizeTrayProgressTargetTokens(value: unknown): number {
  return Math.min(1_000_000_000, Math.max(1000, positiveInteger(value) ?? 100000));
}

function normalizeTrayWindowModules(value: unknown): TrayWindowModuleId[] {
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

function formatSystemOption(label: string, value: string): string {
  return `${label} (${value})`;
}

function themeDisplayName(theme: ResolvedTheme, copy: AppCopy): string {
  return theme === "dark" ? copy.settings.themeDark : copy.settings.themeLight;
}

function languageDisplayName(language: ResolvedLanguage, copy: AppCopy): string {
  return language === "zh" ? copy.settings.languageChinese : copy.settings.languageEnglish;
}

function metricToneBar(tone: "amber" | "blue" | "indigo" | "rose" | "teal") {
  if (tone === "teal") return "bg-teal-500";
  if (tone === "blue") return "bg-blue-500";
  if (tone === "indigo") return "bg-indigo-500";
  if (tone === "amber") return "bg-amber-500";
  return "bg-rose-500";
}

function normalizeConfig(config: AppConfig): AppConfig {
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
        configFormat: normalizeCodexConfigFormat(profileConfig.codex?.configFormat),
        remoteFrontendMode: normalizeCodexRemoteFrontendMode(profileConfig.codex?.remoteFrontendMode)
      },
      profiles
    },
    plugins: Array.isArray(config.plugins) ? config.plugins : [],
    providerPlugins: Array.isArray(config.providerPlugins) ? config.providerPlugins : [],
    theme: normalizeThemePreference(config.theme),
    trayIcon: normalizeTrayIconPreference(config.trayIcon),
    trayProgressTargetTokens: normalizeTrayProgressTargetTokens(config.trayProgressTargetTokens),
    trayWindowModules: normalizeTrayWindowModules(config.trayWindowModules),
    virtualModelProfiles: Array.isArray(config.virtualModelProfiles) ? config.virtualModelProfiles : []
  };
}

function normalizeApiKeys(values: unknown, legacyKey?: string): ApiKeyConfig[] {
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

function normalizeApiKeyConfig(value: unknown, index: number): ApiKeyConfig | undefined {
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

function normalizeApiKeyLimits(value: unknown): ApiKeyLimitConfig | undefined {
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

function createApiKeyList(config: AppConfig): ApiKeyListItem[] {
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

function createApiKeyDraft(): AddApiKeyDraft {
  return {
    expirationPreset: "never",
    expiresAt: toDatetimeLocalValue(addDays(new Date(), 30)),
    limitRows: [],
    name: ""
  };
}

function createApiKeyEditDraft(apiKey: ApiKeyConfig): AddApiKeyDraft {
  return {
    expirationPreset: apiKey.expiresAt ? "custom" : "never",
    expiresAt: datetimeLocalValueFromIso(apiKey.expiresAt),
    limitRows: apiKeyLimitRowsFromConfig(apiKey.limits),
    name: apiKey.name ?? ""
  };
}

function apiKeyMatchesQuery(apiKey: ApiKeyListItem, query: string): boolean {
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

function createGeneratedApiKey(draft: AddApiKeyDraft): ApiKeyConfig {
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

function updateApiKeyEditableConfig(apiKey: ApiKeyConfig, draft: AddApiKeyDraft): ApiKeyConfig {
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

function apiKeyLimitsFromDraft(draft: AddApiKeyDraft): ApiKeyLimitConfig | undefined {
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

function apiKeyLimitRowsFromConfig(limits: ApiKeyLimitConfig | undefined): ApiKeyLimitDraftRow[] {
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

function createApiKeyLimitDraftRow(
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

function apiKeyLimitField(metric: ApiKeyLimitMetric, window: LimitWindowPreset): keyof ApiKeyLimitConfig | undefined {
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

function expiresAtFromApiKeyDraft(draft: AddApiKeyDraft): string | undefined {
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

function formatApiKeyExpiration(apiKey: ApiKeyListItem): string {
  if (!apiKey.expiresAt) {
    return "Never";
  }
  const date = new Date(apiKey.expiresAt);
  if (!Number.isFinite(date.getTime())) {
    return "Invalid";
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatApiKeyLimits(limits: ApiKeyLimitConfig | undefined): string {
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

function formatMetricLimitParts(
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

function limitWindowPresetFromMs(value: number | undefined, fallback: LimitWindowPreset): LimitWindowPreset {
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

function positiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : undefined;
}

async function copyTextToClipboard(value: string): Promise<void> {
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDatetimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function datetimeLocalValueFromIso(value: string | undefined): string {
  if (!value) {
    return toDatetimeLocalValue(addDays(new Date(), 30));
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? toDatetimeLocalValue(date) : toDatetimeLocalValue(addDays(new Date(), 30));
}

function generateApiKeyId(): string {
  return `key_${randomBase64Url(9)}`;
}

function maskApiKey(value: string): string {
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function generateApiKeyValue(): string {
  return `sk-${randomBase64Url(24)}`;
}

function randomBase64Url(byteLength: number): string {
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

function normalizeRouterConfig(value: Partial<RouterConfig> | undefined): RouterConfig {
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

function normalizeRouterFallbackConfig(value: Partial<RouterFallbackConfig> | unknown): RouterFallbackConfig {
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

function parseRouterFallbackMode(value: unknown): RouterFallbackMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return routerFallbackModeOptions.some((option) => option.value === normalized)
    ? normalized as RouterFallbackMode
    : undefined;
}

function normalizeRouterRules(value: unknown): RouterRule[] | undefined {
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

function parseRouterRuleType(value: unknown): RouterRuleType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return isRouterRuleType(normalized) ? normalized : undefined;
}

function isRouterRuleType(value: string): value is RouterRuleType {
  return routerRuleTypeOptions.some((option) => option.value === value);
}

function formatProxyTargets(targets: AppConfig["proxy"]["targets"]): string {
  return targets
    .map((target) => [target.host, ...(target.paths ?? [])].join(" "))
    .join("\n");
}

function parseProxyTargetsText(value: string): AppConfig["proxy"]["targets"] {
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

type KnownWrapperPluginConfig<TId extends string> = AppConfig["plugins"][number] & { id: TId };

function isClaudeDesignPluginConfig(item: unknown): item is KnownWrapperPluginConfig<"claude-design"> {
  if (!isPlainRecord(item)) {
    return false;
  }
  const id = stringValue(item.id) || stringValue(item.key);
  return id === "claude-design";
}

function isCursorProxyPluginConfig(item: unknown): item is KnownWrapperPluginConfig<"cursor-proxy"> {
  if (!isPlainRecord(item)) {
    return false;
  }
  const id = stringValue(item.id) || stringValue(item.key);
  return id === "cursor-proxy";
}

function createClaudeDesignRoutingDraft(pluginConfig?: unknown): ClaudeDesignRoutingDraft {
  const config = readClaudeDesignRoutingConfig(pluginConfig);
  return {
    defaultTarget: config.defaultTarget,
    enabled: config.enabled,
    rules: config.rules.map((rule) => ({ ...rule }))
  };
}

function createCursorProxyRoutingDraft(pluginConfig?: unknown): ClaudeDesignRoutingDraft {
  const config = readClaudeDesignRoutingConfig(pluginConfig);
  return {
    defaultTarget: config.defaultTarget,
    enabled: config.enabled,
    rules: config.rules.map((rule) => ({ ...rule }))
  };
}

function readClaudeDesignRoutingConfig(pluginConfig?: unknown): ClaudeDesignRoutingDraft {
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

function normalizeClaudeDesignRoutingRuleDraft(value: unknown, index: number): ClaudeDesignRoutingRuleDraft | undefined {
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

function createClaudeDesignRoutingRuleDraft(existingRules: ClaudeDesignRoutingRuleDraft[] = []): ClaudeDesignRoutingRuleDraft {
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

function createCursorProxyRoutingRuleDraft(existingRules: ClaudeDesignRoutingRuleDraft[] = []): ClaudeDesignRoutingRuleDraft {
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

function normalizeClaudeDesignRuleTypeChange(
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

function isClaudeDesignRoutingDraftValid(draft: ClaudeDesignRoutingDraft): boolean {
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

function claudeDesignRoutingConfigFromDraft(draft: ClaudeDesignRoutingDraft): Record<string, unknown> {
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

function createVirtualModelDraft(config: AppConfig): VirtualModelDraft {
  const profiles = config.virtualModelProfiles ?? [];
  const key = uniqueVirtualModelKey(profiles);
  return {
    baseModelMode: "fixed",
    clientToolsPolicy: "deny",
    description: "",
    descriptionTemplate: "",
    displayName: "Virtual Model",
    displayNameTemplate: "{profileDisplayName}",
    enabled: true,
    exactAliasesText: key,
    fixedModel: createRouteModelOptions(config.Providers)[0]?.value ?? "",
    id: uniqueVirtualModelId(profiles, key),
    includeInGatewayModels: true,
    instructionsAppend: "",
    instructionsPrepend: "",
    instructionsReplace: "",
    key,
    materializationEnabled: true,
    matchMultimodal: false,
    matchMode: "alias",
    matchWebSearch: false,
    maxToolCalls: "8",
    maxTurns: "6",
    prefixesText: "",
    suffixesText: "",
    toolChoiceText: "",
    tools: [],
    toolsText: "",
    executionMode: "tool_loop"
  };
}

function createVirtualModelDraftFromProfile(profile: VirtualModelProfileConfig): VirtualModelDraft {
  const exactAliases = profile.match?.exactAliases ?? [];
  const prefixes = profile.match?.prefixes ?? [];
  const suffixes = profile.match?.suffixes ?? [];
  const matchMode = virtualModelMatchModeFromProfile(profile);
  const matchValues = matchMode === "prefix" ? prefixes : matchMode === "suffix" ? suffixes : exactAliases;
  const toolDrafts = (profile.tools ?? []).map((tool, index) => createVirtualModelToolDraft(tool, index));
  return {
    baseModelMode: profile.baseModel?.mode ?? (profile.baseModel?.fixedModel ? "fixed" : "request"),
    clientToolsPolicy: profile.execution?.clientToolsPolicy === "deny" ? "deny" : "allow",
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
    matchMultimodal: Boolean(profile.execution?.matchMultimodal),
    matchMode,
    matchWebSearch: Boolean(profile.execution?.matchWebSearch),
    maxToolCalls: String(profile.execution?.maxToolCalls ?? 8),
    maxTurns: String(profile.execution?.maxTurns ?? 6),
    prefixesText: (profile.match?.prefixes ?? []).join(", "),
    suffixesText: (profile.match?.suffixes ?? []).join(", "),
    toolChoiceText: formatVirtualModelToolChoice(profile.toolChoice),
    tools: toolDrafts,
    toolsText: toolDrafts.map((tool) => tool.name).join("\n"),
    executionMode: profile.execution?.mode === "decorate_only" ? "decorate_only" : "tool_loop"
  };
}

function createVirtualModelToolDraft(tool?: Partial<VirtualModelProfileConfig["tools"][number]>, index = 0): VirtualModelToolDraft {
  return {
    description: tool?.description ?? "",
    id: `tool-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    inputSchemaText: tool?.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : "",
    name: tool?.name ?? "",
    visibility: tool?.visibility === "client" ? "client" : "internal"
  };
}

function virtualModelMatchModeFromProfile(profile: VirtualModelProfileConfig): VirtualModelMatchMode {
  if (profile.match?.prefixes?.length) {
    return "prefix";
  }
  if (profile.match?.suffixes?.length) {
    return "suffix";
  }
  return "alias";
}

function virtualModelMatchModeLabel(mode: VirtualModelMatchMode): string {
  if (mode === "prefix") {
    return "Prefix";
  }
  if (mode === "suffix") {
    return "Suffix";
  }
  return "Alias";
}

function normalizeVirtualModelDraftPatch(current: VirtualModelDraft, patch: Partial<VirtualModelDraft>): VirtualModelDraft {
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
  if (patch.key !== undefined && (!current.displayName.trim() || current.displayName === "Virtual Model")) {
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

function validateVirtualModelDraft(draft: VirtualModelDraft): string {
  const matchValues = parseVirtualModelTextList(draft.exactAliasesText);
  if (matchValues.length === 0) {
    if (draft.matchMode === "prefix") {
      return "Prefix is required.";
    }
    if (draft.matchMode === "suffix") {
      return "Suffix is required.";
    }
    return "Alias is required.";
  }
  if (draft.matchMode === "alias" && !draft.fixedModel.trim()) {
    return "Target model is required.";
  }

  const toolNames = new Set<string>();
  for (const name of parseVirtualModelTextList(draft.toolsText)) {
    if (toolNames.has(name)) {
      return "Tool names must be unique.";
    }
    toolNames.add(name);
  }

  return "";
}

function virtualModelProfileFromDraft(
  draft: VirtualModelDraft,
  existingProfiles: VirtualModelProfileConfig[],
  editIndex: number | undefined
): VirtualModelProfileConfig {
  const matchValues = parseVirtualModelTextList(draft.exactAliasesText);
  const primaryMatchValue = matchValues[0] ?? draft.key.trim();
  const key = sanitizeConfigId(primaryMatchValue) || sanitizeConfigId(draft.key) || primaryMatchValue || draft.key.trim();
  const id = editIndex === undefined ? uniqueVirtualModelId(existingProfiles, key, editIndex) : draft.id || uniqueVirtualModelId(existingProfiles, key, editIndex);
  const displayName = titleFromConfigKey(primaryMatchValue) || primaryMatchValue || draft.displayName.trim() || key;
  const tools = virtualModelToolsFromDraft(draft);
  const maxToolCalls = numberValue(draft.maxToolCalls);
  const maxTurns = numberValue(draft.maxTurns);
  return {
    baseModel: virtualModelBaseModelFromDraft(draft),
    displayName,
    enabled: draft.enabled,
    execution: {
      clientToolsPolicy: draft.clientToolsPolicy,
      ...(tools.length > 0 && draft.matchMultimodal ? { matchMultimodal: true } : {}),
      ...(tools.length > 0 && draft.matchWebSearch ? { matchWebSearch: true } : {}),
      maxToolCalls: clampNumber(maxToolCalls || Math.max(tools.length, 1), 1, 50),
      maxTurns: clampNumber(maxTurns || 6, 1, 50),
      mode: draft.executionMode,
      streamMode: "buffered"
    },
    id,
    key,
    match: virtualModelMatchFromDraft(draft, matchValues),
    materialization: {
      displayNameTemplate: draft.matchMode === "alias" ? "{profileDisplayName}" : "{alias}",
      enabled: true,
      includeInGatewayModels: true
    },
    tools
  };
}

function virtualModelBaseModelFromDraft(draft: VirtualModelDraft): VirtualModelProfileConfig["baseModel"] {
  if (draft.matchMode === "prefix") {
    return { mode: "strip_prefix" };
  }
  if (draft.matchMode === "suffix") {
    return { mode: "strip_suffix" };
  }
  return {
    fixedModel: normalizeCoreModelSelector(draft.fixedModel),
    mode: "fixed"
  };
}

function virtualModelMatchFromDraft(
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

function virtualModelToolsFromDraft(draft: VirtualModelDraft): VirtualModelProfileConfig["tools"] {
  const existingTools = new Map(
    draft.tools
      .map((tool) => [tool.name.trim(), tool] as const)
      .filter(([name]) => Boolean(name))
  );

  return parseVirtualModelTextList(draft.toolsText).map((name) => {
    const existingTool = existingTools.get(name);
    const inputSchema = existingTool ? parseVirtualModelJsonObject(existingTool.inputSchemaText) : undefined;
    return {
      ...(existingTool?.description.trim() ? { description: existingTool.description.trim() } : {}),
      ...(inputSchema?.ok && inputSchema.value ? { inputSchema: inputSchema.value } : {}),
      name,
      visibility: "internal" as const
    };
  });
}

function parseVirtualModelJsonObject(value: string): { ok: true; value?: Record<string, unknown> } | { ok: false } {
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

function formatVirtualModelToolChoice(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function parseVirtualModelTextList(value: string): string[] {
  return uniqueStrings(
    value
      .split(/\r?\n|,/g)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function normalizeCoreModelSelector(value: string): string {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : trimmed;
  }
  return trimmed;
}

function uniqueVirtualModelKey(profiles: VirtualModelProfileConfig[]): string {
  const existing = new Set(profiles.map((profile) => profile.key));
  for (let index = profiles.length + 1; index < 1000; index += 1) {
    const candidate = `virtual-${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `virtual-${Date.now()}`;
}

function uniqueVirtualModelId(profiles: VirtualModelProfileConfig[], key: string, editIndex?: number): string {
  const base = sanitizeConfigId(key) || "virtual-model";
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

function titleFromConfigKey(value: string): string {
  const words = value
    .trim()
    .split(/[-_\s.]+/g)
    .filter(Boolean);
  return words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(" ");
}

function virtualModelMatchesQuery(profile: VirtualModelProfileConfig, query: string): boolean {
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

function virtualModelMatchSummary(profile: VirtualModelProfileConfig): string {
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

function virtualModelBaseModelSummary(profile: VirtualModelProfileConfig): string {
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

function virtualModelToolSummary(profile: VirtualModelProfileConfig): string {
  if (!profile.tools?.length) {
    return "-";
  }
  return profile.tools.map((tool) => tool.name).join(", ");
}

function createMcpToolOptions(mcpServers: GatewayMcpServerConfig[], selectedToolsText: string): Array<{ available: boolean; description: string; label: string; value: string }> {
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

function virtualModelExecutionSummary(profile: VirtualModelProfileConfig): string {
  const execution = profile.execution;
  const features = [
    execution?.matchMultimodal ? "image" : "",
    execution?.matchWebSearch ? "web search" : ""
  ].filter(Boolean);
  return `${execution?.mode || "tool_loop"} · ${execution?.maxTurns ?? 6}/${execution?.maxToolCalls ?? 8}${features.length ? ` · ${features.join(", ")}` : ""}`;
}

function createMcpServerDraft(servers: GatewayMcpServerConfig[] = []): McpServerDraft {
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

function createMcpServerDraftFromConfig(server: GatewayMcpServerConfig): McpServerDraft {
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

function validateMcpServerDraft(draft: McpServerDraft): string {
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
  if (draft.transport === "stdio" && !validateKeyValueRows(draft.envRows)) {
    return "Env rows require keys.";
  }
  if (draft.transport !== "stdio" && !validateKeyValueRows(draft.headerRows)) {
    return "Header rows require keys.";
  }
  return "";
}

function mcpServerConfigFromDraft(
  draft: McpServerDraft,
  existingServers: GatewayMcpServerConfig[],
  editIndex: number | undefined
): GatewayMcpServerConfig {
  const base = {
    name: draft.name.trim() || uniqueMcpServerName(existingServers, editIndex),
    protocolVersion: draft.protocolVersion.trim() || "2024-11-05",
    requestTimeoutMs: clampNumber(numberValue(draft.requestTimeoutMs), 100, 600000),
    startupTimeoutMs: mcpServerStartupTimeoutMs
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

function normalizeMcpServers(value: unknown): GatewayMcpServerConfig[] {
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

function createMcpServerDraftFromUnknown(value: Record<string, unknown>): McpServerDraft {
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

function mcpServerEndpointSummary(server: GatewayMcpServerConfig): string {
  if (server.transport !== "stdio") {
    return server.url;
  }
  return [server.command, ...server.args].join(" ");
}

function parseMcpServerTransportValue(value: unknown): GatewayMcpServerTransport {
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

function createKeyValueDraftRow(key = "", value = ""): KeyValueDraftRow {
  return {
    id: `key-value-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    value
  };
}

function keyValueRowsFromRecord(value: Record<string, string>): KeyValueDraftRow[] {
  return Object.entries(value).map(([key, itemValue]) => createKeyValueDraftRow(key, itemValue));
}

function validateKeyValueRows(rows: KeyValueDraftRow[]): boolean {
  return rows.every((row) => !row.value.trim() || Boolean(row.key.trim()));
}

function validateProfileEnvRows(rows: KeyValueDraftRow[]): boolean {
  return rows.every((row) => {
    const key = row.key.trim();
    return (!row.value.trim() || Boolean(key)) && (!key || isProfileEnvName(key));
  });
}

function isProfileEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function recordFromKeyValueRows(rows: KeyValueDraftRow[]): Record<string, string> {
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

function uniqueMcpServerName(servers: GatewayMcpServerConfig[], editIndex?: number): string {
  const existing = new Set(servers.filter((_, index) => index !== editIndex).map((server) => server.name));
  for (let index = servers.length + 1; index < 1000; index += 1) {
    const candidate = `mcp-${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `mcp-${Date.now()}`;
}

function parseKeyValueText(value: string): { ok: true; value: Record<string, string> } | { ok: false } {
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

function formatKeyValueText(value: Record<string, string>): string {
  return Object.entries(value).map(([key, itemValue]) => `${key}=${itemValue}`).join("\n");
}

function stringRecordValue(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, itemValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    if (normalizedKey && typeof itemValue === "string") {
      result[normalizedKey] = itemValue;
    }
  }
  return result;
}

function buildRoutingRuleRows(config: AppConfig): RoutingRuleRow[] {
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

function buildPluginRoutingRows(plugin: AppConfig["plugins"][number], pluginIndex: number): RoutingRuleRow[] {
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

function buildPluginRoutingConfigItems(config: AppConfig): PluginRoutingConfigItem[] {
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

function formatClaudeDesignRoutingRuleCondition(rule: ClaudeDesignRoutingRuleDraft): string {
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

function parseClaudeDesignRouteRuleType(value: unknown): ClaudeDesignRouteRuleType | undefined {
  const normalized = stringValue(value);
  return normalized && isClaudeDesignRouteRuleType(normalized) ? normalized : undefined;
}

function isClaudeDesignRouteRuleType(value: string): value is ClaudeDesignRouteRuleType {
  return claudeDesignRouteRuleTypeOptions.some((option) => option.value === value);
}

function isClaudeDesignStaticRuleType(type: ClaudeDesignRouteRuleType): boolean {
  return type === "always" || type === "image" || type === "thinking" || type === "web-search";
}

function claudeDesignRouteRuleTypeLabel(type: ClaudeDesignRouteRuleType): string {
  return claudeDesignRouteRuleTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function composeRouteTargetValue(providerValue: unknown, modelValue: unknown): string | undefined {
  const provider = stringValue(providerValue);
  const model = stringValue(modelValue);
  if (provider && model) {
    return `${provider},${model}`;
  }
  return model || provider;
}

function uniqueClaudeDesignRoutingRuleId(rules: ClaudeDesignRoutingRuleDraft[]): string {
  let index = rules.length + 1;
  let id = `claude-design-route-${index}`;
  while (rules.some((rule) => rule.id === id)) {
    index += 1;
    id = `claude-design-route-${index}`;
  }
  return id;
}

function createPluginSettingsDraft(plugin?: AppConfig["plugins"][number]): PluginSettingsDraft {
  return {
    appsText: formatEditableJson(plugin?.apps ?? []),
    configText: formatEditableJson(pluginSettingsConfigWithoutRouting(plugin?.config)),
    enabled: plugin?.enabled !== false,
    modulePath: plugin?.module ?? ""
  };
}

function pluginSettingsConfigWithoutRouting(config: unknown): Record<string, unknown> {
  if (!isPlainRecord(config)) {
    return {};
  }
  const { routing: _routing, ...rest } = config;
  return rest;
}

function parsePluginAppsSettingsText(value: string): { ok: true; value?: GatewayPluginAppConfig[] } | { ok: false; message: string } {
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

function parsePluginConfigSettingsText(value: string): { ok: true; value?: Record<string, unknown> } | { ok: false; message: string } {
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

function pluginSettingsConfigFromDraft(previousConfig: unknown, nonRoutingConfig: Record<string, unknown> | undefined): unknown {
  const output: Record<string, unknown> = nonRoutingConfig ? { ...nonRoutingConfig } : {};
  if (isPlainRecord(previousConfig) && Object.prototype.hasOwnProperty.call(previousConfig, "routing")) {
    output.routing = previousConfig.routing;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function formatEditableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function sanitizeConfigId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildExtensionList(config: AppConfig): ExtensionListItem[] {
  return [
    ...(config.plugins ?? []).map((item, index) => extensionListItem("plugins", item, index)),
    ...(config.providerPlugins ?? []).map((item, index) => extensionListItem("providerPlugins", item, index)),
    ...(config.virtualModelProfiles ?? []).map((item, index) => extensionListItem("virtualModelProfiles", item, index))
  ];
}

function resolvePluginInstallPlan(
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

function pluginDependencyCandidate(
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

function formatPluginDependencies(dependencies: PluginDependency[]): string {
  return dependencies.map((dependency) => dependency.name || dependency.id).join(", ");
}

function extensionListItem(source: ExtensionSource, item: unknown, index: number): ExtensionListItem {
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

  if (source === "providerPlugins") {
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

  const enabled = item.enabled !== false;
  return {
    canConfigure: false,
    canToggle: true,
    capability: virtualModelCapability(item),
    enabled,
    index,
    name: stringValue(item.displayName) || stringValue(item.key) || stringValue(item.id) || `virtual-model-${index + 1}`,
    source,
    status: enabled ? "enabled" : "disabled",
    target: virtualModelTarget(item)
  };
}

function extensionMatchesQuery(extension: ExtensionListItem, query: string): boolean {
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

function wrapperPluginCapability(item: Record<string, unknown>): string {
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
  if (virtualModels > 0) capabilities.push(`${virtualModels} virtual ${virtualModels === 1 ? "model" : "models"}`);

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

function wrapperPluginTarget(item: Record<string, unknown>): string {
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

function providerPluginCapability(item: Record<string, unknown>): string {
  const capabilities: string[] = ["Provider middleware"];
  if (item.deepseekThinking || item.deepSeekThinking) capabilities.push("DeepSeek thinking");
  if (item.codexOauth) capabilities.push("Codex OAuth");
  if (item.auth) capabilities.push("Auth mutation");
  if (item.request) capabilities.push("Request mutation");
  if (item.response) capabilities.push("Response mutation");
  return capabilities.join(", ");
}

function virtualModelCapability(item: Record<string, unknown>): string {
  const tools = Array.isArray(item.tools) ? item.tools.length : 0;
  const execution = isPlainRecord(item.execution) ? stringValue(item.execution.mode) : undefined;
  return ["Virtual model", execution || "decorate_only", `${tools} tools`].join(", ");
}

function virtualModelTarget(item: Record<string, unknown>): string {
  const match = isPlainRecord(item.match) ? item.match : {};
  const exactAliases = stringListValue(match.exactAliases);
  const prefixes = stringListValue(match.prefixes);
  const suffixes = stringListValue(match.suffixes);
  const parts = [
    ...exactAliases.map((value) => `=${value}`),
    ...prefixes.map((value) => `${value}*`),
    ...suffixes.map((value) => `*${value}`)
  ];
  return parts.length ? parts.join(", ") : "No match";
}

function createExtensionInstallDraft(): ExtensionInstallDraft {
  return {
    dependencies: [],
    key: "",
    marketplaceId: "",
    modulePath: "",
    selectedName: ""
  };
}

function providerSelectOptions(providers: GatewayProviderConfig[], value: string): Array<{ label: string; value: string }> {
  const options = [{ label: "Select provider", value: "" }, ...providers.map((provider) => ({ label: provider.name, value: provider.name }))];
  if (value && !options.some((option) => option.value === value)) {
    return [{ label: value, value }, ...options];
  }
  return options;
}

function uniqueExtensionKey(items: unknown[], preferredKey: string): string {
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

function extensionKeyValue(item: unknown): string | undefined {
  return isPlainRecord(item) ? stringValue(item.key) || stringValue(item.id) : undefined;
}

function slugValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stringListValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item)) : [];
}

function createModelCatalogItems(config: AppConfig): ModelCatalogItem[] {
  const providerModels = config.Providers.flatMap((provider) => mergeProviderModelLists(provider.models));
  const virtualModels = (config.virtualModelProfiles ?? [])
    .filter(virtualModelIsCatalogVisible)
    .flatMap(virtualModelCatalogNames);

  return uniqueStrings([...providerModels, ...virtualModels]).map((model, index) => ({
    key: `model:${index}:${model}`,
    model
  }));
}

function virtualModelIsCatalogVisible(profile: VirtualModelProfileConfig): boolean {
  return profile.enabled !== false &&
    profile.materialization?.enabled !== false &&
    profile.materialization?.includeInGatewayModels !== false;
}

function virtualModelCatalogNames(profile: VirtualModelProfileConfig): string[] {
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

function modelCatalogItemMatchesQuery(row: ModelCatalogItem, query: string): boolean {
  if (!query) {
    return true;
  }

  return row.model.toLowerCase().includes(query);
}

function createRouteModelOptions(providers: GatewayProviderConfig[]): Array<{ label: string; value: string }> {
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

function routeTargetOptions(modelOptions: Array<{ label: string; value: string }>, value: string): Array<{ label: string; value: string }> {
  const options = [{ label: "Unset", value: "" }, ...modelOptions];
  if (value && !options.some((option) => option.value === value)) {
    return [{ label: value, value }, ...options];
  }
  return options;
}

function routerRuleTypeLabel(type: RouterRuleType): string {
  return routerRuleTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function formatRouterRuleCondition(rule: RouterRule): string {
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

function formatRouterRuleTarget(rule: RouterRule): string {
  const target = rule.type === "subagent" ? "Embedded request model" : rule.target || "Unset";
  return rule.fallback ? `${target} · ${formatRouterFallbackSummary(rule.fallback)}` : target;
}

function formatRouterFallbackSummary(fallback: RouterFallbackConfig): string {
  if (fallback.mode === "off") {
    return "fallback off";
  }
  if (fallback.mode === "retry") {
    return `retry ${fallback.retryCount}x`;
  }
  return fallback.models.length ? `fallback ${fallback.models.join(" > ")}` : "fallback chain unset";
}

function routerRuleMatchesQuery(rule: RouterRule, query: string): boolean {
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

function routingRuleRowMatchesQuery(row: RoutingRuleRow, query: string): boolean {
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

function createRoutingRuleDraft(config?: AppConfig): AddRoutingRuleDraft {
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

function createRoutingRuleDraftFromRule(rule: RouterRule, config?: AppConfig): AddRoutingRuleDraft {
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

function uniqueRoutingRuleId(rules: RouterRule[]): string {
  let index = rules.length + 1;
  let id = `rule-${index}`;
  while (rules.some((rule) => rule.id === id)) {
    index += 1;
    id = `rule-${index}`;
  }
  return id;
}

async function probeProviderDeepLinkPayload(payload: ProviderDeepLinkPayload): Promise<GatewayProviderProbeResult | undefined> {
  if (!window.ccr || !shouldAutoProbeProviderBaseUrl(payload.baseUrl)) {
    return undefined;
  }

  try {
    return await window.ccr.probeProvider({
      apiKey: payload.apiKey,
      baseUrl: payload.baseUrl,
      models: payload.models,
      protocols: payload.protocol ? [payload.protocol] : providerProtocolOptions.map((option) => option.value)
    });
  } catch {
    return undefined;
  }
}

function createProviderConfigFromDeepLink(
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
  const capabilities = mergeProviderCapabilities(
    probe?.capabilities ?? [],
    protocol && baseUrl ? [{ baseUrl, source: probe?.detectedProtocol ? "detected" : "preset", type: protocol }] : []
  );

  return {
    api_base_url: normalizeProviderBaseUrl(baseUrl, protocol),
    api_key: payload.apiKey?.trim() ?? "",
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    models,
    name,
    type: protocol
  };
}

function findProviderDeepLinkReplacementIndex(
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

function inferProviderNameFromBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(providerUrlWithDefaultScheme(baseUrl));
    const host = url.hostname.replace(/^api\./i, "");
    return host || "provider";
  } catch {
    return "provider";
  }
}

function createProviderDraft(providers: GatewayProviderConfig[]): AddProviderDraft {
  return {
    accountConnectorsText: "[]",
    accountEnabled: false,
    accountRefreshIntervalMs: "",
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

function createProviderDraftFromProvider(provider: GatewayProviderConfig): AddProviderDraft {
  const baseUrl = providerBaseUrl(provider);
  const preset = findProviderPresetByBaseUrl(baseUrl);
  return {
    accountConnectorsText: JSON.stringify(provider.account?.connectors ?? [], null, 2),
    accountEnabled: provider.account?.enabled === true,
    accountRefreshIntervalMs: provider.account?.refreshIntervalMs ? String(provider.account.refreshIntervalMs) : "",
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

function parseProviderAccountDraft(draft: AddProviderDraft): GatewayProviderConfig["account"] | string | undefined {
  const refreshIntervalMs = positiveInteger(draft.accountRefreshIntervalMs);
  if (!draft.accountEnabled) {
    return undefined;
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

function providerAccountConnectorExample(): string {
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

function toProviderProtocol(value: string | undefined): GatewayProviderProtocol | undefined {
  return providerProtocolOptions.some((option) => option.value === value) ? value as GatewayProviderProtocol : undefined;
}

function shouldAutoProbeProviderBaseUrl(value: string): boolean {
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

function providerProbeCandidates(draft: AddProviderDraft): ProviderProbeCandidate[] {
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

function isProviderProbeCandidateReady(candidate: ProviderProbeCandidate): boolean {
  return shouldAutoProbeProviderBaseUrl(candidate.baseUrl);
}

function providerProbeInputKey(candidates: ProviderProbeCandidate[], apiKey: string, models: string[]): string {
  return JSON.stringify([
    candidates.map((candidate) => [candidate.baseUrl, candidate.protocols]),
    apiKey,
    models
  ]);
}

async function probeProviderCandidates(
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

function providerProbeResultIsUsable(probe: GatewayProviderProbeResult): boolean {
  return Boolean(probe.detectedProtocol || probe.models.length > 0 || probe.protocols.some((item) => item.supported));
}

function providerProbeHasSupportedProtocol(probe: GatewayProviderProbeResult | undefined, protocol?: GatewayProviderProtocol): boolean {
  return Boolean(probe?.protocols.some((item) => item.supported && (!protocol || item.protocol === protocol)));
}

function firstProviderConnectivityModel(draft: AddProviderDraft): string {
  return mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText))[0] ?? "";
}

function mergeProviderProbeCandidateResults(results: ProviderProbeCandidateResult[]): ProviderProbeCandidateResult | undefined {
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

function providerProbeCapabilities(candidate: ProviderProbeCandidate, probe: GatewayProviderProbeResult): GatewayProviderCapability[] {
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

function presetCapabilitiesFromDraft(draft: AddProviderDraft): GatewayProviderCapability[] {
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

function mergeProviderCapabilities(...groups: GatewayProviderCapability[][]): GatewayProviderCapability[] {
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

function applyProviderProbeResult(draft: AddProviderDraft, probe: GatewayProviderProbeResult): AddProviderDraft {
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

function pickRecommendedProviderModels(models: string[], protocol?: GatewayProviderProtocol): string[] {
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

function recommendedModelRank(model: string, protocol?: GatewayProviderProtocol): number {
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

function mergeProviderModelLists(...groups: string[][]): string[] {
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

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitModelTagInput(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function providerBaseUrl(provider: GatewayProviderConfig): string {
  return provider.api_base_url || provider.baseurl || provider.baseUrl || "";
}

function providerApiKey(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || "";
}

function providerCapabilitiesSummary(provider: GatewayProviderConfig, translate: (value: string) => string = (value) => value): string {
  const capabilities = provider.capabilities ?? [];
  if (capabilities.length === 0) {
    return translatedProviderProtocolLabel(toProviderProtocol(provider.type) ?? toProviderProtocol(provider.provider) ?? "openai_chat_completions", translate);
  }
  return capabilities.map((capability) => translatedProviderProtocolLabel(capability.type, translate)).join(", ");
}

function providerListItemKey(provider: GatewayProviderConfig, index: number): string {
  return `${index}:${provider.name || "provider"}`;
}

function providerMatchesQuery(provider: GatewayProviderConfig, query: string): boolean {
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

function viewUsesInternalScroll(view: ViewId): boolean {
  return view === "observability" || view === "api-keys" || view === "networking" || view === "logs" || view === "providers" || view === "models" || view === "routing" || view === "virtual-models" || view === "extensions";
}

function uniqueProviderName(providers: GatewayProviderConfig[], baseName = "provider"): string {
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

function isProviderNameDuplicate(providers: GatewayProviderConfig[], name: string, ignoreIndex?: number): boolean {
  return providers.some((provider, index) => index !== ignoreIndex && providerNameEquals(provider.name, name));
}

function providerNameEquals(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function providerProtocolLabel(protocol: GatewayProviderProtocol | string): string {
  return providerProtocolOptions.find((option) => option.value === protocol)?.label ?? String(protocol);
}

function translatedProviderProtocolLabel(protocol: GatewayProviderProtocol | string, translate: (value: string) => string): string {
  return translate(providerProtocolLabel(protocol));
}

function translateProbeProtocolMessage(message: string | undefined, translate: (value: string) => string): string {
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

export default App;
