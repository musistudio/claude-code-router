import { Code2, Loader2, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type * as Monaco from "monaco-editor";
import "monaco-editor/min/vs/editor/editor.main.css";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { configureMonacoLanguageServices, createMonacoFileUri, getMonacoLanguage, loadMonacoLanguageContributions } from "../../../../../shared/monaco-language-services";
import type { RightSidebarPluginPanelProps } from "../../right-sidebar-plugins";
import { consumePendingOpenFilePaths, openFileEventName, removePendingOpenFilePath } from "./events";
import { setupMonacoEnvironment } from "../shared/monaco-environment";

type MonacoModule = typeof Monaco;
type MonacoEditor = ReturnType<MonacoModule["editor"]["create"]>;
type MonacoModel = ReturnType<MonacoModule["editor"]["createModel"]>;

type WorkspaceTextFile = {
  content: string;
  mtimeMs: number;
  name: string;
  path: string;
  size: number;
};

type EditorTab = {
  content: string;
  cwd?: string;
  dirty: boolean;
  error: string | null;
  language: string;
  loading: boolean;
  mtimeMs: number;
  name: string;
  path: string;
  savedContent: string;
  saving: boolean;
  size: number;
};

function getResolvedMonacoTheme() {
  if (typeof document === "undefined") return "vs";
  return document.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs";
}

function observeThemeChanges(onChange: () => void) {
  if (typeof document === "undefined") return () => undefined;

  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["class", "data-theme", "style"], attributes: true });
  return () => observer.disconnect();
}

export function FileEditorPanel({ agentContext }: RightSidebarPluginPanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const filesApi = window.agentConsole?.files;
  const workspaceCwd = agentContext?.project?.path || undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const modelsRef = useRef<Map<string, MonacoModel>>(new Map());
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [monacoModule, setMonacoModule] = useState<MonacoModule | null>(null);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const activeTab = useMemo(() => tabs.find((tab) => tab.path === activePath) ?? null, [activePath, tabs]);

  const openPath = useCallback(
    async (filePath: string) => {
      if (!filesApi) return;

      setActivePath(filePath);
      setTabs((currentTabs) => {
        if (currentTabs.some((tab) => tab.path === filePath)) return currentTabs;
        return [
          ...currentTabs,
          {
            content: "",
            cwd: workspaceCwd,
            dirty: false,
            error: null,
            language: getMonacoLanguage(filePath),
            loading: true,
            mtimeMs: 0,
            name: getPathBaseName(filePath),
            path: filePath,
            savedContent: "",
            saving: false,
            size: 0
          }
        ];
      });

      try {
        const file = await filesApi.readFile({ cwd: workspaceCwd, path: filePath });
        setTabs((currentTabs) =>
          currentTabs.map((tab) => {
            if (tab.path !== filePath) return tab;
            if (tab.dirty) {
              return { ...tab, error: null, loading: false, mtimeMs: file.mtimeMs, size: file.size };
            }
            return createTabFromFile(file, workspaceCwd);
          })
        );
      } catch (error) {
        const message = formatEditorError(error);
        setTabs((currentTabs) =>
          currentTabs.map((tab) => (tab.path === filePath ? { ...tab, error: message, loading: false } : tab))
        );
        toast.error({ content: message, title: t("rightSidebar.editor.title") });
      }
    },
    [filesApi, t, toast, workspaceCwd]
  );

  const saveActiveFile = useCallback(async () => {
    if (!filesApi || !activeTab || activeTab.loading || activeTab.saving || activeTab.error) return;

    const model = modelsRef.current.get(activeTab.path);
    const content = model?.getValue() ?? activeTab.content;

    setTabs((currentTabs) => currentTabs.map((tab) => (tab.path === activeTab.path ? { ...tab, saving: true } : tab)));

    try {
      const savedFile = await filesApi.writeFile({ content, cwd: activeTab.cwd ?? workspaceCwd, path: activeTab.path });
      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.path === activeTab.path
            ? {
                ...tab,
                content,
                dirty: false,
                error: null,
                language: getMonacoLanguage(savedFile.path),
                mtimeMs: savedFile.mtimeMs,
                name: savedFile.name,
                savedContent: content,
                saving: false,
                size: savedFile.size
              }
            : tab
        )
      );
      toast.success({ content: t("editor.savedNotice", { path: savedFile.path }), title: t("rightSidebar.editor.title") });
    } catch (error) {
      const message = formatEditorError(error);
      setTabs((currentTabs) =>
        currentTabs.map((tab) => (tab.path === activeTab.path ? { ...tab, error: message, saving: false } : tab))
      );
      toast.error({ content: message, title: t("rightSidebar.editor.title") });
    }
  }, [activeTab, filesApi, t, toast, workspaceCwd]);

  const closeTab = useCallback(
    (filePath: string) => {
      const tabIndex = tabs.findIndex((tab) => tab.path === filePath);
      const tab = tabs[tabIndex];
      if (!tab) return;
      if (tab.dirty && !window.confirm(t("editor.closeUnsavedConfirm", { name: tab.name }))) return;

      modelsRef.current.get(filePath)?.dispose();
      modelsRef.current.delete(filePath);

      setTabs((currentTabs) => currentTabs.filter((currentTab) => currentTab.path !== filePath));
      if (activePath === filePath) {
        const nextTabs = tabs.filter((currentTab) => currentTab.path !== filePath);
        setActivePath(nextTabs[tabIndex - 1]?.path ?? nextTabs[0]?.path ?? null);
      }
    },
    [activePath, t, tabs]
  );

  useEffect(() => {
    setupMonacoEnvironment();

    let disposed = false;
    void Promise.all([
      loadMonacoLanguageContributions(),
      import("monaco-editor/esm/vs/editor/editor.api.js")
    ]).then(([, nextMonacoModule]) => {
      if (disposed) return;
      const typedMonacoModule = nextMonacoModule as unknown as MonacoModule;
      configureMonacoLanguageServices(typedMonacoModule, { eagerModelSync: true });
      setMonacoModule(typedMonacoModule);
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!monacoModule || !containerRef.current || editorRef.current) return;

    editorRef.current = monacoModule.editor.create(containerRef.current, {
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      fixedOverflowWidgets: true,
      fontFamily: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      lineHeight: 20,
      minimap: { enabled: false },
      model: null,
      padding: { bottom: 16, top: 10 },
      parameterHints: { enabled: true },
      quickSuggestions: { comments: false, other: true, strings: true },
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      "semanticHighlighting.enabled": false,
      smoothScrolling: true,
      snippetSuggestions: "inline",
      suggestOnTriggerCharacters: true,
      tabSize: 2,
      tabCompletion: "on",
      theme: getResolvedMonacoTheme(),
      wordBasedSuggestions: "matchingDocuments",
      wordWrap: "off"
    });

    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, [monacoModule]);

  useEffect(() => {
    if (!monacoModule) return undefined;

    const syncTheme = () => {
      monacoModule.editor.setTheme(getResolvedMonacoTheme());
    };

    syncTheme();
    return observeThemeChanges(syncTheme);
  }, [monacoModule]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !monacoModule || !activeTab || activeTab.loading || activeTab.error) {
      editor?.setModel(null);
      return;
    }

    let model = modelsRef.current.get(activeTab.path);
    if (!model) {
      model = monacoModule.editor.createModel(activeTab.content, activeTab.language, createMonacoFileUri(monacoModule, activeTab.path));
      modelsRef.current.set(activeTab.path, model);
    } else {
      if (model.getLanguageId() !== activeTab.language) {
        monacoModule.editor.setModelLanguage(model, activeTab.language);
      }
      if (!activeTab.dirty && model.getValue() !== activeTab.content) {
        model.setValue(activeTab.content);
      }
    }

    editor.setModel(model);
    window.requestAnimationFrame(() => editor.layout());

    const disposable = model.onDidChangeContent(() => {
      const value = model?.getValue() ?? "";
      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.path === activeTab.path
            ? {
                ...tab,
                content: value,
                dirty: value !== tab.savedContent,
                error: null
              }
            : tab
        )
      );
    });

    return () => disposable.dispose();
  }, [activeTab?.dirty, activeTab?.error, activeTab?.language, activeTab?.loading, activeTab?.mtimeMs, activeTab?.path, monacoModule]);

  useEffect(() => {
    return () => {
      modelsRef.current.forEach((model) => model.dispose());
      modelsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const openQueuedPaths = () => {
      const queuedPaths = consumePendingOpenFilePaths();
      queuedPaths.forEach((filePath) => void openPath(filePath));
    };

    openQueuedPaths();
    const onOpenFile = (event: Event) => {
      const filePath = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (filePath) {
        removePendingOpenFilePath(filePath);
        void openPath(filePath);
      }
    };

    window.addEventListener(openFileEventName, onOpenFile);
    return () => window.removeEventListener(openFileEventName, onOpenFile);
  }, [openPath]);

  useEffect(() => {
    if (!tabs.length) return;
    const tabStrip = tabStripRef.current;
    if (!tabStrip) return;

    const frameId = window.requestAnimationFrame(() => {
      const activeButton = tabStrip.querySelector<HTMLButtonElement>(`[data-editor-tab="${cssEscape(activePath ?? "")}"]`);
      activeButton?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activePath, tabs.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveFile();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveActiveFile]);

  if (!filesApi) {
    return (
      <div className="grid h-full min-h-[260px] w-full place-items-center bg-card p-4 text-center text-[12px] text-muted-foreground">
        {t("editor.unavailable")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-card text-card-foreground">
      <div className="flex h-9 min-h-9 max-h-9 shrink-0 items-center gap-2 border-b border-border px-2">
        <div ref={tabStripRef} className="app-tab-strip flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden">
          {tabs.length ? (
            tabs.map((tab) => (
              <button
                className={cn(
                  "group flex h-7 max-w-[180px] shrink-0 items-center gap-1.5 rounded-md px-2 text-left font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground",
                  tab.path === activePath && "bg-accent text-accent-foreground"
                )}
                data-editor-tab={tab.path}
                key={tab.path}
                onClick={() => setActivePath(tab.path)}
                title={tab.path}
                type="button"
              >
                {tab.loading ? <Loader2 className="h-[13px] w-[13px] shrink-0 animate-spin" /> : <Code2 className="h-[13px] w-[13px] shrink-0" />}
                <span className="min-w-0 truncate">{tab.name}</span>
                {tab.dirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
                <span
                  className="pointer-events-none grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.path);
                  }}
                  onKeyDown={(event: ReactKeyboardEvent<HTMLSpanElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      closeTab(tab.path);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title={t("editor.closeTab")}
                >
                  <X className="h-[12px] w-[12px]" />
                </span>
              </button>
            ))
          ) : (
            <span className="px-2 font-mono text-[11px] text-muted-foreground">{t("editor.openFromTree")}</span>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full min-h-0" ref={containerRef} />
        {activeTab?.loading ? (
          <EditorEmptyState icon={Loader2} loading text={t("editor.loading")} />
        ) : activeTab?.error ? (
          <EditorEmptyState text={activeTab.error} tone="danger" />
        ) : activeTab ? null : (
          <EditorEmptyState text={t("editor.empty")} />
        )}
      </div>
    </div>
  );
}

function EditorEmptyState({ icon: Icon = Code2, loading, text, tone = "muted" }: { icon?: LucideIcon; loading?: boolean; text: string; tone?: "danger" | "muted" }) {
  return (
    <div className={cn("absolute inset-0 grid place-items-center bg-card p-4 text-center text-[12px]", tone === "danger" ? "text-destructive" : "text-muted-foreground")}>
      <div>
        <Icon className={cn("mx-auto mb-2 h-5 w-5", loading && "animate-spin")} />
        <div>{text}</div>
      </div>
    </div>
  );
}

function createTabFromFile(file: WorkspaceTextFile, cwd?: string): EditorTab {
  return {
    content: file.content,
    cwd,
    dirty: false,
    error: null,
    language: getMonacoLanguage(file.path),
    loading: false,
    mtimeMs: file.mtimeMs,
    name: file.name,
    path: file.path,
    savedContent: file.content,
    saving: false,
    size: file.size
  };
}

function formatEditorError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unknown file editor error.");
}

function getPathBaseName(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? value;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
