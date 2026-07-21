import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createBetterSqliteDatabase, type BetterSqliteDatabase } from "@ccr/core/storage/sqlite-native";
import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";

type SqlValue = bigint | Buffer | number | string | null;

export type ArchiveRoute = {
  credentialChain?: string[];
  credentialIds?: string[];
  logicalProvider?: string;
  providerProtocol?: GatewayProviderProtocol;
  routedModel?: string;
};

export type ArchiveSnapshotStatus = "failed" | "pending" | "ready";

export type ArchiveSnapshot = {
  archiveId: string;
  body: Buffer;
  bodySha256: string;
  createdAt: number;
  expiresAt?: number;
  generation: number;
  method: string;
  parentArchiveId?: string;
  path: string;
  protocol: GatewayProviderProtocol;
  replayHeaders: Record<string, string>;
  requestId: string;
  route?: ArchiveRoute;
  sessionId: string;
  status: ArchiveSnapshotStatus;
  tokenHash: string;
};

export type ArchiveRetention = {
  maxBytes: number;
  maxSnapshots: number;
  retentionDays: number;
};

export class ContextArchiveStore {
  private readonly database: BetterSqliteDatabase;

  constructor(readonly dbFile: string) {
    if (dbFile !== ":memory:") {
      const directory = dirname(dbFile);
      mkdirSync(directory, { mode: 0o700, recursive: true });
      securePath(directory, 0o700);
    }
    this.database = createBetterSqliteDatabase(dbFile);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("synchronous = NORMAL");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS archive_snapshots (
        archive_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        parent_archive_id TEXT,
        request_id TEXT NOT NULL UNIQUE,
        protocol TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        body BLOB NOT NULL,
        body_sha256 TEXT NOT NULL,
        replay_headers_json TEXT NOT NULL,
        route_json TEXT,
        token_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        UNIQUE(session_id, generation)
      );
      CREATE INDEX IF NOT EXISTS archive_snapshots_session_generation
        ON archive_snapshots(session_id, generation DESC);
      CREATE INDEX IF NOT EXISTS archive_snapshots_expires_at
        ON archive_snapshots(expires_at);
    `);
    this.secureFiles();
  }

  create(input: Omit<ArchiveSnapshot, "generation" | "parentArchiveId" | "status">, retention: ArchiveRetention): ArchiveSnapshot {
    const transaction = this.database.transaction(() => {
      const previous = this.database.prepare(`
        SELECT archive_id, generation
        FROM archive_snapshots
        WHERE session_id = ?
        ORDER BY generation DESC
        LIMIT 1
      `).get(input.sessionId) as { archive_id?: string; generation?: number } | undefined;
      const generation = Number(previous?.generation ?? 0) + 1;
      const parentArchiveId = readString(previous?.archive_id);
      this.database.prepare(`
        INSERT INTO archive_snapshots (
          archive_id, session_id, generation, parent_archive_id, request_id,
          protocol, method, path, body, body_sha256, replay_headers_json,
          token_hash, status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        input.archiveId,
        input.sessionId,
        generation,
        parentArchiveId ?? null,
        input.requestId,
        input.protocol,
        input.method,
        input.path,
        input.body,
        input.bodySha256,
        JSON.stringify(input.replayHeaders),
        input.tokenHash,
        input.createdAt,
        input.expiresAt ?? null
      );
      return { generation, parentArchiveId };
    });
    const lineage = transaction();
    this.prune(retention, input.archiveId);
    this.secureFiles();
    return {
      ...input,
      ...lineage,
      status: "pending"
    };
  }

  finalize(archiveId: string, route: ArchiveRoute): void {
    this.database.prepare(`
      UPDATE archive_snapshots
      SET route_json = ?, status = 'ready'
      WHERE archive_id = ? AND status = 'pending'
    `).run(JSON.stringify(route), archiveId);
    this.secureFiles();
  }

  fail(archiveId: string): void {
    this.database.prepare("UPDATE archive_snapshots SET status = 'failed' WHERE archive_id = ?").run(archiveId);
  }

  get(archiveId: string): ArchiveSnapshot | undefined {
    const row = this.database.prepare(`
      SELECT * FROM archive_snapshots WHERE archive_id = ? LIMIT 1
    `).get(archiveId) as Record<string, SqlValue> | undefined;
    return row ? snapshotFromRow(row) : undefined;
  }

  clear(): void {
    this.database.prepare("DELETE FROM archive_snapshots").run();
  }

  close(): void {
    this.database.close();
  }

  private prune(retention: ArchiveRetention, protectedArchiveId: string): void {
    const now = Date.now();
    this.database.prepare(`
      DELETE FROM archive_snapshots
      WHERE expires_at IS NOT NULL AND expires_at <= ? AND archive_id <> ?
    `).run(now, protectedArchiveId);

    const maxSnapshots = Math.max(1, Math.floor(retention.maxSnapshots));
    this.database.prepare(`
      DELETE FROM archive_snapshots
      WHERE archive_id IN (
        SELECT archive_id FROM archive_snapshots
        WHERE archive_id <> ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT -1 OFFSET ?
      )
    `).run(protectedArchiveId, Math.max(0, maxSnapshots - 1));

    const maxBytes = Math.max(1, Math.floor(retention.maxBytes));
    const rows = this.database.prepare(`
      SELECT archive_id, length(body) AS body_bytes
      FROM archive_snapshots
      ORDER BY created_at DESC, rowid DESC
    `).all() as Array<{ archive_id: string; body_bytes: number }>;
    let retainedBytes = 0;
    for (const row of rows) {
      retainedBytes += Number(row.body_bytes ?? 0);
      if (retainedBytes > maxBytes && row.archive_id !== protectedArchiveId) {
        this.database.prepare("DELETE FROM archive_snapshots WHERE archive_id = ?").run(row.archive_id);
      }
    }
  }

  private secureFiles(): void {
    if (this.dbFile === ":memory:") {
      return;
    }
    securePath(this.dbFile, 0o600);
    securePath(`${this.dbFile}-wal`, 0o600);
    securePath(`${this.dbFile}-shm`, 0o600);
  }
}

function snapshotFromRow(row: Record<string, SqlValue>): ArchiveSnapshot {
  return {
    archiveId: requiredString(row.archive_id),
    body: Buffer.from(row.body as Buffer),
    bodySha256: requiredString(row.body_sha256),
    createdAt: Number(row.created_at),
    expiresAt: optionalNumber(row.expires_at),
    generation: Number(row.generation),
    method: requiredString(row.method),
    parentArchiveId: readString(row.parent_archive_id),
    path: requiredString(row.path),
    protocol: requiredString(row.protocol) as GatewayProviderProtocol,
    replayHeaders: parseRecord(row.replay_headers_json),
    requestId: requiredString(row.request_id),
    route: parseOptionalRoute(row.route_json),
    sessionId: requiredString(row.session_id),
    status: requiredString(row.status) as ArchiveSnapshotStatus,
    tokenHash: requiredString(row.token_hash)
  };
}

function parseRecord(value: SqlValue): Record<string, string> {
  const parsed = JSON.parse(requiredString(value)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function parseOptionalRoute(value: SqlValue): ArchiveRoute | undefined {
  const text = readString(value);
  if (!text) {
    return undefined;
  }
  const parsed = JSON.parse(text) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ArchiveRoute : undefined;
}

function requiredString(value: SqlValue): string {
  const text = readString(value);
  if (!text) {
    throw new Error("Context archive database contains an invalid string value.");
  }
  return text;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function optionalNumber(value: SqlValue): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

function securePath(file: string, mode: number): void {
  if (process.platform === "win32" || !existsSync(file)) {
    return;
  }
  try {
    chmodSync(file, mode);
  } catch {
    // Best-effort hardening for filesystems that do not expose POSIX modes.
  }
}
