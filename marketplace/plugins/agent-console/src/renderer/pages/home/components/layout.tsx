import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Bot,
  Clock4,
  Ellipsis,
  Folder,
  FolderOpen,
  LayoutGrid,
  Loader2,
  PanelLeft,
  PanelRight,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Smartphone,
  SquarePen,
  X,
  type LucideIcon
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSidebarProjectLabel, type SidebarProject, type SidebarThread } from "../../../../shared/sidebar-data";
import {
  AgentProviderOption,
  getAgentProviderLabel,
  getAgentProviderLogoDataUrl,
  isMacPlatform,
  newSessionThreadId,
  popoverSpringTransition,
  ResizeSide,
  RightSidebarTab,
  SettingsSectionId,
  SmallWindowOpeningGeometry,
  SmallWindowOpeningPhase,
  smallWindowOpeningTransitionDurationMs
} from "../utils/core";
import { AnimatedSelectionBackground } from "./primitives";
import {
  defaultRightSidebarPluginId,
  getRightSidebarPlugin,
  type RightSidebarPlugin,
  type RightSidebarPluginId,
  type RightSidebarAgentContext,
  type RightSidebarPluginPanelProps
} from "../right-sidebar-plugins";

export function SmallChatWindowOpeningTransition({
  fullShell,
  geometry,
  phase,
  smallShell
}: {
  fullShell: ReactNode;
  geometry: SmallWindowOpeningGeometry | null;
  phase: SmallWindowOpeningPhase;
  smallShell: ReactNode;
}) {
  if (phase === "done" && !geometry) {
    return <>{smallShell}</>;
  }

  const compactVisible = phase !== "full";
  const renderFullLayer = phase !== "done";
  const duration = smallWindowOpeningTransitionDurationMs / 1000;
  const followEase = [0.22, 1, 0.36, 1] as const;
  const fullLayerScaleX = geometry ? geometry.toWidth / geometry.fromWidth : 0.985;
  const fullLayerScaleY = geometry ? geometry.toHeight / geometry.fromHeight : 0.985;
  const fullLayerStyle = geometry
    ? {
        height: geometry.fromHeight,
        transformOrigin: "top left",
        width: geometry.fromWidth
      }
    : {
        transformOrigin: "top left"
      };
  const fullLayerTransition = {
    duration,
    ease: followEase,
    opacity: { delay: compactVisible ? duration * 0.62 : 0, duration: duration * 0.22, ease: "easeOut" }
  } as const;
  const compactLayerTransition = {
    duration: smallWindowOpeningTransitionDurationMs / 1000,
    ease: followEase,
    opacity: { delay: compactVisible ? duration * 0.48 : 0, duration: duration * 0.28, ease: "easeOut" },
    scale: { delay: compactVisible ? duration * 0.36 : 0, duration: duration * 0.5, ease: followEase }
  } as const;

  return (
    <div className="small-chat-window-transition relative h-full min-w-0 overflow-hidden bg-transparent">
      <motion.div
        animate={{
          opacity: compactVisible ? 1 : 0,
          scale: compactVisible ? 1 : 0.94,
          y: compactVisible ? 0 : 12
        }}
        className="small-chat-window-transition-compact absolute inset-0 min-w-0 overflow-hidden bg-transparent"
        initial={false}
        transition={compactLayerTransition}
      >
        {smallShell}
      </motion.div>
      {renderFullLayer ? (
        <motion.div
          animate={{
            borderRadius: compactVisible ? 14 : 0,
            opacity: compactVisible ? 0 : 1,
            scaleX: compactVisible ? fullLayerScaleX : 1,
            scaleY: compactVisible ? fullLayerScaleY : 1
          }}
          className="pointer-events-none absolute left-0 top-0 min-w-0 overflow-hidden bg-background shadow-[0_22px_70px_rgba(15,23,42,0.18)]"
          initial={false}
          style={fullLayerStyle}
          transition={fullLayerTransition}
        >
          {fullShell}
        </motion.div>
      ) : null}
    </div>
  );
}

export function SmallChatWindowLayout({
  agentLogoDataUrl,
  agentProviderLabel,
  children,
  onClose,
  onTogglePinned,
  pinned,
  title
}: {
  agentLogoDataUrl?: string;
  agentProviderLabel: string;
  children: ReactNode;
  onClose: () => void;
  onTogglePinned: () => void;
  pinned: boolean;
  title: string;
}) {
  const { t } = useI18n();
  const PinIcon = pinned ? PinOff : Pin;

  return (
    <div className="small-chat-window flex h-full min-w-0 flex-col overflow-hidden text-foreground">
      <header
        className={cn(
          "small-chat-window-header flex h-10 shrink-0 items-center gap-2 border-b border-border pl-3 pr-2",
          pinned ? "no-drag" : "drag-region"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AgentLogo className="h-[22px] w-[22px] rounded-[6px] border-border/70" label={agentProviderLabel} logoDataUrl={agentLogoDataUrl} />
          <h1 className="truncate text-[13px] font-semibold text-foreground">{title || t("smallWindow.title")}</h1>
        </div>
        <div className="no-drag flex shrink-0 items-center gap-1">
          <button
            aria-label={pinned ? t("smallWindow.unpin") : t("smallWindow.pin")}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-md text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20",
              pinned && "text-primary"
            )}
            onClick={onTogglePinned}
            title={pinned ? t("smallWindow.unpin") : t("smallWindow.pin")}
            type="button"
          >
            <PinIcon className="h-[14px] w-[14px]" />
          </button>
          <button
            aria-label={t("smallWindow.close")}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={onClose}
            title={t("smallWindow.close")}
            type="button"
          >
            <X className="h-[15px] w-[15px]" />
          </button>
        </div>
      </header>
      <main className="small-chat-window-body min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

export function AgentLogo({
  className,
  label,
  logoDataUrl
}: {
  className?: string;
  label: string;
  logoDataUrl?: string;
}) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-card text-muted-foreground", className)}
      title={label}
    >
      {logoDataUrl ? (
        <img alt="" className="h-full w-full object-cover" draggable={false} src={logoDataUrl} />
      ) : (
        <Bot aria-label={label} className="h-[60%] w-[60%]" />
      )}
    </span>
  );
}

export function AgentProviderSelectOption({ label, logoDataUrl }: { label: string; logoDataUrl?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <AgentLogo className="h-4 w-4 rounded-[4px] border-border/70" label={label} logoDataUrl={logoDataUrl} />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

export function ProjectSidebar({
  activeSettingsSection,
  agentProviders,
  automationPageActive,
  botPageActive,
  chatActive,
  onOpenAutomationsPage,
  onOpenBotPage,
  onProjectContextMenu,
  onResizeStart,
  onOpenSettings,
  onOpenSearch,
  onStartNewSession,
  onStartProjectSession,
  onCancelThreadRename,
  onRenameThread,
  onStartThreadRename,
  onThreadContextMenu,
  open,
  projects,
  renamingThreadId,
  resizing,
  selectedThread,
  setSelectedThread,
  width
}: {
  activeSettingsSection: SettingsSectionId;
  agentProviders: AgentProviderOption[];
  automationPageActive: boolean;
  botPageActive: boolean;
  chatActive: boolean;
  onOpenAutomationsPage: () => void;
  onOpenBotPage: () => void;
  onProjectContextMenu: (project: SidebarProject) => void | Promise<void>;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpenSettings: (section?: SettingsSectionId) => void;
  onOpenSearch: () => void;
  onStartNewSession: () => void;
  onStartProjectSession: (project: SidebarProject) => void;
  onCancelThreadRename: () => void;
  onRenameThread: (thread: SidebarThread, title: string) => void | Promise<void>;
  onStartThreadRename: (thread: SidebarThread) => void;
  onThreadContextMenu: (thread: SidebarThread) => void | Promise<void>;
  open: boolean;
  projects: SidebarProject[];
  renamingThreadId: string | null;
  resizing: boolean;
  selectedThread: string;
  setSelectedThread: (thread: string) => void;
  width: number;
}) {
  const { t } = useI18n();
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set(projects.map((project) => project.id)));

  useEffect(() => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      for (const project of projects) {
        next.add(project.id);
      }
      return next;
    });
  }, [projects]);

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "project-sidebar relative flex shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        !resizing && "transition-[width] duration-200 ease-out",
        !open && "overflow-hidden"
      )}
      aria-hidden={!open}
      style={{ width: open ? width : 0 }}
    >
      {open ? (
        <>
          <div className="drag-region h-[46px] shrink-0" />

          <div className="project-sidebar-actions space-y-0.5 px-2.5 pb-2.5">
            <SidebarAction active={chatActive && selectedThread === newSessionThreadId} icon={SquarePen} label={t("sidebar.newSession")} onClick={onStartNewSession} />
            <SidebarAction icon={Search} label={t("sidebar.search")} onClick={onOpenSearch} />
            <SidebarAction
              active={activeSettingsSection === "integrations" && !chatActive && !automationPageActive && !botPageActive}
              icon={LayoutGrid}
              label={t("sidebar.plugins")}
              onClick={() => onOpenSettings("integrations")}
            />
            <SidebarAction active={automationPageActive} icon={Clock4} label={t("sidebar.automations")} onClick={onOpenAutomationsPage} />
          </div>

          <div className="project-session-list min-h-0 flex-1 overflow-auto px-2.5 pb-5 pt-3">
            <div className="project-session-heading mb-4 px-1.5 text-[11px] font-medium uppercase text-muted-foreground">{t("sidebar.projectsSessions")}</div>
            <div className="project-group-list space-y-1">
              {projects.map((project) => (
                <ProjectGroup
                  expanded={expandedProjectIds.has(project.id)}
                  key={project.id}
                  onProjectContextMenu={onProjectContextMenu}
                  onStartProjectSession={onStartProjectSession}
                  onCancelThreadRename={onCancelThreadRename}
                  onRenameThread={onRenameThread}
                  onStartThreadRename={onStartThreadRename}
                  onToggle={() => toggleProject(project.id)}
                  project={project}
                  agentProviders={agentProviders}
                  renamingThreadId={renamingThreadId}
                  selectedThread={chatActive ? selectedThread : ""}
                  setSelectedThread={setSelectedThread}
                  onThreadContextMenu={onThreadContextMenu}
                />
              ))}
            </div>
          </div>

          <div className="relative flex h-[58px] shrink-0 items-center gap-1.5 px-3">
            <button
              className="no-drag flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[12px] text-sidebar-foreground hover:bg-muted"
              onClick={() => onOpenSettings(activeSettingsSection)}
              title={t("sidebar.settings")}
              type="button"
            >
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{t("sidebar.settings")}</span>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button
                aria-label={t("sidebar.botOperation")}
                className={cn(
                  "no-drag grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors",
                  botPageActive
                    ? "border-primary/25 bg-accent text-primary"
                    : "border-border/70 bg-background/30 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                )}
                onClick={onOpenBotPage}
                title={t("sidebar.botOperation")}
                type="button"
              >
                <Bot className="h-[14px] w-[14px]" />
              </button>
              <button
                aria-label={t("sidebar.mobileOperation")}
                className="no-drag grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/70 bg-background/30 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                title={t("sidebar.mobileOperation")}
                type="button"
              >
                <Smartphone className="h-[14px] w-[14px]" />
              </button>
            </div>
          </div>
          <SidebarResizeHandle onPointerDown={onResizeStart} side="left" />
        </>
      ) : null}
    </aside>
  );
}

export function ProjectGroup({
  agentProviders,
  expanded,
  onCancelThreadRename,
  onProjectContextMenu,
  onRenameThread,
  onStartProjectSession,
  onStartThreadRename,
  onThreadContextMenu,
  onToggle,
  project,
  renamingThreadId,
  selectedThread,
  setSelectedThread
}: {
  agentProviders: AgentProviderOption[];
  expanded: boolean;
  onCancelThreadRename: () => void;
  onProjectContextMenu: (project: SidebarProject) => void | Promise<void>;
  onRenameThread: (thread: SidebarThread, title: string) => void | Promise<void>;
  onStartProjectSession: (project: SidebarProject) => void;
  onStartThreadRename: (thread: SidebarThread) => void;
  onThreadContextMenu: (thread: SidebarThread) => void | Promise<void>;
  onToggle: () => void;
  project: SidebarProject;
  renamingThreadId: string | null;
  selectedThread: string;
  setSelectedThread: (thread: string) => void;
}) {
  const { t } = useI18n();
  const containsSelectedThread = project.threads.some((thread) => thread.id === selectedThread);
  const selectedCollapsedProject = containsSelectedThread && !expanded;
  const label = project.name || t("sidebar.repositories");
  const newSessionLabel = t("sidebar.newSessionInProject", { project: label });
  const handleProjectContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void onProjectContextMenu(project);
  };
  const handleStartProjectSession = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onStartProjectSession(project);
  };

  return (
    <div className="project-group">
      <div className="flex min-h-8 w-full items-center gap-1">
        <button
          aria-expanded={expanded}
          className={cn(
            "project-group-trigger relative flex min-h-8 min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-left text-[12px] font-medium transition-colors",
            selectedCollapsedProject
              ? "text-accent-foreground"
              : cn("text-muted-foreground hover:bg-muted hover:text-foreground", containsSelectedThread && "text-foreground")
          )}
          onContextMenu={handleProjectContextMenu}
          onClick={onToggle}
          type="button"
        >
          {selectedCollapsedProject ? <AnimatedSelectionBackground layoutId="left-sidebar-active" /> : null}
          <span className="relative z-10">
            {expanded ? <FolderOpen className="h-[15px] w-[15px] shrink-0" /> : <Folder className="h-[15px] w-[15px] shrink-0" />}
          </span>
          <span className="relative z-10 min-w-0 flex-1 truncate">{label}</span>
        </button>
        <button
          aria-label={newSessionLabel}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground/75 outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={handleStartProjectSession}
          title={newSessionLabel}
          type="button"
        >
          <SquarePen className="h-[14px] w-[14px]" />
        </button>
      </div>

      <AnimatedTreeChildren expanded={expanded}>
        {project.threads.length ? (
          <div className="project-thread-list space-y-1">
            {project.threads.map((thread) => {
              const selected = selectedThread === thread.id;
              const logoDataUrl = getAgentProviderLogoDataUrl(agentProviders, thread.providerId);
              const renaming = renamingThreadId === thread.id;
              const handleThreadContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                event.stopPropagation();
                void onThreadContextMenu(thread);
              };
              const handleThreadDoubleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                event.stopPropagation();
                onStartThreadRename(thread);
              };

              if (renaming) {
                return (
                  <ProjectThreadRenameForm
                    key={thread.id}
                    logoDataUrl={logoDataUrl}
                    onCancel={onCancelThreadRename}
                    onSubmit={(title) => onRenameThread(thread, title)}
                    selected={selected}
                    thread={thread}
                  />
                );
              }

              return (
                <button
                  className={cn(
                    "project-thread-row group relative flex min-h-8 w-full items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-left text-[13px] transition-colors",
                    selected ? "text-accent-foreground" : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
                  )}
                  key={thread.id}
                  onContextMenu={handleThreadContextMenu}
                  onClick={() => setSelectedThread(thread.id)}
                  onDoubleClick={handleThreadDoubleClick}
                  tabIndex={expanded ? 0 : -1}
                  type="button"
                >
                  {selected ? <AnimatedSelectionBackground layoutId="left-sidebar-active" /> : null}
                  <AgentLogo className="relative z-10 h-[18px] w-[18px] rounded-[5px] border-border/70" label={thread.providerId ?? thread.title} logoDataUrl={logoDataUrl} />
                  <span className="relative z-10 min-w-0 flex-1 truncate">{thread.title}</span>
                  {thread.age ? <span className="relative z-10 shrink-0 text-[10px] text-muted-foreground">{thread.age}</span> : null}
                  {thread.working ? <Loader2 className="relative z-10 h-[12px] w-[12px] shrink-0 animate-spin text-muted-foreground" /> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-8 py-2 text-[11px] text-muted-foreground">{t("sidebar.noSessions")}</div>
        )}
      </AnimatedTreeChildren>
    </div>
  );
}

export function ProjectThreadRenameForm({
  logoDataUrl,
  onCancel,
  onSubmit,
  selected,
  thread
}: {
  logoDataUrl?: string;
  onCancel: () => void;
  onSubmit: (title: string) => void | Promise<void>;
  selected: boolean;
  thread: SidebarThread;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canceledRef = useRef(false);
  const [draft, setDraft] = useState(thread.title);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const submit = () => {
    if (canceledRef.current || submitting) return;
    setSubmitting(true);
    void Promise.resolve(onSubmit(draft)).finally(() => setSubmitting(false));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      canceledRef.current = true;
      onCancel();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className={cn(
        "project-thread-row group relative flex min-h-8 w-full items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-left text-[13px] transition-colors",
        selected ? "text-accent-foreground" : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
      )}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {selected ? <AnimatedSelectionBackground layoutId="left-sidebar-active" /> : null}
      <AgentLogo className="relative z-10 h-[18px] w-[18px] rounded-[5px] border-border/70" label={thread.providerId ?? thread.title} logoDataUrl={logoDataUrl} />
      <input
        className="relative z-10 min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[13px] text-foreground outline-none focus:border-ring"
        disabled={submitting}
        onBlur={submit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        value={draft}
      />
    </form>
  );
}

export function AnimatedTreeChildren({ children, expanded }: { children: ReactNode; expanded: boolean }) {
  return (
    <motion.div
      animate={{
        gridTemplateRows: expanded ? "1fr" : "0fr",
        opacity: expanded ? 1 : 0
      }}
      aria-hidden={!expanded}
      className={cn("grid overflow-hidden", !expanded && "pointer-events-none")}
      initial={false}
      transition={{
        gridTemplateRows: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.1, ease: "easeOut" }
      }}
    >
      <div className="min-h-0 overflow-hidden pt-1">{children}</div>
    </motion.div>
  );
}

export function IconButton({
  ariaLabel,
  disabled,
  icon: Icon,
  onClick
}: {
  ariaLabel: string;
  disabled?: boolean;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="no-drag grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:text-muted-foreground/40 disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-[17px] w-[17px]" />
    </button>
  );
}

export function SidebarResizeHandle({
  onPointerDown,
  side
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  side: ResizeSide;
}) {
  const { t } = useI18n();
  return (
    <div
      aria-label={side === "left" ? t("sidebar.resizeLeft") : t("sidebar.resizeRight")}
      className={cn(
        "no-drag absolute top-0 z-30 h-full w-2 cursor-col-resize before:absolute before:top-0 before:h-full before:w-px before:bg-transparent before:transition-colors hover:before:bg-border",
        side === "left" ? "right-[-4px] before:left-1/2" : "left-[-4px] before:left-1/2"
      )}
      onPointerDown={onPointerDown}
      role="separator"
    />
  );
}

export function SidebarAction({ active = false, icon: Icon, label, onClick }: { active?: boolean; icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <button
      className={cn(
        "sidebar-action relative flex h-7 w-full items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-[12px] transition-colors",
        active ? "text-accent-foreground" : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {active ? <AnimatedSelectionBackground layoutId="left-sidebar-active" /> : null}
      <Icon className={cn("relative z-10 h-[15px] w-[15px] shrink-0", active ? "text-accent-foreground" : "text-muted-foreground")} />
      <span className="relative z-10 min-w-0 truncate">{label}</span>
    </button>
  );
}

export type ConversationSearchResult = {
  id: string;
  providerLabel: string;
  providerLogoDataUrl?: string;
  projectLabel: string;
  title: string;
  working: boolean;
};

export function ConversationSearchDialog({
  agentProviders,
  onClose,
  onSelectThread,
  open,
  projects,
  selectedThread
}: {
  agentProviders: AgentProviderOption[];
  onClose: () => void;
  onSelectThread: (thread: string) => void;
  open: boolean;
  projects: SidebarProject[];
  selectedThread: string;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const searchResults = useMemo<ConversationSearchResult[]>(() => {
    return projects.flatMap((project) => {
      const projectLabel = getSidebarProjectLabel(project) || t("sidebar.repositories");
      return project.threads.map((thread) => {
        const providerLabel = thread.providerId ? getAgentProviderLabel(agentProviders, thread.providerId) : thread.title;
        return {
          id: thread.id,
          providerLabel,
          providerLogoDataUrl: getAgentProviderLogoDataUrl(agentProviders, thread.providerId),
          projectLabel,
          title: thread.title,
          working: Boolean(thread.working)
        };
      });
    });
  }, [agentProviders, projects, t]);

  const visibleResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filteredResults = normalizedQuery
      ? searchResults.filter((result) =>
          `${result.title} ${result.projectLabel} ${result.providerLabel}`.toLocaleLowerCase().includes(normalizedQuery)
        )
      : searchResults;

    return filteredResults.slice(0, 9);
  }, [query, searchResults]);

  useEffect(() => {
    if (!open) return;

    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const selectVisibleResult = useCallback((result: ConversationSearchResult | undefined) => {
    if (!result) return;
    onSelectThread(result.id);
  }, [onSelectThread]);

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(visibleResults.length - 1, index + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectVisibleResult(visibleResults[activeIndex]);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      selectVisibleResult(visibleResults[Number(event.key) - 1]);
    }
  };

  const shortcutPrefix = isMacPlatform() ? "⌘" : "Ctrl+";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/10 px-6 pt-[12vh] backdrop-blur-[2px]"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          transition={{ duration: 0.14, ease: "easeOut" }}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-label={t("searchDialog.title")}
            aria-modal="true"
            className="codex-peek-dialog flex max-h-[70vh] w-[min(86vw,560px)] flex-col overflow-hidden rounded-xl border border-black/10 bg-popover text-popover-foreground shadow-[0_16px_54px_rgba(0,0,0,.22)] outline-none"
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            initial={{ opacity: 0, scale: 0.96, y: -18 }}
            onKeyDown={onDialogKeyDown}
            role="dialog"
            transition={popoverSpringTransition}
          >
            <div className="flex h-[48px] shrink-0 items-center gap-2.5 px-4">
              <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
              <input
                aria-label={t("searchDialog.title")}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/70"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchDialog.placeholder")}
                ref={inputRef}
                value={query}
              />
              <button
                aria-label={t("common.close")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
                onClick={onClose}
                type="button"
              >
                <X className="h-[17px] w-[17px]" />
              </button>
            </div>

            <div className="px-4 pb-1.5 text-[12px] font-semibold text-muted-foreground">{t("searchDialog.recent")}</div>

            <div className="min-h-0 overflow-auto px-2.5 pb-3" role="listbox">
              {visibleResults.length ? (
                <div className="space-y-0.5">
                  {visibleResults.map((result, index) => {
                    const active = activeIndex === index;
                    const selected = selectedThread === result.id;
                    return (
                      <button
                        aria-selected={active}
                        className={cn(
                          "relative grid h-8 w-full grid-cols-[22px_minmax(0,1fr)_auto_auto] items-center gap-2 overflow-hidden rounded-lg px-2.5 text-left transition-colors",
                          active ? "text-foreground" : "text-foreground hover:bg-muted/70"
                        )}
                        key={result.id}
                        onClick={() => selectVisibleResult(result)}
                        onMouseEnter={() => setActiveIndex(index)}
                        role="option"
                        type="button"
                      >
                        {active ? <AnimatedSelectionBackground className="bg-muted" layoutId="search-active-result" /> : null}
                        <span className="relative z-10 grid h-5 w-5 place-items-center">
                          <AgentLogo className="h-[18px] w-[18px] rounded-[5px] border-border/70" label={result.providerLabel} logoDataUrl={result.providerLogoDataUrl} />
                          {selected || result.working ? (
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-popover",
                                result.working ? "animate-pulse bg-primary" : "bg-muted-foreground"
                              )}
                            />
                          ) : null}
                        </span>
                        <span className="relative z-10 min-w-0 truncate text-[13px] font-semibold leading-none text-current">{result.title}</span>
                        <span className="relative z-10 hidden max-w-[120px] truncate text-[12px] font-medium text-muted-foreground sm:block">{result.projectLabel}</span>
                        <kbd className="relative z-10 rounded-full bg-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none text-muted-foreground">
                          {shortcutPrefix}
                          {index + 1}
                        </kbd>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-10 text-center text-[14px] text-muted-foreground">{t("searchDialog.empty")}</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}


export function ThreadHeader({
  agentLogoDataUrl,
  agentProviderLabel,
  canCopyMarkdown,
  canCopyThreadId,
  canRename,
  editingThread,
  leftOpen,
  onCancelRename,
  onCopyMarkdown,
  onCopyThreadId,
  onOpenSmallWindow,
  onRename,
  onSubmitRename,
  title
}: {
  agentLogoDataUrl?: string;
  agentProviderLabel: string;
  canCopyMarkdown: boolean;
  canCopyThreadId: boolean;
  canRename: boolean;
  editingThread: SidebarThread | null;
  leftOpen: boolean;
  onCancelRename: () => void;
  onCopyMarkdown: () => void | Promise<void>;
  onCopyThreadId: () => void | Promise<void>;
  onOpenSmallWindow: () => void | Promise<void>;
  onRename: () => void | Promise<void>;
  onSubmitRename: (thread: SidebarThread, title: string) => void | Promise<void>;
  title: string;
}) {
  const showHeaderTitle = Boolean(title || editingThread);

  return (
    <header className={cn("drag-region flex h-[46px] shrink-0 items-center justify-between bg-background px-4 pr-[58px]", !leftOpen && "pl-[118px]")}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showHeaderTitle ? (
          <>
            <AgentLogo className="h-6 w-6 rounded-[6px] border-border/70" label={agentProviderLabel} logoDataUrl={agentLogoDataUrl} />
            {editingThread ? (
              <ThreadHeaderRenameForm
                key={editingThread.id}
                onCancel={onCancelRename}
                onSubmit={(nextTitle) => onSubmitRename(editingThread, nextTitle)}
                thread={editingThread}
              />
            ) : (
              <>
                <h1 className="min-w-0 truncate text-[15px] font-semibold text-foreground">{title}</h1>
                <ThreadHeaderMenu
                  canCopyMarkdown={canCopyMarkdown}
                  canCopyThreadId={canCopyThreadId}
                  canRename={canRename}
                  onCopyMarkdown={onCopyMarkdown}
                  onCopyThreadId={onCopyThreadId}
                  onOpenSmallWindow={onOpenSmallWindow}
                  onRename={onRename}
                />
              </>
            )}
          </>
        ) : null}
      </div>
    </header>
  );
}

export function ThreadHeaderRenameForm({
  onCancel,
  onSubmit,
  thread
}: {
  onCancel: () => void;
  onSubmit: (title: string) => void | Promise<void>;
  thread: SidebarThread;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const canceledRef = useRef(false);
  const [draft, setDraft] = useState(thread.title);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const submit = () => {
    if (canceledRef.current || submitting) return;
    setSubmitting(true);
    void Promise.resolve(onSubmit(draft)).finally(() => setSubmitting(false));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      canceledRef.current = true;
      onCancel();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="no-drag min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        aria-label={t("thread.rename")}
        className="h-7 w-full min-w-0 max-w-[520px] rounded-md border border-border bg-background px-2 text-[15px] font-semibold text-foreground outline-none transition-colors focus:border-ring disabled:opacity-70"
        disabled={submitting}
        onBlur={submit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        value={draft}
      />
    </form>
  );
}

export function getNativeMenuIconStroke(): string {
  if (typeof document === "undefined") {
    return "#2f2f2f";
  }

  const root = document.documentElement;
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const foreground = window.getComputedStyle(root).getPropertyValue("--foreground").trim();
    if (foreground) return foreground;
  }
  return root.dataset.theme === "dark" ? "#e6e8eb" : "#2f2f2f";
}

function escapeSvgAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function createNativeMenuSvgIcon(children: string, stroke = getNativeMenuIconStroke()): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${escapeSvgAttribute(stroke)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
    children,
    "</svg>"
  ].join("");

  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return `data:image/svg+xml;base64,${window.btoa(svg)}`;
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const threadHeaderNativeMenuIconPaths = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
  markdown: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />',
  rename: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />',
  smallWindow: '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="m15 14-3-3-3 3" />'
};

export function createThreadHeaderNativeMenuIcons(stroke = getNativeMenuIconStroke()) {
  return {
    copy: createNativeMenuSvgIcon(threadHeaderNativeMenuIconPaths.copy, stroke),
    markdown: createNativeMenuSvgIcon(threadHeaderNativeMenuIconPaths.markdown, stroke),
    rename: createNativeMenuSvgIcon(threadHeaderNativeMenuIconPaths.rename, stroke),
    smallWindow: createNativeMenuSvgIcon(threadHeaderNativeMenuIconPaths.smallWindow, stroke)
  };
}

export const threadHeaderNativeMenuIcons = createThreadHeaderNativeMenuIcons();

export function ThreadHeaderMenu({
  canCopyMarkdown,
  canCopyThreadId,
  canRename,
  onCopyMarkdown,
  onCopyThreadId,
  onOpenSmallWindow,
  onRename
}: {
  canCopyMarkdown: boolean;
  canCopyThreadId: boolean;
  canRename: boolean;
  onCopyMarkdown: () => void | Promise<void>;
  onCopyThreadId: () => void | Promise<void>;
  onOpenSmallWindow: () => void | Promise<void>;
  onRename: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const openMenu = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    const nativeMenu = window.agentConsole?.nativeMenu;
    if (!nativeMenu?.popup) {
      toast.error({ content: t("agent.apiUnavailable"), title: t("thread.toastTitle") });
      return;
    }

    try {
      const triggerRect = event.currentTarget.getBoundingClientRect();
      const nativeMenuIcons = createThreadHeaderNativeMenuIcons();
      const result = await nativeMenu.popup({
        items: [
          { enabled: canRename, icon: nativeMenuIcons.rename, id: "rename-thread", label: t("thread.rename") },
          { type: "separator" },
          {
            enabled: canCopyThreadId || canCopyMarkdown,
            icon: nativeMenuIcons.copy,
            label: t("thread.copy"),
            submenu: [
              { enabled: canCopyThreadId, icon: nativeMenuIcons.copy, id: "copy-thread-id", label: t("thread.copySessionId") },
              { enabled: canCopyMarkdown, icon: nativeMenuIcons.markdown, id: "copy-markdown", label: t("thread.copyMarkdown") }
            ]
          },
          { type: "separator" },
          { icon: nativeMenuIcons.smallWindow, id: "open-small-window", label: t("thread.openSmallWindow") }
        ],
        x: Math.round(triggerRect.left),
        y: Math.round(triggerRect.bottom + 4)
      });

      if (result.actionId === "rename-thread") {
        await onRename();
      } else if (result.actionId === "copy-thread-id") {
        await onCopyThreadId();
      } else if (result.actionId === "copy-markdown") {
        await onCopyMarkdown();
      } else if (result.actionId === "open-small-window") {
        await onOpenSmallWindow();
      }
    } catch (error) {
      toast.error({
        content: error instanceof Error && error.message ? error.message : t("thread.menuFailed"),
        title: t("thread.toastTitle")
      });
    }
  };

  return (
    <div className="no-drag relative shrink-0">
      <button
        aria-haspopup="menu"
        aria-label={t("thread.menu")}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
        onClick={(event) => void openMenu(event)}
        title={t("thread.menu")}
        type="button"
      >
        <Ellipsis className="h-[16px] w-[16px]" />
      </button>
    </div>
  );
}

export function FloatingSidebarToggles({
  leftOpen,
  rightOpen,
  toggleLeft,
  toggleRight
}: {
  leftOpen: boolean;
  rightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="absolute left-[78px] top-[9px] z-50">
        <IconButton
          ariaLabel={leftOpen ? t("sidebar.collapseLeft") : t("sidebar.expandLeft")}
          icon={PanelLeft}
          onClick={toggleLeft}
        />
      </div>
      <div className="absolute right-4 top-[9px] z-50">
        <IconButton
          ariaLabel={rightOpen ? t("sidebar.collapseRight") : t("sidebar.expandRight")}
          icon={PanelRight}
          onClick={toggleRight}
        />
      </div>
    </>
  );
}


export function RightSidebar({
  activeTabId,
  agentContext,
  onAddPanel,
  onCloseTab,
  onResizeStart,
  onSelectThread,
  onThreadsChanged,
  open,
  openTabs,
  plugins,
  resizing,
  setActiveTab,
  width
}: {
  activeTabId: string;
  agentContext?: RightSidebarAgentContext;
  onAddPanel: (panel: RightSidebarPluginId) => void;
  onCloseTab: (tabId: string) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelectThread?: (threadId: string) => void;
  onThreadsChanged?: () => void | Promise<void>;
  open: boolean;
  openTabs: RightSidebarTab[];
  plugins: RightSidebarPlugin[];
  resizing: boolean;
  setActiveTab: (tabId: string) => void;
  width: number;
}) {
  const { t } = useI18n();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const visibleTabs = useMemo(
    () =>
      openTabs.map((tab) => {
        const plugin = getRightSidebarPlugin(tab.pluginId, plugins);
        return {
          ...tab,
          label: plugin.label,
          plugin,
          title: plugin.title
        };
      }),
    [openTabs, plugins]
  );
  const activeTab = visibleTabs.find((tab) => tab.id === activeTabId) ?? visibleTabs[0];
  const activePlugin = activeTab?.plugin ?? getRightSidebarPlugin(defaultRightSidebarPluginId, plugins);
  const ActivePluginPanel = activePlugin.component;
  const availablePlugins = useMemo(
    () => plugins.filter((plugin) => !openTabs.some((tab) => tab.pluginId === plugin.id)),
    [openTabs, plugins]
  );
  const activePluginPanelProps = useMemo<RightSidebarPluginPanelProps>(
    () => ({
      agentContext,
      onSelectThread,
      onThreadsChanged,
      nativeViewOccluded: addMenuOpen
    }),
    [addMenuOpen, agentContext, onSelectThread, onThreadsChanged]
  );

  useEffect(() => {
    if (!addMenuOpen) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [addMenuOpen]);

  return (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col bg-background",
        !resizing && "transition-[width] duration-200 ease-out",
        !open && "overflow-hidden"
      )}
      aria-hidden={!open}
      style={{ width: open ? width : 0 }}
    >
      {open ? (
        <>
          <div className="drag-region flex h-[46px] shrink-0 items-center gap-1.5 bg-background px-3 pr-[58px]">
            <div
              aria-label={t("rightSidebar.selectAria")}
              className="no-drag flex h-7 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
            >
              {visibleTabs.map((tab) => {
                const { plugin } = tab;
                const Icon = plugin.icon;
                const selected = tab.id === activeTab?.id;

                return (
                  <div
                    className={cn(
                      "group relative flex h-7 min-w-max shrink-0 items-center rounded-md bg-background text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      selected && "text-foreground after:absolute after:inset-x-1.5 after:bottom-[2px] after:h-0.5 after:rounded-full after:bg-primary"
                    )}
                    key={tab.id}
                  >
                    <button
                      aria-selected={selected}
                      className="flex h-full min-w-0 items-center gap-1 rounded-l-md py-0 pl-1.5 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                      onClick={() => setActiveTab(tab.id)}
                      role="tab"
                      title={tab.title}
                      type="button"
                    >
                      <Icon className={cn("h-[15px] w-[15px] shrink-0 text-muted-foreground", selected && "text-primary")} />
                      <span className="max-w-[92px] truncate">{tab.label}</span>
                    </button>
                    <button
                      aria-label={t("rightSidebar.closeTabAria", { label: tab.label })}
                      className="mr-0.5 grid h-5 w-5 place-items-center rounded-sm text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/20 group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      title={t("rightSidebar.closeTabAria", { label: tab.label })}
                      type="button"
                    >
                      <X className="h-[12px] w-[12px]" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="no-drag relative shrink-0" ref={addMenuRef}>
              <button
                aria-expanded={addMenuOpen}
                aria-haspopup="menu"
                aria-label={t("rightSidebar.addTabAria")}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                onClick={() => setAddMenuOpen((currentOpen) => !currentOpen)}
                title={t("rightSidebar.addTabAria")}
                type="button"
              >
                <Plus className="h-[15px] w-[15px]" />
              </button>

              {addMenuOpen ? (
                <div
                  aria-label={t("rightSidebar.addTabMenuAria")}
                  className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-[0_8px_22px_rgba(0,0,0,.12)]"
                  role="menu"
                >
                  {availablePlugins.length ? (
                    availablePlugins.map((plugin) => {
                      const Icon = plugin.icon;

                      return (
                        <button
                          className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] text-popover-foreground outline-none hover:bg-muted focus-visible:bg-muted"
                          key={plugin.id}
                          onClick={() => {
                            onAddPanel(plugin.id);
                            setAddMenuOpen(false);
                          }}
                          role="menuitem"
                          type="button"
                        >
                          <Icon className="h-[14px] w-[14px] shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate">{plugin.title}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-2 py-1.5 text-[12px] text-muted-foreground">{t("rightSidebar.noAvailableTabs")}</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden border-t border-border">
            <ActivePluginPanel key={activeTab?.id ?? activePlugin.id} {...activePluginPanelProps} />
          </div>
          <SidebarResizeHandle onPointerDown={onResizeStart} side="right" />
        </>
      ) : null}
    </aside>
  );
}
