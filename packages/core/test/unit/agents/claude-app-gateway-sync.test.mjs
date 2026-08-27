import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = path.join(
  process.env.CCR_INTERNAL_HOME_DIR || os.tmpdir(),
  `claude-app-gateway-sync-${process.pid}`
);
process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

async function loadModules() {
  const {
    NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE,
    hasClaudeAppEntryProfile,
    syncClaudeAppGatewayConfig
  } = await import("@ccr/core/agents/claude-app/gateway-service.ts");
  const { CONFIGDIR } = await import("@ccr/core/config/constants.ts");
  return {
    BACKUP_FILE: path.join(CONFIGDIR, "claude-app-gateway-backup.json"),
    NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE,
    hasClaudeAppEntryProfile,
    syncClaudeAppGatewayConfig
  };
}

test("sync skips and restores the backup when no enabled claude-code profile opens the app", async () => {
  const { BACKUP_FILE, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE, hasClaudeAppEntryProfile, syncClaudeAppGatewayConfig } = await loadModules();
  seedGatewayBackup(BACKUP_FILE);
  const synced = await syncClaudeAppGatewayConfig(createConfig({
    profile: {
      profiles: [claudeCodeProfile({ surface: "cli" })]
    }
  }));

  assert.equal(hasClaudeAppEntryProfile(synced.config), false);
  assert.equal(synced.configChanged, false);
  assert.equal(synced.result.message, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE);
  assert.equal(existsSync(BACKUP_FILE), false);
  const libraryConfig = JSON.parse(readFileSync(claudeAppPaths().configLibraryFile, "utf8"));
  assert.equal(libraryConfig.inferenceProvider, "original");
  assert.equal(readFileSync(claudeAppPaths().rootConfigFile, "utf8"), '{"deploymentMode":"native"}');
  cleanup(BACKUP_FILE);
});

test("sync skips and restores the backup when the only claude-code profile is disabled", async () => {
  const { BACKUP_FILE, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE, hasClaudeAppEntryProfile, syncClaudeAppGatewayConfig } = await loadModules();
  seedGatewayBackup(BACKUP_FILE);
  const synced = await syncClaudeAppGatewayConfig(createConfig({
    profile: {
      profiles: [claudeCodeProfile({ enabled: false })]
    }
  }));

  assert.equal(hasClaudeAppEntryProfile(synced.config), false);
  assert.equal(synced.result.message, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE);
  assert.equal(existsSync(BACKUP_FILE), false);
  assert.equal(existsSync(claudeAppPaths().configLibraryFile), true);
  cleanup(BACKUP_FILE);
});

test("sync skips when only a claude-design profile is enabled", async () => {
  const { BACKUP_FILE, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE, hasClaudeAppEntryProfile, syncClaudeAppGatewayConfig } = await loadModules();
  seedGatewayBackup(BACKUP_FILE);
  const synced = await syncClaudeAppGatewayConfig(createConfig({
    profile: {
      profiles: [{
        agent: "claude-design",
        enabled: true,
        id: "design",
        model: "test-model",
        name: "design"
      }]
    }
  }));

  assert.equal(hasClaudeAppEntryProfile(synced.config), false);
  assert.equal(synced.result.message, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE);
  assert.equal(existsSync(BACKUP_FILE), false);
  cleanup(BACKUP_FILE);
});

test("sync with a cli-only profile restores missing files as absent", async () => {
  const { BACKUP_FILE, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE, syncClaudeAppGatewayConfig } = await loadModules();
  seedGatewayBackupWithoutExistingFiles(BACKUP_FILE);
  const synced = await syncClaudeAppGatewayConfig(createConfig({
    profile: {
      profiles: [claudeCodeProfile({ surface: "cli" })]
    }
  }));

  assert.equal(synced.result.message, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE);
  assert.equal(existsSync(claudeAppPaths().rootConfigFile), false);
  assert.equal(existsSync(claudeAppPaths().metaFile), false);
  assert.equal(existsSync(claudeAppPaths().configLibraryFile), false);
  cleanup(BACKUP_FILE);
});

test("sync applies the gateway config for auto, app, and unset surfaces", async () => {
  const { BACKUP_FILE, hasClaudeAppEntryProfile, syncClaudeAppGatewayConfig } = await loadModules();
  for (const surface of ["auto", "app", undefined]) {
    const synced = await syncClaudeAppGatewayConfig(createConfig({
      profile: {
        profiles: [claudeCodeProfile({ surface })]
      }
    }));

    assert.equal(hasClaudeAppEntryProfile(synced.config), true);
    assert.equal(synced.configChanged, false);
    const libraryConfig = JSON.parse(readFileSync(claudeAppPaths().configLibraryFile, "utf8"));
    assert.equal(libraryConfig.inferenceProvider, "gateway");
    assert.equal(libraryConfig.inferenceGatewayApiKey, "existing-test-key");
    cleanup(BACKUP_FILE);
  }
});

test("sync applies the gateway config regardless of profile scope", async () => {
  const { BACKUP_FILE, hasClaudeAppEntryProfile, syncClaudeAppGatewayConfig } = await loadModules();
  for (const scope of ["ccr", "global", "custom"]) {
    const synced = await syncClaudeAppGatewayConfig(createConfig({
      profile: {
        profiles: [claudeCodeProfile({ scope, surface: "auto" })]
      }
    }));

    assert.equal(hasClaudeAppEntryProfile(synced.config), true);
    const libraryConfig = JSON.parse(readFileSync(claudeAppPaths().configLibraryFile, "utf8"));
    assert.equal(libraryConfig.inferenceProvider, "gateway");
    cleanup(BACKUP_FILE);
  }
});

function claudeCodeProfile(overrides = {}) {
  return {
    agent: "claude-code",
    enabled: true,
    id: "p1",
    model: "test-model",
    name: "claude-code",
    ...overrides
  };
}

function claudeAppPaths() {
  const dataDir = path.join(testRoot, "app-data", "Claude-3p");
  return {
    configLibraryFile: path.join(dataDir, "configLibrary", "8f69f2f1-3275-4ad8-9317-4aa7e972f311.json"),
    dataDir,
    metaFile: path.join(dataDir, "configLibrary", "_meta.json"),
    rootConfigFile: path.join(dataDir, "claude_desktop_config.json")
  };
}

function seedGatewayBackup(backupFile) {
  writeJsonFile(backupFile, {
    configLibraryFile: { content: '{"inferenceProvider":"original"}', exists: true },
    createdAt: "2026-01-01T00:00:00.000Z",
    metaFile: { content: "{}", exists: true },
    rootConfigFile: { content: '{"deploymentMode":"native"}', exists: true },
    version: 1
  });
}

function seedGatewayBackupWithoutExistingFiles(backupFile) {
  writeJsonFile(backupFile, {
    configLibraryFile: { exists: false },
    createdAt: "2026-01-01T00:00:00.000Z",
    metaFile: { exists: false },
    rootConfigFile: { exists: false },
    version: 1
  });
}

function writeJsonFile(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

function cleanup(backupFile) {
  rmSync(claudeAppPaths().dataDir, { force: true, recursive: true });
  if (backupFile) {
    rmSync(backupFile, { force: true });
  }
}

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
      enabled: true,
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
