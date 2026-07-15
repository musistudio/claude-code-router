import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { AnimatePresence, MotionConfig } from "motion/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentConsolePluginState } from "../../../shared/plugin-types";
import { hasSidebarThread, type SidebarProject, type SidebarThread } from "../../../shared/sidebar-data";
import type { ToolHubBuiltinMcpServerId, ToolHubLlmSettings, ToolHubUserMcpServerConfig } from "../../../shared/toolhub-types";
import { ChatbotPage } from "./components/chat";
import {
  ActiveStream,
  AgentApprovalPrompt,
  AgentQuestionPrompt,
  AgentQuestionResponse,
  AgentProviderOption,
  appendTextMessagePart,
  applyThemePreference,
  AppPage,
  AppSettingsState,
  ChatAgentApprovalDecision,
  ChatAgentApprovalMode,
  ChatAgentEffort,
  ChatAgentProviderId,
  ChatAgentSpeed,
  ChatAgentRunEvent,
  ChatAttachment,
  ChatMessage,
  buildAgentSubagentRuntimePayload,
  ConfiguredAgentProviderSettings,
  ConfiguredSubagentSettings,
  createBlankSubagentSettingsForm,
  createMessageId,
  createSlashCommands,
  defaultAppSettingsState,
  defaultPluginState,
  defaultProjectBranchState,
  defaultRightSidebarTabId,
  defaultSmallWindowState,
  findThreadForId,
  formatConversationMarkdown,
  formatShortcutAccelerator,
  getAgentContextWindowInfo,
  getAgentEffortForRequest,
  getAgentEffortOptionsForModel,
  getAgentModelOptions,
  getAgentProviderByLabel,
  getConfiguredSubagentFromForm,
  getAgentProviderLabel,
  getAgentProviderLogoDataUrl,
  getAgentSpeedForRequest,
  getAgentSpeedOptionsForModel,
  getAppWindowMode,
  getContextWindowMetrics,
  getDefaultAgentModel,
  getDefaultProject,
  getEnabledAgentProviders,
  getFallbackAgentProviderOptions,
  getInitialSelectedThread,
  getProjectDisplayName,
  getSmallWindowOpeningTransitionRequested,
  getValidAgentEffort,
  getValidAgentModel,
  getValidAgentSpeed,
  leftSidebarBounds,
  loadSettingsPreferences,
  loadTranscriptionConfig,
  mergeAttachments,
  newSessionThreadId,
  normalizeAgentEffort,
  normalizeAgentSpeed,
  normalizeAgentProviderCapabilities,
  normalizeAgentProviderInfo,
  normalizeAppSettingsState,
  normalizeMessagePart,
  normalizeMessageParts,
  normalizePluginState,
  normalizeSmallWindowOpeningGeometry,
  normalizeTrailingToolMessageParts,
  normalizeToolEvent,
  normalizeToolEvents,
  normalizeTranscriptionConfig,
  ProjectBranchState,
  ResizeSide,
  rightSidebarBounds,
  RightSidebarState,
  RightSidebarTab,
  saveSettingsPreferences,
  saveTranscriptionConfig,
  SettingsPreferences,
  SettingsPreferenceValue,
  SettingsSectionId,
  SlashCommand,
  SmallWindowOpeningGeometry,
  SmallWindowOpeningPhase,
  smallWindowOpeningTransitionDurationMs,
  SmallWindowState,
  SubagentSettingsForm,
  TranscriptionConfig,
  updateSubagentSettingsFormValue,
  upsertMessagePartOnMessage,
  upsertToolEvent,
  upsertToolMessagePart,
  UsageTokenMetrics,
  writeClipboardText
} from "./utils/core";
import {
  ConversationSearchDialog,
  FloatingSidebarToggles,
  ProjectSidebar,
  RightSidebar,
  SmallChatWindowLayout,
  SmallChatWindowOpeningTransition,
  ThreadHeader
} from "./components/layout";
import { AutomationsPage } from "./components/automations";
import {
  AgentSettingsDialog,
  BotGatewayPage,
  SettingsPage,
  SubagentConfigurationEditor
} from "./components/settings";
import {
  resolveHomeThemeConfig,
  toHomeThemeRootStyle
} from "./utils/theme";
import {
  defaultRightSidebarPluginId,
  useRightSidebarPlugins,
  type RightSidebarPluginId
} from "./right-sidebar-plugins";

type LocalRunMessageIds = {
  assistantMessageId: string;
  threadId: string;
  userMessageId: string;
};

type PendingRunBinding = LocalRunMessageIds & {
  canceled?: boolean;
};

type PendingRunLocalMessageIds = LocalRunMessageIds & {
  runId?: string;
};

type PendingRunSnapshot = {
  activeStream?: ActiveStream;
  localRunMessages?: PendingRunLocalMessageIds;
  messages: ChatMessage[];
  threadId: string;
  updatedAt: number;
  version: 1;
};

const pendingRunSnapshotsStorageKey = "agentConsole.pendingRunSnapshots.v1";
const pendingRunSnapshotMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const appSessionStateStorageKey = "agentConsole.sessionState.v1";
const composerDraftsStorageKey = "agentConsole.composerDrafts.v1";
const layoutStateStorageKey = "agentConsole.layoutState.v1";
const composerDraftMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

type AppSessionState = {
  newSessionProjectId?: string;
  selectedThread?: string;
};

type ComposerDraft = {
  attachments: ChatAttachment[];
  selectedSubagentIds: string[];
  updatedAt: number;
  value: string;
};

type LayoutStateSnapshot = {
  leftOpen: boolean;
  leftWidth: number;
  rightOpen: boolean;
  rightSidebarState: RightSidebarState;
  rightWidth: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadAppSessionState(): AppSessionState {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(appSessionStateStorageKey) ?? "{}");
    const record = isRecord(parsed) ? parsed : {};
    return {
      newSessionProjectId: typeof record.newSessionProjectId === "string" ? record.newSessionProjectId : undefined,
      selectedThread: typeof record.selectedThread === "string" ? record.selectedThread : undefined
    };
  } catch {
    return {};
  }
}

function saveAppSessionState(state: AppSessionState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(appSessionStateStorageKey, JSON.stringify(state));
  } catch (error) {
    console.warn("[agent] Failed to persist app session state.", error);
  }
}

function getComposerDraftKey(threadId: string, projectId: string) {
  return threadId === newSessionThreadId ? `${newSessionThreadId}:${projectId || "default"}` : threadId;
}

function normalizeComposerDraft(value: unknown): ComposerDraft | null {
  const record = isRecord(value) ? value : {};
  const draftValue = typeof record.value === "string" ? record.value : "";
  const attachments = Array.isArray(record.attachments)
    ? record.attachments.filter((attachment): attachment is ChatAttachment => (
      isRecord(attachment) &&
      typeof attachment.name === "string" &&
      typeof attachment.path === "string"
    ))
    : [];
  const selectedSubagentIds = Array.isArray(record.selectedSubagentIds)
    ? record.selectedSubagentIds.filter((subagentId): subagentId is string => typeof subagentId === "string")
    : [];
  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : Date.now();

  if (!draftValue.trim() && attachments.length === 0 && selectedSubagentIds.length === 0) return null;
  return {
    attachments,
    selectedSubagentIds,
    updatedAt,
    value: draftValue
  };
}

function loadComposerDrafts(): Map<string, ComposerDraft> {
  const drafts = new Map<string, ComposerDraft>();
  if (typeof window === "undefined") return drafts;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(composerDraftsStorageKey) ?? "[]");
    const rawEntries = Array.isArray(parsed) ? parsed : [];
    const now = Date.now();
    let pruned = false;
    for (const rawEntry of rawEntries) {
      if (!Array.isArray(rawEntry) || rawEntry.length !== 2 || typeof rawEntry[0] !== "string") {
        pruned = true;
        continue;
      }
      const draft = normalizeComposerDraft(rawEntry[1]);
      if (!draft || now - draft.updatedAt > composerDraftMaxAgeMs) {
        pruned = true;
        continue;
      }
      drafts.set(rawEntry[0], draft);
    }
    if (pruned) saveComposerDrafts(drafts);
  } catch {
    try {
      window.localStorage.removeItem(composerDraftsStorageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  return drafts;
}

function saveComposerDrafts(drafts: Map<string, ComposerDraft>) {
  if (typeof window === "undefined") return;

  try {
    if (drafts.size === 0) {
      window.localStorage.removeItem(composerDraftsStorageKey);
      return;
    }
    window.localStorage.setItem(composerDraftsStorageKey, JSON.stringify([...drafts.entries()]));
  } catch (error) {
    console.warn("[agent] Failed to persist composer drafts.", error);
  }
}

function normalizeRightSidebarStateSnapshot(value: unknown): RightSidebarState {
  const record = isRecord(value) ? value : {};
  const rawTabs = Array.isArray(record.tabs) ? record.tabs : [];
  const seenTabIds = new Set<string>();
  const tabs = rawTabs
    .map((rawTab): RightSidebarTab | null => {
      const tab = isRecord(rawTab) ? rawTab : {};
      const id = typeof tab.id === "string" && tab.id.trim() ? tab.id : "";
      const pluginId = typeof tab.pluginId === "string" && tab.pluginId.trim() ? tab.pluginId : "";
      if (!id || !pluginId || seenTabIds.has(id)) return null;
      seenTabIds.add(id);
      return { id, pluginId };
    })
    .filter((tab): tab is RightSidebarTab => Boolean(tab));

  const normalizedTabs = tabs.length ? tabs : [{ id: defaultRightSidebarTabId, pluginId: defaultRightSidebarPluginId }];
  const activeTabId = typeof record.activeTabId === "string" && normalizedTabs.some((tab) => tab.id === record.activeTabId)
    ? record.activeTabId
    : normalizedTabs[0].id;

  return { activeTabId, tabs: normalizedTabs };
}

function loadLayoutState(): LayoutStateSnapshot {
  const fallback: LayoutStateSnapshot = {
    leftOpen: true,
    leftWidth: 300,
    rightOpen: false,
    rightSidebarState: {
      activeTabId: defaultRightSidebarTabId,
      tabs: [{ id: defaultRightSidebarTabId, pluginId: defaultRightSidebarPluginId }]
    },
    rightWidth: 360
  };
  if (typeof window === "undefined") return fallback;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(layoutStateStorageKey) ?? "{}");
    const record = isRecord(parsed) ? parsed : {};
    return {
      leftOpen: typeof record.leftOpen === "boolean" ? record.leftOpen : fallback.leftOpen,
      leftWidth: clampNumber(
        typeof record.leftWidth === "number" && Number.isFinite(record.leftWidth) ? record.leftWidth : fallback.leftWidth,
        leftSidebarBounds.min,
        leftSidebarBounds.max
      ),
      rightOpen: typeof record.rightOpen === "boolean" ? record.rightOpen : fallback.rightOpen,
      rightSidebarState: normalizeRightSidebarStateSnapshot(record.rightSidebarState),
      rightWidth: clampNumber(
        typeof record.rightWidth === "number" && Number.isFinite(record.rightWidth) ? record.rightWidth : fallback.rightWidth,
        rightSidebarBounds.min,
        rightSidebarBounds.max
      )
    };
  } catch {
    return fallback;
  }
}

function saveLayoutState(state: LayoutStateSnapshot) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(layoutStateStorageKey, JSON.stringify(state));
  } catch (error) {
    console.warn("[agent] Failed to persist layout state.", error);
  }
}

function mergeMessagesPreservingInFlight(baseMessages: ChatMessage[], inFlightMessages: ChatMessage[] | undefined): ChatMessage[] {
  if (!inFlightMessages?.length) return baseMessages;

  const merged = [...baseMessages];
  for (const inFlightMessage of inFlightMessages) {
    const existingIndex = merged.findIndex((message) => message.id === inFlightMessage.id);
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...inFlightMessage,
        parts: inFlightMessage.parts ?? merged[existingIndex].parts,
        toolEvents: inFlightMessage.toolEvents ?? merged[existingIndex].toolEvents
      };
      continue;
    }

    if (inFlightMessage.role === "user" && merged.some((message) => message.role === "user" && message.content === inFlightMessage.content)) {
      continue;
    }

    if (inFlightMessage.role === "assistant" && hasPersistedAssistantReplacement(baseMessages, inFlightMessages, inFlightMessage)) {
      continue;
    }

    merged.push(inFlightMessage);
  }

  return merged.sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0));
}

function shouldDiscardRecoveredInFlightMessages(baseMessages: ChatMessage[], inFlightMessages: ChatMessage[] | undefined): boolean {
  return Boolean(inFlightMessages?.some((message) => (
    message.role === "assistant" &&
    hasPersistedAssistantReplacement(baseMessages, inFlightMessages, message)
  )));
}

function hasPersistedAssistantReplacement(baseMessages: ChatMessage[], inFlightMessages: ChatMessage[], assistantMessage: ChatMessage): boolean {
  const assistantIndex = inFlightMessages.findIndex((message) => message.id === assistantMessage.id);
  if (assistantIndex < 0) return false;

  const localUserMessage = [...inFlightMessages.slice(0, assistantIndex)]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());
  if (!localUserMessage) return false;

  const baseUserIndex = baseMessages.findIndex((message) => (
    message.role === "user" &&
    message.content === localUserMessage.content
  ));
  if (baseUserIndex < 0) return false;

  return baseMessages.slice(baseUserIndex + 1).some((message) => message.role === "assistant" && messageHasVisibleContent(message));
}

function messageHasVisibleContent(message: ChatMessage): boolean {
  return Boolean(message.content.trim() || message.parts?.length || message.toolEvents?.length);
}

function removeLocalRunMessages(messages: ChatMessage[], runMessages: LocalRunMessageIds): ChatMessage[] {
  return messages.filter((message) => message.id !== runMessages.userMessageId && message.id !== runMessages.assistantMessageId);
}

function normalizeAgentMessageRecord(message: {
  content: string;
  createdAt?: number;
  id: string;
  parts?: unknown;
  role: "assistant" | "user";
  toolEvents?: unknown;
}): ChatMessage {
  return {
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    parts: normalizeMessageParts(message.parts, message.content, message.toolEvents),
    role: message.role,
    toolEvents: normalizeToolEvents(message.toolEvents)
  };
}

function loadPendingRunSnapshots(): Map<string, PendingRunSnapshot> {
  const snapshots = new Map<string, PendingRunSnapshot>();
  if (typeof window === "undefined") return snapshots;

  try {
    const rawValue = window.localStorage.getItem(pendingRunSnapshotsStorageKey);
    if (!rawValue) return snapshots;

    const parsed = JSON.parse(rawValue);
    const rawSnapshots = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.snapshots)
        ? parsed.snapshots
        : [];
    const now = Date.now();
    let pruned = false;
    for (const rawSnapshot of rawSnapshots) {
      const snapshot = normalizePendingRunSnapshot(rawSnapshot);
      if (!snapshot) {
        pruned = true;
        continue;
      }
      if (now - snapshot.updatedAt > pendingRunSnapshotMaxAgeMs) {
        pruned = true;
        continue;
      }
      snapshots.set(snapshot.threadId, snapshot);
    }

    if (pruned) {
      savePendingRunSnapshots(snapshots);
    }
  } catch {
    try {
      window.localStorage.removeItem(pendingRunSnapshotsStorageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  return snapshots;
}

function savePendingRunSnapshots(snapshots: Map<string, PendingRunSnapshot>) {
  if (typeof window === "undefined") return;

  try {
    if (snapshots.size === 0) {
      window.localStorage.removeItem(pendingRunSnapshotsStorageKey);
      return;
    }
    window.localStorage.setItem(pendingRunSnapshotsStorageKey, JSON.stringify({
      snapshots: [...snapshots.values()]
    }));
  } catch (error) {
    console.warn("[agent] Failed to persist pending run snapshots.", error);
  }
}

function normalizePendingRunSnapshot(value: unknown): PendingRunSnapshot | null {
  const record = isRecord(value) ? value : {};
  const threadId = typeof record.threadId === "string" ? record.threadId.trim() : "";
  const messages = Array.isArray(record.messages)
    ? record.messages.map(normalizePendingChatMessage).filter((message): message is ChatMessage => Boolean(message))
    : [];
  if (!threadId || messages.length === 0) return null;

  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : Date.now();

  return {
    activeStream: normalizePendingActiveStream(record.activeStream),
    localRunMessages: normalizePendingRunLocalMessages(record.localRunMessages),
    messages,
    threadId,
    updatedAt,
    version: 1
  };
}

function normalizePendingChatMessage(value: unknown): ChatMessage | null {
  const record = isRecord(value) ? value : {};
  const role = record.role === "assistant" || record.role === "user" ? record.role : null;
  const id = typeof record.id === "string" && record.id.trim() ? record.id : "";
  if (!role || !id) return null;

  const content = typeof record.content === "string" ? record.content : "";
  return {
    content,
    createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : undefined,
    id,
    parts: normalizeMessageParts(record.parts, content, record.toolEvents),
    role,
    streaming: typeof record.streaming === "boolean" ? record.streaming : undefined,
    toolEvents: normalizeToolEvents(record.toolEvents)
  };
}

function normalizePendingActiveStream(value: unknown): ActiveStream | undefined {
  const record = isRecord(value) ? value : {};
  const id = typeof record.id === "string" && record.id.trim() ? record.id : "";
  if (!id) return undefined;

  return {
    id,
    runId: typeof record.runId === "string" && record.runId ? record.runId : undefined,
    running: record.running !== false,
    streamKey: typeof record.streamKey === "number" && Number.isFinite(record.streamKey) ? record.streamKey : Date.now()
  };
}

function normalizePendingRunLocalMessages(value: unknown): PendingRunLocalMessageIds | undefined {
  const record = isRecord(value) ? value : {};
  const assistantMessageId = typeof record.assistantMessageId === "string" ? record.assistantMessageId : "";
  const threadId = typeof record.threadId === "string" ? record.threadId : "";
  const userMessageId = typeof record.userMessageId === "string" ? record.userMessageId : "";
  if (!assistantMessageId || !threadId || !userMessageId) return undefined;

  return {
    assistantMessageId,
    runId: typeof record.runId === "string" && record.runId ? record.runId : undefined,
    threadId,
    userMessageId
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createPendingMessagesMap(snapshots: Map<string, PendingRunSnapshot>): Map<string, ChatMessage[]> {
  return new Map([...snapshots].map(([threadId, snapshot]) => [threadId, snapshot.messages]));
}

function createPendingStreamsMap(snapshots: Map<string, PendingRunSnapshot>): Map<string, ActiveStream> {
  return new Map([...snapshots]
    .filter((entry): entry is [string, PendingRunSnapshot & { activeStream: ActiveStream }] => Boolean(entry[1].activeStream))
    .map(([threadId, snapshot]) => [threadId, snapshot.activeStream]));
}

function createPendingLocalRunMessagesMap(snapshots: Map<string, PendingRunSnapshot>): Map<string, LocalRunMessageIds> {
  const entries: Array<[string, LocalRunMessageIds]> = [];
  for (const snapshot of snapshots.values()) {
    if (!snapshot.localRunMessages?.runId) continue;
    entries.push([snapshot.localRunMessages.runId, {
      assistantMessageId: snapshot.localRunMessages.assistantMessageId,
      threadId: snapshot.localRunMessages.threadId,
      userMessageId: snapshot.localRunMessages.userMessageId
    }]);
  }
  return new Map(entries);
}

function findLocalRunMessagesForThread(runMessagesByRunId: Map<string, LocalRunMessageIds>, threadId: string): PendingRunLocalMessageIds | undefined {
  for (const [runId, runMessages] of runMessagesByRunId) {
    if (runMessages.threadId === threadId) {
      return { ...runMessages, runId };
    }
  }
  return undefined;
}

function App() {
  const { t } = useI18n();
  const toast = useToast();
  const appWindowMode = useMemo(() => getAppWindowMode(), []);
  const smallWindowOpeningTransitionRequested = useMemo(() => getSmallWindowOpeningTransitionRequested(), []);
  const initialSelectedThread = useMemo(() => getInitialSelectedThread(), []);
  const initialPendingRunSnapshots = useMemo(() => loadPendingRunSnapshots(), []);
  const initialAppSessionState = useMemo(() => loadAppSessionState(), []);
  const initialLayoutState = useMemo(() => loadLayoutState(), []);
  const isSmallChatWindow = appWindowMode === "small-chat";
  const [smallWindowOpeningPhase, setSmallWindowOpeningPhase] = useState<SmallWindowOpeningPhase>(
    smallWindowOpeningTransitionRequested ? "compact" : "done"
  );
  const [smallWindowOpeningGeometry, setSmallWindowOpeningGeometry] = useState<SmallWindowOpeningGeometry | null>(null);
  const [selectedThread, setSelectedThread] = useState(initialSelectedThread);
  const [activePage, setActivePage] = useState<AppPage>("chat");
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("general");
  const [leftOpen, setLeftOpen] = useState(initialLayoutState.leftOpen);
  const [rightOpen, setRightOpen] = useState(initialLayoutState.rightOpen);
  const [leftWidth, setLeftWidth] = useState(initialLayoutState.leftWidth);
  const [rightWidth, setRightWidth] = useState(initialLayoutState.rightWidth);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [resizingSide, setResizingSide] = useState<ResizeSide | null>(null);
  const nextRightPanelTabIndexRef = useRef(1);
  const [rightSidebarState, setRightSidebarState] = useState<RightSidebarState>(initialLayoutState.rightSidebarState);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeStream, setActiveStream] = useState<ActiveStream | null>(null);
  const [contextUsageByThread, setContextUsageByThread] = useState<Record<string, UsageTokenMetrics>>({});
  const [agentProviderId, setAgentProviderId] = useState<ChatAgentProviderId>("codex");
  const [agentProviders, setAgentProviders] = useState<AgentProviderOption[]>([]);
  const [agentModel, setAgentModel] = useState("");
  const [agentEffort, setAgentEffort] = useState<ChatAgentEffort>("medium");
  const [agentSpeed, setAgentSpeed] = useState<ChatAgentSpeed>("default");
  const [agentApprovalMode, setAgentApprovalMode] = useState<ChatAgentApprovalMode>("request");
  const [approvalPrompt, setApprovalPrompt] = useState<AgentApprovalPrompt | null>(null);
  const [questionPrompt, setQuestionPrompt] = useState<AgentQuestionPrompt | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ChatAttachment[]>([]);
  const [selectedSubagentIds, setSelectedSubagentIds] = useState<string[]>([]);
  const [subagentCreateDialogOpen, setSubagentCreateDialogOpen] = useState(false);
  const [subagentCreateForm, setSubagentCreateForm] = useState<SubagentSettingsForm | null>(null);
  const [subagentCreateError, setSubagentCreateError] = useState<string | null>(null);
  const [savingCreatedSubagent, setSavingCreatedSubagent] = useState(false);
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [renamingSidebarThreadId, setRenamingSidebarThreadId] = useState<string | null>(null);
  const [renamingHeaderThreadId, setRenamingHeaderThreadId] = useState<string | null>(null);
  const [projectBranchState, setProjectBranchState] = useState<ProjectBranchState>(defaultProjectBranchState);
  const [newSessionProjectId, setNewSessionProjectId] = useState(initialAppSessionState.newSessionProjectId ?? "");
  const [transcriptionConfig, setTranscriptionConfig] = useState<TranscriptionConfig>(() => loadTranscriptionConfig());
  const [settingsPreferences, setSettingsPreferences] = useState<SettingsPreferences>(() => loadSettingsPreferences());
  const [pluginState, setPluginState] = useState<AgentConsolePluginState>(defaultPluginState);
  const enabledAgentProviders = useMemo(() => getEnabledAgentProviders(agentProviders), [agentProviders]);
  const subagentProviderOptions = useMemo(
    () => enabledAgentProviders.length ? enabledAgentProviders : getFallbackAgentProviderOptions(),
    [enabledAgentProviders]
  );
  const pluginThemeConfigs = useMemo(() => pluginState.plugins.map((plugin) => plugin.theme).filter(Boolean), [pluginState.plugins]);
  const homeTheme = useMemo(
    () => resolveHomeThemeConfig(settingsPreferences.homeThemeConfig, pluginThemeConfigs),
    [pluginThemeConfigs, settingsPreferences.homeThemeConfig]
  );
  const availableRightSidebarPlugins = useRightSidebarPlugins(pluginState.rightSidebarPanels);
  useEffect(() => {
    const availablePanelIds = new Set(availableRightSidebarPlugins.map((plugin) => plugin.id));
    setRightSidebarState((currentState) => {
      const nextTabs = currentState.tabs.filter((tab) => availablePanelIds.has(tab.pluginId));
      const normalizedTabs = nextTabs.length
        ? nextTabs
        : [{ id: defaultRightSidebarTabId, pluginId: defaultRightSidebarPluginId }];
      const activeTabId = normalizedTabs.some((tab) => tab.id === currentState.activeTabId)
        ? currentState.activeTabId
        : normalizedTabs[0].id;
      if (activeTabId === currentState.activeTabId && normalizedTabs.length === currentState.tabs.length) {
        return currentState;
      }
      return { activeTabId, tabs: normalizedTabs };
    });
  }, [availableRightSidebarPlugins]);
  const [appSettings, setAppSettings] = useState<AppSettingsState>(defaultAppSettingsState);
  const [smallWindowState, setSmallWindowState] = useState<SmallWindowState>(defaultSmallWindowState);
  useEffect(() => {
    const availableSubagentIds = new Set(appSettings.subagents.map((subagent) => subagent.id));
    setSelectedSubagentIds((currentIds) => currentIds.filter((subagentId) => availableSubagentIds.has(subagentId)));
  }, [appSettings.subagents]);

  const pendingAssistantMessageIdRef = useRef<string | null>(null);
  const pendingUserMessageIdRef = useRef<string | null>(null);
  const pendingAssistantThreadIdRef = useRef<string | null>(null);
  const selectedThreadRef = useRef(selectedThread);
  const inFlightMessagesByThreadRef = useRef(createPendingMessagesMap(initialPendingRunSnapshots));
  const activeStreamsByThreadRef = useRef(createPendingStreamsMap(initialPendingRunSnapshots));
  const runMessageIdsRef = useRef(new Map<string, string>());
  const runThreadIdsRef = useRef(new Map<string, string>());
  const runLocalMessageIdsRef = useRef(createPendingLocalRunMessagesMap(initialPendingRunSnapshots));
  const pendingRunBindingsByThreadRef = useRef(new Map<string, PendingRunBinding>());
  const pendingRunSnapshotsRef = useRef(initialPendingRunSnapshots);
  const composerDraftsRef = useRef(loadComposerDrafts());
  const lastRestoredComposerDraftKeyRef = useRef<string | null>(null);
  const approvalQueueRef = useRef<AgentApprovalPrompt[]>([]);
  const questionQueueRef = useRef<AgentQuestionPrompt[]>([]);
  const ignoredApprovalPromptIdsRef = useRef(new Set<string>());
  const ignoredApprovalPromptKeysRef = useRef(new Set<string>());
  const ignoredQuestionPromptIdsRef = useRef(new Set<string>());
  const ignoredQuestionPromptKeysRef = useRef(new Set<string>());
  const resolvedInitialThreadRef = useRef(false);
  const suppressThreadHistoryLoadRef = useRef<string | null>(null);
  const selectedSidebarThread = useMemo(
    () => selectedThread === newSessionThreadId ? null : findThreadForId(projects, selectedThread),
    [projects, selectedThread]
  );
  const activeRightSidebarProject = useMemo(() => {
    if (selectedThread === newSessionThreadId) {
      return projects.find((project) => project.id === newSessionProjectId) ?? getDefaultProject(projects) ?? null;
    }

    return projects.find((project) => project.threads.some((thread) => thread.id === selectedThread)) ?? null;
  }, [newSessionProjectId, projects, selectedThread]);
  const activeAgentProviderId = selectedSidebarThread?.providerId ?? agentProviderId;
  const activeAgentProvider = agentProviders.find((provider) => provider.id === activeAgentProviderId) ?? null;
  const activeAgentProviderKind = activeAgentProvider?.kind;
  const activeAgentProviderLabel = getAgentProviderLabel(agentProviders, activeAgentProviderId);
  const activeAgentLogoDataUrl = getAgentProviderLogoDataUrl(agentProviders, activeAgentProviderId);
  const activeModelOptions = getAgentModelOptions(enabledAgentProviders, activeAgentProviderId);
  const activeAgentModel = getValidAgentModel(agentModel, enabledAgentProviders, activeAgentProviderId);
  const activeAgentEffortOptions = getAgentEffortOptionsForModel(activeAgentModel, activeModelOptions, activeAgentProvider);
  const activeAgentEffort = getValidAgentEffort(agentEffort, activeAgentModel, activeModelOptions, activeAgentProvider);
  const activeAgentSpeedOptions = getAgentSpeedOptionsForModel(activeAgentModel, activeModelOptions, activeAgentProvider);
  const activeAgentSpeed = getValidAgentSpeed(agentSpeed, activeAgentModel, activeModelOptions, activeAgentProvider);
  const activeContextUsage = contextUsageByThread[selectedThread] ?? null;
  const activePromptThreadId = selectedThread === newSessionThreadId ? null : selectedThread;
  const visibleApprovalPrompt = activePromptThreadId && approvalPrompt?.threadId === activePromptThreadId ? approvalPrompt : null;
  const visibleQuestionPrompt = activePromptThreadId && questionPrompt?.threadId === activePromptThreadId ? questionPrompt : null;
  const slashCommands = useMemo(() => createSlashCommands(pluginState, t, activeAgentProvider), [activeAgentProvider, pluginState, t]);
  const rightSidebarAgentContext = useMemo(() => ({
    activeModel: activeAgentModel,
    agentApprovalMode,
    agentEffort: activeAgentEffort,
    agentProviderId: activeAgentProviderId,
    agentProviders: enabledAgentProviders,
    project: activeRightSidebarProject,
    selectedThread: selectedSidebarThread
  }), [
    activeAgentEffort,
    activeAgentModel,
    activeAgentProviderId,
    activeRightSidebarProject,
    agentApprovalMode,
    enabledAgentProviders,
    selectedSidebarThread
  ]);

  useEffect(() => {
    void window.agentConsole?.workspace?.setActiveProject({
      projectId: activeRightSidebarProject?.id,
      projectPath: activeRightSidebarProject?.path
    }).catch((error) => {
      console.warn("[workspace] Failed to set active project.", error);
    });
  }, [activeRightSidebarProject?.id, activeRightSidebarProject?.path]);

  useEffect(() => {
    const agentApi = window.agentConsole?.agent;
    if (!agentApi || !activeAgentProviderId || !activeAgentProviderKind) return;

    let cancelled = false;
    void agentApi.getProviderCapabilities({ providerId: activeAgentProviderId })
      .then((result) => {
        if (cancelled || !result?.success) return;
        const capabilities = normalizeAgentProviderCapabilities(result.capabilities);
        setAgentProviders((currentProviders) => currentProviders.map((provider) => (
          provider.id === activeAgentProviderId
            ? { ...provider, capabilities }
            : provider
        )));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeAgentProviderId, activeAgentProviderKind]);

  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);

  const deletePendingRunSnapshot = useCallback((threadId: string) => {
    if (!threadId) return;
    pendingRunSnapshotsRef.current.delete(threadId);
    savePendingRunSnapshots(pendingRunSnapshotsRef.current);
  }, []);

  const persistPendingRunSnapshotForThread = useCallback((threadId: string) => {
    if (!threadId) return;

    const messagesForThread = inFlightMessagesByThreadRef.current.get(threadId) ?? [];
    if (!messagesForThread.length) {
      deletePendingRunSnapshot(threadId);
      return;
    }

    pendingRunSnapshotsRef.current.set(threadId, {
      activeStream: activeStreamsByThreadRef.current.get(threadId),
      localRunMessages: findLocalRunMessagesForThread(runLocalMessageIdsRef.current, threadId),
      messages: messagesForThread,
      threadId,
      updatedAt: Date.now(),
      version: 1
    });
    savePendingRunSnapshots(pendingRunSnapshotsRef.current);
  }, [deletePendingRunSnapshot]);

  const clearPendingRunStateForThread = useCallback((threadId: string) => {
    if (!threadId) return;

    inFlightMessagesByThreadRef.current.delete(threadId);
    activeStreamsByThreadRef.current.delete(threadId);
    for (const [runId, runMessages] of runLocalMessageIdsRef.current) {
      if (runMessages.threadId === threadId) {
        runLocalMessageIdsRef.current.delete(runId);
      }
    }
    deletePendingRunSnapshot(threadId);
    if (selectedThreadRef.current === threadId) {
      setActiveStream(null);
    }
  }, [deletePendingRunSnapshot]);

  const setVisibleActiveStream = useCallback((stream: ActiveStream | null, threadId = selectedThreadRef.current) => {
    if (stream) {
      activeStreamsByThreadRef.current.set(threadId, stream);
    } else {
      activeStreamsByThreadRef.current.delete(threadId);
    }
    if (selectedThreadRef.current === threadId) {
      setActiveStream(stream);
    }
    persistPendingRunSnapshotForThread(threadId);
  }, [persistPendingRunSnapshotForThread]);

  const setVisibleMessagesForThread = useCallback((threadId: string, nextMessages: ChatMessage[]) => {
    if (selectedThreadRef.current === threadId) {
      setMessages(nextMessages);
      setActiveStream(activeStreamsByThreadRef.current.get(threadId) ?? null);
    }
  }, []);

  const setInFlightMessagesForThread = useCallback((threadId: string, nextMessages: ChatMessage[]) => {
    if (nextMessages.length) {
      inFlightMessagesByThreadRef.current.set(threadId, nextMessages);
    } else {
      inFlightMessagesByThreadRef.current.delete(threadId);
    }
    persistPendingRunSnapshotForThread(threadId);
  }, [persistPendingRunSnapshotForThread]);

  const moveInFlightThreadState = useCallback((fromThreadId: string, toThreadId: string) => {
    if (!fromThreadId || !toThreadId || fromThreadId === toThreadId) return;

    const messagesForThread = inFlightMessagesByThreadRef.current.get(fromThreadId);
    if (messagesForThread) {
      inFlightMessagesByThreadRef.current.delete(fromThreadId);
      inFlightMessagesByThreadRef.current.set(toThreadId, messagesForThread);
    }

    const streamForThread = activeStreamsByThreadRef.current.get(fromThreadId);
    if (streamForThread) {
      activeStreamsByThreadRef.current.delete(fromThreadId);
      activeStreamsByThreadRef.current.set(toThreadId, streamForThread);
    }

    for (const [runId, runMessages] of runLocalMessageIdsRef.current) {
      if (runMessages.threadId === fromThreadId) {
        runLocalMessageIdsRef.current.set(runId, {
          ...runMessages,
          threadId: toThreadId
        });
      }
    }

    const pendingRunBinding = pendingRunBindingsByThreadRef.current.get(fromThreadId);
    if (pendingRunBinding) {
      pendingRunBindingsByThreadRef.current.delete(fromThreadId);
      pendingRunBindingsByThreadRef.current.set(toThreadId, {
        ...pendingRunBinding,
        threadId: toThreadId
      });
    }

    deletePendingRunSnapshot(fromThreadId);
    persistPendingRunSnapshotForThread(toThreadId);
  }, [deletePendingRunSnapshot, persistPendingRunSnapshotForThread]);

  const updateInFlightMessage = useCallback((threadId: string, messageId: string, updateMessage: (message: ChatMessage) => ChatMessage) => {
    const cachedMessages = inFlightMessagesByThreadRef.current.get(threadId) ?? [];
    const nextCachedMessages = cachedMessages.map((message) => (message.id === messageId ? updateMessage(message) : message));
    if (nextCachedMessages.length) {
      inFlightMessagesByThreadRef.current.set(threadId, nextCachedMessages);
      persistPendingRunSnapshotForThread(threadId);
    }

    if (selectedThreadRef.current !== threadId) return;

    setMessages((currentMessages) => {
      const sourceMessages = currentMessages.some((message) => message.id === messageId)
        ? currentMessages
        : mergeMessagesPreservingInFlight(currentMessages, nextCachedMessages);
      return sourceMessages.map((message) => (message.id === messageId ? updateMessage(message) : message));
    });
  }, [persistPendingRunSnapshotForThread]);

  const clearLocalRunMessages = useCallback((runId: string) => {
    const runMessages = runLocalMessageIdsRef.current.get(runId);
    if (!runMessages) return;

    runLocalMessageIdsRef.current.delete(runId);
    const cachedMessages = inFlightMessagesByThreadRef.current.get(runMessages.threadId);
    if (cachedMessages) {
      const nextCachedMessages = removeLocalRunMessages(cachedMessages, runMessages);
      setInFlightMessagesForThread(runMessages.threadId, nextCachedMessages);
    }

    activeStreamsByThreadRef.current.delete(runMessages.threadId);
    if (selectedThreadRef.current === runMessages.threadId) {
      setActiveStream(null);
    }

  }, [setInFlightMessagesForThread]);

  useEffect(() => {
    if (!activePromptThreadId) return;

    setApprovalPrompt((currentPrompt) => promoteApprovalPromptForThread(
      currentPrompt,
      approvalQueueRef.current,
      activePromptThreadId,
      ignoredApprovalPromptIdsRef.current,
      ignoredApprovalPromptKeysRef.current
    ));
    setQuestionPrompt((currentPrompt) => promoteQuestionPromptForThread(
      currentPrompt,
      questionQueueRef.current,
      activePromptThreadId,
      ignoredQuestionPromptIdsRef.current,
      ignoredQuestionPromptKeysRef.current
    ));
  }, [activePromptThreadId]);

  const reloadProjects = useCallback(async () => {
    const agentApi = window.agentConsole?.agent;
    if (!agentApi) return;

    const result = await agentApi.listProjects();
    setProjects(result.projects);
    setNewSessionProjectId((currentProjectId) => {
      if (currentProjectId && result.projects.some((project) => project.id === currentProjectId)) {
        return currentProjectId;
      }

      return result.projects[0]?.id ?? "";
    });
  }, []);

  const reloadAgentProviders = useCallback(async () => {
    const agentApi = window.agentConsole?.agent;
    if (!agentApi) return [];

    const providers = await agentApi.listProviders();
    const nextProviders = normalizeAgentProviderInfo(providers);
    const nextEnabledProviders = getEnabledAgentProviders(nextProviders);
    setAgentProviders(nextProviders);
    setAgentProviderId((currentProviderId) => {
      const selectedProvider = nextEnabledProviders.find((provider) => provider.id === currentProviderId) ?? nextEnabledProviders[0];
      setAgentModel((currentModel) => {
        if (!selectedProvider) return currentModel;
        const nextModel = selectedProvider.models.some((model) => model.value === currentModel)
          ? currentModel
          : getDefaultAgentModel(selectedProvider);
        setAgentEffort((currentEffort) => getValidAgentEffort(currentEffort, nextModel, selectedProvider.models, selectedProvider));
        setAgentSpeed((currentSpeed) => getValidAgentSpeed(currentSpeed, nextModel, selectedProvider.models, selectedProvider));
        return nextModel;
      });
      return selectedProvider?.id ?? currentProviderId;
    });

    return nextProviders;
  }, []);

  const createRightPanelTab = useCallback((panelId: RightSidebarPluginId): RightSidebarTab => {
    const index = nextRightPanelTabIndexRef.current;
    nextRightPanelTabIndexRef.current += 1;
    return { id: `right-panel-tab-${panelId}-${index}`, pluginId: panelId };
  }, []);

  const openRightPanelTab = useCallback((panelId: RightSidebarPluginId) => {
    if (!availableRightSidebarPlugins.some((plugin) => plugin.id === panelId)) return;

    setRightSidebarState((currentState) => {
      const existingTab = currentState.tabs.find((tab) => tab.pluginId === panelId);
      if (existingTab) {
        return existingTab.id === currentState.activeTabId ? currentState : { ...currentState, activeTabId: existingTab.id };
      }

      const nextTab = createRightPanelTab(panelId);
      return {
        activeTabId: nextTab.id,
        tabs: [...currentState.tabs, nextTab]
      };
    });
    setRightOpen(true);
  }, [availableRightSidebarPlugins, createRightPanelTab]);

  const runSlashCommand = useCallback((command: SlashCommand) => {
    if (command.disabled) return;

    if (command.action.type === "insert") {
      setComposerValue(command.action.text);
      return;
    }

    if (command.action.type === "open-panel") {
      openRightPanelTab(command.action.panelId);
      setComposerValue("");
      return;
    }

    toast.warning({
      content: t("slash.unavailable.description"),
      title: command.title
    });
  }, [openRightPanelTab, t, toast]);

  useEffect(() => {
    const pluginsApi = window.agentConsole?.plugins;
    const runPluginCommandById = (commandId: string) => {
      if (!commandId) return;
      const command = slashCommands.find((candidate) => candidate.id === commandId);
      if (command) runSlashCommand(command);
    };

    const onLocalPluginCommand = (event: Event) => {
      const commandId = (event as CustomEvent<{ commandId?: string }>).detail?.commandId ?? "";
      runPluginCommandById(commandId);
    };
    window.addEventListener("agent-console:plugins:command", onLocalPluginCommand);

    const disposePluginCommand = pluginsApi?.onCommand?.((payload) => {
      const commandId = payload && typeof payload === "object" && "commandId" in payload
        ? String((payload as { commandId?: unknown }).commandId ?? "")
        : "";
      runPluginCommandById(commandId);
    });

    return () => {
      window.removeEventListener("agent-console:plugins:command", onLocalPluginCommand);
      disposePluginCommand?.();
    };
  }, [runSlashCommand, slashCommands]);

  const setActiveRightPanelTab = useCallback((tabId: string) => {
    setRightSidebarState((currentState) => {
      if (currentState.activeTabId === tabId || !currentState.tabs.some((tab) => tab.id === tabId)) {
        return currentState;
      }

      return { ...currentState, activeTabId: tabId };
    });
  }, []);

  const closeRightPanelTab = useCallback((tabId: string) => {
    const tabIndex = rightSidebarState.tabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex < 0) return;

    if (rightSidebarState.tabs.length === 1) {
      setRightOpen(false);
      return;
    }

    setRightSidebarState((currentState) => {
      const currentTabIndex = currentState.tabs.findIndex((tab) => tab.id === tabId);
      if (currentTabIndex < 0 || currentState.tabs.length === 1) return currentState;

      const nextTabs = currentState.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId = currentState.activeTabId === tabId
        ? nextTabs[Math.max(0, currentTabIndex - 1)]?.id ?? nextTabs[0].id
        : currentState.activeTabId;

      return { activeTabId, tabs: nextTabs };
    });
  }, [rightSidebarState.tabs]);

  useEffect(() => {
    const onSelectRightPanel = (event: Event) => {
      openRightPanelTab((event as CustomEvent<RightSidebarPluginId>).detail);
    };

    window.addEventListener("agent-console:right-panel:select", onSelectRightPanel);
    return () => window.removeEventListener("agent-console:right-panel:select", onSelectRightPanel);
  }, [openRightPanelTab]);

  useEffect(() => {
    saveTranscriptionConfig(transcriptionConfig);
  }, [transcriptionConfig]);

  useEffect(() => {
    saveSettingsPreferences(settingsPreferences);
  }, [settingsPreferences]);

  useEffect(() => {
    saveLayoutState({
      leftOpen,
      leftWidth,
      rightOpen,
      rightSidebarState,
      rightWidth
    });
  }, [leftOpen, leftWidth, rightOpen, rightSidebarState, rightWidth]);

  useEffect(() => {
    if (!settingsPreferences.restoreLastThread) return;
    if (!resolvedInitialThreadRef.current) return;
    saveAppSessionState({
      newSessionProjectId,
      selectedThread
    });
  }, [newSessionProjectId, selectedThread, settingsPreferences.restoreLastThread]);

  useEffect(() => {
    const draftKey = getComposerDraftKey(selectedThread, newSessionProjectId);
    if (!settingsPreferences.autoSaveDrafts) {
      lastRestoredComposerDraftKeyRef.current = draftKey;
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const draftHasContent = Boolean(composerValue.trim() || composerAttachments.length || selectedSubagentIds.length);
      if (draftHasContent) {
        composerDraftsRef.current.set(draftKey, {
          attachments: composerAttachments,
          selectedSubagentIds,
          updatedAt: Date.now(),
          value: composerValue
        });
      } else {
        composerDraftsRef.current.delete(draftKey);
      }
      saveComposerDrafts(composerDraftsRef.current);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [composerAttachments, composerValue, newSessionProjectId, selectedSubagentIds, selectedThread, settingsPreferences.autoSaveDrafts]);

  useEffect(() => {
    const draftKey = getComposerDraftKey(selectedThread, newSessionProjectId);
    if (lastRestoredComposerDraftKeyRef.current === draftKey) return;
    lastRestoredComposerDraftKeyRef.current = draftKey;
    if (!settingsPreferences.autoSaveDrafts) return;

    const draft = composerDraftsRef.current.get(draftKey);
    setComposerValue(draft?.value ?? "");
    setComposerAttachments(draft?.attachments ?? []);
    setSelectedSubagentIds(draft?.selectedSubagentIds ?? []);
  }, [newSessionProjectId, selectedThread, settingsPreferences.autoSaveDrafts]);

  useEffect(() => {
    let canceled = false;
    reloadProjects().catch((error) => {
      if (!canceled) {
        console.warn("[agent] Failed to load projects.", error);
      }
    });

    return () => {
      canceled = true;
    };
  }, [reloadProjects]);

  useEffect(() => {
    let canceled = false;

    reloadAgentProviders()
      .then(() => undefined)
      .catch((error) => {
        if (!canceled) {
          console.warn("[agent] Failed to load providers.", error);
        }
      });

    return () => {
      canceled = true;
    };
  }, [reloadAgentProviders]);

  useEffect(() => {
    if (!projects.length) return;

    if (!resolvedInitialThreadRef.current) {
      resolvedInitialThreadRef.current = true;
      const savedThreadId = settingsPreferences.restoreLastThread ? initialAppSessionState.selectedThread : undefined;
      const requestedThreadId = initialSelectedThread !== newSessionThreadId
        ? initialSelectedThread
        : savedThreadId ?? newSessionThreadId;
      const nextThreadId = requestedThreadId !== newSessionThreadId && hasSidebarThread(projects, requestedThreadId)
        ? requestedThreadId
        : newSessionThreadId;

      if (nextThreadId && nextThreadId !== selectedThread) {
        setSelectedThread(nextThreadId);
        return;
      }

      if (!nextThreadId && selectedThread !== newSessionThreadId) {
        setSelectedThread(newSessionThreadId);
        return;
      }
    }

    if (
      selectedThread !== newSessionThreadId &&
      !hasSidebarThread(projects, selectedThread) &&
      suppressThreadHistoryLoadRef.current !== selectedThread
    ) {
      setSelectedThread(newSessionThreadId);
      setMessages([]);
      setActiveStream(null);
      return;
    }

  }, [initialAppSessionState.selectedThread, initialSelectedThread, projects, selectedThread, settingsPreferences.restoreLastThread]);

  useEffect(() => {
    if (selectedThread !== newSessionThreadId) return undefined;

    const selectedProject = projects.find((project) => project.id === newSessionProjectId) ?? getDefaultProject(projects);
    if (!selectedProject) {
      setProjectBranchState(defaultProjectBranchState);
      return undefined;
    }

    const agentApi = window.agentConsole?.agent;
    if (!agentApi) {
      setProjectBranchState(defaultProjectBranchState);
      return undefined;
    }

    let canceled = false;
    setProjectBranchState((currentState) => ({ ...currentState, loading: true }));
    agentApi.listProjectBranches({
      projectId: selectedProject.id,
      projectPath: selectedProject.path
    })
      .then((result) => {
        if (canceled) return;
        const branchNames = result.branches.map((branch) => branch.name);
        setProjectBranchState({
          branches: result.branches,
          currentBranch: result.currentBranch,
          detached: result.detached,
          isGitRepository: result.isGitRepository,
          loading: false,
          selectedBranch: result.currentBranch || branchNames[0] || ""
        });
      })
      .catch((error) => {
        if (canceled) return;
        console.warn("[agent] Failed to load project branches.", error);
        setProjectBranchState(defaultProjectBranchState);
      });

    return () => {
      canceled = true;
    };
  }, [newSessionProjectId, projects, selectedThread]);

  useEffect(() => {
    if (selectedThread === newSessionThreadId) {
      setMessages(inFlightMessagesByThreadRef.current.get(newSessionThreadId) ?? []);
      setActiveStream(activeStreamsByThreadRef.current.get(newSessionThreadId) ?? null);
      return undefined;
    }

    if (suppressThreadHistoryLoadRef.current === selectedThread) {
      suppressThreadHistoryLoadRef.current = null;
      return undefined;
    }

    let canceled = false;
    const agentApi = window.agentConsole?.agent;
    if (!agentApi) return undefined;

    agentApi.getThreadMessages({ threadId: selectedThread })
      .then((result) => {
        if (canceled) return;
        const historyMessages = result.messages.map(normalizeAgentMessageRecord);
        const inFlightMessages = inFlightMessagesByThreadRef.current.get(selectedThread);
        if (shouldDiscardRecoveredInFlightMessages(historyMessages, inFlightMessages)) {
          clearPendingRunStateForThread(selectedThread);
          setVisibleMessagesForThread(selectedThread, historyMessages);
        } else {
          setVisibleMessagesForThread(
            selectedThread,
            mergeMessagesPreservingInFlight(historyMessages, inFlightMessages)
          );
        }
        const usage = result.usage;
        if (usage) {
          setContextUsageByThread((currentUsageByThread) => ({
            ...currentUsageByThread,
            [selectedThread]: usage
          }));
        }
      })
      .catch((error) => {
        if (!canceled) {
          console.warn("[agent] Failed to load thread messages.", error);
          setVisibleMessagesForThread(selectedThread, inFlightMessagesByThreadRef.current.get(selectedThread) ?? []);
        }
      });

    return () => {
      canceled = true;
    };
  }, [clearPendingRunStateForThread, selectedThread, setVisibleMessagesForThread]);

  useEffect(() => {
    let canceled = false;
    const settingsApi = window.agentConsole?.settings;

    if (!settingsApi) {
      return () => {
        canceled = true;
      };
    }

    settingsApi.get()
      .then((settings) => {
        if (!canceled) setAppSettings(normalizeAppSettingsState(settings));
      })
      .catch((error) => {
        console.warn("[settings] Failed to load app settings.", error);
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const pluginsApi = window.agentConsole?.plugins;

    if (!pluginsApi) return undefined;

    pluginsApi.get()
      .then((state) => {
        if (!canceled) setPluginState(normalizePluginState(state));
      })
      .catch((error) => {
        console.warn("[plugins] Failed to load plugin state.", error);
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("agent-console:plugins:state-changed", { detail: pluginState }));
  }, [pluginState]);

  useEffect(() => {
    document.documentElement.dataset.windowMode = appWindowMode;
  }, [appWindowMode]);

  useEffect(() => {
    document.documentElement.dataset.formFactor = "desktop";
  }, []);

  useEffect(() => {
    document.documentElement.dataset.density = settingsPreferences.compactDensity ? "compact" : "comfortable";
    document.documentElement.dataset.reduceMotion = settingsPreferences.reduceMotion ? "true" : "false";
  }, [settingsPreferences.compactDensity, settingsPreferences.reduceMotion]);

  useEffect(() => {
    if (!isSmallChatWindow) return undefined;

    let canceled = false;
    const smallWindowApi = window.agentConsole?.smallWindow;
    if (!smallWindowApi) return undefined;

    smallWindowApi.getState()
      .then((state) => {
        if (!canceled) setSmallWindowState(state);
      })
      .catch((error) => {
        console.warn("[small-window] Failed to load window state.", error);
      });

    return () => {
      canceled = true;
    };
  }, [isSmallChatWindow]);

  useEffect(() => {
    if (!isSmallChatWindow || !smallWindowOpeningTransitionRequested) return undefined;

    const smallWindowApi = window.agentConsole?.smallWindow;
    let started = false;
    let doneTimer: number | null = null;

    const clearTimers = () => {
      if (doneTimer !== null) {
        window.clearTimeout(doneTimer);
        doneTimer = null;
      }
    };

    const startTransition = (payload?: { durationMs?: number; from?: { height?: number; width?: number }; to?: { height?: number; width?: number } }) => {
      if (started) return;
      started = true;

      const durationMs = typeof payload?.durationMs === "number"
        ? payload.durationMs
        : smallWindowOpeningTransitionDurationMs;
      setSmallWindowOpeningGeometry(normalizeSmallWindowOpeningGeometry(payload));
      setSmallWindowOpeningPhase("compact");
      doneTimer = window.setTimeout(() => {
        setSmallWindowOpeningPhase("done");
        doneTimer = null;
      }, durationMs + 160);
    };

    const dispose = smallWindowApi?.onOpeningTransitionStart(startTransition);
    void smallWindowApi?.notifyOpeningTransitionReady().catch((error) => {
      console.warn("[small-window] Failed to start opening transition.", error);
    });

    return () => {
      dispose?.();
      clearTimers();
    };
  }, [isSmallChatWindow, smallWindowOpeningTransitionRequested]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncTheme = () => applyThemePreference(settingsPreferences.theme);
    const colorSchemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

    syncTheme();
    colorSchemeMedia.addEventListener("change", syncTheme);

    return () => {
      colorSchemeMedia.removeEventListener("change", syncTheme);
    };
  }, [settingsPreferences.theme]);

  const activeTitle = useMemo(() => {
    if (selectedThread === newSessionThreadId) return t("newSession.title");

    for (const project of projects) {
      const thread = project.threads.find((item) => item.id === selectedThread);
      if (thread) return thread.title;
    }
    return t("app.defaultTitle");
  }, [projects, selectedThread, t]);

  const saveThreadTitle = useCallback(async (thread: SidebarThread, nextTitle: string) => {
    const agentApi = window.agentConsole?.agent;
    if (!agentApi?.renameThread) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("thread.toastTitle") });
      return;
    }

    const normalizedTitle = nextTitle.replace(/\s+/g, " ").trim();
    if (!normalizedTitle || normalizedTitle === thread.title) {
      setRenamingSidebarThreadId(null);
      setRenamingHeaderThreadId(null);
      return;
    }

    try {
      const result = await agentApi.renameThread({
        threadId: thread.id,
        title: normalizedTitle
      });
      setProjects(result.projects);
      setRenamingSidebarThreadId(null);
      setRenamingHeaderThreadId(null);
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("thread.renameFailed"),
        title: t("thread.toastTitle")
      });
    }
  }, [t, toast]);

  const startThreadRename = useCallback((thread: SidebarThread) => {
    setRenamingSidebarThreadId(thread.id);
    setRenamingHeaderThreadId(null);
  }, []);

  const renameActiveThread = useCallback(() => {
    if (!selectedSidebarThread) return;
    setRenamingSidebarThreadId(null);
    setRenamingHeaderThreadId(selectedSidebarThread.id);
  }, [selectedSidebarThread]);

  const deleteThread = useCallback(async (thread: SidebarThread) => {
    if (thread.working) return;
    const agentApi = window.agentConsole?.agent;
    if (!agentApi?.deleteThread) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("thread.toastTitle") });
      return;
    }

    if (!window.confirm(t("thread.deleteConfirm", { title: thread.title }))) return;

    try {
      const result = await agentApi.deleteThread({ threadId: thread.id });
      setProjects(result.projects);
      clearPendingRunStateForThread(thread.id);
      if (selectedThread === thread.id) {
        setSelectedThread(newSessionThreadId);
        setActivePage("chat");
        setMessages([]);
        setActiveStream(null);
        setComposerValue("");
        setComposerAttachments([]);
      }
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("thread.deleteFailed"),
        title: t("thread.toastTitle")
      });
    }
  }, [clearPendingRunStateForThread, selectedThread, t, toast]);

  const showProjectInFinder = useCallback(async (project: SidebarProject) => {
    if (!project.path) return;
    const shellApi = window.agentConsole?.shell;
    if (!shellApi?.showItemInFolder) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("project.toastTitle") });
      return;
    }

    try {
      await shellApi.showItemInFolder({ path: project.path });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("project.showInFinderFailed"),
        title: t("project.toastTitle")
      });
    }
  }, [t, toast]);

  const removeProject = useCallback(async (project: SidebarProject) => {
    if (project.threads.some((thread) => thread.working)) return;
    const agentApi = window.agentConsole?.agent;
    if (!agentApi?.removeProject) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("project.toastTitle") });
      return;
    }

    if (!window.confirm(t("project.removeConfirm", { name: getProjectDisplayName(project) }))) return;

    try {
      const result = await agentApi.removeProject({
        projectId: project.id,
        projectPath: project.path
      });
      setProjects(result.projects);
      for (const thread of project.threads) {
        clearPendingRunStateForThread(thread.id);
      }

      if (project.threads.some((thread) => thread.id === selectedThread)) {
        setSelectedThread(newSessionThreadId);
        setActivePage("chat");
        setMessages([]);
        setActiveStream(null);
        setComposerValue("");
        setComposerAttachments([]);
      }

      if (newSessionProjectId === project.id) {
        const nextProject = result.projects.find((item) => item.id !== project.id) ?? result.projects[0] ?? null;
        setNewSessionProjectId(nextProject?.id ?? "");
        setComposerAttachments([]);
        setProjectBranchState(defaultProjectBranchState);
      }
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("project.removeFailed"),
        title: t("project.toastTitle")
      });
    }
  }, [clearPendingRunStateForThread, newSessionProjectId, selectedThread, t, toast]);

  const openProjectContextMenu = useCallback(async (project: SidebarProject) => {
    const nativeMenu = window.agentConsole?.nativeMenu;
    if (!nativeMenu?.popup) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("project.toastTitle") });
      return;
    }

    try {
      const hasRunningSession = project.threads.some((thread) => thread.working);
      const result = await nativeMenu.popup({
        items: [
          { enabled: Boolean(project.path), id: "show-in-finder", label: t("project.showInFinder") },
          { type: "separator" },
          { enabled: Boolean(project.path) && !hasRunningSession, id: "remove-project", label: t("project.remove") }
        ]
      });

      if (result.actionId === "show-in-finder") {
        await showProjectInFinder(project);
      } else if (result.actionId === "remove-project") {
        await removeProject(project);
      }
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("project.removeFailed"),
        title: t("project.toastTitle")
      });
    }
  }, [removeProject, showProjectInFinder, t, toast]);

  const openThreadContextMenu = useCallback(async (thread: SidebarThread) => {
    const nativeMenu = window.agentConsole?.nativeMenu;
    if (!nativeMenu?.popup) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("thread.toastTitle") });
      return;
    }

    try {
      const result = await nativeMenu.popup({
        items: [
          { id: "rename-thread", label: t("thread.rename") },
          { type: "separator" },
          { enabled: !thread.working, id: "delete-thread", label: t("thread.delete") }
        ]
      });

      if (result.actionId === "rename-thread") {
        startThreadRename(thread);
      } else if (result.actionId === "delete-thread") {
        await deleteThread(thread);
      }
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("thread.deleteFailed"),
        title: t("thread.toastTitle")
      });
    }
  }, [deleteThread, startThreadRename, t, toast]);

  const copyActiveThreadId = useCallback(async () => {
    if (!selectedSidebarThread) return;

    try {
      await writeClipboardText(selectedSidebarThread.id);
      toast.success({ content: t("thread.copySessionIdSuccess"), title: t("thread.toastTitle") });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("thread.copyFailed"),
        title: t("thread.toastTitle")
      });
    }
  }, [selectedSidebarThread, t, toast]);

  const copyActiveThreadMarkdown = useCallback(async () => {
    if (!messages.length) return;

    try {
      await writeClipboardText(formatConversationMarkdown(activeTitle, messages, t));
      toast.success({ content: t("thread.copyMarkdownSuccess"), title: t("thread.toastTitle") });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("thread.copyFailed"),
        title: t("thread.toastTitle")
      });
    }
  }, [activeTitle, messages, t, toast]);

  const openActiveThreadSmallWindow = useCallback(async () => {
    const smallWindowApi = window.agentConsole?.smallWindow;
    if (!smallWindowApi) {
      toast.error({ content: t("smallWindow.apiUnavailable"), title: t("smallWindow.toastTitle") });
      return;
    }

    try {
      await smallWindowApi.create({
        threadId: selectedThread === newSessionThreadId ? undefined : selectedThread
      });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("smallWindow.openFailed"),
        title: t("smallWindow.toastTitle")
      });
    }
  }, [selectedThread, t, toast]);

  const openSettings = useCallback((section: SettingsSectionId = "general") => {
    setActiveSettingsSection(section);
    setActivePage("settings");
    setRightOpen(false);
  }, []);

  const openBotPage = useCallback(() => {
    setActivePage("bot");
    setRightOpen(false);
  }, []);

  const openAutomationsPage = useCallback(() => {
    setActivePage("automations");
    setRightOpen(false);
  }, []);

  const toggleSmallWindowPinned = useCallback(async () => {
    const smallWindowApi = window.agentConsole?.smallWindow;
    if (!smallWindowApi) return;

    const pinned = !smallWindowState.pinned;
    setSmallWindowState((currentState) => ({ ...currentState, pinned }));
    try {
      setSmallWindowState(await smallWindowApi.setPinned({ pinned }));
    } catch (error) {
      setSmallWindowState((currentState) => ({ ...currentState, pinned: !pinned }));
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("smallWindow.pinFailed"),
        title: t("smallWindow.toastTitle")
      });
    }
  }, [smallWindowState.pinned, t, toast]);

  const closeSmallWindow = useCallback(() => {
    void window.agentConsole?.smallWindow?.close().catch((error) => {
      console.warn("[small-window] Failed to close small window.", error);
    });
  }, []);

  const startNewSession = useCallback((projectId?: string) => {
    clearPendingRunStateForThread(newSessionThreadId);
    selectedThreadRef.current = newSessionThreadId;
    setSelectedThread(newSessionThreadId);
    setActivePage("chat");
    setMessages([]);
    setActiveStream(null);
    if (projectId) {
      setNewSessionProjectId(projectId);
      setProjectBranchState(defaultProjectBranchState);
    }
    setComposerValue("");
    setComposerAttachments([]);
  }, [clearPendingRunStateForThread]);

  const editUserMessage = useCallback((message: ChatMessage) => {
    if (message.role !== "user") return;
    setComposerValue(message.content);
    setComposerAttachments([]);
  }, []);

  const forkMessage = useCallback(async (message: ChatMessage) => {
    const sourceThreadId = selectedThreadRef.current;
    const agentApi = window.agentConsole?.agent;
    if (!agentApi?.forkThread) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("thread.toastTitle") });
      return;
    }
    if (sourceThreadId === newSessionThreadId) {
      toast.error({ content: t("thread.branchUnavailable"), title: t("thread.toastTitle") });
      return;
    }

    try {
      const result = await agentApi.forkThread({
        messageId: message.id,
        threadId: sourceThreadId
      });
      const forkedMessages = result.messages.map(normalizeAgentMessageRecord);
      clearPendingRunStateForThread(result.thread.id);
      suppressThreadHistoryLoadRef.current = result.thread.id;
      selectedThreadRef.current = result.thread.id;
      setProjects(result.projects);
      setSelectedThread(result.thread.id);
      setActivePage("chat");
      setRenamingHeaderThreadId(null);
      setMessages(forkedMessages);
      setActiveStream(null);
      setComposerValue("");
      setComposerAttachments([]);
      setContextUsageByThread((currentUsageByThread) => {
        const nextUsageByThread = { ...currentUsageByThread };
        delete nextUsageByThread[result.thread.id];
        return nextUsageByThread;
      });
      toast.success({ content: t("thread.branchSuccess"), title: t("thread.toastTitle") });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("thread.branchFailed"),
        title: t("thread.toastTitle")
      });
    }
  }, [clearPendingRunStateForThread, t, toast]);

  const changeNewSessionProject = useCallback((projectId: string) => {
    setNewSessionProjectId(projectId);
    setComposerAttachments([]);
    setProjectBranchState(defaultProjectBranchState);
  }, []);

  const createBlankProject = useCallback(async () => {
    const agentApi = window.agentConsole?.agent;
    if (!agentApi) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("agent.toastTitle") });
      return;
    }

    try {
      const result = await agentApi.createBlankProject();
      setProjects(result.projects);
      if (result.project) {
        changeNewSessionProject(result.project.id);
      }
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("newSession.projectCreateFailed"),
        title: t("agent.toastTitle")
      });
    }
  }, [changeNewSessionProject, t, toast]);

  const addExistingProject = useCallback(async () => {
    const agentApi = window.agentConsole?.agent;
    if (!agentApi) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("agent.toastTitle") });
      return;
    }

    try {
      const result = await agentApi.addExistingProject();
      if (result.canceled) return;

      setProjects(result.projects);
      if (result.project) {
        changeNewSessionProject(result.project.id);
      }
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("newSession.projectAddFailed"),
        title: t("agent.toastTitle")
      });
    }
  }, [changeNewSessionProject, t, toast]);

  const addComposerAttachments = useCallback(async () => {
    const filesApi = window.agentConsole?.files;
    if (!filesApi) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("agent.toastTitle") });
      return;
    }

    const selectedProject = projects.find((project) => project.id === newSessionProjectId) ?? getDefaultProject(projects);
    try {
      const result = await filesApi.chooseAttachments({ defaultPath: selectedProject?.path });
      if (result.canceled) return;

      setComposerAttachments((currentAttachments) => mergeAttachments(currentAttachments, result.attachments));
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("newSession.attachFilesFailed"),
        title: t("agent.toastTitle")
      });
    }
  }, [newSessionProjectId, projects, t, toast]);

  const removeComposerAttachment = useCallback((attachmentPath: string) => {
    setComposerAttachments((currentAttachments) => currentAttachments.filter((attachment) => attachment.path !== attachmentPath));
  }, []);

  const changeNewSessionBranch = useCallback(async (branchName: string) => {
    if (!branchName || branchName === projectBranchState.selectedBranch) return;

    const selectedProject = projects.find((project) => project.id === newSessionProjectId) ?? getDefaultProject(projects);
    const agentApi = window.agentConsole?.agent;
    if (!agentApi || !selectedProject) return;

    setProjectBranchState((currentState) => ({ ...currentState, loading: true, selectedBranch: branchName }));
    try {
      const result = await agentApi.checkoutProjectBranch({
        branchName,
        projectId: selectedProject.id,
        projectPath: selectedProject.path
      });
      const branchNames = result.branches.map((branch) => branch.name);
      setProjectBranchState({
        branches: result.branches,
        currentBranch: result.currentBranch,
        detached: result.detached,
        isGitRepository: result.isGitRepository,
        loading: false,
        selectedBranch: result.currentBranch || branchNames[0] || branchName
      });
    } catch (error) {
      setProjectBranchState((currentState) => ({ ...currentState, loading: false, selectedBranch: currentState.currentBranch || currentState.selectedBranch }));
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("newSession.branchSwitchFailed"),
        title: t("agent.toastTitle")
      });
    }
  }, [newSessionProjectId, projectBranchState.selectedBranch, projects, t, toast]);

  const selectThread = useCallback((thread: string) => {
    if (thread === newSessionThreadId) {
      startNewSession();
      return;
    }

    const alreadySelected = selectedThreadRef.current === thread;
    selectedThreadRef.current = thread;
    setSelectedThread(thread);
    setRenamingHeaderThreadId(null);
    setActivePage("chat");

    if (!alreadySelected) {
      setMessages(inFlightMessagesByThreadRef.current.get(thread) ?? []);
      setActiveStream(activeStreamsByThreadRef.current.get(thread) ?? null);
    }

    setComposerValue("");
    setComposerAttachments([]);
  }, [startNewSession]);

  const selectSearchResult = useCallback((thread: string) => {
    selectThread(thread);
    setSearchDialogOpen(false);
  }, [selectThread]);

  useEffect(() => {
    return window.agentConsole?.ipc.on("agent-console:sidebar:select-thread", (payload) => {
      if (typeof payload === "string" && hasSidebarThread(projects, payload)) {
        selectThread(payload);
      }
    });
  }, [projects, selectThread]);

  useEffect(() => {
    window.agentConsole?.ipc.send("agent-console:sidebar:selected-thread-changed", selectedThread);
  }, [selectedThread]);

  const updateTranscriptionConfig = useCallback((key: keyof TranscriptionConfig, nextValue: string) => {
    setTranscriptionConfig((currentConfig) => normalizeTranscriptionConfig({ ...currentConfig, [key]: nextValue }));
  }, []);

  const updateSettingsPreference = useCallback((key: keyof SettingsPreferences, value: SettingsPreferenceValue) => {
    setSettingsPreferences((currentPreferences) => ({ ...currentPreferences, [key]: value }) as SettingsPreferences);
  }, []);

  const saveAgentEnvironment = useCallback(
    async (providerId: ChatAgentProviderId, env: Record<string, string>) => {
      if (!window.agentConsole?.settings) {
        toast.error({ content: t("settings.agentEnvironment.apiUnavailable"), title: t("settings.agentEnvironment.toastTitle") });
        throw new Error(t("settings.agentEnvironment.apiUnavailable"));
      }

      try {
        const nextSettings = await window.agentConsole.settings.setAgentEnvironment({ env, providerId });
        setAppSettings(normalizeAppSettingsState(nextSettings));
        await reloadAgentProviders();
        toast.success({
          content: t("settings.agentEnvironment.savedToast", { agent: getAgentProviderLabel(agentProviders, providerId) }),
          title: t("settings.agentEnvironment.toastTitle")
        });
      } catch (error) {
        toast.error({
          content: error instanceof Error && error.message ? error.message : t("settings.agentEnvironment.saveFailed"),
          title: t("settings.agentEnvironment.toastTitle")
        });
        throw error;
      }
    },
    [agentProviders, reloadAgentProviders, t, toast]
  );

  const saveAgentProviders = useCallback(
    async (providers: ConfiguredAgentProviderSettings[]) => {
      if (!window.agentConsole?.settings) {
        toast.error({ content: t("settings.agents.apiUnavailable"), title: t("settings.agents.toastTitle") });
        throw new Error(t("settings.agents.apiUnavailable"));
      }

      try {
        const nextSettings = await window.agentConsole.settings.setAgentProviders({ providers });
        setAppSettings(normalizeAppSettingsState(nextSettings));
        await reloadAgentProviders();
        toast.success({
          content: t("settings.agents.savedToast"),
          title: t("settings.agents.toastTitle")
        });
      } catch (error) {
        toast.error({
          content: error instanceof Error && error.message ? error.message : t("settings.agents.saveFailed"),
          title: t("settings.agents.toastTitle")
        });
        throw error;
      }
    },
    [reloadAgentProviders, t, toast]
  );

  const saveSubagents = useCallback(
    async (subagents: ConfiguredSubagentSettings[]) => {
      if (!window.agentConsole?.settings?.setSubagents) {
        toast.error({ content: t("settings.subagents.apiUnavailable"), title: t("settings.subagents.toastTitle") });
        throw new Error(t("settings.subagents.apiUnavailable"));
      }

      try {
        const nextSettings = await window.agentConsole.settings.setSubagents({ subagents });
        setAppSettings(normalizeAppSettingsState(nextSettings));
        toast.success({
          content: t("settings.subagents.savedToast"),
          title: t("settings.subagents.toastTitle")
        });
      } catch (error) {
        toast.error({
          content: error instanceof Error && error.message ? error.message : t("settings.subagents.saveFailed"),
          title: t("settings.subagents.toastTitle")
        });
        throw error;
      }
    },
    [t, toast]
  );

  const openSubagentCreateDialog = useCallback(() => {
    setSubagentCreateForm(createBlankSubagentSettingsForm(appSettings.subagents, subagentProviderOptions));
    setSubagentCreateError(null);
    setSubagentCreateDialogOpen(true);
  }, [appSettings.subagents, subagentProviderOptions]);

  const closeSubagentCreateDialog = useCallback(() => {
    if (savingCreatedSubagent) return;
    setSubagentCreateDialogOpen(false);
    setSubagentCreateForm(null);
    setSubagentCreateError(null);
  }, [savingCreatedSubagent]);

  const updateSubagentCreateForm = useCallback((key: keyof SubagentSettingsForm, value: string) => {
    setSubagentCreateForm((currentForm) => currentForm ? updateSubagentSettingsFormValue(currentForm, key, value, subagentProviderOptions) : currentForm);
    setSubagentCreateError(null);
  }, [subagentProviderOptions]);

  const saveCreatedSubagent = useCallback(async () => {
    if (!subagentCreateForm) return;

    const { error, subagent } = getConfiguredSubagentFromForm(subagentCreateForm, appSettings.subagents, subagentProviderOptions, t);
    if (error || !subagent) {
      setSubagentCreateError(error);
      return;
    }

    setSavingCreatedSubagent(true);
    try {
      await saveSubagents([...appSettings.subagents, subagent]);
      setSelectedSubagentIds((currentIds) => currentIds.includes(subagent.id) ? currentIds : [...currentIds, subagent.id]);
      setSubagentCreateDialogOpen(false);
      setSubagentCreateForm(null);
      setSubagentCreateError(null);
    } finally {
      setSavingCreatedSubagent(false);
    }
  }, [appSettings.subagents, saveSubagents, subagentCreateForm, subagentProviderOptions, t]);

  const createAndSelectAgentProvider = useCallback(
    async (provider: ConfiguredAgentProviderSettings) => {
      if (!window.agentConsole?.settings) {
        toast.error({ content: t("settings.agents.apiUnavailable"), title: t("settings.agents.toastTitle") });
        throw new Error(t("settings.agents.apiUnavailable"));
      }

      try {
        const currentSettings = normalizeAppSettingsState(await window.agentConsole.settings.get());
        const nextSettings = await window.agentConsole.settings.setAgentProviders({
          providers: [...currentSettings.agentProviders, provider]
        });
        setAppSettings(normalizeAppSettingsState(nextSettings));
        const nextProviders = await reloadAgentProviders();
        const selectedProvider = getEnabledAgentProviders(nextProviders).find((candidate) => candidate.id === provider.id) ?? null;

        if (selectedProvider) {
          const nextModel = getDefaultAgentModel(selectedProvider);
          setAgentProviderId(selectedProvider.id);
          setAgentModel(nextModel);
          setAgentEffort((currentEffort) => getValidAgentEffort(currentEffort, nextModel, selectedProvider.models, selectedProvider));
          setAgentSpeed((currentSpeed) => getValidAgentSpeed(currentSpeed, nextModel, selectedProvider.models, selectedProvider));
        }

        toast.success({
          content: t("settings.agents.savedToast"),
          title: t("settings.agents.toastTitle")
        });
        return selectedProvider;
      } catch (error) {
        toast.error({
          content: error instanceof Error && error.message ? error.message : t("settings.agents.saveFailed"),
          title: t("settings.agents.toastTitle")
        });
        throw error;
      }
    },
    [reloadAgentProviders, t, toast]
  );

  const saveAgentProviderEnabled = useCallback(
    async (providerId: ChatAgentProviderId, enabled: boolean) => {
      if (!window.agentConsole?.settings) {
        toast.error({ content: t("settings.agents.apiUnavailable"), title: t("settings.agents.toastTitle") });
        throw new Error(t("settings.agents.apiUnavailable"));
      }

      try {
        const nextSettings = await window.agentConsole.settings.setAgentProviderEnabled({ enabled, providerId });
        setAppSettings(normalizeAppSettingsState(nextSettings));
        await reloadAgentProviders();
        await reloadProjects();
        toast.success({
          content: enabled ? t("settings.agents.enabledToast") : t("settings.agents.disabledToast"),
          title: t("settings.agents.toastTitle")
        });
      } catch (error) {
        toast.error({
          content: error instanceof Error && error.message ? error.message : t("settings.agents.saveFailed"),
          title: t("settings.agents.toastTitle")
        });
        throw error;
      }
    },
    [reloadAgentProviders, reloadProjects, t, toast]
  );

  const updateSpotlightShortcut = useCallback(
    async (accelerator: string) => {
      if (!window.agentConsole?.settings) {
        toast.error({ content: t("settings.shortcut.apiUnavailable"), title: t("settings.shortcut.toastTitle") });
        return;
      }

      try {
        const nextSettings = await window.agentConsole.settings.setSpotlightShortcut({ accelerator });
        setAppSettings(normalizeAppSettingsState(nextSettings));

        if (nextSettings.registeredSpotlightShortcut && nextSettings.registeredSpotlightShortcut !== nextSettings.spotlightShortcut) {
          toast.warning({
            content: t("settings.shortcut.fallbackToast", {
              registered: formatShortcutAccelerator(nextSettings.registeredSpotlightShortcut),
              shortcut: formatShortcutAccelerator(nextSettings.spotlightShortcut)
            }),
            title: t("settings.shortcut.toastTitle")
          });
          return;
        }

        toast.success({
          content: t("settings.shortcut.savedToast", { shortcut: formatShortcutAccelerator(nextSettings.spotlightShortcut) }),
          title: t("settings.shortcut.toastTitle")
        });
      } catch (error) {
        toast.error({
          content: error instanceof Error && error.message ? error.message : t("settings.shortcut.saveFailed"),
          title: t("settings.shortcut.toastTitle")
        });
      }
    },
    [t, toast]
  );

  const resetSpotlightShortcut = useCallback(async () => {
    if (!window.agentConsole?.settings) {
      toast.error({ content: t("settings.shortcut.apiUnavailable"), title: t("settings.shortcut.toastTitle") });
      return;
    }

    try {
      const nextSettings = await window.agentConsole.settings.resetSpotlightShortcut();
      setAppSettings(normalizeAppSettingsState(nextSettings));

      if (nextSettings.registeredSpotlightShortcut && nextSettings.registeredSpotlightShortcut !== nextSettings.spotlightShortcut) {
        toast.warning({
          content: t("settings.shortcut.fallbackToast", {
            registered: formatShortcutAccelerator(nextSettings.registeredSpotlightShortcut),
            shortcut: formatShortcutAccelerator(nextSettings.spotlightShortcut)
          }),
          title: t("settings.shortcut.toastTitle")
        });
        return;
      }

      toast.success({
        content: t("settings.shortcut.resetToast", { shortcut: formatShortcutAccelerator(nextSettings.spotlightShortcut) }),
        title: t("settings.shortcut.toastTitle")
      });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("settings.shortcut.saveFailed"),
        title: t("settings.shortcut.toastTitle")
      });
    }
  }, [t, toast]);

  const reloadAppSettings = useCallback(async () => {
    const settingsApi = window.agentConsole?.settings;
    if (!settingsApi) return;
    const nextSettings = await settingsApi.get();
    setAppSettings(normalizeAppSettingsState(nextSettings));
  }, []);

  const saveToolHubEnabled = useCallback(async (enabled: boolean) => {
    const toolHubApi = window.agentConsole?.toolhub;
    if (!toolHubApi) {
      toast.error({ content: t("settings.toolhub.apiUnavailable"), title: t("settings.toolhub.toastTitle") });
      throw new Error(t("settings.toolhub.apiUnavailable"));
    }

    try {
      await toolHubApi.setEnabled({ enabled });
      await reloadAppSettings();
      toast.success({
        content: enabled ? t("settings.toolhub.enabledToast") : t("settings.toolhub.disabledToast"),
        title: t("settings.toolhub.toastTitle")
      });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("settings.toolhub.saveFailed"),
        title: t("settings.toolhub.toastTitle")
      });
      throw error;
    }
  }, [reloadAppSettings, t, toast]);

  const saveToolHubLlmConfig = useCallback(async (llm: ToolHubLlmSettings) => {
    const toolHubApi = window.agentConsole?.toolhub;
    if (!toolHubApi) {
      toast.error({ content: t("settings.toolhub.apiUnavailable"), title: t("settings.toolhub.toastTitle") });
      throw new Error(t("settings.toolhub.apiUnavailable"));
    }

    try {
      await toolHubApi.setLlmConfig(llm);
      await reloadAppSettings();
      toast.success({ content: t("settings.toolhub.llmSavedToast"), title: t("settings.toolhub.toastTitle") });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("settings.toolhub.saveFailed"),
        title: t("settings.toolhub.toastTitle")
      });
      throw error;
    }
  }, [reloadAppSettings, t, toast]);

  const installToolHubServer = useCallback(async (server: ToolHubUserMcpServerConfig) => {
    const toolHubApi = window.agentConsole?.toolhub;
    if (!toolHubApi) {
      toast.error({ content: t("settings.toolhub.apiUnavailable"), title: t("settings.toolhub.toastTitle") });
      throw new Error(t("settings.toolhub.apiUnavailable"));
    }

    try {
      await toolHubApi.installServer(server);
      await reloadAppSettings();
      toast.success({ content: t("settings.toolhub.serverInstalledToast", { id: server.id }), title: t("settings.toolhub.toastTitle") });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("settings.toolhub.saveFailed"),
        title: t("settings.toolhub.toastTitle")
      });
      throw error;
    }
  }, [reloadAppSettings, t, toast]);

  const updateToolHubServer = useCallback(async (server: ToolHubUserMcpServerConfig) => {
    const toolHubApi = window.agentConsole?.toolhub;
    if (!toolHubApi) {
      toast.error({ content: t("settings.toolhub.apiUnavailable"), title: t("settings.toolhub.toastTitle") });
      throw new Error(t("settings.toolhub.apiUnavailable"));
    }

    try {
      await toolHubApi.updateServer(server);
      await reloadAppSettings();
      toast.success({ content: t("settings.toolhub.serverUpdatedToast", { id: server.id }), title: t("settings.toolhub.toastTitle") });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("settings.toolhub.saveFailed"),
        title: t("settings.toolhub.toastTitle")
      });
      throw error;
    }
  }, [reloadAppSettings, t, toast]);

  const removeToolHubServer = useCallback(async (serverId: string) => {
    const toolHubApi = window.agentConsole?.toolhub;
    if (!toolHubApi) {
      toast.error({ content: t("settings.toolhub.apiUnavailable"), title: t("settings.toolhub.toastTitle") });
      throw new Error(t("settings.toolhub.apiUnavailable"));
    }

    try {
      await toolHubApi.removeServer({ id: serverId });
      await reloadAppSettings();
      toast.success({ content: t("settings.toolhub.serverRemovedToast", { id: serverId }), title: t("settings.toolhub.toastTitle") });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("settings.toolhub.saveFailed"),
        title: t("settings.toolhub.toastTitle")
      });
      throw error;
    }
  }, [reloadAppSettings, t, toast]);

  const updateToolHubBuiltinMcpServer = useCallback(async (serverId: ToolHubBuiltinMcpServerId, enabled: boolean) => {
    const toolHubApi = window.agentConsole?.toolhub;
    if (!toolHubApi) {
      toast.error({ content: t("settings.toolhub.apiUnavailable"), title: t("settings.toolhub.toastTitle") });
      throw new Error(t("settings.toolhub.apiUnavailable"));
    }

    try {
      await toolHubApi.setBuiltinMcpServerEnabled({ enabled, id: serverId });
      await reloadAppSettings();
      toast.success({
        content: t("settings.toolhub.builtinUpdatedToast", { label: t(`settings.toolhub.builtin.${serverId}.label`) }),
        title: t("settings.toolhub.toastTitle")
      });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("settings.toolhub.saveFailed"),
        title: t("settings.toolhub.toastTitle")
      });
      throw error;
    }
  }, [reloadAppSettings, t, toast]);

  const clearToolHubCache = useCallback(async () => {
    const toolHubApi = window.agentConsole?.toolhub;
    if (!toolHubApi) {
      toast.error({ content: t("settings.toolhub.apiUnavailable"), title: t("settings.toolhub.toastTitle") });
      throw new Error(t("settings.toolhub.apiUnavailable"));
    }

    try {
      await toolHubApi.clearCache();
      toast.success({ content: t("settings.toolhub.cacheClearedToast"), title: t("settings.toolhub.toastTitle") });
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("settings.toolhub.clearCacheFailed"),
        title: t("settings.toolhub.toastTitle")
      });
      throw error;
    }
  }, [t, toast]);

  const runPluginAction = useCallback(
    async (
      action: "disable" | "enable" | "grant-permissions" | "install" | "reload" | "revoke-permissions" | "set-configuration" | "uninstall" | "update",
      payload?: unknown
    ) => {
      const pluginsApi = window.agentConsole?.plugins;
      if (!pluginsApi) {
        toast.error({ content: "Plugin API is unavailable.", title: "Plugins" });
        return;
      }

      try {
        let nextState: AgentConsolePluginState;
        if (action === "disable") {
          nextState = await pluginsApi.disable(payload as { id?: string; pluginId?: string } | string);
        } else if (action === "enable") {
          nextState = await pluginsApi.enable(payload as { id?: string; permissionIds?: string[]; pluginId?: string } | string);
        } else if (action === "grant-permissions") {
          nextState = await pluginsApi.grantPermissions(payload as { id?: string; permissionIds: string[]; pluginId?: string });
        } else if (action === "revoke-permissions") {
          nextState = await pluginsApi.revokePermissions(payload as { id?: string; permissionIds: string[]; pluginId?: string });
        } else if (action === "install") {
          nextState = await pluginsApi.install(payload as Parameters<typeof pluginsApi.install>[0]);
        } else if (action === "set-configuration") {
          nextState = await pluginsApi.setConfiguration(payload as { id?: string; pluginId?: string; values: Record<string, unknown> });
        } else if (action === "uninstall") {
          nextState = await pluginsApi.uninstall(payload as { id?: string; pluginId?: string } | string);
        } else if (action === "update") {
          nextState = await pluginsApi.update(payload as Parameters<typeof pluginsApi.update>[0]);
        } else {
          nextState = await pluginsApi.reload();
        }
        setPluginState(normalizePluginState(nextState));
        toast.success({ content: "Plugin state updated.", title: "Plugins" });
      } catch (error) {
        toast.error({
          content: error instanceof Error && error.message ? error.message : "Plugin operation failed.",
          title: "Plugins"
        });
      }
    },
    [toast]
  );

  const abortActiveRun = useCallback(() => {
    const threadId = selectedThreadRef.current;
    const stream = activeStreamsByThreadRef.current.get(threadId) ?? activeStream;
    const runId = stream?.runId;
    if (!stream) {
      toast.warning({ content: t("agent.abortRunUnavailable"), title: t("agent.toastTitle") });
      return;
    }

    const agentApi = window.agentConsole?.agent;
    if (!agentApi?.abortRun) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("agent.toastTitle") });
      return;
    }

    if (!runId) {
      const pendingRunBinding = pendingRunBindingsByThreadRef.current.get(threadId);
      if (!pendingRunBinding) {
        toast.warning({ content: t("agent.abortRunUnavailable"), title: t("agent.toastTitle") });
        return;
      }

      pendingRunBindingsByThreadRef.current.set(threadId, {
        ...pendingRunBinding,
        canceled: true
      });
      updateInFlightMessage(threadId, stream.id, (message) => ({
        ...message,
        content: message.content || `> ${t("agent.runStopped")}`,
        streaming: false
      }));
      setVisibleActiveStream(null, threadId);
      persistPendingRunSnapshotForThread(threadId);
      toast.success({ content: t("agent.runStopped"), title: t("agent.toastTitle") });
      return;
    }

    void agentApi.abortRun({ runId })
      .then((result) => {
        if (!result?.success) {
          throw new Error(t("agent.abortRunFailed"));
        }

        updateInFlightMessage(threadId, stream.id, (message) => ({
          ...message,
          content: message.content || `> ${t("agent.runStopped")}`,
          streaming: false
        }));
        setVisibleActiveStream(null, threadId);
        runMessageIdsRef.current.delete(runId);
        runThreadIdsRef.current.delete(runId);
        runLocalMessageIdsRef.current.delete(runId);
        persistPendingRunSnapshotForThread(threadId);
        toast.success({ content: t("agent.runStopped"), title: t("agent.toastTitle") });
      })
      .catch((error) => {
        toast.error({
          content: error instanceof Error && error.message ? error.message : t("agent.abortRunFailed"),
          title: t("agent.toastTitle")
        });
      });
  }, [activeStream, persistPendingRunSnapshotForThread, setVisibleActiveStream, t, toast, updateInFlightMessage]);

  const changeAgentModel = useCallback((nextModel: string) => {
    const modelOptions = getAgentModelOptions(enabledAgentProviders, activeAgentProviderId);
    const provider = enabledAgentProviders.find((candidate) => candidate.id === activeAgentProviderId) ?? null;
    setAgentModel(nextModel);
    setAgentEffort((currentEffort) => getValidAgentEffort(currentEffort, nextModel, modelOptions, provider));
    setAgentSpeed((currentSpeed) => getValidAgentSpeed(currentSpeed, nextModel, modelOptions, provider));
  }, [activeAgentProviderId, enabledAgentProviders]);

  const changeAgentProvider = useCallback((value: string) => {
    const provider = getAgentProviderByLabel(enabledAgentProviders, value, false);
    if (!provider) return;

    const nextModel = getDefaultAgentModel(provider);
    setAgentProviderId(provider.id);
    setAgentModel(nextModel);
    setAgentEffort((currentEffort) => getValidAgentEffort(currentEffort, nextModel, provider.models, provider));
    setAgentSpeed((currentSpeed) => getValidAgentSpeed(currentSpeed, nextModel, provider.models, provider));
  }, [enabledAgentProviders]);

  const enqueueApprovalPrompt = useCallback((event: ChatAgentRunEvent) => {
    if (!event.approvalId) return;

    const prompt: AgentApprovalPrompt = {
      approvalId: event.approvalId,
      approvalOptions: event.approvalOptions as ChatAgentApprovalDecision[] | undefined,
      approvalScope: event.approvalScope,
      method: event.method,
      params: event.params,
      providerId: event.providerId,
      runId: event.runId,
      threadId: event.threadId,
      title: event.title
    };
    const promptKey = getApprovalPromptDedupeKey(prompt);

    setApprovalPrompt((currentPrompt) => {
      if (
        ignoredApprovalPromptIdsRef.current.has(prompt.approvalId) ||
        ignoredApprovalPromptKeysRef.current.has(promptKey) ||
        currentPrompt?.approvalId === prompt.approvalId ||
        (currentPrompt && getApprovalPromptDedupeKey(currentPrompt) === promptKey) ||
        approvalQueueRef.current.some((queuedPrompt) => queuedPrompt.approvalId === prompt.approvalId || getApprovalPromptDedupeKey(queuedPrompt) === promptKey)
      ) {
        return currentPrompt;
      }

      if (currentPrompt && activePromptThreadId === prompt.threadId && currentPrompt.threadId !== prompt.threadId) {
        approvalQueueRef.current.push(currentPrompt);
        return prompt;
      }

      if (currentPrompt) {
        approvalQueueRef.current.push(prompt);
        return currentPrompt;
      }

      return prompt;
    });
  }, [activePromptThreadId]);

  const resolveApprovalPrompt = useCallback((decision: ChatAgentApprovalDecision, message?: string) => {
    const currentPrompt = visibleApprovalPrompt;
    if (!currentPrompt) return;

    ignoredApprovalPromptIdsRef.current.add(currentPrompt.approvalId);
    const promptKey = getApprovalPromptDedupeKey(currentPrompt);
    ignoredApprovalPromptKeysRef.current.add(promptKey);
    approvalQueueRef.current = approvalQueueRef.current.filter((queuedPrompt) => queuedPrompt.approvalId !== currentPrompt.approvalId && getApprovalPromptDedupeKey(queuedPrompt) !== promptKey);

    void window.agentConsole?.agent.resolveApproval({
      approvalId: currentPrompt.approvalId,
      decision,
      ...(message?.trim() ? { message: message.trim() } : {})
    }).catch((error) => {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("agent.approvalResolveFailed"),
        title: t("agent.toastTitle")
      });
      ignoredApprovalPromptIdsRef.current.delete(currentPrompt.approvalId);
      ignoredApprovalPromptKeysRef.current.delete(promptKey);
    });

    setApprovalPrompt(shiftNextApprovalPrompt(approvalQueueRef.current, ignoredApprovalPromptIdsRef.current, ignoredApprovalPromptKeysRef.current, activePromptThreadId));
  }, [activePromptThreadId, t, toast, visibleApprovalPrompt]);

  const enqueueQuestionPrompt = useCallback((event: ChatAgentRunEvent) => {
    if (!event.questionId || !event.questions?.length) return;

    const prompt: AgentQuestionPrompt = {
      method: event.method,
      params: event.params,
      providerId: event.providerId,
      questionId: event.questionId,
      questions: event.questions,
      runId: event.runId,
      threadId: event.threadId,
      title: event.title
    };
    const promptKey = getQuestionPromptDedupeKey(prompt);

    setQuestionPrompt((currentPrompt) => {
      if (
        ignoredQuestionPromptIdsRef.current.has(prompt.questionId) ||
        ignoredQuestionPromptKeysRef.current.has(promptKey) ||
        currentPrompt?.questionId === prompt.questionId ||
        (currentPrompt && getQuestionPromptDedupeKey(currentPrompt) === promptKey) ||
        questionQueueRef.current.some((queuedPrompt) => (
          queuedPrompt.questionId === prompt.questionId ||
          getQuestionPromptDedupeKey(queuedPrompt) === promptKey
        ))
      ) {
        return currentPrompt;
      }

      if (currentPrompt && activePromptThreadId === prompt.threadId && currentPrompt.threadId !== prompt.threadId) {
        questionQueueRef.current.push(currentPrompt);
        return prompt;
      }

      if (currentPrompt) {
        questionQueueRef.current.push(prompt);
        return currentPrompt;
      }

      return prompt;
    });
  }, [activePromptThreadId]);

  const resolveQuestionPrompt = useCallback((response: AgentQuestionResponse) => {
    const currentPrompt = visibleQuestionPrompt;
    if (!currentPrompt) return;

    const currentPromptKey = getQuestionPromptDedupeKey(currentPrompt);
    ignoredQuestionPromptIdsRef.current.add(currentPrompt.questionId);
    ignoredQuestionPromptKeysRef.current.add(currentPromptKey);
    questionQueueRef.current = questionQueueRef.current.filter((queuedPrompt) => (
      queuedPrompt.questionId !== currentPrompt.questionId &&
      getQuestionPromptDedupeKey(queuedPrompt) !== currentPromptKey
    ));

    void window.agentConsole?.agent.resolveQuestion({
      ...response,
      questionId: currentPrompt.questionId
    }).catch((error) => {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("agent.questionResolveFailed"),
        title: t("agent.toastTitle")
      });
      ignoredQuestionPromptIdsRef.current.delete(currentPrompt.questionId);
      ignoredQuestionPromptKeysRef.current.delete(currentPromptKey);
    });

    setQuestionPrompt(shiftNextQuestionPrompt(
      questionQueueRef.current,
      ignoredQuestionPromptIdsRef.current,
      ignoredQuestionPromptKeysRef.current,
      activePromptThreadId
    ));
  }, [activePromptThreadId, t, toast, visibleQuestionPrompt]);

  const updateContextUsage = useCallback((threadId: string, usage: UsageTokenMetrics | undefined) => {
    if (!threadId || !usage) return;
    setContextUsageByThread((currentUsageByThread) => ({
      ...currentUsageByThread,
      [threadId]: usage
    }));
  }, []);

  useEffect(() => {
    const agentApi = window.agentConsole?.agent;
    if (!agentApi) return undefined;

    let canceled = false;
    const dispose = agentApi.onEvent((event) => {
      if (!event || !event.runId) return;

      if (event.type === "run_started") {
        const pendingRunBinding = pendingRunBindingsByThreadRef.current.get(event.threadId);
        if (pendingRunBinding) {
          pendingRunBindingsByThreadRef.current.delete(event.threadId);
          if (pendingRunBinding.canceled) {
            void agentApi.abortRun?.({ runId: event.runId }).catch((error) => {
              console.warn("[agent] Failed to abort a canceled pending run.", error);
            });
            return;
          }

          runMessageIdsRef.current.set(event.runId, pendingRunBinding.assistantMessageId);
          runThreadIdsRef.current.set(event.runId, event.threadId);
          runLocalMessageIdsRef.current.set(event.runId, {
            assistantMessageId: pendingRunBinding.assistantMessageId,
            threadId: event.threadId,
            userMessageId: pendingRunBinding.userMessageId
          });
          const currentStream = activeStreamsByThreadRef.current.get(event.threadId) ?? activeStreamsByThreadRef.current.get(pendingRunBinding.threadId);
          if (pendingRunBinding.threadId !== event.threadId) {
            activeStreamsByThreadRef.current.delete(pendingRunBinding.threadId);
          }
          setVisibleActiveStream({
            id: currentStream?.id ?? pendingRunBinding.assistantMessageId,
            runId: event.runId,
            running: true,
            streamKey: currentStream?.streamKey ?? Date.now()
          }, event.threadId);
          if (pendingAssistantMessageIdRef.current === pendingRunBinding.assistantMessageId) {
            pendingAssistantMessageIdRef.current = null;
            pendingUserMessageIdRef.current = null;
            pendingAssistantThreadIdRef.current = null;
          }
        }
        return;
      }

      if (event.type === "approval_request") {
        enqueueApprovalPrompt(event);
        return;
      }

      if (event.type === "question_request") {
        enqueueQuestionPrompt(event);
        return;
      }

      if (event.type === "usage") {
        updateContextUsage(event.threadId, event.usage);
        return;
      }

      const pendingRunBinding = pendingRunBindingsByThreadRef.current.get(event.threadId);
      if (pendingRunBinding && !runMessageIdsRef.current.has(event.runId)) {
        pendingRunBindingsByThreadRef.current.delete(event.threadId);
        if (pendingRunBinding.canceled) {
          void agentApi.abortRun?.({ runId: event.runId }).catch((error) => {
            console.warn("[agent] Failed to abort a canceled pending run.", error);
          });
          return;
        }

        runMessageIdsRef.current.set(event.runId, pendingRunBinding.assistantMessageId);
        runThreadIdsRef.current.set(event.runId, event.threadId);
        runLocalMessageIdsRef.current.set(event.runId, {
          assistantMessageId: pendingRunBinding.assistantMessageId,
          threadId: event.threadId,
          userMessageId: pendingRunBinding.userMessageId
        });
        const currentStream = activeStreamsByThreadRef.current.get(event.threadId) ?? activeStreamsByThreadRef.current.get(pendingRunBinding.threadId);
        if (pendingRunBinding.threadId !== event.threadId) {
          activeStreamsByThreadRef.current.delete(pendingRunBinding.threadId);
        }
        setVisibleActiveStream({
          id: currentStream?.id ?? pendingRunBinding.assistantMessageId,
          runId: event.runId,
          running: true,
          streamKey: currentStream?.streamKey ?? Date.now()
        }, event.threadId);
      }

      const messageId = runMessageIdsRef.current.get(event.runId) ?? pendingRunBinding?.assistantMessageId;
      if (!messageId) return;
      const threadId = event.threadId || runThreadIdsRef.current.get(event.runId) || pendingRunBinding?.threadId || selectedThreadRef.current;

      if (event.type === "message_delta" && event.data) {
        updateInFlightMessage(threadId, messageId, (message) => ({
          ...message,
          content: `${message.content}${event.data ?? ""}`,
          parts: appendTextMessagePart(message.parts, event.data ?? ""),
          streaming: true
        }));
        return;
      }

      if (event.type === "message_part" && event.part) {
        const part = normalizeMessagePart(event.part);
        if (!part) return;

        updateInFlightMessage(threadId, messageId, (message) => upsertMessagePartOnMessage(message, part));
        return;
      }

      if (event.type === "tool_event" && event.toolEvent) {
        const toolEvent = normalizeToolEvent(event.toolEvent);
        if (!toolEvent) return;

        updateInFlightMessage(threadId, messageId, (message) => ({
          ...message,
          parts: upsertToolMessagePart(message.parts, toolEvent),
          streaming: true,
          toolEvents: upsertToolEvent(message.toolEvents, toolEvent)
        }));
        return;
      }

      if (event.type === "error") {
        const errorMessage = event.message || t("agent.runFailed");
        updateInFlightMessage(threadId, messageId, (message) => ({
          ...message,
          content: `${message.content}${message.content ? "\n\n" : ""}> ${errorMessage}`,
          streaming: false
        }));
        setVisibleActiveStream(null, threadId);
        runMessageIdsRef.current.delete(event.runId);
        runThreadIdsRef.current.delete(event.runId);
        clearLocalRunMessages(event.runId);
        return;
      }

      if (event.type === "run_finished") {
        updateContextUsage(event.threadId, event.usage);
        updateInFlightMessage(threadId, messageId, (message) => ({
          ...message,
          parts: message.parts?.length ? normalizeTrailingToolMessageParts(message.parts) : message.parts,
          streaming: false
        }));
        setVisibleActiveStream(null, threadId);
        runMessageIdsRef.current.delete(event.runId);
        runThreadIdsRef.current.delete(event.runId);
        clearLocalRunMessages(event.runId);
        void reloadProjects().catch((error) => {
          console.warn("[agent] Failed to refresh projects after run.", error);
        });
      }
    });

    void agentApi.listPendingInteractions?.().then((result) => {
      if (canceled) return;
      result.approvals.forEach(enqueueApprovalPrompt);
      result.questions.forEach(enqueueQuestionPrompt);
    }).catch((error) => {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("agent.runFailed"),
        title: t("agent.toastTitle")
      });
    });

    return () => {
      canceled = true;
      dispose();
    };
  }, [clearLocalRunMessages, enqueueApprovalPrompt, enqueueQuestionPrompt, reloadProjects, setVisibleActiveStream, t, toast, updateContextUsage, updateInFlightMessage]);

  const enqueuePrompt = useCallback((rawPrompt: string) => {
    const userPrompt = rawPrompt.trim();
    if (!userPrompt || activeStream) return false;
    const selectedProject = projects.find((project) => project.id === newSessionProjectId) ?? getDefaultProject(projects);
    const runProviderId = selectedThread === newSessionThreadId
      ? agentProviderId
      : findThreadForId(projects, selectedThread)?.providerId ?? agentProviderId;
    const runProvider = enabledAgentProviders.find((provider) => provider.id === runProviderId) ?? null;
    const runModelOptions = getAgentModelOptions(enabledAgentProviders, runProviderId);
    const runModel = getValidAgentModel(agentModel, enabledAgentProviders, runProviderId);
    const runEffort = getAgentEffortForRequest(agentEffort, runModel, runModelOptions, runProvider);
    const runSpeedOptions = getAgentSpeedOptionsForModel(runModel, runModelOptions, runProvider);
    const runSpeed = getAgentSpeedForRequest(agentSpeed, runSpeedOptions);
    const prompt = userPrompt;
    const contextWindow = getAgentContextWindowInfo(getContextWindowMetrics({
      attachments: composerAttachments,
      composerValue: prompt,
      messages,
      model: runModel,
      modelOptions: runModelOptions,
      providerId: runProviderId,
      usage: contextUsageByThread[selectedThread] ?? null
    }));
    const subagentRuntime = buildAgentSubagentRuntimePayload(appSettings.subagents, selectedSubagentIds, subagentProviderOptions);
    const subagentRuntimePayload = subagentRuntime ? {
      additionalDeveloperInstructions: subagentRuntime.instructions,
      agentConsoleSubagents: subagentRuntime,
      ...(subagentRuntime.mcpServers ? { mcpServers: subagentRuntime.mcpServers } : {})
    } : {};

    const createdAt = Date.now();
    const userMessage: ChatMessage = {
      createdAt,
      id: createMessageId("user"),
      role: "user",
      content: prompt
    };
    const assistantMessage: ChatMessage = {
      createdAt,
      id: createMessageId("assistant"),
      role: "assistant",
      content: "",
      parts: [],
      streaming: true
    };

    const agentApi = window.agentConsole?.agent;
    if (!agentApi) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("agent.toastTitle") });
      return false;
    }

    if (selectedThread === newSessionThreadId && !selectedProject) {
      toast.error({ content: t("newSession.projectUnavailable"), title: t("agent.toastTitle") });
      return false;
    }

    const provisionalThreadId = selectedThread;
    const submittedDraftKey = getComposerDraftKey(provisionalThreadId, newSessionProjectId);
    const nextStream = {
      id: assistantMessage.id,
      running: true,
      streamKey: Date.now()
    };
    composerDraftsRef.current.delete(submittedDraftKey);
    saveComposerDrafts(composerDraftsRef.current);
    pendingRunBindingsByThreadRef.current.set(provisionalThreadId, {
      assistantMessageId: assistantMessage.id,
      threadId: provisionalThreadId,
      userMessageId: userMessage.id
    });
    pendingAssistantMessageIdRef.current = assistantMessage.id;
    pendingUserMessageIdRef.current = userMessage.id;
    pendingAssistantThreadIdRef.current = provisionalThreadId;
    setInFlightMessagesForThread(provisionalThreadId, [
      ...(inFlightMessagesByThreadRef.current.get(provisionalThreadId) ?? []),
      userMessage,
      assistantMessage
    ]);
    activeStreamsByThreadRef.current.set(provisionalThreadId, nextStream);
    persistPendingRunSnapshotForThread(provisionalThreadId);
    setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    setActiveStream(nextStream);

    void (async () => {
      let threadId = selectedThread;
      if (selectedThread === newSessionThreadId) {
        const threadResult = await agentApi.startThread({
          cwd: selectedProject?.path,
          projectId: selectedProject?.id,
          projectName: selectedProject ? getProjectDisplayName(selectedProject) : undefined,
          projectPath: selectedProject?.path,
          prompt,
          providerId: agentProviderId,
          title: userPrompt.replace(/\s+/g, " ").slice(0, 80),
          ...subagentRuntimePayload
        });
        threadId = threadResult.thread.id;
        suppressThreadHistoryLoadRef.current = threadId;
        pendingAssistantThreadIdRef.current = threadId;
        moveInFlightThreadState(provisionalThreadId, threadId);
        selectedThreadRef.current = threadId;
        setSelectedThread(threadId);
        void reloadProjects().catch((error) => {
          console.warn("[agent] Failed to refresh projects after creating a thread.", error);
        });
      }

      if (pendingRunBindingsByThreadRef.current.get(threadId)?.canceled) {
        return;
      }

      await agentApi.sendMessage({
        approvalMode: agentApprovalMode,
        attachments: composerAttachments,
        contextWindow,
        effort: runEffort,
        model: runModel || undefined,
        prompt,
        providerId: runProviderId,
        speed: runSpeed,
        subagentIds: selectedSubagentIds,
        threadId,
        ...subagentRuntimePayload
      });
    })().catch((error) => {
      const errorMessage = error instanceof Error && error.message ? error.message : t("agent.sendFailed");
      const failureThreadId = pendingAssistantThreadIdRef.current || pendingRunBindingsByThreadRef.current.get(provisionalThreadId)?.threadId || provisionalThreadId;
      pendingRunBindingsByThreadRef.current.delete(failureThreadId);
      updateInFlightMessage(failureThreadId, assistantMessage.id, (message) => ({
        ...message,
        content: `${message.content}${message.content ? "\n\n" : ""}> ${errorMessage}`,
        streaming: false
      }));
      setVisibleActiveStream(null, failureThreadId);
      pendingAssistantMessageIdRef.current = null;
      pendingUserMessageIdRef.current = null;
      pendingAssistantThreadIdRef.current = null;
    });

    return true;
  }, [activeStream, agentApprovalMode, agentEffort, agentModel, agentProviderId, agentSpeed, appSettings.subagents, composerAttachments, contextUsageByThread, enabledAgentProviders, messages, moveInFlightThreadState, newSessionProjectId, persistPendingRunSnapshotForThread, projects, reloadProjects, selectedSubagentIds, selectedThread, setInFlightMessagesForThread, setVisibleActiveStream, subagentProviderOptions, t, toast, updateInFlightMessage]);

  const submitMessage = useCallback(() => {
    if (enqueuePrompt(composerValue)) {
      setComposerValue("");
      setComposerAttachments([]);
    }
  }, [composerValue, enqueuePrompt]);

  useEffect(() => {
    return window.agentConsole?.ipc.on("agent-console:spotlight:prompt", (payload) => {
      if (typeof payload !== "string") return;
      if (!enqueuePrompt(payload)) {
        setComposerValue(payload.trim());
      }
    });
  }, [enqueuePrompt]);

  const startSidebarResize = (side: ResizeSide, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth : rightWidth;
    const bounds = side === "left" ? leftSidebarBounds : rightSidebarBounds;
    const maxWidth = Math.max(bounds.min, Math.min(bounds.max, window.innerWidth - 520));

    setResizingSide(side);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = side === "left" ? startWidth + delta : startWidth - delta;
      const clampedWidth = Math.min(maxWidth, Math.max(bounds.min, nextWidth));

      if (side === "left") {
        setLeftWidth(clampedWidth);
      } else {
        setRightWidth(clampedWidth);
      }
    };

    const stopResize = () => {
      setResizingSide(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  const subagentCreateDialog = (
    <SubagentCreateDialog
      agentProviders={subagentProviderOptions}
      error={subagentCreateError}
      form={subagentCreateForm}
      onChange={updateSubagentCreateForm}
      onClose={closeSubagentCreateDialog}
      onSave={saveCreatedSubagent}
      open={subagentCreateDialogOpen}
      saving={savingCreatedSubagent}
    />
  );

  if (isSmallChatWindow) {
    const smallShell = (
      <SmallChatWindowLayout
        agentLogoDataUrl={activeAgentLogoDataUrl}
        agentProviderLabel={activeAgentProviderLabel}
        onClose={closeSmallWindow}
        onTogglePinned={toggleSmallWindowPinned}
        pinned={smallWindowState.pinned}
        title={activeTitle}
      >
        <ChatbotPage
          activeStream={activeStream}
          agentApprovalMode={agentApprovalMode}
          approvalPrompt={visibleApprovalPrompt}
          agentEffort={activeAgentEffort}
          agentEffortOptions={activeAgentEffortOptions}
          agentModel={activeAgentModel}
          agentProviderId={activeAgentProviderId}
          agentProviders={enabledAgentProviders}
          agentSpeed={activeAgentSpeed}
          agentSpeedOptions={activeAgentSpeedOptions}
          attachments={composerAttachments}
          branchState={projectBranchState}
          compact
          composerValue={composerValue}
          configuredAgentProviders={appSettings.agentProviders}
          contextUsage={activeContextUsage}
          homeTheme={homeTheme}
          isNewSession={selectedThread === newSessionThreadId}
          messages={messages}
          onAddExistingProject={addExistingProject}
          onAgentApprovalModeChange={setAgentApprovalMode}
          onAgentEffortChange={(value) => setAgentEffort(normalizeAgentEffort(value))}
          onAgentModelChange={changeAgentModel}
          onAgentProviderCreate={createAndSelectAgentProvider}
          onAgentProviderChange={changeAgentProvider}
          onAgentSpeedChange={(value) => setAgentSpeed(normalizeAgentSpeed(value))}
          onApprovalResolve={resolveApprovalPrompt}
          onAttachFiles={addComposerAttachments}
          onBranchChange={changeNewSessionBranch}
          onComposerChange={setComposerValue}
          onCreateBlankProject={createBlankProject}
          onCreateSubagent={openSubagentCreateDialog}
          onMessageBranch={forkMessage}
          onUserMessageEdit={editUserMessage}
          onNewSessionProjectChange={changeNewSessionProject}
          onOpenVoiceSettings={() => openSettings("general")}
          onQuestionResolve={resolveQuestionPrompt}
          onRemoveAttachment={removeComposerAttachment}
          onSlashCommandSelect={runSlashCommand}
          onSubmit={submitMessage}
          onAbortRun={abortActiveRun}
          projects={projects}
          questionPrompt={visibleQuestionPrompt}
          runtimeAgentProviders={agentProviders}
          selectedProjectId={newSessionProjectId}
          selectedSubagentIds={selectedSubagentIds}
          slashCommands={slashCommands}
          subagents={appSettings.subagents}
          transcriptionConfig={transcriptionConfig}
          onSubagentSelectionChange={setSelectedSubagentIds}
        />
      </SmallChatWindowLayout>
    );
    const fullShell = (
      <div className="relative flex h-full overflow-hidden bg-background text-foreground">
        <ProjectSidebar
          activeSettingsSection={activeSettingsSection}
          agentProviders={enabledAgentProviders}
          automationPageActive={false}
          botPageActive={false}
          chatActive
          onOpenAutomationsPage={openAutomationsPage}
          onOpenBotPage={openBotPage}
          onProjectContextMenu={openProjectContextMenu}
          onResizeStart={(event) => startSidebarResize("left", event)}
          onOpenSettings={openSettings}
          onOpenSearch={() => setSearchDialogOpen(true)}
          onStartNewSession={startNewSession}
          onStartProjectSession={(project) => startNewSession(project.id)}
          onCancelThreadRename={() => setRenamingSidebarThreadId(null)}
          onRenameThread={saveThreadTitle}
          onStartThreadRename={startThreadRename}
          onThreadContextMenu={openThreadContextMenu}
          open={leftOpen}
          projects={projects}
          renamingThreadId={renamingSidebarThreadId}
          resizing={resizingSide === "left"}
          selectedThread={selectedThread}
          setSelectedThread={selectThread}
          width={leftWidth}
        />

        <main className="relative flex min-w-0 flex-1 flex-col bg-background">
          <ThreadHeader
            agentLogoDataUrl={activeAgentLogoDataUrl}
            agentProviderLabel={activeAgentProviderLabel}
            canCopyMarkdown={messages.length > 0}
            canCopyThreadId={Boolean(selectedSidebarThread)}
            canRename={Boolean(selectedSidebarThread)}
            editingThread={renamingHeaderThreadId === selectedSidebarThread?.id ? selectedSidebarThread : null}
            leftOpen={leftOpen}
            onCancelRename={() => setRenamingHeaderThreadId(null)}
            onCopyMarkdown={copyActiveThreadMarkdown}
            onCopyThreadId={copyActiveThreadId}
            onOpenSmallWindow={openActiveThreadSmallWindow}
            onRename={renameActiveThread}
            onSubmitRename={saveThreadTitle}
            title={!messages.length && selectedThread === newSessionThreadId ? "" : activeTitle}
          />
          <section className="relative min-h-0 flex-1 overflow-hidden">
            <ChatbotPage
              activeStream={activeStream}
              agentApprovalMode={agentApprovalMode}
              approvalPrompt={visibleApprovalPrompt}
              agentEffort={activeAgentEffort}
              agentEffortOptions={activeAgentEffortOptions}
              agentModel={activeAgentModel}
              agentProviderId={activeAgentProviderId}
              agentProviders={enabledAgentProviders}
              agentSpeed={activeAgentSpeed}
              agentSpeedOptions={activeAgentSpeedOptions}
              attachments={composerAttachments}
              branchState={projectBranchState}
              composerValue={composerValue}
              configuredAgentProviders={appSettings.agentProviders}
              contextUsage={activeContextUsage}
              homeTheme={homeTheme}
              isNewSession={selectedThread === newSessionThreadId}
              messages={messages}
              onAddExistingProject={addExistingProject}
              onAgentApprovalModeChange={setAgentApprovalMode}
              onAgentEffortChange={(value) => setAgentEffort(normalizeAgentEffort(value))}
              onAgentModelChange={changeAgentModel}
              onAgentProviderCreate={createAndSelectAgentProvider}
              onAgentProviderChange={changeAgentProvider}
              onAgentSpeedChange={(value) => setAgentSpeed(normalizeAgentSpeed(value))}
              onApprovalResolve={resolveApprovalPrompt}
              onAttachFiles={addComposerAttachments}
              onBranchChange={changeNewSessionBranch}
              onComposerChange={setComposerValue}
              onCreateBlankProject={createBlankProject}
              onCreateSubagent={openSubagentCreateDialog}
              onMessageBranch={forkMessage}
              onUserMessageEdit={editUserMessage}
              onNewSessionProjectChange={changeNewSessionProject}
              onOpenVoiceSettings={() => openSettings("general")}
              onQuestionResolve={resolveQuestionPrompt}
              onRemoveAttachment={removeComposerAttachment}
              onSlashCommandSelect={runSlashCommand}
              onSubmit={submitMessage}
              onAbortRun={abortActiveRun}
              projects={projects}
              questionPrompt={visibleQuestionPrompt}
              runtimeAgentProviders={agentProviders}
              selectedProjectId={newSessionProjectId}
              selectedSubagentIds={selectedSubagentIds}
              slashCommands={slashCommands}
              subagents={appSettings.subagents}
              transcriptionConfig={transcriptionConfig}
              onSubagentSelectionChange={setSelectedSubagentIds}
            />
          </section>
        </main>

        <RightSidebar
          activeTabId={rightSidebarState.activeTabId}
          agentContext={rightSidebarAgentContext}
          onAddPanel={openRightPanelTab}
          onCloseTab={closeRightPanelTab}
          onResizeStart={(event) => startSidebarResize("right", event)}
          onSelectThread={setSelectedThread}
          onThreadsChanged={reloadProjects}
          open={rightOpen}
          openTabs={rightSidebarState.tabs}
          plugins={availableRightSidebarPlugins}
          resizing={resizingSide === "right"}
          setActiveTab={setActiveRightPanelTab}
          width={rightWidth}
        />

        <FloatingSidebarToggles
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          toggleLeft={() => setLeftOpen((open) => !open)}
          toggleRight={() => setRightOpen((open) => !open)}
        />
      </div>
    );

    return (
      <MotionConfig reducedMotion={settingsPreferences.reduceMotion ? "always" : "user"}>
        <div className="h-full min-w-0" style={toHomeThemeRootStyle(homeTheme)}>
          <SmallChatWindowOpeningTransition
            fullShell={fullShell}
            geometry={smallWindowOpeningGeometry}
            phase={smallWindowOpeningPhase}
            smallShell={smallShell}
          />
          {subagentCreateDialog}
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion={settingsPreferences.reduceMotion ? "always" : "user"}>
      <div className="h-full overflow-hidden bg-background text-foreground" style={toHomeThemeRootStyle(homeTheme)}>
        {activePage === "settings" ? (
          <SettingsPage
            activeSection={activeSettingsSection}
            agentEnvironments={appSettings.agentEnvironments}
            agentProviders={agentProviders}
            appSettings={appSettings}
            backLabel={activeTitle}
            onBack={() => setActivePage("chat")}
            onAgentEnvironmentSave={saveAgentEnvironment}
            onAgentProviderEnabledChange={saveAgentProviderEnabled}
            onAgentProvidersSave={saveAgentProviders}
            onSubagentsSave={saveSubagents}
            onPreferenceChange={updateSettingsPreference}
            onPluginAction={runPluginAction}
            onSectionChange={setActiveSettingsSection}
            onSpotlightShortcutChange={updateSpotlightShortcut}
            onSpotlightShortcutReset={resetSpotlightShortcut}
            onTranscriptionConfigChange={updateTranscriptionConfig}
            onToolHubEnabledChange={saveToolHubEnabled}
            onToolHubBuiltinMcpServerChange={updateToolHubBuiltinMcpServer}
            onToolHubCacheClear={clearToolHubCache}
            onToolHubLlmConfigSave={saveToolHubLlmConfig}
            onToolHubServerInstall={installToolHubServer}
            onToolHubServerRemove={removeToolHubServer}
            onToolHubServerUpdate={updateToolHubServer}
            preferences={settingsPreferences}
            pluginState={pluginState}
            transcriptionConfig={transcriptionConfig}
          />
        ) : (
          <div className="relative flex h-full overflow-hidden bg-background">
            <ProjectSidebar
              activeSettingsSection={activeSettingsSection}
              agentProviders={enabledAgentProviders}
              automationPageActive={activePage === "automations"}
              botPageActive={activePage === "bot"}
              chatActive={activePage === "chat"}
              onOpenAutomationsPage={openAutomationsPage}
              onOpenBotPage={openBotPage}
              onProjectContextMenu={openProjectContextMenu}
              onResizeStart={(event) => startSidebarResize("left", event)}
              onOpenSettings={openSettings}
              onOpenSearch={() => setSearchDialogOpen(true)}
              onStartNewSession={startNewSession}
              onStartProjectSession={(project) => startNewSession(project.id)}
              onCancelThreadRename={() => setRenamingSidebarThreadId(null)}
              onRenameThread={saveThreadTitle}
              onStartThreadRename={startThreadRename}
              onThreadContextMenu={openThreadContextMenu}
              open={leftOpen}
              projects={projects}
              renamingThreadId={renamingSidebarThreadId}
              resizing={resizingSide === "left"}
              selectedThread={selectedThread}
              setSelectedThread={selectThread}
              width={leftWidth}
            />

            <main className="relative flex min-w-0 flex-1 flex-col bg-background">
              {activePage === "bot" ? (
                <BotGatewayPage
                  leftOpen={leftOpen}
                  onBack={() => setActivePage("chat")}
                />
              ) : activePage === "automations" ? (
                <AutomationsPage
                  agentProviders={enabledAgentProviders}
                  leftOpen={leftOpen}
                  onBack={() => setActivePage("chat")}
                  projects={projects}
                />
              ) : (
                <>
                  <ThreadHeader
                    agentLogoDataUrl={activeAgentLogoDataUrl}
                    agentProviderLabel={activeAgentProviderLabel}
                    canCopyMarkdown={messages.length > 0}
                    canCopyThreadId={Boolean(selectedSidebarThread)}
                    canRename={Boolean(selectedSidebarThread)}
                    editingThread={renamingHeaderThreadId === selectedSidebarThread?.id ? selectedSidebarThread : null}
                    leftOpen={leftOpen}
                    onCancelRename={() => setRenamingHeaderThreadId(null)}
                    onCopyMarkdown={copyActiveThreadMarkdown}
                    onCopyThreadId={copyActiveThreadId}
                    onOpenSmallWindow={openActiveThreadSmallWindow}
                    onRename={renameActiveThread}
                    onSubmitRename={saveThreadTitle}
                    title={!messages.length && selectedThread === newSessionThreadId ? "" : activeTitle}
                  />
                  <section className="relative min-h-0 flex-1 overflow-hidden">
                    <ChatbotPage
                      activeStream={activeStream}
                      agentApprovalMode={agentApprovalMode}
                      approvalPrompt={visibleApprovalPrompt}
                      agentEffort={activeAgentEffort}
                      agentEffortOptions={activeAgentEffortOptions}
                      agentModel={activeAgentModel}
                      agentProviderId={activeAgentProviderId}
                      agentProviders={enabledAgentProviders}
                      agentSpeed={activeAgentSpeed}
                      agentSpeedOptions={activeAgentSpeedOptions}
                      attachments={composerAttachments}
                      branchState={projectBranchState}
                      composerValue={composerValue}
                      configuredAgentProviders={appSettings.agentProviders}
                      contextUsage={activeContextUsage}
                      homeTheme={homeTheme}
                      isNewSession={selectedThread === newSessionThreadId}
                      messages={messages}
                      onAddExistingProject={addExistingProject}
                      onAgentApprovalModeChange={setAgentApprovalMode}
                      onAgentEffortChange={(value) => setAgentEffort(normalizeAgentEffort(value))}
                      onAgentModelChange={changeAgentModel}
                      onAgentProviderCreate={createAndSelectAgentProvider}
                      onAgentProviderChange={changeAgentProvider}
                      onAgentSpeedChange={(value) => setAgentSpeed(normalizeAgentSpeed(value))}
                      onApprovalResolve={resolveApprovalPrompt}
                      onAttachFiles={addComposerAttachments}
                      onBranchChange={changeNewSessionBranch}
                      onComposerChange={setComposerValue}
                      onCreateBlankProject={createBlankProject}
                      onCreateSubagent={openSubagentCreateDialog}
                      onMessageBranch={forkMessage}
                      onUserMessageEdit={editUserMessage}
                      onNewSessionProjectChange={changeNewSessionProject}
                      onOpenVoiceSettings={() => openSettings("general")}
                      onQuestionResolve={resolveQuestionPrompt}
                      onRemoveAttachment={removeComposerAttachment}
                      onSlashCommandSelect={runSlashCommand}
                      onSubmit={submitMessage}
                      onAbortRun={abortActiveRun}
                      projects={projects}
                      questionPrompt={visibleQuestionPrompt}
                      runtimeAgentProviders={agentProviders}
                      selectedProjectId={newSessionProjectId}
                      selectedSubagentIds={selectedSubagentIds}
                      slashCommands={slashCommands}
                      subagents={appSettings.subagents}
                      transcriptionConfig={transcriptionConfig}
                      onSubagentSelectionChange={setSelectedSubagentIds}
                    />
                  </section>
                </>
              )}
            </main>

            <RightSidebar
              activeTabId={rightSidebarState.activeTabId}
              agentContext={rightSidebarAgentContext}
              onAddPanel={openRightPanelTab}
              onCloseTab={closeRightPanelTab}
              onResizeStart={(event) => startSidebarResize("right", event)}
              onSelectThread={setSelectedThread}
              onThreadsChanged={reloadProjects}
              open={rightOpen}
              openTabs={rightSidebarState.tabs}
              plugins={availableRightSidebarPlugins}
              resizing={resizingSide === "right"}
              setActiveTab={setActiveRightPanelTab}
              width={rightWidth}
            />

            <FloatingSidebarToggles
              leftOpen={leftOpen}
              rightOpen={rightOpen}
              toggleLeft={() => setLeftOpen((open) => !open)}
              toggleRight={() => setRightOpen((open) => !open)}
            />

            <ConversationSearchDialog
              agentProviders={enabledAgentProviders}
              onClose={() => setSearchDialogOpen(false)}
              onSelectThread={selectSearchResult}
              open={searchDialogOpen}
              projects={projects}
              selectedThread={selectedThread}
            />
          </div>
        )}
        {subagentCreateDialog}
      </div>
    </MotionConfig>
  );
}

function SubagentCreateDialog({
  agentProviders,
  error,
  form,
  onChange,
  onClose,
  onSave,
  open,
  saving
}: {
  agentProviders: AgentProviderOption[];
  error: string | null;
  form: SubagentSettingsForm | null;
  onChange: (key: keyof SubagentSettingsForm, value: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  open: boolean;
  saving: boolean;
}) {
  const { t } = useI18n();

  return (
    <AnimatePresence>
      {open ? (
        <AgentSettingsDialog
          footer={
            <div className="flex min-h-8 items-center justify-between gap-3">
              <p className={error ? "min-w-0 text-[12px] leading-5 text-destructive" : "min-w-0 text-[12px] leading-5 text-muted-foreground"}>
                {error ?? t("settings.subagents.unsavedInline")}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                  onClick={onClose}
                  type="button"
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                  onClick={() => void onSave()}
                  type="button"
                >
                  {t("settings.subagents.save")}
                </button>
              </div>
            </div>
          }
          key="composer-new-subagent"
          onClose={onClose}
          title={t("settings.subagents.newSubagent")}
        >
          <SubagentConfigurationEditor
            agentProviders={agentProviders}
            form={form}
            isNew
            onChange={onChange}
          />
        </AgentSettingsDialog>
      ) : null}
    </AnimatePresence>
  );
}

function getApprovalPromptDedupeKey(prompt: Pick<AgentApprovalPrompt, "approvalScope" | "method" | "params" | "providerId" | "runId" | "threadId" | "title">): string {
  return stringifyStableValue({
    method: prompt.method || "",
    params: prompt.params,
    providerId: prompt.providerId,
    runId: prompt.runId,
    scope: prompt.approvalScope || "",
    threadId: prompt.threadId,
    title: prompt.title || ""
  });
}

function stringifyStableValue(value: unknown): string {
  try {
    return JSON.stringify(sortStableValue(value));
  } catch {
    return String(value);
  }
}

function sortStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortStableValue(item)])
    );
  }

  return value;
}

function shiftNextApprovalPrompt(
  queue: AgentApprovalPrompt[],
  ignoredIds: Set<string>,
  ignoredKeys: Set<string>,
  preferredThreadId: string | null
): AgentApprovalPrompt | null {
  const preferredPrompt = takeApprovalPromptForThread(queue, preferredThreadId, ignoredIds, ignoredKeys);
  if (preferredPrompt) return preferredPrompt;

  let nextPrompt = queue.shift() ?? null;
  while (nextPrompt && isIgnoredApprovalPrompt(nextPrompt, ignoredIds, ignoredKeys)) {
    nextPrompt = queue.shift() ?? null;
  }
  return nextPrompt;
}

function shiftNextQuestionPrompt(
  queue: AgentQuestionPrompt[],
  ignoredIds: Set<string>,
  ignoredKeys: Set<string>,
  preferredThreadId: string | null
): AgentQuestionPrompt | null {
  const preferredPrompt = takeQuestionPromptForThread(queue, preferredThreadId, ignoredIds, ignoredKeys);
  if (preferredPrompt) return preferredPrompt;

  let nextPrompt = queue.shift() ?? null;
  while (nextPrompt && isIgnoredQuestionPrompt(nextPrompt, ignoredIds, ignoredKeys)) {
    nextPrompt = queue.shift() ?? null;
  }
  return nextPrompt;
}

function promoteApprovalPromptForThread(
  currentPrompt: AgentApprovalPrompt | null,
  queue: AgentApprovalPrompt[],
  threadId: string,
  ignoredIds: Set<string>,
  ignoredKeys: Set<string>
): AgentApprovalPrompt | null {
  if (currentPrompt?.threadId === threadId && !isIgnoredApprovalPrompt(currentPrompt, ignoredIds, ignoredKeys)) {
    return currentPrompt;
  }

  const nextPrompt = takeApprovalPromptForThread(queue, threadId, ignoredIds, ignoredKeys);
  if (!nextPrompt) return currentPrompt;

  if (currentPrompt && !isIgnoredApprovalPrompt(currentPrompt, ignoredIds, ignoredKeys)) {
    queue.push(currentPrompt);
  }
  return nextPrompt;
}

function promoteQuestionPromptForThread(
  currentPrompt: AgentQuestionPrompt | null,
  queue: AgentQuestionPrompt[],
  threadId: string,
  ignoredIds: Set<string>,
  ignoredKeys: Set<string>
): AgentQuestionPrompt | null {
  if (currentPrompt?.threadId === threadId && !isIgnoredQuestionPrompt(currentPrompt, ignoredIds, ignoredKeys)) {
    return currentPrompt;
  }

  const nextPrompt = takeQuestionPromptForThread(queue, threadId, ignoredIds, ignoredKeys);
  if (!nextPrompt) return currentPrompt;

  if (currentPrompt && !isIgnoredQuestionPrompt(currentPrompt, ignoredIds, ignoredKeys)) {
    queue.push(currentPrompt);
  }
  return nextPrompt;
}

function takeApprovalPromptForThread(
  queue: AgentApprovalPrompt[],
  threadId: string | null,
  ignoredIds: Set<string>,
  ignoredKeys: Set<string>
): AgentApprovalPrompt | null {
  if (!threadId) return null;

  const promptIndex = queue.findIndex((prompt) => prompt.threadId === threadId && !isIgnoredApprovalPrompt(prompt, ignoredIds, ignoredKeys));
  if (promptIndex === -1) return null;

  const [prompt] = queue.splice(promptIndex, 1);
  return prompt ?? null;
}

function isIgnoredApprovalPrompt(
  prompt: AgentApprovalPrompt,
  ignoredIds: Set<string>,
  ignoredKeys: Set<string>
): boolean {
  return ignoredIds.has(prompt.approvalId) || ignoredKeys.has(getApprovalPromptDedupeKey(prompt));
}

function takeQuestionPromptForThread(
  queue: AgentQuestionPrompt[],
  threadId: string | null,
  ignoredIds: Set<string>,
  ignoredKeys: Set<string>
): AgentQuestionPrompt | null {
  if (!threadId) return null;

  const promptIndex = queue.findIndex((prompt) => (
    prompt.threadId === threadId &&
    !isIgnoredQuestionPrompt(prompt, ignoredIds, ignoredKeys)
  ));
  if (promptIndex === -1) return null;

  const [prompt] = queue.splice(promptIndex, 1);
  return prompt ?? null;
}

function isIgnoredQuestionPrompt(
  prompt: AgentQuestionPrompt,
  ignoredIds: Set<string>,
  ignoredKeys: Set<string>
): boolean {
  return ignoredIds.has(prompt.questionId) || ignoredKeys.has(getQuestionPromptDedupeKey(prompt));
}

function getQuestionPromptDedupeKey(prompt: AgentQuestionPrompt): string {
  const questions = prompt.questions.map((question) => ({
    allowCustomAnswer: question.allowCustomAnswer === true,
    control: question.control || "",
    header: question.header || "",
    multiSelect: question.multiSelect === true,
    options: (question.options ?? []).map((option) => ({
      description: option.description || "",
      label: option.label,
      preview: option.preview || ""
    })),
    placeholder: question.placeholder || "",
    preview: question.preview || "",
    question: question.question
  }));
  return JSON.stringify({
    providerId: prompt.providerId,
    questions,
    runId: prompt.runId,
    threadId: prompt.threadId
  });
}

export default App;
