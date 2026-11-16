import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("web RPC accepts loopback tools with a valid auth token", async () => {
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

test("#1835 web RPC rejects hostile browser sources even with a valid token", async () => {
  const { startWebManagementServer } = await import("@ccr/core/web/management-server.ts");
  const runtime = await startWebManagementServer({ authToken: "source-test", host: "127.0.0.1", port: 0, startGateway: false });
  try {
    for (const headers of [{ origin: "https://evil.example" }, { referer: "https://evil.example/page" }, { origin: "null" }, { origin: "file://localhost" }]) {
      const response = await fetch(new URL("/api/ccr/rpc", runtime.url), {
        method: "POST", body: JSON.stringify({ method: "getConfig", args: [] }),
        headers: { "content-type": "application/json", "x-ccr-web-auth": "source-test", ...headers }
      });
      assert.equal(response.status, 403, JSON.stringify(headers));
    }
  } finally { await runtime.close(); }
});

test("#1835 browser origins support explicit public URLs and allowlists", async (t) => {
  const previousPublic = process.env.CCR_PUBLIC_BASE_URL;
  const previousAllowed = process.env.CCR_WEB_ALLOWED_ORIGINS;
  process.env.CCR_PUBLIC_BASE_URL = "https://ccr.example.com";
  process.env.CCR_WEB_ALLOWED_ORIGINS = "https://tools.example.com";
  t.after(() => { setOptionalEnv("CCR_PUBLIC_BASE_URL", previousPublic); setOptionalEnv("CCR_WEB_ALLOWED_ORIGINS", previousAllowed); });
  const { startWebManagementServer } = await import("@ccr/core/web/management-server.ts");
  const runtime = await startWebManagementServer({ authToken: "remote-test", host: "127.0.0.1", port: 0, startGateway: false });
  try {
    for (const origin of ["https://ccr.example.com", "https://tools.example.com"]) {
      const response = await fetch(new URL("/api/ccr/rpc", runtime.url), { method: "POST", body: JSON.stringify({ method: "getAppInfo" }),
        headers: { "content-type": "application/json", "x-ccr-web-auth": "remote-test", origin, referer: `${origin}/page` } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
    }
    const denied = await fetch(new URL("/api/ccr/rpc", runtime.url), { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  } finally { await runtime.close(); }
});

test("#1835 getConfig and saveConfig redact provider credentials without overwriting them", async (t) => {
  const { loadAppConfig, saveAppConfig } = await import("@ccr/core/config/config.ts");
  const { gatewayService } = await import("@ccr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@ccr/core/web/management-server.ts");
  const config = await loadAppConfig();
  config.Providers = [
    { id: "first", name: "First", type: "openai_chat_completions", models: ["alpha"], api_base_url: "http://127.0.0.1:9/v1", api_key: "first-secret", extraHeaders: { Authorization: "Bearer header-secret", "x-visible": "visible" }, credentials: [{ id: "credential", api_key: "credential-secret" }] },
    { id: "second", name: "Second", type: "openai_chat_completions", models: ["beta"], api_base_url: "http://127.0.0.1:9/v1", api_key: "second-secret" }
  ];
  await saveAppConfig(config);
  const status = gatewayService.getStatus();
  t.mock.method(gatewayService, "start", async () => status);
  t.mock.method(gatewayService, "updateConfig", async () => status);
  const runtime = await startWebManagementServer({ authToken: "redaction-test", host: "127.0.0.1", port: 0, startGateway: false });
  try {
    let current = (await rpc(runtime.url, "redaction-test", "getConfig")).value;
    assert.doesNotMatch(JSON.stringify(current), /first-secret|second-secret|header-secret|credential-secret/);
    assert.equal(current.Providers[0].extraHeaders["x-visible"], "visible");
    current.Providers.reverse();
    current.Providers[1].name = "Renamed";
    const saved = await rpc(runtime.url, "redaction-test", "saveConfig", [current, { applyProfile: false }]);
    assert.equal(saved.ok, true);
    assert.doesNotMatch(JSON.stringify(saved.value), /first-secret|second-secret|header-secret|credential-secret/);
    const stored = await loadAppConfig();
    assert.equal(stored.Providers.find(p => p.id === "first").api_key, "first-secret");
    assert.equal(stored.Providers.find(p => p.id === "second").api_key, "second-secret");
    assert.equal(stored.Providers.find(p => p.id === "first").credentials[0].api_key, "credential-secret");
    const stale = await fetch(new URL("/api/ccr/rpc", runtime.url), { method: "POST", body: JSON.stringify({ method: "saveConfig", args: [current, { applyProfile: false }] }),
      headers: { "content-type": "application/json", "x-ccr-web-auth": "redaction-test" } });
    assert.equal(stale.status, 409, "mask restoration must preserve config conflict detection");
    current = saved.value;
    current.Providers[1].api_key = "replacement-secret";
    current = (await rpc(runtime.url, "redaction-test", "saveConfig", [current, { applyProfile: false }])).value;
    assert.equal((await loadAppConfig()).Providers.find(p => p.id === "first").api_key, "replacement-secret");
    current.Providers[1].api_key = "";
    await rpc(runtime.url, "redaction-test", "saveConfig", [current, { applyProfile: false }]);
    assert.equal((await loadAppConfig()).Providers.find(p => p.id === "first").api_key ?? "", "");
  } finally { await runtime.close(); }
});

test("startGateway reuses an already healthy CCR gateway on the configured port", async () => {
  const { loadAppConfig, saveAppConfig } = await import("@ccr/core/config/config.ts");
  const { gatewayRuntimeConfigRevision } = await import("@ccr/core/gateway/runtime-config-control.ts");
  const { gatewayService } = await import("@ccr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@ccr/core/web/management-server.ts");
  await gatewayService.stop();
  const gatewayPort = await findAvailablePort();
  const webAuthToken = "test-web-auth-token";
  const config = await loadAppConfig();
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
  const originalStart = gatewayService.start;
  let managedStarts = 0;
  gatewayService.start = async function (...args) {
    managedStarts += 1;
    return originalStart.apply(this, args);
  };

  try {
    const payload = await rpc(runtime.url, webAuthToken, "startGateway");

    assert.equal(payload.ok, true);
    assert.equal(payload.value.state, "running", payload.value.lastError);
    assert.equal(payload.value.endpoint, `http://127.0.0.1:${gatewayPort}`);
    assert.equal(payload.value.gatewayManagedExternally, true);
    assert.equal(gatewayService.getStatus().state, "running");
    assert.equal(gatewayService.getStatus().gatewayManagedExternally, true);
    assert.equal(managedStarts, 0, "existing gateways should be adopted without spawning a competing runtime");

    const secondStart = await rpc(runtime.url, webAuthToken, "startGateway");
    assert.equal(secondStart.ok, true);
    assert.equal(secondStart.value.endpoint, `http://127.0.0.1:${gatewayPort}`);
    assert.equal(secondStart.value.gatewayManagedExternally, true);
    assert.equal(managedStarts, 0);

    const nextConfig = structuredClone(savedConfig);
    nextConfig.Providers[0].name = "Updated Test Provider";
    const reloadCountBeforeSave = externalGatewayState.reloadRequests.length;
    const saveResult = await rpc(runtime.url, webAuthToken, "saveConfig", [nextConfig, { applyProfile: false }]);
    assert.equal(saveResult.ok, true);
    assert.equal(externalGatewayState.reloadRequests.length, reloadCountBeforeSave + 1);
    assert.equal(externalGatewayState.reloadRequests.at(-1).forceRestart, true);
    assert.equal(externalGatewayState.revision, gatewayRuntimeConfigRevision(await loadAppConfig()));
    assert.equal(gatewayService.getStatus().gatewayManagedExternally, true);
  } finally {
    gatewayService.start = originalStart;
    await runtime.close();
    await gatewayService.stop();
    await closeServer(externalGateway);
  }
});

test("#1951 authenticated recovery restores both agent configs while the gateway is down and survives reapply", async () => {
  const { startWebManagementServer } = await import("@ccr/core/web/management-server.ts");
  const { createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts");
  const { applyProfileConfig } = await import("@ccr/core/profiles/service.ts");
  const { loadAppConfig, saveAppConfig } = await import("@ccr/core/config/config.ts");
  const { replacePersistedAppConfig } = await import("@ccr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "recovery-"));
  const claudeFile = path.join(root, "claude", "settings.json");
  const codexFile = path.join(root, "codex", "config.toml");
  const originals = new Map([
    [claudeFile, JSON.stringify({ env: { USER_SETTING: "kept", ANTHROPIC_BASE_URL: "https://original.invalid", ANTHROPIC_API_BASE_URL: "https://original.invalid", CLAUDE_AGENT_API_BASE_URL: "https://original.invalid" }, permissions: { defaultMode: "default" } }) + "\n"],
    [codexFile, 'model = "original-model"\nmodel_provider = "original-provider"\n[model_providers.original-provider]\nbase_url = "https://original.invalid/v1"\n']
  ]);
  for (const [file, content] of originals) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); }
  const config = createDefaultAppConfig();
  config.Providers = [{ name: "Broken", models: ["m"], type: "openai_chat_completions", api_key: "private-provider-key" }];
  config.virtualModelProfiles = [];
  config.profile.enabled = true;
  config.profile.profiles = [
    { id: "recovery-claude", name: "Claude Main", agent: "claude-code", scope: "global", enabled: true, model: "Broken/m", settingsFile: claudeFile },
    { id: "recovery-codex", name: "Codex Main", agent: "codex", scope: "global", enabled: true, model: "Broken/m", configFile: codexFile }
  ];
  await applyProfileConfig(config);
  for (const [file, content] of originals) assert.notEqual(readFileSync(file, "utf8"), content);
  const edited = JSON.parse(readFileSync(claudeFile, "utf8"));
  edited.env.USER_SETTING = "edited after takeover";
  edited.statusLine = { type: "command", command: "my-status" };
  writeFileSync(claudeFile, JSON.stringify(edited));
  const expectedClaude = JSON.parse(originals.get(claudeFile));
  expectedClaude.env.USER_SETTING = edited.env.USER_SETTING;
  expectedClaude.statusLine = edited.statusLine;
  await replacePersistedAppConfig(config);
  const stale = await loadAppConfig();
  // Invalid unrelated settings must not prevent a narrowly scoped emergency opt-out.
  config.profile.profiles.push({ id: "invalid-unrelated", name: "Unrelated", agent: "claude-code", scope: "ccr", enabled: true, model: "Gone/model", availableModels: ["Gone/model"] });
  await replacePersistedAppConfig(config);
  const runtime = await startWebManagementServer({ authToken: "recovery-auth", host: "127.0.0.1", port: 0, startGateway: false });
  try {
    const denied = await fetch(new URL("/api/ccr/rpc", runtime.url), { method: "POST",
      body: JSON.stringify({ method: "recoverGlobalProfile", args: ["recovery-claude"] }), headers: { "content-type": "application/json" } });
    assert.equal(denied.status, 401);
    assert.equal((await loadAppConfig()).profile.profiles[0].enabled, true);
    for (const id of ["recovery-claude", "recovery-codex"]) {
      const result = await rpc(runtime.url, "recovery-auth", "recoverGlobalProfile", [id]);
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.value.status.ok, true);
      assert.equal(result.value.config.profile.profiles.find(profile => profile.id === id).enabled, false);
      assert.ok(!JSON.stringify(result).includes("private-provider-key"), "web recovery redacts returned credentials");
    }
    await assert.rejects(saveAppConfig(stale), error => error.name === "AppConfigConflictError");
    const saved = await loadAppConfig();
    assert.equal(saved.profile.profiles.find(profile => profile.id === "invalid-unrelated").enabled, true);
    await applyProfileConfig(saved);
    assert.deepEqual(JSON.parse(readFileSync(claudeFile, "utf8")), expectedClaude, "restore preserves unrelated user edits and never reinstalls the takeover");
    assert.equal(readFileSync(codexFile, "utf8"), originals.get(codexFile));
    const rejected = await fetch(new URL("/api/ccr/rpc", runtime.url), { method: "POST",
      body: JSON.stringify({ method: "recoverGlobalProfile", args: ["invalid-unrelated"] }),
      headers: { "content-type": "application/json", "x-ccr-web-auth": "recovery-auth" } });
    assert.equal(rejected.status, 500);
  } finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
});

test("#1951 missing original backup reports failure while persisting the disabled state", async () => {
  const { recoverGlobalAgentProfile } = await import("@ccr/core/profiles/service.ts");
  const { createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts");
  const { loadAppConfig } = await import("@ccr/core/config/config.ts");
  const { replacePersistedAppConfig } = await import("@ccr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "missing-backup-"));
  const file = path.join(root, "config.toml");
  const managed = '# BEGIN CCR managed profile\nmodel = "broken"\n# END CCR managed profile\n';
  writeFileSync(file, managed);
  const config = createDefaultAppConfig();
  config.profile.profiles = [{ id: "missing-backup", name: "Missing backup", agent: "codex", scope: "global", enabled: true, model: "broken", configFile: file }];
  await replacePersistedAppConfig(config);
  try {
    const result = await recoverGlobalAgentProfile("missing-backup");
    assert.equal(result.status.ok, false);
    assert.match(result.status.message, /No original.*backup/);
    assert.equal((await loadAppConfig()).profile.profiles[0].enabled, false);
    assert.equal(readFileSync(file, "utf8"), managed);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("#1951 recovery preserves edits to a newly created Claude file and reports malformed settings", async () => {
  const { recoverGlobalAgentProfile } = await import("@ccr/core/profiles/service.ts");
  const { createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts");
  const { replacePersistedAppConfig } = await import("@ccr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "claude-recovery-extra-"));
  try {
    for (const malformed of [false, true]) {
      const file = path.join(root, malformed ? "bad.json" : "new.json");
      const config = createDefaultAppConfig();
      config.profile.profiles = [{ id: "claude-recovery-extra", name: "Claude recovery", agent: "claude-code", enabled: true, scope: "global", settingsFile: file }];
      await replacePersistedAppConfig(config);
      const content = malformed ? "{bad JSON" : JSON.stringify({ apiKeyHelper: "ccr-claude-code-api-key-extra",
        env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:3456", ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456", CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456", TZ: "UTC", USER_EDIT: "keep" } });
      writeFileSync(file, content); writeFileSync(file + ".ccr-original-missing", "");
      const result = await recoverGlobalAgentProfile("claude-recovery-extra");
      assert.equal(result.config.profile.profiles[0].enabled, false);
      assert.equal(result.status.ok, !malformed);
      if (malformed) {
        assert.match(result.status.message, /disabled.*not valid JSON/);
        assert.equal(readFileSync(file, "utf8"), content);
      } else assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { env: { USER_EDIT: "keep" } });
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
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
