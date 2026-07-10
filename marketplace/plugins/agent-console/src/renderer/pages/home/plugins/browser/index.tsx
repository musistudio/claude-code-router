import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleX,
  Download,
  EyeOff,
  Globe2,
  Info,
  Loader2,
  Plus,
  RefreshCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  X,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { useI18n, type TFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { RightSidebarPluginPanelProps } from "../../right-sidebar-plugins";

export function BrowserPanel({ nativeViewOccluded = false }: RightSidebarPluginPanelProps) {
  const { t } = useI18n();
  const browserApi = window.agentConsole?.browser;
  const browserTabStripRef = useRef<HTMLDivElement>(null);
  const previousBrowserTabCountRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<BrowserPanelState>(createDefaultBrowserPanelState);
  const activeTab = useMemo(() => state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0], [state]);
  const activeOrigin = useMemo(
    () => activeTab?.origin ? state.origins.find((origin) => origin.origin === activeTab.origin) ?? null : null,
    [activeTab?.origin, state.origins]
  );
  const [address, setAddress] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileCandidates, setProfileCandidates] = useState<BrowserProfileImportCandidate[]>([]);
  const [profileImportError, setProfileImportError] = useState<string | null>(null);
  const [importingProfileId, setImportingProfileId] = useState<string | null>(null);

  const syncBrowserTheme = useCallback(() => {
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    void browserApi?.setTheme(theme);
  }, [browserApi]);

  const syncBrowserBounds = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !browserApi) return;

    if (nativeViewOccluded) {
      void browserApi.setBounds({ height: 0, visible: false, width: 0, x: 0, y: 0 });
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const visible =
      rect.width >= 80 &&
      rect.height >= 80 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight;

    void browserApi.setBounds({
      height: Math.max(0, Math.round(rect.height)),
      visible,
      width: Math.max(0, Math.round(rect.width)),
      x: Math.round(rect.left),
      y: Math.round(rect.top)
    });
  }, [browserApi, nativeViewOccluded]);

  useEffect(() => {
    let mounted = true;

    void browserApi?.getState().then((nextState) => {
      if (mounted) {
        setState(nextState);
      }
    });

    const unsubscribe = browserApi?.onStateChange((nextState) => {
      setState(nextState);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [browserApi]);

  useEffect(() => {
    setAddress(activeTab?.url ?? "");
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    if (!browserApi) return undefined;

    syncBrowserTheme();

    const mutationObserver = new MutationObserver(syncBrowserTheme);
    mutationObserver.observe(document.documentElement, { attributeFilter: ["class", "data-theme", "style"], attributes: true });

    const colorSchemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    colorSchemeMedia.addEventListener("change", syncBrowserTheme);

    return () => {
      mutationObserver.disconnect();
      colorSchemeMedia.removeEventListener("change", syncBrowserTheme);
    };
  }, [browserApi, syncBrowserTheme]);

  useEffect(() => {
    const previousTabCount = previousBrowserTabCountRef.current;
    previousBrowserTabCountRef.current = state.tabs.length;
    if (state.tabs.length <= previousTabCount) return;

    const tabStrip = browserTabStripRef.current;
    if (!tabStrip) return;

    const frameId = window.requestAnimationFrame(() => {
      tabStrip.scrollTo({ behavior: previousTabCount === 0 ? "auto" : "smooth", left: tabStrip.scrollWidth });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [state.tabs.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !browserApi) return;

    syncBrowserBounds();

    const resizeObserver = new ResizeObserver(syncBrowserBounds);
    resizeObserver.observe(viewport);
    window.addEventListener("resize", syncBrowserBounds);
    document.addEventListener("scroll", syncBrowserBounds, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncBrowserBounds);
      document.removeEventListener("scroll", syncBrowserBounds, true);
      void browserApi.setBounds({ height: 0, visible: false, width: 0, x: 0, y: 0 });
    };
  }, [browserApi, syncBrowserBounds]);

  useEffect(() => {
    if (!settingsOpen || !browserApi) return;
    let mounted = true;

    void browserApi.listProfileImportCandidates()
      .then((candidates) => {
        if (mounted) {
          setProfileCandidates(candidates);
          setProfileImportError(null);
        }
      })
      .catch((error) => {
        if (mounted) {
          setProfileImportError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      mounted = false;
    };
  }, [browserApi, settingsOpen]);

  const createTab = () => {
    void browserApi?.createTab();
  };

  const navigate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeTab || !address.trim()) return;
    void browserApi?.navigate({ tabId: activeTab.id, url: address.trim() });
  };

  const dismissCoachmark = () => {
    void browserApi?.dismissCoachmark().then(setState);
  };

  const importProfile = (candidate: BrowserProfileImportCandidate) => {
    if (!browserApi) return;
    setImportingProfileId(candidate.id);
    setProfileImportError(null);
    void browserApi.importProfile({ candidateId: candidate.id })
      .then((result) => {
        setState(result.state);
        if (result.startPageUrl) {
          void browserApi.createTab(result.startPageUrl);
        }
      })
      .catch((error) => {
        setProfileImportError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setImportingProfileId(null));
  };

  const setOriginAutomationAllowed = (origin: string, allowed: boolean) => {
    void browserApi?.setOriginAutomationAllowed({ allowed, origin }).then(setState);
  };

  const toggleSetting = (key: keyof BrowserUseSettings) => {
    void browserApi?.updateSettings({ [key]: !state.settings[key] }).then(setState);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card text-card-foreground">
      <div ref={browserTabStripRef} className="app-tab-strip flex h-9 min-h-9 max-h-9 min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-2">
        {state.tabs.map((tab) => (
          <div
            className={cn(
              "group flex h-8 min-w-[128px] max-w-[180px] items-center gap-1 rounded-md border border-transparent px-1",
              tab.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            key={tab.id}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-left text-[11px]"
              onClick={() => browserApi?.activateTab(tab.id)}
              title={tab.title || tab.url}
              type="button"
            >
              <BrowserTabIcon tab={tab} />
              <span className="min-w-0 truncate">{formatTabTitle(tab, t)}</span>
            </button>
            <button
              aria-label={t("browser.closeTab", { title: formatTabTitle(tab, t) })}
              className="pointer-events-none grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
              onClick={() => browserApi?.closeTab(tab.id)}
              type="button"
            >
              <X className="h-[12px] w-[12px]" />
            </button>
          </div>
        ))}
        <button
          aria-label={t("browser.newTab")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={createTab}
          type="button"
        >
          <Plus className="h-[14px] w-[14px]" />
        </button>
      </div>

      <form className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2" onSubmit={navigate}>
        <BrowserIconButton disabled={!activeTab?.canGoBack} icon={ArrowLeft} label={t("browser.back")} onClick={() => browserApi?.goBack()} />
        <BrowserIconButton disabled={!activeTab?.canGoForward} icon={ArrowRight} label={t("browser.forward")} onClick={() => browserApi?.goForward()} />
        <BrowserIconButton
          icon={activeTab?.isLoading ? CircleX : RefreshCcw}
          label={activeTab?.isLoading ? t("browser.stopLoading") : t("browser.reload")}
          onClick={() => (activeTab?.isLoading ? browserApi?.stop() : browserApi?.reload())}
        />
        <Input
          aria-label={t("browser.addressAria")}
          className="h-8 flex-1 bg-secondary text-[11px]"
          onChange={(event) => setAddress(event.target.value)}
          placeholder={t("browser.placeholder")}
          value={address}
        />
        {activeTab?.origin && activeTab.originRisk !== "opaque" ? (
          <button
            className={cn(
              "flex h-7 max-w-[128px] shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px]",
              activeTab.automationAllowed ? "border-primary/25 bg-accent text-primary" : "border-destructive/25 bg-destructive/10 text-destructive"
            )}
            onClick={() => setSettingsOpen(true)}
            title={activeOrigin?.label ?? activeTab.origin}
            type="button"
          >
            {activeTab.automationAllowed ? <ShieldCheck className="h-[13px] w-[13px] shrink-0" /> : <ShieldAlert className="h-[13px] w-[13px] shrink-0" />}
            <span className="min-w-0 truncate">{activeOrigin?.label ?? activeTab.origin}</span>
          </button>
        ) : null}
        <BrowserIconButton
          icon={Settings}
          label={t("browser.settings")}
          onClick={() => setSettingsOpen((open) => !open)}
        />
      </form>

      {!state.settings.coachmarkDismissed ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-border bg-muted/45 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
          <Info className="mt-0.5 h-[13px] w-[13px] shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground">{t("browser.coachmarkTitle")}</div>
            <div>{t("browser.coachmarkBody")}</div>
          </div>
          <button
            aria-label={t("browser.dismissCoachmark")}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={dismissCoachmark}
            type="button"
          >
            <X className="h-[13px] w-[13px]" />
          </button>
        </div>
      ) : null}

      {settingsOpen ? (
        <BrowserSettingsPanel
          candidates={profileCandidates}
          importingProfileId={importingProfileId}
          onImportProfile={importProfile}
          onSetOriginAllowed={setOriginAutomationAllowed}
          onToggleSetting={toggleSetting}
          profileImportError={profileImportError}
          state={state}
          t={t}
        />
      ) : null}

      <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden bg-card" />
    </div>
  );
}

type BrowserUseSettings = {
  browserUseEnabled: boolean;
  coachmarkDismissed: boolean;
  hiddenHostEnabled: boolean;
  requireOriginApproval: boolean;
};

type BrowserOriginState = {
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

type BrowserImportedProfile = {
  bookmarkCount: number;
  browserName: string;
  id: string;
  importedAt: number;
  name: string;
  profilePath: string;
};

type BrowserProfileImportCandidate = {
  bookmarkCount: number;
  browserName: string;
  id: string;
  name: string;
  profilePath: string;
};

type BrowserPanelTab = {
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

type BrowserPanelState = {
  activeTabId: string | null;
  hiddenHostReady: boolean;
  importedProfiles: BrowserImportedProfile[];
  origins: BrowserOriginState[];
  settings: BrowserUseSettings;
  tabs: BrowserPanelTab[];
};

function createDefaultBrowserPanelState(): BrowserPanelState {
  return {
    activeTabId: null,
    hiddenHostReady: false,
    importedProfiles: [],
    origins: [],
    settings: {
      browserUseEnabled: true,
      coachmarkDismissed: false,
      hiddenHostEnabled: true,
      requireOriginApproval: false
    },
    tabs: []
  };
}

function BrowserSettingsPanel({
  candidates,
  importingProfileId,
  onImportProfile,
  onSetOriginAllowed,
  onToggleSetting,
  profileImportError,
  state,
  t
}: {
  candidates: BrowserProfileImportCandidate[];
  importingProfileId: string | null;
  onImportProfile: (candidate: BrowserProfileImportCandidate) => void;
  onSetOriginAllowed: (origin: string, allowed: boolean) => void;
  onToggleSetting: (key: keyof BrowserUseSettings) => void;
  profileImportError: string | null;
  state: BrowserPanelState;
  t: TFunction;
}) {
  const origins = state.origins.slice(0, 8);

  return (
    <div className="max-h-[320px] shrink-0 overflow-auto border-b border-border bg-card px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <BrowserSettingToggle
          checked={state.settings.browserUseEnabled}
          icon={ShieldCheck}
          label={t("browser.browserUseEnabled")}
          onClick={() => onToggleSetting("browserUseEnabled")}
        />
        <BrowserSettingToggle
          checked={state.settings.requireOriginApproval}
          icon={ShieldAlert}
          label={t("browser.requireOriginApproval")}
          onClick={() => onToggleSetting("requireOriginApproval")}
        />
        <BrowserSettingToggle
          checked={state.settings.hiddenHostEnabled}
          icon={EyeOff}
          label={t("browser.hiddenHost")}
          meta={state.hiddenHostReady ? t("browser.hiddenHostReady") : t("browser.hiddenHostStopped")}
          onClick={() => onToggleSetting("hiddenHostEnabled")}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-medium text-foreground">{t("browser.profileImportTitle")}</h3>
            <span className="text-[11px] text-muted-foreground">{state.importedProfiles.length}</span>
          </div>
          <div className="space-y-1.5">
            {candidates.length ? candidates.slice(0, 6).map((candidate) => (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5" key={candidate.id}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-foreground">{candidate.browserName} · {candidate.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{t("browser.importedProfileSummary", { count: candidate.bookmarkCount })}</div>
                </div>
                <button
                  aria-label={t("browser.importProfile")}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={Boolean(importingProfileId)}
                  onClick={() => onImportProfile(candidate)}
                  type="button"
                >
                  {importingProfileId === candidate.id ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Download className="h-[13px] w-[13px]" />}
                </button>
              </div>
            )) : (
              <div className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">{t("browser.profileImportEmpty")}</div>
            )}
            {profileImportError ? <div className="text-[11px] text-destructive">{profileImportError}</div> : null}
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-medium text-foreground">{t("browser.originState")}</h3>
            <span className="text-[11px] text-muted-foreground">{origins.length}</span>
          </div>
          <div className="space-y-1.5">
            {origins.length ? origins.map((origin) => (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5" key={origin.origin}>
                <OriginRiskIcon origin={origin} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-foreground">{origin.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{formatOriginRisk(origin.risk, t)} · {origin.visitCount}</div>
                </div>
                <button
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
                    origin.automationAllowed ? "border-primary/30 text-primary hover:bg-accent" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => onSetOriginAllowed(origin.origin, !origin.automationAllowed)}
                  title={origin.automationAllowed ? t("browser.originAllowed") : t("browser.originBlocked")}
                  type="button"
                >
                  {origin.automationAllowed ? <Check className="h-[13px] w-[13px]" /> : <ShieldAlert className="h-[13px] w-[13px]" />}
                </button>
              </div>
            )) : (
              <div className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">{t("browser.noOrigin")}</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function BrowserSettingToggle({
  checked,
  icon: Icon,
  label,
  meta,
  onClick
}: {
  checked: boolean;
  icon: LucideIcon;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 text-left",
        checked ? "border-primary/30 bg-accent text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-[14px] w-[14px] shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{label}</span>
        {meta ? <span className="block truncate text-[11px] opacity-75">{meta}</span> : null}
      </span>
    </button>
  );
}

function OriginRiskIcon({ origin }: { origin: BrowserOriginState }) {
  if (origin.automationAllowed) {
    return <ShieldCheck className="h-[14px] w-[14px] shrink-0 text-primary" />;
  }
  return <ShieldAlert className="h-[14px] w-[14px] shrink-0 text-destructive" />;
}

function BrowserTabIcon({ tab }: { tab: BrowserPanelTab }) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const showFavicon = Boolean(tab.favicon && failedIcon !== tab.favicon);

  useEffect(() => {
    setFailedIcon(null);
  }, [tab.favicon]);

  if (tab.isLoading) {
    return <Loader2 className="h-[13px] w-[13px] shrink-0 animate-spin" />;
  }

  if (showFavicon && tab.favicon) {
    return (
      <img
        alt=""
        className="h-[14px] w-[14px] shrink-0 rounded-[3px] object-contain"
        draggable={false}
        onError={() => setFailedIcon(tab.favicon)}
        src={tab.favicon}
      />
    );
  }

  return <Globe2 className="h-[13px] w-[13px] shrink-0" />;
}

function BrowserIconButton({
  disabled,
  icon: Icon,
  label,
  onClick
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-[14px] w-[14px]" />
    </button>
  );
}

function formatTabTitle(tab: BrowserPanelTab, t: TFunction) {
  if (tab.url === "about:blank") {
    return t("browser.blankPage");
  }
  if (tab.title && tab.title !== "New tab") {
    return tab.title;
  }
  return tab.url.replace(/^https?:\/\//, "") || t("browser.newTabTitle");
}

function formatOriginRisk(risk: BrowserOriginState["risk"], t: TFunction) {
  if (risk === "file") return t("browser.originFile");
  if (risk === "local") return t("browser.originLocal");
  if (risk === "opaque") return t("browser.originOpaque");
  return t("browser.originExternal");
}
