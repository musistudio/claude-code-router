import esbuild from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outDir = mkdtempSync(path.join(os.tmpdir(), "ccr-context-archive-benchmark-"));
const outfile = path.join(outDir, "context-archive-benchmark.mjs");
const keepBundle = process.argv.includes("--keep-bundle");

try {
  await esbuild.build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: [path.join(projectRoot, "benchmarks", "context-archive-benchmark.ts")],
    external: ["better-sqlite3", "electron"],
    format: "esm",
    legalComments: "none",
    logLevel: "silent",
    outfile,
    platform: "node",
    target: "node22"
  });

  const benchmark = await import(pathToFileURL(outfile).href);
  await benchmark.main(process.argv.slice(2).filter((arg) => arg !== "--keep-bundle"));
} finally {
  if (!keepBundle) {
    rmSync(outDir, { force: true, recursive: true });
  } else {
    console.error(`Kept benchmark bundle at ${outfile}`);
  }
}
