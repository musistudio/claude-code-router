import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

function transform(upstreamRequest) {
  return createGatewayPlugin().providerHooks.reduce((request, hook) =>
    hook.transformRequest({ upstreamRequest: request }).value, upstreamRequest);
}

test("#1781 Muse Spark token floor applies to all OpenRouter request formats without mutation", () => {
  for (const field of ["max_tokens", "max_completion_tokens", "max_output_tokens"]) {
    for (const value of [1, 15, 16, 128]) {
      const request = {
        url: "https://openrouter.ai/api/v1/responses", headers: {},
        body: { model: "meta/muse-spark-1.3-contributor", [field]: value }
      };
      const result = transform(request);
      assert.equal(result.body[field], Math.max(16, value));
      assert.equal(request.body[field], value);
    }
  }
});

test("#1781 token floor is scoped to Muse Spark on official OpenRouter JSON endpoints", () => {
  const body = { model: "meta/muse-spark-1.3-contributor", max_tokens: 1 };
  const request = { url: "https://openrouter.ai/api/v1/messages", headers: {}, body };
  for (const input of [
    { ...request, url: "https://example.test/v1/messages" },
    { ...request, url: "https://openrouter.ai.evil.test/api/v1/messages" },
    { ...request, body: { ...body, model: "meta-llama/llama-4" } },
    { ...request, bodyEncoding: "text", body: JSON.stringify(body) },
    { ...request, body: { model: body.model } },
    { ...request, body: { ...body, max_tokens: -1 } }
  ]) {
    assert.deepEqual(transform(input).body, input.body);
  }
});
