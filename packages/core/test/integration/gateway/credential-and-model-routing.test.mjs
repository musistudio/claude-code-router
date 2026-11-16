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
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";

const gatewayEntry = path.resolve("node_modules/@the-next-ai/ai-gateway/dist/index.js");
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
async function run(providerFactory, probes) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-credential-routing-"));
  const calls = [];
  let gateway, host, failure;
  const upstream = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text || "{}");
    const key = req.headers.authorization === "Bearer bad" ? "bad" : "good";
    calls.push({ path: req.url, body, key });
    if (key === "bad" || failure === "all-fail") {
      if (failure === "network") { req.socket.destroy(); return; }
      if (failure === "timeout") return; // The core must abort this attempt.
      if (failure === "partial") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write('data: {"id":"partial","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n');
        setTimeout(() => res.destroy(), 30).unref();
        return;
      }
      const status = typeof failure === "number" ? failure : 401;
      res.writeHead(status, { "content-type": "application/json", "retry-after": "0" });
      res.end(JSON.stringify({ error: { message: `synthetic ${status}` } }));
      return;
    }
    if (req.url.startsWith("/native")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: body.model,
        content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
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
      logging: { level: "error", accessLog: false }, providers: compiled.providers, plugins: [router] }));
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
      const response = await fetch(publicUrl + probe.path, { method: "POST",
        headers: { "content-type": "application/json", "user-agent": "routing-regression" }, body: JSON.stringify(probe.body) });
      let responseText;
      try { responseText = await response.text(); } catch (error) { if (failure !== "partial") throw error; responseText = String(error); }
      const attempts = calls.slice(start);
      assert.ok(attempts.length > 0, probe.name);
      for (const attempt of attempts) {
        assert.equal(attempt.body.model, probe.body.model.slice(probe.body.model.indexOf("/") + 1), probe.name);
        assert.equal(attempt.body.temperature, probe.body.temperature, probe.name);
        assert.equal(attempt.path, attempts[0].path, "credential fallback preserves the endpoint");
      }
      if (failure === "all-fail") {
        assert.ok(response.status >= 400, responseText);
        assert.match(responseText, /401|synthetic/);
        assert.ok(attempts.some(attempt => attempt.key === "good"));
      } else if (failure === "partial") {
        assert.equal(response.status, 200);
        assert.ok(attempts.every(attempt => attempt.key === "bad"), `never retry after stream delivery: ${JSON.stringify({ attempts, responseText })}`);
      } else {
        assert.equal(response.status, 200, `${probe.name}: ${responseText}`);
        assert.equal(attempts.at(-1).key, "good", probe.name);
        if (failure) assert.ok(attempts.slice(0, -1).every(attempt => attempt.key === "bad"), probe.name);
        if (probe.body.stream) assert.match(responseText, /\[DONE\]/);
      }
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
