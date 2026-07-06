import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { createBetterSqliteDatabase, type BetterSqliteDatabase, type BetterSqliteStatement } from "@ccr/core/storage/sqlite-native";

type MaybePromise<T> = T | Promise<T>;
export type SqliteValue = bigint | Buffer | number | string | Uint8Array | null;
export type SqliteExecResult = {
  columns: string[];
  values: SqliteValue[][];
};
export type SqliteStatement = {
  bind: (params?: SqliteValue[]) => void;
  free: () => void;
  getAsObject: () => Record<string, SqliteValue>;
  run: (params?: SqliteValue[]) => void;
  step: () => boolean;
};
export type SqlDatabase = {
  close: () => void;
  exec: (sql: string, params?: SqliteValue[]) => SqliteExecResult[];
  prepare: (sql: string) => SqliteStatement;
  run: (sql: string, params?: SqliteValue[]) => SqlDatabase;
};

export type HttpBackendRegistration = {
  handler: (request: IncomingMessage, response: ServerResponse) => MaybePromise<void>;
  host?: string;
  id?: string;
  port?: number;
};

export type RegisteredHttpBackend = {
  host: string;
  id: string;
  port: number;
  url: string;
};

export type SqliteStoreOptions = {
  filename?: string;
  migrate?: (database: SqlDatabase) => MaybePromise<void>;
};

export type SqliteStore = {
  database: SqlDatabase;
  dbFile: string;
  exec: (sql: string, params?: SqliteValue[]) => ReturnType<SqlDatabase["exec"]>;
  persist: () => void;
};

type RegisteredBackendServer = RegisteredHttpBackend & {
  ownerId: string;
  server: Server;
};

class BackendService {
  private backends: RegisteredBackendServer[] = [];
  private sqliteStores: SqliteStoreImpl[] = [];

  async registerHttpBackend(ownerId: string, backend: HttpBackendRegistration): Promise<RegisteredHttpBackend> {
    const server = http.createServer((request, response) => {
      void Promise.resolve(backend.handler(request, response)).catch((error) => {
        if (!response.headersSent) {
          sendJson(response, 500, { error: { message: formatError(error) } });
        } else {
          response.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    const host = backend.host || "127.0.0.1";
    const port = backend.port ?? 0;
    await listen(server, port, host);
    const address = server.address();
    if (!address || typeof address === "string") {
      await closeServer(server);
      throw new Error(`Backend ${backend.id || ownerId} failed to start.`);
    }

    const registered = {
      host,
      id: backend.id || `${ownerId}:backend:${this.backends.length + 1}`,
      ownerId,
      port: address.port,
      server,
      url: `http://${formatHost(host)}:${address.port}`
    };
    this.backends.push(registered);
    return {
      host: registered.host,
      id: registered.id,
      port: registered.port,
      url: registered.url
    };
  }

  async openSqliteStore(ownerId: string, dataDir: string, options: SqliteStoreOptions = {}): Promise<SqliteStore> {
    mkdirSync(dataDir, { recursive: true });
    const filename = options.filename || `${sanitizeFileSegment(ownerId)}.sqlite`;
    const dbFile = path.isAbsolute(filename) ? filename : path.join(dataDir, filename);
    mkdirSync(path.dirname(dbFile), { recursive: true });
    const database = openSqliteDatabaseWithRecovery(ownerId, dbFile);
    const store = new SqliteStoreImpl(ownerId, dbFile, database);
    this.sqliteStores.push(store);
    if (options.migrate) {
      await options.migrate(database);
      store.persist();
    }
    return store;
  }

  async stopOwner(ownerId: string): Promise<void> {
    const backends = this.backends.filter((backend) => backend.ownerId === ownerId);
    this.backends = this.backends.filter((backend) => backend.ownerId !== ownerId);
    await Promise.all(backends.map((backend) => closeServer(backend.server)));

    const sqliteStores = this.sqliteStores.filter((store) => store.ownerId === ownerId);
    this.sqliteStores = this.sqliteStores.filter((store) => store.ownerId !== ownerId);
    for (const store of sqliteStores) {
      try {
        store.close();
      } catch (error) {
        console.warn(`[backend:${ownerId}] SQLite store close failed: ${formatError(error)}`);
      }
    }
  }

  async stopAll(): Promise<void> {
    const ownerIds = new Set([
      ...this.backends.map((backend) => backend.ownerId),
      ...this.sqliteStores.map((store) => store.ownerId)
    ]);
    await Promise.all([...ownerIds].map((ownerId) => this.stopOwner(ownerId)));
  }
}

class SqliteStoreImpl implements SqliteStore {
  constructor(
    readonly ownerId: string,
    readonly dbFile: string,
    readonly database: SqlDatabase
  ) {}

  exec(sql: string, params?: SqliteValue[]): ReturnType<SqlDatabase["exec"]> {
    return this.database.exec(sql, params);
  }

  persist(): void {
    // better-sqlite3 writes mutations directly to the database/WAL. Keep this
    // method for the plugin API without reintroducing whole-database rewrites.
  }

  close(): void {
    this.database.close();
  }
}

export const backendService = new BackendService();

function openSqliteDatabaseWithRecovery(ownerId: string, dbFile: string): SqlDatabase {
  try {
    const database = openBetterSqliteDatabase(dbFile);
    assertSqliteDatabaseIntegrity(database);
    return database;
  } catch (error) {
    if (!isSqliteOpenCorruptionError(error)) {
      throw error;
    }

    const backupFile = nextCorruptSqliteBackupPath(dbFile);
    if (existsSync(dbFile)) {
      copyFileSync(dbFile, backupFile);
    }
    removeSqliteDatabaseFiles(dbFile);
    console.warn(
      `[backend:${ownerId}] SQLite store is corrupt and will be rebuilt: ${dbFile}. ` +
      `Corrupt copy saved to ${backupFile}. Error: ${formatError(error)}`
    );
    return openBetterSqliteDatabase(dbFile);
  }
}

function openBetterSqliteDatabase(dbFile: string): SqlDatabase {
  const raw = createBetterSqliteDatabase(dbFile);
  raw.pragma("journal_mode = WAL");
  raw.pragma("synchronous = NORMAL");
  raw.pragma("busy_timeout = 5000");
  return new SqliteCompatDatabase(raw);
}

class SqliteCompatDatabase implements SqlDatabase {
  constructor(private readonly raw: BetterSqliteDatabase) {}

  close(): void {
    this.raw.close();
  }

  exec(sql: string, params: SqliteValue[] = []): SqliteExecResult[] {
    const normalizedParams = normalizeSqliteParams(params);
    if (normalizedParams.length === 0 && !sqlCanReturnRows(sql)) {
      this.raw.exec(sql);
      return [];
    }

    const statement = this.raw.prepare(sql);
    if (!statement.reader) {
      statement.run(...normalizedParams);
      return [];
    }

    const columns = statement.columns().map((column) => column.name);
    const rows = statement.all(...normalizedParams) as Array<Record<string, unknown>>;
    return [{
      columns,
      values: rows.map((row) => columns.map((column) => normalizeSqliteValue(row[column])))
    }];
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteCompatStatement(this.raw.prepare(sql));
  }

  run(sql: string, params: SqliteValue[] = []): SqlDatabase {
    const normalizedParams = normalizeSqliteParams(params);
    if (normalizedParams.length === 0) {
      this.raw.exec(sql);
    } else {
      this.raw.prepare(sql).run(...normalizedParams);
    }
    return this;
  }
}

class SqliteCompatStatement implements SqliteStatement {
  private boundParams: SqliteValue[] = [];
  private currentRow: Record<string, SqliteValue> = {};
  private rowIndex = -1;
  private rows?: Array<Record<string, SqliteValue>>;

  constructor(private readonly statement: BetterSqliteStatement) {}

  bind(params: SqliteValue[] = []): void {
    this.boundParams = normalizeSqliteParams(params);
    this.currentRow = {};
    this.rowIndex = -1;
    this.rows = undefined;
  }

  free(): void {
    this.currentRow = {};
    this.rows = undefined;
  }

  getAsObject(): Record<string, SqliteValue> {
    return { ...this.currentRow };
  }

  run(params?: SqliteValue[]): void {
    const normalizedParams = params === undefined ? this.boundParams : normalizeSqliteParams(params);
    this.statement.run(...normalizedParams);
  }

  step(): boolean {
    if (!this.statement.reader) {
      return false;
    }
    this.rows ??= (this.statement.all(...this.boundParams) as Array<Record<string, unknown>>)
      .map((row) => normalizeSqliteRow(row));
    this.rowIndex += 1;
    const row = this.rows[this.rowIndex];
    if (!row) {
      this.currentRow = {};
      return false;
    }
    this.currentRow = row;
    return true;
  }
}

function sqlCanReturnRows(sql: string): boolean {
  return /^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*(?:select|pragma|with|explain)\b/i.test(sql);
}

function normalizeSqliteParams(params: SqliteValue[]): SqliteValue[] {
  return params.map((value) => normalizeSqliteValue(value));
}

function normalizeSqliteRow(row: Record<string, unknown>): Record<string, SqliteValue> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeSqliteValue(value)])
  );
}

function normalizeSqliteValue(value: unknown): SqliteValue {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "bigint" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return String(value);
}

function assertSqliteDatabaseIntegrity(database: SqlDatabase): void {
  const result = database.exec("PRAGMA integrity_check;");
  const status = result[0]?.values?.[0]?.[0];
  if (status !== "ok") {
    throw new Error(`database disk image is malformed: integrity_check returned ${String(status || "no result")}`);
  }
}

function isSqliteOpenCorruptionError(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return message.includes("database disk image is malformed") ||
    message.includes("integrity_check") ||
    message.includes("file is not a database") ||
    message.includes("not an sqlite database");
}

function nextCorruptSqliteBackupPath(dbFile: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${dbFile}.corrupt-${timestamp}`;
  if (!existsSync(base)) {
    return base;
  }
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existsSync(candidate)) {
      return candidate;
    }
  }
  return `${base}-${process.pid}`;
}

function removeSqliteDatabaseFiles(dbFile: string): void {
  rmSync(dbFile, { force: true });
  rmSync(`${dbFile}-wal`, { force: true });
  rmSync(`${dbFile}-shm`, { force: true });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(body)}\n`);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function formatHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "backend";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
