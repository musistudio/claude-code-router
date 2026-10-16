#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogFile = path.join(projectRoot, "packages/core/models.json");
const args = process.argv.slice(2);

async function main() {
  if (args.includes("--help")) {
    console.log("Usage: npm run models:update -- [--upload-only] [--dry-run]\nGenerates models.json and uploads it to Cloudflare R2.\nRequired: CLOUDFLARE_R2_BUCKET; authenticate Wrangler or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.\n--upload-only: upload the existing catalog without regenerating.\n--dry-run: validate configuration/catalog and print the upload command without generating or uploading.");
    return;
  }
  for (const arg of args) {
    if (!["--upload-only", "--dry-run"].includes(arg)) throw new Error(`Unknown option: ${arg}`);
  }
  try { process.loadEnvFile(path.join(projectRoot, ".env")); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const bucket = process.env.CLOUDFLARE_R2_BUCKET?.trim();
  const key = process.env.CCR_MODEL_CATALOG_R2_KEY?.trim() || "models.json";
  if (!bucket || !/^[a-z0-9][a-z0-9-]*$/.test(bucket)) throw new Error("Set CLOUDFLARE_R2_BUCKET to your R2 bucket name.");
  if (key.startsWith("/") || key.includes("\\") || key.split("/").includes("..")) throw new Error("CCR_MODEL_CATALOG_R2_KEY must be a relative R2 object key.");
  if (!args.includes("--upload-only") && !args.includes("--dry-run")) {
    run(process.execPath, ["scripts/generate-models-json.mjs", "--strict"]);
  }
  const catalog = JSON.parse(await readFile(catalogFile, "utf8"));
  if (catalog.schemaVersion !== 2 || !Array.isArray(catalog.models) || !catalog.models.length ||
      !catalog.models.every((model) => model && typeof model.id === "string")) {
    throw new Error("Invalid models.json; run npm run models:build first.");
  }
  const command = ["--yes", "wrangler@4", "r2", "object", "put", `${bucket}/${key}`, "--remote",
    "--file", catalogFile, "--content-type", "application/json", "--cache-control", "public, max-age=300, must-revalidate"];
  if (args.includes("--dry-run")) {
    console.log(command.map((arg) => JSON.stringify(arg)).join(" "));
    console.log(`Validated ${catalog.models.length} models. No upload performed.`);
    return;
  }
  if (process.platform === "win32") {
    if (!process.env.npm_execpath) throw new Error("Run this command through npm run models:update on Windows.");
    run(process.execPath, [path.join(path.dirname(process.env.npm_execpath), "npx-cli.js"), ...command]);
  } else {
    run("npx", command);
  }
  console.log(`Updated R2 object ${bucket}/${key} (${catalog.models.length} models).`);
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: projectRoot, env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status ?? result.signal}).`);
}

main().catch((error) => {
  console.error(`[models:update] ${error.message}`);
  process.exitCode = 1;
});
