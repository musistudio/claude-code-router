import assert from "node:assert/strict";
import test from "node:test";
import { fetchUpstreamWithFallback } from "@ccr/core/gateway/upstream/executor.ts";
import { RequestRouteTraceRecorder } from "@ccr/core/observability/route-trace.ts";

const retryConfig = {
  Providers: [],
  Router: { fallback: { mode: "retry", models: [], retryCount: 1 }, rules: [] },
  virtualModelProfiles: []
};
const retryFallback = { mode: "retry", models: [], retryCount: 1 };

async function assertRetryBackoffStopsAfterAbort(fetchImpl) {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const controller = new AbortController();
  let fetchCount = 0;
  globalThis.fetch = async (...args) => {
    fetchCount += 1;
    return fetchImpl(...args);
  };
  globalThis.setTimeout = (_callback, delay, ..._args) => {
    const timer = originalSetTimeout(() => {}, delay);
    timer.unref?.();
    queueMicrotask(() => controller.abort(new Error("client disconnected")));
    return timer;
  };

  try {
    const outcome = await Promise.race([
      fetchUpstreamWithFallback({
        body: Buffer.from('{"model":"test-model"}'),
        config: retryConfig,
        coreAuthToken: "core-token",
        fallback: retryFallback,
        headers: {},
        method: "POST",
        path: "/v1/messages",
        routedModel: "test-model",
        signal: controller.signal,
        upstreamUrl: "http://127.0.0.1:3456/v1/messages"
      }).then(
        () => ({ kind: "resolved" }),
        (error) => ({ error, kind: "rejected" })
      ),
      new Promise((resolve) => setImmediate(() => resolve({ kind: "pending" })))
    ]);

    assert.notEqual(outcome.kind, "pending");
    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.error.message, /client disconnected/);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
}

test("retry backoff stops after client aborts a retryable HTTP response", async () => {
  await assertRetryBackoffStopsAfterAbort(async () => new Response(null, { status: 503 }));
});

test("retry backoff stops after client aborts a network error", async () => {
  await assertRetryBackoffStopsAfterAbort(async () => {
    throw new Error("upstream unavailable");
  });
});

test("model-chain fallback rebuilds every protocol attempt from the canonical request", async () => {
  const config = {
    Providers: [
      {
        capabilities: [{ baseUrl: "https://anthropic-primary.example", type: "anthropic_messages" }],
        id: "anthropic-primary",
        models: ["claude-primary"],
        name: "Anthropic Primary"
      },
      {
        capabilities: [{ baseUrl: "https://openai-fallback.example", type: "openai_responses" }],
        id: "openai-fallback",
        models: ["gpt-fallback"],
        name: "OpenAI Fallback"
      },
      {
        capabilities: [{ baseUrl: "https://anthropic-recovery.example", type: "anthropic_messages" }],
        id: "anthropic-recovery",
        models: ["claude-recovery"],
        name: "Anthropic Recovery"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    virtualModelProfiles: []
  };
  const fallback = {
    mode: "model-chain",
    models: ["OpenAI Fallback/gpt-fallback", "Anthropic Recovery/claude-recovery"],
    retryCount: 0
  };
  const canonicalBody = {
    context_management: { edits: [{ type: "clear_tool_uses_20250919" }] },
    messages: [{ content: "hello", role: "user" }],
    model: "Anthropic Primary/claude-primary",
    output_config: { effort: "high", verbosity: "medium" },
    system: [{ cache_control: { type: "ephemeral" }, text: "system", type: "text" }],
    thinking: { type: "adaptive" }
  };
  const captured = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    captured.push({
      body: JSON.parse(init.body),
      headers: init.headers
    });
    const status = captured.length === 1 ? 429 : captured.length === 2 ? 400 : 200;
    return new Response('{"ok":true}', {
      headers: {
        "content-type": "application/json",
        "retry-after": "0.001"
      },
      status
    });
  };

  try {
    const trace = new RequestRouteTraceRecorder(Date.now());
    const result = await fetchUpstreamWithFallback({
      body: Buffer.from(JSON.stringify(canonicalBody)),
      config,
      coreAuthToken: "core-token",
      fallback,
      headers: {},
      method: "POST",
      path: "/v1/messages",
      routedModel: canonicalBody.model,
      trace,
      upstreamUrl: "http://127.0.0.1:3456/v1/messages"
    });

    assert.equal(result.response.status, 200);
    assert.equal(captured.length, 3);
    assert.deepEqual(captured.map((attempt) => attempt.body.model), [
      "claude-primary",
      "gpt-fallback",
      "claude-recovery"
    ]);
    assert.deepEqual(captured[0].body.thinking, { type: "adaptive" });
    assert.equal(captured[1].body.thinking, undefined);
    assert.deepEqual(captured[2].body.thinking, { type: "adaptive" });
    assert.deepEqual(captured[2].body.context_management, canonicalBody.context_management);
    assert.deepEqual(captured[2].body.output_config, canonicalBody.output_config);
    assert.equal(captured[0].headers["x-target-provider"], "anthropic-primary::anthropic_messages");
    assert.equal(captured[1].headers["x-target-provider"], "openai-fallback::openai_responses");
    assert.equal(captured[2].headers["x-target-provider"], "anthropic-recovery::anthropic_messages");
    const finishedTrace = trace.finish();
    const capabilityRoutingHops = finishedTrace.hops
      .filter((hop) => hop.name === "provider.capability-routing");
    assert.deepEqual(
      capabilityRoutingHops.map((hop) => hop.attempt),
      [1, 2, 3]
    );
    assert.deepEqual(
      capabilityRoutingHops[0].changes.map((change) => change.path),
      ["/body/model", "/routing/model"]
    );
    assert.deepEqual(
      finishedTrace.hops
        .find((hop) => hop.name === "fallback.execution-plan")
        ?.changes.map((change) => change.path),
      ["/routing/fallback"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
