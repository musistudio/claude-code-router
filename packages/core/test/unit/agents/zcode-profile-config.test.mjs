import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildZcodeModelCatalog } from "@ccr/core/agents/zcode/model-catalog.ts";
import { writeZcodeGatewayConfig } from "@ccr/core/agents/zcode/profile-config.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";

const fusionModel = "Fusion/catalog-context";
const knownModel = "Codex API/gpt-5.6-sol";
const unknownModel = "Codex API/unknown-model";

function testConfig(root) {
  const config = createDefaultAppConfig({ generatedConfigFile: path.join(root, "gateway.config.json") });
  config.Providers = [{
    api_base_url: "https://example.test/v1",
    modelMetadata: {
      "gpt-5.6-sol": {
        contextWindow: 272_000,
        maxContextWindow: 272_000
      }
    },
    models: ["gpt-5.6-sol", "unknown-model"],
    name: "Codex API",
    type: "openai_responses"
  }];
  config.virtualModelProfiles = [{
    baseModel: { fixedModel: knownModel, mode: "fixed" },
    enabled: true,
    match: { exactAliases: ["catalog-context"], prefixes: [], suffixes: [] },
    materialization: { enabled: true, includeInGatewayModels: true }
  }];
  config.preferredProvider = "Codex API";
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 4567;
  return config;
}

function testProfile(root) {
  return {
    agent: "zcode",
    codexHome: root,
    enabled: true,
    env: {},
    id: "zcode-main",
    model: "Codex API,gpt-5.6-sol",
    name: "ZCode Main",
    providerId: "claude-code-router",
    providerName: "Claude Code Router",
    scope: "global",
    surface: "app"
  };
}

test("ZCode profile config writes resolved model limits instead of fixed defaults", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-zcode-profile-"));
  try {
    const result = writeZcodeGatewayConfig(
      testConfig(root),
      testProfile(root),
      "ccr-profile-key",
      { backup: false }
    );
    const cliConfig = JSON.parse(readFileSync(result.file, "utf8"));
    const v2Config = JSON.parse(readFileSync(path.join(root, "v2", "config.json"), "utf8"));
    const cache = JSON.parse(readFileSync(path.join(root, "v2", "bots-model-cache.v2.json"), "utf8"));

    for (const config of [cliConfig, v2Config]) {
      const models = config.provider["claude-code-router"].models;
      assert.equal(models[fusionModel].limit.context, 1_050_000);
      assert.equal(models[fusionModel].limit.output, 8_192);
      assert.equal(models[knownModel].limit.context, 1_050_000);
      assert.equal(models[knownModel].limit.output, 8_192);
      assert.equal(models[unknownModel].limit.context, 128_000);
      assert.equal(models[unknownModel].limit.output, 8_192);
    }

    const cachedProvider = cache.providers.find((provider) => provider.id === "claude-code-router");
    const cachedModels = Object.fromEntries(cachedProvider.models.map((model) => [model.id, model]));
    assert.equal(cachedModels[fusionModel].contextWindow, 1_050_000);
    assert.equal(cachedModels[fusionModel].maxOutputTokens, 8_192);
    assert.equal(cachedModels[knownModel].contextWindow, 1_050_000);
    assert.equal(cachedModels[knownModel].maxOutputTokens, 8_192);
    assert.equal(cachedModels[unknownModel].contextWindow, 128_000);
    assert.equal(cachedModels[unknownModel].maxOutputTokens, 8_192);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("ZCode model catalog resolves physical models for materialized Fusion selectors", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-zcode-catalog-"));
  try {
    const config = testConfig(root);
    config.Providers.push({
      api_base_url: "https://api.deepseek.com",
      modelMetadata: {
        "deepseek-v4-flash": {
          contextWindow: 128_000,
          maxContextWindow: 128_000
        }
      },
      models: ["deepseek-v4-flash"],
      name: "DeepSeek",
      type: "openai_responses"
    });
    config.virtualModelProfiles.push(
      {
        baseModel: { fixedModel: "DeepSeek/deepseek-v4-flash", mode: "fixed" },
        enabled: true,
        match: { exactAliases: ["deepseek-context"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true }
      },
      {
        baseModel: { mode: "request" },
        enabled: true,
        match: { exactAliases: [], prefixes: ["fusion-"], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true }
      },
      {
        baseModel: { mode: "request" },
        enabled: true,
        match: { exactAliases: [], prefixes: [], suffixes: ["-fusion"] },
        materialization: { enabled: true, includeInGatewayModels: true }
      },
      {
        baseModel: { mode: "request" },
        enabled: true,
        match: { exactAliases: ["dynamic-route"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true }
      }
    );

    const models = Object.fromEntries(
      buildZcodeModelCatalog(config).models.map((model) => [model.slug, model])
    );

    assert.equal(models[fusionModel].context_window, 1_050_000);
    assert.equal(models["Fusion/deepseek-context"].context_window, 1_050_000);
    assert.equal(models["Codex API/fusion-gpt-5.6-sol"].context_window, 1_050_000);
    assert.equal(models["Codex API/gpt-5.6-sol-fusion"].context_window, 1_050_000);
    assert.equal(models["Fusion/dynamic-route"].context_window, 128_000);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
