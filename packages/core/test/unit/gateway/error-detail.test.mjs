import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAggregateErrorAttemptSummary,
  maxAggregateErrorDetailBodyBytes,
  shouldBufferAggregateErrorBody
} from "@ccr/core/gateway/http/error-detail.ts";

function aggregateErrorPayload() {
  return {
    error: {
      attempts: [
        {
          message: "upstream status 429: Throttling: Request rate increased too quickly.",
          provider: "anthropic",
          stage: "upstream",
          status: 429
        },
        {
          message: "upstream status 403: Model access denied.",
          provider: "anthropic",
          stage: "upstream",
          status: 403
        }
      ],
      message: "All target providers failed.",
      target_providers: ["anthropic"]
    }
  };
}

test("appendAggregateErrorAttemptSummary appends per-attempt summaries to the message", () => {
  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(aggregateErrorPayload()));
  assert.ok(enriched);
  const parsed = JSON.parse(enriched);
  assert.equal(
    parsed.error.message,
    "All target providers failed. "
      + "[upstream|429] upstream status 429: Throttling: Request rate increased too quickly. "
      + "| [upstream|403] upstream status 403: Model access denied."
  );
  // per-attempt details must survive for clients that render them
  assert.equal(parsed.error.attempts.length, 2);
  assert.deepEqual(parsed.error.target_providers, ["anthropic"]);
});

test("appendAggregateErrorAttemptSummary is idempotent", () => {
  const once = appendAggregateErrorAttemptSummary(JSON.stringify(aggregateErrorPayload()));
  assert.ok(once);
  assert.equal(appendAggregateErrorAttemptSummary(once), undefined);
});

test("appendAggregateErrorAttemptSummary leaves non-aggregate payloads untouched", () => {
  assert.equal(appendAggregateErrorAttemptSummary("not json"), undefined);
  assert.equal(appendAggregateErrorAttemptSummary(JSON.stringify({ ok: true })), undefined);
  assert.equal(appendAggregateErrorAttemptSummary(JSON.stringify({ error: { message: "x" } })), undefined);
  assert.equal(
    appendAggregateErrorAttemptSummary(JSON.stringify({ error: { attempts: [], message: "x" } })),
    undefined
  );
  assert.equal(
    appendAggregateErrorAttemptSummary(JSON.stringify({ error: { attempts: [{}], message: "x" } })),
    undefined
  );
});

test("appendAggregateErrorAttemptSummary caps attempt count and message length", () => {
  const payload = {
    error: {
      attempts: Array.from({ length: 12 }, () => ({
        message: "x".repeat(500),
        stage: "upstream",
        status: 429
      })),
      message: "All target providers failed."
    }
  };
  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
  assert.ok(enriched);
  const message = JSON.parse(enriched).error.message;
  const summaries = message.split(" | ");
  assert.equal(summaries.length, 8);
  for (const summary of summaries.slice(1)) {
    assert.ok(summary.length <= "[upstream|429] ".length + 200);
  }
});

test("appendAggregateErrorAttemptSummary tolerates non-primitive attempt fields", () => {
  const mixedPayload = {
    error: {
      attempts: [{ message: { nested: true }, stage: "upstream", status: 429 }],
      message: "All target providers failed."
    }
  };
  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(mixedPayload));
  assert.ok(enriched);
  assert.equal(JSON.parse(enriched).error.message, "All target providers failed. [upstream|429]");

  const unusablePayload = {
    error: {
      attempts: [{ message: { nested: true }, stage: null, status: [500] }],
      message: "All target providers failed."
    }
  };
  assert.equal(appendAggregateErrorAttemptSummary(JSON.stringify(unusablePayload)), undefined);
});

test("shouldBufferAggregateErrorBody requires bounded JSON bodies", () => {
  const headers = (entries) => new Headers(entries);
  assert.equal(shouldBufferAggregateErrorBody(headers([["content-type", "application/json"], ["content-length", "120"]])), true);
  assert.equal(shouldBufferAggregateErrorBody(headers([["content-type", "text/event-stream"], ["content-length", "120"]])), false);
  assert.equal(shouldBufferAggregateErrorBody(headers([["content-type", "application/json"]])), false);
  assert.equal(shouldBufferAggregateErrorBody(headers([["content-type", "application/json"], ["content-length", "0"]])), false);
  assert.equal(shouldBufferAggregateErrorBody(headers([["content-type", "application/json"], ["content-length", "abc"]])), false);
  assert.equal(
    shouldBufferAggregateErrorBody(headers([["content-type", "application/json"], ["content-length", String(maxAggregateErrorDetailBodyBytes + 1)]])),
    false
  );
});
