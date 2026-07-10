import type { AgentConsolePluginState, AgentMcpServerMap } from "../../shared/plugin-types";
import type {
  AutomationDefinition,
  AutomationEvent,
  AutomationListResult,
  AutomationMutationResult,
  AutomationRunResult
} from "../../shared/automation-types";
import type {
  ToolHubCatalogEntry,
  ToolHubBuiltinMcpServerId,
  ToolHubLlmSettings,
  ToolHubRegistryServerView,
  ToolHubRegistrySummary,
  ToolHubSettings,
  ToolHubUserMcpServerConfig
} from "../../shared/toolhub-types";
import type * as React from "react";

export {};

type AgentConsoleBrowserTab = {
  active: boolean;
  automationAllowed: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  favicon: string | null;
  id: string;
  isLoading: boolean;
  origin: string | null;
  originRisk: "external" | "file" | "local" | "opaque" | null;
  title: string;
  url: string;
};

type AgentConsoleBrowserUseSettings = {
  browserUseEnabled: boolean;
  coachmarkDismissed: boolean;
  hiddenHostEnabled: boolean;
  requireOriginApproval: boolean;
};

type AgentConsoleBrowserOriginState = {
  automationAllowed: boolean;
  firstVisitedAt: number;
  host: string;
  label: string;
  lastVisitedAt: number;
  origin: string;
  risk: "external" | "file" | "local" | "opaque";
  scheme: string;
  visitCount: number;
};

type AgentConsoleBrowserImportedProfile = {
  bookmarkCount: number;
  browserName: string;
  id: string;
  importedAt: number;
  name: string;
  profilePath: string;
};

type AgentConsoleBrowserProfileImportCandidate = {
  bookmarkCount: number;
  browserName: string;
  id: string;
  name: string;
  profilePath: string;
};

type AgentConsoleBrowserState = {
  activeTabId: string | null;
  hiddenHostReady: boolean;
  importedProfiles: AgentConsoleBrowserImportedProfile[];
  origins: AgentConsoleBrowserOriginState[];
  settings: AgentConsoleBrowserUseSettings;
  tabs: AgentConsoleBrowserTab[];
};

type AgentConsoleBrowserProfileImportResult = {
  bookmarkCount: number;
  importedProfile: AgentConsoleBrowserImportedProfile;
  startPageUrl?: string;
  state: AgentConsoleBrowserState;
};

type AgentConsoleBrowserBounds = {
  height: number;
  visible: boolean;
  width: number;
  x: number;
  y: number;
};

type AgentConsoleTerminalSession = {
  cols: number;
  cwd: string;
  exitCode: number | null;
  id: string;
  rows: number;
  running: boolean;
  shell: string;
  title: string;
};

type AgentConsoleTerminalState = {
  activeSessionId: string | null;
  sessions: AgentConsoleTerminalSession[];
};

type AgentConsoleTerminalOutput = {
  data: string;
  sessionId: string;
};

type AgentConsoleFileTreeEntry = {
  kind: "directory" | "file" | "symlink" | "other";
  name: string;
  path: string;
};

type AgentConsoleFileTreeRoot = {
  name: string;
  path: string;
};

type AgentConsoleFileTreeDirectory = {
  entries: AgentConsoleFileTreeEntry[];
  path: string;
  root: AgentConsoleFileTreeRoot;
};

type AgentConsoleWorkspaceTextFile = {
  content: string;
  mtimeMs: number;
  name: string;
  path: string;
  size: number;
};

type AgentConsoleGitChangedFile = {
  directory: string;
  indexStatus: string;
  kind: "added" | "conflicted" | "copied" | "deleted" | "modified" | "renamed" | "untracked";
  name: string;
  oldPath: string | null;
  path: string;
  staged: boolean;
  statusText: string;
  untracked: boolean;
  worktreeStatus: string;
};

type AgentConsoleGitCommit = {
  author: string;
  authorEmail: string;
  date: string;
  decorations: string[];
  graph: string;
  hash: string;
  parents: string[];
  paths: string[];
  shortHash: string;
  subject: string;
};

type AgentConsoleGitCommitChangedFile = {
  directory: string;
  kind: AgentConsoleGitChangedFile["kind"];
  name: string;
  oldPath: string | null;
  path: string;
  status: string;
  statusText: string;
};

type AgentConsoleGitCommitDetails = {
  branches: string[];
  files: AgentConsoleGitCommitChangedFile[];
  hash: string;
  tags: string[];
};

type AgentConsoleGitBranch = {
  current: boolean;
  name: string;
  shortHash: string;
  type: "local" | "remote";
  upstream: string | null;
};

type AgentConsoleGitShelf = {
  date: string;
  hash: string;
  message: string;
  name: string;
};

type AgentConsoleGitFileDiff = {
  language: string;
  modified: string;
  modifiedPath: string;
  original: string;
  originalPath: string;
};

type AgentConsoleGitResetMode = "hard" | "keep" | "mixed" | "soft";

type AgentConsoleGitAutosquashMode = "fixup" | "squash";

type AgentConsoleGitPatchResult = {
  canceled: boolean;
  filePath: string | null;
};

type AgentConsoleGitFilesystemPathResult = {
  path: string;
};

type AgentConsoleGitBrowserUrlResult = {
  url: string;
};

type AgentConsoleGitInteractiveRebasePlan = {
  commitHash: string;
  todo: string;
};

type AgentConsoleGitState = {
  branch: {
    ahead: number;
    behind: number;
    current: string;
    detached: boolean;
    upstream: string | null;
  };
  branches: AgentConsoleGitBranch[];
  commits: AgentConsoleGitCommit[];
  files: AgentConsoleGitChangedFile[];
  remotes: string[];
  root: string;
  shelves: AgentConsoleGitShelf[];
};

type AgentConsoleTranscriptionConfig = {
  apiKey?: string;
  endpoint?: string;
  language?: string;
  model?: string;
  prompt?: string;
};

type AgentConsoleTranscribeAudioPayload = {
  audioBuffer: ArrayBuffer;
  config?: AgentConsoleTranscriptionConfig;
  mimeType?: string;
};

type AgentConsoleTranscriptionResult = {
  text: string;
};

type AgentConsoleSettingsState = {
  agentEnvironments: Record<string, Record<string, string>>;
  disabledAgentProviders: string[];
  agentProviders: AgentConsoleConfiguredAgentProvider[];
  defaultSpotlightShortcut: string;
  registeredSpotlightShortcut: string | null;
  spotlightShortcut: string;
  subagents: AgentConsoleConfiguredSubagent[];
  toolHub: ToolHubSettings;
};

type AgentConsoleConfiguredAgentModel = {
  contextWindowTokens?: number;
  defaultReasoningEffort?: string | null;
  displayName?: string;
  hidden?: boolean;
  id: string;
  isDefault?: boolean;
  model: string;
  supportedReasoningEfforts?: string[];
};

type AgentConsoleConfiguredAgentProvider = {
  args: string[];
  command?: string;
  description: string;
  env: Record<string, string>;
  id: string;
  installCommand?: string;
  label: string;
  logoDataUrl?: string;
  models: AgentConsoleConfiguredAgentModel[];
  timeoutMs?: number;
  transport?: "stdio" | "persistent-stdio" | "websocket" | "ssh" | "webtransport" | "udp" | "http";
  url?: string;
};

type AgentConsoleConfiguredSubagent = {
  approvalMode?: AgentConsoleAgentApprovalMode;
  description?: string;
  effort?: AgentConsoleAgentReasoningEffort;
  id: string;
  label: string;
  mcpServers: AgentMcpServerMap;
  model?: string;
  providerId: string;
  speed?: AgentConsoleAgentRunSpeed;
  systemPrompt: string;
  timeoutMs?: number;
};

type AgentConsoleSmallWindowState = {
  id: number | null;
  isSmallWindow: boolean;
  minHeight: number;
  minWidth: number;
  pinned: boolean;
};

type AgentConsoleRectangle = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type AgentConsoleSmallWindowOpeningTransition = {
  durationMs: number;
  from?: AgentConsoleRectangle;
  to?: AgentConsoleRectangle;
};

type AgentConsoleAgentProviderId = string;
type AgentConsoleAgentReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type AgentConsoleAgentRunSpeed = "default" | "fast";
type AgentConsoleAgentApprovalDecision = "allow" | "allow-session" | "deny" | "cancel";
type AgentConsoleAgentApprovalMode = "request" | "auto" | "full";

type AgentConsoleAgentModelInfo = {
  contextWindowTokens?: number;
  defaultReasoningEffort?: AgentConsoleAgentReasoningEffort | null;
  displayName?: string;
  hidden?: boolean;
  id: string;
  isDefault?: boolean;
  model: string;
  supportedReasoningEfforts?: AgentConsoleAgentReasoningEffort[];
  supportedSpeeds?: AgentConsoleAgentRunSpeed[];
};

type AgentConsoleAgentProviderCapabilities = {
  approvalModes?: AgentConsoleAgentApprovalMode[];
  approvalScopes?: string[];
  artifacts?: boolean;
  concurrentRuns?: boolean;
  contentParts?: AgentConsoleAgentMessagePartType[];
  contextWindow?: boolean;
  diffs?: boolean;
  humanInput?: boolean;
  models?: boolean;
  protocolVersions?: string[];
  reasoningEfforts?: AgentConsoleAgentReasoningEffort[];
  resumeSession?: boolean;
  sessionHistory?: boolean;
  sessions?: boolean;
  slashCommands?: AgentConsoleAgentProviderSlashCommand[];
  speeds?: AgentConsoleAgentRunSpeed[];
  toolEvents?: boolean;
  transports?: string[];
};

type AgentConsoleAgentProviderSlashCommand = {
  category?: string;
  command?: string;
  description?: string;
  id?: string;
  insertText?: string;
  name: string;
  title?: string;
};

type AgentConsoleAgentProviderInfo = {
  capabilities?: AgentConsoleAgentProviderCapabilities;
  description: string;
  enabled: boolean;
  id: AgentConsoleAgentProviderId;
  kind: "app-server" | "asp" | "cli" | "sdk" | "remote";
  label: string;
  logoDataUrl?: string;
  models: AgentConsoleAgentModelInfo[];
};

type AgentConsoleAgentProviderSessionInfo = {
  createdAt?: number;
  cwd?: string;
  id: string;
  metadata?: Record<string, unknown>;
  model?: string;
  projectName?: string;
  projectPath?: string;
  providerId?: AgentConsoleAgentProviderId;
  title: string;
  updatedAt?: number;
};

type AgentConsoleAgentThreadRef = {
  createdAt: number;
  cwd: string;
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  providerId: AgentConsoleAgentProviderId;
  providerSessionId?: string;
  title: string;
  updatedAt: number;
};

type AgentConsoleAgentMessageRecord = {
  content: string;
  createdAt: number;
  id: string;
  metadata?: Record<string, unknown>;
  parts?: AgentConsoleAgentMessagePart[];
  role: "assistant" | "user";
  sourceRole?: string;
  toolEvents?: AgentConsoleAgentToolEvent[];
};

type AgentConsoleAgentMessagePartType = "artifact" | "citation" | "diff" | "plan" | "raw" | "reasoning" | "resource" | "status" | "text" | "tool";

type AgentConsoleAgentMessagePart =
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
      toolEvent: AgentConsoleAgentToolEvent;
      type: "tool";
    };

type AgentConsoleAgentToolEvent = {
  children?: AgentConsoleAgentToolEvent[];
  error?: string;
  id: string;
  input?: unknown;
  kind: string;
  metadata?: Record<string, unknown>;
  name: string;
  output?: string;
  parentId?: string;
  phase: "started" | "updated" | "delta" | "completed";
  status?: string;
};

type AgentConsoleSidebarThread = {
  active?: boolean;
  age?: string;
  id: string;
  providerId?: AgentConsoleAgentProviderId;
  title: string;
  updatedAt?: number;
  working?: boolean;
};

type AgentConsoleSidebarProject = {
  id: string;
  name: string;
  path?: string;
  removable?: boolean;
  threads: AgentConsoleSidebarThread[];
};

type AgentConsoleAgentRunEvent = {
  approvalId?: string;
  approvalOptions?: AgentConsoleAgentApprovalDecision[];
  approvalScope?: string;
  data?: string;
  durationMs?: number;
  exitCode?: number | null;
  message?: string;
  model?: string;
  method?: string;
  params?: unknown;
  part?: AgentConsoleAgentMessagePart;
  providerId: AgentConsoleAgentProviderId;
  providerSessionId?: string;
  questionId?: string;
  questions?: AgentConsoleAgentQuestion[];
  runId: string;
  threadId: string;
  timestamp: number;
  title?: string;
  toolEvent?: AgentConsoleAgentToolEvent;
  type: "run_started" | "message_part" | "message_delta" | "tool_event" | "approval_request" | "question_request" | "stdout" | "stderr" | "usage" | "run_finished" | "error";
  usage?: AgentConsoleAgentTokenUsage;
};

type AgentConsoleAgentPendingInteractionsResult = {
  approvals: AgentConsoleAgentRunEvent[];
  questions: AgentConsoleAgentRunEvent[];
  success: boolean;
};

type AgentConsoleAgentQuestionOption = {
  description?: string;
  label: string;
  preview?: string;
};

type AgentConsoleAgentQuestionControl = "dropdown" | "multi_select" | "single_select" | "text";

type AgentConsoleAgentQuestion = {
  allowCustomAnswer?: boolean;
  control?: AgentConsoleAgentQuestionControl;
  header?: string;
  id?: string;
  multiSelect?: boolean;
  options?: AgentConsoleAgentQuestionOption[];
  placeholder?: string;
  preview?: string;
  question: string;
};

type AgentConsoleAgentQuestionAnswer = {
  answer: string | string[];
  customAnswer?: string;
  header?: string;
  question: string;
  questionId?: string;
  selectedOptions?: AgentConsoleAgentQuestionOption[];
};

type AgentConsoleAgentRunResult = {
  durationMs: number;
  exitCode: number | null;
  model?: string;
  output: string;
  parts?: AgentConsoleAgentMessagePart[];
  providerId: AgentConsoleAgentProviderId;
  providerSessionId?: string;
  runId: string;
  stderr: string;
  stdout: string;
  success: boolean;
  threadId: string;
  usage?: AgentConsoleAgentTokenUsage;
};

type AgentConsoleAgentTokenUsage = {
  contextTokens?: number;
  contextWindowTokens?: number;
  inputCachedTokens: number;
  inputTokens: number;
  outputCachedTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type AgentConsoleContextWindowInfo = {
  estimatedTokens?: number;
  limitTokens?: number;
  modelLabel?: string;
  remainingTokens?: number;
  source?: "actual" | "unknown";
  usedTokens?: number;
};

type AgentConsoleUsageMetrics = AgentConsoleAgentTokenUsage & {
  cacheRate: number;
  requestCount: number;
};

type AgentConsoleUsageClientModelRow = AgentConsoleUsageMetrics & {
  clientId: string;
  clientLabel: string;
  clientPath?: string;
  model: string;
  providerId: AgentConsoleAgentProviderId;
  providerLabel: string;
};

type AgentConsoleUsageProviderModelRow = AgentConsoleUsageMetrics & {
  model: string;
  providerId: AgentConsoleAgentProviderId;
  providerLabel: string;
};

type AgentConsoleUsageProviderGroup = AgentConsoleUsageMetrics & {
  models: AgentConsoleUsageProviderModelRow[];
  providerId: AgentConsoleAgentProviderId;
  providerLabel: string;
};

type AgentConsoleUsageAnalyticsResult = {
  clientRows: AgentConsoleUsageClientModelRow[];
  providerRows: AgentConsoleUsageProviderGroup[];
  success: boolean;
  totals: AgentConsoleUsageMetrics;
};

type AgentConsoleAgentStartThreadResult = {
  success: boolean;
  thread: AgentConsoleAgentThreadRef;
};

type AgentConsoleAgentSendMessageResult = {
  eventChannel: string;
  run: AgentConsoleAgentRunResult;
  success: boolean;
  thread: AgentConsoleAgentThreadRef;
};

type AgentConsoleAgentThreadMessagesResult = {
  messages: AgentConsoleAgentMessageRecord[];
  success: boolean;
  thread: AgentConsoleAgentThreadRef;
  usage?: AgentConsoleAgentTokenUsage;
};

type AgentConsoleAgentForkThreadResult = {
  messages: AgentConsoleAgentMessageRecord[];
  projects: AgentConsoleSidebarProject[];
  success: boolean;
  thread: AgentConsoleAgentThreadRef;
};

type AgentConsoleAgentRenameThreadResult = {
  projects: AgentConsoleSidebarProject[];
  success: boolean;
  thread: AgentConsoleAgentThreadRef;
};

type AgentConsoleAgentDeleteThreadResult = {
  deleted: boolean;
  projects: AgentConsoleSidebarProject[];
  success: boolean;
  threadId: string;
};

type AgentConsoleAgentRemoveProjectResult = {
  deletedThreadIds: string[];
  projectId: string;
  projects: AgentConsoleSidebarProject[];
  removed: boolean;
  success: boolean;
};

type AgentConsoleAgentProviderCapabilitiesResult = {
  capabilities: AgentConsoleAgentProviderCapabilities;
  providerId: AgentConsoleAgentProviderId;
  success: boolean;
};

type AgentConsoleAgentProviderSessionsResult = {
  providerId: AgentConsoleAgentProviderId;
  sessions: AgentConsoleAgentProviderSessionInfo[];
  success: boolean;
};

type AgentConsoleAgentProviderSessionMessagesResult = {
  messages: AgentConsoleAgentMessageRecord[];
  providerId: AgentConsoleAgentProviderId;
  providerSessionId: string;
  success: boolean;
};

type AgentConsoleAgentRestoreProviderSessionResult = {
  messages: AgentConsoleAgentMessageRecord[];
  projects: AgentConsoleSidebarProject[];
  success: boolean;
  thread: AgentConsoleAgentThreadRef;
};

type AgentConsoleAgentListProjectsResult = {
  projects: AgentConsoleSidebarProject[];
  success: boolean;
};

type AgentConsoleAgentProjectMutationResult = {
  canceled?: boolean;
  project?: AgentConsoleSidebarProject;
  projects: AgentConsoleSidebarProject[];
  success: boolean;
};

type AgentConsoleAgentProjectBranch = {
  current: boolean;
  name: string;
  type: "local" | "remote";
};

type AgentConsoleAgentProjectBranchesResult = {
  branches: AgentConsoleAgentProjectBranch[];
  currentBranch: string;
  detached: boolean;
  isGitRepository: boolean;
  projectId: string;
  projectPath: string;
  success: boolean;
};

type AgentConsoleAttachment = {
  kind: "directory" | "file" | "other";
  name: string;
  path: string;
};

type AgentConsoleAttachmentSelectionResult = {
  attachments: AgentConsoleAttachment[];
  canceled: boolean;
  success: boolean;
};

type AgentConsoleNativeMenuItem = {
  enabled?: boolean;
  icon?: string;
  id?: string;
  label?: string;
  submenu?: AgentConsoleNativeMenuItem[];
  type?: "normal" | "separator";
};

type AgentConsoleNativeMenuPopupPayload = {
  items: AgentConsoleNativeMenuItem[];
  x?: number;
  y?: number;
};

type AgentConsoleNativeMenuResult = {
  actionId: string | null;
  success: boolean;
};

type AgentConsoleShowItemInFolderResult = {
  path: string;
  success: boolean;
};

type AgentConsoleBotGatewayTransport = "http" | "stdio";

type AgentConsoleBotGatewayConnectionInput = {
  baseUrl?: string;
  cwd?: string;
  env?: Record<string, string>;
  stateDir?: string;
  transport?: AgentConsoleBotGatewayTransport;
};

type AgentConsoleBotGatewayStatus = {
  baseUrl?: string;
  channelCount?: number;
  connected: boolean;
  conversationCount: number;
  health?: unknown;
  integrationCount?: number;
  lastError?: string;
  lastStderr?: string;
  pendingEventCount?: number;
  processing: boolean;
  startedAt?: number;
  stateDir?: string;
  transport?: AgentConsoleBotGatewayTransport;
};

type AgentConsoleBotGatewayEvent = {
  actor?: {
    displayName?: string;
    id?: string;
    isBot?: boolean;
  };
  conversation?: {
    id?: string;
    title?: string;
    type?: string;
  };
  id: string;
  integrationId: string;
  message?: {
    attachments?: unknown[];
    id?: string;
    text?: string;
    threadId?: string;
  };
  platform: string;
  tenantId: string;
  timestamp: string;
  type: string;
};

type AgentConsoleBotGatewayQueuedEvent = {
  enqueuedAt: string;
  event: AgentConsoleBotGatewayEvent;
  id: string;
};

type AgentConsoleBotGatewayEventsResult = {
  events: AgentConsoleBotGatewayQueuedEvent[];
  success: boolean;
};

type AgentConsoleBotGatewayChannelManifest = {
  authModes?: string[];
  capabilities?: {
    inbound?: {
      longPolling?: boolean;
      webhook?: boolean;
      websocket?: boolean;
    };
  };
  configSchema?: Record<string, unknown>;
  displayName?: string;
  platform: string;
  setupGuide?: unknown[];
};

type AgentConsoleBotGatewayChannelsResult = {
  channels: AgentConsoleBotGatewayChannelManifest[];
  success: boolean;
};

type AgentConsoleBotGatewayIntegration = {
  authType: string;
  config: Record<string, unknown>;
  createdAt?: string;
  credentialKeys?: string[];
  id: string;
  platform: string;
  status: string;
  tenantId: string;
  updatedAt?: string;
};

type AgentConsoleBotGatewayIntegrationsResult = {
  integrations: AgentConsoleBotGatewayIntegration[];
  success: boolean;
};

type AgentConsoleBotGatewayCreateIntegrationInput = {
  authType?: string;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  id?: string;
  platform?: string;
  status?: "active" | "disabled" | "paused";
  tenantId?: string;
};

type AgentConsoleBotGatewayCreateIntegrationResult = {
  integration: AgentConsoleBotGatewayIntegration;
  status: AgentConsoleBotGatewayStatus;
  success: boolean;
};

type AgentConsoleBotGatewayIntegrationActionResult = {
  result: unknown;
  status: AgentConsoleBotGatewayStatus;
  success: boolean;
};

type AgentConsoleBotGatewayQrLoginInput = {
  accountId?: string;
  autoStart?: boolean;
  config?: Record<string, unknown>;
  configOverride?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  force?: boolean;
  integrationId?: string;
  platform?: string;
  sessionId?: string;
  tenantId?: string;
  timeoutMs?: number;
  verifyCode?: string;
};

type AgentConsoleBotGatewayQrStartResult = {
  expiresAt?: string;
  message: string;
  mode: string;
  platform: string;
  qrCodeUrl?: string;
  raw?: unknown;
  sessionId: string;
};

type AgentConsoleBotGatewayQrWaitResult = {
  account?: {
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    displayName?: string;
    externalUserId?: string;
    providerAccountId?: string;
  };
  message: string;
  mode: string;
  platform: string;
  raw?: unknown;
  sessionId: string;
  status: string;
};

type AgentConsoleBotGatewayQrStartResponse = {
  result: AgentConsoleBotGatewayQrStartResult;
  success: boolean;
};

type AgentConsoleBotGatewayQrWaitResponse = {
  integration?: AgentConsoleBotGatewayIntegration;
  polling?: unknown;
  result: AgentConsoleBotGatewayQrWaitResult;
  status: AgentConsoleBotGatewayStatus;
  success: boolean;
  websocket?: unknown;
};

type AgentConsoleBotGatewayIntegrationStatusResult = {
  discordGateway?: unknown;
  integration: AgentConsoleBotGatewayIntegration;
  polling?: unknown;
  socket?: unknown;
  success: boolean;
  websocket?: unknown;
};

type AgentConsoleBotGatewayProcessInput = {
  ackBotMessages?: boolean;
  approvalMode?: AgentConsoleAgentApprovalMode;
  cwd?: string;
  effort?: AgentConsoleAgentReasoningEffort;
  limit?: number;
  model?: string;
  projectId?: string;
  projectName?: string;
  projectPath?: string;
  providerId?: string;
  timeoutMs?: number;
};

type AgentConsoleBotGatewayProcessedEvent = {
  acked: boolean;
  delivery?: {
    errorCode?: string;
    errorMessage?: string;
    id: string;
    integrationId: string;
    platform: string;
    platformMessageId?: string;
    status: string;
  };
  error?: string;
  eventId: string;
  output?: string;
  skipped?: boolean;
  threadId?: string;
};

type AgentConsoleBotGatewayProcessResult = {
  processed: AgentConsoleBotGatewayProcessedEvent[];
  status: AgentConsoleBotGatewayStatus;
  success: boolean;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        allowpopups?: boolean | string;
        partition?: string;
        src?: string;
        webpreferences?: string;
      };
    }
  }

  interface Window {
    agentConsole?: {
      agent: {
        abortRun(payload: { runId: string }): Promise<{ aborted: boolean; runId: string; success: boolean }>;
        addExistingProject(): Promise<AgentConsoleAgentProjectMutationResult>;
        checkoutProjectBranch(payload: {
          branchName: string;
          projectId?: string;
          projectPath?: string;
        }): Promise<AgentConsoleAgentProjectBranchesResult>;
        createBlankProject(payload?: { name?: string }): Promise<AgentConsoleAgentProjectMutationResult>;
        deleteThread(payload: { threadId: string }): Promise<AgentConsoleAgentDeleteThreadResult>;
        forkThread(payload: { messageId: string; threadId: string; title?: string }): Promise<AgentConsoleAgentForkThreadResult>;
        getProviderCapabilities(payload: { providerId: string }): Promise<AgentConsoleAgentProviderCapabilitiesResult>;
        getProviderSessionMessages(payload: {
          providerId: string;
          providerSessionId: string;
        }): Promise<AgentConsoleAgentProviderSessionMessagesResult>;
        getThreadMessages(payload: { threadId: string }): Promise<AgentConsoleAgentThreadMessagesResult>;
        getUsageAnalytics(): Promise<AgentConsoleUsageAnalyticsResult>;
        listProjectBranches(payload?: {
          projectId?: string;
          projectPath?: string;
        }): Promise<AgentConsoleAgentProjectBranchesResult>;
        listProjects(): Promise<AgentConsoleAgentListProjectsResult>;
        listPendingInteractions(): Promise<AgentConsoleAgentPendingInteractionsResult>;
        listProviderSessions(payload: {
          projectId?: string;
          projectPath?: string;
          providerId: string;
        }): Promise<AgentConsoleAgentProviderSessionsResult>;
        listProviders(): Promise<AgentConsoleAgentProviderInfo[]>;
        onEvent(callback: (payload: AgentConsoleAgentRunEvent) => void): () => void;
        renameThread(payload: { threadId: string; title: string }): Promise<AgentConsoleAgentRenameThreadResult>;
        removeProject(payload: { projectId: string; projectPath?: string }): Promise<AgentConsoleAgentRemoveProjectResult>;
        restoreProviderSession(payload: {
          projectId?: string;
          projectPath?: string;
          providerId: string;
          providerSessionId: string;
          title?: string;
        }): Promise<AgentConsoleAgentRestoreProviderSessionResult>;
        resolveApproval(payload: {
          approvalId: string;
          decision: AgentConsoleAgentApprovalDecision;
          message?: string;
        }): Promise<{ approvalId: string; decision: AgentConsoleAgentApprovalDecision; message?: string; resolved: boolean; success: boolean }>;
        resolveQuestion(payload: {
          answers?: AgentConsoleAgentQuestionAnswer[];
          canceled?: boolean;
          questionId: string;
          result?: unknown;
          unanswered?: boolean;
        }): Promise<{ questionId: string; resolved: boolean; success: boolean }>;
        sendMessage(payload: {
          agentCommand?: string;
          args?: string[];
          approvalMode?: AgentConsoleAgentApprovalMode;
          attachments?: AgentConsoleAttachment[];
          browserMcpUrl?: string;
          commandPath?: string;
          content?: string;
          contextWindow?: AgentConsoleContextWindowInfo;
          cwd?: string;
          effort?: AgentConsoleAgentReasoningEffort;
          env?: Record<string, string>;
          injectBrowserMcp?: boolean;
          injectToolHubMcp?: boolean;
          message?: string;
          mcpServers?: AgentMcpServerMap;
          model?: string;
          prompt?: string;
          providerId?: AgentConsoleAgentProviderId | "claude" | "openai-codex";
          providerSessionId?: string;
          speed?: AgentConsoleAgentRunSpeed;
          subagentIds?: string[];
          threadId?: string;
          timeoutMs?: number;
          title?: string;
        }): Promise<AgentConsoleAgentSendMessageResult>;
        startThread(payload?: {
          cwd?: string;
          prompt?: string;
          projectId?: string;
          projectName?: string;
          projectPath?: string;
          providerId?: AgentConsoleAgentProviderId | "claude" | "openai-codex";
          providerSessionId?: string;
          threadId?: string;
          title?: string;
        }): Promise<AgentConsoleAgentStartThreadResult>;
      };
      automations: {
        create(payload: Partial<AutomationDefinition>): Promise<AutomationMutationResult>;
        delete(payload: { id: string } | string): Promise<AutomationMutationResult>;
        list(): Promise<AutomationListResult>;
        onEvent(callback: (payload: AutomationEvent) => void): () => void;
        runNow(payload: { id: string } | string): Promise<AutomationRunResult>;
        setEnabled(payload: { enabled: boolean; id: string }): Promise<AutomationMutationResult>;
        update(payload: Partial<AutomationDefinition> & { id: string }): Promise<AutomationMutationResult>;
      };
      browser: {
        activateTab(tabId: string): Promise<AgentConsoleBrowserState>;
        callAutomationTool(payload: { input?: unknown; name: string }): Promise<unknown>;
        closeTab(tabId: string): Promise<AgentConsoleBrowserState>;
        createTab(url?: string): Promise<AgentConsoleBrowserState>;
        dismissCoachmark(): Promise<AgentConsoleBrowserState>;
        getAutomationMcpAddress(): Promise<string | null>;
        getState(): Promise<AgentConsoleBrowserState>;
        goBack(): Promise<AgentConsoleBrowserState>;
        goForward(): Promise<AgentConsoleBrowserState>;
        importProfile(payload: { candidateId?: string; profilePath?: string }): Promise<AgentConsoleBrowserProfileImportResult>;
        listProfileImportCandidates(): Promise<AgentConsoleBrowserProfileImportCandidate[]>;
        navigate(payload: { tabId?: string; url: string }): Promise<AgentConsoleBrowserState>;
        onStateChange(callback: (payload: AgentConsoleBrowserState) => void): () => void;
        reload(): Promise<AgentConsoleBrowserState>;
        setBounds(bounds: AgentConsoleBrowserBounds): Promise<AgentConsoleBrowserState>;
        setOriginAutomationAllowed(payload: { allowed: boolean; origin: string }): Promise<AgentConsoleBrowserState>;
        setTheme(theme: "dark" | "light"): Promise<AgentConsoleBrowserState>;
        updateSettings(payload: Partial<AgentConsoleBrowserUseSettings>): Promise<AgentConsoleBrowserState>;
        stop(): Promise<AgentConsoleBrowserState>;
      };
      bot: {
        connect(payload?: AgentConsoleBotGatewayConnectionInput): Promise<{ status: AgentConsoleBotGatewayStatus; success: boolean }>;
        createIntegration(payload?: AgentConsoleBotGatewayCreateIntegrationInput): Promise<AgentConsoleBotGatewayCreateIntegrationResult>;
        disconnect(): Promise<{ status: AgentConsoleBotGatewayStatus; success: boolean }>;
        getIntegrationStatus(payload: { integrationId: string }): Promise<AgentConsoleBotGatewayIntegrationStatusResult>;
        getStatus(): Promise<AgentConsoleBotGatewayStatus>;
        listChannels(): Promise<AgentConsoleBotGatewayChannelsResult>;
        listEvents(payload?: { limit?: number }): Promise<AgentConsoleBotGatewayEventsResult>;
        listIntegrations(): Promise<AgentConsoleBotGatewayIntegrationsResult>;
        processNext(payload?: AgentConsoleBotGatewayProcessInput): Promise<AgentConsoleBotGatewayProcessResult>;
        startIntegration(payload: { integrationId: string }): Promise<AgentConsoleBotGatewayIntegrationActionResult>;
        startQrLogin(payload?: AgentConsoleBotGatewayQrLoginInput): Promise<AgentConsoleBotGatewayQrStartResponse>;
        stopIntegration(payload: { integrationId: string }): Promise<AgentConsoleBotGatewayIntegrationActionResult>;
        waitQrLogin(payload?: AgentConsoleBotGatewayQrLoginInput): Promise<AgentConsoleBotGatewayQrWaitResponse>;
      };
      clipboard: {
        writeText(text: string): Promise<void>;
      };
      workspace: {
        setActiveProject(payload: { cwd?: string; projectId?: string; projectPath?: string }): Promise<{ cwd: string | null; success: boolean }>;
      };
      files: {
        chooseAttachments(payload?: { defaultPath?: string }): Promise<AgentConsoleAttachmentSelectionResult>;
        createFile(payload: { content?: string; cwd?: string; path: string; projectPath?: string }): Promise<AgentConsoleWorkspaceTextFile>;
        getRoot(payload?: { cwd?: string; projectPath?: string }): Promise<AgentConsoleFileTreeRoot>;
        readDirectory(payload?: { cwd?: string; path?: string; projectPath?: string }): Promise<AgentConsoleFileTreeDirectory>;
        readFile(payload: { cwd?: string; path: string; projectPath?: string }): Promise<AgentConsoleWorkspaceTextFile>;
        writeFile(payload: { content: string; cwd?: string; path: string; projectPath?: string }): Promise<AgentConsoleWorkspaceTextFile>;
      };
      ipc: {
        invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
        send(channel: string, ...args: unknown[]): void;
        on(channel: string, callback: (payload: unknown) => void): () => void;
      };
      nativeMenu: {
        popup(payload: AgentConsoleNativeMenuPopupPayload): Promise<AgentConsoleNativeMenuResult>;
      };
      git: {
        applyShelf(name: string): Promise<AgentConsoleGitState>;
        checkoutBranch(branchName: string): Promise<AgentConsoleGitState>;
        checkoutRevision(commitHash: string): Promise<AgentConsoleGitState>;
        cherryPickCommit(commitHash: string): Promise<AgentConsoleGitState>;
        commit(payload: { allPaths: string[]; amend?: boolean; message: string; paths: string[]; push?: boolean }): Promise<AgentConsoleGitState>;
        compareWithLocal(commitHash: string): Promise<string>;
        createAutosquashCommit(payload: { allPaths: string[]; commitHash: string; mode: AgentConsoleGitAutosquashMode; paths: string[] }): Promise<AgentConsoleGitState>;
        createBranchAtCommit(payload: { commitHash: string; name: string }): Promise<AgentConsoleGitState>;
        createPatch(commitHash: string): Promise<AgentConsoleGitPatchResult>;
        createShelf(payload: { message: string; paths: string[] }): Promise<AgentConsoleGitState>;
        createTagAtCommit(payload: { commitHash: string; name: string }): Promise<AgentConsoleGitState>;
        discard(payload: { paths: string[] }): Promise<AgentConsoleGitState>;
        dropCommit(commitHash: string): Promise<AgentConsoleGitState>;
        dropShelf(name: string): Promise<AgentConsoleGitState>;
        editCommitMessage(payload: { commitHash: string; message: string }): Promise<AgentConsoleGitState>;
        fetch(): Promise<AgentConsoleGitState>;
        getCommitDetails(commitHash: string): Promise<AgentConsoleGitCommitDetails>;
        getDiff(payload: { commitHash?: string; path?: string; untracked?: boolean }): Promise<string>;
        getFileDiff(payload: { commitHash?: string; oldPath?: string | null; path: string; untracked?: boolean }): Promise<AgentConsoleGitFileDiff>;
        getInteractiveRebasePlan(commitHash: string): Promise<AgentConsoleGitInteractiveRebasePlan>;
        getLog(payload?: { author?: string | null; branch?: string | null; date?: "all" | "month" | "today" | "week" | null; path?: string | null }): Promise<AgentConsoleGitCommit[]>;
        getState(): Promise<AgentConsoleGitState>;
        mergeBranch(branchName: string): Promise<AgentConsoleGitState>;
        pull(payload?: { rebase?: boolean }): Promise<AgentConsoleGitState>;
        push(): Promise<AgentConsoleGitState>;
        pushUpToCommit(commitHash: string): Promise<AgentConsoleGitState>;
        rebaseBranch(branchName: string): Promise<AgentConsoleGitState>;
        resetCurrentBranchToCommit(payload: { commitHash: string; mode: AgentConsoleGitResetMode }): Promise<AgentConsoleGitState>;
        revertCommit(commitHash: string): Promise<AgentConsoleGitState>;
        runInteractiveRebase(payload: { commitHash: string; todo: string }): Promise<AgentConsoleGitState>;
        showRepositoryAtRevision(commitHash: string): Promise<AgentConsoleGitFilesystemPathResult>;
        stage(payload: { paths: string[] }): Promise<AgentConsoleGitState>;
        undoCommit(commitHash: string): Promise<AgentConsoleGitState>;
        unstage(payload: { paths: string[] }): Promise<AgentConsoleGitState>;
        viewCommitInBrowser(commitHash: string): Promise<AgentConsoleGitBrowserUrlResult>;
      };
      shell: {
        getEnvironment(): Promise<{
          appName: string;
          version: string;
          platform: string;
          userData: string;
        }>;
        showItemInFolder(payload: { path: string }): Promise<AgentConsoleShowItemInFolderResult>;
        startThread(payload: unknown): Promise<AgentConsoleAgentStartThreadResult>;
        sendMessage(payload: unknown): Promise<AgentConsoleAgentSendMessageResult>;
        runCommand(payload: unknown): Promise<unknown>;
        updateSetting(payload: unknown): Promise<{ success: boolean; payload: unknown }>;
      };
      settings: {
        get(): Promise<AgentConsoleSettingsState>;
        resetSpotlightShortcut(): Promise<AgentConsoleSettingsState>;
        setAgentEnvironment(payload: { env: Record<string, string>; providerId: string }): Promise<AgentConsoleSettingsState>;
        setAgentProviderEnabled(payload: { enabled: boolean; providerId: string }): Promise<AgentConsoleSettingsState>;
        setAgentProviders(payload: { providers: AgentConsoleConfiguredAgentProvider[] }): Promise<AgentConsoleSettingsState>;
        setSubagents(payload: { subagents: AgentConsoleConfiguredSubagent[] }): Promise<AgentConsoleSettingsState>;
        setSpotlightShortcut(payload: { accelerator: string }): Promise<AgentConsoleSettingsState>;
      };
      plugins: {
        disable(payload: { id?: string; pluginId?: string } | string): Promise<AgentConsolePluginState>;
        enable(payload: { id?: string; permissionIds?: string[]; pluginId?: string } | string): Promise<AgentConsolePluginState>;
        get(): Promise<AgentConsolePluginState>;
        grantPermissions(payload: { id?: string; permissionIds: string[]; pluginId?: string }): Promise<AgentConsolePluginState>;
        install(payload: {
          enable?: boolean;
          grantPermissions?: string[];
          id?: string;
          manifestPath?: string;
          packagePath?: string;
          path?: string;
          permissionIds?: string[];
          pluginId?: string;
        }): Promise<AgentConsolePluginState>;
        onCommand(callback: (payload: { commandId?: string }) => void): () => void;
        reload(): Promise<AgentConsolePluginState>;
        revokePermissions(payload: { id?: string; permissionIds: string[]; pluginId?: string }): Promise<AgentConsolePluginState>;
        setConfiguration(payload: { id?: string; pluginId?: string; values: Record<string, unknown> }): Promise<AgentConsolePluginState>;
        uninstall(payload: { id?: string; pluginId?: string } | string): Promise<AgentConsolePluginState>;
        update(payload: {
          enable?: boolean;
          grantPermissions?: string[];
          id?: string;
          manifestPath?: string;
          packagePath?: string;
          path?: string;
          permissionIds?: string[];
          pluginId?: string;
        }): Promise<AgentConsolePluginState>;
      };
      smallWindow: {
        close(): Promise<{ success: boolean }>;
        create(payload?: { threadId?: string }): Promise<AgentConsoleSmallWindowState>;
        getState(): Promise<AgentConsoleSmallWindowState>;
        notifyOpeningTransitionReady(): Promise<AgentConsoleSmallWindowState>;
        onOpeningTransitionStart(callback: (payload: AgentConsoleSmallWindowOpeningTransition) => void): () => void;
        setPinned(payload: { pinned: boolean }): Promise<AgentConsoleSmallWindowState>;
      };
      voice: {
        transcribeAudio(payload: AgentConsoleTranscribeAudioPayload): Promise<AgentConsoleTranscriptionResult>;
      };
      terminal: {
        activateSession(sessionId: string): Promise<AgentConsoleTerminalState>;
        closeSession(sessionId: string): Promise<AgentConsoleTerminalState>;
        createSession(options?: { cols?: number; cwd?: string; rows?: number }): Promise<AgentConsoleTerminalState>;
        getBacklog(sessionId?: string): Promise<string>;
        getState(options?: { cwd?: string }): Promise<AgentConsoleTerminalState>;
        killSession(sessionId?: string): Promise<AgentConsoleTerminalState>;
        onOutput(callback: (payload: AgentConsoleTerminalOutput) => void): () => void;
        onStateChange(callback: (payload: AgentConsoleTerminalState) => void): () => void;
        resize(payload: { cols: number; rows: number; sessionId: string }): Promise<AgentConsoleTerminalState>;
        write(payload: { data: string; sessionId: string }): Promise<AgentConsoleTerminalState>;
      };
      toolhub: {
        clearCache(): Promise<{ ok: true }>;
        getSettings(): Promise<ToolHubSettings>;
        installServer(payload: ToolHubUserMcpServerConfig): Promise<{ servers: ToolHubRegistryServerView[]; summary: ToolHubRegistrySummary; tools: ToolHubCatalogEntry[] }>;
        listServers(): Promise<{ servers: ToolHubRegistryServerView[]; summary: ToolHubRegistrySummary }>;
        listTools(): Promise<{ summary: ToolHubRegistrySummary; tools: ToolHubCatalogEntry[] }>;
        removeServer(payload: { id: string }): Promise<{ servers: ToolHubRegistryServerView[]; summary: ToolHubRegistrySummary; tools: ToolHubCatalogEntry[] }>;
        refresh(): Promise<{ servers: ToolHubRegistryServerView[]; summary: ToolHubRegistrySummary; tools: ToolHubCatalogEntry[] }>;
        setBuiltinMcpServerEnabled(payload: { enabled: boolean; id: ToolHubBuiltinMcpServerId }): Promise<{ servers: ToolHubRegistryServerView[]; summary: ToolHubRegistrySummary; tools: ToolHubCatalogEntry[] }>;
        setEnabled(payload: { enabled: boolean }): Promise<{ servers: ToolHubRegistryServerView[]; summary: ToolHubRegistrySummary; tools: ToolHubCatalogEntry[] }>;
        setLlmConfig(payload: ToolHubLlmSettings): Promise<ToolHubSettings>;
        updateServer(payload: ToolHubUserMcpServerConfig): Promise<{ servers: ToolHubRegistryServerView[]; summary: ToolHubRegistrySummary; tools: ToolHubCatalogEntry[] }>;
      };
    };
  }
}
