import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  assert.equal(policy.captureBodies, false);
  assert.equal(policy.update.requestBodyText, "");
  assert.equal(policy.update.requestBodySizeBytes, 1_024);
  assert.equal(policy.update.requestBodyTruncated, true);
  assert.equal(policy.update.responseBodyText, "");
  assert.equal(policy.update.responseBodySizeBytes, 2_048);
  assert.equal(policy.update.responseBodyTruncated, true);
});

test("raw trace uses the same successful-request sampling policy as normal request logs", () => {
  const config = createConfig();
  config.observability.requestLogSuccessSampleRate = 0;

  assert.deepEqual(applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 128,
    requestId: "sampled-request",
    statusCode: 200
  }), { action: "discard", reason: "sampled" });

  const errorPolicy = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 128,
    requestId: "error-request",
    statusCode: 429
  });
  assert.equal(errorPolicy.action, "enqueue");
});

test("raw trace captures complete error bodies but suppresses successful bodies in errors-only mode", () => {
  const config = createConfig();
  config.observability.requestLogBodyCapture = "errors";

  const successful = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 64,
    requestId: "successful-request",
    statusCode: 200
  });
  assert.equal(successful.action, "enqueue");
  assert.equal(successful.captureBodies, false);

  const failed = applyRawTraceRequestLogPolicy(config, {
    requestBodySizeBytes: 64,
    requestId: "failed-request",
    statusCode: 500
  });
  assert.equal(failed.action, "enqueue");
  assert.equal(failed.captureBodies, true);
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

test("raw trace sync retains its bundle when the asynchronous queue rejects it", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-sync-reject-test-"));
  const spoolDirectory = path.join(dir, "spool");
  const bundleDirectory = path.join(spoolDirectory, "bundle");
  const bodyFile = path.join(bundleDirectory, "upstream_request.json");
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(bodyFile, '{"message":"keep me"}');
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: async () => false,
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
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.accepted, false);
    assert.equal(existsSync(bundleDirectory), true);
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
