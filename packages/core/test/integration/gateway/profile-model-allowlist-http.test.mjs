import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { GatewayHttpRequestHandler } from "@ccr/core/gateway/http/request-handler.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { profileApiKeyId } from "@ccr/core/profiles/api-key.ts";
import { waitForTcpListener } from "../../support/loopback-listener.mjs";

test("gateway HTTP model discovery and request access honor profile model allowlists", async (t) => {
  const config = createProfileAllowlistHttpTestConfig();
  const plugin = new ClaudeCodeRouterPlugin(config);
  const runtimeConfigRevision = "a".repeat(64);
  const runtimeConfigReloads = [];
  const status = {
    coreEndpoint: "http://127.0.0.1:1",
    endpoint: "http://127.0.0.1:0",
    state: "running"
  };
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test-core-token",
    getPlugin: () => plugin,
    getStatus: () => status
  });
  const handler = new GatewayHttpRequestHandler({
    getBrowserAutomationMcpIntegration: () => undefined,
    getConfig: () => config,
    getPlugin: () => plugin,
    getRuntimeConfigControlStatus: () => ({ revision: runtimeConfigRevision }),
    getStatus: () => status,
    handleBillingUsageSync: unsupportedHandler,
    handleRawTraceSync: unsupportedHandler,
    proxyRequest: (request, response, path, apiKey) => pipeline.proxyRequest(request, response, path, apiKey),
    requestRuntimeConfigReload: (expectedRevision, forceRestart) => {
      runtimeConfigReloads.push({ expectedRevision, forceRestart });
    },
    replayContextArchive: async () => ({ ok: false, statusCode: 404, message: "not configured" })
  });
  const server = createServer((request, response) => {
    void handler.handleRequest(request, response).catch((error) => {
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "application/json" });
      }
      response.end(JSON.stringify({ error: { message: String(error?.message ?? error) } }));
    });
  });

  try {
    try {
      await listen(server);
    } catch (error) {
      if (isLocalListenUnavailable(error)) {
        t.skip(`Local HTTP listen is unavailable: ${formatError(error)}`);
        return;
      }
      throw error;
    }
    await waitForTcpListener(server);
    const endpoint = `http://127.0.0.1:${serverPort(server)}`;
    status.endpoint = endpoint;

    const runtimeConfigStatus = await fetchJson(`${endpoint}/__ccr/runtime/config`, {
      headers: authHeaders("gateway-key")
    });
    assert.equal(runtimeConfigStatus.revision, runtimeConfigRevision);
    assert.equal(runtimeConfigStatus.state, "running");

    const deniedRuntimeConfigStatus = await fetch(`${endpoint}/__ccr/runtime/config`, {
      headers: authHeaders("profile-alpha-key")
    });
    assert.equal(deniedRuntimeConfigStatus.status, 403);

    const runtimeConfigReload = await fetch(`${endpoint}/__ccr/runtime/config`, {
      body: JSON.stringify({ configRevision: runtimeConfigRevision, forceRestart: true }),
      headers: {
        ...authHeaders("gateway-key"),
        "content-type": "application/json"
      },
      method: "POST"
    });
    assert.equal(runtimeConfigReload.status, 202, await runtimeConfigReload.text());
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(runtimeConfigReloads, [{ expectedRevision: runtimeConfigRevision, forceRestart: true }]);

    const alphaModels = await fetchJson(`${endpoint}/v1/models`, {
      headers: authHeaders("profile-alpha-key")
    });
    assert.deepEqual(alphaModels.data.map((model) => model.id), ["Provider/alpha"]);

    const betaModels = await fetchJson(`${endpoint}/v1/models`, {
      headers: authHeaders("profile-beta-key")
    });
    assert.deepEqual(betaModels.data.map((model) => model.id), ["Provider/beta"]);

    const gatewayModels = await fetchJson(`${endpoint}/v1/models`, {
      headers: authHeaders("gateway-key")
    });
    assert.deepEqual(gatewayModels.data.map((model) => model.id), ["Provider/alpha", "Provider/beta", "Provider/gamma"]);

    const claudeModels = await fetchJson(`${endpoint}/v1/models`, {
      headers: {
        ...authHeaders("profile-alpha-key"),
        "user-agent": "claude-cli/1.0"
      }
    });
    assert.deepEqual(claudeModels.data.map((model) => model.display_name), ["Provider/alpha"]);

    const claudeAppModels = await fetchJson(`${endpoint}/v1/models`, {
      headers: authHeaders("profile-alpha-claude-app-key")
    });
    const alphaClaudeAppRouteId = claudeAppModels.data[0]?.id;
    assert.equal(claudeAppModels.data.length, 1);
    assert.equal(typeof alphaClaudeAppRouteId, "string");
    assert.notEqual(alphaClaudeAppRouteId, "Provider/alpha");

    const bootstrap = await fetchJson(`${endpoint}/api/claude_cli/bootstrap`, {
      headers: authHeaders("profile-alpha-key")
    });
    assert.deepEqual(bootstrap.additional_model_options.map((model) => model.display_name), ["Provider/alpha"]);
    assert.deepEqual(Object.values(bootstrap.auto_compact_windows), []);

    const denied = await fetch(`${endpoint}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 8,
        messages: [{ role: "user", content: "hello" }],
        model: "Provider/beta"
      }),
      headers: {
        ...authHeaders("profile-alpha-key"),
        "content-type": "application/json"
      },
      method: "POST"
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 403);
    assert.equal(deniedBody.error.code, "profile_model_not_allowed");

    const limitedDenied = await fetch(`${endpoint}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 8,
        messages: [{ role: "user", content: "hello" }],
        model: "Provider/beta"
      }),
      headers: {
        ...authHeaders("profile-alpha-limited-key"),
        "content-type": "application/json"
      },
      method: "POST"
    });
    const limitedDeniedBody = await limitedDenied.json();
    assert.equal(limitedDenied.status, 403);
    assert.equal(limitedDeniedBody.error.code, "profile_model_not_allowed");

    const deniedCountTokens = await fetch(`${endpoint}/v1/messages/count_tokens`, {
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "Provider/beta"
      }),
      headers: {
        ...authHeaders("profile-alpha-key"),
        "content-type": "application/json"
      },
      method: "POST"
    });
    const deniedCountTokensBody = await deniedCountTokens.json();
    assert.equal(deniedCountTokens.status, 403);
    assert.equal(deniedCountTokensBody.error.code, "profile_model_not_allowed");

    const allowedClaudeAppCountTokens = await fetchJson(`${endpoint}/v1/messages/count_tokens`, {
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: alphaClaudeAppRouteId
      }),
      headers: {
        ...authHeaders("profile-alpha-claude-app-limited-key"),
        "content-type": "application/json"
      },
      method: "POST"
    });
    assert.equal(typeof allowedClaudeAppCountTokens.input_tokens, "number");
  } finally {
    await closeServer(server);
  }
});

function createProfileAllowlistHttpTestConfig() {
  const alphaProfile = {
    agent: "claude-code",
    enabled: true,
    id: "alpha-profile",
    model: "Provider/alpha",
    name: "Alpha Profile",
    scope: "global",
    availableModels: ["Provider/alpha"]
  };
  const betaProfile = {
    agent: "codex",
    enabled: true,
    id: "beta-profile",
    model: "Provider/beta",
    name: "Beta Profile",
    scope: "ccr",
    availableModels: ["Provider/beta"]
  };
  const config = createDefaultAppConfig();
  config.APIKEY = "gateway-key";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "gateway",
      key: "gateway-key",
      name: "Gateway"
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: profileApiKeyId(alphaProfile),
      key: "profile-alpha-key",
      name: "Profile: Alpha Profile"
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: profileApiKeyId(alphaProfile),
      key: "profile-alpha-limited-key",
      limits: { maxRequests: 1, windowMs: 60_000 },
      name: "Profile: Alpha Profile"
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: profileApiKeyId(alphaProfile),
      key: "profile-alpha-claude-app-key",
      name: "Claude App"
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: profileApiKeyId(alphaProfile),
      key: "profile-alpha-claude-app-limited-key",
      limits: { maxRequests: 1, windowMs: 60_000 },
      name: "Claude App"
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: profileApiKeyId(betaProfile),
      key: "profile-beta-key",
      name: "Profile: Beta Profile"
    }
  ];
  config.Providers = [{
    api_key: "test-provider-key",
    base_url: "http://127.0.0.1:1/v1",
    models: ["alpha", "beta", "gamma"],
    name: "Provider",
    type: "openai_responses"
  }];
  config.profile = {
    ...config.profile,
    enabled: true,
    profiles: [alphaProfile, betaProfile]
  };
  config.gateway.enabled = true;
  return config;
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function serverPort(server) {
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address);
  return address.port;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      error ? reject(error) : resolve();
    });
  });
}

async function unsupportedHandler() {
  throw new Error("not supported in this test");
}

function isLocalListenUnavailable(error) {
  return error && typeof error === "object" && (error.code === "EPERM" || error.code === "EACCES");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
