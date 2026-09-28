import esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const buildDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(buildDir, "..");
const outputDir = path.join(projectRoot, ".benchmark-dist", "request-logs");
const outputFile = path.join(outputDir, "request-log-runtime.bench.js");
const args = parseArgs(process.argv.slice(2));

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });

try {
  await esbuild.build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: {
      "request-log-runtime.bench": path.join(projectRoot, "packages/core/benchmark/request-log-runtime.bench.mjs"),
      "request-log-web-load": path.join(projectRoot, "packages/core/benchmark/request-log-web-load.mjs"),
      "request-log-worker": path.join(projectRoot, "packages/core/src/observability/request-log-worker.ts")
    },
    external: ["better-sqlite3", "electron", "undici"],
    format: "cjs",
    legalComments: "none",
    logLevel: "warning",
    outdir: outputDir,
    platform: "node",
    plugins: [packageAliasPlugin()],
    target: "node22"
  });

  const runtime = resolveRuntime();
  const executable = runtime === "electron"
    ? (await import("electron")).default
    : process.execPath;
  const child = spawnSync(executable, [outputFile], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_REQUEST_LOG_BENCHMARK_LABEL: args.label,
      CCR_REQUEST_LOG_BENCHMARK_SKIP_STORAGE: args.skipStorage ? "1" : "0",
      CCR_REQUEST_LOG_BENCHMARK_SKIP_WEB: args.skipWeb ? "1" : "0",
      CCR_REQUEST_LOG_BENCHMARK_WEB_BODY_BYTES: args.webBodyBytes,
      CCR_REQUEST_LOG_BENCHMARK_WEB_CONCURRENCY: args.webConcurrency,
      CCR_REQUEST_LOG_BENCHMARK_WEB_REQUESTS: args.webRequests,
      ...(runtime === "electron" ? { ELECTRON_RUN_AS_NODE: "1" } : {})
    },
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"]
  });
  if (child.status !== 0) {
    process.stderr.write(child.stdout || `benchmark exited with ${child.status}\n`);
    process.exitCode = child.status ?? 1;
  } else {
    const result = JSON.parse(child.stdout);
    result.runtime = runtime;
    const json = `${JSON.stringify(result, null, 2)}\n`;
    process.stdout.write(json);
    if (args.output) {
      const destination = path.resolve(projectRoot, args.output);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, json, "utf8");
    }
  }
} finally {
  rmSync(outputDir, { force: true, recursive: true });
}

function parseArgs(values) {
  const parsed = {
    label: "benchmark",
    output: "",
    skipStorage: false,
    skipWeb: false,
    webBodyBytes: "1024",
    webConcurrency: "64",
    webRequests: "10000"
  };
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--label") parsed.label = values[index + 1] || parsed.label;
    if (values[index] === "--output") parsed.output = values[index + 1] || "";
    if (values[index] === "--skip-web") parsed.skipWeb = true;
    if (values[index] === "--skip-storage") parsed.skipStorage = true;
    if (values[index] === "--web-body-bytes") parsed.webBodyBytes = values[index + 1] || parsed.webBodyBytes;
    if (values[index] === "--web-concurrency") parsed.webConcurrency = values[index + 1] || parsed.webConcurrency;
    if (values[index] === "--web-requests") parsed.webRequests = values[index + 1] || parsed.webRequests;
  }
  return parsed;
}

function resolveRuntime() {
  const probe = spawnSync(process.execPath, [
    "-e",
    "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close();"
  ], { stdio: "ignore" });
  return probe.status === 0 ? "node" : "electron";
}

function packageAliasPlugin() {
  const roots = {
    cli: path.join(projectRoot, "packages/cli/src"),
    core: path.join(projectRoot, "packages/core/src"),
    electron: path.join(projectRoot, "packages/electron/src"),
    ui: path.join(projectRoot, "packages/ui/src")
  };
  return {
    name: "request-log-benchmark-alias",
    setup(build) {
      build.onResolve({ filter: /^@ccr\/(cli|core|electron|ui)\// }, (resolveArgs) => {
        const match = resolveArgs.path.match(/^@ccr\/(cli|core|electron|ui)\/(.+)$/);
        if (!match) return undefined;
        return { path: resolvePackageImport(roots[match[1]], match[2]) };
      });
    }
  };
}

function resolvePackageImport(root, importPath) {
  const base = path.resolve(root, importPath);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return base;
}
