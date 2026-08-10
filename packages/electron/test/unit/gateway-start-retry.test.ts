import assert from "node:assert/strict";
import test from "node:test";
import { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE } from "@ccr/core/contracts/app";
import type { AppConfig, GatewayStatus } from "@ccr/core/contracts/app";
import { gatewayStartRetryDelaysMs, startGatewayWithRetry } from "@ccr/electron/main/gateway-start-retry.ts";

const config = {} as AppConfig;
const healthTimeout = "Core gateway runtime 3f9ac did not become healthy within 15000ms.";

function gatewayStatus(state: GatewayStatus["state"], lastError?: string): GatewayStatus {
  return {
    coreEndpoint: "http://127.0.0.1:3457",
    endpoint: "http://127.0.0.1:3456",
    lastError,
    networkEndpoints: [],
    state
  };
}

test("gateway start does not retry when the first attempt succeeds", async () => {
  const waits: number[] = [];
  let starts = 0;

  const status = await startGatewayWithRetry(config, {
    getStatus: () => gatewayStatus("running"),
    start: async () => {
      starts += 1;
      return gatewayStatus("running");
    },
    wait: async (ms) => {
      waits.push(ms);
    }
  });

  assert.equal(status.state, "running");
  assert.equal(starts, 1);
  assert.deepEqual(waits, []);
});

test("gateway start retries a transient failure until the runtime becomes healthy", async () => {
  const attempts = [
    gatewayStatus("error", healthTimeout),
    gatewayStatus("error", "Core gateway exited during startup with 1."),
    gatewayStatus("running")
  ];
  const waits: number[] = [];
  let current = gatewayStatus("stopped");
  let starts = 0;

  const status = await startGatewayWithRetry(config, {
    getStatus: () => current,
    start: async () => {
      current = attempts[starts];
      starts += 1;
      return current;
    },
    wait: async (ms) => {
      waits.push(ms);
    }
  });

  assert.equal(status.state, "running");
  assert.equal(starts, 3);
  assert.deepEqual(waits, gatewayStartRetryDelaysMs.slice(0, 2));
});

test("gateway start gives up after the configured retries and reports the last error", async () => {
  const failure = gatewayStatus("error", healthTimeout);
  const retries: number[] = [];
  const waits: number[] = [];
  let starts = 0;

  const status = await startGatewayWithRetry(config, {
    getStatus: () => failure,
    onRetry: (attempt) => {
      retries.push(attempt);
    },
    start: async () => {
      starts += 1;
      return failure;
    },
    wait: async (ms) => {
      waits.push(ms);
    }
  });

  assert.equal(status.state, "error");
  assert.equal(status.lastError, healthTimeout);
  assert.equal(starts, gatewayStartRetryDelaysMs.length + 1);
  assert.deepEqual(waits, gatewayStartRetryDelaysMs);
  assert.deepEqual(retries, gatewayStartRetryDelaysMs.map((_delayMs, index) => index + 1));
});

test("gateway start does not retry a configuration failure", async () => {
  for (const message of [NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, "Core gateway host must be 127.0.0.1 or ::1."]) {
    const failure = gatewayStatus("error", message);
    const waits: number[] = [];
    let starts = 0;

    const status = await startGatewayWithRetry(config, {
      getStatus: () => failure,
      start: async () => {
        starts += 1;
        return failure;
      },
      wait: async (ms) => {
        waits.push(ms);
      }
    });

    assert.equal(status.lastError, message);
    assert.equal(starts, 1, `${message} must not be retried`);
    assert.deepEqual(waits, []);
  }
});

test("gateway start stops retrying once the app begins quitting", async () => {
  const failure = gatewayStatus("error", healthTimeout);
  const waits: number[] = [];
  let quitting = false;
  let starts = 0;

  const status = await startGatewayWithRetry(config, {
    getStatus: () => failure,
    shouldAbort: () => quitting,
    start: async () => {
      starts += 1;
      return failure;
    },
    wait: async (ms) => {
      waits.push(ms);
      quitting = true;
    }
  });

  assert.equal(status.state, "error");
  assert.equal(starts, 1);
  assert.deepEqual(waits, [gatewayStartRetryDelaysMs[0]]);
});

test("gateway start yields to whoever owns the gateway during the backoff", async () => {
  for (const takeover of ["running", "stopped"] as const) {
    let current = gatewayStatus("error", healthTimeout);
    let starts = 0;

    const status = await startGatewayWithRetry(config, {
      getStatus: () => current,
      start: async () => {
        starts += 1;
        return current;
      },
      wait: async () => {
        current = gatewayStatus(takeover);
      }
    });

    assert.equal(status.state, takeover);
    assert.equal(starts, 1, `a ${takeover} gateway must not be restarted`);
  }
});
