import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import { shouldRestartGatewayForRuntimeConfigChange } from "../../packages/core/src/gateway/runtime-change.ts";

test("ToolHub config changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  const next = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  next.toolHub = {
    ...next.toolHub,
    enabled: true,
    mcpServers: [
      {
        headers: { Authorization: "Bearer token" },
        name: "mcd-mcp",
        protocolVersion: "2024-11-05",
        requestTimeoutMs: 30000,
        startupTimeoutMs: 600000,
        transport: "streamable-http",
        url: "https://mcp.mcd.cn"
      }
    ]
  };

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
});
