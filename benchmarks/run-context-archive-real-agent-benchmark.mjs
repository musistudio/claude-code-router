import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = process.cwd();
const bundleRoot = path.join(projectRoot, ".test-dist");
mkdirSync(bundleRoot, { recursive: true });
const outDir = mkdtempSync(path.join(bundleRoot, "context-archive-real-agent-benchmark-"));
const outfile = path.join(outDir, "context-archive-real-agent-benchmark.cjs");
const requireFromHere = createRequire(import.meta.url);

await build({
  bundle: true,
  entryPoints: [path.join(projectRoot, "benchmarks", "context-archive-real-agent-benchmark.ts")],
  external: ["better-sqlite3", "electron", "esbuild"],
  footer: {
    js: "if (require.main === module) Promise.resolve(module.exports.main(process.argv.slice(2))).catch((error) => { console.error(error); process.exitCode = 1; });"
  },
  format: "cjs",
  logLevel: "silent",
  outfile,
  platform: "node"
});

try {
  const electronBinary = requireFromHere("electron");
  const result = spawnSync(electronBinary, [
    outfile,
    ...process.argv.slice(2).filter((arg) => arg !== "--keep-bundle")
  ], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (process.argv.includes("--keep-bundle")) {
    console.error(`Kept benchmark bundle at ${outfile}`);
  } else {
    rmSync(outDir, { force: true, recursive: true });
  }
}
