import {
  defaultTrayWidgetVariant, formatCompactNumber, formatDuration, formatPercent, formatProviderName, ProviderAccountSnapshot, rangeLabel,
  TrayComponentVariants, TrayWidgetConfig, UsageStatsRange, UsageStatsSnapshot, useTrayText
} from "../shared";
import { AccountSummaryPanel } from "./account-panel";
import { AnimatedUsageChart, ChartShell, ModelShareChart, RangeSwitch, RingMetrics, StatsGrid, TokenMixPanel } from "./widgets";

export function UsageDetailPanel({
  activeStats,
  accountSnapshots,
  provider,
  range,
  widgets,
  onRangeChange
}: {
  activeStats: UsageStatsSnapshot;
  accountSnapshots: ProviderAccountSnapshot[];
  provider?: string;
  range: UsageStatsRange;
  widgets: TrayWidgetConfig[];
  onRangeChange: (range: UsageStatsRange) => void;
}) {
  const t = useTrayText();
  const totals = activeStats.totals;
  const hasDetailModule = widgets.some((widget) => widget.type !== "source-tabs");

  return (
    <>
      <div className="space-y-2">
        {widgets.map((widget, index) => {
          if (widget.type === "source-tabs") {
            return null;
          }
          if (widget.type === "header") {
            return (
              <div className="flex min-w-0 items-start justify-between gap-2 rounded-[8px] border border-white/10 bg-white/[.04] px-2.5 py-2" key={`${widget.id}-${index}`}>
                <div className="min-w-0">
                  <h2 className="truncate text-[13px] font-bold text-slate-50">{t("Usage Detail")}</h2>
                  <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{rangeLabel(range, t)} - {provider ? formatProviderName(provider) : t("All providers")}</p>
                </div>
                <RangeSwitch range={range} onChange={onRangeChange} />
              </div>
            );
          }
          if (widget.type === "stats") {
            return (
              <StatsGrid
                items={[
                  { label: `${rangeLabel(range, t)} ${t("tokens")}`, value: formatCompactNumber(totals.totalTokens) },
                  { label: `${rangeLabel(range, t)} ${t("requests")}`, value: formatCompactNumber(totals.requestCount) },
                  { label: t("Avg latency"), value: formatDuration(totals.avgDurationMs) },
                  { label: t("Success rate"), value: formatPercent(totals.successRate) }
                ]}
                key={`${widget.id}-${index}`}
                variant={(widget.variant ?? defaultTrayWidgetVariant("stats")) as TrayComponentVariants["stats"]}
              />
            );
          }
          if (widget.type === "account") {
            return <AccountSummaryPanel key={`${widget.id}-${index}`} snapshots={accountSnapshots} variant={(widget.variant ?? defaultTrayWidgetVariant("account")) as TrayComponentVariants["account"]} />;
          }
          if (widget.type === "token-flow") {
            return (
              <ChartShell key={`${widget.id}-${index}`} meta={`${formatCompactNumber(totals.requestCount)} ${t("requests")}`} title={t("Token Flow")}>
                <AnimatedUsageChart chartId={`detail-flow-${index}`} series={activeStats.series} variant={(widget.variant ?? defaultTrayWidgetVariant("token-flow")) as TrayComponentVariants["tokenFlow"]} />
              </ChartShell>
            );
          }
          if (widget.type === "token-mix") {
            return <TokenMixPanel key={`${widget.id}-${index}`} totals={totals} variant={(widget.variant ?? defaultTrayWidgetVariant("token-mix")) as TrayComponentVariants["tokenMix"]} />;
          }
          if (widget.type === "rings") {
            return <RingMetrics key={`${widget.id}-${index}`} totals={totals} variant={(widget.variant ?? defaultTrayWidgetVariant("rings")) as TrayComponentVariants["rings"]} />;
          }
          return <ModelShareChart key={`${widget.id}-${index}`} rows={activeStats.models} variant={(widget.variant ?? defaultTrayWidgetVariant("model-share")) as TrayComponentVariants["modelShare"]} />;
        })}
      </div>
      {!hasDetailModule ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[.03] px-4 text-center text-[12px] font-medium text-slate-400">
          {t("No tray modules enabled")}
        </div>
      ) : null}
    </>
  );
}
