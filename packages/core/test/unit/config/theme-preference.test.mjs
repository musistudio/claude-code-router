import assert from "node:assert/strict";
import test from "node:test";
import { loadPersistedAppConfig, replacePersistedAppConfig } from "@ccr/core/config/config-repository.ts";
import { loadAppConfig, saveAppConfig, saveAppThemePreference } from "@ccr/core/config/config.ts";

test("theme preference persistence changes only the theme field", async () => {
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
  await assert.rejects(
    saveAppThemePreference("sepia"),
    /Invalid theme preference/
  );
});
