import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const previousRuntimeEnv = {
  appData: process.env.CCR_INTERNAL_APP_DATA_DIR,
  home: process.env.CCR_INTERNAL_HOME_DIR,
  userData: process.env.CCR_INTERNAL_USER_DATA_DIR
};
const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-web-management-test-"));
process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(runtimeRoot, "app-data");
process.env.CCR_INTERNAL_HOME_DIR = path.join(runtimeRoot, "home");
process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(runtimeRoot, "user-data");

after(() => {
  setOptionalEnv("CCR_INTERNAL_APP_DATA_DIR", previousRuntimeEnv.appData);
  setOptionalEnv("CCR_INTERNAL_HOME_DIR", previousRuntimeEnv.home);
  setOptionalEnv("CCR_INTERNAL_USER_DATA_DIR", previousRuntimeEnv.userData);
  rmSync(runtimeRoot, { force: true, recursive: true });
});

test("normalizeExternalHttpTarget accepts absolute http, https, and CCR plugin URLs only", async () => {
  const { normalizeExternalHttpTarget } = await import("@ccr/core/web/management-server.ts");
  assert.equal(normalizeExternalHttpTarget(""), undefined);
  assert.equal(normalizeExternalHttpTarget(undefined), undefined);
  assert.equal(normalizeExternalHttpTarget("about:blank"), undefined);
  assert.equal(normalizeExternalHttpTarget(" https://example.com/path?q=1 "), "https://example.com/path?q=1");
  assert.equal(normalizeExternalHttpTarget("http://localhost:3458/"), "http://localhost:3458/");
  assert.throws(() => normalizeExternalHttpTarget("file:///etc/passwd"), /Only http, https, and CCR plugin URLs/);
  assert.throws(() => normalizeExternalHttpTarget("javascript:alert(1)"), /Only http, https, and CCR plugin URLs/);
  assert.throws(() => normalizeExternalHttpTarget("example.com"), /valid absolute URL/);
});

test("web RPC ignores Origin and Referer when the auth token is valid", async () => {
  const { startWebManagementServer } = await import("@ccr/core/web/management-server.ts");
  const authToken = "test-web-auth-token";
  const runtime = await startWebManagementServer({
    authToken,
    host: "127.0.0.1",
    port: 0,
    startGateway: false
  });
  try {
    const endpoint = new URL("/api/ccr/rpc", runtime.url);
    const response = await fetch(endpoint, {
      body: JSON.stringify({ args: [], method: "getAppInfo" }),
      headers: {
        "content-type": "application/json",
        "origin": "http://127.0.0.1:8000",
        "referer": "http://127.0.0.1:8000/",
        "x-ccr-web-auth": authToken
      },
      method: "POST"
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.value.name, "Claude Code Router");
  } finally {
    await runtime.close();
  }
});

test("startGateway reuses an already healthy CCR gateway on the configured port", async () => {
  const { saveAppConfig } = await import("@ccr/core/config/config.ts");
  const { createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts");
  const { gatewayRuntimeConfigRevision } = await import("@ccr/core/gateway/runtime-config-control.ts");
  const { gatewayService } = await import("@ccr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@ccr/core/web/management-server.ts");
  await gatewayService.stop();
  const gatewayPort = await findAvailablePort();
  const webAuthToken = "test-web-auth-token";
  const config = createDefaultAppConfig();
  config.gateway.port = gatewayPort;
  config.gateway.corePort = await findAvailablePort();
  config.Providers = [{
    api_base_url: "http://127.0.0.1:9/v1",
    api_key: "test-provider-key",
    id: "test-provider",
    models: ["test-model"],
    name: "Test Provider",
    type: "openai_chat_completions"
  }];
  const savedConfig = await saveAppConfig(config);
  const externalGatewayState = {
    reloadRequests: [],
    revision: gatewayRuntimeConfigRevision(savedConfig)
  };
  const externalGateway = createHealthyCcrGateway(savedConfig.APIKEY, externalGatewayState);
  await listen(externalGateway, gatewayPort);
  const runtime = await startWebManagementServer({
    authToken: webAuthToken,
    host: "127.0.0.1",
    port: 0,
    startGateway: false
  });

  try {
    const payload = await rpc(runtime.url, webAuthToken, "startGateway");

    assert.equal(payload.ok, true);
    assert.equal(payload.value.state, "running", payload.value.lastError);
    assert.equal(payload.value.endpoint, `http://127.0.0.1:${gatewayPort}`);
    assert.equal(payload.value.gatewayManagedExternally, true);
    assert.equal(gatewayService.getStatus().state, "running");
    assert.equal(gatewayService.getStatus().gatewayManagedExternally, true);

    const secondStart = await rpc(runtime.url, webAuthToken, "startGateway");
    assert.equal(secondStart.ok, true);
    assert.equal(secondStart.value.endpoint, `http://127.0.0.1:${gatewayPort}`);
    assert.equal(secondStart.value.gatewayManagedExternally, true);

    const nextConfig = structuredClone(savedConfig);
    nextConfig.Providers[0].name = "Updated Test Provider";
    const reloadCountBeforeSave = externalGatewayState.reloadRequests.length;
    const saveResult = await rpc(runtime.url, webAuthToken, "saveConfig", [nextConfig, { applyProfile: false }]);
    assert.equal(saveResult.ok, true);
    assert.equal(externalGatewayState.reloadRequests.length, reloadCountBeforeSave + 1);
    assert.equal(externalGatewayState.reloadRequests.at(-1).forceRestart, true);
    assert.equal(externalGatewayState.revision, gatewayRuntimeConfigRevision(saveResult.value));
    assert.equal(gatewayService.getStatus().gatewayManagedExternally, true);
  } finally {
    await runtime.close();
    await gatewayService.stop();
    await closeServer(externalGateway);
  }
});

async function rpc(baseUrl, authToken, method, args = []) {
  const response = await fetch(new URL("/api/ccr/rpc", baseUrl), {
    body: JSON.stringify({ args, method }),
    headers: {
      "content-type": "application/json",
      "x-ccr-web-auth": authToken
    },
    method: "POST"
  });
  assert.equal(response.status, 200);
  return response.json();
}

function createHealthyCcrGateway(apiKey, state) {
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
      if (request.method === "GET") {
        sendJson(response, 200, { revision: state.revision, state: "running" });
        return;
      }
      if (request.method === "POST") {
        void readJsonRequest(request).then((body) => {
          state.reloadRequests.push(body);
          state.revision = body.configRevision;
          sendJson(response, 202, {
            accepted: true,
            configRevision: body.configRevision,
            restarting: body.forceRestart === true
          });
        });
        return;
      }
    }
    sendJson(response, 404, { error: { message: "Not found." } });
  });
}

async function readJsonRequest(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Failed to allocate a web management test port."));
        }
      });
    });
  });
}

function setOptionalEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
