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

test("appendAggregateErrorAttemptSummary extracts structured detail causes for generic attempt messages", () => {
  const payload = {
    error: {
      attempts: [
        {
          details: { code: "InvalidParameter", message: "messages.content.type 参数非法，取值范围 ['text']", request_id: "abc" },
          message: "Upstream request failed.",
          stage: "upstream_response",
          status: 400
        },
        {
          details: { code: null, message: "invalid api-key", param: null, type: "authentication_error" },
          message: "Upstream request failed.",
          stage: "upstream_response",
          status: 403
        }
      ],
      message: "All target providers failed."
    }
  };
  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
  assert.ok(enriched);
  assert.equal(
    JSON.parse(enriched).error.message,
    "All target providers failed. "
      + "[upstream_response|400] InvalidParameter: messages.content.type 参数非法，取值范围 ['text'] "
      + "| [upstream_response|403] authentication_error: invalid api-key"
  );
});

test("appendAggregateErrorAttemptSummary extracts causes from SSE error frames in details.raw", () => {
  const payload = {
    error: {
      attempts: [
        {
          details: { raw: 'event:error\ndata:{"code":"InvalidParameter","message":"messages.content.type 参数非法，取值范围 [\'text\']","request_id":"f956-1"}\n\n' },
          message: "Upstream request failed.",
          stage: "upstream_response",
          status: 400
        }
      ],
      message: "All target providers failed."
    }
  };
  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
  assert.ok(enriched);
  assert.equal(
    JSON.parse(enriched).error.message,
    "All target providers failed. "
      + "[upstream_response|400] InvalidParameter: messages.content.type 参数非法，取值范围 ['text']"
  );

  // unparsable raw frames fall back to the trimmed raw text
  const rawTextPayload = {
    error: {
      attempts: [
        { details: { raw: "  opaque upstream text  " }, message: "Upstream request failed.", stage: "upstream", status: 500 }
      ],
      message: "All target providers failed."
    }
  };
  const rawEnriched = appendAggregateErrorAttemptSummary(JSON.stringify(rawTextPayload));
  assert.ok(rawEnriched);
  assert.equal(
    JSON.parse(rawEnriched).error.message,
    "All target providers failed. [upstream|500] opaque upstream text"
  );
});

test("appendAggregateErrorAttemptSummary keeps specific attempt messages over details", () => {
  const payload = {
    error: {
      attempts: [
        {
          details: { message: "inner detail that must not win" },
          message: "upstream status 429: Throttling: Request rate increased too quickly.",
          stage: "upstream",
          status: 429
        }
      ],
      message: "All target providers failed."
    }
  };
  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
  assert.ok(enriched);
  assert.equal(
    JSON.parse(enriched).error.message,
    "All target providers failed. [upstream|429] upstream status 429: Throttling: Request rate increased too quickly."
  );
});

test("appendAggregateErrorAttemptSummary falls back to the generic message when details carry nothing usable", () => {
  const payload = {
    error: {
      attempts: [
        { details: { request_id: "abc" }, message: "Upstream request failed.", stage: "upstream", status: 502 },
        { details: "plain string", message: "Upstream request failed.", stage: "upstream", status: 502 }
      ],
      message: "All target providers failed."
    }
  };
  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
  assert.ok(enriched);
  assert.equal(
    JSON.parse(enriched).error.message,
    "All target providers failed. [upstream|502] Upstream request failed. | [upstream|502] Upstream request failed."
  );
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
