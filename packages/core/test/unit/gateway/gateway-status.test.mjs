import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  configRepository,
  deletePersistedRuntimeState,
  loadPersistedRuntimeState,
  replacePersistedRuntimeState
} from "@ccr/core/config/config-repository.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { endpoint } from "@ccr/core/gateway/core-runtime/supervisor.ts";
import { gatewayService } from "@ccr/core/gateway/service.ts";

test("gateway endpoints normalize wildcard and IPv6 hosts", () => {
  assert.equal(endpoint("0.0.0.0", 3456), "http://127.0.0.1:3456");
  assert.equal(endpoint("::", 3456), "http://[::1]:3456");
  assert.equal(endpoint("::1", 3456), "http://[::1]:3456");
  assert.equal(endpoint("[::1]", 3456), "http://[::1]:3456");
});

test("gateway start persists preflight validation failures for status polling", async () => {
  await gatewayService.stop();

  const config = createDefaultAppConfig();
  config.gateway.coreHost = "0.0.0.0";

  const startStatus = await gatewayService.start(config);
  const polledStatus = gatewayService.getStatus();

  assert.equal(startStatus.state, "error");
  assert.equal(polledStatus.state, "error");
  assert.equal(polledStatus.lastError, "Core gateway host must be 127.0.0.1 or ::1.");

  await gatewayService.stop();
});

test("gateway stop preserves a runtime marker that this service instance does not own", async () => {
  await gatewayService.stop();
  const marker = {
    pid: 12345,
    runtimeId: "previous-runtime",
    startedAt: new Date(0).toISOString()
  };
  await replacePersistedRuntimeState("gateway", marker);

  try {
    await gatewayService.stop();
    assert.deepEqual(await loadPersistedRuntimeState("gateway"), marker);
  } finally {
    await deletePersistedRuntimeState("gateway");
  }
});

test("gateway start observes an exit that occurs while the runtime marker is being written", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-gateway-early-exit-test-"));
  const gatewayEntry = path.join(dir, "gateway-entry.cjs");
  const gatewayEntryLoaded = path.join(dir, "gateway-entry-loaded");
  const previousGatewayEntry = process.env.CCR_GATEWAY_ENTRY;
  const previousGatewayEntryLoaded = process.env.CCR_GATEWAY_EARLY_EXIT_SENTINEL;
  const replaceRuntimeState = configRepository.replaceRuntimeState;
  writeFileSync(
    gatewayEntry,
    [
      'const { writeFileSync } = require("node:fs");',
      'writeFileSync(process.env.CCR_GATEWAY_EARLY_EXIT_SENTINEL, "loaded\\n");',
      "process.exit(23);",
      ""
    ].join("\n"),
    "utf8"
  );

  try {
    await gatewayService.stop();
    process.env.CCR_GATEWAY_ENTRY = gatewayEntry;
    process.env.CCR_GATEWAY_EARLY_EXIT_SENTINEL = gatewayEntryLoaded;
    configRepository.replaceRuntimeState = async function (...args) {
      await waitForFile(gatewayEntryLoaded);
      await delay(100);
      return replaceRuntimeState.apply(this, args);
    };

    const config = createDefaultAppConfig();
    config.gateway.enabled = true;
    config.gateway.corePort = 0;
    config.gateway.port = 0;
    config.Providers = [{
      api_base_url: "http://127.0.0.1:9/v1",
      api_key: "test-provider-key",
      id: "early-exit-provider",
      models: ["early-exit-model"],
      name: "Early Exit Provider",
      type: "openai_chat_completions"
    }];

    const status = await gatewayService.start(config);

    assert.equal(status.state, "error");
    assert.match(status.lastError ?? "", /Core gateway exited with 23/);
    assert.equal(await loadPersistedRuntimeState("gateway"), undefined);
  } finally {
    configRepository.replaceRuntimeState = replaceRuntimeState;
    if (previousGatewayEntry === undefined) {
      delete process.env.CCR_GATEWAY_ENTRY;
    } else {
      process.env.CCR_GATEWAY_ENTRY = previousGatewayEntry;
    }
    if (previousGatewayEntryLoaded === undefined) {
      delete process.env.CCR_GATEWAY_EARLY_EXIT_SENTINEL;
    } else {
      process.env.CCR_GATEWAY_EARLY_EXIT_SENTINEL = previousGatewayEntryLoaded;
    }
    await gatewayService.stop();
    await deletePersistedRuntimeState("gateway");
    rmSync(dir, { force: true, recursive: true });
  }
});

test("gateway start waits for matching runtime health before reporting running", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-gateway-readiness-test-"));
  const gatewayEntry = path.join(dir, "gateway-entry.cjs");
  const readySentinel = path.join(dir, "gateway-ready");
  const previousGatewayEntry = process.env.CCR_GATEWAY_ENTRY;
  const previousReadyDelay = process.env.CCR_GATEWAY_READY_DELAY_MS;
  const previousReadySentinel = process.env.CCR_GATEWAY_READY_SENTINEL;
  writeFileSync(gatewayEntry, delayedHealthyGatewayEntry(), "utf8");

  try {
    await gatewayService.stop();
    process.env.CCR_GATEWAY_ENTRY = gatewayEntry;
    process.env.CCR_GATEWAY_READY_DELAY_MS = "250";
    process.env.CCR_GATEWAY_READY_SENTINEL = readySentinel;

    const config = gatewayTestConfig(await findAvailablePort());
    const startedAt = Date.now();
    const status = await gatewayService.start(config);
    const elapsedMs = Date.now() - startedAt;

    assert.equal(status.state, "running");
    assert.equal(existsSync(readySentinel), true);
    assert.ok(elapsedMs >= 200, `gateway start returned before delayed health was ready (${elapsedMs}ms)`);
    assert.match(String((await loadPersistedRuntimeState("gateway"))?.runtimeId), /.+/);
  } finally {
    restoreEnv("CCR_GATEWAY_ENTRY", previousGatewayEntry);
    restoreEnv("CCR_GATEWAY_READY_DELAY_MS", previousReadyDelay);
    restoreEnv("CCR_GATEWAY_READY_SENTINEL", previousReadySentinel);
    await gatewayService.stop();
    await deletePersistedRuntimeState("gateway");
    rmSync(dir, { force: true, recursive: true });
  }
});

test("gateway start completes the IPC and health handshake with the bundled runtime", async () => {
  const previousGatewayEntry = process.env.CCR_GATEWAY_ENTRY;
  try {
    await gatewayService.stop();
    delete process.env.CCR_GATEWAY_ENTRY;
    const status = await gatewayService.start(gatewayTestConfig(await findAvailablePort()));
    assert.equal(status.state, "running", status.lastError);

    const marker = await loadPersistedRuntimeState("gateway");
    const healthResponse = await fetch(new URL("/health", status.coreEndpoint));
    const health = await healthResponse.json();

    assert.equal(healthResponse.status, 200);
    assert.equal(health.status, "ok");
    assert.equal(health.runtimeId, marker?.runtimeId);
  } finally {
    restoreEnv("CCR_GATEWAY_ENTRY", previousGatewayEntry);
    await gatewayService.stop();
    await deletePersistedRuntimeState("gateway");
  }
});

test("gateway restart waits for the previous core runtime to stop", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-gateway-restart-stop-test-"));
  const slowGatewayEntry = path.join(dir, "slow-gateway-entry.cjs");
  const replacementGatewayEntry = path.join(dir, "replacement-gateway-entry.cjs");
  const readySentinel = path.join(dir, "replacement-ready");
  const previousGatewayEntry = process.env.CCR_GATEWAY_ENTRY;
  const previousTermDelay = process.env.CCR_GATEWAY_TERM_DELAY_MS;
  const previousReadyDelay = process.env.CCR_GATEWAY_READY_DELAY_MS;
  const previousReadySentinel = process.env.CCR_GATEWAY_READY_SENTINEL;
  writeFileSync(slowGatewayEntry, slowTerminatingGatewayEntry(), "utf8");
  writeFileSync(replacementGatewayEntry, delayedHealthyGatewayEntry(), "utf8");

  try {
    await gatewayService.stop();
    process.env.CCR_GATEWAY_ENTRY = slowGatewayEntry;
    process.env.CCR_GATEWAY_TERM_DELAY_MS = "300";

    const config = gatewayTestConfig(await findAvailablePort());
    const firstStatus = await gatewayService.start(config);
    assert.equal(firstStatus.state, "running", firstStatus.lastError);

    process.env.CCR_GATEWAY_ENTRY = replacementGatewayEntry;
    process.env.CCR_GATEWAY_READY_DELAY_MS = "0";
    process.env.CCR_GATEWAY_READY_SENTINEL = readySentinel;
    const startedAt = Date.now();
    const secondStatus = await gatewayService.start(config);
    const elapsedMs = Date.now() - startedAt;

    assert.equal(secondStatus.state, "running", secondStatus.lastError);
    assert.equal(existsSync(readySentinel), true);
    assert.ok(elapsedMs >= 200, `gateway restart returned before the old runtime stopped (${elapsedMs}ms)`);
  } finally {
    restoreEnv("CCR_GATEWAY_ENTRY", previousGatewayEntry);
    restoreEnv("CCR_GATEWAY_TERM_DELAY_MS", previousTermDelay);
    restoreEnv("CCR_GATEWAY_READY_DELAY_MS", previousReadyDelay);
    restoreEnv("CCR_GATEWAY_READY_SENTINEL", previousReadySentinel);
    await gatewayService.stop();
    await deletePersistedRuntimeState("gateway");
    rmSync(dir, { force: true, recursive: true });
  }
});

test("gateway start rejects healthy endpoints owned by a different runtime", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-gateway-runtime-identity-test-"));
  const gatewayEntry = path.join(dir, "gateway-entry.cjs");
  const previousGatewayEntry = process.env.CCR_GATEWAY_ENTRY;
  writeFileSync(gatewayEntry, foreignRuntimeGatewayEntry(), "utf8");

  try {
    await gatewayService.stop();
    process.env.CCR_GATEWAY_ENTRY = gatewayEntry;

    const status = await gatewayService.start(gatewayTestConfig(await findAvailablePort()));

    assert.equal(status.state, "error");
    assert.match(status.lastError ?? "", /owned by a different runtime/);
    assert.equal(await loadPersistedRuntimeState("gateway"), undefined);
  } finally {
    restoreEnv("CCR_GATEWAY_ENTRY", previousGatewayEntry);
    await gatewayService.stop();
    await deletePersistedRuntimeState("gateway");
    rmSync(dir, { force: true, recursive: true });
  }
});

function gatewayTestConfig(corePort) {
  const config = createDefaultAppConfig();
  config.gateway.enabled = true;
  config.gateway.corePort = corePort;
  config.gateway.port = 0;
  config.Providers = [{
    api_base_url: "http://127.0.0.1:9/v1",
    api_key: "test-provider-key",
    id: "readiness-provider",
    models: ["readiness-model"],
    name: "Readiness Provider",
    type: "openai_chat_completions"
  }];
  return config;
}

function delayedHealthyGatewayEntry() {
  return [
    'const { writeFileSync } = require("node:fs");',
    'const { createServer } = require("node:http");',
    "const delayMs = Number(process.env.CCR_GATEWAY_READY_DELAY_MS || 0);",
    "setTimeout(() => {",
    "  const server = createServer((request, response) => {",
    "    if (request.url === '/health') {",
    "      response.writeHead(200, { 'content-type': 'application/json' });",
    "      response.end(JSON.stringify({",
    "        runtimeId: process.env.CCR_GATEWAY_RUNTIME_ID,",
    "        status: 'ok'",
    "      }));",
    "      return;",
    "    }",
    "    response.writeHead(404);",
    "    response.end();",
    "  });",
    "  server.listen(Number(process.env.PORT), process.env.HOST, () => {",
    "    writeFileSync(process.env.CCR_GATEWAY_READY_SENTINEL, 'ready\\n');",
    "  });",
    "}, delayMs);",
    ""
  ].join("\n");
}

function slowTerminatingGatewayEntry() {
  return [
    'const { createServer } = require("node:http");',
    "const server = createServer((request, response) => {",
    "  if (request.url === '/health') {",
    "    response.writeHead(200, { 'content-type': 'application/json' });",
    "    response.end(JSON.stringify({",
    "      runtimeId: process.env.CCR_GATEWAY_RUNTIME_ID,",
    "      status: 'ok'",
    "    }));",
    "    return;",
    "  }",
    "  response.writeHead(404);",
    "  response.end();",
    "});",
    "server.listen(Number(process.env.PORT), process.env.HOST);",
    "let stopping = false;",
    "process.on('SIGTERM', () => {",
    "  if (stopping) return;",
    "  stopping = true;",
    "  setTimeout(() => {",
    "    server.close(() => process.exit(0));",
    "    server.closeAllConnections?.();",
    "  }, Number(process.env.CCR_GATEWAY_TERM_DELAY_MS || 300));",
    "});",
    ""
  ].join("\n");
}

function foreignRuntimeGatewayEntry() {
  return [
    'const { createServer } = require("node:http");',
    "createServer((request, response) => {",
    "  if (request.url === '/health') {",
    "    response.writeHead(200, { 'content-type': 'application/json' });",
    "    response.end(JSON.stringify({ runtimeId: 'foreign-runtime', status: 'ok' }));",
    "    return;",
    "  }",
    "  response.writeHead(404);",
    "  response.end();",
    "}).listen(Number(process.env.PORT), process.env.HOST);",
    ""
  ].join("\n");
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
          reject(new Error("Failed to allocate a gateway test port."));
        }
      });
    });
  });
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(file, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      return;
    }
    await delay(10);
  }
  assert.fail(`Timed out waiting for gateway entry sentinel: ${file}`);
}
