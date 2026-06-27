import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readMorphRouterModelRows,
  morphRowsToModels,
  allMorphRouterRoutes,
  buildMorphRouterEditorRows,
  DEFAULT_MORPH_MODELS
} from "./morph-router-models";

test("reads single- and multi-target entries into rows with fallback routes", () => {
  const rows = readMorphRouterModelRows({
    "claude-sonnet-4-6": "openrouter,anthropic/claude-sonnet-4.6",
    "deepseek-v4-flash": { targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"] }
  });
  const flash = rows.find((row) => row.name === "deepseek-v4-flash");
  assert.equal(flash?.route, "openrouter,deepseek/deepseek-v4-flash");
  assert.deepEqual(flash?.fallbackRoutes, ["deepseek,deepseek-chat"]);
  const sonnet = rows.find((row) => row.name === "claude-sonnet-4-6");
  assert.deepEqual(sonnet?.fallbackRoutes, []);
});

test("round-trip preserves a multi-target chain", () => {
  const models = {
    "deepseek-v4-flash": { targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"] }
  };
  const out = morphRowsToModels(readMorphRouterModelRows(models));
  assert.deepEqual(out["deepseek-v4-flash"], {
    targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"]
  });
});

test("single-target rows serialize to a plain route string", () => {
  const out = morphRowsToModels([{ name: "m", route: "openrouter,anthropic/claude-sonnet-4.6", fallbackRoutes: [] }]);
  assert.equal(out.m, "openrouter,anthropic/claude-sonnet-4.6");
});

test("editing one row does not drop another row's fallback chain (the data-loss regression)", () => {
  const models = {
    "claude-sonnet-4-6": "openrouter,anthropic/claude-sonnet-4.6",
    "deepseek-v4-flash": { targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"] }
  };
  const rows = readMorphRouterModelRows(models);
  // simulate the UI changing the FIRST row's primary route, then persisting all rows
  rows[0] = { ...rows[0], route: "openrouter,anthropic/claude-opus-4.8" };
  const out = morphRowsToModels(rows);
  assert.equal(out["claude-sonnet-4-6"], "openrouter,anthropic/claude-opus-4.8");
  assert.deepEqual(out["deepseek-v4-flash"], {
    targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"]
  });
});

test("allMorphRouterRoutes handles string, route, targets, and routes shapes", () => {
  assert.deepEqual(allMorphRouterRoutes("a,b"), ["a,b"]);
  assert.deepEqual(allMorphRouterRoutes({ route: "a,b" }), ["a,b"]);
  assert.deepEqual(allMorphRouterRoutes({ targets: ["a,b", { route: "c,d" }] }), ["a,b", "c,d"]);
  assert.deepEqual(allMorphRouterRoutes({ routes: ["a,b"] }), ["a,b"]);
  assert.deepEqual(allMorphRouterRoutes(undefined), []);
});

test("buildMorphRouterEditorRows lists every known Morph model, unset by default", () => {
  const rows = buildMorphRouterEditorRows(undefined);
  assert.equal(rows.length, DEFAULT_MORPH_MODELS.length);
  assert.deepEqual(rows.map((row) => row.name), [...DEFAULT_MORPH_MODELS]);
  assert.ok(rows.every((row) => row.route === "" && row.fallbackRoutes.length === 0));
});

test("buildMorphRouterEditorRows fills configured routes and appends custom models", () => {
  const rows = buildMorphRouterEditorRows({
    "claude-opus-4-8": "openrouter,anthropic/claude-opus-4.8",
    "deepseek-v4-flash": { targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"] },
    "my-custom-model": "openrouter,custom/model"
  });
  const opus = rows.find((row) => row.name === "claude-opus-4-8");
  assert.equal(opus?.route, "openrouter,anthropic/claude-opus-4.8");
  const flash = rows.find((row) => row.name === "deepseek-v4-flash");
  assert.deepEqual(flash?.fallbackRoutes, ["deepseek,deepseek-chat"]);
  // a model not in the default set is still shown (appended at the end)
  assert.equal(rows[rows.length - 1].name, "my-custom-model");
  assert.equal(rows.find((row) => row.name === "gpt-5.5")?.route, "");
});

test("setting a route then serializing keeps only set rows (unset is dropped)", () => {
  const rows = buildMorphRouterEditorRows(undefined).map((row) =>
    row.name === "claude-opus-4-8" ? { ...row, route: "openrouter,anthropic/claude-opus-4.8" } : row
  );
  const models = morphRowsToModels(rows);
  assert.deepEqual(Object.keys(models), ["claude-opus-4-8"]);
  assert.equal(models["claude-opus-4-8"], "openrouter,anthropic/claude-opus-4.8");
});

test("unsetting one model preserves another model's multi-target chain", () => {
  const rows = buildMorphRouterEditorRows({
    "claude-opus-4-8": "openrouter,anthropic/claude-opus-4.8",
    "deepseek-v4-flash": { targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"] }
  }).map((row) => (row.name === "claude-opus-4-8" ? { ...row, route: "" } : row)); // unset opus
  const models = morphRowsToModels(rows);
  assert.equal(models["claude-opus-4-8"], undefined);
  assert.deepEqual(models["deepseek-v4-flash"], {
    targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"]
  });
});
