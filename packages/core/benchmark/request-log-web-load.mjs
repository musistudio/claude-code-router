import process from "node:process";
import { performance } from "node:perf_hooks";
import { Pool } from "undici";

void main();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = new URL(options.url);
  const pool = new Pool(target.origin, {
    connections: options.concurrency,
    pipelining: 1
  });
  const body = Buffer.alloc(options.bodyBytes, "x");
  const latencies = new Float64Array(options.requests);
  let nextRequest = 0;
  let completed = 0;
  let errors = 0;

  const startedAt = performance.now();
  try {
    await Promise.all(Array.from({ length: options.concurrency }, async () => {
      while (true) {
        const index = nextRequest;
        nextRequest += 1;
        if (index >= options.requests) return;
        const requestStartedAt = performance.now();
        try {
          const response = await pool.request({
            body,
            headers: {
              "content-type": "application/octet-stream",
              "x-benchmark-request-id": `${options.prefix}-${index}`
            },
            method: "POST",
            path: target.pathname
          });
          await response.body.dump();
          if (response.statusCode < 200 || response.statusCode >= 300) errors += 1;
        } catch {
          errors += 1;
        } finally {
          latencies[index] = performance.now() - requestStartedAt;
          completed += 1;
        }
      }
    }));
  } finally {
    await pool.close();
  }

  const durationMs = performance.now() - startedAt;
  const sorted = [...latencies].sort((left, right) => left - right);
  process.stdout.write(JSON.stringify({
    completed,
    concurrency: options.concurrency,
    durationMs: round(durationMs),
    errors,
    latencyAvgMs: round(sorted.reduce((total, value) => total + value, 0) / Math.max(1, sorted.length)),
    latencyMaxMs: round(sorted.at(-1) ?? 0),
    latencyP50Ms: round(percentile(sorted, 0.5)),
    latencyP95Ms: round(percentile(sorted, 0.95)),
    latencyP99Ms: round(percentile(sorted, 0.99)),
    qps: round(completed / (durationMs / 1_000)),
    requests: options.requests
  }));
}

function parseArgs(values) {
  const options = {
    bodyBytes: 1_024,
    concurrency: 64,
    prefix: "benchmark",
    requests: 10_000,
    url: ""
  };
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--body-bytes") options.bodyBytes = positiveInteger(values[index + 1], options.bodyBytes);
    if (values[index] === "--concurrency") options.concurrency = positiveInteger(values[index + 1], options.concurrency);
    if (values[index] === "--prefix") options.prefix = values[index + 1] || options.prefix;
    if (values[index] === "--requests") options.requests = positiveInteger(values[index + 1], options.requests);
    if (values[index] === "--url") options.url = values[index + 1] || "";
  }
  if (!options.url) throw new Error("--url is required");
  return options;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
