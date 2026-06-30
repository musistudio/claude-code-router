import esbuild from "esbuild";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outdir = path.join(projectRoot, "dist", "tests");

rmSync(outdir, { force: true, recursive: true });
mkdirSync(outdir, { recursive: true });

const entryPoints = findTestFiles(path.join(projectRoot, "tests"));

await esbuild.build({
  absWorkingDir: projectRoot,
  bundle: true,
  entryNames: "[name]",
  entryPoints,
  external: [
    "better-sqlite3",
    "electron"
  ],
  format: "cjs",
  legalComments: "none",
  logLevel: "info",
  outdir,
  platform: "node",
  target: "node22"
});

function findTestFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      files.push(...findTestFiles(file));
    } else if (name.endsWith(".test.mjs")) {
      files.push(file);
    }
  }
  return files.sort();
}
