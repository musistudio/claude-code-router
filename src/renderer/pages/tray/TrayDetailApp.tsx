import {
  AppConfig, DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WINDOW_MODULES, emptySnapshots, normalizeTrayComponentVariants, normalizeTrayIconPreference,
  normalizeTrayWindowModules, ProviderAccountSnapshot, SnapshotMap, TrayComponentVariants, TrayWindowModuleId, UsageStatsFilter,
  UsageStatsRange, useCallback, useEffect, useState, useTrayText
} from "./shared";
import {
  AccountSummaryPanel, AnimatedUsageChart, ChartShell, ModelShareChart, RadialMetric, RangeSwitch, RingMetrics,
  SourceGrid, StatsGrid, TokenMixPanel, TrayStatusStrip, UsageDetailPanel, UsageOverviewPanel
} from "./components";

export function TrayDetailApp({ provider }: { provider?: string }) {
  const t = useTrayText();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<UsageStatsRange>("30d");
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [accountSnapshots, setAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const [trayComponentVariants, setTrayComponentVariants] = useState<TrayComponentVariants>(DEFAULT_TRAY_COMPONENT_VARIANTS);
  const [trayIconPreference, setTrayIconPreference] = useState<AppConfig["trayIcon"]>("random");
  const [trayWindowModules, setTrayWindowModules] = useState<TrayWindowModuleId[]>(DEFAULT_TRAY_WINDOW_MODULES);

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
      setTrayComponentVariants(normalizeTrayComponentVariants(config.trayComponentVariants));
      setTrayIconPreference(normalizeTrayIconPreference(config.trayIcon));
      setTrayWindowModules(normalizeTrayWindowModules(config.trayWindowModules));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [provider]);

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
      className="h-screen w-screen overflow-y-auto rounded-[14px] border border-slate-950/15 bg-slate-950 p-3 text-slate-100 shadow-[0_18px_42px_rgba(15,23,42,.28)]"
    >
      <TrayStatusStrip totalTokens={snapshots[range].totals.totalTokens} trayIconPreference={trayIconPreference} />
      <UsageDetailPanel activeStats={snapshots[range]} accountSnapshots={accountSnapshots} componentVariants={trayComponentVariants} modules={new Set(trayWindowModules)} provider={provider} range={range} onRangeChange={setRange} />
      {loading ? <div className="mt-2 text-[11px] font-medium text-slate-200/60">{t("Syncing usage...")}</div> : null}
      {error ? <div className="mt-3 rounded-lg border border-rose-400/24 bg-rose-500/18 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}
    </main>
  );
}
