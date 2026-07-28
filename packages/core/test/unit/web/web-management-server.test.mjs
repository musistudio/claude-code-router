import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExternalHttpTarget, startWebManagementServer } from "@ccr/core/web/management-server.ts";

test("normalizeExternalHttpTarget accepts absolute http, https, and CCR plugin URLs only", () => {
  assert.equal(normalizeExternalHttpTarget(""), undefined);
  assert.equal(normalizeExternalHttpTarget(undefined), undefined);
  assert.equal(normalizeExternalHttpTarget("about:blank"), undefined);
  assert.equal(normalizeExternalHttpTarget(" https://example.com/path?q=1 "), "https://example.com/path?q=1");
  assert.equal(normalizeExternalHttpTarget("http://localhost:3458/"), "http://localhost:3458/");
  assert.throws(() => normalizeExternalHttpTarget("file:///etc/passwd"), /Only http, https, and CCR plugin URLs/);
  assert.throws(() => normalizeExternalHttpTarget("javascript:alert(1)"), /Only http, https, and CCR plugin URLs/);
  assert.throws(() => normalizeExternalHttpTarget("example.com"), /valid absolute URL/);
});

test("web RPC ignores Origin and Referer when the auth token is valid", async () => {
  const authToken = "test-web-auth-token";
  const runtime = await startWebManagementServer({
    authToken,
    host: "127.0.0.1",
    port: 0,
    startGateway: false
  });
  try {
    const endpoint = new URL("/api/ccr/rpc", runtime.url);
    const response = await fetch(endpoint, {
      body: JSON.stringify({ args: [], method: "getAppInfo" }),
      headers: {
        "content-type": "application/json",
        "origin": "http://127.0.0.1:8000",
        "referer": "http://127.0.0.1:8000/",
        "x-ccr-web-auth": authToken
      },
      method: "POST"
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.value.name, "Claude Code Router");
  } finally {
    await runtime.close();
  }
});
