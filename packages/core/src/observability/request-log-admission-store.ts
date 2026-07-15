import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createBetterSqliteDatabase,
  type BetterSqliteDatabase,
  type BetterSqliteStatement
} from "@ccr/core/storage/sqlite-native";

export type RequestLogAdmission = {
  accepted: boolean;
  bodyCapturePolicy: "all" | "errors" | "none";
  bodyCaptureMaxBytes: number;
  reason?: string;
  recordedAt: number;
  state: "committed" | "pending" | "rejected";
};

export type RawTraceAdmissionResolution = RequestLogAdmission | "pending";

const runtimeLeaseMs = 30_000;
const terminalAdmissionRetentionMs = 48 * 60 * 60 * 1_000;
const requestLogsReconnectCooldownMs = 1_000;

export class RequestLogAdmissionStore {
  private readonly database: BetterSqliteDatabase;
  private readonly pendingInsertStatement: BetterSqliteStatement;
  private readonly pendingReadStatement: BetterSqliteStatement;
  private readonly readStatement: BetterSqliteStatement;
  private requestLogsDatabase?: BetterSqliteDatabase;
  private readonly requestLogsDbFile: string;
  private requestLogsReadStatement?: BetterSqliteStatement;
  private requestLogsUnavailableUntil = 0;
  private readonly runtimeId: string;
  private readonly upsertStatement: BetterSqliteStatement;

  constructor(dbFile: string, requestLogsDbFile: string, runtimeId: string) {
    mkdirSync(dirname(dbFile), { recursive: true });
    const database = createBetterSqliteDatabase(dbFile);
    try {
      database.pragma("journal_mode = WAL");
      database.pragma("synchronous = NORMAL");
      // Admission operations run on the gateway thread. Fail immediately on a
      // competing writer; RequestLogRuntime retains and retries the exact
      // operation asynchronously without blocking the event loop.
      database.pragma("busy_timeout = 0");
      database.exec(`
        CREATE TABLE IF NOT EXISTS request_log_admissions (
          request_id TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          runtime_id TEXT NOT NULL,
          body_capture_policy TEXT NOT NULL DEFAULT 'all',
          body_capture_max_bytes INTEGER NOT NULL DEFAULT 0,
          reason TEXT NOT NULL DEFAULT '',
          recorded_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS request_log_admissions_state_runtime_idx
          ON request_log_admissions(state, runtime_id);
        CREATE INDEX IF NOT EXISTS request_log_admissions_recorded_at_idx
          ON request_log_admissions(recorded_at);
        CREATE TABLE IF NOT EXISTS request_log_admission_runtimes (
          runtime_id TEXT PRIMARY KEY,
          owner_pid INTEGER NOT NULL,
          heartbeat_at INTEGER NOT NULL,
          lease_expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS request_log_admission_runtimes_lease_idx
          ON request_log_admission_runtimes(lease_expires_at);
        CREATE TABLE IF NOT EXISTS request_log_raw_admission_pending (
          request_id TEXT PRIMARY KEY,
          first_seen_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS request_log_raw_admission_pending_seen_idx
          ON request_log_raw_admission_pending(first_seen_at);
      `);
      ensureAdmissionBodyCapturePolicyColumn(database);
      // Older builds marked the whole logical request consumed after the first
      // raw bundle. A logical request can own several fallback bundles.
      database.exec(`
        UPDATE request_log_admissions
        SET state = 'committed', reason = ''
        WHERE state = 'consumed'
      `);
      this.database = database;
      this.requestLogsDbFile = requestLogsDbFile;
      this.runtimeId = runtimeId;
      this.readStatement = database.prepare(`
        SELECT state, body_capture_policy, body_capture_max_bytes, reason, recorded_at
        FROM request_log_admissions
        WHERE request_id = ?
        LIMIT 1
      `);
      this.upsertStatement = database.prepare(`
        INSERT INTO request_log_admissions (
          request_id,
          state,
          runtime_id,
          body_capture_policy,
          body_capture_max_bytes,
          reason,
          recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id) DO UPDATE SET
          state = excluded.state,
          runtime_id = excluded.runtime_id,
          body_capture_policy = excluded.body_capture_policy,
          body_capture_max_bytes = excluded.body_capture_max_bytes,
          reason = excluded.reason,
          recorded_at = excluded.recorded_at
      `);
      this.pendingReadStatement = database.prepare(`
        SELECT first_seen_at
        FROM request_log_raw_admission_pending
        WHERE request_id = ?
      `);
      this.pendingInsertStatement = database.prepare(`
        INSERT INTO request_log_raw_admission_pending (request_id, first_seen_at, last_seen_at)
        VALUES (?, ?, ?)
        ON CONFLICT(request_id) DO NOTHING
      `);
      this.heartbeat(runtimeId);
      this.prune();
    } catch (error) {
      database.close();
      throw error;
    }
  }

  close(): void {
    try {
      this.database.prepare("DELETE FROM request_log_admission_runtimes WHERE runtime_id = ?")
        .run(this.runtimeId);
    } finally {
      this.closeRequestLogsDatabase();
      this.database.close();
    }
  }

  heartbeat(runtimeId: string): void {
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO request_log_admission_runtimes (
        runtime_id,
        owner_pid,
        heartbeat_at,
        lease_expires_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(runtime_id) DO UPDATE SET
        owner_pid = excluded.owner_pid,
        heartbeat_at = excluded.heartbeat_at,
        lease_expires_at = excluded.lease_expires_at
    `).run(runtimeId, process.pid, now, now + runtimeLeaseMs);
    reconcileInterruptedAdmissions(this.database, this.requestLogsDbFile, runtimeId);
  }

  markCommitted(requestId: string, runtimeId: string): void {
    this.database.prepare(`
      UPDATE request_log_admissions
      SET state = 'committed', reason = '', recorded_at = ?
      WHERE request_id = ? AND state = 'pending' AND runtime_id = ?
    `).run(Date.now(), requestId, runtimeId);
  }

  prune(now = Date.now()): void {
    this.database.prepare(`
      DELETE FROM request_log_admissions
      WHERE state IN ('committed', 'rejected') AND recorded_at < ?
    `).run(now - terminalAdmissionRetentionMs);
    this.database.prepare(`
      DELETE FROM request_log_raw_admission_pending
      WHERE first_seen_at < ?
    `).run(now - terminalAdmissionRetentionMs);

    this.database.prepare(`
      DELETE FROM request_log_admission_runtimes
      WHERE lease_expires_at < ? AND runtime_id <> ?
    `).run(now - terminalAdmissionRetentionMs, this.runtimeId);
  }

  read(requestId: string): RequestLogAdmission | undefined {
    const row = this.readStatement.get(requestId) as Record<string, unknown> | undefined;
    return row ? admissionFromRow(row) : undefined;
  }

  remember(input: {
    accepted: boolean;
    bodyCapturePolicy?: "all" | "errors" | "none";
    bodyCaptureMaxBytes: number;
    reason?: string;
    requestId: string;
    runtimeId: string;
  }): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.upsertStatement.run(
        input.requestId,
        input.accepted ? "pending" : "rejected",
        input.runtimeId,
        input.bodyCapturePolicy ?? "all",
        nonNegativeInteger(input.bodyCaptureMaxBytes),
        input.reason ?? "",
        Date.now()
      );
      this.database.prepare("DELETE FROM request_log_raw_admission_pending WHERE request_id = ?")
        .run(input.requestId);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  resolveForRawTrace(requestId: string, pendingTtlMs: number): RawTraceAdmissionResolution {
    const existing = this.read(requestId);
    if (existing && existing.state !== "pending") return existing;

    const committed = this.readCommittedRequestLogAdmission(requestId);
    if (committed.state === "found") return committed.admission;
    if (committed.state === "unavailable") return "pending";
    if (existing) return existing;

    const now = Date.now();
    const pending = this.pendingReadStatement.get(requestId) as Record<string, unknown> | undefined;
    const firstSeenAt = pending ? nonNegativeInteger(pending.first_seen_at) : now;
    if (pending && now - firstSeenAt < Math.max(1, pendingTtlMs)) {
      // Polling an already-pending admission is read-only. In particular, do
      // not update last_seen_at on every raw-trace replay.
      return "pending";
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const racedAdmission = this.read(requestId);
      if (racedAdmission) {
        this.database.exec("COMMIT");
        return racedAdmission;
      }
      const racedPending = this.pendingReadStatement.get(requestId) as Record<string, unknown> | undefined;
      const racedFirstSeenAt = racedPending ? nonNegativeInteger(racedPending.first_seen_at) : firstSeenAt;
      if (racedPending && now - racedFirstSeenAt >= Math.max(1, pendingTtlMs)) {
        this.upsertStatement.run(requestId, "rejected", this.runtimeId, "none", 0, "record_missing", now);
        this.database.prepare("DELETE FROM request_log_raw_admission_pending WHERE request_id = ?")
          .run(requestId);
        this.database.exec("COMMIT");
        return this.read(requestId)!;
      }
      this.pendingInsertStatement.run(requestId, racedFirstSeenAt, now);
      this.database.exec("COMMIT");
      return "pending";
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private closeRequestLogsDatabase(): void {
    try {
      this.requestLogsDatabase?.close();
    } catch {
      // Closing the primary admission database must still be attempted.
    }
    this.requestLogsDatabase = undefined;
    this.requestLogsReadStatement = undefined;
  }

  private readCommittedRequestLogAdmission(requestId: string): CommittedAdmissionLookup {
    if (!existsSync(this.requestLogsDbFile)) return { state: "missing" };
    if (Date.now() < this.requestLogsUnavailableUntil) return { state: "unavailable" };
    try {
      if (!this.requestLogsDatabase) {
        this.requestLogsDatabase = createBetterSqliteDatabase(this.requestLogsDbFile, {
          fileMustExist: true,
          readonly: true
        });
        this.requestLogsDatabase.pragma("busy_timeout = 0");
        this.requestLogsReadStatement = this.requestLogsDatabase.prepare(`
          SELECT
            gateway_body_capture_policy,
            gateway_body_capture_max_bytes,
            completed_at
          FROM request_logs
          WHERE request_id = ?
          ORDER BY id DESC
          LIMIT 1
        `);
      }
      this.requestLogsUnavailableUntil = 0;
      const row = this.requestLogsReadStatement!.get(requestId) as Record<string, unknown> | undefined;
      if (!row) return { state: "missing" };
      return {
        admission: {
          accepted: true,
          bodyCapturePolicy: normalizeBodyCapturePolicy(row.gateway_body_capture_policy),
          bodyCaptureMaxBytes: nonNegativeInteger(row.gateway_body_capture_max_bytes),
          recordedAt: dateMs(row.completed_at),
          state: "committed"
        },
        state: "found"
      };
    } catch {
      this.closeRequestLogsDatabase();
      this.requestLogsUnavailableUntil = Date.now() + requestLogsReconnectCooldownMs;
      return { state: "unavailable" };
    }
  }
}

function reconcileInterruptedAdmissions(
  database: BetterSqliteDatabase,
  requestLogsDbFile: string,
  runtimeId: string
): void {
  const now = Date.now();
  const owners = database.prepare(`
    SELECT
      admissions.runtime_id,
      runtimes.lease_expires_at
    FROM request_log_admissions AS admissions
    LEFT JOIN request_log_admission_runtimes AS runtimes
      ON runtimes.runtime_id = admissions.runtime_id
    WHERE admissions.state = 'pending' AND admissions.runtime_id <> ?
    GROUP BY admissions.runtime_id
  `).all(runtimeId) as Array<Record<string, unknown>>;
  const interruptedRuntimeIds = owners.filter((owner) => {
    const leaseExpiresAt = nonNegativeInteger(owner.lease_expires_at);
    return leaseExpiresAt <= now;
  }).map((owner) => String(owner.runtime_id ?? "")).filter(Boolean);
  if (interruptedRuntimeIds.length === 0) return;

  let attached = false;
  try {
    database.prepare("ATTACH DATABASE ? AS request_logs_db").run(requestLogsDbFile);
    attached = true;
    for (const interruptedRuntimeId of interruptedRuntimeIds) {
      database.prepare(`
        UPDATE request_log_admissions
        SET
          state = CASE
            WHEN EXISTS (
              SELECT 1
              FROM request_logs_db.request_logs
              WHERE request_logs.request_id = request_log_admissions.request_id
            ) THEN 'committed'
            ELSE 'rejected'
          END,
          reason = CASE
            WHEN EXISTS (
              SELECT 1
              FROM request_logs_db.request_logs
              WHERE request_logs.request_id = request_log_admissions.request_id
            ) THEN ''
            ELSE 'writer_unavailable'
          END,
          recorded_at = ?
        WHERE state = 'pending' AND runtime_id = ?
      `).run(now, interruptedRuntimeId);
    }
  } catch (error) {
    // ATTACH/query/I/O failures do not prove that the request log is absent.
    // Keep admissions pending so the next heartbeat can reconcile them.
    console.warn(`[request-log] Admission reconciliation deferred: ${formatError(error)}`);
  } finally {
    if (attached) database.exec("DETACH DATABASE request_logs_db");
  }
}

type CommittedAdmissionLookup = {
  admission: RequestLogAdmission;
  state: "found";
} | {
  state: "missing" | "unavailable";
};

function admissionFromRow(row: Record<string, unknown>): RequestLogAdmission {
  const state = normalizeState(row.state);
  return {
    accepted: state === "committed" || state === "pending",
    bodyCapturePolicy: normalizeBodyCapturePolicy(row.body_capture_policy),
    bodyCaptureMaxBytes: nonNegativeInteger(row.body_capture_max_bytes),
    reason: stringValue(row.reason),
    recordedAt: nonNegativeInteger(row.recorded_at),
    state
  };
}

function ensureAdmissionBodyCapturePolicyColumn(database: BetterSqliteDatabase): void {
  const columns = database.prepare("PRAGMA table_info('request_log_admissions')").all() as Array<Record<string, unknown>>;
  if (!columns.some((column) => column.name === "body_capture_policy")) {
    database.exec("ALTER TABLE request_log_admissions ADD COLUMN body_capture_policy TEXT NOT NULL DEFAULT 'all'");
  }
}

function normalizeBodyCapturePolicy(value: unknown): RequestLogAdmission["bodyCapturePolicy"] {
  return value === "errors" || value === "none" ? value : "all";
}

function normalizeState(value: unknown): RequestLogAdmission["state"] {
  if (value === "committed" || value === "pending") return value;
  return "rejected";
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function dateMs(value: unknown): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
