import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const harnessEnv = "CCR_WINDOWS_INHERIT_WRAPPER_HARNESS";
const rootEnv = "CCR_WINDOWS_INHERIT_WRAPPER_ROOT";

if (process.env[harnessEnv] === "1") {
  runWindowsHarness().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
} else {
  test("generated Windows inherited wrapper preserves paths with shell metacharacters", { skip: process.platform !== "win32" }, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ccr-windows-inherited-wrapper-"));
    const configRoot = path.join(root, "config home & value");
    const result = spawnSync(process.execPath, [process.argv[1]], {
      encoding: "utf8",
      env: {
        ...process.env,
        CCR_INTERNAL_APP_DATA_DIR: configRoot,
        CCR_INTERNAL_HOME_DIR: configRoot,
        CCR_INTERNAL_USER_DATA_DIR: path.join(configRoot, "data home & value"),
        HOME: configRoot,
        USERPROFILE: configRoot,
        [harnessEnv]: "1",
        [rootEnv]: root
      }
    });

    try {
      assert.equal(result.status, 0, result.stderr);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
}

async function runWindowsHarness() {
  const root = process.env[rootEnv];
  assert.ok(root);
  const settingsDir = path.join(root, "settings home & value");
  const fakeClientDir = path.join(root, "client home & value");
  const settingsFile = path.join(settingsDir, "settings.json");
  const outputFile = path.join(root, "observed.json");
  mkdirSync(settingsDir, { recursive: true });
  mkdirSync(fakeClientDir, { recursive: true });
  writeFileSync(settingsFile, '{"statusLine":{"type":"command","command":"status"}}');

  const fakeClientScript = path.join(fakeClientDir, "fake-client.js");
  const fakeClient = path.join(fakeClientDir, "fake-client.cmd");
  writeFileSync(fakeClientScript, [
    "const fs = require('node:fs');",
    "fs.writeFileSync(process.env.CCR_WINDOWS_INHERIT_OUTPUT, JSON.stringify({",
    "  authToken: process.env.ANTHROPIC_AUTH_TOKEN || '',",
    "  configDir: process.env.CLAUDE_CONFIG_DIR || ''",
    "}));",
    ""
  ].join("\n"));
  writeFileSync(fakeClient, [
    "@echo off",
    `"${process.execPath}" "%~dp0fake-client.js" %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n"));

  const [{ createDefaultAppConfig }, { CONFIGDIR }, { applyProfileConfig }] = await Promise.all([
    import("@ccr/core/config/default-config.ts"),
    import("@ccr/core/config/constants.ts"),
    import("@ccr/core/profiles/service.ts")
  ]);
  const profileId = "windows-inherited-wrapper";
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [{
    api_base_url: "https://example.test/v1",
    api_key: "provider-key",
    models: ["model"],
    name: "Provider"
  }];
  config.preferredProvider = "Provider";
  config.APIKEY = "ccr-profile-test";
  config.APIKEYS = [{
    createdAt: "2026-01-01T00:00:00.000Z",
    id: `profile:${profileId}`,
    key: "ccr-profile-test",
    name: "Profile: Windows Inherited Wrapper Test"
  }];
  config.profile.profiles = [{
    agent: "claude-code",
    claudeConfigMode: "inherit",
    enabled: true,
    env: {
      claude_config_dir: "C:\\untrusted-profile-config",
      CCR_CLAUDE_CODE_BIN: fakeClient
    },
    id: profileId,
    model: "Provider/model",
    name: "Windows Inherited Wrapper Test",
    scope: "ccr",
    settingsFile,
    smallFastModel: "",
    surface: "cli"
  }];

  const applied = await applyProfileConfig(config);
  const status = applied.clients.find((entry) => entry.client === "claude-code" && entry.enabled);
  assert.ok(status);
  assert.equal(status.ok, true, status.message);
  const wrapperFile = status.path;
  assert.ok(wrapperFile);
  assert.equal(wrapperFile.startsWith(CONFIGDIR), true);

  const command = `call "${wrapperFile}" -p hi`;
  const launched = spawnSync(process.env.ComSpec || process.env.COMSPEC || "cmd.exe", ["/d", "/s", "/c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_REMOTE_SYNC_ENABLED: "0",
      CCR_WINDOWS_INHERIT_OUTPUT: outputFile
    },
    windowsHide: true
  });
  assert.equal(launched.status, 0, launched.stderr);
  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.equal(observed.authToken, "ccr-profile-test");
  assert.equal(observed.configDir, settingsDir);

  config.profile.profiles[0].settingsFile = "~/.claude/settings.json";
  const defaultApplied = await applyProfileConfig(config);
  const defaultStatus = defaultApplied.clients.find((entry) => entry.client === "claude-code" && entry.enabled);
  assert.ok(defaultStatus);
  assert.equal(defaultStatus.ok, true, defaultStatus.message);
  const defaultWrapper = readFileSync(wrapperFile, "utf8");
  assert.match(defaultWrapper, /set "CLAUDE_CONFIG_DIR="/);
  assert.doesNotMatch(defaultWrapper, /set "CLAUDE_CONFIG_DIR=[^\r\n]+"/);
  assert.equal(defaultWrapper.includes("C:\\untrusted-profile-config"), false);

  const defaultLaunched = spawnSync(process.env.ComSpec || process.env.COMSPEC || "cmd.exe", ["/d", "/s", "/c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: "C:\\untrusted-config",
      CCR_REMOTE_SYNC_ENABLED: "0",
      CCR_WINDOWS_INHERIT_OUTPUT: outputFile
    },
    windowsHide: true
  });
  assert.equal(defaultLaunched.status, 0, defaultLaunched.stderr);
  const defaultObserved = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.equal(defaultObserved.authToken, "ccr-profile-test");
  assert.equal(defaultObserved.configDir, "");
}
