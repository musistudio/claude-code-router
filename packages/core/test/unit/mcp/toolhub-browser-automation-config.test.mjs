import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import {
  BROWSER_AUTOMATION_HANDOFF_TIMEOUT_MS,
  BROWSER_AUTOMATION_MCP_PATH,
  BROWSER_AUTOMATION_MCP_SERVER_NAME,
  browserAutomationMcpEnabled,
  bundledToolHubMcpEntryPathCandidates,
  toolHubMcpRuntimeConfig
} from "@ccr/core/mcp/toolhub-config.ts";
import { MEDIA_TOOLS_MCP_PATH, mediaToolsMcpServer } from "@ccr/core/mcp/grok-media-config.ts";
import { GROK_MEDIA_FUSION_TOOL_NAMES, MEDIA_TOOLS_MCP_SERVER_NAME } from "@ccr/core/contracts/app.ts";
import { fusionFallbackToolDefinitions, fusionToolNamesBackedByMcpServers } from "@ccr/core/mcp/fusion-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";

test("ToolHub runtime candidates include the clean Core test build", () => {
  assert.ok(bundledToolHubMcpEntryPathCandidates().includes(
    path.join(process.cwd(), ".test-dist", "core", "runtime", "toolhub-mcp.js")
  ));
});

test("Media tools are a Fusion MCP backend independent from ToolHub", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.gateway.host = "0.0.0.0";
  config.mediaTools.enabled = true;
  config.mediaTools.jobTimeoutMs = 600000;
  config.Providers = [{ apiKey: "ccr-local-agent-login", baseUrl: "https://cli-chat-proxy.grok.com/v1", models: ["grok-4.5"], name: "Grok Agent" }];
  config.virtualModelProfiles = [{
    enabled: true,
    metadata: {
      fusionMedia: {
        imageEditToolName: "image_edit_profile_one",
        imageGenerateToolName: "image_generate_profile_one",
        imageModelSelector: "grok-cli",
        jobCancelToolName: "media_job_cancel_profile_one",
        jobGetToolName: "media_job_get_profile_one",
        videoModelSelector: "grok-cli",
        videoStartToolName: "video_generate_profile_one"
      }
    },
    tools: []
  }];

  const media = mediaToolsMcpServer(config, { apiKey: "ccr-profile-test" });
  assert.ok(media);
  assert.equal(media.transport, "stdio");
  assert.equal(media.command, process.execPath);
  assert.ok(media.args[0].endsWith("media-tools-proxy-mcp.js"));
  assert.equal(media.env.CCR_MEDIA_MCP_API_KEY, "ccr-profile-test");
  assert.equal(media.env.CCR_MEDIA_MCP_URL, `http://127.0.0.1:${config.gateway.port}${MEDIA_TOOLS_MCP_PATH}`);
  assert.deepEqual(JSON.parse(media.env.CCR_MEDIA_MCP_TOOLS_JSON).map((tool) => tool.name), [
    "image_generate_profile_one",
    "image_edit_profile_one",
    "video_generate_profile_one",
    "media_job_get_profile_one",
    "media_job_cancel_profile_one"
  ]);
  assert.equal(media.requestTimeoutMs, 630000);
  assert.deepEqual(
    [...fusionToolNamesBackedByMcpServers([media])].filter((name) => name.startsWith("grok_media_")),
    [...GROK_MEDIA_FUSION_TOOL_NAMES]
  );
  assert.deepEqual(fusionFallbackToolDefinitions([{
    enabled: true,
    tools: [{ name: "image_generate_profile_one", visibility: "client" }]
  }], fusionToolNamesBackedByMcpServers([media])), []);
});

test("ToolHub does not absorb Fusion media tools", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.toolHub.enabled = true;
  config.mediaTools.enabled = true;

  assert.equal(toolHubMcpRuntimeConfig(config), undefined);
});

test("Core Gateway registers media tools directly for Fusion models", async () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.mediaTools.enabled = true;
  config.toolHub.enabled = true;

  const compiled = await compileCoreGatewayConfig(config, "raw-trace-token", "billing-token", "core-token");
  const servers = compiled.agent.mcpServers;
  const media = servers.find((server) => server.name === MEDIA_TOOLS_MCP_SERVER_NAME);
  assert.ok(media);
  assert.equal(media.transport, "stdio");
  assert.ok(media.args[0].endsWith("media-tools-proxy-mcp.js"));
  assert.equal(servers.some((server) => server.name === "ccr-toolhub"), false);
});

test("Core Gateway compiles one profile for each configured Fusion media model", async () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.mediaTools.enabled = true;
  config.Providers = [
    { models: ["base-model"], name: "Provider" },
    { apiKey: "ccr-local-agent-login", baseUrl: "https://cli-chat-proxy.grok.com/v1", models: ["grok-4.5"], name: "Grok Agent" }
  ];
  config.virtualModelProfiles = [{
    baseModel: { fixedModel: "Provider/base-model", mode: "fixed" },
    displayName: "Media Test",
    enabled: true,
    execution: { clientToolsPolicy: "allow", maxToolCalls: 5, maxTurns: 6, mode: "tool_loop", streamMode: "buffered" },
    id: "media-test",
    key: "media-test",
    match: { exactAliases: ["media-test"], prefixes: [], suffixes: [] },
    materialization: { enabled: true, includeInGatewayModels: true },
    metadata: {
      fusionMedia: {
        imageGenerateToolName: "image_generate_media_test",
        imageModelSelector: "grok-cli"
      }
    },
    tools: [{ name: "image_generate_media_test", visibility: "internal" }]
  }];

  const compiled = await compileCoreGatewayConfig(config, "raw-trace-token", "billing-token", "core-token");
  const mediaProfiles = compiled.virtualModelProfiles.filter((profile) => profile.metadata?.fusionMedia);

  assert.equal(mediaProfiles.length, 1);
  assert.equal(mediaProfiles[0].key, "media-test");
  assert.equal(mediaProfiles[0].tools[0].name, "image_generate_media_test");
  assert.equal(mediaProfiles[0].materialization.enabled, true);
  assert.equal(mediaProfiles[0].execution.maxToolCalls, Number.MAX_SAFE_INTEGER);
  assert.equal(mediaProfiles[0].execution.maxTurns, Number.MAX_SAFE_INTEGER);
});

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
