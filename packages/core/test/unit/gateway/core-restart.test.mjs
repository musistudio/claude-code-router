import assert from "node:assert/strict";
import test from "node:test";
import { gatewayService } from "@ccr/core/gateway/application/gateway-service.ts";

// A fresh service without starting HTTP, plugins, or child processes.
function createService() {
  return new gatewayService.constructor();
}

function crashedService() {
  const service = createService();
  const child = {};
  service.child = child;
  service.config = { gateway: { host: "127.0.0.1", port: 0 } };
  service.status = { state: "running", endpoint: "", coreEndpoint: "", networkEndpoints: [] };
  return { child, service };
}

test("#1867 unexpected core exit restarts with bounded backoff", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, service } = crashedService();
  let restarts = 0;
  service.startGateway = async () => {
    restarts += 1;
    service.status.state = "error";
    return service.getStatus();
  };
  await service.handleCoreGatewayTermination(child, undefined, "heap OOM");
  assert.equal(service.getStatus().state, "error");
  t.mock.timers.tick(999);
  assert.equal(restarts, 0);
  t.mock.timers.tick(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(restarts, 1);
  t.mock.timers.tick(1999);
  assert.equal(restarts, 1);
  t.mock.timers.tick(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(restarts, 2);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    t.mock.timers.tick(30_000);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.equal(restarts, 12);
});

test("#1867 explicit stop cancels a scheduled core restart", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, service } = crashedService();
  let restarts = 0;
  service.startGateway = async () => { restarts += 1; return service.getStatus(); };
  service.stopGateway = async () => { service.status.state = "stopped"; return service.getStatus(); };
  await service.handleCoreGatewayTermination(child, undefined, "heap OOM");
  await service.stop();
  t.mock.timers.tick(60_000);
  await Promise.resolve();
  assert.equal(restarts, 0);
});

test("#1867 explicit stop cleans up after an already running recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, service } = crashedService();
  const operations = [];
  let releaseRecovery;
  const recoveryGate = new Promise((resolve) => { releaseRecovery = resolve; });
  service.startGateway = async () => {
    await recoveryGate;
    operations.push("recovery completed");
    service.status.state = "running";
    return service.getStatus();
  };
  service.stopGateway = async () => {
    operations.push("stopped");
    service.status.state = "stopped";
    return service.getStatus();
  };
  await service.handleCoreGatewayTermination(child, undefined, "heap OOM");
  t.mock.timers.tick(1_000);
  const stopping = service.stop();
  releaseRecovery();
  await stopping;
  await Promise.resolve();
  assert.deepEqual(operations, ["recovery completed", "stopped"]);
  assert.equal(service.getStatus().state, "stopped");
  t.mock.timers.tick(60_000);
  assert.equal(operations.length, 2);
});

test("#1867 explicit start waits for an already running recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, service } = crashedService();
  const operations = [];
  let releaseRecovery;
  const recoveryGate = new Promise((resolve) => { releaseRecovery = resolve; });
  service.startGateway = async (_config, generation) => {
    if (generation !== undefined) {
      await recoveryGate;
      operations.push("recovery completed");
    } else {
      operations.push("manual start");
    }
    service.status.state = "running";
    return service.getStatus();
  };
  await service.handleCoreGatewayTermination(child, undefined, "heap OOM");
  t.mock.timers.tick(1_000);
  const starting = service.start(service.config);
  releaseRecovery();
  await starting;
  await Promise.resolve();
  assert.deepEqual(operations, ["recovery completed", "manual start"]);
  t.mock.timers.tick(60_000);
  assert.equal(operations.length, 2);
});

test("#1867 an obsolete child's exit cannot restart its replacement", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { service } = crashedService();
  let restarts = 0;
  service.startGateway = async () => { restarts += 1; return service.getStatus(); };
  await service.handleCoreGatewayTermination({}, undefined, "old child");
  t.mock.timers.tick(60_000);
  assert.equal(restarts, 0);
  assert.equal(service.getStatus().state, "running");
});
