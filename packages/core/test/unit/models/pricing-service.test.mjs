import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateUsageCostUsd,
  estimateUsageCostUsdFromLoadedCatalog,
  providerModelPricingForUsage
} from "@ccr/core/models/pricing-service.ts";

const pricing = {
  cacheReadUsdPerMillionTokens: 0.5,
  cacheWriteUsdPerMillionTokens: 3,
  inputUsdPerMillionTokens: 2,
  outputUsdPerMillionTokens: 8
};

test("custom model pricing is used without loading the remote catalog", async () => {
  const input = {
    cacheReadTokens: 250000,
    cacheWriteTokens: 100000,
    inputTokens: 1000000,
    model: "custom-model",
    outputTokens: 500000,
    pricing,
    provider: "Custom"
  };

  assert.deepEqual(await estimateUsageCostUsd(input), {
    amountUsd: 6.425,
    model: "custom-model",
    source: "custom"
  });
  assert.deepEqual(estimateUsageCostUsdFromLoadedCatalog(input), {
    amountUsd: 6.425,
    model: "custom-model",
    source: "custom"
  });
});

test("custom pricing requires both input and output prices", async () => {
  const result = estimateUsageCostUsdFromLoadedCatalog({
    inputTokens: 1000,
    model: "custom-model",
    pricing: { inputUsdPerMillionTokens: 2 },
    provider: "Custom"
  });

  assert.equal(result, undefined);
});

test("custom pricing applies separate 5m and 1h cache-write rates", () => {
  const result = estimateUsageCostUsdFromLoadedCatalog({
    cacheWrite1hTokens: 40000,
    cacheWrite5mTokens: 60000,
    cacheWriteTokens: 120000,
    model: "custom-model",
    pricing: {
      cacheWrite1hUsdPerMillionTokens: 6,
      cacheWrite5mUsdPerMillionTokens: 3,
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 8
    },
    provider: "Custom"
  });

  assert.ok(Math.abs((result?.amountUsd ?? 0) - 0.48) < 1e-12);
  assert.equal(result?.model, "custom-model");
  assert.equal(result?.source, "custom");
});

test("provider model pricing lookup is case-insensitive and accepts a full selector", () => {
  const config = {
    Providers: [{
      modelMetadata: { "Custom-Model": { pricing } },
      models: ["Custom-Model"],
      name: "Custom"
    }]
  };

  assert.deepEqual(providerModelPricingForUsage(config, "custom", "CUSTOM/Custom-Model"), pricing);
  assert.equal(providerModelPricingForUsage(config, "other", "custom-model"), undefined);
});
