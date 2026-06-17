import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Power } from "lucide-react";
import trayCyanIconUrl from "../../../../assets/tray-cyan.png";
import trayOrangeIconUrl from "../../../../assets/tray-orange.png";
import trayVioletIconUrl from "../../../../assets/tray-violet.png";
import { DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WINDOW_MODULES, TRAY_WINDOW_MODULE_IDS } from "../../../shared/app";
import type {
  AppConfig,
  ProviderAccountMeter,
  ProviderAccountSnapshot,
  TrayComponentVariants,
  TrayWindowModuleId,
  UsageComparisonRow,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals
} from "../../../shared/app";

type SnapshotMap = Record<UsageStatsRange, UsageStatsSnapshot>;

type SourceTab = {
  id: string;
  label: string;
  provider?: string;
};

type AppLanguagePreference = "system" | "en" | "zh";
type ResolvedLanguage = "en" | "zh";

const languagePreferenceStorageKey = "ccr.ui.language";

const trayText: Record<ResolvedLanguage, Record<string, string>> = {
  en: {},
  zh: {
    "24h": "24 小时",
    "7d": "7 天",
    "30d": "30 天",
    "Account": "账户",
    "All providers": "全部供应商",
    "Avg latency": "平均延迟",
    "Balance": "余额",
    "Cache": "缓存",
    "Cash balance": "现金余额",
    "Charge balance": "充值余额",
    "Circular metrics": "环形指标",
    "Cost": "成本",
    "Credit balance": "信用余额",
    "Current balance": "当前余额",
    "5h quota": "5 小时额度",
    "Granted balance": "赠送余额",
    "Input": "输入",
    "Monthly budget": "月度预算",
    "Model Share": "模型占比",
    "No account data configured": "未配置账户数据",
    "No model yet": "暂无模型",
    "No tray modules enabled": "未启用 Tray 模块",
    "No usage captured yet": "暂无用量记录",
    "Output": "输出",
    "Overview": "概览",
    "Quit": "退出",
    "Subscription": "订阅",
    "Success": "成功",
    "Success rate": "成功率",
    "Syncing usage...": "正在同步用量...",
    "Today": "今天",
    "Today req": "今日请求",
    "Today tokens": "今日令牌",
    "Token Flow": "Token 趋势",
    "Token Mix": "令牌构成",
    "Topped-up balance": "充值余额",
    "Total credits": "总额度",
    "Total usage": "总用量",
    "Unavailable": "不可用",
    "Updated just now": "刚刚更新",
    "Voucher balance": "代金券余额",
    "Usage Detail": "用量详情",
    "Usage Overview": "用量概览",
    "Usage chart": "用量图表",
    "critical": "严重",
    "error": "错误",
    "hours": "小时",
    "minutes": "分钟",
    "ok": "正常",
    "requests": "请求",
    "soon": "即将",
    "tokens": "令牌",
    "unsupported": "不支持",
    "warning": "警告"
  }
};

const TrayI18nContext = createContext<(value: string) => string>((value) => value);

function useTrayText() {
  return useContext(TrayI18nContext);
}

const ranges: UsageStatsRange[] = ["today", "24h", "7d", "30d"];

const trayMascotIconUrls: Record<"cyan" | "orange" | "violet", string> = {
  cyan: trayCyanIconUrl,
  orange: trayOrangeIconUrl,
  violet: trayVioletIconUrl
};

const emptyTotals: UsageTotals = {
  avgDurationMs: 0,
  cacheRatio: 0,
  cacheTokens: 0,
  costUsd: 0,
  errorCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  requestCount: 0,
  successRate: 0,
  totalTokens: 0
};

const emptySnapshots: SnapshotMap = {
  today: createEmptySnapshot("today"),
  "24h": createEmptySnapshot("24h"),
  "7d": createEmptySnapshot("7d"),
  "30d": createEmptySnapshot("30d")
};

function TrayI18nProvider({ children }: { children: ReactNode }) {
  const language = useResolvedTrayLanguage();
  const translate = useMemo(() => {
    const copy = trayText[language];
    return (value: string) => copy[value] ?? value;
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  return <TrayI18nContext.Provider value={translate}>{children}</TrayI18nContext.Provider>;
}

function useResolvedTrayLanguage(): ResolvedLanguage {
  const [languagePreference, setLanguagePreference] = useState<AppLanguagePreference>(() => readLanguagePreference());
  const [systemLanguage, setSystemLanguage] = useState<ResolvedLanguage>(() => detectSystemLanguage());

  useEffect(() => {
    const updateSystemLanguage = () => setSystemLanguage(detectSystemLanguage());
    const updateLanguagePreference = () => setLanguagePreference(readLanguagePreference());
    window.addEventListener("languagechange", updateSystemLanguage);
    window.addEventListener("storage", updateLanguagePreference);
    return () => {
      window.removeEventListener("languagechange", updateSystemLanguage);
      window.removeEventListener("storage", updateLanguagePreference);
    };
  }, []);

  return languagePreference === "system" ? systemLanguage : languagePreference;
}

function TrayApp() {
  const t = useTrayText();
  const [allSnapshots, setAllSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [trayIconPreference, setTrayIconPreference] = useState<AppConfig["trayIcon"]>("random");
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [accountSnapshots, setAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const [trayComponentVariants, setTrayComponentVariants] = useState<TrayComponentVariants>(DEFAULT_TRAY_COMPONENT_VARIANTS);
  const [trayWindowModules, setTrayWindowModules] = useState<TrayWindowModuleId[]>(DEFAULT_TRAY_WINDOW_MODULES);

  const refresh = useCallback(async () => {
    if (!window.ccr) {
      setSnapshots(emptySnapshots);
      setAllSnapshots(emptySnapshots);
      setAccountSnapshots([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const filter: UsageStatsFilter = selectedProvider ? { provider: selectedProvider } : { includeProxy: true };
      const [today, day, week, month, allMonth, config, accounts] = await Promise.all([
        window.ccr.getUsageStats("today", filter),
        window.ccr.getUsageStats("24h", filter),
        window.ccr.getUsageStats("7d", filter),
        window.ccr.getUsageStats("30d", filter),
        selectedProvider ? window.ccr.getUsageStats("30d", { includeProxy: true }) : Promise.resolve(undefined),
        window.ccr.getConfig(),
        window.ccr.getProviderAccountSnapshots(selectedProvider)
      ]);

      setSnapshots({ today, "24h": day, "7d": week, "30d": month });
      setAllSnapshots((current) => ({ ...current, "30d": allMonth ?? month }));
      setAccountSnapshots(accounts);
      setConfiguredProviders(config.Providers.map((provider) => provider.name.trim()).filter(Boolean));
      setTrayComponentVariants(normalizeTrayComponentVariants(config.trayComponentVariants));
      setTrayIconPreference(normalizeTrayIconPreference(config.trayIcon));
      setTrayWindowModules(normalizeTrayWindowModules(config.trayWindowModules));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [selectedProvider]);

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
      void window.ccr?.setTrayDetailOpen(false);
    };
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  const tabs = useMemo(() => createSourceTabs(allSnapshots["30d"].models, configuredProviders), [allSnapshots, configuredProviders]);
  const activeStats = snapshots["30d"];
  const todayTotals = snapshots.today.totals;
  const weekTotals = snapshots["7d"].totals;
  const monthTotals = snapshots["30d"].totals;
  const topModel = snapshots["30d"].models[0];
  const visibleModules = useMemo(() => new Set(trayWindowModules), [trayWindowModules]);
  const hasOverviewModules = ["account", "token-flow", "stats", "token-mix", "rings", "model-share"].some((moduleId) => visibleModules.has(moduleId as TrayWindowModuleId));
  const hasAnyVisibleModule = hasOverviewModules || visibleModules.has("source-tabs") || visibleModules.has("header");

  useEffect(() => {
    if (!selectedProvider) {
      return;
    }
    const stillAvailable = tabs.some((tab) => tab.provider === selectedProvider);
    if (!stillAvailable) {
      setSelectedProvider(undefined);
    }
  }, [selectedProvider, tabs]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-transparent text-slate-100">
      <aside className="flex h-full min-h-0 flex-col overflow-y-auto rounded-[14px] border border-slate-950/15 bg-slate-950 p-3 text-slate-50 shadow-[0_18px_42px_rgba(15,23,42,.28)]">
        <TrayStatusStrip totalTokens={activeStats.totals.totalTokens} trayIconPreference={trayIconPreference} />

        {visibleModules.has("source-tabs") ? (
          <SourceGrid
            selectedProvider={selectedProvider}
            tabs={tabs}
            onSelect={(provider) => setSelectedProvider(provider)}
          />
        ) : null}

        {visibleModules.has("header") ? (
          <div className="mb-2 flex min-w-0 items-start justify-between gap-2 rounded-[8px] border border-white/10 bg-white/[.04] px-2.5 py-2">
            <div className="min-w-0">
              <h1 className="truncate text-[13px] font-bold text-slate-50">{selectedProvider ? formatProviderName(selectedProvider) : t("Usage Overview")}</h1>
              <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{formatUpdated(activeStats.generatedAt, t)}</p>
            </div>
            <div className="shrink-0 rounded-md border border-white/10 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">{rangeLabel("30d", t)}</div>
          </div>
        ) : null}

        {hasOverviewModules ? (
          <UsageOverviewPanel
            activeStats={activeStats}
            accountSnapshots={accountSnapshots}
            componentVariants={trayComponentVariants}
            loading={loading}
            modules={visibleModules}
            monthTotals={monthTotals}
            todayTotals={todayTotals}
            topModel={topModel}
            weekTotals={weekTotals}
          />
        ) : null}

        {error ? <div className="mt-3 rounded-lg border border-rose-400/24 bg-rose-500/18 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}

        {!hasAnyVisibleModule && !error ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[.03] px-4 text-center text-[12px] font-medium text-slate-400">
            {t("No tray modules enabled")}
          </div>
        ) : null}
      </aside>
    </main>
  );
}

function TrayDetailApp({ provider }: { provider?: string }) {
  const t = useTrayText();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<UsageStatsRange>("30d");
  const [snapshots, setSnapshots] = useState<SnapshotMap>(emptySnapshots);
  const [accountSnapshots, setAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const [trayComponentVariants, setTrayComponentVariants] = useState<TrayComponentVariants>(DEFAULT_TRAY_COMPONENT_VARIANTS);
  const [trayIconPreference, setTrayIconPreference] = useState<AppConfig["trayIcon"]>("random");
  const [trayWindowModules, setTrayWindowModules] = useState<TrayWindowModuleId[]>(DEFAULT_TRAY_WINDOW_MODULES);

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
      setTrayComponentVariants(normalizeTrayComponentVariants(config.trayComponentVariants));
      setTrayIconPreference(normalizeTrayIconPreference(config.trayIcon));
      setTrayWindowModules(normalizeTrayWindowModules(config.trayWindowModules));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [provider]);

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
      <TrayStatusStrip totalTokens={snapshots[range].totals.totalTokens} trayIconPreference={trayIconPreference} />
      <UsageDetailPanel activeStats={snapshots[range]} accountSnapshots={accountSnapshots} componentVariants={trayComponentVariants} modules={new Set(trayWindowModules)} provider={provider} range={range} onRangeChange={setRange} />
      {loading ? <div className="mt-2 text-[11px] font-medium text-slate-200/60">{t("Syncing usage...")}</div> : null}
      {error ? <div className="mt-3 rounded-lg border border-rose-400/24 bg-rose-500/18 px-3 py-2 text-[12px] font-medium text-rose-100">{error}</div> : null}
    </main>
  );
}

function UsageDetailPanel({
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

function TrayStatusStrip({
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

function SourceGrid({
  selectedProvider,
  tabs,
  onSelect
}: {
  selectedProvider?: string;
  tabs: SourceTab[];
  onSelect: (provider?: string) => void;
}) {
  const t = useTrayText();

  return (
    <div className="mb-2 grid min-w-0 grid-cols-4 gap-1.5">
      {tabs.map((tab) => {
        const active = tab.provider === selectedProvider || (!tab.provider && !selectedProvider);
        return (
          <button
            className={[
              "min-w-0 truncate rounded-md border px-2 py-1 text-center text-[10px] font-semibold",
              active
                ? "border-teal-300/35 bg-teal-300/16 text-teal-50"
                : "border-white/10 bg-white/[.04] text-slate-300 hover:border-white/16 hover:bg-white/[.07] hover:text-slate-50"
            ].join(" ")}
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.provider)}
          >
            {t(tab.label)}
          </button>
        );
      })}
    </div>
  );
}

function UsageOverviewPanel({
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

function AccountSummaryPanel({
  snapshots,
  variant
}: {
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
      <div className="rounded-[8px] border border-white/10 bg-white/[.03] px-3 py-2 text-[11px] font-medium text-slate-400">
        {t("No account data configured")}
      </div>
    );
  }

  const meters = accountMetersForDisplay(snapshot, variant === "stacked" ? 3 : 2);

  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <h3 className="truncate text-[11px] font-bold text-slate-100">{t("Account")}</h3>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${accountStatusClass(snapshot.status)}`}>
          {t(snapshot.status)}
        </span>
      </div>
      {meters.length > 0 ? (
        <AccountMeters meters={meters} status={snapshot.status} variant={variant} />
      ) : (
        <div className="truncate text-[10px] font-medium text-slate-400">{snapshot.message || snapshot.errors?.[0]?.message || t("Unavailable")}</div>
      )}
    </div>
  );
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
          <div className="min-w-0 rounded-md bg-white/[.04] px-2 py-1" key={meter.id}>
            <div className="truncate text-[9px] font-medium text-slate-400">{translateAccountMeterLabel(meter.label, t)}</div>
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
          const progress = meterProgress(meter);
          return (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_56px] items-center gap-2" key={meter.id}>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-medium text-slate-400">{translateAccountMeterLabel(meter.label, t)}</div>
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
        const progress = meterProgress(meter);
        return (
          <div className="min-w-0" key={meter.id}>
            <div className="flex min-w-0 items-end justify-between gap-2">
              <div className="min-w-0 truncate text-[10px] font-medium text-slate-400">{translateAccountMeterLabel(meter.label, t)}</div>
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
      <div className="mt-0.5 truncate text-[9px] font-medium text-slate-400">{translateAccountMeterLabel(meter.label, t)}</div>
    </div>
  );
}

function RangeSwitch({ range, onChange }: { range: UsageStatsRange; onChange: (range: UsageStatsRange) => void }) {
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

function ChartShell({ children, meta, title }: { children: ReactNode; meta?: string; title: string }) {
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

function StatsGrid({
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

function AnimatedUsageChart({
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

function TokenMixPanel({
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

function RingMetrics({
  totals,
  variant
}: {
  totals: UsageTotals;
  variant: TrayComponentVariants["rings"];
}) {
  const t = useTrayText();

  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{t("Circular metrics")}</div>
      <div className="grid grid-cols-2 gap-2">
        <RingMetric label={t("Success")} value={totals.successRate} variant={variant} />
        <RingMetric label={t("Cache")} value={totals.cacheRatio} variant={variant} />
      </div>
    </div>
  );
}

function RingMetric({
  label,
  value,
  variant
}: {
  label: string;
  value: number;
  variant: TrayComponentVariants["rings"];
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const stroke = clamped > 0.8 ? "rgb(45,212,191)" : "rgb(129,140,248)";
  return (
    <div className="relative aspect-square min-w-0 text-center">
      <RadialMetric color={stroke} label={formatPercent(clamped)} value={clamped} variant={variant === "rings" ? "ring" : variant === "arcs" ? "arc" : "gauge"} />
      <div className="absolute inset-x-0 bottom-1 truncate px-1 text-[8px] font-medium text-slate-400">{label}</div>
    </div>
  );
}

function ModelShareChart({
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

function RadialMetric({
  color,
  label,
  value,
  variant
}: {
  color: string;
  label: string;
  value: number;
  variant: "arc" | "gauge" | "ring";
}) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const span = variant === "ring" ? 1 : variant === "arc" ? 0.78 : 0.55;
  const dash = circumference * span;
  const rotation = variant === "ring" ? -90 : variant === "arc" ? 130 : 160;

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
          strokeDasharray={`${dash * clamped} ${circumference - dash * clamped}`}
          strokeLinecap="round"
          strokeWidth="4"
          transform={`rotate(${rotation} 20 20)`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-100">{label}</div>
    </div>
  );
}

function createSourceTabs(rows: UsageComparisonRow[], configuredProviders: string[]): SourceTab[] {
  const providers = new Map<string, { index: number; score: number }>();
  configuredProviders.forEach((provider, index) => {
    providers.set(provider, { index, score: 0 });
  });

  for (const row of rows) {
    const provider = row.provider?.trim();
    if (!provider) {
      continue;
    }
    const current = providers.get(provider) ?? { index: providers.size, score: 0 };
    providers.set(provider, {
      index: current.index,
      score: current.score + row.totalTokens + row.requestCount
    });
  }

  const providerTabs = Array.from(providers.entries())
    .sort((a, b) => b[1].score - a[1].score || a[1].index - b[1].index)
    .slice(0, 7)
    .map(([provider]) => ({
      id: `provider:${provider}`,
      label: formatProviderName(provider),
      provider
    }));

  return [
    {
      id: "overview",
      label: "Overview"
    },
    ...providerTabs
  ];
}

function normalizeTrayWindowModules(value: AppConfig["trayWindowModules"] | undefined): TrayWindowModuleId[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TRAY_WINDOW_MODULES;
  }
  const allowed = new Set<string>(TRAY_WINDOW_MODULE_IDS);
  const result: TrayWindowModuleId[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!allowed.has(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

function normalizeTrayComponentVariants(value: unknown): TrayComponentVariants {
  const record = isObjectRecord(value) ? value : {};
  return {
    account: normalizeEnumValue(record.account, ["bar", "compact", "ring", "arc", "stacked"], DEFAULT_TRAY_COMPONENT_VARIANTS.account),
    modelShare: normalizeEnumValue(record.modelShare, ["bars", "list", "donut", "pie"], DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare),
    rings: normalizeEnumValue(record.rings, ["rings", "arcs", "gauges"], DEFAULT_TRAY_COMPONENT_VARIANTS.rings),
    stats: normalizeEnumValue(record.stats, ["cards", "compact", "pills"], DEFAULT_TRAY_COMPONENT_VARIANTS.stats),
    tokenFlow: normalizeEnumValue(record.tokenFlow, ["line", "area", "bar", "sparkline"], DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow),
    tokenMix: normalizeEnumValue(record.tokenMix, ["bars", "stacked", "donut", "pie"], DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix)
  };
}

function normalizeEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTrayIconPreference(value: AppConfig["trayIcon"] | undefined): AppConfig["trayIcon"] {
  return value === "violet" || value === "orange" || value === "cyan" || value === "progress" || value === "random"
    ? value
    : "random";
}

function isTrayMascotIconPreference(value: AppConfig["trayIcon"]): value is "cyan" | "orange" | "violet" {
  return value === "cyan" || value === "orange" || value === "violet";
}

function createEmptySnapshot(range: UsageStatsRange): UsageStatsSnapshot {
  return {
    clientModels: [],
    generatedAt: new Date().toISOString(),
    models: [],
    providerModels: [],
    range,
    recentRequests: [],
    series: createEmptySeries(range),
    totals: { ...emptyTotals }
  };
}

function createEmptySeries(range: UsageStatsRange): UsageStatsSnapshot["series"] {
  const now = new Date();
  const count = range === "today" ? now.getHours() + 1 : range === "24h" ? 24 : range === "7d" ? 7 : 30;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    if (range === "today") {
      date.setHours(index, 0, 0, 0);
    } else if (range === "24h") {
      date.setHours(now.getHours() - (count - 1 - index), 0, 0, 0);
    } else {
      date.setDate(now.getDate() - (count - 1 - index));
      date.setHours(0, 0, 0, 0);
    }
    return {
      ...emptyTotals,
      bucket: date.toISOString(),
      label: range === "today" || range === "24h" ? `${String(date.getHours()).padStart(2, "0")}:00` : `${date.getMonth() + 1}/${date.getDate()}`
    };
  });
}

function buildChartGeometry(
  series: UsageStatsSnapshot["series"],
  readValue: (point: UsageStatsSnapshot["series"][number]) => number,
  maxValue?: number
): { areaPath: string; bars: Array<{ height: number; width: number; x: number; y: number }>; linePath: string } {
  if (series.length === 0) {
    return { areaPath: "", bars: [], linePath: "" };
  }

  const left = 0;
  const right = 260;
  const top = 8;
  const bottom = 62;
  const max = Math.max(maxValue ?? 0, ...series.map((point) => readValue(point)), 1);
  const barStep = series.length <= 1 ? right - left : (right - left) / series.length;
  const barWidth = Math.max(3, Math.min(16, barStep * 0.58));
  const points = series.map((point, index) => {
    const x = series.length <= 1 ? (left + right) / 2 : left + (index / (series.length - 1)) * (right - left);
    const y = bottom - (Math.max(0, readValue(point)) / max) * (bottom - top);
    return { x, y };
  });
  const linePath = buildSmoothLinePath(points, { bottom, left, right, top });
  const areaPath = linePath ? `${linePath} L ${right.toFixed(2)} ${bottom.toFixed(2)} L ${left.toFixed(2)} ${bottom.toFixed(2)} Z` : "";
  const bars = series.map((point, index) => {
    const value = Math.max(0, readValue(point));
    const height = Math.max(value > 0 ? 3 : 1, (value / max) * (bottom - top));
    const x = left + index * barStep + (barStep - barWidth) / 2;
    return {
      height,
      width: barWidth,
      x,
      y: bottom - height
    };
  });

  return { areaPath, bars, linePath };
}

function buildSmoothLinePath(
  points: Array<{ x: number; y: number }>,
  bounds: { bottom: number; left: number; right: number; top: number }
): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  }

  const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    const controlOne = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6
    };
    const controlTwo = {
      x: next.x - (afterNext.x - current.x) / 6,
      y: next.y - (afterNext.y - current.y) / 6
    };

    commands.push(
      [
        "C",
        clampNumber(controlOne.x, bounds.left, bounds.right).toFixed(2),
        clampNumber(controlOne.y, bounds.top, bounds.bottom).toFixed(2),
        clampNumber(controlTwo.x, bounds.left, bounds.right).toFixed(2),
        clampNumber(controlTwo.y, bounds.top, bounds.bottom).toFixed(2),
        next.x.toFixed(2),
        next.y.toFixed(2)
      ].join(" ")
    );
  }

  return commands.join(" ");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatProviderName(provider: string): string {
  return provider
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bApi\b/g, "API")
    .replace(/\bOpenai\b/g, "OpenAI")
    .slice(0, 18);
}

function formatUpdated(value: string, translate: (value: string) => string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return translate("Updated just now");
  }
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return translate("Updated just now");
  }
  if (seconds < 3600) {
    if (translate("Updated just now") !== "Updated just now") {
      return `${Math.round(seconds / 60)} 分钟前更新`;
    }
    return `Updated ${Math.round(seconds / 60)}m ago`;
  }
  if (translate("Updated just now") !== "Updated just now") {
    return `${Math.round(seconds / 3600)} 小时前更新`;
  }
  return `Updated ${Math.round(seconds / 3600)}h ago`;
}

function rangeLabel(range: UsageStatsRange, translate: (value: string) => string): string {
  if (range === "today") {
    return translate("Today");
  }
  return translate(range);
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard"
  }).format(value);
}

function formatUsdCost(value: number | undefined): string {
  const normalized = Number.isFinite(value) && value && value > 0 ? value : 0;
  if (normalized === 0) {
    return "$0.00";
  }
  if (normalized < 0.01) {
    return `$${normalized.toFixed(6)}`;
  }
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: normalized >= 100 ? 0 : 2,
    minimumFractionDigits: 2,
    style: "currency"
  }).format(normalized);
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatDuration(value: number): string {
  const milliseconds = Math.max(0, Number.isFinite(value) ? value : 0);
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }
  const seconds = milliseconds / 1000;
  return `${seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(1)}s`;
}

function compareAccountSnapshots(a: ProviderAccountSnapshot, b: ProviderAccountSnapshot): number {
  return accountStatusRank(b.status) - accountStatusRank(a.status) || a.provider.localeCompare(b.provider);
}

function accountStatusRank(status: ProviderAccountSnapshot["status"]): number {
  if (status === "error") {
    return 4;
  }
  if (status === "critical") {
    return 3;
  }
  if (status === "warning") {
    return 2;
  }
  if (status === "ok") {
    return 1;
  }
  return 0;
}

function accountMetersForDisplay(snapshot: ProviderAccountSnapshot, maxCount: number): ProviderAccountMeter[] {
  return snapshot.meters.slice(0, maxCount);
}

function meterRemainingRatio(meter: ProviderAccountMeter): number | undefined {
  if (!meter.limit || meter.limit <= 0 || meter.remaining === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(1, meter.remaining / meter.limit));
}

function meterProgress(meter: ProviderAccountMeter): number | undefined {
  const ratio = meterRemainingRatio(meter);
  return ratio === undefined ? undefined : Math.max(3, Math.round(ratio * 100));
}

function translateAccountMeterLabel(label: string, translate: (value: string) => string): string {
  return translate(label);
}

function formatAccountMeterValue(meter: ProviderAccountMeter, translate: (value: string) => string): string {
  const value = meter.remaining ?? meter.used ?? meter.limit;
  if (value === undefined) {
    return "-";
  }
  if (meter.unit === "USD") {
    return `$${formatMeterNumber(value)}`;
  }
  if (meter.unit === "CNY") {
    return `¥${formatMeterNumber(value)}`;
  }
  if (meter.unit === "EUR") {
    return `€${formatMeterNumber(value)}`;
  }
  if (meter.unit === "%") {
    return `${formatMeterNumber(value)}%`;
  }
  if (meter.unit === "hours") {
    return `${formatMeterNumber(value)}h`;
  }
  if (meter.unit === "minutes") {
    return `${formatMeterNumber(value)}m`;
  }
  return `${formatCompactNumber(value)} ${translate(meter.unit)}`;
}

function formatMeterNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value);
}

function formatAccountReset(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  if (minutes <= 0) {
    return "soon";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

function accountStatusClass(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "bg-rose-400/15 text-rose-100";
  }
  if (status === "warning") {
    return "bg-amber-300/15 text-amber-100";
  }
  if (status === "ok") {
    return "bg-teal-300/15 text-teal-100";
  }
  return "bg-slate-400/15 text-slate-200";
}

function accountProgressClass(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "bg-rose-300";
  }
  if (status === "warning") {
    return "bg-amber-300";
  }
  return "bg-teal-300";
}

function accountProgressColor(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "rgb(253,164,175)";
  }
  if (status === "warning") {
    return "rgb(252,211,77)";
  }
  return "rgb(45,212,191)";
}

function readLanguagePreference(): AppLanguagePreference {
  try {
    return normalizeLanguagePreference(window.localStorage.getItem(languagePreferenceStorageKey));
  } catch {
    return "system";
  }
}

function normalizeLanguagePreference(value: unknown): AppLanguagePreference {
  return value === "en" || value === "zh" || value === "system" ? value : "system";
}

function detectSystemLanguage(): ResolvedLanguage {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

const trayParams = new URLSearchParams(window.location.search);
const trayMode = trayParams.get("mode");
const trayProvider = trayParams.get("provider")?.trim() || undefined;

createRoot(document.getElementById("root") as HTMLElement).render(
  <TrayI18nProvider>
    {trayMode === "detail" ? <TrayDetailApp provider={trayProvider} /> : <TrayApp />}
  </TrayI18nProvider>
);
