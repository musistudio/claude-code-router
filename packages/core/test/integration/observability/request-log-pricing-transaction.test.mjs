import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { preloadUsagePriceCatalog } from "@ccr/core/models/pricing-service.ts";
import { RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";

test("RequestLogStore commits while a background pricing refresh is stalled", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-pricing-lock-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const first = new RequestLogStore(dbFile);
  const second = new RequestLogStore(dbFile);
  const previousFetch = globalThis.fetch;
  let releaseFetch;
  let signalFetchStarted;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const fetchStarted = new Promise((resolve) => {
    signalFetchStarted = resolve;
  });
  globalThis.fetch = async () => {
    signalFetchStarted();
    await fetchGate;
    return new Response(JSON.stringify({
      "pricing-lock-model": {
        input_cost_per_token: 0.000001,
        litellm_provider: "pricing-lock-provider",
        output_cost_per_token: 0.000002
      }
    }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };

  let pricingRefresh;
  let fetchStartTimeout;
  try {
    pricingRefresh = preloadUsagePriceCatalog();
    await Promise.race([
      fetchStarted,
      new Promise((_, reject) => {
        fetchStartTimeout = setTimeout(() => reject(new Error("pricing fetch did not start")), 5_000);
      })
    ]);
    clearTimeout(fetchStartTimeout);
    fetchStartTimeout = undefined;

    const pricedWrite = first.writeBatch([{
      eventId: "priced-event",
      input: createRecord("priced-request", '{"usage":{"input_tokens":1,"output_tokens":1}}'),
      kind: "record",
      sequence: 1
    }]);
    const pricedResult = await Promise.race([
      pricedWrite,
      new Promise((_, reject) => {
        fetchStartTimeout = setTimeout(() => reject(new Error("request log write waited for pricing")), 1_000);
      })
    ]);
    assert.equal(pricedResult.pricingRefreshNeeded, true);
    clearTimeout(fetchStartTimeout);
    fetchStartTimeout = undefined;

    // The pricing request is deliberately stalled. Both writers can commit,
    // and cost can be filled after the shared catalog refresh completes.
    const zeroTokenResult = await second.writeBatch([{
      eventId: "zero-token-event",
      input: createRecord("zero-token-request", "{}"),
      kind: "record",
      sequence: 2
    }]);
    assert.equal(zeroTokenResult.pricingRefreshNeeded, false);

    const page = await first.list({ pageSize: 25 });
    assert.equal(page.items.length, 2);
    releaseFetch();
    await pricingRefresh;
    // Fill the newest page with models that cannot be priced. The older known
    // model must still be reached by pagination.
    const database = createBetterSqliteDatabase(dbFile);
    try {
      const insert = database.prepare(`
        INSERT INTO request_logs (
          created_at,
          method,
          path,
          model,
          provider,
          input_tokens,
          total_tokens
        ) VALUES (?, 'POST', '/v1/messages', 'unknown-price-model', 'unknown-provider', 1, 1)
      `);
      database.transaction(() => {
        for (let index = 0; index < 1_001; index += 1) {
          insert.run(new Date().toISOString());
        }
      })();
    } finally {
      database.close();
    }
    assert.equal(await first.backfillMissingUsageCosts(), 1);
    const updated = await first.getDetail({ id: page.items.find((item) => item.requestId === "priced-request").id });
    assert.equal(updated.costUsd, 0.000003);
  } finally {
    clearTimeout(fetchStartTimeout);
    releaseFetch?.();
    await pricingRefresh?.catch(() => undefined);
    globalThis.fetch = previousFetch;
    await Promise.all([first.close(), second.close()]);
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore applies persisted custom model pricing to raw trace usage updates", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-custom-pricing-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const store = new RequestLogStore(dbFile);
  try {
    const record = createRecord(
      "custom-pricing-request",
      '{"usage":{"input_tokens":1000000,"output_tokens":500000}}'
    );
    record.model = "custom-model";
    record.providerName = "custom-provider";
    record.pricing = {
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 8
    };
    const result = await store.writeBatch([{
      eventId: "custom-pricing-event",
      input: record,
      kind: "record",
      sequence: 1
    }]);
    assert.equal(result.pricingRefreshNeeded, false);

    let page = await store.list({ pageSize: 10 });
    let detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.costUsd, 6);

    assert.equal(await store.updateFromRawTrace({
      model: "custom-model",
      provider: "custom-provider",
      requestId: "custom-pricing-request",
      responseBodyText: '{"usage":{"input_tokens":2000000,"output_tokens":1000000}}'
    }), true);
    page = await store.list({ pageSize: 10 });
    detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.costUsd, 12);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore prices Anthropic 5m and 1h cache writes separately", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-cache-duration-pricing-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const store = new RequestLogStore(dbFile);
  try {
    const record = createRecord(
      "cache-duration-pricing-request",
      [
        "event: message_start",
        `data: ${JSON.stringify({
          message: {
            model: "custom-model",
            usage: {
              cache_creation: {
                ephemeral_1h_input_tokens: 100000,
                ephemeral_5m_input_tokens: 200000
              },
              cache_creation_input_tokens: 300000,
              input_tokens: 1000000
            }
          },
          type: "message_start"
        })}`,
        "",
        "event: message_delta",
        `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 500000 } })}`,
        ""
      ].join("\n")
    );
    record.model = "custom-model";
    record.providerName = "custom-provider";
    record.pricing = {
      cacheWrite1hUsdPerMillionTokens: 6,
      cacheWrite5mUsdPerMillionTokens: 3,
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 8
    };

    const result = await store.writeBatch([{
      eventId: "cache-duration-pricing-event",
      input: record,
      kind: "record",
      sequence: 1
    }]);
    assert.equal(result.pricingRefreshNeeded, false);

    const page = await store.list({ pageSize: 10 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.cacheWriteTokens, 300000);
    assert.ok(Math.abs(detail.costUsd - 7.2) < 1e-12);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

function createRecord(requestId, responseBodyText) {
  const now = new Date().toISOString();
  return {
    completedAt: now,
    durationMs: 10,
    method: "POST",
    model: "pricing-lock-model",
    path: "/v1/messages",
    providerName: "pricing-lock-provider",
    requestBody: Buffer.from('{"model":"pricing-lock-model"}'),
    requestHeaders: { "content-type": "application/json" },
    requestId,
    responseBodyText,
    responseHeaders: { "content-type": "application/json" },
    startedAt: now,
    statusCode: 200,
    url: "http://127.0.0.1:3456/v1/messages"
  };
}
