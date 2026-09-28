import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";

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
