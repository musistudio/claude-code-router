import {
  appLogoUrl, formatCompactNumber, Power, useTrayText
} from "../shared";

export function TrayStatusStrip({ totalTokens }: { totalTokens: number }) {
  const t = useTrayText();

  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-white/10 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <TrayWindowHeaderIcon />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-slate-50">{formatCompactNumber(totalTokens)} {t("tokens")}</div>
          <div className="truncate text-[10px] font-medium text-slate-400">CCR</div>
        </div>
      </div>
      <button
        aria-label={t("Quit")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[.04] text-slate-300 hover:border-white/16 hover:bg-white/[.08] hover:text-slate-50"
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
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]"
    >
      <img alt="" className="h-[72%] w-[72%] object-contain" src={appLogoUrl} />
    </span>
  );
}
