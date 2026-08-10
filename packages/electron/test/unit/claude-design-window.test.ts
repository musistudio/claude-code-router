import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  claudeDesignBackendRequestForCdp,
  claudeDesignCdpFetchPatterns,
  claudeDesignCdpOptionsFromStatus,
  claudeDesignRedirectUrlForRequest,
  claudePluginAdminPath,
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
