import esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const bundleRoot = path.join(projectRoot, ".test-dist");
mkdirSync(bundleRoot, { recursive: true });
const outDir = mkdtempSync(path.join(bundleRoot, "context-archive-benchmark-"));
const outfile = path.join(outDir, "context-archive-benchmark.cjs");
const keepBundle = process.argv.includes("--keep-bundle");
const requireFromHere = createRequire(import.meta.url);

try {
  await esbuild.build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: [path.join(projectRoot, "benchmarks", "context-archive-benchmark.ts")],
    external: ["better-sqlite3", "electron"],
    footer: {
      js: "if (require.main === module) Promise.resolve(module.exports.main(process.argv.slice(2))).catch((error) => { console.error(error); process.exitCode = 1; });"
    },
    format: "cjs",
    legalComments: "none",
    logLevel: "silent",
    outfile,
    platform: "node",
    target: "node22"
  });

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
  if (!keepBundle) {
    rmSync(outDir, { force: true, recursive: true });
  } else {
    console.error(`Kept benchmark bundle at ${outfile}`);
  }
}
