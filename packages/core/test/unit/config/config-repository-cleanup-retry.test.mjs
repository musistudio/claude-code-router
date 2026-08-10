import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("legacy SQLite cleanup retries even when an old completion marker exists", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `config-repository-cleanup-retry-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const {
    APP_CONFIG_DB_FILE,
    LEGACY_API_KEYS_DB_FILE
  } = await import("@ccr/core/config/constants.ts");
  const {
    ConfigRepository
  } = await import("@ccr/core/config/config-repository.ts");
  const {
    createBetterSqliteDatabase
  } = await import("@ccr/core/storage/sqlite-native.ts");

  createTargetDatabaseWithOldCompletionMarker(createBetterSqliteDatabase, APP_CONFIG_DB_FILE);
  createApiKeyDatabase(createBetterSqliteDatabase, LEGACY_API_KEYS_DB_FILE);
  const orphanWalFile = `${LEGACY_API_KEYS_DB_FILE}-wal`;
  writeFileSync(orphanWalFile, "legacy sidecar content\n", "utf8");

  const failedRemovals = [];
  const firstRepository = new ConfigRepository(APP_CONFIG_DB_FILE, {
    removeFile(file) {
      failedRemovals.push(file);
      if (file === path.resolve(LEGACY_API_KEYS_DB_FILE)) {
        rmSync(file, { force: true });
        return;
      }
      throw new Error("simulated cleanup failure");
    }
  });
  const firstRead = await firstRepository.listApiKeys();

  assert.deepEqual(firstRead.map((apiKey) => apiKey.id), ["legacy-key"]);
  assert.equal(existsSync(LEGACY_API_KEYS_DB_FILE), false);
  assert.equal(failedRemovals.includes(path.resolve(orphanWalFile)), true);
  assert.equal(existsSync(orphanWalFile), true);
  assert.equal(readMigration(createBetterSqliteDatabase, APP_CONFIG_DB_FILE), undefined);
  assert.equal(readBackupCount(
    createBetterSqliteDatabase,
    APP_CONFIG_DB_FILE,
    LEGACY_API_KEYS_DB_FILE
  ), 1);

  const retryRepository = new ConfigRepository(APP_CONFIG_DB_FILE);
  const retryRead = await retryRepository.listApiKeys();

  assert.deepEqual(retryRead.map((apiKey) => apiKey.id), ["legacy-key"]);
  assert.equal(existsSync(LEGACY_API_KEYS_DB_FILE), false);
  assert.equal(existsSync(orphanWalFile), false);
  assert.equal(readMigration(createBetterSqliteDatabase, APP_CONFIG_DB_FILE), "unified-config-store-v1");
  assert.equal(readBackupCount(
    createBetterSqliteDatabase,
    APP_CONFIG_DB_FILE,
    LEGACY_API_KEYS_DB_FILE
  ), 1);
  assert.equal(readCleanupCount(createBetterSqliteDatabase, APP_CONFIG_DB_FILE), 0);
});

function createTargetDatabaseWithOldCompletionMarker(createDatabase, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const database = createDatabase(file);
  try {
    database.exec(`
      CREATE TABLE config_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT ''
      )
    `);
    database.prepare(`
      INSERT INTO config_schema_migrations (id, applied_at, details_json)
      VALUES ('unified-config-store-v1', ?, '')
    `).run(new Date(0).toISOString());
  } finally {
    database.close();
  }
}

function createApiKeyDatabase(createDatabase, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const database = createDatabase(file);
  try {
    database.exec(`
      CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        encrypted_key TEXT NOT NULL,
        encryption TEXT NOT NULL DEFAULT 'plain',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL DEFAULT '',
        limits_json TEXT NOT NULL DEFAULT ''
      )
    `);
    database.prepare(`
      INSERT INTO api_keys (
        id, name, encrypted_key, encryption, created_at, expires_at, limits_json
      ) VALUES ('legacy-key', '', 'sk-legacy', 'plain', ?, '', '')
    `).run(new Date(0).toISOString());
  } finally {
    database.close();
  }
}

function readMigration(createDatabase, file) {
  return withReadonlyDatabase(createDatabase, file, (database) => database.prepare(`
    SELECT id
    FROM config_schema_migrations
    WHERE id = 'unified-config-store-v1'
  `).get()?.id);
}

function readBackupCount(createDatabase, file, sourcePath) {
  return withReadonlyDatabase(createDatabase, file, (database) => database.prepare(`
    SELECT COUNT(*) AS count
    FROM legacy_storage_backups
    WHERE source_kind = 'legacy-sqlite-config' AND source_path = ?
  `).get(path.resolve(sourcePath)).count);
}

function readCleanupCount(createDatabase, file) {
  return withReadonlyDatabase(createDatabase, file, (database) => database.prepare(`
    SELECT COUNT(*) AS count
    FROM legacy_storage_cleanup
    WHERE source_kind = 'legacy-sqlite-config'
  `).get().count);
}

function withReadonlyDatabase(createDatabase, file, operation) {
  const database = createDatabase(file, {
    fileMustExist: true,
    readonly: true
  });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}
