import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyClaudeAppGatewayConfig } from "@ccr/core/agents/claude-app/gateway-service.ts";
import { resolveClaudeAppGatewayRouteModel } from "@ccr/core/agents/claude-app/gateway-routes.ts";
import { CONFIGDIR } from "@ccr/core/config/constants.ts";

test("Claude App gateway config uses static gateway credentials with current schema", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-app-gateway-config-"));
  const activeDataDir = `${dataDir}-3p`;

  try {
    const { result } = applyClaudeAppGatewayConfig(createConfig(), {
      backup: false,
      dataDir
    });
    const launchRootConfig = readJson(path.join(dataDir, "claude_desktop_config.json"));
    const launchGatewayConfig = readJson(path.join(dataDir, "configLibrary", "8f69f2f1-3275-4ad8-9317-4aa7e972f311.json"));
    const activeRootConfig = readJson(result.configFile);
    const activeGatewayConfig = readJson(result.configLibraryFile);

    assert.equal(result.dataDir, activeDataDir);
    assert.equal(result.configFile, path.join(activeDataDir, "claude_desktop_config.json"));
    assert.equal(result.configLibraryFile, path.join(activeDataDir, "configLibrary", "8f69f2f1-3275-4ad8-9317-4aa7e972f311.json"));

    assert.equal(launchRootConfig.deploymentMode, "3p");
    assert.equal(activeRootConfig.deploymentMode, "3p");
    assert.deepEqual(launchGatewayConfig, activeGatewayConfig);
    for (const key of ["authentication", "inferenceModelsUpdatedAt", "inferenceModelsVersion", "unstableDisableModelVerification"]) {
      assert.equal(Object.hasOwn(activeGatewayConfig, key), false, key);
    }
    assert.equal(activeGatewayConfig.bootstrapEnabled, false);

    assert.equal(activeGatewayConfig.inferenceProvider, "gateway");
    assert.equal(activeGatewayConfig.inferenceCredentialKind, "static");
    assert.equal(activeGatewayConfig.inferenceGatewayAuthScheme, "x-api-key");
    assert.equal(activeGatewayConfig.inferenceGatewayApiKey, "existing-test-key");
    assert.equal(activeGatewayConfig.inferenceGatewayBaseUrl, "http://127.0.0.1:3456");
    assert.equal(activeGatewayConfig.modelDiscoveryEnabled, true);
    assert.ok(activeGatewayConfig.inferenceModels.length > 0);
  } finally {
    rmSync(dataDir, { force: true, recursive: true });
    rmSync(activeDataDir, { force: true, recursive: true });
  }
});

test("Claude App gateway config writes the selected default model first", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-app-gateway-default-"));
  const activeDataDir = `${dataDir}-3p`;
  const config = createConfig({
    Providers: [
      { models: ["first-model"], name: "first-provider" },
      { models: ["selected-model"], name: "selected-provider" }
    ]
  });

  try {
    const { result } = applyClaudeAppGatewayConfig(config, {
      backup: false,
      dataDir,
      defaultModel: "selected-model"
    });
    const activeGatewayConfig = readJson(result.configLibraryFile);
    const firstModel = activeGatewayConfig.inferenceModels[0]?.name;

    assert.equal(
      resolveClaudeAppGatewayRouteModel(firstModel, config, { defaultTargetModel: "selected-model" }),
      "selected-provider/selected-model"
    );
  } finally {
    rmSync(dataDir, { force: true, recursive: true });
    rmSync(activeDataDir, { force: true, recursive: true });
  }
});

test("Claude App gateway config preserves unknown keys when rewriting config library", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-app-gateway-preserve-"));
  const activeDataDir = `${dataDir}-3p`;
  const configId = "8f69f2f1-3275-4ad8-9317-4aa7e972f311.json";
  const applyOptions = { backup: false, dataDir };

  try {
    const { result } = applyClaudeAppGatewayConfig(createConfig(), applyOptions);
    const launchLibraryFile = path.join(dataDir, "configLibrary", configId);
    const activeLibraryFile = result.configLibraryFile;

    for (const file of [launchLibraryFile, activeLibraryFile]) {
      writeJson(file, {
        ...readJson(file),
        authentication: { disableClaudeAiSignIn: true },
        inferenceModelsUpdatedAt: "2026-01-01",
        inferenceModelsVersion: "old",
        unstableDisableModelVerification: true,
        coworkEgressAllowedHosts: ["*"],
        extraUnknownKey: "keep-me"
      });
    }

    applyClaudeAppGatewayConfig(createConfig({
      PORT: 3457,
      gateway: {
        enabled: false,
        host: "0.0.0.0",
        port: 3457
      }
    }), applyOptions);

    for (const file of [launchLibraryFile, activeLibraryFile]) {
      const rewritten = readJson(file);
      assert.deepEqual(rewritten.coworkEgressAllowedHosts, ["*"]);
      assert.equal(rewritten.extraUnknownKey, "keep-me");
      for (const key of ["authentication", "inferenceModelsUpdatedAt", "inferenceModelsVersion", "unstableDisableModelVerification"]) {
        assert.equal(Object.hasOwn(rewritten, key), false, key);
      }
      assert.equal(rewritten.inferenceGatewayBaseUrl, "http://127.0.0.1:3457");
      assert.equal(rewritten.inferenceProvider, "gateway");
      assert.equal(rewritten.inferenceGatewayApiKey, "existing-test-key");
    }
  } finally {
    rmSync(dataDir, { force: true, recursive: true });
    rmSync(activeDataDir, { force: true, recursive: true });
  }
});

test("Claude App gateway config injects the ToolHub MCP server into root configs", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-app-gateway-toolhub-"));
  const activeDataDir = `${dataDir}-3p`;
  const config = createConfig({
    agent: { mcpServers: [] },
    toolHub: {
      browserAutomation: false,
      enabled: true,
      llm: {
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "test-model"
      },
      maxTools: 10,
      mcpServers: [
        {
          headers: {},
          name: "reference-mcp",
          protocolVersion: "2024-11-05",
          transport: "streamable-http",
          url: "https://reference.example/mcp"
        }
      ],
      requestTimeoutMs: 60000
    }
  });

  try {
    const { result } = applyClaudeAppGatewayConfig(config, {
      backup: false,
      dataDir
    });
    const runtimeFile = path.join(CONFIGDIR, "bin", "toolhub-mcp.js");

    for (const rootConfigFile of [
      path.join(dataDir, "claude_desktop_config.json"),
      result.configFile
    ]) {
      const rootConfig = readJson(rootConfigFile);
      assert.equal(rootConfig.deploymentMode, "3p");
      const server = rootConfig.mcpServers?.["ccr-toolhub"];
      assert.ok(server, `expected ccr-toolhub in ${rootConfigFile}`);
      assert.equal(server.command, process.execPath);
      assert.deepEqual(server.args, [runtimeFile]);
      assert.equal(server.env.ELECTRON_RUN_AS_NODE, "1");
      assert.equal(server.env.TOOLHUB_OPENAI_API_KEY, "existing-test-key");
      assert.equal(server.env.TOOLHUB_OPENAI_BASE_URL, "http://127.0.0.1:3456/v1");
      assert.equal(server.env.TOOLHUB_OPENAI_MODEL, "test-provider/test-model");
    }
    assert.equal(existsSync(runtimeFile), true);
  } finally {
    rmSync(dataDir, { force: true, recursive: true });
    rmSync(activeDataDir, { force: true, recursive: true });
  }
});

test("Claude App gateway config removes stale ToolHub entries and keeps user MCP servers", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-app-gateway-stale-"));
  const activeDataDir = `${dataDir}-3p`;
  const config = createConfig({
    agent: { mcpServers: [] },
    toolHub: {
      browserAutomation: false,
      enabled: false,
      llm: {
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "test-model"
      },
      maxTools: 10,
      mcpServers: [],
      requestTimeoutMs: 60000
    }
  });

  try {
    writeJson(path.join(dataDir, "claude_desktop_config.json"), {
      deploymentMode: "native",
      mcpServers: {
        "ccr-toolhub": { command: "stale", type: "stdio" },
        userServer: { command: "keep-me", type: "stdio" }
      }
    });

    applyClaudeAppGatewayConfig(config, {
      backup: false,
      dataDir
    });
    const rootConfig = readJson(path.join(dataDir, "claude_desktop_config.json"));

    assert.equal(rootConfig.deploymentMode, "3p");
    assert.deepEqual(rootConfig.mcpServers, {
      userServer: { command: "keep-me", type: "stdio" }
    });

    writeJson(path.join(dataDir, "claude_desktop_config.json"), {
      deploymentMode: "native",
      mcpServers: {
        "ccr-toolhub": { command: "stale", type: "stdio" }
      }
    });

    applyClaudeAppGatewayConfig(config, {
      backup: false,
      dataDir
    });
    const emptiedRootConfig = readJson(path.join(dataDir, "claude_desktop_config.json"));

    assert.equal(emptiedRootConfig.deploymentMode, "3p");
    assert.equal(Object.hasOwn(emptiedRootConfig, "mcpServers"), false);
  } finally {
    rmSync(dataDir, { force: true, recursive: true });
    rmSync(activeDataDir, { force: true, recursive: true });
  }
});

function createConfig(overrides = {}) {
  return {
    APIKEY: "existing-test-key",
    APIKEYS: [],
    HOST: "0.0.0.0",
    PORT: 3456,
    Providers: [{
      models: ["test-model"],
      name: "test-provider"
    }],
    gateway: {
      enabled: false,
      host: "0.0.0.0",
      port: 3456
    },
    profile: {
      profiles: []
    },
    virtualModelProfiles: [],
    ...overrides
  };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
