import { test } from "node:test";
import assert from "node:assert/strict";
import { readMorphRouterModelRows, morphRowsToModels, allMorphRouterRoutes } from "./morph-router-models";

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
