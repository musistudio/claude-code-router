import electron from "electron";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const testHome = mkdtempSync(path.join(os.tmpdir(), "ccr-test-home-"));

const child = spawn(electron, ["--test", "dist/tests/*.js"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    CCR_INTERNAL_APP_DATA_DIR: path.join(testHome, "app-data"),
    CCR_INTERNAL_HOME_DIR: testHome,
    CCR_INTERNAL_USER_DATA_DIR: path.join(testHome, "user-data"),
    HOME: testHome,
    ELECTRON_RUN_AS_NODE: "1"
  },
  shell: process.platform === "win32",
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  rmSync(testHome, { force: true, recursive: true });
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
