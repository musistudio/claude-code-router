import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeCodeBuddyModelsConfig } from "@ccr/core/agents/codebuddy/models-config.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";

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
    models: ["gpt-5.6-sol", "gpt-5.6-terra"],
    name: "Codex API",
    type: "openai_responses"
  }];
  config.preferredProvider = "Codex API";
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 4567;
  return config;
}

function testProfile() {
  return {
    agent: "codebuddy",
    enabled: true,
    env: {},
    id: "codebuddy-main",
    model: "Codex API/gpt-5.6-sol",
    name: "CodeBuddy Main",
    providerId: "claude-code-router",
    providerName: "Claude Code Router",
    scope: "global",
    surface: "app"
  };
}

test("CodeBuddy models.json points models at the CCR OpenAI chat/completions endpoint", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-codebuddy-"));
  const previousHome = process.env.HOME;
  try {
    process.env.HOME = root;
    const result = writeCodeBuddyModelsConfig(testConfig(root), testProfile(), "ccr-token", { backup: false });
    assert.equal(result.changed, true);

    const content = JSON.parse(readFileSync(result.file, "utf8"));
    assert.ok(Array.isArray(content.models));
    const entry = content.models.find((model) => model.id === "Codex API/gpt-5.6-sol");
    assert.ok(entry, "expected the selected provider/model to be present");
    assert.equal(entry.url, "http://127.0.0.1:4567/v1/chat/completions");
    assert.equal(entry.apiKey, "ccr-token");
    assert.equal(entry.supportsToolCall, true);
    assert.ok(entry.maxInputTokens > 0);
    assert.equal(content.availableModels, undefined, "availableModels must be omitted so all models show in the picker");
    assert.ok(content.models.some((model) => model.id === "Codex API/gpt-5.6-terra"));
  } finally {
    process.env.HOME = previousHome;
    rmSync(root, { recursive: true, force: true });
  }
});

test("CodeBuddy models.json preserves user-managed model entries", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-codebuddy-"));
  const previousHome = process.env.HOME;
  try {
    process.env.HOME = root;
    const modelsFile = path.join(root, ".codebuddy", "models.json");
    mkdirSync(path.dirname(modelsFile), { recursive: true });
    writeFileSync(modelsFile, JSON.stringify({
      models: [
        { id: "user-kept-model", name: "User Kept", url: "https://user.example/v1/chat/completions", apiKey: "user-key" }
      ],
      availableModels: ["user-kept-model"]
    }, null, 2));

    const result = writeCodeBuddyModelsConfig(testConfig(root), testProfile(), "ccr-token", { backup: false });
    const content = JSON.parse(readFileSync(result.file, "utf8"));

    const kept = content.models.find((model) => model.id === "user-kept-model");
    assert.ok(kept, "user-managed model should be preserved");
    assert.equal(kept.url, "https://user.example/v1/chat/completions");
    assert.ok(content.models.some((model) => model.id === "Codex API/gpt-5.6-sol"));
    assert.equal(content.availableModels, undefined, "availableModels must not be written so all models show");
  } finally {
    process.env.HOME = previousHome;
    rmSync(root, { recursive: true, force: true });
  }
});
