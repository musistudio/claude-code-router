import { app, dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { APP_NAME, IPC_CHANNELS } from "./constants";
import windowsManager from "./windows";

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
