import {
  AppConfig, applyTrayThemePreference, createSourceTabs, DEFAULT_TRAY_WIDGETS, defaultTrayWidgetVariant, emptySnapshots, formatCompactNumber, formatProviderName,
  formatPercent, formatUpdated, formatUsdCost, normalizeTrayWidgets, ProviderAccountSnapshot, rangeLabel,
  SnapshotMap, SourceTab, TrayComponentVariants, TrayWidgetConfig, UsageComparisonRow, UsageStatsFilter, UsageStatsRange, UsageTotals, useCallback, useEffect,
  useMemo, useState, useTrayErrorText, useTrayText, useTrayThemePreference
} from "./shared";
import {
  AccountSummaryPanel, AnimatedUsageChart, ChartShell, ModelShareChart, RingMetrics,
  SourceGrid, StatsGrid, TokenActivityPanel, TokenMixPanel, TrayStatusStrip
} from "./components/index";
import { isGatewayProviderEnabled } from "@ccr/core/contracts/app";

type TrayHeaderRange = Exclude<UsageStatsRange, "today">;

const trayHeaderRanges: TrayHeaderRange[] = ["24h", "7d", "30d"];

export function TrayApp() {
  const t = useTrayText();
  const formatError = useTrayErrorText();
  useTrayThemePreference();
  const [allSnapshots, setAllSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [configuredProviders, setConfiguredProviders] = useState<AppConfig["Providers"]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [accountSnapshots, setAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const [accountRefreshing, setAccountRefreshing] = useState(false);
  const [trayWidgets, setTrayWidgets] = useState<TrayWidgetConfig[]>(DEFAULT_TRAY_WIDGETS);
  const [selectedRange, setSelectedRange] = useState<TrayHeaderRange>("30d");

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
      setConfiguredProviders(config.Providers.filter((provider) => isGatewayProviderEnabled(provider) && provider.name.trim()));
      setTrayWidgets(normalizeTrayWidgets(config.trayWidgets, config.trayWindowModules, config.trayComponentVariants));
      applyTrayThemePreference(config.theme);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setLoading(false);
    }
  }, [formatError, selectedProvider]);

  const refreshAccountSnapshots = useCallback(async () => {
    if (!window.ccr) {
      setAccountSnapshots([]);
      return;
    }

    setAccountRefreshing(true);
    setError("");
    try {
      const accounts = await window.ccr.getProviderAccountSnapshots(selectedProvider, { forceRefresh: true });
      setAccountSnapshots(accounts);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setAccountRefreshing(false);
    }
  }, [formatError, selectedProvider]);

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
  const activeStats = snapshots[selectedRange];
  const activeTotals = activeStats.totals;
  const topModel = activeStats.models[0];
  const hasProviderSwitcher = trayWidgets.some((widget) => widget.type === "source-tabs");
  const hasAnyVisibleModule = trayWidgets.length > 0;

  useEffect(() => {
    if (!hasProviderSwitcher && selectedProvider) {
      setSelectedProvider(undefined);
    }
  }, [hasProviderSwitcher, selectedProvider]);

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
      <aside className="tray-shell flex h-full min-h-0 flex-col overflow-y-auto p-3">
        <TrayStatusStrip totalTokens={activeTotals.totalTokens} />

        <section className="space-y-2">
          {trayWidgets.map((widget, index) => (
            <TrayRuntimeWidget
              accountSnapshots={accountSnapshots}
              accountRefreshing={accountRefreshing}
              activeStats={activeStats}
              activeTotals={activeTotals}
              index={index}
              key={`${widget.id}-${index}`}
              selectedRange={selectedRange}
              selectedProvider={selectedProvider}
              tabs={tabs}
              topModel={topModel}
              widget={widget}
              onChangeRange={setSelectedRange}
              onRefreshAccount={refreshAccountSnapshots}
              onSelectProvider={setSelectedProvider}
            />
          ))}
        </section>

        {loading ? <div className="mt-1.5 text-[11px] font-medium text-slate-300/55">{t("Syncing usage...")}</div> : null}

        {error ? <div className="mt-3 rounded-[12px] border border-rose-400/20 bg-rose-500/15 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}

        {!hasAnyVisibleModule && !error ? (
          <div className="tray-panel-subtle flex min-h-[260px] items-center justify-center px-4 text-center text-[12px] font-medium text-slate-400">
            {t("No tray modules enabled")}
          </div>
        ) : null}
      </aside>
    </main>
  );
}

function TrayRuntimeWidget({
  accountSnapshots,
  accountRefreshing,
  activeStats,
  activeTotals,
  index,
  selectedRange,
  selectedProvider,
  tabs,
  topModel,
  widget,
  onChangeRange,
  onRefreshAccount,
  onSelectProvider
}: {
  accountSnapshots: ProviderAccountSnapshot[];
  accountRefreshing: boolean;
  activeStats: SnapshotMap["30d"];
  activeTotals: UsageTotals;
  index: number;
  selectedRange: TrayHeaderRange;
  selectedProvider?: string;
  tabs: SourceTab[];
  topModel?: UsageComparisonRow;
  widget: TrayWidgetConfig;
  onChangeRange: (range: TrayHeaderRange) => void;
  onRefreshAccount: () => void | Promise<void>;
  onSelectProvider: (provider?: string) => void;
}) {
  const t = useTrayText();

  if (widget.type === "source-tabs") {
    return <SourceGrid selectedProvider={selectedProvider} tabs={tabs} onSelect={onSelectProvider} />;
  }

  if (widget.type === "header") {
    return (
      <div className="tray-panel flex min-w-0 items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-bold text-slate-50">{selectedProvider ? formatProviderName(selectedProvider) : t("Usage Overview")}</h1>
          <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{formatUpdated(activeStats.generatedAt, t)}</p>
        </div>
        <TrayHeaderRangeSwitch range={selectedRange} onChange={onChangeRange} />
      </div>
    );
  }

  if (widget.type === "account") {
    return <AccountSummaryPanel refreshing={accountRefreshing} snapshots={accountSnapshots} variant={(widget.variant ?? defaultTrayWidgetVariant("account")) as TrayComponentVariants["account"]} onRefresh={onRefreshAccount} />;
  }

  if (widget.type === "token-flow") {
    return (
      <ChartShell meta={topModel?.label ?? t("No model yet")} title={`${rangeLabel(selectedRange, t)} ${t("Token Flow")}`}>
        <AnimatedUsageChart chartId={`overview-flow-${index}`} series={activeStats.series} variant={(widget.variant ?? defaultTrayWidgetVariant("token-flow")) as TrayComponentVariants["tokenFlow"]} />
      </ChartShell>
    );
  }

  if (widget.type === "activity") {
    return <TokenActivityPanel series={activeStats.series} />;
  }

  if (widget.type === "stats") {
    return (
      <StatsGrid
        items={[
          { label: `${rangeLabel(selectedRange, t)} ${t("tokens")}`, value: formatCompactNumber(activeTotals.totalTokens) },
          { label: `${rangeLabel(selectedRange, t)} ${t("requests")}`, value: formatCompactNumber(activeTotals.requestCount) },
          { label: `${rangeLabel(selectedRange, t)} ${t("Cost")}`, value: formatUsdCost(activeTotals.costUsd) },
          { label: t("Success rate"), value: formatPercent(activeTotals.successRate) }
        ]}
        variant={(widget.variant ?? defaultTrayWidgetVariant("stats")) as TrayComponentVariants["stats"]}
      />
    );
  }

  if (widget.type === "token-mix") {
    return <TokenMixPanel totals={activeTotals} variant={(widget.variant ?? defaultTrayWidgetVariant("token-mix")) as TrayComponentVariants["tokenMix"]} />;
  }

  if (widget.type === "rings") {
    return <RingMetrics totals={activeTotals} variant={(widget.variant ?? defaultTrayWidgetVariant("rings")) as TrayComponentVariants["rings"]} />;
  }

  return <ModelShareChart rows={activeStats.models} variant={(widget.variant ?? defaultTrayWidgetVariant("model-share")) as TrayComponentVariants["modelShare"]} />;
}

function TrayHeaderRangeSwitch({
  range,
  onChange
}: {
  range: TrayHeaderRange;
  onChange: (range: TrayHeaderRange) => void;
}) {
  const t = useTrayText();

  return (
    <div className="tray-segmented flex shrink-0">
      {trayHeaderRanges.map((item) => (
        <button
          className="tray-segmented-item h-5 px-1.5 text-[10px] font-semibold"
          data-active={range === item}
          key={item}
          type="button"
          onClick={() => onChange(item)}
        >
          {rangeLabel(item, t)}
        </button>
      ))}
    </div>
  );
}
