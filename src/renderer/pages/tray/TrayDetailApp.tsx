import {
  DEFAULT_TRAY_WIDGETS, emptySnapshots,
  normalizeTrayWidgets, ProviderAccountSnapshot, SnapshotMap, TrayWidgetConfig, UsageStatsFilter,
  UsageStatsRange, useCallback, useEffect, useState, useTrayErrorText, useTrayText
} from "./shared";
import {
  TrayStatusStrip, UsageDetailPanel
} from "./components";

export function TrayDetailApp({ provider }: { provider?: string }) {
  const t = useTrayText();
  const formatError = useTrayErrorText();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<UsageStatsRange>("30d");
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [accountSnapshots, setAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const [trayWidgets, setTrayWidgets] = useState<TrayWidgetConfig[]>(DEFAULT_TRAY_WIDGETS);

  const refresh = useCallback(async () => {
    if (!window.ccr) {
      setSnapshots(emptySnapshots);
      setAccountSnapshots([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const filter: UsageStatsFilter = provider ? { provider } : { includeProxy: true };
      const [today, day, week, month, config, accounts] = await Promise.all([
        window.ccr.getUsageStats("today", filter),
        window.ccr.getUsageStats("24h", filter),
        window.ccr.getUsageStats("7d", filter),
        window.ccr.getUsageStats("30d", filter),
        window.ccr.getConfig(),
        window.ccr.getProviderAccountSnapshots(provider)
      ]);
      setSnapshots({ today, "24h": day, "7d": week, "30d": month });
      setAccountSnapshots(accounts);
      setTrayWidgets(normalizeTrayWidgets(config.trayWidgets, config.trayWindowModules, config.trayComponentVariants));
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setLoading(false);
    }
  }, [formatError, provider]);

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
      className="h-screen w-screen overflow-y-auto rounded-[14px] border border-slate-950/15 bg-slate-950 p-3 text-slate-100 shadow-[0_18px_42px_rgba(15,23,42,.28)]"
    >
      <TrayStatusStrip totalTokens={snapshots[range].totals.totalTokens} />
      <UsageDetailPanel activeStats={snapshots[range]} accountSnapshots={accountSnapshots} provider={provider} range={range} widgets={trayWidgets} onRangeChange={setRange} />
      {loading ? <div className="mt-2 text-[11px] font-medium text-slate-200/60">{t("Syncing usage...")}</div> : null}
      {error ? <div className="mt-3 rounded-lg border border-rose-400/24 bg-rose-500/18 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}
    </main>
  );
}
