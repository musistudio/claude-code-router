import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const outDir = mkdtempSync(path.join(os.tmpdir(), "ccr-context-archive-real-agent-benchmark-"));
const outfile = path.join(outDir, "context-archive-real-agent-benchmark.mjs");

await build({
  bundle: true,
  entryPoints: [path.join(projectRoot, "benchmarks", "context-archive-real-agent-benchmark.ts")],
  external: ["esbuild"],
  format: "esm",
  logLevel: "silent",
  outfile,
  platform: "node"
});

try {
  const benchmark = await import(pathToFileURL(outfile).href);
  await benchmark.main(process.argv.slice(2).filter((arg) => arg !== "--keep-bundle"));
} finally {
  if (process.argv.includes("--keep-bundle")) {
    console.error(`Kept benchmark bundle at ${outfile}`);
  }
}
