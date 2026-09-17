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

test("appendAggregateErrorAttemptSummary translates the issue 1799 vLLM context-limit error", () => {
  const upstreamMessage = "Requested token count exceeds the model's maximum context length of 262144 tokens. "
    + "You requested a total of 262462 tokens: 230462 tokens from the input messages and 32000 tokens for the completion.";
  const payload = {
    error: {
      attempts: [
        {
          details: { message: upstreamMessage, object: "error", type: "BadRequestError" },
          message: "Upstream request failed.",
          provider: "openai",
          stage: "upstream_response",
          status: 400
        }
      ],
      message: "All target providers failed.",
      target_providers: ["openai"]
    }
  };

  const translated = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
  assert.ok(translated);
  const parsed = JSON.parse(translated);
  assert.equal(
    parsed.error.message,
    "input length and `max_tokens` exceed context limit: 230462 + 32000 > 262144"
  );
  assert.deepEqual(parsed.error.attempts, payload.error.attempts);
  assert.deepEqual(parsed.error.target_providers, ["openai"]);
  assert.equal(appendAggregateErrorAttemptSummary(translated), undefined);
});

test("appendAggregateErrorAttemptSummary translates common OpenAI and LiteLLM context-limit formats", () => {
  const cases = [
    {
      expected: "input length and `max_tokens` exceed context limit: 8000 + 1000 > 8192",
      message: "This model's maximum context length is 8,192 tokens. However, you requested 9,000 tokens "
        + "(8,000 in the messages, 1,000 in the completion)."
    },
    {
      expected: "input length and `max_tokens` exceed context limit: 4851 + 509 > 4097",
      message: "litellm.BadRequestError: ContextWindowExceededError: This model's maximum context length is "
        + "4097 tokens, however you requested 5360 tokens (4851 in your prompt; 509 for the completion)."
    },
    {
      expected: "input length and `max_tokens` exceed context limit: 130000 + 4096 > 131072",
      message: "ContextWindowExceededError: maximum context window is 131072 tokens. "
        + "The input length is 130000 tokens and max_tokens is 4096."
    },
    {
      expected: "input length and `max_tokens` exceed context limit: 230462 + 32000 > 262144",
      message: "input length and `max_tokens` exceed context limit: 230462 + 32000 > 262144",
      source: "attempt"
    }
  ];

  for (const { expected, message, source } of cases) {
    const attempt = source === "attempt"
      ? { message, status: 400 }
      : { details: { error: { message } }, message: "Upstream request failed.", status: 400 };
    const payload = {
      error: {
        attempts: [attempt],
        message: "All target providers failed."
      }
    };
    const translated = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
    assert.ok(translated);
    assert.equal(JSON.parse(translated).error.message, expected);
  }
});

test("appendAggregateErrorAttemptSummary only translates a context limit from the final attempt", () => {
  const payload = {
    error: {
      attempts: [
        {
          details: {
            message: "Requested token count exceeds the model's maximum context length of 1000 tokens. "
              + "You requested a total of 1100 tokens: 900 tokens from the input messages and 200 tokens for the completion."
          },
          message: "Upstream request failed.",
          status: 400
        },
        {
          details: { message: "invalid api-key", type: "authentication_error" },
          message: "Upstream request failed.",
          status: 403
        }
      ],
      message: "All target providers failed."
    }
  };

  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
  assert.ok(enriched);
  assert.match(JSON.parse(enriched).error.message, /^All target providers failed\./);
});

test("appendAggregateErrorAttemptSummary does not translate inconsistent context-limit counts", () => {
  const payload = {
    error: {
      attempts: [
        {
          details: {
            message: "This model's maximum context length is 10000 tokens. However, you requested 5000 tokens "
              + "(4000 in the messages, 1000 in the completion)."
          },
          message: "Upstream request failed.",
          status: 400
        }
      ],
      message: "All target providers failed."
    }
  };

  const enriched = appendAggregateErrorAttemptSummary(JSON.stringify(payload));
  assert.ok(enriched);
  assert.match(JSON.parse(enriched).error.message, /^All target providers failed\./);
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
