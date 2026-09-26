import assert from "node:assert/strict";
import test from "node:test";

test("ToolHub config parses and clamps Jev resolver settings", async () => {
  const { toolHubConfigFromRawForTest } = await import("@ccr/core/config/config.ts");
  const parsed = toolHubConfigFromRawForTest({
    resolver_mode: "jev",
    jev: {
      api_key: "typesafe-key",
      endpoint: "https://typesafe.example/v1/systemone",
      fit_threshold: 1.2,
      gate_threshold: -0.1,
      model: "jev-1.13.0",
      shortlist_size: 100
    }
  });

  assert.equal(parsed.resolverMode, "jev");
  assert.deepEqual(parsed.jev, {
    apiKey: "typesafe-key",
    endpoint: "https://typesafe.example/v1/systemone",
    fitThreshold: 1,
    gateThreshold: 0,
    model: "jev-1.13.0",
    shortlistSize: 64
  });
});

test("ToolHub config ignores unknown resolver modes", async () => {
  const { toolHubConfigFromRawForTest } = await import("@ccr/core/config/config.ts");
  assert.equal(toolHubConfigFromRawForTest({ resolverMode: "unknown" }), undefined);
});
