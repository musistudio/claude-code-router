import path from "node:path";
import { APP_NAME, APP_STORAGE_NAME, LEGACY_CONFIGDIR, resolveRuntimeAppPath } from "./app-paths";
import { copyMissingDirectoryContents } from "./storage-migration";

export { IPC_CHANNELS } from "../shared/ipc-channels";
export const LEGACY_CONFIG_FILE = path.join(LEGACY_CONFIGDIR, "config.json");

export { APP_NAME, APP_STORAGE_NAME, LEGACY_CONFIGDIR };

export const CONFIGDIR = process.platform === "win32"
  ? path.join(resolveRuntimeAppPath("appData"), APP_STORAGE_NAME)
  : LEGACY_CONFIGDIR;
export const LEGACY_WINDOWS_CONFIGDIR = path.join(resolveRuntimeAppPath("appData"), APP_NAME);
export const LEGACY_WINDOWS_CONFIG_FILE = path.join(LEGACY_WINDOWS_CONFIGDIR, "config.json");
export const CONFIG_FILE = path.join(CONFIGDIR, "config.json");
export const ONBOARDING_FINISHED_FILE = path.join(CONFIGDIR, ".onboard_finished");
export const DATADIR = resolveRuntimeAppPath("userData");
export const APP_CONFIG_DB_FILE = path.join(CONFIGDIR, "config.sqlite");
export const API_KEYS_DB_FILE = path.join(DATADIR, "api-keys.sqlite");
export const LEGACY_APP_CONFIG_DB_FILES = process.platform === "win32" ? [path.join(LEGACY_WINDOWS_CONFIGDIR, "config.sqlite")] : [];
export const LEGACY_API_KEYS_DB_FILES = process.platform === "win32" ? [path.join(LEGACY_WINDOWS_CONFIGDIR, "api-keys.sqlite")] : [];
export const CERTDIR = path.join(DATADIR, "certs");
export const PROVIDER_ICON_CACHE_DIR = path.join(DATADIR, "provider-icons");
export const PROXY_CA_CERT_FILE = path.join(CERTDIR, "ca.pem");
export const PROXY_CA_CERT_DER_FILE = path.join(CERTDIR, "ca.cer");
export const PROXY_CA_KEY_FILE = path.join(CERTDIR, "key.pem");
export const GATEWAY_CONFIG_FILE = path.join(CONFIGDIR, "gateway.config.json");
export const REQUEST_LOGS_DB_FILE = path.join(DATADIR, "request-logs.sqlite");
export const RAW_TRACE_SPOOL_DIR = path.join(DATADIR, "raw-trace-spool");
export const USAGE_DB_FILE = path.join(DATADIR, "usage.sqlite");

if (process.platform === "win32") {
  copyMissingDirectoryContents(LEGACY_WINDOWS_CONFIGDIR, CONFIGDIR, "Windows app data directory");
}
