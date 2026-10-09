import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import { closeRequestLogRuntime, flushRequestLogRuntime, requestLogRuntime } from "@ccr/core/observability/request-log-store.ts";

import { gatewayService } from "@ccr/core/gateway/application/gateway-service.ts";
import { pluginService } from "@ccr/core/plugins/service.ts";

const entry = process.env.CCR_TEST_GATEWAY_ENTRY;
const skip = !entry && "set CCR_TEST_GATEWAY_ENTRY to the gateway production entry";

test("#1850/#1861 fallback attribution reaches OpenAI JSON/SSE clients and request logs", { skip, timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ccr-october-fallback-"));
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  const calls = [];
  const tokenCounts = [];
  const originalTransforms = pluginService.gatewayRequestTransforms;
  pluginService.gatewayRequestTransforms = [{ pluginId: "customer", id: "token-probe",
    transform: input => { tokenCounts.push(input.tokenCount); return undefined; } }];
  const upstream = createServer(async (req, res) => {
    const body = await readJson(req);
    calls.push({ path: req.url, model: body.model });
    if (req.url.startsWith("/primary/")) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "primary quota exhausted" } }));
      return;
    }
    const responses = req.url.endsWith("/responses");
    const payload = responses
      ? { id: "resp_backup", object: "response", model: "backup", status: "completed", output: [{ id: "msg_backup", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "from backup", annotations: [] }] }], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }
      : { id: "chatcmpl_backup", object: "chat.completion", model: "backup", choices: [{ index: 0, message: { role: "assistant", content: "from backup" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } };
    res.writeHead(200, { "content-type": body.stream ? "text/event-stream" : "application/json" });
    if (!body.stream) res.end(JSON.stringify(payload));
    else if (responses) res.end(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: payload })}\n\n`);
    else res.end(`data: ${JSON.stringify({ ...payload, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "from backup" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  });
  let gateway;
  let host;
  try {
    const url = await listen(upstream);
    const config = createDefaultAppConfig();
    config.Providers = ["Primary", "Backup"].map(name => ({
      id: name.toLowerCase(), name, api_key: "test", models: [name.toLowerCase()], type: "openai_chat_completions",
      api_base_url: `${url}/${name.toLowerCase()}/v1`,
      capabilities: ["openai_chat_completions", "openai_responses"].map(type => ({ type, source: "detected", baseUrl: `${url}/${name.toLowerCase()}/v1` })),
    }));
    config.Router.builtInRules = { "claude-code": { enabled: false }, codex: { enabled: false } };
    config.Router.fallback = { mode: "model-chain", models: ["Backup/backup"], retryCount: 0 };
    config.observability = { ...config.observability, requestLogs: true, requestLogBodyCapture: "all", requestLogSuccessSampleRate: 1 };
    const compiled = await compileCoreGatewayConfig(config, "trace", "billing", "auth");
    const router = compiled.plugins.find(plugin => plugin.key === "ccr-router");
    router.modulePath = path.resolve(__dirname, "../../../runtime/router-plugin.js");
    gateway = await startGateway(root, { providers: compiled.providers, plugins: [router] });
    const plugin = new ClaudeCodeRouterPlugin(config);
    const pipeline = new GatewayRequestPipeline({
      getConfig: () => config, getPlugin: () => plugin, getCoreAuthToken: () => "auth",
      getBrowserWebSearchMcpIntegration: () => undefined,
      getStatus: () => ({ coreEndpoint: gateway.url, endpoint: "http://127.0.0.1" }),
    });
    host = createServer((req, res) => void pipeline.proxyRequest(req, res, req.url).catch(error => { res.writeHead(500); res.end(String(error)); }));
    const hostUrl = await listen(host);
    for (const route of ["/v1/chat/completions", "/v1/responses"]) for (const stream of [false, true]) {
      const before = calls.length;
      const response = await fetch(hostUrl + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "Primary/primary", stream, messages: [{ role: "user", content: "hi" }], input: "hi" }) });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      assert.match(text, /"model":"backup"/);
      assert.match(text, /from backup/);
      assert.doesNotMatch(text, /"model":"primary"/);
      assert.deepEqual(calls.slice(before), [{ path: `/primary${route}`, model: "primary" }, { path: `/backup${route}`, model: "backup" }]);
    }
    assert.equal(tokenCounts.length, 4);
    assert.ok(tokenCounts.every(count => count > 0), `#1869 plugin token input: ${JSON.stringify(tokenCounts)}`);
    await until(async () => { await flushRequestLogRuntime(1000); return (await requestLogRuntime.list({ pageSize: 100 })).items.length === 4; });
    const rows = (await requestLogRuntime.list({ pageSize: 100 })).items;
    assert.ok(rows.every(row => row.provider === "Backup" && row.responseModel === "backup" && row.resolvedModel.includes("backup")), JSON.stringify(rows));
  } finally {
    pluginService.gatewayRequestTransforms = originalTransforms;
    await close(host);
    if (gateway) await stopGateway(gateway);
    await close(upstream);
    await closeRequestLogRuntime();
    rmSync(root, { recursive: true, force: true });
  }
});

test("#1852 built gateway preserves native virtual-model content and usage with billing on/off", { skip, timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ccr-october-native-stream-"));
  const upstream = createServer(async (req, res) => {
    const body = await readJson(req);
    assert.equal(body.model, "native");
    const payload = { id: "msg_native", type: "message", role: "assistant", model: "native", content: [{ type: "text", text: "native answer 你好 🌏" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 7 } };
    res.writeHead(200, { "content-type": body.stream ? "text/event-stream" : "application/json" });
    if (!body.stream) { res.end(JSON.stringify(payload)); return; }
    const events = [
      ["message_start", { type: "message_start", message: { ...payload, content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "native reasoning" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "native signature" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "native answer 你好 🌏" } }],
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } }],
      ["message_stop", { type: "message_stop" }],
    ];
    // Send fragmented UTF-8/SSE chunks through actual HTTP, not Fastify inject.
    const text = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
    const bytes = Buffer.from(text);
    for (let offset = 0; offset < bytes.length; offset += 37) res.write(bytes.subarray(offset, offset + 37));
    res.end();
  });
  let gateway;
  try {
    const upstreamUrl = await listen(upstream);
    for (const billing of [false, true]) {
      gateway = await startGateway(root, { providers: [{ name: "native", type: "anthropic_messages", baseUrl: upstreamUrl, apiKey: "test", models: ["native"] }], billing: { enabled: billing }, virtualModelProfiles: [{ id: "alias", key: "alias", displayName: "Alias", enabled: true, match: { exactAliases: ["alias"], prefixes: [], suffixes: [] }, baseModel: { mode: "fixed", fixedModel: "native/native" }, tools: [], execution: { mode: "tool_loop", maxTurns: 2, maxToolCalls: 2, clientToolsPolicy: "allow", streamMode: "buffered" }, materialization: { enabled: true, includeInGatewayModels: true } }] });
      for (const stream of [false, true]) {
        const response = await fetch(gateway.url + "/v1/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "alias", max_tokens: 32, stream, messages: [{ role: "user", content: "hi" }] }) });
        const text = await response.text();
        assert.equal(response.status, 200, text);
        assert.match(text, /native answer 你好 🌏/);
        assert.match(text, /"output_tokens":7/);
        if (stream) { assert.match(text, /native reasoning/); assert.match(text, /native signature/); }
      }
      await stopGateway(gateway); gateway = undefined;
    }
  } finally {
    if (gateway) await stopGateway(gateway);
    await close(upstream);
    rmSync(root, { recursive: true, force: true });
  }
});

test("#1867 a killed managed core restarts and restores the real service health", { skip, timeout: 30000 }, async () => {
  const originalEntry = process.env.CCR_GATEWAY_ENTRY;
  process.env.CCR_GATEWAY_ENTRY = entry;
  const service = new gatewayService.constructor();
  const upstream = createServer((req, res) => { req.resume(); res.end("{}"); });
  try {
    const upstreamUrl = await listen(upstream);
    const publicReserve = createServer();
    await listen(publicReserve);
    const publicPort = publicReserve.address().port;
    const coreReserve = createServer();
    await listen(coreReserve);
    const corePort = coreReserve.address().port;
    await close(publicReserve); await close(coreReserve);
    const config = createDefaultAppConfig();
    config.Providers = [{ name: "Provider", id: "provider", models: ["native"], type: "anthropic_messages", api_base_url: upstreamUrl, api_key: "test" }];
    config.gateway = { ...config.gateway, enabled: true, host: "127.0.0.1", port: publicPort, coreHost: "127.0.0.1", corePort };
    config.Router.fallback = { mode: "model-chain", models: ["Provider/native"], retryCount: 0 };
    config.mediaTools.enabled = false;
    config.proxy.enabled = false; config.proxy.captureNetwork = false;
    config.contextArchive.enabled = false;
    config.observability.requestLogs = false; config.observability.requestLogBodyCapture = "none";
    config.profile.enabled = false; config.profile.profiles = [];
    config.plugins = [];
    const started = await service.start(config);
    assert.equal(started.state, "running", started.lastError);
    const pid = started.pid;
    const auth = service.coreAuthToken;
    service.child.kill("SIGKILL");
    await until(() => service.getStatus().state === "running" && service.getStatus().pid !== pid, 15000);
    assert.ok(service.getStatus().pid);
    assert.notEqual(service.coreAuthToken, auth);
    const health = await fetch(`http://127.0.0.1:${publicPort}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "running");
  } finally {
    await service.stop();
    await close(upstream);
    if (originalEntry === undefined) delete process.env.CCR_GATEWAY_ENTRY;
    else process.env.CCR_GATEWAY_ENTRY = originalEntry;
  }
});

async function readJson(request) { let text = ""; for await (const chunk of request) text += chunk; return JSON.parse(text || "{}"); }
async function listen(server) { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { if (server?.listening) await new Promise(resolve => server.close(resolve)); }
async function until(predicate, timeout = 10000) { const deadline = Date.now() + timeout; do { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); } while (Date.now() < deadline); assert.fail("Timed out waiting for gateway/logs."); }
async function startGateway(root, config) {
  const reserve = createServer(); const url = await listen(reserve); const port = reserve.address().port; await close(reserve);
  const file = path.join(root, "gateway.json");
  writeFileSync(file, JSON.stringify({ host: "127.0.0.1", port, auth: { enabled: false }, rawTrace: { enabled: false }, billing: { enabled: false }, logging: { level: "error", accessLog: false }, ...config }));
  const child = spawn(process.execPath, [entry], { env: { ...process.env, GATEWAY_CONFIG_PATH: file }, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", chunk => output += chunk); child.stderr.on("data", chunk => output += chunk);
  try { await until(async () => { if (child.exitCode !== null) throw new Error(output); try { return (await fetch(url + "/health")).ok; } catch { return false; } }); return { child, url }; }
  catch (error) { child.kill(); throw new Error(`${error}\n${output}`); }
}
async function stopGateway({ child }) { if (child.exitCode !== null) return; child.kill(); await new Promise(resolve => { const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2000); child.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
