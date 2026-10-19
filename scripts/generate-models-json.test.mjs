import assert from "node:assert/strict";
import test from "node:test";
import { applyCanonicalModelOverrides } from "./generate-models-json.mjs";

test("seeds current MiniMax releases when external catalogs lag", () => {
  const models = applyCanonicalModelOverrides([]);
  assert.deepEqual(models.map(({ model }) => model), ["MiniMax-M3", "MiniMax-M3.1-Flash"]);
  for (const model of models) {
    assert.equal(model.limits.contextTokens, 1_000_000);
    assert.equal(model.limits.outputTokens, 524_288);
    assert.deepEqual(model.sourceRecords.map(({ provider }) => provider), ["minimax", "minimax-cn"]);
  }
  const [m3, flash] = models;
  assert.deepEqual(m3.pricing.offers[0].per1MTokens, { cacheRead: 0.06, input: 0.3, output: 1.2 });
  assert.deepEqual(flash.pricing.offers[0].per1MTokens, { cacheRead: 0.015, input: 0.15, output: 0.6 });
  assert.equal(m3.capabilities.highReasoningEffort, false);
  assert.equal(m3.capabilities.noneReasoningEffort, true);
  assert.equal(flash.capabilities.noneReasoningEffort, false);
  for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
    assert.equal(flash.capabilities[`${effort}ReasoningEffort`], true);
  }
});

test("preserves other providers and replaces stale official prices without cache-write guesses", () => {
  const unrelated = { id: "other/model", model: "model", pricing: { input: 9 } };
  const thirdParty = { provider: "openrouter", pricing: { input: 7 } };
  const models = applyCanonicalModelOverrides([unrelated, {
    id: "minimax/minimax-m3.1-flash",
    providers: ["openrouter"],
    pricing: { offers: [thirdParty, { provider: "minimax", per1MTokens: { cacheWrite: 99, input: 99 } }] },
    sourceRecords: [{ provider: "openrouter", model: "minimax/flash" }]
  }]);
  assert.equal(models[0], unrelated);
  const flash = models.find(({ id }) => id === "minimax/minimax-m3.1-flash");
  assert.equal(flash.pricing.offers[0].per1MTokens.cacheWrite, undefined);
  assert.equal(flash.pricing.offers.find(({ provider }) => provider === "openrouter"), thirdParty);
  assert.equal(flash.pricing.offers.filter(({ provider }) => provider === "minimax").length, 1);
  assert.equal(flash.sourceRecords.find(({ provider }) => provider === "openrouter").model, "minimax/flash");
});
