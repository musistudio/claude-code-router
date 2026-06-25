import { app, dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { APP_NAME, IPC_CHANNELS } from "./constants";
import { appUpdateService } from "./update-service";
import windowsManager from "./windows";
import type { AppUpdateStatus } from "../shared/app";

export function setupApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createMenuTemplate()));
}

function createMenuTemplate(): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === "darwin") {
    template.push({
      label: APP_NAME,
      submenu: [
        { label: `About ${APP_NAME}`, click: showAboutPanel },
        { type: "separator" },
        { label: "Settings...", accelerator: "CmdOrCtrl+,", click: openSettings },
        { label: "Check for Updates...", click: checkForUpdatesFromMenu },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    });
  } else {
    template.push({
      label: "File",
      submenu: [
        { label: "Settings...", accelerator: "Ctrl+,", click: openSettings },
        { type: "separator" },
        { role: "quit" }
      ]
    });
  }

  template.push(
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(process.platform === "darwin"
          ? [
              { role: "pasteAndMatchStyle" as const },
              { role: "delete" as const },
              { role: "selectAll" as const },
              { type: "separator" as const },
              {
                label: "Speech",
                submenu: [
                  { role: "startSpeaking" as const },
                  { role: "stopSpeaking" as const }
                ]
              }
            ]
          : [
              { role: "delete" as const },
              { type: "separator" as const },
              { role: "selectAll" as const }
            ])
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: process.platform === "darwin"
        ? [
            { role: "minimize" },
            { role: "zoom" },
            { type: "separator" },
            { role: "front" }
          ]
        : [
            { role: "minimize" },
            { role: "close" }
          ]
    }
  );

  if (process.platform !== "darwin") {
    template.push({
      label: "Help",
      submenu: [
        { label: "Check for Updates...", click: checkForUpdatesFromMenu },
        { type: "separator" },
        { label: `About ${APP_NAME}`, click: showAboutPanel }
      ]
    });
  }

  return template;
}

function openSettings(): void {
  const window = windowsManager.showMainWindow();
  sendWhenReady(window, IPC_CHANNELS.appOpenSettings);
}

function showAboutPanel(): void {
  const window = windowsManager.getWindow("main");
  const options = {
    detail: `Version ${app.getVersion()}`,
    message: APP_NAME,
    title: `About ${APP_NAME}`,
    type: "info"
  } as const;
  void (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
}

function checkForUpdatesFromMenu(): void {
  const window = windowsManager.showMainWindow();
  void checkForUpdatesWithDialog(window);
}

async function checkForUpdatesWithDialog(window: BrowserWindow): Promise<void> {
  try {
    await presentUpdateStatus(window, await appUpdateService.checkForUpdates());
  } catch (error) {
    await showUpdateDialog(window, {
      detail: formatError(error),
      message: "Update check failed.",
      type: "error"
    });
  }
}

async function presentUpdateStatus(window: BrowserWindow, status: AppUpdateStatus): Promise<void> {
  if (status.state === "not-available") {
    await showUpdateDialog(window, {
      detail: `Version ${status.currentVersion} is currently installed.`,
      message: `${APP_NAME} is up to date.`,
      type: "info"
    });
    return;
  }

  if (status.state === "available") {
    const result = await showUpdateDialog(window, {
      buttons: ["Download", "Later"],
      cancelId: 1,
      detail: status.availableVersion
        ? `Version ${status.availableVersion} is available.`
        : "An update is available.",
      message: "Update available.",
      type: "info"
    });
    if (result.response === 0) {
      await downloadUpdateFromMenu(window);
    }
    return;
  }

  if (status.state === "downloaded") {
    await promptInstallUpdate(window);
    return;
  }

  if (status.state === "error") {
    await showUpdateDialog(window, {
      detail: status.lastError || "Unable to check for updates.",
      message: "Update check failed.",
      type: "error"
    });
  }
}

async function downloadUpdateFromMenu(window: BrowserWindow): Promise<void> {
  try {
    const status = await appUpdateService.downloadUpdate();
    if (status.state === "downloaded" || status.canInstall) {
      await promptInstallUpdate(window);
      return;
    }
    if (status.state === "error") {
      await showUpdateDialog(window, {
        detail: status.lastError || "Unable to download the update.",
        message: "Update download failed.",
        type: "error"
      });
    }
  } catch (error) {
    await showUpdateDialog(window, {
      detail: formatError(error),
      message: "Update download failed.",
      type: "error"
    });
  }
}

async function promptInstallUpdate(window: BrowserWindow): Promise<void> {
  const result = await showUpdateDialog(window, {
    buttons: ["Install and Restart", "Later"],
    cancelId: 1,
    detail: "The update has been downloaded and is ready to install.",
    message: "Update ready to install.",
    type: "info"
  });

  if (result.response !== 0) {
    return;
  }

  try {
    await appUpdateService.installUpdate();
  } catch (error) {
    await showUpdateDialog(window, {
      detail: formatError(error),
      message: "Update install failed.",
      type: "error"
    });
  }
}

function showUpdateDialog(
  window: BrowserWindow,
  options: { buttons?: string[]; cancelId?: number; detail: string; message: string; type: "error" | "info" }
): Promise<Electron.MessageBoxReturnValue> {
  return dialog.showMessageBox(window, {
    buttons: options.buttons ?? ["OK"],
    cancelId: options.cancelId,
    defaultId: 0,
    detail: options.detail,
    message: options.message,
    title: "Software Update",
    type: options.type
  });
}

function sendWhenReady(window: BrowserWindow, channel: string): void {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  const send = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel);
    }
  };

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", send);
    return;
  }

  send();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
