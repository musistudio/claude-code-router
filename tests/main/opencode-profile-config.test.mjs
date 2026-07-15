import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import {
  isManagedOpenCodeConfigContent,
  resolveOpenCodeConfigFile,
  writeOpenCodeGatewayConfig
} from "../../packages/core/src/agents/opencode/profile-config.ts";
import {
  findInstalledOpenCodeAppExecutable,
  openCodeAppLaunchSignature,
  openCodeAppLaunchArgs,
  openCodeDesktopCommandNames
} from "../../packages/core/src/agents/opencode/app-launch.ts";

function testConfig(root) {
  const config = createDefaultAppConfig({ generatedConfigFile: path.join(root, "gateway.config.json") });
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model-a", "model-b"], name: "Provider" }];
  config.preferredProvider = "Provider";
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 4567;
  return config;
}

function testProfile(overrides = {}) {
  return {
    agent: "opencode",
    enabled: true,
    env: {},
    id: "opencode-main",
    model: "Provider,model-a",
    name: "OpenCode Main",
    providerId: "claude-code-router",
    providerName: "Claude Code Router",
    scope: "ccr",
    surface: "auto",
    ...overrides
  };
}

test("OpenCode profile config routes primary and small models through CCR", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-opencode-profile-"));
  try {
    const profile = testProfile();
    const result = writeOpenCodeGatewayConfig(root, testConfig(root), profile, "ccr-profile-key");
    const config = JSON.parse(readFileSync(result.file, "utf8"));

    assert.equal(result.file, path.join(root, "profiles", "opencode-main", "opencode", "opencode.jsonc"));
    assert.equal(config.model, "claude-code-router/Provider/model-a");
    assert.equal(config.small_model, config.model);
    assert.equal(config.provider["claude-code-router"].npm, "@ai-sdk/openai-compatible");
    assert.equal(config.provider["claude-code-router"].options.baseURL, "http://127.0.0.1:4567/v1");
    assert.equal(config.provider["claude-code-router"].options.apiKey, "ccr-profile-key");
    assert.equal(config.provider["claude-code-router"].options.headers["x-ccr-client"], "opencode");
    assert.ok(config.provider["claude-code-router"].models["Provider/model-a"]);
    assert.equal(JSON.parse(result.inlineConfig).model, config.model);
    assert.equal(isManagedOpenCodeConfigContent(readFileSync(result.file, "utf8"), "claude-code-router"), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("OpenCode global config keeps user settings and snapshots the original JSONC", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-opencode-global-"));
  try {
    const configFile = path.join(root, "opencode.jsonc");
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
    const result = writeOpenCodeGatewayConfig(root, testConfig(root), profile, "ccr-profile-key");
    const managed = JSON.parse(readFileSync(configFile, "utf8"));

    assert.equal(resolveOpenCodeConfigFile(root, profile), configFile);
    assert.equal(managed.autoupdate, false);
    assert.equal(managed.provider.existing.name, "Existing");
    assert.equal(readFileSync(`${configFile}.ccr-original`, "utf8"), original);
    assert.ok(result.backupFile && existsSync(result.backupFile));
    if (process.platform !== "win32") {
      chmodSync(configFile, 0o644);
      chmodSync(`${configFile}.ccr-original`, 0o644);
      chmodSync(result.backupFile, 0o644);
      const unchanged = writeOpenCodeGatewayConfig(root, testConfig(root), profile, "ccr-profile-key");
      assert.equal(unchanged.changed, false);
      assert.equal(statSync(configFile).mode & 0o777, 0o600);
      assert.equal(statSync(`${configFile}.ccr-original`).mode & 0o777, 0o600);
      assert.equal(statSync(result.backupFile).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("OpenCode App launch avoids the ignored Electron user-data switch", () => {
  assert.equal(openCodeAppLaunchArgs().some((arg) => arg.startsWith("--user-data-dir=")), false);
});

test("OpenCode App launch signature changes with effective profile settings", () => {
  const profile = testProfile({ appPath: "/Applications/OpenCode.app", env: { USER_VALUE: "one" } });
  const signature = openCodeAppLaunchSignature(profile, "/tmp/opencode.jsonc", '{"model":"one"}', { CCR_BOT_GATEWAY_ENABLED: "false" });

  assert.equal(
    openCodeAppLaunchSignature(profile, "/tmp/opencode.jsonc", '{"model":"one"}', { CCR_BOT_GATEWAY_ENABLED: "false" }),
    signature
  );
  assert.notEqual(
    openCodeAppLaunchSignature(profile, "/tmp/opencode.jsonc", '{"model":"two"}', { CCR_BOT_GATEWAY_ENABLED: "false" }),
    signature
  );
  assert.notEqual(
    openCodeAppLaunchSignature({ ...profile, env: { USER_VALUE: "two" } }, "/tmp/opencode.jsonc", '{"model":"one"}', { CCR_BOT_GATEWAY_ENABLED: "false" }),
    signature
  );
});

test("OpenCode App discovery includes the official Linux executable name", () => {
  assert.ok(openCodeDesktopCommandNames("linux").includes("ai.opencode.desktop"));
});

test("OpenCode App discovery accepts an explicit macOS bundle or executable", { skip: process.platform !== "darwin" }, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-opencode-app-"));
  try {
    const app = path.join(root, "OpenCode.app");
    const executable = path.join(app, "Contents", "MacOS", "OpenCode");
    mkdirSync(path.dirname(executable), { recursive: true });
    writeFileSync(executable, "#!/bin/sh\nexit 0\n");
    chmodSync(executable, 0o755);
    writeFileSync(path.join(app, "Contents", "Info.plist"), "<plist><dict><key>CFBundleExecutable</key><string>OpenCode</string></dict></plist>");

    assert.equal(findInstalledOpenCodeAppExecutable(app).executable, executable);
    assert.equal(findInstalledOpenCodeAppExecutable(executable).executable, executable);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
