import {
  AppConfig, createSourceTabs, DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WINDOW_MODULES, emptySnapshots, formatProviderName,
  formatUpdated, normalizeTrayComponentVariants, normalizeTrayIconPreference, normalizeTrayWindowModules, ProviderAccountSnapshot, rangeLabel,
  SnapshotMap, TrayComponentVariants, TrayWindowModuleId, UsageStatsFilter, useCallback, useEffect,
  useMemo, useState, useTrayText
} from "./shared";
import {
  AccountSummaryPanel, AnimatedUsageChart, ChartShell, ModelShareChart, RadialMetric, RangeSwitch, RingMetrics,
  SourceGrid, StatsGrid, TokenMixPanel, TrayStatusStrip, UsageDetailPanel, UsageOverviewPanel
} from "./components";

export function TrayApp() {
  const t = useTrayText();
  const [allSnapshots, setAllSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [trayIconPreference, setTrayIconPreference] = useState<AppConfig["trayIcon"]>("random");
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [accountSnapshots, setAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const [trayComponentVariants, setTrayComponentVariants] = useState<TrayComponentVariants>(DEFAULT_TRAY_COMPONENT_VARIANTS);
  const [trayWindowModules, setTrayWindowModules] = useState<TrayWindowModuleId[]>(DEFAULT_TRAY_WINDOW_MODULES);

  const refresh = useCallback(async () => {
    if (!window.ccr) {
      setSnapshots(emptySnapshots);
      setAllSnapshots(emptySnapshots);
      setAccountSnapshots([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const filter: UsageStatsFilter = selectedProvider ? { provider: selectedProvider } : { includeProxy: true };
      const [today, day, week, month, allMonth, config, accounts] = await Promise.all([
        window.ccr.getUsageStats("today", filter),
        window.ccr.getUsageStats("24h", filter),
        window.ccr.getUsageStats("7d", filter),
        window.ccr.getUsageStats("30d", filter),
        selectedProvider ? window.ccr.getUsageStats("30d", { includeProxy: true }) : Promise.resolve(undefined),
        window.ccr.getConfig(),
        window.ccr.getProviderAccountSnapshots(selectedProvider)
      ]);

      setSnapshots({ today, "24h": day, "7d": week, "30d": month });
      setAllSnapshots((current) => ({ ...current, "30d": allMonth ?? month }));
      setAccountSnapshots(accounts);
      setConfiguredProviders(config.Providers.map((provider) => provider.name.trim()).filter(Boolean));
      setTrayComponentVariants(normalizeTrayComponentVariants(config.trayComponentVariants));
      setTrayIconPreference(normalizeTrayIconPreference(config.trayIcon));
      setTrayWindowModules(normalizeTrayWindowModules(config.trayWindowModules));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [selectedProvider]);

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
      void window.ccr?.setTrayDetailOpen(false);
    };
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  const tabs = useMemo(() => createSourceTabs(allSnapshots["30d"].models, configuredProviders), [allSnapshots, configuredProviders]);
  const activeStats = snapshots["30d"];
  const todayTotals = snapshots.today.totals;
  const weekTotals = snapshots["7d"].totals;
  const monthTotals = snapshots["30d"].totals;
  const topModel = snapshots["30d"].models[0];
  const visibleModules = useMemo(() => new Set(trayWindowModules), [trayWindowModules]);
  const hasOverviewModules = ["account", "token-flow", "stats", "token-mix", "rings", "model-share"].some((moduleId) => visibleModules.has(moduleId as TrayWindowModuleId));
  const hasAnyVisibleModule = hasOverviewModules || visibleModules.has("source-tabs") || visibleModules.has("header");

  useEffect(() => {
    if (!selectedProvider) {
      return;
    }
    const stillAvailable = tabs.some((tab) => tab.provider === selectedProvider);
    if (!stillAvailable) {
      setSelectedProvider(undefined);
    }
  }, [selectedProvider, tabs]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-transparent text-slate-100">
      <aside className="flex h-full min-h-0 flex-col overflow-y-auto rounded-[14px] border border-slate-950/15 bg-slate-950 p-3 text-slate-50 shadow-[0_18px_42px_rgba(15,23,42,.28)]">
        <TrayStatusStrip totalTokens={activeStats.totals.totalTokens} trayIconPreference={trayIconPreference} />

        {visibleModules.has("source-tabs") ? (
          <SourceGrid
            selectedProvider={selectedProvider}
            tabs={tabs}
            onSelect={(provider) => setSelectedProvider(provider)}
          />
        ) : null}

        {visibleModules.has("header") ? (
          <div className="mb-2 flex min-w-0 items-start justify-between gap-2 rounded-[8px] border border-white/10 bg-white/[.04] px-2.5 py-2">
            <div className="min-w-0">
              <h1 className="truncate text-[13px] font-bold text-slate-50">{selectedProvider ? formatProviderName(selectedProvider) : t("Usage Overview")}</h1>
              <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{formatUpdated(activeStats.generatedAt, t)}</p>
            </div>
            <div className="shrink-0 rounded-md border border-white/10 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">{rangeLabel("30d", t)}</div>
          </div>
        ) : null}

        {hasOverviewModules ? (
          <UsageOverviewPanel
            activeStats={activeStats}
            accountSnapshots={accountSnapshots}
            componentVariants={trayComponentVariants}
            loading={loading}
            modules={visibleModules}
            monthTotals={monthTotals}
            todayTotals={todayTotals}
            topModel={topModel}
            weekTotals={weekTotals}
          />
        ) : null}

        {error ? <div className="mt-3 rounded-lg border border-rose-400/24 bg-rose-500/18 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}

        {!hasAnyVisibleModule && !error ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[.03] px-4 text-center text-[12px] font-medium text-slate-400">
            {t("No tray modules enabled")}
          </div>
        ) : null}
      </aside>
    </main>
  );
}
