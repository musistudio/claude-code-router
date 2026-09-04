import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { gatewayFetchPreloadScriptForTest, writeGatewayFetchPreloadFile } from "@ccr/core/gateway/core-runtime/supervisor.ts";

test("gateway fetch preload file is stored with private permissions", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-gateway-preload-permissions-"));
  const configDir = path.join(root, ".claude-code-router");
  const preloadFile = path.join(configDir, "gateway-proxy-preload.cjs");

  try {
    mkdirSync(configDir, { mode: 0o755 });
    writeFileSync(preloadFile, "stale preload\n", { encoding: "utf8", mode: 0o644 });
    chmodSync(configDir, 0o755);
    chmodSync(preloadFile, 0o644);

    const file = writeGatewayFetchPreloadFile(configDir);

    assert.equal(file, preloadFile);
    assert.equal(statSync(configDir).mode & 0o777, 0o700);
    assert.equal(statSync(preloadFile).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("gateway fetch preload applies API_TIMEOUT_MS to direct upstream fetches", async () => {
  const harness = executePreload({
    CCR_UNDICI_MODULE: "mock-undici",
    CCR_UPSTREAM_TIMEOUT_MS: "600000"
  });

  assert.equal(harness.agentOptions.length, 1);
  assert.equal(harness.agentOptions[0].headersTimeout, 600000);
  assert.equal(harness.agentOptions[0].bodyTimeout, 600000);
  assert.equal(harness.proxyAgentOptions.length, 0);

  await harness.context.fetch("https://api.example.test/v1/chat/completions", { method: "POST" });

  assert.equal(harness.fetchCalls.length, 0);
  assert.equal(harness.bundledFetchCalls.length, 1);
  assert.equal(harness.bundledFetchCalls[0].init.dispatcher.kind, "direct");
});

test("gateway fetch preload combines proxy routing with timeout dispatcher options", async () => {
  const harness = executePreload({
    CCR_UNDICI_MODULE: "mock-undici",
    CCR_UPSTREAM_PROXY_URL: "http://127.0.0.1:8888",
    CCR_UPSTREAM_TIMEOUT_MS: "600000",
    NO_PROXY: "api.internal.test,.bypass.test"
  });

  assert.equal(harness.agentOptions.length, 1);
  assert.equal(harness.proxyAgentOptions.length, 1);
  assert.equal(harness.proxyAgentOptions[0].uri, "http://127.0.0.1:8888");
  assert.equal(harness.proxyAgentOptions[0].headersTimeout, 600000);
  assert.equal(harness.proxyAgentOptions[0].bodyTimeout, 600000);

  await harness.context.fetch("https://api.external.test/v1/messages", {});
  await harness.context.fetch("https://api.internal.test/v1/messages", {});
  await harness.context.fetch("http://127.0.0.1:3456/health", {});
  await harness.context.fetch("https://service.bypass.test/v1/messages", {});

  assert.equal(harness.fetchCalls.length, 0);
  assert.equal(harness.bundledFetchCalls.length, 4);
  assert.equal(harness.bundledFetchCalls[0].init.dispatcher.kind, "proxy");
  assert.equal(harness.bundledFetchCalls[1].init.dispatcher.kind, "direct");
  assert.equal(harness.bundledFetchCalls[2].init.dispatcher.kind, "direct");
  assert.equal(harness.bundledFetchCalls[3].init.dispatcher.kind, "direct");
});

test("gateway fetch preload preserves explicit fetch dispatchers", async () => {
  const harness = executePreload({
    CCR_UNDICI_MODULE: "mock-undici",
    CCR_UPSTREAM_TIMEOUT_MS: "600000"
  });
  const dispatcher = { kind: "caller" };

  await harness.context.fetch("https://api.example.test/v1/messages", { dispatcher });

  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].init.dispatcher, dispatcher);
  assert.equal(harness.bundledFetchCalls.length, 0);
});

function executePreload(env) {
  const agentOptions = [];
  const proxyAgentOptions = [];
  const fetchCalls = [];
  const bundledFetchCalls = [];

  class Agent {
    constructor(options) {
      this.kind = "direct";
      this.options = options;
      agentOptions.push(options);
    }
  }

  class ProxyAgent {
    constructor(options) {
      this.kind = "proxy";
      this.options = options;
      proxyAgentOptions.push(options);
    }
  }

  const context = {
    URL,
    fetch: async (input, init) => {
      fetchCalls.push({ init, input });
      return { ok: true };
    },
    process: { env },
    require: (moduleName) => {
      assert.equal(moduleName, "mock-undici");
      return {
        Agent,
        ProxyAgent,
        fetch: async (input, init) => {
          bundledFetchCalls.push({ init, input });
          return { ok: true };
        }
      };
    }
  };
  vm.createContext(context);
  vm.runInContext(gatewayFetchPreloadScriptForTest(), context);

  return {
    agentOptions,
    bundledFetchCalls,
    context,
    fetchCalls,
    proxyAgentOptions
  };
}
