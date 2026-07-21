import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUsageInputTokens } from "@ccr/core/usage/normalization.ts";

test("normalizeUsageInputTokens subtracts cache tokens for OpenAI-compatible protocols", () => {
  const usage = normalizeUsageInputTokens(
    {
      cacheReadTokens: 20,
      cacheWriteTokens: 5,
      inputTokens: 100,
      outputTokens: 12
    },
    { providerProtocol: "openai_chat_completions" }
  );

  assert.deepEqual(usage, {
    cacheReadTokens: 20,
    cacheWriteTokens: 5,
    inputTokens: 75,
    outputTokens: 12
  });
});

test("normalizeUsageInputTokens keeps Anthropic input tokens unchanged", () => {
  const usage = normalizeUsageInputTokens(
    {
      cacheReadTokens: 20,
      cacheWriteTokens: 5,
      inputTokens: 100
    },
    { providerProtocol: "anthropic_messages" }
  );

  assert.deepEqual(usage, {
    cacheReadTokens: 20,
    cacheWriteTokens: 5,
    inputTokens: 100
  });
});

test("normalizeUsageInputTokens falls back to path and usage hints", () => {
  assert.equal(
    normalizeUsageInputTokens(
      { cacheReadTokens: 8, inputTokens: 50 },
      { path: "/v1/responses" }
    )?.inputTokens,
    42
  );
  assert.equal(
    normalizeUsageInputTokens(
      { cacheReadTokens: 8, inputTokens: 50 },
      { usageHint: { inputIncludesCacheTokens: false } }
    )?.inputTokens,
    50
  );
});
