import {
  accountMetersForDisplay, accountProgressClass, accountProgressColor, accountSnapshotLabel, compareAccountSnapshots, formatAccountMeterTitle, formatAccountMeterValue,
  LoaderCircle, meterProgress, meterRemainingRatio, meterValidityProgress, ProviderAccountMeter, ProviderAccountSnapshot, RefreshCw, TrayComponentVariants,
  useTrayText
} from "../shared";
import { RadialMetric } from "./widgets";

export function AccountSummaryPanel({
  onRefresh,
  refreshing = false,
  snapshots,
  variant
}: {
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  snapshots: ProviderAccountSnapshot[];
  variant: TrayComponentVariants["account"];
}) {
  const t = useTrayText();
  const snapshot = snapshots
    .filter((snapshot) => snapshot.meters.length > 0 || snapshot.status === "error")
    .sort(compareAccountSnapshots)
    [0];

  if (!snapshot) {
    return (
      <div className="tray-panel-subtle px-3 py-2 text-[11px] font-medium text-slate-400">
        {t("No account data configured")}
      </div>
    );
  }

  const meters = accountMetersForDisplay(snapshot, variant === "stacked" ? 3 : 2);

  return (
    <div className="tray-panel p-2.5">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <h3 className="truncate text-[11px] font-bold text-slate-100">{accountSnapshotLabel(snapshot)}</h3>
        <button
          aria-label={t("Refresh")}
          className={`inline-flex h-5 w-5 shrink-0 appearance-none items-center justify-center rounded-md border-0 bg-transparent p-0 shadow-none transition-colors hover:bg-white/[.07] disabled:cursor-not-allowed disabled:opacity-50 ${accountStatusButtonClass(snapshot.status)}`}
          disabled={refreshing || !onRefresh}
          onClick={() => {
            void onRefresh?.();
          }}
          title={t("Refresh")}
          type="button"
        >
          {refreshing ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </div>
      {meters.length > 0 ? (
        <AccountMeters meters={meters} status={snapshot.status} variant={variant} />
      ) : (
        <div className="truncate text-[10px] font-medium text-slate-400">{snapshot.message || snapshot.errors?.[0]?.message || t("Unavailable")}</div>
      )}
    </div>
  );
}

function accountStatusButtonClass(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "text-rose-100 hover:text-rose-50";
  }
  if (status === "warning") {
    return "text-amber-100 hover:text-amber-50";
  }
  if (status === "ok") {
    return "text-teal-100 hover:text-teal-50";
  }
  return "text-slate-200 hover:text-slate-50";
}

function AccountMeters({
  meters,
  status,
  variant
}: {
  meters: ProviderAccountMeter[];
  status: ProviderAccountSnapshot["status"];
  variant: TrayComponentVariants["account"];
}) {
  const t = useTrayText();
  const progressClass = accountProgressClass(status);

  if (variant === "compact") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {meters.map((meter) => (
          <div className="tray-stat-cell min-w-0 px-2 py-1" key={meter.id}>
            <div className="truncate text-[9px] font-medium text-slate-400">{formatAccountMeterTitle(meter, t)}</div>
            <div className="truncate text-[12px] font-bold text-slate-50">{formatAccountMeterValue(meter, t)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "ring" || variant === "arc") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {meters.map((meter) => (
          <AccountMeterGauge key={meter.id} meter={meter} status={status} variant={variant} />
        ))}
      </div>
    );
  }

  if (variant === "stacked") {
    return (
      <div className="space-y-1.5">
        {meters.map((meter) => {
          const progress = meterProgress(meter) ?? meterValidityProgress(meter);
          return (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_56px] items-center gap-2" key={meter.id}>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-medium text-slate-400">{formatAccountMeterTitle(meter, t)}</div>
                {progress !== undefined ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${progressClass}`} style={{ width: `${progress}%` }} />
                  </div>
                ) : null}
              </div>
              <div className="truncate text-right text-[12px] font-bold text-slate-50">{formatAccountMeterValue(meter, t)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {meters.map((meter) => {
        const progress = meterProgress(meter) ?? meterValidityProgress(meter);
        return (
          <div className="min-w-0" key={meter.id}>
            <div className="flex min-w-0 items-end justify-between gap-2">
              <div className="min-w-0 truncate text-[10px] font-medium text-slate-400">{formatAccountMeterTitle(meter, t)}</div>
              <div className="shrink-0 text-[13px] font-bold text-slate-50">{formatAccountMeterValue(meter, t)}</div>
            </div>
            {progress !== undefined ? (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${progressClass}`} style={{ width: `${progress}%` }} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AccountMeterGauge({
  meter,
  status,
  variant
}: {
  meter: ProviderAccountMeter;
  status: ProviderAccountSnapshot["status"];
  variant: "arc" | "ring";
}) {
  const t = useTrayText();
  const ratio = meterRemainingRatio(meter) ?? 0;
  const color = accountProgressColor(status);
  return (
    <div className="min-w-0 text-center">
      <RadialMetric color={color} label={formatAccountMeterValue(meter, t)} value={ratio} variant={variant} />
      <div className="mt-0.5 truncate text-[9px] font-medium text-slate-400">{formatAccountMeterTitle(meter, t)}</div>
    </div>
  );
}
