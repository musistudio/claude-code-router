import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { LoaderCircle, Power, RefreshCw } from "lucide-react";
import appLogoUrl from "@/assets/logo.png";
import trayCyanIconUrl from "@/assets/tray-cyan.png";
import trayOrangeIconUrl from "@/assets/tray-orange.png";
import trayVioletIconUrl from "@/assets/tray-violet.png";
import { DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WIDGETS, DEFAULT_TRAY_WINDOW_MODULES, TRAY_SINGLETON_WIDGET_TYPES, TRAY_TOP_WIDGET_TYPES, TRAY_WINDOW_MODULE_IDS } from "@ccr/core/contracts/app";
import { formatLocalizedErrorMessage } from "@ccr/core/contracts/i18n";
import type {
  AppConfig,
  ProviderAccountMeter,
  ProviderAccountSnapshot,
  TrayBalanceProgressConfig,
  TrayComponentVariants,
  TrayWidgetConfig,
  TrayWidgetType,
  TrayWidgetVariant,
  TrayWindowModuleId,
  UsageComparisonRow,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals
} from "@ccr/core/contracts/app";

export  {
  createContext, useCallback, useContext, useEffect, useMemo, useState, createRoot,
  LoaderCircle, Power, RefreshCw, appLogoUrl, trayCyanIconUrl, trayOrangeIconUrl, trayVioletIconUrl, DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WIDGETS, DEFAULT_TRAY_WINDOW_MODULES, TRAY_SINGLETON_WIDGET_TYPES, TRAY_TOP_WIDGET_TYPES, TRAY_WINDOW_MODULE_IDS
};
export type {
  ReactNode, AppConfig, ProviderAccountMeter, ProviderAccountSnapshot, TrayBalanceProgressConfig, TrayComponentVariants, TrayWidgetConfig, TrayWidgetType, TrayWidgetVariant, TrayWindowModuleId, UsageComparisonRow,
  UsageStatsFilter, UsageStatsRange, UsageStatsSnapshot, UsageTotals
};

export type SnapshotMap = Record<UsageStatsRange, UsageStatsSnapshot>;

export type SourceTab = {
  id: string;
  label: string;
  provider?: string;
};

export type AppLanguagePreference = "system" | "en" | "zh";
export type ResolvedLanguage = "en" | "zh";

export const languagePreferenceStorageKey = "ccr.ui.language";

export const trayText: Record<ResolvedLanguage, Record<string, string>> = {
  en: {},
  zh: {
    "24h": "24 小时",
    "7d": "7 天",
    "30d": "30 天",
    "All": "全部",
    "Account": "账户",
    "All providers": "全部供应商",
    "Activity": "活跃度",
    "Avg / day": "日均",
    "Avg / week": "周均",
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
    "F": "五",
    "Granted balance": "赠送余额",
    "Input": "输入",
    "Individual limit": "个人额度",
    "Less": "少",
    "Lifetime tokens": "累计令牌",
    "Longest streak": "最长连续",
    "M": "一",
    "Manual resets": "主动重置次数",
    "Monthly budget": "月度预算",
    "Model Share": "模型占比",
    "More": "多",
    "No account data configured": "未配置账户数据",
    "No model yet": "暂无模型",
    "No tray modules enabled": "未启用 Tray 模块",
    "No usage captured yet": "暂无用量记录",
    "Output": "输出",
    "Overview": "概览",
    "Open CCR": "打开 CCR",
    "Peak daily tokens": "日峰值令牌",
    "Primary quota": "主额度",
    "Quit": "退出",
    "Refresh": "刷新",
    "Secondary quota": "副额度",
    "Subscription": "订阅",
    "Success": "成功",
    "Success rate": "成功率",
    "Syncing usage...": "正在同步用量...",
    "Today": "今天",
    "Today req": "今日请求",
    "Today tokens": "今日令牌",
    "Token Flow": "Token 趋势",
    "Token Mix": "令牌构成",
    "Tokens": "令牌",
    "Total": "总计",
    "Topped-up balance": "充值余额",
    "Total credits": "总额度",
    "Total usage": "总用量",
    "Unavailable": "不可用",
    "Updated just now": "刚刚更新",
    "Voucher balance": "代金券余额",
    "Weekly quota": "周额度",
    "W": "三",
    "Usage Detail": "用量详情",
    "Usage Overview": "用量概览",
    "Usage chart": "用量图表",
    "critical": "严重",
    "day": "天",
    "days": "天",
    "error": "错误",
    "expired": "已过期",
    "expires in": "剩余",
    "hours": "小时",
    "minutes": "分钟",
    "ok": "正常",
    "requests": "请求",
    "resets": "次",
    "soon": "即将",
    "tokens": "令牌",
    "unsupported": "不支持",
    "warning": "警告"
  }
};

export const TrayI18nContext = createContext<(value: string) => string>((value) => value);

export function useTrayText() {
  return useContext(TrayI18nContext);
}

export function useTrayErrorText() {
  const language = useResolvedTrayLanguage();
  return useMemo(() => (error: unknown) => formatLocalizedErrorMessage(language, error), [language]);
}

export const ranges: UsageStatsRange[] = ["today", "24h", "7d", "30d"];

export const trayMascotIconUrls: Record<"cyan" | "orange" | "violet", string> = {
  cyan: trayCyanIconUrl,
  orange: trayOrangeIconUrl,
  violet: trayVioletIconUrl
};

export const emptyTotals: UsageTotals = {
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

export const emptySnapshots: SnapshotMap = {
  today: createEmptySnapshot("today"),
  "24h": createEmptySnapshot("24h"),
  "7d": createEmptySnapshot("7d"),
  "30d": createEmptySnapshot("30d")
};

export function TrayI18nProvider({ children }: { children: ReactNode }) {
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

export function useResolvedTrayLanguage(): ResolvedLanguage {
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

export function createSourceTabs(rows: UsageComparisonRow[], configuredProviders: string[]): SourceTab[] {
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
      id: "all",
      label: "All"
    },
    ...providerTabs
  ];
}

export function normalizeTrayWindowModules(value: AppConfig["trayWindowModules"] | undefined): TrayWindowModuleId[] {
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

export function normalizeTrayComponentVariants(value: unknown): TrayComponentVariants {
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

export function normalizeTrayWidgets(value: unknown, fallbackModules?: unknown, fallbackVariants?: unknown): TrayWidgetConfig[] {
  if (!Array.isArray(value)) {
    if (Array.isArray(fallbackModules)) {
      return orderTrayWidgetsForLayout(dedupeTraySingletonWidgets(trayWidgetsFromModules(normalizeTrayWindowModules(fallbackModules as AppConfig["trayWindowModules"]), normalizeTrayComponentVariants(fallbackVariants))));
    }
    return DEFAULT_TRAY_WIDGETS.map((widget) => ({ ...widget }));
  }
  return orderTrayWidgetsForLayout(dedupeTraySingletonWidgets(value
    .map(normalizeTrayWidget)
    .filter((widget): widget is TrayWidgetConfig => Boolean(widget))));
}

export function normalizeTrayWidget(value: unknown): TrayWidgetConfig | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }
  const type = normalizeTrayWidgetType(value.type);
  if (!type) {
    return undefined;
  }
  const variant = normalizeTrayWidgetVariant(type, value.variant);
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : trayWidgetId(type),
    type,
    ...(variant ? { variant } : {})
  };
}

export function normalizeTrayWidgetType(value: unknown): TrayWidgetType | undefined {
  return typeof value === "string" && ["account", "activity", "header", "model-share", "rings", "source-tabs", "stats", "token-flow", "token-mix"].includes(value)
    ? value as TrayWidgetType
    : undefined;
}

export function normalizeTrayWidgetVariant(type: TrayWidgetType, value: unknown): TrayWidgetVariant | undefined {
  const variants = trayWidgetVariantOptions(type).map((option) => option.value);
  return typeof value === "string" && (variants as readonly string[]).includes(value)
    ? value as TrayWidgetVariant
    : defaultTrayWidgetVariant(type);
}

export function trayWidgetVariantOptions(type: TrayWidgetType): Array<{ label: string; value: TrayWidgetVariant }> {
  if (type === "account") {
    return [
      { label: "Bars", value: "bar" },
      { label: "Compact", value: "compact" },
      { label: "Ring", value: "ring" },
      { label: "Arc", value: "arc" },
      { label: "Stacked", value: "stacked" }
    ];
  }
  if (type === "token-flow") {
    return [
      { label: "Line", value: "line" },
      { label: "Area", value: "area" },
      { label: "Bar", value: "bar" },
      { label: "Sparkline", value: "sparkline" }
    ];
  }
  if (type === "stats") {
    return [
      { label: "Cards", value: "cards" },
      { label: "Compact", value: "compact" },
      { label: "Pills", value: "pills" }
    ];
  }
  if (type === "token-mix") {
    return [
      { label: "Bars", value: "bars" },
      { label: "Stacked", value: "stacked" },
      { label: "Donut", value: "donut" },
      { label: "Pie", value: "pie" }
    ];
  }
  if (type === "rings") {
    return [
      { label: "Rings", value: "rings" },
      { label: "Arc", value: "arcs" },
      { label: "Gauges", value: "gauges" }
    ];
  }
  if (type === "model-share") {
    return [
      { label: "Bars", value: "bars" },
      { label: "List", value: "list" },
      { label: "Donut", value: "donut" },
      { label: "Pie", value: "pie" }
    ];
  }
  return [];
}

export function defaultTrayWidgetVariant(type: TrayWidgetType): TrayWidgetVariant | undefined {
  if (type === "account") return DEFAULT_TRAY_COMPONENT_VARIANTS.account;
  if (type === "model-share") return DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare;
  if (type === "rings") return DEFAULT_TRAY_COMPONENT_VARIANTS.rings;
  if (type === "stats") return DEFAULT_TRAY_COMPONENT_VARIANTS.stats;
  if (type === "token-flow") return DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow;
  if (type === "token-mix") return DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix;
  return undefined;
}

export function trayWidgetId(type: TrayWidgetType): string {
  return type;
}

export function isTraySingletonWidgetType(type: TrayWidgetType): boolean {
  return (TRAY_SINGLETON_WIDGET_TYPES as readonly string[]).includes(type);
}

export function isTrayPinnedTopWidgetType(type: TrayWidgetType): boolean {
  return (TRAY_TOP_WIDGET_TYPES as readonly string[]).includes(type);
}

export function orderTrayWidgetsForLayout(widgets: TrayWidgetConfig[]): TrayWidgetConfig[] {
  return [
    ...widgets.filter((widget) => isTrayPinnedTopWidgetType(widget.type)),
    ...widgets.filter((widget) => !isTrayPinnedTopWidgetType(widget.type))
  ];
}

function dedupeTraySingletonWidgets(widgets: TrayWidgetConfig[]): TrayWidgetConfig[] {
  const seenSingletons = new Set<TrayWidgetType>();
  return widgets.filter((widget) => {
    if (!isTraySingletonWidgetType(widget.type)) {
      return true;
    }
    if (seenSingletons.has(widget.type)) {
      return false;
    }
    seenSingletons.add(widget.type);
    return true;
  });
}

export function trayWidgetsFromModules(modules: TrayWindowModuleId[], variants: TrayComponentVariants): TrayWidgetConfig[] {
  return orderTrayWidgetsForLayout(modules
    .filter((moduleId): moduleId is TrayWidgetType => moduleId !== "footer")
    .map((type) => ({
      id: trayWidgetId(type),
      type,
      ...((type === "account") ? { variant: variants.account } : {}),
      ...((type === "model-share") ? { variant: variants.modelShare } : {}),
      ...((type === "rings") ? { variant: variants.rings } : {}),
      ...((type === "stats") ? { variant: variants.stats } : {}),
      ...((type === "token-flow") ? { variant: variants.tokenFlow } : {}),
      ...((type === "token-mix") ? { variant: variants.tokenMix } : {})
    })));
}

export function normalizeEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeTrayIconPreference(value: AppConfig["trayIcon"] | undefined): AppConfig["trayIcon"] {
  return value === "violet" || value === "orange" || value === "cyan" || value === "progress" || value === "random"
    ? value
    : "random";
}

export function isTrayMascotIconPreference(value: AppConfig["trayIcon"]): value is "cyan" | "orange" | "violet" {
  return value === "cyan" || value === "orange" || value === "violet";
}

export function createEmptySnapshot(range: UsageStatsRange): UsageStatsSnapshot {
  return {
    clientIps: [],
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

export function createEmptySeries(range: UsageStatsRange): UsageStatsSnapshot["series"] {
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

export function buildChartGeometry(
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

export function buildSmoothLinePath(
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

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatProviderName(provider: string): string {
  return provider
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bApi\b/g, "API")
    .replace(/\bOpenai\b/g, "OpenAI")
    .slice(0, 18);
}

export function formatUpdated(value: string, translate: (value: string) => string): string {
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

export function rangeLabel(range: UsageStatsRange, translate: (value: string) => string): string {
  if (range === "today") {
    return translate("Today");
  }
  return translate(range);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard"
  }).format(value);
}

export function formatUsdCost(value: number | undefined): string {
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
    minimumFractionDigits: normalized >= 100 ? 0 : 2,
    style: "currency"
  }).format(normalized);
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function formatDuration(value: number): string {
  const milliseconds = Math.max(0, Number.isFinite(value) ? value : 0);
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }
  const seconds = milliseconds / 1000;
  return `${seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(1)}s`;
}

export function compareAccountSnapshots(a: ProviderAccountSnapshot, b: ProviderAccountSnapshot): number {
  return (
    accountStatusRank(b.status) - accountStatusRank(a.status) ||
    a.provider.localeCompare(b.provider) ||
    accountSnapshotCredentialLabel(a).localeCompare(accountSnapshotCredentialLabel(b))
  );
}

export function accountSnapshotLabel(snapshot: ProviderAccountSnapshot): string {
  const credential = accountSnapshotCredentialLabel(snapshot);
  return credential ? `${snapshot.provider} / ${credential}` : snapshot.provider;
}

export function accountSnapshotCredentialLabel(snapshot: ProviderAccountSnapshot): string {
  return snapshot.credentialLabel?.trim() || snapshot.credentialId?.trim() || "";
}

export function accountStatusRank(status: ProviderAccountSnapshot["status"]): number {
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

export function accountMetersForDisplay(snapshot: ProviderAccountSnapshot, maxCount: number): ProviderAccountMeter[] {
  const meters = snapshot.meters.slice(0, maxCount);
  const manualResetMeter = snapshot.meters.find(isAccountManualResetMeter);
  if (!manualResetMeter || meters.includes(manualResetMeter) || meters.length < maxCount) {
    return meters;
  }
  return [...meters.slice(0, Math.max(0, maxCount - 1)), manualResetMeter];
}

function isAccountManualResetMeter(meter: ProviderAccountMeter): boolean {
  const text = `${meter.id} ${meter.label} ${meter.window ?? ""}`.toLowerCase();
  return text.includes("manual_reset") || text.includes("manual reset") || text.includes("manual-reset");
}

export function meterRemainingRatio(meter: ProviderAccountMeter): number | undefined {
  if (!meter.limit || meter.limit <= 0 || meter.remaining === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(1, meter.remaining / meter.limit));
}

export function meterProgress(meter: ProviderAccountMeter): number | undefined {
  const ratio = meterRemainingRatio(meter);
  return ratio === undefined ? undefined : Math.max(3, Math.round(ratio * 100));
}

export function meterValidityProgress(meter: ProviderAccountMeter, now = Date.now()): number | undefined {
  const detail = currentMeterDetail(meter, now);
  const effectiveAt = meterDetailTimestamp(detail?.effectiveAt);
  const expiresAt = meterDetailTimestamp(detail?.expiresAt);
  if (effectiveAt === undefined || expiresAt === undefined || expiresAt <= effectiveAt || now < effectiveAt || now >= expiresAt) {
    return undefined;
  }
  const ratio = (expiresAt - now) / (expiresAt - effectiveAt);
  return Math.max(3, Math.round(Math.max(0, Math.min(1, ratio)) * 100));
}

function currentMeterDetail(meter: ProviderAccountMeter, now = Date.now()): NonNullable<ProviderAccountMeter["details"]>[number] | undefined {
  return (meter.details ?? [])
    .filter((detail) => {
      const effectiveAt = meterDetailTimestamp(detail.effectiveAt);
      const expiresAt = meterDetailTimestamp(detail.expiresAt);
      return effectiveAt !== undefined && expiresAt !== undefined && effectiveAt <= now && now < expiresAt;
    })
    .sort((a, b) => (meterDetailTimestamp(a.expiresAt) ?? Number.MAX_SAFE_INTEGER) - (meterDetailTimestamp(b.expiresAt) ?? Number.MAX_SAFE_INTEGER))[0];
}

function meterDetailTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function translateAccountMeterLabel(label: string, translate: (value: string) => string): string {
  return translate(label);
}

export function formatAccountMeterValue(meter: ProviderAccountMeter, translate: (value: string) => string): string {
  const value = meter.remaining ?? meter.used ?? meter.limit;
  if (value === undefined) {
    return "-";
  }
  const unit = meter.unit.trim();
  const normalizedUnit = unit.toUpperCase();
  if (normalizedUnit === "USD") {
    return `$${formatMeterNumber(value)}`;
  }
  if (normalizedUnit === "CNY") {
    return `¥${formatMeterNumber(value)}`;
  }
  if (normalizedUnit === "EUR") {
    return `€${formatMeterNumber(value)}`;
  }
  if (unit === "%") {
    return `${formatMeterNumber(value)}%`;
  }
  if (unit === "hours") {
    return `${formatMeterNumber(value)}h`;
  }
  if (unit === "minutes") {
    return `${formatMeterNumber(value)}m`;
  }
  if (meter.kind === "balance") {
    return `${formatMeterNumber(value)} ${translate(unit)}`;
  }
  return `${formatCompactNumber(value)} ${translate(unit)}`;
}

export function formatMeterNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

export function formatAccountReset(value: string, translate: (value: string) => string = (item) => item): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  if (minutes <= 0) {
    return translate("expired");
  }
  const prefix = translate("expires in");
  if (minutes < 60) {
    return `${prefix} ${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${prefix} ${hours}h`;
  }
  return `${prefix} ${Math.round(hours / 24)}d`;
}

export function formatAccountMeterTitle(meter: ProviderAccountMeter, translate: (value: string) => string): string {
  const label = translateAccountMeterLabel(meter.label, translate);
  return meter.resetAt ? `${label} (${formatAccountReset(meter.resetAt, translate)})` : label;
}

export function accountStatusClass(status: ProviderAccountSnapshot["status"]): string {
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

export function accountProgressClass(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "bg-rose-300";
  }
  if (status === "warning") {
    return "bg-amber-300";
  }
  return "bg-teal-300";
}

export function accountProgressColor(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "rgb(253,164,175)";
  }
  if (status === "warning") {
    return "rgb(252,211,77)";
  }
  return "rgb(45,212,191)";
}

export function readLanguagePreference(): AppLanguagePreference {
  try {
    return normalizeLanguagePreference(window.localStorage.getItem(languagePreferenceStorageKey));
  } catch {
    return "system";
  }
}

export function normalizeLanguagePreference(value: unknown): AppLanguagePreference {
  return value === "en" || value === "zh" || value === "system" ? value : "system";
}

export function detectSystemLanguage(): ResolvedLanguage {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}
