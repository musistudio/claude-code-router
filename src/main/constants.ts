import * as electron from "electron";
import os from "node:os";
import path from "node:path";
export { IPC_CHANNELS } from "../shared/ipc-channels";

export const APP_NAME = "Claude Code Router";

const electronApp = typeof electron.app?.getPath === "function" ? electron.app : undefined;
export const LEGACY_CONFIGDIR = path.join(os.homedir(), ".claude-code-router");
export const LEGACY_CONFIG_FILE = path.join(LEGACY_CONFIGDIR, "config.json");

function appPath(name: "appData" | "home" | "userData"): string {
  if (electronApp) {
    return electronApp.getPath(name);
  }
  if (name === "home") {
    return os.homedir();
  }
  if (name === "appData") {
    return process.env.APPDATA ||
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : path.join(os.homedir(), "AppData", "Roaming"));
  }
  return path.join(LEGACY_CONFIGDIR, "app-data");
}

export const CONFIGDIR = process.platform === "win32"
  ? path.join(appPath("appData"), APP_NAME)
  : LEGACY_CONFIGDIR;
export const CONFIG_FILE = path.join(CONFIGDIR, "config.json");
export const ONBOARDING_FINISHED_FILE = path.join(CONFIGDIR, ".onboard_finished");
export const DATADIR = appPath("userData");
export const APP_CONFIG_DB_FILE = path.join(CONFIGDIR, "config.sqlite");
export const API_KEYS_DB_FILE = path.join(DATADIR, "api-keys.sqlite");
export const CERTDIR = path.join(DATADIR, "certs");
export const PROVIDER_ICON_CACHE_DIR = path.join(DATADIR, "provider-icons");
export const PROXY_CA_CERT_FILE = path.join(CERTDIR, "ca.pem");
export const PROXY_CA_CERT_DER_FILE = path.join(CERTDIR, "ca.cer");
export const PROXY_CA_KEY_FILE = path.join(CERTDIR, "key.pem");
export const GATEWAY_CONFIG_FILE = path.join(CONFIGDIR, "gateway.config.json");
export const REQUEST_LOGS_DB_FILE = path.join(DATADIR, "request-logs.sqlite");
export const RAW_TRACE_SPOOL_DIR = path.join(DATADIR, "raw-trace-spool");
export const USAGE_DB_FILE = path.join(DATADIR, "usage.sqlite");
