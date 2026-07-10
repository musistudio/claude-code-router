import { useToast } from "@/components/ui/toast";
import { type TFunction, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe2,
  HardDriveUpload,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  SquarePen,
  Square,
  Terminal,
  Zap,
  X,
  type LucideIcon
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { KeyboardEvent, ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer, StreamingMarkdownRenderer } from "../../../../shared/markdown-renderer";
import { type SidebarProject } from "../../../../shared/sidebar-data";
import { HeaderSelect } from "./ui-controls";
import {
  ActiveStream,
  AgentApprovalPrompt,
  AgentQuestion,
  AgentQuestionAnswer,
  AgentQuestionControl,
  AgentQuestionPrompt,
  AgentQuestionResponse,
  AgentModelOption,
  AgentProviderOption,
  AgentProviderSettingsForm,
  appendTranscription,
  appendWaveformLevel,
  ChatAgentApprovalDecision,
  ChatAgentApprovalMode,
  ChatAgentConnectionMode,
  ChatAgentEffort,
  ChatAgentSpeed,
  ChatAgentProviderId,
  ChatAttachment,
  ChatMessage,
  ChatMessagePart,
  ChatToolEvent,
  ConfiguredAgentProviderSettings,
  ConfiguredSubagentSettings,
  ContextWindowMetrics,
  createIdleWaveform,
  DictationStatus,
  filterSlashCommands,
  formatApprovalDetails,
  formatRecordingTime,
  formatTokenCount,
  getAgentApprovalModeFromLabel,
  getAgentApprovalModeLabel,
  getAgentApprovalModeOptions,
  getAgentEffortLabel,
  getAgentModelLabel,
  getAgentModelOptions,
  getAgentProviderByLabel,
  getAgentProviderConnectionMode,
  getAgentProviderLabel,
  getAgentProviderOptions,
  getAgentSpeedLabel,
  getConfiguredAgentProviderFromForm,
  getContextWindowMetrics,
  getDefaultProject,
  getDictationErrorMessage,
  getFirstEnabledSlashCommandIndex,
  getUniqueAgentProviderId,
  getMessageMarkdownContent,
  getNextEnabledSlashCommandIndex,
  getPreferredAudioMimeType,
  getProjectDisplayName,
  getProjectOptionLabel,
  getSlashCommandQuery,
  getWaveformLevel,
  iconSpringTransition,
  normalizeTranscriptionConfig,
  popoverSpringTransition,
  ProjectBranchState,
  SlashCommand,
  smoothWaveformLevel,
  stringifyApprovalValue,
  TranscriptionConfig,
  truncateText,
  UsageTokenMetrics,
  waveformBarIntervalMs,
  writeClipboardText
} from "../utils/core";
import { AgentProviderSelectOption } from "./layout";
import { AutoHeightMotion } from "./primitives";
import {
  toHomeThemeStyle,
  type HomeThemeSectionConfig,
  type ResolvedHomeTheme
} from "../utils/theme";

export function ChatbotPage({
  activeStream,
  agentApprovalMode,
  approvalPrompt,
  agentEffort,
  agentEffortOptions,
  agentModel,
  agentProviderId,
  agentProviders,
  agentSpeed,
  agentSpeedOptions,
  attachments,
  branchState,
  compact = false,
  composerValue,
  configuredAgentProviders,
  contextUsage,
  homeTheme,
  isNewSession,
  messages,
  mobile = false,
  onAddExistingProject,
  onAgentApprovalModeChange,
  onAgentEffortChange,
  onAgentModelChange,
  onAgentProviderCreate,
  onAgentProviderChange,
  onAgentSpeedChange,
  onApprovalResolve,
  onAttachFiles,
  onBranchChange,
  onComposerChange,
  onCreateBlankProject,
  onCreateSubagent,
  onMessageBranch,
  onUserMessageEdit,
  onOpenVoiceSettings,
  onQuestionResolve,
  onRemoveAttachment,
  onSlashCommandSelect,
  onSubagentSelectionChange,
  onSubmit,
  onToggleStreaming,
  onNewSessionProjectChange,
  projects,
  questionPrompt,
  runtimeAgentProviders,
  selectedProjectId,
  selectedSubagentIds,
  slashCommands,
  subagents,
  transcriptionConfig
}: {
  activeStream: ActiveStream | null;
  agentApprovalMode: ChatAgentApprovalMode;
  approvalPrompt: AgentApprovalPrompt | null;
  agentEffort: ChatAgentEffort;
  agentEffortOptions: ChatAgentEffort[];
  agentModel: string;
  agentProviderId: ChatAgentProviderId;
  agentProviders: AgentProviderOption[];
  agentSpeed: ChatAgentSpeed;
  agentSpeedOptions: ChatAgentSpeed[];
  attachments: ChatAttachment[];
  branchState: ProjectBranchState;
  compact?: boolean;
  composerValue: string;
  configuredAgentProviders: ConfiguredAgentProviderSettings[];
  contextUsage: UsageTokenMetrics | null;
  homeTheme: ResolvedHomeTheme;
  isNewSession: boolean;
  messages: ChatMessage[];
  mobile?: boolean;
  onAddExistingProject: () => Promise<void>;
  onAgentApprovalModeChange: (value: ChatAgentApprovalMode) => void;
  onAgentEffortChange: (value: string) => void;
  onAgentModelChange: (value: string) => void;
  onAgentProviderCreate: (provider: ConfiguredAgentProviderSettings) => Promise<AgentProviderOption | null | undefined>;
  onAgentProviderChange: (value: string) => void;
  onAgentSpeedChange: (value: ChatAgentSpeed) => void;
  onApprovalResolve: (decision: ChatAgentApprovalDecision, message?: string) => void;
  onAttachFiles: () => Promise<void>;
  onBranchChange: (branchName: string) => Promise<void>;
  onComposerChange: (value: string) => void;
  onCreateBlankProject: () => Promise<void>;
  onCreateSubagent: () => void;
  onMessageBranch: (message: ChatMessage) => Promise<void>;
  onUserMessageEdit: (message: ChatMessage) => void;
  onOpenVoiceSettings: () => void;
  onQuestionResolve: (response: AgentQuestionResponse) => void;
  onRemoveAttachment: (attachmentPath: string) => void;
  onSlashCommandSelect: (command: SlashCommand) => void;
  onSubmit: () => void;
  onToggleStreaming: () => void;
  onNewSessionProjectChange: (projectId: string) => void;
  projects: SidebarProject[];
  questionPrompt: AgentQuestionPrompt | null;
  runtimeAgentProviders: AgentProviderOption[];
  selectedProjectId: string;
  selectedSubagentIds: string[];
  slashCommands: SlashCommand[];
  subagents: ConfiguredSubagentSettings[];
  transcriptionConfig: TranscriptionConfig;
  onSubagentSelectionChange: (subagentIds: string[]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const emptySession = (!compact || mobile) && isNewSession && messages.length === 0 && !activeStream;
  const assistantMessageTheme = homeTheme.sections.assistantMessage;
  const chatbotTheme = homeTheme.sections.chatbot;
  const chatbotScrollTheme = homeTheme.sections.chatbotScroll;
  const markdownTheme = homeTheme.sections.markdown;
  const userMessageTheme = homeTheme.sections.userMessage;
  const contextWindowMetrics = useMemo(
    () => getContextWindowMetrics({
      attachments,
      composerValue,
      messages,
      model: agentModel,
      modelOptions: getAgentModelOptions(agentProviders, agentProviderId),
      providerId: agentProviderId,
      usage: contextUsage
    }),
    [agentModel, agentProviderId, agentProviders, attachments, composerValue, contextUsage, messages]
  );

  const requestScrollToBottom = useCallback(() => {
    if (!stickToBottomRef.current || scrollFrameRef.current !== null) return;

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const scrollElement = scrollRef.current;
      if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
    });
  }, []);

  useEffect(() => {
    requestScrollToBottom();
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages, requestScrollToBottom]);

  const handleScroll = () => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const distanceFromBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 240;
  };

  if (emptySession) {
    return (
      <NewSessionPage
        composerValue={composerValue}
        agentApprovalMode={agentApprovalMode}
        approvalPrompt={approvalPrompt}
        agentEffort={agentEffort}
        agentEffortOptions={agentEffortOptions}
        agentModel={agentModel}
        agentProviderId={agentProviderId}
        agentProviders={agentProviders}
        agentSpeed={agentSpeed}
        agentSpeedOptions={agentSpeedOptions}
        attachments={attachments}
        branchState={branchState}
        configuredAgentProviders={configuredAgentProviders}
        onComposerChange={onComposerChange}
        homeTheme={homeTheme}
        onAddExistingProject={onAddExistingProject}
        onAgentApprovalModeChange={onAgentApprovalModeChange}
        onAgentEffortChange={onAgentEffortChange}
        onAgentModelChange={onAgentModelChange}
        onAgentProviderCreate={onAgentProviderCreate}
        onAgentProviderChange={onAgentProviderChange}
        onAgentSpeedChange={onAgentSpeedChange}
        onApprovalResolve={onApprovalResolve}
        onAttachFiles={onAttachFiles}
        onBranchChange={onBranchChange}
        onCreateBlankProject={onCreateBlankProject}
        onCreateSubagent={onCreateSubagent}
        onProjectChange={onNewSessionProjectChange}
        onOpenVoiceSettings={onOpenVoiceSettings}
        onQuestionResolve={onQuestionResolve}
        onRemoveAttachment={onRemoveAttachment}
        onSlashCommandSelect={onSlashCommandSelect}
        onSubagentSelectionChange={onSubagentSelectionChange}
        onSubmit={onSubmit}
        projects={projects}
        questionPrompt={questionPrompt}
        runtimeAgentProviders={runtimeAgentProviders}
        selectedProjectId={selectedProjectId}
        selectedSubagentIds={selectedSubagentIds}
        slashCommands={slashCommands}
        subagents={subagents}
        mobile={mobile}
      />
    );
  }

  return (
    <div className={cn("chatbot-page relative h-full overflow-hidden bg-background", chatbotTheme.className)} style={toHomeThemeStyle(chatbotTheme.style)}>
      <div
        className={cn(
          "chatbot-scroll h-full overflow-auto",
          chatbotScrollTheme.className,
          mobile ? "px-4 pb-[174px] pt-2" : compact ? "px-4 pb-[132px] pt-3" : "px-[clamp(24px,4.6vw,88px)] pb-[154px] pt-6"
        )}
        onScroll={handleScroll}
        ref={scrollRef}
        style={toHomeThemeStyle(chatbotScrollTheme.style)}
      >
        <div className={cn("mx-auto flex w-full flex-col", compact ? "max-w-none gap-4" : "max-w-[960px] gap-7")}>
          <div className={compact ? "space-y-4" : "space-y-7"}>
            {messages.map((message) => (
              <ChatMessageRow
                activeStream={activeStream}
                assistantMessageTheme={assistantMessageTheme}
                compact={compact}
                key={message.id}
                markdownTheme={markdownTheme}
                message={message}
                onMessageBranch={onMessageBranch}
                onStreamFrame={requestScrollToBottom}
                onUserMessageEdit={onUserMessageEdit}
                userMessageTheme={userMessageTheme}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className={cn("chatbot-bottom-overlay pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-background", mobile ? "h-[174px]" : compact ? "h-[132px]" : "h-[154px]")}
      />
      <FollowUpComposer
        activeStream={activeStream}
        agentApprovalMode={agentApprovalMode}
        approvalPrompt={approvalPrompt}
        agentEffort={agentEffort}
        agentEffortOptions={agentEffortOptions}
        agentModel={agentModel}
        agentProviderId={agentProviderId}
        agentProviders={agentProviders}
        agentSpeed={agentSpeed}
        agentSpeedOptions={agentSpeedOptions}
        attachments={attachments}
        compact={compact}
        contextWindowMetrics={contextWindowMetrics}
        mobile={mobile}
        onAgentApprovalModeChange={onAgentApprovalModeChange}
        onAgentEffortChange={onAgentEffortChange}
        onAgentModelChange={onAgentModelChange}
        onAgentSpeedChange={onAgentSpeedChange}
        onApprovalResolve={onApprovalResolve}
        onAttachFiles={onAttachFiles}
        onChange={onComposerChange}
        onCreateSubagent={onCreateSubagent}
        onOpenVoiceSettings={onOpenVoiceSettings}
        onQuestionResolve={onQuestionResolve}
        onRemoveAttachment={onRemoveAttachment}
        onSlashCommandSelect={onSlashCommandSelect}
        onSubagentSelectionChange={onSubagentSelectionChange}
        onSubmit={onSubmit}
        onToggleStreaming={onToggleStreaming}
        questionPrompt={questionPrompt}
        selectedSubagentIds={selectedSubagentIds}
        slashCommands={slashCommands}
        subagents={subagents}
        transcriptionConfig={transcriptionConfig}
        value={composerValue}
      />
    </div>
  );
}

export function NewSessionPage({
  agentApprovalMode,
  approvalPrompt,
  agentEffort,
  agentEffortOptions,
  agentModel,
  agentProviderId,
  agentProviders,
  agentSpeed,
  agentSpeedOptions,
  attachments,
  branchState,
  composerValue,
  configuredAgentProviders,
  homeTheme,
  onComposerChange,
  onAddExistingProject,
  onAgentApprovalModeChange,
  onAgentEffortChange,
  onAgentModelChange,
  onAgentProviderCreate,
  onAgentProviderChange,
  onAgentSpeedChange,
  onApprovalResolve,
  onAttachFiles,
  onBranchChange,
  onCreateBlankProject,
  onCreateSubagent,
  onProjectChange,
  onOpenVoiceSettings,
  onQuestionResolve,
  onRemoveAttachment,
  onSlashCommandSelect,
  onSubagentSelectionChange,
  onSubmit,
  projects,
  questionPrompt,
  runtimeAgentProviders,
  selectedProjectId,
  selectedSubagentIds,
  slashCommands,
  subagents,
  mobile = false
}: {
  agentApprovalMode: ChatAgentApprovalMode;
  approvalPrompt: AgentApprovalPrompt | null;
  agentEffort: ChatAgentEffort;
  agentEffortOptions: ChatAgentEffort[];
  agentModel: string;
  agentProviderId: ChatAgentProviderId;
  agentProviders: AgentProviderOption[];
  agentSpeed: ChatAgentSpeed;
  agentSpeedOptions: ChatAgentSpeed[];
  attachments: ChatAttachment[];
  branchState: ProjectBranchState;
  composerValue: string;
  configuredAgentProviders: ConfiguredAgentProviderSettings[];
  homeTheme: ResolvedHomeTheme;
  onComposerChange: (value: string) => void;
  onAddExistingProject: () => Promise<void>;
  onAgentApprovalModeChange: (value: ChatAgentApprovalMode) => void;
  onAgentEffortChange: (value: string) => void;
  onAgentModelChange: (value: string) => void;
  onAgentProviderCreate: (provider: ConfiguredAgentProviderSettings) => Promise<AgentProviderOption | null | undefined>;
  onAgentProviderChange: (value: string) => void;
  onAgentSpeedChange: (value: ChatAgentSpeed) => void;
  onApprovalResolve: (decision: ChatAgentApprovalDecision, message?: string) => void;
  onAttachFiles: () => Promise<void>;
  onBranchChange: (branchName: string) => Promise<void>;
  onCreateBlankProject: () => Promise<void>;
  onCreateSubagent: () => void;
  onProjectChange: (projectId: string) => void;
  onOpenVoiceSettings: () => void;
  onQuestionResolve: (response: AgentQuestionResponse) => void;
  onRemoveAttachment: (attachmentPath: string) => void;
  onSlashCommandSelect: (command: SlashCommand) => void;
  onSubagentSelectionChange: (subagentIds: string[]) => void;
  onSubmit: () => void;
  projects: SidebarProject[];
  questionPrompt: AgentQuestionPrompt | null;
  runtimeAgentProviders: AgentProviderOption[];
  selectedProjectId: string;
  selectedSubagentIds: string[];
  slashCommands: SlashCommand[];
  subagents: ConfiguredSubagentSettings[];
  mobile?: boolean;
}) {
  const { t } = useI18n();
  const homeSectionTheme = homeTheme.sections.home;
  const heroTheme = homeTheme.sections.hero;

  return (
    <div
      className={cn("home-session-page h-full overflow-auto", mobile ? "px-4" : "px-[clamp(28px,5vw,88px)]", homeSectionTheme.className)}
      style={toHomeThemeStyle(homeSectionTheme.style)}
    >
      <div className={cn("mx-auto flex min-h-full w-full max-w-[940px] flex-col", mobile ? "items-stretch justify-start pb-6 pt-4" : "items-center justify-center pb-[13vh] pt-14")}>
        <div
          aria-level={2}
          className={cn(
            "home-session-title flex max-w-[780px] flex-wrap items-center font-medium",
            mobile ? "mb-5 justify-start gap-x-1.5 gap-y-1 text-left text-[28px] leading-[1.12]" : "mb-8 justify-center gap-x-2 gap-y-1 text-center text-[31px] leading-[1.2]",
            heroTheme.className
          )}
          role="heading"
          style={toHomeThemeStyle(heroTheme.style)}
        >
          <span>{t("newSession.questionPrefix")}</span>
          <NewSessionProjectPicker
            onAddExistingProject={onAddExistingProject}
            onCreateBlankProject={onCreateBlankProject}
            onProjectChange={onProjectChange}
            placement="bottom"
            projects={projects}
            selectedProjectId={selectedProjectId}
            variant="title"
          />
          <span>{t("newSession.questionSuffix")}</span>
        </div>

        <NewSessionComposer
          agentApprovalMode={agentApprovalMode}
          approvalPrompt={approvalPrompt}
          agentEffort={agentEffort}
          agentEffortOptions={agentEffortOptions}
          agentModel={agentModel}
          agentProviderId={agentProviderId}
          agentProviders={agentProviders}
          agentSpeed={agentSpeed}
          agentSpeedOptions={agentSpeedOptions}
          attachments={attachments}
          branchState={branchState}
          configuredAgentProviders={configuredAgentProviders}
          homeTheme={homeTheme}
          onAddExistingProject={onAddExistingProject}
          onAgentApprovalModeChange={onAgentApprovalModeChange}
          onAgentEffortChange={onAgentEffortChange}
          onAgentModelChange={onAgentModelChange}
          onAgentProviderCreate={onAgentProviderCreate}
          onAgentProviderChange={onAgentProviderChange}
          onAgentSpeedChange={onAgentSpeedChange}
          onApprovalResolve={onApprovalResolve}
          onAttachFiles={onAttachFiles}
          onBranchChange={onBranchChange}
          onChange={onComposerChange}
          onCreateBlankProject={onCreateBlankProject}
          onCreateSubagent={onCreateSubagent}
          onOpenVoiceSettings={onOpenVoiceSettings}
          onProjectChange={onProjectChange}
          onQuestionResolve={onQuestionResolve}
          onRemoveAttachment={onRemoveAttachment}
          onSlashCommandSelect={onSlashCommandSelect}
          onSubagentSelectionChange={onSubagentSelectionChange}
          onSubmit={onSubmit}
          projects={projects}
          questionPrompt={questionPrompt}
          runtimeAgentProviders={runtimeAgentProviders}
          selectedProjectId={selectedProjectId}
          selectedSubagentIds={selectedSubagentIds}
          slashCommands={slashCommands}
          subagents={subagents}
          mobile={mobile}
          value={composerValue}
        />
      </div>
    </div>
  );
}

export function useSlashCommandController({
  commands,
  onSelect,
  value
}: {
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  value: string;
}) {
  const [dismissedValue, setDismissedValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const query = getSlashCommandQuery(value);
  const visibleCommands = useMemo(
    () => query === null || dismissedValue === value ? [] : filterSlashCommands(commands, query),
    [commands, dismissedValue, query, value]
  );
  const open = visibleCommands.length > 0;

  useEffect(() => {
    setSelectedIndex(getFirstEnabledSlashCommandIndex(visibleCommands));
  }, [visibleCommands]);

  const selectCommand = useCallback((command: SlashCommand) => {
    if (command.disabled) return;
    setDismissedValue("");
    onSelect(command);
  }, [onSelect]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((currentIndex) => getNextEnabledSlashCommandIndex(visibleCommands, currentIndex, 1));
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((currentIndex) => getNextEnabledSlashCommandIndex(visibleCommands, currentIndex, -1));
      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const command = visibleCommands[selectedIndex];
      if (command && !command.disabled) {
        selectCommand(command);
      }
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedValue(value);
      return true;
    }

    return false;
  }, [open, selectCommand, selectedIndex, value, visibleCommands]);

  return {
    commands: visibleCommands,
    onKeyDown,
    open,
    selectCommand,
    selectedIndex,
    setSelectedIndex
  };
}

export function SlashCommandMenu({
  commands,
  onHover,
  onSelect,
  open,
  selectedIndex
}: {
  commands: SlashCommand[];
  onHover: (index: number) => void;
  onSelect: (command: SlashCommand) => void;
  open: boolean;
  selectedIndex: number;
}) {
  const { t } = useI18n();

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          aria-label={t("slash.menuAria")}
          className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-md border border-border bg-popover p-0.5 shadow-[0_14px_30px_rgba(0,0,0,.16)]"
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          key="slash-command-menu"
          role="listbox"
          style={{ transformOrigin: "bottom center" }}
          transition={{
            opacity: { duration: 0.12, ease: "easeOut" },
            scale: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
            y: { duration: 0.18, ease: [0.16, 1, 0.3, 1] }
          }}
        >
          <div className="max-h-[240px] overflow-y-auto">
            {commands.map((command, index) => {
              const Icon = command.icon;
              const selected = index === selectedIndex;

              return (
                <button
                  aria-disabled={command.disabled || undefined}
                  aria-selected={selected}
                  className={cn(
                    "flex h-8 w-full min-w-0 items-center gap-1.5 rounded px-1.5 text-left outline-none transition-colors",
                    selected && !command.disabled ? "bg-muted text-foreground" : "text-popover-foreground hover:bg-muted/70",
                    command.disabled && "cursor-not-allowed opacity-50"
                  )}
                  disabled={command.disabled}
                  key={command.id}
                  onClick={() => onSelect(command)}
                  onMouseEnter={() => onHover(index)}
                  role="option"
                  title={command.description ? `${command.title} ${command.description}` : command.title}
                  type="button"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] text-primary">
                    {command.logoDataUrl ? (
                      <img
                        alt=""
                        className="h-4 w-4 rounded-[4px] border border-border/70 object-cover"
                        draggable={false}
                        src={command.logoDataUrl}
                      />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span
                      className={cn(
                        "truncate text-[12px] font-medium leading-4",
                        command.description ? "max-w-[48%] shrink-0" : "min-w-0 flex-1"
                      )}
                    >
                      {command.title}
                    </span>
                    {command.description ? (
                      <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-muted-foreground">{command.description}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type AgentRunSettingsView = "model" | "root" | "speed";

function AgentRunSettingsSelect({
  agentEffort,
  agentEffortOptions,
  agentModel,
  agentSpeed,
  agentSpeedOptions,
  buttonClassName,
  modelFallbackLabel,
  modelOptions,
  onAgentEffortChange,
  onAgentModelChange,
  onAgentSpeedChange,
  placement = "bottom"
}: {
  agentEffort: ChatAgentEffort;
  agentEffortOptions: ChatAgentEffort[];
  agentModel: string;
  agentSpeed: ChatAgentSpeed;
  agentSpeedOptions: ChatAgentSpeed[];
  buttonClassName?: string;
  modelFallbackLabel: string;
  modelOptions: AgentModelOption[];
  onAgentEffortChange: (value: string) => void;
  onAgentModelChange: (value: string) => void;
  onAgentSpeedChange: (value: ChatAgentSpeed) => void;
  placement?: "bottom" | "top";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AgentRunSettingsView>("root");
  const modelValue = getAgentModelLabel(agentModel, modelOptions, modelFallbackLabel);
  const supportsEffort = agentEffortOptions.length > 0;
  const effortLabel = supportsEffort ? getAgentEffortLabel(agentEffort, t) : "";
  const speedLabel = getAgentSpeedLabel(agentSpeed, t);
  const summaryLabel = supportsEffort ? `${modelValue} · ${effortLabel}` : modelValue;
  const supportsSpeed = agentSpeedOptions.length > 0;
  const showFastIcon = supportsSpeed && agentSpeed === "fast";

  useEffect(() => {
    if (!supportsSpeed && view === "speed") setView("root");
  }, [supportsSpeed, view]);

  const close = () => {
    setOpen(false);
    setView("root");
  };

  return (
    <div className="relative inline-flex shrink-0">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("agent.runSettings")}
        className={cn(
          "inline-flex h-8 max-w-[260px] items-center justify-between gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-left text-[12px] outline-none transition-colors hover:bg-muted hover:text-foreground",
          buttonClassName
        )}
        onClick={() => {
          setOpen((nextOpen) => !nextOpen);
          setView("root");
        }}
        title={t("agent.runSettings")}
        type="button"
      >
        {showFastIcon ? <Zap className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
        <span className="min-w-0 flex-1 truncate">{summaryLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <>
          <button aria-label={t("agent.runSettings")} className="fixed inset-0 z-40 cursor-default" onClick={close} type="button" />
          <div
            className={cn(
              "codex-dialog absolute right-0 z-50 w-[min(280px,calc(100vw-32px))] rounded-md border border-border bg-popover p-1 codex-elevated",
              placement === "top" ? "bottom-full mb-1" : "mt-1"
            )}
            role="menu"
          >
            {view === "root" ? (
              <>
                {supportsEffort ? (
                  <>
                    <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold text-muted-foreground">{t("agent.effort")}</div>
                    <div className="max-h-[190px] overflow-y-auto">
                      {agentEffortOptions.map((effort) => {
                        const selected = effort === agentEffort;
                        return (
                          <button
                            aria-checked={selected}
                            className={cn(
                              "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground",
                              selected && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                            key={effort}
                            onClick={() => {
                              onAgentEffortChange(effort);
                              close();
                            }}
                            role="menuitemradio"
                            type="button"
                          >
                            <span className="min-w-0 flex-1 truncate font-medium">{getAgentEffortLabel(effort, t)}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="my-1 h-px bg-border" />
                  </>
                ) : null}
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setView("model")}
                  role="menuitem"
                  type="button"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="truncate font-medium">{t("agent.model")}</strong>
                    <small className="truncate text-[11px] text-muted-foreground">{modelValue}</small>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
                {supportsSpeed ? (
                  <button
                    className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setView("speed")}
                    role="menuitem"
                    type="button"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <strong className="truncate font-medium">{t("agent.speed")}</strong>
                      <small className="truncate text-[11px] text-muted-foreground">{speedLabel}</small>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ) : null}
              </>
            ) : null}

            {view === "model" ? (
              <>
                <button
                  className="mb-1 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setView("root")}
                  role="menuitem"
                  type="button"
                >
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <strong className="truncate font-medium">{t("agent.model")}</strong>
                </button>
                <div className="max-h-[240px] overflow-y-auto">
                  {modelOptions.length ? modelOptions.map((model) => {
                    const selected = model.value === agentModel;
                    return (
                      <button
                        aria-checked={selected}
                        className={cn(
                          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground",
                          selected && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                        key={model.value}
                        onClick={() => {
                          onAgentModelChange(model.value);
                          close();
                        }}
                        role="menuitemradio"
                        type="button"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">{model.label}</span>
                      </button>
                    );
                  }) : (
                    <div className="px-2 py-2 text-[12px] text-muted-foreground">{modelFallbackLabel}</div>
                  )}
                </div>
              </>
            ) : null}

            {supportsSpeed && view === "speed" ? (
              <>
                <button
                  className="mb-1 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setView("root")}
                  role="menuitem"
                  type="button"
                >
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <strong className="truncate font-medium">{t("agent.speed")}</strong>
                </button>
                <div className="max-h-[240px] overflow-y-auto">
                  {agentSpeedOptions.map((speed) => {
                    const selected = speed === agentSpeed;
                    return (
                      <button
                        aria-checked={selected}
                        className={cn(
                          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground",
                          selected && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                        key={speed}
                        onClick={() => {
                          onAgentSpeedChange(speed);
                          close();
                        }}
                        role="menuitemradio"
                        type="button"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">{getAgentSpeedLabel(speed, t)}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

type ComposerAttachmentSubmenuSide = "left" | "right";

function ComposerAttachmentMenu({
  buttonClassName,
  onAttachFiles,
  onCreateSubagent,
  onSubagentSelectionChange,
  placement = "bottom",
  selectedSubagentIds,
  subagents
}: {
  buttonClassName?: string;
  onAttachFiles: () => Promise<void>;
  onCreateSubagent: () => void;
  onSubagentSelectionChange: (subagentIds: string[]) => void;
  placement?: "bottom" | "top";
  selectedSubagentIds: string[];
  subagents: ConfiguredSubagentSettings[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [subagentMenuOpen, setSubagentMenuOpen] = useState(false);
  const [subagentMenuSide, setSubagentMenuSide] = useState<ComposerAttachmentSubmenuSide>("right");
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedIdSet = useMemo(() => new Set(selectedSubagentIds), [selectedSubagentIds]);
  const selectedCount = subagents.filter((subagent) => selectedIdSet.has(subagent.id)).length;
  const subagentsSummary = selectedCount > 0 ? t("agent.subagentsCount", { count: selectedCount }) : t("agent.subagents");

  const toggleSubagent = (subagentId: string) => {
    const nextIds = selectedIdSet.has(subagentId)
      ? selectedSubagentIds.filter((id) => id !== subagentId)
      : [...selectedSubagentIds, subagentId];
    onSubagentSelectionChange(nextIds);
  };

  const close = () => {
    setOpen(false);
    setSubagentMenuOpen(false);
  };

  const attachFiles = () => {
    close();
    void onAttachFiles();
  };

  const createSubagent = () => {
    close();
    onCreateSubagent();
  };

  const openSubagentMenu = () => {
    const menuRect = menuRef.current?.getBoundingClientRect();
    if (menuRect) {
      const submenuWidth = Math.min(320, Math.max(0, window.innerWidth - 32));
      const gap = 4;
      const spaceRight = window.innerWidth - menuRect.right;
      const spaceLeft = menuRect.left;
      setSubagentMenuSide(spaceRight >= submenuWidth + gap || spaceRight >= spaceLeft ? "right" : "left");
    }
    setSubagentMenuOpen(true);
  };

  return (
    <div className="relative inline-flex shrink-0">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("newSession.addMenu")}
        className={cn(
          "relative grid place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground",
          selectedCount > 0 && "text-primary",
          buttonClassName
        )}
        onClick={() => {
          setOpen((currentOpen) => !currentOpen);
          setSubagentMenuOpen(false);
        }}
        title={selectedCount > 0 ? subagentsSummary : t("newSession.addMenu")}
        type="button"
      >
        <Plus className="h-[16px] w-[16px]" />
        {selectedCount > 0 ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" /> : null}
      </button>

      {open ? (
        <>
          <button aria-label={t("newSession.addMenu")} className="fixed inset-0 z-40 cursor-default" onClick={close} type="button" />
          <div
            className={cn(
              "codex-dialog absolute left-0 z-50 w-[min(320px,calc(100vw-32px))] rounded-md border border-border bg-popover p-1 codex-elevated",
              placement === "top" ? "bottom-full mb-1" : "mt-1"
            )}
            ref={menuRef}
            role="menu"
          >
            <button
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground"
              onClick={attachFiles}
              role="menuitem"
              type="button"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-medium">{t("newSession.attach")}</span>
            </button>
            <button
              aria-expanded={subagentMenuOpen}
              className={cn(
                "flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground",
                subagentMenuOpen && "bg-muted text-foreground"
              )}
              onClick={openSubagentMenu}
              role="menuitem"
              title={subagentsSummary}
              type="button"
            >
              <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t("newSession.attachSubagents")}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {subagents.length ? subagentsSummary : t("agent.subagentsEmpty")}
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>

            {subagentMenuOpen ? (
              <div
                className={cn(
                  "codex-dialog absolute top-0 z-50 w-[min(320px,calc(100vw-32px))] rounded-md border border-border bg-popover p-1 codex-elevated",
                  subagentMenuSide === "right" ? "left-full ml-1" : "right-full mr-1"
                )}
                role="menu"
              >
                <button
                  className="mb-1 flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground"
                  onClick={createSubagent}
                  role="menuitem"
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-medium">{t("newSession.addNewSubagent")}</span>
                  {selectedCount > 0 ? <span className="shrink-0 text-[11px] text-muted-foreground">{selectedCount}</span> : null}
                </button>
                <div className="max-h-[260px] overflow-y-auto">
                  {subagents.length ? subagents.map((subagent) => {
                    const selected = selectedIdSet.has(subagent.id);
                    return (
                      <button
                        aria-checked={selected}
                        className={cn(
                          "flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground",
                          selected && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                        key={subagent.id}
                        onClick={() => toggleSubagent(subagent.id)}
                        role="menuitemcheckbox"
                        title={subagent.description || subagent.label}
                        type="button"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border bg-card">
                          {selected ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{subagent.label}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{subagent.providerId}</span>
                        </span>
                      </button>
                    );
                  }) : (
                    <div className="rounded-md px-2 py-3 text-[12px] leading-5 text-muted-foreground">{t("agent.subagentsEmpty")}</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function NewSessionComposer({
  agentApprovalMode,
  approvalPrompt,
  agentEffort,
  agentEffortOptions,
  agentModel,
  agentProviderId,
  agentProviders,
  agentSpeed,
  agentSpeedOptions,
  attachments,
  branchState,
  configuredAgentProviders,
  homeTheme,
  onAddExistingProject,
  onAgentApprovalModeChange,
  onAgentEffortChange,
  onAgentModelChange,
  onAgentProviderCreate,
  onAgentProviderChange,
  onAgentSpeedChange,
  onApprovalResolve,
  onAttachFiles,
  onBranchChange,
  onChange,
  onCreateBlankProject,
  onCreateSubagent,
  onOpenVoiceSettings,
  onProjectChange,
  onQuestionResolve,
  onRemoveAttachment,
  onSlashCommandSelect,
  onSubagentSelectionChange,
  onSubmit,
  slashCommands,
  selectedSubagentIds,
  subagents,
  mobile = false,
  value,
  projects,
  questionPrompt,
  runtimeAgentProviders,
  selectedProjectId
}: {
  agentApprovalMode: ChatAgentApprovalMode;
  approvalPrompt: AgentApprovalPrompt | null;
  agentEffort: ChatAgentEffort;
  agentEffortOptions: ChatAgentEffort[];
  agentModel: string;
  agentProviderId: ChatAgentProviderId;
  agentProviders: AgentProviderOption[];
  agentSpeed: ChatAgentSpeed;
  agentSpeedOptions: ChatAgentSpeed[];
  attachments: ChatAttachment[];
  branchState: ProjectBranchState;
  configuredAgentProviders: ConfiguredAgentProviderSettings[];
  homeTheme: ResolvedHomeTheme;
  onAddExistingProject: () => Promise<void>;
  onAgentApprovalModeChange: (value: ChatAgentApprovalMode) => void;
  onAgentEffortChange: (value: string) => void;
  onAgentModelChange: (value: string) => void;
  onAgentProviderCreate: (provider: ConfiguredAgentProviderSettings) => Promise<AgentProviderOption | null | undefined>;
  onAgentProviderChange: (value: string) => void;
  onAgentSpeedChange: (value: ChatAgentSpeed) => void;
  onApprovalResolve: (decision: ChatAgentApprovalDecision, message?: string) => void;
  onAttachFiles: () => Promise<void>;
  onBranchChange: (branchName: string) => Promise<void>;
  onChange: (value: string) => void;
  onCreateBlankProject: () => Promise<void>;
  onCreateSubagent: () => void;
  onOpenVoiceSettings: () => void;
  onProjectChange: (projectId: string) => void;
  onQuestionResolve: (response: AgentQuestionResponse) => void;
  onRemoveAttachment: (attachmentPath: string) => void;
  onSlashCommandSelect: (command: SlashCommand) => void;
  onSubagentSelectionChange: (subagentIds: string[]) => void;
  onSubmit: () => void;
  projects: SidebarProject[];
  questionPrompt: AgentQuestionPrompt | null;
  runtimeAgentProviders: AgentProviderOption[];
  selectedProjectId: string;
  selectedSubagentIds: string[];
  slashCommands: SlashCommand[];
  subagents: ConfiguredSubagentSettings[];
  mobile?: boolean;
  value: string;
}) {
  const { t } = useI18n();
  const composerTheme = homeTheme.sections.composer;
  const toolbarTheme = homeTheme.sections.composerToolbar;
  const canSend = value.trim().length > 0;
  const providerOptions = getAgentProviderOptions(agentProviders, false);
  const providerLabel = getAgentProviderLabel(agentProviders, agentProviderId);
  const renderAgentProviderSelectOption = useCallback((option: string) => {
    const provider = getAgentProviderByLabel(agentProviders, option, false);
    return <AgentProviderSelectOption label={option} logoDataUrl={provider?.logoDataUrl} />;
  }, [agentProviders]);
  const modelOptions = getAgentModelOptions(agentProviders, agentProviderId);
  const modelFallbackLabel = t("agent.defaultModel");
  const approvalModeOptions = getAgentApprovalModeOptions(t);
  const approvalModeLabel = getAgentApprovalModeLabel(agentApprovalMode, t);
  const slashCommandController = useSlashCommandController({
    commands: slashCommands,
    onSelect: onSlashCommandSelect,
    value
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashCommandController.onKeyDown(event)) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (canSend) onSubmit();
  };

  return (
    <div className={cn("w-full", mobile ? "max-w-none" : "max-w-[720px]")}>
      <AgentInteractionSheets
        agentProviders={agentProviders}
        approvalPrompt={approvalPrompt}
        mobile={mobile}
        onApprovalResolve={onApprovalResolve}
        onQuestionResolve={onQuestionResolve}
        questionPrompt={questionPrompt}
      />
      <motion.div
        className={cn("home-composer relative z-20", composerTheme.className)}
        layout
        style={toHomeThemeStyle(composerTheme.style)}
        transition={popoverSpringTransition}
      >
        <SlashCommandMenu
          commands={slashCommandController.commands}
          onHover={slashCommandController.setSelectedIndex}
          onSelect={slashCommandController.selectCommand}
          open={slashCommandController.open}
          selectedIndex={slashCommandController.selectedIndex}
        />
        <div className={cn(mobile ? "px-3.5 pb-3 pt-3" : "px-3 pb-2 pt-2")}>
          <textarea
            className={cn(
              "w-full resize-none border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/45",
              mobile ? "h-[112px] text-[16px] leading-6" : "h-[54px] text-[14px] leading-[22px]"
            )}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("newSession.placeholder")}
            value={value}
          />
          {attachments.length ? (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {attachments.map((attachment) => (
                <motion.span
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="flex h-6 max-w-[260px] items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 text-[12px] text-foreground"
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  key={attachment.path}
                  layout
                  transition={popoverSpringTransition}
                  title={attachment.path}
                >
                  <FileText className="h-[13px] w-[13px] shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{attachment.name}</span>
                  <button
                    aria-label={t("newSession.removeAttachment", { name: attachment.name })}
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={() => onRemoveAttachment(attachment.path)}
                    type="button"
                  >
                    <X className="h-[11px] w-[11px]" />
                  </button>
                </motion.span>
                ))}
              </AnimatePresence>
            </div>
          ) : null}
          <div className={cn("flex items-center justify-between gap-2", mobile ? "flex-col items-stretch" : "flex-wrap")}>
            <div className={cn("flex min-w-0 items-center gap-1.5", mobile && "overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}>
              <ComposerAttachmentMenu
                buttonClassName={cn(mobile ? "h-10 w-10 shrink-0" : "h-7 w-7")}
                onAttachFiles={onAttachFiles}
                onCreateSubagent={onCreateSubagent}
                onSubagentSelectionChange={onSubagentSelectionChange}
                placement="bottom"
                selectedSubagentIds={selectedSubagentIds}
                subagents={subagents}
              />
              <HeaderSelect
                ariaLabel={t("agent.permissions")}
                buttonClassName={cn("text-primary", mobile ? "h-10 max-w-[180px] px-2 text-[13px]" : "h-7 max-w-[136px] px-1.5")}
                onChange={(nextLabel) => onAgentApprovalModeChange(getAgentApprovalModeFromLabel(nextLabel, t))}
                options={approvalModeOptions}
                value={approvalModeLabel}
                variant="plain"
              />
            </div>

            <div className={cn("flex min-w-0 shrink-0 items-center gap-1.5 text-[12px]", mobile ? "overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "flex-wrap justify-end")}>
              <HeaderSelect
                ariaLabel={t("agent.provider")}
                buttonClassName={cn(mobile ? "h-10 max-w-[190px] px-2 text-[13px]" : "h-7 max-w-[156px] px-1.5")}
                onChange={onAgentProviderChange}
                options={providerOptions}
                renderOption={renderAgentProviderSelectOption}
                renderValue={renderAgentProviderSelectOption}
                value={providerLabel}
                variant="plain"
              />
              <AgentRunSettingsSelect
                agentEffort={agentEffort}
                agentEffortOptions={agentEffortOptions}
                agentModel={agentModel}
                agentSpeed={agentSpeed}
                agentSpeedOptions={agentSpeedOptions}
                buttonClassName={cn(mobile ? "h-10 max-w-[260px] px-2 text-[13px]" : "h-7 max-w-[240px] px-1.5")}
                modelFallbackLabel={modelFallbackLabel}
                modelOptions={modelOptions}
                onAgentEffortChange={onAgentEffortChange}
                onAgentModelChange={onAgentModelChange}
                onAgentSpeedChange={onAgentSpeedChange}
                placement="bottom"
              />
              <button
                aria-label={t("newSession.voiceInput")}
                className={cn("grid place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", mobile ? "h-10 w-10 shrink-0" : "h-7 w-7")}
                onClick={onOpenVoiceSettings}
                title={t("newSession.voiceInput")}
                type="button"
              >
                <Mic className="h-[15px] w-[15px]" />
              </button>
              <button
                aria-label={t("chat.send")}
                className={cn(
                  "grid place-items-center rounded-full transition-[background-color,box-shadow,opacity,transform] active:scale-95 disabled:opacity-50",
                  mobile ? "h-10 w-10 shrink-0" : "h-7 w-7",
                  canSend
                    ? "bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(15,118,110,.22)] hover:scale-105"
                    : "bg-muted-foreground text-background"
                )}
                disabled={!canSend}
                onClick={onSubmit}
                type="button"
              >
                <ArrowUp className="h-[17px] w-[17px]" />
              </button>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "home-composer-toolbar flex items-center gap-2 px-3 text-[12px]",
            mobile ? "h-11 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "h-9",
            toolbarTheme.className
          )}
          style={toHomeThemeStyle(toolbarTheme.style)}
        >
          <NewSessionProjectPicker
            onAddExistingProject={onAddExistingProject}
            onCreateBlankProject={onCreateBlankProject}
            onProjectChange={onProjectChange}
            projects={projects}
            selectedProjectId={selectedProjectId}
          />
          <NewSessionConnectionModePicker
            agentProviderId={agentProviderId}
            agentProviders={agentProviders}
            configuredAgentProviders={configuredAgentProviders}
            runtimeAgentProviders={runtimeAgentProviders}
            onAgentProviderCreate={onAgentProviderCreate}
            onAgentProviderChange={onAgentProviderChange}
          />
          <NewSessionBranchPicker branchState={branchState} onBranchChange={onBranchChange} />
        </div>
      </motion.div>
    </div>
  );
}

export function NewSessionProjectPicker({
  onAddExistingProject,
  onCreateBlankProject,
  onProjectChange,
  placement = "top",
  projects,
  selectedProjectId,
  variant = "toolbar"
}: {
  onAddExistingProject: () => Promise<void>;
  onCreateBlankProject: () => Promise<void>;
  onProjectChange: (projectId: string) => void;
  placement?: "bottom" | "top";
  projects: SidebarProject[];
  selectedProjectId: string;
  variant?: "title" | "toolbar";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? getDefaultProject(projects);
  const selectedLabel = selectedProject ? getProjectDisplayName(selectedProject) : t("newSession.noProjects");
  const selectedTitle = selectedProject ? getProjectOptionLabel(selectedProject) : t("newSession.noProjects");
  const titleVariant = variant === "title";

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const selectProject = (project: SidebarProject) => {
    onProjectChange(project.id);
    setOpen(false);
  };

  const runProjectAction = (action: () => Promise<void>) => {
    setOpen(false);
    void action();
  };

  return (
    <div className={cn("relative min-w-0", titleVariant && "inline-flex max-w-full align-baseline")} ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("newSession.projectMenu")}
        className={cn(
          "min-w-0 transition",
          titleVariant
            ? "inline-flex max-w-[min(520px,calc(100vw-64px))] items-center rounded-md px-1.5 font-semibold text-primary hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
            : "flex h-7 max-w-[260px] items-center gap-1.5 rounded-md px-1.5 hover:bg-background/70 hover:text-foreground"
        )}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        title={selectedTitle}
        type="button"
      >
        {titleVariant ? null : <Folder className="h-[15px] w-[15px] shrink-0" />}
        <span className="min-w-0 truncate">{selectedLabel}</span>
        {titleVariant ? null : <ChevronDown className="h-[13px] w-[13px] shrink-0" />}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              "absolute left-0 z-50 w-[min(420px,calc(100vw-48px))] rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_48px_rgba(15,23,42,.18)]",
              placement === "top" ? "bottom-8 origin-bottom-left" : "top-full mt-2 origin-top-left"
            )}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            role="menu"
            transition={popoverSpringTransition}
          >
            <div className="max-h-[240px] overflow-auto">
              {projects.length ? (
                projects.map((project) => {
                  const active = project.id === selectedProject?.id;
                  return (
                    <button
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition hover:bg-muted",
                        active && "bg-muted text-foreground"
                      )}
                      key={project.id}
                      onClick={() => selectProject(project)}
                      role="menuitem"
                      title={getProjectOptionLabel(project)}
                      type="button"
                    >
                      <Folder className="h-[15px] w-[15px] shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{getProjectDisplayName(project)}</span>
                        {project.path ? <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{project.path}</span> : null}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-2.5 py-2 text-[12px] text-muted-foreground">{t("newSession.noProjects")}</div>
              )}
            </div>

            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition hover:bg-muted"
              onClick={() => runProjectAction(onCreateBlankProject)}
              role="menuitem"
              type="button"
            >
              <Plus className="h-[15px] w-[15px] text-primary" />
              <span>{t("newSession.newBlankProject")}</span>
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition hover:bg-muted"
              onClick={() => runProjectAction(onAddExistingProject)}
              role="menuitem"
              type="button"
            >
              <FolderOpen className="h-[15px] w-[15px] text-primary" />
              <span>{t("newSession.useExistingFolder")}</span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function NewSessionBranchPicker({
  branchState,
  onBranchChange
}: {
  branchState: ProjectBranchState;
  onBranchChange: (branchName: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const branchLabel = branchState.loading
    ? t("common.loading")
    : branchState.selectedBranch || branchState.currentBranch || t("newSession.noGitBranch");
  const disabled = branchState.loading || !branchState.isGitRepository || branchState.branches.length === 0;

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const selectBranch = (branchName: string) => {
    setOpen(false);
    void onBranchChange(branchName);
  };

  return (
    <div className="relative min-w-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("newSession.branch")}
        className="flex h-7 max-w-[220px] min-w-0 items-center gap-1.5 rounded-md px-1.5 transition enabled:hover:bg-background/70 enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        title={branchLabel}
        type="button"
      >
        <GitBranch className="h-[15px] w-[15px] shrink-0" />
        <span className="min-w-0 truncate">{branchLabel}</span>
        <ChevronDown className="h-[13px] w-[13px] shrink-0" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute bottom-8 left-0 z-50 w-[min(340px,calc(100vw-48px))] origin-bottom-left rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_48px_rgba(15,23,42,.18)]"
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            role="menu"
            transition={popoverSpringTransition}
          >
            <div className="max-h-[260px] overflow-auto">
              {branchState.branches.map((branch) => {
                const active = branch.name === branchState.selectedBranch;
                return (
                  <button
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition hover:bg-muted",
                      active && "bg-muted text-foreground"
                    )}
                    key={`${branch.type}:${branch.name}`}
                    onClick={() => selectBranch(branch.name)}
                    role="menuitem"
                    title={branch.name}
                    type="button"
                  >
                    <GitBranch className="h-[15px] w-[15px] shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{branch.name}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {branch.type === "remote" ? t("newSession.remoteBranch") : t("newSession.localBranch")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function NewSessionConnectionModePicker({
  agentProviderId,
  agentProviders,
  configuredAgentProviders,
  runtimeAgentProviders,
  onAgentProviderCreate,
  onAgentProviderChange
}: {
  agentProviderId: ChatAgentProviderId;
  agentProviders: AgentProviderOption[];
  configuredAgentProviders: ConfiguredAgentProviderSettings[];
  runtimeAgentProviders: AgentProviderOption[];
  onAgentProviderCreate: (provider: ConfiguredAgentProviderSettings) => Promise<AgentProviderOption | null | undefined>;
  onAgentProviderChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [configurationMode, setConfigurationMode] = useState<ChatAgentConnectionMode | null>(null);
  const [configurationForm, setConfigurationForm] = useState<AgentProviderSettingsForm | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [savingConfiguration, setSavingConfiguration] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentProvider = agentProviders.find((provider) => provider.id === agentProviderId) ?? agentProviders[0];
  const currentMode = getAgentProviderConnectionMode(currentProvider);
  const providerByMode = useMemo(() => {
    const providers = new Map<ChatAgentConnectionMode, AgentProviderOption>();
    for (const provider of agentProviders) {
      const mode = getAgentProviderConnectionMode(provider);
      if (!providers.has(mode)) providers.set(mode, provider);
    }
    return providers;
  }, [agentProviders]);
  const options: Array<{ icon: LucideIcon; label: string; mode: ChatAgentConnectionMode }> = [
    { icon: HardDriveUpload, label: t("newSession.localMode"), mode: "local" },
    { icon: Globe2, label: t("newSession.remoteMode"), mode: "remote" },
    { icon: Terminal, label: t("newSession.sshMode"), mode: "ssh" }
  ];
  const currentOption = options.find((option) => option.mode === currentMode) ?? options[0];
  const CurrentIcon = currentOption.icon;

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const selectMode = (mode: ChatAgentConnectionMode) => {
    const provider = providerByMode.get(mode);
    if (!provider) {
      setOpen(false);
      setConfigurationError(null);
      setConfigurationMode(mode);
      setConfigurationForm(createConnectionModeProviderForm(mode, configuredAgentProviders, runtimeAgentProviders, t));
      return;
    }
    onAgentProviderChange(provider.label);
    setOpen(false);
  };

  const updateConfigurationForm = (key: keyof AgentProviderSettingsForm, value: string) => {
    setConfigurationError(null);
    setConfigurationForm((currentForm) => currentForm ? { ...currentForm, [key]: value } : currentForm);
  };

  const closeConfiguration = () => {
    if (savingConfiguration) return;
    setConfigurationMode(null);
    setConfigurationForm(null);
    setConfigurationError(null);
  };

  const saveConfiguration = async () => {
    if (!configurationForm) return;

    const result = getConfiguredAgentProviderFromForm(configurationForm, configuredAgentProviders, runtimeAgentProviders, t);
    if (result.error || !result.provider) {
      setConfigurationError(result.error ?? t("settings.agents.saveFailed"));
      return;
    }

    setSavingConfiguration(true);
    setConfigurationError(null);
    try {
      await onAgentProviderCreate(result.provider);
      setConfigurationMode(null);
      setConfigurationForm(null);
    } catch (error) {
      setConfigurationError(error instanceof Error && error.message ? error.message : t("settings.agents.saveFailed"));
    } finally {
      setSavingConfiguration(false);
    }
  };

  return (
    <div className="relative min-w-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("newSession.connectionMode")}
        className="flex h-7 max-w-[180px] min-w-0 items-center gap-1.5 rounded-md px-1.5 transition hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        title={currentOption.label}
        type="button"
      >
        <CurrentIcon className="h-[15px] w-[15px] shrink-0 text-primary" />
        <span className="min-w-0 truncate">{currentOption.label}</span>
        <ChevronDown className="h-[13px] w-[13px] shrink-0" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute bottom-8 left-0 z-50 w-[min(232px,calc(100vw-32px))] origin-bottom-left rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[0_16px_42px_rgba(15,23,42,.2)]"
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            role="menu"
            transition={popoverSpringTransition}
          >
            {options.map((option) => {
              const Icon = option.icon;
              const active = option.mode === currentMode;
              const provider = providerByMode.get(option.mode);
              const unconfigured = !provider;
              return (
                <button
                  className={cn(
                    "flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] transition enabled:hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
                    active && "bg-accent text-accent-foreground ring-1 ring-primary/15 enabled:hover:bg-accent",
                    unconfigured && "text-muted-foreground hover:text-foreground"
                  )}
                  key={option.mode}
                  onClick={() => selectMode(option.mode)}
                  role="menuitem"
                  title={provider ? provider.label : option.label}
                  type="button"
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-md text-primary",
                      active ? "bg-primary/10" : "bg-muted/55",
                      unconfigured && "bg-muted/35 text-muted-foreground"
                    )}
                  >
                    <Icon className="h-[15px] w-[15px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-4">{option.label}</span>
                    <span className={cn("mt-1 block truncate text-[11px] leading-4", active ? "text-accent-foreground/75" : "text-muted-foreground")}>
                      {provider?.label ?? t("newSession.modeUnavailable")}
                    </span>
                  </span>
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ConnectionModeConfigurationDialog
        error={configurationError}
        form={configurationForm}
        mode={configurationMode}
        onChange={updateConfigurationForm}
        onClose={closeConfiguration}
        onSave={() => void saveConfiguration()}
        saving={savingConfiguration}
      />
    </div>
  );
}

function createConnectionModeProviderForm(
  mode: ChatAgentConnectionMode,
  configuredProviders: ConfiguredAgentProviderSettings[],
  runtimeProviders: AgentProviderOption[],
  t: TFunction
): AgentProviderSettingsForm {
  const usedIds = [...configuredProviders.map((provider) => provider.id), ...runtimeProviders.map((provider) => provider.id)];
  const baseId = mode === "ssh" ? "ssh-agent" : mode === "remote" ? "remote-agent" : "local-agent";
  const label = mode === "ssh"
    ? t("newSession.sshMode")
    : mode === "remote"
      ? t("newSession.remoteMode")
      : t("newSession.localMode");

  return {
    argsText: "",
    command: "",
    description: "",
    id: getUniqueAgentProviderId(baseId, usedIds),
    installCommand: "",
    label,
    logoDataUrl: "",
    modelsText: "",
    timeoutMs: "",
    transport: mode === "ssh" ? "ssh" : mode === "remote" ? "websocket" : "stdio",
    url: ""
  };
}

function ConnectionModeConfigurationDialog({
  error,
  form,
  mode,
  onChange,
  onClose,
  onSave,
  saving
}: {
  error: string | null;
  form: AgentProviderSettingsForm | null;
  mode: ChatAgentConnectionMode | null;
  onChange: (key: keyof AgentProviderSettingsForm, value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useI18n();
  if (!mode || !form) return null;

  const isSsh = mode === "ssh";
  const isRemote = mode === "remote";
  const title = isSsh ? t("newSession.sshMode") : isRemote ? t("newSession.remoteMode") : t("newSession.localMode");
  const requiresCommand = mode === "local" || isSsh;
  const requiresUrl = isRemote || isSsh;

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.form
          animate={{ opacity: 1, scale: 1, y: 0 }}
          aria-label={t("settings.agents.configure", { agent: title })}
          aria-modal="true"
          className="w-full max-w-[380px] rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,.28)]"
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
          role="dialog"
          transition={popoverSpringTransition}
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent text-primary">
              {isSsh ? <Terminal className="h-4 w-4" /> : isRemote ? <Globe2 className="h-4 w-4" /> : <HardDriveUpload className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-semibold leading-5">{t("settings.agents.configure", { agent: title })}</h2>
              <p className="truncate text-[11px] leading-4 text-muted-foreground">{t("settings.agents.unsavedInline")}</p>
            </div>
          </div>

          <div className="space-y-3">
            <ConnectionModeField
              label={t("settings.agents.label")}
              onChange={(value) => onChange("label", value)}
              placeholder={title}
              value={form.label}
            />
            {requiresUrl ? (
              <ConnectionModeField
                label={isSsh ? t("settings.agents.sshTarget") : t("settings.agents.url")}
                onChange={(value) => onChange("url", value)}
                placeholder={isSsh ? "ssh://user@example.com:22" : "ws://127.0.0.1:8787/asp"}
                value={form.url}
              />
            ) : null}
            {requiresCommand ? (
              <ConnectionModeField
                label={isSsh ? t("settings.agents.remoteCommand") : t("settings.agents.command")}
                onChange={(value) => onChange("command", value)}
                placeholder="my-agent-asp"
                value={form.command}
              />
            ) : null}
            {requiresCommand ? (
              <ConnectionModeField
                label={t("settings.agents.args")}
                multiline
                onChange={(value) => onChange("argsText", value)}
                placeholder="--stdio"
                value={form.argsText}
              />
            ) : null}
          </div>

          {error ? <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[12px] leading-5 text-destructive">{error}</div> : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-3 text-[12px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              {t("common.cancel")}
            </button>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("common.save")}
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}

function ConnectionModeField({
  label,
  multiline = false,
  onChange,
  placeholder,
  value
}: {
  label: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className="h-16 w-full resize-none rounded-md border border-input bg-card px-2 py-1.5 text-[12px] leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <input
          className="h-8 w-full rounded-md border border-input bg-card px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
    </label>
  );
}

export function ContextWindowIndicator({ metrics }: { metrics: ContextWindowMetrics }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const runtimeUsedTokens = metrics.usedTokens;
  const hasRuntimeUsage = runtimeUsedTokens !== null;
  const rawProgress = hasRuntimeUsage && metrics.limitTokens ? runtimeUsedTokens / metrics.limitTokens : hasRuntimeUsage && runtimeUsedTokens > 0 ? 0.72 : 0.18;
  const progress = Math.min(1, Math.max(0.04, rawProgress));
  const usedLabel = hasRuntimeUsage ? formatTokenCount(runtimeUsedTokens) : t("contextWindow.unknown");
  const limitLabel = metrics.limitTokens ? formatTokenCount(metrics.limitTokens) : t("contextWindow.unknown");
  const percentLabel = hasRuntimeUsage && metrics.limitTokens ? formatContextWindowPercent(runtimeUsedTokens / metrics.limitTokens) : "-";
  const progressTone = hasRuntimeUsage && metrics.limitTokens && progress >= 0.9
    ? "text-destructive"
    : hasRuntimeUsage && metrics.limitTokens && progress >= 0.75
      ? "text-amber-500"
      : "text-foreground";

  return (
    <div
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-label={t("contextWindow.aria", { limit: limitLabel, used: usedLabel })}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        type="button"
      >
        <svg aria-hidden="true" className="h-[18px] w-[18px] -rotate-90" viewBox="0 0 20 20">
          <circle cx="10" cy="10" fill="none" r={radius} stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <motion.circle
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            className={progressTone}
            cx="10"
            cy="10"
            fill="none"
            initial={false}
            r={radius}
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeLinecap="round"
            strokeWidth="3"
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        </svg>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute bottom-full right-0 z-50 mb-2 w-[232px] origin-bottom-right rounded-lg border border-border bg-popover p-3 text-left text-[12px] text-popover-foreground shadow-[0_16px_48px_rgba(15,23,42,.18)]"
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            role="tooltip"
            transition={popoverSpringTransition}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("contextWindow.used")}</span>
              <span className="font-medium tabular-nums">{usedLabel} / {limitLabel}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("contextWindow.percent")}</span>
              <span className={cn("font-medium tabular-nums", progressTone)}>{percentLabel}</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function formatContextWindowPercent(value: number): string {
  const percent = Math.min(100, Math.max(0, value * 100));
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

function AgentInteractionSheets({
  agentProviders,
  approvalPrompt,
  compact = false,
  mobile = false,
  onApprovalResolve,
  onQuestionResolve,
  questionPrompt
}: {
  agentProviders: AgentProviderOption[];
  approvalPrompt: AgentApprovalPrompt | null;
  compact?: boolean;
  mobile?: boolean;
  onApprovalResolve: (decision: ChatAgentApprovalDecision, message?: string) => void;
  onQuestionResolve: (response: AgentQuestionResponse) => void;
  questionPrompt: AgentQuestionPrompt | null;
}) {
  return (
    <>
      <AgentApprovalSheet agentProviders={agentProviders} compact={compact} mobile={mobile} onResolve={onApprovalResolve} prompt={approvalPrompt} />
      <AgentQuestionSheet compact={compact} mobile={mobile} onResolve={onQuestionResolve} prompt={approvalPrompt ? null : questionPrompt} />
    </>
  );
}

export function AgentApprovalSheet({
  agentProviders,
  compact = false,
  mobile = false,
  onResolve,
  prompt
}: {
  agentProviders: AgentProviderOption[];
  compact?: boolean;
  mobile?: boolean;
  onResolve: (decision: ChatAgentApprovalDecision, message?: string) => void;
  prompt: AgentApprovalPrompt | null;
}) {
  const { t } = useI18n();
  const approvalAgentLabel = prompt ? getAgentProviderLabel(agentProviders, prompt.providerId) : t("agent.provider");
  const approvalChoices = useMemo(() => prompt ? getApprovalSheetChoices(prompt, t, approvalAgentLabel) : [], [approvalAgentLabel, prompt, t]);
  const [selectedDecision, setSelectedDecision] = useState<ChatAgentApprovalDecision>("allow");
  const [denyMessage, setDenyMessage] = useState("");

  useEffect(() => {
    if (!prompt) return;
    const defaultChoice = getDefaultApprovalChoice(prompt);
    setSelectedDecision(defaultChoice);
    setDenyMessage("");
  }, [prompt?.approvalId]);

  const activeDecision = approvalChoices.some((choice) => choice.decision === selectedDecision)
    ? selectedDecision
    : approvalChoices[0]?.decision;
  const commandPreview = prompt ? getApprovalCommandPreview(prompt) : "";
  const detailsPreview = prompt ? getApprovalDetailsPreview(prompt, commandPreview) : "";
  const toolParametersPreview = prompt ? getApprovalToolParametersPreview(prompt) : "";
  const trimmedDenyMessage = denyMessage.trim();
  const denyMessageRequired = activeDecision === "deny";

  return (
    <AnimatePresence initial={false}>
      {prompt ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          aria-label={prompt.title || t("agent.approvalTitle")}
          className={cn(
            "pointer-events-auto relative z-30 mb-2 w-full overflow-hidden rounded-[14px] bg-card text-card-foreground shadow-[0_14px_40px_rgba(15,23,42,.14)] ring-1 ring-border/55 dark:shadow-[0_16px_44px_rgba(0,0,0,.34)] dark:ring-white/10",
            mobile ? "p-2.5" : compact ? "p-2.5" : "p-3"
          )}
          exit={{ opacity: 0, scale: 0.985, y: 16 }}
          initial={{ opacity: 0, scale: 0.985, y: 16 }}
          key={prompt.approvalId}
          layout
          role="dialog"
          style={{ transformOrigin: "bottom center" }}
          transition={popoverSpringTransition}
        >
          <div className="px-1">
            <h3 className="text-[14px] font-semibold leading-5 text-card-foreground [overflow-wrap:anywhere]">
              {prompt.title || t("agent.approvalTitle")}
            </h3>
            {detailsPreview ? (
              <pre className="mt-2 max-h-[min(18vh,104px)] overflow-auto rounded-md bg-muted/45 px-2 py-1.5 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-muted-foreground">
                {detailsPreview}
              </pre>
            ) : null}
            {toolParametersPreview ? (
              <div className="mt-2">
                <div className="mb-1 text-[11px] font-medium leading-4 text-muted-foreground">{t("agent.approvalToolParameters")}</div>
                <pre className="max-h-[min(24vh,180px)] overflow-auto rounded-md bg-muted/45 px-2 py-1.5 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-muted-foreground">
                  {toolParametersPreview}
                </pre>
              </div>
            ) : null}
          </div>

          <div className={cn("mt-2 space-y-1", mobile ? "max-h-[min(36vh,260px)] overflow-auto pr-0.5" : "max-h-[min(32vh,240px)] overflow-auto pr-1")}>
            {approvalChoices.map((choice, index) => {
              const selected = choice.decision === activeDecision;

              return (
                <AgentSheetChoiceRow
                  description={choice.description}
                  icon={choice.icon}
                  index={choice.icon ? undefined : index + 1}
                  key={choice.decision}
                  label={choice.label}
                  onSelect={() => setSelectedDecision(choice.decision)}
                  preview={choice.preview}
                  selected={selected}
                  trailing={selected ? (
                    <span aria-hidden className="ml-auto flex shrink-0 items-center gap-0.5 text-muted-foreground/70">
                      <ArrowUp className="h-[13px] w-[13px]" />
                      <ArrowDown className="h-[13px] w-[13px]" />
                    </span>
                  ) : null}
                />
              );
            })}
          </div>

          {denyMessageRequired ? (
            <div className="mt-2">
              <label className="mb-1 block text-[11px] font-medium leading-4 text-muted-foreground" htmlFor={`approval-deny-message-${prompt.approvalId}`}>
                {t("agent.approvalDenyMessageLabel")}
              </label>
              <textarea
                autoFocus
                className="min-h-[72px] w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[12px] leading-5 text-card-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                id={`approval-deny-message-${prompt.approvalId}`}
                onChange={(event) => setDenyMessage(event.target.value)}
                placeholder={t("agent.approvalDenyMessagePlaceholder", { agent: approvalAgentLabel })}
                value={denyMessage}
              />
            </div>
          ) : null}

          <AgentSheetActions
            disabled={!activeDecision || (denyMessageRequired && !trimmedDenyMessage)}
            onSkip={() => onResolve("cancel")}
            onSubmit={() => {
              if (activeDecision) onResolve(activeDecision, activeDecision === "deny" ? trimmedDenyMessage : undefined);
            }}
            skipLabel={t("agent.sheetSkip")}
            submitLabel={t("agent.sheetSubmit")}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type AgentQuestionDraft = {
  customAnswer: string;
  selectedLabels: string[];
};

function getAgentQuestionControl(question: AgentQuestion): AgentQuestionControl {
  if (question.control) return question.control;
  if (question.multiSelect) return "multi_select";
  if (question.options?.length) return "single_select";
  return "text";
}

function questionAllowsCustomAnswer(question: AgentQuestion, control = getAgentQuestionControl(question)): boolean {
  if (control === "text") return true;
  if (question.allowCustomAnswer === true) return true;
  return !question.control;
}

function isAgentQuestionAnswered(question: AgentQuestion, draft: AgentQuestionDraft): boolean {
  const control = getAgentQuestionControl(question);
  const customAnswer = questionAllowsCustomAnswer(question, control) ? draft.customAnswer.trim() : "";
  if (control === "text") return customAnswer.length > 0;
  return draft.selectedLabels.length > 0 || customAnswer.length > 0;
}

function buildAgentQuestionAnswer(question: AgentQuestion, draft: AgentQuestionDraft): AgentQuestionAnswer {
  const control = getAgentQuestionControl(question);
  const customAnswer = questionAllowsCustomAnswer(question, control) ? draft.customAnswer.trim() : "";
  const selectedOptions = (question.options ?? []).filter((option) => draft.selectedLabels.includes(option.label));
  const answer = control === "text"
    ? customAnswer
    : control === "multi_select"
      ? customAnswer
        ? [...draft.selectedLabels, customAnswer]
        : draft.selectedLabels
      : customAnswer || draft.selectedLabels[0] || "";

  return {
    answer,
    customAnswer: customAnswer || undefined,
    header: question.header,
    question: question.question,
    questionId: question.id,
    selectedOptions
  };
}

export function AgentQuestionSheet({
  compact = false,
  mobile = false,
  onResolve,
  prompt
}: {
  compact?: boolean;
  mobile?: boolean;
  onResolve: (response: AgentQuestionResponse) => void;
  prompt: AgentQuestionPrompt | null;
}) {
  const { t } = useI18n();
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AgentQuestionDraft>>({});

  useEffect(() => {
    setActiveQuestionIndex(0);
    setDrafts({});
  }, [prompt?.questionId]);

  const questions = prompt?.questions.filter((question) => question.question.trim()) ?? [];
  const currentQuestionIndex = questions.length ? Math.min(activeQuestionIndex, questions.length - 1) : 0;
  const currentQuestion = questions[currentQuestionIndex];
  const currentQuestionKey = currentQuestion ? getQuestionKey(currentQuestion.id, currentQuestionIndex) : "";
  const getDraft = (questionKey: string): AgentQuestionDraft => drafts[questionKey] ?? {
    customAnswer: "",
    selectedLabels: []
  };
  const updateDraft = (questionKey: string, updater: (draft: AgentQuestionDraft) => AgentQuestionDraft) => {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [questionKey]: updater(getDraftFromMap(currentDrafts, questionKey))
    }));
  };
  const answered = questions.length > 0 && questions.every((question, index) => {
    const draft = getDraft(getQuestionKey(question.id, index));
    return isAgentQuestionAnswered(question, draft);
  });
  const currentDraft = currentQuestion ? getDraft(currentQuestionKey) : { customAnswer: "", selectedLabels: [] };
  const currentQuestionControl = currentQuestion ? getAgentQuestionControl(currentQuestion) : "text";
  const currentCustomAllowed = currentQuestion ? questionAllowsCustomAnswer(currentQuestion, currentQuestionControl) : false;
  const currentOptions = currentQuestion?.options ?? [];
  const currentAnswered = currentQuestion ? isAgentQuestionAnswered(currentQuestion, currentDraft) : false;
  const lastQuestion = currentQuestionIndex >= questions.length - 1;
  const sheetTitle = currentQuestion?.question || prompt?.title || t("agent.questionTitle");
  const sheetPreview = currentQuestion?.preview ?? "";
  const progressLabel = questions.length > 1 ? `${currentQuestionIndex + 1} / ${questions.length}` : "";

  const submitAnswer = () => {
    if (!prompt || !currentAnswered) return;
    if (!lastQuestion) {
      setActiveQuestionIndex((index) => Math.min(index + 1, questions.length - 1));
      return;
    }
    if (!answered) return;

    const answers = questions.map((question, index): AgentQuestionAnswer => {
      const questionKey = getQuestionKey(question.id, index);
      const draft = getDraft(questionKey);
      return buildAgentQuestionAnswer(question, draft);
    });

    onResolve({ answers });
  };

  return (
    <AnimatePresence initial={false}>
      {prompt ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          aria-label={sheetTitle}
          className={cn(
            "pointer-events-auto relative z-30 mb-2 w-full overflow-hidden rounded-[14px] bg-card text-card-foreground shadow-[0_14px_40px_rgba(15,23,42,.14)] ring-1 ring-border/55 dark:shadow-[0_16px_44px_rgba(0,0,0,.34)] dark:ring-white/10",
            mobile ? "p-2.5" : compact ? "p-2.5" : "p-3"
          )}
          exit={{ opacity: 0, scale: 0.985, y: 16 }}
          initial={{ opacity: 0, scale: 0.985, y: 16 }}
          key={prompt.questionId}
          layout
          role="dialog"
          style={{ transformOrigin: "bottom center" }}
          transition={popoverSpringTransition}
        >
          <div className="px-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <h3 className="min-w-0 text-[14px] font-semibold leading-5 text-card-foreground [overflow-wrap:anywhere]">{sheetTitle}</h3>
              {progressLabel ? (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-muted-foreground">
                  {progressLabel}
                </span>
              ) : null}
            </div>
            {sheetPreview ? (
              <pre className="mt-2 max-h-[min(18vh,104px)] overflow-auto rounded-md bg-muted/45 px-2 py-1.5 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-muted-foreground">
                {sheetPreview}
              </pre>
            ) : null}
          </div>

          <div className={cn("mt-2 max-h-[min(44vh,360px)] overflow-auto pr-1", mobile && "max-h-[min(48vh,360px)]")}>
            {currentQuestion ? (
              <div className="space-y-1.5" key={currentQuestionKey}>
                {currentQuestion.header ? (
                  <div className="flex min-w-0 items-start gap-2 px-2">
                    <span className="mt-0.5 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {currentQuestion.header}
                    </span>
                  </div>
                ) : null}

                {currentQuestionControl === "dropdown" && currentOptions.length ? (
                  <label className="relative block">
                    <select
                      className="h-10 w-full appearance-none rounded-[12px] border border-input bg-card px-2.5 pr-8 text-[13px] font-semibold text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/15"
                      onChange={(event) => updateDraft(currentQuestionKey, (draft) => ({
                        ...draft,
                        customAnswer: "",
                        selectedLabels: event.target.value ? [event.target.value] : []
                      }))}
                      value={currentDraft.selectedLabels[0] ?? ""}
                    >
                      <option value="">{currentQuestion.placeholder || t("agent.questionSelectPlaceholder")}</option>
                      {currentOptions.map((option) => (
                        <option key={option.label} value={option.label}>{option.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </label>
                ) : null}

                {(currentQuestionControl === "single_select" || currentQuestionControl === "multi_select") && currentOptions.length ? (
                  <div className="grid gap-1">
                    {currentOptions.map((option, optionIndex) => {
                      const selected = currentDraft.selectedLabels.includes(option.label);
                      return (
                        <AgentSheetChoiceRow
                          description={option.description}
                          index={optionIndex + 1}
                          key={option.label}
                          label={option.label}
                          onSelect={() => updateDraft(currentQuestionKey, (draft) => {
                            if (currentQuestionControl === "multi_select") {
                              const selectedLabels = draft.selectedLabels.includes(option.label)
                                ? draft.selectedLabels.filter((label) => label !== option.label)
                                : [...draft.selectedLabels, option.label];
                              return { ...draft, selectedLabels };
                            }

                            return {
                              ...draft,
                              customAnswer: "",
                              selectedLabels: [option.label]
                            };
                          })}
                          preview={option.preview}
                          selected={selected}
                        />
                      );
                    })}
                  </div>
                ) : null}

                {currentCustomAllowed ? (
                  <AgentSheetCustomAnswer
                    onChange={(value) => updateDraft(currentQuestionKey, (draft) => ({
                      ...draft,
                      customAnswer: value,
                      selectedLabels: currentQuestionControl !== "multi_select" && value.trim() ? [] : draft.selectedLabels
                    }))}
                    placeholder={currentQuestion.placeholder || t("agent.questionCustomPlaceholder")}
                    selected={currentDraft.customAnswer.trim().length > 0}
                    value={currentDraft.customAnswer}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          <AgentSheetActions
            backLabel={t("agent.sheetBack")}
            disabled={!currentAnswered || (lastQuestion && !answered)}
            onBack={currentQuestionIndex > 0 ? () => setActiveQuestionIndex((index) => Math.max(0, index - 1)) : undefined}
            onSkip={() => onResolve({ unanswered: true })}
            onSubmit={submitAnswer}
            skipLabel={t("agent.sheetSkip")}
            submitLabel={lastQuestion ? t("agent.sheetSubmit") : t("agent.sheetNext")}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type AgentSheetChoiceRowProps = {
  description?: string;
  icon?: LucideIcon;
  index?: number;
  label: string;
  onSelect: () => void;
  preview?: string;
  selected: boolean;
  trailing?: ReactNode;
};

function AgentSheetChoiceRow({
  description,
  icon: Icon,
  index,
  label,
  onSelect,
  preview,
  selected,
  trailing
}: AgentSheetChoiceRowProps) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "group flex min-h-[42px] w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/20",
        selected
          ? "bg-accent text-accent-foreground dark:bg-primary/15 dark:text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.08] dark:hover:text-foreground"
      )}
      onClick={onSelect}
      type="button"
    >
      <AgentSheetChoiceMarker icon={Icon} index={index} selected={selected} />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px] leading-5">
        <span className={cn("font-semibold", !selected && "font-medium")}>{label}</span>
        {preview ? (
          <span className="min-w-0 break-all font-mono text-[12px] font-medium leading-5 text-muted-foreground">{preview}</span>
        ) : null}
        {description ? (
          <span className="block w-full text-[12px] font-medium leading-4 text-muted-foreground">{description}</span>
        ) : null}
      </span>
      {trailing}
    </button>
  );
}

function AgentSheetChoiceMarker({
  icon: Icon,
  index,
  selected
}: {
  icon?: LucideIcon;
  index?: number;
  selected: boolean;
}) {
  return (
    <span
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums transition-colors",
        selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}
    >
      {Icon ? <Icon className="h-[14px] w-[14px]" /> : index}
    </span>
  );
}

function AgentSheetCustomAnswer({
  onChange,
  placeholder,
  selected,
  value
}: {
  onChange: (value: string) => void;
  placeholder: string;
  selected: boolean;
  value: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[42px] w-full items-start gap-2 rounded-[12px] px-2.5 py-2 transition-colors",
        selected
          ? "bg-accent text-accent-foreground dark:bg-primary/15 dark:text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.08] dark:hover:text-foreground"
      )}
    >
      <AgentSheetChoiceMarker icon={SquarePen} selected={selected} />
      <textarea
        className="min-h-[24px] flex-1 resize-none bg-transparent pt-0.5 text-[13px] font-semibold leading-5 text-foreground outline-none placeholder:text-muted-foreground"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function AgentSheetActions({
  backLabel,
  disabled,
  onBack,
  onSkip,
  onSubmit,
  skipLabel,
  submitLabel
}: {
  backLabel?: string;
  disabled?: boolean;
  onBack?: () => void;
  onSkip: () => void;
  onSubmit: () => void;
  skipLabel: string;
  submitLabel: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 px-0.5">
      {onBack ? (
        <button
          className="mr-auto h-8 rounded-full px-2 text-[13px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.08]"
          onClick={onBack}
          type="button"
        >
          {backLabel}
        </button>
      ) : null}
      <button
        className="h-8 rounded-full px-2 text-[13px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.08]"
        onClick={onSkip}
        type="button"
      >
        {skipLabel}
      </button>
      <button
        className="flex h-8 items-center rounded-full bg-primary pl-3 pr-1.5 text-[13px] font-semibold text-primary-foreground shadow-[0_8px_18px_rgba(15,118,110,.18)] transition enabled:hover:bg-primary/90 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled}
        onClick={onSubmit}
        type="button"
      >
        <span>{submitLabel}</span>
        <span className="ml-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary-foreground/12 text-primary-foreground/90">
          <CornerDownLeft className="h-[13px] w-[13px]" />
        </span>
      </button>
    </div>
  );
}

type AgentApprovalSheetChoice = {
  decision: ChatAgentApprovalDecision;
  description?: string;
  icon?: LucideIcon;
  label: string;
  preview?: string;
};

function getApprovalSheetChoices(prompt: AgentApprovalPrompt, t: TFunction, agentLabel: string): AgentApprovalSheetChoice[] {
  const commandPreview = getApprovalCommandPreview(prompt);
  const availableDecisions = getApprovalAvailableDecisionSet(prompt);
  const choices: AgentApprovalSheetChoice[] = [];

  if (availableDecisions.has("allow")) {
    choices.push({
      decision: "allow",
      label: t("agent.approvalChoiceAllow")
    });
  }

  if (availableDecisions.has("allow-session")) {
    choices.push({
      decision: "allow-session",
      label: t("agent.approvalChoiceAllowSession"),
      preview: commandPreview
    });
  }

  if (availableDecisions.has("deny")) {
    choices.push({
      decision: "deny",
      icon: SquarePen,
      label: t("agent.approvalChoiceDeny", { agent: agentLabel })
    });
  }

  if (!choices.length && availableDecisions.has("cancel")) {
    choices.push({
      decision: "cancel",
      label: t("agent.sheetSkip")
    });
  }

  return choices;
}

function getDefaultApprovalChoice(prompt: AgentApprovalPrompt): ChatAgentApprovalDecision {
  const availableDecisions = getApprovalAvailableDecisionSet(prompt);
  if (availableDecisions.has("allow")) return "allow";
  if (availableDecisions.has("allow-session")) return "allow-session";
  if (availableDecisions.has("deny")) return "deny";
  return "cancel";
}

function getApprovalAvailableDecisionSet(prompt: AgentApprovalPrompt): Set<ChatAgentApprovalDecision> {
  const decisions: ChatAgentApprovalDecision[] = prompt.approvalOptions?.length ? prompt.approvalOptions : ["allow", "allow-session", "deny", "cancel"];
  return new Set(decisions);
}

function getApprovalCommandPreview(prompt: AgentApprovalPrompt): string {
  return getApprovalParamString(prompt.params, ["command", "toolName", "tool_name"]) || prompt.method || prompt.approvalScope || "";
}

function getApprovalDetailsPreview(prompt: AgentApprovalPrompt, commandPreview: string): string {
  if (commandPreview) return commandPreview;
  return formatApprovalDetails(prompt).trim();
}

function getApprovalToolParametersPreview(prompt: AgentApprovalPrompt): string {
  if (!isToolApprovalPrompt(prompt)) return "";

  const toolParameters = getApprovalToolParameters(prompt.params);
  return stringifyApprovalValue(toolParameters, 2400);
}

function isToolApprovalPrompt(prompt: AgentApprovalPrompt): boolean {
  if (prompt.approvalScope?.toLowerCase() === "tool") return true;
  if (prompt.method?.toLowerCase().includes("tool")) return true;
  return Boolean(getApprovalParamString(prompt.params, ["tool", "toolName", "tool_name", "name"]));
}

function getApprovalToolParameters(params: unknown): unknown {
  const extractedParameters = extractApprovalToolParameters(params);
  if (extractedParameters !== undefined) return extractedParameters;
  return params ?? {};
}

function extractApprovalToolParameters(value: unknown): unknown {
  if (!isAgentSheetRecord(value)) return undefined;

  for (const key of ["input", "arguments", "args", "parameters"]) {
    if (value[key] !== undefined) return value[key];
  }

  for (const key of ["toolCall", "tool_call", "call", "request"]) {
    const nestedParameters = extractApprovalToolParameters(value[key]);
    if (nestedParameters !== undefined) return nestedParameters;
  }

  return undefined;
}

function getApprovalParamString(value: unknown, keys: string[]): string {
  if (!isAgentSheetRecord(value)) return "";

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const input = value.input;
  if (isAgentSheetRecord(input)) {
    for (const key of keys) {
      const candidate = input[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }

  return "";
}

function isAgentSheetRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getQuestionKey(questionId: string | undefined, index: number): string {
  return questionId || `question-${index}`;
}

function getDraftFromMap(drafts: Record<string, AgentQuestionDraft>, questionKey: string): AgentQuestionDraft {
  return drafts[questionKey] ?? {
    customAnswer: "",
    selectedLabels: []
  };
}

export const ChatMessageRow = memo(function ChatMessageRow({
  activeStream,
  assistantMessageTheme,
  compact = false,
  markdownTheme,
  message,
  onMessageBranch,
  onStreamFrame,
  onUserMessageEdit,
  userMessageTheme
}: {
  activeStream: ActiveStream | null;
  assistantMessageTheme: HomeThemeSectionConfig;
  compact?: boolean;
  markdownTheme: HomeThemeSectionConfig;
  message: ChatMessage;
  onMessageBranch: (message: ChatMessage) => Promise<void>;
  onStreamFrame: () => void;
  onUserMessageEdit: (message: ChatMessage) => void;
  userMessageTheme: HomeThemeSectionConfig;
}) {
  const { t } = useI18n();
  const isAssistant = message.role === "assistant";
  const isStreamingMessage = Boolean(message.streaming && activeStream?.id === message.id);
  const hasContent = Boolean(message.content.trim());
  const hasToolEvents = Boolean(message.toolEvents?.length);
  const hasParts = Boolean(message.parts?.length);
  const showThinking = isStreamingMessage && !hasContent && !hasToolEvents && !hasParts;
  const showPersistentThinking = isStreamingMessage && Boolean(activeStream?.running) && !showThinking;
  const showAssistantActions = !showThinking && !showPersistentThinking;
  const actionContent = getMessageMarkdownContent(message);
  const canCopy = actionContent.length > 0;
  const [copySucceeded, setCopySucceeded] = useState(false);
  const [branchLoading, setBranchLoading] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyMessage = useCallback(() => {
    if (!canCopy) return;

    void writeClipboardText(actionContent)
      .then(() => {
        setCopySucceeded(true);
        if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => {
          setCopySucceeded(false);
          copyTimerRef.current = null;
        }, 1200);
      })
      .catch(() => {
        setCopySucceeded(false);
      });
  }, [actionContent, canCopy]);

  const branchMessage = useCallback(() => {
    if (branchLoading) return;
    setBranchLoading(true);
    void onMessageBranch(message).finally(() => {
      setBranchLoading(false);
    });
  }, [branchLoading, message, onMessageBranch]);

  const editUserMessage = useCallback(() => {
    if (isAssistant) return;
    onUserMessageEdit(message);
  }, [isAssistant, message, onUserMessageEdit]);

  return (
    <motion.article
      animate={{ opacity: 1, y: 0 }}
      className={cn("chat-message-row group flex w-full", !isAssistant && "justify-end")}
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      {isAssistant ? (
        <div
          className={cn("w-full min-w-0 py-1", assistantMessageTheme.className)}
          style={{ ...(toHomeThemeStyle(assistantMessageTheme.style) ?? {}), marginBottom: 0 }}
        >
          {showThinking ? (
            <ThinkingIndicator label={t("agent.thinking")} />
          ) : hasParts ? (
            <AssistantMessageParts
              activeStream={activeStream}
              compact={compact}
              isStreamingMessage={isStreamingMessage}
              markdownTheme={markdownTheme}
              onLayoutChange={onStreamFrame}
              onStreamFrame={onStreamFrame}
              parts={message.parts ?? []}
            />
          ) : isStreamingMessage && activeStream && hasContent ? (
            <StreamingMarkdownRenderer
              className={cn("w-full", markdownTheme.className, compact && "small-chat-markdown")}
              markdown={message.content}
              onDone={() => undefined}
              onFrame={onStreamFrame}
              running={activeStream.running}
              style={toHomeThemeStyle(markdownTheme.style)}
              streamKey={activeStream.streamKey}
            />
          ) : hasContent ? (
            <MarkdownRenderer
              className={cn("w-full", markdownTheme.className, compact && "small-chat-markdown")}
              markdown={message.content}
              style={toHomeThemeStyle(markdownTheme.style)}
            />
          ) : null}
          {!hasParts && hasToolEvents ? (
            <ToolEventsList active={isStreamingMessage && Boolean(activeStream?.running)} compact={compact} onLayoutChange={onStreamFrame} toolEvents={message.toolEvents ?? []} />
          ) : null}
          {showPersistentThinking ? (
            <div className={cn(hasParts || hasToolEvents || hasContent ? compact ? "mt-3" : "mt-4" : "")}>
              <ThinkingIndicator label={t("agent.thinking")} />
            </div>
          ) : null}
          {showAssistantActions ? (
            <MessageActionToolbar
              align="left"
              canCopy={canCopy}
              isUserMessage={false}
              onBranch={branchMessage}
              onCopy={copyMessage}
              branchLoading={branchLoading}
              copySucceeded={copySucceeded}
              timestamp={message.createdAt}
            />
          ) : null}
        </div>
      ) : (
        <div className={cn("flex min-w-0 flex-col items-end", compact ? "max-w-[86%]" : "max-w-[76%]")}>
          <div
            className={cn(
              "chatbot-user-message max-w-full whitespace-pre-wrap rounded-lg bg-accent text-accent-foreground [overflow-wrap:anywhere]",
              userMessageTheme.className,
              compact ? "px-2.5 py-1.5 text-[14px] leading-5" : "px-3 py-2 text-[15px] leading-6"
            )}
            style={{ ...(toHomeThemeStyle(userMessageTheme.style) ?? {}), marginBottom: 0 }}
          >
            {message.content}
          </div>
          <MessageActionToolbar
            align="right"
            canCopy={canCopy}
            isUserMessage
            onBranch={branchMessage}
            onCopy={copyMessage}
            onEdit={editUserMessage}
            branchLoading={branchLoading}
            copySucceeded={copySucceeded}
            timestamp={message.createdAt}
          />
        </div>
      )}
    </motion.article>
  );
});

export function MessageActionToolbar({
  align,
  branchLoading,
  canCopy,
  copySucceeded,
  isUserMessage,
  onBranch,
  onCopy,
  onEdit,
  timestamp
}: {
  align: "left" | "right";
  branchLoading: boolean;
  canCopy: boolean;
  copySucceeded: boolean;
  isUserMessage: boolean;
  onBranch: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  timestamp?: number;
}) {
  const { t } = useI18n();
  const timeLabel = formatMessageTime(timestamp);

  return (
    <div
      aria-label={t("chat.messageActions")}
      className={cn(
        "pointer-events-none flex h-5 w-full items-center gap-2 overflow-hidden opacity-0 transition-opacity duration-150",
        "group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
        align === "right" ? "justify-between" : "justify-start"
      )}
      role="toolbar"
    >
      <span className="shrink-0 text-[11px] leading-5 text-muted-foreground/70">
        {timeLabel}
      </span>
      <span className={cn("flex h-5 items-center gap-1.5", align === "right" && "justify-end")}>
        <MessageActionButton
          disabled={!canCopy}
          icon={copySucceeded ? CheckCircle2 : Copy}
          iconClassName={copySucceeded ? "text-[#12805c]" : undefined}
          iconKey={copySucceeded ? "copy-success" : "copy"}
          label={t("chat.copyMessage")}
          onClick={onCopy}
        />
        <MessageActionButton
          disabled={branchLoading}
          icon={branchLoading ? Loader2 : GitBranch}
          iconClassName={branchLoading ? "animate-spin" : undefined}
          iconKey={branchLoading ? "branch-loading" : "branch"}
          label={t("chat.branchMessage")}
          onClick={onBranch}
        />
        {isUserMessage && onEdit ? (
          <MessageActionButton
            icon={SquarePen}
            label={t("chat.editMessage")}
            onClick={onEdit}
          />
        ) : null}
      </span>
    </div>
  );
}

export function MessageActionButton({
  disabled = false,
  icon: Icon,
  iconClassName,
  iconKey,
  label,
  onClick
}: {
  disabled?: boolean;
  icon: LucideIcon;
  iconClassName?: string;
  iconKey?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      aria-label={label}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-transparent p-0 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
      whileTap={disabled ? undefined : { scale: 0.82 }}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          className="grid h-[13px] w-[13px] place-items-center"
          exit={{ opacity: 0, rotate: -35, scale: 0.72 }}
          initial={{ opacity: 0, rotate: 35, scale: 0.72 }}
          key={iconKey ?? label}
          transition={iconSpringTransition}
        >
          <Icon className={cn("h-[13px] w-[13px]", iconClassName)} />
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export function formatMessageTime(timestamp?: number): string {
  if (!timestamp) return "";

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function AssistantMessageParts({
  activeStream,
  compact = false,
  isStreamingMessage,
  markdownTheme,
  onLayoutChange,
  onStreamFrame,
  parts
}: {
  activeStream: ActiveStream | null;
  compact?: boolean;
  isStreamingMessage: boolean;
  markdownTheme: HomeThemeSectionConfig;
  onLayoutChange: () => void;
  onStreamFrame: () => void;
  parts: ChatMessagePart[];
}) {
  const partKeys = new Map<string, number>();

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {parts.map((part, index) => {
        const partKey = getMessagePartRenderKey(part, partKeys);
        const activePart = Boolean(isStreamingMessage && activeStream?.running && index === parts.length - 1 && part.type !== "text");
        if (part.type === "tool") {
          return <ToolEventCard active={activePart} compact={compact} key={partKey} onLayoutChange={onLayoutChange} toolEvent={part.toolEvent} />;
        }

        if (part.type !== "text") {
          return <StructuredMessagePart active={activePart} compact={compact} key={partKey} onLayoutChange={onLayoutChange} part={part} />;
        }

        const isLastPart = index === parts.length - 1;
        if (isStreamingMessage && activeStream && isLastPart) {
          return (
            <StreamingMarkdownRenderer
              className={cn("w-full", markdownTheme.className, compact && "small-chat-markdown")}
              key={partKey}
              markdown={part.content}
              onDone={() => undefined}
              onFrame={onStreamFrame}
              running={activeStream.running}
              style={toHomeThemeStyle(markdownTheme.style)}
              streamKey={activeStream.streamKey}
            />
          );
        }

        return (
          <MarkdownRenderer
            className={cn("w-full", markdownTheme.className, compact && "small-chat-markdown")}
            key={partKey}
            markdown={part.content}
            style={toHomeThemeStyle(markdownTheme.style)}
          />
        );
      })}
    </div>
  );
}

function getMessagePartRenderKey(part: ChatMessagePart, seenKeys: Map<string, number>): string {
  const baseKey = `${part.type}-${part.id}`;
  const occurrence = seenKeys.get(baseKey) ?? 0;
  seenKeys.set(baseKey, occurrence + 1);
  return occurrence === 0 ? baseKey : `${baseKey}-${occurrence}`;
}

export function StructuredMessagePart({
  active = false,
  compact = false,
  onLayoutChange,
  part
}: {
  active?: boolean;
  compact?: boolean;
  onLayoutChange?: () => void;
  part: Exclude<ChatMessagePart, { type: "text" | "tool" }>;
}) {
  const [expanded, setExpanded] = useState(part.type !== "raw" && part.type !== "reasoning");

  if (part.type === "reasoning") {
    return <ReasoningPartCard active={active} compact={compact} onLayoutChange={onLayoutChange} part={part} />;
  }

  const title = getStructuredPartTitle(part);
  const detail = getStructuredPartDetail(part);
  const content = getStructuredPartContent(part);
  const rawText = part.type === "raw" ? stringifyApprovalValue(part.value, 8_000) : "";

  return (
    <div className={cn("rounded-md border border-border bg-muted/25", compact ? "p-2 text-[12px] leading-5" : "p-3 text-[13px] leading-6")}>
      <button
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-center gap-2 text-left text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <FileText className="h-[14px] w-[14px] shrink-0" />
        <span className="truncate font-medium text-foreground" title={title}>{title}</span>
        {detail ? <span className="min-w-0 truncate text-[11px]" title={detail}>{detail}</span> : null}
        <ChevronDown className={cn("ml-auto h-[14px] w-[14px] shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <AutoHeightMotion contentClassName="mt-2 min-w-0" onHeightChange={onLayoutChange}>
            {part.type === "diff" ? (
              <DiffContent content={part.content} />
            ) : rawText ? (
              <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-[12px] leading-5 text-foreground [overflow-wrap:anywhere]">
                {rawText}
              </pre>
            ) : content ? (
              <MarkdownRenderer className="w-full" markdown={content} />
            ) : null}
            {part.type === "plan" && part.items?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground">
                {part.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            ) : null}
            {part.type !== "raw" && part.metadata && Object.keys(part.metadata).length ? (
              <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md bg-background p-2 font-mono text-[11px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                {stringifyApprovalValue(part.metadata, 4_000)}
              </pre>
            ) : null}
          </AutoHeightMotion>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DiffContent({ content }: { content: string }) {
  const lines = truncateText(content, 20_000).split("\n");

  return (
    <pre className="max-h-[420px] overflow-auto rounded-md border border-border bg-background py-2 font-mono text-[12px] leading-5 text-foreground">
      <code className="block min-w-full">
        {lines.map((line, index) => (
          <span className={cn("block min-h-5 whitespace-pre-wrap px-3 [overflow-wrap:anywhere]", getUnifiedDiffLineClassName(line))} key={`${index}-${line.slice(0, 24)}`}>
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}

function getUnifiedDiffLineClassName(line: string): string {
  if (line.startsWith("@@")) {
    return "bg-[#edf4ff] text-[#1d4ed8]";
  }
  if (isUnifiedDiffMetadataLine(line)) {
    return "bg-[#f6f7f9] text-muted-foreground";
  }
  if (line.startsWith("+")) {
    return "bg-[#e8f6ee] text-[#166534]";
  }
  if (line.startsWith("-")) {
    return "bg-[#fdecec] text-[#991b1b]";
  }
  return "text-foreground";
}

function isUnifiedDiffMetadataLine(line: string): boolean {
  return (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("dissimilarity index ") ||
    line.startsWith("\\ No newline at end of file")
  );
}

export function ReasoningPartCard({
  active = false,
  compact = false,
  onLayoutChange,
  part
}: {
  active?: boolean;
  compact?: boolean;
  onLayoutChange?: () => void;
  part: Extract<ChatMessagePart, { type: "reasoning" }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = getStructuredPartTitle(part);
  const content = part.content || "";

  return (
    <div className={cn("min-w-0 text-muted-foreground", compact ? "text-[12px] leading-5" : "text-[13px] leading-6")}>
      <button
        aria-expanded={expanded}
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-sm text-left text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30",
          compact ? "min-h-5" : "min-h-6"
        )}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <FileText className="h-[14px] w-[14px] shrink-0" />
        <span className={cn("truncate font-normal", active && "agent-thinking-text")} data-text={active ? title : undefined} title={title}>
          {title}
        </span>
        <ChevronDown className={cn("h-[14px] w-[14px] shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <AutoHeightMotion contentClassName="mt-1 min-w-0 pl-6" onHeightChange={onLayoutChange}>
            {content ? <MarkdownRenderer className="w-full" markdown={content} /> : null}
            {part.metadata && Object.keys(part.metadata).length ? (
              <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md bg-background p-2 font-mono text-[11px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                {stringifyApprovalValue(part.metadata, 4_000)}
              </pre>
            ) : null}
          </AutoHeightMotion>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function getStructuredPartTitle(part: Exclude<ChatMessagePart, { type: "text" | "tool" }>): string {
  if (part.type === "resource") return part.title || part.name || part.path || part.uri || "Resource";
  if (part.type === "artifact") return part.title || part.artifactId || part.path || part.uri || "Artifact";
  if (part.type === "diff") return getDiffPartTitle(part);
  if (part.type === "citation") return part.title || part.uri || "Citation";
  if (part.type === "raw") return part.label || "Raw event";
  if (part.type === "reasoning") return part.title || "Reasoning";
  if (part.type === "plan") return part.title || "Plan";
  return part.title || part.status || "Status";
}

export function getStructuredPartDetail(part: Exclude<ChatMessagePart, { type: "text" | "tool" }>): string {
  if (part.type === "resource" || part.type === "artifact") return part.mimeType || part.path || part.uri || "";
  if (part.type === "diff") return getDiffPartDetail(part);
  if (part.type === "citation") return part.uri || "";
  if (part.type === "status") return part.status || "";
  return "";
}

function getDiffPartTitle(part: Extract<ChatMessagePart, { type: "diff" }>): string {
  const title = part.title?.trim();
  if (!title) return "Diff";

  const path = part.path?.trim();
  const oldPath = part.oldPath?.trim();
  const detail = getDiffPartDetail(part);
  const duplicateTitles = new Set([
    path,
    oldPath,
    detail,
    path ? `Diff ${path}` : undefined,
    oldPath ? `Diff ${oldPath}` : undefined,
    detail ? `Diff ${detail}` : undefined
  ].filter((value): value is string => Boolean(value)));

  return duplicateTitles.has(title) ? "Diff" : title;
}

function getDiffPartDetail(part: Extract<ChatMessagePart, { type: "diff" }>): string {
  const oldPath = part.oldPath?.trim();
  const path = part.path?.trim();
  if (oldPath && path && oldPath !== path) {
    return `${oldPath} -> ${path}`;
  }
  return path || oldPath || "";
}

export function getStructuredPartContent(part: Exclude<ChatMessagePart, { type: "text" | "tool" }>): string {
  if (part.type === "plan") {
    return part.content || "";
  }
  if (part.type === "reasoning" || part.type === "status" || part.type === "resource" || part.type === "artifact" || part.type === "citation") {
    return part.content || "";
  }
  return "";
}

export function ToolEventsList({
  active = false,
  compact = false,
  onLayoutChange,
  toolEvents
}: {
  active?: boolean;
  compact?: boolean;
  onLayoutChange?: () => void;
  toolEvents: ChatToolEvent[];
}) {
  return (
    <div className={cn("space-y-1.5", compact ? "mt-2.5" : "mt-3")}>
      {toolEvents.map((toolEvent, index) => (
        <ToolEventCard active={active && index === toolEvents.length - 1} compact={compact} key={`${toolEvent.id}-${index}`} onLayoutChange={onLayoutChange} toolEvent={toolEvent} />
      ))}
    </div>
  );
}

export function ToolEventCard({
  active = false,
  compact = false,
  depth = 0,
  onLayoutChange,
  toolEvent
}: {
  active?: boolean;
  compact?: boolean;
  depth?: number;
  onLayoutChange?: () => void;
  toolEvent: ChatToolEvent;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const inputText = toolEvent.input === undefined ? "" : stringifyApprovalValue(toolEvent.input, 4_000);
  const outputText = toolEvent.output ? truncateText(toolEvent.output, 8_000) : "";
  const errorText = toolEvent.error ? truncateText(toolEvent.error, 4_000) : "";
  const children = toolEvent.children ?? [];

  return (
    <div
      className={cn(
        "min-w-0 text-muted-foreground",
        compact ? "text-[12px] leading-5" : "text-[13px] leading-6",
        depth > 0 && "border-l border-border/60 pl-3"
      )}
    >
      <button
        aria-expanded={expanded}
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-sm text-left text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30",
          compact ? "min-h-5" : "min-h-6"
        )}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <Terminal className="h-[14px] w-[14px] shrink-0" />
        <span className={cn("truncate font-normal", active && "agent-thinking-text")} data-text={active ? toolEvent.name : undefined} title={toolEvent.name}>
          {toolEvent.name}
        </span>
        <ChevronDown className={cn("h-[14px] w-[14px] shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <AutoHeightMotion contentClassName="mt-1 space-y-1 pl-6" onHeightChange={onLayoutChange}>
            {inputText ? <ToolEventPayload label={t("agent.toolInput")} value={inputText} /> : null}
            {children.length ? null : outputText ? <ToolEventPayload label={t("agent.toolOutput")} value={outputText} /> : null}
            {errorText ? <ToolEventPayload danger label={t("agent.toolError")} value={errorText} /> : null}

            {children.length ? (
              <div className="mt-1.5 space-y-1.5">
                {children.map((childEvent, index) => (
                  <ToolEventCard compact={compact} depth={depth + 1} key={`${childEvent.id}-${index}`} onLayoutChange={onLayoutChange} toolEvent={childEvent} />
                ))}
              </div>
            ) : null}
            {children.length && outputText ? <ToolEventPayload label={t("agent.toolOutput")} value={outputText} /> : null}
          </AutoHeightMotion>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ToolEventPayload({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className={cn("text-[12px]", danger ? "text-destructive" : "text-muted-foreground")}>
        {label}
      </div>
      <pre className={cn(
        "mt-0.5 max-h-[240px] overflow-auto whitespace-pre-wrap font-sans text-[12px] leading-5 [overflow-wrap:anywhere]",
        danger ? "text-destructive" : "text-muted-foreground/90"
      )}>
        {value}
      </pre>
    </div>
  );
}

export function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="agent-thinking-loader" aria-live="polite">
      <span className="agent-thinking-text" data-text={label}>{label}</span>
    </div>
  );
}

export function FollowUpComposer({
  activeStream,
  agentApprovalMode,
  approvalPrompt,
  agentEffort,
  agentEffortOptions,
  agentModel,
  agentProviderId,
  agentProviders,
  agentSpeed,
  agentSpeedOptions,
  attachments,
  compact = false,
  contextWindowMetrics,
  mobile = false,
  onAgentApprovalModeChange,
  onAgentEffortChange,
  onAgentModelChange,
  onAgentSpeedChange,
  onApprovalResolve,
  onAttachFiles,
  onChange,
  onCreateSubagent,
  onOpenVoiceSettings,
  onQuestionResolve,
  onRemoveAttachment,
  onSlashCommandSelect,
  onSubagentSelectionChange,
  onSubmit,
  onToggleStreaming,
  questionPrompt,
  selectedSubagentIds,
  slashCommands,
  subagents,
  transcriptionConfig,
  value
}: {
  activeStream: ActiveStream | null;
  agentApprovalMode: ChatAgentApprovalMode;
  approvalPrompt: AgentApprovalPrompt | null;
  agentEffort: ChatAgentEffort;
  agentEffortOptions: ChatAgentEffort[];
  agentModel: string;
  agentProviderId: ChatAgentProviderId;
  agentProviders: AgentProviderOption[];
  agentSpeed: ChatAgentSpeed;
  agentSpeedOptions: ChatAgentSpeed[];
  attachments: ChatAttachment[];
  compact?: boolean;
  contextWindowMetrics: ContextWindowMetrics;
  mobile?: boolean;
  onAgentApprovalModeChange: (value: ChatAgentApprovalMode) => void;
  onAgentEffortChange: (value: string) => void;
  onAgentModelChange: (value: string) => void;
  onAgentSpeedChange: (value: ChatAgentSpeed) => void;
  onApprovalResolve: (decision: ChatAgentApprovalDecision, message?: string) => void;
  onAttachFiles: () => Promise<void>;
  onChange: (value: string) => void;
  onCreateSubagent: () => void;
  onOpenVoiceSettings: () => void;
  onQuestionResolve: (response: AgentQuestionResponse) => void;
  onRemoveAttachment: (attachmentPath: string) => void;
  onSlashCommandSelect: (command: SlashCommand) => void;
  onSubagentSelectionChange: (subagentIds: string[]) => void;
  onSubmit: () => void;
  onToggleStreaming: () => void;
  questionPrompt: AgentQuestionPrompt | null;
  selectedSubagentIds: string[];
  slashCommands: SlashCommand[];
  subagents: ConfiguredSubagentSettings[];
  transcriptionConfig: TranscriptionConfig;
  value: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>("idle");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(() => createIdleWaveform());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStartRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const valueRef = useRef(value);
  const waveformFrameRef = useRef<number | null>(null);
  const canSend = value.trim().length > 0 && !activeStream && dictationStatus === "idle";
  const canRecord = !activeStream && dictationStatus === "idle";
  const modelOptions = getAgentModelOptions(agentProviders, agentProviderId);
  const modelFallbackLabel = t("agent.defaultModel");
  const approvalModeOptions = getAgentApprovalModeOptions(t);
  const approvalModeLabel = getAgentApprovalModeLabel(agentApprovalMode, t);
  const slashCommandController = useSlashCommandController({
    commands: slashCommands,
    onSelect: onSlashCommandSelect,
    value
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashCommandController.onKeyDown(event)) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (canSend) onSubmit();
  };

  const showDictationError = useCallback(
    (message: string) => {
      setDictationError(message);
      toast.error({ content: message, title: t("voice.toastTitle") });
    },
    [t, toast]
  );

  const showDictationWarning = useCallback(
    (message: string) => {
      setDictationError(message);
      toast.warning({ content: message, title: t("voice.toastTitle") });
    },
    [t, toast]
  );

  const stopWaveform = useCallback(() => {
    if (waveformFrameRef.current !== null) {
      window.cancelAnimationFrame(waveformFrameRef.current);
      waveformFrameRef.current = null;
    }
  }, []);

  const cleanupRecordingResources = useCallback(() => {
    stopWaveform();

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    mediaStreamSourceRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
  }, [stopWaveform]);

  const startWaveform = useCallback(() => {
    stopWaveform();
    const analyser = analyserRef.current;
    if (!analyser) return;

    const sampleData = new Uint8Array(analyser.fftSize);
    let smoothedLevel = 0;
    let sampleWindowPeak = 0;
    let previousBarTimestamp = 0;
    const draw = (timestamp: number) => {
      analyser.getByteTimeDomainData(sampleData);
      sampleWindowPeak = Math.max(sampleWindowPeak, getWaveformLevel(sampleData));

      if (timestamp - previousBarTimestamp >= waveformBarIntervalMs) {
        previousBarTimestamp = timestamp;
        smoothedLevel = smoothWaveformLevel(smoothedLevel, sampleWindowPeak);
        sampleWindowPeak = 0;
        setWaveformBars((currentBars) => appendWaveformLevel(currentBars, smoothedLevel));
      }

      waveformFrameRef.current = window.requestAnimationFrame(draw);
    };

    waveformFrameRef.current = window.requestAnimationFrame(draw);
  }, [stopWaveform]);

  const transcribeBlob = useCallback(
    async (audioBlob: Blob) => {
      if (!audioBlob.size) {
        showDictationError(t("voice.emptyAudio"));
        setDictationStatus("idle");
        return;
      }

      const currentConfig = normalizeTranscriptionConfig(transcriptionConfig);
      if (!currentConfig.apiKey.trim()) {
        showDictationWarning(t("voice.missingApiKey"));
        setDictationStatus("idle");
        onOpenVoiceSettings();
        return;
      }

      const voiceApi = window.agentConsole?.voice;
      if (!voiceApi) {
        showDictationError(t("voice.noApi"));
        setDictationStatus("idle");
        return;
      }

      setDictationStatus("transcribing");
      setWaveformBars(createIdleWaveform());

      try {
        const audioBuffer = await audioBlob.arrayBuffer();
        const result = await voiceApi.transcribeAudio({
          audioBuffer,
          config: currentConfig,
          mimeType: audioBlob.type || "audio/webm"
        });
        const transcript = result.text.trim();

        if (!transcript) {
          throw new Error(t("voice.transcriptionEmpty"));
        }

        onChange(appendTranscription(valueRef.current, transcript));
        setDictationError(null);
        toast.success({ content: t("voice.transcriptionCompleted"), title: t("voice.toastTitle") });
      } catch (error) {
        showDictationError(getDictationErrorMessage(error, t("voice.transcriptionFailed")));
      } finally {
        setDictationStatus("idle");
        setRecordingSeconds(0);
        setWaveformBars(createIdleWaveform());
      }
    },
    [onChange, onOpenVoiceSettings, showDictationError, showDictationWarning, t, toast, transcriptionConfig]
  );

  const stopDictation = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupRecordingResources();
      setDictationStatus("idle");
      return;
    }

    setDictationStatus("transcribing");
    recorder.stop();
  }, [cleanupRecordingResources]);

  const startDictation = useCallback(async () => {
    if (!canRecord) return;

    const currentConfig = normalizeTranscriptionConfig(transcriptionConfig);
    if (!currentConfig.apiKey.trim()) {
      showDictationWarning(t("voice.missingApiKey"));
      onOpenVoiceSettings();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showDictationError(t("voice.noMicrophone"));
      return;
    }

    try {
      setDictationError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      const AudioContextConstructor =
        window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      streamRef.current = stream;

      if (AudioContextConstructor) {
        const audioContext = new AudioContextConstructor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.78;
        const mediaStreamSource = audioContext.createMediaStreamSource(stream);
        mediaStreamSource.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        mediaStreamSourceRef.current = mediaStreamSource;
        void audioContext.resume().catch(() => undefined);
      }

      const mimeType = getPreferredAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        const message = (event as Event & { error?: { message?: string } }).error?.message;
        showDictationError(message || t("voice.recordingFailed"));
      };
      recorder.onstop = () => {
        const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(recordingChunksRef.current, { type: recordedMimeType });
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        cleanupRecordingResources();
        void transcribeBlob(audioBlob);
      };

      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      setDictationStatus("recording");
      setWaveformBars(createIdleWaveform());
      startWaveform();
      recorder.start(250);
    } catch (error) {
      cleanupRecordingResources();
      mediaRecorderRef.current = null;
      setDictationStatus("idle");
      showDictationError(getDictationErrorMessage(error, t("voice.transcriptionFailed")));
    }
  }, [canRecord, cleanupRecordingResources, onOpenVoiceSettings, showDictationError, showDictationWarning, startWaveform, t, transcriptionConfig, transcribeBlob]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (dictationStatus !== "recording") return undefined;

    const updateElapsed = () => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartRef.current) / 1000));
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(intervalId);
  }, [dictationStatus]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      cleanupRecordingResources();
    };
  }, [cleanupRecordingResources]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 mx-auto",
        mobile ? "bottom-2 left-2 right-2 max-w-none" : compact ? "bottom-3 left-3 right-3 max-w-none" : "bottom-4 left-[clamp(24px,4.6vw,88px)] right-[clamp(24px,4.6vw,88px)] max-w-[960px]"
      )}
    >
      <AgentInteractionSheets
        agentProviders={agentProviders}
        approvalPrompt={approvalPrompt}
        compact={compact}
        mobile={mobile}
        onApprovalResolve={onApprovalResolve}
        onQuestionResolve={onQuestionResolve}
        questionPrompt={questionPrompt}
      />
      <div className={cn("chat-floating-composer pointer-events-auto relative border border-border bg-card px-3 shadow-[0_2px_10px_rgba(0,0,0,.14)]", mobile ? "rounded-[18px] pb-3 pt-3" : "rounded-lg pb-2 pt-2")}>
        <SlashCommandMenu
          commands={slashCommandController.commands}
          onHover={slashCommandController.setSelectedIndex}
          onSelect={slashCommandController.selectCommand}
          open={slashCommandController.open && dictationStatus === "idle"}
          selectedIndex={slashCommandController.selectedIndex}
        />
        {dictationStatus === "recording" ? (
          <RecordingComposerSurface
            compact={compact}
            recordingSeconds={recordingSeconds}
            waveformBars={waveformBars}
            onStop={stopDictation}
          />
        ) : dictationStatus === "transcribing" ? (
          <TranscribingComposerSurface compact={compact} waveformBars={waveformBars} />
        ) : (
          <>
            <textarea
              className={cn(
                "w-full resize-none border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
                mobile ? "h-[64px] text-[16px] leading-6" : compact ? "h-[44px] text-[14px] leading-5" : "h-[54px] text-[14px] leading-[22px]"
              )}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              value={value}
            />
            {attachments.length ? (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                <AnimatePresence initial={false}>
                  {attachments.map((attachment) => (
                  <motion.span
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="flex h-6 max-w-[260px] items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 text-[12px] text-foreground"
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
                    key={attachment.path}
                    layout
                    transition={popoverSpringTransition}
                    title={attachment.path}
                  >
                    <FileText className="h-[13px] w-[13px] shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{attachment.name}</span>
                    <button
                      aria-label={t("newSession.removeAttachment", { name: attachment.name })}
                      className="grid h-4 w-4 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
                      onClick={() => onRemoveAttachment(attachment.path)}
                      type="button"
                    >
                      <X className="h-[11px] w-[11px]" />
                    </button>
                  </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <ComposerAttachmentMenu
                  buttonClassName={cn(mobile ? "h-10 w-10 shrink-0" : "h-7 w-7")}
                  onAttachFiles={onAttachFiles}
                  onCreateSubagent={onCreateSubagent}
                  onSubagentSelectionChange={onSubagentSelectionChange}
                  placement="top"
                  selectedSubagentIds={selectedSubagentIds}
                  subagents={subagents}
                />
                <HeaderSelect
                  ariaLabel={t("agent.permissions")}
                  buttonClassName={cn("px-1.5 text-primary", mobile ? "h-10 max-w-[132px] text-[13px]" : compact ? "h-7 max-w-[112px]" : "h-7 max-w-[136px]")}
                  onChange={(nextLabel) => onAgentApprovalModeChange(getAgentApprovalModeFromLabel(nextLabel, t))}
                  options={approvalModeOptions}
                  placement="top"
                  value={approvalModeLabel}
                  variant="plain"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[12px]">
                <ContextWindowIndicator metrics={contextWindowMetrics} />
                <AgentRunSettingsSelect
                  agentEffort={agentEffort}
                  agentEffortOptions={agentEffortOptions}
                  agentModel={agentModel}
                  agentSpeed={agentSpeed}
                  agentSpeedOptions={agentSpeedOptions}
                  buttonClassName={cn("h-7 px-1.5", compact ? "hidden" : "max-w-[240px]")}
                  modelFallbackLabel={modelFallbackLabel}
                  modelOptions={modelOptions}
                  onAgentEffortChange={onAgentEffortChange}
                  onAgentModelChange={onAgentModelChange}
                  onAgentSpeedChange={onAgentSpeedChange}
                  placement="top"
                />
                <button
                  aria-label={t("voice.start")}
                  className={cn("grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35", mobile ? "h-10 w-10" : "h-7 w-7")}
                  disabled={!canRecord}
                  onClick={startDictation}
                  title={t("voice.start")}
                  type="button"
                >
                  <Mic className="h-[15px] w-[15px]" />
                </button>
                {activeStream ? (
                  <button
                    aria-label={activeStream.running ? t("chat.pauseStream") : t("chat.resumeStream")}
                    className={cn("grid place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95", mobile ? "h-10 w-10" : "h-7 w-7")}
                    onClick={onToggleStreaming}
                    type="button"
                  >
                    <AnimatePresence initial={false} mode="wait">
                      <motion.span
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.82 }}
                        initial={{ opacity: 0, scale: 0.82 }}
                        key={activeStream.running ? "pause" : "play"}
                        transition={iconSpringTransition}
                      >
                        {activeStream.running ? <Pause className="h-[15px] w-[15px] fill-current" /> : <Play className="h-[17px] w-[17px] fill-current" />}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                ) : (
                  <button
                    aria-label={t("chat.send")}
                    className={cn(
                      "grid place-items-center rounded-full transition-[background-color,box-shadow,opacity,transform] active:scale-95 disabled:opacity-50",
                      mobile ? "h-10 w-10" : "h-7 w-7",
                      canSend
                        ? "bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(15,118,110,.22)] hover:scale-105"
                        : "bg-muted-foreground text-background"
                    )}
                    disabled={!canSend}
                    onClick={onSubmit}
                    type="button"
                  >
                    <ArrowUp className="h-[17px] w-[17px]" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RecordingComposerSurface({
  compact = false,
  onStop,
  recordingSeconds,
  waveformBars
}: {
  compact?: boolean;
  onStop: () => void;
  recordingSeconds: number;
  waveformBars: number[];
}) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-end text-foreground", compact ? "min-h-[64px]" : "min-h-[78px]")}>
      <div className="flex h-8 w-full items-center gap-2">
        <button className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" type="button">
          <Plus className="h-[16px] w-[16px]" />
        </button>
        <VoiceWaveform bars={waveformBars} scrolling />
        <span className="w-10 shrink-0 text-right text-[14px] tabular-nums text-muted-foreground">{formatRecordingTime(recordingSeconds)}</span>
        <button
          aria-label={t("chat.stopRecording")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground transition-transform hover:bg-muted active:scale-95"
          onClick={onStop}
          type="button"
        >
          <Square className="h-[12px] w-[12px] fill-current" />
        </button>
        <button
          aria-label={t("chat.send")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted-foreground text-background opacity-50"
          disabled
          type="button"
        >
          <ArrowUp className="h-[17px] w-[17px]" />
        </button>
      </div>
    </div>
  );
}

export function TranscribingComposerSurface({ compact = false, waveformBars }: { compact?: boolean; waveformBars: number[] }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex flex-col justify-center gap-2 text-foreground", compact ? "min-h-[64px]" : "min-h-[78px]")}>
      <div className="flex items-center gap-2 text-[14px]">
        <Loader2 className="h-[15px] w-[15px] animate-spin text-primary" />
        <span>{t("chat.transcribingVoice")}</span>
      </div>
      <div className="flex h-7 items-center">
        <VoiceWaveform bars={waveformBars} muted />
      </div>
    </div>
  );
}

export function VoiceWaveform({
  bars,
  muted,
  scrolling
}: {
  bars: number[];
  muted?: boolean;
  scrolling?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef(bars);
  const lastBarsUpdateRef = useRef(performance.now());
  const scrollingRef = useRef(Boolean(scrolling));
  const mutedRef = useRef(Boolean(muted));

  useEffect(() => {
    barsRef.current = bars;
    lastBarsUpdateRef.current = performance.now();
  }, [bars]);

  useEffect(() => {
    scrollingRef.current = Boolean(scrolling);
    mutedRef.current = Boolean(muted);
  }, [muted, scrolling]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d");
    if (!context) return undefined;

    let animationFrameId = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.round(rect.width * pixelRatio));
      const nextHeight = Math.max(1, Math.round(rect.height * pixelRatio));

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      context.clearRect(0, 0, nextWidth, nextHeight);

      const barsSnapshot = barsRef.current;
      const cellWidth = nextWidth / Math.max(1, barsSnapshot.length);
      const centerY = nextHeight / 2;
      const scrollProgress = scrollingRef.current
        ? Math.min(1, (performance.now() - lastBarsUpdateRef.current) / waveformBarIntervalMs)
        : 0;
      const offsetX = scrollProgress * cellWidth;
      const rootStyles = getComputedStyle(document.documentElement);
      const dashColor = rootStyles.getPropertyValue("--muted-foreground").trim() || "rgba(143, 148, 155, .75)";
      const barColor = mutedRef.current ? dashColor : rootStyles.getPropertyValue("--primary").trim() || "#0f766e";
      const dashWidth = Math.max(2, Math.round(3 * pixelRatio));
      const barWidth = Math.max(2, Math.round(3 * pixelRatio));

      context.fillStyle = dashColor;
      for (let index = -1; index <= barsSnapshot.length + 1; index += 1) {
        const dashX = index * cellWidth - offsetX + cellWidth / 2 - dashWidth / 2;
        context.fillRect(dashX, centerY - 0.5 * pixelRatio, dashWidth, pixelRatio);
      }

      context.fillStyle = barColor;
      barsSnapshot.forEach((level, index) => {
        if (level <= 0) return;

        const height = (2 + level * 32) * pixelRatio;
        const barX = index * cellWidth - offsetX + cellWidth / 2 - barWidth / 2;
        const barY = centerY - height / 2;
        const radius = barWidth / 2;

        context.beginPath();
        context.roundRect(barX, barY, barWidth, height, radius);
        context.fill();
      });

      animationFrameId = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="voice-waveform-track relative flex h-8 min-w-0 flex-1 items-center overflow-hidden" aria-hidden>
      <canvas className="h-full w-full" ref={canvasRef} />
    </div>
  );
}

export function VoiceSettingsInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <input
        className="h-8 w-full rounded-md border border-input bg-card px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}
