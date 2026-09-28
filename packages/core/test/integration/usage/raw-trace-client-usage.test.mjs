import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ccrClientIdentityHeader } from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";
import { rawTraceSyncHeader } from "@ccr/core/gateway/internal/shared.ts";
import { RawTraceSynchronizer } from "@ccr/core/observability/raw-trace-sync.ts";
import { UsageStore, usageStore } from "@ccr/core/usage/store.ts";

test("raw trace usage retains client attribution and only missing identities stay unknown", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-raw-trace-client-usage-"));
  const store = new UsageStore(path.join(dir, "usage.sqlite"), { estimateCost: async () => undefined });
  t.mock.method(usageStore, "hasRequestId", (requestId) => store.hasRequestId(requestId));
  t.mock.method(usageStore, "recordCapture", (input) => store.recordCapture(input));
  const config = createDefaultAppConfig();
  config.observability.requestLogs = true;
  config.observability.requestLogBodyCapture = "all";
  const synchronizer = new RawTraceSynchronizer({
    enqueueUpdate: () => true,
    getConfig: () => config,
    spoolDirectory: dir
  });

  try {
    const identityHeader = {
      [ccrClientIdentityHeader]: Buffer.from(JSON.stringify({ id: "key-a", name: "Mac mini" })).toString("base64url")
    };
    for (const [requestId, headers] of [
      ["explicit-client", { ...identityHeader, "x-ccr-client": "Mac mini", "user-agent": "codex-cli/1.0" }],
      ["inferred-client", { ...identityHeader, "user-agent": "codex-cli/1.0" }],
      ["missing-client", {}]
    ]) {
      await deliverBundle(synchronizer, dir, requestId, requestId, headers);
    }

    // A later trace must not add a second usage event or erase a known identity.
    await deliverBundle(synchronizer, dir, "replayed-client", "explicit-client", {});

    const stats = await store.getStats("24h", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 3);
    assert.equal(stats.totals.totalTokens, 45);
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
    rmSync(dir, { force: true, recursive: true });
  }
});

async function deliverBundle(synchronizer, dir, bundleId, requestId, headers) {
  const bundleDirectory = path.join(dir, bundleId);
  mkdirSync(bundleDirectory);
  const parts = Object.entries({
    client_request_metadata: { headers },
    upstream_request_metadata: { method: "POST", url: "https://example.test/v1/chat/completions" },
    upstream_response_metadata: { headers: { "content-type": "application/json" }, statusCode: 200 },
    upstream_response: { model: "test-model", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }
  }).map(([partType, body]) => {
    const filePath = path.join(bundleDirectory, `${partType}.json`);
    const text = JSON.stringify(body);
    writeFileSync(filePath, text);
    return { contentType: "application/json", filePath, originalBytes: Buffer.byteLength(text), partType };
  });
  const request = Readable.from([JSON.stringify({
    parts,
    requestId: bundleId,
    target: { model: "test-model", providerName: "test-provider" },
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
