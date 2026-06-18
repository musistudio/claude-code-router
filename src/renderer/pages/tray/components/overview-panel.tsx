import {
  formatCompactNumber, formatUsdCost, ProviderAccountSnapshot, TrayComponentVariants, TrayWindowModuleId, UsageComparisonRow,
  UsageStatsSnapshot, UsageTotals, useTrayText
} from "../shared";
import { AccountSummaryPanel } from "./account-panel";
import { AnimatedUsageChart, ChartShell, ModelShareChart, RingMetrics, StatsGrid, TokenMixPanel } from "./widgets";

export function UsageOverviewPanel({
  activeStats,
  accountSnapshots,
  componentVariants,
  loading,
  modules,
  monthTotals,
  todayTotals,
  topModel,
  weekTotals
}: {
  activeStats: UsageStatsSnapshot;
  accountSnapshots: ProviderAccountSnapshot[];
  componentVariants: TrayComponentVariants;
  loading: boolean;
  modules: ReadonlySet<TrayWindowModuleId>;
  monthTotals: UsageTotals;
  todayTotals: UsageTotals;
  topModel?: UsageComparisonRow;
  weekTotals: UsageTotals;
}) {
  const t = useTrayText();
  const showTokenMix = modules.has("token-mix");
  const showRings = modules.has("rings");

  return (
    <section className="space-y-2">
      {modules.has("account") ? <AccountSummaryPanel snapshots={accountSnapshots} variant={componentVariants.account} /> : null}

      {modules.has("token-flow") ? (
      <ChartShell
        meta={topModel?.label ?? t("No model yet")}
        title={`${t("30d")} ${t("Token Flow")}`}
      >
        <AnimatedUsageChart chartId="overview-flow" series={activeStats.series} variant={componentVariants.tokenFlow} />
      </ChartShell>
      ) : null}

      {modules.has("stats") ? (
      <StatsGrid
        items={[
          { label: t("Today tokens"), value: formatCompactNumber(todayTotals.totalTokens) },
          { label: `${t("7d")} ${t("tokens")}`, value: formatCompactNumber(weekTotals.totalTokens) },
          { label: `${t("30d")} ${t("tokens")}`, value: formatCompactNumber(monthTotals.totalTokens) },
          { label: t("Today req"), value: formatCompactNumber(todayTotals.requestCount) },
          { label: `${t("Today")} ${t("Cost")}`, value: formatUsdCost(todayTotals.costUsd) }
        ]}
        variant={componentVariants.stats}
      />
      ) : null}

      {showTokenMix || showRings ? (
        <div className={`${showTokenMix && showRings ? "grid-cols-2" : "grid-cols-1"} grid gap-2`}>
          {showTokenMix ? <TokenMixPanel totals={monthTotals} variant={componentVariants.tokenMix} /> : null}
          {showRings ? <RingMetrics totals={monthTotals} variant={componentVariants.rings} /> : null}
        </div>
      ) : null}

      {modules.has("model-share") ? <ModelShareChart rows={activeStats.models} variant={componentVariants.modelShare} /> : null}

      {loading ? <div className="mt-1.5 text-[11px] font-medium text-slate-200/60">{t("Syncing usage...")}</div> : null}
    </section>
  );
}
