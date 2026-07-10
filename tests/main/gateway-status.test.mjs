import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import { gatewayService } from "../../packages/core/src/gateway/service.ts";

test("gateway start persists preflight validation failures for status polling", async () => {
  await gatewayService.stop();

  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.gateway.coreHost = "0.0.0.0";

  const startStatus = await gatewayService.start(config);
  const polledStatus = gatewayService.getStatus();

  assert.equal(startStatus.state, "error");
  assert.equal(polledStatus.state, "error");
  assert.equal(polledStatus.lastError, "Core gateway host must be 127.0.0.1 or ::1.");

  await gatewayService.stop();
});
