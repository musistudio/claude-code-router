import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { clientDisconnectMessage } from "@ccr/core/gateway/internal/shared.ts";
import { encodeCcrClientModelHeader } from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";
import {
  applyRawTraceRequestLogPolicy,
  readRawTraceRequestLogBundle
} from "@ccr/core/observability/raw-trace-sync.ts";
import { addColumnDuplicateTolerant, RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";

// The producer (@the-next-ai/ai-gateway) serializes an undefined upstream
// status to `{}`. These fixtures stand in for the two bundles it can emit: one
// that observed a response but had no status to report, and one that never got
// a response at all.
const toolContinuationStream = [
  "event: response.created",
  'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-current","status":"in_progress"}}',
  "",
  "event: response.output_item.done",
  'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","call_id":"call_read","name":"read_file","arguments":"{\\"path\\":\\"README.md\\"}"}}',
  "",
  "event: response.completed",
  'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-current","status":"completed","usage":{"input_tokens":1200,"output_tokens":48,"total_tokens":1248}}}',
  "",
  "data: [DONE]",
  "",
  ""
].join("\n");

const streamFailureBody = [
  "event: response.created",
  'data: {"type":"response.created","response":{"id":"resp_2","status":"in_progress"}}',
  "",
  "event: response.failed",
  'data: {"type":"response.failed","response":{"id":"resp_2","status":"failed","error":{"code":"server_error","message":"upstream stream aborted"}}}',
  "",
  ""
].join("\n");

const cancelledStreamBody = [
  'data: {"type":"response.created","response":{"id":"resp_3","status":"in_progress"}}',
  "",
  "event: response.cancelled",
  'data: {"type":"response.cancelled","response":{"id":"resp_3","status":"cancelled"}}',
  "",
  ""
].join("\n");

/**
 * Write one producer bundle into the spool and read it back through the real
 * reader, so the assertions exercise the same update the synchronizer enqueues.
 */
async function readBundle(spoolDirectory, name, parts, requestId = `${name}-request`) {
  const bundleDirectory = path.join(spoolDirectory, `${name}-bundle`);
  mkdirSync(bundleDirectory, { recursive: true });
  const manifestParts = [];
  for (const part of parts) {
    const filePath = path.join(bundleDirectory, `${part.partType}.json`);
    writeFileSync(filePath, part.body);
    manifestParts.push({
      ...(part.contentType ? { contentType: part.contentType } : {}),
      filePath,
      partType: part.partType
    });
  }
  const bundle = await readRawTraceRequestLogBundle({
    completedAt: new Date().toISOString(),
    parts: manifestParts,
    // Distinct bundle IDs, shared turn key: exactly the shape two calls for one
    // logical request produce.
    requestId: `${name}-bundle`,
    turnKey: requestId
  }, spoolDirectory);
  assert.ok(bundle, `expected ${name} to produce a bundle`);
  assert.equal(bundle.update.requestId, requestId);
  return bundle;
}

function rawTraceUpdate(bundle, config) {
  const policy = applyRawTraceRequestLogPolicy(config, bundle.update);
  const responseStream = bundle.files?.responseBody;
  return {
    ...policy.update,
    // The store's own queue reads the preview text out of the spooled body
    // (prepareRawTraceInput); do the same here so the update is complete.
    ...(responseStream === undefined
      ? {}
      : { responseBodyText: readFileSync(responseStream.filePath, "utf8") })
  };
}

function createConfig() {
  const config = createDefaultAppConfig();
  config.observability.requestLogs = true;
  config.observability.requestLogBodyCapture = "all";
  config.observability.requestLogSuccessSampleRate = 1;
  return config;
}

function storedRow(dbFile, requestId) {
  const database = createBetterSqliteDatabase(dbFile);
  try {
    const row = database.prepare(`
      SELECT status_code, ok, upstream_outcome, error, gateway_status_code, gateway_ok, response_body_text
      FROM request_logs
      WHERE request_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(requestId);
    assert.ok(row, `expected a stored row for ${requestId}`);
    return {
      error: String(row.error ?? ""),
      gatewayOk: Number(row.gateway_ok ?? 0),
      gatewayStatusCode: Number(row.gateway_status_code ?? 0),
      ok: Number(row.ok ?? 0),
      responseBodyText: String(row.response_body_text ?? ""),
      statusCode: Number(row.status_code ?? 0),
      upstreamOutcome: String(row.upstream_outcome ?? "")
    };
  } finally {
    database.close();
  }
}

async function withStore(run) {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await run({ dbFile: path.join(dir, "request-logs.sqlite"), dir, store });
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
}

function gatewayRecord(requestId, overrides = {}) {
  const startedAt = new Date().toISOString();
  return {
    completedAt: startedAt,
    durationMs: 30,
    method: "POST",
    path: "/v1/responses",
    providerName: "test-provider",
    requestBody: Buffer.from(JSON.stringify({ input: "list the files", model: "gpt-current", stream: true })),
    requestHeaders: { "content-type": "application/json" },
    requestId,
    startedAt,
    statusCode: 0,
    url: "http://127.0.0.1:3456/v1/responses",
    ...overrides
  };
}

// 1. A successful Responses request carrying a tool continuation, where the
//    producer omitted statusCode entirely.
test("raw trace keeps an omitted upstream status unknown instead of failing the request", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-unknown-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const bundle = await readBundle(spoolDirectory, "omitted-status", [
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
        partType: "upstream_request_metadata"
      },
      // Exactly what the producer writes when upstreamResponseStatus is
      // undefined: a metadata part that serializes to "{}".
      { body: "{}", partType: "upstream_response_metadata" },
      { body: toolContinuationStream, contentType: "text/event-stream", partType: "response_stream" }
    ]);

    assert.equal(bundle.update.statusCode, undefined);
    assert.equal(bundle.update.upstreamResponseReceived, true);

    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    try {
      await store.record(gatewayRecord(bundle.update.requestId));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(bundle, config)), true);

      const row = storedRow(path.join(dir, "request-logs.sqlite"), bundle.update.requestId);
      assert.equal(row.upstreamOutcome, "unknown");
      assert.equal(row.statusCode, 0);
      assert.equal(row.ok, 0);
      assert.equal(row.error, "");
      // The captured payload is what proves the request actually succeeded, so
      // it must survive the outcome bookkeeping untouched.
      assert.match(row.responseBodyText, /"type":"response\.completed"/);
      assert.match(row.responseBodyText, /"call_id":"call_read"/);
      assert.match(row.responseBodyText, /"output_tokens":48/);
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// 1b. The metadata-only shape: `{}` with no response body or stream part at
//     all. The response was observed, so the outcome is `unknown` and NOT the
//     transport failure that "no response part" would otherwise imply. This is
//     the fixture that distinguishes "the reader saw a response" from "the
//     reader saw a body", which the fixture above cannot.
test("a metadata-only response with no body part is still an observed response", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-metadata-only-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const bundle = await readBundle(spoolDirectory, "metadata-only", [
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
        partType: "upstream_request_metadata"
      },
      { body: "{}", partType: "upstream_response_metadata" }
    ]);

    assert.equal(bundle.update.statusCode, undefined);
    assert.equal(bundle.update.upstreamResponseReceived, true);
    assert.equal(bundle.files.responseBody, undefined);

    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    try {
      await store.record(gatewayRecord(bundle.update.requestId));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(bundle, config)), true);

      const row = storedRow(path.join(dir, "request-logs.sqlite"), bundle.update.requestId);
      assert.equal(row.upstreamOutcome, "unknown");
      assert.equal(row.statusCode, 0);
      assert.equal(row.ok, 0);
      assert.equal(row.error, "");
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// 1c. The standalone path (a single-gateway runtime enables it) inserts the row
//     itself instead of updating a gateway record, so it never runs the
//     update-path cancellation detection. An SSE cancellation must still be
//     recorded as `cancelled` rather than as a successful HTTP 200.
test("a standalone write-batch bundle records an SSE cancellation as cancelled", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-standalone-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const bundle = await readBundle(spoolDirectory, "standalone-cancelled", [
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
        partType: "upstream_request_metadata"
      },
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" },
      { body: cancelledStreamBody, contentType: "text/event-stream", partType: "response_stream" }
    ]);

    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    try {
      // Exactly the standalone branch the runtime takes: no row exists yet for
      // the request, so the bundle is inserted directly.
      await store.writeBatch([{
        input: {
          ...applyRawTraceRequestLogPolicy(config, bundle.update).update,
          allowStandaloneRecord: true
        },
        kind: "raw-trace-update",
        rawTraceFiles: { responseBody: bundle.files.responseBody },
        sequence: 1
      }]);

      const row = storedRow(path.join(dir, "request-logs.sqlite"), bundle.update.requestId);
      assert.equal(row.upstreamOutcome, "cancelled");
      // The supplied status is preserved verbatim; nothing synthesizes a 200.
      assert.equal(row.statusCode, 200);
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// 1d. Two bundles for one logical request, applied out of order. Bundle A saw
//     the stream fail; bundle B is a clean 200 for the same attempt. Distinct
//     bundle IDs and one attempt number is the shape Core fallbacks and
//     context-archive continuations produce, and the store accepts both — so
//     the second one must not quietly turn a recorded stream failure into a
//     success.
test("a later clean bundle for the same attempt never downgrades a stream failure", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-out-of-order-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const requestId = "out-of-order-request";
    const requestMetadata = {
      body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
      partType: "upstream_request_metadata"
    };
    const failed = await readBundle(spoolDirectory, "bundle-a", [
      requestMetadata,
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" },
      { body: streamFailureBody, contentType: "text/event-stream", partType: "response_stream" }
    ], requestId);
    const clean = await readBundle(spoolDirectory, "bundle-b", [
      requestMetadata,
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" }
    ], requestId);
    assert.notEqual(failed.update.bundleId, clean.update.bundleId);
    assert.equal(failed.update.attempt, undefined);
    assert.equal(clean.update.attempt, undefined);

    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    try {
      await store.record(gatewayRecord(requestId));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(failed, config)), true);
      const afterFailure = storedRow(path.join(dir, "request-logs.sqlite"), requestId);
      assert.equal(afterFailure.upstreamOutcome, "stream_failure");
      assert.equal(afterFailure.statusCode, 200);
      assert.equal(afterFailure.ok, 0);
      assert.match(afterFailure.error, /upstream stream aborted/);

      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(clean, config)), true);
      const afterClean = storedRow(path.join(dir, "request-logs.sqlite"), requestId);
      assert.equal(afterClean.upstreamOutcome, "stream_failure");
      assert.equal(afterClean.statusCode, 200);
      assert.equal(afterClean.ok, 0);
      assert.match(afterClean.error, /upstream stream aborted/);
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// 1e. A bare upstream 499 is not this gateway's client disconnect. Only the
//     gateway's own fixed disconnect message makes a row a cancellation.
test("a bare upstream 499 stays an HTTP status while the disconnect marker cancels", async () => {
  await withStore(async ({ dbFile, store }) => {
    await store.record(gatewayRecord("bare-499", { statusCode: 499 }));
    const bare = storedRow(dbFile, "bare-499");
    assert.equal(bare.statusCode, 499);
    assert.equal(bare.ok, 0);
    assert.equal(bare.upstreamOutcome, "http_status");

    await store.record(gatewayRecord("marked-499", {
      error: clientDisconnectMessage,
      statusCode: 499
    }));
    const marked = storedRow(dbFile, "marked-499");
    assert.equal(marked.statusCode, 499);
    assert.equal(marked.ok, 0);
    assert.equal(marked.error, clientDisconnectMessage);
    assert.equal(marked.upstreamOutcome, "cancelled");
  });
});

// 2. A real HTTP error keeps its status and reads as a failure.
test("raw trace preserves a supplied HTTP 429 status as a failure", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-429-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const bundle = await readBundle(spoolDirectory, "rate-limited", [
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
        partType: "upstream_request_metadata"
      },
      {
        body: JSON.stringify({
          headers: { "content-type": "application/json", "retry-after": "30" },
          statusCode: 429
        }),
        partType: "upstream_response_metadata"
      }
    ]);

    assert.equal(bundle.update.statusCode, 429);
    assert.equal(bundle.update.upstreamResponseReceived, true);

    await withStore(async ({ dbFile, store }) => {
      await store.record(gatewayRecord(bundle.update.requestId));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(bundle, config)), true);

      const row = storedRow(dbFile, bundle.update.requestId);
      assert.equal(row.statusCode, 429);
      assert.equal(row.ok, 0);
      assert.equal(row.upstreamOutcome, "http_status");
    });
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// 3. Failures that happen after the response headers were already received.
test("raw trace records a stream failure after HTTP 200 without rewriting the status", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-stream-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const bundle = await readBundle(spoolDirectory, "stream-failure", [
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
        partType: "upstream_request_metadata"
      },
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" },
      { body: streamFailureBody, contentType: "text/event-stream", partType: "response_stream" }
    ]);

    assert.equal(bundle.update.statusCode, 200);

    await withStore(async ({ dbFile, store }) => {
      await store.record(gatewayRecord(bundle.update.requestId));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(bundle, config)), true);

      const row = storedRow(dbFile, bundle.update.requestId);
      assert.equal(row.statusCode, 200);
      assert.equal(row.ok, 0);
      assert.equal(row.upstreamOutcome, "stream_failure");
      assert.match(row.error, /upstream stream aborted/);
      assert.equal(row.gatewayStatusCode, 0);
    });
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace keeps a client disconnect cancelled and never rewrites it to success", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-cancel-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const cancelled = await readBundle(spoolDirectory, "cancelled-stream", [
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
        partType: "upstream_request_metadata"
      },
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" },
      { body: cancelledStreamBody, contentType: "text/event-stream", partType: "response_stream" }
    ]);
    // A gateway that already observed the disconnect, followed by a bundle whose
    // metadata still reports the upstream's 200.
    const disconnected = await readBundle(spoolDirectory, "disconnected", [
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
        partType: "upstream_request_metadata"
      },
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" }
    ]);

    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    try {
      await store.record(gatewayRecord(cancelled.update.requestId));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(cancelled, config)), true);
      const explicitRow = storedRow(path.join(dir, "request-logs.sqlite"), cancelled.update.requestId);
      // The HTTP exchange itself completed, so `status_code` and `ok` keep the
      // values the existing callers already read; the outcome column is what
      // records that the turn was cancelled rather than answered.
      assert.equal(explicitRow.statusCode, 200);
      assert.equal(explicitRow.ok, 1);
      assert.equal(explicitRow.upstreamOutcome, "cancelled");

      await store.record(gatewayRecord(disconnected.update.requestId, {
        error: clientDisconnectMessage,
        statusCode: 499
      }));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(disconnected, config)), true);
      const disconnectRow = storedRow(path.join(dir, "request-logs.sqlite"), disconnected.update.requestId);
      assert.equal(disconnectRow.statusCode, 499);
      assert.equal(disconnectRow.ok, 0);
      assert.equal(disconnectRow.error, clientDisconnectMessage);
      assert.equal(disconnectRow.upstreamOutcome, "cancelled");
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// 4. A request that ended before any upstream response existed.
test("raw trace without any upstream response part records a transport failure", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-transport-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const bundle = await readBundle(spoolDirectory, "no-response", [
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/responses" }),
        partType: "upstream_request_metadata"
      }
    ]);

    assert.equal(bundle.update.statusCode, undefined);
    assert.equal(bundle.update.upstreamResponseReceived, false);

    await withStore(async ({ dbFile, store }) => {
      await store.record(gatewayRecord(bundle.update.requestId));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(bundle, config)), true);

      const row = storedRow(dbFile, bundle.update.requestId);
      assert.equal(row.statusCode, 0);
      assert.equal(row.ok, 0);
      assert.equal(row.upstreamOutcome, "transport_failure");
    });
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// 5. The existing contract: a known status keeps its status and success flag,
//    and upgrading an old database leaves every existing column alone.
test("a known successful status keeps its status and ok flag", async () => {
  await withStore(async ({ dbFile, store }) => {
    await store.record(gatewayRecord("known-success", { statusCode: 200 }));
    const row = storedRow(dbFile, "known-success");
    assert.equal(row.statusCode, 200);
    assert.equal(row.ok, 1);
    assert.equal(row.upstreamOutcome, "http_status");
  });
});

const legacyRequestIds = [
  "legacy-bare-499",
  "legacy-disconnected",
  "legacy-omitted-status",
  "legacy-rate-limited",
  "legacy-success"
];

/**
 * The columns the upgrade can touch, read straight from the file so a reopen
 * cannot re-derive them from a cached store.
 */
function migrationSnapshot(dbFile, requestIds) {
  const database = createBetterSqliteDatabase(dbFile);
  try {
    return database.prepare(`
      SELECT request_id, status_code, ok, gateway_status_code, gateway_ok, error, upstream_outcome
      FROM request_logs
      WHERE request_id IN (${requestIds.map(() => "?").join(", ")})
      ORDER BY request_id
    `).all(...requestIds);
  } finally {
    database.close();
  }
}

test("upgrading an existing database backfills outcomes without changing stored statuses", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-migration-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const createdAt = new Date().toISOString();
  try {
    const legacy = createBetterSqliteDatabase(dbFile);
    try {
      // The schema exactly as it shipped before the upstream outcome column,
      // so the assertions cover a real upgrade rather than a hand-picked floor.
      legacy.exec(`
        CREATE TABLE request_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_usage_id INTEGER,
          created_at TEXT NOT NULL,
          completed_at TEXT NOT NULL DEFAULT '',
          request_id TEXT NOT NULL DEFAULT '',
          event_id TEXT NOT NULL DEFAULT '',
          client TEXT NOT NULL DEFAULT 'unknown',
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          url TEXT NOT NULL DEFAULT '',
          provider TEXT NOT NULL DEFAULT 'unknown',
          credential_id TEXT NOT NULL DEFAULT '',
          credential_chain TEXT NOT NULL DEFAULT '',
          credential_saturated INTEGER NOT NULL DEFAULT 0,
          model TEXT NOT NULL DEFAULT 'unknown',
          requested_model TEXT NOT NULL DEFAULT '',
          resolved_model TEXT NOT NULL DEFAULT '',
          response_model TEXT NOT NULL DEFAULT '',
          route_trace_version INTEGER NOT NULL DEFAULT 0,
          route_hop_count INTEGER NOT NULL DEFAULT 0,
          route_attempt_count INTEGER NOT NULL DEFAULT 0,
          route_trace_truncated INTEGER NOT NULL DEFAULT 0,
          is_stream INTEGER NOT NULL DEFAULT 0,
          status_code INTEGER NOT NULL DEFAULT 0,
          ok INTEGER NOT NULL DEFAULT 0,
          gateway_status_code INTEGER NOT NULL DEFAULT 0,
          gateway_ok INTEGER NOT NULL DEFAULT 0,
          gateway_error TEXT NOT NULL DEFAULT '',
          gateway_final_attempt INTEGER NOT NULL DEFAULT 1,
          gateway_body_capture_policy TEXT NOT NULL DEFAULT 'none',
          gateway_body_capture_max_bytes INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          reasoning_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cache_write_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL,
          pricing_json TEXT NOT NULL DEFAULT '',
          request_headers TEXT NOT NULL DEFAULT '{}',
          response_headers TEXT NOT NULL DEFAULT '{}',
          request_body_text TEXT NOT NULL DEFAULT '',
          request_body_encoding TEXT NOT NULL DEFAULT 'utf8',
          request_body_content_type TEXT NOT NULL DEFAULT '',
          request_body_size_bytes INTEGER NOT NULL DEFAULT 0,
          request_body_truncated INTEGER NOT NULL DEFAULT 0,
          request_body_ref TEXT NOT NULL DEFAULT '',
          response_body_text TEXT NOT NULL DEFAULT '',
          response_body_encoding TEXT NOT NULL DEFAULT 'utf8',
          response_body_content_type TEXT NOT NULL DEFAULT '',
          response_body_size_bytes INTEGER NOT NULL DEFAULT 0,
          response_body_truncated INTEGER NOT NULL DEFAULT 0,
          response_body_ref TEXT NOT NULL DEFAULT '',
          error TEXT NOT NULL DEFAULT ''
        );
      `);
      const insert = legacy.prepare(`
        INSERT INTO request_logs (
          created_at, completed_at, request_id, method, path, status_code, ok,
          gateway_status_code, gateway_ok, gateway_error, error
        ) VALUES (?, ?, ?, 'POST', '/v1/responses', ?, ?, ?, ?, ?, ?)
      `);
      insert.run(createdAt, createdAt, "legacy-success", 200, 1, 200, 1, "", "");
      insert.run(createdAt, createdAt, "legacy-rate-limited", 429, 0, 429, 0, "", "");
      insert.run(createdAt, createdAt, "legacy-disconnected", 499, 0, 499, 0, "", clientDisconnectMessage);
      // A 499 without the gateway's marker: an upstream provider's own status.
      insert.run(createdAt, createdAt, "legacy-bare-499", 499, 0, 499, 0, "", "");
      insert.run(createdAt, createdAt, "legacy-omitted-status", 0, 0, 0, 0, "", "");
    } finally {
      legacy.close();
    }

    const store = new RequestLogStore(dbFile);
    try {
      // The store opens lazily, so the first read is what runs the upgrade.
      await store.list({ pageSize: 25 });

      assert.equal(storedRow(dbFile, "legacy-success").upstreamOutcome, "http_status");
      assert.equal(storedRow(dbFile, "legacy-rate-limited").upstreamOutcome, "http_status");
      assert.equal(storedRow(dbFile, "legacy-disconnected").upstreamOutcome, "cancelled");
      assert.equal(storedRow(dbFile, "legacy-bare-499").upstreamOutcome, "http_status");
      // A stored zero cannot be split into "omitted status" and "no response",
      // so it keeps the default rather than being guessed at.
      assert.equal(storedRow(dbFile, "legacy-omitted-status").upstreamOutcome, "unknown");
      // Every legacy value the UI and the API already read is untouched.
      const success = storedRow(dbFile, "legacy-success");
      assert.equal(success.statusCode, 200);
      assert.equal(success.ok, 1);
      assert.equal(success.gatewayStatusCode, 200);
      assert.equal(success.gatewayOk, 1);
      const limited = storedRow(dbFile, "legacy-rate-limited");
      assert.equal(limited.statusCode, 429);
      assert.equal(limited.ok, 0);

      // The seeding is a paged, ledgered migration like its siblings, and it is
      // recorded as complete so later opens skip it.
      const migrated = createBetterSqliteDatabase(dbFile);
      try {
        const migrations = migrated.prepare(`
          SELECT migration, completed
          FROM request_log_schema_migrations
          ORDER BY migration
        `).all().map((row) => [String(row.migration), Number(row.completed)]);
        assert.deepEqual(migrations, [
          ["gateway-final-attempt-v1", 1],
          ["gateway-outcome-v1", 1],
          ["upstream-outcome-v1", 1]
        ]);
      } finally {
        migrated.close();
      }

      const firstOpen = migrationSnapshot(dbFile, legacyRequestIds);
      await store.close();

      // Reopening the upgraded database must be a no-op: the ledger marks the
      // backfill complete, so it must not run again and no value may drift on a
      // second open.
      const reopened = new RequestLogStore(dbFile);
      try {
        await reopened.list({ pageSize: 25 });
        assert.deepEqual(migrationSnapshot(dbFile, legacyRequestIds), firstOpen);
      } finally {
        await reopened.close();
      }

      // ... and a third open still changes nothing.
      const third = new RequestLogStore(dbFile);
      try {
        await third.list({ pageSize: 25 });
        assert.deepEqual(migrationSnapshot(dbFile, legacyRequestIds), firstOpen);
      } finally {
        await third.close();
      }
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// The seeding runs in pages so a large history never holds the write lock for
// the whole table, and it resumes from the ledger. The interrupted case is the
// important one: the column is added on its own, so an open that stopped right
// after the ALTER leaves the column present with nothing seeded, and the next
// open must still finish the job rather than trust the column's presence.
test("the upstream outcome seeding pages through a large history and resumes after an interrupted upgrade", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-upstream-outcome-paged-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const createdAt = new Date().toISOString();
  const total = 1250;
  try {
    const seed = new RequestLogStore(dbFile);
    await seed.list({ pageSize: 1 });
    await seed.close();

    const database = createBetterSqliteDatabase(dbFile);
    try {
      const insert = database.prepare(`
        INSERT INTO request_logs (
          created_at, completed_at, request_id, method, path, status_code, ok, error, upstream_outcome
        ) VALUES (?, ?, ?, 'POST', '/v1/responses', ?, ?, ?, 'unknown')
      `);
      database.exec("BEGIN");
      // Mix every seeded shape across the page boundaries.
      for (let index = 0; index < total; index += 1) {
        const shape = index % 3;
        insert.run(
          createdAt,
          createdAt,
          `paged-${index}`,
          shape === 0 ? 200 : shape === 1 ? 499 : 0,
          shape === 0 ? 1 : 0,
          shape === 1 ? clientDisconnectMessage : ""
        );
      }
      // The state an interrupted upgrade leaves behind: column present, rows
      // unseeded, and no completed ledger entry.
      database.exec("DELETE FROM request_log_schema_migrations WHERE migration = 'upstream-outcome-v1'");
      database.exec("COMMIT");
    } finally {
      database.close();
    }

    const reopened = new RequestLogStore(dbFile);
    try {
      await reopened.list({ pageSize: 1 });
    } finally {
      await reopened.close();
    }

    const after = createBetterSqliteDatabase(dbFile);
    try {
      const counts = Object.fromEntries(after.prepare(`
        SELECT upstream_outcome AS outcome, COUNT(*) AS n
        FROM request_logs
        WHERE request_id LIKE 'paged-%'
        GROUP BY upstream_outcome
      `).all().map((row) => [row.outcome, row.n]));
      assert.deepEqual(counts, {
        // 1250 rows split by index % 3: 417, 417, 416.
        cancelled: 417,
        http_status: 417,
        unknown: 416
      }, "every page is seeded, including rows past the first batch");
      const ledger = after.prepare(`
        SELECT completed FROM request_log_schema_migrations WHERE migration = 'upstream-outcome-v1'
      `).get();
      assert.equal(ledger?.completed, 1);
    } finally {
      after.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// Routing evidence: `model`/`resolved_model` record the target CCR used, so
// without these columns a reader cannot tell a request was rerouted, or why.
// The evidence must also outlive the spool bundle, which is deleted seconds
// after the request finishes.
test("raw trace persists routing evidence that survives spool cleanup", async () => {
  await withStore(async ({ dbFile, store }) => {
    const spool = mkdtempSync(path.join(tmpdir(), "ccr-route-evidence-spool-"));
    const bundleDirectory = path.join(spool, "evidence-bundle");
    mkdirSync(bundleDirectory, { recursive: true });
    const parts = [];
    const write = (partType, body) => {
      const filePath = path.join(bundleDirectory, `${partType}.json`);
      writeFileSync(filePath, body);
      parts.push({ filePath, partType });
    };
    write("client_request_metadata", JSON.stringify({
      headers: {
        "x-ccr-client-model": encodeCcrClientModelHeader("Claude Code API/claude-opus-5"),
        "x-ccr-route-reason": "builtin:claude-code-subagent",
        "x-ccr-route-source": "subagent",
        // A credential must never be copied into the log by this path.
        authorization: "Bearer must-not-be-stored"
      },
      method: "POST",
      url: "/v1/messages"
    }));
    // The client model must come from the trusted header only: the body is not
    // read at all, so its model must not leak into the routing columns.
    write("client_request", JSON.stringify({
      messages: [{ content: "a private prompt", role: "user" }],
      model: "body-model-must-not-be-read"
    }));
    write("upstream_request_metadata", JSON.stringify({ method: "POST", url: "https://example.test/v1/chat/completions" }));
    write("upstream_response_metadata", JSON.stringify({ statusCode: 200 }));
    write("upstream_response", JSON.stringify({ id: "resp", model: "worker-model-fast" }));

    const bundle = await readRawTraceRequestLogBundle({
      completedAt: new Date().toISOString(),
      parts,
      requestId: "evidence-bundle",
      target: { model: "worker-model-fast", providerName: "worker-vendor::openai_chat_completions" },
      turnKey: "evidence-request"
    }, spool);
    assert.ok(bundle);
    assert.equal(bundle.update.clientModel, "Claude Code API/claude-opus-5");
    assert.equal(bundle.update.routeReason, "builtin:claude-code-subagent");
    assert.equal(bundle.update.routeSource, "subagent");

    await store.record(gatewayRecord("evidence-request"));
    await store.updateFromRawTrace(rawTraceUpdate(bundle, createConfig()));

    // Cleanup happens right after the bundle is consumed in production.
    rmSync(spool, { force: true, recursive: true });

    const database = createBetterSqliteDatabase(dbFile);
    try {
      const row = database.prepare(
        "SELECT client_model, route_reason, route_source, resolved_model, request_headers FROM request_logs WHERE request_id = ?"
      ).get("evidence-request");
      assert.equal(row.client_model, "Claude Code API/claude-opus-5");
      assert.equal(row.route_reason, "builtin:claude-code-subagent");
      assert.equal(row.route_source, "subagent");
      // The original ask and the resolved target must be distinguishable.
      assert.equal(row.resolved_model, "worker-model-fast");
      assert.notEqual(row.client_model, row.resolved_model);
      assert.doesNotMatch(String(row.request_headers ?? ""), /must-not-be-stored/);
    } finally {
      database.close();
    }
  });
});

test("list() exposes routing evidence and the upstream outcome to readers", async () => {
  await withStore(async ({ store }) => {
    await store.record(gatewayRecord("reader-request"));
    const page = await store.list({ pageSize: 10 });
    const entry = page.items.find((item) => item.requestId === "reader-request");
    assert.ok(entry, "expected the recorded request in the page");
    assert.equal(typeof entry.upstreamOutcome, "string");
    assert.ok(Object.hasOwn(entry, "clientModel"));
    assert.ok(Object.hasOwn(entry, "routeReason"));
    assert.ok(Object.hasOwn(entry, "routeSource"));
  });
});

// The whole point of the outcome column: a provider route that omits the HTTP
// status must not make a successful request show up under the error filter.
test("the error filter excludes an unknown outcome but keeps a real failure", async () => {
  await withStore(async ({ dbFile, store }) => {
    await store.record(gatewayRecord("unknown-status-request"));
    await store.record(gatewayRecord("real-failure-request", { statusCode: 429 }));
    const database = createBetterSqliteDatabase(dbFile);
    try {
      // Shape the rows exactly as the two paths leave them.
      database.prepare(
        "UPDATE request_logs SET ok = 0, status_code = 0, error = '', upstream_outcome = 'unknown' WHERE request_id = ?"
      ).run("unknown-status-request");
      database.prepare(
        "UPDATE request_logs SET ok = 0, status_code = 429, error = '', upstream_outcome = 'http_status' WHERE request_id = ?"
      ).run("real-failure-request");
    } finally {
      database.close();
    }

    const errors = await store.list({ pageSize: 50, status: "error" });
    const errorIds = errors.items.map((entry) => entry.requestId);
    assert.ok(!errorIds.includes("unknown-status-request"), "an unknown outcome must not be reported as an error");
    assert.ok(errorIds.includes("real-failure-request"), "a real 429 must still be reported as an error");
  });
});

// The route-evidence columns are the one dimension an independent reviewer never
// got to. Cover the upgrade explicitly: they must appear on a database that
// predates them, default empty for legacy rows, survive a reopen unchanged, and
// not interfere with retention (which deletes whole rows, so the new columns need
// no cleanup of their own).
test("route evidence columns upgrade an existing database, survive reopen, and respect retention", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-route-evidence-migration-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const today = new Date();
  const yesterday = new Date(today.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const columnsOf = () => {
    const database = createBetterSqliteDatabase(dbFile);
    try {
      return new Set(database.prepare("PRAGMA table_info(request_logs)").all().map((row) => String(row.name)));
    } finally {
      database.close();
    }
  };
  const routeEvidence = (requestId) => {
    const database = createBetterSqliteDatabase(dbFile);
    try {
      return database.prepare(
        "SELECT client_model, route_reason, route_source FROM request_logs WHERE request_id = ?"
      ).get(requestId);
    } finally {
      database.close();
    }
  };

  try {
    const legacy = createBetterSqliteDatabase(dbFile);
    try {
      // Minimal pre-route-evidence shape; ensureRequestLogSchema adds the rest.
      legacy.exec(`
        CREATE TABLE request_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_usage_id INTEGER,
          created_at TEXT NOT NULL,
          request_id TEXT NOT NULL DEFAULT '',
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          status_code INTEGER NOT NULL DEFAULT 0,
          ok INTEGER NOT NULL DEFAULT 0
        );
      `);
      const insert = legacy.prepare(
        "INSERT INTO request_logs (created_at, request_id, method, path, status_code, ok) VALUES (?, ?, 'POST', '/v1/messages', 200, 1)"
      );
      insert.run(today.toISOString(), "evidence-current");
      insert.run(yesterday, "evidence-stale");
    } finally {
      legacy.close();
    }

    assert.equal(columnsOf().has("route_reason"), false, "precondition: the column does not exist yet");

    const store = new RequestLogStore(dbFile);
    try {
      await store.list({ pageSize: 25 });
      const columns = columnsOf();
      for (const column of ["client_model", "route_reason", "route_source"]) {
        assert.equal(columns.has(column), true, `${column} was added by the upgrade`);
      }
      // Legacy rows get the empty default, never a guessed value.
      const upgraded = routeEvidence("evidence-current");
      assert.equal(upgraded.client_model, "");
      assert.equal(upgraded.route_reason, "");
      assert.equal(upgraded.route_source, "");

      const database = createBetterSqliteDatabase(dbFile);
      try {
        database.prepare(
          "UPDATE request_logs SET client_model = ?, route_reason = ?, route_source = ? WHERE request_id = ?"
        ).run("client-provider/model-requested", "builtin:example-rule", "subagent", "evidence-current");
      } finally {
        database.close();
      }
    } finally {
      await store.close();
    }

    // Reopening must not re-run the ALTER or reset what was written.
    const reopened = new RequestLogStore(dbFile);
    try {
      await reopened.list({ pageSize: 25 });
      const preserved = routeEvidence("evidence-current");
      assert.equal(preserved.client_model, "client-provider/model-requested");
      assert.equal(preserved.route_reason, "builtin:example-rule");
      assert.equal(preserved.route_source, "subagent");
      // A record() triggers retention, which deletes rows from before today
      // wholesale -- so the new columns need no separate retention pass.
      await reopened.record(gatewayRecord("evidence-retention-trigger"));
      assert.equal(routeEvidence("evidence-stale"), undefined, "the stale row was pruned entirely");
      assert.ok(routeEvidence("evidence-current"), "today's row is retained with its evidence");
      assert.equal(routeEvidence("evidence-current").route_reason, "builtin:example-rule");
    } finally {
      await reopened.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// Routing evidence must be written by record(), not only by the raw-trace update.
// The raw-trace path is queued behind record admission and may never land, which
// is exactly how these columns stayed empty on every row in a real installation
// while the unit tests that called updateFromRawTrace directly still passed.
test("record() persists routing evidence supplied by the gateway", async () => {
  await withStore(async ({ dbFile, store }) => {
    await store.record(gatewayRecord("record-route-evidence", {
      clientModel: "client-provider/model-requested",
      requestedModel: "client-provider/model-requested",
      resolvedModel: "model-resolved",
      routeReason: "builtin:example-rule",
      routeSource: "subagent",
      statusCode: 200
    }));

    const database = createBetterSqliteDatabase(dbFile);
    try {
      const row = database.prepare(
        "SELECT client_model, route_reason, route_source, requested_model, resolved_model FROM request_logs WHERE request_id = ?"
      ).get("record-route-evidence");
      assert.equal(row.client_model, "client-provider/model-requested");
      assert.equal(row.route_reason, "builtin:example-rule");
      assert.equal(row.route_source, "subagent");
      // Legacy semantics unchanged, and a reroute is visible.
      assert.equal(row.resolved_model, "model-resolved");
      assert.notEqual(row.client_model, row.resolved_model);
    } finally {
      database.close();
    }
  });
});

// The standalone branch converts a bundle straight into a record input instead
// of updating an existing gateway row. That conversion is a field-by-field map,
// so a field the bundle carries but the map omits is silently dropped -- which
// is exactly how routing evidence stayed empty on every row of a real install
// while both the extraction test above and the record() test still passed. The
// contrast that hid it: `upstreamResponseReceived`/`upstreamCancelled` ARE
// mapped, so the outcome column worked on the very same path.
test("a standalone write-batch bundle persists the routing evidence it carries", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-standalone-route-evidence-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const bundle = await readBundle(spoolDirectory, "standalone-route-evidence", [
      {
        body: JSON.stringify({
          headers: {
            "x-ccr-client-model": encodeCcrClientModelHeader("Claude Code API/claude-opus-5"),
            "x-ccr-route-reason": "builtin:claude-code-subagent",
            "x-ccr-route-source": "subagent",
            "x-ccr-routed-model": "Worker Vendor (Chat Completions)/worker-model-fast"
          },
          method: "POST",
          url: "/v1/messages"
        }),
        partType: "client_request_metadata"
      },
      { body: JSON.stringify({ model: "body-model-must-not-be-read" }), partType: "client_request" },
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/chat/completions" }),
        partType: "upstream_request_metadata"
      },
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" }
    ]);

    // The bundle reader must surface the evidence in the first place.
    assert.equal(bundle.update.clientModel, "Claude Code API/claude-opus-5");
    assert.equal(bundle.update.routeReason, "builtin:claude-code-subagent");
    assert.equal(bundle.update.routeSource, "subagent");

    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    try {
      await store.writeBatch([{
        input: {
          ...applyRawTraceRequestLogPolicy(config, bundle.update).update,
          allowStandaloneRecord: true
        },
        kind: "raw-trace-update",
        sequence: 1
      }]);

      const database = createBetterSqliteDatabase(path.join(dir, "request-logs.sqlite"));
      try {
        const row = database.prepare(`
          SELECT client_model, route_reason, route_source, model
          FROM request_logs
          WHERE request_id = ?
          ORDER BY id DESC
          LIMIT 1
        `).get(bundle.update.requestId);
        assert.ok(row, "expected the standalone bundle to insert a row");
        assert.equal(row.route_reason, "builtin:claude-code-subagent");
        assert.equal(row.route_source, "subagent");
        assert.equal(row.client_model, "Claude Code API/claude-opus-5");
        // A reroute has to remain visible: the client asked for one model and
        // the gateway used another.
        assert.notEqual(row.client_model, row.model);
      } finally {
        database.close();
      }
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// The client model is read from the trusted route header, never from the
// request body. Without the header the column stays empty even though the
// captured body names a model, which is what keeps the reader from pulling a
// large prompt into memory just to extract the field.
test("a raw trace without the client-model header records no client model", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-client-model-header-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const config = createConfig();
    const bundle = await readBundle(spoolDirectory, "header-missing", [
      {
        body: JSON.stringify({ headers: { authorization: "Bearer secret" }, method: "POST", url: "/v1/messages" }),
        partType: "client_request_metadata"
      },
      { body: JSON.stringify({ messages: [{ content: "prompt", role: "user" }], model: "asked-by-body" }), partType: "client_request" },
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/messages" }),
        partType: "upstream_request_metadata"
      },
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" }
    ]);

    assert.equal(bundle.update.clientModel, undefined);
    assert.equal(Object.hasOwn(bundle.update, "clientModel"), false);

    // A bundle without the header must not clear the value the direct gateway
    // write already recorded.
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    try {
      await store.record(gatewayRecord(bundle.update.requestId, { clientModel: "kept-by-record" }));
      assert.equal(await store.updateFromRawTrace(rawTraceUpdate(bundle, config)), true);
      const database = createBetterSqliteDatabase(path.join(dir, "request-logs.sqlite"));
      try {
        const row = database.prepare(
          "SELECT client_model FROM request_logs WHERE request_id = ?"
        ).get(bundle.update.requestId);
        assert.equal(row.client_model, "kept-by-record");
      } finally {
        database.close();
      }
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// Model selectors can carry non-ASCII provider names. The header is base64url
// encoded so the exact ask survives; `sanitizeHeaderValue` would mangle it and
// the update would overwrite the correct value the gateway wrote directly.
test("the client model survives a non-ASCII selector through the header", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-client-model-unicode-test-"));
  try {
    const spoolDirectory = path.join(dir, "spool");
    const asked = "小米mimo/worker-model";
    const bundle = await readBundle(spoolDirectory, "unicode-model", [
      {
        body: JSON.stringify({
          headers: { "x-ccr-client-model": encodeCcrClientModelHeader(asked) },
          method: "POST",
          url: "/v1/messages"
        }),
        partType: "client_request_metadata"
      },
      { body: JSON.stringify({ model: "body-model-must-not-be-read" }), partType: "client_request" },
      {
        body: JSON.stringify({ method: "POST", url: "https://upstream.example/v1/messages" }),
        partType: "upstream_request_metadata"
      },
      { body: JSON.stringify({ statusCode: 200 }), partType: "upstream_response_metadata" }
    ]);

    assert.equal(bundle.update.clientModel, asked);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// Concurrent openers race the request-log schema upgrade: each reads
// `PRAGMA table_info` once and then adds columns. If another opener adds one in
// between, this process's ALTER throws `duplicate column name` and the database
// open fails, taking request logging down with it. The staled-columns-set call
// below is exactly that moment: the column exists but this process has not seen
// it yet.
test("a column added by a concurrent opener is adopted instead of failing the open", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-duplicate-column-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  try {
    const database = createBetterSqliteDatabase(dbFile);
    try {
      database.exec("CREATE TABLE request_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, client_model TEXT NOT NULL DEFAULT '')");

      const staleColumns = new Set(["id"]);
      addColumnDuplicateTolerant(database, staleColumns, "request_logs", "client_model", "TEXT NOT NULL DEFAULT ''");
      assert.equal(staleColumns.has("client_model"), true);
      assert.equal(database.prepare("SELECT COUNT(*) AS total FROM request_logs").get().total, 0);

      // A column that does not exist yet is still added normally.
      addColumnDuplicateTolerant(database, staleColumns, "request_logs", "route_reason", "TEXT NOT NULL DEFAULT ''");
      assert.equal(staleColumns.has("route_reason"), true);
      const columns = new Set(database.prepare("PRAGMA table_info(request_logs)").all().map((row) => String(row.name)));
      assert.equal(columns.has("route_reason"), true);

      // The two sibling tables on the same open path adopt the same way.
      database.exec(`
        CREATE TABLE request_route_traces (id INTEGER PRIMARY KEY AUTOINCREMENT, trace_json TEXT NOT NULL DEFAULT '');
        CREATE TABLE request_log_pending_updates (request_id TEXT PRIMARY KEY, update_bytes INTEGER NOT NULL DEFAULT 0);
      `);
      const routeTraceColumns = new Set(["id"]);
      addColumnDuplicateTolerant(database, routeTraceColumns, "request_route_traces", "trace_json", "TEXT NOT NULL DEFAULT ''");
      assert.equal(routeTraceColumns.has("trace_json"), true);
      const pendingUpdateColumns = new Set(["request_id"]);
      addColumnDuplicateTolerant(database, pendingUpdateColumns, "request_log_pending_updates", "update_bytes", "INTEGER NOT NULL DEFAULT 0");
      assert.equal(pendingUpdateColumns.has("update_bytes"), true);

      // Only the duplicate error is adopted; every other failure still surfaces.
      assert.throws(
        () => addColumnDuplicateTolerant(database, new Set(), "request_logs_missing", "client_model", "TEXT"),
        /no such table/i
      );
    } finally {
      database.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
