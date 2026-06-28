import {
  AppCopy, AppUpdateStatus, Button, Check, CircleAlert, cn, Dialog, DialogBody,
  DialogContent, DialogFooter, DialogHeader, DialogTitle, LoaderCircle, RefreshCw, X
} from "../shared";

export type UpdateActionBusy = "" | "check" | "download" | "install";

export function UpdateDialog({
  actionBusy,
  actionError,
  copy,
  onCheck,
  onClose,
  onDownload,
  onInstall,
  status
}: {
  actionBusy: UpdateActionBusy;
  actionError: string;
  copy: AppCopy;
  onCheck: () => Promise<void>;
  onClose: () => void;
  onDownload: () => Promise<void>;
  onInstall: () => Promise<void>;
  status: AppUpdateStatus;
}) {
  const t = (value: string) => copy.text[value] ?? value;
  const busy = Boolean(actionBusy) || status.state === "checking" || status.state === "downloading" || status.state === "installing";
  const canDownload = status.canDownload || status.state === "available";
  const canInstall = status.canInstall || status.state === "downloaded";
  const progressPercent = clampPercent(status.progress?.percent);
  const error = actionError || status.lastError || "";
  const installing = actionBusy === "install" || status.state === "installing";

  return (
    <Dialog onOpenChange={(open) => !open && !installing && onClose()} open>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Online updates")}</DialogTitle>
          </div>
          <Button aria-label={copy.settings.close} disabled={installing} onClick={onClose} size="iconSm" title={copy.settings.close} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-foreground">{updateStateLabel(status, t)}</div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{updateStateDescription(status, t)}</div>
            </div>
            <UpdateStateBadge label={updateStateLabel(status, t)} status={status} />
          </div>

          <div className="grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
            <UpdateInfoRow label={t("Current version")} value={status.currentVersion} />
            <UpdateInfoRow label={t("Available version")} value={status.availableVersion || "-"} />
            <UpdateInfoRow label={t("Last checked")} value={formatUpdateDate(status.lastCheckedAt) || "-"} />
            <UpdateInfoRow label={t("Feed URL")} value={status.feedUrl || "-"} />
          </div>

          {status.state === "downloading" ? (
            <div className="grid gap-2 rounded-md border border-border bg-muted/20 px-3 py-3">
              <div className="flex min-w-0 items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground">
                <span>{t("Downloading update")}</span>
                <span>{progressPercent !== undefined ? `${progressPercent.toFixed(0)}%` : ""}</span>
              </div>
              <div
                aria-label={t("Downloading update")}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progressPercent ?? 0}
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
              >
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progressPercent ?? 0}%` }} />
              </div>
              <div className="text-[11px] text-muted-foreground">{formatDownloadProgress(status.progress)}</div>
            </div>
          ) : null}

          {canInstall ? (
            <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-[12px] text-primary">
              {t("Update ready to install")}
            </div>
          ) : null}

          {!status.supported ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
              {t("Updates are only available in packaged builds.")}
            </div>
          ) : null}

          {error ? (
            <div className="flex min-w-0 items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          ) : null}

          {status.releaseNotes ? (
            <div className="grid gap-1 rounded-md border border-border bg-background px-3 py-2">
              <div className="text-[11px] font-semibold text-muted-foreground">{t("Release notes")}</div>
              <div className="max-h-36 overflow-auto whitespace-pre-wrap text-[12px] leading-5 text-foreground">{status.releaseNotes}</div>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button disabled={installing} onClick={onClose} type="button" variant="outline">
            {t("Close")}
          </Button>
          <Button disabled={busy || !status.canCheck} onClick={() => void onCheck()} type="button" variant="outline">
            {actionBusy === "check" || status.state === "checking" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("Check for updates")}
          </Button>
          <Button disabled={busy || !canDownload} onClick={() => void onDownload()} type="button" variant="outline">
            {actionBusy === "download" || status.state === "downloading" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("Download update")}
          </Button>
          <Button disabled={busy || !canInstall} onClick={() => void onInstall()} type="button">
            {installing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("Install and restart")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdateInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 truncate text-[12px] font-medium text-foreground" title={value}>{value}</div>
    </div>
  );
}

function UpdateStateBadge({ label, status }: { label: string; status: AppUpdateStatus }) {
  return (
    <span className={cn(
      "shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium",
      status.state === "error"
        ? "border-destructive/25 bg-destructive/10 text-destructive"
        : status.state === "available" || status.state === "downloaded" || status.state === "downloading"
          ? "border-primary/25 bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground"
    )}>
      {label}
    </span>
  );
}

function updateStateLabel(status: AppUpdateStatus, t: (value: string) => string): string {
  if (!status.supported) return t("Not configured");
  if (status.state === "checking") return t("Checking for updates");
  if (status.state === "available") return t("Update available");
  if (status.state === "not-available") return t("No updates available");
  if (status.state === "downloading") return t("Downloading update");
  if (status.state === "downloaded") return t("Update ready to install");
  if (status.state === "installing") return t("Install and restart");
  if (status.state === "error") return t("Update failed");
  return t("Check for updates");
}

function updateStateDescription(status: AppUpdateStatus, t: (value: string) => string): string {
  if (!status.supported) return t("Updates are only available in packaged builds.");
  if (status.state === "available" && status.availableVersion) return `${t("Available version")}: ${status.availableVersion}`;
  if (status.state === "downloaded") return t("Update downloaded");
  if (status.state === "not-available") return t("No updates available");
  if (status.state === "downloading") return t("Downloading update");
  return t("Online updates");
}

function clampPercent(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, value));
}

function formatDownloadProgress(progress: AppUpdateStatus["progress"]): string {
  if (!progress) {
    return "";
  }
  const transferred = formatBytes(progress.transferred);
  const total = formatBytes(progress.total);
  const speed = formatBytes(progress.bytesPerSecond);
  return [
    transferred && total ? `${transferred} / ${total}` : transferred || total,
    speed ? `${speed}/s` : ""
  ].filter(Boolean).join(" | ");
}

function formatBytes(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current >= 10 || unitIndex === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unitIndex]}`;
}

function formatUpdateDate(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}
