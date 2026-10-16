import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve as pathResolve } from "node:path";
import { resolveRuntimeDataDir } from "@ccr/core/runtime/app-paths";

export const DEFAULT_MODEL_CATALOG_URL = "https://models.ccrdesk.top/models.json";
const refreshIntervalMs = 60 * 60 * 1000;
let revision = 0;
let refreshStarted = false;
let lastAttempt = 0;
let pendingRefresh: Promise<void> | undefined;
let remoteCatalog: LoadedModelCatalogPayload | undefined;

export function scheduleModelCatalogRefresh(): void {
  if (refreshStarted) void refreshModelCatalog();
}

export function modelCatalogRevision(): number {
  return revision;
}

export function modelCatalogCachePath(): string {
  return pathResolve(resolveRuntimeDataDir(), "cache", "models.json");
}

function hasLocalOverride(): boolean {
  return Boolean(process.env.CCR_MODEL_CATALOG_PATH?.trim() || process.env.CCR_MODELS_JSON_PATH?.trim());
}

/** Download once at startup and at most hourly thereafter. Local overrides stay offline. */
export function refreshModelCatalog(): Promise<void> {
  refreshStarted = true;
  if (hasLocalOverride()) return Promise.resolve();
  if (pendingRefresh) return pendingRefresh;
  if (Date.now() - lastAttempt < refreshIntervalMs) return Promise.resolve();
  lastAttempt = Date.now();
  pendingRefresh = downloadModelCatalog().finally(() => { pendingRefresh = undefined; });
  return pendingRefresh;
}

async function downloadModelCatalog(): Promise<void> {
  const url = process.env.CCR_MODEL_CATALOG_URL?.trim() || DEFAULT_MODEL_CATALOG_URL;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!isModelCatalogPayload(payload)) throw new Error("Invalid model catalog (expected schemaVersion 2 and non-empty model records)");
    remoteCatalog = { loadedFrom: url, payload };
    revision += 1;
    const file = modelCatalogCachePath();
    const temporaryFile = `${file}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(temporaryFile, JSON.stringify(payload), "utf8");
      await rename(temporaryFile, file);
    } finally {
      await rm(temporaryFile, { force: true });
    }
  } catch (error) {
    console.warn(`[models] CDN refresh failed; using available local catalog: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isModelCatalogPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const catalog = value as { schemaVersion?: unknown; models?: unknown };
  return catalog.schemaVersion === 2 && Array.isArray(catalog.models) && catalog.models.length > 0 &&
    catalog.models.every((model: unknown) => Boolean(model && typeof model === "object" &&
      typeof (model as { id?: unknown }).id === "string"));
}

export type LoadedModelCatalogPayload = {
  loadedFrom: string;
  payload: unknown;
};

export function loadModelCatalogPayload(): LoadedModelCatalogPayload | undefined {
  if (!hasLocalOverride() && remoteCatalog) return remoteCatalog;
  const candidate = resolveModelCatalogPath();
  return candidate
    ? {
        loadedFrom: candidate,
        payload: JSON.parse(readFileSync(candidate, "utf8")) as unknown
      }
    : undefined;
}

export function resolveModelCatalogPath(): string | undefined {
  return modelCatalogPathCandidates().find((candidate) => existsSync(candidate));
}

export function modelCatalogPathCandidates(): string[] {
  return uniqueStrings([
    process.env.CCR_MODEL_CATALOG_PATH?.trim() || "",
    process.env.CCR_MODELS_JSON_PATH?.trim() || "",
    modelCatalogCachePath(),
    pathResolve(process.cwd(), "models.json"),
    pathResolve(process.cwd(), "packages", "core", "models.json"),
    pathResolve(process.cwd(), "packages", "cli", "models.json"),
    pathResolve(__dirname, "..", "models.json"),
    pathResolve(__dirname, "..", "assets", "models.json"),
    pathResolve(__dirname, "..", "..", "models.json"),
    pathResolve(__dirname, "..", "..", "..", "models.json")
  ]);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const strings: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    strings.push(trimmed);
  }
  return strings;
}
