import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";

test("#1819 client-visible fallback error includes 429 and 404 before final model_resolution 400", async () => {
  const config = createDefaultAppConfig();
  config.observability.requestLogs = false;
  config.contextArchive.enabled = false;
  config.Providers = ["Primary", "Secondary", "Final"].map(name => ({ name, models: ["model"], type: "openai_chat_completions", api_base_url: "http://127.0.0.1:9/v1" }));
  config.Router.fallback = { mode: "model-chain", models: ["Secondary/model", "Final/model"], retryCount: 0 };
  const router = new ClaudeCodeRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined, getConfig: () => config, getCoreAuthToken: () => "test", getPlugin: () => router,
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" })
  });
  const previousFetch = globalThis.fetch;
  const statuses = [429, 404, 400];
  let calls = 0;
  globalThis.fetch = async (url) => {
    if (new URL(url).pathname.startsWith("/__ccr/")) return new Response(null, { status: 404 });
    const status = statuses[calls++];
    const body = JSON.stringify({ error: { message: "All target providers failed.", attempts: [{ stage: status === 400 ? "model_resolution" : "upstream_response", status, message: status === 400 ? "Unknown final model" : "upstream rejected" }] } });
    return new Response(body, { status, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), "retry-after": "0.001" } });
  };
  try {
    const request = Readable.from([Buffer.from(JSON.stringify({ model: "Primary/model", messages: [{ role: "user", content: "hi" }] }))]);
    request.method = "POST";
    request.url = "/v1/messages";
    request.headers = { "content-type": "application/json" };
    const chunks = [];
    let status;
    const response = new Writable({ write(chunk, _encoding, done) { chunks.push(chunk.toString()); done(); } });
    response.writeHead = (value) => { status = value; return response; };
    await pipeline.proxyRequest(request, response, "/v1/messages");
    assert.equal(calls, 3);
    assert.equal(status, 400);
    const payload = JSON.parse(chunks.join(""));
    assert.deepEqual(payload.error.attempts.map(attempt => attempt.status), statuses);
    assert.match(payload.error.message, /HTTP 429/);
    assert.match(payload.error.message, /HTTP 404/);
    assert.match(payload.error.message, /Unknown final model/);
  } finally { globalThis.fetch = previousFetch; }
});

test("gateway pipeline preserves response retrieval query parameters and encoded values", async () => {
  const config = createDefaultAppConfig();
  config.observability.requestLogs = false;
  config.contextArchive.enabled = false;
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test-core-token",
    getPlugin: () => ({}),
    getStatus: () => ({
      coreEndpoint: "http://127.0.0.1:3457",
      endpoint: "http://127.0.0.1:3456"
    })
  });
  const originalFetch = globalThis.fetch;
  const forwardedUrls = [];
  globalThis.fetch = async (url) => {
    forwardedUrls.push(String(url));
    return new Response(null, { status: 204 });
  };

  try {
    for (const requestUrl of [
      "/v1/responses/resp-test?stream=true&starting_after=42&include%5B%5D=reasoning.encrypted_content&include%5B%5D=message.output_text.logprobs",
      "/v1/responses/resp-test?custom=a%2Fb%26c%3Dd&custom=second",
      "/v1/responses/resp-test"
    ]) {
      const request = Readable.from([]);
      request.method = "GET";
      request.url = requestUrl;
      request.headers = {};
      const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
      response.writeHead = () => response;
      await pipeline.proxyRequest(request, response, new URL(requestUrl, "http://127.0.0.1").pathname);
      assert.equal(forwardedUrls.at(-1), `http://127.0.0.1:3457${requestUrl}`);
    }
    assert.equal(forwardedUrls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
