import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import process from "node:process";
import * as requestLogs from "@ccr/core/observability/request-log-store.ts";

const scenarios = [
  { bodyBytes: 256, hops: 0, name: "small-no-trace", records: 2_000 },
  { bodyBytes: 256, hops: 10, name: "small-10-hops", records: 1_000 },
  { bodyBytes: 2 * 1024 * 1024, hops: 10, name: "large-2mb-10-hops", records: 50 },
  { base64Image: true, bodyBytes: 8 * 1024 * 1024, hops: 0, name: "base64-image-8mb", records: 10 }
];
const webOptions = {
  bodyBytes: positiveInteger(process.env.CCR_REQUEST_LOG_BENCHMARK_WEB_BODY_BYTES, 1_024),
  concurrency: positiveInteger(process.env.CCR_REQUEST_LOG_BENCHMARK_WEB_CONCURRENCY, 64),
  requests: positiveInteger(process.env.CCR_REQUEST_LOG_BENCHMARK_WEB_REQUESTS, 10_000),
  skip: process.env.CCR_REQUEST_LOG_BENCHMARK_SKIP_WEB === "1"
};
const skipStorage = process.env.CCR_REQUEST_LOG_BENCHMARK_SKIP_STORAGE === "1";

void main();

async function main() {
  const results = [];
  if (!skipStorage) {
    for (const scenario of scenarios) {
      process.stderr.write(`[benchmark] Running storage scenario: ${scenario.name}\n`);
      results.push(await runScenario(scenario));
      process.stderr.write(`[benchmark] Completed storage scenario: ${scenario.name}\n`);
    }
  }
  const webResults = [];
  if (!webOptions.skip) {
    for (const mode of ["control", "sync-main-thread", "async-worker"]) {
      process.stderr.write(`[benchmark] Running HTTP scenario: ${mode}\n`);
      webResults.push(await runWebScenario(mode, webOptions));
      process.stderr.write(`[benchmark] Completed HTTP scenario: ${mode}\n`);
    }
  }

  process.stdout.write(JSON.stringify({
    architecture: typeof requestLogs.createRequestLogRuntime === "function" ? "worker-runtime" : "main-thread-store",
    cpu: process.arch,
    label: process.env.CCR_REQUEST_LOG_BENCHMARK_LABEL || "benchmark",
    node: process.version,
    platform: process.platform,
    results,
    storageSkipped: skipStorage,
    timestamp: new Date().toISOString(),
    web: {
      bodyBytes: webOptions.bodyBytes,
      concurrency: webOptions.concurrency,
      requests: webOptions.requests,
      results: webResults,
      skipped: webOptions.skip
    }
  }));
}

async function runScenario(scenario) {
  const dir = mkdtempSync(path.join(tmpdir(), `ccr-log-bench-${scenario.name}-`));
  const target = createTarget(path.join(dir, "request-logs.sqlite"));
  const eventLoop = monitorEventLoopDelay({ resolution: 1 });
  const batchDurations = [];
  const pending = [];
  let accepted = 0;
  let degraded = 0;
  let dropped = 0;
  const sharedRequestBody = scenario.base64Image ? createRequestBody(scenario) : undefined;

  try {
    for (let index = 0; index < Math.min(25, scenario.records); index += 1) {
      await Promise.resolve(target.record(createRecord(scenario, `warmup-${index}`, sharedRequestBody)));
    }
    await target.flush();

    if (global.gc) global.gc();
    const heapBefore = process.memoryUsage();
    eventLoop.enable();
    const startedAt = performance.now();
    const batchSize = 25;
    for (let start = 0; start < scenario.records; start += batchSize) {
      const batchStartedAt = performance.now();
      pending.length = 0;
      for (let index = start; index < Math.min(start + batchSize, scenario.records); index += 1) {
        const result = target.record(createRecord(scenario, `${scenario.name}-${index}`, sharedRequestBody));
        if (result && typeof result.then === "function") {
          pending.push(result);
        } else if (result?.accepted === false) {
          dropped += 1;
        } else {
          accepted += 1;
          if (result?.degraded) degraded += 1;
        }
      }
      await Promise.all(pending);
      await new Promise((resolve) => setImmediate(resolve));
      batchDurations.push(performance.now() - batchStartedAt);
    }
    const requestPathMs = performance.now() - startedAt;
    const flushStartedAt = performance.now();
    await target.flush();
    const flushMs = performance.now() - flushStartedAt;
    const durableMs = performance.now() - startedAt;
    eventLoop.disable();
    const heapAfter = process.memoryUsage();

    if (accepted + dropped === 0) accepted = scenario.records;
    return {
      accepted,
      batchP99Ms: round(percentile(batchDurations, 0.99)),
      degraded,
      dropped,
      durableMs: round(durableMs),
      durableRecordsPerSecond: round(accepted / (durableMs / 1_000)),
      eventLoopMaxMs: round(Number(eventLoop.max) / 1e6),
      eventLoopP99Ms: round(Number(eventLoop.percentile(99)) / 1e6),
      flushMs: round(flushMs),
      heapDeltaMb: round((heapAfter.heapUsed - heapBefore.heapUsed) / 1024 / 1024),
      name: scenario.name,
      records: scenario.records,
      requestPathMs: round(requestPathMs),
      requestPathRecordsPerSecond: round(scenario.records / (requestPathMs / 1_000)),
      rssDeltaMb: round((heapAfter.rss - heapBefore.rss) / 1024 / 1024)
    };
  } finally {
    await target.close();
    rmSync(dir, { force: true, recursive: true });
  }
}

async function runWebScenario(mode, options) {
  const dir = mkdtempSync(path.join(tmpdir(), `ccr-log-web-bench-${mode}-`));
  const target = createWebTarget(mode, path.join(dir, "request-logs.sqlite"), options);
  const counters = { accepted: 0, rejected: 0 };
  const server = createServer((request, response) => {
    void handleWebRequest(request, response, mode, target, counters);
  });
  server.keepAliveTimeout = 30_000;
  server.requestTimeout = 30_000;

  try {
    await target.ready();
    const address = await listen(server);
    const url = `http://127.0.0.1:${address.port}/benchmark`;
    const warmupRequests = Math.min(1_000, Math.max(100, Math.floor(options.requests / 10)));
    await runLoadGenerator(url, {
      ...options,
      concurrency: Math.min(options.concurrency, warmupRequests),
      prefix: `${mode}-warmup`,
      requests: warmupRequests
    });
    await target.flush();
    counters.accepted = 0;
    counters.rejected = 0;

    if (global.gc) global.gc();
    const eventLoop = monitorEventLoopDelay({ resolution: 1 });
    const memoryBefore = process.memoryUsage();
    const cpuBefore = process.cpuUsage();
    eventLoop.enable();
    const load = await runLoadGenerator(url, {
      ...options,
      prefix: `${mode}-measured`
    });
    eventLoop.disable();
    const memoryAfterRequest = process.memoryUsage();
    const cpu = process.cpuUsage(cpuBefore);
    const flushStartedAt = performance.now();
    await target.flush();
    const flushMs = performance.now() - flushStartedAt;
    const durableMs = load.durationMs + flushMs;

    return {
      bodyBytes: options.bodyBytes,
      concurrency: options.concurrency,
      cpuSystemMs: round(cpu.system / 1_000),
      cpuTotalPercent: round(((cpu.user + cpu.system) / 1_000) / Math.max(1, load.durationMs) * 100),
      cpuUserMs: round(cpu.user / 1_000),
      durableMs: round(durableMs),
      durableQps: round(load.completed / (durableMs / 1_000)),
      errors: load.errors,
      eventLoopMaxMs: round(Number(eventLoop.max) / 1e6),
      eventLoopP99Ms: round(Number(eventLoop.percentile(99)) / 1e6),
      flushMs: round(flushMs),
      heapDeltaMb: round((memoryAfterRequest.heapUsed - memoryBefore.heapUsed) / 1024 / 1024),
      latencyAvgMs: load.latencyAvgMs,
      latencyMaxMs: load.latencyMaxMs,
      latencyP50Ms: load.latencyP50Ms,
      latencyP95Ms: load.latencyP95Ms,
      latencyP99Ms: load.latencyP99Ms,
      logAccepted: counters.accepted,
      logRejected: counters.rejected,
      mode,
      qps: load.qps,
      requestPathMs: load.durationMs,
      requests: load.requests,
      rssDeltaMb: round((memoryAfterRequest.rss - memoryBefore.rss) / 1024 / 1024)
    };
  } finally {
    await closeHttpServer(server);
    await target.close();
    rmSync(dir, { force: true, recursive: true });
  }
}

async function handleWebRequest(request, response, mode, target, counters) {
  const startedAt = Date.now();
  try {
    const body = await readBody(request);
    if (mode !== "control") {
      const input = createWebRecord(
        body,
        String(request.headers["x-benchmark-request-id"] ?? "benchmark-request"),
        startedAt
      );
      const result = target.record(input);
      if (result && typeof result.then === "function") {
        await result;
        counters.accepted += 1;
      } else if (result?.accepted === false) {
        counters.rejected += 1;
      } else {
        counters.accepted += 1;
      }
    }
    response.writeHead(204);
    response.end();
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(error instanceof Error ? error.message : String(error));
  }
}

function createWebTarget(mode, dbFile, options) {
  if (mode === "control") {
    return {
      close: async () => {},
      flush: async () => {},
      ready: async () => {},
      record: () => undefined
    };
  }
  if (mode === "sync-main-thread") {
    const store = new requestLogs.RequestLogStore(dbFile);
    return {
      close: () => store.close(),
      flush: () => store.checkpoint(),
      ready: () => store.initialize(),
      record: (input) => store.record(input)
    };
  }
  const runtime = requestLogs.createRequestLogRuntime({
    batchMaxBytes: 4 * 1024 * 1024,
    batchMaxItems: 50,
    batchMaxWaitMs: 10,
    dbFile,
    queueMaxBytes: Math.max(256 * 1024 * 1024, options.bodyBytes * options.requests * 2),
    queueMaxItems: Math.max(20_000, options.requests * 2)
  });
  return {
    close: () => runtime.close({ timeoutMs: 30_000 }),
    flush: () => runtime.flush({ timeoutMs: 60_000 }),
    ready: async () => {},
    record: (input) => runtime.enqueueRecord(input)
  };
}

function createWebRecord(requestBody, requestId, startedAtMs) {
  const startedAt = new Date(startedAtMs).toISOString();
  return {
    captureBody: true,
    client: "web-benchmark",
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    maxBodyBytes: 512 * 1024,
    method: "POST",
    model: "benchmark-model",
    path: "/benchmark",
    providerName: "benchmark-provider",
    requestBody,
    requestHeaders: { "content-type": "application/octet-stream" },
    requestId,
    responseBodyText: "",
    responseHeaders: {},
    startedAt,
    statusCode: 204,
    url: "http://127.0.0.1/benchmark"
  };
}

function runLoadGenerator(url, options) {
  const loadGenerator = path.join(__dirname, "request-log-web-load.js");
  const args = [
    loadGenerator,
    "--url", url,
    "--requests", String(options.requests),
    "--concurrency", String(options.concurrency),
    "--body-bytes", String(options.bodyBytes),
    "--prefix", options.prefix
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Web load generator exited from signal ${signal}: ${stderr}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Web load generator exited with ${code ?? 1}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Invalid web load generator output: ${stdout}\n${stderr}`, { cause: error }));
      }
    });
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      size += buffer.byteLength;
    });
    request.on("end", () => resolve(Buffer.concat(chunks, size)));
    request.on("error", reject);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeHttpServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server.closeIdleConnections?.();
  });
}

function createTarget(dbFile) {
  if (typeof requestLogs.createRequestLogRuntime === "function") {
    const runtime = requestLogs.createRequestLogRuntime({
      batchMaxBytes: 4 * 1024 * 1024,
      batchMaxItems: 50,
      batchMaxWaitMs: 10,
      dbFile,
      queueMaxBytes: 256 * 1024 * 1024,
      queueMaxItems: 4_000
    });
    return {
      close: () => runtime.close({ timeoutMs: 10_000 }),
      flush: () => runtime.flush({ timeoutMs: 30_000 }),
      record: (input) => runtime.enqueueRecord(input)
    };
  }
  const store = new requestLogs.RequestLogStore(dbFile);
  return {
    close: () => store.close(),
    flush: async () => {},
    record: (input) => store.record(input)
  };
}

function createRecord(scenario, requestId, sharedRequestBody) {
  const startedAt = new Date().toISOString();
  const requestBody = sharedRequestBody ?? createRequestBody(scenario);
  return {
    client: "benchmark",
    completedAt: startedAt,
    durationMs: 42,
    fallbackModel: "benchmark-provider,benchmark-model",
    method: "POST",
    maxBodyBytes: scenario.base64Image ? 50 * 1024 * 1024 : undefined,
    model: "benchmark-model",
    path: "/v1/messages",
    providerName: "benchmark-provider",
    requestBody,
    requestHeaders: { "content-type": "application/json", "x-api-key": "secret" },
    requestId,
    ...(scenario.hops > 0 ? { routeTrace: createTrace(scenario.hops) } : {}),
    responseBodyText: JSON.stringify({ usage: { input_tokens: 32, output_tokens: 16 } }),
    responseHeaders: { "content-type": "application/json" },
    startedAt,
    statusCode: 200,
    url: "http://127.0.0.1:3456/v1/messages"
  };
}

function createRequestBody(scenario) {
  const paddingLength = Math.max(0, scenario.bodyBytes - 96);
  return Buffer.from(JSON.stringify(scenario.base64Image
    ? {
        messages: [{
          content: [{
            source: { data: "A".repeat(paddingLength), media_type: "image/png", type: "base64" },
            type: "image"
          }],
          role: "user"
        }],
        model: "benchmark-model",
        stream: true
      }
    : {
        messages: [{ content: "x".repeat(paddingLength), role: "user" }],
        model: "benchmark-model",
        stream: true
      }));
}

function createTrace(hopCount) {
  return {
    attemptCount: 1,
    complete: true,
    hopCount,
    hops: Array.from({ length: hopCount }, (_, index) => ({
      attempt: 1,
      changes: [{
        after: `model-${index + 1}`,
        before: `model-${index}`,
        operation: "replace",
        path: "/body/model",
        scope: "body"
      }],
      durationMs: 1,
      kind: "mutation",
      name: `benchmark.hop-${index}`,
      phase: index === 0 ? "routing" : "attempt",
      seq: index,
      startedOffsetMs: index,
      status: "ok",
      target: { model: `model-${index + 1}`, provider: "benchmark-provider" }
    })),
    truncated: false,
    version: 2
  };
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
