import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { ccrClientVisibleModelHeader } from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";
import { rawTraceSyncHeader } from "@ccr/core/gateway/internal/shared.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import { requestLogResponseModel } from "@ccr/core/observability/request-log-model.ts";
import { RawTraceSynchronizer } from "@ccr/core/observability/raw-trace-sync.ts";
import { UsageStore, usageStore } from "@ccr/core/usage/store.ts";

const clientModel = "claude-fable-5";
const pricing = { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 };

function createConfig(model) {
  const config = createDefaultAppConfig();
  config.contextArchive.enabled = false;
  config.observability.requestLogs = false;
  config.Providers = [{
    name: "Bailian",
    models: [model],
    modelMetadata: { [model]: { pricing } },
    capabilities: [{ type: "anthropic_messages", baseUrl: "https://example.test/v1/messages" }]
  }, { name: "ZHIPU", models: ["GLM-5.3"] }];
  return config;
}

function responseText(model, stream) {
  const message = { type: "message", model, content: [], usage: { input_tokens: 10, output_tokens: 5 } };
  return stream
    ? `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message })}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`
    : JSON.stringify(message);
}

for (const [model, stream] of [["glm-5.3", false], ["glm-5.3", true], ["ZHIPU/GLM-5.3", true]]) {
  test(`raw trace attributes ${stream ? "SSE" : "JSON"} usage and pricing to physical model ${model}`, async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "ccr-model-usage-"));
    const estimates = [];
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async (input) => { estimates.push(input); return undefined; }
    });
    t.mock.method(usageStore, "hasRequestId", (id) => store.hasRequestId(id));
    t.mock.method(usageStore, "recordCapture", (input) => store.recordCapture(input));
    const config = createConfig(model);
    config.observability.requestLogs = true;
    const synchronizer = new RawTraceSynchronizer({ getConfig: () => config, enqueueUpdate: () => true, spoolDirectory: dir });
    try {
      // The engine captures streaming bodies after the client model rewrite.
      await deliverTrace(synchronizer, dir, { model, stream, responseModel: stream ? clientModel : model });
      const stats = await store.getStats("24h", { includeProxy: true });
      assert.deepEqual(stats.models.map((row) => [row.model, row.requestCount, row.totalTokens]), [[model, 1, 15]]);
      assert.equal(estimates[0].model, model);
      assert.deepEqual(estimates[0].pricing, pricing);
    } finally {
      await synchronizer.stop();
      rmSync(dir, { force: true, recursive: true });
    }
  });
}

for (const requestBody of [undefined, '{"model":']) {
  test(`raw trace retains response attribution with ${requestBody ? "malformed" : "missing"} upstream body`, async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "ccr-model-usage-fallback-"));
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { estimateCost: async () => undefined });
    t.mock.method(usageStore, "hasRequestId", (id) => store.hasRequestId(id));
    t.mock.method(usageStore, "recordCapture", (input) => store.recordCapture(input));
    const config = createConfig("glm-5.3");
    config.observability.requestLogs = true;
    const synchronizer = new RawTraceSynchronizer({ getConfig: () => config, enqueueUpdate: () => true, spoolDirectory: dir });
    try {
      await deliverTrace(synchronizer, dir, { requestBody, responseModel: clientModel, stream: true });
      assert.equal((await store.getStats("24h", { includeProxy: true })).models[0].model, clientModel);
    } finally {
      await synchronizer.stop();
      rmSync(dir, { force: true, recursive: true });
    }
  });
}

for (const stream of [false, true]) {
  test(`raw trace preserves canonical ${stream ? "SSE" : "JSON"} response models when the model was not rewritten`, async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "ccr-model-usage-canonical-"));
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { estimateCost: async () => undefined });
    t.mock.method(usageStore, "hasRequestId", (id) => store.hasRequestId(id));
    t.mock.method(usageStore, "recordCapture", (input) => store.recordCapture(input));
    const config = createConfig("auto");
    config.observability.requestLogs = true;
    const synchronizer = new RawTraceSynchronizer({ getConfig: () => config, enqueueUpdate: () => true, spoolDirectory: dir });
    try {
      await deliverTrace(synchronizer, dir, { model: "auto", responseModel: "canonical-model", stream, rewriteMarker: !stream });
      assert.equal((await store.getStats("24h", { includeProxy: true })).models[0].model, "canonical-model");
    } finally {
      await synchronizer.stop();
      rmSync(dir, { force: true, recursive: true });
    }
  });
}

async function deliverTrace(synchronizer, dir, { model, requestBody = model ? JSON.stringify({ model }) : undefined, responseModel, stream, rewriteMarker = true }) {
  const bundleDirectory = path.join(dir, "bundle");
  mkdirSync(bundleDirectory);
  const contentType = stream ? "text/event-stream" : "application/json";
  const entries = {
    client_request_metadata: JSON.stringify({ headers: rewriteMarker ? { [ccrClientVisibleModelHeader]: clientModel } : {} }),
    upstream_request_metadata: JSON.stringify({ method: "POST", url: "https://example.test/v1/messages" }),
    ...(requestBody === undefined ? {} : { upstream_request: requestBody }),
    upstream_response_metadata: JSON.stringify({ statusCode: 200, headers: { "content-type": contentType } }),
    [stream ? "response_stream" : "upstream_response"]: responseText(responseModel, stream)
  };
  const parts = Object.entries(entries).map(([partType, text]) => {
    const filePath = path.join(bundleDirectory, partType);
    writeFileSync(filePath, text);
    return { filePath, partType, contentType: partType === "response_stream" ? contentType : "application/json", originalBytes: Buffer.byteLength(text) };
  });
  const request = Readable.from([JSON.stringify({ parts, requestId: "usage-request", target: { model: responseModel, providerName: "Bailian" } })]);
  request.method = "POST";
  request.headers = { [rawTraceSyncHeader]: synchronizer.token };
  let status;
  await synchronizer.handle(request, { writeHead(code) { status = code; }, end() {} });
  assert.equal(status, 202);
  await synchronizer.stop();
}

for (const stream of [false, true]) {
  test(`pipeline records ${stream ? "SSE" : "JSON"} usage before client model rewriting`, { timeout: 5_000 }, async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "ccr-pipeline-model-usage-"));
    const model = "glm-5.3";
    const config = createConfig(model);
    config.Router.rules = [{
      id: "route", name: "Route", enabled: true, type: "condition",
      condition: { left: "request.url", operator: "contains", right: "/v1" },
      rewrites: [{ key: "request.body.model", operation: "set", value: `Bailian/${model}` }]
    }];
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const plugin = new ClaudeCodeRouterPlugin(config);
    const pipeline = new GatewayRequestPipeline({
      getBrowserWebSearchMcpIntegration: () => undefined,
      getConfig: () => config,
      getCoreAuthToken: () => "test-core-token",
      getPlugin: () => plugin,
      getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" })
    });
    let finishCapture;
    const captured = new Promise((resolve) => { finishCapture = resolve; });
    t.mock.method(usageStore, "recordCapture", async (input) => {
      await store.recordCapture(input);
      finishCapture(input);
    });
    t.mock.method(globalThis, "fetch", async (url) => String(url).includes("/__ccr/route")
      ? new Response("", { status: 404 })
      : new Response(responseText(model, stream), { headers: { "content-type": stream ? "text/event-stream" : "application/json" } }));
    try {
      const request = Readable.from([JSON.stringify({ model: clientModel, stream, max_tokens: 8, messages: [{ role: "user", content: "hello" }] })]);
      request.method = "POST";
      request.url = "/v1/messages";
      request.headers = { "content-type": "application/json" };
      const chunks = [];
      const response = new Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); } });
      response.writeHead = (status) => { response.statusCode = status; return response; };
      const finished = new Promise((resolve) => response.once("finish", resolve));
      await pipeline.proxyRequest(request, response, "/v1/messages");
      await Promise.all([captured, finished]);
      assert.equal(response.statusCode, 200);
      if (stream) assert.equal(requestLogResponseModel(Buffer.concat(chunks).toString()), clientModel);
      const stats = await store.getStats("24h", { includeProxy: true });
      assert.deepEqual(stats.models.map((row) => [row.model, row.requestCount, row.totalTokens]), [[model, 1, 15]]);
      assert.ok(Math.abs(stats.totals.costUsd - 0.00002) < 1e-12);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
}
