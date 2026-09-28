import { performance } from "node:perf_hooks";
import {
  parseJsonObjectSafe,
  serializeJsonBody,
  takeJsonObject
} from "@ccr/core/gateway/http/body.ts";

const iterations = positiveInteger(process.env.CCR_REQUEST_BODY_BENCHMARK_ITERATIONS, 200);
const parsePasses = positiveInteger(process.env.CCR_REQUEST_BODY_BENCHMARK_PARSE_PASSES, 7);
const payload = JSON.stringify(createPayload(400 * 1024));

for (let index = 0; index < 10; index += 1) {
  runLegacyPipeline(payload, parsePasses);
  runOptimizedPipeline(payload, parsePasses);
}

const legacyMs = measure(() => runLegacyPipeline(payload, parsePasses), iterations);
const optimizedMs = measure(() => runOptimizedPipeline(payload, parsePasses), iterations);

process.stdout.write(`${JSON.stringify({
  bodyBytes: Buffer.byteLength(payload),
  improvementPercent: round((1 - optimizedMs / legacyMs) * 100),
  iterations,
  legacyMs: round(legacyMs),
  optimizedMs: round(optimizedMs),
  parsePasses,
  speedup: round(legacyMs / optimizedMs)
})}\n`);

function runLegacyPipeline(text, passes) {
  const incoming = Buffer.from(text);
  const parsed = JSON.parse(incoming.toString("utf8"));
  const routed = JSON.parse(JSON.stringify(parsed));
  const forwarded = Buffer.from(`${JSON.stringify(routed)}\n`, "utf8");
  for (let index = 0; index < passes; index += 1) {
    JSON.parse(forwarded.toString("utf8"));
  }
}

function runOptimizedPipeline(text, passes) {
  const incoming = Buffer.from(text);
  parseJsonObjectSafe(incoming);
  const routed = takeJsonObject(incoming);
  const forwarded = serializeJsonBody(routed);
  for (let index = 0; index < passes; index += 1) {
    parseJsonObjectSafe(forwarded);
  }
}

function createPayload(targetBytes) {
  const messages = [];
  const content = "routing-payload-".repeat(256);
  while (Buffer.byteLength(JSON.stringify({ messages, model: "Provider/model", stream: true })) < targetBytes) {
    messages.push({ content, role: messages.length % 2 === 0 ? "user" : "assistant" });
  }
  return { messages, model: "Provider/model", stream: true };
}

function measure(run, count) {
  const startedAt = performance.now();
  for (let index = 0; index < count; index += 1) {
    run();
  }
  return performance.now() - startedAt;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
