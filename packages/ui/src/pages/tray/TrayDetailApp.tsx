import {
  applyTrayThemePreference, DEFAULT_TRAY_WIDGETS, emptySnapshots,
  normalizeTrayWidgets, ProviderAccountSnapshot, SnapshotMap, TrayWidgetConfig, UsageStatsFilter,
  UsageStatsRange, useCallback, useEffect, useState, useTrayErrorText, useTrayText, useTrayThemePreference
} from "./shared";
import {
  TrayStatusStrip, UsageDetailPanel
} from "./components/index";

export function TrayDetailApp({ provider }: { provider?: string }) {
  const t = useTrayText();
  const formatError = useTrayErrorText();
  useTrayThemePreference();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<UsageStatsRange>("30d");
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [accountSnapshots, setAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const [accountRefreshing, setAccountRefreshing] = useState(false);
  const [trayWidgets, setTrayWidgets] = useState<TrayWidgetConfig[]>(DEFAULT_TRAY_WIDGETS);

  const refresh = useCallback(async () => {
    if (!window.ccr) {
      setSnapshots(emptySnapshots);
      setAccountSnapshots([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const filter: UsageStatsFilter = provider ? { provider } : { includeProxy: true };
      const [today, day, week, month, config, accounts] = await Promise.all([
        window.ccr.getUsageStats("today", filter),
        window.ccr.getUsageStats("24h", filter),
        window.ccr.getUsageStats("7d", filter),
        window.ccr.getUsageStats("30d", filter),
        window.ccr.getConfig(),
        window.ccr.getProviderAccountSnapshots(provider)
      ]);
      setSnapshots({ today, "24h": day, "7d": week, "30d": month });
      setAccountSnapshots(accounts);
      setTrayWidgets(normalizeTrayWidgets(config.trayWidgets, config.trayWindowModules, config.trayComponentVariants));
      applyTrayThemePreference(config.theme);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setLoading(false);
    }
  }, [formatError, provider]);

  const refreshAccountSnapshots = useCallback(async () => {
    if (!window.ccr) {
      setAccountSnapshots([]);
      return;
    }

    setAccountRefreshing(true);
    setError("");
    try {
      const accounts = await window.ccr.getProviderAccountSnapshots(provider, { forceRefresh: true });
      setAccountSnapshots(accounts);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setAccountRefreshing(false);
    }
  }, [formatError, provider]);

  useEffect(() => {
    document.body.classList.add("tray-window");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void window.ccr?.closeTray();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("tray-window");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [provider]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  return (
    <main
      className="tray-shell h-screen w-screen overflow-y-auto p-3"
    >
      <TrayStatusStrip totalTokens={snapshots[range].totals.totalTokens} />
      <UsageDetailPanel activeStats={snapshots[range]} accountRefreshing={accountRefreshing} accountSnapshots={accountSnapshots} provider={provider} range={range} widgets={trayWidgets} onRefreshAccount={refreshAccountSnapshots} onRangeChange={setRange} />
      {loading ? <div className="mt-2 text-[11px] font-medium text-slate-300/55">{t("Syncing usage...")}</div> : null}
      {error ? <div className="mt-3 rounded-[12px] border border-rose-400/20 bg-rose-500/15 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}
    </main>
  );
}
