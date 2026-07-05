import { app } from "electron";
import type { AppConfig } from "@ccr/core/contracts/app";

export function isLaunchAtLoginSupported(platform = process.platform): boolean {
  return platform === "darwin" || platform === "win32";
}

export function syncLaunchAtLogin(config: Pick<AppConfig, "launchAtLogin">): void {
  if (!isLaunchAtLoginSupported()) {
    return;
  }
  app.setLoginItemSettings(loginItemSettings(Boolean(config.launchAtLogin)));
}

function loginItemSettings(openAtLogin: boolean): Electron.Settings {
  const settings: Electron.Settings = {
    openAtLogin
  };

  if (process.platform === "darwin") {
    settings.openAsHidden = false;
    return settings;
  }

  settings.path = process.execPath;
  settings.args = process.defaultApp ? [app.getAppPath()] : [];
  return settings;
}
