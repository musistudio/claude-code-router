import {
  AppCopy, AppUpdateStatus, Button, Check, CircleAlert, cn, Dialog, DialogBody,
  DialogContent, DialogFooter, DialogHeader, DialogTitle, Download, LoaderCircle, RefreshCw, X
} from "../shared/index";

export type UpdateActionBusy = "" | "check" | "download" | "install";

export function shouldCheckForUpdateOnOpen(status: AppUpdateStatus): boolean {
  return status.state === "idle" || status.state === "not-available" || status.state === "error";
}

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
  const canRetryDownload = status.state === "error" && status.supported && Boolean(status.availableVersion);
  const canInstall = status.canInstall || status.state === "downloaded";
  const progressPercent = clampPercent(status.progress?.percent);
  const error = actionError || status.lastError || "";
  const displayedError = error ? t(error) : "";
  const installing = actionBusy === "install" || status.state === "installing";
  const primaryAction = updatePrimaryAction({
    actionBusy,
    canDownload: canDownload || canRetryDownload,
    canInstall,
    onCheck,
    onDownload,
    onInstall,
    status,
    t
  });
  const releaseNotes = formatUpdateReleaseNotes(status.releaseNotes);
  const showStateBadge = status.state === "error" ||
    status.state === "not-available" ||
    status.state === "available" ||
    status.state === "downloaded" ||
    status.state === "downloading";

  return (
    <Dialog onOpenChange={(open) => !open && !installing && onClose()} open>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
            <DialogTitle>{t("Online updates")}</DialogTitle>
            {showStateBadge ? (
              <UpdateStateBadge
                label={updateStateLabel(status, t)}
                status={status}
              />
            ) : null}
          </div>
          <Button aria-label={copy.settings.close} disabled={installing} onClick={onClose} size="iconSm" title={copy.settings.close} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
            <UpdateInfoRow label={t("Current version")} value={status.currentVersion} />
            <UpdateInfoRow
              label={t("Latest version")}
              value={status.availableVersion || (status.state === "not-available" ? status.currentVersion : "-")}
            />
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
              {t("Update downloaded. Restart to finish updating.")}
            </div>
          ) : null}

          {!status.supported ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
              {t("Updates are only available in packaged builds.")}
            </div>
          ) : null}

          {displayedError ? (
            <div className="flex min-w-0 items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{displayedError}</span>
            </div>
          ) : null}

          {releaseNotes ? (
            <div className="grid gap-1 rounded-md border border-border bg-background px-3 py-2">
              <div className="text-[11px] font-semibold text-muted-foreground">{t("Release notes")}</div>
              <div className="max-h-44 overflow-auto whitespace-pre-wrap text-[12px] leading-5 text-foreground">{releaseNotes}</div>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button disabled={installing} onClick={onClose} type="button" variant="outline">
            {t("Close")}
          </Button>
          {primaryAction ? (
            <Button disabled={primaryAction.disabled || busy} onClick={() => void primaryAction.onClick()} type="button">
              {primaryAction.icon}
              {primaryAction.label}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdateInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
      <div
        className={cn("mt-1 min-w-0 truncate text-[12px] font-medium text-foreground")}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function updatePrimaryAction({
  actionBusy,
  canDownload,
  canInstall,
  onCheck,
  onDownload,
  onInstall,
  status,
  t
}: {
  actionBusy: UpdateActionBusy;
  canDownload: boolean;
  canInstall: boolean;
  onCheck: () => Promise<void>;
  onDownload: () => Promise<void>;
  onInstall: () => Promise<void>;
  status: AppUpdateStatus;
  t: (value: string) => string;
}): { disabled: boolean; icon: JSX.Element; label: string; onClick: () => Promise<void> } | undefined {
  if (canInstall || status.state === "installing" || actionBusy === "install") {
    const installing = status.state === "installing" || actionBusy === "install";
    return {
      disabled: installing || !canInstall,
      icon: installing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />,
      label: t("Install and restart"),
      onClick: onInstall
    };
  }

  if (canDownload || status.state === "downloading" || actionBusy === "download") {
    const downloading = status.state === "downloading" || actionBusy === "download";
    return {
      disabled: downloading || !canDownload,
      icon: downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />,
      label: status.state === "error" ? t("Retry download") : downloading ? t("Downloading update") : t("Download update"),
      onClick: onDownload
    };
  }

  if (status.canCheck || status.state === "checking" || actionBusy === "check") {
    const checking = status.state === "checking" || actionBusy === "check";
    return {
      disabled: checking || !status.canCheck,
      icon: checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />,
      label: checking ? t("Checking for updates") : t("Check for updates"),
      onClick: onCheck
    };
  }

  return undefined;
}

function UpdateStateBadge({ label, status }: { label: string; status: AppUpdateStatus }) {
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium",
      status.state === "error"
        ? "border-destructive/25 bg-destructive/10 text-destructive"
        : status.state === "not-available"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status.state === "available" || status.state === "downloaded" || status.state === "downloading"
          ? "border-amber-200 bg-amber-50 text-amber-700"
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

export function formatUpdateReleaseNotes(notes: string | undefined): string {
  if (!notes?.trim()) {
    return "";
  }

  const text = decodeHtmlEntities(notes
    .replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "\n")
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(?:p|div|section|h[1-6]|ul|ol)\s*>/gi, "\n")
    .replace(/<\s*(?:p|div|section|h[1-6]|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, ""));

  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cleaned = cleanReleaseNoteLine(line);
    if (cleaned && cleaned !== lines[lines.length - 1]) {
      lines.push(cleaned);
    }
  }

  const maxLines = 14;
  return [
    ...lines.slice(0, maxLines),
    ...(lines.length > maxLines ? ["..."] : [])
  ].join("\n");
}

function cleanReleaseNoteLine(value: string): string {
  const line = value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+by\s+@[\w-]+(?:\s+in\s+#\d+)?$/i, "")
    .replace(/\s+in\s+#\d+$/i, "")
    .trim();

  if (!line || line === "-") {
    return "";
  }
  if (/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/i.test(line)) {
    return "";
  }
  if (/^(what'?s changed|full changelog|new contributors)$/i.test(line)) {
    return "";
  }
  if (/^full changelog\s*:/i.test(line)) {
    return "";
  }
  return line;
}

function decodeHtmlEntities(value: string): string {
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  }
  return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return "\"";
    if (normalized === "apos") return "'";
    if (normalized === "nbsp") return " ";
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return validCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return validCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return match;
  });
}

function validCodePoint(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff;
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
