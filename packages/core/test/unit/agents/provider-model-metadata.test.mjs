import assert from "node:assert/strict";
import test from "node:test";
import { providerModelMetadataFromConfigForTest } from "@ccr/core/config/config.ts";

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

test("provider model metadata config preserves custom pricing, image, web search, and reasoning levels", () => {
  assert.deepEqual(providerModelMetadataFromConfigForTest({
    capabilities: {
      image_input: true,
      web_search: true,
      unsupported_capability: true
    },
    pricing: {
      cache_read_usd_per_million_tokens: 0.25,
      cache_write_1h_usd_per_million_tokens: 3,
      cache_write_5m_usd_per_million_tokens: 2,
      cacheWriteUsdPerMillionTokens: "1.5",
      input_usd_per_million_tokens: 2,
      outputUsdPerMillionTokens: 8
    },
    supported_reasoning_levels: ["low", "medium", "high", "xhigh", "max", "ultra"],
    supports_reasoning_summaries: true
  }), {
    capabilities: {
      imageInput: true,
      webSearch: true
    },
    pricing: {
      cacheReadUsdPerMillionTokens: 0.25,
      cacheWrite1hUsdPerMillionTokens: 3,
      cacheWrite5mUsdPerMillionTokens: 2,
      cacheWriteUsdPerMillionTokens: 1.5,
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 8
    },
    supportedReasoningLevels: [
      { description: "low", effort: "low" },
      { description: "medium", effort: "medium" },
      { description: "high", effort: "high" },
      { description: "xhigh", effort: "xhigh" },
      { description: "max", effort: "max" },
      { description: "ultra", effort: "ultra" }
    ],
    supportsReasoningSummaries: true
  });
});

test("provider model metadata config drops invalid custom prices", () => {
  assert.deepEqual(providerModelMetadataFromConfigForTest({
    pricing: {
      inputUsdPerMillionTokens: -1,
      outputUsdPerMillionTokens: "not-a-price"
    },
    capabilities: {
      reasoning: "yes"
    },
    contextWindow: 128000
  }), {
    contextWindow: 128000
  });
});
