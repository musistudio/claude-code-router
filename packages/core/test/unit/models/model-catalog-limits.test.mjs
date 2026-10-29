import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProviderToken, mergeLimits } from "../../../../../scripts/model-catalog.mjs";

function record(provider, limits) {
  return { provider, limits };
}

// The router hands clients Math.max(maxTokens, outputTokens), so both values matter.
function clientCompletionLimit(limits) {
  return Math.max(limits.maxTokens ?? 0, limits.outputTokens ?? 0);
}

test("mergeLimits takes completion limits from the model author, not from a reseller", () => {
  // Real shape of anthropic/claude-opus-5 on 2026-10-29: anthropic reports 128000 for
  // the completion limit, while a reseller republishes the whole 1M window as both the
  // completion and the legacy max_tokens limit.
  const limits = mergeLimits([
    record("anthropic", { contextTokens: 1_000_000, inputTokens: 1_000_000, outputTokens: 128_000 }),
    record("deepinfra", { contextTokens: 1_000_000, inputTokens: 1_000_000, maxTokens: 1_000_000, outputTokens: 1_000_000 }),
    record("openrouter", { contextTokens: 1_000_000, outputTokens: 128_000 })
  ], "anthropic");

  assert.equal(limits.outputTokens, 128_000);
  assert.equal(clientCompletionLimit(limits), 128_000);
  assert.equal(limits.contextTokens, 1_000_000);
});

test("mergeLimits drops a reseller-only maxTokens the author never published", () => {
  // LiteLLM's legacy `max_tokens` is the only source of maxTokens, and resellers often
  // fill it with their context window. Without an author value the key is left out.
  const limits = mergeLimits([
    record("openai", { contextTokens: 1_050_000, inputTokens: 922_000, outputTokens: 128_000 }),
    record("azure", { contextTokens: 1_050_000, maxTokens: 1_050_000, outputTokens: 1_050_000 })
  ], "openai");

  assert.equal(limits.outputTokens, 128_000);
  assert.equal(limits.maxTokens, undefined);
  assert.equal(clientCompletionLimit(limits), 128_000);
});

test("mergeLimits keeps the all-record maximum when the author publishes nothing", () => {
  // No record from the owning provider at all: both completion keys keep the previous
  // behaviour, so a reseller maxTokens is not lost.
  const withoutAuthorRecord = mergeLimits([
    record("azure", { contextTokens: 200_000, maxTokens: 64_000, outputTokens: 8_000 }),
    record("bedrock", { contextTokens: 200_000, maxTokens: 32_000 })
  ], "acme");
  assert.equal(withoutAuthorRecord.maxTokens, 64_000);
  assert.equal(withoutAuthorRecord.outputTokens, 8_000);

  // Author records exist but publish no completion limit: the same fallback applies.
  const silentAuthor = mergeLimits([
    record("acme", { contextTokens: 200_000 }),
    record("azure", { contextTokens: 200_000, maxTokens: 64_000, outputTokens: 8_000 })
  ], "acme");
  assert.equal(silentAuthor.maxTokens, 64_000);
  assert.equal(silentAuthor.outputTokens, 8_000);
});

test("mergeLimits ignores a reseller that republishes its context window as the output limit", () => {
  // Real shape of openai/gpt-6-astra: the author reports 128000, one reseller reports
  // outputTokens equal to the context window.
  const limits = mergeLimits([
    record("openai", { contextTokens: 1_050_000, inputTokens: 922_000, outputTokens: 128_000 }),
    record("llmgateway", { contextTokens: 1_050_000, inputTokens: 922_000, outputTokens: 1_050_000 }),
    record("openrouter", { contextTokens: 1_050_000, outputTokens: 128_000 })
  ], "openai");

  assert.equal(limits.outputTokens, 128_000);
  assert.equal(clientCompletionLimit(limits), 128_000);
  assert.equal(limits.contextTokens, 1_050_000);
  assert.equal(limits.inputTokens, 922_000);
});

test("mergeLimits treats first-party provider aliases as the model author", () => {
  // Real shape of z-ai/glm-5.3: zai and zhipuai both report 131072, resellers report
  // the 1M window as the output limit.
  const limits = mergeLimits([
    record("zai", { contextTokens: 1_000_000, outputTokens: 131_072 }),
    record("zhipuai", { contextTokens: 1_000_000, outputTokens: 131_072 }),
    record("coralbricks", { contextTokens: 1_048_576, inputTokens: 1_048_576, outputTokens: 1_048_576 }),
    record("cortecs", { contextTokens: 1_048_576, outputTokens: 1_048_576 })
  ], "z-ai");

  assert.equal(limits.outputTokens, 131_072);
});

test("mergeLimits keeps the merged maximum when the author publishes no completion limit", () => {
  // Nothing authoritative to prefer: keep today's behaviour instead of inventing a cap.
  const limits = mergeLimits([
    record("302ai", { contextTokens: 262_144, outputTokens: 262_144 }),
    record("vercel", { contextTokens: 131_072, outputTokens: 131_072 })
  ], "moonshotai");

  assert.equal(limits.outputTokens, 262_144);
});

test("mergeLimits does not let an author's zero completion limit hide a real one", () => {
  const limits = mergeLimits([
    record("alpha", { contextTokens: 1_024, outputTokens: 0 }),
    record("beta", { contextTokens: 1_024, outputTokens: 512 })
  ], "alpha");

  assert.equal(limits.outputTokens, 512);

  // Only zeros published: the merged zero stays, as before.
  const zerosOnly = mergeLimits([record("alpha", { contextTokens: 1_024, outputTokens: 0 })], "alpha");
  assert.equal(zerosOnly.outputTokens, 0);
});

test("mergeLimits only narrows the completion limits, every other limit keeps its maximum", () => {
  const limits = mergeLimits([
    record("anthropic", { contextTokens: 200_000, inputTokens: 180_000, maxTokens: 32_000, outputTokens: 32_000 }),
    record("bedrock", { contextTokens: 1_000_000, inputTokens: 900_000, maxTokens: 64_000, outputTokens: 64_000 })
  ], "anthropic");

  assert.equal(limits.contextTokens, 1_000_000);
  assert.equal(limits.inputTokens, 900_000);
  assert.equal(limits.maxTokens, 32_000);
  assert.equal(limits.outputTokens, 32_000);
  assert.equal(limits.supports1MContext, true);
});

test("canonicalProviderToken folds first-party aliases onto the model author", () => {
  assert.equal(canonicalProviderToken("zai"), "z-ai");
  assert.equal(canonicalProviderToken("zhipuai"), "z-ai");
  assert.equal(canonicalProviderToken("deepinfra"), "deepinfra");
  assert.equal(canonicalProviderToken(""), undefined);
});
