import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { APP_CONFIG_DB_FILE, LEGACY_APP_CONFIG_DB_FILES } from "./constants";
import { createBetterSqliteDatabase, type BetterSqliteDatabase } from "./sqlite-native";

type SqlDatabase = BetterSqliteDatabase;
type SqlValue = bigint | Buffer | number | string | null;

const appConfigKey = "default";
const privateDirMode = 0o700;
const privateFileMode = 0o600;

class AppConfigStore {
  private database?: SqlDatabase;
  private initPromise?: Promise<SqlDatabase>;

  constructor(private readonly dbFile: string) {}

  async read(): Promise<unknown | undefined> {
    return this.readKey(appConfigKey);
  }

  async readKey(key: string): Promise<unknown | undefined> {
    const database = await this.getDatabase();
    const row = queryRows(database, "SELECT value_json FROM app_config WHERE key = ? LIMIT 1", [key])[0];
    const valueJson = readString(row?.value_json);
    if (!valueJson) {
      return undefined;
    }
    return JSON.parse(valueJson) as unknown;
  }

  async replace(value: unknown): Promise<void> {
    await this.replaceKey(appConfigKey, value);
  }

  async replaceKey(key: string, value: unknown): Promise<void> {
    const database = await this.getDatabase();
    database.prepare(`
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), new Date().toISOString());
    secureDatabaseFilePermissions(this.dbFile);
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
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.database = database;
    secureDatabaseFilePermissions(this.dbFile);
    return database;
  }
}

export const appConfigStore = new AppConfigStore(APP_CONFIG_DB_FILE);

export async function loadPersistedAppConfig(): Promise<unknown | undefined> {
  if (!existsSync(APP_CONFIG_DB_FILE)) {
    const legacyValue = await readLegacyAppConfigKey(appConfigKey);
    if (legacyValue !== undefined) {
      return legacyValue;
    }
  }
  return appConfigStore.read();
}

export async function loadPersistedAppSetting(key: string): Promise<unknown | undefined> {
  if (!existsSync(APP_CONFIG_DB_FILE)) {
    const legacyValue = await readLegacyAppConfigKey(key);
    if (legacyValue !== undefined) {
      return legacyValue;
    }
  }
  return appConfigStore.readKey(key);
}

export async function replacePersistedAppConfig(value: unknown): Promise<void> {
  await appConfigStore.replace(value);
}

export async function replacePersistedAppSetting(key: string, value: unknown): Promise<void> {
  await appConfigStore.replaceKey(key, value);
}

async function readLegacyAppConfigKey(key: string): Promise<unknown | undefined> {
  for (const dbFile of LEGACY_APP_CONFIG_DB_FILES) {
    if (!existsSync(dbFile) || samePath(dbFile, APP_CONFIG_DB_FILE)) {
      continue;
    }
    try {
      const store = new AppConfigStore(dbFile);
      const value = await store.readKey(key);
      if (value !== undefined) {
        return value;
      }
    } catch (error) {
      console.warn(`[config] Failed to read legacy app config database ${dbFile}: ${formatError(error)}`);
    }
  }
  return undefined;
}

function configureSqliteDatabase(database: SqlDatabase): void {
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
}

function queryRows(database: SqlDatabase, sql: string, params: SqlValue[] = []): Array<Record<string, SqlValue>> {
  return database.prepare(sql).all(...params) as Array<Record<string, SqlValue>>;
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

function samePath(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
