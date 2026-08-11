import assert from "node:assert/strict";
import test from "node:test";
import { modelCatalogMaxOutputTokens } from "@ccr/core/gateway/model-catalog.ts";

test("modelCatalogMaxOutputTokens prefers the per-response maxTokens cap over the outputTokens budget", () => {
  // deepseek/deepseek-v4-flash style entry: outputTokens is the full 1M context budget,
  // maxTokens is the real per-response cap. max_tokens must not exceed the provider cap.
  const entry = {
    limits: {
      contextTokens: 1_050_000,
      inputTokens: 1_048_576,
      maxTokens: 384_000,
      outputTokens: 1_048_576,
      supports1MContext: true
    }
  };
  assert.equal(modelCatalogMaxOutputTokens(entry), 384_000);
});

test("modelCatalogMaxOutputTokens falls back to outputTokens when maxTokens is absent", () => {
  const entry = { limits: { outputTokens: 384_000 } };
  assert.equal(modelCatalogMaxOutputTokens(entry), 384_000);
});

test("modelCatalogMaxOutputTokens returns 0 when no limits are present", () => {
  assert.equal(modelCatalogMaxOutputTokens(undefined), 0);
  assert.equal(modelCatalogMaxOutputTokens({}), 0);
});
