import {
  Button, cn, Download, formatCompactNumber, formatDuration, formatPercent, formatProviderAccountMeterTitle,
  formatProviderAccountMeterValue, formatUsdCost, LoaderCircle, primaryProviderAccountMeter, providerAccountMeterRemainingRatio,
  providerAccountSnapshotKey, ReactNode, UsageStatsRange, UsageStatsSnapshot, useRef, useState,
  useAppText, type OverviewWidgetType, type ProviderAccountMeter, type ProviderAccountSnapshot
} from "../shared/index";
import { buildTokenActivity, type TokenActivityCell } from "@/lib/usage-activity";

type ShareCardTone = "amber" | "blue" | "emerald" | "indigo" | "rose" | "slate" | "teal";

type ShareCardWidgetProps = {
  providerAccounts: ProviderAccountSnapshot[];
  type: OverviewWidgetType;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
};

type ShareCardPngExportOptions = {
  exportId?: string;
  output?: {
    height: number;
    width: number;
  };
};

type ShareCardPreparedExportTarget = {
  canceled: boolean;
  exportId?: string;
};

const shareCardExportCssWidth = 540;
const shareCardExportCssHeight = 675;
const shareCardExportPixelWidth = 1080;
const shareCardExportPixelHeight = 1350;

const shareCardTones: Record<ShareCardTone, { accent: string; background: string; border: string; glow: string; muted: string; text: string }> = {
  amber: {
    accent: "#f59e0b",
    background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 42%, #fff7ed 100%)",
    border: "border-amber-200",
    glow: "bg-amber-300/28",
    muted: "text-amber-900/62",
    text: "text-amber-950"
  },
  blue: {
    accent: "#2563eb",
    background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 44%, #ecfeff 100%)",
    border: "border-blue-200",
    glow: "bg-blue-300/30",
    muted: "text-blue-950/62",
    text: "text-blue-950"
  },
  emerald: {
    accent: "#059669",
    background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 42%, #f0fdfa 100%)",
    border: "border-emerald-200",
    glow: "bg-emerald-300/28",
    muted: "text-emerald-950/62",
    text: "text-emerald-950"
  },
  indigo: {
    accent: "#4f46e5",
    background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 46%, #f5f3ff 100%)",
    border: "border-indigo-200",
    glow: "bg-indigo-300/30",
    muted: "text-indigo-950/62",
    text: "text-indigo-950"
  },
  rose: {
    accent: "#e11d48",
    background: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 45%, #fff7ed 100%)",
    border: "border-rose-200",
    glow: "bg-rose-300/28",
    muted: "text-rose-950/62",
    text: "text-rose-950"
  },
  slate: {
    accent: "#475569",
    background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 48%, #f1f5f9 100%)",
    border: "border-slate-200",
    glow: "bg-slate-300/32",
    muted: "text-slate-700",
    text: "text-slate-950"
  },
  teal: {
    accent: "#0f766e",
    background: "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 42%, #ecfeff 100%)",
    border: "border-teal-200",
    glow: "bg-teal-300/30",
    muted: "text-teal-950/62",
    text: "text-teal-950"
  }
};

export function ShareCardWidget({
  providerAccounts,
  type,
  usageRange,
  usageStats
}: ShareCardWidgetProps) {
  const t = useAppText();
  const definition = shareCardDefinition(type);

  if (!definition) {
    return null;
  }

  return (
    <ShareCardShell fileName={definition.fileName} title={t(definition.title)}>
      {type === "share-usage-wrapped" ? <UsageWrappedCard usageStats={usageStats} /> : null}
      {type === "share-route-map" ? <RouteMapCard usageStats={usageStats} /> : null}
      {type === "share-model-leaderboard" ? <ModelLeaderboardCard usageStats={usageStats} /> : null}
      {type === "share-fuel-cockpit" ? <FuelCockpitCard providerAccounts={providerAccounts} /> : null}
      {type === "share-token-calendar" ? <TokenCalendarPosterCard usageStats={usageStats} /> : null}
      {type === "share-spend-receipt" ? <SpendReceiptCard usageRange={usageRange} usageStats={usageStats} /> : null}
    </ShareCardShell>
  );
}

function shareCardDefinition(type: OverviewWidgetType): { fileName: string; title: string } | undefined {
  if (type === "share-usage-wrapped") return { fileName: "ccr-ai-usage-wrapped.png", title: "AI Usage Wrapped" };
  if (type === "share-route-map") return { fileName: "ccr-route-map.png", title: "CCR Route Map" };
  if (type === "share-model-leaderboard") return { fileName: "ccr-model-leaderboard.png", title: "Model Leaderboard" };
  if (type === "share-fuel-cockpit") return { fileName: "ccr-ai-fuel-cockpit.png", title: "AI Fuel Cockpit" };
  if (type === "share-token-calendar") return { fileName: "ccr-token-calendar-poster.png", title: "Token Calendar Poster" };
  if (type === "share-spend-receipt") return { fileName: "ccr-spend-receipt.png", title: "Spend Receipt" };
  return undefined;
}

function ShareCardShell({
  children,
  fileName,
  title
}: {
  children: ReactNode;
  fileName: string;
  title: string;
}) {
  const t = useAppText();
  const cardRef = useRef<HTMLDivElement>(null);
  const exportCardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<"error" | "idle" | "saving">("idle");

  async function saveImage() {
    if (status === "saving") {
      return;
    }
    setStatus("saving");
    let exportTarget: ShareCardPreparedExportTarget | undefined;
    try {
      if (window.ccr?.prepareImageExportTarget) {
        exportTarget = await window.ccr.prepareImageExportTarget({ fileName });
        if (exportTarget.canceled) {
          setStatus("idle");
          return;
        }
      }
      setExporting(true);
      await nextFrame();
      await nextFrame();
      const target = exportCardRef.current;
      if (!target) {
        throw new Error("Export card is unavailable.");
      }
      await saveElementAsPng(target, fileName, {
        exportId: exportTarget?.exportId,
        output: {
          height: shareCardExportPixelHeight,
          width: shareCardExportPixelWidth
        }
      });
      setStatus("idle");
    } catch (error) {
      console.error(error);
      setStatus("error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <article className="flex h-full min-h-0 min-w-0 flex-col space-y-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[12px] font-semibold text-muted-foreground">{title}</div>
        <div className="flex shrink-0 items-center gap-2">
          {status === "error" ? <span className="text-[11px] font-medium text-destructive">{t("Export failed")}</span> : null}
          <Button
            aria-label={status === "saving" ? t("Saving") : t("Save image")}
            className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-45"
            disabled={status === "saving"}
            title={status === "saving" ? t("Saving") : t("Save image")}
            type="button"
            unstyled
            onClick={() => void saveImage()}
          >
            {status === "saving" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1" ref={cardRef}>
        {children}
      </div>
      {exporting ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 z-[9999]"
          ref={exportCardRef}
          style={{
            height: `${shareCardExportCssHeight}px`,
            left: "-10000px",
            width: `${shareCardExportCssWidth}px`
          }}
        >
          {children}
        </div>
      ) : null}
    </article>
  );
}

function UsageWrappedCard({ usageStats }: { usageStats: UsageStatsSnapshot }) {
  const t = useAppText();
  const totals = usageStats.totals;
  const topModel = usageStats.models[0];
  const topProvider = usageStats.providerModels[0];
  const bestDay = [...usageStats.series].sort((a, b) => b.totalTokens - a.totalTokens)[0];
  const activity = buildTokenActivity(usageStats.series, { maxWeeks: 12, minWeeks: 8 });

  return (
    <SharePoster tone="teal">
      <SharePosterHeader title={t("AI Usage Wrapped")} tone="teal" />
      <div className="mt-8">
        <div className="text-[60px] font-black leading-none tracking-normal text-teal-950">{formatCompactNumber(totals.totalTokens)}</div>
        <div className="mt-2 text-[17px] font-semibold text-teal-950/70">{t("tokens routed through CCR")}</div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <PosterStat label={t("Requests")} value={formatCompactNumber(totals.requestCount)} />
        <PosterStat label={t("Estimated cost")} value={formatUsdCost(totals.costUsd)} />
        <PosterStat label={t("Cache ratio")} value={formatPercent(totals.cacheRatio)} />
        <PosterStat label={t("Longest streak")} value={`${formatCompactNumber(activity.longestStreak)} ${t(activity.longestStreak === 1 ? "day" : "days")}`} />
      </div>
      <div className="mt-8 grid gap-3">
        <PosterHighlight label={t("Top model")} value={topModel?.label ?? t("No model activity")} />
        <PosterHighlight label={t("Top provider")} value={topProvider?.provider || topProvider?.label || t("No provider activity")} />
        <PosterHighlight label={t("Peak day")} value={bestDay ? `${bestDay.label} / ${formatCompactNumber(bestDay.totalTokens)}` : "-"} />
      </div>
      <SharePosterFooter tone="teal" />
    </SharePoster>
  );
}

function RouteMapCard({ usageStats }: { usageStats: UsageStatsSnapshot }) {
  const t = useAppText();
  const routes = buildRouteRows(usageStats, t);
  const total = routes.reduce((sum, row) => sum + row.value, 0) || 1;

  return (
    <SharePoster tone="indigo">
      <SharePosterHeader title={t("CCR Route Map")} tone="indigo" />
      <div className="mt-7 rounded-[22px] border border-indigo-200/80 bg-white/62 p-4 shadow-[0_16px_34px_rgba(79,70,229,0.10)]">
        <div className="grid grid-cols-[1fr_64px_1fr] items-center gap-3 text-center text-[10px] font-bold uppercase text-indigo-950/55">
          <span>{t("Client")}</span>
          <span>CCR</span>
          <span>{t("Model")}</span>
        </div>
        <div className="mt-4 space-y-3">
          {routes.length > 0 ? routes.slice(0, 5).map((route, index) => {
            const share = Math.max(8, (route.value / total) * 100);
            return (
              <div className="grid grid-cols-[1fr_64px_1fr] items-center gap-3" key={`${route.client}-${route.provider}-${route.model}-${index}`}>
                <RoutePill label={route.client} />
                <div className="relative flex h-9 items-center justify-center">
                  <span className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-indigo-200" />
                  <span className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-indigo-500" style={{ width: `${share}%` }} />
                  <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white shadow-[0_8px_18px_rgba(79,70,229,0.32)]">{index + 1}</span>
                </div>
                <RoutePill label={`${route.provider} / ${route.model}`} align="right" />
              </div>
            );
          }) : (
            <div className="rounded-[18px] border border-dashed border-indigo-300 bg-indigo-50/60 px-4 py-12 text-center text-[14px] font-semibold text-indigo-950/55">
              {t("No route activity")}
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2">
        <MiniRouteMetric label={t("Clients")} value={formatCompactNumber(uniqueCount(routes.map((row) => row.client)))} />
        <MiniRouteMetric label={t("Providers")} value={formatCompactNumber(uniqueCount(routes.map((row) => row.provider)))} />
        <MiniRouteMetric label={t("Models")} value={formatCompactNumber(uniqueCount(routes.map((row) => row.model)))} />
      </div>
      <SharePosterFooter tone="indigo" />
    </SharePoster>
  );
}

function ModelLeaderboardCard({ usageStats }: { usageStats: UsageStatsSnapshot }) {
  const t = useAppText();
  const rows = usageStats.models.filter((row) => row.totalTokens > 0).slice(0, 5);
  const max = Math.max(...rows.map((row) => row.totalTokens), 1);

  return (
    <SharePoster tone="blue">
      <SharePosterHeader title={t("Model Leaderboard")} tone="blue" />
      <div className="mt-7 space-y-3">
        {rows.length > 0 ? rows.map((row, index) => (
          <div className="rounded-[20px] border border-blue-200/80 bg-white/66 p-3 shadow-[0_12px_28px_rgba(37,99,235,0.10)]" key={row.key}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-blue-600 text-[17px] font-black text-white">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-black text-blue-950">{row.label}</div>
                <div className="mt-0.5 truncate text-[11px] font-semibold text-blue-950/55">{row.provider ?? t("All providers")}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[16px] font-black text-blue-950">{formatPercent(row.maxShare)}</div>
                <div className="text-[10px] font-semibold text-blue-950/52">{formatCompactNumber(row.totalTokens)}</div>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(4, (row.totalTokens / max) * 100)}%` }} />
            </div>
          </div>
        )) : (
          <EmptyPosterState label={t("No model activity")} tone="blue" />
        )}
      </div>
      <SharePosterFooter tone="blue" />
    </SharePoster>
  );
}

function FuelCockpitCard({ providerAccounts }: { providerAccounts: ProviderAccountSnapshot[] }) {
  const t = useAppText();
  const accountRows = providerAccounts
    .filter((account) => account.meters.length > 0)
    .map((account) => ({
      account,
      meter: fuelMeter(account)
    }))
    .filter((row): row is { account: ProviderAccountSnapshot; meter: ProviderAccountMeter } => Boolean(row.meter))
    .slice(0, 3);

  return (
    <SharePoster tone="emerald">
      <SharePosterHeader title={t("AI Fuel Cockpit")} tone="emerald" />
      <div className="mt-7 grid gap-4">
        {accountRows.length > 0 ? accountRows.map(({ account, meter }, index) => {
          const ratio = providerAccountMeterRemainingRatio(meter) ?? (meter.kind === "balance" ? 1 : 0);
          return (
            <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 rounded-[22px] border border-emerald-200/80 bg-white/66 p-4 shadow-[0_14px_30px_rgba(5,150,105,0.10)]" key={providerAccountSnapshotKey(account)}>
              <CircularGauge color={index === 0 ? "#059669" : index === 1 ? "#2563eb" : "#d97706"} ratio={ratio} value={formatPercent(ratio)} />
              <div className="min-w-0">
                <div className="truncate text-[16px] font-black text-emerald-950">{safeProviderName(account.provider, t)}</div>
                <div className="mt-1 truncate text-[12px] font-semibold text-emerald-950/58">{formatProviderAccountMeterTitle(meter, t)}</div>
                <div className="mt-3 text-[26px] font-black leading-none text-emerald-950">{formatProviderAccountMeterValue(meter)}</div>
              </div>
            </div>
          );
        }) : (
          <EmptyPosterState label={t("No account balance connectors configured")} tone="emerald" />
        )}
      </div>
      <SharePosterFooter tone="emerald" />
    </SharePoster>
  );
}

function TokenCalendarPosterCard({ usageStats }: { usageStats: UsageStatsSnapshot }) {
  const t = useAppText();
  const activity = buildTokenActivity(usageStats.series, { maxWeeks: 26, minWeeks: 18 });

  return (
    <SharePoster tone="rose">
      <SharePosterHeader title={t("Token Calendar Poster")} tone="rose" />
      <div className="mt-7 rounded-[22px] border border-rose-200/80 bg-white/66 p-4 shadow-[0_14px_30px_rgba(225,29,72,0.10)]">
        <div
          className="grid"
          style={{
            gap: "5px",
            gridTemplateColumns: `repeat(${activity.weekCount}, minmax(0, 1fr))`,
            gridTemplateRows: "repeat(7, minmax(0, 1fr))"
          }}
        >
          {activity.cells.map((cell) => (
            <span
              className="aspect-square rounded-[5px]"
              key={cell.dateKey}
              style={{
                backgroundColor: calendarColor(cell.intensity, cell.inObservedRange),
                gridColumn: cell.weekIndex + 1,
                gridRow: cell.dayIndex + 1
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <PosterStat label={t("Longest streak")} value={`${formatCompactNumber(activity.longestStreak)}d`} />
        <PosterStat label={t("Avg / day")} value={formatCompactNumber(Math.round(activity.avgPerDay))} />
        <PosterStat label={t("Total")} value={formatCompactNumber(activity.totalTokens)} />
      </div>
      <div className="mt-5 flex items-center gap-2 text-[12px] font-bold text-rose-950/62">
        <span>{t("Less")}</span>
        {[0, 1, 2, 3, 4].map((intensity) => (
          <span
            className="h-4 w-4 rounded-[5px]"
            key={intensity}
            style={{ backgroundColor: calendarColor(intensity as TokenActivityCell["intensity"], true) }}
          />
        ))}
        <span>{t("More")}</span>
      </div>
      <SharePosterFooter tone="rose" />
    </SharePoster>
  );
}

function SpendReceiptCard({
  usageRange,
  usageStats
}: {
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
}) {
  const t = useAppText();
  const totals = usageStats.totals;
  const rows = [
    { label: t("Range"), value: rangeLabel(usageRange, t) },
    { label: t("Requests"), value: formatCompactNumber(totals.requestCount) },
    { label: t("Input tokens"), value: formatCompactNumber(totals.inputTokens) },
    { label: t("Output tokens"), value: formatCompactNumber(totals.outputTokens) },
    { label: t("Cache tokens"), value: formatCompactNumber(totals.cacheTokens) },
    { label: t("Average latency"), value: formatDuration(totals.avgDurationMs) },
    { label: t("Success rate"), value: formatPercent(totals.successRate) }
  ];

  return (
    <SharePoster tone="slate">
      <SharePosterHeader title={t("Spend Receipt")} tone="slate" />
      <div className="mt-7 rounded-[22px] border border-slate-300 bg-white/74 p-5 shadow-[0_16px_34px_rgba(71,85,105,0.12)]">
        <div className="border-b border-dashed border-slate-300 pb-4 text-center">
          <div className="text-[40px] font-black leading-none text-slate-950">{formatUsdCost(totals.costUsd)}</div>
          <div className="mt-2 text-[12px] font-bold uppercase text-slate-500">{t("Estimated cost")}</div>
        </div>
        <div className="mt-4 space-y-2 border-b border-dashed border-slate-300 pb-4">
          {rows.map((row) => (
            <div className="flex min-w-0 items-center justify-between gap-4 text-[13px]" key={row.label}>
              <span className="truncate font-semibold text-slate-500">{row.label}</span>
              <span className="shrink-0 font-black text-slate-950">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="text-[11px] font-bold uppercase text-slate-500">{t("Total tokens")}</div>
          <div className="text-[30px] font-black leading-none text-slate-950">{formatCompactNumber(totals.totalTokens)}</div>
        </div>
      </div>
      <SharePosterFooter tone="slate" />
    </SharePoster>
  );
}

function SharePoster({
  children,
  tone
}: {
  children: ReactNode;
  tone: ShareCardTone;
}) {
  const theme = shareCardTones[tone];
  return (
    <div
      className={cn("relative h-full min-h-0 w-full overflow-hidden rounded-[28px] border p-6 shadow-card-elevated", theme.border, theme.text)}
      style={{ background: theme.background }}
    >
      <span className={cn("absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl", theme.glow)} />
      <span className={cn("absolute -bottom-20 left-8 h-44 w-44 rounded-full blur-3xl", theme.glow)} />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {children}
      </div>
    </div>
  );
}

function SharePosterHeader({
  title,
  tone
}: {
  title: string;
  tone: ShareCardTone;
}) {
  const theme = shareCardTones[tone];
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-[30px] font-black leading-[1.02] tracking-normal">{title}</h4>
      </div>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/70 bg-white/58 shadow-[0_12px_28px_rgba(15,23,42,0.10)]">
        <span className="text-[16px] font-black" style={{ color: theme.accent }}>CCR</span>
      </div>
    </div>
  );
}

function SharePosterFooter({ tone }: { tone: ShareCardTone }) {
  const t = useAppText();
  const theme = shareCardTones[tone];
  return (
    <div className={cn("mt-auto flex min-w-0 items-center justify-between gap-3 pt-5 text-[11px] font-black uppercase tracking-[0.12em]", theme.muted)}>
      <span>{t("Generated by CCR")}</span>
      <span>{new Date().getFullYear()}</span>
    </div>
  );
}

function PosterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[18px] border border-white/70 bg-white/54 px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
      <div className="truncate text-[11px] font-bold text-slate-600">{label}</div>
      <div className="mt-1 truncate text-[22px] font-black leading-none text-slate-950">{value}</div>
    </div>
  );
}

function PosterHighlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-[18px] border border-white/70 bg-white/48 px-4 py-3">
      <span className="truncate text-[12px] font-bold text-slate-600">{label}</span>
      <span className="min-w-0 truncate text-right text-[14px] font-black text-slate-950">{value}</span>
    </div>
  );
}

function EmptyPosterState({ label, tone }: { label: string; tone: ShareCardTone }) {
  const theme = shareCardTones[tone];
  return (
    <div className={cn("rounded-[22px] border border-dashed bg-white/52 px-4 py-16 text-center text-[14px] font-bold", theme.border, theme.muted)}>
      {label}
    </div>
  );
}

function RoutePill({ align = "left", label }: { align?: "left" | "right"; label: string }) {
  return (
    <div className={cn("min-w-0 rounded-[16px] border border-indigo-200 bg-white/72 px-3 py-2 shadow-[0_8px_18px_rgba(79,70,229,0.08)]", align === "right" && "text-right")}>
      <div className="truncate text-[12px] font-black text-indigo-950">{label}</div>
    </div>
  );
}

function MiniRouteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-indigo-200/80 bg-white/58 px-3 py-2 text-center">
      <div className="text-[20px] font-black leading-none text-indigo-950">{value}</div>
      <div className="mt-1 truncate text-[10px] font-bold uppercase text-indigo-950/50">{label}</div>
    </div>
  );
}

function CircularGauge({ color, ratio, value }: { color: string; ratio: number; value: string }) {
  const radius = 41;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <svg className="h-[112px] w-[112px]" role="img" viewBox="0 0 112 112" aria-label={value}>
      <circle cx="56" cy="56" fill="rgba(255,255,255,.55)" r="48" />
      <circle cx="56" cy="56" fill="none" r={radius} stroke="rgba(15,23,42,.10)" strokeWidth="10" />
      <circle
        cx="56"
        cy="56"
        fill="none"
        r={radius}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        strokeWidth="10"
        transform="rotate(-90 56 56)"
      />
      <text fill="#064e3b" fontSize="18" fontWeight="900" textAnchor="middle" x="56" y="61">{value}</text>
    </svg>
  );
}

function buildRouteRows(usageStats: UsageStatsSnapshot, translate: (value: string) => string): Array<{ client: string; model: string; provider: string; value: number }> {
  const rows = usageStats.clientModels
    .filter((row) => row.totalTokens > 0)
    .map((row) => ({
      client: row.client || row.label || translate("Agent"),
      model: row.model || modelNameFromLabel(row.label),
      provider: row.provider || translate("Provider"),
      value: row.totalTokens
    }));

  if (rows.length > 0) {
    return rows.sort((a, b) => b.value - a.value);
  }

  return usageStats.models
    .filter((row) => row.totalTokens > 0)
    .map((row) => ({
      client: translate("Agent"),
      model: row.model || row.label,
      provider: row.provider || translate("Provider"),
      value: row.totalTokens
    }))
    .sort((a, b) => b.value - a.value);
}

function modelNameFromLabel(label: string): string {
  const parts = label.split("/");
  return parts[parts.length - 1]?.trim() || label;
}

function fuelMeter(account: ProviderAccountSnapshot): ProviderAccountMeter | undefined {
  return [...account.meters]
    .filter((meter) => providerAccountMeterRemainingRatio(meter) !== undefined)
    .sort((a, b) => (providerAccountMeterRemainingRatio(a) ?? 1) - (providerAccountMeterRemainingRatio(b) ?? 1))[0] ?? primaryProviderAccountMeter(account);
}

function safeProviderName(value: string, translate: (value: string) => string): string {
  return value.trim() || translate("Provider");
}

function uniqueCount(values: string[]): number {
  return new Set(values.filter(Boolean)).size;
}

function rangeLabel(range: UsageStatsRange, translate: (value: string) => string): string {
  if (range === "today") {
    return translate("Today");
  }
  return translate(range);
}

function calendarColor(intensity: TokenActivityCell["intensity"], inRange: boolean): string {
  if (!inRange) return "rgba(225,29,72,.08)";
  if (intensity === 0) return "rgba(225,29,72,.13)";
  if (intensity === 1) return "rgba(225,29,72,.30)";
  if (intensity === 2) return "rgba(225,29,72,.50)";
  if (intensity === 3) return "rgba(225,29,72,.72)";
  return "rgba(225,29,72,.94)";
}

async function saveElementAsPng(element: HTMLElement, fileName: string, options: ShareCardPngExportOptions = {}): Promise<void> {
  if (window.ccr?.renderHtmlPng) {
    await nativeRenderElementAsPng(element, fileName, options);
    return;
  }
  if (window.ccr?.captureElementPng) {
    await nativeCaptureElementAsPng(element, fileName, options);
    return;
  }
  await browserExportElementAsPng(element, fileName);
}

async function nativeRenderElementAsPng(element: HTMLElement, fileName: string, options: ShareCardPngExportOptions): Promise<void> {
  const size = exportElementSize(element);
  const result = await window.ccr?.renderHtmlPng?.({
    borderRadius: exportBorderRadius(element),
    exportId: options.exportId,
    fileName,
    html: exportElementHtmlDocument(element, size.width, size.height),
    output: options.output,
    size
  });
  if (!result || result.canceled) {
    return;
  }
}

async function nativeCaptureElementAsPng(element: HTMLElement, fileName: string, options: ShareCardPngExportOptions): Promise<void> {
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  await nextFrame();
  const rect = element.getBoundingClientRect();
  const result = await window.ccr?.captureElementPng?.({
    borderRadius: exportBorderRadius(element),
    exportId: options.exportId,
    fileName,
    output: options.output,
    rect: {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y
    }
  });
  if (!result || result.canceled) {
    return;
  }
}

function exportElementSize(element: HTMLElement): { height: number; width: number } {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  if (width <= 0 || height <= 0) {
    throw new Error("Cannot export an empty element.");
  }
  return { height, width };
}

function exportBorderRadius(element: HTMLElement): number | undefined {
  const target = element.firstElementChild instanceof HTMLElement ? element.firstElementChild : element;
  const styles = window.getComputedStyle(target);
  const radii = [
    styles.borderTopLeftRadius,
    styles.borderTopRightRadius,
    styles.borderBottomRightRadius,
    styles.borderBottomLeftRadius
  ].map((value) => Number.parseFloat(value)).filter(Number.isFinite);
  const radius = Math.max(0, ...radii);
  return radius > 0 ? radius : undefined;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function browserExportElementAsPng(element: HTMLElement, fileName: string): Promise<void> {
  const { height, width } = exportElementSize(element);
  const clone = cloneElementForExport(element, width, height);

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<foreignObject width="100%" height="100%">${serialized}</foreignObject>`,
    "</svg>"
  ].join("");
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadImage(svgUrl);
    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering is unavailable.");
    }
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const pngBlob = await canvasToBlob(canvas);
    const pngUrl = URL.createObjectURL(pngBlob);
    try {
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(pngUrl);
    }
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function exportElementHtmlDocument(element: HTMLElement, width: number, height: number): string {
  const clone = cloneElementForExport(element, width, height);
  const serialized = new XMLSerializer().serializeToString(clone);
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<style>",
    `html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent;}`,
    "body{display:block;}",
    "*,*::before,*::after{box-sizing:border-box;}",
    "</style>",
    "</head>",
    `<body>${serialized}</body>`,
    "</html>"
  ].join("");
}

function cloneElementForExport(element: HTMLElement, width: number, height: number): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  inlineComputedStyles(element, clone);
  clone.style.bottom = "auto";
  clone.style.height = `${height}px`;
  clone.style.left = "0";
  clone.style.margin = "0";
  clone.style.position = "relative";
  clone.style.right = "auto";
  clone.style.top = "0";
  clone.style.transform = "none";
  clone.style.width = `${width}px`;
  return clone;
}

function inlineComputedStyles(source: Element, target: Element): void {
  if (target instanceof HTMLElement || target instanceof SVGElement) {
    const computed = window.getComputedStyle(source);
    for (const property of Array.from(computed)) {
      target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
    }
  }

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  sourceChildren.forEach((child, index) => {
    const targetChild = targetChildren[index];
    if (targetChild) {
      inlineComputedStyles(child, targetChild);
    }
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to render export image."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to encode PNG image."));
      }
    }, "image/png");
  });
}
