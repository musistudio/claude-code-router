import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// This suite deliberately crosses the real gateway / HTTP / spool / SQLite
// boundaries. Point CCR_TEST_GATEWAY_ENTRY at an unpatched build to reproduce
// #1806 and #1808, and at the patched build to verify the fixes.
const gatewayEntry = process.env.CCR_TEST_GATEWAY_ENTRY;

test("recent issues: production HTTP, OAuth rotation, tool replay, logs and usage SQLite", {
  skip: !gatewayEntry && "set CCR_TEST_GATEWAY_ENTRY to the gateway production entry",
  timeout: 60000
}, async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "ccr-wire-issues-"));
  const previousEnv = Object.fromEntries(["CCR_INTERNAL_HOME_DIR", "CCR_INTERNAL_APP_DATA_DIR", "CCR_INTERNAL_USER_DATA_DIR"].map(key => [key, process.env[key]]));
  process.env.CCR_INTERNAL_HOME_DIR = path.join(root, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(root, "data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(root, "user");
  const { createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts");
  const { REQUEST_LOGS_DB_FILE, RAW_TRACE_SPOOL_DIR } = await import("@ccr/core/config/constants.ts");
  const { createRequestLogRuntime } = await import("@ccr/core/observability/request-log-store.ts");
  const { RawTraceSynchronizer } = await import("@ccr/core/observability/raw-trace-sync.ts");
  const { UsageStore } = await import("@ccr/core/usage/store.ts");
  const { providerRuntimeId } = await import("@ccr/core/routing/model-registry.ts");
  const config = createDefaultAppConfig();
  const model = "Qwen3.8-27B-Q4_K_M";
  const provider = { id: "llama-cpp", name: "Llama CPP", models: [model], type: "openai_chat_completions", modelMetadata: { [model]: { pricing: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 6 } } } };
  const runtimeName = `${providerRuntimeId(provider)}::openai_chat_completions`;
  config.Providers = [provider];
  config.observability = { ...config.observability, requestLogs: true, requestLogBodyCapture: "all", requestLogSuccessSampleRate: 1 };
  const workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  assert.ok(existsSync(workerFile));
  const logs = createRequestLogRuntime({ dbFile: REQUEST_LOGS_DB_FILE, rawTraceSpoolDir: RAW_TRACE_SPOOL_DIR, workerFile });
  const sync = new RawTraceSynchronizer({ getConfig: () => config, allowStandaloneRequestLogs: () => true, spoolDirectory: RAW_TRACE_SPOOL_DIR, enqueueUpdate: (input, files) => logs.enqueueRawTrace(input, files), replayIntervalMs: 50 });
  const captures = [];
  const upstream = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text || "{}");
    captures.push({ path: req.url, body, headers: req.headers });
    if (req.url?.startsWith("/primary/") || req.url?.startsWith("/anthropic-quota/")) {
      res.writeHead(req.url.startsWith("/primary/") ? 403 : 429, { "content-type": "application/json", "retry-after": "0.001" });
      res.end(JSON.stringify({ error: { message: "weekly usage limit", type: "access_terminated_error" } }));
      return;
    }
    if (req.url?.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "native", type: "model" }] }));
      return;
    }
    if (req.url === "/anthropic/v1/messages") {
      const calls = (body.messages ?? []).flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === "tool_use");
      const results = (body.messages ?? []).flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === "tool_result");
      const valid = calls.every(call => /^[a-zA-Z0-9_-]+$/.test(call.id)) && results.every(result => calls.some(call => call.id === result.tool_use_id));
      res.writeHead(valid ? 200 : 400, { "content-type": "application/json" });
      res.end(JSON.stringify(valid ? { id: "msg_native", type: "message", role: "assistant", model: "native", content: [{ type: "text", text: "paired" }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 20 } } : { error: { message: "invalid tool history" } }));
      return;
    }
    const tool = body.messages?.at(-1)?.content === "tool";
    const toolCalls = [{ id: "functions.Bash:0", type: "function", function: { name: "Bash", arguments: '{"command":"pwd"}' } }];
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const frame = (choices, usage) => `data: ${JSON.stringify({ id: "chatcmpl_test", object: "chat.completion.chunk", model, choices, ...(usage ? { usage } : {}) })}\n\n`;
      res.write(frame([{ index: 0, delta: { role: "assistant", ...(tool ? { tool_calls: toolCalls.map(call => ({ ...call, index: 0 })) } : { content: "OK" }) } }]));
      res.write(frame([{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }]));
      // Llama.cpp/OpenAI may send usage AFTER finish_reason (#1234 related).
      res.end(frame([], { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }) + "data: [DONE]\n\n");
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "chatcmpl_test", object: "chat.completion", model, choices: [{ index: 0, message: { role: "assistant", content: tool ? null : "OK", ...(tool ? { tool_calls: toolCalls } : {}) }, finish_reason: tool ? "tool_calls" : "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }));
    }
  });
  const sink = createServer((req, res) => void sync.handle(req, res));
  let gateway;
  const usageView = new UsageStore(path.join(root, "unused.sqlite"), { requestLogDbFile: REQUEST_LOGS_DB_FILE });
  try {
    await sync.start();
    const upstreamUrl = await listen(upstream);
    const sinkUrl = await listen(sink);
    provider.baseUrl = `${upstreamUrl}/v1`;
    const baseConfig = {
      host: "127.0.0.1", logging: { level: "error", accessLog: false }, auth: { enabled: false },
      providers: [
        { name: runtimeName, type: "openai_chat_completions", baseUrl: `${upstreamUrl}/v1`, apiKey: "test", models: [model] },
        { name: "native", type: "anthropic_messages", baseUrl: `${upstreamUrl}/anthropic`, apiKey: "test", models: ["native"] }
      ],
      virtualModelProfiles: [{ id: "fusion", key: "fusion", displayName: "Fusion", enabled: true, match: { exactAliases: [], prefixes: [], suffixes: [":fusion"] }, baseModel: { mode: "strip_suffix" }, tools: [], execution: { mode: "tool_loop", maxTurns: 4, maxToolCalls: 4, clientToolsPolicy: "passthrough", streamMode: "optimistic" }, materialization: { enabled: true, includeInGatewayModels: true } }],
      rawTrace: { enabled: true, mode: "wire_raw", spoolDir: RAW_TRACE_SPOOL_DIR, sync: { enabled: true, endpoint: sinkUrl, apiKeyHeader: "x-ccr-raw-trace-token", apiKey: sync.token, baseDelayMs: 50, maxAttempts: 10 } }
    };
    let expectedRows = 0;
    for (const billing of [false, true]) {
      gateway = await startGateway(root, { ...baseConfig, billing: { enabled: billing } });
      for (const fusion of [false, true]) for (const stream of [false, true]) {
        const label = `billing=${billing} fusion=${fusion} stream=${stream}`;
        const response = await fetch(`${gateway.url}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: `${runtimeName}/${model}${fusion ? ":fusion" : ""}`, max_tokens: 4, stream, messages: [{ role: "user", content: "hi" }] }) });
        assert.equal(response.status, 200, label);
        assert.match(await response.text(), /OK/, label);
        expectedRows++;
        await until(async () => { await logs.flush({ timeoutMs: 1000 }); return (await logs.list({ pageSize: 100 })).items.length === expectedRows; }, `missing SQLite row: ${label}`);
        const page = await logs.list({ pageSize: 100 });
        assert.ok(page.items.every(row => row.statusCode === 200 && !row.error), `${label}: ${JSON.stringify(page.items)}`);
        assert.ok(page.items.every(row => row.provider === "Llama CPP"), `provider attribution: ${label}`);
        assert.ok(page.items.every(row => row.totalTokens === 120), `usage after finish_reason: ${label}`);
        const all = await usageView.getStats("today", { includeProxy: true });
        const filtered = await usageView.getStats("today", { includeProxy: true, provider: "Llama CPP" });
        assert.equal(filtered.totals.requestCount, expectedRows, `provider filter: ${label}`);
        assert.equal(filtered.totals.totalTokens, 120 * expectedRows, label);
        assert.equal(all.totals.requestCount, filtered.totals.requestCount, label);
        assert.ok(Math.abs(filtered.totals.costUsd - expectedRows * 0.00032) < 1e-9, `custom cost: ${JSON.stringify(filtered.totals)}`);
        t.diagnostic(`#1806/#1801/#1809 verified ${label}: SQLite status=200 tokens=120 cost=0.00032`);
      }
      // #1808: native tool_use IDs must be valid before they enter the client
      // transcript; replay both the sanitized transcript and older poisoned IDs.
      if (billing) for (const stream of [false, true]) {
        const response = await fetch(`${gateway.url}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: `${runtimeName}/${model}`, max_tokens: 4, stream, messages: [{ role: "user", content: "tool" }], tools: [{ name: "Bash", input_schema: { type: "object", properties: { command: { type: "string" } } } }] }) });
        assert.equal(response.status, 200);
        const text = await response.text();
        const content = stream ? text.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6))).map(event => event.content_block).filter(Boolean) : JSON.parse(text).content;
        const call = content.find(block => block.type === "tool_use");
        assert.ok(call, text);
        assert.match(call.id, /^[a-zA-Z0-9_-]+$/, "#1808 client transcript ID");
        for (const id of [call.id, "functions.Bash:0"]) {
          const replay = await fetch(`${gateway.url}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "native/native", max_tokens: 4, messages: [{ role: "user", content: "tool" }, { role: "assistant", content: [{ type: "tool_use", id, name: "Bash", input: { command: "pwd" } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "/tmp" }] }] }) });
          assert.equal(replay.status, 200, await replay.text());
          const wire = captures.at(-1).body;
          assert.equal(wire.messages[1].content[0].id, wire.messages[2].content[0].tool_use_id);
        }
      }
      await stopGateway(gateway);
      gateway = undefined;
    }
    const { compileCoreGatewayConfig } = await import("@ccr/core/gateway/core-runtime/config-compiler.ts");
    const { fetchUpstreamWithFallback } = await import("@ccr/core/gateway/upstream/executor.ts");
    const { ccrRoutedModelHeader } = await import("@ccr/core/gateway/core-runtime/router-plugin-contract.ts");
    const routingConfig = createDefaultAppConfig();
    routingConfig.Providers = [
      { id: "anthropic-quota", name: "Anthropic", api_base_url: `${upstreamUrl}/anthropic-quota`, models: ["claude"], type: "anthropic_messages", api_key: "test" },
      { id: "primary", name: "Primary", api_base_url: `${upstreamUrl}/primary/v1`, models: ["k3"], type: "openai_chat_completions", api_key: "test" },
      { id: "backup", name: "Backup", api_base_url: `${upstreamUrl}/backup/api/v3`, models: ["glm-5.3"], type: "openai_chat_completions", api_key: "test", capabilities: [
        { type: "openai_chat_completions", source: "preset", baseUrl: `${upstreamUrl}/wrong` },
        { type: "openai_chat_completions", source: "detected", baseUrl: `${upstreamUrl}/backup/api/v3` },
        { type: "anthropic_messages", source: "detected", baseUrl: `${upstreamUrl}/anthropic` }
      ] }
    ];
    routingConfig.virtualModelProfiles = [{ id: "glm-vision", key: "glm-vision", displayName: "GLM 5.3 Vision", enabled: true, match: { exactAliases: ["GLM 5.3 Vision"], prefixes: [], suffixes: [] }, baseModel: { mode: "fixed", fixedModel: "Backup/glm-5.3" }, tools: [], execution: { mode: "tool_loop", maxTurns: 4, maxToolCalls: 4, clientToolsPolicy: "passthrough", streamMode: "optimistic" }, materialization: { enabled: true, includeInGatewayModels: true } }];
    const routingCompiled = await compileCoreGatewayConfig(routingConfig, "trace", "billing", "auth");
    const router = routingCompiled.plugins.find(plugin => plugin.key === "ccr-router");
    assert.ok(router, "CCR route resolver must be installed for #1804");
    router.modulePath = path.resolve(__dirname, "../../../runtime/router-plugin.js");
    gateway = await startGateway(root, { ...baseConfig, providers: routingCompiled.providers, plugins: [router], virtualModelProfiles: routingCompiled.virtualModelProfiles, rawTrace: { enabled: false }, billing: { enabled: false } });
    for (const stream of [false, true]) {
      const before = captures.length;
      const result = await fetchUpstreamWithFallback({
        body: Buffer.from(JSON.stringify({ model: "k3", max_tokens: 4, stream, messages: [{ role: "user", content: "hi" }] })),
        config: routingConfig, coreAuthToken: "auth", fallback: { mode: "model-chain", models: ["Backup/glm-5.3"], retryCount: 0 },
        headers: { "content-type": "application/json", [ccrRoutedModelHeader]: "Primary/k3" }, method: "POST", path: "/v1/chat/completions", routedModel: "Primary/k3", upstreamUrl: `${gateway.url}/v1/chat/completions`
      });
      assert.equal(result.response.status, 200, await result.response.text());
      assert.deepEqual(captures.slice(before).map(call => [call.path, call.body.model]), [["/primary/v1/chat/completions", "k3"], ["/backup/api/v3/chat/completions", "glm-5.3"]]);
    }
    t.diagnostic("#1804/#1819 verified real fallback wire URL and model; detected endpoint beats preset");
    const beforeVerification = captures.length;
    const verification = await fetch(`${gateway.url}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "anthropic/claude-ccr-h467573696f6e2f474c4d20352e3320566973696f6e", max_tokens: 4, messages: [{ role: "user", content: "hi" }] }) });
    assert.equal(verification.status, 200, await verification.text());
    assert.deepEqual(captures.slice(beforeVerification).map(call => [call.path, call.body.model]), [["/anthropic/v1/messages", "glm-5.3"]], "#1803 the exact encoded probe ID must reach the selected Fusion base, despite exhausted Anthropic quota");
    t.diagnostic("#1803 verified original encoded Fusion probe uses selected provider, not quota-exhausted Anthropic");
    await stopGateway(gateway);
    gateway = undefined;
    // #1810: load compiled static + dynamic plugins in the actual gateway.
    // Rotate the credentials file while the same gateway PID stays alive.
    const oldStorage = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
    const oldPath = process.env.PATH;
    const storage = path.join(root, "claude");
    mkdirSync(storage);
    const security = path.join(storage, "security");
    writeFileSync(security, "#!/bin/sh\nexit 44\n");
    chmodSync(security, 0o755);
    process.env.PATH = `${storage}${path.delimiter}${oldPath}`;
    process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = storage;
    try {
      const credentials = path.join(storage, ".credentials.json");
      writeFileSync(credentials, JSON.stringify({ accessToken: "oauth-before", refreshToken: "test-refresh" }));
      const { probeGatewayProvider } = await import("@ccr/core/providers/probe.ts");
      const oauthConfig = createDefaultAppConfig();
      oauthConfig.Providers = [
        { id: "claude-code-api", name: "Claude Code API", type: "anthropic_messages", api_base_url: `${upstreamUrl}/anthropic`, api_key: "ccr-local-agent-login", models: ["native"] },
        { id: "static-api", name: "Static API", type: "anthropic_messages", api_base_url: `${upstreamUrl}/anthropic`, api_key: "static-secret", models: ["native"] }
      ];
      oauthConfig.providerPlugins = [{ key: "ccr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API", auth: { headers: { authorization: "Bearer import-time-expired", "anthropic-beta": "oauth-2025-04-20" }, removeHeaders: ["x-api-key"], strict: true } }];
      const compiled = await compileCoreGatewayConfig(oauthConfig, "trace", "billing", "auth");
      const authPlugin = compiled.plugins.find(plugin => plugin.key === "ccr-local-agent-auth-provider-hooks");
      authPlugin.modulePath = path.resolve(__dirname, "../../../runtime/local-agent-auth-provider-hook.js");
      gateway = await startGateway(root, { ...baseConfig, providers: compiled.providers, plugins: [authPlugin], providerPlugins: compiled.providerPlugins, virtualModelProfiles: [], rawTrace: { enabled: false }, billing: { enabled: false } });
      const pid = gateway.child.pid;
      for (const token of ["oauth-before", "oauth-after"]) {
        writeFileSync(credentials, JSON.stringify({ accessToken: token, refreshToken: "test-refresh" }));
        const response = await fetch(`${gateway.url}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: `${compiled.providers[0].name}/native`, max_tokens: 4, messages: [{ role: "user", content: "hi" }] }) });
        assert.equal(response.status, 200, await response.text());
        assert.equal(captures.at(-1).headers.authorization, `Bearer ${token}`);
        assert.equal(captures.at(-1).headers["x-api-key"], undefined);
        const beforeProbe = captures.length;
        await probeGatewayProvider({ apiKey: "ccr-local-agent-login", baseUrl: `${upstreamUrl}/anthropic`, mode: "models", protocols: ["anthropic_messages"], providerPlugins: oauthConfig.providerPlugins });
        const probeCalls = captures.slice(beforeProbe);
        assert.ok(probeCalls.some(call => call.path.endsWith("/models")), "token rotation invalidates the model probe cache");
        assert.ok(probeCalls.every(call => call.headers.authorization === `Bearer ${token}`), "models and protocol probes must use the same live token");
        assert.equal(gateway.child.pid, pid);
      }
      const staticResponse = await fetch(`${gateway.url}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: `${compiled.providers[1].name}/native`, max_tokens: 4, messages: [{ role: "user", content: "hi" }] }) });
      assert.equal(staticResponse.status, 200, await staticResponse.text());
      assert.equal(captures.at(-1).headers["x-api-key"], "static-secret");
      assert.notEqual(captures.at(-1).headers.authorization, "Bearer oauth-after");
      t.diagnostic("#1810 verified live OAuth rotation and models probe without restarting; static API key preserved");
    } finally {
      if (oldStorage === undefined) delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
      else process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = oldStorage;
      process.env.PATH = oldPath;
    }
  } finally {
    if (gateway) await stopGateway(gateway);
    await close(sink);
    await sync.stop();
    await logs.close({ timeoutMs: 5000 });
    await Promise.all([close(upstream), close(sink)]);
    for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(root, { recursive: true, force: true });
  }
});

async function listen(server) {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { if (server.listening) await new Promise(resolve => server.close(resolve)); }
async function until(predicate, message, timeout = 10000) {
  const end = Date.now() + timeout;
  do { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } while (Date.now() < end);
  assert.fail(message);
}
async function startGateway(root, config) {
  const reserve = createServer();
  const url = await listen(reserve);
  const port = reserve.address().port;
  await close(reserve);
  const file = path.join(root, "gateway.json");
  writeFileSync(file, JSON.stringify({ ...config, port }));
  const child = spawn(process.execPath, [gatewayEntry], { env: { ...process.env, GATEWAY_CONFIG_PATH: file, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => output += chunk);
  child.stderr.on("data", chunk => output += chunk);
  try {
    await until(async () => { if (child.exitCode !== null) throw new Error(output); try { return (await fetch(`${url}/health`)).ok; } catch { return false; } }, "gateway startup", 10000);
    return { child, url };
  } catch (error) { child.kill(); throw new Error(`${error}\n${output}`); }
}
async function stopGateway({ child }) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise(resolve => { const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2000); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
}
