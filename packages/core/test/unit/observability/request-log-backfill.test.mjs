import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";

const execFileAsync = promisify(execFile);
const isBackfillHeapWorker = process.env.CCR_REQUEST_LOG_BACKFILL_WORKER === "1";

const insertRequestLog = `
  INSERT INTO request_logs (
    created_at,
    method,
    path,
    url,
    request_headers,
    response_headers,
    request_body_text,
    response_body_content_type
  ) VALUES (?, 'POST', ?, ?, ?, ?, ?, '')
`;

// The store backfills `is_stream` on every open by scanning the rows whose
// stored text merely contains "stream". Every non-streaming body contains
// `"stream":false`, so the candidate set grows with the whole retained table.
async function seedRequestLogs(dbFile, { bodyPaddingBytes, requestCount }) {
  const store = new RequestLogStore(dbFile);
  await store.initialize();
  await store.close();

  const database = createBetterSqliteDatabase(dbFile);
  try {
    const padding = "x".repeat(bodyPaddingBytes);
    const nonStreamingBody = JSON.stringify({ model: "gpt-test", padding, stream: false });
    const streamingBody = JSON.stringify({ model: "gpt-test", stream: true });
    const insert = database.prepare(insertRequestLog);
    const startedAt = new Date().toISOString();
    database.transaction(() => {
      for (let index = 0; index < requestCount; index += 1) {
        insert.run(
          startedAt,
          "/v1/chat/completions",
          "http://127.0.0.1:3456/v1/chat/completions",
          JSON.stringify({ "content-type": "application/json" }),
          JSON.stringify({ "content-type": "application/json" }),
          nonStreamingBody
        );
      }
      insert.run(
        startedAt,
        "/v1/messages",
        "http://127.0.0.1:3456/v1/messages",
        JSON.stringify({ "content-type": "application/json" }),
        JSON.stringify({ "content-type": "application/json" }),
        streamingBody
      );
      insert.run(
        startedAt,
        "/v1/messages",
        "http://127.0.0.1:3456/v1/messages",
        JSON.stringify({ "content-type": "application/json" }),
        JSON.stringify({ "content-type": "text/event-stream" }),
        nonStreamingBody
      );
    })();
  } finally {
    database.close();
  }
}

function readStreamFlagCounts(dbFile) {
  const database = createBetterSqliteDatabase(dbFile);
  try {
    return database.prepare(`
      SELECT
        SUM(CASE WHEN is_stream = 1 THEN 1 ELSE 0 END) AS streaming,
        SUM(CASE WHEN is_stream = 0 THEN 1 ELSE 0 END) AS non_streaming
      FROM request_logs
    `).get();
  } finally {
    database.close();
  }
}

test("RequestLogStore backfill flags streaming rows and leaves the rest alone", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-stream-flag-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  let store;
  try {
    await seedRequestLogs(dbFile, { bodyPaddingBytes: 1024, requestCount: 8 });
    assert.deepEqual(readStreamFlagCounts(dbFile), { non_streaming: 10, streaming: 0 });

    store = new RequestLogStore(dbFile);
    await store.initialize();

    assert.deepEqual(readStreamFlagCounts(dbFile), { non_streaming: 8, streaming: 2 });
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore backfill stays inside the bounded worker heap", {
  skip: isBackfillHeapWorker,
  timeout: 45000
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-backfill-heap-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  try {
    const requestCount = 512;
    const bodyPaddingBytes = 256 * 1024;
    await seedRequestLogs(dbFile, { bodyPaddingBytes, requestCount });

    const workerEnv = {
      ...process.env,
      CCR_REQUEST_LOG_BACKFILL_DB: dbFile,
      CCR_REQUEST_LOG_BACKFILL_WORKER: "1",
      ELECTRON_RUN_AS_NODE: "1"
    };
    delete workerEnv.NODE_TEST_CONTEXT;
    const { stderr, stdout } = await execFileAsync(
      process.execPath,
      ["--max-old-space-size=64", "--test", __filename],
      {
        encoding: "utf8",
        env: workerEnv,
        maxBuffer: 1024 * 1024,
        windowsHide: true
      }
    );
    const output = `${stdout}\n${stderr}`;
    assert.match(output, /backfill worker opens the seeded database in 64 MB/);
    assert.doesNotMatch(output, /not ok/);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore backfill worker opens the seeded database in 64 MB", {
  skip: !isBackfillHeapWorker,
  timeout: 45000
}, async () => {
  const dbFile = process.env.CCR_REQUEST_LOG_BACKFILL_DB;
  assert.ok(dbFile, "the bounded heap worker runs with a seeded database");

  const store = new RequestLogStore(dbFile);
  try {
    await store.initialize();
    assert.deepEqual(readStreamFlagCounts(dbFile), { non_streaming: 512, streaming: 2 });
  } finally {
    await store.close();
  }
});
