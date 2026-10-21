import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Keep the test away from the developer's real CCR state: the config
// repository and the gateway service both resolve their state from the
// runtime home directory, so point it at a throwaway directory.
const isolatedHome = mkdtempSync(path.join(os.tmpdir(), "ccr-external-attach-test-"));
process.env.CCR_INTERNAL_HOME_DIR = isolatedHome;
process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(isolatedHome, "data");

const { createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts");
const { loadAppConfig, saveAppConfig } = await import("@ccr/core/config/config.ts");
const { replacePersistedApiKeys } = await import("@ccr/core/config/config-repository.ts");
const { probeExistingCcrGateway } = await import("@ccr/core/gateway/existing-gateway-probe.ts");
const { gatewayRuntimeConfigRevision } = await import("@ccr/core/gateway/runtime-config-control.ts");
const { gatewayService } = await import("@ccr/core/gateway/service.ts");

test.after(() => {
  rmSync(isolatedHome, { force: true, recursive: true });
});

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function createHealthyCcrGateway(apiKey, state = {}) {
  if (state.revision === undefined) state.revision = "test-revision";
  return createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/health") {
      sendJson(response, 200, {
        core: "http://127.0.0.1:3457",
        status: "running",
        timestamp: new Date().toISOString()
      });
      return;
    }
    if (url.pathname === "/") {
      sendJson(response, 200, {
        core: "next-ai-gateway",
        endpoints: ["GET /v1/models"],
        name: "claude-code-router",
        plugin: "claude-code-router"
      });
      return;
    }
    if (url.pathname === "/v1/models") {
      if (request.headers.authorization !== `Bearer ${apiKey}`) {
        sendJson(response, 401, { error: { message: "Invalid API key." } });
        return;
      }
      sendJson(response, 200, { data: [{ id: "test-model", object: "model" }], object: "list" });
      return;
    }
    if (url.pathname === "/__ccr/runtime/config") {
      if (request.headers.authorization !== `Bearer ${apiKey}`) {
        sendJson(response, 401, { error: { message: "Invalid API key." } });
        return;
      }
      if (request.method === "POST") {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          try {
            state.revision = JSON.parse(body).configRevision;
          } catch {
            // keep the previous revision
          }
          sendJson(response, 202, {
            accepted: true,
            configRevision: state.revision,
            restarting: false
          });
        });
        return;
      }
      sendJson(response, 200, { revision: state.revision, state: "running" });
      return;
    }
    sendJson(response, 404, { error: { message: "Not found." } });
  });
}

test("existing gateway probe finds a key that is only stored in the api key database", async () => {
  const apiKey = "persisted-only-key";
  const gatewayPort = await findAvailablePort();
  const config = createDefaultAppConfig();
  config.gateway.port = gatewayPort;
  // Modern installs keep the gateway key in the api_keys table and leave the
  // legacy config fields empty.
  config.APIKEY = "";
  config.APIKEYS = [];
  await replacePersistedApiKeys([{ createdAt: new Date().toISOString(), id: "local-gateway", key: apiKey, name: "Local Gateway" }]);

  const externalGateway = createHealthyCcrGateway(apiKey);
  await new Promise((resolve) => externalGateway.listen(gatewayPort, "127.0.0.1", resolve));

  try {
    const probe = await probeExistingCcrGateway(config);
    assert.equal(probe.state, "usable");
    assert.equal(probe.apiKey, apiKey);
  } finally {
    await new Promise((resolve) => externalGateway.close(resolve));
    await replacePersistedApiKeys([]);
  }
});

test("adopting an external gateway keeps a usable core auth token", async () => {
  const apiKey = "persisted-only-key";
  const gatewayPort = await findAvailablePort();
  const corePort = await findAvailablePort();
  const config = await loadAppConfig();
  config.gateway.port = gatewayPort;
  config.gateway.corePort = corePort;
  config.APIKEY = "";
  config.APIKEYS = [];
  await replacePersistedApiKeys([{ createdAt: new Date().toISOString(), id: "local-gateway", key: apiKey, name: "Local Gateway" }]);

  const externalGatewayState = { revision: undefined };
  const savedConfig = await saveAppConfig(config);
  externalGatewayState.revision = gatewayRuntimeConfigRevision(savedConfig);
  const externalGateway = createHealthyCcrGateway(apiKey, externalGatewayState);
  await new Promise((resolve) => externalGateway.listen(gatewayPort, "127.0.0.1", resolve));

  try {
    await gatewayService.stop();
    const status = await gatewayService.ensureStarted(config);

    assert.equal(status.state, "running", status.lastError);
    assert.equal(status.gatewayManagedExternally, true);
    // The adopted gateway owns its own core runtime, so the adopting process
    // cannot leave the core auth token empty: the upstream executor refuses to
    // send a request without a credential and every proxied call would fail
    // with "Core gateway auth token is not initialized.".
    assert.equal(gatewayService.coreAuthToken, apiKey);
    // Requests have to be forwarded to the endpoint this process can
    // authenticate against.
    assert.equal(status.coreEndpoint, `http://127.0.0.1:${gatewayPort}`);
  } finally {
    await gatewayService.stop();
    await new Promise((resolve) => externalGateway.close(resolve));
    await replacePersistedApiKeys([]);
  }
});

test("a gateway without a core auth token answers with a retryable 503", async () => {
  const { GatewayRequestPipeline } = await import("@ccr/core/gateway/request/pipeline.ts");
  const { ClaudeCodeRouterPlugin } = await import("@ccr/core/gateway/claude-code-router-plugin.ts");
  const { Readable, Writable } = await import("node:stream");

  const config = createDefaultAppConfig();
  config.observability.requestLogs = false;
  config.contextArchive.enabled = false;
  config.Providers = [{ name: "Primary", models: ["model"], type: "openai_chat_completions", api_base_url: "http://127.0.0.1:9/v1" }];
  const router = new ClaudeCodeRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    // The core runtime is restarting, so there is no credential to forward with.
    getCoreAuthToken: () => "",
    getPlugin: () => router,
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" })
  });

  const request = Readable.from([Buffer.from(JSON.stringify({ model: "Primary/model", messages: [{ role: "user", content: "hi" }] }))]);
  request.method = "POST";
  request.url = "/v1/messages";
  request.headers = { "content-type": "application/json" };
  const chunks = [];
  let status;
  const response = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    }
  });
  response.writeHead = (value) => {
    status = value;
    return response;
  };

  await pipeline.proxyRequest(request, response, "/v1/messages");

  assert.equal(status, 503);
  const payload = JSON.parse(chunks.join(""));
  assert.match(payload.error.message, /not ready/i);
  assert.doesNotMatch(payload.error.message, /auth token is not initialized/);
});
