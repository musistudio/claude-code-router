import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

export type LoadedModelCatalogPayload = {
  loadedFrom: string;
  payload: unknown;
};

export function loadModelCatalogPayload(): LoadedModelCatalogPayload | undefined {
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
