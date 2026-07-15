import assert from "node:assert/strict";
import test from "node:test";
import { providerModelMetadataFromConfigForTest } from "../../packages/core/src/config/config.ts";

test("provider model metadata config preserves context fields", () => {
  assert.deepEqual(providerModelMetadataFromConfigForTest({
    contextWindow: 272000,
    effectiveContextWindowPercent: 95,
    maxContextWindow: 300000
  }), {
    contextWindow: 272000,
    effectiveContextWindowPercent: 95,
    maxContextWindow: 300000
  });

  assert.deepEqual(providerModelMetadataFromConfigForTest({
    context_window: 128000,
    effective_context_window_percent: 90,
    max_context_window: 200000
  }), {
    contextWindow: 128000,
    effectiveContextWindowPercent: 90,
    maxContextWindow: 200000
  });
});

test("provider model metadata config ignores invalid context fields", () => {
  assert.equal(providerModelMetadataFromConfigForTest({
    context_window: 0,
    effective_context_window_percent: 101,
    max_context_window: -1
  }), undefined);
});
