"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/test/unit/models/model-catalog-file.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_fs2 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/models/catalog-file.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
function loadModelCatalogPayload() {
  const candidate = resolveModelCatalogPath();
  return candidate ? {
    loadedFrom: candidate,
    payload: JSON.parse((0, import_node_fs.readFileSync)(candidate, "utf8"))
  } : void 0;
}
function resolveModelCatalogPath() {
  return modelCatalogPathCandidates().find((candidate) => (0, import_node_fs.existsSync)(candidate));
}
function modelCatalogPathCandidates() {
  return uniqueStrings([
    process.env.CCR_MODEL_CATALOG_PATH?.trim() || "",
    process.env.CCR_MODELS_JSON_PATH?.trim() || "",
    (0, import_node_path.resolve)(process.cwd(), "models.json"),
    (0, import_node_path.resolve)(process.cwd(), "packages", "core", "models.json"),
    (0, import_node_path.resolve)(process.cwd(), "packages", "cli", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "assets", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "..", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "..", "..", "models.json")
  ]);
}
function uniqueStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const strings = [];
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

// packages/core/test/unit/models/model-catalog-file.test.mjs
(0, import_node_test.default)("modelCatalogPathCandidates prefers env paths and removes duplicates", () => {
  const previousCatalogPath = process.env.CCR_MODEL_CATALOG_PATH;
  const previousModelsPath = process.env.CCR_MODELS_JSON_PATH;
  try {
    process.env.CCR_MODEL_CATALOG_PATH = "/tmp/ccr-models.json";
    process.env.CCR_MODELS_JSON_PATH = "/tmp/ccr-models.json";
    const candidates = modelCatalogPathCandidates();
    import_strict.default.equal(candidates[0], "/tmp/ccr-models.json");
    import_strict.default.equal(candidates.filter((candidate) => candidate === "/tmp/ccr-models.json").length, 1);
    import_strict.default.ok(candidates.some((candidate) => candidate.endsWith("models.json")));
  } finally {
    if (previousCatalogPath === void 0) {
      delete process.env.CCR_MODEL_CATALOG_PATH;
    } else {
      process.env.CCR_MODEL_CATALOG_PATH = previousCatalogPath;
    }
    if (previousModelsPath === void 0) {
      delete process.env.CCR_MODELS_JSON_PATH;
    } else {
      process.env.CCR_MODELS_JSON_PATH = previousModelsPath;
    }
  }
});
(0, import_node_test.default)("loadModelCatalogPayload reads the first configured existing catalog", () => {
  const previousCatalogPath = process.env.CCR_MODEL_CATALOG_PATH;
  const previousModelsPath = process.env.CCR_MODELS_JSON_PATH;
  const dir = (0, import_node_fs2.mkdtempSync)(import_node_path2.default.join((0, import_node_os.tmpdir)(), "ccr-model-catalog-test-"));
  try {
    const catalogFile = import_node_path2.default.join(dir, "models.json");
    (0, import_node_fs2.writeFileSync)(catalogFile, JSON.stringify({ models: [{ id: "test-model" }] }), "utf8");
    process.env.CCR_MODEL_CATALOG_PATH = import_node_path2.default.join(dir, "missing.json");
    process.env.CCR_MODELS_JSON_PATH = catalogFile;
    const loaded = loadModelCatalogPayload();
    import_strict.default.equal(resolveModelCatalogPath(), catalogFile);
    import_strict.default.equal(loaded?.loadedFrom, catalogFile);
    import_strict.default.deepEqual(loaded?.payload, { models: [{ id: "test-model" }] });
  } finally {
    (0, import_node_fs2.rmSync)(dir, { force: true, recursive: true });
    if (previousCatalogPath === void 0) {
      delete process.env.CCR_MODEL_CATALOG_PATH;
    } else {
      process.env.CCR_MODEL_CATALOG_PATH = previousCatalogPath;
    }
    if (previousModelsPath === void 0) {
      delete process.env.CCR_MODELS_JSON_PATH;
    } else {
      process.env.CCR_MODELS_JSON_PATH = previousModelsPath;
    }
  }
});
