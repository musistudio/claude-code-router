import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { rawTraceSyncHeader } from "@ccr/core/gateway/internal/shared.ts";
import { rawTraceHardMaxBodyBytes } from "@ccr/core/observability/request-log-limits.ts";
import {
  applyRawTraceRequestLogPolicy,
  buildRawTraceConfig,
  createBodySampler,
  readRawTraceRequestLogBundle,
  RawTraceSynchronizer
} from "@ccr/core/observability/raw-trace-sync.ts";

test("raw trace applies metadata-only body privacy while retaining original sizes", () => {
  const config = createConfig();
  config.observability.requestLogBodyCapture = "none";

  const policy = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 1_024,
    requestId: "privacy-request",
    responseBodySizeBytes: 2_048,
    statusCode: 200
  });

  assert.equal(policy.action, "enqueue");
  assert.equal(policy.bodyDisposition, "suppress");
  assert.equal(policy.update.requestBodyText, "");
  assert.equal(policy.update.requestBodySizeBytes, 1_024);
  assert.equal(policy.update.requestBodyTruncated, true);
  assert.equal(policy.update.responseBodyText, "");
  assert.equal(policy.update.responseBodySizeBytes, 2_048);
  assert.equal(policy.update.responseBodyTruncated, true);
});

test("raw trace defers successful-request sampling to the final request admission", () => {
  const config = createConfig();
  config.observability.requestLogSuccessSampleRate = 0;

  const provisional = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 128,
    requestId: "sampled-request",
    statusCode: 200
  });
  assert.equal(provisional.action, "enqueue");
  assert.equal(provisional.update.deferOutcomeUntilRecord, true);

  const errorPolicy = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 128,
    requestId: "error-request",
    statusCode: 429
  });
  assert.equal(errorPolicy.action, "enqueue");
  assert.equal(errorPolicy.update.deferOutcomeUntilRecord, true);
});

test("raw trace defers HTTP 200 stream sampling and errors-only body policy", () => {
  const config = createConfig();
  config.observability.requestLogBodyCapture = "errors";
  config.observability.requestLogSuccessSampleRate = 0;

  const policy = applyRawTraceRequestLogPolicy(config, {
    isStream: true,
    requestId: "stream-with-late-error",
    responseBodyText: "event: error\ndata: {\"error\":\"late\"}\n\n",
    statusCode: 200
  });

  assert.equal(policy.action, "enqueue");
  assert.equal(policy.bodyDisposition, "defer");
  assert.equal(policy.update.deferBodyCaptureUntilRecord, true);
  assert.equal(policy.update.deferOutcomeUntilRecord, true);
  assert.match(policy.update.responseBodyText, /late/);
});

test("raw trace captures known error bodies and defers provisional 2xx bodies in errors-only mode", () => {
  const config = createConfig();
  config.observability.requestLogBodyCapture = "errors";

  const successful = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 64,
    requestId: "successful-request",
    statusCode: 200
  });
  assert.equal(successful.action, "enqueue");
  assert.equal(successful.bodyDisposition, "defer");
  assert.equal(successful.update.deferOutcomeUntilRecord, true);

  const failed = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 64,
    requestId: "failed-request",
    statusCode: 500
  });
  assert.equal(failed.action, "enqueue");
  assert.equal(failed.bodyDisposition, "capture");
});

test("raw trace defers body persistence when the upstream status is unknown", () => {
  const config = createConfig();
  config.observability.requestLogBodyCapture = "errors";
  config.observability.requestLogSuccessSampleRate = 0;

  const policy = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 64,
    requestBodyText: "private request body",
    requestId: "network-failure-without-status"
  });

  assert.equal(policy.action, "enqueue");
  assert.equal(policy.bodyDisposition, "defer");
  assert.equal(policy.update.bodyCapturePolicy, "errors");
  assert.equal(policy.update.deferBodyCaptureUntilRecord, true);
  assert.equal(policy.update.requestBodyText, "private request body");
});

test("raw trace source defaults to the 50 MB hard body ceiling", () => {
  const config = createConfig();
  const previous = process.env.CCR_RAW_TRACE_ENABLED;
  process.env.CCR_RAW_TRACE_ENABLED = "1";
  try {
    const rawTrace = buildRawTraceConfig(config, "sync-token");
    assert.equal(rawTrace.maxPartBytes, rawTraceHardMaxBodyBytes);
    config.observability.requestLogMaxBodyBytes = Number.MAX_SAFE_INTEGER;
    assert.equal(buildRawTraceConfig(config, "sync-token").maxPartBytes, rawTraceHardMaxBodyBytes);
  } finally {
    if (previous === undefined) delete process.env.CCR_RAW_TRACE_ENABLED;
    else process.env.CCR_RAW_TRACE_ENABLED = previous;
  }
});

test("raw trace capture is disabled at the source for metadata-only logging", () => {
  const config = createConfig();
  config.observability.requestLogBodyCapture = "none";
  const previous = process.env.CCR_RAW_TRACE_ENABLED;
  process.env.CCR_RAW_TRACE_ENABLED = "1";
  try {
    assert.equal(buildRawTraceConfig(config, "sync-token").enabled, false);
    config.observability.requestLogBodyCapture = "all";
    config.observability.requestLogMaxBodyBytes = 0;
    assert.equal(buildRawTraceConfig(config, "sync-token").enabled, false);
  } finally {
    if (previous === undefined) delete process.env.CCR_RAW_TRACE_ENABLED;
    else process.env.CCR_RAW_TRACE_ENABLED = previous;
  }
});

test("stream sampler retains the original response byte size after capture truncation", () => {
  const sampler = createBodySampler();
  const body = Buffer.alloc(9 * 1024 * 1024, "x");
  sampler.append(body);

  assert.equal(sampler.isTruncated(), true);
  assert.equal(Buffer.byteLength(sampler.read()), 8 * 1024 * 1024);
  assert.equal(sampler.sizeBytes(), body.byteLength);
});

test("raw trace sync acknowledges only after durable inbox ownership and retains queue rejections", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-sync-reject-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "bundle");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"keep me"}');
  let enqueueCalls = 0;
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: async () => {
      enqueueCalls += 1;
      return false;
    },
    getConfig: createConfig,
    spoolDirectory
  });
  const request = Readable.from([JSON.stringify({
    parts: [{
      contentType: "application/json",
      filePath: bodyFile,
      originalBytes: 21,
      partType: "upstream_request"
    }],
    requestId: "core-bundle-queue-rejected",
    turnKey: "queue-rejected-request"
  })]);
  request.method = "POST";
  request.headers = { [rawTraceSyncHeader]: synchronizer.token };
  const result = {};
  const response = {
    end(body) {
      result.body = JSON.parse(body);
    },
    writeHead(statusCode) {
      result.statusCode = statusCode;
    }
  };

  try {
    await synchronizer.handle(request, response);
    assert.equal(result.statusCode, 202);
    assert.equal(result.body.accepted, true);
    assert.equal(result.body.durable, true);
    assert.equal(result.body.bundleId, "core-bundle-queue-rejected");
    assert.equal(existsSync(bundleDirectory), false);
    const inbox = path.join(spoolDirectory, ".ccr-inbox");
    assert.equal(readdirSync(inbox).length, 1);
    assert.equal(existsSync(path.join(inbox, readdirSync(inbox)[0], "upstream_request.json")), true);
    await waitFor(() => enqueueCalls === 1);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace sync acknowledges and cleans bundles for terminally dropped records", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-sync-record-dropped-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "bundle");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"discard me"}');
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: async () => ({
      accepted: false,
      degraded: false,
      reason: "record_dropped"
    }),
    getConfig: createConfig,
    spoolDirectory
  });
  const request = Readable.from([JSON.stringify({
    parts: [{
      contentType: "application/json",
      filePath: bodyFile,
      originalBytes: 24,
      partType: "upstream_request"
    }],
    requestId: "core-bundle-terminal-drop",
    turnKey: "terminally-dropped-request"
  })]);
  request.method = "POST";
  request.headers = { [rawTraceSyncHeader]: synchronizer.token };
  const result = {};
  const response = {
    end(body) {
      result.body = JSON.parse(body);
    },
    writeHead(statusCode) {
      result.statusCode = statusCode;
    }
  };

  try {
    await synchronizer.handle(request, response);
    assert.equal(result.statusCode, 202);
    assert.equal(result.body.durable, true);
    await waitFor(() => readdirSync(path.join(spoolDirectory, ".ccr-inbox")).length === 0);
    assert.equal(existsSync(bundleDirectory), false);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace startup replay outlives producer retries and applies a pending bundle later", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-replay-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "producer-bundle");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"replay me"}');
  writeFileSync(path.join(bundleDirectory, "manifest.json"), JSON.stringify({
    parts: [{
      contentType: "application/json",
      filePath: bodyFile,
      originalBytes: 23,
      partType: "upstream_request"
    }],
    requestId: "core-bundle-replay",
    turnKey: "logical-replay-request",
    uploadedAt: new Date().toISOString()
  }));
  let attempts = 0;
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: async (_update, files) => {
      attempts += 1;
      if (attempts === 1) {
        return { accepted: false, degraded: false, reason: "record_pending" };
      }
      rmSync(files.cleanupDirectory, { force: true, recursive: true });
      return { accepted: true, degraded: false };
    },
    getConfig: createConfig,
    replayIntervalMs: 10,
    retryCooldownMs: 10,
    spoolDirectory
  });

  try {
    await synchronizer.start();
    await waitFor(() => attempts >= 2 &&
      readdirSync(path.join(spoolDirectory, ".ccr-inbox")).length === 0);
    assert.equal(existsSync(bundleDirectory), false);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace replay recovers an inbox bundle after the accepting process crashes", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-crash-replay-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "producer-bundle");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"survive ack"}');
  const first = new RawTraceSynchronizer({
    enqueueUpdate: async () => ({ accepted: true, degraded: false }),
    getConfig: createConfig,
    spoolDirectory
  });
  const request = Readable.from([JSON.stringify({
    parts: [{ filePath: bodyFile, originalBytes: 25, partType: "upstream_request" }],
    requestId: "core-bundle-crash",
    turnKey: "logical-crash-request"
  })]);
  request.method = "POST";
  request.headers = { [rawTraceSyncHeader]: first.token };
  const response = { end() {}, writeHead() {} };

  try {
    await first.handle(request, response);
    const inbox = path.join(spoolDirectory, ".ccr-inbox");
    await waitFor(() => readdirSync(inbox).length === 1);

    let replayed = 0;
    const second = new RawTraceSynchronizer({
      enqueueUpdate: async (_update, files) => {
        replayed += 1;
        rmSync(files.cleanupDirectory, { force: true, recursive: true });
        return { accepted: true, degraded: false };
      },
      getConfig: createConfig,
      replayIntervalMs: 10,
      retryCooldownMs: 10,
      spoolDirectory
    });
    await second.start();
    await waitFor(() => replayed === 1 && readdirSync(inbox).length === 0);
    await second.stop();
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace durable ACK waits for every part fsync and refuses ACK when fsync fails", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-fsync-test-"));
  const spoolDirectory = path.join(dir, "spool");
  try {
    for (const shouldFail of [false, true]) {
      const bundleDirectory = path.join(spoolDirectory, `bundle-${shouldFail}`);
      const bodyFile = path.join(bundleDirectory, "upstream_request.json");
      mkdirSync(bundleDirectory, { recursive: true });
      writeFileSync(bodyFile, '{"message":"fsync me"}');
      let partSynced = false;
      let responseObservedSync = false;
      const synchronizer = new RawTraceSynchronizer({
        enqueueUpdate: async () => ({ accepted: false, degraded: false, reason: "record_dropped" }),
        getConfig: createConfig,
        spoolDirectory,
        syncPartFile: async () => {
          partSynced = true;
          if (shouldFail) throw new Error("injected fsync failure");
        }
      });
      const result = await sendRawTrace(synchronizer, {
        parts: [{
          filePath: bodyFile,
          partType: "upstream_request",
          storedBytes: Buffer.byteLength('{"message":"fsync me"}')
        }],
        requestId: `fsync-bundle-${shouldFail}`,
        turnKey: `fsync-request-${shouldFail}`
      }, () => {
        responseObservedSync = partSynced;
      });
      assert.equal(partSynced, true);
      assert.equal(responseObservedSync, true);
      assert.equal(result.statusCode, shouldFail ? 503 : 202);
      assert.equal(result.body.durable, shouldFail ? undefined : true);
      await synchronizer.stop();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace publishes a fully durable staging directory atomically", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-atomic-publish-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "bundle");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"atomic"}');
  let releaseSync;
  const syncGate = new Promise((resolve) => {
    releaseSync = resolve;
  });
  let syncing = false;
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: async () => ({ accepted: false, degraded: false, reason: "record_pending" }),
    getConfig: createConfig,
    spoolDirectory,
    syncPartFile: async () => {
      syncing = true;
      await syncGate;
    }
  });
  try {
    const upload = sendRawTrace(synchronizer, {
      parts: [{ filePath: bodyFile, partType: "upstream_request" }],
      requestId: "atomic-publish-bundle",
      turnKey: "atomic-publish-request"
    });
    await waitFor(() => syncing);
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-inbox")).length, 0);
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-staging")).length, 1);
    releaseSync();
    const result = await upload;
    assert.equal(result.statusCode, 202);
    const published = readdirSync(path.join(spoolDirectory, ".ccr-inbox"));
    assert.equal(published.length, 1);
    assert.equal(existsSync(path.join(spoolDirectory, ".ccr-inbox", published[0], ".ccr-delivery.json")), true);
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-staging")).length, 0);
  } finally {
    releaseSync?.();
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace startup does not wait for backlog delivery", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-background-replay-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const inboxDirectory = path.join(spoolDirectory, ".ccr-inbox");
  const bundleDirectory = path.join(inboxDirectory, "backlog");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"backlog"}');
  writeFileSync(path.join(bundleDirectory, "manifest.json"), JSON.stringify({
    parts: [{ filePath: bodyFile, partType: "upstream_request" }],
    requestId: "background-replay-bundle",
    turnKey: "background-replay-request"
  }));
  let releaseDelivery;
  const deliveryGate = new Promise((resolve) => {
    releaseDelivery = resolve;
  });
  let deliveryStarted = false;
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: async () => {
      deliveryStarted = true;
      await deliveryGate;
      return { accepted: false, degraded: false, reason: "record_pending" };
    },
    getConfig: createConfig,
    replayIntervalMs: 60_000,
    spoolDirectory
  });
  try {
    await synchronizer.start();
    await waitFor(() => deliveryStarted);
    assert.equal(deliveryStarted, true);
  } finally {
    releaseDelivery?.();
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace inbox and dead letters stay within configured capacity", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-capacity-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const synchronizer = new RawTraceSynchronizer({
    deadLetterMaxBundles: 1,
    deadLetterMaxBytes: 1024 * 1024,
    enqueueUpdate: async () => ({ accepted: false, degraded: false, reason: "record_pending" }),
    getConfig: createConfig,
    inboxMaxBundles: 1,
    inboxMaxBytes: 1024 * 1024,
    spoolDirectory
  });
  try {
    for (let index = 1; index <= 3; index += 1) {
      const bundleDirectory = path.join(spoolDirectory, `bundle-${index}`);
      const bodyFile = path.join(bundleDirectory, "upstream_request.json");
      mkdirSync(bundleDirectory, { recursive: true });
      writeFileSync(bodyFile, JSON.stringify({ index }));
      await sendRawTrace(synchronizer, {
        parts: [{ filePath: bodyFile, partType: "upstream_request" }],
        requestId: `capacity-bundle-${index}`,
        turnKey: `capacity-request-${index}`
      });
      await synchronizer.stop();
    }
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-inbox")).length, 1);
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-dead-letter")).length, 1);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace isolates incomplete source bundles under the same bounded retention", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-incomplete-source-test-"));
  const spoolDirectory = path.join(dir, "spool");
  for (let index = 0; index < 3; index += 1) {
    const bundleDirectory = path.join(spoolDirectory, `incomplete-${index}`);
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(path.join(bundleDirectory, "orphaned.part"), "x".repeat(128));
    if (index === 1) writeFileSync(path.join(bundleDirectory, "manifest.json"), "{broken-json");
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
  const synchronizer = new RawTraceSynchronizer({
    deadLetterMaxBundles: 1,
    deadLetterMaxBytes: 1024 * 1024,
    getConfig: createConfig,
    inboxMaxBundles: 1,
    inboxMaxBytes: 1024 * 1024,
    replayIntervalMs: 5,
    sourceBundleGraceMs: 1,
    sourceScanIntervalMs: 1,
    spoolDirectory
  });
  try {
    await synchronizer.start();
    await waitFor(() => readdirSync(spoolDirectory)
      .filter((name) => ![".ccr-inbox", ".ccr-dead-letter", ".ccr-staging"].includes(name))
      .length === 0);
    const sourceEntries = readdirSync(spoolDirectory)
      .filter((name) => ![".ccr-inbox", ".ccr-dead-letter", ".ccr-staging"].includes(name));
    assert.deepEqual(sourceEntries, []);
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-inbox")).length, 0);
    await waitFor(() => readdirSync(path.join(spoolDirectory, ".ccr-dead-letter")).length === 1);
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-dead-letter")).length, 1);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace keeps an over-capacity streaming source while its files are active", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-active-source-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "active-stream");
  const bodyFile = path.join(bundleDirectory, "upstream_response.sse");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, "data: start\n\n");
  const synchronizer = new RawTraceSynchronizer({
    getConfig: createConfig,
    inboxMaxBytes: 1,
    replayIntervalMs: 5,
    sourceBundleGraceMs: 30,
    sourceScanIntervalMs: 5,
    spoolDirectory
  });
  try {
    await synchronizer.start();
    for (let index = 0; index < 4; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      appendFileSync(bodyFile, `data: ${index}\n\n`);
    }
    assert.equal(existsSync(bundleDirectory), true);
    await waitFor(() => !existsSync(bundleDirectory));
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-dead-letter")).length, 1);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace ACK measures only the newly admitted bundle after startup indexing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-incremental-capacity-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const inboxDirectory = path.join(spoolDirectory, ".ccr-inbox");
  mkdirSync(inboxDirectory, { recursive: true });
  for (let index = 0; index < 40; index += 1) {
    const bundleDirectory = path.join(inboxDirectory, `backlog-${index}`);
    const metadataFile = path.join(bundleDirectory, "upstream_response_metadata.json");
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(metadataFile, JSON.stringify({ statusCode: 200 }));
    writeFileSync(path.join(bundleDirectory, "manifest.json"), JSON.stringify({
      parts: [{ filePath: metadataFile, partType: "upstream_response_metadata" }],
      requestId: `backlog-bundle-${index}`,
      turnKey: `backlog-request-${index}`
    }));
  }
  const measuredDirectories = [];
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: async () => ({ accepted: false, degraded: false, reason: "record_pending" }),
    getConfig: createConfig,
    measureDirectorySize: async (directory) => {
      measuredDirectories.push(directory);
      return 1;
    },
    replayIntervalMs: 60_000,
    spoolDirectory
  });
  try {
    await synchronizer.start();
    await waitFor(() => measuredDirectories.length === 40);
    assert.equal(measuredDirectories.length, 40);
    measuredDirectories.length = 0;

    const producerDirectory = path.join(spoolDirectory, "new-producer-bundle");
    const bodyFile = path.join(producerDirectory, "upstream_request.json");
    mkdirSync(producerDirectory, { recursive: true });
    writeFileSync(bodyFile, '{"message":"incremental"}');
    let result;
    const deadline = Date.now() + 2_000;
    do {
      result = await sendRawTrace(synchronizer, {
        parts: [{ filePath: bodyFile, partType: "upstream_request" }],
        requestId: "incremental-capacity-bundle",
        turnKey: "incremental-capacity-request"
      });
      if (result.statusCode !== 503) break;
      assert.equal(result.body.reason, "initializing");
      await new Promise((resolve) => setTimeout(resolve, 5));
    } while (Date.now() < deadline);
    assert.equal(result.statusCode, 202);
    assert.equal(measuredDirectories.length, 1);
    assert.equal(measuredDirectories[0].includes("new-producer-bundle"), false);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace moves permanently pending bundles to bounded dead letter after max attempts", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-max-attempt-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "pending-bundle");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"pending"}');
  writeFileSync(path.join(bundleDirectory, "manifest.json"), JSON.stringify({
    parts: [{ filePath: bodyFile, partType: "upstream_request" }],
    requestId: "max-attempt-bundle",
    turnKey: "max-attempt-request"
  }));
  let attempts = 0;
  const synchronizer = new RawTraceSynchronizer({
    bundleMaxAttempts: 1,
    enqueueUpdate: async () => {
      attempts += 1;
      return { accepted: false, degraded: false, reason: "record_pending" };
    },
    getConfig: createConfig,
    replayIntervalMs: 10,
    retryCooldownMs: 10,
    spoolDirectory
  });
  try {
    await synchronizer.start();
    await waitFor(() => readdirSync(path.join(spoolDirectory, ".ccr-dead-letter")).length === 1);
    assert.equal(attempts, 1);
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-inbox")).length, 0);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace backs off record-pending retries without repeatedly persisting attempts", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-pending-backoff-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "pending-backoff-bundle");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"pending"}');
  let attempts = 0;
  const synchronizer = new RawTraceSynchronizer({
    bundleMaxAttempts: 100,
    enqueueUpdate: async () => {
      attempts += 1;
      return { accepted: false, degraded: false, reason: "record_pending" };
    },
    getConfig: createConfig,
    pendingRetryMaxMs: 1_000,
    replayIntervalMs: 5,
    retryCooldownMs: 15,
    spoolDirectory
  });
  try {
    const result = await sendRawTrace(synchronizer, {
      parts: [{ filePath: bodyFile, partType: "upstream_request" }],
      requestId: "pending-backoff-bundle-id",
      turnKey: "pending-backoff-request"
    });
    assert.equal(result.statusCode, 202);
    await synchronizer.start();
    await waitFor(() => attempts >= 1);
    const inboxDirectory = path.join(spoolDirectory, ".ccr-inbox");
    const storedDirectory = path.join(inboxDirectory, readdirSync(inboxDirectory)[0]);
    const deliveryFile = path.join(storedDirectory, ".ccr-delivery.json");
    await waitFor(() => JSON.parse(readFileSync(deliveryFile, "utf8")).lastError === "record_pending");
    const firstPersistedState = readFileSync(deliveryFile, "utf8");

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(attempts >= 2);
    assert.ok(attempts <= 3);
    assert.equal(readFileSync(deliveryFile, "utf8"), firstPersistedState);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace replay rotates through a bounded number of bundles per pass", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-replay-budget-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const inboxDirectory = path.join(spoolDirectory, ".ccr-inbox");
  mkdirSync(inboxDirectory, { recursive: true });
  for (let index = 0; index < 5; index += 1) {
    const bundleDirectory = path.join(inboxDirectory, `budget-${index}`);
    const bodyFile = path.join(bundleDirectory, "upstream_request.json");
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(bodyFile, JSON.stringify({ index }));
    writeFileSync(path.join(bundleDirectory, "manifest.json"), JSON.stringify({
      parts: [{ filePath: bodyFile, partType: "upstream_request" }],
      requestId: `budget-bundle-${index}`,
      turnKey: `budget-request-${index}`
    }));
  }
  const attemptedBundleIds = [];
  const synchronizer = new RawTraceSynchronizer({
    bundleMaxAttempts: 100,
    enqueueUpdate: async (update) => {
      attemptedBundleIds.push(update.bundleId);
      return { accepted: false, degraded: false, reason: "record_pending" };
    },
    getConfig: createConfig,
    replayIntervalMs: 50,
    replayMaxBundlesPerPass: 2,
    replayTimeBudgetMs: 1_000,
    retryCooldownMs: 60_000,
    spoolDirectory
  });
  try {
    await synchronizer.start();
    await waitFor(() => attemptedBundleIds.length >= 2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(attemptedBundleIds.length, 2);
    await waitFor(() => attemptedBundleIds.length === 5);
    assert.equal(new Set(attemptedBundleIds).size, 5);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace replay stops when its time budget is exhausted", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-replay-time-budget-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const inboxDirectory = path.join(spoolDirectory, ".ccr-inbox");
  mkdirSync(inboxDirectory, { recursive: true });
  for (let index = 0; index < 3; index += 1) {
    const bundleDirectory = path.join(inboxDirectory, `timed-${index}`);
    const bodyFile = path.join(bundleDirectory, "upstream_request.json");
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(bodyFile, JSON.stringify({ index }));
    writeFileSync(path.join(bundleDirectory, "manifest.json"), JSON.stringify({
      parts: [{ filePath: bodyFile, partType: "upstream_request" }],
      requestId: `timed-bundle-${index}`,
      turnKey: `timed-request-${index}`
    }));
  }
  let attempts = 0;
  const synchronizer = new RawTraceSynchronizer({
    bundleMaxAttempts: 100,
    enqueueUpdate: async () => {
      attempts += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { accepted: false, degraded: false, reason: "record_pending" };
    },
    getConfig: createConfig,
    replayIntervalMs: 200,
    replayMaxBundlesPerPass: 100,
    replayTimeBudgetMs: 5,
    retryCooldownMs: 60_000,
    spoolDirectory
  });
  try {
    await synchronizer.start();
    await waitFor(() => attempts >= 1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(attempts, 1);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("raw trace replay isolates a failing bundle and continues with later bundles", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-isolated-replay-test-"));
  const spoolDirectory = path.join(dir, "spool");
  for (const name of ["bad", "good"]) {
    const bundleDirectory = path.join(spoolDirectory, `${name}-bundle`);
    const bodyFile = path.join(bundleDirectory, "upstream_request.json");
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(bodyFile, JSON.stringify({ name }));
    writeFileSync(path.join(bundleDirectory, "manifest.json"), JSON.stringify({
      parts: [{ filePath: bodyFile, partType: "upstream_request" }],
      requestId: `${name}-bundle-id`,
      turnKey: `${name}-request`
    }));
  }
  let goodApplied = false;
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: async (update, files) => {
      if (update.bundleId === "bad-bundle-id") throw new Error("permanent bad bundle");
      goodApplied = true;
      rmSync(files.cleanupDirectory, { force: true, recursive: true });
      return { accepted: true, degraded: false };
    },
    getConfig: createConfig,
    replayIntervalMs: 10_000,
    spoolDirectory
  });
  try {
    await synchronizer.start();
    await waitFor(() => goodApplied);
    assert.equal(goodApplied, true);
    assert.equal(readdirSync(path.join(spoolDirectory, ".ccr-inbox")).length, 1);
  } finally {
    await synchronizer.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("fallback raw bundles keep unique bundle ids while sharing the logical request", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-fallback-id-test-"));
  const spoolDirectory = path.join(dir, "spool");
  try {
    const bundles = [];
    for (const attempt of [1, 2]) {
      const bundleDirectory = path.join(spoolDirectory, `bundle-${attempt}`);
      const clientMetadata = path.join(bundleDirectory, "client_request_metadata.json");
      const responseMetadata = path.join(bundleDirectory, "upstream_response_metadata.json");
      mkdirSync(bundleDirectory, { recursive: true });
      writeFileSync(clientMetadata, JSON.stringify({ headers: { "x-ccr-route-attempt": String(attempt) } }));
      writeFileSync(responseMetadata, JSON.stringify({ statusCode: attempt === 1 ? 500 : 200 }));
      bundles.push(await readRawTraceRequestLogBundle({
        parts: [
          { filePath: clientMetadata, partType: "client_request_metadata" },
          { filePath: responseMetadata, partType: "upstream_response_metadata" }
        ],
        requestId: `core-bundle-${attempt}`,
        turnKey: "shared-logical-request"
      }, spoolDirectory));
    }

    assert.deepEqual(bundles.map((bundle) => ({
      attempt: bundle.update.attempt,
      bundleId: bundle.update.bundleId,
      requestId: bundle.update.requestId
    })), [
      { attempt: 1, bundleId: "core-bundle-1", requestId: "shared-logical-request" },
      { attempt: 2, bundleId: "core-bundle-2", requestId: "shared-logical-request" }
    ]);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

function createConfig() {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-generated-config.json" });
  config.observability.requestLogs = true;
  config.observability.requestLogBodyCapture = "all";
  config.observability.requestLogSuccessSampleRate = 1;
  return config;
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail("Timed out waiting for raw trace state.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function sendRawTrace(synchronizer, manifest, onResponse) {
  const request = Readable.from([JSON.stringify(manifest)]);
  request.method = "POST";
  request.headers = { [rawTraceSyncHeader]: synchronizer.token };
  const result = {};
  const response = {
    end(body) {
      result.body = JSON.parse(body);
      onResponse?.();
    },
    writeHead(statusCode) {
      result.statusCode = statusCode;
    }
  };
  await synchronizer.handle(request, response);
  return result;
}
