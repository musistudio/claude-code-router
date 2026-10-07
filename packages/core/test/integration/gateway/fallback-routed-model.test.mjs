import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { ccrRouterPluginKey } from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";
import { GatewayHttpRequestHandler } from "@ccr/core/gateway/http/request-handler.ts";
import { coreGatewayAuthHeader } from "@ccr/core/gateway/internal/shared.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import { toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology.ts";

// #1850: the ingress stamps x-ccr-routed-model once, and the core gateway
// resolves the route from that header before the body. These tests run the
// ingress pipeline, the real core gateway with the CCR router plugin, and fake
// providers, then check which provider and model each fallback hop reached.
const coreAuthToken = "test-core-token";
const gatewayApiKey = "test-gateway-key";
const caseHeader = "x-ccr-test-case";

// Each fallback waits about a second of executor backoff, so the cases run
// concurrently and each request carries its own marker.
describe("model-chain fallback through the core gateway (#1850)", { concurrency: true, timeout: 60000 }, () => {
  let harness;
  before(async () => {
    harness = await startHarness();
  });
  after(async () => {
    await harness?.close();
  });

  const cases = [
    ["router rule, first hop rate limited", "rule-429", "Primary/ep-a", [["primary", "ep-a"], ["backup", "ep-b"]], 200],
    ["router rule, first hop rejects with 400", "rule-400", "Primary/ep-bad", [["primary", "ep-bad"], ["backup", "ep-b"]], 200],
    // The core gateway retries a dropped connection once before it reports 502.
    ["router rule, first hop drops the connection", "rule-drop", "Primary/ep-drop", [["primary", "ep-drop"], ["primary", "ep-drop"], ["backup", "ep-b"]], 200],
    ["router rule, three hops", "rule-three-hops", "Primary/ep-a", [["primary", "ep-a"], ["primary", "ep-bad"], ["backup", "ep-b"]], 200],
    ["router rule, same model id under two providers", "rule-shared-id", "Primary/ep-shared", [["primary", "ep-shared"], ["backup", "ep-shared"]], 200],
    ["router rule, fallback to another protocol", "rule-cross-protocol", "Primary/ep-a", [["primary", "ep-a"], ["backup-chat", "ep-chat"]], 200],
    ["router rule, fallback to a credential pool", "rule-credential-pool", "Primary/ep-a", [["primary", "ep-a"], ["pooled", "ep-pool"]], 200],
    ["router rule, first hop succeeds", "rule-first-ok", "Backup/ep-b", [["backup", "ep-b"]], 200],
    ["router rule, fallback off", "rule-no-fallback", "Primary/ep-a", [["primary", "ep-a"]], 429],
    ["router rule, retry mode keeps the same model", "rule-retry", "Primary/ep-a", [["primary", "ep-a"], ["primary", "ep-a"]], 429],
    ["default routing, provider-qualified client model", undefined, "Primary/ep-a", [["primary", "ep-a"], ["backup", "ep-b"]], 200],
    ["default routing, bare client model", undefined, "ep-a", [["primary", "ep-a"], ["backup", "ep-b"]], 200]
  ];
  for (const [index, [name, testCase, clientModel, expectedHops, expectedStatus]] of cases.entries()) {
    test(name, async () => {
      const marker = `case-${index}`;
      const response = await harness.send({ clientModel, marker, testCase });
      assert.deepEqual(harness.hopsFor(marker), expectedHops.map(([provider, model]) => ({ model, provider })));
      assert.equal(response.status, expectedStatus, response.text);
    });
  }

  test("router rule, streaming request", async () => {
    const marker = "case-stream";
    const response = await harness.send({ clientModel: "Primary/ep-a", marker, stream: true, testCase: "rule-429" });
    assert.deepEqual(harness.hopsFor(marker), [
      { model: "ep-a", provider: "primary" },
      { model: "ep-b", provider: "backup" }
    ]);
    assert.equal(response.status, 200, response.text);
    assert.match(response.text, /event: message_stop/);
  });
});

function createTestConfig(providerOrigin) {
  const config = createDefaultAppConfig();
  config.APIKEY = gatewayApiKey;
  config.Providers = [
    { apikey: "test-primary", baseurl: `${providerOrigin}/primary`, models: ["ep-a", "ep-bad", "ep-drop", "ep-shared"], name: "Primary", type: "anthropic_messages" },
    { apikey: "test-backup", baseurl: `${providerOrigin}/backup`, models: ["ep-b", "ep-shared"], name: "Backup", type: "anthropic_messages" },
    { apikey: "test-chat", baseurl: `${providerOrigin}/backup-chat/v1`, models: ["ep-chat"], name: "Backup Chat", type: "openai_chat_completions" },
    {
      capabilities: [{ baseUrl: `${providerOrigin}/pooled`, type: "anthropic_messages" }],
      credentials: [{ apiKey: "test-pool-1", id: "pool-1" }, { apiKey: "test-pool-2", id: "pool-2" }],
      id: "pooled",
      models: ["ep-pool"],
      name: "Pooled"
    }
  ];
  const chain = (...models) => ({ mode: "model-chain", models, retryCount: 0 });
  const rule = (id, target, fallback) => ({
    condition: { left: `request.headers.${caseHeader}`, operator: "==", right: id },
    enabled: true,
    fallback,
    id,
    name: id,
    rewrites: [{ key: "request.body.model", operation: "set", value: target }],
    type: "condition"
  });
  config.Router.fallback = chain("Backup/ep-b");
  config.Router.rules = [
    rule("rule-429", "Primary/ep-a", chain("Backup/ep-b")),
    rule("rule-400", "Primary/ep-bad", chain("Backup/ep-b")),
    rule("rule-drop", "Primary/ep-drop", chain("Backup/ep-b")),
    rule("rule-three-hops", "Primary/ep-a", chain("Primary/ep-bad", "Backup/ep-b")),
    rule("rule-shared-id", "Primary/ep-shared", chain("Backup/ep-shared")),
    rule("rule-cross-protocol", "Primary/ep-a", chain("Backup Chat/ep-chat")),
    rule("rule-credential-pool", "Primary/ep-a", chain("Pooled/ep-pool")),
    rule("rule-first-ok", "Backup/ep-b", chain("Primary/ep-a")),
    rule("rule-no-fallback", "Primary/ep-a", { mode: "off", models: [], retryCount: 0 }),
    rule("rule-retry", "Primary/ep-a", { mode: "retry", models: [], retryCount: 1 })
  ];
  return config;
}

async function startHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "ccr-fallback-routed-model-"));
  const hops = [];
  const provider = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    const body = JSON.parse(text || "{}");
    const providerName = request.url.split("/")[1];
    hops.push({ marker: text.match(/case-[\w-]+/)?.[0], model: body.model, provider: providerName });
    respondAsProvider(response, providerName, body);
  });
  const servers = [provider];
  let child;
  let output = "";
  const close = async () => {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 2000);
      await exited;
      clearTimeout(force);
    }
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    rmSync(root, { force: true, recursive: true });
  };
  try {
    await listen(provider);
    const config = createTestConfig(`http://127.0.0.1:${provider.address().port}`);
    const corePort = await reservePort();
    const configFile = path.join(root, "core-gateway.json");
    writeFileSync(configFile, JSON.stringify({
      auth: {
        enabled: true,
        mode: "static_api_key",
        required: true,
        staticApiKeys: { keyBearerOnly: false, keyHeader: coreGatewayAuthHeader, keys: [coreAuthToken] }
      },
      host: "127.0.0.1",
      logging: { enabled: false },
      plugins: [
        { config: { appConfig: config, coreAuthToken }, enabled: true, key: ccrRouterPluginKey, modulePath: path.resolve(".test-dist/core/runtime/router-plugin.js") },
        { enabled: true, key: "ccr-upstream-header-sanitizer", modulePath: path.resolve(".test-dist/core/runtime/upstream-header-sanitizer.js") }
      ],
      port: corePort,
      providers: config.Providers.flatMap(toCoreGatewayProviders)
    }));
    child = spawn(process.execPath, [path.resolve("node_modules/@the-next-ai/ai-gateway/dist/index.js")], {
      cwd: root,
      env: { ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE, GATEWAY_CONFIG_PATH: configFile, PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-8000); });
    child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-8000); });
    const coreEndpoint = `http://127.0.0.1:${corePort}`;
    await waitForHealth(coreEndpoint, () => child.exitCode !== null, () => output);

    const plugin = new ClaudeCodeRouterPlugin(config);
    const status = { coreEndpoint, endpoint: "http://127.0.0.1:0", state: "running" };
    const pipeline = new GatewayRequestPipeline({
      getBrowserWebSearchMcpIntegration: () => undefined,
      getConfig: () => config,
      getCoreAuthToken: () => coreAuthToken,
      getPlugin: () => plugin,
      getStatus: () => status
    });
    const handler = new GatewayHttpRequestHandler({
      getBrowserAutomationMcpIntegration: () => undefined,
      getConfig: () => config,
      getPlugin: () => plugin,
      getRuntimeConfigControlStatus: () => ({ revision: "a".repeat(64) }),
      getStatus: () => status,
      handleBillingUsageSync: unsupported,
      handleRawTraceSync: unsupported,
      proxyRequest: (request, response, requestPath, apiKey) => pipeline.proxyRequest(request, response, requestPath, apiKey),
      requestRuntimeConfigReload: () => {},
      replayContextArchive: async () => ({ message: "not configured", ok: false, statusCode: 404 })
    });
    const ingress = createServer((request, response) => {
      void handler.handleRequest(request, response).catch((error) => {
        if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: String(error?.message ?? error) } }));
      });
    });
    servers.push(ingress);
    await listen(ingress);
    const ingressOrigin = `http://127.0.0.1:${ingress.address().port}`;
    status.endpoint = ingressOrigin;

    return {
      close,
      hopsFor: (marker) => hops.filter((hop) => hop.marker === marker).map(({ model, provider }) => ({ model, provider })),
      async send({ clientModel, marker, stream = false, testCase }) {
        const response = await fetch(`${ingressOrigin}/v1/messages`, {
          body: JSON.stringify({ max_tokens: 8, messages: [{ content: `hello ${marker}`, role: "user" }], model: clientModel, stream }),
          headers: { authorization: `Bearer ${gatewayApiKey}`, "content-type": "application/json", ...(testCase ? { [caseHeader]: testCase } : {}) },
          method: "POST",
          signal: AbortSignal.timeout(15000)
        });
        return { status: response.status, text: await response.text() };
      }
    };
  } catch (error) {
    await close();
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`);
  }
}

function respondAsProvider(response, providerName, body) {
  if (providerName === "primary" && body.model === "ep-drop") {
    response.socket.destroy();
    return;
  }
  if (providerName === "primary" && body.model !== "ep-bad") {
    response.writeHead(429, { "content-type": "application/json", "retry-after": "0.001" });
    response.end(JSON.stringify({ error: { message: "rate limited", type: "rate_limit_error" }, type: "error" }));
    return;
  }
  if (providerName === "primary") {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "bad request", type: "invalid_request_error" }, type: "error" }));
    return;
  }
  if (providerName === "backup-chat") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [{ finish_reason: "stop", index: 0, message: { content: "ok", role: "assistant" } }],
      id: "chat-test",
      model: body.model,
      object: "chat.completion",
      usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 }
    }));
    return;
  }
  const message = {
    content: [{ text: "ok", type: "text" }],
    id: "msg-test",
    model: body.model,
    role: "assistant",
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 1, output_tokens: 1 }
  };
  if (!body.stream) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(message));
    return;
  }
  response.writeHead(200, { "content-type": "text/event-stream" });
  const events = [
    ["message_start", { message: { ...message, content: [], stop_reason: null }, type: "message_start" }],
    ["content_block_start", { content_block: { text: "", type: "text" }, index: 0, type: "content_block_start" }],
    ["content_block_delta", { delta: { text: "ok", type: "text_delta" }, index: 0, type: "content_block_delta" }],
    ["content_block_stop", { index: 0, type: "content_block_stop" }],
    ["message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, type: "message_delta", usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }]
  ];
  response.end(events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""));
}

async function waitForHealth(origin, hasExited, readOutput) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (hasExited()) throw new Error(`core gateway exited before it was ready\n${readOutput()}`);
    try {
      if ((await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {}
    await delay(50);
  }
  throw new Error(`core gateway did not become ready\n${readOutput()}`);
}

async function reservePort() {
  const reservation = createServer();
  await listen(reservation);
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  return port;
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}

async function unsupported() {
  throw new Error("not supported in this test");
}
