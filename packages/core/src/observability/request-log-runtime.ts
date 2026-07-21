import { randomUUID } from "node:crypto";
import { realpath, rm } from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { Worker } from "node:worker_threads";
import { RAW_TRACE_SPOOL_DIR } from "@ccr/core/config/constants";
import type {
  AgentAnalysisFilter,
  AgentAnalysisSnapshot,
  AgentAnalysisTracePayloadFullResult,
  AgentAnalysisTracePayloadRequest,
  RequestLogDetailRequest,
  RequestLogEntry,
  RequestLogListFilter,
  RequestLogPage
} from "@ccr/core/contracts/app";
import type {
  RequestLogRawTraceFiles,
  RequestLogRawTraceUpdateInput,
  RequestLogRecordInput,
  RequestLogStoreWriteCommand
} from "@ccr/core/observability/request-log-store";
import {
  defaultRequestLogBodyBytes,
  maxRequestLogBodyBytes,
  resolveRawTraceBodyLimit
} from "@ccr/core/observability/request-log-limits";
import { compactBase64ImagePayloads } from "@ccr/core/observability/request-log-body";
import {
  RequestLogAdmissionStore,
  type RequestLogAdmission
} from "@ccr/core/observability/request-log-admission-store";
import { suppressRouteTraceBodyValues } from "@ccr/core/observability/route-trace";
import { isSensitiveRequestLogHeaderName } from "@ccr/core/observability/sensitive-headers";

export type RequestLogEnqueueResult = {
  accepted: boolean;
  degraded: boolean;
  reason?: "body_removed" | "closed" | "queue_full" | "record_dropped" | "record_pending" | "writer_unavailable";
};

export type RequestLogRuntimeMetrics = {
  accepted: number;
  admissionOverlayItems: number;
  admissionPendingOperations: number;
  committed: number;
  degraded: number;
  dropped: number;
  inFlightItems: number;
  queueBytes: number;
  queueItems: number;
  writerRestarts: number;
};

export type RequestLogRuntimeOptions = {
  admissionDbFile?: string;
  admissionMaxPendingOperations?: number;
  admissionOperationMaxAgeMs?: number;
  admissionOverlayMaxEntries?: number;
  admissionOverlayTtlMs?: number;
  batchMaxBytes?: number;
  batchMaxItems?: number;
  batchMaxWaitMs?: number;
  dbFile: string;
  queueMaxBytes?: number;
  queueMaxItems?: number;
  pendingAdmissionTtlMs?: number;
  rawTraceSpoolDir?: string;
  workerFile?: string;
};

type ResolvedRuntimeOptions = Required<Omit<RequestLogRuntimeOptions, "admissionDbFile" | "rawTraceSpoolDir" | "workerFile">> & {
  admissionDbFile: string;
  rawTraceSpoolDir: string;
  workerFile: string;
};

type QueuedCommand = RequestLogStoreWriteCommand & {
  batchBytes: number;
  isolated?: boolean;
  sizeBytes: number;
  writeAttempts: number;
};

type InFlightBatch = {
  bytes: number;
  commands: QueuedCommand[];
};

type WorkerResponse = {
  batchId?: number;
  error?: string;
  requestId?: number;
  result?: unknown;
  type: "ack" | "batch-error" | "maintenance" | "ready" | "response";
  updated?: number;
};

type PendingRpc = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

type AdmissionOperation = {
  attempts: number;
  createdAt: number;
  key?: string;
  overlayRequestId?: string;
  overlayVersion?: number;
  run: (store: RequestLogAdmissionStore) => void;
};

type AdmissionOverlayEntry = RequestLogAdmission & {
  version: number;
};

// One raw-trace event can contain both a maximum-sized request and response.
// Keep room for exactly that case while retaining byte-based backpressure for
// concurrent events.
const defaultQueueMaxBytes = 128 * 1024 * 1024;
const maxCommandWriteAttempts = 3;
const admissionRetryMaxDelayMs = 5_000;
const defaultAdmissionMaxPendingOperations = 20_000;
const defaultAdmissionOperationMaxAgeMs = 10 * 60 * 1_000;
const defaultAdmissionOverlayMaxEntries = 10_000;
const defaultAdmissionOverlayTtlMs = 10 * 60 * 1_000;
const admissionDrainTimeSliceMs = 5;
const admissionDrainMaxOperations = 100;

export class RequestLogRuntime {
  private accepted = 0;
  private admissionHeartbeatTimer?: NodeJS.Timeout;
  private admissionLastPrunedAt = 0;
  private admissionLastWarningAt = 0;
  private readonly admissionOperationKeys = new Set<string>();
  private readonly admissionOperations = new Map<number, AdmissionOperation>();
  private readonly admissionOverlay = new Map<string, AdmissionOverlayEntry>();
  private admissionRetryTimer?: NodeJS.Timeout;
  private admissionStore?: RequestLogAdmissionStore;
  private batchId = 0;
  private closed = false;
  private committed = 0;
  private readonly cleanupTasks = new Set<Promise<void>>();
  private degraded = 0;
  private dropped = 0;
  private flushTimer?: NodeJS.Timeout;
  private readonly inFlight = new Map<number, InFlightBatch>();
  private nextRequestId = 0;
  private nextAdmissionOperationId = 0;
  private nextAdmissionOverlayVersion = 0;
  private nextSequence = 0;
  private readonly options: ResolvedRuntimeOptions;
  private outstandingBytes = 0;
  private readonly queryRequests = new Map<number, PendingRpc>();
  private queryWorker?: Worker;
  private queryWorkerReady?: Promise<void>;
  private readonly queue: QueuedCommand[] = [];
  private revision = 0;
  private readonly runtimeId = randomUUID();
  private readonly writerRequests = new Map<number, PendingRpc>();
  private writerRestartCount = 0;
  private writerWorker?: Worker;
  private writerWorkerReady?: Promise<void>;

  constructor(options: RequestLogRuntimeOptions) {
    this.options = {
      admissionDbFile: options.admissionDbFile ?? `${options.dbFile}.admissions.sqlite`,
      admissionMaxPendingOperations: positiveInteger(
        options.admissionMaxPendingOperations,
        defaultAdmissionMaxPendingOperations
      ),
      admissionOperationMaxAgeMs: positiveInteger(
        options.admissionOperationMaxAgeMs,
        defaultAdmissionOperationMaxAgeMs
      ),
      admissionOverlayMaxEntries: positiveInteger(
        options.admissionOverlayMaxEntries,
        defaultAdmissionOverlayMaxEntries
      ),
      admissionOverlayTtlMs: positiveInteger(
        options.admissionOverlayTtlMs,
        defaultAdmissionOverlayTtlMs
      ),
      batchMaxBytes: positiveInteger(options.batchMaxBytes, 4 * 1024 * 1024),
      batchMaxItems: positiveInteger(options.batchMaxItems, 50),
      batchMaxWaitMs: positiveInteger(options.batchMaxWaitMs, 10),
      dbFile: options.dbFile,
      pendingAdmissionTtlMs: positiveInteger(options.pendingAdmissionTtlMs, 5 * 60 * 1_000),
      queueMaxBytes: positiveInteger(options.queueMaxBytes, defaultQueueMaxBytes),
      queueMaxItems: positiveInteger(options.queueMaxItems, 2_000),
      rawTraceSpoolDir: options.rawTraceSpoolDir ?? RAW_TRACE_SPOOL_DIR,
      workerFile: options.workerFile ?? path.join(__dirname, "request-log-worker.js")
    };
  }

  enqueueRecord(input: RequestLogRecordInput): RequestLogEnqueueResult {
    const pressure = this.pressureRatio();
    const ordinarySuccess = input.statusCode >= 200 && input.statusCode < 400 && !input.error;
    if (pressure >= 0.95 && ordinarySuccess) {
      this.dropped += 1;
      const result: RequestLogEnqueueResult = {
        accepted: false,
        degraded: false,
        reason: "queue_full"
      };
      this.rememberRecordAdmission(
        input.requestId,
        result,
        0,
        resolveRecordBodyCapturePolicy(input)
      );
      return result;
    }
    const prepared = prepareRecordForQueue(input, pressure);
    const sizeBytes = estimateRecordBytes(prepared.input);
    const command: QueuedCommand = {
      eventId: randomUUID(),
      input: prepared.input,
      kind: "record",
      sequence: ++this.nextSequence,
      batchBytes: sizeBytes,
      sizeBytes,
      writeAttempts: 0
    };
    const result = this.enqueue(command, prepared.degraded ? "body_removed" : undefined);
    this.rememberRecordAdmission(
      input.requestId,
      result,
      prepared.bodyCaptureMaxBytes,
      resolveRecordBodyCapturePolicy(input)
    );
    if (result.accepted && prepared.degraded) this.degraded += 1;
    return result;
  }

  rejectRecord(requestId: string | undefined, reason = "sampled"): void {
    this.rememberRecordAdmission(requestId, {
      accepted: false,
      degraded: false,
      reason: "record_dropped"
    }, 0, "none", reason);
  }

  enqueueRawTrace(
    input: RequestLogRawTraceUpdateInput,
    rawTraceFiles?: RequestLogRawTraceFiles
  ): RequestLogEnqueueResult {
    const recordAdmission = input.deferOutcomeUntilRecord
      ? this.resolveRecordAdmission(input.requestId)
      : this.readRecordAdmission(input.requestId);
    if (recordAdmission === "pending" ||
      (input.deferOutcomeUntilRecord && recordAdmission?.state === "pending") ||
      (recordAdmission === undefined && input.deferOutcomeUntilRecord)) {
      return {
        accepted: false,
        degraded: false,
        reason: "record_pending"
      };
    }
    if (recordAdmission && !recordAdmission.accepted) {
      this.dropped += 1;
      return {
        accepted: false,
        degraded: false,
        reason: "record_dropped"
      };
    }
    const ordinarySuccess = input.statusCode !== undefined &&
      input.statusCode >= 200 && input.statusCode < 400;
    if (!recordAdmission && this.pressureRatio() >= 0.95 && ordinarySuccess) {
      this.dropped += 1;
      return { accepted: false, degraded: false, reason: "queue_full" };
    }
    const configuredMaxBodyBytes = resolveRawTraceBodyLimit(rawTraceFiles?.maxBodyBytes);
    const maxBodyBytes = Math.min(
      configuredMaxBodyBytes,
      recordAdmission?.bodyCaptureMaxBytes ?? configuredMaxBodyBytes
    );
    const bodyPolicyDegraded = maxBodyBytes < configuredMaxBodyBytes;
    const admittedInput = recordAdmission
      ? { ...input, bodyCapturePolicy: recordAdmission.bodyCapturePolicy }
      : input;
    const policyInput = maxBodyBytes === 0
      ? suppressRequestLogRawTraceBodies(admittedInput)
      : admittedInput;
    const queuedRawTraceFiles = constrainRawTraceFiles(rawTraceFiles, maxBodyBytes);
    const prepared = prepareRawTraceForQueue(policyInput, maxBodyBytes);
    const sizeBytes = Math.max(
      estimateRawTraceBytes(prepared, queuedRawTraceFiles),
      rawTraceFileBytes(queuedRawTraceFiles, maxBodyBytes)
    );
    const command: QueuedCommand = {
      input: prepared,
      kind: "raw-trace-update",
      rawTraceFiles: queuedRawTraceFiles,
      sequence: ++this.nextSequence,
      batchBytes: sizeBytes,
      sizeBytes,
      writeAttempts: 0
    };
    return this.enqueue(command, bodyPolicyDegraded ? "body_removed" : undefined);
  }

  async list(filter?: RequestLogListFilter): Promise<RequestLogPage> {
    return await this.query<RequestLogPage>("list", [filter]);
  }

  async getDetail(request: RequestLogDetailRequest): Promise<RequestLogEntry | undefined> {
    return await this.query<RequestLogEntry | undefined>("getDetail", [request]);
  }

  async analyze(filter?: AgentAnalysisFilter): Promise<AgentAnalysisSnapshot> {
    return await this.query<AgentAnalysisSnapshot>("analyze", [filter]);
  }

  async getTracePayload(request: AgentAnalysisTracePayloadRequest): Promise<AgentAnalysisTracePayloadFullResult> {
    return await this.query<AgentAnalysisTracePayloadFullResult>("getTracePayload", [request]);
  }

  metrics(): RequestLogRuntimeMetrics {
    this.pruneAdmissionOverlay();
    return {
      accepted: this.accepted,
      admissionOverlayItems: this.admissionOverlay.size,
      admissionPendingOperations: this.admissionOperations.size,
      committed: this.committed,
      degraded: this.degraded,
      dropped: this.dropped,
      inFlightItems: [...this.inFlight.values()].reduce((total, batch) => total + batch.commands.length, 0),
      queueBytes: this.outstandingBytes,
      queueItems: this.queue.length,
      writerRestarts: this.writerRestartCount
    };
  }

  async flush(options: { timeoutMs: number }): Promise<{ pending: number; timedOut: boolean }> {
    if (!this.writerWorker && this.queue.length === 0 && this.cleanupTasks.size === 0) {
      return { pending: 0, timedOut: false };
    }
    this.schedulePump(true);
    const drained = await waitUntil(
      () => this.queue.length === 0 && this.inFlight.size === 0 && this.cleanupTasks.size === 0,
      options.timeoutMs
    );
    if (drained && this.writerWorker) {
      await withTimeout(this.writerRpc("flush", []), Math.max(1, options.timeoutMs));
    }
    return {
      pending: this.queue.length + [...this.inFlight.values()].reduce((total, batch) => total + batch.commands.length, 0),
      timedOut: !drained
    };
  }

  async close(options: { timeoutMs: number }): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    await this.flush(options).catch(() => undefined);
    await Promise.all([
      this.shutdownWorker("query", this.queryWorker, this.queryRequests, options.timeoutMs),
      this.shutdownWorker("writer", this.writerWorker, this.writerRequests, options.timeoutMs)
    ]);
    this.queryWorker = undefined;
    this.writerWorker = undefined;
    if (this.admissionHeartbeatTimer) clearInterval(this.admissionHeartbeatTimer);
    this.admissionHeartbeatTimer = undefined;
    this.drainAdmissionOperations();
    await waitUntil(() => this.admissionOperations.size === 0, options.timeoutMs);
    if (this.admissionRetryTimer) clearTimeout(this.admissionRetryTimer);
    this.admissionRetryTimer = undefined;
    this.admissionOperations.clear();
    this.admissionOperationKeys.clear();
    this.admissionOverlay.clear();
    try {
      this.admissionStore?.close();
    } catch (error) {
      console.warn(`[request-log] Failed to close admission persistence: ${formatRuntimeError(error)}`);
    }
    this.admissionStore = undefined;
  }

  private enqueue(command: QueuedCommand, degradedReason?: RequestLogEnqueueResult["reason"]): RequestLogEnqueueResult {
    if (this.closed) {
      this.dropped += 1;
      return { accepted: false, degraded: false, reason: "closed" };
    }
    if (command.sizeBytes > this.options.queueMaxBytes ||
      this.outstandingBytes + command.sizeBytes > this.options.queueMaxBytes ||
      this.queue.length + this.inFlightItemCount() >= this.options.queueMaxItems) {
      this.dropped += 1;
      return { accepted: false, degraded: false, reason: "queue_full" };
    }
    this.accepted += 1;
    this.outstandingBytes += command.sizeBytes;
    this.queue.push(command);
    this.ensureWriter().catch(() => undefined);
    this.schedulePump(this.queue.length >= this.options.batchMaxItems || this.queuedBytes() >= this.options.batchMaxBytes);
    return {
      accepted: true,
      degraded: degradedReason !== undefined,
      ...(degradedReason ? { reason: degradedReason } : {})
    };
  }

  private pressureRatio(): number {
    return Math.max(
      this.outstandingBytes / this.options.queueMaxBytes,
      (this.queue.length + this.inFlightItemCount()) / this.options.queueMaxItems
    );
  }

  private inFlightItemCount(): number {
    return [...this.inFlight.values()].reduce((total, batch) => total + batch.commands.length, 0);
  }

  private queuedBytes(): number {
    return this.queue.reduce((total, command) => total + command.batchBytes, 0);
  }

  private rememberRecordAdmission(
    requestId: string | undefined,
    result: RequestLogEnqueueResult,
    bodyCaptureMaxBytes: number,
    bodyCapturePolicy: "all" | "errors" | "none",
    persistedReason: string | undefined = result.reason
  ): void {
    const normalized = requestId?.trim();
    if (!normalized) return;
    const overlayVersion = this.setAdmissionOverlay(normalized, {
      accepted: result.accepted,
      bodyCapturePolicy,
      bodyCaptureMaxBytes,
      reason: persistedReason,
      recordedAt: Date.now(),
      state: result.accepted ? "pending" : "rejected"
    });
    this.submitAdmissionOperation({
      attempts: 0,
      createdAt: Date.now(),
      overlayRequestId: normalized,
      overlayVersion,
      run: (store) => store.remember({
        accepted: result.accepted,
        bodyCapturePolicy,
        bodyCaptureMaxBytes,
        reason: persistedReason,
        requestId: normalized,
        runtimeId: this.runtimeId
      })
    });
  }

  private readRecordAdmission(requestId: string): RequestLogAdmission | undefined {
    const normalized = requestId.trim();
    if (!normalized) return undefined;
    this.pruneAdmissionOverlay();
    const overlay = this.admissionOverlay.get(normalized);
    if (overlay) return overlay;
    return this.useAdmissionStore((store) => store.read(normalized));
  }

  private resolveRecordAdmission(requestId: string): RequestLogAdmission | "pending" | undefined {
    const normalized = requestId.trim();
    if (!normalized) return undefined;
    this.pruneAdmissionOverlay();
    const overlay = this.admissionOverlay.get(normalized);
    if (overlay) return overlay;
    return this.useAdmissionStore((store) =>
      store.resolveForRawTrace(normalized, this.options.pendingAdmissionTtlMs));
  }

  private markRecordAdmissionsCommitted(commands: QueuedCommand[]): void {
    for (const command of commands) {
      if (command.kind !== "record") continue;
      const requestId = command.input.requestId?.trim();
      if (!requestId) continue;
      const existing = this.admissionOverlay.get(requestId);
      const overlayVersion = this.setAdmissionOverlay(requestId, {
        accepted: true,
        bodyCaptureMaxBytes: existing?.bodyCaptureMaxBytes ?? nonNegativeInteger(command.input.maxBodyBytes),
        bodyCapturePolicy: existing?.bodyCapturePolicy ?? resolveRecordBodyCapturePolicy(command.input),
        recordedAt: Date.now(),
        state: "committed"
      });
      this.submitAdmissionOperation({
        attempts: 0,
        createdAt: Date.now(),
        overlayRequestId: requestId,
        overlayVersion,
        run: (store) => store.markCommitted(requestId, this.runtimeId)
      });
    }
  }

  private useAdmissionStore<T>(operation: (store: RequestLogAdmissionStore) => T): T | undefined {
    try {
      const store = this.ensureAdmissionStore();
      return operation(store);
    } catch (error) {
      this.handleAdmissionFailure(error);
      return undefined;
    }
  }

  private ensureAdmissionStore(): RequestLogAdmissionStore {
    this.admissionStore ??= new RequestLogAdmissionStore(
      this.options.admissionDbFile,
      this.options.dbFile,
      this.runtimeId
    );
    this.ensureAdmissionHeartbeat();
    return this.admissionStore;
  }

  private submitAdmissionOperation(operation: AdmissionOperation): void {
    if (operation.key && this.admissionOperationKeys.has(operation.key)) return;
    const operationId = ++this.nextAdmissionOperationId;
    this.admissionOperations.set(operationId, operation);
    if (operation.key) this.admissionOperationKeys.add(operation.key);
    while (this.admissionOperations.size > this.options.admissionMaxPendingOperations) {
      const oldest = this.admissionOperations.entries().next().value as
        [number, AdmissionOperation] | undefined;
      if (!oldest) break;
      this.settleAdmissionOperation(oldest[0], oldest[1]);
      this.warnAdmissionBound("pending operation capacity");
    }
    this.drainAdmissionOperations();
  }

  private drainAdmissionOperations(): void {
    if (this.admissionRetryTimer) return;
    const startedAt = Date.now();
    let processed = 0;
    while (this.admissionOperations.size > 0) {
      if (processed >= admissionDrainMaxOperations || Date.now() - startedAt >= admissionDrainTimeSliceMs) {
        this.scheduleAdmissionDrain(0);
        return;
      }
      const next = this.admissionOperations.entries().next().value as
        [number, AdmissionOperation] | undefined;
      if (!next) return;
      const [operationId, operation] = next;
      if (Date.now() - operation.createdAt >= this.options.admissionOperationMaxAgeMs) {
        this.settleAdmissionOperation(operationId, operation);
        this.warnAdmissionBound("pending operation TTL");
        processed += 1;
        continue;
      }
      try {
        operation.run(this.ensureAdmissionStore());
        this.settleAdmissionOperation(operationId, operation);
        processed += 1;
      } catch (error) {
        operation.attempts += 1;
        this.handleAdmissionFailure(error);
        const delayMs = Math.min(
          admissionRetryMaxDelayMs,
          25 * (2 ** Math.min(8, operation.attempts - 1))
        );
        this.scheduleAdmissionDrain(delayMs);
        return;
      }
    }
  }

  private scheduleAdmissionDrain(delayMs: number): void {
    if (this.admissionRetryTimer) return;
    this.admissionRetryTimer = setTimeout(() => {
      this.admissionRetryTimer = undefined;
      this.drainAdmissionOperations();
    }, delayMs);
    this.admissionRetryTimer.unref?.();
  }

  private handleAdmissionFailure(error: unknown): void {
    if (!isTransientSqliteLock(error)) {
      try {
        this.admissionStore?.close();
      } catch {
        // The original persistence failure is the actionable error.
      }
      this.admissionStore = undefined;
    }
    const now = Date.now();
    if (now - this.admissionLastWarningAt >= 30_000) {
      this.admissionLastWarningAt = now;
      console.warn(`[request-log] Admission persistence operation queued for retry: ${formatRuntimeError(error)}`);
    }
  }

  private setAdmissionOverlay(
    requestId: string,
    admission: RequestLogAdmission
  ): number {
    this.pruneAdmissionOverlay(admission.recordedAt);
    const version = ++this.nextAdmissionOverlayVersion;
    this.admissionOverlay.delete(requestId);
    this.admissionOverlay.set(requestId, { ...admission, version });
    while (this.admissionOverlay.size > this.options.admissionOverlayMaxEntries) {
      const oldestRequestId = this.admissionOverlay.keys().next().value as string | undefined;
      if (!oldestRequestId) break;
      this.admissionOverlay.delete(oldestRequestId);
      this.warnAdmissionBound("overlay capacity");
    }
    return version;
  }

  private pruneAdmissionOverlay(now = Date.now()): void {
    const cutoff = now - this.options.admissionOverlayTtlMs;
    for (const [requestId, admission] of this.admissionOverlay) {
      if (admission.recordedAt > cutoff) break;
      this.admissionOverlay.delete(requestId);
    }
  }

  private settleAdmissionOperation(operationId: number, operation: AdmissionOperation): void {
    this.admissionOperations.delete(operationId);
    if (operation.key) this.admissionOperationKeys.delete(operation.key);
    if (!operation.overlayRequestId || operation.overlayVersion === undefined) return;
    const overlay = this.admissionOverlay.get(operation.overlayRequestId);
    if (overlay?.version === operation.overlayVersion) {
      this.admissionOverlay.delete(operation.overlayRequestId);
    }
  }

  private warnAdmissionBound(bound: string): void {
    const now = Date.now();
    if (now - this.admissionLastWarningAt < 30_000) return;
    this.admissionLastWarningAt = now;
    console.warn(`[request-log] Admission ${bound} reached; oldest fail-closed state was released.`);
  }

  private ensureAdmissionHeartbeat(): void {
    if (this.admissionHeartbeatTimer || this.closed) return;
    this.admissionHeartbeatTimer = setInterval(() => {
      this.submitAdmissionOperation({
        attempts: 0,
        createdAt: Date.now(),
        key: "heartbeat",
        run: (store) => {
          store.heartbeat(this.runtimeId);
          const now = Date.now();
          if (now - this.admissionLastPrunedAt >= 60 * 60 * 1_000) {
            store.prune(now);
            this.admissionLastPrunedAt = now;
          }
        }
      });
    }, 10_000);
    this.admissionHeartbeatTimer.unref?.();
  }

  private schedulePump(immediate = false): void {
    if (this.inFlight.size > 0 || this.queue.length === 0) return;
    if (immediate) {
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
      queueMicrotask(() => void this.pump());
      return;
    }
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = undefined;
      void this.pump();
    }, this.options.batchMaxWaitMs);
    this.flushTimer.unref?.();
  }

  private async pump(): Promise<void> {
    if (this.inFlight.size > 0 || this.queue.length === 0) return;
    try {
      await this.ensureWriter();
    } catch {
      return;
    }
    const commands: QueuedCommand[] = [];
    let bytes = 0;
    const isolatedBatch = Boolean(this.queue[0]?.isolated);
    while (this.queue.length > 0 && commands.length < this.options.batchMaxItems) {
      const next = this.queue[0];
      if (commands.length > 0 &&
        (isolatedBatch || next.isolated || bytes + next.batchBytes > this.options.batchMaxBytes)) break;
      const command = this.queue.shift()!;
      command.writeAttempts += 1;
      commands.push(command);
      bytes += next.batchBytes;
    }
    if (commands.length === 0 || !this.writerWorker) return;
    const batchId = ++this.batchId;
    this.inFlight.set(batchId, {
      bytes: commands.reduce((total, command) => total + command.sizeBytes, 0),
      commands
    });
    this.writerWorker.postMessage({ batchId, commands: commands.map(withoutSize), type: "batch" });
  }

  private ensureWriter(): Promise<void> {
    if (this.writerWorkerReady) return this.writerWorkerReady;
    this.writerWorkerReady = new Promise<void>((resolve, reject) => {
      const worker = new Worker(this.options.workerFile, {
        workerData: {
          dbFile: this.options.dbFile,
          mode: "writer",
          rawTraceSpoolDir: this.options.rawTraceSpoolDir
        }
      });
      this.writerWorker = worker;
      worker.unref();
      const onStartupError = (error: Error) => reject(error);
      worker.once("error", onStartupError);
      worker.on("message", (message: WorkerResponse) => {
        if (message.type === "ready") {
          worker.off("error", onStartupError);
          resolve();
          this.schedulePump(true);
          return;
        }
        this.handleWriterMessage(message);
      });
      worker.on("error", (error) => this.handleWriterFailure(worker, error));
      worker.on("exit", (code) => {
        if (!this.closed && code !== 0) this.handleWriterFailure(worker, new Error(`request log writer exited with ${code}`));
      });
    });
    return this.writerWorkerReady;
  }

  private handleWriterMessage(message: WorkerResponse): void {
    if (message.type === "ack" && message.batchId !== undefined) {
      const batch = this.inFlight.get(message.batchId);
      if (!batch) return;
      this.inFlight.delete(message.batchId);
      this.outstandingBytes = Math.max(0, this.outstandingBytes - batch.bytes);
      this.committed += batch.commands.length;
      this.revision += batch.commands.length;
      this.markRecordAdmissionsCommitted(batch.commands);
      this.scheduleRawTraceCleanup(batch.commands);
      this.schedulePump(true);
      return;
    }
    if (message.type === "batch-error") {
      this.handleBatchError(message);
      return;
    }
    if (message.type === "maintenance" && (message.updated ?? 0) > 0) {
      this.revision += 1;
      return;
    }
    settleRpc(this.writerRequests, message);
  }

  private handleBatchError(message: WorkerResponse): void {
    if (message.batchId === undefined) {
      this.handleWriterFailure(this.writerWorker, new Error(message.error || "request log batch failed"));
      return;
    }
    const batch = this.inFlight.get(message.batchId);
    if (!batch) return;
    this.inFlight.delete(message.batchId);
    if (batch.commands.length > 1) {
      this.queue.unshift(...batch.commands.map((command) => ({ ...command, isolated: true })));
      this.schedulePump(true);
      return;
    }

    const command = batch.commands[0];
    if (command.writeAttempts < maxCommandWriteAttempts) {
      this.queue.unshift({ ...command, isolated: true });
    } else {
      this.outstandingBytes = Math.max(0, this.outstandingBytes - command.sizeBytes);
      this.dropped += 1;
      if (command.kind === "record") {
        this.rememberRecordAdmission(command.input.requestId, {
          accepted: false,
          degraded: false,
          reason: "writer_unavailable"
        }, 0, resolveRecordBodyCapturePolicy(command.input));
        this.scheduleRawTraceCleanup([command]);
      }
      console.warn(
        `[request-log] ${command.kind === "raw-trace-update" ? "Retaining" : "Dropping"} ` +
        `${command.kind} sequence ${command.sequence} after ` +
        `${command.writeAttempts} failed write attempts: ${message.error || "request log batch failed"}`
      );
    }
    this.schedulePump(true);
  }

  private handleWriterFailure(worker: Worker | undefined, error: Error): void {
    if (!worker || worker !== this.writerWorker) return;
    this.writerWorker = undefined;
    this.writerWorkerReady = undefined;
    void worker.terminate().catch(() => undefined);
    for (const [, batch] of [...this.inFlight].reverse()) this.queue.unshift(...batch.commands);
    this.inFlight.clear();
    rejectPending(this.writerRequests, error);
    if (this.closed) return;
    this.writerRestartCount += 1;
    const delayMs = Math.min(5_000, 100 * (2 ** Math.min(6, this.writerRestartCount - 1)));
    const timer = setTimeout(() => {
      this.ensureWriter().then(() => this.schedulePump(true)).catch(() => undefined);
    }, delayMs);
    timer.unref?.();
  }

  private scheduleRawTraceCleanup(commands: QueuedCommand[]): void {
    const directories = new Set(commands.flatMap((command) =>
      command.kind === "raw-trace-update" && command.rawTraceFiles?.cleanupDirectory
        ? [command.rawTraceFiles.cleanupDirectory]
        : []
    ));
    if (directories.size === 0) return;
    const task = this.cleanupRawTraceDirectories(directories).finally(() => {
      this.cleanupTasks.delete(task);
    });
    this.cleanupTasks.add(task);
  }

  private async cleanupRawTraceDirectories(directories: Set<string>): Promise<void> {
    for (const directory of directories) {
      try {
        const spoolDirectory = await realpath(this.options.rawTraceSpoolDir);
        const candidate = await realpath(path.resolve(directory));
        if (candidate === spoolDirectory || !candidate.startsWith(`${spoolDirectory}${path.sep}`)) {
          throw new Error(`Raw trace path is outside the configured spool directory: ${directory}`);
        }
        await rm(candidate, { force: true, recursive: true });
      } catch (error) {
        if (errorCode(error) !== "ENOENT") {
          console.warn(`[request-log] Failed to clean committed raw trace bundle: ${formatRuntimeError(error)}`);
        }
      }
    }
  }

  private async ensureQueryWorker(): Promise<void> {
    if (this.queryWorkerReady) return await this.queryWorkerReady;
    await this.ensureWriter();
    this.queryWorkerReady = new Promise<void>((resolve, reject) => {
      const worker = new Worker(this.options.workerFile, {
        workerData: {
          dbFile: this.options.dbFile,
          mode: "query",
          rawTraceSpoolDir: this.options.rawTraceSpoolDir
        }
      });
      this.queryWorker = worker;
      worker.unref();
      const onStartupError = (error: Error) => reject(error);
      worker.once("error", onStartupError);
      worker.on("message", (message: WorkerResponse) => {
        if (message.type === "ready") {
          worker.off("error", onStartupError);
          resolve();
          return;
        }
        settleRpc(this.queryRequests, message);
      });
      worker.on("error", (error) => {
        if (worker !== this.queryWorker) return;
        this.queryWorker = undefined;
        this.queryWorkerReady = undefined;
        rejectPending(this.queryRequests, error);
      });
      worker.on("exit", (code) => {
        if (worker !== this.queryWorker) return;
        this.queryWorker = undefined;
        this.queryWorkerReady = undefined;
        if (!this.closed && code !== 0) rejectPending(this.queryRequests, new Error(`request log query worker exited with ${code}`));
      });
    });
    return await this.queryWorkerReady;
  }

  private async query<T>(method: string, args: unknown[]): Promise<T> {
    if (this.closed) throw new Error("Request log runtime is closed.");
    await this.ensureQueryWorker();
    if (!this.queryWorker) throw new Error("Request log query worker is unavailable.");
    return await rpc<T>(this.queryWorker, this.queryRequests, ++this.nextRequestId, method, args, {
      revision: this.revision
    });
  }

  private async writerRpc<T = unknown>(method: string, args: unknown[]): Promise<T> {
    await this.ensureWriter();
    if (!this.writerWorker) throw new Error("Request log writer is unavailable.");
    return await rpc<T>(this.writerWorker, this.writerRequests, ++this.nextRequestId, method, args);
  }

  private async shutdownWorker(
    mode: "query" | "writer",
    worker: Worker | undefined,
    requests: Map<number, PendingRpc>,
    timeoutMs: number
  ): Promise<void> {
    if (!worker) return;
    try {
      await withTimeout(rpc(worker, requests, ++this.nextRequestId, "shutdown", []), timeoutMs);
    } catch {
      await worker.terminate();
    } finally {
      rejectPending(requests, new Error(`Request log ${mode} worker closed.`));
    }
  }
}

export function createRequestLogRuntime(options: RequestLogRuntimeOptions): RequestLogRuntime {
  return new RequestLogRuntime(options);
}

function prepareRecordForQueue(
  input: RequestLogRecordInput,
  pressure: number
): { bodyCaptureMaxBytes: number; degraded: boolean; input: RequestLogRecordInput } {
  const maxBodyBytes = Math.max(0, Math.min(maxRequestLogBodyBytes, input.maxBodyBytes ?? defaultRequestLogBodyBytes));
  const ordinarySuccess = input.statusCode >= 200 && input.statusCode < 400 && !input.error;
  const removeBodies = input.captureBody === false || (pressure >= 0.7 && ordinarySuccess);
  const bodyCapturePolicy = resolveRecordBodyCapturePolicy(input);
  const admissionBodyCaptureMaxBytes = bodyCapturePolicy === "none" ||
    (pressure >= 0.7 && ordinarySuccess)
    ? 0
    : maxBodyBytes;
  const removeTrace = pressure >= 0.85 && ordinarySuccess;
  const suppressTraceBodyValues = (removeBodies || maxBodyBytes === 0) && input.routeTrace !== undefined;
  const compactedRequest = removeBodies
    ? { buffer: Buffer.alloc(0), compacted: false }
    : compactBase64ImagePayloads(input.requestBody);
  const requestBody = removeBodies
    ? Buffer.alloc(0)
    : boundedBuffer(compactedRequest.buffer, maxBodyBytes);
  const compactedResponse = removeBodies
    ? { compacted: false, text: "" }
    : compactBoundedText(input.responseBodyText ?? "", maxBodyBytes);
  const responseBodyText = compactedResponse.text;
  const responseBodySizeBytes = input.responseBodySizeBytes ?? Buffer.byteLength(input.responseBodyText ?? "");
  const responseBodyCapturedBytes = Buffer.byteLength(responseBodyText);
  return {
    bodyCaptureMaxBytes: admissionBodyCaptureMaxBytes,
    degraded: removeBodies || removeTrace || suppressTraceBodyValues || compactedRequest.compacted || compactedResponse.compacted ||
      requestBody.byteLength < compactedRequest.buffer.byteLength ||
      responseBodyCapturedBytes < responseBodySizeBytes,
    input: {
      ...input,
      bodyCapturePolicy,
      captureBody: !removeBodies,
      maxBodyBytes: admissionBodyCaptureMaxBytes,
      requestBody,
      requestBodySizeBytes: input.requestBodySizeBytes ?? input.requestBody.byteLength,
      requestBodyTruncated: removeBodies || compactedRequest.compacted || Boolean(input.requestBodyTruncated) ||
        requestBody.byteLength < compactedRequest.buffer.byteLength,
      requestHeaders: plainHeaderRecord(input.requestHeaders),
      routeTrace: removeTrace
        ? undefined
        : (suppressTraceBodyValues && input.routeTrace
            ? suppressRouteTraceBodyValues(input.routeTrace)
            : input.routeTrace),
      responseBodyText,
      responseBodySizeBytes,
      responseBodyTruncated: removeBodies || compactedResponse.compacted || Boolean(input.responseBodyTruncated) ||
        responseBodyCapturedBytes < responseBodySizeBytes,
      responseHeaders: plainHeaderRecord(input.responseHeaders)
    }
  };
}

function resolveRecordBodyCapturePolicy(
  input: RequestLogRecordInput
): "all" | "errors" | "none" {
  if (input.bodyCapturePolicy === "errors" || input.bodyCapturePolicy === "none") {
    return input.bodyCapturePolicy;
  }
  return input.bodyCapturePolicy === "all" || input.captureBody !== false ? "all" : "none";
}

function prepareRawTraceForQueue(
  input: RequestLogRawTraceUpdateInput,
  maxBodyBytes: number
): RequestLogRawTraceUpdateInput {
  const requestBody = input.requestBodyText === undefined
    ? undefined
    : compactBoundedText(input.requestBodyText, maxBodyBytes);
  const requestBodyText = requestBody?.text;
  const requestBodySizeBytes = input.requestBodySizeBytes ??
    (input.requestBodyText === undefined ? undefined : Buffer.byteLength(input.requestBodyText));
  const responseBody = input.responseBodyText === undefined
    ? undefined
    : compactBoundedText(input.responseBodyText, maxBodyBytes);
  const responseBodyText = responseBody?.text;
  const responseBodySizeBytes = input.responseBodySizeBytes ??
    (input.responseBodyText === undefined ? undefined : Buffer.byteLength(input.responseBodyText));
  return {
    ...input,
    ...(requestBodyText === undefined ? {} : {
      requestBodySizeBytes,
      requestBodyText,
      requestBodyTruncated: Boolean(input.requestBodyTruncated) || Boolean(requestBody?.compacted) ||
        Buffer.byteLength(requestBodyText) < (requestBodySizeBytes ?? 0)
    }),
    requestHeaders: plainHeaderRecord(input.requestHeaders),
    ...(responseBodyText === undefined ? {} : {
      responseBodySizeBytes,
      responseBodyText,
      responseBodyTruncated: Boolean(input.responseBodyTruncated) || Boolean(responseBody?.compacted) ||
        Buffer.byteLength(responseBodyText) < (responseBodySizeBytes ?? 0)
    }),
    responseHeaders: plainHeaderRecord(input.responseHeaders)
  };
}

function constrainRawTraceFiles(
  files: RequestLogRawTraceFiles | undefined,
  maxBodyBytes: number
): RequestLogRawTraceFiles | undefined {
  if (!files) return undefined;
  const {
    requestBody: _requestBody,
    responseBody: _responseBody,
    ...metadata
  } = files;
  return {
    ...metadata,
    maxBodyBytes,
    ...(maxBodyBytes > 0 && files.requestBody ? { requestBody: files.requestBody } : {}),
    ...(maxBodyBytes > 0 && files.responseBody ? { responseBody: files.responseBody } : {})
  };
}

export function suppressRequestLogRawTraceBodies(
  input: RequestLogRawTraceUpdateInput
): RequestLogRawTraceUpdateInput {
  const requestSize = input.requestBodySizeBytes ??
    (input.requestBodyText === undefined ? undefined : Buffer.byteLength(input.requestBodyText));
  const responseSize = input.responseBodySizeBytes ??
    (input.responseBodyText === undefined ? undefined : Buffer.byteLength(input.responseBodyText));
  return {
    ...input,
    ...(requestSize === undefined ? {} : {
      requestBodySizeBytes: requestSize,
      requestBodyText: "",
      requestBodyTruncated: Boolean(input.requestBodyTruncated) || requestSize > 0
    }),
    ...(responseSize === undefined ? {} : {
      responseBodySizeBytes: responseSize,
      responseBodyText: "",
      responseBodyTruncated: Boolean(input.responseBodyTruncated) || responseSize > 0
    })
  };
}

function boundedBuffer(value: Buffer, maxBytes: number): Buffer {
  return value.byteLength <= maxBytes ? value : Buffer.from(value.subarray(0, maxBytes));
}

function compactBoundedText(value: string, maxBytes: number): { compacted: boolean; text: string } {
  const compacted = compactBase64ImagePayloads(Buffer.from(value));
  const buffer = boundedBuffer(compacted.buffer, maxBytes);
  return {
    compacted: compacted.compacted,
    text: new StringDecoder("utf8").write(buffer)
  };
}

function plainHeaderRecord(value: Headers | Record<string, string | string[] | undefined> | undefined): Record<string, string | string[]> {
  if (!value) return {};
  const entries = typeof Headers !== "undefined" && value instanceof Headers
    ? [...value.entries()]
    : Object.entries(value).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined);
  return Object.fromEntries(entries.map(([key, headerValue]) => [
    key,
    isSensitiveRequestLogHeaderName(key) ? "[redacted]" : headerValue
  ]));
}

function estimateRecordBytes(input: RequestLogRecordInput): number {
  return input.requestBody.byteLength + Buffer.byteLength(input.responseBodyText ?? "") +
    jsonBytes(input.requestHeaders) + jsonBytes(input.responseHeaders) + jsonBytes(input.routeTrace) + 1_024;
}

function estimateRawTraceBytes(
  input: RequestLogRawTraceUpdateInput,
  rawTraceFiles?: RequestLogRawTraceFiles
): number {
  return Buffer.byteLength(input.requestBodyText ?? "") + Buffer.byteLength(input.responseBodyText ?? "") +
    jsonBytes(input.requestHeaders) + jsonBytes(input.responseHeaders) + jsonBytes(rawTraceFiles) + 512;
}

function rawTraceFileBytes(rawTraceFiles: RequestLogRawTraceFiles | undefined, maxBodyBytes: number): number {
  return Math.min(maxBodyBytes, Math.max(0, rawTraceFiles?.requestBody?.sizeBytes ?? 0)) +
    Math.min(maxBodyBytes, Math.max(0, rawTraceFiles?.responseBody?.sizeBytes ?? 0));
}

function jsonBytes(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

function withoutSize(command: QueuedCommand): RequestLogStoreWriteCommand {
  const {
    batchBytes: _batchBytes,
    isolated: _isolated,
    sizeBytes: _sizeBytes,
    writeAttempts: _writeAttempts,
    ...output
  } = command;
  return output;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function nonNegativeInteger(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function rpc<T>(
  worker: Worker,
  requests: Map<number, PendingRpc>,
  requestId: number,
  method: string,
  args: unknown[],
  metadata: Record<string, unknown> = {}
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requests.set(requestId, { reject, resolve: (value) => resolve(value as T) });
    worker.postMessage({ ...metadata, args, method, requestId, type: "request" });
  });
}

function settleRpc(requests: Map<number, PendingRpc>, message: WorkerResponse): void {
  if (message.type !== "response" || message.requestId === undefined) return;
  const pending = requests.get(message.requestId);
  if (!pending) return;
  requests.delete(message.requestId);
  if (message.error) pending.reject(new Error(message.error));
  else pending.resolve(message.result);
}

function rejectPending(requests: Map<number, PendingRpc>, error: Error): void {
  for (const pending of requests.values()) pending.reject(error);
  requests.clear();
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "") || undefined
    : undefined;
}

function isTransientSqliteLock(error: unknown): boolean {
  const code = errorCode(error);
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" ||
    (error instanceof Error && /database is (?:busy|locked)/i.test(error.message));
}

function formatRuntimeError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  while (!predicate()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return true;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Request log operation timed out after ${timeoutMs}ms.`)), timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
