import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { gzipSync } from "node:zlib";
import type { WebContents } from "electron";
import {
  claudeDesignBackendRequestForCdp,
  claudeDesignCdpFetchPatterns,
  claudeDesignCdpOptionsFromStatus,
  claudeDesignRedirectUrlForRequest,
  claudePluginAdminPath,
  configureClaudeDesignWindowCdp,
  gatewayAuthHeadersForTest
} from "@ccr/electron/main/claude-design-window.ts";

test("Claude browser plugin status paths are selected per plugin", () => {
  assert.equal(claudePluginAdminPath("claude-design"), "/plugins/claude-design");
  assert.equal(claudePluginAdminPath("claude-ship"), "/plugins/claude-ship");
  assert.throws(() => claudePluginAdminPath("unknown-plugin"), /not supported/);
});

test("Claude Design window CDP options are derived from plugin status", () => {
  const options = claudeDesignCdpOptionsFromStatus({
    backend: "http://127.0.0.1:45678",
    proxy: {
      fallbackHosts: ["claude.com", "www.anthropic.com"],
      host: "claude.ai",
      paths: ["/design", "/v1/design", "/api"]
    },
    frontendUrl: "http://127.0.0.1:6173/design"
  });

  assert.deepEqual(options, {
    backendUrl: "http://127.0.0.1:45678/",
    hosts: ["claude.ai", "127.0.0.1:6173", "claude.com", "www.anthropic.com"],
    paths: ["/design", "/v1/design", "/api"]
  });
});

test("Claude Design window CDP rewrites matching Claude requests to the local backend", () => {
  const options = {
    backendUrl: "http://127.0.0.1:45678/",
    hosts: ["claude.ai", "claude.com"],
    paths: ["/design", "/api", "/_t"]
  };

  assert.equal(
    claudeDesignRedirectUrlForRequest("https://claude.ai/design/p/abc?tab=preview", options),
    "http://127.0.0.1:45678/design/p/abc?tab=preview"
  );
  assert.equal(
    claudeDesignRedirectUrlForRequest("https://claude.com/api/bootstrap/org/app_start", options),
    "http://127.0.0.1:45678/api/bootstrap/org/app_start"
  );
  assert.equal(
    claudeDesignRedirectUrlForRequest(
      "https://claude.ai/_t/541cb539-11c0-4789-9d87-bfa6c87153aa/v1/design/projects/8964ff52-6e42-4b71-9247-1b7c18baee70/serve/index.html?srcmap=1",
      options
    ),
    "http://127.0.0.1:45678/_t/541cb539-11c0-4789-9d87-bfa6c87153aa/v1/design/projects/8964ff52-6e42-4b71-9247-1b7c18baee70/serve/index.html?srcmap=1"
  );
  assert.equal(
    claudeDesignRedirectUrlForRequest("http://127.0.0.1:6173/design/v1/design/projects/project-1/events?tab=tab-1", {
      ...options,
      hosts: [...options.hosts, "127.0.0.1:6173"]
    }),
    "http://127.0.0.1:45678/design/v1/design/projects/project-1/events?tab=tab-1"
  );
  assert.equal(
    claudeDesignRedirectUrlForRequest("https://claude.ai/", options),
    "http://127.0.0.1:45678/"
  );
  assert.equal(claudeDesignRedirectUrlForRequest("https://claude.ai/settings", options), undefined);
  assert.equal(claudeDesignRedirectUrlForRequest("https://example.com/design", options), undefined);
});

test("Claude Design window CDP enables Fetch interception for configured hosts", () => {
  assert.deepEqual(claudeDesignCdpFetchPatterns({ hosts: ["claude.ai", "claude.ai", "claude.com"] }), [
    { requestStage: "Request", urlPattern: "https://claude.ai/*" },
    { requestStage: "Request", urlPattern: "http://claude.ai/*" },
    { requestStage: "Request", urlPattern: "https://claude.com/*" },
    { requestStage: "Request", urlPattern: "http://claude.com/*" }
  ]);
});

test("Claude Design window CDP unwraps gzip post data before proxying to the backend", () => {
  const body = Buffer.from("connect-protobuf-body");
  const request = claudeDesignBackendRequestForCdp("POST", {
    headers: {
      "Content-Encoding": "gzip",
      "Content-Length": String(gzipSync(body).length),
      "Content-Type": "application/proto"
    },
    postData: gzipSync(body).toString("latin1"),
    url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat"
  });

  assert.deepEqual(request.body, body);
  assert.deepEqual(request.headers, {
    "Content-Type": "application/proto"
  });
});

test("Claude Design window CDP reads binary post data entries before proxying to the backend", () => {
  const body = Buffer.from("connect-protobuf-body-from-entry");
  const gzipped = gzipSync(body);
  const request = claudeDesignBackendRequestForCdp("POST", {
    headers: {
      "content-encoding": "gzip",
      "content-type": "application/connect+proto"
    },
    postDataEntries: [{ bytes: gzipped.toString("base64") }],
    url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat"
  });

  assert.deepEqual(request.body, body);
  assert.deepEqual(request.headers, {
    "content-type": "application/connect+proto"
  });
});

test("Claude Design window status auth falls back to persisted gateway API keys", () => {
  assert.deepEqual(
    gatewayAuthHeadersForTest({ APIKEY: "", APIKEYS: [], plugins: [] } as any, [{ key: "persisted-key" }]),
    { authorization: "Bearer persisted-key" }
  );
  assert.deepEqual(
    gatewayAuthHeadersForTest({ APIKEY: "config-key", APIKEYS: [], plugins: [] } as any, [{ key: "persisted-key" }]),
    { authorization: "Bearer config-key" }
  );
});

test("Claude browser SSE requests use Chromium transport without reading the response in the main process", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Streaming requests must stay in Chromium's network stack.");
  });
  const fixture = await createCdpFixture();

  await fixture.pause({
    requestId: "ship-stream",
    request: {
      method: "GET",
      url: "https://claude.ai/v1/sessions/sse/session-1/stream?cursor=2",
      headers: { accept: "text/event-stream", host: "claude.ai" }
    }
  });

  assert.deepEqual(fixture.commands, [{
    method: "Fetch.continueRequest",
    params: {
      requestId: "ship-stream",
      url: "http://127.0.0.1:45678/v1/sessions/sse/session-1/stream?cursor=2",
      interceptResponse: true,
      method: "GET",
      headers: [{ name: "accept", value: "text/event-stream" }]
    }
  }]);
});

test("Claude browser Connect Chat streams preserve binary POST data without an SSE Accept header", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Connect Chat responses must stream without a main-process fetch.");
  });
  const fixture = await createCdpFixture();
  const body = Buffer.from([0, 255, 17, 128, 65]);
  await fixture.pause({
    requestId: "design-chat",
    request: {
      method: "POST",
      url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat",
      headers: { accept: "*/*", "content-encoding": "gzip", "content-length": "100", "content-type": "application/connect+proto" },
      postDataEntries: [{ bytes: gzipSync(body).toString("base64") }]
    }
  });

  assert.deepEqual(fixture.commands, [{
    method: "Fetch.continueRequest",
    params: {
      requestId: "design-chat",
      url: "http://127.0.0.1:45678/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat",
      interceptResponse: true,
      method: "POST",
      headers: [{ name: "accept", value: "*/*" }, { name: "content-type", value: "application/connect+proto" }],
      postData: body.toString("base64")
    }
  }]);
});

test("Claude browser requests outside local routes continue unchanged", async () => {
  const fixture = await createCdpFixture();
  await fixture.pause({ requestId: "remote", request: { method: "GET", url: "https://claude.ai/settings", headers: {} } });
  assert.deepEqual(fixture.commands, [{ method: "Fetch.continueRequest", params: { requestId: "remote" } }]);
});

test("Claude browser bundled Design streams use native transport with fetch's default Accept header", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Bundled streaming endpoints must not buffer their responses.");
  });
  const fixture = await createCdpFixture();
  for (const [method, path] of [
    ["GET", "/v1/design/projects/test/events"],
    ["GET", "/design/v1/design/projects/test/events"],
    ["GET", "/_t/preview/v1/design/projects/test/events"],
    ["GET", "/design/_t/preview/v1/design/projects/test/events"],
    ["POST", "/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat"],
    ["POST", "/v1/design/artifact-proxy/v1/messages"],
    ["POST", "/design/v1/design/artifact-proxy/v1/messages"]
  ]) {
    await fixture.pause({ requestId: path, request: { method, url: `https://claude.ai${path}`, headers: { accept: "*/*" } } });
    assert.equal(fixture.commands.at(-1)?.method, "Fetch.continueRequest");
    assert.equal(fixture.commands.at(-1)?.params.url, `http://127.0.0.1:45678${path}`);
  }
});

test("Claude browser nonstream responses retain original-origin cookie handling", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("signed in", {
    headers: { "content-type": "text/plain", "set-cookie": "session=local; Secure; Path=/" }
  }));
  const fixture = await createCdpFixture();
  await fixture.pause({ requestId: "login", request: { method: "POST", url: "https://claude.ai/design/login", headers: {} } });
  assert.equal(fixture.commands.length, 1);
  assert.equal(fixture.commands[0].method, "Fetch.fulfillRequest");
  assert.equal(fixture.commands[0].params.body, Buffer.from("signed in").toString("base64"));
  assert.ok(fixture.commands[0].params.responseHeaders.some((header: { name: string; value: string }) =>
    header.name === "set-cookie" && header.value === "session=local; Secure; Path=/"
  ));
});

test("Claude browser SSE response headers resume without waiting for the stream to finish", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("The main process must not consume a streaming response.");
  });
  const fixture = await createCdpFixture();
  await fixture.pause({ requestId: "stream", networkId: "network-stream", request: { method: "GET", url: "https://claude.ai/v1/sessions/sse/test/stream" } });
  await fixture.pause({
    requestId: "stream",
    request: { method: "GET", url: "http://127.0.0.1:45678/v1/sessions/sse/test/stream" },
    responseStatusCode: 200,
    responseHeaders: [{ name: "content-type", value: "text/event-stream" }]
  });
  assert.deepEqual(fixture.commands[1], { method: "Fetch.continueResponse", params: { requestId: "stream" } });
});

test("Claude browser backend redirects keep the frontend origin and do not retain the backend port", async () => {
  const fixture = await createCdpFixture();
  for (const location of ["../landed?tab=1", "http://127.0.0.1:45678/design/landed?tab=1"]) {
    await fixture.pause({ requestId: "redirect", request: { method: "GET", url: "https://claude.ai/design/login/start", headers: { accept: "text/event-stream" } } });
    await fixture.pause({
      requestId: "redirect",
      request: { method: "GET", url: "http://127.0.0.1:45678/design/login/start" },
      responseStatusCode: 302,
      responseStatusText: "Found",
      responseHeaders: [{ name: "Location", value: location }, { name: "set-cookie", value: "session=local" }]
    });
    assert.deepEqual(fixture.commands.at(-1), {
      method: "Fetch.fulfillRequest",
      params: {
        requestId: "redirect",
        body: "",
        responseCode: 302,
        responsePhrase: "Found",
        responseHeaders: [{ name: "Location", value: "https://claude.ai/design/landed?tab=1" }, { name: "set-cookie", value: "session=local" }]
      }
    });
  }
});

test("Claude browser explicit external redirects remain unchanged", async () => {
  const fixture = await createCdpFixture();
  await fixture.pause({ requestId: "redirect", request: { method: "GET", url: "https://claude.ai/design/login", headers: { accept: "text/event-stream" } } });
  await fixture.pause({
    requestId: "redirect",
    request: { method: "GET", url: "http://127.0.0.1:45678/design/login" },
    responseStatusCode: 302,
    responseHeaders: [{ name: "Location", value: "https://auth.example.com/login" }]
  });
  assert.equal(fixture.commands.at(-1)?.params.responseHeaders[0].value, "https://auth.example.com/login");
});

test("Claude browser failed rewrites fail locally without retrying the original remote URL", async () => {
  const fixture = await createCdpFixture(true);
  await fixture.pause({
    requestId: "failed",
    request: { method: "POST", url: "https://claude.ai/v1/sessions/test/events", headers: { accept: "text/event-stream" }, postData: "private project data" }
  });
  assert.deepEqual(fixture.commands.map(({ method }) => method), ["Fetch.continueRequest", "Fetch.failRequest"]);
  assert.deepEqual(fixture.commands[1].params, { requestId: "failed", errorReason: "Failed" });
});

async function createCdpFixture(rejectRewrite = false) {
  const commands: Array<{ method: string; params: any }> = [];
  const debuggerApi = Object.assign(new EventEmitter(), {
    isAttached: () => true,
    sendCommand: async (method: string, params: any) => {
      commands.push({ method, params });
      if (rejectRewrite && method === "Fetch.continueRequest" && params.url) {
        throw new Error("Rewrite rejected");
      }
    }
  });
  const webContents = Object.assign(new EventEmitter(), {
    debugger: debuggerApi,
    id: 42,
    session: { webRequest: { onBeforeRequest: () => undefined } }
  }) as unknown as WebContents;
  await configureClaudeDesignWindowCdp(webContents, {
    backendUrl: "http://127.0.0.1:45678/",
    hosts: ["claude.ai"],
    paths: ["/v1/sessions", "/v1/design", "/design", "/_t"],
    logger: { info: () => undefined, warn: () => undefined }
  });
  commands.length = 0;
  return {
    commands,
    pause: async (params: unknown) => {
      debuggerApi.emit("message", {}, "Fetch.requestPaused", params);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };
}
