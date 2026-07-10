import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  Loader2,
  MoreVertical,
  Pencil,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings,
  Star,
  Tag,
  Trash2,
  Upload,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import "monaco-editor/min/vs/editor/editor.main.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { getIntlLocale, useI18n, type TFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { configureMonacoLanguageServices, createMonacoDiffUri, loadMonacoLanguageContributions } from "../../../../../shared/monaco-language-services";
import type { RightSidebarPluginPanelProps } from "../../right-sidebar-plugins";
import { setupMonacoEnvironment } from "../shared/monaco-environment";

type GitPanelTab = "commit" | "shelf";
type GitDiffMode = "inline" | "split";
type GitDiffTarget = { kind: "changes" } | { commitHash: string; kind: "commit"; path: string };
type MonacoModule = typeof import("monaco-editor/esm/vs/editor/editor.api.js");
type MonacoCodeEditor = ReturnType<MonacoModule["editor"]["create"]>;

type GitChangedFile = {
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

type GitCommit = {
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

type GitCommitChangedFile = {
  directory: string;
  kind: GitChangedFile["kind"];
  name: string;
  oldPath: string | null;
  path: string;
  status: string;
  statusText: string;
};

type GitCommitDetails = {
  branches: string[];
  files: GitCommitChangedFile[];
  hash: string;
  tags: string[];
};

type GitBranchItem = {
  current: boolean;
  name: string;
  shortHash: string;
  type: "local" | "remote";
  upstream: string | null;
};

type GitShelf = {
  date: string;
  hash: string;
  message: string;
  name: string;
};

type GitFileDiff = {
  language: string;
  modified: string;
  modifiedPath: string;
  original: string;
  originalPath: string;
};

type GitState = {
  branch: {
    ahead: number;
    behind: number;
    current: string;
    detached: boolean;
    upstream: string | null;
  };
  branches: GitBranchItem[];
  commits: GitCommit[];
  files: GitChangedFile[];
  remotes: string[];
  root: string;
  shelves: GitShelf[];
};

type GitLogDateFilter = "all" | "month" | "today" | "week";

type GitLogFilters = {
  author: string | null;
  branch: string | null;
  date: GitLogDateFilter;
  path: string | null;
};

type GitResetMode = "hard" | "keep" | "mixed" | "soft";
type GitAutosquashMode = "fixup" | "squash";

type GitInputDialogOption = {
  description?: string;
  label: string;
  value: string;
};

type GitInputDialogState = {
  confirmLabel: string;
  description?: string;
  initialValue: string;
  kind: "options" | "text" | "textarea";
  onConfirm: (value: string) => void;
  options?: GitInputDialogOption[];
  placeholder?: string;
  title: string;
};

type GitPreviewDialogState = {
  content: string;
  title: string;
};

type GitPatchResult = {
  canceled: boolean;
  filePath: string | null;
};

type GitFilesystemPathResult = {
  path: string;
};

type GitBrowserUrlResult = {
  url: string;
};

type GitInteractiveRebasePlan = {
  commitHash: string;
  todo: string;
};

type GitCommitContextActions = {
  cherryPick(commit: GitCommit): void;
  checkoutRevision(commit: GitCommit): void;
  compareWithLocal(commit: GitCommit): void;
  copyRevision(commit: GitCommit): void;
  createAutosquashCommit(commit: GitCommit, mode: GitAutosquashMode): void;
  createBranch(commit: GitCommit): void;
  createPatch(commit: GitCommit): void;
  createTag(commit: GitCommit): void;
  dropCommit(commit: GitCommit): void;
  editCommitMessage(commit: GitCommit): void;
  interactiveRebase(commit: GitCommit): void;
  pushUpToCommit(commit: GitCommit): void;
  resetCurrentBranch(commit: GitCommit): void;
  revertCommit(commit: GitCommit): void;
  showRepositoryAtRevision(commit: GitCommit): void;
  undoCommit(commit: GitCommit): void;
  viewInBrowser(commit: GitCommit): void;
};

const emptyGitState: GitState = {
  branch: { ahead: 0, behind: 0, current: "HEAD", detached: false, upstream: null },
  branches: [],
  commits: [],
  files: [],
  remotes: [],
  root: "",
  shelves: []
};

type GitLogFilterOption = {
  label: string;
  value: string | null;
};

type GitLogFilterOptions = {
  authors: GitLogFilterOption[];
  branches: GitLogFilterOption[];
  paths: GitLogFilterOption[];
};

function getDateFilterOptions(t: TFunction): GitLogFilterOption[] {
  return [
    { label: t("git.allDates"), value: "all" },
    { label: t("git.today"), value: "today" },
    { label: t("git.last7Days"), value: "week" },
    { label: t("git.last30Days"), value: "month" }
  ];
}

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

export function GitPanel({ agentContext }: RightSidebarPluginPanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const gitApi = window.agentConsole?.git;
  const workspaceCwd = agentContext?.project?.path || undefined;
  const bodyRef = useRef<HTMLDivElement>(null);
  const commitPaneRef = useRef<HTMLDivElement>(null);
  const knownPathsRef = useRef<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<GitPanelTab>("commit");
  const [busy, setBusy] = useState<string | null>(null);
  const [changeDiff, setChangeDiff] = useState<GitFileDiff | null>(null);
  const [changeDiffError, setChangeDiffError] = useState<string | null>(null);
  const [commitDetails, setCommitDetails] = useState<GitCommitDetails | null>(null);
  const [commitDetailsError, setCommitDetailsError] = useState<string | null>(null);
  const [commitFileDiff, setCommitFileDiff] = useState<GitFileDiff | null>(null);
  const [commitFileDiffError, setCommitFileDiffError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [diffMode, setDiffMode] = useState<GitDiffMode>("split");
  const [activeDiffTarget, setActiveDiffTarget] = useState<GitDiffTarget>({ kind: "changes" });
  const [filter, setFilter] = useState("");
  const [gitGroupExpanded, setGitGroupExpanded] = useState<Record<"changes" | "unversioned", boolean>>({ changes: true, unversioned: true });
  const [inputDialog, setInputDialog] = useState<GitInputDialogState | null>(null);
  const [changesPaneWidth, setChangesPaneWidth] = useState(360);
  const [logCommits, setLogCommits] = useState<GitCommit[]>([]);
  const [logFilters, setLogFilters] = useState<GitLogFilters>({ author: null, branch: null, date: "all", path: null });
  const [logFilter, setLogFilter] = useState("");
  const [previewDialog, setPreviewDialog] = useState<GitPreviewDialogState | null>(null);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [selectedCommitPath, setSelectedCommitPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [commitAmend, setCommitAmend] = useState(false);
  const [commitOptionsOpen, setCommitOptionsOpen] = useState(false);
  const [shelfMessage, setShelfMessage] = useState("");
  const [state, setState] = useState<GitState>(emptyGitState);
  const [topPanePercent, setTopPanePercent] = useState(52);
  const [topGitMenuOpen, setTopGitMenuOpen] = useState(false);

  const showGitNotice = useCallback(
    (content: string) => {
      toast.success({ content, title: "Git" });
    },
    [toast]
  );

  const showGitError = useCallback(
    (nextError: unknown) => {
      toast.error({ content: formatGitError(nextError), title: t("git.errorTitle") });
    },
    [t, toast]
  );

  const syncGitWorkspace = useCallback(async () => {
    await window.agentConsole?.workspace?.setActiveProject({ projectPath: workspaceCwd }).catch((error) => {
      console.warn("[git] Failed to set active workspace.", error);
    });
  }, [workspaceCwd]);

  const refresh = useCallback(async () => {
    if (!gitApi) return;
    setBusy("refresh");
    try {
      await syncGitWorkspace();
      const nextState = await gitApi.getState();
      setState(nextState);
      setLogCommits(nextState.commits);
    } catch (nextError) {
      showGitError(nextError);
    } finally {
      setBusy(null);
    }
  }, [gitApi, showGitError, syncGitWorkspace]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    knownPathsRef.current = new Set();
    setActiveDiffTarget({ kind: "changes" });
    setChangeDiff(null);
    setChangeDiffError(null);
    setCommitDetails(null);
    setCommitDetailsError(null);
    setCommitFileDiff(null);
    setCommitFileDiffError(null);
    setLogCommits([]);
    setSelectedCommitHash(null);
    setSelectedCommitPath(null);
    setSelectedPath(null);
    setSelectedPaths(new Set());
    setState(emptyGitState);
  }, [workspaceCwd]);

  useEffect(() => {
    if (!commitOptionsOpen && !topGitMenuOpen) return;
    const closeMenus = () => {
      setCommitOptionsOpen(false);
      setTopGitMenuOpen(false);
    };
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, [commitOptionsOpen, topGitMenuOpen]);

  const fileKey = useMemo(() => state.files.map((file) => file.path).join("\0"), [state.files]);

  useEffect(() => {
    const currentPaths = new Set(state.files.map((file) => file.path));
    const previousKnownPaths = knownPathsRef.current;

    setSelectedPaths((previousSelectedPaths) => {
      const nextSelectedPaths = new Set<string>();
      for (const path of previousSelectedPaths) {
        if (currentPaths.has(path)) {
          nextSelectedPaths.add(path);
        }
      }
      for (const path of currentPaths) {
        if (!previousKnownPaths.has(path)) {
          nextSelectedPaths.add(path);
        }
      }
      return nextSelectedPaths;
    });

    knownPathsRef.current = currentPaths;
  }, [fileKey, state.files]);

  useEffect(() => {
    if (selectedPath && state.files.some((file) => file.path === selectedPath)) return;
    setSelectedPath(state.files[0]?.path ?? null);
  }, [selectedPath, state.files]);

  const selectedFile = useMemo(() => state.files.find((file) => file.path === selectedPath) ?? null, [selectedPath, state.files]);
  const selectedCommit = useMemo(() => logCommits.find((commit) => commit.hash === selectedCommitHash) ?? null, [logCommits, selectedCommitHash]);
  const commitFiles = useMemo(() => {
    if (commitDetails?.hash === selectedCommitHash && commitDetails.files.length) {
      return commitDetails.files;
    }
    return (selectedCommit?.paths ?? []).map(createCommitFileFromPath);
  }, [commitDetails, selectedCommit, selectedCommitHash]);
  const commitFilePathKey = useMemo(() => commitFiles.map((file) => file.path).join("\0"), [commitFiles]);
  const selectedCommitFile = useMemo(() => commitFiles.find((file) => file.path === selectedCommitPath) ?? null, [commitFiles, selectedCommitPath]);
  const showingCommitDiff = activeDiffTarget.kind === "commit";
  const topDiff = showingCommitDiff ? commitFileDiff : changeDiff;
  const topDiffEmptyText = showingCommitDiff ? commitFileDiffError ?? t("git.commitDiffEmpty") : changeDiffError ?? t("git.noLocalDiff");
  const topDiffTitle = showingCommitDiff ? activeDiffTarget.path : selectedFile ? selectedFile.path : t("git.diff");
  const topDiffBadge = showingCommitDiff ? selectedCommit?.shortHash ?? activeDiffTarget.commitHash.slice(0, 7) : state.branch.current;

  useEffect(() => {
    if (!gitApi || !selectedFile) {
      setChangeDiff(null);
      setChangeDiffError(null);
      return;
    }

    let cancelled = false;
    void gitApi
      .getFileDiff({ oldPath: selectedFile.oldPath, path: selectedFile.path, untracked: selectedFile.untracked })
      .then((diff) => {
        if (!cancelled) {
          setChangeDiff(diff);
          setChangeDiffError(null);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          const message = formatGitError(nextError);
          setChangeDiff(null);
          setChangeDiffError(message);
          showGitError(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gitApi, selectedFile, showGitError]);

  useEffect(() => {
    if (!gitApi || !selectedCommitHash) {
      setCommitDetails(null);
      setCommitDetailsError(null);
      return;
    }

    let cancelled = false;
    setCommitDetails(null);
    setCommitDetailsError(null);
    void gitApi
      .getCommitDetails(selectedCommitHash)
      .then((details) => {
        if (!cancelled) {
          setCommitDetails(details);
          setCommitDetailsError(null);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          const message = formatGitError(nextError);
          setCommitDetails(null);
          setCommitDetailsError(message);
          showGitError(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gitApi, selectedCommitHash, showGitError]);

  useEffect(() => {
    if (!selectedCommitPath || commitFiles.some((file) => file.path === selectedCommitPath)) return;
    setSelectedCommitPath(null);
  }, [commitFilePathKey, commitFiles, selectedCommitPath]);

  useEffect(() => {
    if (activeDiffTarget.kind !== "commit") return;
    if (activeDiffTarget.commitHash === selectedCommitHash && commitFiles.some((file) => file.path === activeDiffTarget.path)) return;
    setActiveDiffTarget({ kind: "changes" });
  }, [activeDiffTarget, commitFilePathKey, commitFiles, selectedCommitHash]);

  useEffect(() => {
    if (!gitApi || !selectedCommitHash || !selectedCommitPath) {
      setCommitFileDiff(null);
      setCommitFileDiffError(null);
      return;
    }

    let cancelled = false;
    setCommitFileDiff(null);
    setCommitFileDiffError(null);
    void gitApi
      .getFileDiff({ commitHash: selectedCommitHash, oldPath: selectedCommitFile?.oldPath, path: selectedCommitPath })
      .then((diff) => {
        if (!cancelled) {
          setCommitFileDiff(diff);
          setCommitFileDiffError(null);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          const message = formatGitError(nextError);
          setCommitFileDiff(null);
          setCommitFileDiffError(message);
          showGitError(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gitApi, selectedCommitFile, selectedCommitHash, selectedCommitPath, showGitError]);

  const logFiltersKey = `${logFilters.branch ?? ""}\0${logFilters.author ?? ""}\0${logFilters.date}\0${logFilters.path ?? ""}`;

  useEffect(() => {
    if (!gitApi) return;

    let cancelled = false;
    setBusy((currentBusy) => currentBusy ?? "log-filter");

    void gitApi
      .getLog(logFilters)
      .then((nextCommits) => {
        if (!cancelled) {
          setLogCommits(nextCommits);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          showGitError(nextError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy((currentBusy) => (currentBusy === "log-filter" ? null : currentBusy));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gitApi, logFiltersKey, showGitError]);

  const trackedFiles = useMemo(() => filterFiles(state.files.filter((file) => !file.untracked), filter), [filter, state.files]);
  const unversionedFiles = useMemo(() => filterFiles(state.files.filter((file) => file.untracked), filter), [filter, state.files]);
  const selectedPathList = useMemo(() => Array.from(selectedPaths), [selectedPaths]);
  const allPathList = useMemo(() => state.files.map((file) => file.path), [state.files]);
  const filteredCommits = useMemo(() => filterCommits(logCommits, logFilter), [logCommits, logFilter]);
  const logFilterOptions = useMemo(() => buildLogFilterOptions(state, logCommits, t), [logCommits, state, t]);

  useEffect(() => {
    if (selectedCommitHash && filteredCommits.some((commit) => commit.hash === selectedCommitHash)) return;
    setSelectedCommitHash(filteredCommits[0]?.hash ?? null);
    setSelectedCommitPath(null);
    setActiveDiffTarget((currentTarget) => (currentTarget.kind === "commit" ? { kind: "changes" } : currentTarget));
  }, [filteredCommits, selectedCommitHash]);

  const selectChangedFile = useCallback((path: string) => {
    setSelectedPath(path);
    setActiveDiffTarget({ kind: "changes" });
  }, []);

  const selectCommit = useCallback(
    (hash: string) => {
      setSelectedCommitHash(hash);
      if (hash === selectedCommitHash) return;
      setSelectedCommitPath(null);
      setActiveDiffTarget((currentTarget) => (currentTarget.kind === "commit" ? { kind: "changes" } : currentTarget));
    },
    [selectedCommitHash]
  );

  const selectCommitPath = useCallback(
    (path: string) => {
      if (!selectedCommitHash) return;
      setSelectedCommitPath(path);
      setActiveDiffTarget({ commitHash: selectedCommitHash, kind: "commit", path });
    },
    [selectedCommitHash]
  );

  const runGitAction = useCallback(
    async (label: string, action: () => Promise<GitState>, after?: () => void) => {
      setBusy(label);
      try {
        await syncGitWorkspace();
        const nextState = await action();
        setState(nextState);
        setLogCommits(nextState.commits);
        after?.();
      } catch (nextError) {
        showGitError(nextError);
        try {
          if (gitApi) {
            await syncGitWorkspace();
            const nextState = await gitApi.getState();
            setState(nextState);
            setLogCommits(nextState.commits);
          }
        } catch {
          // Keep the original Git error visible.
        }
      } finally {
        setBusy(null);
      }
    },
    [gitApi, showGitError, syncGitWorkspace]
  );

  const runGitSideEffect = useCallback(async (label: string, action: () => Promise<unknown>, after?: (result: unknown) => void) => {
    setBusy(label);
    try {
      await syncGitWorkspace();
      const result = await action();
      after?.(result);
    } catch (nextError) {
      showGitError(nextError);
    } finally {
      setBusy(null);
    }
  }, [showGitError, syncGitWorkspace]);

  const togglePath = (path: string) => {
    setSelectedPaths((previousSelectedPaths) => {
      const nextSelectedPaths = new Set(previousSelectedPaths);
      if (nextSelectedPaths.has(path)) {
        nextSelectedPaths.delete(path);
      } else {
        nextSelectedPaths.add(path);
      }
      return nextSelectedPaths;
    });
  };

  const toggleGroup = (files: GitChangedFile[], checked: boolean) => {
    setSelectedPaths((previousSelectedPaths) => {
      const nextSelectedPaths = new Set(previousSelectedPaths);
      for (const file of files) {
        if (checked) {
          nextSelectedPaths.add(file.path);
        } else {
          nextSelectedPaths.delete(file.path);
        }
      }
      return nextSelectedPaths;
    });
  };

  const toggleGitGroup = (group: "changes" | "unversioned") => {
    setGitGroupExpanded((previousState) => ({
      ...previousState,
      [group]: !previousState[group]
    }));
  };

  const setAllGitGroupsExpanded = (expanded: boolean) => {
    setGitGroupExpanded({ changes: expanded, unversioned: expanded });
  };

  const startCommitPaneResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pane = commitPaneRef.current;
    if (!pane) return;

    event.preventDefault();
    const paneRect = pane.getBoundingClientRect();
    const minimumLeftWidth = 260;
    const minimumRightWidth = 360;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = moveEvent.clientX - paneRect.left;
      setChangesPaneWidth(Math.max(minimumLeftWidth, Math.min(nextWidth, paneRect.width - minimumRightWidth)));
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const startTopPaneResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const body = bodyRef.current;
    if (!body) return;

    event.preventDefault();
    const bodyRect = body.getBoundingClientRect();
    const minimumTopHeight = 260;
    const minimumBottomHeight = 260;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = moveEvent.clientY - bodyRect.top;
      const clampedHeight = Math.max(minimumTopHeight, Math.min(nextHeight, bodyRect.height - minimumBottomHeight));
      setTopPanePercent((clampedHeight / bodyRect.height) * 100);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const commitSelected = (push: boolean) => {
    if (!gitApi) return;
    void runGitAction(
      push ? "commit-push" : "commit",
      () => gitApi.commit({ allPaths: allPathList, amend: commitAmend, message: commitMessage, paths: selectedPathList, push }),
      () => {
        setCommitMessage("");
        setCommitAmend(false);
      }
    );
  };

  const previewSelectedChange = () => {
    if (!gitApi || !selectedFile) return;
    void runGitSideEffect("preview-change", () => gitApi.getDiff({ path: selectedFile.path, untracked: selectedFile.untracked }), (result) => {
      setPreviewDialog({
        content: String(result || t("git.noLocalDiff")),
        title: t("git.diffPreviewTitle", { path: selectedFile.path })
      });
    });
  };

  const previewSelectedCommit = () => {
    if (!gitApi || !selectedCommit) return;
    void runGitSideEffect("preview-commit", () => gitApi.getDiff({ commitHash: selectedCommit.hash }), (result) => {
      setPreviewDialog({
        content: String(result || t("git.commitDiffEmpty")),
        title: t("git.commitDiffPreviewTitle", { hash: selectedCommit.shortHash })
      });
    });
  };

  const resetLogView = () => {
    setLogFilter("");
    setLogFilters({ author: null, branch: null, date: "all", path: null });
    setSelectedCommitHash(logCommits[0]?.hash ?? null);
    setSelectedCommitPath(null);
    setActiveDiffTarget((currentTarget) => (currentTarget.kind === "commit" ? { kind: "changes" } : currentTarget));
  };

  const createShelf = () => {
    if (!gitApi) return;
    void runGitAction(
      "shelf",
      () => gitApi.createShelf({ message: shelfMessage, paths: selectedPathList }),
      () => setShelfMessage("")
    );
  };

  const discardSelected = () => {
    if (!gitApi || !selectedPathList.length) return;
    if (!window.confirm(t("git.discardConfirm", { count: selectedPathList.length }))) return;
    void runGitAction("discard", () => gitApi.discard({ paths: selectedPathList }));
  };

  const checkoutBranch = (branchName: string) => {
    if (!gitApi) return;
    if (branchName !== state.branch.current && !window.confirm(t("git.checkoutBranchConfirm", { branch: branchName }))) return;
    void runGitAction("checkout", () => gitApi.checkoutBranch(branchName));
  };

  const pullLatest = (rebase: boolean) => {
    if (!gitApi) return;
    void runGitAction(rebase ? "pull-rebase" : "pull", () => gitApi.pull({ rebase }));
  };

  const mergeBranch = (branchName: string) => {
    if (!gitApi) return;
    if (!window.confirm(t("git.mergeConfirm", { branch: branchName, current: state.branch.current }))) return;
    void runGitAction("merge", () => gitApi.mergeBranch(branchName));
  };

  const rebaseBranch = (branchName: string) => {
    if (!gitApi) return;
    if (!window.confirm(t("git.rebaseOntoConfirm", { branch: branchName, current: state.branch.current }))) return;
    void runGitAction("rebase", () => gitApi.rebaseBranch(branchName));
  };

  const copyRevisionNumber = (commit: GitCommit) => {
    void writeTextToClipboard(commit.hash)
      .then(() => {
        showGitNotice(t("git.copyRevisionNotice", { hash: commit.shortHash }));
      })
      .catch((nextError) => showGitError(nextError));
  };

  const createPatchForCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    void runGitSideEffect("create-patch", () => gitApi.createPatch(commit.hash), (result) => {
      const patchResult = result as GitPatchResult;
      if (!patchResult.canceled && patchResult.filePath) {
        showGitNotice(t("git.createPatchNotice", { path: patchResult.filePath }));
      }
    });
  };

  const cherryPickCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    if (!window.confirm(t("git.cherryPickConfirm", { hash: commit.shortHash }))) return;
    void runGitAction("cherry-pick", () => gitApi.cherryPickCommit(commit.hash), () => showGitNotice(t("git.cherryPickNotice", { hash: commit.shortHash })));
  };

  const checkoutRevision = (commit: GitCommit) => {
    if (!gitApi) return;
    if (!window.confirm(t("git.checkoutRevisionConfirm", { hash: commit.shortHash }))) return;
    void runGitAction("checkout-revision", () => gitApi.checkoutRevision(commit.hash), () => showGitNotice(t("git.checkedOutNotice", { hash: commit.shortHash })));
  };

  const showRepositoryAtRevision = (commit: GitCommit) => {
    if (!gitApi) return;
    void runGitSideEffect("show-revision", () => gitApi.showRepositoryAtRevision(commit.hash), (result) => {
      showGitNotice(t("git.openedRevisionNotice", { path: (result as GitFilesystemPathResult).path }));
    });
  };

  const compareWithLocal = (commit: GitCommit) => {
    if (!gitApi) return;
    void runGitSideEffect("compare-local", () => gitApi.compareWithLocal(commit.hash), (result) => {
      setPreviewDialog({
        content: String(result),
        title: t("git.compareWithLocalTitle", { hash: commit.shortHash })
      });
    });
  };

  const resetCurrentBranchToCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    setInputDialog({
      confirmLabel: t("git.reset"),
      description: t("git.resetCurrentBranchDescription", { branch: state.branch.current, hash: commit.shortHash }),
      initialValue: "mixed",
      kind: "options",
      onConfirm: (mode) => {
        void runGitAction("reset", () => gitApi.resetCurrentBranchToCommit({ commitHash: commit.hash, mode: mode as GitResetMode }), () => {
          showGitNotice(t("git.resetCurrentBranchNotice", { hash: commit.shortHash }));
        });
      },
      options: [
        { description: t("git.softDescription"), label: t("git.soft"), value: "soft" },
        { description: t("git.mixedDescription"), label: t("git.mixed"), value: "mixed" },
        { description: t("git.keepDescription"), label: t("git.keep"), value: "keep" },
        { description: t("git.hardDescription"), label: t("git.hard"), value: "hard" }
      ],
      title: t("git.resetCurrentBranch")
    });
  };

  const revertCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    if (!window.confirm(t("git.revertCommitConfirm", { hash: commit.shortHash }))) return;
    void runGitAction("revert", () => gitApi.revertCommit(commit.hash), () => showGitNotice(t("git.revertedNotice", { hash: commit.shortHash })));
  };

  const undoCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    if (!window.confirm(t("git.undoCommitConfirm", { hash: commit.shortHash }))) return;
    void runGitAction("undo-commit", () => gitApi.undoCommit(commit.hash), () => showGitNotice(t("git.undidNotice", { hash: commit.shortHash })));
  };

  const editCommitMessage = (commit: GitCommit) => {
    if (!gitApi) return;
    setInputDialog({
      confirmLabel: t("git.save"),
      description: t("git.editCommitMessageDescription", { hash: commit.shortHash }),
      initialValue: commit.subject,
      kind: "text",
      onConfirm: (message) => {
        void runGitAction("edit-message", () => gitApi.editCommitMessage({ commitHash: commit.hash, message }), () => {
          showGitNotice(t("git.updatedCommitMessageNotice", { hash: commit.shortHash }));
        });
      },
      placeholder: t("git.commitMessage"),
      title: t("git.editCommitMessage")
    });
  };

  const createAutosquashCommit = (commit: GitCommit, mode: GitAutosquashMode) => {
    if (!gitApi || !selectedPathList.length) return;
    const label = mode === "fixup" ? "fixup" : "squash";
    if (!window.confirm(t("git.createAutosquashConfirm", { count: selectedPathList.length, hash: commit.shortHash, mode: label }))) return;
    void runGitAction(
      `${label}-commit`,
      () => gitApi.createAutosquashCommit({ allPaths: allPathList, commitHash: commit.hash, mode, paths: selectedPathList }),
      () => showGitNotice(mode === "fixup" ? t("git.createFixupNotice", { hash: commit.shortHash }) : t("git.createSquashNotice", { hash: commit.shortHash }))
    );
  };

  const dropCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    if (!window.confirm(t("git.dropCommitConfirm", { hash: commit.shortHash }))) return;
    void runGitAction("drop-commit", () => gitApi.dropCommit(commit.hash), () => showGitNotice(t("git.droppedNotice", { hash: commit.shortHash })));
  };

  const interactiveRebaseFromCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    void runGitSideEffect("rebase-plan", () => gitApi.getInteractiveRebasePlan(commit.hash), (result) => {
      const plan = result as GitInteractiveRebasePlan;
      setInputDialog({
        confirmLabel: t("git.startRebase"),
        description: t("git.interactiveRebaseDescription"),
        initialValue: plan.todo,
        kind: "textarea",
        onConfirm: (todo) => {
          void runGitAction("interactive-rebase", () => gitApi.runInteractiveRebase({ commitHash: commit.hash, todo }), () => {
            showGitNotice(t("git.startedInteractiveRebaseNotice", { hash: commit.shortHash }));
          });
        },
        title: t("git.interactiveRebaseTitle")
      });
    });
  };

  const pushUpToCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    if (!window.confirm(t("git.pushUpToConfirm", { hash: commit.shortHash }))) return;
    void runGitAction("push-up-to", () => gitApi.pushUpToCommit(commit.hash), () => showGitNotice(t("git.pushedUpToNotice", { hash: commit.shortHash })));
  };

  const createBranchAtCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    setInputDialog({
      confirmLabel: t("git.createBranch"),
      description: t("git.createBranchDescription", { hash: commit.shortHash }),
      initialValue: `branch-${commit.shortHash}`,
      kind: "text",
      onConfirm: (name) => {
        void runGitAction("new-branch", () => gitApi.createBranchAtCommit({ commitHash: commit.hash, name }), () => showGitNotice(t("git.createdBranchNotice", { name })));
      },
      placeholder: t("git.branchName"),
      title: t("git.newBranch")
    });
  };

  const createTagAtCommit = (commit: GitCommit) => {
    if (!gitApi) return;
    setInputDialog({
      confirmLabel: t("git.createBranch"),
      description: t("git.createTagDescription", { hash: commit.shortHash }),
      initialValue: `tag-${commit.shortHash}`,
      kind: "text",
      onConfirm: (name) => {
        void runGitAction("new-tag", () => gitApi.createTagAtCommit({ commitHash: commit.hash, name }), () => showGitNotice(t("git.createdTagNotice", { name })));
      },
      placeholder: t("git.tagName"),
      title: t("git.newTag")
    });
  };

  const viewCommitInBrowser = (commit: GitCommit) => {
    if (!gitApi) return;
    void runGitSideEffect("view-browser", () => gitApi.viewCommitInBrowser(commit.hash), (result) => {
      showGitNotice(t("git.openedUrlNotice", { url: (result as GitBrowserUrlResult).url }));
    });
  };

  const commitContextActions = useMemo<GitCommitContextActions>(
    () => ({
      cherryPick: cherryPickCommit,
      checkoutRevision,
      compareWithLocal,
      copyRevision: copyRevisionNumber,
      createAutosquashCommit,
      createBranch: createBranchAtCommit,
      createPatch: createPatchForCommit,
      createTag: createTagAtCommit,
      dropCommit,
      editCommitMessage,
      interactiveRebase: interactiveRebaseFromCommit,
      pushUpToCommit,
      resetCurrentBranch: resetCurrentBranchToCommit,
      revertCommit,
      showRepositoryAtRevision,
      undoCommit,
      viewInBrowser: viewCommitInBrowser
    }),
    [allPathList, gitApi, runGitAction, runGitSideEffect, selectedPathList, state.branch.current, t]
  );

  if (!gitApi) {
    return <div className="bg-white p-3 text-[12px] text-[#656a70]">{t("git.unavailable")}</div>;
  }

  const operationRunning = busy !== null;
  const canCommit = Boolean(commitMessage.trim() && selectedPathList.length);
  const canUseSelection = selectedPathList.length > 0;

  return (
    <div className="flex h-full max-h-full min-h-0 w-full min-w-[860px] flex-col overflow-hidden bg-[#faf9fb] text-[#1f2328]">
      <div className="flex h-9 shrink-0 items-center border-b border-[#e2e3e7] bg-[#f4f1f5] px-2">
        <div className="flex items-center gap-1">
          <GitModeButton active={activeTab === "commit"} label={t("git.commit")} onClick={() => setActiveTab("commit")} />
          <GitModeButton active={activeTab === "shelf"} label={t("git.shelf")} onClick={() => setActiveTab("shelf")} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <GitIconButton icon={RefreshCcw} label={t("git.refresh")} loading={busy === "refresh"} onClick={refresh} />
          <GitIconButton icon={Download} label={t("git.pull")} loading={busy === "pull"} onClick={() => pullLatest(false)} />
          <GitIconButton icon={Upload} label={t("git.push")} loading={busy === "push"} onClick={() => runGitAction("push", gitApi.push)} />
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <GitIconButton icon={MoreVertical} label={t("git.more")} onClick={() => setTopGitMenuOpen((open) => !open)} />
            {topGitMenuOpen ? (
              <GitToolbarMenu>
                <GitToolbarMenuItem disabled={operationRunning} label={t("git.refresh")} onClick={() => { setTopGitMenuOpen(false); void refresh(); }} />
                <GitToolbarMenuItem disabled={operationRunning} label={t("git.fetch")} onClick={() => { setTopGitMenuOpen(false); void runGitAction("fetch", gitApi.fetch); }} />
                <GitToolbarMenuItem disabled={operationRunning} label={t("git.pull")} onClick={() => { setTopGitMenuOpen(false); pullLatest(false); }} />
                <GitToolbarMenuItem disabled={operationRunning} label={t("git.pullRebase")} onClick={() => { setTopGitMenuOpen(false); pullLatest(true); }} />
                <GitToolbarMenuItem disabled={operationRunning} label={t("git.push")} onClick={() => { setTopGitMenuOpen(false); void runGitAction("push", gitApi.push); }} />
              </GitToolbarMenu>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col" ref={bodyRef}>
        <div
          className="grid min-h-0 shrink-0"
          ref={commitPaneRef}
          style={{
            gridTemplateColumns: `${changesPaneWidth}px 5px minmax(0, 1fr)`,
            height: `${topPanePercent}%`
          }}
        >
          <div className="flex min-h-0 flex-col bg-[#fbfafc]">
            <GitCommitToolbar
              busy={operationRunning}
              canUseSelection={canUseSelection}
              onDiscard={discardSelected}
              onCollapseGroups={() => setAllGitGroupsExpanded(false)}
              onExpandGroups={() => setAllGitGroupsExpanded(true)}
              onFetch={() => runGitAction("fetch", gitApi.fetch)}
              onPreview={previewSelectedChange}
              onRefresh={refresh}
              onStage={() => runGitAction("stage", () => gitApi.stage({ paths: selectedPathList }))}
              onUnstage={() => runGitAction("unstage", () => gitApi.unstage({ paths: selectedPathList }))}
              canPreview={Boolean(selectedFile)}
            />

            {activeTab === "commit" ? (
              <>
                <div className="border-b border-[#ececf0] px-2 py-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-[#8a9099]" />
                    <Input className="h-7 bg-white pl-7 text-[11px]" onChange={(event) => setFilter(event.target.value)} placeholder={t("git.searchChanges")} value={filter} />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto py-1">
                  <GitFileGroup
                    checkedPaths={selectedPaths}
                    expanded={gitGroupExpanded.changes}
                    files={trackedFiles}
                    label={t("git.changes")}
                    onSelectFile={selectChangedFile}
                    onToggleExpanded={() => toggleGitGroup("changes")}
                    onToggleGroup={toggleGroup}
                    onTogglePath={togglePath}
                    selectedPath={selectedPath}
                  />
                  <GitFileGroup
                    checkedPaths={selectedPaths}
                    expanded={gitGroupExpanded.unversioned}
                    files={unversionedFiles}
                    label={t("git.unversionedFiles")}
                    onSelectFile={selectChangedFile}
                    onToggleExpanded={() => toggleGitGroup("unversioned")}
                    onToggleGroup={toggleGroup}
                    onTogglePath={togglePath}
                    selectedPath={selectedPath}
                  />
                </div>

                <div className="border-t border-[#e6e7ea] bg-[#fbfafc] p-2">
                  <Textarea
                    className="h-[108px] min-h-[108px] bg-white font-mono text-[12px]"
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder={t("git.commitMessage")}
                    value={commitMessage}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <Button className="h-8 px-4" disabled={!canCommit || operationRunning} onClick={() => commitSelected(false)} size="sm">
                      {busy === "commit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommitHorizontal className="h-3.5 w-3.5" />}
                      {t("git.commit")}
                    </Button>
                    <Button disabled={!canCommit || operationRunning} onClick={() => commitSelected(true)} size="sm" variant="outline">
                      {busy === "commit-push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {t("git.commitAndPush")}
                    </Button>
                    <div className="relative ml-auto" onClick={(event) => event.stopPropagation()}>
                      <GitIconButton icon={Settings} label={t("git.commitOptions")} onClick={() => setCommitOptionsOpen((open) => !open)} />
                      {commitOptionsOpen ? (
                        <GitToolbarMenu align="right">
                          <GitToolbarCheckboxItem checked={commitAmend} label={t("git.amend")} onChange={setCommitAmend} />
                        </GitToolbarMenu>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <GitShelfPanel
                busy={operationRunning}
                canCreate={canUseSelection}
                message={shelfMessage}
                onApply={(name) => runGitAction("apply-shelf", () => gitApi.applyShelf(name))}
                onCreate={createShelf}
                onDrop={(name) => runGitAction("drop-shelf", () => gitApi.dropShelf(name))}
                onMessageChange={setShelfMessage}
                shelves={state.shelves}
              />
            )}
          </div>

          <PaneResizeHandle orientation="vertical" onPointerDown={startCommitPaneResize} />

          <div className="flex min-h-0 flex-col bg-[#fffefe]">
            <div className="flex h-8 shrink-0 items-center border-b border-[#ececf0] px-2 text-[11px] text-[#69707a]">
              <Eye className="mr-1.5 h-[14px] w-[14px]" />
              <span className="truncate">{topDiffTitle}</span>
              <DiffModeToggle mode={diffMode} onModeChange={setDiffMode} />
              <span className="ml-2 shrink-0 rounded bg-[#f1f2f4] px-1.5 py-0.5 font-mono text-[10px]">{topDiffBadge}</span>
            </div>
            <MonacoDiffViewer diff={topDiff} emptyText={topDiffEmptyText} mode={diffMode} />
          </div>
        </div>

        <PaneResizeHandle orientation="horizontal" onPointerDown={startTopPaneResize} />

        <GitLogPanel
          busy={operationRunning}
          branches={state.branches}
          canCreateAutosquashCommit={selectedPathList.length > 0}
          commitContextActions={commitContextActions}
          commitDetails={commitDetails}
          commitDetailsError={commitDetailsError}
          commitFiles={commitFiles}
          commits={filteredCommits}
          currentBranch={state.branch.current}
          filterOptions={logFilterOptions}
          filters={logFilters}
          logFilter={logFilter}
          onCheckout={checkoutBranch}
          onFetch={() => runGitAction("fetch", gitApi.fetch)}
          onFiltersChange={setLogFilters}
          onLogFilterChange={setLogFilter}
          onMergeBranch={mergeBranch}
          onPreviewCommit={previewSelectedCommit}
          onPullLatest={pullLatest}
          onRefresh={refresh}
          onRebaseBranch={rebaseBranch}
          onResetLogView={resetLogView}
          onSelectCommit={selectCommit}
          onSelectCommitPath={selectCommitPath}
          repositoryRoot={state.root}
          selectedCommit={selectedCommit}
          selectedCommitHash={selectedCommitHash}
          selectedCommitPath={selectedCommitPath}
        />
      </div>
      <GitInputDialog dialog={inputDialog} disabled={operationRunning} onCancel={() => setInputDialog(null)} />
      <GitPreviewDialog dialog={previewDialog} onClose={() => setPreviewDialog(null)} />
    </div>
  );
}

function GitModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "h-7 rounded-md px-3 font-mono text-[12px] transition-colors",
        active ? "border border-[#9bbcff] bg-[#edf3ff] text-[#111827]" : "text-[#30343a] hover:bg-[#f7f7f9]"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function GitInputDialog({
  dialog,
  disabled,
  onCancel
}: {
  dialog: GitInputDialogState | null;
  disabled: boolean;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(dialog?.initialValue ?? "");
  }, [dialog]);

  if (!dialog) return null;

  const normalizedValue = dialog.kind === "textarea" ? value.trimEnd() : value.trim();
  const canConfirm = Boolean(normalizedValue);
  const confirm = () => {
    if (!canConfirm || disabled) return;
    dialog.onConfirm(normalizedValue);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/25 p-4" onMouseDown={onCancel}>
      <div className="w-full max-w-[520px] rounded-md border border-[#d8dbe2] bg-white shadow-[0_18px_42px_rgba(0,0,0,.22)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b border-[#eceef2] px-4 py-3">
          <div className="font-mono text-[13px] font-semibold text-[#111827]">{dialog.title}</div>
          {dialog.description ? <div className="mt-1 text-[11px] text-[#6b7280]">{dialog.description}</div> : null}
        </div>
        <div className="p-4">
          {dialog.kind === "textarea" ? (
            <Textarea className="h-[280px] min-h-[280px] bg-white font-mono text-[12px]" onChange={(event) => setValue(event.target.value)} value={value} />
          ) : dialog.kind === "options" ? (
            <div className="grid gap-2">
              {(dialog.options ?? []).map((option) => (
                <button
                  className={cn(
                    "rounded-md border border-[#d8dbe2] px-3 py-2 text-left hover:border-[#9bbcff] hover:bg-[#f7f9ff]",
                    value === option.value && "border-[#8ab4ff] bg-[#edf3ff]"
                  )}
                  key={option.value}
                  onClick={() => setValue(option.value)}
                  type="button"
                >
                  <div className="font-mono text-[12px] font-semibold text-[#111827]">{option.label}</div>
                  {option.description ? <div className="mt-1 text-[11px] text-[#6b7280]">{option.description}</div> : null}
                </button>
              ))}
            </div>
          ) : (
            <Input
              autoFocus
              className="h-8 bg-white font-mono text-[12px]"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  confirm();
                }
              }}
              placeholder={dialog.placeholder}
              value={value}
            />
          )}
        </div>
        <div className="flex h-12 items-center justify-end gap-2 border-t border-[#eceef2] px-4">
          <Button disabled={disabled} onClick={onCancel} size="sm" variant="ghost">
            {t("git.cancel")}
          </Button>
          <Button disabled={disabled || !canConfirm} onClick={confirm} size="sm">
            {dialog.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GitPreviewDialog({ dialog, onClose }: { dialog: GitPreviewDialogState | null; onClose: () => void }) {
  const { t } = useI18n();
  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/25 p-4" onMouseDown={onClose}>
      <div className="flex h-[78vh] w-full max-w-[920px] flex-col rounded-md border border-[#d8dbe2] bg-white shadow-[0_18px_42px_rgba(0,0,0,.22)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-11 shrink-0 items-center border-b border-[#eceef2] px-4">
          <div className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-[#111827]">{dialog.title}</div>
          <Button onClick={onClose} size="sm" variant="ghost">
            {t("git.close")}
          </Button>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-[#fbfafc] p-4 font-mono text-[11px] leading-[18px] text-[#111827]">{dialog.content}</pre>
      </div>
    </div>
  );
}

function GitToolbarMenu({
  align = "left",
  children
}: {
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute top-8 z-50 min-w-[168px] rounded-md border border-[#d8dbe2] bg-white py-1 font-mono text-[12px] shadow-[0_10px_24px_rgba(0,0,0,.16)]",
        align === "right" ? "right-0" : "left-0"
      )}
    >
      {children}
    </div>
  );
}

function GitToolbarMenuItem({
  disabled,
  label,
  onClick
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-7 w-full items-center px-3 text-left text-[#24292f] hover:bg-[#edf3ff] disabled:pointer-events-none disabled:text-[#a6adbb]"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function GitToolbarCheckboxItem({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-8 cursor-pointer items-center gap-2 px-3 text-[#24292f] hover:bg-[#edf3ff]">
      <input checked={checked} className="h-4 w-4 rounded border-[#b9c0cc]" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function DiffModeToggle({ mode, onModeChange }: { mode: GitDiffMode; onModeChange: (mode: GitDiffMode) => void }) {
  const { t } = useI18n();
  return (
    <div className="ml-auto flex h-6 shrink-0 items-center rounded-md bg-[#f1f2f4] p-0.5">
      <button
        className={cn("h-5 rounded px-2 font-mono text-[10px] text-[#6b7280]", mode === "inline" && "bg-white text-[#184b8f] shadow-[0_1px_1px_rgba(0,0,0,.08)]")}
        onClick={() => onModeChange("inline")}
        type="button"
      >
        {t("git.inline")}
      </button>
      <button
        className={cn("h-5 rounded px-2 font-mono text-[10px] text-[#6b7280]", mode === "split" && "bg-white text-[#184b8f] shadow-[0_1px_1px_rgba(0,0,0,.08)]")}
        onClick={() => onModeChange("split")}
        type="button"
      >
        {t("git.split")}
      </button>
    </div>
  );
}

function PaneResizeHandle({
  onPointerDown,
  orientation
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  orientation: "horizontal" | "vertical";
}) {
  const { t } = useI18n();
  return (
    <div
      aria-label={orientation === "vertical" ? t("git.resizeVertical") : t("git.resizeHorizontal")}
      className={cn(
        "group shrink-0 bg-transparent",
        orientation === "vertical" ? "w-[5px] cursor-col-resize" : "h-[5px] cursor-row-resize"
      )}
      onPointerDown={onPointerDown}
      role="separator"
    >
      <div
        className={cn(
          "transition-colors",
          orientation === "vertical"
            ? "mx-auto h-full w-0 border-l border-transparent group-hover:border-[#7f9dde]"
            : "h-0 w-full border-t border-transparent group-hover:border-[#7f9dde]"
        )}
      />
    </div>
  );
}

function MonacoDiffViewer({ diff, emptyText, mode }: { diff: GitFileDiff | null; emptyText: string; mode: GitDiffMode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReturnType<MonacoModule["editor"]["createDiffEditor"]> | null>(null);
  const modelRef = useRef<{
    modified: ReturnType<MonacoModule["editor"]["createModel"]>;
    original: ReturnType<MonacoModule["editor"]["createModel"]>;
  } | null>(null);
  const [monacoModule, setMonacoModule] = useState<MonacoModule | null>(null);

  useEffect(() => {
    let disposed = false;
    setupMonacoEnvironment();
    void Promise.all([
      loadMonacoLanguageContributions(),
      import("monaco-editor/esm/vs/editor/editor.api.js")
    ]).then(([, nextMonacoModule]) => {
      if (!disposed) {
        configureMonacoLanguageServices(nextMonacoModule);
        setMonacoModule(nextMonacoModule);
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!diff) {
      editorRef.current?.dispose();
      editorRef.current = null;
      modelRef.current?.original.dispose();
      modelRef.current?.modified.dispose();
      modelRef.current = null;
      return;
    }

    const container = containerRef.current;
    if (!container || !monacoModule || editorRef.current) return;

    editorRef.current = monacoModule.editor.createDiffEditor(container, {
      automaticLayout: true,
      diffAlgorithm: "advanced",
      fontFamily: 'Menlo, Monaco, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 11,
      lineHeight: 18,
      minimap: { enabled: false },
      originalEditable: false,
      readOnly: true,
      renderSideBySide: mode === "split",
      scrollBeyondLastLine: false,
      theme: getResolvedMonacoTheme(),
      useInlineViewWhenSpaceIsLimited: false,
      wordWrap: "off"
    });
    editorRef.current.getOriginalEditor().updateOptions(getSyntaxHighlightingEditorOptions());
    editorRef.current.getModifiedEditor().updateOptions(getSyntaxHighlightingEditorOptions());

    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
      modelRef.current?.original.dispose();
      modelRef.current?.modified.dispose();
      modelRef.current = null;
    };
  }, [diff, monacoModule]);

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
    if (!editor || !monacoModule || !diff) return;

    modelRef.current?.original.dispose();
    modelRef.current?.modified.dispose();

    const originalModel = monacoModule.editor.createModel(diff.original, diff.language, createMonacoDiffUri(monacoModule, "git-diff", "original", diff.originalPath));
    const modifiedModel = monacoModule.editor.createModel(diff.modified, diff.language, createMonacoDiffUri(monacoModule, "git-diff", "modified", diff.modifiedPath));

    modelRef.current = { modified: modifiedModel, original: originalModel };
    editor.setModel({ modified: modifiedModel, original: originalModel });
  }, [diff, monacoModule]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      renderSideBySide: mode === "split",
      useInlineViewWhenSpaceIsLimited: false
    });
    window.requestAnimationFrame(() => editorRef.current?.layout());
  }, [mode]);

  if (!diff) {
    return <div className="grid min-h-0 flex-1 place-items-center bg-[#fffefe] p-3 text-[12px] text-[#8a9099]">{emptyText}</div>;
  }

  return <div className="min-h-0 flex-1 overflow-hidden bg-[#fffefe]" ref={containerRef} />;
}

function getSyntaxHighlightingEditorOptions(): Parameters<MonacoCodeEditor["updateOptions"]>[0] {
  return { "semanticHighlighting.enabled": false };
}

function GitCommitToolbar({
  busy,
  canPreview,
  canUseSelection,
  onCollapseGroups,
  onDiscard,
  onExpandGroups,
  onFetch,
  onPreview,
  onRefresh,
  onStage,
  onUnstage
}: {
  busy: boolean;
  canPreview: boolean;
  canUseSelection: boolean;
  onCollapseGroups: () => void;
  onDiscard: () => void;
  onExpandGroups: () => void;
  onFetch: () => void;
  onPreview: () => void;
  onRefresh: () => void;
  onStage: () => void;
  onUnstage: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[#e6e7ea] bg-[#f7f5f8] px-2">
      <GitIconButton disabled={busy} icon={RefreshCcw} label={t("git.refresh")} onClick={onRefresh} />
      <GitIconButton disabled={busy || !canUseSelection} icon={Check} label={t("git.stage")} onClick={onStage} />
      <GitIconButton disabled={busy || !canUseSelection} icon={RotateCcw} label={t("git.unstage")} onClick={onUnstage} />
      <GitIconButton disabled={busy} icon={Download} label={t("git.fetch")} onClick={onFetch} />
      <GitIconButton disabled={busy || !canUseSelection} icon={RotateCcw} label={t("git.rollback")} onClick={onDiscard} />
      <GitIconButton disabled={!canPreview} icon={Eye} label={t("git.preview")} onClick={onPreview} />
      <span className="ml-auto h-4 w-px bg-[#dfe1e5]" />
      <GitIconButton icon={ChevronDown} label={t("git.expand")} onClick={onExpandGroups} />
      <GitIconButton icon={ChevronRight} label={t("git.collapse")} onClick={onCollapseGroups} />
    </div>
  );
}

function GitFileGroup({
  checkedPaths,
  expanded,
  files,
  label,
  onSelectFile,
  onToggleExpanded,
  onToggleGroup,
  onTogglePath,
  selectedPath
}: {
  checkedPaths: Set<string>;
  expanded: boolean;
  files: GitChangedFile[];
  label: string;
  onSelectFile: (path: string) => void;
  onToggleExpanded: () => void;
  onToggleGroup: (files: GitChangedFile[], checked: boolean) => void;
  onTogglePath: (path: string) => void;
  selectedPath: string | null;
}) {
  const { t } = useI18n();
  const checkedCount = files.filter((file) => checkedPaths.has(file.path)).length;
  const allChecked = files.length > 0 && checkedCount === files.length;

  if (!files.length) return null;

  return (
    <div>
      <div className="flex h-7 items-center gap-2 px-2 font-mono text-[12px] text-[#111827]">
        <button className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-[#f7f9ff]" onClick={onToggleExpanded} type="button">
          {expanded ? <ChevronDown className="h-[13px] w-[13px] text-[#7b8390]" /> : <ChevronRight className="h-[13px] w-[13px] text-[#7b8390]" />}
        </button>
        <input checked={allChecked} className="h-4 w-4 rounded border-[#b9c0cc]" onChange={(event) => onToggleGroup(files, event.target.checked)} type="checkbox" />
        <button className="min-w-0 truncate text-left hover:text-[#184b8f]" onClick={onToggleExpanded} type="button">
          {label}
        </button>
        <span className="shrink-0 text-[#8a9099]">{t("git.fileCount", { count: files.length })}</span>
      </div>
      {expanded ? (
        <div>
          {files.map((file) => (
            <GitFileRow checked={checkedPaths.has(file.path)} file={file} key={file.path} onSelect={onSelectFile} onToggle={onTogglePath} selected={selectedPath === file.path} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GitFileRow({
  checked,
  file,
  onSelect,
  onToggle,
  selected
}: {
  checked: boolean;
  file: GitChangedFile;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  selected: boolean;
}) {
  return (
    <button
      className={cn("flex h-7 w-full min-w-0 items-center gap-2 px-6 text-left font-mono text-[12px] hover:bg-[#f7f9ff]", selected && "bg-[#dfe8ff]")}
      onClick={() => onSelect(file.path)}
      type="button"
    >
      <input
        checked={checked}
        className="h-4 w-4 shrink-0 rounded border-[#b9c0cc]"
        onChange={() => onToggle(file.path)}
        onClick={(event) => event.stopPropagation()}
        type="checkbox"
      />
      <FileText className={cn("h-[14px] w-[14px] shrink-0", getFileColor(file))} />
      <span className={cn("min-w-0 truncate", getFileColor(file))}>{file.name}</span>
      <span className="min-w-0 truncate text-[#8a9099]">{file.directory}</span>
      <span className="ml-auto shrink-0 text-[10px] text-[#8a9099]">{file.statusText}</span>
    </button>
  );
}

function GitShelfPanel({
  busy,
  canCreate,
  message,
  onApply,
  onCreate,
  onDrop,
  onMessageChange,
  shelves
}: {
  busy: boolean;
  canCreate: boolean;
  message: string;
  onApply: (name: string) => void;
  onCreate: () => void;
  onDrop: (name: string) => void;
  onMessageChange: (message: string) => void;
  shelves: GitShelf[];
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[#ececf0] p-2">
        <Input className="h-8 bg-white text-[12px]" onChange={(event) => onMessageChange(event.target.value)} placeholder={t("git.shelfName")} value={message} />
        <Button className="mt-2 w-full" disabled={busy || !canCreate} onClick={onCreate} size="sm" variant="outline">
          <Folder className="h-3.5 w-3.5" />
          {t("git.shelveSelectedChanges")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {shelves.length ? (
          shelves.map((shelf) => (
            <div className="border-b border-[#f0f0f2] px-3 py-2" key={shelf.name}>
              <div className="flex min-w-0 items-center gap-2 font-mono text-[12px]">
                <Folder className="h-[14px] w-[14px] shrink-0 text-[#7b8390]" />
                <span className="min-w-0 flex-1 truncate">{shelf.message}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-[#8a9099]">
                <span>{shelf.name}</span>
                <span>{shelf.date}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button disabled={busy} onClick={() => onApply(shelf.name)} size="sm" variant="outline">
                  {t("git.apply")}
                </Button>
                <Button disabled={busy} onClick={() => onDrop(shelf.name)} size="sm" variant="ghost">
                  {t("git.drop")}
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-[12px] text-[#8a9099]">{t("git.noShelves")}</div>
        )}
      </div>
    </div>
  );
}

function GitLogPanel({
  branches,
  busy,
  canCreateAutosquashCommit,
  commitContextActions,
  commitDetails,
  commitDetailsError,
  commitFiles,
  commits,
  currentBranch,
  filterOptions,
  filters,
  logFilter,
  onCheckout,
  onFetch,
  onFiltersChange,
  onLogFilterChange,
  onMergeBranch,
  onPreviewCommit,
  onPullLatest,
  onRefresh,
  onRebaseBranch,
  onResetLogView,
  onSelectCommit,
  onSelectCommitPath,
  repositoryRoot,
  selectedCommit,
  selectedCommitHash,
  selectedCommitPath
}: {
  branches: GitBranchItem[];
  busy: boolean;
  canCreateAutosquashCommit: boolean;
  commitContextActions: GitCommitContextActions;
  commitDetails: GitCommitDetails | null;
  commitDetailsError: string | null;
  commitFiles: GitCommitChangedFile[];
  commits: GitCommit[];
  currentBranch: string;
  filterOptions: GitLogFilterOptions;
  filters: GitLogFilters;
  logFilter: string;
  onCheckout: (branchName: string) => void;
  onFetch: () => void;
  onFiltersChange: (filters: GitLogFilters) => void;
  onLogFilterChange: (value: string) => void;
  onMergeBranch: (branchName: string) => void;
  onPreviewCommit: () => void;
  onPullLatest: (rebase: boolean) => void;
  onRefresh: () => void;
  onRebaseBranch: (branchName: string) => void;
  onResetLogView: () => void;
  onSelectCommit: (hash: string) => void;
  onSelectCommitPath: (path: string) => void;
  repositoryRoot: string;
  selectedCommit: GitCommit | null;
  selectedCommitHash: string | null;
  selectedCommitPath: string | null;
}) {
  const { locale, t } = useI18n();
  const logBodyRef = useRef<HTMLDivElement>(null);
  const logSearchInputRef = useRef<HTMLInputElement>(null);
  const [logBranchPaneWidth, setLogBranchPaneWidth] = useState(220);
  const [logCommitPaneWidth, setLogCommitPaneWidth] = useState(520);
  const [commitContextMenu, setCommitContextMenu] = useState<{ commit: GitCommit; x: number; y: number } | null>(null);
  const updateFilter = <Key extends keyof GitLogFilters>(key: Key, value: GitLogFilters[Key]) => {
    onFiltersChange({ ...filters, [key]: value });
  };
  const openCommitContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, commit: GitCommit) => {
    event.preventDefault();
    onSelectCommit(commit.hash);
    setCommitContextMenu({ commit, x: event.clientX, y: event.clientY });
  };
  const closeCommitContextMenu = () => setCommitContextMenu(null);
  const startLogPaneResize = (divider: "branch" | "commit") => (event: ReactPointerEvent<HTMLDivElement>) => {
    const body = logBodyRef.current;
    if (!body) return;

    event.preventDefault();
    const bodyRect = body.getBoundingClientRect();
    const initialBranchWidth = logBranchPaneWidth;
    const initialCommitWidth = logCommitPaneWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const relativeX = moveEvent.clientX - bodyRect.left;
      const nextWidths =
        divider === "branch"
          ? normalizeLogPaneWidths(bodyRect.width, relativeX, initialCommitWidth)
          : normalizeLogPaneWidths(bodyRect.width, initialBranchWidth, relativeX - initialBranchWidth - 5);

      setLogBranchPaneWidth(nextWidths.branch);
      setLogCommitPaneWidth(nextWidths.commit);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  useEffect(() => {
    if (!commitContextMenu) return;
    const close = () => closeCommitContextMenu();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [commitContextMenu]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#fbfafc]">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[#e2e3e7] px-3">
        <span className="font-mono text-[12px] font-semibold">Git</span>
        <span className="rounded-md border border-[#d8dae0] bg-[#eceaf0] px-2 py-1 font-mono text-[11px]">{t("git.log")}</span>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[#e6e7ea] px-2">
        <GitIconButton icon={ChevronRight} label={t("git.back")} onClick={onResetLogView} />
        <div className="relative w-[250px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-[#8a9099]" />
          <Input
            className="h-7 bg-white pl-7 font-mono text-[11px]"
            onChange={(event) => onLogFilterChange(event.target.value)}
            placeholder={t("git.textOrHash")}
            ref={logSearchInputRef}
            value={logFilter}
          />
        </div>
        <GitFilterMenu label={t("git.filterBranch")} onValueChange={(value) => updateFilter("branch", value)} options={filterOptions.branches} value={filters.branch} />
        <GitFilterMenu label={t("git.filterUser")} onValueChange={(value) => updateFilter("author", value)} options={filterOptions.authors} value={filters.author} />
        <GitFilterMenu label={t("git.filterDate")} onValueChange={(value) => updateFilter("date", (value ?? "all") as GitLogDateFilter)} options={getDateFilterOptions(t)} value={filters.date} />
        <GitFilterMenu label={t("git.filterPaths")} onValueChange={(value) => updateFilter("path", value)} options={filterOptions.paths} value={filters.path} />
        <span className="ml-auto flex items-center gap-1">
          <GitIconButton disabled={busy} icon={RefreshCcw} label={t("git.refresh")} onClick={onRefresh} />
          <GitIconButton disabled={busy} icon={Download} label={t("git.fetch")} onClick={onFetch} />
          <GitIconButton disabled={busy || !selectedCommit} icon={Eye} label={t("git.preview")} onClick={onPreviewCommit} />
          <GitIconButton icon={Search} label={t("git.search")} onClick={() => logSearchInputRef.current?.focus()} />
        </span>
      </div>

      <div className="flex min-h-0 flex-1" ref={logBodyRef}>
        <div className="min-h-0 shrink-0" style={{ width: logBranchPaneWidth }}>
          <GitBranchTree
            branches={branches}
            busy={busy}
            currentBranch={currentBranch}
            onBranchFilterChange={(branch) => updateFilter("branch", branch)}
            onCheckout={onCheckout}
            onMergeBranch={onMergeBranch}
            onPullLatest={onPullLatest}
            onRebaseBranch={onRebaseBranch}
            selectedBranch={filters.branch}
          />
        </div>
        <PaneResizeHandle orientation="vertical" onPointerDown={startLogPaneResize("branch")} />
        <div className="min-h-0 shrink-0 overflow-auto border-l border-r border-[#e2e3e7] bg-[#fffefe]" style={{ width: logCommitPaneWidth }}>
          {commits.map((commit) => (
            <button
              className={cn("grid h-8 w-full grid-cols-[72px_minmax(0,1fr)_110px_118px] items-center gap-2 px-2 text-left font-mono text-[12px] hover:bg-[#f7f9ff]", selectedCommitHash === commit.hash && "bg-[#dfe8ff]")}
              key={commit.hash}
              onClick={() => onSelectCommit(commit.hash)}
              onContextMenu={(event) => openCommitContextMenu(event, commit)}
              type="button"
            >
              <span className="flex items-center gap-1 text-[#6d55bc]">
                <span className="whitespace-pre text-[13px] leading-none">{formatGraph(commit.graph)}</span>
                <span className="h-2 w-2 rounded-full bg-[#7b5fd6]" />
              </span>
              <span className="min-w-0 truncate text-[#111827]">
                {commit.subject}
                {commit.decorations.length ? <span className="ml-2 text-[10px] text-[#0f766e]">{commit.decorations.slice(0, 3).join(" ")}</span> : null}
              </span>
              <span className="truncate font-semibold">{commit.author}</span>
              <span className="truncate text-[#6b7280]">{formatCommitDate(commit.date, locale, t)}</span>
            </button>
          ))}
          {commitContextMenu ? (
            <GitCommitContextMenu
              actions={commitContextActions}
              busy={busy}
              canCreateAutosquashCommit={canCreateAutosquashCommit}
              commit={commitContextMenu.commit}
              commits={commits}
              onClose={closeCommitContextMenu}
              onSelectCommit={onSelectCommit}
              x={commitContextMenu.x}
              y={commitContextMenu.y}
            />
          ) : null}
        </div>
        <PaneResizeHandle orientation="vertical" onPointerDown={startLogPaneResize("commit")} />
        <GitCommitInspector
          commit={selectedCommit}
          details={commitDetails}
          detailsError={commitDetailsError}
          files={commitFiles}
          onBranchSelect={(branch) => updateFilter("branch", branch === "HEAD" ? null : branch)}
          onSelectPath={onSelectCommitPath}
          repositoryRoot={repositoryRoot}
          selectedPath={selectedCommitPath}
        />
      </div>
    </div>
  );
}

function GitCommitContextMenu({
  actions,
  busy,
  canCreateAutosquashCommit,
  commit,
  commits,
  onClose,
  onSelectCommit,
  x,
  y
}: {
  actions: GitCommitContextActions;
  busy: boolean;
  canCreateAutosquashCommit: boolean;
  commit: GitCommit;
  commits: GitCommit[];
  onClose: () => void;
  onSelectCommit: (hash: string) => void;
  x: number;
  y: number;
}) {
  const { t } = useI18n();
  const parentHash = commit.parents[0] ?? null;
  const childCommit = commits.find((candidate) => candidate.parents.includes(commit.hash)) ?? null;
  const isHead = isHeadCommit(commit);
  const menuHeight = getFloatingMenuMaxHeight(548);
  const position = getFloatingMenuPosition(x, y, 332, menuHeight);
  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div
      className="fixed z-50 w-[332px] overflow-y-auto rounded-md border border-[#d8dbe2] bg-white py-1 font-mono text-[12px] shadow-[0_14px_30px_rgba(0,0,0,.2)]"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position.left, maxHeight: menuHeight, top: position.top }}
    >
      <GitCommitMenuItem icon={Copy} label={t("git.copyRevision")} onClick={() => run(() => actions.copyRevision(commit))} shortcut="⇧⌘C" />
      <GitCommitMenuItem disabled={busy} icon={FilePlus2} label={t("git.createPatch")} onClick={() => run(() => actions.createPatch(commit))} />
      <GitCommitMenuItem disabled={busy} icon={GitFork} label={t("git.cherryPick")} onClick={() => run(() => actions.cherryPick(commit))} />
      <GitMenuSeparator />
      <GitCommitMenuItem disabled={busy} label={t("git.checkoutRevision")} onClick={() => run(() => actions.checkoutRevision(commit))} />
      <GitCommitMenuItem disabled={busy} label={t("git.showRepositoryAtRevision")} onClick={() => run(() => actions.showRepositoryAtRevision(commit))} />
      <GitCommitMenuItem disabled={busy} label={t("git.compareWithLocal")} onClick={() => run(() => actions.compareWithLocal(commit))} />
      <GitMenuSeparator />
      <GitCommitMenuItem disabled={busy} icon={RotateCcw} label={t("git.resetCurrentBranchToHere")} onClick={() => run(() => actions.resetCurrentBranch(commit))} />
      <GitCommitMenuItem disabled={busy} label={t("git.revertCommit")} onClick={() => run(() => actions.revertCommit(commit))} />
      <GitCommitMenuItem disabled={busy || !isHead} label={t("git.undoCommit")} onClick={() => run(() => actions.undoCommit(commit))} />
      <GitMenuSeparator />
      <GitCommitMenuItem disabled={busy || !isHead} icon={Pencil} label={t("git.editCommitMessage")} onClick={() => run(() => actions.editCommitMessage(commit))} shortcut="F2" />
      <GitCommitMenuItem disabled={busy || !canCreateAutosquashCommit} label={t("git.fixup")} onClick={() => run(() => actions.createAutosquashCommit(commit, "fixup"))} />
      <GitCommitMenuItem disabled={busy || !canCreateAutosquashCommit} label={t("git.squashInto")} onClick={() => run(() => actions.createAutosquashCommit(commit, "squash"))} />
      <GitCommitMenuItem disabled={busy} icon={Trash2} label={t("git.dropCommit")} onClick={() => run(() => actions.dropCommit(commit))} />
      <GitCommitMenuItem disabled={busy} label={t("git.interactiveRebase")} onClick={() => run(() => actions.interactiveRebase(commit))} />
      <GitCommitMenuItem disabled={busy} label={t("git.pushUpToCommit")} onClick={() => run(() => actions.pushUpToCommit(commit))} />
      <GitMenuSeparator />
      <GitCommitMenuItem disabled={busy} icon={GitBranch} label={t("git.newBranchMenu")} onClick={() => run(() => actions.createBranch(commit))} shortcut="⌥⌘N" />
      <GitCommitMenuItem disabled={busy} icon={Tag} label={t("git.newTagMenu")} onClick={() => run(() => actions.createTag(commit))} />
      <GitMenuSeparator />
      <GitCommitMenuItem
        disabled={!childCommit}
        label={t("git.goToChildCommit")}
        onClick={() => childCommit && run(() => onSelectCommit(childCommit.hash))}
        shortcut="←"
      />
      <GitCommitMenuItem
        disabled={!parentHash}
        label={t("git.goToParentCommit")}
        onClick={() => parentHash && run(() => onSelectCommit(parentHash))}
        shortcut="→"
      />
      <GitMenuSeparator />
      <GitCommitMenuItem disabled={busy} icon={ExternalLink} label={t("git.viewInBrowser")} onClick={() => run(() => actions.viewInBrowser(commit))} />
    </div>
  );
}

function GitCommitMenuItem({
  disabled,
  icon: Icon,
  label,
  onClick,
  shortcut
}: {
  disabled?: boolean;
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      className="grid h-[26px] w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1.5 px-3 text-left text-[#24292f] hover:bg-[#edf3ff] disabled:pointer-events-none disabled:text-[#a6adbb]"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="grid h-[18px] w-[18px] place-items-center">{Icon ? <Icon className="h-[14px] w-[14px] text-[#7b8390]" /> : null}</span>
      <span className="min-w-0 truncate">{label}</span>
      {shortcut ? <span className="pl-3 text-[#7b8390]">{shortcut}</span> : null}
    </button>
  );
}

function GitMenuSeparator() {
  return <div className="my-1 h-px bg-[#eceef2]" />;
}

function GitCommitInspector({
  commit,
  details,
  detailsError,
  files,
  onBranchSelect,
  onSelectPath,
  repositoryRoot,
  selectedPath
}: {
  commit: GitCommit | null;
  details: GitCommitDetails | null;
  detailsError: string | null;
  files: GitCommitChangedFile[];
  onBranchSelect: (branch: string) => void;
  onSelectPath: (path: string) => void;
  repositoryRoot: string;
  selectedPath: string | null;
}) {
  const { t } = useI18n();
  const rootName = getPathBaseName(repositoryRoot) || t("git.repository");

  if (!commit) {
    return <div className="grid min-h-0 min-w-[300px] flex-1 place-items-center bg-[#fffefe] font-mono text-[12px] text-[#8a9099]">{t("git.noCommitSelected")}</div>;
  }

  return (
    <div className="flex min-h-0 min-w-[300px] flex-1 flex-col bg-[#fffefe]">
      <CommitFileTree files={files} onSelectPath={onSelectPath} rootName={rootName} selectedPath={selectedPath} />
      <CommitMetadata commit={commit} details={details} detailsError={detailsError} onBranchSelect={onBranchSelect} />
    </div>
  );
}

type CommitFileTreeNode = {
  children: CommitFileTreeNode[];
  file: GitCommitChangedFile | null;
  fileCount: number;
  name: string;
  path: string;
  type: "directory" | "file" | "root";
};

function CommitFileTree({
  files,
  onSelectPath,
  rootName,
  selectedPath
}: {
  files: GitCommitChangedFile[];
  onSelectPath: (path: string) => void;
  rootName: string;
  selectedPath: string | null;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ root: true });
  const root = useMemo(() => buildCommitFileTree(rootName, files), [files, rootName]);
  const toggle = (path: string) => setExpanded((previousExpanded) => ({ ...previousExpanded, [path]: !(previousExpanded[path] ?? true) }));

  return (
    <div className="min-h-[148px] flex-1 overflow-auto border-b border-[#ececf0] py-1 font-mono text-[12px]">
      {files.length ? (
        <CommitFileTreeRow expanded={expanded} node={root} onSelectPath={onSelectPath} onToggle={toggle} selectedPath={selectedPath} />
      ) : (
        <div className="px-3 py-4 text-[#8a9099]">{t("git.noChangedFiles")}</div>
      )}
    </div>
  );
}

function CommitFileTreeRow({
  depth = 0,
  expanded,
  node,
  onSelectPath,
  onToggle,
  selectedPath
}: {
  depth?: number;
  expanded: Record<string, boolean>;
  node: CommitFileTreeNode;
  onSelectPath: (path: string) => void;
  onToggle: (path: string) => void;
  selectedPath: string | null;
}) {
  const { t } = useI18n();
  const isDirectory = node.type !== "file";
  const isExpanded = expanded[node.path] ?? true;
  const Icon = isDirectory ? Folder : FileText;
  const selected = node.file?.path === selectedPath;

  return (
    <>
      <button
        className={cn("flex h-7 w-full min-w-0 items-center gap-1.5 px-2 text-left hover:bg-[#f7f9ff]", selected && "bg-[#dfe8ff]")}
        onClick={() => (isDirectory ? onToggle(node.path) : node.file && onSelectPath(node.file.path))}
        style={{ paddingLeft: 10 + depth * 18 }}
        title={node.file?.path ?? node.path}
        type="button"
      >
        {isDirectory ? (
          isExpanded ? (
            <ChevronDown className="h-[13px] w-[13px] shrink-0 text-[#7b8390]" />
          ) : (
            <ChevronRight className="h-[13px] w-[13px] shrink-0 text-[#7b8390]" />
          )
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        <Icon className={cn("h-[15px] w-[15px] shrink-0", node.file ? getCommitFileColor(node.file) : "text-[#6b7280]")} />
        <span className={cn("min-w-0 truncate", node.file ? getCommitFileColor(node.file) : "text-[#111827]")}>{node.name}</span>
        {isDirectory ? <span className="shrink-0 text-[#8a9099]">{t("git.fileCount", { count: node.fileCount })}</span> : null}
      </button>
      {isDirectory && isExpanded
        ? node.children.map((child) => (
            <CommitFileTreeRow expanded={expanded} key={child.path} node={child} onSelectPath={onSelectPath} onToggle={onToggle} selectedPath={selectedPath} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

function CommitMetadata({
  commit,
  details,
  detailsError,
  onBranchSelect
}: {
  commit: GitCommit;
  details: GitCommitDetails | null;
  detailsError: string | null;
  onBranchSelect: (branch: string) => void;
}) {
  const { locale, t } = useI18n();
  const [showAllBranches, setShowAllBranches] = useState(false);
  const detailsReady = details?.hash === commit.hash;
  const tags = detailsReady ? details.tags : getDecorationTags(commit.decorations);
  const branches = detailsReady ? details.branches : getDecorationBranches(commit.decorations);
  const visibleBranches = showAllBranches ? branches : branches.slice(0, 3);
  const hiddenBranchCount = Math.max(0, branches.length - visibleBranches.length);

  useEffect(() => {
    setShowAllBranches(false);
  }, [commit.hash]);

  return (
    <div className="max-h-[190px] shrink-0 overflow-auto border-b border-[#ececf0] px-4 py-3 font-mono text-[12px] text-[#111827]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{commit.subject}</div>
          <div className="mt-2 text-[#111827]">
            <span>{commit.shortHash}</span>
            <span className="ml-2 font-semibold">{commit.author}</span>
          </div>
          <div className="mt-1 break-all text-[#111827]">
            {commit.authorEmail ? <span className="text-[#1f5fbf]">&lt;{commit.authorEmail}&gt;</span> : null}
            <span>{commit.authorEmail ? " " : ""}{t("git.onDate", { date: formatCommitDetailsDate(commit.date, locale) })}</span>
          </div>
        </div>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#58a66a] text-white">
          <Check className="h-[14px] w-[14px]" />
        </span>
      </div>
      {tags.length ? (
        <div className="mt-3 flex min-w-0 items-center gap-2">
          <Tag className="h-[14px] w-[14px] shrink-0 text-[#7b8390]" />
          <span className="min-w-0 truncate">{tags.join(", ")}</span>
        </div>
      ) : null}
      {branches.length ? (
        <div className="mt-3 min-w-0">
          <span>{t("git.inBranches", { count: branches.length })} </span>
          {visibleBranches.map((branch, index) => (
            <span key={branch}>
              {index > 0 ? <span>, </span> : null}
              <button className="text-[#1f5fbf] hover:underline" onClick={() => onBranchSelect(branch)} type="button">
                {branch}
              </button>
            </span>
          ))}
          {hiddenBranchCount ? <span>, ... </span> : null}
          {branches.length > 3 ? (
            <button className="ml-1 text-[#1f5fbf] hover:underline" onClick={() => setShowAllBranches((showAll) => !showAll)} type="button">
              {showAllBranches ? t("git.showLess") : t("git.showAll")}
            </button>
          ) : null}
        </div>
      ) : null}
      {detailsError ? <div className="mt-2 text-[#b4234a]">{detailsError}</div> : null}
    </div>
  );
}

function GitBranchTree({
  branches,
  busy,
  currentBranch,
  onBranchFilterChange,
  onCheckout,
  onMergeBranch,
  onPullLatest,
  onRebaseBranch,
  selectedBranch
}: {
  branches: GitBranchItem[];
  busy: boolean;
  currentBranch: string;
  onBranchFilterChange: (branchName: string | null) => void;
  onCheckout: (branchName: string) => void;
  onMergeBranch: (branchName: string) => void;
  onPullLatest: (rebase: boolean) => void;
  onRebaseBranch: (branchName: string) => void;
  selectedBranch: string | null;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ local: true, remote: true });
  const [contextMenu, setContextMenu] = useState<{ branch: GitBranchItem; x: number; y: number } | null>(null);
  const localBranches = branches.filter((branch) => branch.type === "local");
  const remoteBranches = branches.filter((branch) => branch.type === "remote");
  const remoteGroups = groupRemoteBranches(remoteBranches);
  const setSectionExpanded = (key: string, value: boolean) => {
    setExpanded((previousExpanded) => ({ ...previousExpanded, [key]: value }));
  };
  const openBranchMenu = (event: ReactMouseEvent<HTMLButtonElement>, branch: GitBranchItem) => {
    event.preventDefault();
    setContextMenu({ branch, x: event.clientX, y: event.clientY });
  };
  const runBranchAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const menuBranch = contextMenu?.branch ?? null;
  const menuBranchIsCurrent = menuBranch?.name === currentBranch;

  return (
    <div className="relative min-h-0 overflow-auto bg-[#fbfafc] py-2 font-mono text-[12px]">
      <BranchTreeRow active={!selectedBranch} icon={GitCommitHorizontal} label={t("git.headCurrentBranch")} onClick={() => onBranchFilterChange(null)} />
      <BranchTreeHeader expanded={expanded.local ?? true} label={t("git.local")} onToggle={() => setSectionExpanded("local", !(expanded.local ?? true))} />
      {expanded.local
        ? localBranches.map((branch) => (
            <BranchTreeRow
              active={branch.name === currentBranch}
              icon={GitBranch}
              key={branch.name}
              label={branch.name}
              markerIcon={branch.name === currentBranch ? BadgeCheck : undefined}
              onClick={() => onBranchFilterChange(branch.name)}
              onContextMenu={(event) => openBranchMenu(event, branch)}
              onDoubleClick={() => onCheckout(branch.name)}
              selected={selectedBranch === branch.name}
            />
          ))
        : null}
      <BranchTreeHeader expanded={expanded.remote ?? true} label={t("git.remote")} onToggle={() => setSectionExpanded("remote", !(expanded.remote ?? true))} />
      {expanded.remote
        ? Object.entries(remoteGroups).map(([remote, remoteBranchesForGroup]) => {
            const remoteKey = `remote:${remote}`;
            const remoteExpanded = expanded[remoteKey] ?? true;
            return (
              <div key={remote}>
                <BranchTreeRow expanded={remoteExpanded} icon={Folder} label={remote} onClick={() => setSectionExpanded(remoteKey, !remoteExpanded)} />
                {remoteExpanded
                  ? remoteBranchesForGroup.map((branch) => (
                      <BranchTreeRow
                        icon={Star}
                        key={branch.name}
                        label={branch.name.replace(`${remote}/`, "")}
                        nested
                        onClick={() => onBranchFilterChange(branch.name)}
                        onContextMenu={(event) => openBranchMenu(event, branch)}
                        onDoubleClick={() => onCheckout(branch.name)}
                        selected={selectedBranch === branch.name}
                      />
                    ))
                  : null}
              </div>
            );
          })
        : null}
      {contextMenu && menuBranch ? (
        <div
          className="fixed z-50 w-[178px] rounded-md border border-[#d8dbe2] bg-white py-1 text-[12px] shadow-lg"
          onClick={(event) => event.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <BranchMenuItem disabled={busy || menuBranchIsCurrent} label={t("git.checkout")} onClick={() => runBranchAction(() => onCheckout(menuBranch.name))} />
          <BranchMenuItem disabled={busy} label={t("git.pull")} onClick={() => runBranchAction(() => onPullLatest(false))} />
          <BranchMenuItem disabled={busy} label={t("git.pullRebase")} onClick={() => runBranchAction(() => onPullLatest(true))} />
          <div className="my-1 h-px bg-[#eceef2]" />
          <BranchMenuItem disabled={busy || menuBranchIsCurrent} label={t("git.merge")} onClick={() => runBranchAction(() => onMergeBranch(menuBranch.name))} />
          <BranchMenuItem disabled={busy || menuBranchIsCurrent} label={t("git.rebaseOnto")} onClick={() => runBranchAction(() => onRebaseBranch(menuBranch.name))} />
        </div>
      ) : null}
    </div>
  );
}

function BranchMenuItem({
  disabled,
  label,
  onClick
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-7 w-full items-center px-3 text-left text-[#24292f] hover:bg-[#f7f9ff] disabled:pointer-events-none disabled:text-[#9aa1ad]"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function BranchTreeHeader({ expanded, label, onToggle }: { expanded: boolean; label: string; onToggle: () => void }) {
  return (
    <button className="mt-1 flex h-7 w-full items-center gap-1 px-3 text-left text-[#111827] hover:bg-[#f7f9ff]" onClick={onToggle} type="button">
      {expanded ? <ChevronDown className="h-[13px] w-[13px] text-[#7b8390]" /> : <ChevronRight className="h-[13px] w-[13px] text-[#7b8390]" />}
      <span>{label}</span>
    </button>
  );
}

function BranchTreeRow({
  active,
  expanded,
  icon: Icon,
  label,
  markerIcon: MarkerIcon,
  nested,
  onClick,
  onContextMenu,
  onDoubleClick,
  selected
}: {
  active?: boolean;
  expanded?: boolean;
  icon: LucideIcon;
  label: string;
  markerIcon?: LucideIcon;
  nested?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      className={cn("flex h-7 w-full items-center gap-2 px-3 text-left hover:bg-[#f7f9ff]", nested && "pl-8", active && "font-semibold text-[#111827]", selected && "bg-[#dfe8ff]")}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      type="button"
    >
      {typeof expanded === "boolean" ? expanded ? <ChevronDown className="h-[12px] w-[12px] shrink-0 text-[#7b8390]" /> : <ChevronRight className="h-[12px] w-[12px] shrink-0 text-[#7b8390]" /> : null}
      <Icon className="h-[14px] w-[14px] shrink-0 text-[#7b8390]" />
      {MarkerIcon ? <MarkerIcon className="h-[12px] w-[12px] shrink-0 text-[#f59e0b]" /> : null}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function GitFilterMenu({
  label,
  onValueChange,
  options,
  value
}: {
  label: string;
  onValueChange: (value: string | null) => void;
  options: GitLogFilterOption[];
  value: string | null;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="relative">
      <button
        className={cn("flex h-7 max-w-[150px] items-center gap-1 rounded-md px-2 font-mono text-[11px] text-[#6b7280] hover:bg-[#f7f8fb]", value && "bg-[#edf3ff] text-[#184b8f]")}
        onClick={() => setOpen((previousOpen) => !previousOpen)}
        type="button"
      >
        <span className="truncate">{selectedOption && selectedOption.value !== null ? selectedOption.label : label}</span>
        <ChevronDown className={cn("h-[12px] w-[12px] shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute left-0 top-8 z-40 max-h-[260px] min-w-[190px] overflow-auto rounded-md border border-[#dfe1e5] bg-white p-1 shadow-[0_8px_22px_rgba(0,0,0,.14)]">
          {options.map((option) => (
            <button
              className={cn("flex h-7 w-full items-center gap-2 rounded px-2 text-left font-mono text-[11px] text-[#30343a] hover:bg-[#f7f9ff]", option.value === value && "bg-[#edf3ff] text-[#184b8f]")}
              key={`${label}-${option.value ?? "all"}`}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.value === value ? <Check className="h-[13px] w-[13px] shrink-0" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GitIconButton({
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
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#7b8390] hover:bg-[#f7f8fa] hover:text-[#30343a] disabled:pointer-events-none disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {loading ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Icon className="h-[14px] w-[14px]" />}
    </button>
  );
}

function normalizeLogPaneWidths(containerWidth: number, branchWidth: number, commitWidth: number): { branch: number; commit: number } {
  const handleSpace = 10;
  const minimumBranchWidth = 160;
  const minimumCommitWidth = 320;
  const minimumDetailsWidth = 300;
  const availableWidth = Math.max(0, containerWidth - handleSpace);
  const maximumBranchWidth = Math.max(minimumBranchWidth, availableWidth - minimumCommitWidth - minimumDetailsWidth);
  const branch = clampNumber(branchWidth, minimumBranchWidth, maximumBranchWidth);
  const maximumCommitWidth = Math.max(minimumCommitWidth, availableWidth - branch - minimumDetailsWidth);
  const commit = clampNumber(commitWidth, minimumCommitWidth, maximumCommitWidth);

  return { branch, commit };
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function getFloatingMenuPosition(x: number, y: number, width: number, height: number): { left: number; top: number } {
  if (typeof window === "undefined") return { left: x, top: y };
  const padding = 8;
  return {
    left: clampNumber(x, padding, Math.max(padding, window.innerWidth - width - padding)),
    top: clampNumber(y, padding, Math.max(padding, window.innerHeight - height - padding))
  };
}

function getFloatingMenuMaxHeight(preferredHeight: number): number {
  if (typeof window === "undefined") return preferredHeight;
  return Math.max(160, Math.min(preferredHeight, window.innerHeight - 16));
}

function isHeadCommit(commit: GitCommit): boolean {
  return commit.decorations.some((decoration) => decoration === "HEAD" || decoration.startsWith("HEAD ->") || decoration.includes("HEAD ->"));
}

function buildCommitFileTree(rootName: string, files: GitCommitChangedFile[]): CommitFileTreeNode {
  const root: CommitFileTreeNode = { children: [], file: null, fileCount: files.length, name: rootName, path: "root", type: "root" };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (const directoryName of parts.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${directoryName}` : directoryName;
      let directory = current.children.find((child) => child.type !== "file" && child.path === currentPath);
      if (!directory) {
        directory = { children: [], file: null, fileCount: 0, name: directoryName, path: currentPath, type: "directory" };
        current.children.push(directory);
      }
      directory.fileCount += 1;
      current = directory;
    }

    current.children.push({
      children: [],
      file,
      fileCount: 1,
      name: file.name || parts.at(-1) || file.path,
      path: file.path,
      type: "file"
    });
  }

  sortCommitFileTree(root);
  return root;
}

function sortCommitFileTree(node: CommitFileTreeNode): void {
  node.children.sort((left, right) => {
    if (left.type === "file" && right.type !== "file") return 1;
    if (left.type !== "file" && right.type === "file") return -1;
    return left.name.localeCompare(right.name);
  });
  node.children.forEach(sortCommitFileTree);
}

function createCommitFileFromPath(filePath: string): GitCommitChangedFile {
  const slashIndex = filePath.lastIndexOf("/");
  return {
    directory: slashIndex >= 0 ? filePath.slice(0, slashIndex) : "",
    kind: "modified",
    name: slashIndex >= 0 ? filePath.slice(slashIndex + 1) : filePath,
    oldPath: null,
    path: filePath,
    status: "M",
    statusText: "Modified"
  };
}

function filterFiles(files: GitChangedFile[], filter: string): GitChangedFile[] {
  const normalizedFilter = filter.trim().toLowerCase();
  if (!normalizedFilter) return files;
  return files.filter((file) => file.path.toLowerCase().includes(normalizedFilter));
}

function filterCommits(commits: GitCommit[], filter: string): GitCommit[] {
  const normalizedFilter = filter.trim().toLowerCase();
  if (!normalizedFilter) return commits;
  return commits.filter((commit) => {
    return (
      commit.hash.toLowerCase().includes(normalizedFilter) ||
      commit.shortHash.toLowerCase().includes(normalizedFilter) ||
      commit.subject.toLowerCase().includes(normalizedFilter) ||
      commit.author.toLowerCase().includes(normalizedFilter) ||
      commit.paths.some((filePath) => filePath.toLowerCase().includes(normalizedFilter)) ||
      commit.decorations.some((decoration) => decoration.toLowerCase().includes(normalizedFilter))
    );
  });
}

function buildLogFilterOptions(state: GitState, commits: GitCommit[], t: TFunction): GitLogFilterOptions {
  const authors = uniqueSorted(commits.map((commit) => commit.author).filter(Boolean));
  const branchNames = uniqueSorted(state.branches.map((branch) => branch.name));
  const paths = uniqueSorted([...state.files.map((file) => file.path), ...commits.flatMap((commit) => commit.paths)]);

  return {
    authors: [{ label: t("git.allUsers"), value: null }, ...authors.map((author) => ({ label: author, value: author }))],
    branches: [{ label: t("git.allBranches"), value: null }, ...branchNames.map((branch) => ({ label: branch, value: branch }))],
    paths: [{ label: t("git.allPaths"), value: null }, ...paths.map((filePath) => ({ label: filePath, value: filePath }))]
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

async function writeTextToClipboard(text: string): Promise<void> {
  const clipboardApi = window.agentConsole?.clipboard;
  if (clipboardApi) {
    await clipboardApi.writeText(text);
    return;
  }

  const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
  if (!writeText) {
    throw new Error("Clipboard write is not available in this runtime.");
  }

  await writeText(text);
}

function formatGitError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getFileColor(file: GitChangedFile): string {
  if (file.kind === "deleted" || file.kind === "conflicted" || file.untracked) return "text-[#b4234a]";
  if (file.kind === "added") return "text-[#0f8f55]";
  if (file.kind === "renamed" || file.kind === "copied") return "text-[#7c3aed]";
  return "text-[#0f56c5]";
}

function getCommitFileColor(file: GitCommitChangedFile): string {
  if (file.kind === "deleted" || file.kind === "conflicted") return "text-[#b4234a]";
  if (file.kind === "added") return "text-[#0f8f55]";
  if (file.kind === "renamed" || file.kind === "copied") return "text-[#7c3aed]";
  return "text-[#0f56c5]";
}

function getDecorationTags(decorations: string[]): string[] {
  return uniqueInOrder(
    decorations
      .map((decoration) => decoration.trim())
      .filter((decoration) => decoration.startsWith("tag: "))
      .map((decoration) => decoration.replace(/^tag:\s*/, ""))
  );
}

function getDecorationBranches(decorations: string[]): string[] {
  const branches: string[] = [];
  for (const decoration of decorations) {
    const trimmedDecoration = decoration.trim();
    if (!trimmedDecoration || trimmedDecoration.startsWith("tag: ")) continue;
    if (trimmedDecoration.includes(" -> ")) {
      branches.push(...trimmedDecoration.split(" -> ").map((branch) => branch.trim()));
    } else {
      branches.push(trimmedDecoration);
    }
  }
  return uniqueInOrder(branches.filter((branch) => !isRemoteHeadBranchName(branch)));
}

function isRemoteHeadBranchName(branch: string): boolean {
  return /^[^/]+\/HEAD$/.test(branch);
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function formatGraph(graph: string): string {
  const compactGraph = graph.replace(/\s+$/g, "");
  return compactGraph || "*";
}

function formatCommitDate(value: string, locale: "en" | "zh", t: TFunction): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const intlLocale = getIntlLocale(locale);

  const now = Date.now();
  const elapsed = now - date.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (elapsed >= 0 && elapsed < oneDay) {
    return date.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" });
  }
  if (elapsed >= 0 && elapsed < oneDay * 2) {
    return t("git.yesterdayAt", { time: date.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" }) });
  }
  return date.toLocaleDateString(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCommitDetailsDate(value: string, locale: "en" | "zh"): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const intlLocale = getIntlLocale(locale);
  const day = date.toLocaleDateString(intlLocale, { day: "numeric", month: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" });
  return locale === "zh" ? `${day} ${time}` : `${day} at ${time}`;
}

function getPathBaseName(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? "";
}

function groupRemoteBranches(branches: GitBranchItem[]): Record<string, GitBranchItem[]> {
  return branches.reduce<Record<string, GitBranchItem[]>>((groups, branch) => {
    const [remote] = branch.name.split("/");
    if (!groups[remote]) {
      groups[remote] = [];
    }
    groups[remote].push(branch);
    return groups;
  }, {});
}
