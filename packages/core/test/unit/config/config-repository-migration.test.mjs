import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("unreadable legacy SQLite sources are preserved for a future migration retry", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `config-repository-migration-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const {
    APP_CONFIG_DB_FILE,
    LEGACY_API_KEYS_DB_FILE
  } = await import("@ccr/core/config/constants.ts");
  mkdirSync(path.dirname(LEGACY_API_KEYS_DB_FILE), { recursive: true });
  writeFileSync(LEGACY_API_KEYS_DB_FILE, "not a SQLite database");

  const {
    loadPersistedApiKeys
  } = await import("@ccr/core/config/config-repository.ts");
  assert.deepEqual(await loadPersistedApiKeys(), []);
  assert.equal(existsSync(LEGACY_API_KEYS_DB_FILE), true);

  const {
    createBetterSqliteDatabase
  } = await import("@ccr/core/storage/sqlite-native.ts");
  const database = createBetterSqliteDatabase(APP_CONFIG_DB_FILE, {
    fileMustExist: true,
    readonly: true
  });
  try {
    const migration = database.prepare(`
      SELECT id
      FROM config_schema_migrations
      WHERE id = 'unified-config-store-v1'
    `).get();
    const backup = database.prepare(`
      SELECT source_path
      FROM legacy_storage_backups
      WHERE source_path = ?
    `).get(path.resolve(LEGACY_API_KEYS_DB_FILE));
    assert.equal(migration, undefined);
    assert.equal(backup, undefined);
  } finally {
    database.close();
  }
});
