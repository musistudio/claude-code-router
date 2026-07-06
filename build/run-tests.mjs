import electron from "electron";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const testHome = mkdtempSync(path.join(os.tmpdir(), "ccr-test-home-"));
const testSuites = ["main", "renderer"];
const requestedSuites = process.argv.slice(2);
const suites = requestedSuites.length === 0 ? testSuites : requestedSuites;

for (const suite of suites) {
  if (!testSuites.includes(suite)) {
    cleanup();
    throw new Error(`Unknown test suite: ${suite}`);
  }
}

try {
  for (const suite of suites) {
    await runSuite(suite);
  }
} finally {
  cleanup();
}

function runSuite(suite) {
  console.log(`\nRunning ${suite} tests...`);

  return new Promise((resolve, reject) => {
    const child = spawn(electron, ["--test", `dist/tests/${suite}/*.test.js`], {
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

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${suite} tests exited with code ${code ?? 1}`));
    });
  });
}

function cleanup() {
  rmSync(testHome, { force: true, recursive: true });
}
