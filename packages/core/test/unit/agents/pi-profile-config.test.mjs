import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writePiGatewayConfig } from "@ccr/core/agents/pi/profile-config.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";

test("Pi profile config writes a CCR OpenAI Responses provider", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-profile-"));
  try {
    const config = createDefaultAppConfig();
    config.gateway.host = "0.0.0.0";
    config.gateway.port = 3459;
    config.Providers = [
      {
        api_key: "sk-test",
        baseUrl: "https://api.example.test/v1",
        models: ["alpha", "beta"],
        name: "Example",
        type: "openai_responses"
      }
    ];
    const profile = {
      agent: "pi",
      enabled: true,
      id: "pi-main",
      model: "Example/alpha",
      name: "Pi Main",
      providerId: "ccr-pi",
      scope: "ccr",
      surface: "cli"
    };

    const result = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "Example/alpha");
    const payload = JSON.parse(readFileSync(result.file, "utf8"));
    const provider = payload.providers["ccr-pi"];

    assert.equal(result.changed, true);
    assert.equal(result.model, "Example/alpha");
    assert.equal(result.providerId, "ccr-pi");
    assert.equal(result.file, path.join(root, "profiles", "pi-main", "pi", "models.json"));
    assert.equal(result.profileHome, path.join(root, "profiles", "pi-main", "pi"));
    assert.equal(result.sessionDir, path.join(root, "profiles", "pi-main", "pi", "sessions"));
    assert.equal(provider.baseUrl, "http://127.0.0.1:3459/v1");
    assert.equal(provider.api, "openai-responses");
    assert.equal(provider.apiKey, "ccr-profile-token");
    assert.equal(provider.authHeader, true);
    assert.deepEqual(provider.headers, {
      "x-ccr-client": "pi",
      "x-ccr-profile": "pi-main"
    });
    assert.ok(provider.models.some((model) => model.id === "Example/alpha"));
    assert.ok(provider.models.some((model) => model.id === "Example/beta"));

    const second = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "Example/alpha");
    assert.equal(second.changed, false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Pi profile config writes catalog token limits for known models", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-profile-limits-"));
  try {
    const config = createDefaultAppConfig();
    config.gateway.host = "127.0.0.1";
    config.gateway.port = 3459;
    config.Providers = [
      {
        api_key: "sk-test",
        baseUrl: "https://api.deepseek.example/v1",
        models: ["deepseek-v4-flash", "unknown-model"],
        name: "DeepSeek",
        type: "openai_chat_completions"
      }
    ];
    const profile = {
      agent: "pi",
      enabled: true,
      id: "pi-main",
      model: "DeepSeek/deepseek-v4-flash",
      name: "Pi Main",
      providerId: "ccr-pi",
      scope: "ccr",
      surface: "cli"
    };

    const result = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "DeepSeek/deepseek-v4-flash");
    const payload = JSON.parse(readFileSync(result.file, "utf8"));
    const models = payload.providers["ccr-pi"].models;
    const deepseek = models.find((model) => model.id === "DeepSeek/deepseek-v4-flash");
    const unknown = models.find((model) => model.id === "DeepSeek/unknown-model");

    assert.equal(deepseek.contextWindow, 1_050_000);
    assert.equal(deepseek.maxTokens, 393_216);
    assert.deepEqual(unknown, {
      id: "DeepSeek/unknown-model",
      name: "DeepSeek/unknown-model"
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Pi profile config writes 1M catalog limits for GLM 5.3", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-profile-glm-"));
  try {
    const config = createDefaultAppConfig();
    config.gateway.host = "127.0.0.1";
    config.gateway.port = 3459;
    config.Providers = [
      {
        api_key: "sk-test",
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        models: ["glm-5.3"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      }
    ];
    const profile = {
      agent: "pi",
      enabled: true,
      id: "pi-main",
      model: "Zhipu AI (China) - Coding Plan/glm-5.3",
      name: "Pi Main",
      providerId: "ccr-pi",
      scope: "ccr",
      surface: "cli"
    };

    const result = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "Zhipu AI (China) - Coding Plan/glm-5.3");
    const payload = JSON.parse(readFileSync(result.file, "utf8"));
    const models = payload.providers["ccr-pi"].models;
    const glm = models.find((model) => model.id === "Zhipu AI (China) - Coding Plan/glm-5.3");

    assert.equal(glm?.contextWindow, 1_048_576);
    assert.equal(glm?.maxTokens, 131_072);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
