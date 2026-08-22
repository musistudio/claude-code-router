import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyClaudeAppGatewayConfig } from "@ccr/core/agents/claude-app/gateway-service.ts";
import { resolveClaudeAppGatewayRouteModel } from "@ccr/core/agents/claude-app/gateway-routes.ts";

test("Claude App gateway config keeps 3P mode signed out of Claude.ai", () => {
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
    assert.deepEqual(activeGatewayConfig.authentication, {
      disableClaudeAiSignIn: true
    });
    assert.equal(activeGatewayConfig.bootstrapEnabled, false);

    assert.equal(activeGatewayConfig.inferenceProvider, "gateway");
    assert.equal(activeGatewayConfig.inferenceCredentialKind, "static");
    assert.equal(activeGatewayConfig.inferenceGatewayAuthScheme, "x-api-key");
    assert.equal(activeGatewayConfig.inferenceGatewayApiKey, "existing-test-key");
    assert.equal(activeGatewayConfig.inferenceGatewayBaseUrl, "http://127.0.0.1:3456");
    assert.equal(activeGatewayConfig.modelDiscoveryEnabled, true);
    assert.equal(activeGatewayConfig.unstableDisableModelVerification, true);
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
