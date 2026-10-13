import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test, { before } from "node:test";
import { tmpdir } from "node:os";
let createDefaultAppConfig, gatewayService;
before(async () => {
  const root = path.join(process.env.CCR_INTERNAL_HOME_DIR || tmpdir(), "anthropic-http-" + process.pid);
  process.env.CCR_INTERNAL_HOME_DIR = path.join(root, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");
  ({ createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts"));
  ({ gatewayService } = await import("@ccr/core/gateway/service.ts"));
});

test("effort is normalized on the first upstream call in both runtimes", { timeout: 30000 }, async (t) => {
  const received = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    received.push(body);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "msg_effort", type: "message", role: "assistant", model: body.model,
      content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
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
  process.env.CCR_GATEWAY_ENTRY = createRequire(path.join(process.cwd(), "package.json")).resolve("@the-next-ai/ai-gateway");
  let config = createDefaultAppConfig();
  config.APIKEY = "effort-key";
  config.APIKEYS = [{ id: "client", key: config.APIKEY, createdAt: new Date(0).toISOString() }];
  config.profile.profiles = [];
  config.gateway = { enabled: true, host: "127.0.0.1", coreHost: "127.0.0.1", port: await freePort(), corePort: await freePort() };
  config.proxy.upstream.mode = "none";
  config.observability.requestLogs = false;
  config.Router.builtInRules = { "claude-code": { enabled: false }, codex: { enabled: false } };
  config.Providers = [{ id: "primary", name: "Primary", models: ["target"], api_key: "test",
    capabilities: [{ type: "anthropic_messages", baseUrl: "http://127.0.0.1:" + upstream.address().port }],
    modelMetadata: { target: { supportedReasoningLevels: ["low", "high", "max"].map(effort => ({ effort })) } } }];
  for (const wrapper of [false, true]) {
    config = structuredClone(config);
    config.Router.fallback = { mode: wrapper ? "model-chain" : "off", models: ["Primary/target"], retryCount: 0 };
    const status = wrapper ? await gatewayService.updateConfig(config).then(() => gatewayService.getStatus()) : await gatewayService.start(config);
    assert.equal(status.state, "running", status.lastError);
    assert.equal(status.endpoint !== status.coreEndpoint, wrapper);
    for (const [effort, expected] of [["medium", "high"], ["ultra", "max"], ["auto", "auto"]]) {
      const before = received.length;
      const response = await fetch(status.endpoint + "/v1/messages", {
        method: "POST", headers: { "content-type": "application/json", "x-api-key": config.APIKEY },
        body: JSON.stringify({ model: "Primary/target", messages: [{ role: "user", content: "hi" }], max_tokens: 16,
          output_config: { effort, format: { type: "json_schema" } } }), signal: AbortSignal.timeout(5000)
      });
      assert.equal(response.status, 200, await response.text());
      assert.equal(received.length, before + 1);
      assert.deepEqual(received.at(-1).output_config, { effort: expected, format: { type: "json_schema" } });
    }
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
