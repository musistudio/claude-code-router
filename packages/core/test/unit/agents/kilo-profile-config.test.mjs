import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import {
  isManagedKiloConfigContent,
  resolveKiloConfigFile,
  writeKiloGatewayConfig
} from "@ccr/core/agents/kilo/profile-config.ts";

function testConfig(root) {
  const config = createDefaultAppConfig();
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model-a", "model-b"], name: "Provider" }];
  config.preferredProvider = "Provider";
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 4567;
  return config;
}

function testProfile(overrides = {}) {
  return {
    agent: "kilo",
    enabled: true,
    env: {},
    id: "kilo-main",
    model: "Provider,model-a",
    name: "Kilo Main",
    providerId: "claude-code-router",
    providerName: "Claude Code Router",
    scope: "ccr",
    surface: "cli",
    ...overrides
  };
}

test("Kilo profile config routes primary and small models through CCR", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-kilo-profile-"));
  try {
    const profile = testProfile();
    const result = writeKiloGatewayConfig(root, testConfig(root), profile, "ccr-profile-key");
    const config = JSON.parse(readFileSync(result.file, "utf8"));

    assert.equal(result.file, path.join(root, "profiles", "kilo-main", "kilo", "kilo.jsonc"));
    assert.equal(config.$schema, "https://app.kilo.ai/config.json");
    assert.equal(config.model, "claude-code-router/Provider/model-a");
    assert.equal(config.small_model, config.model);
    assert.equal(config.provider["claude-code-router"].npm, "@ai-sdk/openai-compatible");
    assert.equal(config.provider["claude-code-router"].options.baseURL, "http://127.0.0.1:4567/v1");
    assert.equal(config.provider["claude-code-router"].options.apiKey, "ccr-profile-key");
    assert.equal(config.provider["claude-code-router"].options.headers["x-ccr-client"], "kilo");
    assert.ok(config.provider["claude-code-router"].models["Provider/model-a"]);
    assert.equal(JSON.parse(result.inlineConfig).model, config.model);
    assert.equal(isManagedKiloConfigContent(readFileSync(result.file, "utf8"), "claude-code-router"), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Kilo global config keeps user settings and snapshots the original JSONC", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-kilo-global-"));
  try {
    const configFile = path.join(root, "kilo.jsonc");
    const original = `{
      // Keep this user preference in the managed config.
      "autoupdate": false,
      "provider": { "existing": { "name": "Existing" } }
    }\n`;
    writeFileSync(configFile, original);
    if (process.platform !== "win32") {
      chmodSync(configFile, 0o644);
    }
    const profile = testProfile({ configFile, scope: "global" });
    const result = writeKiloGatewayConfig(root, testConfig(root), profile, "ccr-profile-key");
    const managed = JSON.parse(readFileSync(configFile, "utf8"));

    assert.equal(resolveKiloConfigFile(root, profile), configFile);
    assert.equal(managed.autoupdate, false);
    assert.equal(managed.provider.existing.name, "Existing");
    assert.equal(readFileSync(`${configFile}.ccr-original`, "utf8"), original);
    assert.ok(result.backupFile && existsSync(result.backupFile));
    if (process.platform !== "win32") {
      chmodSync(configFile, 0o644);
      chmodSync(`${configFile}.ccr-original`, 0o644);
      chmodSync(result.backupFile, 0o644);
      const unchanged = writeKiloGatewayConfig(root, testConfig(root), profile, "ccr-profile-key");
      assert.equal(unchanged.changed, false);
      assert.equal(statSync(configFile).mode & 0o777, 0o600);
      assert.equal(statSync(`${configFile}.ccr-original`).mode & 0o777, 0o600);
      assert.equal(statSync(result.backupFile).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
