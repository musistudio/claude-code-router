import { app } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateDownloadedEvent, type UpdateInfo } from "electron-updater";
import { IPC_CHANNELS } from "@ccr/core/config/constants";
import windowsManager from "./windows";
import type { AppUpdateStatus } from "@ccr/core/contracts/app";

type InstallPreparation = () => Promise<void>;
type UpdateCheckOptions = {
  silentFailure?: boolean;
};

const startupCheckDelayMs = 12_000;

class AppUpdateService {
  private activeSilentCheckFailureRestoreStatus?: AppUpdateStatus;
  private initialized = false;
  private installingUpdate = false;
  private prepareInstall?: InstallPreparation;
  private startupCheckTimer?: NodeJS.Timeout;
  private status: AppUpdateStatus = this.deriveStatus({
    canCheck: false,
    canDownload: false,
    canInstall: false,
    currentVersion: app.getVersion(),
    state: "idle",
    supported: this.isUpdaterSupported()
  });

  start(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.configureUpdater();
    this.registerUpdaterEvents();
    this.publishStatus({ feedUrl: autoUpdater.getFeedURL() || undefined });

    if (this.isUpdaterSupported()) {
      this.queueStartupCheck();
    }
  }

  getStatus(): AppUpdateStatus {
    return this.status;
  }

  setInstallPreparation(callback: InstallPreparation): void {
    this.prepareInstall = callback;
  }

  isInstallingUpdate(): boolean {
    return this.installingUpdate;
  }

  async checkForUpdates(options: UpdateCheckOptions = {}): Promise<AppUpdateStatus> {
    this.start();
    if (!this.isUpdaterSupported()) {
      return this.publishStatus({
        lastError: "Updates are only available in packaged builds.",
        state: "error"
      });
    }

    const restoreStatus = options.silentFailure ? this.status : undefined;
    this.activeSilentCheckFailureRestoreStatus = restoreStatus;
    this.publishStatus({
      lastError: undefined,
      progress: undefined,
      state: "checking"
    });

    try {
      const result = await autoUpdater.checkForUpdates();
      const checkedAt = new Date().toISOString();

      if (!result) {
        return this.publishStatus({
          availableVersion: undefined,
          downloadedAt: undefined,
          lastCheckedAt: checkedAt,
          progress: undefined,
          releaseDate: undefined,
          releaseName: undefined,
          releaseNotes: undefined,
          state: "not-available"
        });
      }

      if (result.isUpdateAvailable) {
        return this.publishUpdateInfo("available", result.updateInfo, {
          downloadedAt: undefined,
          lastCheckedAt: checkedAt,
          progress: undefined
        });
      }

      return this.publishUpdateInfo("not-available", result.updateInfo, {
        availableVersion: undefined,
        downloadedAt: undefined,
        lastCheckedAt: checkedAt,
        progress: undefined
      });
    } catch (error) {
      if (options.silentFailure && restoreStatus) {
        return this.publishSilentCheckFailure(error, restoreStatus);
      }
      return this.publishStatus({
        lastError: formatError(error),
        progress: undefined,
        state: "error"
      });
    } finally {
      if (this.activeSilentCheckFailureRestoreStatus === restoreStatus) {
        this.activeSilentCheckFailureRestoreStatus = undefined;
      }
    }
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    this.start();
    if (!this.status.canDownload) {
      const checkedStatus = await this.checkForUpdates();
      if (checkedStatus.state === "downloaded" || checkedStatus.canDownload) {
        return this.downloadUpdate();
      }
      return checkedStatus;
    }

    this.publishStatus({
      lastError: undefined,
      progress: undefined,
      state: "downloading"
    });

    try {
      await autoUpdater.downloadUpdate();
      return this.status;
    } catch (error) {
      const status = this.publishStatus({
        lastError: formatError(error),
        state: "error"
      });
      throw new Error(status.lastError);
    }
  }

  async installUpdate(): Promise<void> {
    this.start();
    if (!this.status.canInstall) {
      const status = this.publishStatus({
        lastError: "No downloaded update is ready to install.",
        state: "error"
      });
      throw new Error(status.lastError);
    }

    this.installingUpdate = true;
    this.publishStatus({
      lastError: undefined,
      state: "installing"
    });

    try {
      await this.prepareInstall?.();
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      this.installingUpdate = false;
      this.publishStatus({
        lastError: formatError(error),
        state: "error"
      });
      throw error;
    }
  }

  private configureUpdater(): void {
    const feedUrl = readEnvString("CCR_UPDATE_FEED_URL");
    if (feedUrl) {
      autoUpdater.setFeedURL({
        provider: "generic",
        url: feedUrl
      });
      autoUpdater.forceDevUpdateConfig = true;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = readEnvBoolean("CCR_UPDATE_ALLOW_PRERELEASE");
    autoUpdater.fullChangelog = true;
    autoUpdater.logger = {
      debug: (message) => console.debug(`[update] ${message}`),
      error: (message) => console.error(`[update] ${String(message)}`),
      info: (message) => console.info(`[update] ${String(message)}`),
      warn: (message) => console.warn(`[update] ${String(message)}`)
    };
  }

  private registerUpdaterEvents(): void {
    autoUpdater.on("checking-for-update", () => {
      this.publishStatus({
        lastError: undefined,
        progress: undefined,
        state: "checking"
      });
    });
    autoUpdater.on("update-available", (info) => {
      this.publishUpdateInfo("available", info, {
        downloadedAt: undefined,
        lastCheckedAt: new Date().toISOString(),
        progress: undefined
      });
    });
    autoUpdater.on("update-not-available", (info) => {
      this.publishUpdateInfo("not-available", info, {
        availableVersion: undefined,
        downloadedAt: undefined,
        lastCheckedAt: new Date().toISOString(),
        progress: undefined
      });
    });
    autoUpdater.on("download-progress", (progress) => {
      this.publishStatus({
        progress: normalizeProgress(progress),
        state: "downloading"
      });
    });
    autoUpdater.on("update-downloaded", (event) => {
      this.publishUpdateInfo("downloaded", event, {
        downloadedAt: new Date().toISOString(),
        lastError: undefined,
        progress: normalizeProgress({
          bytesPerSecond: 0,
          delta: 0,
          percent: 100,
          total: 0,
          transferred: 0
        })
      });
    });
    autoUpdater.on("update-cancelled", (info) => {
      this.publishUpdateInfo("available", info, {
        lastError: "Update download was cancelled.",
        progress: undefined
      });
    });
    autoUpdater.on("error", (error) => {
      if (this.activeSilentCheckFailureRestoreStatus) {
        this.publishSilentCheckFailure(error, this.activeSilentCheckFailureRestoreStatus);
        return;
      }
      this.publishStatus({
        lastError: formatError(error),
        progress: undefined,
        state: "error"
      });
    });
  }

  private queueStartupCheck(): void {
    if (this.startupCheckTimer) {
      return;
    }
    this.startupCheckTimer = setTimeout(() => {
      this.startupCheckTimer = undefined;
      void this.checkForUpdates({ silentFailure: true });
    }, readEnvNumber("CCR_UPDATE_STARTUP_DELAY_MS") ?? startupCheckDelayMs);
    this.startupCheckTimer.unref?.();
  }

  private publishSilentCheckFailure(error: unknown, restoreStatus: AppUpdateStatus): AppUpdateStatus {
    const state = restoreStatus.state === "checking" || restoreStatus.state === "error" ? "idle" : restoreStatus.state;
    return this.publishStatus({
      availableVersion: restoreStatus.availableVersion,
      downloadedAt: restoreStatus.downloadedAt,
      lastCheckedAt: restoreStatus.lastCheckedAt,
      lastError: formatError(error),
      progress: restoreStatus.progress,
      releaseDate: restoreStatus.releaseDate,
      releaseName: restoreStatus.releaseName,
      releaseNotes: restoreStatus.releaseNotes,
      state
    });
  }

  private publishUpdateInfo(
    state: AppUpdateStatus["state"],
    info: UpdateInfo | UpdateDownloadedEvent,
    patch: Partial<AppUpdateStatus> = {}
  ): AppUpdateStatus {
    return this.publishStatus({
      availableVersion: info.version,
      lastError: undefined,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName || undefined,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      state,
      ...patch
    });
  }

  private publishStatus(patch: Partial<AppUpdateStatus>): AppUpdateStatus {
    this.status = this.deriveStatus({
      ...this.status,
      ...patch,
      currentVersion: app.getVersion(),
      feedUrl: autoUpdater.getFeedURL() || this.status.feedUrl,
      supported: this.isUpdaterSupported()
    });
    windowsManager.broadcast(IPC_CHANNELS.appUpdateStatusChanged, this.status);
    return this.status;
  }

  private deriveStatus(status: AppUpdateStatus): AppUpdateStatus {
    const busy = status.state === "checking" || status.state === "downloading" || status.state === "installing";
    return {
      ...status,
      canCheck: status.supported && !busy,
      canDownload: status.supported && status.state === "available",
      canInstall: status.supported && status.state === "downloaded"
    };
  }

  private isUpdaterSupported(): boolean {
    return app.isPackaged || Boolean(readEnvString("CCR_UPDATE_FEED_URL"));
  }
}

export const appUpdateService = new AppUpdateService();

function normalizeProgress(progress: ProgressInfo): AppUpdateStatus["progress"] {
  return {
    bytesPerSecond: finiteNumber(progress.bytesPerSecond),
    percent: finiteNumber(progress.percent),
    total: finiteNumber(progress.total),
    transferred: finiteNumber(progress.transferred)
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatReleaseNotes(notes: UpdateInfo["releaseNotes"]): string | undefined {
  if (typeof notes === "string") {
    return notes.trim() || undefined;
  }
  if (!Array.isArray(notes)) {
    return undefined;
  }
  return notes
    .map((item) => [item.version, item.note].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n") || undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readEnvString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readEnvBoolean(name: string): boolean {
  const value = readEnvString(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function readEnvNumber(name: string): number | undefined {
  const value = readEnvString(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
