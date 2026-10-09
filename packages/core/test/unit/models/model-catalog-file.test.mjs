import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadModelCatalogPayload, modelCatalogPathCandidates, resolveModelCatalogPath } from "@ccr/core/models/catalog-file.ts";

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

    assert.equal(resolveModelCatalogPath(), catalogFile);
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

test("a fresh offline install resolves the bundled catalog without a CDN cache", () => {
  const keys = ["CCR_MODEL_CATALOG_PATH", "CCR_MODELS_JSON_PATH", "CCR_INTERNAL_USER_DATA_DIR"];
  const previous = keys.map((key) => process.env[key]);
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-catalog-offline-test-"));
  try {
    delete process.env.CCR_MODEL_CATALOG_PATH;
    delete process.env.CCR_MODELS_JSON_PATH;
    process.env.CCR_INTERNAL_USER_DATA_DIR = dir;
    const loaded = loadModelCatalogPayload();
    assert.ok(loaded);
    assert.notEqual(loaded.loadedFrom, path.join(dir, "cache", "models.json"));
    assert.equal(loaded.payload.schemaVersion, 2);
    assert.ok(loaded.payload.models.length > 0);
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CDN catalog refresh deduplicates requests, updates indexes and preserves cache on failure", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { refreshModelCatalog, modelCatalogCachePath, modelCatalogRevision } = await import("@ccr/core/models/catalog-file.ts");
  const { findModelCatalogEntry } = await import("@ccr/core/gateway/model-catalog.ts");
  const { getProviderCatalogModels } = await import("@ccr/core/providers/model-catalog.ts");
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-cdn-catalog-test-"));
  const keys = ["CCR_MODEL_CATALOG_PATH", "CCR_MODELS_JSON_PATH", "CCR_MODEL_CATALOG_URL", "CCR_INTERNAL_USER_DATA_DIR"];
  const previous = keys.map((key) => process.env[key]);
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalWarn = console.warn;
  let time = originalNow();
  let calls = 0;
  const model = (id) => ({ id, model: id, providers: ["cdn-test"], limits: { contextTokens: 12345 },
    modalities: { input: ["text"], output: ["text"] },
    sourceRecords: [{ provider: "cdn-test", model: id, modalities: { input: ["text"], output: ["text"] } }] });
  const payload = { schemaVersion: 2, models: [model("cdn-first")] };
  try {
    delete process.env.CCR_MODEL_CATALOG_PATH;
    delete process.env.CCR_MODELS_JSON_PATH;
    process.env.CCR_INTERNAL_USER_DATA_DIR = dir;
    process.env.CCR_MODEL_CATALOG_URL = "https://test.invalid/models.json";
    Date.now = () => time;
    console.warn = () => {};
    globalThis.fetch = async (url, options) => {
      calls += 1;
      assert.equal(url, process.env.CCR_MODEL_CATALOG_URL);
      assert.ok(options.signal);
      return new Response(JSON.stringify(payload));
    };
    // Prime both consumers before the download to verify cache invalidation.
    assert.equal(findModelCatalogEntry("cdn-first"), undefined);
    assert.deepEqual(getProviderCatalogModels({ providerIds: ["cdn-test"] }).models, []);
    await Promise.all([refreshModelCatalog(), refreshModelCatalog()]);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(readFileSync(modelCatalogCachePath(), "utf8")), payload);
    assert.equal(findModelCatalogEntry("cdn-first")?.limits.contextTokens, 12345);
    assert.deepEqual(getProviderCatalogModels({ providerIds: ["cdn-test"] }).models, ["cdn-first"]);
    await refreshModelCatalog();
    assert.equal(calls, 1);
    time += 60 * 60 * 1000 + 1;
    payload.models = [model("cdn-second")];
    await refreshModelCatalog();
    assert.equal(findModelCatalogEntry("cdn-first"), undefined);
    assert.ok(findModelCatalogEntry("cdn-second"));
    assert.deepEqual(getProviderCatalogModels({ providerIds: ["cdn-test"] }).models, ["cdn-second"]);
    const goodRevision = modelCatalogRevision();
    for (const response of [() => new Response("{}"), () => new Response("bad", { status: 503 }), () => { throw new Error("offline"); }]) {
      time += 60 * 60 * 1000 + 1;
      globalThis.fetch = async () => response();
      await refreshModelCatalog();
      assert.equal(modelCatalogRevision(), goodRevision);
      assert.deepEqual(JSON.parse(readFileSync(modelCatalogCachePath(), "utf8")), payload);
      assert.ok(findModelCatalogEntry("cdn-second"));
    }
    assert.deepEqual(readdirSync(path.dirname(modelCatalogCachePath())), ["models.json"]);
    process.env.CCR_MODEL_CATALOG_PATH = path.join(dir, "override.json");
    writeFileSync(process.env.CCR_MODEL_CATALOG_PATH, JSON.stringify({ models: [{ id: "override" }] }));
    time += 60 * 60 * 1000 + 1;
    globalThis.fetch = async () => { assert.fail("Local overrides must not fetch CDN"); };
    await refreshModelCatalog();
    assert.equal(loadModelCatalogPayload().payload.models[0].id, "override");
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    console.warn = originalWarn;
    rmSync(dir, { recursive: true, force: true });
  }
});
