import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  Command,
  Cpu,
  Database,
  Gauge,
  Network,
  Power,
  Sparkles,
  Waves
} from "lucide-react";
import { DEFAULT_TRAY_WINDOW_MODULES, TRAY_WINDOW_MODULE_IDS } from "../../../shared/app";
import type {
  AppConfig,
  TrayWindowModuleId,
  UsageComparisonRow,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals
} from "../../../shared/app";

type SnapshotMap = Record<UsageStatsRange, UsageStatsSnapshot>;

type SourceTab = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  provider?: string;
};

const ranges: UsageStatsRange[] = ["today", "24h", "7d", "30d"];

const emptyTotals: UsageTotals = {
  avgDurationMs: 0,
  cacheRatio: 0,
  cacheTokens: 0,
  errorCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  requestCount: 0,
  successRate: 0,
  totalTokens: 0
};

const emptySnapshots: SnapshotMap = {
  today: createEmptySnapshot("today"),
  "24h": createEmptySnapshot("24h"),
  "7d": createEmptySnapshot("7d"),
  "30d": createEmptySnapshot("30d")
};

function TrayApp() {
  const [allSnapshots, setAllSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [trayWindowModules, setTrayWindowModules] = useState<TrayWindowModuleId[]>(DEFAULT_TRAY_WINDOW_MODULES);

  const refresh = useCallback(async () => {
    if (!window.ccr) {
      setSnapshots(emptySnapshots);
      setAllSnapshots(emptySnapshots);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const filter: UsageStatsFilter = selectedProvider ? { provider: selectedProvider } : { includeProxy: true };
      const [today, day, week, month, allMonth, config] = await Promise.all([
        window.ccr.getUsageStats("today", filter),
        window.ccr.getUsageStats("24h", filter),
        window.ccr.getUsageStats("7d", filter),
        window.ccr.getUsageStats("30d", filter),
        selectedProvider ? window.ccr.getUsageStats("30d", { includeProxy: true }) : Promise.resolve(undefined),
        window.ccr.getConfig()
      ]);

      setSnapshots({ today, "24h": day, "7d": week, "30d": month });
      setAllSnapshots((current) => ({ ...current, "30d": allMonth ?? month }));
      setConfiguredProviders(config.Providers.map((provider) => provider.name.trim()).filter(Boolean));
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
  const hasOverviewModules = ["token-flow", "stats", "token-mix", "rings"].some((moduleId) => visibleModules.has(moduleId as TrayWindowModuleId));
  const hasAnyVisibleModule = hasOverviewModules || visibleModules.has("source-tabs") || visibleModules.has("header") || visibleModules.has("footer");

  const openDetail = useCallback(() => {
    if (!hasOverviewModules) {
      return;
    }
    void window.ccr?.setTrayDetailOpen(true, selectedProvider);
    setDetailOpen(true);
  }, [hasOverviewModules, selectedProvider]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    void window.ccr?.setTrayDetailOpen(false);
  }, []);

  useEffect(() => {
    if (detailOpen) {
      void window.ccr?.setTrayDetailOpen(true, selectedProvider);
    }
  }, [detailOpen, selectedProvider]);

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
      <aside className="tray-glass-panel flex h-full min-h-0 flex-col overflow-y-auto rounded-[14px] px-4 py-3">
        {visibleModules.has("source-tabs") ? (
          <div className="mb-2.5">
            <SourceGrid
              selectedProvider={selectedProvider}
              tabs={tabs}
              onSelect={(provider) => setSelectedProvider(provider)}
            />
          </div>
        ) : null}

        {visibleModules.has("source-tabs") && (visibleModules.has("header") || hasOverviewModules) ? (
          <div className="mb-2 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        ) : null}

        {visibleModules.has("header") ? (
          <div className="mb-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-bold leading-tight tracking-tight text-slate-50">{selectedProvider ? formatProviderName(selectedProvider) : "Usage Overview"}</h1>
              <p className="mt-1 text-[12px] font-medium text-slate-300/72">{formatUpdated(activeStats.generatedAt)}</p>
            </div>
            <span className={`tray-live-pill ${loading ? "tray-live-pill--loading" : ""}`}>{loading ? "Syncing" : "Live"}</span>
          </div>
        ) : null}

        {hasOverviewModules ? (
          <div onMouseEnter={openDetail} onMouseLeave={closeDetail}>
            <UsageOverviewPanel
              activeStats={activeStats}
              loading={loading}
              modules={visibleModules}
              monthTotals={monthTotals}
              todayTotals={todayTotals}
              topModel={topModel}
              weekTotals={weekTotals}
            />
          </div>
        ) : null}

        {error ? <div className="mt-3 rounded-lg border border-rose-400/24 bg-rose-500/18 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}

        {!hasAnyVisibleModule && !error ? (
          <div className="mt-2 rounded-lg border border-white/8 bg-slate-950/24 px-3 py-8 text-center text-[12px] font-medium text-slate-300/70">
            No tray modules enabled
          </div>
        ) : null}

        {visibleModules.has("footer") ? <TrayFooter /> : null}
      </aside>
    </main>
  );
}

function TrayDetailApp({ provider }: { provider?: string }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<UsageStatsRange>("30d");
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [trayWindowModules, setTrayWindowModules] = useState<TrayWindowModuleId[]>(DEFAULT_TRAY_WINDOW_MODULES);

  const refresh = useCallback(async () => {
    if (!window.ccr) {
      setSnapshots(emptySnapshots);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const filter: UsageStatsFilter = provider ? { provider } : { includeProxy: true };
      const [today, day, week, month, config] = await Promise.all([
        window.ccr.getUsageStats("today", filter),
        window.ccr.getUsageStats("24h", filter),
        window.ccr.getUsageStats("7d", filter),
        window.ccr.getUsageStats("30d", filter),
        window.ccr.getConfig()
      ]);
      setSnapshots({ today, "24h": day, "7d": week, "30d": month });
      setTrayWindowModules(normalizeTrayWindowModules(config.trayWindowModules));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    document.body.classList.add("tray-window");
    void window.ccr?.setTrayDetailOpen(true, provider);
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
      className="tray-glass-panel h-screen w-screen overflow-y-auto rounded-[14px] px-4 py-3 text-slate-100"
      onMouseEnter={() => void window.ccr?.setTrayDetailOpen(true, provider)}
      onMouseLeave={() => void window.ccr?.setTrayDetailOpen(false)}
    >
      <UsageDetailPanel activeStats={snapshots[range]} modules={new Set(trayWindowModules)} provider={provider} range={range} onRangeChange={setRange} />
      {loading ? <div className="mt-2 text-[11px] font-medium text-slate-200/60">Syncing usage...</div> : null}
      {error ? <div className="mt-3 rounded-lg border border-rose-400/24 bg-rose-500/18 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}
    </main>
  );
}

function UsageDetailPanel({
  activeStats,
  modules,
  provider,
  range,
  onRangeChange
}: {
  activeStats: UsageStatsSnapshot;
  modules: ReadonlySet<TrayWindowModuleId>;
  provider?: string;
  range: UsageStatsRange;
  onRangeChange: (range: UsageStatsRange) => void;
}) {
  const totals = activeStats.totals;
  const showTokenMix = modules.has("token-mix");
  const showRings = modules.has("rings");
  const hasDetailModule = modules.has("header") || modules.has("stats") || modules.has("token-flow") || showTokenMix || showRings || modules.has("model-share");

  return (
    <>
      {modules.has("header") ? (
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight text-slate-50">Usage Detail</h2>
          <p className="mt-1 text-[12px] font-medium text-slate-300/72">{rangeLabel(range)} - {provider ? formatProviderName(provider) : "All providers"}</p>
        </div>
        <RangeSwitch range={range} onChange={onRangeChange} />
      </div>
      ) : null}

      {modules.has("stats") ? (
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <StatChip label={`${rangeLabel(range)} tokens`} value={formatCompactNumber(totals.totalTokens)} />
        <StatChip label={`${rangeLabel(range)} requests`} value={formatCompactNumber(totals.requestCount)} />
        <StatChip label="Avg latency" value={formatDuration(totals.avgDurationMs)} />
        <StatChip label="Success rate" value={formatPercent(totals.successRate)} />
      </div>
      ) : null}

      <div className="space-y-2.5">
        {modules.has("token-flow") ? (
        <ChartShell meta={`${formatCompactNumber(totals.requestCount)} requests`} title="Token Flow">
          <AnimatedUsageChart chartId="detail-flow" compact series={activeStats.series} />
        </ChartShell>
        ) : null}

        {showTokenMix || showRings ? (
          <div className={`${showTokenMix && showRings ? "grid-cols-2" : "grid-cols-1"} grid gap-2`}>
            {showTokenMix ? <TokenMixPanel totals={totals} /> : null}
            {showRings ? <RingMetrics totals={totals} /> : null}
          </div>
        ) : null}

        {modules.has("model-share") ? <ModelShareChart rows={activeStats.models} /> : null}
      </div>
      {!hasDetailModule ? (
        <div className="rounded-[8px] border border-white/6 bg-slate-950/22 px-3 py-8 text-center text-[12px] font-medium text-slate-300/70">
          No tray modules enabled
        </div>
      ) : null}
    </>
  );
}

function SourceGrid({
  selectedProvider,
  tabs,
  onSelect
}: {
  selectedProvider?: string;
  tabs: SourceTab[];
  onSelect: (provider?: string) => void;
}) {
  return (
    <div className="grid min-w-0 flex-1 grid-cols-4 gap-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.provider === selectedProvider || (!tab.provider && !selectedProvider);
        return (
          <button
            className={[
              "flex h-[48px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border text-[11px] font-bold",
              active
                ? "border-teal-200/24 bg-teal-400/18 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.22),0_10px_24px_rgba(20,184,166,.22)]"
                : "border-white/8 text-slate-300/74 hover:border-white/14 hover:bg-white/8 hover:text-slate-50"
            ].join(" ")}
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.provider)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="max-w-full truncate px-1">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function UsageOverviewPanel({
  activeStats,
  loading,
  modules,
  monthTotals,
  todayTotals,
  topModel,
  weekTotals
}: {
  activeStats: UsageStatsSnapshot;
  loading: boolean;
  modules: ReadonlySet<TrayWindowModuleId>;
  monthTotals: UsageTotals;
  todayTotals: UsageTotals;
  topModel?: UsageComparisonRow;
  weekTotals: UsageTotals;
}) {
  const showTokenMix = modules.has("token-mix");
  const showRings = modules.has("rings");

  return (
    <section className="space-y-2.5">
      {modules.has("token-flow") ? (
      <ChartShell
        meta={topModel?.label ?? "No model yet"}
        title="30d Token Flow"
      >
        <AnimatedUsageChart chartId="overview-flow" series={activeStats.series} />
      </ChartShell>
      ) : null}

      {modules.has("stats") ? (
      <div className="grid grid-cols-2 gap-2">
        <StatChip label="Today tokens" value={formatCompactNumber(todayTotals.totalTokens)} />
        <StatChip label="7d tokens" value={formatCompactNumber(weekTotals.totalTokens)} />
        <StatChip label="30d tokens" value={formatCompactNumber(monthTotals.totalTokens)} />
        <StatChip label="Today req" value={formatCompactNumber(todayTotals.requestCount)} />
      </div>
      ) : null}

      {showTokenMix || showRings ? (
        <div className={`${showTokenMix && showRings ? "grid-cols-2" : "grid-cols-1"} grid gap-2`}>
          {showTokenMix ? <TokenMixPanel totals={monthTotals} /> : null}
          {showRings ? <RingMetrics totals={monthTotals} /> : null}
        </div>
      ) : null}

      {loading ? <div className="mt-1.5 text-[11px] font-medium text-slate-200/60">Syncing usage...</div> : null}
    </section>
  );
}

function TrayFooter() {
  return (
    <div className="mt-2.5 shrink-0 border-t border-white/10 pt-1.5">
      <div className="space-y-1 text-[14px] font-medium">
        <ActionButton icon={Power} label="Quit" meta="Cmd+Q" onClick={() => void window.ccr?.quitApp()} />
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  meta,
  onClick
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      className="group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-slate-100/90 hover:bg-white/10 hover:text-slate-50"
      type="button"
      onClick={onClick}
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-slate-300/80 group-hover:text-slate-100" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="shrink-0 text-[12px] font-semibold text-slate-400/72 group-hover:text-slate-200">{meta}</span> : null}
    </button>
  );
}

function RangeSwitch({ range, onChange }: { range: UsageStatsRange; onChange: (range: UsageStatsRange) => void }) {
  return (
    <div className="flex rounded-lg border border-white/8 bg-slate-900/28 p-0.5">
      {ranges.map((item) => (
        <button
          className={`h-7 rounded-[7px] px-2.5 text-[11px] font-bold ${range === item ? "bg-white/14 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,.18)]" : "text-slate-300/72 hover:text-slate-100"}`}
          key={item}
          type="button"
          onClick={() => onChange(item)}
        >
          {rangeLabel(item)}
        </button>
      ))}
    </div>
  );
}

function ChartShell({ children, meta, title }: { children: ReactNode; meta?: string; title: string }) {
  return (
    <div className="tray-chart-panel relative min-w-0 overflow-hidden rounded-[8px] border border-white/10 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_14px_34px_rgba(0,0,0,.18)]">
      <div className="tray-chart-scan" />
      <div className="relative z-10 mb-2 flex min-w-0 items-center justify-between gap-2">
        <h3 className="truncate text-[13px] font-bold tracking-tight text-slate-50">{title}</h3>
        {meta ? <span className="min-w-0 truncate rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-slate-300/80">{meta}</span> : null}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="tray-metric-sheen min-w-0 rounded-[8px] border border-white/8 bg-slate-950/24 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
      <div className="truncate text-[11px] font-semibold text-slate-400">{label}</div>
      <div className="mt-1 truncate text-[16px] font-bold tracking-tight text-slate-50">{value}</div>
    </div>
  );
}

function AnimatedUsageChart({
  chartId,
  compact = false,
  series
}: {
  chartId: string;
  compact?: boolean;
  series: UsageStatsSnapshot["series"];
}) {
  const tokenGeometry = buildChartGeometry(series, (point) => point.totalTokens);
  const cacheGeometry = buildChartGeometry(series, (point) => point.cacheTokens);
  const chartHeightClass = compact ? "h-[118px]" : "h-[146px]";

  return (
    <div className="min-w-0">
      <svg className={`w-full ${chartHeightClass}`} preserveAspectRatio="none" role="img" viewBox="0 0 320 148" aria-label="Usage chart">
        <defs>
          <linearGradient id={`${chartId}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(45,212,191,.46)" />
            <stop offset="58%" stopColor="rgba(45,212,191,.16)" />
            <stop offset="100%" stopColor="rgba(45,212,191,0)" />
          </linearGradient>
          <filter id={`${chartId}-glow`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[36, 64, 92, 120].map((y) => (
          <line key={y} x1="10" x2="310" y1={y} y2={y} stroke="rgba(226,232,240,.13)" strokeDasharray="3 7" />
        ))}
        <path d={tokenGeometry.areaPath} fill={`url(#${chartId}-area)`} />
        <path className="tray-line-draw" d={tokenGeometry.linePath} fill="none" filter={`url(#${chartId}-glow)`} stroke="rgba(45,212,191,.94)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" vectorEffect="non-scaling-stroke" />
        <path className="tray-line-draw" d={cacheGeometry.linePath} fill="none" stroke="rgba(167,139,250,.78)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        <text fill="rgba(203,213,225,.62)" fontSize="10.5" fontWeight="600" x="10" y="144">{series[0]?.label ?? ""}</text>
        <text fill="rgba(203,213,225,.62)" fontSize="10.5" fontWeight="600" textAnchor="end" x="310" y="144">{series[series.length - 1]?.label ?? ""}</text>
      </svg>
      <div className="mt-1 flex min-w-0 items-center gap-3 text-[11.5px] font-medium text-slate-300/78">
        <LegendDot className="bg-teal-300" label="Tokens" />
        <LegendDot className="bg-violet-300" label="Cache" />
      </div>
    </div>
  );
}

function TokenMixPanel({ totals }: { totals: UsageTotals }) {
  const rows = [
    { color: "from-cyan-300 to-teal-300", label: "Input", value: totals.inputTokens },
    { color: "from-amber-300 to-rose-300", label: "Output", value: totals.outputTokens },
    { color: "from-violet-300 to-fuchsia-300", label: "Cache", value: totals.cacheTokens }
  ];
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="min-w-0 rounded-[8px] border border-white/8 bg-slate-950/24 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="truncate text-[12px] font-bold text-slate-100">Token Mix</h3>
        <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatCompactNumber(totals.totalTokens)}</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((row, index) => {
          const percent = row.value > 0 ? Math.max(4, (row.value / max) * 100) : 2;
          return (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold">
                <span className="truncate text-slate-300">{row.label}</span>
                <span className="shrink-0 text-slate-400">{formatCompactNumber(row.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${row.color} shadow-[0_0_10px_rgba(45,212,191,.18)]`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RingMetrics({ totals }: { totals: UsageTotals }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 rounded-[8px] border border-white/8 bg-slate-950/24 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <RingMetric label="Success" value={totals.successRate} />
      <RingMetric label="Cache" value={totals.cacheRatio} />
      <div className="col-span-2 grid grid-cols-2 gap-2 border-t border-white/8 pt-2">
        <MiniMetric label="Req" value={formatCompactNumber(totals.requestCount)} />
        <MiniMetric label="Latency" value={formatDuration(totals.avgDurationMs)} />
      </div>
    </div>
  );
}

function RingMetric({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  const gradientId = `ring-gradient-${label.toLowerCase()}`;
  return (
    <div className="min-w-0 text-center">
      <svg className="mx-auto h-[54px] w-[54px] -rotate-90 overflow-visible" viewBox="0 0 42 42" role="img" aria-label={`${label} ${formatPercent(clamped)}`}>
        <circle cx="21" cy="21" fill="none" r="17" stroke="rgba(255,255,255,.10)" strokeWidth="4" />
        <circle
          cx="21"
          cy="21"
          fill="none"
          pathLength="100"
          r="17"
          stroke={`url(#${gradientId})`}
          strokeDasharray={`${clamped * 100} 100`}
          strokeLinecap="round"
          strokeWidth="4"
        />
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(45,212,191)" />
            <stop offset="100%" stopColor="rgb(251,191,36)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="mt-1 truncate text-[11px] font-semibold text-slate-400">{label}</div>
      <div className="truncate text-[13px] font-bold text-slate-50">{formatPercent(clamped)}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-[12px] font-bold text-slate-100">{value}</div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function ModelShareChart({ rows }: { rows: UsageComparisonRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[8px] border border-white/6 bg-slate-950/22 px-3 py-8 text-center text-[12px] font-medium text-slate-300/70">
        No usage captured yet
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-white/8 bg-slate-950/24 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-bold tracking-tight text-slate-100">Model Share</h3>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-slate-300">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.slice(0, 4).map((row, index) => (
          <div key={row.key}>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-slate-100">{row.label}</div>
                <div className="mt-0.5 truncate text-[10.5px] font-medium text-slate-400">{row.caption}</div>
              </div>
              <div className="shrink-0 text-right text-[12px] font-bold tracking-tight text-slate-200">{formatCompactNumber(row.totalTokens)}</div>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-300 via-amber-300 to-rose-300 shadow-[0_0_8px_rgba(251,191,36,.22)]"
                style={{ width: `${Math.max(3, row.maxShare * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function createSourceTabs(rows: UsageComparisonRow[], configuredProviders: string[]): SourceTab[] {
  const providers = new Map<string, { index: number; score: number }>();
  configuredProviders.forEach((provider, index) => {
    providers.set(provider, { index, score: 0 });
  });

  for (const row of rows) {
    const provider = row.provider?.trim();
    if (!provider) {
      continue;
    }
    const current = providers.get(provider) ?? { index: providers.size, score: 0 };
    providers.set(provider, {
      index: current.index,
      score: current.score + row.totalTokens + row.requestCount
    });
  }

  const providerTabs = Array.from(providers.entries())
    .sort((a, b) => b[1].score - a[1].score || a[1].index - b[1].index)
    .slice(0, 7)
    .map(([provider]) => ({
      id: `provider:${provider}`,
      icon: iconForProvider(provider),
      label: formatProviderName(provider),
      provider
    }));

  return [
    {
      id: "overview",
      icon: Gauge,
      label: "Overview"
    },
    ...providerTabs
  ];
}

function iconForProvider(provider: string): ComponentType<{ className?: string }> {
  const normalized = provider.toLowerCase();
  if (normalized.includes("claude") || normalized.includes("anthropic")) {
    return Sparkles;
  }
  if (normalized.includes("openai") || normalized.includes("codex")) {
    return Bot;
  }
  if (normalized.includes("proxy")) {
    return Network;
  }
  if (normalized.includes("gemini") || normalized.includes("google")) {
    return Waves;
  }
  if (normalized.includes("deepseek") || normalized.includes("z.ai")) {
    return Cpu;
  }
  if (normalized.includes("cache")) {
    return Database;
  }
  return Command;
}

function normalizeTrayWindowModules(value: AppConfig["trayWindowModules"] | undefined): TrayWindowModuleId[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TRAY_WINDOW_MODULES;
  }
  const allowed = new Set<string>(TRAY_WINDOW_MODULE_IDS);
  const result: TrayWindowModuleId[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!allowed.has(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

function createEmptySnapshot(range: UsageStatsRange): UsageStatsSnapshot {
  return {
    clientModels: [],
    generatedAt: new Date().toISOString(),
    models: [],
    providerModels: [],
    range,
    recentRequests: [],
    series: createEmptySeries(range),
    totals: { ...emptyTotals }
  };
}

function createEmptySeries(range: UsageStatsRange): UsageStatsSnapshot["series"] {
  const now = new Date();
  const count = range === "today" ? now.getHours() + 1 : range === "24h" ? 24 : range === "7d" ? 7 : 30;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    if (range === "today") {
      date.setHours(index, 0, 0, 0);
    } else if (range === "24h") {
      date.setHours(now.getHours() - (count - 1 - index), 0, 0, 0);
    } else {
      date.setDate(now.getDate() - (count - 1 - index));
      date.setHours(0, 0, 0, 0);
    }
    return {
      ...emptyTotals,
      bucket: date.toISOString(),
      label: range === "today" || range === "24h" ? `${String(date.getHours()).padStart(2, "0")}:00` : `${date.getMonth() + 1}/${date.getDate()}`
    };
  });
}

function buildChartGeometry(
  series: UsageStatsSnapshot["series"],
  readValue: (point: UsageStatsSnapshot["series"][number]) => number
): { areaPath: string; linePath: string } {
  if (series.length === 0) {
    return { areaPath: "", linePath: "" };
  }

  const left = 10;
  const right = 310;
  const top = 16;
  const bottom = 126;
  const max = Math.max(...series.map((point) => readValue(point)), 1);
  const points = series.map((point, index) => {
    const x = series.length <= 1 ? (left + right) / 2 : left + (index / (series.length - 1)) * (right - left);
    const y = bottom - (Math.max(0, readValue(point)) / max) * (bottom - top);
    return { x, y };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${bottom} L ${first.x.toFixed(2)} ${bottom} Z`;

  return { areaPath, linePath };
}

function formatProviderName(provider: string): string {
  return provider
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bApi\b/g, "API")
    .replace(/\bOpenai\b/g, "OpenAI")
    .slice(0, 18);
}

function formatUpdated(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "Updated just now";
  }
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return "Updated just now";
  }
  if (seconds < 3600) {
    return `Updated ${Math.round(seconds / 60)}m ago`;
  }
  return `Updated ${Math.round(seconds / 3600)}h ago`;
}

function rangeLabel(range: UsageStatsRange): string {
  if (range === "today") {
    return "Today";
  }
  return range;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard"
  }).format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatDuration(value: number): string {
  const milliseconds = Math.max(0, Number.isFinite(value) ? value : 0);
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }
  const seconds = milliseconds / 1000;
  return `${seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(1)}s`;
}

const trayParams = new URLSearchParams(window.location.search);
const trayMode = trayParams.get("mode");
const trayProvider = trayParams.get("provider")?.trim() || undefined;

createRoot(document.getElementById("root") as HTMLElement).render(
  trayMode === "detail" ? <TrayDetailApp provider={trayProvider} /> : <TrayApp />
);
