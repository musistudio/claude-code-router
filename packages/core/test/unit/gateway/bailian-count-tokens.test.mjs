import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/router-plugin.ts";
import { GatewayHttpRequestHandler } from "@ccr/core/gateway/http/request-handler.ts";

const payload = {
  model: "claude-count-alias",
  thinking: { type: "adaptive", display: "updates" },
  output_config: { effort: "high" },
  system: [{ type: "text", text: "Be concise.", cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  tools: [{ name: "get_time", input_schema: { type: "object", properties: {} } }],
  future_option: { preserve: true }
};

function configFor(baseUrl = "https://ws-test.cn-beijing.maas.aliyuncs.com/apps/anthropic") {
  const config = createDefaultAppConfig();
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "count-client", key: "client-key" }];
  config.profile.profiles = [];
  config.Providers = [{
    id: "bailian", name: "Bailian", models: ["qwen3.7-plus"],
    api_key: "provider-key", capabilities: [{ baseUrl, type: "anthropic_messages" }]
  }];
  config.Router.builtInRules = { "claude-code": { enabled: false }, codex: { enabled: false } };
  config.Router.rules = [{
    id: "map-count-model", name: "Map count model", type: "condition", enabled: true,
    condition: { left: "request.url", operator: "contains", right: "/v1/messages" },
    rewrites: [{ key: "request.body.model", operation: "set", value: "bailian/qwen3.7-plus" }]
  }];
  return config;
}

function requestHeaders() {
  return {
    "content-type": "application/json", "x-api-key": "client-key", authorization: "Bearer client-key",
    cookie: "client-cookie", "x-ccr-routed-model": "attacker/model", "x-auth-api-key-id": "attacker",
    "anthropic-beta": "future-feature", "anthropic-version": "2023-06-01", "x-client-custom": "preserve"
  };
}

class Capture extends Writable {
  constructor() { super(); this.headers = {}; this.chunks = []; this.statusCode = 0; }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; }
  getHeader(name) { return this.headers[name.toLowerCase()]; }
  writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); return this; }
  _write(chunk, _encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
  text() { return Buffer.concat(this.chunks).toString(); }
}

async function invoke(mode, config, body = payload, headers = requestHeaders()) {
  if (mode === "single") {
    const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
    const route = plugin.httpRoutes.find((entry) => entry.path === "/v1/messages/count_tokens");
    const response = { statusCode: 200, headers: {} };
    const reply = {
      header(name, value) { response.headers[name] = value; return this; },
      code(code) { response.statusCode = code; return this; },
      send(value) { response.body = value; return value; }
    };
    const result = await route.handler({ request: { method: "POST", url: route.path, headers, body }, reply });
    response.body ??= result;
    response.text = () => Buffer.isBuffer(response.body) ? response.body.toString() : JSON.stringify(response.body);
    return response;
  }
  const router = new ClaudeCodeRouterPlugin(config);
  const handler = new GatewayHttpRequestHandler({
    getConfig: () => config, getPlugin: () => router, getBrowserAutomationMcpIntegration: () => undefined,
    getRuntimeConfigControlStatus: () => ({}),
    getStatus: () => ({ endpoint: "http://127.0.0.1:3456", coreEndpoint: "http://127.0.0.1:3457", state: "running" }),
    handleBillingUsageSync: async () => {}, handleRawTraceSync: async () => {}, requestRuntimeConfigReload: () => {},
    replayContextArchive: async () => ({ ok: false, statusCode: 404, message: "disabled" }),
    proxyRequest: async () => { throw new Error("Counting must not enter the inference proxy."); }
  });
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(request, { headers, method: "POST", url: "/v1/messages/count_tokens" });
  const response = new Capture();
  await handler.handleRequest(request, response);
  return response;
}

test("both count endpoints send mapped Bailian requests with upstream credentials", async (t) => {
  const calls = [];
  const upstreamBody = '{ "input_tokens": 261, "future": "kept" }';
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(upstreamBody, { headers: {
      "content-type": "application/json", "x-request-id": "count-id", "content-length": "123", "content-encoding": "gzip"
    } });
  });
  for (const mode of ["single", "wrapper"]) {
    const result = await invoke(mode, configFor());
    assert.equal(result.statusCode, 200);
    assert.equal(result.text(), upstreamBody);
    assert.equal(result.headers["x-request-id"], "count-id");
    assert.equal(result.headers["content-length"], undefined);
    assert.equal(result.headers["content-encoding"], undefined);
  }
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.equal(url, "https://ws-test.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages/count_tokens");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.deepEqual(JSON.parse(init.body), { ...payload, model: "qwen3.7-plus", thinking: { ...payload.thinking, type: "enabled" } });
    assert.equal(init.headers["x-api-key"], "provider-key");
    assert.equal(init.headers["anthropic-beta"], "future-feature");
    assert.equal(init.headers["x-client-custom"], "preserve");
    for (const name of ["authorization", "cookie", "x-auth-api-key-id", "x-ccr-routed-model"]) assert.equal(init.headers[name], undefined, name);
  }
  assert.equal(payload.model, "claude-count-alias");
  assert.equal(payload.thinking.type, "adaptive");
});

test("non-Bailian and OpenAI-only providers retain local estimation", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must stay local"); });
  for (const mode of ["single", "wrapper"]) {
    const config = configFor("https://api.example.com/anthropic");
    assert.equal(typeof JSON.parse((await invoke(mode, config)).text()).input_tokens, "number");
    config.Providers[0].capabilities = [{ type: "openai_chat_completions", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" }];
    assert.equal(typeof JSON.parse((await invoke(mode, config)).text()).input_tokens, "number");
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("both entry points preserve upstream failures instead of estimating", async (t) => {
  let status = 429;
  t.mock.method(globalThis, "fetch", async () => new Response('{"error":{"message":"upstream failure"}}', {
    status, headers: { "content-type": "application/json", "retry-after": "7" }
  }));
  for (const mode of ["single", "wrapper"]) {
    for (status of [429, 500]) {
      const result = await invoke(mode, configFor());
      assert.equal(result.statusCode, status);
      assert.equal(result.headers["retry-after"], "7");
      assert.equal(result.text(), '{"error":{"message":"upstream failure"}}');
    }
  }
});

test("profile restrictions reject count requests before reaching Bailian", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not reach upstream"); });
  for (const mode of ["single", "wrapper"]) {
    const config = configFor();
    config.APIKEYS[0].id = "profile:restricted";
    config.profile.profiles = [{ id: "restricted", enabled: true, agent: "claude-code", model: "other/model", availableModels: ["other/model"], scope: "ccr" }];
    const result = await invoke(mode, config);
    assert.equal(result.statusCode, 403);
  }
  assert.equal(fetch.mock.callCount(), 0);
});
