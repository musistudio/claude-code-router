import assert from "node:assert/strict";
import test from "node:test";
import { providerCapabilityFeaturesFromConfigForTest } from "@ccr/core/config/config.ts";

test("provider capability features config preserves responses reasoning fields", () => {
  assert.deepEqual(providerCapabilityFeaturesFromConfigForTest({
    reasoningHistoryPolicy: "plaintext",
    reasoningSummaryPolicy: "asContent"
  }), {
    reasoningHistoryPolicy: "plaintext",
    reasoningSummaryPolicy: "as_content"
  });

  assert.deepEqual(providerCapabilityFeaturesFromConfigForTest({
    reasoning_history_policy: "encrypted",
    reasoning_summary_policy: "as_content"
  }), {
    reasoningHistoryPolicy: "encrypted",
    reasoningSummaryPolicy: "as_content"
  });
});

test("provider capability features config drops invalid responses reasoning fields", () => {
  assert.equal(providerCapabilityFeaturesFromConfigForTest({
    reasoningHistoryPolicy: "decrypt",
    reasoningSummaryPolicy: "convert"
  }), undefined);
});
