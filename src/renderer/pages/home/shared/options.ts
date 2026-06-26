import {
  Activity,
  Box,
  Boxes,
  Braces,
  Database,
  Gauge,
  KeyRound,
  Layers3,
  Network,
  Route,
  Server,
  UserRound,
  type LucideIcon
} from "lucide-react";
import {
  BUILTIN_FUSION_TOOL_SERVER_NAME,
  BUILTIN_FUSION_VISION_TOOL_NAME,
  BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME,
  OVERVIEW_WIDGET_SIZE_VALUES
} from "../../../../shared/app";
import type {
  AgentKind,
  AppConfig,
  GatewayMcpServerTransport,
  GatewayMcpStdioMessageMode,
  GatewayProviderProtocol,
  OverviewMetricKind,
  OverviewWidgetSize,
  ProfileConfig,
  ProfileScope,
  ProfileSurface,
  RequestLogStatusFilter,
  RouterFallbackMode,
  RouterRuleOperator,
  RouterRuleRewriteOperation,
  RouterRuleType,
  UsageStatsRange,
  VirtualModelBaseModelMode,
  VirtualModelExecutionMode,
  VirtualModelFusionWebSearchProvider,
  VirtualModelToolVisibility
} from "../../../../shared/app";
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
import trayCyanIconUrl from "../../../../../assets/tray-cyan.png";
import trayOrangeIconUrl from "../../../../../assets/tray-orange.png";
import trayVioletIconUrl from "../../../../../assets/tray-violet.png";

type ViewId = "onboarding" | "overview" | "observability" | "api-keys" | "server" | "profile" | "networking" | "logs" | "providers" | "models" | "routing" | "virtual-models" | "extensions";
type NavigationId = ViewId;
type OnboardingStepId = "provider" | "profile" | "enter";
type ProviderAccountDraftMode = "standard" | "http-json" | "raw";
type ApiKeyLimitMetric = "images" | "requests" | "tokens";
type ApiKeyExpirationPreset = "7d" | "30d" | "90d" | "custom" | "never";
type LimitWindowPreset = "day" | "hour" | "minute";
type ClaudeDesignRouteRuleType = "always" | "image" | "long-context" | "model" | "model-prefix" | "thinking" | "web-search";
type VirtualModelClientToolsPolicy = "allow" | "deny";
type VirtualModelMatchMode = "alias" | "prefix" | "suffix";
export type AgentFilterValue = AgentKind | "all";

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

export const agentAnalysisRangeOptions: Array<{ label: string; value: UsageStatsRange }> = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" }
];

export const agentFilterOptions: Array<{ label: string; value: AgentFilterValue }> = [
  { label: "All agents", value: "all" },
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "ZCode", value: "zcode" },
  { label: "Claude Design", value: "claude-design" },
  { label: "Unknown", value: "unknown" }
];

export const profileAgentOptions: Array<{ label: string; value: ProfileConfig["agent"] }> = [
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "ZCode", value: "zcode" }
];

export const profileScopeOptions: Array<{ label: string; value: ProfileScope }> = [
  { label: "Only opened from CCR", value: "ccr" },
  { label: "System default", value: "global" }
];

export const profileSurfaceOptions: Array<{ label: string; value: ProfileSurface }> = [
  { label: "CLI & APP", value: "auto" },
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
  { label: "Condition", value: "condition" }
];

export type RouterConditionSource = "request.header" | "request.body";

export const routerConditionSourceOptions: Array<{ label: string; value: RouterConditionSource }> = [
  { label: "request.header", value: "request.header" },
  { label: "request.body", value: "request.body" }
];

export const routerRuleOperatorOptions: Array<{ label: string; value: RouterRuleOperator }> = [
  { label: "==", value: "==" },
  { label: "!=", value: "!=" },
  { label: ">=", value: ">=" },
  { label: ">", value: ">" },
  { label: "<=", value: "<=" },
  { label: "<", value: "<" },
  { label: "starts with", value: "starts-with" },
  { label: "contains", value: "contains" },
  { label: "contains deep", value: "contains-deep" },
  { label: "not contains", value: "not-contains" }
];

export const routerRewriteOperationOptions: Array<{ label: string; value: RouterRuleRewriteOperation }> = [
  { label: "Set", value: "set" },
  { label: "Delete", value: "delete" },
  { label: "Append to array", value: "array-append" },
  { label: "Prepend to array", value: "array-prepend" },
  { label: "Remove from array", value: "array-remove" },
  { label: "Replace in array", value: "array-replace" }
];

export const legacyRouterRuleTypes: RouterRuleType[] = [
  "image",
  "long-context",
  "model-prefix",
  "subagent",
  "thinking",
  "web-search"
];

export const routerFallbackModeOptions: Array<{ label: string; value: RouterFallbackMode }> = [
  { label: "Off", value: "off" },
  { label: "Retry", value: "retry" },
  { label: "Fallback targets", value: "model-chain" }
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

export const legacyUnimcpPackageName = "@musistudio/unimcp";
export const legacyUnimcpServerName = "unimcp";
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
  { icon: Boxes, id: "virtual-models" },
  { icon: KeyRound, id: "api-keys" },
  { icon: Box, id: "models" },
  { icon: Activity, id: "observability" },
  { icon: Database, id: "logs" },
  { icon: Server, id: "server" },
  { icon: Network, id: "networking" },
  { icon: Braces, id: "extensions" }
];

export const onboardingStepOrder: OnboardingStepId[] = ["provider", "profile", "enter"];

export type OnboardingReadinessOptions = {
  profileConfirmed?: boolean;
  requireProfileConfirmation?: boolean;
};

export function isOnboardingProviderReady(config: AppConfig): boolean {
  return config.Providers.length > 0;
}

export function isOnboardingProfileReady(config: AppConfig, options: OnboardingReadinessOptions = {}): boolean {
  const profileConfigured = config.profile.profiles.some((profile) => profile.enabled);
  return profileConfigured && (!options.requireProfileConfirmation || Boolean(options.profileConfirmed));
}

export function getDefaultOnboardingStep(config: AppConfig, options: OnboardingReadinessOptions = {}): OnboardingStepId {
  if (!isOnboardingProviderReady(config)) {
    return "provider";
  }
  if (!isOnboardingProfileReady(config, options)) {
    return "profile";
  }
  return "enter";
}

export function getNextOnboardingStep(activeStep: OnboardingStepId, config: AppConfig, options: OnboardingReadinessOptions = {}): OnboardingStepId | undefined {
  const activeIndex = onboardingStepOrder.indexOf(activeStep);
  for (const step of onboardingStepOrder.slice(activeIndex + 1)) {
    if (step === "enter" || step === getDefaultOnboardingStep(config, options)) {
      return step;
    }
  }
  return undefined;
}
