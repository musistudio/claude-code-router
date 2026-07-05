import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import { CONFIGDIR } from "../../packages/core/src/config/constants.ts";
import { applyProfileConfig, cleanupGeneratedBinBackups, restoreInactiveGlobalProfileConfigs } from "../../packages/core/src/profiles/service.ts";

test("profile service cleans stale generated bin backups only", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-generated-bin-cleanup-"));
  try {
    const binDir = path.join(configDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const deletedFiles = [
      "ccr-claude-code-api-key-default.ccr-backup-2026-01-01T00-00-00-000Z",
      "ccr-claude-code-wrapper-default.ccr-original",
      "ccr-codex-cli-stdio-default.ccr-original-missing",
      "ccr-codex-cli-middleware.js.ccr-backup-2026-01-01T00-00-00-000Z"
    ];
    const keptFiles = [
      "custom-tool.ccr-backup-2026-01-01T00-00-00-000Z",
      "notes.txt"
    ];
    for (const file of [...deletedFiles, ...keptFiles]) {
      writeFileSync(path.join(binDir, file), "old");
    }

    assert.equal(cleanupGeneratedBinBackups(configDir), deletedFiles.length);
    for (const file of deletedFiles) {
      assert.equal(existsSync(path.join(binDir, file)), false);
    }
    for (const file of keptFiles) {
      assert.equal(existsSync(path.join(binDir, file)), true);
    }
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("profile service overwrites generated bin files without creating backups", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "generated-bin-test";
  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { recursive: true });
  const generatedFiles = [
    path.join(binDir, `ccr-claude-code-api-key-${profileId}${commandExtension}`),
    path.join(binDir, `ccr-claude-code-wrapper-${profileId}${commandExtension}`),
    path.join(binDir, "ccr-codex-cli-middleware.js")
  ];
  for (const file of generatedFiles) {
    writeFileSync(file, "old generated content\n");
    writeFileSync(`${file}.ccr-backup-2026-01-01T00-00-00-000Z`, "old backup\n");
    writeFileSync(`${file}.ccr-original`, "old original\n");
  }

  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "ccr-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-profile-test",
      name: "Profile: Generated Bin Test"
    }
  ];
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: profileId,
      model: "Provider/model",
      name: "Generated Bin Test",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);
  for (const file of generatedFiles) {
    assert.notEqual(readFileSync(file, "utf8"), "old generated content\n");
  }
  const backupEntries = readdirSync(binDir).filter((entry) =>
    (
      entry.startsWith(`ccr-claude-code-api-key-${profileId}`) ||
      entry.startsWith(`ccr-claude-code-wrapper-${profileId}`) ||
      entry.startsWith("ccr-codex-cli-middleware.js")
    ) && entry.includes(".ccr-")
  );
  assert.deepEqual(backupEntries, []);
});

test("profile service restores managed global Claude settings when only CCR-scoped Claude profiles are active", () => {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-profile-home-"));
  process.env.HOME = home;
  try {
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    const originalSettings = {
      env: {
        USER_VALUE: "kept"
      },
      theme: "dark"
    };
    writeFileSync(`${settingsFile}.ccr-backup-2026-01-01T00-00-00-000Z`, `${JSON.stringify(originalSettings, null, 2)}\n`);
    writeFileSync(settingsFile, `${JSON.stringify({
      apiKeyHelper: "/tmp/ccr-claude-code-api-key-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_MODEL: "Fusion/GLM-5.2V",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    }, null, 2)}\n`);

    const statuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: true,
        env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" },
        id: "claude-code-2",
        model: "Fusion/kimisearch",
        name: "Claude Code",
        scope: "ccr",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);

    const restored = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].client, "claude-code");
    assert.equal(statuses[0].ok, true);
    assert.equal(restored.env.USER_VALUE, "kept");
    assert.equal(restored.env.ANTHROPIC_MODEL, undefined);
    assert.equal(restored.env.CCR_CLAUDE_CODE_MODEL, undefined);
    assert.equal(restored.env.CODEXL_CLAUDE_CODE_MODEL, undefined);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { force: true, recursive: true });
  }
});

test("profile service keeps managed global Claude settings when a global Claude profile is active", () => {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-profile-home-"));
  process.env.HOME = home;
  try {
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, `${JSON.stringify({
      apiKeyHelper: "/tmp/ccr-claude-code-api-key-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_MODEL: "Fusion/GLM-5.2V",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    }, null, 2)}\n`);

    const statuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: true,
        env: {},
        id: "claude-code",
        model: "Fusion/GLM-5.2V",
        name: "Claude Code",
        scope: "global",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);

    const current = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(statuses.length, 0);
    assert.equal(current.env.ANTHROPIC_MODEL, "Fusion/GLM-5.2V");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { force: true, recursive: true });
  }
});
