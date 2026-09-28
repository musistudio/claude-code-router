import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { mediaToolsConfigFromRawForTest, virtualModelProfileFromRawForTest } from "@ccr/core/config/config.ts";
import { shouldRestartGatewayForRuntimeConfigChange } from "@ccr/core/gateway/runtime-change.ts";

test("ToolHub config changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
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

test("media tool policy changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
  next.mediaTools.enabled = true;

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
});

test("legacy Grok media input migrates only internal policy and drops xAI-specific execution fields", () => {
  const migrated = mediaToolsConfigFromRawForTest({
    allowedInputRoots: ["/tmp/media"],
    apiKey: "must-not-survive",
    artifactTtlHours: 48,
    backend: "xai-api",
    baseUrl: "https://api.x.ai/v1",
    enabled: true,
    imageModel: "legacy-image-model",
    maxImageConcurrency: 3,
    videoModel: "legacy-video-model"
  });

  assert.deepEqual(migrated, {
    allowedInputRoots: ["/tmp/media"],
    artifactTtlHours: 48,
    enabled: true,
    maxImageConcurrency: 3
  });
});

test("legacy virtual model tool loop limits are removed from application config", () => {
  const migrated = virtualModelProfileFromRawForTest({
    execution: {
      clientToolsPolicy: "allow",
      maxToolCalls: 8,
      maxTurns: 6,
      mode: "tool_loop",
      streamMode: "optimistic"
    },
    id: "fusion-media"
  });

  assert.deepEqual(migrated, {
    execution: {
      clientToolsPolicy: "allow",
      mode: "tool_loop",
      streamMode: "optimistic"
    },
    id: "fusion-media"
  });
});

test("upstream proxy config changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
  next.proxy.upstream = {
    custom: {
      password: "secret",
      port: 8888,
      server: "proxy.example.com",
      username: "alice"
    },
    mode: "custom"
  };

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
});

test("raw trace observability config changes restart the gateway runtime", () => {
  const mutations = [
    (config) => { config.observability.requestLogs = !config.observability.requestLogs; },
    (config) => { config.observability.agentAnalysis = !config.observability.agentAnalysis; },
    (config) => { config.observability.requestLogBodyCapture = "none"; },
    (config) => { config.observability.requestLogMaxBodyBytes = 4 * 1024 * 1024; }
  ];

  for (const mutate of mutations) {
    const previous = createDefaultAppConfig();
    const next = createDefaultAppConfig();
    mutate(next);
    assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
  }
});

test("main-process-only observability changes do not restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
  next.observability.requestLogSuccessSampleRate = 0.25;

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), false);
});

test("router plugin input changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
  next.Router.rules = [
    {
      enabled: true,
      id: "force-haiku",
      name: "Force Haiku",
      pattern: "haiku:",
      target: "anthropic,claude-3-5-haiku-latest",
      type: "model-prefix"
    }
  ];

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
});

test("public API key changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
  next.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "local", key: "client-key" }];

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
});

test("profile allowlist changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
  next.profile.profiles = next.profile.profiles.map((profile) => profile.id === "default-claude-code"
    ? { ...profile, modelAllowlist: { enabled: true, models: ["glm-4.5-air"] } }
    : profile);

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
});

test("core gateway timeout changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
  next.API_TIMEOUT_MS = 30000;

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
});

test("context archive mode changes restart the gateway runtime", () => {
  const previous = createDefaultAppConfig();
  const next = createDefaultAppConfig();
  next.contextArchive.enabled = true;

  assert.equal(shouldRestartGatewayForRuntimeConfigChange(previous, next), true);
});
