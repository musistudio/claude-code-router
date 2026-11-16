import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";

function record(requestId) {
  const now = new Date().toISOString();
  return { completedAt: now, startedAt: now, durationMs: 1, method: "POST", model: "model",
    path: "/v1/messages", url: "/v1/messages", requestId, statusCode: 200,
    requestBody: Buffer.from(JSON.stringify({ model: "model", padding: "x".repeat(200 * 1024) })), requestHeaders: {}, responseHeaders: {}, responseBodyText: "{}" };
}
function bodyFile(dir, ref) { return path.join(dir, "request-log-bodies", ref.slice(0, 2), ref); }
function age(file) { const old = new Date(Date.now() - 2 * 60 * 60 * 1000); fs.utimesSync(file, old, old); }
function orphan(dir, ref) {
  const file = bodyFile(dir, ref); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "orphan"); age(file); return file;
}

test("#1930 sweep preserves old pending and shared live refs, and retries orphan unlink failures", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-orphan-sweep-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  let store = new RequestLogStore(dbFile);
  let db;
  try {
    await store.record(record("live"));
    await store.record(record("stale"));
    await store.writeBatch([{ kind: "raw-trace-update", sequence: 1,
      input: { requestId: "pending", requestBodyText: "pending body ".repeat(20000) } }]);
    db = createBetterSqliteDatabase(dbFile);
    const liveRef = db.prepare("SELECT request_body_ref AS ref FROM request_logs WHERE request_id='live'").get().ref;
    const pending = JSON.parse(db.prepare("SELECT update_json FROM request_log_pending_updates").get().update_json);
    const pendingRef = pending.requestBodyRef;
    assert.ok(pendingRef);
    age(bodyFile(dir, liveRef)); age(bodyFile(dir, pendingRef));
    // A stale row can share a sidecar with a retained row.
    db.prepare("UPDATE request_logs SET created_at='2000-01-01', request_body_ref=? WHERE request_id='stale'").run(liveRef);
    const abandoned = orphan(dir, "aa-abandoned");
    const retry = orphan(dir, "ab-retry");
    const fresh = orphan(dir, "ac-fresh"); fs.utimesSync(fresh, new Date(), new Date());
    await store.close();
    const remove = fs.rmSync;
    let failed = false;
    t.mock.method(fs, "rmSync", (file, options) => {
      if (file === retry && !failed) { failed = true; throw new Error("synthetic unlink failure"); }
      return remove(file, options);
    });
    store = new RequestLogStore(dbFile); await store.initialize();
    assert.equal(fs.existsSync(abandoned), false);
    assert.equal(fs.existsSync(retry), true);
    assert.ok(fs.existsSync(fresh));
    assert.ok(fs.existsSync(bodyFile(dir, liveRef)));
    assert.ok(fs.existsSync(bodyFile(dir, pendingRef)));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM request_logs WHERE request_id='stale'").get().n, 0);
    // Consuming an old pending ref during a writer transaction must not sweep it
    // in the gap between deleting the pending row and publishing the log row.
    await store.writeBatch([{ kind: "record", sequence: 2, eventId: "pending-event", input: record("pending") }]);
    assert.ok(fs.existsSync(bodyFile(dir, pendingRef)));
    await store.close();
    store = new RequestLogStore(dbFile); await store.initialize();
    assert.equal(fs.existsSync(retry), false);
  } finally { t.mock.restoreAll(); db?.close(); await store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("#1930 orphan sweep makes bounded progress during normal reads and resumes without a restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-orphan-batches-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    const files = Array.from({ length: 600 }, (_, i) => orphan(dir, `aa-${i}`));
    await store.initialize();
    assert.equal(files.filter(fs.existsSync).length, 344);
    await store.list();
    assert.equal(files.filter(fs.existsSync).length, 88);
    await store.list();
    assert.equal(files.filter(fs.existsSync).length, 0);
  } finally { await store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});


test("#1930 GC waits for an in-flight publication from another worker", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-orphan-race-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const first = new RequestLogStore(dbFile);
  let second;
  let worker;
  try {
    await first.record(record("publishing"));
    const ref = "aa-inflight-publication";
    const file = bodyFile(dir, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    worker = new Worker(`
      const {parentPort,workerData}=require('node:worker_threads');
      const fs=require('node:fs'); const Database=require(workerData.module);
      const db=new Database(workerData.dbFile);
      db.exec('BEGIN IMMEDIATE');
      fs.writeFileSync(workerData.file,'still live');
      const old=new Date(Date.now()-7200000); fs.utimesSync(workerData.file,old,old);
      db.prepare("UPDATE request_logs SET request_body_ref=? WHERE request_id='publishing'").run(workerData.ref);
      parentPort.postMessage('locked');
      setTimeout(()=>{db.exec('COMMIT');db.close();parentPort.postMessage('committed');},150);
    `, { eval: true, workerData: { module: require.resolve("better-sqlite3"), dbFile, file, ref } });
    await new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); });
    second = new RequestLogStore(dbFile); await second.initialize();
    assert.ok(fs.existsSync(file), "GC must observe the committed reference after acquiring the publication lock");
  } finally { await worker?.terminate(); await second?.close(); await first.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});


test("#1930 a rolled-back suppression batch retains its restored pending body references", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-orphan-rollback-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const store = new RequestLogStore(dbFile);
  let db;
  try {
    await store.writeBatch([{ kind: "raw-trace-update", sequence: 1, input: {
      requestId: "rollback", requestBodyText: "pending body ".repeat(20000) } }]);
    db = createBetterSqliteDatabase(dbFile);
    const read = () => JSON.parse(db.prepare("SELECT update_json FROM request_log_pending_updates WHERE request_id='rollback'").get().update_json);
    const ref = read().requestBodyRef;
    assert.ok(ref);
    await assert.rejects(store.writeBatch([
      { kind: "record", sequence: 2, eventId: "rollback-event", input: { ...record("rollback"), captureBody: false } },
      { kind: "raw-trace-update", sequence: 3, input: { requestId: undefined } }
    ]));
    assert.equal(read().requestBodyRef, ref);
    assert.ok(fs.existsSync(bodyFile(dir, ref)), "rollback restored a live ref, so its file must survive");
  } finally { db?.close(); await store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
