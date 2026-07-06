import {
  buildChartGeometry, formatCompactNumber, formatPercent, rangeLabel, ranges, ReactNode,
  TrayComponentVariants, UsageComparisonRow, UsageStatsRange, UsageStatsSnapshot, UsageTotals, useTrayText
} from "../shared";
import { buildTokenActivity, type TokenActivityCell } from "../../../lib/usage-activity";
export function RangeSwitch({ range, onChange }: { range: UsageStatsRange; onChange: (range: UsageStatsRange) => void }) {
  const t = useTrayText();

  return (
    <div className="flex rounded-lg border border-white/8 bg-slate-900/28 p-0.5">
      {ranges.map((item) => (
        <button
          className={`h-7 rounded-[7px] px-2.5 text-[11px] font-bold ${range === item ? "bg-white/14 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,.18)]" : "text-slate-300/72 hover:text-slate-100"}`}
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

export function ChartShell({ children, meta, title }: { children: ReactNode; meta?: string; title: string }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-2">
        <h3 className="truncate text-[11px] font-bold text-slate-100">{title}</h3>
        {meta ? <span className="min-w-0 truncate text-[10px] font-medium text-slate-400">{meta}</span> : null}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function StatsGrid({
  items,
  variant
}: {
  items: Array<{ label: string; value: string }>;
  variant: TrayComponentVariants["stats"];
}) {
  if (variant === "compact") {
    return (
      <div className="mb-2 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
        {items.map((item) => (
          <div className="flex min-w-0 items-center justify-between gap-2 py-0.5 text-[10px]" key={item.label}>
            <span className="truncate font-medium text-slate-400">{item.label}</span>
            <span className="shrink-0 font-bold text-slate-50">{item.value}</span>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "pills") {
    return (
      <div className="mb-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <div className="rounded-full border border-white/10 bg-white/[.05] px-2 py-1 text-[10px] font-bold text-slate-100" key={item.label}>
            <span className="text-slate-400">{item.label}</span> {item.value}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-2 grid grid-cols-2 gap-1.5">
      {items.map((item) => (
        <StatChip key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[7px] border border-white/10 bg-white/[.04] px-2 py-1.5">
      <div className="truncate text-[10px] font-medium text-slate-400">{label}</div>
      <div className="truncate text-[13px] font-bold text-slate-50">{value}</div>
    </div>
  );
}

export function AnimatedUsageChart({
  chartId,
  series,
  variant
}: {
  chartId: string;
  series: UsageStatsSnapshot["series"];
  variant: TrayComponentVariants["tokenFlow"];
}) {
  const t = useTrayText();
  const maxValue = Math.max(...series.map((point) => Math.max(point.totalTokens, point.cacheTokens)), 1);
  const tokenGeometry = buildChartGeometry(series, (point) => point.totalTokens, maxValue);
  const cacheGeometry = buildChartGeometry(series, (point) => point.cacheTokens, maxValue);

  return (
    <div className="min-w-0">
      <svg className="mt-2 h-16 w-full overflow-visible" preserveAspectRatio="none" role="img" viewBox="0 0 260 72" aria-label={t("Usage chart")}>
        <defs>
          <filter id={`${chartId}-glow`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[20, 68, 116, 164, 212].map((x) => (
          <line key={x} stroke="rgba(148,163,184,.12)" strokeWidth="1" x1={x} x2={x} y1="0" y2="72" />
        ))}
        {variant === "bar" ? (
          <>
            {tokenGeometry.bars.map((bar) => (
              <rect fill="rgba(45,212,191,.9)" height={bar.height} key={`token-${bar.x}`} rx="3" width={bar.width} x={bar.x} y={bar.y} />
            ))}
            {cacheGeometry.bars.map((bar) => (
              <rect fill="rgba(167,139,250,.72)" height={bar.height} key={`cache-${bar.x}`} rx="3" width={Math.max(2, bar.width * 0.52)} x={bar.x + bar.width * 0.24} y={bar.y} />
            ))}
          </>
        ) : null}
        {variant === "area" ? (
          <>
            <path d={tokenGeometry.areaPath} fill="rgba(45,212,191,.18)" />
            <path d={cacheGeometry.areaPath} fill="rgba(167,139,250,.12)" />
          </>
        ) : null}
        {variant !== "bar" ? (
          <>
            <path className="tray-line-draw" d={tokenGeometry.linePath} fill="none" filter={`url(#${chartId}-glow)`} stroke="rgba(45,212,191,.95)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={variant === "sparkline" ? "3" : "4"} vectorEffect="non-scaling-stroke" />
            {variant === "sparkline" ? null : <path className="tray-line-draw" d={cacheGeometry.linePath} fill="none" stroke="rgba(167,139,250,.72)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
          </>
        ) : null}
      </svg>
    </div>
  );
}

export function TokenActivityPanel({
  series
}: {
  series: UsageStatsSnapshot["series"];
}) {
  const t = useTrayText();
  const activity = buildTokenActivity(series, { maxWeeks: 14, minWeeks: 10 });

  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-[11px] font-bold text-slate-100">{t("Activity")}</div>
        <div className="shrink-0 text-[10px] font-medium text-slate-400">{t("Tokens")}</div>
      </div>

      <div className="mb-2 grid grid-cols-4 gap-px overflow-hidden rounded-[7px] border border-white/8 bg-white/[.08]">
        <TokenActivityStat label={t("Longest streak")} value={formatCompactNumber(activity.longestStreak)} unit={t(activity.longestStreak === 1 ? "day" : "days")} />
        <TokenActivityStat label={t("Avg / day")} value={formatCompactNumber(Math.round(activity.avgPerDay))} />
        <TokenActivityStat label={t("Avg / week")} value={formatCompactNumber(Math.round(activity.avgPerWeek))} />
        <TokenActivityStat label={t("Total")} value={formatCompactNumber(activity.totalTokens)} />
      </div>

      <TokenActivityGrid activity={activity} />

      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-slate-400">
        <span>{t("Less")}</span>
        {[0, 1, 2, 3, 4].map((intensity) => (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-[3px]"
            key={intensity}
            style={{ backgroundColor: trayActivityColor(intensity as TokenActivityCell["intensity"], true) }}
          />
        ))}
        <span>{t("More")}</span>
      </div>
    </div>
  );
}

function TokenActivityStat({
  label,
  unit,
  value
}: {
  label: string;
  unit?: string;
  value: string;
}) {
  return (
    <div className="min-w-0 bg-slate-950/35 px-1.5 py-1">
      <div className="truncate text-[8px] font-semibold text-slate-400">{label}</div>
      <div className="flex min-w-0 items-baseline gap-1">
        <span className="truncate text-[11px] font-bold text-slate-50">{value}</span>
        {unit ? <span className="shrink-0 text-[8px] font-medium text-slate-500">{unit}</span> : null}
      </div>
    </div>
  );
}

function TokenActivityGrid({
  activity
}: {
  activity: ReturnType<typeof buildTokenActivity>;
}) {
  const t = useTrayText();
  const dayLabels = [t("M"), "", t("W"), "", t("F"), "", ""];
  const cellGap = 3;
  const cellSize = 9;
  const labelColumnWidth = 14;

  return (
    <div className="min-w-0 overflow-visible">
      <div className="w-max">
        <div
          className="mb-1 grid text-[8px] font-medium text-slate-500"
          style={{
            columnGap: `${cellGap}px`,
            gridTemplateColumns: `repeat(${activity.weekCount}, ${cellSize}px)`,
            marginLeft: `${labelColumnWidth + cellGap}px`
          }}
        >
          {activity.months.map((month) => (
            <span
              className="truncate"
              key={`${month.label}-${month.weekIndex}`}
              style={{ gridColumn: `${month.weekIndex + 1} / span ${Math.min(3, activity.weekCount - month.weekIndex)}` }}
            >
              {month.label}
            </span>
          ))}
        </div>
        <div
          className="grid"
          role="img"
          aria-label={`${t("Activity")} ${t("Tokens")}`}
          style={{
            gap: `${cellGap}px`,
            gridTemplateColumns: `${labelColumnWidth}px repeat(${activity.weekCount}, ${cellSize}px)`,
            gridTemplateRows: `repeat(7, ${cellSize}px)`
          }}
        >
          {dayLabels.map((label, index) => (
            <span
              className="self-center truncate text-[8px] font-medium leading-none text-slate-500"
              key={`${label}-${index}`}
              style={{ gridColumn: 1, gridRow: index + 1 }}
            >
              {label}
            </span>
          ))}
        {activity.cells.map((cell) => (
          <span
            aria-label={`${cell.dateLabel}: ${formatActivityTokenCount(cell.totalTokens)} ${t("tokens")}`}
            className="group relative rounded-[3px]"
            key={cell.dateKey}
            style={{
              backgroundColor: trayActivityColor(cell.intensity, cell.inObservedRange),
              gridColumn: cell.weekIndex + 2,
              gridRow: cell.dayIndex + 1
            }}
          >
            <span className={`pointer-events-none absolute z-30 hidden min-w-[96px] rounded-md border border-white/10 bg-slate-950/95 px-2 py-1.5 text-left text-[10px] text-slate-100 shadow-[0_10px_24px_rgba(0,0,0,.32)] group-hover:block ${trayActivityTooltipPositionClass(cell, activity.weekCount)}`}>
              <span className="block font-bold">{cell.dateLabel}</span>
              <span className="mt-0.5 block font-medium text-slate-400">{formatActivityTokenCount(cell.totalTokens)} {t("tokens")}</span>
            </span>
          </span>
        ))}
        </div>
      </div>
    </div>
  );
}

function formatActivityTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(Math.max(0, value)));
}

function trayActivityTooltipPositionClass(cell: TokenActivityCell, weekCount: number): string {
  const verticalClass = cell.dayIndex <= 1 ? "top-full mt-1" : "bottom-full mb-1";
  if (cell.weekIndex <= 1) {
    return `${verticalClass} left-0`;
  }
  if (cell.weekIndex >= weekCount - 2) {
    return `${verticalClass} right-0`;
  }
  return `${verticalClass} left-1/2 -translate-x-1/2`;
}

function trayActivityColor(intensity: TokenActivityCell["intensity"], inRange: boolean): string {
  if (!inRange) return "rgba(129,140,248,.06)";
  if (intensity === 0) return "rgba(129,140,248,.14)";
  if (intensity === 1) return "rgba(129,140,248,.32)";
  if (intensity === 2) return "rgba(129,140,248,.52)";
  if (intensity === 3) return "rgba(129,140,248,.72)";
  return "rgba(129,140,248,.94)";
}

export function TokenMixPanel({
  totals,
  variant
}: {
  totals: UsageTotals;
  variant: TrayComponentVariants["tokenMix"];
}) {
  const t = useTrayText();
  const rows = [
    { className: "bg-blue-400", color: "rgb(96,165,250)", label: t("Input"), value: totals.inputTokens },
    { className: "bg-amber-300", color: "rgb(252,211,77)", label: t("Output"), value: totals.outputTokens },
    { className: "bg-rose-300", color: "rgb(253,164,175)", label: t("Cache"), value: totals.cacheTokens }
  ];
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{t("Token Mix")}</div>
      {variant === "donut" || variant === "pie" ? (
        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
          <ShareChart rows={rows} variant={variant} />
          <ShareLegend rows={rows} />
        </div>
      ) : null}
      {variant === "stacked" ? (
        <div className="space-y-1.5">
          <StackedShareBar rows={rows} />
          <ShareLegend rows={rows} />
        </div>
      ) : null}
      {variant === "bars" ? (
        <div className="space-y-1.5">
          {rows.map((row) => {
            const percent = row.value > 0 ? Math.max(4, (row.value / max) * 100) : 2;
            return (
              <div key={row.label}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium text-slate-400">
                  <span className="truncate">{row.label}</span>
                  <span className="shrink-0">{formatCompactNumber(row.value)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${row.className}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function RingMetrics({
  totals,
  variant
}: {
  totals: UsageTotals;
  variant: TrayComponentVariants["rings"];
}) {
  const t = useTrayText();
  const successRequests = Math.round(totals.requestCount * Math.max(0, Math.min(1, totals.successRate)));

  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{t("Circular metrics")}</div>
      <div className="grid grid-cols-2 gap-2">
        <RingMetric centerUnit={t("requests")} centerValue={formatCompactNumber(successRequests)} label={t("Success")} value={totals.successRate} variant={variant} />
        <RingMetric centerUnit={t("tokens")} centerValue={formatCompactNumber(totals.cacheTokens)} label={t("Cache")} value={totals.cacheRatio} variant={variant} />
      </div>
    </div>
  );
}

function RingMetric({
  centerUnit,
  centerValue,
  label,
  value,
  variant
}: {
  centerUnit: string;
  centerValue: string;
  label: string;
  value: number;
  variant: TrayComponentVariants["rings"];
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const stroke = clamped > 0.8 ? "rgb(45,212,191)" : "rgb(129,140,248)";
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="aspect-square w-full min-w-0">
        <RadialMetric
          centerUnit={centerUnit}
          centerValue={centerValue}
          color={stroke}
          label={`${label} ${formatPercent(clamped)}, ${centerValue} ${centerUnit}`}
          value={clamped}
          variant={variant === "rings" ? "ring" : variant === "arcs" ? "arc" : "gauge"}
        />
      </div>
      <div className="mt-1 w-full truncate px-1 text-[10px] font-semibold leading-none text-slate-300">{label}</div>
    </div>
  );
}

export function ModelShareChart({
  rows,
  variant
}: {
  rows: UsageComparisonRow[];
  variant: TrayComponentVariants["modelShare"];
}) {
  const t = useTrayText();

  if (rows.length === 0) {
    return (
    <div className="mb-2 rounded-[8px] border border-white/10 bg-white/[.03] px-3 py-8 text-center text-[12px] font-medium text-slate-400">
        {t("No usage captured yet")}
      </div>
    );
  }

  const chartRows = rows.slice(0, 4).map((row, index) => ({
    className: ["bg-teal-300", "bg-indigo-400", "bg-amber-300", "bg-rose-300"][index] ?? "bg-slate-300",
    color: ["rgb(45,212,191)", "rgb(129,140,248)", "rgb(251,191,36)", "rgb(253,164,175)"][index] ?? "rgb(203,213,225)",
    label: row.label,
    value: row.totalTokens
  }));

  return (
    <div className="mb-2 min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{t("Model Share")}</div>
      {variant === "donut" || variant === "pie" ? (
        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
          <ShareChart rows={chartRows} variant={variant} />
          <ShareLegend rows={chartRows} />
        </div>
      ) : null}
      {variant === "list" ? (
        <div className="space-y-1">
          {rows.slice(0, 4).map((row, index) => (
            <div className="flex min-w-0 items-center justify-between gap-2 text-[10px]" key={row.key}>
              <span className="min-w-0 truncate font-medium text-slate-300">{index + 1}. {row.label}</span>
              <span className="shrink-0 font-semibold text-slate-400">{formatPercent(row.maxShare)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {variant === "bars" ? (
        <div className="space-y-1.5">
          {rows.slice(0, 3).map((row) => (
            <div key={row.key}>
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-300">{row.label}</div>
                <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-teal-300"
                    style={{ width: `${Math.max(3, row.maxShare * 100)}%` }}
                  />
                </div>
                <div className="w-7 shrink-0 text-right text-[10px] font-semibold text-slate-400">{formatPercent(row.maxShare)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ShareChartRow = {
  className: string;
  color: string;
  label: string;
  value: number;
};

function ShareChart({
  rows,
  variant
}: {
  rows: ShareChartRow[];
  variant: "donut" | "pie";
}) {
  const radius = variant === "pie" ? 10 : 13;
  const strokeWidth = variant === "pie" ? 20 : 7;
  const circumference = 2 * Math.PI * radius;
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0) || 1;
  let cursor = 0;
  const segments = rows.map((row) => {
    const length = circumference * (Math.max(0, row.value) / total);
    const segment = { ...row, length, offset: cursor };
    cursor += length;
    return segment;
  });

  return (
    <svg className="h-16 w-16" viewBox="0 0 40 40" role="img" aria-label="Share chart">
      <circle cx="20" cy="20" fill="none" r={radius} stroke="rgba(148,163,184,.16)" strokeWidth={strokeWidth} />
      {segments.map((segment) => (
        <circle
          cx="20"
          cy="20"
          fill="none"
          key={`${segment.label}-${segment.offset}`}
          r={radius}
          stroke={segment.color}
          strokeDasharray={`${segment.length} ${circumference - segment.length}`}
          strokeDashoffset={-segment.offset}
          strokeWidth={strokeWidth}
          transform="rotate(-90 20 20)"
        />
      ))}
      {variant === "donut" ? <circle cx="20" cy="20" fill="rgb(15,23,42)" r="8" /> : null}
    </svg>
  );
}

function ShareLegend({ rows }: { rows: ShareChartRow[] }) {
  return (
    <div className="min-w-0 space-y-1">
      {rows.map((row) => (
        <div className="flex min-w-0 items-center gap-1.5 text-[9px] font-medium text-slate-400" key={row.label}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          <span className="shrink-0 text-slate-300">{formatCompactNumber(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function StackedShareBar({ rows }: { rows: ShareChartRow[] }) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const fallbackWidth = rows.length > 0 ? 100 / rows.length : 100;

  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
      {rows.map((row) => {
        const width = total > 0 ? Math.max(2, (Math.max(0, row.value) / total) * 100) : fallbackWidth;
        return <div className={row.className} key={row.label} style={{ width: `${width}%` }} />;
      })}
    </div>
  );
}

export function RadialMetric({
  centerUnit,
  centerValue,
  color,
  label,
  value,
  variant
}: {
  centerUnit?: string;
  centerValue?: string;
  color: string;
  label: string;
  value: number;
  variant: "arc" | "gauge" | "ring";
}) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const span = variant === "ring" ? 1 : variant === "arc" ? 0.78 : 0.55;
  const sweepDegrees = span * 360;
  const dash = circumference * span;
  const progressDash = dash * clamped;
  const rotation = variant === "ring" ? -90 : (540 - sweepDegrees) / 2;

  return (
    <div className="relative aspect-square min-w-0">
      <svg className="h-full w-full overflow-visible" viewBox="0 0 40 40" role="img" aria-label={label}>
        <circle
          cx="20"
          cy="20"
          fill="none"
          r={radius}
          stroke="rgba(148,163,184,.22)"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          strokeWidth="4"
          transform={`rotate(${rotation} 20 20)`}
        />
        <circle
          cx="20"
          cy="20"
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={`${progressDash} ${circumference - progressDash}`}
          strokeLinecap="round"
          strokeWidth="4"
          transform={`rotate(${rotation} 20 20)`}
        />
      </svg>
      <div className="absolute inset-0 flex min-w-0 flex-col items-center justify-center px-1 text-center leading-none">
        <div className="max-w-full truncate text-[11px] font-bold text-slate-100">{centerValue ?? label}</div>
        {centerUnit ? <div className="mt-0.5 max-w-full truncate text-[8px] font-semibold uppercase text-slate-400">{centerUnit}</div> : null}
      </div>
    </div>
  );
}
