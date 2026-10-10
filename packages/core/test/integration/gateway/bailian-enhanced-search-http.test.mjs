import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { gatewayService } from "@ccr/core/gateway/service.ts";
import { bailianEnhancedSearchEndpointEnv } from "@ccr/core/gateway/features/bailian-enhanced-search/mcp.ts";
import { closeRequestLogRuntime, flushRequestLogRuntime, getRequestLogDetail, getRequestLogs, requestLogRuntime } from "@ccr/core/observability/request-log-store.ts";

const gatewayKey = "enhanced-search-http-gateway-key";
const selectedModel = "Selected Bailian/search-model";

// Exercise the installed ai-gateway and the compiled CCR plugin together. A
// direct call to a mock plugin handler cannot catch FastifyReply thenable hangs.
test("EnhancedSearch preserves real gateway HTTP conversations and authorization", { timeout: 90_000 }, async (t) => {
  const modelRequests = [];
  const searchRequests = [];
  let pendingSearch;
  const upstream = createServer((request, response) => {
    void readJson(request).then((body) => {
      modelRequests.push({ body, url: request.url });
      const message = modelMessage(body.model);
      if (body.stream) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(modelSse(message));
      } else {
        sendJson(response, 200, message);
      }
    }).catch((error) => sendJson(response, 500, { error: String(error) }));
  });
  const search = createServer((request, response) => {
    void readJson(request).then((body) => {
      searchRequests.push({ authorization: request.headers.authorization, body });
      if (body.method === "tools/call" && body.params.arguments.query === "cancel this search") {
        response.once("close", () => pendingSearch.closed());
        response.writeHead(200, { "content-type": "application/json" });
        response.flushHeaders();
        pendingSearch.started();
        return;
      }
      if (body.method === "notifications/initialized") {
        response.writeHead(202);
        response.end();
        return;
      }
      const result = body.method === "initialize"
        ? { capabilities: { tools: {} }, protocolVersion: "2024-11-05", serverInfo: { name: "local-search", version: "1" } }
        : { content: [{ type: "text", text: JSON.stringify({ pages: [{
            title: "Local search result", url: "https://example.test/result", snippet: "Search worked."
          }] }) }] };
      sendJson(response, 200, { id: body.id, jsonrpc: "2.0", result });
    }).catch((error) => sendJson(response, 500, { error: String(error) }));
  });
  const previousEntry = process.env.CCR_GATEWAY_ENTRY;
  const previousEndpoint = process.env[bailianEnhancedSearchEndpointEnv];
  const previousWorkerFile = requestLogRuntime.options.workerFile;

  try {
    await listen(upstream);
    await listen(search);
    const requireFromProject = createRequire(path.join(process.cwd(), "package.json"));
    process.env.CCR_GATEWAY_ENTRY = requireFromProject.resolve("@the-next-ai/ai-gateway");
    process.env[bailianEnhancedSearchEndpointEnv] = `${serverUrl(search)}/mcp`;
    // Test bundles live under test/, while their worker is a separate runtime entry.
    requestLogRuntime.options.workerFile = path.join(process.cwd(), ".test-dist", "core", "runtime", "request-log-worker.js");
    let config = testConfig(serverUrl(upstream), await availablePort(), await availablePort());
    const initialStatus = await gatewayService.start(config);
    assert.equal(initialStatus.state, "running", initialStatus.lastError);
    assert.equal(initialStatus.coreEndpoint, initialStatus.endpoint, "disabled search should use the single runtime");
    assert.ok(initialStatus.pid, "the test must launch the real ai-gateway child");

    await t.test("disabled search lets ordinary JSON and SSE requests finish", async () => {
      for (const stream of [false, true]) {
        const before = modelRequests.length;
        const result = await postMessages(ordinaryBody(stream));
        assert.equal(result.status, 200, result.text);
        assert.match(result.text, /hello from model/);
        if (stream) assert.match(result.text, /event: message_stop/);
        assert.equal(modelRequests.length, before + 1);
      }
      assert.equal(searchRequests.length, 0);
    });

    await t.test("enabling search restarts into the compatibility gateway", async () => {
      config = structuredClone(config);
      config.Providers[0].enhancedSearch.enabled = true;
      config.Providers[1].enhancedSearch.enabled = true;
      await gatewayService.updateConfig(config);
      const status = gatewayService.getStatus();
      assert.equal(status.state, "running", status.lastError);
      assert.notEqual(status.pid, initialStatus.pid);
      assert.notEqual(status.coreEndpoint, status.endpoint);
    });

    await t.test("enabled search preserves ordinary JSON and SSE requests", async () => {
      for (const stream of [false, true]) {
        const before = modelRequests.length;
        const result = await postMessages(ordinaryBody(stream));
        assert.equal(result.status, 200, result.text);
        assert.match(result.text, /hello from model/);
        assert.equal(modelRequests.length, before + 1);
      }
      assert.equal(searchRequests.length, 0);
    });

    await t.test("a conversation declaring web_search still reaches the model", async () => {
      const before = modelRequests.length;
      const result = await postMessages({ ...ordinaryBody(false), tools: sideQueryBody(false).tools });
      assert.equal(result.status, 200, result.text);
      assert.match(result.text, /hello from model/);
      assert.equal(modelRequests.length, before + 1);
      assert.equal(searchRequests.length, 0);
    });

    await t.test("router rules removing the search tool prevent interception", async () => {
      const before = modelRequests.length;
      const result = await postMessages(sideQueryBody(false), gatewayKey, undefined, { "x-test-strip-search": "true" });
      assert.equal(result.status, 200, result.text);
      assert.match(result.text, /hello from model/);
      assert.equal(modelRequests.length, before + 1);
      assert.equal(modelRequests.at(-1).body.tools, undefined);
      assert.equal(searchRequests.length, 0);
    });

    await t.test("JSON and SSE side queries use the routed provider without calling the model", async () => {
      config = structuredClone(config);
      config.observability.requestLogs = true;
      await gatewayService.updateConfig(config);
      const modelsBefore = modelRequests.length;
      for (const stream of [false, true]) {
        const before = searchRequests.length;
        const result = await postMessages(sideQueryBody(stream));
        assert.equal(result.status, 200, result.text);
        assert.equal(searchRequests.length, before + 3);
        assert.ok(searchRequests.slice(before).every((request) => request.authorization === "Bearer selected-search-key"),
          "search must use the selected provider's key, not the first enabled provider's key");
        assert.equal(searchRequests.at(-1).body.params.arguments.query, "Shanghai weather");
        assert.match(result.text, /web_search_tool_result/);
        assert.match(result.text, /https:\/\/example\.test\/result/);
        if (stream) {
          assert.match(result.contentType, /text\/event-stream/);
          assert.match(result.text, /event: message_stop/);
        } else {
          const message = JSON.parse(result.text);
          assert.equal(message.model, selectedModel);
          assert.equal(message.stop_reason, "end_turn");
          assert.equal(message.content[0].type, "server_tool_use");
          assert.equal(message.content[1].tool_use_id, message.content[0].id);
        }
      }
      assert.equal(modelRequests.length, modelsBefore);
    });

    await t.test("successful JSON and SSE searches are recorded in request logs", async () => {
      const entries = await logDetails();
      const searches = entries.filter((entry) => entry.responseBody?.text.includes("web_search_tool_result"));
      assert.equal(searches.length, 2);
      assert.deepEqual(searches.map((entry) => entry.isStream).sort(), [false, true]);
      for (const entry of searches) {
        assert.equal(entry.statusCode, 200);
        assert.equal(entry.provider, "Selected Bailian");
        assert.equal(entry.requestedModel, selectedModel);
        assert.match(entry.requestBody.text, /Shanghai weather/);
        assert.match(JSON.stringify(entry.routeTrace), /enrichment.bailian-enhanced-search/);
        assert.doesNotMatch(JSON.stringify(entry), /selected-search-key|first-search-key/);
      }
    });

    await t.test("a disconnected client cancels MCP response consumption and records 499", async () => {
      let started;
      let closed;
      const startedPromise = new Promise((resolve) => { started = resolve; });
      const closedPromise = new Promise((resolve) => { closed = resolve; });
      pendingSearch = { started, closed };
      const before = searchRequests.length;
      const modelsBefore = modelRequests.length;
      const controller = new AbortController();
      const request = assert.rejects(postMessages({
        ...sideQueryBody(true),
        messages: [{ content: "Perform a web search for the query: cancel this search", role: "user" }]
      }, gatewayKey, controller.signal), /abort/i);
      await deadline(startedPromise, "MCP search did not start");
      controller.abort();
      await request;
      await deadline(closedPromise, "MCP response was not cancelled after client disconnect");
      await waitFor(async () => (await logDetails()).some((entry) => entry.statusCode === 499), 3000);
      const cancelled = (await logDetails()).filter((entry) => entry.statusCode === 499);
      assert.equal(cancelled.length, 1);
      assert.match(cancelled[0].requestBody.text, /cancel this search/);
      assert.equal(searchRequests.length, before + 3, "a cancelled search must not retry");
      assert.equal(modelRequests.length, modelsBefore);
    });

    await t.test("side queries for a provider with search disabled reach its model", async () => {
      config = structuredClone(config);
      config.observability.requestLogs = false;
      await gatewayService.updateConfig(config);
      const before = modelRequests.length;
      const searchesBefore = searchRequests.length;
      const result = await postMessages({ ...sideQueryBody(false), model: "Plain Provider/plain-model" });
      assert.equal(result.status, 200, result.text);
      assert.match(result.text, /hello from model/);
      assert.equal(modelRequests.length, before + 1);
      assert.equal(searchRequests.length, searchesBefore);
    });

    await t.test("missing, invalid and expired keys cannot call search", async () => {
      const searchesBefore = searchRequests.length;
      const modelsBefore = modelRequests.length;
      for (const token of [null, "invalid-key", "expired-key"]) {
        const result = await postMessages(sideQueryBody(false), token);
        assert.equal(result.status, 401, result.text);
      }
      assert.equal(searchRequests.length, searchesBefore);
      assert.equal(modelRequests.length, modelsBefore);
    });

    await t.test("profile model allowlists apply before search", async () => {
      const searchesBefore = searchRequests.length;
      const modelsBefore = modelRequests.length;
      const result = await postMessages(sideQueryBody(false), "restricted-profile-key");
      assert.equal(result.status, 403, result.text);
      assert.match(result.text, /profile_model_not_allowed/);
      assert.equal(searchRequests.length, searchesBefore);
      assert.equal(modelRequests.length, modelsBefore);
    });

    await t.test("API key limits apply before search", async () => {
      config = structuredClone(config);
      config.APIKEYS.push(apiKey("limited", "limited-key", { limits: { maxTokens: 1 } }));
      await gatewayService.updateConfig(config);
      const searchesBefore = searchRequests.length;
      const modelsBefore = modelRequests.length;
      const result = await postMessages(sideQueryBody(false), "limited-key");
      assert.equal(result.status, 429, result.text);
      assert.match(result.text, /rate_limit_exceeded/);
      assert.equal(searchRequests.length, searchesBefore);
      assert.equal(modelRequests.length, modelsBefore);
    });

    await t.test("disabling search restarts into the single runtime and conversations still finish", async () => {
      const previousPid = gatewayService.getStatus().pid;
      config = structuredClone(config);
      for (const provider of config.Providers) provider.enhancedSearch.enabled = false;
      config.APIKEYS = config.APIKEYS.filter((key) => key.id !== "limited");
      config.observability.requestLogs = false;
      await gatewayService.updateConfig(config);
      const status = gatewayService.getStatus();
      assert.equal(status.state, "running", status.lastError);
      assert.notEqual(status.pid, previousPid);
      assert.equal(status.coreEndpoint, status.endpoint);
      const result = await postMessages(ordinaryBody(false));
      assert.equal(result.status, 200, result.text);
      assert.match(result.text, /hello from model/);
    });
  } finally {
    await gatewayService.stop();
    await closeRequestLogRuntime();
    requestLogRuntime.options.workerFile = previousWorkerFile;
    await Promise.all([closeServer(upstream), closeServer(search)]);
    restoreEnv("CCR_GATEWAY_ENTRY", previousEntry);
    restoreEnv(bailianEnhancedSearchEndpointEnv, previousEndpoint);
  }
});

function testConfig(upstreamUrl, publicPort, corePort) {
  const config = createDefaultAppConfig();
  config.APIKEY = gatewayKey;
  config.APIKEYS = [
    apiKey("expired", "expired-key", { expiresAt: "2000-01-01T00:00:00.000Z" }),
    apiKey("profile:restricted", "restricted-profile-key")
  ];
  config.API_TIMEOUT_MS = 5000;
  config.gateway = { coreHost: "127.0.0.1", corePort, enabled: true, host: "127.0.0.1", port: publicPort };
  config.proxy.upstream.mode = "none";
  config.Router.builtInRules["claude-code"].enabled = false;
  config.Router.builtInRules.codex.enabled = false;
  config.Router.fallback = { mode: "off", models: [], retryCount: 0 };
  config.Router.rules = [{
    condition: { left: "request.header.x-test-strip-search", operator: "==", right: "true" },
    enabled: true, id: "remove-search-tool", name: "Remove search tool", type: "condition",
    rewrites: [
      { key: "request.body.tools", operation: "delete" },
      { key: "request.body.tool_choice", operation: "delete" }
    ]
  }];
  config.profile.profiles = [{
    agent: "claude-code", availableModels: ["Plain Provider/plain-model"], enabled: true,
    id: "restricted", model: "Plain Provider/plain-model", name: "Restricted", scope: "global"
  }];
  config.Providers = [
    provider("first", "First Bailian", "first-model", "first-search-key"),
    provider("selected", "Selected Bailian", "search-model", "selected-search-key"),
    provider("plain", "Plain Provider", "plain-model", "plain-search-key")
  ];
  return config;

  function provider(id, name, model, searchKey) {
    return {
      api_base_url: `${upstreamUrl}/v1/messages`, api_key: `model-key-${id}`,
      baseUrl: upstreamUrl, capabilities: [{ baseUrl: upstreamUrl, type: "anthropic_messages" }],
      enhancedSearch: { apiKey: searchKey, enabled: false }, id, models: [model], name, type: "anthropic_messages"
    };
  }
}

function apiKey(id, key, extra = {}) {
  return { createdAt: "2020-01-01T00:00:00.000Z", id, key, ...extra };
}

function ordinaryBody(stream) {
  return { max_tokens: 64, messages: [{ content: "hello", role: "user" }], model: selectedModel, stream };
}

function sideQueryBody(stream) {
  return {
    ...ordinaryBody(stream),
    messages: [{ content: "Perform a web search for the query: Shanghai weather", role: "user" }],
    system: "You are an assistant for performing a web search tool use",
    tool_choice: { name: "web_search", type: "tool" },
    tools: [{ max_uses: 8, name: "web_search", type: "web_search_20250305" }]
  };
}

async function postMessages(body, token = gatewayKey, signal = AbortSignal.timeout(5000), extraHeaders = {}) {
  const response = await fetch(`${gatewayService.getStatus().endpoint}/v1/messages`, {
    body: JSON.stringify(body), method: "POST", signal,
    headers: {
      "anthropic-version": "2023-06-01", "content-type": "application/json",
      ...extraHeaders,
      ...(token === null ? {} : { authorization: `Bearer ${token}` })
    }
  });
  return { contentType: response.headers.get("content-type") ?? "", status: response.status, text: await response.text() };
}

function modelMessage(model) {
  return {
    id: "msg_local_test", type: "message", role: "assistant", model,
    content: [{ type: "text", text: "hello from model" }], stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 3, output_tokens: 4 }
  };
}

function modelSse(message) {
  return [
    { type: "message_start", message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 3, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello from model" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } },
    { type: "message_stop" }
  ].map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
}

function serverUrl(server) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function availablePort() {
  const server = createServer();
  await listen(server);
  const port = Number(new URL(serverUrl(server)).port);
  await closeServer(server);
  return port;
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  server.closeAllConnections();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function logDetails() {
  const flushed = await flushRequestLogRuntime(3000);
  assert.equal(flushed.timedOut, false);
  const page = await getRequestLogs({ pageSize: 100, provider: "Selected Bailian" });
  return Promise.all(page.items.map((entry) => getRequestLogDetail({ id: entry.id })));
}

async function deadline(promise, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 3000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(predicate, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(await predicate(), "condition did not become true before the deadline");
}
