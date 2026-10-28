import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "@ccr/core/observability/request-log-store.ts";

function createRecord(requestId) {
  const now = new Date().toISOString();
  return {
    completedAt: now,
    durationMs: 10,
    method: "POST",
    model: "worker-model",
    path: "/v1/messages",
    providerName: "worker-provider",
    // Larger than the 160 KB inline threshold, so the body is stored as a file.
    requestBody: Buffer.from(JSON.stringify({ model: "worker-model", padding: "x".repeat(200 * 1024) })),
    requestHeaders: { "content-type": "application/json" },
    requestId,
    responseBodyText: "{}",
    responseHeaders: { "content-type": "application/json" },
    startedAt: now,
    statusCode: 200,
    url: "http://127.0.0.1:3456/v1/messages"
  };
}

function collectBodyFiles(bodyDir) {
  if (!existsSync(bodyDir)) {
    return [];
  }
  const files = [];
  for (const shard of readdirSync(bodyDir)) {
    const shardDir = path.join(bodyDir, shard);
    for (const file of readdirSync(shardDir)) {
      files.push(path.join(shardDir, file));
    }
  }
  return files;
}

test("sweep deletes orphaned body files, keeps live and in-flight ones", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-orphan-sweep-"));
  const bodyDir = path.join(dir, "request-log-bodies");
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await store.writeBatch([
      { eventId: "keep-event", input: createRecord("keep-me"), kind: "record", sequence: 1 }
    ]);

    const liveFiles = collectBodyFiles(bodyDir);
    assert.ok(liveFiles.length > 0, "recording a request should write at least one body file");

    const shard = path.join(bodyDir, "ab");
    mkdirSync(shard, { recursive: true });

    // A file whose row no longer exists: written during a crash, or stranded by
    // an earlier delete that removed the row but not the file.
    const orphan = path.join(shard, "ab000000-0000-4000-8000-000000000000");
    writeFileSync(orphan, "orphaned body");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(orphan, twoHoursAgo, twoHoursAgo);

    // A file written moments ago: its row may not be inserted yet, so it must
    // survive the sweep.
    const inFlight = path.join(shard, "ab111111-1111-4000-8000-111111111111");
    writeFileSync(inFlight, "in-flight body");

    store.lastOrphanSweepDay = undefined;
    store.sweepOrphanedBodyFiles(store.database);

    for (const file of liveFiles) {
      assert.equal(existsSync(file), true, `live body file should survive: ${path.basename(file)}`);
    }
    assert.equal(existsSync(orphan), false, "orphaned body file should be deleted");
    assert.equal(existsSync(inFlight), true, "recently written body file should be kept");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
