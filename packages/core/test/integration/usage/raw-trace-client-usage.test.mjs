import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ccrClientIdentityHeader, ccrClientVisibleModelHeader } from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";
import { rawTraceSyncHeader } from "@ccr/core/gateway/internal/shared.ts";
import { RawTraceSynchronizer } from "@ccr/core/observability/raw-trace-sync.ts";
import { RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { UsageStore, usageStore } from "@ccr/core/usage/store.ts";

test("JSON and SSE traces retain key identity and physical model attribution", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-client-usage-"));
  const pricing = { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 };
  const estimates = [];
  const updates = [];
  const logs = new RequestLogStore(path.join(dir, "logs.sqlite"));
  const store = new UsageStore(path.join(dir, "usage.sqlite"), { estimateCost: async input => { estimates.push(input); return undefined; } });
  t.mock.method(usageStore, "hasRequestId", (requestId) => store.hasRequestId(requestId));
  t.mock.method(usageStore, "recordCapture", (input) => store.recordCapture(input));
  const config = createDefaultAppConfig();
  config.Providers = [{ name: "Provider", models: ["physical", "auto"], modelMetadata: { physical: { pricing } } }];
  config.observability.requestLogs = true;
  config.observability.requestLogBodyCapture = "all";
  const synchronizer = new RawTraceSynchronizer({
    allowStandaloneRequestLogs: () => true,
    enqueueUpdate: async (input, rawTraceFiles) => {
      updates.push(input);
      await logs.writeBatch([{ sequence: updates.length, kind: "raw-trace-update", input, rawTraceFiles }]);
      return true;
    },
    getConfig: () => config,
    spoolDirectory: dir
  });

  try {
    const identityHeader = {
      [ccrClientVisibleModelHeader]: "claude-sonnet-5-5",
      [ccrClientIdentityHeader]: Buffer.from(JSON.stringify({ id: "key-a", name: "Mac mini" })).toString("base64url")
    };
    for (const [requestId, headers, stream] of [
      ["explicit-client", { ...identityHeader, "x-ccr-client": "Mac mini", "user-agent": "codex-cli/1.0" }],
      ["inferred-client", { ...identityHeader, "user-agent": "codex-cli/1.0" }, true],
      ["missing-client", {}]
    ]) {
      await deliverBundle(synchronizer, dir, requestId, requestId, headers, stream);
    }
    const priced = (await logs.list()).items.filter(row => row.resolvedModel === "physical");
    assert.equal(priced.length, 2);
    assert.ok(priced.every(row => Math.abs((row.costUsd ?? 0) - 0.00002) < 1e-12));

    // A later trace must not add a second usage event or erase a known identity.
    await deliverBundle(synchronizer, dir, "replayed-client", "explicit-client", {});

    const stats = await store.getStats("24h", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 3);
    assert.equal(stats.totals.totalTokens, 45);
    assert.equal(updates[0].requestedModel, "claude-sonnet-5-5");
    assert.equal(updates[0].resolvedModel, "physical");
    assert.equal(stats.models.find(row => row.model === "physical").requestCount, 2);
    assert.equal(stats.models.find(row => row.model === "canonical").requestCount, 1);
    assert.deepEqual(estimates.filter(input => input.model === "physical").map(input => input.pricing), [pricing, pricing]);
    assert.deepEqual(
      stats.clientModels.map((row) => [row.client, row.requestCount, row.totalTokens]).sort(),
      [["Codex", 1, 15], ["Mac mini", 1, 15], ["unknown", 1, 15]]
    );
    assert.equal(stats.clients.length, 2);
    assert.equal(stats.clients[0].clientApiKeyId, "key-a");
    assert.equal(stats.clients[0].label, "Mac mini");
    assert.equal(stats.clients[0].totalTokens, 30);
    assert.equal(stats.clients[0].requestCount, 2);
    assert.equal(stats.clients[1].clientApiKeyId, undefined);
  } finally {
    await synchronizer.stop();
    await logs.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

async function deliverBundle(synchronizer, dir, bundleId, requestId, headers, stream = false) {
  const rewritten = Boolean(headers[ccrClientVisibleModelHeader]);
  const requestModel = rewritten ? "physical" : "auto";
  const responseModel = rewritten ? "claude-sonnet-5-5" : "canonical";
  const contentType = stream ? "text/event-stream" : "application/json";
  const message = { type: "message", model: responseModel, usage: { input_tokens: 10, output_tokens: 5 } };
  const bundleDirectory = path.join(dir, bundleId);
  mkdirSync(bundleDirectory);
  const parts = Object.entries({
    client_request_metadata: { headers },
    client_request: { model: rewritten ? responseModel : requestModel },
    upstream_request: { model: requestModel },
    upstream_request_metadata: { method: "POST", url: "https://example.test/v1/messages" },
    upstream_response_metadata: { headers: { "content-type": contentType }, statusCode: 200 },
    [stream ? "response_stream" : "upstream_response"]: stream
      ? "event: message_start\ndata: " + JSON.stringify({ type: "message_start", message }) + "\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
      : message
  }).map(([partType, body]) => {
    const filePath = path.join(bundleDirectory, `${partType}.json`);
    const text = typeof body === "string" ? body : JSON.stringify(body);
    writeFileSync(filePath, text);
    return { contentType: partType === "response_stream" ? contentType : "application/json", filePath, originalBytes: Buffer.byteLength(text), partType };
  });
  const request = Readable.from([JSON.stringify({
    parts,
    requestId: bundleId,
    target: { model: responseModel, providerName: "Provider" },
    turnKey: requestId
  })]);
  request.method = "POST";
  request.headers = { [rawTraceSyncHeader]: synchronizer.token };
  let status;
  await synchronizer.handle(request, {
    end() {},
    writeHead(statusCode) { status = statusCode; }
  });
  assert.equal(status, 202);
  await synchronizer.stop();
}
