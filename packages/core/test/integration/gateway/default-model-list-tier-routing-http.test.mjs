import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { GatewayHttpRequestHandler } from "@ccr/core/gateway/http/request-handler.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { profileApiKeyId } from "@ccr/core/profiles/api-key.ts";
import { waitForTcpListener } from "../../support/loopback-listener.mjs";

test("default model list tier routing covers every advertised protocol endpoint", async (t) => {
  const config = createDefaultModelListTierRoutingTestConfig();
  const plugin = new ClaudeCodeRouterPlugin(config);
  const coreRequests = [];
  const core = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        body = { unparsed: raw.slice(0, 200) };
      }
      coreRequests.push({ path: request.url, model: body?.model, stream: body?.stream });
      if (body?.stream) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `event: message_start\ndata: ${JSON.stringify({
            type: "message_start",
            message: { id: "msg_snapshot", model: body.model, role: "assistant", type: "message", content: [] }
          })}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`
        );
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        content: [{ text: "ok", type: "text" }],
        id: "msg_integration",
        model: body?.model ?? "unknown",
        role: "assistant",
        stop_reason: "end_turn",
        type: "message",
        usage: { input_tokens: 1, output_tokens: 1 }
      }));
    });
  });
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
    getRuntimeConfigControlStatus: () => ({}),
    getStatus: () => status,
    handleBillingUsageSync: async () => undefined,
    handleRawTraceSync: async (request, response) => {
      response.writeHead(202, { "content-type": "application/json" });
      response.end("{}");
    },
    proxyRequest: (request, response, path, apiKey) => pipeline.proxyRequest(request, response, path, apiKey),
    requestRuntimeConfigReload: () => undefined,
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
      await listen(core);
      await listen(server);
    } catch (error) {
      if (isLocalListenUnavailable(error)) {
        t.skip(`Local HTTP listen is unavailable: ${error}`);
        return;
      }
      throw error;
    }
    await waitForTcpListener(core);
    await waitForTcpListener(server);
    status.coreEndpoint = `http://127.0.0.1:${serverPort(core)}`;
    status.endpoint = `http://127.0.0.1:${serverPort(server)}`;
    const endpoint = status.endpoint;
    const profileHeaders = {
      "content-type": "application/json",
      "x-api-key": "profile-tier-key"
    };

    for (const path of ["/v1/models?limit=1000", "/models"]) {
      const desktopModels = await fetch(`${endpoint}${path}`, {
        headers: { ...profileHeaders, "user-agent": "Mozilla/5.0 Claude/2.9939.2 Electron/37.0.0" }
      });
      assert.equal(desktopModels.status, 200);
      const desktopPayload = await desktopModels.json();
      assert.equal(desktopPayload.data.length, 4);
      assert.ok(desktopPayload.data.every((entry) => !Object.hasOwn(entry, "description")));

      const cliModels = await fetch(`${endpoint}${path}`, {
        headers: { ...profileHeaders, "user-agent": "claude-cli/2.1.281 (external, cli)" }
      });
      assert.equal(cliModels.status, 200);
      const cliPayload = await cliModels.json();
      assert.ok(cliPayload.data.every((entry) => typeof entry.description === "string"));
      assert.deepEqual(cliPayload, {
        ...desktopPayload,
        data: desktopPayload.data.map((entry, index) => ({ ...entry, description: cliPayload.data[index].description }))
      });
    }

    const messages = await fetch(`${endpoint}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 8,
        messages: [{ role: "user", content: "hello" }],
        model: "claude-sonnet-5[1m]"
      }),
      headers: { ...profileHeaders, "user-agent": "claude-cli/1.0" },
      method: "POST"
    });
    const messagesText = await messages.text();
    assert.equal(messages.status, 200, messagesText);
    // Non-streaming responses keep the client-visible tier name: the mock core
    // echoes the routed slot target ("sonnet-target") as the model.
    assert.equal(JSON.parse(messagesText).model, "claude-sonnet-5[1m]");

    const chatCompletions = await fetch(`${endpoint}/v1/chat/completions`, {
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "claude-sonnet-5"
      }),
      headers: profileHeaders,
      method: "POST"
    });
    assert.equal(chatCompletions.status, 200, await chatCompletions.text());

    const responses = await fetch(`${endpoint}/v1/responses`, {
      body: JSON.stringify({
        input: "hello",
        model: "claude-sonnet-5[1m]"
      }),
      headers: profileHeaders,
      method: "POST"
    });
    assert.equal(responses.status, 200, await responses.text());

    const snapshotModel = "claude-haiku-4-5-20251001";
    const snapshotRequests = [
      { path: "/v1/messages", stream: false },
      { path: "/v1/messages", stream: true },
      { path: "/v1/chat/completions", stream: false },
      { path: "/v1/responses", stream: false }
    ];
    for (const { path, stream } of snapshotRequests) {
      const result = await fetch(`${endpoint}${path}`, {
        body: JSON.stringify({
          ...(path === "/v1/responses" ? { input: "hello" } : { max_tokens: 8, messages: [{ role: "user", content: "hello" }] }),
          model: snapshotModel,
          stream
        }),
        headers: { ...profileHeaders, "user-agent": "claude-cli/1.0" },
        method: "POST"
      });
      const text = await result.text();
      assert.equal(result.status, 200, `${path}: ${text}`);
      if (path === "/v1/messages") {
        if (stream) {
          assert.match(text, /"model":"claude-haiku-4-5-20251001"/);
          assert.doesNotMatch(text, /"model":"qwen3.6-plus"/);
          assert.match(text, /event: message_stop/);
        } else {
          assert.equal(JSON.parse(text).model, snapshotModel);
        }
      }
    }

    const updatedTierCases = [
      { model: "claude-fable-5-1", target: "fable-target" },
      { model: "claude-fable-5-1[1m]", target: "fable-target" },
      { model: "claude-opus-5-5", target: "opus-target" },
      { model: "claude-opus-5-5[1m]", target: "opus-target" },
      { model: "claude-haiku-4-5", target: "qwen3.6-plus" }
    ];
    for (const { model } of updatedTierCases) {
      for (const stream of [false, true]) {
        const result = await fetch(`${endpoint}/v1/messages`, {
          body: JSON.stringify({ max_tokens: 8, messages: [{ role: "user", content: "hello" }], model, stream }),
          headers: { ...profileHeaders, "user-agent": "claude-cli/2.1.281" },
          method: "POST"
        });
        const text = await result.text();
        assert.equal(result.status, 200, `${model}: ${text}`);
        if (stream) {
          assert.ok(text.includes(`"model":${JSON.stringify(model)}`), text);
          assert.match(text, /event: message_stop/);
        } else {
          assert.equal(JSON.parse(text).model, model);
        }
      }
      const counted = await fetchJson(`${endpoint}/v1/messages/count_tokens`, {
        body: JSON.stringify({ messages: [{ role: "user", content: "hello" }], model }),
        headers: profileHeaders,
        method: "POST"
      });
      assert.equal(typeof counted.input_tokens, "number");
    }

    const models = await fetchJson(`${endpoint}/v1/models`, {
      headers: { "x-api-key": "profile-tier-key", "user-agent": "claude-cli/1.0" }
    });
    assert.deepEqual(
      models.data.map((entry) => entry.id),
      ["claude-fable-5-1[1m]", "claude-opus-5-5[1m]", "claude-sonnet-5[1m]", "claude-haiku-4-5-20251001"]
    );
    assert.equal(models.data.find((entry) => entry.id === "claude-haiku-4-5-20251001").description, "Haiku 4.5 · Fastest for quick answers");

    const countTokens = await fetchJson(`${endpoint}/v1/messages/count_tokens`, {
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "claude-sonnet-5[1m]"
      }),
      headers: { ...profileHeaders, "user-agent": "claude-cli/1.0" },
      method: "POST"
    });
    assert.equal(typeof countTokens.input_tokens, "number");

    const snapshotCountTokens = await fetchJson(`${endpoint}/v1/messages/count_tokens`, {
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }], model: snapshotModel }),
      headers: profileHeaders,
      method: "POST"
    });
    assert.equal(typeof snapshotCountTokens.input_tokens, "number");

    // The routing preflight also reaches the mock core (/__ccr/route); only
    // the forwarded inference bodies matter, and they arrive provider-
    // normalized to the corresponding profile slot targets.
    const inferenceModels = coreRequests
      .filter((entry) => entry.path !== "/__ccr/route")
      .map((entry) => entry.model);
    assert.deepEqual(inferenceModels, [
      "sonnet-target", "sonnet-target", "sonnet-target",
      "qwen3.6-plus", "qwen3.6-plus", "qwen3.6-plus", "qwen3.6-plus",
      ...updatedTierCases.flatMap(({ target }) => [target, target])
    ]);
    assert.deepEqual(
      coreRequests.filter((entry) => entry.path !== "/__ccr/route" && entry.stream),
      [
        { path: "/v1/messages", model: "qwen3.6-plus", stream: true },
        ...updatedTierCases.map(({ target }) => ({ path: "/v1/messages", model: target, stream: true }))
      ]
    );
  } finally {
    await closeServer(server);
    await closeServer(core);
  }
});

function createDefaultModelListTierRoutingTestConfig() {
  const profile = {
    agent: "claude-code",
    availableModels: ["Prov/default-model"],
    claudeDefaultModelList: true,
    enabled: true,
    fableModel: "Prov/fable-target",
    haikuModel: "Prov/qwen3.6-plus",
    id: "tier-profile",
    model: "Prov/default-model",
    name: "Tier Profile",
    opusModel: "Prov/opus-target",
    scope: "global",
    sonnetModel: "Prov/sonnet-target"
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
      id: profileApiKeyId(profile),
      key: "profile-tier-key",
      name: "Profile: Tier Profile"
    }
  ];
  config.Providers = [
    {
      api_base_url: "http://127.0.0.1:9",
      api_key: "provider-key",
      enabled: true,
      models: ["default-model", "fable-target", "opus-target", "sonnet-target", "qwen3.6-plus"],
      name: "Prov"
    }
  ];
  config.profile = {
    ...config.profile,
    enabled: true,
    profiles: [profile]
  };
  return config;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, method: options.method ?? "GET" });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text);
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function serverPort(server) {
  return server.address().port;
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

function isLocalListenUnavailable(error) {
  return Boolean(error && (error.code === "EACCES" || error.code === "EADDRNOTAVAIL" || error.code === "ENETDOWN"));
}
