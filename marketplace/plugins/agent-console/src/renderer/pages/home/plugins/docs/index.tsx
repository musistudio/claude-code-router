import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCcw,
  XCircle,
  type LucideIcon
} from "lucide-react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TurndownService from "turndown";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { RightSidebarPluginPanelProps } from "../../right-sidebar-plugins";
import {
  getAgentContextWindowInfo,
  getAgentModelOptions,
  getDefaultAgentModel,
  getMessagePartVisibleText,
  getValidAgentEffort,
  getValidAgentModel,
  normalizeMessagePart,
  type AgentProviderOption,
  type ChatAgentApprovalDecision,
  type ChatAgentRunEvent
} from "../../utils/core";

type WorkspaceTextFile = {
  content: string;
  mtimeMs: number;
  name: string;
  path: string;
  size: number;
};

type FileTreeEntry = {
  kind: "directory" | "file" | "symlink" | "other";
  name: string;
  path: string;
};

type FileTreeDirectory = {
  entries: FileTreeEntry[];
  path: string;
};

type DocsRunStatus = "approval" | "completed" | "failed" | "idle" | "question" | "running" | "starting";

type DocsRunState = {
  approvalId?: string;
  approvalOptions?: ChatAgentApprovalDecision[];
  error?: string;
  output: string;
  runId?: string;
  status: DocsRunStatus;
  threadId?: string;
};

type ReferencedAgent = {
  id: string;
  source: "frontmatter" | "link" | "mention";
};

type DocsAgentMentionMenuState = {
  items: AgentProviderOption[];
  left: number;
  query: string;
  range: { from: number; to: number };
  selectedIndex: number;
  top: number;
};

type DocsSlashCommandItem = {
  icon: string;
  id: string;
  keywords: string[];
  provider?: AgentProviderOption;
  run: (editor: TiptapEditor, range: { from: number; to: number }) => boolean;
  title: string;
};

type DocsSlashCommandMenuState = {
  items: DocsSlashCommandItem[];
  left: number;
  query: string;
  range: { from: number; to: number };
  selectedIndex: number;
  top: number;
};

const markdownExtensions = new Set([".md", ".markdown", ".mdx"]);
const maxDocumentOptions = 120;
const maxScannedDirectories = 24;
const outputPattern = /<([A-Za-z0-9_-]+):start\s*>([\s\S]*?)<\/\1:end\s*>/g;
const legacyOutputPattern = /<!--\s*agent-output:start\s+([A-Za-z0-9_-]+)\s*-->([\s\S]*?)<!--\s*agent-output:end\s+\1\s*-->/g;
const agentLinkPattern = /\[@?([A-Za-z0-9][\w-]*)\]\(agent:\/\/([^)]+)\)/g;
const mentionPattern = /(^|[\s[(])@([A-Za-z0-9][\w-]*)(?=\s|$|[)\].,，。:：;；])/g;
const htmlToMarkdownService = createHtmlToMarkdownService();

marked.use({
  async: false,
  breaks: false,
  gfm: true,
  pedantic: false
});

export function DocsPanel({
  agentContext,
  onSelectThread,
  onThreadsChanged
}: RightSidebarPluginPanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const filesApi = window.agentConsole?.files;
  const agentApi = window.agentConsole?.agent;
  const workspaceCwd = agentContext?.project?.path || undefined;
  const activePathRef = useRef("");
  const contentRef = useRef("");
  const savedContentRef = useRef("");
  const mountedRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const runStatesRef = useRef<Record<string, DocsRunState>>({});
  const runToProviderRef = useRef(new Map<string, string>());
  const pendingThreadToProviderRef = useRef(new Map<string, string>());
  const runDeltaTextRef = useRef(new Map<string, string>());
  const runPartTextRef = useRef(new Map<string, Map<string, string>>());

  const [activePath, setActivePath] = useState("");
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [documents, setDocuments] = useState<WorkspaceTextFile[]>([]);
  const [rootPath, setRootPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runStates, setRunStates] = useState<Record<string, DocsRunState>>({});
  const deferredContent = useDeferredValue(content);
  const dirty = content !== savedContent;

  const providers = useMemo(
    () => (agentContext?.agentProviders ?? []).filter((provider) => provider.enabled),
    [agentContext?.agentProviders]
  );
  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);
  const referencedAgents = useMemo(() => extractReferencedAgents(deferredContent), [deferredContent]);
  const unknownReferencedAgentIds = useMemo(
    () => referencedAgents.filter((agent) => !providerById.has(agent.id)).map((agent) => agent.id),
    [providerById, referencedAgents]
  );
  const visibleStatusProviders = useMemo(() => {
    const providerIds = new Set<string>();
    Object.entries(runStates).forEach(([providerId, runState]) => {
      if (runState.status !== "idle" || runState.error || runState.threadId) providerIds.add(providerId);
    });
    return Array.from(providerIds).flatMap((providerId) => {
      const provider = providerById.get(providerId);
      return provider ? [provider] : [];
    });
  }, [providerById, runStates]);
  const outputBlocks = useMemo(() => extractAgentOutputs(deferredContent), [deferredContent]);
  const documentOptions = useMemo(
    () => documents.length
      ? documents.map((document) => ({
        label: formatDocumentOption(document, rootPath),
        value: document.path
      }))
      : [{
        disabled: true,
        label: discovering ? t("docs.discovering") : t("docs.noDocuments"),
        value: ""
      }],
    [discovering, documents, rootPath, t]
  );

  const setDocumentContent = useCallback((nextContent: string) => {
    contentRef.current = nextContent;
    setContent(nextContent);
  }, []);
  const setDocumentSavedContent = useCallback((nextContent: string) => {
    savedContentRef.current = nextContent;
    setSavedContent(nextContent);
  }, []);
  const setDocumentActivePath = useCallback((nextPath: string) => {
    activePathRef.current = nextPath;
    setActivePath(nextPath);
  }, []);

  const saveDocumentContent = useCallback(
    async (nextContent = contentRef.current) => {
      const filePath = activePathRef.current;
      if (!filesApi || !filePath || nextContent === savedContentRef.current) return;

      const write = saveChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const savedFile = await filesApi.writeFile({ content: nextContent, cwd: workspaceCwd, path: filePath });
          if (!mountedRef.current || activePathRef.current !== filePath) return;

          savedContentRef.current = nextContent;
          setSavedContent(nextContent);
          setDocuments((currentDocuments) => upsertDocumentOption(currentDocuments, savedFile));
        });

      saveChainRef.current = write.catch(() => undefined);

      try {
        await write;
      } catch (nextError) {
        const message = formatDocsError(nextError);
        setError(message);
        toast.error({ content: message, title: t("docs.toastTitle") });
        throw nextError;
      }
    },
    [filesApi, t, toast]
  );

  const loadDocuments = useCallback(async () => {
    if (!filesApi) return;

    setDiscovering(true);
    setError(null);
    try {
      const root = await filesApi.getRoot({ cwd: workspaceCwd });
      const nextDocuments = await discoverMarkdownDocuments(filesApi, root.path, workspaceCwd);
      if (!mountedRef.current) return;

      setRootPath(root.path);
      setDocuments(nextDocuments);
      if (!activePathRef.current && nextDocuments[0]) {
        await loadDocumentFile(filesApi, nextDocuments[0].path, {
          cwd: workspaceCwd,
          setActivePath: setDocumentActivePath,
          setDocumentContent,
          setError,
          setLoading,
          setSavedContent: setDocumentSavedContent,
          toast,
          title: t("docs.toastTitle")
        });
      }
    } catch (nextError) {
      if (!mountedRef.current) return;
      const message = formatDocsError(nextError);
      setError(message);
      toast.error({ content: message, title: t("docs.toastTitle") });
    } finally {
      if (mountedRef.current) setDiscovering(false);
    }
  }, [filesApi, setDocumentActivePath, setDocumentContent, setDocumentSavedContent, t, toast, workspaceCwd]);

  const openDocument = useCallback(
    async (filePath: string) => {
      if (!filesApi || !filePath || filePath === activePath) return;
      if (dirty && !window.confirm(t("docs.openUnsavedConfirm"))) return;

      await saveDocumentContent().catch(() => undefined);
      await loadDocumentFile(filesApi, filePath, {
        cwd: workspaceCwd,
        setActivePath: setDocumentActivePath,
        setDocumentContent,
        setError,
        setLoading,
        setSavedContent: setDocumentSavedContent,
        toast,
        title: t("docs.toastTitle")
      });
    },
    [activePath, dirty, filesApi, saveDocumentContent, setDocumentActivePath, setDocumentContent, setDocumentSavedContent, t, toast, workspaceCwd]
  );

  const setRunState = useCallback((providerId: string, update: (currentState: DocsRunState) => DocsRunState) => {
    setRunStates((currentStates) => {
      const currentState = currentStates[providerId] ?? { output: "", status: "idle" as const };
      const nextStates = {
        ...currentStates,
        [providerId]: update(currentState)
      };
      runStatesRef.current = nextStates;
      return nextStates;
    });
  }, []);
  const cleanupRunBuffers = useCallback((runId: string | undefined) => {
    if (!runId) return;
    runToProviderRef.current.delete(runId);
    runDeltaTextRef.current.delete(runId);
    runPartTextRef.current.delete(runId);
  }, []);

  const applyAgentOutput = useCallback(
    async (provider: AgentProviderOption, output: string) => {
      const trimmedOutput = output.trim();
      if (!trimmedOutput) return;

      const blockId = normalizeAgentBlockId(provider.id);
      const nextContent = insertOrReplaceAgentOutput(contentRef.current, blockId, trimmedOutput);
      setDocumentContent(nextContent);
      await saveDocumentContent(nextContent);
    },
    [saveDocumentContent, setDocumentContent]
  );

  const runProvider = useCallback(
    async (provider: AgentProviderOption) => {
      if (!agentApi) {
        throw new Error(t("agent.apiUnavailable"));
      }
      if (!agentContext?.project?.path) {
        throw new Error(t("docs.projectUnavailable"));
      }
      if (!activePathRef.current) {
        throw new Error(t("docs.noDocument"));
      }

      setRunState(provider.id, () => ({ output: "", status: "starting" }));
      const title = `Docs: ${getPathBaseName(activePathRef.current)} / ${provider.label}`;
      const threadResult = await agentApi.startThread({
        cwd: agentContext.project.path,
        projectId: agentContext.project.id,
        projectName: agentContext.project.name,
        projectPath: agentContext.project.path,
        providerId: provider.id,
        title
      });
      const threadId = threadResult.thread.id;
      pendingThreadToProviderRef.current.set(threadId, provider.id);
      setRunState(provider.id, (currentState) => ({ ...currentState, status: "running", threadId }));
      void onThreadsChanged?.();

      const modelOptions = getAgentModelOptions(providers, provider.id);
      const model = provider.id === agentContext.agentProviderId
        ? getValidAgentModel(agentContext.activeModel, providers, provider.id)
        : getDefaultAgentModel(provider);
      const effort = getValidAgentEffort(agentContext.agentEffort, model, modelOptions);
      const prompt = createDocsAgentPrompt({
        documentPath: activePathRef.current,
        markdown: contentRef.current,
        provider
      });
      const modelOption = modelOptions.find((option) => option.value === model);
      const limitTokens = modelOption?.contextWindowTokens ?? null;
      const contextWindow = getAgentContextWindowInfo({
        estimatedTokens: null,
        limitTokens,
        modelLabel: modelOption?.label ?? model,
        remainingTokens: null,
        source: "unknown",
        usage: null,
        usedTokens: null
      });

      try {
        const result = await agentApi.sendMessage({
          approvalMode: agentContext.agentApprovalMode,
          contextWindow,
          effort,
          model: model || undefined,
          prompt,
          providerId: provider.id,
          threadId,
          title
        });
        const output = result.run.output || runStatesRef.current[provider.id]?.output || "";
        await applyAgentOutput(provider, output);
        setRunState(provider.id, (currentState) => ({
          ...currentState,
          error: result.run.success ? undefined : result.run.stderr || result.run.output || t("agent.runFailed"),
          output,
          runId: result.run.runId,
          status: result.run.success ? "completed" : "failed",
          threadId: result.thread.id
        }));
        pendingThreadToProviderRef.current.delete(threadId);
        cleanupRunBuffers(result.run.runId);
      } catch (nextError) {
        const message = formatDocsError(nextError);
        setRunState(provider.id, (currentState) => ({ ...currentState, error: message, status: "failed" }));
        pendingThreadToProviderRef.current.delete(threadId);
        cleanupRunBuffers(runStatesRef.current[provider.id]?.runId);
        throw nextError;
      }
    },
    [agentApi, agentContext, applyAgentOutput, cleanupRunBuffers, onThreadsChanged, providers, setRunState, t]
  );

  const summonProvider = useCallback(
    async (provider: AgentProviderOption) => {
      const currentStatus = runStatesRef.current[provider.id]?.status;
      if (currentStatus && isDocsRunActiveStatus(currentStatus)) return;

      try {
        await saveDocumentContent();
        await runProvider(provider);
      } catch (nextError) {
        toast.error({ content: formatDocsError(nextError), title: t("docs.toastTitle") });
      }
    },
    [runProvider, saveDocumentContent, t, toast]
  );

  const resolveApproval = useCallback(
    async (providerId: string, decision: ChatAgentApprovalDecision) => {
      const approvalId = runStatesRef.current[providerId]?.approvalId;
      if (!approvalId || !agentApi?.resolveApproval) return;

      try {
        await agentApi.resolveApproval({ approvalId, decision });
        setRunState(providerId, (currentState) => ({
          ...currentState,
          approvalId: undefined,
          approvalOptions: undefined,
          status: "running"
        }));
      } catch (nextError) {
        const message = formatDocsError(nextError);
        setRunState(providerId, (currentState) => ({ ...currentState, error: message }));
      }
    },
    [agentApi, setRunState]
  );

  useEffect(() => {
    mountedRef.current = true;
    activePathRef.current = "";
    contentRef.current = "";
    savedContentRef.current = "";
    setActivePath("");
    setContent("");
    setSavedContent("");
    setDocuments([]);
    setRootPath("");
    setRunStates({});
    runStatesRef.current = {};
    void loadDocuments();
    return () => {
      mountedRef.current = false;
    };
  }, [loadDocuments]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    savedContentRef.current = savedContent;
  }, [savedContent]);

  useEffect(() => {
    runStatesRef.current = runStates;
  }, [runStates]);

  useEffect(() => {
    if (!agentApi?.onEvent) return undefined;

    const dispose = agentApi.onEvent((event) => {
      handleAgentEvent(event, {
        pendingThreadToProvider: pendingThreadToProviderRef.current,
        runDeltaText: runDeltaTextRef.current,
        runPartText: runPartTextRef.current,
        runToProvider: runToProviderRef.current,
        setRunState
      });
    });

    return dispose;
  }, [agentApi, setRunState]);

  if (!filesApi) {
    return (
      <DocsEmptyState
        icon={FileText}
        text={t("docs.fileApiUnavailable")}
        title={t("docs.title")}
      />
    );
  }

  const showAgentStatus = Boolean(activePath && (visibleStatusProviders.length || unknownReferencedAgentIds.length || outputBlocks.length));

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-card text-card-foreground">
      <div className="flex min-h-[42px] shrink-0 items-center gap-1.5 border-b border-border px-2">
        <Select
          aria-label={t("docs.selectDocument")}
          className="min-w-0 flex-1"
          disabled={loading || discovering || documents.length === 0}
          menuClassName="max-w-[360px]"
          onValueChange={(value) => {
            if (value) void openDocument(value);
          }}
          options={documentOptions}
          selectClassName="h-7 w-full max-w-none border border-border bg-background px-2 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/20"
          value={activePath}
        />
        <Button
          aria-label={t("docs.refresh")}
          disabled={discovering}
          onClick={() => void loadDocuments()}
          size="icon"
          title={t("docs.refresh")}
          type="button"
          variant="ghost"
        >
          <RefreshCcw className={cn("h-[14px] w-[14px]", discovering && "animate-spin")} />
        </Button>
      </div>

      {showAgentStatus ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border/70 px-2 py-1">
          {visibleStatusProviders.map((provider) => {
            const runState = runStates[provider.id] ?? { output: "", status: "idle" as const };
            return (
              <DocsAgentStatusPill
                key={provider.id}
                onOpenThread={runState.threadId && onSelectThread ? () => onSelectThread(runState.threadId ?? "") : undefined}
                onResolveApproval={(decision) => void resolveApproval(provider.id, decision)}
                provider={provider}
                runState={runState}
              />
            );
          })}
          {unknownReferencedAgentIds.length ? (
            <div className="flex min-h-7 max-w-full shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className="truncate">
                {t("docs.unknownReferences", { agents: unknownReferencedAgentIds.join(", ") })}
              </span>
            </div>
          ) : null}
          {outputBlocks.length ? (
            <div className="flex min-h-7 shrink-0 items-center rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground">
              {t("docs.outputBlocks", { count: outputBlocks.length })}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-2 py-2 text-[12px] text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {!activePath && !loading ? (
          <DocsEmptyState
            icon={FileText}
            text={t("docs.emptyDescription")}
            title={t("docs.emptyTitle")}
          />
        ) : (
          <DocsRichMarkdownEditor
            loading={loading}
            markdown={content}
            onMarkdownChange={(nextMarkdown) => {
              setDocumentContent(nextMarkdown);
              setError(null);
            }}
            onSaveShortcut={() => void saveDocumentContent()}
            onSummonProvider={(provider) => void summonProvider(provider)}
            providers={providers}
          />
        )}
      </div>
    </div>
  );
}

function DocsRichMarkdownEditor({
  loading,
  markdown,
  onMarkdownChange,
  onSaveShortcut,
  onSummonProvider,
  providers
}: {
  loading: boolean;
  markdown: string;
  onMarkdownChange: (markdown: string) => void;
  onSaveShortcut: () => void;
  onSummonProvider: (provider: AgentProviderOption) => void;
  providers: AgentProviderOption[];
}) {
  const { t } = useI18n();
  const applyingExternalMarkdownRef = useRef(false);
  const lastMarkdownRef = useRef(markdown);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  const onSaveShortcutRef = useRef(onSaveShortcut);
  const onSummonProviderRef = useRef(onSummonProvider);
  const loadingRef = useRef(loading);
  const providersRef = useRef(providers);
  const slashCommandItems = useMemo(() => getDocsSlashCommandItems(t, providers), [providers, t]);
  const slashCommandItemsRef = useRef(slashCommandItems);
  const tiptapEditorRef = useRef<TiptapEditor | null>(null);
  const mentionMenuRef = useRef<DocsAgentMentionMenuState | null>(null);
  const slashMenuRef = useRef<DocsSlashCommandMenuState | null>(null);
  const [mentionMenu, setMentionMenuState] = useState<DocsAgentMentionMenuState | null>(null);
  const [slashMenu, setSlashMenuState] = useState<DocsSlashCommandMenuState | null>(null);

  useEffect(() => {
    onMarkdownChangeRef.current = onMarkdownChange;
  }, [onMarkdownChange]);

  useEffect(() => {
    onSaveShortcutRef.current = onSaveShortcut;
  }, [onSaveShortcut]);

  useEffect(() => {
    onSummonProviderRef.current = onSummonProvider;
  }, [onSummonProvider]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);

  useEffect(() => {
    slashCommandItemsRef.current = slashCommandItems;
  }, [slashCommandItems]);

  const setMentionMenu = useCallback((nextMenu: DocsAgentMentionMenuState | null) => {
    mentionMenuRef.current = nextMenu;
    setMentionMenuState(nextMenu);
  }, []);

  const setSlashMenu = useCallback((nextMenu: DocsSlashCommandMenuState | null) => {
    slashMenuRef.current = nextMenu;
    setSlashMenuState(nextMenu);
  }, []);

  const syncEditorMarkdown = useCallback((nextEditor: TiptapEditor) => {
    const nextMarkdown = normalizeEditorMarkdown(editorHtmlToMarkdown(nextEditor.getHTML()));
    if (nextMarkdown === lastMarkdownRef.current) return;

    lastMarkdownRef.current = nextMarkdown;
    onMarkdownChangeRef.current(nextMarkdown);
  }, []);

  const refreshInlineMenus = useCallback(
    (nextEditor: TiptapEditor) => {
      if (loadingRef.current) {
        setMentionMenu(null);
        setSlashMenu(null);
        return;
      }

      const mentionMatch = getDocsAgentMentionMatch(nextEditor);
      if (mentionMatch) {
        const items = filterDocsAgentProviders(providersRef.current, mentionMatch.query);
        const selectedIndex = Math.min(mentionMenuRef.current?.selectedIndex ?? 0, Math.max(0, items.length - 1));
        const position = getEditorCoords(nextEditor, mentionMatch.range.from);
        setMentionMenu({
          items,
          left: position.left,
          query: mentionMatch.query,
          range: mentionMatch.range,
          selectedIndex,
          top: position.top
        });
        setSlashMenu(null);
        return;
      }

      const slashMatch = getDocsSlashCommandMatch(nextEditor);
      if (slashMatch) {
        const items = filterDocsSlashCommandItems(slashCommandItemsRef.current, slashMatch.query);
        const selectedIndex = Math.min(slashMenuRef.current?.selectedIndex ?? 0, Math.max(0, items.length - 1));
        const position = getEditorCoords(nextEditor, slashMatch.range.from);
        setSlashMenu({
          items,
          left: position.left,
          query: slashMatch.query,
          range: slashMatch.range,
          selectedIndex,
          top: position.top
        });
        setMentionMenu(null);
        return;
      }

      setMentionMenu(null);
      setSlashMenu(null);
    },
    [setMentionMenu, setSlashMenu]
  );

  const insertAndSummonProvider = useCallback(
    (nextEditor: TiptapEditor, provider: AgentProviderOption, range: { from: number; to: number }) => {
      const inserted = insertDocsAgentMention(nextEditor, provider, range);
      if (!inserted) return false;

      syncEditorMarkdown(nextEditor);
      setMentionMenu(null);
      setSlashMenu(null);
      onSummonProviderRef.current(provider);
      return true;
    },
    [setMentionMenu, setSlashMenu, syncEditorMarkdown]
  );

  const editor = useEditor({
    content: markdownToEditorHtml(markdown),
    editable: !loading,
    editorProps: {
      attributes: {
        "aria-label": t("docs.editorAria"),
        class: "min-h-full cursor-text outline-none"
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          onSaveShortcutRef.current();
          return true;
        }

        const menu = mentionMenuRef.current;
        if (menu) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setMentionMenu({
              ...menu,
              selectedIndex: menu.items.length ? (menu.selectedIndex + 1) % menu.items.length : 0
            });
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setMentionMenu({
              ...menu,
              selectedIndex: menu.items.length ? (menu.selectedIndex - 1 + menu.items.length) % menu.items.length : 0
            });
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setMentionMenu(null);
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            if (!menu.items.length) return false;
            event.preventDefault();
            const currentEditor = tiptapEditorRef.current;
            return currentEditor ? insertAndSummonProvider(currentEditor, menu.items[menu.selectedIndex], menu.range) : false;
          }
          return false;
        }

        const slashCommandMenu = slashMenuRef.current;
        if (!slashCommandMenu) return false;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSlashMenu({
            ...slashCommandMenu,
            selectedIndex: slashCommandMenu.items.length ? (slashCommandMenu.selectedIndex + 1) % slashCommandMenu.items.length : 0
          });
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSlashMenu({
            ...slashCommandMenu,
            selectedIndex: slashCommandMenu.items.length ? (slashCommandMenu.selectedIndex - 1 + slashCommandMenu.items.length) % slashCommandMenu.items.length : 0
          });
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSlashMenu(null);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (!slashCommandMenu.items.length) return false;
          event.preventDefault();
          const currentEditor = tiptapEditorRef.current;
          const item = slashCommandMenu.items[slashCommandMenu.selectedIndex];
          const applied = currentEditor ? item.run(currentEditor, slashCommandMenu.range) : false;
          if (applied && currentEditor) {
            setSlashMenu(null);
            syncEditorMarkdown(currentEditor);
          }
          return applied;
        }
        return false;
      }
    },
    extensions: [
      StarterKit,
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        protocols: ["agent"]
      }),
      Placeholder.configure({
        placeholder: t("docs.editorPlaceholder")
      })
    ],
    onCreate: ({ editor: nextEditor }) => {
      tiptapEditorRef.current = nextEditor;
    },
    onDestroy: () => {
      tiptapEditorRef.current = null;
    },
    onUpdate: ({ editor: nextEditor }) => {
      if (applyingExternalMarkdownRef.current) return;
      syncEditorMarkdown(nextEditor);
      refreshInlineMenus(nextEditor);
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      refreshInlineMenus(nextEditor);
    },
    onBlur: () => {
      window.setTimeout(() => {
        setMentionMenu(null);
        setSlashMenu(null);
      }, 120);
    }
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!loading);
    if (loading) {
      setMentionMenu(null);
      setSlashMenu(null);
    }
  }, [editor, loading, setMentionMenu, setSlashMenu]);

  useEffect(() => {
    if (!editor || markdown === lastMarkdownRef.current) return;

    applyingExternalMarkdownRef.current = true;
    editor.commands.setContent(markdownToEditorHtml(markdown), { emitUpdate: false });
    applyingExternalMarkdownRef.current = false;
    lastMarkdownRef.current = markdown;
    setMentionMenu(null);
    setSlashMenu(null);
  }, [editor, markdown, setMentionMenu, setSlashMenu]);

  const focusEditor = useCallback(() => {
    if (!editor || loading) return;
    editor.commands.focus();
  }, [editor, loading]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background">
      <EditorContent
        className={cn(
          "markdown-stream-panel h-full min-h-0 overflow-auto px-3 py-3 text-[13px]",
          "[&_.ProseMirror]:min-h-full [&_.ProseMirror]:pb-8 [&_.ProseMirror]:outline-none",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
        )}
        editor={editor}
        onClickCapture={(event) => {
          const link = event.target instanceof Element
            ? event.target.closest<HTMLAnchorElement>('a[href^="agent://"]')
            : null;
          if (!link) return;
          event.preventDefault();
          event.stopPropagation();
          const provider = getProviderFromAgentHref(link.getAttribute("href"), providersRef.current);
          if (provider) onSummonProviderRef.current(provider);
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) focusEditor();
        }}
      />
      {mentionMenu ? (
        <div
          aria-label={t("docs.agentMentionAria")}
          className="fixed z-[100] max-h-[240px] w-[260px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          role="listbox"
          style={{ left: mentionMenu.left, top: mentionMenu.top }}
        >
          {mentionMenu.items.length ? (
            mentionMenu.items.map((provider, index) => (
              <button
                aria-selected={index === mentionMenu.selectedIndex}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]",
                  index === mentionMenu.selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                key={provider.id}
                onMouseEnter={() => {
                  const currentMenu = mentionMenuRef.current;
                  if (currentMenu) setMentionMenu({ ...currentMenu, selectedIndex: index });
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (editor) insertAndSummonProvider(editor, provider, mentionMenu.range);
                }}
                role="option"
                type="button"
              >
                {provider.logoDataUrl ? <img alt="" className="h-4 w-4 shrink-0 rounded-[4px]" src={provider.logoDataUrl} /> : <Bot className="h-4 w-4 shrink-0 text-primary" />}
                <span className="min-w-0 flex-1 truncate font-medium">{provider.label}</span>
              </button>
            ))
          ) : (
            <div className="px-2 py-2 text-[12px] text-muted-foreground">{t("docs.noMatchingAgents")}</div>
          )}
        </div>
      ) : null}
      {slashMenu ? (
        <div
          aria-label={t("docs.slashCommandAria")}
          className="fixed z-[100] max-h-[240px] w-[240px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          role="listbox"
          style={{ left: slashMenu.left, top: slashMenu.top }}
        >
          {slashMenu.items.length ? (
            slashMenu.items.map((item, index) => (
              <button
                aria-selected={index === slashMenu.selectedIndex}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]",
                  index === slashMenu.selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                key={item.id}
                onMouseEnter={() => {
                  const currentMenu = slashMenuRef.current;
                  if (currentMenu) setSlashMenu({ ...currentMenu, selectedIndex: index });
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!editor) return;
                  const applied = item.run(editor, slashMenu.range);
                  if (applied) {
                    setSlashMenu(null);
                    syncEditorMarkdown(editor);
                  }
                }}
                role="option"
                type="button"
              >
                {item.provider?.logoDataUrl ? (
                  <img alt="" className="h-5 w-5 shrink-0 rounded-[4px]" src={item.provider.logoDataUrl} />
                ) : item.provider ? (
                  <Bot className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border bg-card text-[11px] text-muted-foreground">
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
              </button>
            ))
          ) : (
            <div className="px-2 py-2 text-[12px] text-muted-foreground">{t("docs.noMatchingSlashCommands")}</div>
          )}
        </div>
      ) : null}
      {loading || !editor ? (
        <div className="absolute inset-0 grid place-items-center bg-card text-[12px] text-muted-foreground">
          <div>
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            <div>{t("docs.loading")}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DocsAgentStatusPill({
  onOpenThread,
  onResolveApproval,
  provider,
  runState
}: {
  onOpenThread?: () => void;
  onResolveApproval: (decision: ChatAgentApprovalDecision) => void;
  provider: AgentProviderOption;
  runState: DocsRunState;
}) {
  const { t } = useI18n();
  const status = getRunStatusLabel(t, runState.status);
  const StatusIcon = getRunStatusIcon(runState.status);
  const running = runState.status === "running" || runState.status === "starting";

  return (
    <div
      className={cn(
        "flex min-h-7 max-w-[320px] shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px]",
        runState.status !== "idle" && "border-primary/30 bg-primary/5",
        runState.status === "failed" && "border-destructive/30 bg-destructive/5"
      )}
    >
      {provider.logoDataUrl ? <img alt="" className="h-4 w-4 shrink-0 rounded-[4px]" src={provider.logoDataUrl} /> : <Bot className="h-4 w-4 shrink-0 text-primary" />}
      <span className="min-w-0 truncate font-medium text-foreground">{provider.label}</span>
      <StatusIcon className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", running && "animate-spin", runState.status === "failed" && "text-destructive")} />
      <span className="min-w-[56px] truncate text-muted-foreground">{runState.error || status}</span>
      {onOpenThread ? (
        <button className="shrink-0 text-primary hover:underline" onClick={onOpenThread} type="button">
          {t("docs.openThread")}
        </button>
      ) : null}
      {runState.status === "approval" && runState.approvalId ? (
        <div className="flex shrink-0 gap-1">
          <Button onClick={() => onResolveApproval("allow")} size="sm" type="button" variant="secondary">{t("agent.allow")}</Button>
          <Button onClick={() => onResolveApproval("allow-session")} size="sm" type="button" variant="secondary">{t("agent.allowSession")}</Button>
          <Button onClick={() => onResolveApproval("deny")} size="sm" type="button" variant="ghost">{t("agent.deny")}</Button>
        </div>
      ) : null}
    </div>
  );
}

function DocsEmptyState({
  action,
  icon: Icon,
  text,
  title
}: {
  action?: ReactNode;
  icon: LucideIcon;
  text: string;
  title: string;
}) {
  return (
    <div className="grid h-full min-h-[260px] place-items-center bg-card p-4 text-center">
      <div className="max-w-[260px]">
        <Icon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{text}</div>
        {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

async function loadDocumentFile(
  filesApi: NonNullable<Window["agentConsole"]>["files"],
  filePath: string,
  options: {
    cwd?: string;
    setActivePath: (path: string) => void;
    setDocumentContent: (content: string) => void;
    setError: (error: string | null) => void;
    setLoading: (loading: boolean) => void;
    setSavedContent: (content: string) => void;
    toast: ReturnType<typeof useToast>;
    title: string;
  }
) {
  options.setLoading(true);
  options.setError(null);
  try {
    const file = await filesApi.readFile({ cwd: options.cwd, path: filePath });
    activePathFromLoadedFile(file, options);
  } catch (error) {
    const message = formatDocsError(error);
    options.setError(message);
    options.toast.error({ content: message, title: options.title });
  } finally {
    options.setLoading(false);
  }
}

function activePathFromLoadedFile(
  file: WorkspaceTextFile,
  options: {
    setActivePath: (path: string) => void;
    setDocumentContent: (content: string) => void;
    setSavedContent: (content: string) => void;
  }
) {
  options.setActivePath(file.path);
  options.setDocumentContent(file.content);
  options.setSavedContent(file.content);
}

async function discoverMarkdownDocuments(
  filesApi: NonNullable<Window["agentConsole"]>["files"],
  rootPath: string,
  cwd?: string
): Promise<WorkspaceTextFile[]> {
  const documents: WorkspaceTextFile[] = [];
  const seenPaths = new Set<string>();
  const rootDirectory = await safeReadDirectory(filesApi, rootPath, cwd);
  if (!rootDirectory) return documents;

  const enqueueDocument = async (entry: FileTreeEntry) => {
    if (documents.length >= maxDocumentOptions || seenPaths.has(entry.path) || !isMarkdownPath(entry.path)) return;
    seenPaths.add(entry.path);
    try {
      documents.push(await filesApi.readFile({ cwd, path: entry.path }));
    } catch {
      // Ignore unreadable markdown files during discovery; opening them explicitly will show an error.
    }
  };

  for (const entry of rootDirectory.entries) {
    if (entry.kind === "file") await enqueueDocument(entry);
  }

  const docsDirectory = rootDirectory.entries.find((entry) => entry.kind === "directory" && entry.name.toLowerCase() === "docs");
  if (docsDirectory) {
    const queue = [docsDirectory.path];
    const visitedDirectories = new Set<string>();
    while (queue.length && visitedDirectories.size < maxScannedDirectories && documents.length < maxDocumentOptions) {
      const directoryPath = queue.shift();
      if (!directoryPath || visitedDirectories.has(directoryPath)) continue;
      visitedDirectories.add(directoryPath);

      const directory = await safeReadDirectory(filesApi, directoryPath, cwd);
      if (!directory) continue;

      for (const entry of directory.entries) {
        if (entry.kind === "file") {
          await enqueueDocument(entry);
        } else if (entry.kind === "directory" && visitedDirectories.size + queue.length < maxScannedDirectories) {
          queue.push(entry.path);
        }
      }
    }
  }

  return documents.sort((left, right) => left.path.localeCompare(right.path));
}

async function safeReadDirectory(
  filesApi: NonNullable<Window["agentConsole"]>["files"],
  directoryPath: string,
  cwd?: string
): Promise<FileTreeDirectory | null> {
  try {
    return await filesApi.readDirectory({ cwd, path: directoryPath });
  } catch {
    return null;
  }
}

function handleAgentEvent(
  event: ChatAgentRunEvent,
  refs: {
    pendingThreadToProvider: Map<string, string>;
    runDeltaText: Map<string, string>;
    runPartText: Map<string, Map<string, string>>;
    runToProvider: Map<string, string>;
    setRunState: (providerId: string, update: (currentState: DocsRunState) => DocsRunState) => void;
  }
) {
  if (!event?.runId) return;

  if (event.type === "run_started") {
    const providerId = refs.pendingThreadToProvider.get(event.threadId);
    if (!providerId) return;

    refs.pendingThreadToProvider.delete(event.threadId);
    refs.runToProvider.set(event.runId, providerId);
    refs.runDeltaText.set(event.runId, "");
    refs.runPartText.set(event.runId, new Map());
    refs.setRunState(providerId, (currentState) => ({ ...currentState, runId: event.runId, status: "running", threadId: event.threadId }));
    return;
  }

  const providerId = refs.runToProvider.get(event.runId);
  if (!providerId) return;

  if (event.type === "message_delta" && event.data) {
    refs.runDeltaText.set(event.runId, `${refs.runDeltaText.get(event.runId) ?? ""}${event.data}`);
    updateBufferedRunOutput(event.runId, providerId, refs);
    return;
  }

  if (event.type === "message_part" && event.part) {
    const part = normalizeMessagePart(event.part);
    if (!part) return;
    const partText = getMessagePartVisibleText(part);
    const parts = refs.runPartText.get(event.runId) ?? new Map<string, string>();
    parts.set(part.id, partText);
    refs.runPartText.set(event.runId, parts);
    updateBufferedRunOutput(event.runId, providerId, refs);
    return;
  }

  if (event.type === "approval_request" && event.approvalId) {
    refs.setRunState(providerId, (currentState) => ({
      ...currentState,
      approvalId: event.approvalId,
      approvalOptions: event.approvalOptions as ChatAgentApprovalDecision[] | undefined,
      status: "approval"
    }));
    return;
  }

  if (event.type === "question_request") {
    refs.setRunState(providerId, (currentState) => ({ ...currentState, status: "question" }));
    return;
  }

  if (event.type === "error") {
    refs.setRunState(providerId, (currentState) => ({
      ...currentState,
      error: event.message,
      status: "failed"
    }));
  }
}

function updateBufferedRunOutput(
  runId: string,
  providerId: string,
  refs: {
    runDeltaText: Map<string, string>;
    runPartText: Map<string, Map<string, string>>;
    setRunState: (providerId: string, update: (currentState: DocsRunState) => DocsRunState) => void;
  }
) {
  const parts = refs.runPartText.get(runId);
  const partText = parts && parts.size ? Array.from(parts.values()).filter(Boolean).join("\n\n") : "";
  const output = partText || refs.runDeltaText.get(runId) || "";
  refs.setRunState(providerId, (currentState) => ({ ...currentState, output, status: currentState.status === "approval" ? "approval" : "running" }));
}

function getRunStatusIcon(status: DocsRunStatus) {
  if (status === "completed") return CheckCircle2;
  if (status === "failed") return XCircle;
  if (status === "approval" || status === "question") return AlertTriangle;
  if (status === "running" || status === "starting") return Loader2;
  return Bot;
}

function isDocsRunActiveStatus(status: DocsRunStatus): boolean {
  return status === "approval" || status === "question" || status === "running" || status === "starting";
}

function getRunStatusLabel(t: ReturnType<typeof useI18n>["t"], status: DocsRunStatus): string {
  switch (status) {
    case "approval":
      return t("docs.runApproval");
    case "completed":
      return t("docs.runCompleted");
    case "failed":
      return t("docs.runFailed");
    case "question":
      return t("docs.runQuestion");
    case "running":
      return t("docs.runRunning");
    case "starting":
      return t("docs.runStarting");
    default:
      return t("docs.runIdle");
  }
}

function markdownToEditorHtml(markdown: string): string {
  const protectedMarkdown = protectLiteralAgentOutputTags(markdown);
  const rawHtml = marked.parse(protectedMarkdown) as string;
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ["target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|agent):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    USE_PROFILES: { html: true }
  });
}

function editorHtmlToMarkdown(html: string): string {
  const sanitizedHtml = DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|agent):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    USE_PROFILES: { html: true }
  });
  return htmlToMarkdownService.turndown(sanitizedHtml);
}

function insertDocsAgentMention(editor: TiptapEditor, provider: AgentProviderOption, range: { from: number; to: number }): boolean {
  return editor
    .chain()
    .focus()
    .insertContentAt(
      range,
      [
        {
          type: "text",
          text: `@${provider.id}`,
          marks: [
            {
              type: "link",
              attrs: { href: `agent://${encodeURIComponent(provider.id)}` }
            }
          ]
        },
        { type: "text", text: " " }
      ],
      { updateSelection: true }
    )
    .run();
}

function insertDocsTask(editor: TiptapEditor, range: { from: number; to: number }, paragraphContent: JSONContent[]): boolean {
  return editor
    .chain()
    .focus()
    .insertContentAt(
      range,
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: paragraphContent
              }
            ]
          }
        ]
      },
      { updateSelection: true }
    )
    .run();
}

function getDocsAgentTaskContent(provider: AgentProviderOption): JSONContent[] {
  return [
    { type: "text", text: "[ ] " },
    {
      type: "text",
      text: `@${provider.id}`,
      marks: [
        {
          type: "link",
          attrs: { href: `agent://${encodeURIComponent(provider.id)}` }
        }
      ]
    },
    { type: "text", text: " " }
  ];
}

function getDocsSlashCommandItems(t: ReturnType<typeof useI18n>["t"], providers: AgentProviderOption[]): DocsSlashCommandItem[] {
  const baseItems: DocsSlashCommandItem[] = [
    {
      icon: "T",
      id: "paragraph",
      keywords: ["paragraph", "text", "body", "p", "正文", "文本"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
      title: t("docs.commandParagraph")
    },
    {
      icon: "H1",
      id: "heading-1",
      keywords: ["heading", "title", "h1", "标题", "一级标题"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
      title: t("docs.commandHeading1")
    },
    {
      icon: "H2",
      id: "heading-2",
      keywords: ["heading", "title", "h2", "标题", "二级标题"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
      title: t("docs.commandHeading2")
    },
    {
      icon: "H3",
      id: "heading-3",
      keywords: ["heading", "title", "h3", "标题", "三级标题"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
      title: t("docs.commandHeading3")
    },
    {
      icon: "-",
      id: "bullet-list",
      keywords: ["bullet", "list", "ul", "项目", "列表"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
      title: t("docs.commandBulletList")
    },
    {
      icon: "1.",
      id: "ordered-list",
      keywords: ["ordered", "number", "list", "ol", "编号", "列表"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
      title: t("docs.commandOrderedList")
    },
    {
      icon: ">",
      id: "blockquote",
      keywords: ["quote", "blockquote", "引用"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
      title: t("docs.commandQuote")
    },
    {
      icon: "{}",
      id: "code-block",
      keywords: ["code", "block", "代码"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
      title: t("docs.commandCodeBlock")
    },
    {
      icon: "---",
      id: "divider",
      keywords: ["divider", "rule", "hr", "line", "分割线"],
      run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
      title: t("docs.commandDivider")
    },
    {
      icon: "[]",
      id: "task",
      keywords: ["task", "todo", "checkbox", "任务", "待办"],
      run: (editor, range) => insertDocsTask(editor, range, [{ type: "text", text: "[ ] " }]),
      title: t("docs.commandTask")
    }
  ];

  const providerItems = providers
    .filter((provider) => provider.enabled)
    .slice(0, 12)
    .map((provider): DocsSlashCommandItem => ({
      icon: "@",
      id: `agent-task-${provider.id}`,
      keywords: ["agent", "task", "mention", provider.id, provider.label, provider.kind, provider.description],
      provider,
      run: (editor, range) => insertDocsTask(editor, range, getDocsAgentTaskContent(provider)),
      title: t("docs.commandAgentTask", { agent: provider.label })
    }));

  return [...baseItems, ...providerItems];
}

function getDocsSlashCommandMatch(editor: TiptapEditor): { query: string; range: { from: number; to: number } } | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === "codeBlock") return null;

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
  const match = textBeforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) return null;

  const query = match[1].toLowerCase();
  return {
    query,
    range: {
      from: selection.from - query.length - 1,
      to: selection.from
    }
  };
}

function getDocsAgentMentionMatch(editor: TiptapEditor): { query: string; range: { from: number; to: number } } | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === "codeBlock") return null;

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
  const match = textBeforeCursor.match(/(^|[\s([{:])@([A-Za-z0-9_-]*)$/);
  if (!match) return null;

  const query = match[2].toLowerCase();
  return {
    query,
    range: {
      from: selection.from - query.length - 1,
      to: selection.from
    }
  };
}

function filterDocsSlashCommandItems(items: DocsSlashCommandItem[], query: string): DocsSlashCommandItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;

  return items.filter((item) => {
    const searchable = [item.id, item.title, ...item.keywords].join(" ").toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

function getEditorCoords(editor: TiptapEditor, position: number): { left: number; top: number } {
  try {
    const rect = editor.view.coordsAtPos(position);
    const width = 260;
    const height = 240;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8));
    return { left, top };
  } catch {
    return { left: 16, top: 80 };
  }
}

function filterDocsAgentProviders(providers: AgentProviderOption[], query: string): AgentProviderOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const enabledProviders = providers.filter((provider) => provider.enabled);
  if (!normalizedQuery) return enabledProviders.slice(0, 8);

  return enabledProviders
    .filter((provider) => {
      const searchable = [
        provider.id,
        provider.label,
        provider.kind,
        provider.description,
        ...provider.models.map((model) => `${model.label} ${model.value}`)
      ].join(" ").toLowerCase();
      return searchable.includes(normalizedQuery);
    })
    .slice(0, 8);
}

function getProviderFromAgentHref(href: string | null, providers: AgentProviderOption[]): AgentProviderOption | null {
  if (!href?.startsWith("agent://")) return null;
  const rawAgentId = href.slice("agent://".length).replace(/^@/, "");
  const agentId = safeDecodeURIComponent(rawAgentId);
  return providers.find((provider) => provider.id === agentId) ?? null;
}

function createHtmlToMarkdownService(): TurndownService {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
    hr: "---",
    strongDelimiter: "**"
  });

  service.addRule("strikethrough", {
    filter: (node) => node.nodeName === "S" || node.nodeName === "DEL" || node.nodeName === "STRIKE",
    replacement: (content) => content ? `~~${content}~~` : ""
  });

  service.addRule("taskListItems", {
    filter: (node) => {
      if (node.nodeName !== "LI") return false;
      return Boolean(node.querySelector?.("input[type='checkbox']"));
    },
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const checked = element.querySelector<HTMLInputElement>("input[type='checkbox']")?.checked;
      const text = content.replace(/^\s+|\s+$/g, "").replace(/\n+/g, "\n  ");
      return `- [${checked ? "x" : " "}] ${text}\n`;
    }
  });

  return service;
}

function protectLiteralAgentOutputTags(markdown: string): string {
  return markdown.replace(/<\/?[A-Za-z0-9_-]+:(?:start|end)\s*>/g, (tag) => escapeHtml(tag));
}

function normalizeEditorMarkdown(markdown: string): string {
  return markdown
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function createDocsAgentPrompt({
  documentPath,
  markdown,
  provider
}: {
  documentPath: string;
  markdown: string;
  provider: AgentProviderOption;
}): string {
  const blockId = normalizeAgentBlockId(provider.id);
  return [
    "You are collaborating with a user inside a Markdown document from the docs sidebar.",
    `Provider: ${provider.label} (${provider.id})`,
    `Document path: ${documentPath}`,
    `Your output block: <${blockId}:start> ... </${blockId}:end>`,
    "",
    "Use the entire Markdown document as the full PRD and project background, not only the paragraph or task that mentioned you.",
    "Stay aligned with the product goals, non-goals, requirements, acceptance criteria, and change requests in the document.",
    "Focus on the role, task, or @mention assigned to this provider. If no role is explicit, act as the PRD implementation orchestrator.",
    "Track collaboration with other agents when relevant: mention upstream dependencies, downstream workstreams affected by your output, and any contract/schema/API/design changes that must be communicated.",
    "When your output changes a dependency that another agent may depend on, add an explicit handoff notice with recipient agent or role, changed artifact, impact, and required action.",
    "If the PRD is not implementation-ready, ask concrete clarification questions instead of inventing missing product, data, permission, or acceptance rules.",
    "Map your contribution to requirement IDs or acceptance criteria IDs when those IDs exist.",
    "Return only the Markdown contribution that should be written into your output block.",
    "Do not rewrite the full document. Be concise, concrete, and preserve useful headings or lists.",
    "Do not include the output block tags; the app will write those tags around your response.",
    "",
    "Current Markdown document:",
    "```markdown",
    markdown,
    "```"
  ].filter(Boolean).join("\n");
}

function parseFrontmatterAgentValue(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const rawAgents = trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1).split(",")
    : [trimmed];
  return rawAgents
    .map((agent) => agent.trim().replace(/^["']|["']$/g, ""))
    .filter((agent) => /^[A-Za-z0-9][\w-]*$/.test(agent));
}

function extractReferencedAgents(markdown: string): ReferencedAgent[] {
  const maskedMarkdown = maskFencedCodeBlocks(markdown);
  const agents: ReferencedAgent[] = [];
  const frontmatter = maskedMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatter) {
    const inlineAgents = frontmatter[1].match(/^agents:\s*(.+)$/m);
    if (inlineAgents?.[1]) {
      parseFrontmatterAgentValue(inlineAgents[1]).forEach((id) => {
        agents.push({ id, source: "frontmatter" });
      });
    }
    const agentList = frontmatter[1].match(/^agents:\s*\r?\n([\s\S]*?)(?:\n[A-Za-z0-9_-]+:\s*|\s*$)/m);
    const rawAgents = agentList?.[1] ?? "";
    for (const item of rawAgents.matchAll(/^\s*-\s+([A-Za-z0-9][\w-]*)\s*$/gm)) {
      agents.push({ id: item[1], source: "frontmatter" });
    }
  }

  const looseInlineAgents = maskedMarkdown.match(/^agents:\s*(.+)$/m);
  if (looseInlineAgents?.[1]) {
    parseFrontmatterAgentValue(looseInlineAgents[1]).forEach((id) => {
      agents.push({ id, source: "frontmatter" });
    });
  }

  const looseAgentList = maskedMarkdown.match(/^agents:\s*\r?\n([\s\S]*?)(?=\n[A-Za-z0-9_-]+:\s*|\n#{1,6}\s|\n---|\n\* \* \*|$)/m);
  const rawLooseAgents = looseAgentList?.[1] ?? "";
  for (const item of rawLooseAgents.matchAll(/^\s*[-*]\s+([A-Za-z0-9][\w-]*)\s*$/gm)) {
    agents.push({ id: item[1], source: "frontmatter" });
  }

  for (const match of maskedMarkdown.matchAll(agentLinkPattern)) {
    agents.push({ id: safeDecodeURIComponent(match[2]), source: "link" });
  }
  for (const match of maskedMarkdown.matchAll(mentionPattern)) {
    agents.push({ id: match[2], source: "mention" });
  }

  const seen = new Set<string>();
  return agents.filter((agent) => {
    if (seen.has(agent.id)) return false;
    seen.add(agent.id);
    return true;
  });
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractAgentOutputs(markdown: string): Array<{ agentId: string; body: string; end: number; start: number }> {
  return [
    ...extractAgentOutputsByPattern(markdown, outputPattern),
    ...extractAgentOutputsByPattern(markdown, legacyOutputPattern)
  ].sort((left, right) => left.start - right.start);
}

function extractAgentOutputsByPattern(markdown: string, pattern: RegExp): Array<{ agentId: string; body: string; end: number; start: number }> {
  return Array.from(markdown.matchAll(pattern), (match) => ({
    agentId: match[1],
    body: match[2].trim(),
    end: match.index + match[0].length,
    start: match.index
  }));
}

function insertOrReplaceAgentOutput(markdown: string, agentId: string, output: string): string {
  const block = [`<${agentId}:start>`, output.trimEnd(), `</${agentId}:end>`].join("\n");
  const existing = findAgentOutputBlock(markdown, agentId);
  if (existing) {
    return `${markdown.slice(0, existing.start)}${block}${markdown.slice(existing.end)}`;
  }
  return `${markdown.trimEnd()}\n\n${block}\n`;
}

function findAgentOutputBlock(markdown: string, agentId: string): { end: number; start: number } | null {
  const escapedAgentId = escapeRegExp(agentId);
  const patterns = [
    new RegExp(`<${escapedAgentId}:start\\s*>([\\s\\S]*?)<\\/${escapedAgentId}:end\\s*>`, "g"),
    new RegExp(`<!--\\s*agent-output:start\\s+${escapedAgentId}\\s*-->([\\s\\S]*?)<!--\\s*agent-output:end\\s+${escapedAgentId}\\s*-->`, "g")
  ];
  const fencedCodeRanges = collectFencedCodeRanges(markdown);

  for (const pattern of patterns) {
    const match = pattern.exec(markdown);
    if (match && !isInsideRanges(match.index, fencedCodeRanges)) {
      return { end: match.index + match[0].length, start: match.index };
    }
  }
  return null;
}

function maskFencedCodeBlocks(markdown: string): string {
  return markdown.replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g, (match) => match.replace(/[^\n]/g, " "));
}

function collectFencedCodeRanges(markdown: string): Array<{ end: number; start: number }> {
  return Array.from(markdown.matchAll(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g), (match) => ({
    end: match.index + match[0].length,
    start: match.index
  }));
}

function isInsideRanges(index: number, ranges: Array<{ end: number; start: number }>): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function normalizeAgentBlockId(providerId: string): string {
  const normalized = providerId.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  if (/^[A-Za-z0-9]/.test(normalized)) return normalized;
  return `agent-${normalized || "output"}`;
}

function isMarkdownPath(filePath: string): boolean {
  const name = getPathBaseName(filePath).toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  return markdownExtensions.has(extension);
}

function upsertDocumentOption(documents: WorkspaceTextFile[], file: WorkspaceTextFile): WorkspaceTextFile[] {
  const existingIndex = documents.findIndex((document) => document.path === file.path);
  if (existingIndex >= 0) {
    const nextDocuments = [...documents];
    nextDocuments[existingIndex] = file;
    return nextDocuments.sort((left, right) => left.path.localeCompare(right.path));
  }
  return [...documents, file].sort((left, right) => left.path.localeCompare(right.path));
}

function formatDocumentOption(document: WorkspaceTextFile, rootPath: string): string {
  if (!rootPath) return document.name;
  const relative = document.path.startsWith(rootPath) ? document.path.slice(rootPath.length).replace(/^[/\\]+/, "") : document.path;
  return relative || document.name;
}

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/");
}

function getPathBaseName(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? value;
}

function formatDocsError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error || "Docs error.");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
