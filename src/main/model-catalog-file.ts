import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

export type LoadedModelCatalogPayload = {
  loadedFrom: string;
  payload: unknown;
};

export function loadModelCatalogPayload(): LoadedModelCatalogPayload | undefined {
  for (const candidate of modelCatalogPathCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }
    return {
      loadedFrom: candidate,
      payload: JSON.parse(readFileSync(candidate, "utf8")) as unknown
    };
  }
  return undefined;
}

export function modelCatalogPathCandidates(): string[] {
  return uniqueStrings([
    process.env.CCR_MODEL_CATALOG_PATH?.trim() || "",
    process.env.CCR_MODELS_JSON_PATH?.trim() || "",
    pathResolve(process.cwd(), "models.json"),
    pathResolve(__dirname, "..", "models.json"),
    pathResolve(__dirname, "..", "assets", "models.json"),
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
