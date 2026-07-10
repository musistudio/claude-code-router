import {
  ChevronRight,
  CircleX,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  Loader2,
  Puzzle,
  RefreshCcw,
  type LucideIcon
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AgentConsolePluginFileTreeItem } from "../../../../../shared/plugin-types";
import type { RightSidebarPluginPanelProps } from "../../right-sidebar-plugins";
import { openFileInEditor } from "../editor/events";

export function FilesPanel({ agentContext }: RightSidebarPluginPanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const filesApi = window.agentConsole?.files;
  const pluginsApi = window.agentConsole?.plugins;
  const workspaceCwd = agentContext?.project?.path || undefined;
  const [root, setRoot] = useState<FileTreeRoot | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [pluginFileTreeItems, setPluginFileTreeItems] = useState<AgentConsolePluginFileTreeItem[]>([]);
  const [directoryState, setDirectoryState] = useState<Map<string, FileTreeDirectoryState>>(() => new Map());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const directoryStateRef = useRef(directoryState);
  const mountedRef = useRef(false);
  const pendingLoadsRef = useRef(new Set<string>());

  useEffect(() => {
    directoryStateRef.current = directoryState;
  }, [directoryState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingLoadsRef.current.clear();
    };
  }, []);

  const loadDirectory = useCallback(
    async (directoryPath: string, options: { force?: boolean } = {}) => {
      if (!filesApi) return;

      const existingState = directoryStateRef.current.get(directoryPath);
      const pendingLoads = pendingLoadsRef.current;
      if (!options.force && (existingState?.loaded || pendingLoads.has(directoryPath))) {
        return;
      }

      pendingLoads.add(directoryPath);
      setDirectoryState((currentState) => {
        const nextState = new Map(currentState);
        const currentDirectoryState = nextState.get(directoryPath);
        nextState.set(directoryPath, {
          entries: currentDirectoryState?.entries ?? [],
          error: null,
          loaded: currentDirectoryState?.loaded ?? false,
          loading: true
        });
        return nextState;
      });

      try {
        const snapshot = await filesApi.readDirectory({ cwd: workspaceCwd, path: directoryPath });
        if (!mountedRef.current) return;

        setRoot(snapshot.root);
        setDirectoryState((currentState) => {
          const nextState = new Map(currentState);
          nextState.set(snapshot.path, {
            entries: snapshot.entries,
            error: null,
            loaded: true,
            loading: false
          });
          return nextState;
        });
      } catch (error) {
        if (!mountedRef.current) return;

        const message = formatFileTreeError(error);
        setDirectoryState((currentState) => {
          const nextState = new Map(currentState);
          nextState.set(directoryPath, {
            entries: [],
            error: message,
            loaded: false,
            loading: false
          });
          return nextState;
        });
        toast.error({ content: message, title: t("fileTree.directoryErrorTitle") });
      } finally {
        pendingLoads.delete(directoryPath);
      }
    },
    [filesApi, t, toast, workspaceCwd]
  );

  useEffect(() => {
    if (!filesApi) return;

    let disposed = false;
    pendingLoadsRef.current.clear();
    setRoot(null);
    setRootError(null);
    setDirectoryState(new Map());
    setExpandedPaths(new Set());
    setSelectedPath(null);

    void filesApi
      .getRoot({ cwd: workspaceCwd })
      .then((nextRoot) => {
        if (disposed) return;

        setRoot(nextRoot);
        setRootError(null);
        setSelectedPath(nextRoot.path);
        setExpandedPaths(new Set([nextRoot.path]));
        void loadDirectory(nextRoot.path, { force: true });
      })
      .catch((error) => {
        if (!disposed) {
          const message = formatFileTreeError(error);
          setRootError(message);
          toast.error({
            actions: [{ label: t("fileTree.reload"), onClick: () => window.location.reload() }],
            content: message,
            title: t("fileTree.workspaceErrorTitle")
          });
        }
      });

    return () => {
      disposed = true;
    };
  }, [filesApi, loadDirectory, t, toast, workspaceCwd]);

  useEffect(() => {
    let disposed = false;
    void pluginsApi?.get()
      .then((state) => {
        if (!disposed) setPluginFileTreeItems(Array.isArray(state.fileTreeItems) ? state.fileTreeItems : []);
      })
      .catch(() => {
        if (!disposed) setPluginFileTreeItems([]);
      });

    return () => {
      disposed = true;
    };
  }, [pluginsApi]);

  useEffect(() => {
    const onPluginStateChanged = (event: Event) => {
      const state = (event as CustomEvent<{ fileTreeItems?: AgentConsolePluginFileTreeItem[] }>).detail;
      setPluginFileTreeItems(Array.isArray(state?.fileTreeItems) ? state.fileTreeItems : []);
    };
    window.addEventListener("agent-console:plugins:state-changed", onPluginStateChanged);
    return () => window.removeEventListener("agent-console:plugins:state-changed", onPluginStateChanged);
  }, []);

  const toggleDirectory = useCallback(
    (directoryPath: string) => {
      const shouldExpand = !expandedPaths.has(directoryPath);

      setSelectedPath(directoryPath);
      setExpandedPaths((currentPaths) => {
        const nextPaths = new Set(currentPaths);
        if (nextPaths.has(directoryPath)) {
          nextPaths.delete(directoryPath);
        } else {
          nextPaths.add(directoryPath);
        }
        return nextPaths;
      });

      if (shouldExpand) {
        void loadDirectory(directoryPath);
      }
    },
    [expandedPaths, loadDirectory]
  );

  const rootEntry = useMemo<FileTreeEntry | null>(() => (root ? { kind: "directory", name: root.name, path: root.path } : null), [root]);

  if (!filesApi) {
    return (
      <FileTreeUnavailable
        description={t("fileTree.unavailableDescription")}
        title={t("fileTree.unavailableTitle")}
      />
    );
  }

  if (rootError) {
    return (
      <FileTreeUnavailable
        action={<FileTreeIconButton icon={RefreshCcw} label={t("fileTree.reload")} onClick={() => window.location.reload()} />}
        description={rootError}
        title={t("fileTree.workspaceErrorTitle")}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden bg-card">
        <div className="h-full overflow-auto py-1" role="tree" aria-label={t("fileTree.aria")}>
          {pluginFileTreeItems.length ? (
            <PluginFileTreeItems items={pluginFileTreeItems} onSelect={setSelectedPath} selectedPath={selectedPath} />
          ) : null}
          {rootEntry ? (
            <FileTreeNode
              depth={0}
              directoryState={directoryState}
              entry={rootEntry}
              expandedPaths={expandedPaths}
              onSelect={setSelectedPath}
              onToggleDirectory={toggleDirectory}
              selectedPath={selectedPath}
            />
          ) : (
            <FileTreeMessage depth={0} icon={Loader2} loading text={t("fileTree.loadingWorkspace")} />
          )}
        </div>
      </div>
    </div>
  );
}

type FileTreeEntry = {
  kind: "directory" | "file" | "symlink" | "other";
  name: string;
  path: string;
};

type FileTreeRoot = {
  name: string;
  path: string;
};

type FileTreeDirectoryState = {
  entries: FileTreeEntry[];
  error: string | null;
  loaded: boolean;
  loading: boolean;
};

function PluginFileTreeItems({
  items,
  onSelect,
  selectedPath
}: {
  items: AgentConsolePluginFileTreeItem[];
  onSelect: (path: string) => void;
  selectedPath: string | null;
}) {
  return (
    <div className="mb-1 border-b border-border/70 pb-1">
      {items.map((item) => {
        const selected = Boolean(item.path && selectedPath === item.path);
        return (
          <button
            className={cn(
              "group flex h-7 w-full min-w-0 items-center gap-1.5 px-2 text-left text-[12px] text-foreground transition-colors hover:bg-muted",
              selected && "bg-accent text-accent-foreground"
            )}
            key={item.id}
            onClick={() => {
              if (item.path) {
                onSelect(item.path);
                openFileInEditor(item.path);
              } else if (item.commandId) {
                window.dispatchEvent(new CustomEvent("agent-console:plugins:command", { detail: { commandId: item.commandId } }));
              }
            }}
            title={item.path ?? item.label}
            type="button"
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground">
              <Puzzle className="h-[13px] w-[13px]" />
            </span>
            <FileText className="h-[14px] w-[14px] shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FileTreeNode({
  depth,
  directoryState,
  entry,
  expandedPaths,
  onSelect,
  onToggleDirectory,
  selectedPath
}: {
  depth: number;
  directoryState: Map<string, FileTreeDirectoryState>;
  entry: FileTreeEntry;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  selectedPath: string | null;
}) {
  const isDirectory = entry.kind === "directory";
  const expanded = isDirectory && expandedPaths.has(entry.path);
  const selected = selectedPath === entry.path;
  const loadState = isDirectory ? directoryState.get(entry.path) : undefined;

  return (
    <div className="[contain:content] [content-visibility:auto] [contain-intrinsic-size:28px]">
      <button
        aria-expanded={isDirectory ? expanded : undefined}
        className={cn(
          "group flex h-7 w-full min-w-0 items-center gap-1.5 px-2 text-left text-[12px] text-foreground transition-colors hover:bg-muted",
          selected && "bg-accent text-accent-foreground",
          entry.kind === "symlink" && "text-muted-foreground"
        )}
        onClick={() => {
          if (isDirectory) {
            onToggleDirectory(entry.path);
          } else {
            onSelect(entry.path);
            if (entry.kind === "file" || entry.kind === "symlink") {
              openFileInEditor(entry.path);
            }
          }
        }}
        role="treeitem"
        style={{ paddingLeft: 8 + depth * 15 }}
        title={entry.path}
        type="button"
      >
        <span className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground">
          {isDirectory ? <ChevronRight className={cn("h-[13px] w-[13px] transition-transform duration-150", expanded && "rotate-90")} /> : null}
        </span>
        {isDirectory ? (
          expanded ? (
            <FolderOpen className="h-[14px] w-[14px] shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="h-[14px] w-[14px] shrink-0 text-muted-foreground" />
          )
        ) : (
          <FileText className="h-[14px] w-[14px] shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        {loadState?.loading ? <Loader2 className="h-[12px] w-[12px] shrink-0 animate-spin text-muted-foreground" /> : null}
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <AnimatedFileTreeChildren>
            <FileTreeDirectoryChildren
              depth={depth + 1}
              directoryPath={entry.path}
              directoryState={directoryState}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggleDirectory={onToggleDirectory}
              selectedPath={selectedPath}
            />
          </AnimatedFileTreeChildren>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FileTreeDirectoryChildren({
  depth,
  directoryPath,
  directoryState,
  expandedPaths,
  onSelect,
  onToggleDirectory,
  selectedPath
}: {
  depth: number;
  directoryPath: string;
  directoryState: Map<string, FileTreeDirectoryState>;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  selectedPath: string | null;
}) {
  const { t } = useI18n();
  const state = directoryState.get(directoryPath);

  if (!state || (state.loading && !state.loaded)) {
    return <FileTreeMessage depth={depth} icon={Loader2} loading text={t("fileTree.loadingDirectory")} />;
  }

  if (state.error) {
    return <FileTreeMessage depth={depth} icon={CircleX} tone="danger" text={state.error} />;
  }

  if (state.entries.length === 0) {
    return <FileTreeMessage depth={depth} icon={Folder} text={t("fileTree.emptyDirectory")} />;
  }

  return (
    <>
      {state.entries.map((entry) => (
        <FileTreeNode
          depth={depth}
          directoryState={directoryState}
          entry={entry}
          expandedPaths={expandedPaths}
          key={entry.path}
          onSelect={onSelect}
          onToggleDirectory={onToggleDirectory}
          selectedPath={selectedPath}
        />
      ))}
    </>
  );
}

function AnimatedFileTreeChildren({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const updateHeight = () => setHeight(element.scrollHeight);
    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <motion.div
      animate={{ height, opacity: 1 }}
      className="overflow-hidden"
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
      transition={{
        height: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.12, ease: "easeOut" }
      }}
    >
      <div ref={contentRef}>{children}</div>
    </motion.div>
  );
}

function FileTreeMessage({
  depth,
  icon: Icon,
  loading,
  text,
  tone = "muted"
}: {
  depth: number;
  icon: LucideIcon;
  loading?: boolean;
  text: string;
  tone?: "danger" | "muted";
}) {
  return (
    <div
      className={cn("flex h-7 min-w-0 items-center gap-1.5 px-2 text-[11px]", tone === "danger" ? "text-destructive" : "text-muted-foreground")}
      style={{ paddingLeft: 28 + depth * 15 }}
    >
      <Icon className={cn("h-[13px] w-[13px] shrink-0", loading && "animate-spin")} />
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}

function FileTreeIconButton({
  disabled,
  icon: Icon,
  label,
  loading,
  onClick
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className={cn("h-[14px] w-[14px]", loading && "animate-spin")} />
    </button>
  );
}

function FileTreeUnavailable({
  action,
  description,
  title
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="grid h-full min-h-[260px] w-full place-items-center bg-card p-4 text-center">
      <div className="max-w-[260px]">
        <div className="mx-auto grid h-9 w-9 place-items-center rounded-md bg-secondary text-muted-foreground">
          <FolderTree className="h-[18px] w-[18px]" />
        </div>
        <div className="mt-3 text-[13px] font-semibold text-card-foreground">{title}</div>
        <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{description}</div>
        {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

function formatFileTreeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unknown file tree error.");
}
