import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequestLogRuntime, RequestLogStore } from "@ccr/core/observability/request-log-store.ts";

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
