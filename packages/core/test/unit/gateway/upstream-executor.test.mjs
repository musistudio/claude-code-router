import assert from "node:assert/strict";
import test from "node:test";
import { fetchUpstreamWithFallback } from "@ccr/core/gateway/upstream/executor.ts";

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
