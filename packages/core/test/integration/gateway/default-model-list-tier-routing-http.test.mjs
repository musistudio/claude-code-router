import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test, { before } from "node:test";
import { tmpdir } from "node:os";
let createDefaultAppConfig, gatewayService;
before(async () => {
  const root = path.join(process.env.CCR_INTERNAL_HOME_DIR || tmpdir(), "default-http-" + process.pid);
  process.env.CCR_INTERNAL_HOME_DIR = path.join(root, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");
  ({ createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts"));
  ({ gatewayService } = await import("@ccr/core/gateway/service.ts"));
});

test("real single and wrapper gateways route default tiers and preserve Anthropic response names", { timeout: 30000 }, async (t) => {
  const received = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    received.push(body.model);
    let message = { id: "msg_tier", type: "message", role: "assistant", model: body.model,
      content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
    if (request.url.endsWith("/chat/completions")) {
      message = { id: "chatcmpl_tier", object: "chat.completion", model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    } else if (request.url.endsWith("/responses")) {
      message = { id: "resp_tier", object: "response", status: "completed", model: body.model,
        output: [{ id: "msg_tier", type: "message", role: "assistant", status: "completed",
          content: [{ type: "output_text", text: "ok", annotations: [] }] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    }
    response.writeHead(200, { "content-type": body.stream ? "text/event-stream" : "application/json" });
    if (!body.stream) response.end(JSON.stringify(message));
    else {
      const events = [
        { type: "message_start", message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
        { type: "message_stop" }
      ];
      const chunks = events.map(event => "event: " + event.type + "\ndata: " + JSON.stringify(event) + "\n\n");
      if (body.messages[0]?.content === "reset") {
        response.write(chunks[0]);
        setTimeout(() => response.destroy(), 10);
      } else response.end(chunks.join(""));
    }
  });
  const previousEntry = process.env.CCR_GATEWAY_ENTRY;
  t.after(async () => {
    await gatewayService.stop();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    if (previousEntry === undefined) delete process.env.CCR_GATEWAY_ENTRY;
    else process.env.CCR_GATEWAY_ENTRY = previousEntry;
  });
  await listen(upstream);
  const baseUrl = "http://127.0.0.1:" + upstream.address().port;
  process.env.CCR_GATEWAY_ENTRY = createRequire(path.join(process.cwd(), "package.json")).resolve("@the-next-ai/ai-gateway");
  let config = createDefaultAppConfig();
  config.APIKEY = "tier-key";
  config.APIKEYS = [{ id: "profile:tiers", key: config.APIKEY, createdAt: new Date(0).toISOString() }];
  config.profile = { ...config.profile, enabled: true, profiles: [{
    id: "tiers", name: "Tiers", agent: "claude-code", enabled: true, scope: "ccr", claudeDefaultModelList: true,
    model: "Primary/default", fableModel: "Primary/fable", opusModel: "Primary/opus",
    sonnetModel: "Primary/sonnet", haikuModel: "Primary/haiku", availableModels: ["Primary/default"]
  }] };
  config.gateway = { enabled: true, host: "127.0.0.1", coreHost: "127.0.0.1", port: await freePort(), corePort: await freePort() };
  config.proxy.upstream.mode = "none";
  config.observability.requestLogs = false;
  config.Router.builtInRules = { "claude-code": { enabled: false }, codex: { enabled: false } };
  config.Providers = [{ id: "primary", name: "Primary", models: ["default", "fable", "opus", "sonnet", "haiku"], api_key: "test",
    capabilities: ["anthropic_messages", "openai_chat_completions", "openai_responses"].map(type => ({
      type, baseUrl: baseUrl + (type === "anthropic_messages" ? "" : "/v1")
    })) }, { id: "ccs", name: "CCS", models: ["claude-sonnet-5-5"], api_key: "test",
      capabilities: [{ type: "anthropic_messages", baseUrl }] }];
  const cases = [
    ["/v1/messages", "claude-sonnet-5-5", "sonnet", false],
    ["/v1/messages", "claude-haiku-5-5", "haiku", true],
    ["/v1/chat/completions", "claude-fable-99-preview", "fable", false],
    ["/v1/responses", "claude-opus-5.5", "opus", false]
  ];
  const headers = { "content-type": "application/json", "x-api-key": config.APIKEY, "user-agent": "claude-cli/2.1.281" };
  for (const wrapper of [false, true]) {
    config = structuredClone(config);
    config.Router.fallback = { mode: wrapper ? "model-chain" : "off", models: ["Primary/default"], retryCount: 0 };
    const status = wrapper ? await gatewayService.updateConfig(config).then(() => gatewayService.getStatus()) : await gatewayService.start(config);
    assert.equal(status.state, "running", status.lastError);
    assert.equal(status.endpoint !== status.coreEndpoint, wrapper);
    const models = await fetch(status.endpoint + "/v1/models", { headers }).then(response => response.json());
    assert.equal(models.data.length, 4);
    assert.equal(models.data.find(model => model.display_name === "Haiku 5.5")?.id, "claude-haiku-5-5");
    for (const [route, model, target, stream] of cases) {
      const response = await fetch(status.endpoint + route, {
        method: "POST", headers, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ model, stream, max_tokens: 16,
          ...(route === "/v1/responses" ? { input: "hi" } : { messages: [{ role: "user", content: "hi" }] }) })
      });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      assert.equal(received.at(-1), target);
      if (route === "/v1/messages") {
        if (stream) { assert.ok(text.includes(JSON.stringify(model)), text); assert.match(text, /event: message_stop/); }
        else assert.equal(JSON.parse(text).model, model);
      }
    }
    const counted = await fetch(status.endpoint + "/v1/messages/count_tokens", {
      method: "POST", headers, body: JSON.stringify({ model: "claude-sonnet-99", messages: [] })
    }).then(response => response.json());
    assert.equal(typeof counted.input_tokens, "number");
    await assert.rejects(async () => {
      const reset = await fetch(status.endpoint + "/v1/messages", {
        method: "POST", headers, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ model: "claude-sonnet-5-5", stream: true, max_tokens: 16,
          messages: [{ role: "user", content: "reset" }] })
      });
      await reset.text();
    });
    assert.equal(received.at(-1), "sonnet");
    assert.equal((await fetch(status.endpoint + "/v1/models", { headers })).status, 200);
    assert.equal(gatewayService.getStatus().state, "running");
  }
});
function listen(server) {
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
}
async function freePort() {
  const server = createServer();
  await listen(server);
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
