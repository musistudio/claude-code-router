import type {
  ProviderAccountMeter,
  ProviderAccountSnapshot
} from "@ccr/core/contracts/app";
import {
  formatCompactNumber
} from "./usage";

export function compareProviderAccountSnapshots(a: ProviderAccountSnapshot, b: ProviderAccountSnapshot): number {
  return (
    providerAccountStatusRank(b.status) - providerAccountStatusRank(a.status) ||
    a.provider.localeCompare(b.provider) ||
    providerAccountSnapshotCredentialLabel(a).localeCompare(providerAccountSnapshotCredentialLabel(b))
  );
}

export function providerAccountSnapshotKey(account: ProviderAccountSnapshot): string {
  return account.credentialId ? `${account.provider}::${account.credentialId}` : account.provider;
}

export function providerAccountSnapshotLabel(account: ProviderAccountSnapshot): string {
  const credential = providerAccountSnapshotCredentialLabel(account);
  return credential ? `${account.provider} / ${credential}` : account.provider;
}

export function providerAccountSnapshotCredentialLabel(account: ProviderAccountSnapshot): string {
  return account.credentialLabel?.trim() || account.credentialId?.trim() || "";
}

export function providerAccountStatusRank(status: ProviderAccountSnapshot["status"]): number {
  if (status === "error") return 4;
  if (status === "critical") return 3;
  if (status === "warning") return 2;
  if (status === "ok") return 1;
  return 0;
}

export function primaryProviderAccountMeter(account: ProviderAccountSnapshot): ProviderAccountMeter | undefined {
  return [...account.meters].sort((a, b) => {
    const aRatio = providerAccountMeterRemainingRatio(a) ?? 1;
    const bRatio = providerAccountMeterRemainingRatio(b) ?? 1;
    return aRatio - bRatio;
  })[0];
}

export function providerAccountMetersForDisplay(account: ProviderAccountSnapshot, maxCount: number): ProviderAccountMeter[] {
  const meters = account.meters.slice(0, maxCount);
  const manualResetMeter = account.meters.find(isProviderAccountManualResetMeter);
  if (!manualResetMeter || meters.includes(manualResetMeter) || meters.length < maxCount) {
    return meters;
  }
  return [...meters.slice(0, Math.max(0, maxCount - 1)), manualResetMeter];
}

export function providerAccountMeterRemainingRatio(meter: ProviderAccountMeter): number | undefined {
  if (!meter.limit || meter.limit <= 0 || meter.remaining === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(1, meter.remaining / meter.limit));
}

export function providerAccountMeterProgress(meter: ProviderAccountMeter): number | undefined {
  const ratio = providerAccountMeterRemainingRatio(meter);
  return ratio === undefined ? undefined : Math.max(3, Math.round(ratio * 100));
}

export function providerAccountMeterValidityProgress(meter: ProviderAccountMeter, now = Date.now()): number | undefined {
  const detail = providerAccountCurrentMeterDetail(meter, now);
  if (!detail) {
    return undefined;
  }
  const progress = providerAccountMeterDetailValidityProgress(detail, now);
  return progress && progress > 0 ? progress : undefined;
}

export function providerAccountCurrentMeterDetail(meter: ProviderAccountMeter, now = Date.now()): NonNullable<ProviderAccountMeter["details"]>[number] | undefined {
  return (meter.details ?? [])
    .filter((detail) => {
      const effectiveAt = providerAccountDetailTimestamp(detail.effectiveAt);
      const expiresAt = providerAccountDetailTimestamp(detail.expiresAt);
      return effectiveAt !== undefined && expiresAt !== undefined && effectiveAt <= now && now < expiresAt;
    })
    .sort((a, b) => (providerAccountDetailTimestamp(a.expiresAt) ?? Number.MAX_SAFE_INTEGER) - (providerAccountDetailTimestamp(b.expiresAt) ?? Number.MAX_SAFE_INTEGER))[0];
}

export function providerAccountMeterDetailValidityProgress(detail: NonNullable<ProviderAccountMeter["details"]>[number], now = Date.now()): number | undefined {
  const effectiveAt = providerAccountDetailTimestamp(detail.effectiveAt);
  const expiresAt = providerAccountDetailTimestamp(detail.expiresAt);
  if (effectiveAt === undefined || expiresAt === undefined || expiresAt <= effectiveAt) {
    return undefined;
  }
  if (now <= effectiveAt) {
    return 100;
  }
  if (now >= expiresAt) {
    return 0;
  }
  const ratio = (expiresAt - now) / (expiresAt - effectiveAt);
  return Math.max(3, Math.round(Math.max(0, Math.min(1, ratio)) * 100));
}

export function formatProviderAccountDetailDate(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function providerAccountDetailTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function providerAccountBadgeVariant(status: ProviderAccountSnapshot["status"]): "danger" | "outline" | "success" | "warning" {
  if (status === "critical" || status === "error") {
    return "danger";
  }
  if (status === "warning") {
    return "warning";
  }
  if (status === "ok") {
    return "success";
  }
  return "outline";
}

export function providerAccountProgressClass(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "bg-red-500";
  }
  if (status === "warning") {
    return "bg-amber-500";
  }
  return "bg-emerald-500";
}

export function formatProviderAccountMeterValue(
  meter: ProviderAccountMeter,
  translate: (value: string) => string = (value) => value
): string {
  const value = meter.remaining ?? meter.used ?? meter.limit;
  if (value === undefined) {
    return "-";
  }
  const unit = meter.unit.trim();
  const normalizedUnit = unit.toUpperCase();
  if (normalizedUnit === "USD") {
    return `$${formatProviderAccountNumber(value)}`;
  }
  if (normalizedUnit === "CNY") {
    return `¥${formatProviderAccountNumber(value)}`;
  }
  if (normalizedUnit === "EUR") {
    return `€${formatProviderAccountNumber(value)}`;
  }
  if (unit === "%") {
    return `${formatProviderAccountNumber(value)}%`;
  }
  if (unit === "hours") {
    return `${formatProviderAccountNumber(value)}h`;
  }
  if (unit === "minutes") {
    return `${formatProviderAccountNumber(value)}m`;
  }
  const displayUnit = translate(unit);
  if (meter.kind === "balance") {
    return `${formatProviderAccountNumber(value)} ${displayUnit}`;
  }
  return `${formatCompactNumber(value)} ${displayUnit}`;
}

export function formatProviderAccountNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

// 仅返回剩余时长（如「3h28m」「1d17h」「05m」）；非法时间或已过期返回 undefined
// 与 formatProviderAccountReset 的差异：不携带「expires in / expired」文案前缀
// （dashboard 的 meter 行用 🕛/📆 图标代替文字前缀）。
// 分钟/小时始终补零两位（05m、3h05m），天/小时首段不补零，配合等宽字体（font-mono）对齐。
export function formatProviderAccountResetDuration(value: string): string | undefined {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  if (minutes <= 0) {
    return undefined;
  }
  const pad2 = (n: number) => String(n).padStart(2, "0");
  if (minutes < 60) {
    return `${pad2(minutes)}m`;
  }
  const totalHours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (totalHours < 24) {
    return `${totalHours}h${pad2(mins)}m`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d${pad2(hours)}h`;
}

export function formatProviderAccountReset(value: string, translate: (value: string) => string = (item) => item): string {
  const duration = formatProviderAccountResetDuration(value);
  if (duration === undefined) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? translate("expired") : value;
  }
  return `${translate("expires in")} ${duration}`;
}

export function formatProviderAccountMeterTitle(meter: ProviderAccountMeter, translate: (value: string) => string): string {
  const label = translate(meter.label);
  return meter.resetAt ? `${label} (${formatProviderAccountReset(meter.resetAt, translate)})` : label;
}

// 紧凑 meter 标题：`label ☀️ 1d17h` / `label 🕛 3h28m`（无「剩余」前缀，emoji 按天/小时级区分）。
// 供 tray 状态栏与 dashboard 其他 meter 渲染点复用，与 ProviderAccountMeterLine 行内样式保持一致。
export function formatProviderAccountMeterTitleCompact(
  meter: ProviderAccountMeter,
  translate: (value: string) => string = (item) => item
): string {
  const label = translate(meter.label);
  if (!meter.resetAt) {
    return label;
  }
  const duration = formatProviderAccountResetDuration(meter.resetAt);
  if (duration === undefined) {
    return `${label} ${translate("expired")}`;
  }
  const icon = duration.includes("d") ? "☀️" : "🕛";
  return `${label} ${icon} ${duration}`;
}

export function isProviderAccountManualResetMeter(meter: ProviderAccountMeter): boolean {
  const text = `${meter.id} ${meter.label} ${meter.window ?? ""}`.toLowerCase();
  return text.includes("manual_reset") || text.includes("manual reset") || text.includes("manual-reset");
}
