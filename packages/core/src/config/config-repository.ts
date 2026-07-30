import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  APP_CONFIG_DB_FILE,
  LEGACY_ACTIVE_CONFIG_FILE,
  LEGACY_APP_CONFIG_DB_FILES,
  LEGACY_API_KEYS_DB_FILES,
  LEGACY_CONFIG_FILE,
  LEGACY_WINDOWS_CONFIG_FILE,
  ONBOARDING_FINISHED_AT_SETTING_KEY,
  ONBOARDING_FINISHED_FILE
} from "@ccr/core/config/constants";
import type { ApiKeyConfig, ApiKeyLimitConfig } from "@ccr/core/contracts/app";
import { createBetterSqliteDatabase, type BetterSqliteDatabase } from "@ccr/core/storage/sqlite-native";

type SqlDatabase = BetterSqliteDatabase;
type SqlValue = bigint | Buffer | number | string | null;

type StoredApiKeyRow = {
  createdAt: string;
  encryption: string;
  expiresAt: string;
  id: string;
  limitsJson: string;
  name: string;
  storedKey: string;
};

const appConfigKey = "default";
const plainStorage = "plain";
const privateDirMode = 0o700;
const privateFileMode = 0o600;
const backupDedupMigrationId = "legacy-storage-backup-dedup-v1";
const cleanupQueueBackfillMigrationId = "legacy-storage-cleanup-queue-v1";
const unifiedConfigMigrationId = "unified-config-store-v1";
const legacyJsonConfigFiles = [
  LEGACY_ACTIVE_CONFIG_FILE,
  LEGACY_WINDOWS_CONFIG_FILE,
  LEGACY_CONFIG_FILE
];

type ConfigRepositoryOptions = {
  removeFile?: (file: string) => void;
};

export class ConfigRepository {
  private database?: SqlDatabase;
  private initPromise?: Promise<SqlDatabase>;
  private readonly removeFile: (file: string) => void;

  constructor(
    private readonly dbFile: string,
    options: ConfigRepositoryOptions = {}
  ) {
    this.removeFile = options.removeFile ?? ((file) => rmSync(file, { force: true }));
  }

  async readAppConfig(): Promise<unknown | undefined> {
    return this.readSetting(appConfigKey);
  }

  async readSetting(key: string): Promise<unknown | undefined> {
    const database = await this.getDatabase();
    const row = queryRows(database, "SELECT value_json FROM app_config WHERE key = ? LIMIT 1", [key])[0];
    const valueJson = readString(row?.value_json);
    return valueJson ? JSON.parse(valueJson) as unknown : undefined;
  }

  async replaceAppConfig(value: unknown): Promise<void> {
    const database = await this.getDatabase();
    replaceAppConfigRow(database, appConfigKey, value);
    secureDatabaseFilePermissions(this.dbFile);
  }

  async replaceSetting(key: string, value: unknown): Promise<void> {
    const database = await this.getDatabase();
    replaceAppConfigRow(database, key, value);
    secureDatabaseFilePermissions(this.dbFile);
  }

  async readRuntimeState(key: string): Promise<unknown | undefined> {
    const database = await this.getDatabase();
    const row = queryRows(database, "SELECT value_json FROM runtime_state WHERE key = ? LIMIT 1", [key])[0];
    const valueJson = readString(row?.value_json);
    return valueJson ? JSON.parse(valueJson) as unknown : undefined;
  }

  async replaceRuntimeState(key: string, value: unknown): Promise<void> {
    const database = await this.getDatabase();
    replaceJsonRow(database, "runtime_state", key, value);
    secureDatabaseFilePermissions(this.dbFile);
  }

  async deleteRuntimeState(key: string): Promise<void> {
    const database = await this.getDatabase();
    database.prepare("DELETE FROM runtime_state WHERE key = ?").run(key);
    secureDatabaseFilePermissions(this.dbFile);
  }

  async listApiKeys(): Promise<ApiKeyConfig[]> {
    const database = await this.getDatabase();
    return listApiKeys(database);
  }

  async replaceApiKeys(apiKeys: ApiKeyConfig[]): Promise<ApiKeyConfig[]> {
    const normalized = uniqueApiKeyConfigs(apiKeys);
    const database = await this.getDatabase();
    runTransaction(database, () => replaceApiKeyRows(database, normalized));
    secureDatabaseFilePermissions(this.dbFile);
    return normalized;
  }

  async replaceConfigSnapshot(value: unknown, apiKeys: ApiKeyConfig[]): Promise<ApiKeyConfig[]> {
    const normalized = uniqueApiKeyConfigs(apiKeys);
    const database = await this.getDatabase();
    runTransaction(database, () => {
      replaceAppConfigRow(database, appConfigKey, value);
      replaceApiKeyRows(database, normalized);
    });
    secureDatabaseFilePermissions(this.dbFile);
    return normalized;
  }

  async archiveLegacyJsonConfigFiles(files: string[]): Promise<void> {
    const requestedFiles = uniquePaths(files);
    const unsupportedFiles = requestedFiles.filter(
      (file) => !legacyJsonConfigFiles.some((candidate) => samePath(candidate, file))
    );
    if (unsupportedFiles.length > 0) {
      throw new Error(`Refusing to archive unknown legacy JSON config file: ${unsupportedFiles.join(", ")}`);
    }
    if (requestedFiles.length === 0) {
      return;
    }
    const database = await this.getDatabase();
    archiveAndRemoveFiles(database, requestedFiles, "legacy-json-config", this.removeFile);
  }

  private async getDatabase(): Promise<SqlDatabase> {
    if (this.database) {
      return this.database;
    }
    this.initPromise ??= this.open();
    return this.initPromise;
  }

  private async open(): Promise<SqlDatabase> {
    const dbDir = dirname(this.dbFile);
    mkdirSync(dbDir, { mode: privateDirMode, recursive: true });
    securePathPermissions(dbDir, privateDirMode);
    const database = createBetterSqliteDatabase(this.dbFile);
    configureSqliteDatabase(database);
    createSchema(database);

    try {
      migrateLegacySqliteStores(database, this.removeFile);
      migrateLegacyOnboardingMarker(database, this.removeFile);
      drainLegacyCleanup(database, this.removeFile, "legacy-json-config");
    } catch (error) {
      database.close();
      throw error;
    }

    this.database = database;
    secureDatabaseFilePermissions(this.dbFile);
    return database;
  }
}

export const configRepository = new ConfigRepository(APP_CONFIG_DB_FILE);

export async function loadPersistedAppConfig(): Promise<unknown | undefined> {
  return configRepository.readAppConfig();
}

export async function loadPersistedAppSetting(key: string): Promise<unknown | undefined> {
  return configRepository.readSetting(key);
}

export async function replacePersistedAppConfig(value: unknown): Promise<void> {
  await configRepository.replaceAppConfig(value);
}

export async function replacePersistedAppSetting(key: string, value: unknown): Promise<void> {
  await configRepository.replaceSetting(key, value);
}

export async function loadPersistedRuntimeState(key: string): Promise<unknown | undefined> {
  return configRepository.readRuntimeState(key);
}

export async function replacePersistedRuntimeState(key: string, value: unknown): Promise<void> {
  await configRepository.replaceRuntimeState(key, value);
}

export async function deletePersistedRuntimeState(key: string): Promise<void> {
  await configRepository.deleteRuntimeState(key);
}

export async function loadPersistedApiKeys(): Promise<ApiKeyConfig[]> {
  return configRepository.listApiKeys();
}

export async function replacePersistedApiKeys(apiKeys: ApiKeyConfig[]): Promise<ApiKeyConfig[]> {
  return configRepository.replaceApiKeys(apiKeys);
}

export async function replacePersistedConfigSnapshot(value: unknown, apiKeys: ApiKeyConfig[]): Promise<ApiKeyConfig[]> {
  return configRepository.replaceConfigSnapshot(value, apiKeys);
}

export async function archiveLegacyJsonConfigFiles(files: string[]): Promise<void> {
  await configRepository.archiveLegacyJsonConfigFiles(files);
}

function createSchema(database: SqlDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      encrypted_key TEXT NOT NULL,
      encryption TEXT NOT NULL DEFAULT '${plainStorage}',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL DEFAULT '',
      limits_json TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS api_keys_created_at_idx ON api_keys(created_at);

    CREATE TABLE IF NOT EXISTS config_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS runtime_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS legacy_storage_backups (
      id TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      content BLOB NOT NULL,
      archived_at TEXT NOT NULL
    );

    DELETE FROM legacy_storage_backups
    WHERE NOT EXISTS (
      SELECT 1
      FROM config_schema_migrations
      WHERE id = '${backupDedupMigrationId}'
    )
    AND rowid NOT IN (
      SELECT MIN(rowid)
      FROM legacy_storage_backups
      GROUP BY source_path, source_kind, sha256
    );

    CREATE UNIQUE INDEX IF NOT EXISTS legacy_storage_backups_content_idx
    ON legacy_storage_backups(source_kind, source_path, sha256);

    INSERT OR IGNORE INTO config_schema_migrations (id, applied_at, details_json)
    VALUES ('${backupDedupMigrationId}', '${new Date().toISOString()}', '');

    CREATE TABLE IF NOT EXISTS legacy_storage_cleanup (
      source_path TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      queued_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO legacy_storage_cleanup (
      source_path,
      source_kind,
      sha256,
      queued_at
    )
    SELECT
      source_path,
      source_kind,
      sha256,
      archived_at
    FROM legacy_storage_backups
    WHERE NOT EXISTS (
      SELECT 1
      FROM config_schema_migrations
      WHERE id = '${cleanupQueueBackfillMigrationId}'
    );

    INSERT OR IGNORE INTO config_schema_migrations (id, applied_at, details_json)
    VALUES ('${cleanupQueueBackfillMigrationId}', '${new Date().toISOString()}', '');
  `);
}

function migrateLegacySqliteStores(database: SqlDatabase, removeFile: (file: string) => void): void {
  const legacyAppConfig = readLegacyAppConfigRows();
  const legacyApiKeys = readLegacyApiKeyRows();
  const appConfigRows = legacyAppConfig.rows;
  const apiKeyRows = legacyApiKeys.rows;
  const failedFiles = uniquePaths([...legacyAppConfig.failedFiles, ...legacyApiKeys.failedFiles]);
  const readableFiles = uniquePaths([...legacyAppConfig.readableFiles, ...legacyApiKeys.readableFiles])
    .filter((file) => !failedFiles.some((failedFile) => samePath(file, failedFile)));
  const backups = collectFileBackups(readableFiles.flatMap(sqliteDataFiles), "legacy-sqlite-config");

  runTransaction(database, () => {
    for (const row of appConfigRows) {
      database.prepare(`
        INSERT INTO app_config (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO NOTHING
      `).run(row.key, row.valueJson, row.updatedAt);
    }
    insertRawApiKeyRows(database, apiKeyRows);
    insertLegacyBackups(database, backups);
  });

  const cleanupFailures = drainLegacyCleanup(database, removeFile, "legacy-sqlite-config");
  const incompleteFiles = uniquePaths([...failedFiles, ...cleanupFailures]);
  runTransaction(database, () => {
    if (incompleteFiles.length > 0) {
      database.prepare("DELETE FROM config_schema_migrations WHERE id = ?").run(unifiedConfigMigrationId);
      return;
    }
    database.prepare(`
      INSERT INTO config_schema_migrations (id, applied_at, details_json)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        applied_at = excluded.applied_at,
        details_json = excluded.details_json
    `).run(
      unifiedConfigMigrationId,
      new Date().toISOString(),
      JSON.stringify({
        appConfigRows: appConfigRows.length,
        apiKeyRows: apiKeyRows.length,
        archivedFiles: backups.length
      })
    );
  });

  if (incompleteFiles.length > 0) {
    console.warn(
      `[config] Preserving legacy SQLite source${incompleteFiles.length === 1 ? "" : "s"} for a future migration retry: ${incompleteFiles.join(", ")}`
    );
  }
}

function migrateLegacyOnboardingMarker(database: SqlDatabase, removeFile: (file: string) => void): void {
  if (!existsSync(ONBOARDING_FINISHED_FILE)) {
    drainLegacyCleanup(database, removeFile, "legacy-onboarding-state");
    return;
  }
  const backup = collectFileBackups([ONBOARDING_FINISHED_FILE], "legacy-onboarding-state")[0];
  if (!backup) {
    return;
  }
  const existing = queryRows(
    database,
    "SELECT key FROM app_config WHERE key = ? LIMIT 1",
    [ONBOARDING_FINISHED_AT_SETTING_KEY]
  ).length > 0;

  runTransaction(database, () => {
    if (!existing) {
      const finishedAt = statSync(ONBOARDING_FINISHED_FILE).mtime.toISOString();
      replaceAppConfigRow(database, ONBOARDING_FINISHED_AT_SETTING_KEY, finishedAt);
    }
    insertLegacyBackups(database, [backup]);
  });
  drainLegacyCleanup(database, removeFile, "legacy-onboarding-state");
}

function archiveAndRemoveFiles(
  database: SqlDatabase,
  files: string[],
  sourceKind: string,
  removeFile: (file: string) => void
): void {
  const backups = collectFileBackups(uniquePaths(files), sourceKind);
  if (backups.length > 0) {
    runTransaction(database, () => insertLegacyBackups(database, backups));
  }
  drainLegacyCleanup(database, removeFile, sourceKind);
}

type LegacyBackup = {
  content: Buffer;
  id: string;
  sha256: string;
  sourceKind: string;
  sourcePath: string;
};

function collectFileBackups(files: string[], sourceKind: string): LegacyBackup[] {
  return files.flatMap((file): LegacyBackup[] => {
    if (!existsSync(file) || samePath(file, APP_CONFIG_DB_FILE)) {
      return [];
    }
    const content = readFileSync(file);
    const sha256 = createHash("sha256").update(content).digest("hex");
    return [{
      content,
      id: createHash("sha256").update(`${sourceKind}\0${resolve(file)}\0${sha256}`).digest("hex"),
      sha256,
      sourceKind,
      sourcePath: resolve(file)
    }];
  });
}

function insertLegacyBackups(database: SqlDatabase, backups: LegacyBackup[]): void {
  const archivedAt = new Date().toISOString();
  const backupStatement = database.prepare(`
    INSERT OR IGNORE INTO legacy_storage_backups (
      id, source_path, source_kind, sha256, content, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const cleanupStatement = database.prepare(`
    INSERT INTO legacy_storage_cleanup (
      source_path, source_kind, sha256, queued_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET
      source_kind = excluded.source_kind,
      sha256 = excluded.sha256,
      queued_at = excluded.queued_at
  `);
  for (const backup of backups) {
    backupStatement.run(
      backup.id,
      backup.sourcePath,
      backup.sourceKind,
      backup.sha256,
      backup.content,
      archivedAt
    );
    cleanupStatement.run(
      backup.sourcePath,
      backup.sourceKind,
      backup.sha256,
      archivedAt
    );
  }
}

function drainLegacyCleanup(
  database: SqlDatabase,
  removeFile: (file: string) => void,
  sourceKind: string
): string[] {
  const rows = queryRows(
    database,
    `
      SELECT source_path, sha256
      FROM legacy_storage_cleanup
      WHERE source_kind = ?
      ORDER BY queued_at, source_path
    `,
    [sourceKind]
  );
  const failedFiles: string[] = [];
  for (const row of rows) {
    const file = readString(row.source_path);
    const archivedSha256 = readString(row.sha256);
    if (!file || !archivedSha256) {
      continue;
    }
    if (!existsSync(file)) {
      deleteLegacyCleanupRow(database, file);
      continue;
    }
    try {
      const currentSha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
      if (currentSha256 !== archivedSha256) {
        const matchingBackup = queryRows(
          database,
          `
            SELECT id
            FROM legacy_storage_backups
            WHERE source_path = ? AND sha256 = ?
            LIMIT 1
          `,
          [file, currentSha256]
        )[0];
        if (!matchingBackup) {
          failedFiles.push(file);
          console.warn(`[config] Preserving changed legacy config source for a future migration retry: ${file}`);
          continue;
        }
        database.prepare(`
          UPDATE legacy_storage_cleanup
          SET sha256 = ?, queued_at = ?
          WHERE source_path = ?
        `).run(currentSha256, new Date().toISOString(), file);
      }
      removeFile(file);
      if (existsSync(file)) {
        throw new Error("source still exists after cleanup");
      }
      deleteLegacyCleanupRow(database, file);
    } catch (error) {
      failedFiles.push(file);
      console.warn(`[config] Failed to remove migrated config source ${file}: ${formatError(error)}`);
    }
  }
  return failedFiles;
}

function deleteLegacyCleanupRow(database: SqlDatabase, file: string): void {
  database.prepare("DELETE FROM legacy_storage_cleanup WHERE source_path = ?").run(file);
}

type LegacyAppConfigRow = {
  key: string;
  updatedAt: string;
  valueJson: string;
};

type LegacySqliteReadResult<Row> = {
  failedFiles: string[];
  readableFiles: string[];
  rows: Row[];
};

function readLegacyAppConfigRows(): LegacySqliteReadResult<LegacyAppConfigRow> {
  const result: LegacySqliteReadResult<LegacyAppConfigRow> = {
    failedFiles: [],
    readableFiles: [],
    rows: []
  };
  for (const dbFile of LEGACY_APP_CONFIG_DB_FILES) {
    if (!existsSync(dbFile) || samePath(dbFile, APP_CONFIG_DB_FILE)) {
      continue;
    }
    let database: SqlDatabase | undefined;
    try {
      database = createBetterSqliteDatabase(dbFile, { fileMustExist: true, readonly: true });
      const rows = queryRows(database, "SELECT key, value_json, updated_at FROM app_config");
      result.readableFiles.push(dbFile);
      result.rows.push(...rows.flatMap((row): LegacyAppConfigRow[] => {
        const key = readString(row.key);
        const valueJson = readString(row.value_json);
        if (!key || !valueJson) {
          return [];
        }
        return [{
          key,
          updatedAt: readString(row.updated_at) || new Date(0).toISOString(),
          valueJson
        }];
      }));
    } catch (error) {
      result.failedFiles.push(dbFile);
      console.warn(`[config] Failed to read legacy app config database ${dbFile}: ${formatError(error)}`);
    } finally {
      database?.close();
    }
  }
  return result;
}

function readLegacyApiKeyRows(): LegacySqliteReadResult<Record<string, SqlValue>> {
  const result: LegacySqliteReadResult<Record<string, SqlValue>> = {
    failedFiles: [],
    readableFiles: [],
    rows: []
  };
  for (const dbFile of LEGACY_API_KEYS_DB_FILES) {
    if (!existsSync(dbFile) || samePath(dbFile, APP_CONFIG_DB_FILE)) {
      continue;
    }
    let database: SqlDatabase | undefined;
    try {
      database = createBetterSqliteDatabase(dbFile, { fileMustExist: true, readonly: true });
      const rows = queryRows(database, `
        SELECT id, name, encrypted_key, encryption, created_at, expires_at, limits_json
        FROM api_keys
        ORDER BY rowid
      `);
      result.readableFiles.push(dbFile);
      result.rows.push(...rows);
    } catch (error) {
      result.failedFiles.push(dbFile);
      console.warn(`[config] Failed to read legacy API key database ${dbFile}: ${formatError(error)}`);
    } finally {
      database?.close();
    }
  }
  return result;
}

function insertRawApiKeyRows(database: SqlDatabase, rows: Array<Record<string, SqlValue>>): void {
  const statement = database.prepare(`
    INSERT OR IGNORE INTO api_keys (
      id, name, encrypted_key, encryption, created_at, expires_at, limits_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    const stored = toStoredApiKeyRow(row);
    if (!stored) {
      continue;
    }
    statement.run(
      stored.id,
      stored.name,
      stored.storedKey,
      stored.encryption,
      stored.createdAt,
      stored.expiresAt,
      stored.limitsJson
    );
  }
}

function replaceAppConfigRow(database: SqlDatabase, key: string, value: unknown): void {
  replaceJsonRow(database, "app_config", key, value);
}

function replaceJsonRow(database: SqlDatabase, table: "app_config" | "runtime_state", key: string, value: unknown): void {
  database.prepare(`
    INSERT INTO ${table} (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), new Date().toISOString());
}

function listApiKeys(database: SqlDatabase): ApiKeyConfig[] {
  const rows = queryRows(database, `
    SELECT id, name, encrypted_key, encryption, created_at, expires_at, limits_json
    FROM api_keys
    ORDER BY rowid
  `);
  return uniqueApiKeyConfigs(rows.map(toApiKeyConfig));
}

function replaceApiKeyRows(database: SqlDatabase, apiKeys: ApiKeyConfig[]): void {
  const statement = database.prepare(`
    INSERT INTO api_keys (
      id, name, encrypted_key, encryption, created_at, expires_at, limits_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  database.exec("DELETE FROM api_keys");
  for (const apiKey of apiKeys) {
    statement.run(
      apiKey.id,
      apiKey.name ?? "",
      apiKey.key,
      plainStorage,
      apiKey.createdAt,
      apiKey.expiresAt ?? "",
      apiKey.limits ? JSON.stringify(apiKey.limits) : ""
    );
  }
}

function toApiKeyConfig(row: Record<string, SqlValue>): ApiKeyConfig | undefined {
  const stored = toStoredApiKeyRow(row);
  if (!stored) {
    return undefined;
  }
  if (stored.encryption !== plainStorage) {
    console.warn(`[api-keys] Stored API key uses unsupported storage "${stored.encryption}". Re-save the API key to migrate it.`);
    return undefined;
  }
  const key = stored.storedKey.trim();
  if (!key) {
    return undefined;
  }
  const limits = parseApiKeyLimits(stored.limitsJson);
  return {
    createdAt: stored.createdAt,
    ...(stored.expiresAt ? { expiresAt: stored.expiresAt } : {}),
    id: stored.id,
    key,
    ...(limits ? { limits } : {}),
    ...(stored.name ? { name: stored.name } : {})
  };
}

function toStoredApiKeyRow(row: Record<string, SqlValue>): StoredApiKeyRow | undefined {
  const id = readString(row.id);
  const storedKey = readString(row.encrypted_key);
  if (!id || !storedKey) {
    return undefined;
  }
  return {
    createdAt: readString(row.created_at) || new Date(0).toISOString(),
    encryption: readString(row.encryption) || plainStorage,
    expiresAt: readString(row.expires_at) || "",
    id,
    limitsJson: readString(row.limits_json) || "",
    name: readString(row.name) || "",
    storedKey
  };
}

function parseApiKeyLimits(value: string): ApiKeyLimitConfig | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isObject(parsed)) {
      return undefined;
    }
    const limits: ApiKeyLimitConfig = {};
    for (const key of ["ipd", "iph", "ipm", "maxRequests", "maxTokens", "quotaWindowMs", "rpd", "rph", "rpm", "tpd", "tph", "tpm", "windowMs"] as const) {
      const limit = readPositiveInteger(parsed[key]);
      if (limit) {
        limits[key] = limit;
      }
    }
    return Object.keys(limits).length ? limits : undefined;
  } catch {
    return undefined;
  }
}

function uniqueApiKeyConfigs(values: Array<ApiKeyConfig | undefined>): ApiKeyConfig[] {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const result: ApiKeyConfig[] = [];
  for (const [index, value] of values.entries()) {
    const key = value?.key.trim();
    if (!value || !key || seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    const id = uniqueApiKeyId(value.id || `key-${index + 1}`, seenIds, index);
    result.push({
      createdAt: value.createdAt || new Date(0).toISOString(),
      ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
      id,
      key,
      ...(value.limits ? { limits: value.limits } : {}),
      ...(value.name ? { name: value.name } : {})
    });
  }
  return result;
}

function uniqueApiKeyId(id: string, seenIds: Set<string>, index: number): string {
  const base = id.trim() || `key-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (seenIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  seenIds.add(candidate);
  return candidate;
}

function runTransaction(database: SqlDatabase, operation: () => void): void {
  try {
    database.exec("BEGIN IMMEDIATE");
    operation();
    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  }
}

function sqliteDataFiles(file: string): string[] {
  return [file, `${file}-wal`, `${file}-shm`];
}

function configureSqliteDatabase(database: SqlDatabase): void {
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
}

function queryRows(database: SqlDatabase, sql: string, params: SqlValue[] = []): Array<Record<string, SqlValue>> {
  return database.prepare(sql).all(...params) as Array<Record<string, SqlValue>>;
}

function readPositiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function secureDatabaseFilePermissions(file: string): void {
  securePathPermissions(file, privateFileMode);
  securePathPermissions(`${file}-wal`, privateFileMode);
  securePathPermissions(`${file}-shm`, privateFileMode);
}

function securePathPermissions(file: string, mode: number): void {
  if (process.platform === "win32" || !existsSync(file)) {
    return;
  }
  try {
    chmodSync(file, mode);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
}

function uniquePaths(files: string[]): string[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const normalized = resolve(file).toLowerCase();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
