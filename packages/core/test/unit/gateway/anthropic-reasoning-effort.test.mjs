import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnthropicReasoningEffort } from "@ccr/core/gateway/features/anthropic-reasoning-effort.ts";

const provider = { name: "Primary", modelMetadata: {
  target: { supportedReasoningLevels: ["low", "high", "max"].map(effort => ({ effort })) }
} };
test("effort follows the selected target while preserving the canonical request", () => {
  for (const [effort, expected] of [["medium", "high"], ["ultra", "max"], ["low", "low"]]) {
    const body = { output_config: { effort, format: { type: "json_schema" } }, thinking: { type: "adaptive" } };
    const result = normalizeAnthropicReasoningEffort(body, provider, "target");
    assert.equal((result?.body ?? body).output_config.effort, expected);
    assert.deepEqual((result?.body ?? body).output_config.format, body.output_config.format);
    assert.equal((result?.body ?? body).thinking, body.thinking);
    assert.equal(body.output_config.effort, effort);
  }
});
test("missing metadata and special effort values pass through", () => {
  for (const effort of [undefined, "auto", "custom"]) {
    assert.equal(normalizeAnthropicReasoningEffort({ output_config: { effort } }, provider, "target"), undefined);
  }
  assert.equal(normalizeAnthropicReasoningEffort({ output_config: { effort: "medium" } }, provider, "unknown"), undefined);
});
