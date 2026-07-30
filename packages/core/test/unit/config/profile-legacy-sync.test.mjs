import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

test("saving profiles synchronizes legacy profile enabled flags", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `profile-legacy-sync-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const { createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts");
  const { loadPersistedAppConfig, replacePersistedAppConfig } = await import("@ccr/core/config/config-repository.ts");
  const { loadAppConfig, saveAppConfig } = await import("@ccr/core/config/config.ts");

  const config = createDefaultAppConfig();
  config.profile.profiles = config.profile.profiles.filter((profile) => profile.agent !== "claude-code");

  const savedWithoutClaude = await saveAppConfig(config);
  assert.equal(savedWithoutClaude.profile.enabled, true);
  assert.equal(savedWithoutClaude.profile.claudeCode.enabled, false);
  assert.equal(savedWithoutClaude.profile.codex.enabled, true);

  const rawWithoutClaude = await loadPersistedAppConfig();
  assert.equal(rawWithoutClaude.profile.claudeCode.enabled, false);
  assert.equal(rawWithoutClaude.profile.codex.enabled, true);

  const topLevelDisabledConfig = createDefaultAppConfig();
  topLevelDisabledConfig.profile.enabled = false;
  const savedTopLevelDisabled = await saveAppConfig(topLevelDisabledConfig);
  assert.equal(savedTopLevelDisabled.profile.enabled, false);
  assert.equal(savedTopLevelDisabled.profile.claudeCode.enabled, false);
  assert.equal(savedTopLevelDisabled.profile.codex.enabled, false);
  assert.equal(savedTopLevelDisabled.profile.profiles.some((profile) => profile.enabled), true);

  const rawTopLevelDisabled = await loadPersistedAppConfig();
  assert.equal(rawTopLevelDisabled.profile.enabled, false);
  assert.equal(rawTopLevelDisabled.profile.claudeCode.enabled, false);
  assert.equal(rawTopLevelDisabled.profile.codex.enabled, false);

  savedWithoutClaude.profile.profiles = [];
  const savedWithoutProfiles = await saveAppConfig(savedWithoutClaude);
  assert.equal(savedWithoutProfiles.profile.enabled, false);
  assert.equal(savedWithoutProfiles.profile.claudeCode.enabled, false);
  assert.equal(savedWithoutProfiles.profile.codex.enabled, false);

  const rawWithoutProfiles = await loadPersistedAppConfig();
  assert.equal(rawWithoutProfiles.profile.enabled, false);
  assert.equal(rawWithoutProfiles.profile.claudeCode.enabled, false);
  assert.equal(rawWithoutProfiles.profile.codex.enabled, false);

  const staleLegacyConfig = createDefaultAppConfig();
  staleLegacyConfig.profile.enabled = true;
  staleLegacyConfig.profile.claudeCode.enabled = true;
  staleLegacyConfig.profile.codex.enabled = true;
  staleLegacyConfig.profile.profiles = [];
  await replacePersistedAppConfig(staleLegacyConfig);

  const loadedStaleLegacyConfig = await loadAppConfig();
  assert.equal(loadedStaleLegacyConfig.profile.enabled, false);
  assert.equal(loadedStaleLegacyConfig.profile.claudeCode.enabled, false);
  assert.equal(loadedStaleLegacyConfig.profile.codex.enabled, false);
  assert.deepEqual(loadedStaleLegacyConfig.profile.profiles, []);

  const legacyBooleanConfig = createDefaultAppConfig();
  legacyBooleanConfig.profile.claudeCode.managedCompact = true;
  legacyBooleanConfig.profile.codex.managedCompact = true;
  legacyBooleanConfig.profile.codex.showAllSessions = true;
  legacyBooleanConfig.profile.profiles = legacyBooleanConfig.profile.profiles.map((profile) => {
    const profileWithoutOptionalBooleans = { ...profile };
    delete profileWithoutOptionalBooleans.managedCompact;
    delete profileWithoutOptionalBooleans.showAllSessions;
    return profileWithoutOptionalBooleans;
  });
  await replacePersistedAppConfig(legacyBooleanConfig);

  const loadedLegacyBooleanConfig = await loadAppConfig();
  assert.equal(loadedLegacyBooleanConfig.profile.claudeCode.managedCompact, true);
  assert.equal(loadedLegacyBooleanConfig.profile.codex.managedCompact, true);
  assert.equal(loadedLegacyBooleanConfig.profile.codex.showAllSessions, true);
});
