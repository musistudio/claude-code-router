import assert from "node:assert/strict";
import test from "node:test";
import { gatewayChildPreloadEnvAndArgs } from "@ccr/core/gateway/core-runtime/supervisor.ts";

test("gateway child preload is disabled when API_TIMEOUT_MS is unset or non-positive", () => {
  for (const config of [{}, { API_TIMEOUT_MS: 0 }, { API_TIMEOUT_MS: "0" }, { API_TIMEOUT_MS: "abc" }, { API_TIMEOUT_MS: -1000 }]) {
    const result = gatewayChildPreloadEnvAndArgs(config);
    assert.deepEqual(result, { env: {}, extraArgs: [] }, `expected no preload for ${JSON.stringify(config)}`);
  }
});

test("gateway child preload wires API_TIMEOUT_MS into the undici dispatcher env", () => {
  const result = gatewayChildPreloadEnvAndArgs({ API_TIMEOUT_MS: 600000 });

  assert.equal(result.env.CCR_UPSTREAM_TIMEOUT_MS, "600000");
  assert.ok(result.env.CCR_UNDICI_MODULE, "expected the undici module path to be resolved");
  assert.equal(result.extraArgs.length, 2);
  assert.equal(result.extraArgs[0], "--require");
  assert.ok(result.extraArgs[1].endsWith("gateway-proxy-preload.cjs"));
});

test("gateway child preload truncates fractional timeouts", () => {
  const result = gatewayChildPreloadEnvAndArgs({ API_TIMEOUT_MS: "12345.9" });

  assert.equal(result.env.CCR_UPSTREAM_TIMEOUT_MS, "12345");
});

test("gateway child preload keeps string API_TIMEOUT_MS values", () => {
  const result = gatewayChildPreloadEnvAndArgs({ API_TIMEOUT_MS: "600000" });

  assert.equal(result.env.CCR_UPSTREAM_TIMEOUT_MS, "600000");
});
