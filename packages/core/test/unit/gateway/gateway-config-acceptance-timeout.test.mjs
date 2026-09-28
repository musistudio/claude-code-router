import assert from "node:assert/strict";
import test from "node:test";
import { gatewayConfigAcceptanceTimeoutMs } from "@ccr/core/gateway/core-runtime/supervisor.ts";

test("gateway config acceptance timeout defaults to 30s when env is unset", () => {
  assert.equal(gatewayConfigAcceptanceTimeoutMs({}), 30_000);
});

test("gateway config acceptance timeout honors CCR_GATEWAY_CONFIG_TIMEOUT_MS", () => {
  assert.equal(
    gatewayConfigAcceptanceTimeoutMs({ CCR_GATEWAY_CONFIG_TIMEOUT_MS: "60000" }),
    60_000
  );
});

test("gateway config acceptance timeout trims whitespace and truncates fractions", () => {
  assert.equal(
    gatewayConfigAcceptanceTimeoutMs({ CCR_GATEWAY_CONFIG_TIMEOUT_MS: "  12345.9  " }),
    12_345
  );
});

test("gateway config acceptance timeout rejects invalid or too-small overrides", () => {
  for (const raw of ["", "   ", "abc", "0", "-5000", "999", "NaN", "Infinity"]) {
    assert.equal(
      gatewayConfigAcceptanceTimeoutMs({ CCR_GATEWAY_CONFIG_TIMEOUT_MS: raw }),
      30_000,
      `expected default for ${JSON.stringify(raw)}`
    );
  }
});