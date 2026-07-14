import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "../../packages/core/src/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "../../packages/core/src/storage/sqlite-native.ts";

function baseInput(overrides = {}) {
  const startedAt = new Date().toISOString();
  return {
    completedAt: startedAt,
    durationMs: 12,
    method: "POST",
    path: "/v1/messages",
    providerName: "test-provider",
    requestBody: Buffer.from(JSON.stringify({ model: "test-model" }), "utf8"),
    requestHeaders: { "content-type": "application/json" },
    requestId: "client-ip-request",
    responseBodyText: JSON.stringify({ model: "test-model", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }),
    responseHeaders: new Headers({ "content-type": "application/json" }),
    startedAt,
    statusCode: 200,
    url: "http://127.0.0.1:3456/v1/messages",
    ...overrides
  };
}

test("RequestLogStore persists client_ip captured at the gateway boundary", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-client-ip-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    await store.record(baseInput({ clientIp: "203.0.113.7" }));

    const detail = await store.getDetail({ id: (await store.list({ pageSize: 25 })).items[0].id });
    assert.ok(detail);
    assert.equal(detail.clientIp, "203.0.113.7");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore defaults client_ip to empty when unset", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-empty-client-ip-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    await store.record(baseInput({ clientIp: undefined }));

    const detail = await store.getDetail({ id: (await store.list({ pageSize: 25 })).items[0].id });
    assert.ok(detail);
    assert.equal(detail.clientIp, "");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore migrates a legacy request_logs table with client_ip", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-client-ip-migration-test-"));
  try {
    const dbFile = path.join(dir, "request-logs.sqlite");
    const legacy = createBetterSqliteDatabase(dbFile);
    legacy.exec(`
      CREATE TABLE request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL
      )
    `);
    legacy.prepare(`
      INSERT INTO request_logs (created_at, method, path)
      VALUES (?, 'POST', '/v1/messages')
    `).run(new Date().toISOString());
    legacy.close();

    const store = new RequestLogStore(dbFile);
    const legacyDetail = await store.getDetail({ id: 1 });
    assert.ok(legacyDetail);
    assert.equal(legacyDetail.clientIp, "");

    await store.record(baseInput({ clientIp: "198.51.100.4", requestId: "post-migration" }));
    const page = await store.list({ pageSize: 25 });
    const newEntry = page.items.find((entry) => entry.requestId === "post-migration");
    assert.ok(newEntry);
    assert.equal(newEntry.clientIp, "198.51.100.4");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
