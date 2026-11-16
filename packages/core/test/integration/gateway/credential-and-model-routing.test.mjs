import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { coreGatewayAuthHeader } from "@ccr/core/gateway/internal/shared.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";

const gatewayEntry = process.env.CCR_TEST_GATEWAY_ENTRY ?? path.resolve("node_modules/@the-next-ai/ai-gateway/dist/index.js");
async function listen(server) {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
function successResponse(body) {
  return { id: "chat_test", object: "chat.completion", model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
}

// Exercise both the public CCR proxy and its core plugin, not just gateway headers.
async function run(providerFactory, probes, options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-credential-routing-"));
  const calls = [];
  let gateway, host, failure;
  const upstream = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text || "{}");
    const key = req.headers.authorization === "Bearer bad" || req.headers["x-api-key"] === "bad" ? "bad" : "good";
    calls.push({ path: req.url, body, key, beta: req.headers["anthropic-beta"] });
    if (failure === "reject-deferred" && body.tools?.some(tool => tool.defer_loading !== undefined)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "defer_loading requires a deferred loader" } }));
      return;
    }
    if (key === "bad" || failure === "all-fail") {
      if (failure === "network") { req.socket.destroy(); return; }
      if (failure === "timeout") return; // The core must abort this attempt.
      if (failure === "partial") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        if (req.url.startsWith("/native")) {
          res.write('event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","model":"pool-model","content":[],"usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n');
        } else if (req.url.includes("responses")) {
          res.write('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n');
        } else {
          res.write('data: {"id":"partial","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n');
        }
        setTimeout(() => res.destroy(), 30).unref();
        return;
      }
      const status = typeof failure === "number" ? failure : 401;
      res.writeHead(status, { "content-type": "application/json", "retry-after": "0" });
      res.end(JSON.stringify({ error: { message: `synthetic ${status}` } }));
      return;
    }
    if (req.url.startsWith("/native") && body.stream) {
      const safeguardResults = body.safeguards ? { safeguard_results: { synthetic_verdict: "allow", tool_use_id: "toolu_guard_test_123" } } : {};
      const message = { id: "msg_test", type: "message", role: "assistant", model: body.model, content: [], usage: { input_tokens: 1, output_tokens: 1 } };
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message, ...safeguardResults })}\n\nevent: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_guard_test_123", name: "t", input: {} } })}\n\nevent: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 }, ...safeguardResults })}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`);
    } else if (req.url.startsWith("/native")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: body.model,
        content: body.safeguards ? [{ type: "tool_use", id: "toolu_guard_test_123", name: "t", input: {} }] : [{ type: "text", text: "ok" }],
        ...(body.safeguards ? { safeguard_results: { synthetic_verdict: "allow", tool_use_id: "toolu_guard_test_123" } } : {}), stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
    } else if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ ...successResponse(body), object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(successResponse(body)));
    }
  });
  try {
    const url = await listen(upstream);
    const config = createDefaultAppConfig();
    config.Providers = providerFactory(url);
    config.virtualModelProfiles = options.virtualModelProfiles ?? [];
    config.Router.builtInRules = { "claude-code": { enabled: false }, codex: { enabled: false } };
    config.Router.fallback = { mode: "off", models: [], retryCount: 0 };
    config.observability = { ...config.observability, requestLogs: false, agentAnalysis: false };
    config.profile.enabled = false;
    config.profile.profiles = [];
    const compiled = await compileCoreGatewayConfig(config, "trace", "billing", "auth");
    const router = compiled.plugins.find(plugin => plugin.key === "ccr-router");
    router.modulePath = path.resolve(".test-dist/core/runtime/router-plugin.js");
    const reserve = createServer();
    const gatewayUrl = await listen(reserve);
    const port = reserve.address().port;
    await close(reserve);
    const file = path.join(root, "gateway.json");
    writeFileSync(file, JSON.stringify({ host: "127.0.0.1", port, upstreamTimeoutMs: 200,
      auth: { enabled: false }, rawTrace: { enabled: false }, billing: { enabled: false },
      logging: { level: "error", accessLog: false }, providers: compiled.providers, plugins: [router], virtualModelProfiles: compiled.virtualModelProfiles }));
    gateway = spawn(process.execPath, [gatewayEntry], { cwd: root,
      env: { ...process.env, GATEWAY_CONFIG_PATH: file }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    gateway.stdout.on("data", chunk => { log += chunk; });
    gateway.stderr.on("data", chunk => { log += chunk; });
    let healthy = false;
    for (let i = 0; i < 150; i += 1) {
      if (gateway.exitCode !== null) throw new Error(log);
      try { if ((await fetch(`${gatewayUrl}/health`)).ok) { healthy = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(healthy, log);
    const plugin = new ClaudeCodeRouterPlugin(config);
    const pipeline = new GatewayRequestPipeline({ getConfig: () => config, getPlugin: () => plugin,
      getCoreAuthToken: () => "auth", getBrowserWebSearchMcpIntegration: () => undefined,
      getStatus: () => ({ coreEndpoint: gatewayUrl, endpoint: "http://127.0.0.1" }) });
    host = createServer((req, res) => void pipeline.proxyRequest(req, res, req.url).catch(error => { res.writeHead(500); res.end(String(error)); }));
    const publicUrl = await listen(host);
    for (const probe of probes) {
      failure = probe.failure;
      const start = calls.length;
      const response = await fetch((probe.coreOnly ? gatewayUrl : publicUrl) + probe.path, { method: "POST",
        headers: { "content-type": "application/json", "user-agent": "routing-regression", ...(probe.coreOnly ? { [coreGatewayAuthHeader]: "auth" } : {}), ...probe.headers }, body: JSON.stringify(probe.body) });
      let responseText;
      try { responseText = await response.text(); } catch (error) { if (failure !== "partial") throw error; responseText = String(error); }
      const attempts = calls.slice(start);
      assert.ok(attempts.length > 0, `${probe.name}: ${response.status} ${responseText}`);
      for (const attempt of attempts) {
        assert.equal(attempt.body.model, probe.expectedUpstreamModel ?? probe.body.model.slice(probe.body.model.indexOf("/") + 1), probe.name);
        assert.equal(attempt.body.temperature, probe.body.temperature, probe.name);
        assert.equal(attempt.path, attempts[0].path, "credential fallback preserves the endpoint");
      }
      if (failure === "all-fail") {
        assert.ok(response.status >= 400, responseText);
        assert.match(responseText, /401|synthetic/);
        assert.ok(attempts.some(attempt => attempt.key === "good"));
      } else if (failure === "partial") {
        assert.equal(response.status, 200);
        assert.match(responseText, /upstream_stream_error|Upstream stream failed/, `${probe.name} ${probe.coreOnly ? "core" : "wrapper"}: ${responseText}`);
        assert.ok(attempts.every(attempt => attempt.key === "bad"), `never retry after stream delivery: ${JSON.stringify({ attempts, responseText })}`);
      } else {
        assert.equal(response.status, 200, `${probe.name}: ${responseText}`);
        assert.equal(attempts.at(-1).key, "good", probe.name);
        if (failure) assert.ok(attempts.slice(0, -1).every(attempt => attempt.key === "bad"), probe.name);
        if (probe.body.stream) assert.match(responseText, probe.path === "/v1/messages" ? /message_stop/ : /\[DONE\]/);
      }
      probe.assertResponse?.(responseText, attempts);
      assert.ok(attempts.length <= 8, "credential retries must terminate");
    }
  } finally {
    await close(host);
    if (gateway && gateway.exitCode === null) {
      gateway.kill();
      await new Promise(resolve => {
        const timer = setTimeout(() => { gateway.kill("SIGKILL"); resolve(); }, 2000);
        gateway.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    await close(upstream);
    rmSync(root, { recursive: true, force: true });
  }
}
const credentials = [{ id: "first", apiKey: "bad", priority: 1 }, { id: "second", apiKey: "good", priority: 2 }];
function probe(model, failure, path = "/v1/chat/completions", stream = false) {
  return { name: `${model}: ${failure ?? "success"}`, failure, path,
    body: { model, stream, temperature: 0.2, max_tokens: 32,
      ...(path === "/v1/responses" ? { input: "hi" } : { messages: [{ role: "user", content: "hi" }] }) } };
}

test("#1920 vendor-prefixed model IDs survive Chat, Responses-compatible conversion and Anthropic ingress", { timeout: 30000 }, async () => {
  await run(url => [{ id: "agg", name: "agg", type: "openai_chat_completions", api_base_url: `${url}/v1`, api_key: "test",
    models: ["openai/gpt-test", "anthropic/claude-test", "poolside/laguna-test"] }],
  ["openai/gpt-test", "anthropic/claude-test", "poolside/laguna-test"].flatMap(model =>
    [probe(`agg/${model}`), probe(`agg/${model}`, undefined, "/v1/messages"), probe(`agg/${model}`, undefined, "/v1/responses")]));
  await run(url => [{ id: "native", name: "native", type: "anthropic_messages", api_base_url: `${url}/native`, api_key: "test", models: ["anthropic/claude-test"] }],
    [probe("native/anthropic/claude-test", undefined, "/v1/messages")]);
});

test("#1923 credential fallback handles HTTP, network, timeout, all-failed and streaming outcomes", { timeout: 30000 }, async () => {
  for (const failure of [401, 403, 429, 503, "network", "timeout", "all-fail", "stream-429", "partial"]) {
    // Each scenario has a fresh pool so cooldowns from an all-failed request
    // cannot skip the first credential in subsequent scenarios.
    const id = `pool-${failure}`;
    const stream = failure === "stream-429" || failure === "partial";
    await run(url => [{ id, name: id, type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["pool-model"], credentials }],
      [probe(`${id}/pool-model`, failure === "stream-429" ? 429 : failure, "/v1/chat/completions", stream)]);
  }
});

test("#1920 and #1923 vendor model IDs also support credential fallback and reserved provider IDs", { timeout: 30000 }, async () => {
  for (const id of ["pool-vendor", "openai"]) {
    await run(url => [{ id, name: `Pool ${id}`, type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["openai/gpt-test"], credentials }],
      [probe(`${id}/openai/gpt-test`, 401)]);
  }
});


test("#1912 incompatible native upstreams receive complete tool definitions without deferred flags", async () => {
  const p = probe("legacy/tool-model", "reject-deferred", "/v1/messages");
  p.body.tools = [{ name: "t", defer_loading: true, input_schema: { type: "object" } }];
  p.assertResponse = (_text, calls) => assert.deepEqual(calls[0].body.tools, [{ name: "t", input_schema: { type: "object" } }]);
  await run(url => [{ id: "legacy", name: "Legacy", type: "anthropic_messages", api_base_url: `${url}/native`, api_key: "test", models: ["tool-model"], supportsDeferredTools: false }], [p]);
});

test("#1932 native safeguards, beta headers, verdicts and tool IDs survive JSON and SSE", async () => {
  const probes = [false, true].map(stream => {
    const p = probe("safe/guard-model", undefined, "/v1/messages", stream);
    p.body.safeguards = { synthetic_check: { tool_use_id: "toolu_guard_test_123" } };
    p.body.tools = [{ name: "t", defer_loading: true, input_schema: { type: "object" } }];
    p.headers = { "anthropic-beta": "synthetic-safeguards-2026-11-16" };
    p.assertResponse = (text, calls) => {
      assert.deepEqual(calls[0].body.safeguards, p.body.safeguards);
      assert.equal(calls[0].beta, p.headers["anthropic-beta"]);
      assert.equal(calls[0].body.tools[0].defer_loading, true);
      assert.match(text, /"safeguard_results":\s*\{/);
      assert.match(text, /"synthetic_verdict":\s*"allow"/);
      assert.match(text, /"tool_use_id":\s*"toolu_guard_test_123"/);
      assert.match(text, /"id":\s*"toolu_guard_test_123"/);
    };
    return p;
  });
  await run(url => [{ id: "safe", name: "Safe", type: "anthropic_messages", api_base_url: `${url}/native`, api_key: "test", models: ["guard-model"] }], probes);
});


test("#1917 core-only and wrapper relays send terminal errors for native and converted protocols", { skip: !process.env.CCR_TEST_GATEWAY_ENTRY, timeout: 30000 }, async () => {
  for (const scenario of [
    { type: "anthropic_messages", base: "/native", path: "/v1/messages", marker: /event: error/ },
    { type: "openai_chat_completions", base: "/v1", path: "/v1/chat/completions", marker: /"upstream_stream_error"/ },
    { type: "openai_responses", base: "/responses-native", path: "/v1/responses", marker: /response.failed/ },
    { type: "openai_chat_completions", base: "/v1", path: "/v1/messages", marker: /event: error/ },
    { type: "openai_chat_completions", base: "/v1", path: "/v1/responses", marker: /response.failed/ }
  ]) {
    const id = `cut-${scenario.type}`;
    const probes = [false, true].map(coreOnly => ({ ...probe(`${id}/pool-model`, "partial", scenario.path, true), name: `${scenario.type} -> ${scenario.path}`, coreOnly,
      assertResponse: text => assert.match(text, scenario.marker) }));
    await run(url => [{ id, name: id, type: scenario.type, api_base_url: url + scenario.base, models: ["pool-model"], credentials }], probes);
  }
});

test("#1917 virtual-model streams preserve a terminal upstream error", { skip: !process.env.CCR_TEST_GATEWAY_ENTRY, timeout: 15000 }, async () => {
  const p = { ...probe("Fusion/virtual-cut", "partial", "/v1/messages", true), expectedUpstreamModel: "pool-model",
    assertResponse: text => assert.match(text, /event: error/) };
  await run(url => [{ id: "virtual-provider", name: "virtual-provider", type: "anthropic_messages", api_base_url: url + "/native", models: ["pool-model"], credentials }], [p],
    { virtualModelProfiles: [{ id: "virtual-cut", key: "virtual-cut", displayName: "Virtual Cut", enabled: true, match: { exactAliases: ["virtual-cut", "Fusion/virtual-cut"], prefixes: [], suffixes: [] },
      baseModel: { mode: "fixed", fixedModel: "virtual-provider/pool-model" }, tools: [],
      execution: { mode: "tool_loop", maxTurns: 2, maxToolCalls: 2, clientToolsPolicy: "passthrough", streamMode: "optimistic" },
      materialization: { enabled: true, includeInGatewayModels: true } }] });
});
