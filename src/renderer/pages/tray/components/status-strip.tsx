import {
  AppConfig, formatCompactNumber, isTrayMascotIconPreference, Power, trayMascotIconUrls, useTrayText
} from "../shared";
export function TrayStatusStrip({
  totalTokens,
  trayIconPreference
}: {
  totalTokens: number;
  trayIconPreference: AppConfig["trayIcon"];
}) {
  const t = useTrayText();

  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-white/10 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <TrayIconPreview className="h-7 w-7 border-white/15 bg-white/10" preference={trayIconPreference} />
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

function TrayIconPreview({
  className,
  preference
}: {
  className?: string;
  preference: AppConfig["trayIcon"];
}) {
  const randomIcons: Array<"violet" | "orange" | "cyan"> = ["violet", "orange", "cyan"];

  return (
    <span
      aria-hidden="true"
      className={[
        "relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/[.04] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]",
        className ?? ""
      ].join(" ")}
    >
      {preference === "random" ? (
        randomIcons.map((iconId, index) => (
          <img
            alt=""
            className={[
              "absolute h-[66%] w-[66%] object-contain drop-shadow-sm",
              index === 0 ? "left-[9%] top-[22%]" : "",
              index === 1 ? "left-[22%] top-[11%]" : "",
              index === 2 ? "left-[34%] top-[27%]" : ""
            ].join(" ")}
            key={iconId}
            src={trayMascotIconUrls[iconId]}
          />
        ))
      ) : null}
      {isTrayMascotIconPreference(preference) ? (
        <img alt="" className="h-[88%] w-[88%] object-contain drop-shadow-sm" src={trayMascotIconUrls[preference]} />
      ) : null}
      {preference === "progress" ? <TrayProgressPreview /> : null}
    </span>
  );
}

function TrayProgressPreview() {
  const radius = 12.2;
  const circumference = 2 * Math.PI * radius;
  const progress = 0.68;

  return (
    <svg aria-hidden="true" className="h-[80%] w-[80%]" viewBox="0 0 36 36">
      <circle cx="18" cy="18" fill="rgba(15,23,42,.92)" r="15.2" />
      <circle cx="18" cy="18" fill="none" r={radius} stroke="rgba(148,163,184,.55)" strokeWidth="4.2" />
      <circle
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        stroke="rgb(248,250,252)"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        strokeWidth="4.2"
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
