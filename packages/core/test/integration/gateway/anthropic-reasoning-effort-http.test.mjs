import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ccrRoutedModelHeader } from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";

test("Anthropic routes normalize effort before the first upstream request", { timeout: 30_000 }, async (t) => {
  const received = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    received.push(body);
    const message = { id: "msg_effort", type: "message", role: "assistant", model: body.model,
      content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
    if (body.stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message })}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`);
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(message));
    }
  });
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  await listen(upstream);
  const reservation = createServer();
  await listen(reservation);
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const appConfig = createDefaultAppConfig();
  appConfig.APIKEYS = [{ id: "profile:effort", key: "effort-test", createdAt: new Date(0).toISOString() }];
  appConfig.Providers = [{
    id: "primary", name: "Primary", type: "anthropic_messages", models: ["glm-5.3"],
    modelMetadata: { "glm-5.3": { supportedReasoningLevels: ["low", "high", "max"].map((effort) => ({ effort })) } }
  }];
  appConfig.profile.profiles = [{
    ...appConfig.profile.profiles[0], id: "effort", enabled: true, claudeDefaultModelList: true,
    model: "Primary/glm-5.3", opusModel: "Primary/glm-5.3"
  }];
  const temporaryHome = mkdtempSync(path.join(os.tmpdir(), "ccr-effort-http-"));
  const runtimeDir = path.resolve(".test-dist/core/runtime");
  const child = fork(path.join(runtimeDir, "gateway-bootstrap.js"), [], {
    cwd: temporaryHome,
    env: { ...process.env, CCR_INTERNAL_HOME_DIR: temporaryHome,
      CCR_INTERNAL_APP_DATA_DIR: path.join(temporaryHome, "app-data"),
      CCR_INTERNAL_USER_DATA_DIR: path.join(temporaryHome, "user-data") },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-5000); });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    // This directory belongs solely to the test, including any runtime state.
    readdirSync(temporaryHome);
    rmSync(temporaryHome, { recursive: true, force: true });
  });
  child.send({
    type: "gateway:start", protocolVersion: 1,
    gatewayEntry: createRequire(path.resolve("package.json")).resolve("@the-next-ai/ai-gateway"),
    config: {
      host: "127.0.0.1", port, auth: { enabled: false, required: false },
      logging: { enabled: false }, billing: { enabled: false }, providerHealthCheck: { enabled: false },
      providers: [{ name: "primary", type: "anthropic_messages", apiKey: "test",
        baseurl: `http://127.0.0.1:${upstream.address().port}`, models: ["glm-5.3"] }],
      plugins: [{ key: "ccr-router", enabled: true, modulePath: path.join(runtimeDir, "router-plugin.js"), config: { appConfig } }]
    }
  });
  const endpoint = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(`${endpoint}/health`).catch(() => undefined);
    if (ready) { await ready.arrayBuffer(); break; }
    assert.ok(attempt < 100 && child.exitCode === null, output || "Gateway did not start");
    await delay(50);
  }

  for (const wrapper of [false, true]) {
    for (const [effort, expected, stream] of [["medium", "high", false], ["xhigh", "max", true], ["ultra", "max", false], ["low", "low", false]]) {
      const countBefore = received.length;
      const model = wrapper ? "glm-5.3" : "claude-opus-5-5";
      const format = { type: "json_schema", schema: { type: "object" } };
      const response = await fetch(`${endpoint}/v1/messages`, {
        method: "POST", headers: { "content-type": "application/json", "x-api-key": "effort-test",
          ...(wrapper ? { [ccrRoutedModelHeader]: "Primary/glm-5.3" } : {}) },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hello" }], max_tokens: 32,
          output_config: { effort, format }, thinking: { type: "adaptive" }, stream })
      });
      const text = await response.text();
      assert.equal(response.status, 200, `${output}\n${text}`);
      assert.equal(received.length, countBefore + 1, "one upstream request, with no error/retry needed");
      assert.equal(received.at(-1).model, "glm-5.3");
      assert.deepEqual(received.at(-1).output_config, { effort: expected, format });
      assert.deepEqual(received.at(-1).thinking, { type: "adaptive" });
      if (!wrapper && !stream) assert.equal(JSON.parse(text).model, model);
    }
  }
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}
