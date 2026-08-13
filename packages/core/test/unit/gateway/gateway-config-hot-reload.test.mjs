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
  gatewayService.status = {
    coreEndpoint: "http://127.0.0.1:34579",
    endpoint: "http://127.0.0.1:3456",
    networkEndpoints: ["http://127.0.0.1:3456"],
    state: "running"
  };
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
    const status = await gatewayService.updateConfig(hotReloadTestConfig());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:34579/manager/config");
    assert.equal(calls[0].init.method, "PUT");
    assert.equal(calls[0].init.headers["x-ccr-core-auth"], "test-core-token");
    const pushed = JSON.parse(calls[0].init.body);
    assert.ok(Array.isArray(pushed.providers));
    assert.equal(gatewayService.lastAppliedGatewayConfig, calls[0].init.body);
    assert.equal(status.state, "running");
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
    const firstStatus = await gatewayService.updateConfig(config);
    const secondStatus = await gatewayService.updateConfig(config);
    assert.equal(calls.length, 1);
    assert.equal(firstStatus.state, "running");
    assert.equal(secondStatus.state, "running");
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
    const status = await gatewayService.updateConfig(hotReloadTestConfig());
    assert.equal(startCalls.length, 1);
    assert.equal(gatewayService.lastAppliedGatewayConfig, undefined);
    assert.equal(status.state, "running");
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
    const status = await gatewayService.updateConfig(hotReloadTestConfig());
    assert.equal(calls.length, 0);
    assert.equal(status.state, "stopped");
  } finally {
    mock.restoreAll();
    await gatewayService.stop();
  }
});

test("updateConfig returns the failed fallback restart status", async () => {
  await gatewayService.stop();
  pretendManagedCoreGatewayRunning();
  mock.method(globalThis, "fetch", async () => {
    throw new Error("connection refused");
  });
  mock.method(gatewayService, "start", async () => ({
    coreEndpoint: "http://127.0.0.1:34579",
    endpoint: "http://127.0.0.1:3456",
    lastError: "restart failed",
    networkEndpoints: ["http://127.0.0.1:3456"],
    state: "error"
  }));
  try {
    const status = await gatewayService.updateConfig(hotReloadTestConfig());
    assert.equal(status.state, "error");
    assert.equal(status.lastError, "restart failed");
  } finally {
    mock.restoreAll();
    await gatewayService.stop();
  }
});
