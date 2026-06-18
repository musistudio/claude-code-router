import {
  formatCompactNumber, formatDuration, formatPercent, formatProviderName, ProviderAccountSnapshot, rangeLabel,
  TrayComponentVariants, TrayWindowModuleId, UsageStatsRange, UsageStatsSnapshot, useTrayText
} from "../shared";
import { AccountSummaryPanel } from "./account-panel";
import { AnimatedUsageChart, ChartShell, ModelShareChart, RangeSwitch, RingMetrics, StatsGrid, TokenMixPanel } from "./widgets";

export function UsageDetailPanel({
  activeStats,
  accountSnapshots,
  componentVariants,
  modules,
  provider,
  range,
  onRangeChange
}: {
  activeStats: UsageStatsSnapshot;
  accountSnapshots: ProviderAccountSnapshot[];
  componentVariants: TrayComponentVariants;
  modules: ReadonlySet<TrayWindowModuleId>;
  provider?: string;
  range: UsageStatsRange;
  onRangeChange: (range: UsageStatsRange) => void;
}) {
  const t = useTrayText();
  const totals = activeStats.totals;
  const showTokenMix = modules.has("token-mix");
  const showRings = modules.has("rings");
  const hasDetailModule = modules.has("header") || modules.has("account") || modules.has("stats") || modules.has("token-flow") || showTokenMix || showRings || modules.has("model-share");

  return (
    <>
      {modules.has("header") ? (
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2 rounded-[8px] border border-white/10 bg-white/[.04] px-2.5 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-bold text-slate-50">{t("Usage Detail")}</h2>
          <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{rangeLabel(range, t)} - {provider ? formatProviderName(provider) : t("All providers")}</p>
        </div>
        <RangeSwitch range={range} onChange={onRangeChange} />
      </div>
      ) : null}

      {modules.has("stats") ? (
      <StatsGrid
        items={[
          { label: `${rangeLabel(range, t)} ${t("tokens")}`, value: formatCompactNumber(totals.totalTokens) },
          { label: `${rangeLabel(range, t)} ${t("requests")}`, value: formatCompactNumber(totals.requestCount) },
          { label: t("Avg latency"), value: formatDuration(totals.avgDurationMs) },
          { label: t("Success rate"), value: formatPercent(totals.successRate) }
        ]}
        variant={componentVariants.stats}
      />
      ) : null}

      {modules.has("account") ? <AccountSummaryPanel snapshots={accountSnapshots} variant={componentVariants.account} /> : null}

      <div className="space-y-2">
        {modules.has("token-flow") ? (
        <ChartShell meta={`${formatCompactNumber(totals.requestCount)} ${t("requests")}`} title={t("Token Flow")}>
          <AnimatedUsageChart chartId="detail-flow" series={activeStats.series} variant={componentVariants.tokenFlow} />
        </ChartShell>
        ) : null}

        {showTokenMix || showRings ? (
          <div className={`${showTokenMix && showRings ? "grid-cols-2" : "grid-cols-1"} grid gap-2`}>
            {showTokenMix ? <TokenMixPanel totals={totals} variant={componentVariants.tokenMix} /> : null}
            {showRings ? <RingMetrics totals={totals} variant={componentVariants.rings} /> : null}
          </div>
        ) : null}

        {modules.has("model-share") ? <ModelShareChart rows={activeStats.models} variant={componentVariants.modelShare} /> : null}
      </div>
      {!hasDetailModule ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[.03] px-4 text-center text-[12px] font-medium text-slate-400">
          {t("No tray modules enabled")}
        </div>
      ) : null}
    </>
  );
}
