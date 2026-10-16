import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

  // #1826 also reports independent processes writing the shared SQLite file.
  // Exercise that exact storage boundary, outside this process's repository.
  const child = spawnSync(process.execPath, ["-e", `
    const Database = require('better-sqlite3');
    const db = new Database(process.argv[1]);
    db.transaction(() => {
      const config = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key = 'default'").get().value_json);
      config.Providers = [{ name: 'External', type: 'openai_chat_completions', api_base_url: 'http://127.0.0.1:9/v1', models: ['new-model'] }];
      config.Router.fallback = { mode: 'model-chain', models: ['External/new-model'], retryCount: 1 };
      db.prepare("UPDATE app_config SET value_json = ? WHERE key = 'default'").run(JSON.stringify(config));
    })();
    db.close();
  `, APP_CONFIG_DB_FILE], { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  assert.equal(child.status, 0, child.stderr);
  await assert.rejects(saveAppConfig({ ...saved, autoStart: !saved.autoStart }), { statusCode: 409 });
  const external = await loadAppConfig();
  assert.deepEqual(external.Providers[0].models, ["new-model"]);
  assert.deepEqual(external.Router.fallback.models, ["External/new-model"]);
});
