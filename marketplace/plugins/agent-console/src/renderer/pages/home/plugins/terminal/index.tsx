import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FitAddon as FitAddonType } from "@xterm/addon-fit";
import type { ITheme, Terminal as XTermType } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { RightSidebarPluginPanelProps } from "../../right-sidebar-plugins";

const darkTerminalAnsiTheme = {
  black: "#1f2328",
  blue: "#7aa2f7",
  brightBlack: "#6f7379",
  brightBlue: "#9ab8ff",
  brightCyan: "#8bd5ca",
  brightGreen: "#9ece6a",
  brightMagenta: "#c099ff",
  brightRed: "#ff7b72",
  brightWhite: "#ffffff",
  brightYellow: "#ffd580",
  cyan: "#7dcfff",
  green: "#7bd88f",
  magenta: "#bb9af7",
  red: "#f7768e",
  white: "#d6deeb",
  yellow: "#e0af68"
} satisfies ITheme;

const lightTerminalAnsiTheme = {
  black: "#24292f",
  blue: "#0969da",
  brightBlack: "#6e7781",
  brightBlue: "#218bff",
  brightCyan: "#3192aa",
  brightGreen: "#1a7f37",
  brightMagenta: "#8250df",
  brightRed: "#cf222e",
  brightWhite: "#24292f",
  brightYellow: "#9a6700",
  cyan: "#1b7c83",
  green: "#116329",
  magenta: "#8250df",
  red: "#cf222e",
  white: "#6e7781",
  yellow: "#9a6700"
} satisfies ITheme;

function getThemeVariable(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function getTerminalTheme() {
  const styles = window.getComputedStyle(document.documentElement);
  const background = getThemeVariable(styles, "--card", "#ffffff");
  const foreground = getThemeVariable(styles, "--card-foreground", getThemeVariable(styles, "--foreground", "#2f2f2f"));
  const primary = getThemeVariable(styles, "--primary", "#007aff");
  const border = getThemeVariable(styles, "--border", "#d9d9d9");
  const darkTheme = isDarkColor(background) || styles.colorScheme.includes("dark");

  return {
    ...(darkTheme ? darkTerminalAnsiTheme : lightTerminalAnsiTheme),
    background,
    cursor: primary,
    cursorAccent: background,
    foreground,
    overviewRulerBorder: border,
    scrollbarSliderActiveBackground: darkTheme ? "rgba(214, 222, 235, 0.45)" : "rgba(47, 47, 47, 0.34)",
    scrollbarSliderBackground: darkTheme ? "rgba(214, 222, 235, 0.18)" : "rgba(47, 47, 47, 0.16)",
    scrollbarSliderHoverBackground: darkTheme ? "rgba(214, 222, 235, 0.32)" : "rgba(47, 47, 47, 0.26)",
    selectionBackground: darkTheme ? "rgba(59, 66, 82, 0.95)" : "rgba(15, 118, 110, 0.18)"
  } satisfies ITheme;
}

function isDarkColor(color: string) {
  const rgb = parseCssColor(color);
  if (!rgb) return false;

  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.45;
}

function parseCssColor(color: string) {
  const trimmedColor = color.trim();
  const hexMatch = trimmedColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1].length === 3 ? hexMatch[1].replace(/./g, (value) => value + value) : hexMatch[1];
    return [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  }

  const rgbMatch = trimmedColor.match(/^rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/i);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }

  return null;
}

function getTerminalDirectoryName(cwd: string) {
  const trimmedCwd = cwd.trim();
  const normalizedCwd = trimmedCwd.replace(/[\\/]+$/, "");
  const directoryName = normalizedCwd.split(/[\\/]/).filter(Boolean).pop();
  return directoryName || trimmedCwd || null;
}

function normalizeTerminalCwd(cwd: string | null | undefined) {
  const trimmedCwd = cwd?.trim();
  if (!trimmedCwd) return null;
  return trimmedCwd.replace(/[\\/]+$/, "") || trimmedCwd;
}

function formatTerminalSessionTitle(session: TerminalPanelSession) {
  const title = getTerminalDirectoryName(session.cwd) || session.title || session.shell.split(/[\\/]/).pop() || "terminal";
  return session.running ? title : `${title} (${session.exitCode ?? "done"})`;
}

export function TerminalPanel({ agentContext }: RightSidebarPluginPanelProps) {
  const { t } = useI18n();
  const terminalApi = window.agentConsole?.terminal;
  const workspaceCwd = agentContext?.project?.path || undefined;
  const normalizedWorkspaceCwd = useMemo(() => normalizeTerminalCwd(workspaceCwd), [workspaceCwd]);
  const terminalTabStripRef = useRef<HTMLDivElement>(null);
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTermType | null>(null);
  const fitAddonRef = useRef<FitAddonType | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const syncedWorkspaceCwdRef = useRef<string | null>(null);
  const previousSessionCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  const outputFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<TerminalPanelState>({ activeSessionId: null, sessions: [] });
  const activeSession = useMemo(() => state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0], [state]);

  const syncTerminalTheme = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getTerminalTheme();
    }
  }, []);

  const flushOutput = useCallback(() => {
    outputFrameRef.current = null;
    const pendingOutput = pendingOutputRef.current;
    if (!pendingOutput) return;

    pendingOutputRef.current = "";
    terminalRef.current?.write(pendingOutput);
  }, []);

  const queueOutput = useCallback(
    (output: string) => {
      pendingOutputRef.current += output;
      if (outputFrameRef.current === null) {
        outputFrameRef.current = window.requestAnimationFrame(flushOutput);
      }
    },
    [flushOutput]
  );

  const fitAndResize = useCallback(() => {
    resizeFrameRef.current = null;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const sessionId = activeSessionIdRef.current;
    if (!terminal || !fitAddon || !sessionId) return;

    fitAddon.fit();

    if (terminal.cols !== lastSizeRef.current.cols || terminal.rows !== lastSizeRef.current.rows) {
      lastSizeRef.current = { cols: terminal.cols, rows: terminal.rows };
      void terminalApi?.resize({ cols: terminal.cols, rows: terminal.rows, sessionId });
    }
  }, [terminalApi]);

  const scheduleFit = useCallback(() => {
    if (resizeFrameRef.current === null) {
      resizeFrameRef.current = window.requestAnimationFrame(fitAndResize);
    }
  }, [fitAndResize]);

  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id ?? null;
  }, [activeSession?.id]);

  useEffect(() => {
    const previousSessionCount = previousSessionCountRef.current;
    previousSessionCountRef.current = state.sessions.length;
    if (state.sessions.length <= previousSessionCount) return;

    const tabStrip = terminalTabStripRef.current;
    if (!tabStrip) return;

    const frameId = window.requestAnimationFrame(() => {
      tabStrip.scrollTo({ behavior: previousSessionCount === 0 ? "auto" : "smooth", left: tabStrip.scrollWidth });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [state.sessions.length]);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host) return;

    let disposed = false;
    let dataDisposable: { dispose: () => void } | null = null;
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(host);

    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([terminalModule, fitAddonModule]) => {
      if (disposed) return;

      const terminal = new terminalModule.Terminal({
        allowProposedApi: false,
        convertEol: false,
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily: 'Menlo, Monaco, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
        fontSize: 11,
        lineHeight: 1.35,
        scrollback: 8000,
        theme: getTerminalTheme()
      });
      const fitAddon = new fitAddonModule.FitAddon();

      terminal.loadAddon(fitAddon);
      terminal.open(host);
      terminal.focus();

      dataDisposable = terminal.onData((data) => {
        const sessionId = activeSessionIdRef.current;
        if (sessionId) {
          void terminalApi?.write({ data, sessionId });
        }
      });

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      scheduleFit();
    });

    return () => {
      disposed = true;
      if (outputFrameRef.current !== null) {
        window.cancelAnimationFrame(outputFrameRef.current);
      }
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeObserver.disconnect();
      dataDisposable?.dispose();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [scheduleFit, terminalApi]);

  useEffect(() => {
    syncTerminalTheme();

    const mutationObserver = new MutationObserver(syncTerminalTheme);
    mutationObserver.observe(document.documentElement, { attributeFilter: ["class", "data-theme", "style"], attributes: true });
    mutationObserver.observe(document.body, { attributeFilter: ["class", "data-theme", "style"], attributes: true });

    const colorSchemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    colorSchemeMedia.addEventListener("change", syncTerminalTheme);

    return () => {
      mutationObserver.disconnect();
      colorSchemeMedia.removeEventListener("change", syncTerminalTheme);
    };
  }, [syncTerminalTheme]);

  useEffect(() => {
    if (!terminalApi) return;

    let mounted = true;

    setLoaded(false);
    void terminalApi.getState({ cwd: workspaceCwd }).then((nextState) => {
      if (mounted) {
        setState(nextState);
        setLoaded(true);
      }
    });

    const unsubscribeState = terminalApi.onStateChange((nextState) => {
      setState(nextState);
    });
    const unsubscribeOutput = terminalApi.onOutput(({ data, sessionId }) => {
      if (sessionId === activeSessionIdRef.current) {
        queueOutput(data);
      }
    });

    return () => {
      mounted = false;
      unsubscribeState();
      unsubscribeOutput();
    };
  }, [queueOutput, terminalApi, workspaceCwd]);

  useEffect(() => {
    if (!normalizedWorkspaceCwd) {
      syncedWorkspaceCwdRef.current = null;
      return;
    }
    if (!terminalApi || !loaded || syncedWorkspaceCwdRef.current === normalizedWorkspaceCwd) return;

    syncedWorkspaceCwdRef.current = normalizedWorkspaceCwd;
    const matchingSession = state.sessions.find((session) => session.running && normalizeTerminalCwd(session.cwd) === normalizedWorkspaceCwd);
    if (matchingSession) {
      if (matchingSession.id !== state.activeSessionId) {
        void terminalApi.activateSession(matchingSession.id);
      }
      return;
    }

    const terminal = terminalRef.current;
    void terminalApi.createSession({ cols: terminal?.cols, cwd: workspaceCwd, rows: terminal?.rows });
  }, [loaded, normalizedWorkspaceCwd, state.activeSessionId, state.sessions, terminalApi, workspaceCwd]);

  useEffect(() => {
    const sessionId = activeSession?.id;
    if (!sessionId || !terminalApi || !terminalRef.current) return;

    terminalRef.current.clear();
    void terminalApi.getBacklog(sessionId).then((backlog) => {
      if (sessionId === activeSessionIdRef.current) {
        terminalRef.current?.write(backlog);
      }
    });
    scheduleFit();
  }, [activeSession?.id, scheduleFit, terminalApi]);

  const createSession = () => {
    const terminal = terminalRef.current;
    void terminalApi?.createSession({ cols: terminal?.cols, cwd: workspaceCwd, rows: terminal?.rows });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card text-card-foreground">
      <div className="flex h-9 min-h-9 max-h-9 min-w-0 items-center gap-1 overflow-hidden border-b border-border bg-muted px-1">
        <div ref={terminalTabStripRef} className="app-tab-strip flex h-7 min-h-7 max-h-7 min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto overflow-y-hidden">
          {state.sessions.map((session) => {
            const displayTitle = formatTerminalSessionTitle(session);

            return (
              <div
                className={cn(
                  "group flex h-7 min-h-7 max-h-7 min-w-[104px] max-w-[180px] shrink-0 items-center gap-1 rounded-md px-1",
                  session.id === activeSession?.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
                key={session.id}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-left text-[11px]"
                  onClick={() => terminalApi?.activateSession(session.id)}
                  title={`${displayTitle} - ${session.cwd}`}
                  type="button"
                >
                  {session.running ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7bd88f]" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{displayTitle}</span>
                </button>
                <button
                  aria-label={t("terminal.closeSession", { title: displayTitle })}
                  className="pointer-events-none grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                  onClick={() => terminalApi?.closeSession(session.id)}
                  type="button"
                >
                  <X className="h-[12px] w-[12px]" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          aria-label={t("terminal.newTerminal")}
          className="grid h-7 min-h-7 w-7 shrink-0 place-items-center self-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          onClick={createSession}
          type="button"
        >
          <Plus className="h-[14px] w-[14px]" />
        </button>
      </div>

      <div
        className="min-h-[260px] flex-1 bg-card p-2 text-card-foreground [&_.xterm-viewport]:!bg-card [&_.xterm]:h-full"
        onClick={() => terminalRef.current?.focus()}
        ref={terminalHostRef}
      >
        {!terminalApi ? <div className="grid h-full place-items-center text-[11px] text-muted-foreground">{t("terminal.unavailable")}</div> : null}
      </div>
    </div>
  );
}

type TerminalPanelSession = {
  cols: number;
  cwd: string;
  exitCode: number | null;
  id: string;
  rows: number;
  running: boolean;
  shell: string;
  title: string;
};

type TerminalPanelState = {
  activeSessionId: string | null;
  sessions: TerminalPanelSession[];
};
