import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

// This test writes real app config, so it must never resolve the developer's
// ~/.claude-code-router. Point every runtime path at a throwaway home before
// any config module is first imported (the constants module snapshots them).
const testHome = mkdtempSync(path.join(os.tmpdir(), "ccr-theme-preference-"));
process.env.CCR_INTERNAL_HOME_DIR = testHome;
process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testHome, "app-data");
process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testHome, "user-data");

after(() => {
  rmSync(testHome, { force: true, recursive: true });
});

test("theme preference persistence changes only the theme field", async () => {
  const { loadPersistedAppConfig, replacePersistedAppConfig } = await import("@ccr/core/config/config-repository.ts");
  const { loadAppConfig, saveAppConfig, saveAppThemePreference } = await import("@ccr/core/config/config.ts");

  const current = await loadAppConfig();
  const markerHost = "theme-preference.test";
  await replacePersistedAppConfig({
    ...current,
    HOST: markerHost,
    theme: "system"
  });

  const savedTheme = await saveAppThemePreference("dark");
  const persisted = await loadPersistedAppConfig();

  assert.equal(savedTheme, "dark");
  assert.equal(persisted.theme, "dark");
  assert.equal(persisted.HOST, markerHost);
  assert.equal((await loadAppConfig()).theme, "dark");

  const staleConfig = {
    ...current,
    HOST: "theme-preference-stale-save.test",
    theme: "system"
  };
  await assert.rejects(saveAppConfig(staleConfig), /Configuration changed/);
  const savedConfig = await saveAppConfig({ ...await loadAppConfig(), HOST: staleConfig.HOST, theme: "system" });
  assert.equal(savedConfig.theme, "dark");
  assert.equal(savedConfig.HOST, staleConfig.HOST);
});

test("theme preference persistence rejects unsupported values", async () => {
  const { saveAppThemePreference } = await import("@ccr/core/config/config.ts");
  await assert.rejects(
    saveAppThemePreference("sepia"),
    /Invalid theme preference/
  );
});
