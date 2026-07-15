/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, opendir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, join, resolve as pathResolve, sep as pathSep } from "node:path";
import type { AppConfig } from "@ccr/core/contracts/app";
import { RAW_TRACE_SPOOL_DIR } from "@ccr/core/config/constants";
import {
  enqueueGatewayRequestLogFromRawTrace,
  type RequestLogRawTraceFiles,
  type RequestLogRawTraceUpdateInput
} from "@ccr/core/observability/request-log-store";
import {
  suppressRequestLogRawTraceBodies,
  type RequestLogEnqueueResult
} from "@ccr/core/observability/request-log-runtime";
import { resolveRawTraceBodyLimit } from "@ccr/core/observability/request-log-limits";
import { isRecord, numberValue, stringValue } from "@ccr/core/gateway/internal/value";
import { formatError, parseJsonObject, readHeader, readRequestBody, sendJson } from "@ccr/core/gateway/http/io";
import { endpoint } from "@ccr/core/gateway/core-runtime/supervisor";
import { maxUsageCaptureBytes, rawTraceSyncHeader, rawTraceSyncPath } from "@ccr/core/gateway/internal/shared";
import type { RawTracePartText } from "@ccr/core/gateway/internal/shared";

type RawTraceSynchronizerDependencies = {
  enqueueUpdate?: (
    input: RequestLogRawTraceUpdateInput,
    files?: RequestLogRawTraceFiles
  ) => boolean | RequestLogEnqueueResult | Promise<boolean | RequestLogEnqueueResult>;
  bundleMaxAgeMs?: number;
  bundleMaxAttempts?: number;
  deadLetterMaxBundles?: number;
  deadLetterMaxBytes?: number;
  deadLetterRetentionMs?: number;
  getConfig: () => AppConfig | undefined;
  inboxMaxBundles?: number;
  inboxMaxBytes?: number;
  measureDirectorySize?: (directory: string) => Promise<number>;
  pendingRetryMaxMs?: number;
  replayIntervalMs?: number;
  replayMaxBundlesPerPass?: number;
  replayTimeBudgetMs?: number;
  retryCooldownMs?: number;
  sourceBundleGraceMs?: number;
  sourceScanIntervalMs?: number;
  spoolDirectory?: string;
  syncPartFile?: (filePath: string) => Promise<void>;
};

type RawTraceRequestLogBundle = {
  files: RequestLogRawTraceFiles;
  update: RequestLogRawTraceUpdateInput;
};

type StoredRawTraceBundle = {
  bundleId: string;
  delivery: RawTraceDeliveryState;
  directory: string;
  inspectionError?: string;
  manifest: Record<string, unknown>;
  sizeBytes: number;
};

type RawTraceInboxIndex = {
  bundles: Map<string, StoredRawTraceBundle>;
  bundleIdsByDirectory: Map<string, string>;
  totalBytes: number;
};

type RawTraceSourceObservation = {
  directory: string;
  firstSeenAt: number;
  kind: "source" | "staging";
  lastActivityAt: number;
  lastError: string;
  newestMtimeMs: number;
  scanGeneration: number;
  sizeBytes: number;
};

type RawTraceDirectorySnapshot = {
  newestMtimeMs: number;
  sizeBytes: number;
};

type RawTraceDeliveryState = {
  acceptedAt: number;
  attempts: number;
  deadLetterReason?: string;
  deadLetteredAt?: number;
  lastAttemptAt?: number;
  lastError?: string;
};

type RawTraceRetryState = {
  nextAttemptAt: number;
  pendingAttempts: number;
};

type RawTraceStorageLimits = {
  bundleMaxAgeMs: number;
  bundleMaxAttempts: number;
  deadLetterMaxBundles: number;
  deadLetterMaxBytes: number;
  deadLetterRetentionMs: number;
  inboxMaxBundles: number;
  inboxMaxBytes: number;
};

const rawTraceInboxDirectoryName = ".ccr-inbox";
const rawTraceDeadLetterDirectoryName = ".ccr-dead-letter";
const rawTraceStagingDirectoryName = ".ccr-staging";
const rawTraceDeliveryFileName = ".ccr-delivery.json";
const rawTraceReadyFileName = ".ccr-ready.json";
const defaultRawTraceReplayIntervalMs = 1_000;
const defaultRawTraceRetryCooldownMs = 5_000;
const defaultRawTracePendingRetryMaxMs = 5 * 60 * 1_000;
const defaultRawTraceReplayMaxBundlesPerPass = 100;
const defaultRawTraceReplayTimeBudgetMs = 25;
const defaultRawTraceInboxMaxBundles = 2_000;
const defaultRawTraceInboxMaxBytes = 2 * 1024 * 1024 * 1024;
const defaultRawTraceBundleMaxAgeMs = 48 * 60 * 60 * 1_000;
const defaultRawTraceBundleMaxAttempts = 20_000;
const defaultRawTraceDeadLetterMaxBundles = 500;
const defaultRawTraceDeadLetterMaxBytes = 512 * 1024 * 1024;
const defaultRawTraceDeadLetterRetentionMs = 7 * 24 * 60 * 60 * 1_000;
const defaultRawTraceSourceBundleGraceMs = 60_000;
const defaultRawTraceSourceScanIntervalMs = 5_000;
const rawTraceDeadLetterMaintenanceIntervalMs = 60_000;

export class RawTraceSynchronizer {
  readonly token = randomUUID();
  private deadLetterPruneDirty = false;
  private deadLetterPrunePromise?: Promise<void>;
  private inboxIndex?: RawTraceInboxIndex;
  private lastDeadLetterPrunedAt = 0;
  private lastSourceScanAt = 0;
  private readonly processingTasks = new Set<Promise<void>>();
  private replayCursor = 0;
  private replayPromise?: Promise<void>;
  private replayTimer?: NodeJS.Timeout;
  private readonly retryStates = new Map<string, RawTraceRetryState>();
  private started = false;
  private startupPromise?: Promise<void>;
  private storageReady = false;
  private sourceScanGeneration = 0;
  private readonly sourceObservations = new Map<string, RawTraceSourceObservation>();
  private storageMutation = Promise.resolve();

  constructor(private readonly dependencies: RawTraceSynchronizerDependencies) {}

  async start(): Promise<void> {
    const spoolDirectory = this.spoolDirectory();
    await Promise.all([
      mkdir(rawTraceInboxDirectory(spoolDirectory), { recursive: true }),
      mkdir(rawTraceDeadLetterDirectory(spoolDirectory), { recursive: true }),
      mkdir(rawTraceStagingDirectory(spoolDirectory), { recursive: true })
    ]);
    this.started = true;
    this.storageReady = false;
    if (this.replayTimer) clearInterval(this.replayTimer);
    this.replayTimer = setInterval(() => {
      if (this.storageReady) void this.replay();
      else this.scheduleStartupReplay();
    }, positiveInterval(this.dependencies.replayIntervalMs, defaultRawTraceReplayIntervalMs));
    this.replayTimer.unref?.();
    this.scheduleStartupReplay();
  }

  async stop(): Promise<void> {
    if (this.replayTimer) clearInterval(this.replayTimer);
    this.replayTimer = undefined;
    this.started = false;
    await this.startupPromise?.catch(() => undefined);
    await this.replayPromise?.catch(() => undefined);
    await Promise.allSettled(this.processingTasks);
    await this.waitForDeadLetterPrune();
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    if (readHeader(request.headers[rawTraceSyncHeader]) !== this.token) {
      sendJson(response, 401, { error: { message: "Unauthorized raw trace sync." } });
      return;
    }

    const manifest = parseJsonObject(await readRequestBody(request));
    const spoolDirectory = this.spoolDirectory();
    const config = this.dependencies.getConfig();
    if (!config || !shouldRecordRequestLogs(config)) {
      await cleanupRawTraceBundle(manifest, spoolDirectory);
      sendJson(response, 202, { accepted: true, ok: true, reason: "disabled" });
      return;
    }
    if (this.started && !this.storageReady) {
      sendJson(response, 503, { accepted: false, ok: false, reason: "initializing" });
      return;
    }
    let stored: StoredRawTraceBundle;
    try {
      stored = await persistRawTraceBundle(
        manifest,
        spoolDirectory,
        this.dependencies.syncPartFile,
        this.dependencies.measureDirectorySize
      );
    } catch (error) {
      console.warn(`[gateway] Failed to durably accept raw trace bundle: ${formatError(error)}`);
      sendJson(response, 503, { accepted: false, ok: false, reason: "spool_unavailable" });
      return;
    }
    let deadLettered = false;
    try {
      deadLettered = await this.registerStoredBundle(stored);
    } catch (error) {
      console.warn(`[gateway] Raw trace capacity enforcement deferred: ${formatError(error)}`);
    }

    // The producer may stop retrying after this response. Acknowledge only
    // after the bundle is owned by the durable inbox; database application is
    // replayed independently until the writer commits or rejects it terminally.
    sendJson(response, 202, {
      accepted: true,
      bundleId: stored.bundleId,
      ...(deadLettered ? { deadLetter: true, reason: "inbox_capacity" } : {}),
      durable: true,
      ok: true
    });
    if (deadLettered) return;
    const task = this.processStoredBundle(stored).then(() => undefined, (error) => {
      console.warn(`[gateway] Failed to apply durable raw trace ${stored.bundleId}: ${formatError(error)}`);
    }).finally(() => {
      this.processingTasks.delete(task);
    });
    this.processingTasks.add(task);
  }

  private spoolDirectory(): string {
    return this.dependencies.spoolDirectory ?? RAW_TRACE_SPOOL_DIR;
  }

  private storageLimits(): RawTraceStorageLimits {
    return {
      bundleMaxAgeMs: positiveInterval(this.dependencies.bundleMaxAgeMs, defaultRawTraceBundleMaxAgeMs),
      bundleMaxAttempts: positiveInterval(this.dependencies.bundleMaxAttempts, defaultRawTraceBundleMaxAttempts),
      deadLetterMaxBundles: positiveInterval(
        this.dependencies.deadLetterMaxBundles,
        defaultRawTraceDeadLetterMaxBundles
      ),
      deadLetterMaxBytes: positiveInterval(
        this.dependencies.deadLetterMaxBytes,
        defaultRawTraceDeadLetterMaxBytes
      ),
      deadLetterRetentionMs: positiveInterval(
        this.dependencies.deadLetterRetentionMs,
        defaultRawTraceDeadLetterRetentionMs
      ),
      inboxMaxBundles: positiveInterval(this.dependencies.inboxMaxBundles, defaultRawTraceInboxMaxBundles),
      inboxMaxBytes: positiveInterval(this.dependencies.inboxMaxBytes, defaultRawTraceInboxMaxBytes)
    };
  }

  private scheduleStartupReplay(): void {
    if (this.startupPromise || this.storageReady || !this.started) return;
    const startupPromise = (async () => {
      await this.reconcileStagingBundles();
      await this.refreshInboxIndex();
      this.storageReady = true;
      await this.replay();
    })().catch((error) => {
      console.warn(`[gateway] Failed to initialize raw trace spool: ${formatError(error)}`);
    }).finally(() => {
      if (this.startupPromise === startupPromise) this.startupPromise = undefined;
    });
    this.startupPromise = startupPromise;
  }

  private async replay(): Promise<void> {
    if (this.replayPromise) return await this.replayPromise;
    const replayPromise = this.replayStoredBundles().catch((error) => {
      console.warn(`[gateway] Failed to replay raw trace spool: ${formatError(error)}`);
    }).finally(() => {
      if (this.replayPromise === replayPromise) this.replayPromise = undefined;
    });
    this.replayPromise = replayPromise;
    await replayPromise;
  }

  private async replayStoredBundles(): Promise<void> {
    const spoolDirectory = this.spoolDirectory();
    await Promise.all([
      mkdir(rawTraceInboxDirectory(spoolDirectory), { recursive: true }),
      mkdir(rawTraceDeadLetterDirectory(spoolDirectory), { recursive: true }),
      mkdir(rawTraceStagingDirectory(spoolDirectory), { recursive: true })
    ]);
    const now = Date.now();
    await this.refreshInboxIndex();
    if (now - this.lastSourceScanAt >= positiveInterval(
      this.dependencies.sourceScanIntervalMs,
      defaultRawTraceSourceScanIntervalMs
    )) {
      await this.reconcileSourceBundles();
      this.lastSourceScanAt = now;
    }
    if (now - this.lastDeadLetterPrunedAt >= rawTraceDeadLetterMaintenanceIntervalMs) {
      this.scheduleDeadLetterPrune();
      await this.waitForDeadLetterPrune();
    }
    // Source reconciliation updates the in-memory index as it adopts bundles.
    // Avoid a second full inbox readdir on every replay pass.
    const storedBundles = [...(await this.ensureInboxIndex()).bundles.values()];
    const replayStartedAt = Date.now();
    const maxAttempts = positiveInterval(
      this.dependencies.replayMaxBundlesPerPass,
      defaultRawTraceReplayMaxBundlesPerPass
    );
    const timeBudgetMs = positiveInterval(
      this.dependencies.replayTimeBudgetMs,
      defaultRawTraceReplayTimeBudgetMs
    );
    const startIndex = storedBundles.length === 0 ? 0 : this.replayCursor % storedBundles.length;
    let attempted = 0;
    let visited = 0;
    while (visited < storedBundles.length && attempted < maxAttempts) {
      const stored = storedBundles[(startIndex + visited) % storedBundles.length];
      visited += 1;
      try {
        if (await this.processStoredBundle(stored)) attempted += 1;
      } catch (error) {
        console.warn(`[gateway] Failed to replay raw trace ${stored.bundleId}: ${formatError(error)}`);
      }
      if (Date.now() - replayStartedAt >= timeBudgetMs) break;
    }
    this.replayCursor = storedBundles.length === 0
      ? 0
      : (startIndex + visited) % storedBundles.length;
    const retainedBundleIds = new Set((await this.ensureInboxIndex()).bundles.keys());
    for (const bundleId of this.retryStates.keys()) {
      if (!retainedBundleIds.has(bundleId)) this.retryStates.delete(bundleId);
    }
  }

  private async processStoredBundle(stored: StoredRawTraceBundle): Promise<boolean> {
    const now = Date.now();
    const retryCooldownMs = positiveInterval(this.dependencies.retryCooldownMs, defaultRawTraceRetryCooldownMs);
    const retryState = this.retryStates.get(stored.bundleId) ?? {
      nextAttemptAt: 0,
      pendingAttempts: stored.delivery.lastError === "record_pending" ? 1 : 0
    };
    if (now < retryState.nextAttemptAt) return false;
    // Reserve the base cooldown before entering user/runtime code so an
    // overlapping replay cannot deliver this bundle concurrently.
    this.retryStates.set(stored.bundleId, {
      ...retryState,
      nextAttemptAt: now + retryCooldownMs
    });

    const limits = this.storageLimits();
    if (stored.delivery.attempts >= limits.bundleMaxAttempts ||
      now - stored.delivery.acceptedAt >= limits.bundleMaxAgeMs) {
      await this.deadLetterStoredBundle(
        stored,
        stored.delivery.attempts >= limits.bundleMaxAttempts ? "max_attempts" : "expired"
      );
      this.retryStates.delete(stored.bundleId);
      return true;
    }

    try {
      const config = this.dependencies.getConfig();
      if (!config || !shouldRecordRequestLogs(config)) {
        await this.cleanupStoredBundle(stored);
        this.retryStates.delete(stored.bundleId);
        return true;
      }
      if (stored.inspectionError) {
        throw new Error(stored.inspectionError);
      }
      const bundle = await readRawTraceRequestLogBundle(stored.manifest, this.spoolDirectory());
      if (!bundle) {
        await this.deadLetterStoredBundle(stored, "invalid_manifest");
        this.retryStates.delete(stored.bundleId);
        return true;
      }
      const policy = applyRawTraceRequestLogPolicy(config, bundle.update);
      const maxBodyBytes = resolveRawTraceBodyLimit(config.observability.requestLogMaxBodyBytes);
      const files = policy.bodyDisposition === "suppress"
        ? { cleanupDirectory: bundle.files.cleanupDirectory, maxBodyBytes }
        : { ...bundle.files, maxBodyBytes };
      const enqueueUpdate = this.dependencies.enqueueUpdate ?? enqueueGatewayRequestLogFromRawTrace;
      const enqueueResult = await enqueueUpdate(policy.update, files);
      const result: RequestLogEnqueueResult = typeof enqueueResult === "boolean"
        ? { accepted: enqueueResult, degraded: false, ...(enqueueResult ? {} : { reason: "queue_full" }) }
        : enqueueResult;
      if (!result.accepted && result.reason === "record_dropped") {
        await this.cleanupStoredBundle(stored);
        this.retryStates.delete(stored.bundleId);
      } else if (!result.accepted && result.reason === "record_pending") {
        const previousError = stored.delivery.lastError;
        const pendingAttempts = retryState.pendingAttempts + 1;
        stored.delivery = {
          ...stored.delivery,
          attempts: stored.delivery.attempts + 1,
          lastAttemptAt: now,
          lastError: "record_pending"
        };
        this.retryStates.set(stored.bundleId, {
          nextAttemptAt: now + pendingRetryDelayMs(
            retryCooldownMs,
            positiveInterval(this.dependencies.pendingRetryMaxMs, defaultRawTracePendingRetryMaxMs),
            pendingAttempts
          ),
          pendingAttempts
        });
        // Persist the transition once so restart diagnostics retain the reason,
        // but keep subsequent attempt counters in memory to avoid fsync on
        // every admission poll.
        if (previousError !== "record_pending") {
          await writeDurableDeliveryState(stored.directory, stored.delivery);
        }
      } else if (!result.accepted) {
        stored.delivery = {
          ...stored.delivery,
          attempts: stored.delivery.attempts + 1,
          lastAttemptAt: now,
          lastError: result.reason ?? "enqueue_rejected"
        };
        this.retryStates.set(stored.bundleId, {
          nextAttemptAt: now + retryCooldownMs,
          pendingAttempts: 0
        });
        await writeDurableDeliveryState(stored.directory, stored.delivery);
      } else {
        stored.delivery = {
          ...stored.delivery,
          attempts: stored.delivery.attempts + 1,
          lastAttemptAt: now,
          lastError: undefined
        };
        this.retryStates.set(stored.bundleId, {
          nextAttemptAt: now + retryCooldownMs,
          pendingAttempts: 0
        });
      }
      return true;
    } catch (error) {
      stored.delivery = {
        ...stored.delivery,
        attempts: stored.delivery.attempts + 1,
        lastAttemptAt: now,
        lastError: formatError(error)
      };
      this.retryStates.set(stored.bundleId, {
        nextAttemptAt: now + retryCooldownMs,
        pendingAttempts: 0
      });
      await writeDurableDeliveryState(stored.directory, stored.delivery).catch(() => undefined);
      throw error;
    }
  }

  private async registerStoredBundle(stored: StoredRawTraceBundle): Promise<boolean> {
    return await this.withStorageMutation(async () => {
      const index = await this.ensureInboxIndex();
      const existing = index.bundles.get(stored.bundleId);
      if (existing) {
        index.totalBytes = Math.max(0, index.totalBytes - existing.sizeBytes + stored.sizeBytes);
        if (existing.directory !== stored.directory) {
          index.bundleIdsByDirectory.delete(existing.directory);
        }
        index.bundles.set(stored.bundleId, stored);
        index.bundleIdsByDirectory.set(stored.directory, stored.bundleId);
      } else {
        index.bundles.set(stored.bundleId, stored);
        index.bundleIdsByDirectory.set(stored.directory, stored.bundleId);
        index.totalBytes += stored.sizeBytes;
      }
      const limits = this.storageLimits();
      if (index.bundles.size <= limits.inboxMaxBundles && index.totalBytes <= limits.inboxMaxBytes) {
        return false;
      }
      // Reject the newly admitted bundle instead of scanning or moving the
      // whole backlog on the producer's ACK path.
      await moveRawTraceBundleToDeadLetter(stored, this.spoolDirectory(), "inbox_capacity");
      this.removeIndexedBundle(index, stored);
      this.scheduleDeadLetterPrune();
      return true;
    });
  }

  private async refreshInboxIndex(): Promise<StoredRawTraceBundle[]> {
    return await this.withStorageMutation(async () => {
      const index = await this.ensureInboxIndex();
      const inboxDirectory = rawTraceInboxDirectory(this.spoolDirectory());
      const entries = await readdir(inboxDirectory, { withFileTypes: true }).catch((error) => {
        if (nodeErrorCode(error) === "ENOENT") return [];
        throw error;
      });
      const presentDirectories = new Set<string>();
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const directory = join(inboxDirectory, entry.name);
        presentDirectories.add(directory);
        if (index.bundleIdsByDirectory.has(directory)) continue;
        const stored = await readStoredRawTraceBundle(
          directory,
          entry.name,
          this.dependencies.measureDirectorySize
        );
        index.bundles.set(stored.bundleId, stored);
        index.bundleIdsByDirectory.set(directory, stored.bundleId);
        index.totalBytes += stored.sizeBytes;
      }
      for (const [directory, bundleId] of index.bundleIdsByDirectory) {
        if (presentDirectories.has(directory)) continue;
        const stored = index.bundles.get(bundleId);
        if (stored) index.totalBytes = Math.max(0, index.totalBytes - stored.sizeBytes);
        index.bundleIdsByDirectory.delete(directory);
        index.bundles.delete(bundleId);
      }
      await this.enforceIndexedInboxLimits(index);
      return [...index.bundles.values()];
    });
  }

  private async ensureInboxIndex(): Promise<RawTraceInboxIndex> {
    if (this.inboxIndex) return this.inboxIndex;
    const bundles = (await listStoredRawTraceBundles(
      this.spoolDirectory(),
      this.dependencies.measureDirectorySize
    ))
      .sort((left, right) => left.delivery.acceptedAt - right.delivery.acceptedAt);
    const index: RawTraceInboxIndex = {
      bundles: new Map(),
      bundleIdsByDirectory: new Map(),
      totalBytes: 0
    };
    for (const bundle of bundles) {
      index.bundles.set(bundle.bundleId, bundle);
      index.bundleIdsByDirectory.set(bundle.directory, bundle.bundleId);
      index.totalBytes += bundle.sizeBytes;
    }
    this.inboxIndex = index;
    return index;
  }

  private async reconcileStagingBundles(): Promise<void> {
    for await (const directory of iterateRawTraceStagingDirectories(this.spoolDirectory())) {
      if (!await pathExists(join(directory, rawTraceReadyFileName))) continue;
      try {
        await publishStagedRawTraceBundle(
          directory,
          this.spoolDirectory(),
          this.dependencies.syncPartFile,
          this.dependencies.measureDirectorySize
        );
      } catch (error) {
        console.warn(`[gateway] Failed to publish recovered raw trace staging ${directory}: ${formatError(error)}`);
      }
    }
  }

  private async enforceIndexedInboxLimits(index: RawTraceInboxIndex): Promise<void> {
    const limits = this.storageLimits();
    while (index.bundles.size > limits.inboxMaxBundles || index.totalBytes > limits.inboxMaxBytes) {
      const oldest = index.bundles.values().next().value as StoredRawTraceBundle | undefined;
      if (!oldest) return;
      try {
        await moveRawTraceBundleToDeadLetter(oldest, this.spoolDirectory(), "inbox_capacity");
        this.removeIndexedBundle(index, oldest);
        this.scheduleDeadLetterPrune();
      } catch (error) {
        console.warn(`[gateway] Failed to dead-letter raw trace ${oldest.bundleId}: ${formatError(error)}`);
        return;
      }
    }
  }

  private async reconcileSourceBundles(): Promise<void> {
    const scanGeneration = ++this.sourceScanGeneration;
    for await (const directory of iterateRawTraceSourceDirectories(this.spoolDirectory())) {
      try {
        const manifest = await readManifestFile(directory);
        if (!manifest) {
          await this.observeIncompleteSource(directory, "source", "missing_or_invalid_manifest", scanGeneration);
          if (this.sourceObservations.size > this.storageLimits().inboxMaxBundles) {
            await this.expireIncompleteSources();
          }
          continue;
        }
        const stored = await persistRawTraceBundle(
          manifest,
          this.spoolDirectory(),
          this.dependencies.syncPartFile,
          this.dependencies.measureDirectorySize
        );
        this.sourceObservations.delete(directory);
        await this.registerStoredBundle(stored);
      } catch (error) {
        console.warn(`[gateway] Failed to adopt raw trace spool ${directory}: ${formatError(error)}`);
        await this.observeIncompleteSource(directory, "source", formatError(error), scanGeneration);
        if (this.sourceObservations.size > this.storageLimits().inboxMaxBundles) {
          await this.expireIncompleteSources();
        }
      }
    }
    for await (const directory of iterateRawTraceStagingDirectories(this.spoolDirectory())) {
      try {
        if (await pathExists(join(directory, rawTraceReadyFileName))) {
          const stored = await publishStagedRawTraceBundle(
            directory,
            this.spoolDirectory(),
            this.dependencies.syncPartFile,
            this.dependencies.measureDirectorySize
          );
          this.sourceObservations.delete(directory);
          await this.registerStoredBundle(stored);
          continue;
        }
        await this.observeIncompleteSource(directory, "staging", "incomplete_staging", scanGeneration);
      } catch (error) {
        console.warn(`[gateway] Failed to recover raw trace staging ${directory}: ${formatError(error)}`);
        await this.observeIncompleteSource(directory, "staging", formatError(error), scanGeneration);
      }
    }
    for (const [directory, observation] of this.sourceObservations) {
      if (observation.scanGeneration !== scanGeneration) this.sourceObservations.delete(directory);
    }
    await this.expireIncompleteSources();
  }

  private async observeIncompleteSource(
    directory: string,
    kind: "source" | "staging",
    lastError: string,
    scanGeneration: number
  ): Promise<void> {
    const snapshot = await rawTraceDirectorySnapshot(directory).catch(() => ({
      newestMtimeMs: Date.now(),
      sizeBytes: this.storageLimits().inboxMaxBytes + 1
    }));
    const now = Date.now();
    const existing = this.sourceObservations.get(directory);
    if (existing) {
      if (existing.sizeBytes !== snapshot.sizeBytes || existing.newestMtimeMs !== snapshot.newestMtimeMs) {
        existing.lastActivityAt = now;
      }
      existing.kind = kind;
      existing.lastError = lastError;
      existing.newestMtimeMs = snapshot.newestMtimeMs;
      existing.scanGeneration = scanGeneration;
      existing.sizeBytes = snapshot.sizeBytes;
      return;
    }
    const observedActivityAt = snapshot.newestMtimeMs > 0
      ? Math.min(now, snapshot.newestMtimeMs)
      : now;
    this.sourceObservations.set(directory, {
      directory,
      firstSeenAt: observedActivityAt,
      kind,
      lastActivityAt: observedActivityAt,
      lastError,
      newestMtimeMs: snapshot.newestMtimeMs,
      scanGeneration,
      sizeBytes: snapshot.sizeBytes
    });
  }

  private async expireIncompleteSources(): Promise<void> {
    await this.withStorageMutation(async () => {
      const index = await this.ensureInboxIndex();
      const limits = this.storageLimits();
      const observations = [...this.sourceObservations.values()]
        .sort((left, right) => left.firstSeenAt - right.firstSeenAt);
      let sourceBytes = observations.reduce((total, observation) => total + observation.sizeBytes, 0);
      let sourceBundles = observations.length;
      const graceMs = positiveInterval(
        this.dependencies.sourceBundleGraceMs,
        defaultRawTraceSourceBundleGraceMs
      );
      for (const observation of observations) {
        const overCapacity = index.bundles.size + sourceBundles > limits.inboxMaxBundles ||
          index.totalBytes + sourceBytes > limits.inboxMaxBytes;
        // Capacity pressure must never classify a producer that is still
        // appending to a stream as abandoned. Reclaim only after a full quiet
        // period measured from file activity, not the directory mtime.
        if (Date.now() - observation.lastActivityAt < graceMs) continue;
        if (observation.kind === "staging") {
          try {
            const stored = await publishStagedRawTraceBundle(
              observation.directory,
              this.spoolDirectory(),
              this.dependencies.syncPartFile,
              this.dependencies.measureDirectorySize
            );
            this.sourceObservations.delete(observation.directory);
            sourceBundles -= 1;
            sourceBytes = Math.max(0, sourceBytes - observation.sizeBytes);
            const indexed = index.bundles.get(stored.bundleId);
            if (indexed) {
              index.totalBytes = Math.max(0, index.totalBytes - indexed.sizeBytes);
              index.bundleIdsByDirectory.delete(indexed.directory);
            }
            index.bundles.set(stored.bundleId, stored);
            index.bundleIdsByDirectory.set(stored.directory, stored.bundleId);
            index.totalBytes += stored.sizeBytes;
            continue;
          } catch (error) {
            observation.lastError = formatError(error);
          }
        }
        const stored: StoredRawTraceBundle = {
          bundleId: `incomplete-${createHash("sha256").update(observation.directory).digest("hex")}`,
          delivery: {
            acceptedAt: observation.firstSeenAt,
            attempts: 0,
            lastError: observation.lastError
          },
          directory: observation.directory,
          inspectionError: observation.lastError,
          manifest: { parts: [] },
          sizeBytes: observation.sizeBytes
        };
        try {
          await moveRawTraceBundleToDeadLetter(
            stored,
            this.spoolDirectory(),
            overCapacity ? "source_capacity" : "incomplete_source"
          );
          this.sourceObservations.delete(observation.directory);
          sourceBundles -= 1;
          sourceBytes = Math.max(0, sourceBytes - observation.sizeBytes);
          this.scheduleDeadLetterPrune();
        } catch (error) {
          console.warn(`[gateway] Failed to isolate incomplete raw trace ${observation.directory}: ${formatError(error)}`);
        }
      }
    });
  }

  private async deadLetterStoredBundle(stored: StoredRawTraceBundle, reason: string): Promise<void> {
    await this.withStorageMutation(async () => {
      await moveRawTraceBundleToDeadLetter(stored, this.spoolDirectory(), reason);
      if (this.inboxIndex) this.removeIndexedBundle(this.inboxIndex, stored);
    });
    this.scheduleDeadLetterPrune();
  }

  private async cleanupStoredBundle(stored: StoredRawTraceBundle): Promise<void> {
    await cleanupStoredRawTraceBundle(stored.directory);
    await this.withStorageMutation(async () => {
      if (this.inboxIndex) this.removeIndexedBundle(this.inboxIndex, stored);
    });
  }

  private removeIndexedBundle(index: RawTraceInboxIndex, stored: StoredRawTraceBundle): void {
    const indexed = index.bundles.get(stored.bundleId);
    if (!indexed) return;
    index.totalBytes = Math.max(0, index.totalBytes - indexed.sizeBytes);
    index.bundles.delete(stored.bundleId);
    index.bundleIdsByDirectory.delete(indexed.directory);
  }

  private scheduleDeadLetterPrune(): void {
    this.deadLetterPruneDirty = true;
    if (this.deadLetterPrunePromise) return;
    this.deadLetterPrunePromise = (async () => {
      while (this.deadLetterPruneDirty) {
        this.deadLetterPruneDirty = false;
        await pruneRawTraceDeadLetters(this.spoolDirectory(), this.storageLimits());
        this.lastDeadLetterPrunedAt = Date.now();
      }
    })().catch((error) => {
      console.warn(`[gateway] Raw trace dead-letter pruning deferred: ${formatError(error)}`);
    }).finally(() => {
      this.deadLetterPrunePromise = undefined;
      if (this.deadLetterPruneDirty) this.scheduleDeadLetterPrune();
    });
  }

  private async waitForDeadLetterPrune(): Promise<void> {
    while (this.deadLetterPrunePromise) {
      await this.deadLetterPrunePromise.catch(() => undefined);
    }
  }

  private async withStorageMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.storageMutation;
    let release = () => {};
    this.storageMutation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

async function persistRawTraceBundle(
  manifest: Record<string, unknown>,
  spoolDirectory: string,
  syncPartFile?: (filePath: string) => Promise<void>,
  measureDirectorySize: (directory: string) => Promise<number> = directorySize
): Promise<StoredRawTraceBundle> {
  const parts = rawTraceManifestParts(manifest);
  const sourceDirectory = rawTraceBundleDirectory(parts, spoolDirectory);
  if (!sourceDirectory || parts.length === 0) {
    throw new Error("Raw trace manifest does not reference a valid spool bundle.");
  }
  const resolvedSourceDirectory = pathResolve(sourceDirectory);
  for (const part of parts) {
    const filePath = stringValue(part.filePath);
    if (filePath && pathResolve(dirname(filePath)) !== resolvedSourceDirectory) {
      throw new Error("Raw trace manifest parts must belong to one spool bundle.");
    }
  }

  const bundleId = stringValue(manifest.requestId) ??
    `legacy-${createHash("sha256").update(resolvedSourceDirectory).digest("hex")}`;
  const inboxDirectory = rawTraceInboxDirectory(spoolDirectory);
  const stagingDirectory = rawTraceStagingDirectory(spoolDirectory);
  const destinationDirectory = join(
    inboxDirectory,
    createHash("sha256").update(bundleId).digest("hex")
  );
  await Promise.all([
    mkdir(inboxDirectory, { recursive: true }),
    mkdir(stagingDirectory, { recursive: true })
  ]);

  if (await pathExists(destinationDirectory)) {
    const existing = await readCompleteStoredRawTraceBundle(
      destinationDirectory,
      bundleId,
      measureDirectorySize
    );
    if (pathResolve(destinationDirectory) !== resolvedSourceDirectory) {
      await rm(resolvedSourceDirectory, { force: true, recursive: true });
      await syncDirectory(dirname(resolvedSourceDirectory));
    }
    return existing;
  }

  if (pathResolve(destinationDirectory) === resolvedSourceDirectory) {
    return await readCompleteStoredRawTraceBundle(destinationDirectory, bundleId, measureDirectorySize);
  }

  const stagedDirectory = join(
    stagingDirectory,
    `${createHash("sha256").update(bundleId).digest("hex")}-${randomUUID()}`
  );
  // Persist the producer-supplied manifest before moving ownership. If the
  // process dies immediately after the rename, startup can still finish the
  // staged publication instead of leaving an unidentifiable directory.
  await writeDurableManifest(
    resolvedSourceDirectory,
    normalizeStoredRawTraceManifest(manifest, resolvedSourceDirectory, bundleId)
  );
  await rename(resolvedSourceDirectory, stagedDirectory);
  await Promise.all([
    syncDirectory(dirname(resolvedSourceDirectory)),
    syncDirectory(stagingDirectory)
  ]);
  try {
    return await publishStagedRawTraceBundle(
      stagedDirectory,
      spoolDirectory,
      syncPartFile,
      measureDirectorySize,
      manifest,
      bundleId
    );
  } catch (error) {
    // Before the durable ACK the producer still owns retry semantics. Restore
    // its source path when possible so a transient fsync failure does not turn
    // the retry into a permanently missing bundle.
    if (await pathExists(stagedDirectory) && !await pathExists(resolvedSourceDirectory)) {
      await rename(stagedDirectory, resolvedSourceDirectory).catch(() => undefined);
      await Promise.all([
        syncDirectory(dirname(resolvedSourceDirectory)),
        syncDirectory(stagingDirectory)
      ]).catch(() => undefined);
    }
    throw error;
  }
}

async function publishStagedRawTraceBundle(
  stagedDirectory: string,
  spoolDirectory: string,
  syncPartFile?: (filePath: string) => Promise<void>,
  measureDirectorySize: (directory: string) => Promise<number> = directorySize,
  suppliedManifest?: Record<string, unknown>,
  suppliedBundleId?: string
): Promise<StoredRawTraceBundle> {
  const manifest = suppliedManifest ?? await readManifestFile(stagedDirectory);
  if (!manifest) throw new Error("Raw trace staging entry has no valid manifest.");
  const bundleId = suppliedBundleId ?? stringValue(manifest.requestId);
  if (!bundleId) throw new Error("Raw trace staging entry has no request ID.");
  const inboxDirectory = rawTraceInboxDirectory(spoolDirectory);
  const stagingDirectory = rawTraceStagingDirectory(spoolDirectory);
  const destinationDirectory = join(
    inboxDirectory,
    createHash("sha256").update(bundleId).digest("hex")
  );
  await Promise.all([
    mkdir(inboxDirectory, { recursive: true }),
    mkdir(stagingDirectory, { recursive: true })
  ]);

  if (await pathExists(destinationDirectory)) {
    const existing = await readCompleteStoredRawTraceBundle(
      destinationDirectory,
      bundleId,
      measureDirectorySize
    );
    if (pathResolve(stagedDirectory) !== pathResolve(destinationDirectory)) {
      await rm(stagedDirectory, { force: true, recursive: true });
      await syncDirectory(stagingDirectory);
    }
    return existing;
  }

  const stagedManifest = normalizeStoredRawTraceManifest(manifest, stagedDirectory, bundleId);
  await syncRawTracePartFiles(stagedManifest, stagedDirectory, syncPartFile);
  const publishedManifest = normalizeStoredRawTraceManifest(manifest, destinationDirectory, bundleId);
  await writeDurableManifest(stagedDirectory, publishedManifest);
  const delivery = await ensureRawTraceDeliveryState(stagedDirectory, publishedManifest);
  await writeDurableJsonFile(stagedDirectory, rawTraceReadyFileName, {
    bundleId,
    readyAt: Date.now()
  });

  try {
    await rename(stagedDirectory, destinationDirectory);
  } catch (error) {
    // Another replay/producer may win the same atomic publication. A complete
    // destination is authoritative regardless of the platform-specific rename
    // error (EEXIST, ENOTEMPTY, or ENOENT after the peer moved our staging).
    if (!await pathExists(destinationDirectory)) throw error;
    const existing = await readCompleteStoredRawTraceBundle(
      destinationDirectory,
      bundleId,
      measureDirectorySize
    );
    await rm(stagedDirectory, { force: true, recursive: true });
    await syncDirectory(stagingDirectory);
    return existing;
  }
  await Promise.all([syncDirectory(stagingDirectory), syncDirectory(inboxDirectory)]);
  return {
    bundleId,
    delivery,
    directory: destinationDirectory,
    manifest: publishedManifest,
    sizeBytes: await measureDirectorySize(destinationDirectory)
  };
}

async function readCompleteStoredRawTraceBundle(
  directory: string,
  bundleId: string,
  measureDirectorySize: (directory: string) => Promise<number>
): Promise<StoredRawTraceBundle> {
  const existingManifest = await readManifestFile(directory);
  if (!existingManifest || !await pathExists(join(directory, rawTraceDeliveryFileName))) {
    throw new Error(`Durable raw trace inbox entry is incomplete for ${bundleId}.`);
  }
  const normalizedManifest = normalizeStoredRawTraceManifest(existingManifest, directory, bundleId);
  return {
    bundleId,
    delivery: await readRawTraceDeliveryState(directory, normalizedManifest),
    directory,
    manifest: normalizedManifest,
    sizeBytes: await measureDirectorySize(directory)
  };
}

function normalizeStoredRawTraceManifest(
  manifest: Record<string, unknown>,
  directory: string,
  bundleId: string
): Record<string, unknown> {
  const parts = rawTraceManifestParts(manifest).map((part) => {
    const filePath = stringValue(part.filePath);
    return filePath ? { ...part, filePath: join(directory, basename(filePath)) } : part;
  });
  return {
    ...manifest,
    requestId: bundleId,
    parts
  };
}

async function writeDurableManifest(
  directory: string,
  manifest: Record<string, unknown>
): Promise<void> {
  await writeDurableJsonFile(directory, "manifest.json", manifest);
}

async function writeDurableDeliveryState(
  directory: string,
  delivery: RawTraceDeliveryState
): Promise<void> {
  await writeDurableJsonFile(directory, rawTraceDeliveryFileName, delivery);
}

async function writeDurableJsonFile(
  directory: string,
  fileName: string,
  value: unknown
): Promise<void> {
  const filePath = join(directory, fileName);
  const temporaryPath = join(directory, `.${fileName}-${randomUUID()}.tmp`);
  await writeFile(temporaryPath, JSON.stringify(value));
  const temporaryFile = await open(temporaryPath, "r");
  try {
    await temporaryFile.sync();
  } finally {
    await temporaryFile.close();
  }
  await rename(temporaryPath, filePath);
  await syncDirectory(directory);
}

async function syncRawTracePartFiles(
  manifest: Record<string, unknown>,
  directory: string,
  syncPartFile?: (filePath: string) => Promise<void>
): Promise<void> {
  for (const part of rawTraceManifestParts(manifest)) {
    const filePath = stringValue(part.filePath);
    if (!filePath) continue;
    if (pathResolve(dirname(filePath)) !== pathResolve(directory)) {
      throw new Error(`Raw trace part is outside its durable bundle: ${filePath}`);
    }
    const fileStat = await stat(filePath);
    const expectedStoredBytes = numberValue(part.storedBytes);
    if (expectedStoredBytes !== undefined && fileStat.size < expectedStoredBytes) {
      throw new Error(`Raw trace part is shorter than its manifest: ${filePath}`);
    }
    if (syncPartFile) await syncPartFile(filePath);
    else {
      const handle = await open(filePath, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
  }
  await syncDirectory(directory);
}

async function ensureRawTraceDeliveryState(
  directory: string,
  manifest: Record<string, unknown>
): Promise<RawTraceDeliveryState> {
  const existing = await readRawTraceDeliveryState(directory, manifest);
  if (await pathExists(join(directory, rawTraceDeliveryFileName))) return existing;
  await writeDurableDeliveryState(directory, existing);
  return existing;
}

async function readRawTraceDeliveryState(
  directory: string,
  manifest: Record<string, unknown>
): Promise<RawTraceDeliveryState> {
  try {
    const parsed = JSON.parse(await readFile(join(directory, rawTraceDeliveryFileName), "utf8")) as unknown;
    if (isRecord(parsed)) {
      return {
        acceptedAt: positiveTimestamp(parsed.acceptedAt) ?? manifestTimestamp(manifest) ?? Date.now(),
        attempts: Math.max(0, Math.floor(numberValue(parsed.attempts) ?? 0)),
        ...(stringValue(parsed.deadLetterReason) ? { deadLetterReason: stringValue(parsed.deadLetterReason) } : {}),
        ...(positiveTimestamp(parsed.deadLetteredAt) ? { deadLetteredAt: positiveTimestamp(parsed.deadLetteredAt) } : {}),
        ...(positiveTimestamp(parsed.lastAttemptAt) ? { lastAttemptAt: positiveTimestamp(parsed.lastAttemptAt) } : {}),
        ...(stringValue(parsed.lastError) ? { lastError: stringValue(parsed.lastError) } : {})
      };
    }
  } catch (error) {
    if (nodeErrorCode(error) !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  return {
    acceptedAt: manifestTimestamp(manifest) ?? Date.now(),
    attempts: 0
  };
}

async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    const code = nodeErrorCode(error);
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EISDIR") throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function* iterateRawTraceSourceDirectories(spoolDirectory: string): AsyncGenerator<string> {
  let directory;
  try {
    directory = await opendir(spoolDirectory);
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return;
    throw error;
  }
  for await (const entry of directory) {
    if (entry.isDirectory() &&
      entry.name !== rawTraceInboxDirectoryName &&
      entry.name !== rawTraceDeadLetterDirectoryName &&
      entry.name !== rawTraceStagingDirectoryName) {
      yield join(spoolDirectory, entry.name);
    }
  }
}

async function* iterateRawTraceStagingDirectories(spoolDirectory: string): AsyncGenerator<string> {
  const stagingDirectory = rawTraceStagingDirectory(spoolDirectory);
  let directory;
  try {
    directory = await opendir(stagingDirectory);
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return;
    throw error;
  }
  for await (const entry of directory) {
    if (entry.isDirectory()) yield join(stagingDirectory, entry.name);
  }
}

async function listStoredRawTraceBundles(
  spoolDirectory: string,
  measureDirectorySize?: (directory: string) => Promise<number>
): Promise<StoredRawTraceBundle[]> {
  const inboxDirectory = rawTraceInboxDirectory(spoolDirectory);
  let entries;
  try {
    entries = await readdir(inboxDirectory, { withFileTypes: true });
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return [];
    throw error;
  }
  const bundles: StoredRawTraceBundle[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = join(inboxDirectory, entry.name);
    bundles.push(await readStoredRawTraceBundle(directory, entry.name, measureDirectorySize));
  }
  return bundles;
}

async function readStoredRawTraceBundle(
  directory: string,
  fallbackBundleId: string,
  measureDirectorySize: (directory: string) => Promise<number> = directorySize
): Promise<StoredRawTraceBundle> {
  const sizeBytes = await measureDirectorySize(directory).catch(() => defaultRawTraceInboxMaxBytes + 1);
  try {
    const manifest = await readManifestFile(directory) ?? { parts: [], requestId: fallbackBundleId };
    const bundleId = stringValue(manifest.requestId) ?? fallbackBundleId;
    const normalizedManifest = normalizeStoredRawTraceManifest(manifest, directory, bundleId);
    return {
      bundleId,
      delivery: await readRawTraceDeliveryState(directory, normalizedManifest),
      directory,
      manifest: normalizedManifest,
      sizeBytes
    };
  } catch (error) {
    const inspectionError = `Failed to inspect durable raw trace bundle: ${formatError(error)}`;
    console.warn(`[gateway] ${inspectionError} (${directory})`);
    const fallbackManifest = { parts: [], requestId: fallbackBundleId };
    const delivery = await readRawTraceDeliveryState(directory, fallbackManifest).catch(async () => ({
      acceptedAt: await stat(directory).then((value) => value.mtimeMs).catch(() => Date.now()),
      attempts: 0,
      lastError: inspectionError
    }));
    return {
      bundleId: fallbackBundleId,
      delivery,
      directory,
      inspectionError,
      manifest: fallbackManifest,
      sizeBytes
    };
  }
}

async function readManifestFile(directory: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function cleanupStoredRawTraceBundle(directory: string): Promise<void> {
  await rm(directory, { force: true, recursive: true });
}

function rawTraceInboxDirectory(spoolDirectory: string): string {
  return join(spoolDirectory, rawTraceInboxDirectoryName);
}

function rawTraceDeadLetterDirectory(spoolDirectory: string): string {
  return join(spoolDirectory, rawTraceDeadLetterDirectoryName);
}

function rawTraceStagingDirectory(spoolDirectory: string): string {
  return join(spoolDirectory, rawTraceStagingDirectoryName);
}

async function moveRawTraceBundleToDeadLetter(
  stored: StoredRawTraceBundle,
  spoolDirectory: string,
  reason: string
): Promise<void> {
  if (!await pathExists(stored.directory)) return;
  const deadLetterDirectory = rawTraceDeadLetterDirectory(spoolDirectory);
  await mkdir(deadLetterDirectory, { recursive: true });
  stored.delivery = {
    ...stored.delivery,
    deadLetterReason: reason,
    deadLetteredAt: Date.now(),
    lastError: stored.delivery.lastError ?? reason
  };
  await writeDurableDeliveryState(stored.directory, stored.delivery).catch((error) => {
    // Delivery metadata is diagnostic. A persistent file error must not keep
    // an otherwise movable bundle in the active retry inbox forever.
    console.warn(`[gateway] Failed to persist raw trace dead-letter reason for ${stored.bundleId}: ${formatError(error)}`);
  });
  const destination = join(deadLetterDirectory, basename(stored.directory));
  if (await pathExists(destination)) await rm(destination, { force: true, recursive: true });
  await rename(stored.directory, destination);
  await Promise.all([
    syncDirectory(dirname(stored.directory)),
    syncDirectory(deadLetterDirectory)
  ]);
}

async function pruneRawTraceDeadLetters(
  spoolDirectory: string,
  limits: RawTraceStorageLimits
): Promise<void> {
  const directory = rawTraceDeadLetterDirectory(spoolDirectory);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return;
    throw error;
  }
  const now = Date.now();
  const retained: Array<{ directory: string; recordedAt: number; size: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const bundleDirectory = join(directory, entry.name);
    let recordedAt = await stat(bundleDirectory).then((value) => value.mtimeMs).catch(() => 0);
    try {
      const manifest = await readManifestFile(bundleDirectory) ?? {};
      const delivery = await readRawTraceDeliveryState(bundleDirectory, manifest);
      const deliveryRecordedAt = delivery.deadLetteredAt ?? delivery.acceptedAt;
      recordedAt = recordedAt > 0 ? Math.min(recordedAt, deliveryRecordedAt) : deliveryRecordedAt;
    } catch (error) {
      console.warn(`[gateway] Failed to inspect raw trace dead letter ${bundleDirectory}: ${formatError(error)}`);
    }
    if (recordedAt === 0 || now - recordedAt >= limits.deadLetterRetentionMs) {
      try {
        await rm(bundleDirectory, { force: true, recursive: true });
        continue;
      } catch (error) {
        console.warn(`[gateway] Failed to expire raw trace dead letter ${bundleDirectory}: ${formatError(error)}`);
      }
    }
    // Keep unreadable entries in the accounting set. Using an over-budget
    // fallback size makes the pruning pass try to delete them first.
    retained.push({
      directory: bundleDirectory,
      recordedAt,
      size: await directorySize(bundleDirectory).catch(() => limits.deadLetterMaxBytes + 1)
    });
  }
  let totalBytes = retained.reduce((total, entry) => total + entry.size, 0);
  let totalBundles = retained.length;
  for (const entry of retained.sort((left, right) => left.recordedAt - right.recordedAt)) {
    if (totalBundles <= limits.deadLetterMaxBundles && totalBytes <= limits.deadLetterMaxBytes) break;
    try {
      await rm(entry.directory, { force: true, recursive: true });
      totalBundles -= 1;
      totalBytes = Math.max(0, totalBytes - entry.size);
    } catch (error) {
      console.warn(`[gateway] Failed to prune raw trace dead letter ${entry.directory}: ${formatError(error)}`);
    }
  }
  await syncDirectory(directory).catch((error) => {
    console.warn(`[gateway] Failed to sync raw trace dead-letter directory: ${formatError(error)}`);
  });
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(filePath);
    else if (entry.isFile()) total += (await stat(filePath)).size;
  }
  return total;
}

async function rawTraceDirectorySnapshot(directory: string): Promise<RawTraceDirectorySnapshot> {
  let newestMtimeMs = 0;
  let sizeBytes = 0;
  const directoryStat = await stat(directory);
  newestMtimeMs = directoryStat.mtimeMs;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await rawTraceDirectorySnapshot(filePath);
      newestMtimeMs = Math.max(newestMtimeMs, nested.newestMtimeMs);
      sizeBytes += nested.sizeBytes;
    } else if (entry.isFile()) {
      const fileStat = await stat(filePath);
      newestMtimeMs = Math.max(newestMtimeMs, fileStat.mtimeMs);
      sizeBytes += fileStat.size;
    }
  }
  return { newestMtimeMs, sizeBytes };
}

function manifestTimestamp(manifest: Record<string, unknown>): number | undefined {
  const parsed = Date.parse(stringValue(manifest.uploadedAt) ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveTimestamp(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function rawTraceManifestParts(manifest: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "") || undefined
    : undefined;
}

function positiveInterval(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function pendingRetryDelayMs(baseMs: number, maxMs: number, pendingAttempts: number): number {
  const exponent = Math.min(16, Math.max(0, pendingAttempts - 1));
  return Math.min(maxMs, baseMs * (2 ** exponent));
}


export function buildRawTraceConfig(config: AppConfig, rawTraceSyncToken: string): Record<string, unknown> {
  const bodyCapture = config.observability.requestLogBodyCapture ?? "all";
  const maxBodyBytes = resolveRawTraceBodyLimit(config.observability.requestLogMaxBodyBytes);
  const bodyCaptureEnabled = bodyCapture !== "none" && maxBodyBytes >= 1024;
  const enabled = rawTraceEnabledFromEnv() && shouldRecordRequestLogs(config) && bodyCaptureEnabled;
  return {
    deleteLocalAfterUpload: false,
    enabled,
    maxPartBytes: maxBodyBytes,
    mode: "wire_raw",
    spoolDir: RAW_TRACE_SPOOL_DIR,
    sync: {
      enabled,
      endpoint: `${endpoint(config.gateway.host, config.gateway.port)}${rawTraceSyncPath}`,
      headers: {
        [rawTraceSyncHeader]: rawTraceSyncToken
      },
      timeoutMs: 5000
    }
  };
}


export function shouldRecordRequestLogs(config: AppConfig): boolean {
  return Boolean(config.observability?.requestLogs || config.observability?.agentAnalysis);
}


export type RawTraceRequestLogPolicy = {
  action: "enqueue";
  bodyDisposition: "capture" | "defer" | "suppress";
  update: RequestLogRawTraceUpdateInput;
};


export function applyRawTraceRequestLogPolicy(
  config: AppConfig,
  input: RequestLogRawTraceUpdateInput
): RawTraceRequestLogPolicy {
  const outcome = rawTraceRequestOutcome(input.statusCode);
  const configuredBodyCapture = config.observability.requestLogBodyCapture ?? "all";
  const bodyCapturePolicy = resolveRawTraceBodyLimit(config.observability.requestLogMaxBodyBytes) > 0
    ? configuredBodyCapture
    : "none";
  const bodyDisposition = bodyCapturePolicy === "none"
    ? "suppress"
    : bodyCapturePolicy === "all"
      ? "capture"
      : outcome === "failure"
        ? "capture"
        : "defer";
  const policyInput: RequestLogRawTraceUpdateInput = {
    ...input,
    bodyCapturePolicy,
    // An upstream trace never owns the final request outcome. Even an HTTP 2xx
    // can be followed by a downstream disconnect or response write failure.
    deferOutcomeUntilRecord: true,
    ...(bodyDisposition === "defer" ? { deferBodyCaptureUntilRecord: true } : {})
  };
  return {
    action: "enqueue",
    bodyDisposition,
    update: bodyDisposition === "suppress"
      ? suppressRequestLogRawTraceBodies(policyInput)
      : policyInput
  };
}

export function rawTraceRequestOutcome(
  statusCode: number | undefined
): "failure" | "unknown" {
  if (statusCode === undefined || !Number.isFinite(statusCode) || statusCode <= 0) return "unknown";
  if (statusCode < 200 || statusCode >= 400) return "failure";
  return "unknown";
}


export function requestLogSampled(requestId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  let hash = 2166136261;
  for (let index = 0; index < requestId.length; index += 1) {
    hash ^= requestId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000 < rate;
}


function rawTraceEnabledFromEnv(): boolean {
  const value = (process.env.CCR_RAW_TRACE_ENABLED ?? process.env.CCR_RAW_TRACE ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}


export async function readRawTraceRequestLogBundle(
  manifest: Record<string, unknown>,
  spoolDirectory = RAW_TRACE_SPOOL_DIR
): Promise<RawTraceRequestLogBundle | undefined> {
  const requestId = stringValue(manifest.turnKey) || stringValue(manifest.requestId);
  const bundleId = stringValue(manifest.requestId);
  const parts = Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
  if (!requestId || parts.length === 0) {
    return undefined;
  }

  const [
    clientRequestMetadata,
    upstreamRequestMetadata,
    upstreamResponseMetadata,
    upstreamRequestBody,
    upstreamResponseStream,
    fallbackResponseBody
  ] = await Promise.all([
    readRawTraceJsonPart(parts, "client_request_metadata", spoolDirectory),
    readRawTraceJsonPart(parts, "upstream_request_metadata", spoolDirectory),
    readRawTraceJsonPart(parts, "upstream_response_metadata", spoolDirectory),
    readRawTracePart(parts, "upstream_request", spoolDirectory),
    readRawTracePart(parts, "response_stream", spoolDirectory),
    readRawTracePart(parts, "upstream_response", spoolDirectory)
  ]);
  const upstreamResponseBody = upstreamResponseStream ?? fallbackResponseBody;
  const target = isRecord(manifest.target) ? manifest.target : {};
  const rawUrl = stringValue(upstreamRequestMetadata?.url);
  const url = sanitizeUrlForLog(rawUrl);
  const attempt = positiveAttemptNumber(readUnknownHeader(
    clientRequestMetadata?.headers,
    "x-ccr-route-attempt"
  ));

  return {
    files: {
      cleanupDirectory: rawTraceBundleDirectory(parts, spoolDirectory),
      requestBody: upstreamRequestBody,
      responseBody: upstreamResponseBody
    },
    update: {
      ...(attempt === undefined ? {} : { attempt }),
      ...(stringValue(manifest.uploadedAt) ? { bundleCapturedAt: stringValue(manifest.uploadedAt) } : {}),
      ...(bundleId ? { bundleId } : {}),
      method: stringValue(upstreamRequestMetadata?.method) || "POST",
      model: stringValue(target.model),
      path: pathFromUrl(url),
      provider: stringValue(target.providerName) || stringValue(target.provider),
      requestBodyContentType: upstreamRequestBody?.contentType,
      requestBodySizeBytes: upstreamRequestBody?.sizeBytes,
      requestBodyTruncated: upstreamRequestBody?.truncated,
      requestHeaders: headerRecordFromUnknown(upstreamRequestMetadata?.headers),
      requestId,
      isStream: upstreamResponseStream !== undefined,
      responseBodyContentType: upstreamResponseBody?.contentType,
      responseBodySizeBytes: upstreamResponseBody?.sizeBytes,
      responseBodyTruncated: upstreamResponseBody?.truncated,
      responseHeaders: headerRecordFromUnknown(upstreamResponseMetadata?.headers),
      statusCode: numberValue(upstreamResponseMetadata?.statusCode),
      url
    }
  };
}

function readUnknownHeader(headers: unknown, name: string): unknown {
  if (!isRecord(headers)) return undefined;
  const normalizedName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalizedName) return value;
  }
  return undefined;
}

function positiveAttemptNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}


async function readRawTraceJsonPart(
  parts: Record<string, unknown>[],
  partType: string,
  spoolDirectory: string
): Promise<Record<string, unknown> | undefined> {
  const part = await readRawTracePart(parts, partType, spoolDirectory);
  if (!part) {
    return undefined;
  }
  try {
    const text = await readFile(part.filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}


async function readRawTracePart(
  parts: Record<string, unknown>[],
  partType: string,
  spoolDirectory: string
): Promise<RawTracePartText | undefined> {
  const part = parts.find((candidate) => stringValue(candidate.partType) === partType);
  const filePath = stringValue(part?.filePath);
  if (!filePath || !isRawTraceSpoolFile(filePath, spoolDirectory)) {
    return undefined;
  }
  try {
    const storedBytes = (await stat(filePath)).size;
    return {
      contentType: stringValue(part?.contentType),
      filePath,
      sizeBytes: Math.max(storedBytes, numberValue(part?.originalBytes) ?? 0),
      truncated: storedBytes < (numberValue(part?.originalBytes) ?? storedBytes)
    };
  } catch (error) {
    console.warn(`[gateway] Failed to read raw trace part ${partType}: ${formatError(error)}`);
    return undefined;
  }
}


function rawTraceBundleDirectory(parts: Record<string, unknown>[], spoolDirectory: string): string | undefined {
  const filePath = parts.map((part) => stringValue(part.filePath)).find((value): value is string => Boolean(value));
  return filePath && isRawTraceSpoolFile(filePath, spoolDirectory) ? dirname(filePath) : undefined;
}


export async function cleanupRawTraceBundle(
  manifest: Record<string, unknown>,
  spoolDirectory = RAW_TRACE_SPOOL_DIR
): Promise<void> {
  const parts = Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
  const firstFilePath = parts.map((part) => stringValue(part.filePath)).find((value): value is string => Boolean(value));
  if (!firstFilePath || !isRawTraceSpoolFile(firstFilePath, spoolDirectory)) {
    return;
  }
  try {
    await rm(dirname(firstFilePath), { force: true, recursive: true });
  } catch (error) {
    console.warn(`[gateway] Failed to clean raw trace bundle: ${formatError(error)}`);
  }
}


function isRawTraceSpoolFile(filePath: string, spoolDirectory: string): boolean {
  const spoolDir = pathResolve(spoolDirectory);
  const resolvedFile = pathResolve(filePath);
  return dirname(resolvedFile) !== spoolDir && resolvedFile.startsWith(`${spoolDir}${pathSep}`);
}


function headerRecordFromUnknown(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue === undefined || headerValue === null) {
      continue;
    }
    headers[key] = Array.isArray(headerValue)
      ? headerValue.map((item) => String(item)).join(", ")
      : String(headerValue);
  }
  return headers;
}


function sanitizeUrlForLog(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveQueryParam(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}


function isSensitiveQueryParam(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "key" || normalized === "api_key" || normalized === "apikey" || normalized === "access_token";
}


function pathFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).pathname || undefined;
  } catch {
    return undefined;
  }
}


export function createBodySampler() {
  const chunks: Buffer[] = [];
  let capturedBytes = 0;
  let totalBytes = 0;
  let truncated = false;

  return {
    append(chunk: Buffer | string) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (truncated) return;
      if (capturedBytes + buffer.byteLength > maxUsageCaptureBytes) {
        const remaining = Math.max(0, maxUsageCaptureBytes - capturedBytes);
        if (remaining > 0) {
          chunks.push(buffer.subarray(0, remaining));
          capturedBytes += remaining;
        }
        truncated = true;
        return;
      }
      chunks.push(buffer);
      capturedBytes += buffer.byteLength;
    },
    isTruncated() {
      return truncated;
    },
    read() {
      return Buffer.concat(chunks, capturedBytes).toString("utf8");
    },
    sizeBytes() {
      return totalBytes;
    }
  };
}
