import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

test("stale settings and unversioned RPC snapshots cannot overwrite another writer", async () => {
  const root = path.join(process.env.CCR_INTERNAL_HOME_DIR, `config-concurrency-${process.pid}`);
  process.env.CCR_INTERNAL_HOME_DIR = path.join(root, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(root, "data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(root, "user");
  const { loadAppConfig, saveAppConfig, saveAppThemePreference } = await import("@ccr/core/config/config.ts");
  const { ConfigRepository, loadPersistedAppConfig } = await import("@ccr/core/config/config-repository.ts");
  const { APP_CONFIG_DB_FILE } = await import("@ccr/core/config/constants.ts");
  const stale = await loadAppConfig();
  const peer = new ConfigRepository(APP_CONFIG_DB_FILE);
  await peer.updateAppConfig((current) => ({ ...current, HOST: "peer.example" }));
  await assert.rejects(saveAppConfig({ ...stale, autoStart: !stale.autoStart }), { statusCode: 409 });
  const latest = await loadAppConfig();
  const { configRevision, ...unversioned } = latest;
  await assert.rejects(saveAppConfig(unversioned), { statusCode: 409 });
  assert.equal((await loadAppConfig()).HOST, "peer.example");
  await saveAppThemePreference("dark");
  const saved = await saveAppConfig({ ...latest, autoStart: !latest.autoStart });
  assert.equal(saved.theme, "dark");
  assert.equal(saved.HOST, "peer.example");
  assert.notEqual(saved.configRevision, configRevision);
  assert.equal((await loadPersistedAppConfig()).configRevision, undefined);
});
