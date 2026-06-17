import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import initSqlJs from "sql.js";

type MaybePromise<T> = T | Promise<T>;
export type SqlDatabase = InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>;
export type SqliteValue = number | string | Uint8Array | null;

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

const requireFromHere = createRequire(__filename);

class BackendService {
  private backends: RegisteredBackendServer[] = [];
  private sqliteStores: SqliteStoreImpl[] = [];
  private sqlJs?: Promise<Awaited<ReturnType<typeof initSqlJs>>>;

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
    const SQL = await this.getSqlJs();
    const database = openSqliteDatabaseWithRecovery(SQL, ownerId, dbFile);
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

  private getSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
    this.sqlJs ??= initSqlJs({ locateFile: () => requireFromHere.resolve("sql.js/dist/sql-wasm.wasm") });
    return this.sqlJs;
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
    writeFileSync(this.dbFile, Buffer.from(this.database.export()));
  }

  close(): void {
    this.persist();
    this.database.close();
  }
}

export const backendService = new BackendService();

function openSqliteDatabaseWithRecovery(
  SQL: Awaited<ReturnType<typeof initSqlJs>>,
  ownerId: string,
  dbFile: string
): SqlDatabase {
  if (!existsSync(dbFile)) {
    return new SQL.Database();
  }

  try {
    const database = new SQL.Database(readFileSync(dbFile));
    assertSqliteDatabaseIntegrity(database);
    return database;
  } catch (error) {
    if (!isSqliteOpenCorruptionError(error)) {
      throw error;
    }

    const backupFile = nextCorruptSqliteBackupPath(dbFile);
    copyFileSync(dbFile, backupFile);
    console.warn(
      `[backend:${ownerId}] SQLite store is corrupt and will be rebuilt: ${dbFile}. ` +
      `Corrupt copy saved to ${backupFile}. Error: ${formatError(error)}`
    );
    return new SQL.Database();
  }
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
