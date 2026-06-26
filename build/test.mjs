// Minimal test runner: esbuild-transpiles every `src/**/*.test.ts` file and runs
// them under Node's built-in test runner. No extra test framework dependency —
// tests are authored with `node:test` + `node:assert`.
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "src");
const outDir = join(root, ".test-dist");

function findTests(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...findTests(full));
    } else if (name.endsWith(".test.ts")) {
      entries.push(full);
    }
  }
  return entries;
}

const tests = findTests(srcDir);
if (tests.length === 0) {
  console.log("No *.test.ts files found.");
  process.exit(0);
}

rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });

await build({
  bundle: true,
  entryPoints: tests,
  format: "esm",
  logLevel: "info",
  // Keep native / heavy runtime deps external; tests inject their own fakes.
  external: ["undici", "better-sqlite3", "electron", "node-forge", "electron-updater"],
  outbase: srcDir,
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  platform: "node",
  sourcemap: "inline",
  target: "node20"
});

const compiled = tests.map((file) => join(outDir, relative(srcDir, file).replace(/\.ts$/, ".mjs")));
const child = spawn(process.execPath, ["--test", ...compiled], { stdio: "inherit" });
child.on("exit", (code) => {
  rmSync(outDir, { force: true, recursive: true });
  process.exit(code ?? 1);
});
