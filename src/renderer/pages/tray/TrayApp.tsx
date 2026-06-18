import {
  AppConfig, createSourceTabs, DEFAULT_TRAY_WIDGETS, defaultTrayWidgetVariant, emptySnapshots, formatCompactNumber, formatProviderName,
  formatUpdated, formatUsdCost, normalizeTrayIconPreference, normalizeTrayWidgets, ProviderAccountSnapshot, rangeLabel,
  SnapshotMap, SourceTab, TrayComponentVariants, TrayWidgetConfig, UsageComparisonRow, UsageStatsFilter, UsageTotals, useCallback, useEffect,
  useMemo, useState, useTrayText
} from "./shared";
import {
  AccountSummaryPanel, AnimatedUsageChart, ChartShell, ModelShareChart, RingMetrics,
  SourceGrid, StatsGrid, TokenMixPanel, TrayStatusStrip
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
  const [trayWidgets, setTrayWidgets] = useState<TrayWidgetConfig[]>(DEFAULT_TRAY_WIDGETS);

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
      setTrayIconPreference(normalizeTrayIconPreference(config.trayIcon));
      setTrayWidgets(normalizeTrayWidgets(config.trayWidgets, config.trayWindowModules, config.trayComponentVariants));
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
  const hasAnyVisibleModule = trayWidgets.length > 0;

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

        <section className="space-y-2">
          {trayWidgets.map((widget, index) => (
            <TrayRuntimeWidget
              accountSnapshots={accountSnapshots}
              activeStats={activeStats}
              index={index}
              key={`${widget.id}-${index}`}
              monthTotals={monthTotals}
              selectedProvider={selectedProvider}
              tabs={tabs}
              todayTotals={todayTotals}
              topModel={topModel}
              weekTotals={weekTotals}
              widget={widget}
              onSelectProvider={setSelectedProvider}
            />
          ))}
        </section>

        {loading ? <div className="mt-1.5 text-[11px] font-medium text-slate-200/60">{t("Syncing usage...")}</div> : null}

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

function TrayRuntimeWidget({
  accountSnapshots,
  activeStats,
  index,
  monthTotals,
  selectedProvider,
  tabs,
  todayTotals,
  topModel,
  weekTotals,
  widget,
  onSelectProvider
}: {
  accountSnapshots: ProviderAccountSnapshot[];
  activeStats: SnapshotMap["30d"];
  index: number;
  monthTotals: UsageTotals;
  selectedProvider?: string;
  tabs: SourceTab[];
  todayTotals: UsageTotals;
  topModel?: UsageComparisonRow;
  weekTotals: UsageTotals;
  widget: TrayWidgetConfig;
  onSelectProvider: (provider?: string) => void;
}) {
  const t = useTrayText();

  if (widget.type === "source-tabs") {
    return <SourceGrid selectedProvider={selectedProvider} tabs={tabs} onSelect={onSelectProvider} />;
  }

  if (widget.type === "header") {
    return (
      <div className="flex min-w-0 items-start justify-between gap-2 rounded-[8px] border border-white/10 bg-white/[.04] px-2.5 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-bold text-slate-50">{selectedProvider ? formatProviderName(selectedProvider) : t("Usage Overview")}</h1>
          <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{formatUpdated(activeStats.generatedAt, t)}</p>
        </div>
        <div className="shrink-0 rounded-md border border-white/10 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">{rangeLabel("30d", t)}</div>
      </div>
    );
  }

  if (widget.type === "account") {
    return <AccountSummaryPanel snapshots={accountSnapshots} variant={(widget.variant ?? defaultTrayWidgetVariant("account")) as TrayComponentVariants["account"]} />;
  }

  if (widget.type === "token-flow") {
    return (
      <ChartShell meta={topModel?.label ?? t("No model yet")} title={`${t("30d")} ${t("Token Flow")}`}>
        <AnimatedUsageChart chartId={`overview-flow-${index}`} series={activeStats.series} variant={(widget.variant ?? defaultTrayWidgetVariant("token-flow")) as TrayComponentVariants["tokenFlow"]} />
      </ChartShell>
    );
  }

  if (widget.type === "stats") {
    return (
      <StatsGrid
        items={[
          { label: t("Today tokens"), value: formatCompactNumber(todayTotals.totalTokens) },
          { label: `${t("7d")} ${t("tokens")}`, value: formatCompactNumber(weekTotals.totalTokens) },
          { label: `${t("30d")} ${t("tokens")}`, value: formatCompactNumber(monthTotals.totalTokens) },
          { label: t("Today req"), value: formatCompactNumber(todayTotals.requestCount) },
          { label: `${t("Today")} ${t("Cost")}`, value: formatUsdCost(todayTotals.costUsd) }
        ]}
        variant={(widget.variant ?? defaultTrayWidgetVariant("stats")) as TrayComponentVariants["stats"]}
      />
    );
  }

  if (widget.type === "token-mix") {
    return <TokenMixPanel totals={monthTotals} variant={(widget.variant ?? defaultTrayWidgetVariant("token-mix")) as TrayComponentVariants["tokenMix"]} />;
  }

  if (widget.type === "rings") {
    return <RingMetrics totals={monthTotals} variant={(widget.variant ?? defaultTrayWidgetVariant("rings")) as TrayComponentVariants["rings"]} />;
  }

  return <ModelShareChart rows={activeStats.models} variant={(widget.variant ?? defaultTrayWidgetVariant("model-share")) as TrayComponentVariants["modelShare"]} />;
}
