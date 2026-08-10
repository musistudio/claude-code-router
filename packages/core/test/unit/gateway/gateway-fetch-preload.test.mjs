import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { gatewayFetchPreloadScriptForTest } from "@ccr/core/gateway/core-runtime/supervisor.ts";

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

  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].init.dispatcher.kind, "direct");
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

  assert.equal(harness.fetchCalls[0].init.dispatcher.kind, "proxy");
  assert.equal(harness.fetchCalls[1].init.dispatcher.kind, "direct");
  assert.equal(harness.fetchCalls[2].init.dispatcher.kind, "direct");
  assert.equal(harness.fetchCalls[3].init.dispatcher.kind, "direct");
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
});

function executePreload(env) {
  const agentOptions = [];
  const proxyAgentOptions = [];
  const fetchCalls = [];

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
      return { Agent, ProxyAgent };
    }
  };
  vm.createContext(context);
  vm.runInContext(gatewayFetchPreloadScriptForTest(), context);

  return {
    agentOptions,
    context,
    fetchCalls,
    proxyAgentOptions
  };
}
