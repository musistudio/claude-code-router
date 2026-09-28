import electron from "electron";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const testsOutDir = path.join(projectRoot, ".test-dist");
const testProjects = {
  architecture: { runtime: "node" },
  cli: { runtime: "node" },
  core: { runtime: "node-with-electron-fallback" },
  electron: { runtime: "electron" },
  ui: { runtime: "node" }
};
const requestedProjects = process.argv.slice(2);
const projects = requestedProjects.length === 0 ? Object.keys(testProjects) : requestedProjects;

for (const project of projects) {
  if (!testProjects[project]) {
    throw new Error(`Unknown test project: ${project}`);
  }
}

for (const project of projects) {
  await runProject(project);
}

async function runProject(project) {
  const testFiles = findCompiledTests(path.join(testsOutDir, project, "test"));
  if (testFiles.length === 0) {
    console.log(`No ${project} tests found.`);
    return;
  }

  const testHome = mkdtempSync(path.join(os.tmpdir(), `ccr-${project}-test-home-`));
  const runtime = resolveRuntime(testProjects[project].runtime);
  const executable = runtime === "electron" ? electron : process.execPath;
  console.log(`\nRunning ${project} tests with ${runtime}...`);

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(executable, ["--test", ...testFiles], {
        cwd: projectRoot,
        env: {
          ...process.env,
          CCR_INTERNAL_APP_DATA_DIR: path.join(testHome, "app-data"),
          CCR_INTERNAL_HOME_DIR: testHome,
          CCR_INTERNAL_USER_DATA_DIR: path.join(testHome, "user-data"),
          HOME: testHome,
          ...(runtime === "electron" ? { ELECTRON_RUN_AS_NODE: "1" } : {})
        },
        stdio: "inherit"
      });

      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`${project} tests exited from signal ${signal}`));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`${project} tests exited with code ${code ?? 1}`));
      });
    });
  } finally {
    rmSync(testHome, { force: true, recursive: true });
  }
}

function resolveRuntime(runtime) {
  if (runtime !== "node-with-electron-fallback") {
    return runtime;
  }
  const probe = spawnSync(process.execPath, [
    "-e",
    "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close();"
  ], { stdio: "ignore" });
  return probe.status === 0 ? "node" : "electron";
}

function findCompiledTests(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return findCompiledTests(file);
    }
    return entry.isFile() && entry.name.endsWith(".test.js") ? [file] : [];
  }).sort();
}
