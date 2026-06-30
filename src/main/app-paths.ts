import os from "node:os";
import path from "node:path";

export const APP_NAME = "Claude Code Router";
export const APP_STORAGE_NAME = "claude-code-router";
export const LEGACY_CONFIGDIR = path.join(os.homedir(), ".claude-code-router");

const homeDirEnv = "CCR_INTERNAL_HOME_DIR";
const appDataDirEnv = "CCR_INTERNAL_APP_DATA_DIR";
const userDataDirEnv = "CCR_INTERNAL_USER_DATA_DIR";

type RuntimePathName = "appData" | "home" | "userData";

export type RuntimeAppPaths = Partial<Record<RuntimePathName, string>>;

export function setRuntimeAppPaths(paths: RuntimeAppPaths): void {
  setPathEnv(homeDirEnv, paths.home);
  setPathEnv(appDataDirEnv, paths.appData);
  setPathEnv(userDataDirEnv, paths.userData);
}

export function resolveRuntimeAppPath(name: RuntimePathName): string {
  const configured = readConfiguredPath(name);
  if (configured) {
    return configured;
  }
  if (name === "home") {
    return os.homedir();
  }
  if (name === "appData") {
    return fallbackAppDataDir();
  }
  return fallbackUserDataDir();
}

function readConfiguredPath(name: RuntimePathName): string | undefined {
  const key = name === "home"
    ? homeDirEnv
    : name === "appData"
      ? appDataDirEnv
      : userDataDirEnv;
  const value = process.env[key]?.trim();
  return value || undefined;
}

function setPathEnv(key: string, value: string | undefined): void {
  if (value?.trim()) {
    process.env[key] = value;
  }
}

function fallbackAppDataDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ||
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : path.join(os.homedir(), "AppData", "Roaming"));
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function fallbackUserDataDir(): string {
  if (process.platform === "win32") {
    return path.join(fallbackAppDataDir(), APP_STORAGE_NAME);
  }
  return path.join(LEGACY_CONFIGDIR, "app-data");
}
