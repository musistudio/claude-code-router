import assert from "node:assert/strict";
import test from "node:test";
import { reserveApiKeyLimits } from "@ccr/core/gateway/auth/api-key-authorizer.ts";
import { estimateLimitUsage } from "@ccr/core/gateway/limits/window-limiter.ts";

function reserve(body, id) {
  const response = {
    statusCode: undefined,
    writeHead(statusCode) { this.statusCode = statusCode; },
    end() {}
  };
  const allowed = reserveApiKeyLimits(
    { id, limits: { tpm: 5000 } },
    { method: "POST" },
    response,
    Buffer.from(JSON.stringify(body))
  );
  return { allowed, statusCode: response.statusCode };
}

test("API key token limits cover request inputs in every supported text protocol", () => {
  const input = "a".repeat(40_000);
  const requests = {
    anthropic: { messages: [{ role: "user", content: input }], max_tokens: 1 },
    chat: { messages: [{ role: "user", content: input }], max_completion_tokens: 1 },
    responses: { input, max_output_tokens: 1 },
    gemini: { contents: [{ role: "user", parts: [{ text: input }] }], generationConfig: { maxOutputTokens: 1 } },
    interactions: { input, generation_config: { max_output_tokens: 1 } }
  };
  for (const [protocol, body] of Object.entries(requests)) {
    assert.ok(estimateLimitUsage("POST", Buffer.from(JSON.stringify(body))).totalTokens > 10_000, protocol);
    assert.deepEqual(reserve(body, `large-input-${protocol}`), { allowed: false, statusCode: 429 }, protocol);
  }
});

test("API key token limits count system instructions and output reservations", () => {
  const instructions = "a".repeat(24_000);
  const requests = {
    responsesInstructions: { input: "hello", instructions, max_output_tokens: 1 },
    geminiInstructions: { systemInstruction: { parts: [{ text: instructions }] }, generationConfig: { maxOutputTokens: 1 } },
    interactionsInstructions: { input: "hello", system_instruction: instructions, generation_config: { max_output_tokens: 1 } },
    chatOutput: { messages: [], max_completion_tokens: 6000 },
    responsesOutput: { input: "hello", max_output_tokens: 6000 },
    geminiOutput: { contents: [], generationConfig: { maxOutputTokens: 6000 } },
    interactionsOutput: { input: "hello", generation_config: { max_output_tokens: 6000 } }
  };
  for (const [name, body] of Object.entries(requests)) {
    assert.deepEqual(reserve(body, name), { allowed: false, statusCode: 429 }, name);
  }
  assert.deepEqual(reserve({ input: "hello", max_output_tokens: 10 }, "small-input"), {
    allowed: true,
    statusCode: undefined
  });
});

test("token estimates retain defaults for missing output limits and non-body requests", () => {
  assert.equal(estimateLimitUsage("POST", Buffer.from('{"input":"test"}')).totalTokens, 1025);
  assert.deepEqual(estimateLimitUsage("GET", Buffer.from('{"input":"test"}')), { imageCount: 0, totalTokens: 0 });
  assert.deepEqual(estimateLimitUsage("POST", Buffer.alloc(0)), { imageCount: 0, totalTokens: 0 });
});
