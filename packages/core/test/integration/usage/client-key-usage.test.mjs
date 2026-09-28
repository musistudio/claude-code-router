import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import { RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";
import { UsageStore, usageStore } from "@ccr/core/usage/store.ts";

const baseEvent = {
  costUsd: 0.01,
  durationMs: 100,
  method: "POST",
  model: "model",
  path: "/v1/messages",
  provider: "provider",
  statusCode: 200,
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
};

test("gateway usage attributes the authenticated key independently of the client display header", { timeout: 5_000 }, async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-client-key-pipeline-"));
  const store = new UsageStore(path.join(dir, "usage.sqlite"), { estimateCost: async () => undefined });
  const config = createDefaultAppConfig();
  config.observability.requestLogs = false;
  config.contextArchive.enabled = false;
  config.Providers = [{ name: "provider", models: ["model"], capabilities: [{ type: "anthropic_messages", baseUrl: "https://example.test/v1/messages" }] }];
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test-core-token",
    getPlugin: () => new ClaudeCodeRouterPlugin(config),
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" })
  });
  let finishCapture;
  const captured = new Promise((resolve) => { finishCapture = resolve; });
  t.mock.method(usageStore, "recordCapture", async (input) => {
    await store.recordCapture(input);
    finishCapture(input);
  });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    model: "model", content: [], usage: { input_tokens: 10, output_tokens: 5 }
  }), { headers: { "content-type": "application/json" }, status: 200 }));

  try {
    const request = Readable.from([JSON.stringify({ model: "provider/model", messages: [{ role: "user", content: "hello" }], max_tokens: 8 })]);
    request.method = "POST";
    request.url = "/v1/messages";
    request.headers = { "content-type": "application/json", "x-ccr-client": "Custom display name" };
    const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
    response.writeHead = (statusCode) => { response.statusCode = statusCode; return response; };
    await pipeline.proxyRequest(request, response, "/v1/messages", {
      id: "authenticated-key", name: "Mac mini", key: "private-key-value", createdAt: new Date().toISOString()
    });
    assert.equal(response.statusCode, 200);
    const input = await captured;
    assert.equal(input.client, "Custom display name");
    const stats = await store.getStats("24h", { includeProxy: true });
    assert.equal(stats.clients[0].clientApiKeyId, "authenticated-key");
    assert.equal(stats.clients[0].label, "Mac mini");
    assert.equal(stats.clients[0].totalTokens, 15);
    assert.equal(JSON.stringify(stats).includes("private-key-value"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("client usage groups all routes by key ID, including renamed and same-name keys", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-client-key-groups-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const now = Date.now();
    for (let index = 0; index < 30; index += 1) {
      await store.record({
        ...baseEvent,
        client: index % 2 ? "Codex" : "Claude Code",
        clientApiKeyId: "key-a",
        clientApiKeyName: index < 15 ? "Old name" : "Mac mini",
        createdAt: new Date(now - 60_000 + index).toISOString(),
        credentialId: `credential-${index}`,
        model: `model-${index}`,
        provider: index % 2 ? "beta" : "alpha",
        statusCode: index === 0 ? 500 : 200
      });
    }
    await store.record({ ...baseEvent, clientApiKeyId: "key-b", clientApiKeyName: "Mac mini" });
    await store.record({ ...baseEvent, clientApiKeyId: "unnamed-key" });
    await store.record({ ...baseEvent, client: "Mac mini" });
    await store.record({ ...baseEvent, client: "unknown", model: "other-model", provider: "other-provider" });

    const stats = await store.getStats("24h", { includeProxy: true });
    assert.equal(stats.clients.length, 4);
    const first = stats.clients.find((row) => row.clientApiKeyId === "key-a");
    assert.equal(first.label, "Mac mini");
    assert.equal(first.requestCount, 30);
    assert.equal(first.totalTokens, 450);
    assert.equal(first.inputTokens, 300);
    assert.equal(first.outputTokens, 150);
    assert.equal(first.errorCount, 1);
    assert.equal(first.successRate, 29 / 30);
    assert.equal(first.avgDurationMs, 100);
    assert.ok(Math.abs(first.costUsd - 0.3) < 1e-8);
    assert.equal(first.provider, undefined);
    assert.equal(first.model, undefined);
    assert.equal(first.credentialId, undefined);
    const sameName = stats.clients.find((row) => row.clientApiKeyId === "key-b");
    assert.equal(sameName.label, "Mac mini");
    assert.notEqual(sameName.key, first.key);
    assert.equal(sameName.requestCount, 1);
    assert.equal(stats.clients.find((row) => row.clientApiKeyId === "unnamed-key").label, "unnamed-key");
    assert.equal(stats.clients.find((row) => !row.clientApiKeyId).requestCount, 2);
    assert.equal(stats.clients.reduce((sum, row) => sum + row.totalTokens, 0), stats.totals.totalTokens);
    // Route data has its own top-25 limit. It must not truncate key totals.
    assert.equal(stats.clientModels.length, 25);
    assert.ok(stats.clientModels.every((row) => row.provider && row.model));

    const filtered = await store.getStats("24h", { includeProxy: true, model: "model-0", provider: "alpha" });
    assert.equal(filtered.clients.length, 1);
    assert.equal(filtered.clients[0].label, "Mac mini");
    assert.equal(filtered.clients[0].requestCount, 1);
    assert.equal(filtered.clients[0].totalTokens, 15);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("client usage recovers historical key identities from exact request log matches without recounting", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-client-key-backfill-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    const logs = new RequestLogStore(requestLogDbFile);
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });
    await store.record({ ...baseEvent, requestId: "recover", usage: { inputTokens: 90, outputTokens: 10 } });
    await store.record({ ...baseEvent, requestId: "preserve", clientApiKeyId: "original", clientApiKeyName: "Original key" });
    await store.record({ ...baseEvent, requestId: "no-match", client: "Mac mini" });
    assert.equal((await store.getStats("24h", { includeProxy: true })).clients.find((row) => !row.clientApiKeyId).requestCount, 2);

    for (const requestId of ["recover", "preserve", "new-event"]) {
      const createdAt = new Date().toISOString();
      await logs.record({
        client: "Codex",
        clientApiKeyId: "recovered-key",
        clientApiKeyName: "Mac mini",
        completedAt: createdAt,
        durationMs: 25,
        method: "POST",
        path: "/v1/messages",
        providerName: "provider",
        requestBody: Buffer.from(JSON.stringify({ model: "model" })),
        requestHeaders: {},
        requestId,
        responseBodyText: JSON.stringify({ model: "model", usage: { input_tokens: 10, output_tokens: 5 } }),
        responseHeaders: new Headers({ "content-type": "application/json" }),
        startedAt: createdAt,
        statusCode: 200,
        url: "https://example.test/v1/messages"
      });
    }

    for (let repeat = 0; repeat < 2; repeat += 1) {
      const stats = await store.getStats("24h", { includeProxy: true });
      assert.equal(stats.totals.requestCount, 4);
      const recovered = stats.clients.find((row) => row.clientApiKeyId === "recovered-key");
      assert.equal(recovered.label, "Mac mini");
      assert.equal(recovered.requestCount, 2);
      assert.equal(recovered.totalTokens, 115);
      assert.equal(stats.clients.find((row) => row.clientApiKeyId === "original").requestCount, 1);
      assert.equal(stats.clients.find((row) => !row.clientApiKeyId).requestCount, 1);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("client usage migrates old databases and tolerates request logs without key columns", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-client-key-migration-"));
  try {
    const dbFile = path.join(dir, "usage.sqlite");
    const logFile = path.join(dir, "request-logs.sqlite");
    const legacyColumns = `
      created_at TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT '', client TEXT NOT NULL DEFAULT 'unknown',
      method TEXT NOT NULL, path TEXT NOT NULL, model TEXT NOT NULL DEFAULT 'unknown',
      provider TEXT NOT NULL DEFAULT 'unknown', credential_id TEXT NOT NULL DEFAULT '',
      status_code INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL`;
    const oldUsage = createBetterSqliteDatabase(dbFile);
    oldUsage.exec(`CREATE TABLE usage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ${legacyColumns})`);
    oldUsage.prepare("INSERT INTO usage_events (created_at, request_id, client, method, path, total_tokens) VALUES (?, 'legacy-usage', 'Mac mini', 'POST', '/v1/messages', 10)").run(new Date().toISOString());
    oldUsage.close();
    const oldLogs = createBetterSqliteDatabase(logFile);
    oldLogs.exec(`CREATE TABLE request_logs (id INTEGER PRIMARY KEY, source_usage_id INTEGER, ${legacyColumns})`);
    oldLogs.prepare("INSERT INTO request_logs (created_at, request_id, client, method, path, total_tokens) VALUES (?, 'legacy-log', 'Codex', 'POST', '/v1/messages', 20)").run(new Date().toISOString());
    oldLogs.close();

    const store = new UsageStore(dbFile, { requestLogDbFile: logFile });
    const stats = await store.getStats("24h", { includeProxy: true });
    assert.equal(stats.clients.length, 1);
    assert.equal(stats.clients[0].clientApiKeyId, undefined);
    assert.equal(stats.clients[0].requestCount, 2);
    assert.equal(stats.clients[0].totalTokens, 30);
    await store.record({ ...baseEvent, clientApiKeyId: "new-key", clientApiKeyName: "New key" });
    assert.equal((await store.getStats("24h", { includeProxy: true })).clients.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
