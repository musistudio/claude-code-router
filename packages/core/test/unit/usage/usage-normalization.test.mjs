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

test("normalizeUsageInputTokens ignores the upstream protocol for a translated body", () => {
  // Anthropic response served from an OpenAI upstream: the body already excludes
  // the cached prefix, so the upstream's cache-inclusive rule must not apply.
  const usage = normalizeUsageInputTokens(
    {
      cacheReadTokens: 3584,
      inputIncludesCacheTokens: false,
      inputTokens: 250,
      outputTokens: 40
    },
    {
      path: "/v1/messages",
      providerProtocol: "openai_chat_completions",
      source: "responseBody"
    }
  );

  assert.equal(usage?.inputTokens, 250);
});

test("normalizeUsageInputTokens does not clamp a translated body to zero", () => {
  // The failure this guards against: subtracting an already-excluded cached
  // prefix drives input tokens negative, and the clamp reports it as 0.
  const usage = normalizeUsageInputTokens(
    {
      cacheReadTokens: 260608,
      inputIncludesCacheTokens: false,
      inputTokens: 1888
    },
    {
      path: "/v1/messages",
      providerProtocol: "openai_chat_completions",
      source: "responseBody"
    }
  );

  assert.equal(usage?.inputTokens, 1888);
});

test("normalizeUsageInputTokens subtracts on billing headers from the same response", () => {
  // Same response, other source: the gateway restates the upstream's own
  // counters, which do include the cached prefix.
  const usage = normalizeUsageInputTokens(
    {
      cacheReadTokens: 3584,
      inputTokens: 3834,
      outputTokens: 40
    },
    {
      path: "/v1/messages",
      providerProtocol: "openai_chat_completions",
      source: "providerBilling"
    }
  );

  assert.equal(usage?.inputTokens, 250);
});

test("normalizeUsageInputTokens still subtracts for a same-format body", () => {
  // No translation: an OpenAI body from an OpenAI upstream is cache-inclusive,
  // and the body's own fields say so.
  const usage = normalizeUsageInputTokens(
    {
      cacheReadTokens: 20,
      inputIncludesCacheTokens: true,
      inputTokens: 100
    },
    { path: "/v1/chat/completions", source: "responseBody" }
  );

  assert.equal(usage?.inputTokens, 80);
});

test("normalizeUsageInputTokens uses the path when a body declares no convention", () => {
  assert.equal(
    normalizeUsageInputTokens(
      { cacheReadTokens: 8, inputTokens: 50 },
      { path: "/v1/messages", source: "responseBody" }
    )?.inputTokens,
    50
  );
  assert.equal(
    normalizeUsageInputTokens(
      { cacheReadTokens: 8, inputTokens: 50 },
      { path: "/v1/chat/completions", source: "responseBody" }
    )?.inputTokens,
    42
  );
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
