import {
  appLogoUrl, formatCompactNumber, Power, useTrayText
} from "../shared";

export function TrayStatusStrip({ totalTokens }: { totalTokens: number }) {
  const t = useTrayText();

  return (
    <div className="tray-status-strip mb-3 flex min-w-0 items-center justify-between gap-3 border-b pb-2.5">
      <button
        aria-label={t("Open CCR")}
        className="tray-header-action -ml-1 flex min-w-0 items-center gap-2 rounded-[9px] px-1 py-0.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/35"
        title={t("Open CCR")}
        type="button"
        onClick={() => void window.ccr?.showMainWindow()}
      >
        <TrayWindowHeaderIcon />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-slate-50">{formatCompactNumber(totalTokens)} {t("tokens")}</div>
          <div className="truncate text-[10px] font-medium text-slate-400">CCR</div>
        </div>
      </button>
      <button
        aria-label={t("Quit")}
        className="tray-icon-button flex h-7 w-7 shrink-0 items-center justify-center"
        title={t("Quit")}
        type="button"
        onClick={() => void window.ccr?.quitApp()}
      >
        <Power className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TrayWindowHeaderIcon() {
  return (
    <span
      aria-hidden="true"
      className="tray-header-icon flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border"
    >
      <img alt="" className="h-[72%] w-[72%] object-contain" src={appLogoUrl} />
    </span>
  );
}
