import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { API_KEYS_DB_FILE, LEGACY_API_KEYS_DB_FILES } from "@ccr/core/config/constants";
import { createBetterSqliteDatabase, type BetterSqliteDatabase } from "@ccr/core/storage/sqlite-native";
import type { ApiKeyConfig, ApiKeyLimitConfig } from "@ccr/core/contracts/app";

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

const plainStorage = "plain";
const privateDirMode = 0o700;
const privateFileMode = 0o600;

class ApiKeyStore {
  private database?: SqlDatabase;
  private initPromise?: Promise<SqlDatabase>;

  constructor(private readonly dbFile: string) {}

  async list(): Promise<ApiKeyConfig[]> {
    const database = await this.getDatabase();
    const rows = queryRows(
      database,
      `
        SELECT
          id,
          name,
          encrypted_key,
          encryption,
          created_at,
          expires_at,
          limits_json
        FROM api_keys
        ORDER BY rowid
      `
    );

    return uniqueApiKeyConfigs(rows.map(toApiKeyConfig));
  }

  async replace(apiKeys: ApiKeyConfig[]): Promise<ApiKeyConfig[]> {
    const normalized = uniqueApiKeyConfigs(apiKeys);
    const database = await this.getDatabase();
    const statement = database.prepare(`
      INSERT INTO api_keys (
        id,
        name,
        encrypted_key,
        encryption,
        created_at,
        expires_at,
        limits_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      database.exec("BEGIN TRANSACTION");
      database.exec("DELETE FROM api_keys");
      for (const apiKey of normalized) {
        const stored = storeApiKey(apiKey.key);
        statement.run(
          apiKey.id,
          apiKey.name ?? "",
          stored.value,
          stored.encryption,
          apiKey.createdAt,
          apiKey.expiresAt ?? "",
          apiKey.limits ? JSON.stringify(apiKey.limits) : ""
        );
      }
      database.exec("COMMIT");
      secureDatabaseFilePermissions(this.dbFile);
      return normalized;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Ignore rollback errors; the original write error is more useful.
      }
      secureDatabaseFilePermissions(this.dbFile);
      throw error;
    }
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

    database.exec(`
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
    `);

    this.database = database;
    secureDatabaseFilePermissions(this.dbFile);
    return database;
  }
}

export const apiKeyStore = new ApiKeyStore(API_KEYS_DB_FILE);

export async function loadPersistedApiKeys(): Promise<ApiKeyConfig[]> {
  if (!existsSync(API_KEYS_DB_FILE)) {
    const legacyApiKeys = await readLegacyApiKeys();
    if (legacyApiKeys.length > 0) {
      return legacyApiKeys;
    }
  }
  return apiKeyStore.list();
}

export async function replacePersistedApiKeys(apiKeys: ApiKeyConfig[]): Promise<ApiKeyConfig[]> {
  return apiKeyStore.replace(apiKeys);
}

async function readLegacyApiKeys(): Promise<ApiKeyConfig[]> {
  for (const dbFile of LEGACY_API_KEYS_DB_FILES) {
    if (!existsSync(dbFile) || samePath(dbFile, API_KEYS_DB_FILE)) {
      continue;
    }
    try {
      const store = new ApiKeyStore(dbFile);
      const apiKeys = await store.list();
      if (apiKeys.length > 0) {
        return apiKeys;
      }
    } catch (error) {
      console.warn(`[config] Failed to read legacy API key database ${dbFile}: ${formatError(error)}`);
    }
  }
  return [];
}

function toApiKeyConfig(row: Record<string, SqlValue>): ApiKeyConfig | undefined {
  const stored = toStoredApiKeyRow(row);
  if (!stored) {
    return undefined;
  }

  const key = readStoredApiKey(stored.storedKey, stored.encryption);
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
  const createdAt = readString(row.created_at) || new Date(0).toISOString();
  if (!id || !storedKey) {
    return undefined;
  }

  return {
    createdAt,
    encryption: readString(row.encryption) || plainStorage,
    expiresAt: readString(row.expires_at) || "",
    id,
    limitsJson: readString(row.limits_json) || "",
    name: readString(row.name) || "",
    storedKey
  };
}

function storeApiKey(key: string): { encryption: string; value: string } {
  return {
    encryption: plainStorage,
    value: key
  };
}

function readStoredApiKey(value: string, encryption: string): string | undefined {
  if (encryption !== plainStorage) {
    console.warn(`[api-keys] Stored API key uses unsupported storage "${encryption}". Re-save the API key to migrate it.`);
    return undefined;
  }
  return value.trim() || undefined;
}

function secureDatabaseFilePermissions(file: string): void {
  securePathPermissions(file, privateFileMode);
  securePathPermissions(`${file}-wal`, privateFileMode);
  securePathPermissions(`${file}-shm`, privateFileMode);
}

function securePathPermissions(file: string, mode: number): void {
  if (process.platform === "win32") {
    return;
  }
  if (!existsSync(file)) {
    return;
  }
  try {
    chmodSync(file, mode);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
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

function configureSqliteDatabase(database: SqlDatabase): void {
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
}

function queryRows(database: SqlDatabase, sql: string, params: SqlValue[] = []): Array<Record<string, SqlValue>> {
  return database.prepare(sql).all(...params) as Array<Record<string, SqlValue>>;
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

function readPositiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function samePath(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
