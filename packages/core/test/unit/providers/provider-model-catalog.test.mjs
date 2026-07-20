import assert from "node:assert/strict";
import test from "node:test";
import { getProviderCatalogModels } from "@ccr/core/providers/model-catalog.ts";

test("provider model catalog exposes models.json settings as editable defaults", () => {
  const catalog = getProviderCatalogModels({
    baseUrl: "https://api.anthropic.com",
    providerPresetId: "anthropic"
  });
  const metadata = catalog.modelMetadata?.["claude-sonnet-4-20250514"];

  assert.ok(catalog.models.includes("claude-sonnet-4-20250514"));
  assert.equal(metadata?.contextWindow, 1_000_000);
  assert.equal(metadata?.capabilities?.imageInput, true);
  assert.equal(metadata?.pricing?.inputUsdPerMillionTokens, 3);
  assert.equal(metadata?.pricing?.outputUsdPerMillionTokens, 15);
  assert.equal(metadata?.pricing?.cacheReadUsdPerMillionTokens, 0.3);
  assert.equal(metadata?.pricing?.cacheWrite5mUsdPerMillionTokens, 3.75);
  assert.equal(metadata?.pricing?.cacheWrite1hUsdPerMillionTokens, 6);
});

test("provider model catalog maps preset aliases to models.json defaults", () => {
  const catalog = getProviderCatalogModels({ providerPresetId: "kimi-coding" });
  const metadata = catalog.modelMetadata?.["kimi-for-coding"];

  assert.deepEqual(catalog.models, ["kimi-for-coding"]);
  assert.equal(metadata?.contextWindow, 262_144);
  assert.equal(metadata?.capabilities?.imageInput, true);
});

test("provider model catalog exposes reasoning, web search, and image presets", () => {
  const catalog = getProviderCatalogModels({ providerPresetId: "openai" });
  const metadata = catalog.modelMetadata?.["gpt-5"];

  assert.deepEqual(metadata?.supportedReasoningLevels?.map((level) => level.effort), [
    "low",
    "medium",
    "high"
  ]);
  assert.equal(metadata?.capabilities?.webSearch, true);
  assert.equal(metadata?.capabilities?.imageInput, true);
});
