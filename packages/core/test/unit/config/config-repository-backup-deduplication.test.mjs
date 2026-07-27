import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("repeated legacy JSON cleanup failures keep one content-addressed backup", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `config-repository-backup-deduplication-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const {
    APP_CONFIG_DB_FILE,
    LEGACY_ACTIVE_CONFIG_FILE
  } = await import("@ccr/core/config/constants.ts");
  const {
    ConfigRepository
  } = await import("@ccr/core/config/config-repository.ts");
  const {
    createBetterSqliteDatabase
  } = await import("@ccr/core/storage/sqlite-native.ts");

  mkdirSync(path.dirname(LEGACY_ACTIVE_CONFIG_FILE), { recursive: true });
  const legacyContent = `${JSON.stringify({ PORT: 3456, Providers: [] }, null, 2)}\n`;
  writeFileSync(LEGACY_ACTIVE_CONFIG_FILE, legacyContent, "utf8");
  seedHistoricalDuplicateBackups(
    createBetterSqliteDatabase,
    APP_CONFIG_DB_FILE,
    LEGACY_ACTIVE_CONFIG_FILE,
    legacyContent
  );

  let removalAttempts = 0;
  const failingRepository = new ConfigRepository(APP_CONFIG_DB_FILE, {
    removeFile() {
      removalAttempts += 1;
      throw new Error("simulated cleanup failure");
    }
  });
  await failingRepository.archiveLegacyJsonConfigFiles([LEGACY_ACTIVE_CONFIG_FILE]);
  await failingRepository.archiveLegacyJsonConfigFiles([LEGACY_ACTIVE_CONFIG_FILE]);

  assert.equal(removalAttempts, 3);
  assert.equal(existsSync(LEGACY_ACTIVE_CONFIG_FILE), true);
  assert.equal(readBackupCount(
    createBetterSqliteDatabase,
    APP_CONFIG_DB_FILE,
    LEGACY_ACTIVE_CONFIG_FILE
  ), 1);
  assert.equal(readCleanupCount(createBetterSqliteDatabase, APP_CONFIG_DB_FILE), 1);

  const retryRepository = new ConfigRepository(APP_CONFIG_DB_FILE);
  await retryRepository.readAppConfig();

  assert.equal(existsSync(LEGACY_ACTIVE_CONFIG_FILE), false);
  assert.equal(readBackupCount(
    createBetterSqliteDatabase,
    APP_CONFIG_DB_FILE,
    LEGACY_ACTIVE_CONFIG_FILE
  ), 1);
  assert.equal(readCleanupCount(createBetterSqliteDatabase, APP_CONFIG_DB_FILE), 0);
});

function seedHistoricalDuplicateBackups(createDatabase, dbFile, sourceFile, content) {
  mkdirSync(path.dirname(dbFile), { recursive: true });
  const database = createDatabase(dbFile);
  const sha256 = createHash("sha256").update(content).digest("hex");
  try {
    database.exec(`
      CREATE TABLE config_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE legacy_storage_backups (
        id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        content BLOB NOT NULL,
        archived_at TEXT NOT NULL
      );
    `);
    const insert = database.prepare(`
      INSERT INTO legacy_storage_backups (
        id, source_path, source_kind, sha256, content, archived_at
      ) VALUES (?, ?, 'legacy-json-config', ?, ?, ?)
    `);
    insert.run("historical-backup-1", path.resolve(sourceFile), sha256, Buffer.from(content), new Date(0).toISOString());
    insert.run("historical-backup-2", path.resolve(sourceFile), sha256, Buffer.from(content), new Date(1).toISOString());
  } finally {
    database.close();
  }
}

function readBackupCount(createDatabase, file, sourcePath) {
  return withReadonlyDatabase(createDatabase, file, (database) => database.prepare(`
    SELECT COUNT(*) AS count
    FROM legacy_storage_backups
    WHERE source_kind = 'legacy-json-config' AND source_path = ?
  `).get(path.resolve(sourcePath)).count);
}

function readCleanupCount(createDatabase, file) {
  return withReadonlyDatabase(createDatabase, file, (database) => database.prepare(`
    SELECT COUNT(*) AS count
    FROM legacy_storage_cleanup
    WHERE source_kind = 'legacy-json-config'
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
