import { type TFunction } from "@/lib/i18n";
import {
  Bot,
  CheckCircle2,
  FileText,
  LayoutGrid,
  PackageOpen,
  Palette,
  PanelRight,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Workflow,
  type LucideIcon
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { getBuiltinAgentProviderLogoDataUrl } from "../../../../shared/agent-logos";
import type { AgentConsolePluginCommand, AgentConsolePluginState, AgentMcpServerMap } from "../../../../shared/plugin-types";
import { getSidebarProjectLabel, type SidebarProject } from "../../../../shared/sidebar-data";
import { toolHubBuiltinMcpServerIds, type ToolHubBuiltinMcpServerSettings, type ToolHubLlmSettings, type ToolHubSettings, type ToolHubUserMcpServerConfig } from "../../../../shared/toolhub-types";
import type { RightSidebarPluginId } from "../right-sidebar-plugins";

export type ResizeSide = "left" | "right";
export type ChatMessageRole = "assistant" | "user";
export type ChatAgentProviderId = string;
export type ChatAgentEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ChatAgentSpeed = "default" | "fast";
export type ChatAgentConnectionMode = "local" | "remote" | "ssh";
export type ChatAgentApprovalDecision = "allow" | "allow-session" | "deny" | "cancel";
export type ChatAgentApprovalMode = "request" | "auto" | "full";
export type ChatAttachmentKind = "directory" | "file" | "other";
export type ChatToolEventPhase = "started" | "updated" | "delta" | "completed";
export type ChatMessagePartType = "artifact" | "citation" | "diff" | "plan" | "raw" | "reasoning" | "resource" | "status" | "text" | "tool";
export type AppPage = "automations" | "bot" | "chat" | "settings";
export type AppWindowMode = "main" | "small-chat";
export type SmallWindowOpeningPhase = "compact" | "done" | "full";
export type SmallWindowOpeningGeometry = {
  fromHeight: number;
  fromWidth: number;
  toHeight: number;
  toWidth: number;
};
export type SettingsSectionId = "general" | "agents" | "permissions" | "integrations" | "toolhub" | "appearance";
export type ThemePreference = "system" | "light" | "dark";
export type AgentConsoleBridge = NonNullable<Window["agentConsole"]>;
export type BotGatewayStatus = Awaited<ReturnType<AgentConsoleBridge["bot"]["getStatus"]>>;
export type BotGatewayChannelManifest = Awaited<ReturnType<AgentConsoleBridge["bot"]["listChannels"]>>["channels"][number];
export type BotGatewayIntegration = Awaited<ReturnType<AgentConsoleBridge["bot"]["listIntegrations"]>>["integrations"][number];

export type BotGatewayFieldDefinition = {
  defaultValue?: boolean | string;
  key: string;
  label?: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
  target: "config" | "credentials";
  type?: "boolean" | "number" | "password" | "select" | "text";
};

export type BotGatewayIntegrationDraft = {
  authType: string;
  fieldValues: Record<string, boolean | string>;
  id: string;
  platform: string;
  status: "active" | "disabled" | "paused";
  tenantId: string;
};

export type BotGatewayQrDisplay = {
  kind: "empty" | "frame" | "image";
  src: string;
};

export type BotGatewayQrLoginState = {
  error?: string;
  expiresAt?: string;
  message?: string;
  qrDisplay: BotGatewayQrDisplay;
  sessionId?: string;
  status: "already_bound" | "confirmed" | "expired" | "failed" | "idle" | "needs_verification" | "pending" | "scanned" | "starting";
};

export type RightSidebarTab = {
  id: string;
  pluginId: RightSidebarPluginId;
};

export type RightSidebarState = {
  activeTabId: string;
  tabs: RightSidebarTab[];
};

export type SlashCommandAction =
  | {
      text: string;
      type: "insert";
    }
  | {
      panelId: RightSidebarPluginId;
      type: "open-panel";
    }
  | {
      type: "unavailable";
    };

export type SlashCommand = {
  action: SlashCommandAction;
  category: string;
  description?: string;
  disabled?: boolean;
  icon: LucideIcon;
  id: string;
  logoDataUrl?: string;
  name: string;
  source: "builtin" | "plugin" | "provider";
  title: string;
};

export const defaultRightSidebarTabId = "right-panel-tab-files-0";
export const smallWindowOpeningTransitionDurationMs = 560;
export const botGatewayManagedTenantId = "agent-console";
export const botGatewayPlatformOrder = ["feishu", "dingtalk", "slack", "telegram", "discord", "line", "wecom", "imessage", "weixin-ilink"];
export const botGatewayPlatformNames: Record<string, string> = {
  dingtalk: "DingTalk",
  discord: "Discord",
  feishu: "Feishu",
  imessage: "iMessage",
  line: "LINE",
  slack: "Slack",
  telegram: "Telegram",
  wecom: "WeCom",
  weixin: "Weixin",
  "weixin-ilink": "Weixin iLink"
};
export const botGatewayDefaultAuthType: Record<string, string> = {
  dingtalk: "app_secret",
  discord: "bot_token",
  feishu: "app_secret",
  imessage: "app_secret",
  line: "bot_token",
  slack: "bot_token",
  telegram: "bot_token",
  wecom: "app_secret",
  "weixin-ilink": "qr_login"
};
export const botGatewayDefaultTransport: Record<string, string> = {
  discord: "websocket",
  feishu: "websocket",
  slack: "socket",
  telegram: "long_polling",
  "weixin-ilink": "long_polling"
};
export const botGatewayStartablePlatforms = new Set(["discord", "feishu", "slack", "telegram", "weixin-ilink"]);
export const botGatewayQrWebviewZoomFactor = 0.86;

export type ChatMessage = {
  content: string;
  createdAt?: number;
  id: string;
  parts?: ChatMessagePart[];
  role: ChatMessageRole;
  streaming?: boolean;
  toolEvents?: ChatToolEvent[];
};

export type ChatMessagePart =
  | {
      content: string;
      format?: "markdown" | "plain";
      id: string;
      metadata?: Record<string, unknown>;
      title?: string;
      type: "text";
    }
  | {
      content?: string;
      id: string;
      metadata?: Record<string, unknown>;
      title?: string;
      type: "reasoning";
    }
  | {
      content?: string;
      id: string;
      items?: string[];
      metadata?: Record<string, unknown>;
      title?: string;
      type: "plan";
    }
  | {
      content?: string;
      id: string;
      metadata?: Record<string, unknown>;
      status?: string;
      title?: string;
      type: "status";
    }
  | {
      content?: string;
      id: string;
      metadata?: Record<string, unknown>;
      mimeType?: string;
      name?: string;
      path?: string;
      title?: string;
      type: "resource";
      uri?: string;
    }
  | {
      artifactId?: string;
      content?: string;
      id: string;
      metadata?: Record<string, unknown>;
      mimeType?: string;
      path?: string;
      title?: string;
      type: "artifact";
      uri?: string;
    }
  | {
      content: string;
      id: string;
      language?: string;
      metadata?: Record<string, unknown>;
      oldPath?: string;
      path?: string;
      title?: string;
      type: "diff";
    }
  | {
      content?: string;
      id: string;
      metadata?: Record<string, unknown>;
      title?: string;
      type: "citation";
      uri?: string;
    }
  | {
      id: string;
      label?: string;
      metadata?: Record<string, unknown>;
      type: "raw";
      value: unknown;
    }
  | {
      id: string;
      toolEvent: ChatToolEvent;
      type: "tool";
    };

export type ChatToolEvent = {
  children?: ChatToolEvent[];
  error?: string;
  id: string;
  input?: unknown;
  kind: string;
  metadata?: Record<string, unknown>;
  name: string;
  output?: string;
  parentId?: string;
  phase: ChatToolEventPhase;
  status?: string;
};

export type ChatAttachment = {
  kind: ChatAttachmentKind;
  name: string;
  path: string;
};

export type ProjectBranchOption = {
  current: boolean;
  name: string;
  type: "local" | "remote";
};

export type ProjectBranchState = {
  branches: ProjectBranchOption[];
  currentBranch: string;
  detached: boolean;
  isGitRepository: boolean;
  loading: boolean;
  selectedBranch: string;
};

export type AgentModelOption = {
  contextWindowTokens?: number;
  defaultReasoningEffort?: string;
  id: string;
  isDefault?: boolean;
  label: string;
  supportedReasoningEfforts?: string[];
  supportedSpeeds?: ChatAgentSpeed[];
  value: string;
};

export type AgentProviderOption = {
  capabilities?: AgentProviderCapabilities;
  description: string;
  enabled: boolean;
  id: ChatAgentProviderId;
  kind: "app-server" | "asp" | "cli" | "remote" | "sdk";
  label: string;
  logoDataUrl?: string;
  models: AgentModelOption[];
};

export type AgentProviderCapabilities = {
  approvalModes?: ChatAgentApprovalMode[];
  approvalScopes?: string[];
  artifacts?: boolean;
  concurrentRuns?: boolean;
  contentParts?: ChatMessagePartType[];
  contextWindow?: boolean;
  diffs?: boolean;
  humanInput?: boolean;
  models?: boolean;
  protocolVersions?: string[];
  reasoningEfforts?: ChatAgentEffort[];
  resumeSession?: boolean;
  sessionHistory?: boolean;
  sessions?: boolean;
  slashCommands?: AgentProviderSlashCommand[];
  speeds?: ChatAgentSpeed[];
  toolEvents?: boolean;
  transports?: string[];
};

export type AgentProviderSlashCommand = {
  category?: string;
  command?: string;
  description?: string;
  id?: string;
  insertText?: string;
  name: string;
  title?: string;
};

export type RawAgentProviderInfo = {
  capabilities?: unknown;
  description?: unknown;
  enabled?: unknown;
  id?: unknown;
  kind?: unknown;
  label?: unknown;
  logoDataUrl?: unknown;
  models?: unknown;
};

export type ActiveStream = {
  id: string;
  running: boolean;
  streamKey: number;
};

export type AgentApprovalPrompt = {
  approvalId: string;
  approvalOptions?: ChatAgentApprovalDecision[];
  approvalScope?: string;
  method?: string;
  params?: unknown;
  providerId: ChatAgentProviderId;
  runId: string;
  threadId: string;
  title?: string;
};

export type AgentQuestionOption = {
  description?: string;
  label: string;
  preview?: string;
};

export type AgentQuestionControl = "dropdown" | "multi_select" | "single_select" | "text";

export type AgentQuestion = {
  allowCustomAnswer?: boolean;
  control?: AgentQuestionControl;
  header?: string;
  id?: string;
  multiSelect?: boolean;
  options?: AgentQuestionOption[];
  placeholder?: string;
  preview?: string;
  question: string;
};

export type AgentQuestionAnswer = {
  answer: string | string[];
  customAnswer?: string;
  header?: string;
  question: string;
  questionId?: string;
  selectedOptions?: AgentQuestionOption[];
};

export type AgentQuestionPrompt = {
  method?: string;
  params?: unknown;
  providerId: ChatAgentProviderId;
  questionId: string;
  questions: AgentQuestion[];
  runId: string;
  threadId: string;
  title?: string;
};

export type AgentQuestionResponse = {
  answers?: AgentQuestionAnswer[];
  canceled?: boolean;
  result?: unknown;
  unanswered?: boolean;
};

export type ChatAgentRunEvent = {
  approvalId?: string;
  approvalOptions?: ChatAgentApprovalDecision[];
  approvalScope?: string;
  data?: string;
  message?: string;
  model?: string;
  method?: string;
  params?: unknown;
  part?: ChatMessagePart;
  providerId: ChatAgentProviderId;
  providerSessionId?: string;
  questionId?: string;
  questions?: AgentQuestion[];
  runId: string;
  threadId: string;
  title?: string;
  toolEvent?: ChatToolEvent;
  type: "run_started" | "message_part" | "message_delta" | "tool_event" | "approval_request" | "question_request" | "stdout" | "stderr" | "usage" | "run_finished" | "error";
  usage?: UsageTokenMetrics;
};

export type UsageTokenMetrics = {
  contextTokens?: number;
  contextWindowTokens?: number;
  inputCachedTokens: number;
  inputTokens: number;
  outputCachedTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AgentContextWindowInfo = NonNullable<Parameters<AgentConsoleBridge["agent"]["sendMessage"]>[0]["contextWindow"]>;

export type ContextWindowMetrics = {
  estimatedTokens: number | null;
  limitTokens: number | null;
  modelLabel: string;
  remainingTokens: number | null;
  source: "actual" | "unknown";
  usage: UsageTokenMetrics | null;
  usedTokens: number | null;
};

export type DictationStatus = "idle" | "recording" | "transcribing";

export type TranscriptionConfig = {
  apiKey: string;
  endpoint: string;
  language: string;
  model: string;
  prompt: string;
};

export type SettingsPreferences = {
  autoSaveDrafts: boolean;
  commandApprovals: boolean;
  compactDensity: boolean;
  confirmDangerousActions: boolean;
  enablePluginMarketplace: boolean;
  homeThemeConfig: string;
  networkAccess: boolean;
  reduceMotion: boolean;
  restoreLastThread: boolean;
  syncIntegrations: boolean;
  theme: ThemePreference;
};

export type SettingsPreferenceValue = boolean | string | ThemePreference;

export type AgentEnvironmentSettings = Record<ChatAgentProviderId, Record<string, string>>;

export type AgentEnvironmentRow = {
  id: string;
  name: string;
  value: string;
};

export type ConfiguredAgentModelSettings = {
  contextWindowTokens?: number;
  defaultReasoningEffort?: string | null;
  displayName?: string;
  hidden?: boolean;
  id: string;
  isDefault?: boolean;
  model: string;
  supportedReasoningEfforts?: string[];
  supportedSpeeds?: ChatAgentSpeed[];
};

export type ConfiguredAgentProviderSettings = {
  args: string[];
  command?: string;
  description: string;
  env: Record<string, string>;
  id: string;
  installCommand?: string;
  label: string;
  logoDataUrl?: string;
  models: ConfiguredAgentModelSettings[];
  timeoutMs?: number;
  transport?: ConfiguredAgentProviderTransport;
  url?: string;
};

export type ConfiguredAgentProviderTransport = "stdio" | "persistent-stdio" | "websocket" | "ssh" | "webtransport" | "udp" | "http";

export type AgentProviderSettingsForm = {
  argsText: string;
  command: string;
  description: string;
  id: string;
  installCommand: string;
  label: string;
  logoDataUrl: string;
  modelsText: string;
  originalId?: string;
  timeoutMs: string;
  transport: ConfiguredAgentProviderTransport;
  url: string;
};

export type ConfiguredSubagentSettings = {
  approvalMode?: ChatAgentApprovalMode;
  description?: string;
  effort?: ChatAgentEffort;
  id: string;
  label: string;
  mcpServers: AgentMcpServerMap;
  model?: string;
  providerId: ChatAgentProviderId;
  speed?: ChatAgentSpeed;
  systemPrompt: string;
  timeoutMs?: number;
};

export type SubagentSettingsForm = {
  approvalMode: ChatAgentApprovalMode;
  description: string;
  effort: ChatAgentEffort;
  id: string;
  label: string;
  model: string;
  originalId?: string;
  providerId: ChatAgentProviderId;
  speed: ChatAgentSpeed;
  systemPrompt: string;
  toolsText: string;
};

export type AppSettingsState = {
  agentEnvironments: AgentEnvironmentSettings;
  disabledAgentProviders: ChatAgentProviderId[];
  agentProviders: ConfiguredAgentProviderSettings[];
  defaultSpotlightShortcut: string;
  registeredSpotlightShortcut: string | null;
  spotlightShortcut: string;
  subagents: ConfiguredSubagentSettings[];
  toolHub: ToolHubSettings;
};

export type SmallWindowState = {
  id: number | null;
  isSmallWindow: boolean;
  minHeight: number;
  minWidth: number;
  pinned: boolean;
};

export const leftSidebarBounds = { max: 460, min: 240 };
export const rightSidebarBounds = { max: 960, min: 300 };
export const newSessionThreadId = "new-session";
export const transcriptionConfigStorageKey = "agent-console:transcription-config";
export const settingsPreferencesStorageKey = "agent-console:settings-preferences";
export const maxAgentLogoBytes = 1_000_000;
export const defaultSpotlightShortcut = "CommandOrControl+Space";
export const agentProviderLabels: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex"
};
export const defaultAgentEffortOptions: ChatAgentEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
export const defaultAgentSpeedOptions: ChatAgentSpeed[] = ["default", "fast"];
export const agentApprovalModes: ChatAgentApprovalMode[] = ["request", "auto", "full"];
export const defaultProjectBranchState: ProjectBranchState = {
  branches: [],
  currentBranch: "",
  detached: false,
  isGitRepository: false,
  loading: false,
  selectedBranch: ""
};
export const defaultTranscriptionConfig: TranscriptionConfig = {
  apiKey: "",
  endpoint: "https://api.openai.com/v1",
  language: "",
  model: "gpt-4o-transcribe",
  prompt: ""
};
export const defaultSettingsPreferences: SettingsPreferences = {
  autoSaveDrafts: true,
  commandApprovals: true,
  compactDensity: false,
  confirmDangerousActions: true,
  enablePluginMarketplace: true,
  homeThemeConfig: "",
  networkAccess: false,
  reduceMotion: false,
  restoreLastThread: true,
  syncIntegrations: true,
  theme: "system"
};
export const defaultAppSettingsState: AppSettingsState = {
  agentEnvironments: {},
  disabledAgentProviders: [],
  agentProviders: [],
  defaultSpotlightShortcut,
  registeredSpotlightShortcut: null,
  spotlightShortcut: defaultSpotlightShortcut,
  subagents: [],
  toolHub: {
    builtinMcpServers: {
      automations: false,
      browser: false,
      location: false,
      userInteraction: false
    },
    enabled: false,
    llm: {
      apiKey: "",
      baseUrl: "",
      model: ""
    },
    mcpServers: []
  }
};
export const defaultSmallWindowState: SmallWindowState = {
  id: null,
  isSmallWindow: false,
  minHeight: 460,
  minWidth: 360,
  pinned: false
};
export const defaultPluginState: AgentConsolePluginState = {
  agentSkills: [],
  automationTemplates: [],
  commands: [],
  fileTreeItems: [],
  marketplace: [],
  menus: [],
  mcpServers: [],
  pluginRoot: "",
  plugins: [],
  rightSidebarPanels: [],
  shortcuts: [],
  warnings: []
};
export const popoverSpringTransition = { damping: 34, mass: 0.78, stiffness: 440, type: "spring" } as const;
export const selectionSpringTransition = { damping: 36, mass: 0.72, stiffness: 520, type: "spring" } as const;
export const autoHeightSpringTransition = { damping: 34, mass: 0.86, stiffness: 360, type: "spring" } as const;
export const iconSpringTransition = { damping: 38, mass: 0.55, stiffness: 700, type: "spring" } as const;
export const contextWindowTokenEstimateDivisor = 3.6;

export function getFallbackAgentProviderOptions(): AgentProviderOption[] {
  return Object.entries(agentProviderLabels).map(([id, label]) => ({
    capabilities: {},
    description: "",
    enabled: true,
    id,
    kind: "asp",
    label,
    logoDataUrl: getBuiltinAgentProviderLogoDataUrl(id),
    models: []
  }));
}

export function getAgentProviderFallbackLabel(providerId: ChatAgentProviderId): string {
  return agentProviderLabels[providerId] ?? providerId;
}

export function getSettingsSections(t: TFunction): { icon: LucideIcon; id: SettingsSectionId; label: string }[] {
  return [
    {
      icon: Settings,
      id: "general",
      label: t("settings.section.general.label")
    },
    {
      icon: Palette,
      id: "appearance",
      label: t("settings.section.appearance.label")
    },
    {
      icon: Bot,
      id: "agents",
      label: t("settings.section.agents.label")
    },
    {
      icon: ShieldCheck,
      id: "permissions",
      label: t("settings.section.permissions.label")
    },
    {
      icon: LayoutGrid,
      id: "integrations",
      label: t("settings.section.integrations.label")
    },
    {
      icon: PackageOpen,
      id: "toolhub",
      label: t("settings.section.toolhub.label")
    }
  ];
}
export const waveformBarCount = 72;
export const waveformBarIntervalMs = 140;

export function createMessageId(prefix: ChatMessageRole) {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function normalizeAgentEffort(value: string): ChatAgentEffort {
  return defaultAgentEffortOptions.includes(value as ChatAgentEffort) ? value as ChatAgentEffort : "medium";
}

export function normalizeAgentSpeed(value: string): ChatAgentSpeed {
  return defaultAgentSpeedOptions.includes(value as ChatAgentSpeed) ? value as ChatAgentSpeed : "default";
}

export function normalizeAgentProviderInfo(providers: RawAgentProviderInfo[]): AgentProviderOption[] {
  return providers
    .map((provider): AgentProviderOption | null => {
      const providerId = typeof provider.id === "string" ? provider.id.trim() : "";
      if (!providerId) return null;
      const kind = typeof provider.kind === "string" && isAgentProviderKind(provider.kind) ? provider.kind : "asp";
      return {
        capabilities: normalizeAgentProviderCapabilities(provider.capabilities),
        description: typeof provider.description === "string" ? provider.description.trim() : "",
        enabled: provider.enabled !== false,
        id: providerId,
        kind,
        label: typeof provider.label === "string" && provider.label.trim() ? provider.label.trim() : getAgentProviderFallbackLabel(providerId),
        logoDataUrl: normalizeAgentLogoDataUrl(provider.logoDataUrl) ?? getBuiltinAgentProviderLogoDataUrl(providerId),
        models: normalizeAgentModelOptions(provider.models)
      };
    })
    .filter((provider): provider is AgentProviderOption => Boolean(provider));
}

export function normalizeAgentProviderCapabilities(value: unknown): AgentProviderCapabilities {
  const record = getRecord(value);
  const approvalModes = normalizeStringArray(record.approvalModes)
    .filter((mode): mode is ChatAgentApprovalMode => (
      mode === "request" ||
      mode === "auto" ||
      mode === "full"
    ));
  const hasReasoningEfforts = hasRecordProperty(record, "reasoningEfforts") || hasRecordProperty(record, "reasoning_efforts");
  const reasoningEfforts = normalizeStringArray(record.reasoningEfforts ?? record.reasoning_efforts)
    .filter((effort): effort is ChatAgentEffort => isChatAgentEffort(effort));
  const hasSpeeds = hasRecordProperty(record, "speeds") || hasRecordProperty(record, "speedModes") || hasRecordProperty(record, "speed_modes") || hasRecordProperty(record, "responseSpeeds") || hasRecordProperty(record, "response_speeds");
  const speeds = normalizeSpeedOptions(record.speeds ?? record.speedModes ?? record.speed_modes ?? record.responseSpeeds ?? record.response_speeds);
  const contentParts = normalizeStringArray(record.contentParts)
    .filter((part): part is ChatMessagePartType => (
      part === "text" ||
      part === "tool" ||
      part === "reasoning" ||
      part === "plan" ||
      part === "status" ||
      part === "resource" ||
      part === "artifact" ||
      part === "diff" ||
      part === "citation" ||
      part === "raw"
    ));
  const slashCommands = normalizeAgentProviderSlashCommands(record.slashCommands ?? record.slash_commands ?? record.commands);

  return {
    approvalModes: approvalModes.length ? approvalModes : undefined,
    approvalScopes: normalizeStringArray(record.approvalScopes),
    artifacts: typeof record.artifacts === "boolean" ? record.artifacts : undefined,
    concurrentRuns: typeof record.concurrentRuns === "boolean" ? record.concurrentRuns : undefined,
    contentParts: contentParts.length ? contentParts : undefined,
    contextWindow: typeof record.contextWindow === "boolean" ? record.contextWindow : undefined,
    diffs: typeof record.diffs === "boolean" ? record.diffs : undefined,
    humanInput: typeof record.humanInput === "boolean" ? record.humanInput : undefined,
    models: typeof record.models === "boolean" ? record.models : undefined,
    protocolVersions: normalizeStringArray(record.protocolVersions),
    reasoningEfforts: hasReasoningEfforts ? reasoningEfforts : undefined,
    resumeSession: typeof record.resumeSession === "boolean" ? record.resumeSession : undefined,
    sessionHistory: typeof record.sessionHistory === "boolean" ? record.sessionHistory : undefined,
    sessions: typeof record.sessions === "boolean" ? record.sessions : undefined,
    slashCommands: slashCommands.length ? slashCommands : undefined,
    speeds: hasSpeeds ? speeds : undefined,
    toolEvents: typeof record.toolEvents === "boolean" ? record.toolEvents : undefined,
    transports: normalizeStringArray(record.transports)
  };
}

export function normalizeAgentProviderSlashCommands(value: unknown): AgentProviderSlashCommand[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map(normalizeAgentProviderSlashCommand)
    .filter((command): command is AgentProviderSlashCommand => Boolean(command))
    .filter((command) => {
      const key = command.id || command.command || command.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeAgentProviderSlashCommand(value: unknown): AgentProviderSlashCommand | null {
  if (typeof value === "string") {
    const command = normalizeProviderSlashCommandText(value);
    const name = getProviderSlashCommandName(command);
    return command && name ? { command, name, title: command } : null;
  }

  const record = getRecord(value);
  const command = normalizeProviderSlashCommandText(
    getStringFromRecord(record, "command") ||
    getStringFromRecord(record, "insertText") ||
    getStringFromRecord(record, "insert_text") ||
    getStringFromRecord(record, "text") ||
    getStringFromRecord(record, "name")
  );
  const name = normalizeProviderSlashCommandName(getStringFromRecord(record, "name") || getProviderSlashCommandName(command));
  if (!name) return null;

  const insertText = normalizeProviderSlashCommandInsertText(
    getStringFromRecord(record, "insertText") ||
    getStringFromRecord(record, "insert_text") ||
    command
  );

  return {
    category: getStringFromRecord(record, "category") || undefined,
    command: command || `/${name}`,
    description: getStringFromRecord(record, "description") || undefined,
    id: getStringFromRecord(record, "id") || undefined,
    insertText: insertText || undefined,
    name,
    title: getStringFromRecord(record, "title") || getStringFromRecord(record, "label") || command || `/${name}`
  };
}

export function isAgentProviderKind(value: string): value is AgentProviderOption["kind"] {
  return value === "app-server" || value === "asp" || value === "cli" || value === "remote" || value === "sdk";
}

export function normalizeAgentModelOptions(models: unknown): AgentModelOption[] {
  if (!Array.isArray(models)) return [];

  const seenValues = new Set<string>();
  const normalizedModels = models
    .map(normalizeAgentModelOption)
    .filter((model): model is AgentModelOption => Boolean(model))
    .filter((model) => {
      if (seenValues.has(model.value)) return false;
      seenValues.add(model.value);
      return true;
    });
  const labelCounts = normalizedModels.reduce((counts, model) => {
    counts.set(model.label, (counts.get(model.label) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  return normalizedModels.map((model) => (
    (labelCounts.get(model.label) ?? 0) > 1
      ? { ...model, label: `${model.label} (${model.value})` }
      : model
  ));
}

export function normalizeAgentModelOption(model: unknown): AgentModelOption | null {
  if (typeof model === "string") {
    const value = model.trim();
    return value ? { id: value, label: value, value } : null;
  }

  const record = getRecord(model);
  const value = getStringFromRecord(record, "model") || getStringFromRecord(record, "value") || getStringFromRecord(record, "id");
  if (!value.trim()) return null;

  const id = getStringFromRecord(record, "id") || value;
  const displayName = getStringFromRecord(record, "displayName") || getStringFromRecord(record, "display_name") || getStringFromRecord(record, "label");
  const defaultReasoningEffort = getStringFromRecord(record, "defaultReasoningEffort") || getStringFromRecord(record, "default_reasoning_effort");
  const rawSupportedReasoningEfforts = record.supportedReasoningEfforts ?? record.supported_reasoning_efforts;
  const hasSupportedReasoningEfforts = hasRecordProperty(record, "supportedReasoningEfforts") || hasRecordProperty(record, "supported_reasoning_efforts");
  const rawSupportedSpeeds = record.supportedSpeeds ?? record.supported_speeds ?? record.responseSpeeds ?? record.response_speeds;
  const hasSupportedSpeeds = hasRecordProperty(record, "supportedSpeeds") || hasRecordProperty(record, "supported_speeds") || hasRecordProperty(record, "responseSpeeds") || hasRecordProperty(record, "response_speeds");
  const supportedReasoningEfforts = normalizeStringArray(rawSupportedReasoningEfforts)
    .filter((effort) => Boolean(effort.trim()));
  const supportedSpeeds = normalizeSpeedOptions(rawSupportedSpeeds);

  return {
    contextWindowTokens: getContextWindowTokens(record),
    defaultReasoningEffort: defaultReasoningEffort || undefined,
    id,
    isDefault: record.isDefault === true,
    label: displayName || value,
    supportedReasoningEfforts: hasSupportedReasoningEfforts ? supportedReasoningEfforts : undefined,
    supportedSpeeds: hasSupportedSpeeds ? supportedSpeeds : undefined,
    value
  };
}

export function getAgentProviderLabel(providers: AgentProviderOption[], providerId: ChatAgentProviderId): string {
  return providers.find((provider) => provider.id === providerId)?.label ?? getAgentProviderFallbackLabel(providerId);
}

export function getAgentProviderConnectionMode(provider: AgentProviderOption | undefined | null): ChatAgentConnectionMode {
  const transports = provider?.capabilities?.transports ?? [];
  if (transports.includes("ssh")) return "ssh";
  if (transports.some((transport) => transport === "websocket" || transport === "webtransport" || transport === "udp" || transport === "http")) {
    return "remote";
  }
  return "local";
}

export function getAgentProviderLogoDataUrl(providers: AgentProviderOption[], providerId: ChatAgentProviderId | undefined): string | undefined {
  if (!providerId) return undefined;
  return providers.find((provider) => provider.id === providerId)?.logoDataUrl ?? getBuiltinAgentProviderLogoDataUrl(providerId);
}

export function getAgentProviderOptions(providers: AgentProviderOption[], useFallback = true): string[] {
  return providers.length
    ? providers.map((provider) => provider.label)
    : useFallback
      ? getFallbackAgentProviderOptions().map((provider) => provider.label)
      : [];
}

export function getEnabledAgentProviders(providers: AgentProviderOption[]): AgentProviderOption[] {
  return providers.filter((provider) => provider.enabled);
}

export function getAgentProviderByLabel(providers: AgentProviderOption[], label: string, useFallback = true): AgentProviderOption | null {
  const providerOptions = providers.length ? providers : useFallback ? getFallbackAgentProviderOptions() : [];
  return providerOptions.find((provider) => provider.label === label) ?? null;
}

export function getAgentModelOptions(providers: AgentProviderOption[], providerId: ChatAgentProviderId): AgentModelOption[] {
  return providers.find((provider) => provider.id === providerId)?.models ?? [];
}

export function getAgentModelLabels(modelOptions: AgentModelOption[]): string[] {
  return modelOptions.map((model) => model.label);
}

export function getAgentModelLabel(model: string, modelOptions: AgentModelOption[], fallback: string): string {
  return modelOptions.find((option) => option.value === model)?.label ?? modelOptions[0]?.label ?? (model || fallback);
}

export function getAgentModelValueFromLabel(modelOptions: AgentModelOption[], label: string): string {
  return modelOptions.find((option) => option.label === label)?.value ?? "";
}

export function getContextWindowTokens(record: Record<string, unknown>): number | undefined {
  return getPositiveNumber(record.contextWindowTokens) ??
    getPositiveNumber(record.context_window_tokens) ??
    getPositiveNumber(record.contextWindow) ??
    getPositiveNumber(record.context_window) ??
    getPositiveNumber(record.contextLength) ??
    getPositiveNumber(record.context_length) ??
    getPositiveNumber(record.maxContextTokens) ??
    getPositiveNumber(record.max_context_tokens);
}

export function getDefaultAgentModel(provider: AgentProviderOption | undefined): string {
  return provider?.models.find((model) => model.isDefault)?.value ?? provider?.models[0]?.value ?? "";
}

export function getValidAgentModel(model: string, providers: AgentProviderOption[], providerId: ChatAgentProviderId): string {
  const provider = providers.find((option) => option.id === providerId);
  if (!provider) return model;
  return provider.models.some((option) => option.value === model) ? model : getDefaultAgentModel(provider);
}

export function isChatAgentEffort(value: string | undefined): value is ChatAgentEffort {
  return Boolean(value && defaultAgentEffortOptions.includes(value as ChatAgentEffort));
}

export function isChatAgentSpeed(value: string | undefined): value is ChatAgentSpeed {
  return Boolean(value && defaultAgentSpeedOptions.includes(value as ChatAgentSpeed));
}

export function getAgentEffortOptionsForModel(model: string, modelOptions: AgentModelOption[], provider?: AgentProviderOption | null): ChatAgentEffort[] {
  const selectedModel = modelOptions.find((option) => option.value === model) ?? modelOptions[0];
  const supportedEfforts = selectedModel?.supportedReasoningEfforts
    ?.filter(isChatAgentEffort)
    .filter((effort, index, efforts) => efforts.indexOf(effort) === index);
  if (selectedModel && Array.isArray(selectedModel.supportedReasoningEfforts)) return supportedEfforts ?? [];

  const providerEfforts = provider?.capabilities?.reasoningEfforts
    ?.filter(isChatAgentEffort)
    .filter((effort, index, efforts) => efforts.indexOf(effort) === index);
  if (provider?.capabilities && Array.isArray(provider.capabilities.reasoningEfforts)) return providerEfforts ?? [];

  return defaultAgentEffortOptions;
}

export function getValidAgentEffort(effort: ChatAgentEffort, model: string, modelOptions: AgentModelOption[], provider?: AgentProviderOption | null): ChatAgentEffort {
  const effortOptions = getAgentEffortOptionsForModel(model, modelOptions, provider);
  if (effortOptions.includes(effort)) return effort;

  const selectedModel = modelOptions.find((option) => option.value === model) ?? modelOptions[0];
  const defaultEffort = selectedModel?.defaultReasoningEffort;
  if (isChatAgentEffort(defaultEffort) && effortOptions.includes(defaultEffort)) return defaultEffort;

  return effortOptions.includes("medium") ? "medium" : effortOptions[0] ?? "medium";
}

export function getAgentEffortForRequest(effort: ChatAgentEffort, model: string, modelOptions: AgentModelOption[], provider?: AgentProviderOption | null): ChatAgentEffort | undefined {
  return getAgentEffortOptionsForModel(model, modelOptions, provider).length
    ? getValidAgentEffort(effort, model, modelOptions, provider)
    : undefined;
}

export function getAgentSpeedOptionsForModel(model: string, modelOptions: AgentModelOption[], provider?: AgentProviderOption | null): ChatAgentSpeed[] {
  const selectedModel = modelOptions.find((option) => option.value === model) ?? modelOptions[0];
  const modelSpeeds = selectedModel?.supportedSpeeds
    ?.filter(isChatAgentSpeed)
    .filter((speed, index, speeds) => speeds.indexOf(speed) === index);
  if (selectedModel && Array.isArray(selectedModel.supportedSpeeds)) return modelSpeeds ?? [];

  const providerSpeeds = provider?.capabilities?.speeds
    ?.filter(isChatAgentSpeed)
    .filter((speed, index, speeds) => speeds.indexOf(speed) === index);
  return providerSpeeds ?? [];
}

export function getValidAgentSpeed(speed: ChatAgentSpeed, model: string, modelOptions: AgentModelOption[], provider?: AgentProviderOption | null): ChatAgentSpeed {
  const speedOptions = getAgentSpeedOptionsForModel(model, modelOptions, provider);
  if (!speedOptions.length) return "default";
  if (speedOptions.includes(speed)) return speed;
  return speedOptions.includes("default") ? "default" : speedOptions[0] ?? "default";
}

export function getAgentSpeedForRequest(speed: ChatAgentSpeed, speedOptions: ChatAgentSpeed[]): "fast" | undefined {
  if (!speedOptions.length) return undefined;
  const validSpeed = speedOptions.includes(speed) ? speed : speedOptions.includes("default") ? "default" : speedOptions[0];
  return validSpeed === "fast" ? "fast" : undefined;
}

export function getAgentApprovalModeLabel(mode: ChatAgentApprovalMode, t: TFunction): string {
  if (mode === "auto") return t("agent.permission.auto");
  if (mode === "full") return t("agent.permission.full");
  return t("agent.permission.request");
}

export function getAgentApprovalModeOptions(t: TFunction): string[] {
  return agentApprovalModes.map((mode) => getAgentApprovalModeLabel(mode, t));
}

export function getAgentApprovalModeFromLabel(label: string, t: TFunction): ChatAgentApprovalMode {
  return agentApprovalModes.find((mode) => getAgentApprovalModeLabel(mode, t) === label) ?? "request";
}

export function getAgentEffortLabel(effort: ChatAgentEffort, t: TFunction): string {
  if (effort === "none") return t("agent.effort.none");
  if (effort === "minimal") return t("agent.effort.minimal");
  if (effort === "low") return t("agent.effort.low");
  if (effort === "medium") return t("agent.effort.medium");
  if (effort === "high") return t("agent.effort.high");
  if (effort === "xhigh") return t("agent.effort.xhigh");
  return t("agent.effort.max");
}

export function getAgentSpeedLabel(speed: ChatAgentSpeed, t: TFunction): string {
  if (speed === "fast") return t("agent.speed.fast");
  return t("agent.speed.default");
}

export function mergeAttachments(currentAttachments: ChatAttachment[], nextAttachments: ChatAttachment[]) {
  const attachments = [...currentAttachments];
  const seenPaths = new Set(currentAttachments.map((attachment) => attachment.path));
  for (const attachment of nextAttachments) {
    if (seenPaths.has(attachment.path)) continue;
    seenPaths.add(attachment.path);
    attachments.push(attachment);
  }
  return attachments;
}

export function normalizeMessageParts(rawParts: unknown, content: string, rawToolEvents: unknown): ChatMessagePart[] | undefined {
  const toolEvents = normalizeToolEvents(rawToolEvents) ?? [];
  if (Array.isArray(rawParts)) {
    const parts = rawParts
      .map(normalizeMessagePart)
      .filter((part): part is ChatMessagePart => Boolean(part));
    const cleanedParts = parts.length ? dropTranscriptTextParts(parts, toolEvents) : [];
    if (cleanedParts.length) return normalizeTrailingToolMessageParts(normalizeToolMessagePartNesting(cleanedParts));
  }

  const parts: ChatMessagePart[] = [];
  for (const toolEvent of toolEvents) {
    parts.push({
      id: createMessagePartId("tool"),
      toolEvent,
      type: "tool"
    });
  }
  if (content && !looksLikeStructuredTranscriptContent(content, toolEvents)) {
    parts.push({
      content,
      id: createMessagePartId("text"),
      type: "text"
    });
  }

  return parts.length ? parts : undefined;
}

function dropTranscriptTextParts(parts: ChatMessagePart[], toolEvents: ChatToolEvent[]): ChatMessagePart[] {
  if (!parts.some((part) => part.type === "tool") && !toolEvents.length) return parts;

  const events = [
    ...toolEvents,
    ...parts
      .filter((part): part is Extract<ChatMessagePart, { type: "tool" }> => part.type === "tool")
      .map((part) => part.toolEvent)
  ];

  return parts.filter((part) => part.type !== "text" || !looksLikeStructuredTranscriptContent(part.content, events));
}

function looksLikeStructuredTranscriptContent(content: string, toolEvents: ChatToolEvent[]): boolean {
  const text = content.trim();
  if (!text || !toolEvents.length) return false;

  const lowerText = text.toLowerCase();
  const toolNames = flattenToolEvents(toolEvents)
    .flatMap((toolEvent) => [
      toolEvent.name,
      toolEvent.kind,
      typeof toolEvent.metadata?.tool === "string" ? toolEvent.metadata.tool : "",
      typeof toolEvent.metadata?.server === "string" ? toolEvent.metadata.server : ""
    ])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const hasToolName = toolNames.some((name) => lowerText.includes(name));
  const hasMcpToolHeading = /(?:^|\n)\s*mcp(?:__|[._-])[a-z0-9_.-]+(?:\s*\n|$)/i.test(text);
  const hasToolIoHeadings =
    /(?:^|\n)\s*(?:输入|input)\s*\n/i.test(text) &&
    /(?:^|\n)\s*(?:结果|output|错误|error)\s*\n/i.test(text);
  const hasReasoningHeading = /(?:^|\n)\s*(?:reasoning|思考|思路)\s*\n/i.test(text);

  return (hasToolName || hasMcpToolHeading) && (hasToolIoHeadings || hasReasoningHeading);
}

export function normalizeTrailingToolMessageParts(parts: ChatMessagePart[]): ChatMessagePart[] {
  let firstTrailingToolIndex = parts.length;
  while (firstTrailingToolIndex > 0 && parts[firstTrailingToolIndex - 1]?.type === "tool") {
    firstTrailingToolIndex -= 1;
  }
  if (firstTrailingToolIndex <= 0 || firstTrailingToolIndex >= parts.length) return parts;

  let lastTextIndex = -1;
  for (let index = firstTrailingToolIndex - 1; index >= 0; index -= 1) {
    if (parts[index]?.type === "text") {
      lastTextIndex = index;
      break;
    }
  }
  if (lastTextIndex < 0) return parts;

  const trailingToolParts = parts.slice(firstTrailingToolIndex);
  return [
    ...parts.slice(0, lastTextIndex),
    ...trailingToolParts,
    parts[lastTextIndex],
    ...parts.slice(lastTextIndex + 1, firstTrailingToolIndex)
  ];
}

export function normalizeMessagePart(value: unknown): ChatMessagePart | null {
  const record = getRecord(value);
  const id = getStringFromRecord(record, "id") || createMessagePartId("part");
  if (record.type === "text") {
    const content = getStringFromRecord(record, "content");
    return content ? {
      content,
      format: record.format === "plain" || record.format === "markdown" ? record.format : undefined,
      id,
      metadata: getRecord(record.metadata),
      title: getStringFromRecord(record, "title") || undefined,
      type: "text"
    } : null;
  }

  if (record.type === "tool") {
    const toolEvent = normalizeToolEvent(record.toolEvent);
    return toolEvent ? { id, toolEvent, type: "tool" } : null;
  }

  if (record.type === "reasoning" || record.type === "plan" || record.type === "status") {
    return normalizeTextLikeMessagePart(record, id, record.type);
  }

  if (record.type === "resource") {
    return {
      content: getStringFromRecord(record, "content") || undefined,
      id,
      metadata: getRecord(record.metadata),
      mimeType: getStringFromRecord(record, "mimeType") || undefined,
      name: getStringFromRecord(record, "name") || undefined,
      path: getStringFromRecord(record, "path") || undefined,
      title: getStringFromRecord(record, "title") || undefined,
      type: "resource",
      uri: getStringFromRecord(record, "uri") || undefined
    };
  }

  if (record.type === "artifact") {
    return {
      artifactId: getStringFromRecord(record, "artifactId") || undefined,
      content: getStringFromRecord(record, "content") || undefined,
      id,
      metadata: getRecord(record.metadata),
      mimeType: getStringFromRecord(record, "mimeType") || undefined,
      path: getStringFromRecord(record, "path") || undefined,
      title: getStringFromRecord(record, "title") || undefined,
      type: "artifact",
      uri: getStringFromRecord(record, "uri") || undefined
    };
  }

  if (record.type === "diff") {
    const content = getStringFromRecord(record, "content");
    return content ? {
      content,
      id,
      language: getStringFromRecord(record, "language") || undefined,
      metadata: getRecord(record.metadata),
      oldPath: getStringFromRecord(record, "oldPath") || undefined,
      path: getStringFromRecord(record, "path") || undefined,
      title: getStringFromRecord(record, "title") || undefined,
      type: "diff"
    } : null;
  }

  if (record.type === "citation") {
    return {
      content: getStringFromRecord(record, "content") || undefined,
      id,
      metadata: getRecord(record.metadata),
      title: getStringFromRecord(record, "title") || undefined,
      type: "citation",
      uri: getStringFromRecord(record, "uri") || undefined
    };
  }

  if (record.type === "raw") {
    return {
      id,
      label: getStringFromRecord(record, "label") || undefined,
      metadata: getRecord(record.metadata),
      type: "raw",
      value: record.value
    };
  }

  return null;
}

export function normalizeTextLikeMessagePart(
  record: Record<string, unknown>,
  id: string,
  type: "plan" | "reasoning" | "status"
): ChatMessagePart | null {
  const content = getStringFromRecord(record, "content") || undefined;
  const title = getStringFromRecord(record, "title") || undefined;
  if (!content && !title && type !== "status") return null;

  if (type === "plan") {
    const items = normalizeStringArray(record.items);
    return {
      content,
      id,
      items: items.length ? items : undefined,
      metadata: getRecord(record.metadata),
      title,
      type
    };
  }

  if (type === "status") {
    return {
      content,
      id,
      metadata: getRecord(record.metadata),
      status: getStringFromRecord(record, "status") || undefined,
      title,
      type
    };
  }

  return {
    content,
    id,
    metadata: getRecord(record.metadata),
    title,
    type
  };
}

export function createMessagePartId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function normalizeToolEvents(value: unknown): ChatToolEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const events = value
    .map(normalizeToolEvent)
    .filter((event): event is ChatToolEvent => Boolean(event));
  const nestedEvents = buildToolEventTree(events);
  return nestedEvents.length ? nestedEvents : undefined;
}

export function normalizeToolEvent(value: unknown): ChatToolEvent | null {
  const record = getRecord(value);
  const id = getStringFromRecord(record, "id");
  const kind = getStringFromRecord(record, "kind");
  const name = getStringFromRecord(record, "name");
  if (!id || !kind || !name) return null;

  const phase = normalizeToolEventPhase(getStringFromRecord(record, "phase"));
  const children = normalizeToolEventChildren(record);
  const rawError = getStringFromRecord(record, "error");
  const rawOutput = getStringFromRecord(record, "output");
  const rejectedQuestionToolUse = isQuestionToolEventRecord(record) && isUserRejectedToolUseMessage(rawError);
  return {
    children,
    error: rejectedQuestionToolUse ? undefined : rawError || undefined,
    id,
    input: record.input,
    kind,
    metadata: getRecord(record.metadata),
    name,
    output: rawOutput || (rejectedQuestionToolUse ? "The user did not answer the questions." : undefined),
    parentId: getToolEventParentId(record),
    phase,
    status: getStringFromRecord(record, "status") || undefined
  };
}

function isQuestionToolEventRecord(record: Record<string, unknown>): boolean {
  const metadata = getRecord(record.metadata);
  const values = [
    getStringFromRecord(record, "name"),
    getStringFromRecord(record, "tool"),
    getStringFromRecord(record, "kind"),
    getStringFromRecord(metadata, "name"),
    getStringFromRecord(metadata, "tool")
  ].map((value) => value.trim().toLowerCase());

  return values.some((value) => (
    value === "askuserquestion" ||
    value === "question_request" ||
    value === "request_question" ||
    value === "questionrequest" ||
    value.includes("askuserquestion")
  ));
}

function isUserRejectedToolUseMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("tool use was rejected") ||
    normalized.includes("doesn't want to proceed with this tool use") ||
    normalized.includes("does not want to proceed with this tool use");
}

export function normalizeToolEventPhase(value: string): ChatToolEventPhase {
  return value === "started" || value === "updated" || value === "delta" || value === "completed" ? value : "updated";
}

export function normalizeToolEventChildren(record: Record<string, unknown>): ChatToolEvent[] | undefined {
  const childrenValue = Array.isArray(record.children)
    ? record.children
    : Array.isArray(record.toolEvents)
      ? record.toolEvents
      : Array.isArray(record.tool_events)
        ? record.tool_events
        : Array.isArray(record.childToolEvents)
          ? record.childToolEvents
          : undefined;

  return normalizeToolEvents(childrenValue);
}

export function getToolEventParentId(record: Record<string, unknown>): string | undefined {
  const metadata = getRecord(record.metadata);
  return getStringFromRecord(record, "parentId") ||
    getStringFromRecord(record, "parent_id") ||
    getStringFromRecord(record, "parentToolUseId") ||
    getStringFromRecord(record, "parent_tool_use_id") ||
    getStringFromRecord(metadata, "parentId") ||
    getStringFromRecord(metadata, "parent_id") ||
    getStringFromRecord(metadata, "parentToolUseId") ||
    getStringFromRecord(metadata, "parent_tool_use_id") ||
    undefined;
}

export function flattenToolEvents(events: ChatToolEvent[]): ChatToolEvent[] {
  const flattenedEvents: ChatToolEvent[] = [];

  const visit = (event: ChatToolEvent) => {
    const { children, ...eventWithoutChildren } = event;
    flattenedEvents.push(eventWithoutChildren);
    for (const child of children ?? []) {
      visit(child);
    }
  };

  for (const event of events) {
    visit(event);
  }

  return flattenedEvents;
}

export function buildToolEventTree(events: ChatToolEvent[]): ChatToolEvent[] {
  const flattenedEvents = flattenToolEvents(events);
  const nodes = new Map<string, ChatToolEvent>();
  const orderedIds: string[] = [];

  for (const event of flattenedEvents) {
    if (!nodes.has(event.id)) {
      orderedIds.push(event.id);
    }
    nodes.set(event.id, mergeFlatToolEvent(nodes.get(event.id), event));
  }

  const roots: ChatToolEvent[] = [];
  const placedIds = new Set<string>();
  for (const id of orderedIds) {
    const node = nodes.get(id);
    if (!node || placedIds.has(id)) continue;

    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && !wouldCreateToolEventCycle(node, parent, nodes)) {
      parent.children = [...(parent.children ?? []), node];
    } else {
      roots.push(node);
    }
    placedIds.add(id);
  }

  return roots;
}

export function wouldCreateToolEventCycle(
  node: ChatToolEvent,
  parent: ChatToolEvent,
  nodes: Map<string, ChatToolEvent>
): boolean {
  if (node.id === parent.id) return true;

  let currentParent: ChatToolEvent | undefined = parent;
  const visitedIds = new Set<string>();
  while (currentParent?.parentId) {
    if (currentParent.parentId === node.id) return true;
    if (visitedIds.has(currentParent.id)) return true;
    visitedIds.add(currentParent.id);
    currentParent = nodes.get(currentParent.parentId);
  }

  return false;
}

export function mergeFlatToolEvent(currentEvent: ChatToolEvent | undefined, nextEvent: ChatToolEvent): ChatToolEvent {
  const metadata = {
    ...currentEvent?.metadata,
    ...nextEvent.metadata
  };
  const mergedEvent: ChatToolEvent = {
    ...currentEvent,
    ...nextEvent,
    error: nextEvent.error === undefined ? currentEvent?.error : nextEvent.error,
    input: nextEvent.input === undefined ? currentEvent?.input : nextEvent.input,
    metadata: Object.keys(metadata).length ? metadata : undefined,
    name: nextEvent.name === "Tool call" && currentEvent?.name ? currentEvent.name : nextEvent.name,
    output: nextEvent.output === undefined ? currentEvent?.output : nextEvent.output,
    parentId: nextEvent.parentId || currentEvent?.parentId,
    status: nextEvent.status === undefined ? currentEvent?.status : nextEvent.status
  };

  return mergedEvent;
}

export function upsertToolEvent(currentEvents: ChatToolEvent[] | undefined, nextEvent: ChatToolEvent): ChatToolEvent[] {
  const events = flattenToolEvents(currentEvents ?? []);
  for (const event of flattenToolEvents([nextEvent])) {
    const existingIndex = events.findIndex((currentEvent) => currentEvent.id === event.id);
    if (existingIndex < 0) {
      events.push(event);
      continue;
    }

    events[existingIndex] = mergeFlatToolEvent(events[existingIndex], event);
  }

  return buildToolEventTree(events);
}

export function appendTextMessagePart(currentParts: ChatMessagePart[] | undefined, delta: string): ChatMessagePart[] {
  const parts = [...(currentParts ?? [])];
  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "text") {
    parts[parts.length - 1] = {
      ...lastPart,
      content: `${lastPart.content}${delta}`
    };
    return parts;
  }

  return [
    ...parts,
    {
      content: delta,
      id: createMessagePartId("text"),
      type: "text"
    }
  ];
}

export function upsertMessagePart(currentParts: ChatMessagePart[] | undefined, nextPart: ChatMessagePart): ChatMessagePart[] {
  if (nextPart.type === "text") {
    const parts = [...(currentParts ?? [])];
    const existingIndex = parts.findIndex((part) => part.type === "text" && part.id === nextPart.id);
    if (existingIndex >= 0) {
      parts[existingIndex] = {
        ...parts[existingIndex],
        ...nextPart
      };
      return parts;
    }

    return [...parts, nextPart];
  }

  if (nextPart.type === "tool") {
    return upsertToolMessagePart(currentParts, nextPart.toolEvent);
  }

  const parts = [...(currentParts ?? [])];
  const existingIndex = parts.findIndex((part) => part.id === nextPart.id && part.type === nextPart.type);
  if (existingIndex >= 0) {
    parts[existingIndex] = {
      ...parts[existingIndex],
      ...nextPart
    } as ChatMessagePart;
    return parts;
  }

  return [...parts, nextPart];
}

export function getMessagePartVisibleText(part: ChatMessagePart): string {
  if (part.type === "text" || part.type === "reasoning" || part.type === "status" || part.type === "citation") {
    return part.content ?? "";
  }

  if (part.type === "plan") {
    if (part.content) return part.content;
    return part.items?.map((item) => `- ${item}`).join("\n") ?? "";
  }

  if (part.type === "diff") return part.content;
  return "";
}

export function getMessagePartsVisibleText(parts: ChatMessagePart[] | undefined): string {
  return (parts ?? []).map(getMessagePartVisibleText).filter(Boolean).join("");
}

export function upsertMessagePartOnMessage(message: ChatMessage, part: ChatMessagePart): ChatMessage {
  const parts = upsertMessagePart(message.parts, part);
  const partsText = getMessagePartsVisibleText(parts);
  return {
    ...message,
    content: partsText || message.content,
    parts,
    streaming: true
  };
}

export function upsertToolMessagePart(currentParts: ChatMessagePart[] | undefined, toolEvent: ChatToolEvent): ChatMessagePart[] {
  const parts = [...(currentParts ?? [])];
  const existingIndex = parts.findIndex((part) => part.type === "tool" && toolPartCanContainEvent(part.toolEvent, toolEvent));
  if (existingIndex < 0) {
    const insertIndex = getToolMessagePartInsertIndex(parts, toolEvent);
    parts.splice(insertIndex, 0, {
      id: createMessagePartId("tool"),
      toolEvent,
      type: "tool"
    });
    return normalizeToolMessagePartNesting(parts);
  }

  const currentPart = parts[existingIndex];
  if (currentPart.type !== "tool") return parts;

  const nextToolEvents = upsertToolEvent([currentPart.toolEvent], toolEvent);
  parts[existingIndex] = {
    ...currentPart,
    toolEvent: nextToolEvents[0] ?? toolEvent
  };
  return normalizeToolMessagePartNesting(parts);
}

export function getToolMessagePartInsertIndex(parts: ChatMessagePart[], toolEvent: ChatToolEvent): number {
  const lastIndex = parts.length - 1;
  const lastPart = parts[lastIndex];
  if (toolEvent.phase !== "started" && lastPart?.type === "text") {
    return lastIndex;
  }

  return parts.length;
}

export function toolPartCanContainEvent(rootEvent: ChatToolEvent, nextEvent: ChatToolEvent): boolean {
  if (rootEvent.id === nextEvent.id) return true;
  if (nextEvent.parentId && rootEvent.id === nextEvent.parentId) return true;
  return Boolean(rootEvent.children?.some((childEvent) => toolPartCanContainEvent(childEvent, nextEvent)));
}

export function normalizeToolMessagePartNesting(parts: ChatMessagePart[]): ChatMessagePart[] {
  const nestedToolEvents = buildToolEventTree(
    parts
      .filter((part): part is Extract<ChatMessagePart, { type: "tool" }> => part.type === "tool")
      .map((part) => part.toolEvent)
  );
  const rootToolEvents = new Map(nestedToolEvents.map((toolEvent) => [toolEvent.id, toolEvent]));
  const usedRootIds = new Set<string>();

  const normalizedParts = parts.flatMap((part): ChatMessagePart[] => {
    if (part.type !== "tool") return [part];

    const rootToolEvent = rootToolEvents.get(part.toolEvent.id);
    if (!rootToolEvent || usedRootIds.has(rootToolEvent.id)) return [];

    usedRootIds.add(rootToolEvent.id);
    return [{
      ...part,
      toolEvent: rootToolEvent
    }];
  });

  return normalizedParts;
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function getMessageMarkdownContent(message: ChatMessage): string {
  const partContent = message.parts
    ?.filter((part): part is Extract<ChatMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.content.trim())
    .filter(Boolean)
    .join("\n\n") ?? "";

  return (partContent || message.content.trim()).trim();
}

export function formatConversationMarkdown(title: string, messages: ChatMessage[], t: TFunction): string {
  const lines = [`# ${title || t("chat.title")}`];

  for (const message of messages) {
    const content = getMessageMarkdownContent(message);
    if (!content) continue;

    lines.push(
      "",
      `## ${message.role === "user" ? t("thread.userRole") : t("thread.assistantRole")}`,
      "",
      content
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function getContextWindowMetrics({
  attachments,
  composerValue,
  messages,
  model,
  modelOptions,
  providerId,
  usage
}: {
  attachments: ChatAttachment[];
  composerValue: string;
  messages: ChatMessage[];
  model: string;
  modelOptions: AgentModelOption[];
  providerId?: ChatAgentProviderId;
  usage: UsageTokenMetrics | null;
}): ContextWindowMetrics {
  const modelOption = modelOptions.find((option) => option.value === model) ?? modelOptions[0];
  const modelLabel = modelOption?.label ?? model;
  const rawUsageTokens = usage?.contextTokens && usage.contextTokens > 0
    ? usage.contextTokens
    : usage
      ? Math.max(usage.totalTokens, usage.inputTokens + usage.outputTokens)
      : 0;
  const usageTokens = usage &&
    rawUsageTokens > 0 &&
    usage.inputCachedTokens > 0 &&
    usage.totalTokens > 0 &&
    rawUsageTokens === usage.totalTokens + usage.inputCachedTokens
    ? usage.totalTokens
    : rawUsageTokens;
  const usageContextWindowTokens = usage?.contextWindowTokens && usage.contextWindowTokens > 0 &&
    (usageTokens <= 0 || usage.contextWindowTokens >= usageTokens)
    ? usage.contextWindowTokens
    : undefined;
  const modelContextWindowTokens = modelOption?.contextWindowTokens && modelOption.contextWindowTokens > 0
    ? modelOption.contextWindowTokens
    : undefined;
  const limitTokens = usageContextWindowTokens ?? modelContextWindowTokens ?? inferContextWindowTokens(modelOption?.value ?? model, modelLabel, providerId);
  const hasUsageTokens = usageTokens > 0;
  const usedTokens = hasUsageTokens ? usageTokens : null;
  const remainingTokens = limitTokens && usedTokens !== null ? Math.max(0, limitTokens - usedTokens) : null;

  return {
    estimatedTokens: null,
    limitTokens,
    modelLabel,
    remainingTokens,
    source: hasUsageTokens ? "actual" : "unknown",
    usage,
    usedTokens
  };
}

export function getAgentContextWindowInfo(metrics: ContextWindowMetrics): AgentContextWindowInfo {
  return {
    estimatedTokens: metrics.estimatedTokens ?? undefined,
    limitTokens: metrics.limitTokens ?? undefined,
    modelLabel: metrics.modelLabel,
    remainingTokens: metrics.remainingTokens ?? undefined,
    source: metrics.source,
    usedTokens: metrics.usedTokens ?? undefined
  };
}

export function estimateContextTokens(messages: ChatMessage[], composerValue: string, attachments: ChatAttachment[]): number {
  const messageText = messages
    .map((message) => `${message.role}: ${getMessageMarkdownContent(message)}`)
    .filter((line) => line.trim().length > 0)
    .join("\n\n");
  const attachmentText = attachments.map((attachment) => `${attachment.kind}: ${attachment.name} ${attachment.path}`).join("\n");
  const text = [messageText, composerValue.trim(), attachmentText].filter(Boolean).join("\n\n");
  if (!text) return 0;

  const cjkCharacters = text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0;
  const estimatedFromCharacters = Math.ceil(text.length / contextWindowTokenEstimateDivisor);
  const cjkAdjustment = Math.ceil(cjkCharacters * 0.45);
  const structuralOverhead = Math.max(24, messages.length * 10 + attachments.length * 16);
  return Math.max(0, estimatedFromCharacters + cjkAdjustment + structuralOverhead);
}

export function inferContextWindowTokens(model: string, label: string, providerId?: ChatAgentProviderId): number | null {
  const source = `${model} ${label}`.toLowerCase();
  if (isClaudeCodeProviderId(providerId)) {
    return hasOneMillionContextMarker(source) ? 1_000_000 : 200_000;
  }

  const explicit = source.match(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*(m|k)\b/);
  if (explicit) {
    const value = Number(explicit[1]);
    if (Number.isFinite(value) && value > 0) {
      return Math.round(value * (explicit[2] === "m" ? 1_000_000 : 1_000));
    }
  }

  if (/\b(?:claude|fable|mythos|haiku|opus|sonnet)\b/.test(source)) return 200_000;
  return null;
}

function isClaudeCodeProviderId(providerId: ChatAgentProviderId | undefined): boolean {
  return providerId === "claude" || providerId === "claude-code";
}

function hasOneMillionContextMarker(source: string): boolean {
  return /\[\s*1\s*m\s*\]/i.test(source);
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${formatCompactNumber(value / 1_000_000)}M`;
  if (value >= 1_000) return `${formatCompactNumber(value / 1_000)}K`;
  return Math.round(value).toLocaleString();
}

export function formatCompactNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(value >= 10 ? 0 : 1);
}

export async function writeClipboardText(text: string): Promise<void> {
  const clipboardApi = typeof window !== "undefined" ? window.agentConsole?.clipboard : undefined;
  if (clipboardApi) {
    await clipboardApi.writeText(text);
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error("Clipboard API is not available.");
}

export function formatApprovalDetails(prompt: AgentApprovalPrompt): string {
  const params = getRecord(prompt.params);
  const lines: string[] = [];
  const reason = getStringFromRecord(params, "reason");
  const command = getStringFromRecord(params, "command");
  const cwd = getStringFromRecord(params, "cwd");
  const toolName = getStringFromRecord(params, "toolName") || getStringFromRecord(params, "tool_name");
  const grantRoot = getStringFromRecord(params, "grantRoot");

  if (prompt.approvalScope) lines.push(`scope: ${prompt.approvalScope}`);
  if (reason) lines.push(`reason: ${reason}`);
  if (command) lines.push(`command: ${command}`);
  if (cwd) lines.push(`cwd: ${cwd}`);
  if (toolName) lines.push(`tool: ${toolName}`);
  if (grantRoot) lines.push(`grantRoot: ${grantRoot}`);
  if (params.input !== undefined) {
    lines.push(`input: ${stringifyApprovalValue(params.input, 1200)}`);
  }
  if (lines.length) {
    lines.push("");
  }

  lines.push(stringifyApprovalValue(prompt.params, 4000));
  return lines.join("\n");
}

export function stringifyApprovalValue(value: unknown, maxLength: number): string {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }

  if (!text || text === "undefined") {
    return "{}";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function getStringFromRecord(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function hasRecordProperty(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function normalizeAppSettingsState(settings: Partial<AppSettingsState> | null | undefined): AppSettingsState {
  return {
    agentEnvironments: normalizeAgentEnvironmentSettings(settings?.agentEnvironments),
    disabledAgentProviders: normalizeDisabledAgentProviders(settings?.disabledAgentProviders),
    agentProviders: normalizeConfiguredAgentProviders(settings?.agentProviders),
    defaultSpotlightShortcut: settings?.defaultSpotlightShortcut || defaultAppSettingsState.defaultSpotlightShortcut,
    registeredSpotlightShortcut: settings?.registeredSpotlightShortcut ?? defaultAppSettingsState.registeredSpotlightShortcut,
    spotlightShortcut: settings?.spotlightShortcut || defaultAppSettingsState.spotlightShortcut,
    subagents: normalizeConfiguredSubagents(settings?.subagents),
    toolHub: normalizeToolHubSettings(settings?.toolHub)
  };
}

export function normalizeToolHubSettings(value: unknown): ToolHubSettings {
  const record = getRecord(value);
  const llm = normalizeToolHubLlmSettings(record.llm);
  return {
    builtinMcpServers: normalizeToolHubBuiltinMcpServers(record.builtinMcpServers),
    enabled: (typeof record.enabled === "boolean" ? record.enabled : defaultAppSettingsState.toolHub.enabled) && isToolHubLlmConfigured(llm),
    llm,
    mcpServers: normalizeToolHubMcpServers(record.mcpServers)
  };
}

export function normalizeToolHubBuiltinMcpServers(value: unknown): ToolHubBuiltinMcpServerSettings {
  const record = getRecord(value);
  const settings: ToolHubBuiltinMcpServerSettings = { ...defaultAppSettingsState.toolHub.builtinMcpServers };
  for (const id of toolHubBuiltinMcpServerIds) {
    settings[id] = typeof record[id] === "boolean" ? record[id] : settings[id];
  }
  return settings;
}

export function isToolHubLlmConfigured(llm: ToolHubLlmSettings): boolean {
  return Boolean(llm.apiKey.trim() && llm.baseUrl.trim() && llm.model.trim());
}

export function normalizeToolHubLlmSettings(value: unknown): ToolHubLlmSettings {
  const record = getRecord(value);
  return {
    apiKey: typeof record.apiKey === "string" ? record.apiKey.trim() : "",
    baseUrl: typeof record.baseUrl === "string" ? record.baseUrl.trim() : "",
    model: typeof record.model === "string" ? record.model.trim() : ""
  };
}

export function normalizeToolHubMcpServers(value: unknown): ToolHubUserMcpServerConfig[] {
  return Array.isArray(value)
    ? value.map(normalizeToolHubMcpServer).filter((server): server is ToolHubUserMcpServerConfig => Boolean(server))
    : [];
}

export function normalizeToolHubMcpServer(value: unknown): ToolHubUserMcpServerConfig | null {
  const record = getRecord(value);
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const command = typeof record.command === "string" ? record.command.trim() : "";
  if (!id || (!url && !command)) return null;
  const type = record.type === "sse" && url ? "sse" : record.type === "stdio" || (!url && command) ? "stdio" : "http";
  return {
    id,
    label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : id,
    enabled: typeof record.enabled === "boolean" ? record.enabled : false,
    alwaysLoad: typeof record.alwaysLoad === "boolean" ? record.alwaysLoad : true,
    args: Array.isArray(record.args) ? record.args.filter((item): item is string => typeof item === "string") : [],
    authentication: normalizeToolHubAuthentication(record.authentication),
    command: command || undefined,
    connectionType: record.connectionType === "proxy" ? "proxy" : "direct",
    description: typeof record.description === "string" && record.description.trim() ? record.description.trim() : undefined,
    env: normalizeStringRecord(record.env),
    headers: normalizeStringRecord(record.headers),
    type,
    url: url || undefined
  };
}

export function normalizeToolHubAuthentication(value: unknown): ToolHubUserMcpServerConfig["authentication"] {
  const record = getRecord(value);
  if (record.type === "bearer") {
    const token = typeof record.token === "string" ? record.token.trim() : "";
    return token ? { type: "bearer", token } : undefined;
  }
  if (record.type === "api-key") {
    const headerName = typeof record.headerName === "string" && record.headerName.trim() ? record.headerName.trim() : "X-API-Key";
    const authValue = typeof record.value === "string" ? record.value.trim() : "";
    return authValue ? { type: "api-key", headerName, value: authValue } : undefined;
  }
  if (record.type === "basic") {
    const username = typeof record.username === "string" ? record.username.trim() : "";
    const password = typeof record.password === "string" ? record.password : "";
    return username || password ? { type: "basic", username, password } : undefined;
  }
  return undefined;
}

export function normalizeDisabledAgentProviders(value: unknown): ChatAgentProviderId[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((providerId): providerId is string => typeof providerId === "string" && Boolean(providerId.trim()))
    .map((providerId) => providerId.trim())
    .filter((providerId, index, providerIds) => providerIds.indexOf(providerId) === index);
}

export function normalizePluginState(state: Partial<AgentConsolePluginState> | null | undefined): AgentConsolePluginState {
  return {
    agentSkills: Array.isArray(state?.agentSkills) ? state.agentSkills : [],
    automationTemplates: Array.isArray(state?.automationTemplates) ? state.automationTemplates : [],
    commands: Array.isArray(state?.commands) ? state.commands : [],
    fileTreeItems: Array.isArray(state?.fileTreeItems) ? state.fileTreeItems : [],
    marketplace: Array.isArray(state?.marketplace) ? state.marketplace : [],
    menus: Array.isArray(state?.menus) ? state.menus : [],
    mcpServers: Array.isArray(state?.mcpServers) ? state.mcpServers : [],
    pluginRoot: typeof state?.pluginRoot === "string" ? state.pluginRoot : "",
    plugins: Array.isArray(state?.plugins) ? state.plugins : [],
    rightSidebarPanels: Array.isArray(state?.rightSidebarPanels) ? state.rightSidebarPanels : [],
    shortcuts: Array.isArray(state?.shortcuts) ? state.shortcuts : [],
    warnings: Array.isArray(state?.warnings) ? state.warnings.filter((warning): warning is string => typeof warning === "string") : []
  };
}

export function createSlashCommands(pluginState: AgentConsolePluginState, t: TFunction, provider?: AgentProviderOption | null): SlashCommand[] {
  const providerCommands = createSlashCommandsFromProvider(provider);
  const commands: SlashCommand[] = [
    ...providerCommands,
    {
      action: { text: t("slash.review.prompt"), type: "insert" },
      category: t("slash.category.prompts"),
      description: t("slash.review.description"),
      icon: Search,
      id: "builtin:review",
      name: "review",
      source: "builtin",
      title: t("slash.review.title")
    },
    {
      action: { text: t("slash.explain.prompt"), type: "insert" },
      category: t("slash.category.prompts"),
      description: t("slash.explain.description"),
      icon: Sparkles,
      id: "builtin:explain",
      name: "explain",
      source: "builtin",
      title: t("slash.explain.title")
    },
    {
      action: { text: t("slash.fix.prompt"), type: "insert" },
      category: t("slash.category.prompts"),
      description: t("slash.fix.description"),
      icon: SquarePen,
      id: "builtin:fix",
      name: "fix",
      source: "builtin",
      title: t("slash.fix.title")
    },
    {
      action: { text: t("slash.tests.prompt"), type: "insert" },
      category: t("slash.category.prompts"),
      description: t("slash.tests.description"),
      icon: CheckCircle2,
      id: "builtin:tests",
      name: "tests",
      source: "builtin",
      title: t("slash.tests.title")
    }
  ];

  const pluginLabels = new Map(pluginState.plugins.map((plugin) => [plugin.id, plugin.label]));
  const usedNames = new Set(commands.map((command) => command.name));
  for (const command of pluginState.commands) {
    commands.push(createSlashCommandFromPluginCommand(command, pluginLabels.get(command.pluginId), usedNames, t));
  }

  return commands;
}

export function createSlashCommandsFromProvider(provider?: AgentProviderOption | null): SlashCommand[] {
  if (!provider?.capabilities?.slashCommands?.length) return [];

  const seenIds = new Set<string>();
  return provider.capabilities.slashCommands
    .map((command): SlashCommand | null => {
      const name = normalizeProviderSlashCommandName(command.name || getProviderSlashCommandName(command.command || command.insertText || ""));
      if (!name) return null;

      const insertText = normalizeProviderSlashCommandInsertText(command.insertText || command.command || name);
      const id = `provider:${provider.id}:${command.id || name}`;
      if (seenIds.has(id)) return null;
      seenIds.add(id);

      return {
        action: { text: insertText, type: "insert" },
        category: command.category || provider.label,
        description: command.description,
        icon: Bot,
        id,
        logoDataUrl: provider.logoDataUrl,
        name,
        source: "provider",
        title: command.title || command.command || `/${name}`
      };
    })
    .filter((command): command is SlashCommand => Boolean(command));
}

export function createSlashCommandFromPluginCommand(
  command: AgentConsolePluginCommand,
  pluginLabel: string | undefined,
  usedNames: Set<string>,
  t: TFunction
): SlashCommand {
  const baseName = createSlashCommandName(command.rawCommandId || command.title || command.id);
  const name = getUniqueSlashCommandName(baseName || "plugin", usedNames);
  const category = command.category || pluginLabel || t("slash.category.plugins");
  const icon = resolveSlashCommandIcon(command.icon, command.kind);

  if (command.kind === "prompt" && command.insertText) {
    return {
      action: { text: command.insertText, type: "insert" },
      category,
      description: command.description,
      icon,
      id: command.id,
      name,
      source: "plugin",
      title: command.title
    };
  }

  if (command.kind === "view" && command.panelId) {
    return {
      action: { panelId: command.panelId, type: "open-panel" },
      category,
      description: command.description,
      icon,
      id: command.id,
      name,
      source: "plugin",
      title: command.title
    };
  }

  return {
    action: { type: "unavailable" },
    category,
    description: command.description || t("slash.unavailable.description"),
    disabled: true,
    icon,
    id: command.id,
    name,
    source: "plugin",
    title: command.title
  };
}

export function createSlashCommandName(value: string): string {
  return value
    .trim()
    .replace(/^plugin:/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 32);
}

export function normalizeProviderSlashCommandText(value: string): string {
  const text = value.trim();
  if (!text) return "";
  return text.startsWith("/") ? text : `/${text}`;
}

export function normalizeProviderSlashCommandInsertText(value: string): string {
  const text = value.trimStart();
  if (!text.trim()) return "";
  return text.startsWith("/") ? text : `/${text}`;
}

export function getProviderSlashCommandName(value: string): string {
  return normalizeProviderSlashCommandName(value.replace(/^\/+/, "").split(/\s+/, 1)[0] ?? "");
}

export function normalizeProviderSlashCommandName(value: string): string {
  return value
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function getUniqueSlashCommandName(baseName: string, usedNames: Set<string>): string {
  let name = baseName;
  let index = 2;
  while (usedNames.has(name)) {
    name = `${baseName}-${index}`;
    index += 1;
  }
  usedNames.add(name);
  return name;
}

export function resolveSlashCommandIcon(iconName: string | undefined, kind: AgentConsolePluginCommand["kind"]): LucideIcon {
  const registry = {
    CheckCircle2,
    FileText,
    PanelRight,
    Search,
    Sparkles,
    SquarePen,
    Workflow
  } satisfies Record<string, LucideIcon>;

  if (iconName && Object.prototype.hasOwnProperty.call(registry, iconName)) {
    return registry[iconName as keyof typeof registry];
  }

  if (kind === "view") return PanelRight;
  if (kind === "prompt") return Sparkles;
  return Workflow;
}

export function getSlashCommandQuery(value: string): string | null {
  if (!value.startsWith("/") || value.includes("\n")) return null;
  return value.slice(1).trim().toLowerCase();
}

export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const normalizedQuery = query.toLowerCase();
  const scoredCommands = commands
    .map((command) => ({ command, score: getSlashCommandScore(command, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.command.title.localeCompare(right.command.title));

  return scoredCommands.slice(0, 8).map((entry) => entry.command);
}

export function getSlashCommandScore(command: SlashCommand, query: string): number {
  if (!query) return command.disabled ? 1 : 2;
  const haystack = `${command.name} ${command.title} ${command.category} ${command.description ?? ""}`.toLowerCase();
  if (command.name === query) return 100;
  if (command.name.startsWith(query)) return 80;
  if (command.title.toLowerCase().startsWith(query)) return 60;
  return haystack.includes(query) ? 30 : 0;
}

export function getFirstEnabledSlashCommandIndex(commands: SlashCommand[]): number {
  const index = commands.findIndex((command) => !command.disabled);
  return index >= 0 ? index : 0;
}

export function getNextEnabledSlashCommandIndex(commands: SlashCommand[], currentIndex: number, direction: 1 | -1): number {
  if (!commands.length) return 0;

  for (let offset = 1; offset <= commands.length; offset += 1) {
    const nextIndex = (currentIndex + offset * direction + commands.length) % commands.length;
    if (!commands[nextIndex].disabled) return nextIndex;
  }

  return currentIndex;
}

export function normalizeAgentEnvironmentSettings(value: unknown): AgentEnvironmentSettings {
  const rawSettings = getRecord(value);
  const environments: AgentEnvironmentSettings = {};

  for (const [providerId, rawEnvironment] of Object.entries(rawSettings)) {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) continue;
    environments[normalizedProviderId] = normalizeEnvironmentVariableMap(rawEnvironment);
  }

  return environments;
}

export function normalizeConfiguredAgentProviders(value: unknown): ConfiguredAgentProviderSettings[] {
  if (!Array.isArray(value)) return [];

  const seenProviderIds = new Set<string>();
  return value
    .map(normalizeConfiguredAgentProvider)
    .filter((provider): provider is ConfiguredAgentProviderSettings => {
      if (!provider || seenProviderIds.has(provider.id)) return false;
      seenProviderIds.add(provider.id);
      return true;
    });
}

export function normalizeConfiguredAgentProvider(value: unknown): ConfiguredAgentProviderSettings | null {
  const record = getRecord(value);
  const id = getTrimmedString(record.id);
  const command = getTrimmedString(record.command);
  const url = getTrimmedString(record.url);
  const transport = normalizeConfiguredAgentProviderTransport(record.transport, url, command);
  if (!id || (!command && !url)) return null;
  if ((transport === "websocket" || transport === "webtransport" || transport === "udp" || transport === "http") && !url) return null;
  if ((transport === "stdio" || transport === "persistent-stdio" || transport === "ssh") && !command) return null;
  if (transport === "ssh" && !url) return null;

  const label = getTrimmedString(record.label) || id;
  return {
    args: normalizeStringArray(record.args),
    command: command || undefined,
    description: getTrimmedString(record.description) || `Runs ${label} through the Agent Server Protocol.`,
    env: normalizeEnvironmentVariableMap(record.env),
    id,
    installCommand: getTrimmedString(record.installCommand) || undefined,
    label,
    logoDataUrl: normalizeAgentLogoDataUrl(record.logoDataUrl),
    models: normalizeConfiguredAgentModels(record.models),
    timeoutMs: getPositiveNumber(record.timeoutMs),
    transport,
    url: url || undefined
  };
}

export function normalizeConfiguredSubagents(value: unknown): ConfiguredSubagentSettings[] {
  if (!Array.isArray(value)) return [];

  const seenSubagentIds = new Set<string>();
  return value
    .map(normalizeConfiguredSubagent)
    .filter((subagent): subagent is ConfiguredSubagentSettings => {
      if (!subagent || seenSubagentIds.has(subagent.id)) return false;
      seenSubagentIds.add(subagent.id);
      return true;
    });
}

export function normalizeConfiguredSubagent(value: unknown): ConfiguredSubagentSettings | null {
  const record = getRecord(value);
  const id = getTrimmedString(record.id);
  const providerId = getTrimmedString(record.providerId ?? record.provider ?? record.baseProviderId);
  const label = getTrimmedString(record.label);
  const description = getTrimmedString(record.description);
  const mcpServers = normalizeAgentMcpServerMap(record.mcpServers ?? record.tools);
  const systemPrompt = typeof record.systemPrompt === "string"
    ? record.systemPrompt.trim()
    : typeof record.instructions === "string"
      ? record.instructions.trim()
      : "";
  if (!id || !providerId || !label || !description || !systemPrompt || !Object.keys(mcpServers).length) return null;

  return {
    approvalMode: normalizeOptionalAgentApprovalMode(record.approvalMode ?? record.permissionMode),
    description,
    effort: isChatAgentEffort(getTrimmedString(record.effort ?? record.reasoningEffort))
      ? getTrimmedString(record.effort ?? record.reasoningEffort) as ChatAgentEffort
      : undefined,
    id,
    label,
    mcpServers,
    model: getTrimmedString(record.model) || undefined,
    providerId,
    speed: isChatAgentSpeed(getTrimmedString(record.speed ?? record.responseSpeed))
      ? getTrimmedString(record.speed ?? record.responseSpeed) as ChatAgentSpeed
      : undefined,
    systemPrompt
  };
}

function normalizeOptionalAgentApprovalMode(value: unknown): ChatAgentApprovalMode | undefined {
  const mode = getTrimmedString(value);
  return mode === "request" || mode === "auto" || mode === "full" ? mode : undefined;
}

export function normalizeAgentMcpServerMap(value: unknown): AgentMcpServerMap {
  const rawServers = getRecord(value);
  const servers: AgentMcpServerMap = {};

  for (const [serverId, rawServer] of Object.entries(rawServers)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(serverId.trim())) continue;
    const server = getRecord(rawServer);
    const url = getTrimmedString(server.url);
    const command = getTrimmedString(server.command);
    if (!url && !command) continue;

    servers[serverId.trim()] = {
      alwaysLoad: typeof server.alwaysLoad === "boolean" ? server.alwaysLoad : true,
      args: normalizeStringArray(server.args),
      authentication: normalizeToolHubAuthentication(server.authentication),
      command: command || undefined,
      connectionType: server.connectionType === "proxy" ? "proxy" : "direct",
      defaultToolsApprovalMode: server.defaultToolsApprovalMode === "auto" ||
        server.defaultToolsApprovalMode === "approve" ||
        server.defaultToolsApprovalMode === "prompt"
        ? server.defaultToolsApprovalMode
        : undefined,
      description: getTrimmedString(server.description) || undefined,
      disabledTools: normalizeStringArray(server.disabledTools),
      enabledTools: normalizeStringArray(server.enabledTools),
      env: normalizeEnvironmentVariableMap(server.env),
      headers: normalizeStringRecord(server.headers),
      startupTimeoutSec: getPositiveNumber(server.startupTimeoutSec),
      supportsParallelToolCalls: typeof server.supportsParallelToolCalls === "boolean" ? server.supportsParallelToolCalls : undefined,
      toolTimeoutSec: getPositiveNumber(server.toolTimeoutSec),
      type: server.type === "sse" && url ? "sse" : server.type === "stdio" || (!url && command) ? "stdio" : "http",
      url: url || undefined
    };
  }

  return servers;
}

export function normalizeConfiguredAgentProviderTransport(
  value: unknown,
  url = "",
  command = ""
): ConfiguredAgentProviderTransport {
  const transport = getTrimmedString(value).toLowerCase().replaceAll("_", "-");
  if (
    transport === "stdio" ||
    transport === "persistent-stdio" ||
    transport === "websocket" ||
    transport === "ssh" ||
    transport === "webtransport" ||
    transport === "udp" ||
    transport === "http"
  ) {
    return transport;
  }

  if (url.startsWith("ws://") || url.startsWith("wss://")) return "websocket";
  if (url.startsWith("ssh://") || isSshTargetUrl(url)) return "ssh";
  if (url) return "http";
  if (command) return "stdio";
  return "stdio";
}

function isSshTargetUrl(value: string): boolean {
  return /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9._-]+(?::\d+)?$/.test(value.trim());
}

export function normalizeConfiguredAgentModels(value: unknown): ConfiguredAgentModelSettings[] {
  if (!Array.isArray(value)) return [];

  const seenModels = new Set<string>();
  return value
    .map(normalizeConfiguredAgentModel)
    .filter((model): model is ConfiguredAgentModelSettings => {
      if (!model || seenModels.has(model.model)) return false;
      seenModels.add(model.model);
      return true;
    });
}

export function normalizeConfiguredAgentModel(value: unknown): ConfiguredAgentModelSettings | null {
  if (typeof value === "string") {
    const model = value.trim();
    return model ? { id: model, model } : null;
  }

  const record = getRecord(value);
  const model = getTrimmedString(record.model) || getTrimmedString(record.value) || getTrimmedString(record.id);
  if (!model) return null;

  const supportedReasoningEfforts = normalizeStringArray(record.supportedReasoningEfforts);
  const supportedSpeeds = normalizeSpeedOptions(record.supportedSpeeds ?? record.supported_speeds ?? record.responseSpeeds ?? record.response_speeds);
  return {
    contextWindowTokens: getContextWindowTokens(record),
    defaultReasoningEffort: getTrimmedString(record.defaultReasoningEffort) || undefined,
    displayName: getTrimmedString(record.displayName) || getTrimmedString(record.label) || undefined,
    hidden: typeof record.hidden === "boolean" ? record.hidden : undefined,
    id: getTrimmedString(record.id) || model,
    isDefault: typeof record.isDefault === "boolean" ? record.isDefault : undefined,
    model,
    supportedReasoningEfforts: supportedReasoningEfforts.length ? supportedReasoningEfforts : undefined,
    supportedSpeeds: supportedSpeeds.length ? supportedSpeeds : undefined
  };
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item, index, items) => Boolean(item) && items.indexOf(item) === index);
}

export function normalizeSpeedOptions(value: unknown): ChatAgentSpeed[] {
  return normalizeStringArray(value)
    .filter((speed): speed is ChatAgentSpeed => isChatAgentSpeed(speed));
}

export function getPositiveNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function getTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAgentLogoDataUrl(value: unknown): string | undefined {
  const logoDataUrl = typeof value === "string" ? value.trim() : "";
  if (!logoDataUrl || logoDataUrl.length > 1_500_000) return undefined;
  return /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);(?:charset=[^;,]+;)?base64,[A-Za-z0-9+/=]+$/i.test(logoDataUrl) ||
    /^data:image\/svg\+xml;charset=[^,]+,%3Csvg/i.test(logoDataUrl)
    ? logoDataUrl
    : undefined;
}

export function normalizeEnvironmentVariableMap(value: unknown): Record<string, string> {
  const rawEnvironment = getRecord(value);
  const environment: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(rawEnvironment)) {
    const normalizedKey = key.trim();
    if (isValidEnvironmentVariableName(normalizedKey) && typeof rawValue === "string") {
      environment[normalizedKey] = rawValue;
    }
  }

  return environment;
}

export function normalizeStringRecord(value: unknown): Record<string, string> {
  const rawRecord = getRecord(value);
  const result: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(rawRecord)) {
    const normalizedKey = key.trim();
    if (normalizedKey && typeof rawValue === "string") {
      result[normalizedKey] = rawValue;
    }
  }

  return result;
}

export function isValidEnvironmentVariableName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export function createAgentEnvironmentRow(name = "", value = ""): AgentEnvironmentRow {
  return {
    id: `env-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    name,
    value
  };
}

export function getAgentEnvironmentRows(environment: Record<string, string> | undefined): AgentEnvironmentRow[] {
  const rows = Object.entries(environment ?? {}).map(([name, value]) => createAgentEnvironmentRow(name, value));
  return rows.length ? rows : [createAgentEnvironmentRow()];
}

export function getEnvironmentFromRows(rows: AgentEnvironmentRow[], t: TFunction): { env: Record<string, string>; error: string | null } {
  const env: Record<string, string> = {};

  for (const row of rows) {
    const name = row.name.trim();
    if (!name && !row.value) continue;
    if (!name) {
      return { env: {}, error: t("settings.agentEnvironment.nameRequired") };
    }
    if (!isValidEnvironmentVariableName(name)) {
      return { env: {}, error: t("settings.agentEnvironment.invalidName", { name }) };
    }
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      return { env: {}, error: t("settings.agentEnvironment.duplicateName", { name }) };
    }
    env[name] = row.value;
  }

  return { env, error: null };
}

export function createAgentProviderSettingsForm(provider?: ConfiguredAgentProviderSettings): AgentProviderSettingsForm {
  return {
    argsText: provider?.args.join("\n") ?? "",
    command: provider?.command ?? "",
    description: provider?.description ?? "",
    id: provider?.id ?? getUniqueAgentProviderId("my-agent", []),
    installCommand: provider?.installCommand ?? "",
    label: provider?.label ?? "",
    logoDataUrl: provider?.logoDataUrl ?? "",
    modelsText: provider?.models.map((model) => model.model).join("\n") ?? "",
    originalId: provider?.id,
    timeoutMs: provider?.timeoutMs ? String(provider.timeoutMs) : "",
    transport: provider?.transport ?? normalizeConfiguredAgentProviderTransport(undefined, provider?.url, provider?.command),
    url: provider?.url ?? ""
  };
}

export function createBlankAgentProviderSettingsForm(configuredProviders: ConfiguredAgentProviderSettings[], runtimeProviders: AgentProviderOption[]): AgentProviderSettingsForm {
  return {
    argsText: "",
    command: "",
    description: "",
    id: getUniqueAgentProviderId("my-agent", [...configuredProviders.map((provider) => provider.id), ...runtimeProviders.map((provider) => provider.id)]),
    installCommand: "",
    label: "",
    logoDataUrl: "",
    modelsText: "",
    timeoutMs: "",
    transport: "stdio",
    url: ""
  };
}

export function createSubagentSettingsForm(subagent?: ConfiguredSubagentSettings, providers: AgentProviderOption[] = []): SubagentSettingsForm {
  const providerId = subagent?.providerId ?? providers[0]?.id ?? "codex";
  return getAdaptedSubagentSettingsForm({
    approvalMode: subagent?.approvalMode ?? "request",
    description: subagent?.description ?? "",
    effort: subagent?.effort ?? "medium",
    id: subagent?.id ?? getUniqueAgentProviderId("reviewer", []),
    label: subagent?.label ?? "",
    model: subagent?.model ?? "",
    originalId: subagent?.id,
    providerId,
    speed: subagent?.speed ?? "default",
    systemPrompt: subagent?.systemPrompt ?? "",
    toolsText: stringifySubagentTools(subagent?.mcpServers)
  }, providers);
}

export function createBlankSubagentSettingsForm(subagents: ConfiguredSubagentSettings[], providers: AgentProviderOption[]): SubagentSettingsForm {
  return getAdaptedSubagentSettingsForm({
    approvalMode: "request",
    description: "",
    effort: "medium",
    id: getUniqueAgentProviderId("reviewer", subagents.map((subagent) => subagent.id)),
    label: "",
    model: "",
    providerId: providers[0]?.id ?? "codex",
    speed: "default",
    systemPrompt: "",
    toolsText: ""
  }, providers);
}

export function updateSubagentSettingsFormValue(
  form: SubagentSettingsForm,
  key: keyof SubagentSettingsForm,
  value: string,
  providers: AgentProviderOption[]
): SubagentSettingsForm {
  const nextForm = { ...form, [key]: value } as SubagentSettingsForm;
  if (key === "providerId") {
    const nextProvider = providers.find((provider) => provider.id === value);
    nextForm.model = nextProvider?.models.length ? getDefaultAgentModel(nextProvider) : "";
  }
  return getAdaptedSubagentSettingsForm(nextForm, providers);
}

export function getAdaptedSubagentSettingsForm(form: SubagentSettingsForm, providers: AgentProviderOption[]): SubagentSettingsForm {
  const provider = providers.find((option) => option.id === form.providerId) ?? providers[0] ?? null;
  const providerId = provider?.id ?? form.providerId;
  const modelOptions = provider?.models ?? [];
  const model = provider && modelOptions.length
    ? getValidAgentModel(form.model, providers, providerId)
    : form.model.trim();
  const effort = getValidAgentEffort(normalizeAgentEffort(form.effort), model, modelOptions, provider);
  const speed = getValidAgentSpeed(normalizeAgentSpeed(form.speed), model, modelOptions, provider);

  return {
    ...form,
    effort,
    model,
    providerId,
    speed
  };
}

function stringifySubagentTools(mcpServers: AgentMcpServerMap | undefined): string {
  if (!mcpServers || Object.keys(mcpServers).length === 0) return "";
  return JSON.stringify({ mcpServers }, null, 2);
}

export function getConfiguredSubagentFromForm(
  form: SubagentSettingsForm,
  configuredSubagents: ConfiguredSubagentSettings[],
  providers: AgentProviderOption[],
  t: TFunction
): { error: string | null; subagent: ConfiguredSubagentSettings | null } {
  const label = form.label.trim();
  const description = form.description.trim();
  const systemPrompt = form.systemPrompt.trim();
  const id = form.originalId?.trim() || getUniqueSubagentIdFromLabel(label, configuredSubagents.map((subagent) => subagent.id));
  const providerId = form.providerId.trim();

  if (!label) return { error: t("settings.subagents.labelRequired"), subagent: null };
  if (!description) return { error: t("settings.subagents.descriptionRequired"), subagent: null };
  if (!systemPrompt) return { error: t("settings.subagents.systemPromptRequired"), subagent: null };
  if (!form.originalId && configuredSubagents.some((subagent) => subagent.id === id)) {
    return { error: t("settings.subagents.duplicateId", { id }), subagent: null };
  }
  if (!providerId || !providers.some((provider) => provider.id === providerId)) {
    return { error: t("settings.subagents.providerRequired"), subagent: null };
  }

  const provider = providers.find((candidate) => candidate.id === providerId) ?? null;
  const modelOptions = provider?.models ?? [];
  const model = provider && modelOptions.length
    ? getValidAgentModel(form.model, providers, providerId)
    : form.model.trim();
  const effort = getValidAgentEffort(form.effort, model, modelOptions, provider);
  const speedOptions = getAgentSpeedOptionsForModel(model, modelOptions, provider);
  const speed = getValidAgentSpeed(form.speed, model, modelOptions, provider);
  const toolsResult = getSubagentToolsFromText(form.toolsText, t);
  if (toolsResult.error) {
    return { error: toolsResult.error, subagent: null };
  }

  return {
    error: null,
    subagent: {
      approvalMode: form.approvalMode,
      description: form.description.trim() || undefined,
      effort,
      id,
      label,
      mcpServers: toolsResult.mcpServers,
      model: model || undefined,
      providerId,
      speed: speedOptions.length && speed === "fast" ? speed : undefined,
      systemPrompt
    }
  };
}

function getSubagentToolsFromText(value: string, t: TFunction): { error: string | null; mcpServers: AgentMcpServerMap } {
  if (!value.trim()) return { error: t("settings.subagents.toolsRequired"), mcpServers: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return { error: t("settings.subagents.toolsInvalid"), mcpServers: {} };
  }

  const record = getRecord(parsed);
  const mcpServers = normalizeAgentMcpServerMap(record.mcpServers ?? record.tools ?? parsed);
  if (!Object.keys(mcpServers).length) {
    return { error: t("settings.subagents.toolsEmpty"), mcpServers: {} };
  }
  return { error: null, mcpServers };
}

function getUniqueSubagentIdFromLabel(label: string, usedIds: string[]): string {
  const normalizedLabel = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+$/g, "")
    .slice(0, 48);
  return getUniqueAgentProviderId(normalizedLabel || "subagent", usedIds);
}

export function getUniqueAgentProviderId(baseId: string, usedIds: string[]): string {
  const usedIdSet = new Set(usedIds);
  if (!usedIdSet.has(baseId)) return baseId;

  for (let index = 2; index < 100; index += 1) {
    const nextId = `${baseId}-${index}`;
    if (!usedIdSet.has(nextId)) return nextId;
  }

  return `${baseId}-${Date.now()}`;
}

export function getConfiguredAgentProviderFromForm(
  form: AgentProviderSettingsForm,
  configuredProviders: ConfiguredAgentProviderSettings[],
  runtimeProviders: AgentProviderOption[],
  t: TFunction
): { error: string | null; provider: ConfiguredAgentProviderSettings | null } {
  const existingProvider = form.originalId
    ? configuredProviders.find((provider) => provider.id === form.originalId)
    : undefined;
  const id = (form.originalId ?? form.id).trim();
  const command = form.command.trim();
  const installCommand = form.installCommand.trim();
  const label = form.label.trim() || id;
  const description = form.description.trim() || `Runs ${label} through the Agent Server Protocol.`;
  const transport = normalizeConfiguredAgentProviderTransport(form.transport, form.url.trim(), command);
  const url = form.url.trim();

  if (!id) return { error: t("settings.agents.idRequired"), provider: null };
  if (!isValidAgentProviderId(id)) return { error: t("settings.agents.invalidId", { id }), provider: null };
  if (!form.originalId && runtimeProviders.some((provider) => provider.id === id)) {
    return { error: t("settings.agents.duplicateId", { id }), provider: null };
  }
  if (!form.originalId && configuredProviders.some((provider) => provider.id === id)) {
    return { error: t("settings.agents.duplicateId", { id }), provider: null };
  }
  if ((transport === "stdio" || transport === "persistent-stdio" || transport === "ssh") && !command) {
    return { error: t("settings.agents.commandRequired"), provider: null };
  }
  if ((transport === "websocket" || transport === "webtransport" || transport === "udp" || transport === "http" || transport === "ssh") && !url) {
    return { error: t("settings.agents.urlRequired"), provider: null };
  }
  if (transport === "websocket" && !/^wss?:\/\//i.test(url)) {
    return { error: t("settings.agents.websocketUrlRequired"), provider: null };
  }
  if (transport === "ssh" && !(/^ssh:\/\//i.test(url) || isSshTargetUrl(url))) {
    return { error: t("settings.agents.sshUrlRequired"), provider: null };
  }

  const timeoutMs = form.timeoutMs.trim() ? Number(form.timeoutMs.trim()) : undefined;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    return { error: t("settings.agents.invalidTimeout"), provider: null };
  }

  return {
    error: null,
    provider: {
      args: getLinesFromText(form.argsText),
      command: command || undefined,
      description,
      env: existingProvider?.env ?? {},
      id,
      installCommand: installCommand || undefined,
      label,
      logoDataUrl: normalizeAgentLogoDataUrl(form.logoDataUrl),
      models: getConfiguredAgentModelsFromText(form.modelsText),
      timeoutMs,
      transport,
      url: url || undefined
    }
  };
}

export function isValidAgentProviderId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(id);
}

export function getLinesFromText(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index, lines) => Boolean(line) && lines.indexOf(line) === index);
}

export function getConfiguredAgentModelsFromText(value: string): ConfiguredAgentModelSettings[] {
  return getLinesFromText(value).map((model, index) => ({
    id: model,
    isDefault: index === 0 ? true : undefined,
    model
  }));
}

export function getConfiguredAgentProviderDescription(provider: ConfiguredAgentProviderSettings | undefined, runtimeProvider: AgentProviderOption | undefined): string {
  return provider?.description || runtimeProvider?.description || "";
}

export function normalizeTranscriptionConfig(config: Partial<TranscriptionConfig> | null | undefined): TranscriptionConfig {
  return {
    apiKey: config?.apiKey ?? defaultTranscriptionConfig.apiKey,
    endpoint: config?.endpoint?.trim() || defaultTranscriptionConfig.endpoint,
    language: config?.language?.trim() ?? defaultTranscriptionConfig.language,
    model: config?.model?.trim() || defaultTranscriptionConfig.model,
    prompt: config?.prompt ?? defaultTranscriptionConfig.prompt
  };
}

export function loadTranscriptionConfig(): TranscriptionConfig {
  if (typeof window === "undefined") return defaultTranscriptionConfig;

  try {
    const rawConfig = window.localStorage.getItem(transcriptionConfigStorageKey);
    if (!rawConfig) return defaultTranscriptionConfig;
    return normalizeTranscriptionConfig(JSON.parse(rawConfig) as Partial<TranscriptionConfig>);
  } catch {
    return defaultTranscriptionConfig;
  }
}

export function saveTranscriptionConfig(config: TranscriptionConfig) {
  window.localStorage.setItem(transcriptionConfigStorageKey, JSON.stringify(config));
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function normalizeSettingsPreferences(preferences: Partial<SettingsPreferences> | null | undefined): SettingsPreferences {
  return {
    autoSaveDrafts: preferences?.autoSaveDrafts ?? defaultSettingsPreferences.autoSaveDrafts,
    commandApprovals: preferences?.commandApprovals ?? defaultSettingsPreferences.commandApprovals,
    compactDensity: preferences?.compactDensity ?? defaultSettingsPreferences.compactDensity,
    confirmDangerousActions: preferences?.confirmDangerousActions ?? defaultSettingsPreferences.confirmDangerousActions,
    enablePluginMarketplace: preferences?.enablePluginMarketplace ?? defaultSettingsPreferences.enablePluginMarketplace,
    homeThemeConfig: typeof preferences?.homeThemeConfig === "string" ? preferences.homeThemeConfig : defaultSettingsPreferences.homeThemeConfig,
    networkAccess: preferences?.networkAccess ?? defaultSettingsPreferences.networkAccess,
    reduceMotion: preferences?.reduceMotion ?? defaultSettingsPreferences.reduceMotion,
    restoreLastThread: preferences?.restoreLastThread ?? defaultSettingsPreferences.restoreLastThread,
    syncIntegrations: preferences?.syncIntegrations ?? defaultSettingsPreferences.syncIntegrations,
    theme: isThemePreference(preferences?.theme) ? preferences.theme : defaultSettingsPreferences.theme
  };
}

export function loadSettingsPreferences(): SettingsPreferences {
  if (typeof window === "undefined") return defaultSettingsPreferences;

  try {
    const rawPreferences = window.localStorage.getItem(settingsPreferencesStorageKey);
    if (!rawPreferences) return defaultSettingsPreferences;
    return normalizeSettingsPreferences(JSON.parse(rawPreferences) as Partial<SettingsPreferences>);
  } catch {
    return defaultSettingsPreferences;
  }
}

export function saveSettingsPreferences(preferences: SettingsPreferences) {
  window.localStorage.setItem(settingsPreferencesStorageKey, JSON.stringify(preferences));
}

export function getAppWindowMode(): AppWindowMode {
  if (typeof window === "undefined") return "main";
  return new URLSearchParams(window.location.search).get("mode") === "small-chat" ? "small-chat" : "main";
}

export function getSmallWindowOpeningTransitionRequested() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("openingTransition") === "1";
}

export function normalizeSmallWindowOpeningGeometry(payload?: { from?: { height?: number; width?: number }; to?: { height?: number; width?: number } }): SmallWindowOpeningGeometry | null {
  const fromWidth = payload?.from?.width;
  const fromHeight = payload?.from?.height;
  const toWidth = payload?.to?.width;
  const toHeight = payload?.to?.height;

  if (
    typeof fromWidth !== "number" ||
    typeof fromHeight !== "number" ||
    typeof toWidth !== "number" ||
    typeof toHeight !== "number" ||
    fromWidth <= 0 ||
    fromHeight <= 0 ||
    toWidth <= 0 ||
    toHeight <= 0
  ) {
    return null;
  }

  return { fromHeight, fromWidth, toHeight, toWidth };
}

export function getInitialSelectedThread() {
  if (typeof window === "undefined") return newSessionThreadId;
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") !== "small-chat") return newSessionThreadId;

  const threadId = params.get("threadId");
  return threadId || newSessionThreadId;
}

export function getWorkspaceNameFromPath(workspacePath: string) {
  const normalizedPath = workspacePath.replace(/[\\/]+$/, "");
  return normalizedPath.split(/[\\/]/).pop() || "agent-app";
}

export function getDefaultProject(projects: SidebarProject[]): SidebarProject | null {
  return projects[0] ?? null;
}

export function findProjectForThread(projects: SidebarProject[], threadId: string): SidebarProject | null {
  return projects.find((project) => project.threads.some((thread) => thread.id === threadId)) ?? null;
}

export function findThreadForId(projects: SidebarProject[], threadId: string) {
  for (const project of projects) {
    const thread = project.threads.find((item) => item.id === threadId);
    if (thread) return thread;
  }

  return null;
}

export function getLatestSidebarThreadId(projects: SidebarProject[]): string {
  let latestThreadId = "";
  let latestUpdatedAt = -1;

  for (const project of projects) {
    for (const thread of project.threads) {
      const updatedAt = thread.updatedAt ?? 0;
      if (!latestThreadId || updatedAt > latestUpdatedAt) {
        latestThreadId = thread.id;
        latestUpdatedAt = updatedAt;
      }
    }
  }

  return latestThreadId;
}

export function getProjectDisplayName(project: SidebarProject | null): string {
  if (!project) return "agent-app";
  return getSidebarProjectLabel(project) || (project.path ? getWorkspaceNameFromPath(project.path) : "agent-app");
}

export function getProjectOptionLabel(project: SidebarProject): string {
  const name = getProjectDisplayName(project);
  return project.path ? `${name} · ${project.path}` : name;
}

export function resolveThemePreference(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const resolvedTheme = resolveThemePreference(preference);
  const root = document.documentElement;

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

export const shortcutModifierKeys = new Set(["Alt", "AltGraph", "Control", "Meta", "Shift"]);
export const shortcutCodeToKey = new Map<string, string>([
  ["Backslash", "Backslash"],
  ["BracketLeft", "BracketLeft"],
  ["BracketRight", "BracketRight"],
  ["Comma", "Comma"],
  ["Equal", "Equal"],
  ["Minus", "Minus"],
  ["Period", "Period"],
  ["Quote", "Quote"],
  ["Semicolon", "Semicolon"],
  ["Slash", "Slash"]
]);
export const shortcutKeyToDisplay = new Map<string, string>([
  ["Backslash", "\\"],
  ["BracketLeft", "["],
  ["BracketRight", "]"],
  ["Comma", ","],
  ["Down", "↓"],
  ["Equal", "="],
  ["Esc", "Esc"],
  ["Left", "←"],
  ["Minus", "-"],
  ["Period", "."],
  ["Plus", "+"],
  ["Quote", "'"],
  ["Right", "→"],
  ["Semicolon", ";"],
  ["Slash", "/"],
  ["Space", "Space"],
  ["Up", "↑"]
]);

export function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

export function acceleratorFromKeyboardEvent(event: KeyboardEvent<HTMLElement>): string | null {
  const key = acceleratorKeyFromKeyboardEvent(event);
  if (!key) return null;

  const isMac = isMacPlatform();
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push(isMac ? "CommandOrControl" : "Super");
  if (event.ctrlKey) modifiers.push(isMac ? "Control" : "CommandOrControl");
  if (event.altKey) modifiers.push(isMac ? "Option" : "Alt");
  if (event.shiftKey) modifiers.push("Shift");

  const uniqueModifiers = modifiers.filter((modifier, index) => modifiers.indexOf(modifier) === index);
  if (!uniqueModifiers.length) return null;
  return `${uniqueModifiers.join("+")}+${key}`;
}

export function acceleratorKeyFromKeyboardEvent(event: KeyboardEvent<HTMLElement>): string | null {
  if (shortcutModifierKeys.has(event.key)) return null;

  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) return event.key.toUpperCase();

  if (event.code === "Space") return "Space";
  if (event.key === "Enter") return "Enter";
  if (event.key === "Escape") return "Esc";
  if (event.key === "Tab") return "Tab";
  if (event.key === "Backspace") return "Backspace";
  if (event.key === "Delete") return "Delete";
  if (event.key === "Insert") return "Insert";
  if (event.key === "Home") return "Home";
  if (event.key === "End") return "End";
  if (event.key === "PageUp") return "PageUp";
  if (event.key === "PageDown") return "PageDown";
  if (event.key === "ArrowUp") return "Up";
  if (event.key === "ArrowDown") return "Down";
  if (event.key === "ArrowLeft") return "Left";
  if (event.key === "ArrowRight") return "Right";

  const mappedCode = shortcutCodeToKey.get(event.code);
  if (mappedCode) return mappedCode;

  const key = event.key.toUpperCase();
  return /^[A-Z0-9]$/.test(key) ? key : null;
}

export function formatShortcutAccelerator(accelerator: string) {
  const isMac = isMacPlatform();
  const parts = accelerator.split("+").filter(Boolean);
  const formattedParts = parts.map((part) => {
    if (part === "CommandOrControl") return isMac ? "⌘" : "Ctrl";
    if (part === "Command") return isMac ? "⌘" : "Command";
    if (part === "Control") return isMac ? "⌃" : "Ctrl";
    if (part === "Alt" || part === "Option") return isMac ? "⌥" : "Alt";
    if (part === "Shift") return isMac ? "⇧" : "Shift";
    if (part === "Super" || part === "Meta") return isMac ? "⌘" : "Super";
    return shortcutKeyToDisplay.get(part) ?? part;
  });

  return formattedParts.join(isMac ? " " : "+");
}

export function createIdleWaveform() {
  return Array.from({ length: waveformBarCount }, () => 0);
}

export function appendTranscription(currentValue: string, transcript: string) {
  if (!currentValue.trim()) return transcript;
  const spacer = /[\s\n]$/.test(currentValue) ? "" : "\n";
  return `${currentValue}${spacer}${transcript}`;
}

export function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function getPreferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

export function getDictationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function getWaveformLevel(samples: Uint8Array) {
  let peak = 0;
  let squaredTotal = 0;

  for (const sample of samples) {
    const level = Math.abs(sample - 128) / 128;
    peak = Math.max(peak, level);
    squaredTotal += level * level;
  }

  const rms = Math.sqrt(squaredTotal / samples.length);
  const signal = Math.max(peak * 0.72, rms * 2.8);
  const noiseFloor = 0.045;

  if (signal <= noiseFloor) return 0;
  return Math.min(1, Math.pow((signal - noiseFloor) * 3.2, 0.82));
}

export function appendWaveformLevel(currentBars: number[], level: number) {
  return [...currentBars.slice(1), level];
}

export function smoothWaveformLevel(currentLevel: number, nextLevel: number) {
  if (nextLevel === 0) {
    const releasedLevel = currentLevel * 0.58;
    return releasedLevel < 0.025 ? 0 : releasedLevel;
  }

  const factor = nextLevel > currentLevel ? 0.74 : 0.28;
  const smoothedLevel = currentLevel + (nextLevel - currentLevel) * factor;
  return smoothedLevel < 0.025 ? 0 : smoothedLevel;
}
