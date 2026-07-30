import assert from "node:assert/strict";
import test from "node:test";
import { loadPersistedAppConfig, replacePersistedAppConfig } from "@ccr/core/config/config-repository.ts";
import { loadAppConfig, saveAppConfig, saveAppThemePreference, updateAppConfig } from "@ccr/core/config/config.ts";

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
  const savedConfig = await saveAppConfig(staleConfig);
  assert.equal(savedConfig.theme, "dark");
  assert.equal(savedConfig.HOST, staleConfig.HOST);

  const cloudApplied = await updateAppConfig((latest) => ({
    ...latest,
    theme: "light"
  }));
  assert.equal(cloudApplied.theme, "light");

  const staleAfterCloudPull = await saveAppConfig({
    ...cloudApplied,
    HOST: "theme-preference-after-cloud-pull.test",
    theme: "system"
  });
  assert.equal(staleAfterCloudPull.theme, "light");
});

test("theme preference persistence rejects unsupported values", async () => {
  await assert.rejects(
    saveAppThemePreference("sepia"),
    /Invalid theme preference/
  );
});

test("stale full-config saves preserve cloud authentication state", async () => {
  const before = await loadAppConfig();
  const stale = structuredClone(before);
  try {
    await updateAppConfig((current) => ({
      ...current,
      cloudSync: {
        ...current.cloudSync,
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token"
      }
    }));

    const saved = await saveAppConfig({
      ...stale,
      HOST: "cloud-sync-stale-save.test"
    });

    assert.equal(saved.cloudSync.accessToken, "new-access-token");
    assert.equal(saved.cloudSync.refreshToken, "new-refresh-token");
    assert.equal(saved.HOST, "cloud-sync-stale-save.test");
  } finally {
    await updateAppConfig(() => before);
  }
});
