import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadModelCatalogPayload, modelCatalogPathCandidates } from "@ccr/core/models/catalog-file.ts";

test("modelCatalogPathCandidates prefers env paths and removes duplicates", () => {
  const previousCatalogPath = process.env.CCR_MODEL_CATALOG_PATH;
  const previousModelsPath = process.env.CCR_MODELS_JSON_PATH;
  try {
    process.env.CCR_MODEL_CATALOG_PATH = "/tmp/ccr-models.json";
    process.env.CCR_MODELS_JSON_PATH = "/tmp/ccr-models.json";

    const candidates = modelCatalogPathCandidates();

    assert.equal(candidates[0], "/tmp/ccr-models.json");
    assert.equal(candidates.filter((candidate) => candidate === "/tmp/ccr-models.json").length, 1);
    assert.ok(candidates.some((candidate) => candidate.endsWith("models.json")));
  } finally {
    if (previousCatalogPath === undefined) {
      delete process.env.CCR_MODEL_CATALOG_PATH;
    } else {
      process.env.CCR_MODEL_CATALOG_PATH = previousCatalogPath;
    }
    if (previousModelsPath === undefined) {
      delete process.env.CCR_MODELS_JSON_PATH;
    } else {
      process.env.CCR_MODELS_JSON_PATH = previousModelsPath;
    }
  }
});

test("loadModelCatalogPayload reads the first configured existing catalog", () => {
  const previousCatalogPath = process.env.CCR_MODEL_CATALOG_PATH;
  const previousModelsPath = process.env.CCR_MODELS_JSON_PATH;
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-model-catalog-test-"));
  try {
    const catalogFile = path.join(dir, "models.json");
    writeFileSync(catalogFile, JSON.stringify({ models: [{ id: "test-model" }] }), "utf8");
    process.env.CCR_MODEL_CATALOG_PATH = path.join(dir, "missing.json");
    process.env.CCR_MODELS_JSON_PATH = catalogFile;

    const loaded = loadModelCatalogPayload();

    assert.equal(loaded?.loadedFrom, catalogFile);
    assert.deepEqual(loaded?.payload, { models: [{ id: "test-model" }] });
  } finally {
    rmSync(dir, { force: true, recursive: true });
    if (previousCatalogPath === undefined) {
      delete process.env.CCR_MODEL_CATALOG_PATH;
    } else {
      process.env.CCR_MODEL_CATALOG_PATH = previousCatalogPath;
    }
    if (previousModelsPath === undefined) {
      delete process.env.CCR_MODELS_JSON_PATH;
    } else {
      process.env.CCR_MODELS_JSON_PATH = previousModelsPath;
    }
  }
});
