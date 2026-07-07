import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import {
  BROWSER_AUTOMATION_HANDOFF_TIMEOUT_MS,
  BROWSER_AUTOMATION_MCP_PATH,
  BROWSER_AUTOMATION_MCP_SERVER_NAME,
  browserAutomationMcpEnabled,
  toolHubMcpRuntimeConfig
} from "../../packages/core/src/mcp/toolhub-config.ts";

test("ToolHub runtime includes the built-in browser automation backend", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.toolHub = {
    ...config.toolHub,
    browserAutomation: true,
    enabled: true
  };

  const runtime = toolHubMcpRuntimeConfig(config, undefined, {
    resolver: {
      apiKey: "ccr-profile-test",
      baseUrl: "http://127.0.0.1:3456/v1",
      model: "Provider/model"
    }
  });
  assert.ok(runtime);

  const servers = JSON.parse(runtime.env.TOOLHUB_MCP_SERVERS_JSON);
  const browserAutomation = servers.find((server) => server.name === BROWSER_AUTOMATION_MCP_SERVER_NAME);
  assert.ok(browserAutomation);
  assert.equal(browserAutomation.apiKey, "ccr-profile-test");
  assert.equal(browserAutomation.requestTimeoutMs, BROWSER_AUTOMATION_HANDOFF_TIMEOUT_MS);
  assert.equal(browserAutomation.transport, "streamable-http");
  assert.equal(browserAutomation.url, `http://127.0.0.1:${config.gateway.port}${BROWSER_AUTOMATION_MCP_PATH}`);
  assert.equal(runtime.env.TOOLHUB_REQUEST_TIMEOUT_MS, String(BROWSER_AUTOMATION_HANDOFF_TIMEOUT_MS));
});

test("ToolHub browser automation backend uses a connectable loopback host", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.gateway.host = "0.0.0.0";
  config.toolHub = {
    ...config.toolHub,
    browserAutomation: true,
    enabled: true
  };

  const runtime = toolHubMcpRuntimeConfig(config, undefined, {
    resolver: {
      apiKey: "ccr-profile-test",
      baseUrl: "http://127.0.0.1:3456/v1",
      model: "Provider/model"
    }
  });
  assert.ok(runtime);

  const servers = JSON.parse(runtime.env.TOOLHUB_MCP_SERVERS_JSON);
  const browserAutomation = servers.find((server) => server.name === BROWSER_AUTOMATION_MCP_SERVER_NAME);
  assert.equal(browserAutomation.url, `http://127.0.0.1:${config.gateway.port}${BROWSER_AUTOMATION_MCP_PATH}`);
});

test("ToolHub runtime skips built-in browser automation until enabled", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.toolHub = {
    ...config.toolHub,
    browserAutomation: false,
    enabled: true
  };

  assert.equal(browserAutomationMcpEnabled(config), false);
  assert.equal(toolHubMcpRuntimeConfig(config), undefined);
});
