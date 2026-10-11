import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnthropicReasoningEffort } from "@ccr/core/gateway/features/anthropic-reasoning-effort.ts";

function providerWithEfforts(efforts) {
  return {
    name: "Bailian",
    models: ["glm-5.3"],
    modelMetadata: { "glm-5.3": {
      supportedReasoningLevels: efforts?.map((effort) => ({ effort, description: effort }))
    } }
  };
}

test("Anthropic effort rounds up to a configured tier and clamps above the ceiling", () => {
  // Configuration order and duplicates must not change the strength order.
  const provider = providerWithEfforts(["max", " LOW ", "high", "max"]);
  for (const [before, after] of [
    ["minimal", "low"], ["low", "low"], ["medium", "high"], ["high", "high"],
    ["xhigh", "max"], ["max", "max"], ["ultra", "max"], [" Medium ", "high"]
  ]) {
    const body = { output_config: { effort: before } };
    const result = normalizeAnthropicReasoningEffort(body, provider, "glm-5.3");
    assert.equal((result?.body ?? body).output_config.effort, after, before);
    if (before === after) assert.equal(result, undefined);
  }
  const qwen = providerWithEfforts(["low", "medium", "xhigh"]);
  for (const effort of ["high", "max", "ultra"]) {
    assert.equal(normalizeAnthropicReasoningEffort({ output_config: { effort } }, qwen, "glm-5.3").after, "xhigh");
  }
  const single = providerWithEfforts(["high"]);
  for (const effort of ["low", "ultra"]) {
    assert.equal(normalizeAnthropicReasoningEffort({ output_config: { effort } }, single, "glm-5.3").after, "high");
  }
});

test("Anthropic effort changes only the effort field without mutating the canonical request", () => {
  const format = Object.freeze({ type: "json_schema", schema: { type: "object" } });
  const body = Object.freeze({
    model: "claude-opus-5-5",
    output_config: Object.freeze({ effort: "medium", format }),
    thinking: Object.freeze({ type: "adaptive" }),
    messages: Object.freeze([{ role: "user", content: "hello" }]),
    stream: true
  });
  const result = normalizeAnthropicReasoningEffort(body, providerWithEfforts(["low", "high", "max"]), " GLM-5.3 ");
  assert.deepEqual(result.body, { ...body, output_config: { effort: "high", format } });
  assert.equal(result.body.messages, body.messages);
  assert.equal(result.body.thinking, body.thinking);
  assert.equal(result.body.output_config.format, format);
  assert.equal(body.output_config.effort, "medium");
  assert.equal(normalizeAnthropicReasoningEffort(result.body, providerWithEfforts(["high"]), "glm-5.3"), undefined);
});

test("Anthropic effort leaves absent configuration and special or unknown values alone", () => {
  const provider = providerWithEfforts(["low", "high", "max"]);
  for (const output_config of [undefined, null, [], "medium", {}, { format: { type: "json_schema" } }]) {
    assert.equal(normalizeAnthropicReasoningEffort({ output_config }, provider, "glm-5.3"), undefined);
  }
  for (const effort of [undefined, null, 3, "", "none", "off", "auto", "custom"]) {
    assert.equal(normalizeAnthropicReasoningEffort({ output_config: { effort } }, provider, "glm-5.3"), undefined);
  }
  const body = { output_config: { effort: "medium" } };
  for (const efforts of [undefined, [], ["auto", "none", "custom"]]) {
    assert.equal(normalizeAnthropicReasoningEffort(body, providerWithEfforts(efforts), "glm-5.3"), undefined);
  }
  assert.equal(normalizeAnthropicReasoningEffort(body, provider, "claude-opus-5-5"), undefined);
  assert.equal(normalizeAnthropicReasoningEffort(body, { name: "Unknown" }, "glm-5.3"), undefined);
});
