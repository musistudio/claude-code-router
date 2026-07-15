import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { RequestLogAdmissionStore } from "@ccr/core/observability/request-log-admission-store.ts";
import { createRequestLogRuntime, RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { RequestRouteTraceRecorder } from "@ccr/core/observability/route-trace.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";

const workerFile = [
  path.resolve(__dirname, "../../../runtime/request-log-worker.js"),
  path.resolve(__dirname, "../../runtime/request-log-worker.js")
].find(existsSync);
assert.ok(workerFile, "compiled request-log-worker.js must exist");

test("RequestLogRuntime writes through a worker and reads through the query worker", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-test-"));
  const runtime = createRuntime(dir);
  try {
    const result = runtime.enqueueRecord(createRecord("worker-request"));
    assert.deepEqual(result, { accepted: true, degraded: false });

    const flush = await runtime.flush({ timeoutMs: 10_000 });
    assert.equal(flush.timedOut, false);
    assert.equal(flush.pending, 0);

    const page = await runtime.list({ pageSize: 25 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].requestId, "worker-request");
    const detail = await runtime.getDetail({ id: page.items[0].id });
    assert.equal(detail?.requestBody.text.includes("worker-model"), true);
    assert.equal(runtime.metrics().committed, 1);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime merges a raw trace update that arrives before its request record", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-order-test-"));
  const runtime = createRuntime(dir);
  try {
    assert.equal(runtime.enqueueRawTrace({
      model: "trace-model",
      provider: "trace-provider",
      requestId: "out-of-order-request",
      statusCode: 429
    }).accepted, true);
    assert.equal(runtime.enqueueRecord(createRecord("out-of-order-request")).accepted, true);
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].model, "trace-model");
    assert.equal(page.items[0].provider, "trace-provider");
    assert.equal(page.items[0].statusCode, 429);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore resolves unknown raw trace body capture from the final request status", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-raw-policy-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await store.writeBatch([
      {
        input: {
          bodyCapturePolicy: "errors",
          deferBodyCaptureUntilRecord: true,
          requestBodyText: "successful-private-request",
          requestId: "unknown-success",
          responseBodyText: "successful-private-response"
        },
        kind: "raw-trace-update",
        sequence: 1
      },
      {
        eventId: "unknown-success-event",
        input: {
          ...createRecord("unknown-success"),
          captureBody: false,
          requestBody: Buffer.alloc(0),
          requestBodySizeBytes: 64,
          requestBodyTruncated: true,
          responseBodySizeBytes: 64,
          responseBodyText: "",
          responseBodyTruncated: true
        },
        kind: "record",
        sequence: 2
      },
      {
        input: {
          bodyCapturePolicy: "errors",
          deferBodyCaptureUntilRecord: true,
          requestBodyText: "failed-private-request",
          requestId: "unknown-failure",
          responseBodyText: "failed-private-response"
        },
        kind: "raw-trace-update",
        sequence: 3
      },
      {
        eventId: "unknown-failure-event",
        input: { ...createRecord("unknown-failure"), statusCode: 500 },
        kind: "record",
        sequence: 4
      }
    ]);

    const page = await store.list({ pageSize: 25 });
    const successEntry = page.items.find((item) => item.requestId === "unknown-success");
    const failureEntry = page.items.find((item) => item.requestId === "unknown-failure");
    const success = await store.getDetail({ id: successEntry.id });
    const failure = await store.getDetail({ id: failureEntry.id });
    assert.equal(success.requestBody.text, "");
    assert.equal(success.responseBody.text, "");
    assert.doesNotMatch(JSON.stringify(success), /successful-private/);
    assert.equal(failure.requestBody.text, "failed-private-request");
    assert.equal(failure.responseBody.text, "failed-private-response");
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore retains deferred raw trace bodies across independently committed batches", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-deferred-cross-batch-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await store.writeBatch([
      {
        input: {
          bodyCapturePolicy: "errors",
          deferBodyCaptureUntilRecord: true,
          requestBodyText: "cross-batch-private-request",
          requestId: "cross-batch-failure",
          responseBodyText: "cross-batch-private-response"
        },
        kind: "raw-trace-update",
        sequence: 1
      },
      {
        input: {
          bodyCapturePolicy: "errors",
          deferBodyCaptureUntilRecord: true,
          requestBodyText: "cross-batch-success-private-request",
          requestId: "cross-batch-success",
          responseBodyText: "cross-batch-success-private-response"
        },
        kind: "raw-trace-update",
        sequence: 2
      }
    ]);
    await store.writeBatch([
      {
        eventId: "cross-batch-failure-event",
        input: { ...createRecord("cross-batch-failure"), statusCode: 500 },
        kind: "record",
        sequence: 3
      },
      {
        eventId: "cross-batch-success-event",
        input: createRecord("cross-batch-success"),
        kind: "record",
        sequence: 4
      }
    ]);

    const page = await store.list({ pageSize: 25 });
    const failureEntry = page.items.find((item) => item.requestId === "cross-batch-failure");
    const successEntry = page.items.find((item) => item.requestId === "cross-batch-success");
    const failure = await store.getDetail({ id: failureEntry.id });
    const success = await store.getDetail({ id: successEntry.id });
    assert.equal(failure.requestBody.text, "cross-batch-private-request");
    assert.equal(failure.responseBody.text, "cross-batch-private-response");
    assert.doesNotMatch(JSON.stringify(success), /cross-batch-success-private/);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime restores deferred file bodies after the raw trace batch ACK cleans its spool", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-deferred-file-cross-batch-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const requestFile = path.join(bundleDir, "request.json");
  const responseFile = path.join(bundleDir, "response.json");
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(requestFile, "file-cross-batch-request");
  writeFileSync(responseFile, "file-cross-batch-response");
  const runtime = createRuntime(dir, { rawTraceSpoolDir: spoolDir });
  try {
    const rawTrace = runtime.enqueueRawTrace({
      bodyCapturePolicy: "errors",
      deferBodyCaptureUntilRecord: true,
      requestId: "file-cross-batch-failure"
    }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: 1024,
      requestBody: {
        contentType: "text/plain",
        filePath: requestFile,
        sizeBytes: Buffer.byteLength("file-cross-batch-request")
      },
      responseBody: {
        contentType: "text/plain",
        filePath: responseFile,
        sizeBytes: Buffer.byteLength("file-cross-batch-response")
      }
    });
    assert.equal(rawTrace.accepted, true);
    await runtime.flush({ timeoutMs: 10_000 });
    assert.equal(existsSync(bundleDir), false);

    assert.equal(runtime.enqueueRecord({
      ...createRecord("file-cross-batch-failure"),
      statusCode: 500
    }).accepted, true);
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const detail = await runtime.getDetail({ id: page.items[0].id });
    assert.equal(detail.requestBody.text, "file-cross-batch-request");
    assert.equal(detail.responseBody.text, "file-cross-batch-response");
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore applies same-batch raw trace updates in sequence order", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-raw-sequence-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await store.writeBatch([
      {
        input: {
          model: "raw-old-model",
          requestBodyText: "raw-old-body",
          requestId: "raw-sequence-request",
          statusCode: 429
        },
        kind: "raw-trace-update",
        sequence: 1
      },
      {
        eventId: "raw-sequence-event",
        input: createRecord("raw-sequence-request"),
        kind: "record",
        sequence: 2
      },
      {
        input: {
          model: "raw-new-model",
          requestBodyText: "raw-new-body",
          requestId: "raw-sequence-request",
          statusCode: 503
        },
        kind: "raw-trace-update",
        sequence: 3
      }
    ]);

    const page = await store.list({ pageSize: 25 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.model, "raw-new-model");
    assert.equal(detail.requestBody.text, "raw-new-body");
    assert.equal(detail.statusCode, 503);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime rejects an event that exceeds its hard queue byte limit", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-bound-test-"));
  const runtime = createRequestLogRuntime({
    dbFile: path.join(dir, "request-logs.sqlite"),
    queueMaxBytes: 1_024,
    queueMaxItems: 10,
    workerFile
  });
  try {
    const result = runtime.enqueueRecord({
      ...createRecord("oversized-request"),
      requestBody: Buffer.alloc(4 * 1_024, "x")
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "queue_full");
    assert.equal(runtime.metrics().dropped, 1);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime persists unmatched raw trace updates across worker restarts", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-pending-test-"));
  const first = createRuntime(dir);
  try {
    first.enqueueRawTrace({ model: "persisted-trace-model", requestId: "restart-request" });
    await first.flush({ timeoutMs: 10_000 });
    await first.close({ timeoutMs: 5_000 });

    const second = createRuntime(dir);
    try {
      second.enqueueRecord(createRecord("restart-request"));
      await second.flush({ timeoutMs: 10_000 });
      const page = await second.list({ pageSize: 25 });
      assert.equal(page.items[0].model, "persisted-trace-model");
    } finally {
      await second.close({ timeoutMs: 5_000 });
    }
  } finally {
    await first.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore retains a bounded prefix for oversized unmatched raw trace bodies", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-pending-entry-budget-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await store.writeBatch([{
      input: {
        requestBodyText: "s".repeat(3 * 1024 * 1024),
        requestId: "oversized-pending-raw"
      },
      kind: "raw-trace-update",
      sequence: 1
    }]);
    await store.writeBatch([{
      eventId: "oversized-pending-record",
      input: createRecord("oversized-pending-raw"),
      kind: "record",
      sequence: 2
    }]);

    const page = await store.list({ pageSize: 25 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.match(detail.requestBody.text, /^s+$/);
    assert.equal(Buffer.byteLength(detail.requestBody.text), 512 * 1024);
    assert.equal(detail.requestBody.sizeBytes, 3 * 1024 * 1024);
    assert.equal(detail.requestBody.truncated, true);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore bounds unmatched request and response bodies independently", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-pending-body-budget-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await store.writeBatch([{
      input: {
        requestBodyText: "q".repeat(3 * 1024 * 1024),
        requestId: "oversized-pending-pair",
        responseBodyText: "p".repeat(3 * 1024 * 1024)
      },
      kind: "raw-trace-update",
      sequence: 1
    }]);
    await store.writeBatch([{
      eventId: "oversized-pending-pair-record",
      input: createRecord("oversized-pending-pair"),
      kind: "record",
      sequence: 2
    }]);

    const page = await store.list({ pageSize: 25 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(Buffer.byteLength(detail.requestBody.text), 512 * 1024);
    assert.equal(Buffer.byteLength(detail.responseBody.text), 512 * 1024);
    assert.equal(detail.requestBody.sizeBytes, 3 * 1024 * 1024);
    assert.equal(detail.responseBody.sizeBytes, 3 * 1024 * 1024);
    assert.equal(detail.requestBody.truncated, true);
    assert.equal(detail.responseBody.truncated, true);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore enforces a total byte budget for unmatched raw trace rows", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-pending-total-budget-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    for (let index = 0; index < 18; index += 1) {
      await store.writeBatch([{
        input: {
          requestBodyText: String(index).repeat(1_500 * 1024),
          requestId: `pending-budget-${index}`
        },
        kind: "raw-trace-update",
        sequence: index + 1
      }]);
    }
    await store.writeBatch([
      {
        eventId: "pending-budget-oldest-record",
        input: createRecord("pending-budget-0"),
        kind: "record",
        sequence: 19
      },
      {
        eventId: "pending-budget-newest-record",
        input: createRecord("pending-budget-17"),
        kind: "record",
        sequence: 20
      }
    ]);

    const page = await store.list({ pageSize: 25 });
    const oldestEntry = page.items.find((item) => item.requestId === "pending-budget-0");
    const newestEntry = page.items.find((item) => item.requestId === "pending-budget-17");
    const oldest = await store.getDetail({ id: oldestEntry.id });
    const newest = await store.getDetail({ id: newestEntry.id });
    assert.match(oldest.requestBody.text, /worker-model/);
    assert.match(newest.requestBody.text, /^(?:17)+$/);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime preserves original response sizes when normal body capture is truncated or disabled", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-response-size-test-"));
  const runtime = createRuntime(dir);
  try {
    const fullResponse = "x".repeat(1024 * 1024);
    runtime.enqueueRecord({
      ...createRecord("truncated-response"),
      maxBodyBytes: 512 * 1024,
      responseBodyText: fullResponse
    });
    runtime.enqueueRecord({
      ...createRecord("metadata-response"),
      captureBody: false,
      responseBodyText: "exists"
    });
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const truncatedEntry = page.items.find((item) => item.requestId === "truncated-response");
    const metadataEntry = page.items.find((item) => item.requestId === "metadata-response");
    const truncated = await runtime.getDetail({ id: truncatedEntry.id });
    const metadata = await runtime.getDetail({ id: metadataEntry.id });

    assert.equal(truncated.responseBody.sizeBytes, Buffer.byteLength(fullResponse));
    assert.equal(Buffer.byteLength(truncated.responseBody.text), 512 * 1024);
    assert.equal(truncated.responseBody.truncated, true);
    assert.equal(metadata.responseBody.sizeBytes, Buffer.byteLength("exists"));
    assert.equal(metadata.responseBody.text, "");
    assert.equal(metadata.responseBody.truncated, true);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime strips route trace body values when max body capture is zero", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-zero-body-trace-test-"));
  const runtime = createRuntime(dir);
  try {
    const result = runtime.enqueueRecord({
      ...createRecord("zero-body-route-trace"),
      maxBodyBytes: 0,
      routeTrace: createRouteTrace("zero-body-private-value")
    });
    assert.equal(result.accepted, true);
    assert.equal(result.degraded, true);
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const detail = await runtime.getDetail({ id: page.items[0].id });
    assert.ok(detail.routeTrace);
    assert.doesNotMatch(JSON.stringify(detail.routeTrace), /zero-body-private-value/);
    assert.equal(detail.routeTrace.hops[1].changes[0].before, undefined);
    assert.equal(detail.routeTrace.hops[1].changes[0].after, undefined);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime strips route trace body values when queue pressure removes bodies", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-pressure-trace-test-"));
  const runtime = createRuntime(dir, {
    batchMaxBytes: 64 * 1024,
    batchMaxWaitMs: 60_000,
    queueMaxBytes: 48 * 1024
  });
  try {
    assert.equal(runtime.enqueueRecord({
      ...createRecord("pressure-filler"),
      requestBody: Buffer.alloc(34 * 1024, "x")
    }).accepted, true);
    const result = runtime.enqueueRecord({
      ...createRecord("pressure-route-trace"),
      requestBody: Buffer.from("pressure-private-request"),
      responseBodyText: "pressure-private-response",
      routeTrace: createRouteTrace("pressure-private-route-value")
    });
    assert.equal(result.accepted, true);
    assert.equal(result.degraded, true);
    assert.equal(result.reason, "body_removed");
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const entry = page.items.find((item) => item.requestId === "pressure-route-trace");
    const detail = await runtime.getDetail({ id: entry.id });
    assert.ok(detail.routeTrace);
    assert.equal(detail.requestBody.text, "");
    assert.equal(detail.responseBody.text, "");
    assert.doesNotMatch(JSON.stringify(detail.routeTrace), /pressure-private-route-value/);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime keeps the record body-removal policy for later file-backed raw traces", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-pressure-raw-policy-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const responseFile = path.join(bundleDir, "response.txt");
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(responseFile, "r".repeat(128 * 1024));
  const runtime = createRuntime(dir, {
    batchMaxBytes: 64 * 1024,
    batchMaxWaitMs: 60_000,
    queueMaxBytes: 48 * 1024,
    rawTraceSpoolDir: spoolDir
  });
  try {
    assert.equal(runtime.enqueueRecord({
      ...createRecord("pressure-raw-filler"),
      requestBody: Buffer.alloc(34 * 1024, "x")
    }).accepted, true);
    const record = runtime.enqueueRecord({
      ...createRecord("pressure-raw-request"),
      requestBody: Buffer.from("record-private-request"),
      responseBodyText: "record-private-response"
    });
    assert.deepEqual(record, { accepted: true, degraded: true, reason: "body_removed" });

    const rawTrace = runtime.enqueueRawTrace({
      requestBodyText: "raw-private-request",
      requestId: "pressure-raw-request",
      responseBodySizeBytes: 128 * 1024,
      statusCode: 200
    }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: 128 * 1024,
      responseBody: {
        contentType: "text/plain",
        filePath: responseFile,
        sizeBytes: 128 * 1024
      }
    });
    assert.deepEqual(rawTrace, { accepted: true, degraded: true, reason: "body_removed" });
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const entry = page.items.find((item) => item.requestId === "pressure-raw-request");
    const detail = await runtime.getDetail({ id: entry.id });
    assert.equal(detail.requestBody.text, "");
    assert.equal(detail.responseBody.text, "");
    assert.equal(existsSync(bundleDir), false);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime retains inline raw trace bodies below the default safety limit", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-raw-body-test-"));
  const runtime = createRuntime(dir);
  try {
    const body = "r".repeat(3 * 1024 * 1024);
    runtime.enqueueRecord(createRecord("complete-raw-body"));
    runtime.enqueueRawTrace({
      requestId: "complete-raw-body",
      responseBodyContentType: "text/plain",
      responseBodySizeBytes: Buffer.byteLength(body),
      responseBodyText: body,
      statusCode: 200
    });
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const detail = await runtime.getDetail({ id: page.items[0].id });
    assert.equal(detail.responseBody.sizeBytes, Buffer.byteLength(body));
    assert.equal(detail.responseBody.text.length, body.length);
    assert.equal(detail.responseBody.truncated, false);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime bounds file-backed raw bodies and cleans bundles only after ACK", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-raw-file-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const responseFile = path.join(bundleDir, "response_stream.txt");
  mkdirSync(bundleDir, { recursive: true });
  const body = "f".repeat(700 * 1024);
  writeFileSync(responseFile, body);
  const runtime = createRuntime(dir, { rawTraceSpoolDir: spoolDir });
  try {
    runtime.enqueueRecord(createRecord("file-backed-raw-body"));
    const result = runtime.enqueueRawTrace({
      requestId: "file-backed-raw-body",
      responseBodySizeBytes: Buffer.byteLength(body),
      statusCode: 200
    }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: 256 * 1024,
      responseBody: {
        contentType: "text/plain",
        filePath: responseFile,
        sizeBytes: Buffer.byteLength(body)
      }
    });
    assert.equal(result.accepted, true);
    await runtime.flush({ timeoutMs: 10_000 });

    assert.equal(existsSync(bundleDir), false);
    const page = await runtime.list({ pageSize: 25 });
    const detail = await runtime.getDetail({ id: page.items[0].id });
    assert.equal(detail.responseBody.sizeBytes, Buffer.byteLength(body));
    assert.equal(detail.responseBody.text.length, 256 * 1024);
    assert.equal(detail.responseBody.truncated, true);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime compacts Base64 images while reading file-backed raw traces", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-raw-base64-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const requestFile = path.join(bundleDir, "upstream_request.json");
  mkdirSync(bundleDir, { recursive: true });
  const body = JSON.stringify({
    image_url: { url: `data:image/jpeg;base64,${"A".repeat(512 * 1024)}` },
    model: "raw-vision-model"
  });
  writeFileSync(requestFile, body);
  const runtime = createRuntime(dir, { rawTraceSpoolDir: spoolDir });
  try {
    runtime.enqueueRecord(createRecord("file-backed-base64-image"));
    const result = runtime.enqueueRawTrace({
      requestBodySizeBytes: Buffer.byteLength(body),
      requestId: "file-backed-base64-image",
      statusCode: 200
    }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: 50 * 1024 * 1024,
      requestBody: {
        contentType: "application/json",
        filePath: requestFile,
        sizeBytes: Buffer.byteLength(body)
      }
    });
    assert.equal(result.accepted, true);
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const detail = await runtime.getDetail({ id: page.items[0].id });
    const captured = JSON.parse(detail.requestBody.text);
    assert.equal(detail.requestBody.sizeBytes, Buffer.byteLength(body));
    assert.equal(detail.requestBody.truncated, true);
    assert.match(captured.image_url.url, /^data:image\/jpeg;base64,\[base64 image omitted from log;/);
    assert.equal(existsSync(bundleDir), false);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime does not let a source-truncated raw image overwrite complete JSON", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-partial-raw-base64-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const requestFile = path.join(bundleDir, "upstream_request.json");
  mkdirSync(bundleDir, { recursive: true });
  const fullBody = Buffer.from(JSON.stringify({
    image_url: { url: `data:image/png;base64,${"A".repeat(1024 * 1024)}` },
    model: "model-after-large-image"
  }));
  const sourceLimit = 512 * 1024;
  writeFileSync(requestFile, fullBody.subarray(0, sourceLimit));
  const runtime = createRuntime(dir, { rawTraceSpoolDir: spoolDir });
  try {
    runtime.enqueueRecord({
      ...createRecord("partial-file-backed-base64-image"),
      maxBodyBytes: sourceLimit,
      model: "model-after-large-image",
      requestBody: fullBody
    });
    const result = runtime.enqueueRawTrace({
      requestBodySizeBytes: fullBody.byteLength,
      requestBodyTruncated: true,
      requestId: "partial-file-backed-base64-image",
      statusCode: 200
    }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: sourceLimit,
      requestBody: {
        contentType: "application/json",
        filePath: requestFile,
        sizeBytes: fullBody.byteLength,
        truncated: true
      }
    });
    assert.equal(result.accepted, true);
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const detail = await runtime.getDetail({ id: page.items[0].id });
    const captured = JSON.parse(detail.requestBody.text);
    assert.equal(captured.model, "model-after-large-image");
    assert.match(captured.image_url.url, /^data:image\/png;base64,\[base64 image omitted from log;/);
    assert.equal(detail.requestBody.sizeBytes, fullBody.byteLength);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime keeps raw trace files until the writer ACK is received", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-ack-cleanup-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const responseFile = path.join(bundleDir, "response.txt");
  const delayedWorker = path.join(dir, "delayed-ack-worker.cjs");
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(responseFile, "body");
  writeFileSync(delayedWorker, `
    const { parentPort } = require("node:worker_threads");
    parentPort.postMessage({ type: "ready" });
    parentPort.on("message", (message) => {
      if (message.type === "batch") {
        setTimeout(() => parentPort.postMessage({ batchId: message.batchId, type: "ack" }), 100);
        return;
      }
      parentPort.postMessage({ requestId: message.requestId, result: true, type: "response" });
      if (message.method === "shutdown") parentPort.close();
    });
  `);
  const runtime = createRequestLogRuntime({
    batchMaxWaitMs: 1,
    dbFile: path.join(dir, "request-logs.sqlite"),
    rawTraceSpoolDir: spoolDir,
    workerFile: delayedWorker
  });
  try {
    runtime.enqueueRawTrace({ requestId: "delayed-ack" }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: 512 * 1024,
      responseBody: { filePath: responseFile, sizeBytes: 4 }
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(existsSync(bundleDir), true);

    const flush = await runtime.flush({ timeoutMs: 5_000 });
    assert.equal(flush.timedOut, false);
    assert.equal(existsSync(bundleDir), false);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime replays a committed raw trace idempotently when its body file is already missing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-raw-replay-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  mkdirSync(bundleDir, { recursive: true });
  const runtime = createRuntime(dir, { rawTraceSpoolDir: spoolDir });
  try {
    runtime.enqueueRecord(createRecord("missing-raw-file"));
    const result = runtime.enqueueRawTrace({
      model: "metadata-survives-replay",
      requestId: "missing-raw-file",
      statusCode: 200
    }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: 512 * 1024,
      responseBody: {
        filePath: path.join(bundleDir, "already-removed.txt"),
        sizeBytes: 1024
      }
    });
    assert.equal(result.accepted, true);
    const flush = await runtime.flush({ timeoutMs: 10_000 });

    assert.equal(flush.timedOut, false);
    assert.equal(runtime.metrics().writerRestarts, 0);
    assert.equal(existsSync(bundleDir), false);
    const page = await runtime.list({ pageSize: 25 });
    assert.equal(page.items[0].model, "metadata-survives-replay");
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime isolates and drops a poison raw trace without blocking later records", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-poison-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const outsideFile = path.join(dir, "outside-spool.txt");
  mkdirSync(spoolDir, { recursive: true });
  writeFileSync(outsideFile, "untrusted raw trace");
  const runtime = createRuntime(dir, { rawTraceSpoolDir: spoolDir });
  try {
    assert.equal(runtime.enqueueRawTrace({ requestId: "poison-raw-trace" }, {
      responseBody: { filePath: outsideFile, sizeBytes: 19 }
    }).accepted, true);
    assert.equal(runtime.enqueueRecord(createRecord("record-after-poison")).accepted, true);

    const flush = await runtime.flush({ timeoutMs: 10_000 });
    assert.equal(flush.timedOut, false);
    assert.equal(flush.pending, 0);
    assert.equal(runtime.metrics().committed, 1);
    assert.equal(runtime.metrics().dropped, 1);
    assert.equal(runtime.metrics().writerRestarts, 0);

    const page = await runtime.list({ pageSize: 25 });
    assert.deepEqual(page.items.map((item) => item.requestId), ["record-after-poison"]);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime retains raw trace bundles when enqueue is rejected", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-raw-reject-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const responseFile = path.join(bundleDir, "response.txt");
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(responseFile, "body");
  const runtime = createRequestLogRuntime({
    dbFile: path.join(dir, "request-logs.sqlite"),
    queueMaxBytes: 1,
    queueMaxItems: 10,
    rawTraceSpoolDir: spoolDir,
    workerFile
  });
  try {
    const result = runtime.enqueueRawTrace({ requestId: "rejected-raw-body" }, {
      cleanupDirectory: bundleDir,
      responseBody: { filePath: responseFile, sizeBytes: 4 }
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "queue_full");
    assert.equal(existsSync(bundleDir), true);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime accounts bounded file-backed raw bodies against queue memory", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-raw-queue-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const responseFile = path.join(bundleDir, "response.txt");
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(responseFile, "q".repeat(128 * 1024));
  const runtime = createRequestLogRuntime({
    dbFile: path.join(dir, "request-logs.sqlite"),
    queueMaxBytes: 64 * 1024,
    queueMaxItems: 10,
    rawTraceSpoolDir: spoolDir,
    workerFile
  });
  try {
    const result = runtime.enqueueRawTrace({ requestId: "raw-file-over-queue-budget" }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: 128 * 1024,
      responseBody: { filePath: responseFile, sizeBytes: 128 * 1024 }
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "queue_full");
    assert.equal(existsSync(bundleDir), true);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime terminally rejects delayed raw traces for records dropped by overload", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-shared-admission-test-"));
  const realDateNow = Date.now;
  const runtime = createRequestLogRuntime({
    batchMaxBytes: 64 * 1024,
    batchMaxWaitMs: 60_000,
    dbFile: path.join(dir, "request-logs.sqlite"),
    queueMaxBytes: 40 * 1024,
    queueMaxItems: 100,
    workerFile
  });
  try {
    assert.equal(runtime.enqueueRecord({
      ...createRecord("overload-filler"),
      requestBody: Buffer.alloc(37 * 1024, "x")
    }).accepted, true);
    const record = runtime.enqueueRecord(createRecord("overload-dropped-request"));
    assert.equal(record.accepted, false);
    assert.equal(record.reason, "queue_full");

    await runtime.flush({ timeoutMs: 10_000 });
    Date.now = () => realDateNow() + 6 * 60 * 1_000;
    const rawTrace = runtime.enqueueRawTrace({
      requestBodyText: "must-not-become-an-orphan",
      requestId: "overload-dropped-request",
      statusCode: 200
    });
    Date.now = realDateNow;
    assert.equal(rawTrace.accepted, false);
    assert.equal(rawTrace.reason, "record_dropped");
  } finally {
    Date.now = realDateNow;
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime persists tombstones across restart without capacity eviction", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-persistent-tombstone-test-"));
  const options = {
    batchMaxBytes: 64 * 1024,
    batchMaxItems: 50,
    batchMaxWaitMs: 60_000,
    dbFile: path.join(dir, "request-logs.sqlite"),
    queueMaxBytes: 64 * 1024,
    queueMaxItems: 1,
    workerFile
  };
  const first = createRequestLogRuntime(options);
  try {
    assert.equal(first.enqueueRecord(createRecord("capacity-filler")).accepted, true);
    for (let index = 0; index < 10_050; index += 1) {
      const result = first.enqueueRecord(createRecord(`capacity-dropped-${index}`));
      assert.equal(result.accepted, false);
    }
    await first.close({ timeoutMs: 10_000 });

    const restarted = createRequestLogRuntime(options);
    try {
      const rawTrace = restarted.enqueueRawTrace({
        requestBodyText: "must-not-become-a-pending-orphan",
        requestId: "capacity-dropped-0",
        statusCode: 200
      });
      assert.equal(rawTrace.accepted, false);
      assert.equal(rawTrace.reason, "record_dropped");
    } finally {
      await restarted.close({ timeoutMs: 5_000 });
    }
  } finally {
    await first.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime recovers a record committed before its admission ACK", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-admission-ack-crash-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const admissionDbFile = `${dbFile}.admissions.sqlite`;
  const store = new RequestLogStore(dbFile);
  try {
    await store.record(createRecord("committed-before-admission-ack"));
    await store.close();
    const admissions = new RequestLogAdmissionStore(admissionDbFile, dbFile, "interrupted-runtime");
    admissions.remember({
      accepted: true,
      bodyCaptureMaxBytes: 1024,
      requestId: "committed-before-admission-ack",
      runtimeId: "interrupted-runtime"
    });
    assert.equal(
      admissions.resolveForRawTrace("committed-before-admission-ack", 5_000).state,
      "committed"
    );
    admissions.close();

    const restarted = createRequestLogRuntime({
      admissionDbFile,
      dbFile,
      workerFile
    });
    try {
      const rawTrace = restarted.enqueueRawTrace({
        deferOutcomeUntilRecord: true,
        isStream: true,
        requestId: "committed-before-admission-ack",
        responseBodyText: "recovered-raw-response",
        statusCode: 200
      });
      assert.equal(rawTrace.accepted, true);
      await restarted.flush({ timeoutMs: 10_000 });

      const page = await restarted.list({ pageSize: 25 });
      const detail = await restarted.getDetail({ id: page.items[0].id });
      assert.equal(detail.responseBody.text, "recovered-raw-response");
    } finally {
      await restarted.close({ timeoutMs: 5_000 });
    }
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime reconstructs a missing admission from the committed request log", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-admission-rebuild-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const admissionDbFile = `${dbFile}.admissions.sqlite`;
  const first = createRequestLogRuntime({ admissionDbFile, dbFile, workerFile });
  try {
    first.enqueueRecord({
      ...createRecord("committed-with-missing-admission"),
      bodyCapturePolicy: "all",
      maxBodyBytes: 4_096
    });
    await first.flush({ timeoutMs: 10_000 });
  } finally {
    await first.close({ timeoutMs: 5_000 });
  }
  const sidecar = createBetterSqliteDatabase(admissionDbFile);
  try {
    sidecar.prepare("DELETE FROM request_log_admissions WHERE request_id = ?")
      .run("committed-with-missing-admission");
  } finally {
    sidecar.close();
  }

  const restarted = createRequestLogRuntime({ admissionDbFile, dbFile, workerFile });
  try {
    assert.equal(restarted.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      requestId: "committed-with-missing-admission",
      responseBodyText: "recovered-from-main-db",
      statusCode: 200
    }).accepted, true);
    await restarted.flush({ timeoutMs: 10_000 });
    const page = await restarted.list({ pageSize: 25 });
    const detail = await restarted.getDetail({ id: page.items[0].id });
    assert.equal(detail.responseBody.text, "recovered-from-main-db");
  } finally {
    await restarted.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogAdmissionStore does not reconcile a pending admission owned by a live runtime", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-live-admission-owner-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const admissionDbFile = `${dbFile}.admissions.sqlite`;
  const first = new RequestLogAdmissionStore(admissionDbFile, dbFile, "live-runtime-a");
  let second;
  try {
    first.remember({
      accepted: true,
      bodyCaptureMaxBytes: 1024,
      requestId: "live-pending-request",
      runtimeId: "live-runtime-a"
    });
    second = new RequestLogAdmissionStore(admissionDbFile, dbFile, "live-runtime-b");
    assert.equal(second.read("live-pending-request")?.state, "pending");

    first.markCommitted("live-pending-request", "live-runtime-a");
    assert.equal(second.read("live-pending-request")?.state, "committed");
  } finally {
    second?.close();
    first.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogAdmissionStore polls an existing raw admission without rewriting it", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-admission-poll-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const admissionDbFile = `${dbFile}.admissions.sqlite`;
  const requestLogs = new RequestLogStore(dbFile);
  const admissions = new RequestLogAdmissionStore(admissionDbFile, dbFile, "poll-runtime");
  try {
    await requestLogs.initialize();
    assert.equal(admissions.resolveForRawTrace("poll-pending-request", 5_000), "pending");
    const firstRead = createBetterSqliteDatabase(admissionDbFile);
    let first;
    try {
      first = firstRead.prepare(`
        SELECT first_seen_at, last_seen_at
        FROM request_log_raw_admission_pending
        WHERE request_id = ?
      `).get("poll-pending-request");
    } finally {
      firstRead.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(admissions.resolveForRawTrace("poll-pending-request", 5_000), "pending");
    const database = createBetterSqliteDatabase(admissionDbFile);
    try {
      const second = database.prepare(`
        SELECT first_seen_at, last_seen_at
        FROM request_log_raw_admission_pending
        WHERE request_id = ?
      `).get("poll-pending-request");
      assert.deepEqual(second, first);
    } finally {
      database.close();
    }
  } finally {
    admissions.close();
    await requestLogs.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogAdmissionStore keeps interrupted admissions pending when reconciliation I/O fails", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-admission-reconcile-failure-test-"));
  const admissionDbFile = path.join(dir, "admissions.sqlite");
  const first = new RequestLogAdmissionStore(admissionDbFile, dir, "interrupted-runtime");
  let second;
  try {
    first.remember({
      accepted: true,
      bodyCaptureMaxBytes: 1_024,
      requestId: "reconciliation-must-stay-pending",
      runtimeId: "interrupted-runtime"
    });
    first.close();
    second = new RequestLogAdmissionStore(admissionDbFile, dir, "replacement-runtime");
    assert.equal(second.read("reconciliation-must-stay-pending")?.state, "pending");
  } finally {
    second?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogAdmissionStore prunes terminal admissions and provides reconciliation indexes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-admission-retention-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const admissionDbFile = `${dbFile}.admissions.sqlite`;
  const admissions = new RequestLogAdmissionStore(admissionDbFile, dbFile, "retention-runtime");
  try {
    admissions.remember({
      accepted: false,
      bodyCaptureMaxBytes: 0,
      reason: "sampled",
      requestId: "expired-terminal-admission",
      runtimeId: "retention-runtime"
    });
    const database = createBetterSqliteDatabase(admissionDbFile);
    try {
      database.prepare(`
        UPDATE request_log_admissions SET recorded_at = 0 WHERE request_id = ?
      `).run("expired-terminal-admission");
      const indexes = database.prepare("PRAGMA index_list('request_log_admissions')").all()
        .map((row) => row.name);
      assert.ok(indexes.includes("request_log_admissions_state_runtime_idx"));
      assert.ok(indexes.includes("request_log_admissions_recorded_at_idx"));
    } finally {
      database.close();
    }
    admissions.prune(Date.now());
    assert.equal(admissions.read("expired-terminal-admission"), undefined);
  } finally {
    admissions.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime makes persisted missing-record admissions terminal after their TTL", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-pending-admission-ttl-test-"));
  const options = {
    dbFile: path.join(dir, "request-logs.sqlite"),
    pendingAdmissionTtlMs: 25,
    workerFile
  };
  const first = createRequestLogRuntime(options);
  try {
    assert.deepEqual(first.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      requestId: "record-never-arrives",
      statusCode: 200
    }), { accepted: false, degraded: false, reason: "record_pending" });
  } finally {
    await first.close({ timeoutMs: 5_000 });
  }

  await new Promise((resolve) => setTimeout(resolve, 35));
  const restarted = createRequestLogRuntime(options);
  try {
    assert.deepEqual(restarted.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      requestId: "record-never-arrives",
      statusCode: 200
    }), { accepted: false, degraded: false, reason: "record_dropped" });
  } finally {
    await restarted.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime retains admission operations across a long SQLite lock without blocking the event loop", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-admission-lock-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const admissionDbFile = `${dbFile}.admissions.sqlite`;
  const runtime = createRequestLogRuntime({ admissionDbFile, dbFile, workerFile });
  let locker;
  try {
    // Initialize the store before taking the lock, then hold it longer than the
    // old synchronous retry window.
    runtime.rejectRecord("admission-store-bootstrap", "sampled");
    locker = new Worker(`
      const { parentPort, workerData } = require("node:worker_threads");
      const Database = require("better-sqlite3");
      const database = new Database(workerData.dbFile);
      database.pragma("busy_timeout = 1000");
      database.exec("BEGIN IMMEDIATE");
      parentPort.postMessage("locked");
      setTimeout(() => {
        database.exec("ROLLBACK");
        database.close();
        parentPort.close();
      }, 1500);
    `, { eval: true, workerData: { dbFile: admissionDbFile } });
    const lockerExited = new Promise((resolve, reject) => {
      locker.once("exit", resolve);
      locker.once("error", reject);
    });
    await new Promise((resolve, reject) => {
      locker.once("message", resolve);
      locker.once("error", reject);
    });

    let timerFired = false;
    const eventLoopTimer = new Promise((resolve) => {
      setTimeout(() => {
        timerFired = true;
        resolve();
      }, 50);
    });
    const rejectStartedAt = Date.now();
    runtime.rejectRecord("transient-lock-drop", "sampled");
    assert.ok(Date.now() - rejectStartedAt < 100, "rejectRecord must not busy-wait on SQLite");
    assert.equal(runtime.enqueueRecord(createRecord("transient-lock-commit")).accepted, true);
    const flush = await runtime.flush({ timeoutMs: 5_000 });
    assert.equal(flush.timedOut, false);
    assert.deepEqual(runtime.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      requestId: "transient-lock-drop",
      statusCode: 200
    }), { accepted: false, degraded: false, reason: "record_dropped" });
    await eventLoopTimer;
    assert.equal(timerFired, true);
    await lockerExited;
    await waitForCondition(() => {
      const database = createBetterSqliteDatabase(admissionDbFile);
      try {
        const row = database.prepare(`
          SELECT request_id, state
          FROM request_log_admissions
          WHERE request_id IN (?, ?)
        `).all("transient-lock-drop", "transient-lock-commit");
        return row.some((entry) => entry.request_id === "transient-lock-drop" && entry.state === "rejected") &&
          row.some((entry) => entry.request_id === "transient-lock-commit" && entry.state === "committed");
      } finally {
        database.close();
      }
    }, 5_000);
    assert.equal(runtime.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      requestId: "transient-lock-commit",
      statusCode: 200
    }).accepted, true);
  } finally {
    await locker?.terminate().catch(() => undefined);
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime bounds overlay and retry memory during a permanent admission failure", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-admission-bound-test-"));
  const invalidAdmissionFile = path.join(dir, "admission-is-a-directory");
  mkdirSync(invalidAdmissionFile, { recursive: true });
  const runtime = createRequestLogRuntime({
    admissionDbFile: invalidAdmissionFile,
    admissionMaxPendingOperations: 7,
    admissionOperationMaxAgeMs: 60_000,
    admissionOverlayMaxEntries: 5,
    admissionOverlayTtlMs: 60_000,
    dbFile: path.join(dir, "request-logs.sqlite"),
    workerFile
  });
  try {
    for (let index = 0; index < 100; index += 1) {
      runtime.rejectRecord(`permanent-admission-failure-${index}`, "sampled");
    }
    const metrics = runtime.metrics();
    assert.equal(metrics.admissionPendingOperations, 7);
    assert.equal(metrics.admissionOverlayItems, 5);
    assert.deepEqual(runtime.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      requestId: "permanent-admission-failure-99",
      statusCode: 200
    }), { accepted: false, degraded: false, reason: "record_dropped" });
    assert.deepEqual(runtime.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      requestId: "permanent-admission-failure-0",
      statusCode: 200
    }), { accepted: false, degraded: false, reason: "record_pending" });
  } finally {
    await runtime.close({ timeoutMs: 50 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime releases admission overlay entries after persistence succeeds", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-admission-overlay-release-test-"));
  const runtime = createRuntime(dir);
  try {
    for (let index = 0; index < 100; index += 1) {
      runtime.rejectRecord(`persisted-admission-${index}`, "sampled");
    }
    assert.equal(runtime.metrics().admissionPendingOperations, 0);
    assert.equal(runtime.metrics().admissionOverlayItems, 0);

    assert.equal(runtime.enqueueRecord(createRecord("persisted-commit-admission")).accepted, true);
    await runtime.flush({ timeoutMs: 10_000 });
    assert.equal(runtime.metrics().admissionPendingOperations, 0);
    assert.equal(runtime.metrics().admissionOverlayItems, 0);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime persists degraded body admission across restart", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-persistent-body-policy-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const responseFile = path.join(bundleDir, "response.txt");
  const options = {
    batchMaxBytes: 64 * 1024,
    batchMaxItems: 10,
    batchMaxWaitMs: 60_000,
    dbFile: path.join(dir, "request-logs.sqlite"),
    queueMaxBytes: 48 * 1024,
    queueMaxItems: 100,
    rawTraceSpoolDir: spoolDir,
    workerFile
  };
  const first = createRequestLogRuntime(options);
  try {
    assert.equal(first.enqueueRecord({
      ...createRecord("restart-pressure-filler"),
      requestBody: Buffer.alloc(34 * 1024, "x")
    }).accepted, true);
    const record = first.enqueueRecord({
      ...createRecord("restart-degraded-record"),
      requestBody: Buffer.from("record-private-request"),
      responseBodyText: "record-private-response"
    });
    assert.deepEqual(record, { accepted: true, degraded: true, reason: "body_removed" });
    await first.close({ timeoutMs: 10_000 });

    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(responseFile, "raw-private-response");
    const restarted = createRequestLogRuntime(options);
    try {
      const rawTrace = restarted.enqueueRawTrace({
        requestBodyText: "raw-private-request",
        requestId: "restart-degraded-record",
        responseBodySizeBytes: Buffer.byteLength("raw-private-response"),
        statusCode: 200
      }, {
        cleanupDirectory: bundleDir,
        maxBodyBytes: 1024,
        responseBody: {
          contentType: "text/plain",
          filePath: responseFile,
          sizeBytes: Buffer.byteLength("raw-private-response")
        }
      });
      assert.deepEqual(rawTrace, { accepted: true, degraded: true, reason: "body_removed" });
      await restarted.flush({ timeoutMs: 10_000 });

      const page = await restarted.list({ pageSize: 25 });
      const entry = page.items.find((item) => item.requestId === "restart-degraded-record");
      const detail = await restarted.getDetail({ id: entry.id });
      assert.equal(detail.requestBody.text, "");
      assert.equal(detail.responseBody.text, "");
      assert.equal(existsSync(bundleDir), false);
    } finally {
      await restarted.close({ timeoutMs: 5_000 });
    }
  } finally {
    await first.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime waits for an admission before accepting an ambiguous stream trace", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-stream-admission-test-"));
  const runtime = createRuntime(dir);
  try {
    const pending = runtime.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      isStream: true,
      requestId: "ambiguous-stream",
      statusCode: 200
    });
    assert.deepEqual(pending, { accepted: false, degraded: false, reason: "record_pending" });

    runtime.rejectRecord("ambiguous-stream", "sampled");
    const dropped = runtime.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      isStream: true,
      requestId: "ambiguous-stream",
      statusCode: 200
    });
    assert.deepEqual(dropped, { accepted: false, degraded: false, reason: "record_dropped" });
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime keeps every upstream 2xx provisional until the record writer ACK", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-provisional-2xx-test-"));
  const runtime = createRuntime(dir);
  try {
    assert.equal(runtime.enqueueRecord(createRecord("provisional-http-2xx")).accepted, true);
    assert.deepEqual(runtime.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      isStream: false,
      requestId: "provisional-http-2xx",
      responseBodyText: "upstream-success-body",
      statusCode: 200
    }), { accepted: false, degraded: false, reason: "record_pending" });

    await runtime.flush({ timeoutMs: 10_000 });
    assert.equal(runtime.enqueueRawTrace({
      deferOutcomeUntilRecord: true,
      isStream: false,
      requestId: "provisional-http-2xx",
      responseBodyText: "upstream-success-body",
      statusCode: 200
    }).accepted, true);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime persists errors-only admission until raw SSE outcome detection after restart", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-errors-policy-test-"));
  const first = createRuntime(dir);
  try {
    assert.equal(first.enqueueRecord({
      ...createRecord("provisional-errors-policy"),
      bodyCapturePolicy: "errors",
      captureBody: false,
      maxBodyBytes: 4_096,
      requestBody: Buffer.alloc(0),
      requestBodySizeBytes: 64,
      responseBodyText: "",
      responseBodySizeBytes: 64
    }).accepted, true);
    await first.close({ timeoutMs: 10_000 });

    const restarted = createRuntime(dir);
    try {
      assert.equal(restarted.enqueueRawTrace({
        bodyCapturePolicy: "none",
        deferOutcomeUntilRecord: true,
        isStream: true,
        requestId: "provisional-errors-policy",
        responseBodyContentType: "text/event-stream",
        responseBodyText: 'event: error\ndata: {"error":{"message":"late raw failure"}}\n\n',
        responseHeaders: { "content-type": "text/event-stream" },
        statusCode: 200
      }).accepted, true);
      await restarted.flush({ timeoutMs: 10_000 });

      const page = await restarted.list({ pageSize: 25 });
      const detail = await restarted.getDetail({ id: page.items[0].id });
      assert.equal(detail.ok, false);
      assert.match(detail.error, /late raw failure/);
      assert.match(detail.responseBody.text, /late raw failure/);
    } finally {
      await restarted.close({ timeoutMs: 5_000 });
    }
  } finally {
    await first.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime default queue accepts one maximum request and response raw trace", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-max-raw-event-test-"));
  const spoolDir = path.join(dir, "raw-trace-spool");
  const bundleDir = path.join(spoolDir, "bundle");
  const requestFile = path.join(bundleDir, "request.txt");
  const responseFile = path.join(bundleDir, "response.txt");
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(requestFile, "request");
  writeFileSync(responseFile, "response");
  const runtime = createRequestLogRuntime({
    dbFile: path.join(dir, "request-logs.sqlite"),
    rawTraceSpoolDir: spoolDir,
    workerFile
  });
  try {
    const result = runtime.enqueueRawTrace({ requestId: "maximum-raw-event" }, {
      cleanupDirectory: bundleDir,
      maxBodyBytes: 50 * 1024 * 1024,
      requestBody: { filePath: requestFile, sizeBytes: 50 * 1024 * 1024 },
      responseBody: { filePath: responseFile, sizeBytes: 50 * 1024 * 1024 }
    });
    assert.equal(result.accepted, true);
    assert.ok(runtime.metrics().queueBytes >= 100 * 1024 * 1024);
    const flush = await runtime.flush({ timeoutMs: 10_000 });
    assert.equal(flush.timedOut, false);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogRuntime compacts Base64 images before applying queue and body limits", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-base64-image-test-"));
  const runtime = createRuntime(dir, { queueMaxBytes: 64 * 1024 });
  try {
    const image = "A".repeat(512 * 1024);
    const body = Buffer.from(JSON.stringify({
      messages: [{
        content: [{
          source: { data: image, media_type: "image/png", type: "base64" },
          type: "image"
        }],
        role: "user"
      }],
      model: "vision-model"
    }));
    const result = runtime.enqueueRecord({
      ...createRecord("base64-image-request"),
      maxBodyBytes: 50 * 1024 * 1024,
      model: "vision-model",
      requestBody: body
    });
    assert.equal(result.accepted, true);
    assert.equal(result.degraded, true);
    await runtime.flush({ timeoutMs: 10_000 });

    const page = await runtime.list({ pageSize: 25 });
    const detail = await runtime.getDetail({ id: page.items[0].id });
    const captured = JSON.parse(detail.requestBody.text);
    assert.equal(detail.requestBody.sizeBytes, body.byteLength);
    assert.equal(detail.requestBody.truncated, true);
    assert.match(captured.messages[0].content[0].source.data, /^\[base64 image omitted from log;/);
    assert.ok(Buffer.byteLength(detail.requestBody.text) < 2 * 1024);
  } finally {
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore deduplicates replayed writer events", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-runtime-replay-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    const command = {
      eventId: "stable-event-id",
      input: createRecord("deduplicated-request"),
      kind: "record",
      sequence: 1
    };
    await store.writeBatch([command, { ...command, sequence: 2 }]);
    const page = await store.list({ pageSize: 25 });
    assert.equal(page.items.length, 1);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

function createRuntime(dir, options = {}) {
  return createRequestLogRuntime({
    batchMaxItems: 10,
    batchMaxWaitMs: 1,
    dbFile: path.join(dir, "request-logs.sqlite"),
    queueMaxBytes: 8 * 1024 * 1024,
    queueMaxItems: 100,
    ...options,
    workerFile
  });
}

function createRecord(requestId) {
  const now = new Date().toISOString();
  return {
    completedAt: now,
    durationMs: 10,
    method: "POST",
    model: "worker-model",
    path: "/v1/messages",
    providerName: "worker-provider",
    requestBody: Buffer.from(JSON.stringify({ model: "worker-model", stream: true })),
    requestHeaders: { "content-type": "application/json" },
    requestId,
    responseBodyText: "{}",
    responseHeaders: { "content-type": "application/json" },
    startedAt: now,
    statusCode: 200,
    url: "http://127.0.0.1:3456/v1/messages"
  };
}

function createRouteTrace(privateValue) {
  const recorder = new RequestRouteTraceRecorder(Date.now());
  recorder.captureIngress();
  recorder.capture({
    changes: [{
      after: `${privateValue}-after`,
      before: `${privateValue}-before`,
      operation: "replace",
      path: "/body/messages",
      scope: "body"
    }],
    name: "test.body-rewrite",
    phase: "routing"
  });
  return recorder.finish();
}

async function waitForCondition(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail("Timed out waiting for request log state.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
