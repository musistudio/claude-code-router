import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("legacy API keys are merged without replacing existing target keys", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `config-repository-existing-data-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const {
    APP_CONFIG_DB_FILE,
    LEGACY_API_KEYS_DB_FILE
  } = await import("@ccr/core/config/constants.ts");
  const {
    createBetterSqliteDatabase
  } = await import("@ccr/core/storage/sqlite-native.ts");

  createApiKeyDatabase(createBetterSqliteDatabase, APP_CONFIG_DB_FILE, {
    id: "existing-key",
    key: "sk-existing"
  });
  createApiKeyDatabase(createBetterSqliteDatabase, LEGACY_API_KEYS_DB_FILE, {
    id: "legacy-key",
    key: "sk-legacy"
  });

  const {
    loadPersistedApiKeys
  } = await import("@ccr/core/config/config-repository.ts");
  const apiKeys = await loadPersistedApiKeys();
  assert.deepEqual(apiKeys.map((apiKey) => apiKey.id), [
    "existing-key",
    "legacy-key"
  ]);
  assert.equal(existsSync(LEGACY_API_KEYS_DB_FILE), false);

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
    assert.equal(migration?.id, "unified-config-store-v1");
  } finally {
    database.close();
  }
});

function createApiKeyDatabase(createDatabase, file, apiKey) {
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
      ) VALUES (?, '', ?, 'plain', ?, '', '')
    `).run(apiKey.id, apiKey.key, new Date(0).toISOString());
  } finally {
    database.close();
  }
}
