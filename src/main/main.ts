import { app, dialog } from "electron";
import path from "node:path";
import { APP_STORAGE_NAME, setRuntimeAppPaths } from "./app-paths";
import { copyMissingDirectoryContents, sameFilesystemPath } from "./storage-migration";

const appDataPath = app.getPath("appData");
const userDataPath = configureRuntimeUserDataPath(appDataPath);
setRuntimeAppPaths({
  appData: appDataPath,
  home: app.getPath("home"),
  userData: userDataPath
});

let fatalStartupErrorReported = false;

process.once("uncaughtException", reportFatalStartupError);
process.once("unhandledRejection", reportFatalStartupError);

void import("./main-app.js")
  .then(() => {
    process.off("uncaughtException", reportFatalStartupError);
    process.off("unhandledRejection", reportFatalStartupError);
  })
  .catch((error) => {
    reportFatalStartupError(error);
  });

function reportFatalStartupError(error: unknown): void {
  if (fatalStartupErrorReported) {
    return;
  }
  fatalStartupErrorReported = true;

  const detail = formatErrorDetail(error);
  console.error(detail);

  try {
    dialog.showErrorBox("Claude Code Router failed to start", startupErrorMessage(detail));
  } catch {
    // If the platform dialog is unavailable, the console output above still
    // preserves the actionable failure for command-line launches.
  }

  app.exit(1);
}

function configureRuntimeUserDataPath(appDataPath: string): string {
  const currentUserDataPath = app.getPath("userData");
  if (process.platform !== "win32") {
    return currentUserDataPath;
  }

  const storageUserDataPath = path.join(appDataPath, APP_STORAGE_NAME);
  if (sameFilesystemPath(currentUserDataPath, storageUserDataPath)) {
    return currentUserDataPath;
  }

  copyMissingDirectoryContents(currentUserDataPath, storageUserDataPath, "Windows app data directory");
  app.setPath("userData", storageUserDataPath);
  return app.getPath("userData");
}

function startupErrorMessage(detail: string): string {
  if (isBetterSqliteNativeError(detail)) {
    return [
      "The bundled SQLite native module could not be loaded.",
      "",
      "This usually means the Windows package was built with a missing or incompatible better-sqlite3 binary. Rebuild the app with npm run rebuild:sqlite3 before packaging, or build the Windows artifact on a Windows x64 runner.",
      "",
      detail
    ].join("\n");
  }

  return detail;
}

function isBetterSqliteNativeError(detail: string): boolean {
  return /better[-_]sqlite3|better_sqlite3\.node|NODE_MODULE_VERSION|ERR_DLOPEN_FAILED|Cannot find module ['"]better-sqlite3/i.test(detail);
}

function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}
