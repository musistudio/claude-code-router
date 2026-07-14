import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "../../packages/core/src/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "../../packages/core/src/storage/sqlite-native.ts";
import { UsageStore } from "../../packages/core/src/usage/store.ts";

test("UsageStore aggregates stats in SQLite without loading all events", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await store.record({
      createdAt: earlier.toISOString(),
      durationMs: 120,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-1",
      statusCode: 200,
      usage: {
        cacheReadTokens: 2,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 17
      }
    });
    await store.record({
      createdAt: now.toISOString(),
      durationMs: 80,
      method: "POST",
      model: "beta-model",
      path: "/v1/messages",
      provider: "beta",
      requestId: "req-2",
      statusCode: 500,
      usage: {
        inputTokens: 4,
        outputTokens: 6
      }
    });

    const stats = await store.getStats("30d", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 2);
    assert.equal(stats.totals.errorCount, 1);
    assert.equal(stats.totals.totalTokens, 27);
    assert.equal(stats.totals.inputTokens, 14);
    assert.equal(stats.totals.outputTokens, 11);
    assert.equal(stats.recentRequests.length, 2);
    assert.equal(stats.models[0]?.requestCount, 1);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore excludes proxy rows by default and includes them on request", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-proxy-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const createdAt = new Date().toISOString();

    await store.record({
      createdAt,
      durationMs: 10,
      method: "POST",
      model: "direct/model-a",
      path: "/v1/messages",
      requestId: "direct-1",
      statusCode: 200,
      usage: {
        inputTokens: 5,
        outputTokens: 7
      }
    });
    await store.record({
      createdAt,
      durationMs: 10,
      method: "POST",
      model: "proxy-model",
      path: "/v1/messages",
      provider: "proxy",
      requestId: "proxy-1",
      statusCode: 200,
      usage: {
        inputTokens: 100,
        outputTokens: 200
      }
    });

    const defaultStats = await store.getStats("30d");
    assert.equal(defaultStats.totals.requestCount, 1);
    assert.equal(defaultStats.totals.totalTokens, 12);
    assert.equal(defaultStats.providerModels[0]?.provider, "direct");
    assert.equal(defaultStats.providerModels[0]?.model, "model-a");

    const withProxy = await store.getStats("30d", { includeProxy: true });
    assert.equal(withProxy.totals.requestCount, 2);
    assert.equal(withProxy.totals.totalTokens, 312);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore treats null web RPC usage filters as empty filters", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-null-filter-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));

    await store.record({
      createdAt: new Date().toISOString(),
      durationMs: 10,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-null-filter",
      statusCode: 200,
      usage: {
        inputTokens: 3,
        outputTokens: 4
      }
    });

    const stats = await store.getStats("7d", null);
    assert.equal(stats.range, "7d");
    assert.equal(stats.totals.requestCount, 1);

    const defaultRangeStats = await store.getStats(null, null);
    assert.equal(defaultRangeStats.range, "7d");
    assert.equal(defaultRangeStats.totals.requestCount, 1);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore backfills missing events from request logs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-request-log-backfill-test-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    const requestLogStore = new RequestLogStore(requestLogDbFile);
    const usageStore = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });
    const createdAt = new Date().toISOString();

    await requestLogStore.record({
      client: "Claude Code",
      completedAt: createdAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/messages",
      providerName: "alpha",
      requestBody: Buffer.from(JSON.stringify({ model: "alpha-model" })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "req-backfill-1",
      responseBodyText: JSON.stringify({
        model: "alpha-model",
        usage: {
          input_tokens: 12,
          output_tokens: 5,
          total_tokens: 17
        }
      }),
      responseHeaders: new Headers({ "content-type": "application/json" }),
      startedAt: createdAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const stats = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 1);
    assert.equal(stats.totals.totalTokens, 17);
    assert.equal(stats.providerModels[0]?.provider, "alpha");
    assert.equal(stats.providerModels[0]?.model, "alpha-model");

    const reread = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(reread.totals.requestCount, 1);
    assert.equal(reread.totals.totalTokens, 17);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore aggregates client IPs and maps them onto recent requests", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-client-ip-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const createdAt = new Date().toISOString();

    await store.record({
      createdAt,
      clientIp: "10.0.0.1",
      durationMs: 30,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-ip-1",
      statusCode: 200,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
    });
    await store.record({
      createdAt,
      clientIp: "10.0.0.2",
      durationMs: 30,
      method: "POST",
      model: "beta-model",
      path: "/v1/messages",
      provider: "beta",
      requestId: "req-ip-2",
      statusCode: 200,
      usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 }
    });
    await store.record({
      createdAt,
      durationMs: 30,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-no-ip",
      statusCode: 200,
      usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 }
    });

    const stats = await store.getStats("30d", { includeProxy: true });
    assert.deepEqual([...stats.clientIps].sort(), ["10.0.0.1", "10.0.0.2"]);
    assert.equal(stats.recentRequests.find((row) => row.key === "2")?.clientIp, "10.0.0.2");
    assert.equal(stats.recentRequests.find((row) => row.key === "3")?.clientIp, undefined);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore filters totals by client IP while keeping IP options stable", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-client-ip-filter-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const createdAt = new Date().toISOString();

    await store.record({
      createdAt,
      clientIp: "10.0.0.1",
      durationMs: 10,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-a",
      statusCode: 200,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
    });
    await store.record({
      createdAt,
      clientIp: "10.0.0.2",
      durationMs: 10,
      method: "POST",
      model: "beta-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-b",
      statusCode: 200,
      usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 }
    });

    const byIp = await store.getStats("30d", { clientIp: "10.0.0.2", includeProxy: true, provider: "alpha" });
    assert.equal(byIp.totals.requestCount, 1);
    assert.equal(byIp.totals.totalTokens, 25);
    assert.equal(byIp.models[0]?.model, "beta-model");
    assert.deepEqual(byIp.clientIps, ["10.0.0.1", "10.0.0.2"]);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore backfills from a legacy request_logs table without client_ip", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-old-request-log-test-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    const createdAt = new Date().toISOString();
    const legacy = createBetterSqliteDatabase(requestLogDbFile);
    legacy.exec(`
      CREATE TABLE request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_usage_id INTEGER,
        created_at TEXT NOT NULL,
        request_id TEXT NOT NULL DEFAULT '',
        client TEXT NOT NULL DEFAULT 'unknown',
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'unknown',
        provider TEXT NOT NULL DEFAULT 'unknown',
        credential_id TEXT NOT NULL DEFAULT '',
        status_code INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL
      )
    `);
    legacy.prepare(`
      INSERT INTO request_logs (
        created_at, request_id, client, method, path, model, provider, status_code,
        duration_ms, input_tokens, output_tokens, total_tokens
      ) VALUES (?, 'req-old-backfill-1', 'Claude Code', 'POST', '/v1/messages',
        'alpha-model', 'alpha', 200, 25, 12, 5, 17)
    `).run(createdAt);
    legacy.close();

    const usageStore = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });
    const stats = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 1);
    assert.equal(stats.totals.totalTokens, 17);
    assert.equal(stats.clientIps.length, 0);

    const reread = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(reread.totals.requestCount, 1);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore migrates a legacy usage_events schema with client_ip", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-migration-test-"));
  try {
    const dbFile = path.join(dir, "usage.sqlite");
    const legacy = createBetterSqliteDatabase(dbFile);
    legacy.exec(`
      CREATE TABLE usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        request_id TEXT NOT NULL DEFAULT '',
        client TEXT NOT NULL DEFAULT 'unknown',
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'unknown',
        provider TEXT NOT NULL DEFAULT 'unknown',
        credential_id TEXT NOT NULL DEFAULT '',
        status_code INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        cost_source TEXT NOT NULL DEFAULT ''
      )
    `);
    legacy.prepare(`
      INSERT INTO usage_events (created_at, request_id, client, method, path, model, provider, status_code, duration_ms, input_tokens, output_tokens, total_tokens)
      VALUES (?, 'legacy-1', 'Claude Code', 'POST', '/v1/messages', 'alpha-model', 'alpha', 200, 10, 4, 2, 6)
    `).run(new Date().toISOString());
    legacy.close();

    const store = new UsageStore(dbFile);
    const stats = await store.getStats("30d", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 1);
    assert.equal(stats.totals.totalTokens, 6);
    assert.equal(stats.clientIps.length, 0);

    await store.record({
      createdAt: new Date().toISOString(),
      clientIp: "10.0.0.9",
      durationMs: 5,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "new-1",
      statusCode: 200,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });
    const after = await store.getStats("30d", { includeProxy: true });
    assert.ok(after.clientIps.includes("10.0.0.9"));
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
