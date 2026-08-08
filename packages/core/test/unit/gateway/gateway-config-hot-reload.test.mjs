import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { gatewayService } from "@ccr/core/gateway/service.ts";

function hotReloadTestConfig() {
  const config = createDefaultAppConfig();
  config.gateway.coreHost = "127.0.0.1";
  config.gateway.corePort = 34579;
  return config;
}

function pretendManagedCoreGatewayRunning() {
  gatewayService.child = {
    killed: false,
    pid: 424242,
    kill() {
      this.killed = true;
      return true;
    }
  };
  gatewayService.coreAuthToken = "test-core-token";
  gatewayService.lastAppliedGatewayConfig = undefined;
}

test("updateConfig pushes the recompiled config to the managed core gateway", async () => {
  await gatewayService.stop();
  pretendManagedCoreGatewayRunning();
  const calls = [];
  mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{\"ok\":true}", { status: 200 });
  });
  try {
    await gatewayService.updateConfig(hotReloadTestConfig());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:34579/manager/config");
    assert.equal(calls[0].init.method, "PUT");
    assert.equal(calls[0].init.headers["x-ccr-core-auth"], "test-core-token");
    const pushed = JSON.parse(calls[0].init.body);
    assert.ok(Array.isArray(pushed.providers));
    assert.equal(gatewayService.lastAppliedGatewayConfig, calls[0].init.body);
  } finally {
    mock.restoreAll();
    await gatewayService.stop();
  }
});

test("updateConfig skips the push when the compiled config is unchanged", async () => {
  await gatewayService.stop();
  pretendManagedCoreGatewayRunning();
  const calls = [];
  mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{\"ok\":true}", { status: 200 });
  });
  try {
    const config = hotReloadTestConfig();
    await gatewayService.updateConfig(config);
    await gatewayService.updateConfig(config);
    assert.equal(calls.length, 1);
  } finally {
    mock.restoreAll();
    await gatewayService.stop();
  }
});

test("updateConfig falls back to a full restart when the hot push fails", async () => {
  await gatewayService.stop();
  pretendManagedCoreGatewayRunning();
  const startCalls = [];
  mock.method(globalThis, "fetch", async () => {
    throw new Error("connection refused");
  });
  mock.method(gatewayService, "start", async (config) => {
    startCalls.push(config);
    return { state: "running" };
  });
  try {
    await gatewayService.updateConfig(hotReloadTestConfig());
    assert.equal(startCalls.length, 1);
    assert.equal(gatewayService.lastAppliedGatewayConfig, undefined);
  } finally {
    mock.restoreAll();
    await gatewayService.stop();
  }
});

test("updateConfig does not push when no managed core gateway is running", async () => {
  await gatewayService.stop();
  const calls = [];
  mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  });
  try {
    await gatewayService.updateConfig(hotReloadTestConfig());
    assert.equal(calls.length, 0);
  } finally {
    mock.restoreAll();
    await gatewayService.stop();
  }
});
