import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";
import { UsageStore } from "@ccr/core/usage/store.ts";

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
    assert.equal(filtered.clients[0].requestCount, 1);
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
