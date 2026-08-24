import { randomUUID } from "node:crypto";
import { closeSync, copyFileSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { REQUEST_LOG_BODIES_DIR, REQUEST_LOGS_DB_FILE } from "@ccr/core/config/constants";
import { decodeClaudeAppGatewayRouteId } from "@ccr/core/agents/claude-app/gateway-routes";
import {
  estimateUsageCostUsd,
  estimateUsageCostUsdFromLoadedCatalog,
  usagePriceCatalogNeedsRefresh
} from "@ccr/core/models/pricing-service";
import { createBetterSqliteDatabase, type BetterSqliteDatabase, type BetterSqliteStatement } from "@ccr/core/storage/sqlite-native";
import { normalizeUsageInputTokens } from "@ccr/core/usage/normalization";
import {
  createRequestLogRuntime,
  suppressRequestLogRawTraceBodies,
  type RequestLogEnqueueResult
} from "@ccr/core/observability/request-log-runtime";
import { maxRequestLogBodyBytes, rawTraceHardMaxBodyBytes } from "@ccr/core/observability/request-log-limits";
import { compactBase64ImagePayloads } from "@ccr/core/observability/request-log-body";
import { requestLogRequestedModel, requestLogResponseModel } from "@ccr/core/observability/request-log-model";
import { isSensitiveRequestLogHeaderName } from "@ccr/core/observability/sensitive-headers";
import type {
  AgentAnalysisAgentRow,
  AgentAnalysisConversationItem,
  AgentAnalysisConversationMessage,
  AgentAnalysisConversationRole,
  AgentAnalysisConversationTurn,
  AgentAnalysisFilter,
  AgentAnalysisRequestRow,
  AgentAnalysisSessionDetail,
  AgentAnalysisSessionModelRow,
  AgentAnalysisSessionRow,
  AgentAnalysisSnapshot,
  AgentAnalysisSubagentRow,
  AgentAnalysisTrace,
  AgentAnalysisTracePayloadFullResult,
  AgentAnalysisTracePayloadPreview,
  AgentAnalysisTracePayloadRequest,
  AgentAnalysisTraceRun,
  AgentAnalysisTraceRunKind,
  AgentAnalysisTraceToolDetail,
  AgentAnalysisToolRow,
  AgentAnalysisTotals,
  AgentObservabilityClientRow,
  AgentObservabilityEndpointRow,
  AgentObservabilityErrorRow,
  AgentObservabilityRouteRow,
  AgentKind,
  GatewayProviderProtocol,
  ProviderModelPricing,
  RequestLogBody,
  RequestLogBodyChunk,
  RequestLogBodyChunkRequest,
  RequestLogBodySide,
  RequestLogDetailRequest,
  RequestLogEntry,
  RequestLogFilterOptions,
  RequestLogListFilter,
  RequestLogPage,
  RequestLogRetryAttempt,
  RequestLogStatusFilter,
  RequestRouteTrace,
  RequestRouteTraceHop,
  RequestRouteTraceSnapshot,
  UsageStatsRange
} from "@ccr/core/contracts/app";

type SqlDatabase = BetterSqliteDatabase;
type SqlValue = bigint | Buffer | number | string | null;
type HeaderRecord = Record<string, string | string[] | undefined>;

type UsageNumbers = {
  cacheReadTokens?: number;
  cacheWrite1hTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWriteTokens?: number;
  inputIncludesCacheTokens?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

type UsageSnapshot = UsageNumbers & {
  model?: string;
};

type RequestLogUsageContext = {
  model: string;
  path: string;
  pricing?: ProviderModelPricing;
  provider: string;
};

type RequestLogStoredOutcome = {
  error: string;
  gatewayError: string;
  gatewayOk: boolean;
  gatewayStatusCode: number;
  hasRequestBody: boolean;
  hasResponseBody: boolean;
  ok: boolean;
  statusCode: number;
};

type RawTraceBodyCaptureResolution = {
  bodiesSuppressed: boolean;
  input: RequestLogRawTraceUpdateInput;
};

export type RequestLogRecordInput = {
  bodyCapturePolicy?: "all" | "errors" | "none";
  captureBody?: boolean;
  client?: string;
  completedAt?: string;
  durationMs: number;
  error?: string;
  eventId?: string;
  fallbackModel?: string;
  maxBodyBytes?: number;
  method: string;
  model?: string;
  path: string;
  providerName?: string;
  pricing?: ProviderModelPricing;
  providerProtocol?: GatewayProviderProtocol;
  requestedModel?: string;
  requestBody: Buffer;
  requestBodySizeBytes?: number;
  requestBodyTruncated?: boolean;
  requestHeaders: HeaderRecord;
  requestId?: string;
  resolvedModel?: string;
  routeTrace?: RequestRouteTrace;
  responseBodyText?: string;
  responseBodySizeBytes?: number;
  responseBodyTruncated?: boolean;
  responseModel?: string;
  responseHeaders?: Headers | HeaderRecord;
  startedAt: string;
  statusCode: number;
  url: string;
};

export type RequestLogRawTraceUpdateInput = {
  attempt?: number;
  bodyCapturePolicy?: "all" | "errors" | "none";
  bundleCapturedAt?: string;
  bundleId?: string;
  deferBodyCaptureUntilRecord?: boolean;
  deferOutcomeUntilRecord?: boolean;
  method?: string;
  model?: string;
  path?: string;
  provider?: string;
  requestBodyContentType?: string;
  requestBodyRef?: string;
  requestBodySizeBytes?: number;
  requestBodyText?: string;
  requestBodyTruncated?: boolean;
  requestHeaders?: HeaderRecord;
  requestId: string;
  isStream?: boolean;
  responseBodyContentType?: string;
  responseBodyRef?: string;
  responseBodySizeBytes?: number;
  responseBodyText?: string;
  responseBodyTruncated?: boolean;
  responseHeaders?: HeaderRecord;
  statusCode?: number;
  url?: string;
};

export type RequestLogRawTraceFile = {
  contentType?: string;
  filePath: string;
  sizeBytes: number;
  truncated?: boolean;
};

export type RequestLogRawTraceFiles = {
  cleanupDirectory?: string;
  maxBodyBytes?: number;
  requestBody?: RequestLogRawTraceFile;
  responseBody?: RequestLogRawTraceFile;
};

export type RequestLogStoreWriteCommand = {
  sequence: number;
} & ({
  eventId: string;
  input: RequestLogRecordInput;
  kind: "record";
} | {
  input: RequestLogRawTraceUpdateInput;
  kind: "raw-trace-update";
  rawTraceFiles?: RequestLogRawTraceFiles;
});

export type RequestLogCostBackfillPage = {
  nextBeforeId?: number;
  scanned: number;
  updated: number;
};

export type RequestLogStoreWriteResult = {
  pricingRefreshNeeded: boolean;
};

type StoredRequestLogEntry = {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  client: string;
  completedAt: string;
  costUsd: number | undefined;
  createdAt: string;
  credentialChain: string[];
  credentialId: string;
  credentialSaturated: boolean;
  durationMs: number;
  error: string;
  id: number;
  inputTokens: number;
  isStream: boolean;
  method: string;
  model: string;
  ok: boolean;
  outputTokens: number;
  path: string;
  provider: string;
  reasoningTokens: number;
  requestedModel: string;
  requestBody: RequestLogBody;
  requestHeaders: Record<string, string | string[]>;
  requestId: string;
  routeAttemptCount: number;
  routeHopCount: number;
  routeTrace?: RequestRouteTrace;
  routeTraceTruncated: boolean;
  retryAttempts: RequestLogRetryAttempt[];
  resolvedModel: string;
  responseBody?: RequestLogBody;
  responseModel: string;
  responseHeaders: Record<string, string | string[]>;
  statusCode: number;
  totalTokens: number;
  url: string;
};

type AnalyzedAgentRequest = AgentAnalysisRequestRow & {
  client: string;
  completedAt: string;
  conversation?: AgentAnalysisConversationTurn;
  endedAtMs: number;
  requestBody: RequestLogBody;
  responseBody?: RequestLogBody;
  startedAtMs: number;
  toolCalls: AgentToolCallDetail[];
  toolResults: AgentToolResultDetail[];
};

type AgentLogDetails = {
  agent: AgentKind;
  conversationMessages?: AgentConversationMessages;
  routeReason?: string;
  sessionId: string;
  subagentModel?: string;
  toolCalls: AgentToolCallDetail[];
  toolResults: AgentToolResultDetail[];
  tools: string[];
  userAgent?: string;
};

type AgentTextSignalOptions = {
  allowStandaloneCodex?: boolean;
  allowStandaloneGrok?: boolean;
  allowStandaloneKilo?: boolean;
  allowStandaloneKimi?: boolean;
  allowStandaloneOpenCode?: boolean;
};

type AgentToolCallDetail = {
  id?: string;
  input?: AgentAnalysisTracePayloadPreview;
  name: string;
};

type AgentToolResultDetail = {
  id: string;
  requestId?: string;
  requestLogId: number;
  result?: AgentAnalysisTracePayloadPreview;
};

type AgentToolResultSource = {
  id: number;
  requestId: string;
};

type AgentToolResultLookup = {
  byId: Map<string, AgentToolResultDetail>;
  ordered: AgentToolResultDetail[];
};

type AgentConversationMessages = {
  assistant?: AgentAnalysisConversationMessage;
  messages?: AgentAnalysisConversationItem[];
  user?: AgentAnalysisConversationMessage;
};

type StreamedToolCallInput = {
  fragments: string[];
  id: string;
  input?: unknown;
  name?: string;
};

export type SseErrorDetector = {
  append: (chunk: Buffer | string) => string | undefined;
  finish: () => string | undefined;
  hasTerminalEvent: () => boolean;
  read: () => string | undefined;
};

type ToolCallStreamState = {
  calls: Map<string, StreamedToolCallInput>;
  indexToId: Map<string, string>;
};

const maxBodyBytes = maxRequestLogBodyBytes;
const requestLogInlineBodyBytes = 160 * 1024;
const requestLogBodyChunkMaxBytes = 1024 * 1024;
const maxAgentAnalysisRows = 5000;
const maxTracePayloadPreviewChars = 1600;
const maxPendingRawTraceEntries = 200;
const maxPendingRawTraceEntryBytes = 2 * 1024 * 1024;
const maxPendingRawTraceRetainedBodyBytes = 512 * 1024;
const maxPendingRawTraceTotalBytes = 8 * 1024 * 1024;
const pendingRawTraceTtlMs = 5 * 60 * 1_000;
const rawTraceEventRetentionMs = 48 * 60 * 60 * 1_000;
const terminalSseEventNames = new Set([
  "done",
  "error",
  "message_stop",
  "response.completed",
  "response.error",
  "response.failed",
  "response.incomplete"
]);
const terminalSseResponseStatuses = new Set([
  "cancelled",
  "completed",
  "error",
  "failed",
  "incomplete"
]);
const requestLogBodyMetadataSelect = `
            '' AS request_body_text,
            '' AS response_body_text,
            request_body_ref,
            response_body_ref
`;
const emptyAgentAnalysisTotals: AgentAnalysisTotals = {
  avgDurationMs: 0,
  cacheRatio: 0,
  cacheReadTokens: 0,
  cacheTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
  errorCount: 0,
  inputTokens: 0,
  maxConcurrentRequests: 0,
  maxDurationMs: 0,
  outputTokens: 0,
  p50DurationMs: 0,
  p95DurationMs: 0,
  p99DurationMs: 0,
  requestCount: 0,
  sessionCount: 0,
  subagentCallCount: 0,
  successRate: 0,
  toolCallCount: 0,
  totalTokens: 0
};
type AgentAnalysisCacheEntry = {
  filterKey: string;
  revision: number;
  snapshot: AgentAnalysisSnapshot;
};

export class RequestLogStore {
  private database?: SqlDatabase;
  private initPromise?: Promise<SqlDatabase>;
  private insertRequestStatement?: BetterSqliteStatement;
  private insertRouteTraceStatement?: BetterSqliteStatement;
  private lastRetentionCleanupDay?: string;
  private revision = 0;
  private analysisCache?: AgentAnalysisCacheEntry;

  constructor(
    private readonly dbFile: string,
    private readonly bodyDir = dbFile === REQUEST_LOGS_DB_FILE
      ? REQUEST_LOG_BODIES_DIR
      : join(dirname(dbFile), "request-log-bodies")
  ) {}

  async initialize(): Promise<void> {
    await this.getDatabase();
  }

  invalidateAnalysisCache(): void {
    this.analysisCache = undefined;
  }

  async checkpoint(): Promise<void> {
    const database = await this.getDatabase();
    database.pragma("wal_checkpoint(PASSIVE)");
  }

  async close(): Promise<void> {
    const database = this.database ?? (this.initPromise ? await this.initPromise.catch(() => undefined) : undefined);
    this.database = undefined;
    this.initPromise = undefined;
    this.insertRequestStatement = undefined;
    this.insertRouteTraceStatement = undefined;
    database?.close();
  }

  async writeBatch(commands: RequestLogStoreWriteCommand[]): Promise<RequestLogStoreWriteResult> {
    if (commands.length === 0) return { pricingRefreshNeeded: false };
    const database = await this.getDatabase();
    const orderedCommands = [...commands].sort((left, right) => left.sequence - right.sequence);
    const pricingRefreshNeeded = batchNeedsUsagePricing(database, orderedCommands) &&
      usagePriceCatalogNeedsRefresh();
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const command of orderedCommands) {
        if (command.kind === "record") {
          await this.record({ ...command.input, eventId: command.eventId });
          const requestId = command.input.requestId?.trim();
          if (requestId) {
            const pending = this.takePendingRawTraceUpdate(database, requestId);
            if (pending) {
              if (command.input.captureBody === false) {
                deleteRequestLogBodyRefs(this.bodyDir, bodyRefsFromRawTraceInput(pending));
              }
              const pendingInput = command.input.captureBody === false
                ? suppressRequestLogRawTraceBodies(pending)
                : pending;
              const applied = await this.updateFromRawTrace(pendingInput);
              if (applied && pending.bundleId) {
                rememberProcessedRawTraceBundle(database, pending.bundleId, requestId);
              }
            }
          }
          continue;
        }
        const bundleId = command.input.bundleId?.trim();
        if (bundleId && hasProcessedRawTraceBundle(database, bundleId)) {
          continue;
        }
        const rawTraceInput = this.prepareRawTraceInput(command.input, command.rawTraceFiles);
        const applied = await this.updateFromRawTrace(rawTraceInput);
        if (bundleId && applied) {
          rememberProcessedRawTraceBundle(database, bundleId, rawTraceInput.requestId);
        } else if (!applied) {
          this.storePendingRawTraceUpdate(database, rawTraceInput);
        }
      }
      database.exec("COMMIT");
      return { pricingRefreshNeeded };
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }

  async backfillMissingUsageCosts(limit = 1_000): Promise<number> {
    let beforeId: number | undefined;
    let updated = 0;
    do {
      const page = await this.backfillMissingUsageCostsPage({ beforeId, limit });
      updated += page.updated;
      beforeId = page.nextBeforeId;
    } while (beforeId !== undefined);
    return updated;
  }

  async backfillMissingUsageCostsPage(options: {
    beforeId?: number;
    limit?: number;
  } = {}): Promise<RequestLogCostBackfillPage> {
    const database = await this.getDatabase();
    const limit = Math.max(1, Math.floor(options.limit ?? 1_000));
    const beforeId = options.beforeId === undefined
      ? undefined
      : Math.max(1, Math.floor(options.beforeId));
    const rows = queryRows(
      database,
      `
        SELECT
          id,
          cache_read_tokens,
          cache_write_tokens,
          input_tokens,
          model,
          output_tokens,
          pricing_json,
          provider
        FROM request_logs
        WHERE cost_usd IS NULL
          AND (cache_read_tokens + cache_write_tokens + input_tokens + output_tokens) > 0
          ${beforeId === undefined ? "" : "AND id < ?"}
        ORDER BY id DESC
        LIMIT ?
      `,
      beforeId === undefined ? [limit] : [beforeId, limit]
    );
    const update = database.prepare("UPDATE request_logs SET cost_usd = ? WHERE id = ? AND cost_usd IS NULL");
    let updated = 0;
    database.transaction(() => {
      for (const row of rows) {
        const cost = estimateUsageCostUsdFromLoadedCatalog({
          cacheReadTokens: normalizeCount(row.cache_read_tokens),
          cacheWriteTokens: normalizeCount(row.cache_write_tokens),
          inputTokens: normalizeCount(row.input_tokens),
          model: String(row.model ?? ""),
          outputTokens: normalizeCount(row.output_tokens),
          pricing: parseStoredModelPricing(row.pricing_json),
          provider: String(row.provider ?? "")
        });
        if (!cost) continue;
        updated += Number(update.run(cost.amountUsd, normalizeCount(row.id)).changes);
      }
    })();
    if (updated > 0) this.revision += 1;
    const lastId = rows.length === limit
      ? normalizeCount(rows[rows.length - 1]?.id)
      : 0;
    return {
      ...(lastId > 0 ? { nextBeforeId: lastId } : {}),
      scanned: rows.length,
      updated
    };
  }

  async record(input: RequestLogRecordInput): Promise<void> {
    const database = await this.getDatabase();
    this.pruneOldRequestLogs(database);
    const rawRequestHeaders = headersToRecord(input.requestHeaders);
    const rawResponseHeaders = headersToRecord(input.responseHeaders);
    const requestHeaders = sanitizeHeaders(rawRequestHeaders);
    const responseHeaders = sanitizeHeaders(rawResponseHeaders);
    const responseBodyText = input.responseBodyText ?? "";
    const responseError = normalizeFilterValue(input.error) ??
      detectSseError(responseBodyText, headerValue(responseHeaders, "content-type"));
    const bodyUsage = extractUsageFromBody(responseBodyText);
    // Each source carries its own cache-inclusion convention; normalize before
    // merging (see UsageConventionSource).
    const usage: UsageSnapshot = mergeUsageSnapshots(
      normalizeUsageInputTokens(extractUsageFromBillingHeaders(input.responseHeaders), {
        path: input.path,
        providerProtocol: input.providerProtocol,
        source: "providerBilling"
      }),
      normalizeUsageInputTokens(bodyUsage, {
        path: input.path,
        source: "responseBody"
      })
    ) ?? {};
    const route = splitRequestLogRouteSelector(input.fallbackModel);
    const bodyModel = requestLogRequestedModel(input.requestBody, input.path);
    const requestModel = normalizeFilterValue(input.model) ?? bodyModel;
    const requestModelForStorage = requestLogStorageModel(requestModel);
    const usageRoute = decodedClaudeAppGatewayRouteParts(usage.model);
    const usageModelForStorage = usageRoute?.model ?? normalizeFilterValue(usage.model);
    const requestedModel = normalizeFilterValue(input.requestedModel) ?? bodyModel ?? "";
    const resolvedModel = normalizeFilterValue(input.resolvedModel) ??
      normalizeFilterValue(input.model) ??
      route.model ??
      bodyModel ??
      normalizeFilterValue(input.fallbackModel) ??
      "";
    const responseModel = normalizeFilterValue(input.responseModel) ??
      requestLogResponseModel(responseBodyText) ??
      "";
    const provider =
      normalizeFilterValue(input.providerName) ??
      readResponseHeader(input.responseHeaders, "x-gateway-target-provider-name") ??
      readResponseHeader(input.responseHeaders, "x-gateway-target-provider") ??
      route.provider ??
      usageRoute?.provider;
    const inputTokens = normalizeCount(usage.inputTokens);
    const outputTokens = normalizeCount(usage.outputTokens);
    const reasoningTokens = normalizeCount(usage.reasoningTokens);
    const cacheReadTokens = normalizeCount(usage.cacheReadTokens);
    const cacheWrite1hTokens = normalizeCount(usage.cacheWrite1hTokens);
    const cacheWrite5mTokens = normalizeCount(usage.cacheWrite5mTokens);
    const cacheWriteTokens = normalizeCount(usage.cacheWriteTokens);
    const totalTokens =
      normalizeCount(usage.totalTokens) ||
      inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
    const model = normalizeLabel(usageModelForStorage ?? route.model ?? requestModelForStorage ?? input.fallbackModel, "unknown");
    const providerName = normalizeLabel(provider, "unknown");
    // CCR credential IDs are structured metadata, but their header names also
    // match the fail-closed secret classifier. Extract them before sanitizing;
    // the persisted header JSON remains redacted.
    const credentialInfo = readCredentialLogInfo(rawResponseHeaders, rawRequestHeaders);
    const costInput = {
      cacheReadTokens,
      cacheWrite1hTokens,
      cacheWrite5mTokens,
      cacheWriteTokens,
      inputTokens,
      model,
      outputTokens,
      pricing: input.pricing,
      provider: providerName
    };
    const cost = database.inTransaction
      ? estimateUsageCostUsdFromLoadedCatalog(costInput)
      : await estimateUsageCostUsd(costInput);
    const capturedRequestBody = bodyFromBuffer(
      input.requestBody,
      headerValue(requestHeaders, "content-type"),
      { bodyDir: this.bodyDir, side: "request" }
    );
    const requestBody: RequestLogBody = {
      ...capturedRequestBody,
      sizeBytes: Math.max(capturedRequestBody.sizeBytes, normalizeCount(input.requestBodySizeBytes)),
      truncated: capturedRequestBody.truncated || Boolean(input.requestBodyTruncated)
    };
    const responseBody = bodyFromText(
      responseBodyText,
      headerValue(responseHeaders, "content-type"),
      Boolean(input.responseBodyTruncated),
      input.responseBodySizeBytes,
      undefined,
      { bodyDir: this.bodyDir, side: "response" }
    );
    const isStream = inferRequestLogIsStream({
      path: input.path,
      requestBodyText: requestBody.encoding === "utf8" ? requestBody.text : undefined,
      requestHeaders,
      responseBodyContentType: responseBody.contentType,
      responseHeaders,
      url: input.url
    });

    const statement = this.insertRequestStatement ??= database.prepare(`
      INSERT OR IGNORE INTO request_logs (
        created_at,
        completed_at,
        request_id,
        event_id,
        client,
        method,
        path,
        url,
        provider,
        credential_id,
        credential_chain,
        credential_saturated,
        model,
        requested_model,
        resolved_model,
        response_model,
        route_trace_version,
        route_hop_count,
        route_attempt_count,
        route_trace_truncated,
        is_stream,
        status_code,
        ok,
        duration_ms,
        input_tokens,
        output_tokens,
        reasoning_tokens,
        cache_read_tokens,
        cache_write_tokens,
        total_tokens,
        cost_usd,
        pricing_json,
        request_headers,
        response_headers,
        request_body_text,
        request_body_encoding,
        request_body_content_type,
        request_body_size_bytes,
        request_body_truncated,
        request_body_ref,
        response_body_text,
        response_body_encoding,
        response_body_content_type,
        response_body_size_bytes,
        response_body_truncated,
        response_body_ref,
        error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = false;
    const insert = () => {
      const result = statement.run(
        input.startedAt,
        input.completedAt ?? new Date().toISOString(),
        input.requestId ?? "",
        input.eventId ?? "",
        normalizeLabel(input.client, "unknown"),
        input.method,
        input.path,
        input.url,
        providerName,
        credentialInfo.id,
        credentialInfo.chain.join(","),
        credentialInfo.saturated ? 1 : 0,
        model,
        requestedModel,
        resolvedModel,
        responseModel,
        input.routeTrace?.version ?? 0,
        input.routeTrace?.hopCount ?? 0,
        input.routeTrace?.attemptCount ?? 0,
        input.routeTrace?.truncated ? 1 : 0,
        isStream ? 1 : 0,
        normalizeCount(input.statusCode),
        isSuccessStatus(input.statusCode, responseError) ? 1 : 0,
        normalizeCount(input.durationMs),
        inputTokens,
        outputTokens,
        reasoningTokens,
        cacheReadTokens,
        cacheWriteTokens,
        totalTokens,
        cost?.amountUsd ?? null,
        input.pricing ? JSON.stringify(input.pricing) : "",
        JSON.stringify(requestHeaders),
        JSON.stringify(responseHeaders),
        requestBody.text,
        requestBody.encoding,
        requestBody.contentType ?? "",
        requestBody.sizeBytes,
        requestBody.truncated ? 1 : 0,
        requestBody.bodyRef ?? "",
        responseBody.text,
        responseBody.encoding,
        responseBody.contentType ?? "",
        responseBody.sizeBytes,
        responseBody.truncated ? 1 : 0,
        responseBody.bodyRef ?? "",
        responseError ?? ""
      );
      if (result.changes === 0) return;
      inserted = true;
      database.prepare(`
        UPDATE request_logs
        SET
          gateway_status_code = ?,
          gateway_ok = ?,
          gateway_error = ?,
          gateway_final_attempt = ?,
          gateway_body_capture_policy = ?,
          gateway_body_capture_max_bytes = ?
        WHERE id = ?
      `).run(
        normalizeCount(input.statusCode),
        isSuccessStatus(input.statusCode, responseError) ? 1 : 0,
        responseError ?? "",
        finalAttemptFromHeaders(responseHeaders, input.routeTrace?.attemptCount),
        input.bodyCapturePolicy ?? (input.captureBody === false ? "none" : "all"),
        normalizeCount(input.maxBodyBytes),
        Number(result.lastInsertRowid)
      );
      if (input.routeTrace) {
        insertRequestRouteTrace(
          this.insertRouteTraceStatement ??= prepareRequestRouteTraceInsert(database),
          Number(result.lastInsertRowid),
          input.requestId ?? "",
          input.routeTrace
        );
      }
    };
    if (database.inTransaction) insert();
    else database.transaction(insert)();
    if (inserted) this.revision += 1;
  }

  async updateFromRawTrace(rawInput: RequestLogRawTraceUpdateInput): Promise<boolean> {
    const requestId = rawInput.requestId.trim();
    if (!requestId) {
      return false;
    }

    const database = await this.getDatabase();
    this.pruneOldRequestLogs(database);
    if (!hasRequestLogWithRequestId(database, requestId)) {
      return false;
    }
    const existingOutcome = readRequestLogStoredOutcome(database, requestId);
    const expectedAttempt = readRequestLogFinalAttempt(database, requestId);
    const rawAttempt = rawInput.attempt === undefined ? undefined : normalizeCount(rawInput.attempt);
    if ((rawAttempt !== undefined && rawAttempt !== expectedAttempt) ||
      (rawAttempt === undefined && expectedAttempt > 1)) {
      // Each Core fallback request has its own bundle. Only the bundle for the
      // final attempt may refine the outer gateway record.
      return true;
    }
    // Determine the raw outcome before applying the body-capture policy. In
    // errors-only mode the policy may intentionally replace body text with an
    // empty value, but HTTP/SSE error detection must inspect the original data.
    const rawStatusCode = rawInput.statusCode === undefined
      ? undefined
      : normalizeCount(rawInput.statusCode);
    const rawResponseHeaders = rawInput.responseHeaders === undefined
      ? undefined
      : sanitizeHeaders(rawInput.responseHeaders);
    const rawResponseBodyContentType = rawInput.responseBodyContentType ??
      headerValue(rawResponseHeaders ?? {}, "content-type");
    const rawSseError = rawInput.responseBodyText === undefined
      ? undefined
      : detectSseError(rawInput.responseBodyText, rawResponseBodyContentType);
    const gatewayFailure = Boolean(existingOutcome.gatewayError) ||
      (!existingOutcome.gatewayOk && existingOutcome.gatewayStatusCode > 0);
    const existingFailure = gatewayFailure || Boolean(existingOutcome.error) ||
      (!existingOutcome.ok && existingOutcome.statusCode > 0);
    const rawHttpFailure = rawStatusCode !== undefined && rawStatusCode > 0 &&
      (rawStatusCode < 200 || rawStatusCode >= 400);
    const finalSuccessful = !existingFailure && !rawHttpFailure && !rawSseError;
    const captureResolution = applyRawTraceBodyCapturePolicy(
      rawInput,
      finalSuccessful
    );
    if (captureResolution.bodiesSuppressed) {
      deleteRequestLogBodyRefs(this.bodyDir, bodyRefsFromRawTraceInput(rawInput));
    }
    const input = captureResolution.input;
    const existingUsageContext = readRequestLogUsageContext(database, requestId);

    const sets: string[] = [];
    const params: SqlValue[] = [];
    const pushValue = (column: string, value: SqlValue | undefined) => {
      if (value === undefined) {
        return;
      }
      sets.push(`${column} = ?`);
      params.push(value);
    };

    const url = normalizeFilterValue(input.url);
    const path = normalizeFilterValue(input.path) ?? pathFromUrl(url);
    const usagePath = path ?? existingUsageContext.path;
    const rawModelFromTrace = normalizeFilterValue(input.model);
    const modelFromTrace = requestLogStorageModel(rawModelFromTrace);
    const resolvedModelFromTrace = requestLogStorageModelSelector(rawModelFromTrace);
    const responseModelFromTrace = rawInput.responseBodyText === undefined
      ? undefined
      : requestLogResponseModel(rawInput.responseBodyText);
    const providerFromTrace = normalizeFilterValue(input.provider);
    const statusCode = rawStatusCode;
    const requestCredentialHeaders = input.requestHeaders ?? {};
    const responseCredentialHeaders = input.responseHeaders ?? {};
    const requestHeaders = input.requestHeaders === undefined ? undefined : sanitizeHeaders(input.requestHeaders);
    const responseHeaders = rawResponseHeaders;
    const responseBodyContentType = rawResponseBodyContentType;
    const sseError = rawSseError;
    const mergedRequestHeaders = requestHeaders
      ? mergeRequestHeadersForRawTrace(readRequestHeadersForRequestId(database, requestId), requestHeaders)
      : undefined;

    pushValue("method", normalizeFilterValue(input.method));
    pushValue("path", path);
    pushValue("url", url);
    pushValue("provider", providerFromTrace);
    pushValue("model", modelFromTrace);
    pushValue("resolved_model", resolvedModelFromTrace);
    pushValue("response_model", responseModelFromTrace);
    // The gateway's terminal failure is authoritative, even when it has only
    // an HTTP error status and no error string. A final-attempt raw failure may
    // still refine a gateway success (for example an SSE error inside HTTP 200).
    const preserveGatewayOutcome = gatewayFailure;
    if (statusCode !== undefined && statusCode > 0 && !preserveGatewayOutcome) {
      pushValue("status_code", statusCode);
      pushValue("ok", isSuccessStatus(statusCode, sseError) ? 1 : 0);
    }
    if (sseError) {
      if (!existingOutcome.error) pushValue("error", sseError);
      if (statusCode === undefined && !preserveGatewayOutcome) {
        pushValue("ok", 0);
      }
    }
    if (mergedRequestHeaders) {
      pushValue("request_headers", JSON.stringify(mergedRequestHeaders));
    }
    if (responseHeaders) {
      pushValue("response_headers", JSON.stringify(responseHeaders));
    }
    if (input.responseBodyText !== undefined || responseHeaders) {
      const bodyUsage = input.responseBodyText === undefined
        ? undefined
        : extractUsageFromBody(input.responseBodyText);
      // As in record(), each source is normalized under its own convention.
      // Raw-trace updates carry no provider protocol — it is not part of the
      // gateway's raw-trace sync contract — so the billing headers fall back to
      // the request path, which is only a proxy for the upstream's convention.
      const usage: UsageSnapshot = mergeUsageSnapshots(
        normalizeUsageInputTokens(extractUsageFromBillingHeaders(responseHeaders), {
          path: usagePath,
          source: "providerBilling"
        }),
        normalizeUsageInputTokens<UsageSnapshot>(bodyUsage, {
          path: usagePath,
          source: "responseBody"
        })
      ) ?? {};
      if (hasUsageNumbers(usage)) {
        const inputTokens = normalizeCount(usage.inputTokens);
        const outputTokens = normalizeCount(usage.outputTokens);
        const reasoningTokens = normalizeCount(usage.reasoningTokens);
        const cacheReadTokens = normalizeCount(usage.cacheReadTokens);
        const cacheWrite1hTokens = normalizeCount(usage.cacheWrite1hTokens);
        const cacheWrite5mTokens = normalizeCount(usage.cacheWrite5mTokens);
        const cacheWriteTokens = normalizeCount(usage.cacheWriteTokens);
        const totalTokens =
          normalizeCount(usage.totalTokens) ||
          inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
        const model = normalizeLabel(requestLogStorageModel(usage.model) ?? modelFromTrace ?? existingUsageContext.model, "unknown");
        const provider = normalizeLabel(providerFromTrace ?? existingUsageContext.provider, "unknown");
        const costInput = {
          cacheReadTokens,
          cacheWrite1hTokens,
          cacheWrite5mTokens,
          cacheWriteTokens,
          inputTokens,
          model,
          outputTokens,
          pricing: existingUsageContext.pricing,
          provider
        };
        const cost = database.inTransaction
          ? estimateUsageCostUsdFromLoadedCatalog(costInput)
          : await estimateUsageCostUsd(costInput);

        pushValue("input_tokens", inputTokens);
        pushValue("output_tokens", outputTokens);
        pushValue("reasoning_tokens", reasoningTokens);
        pushValue("cache_read_tokens", cacheReadTokens);
        pushValue("cache_write_tokens", cacheWriteTokens);
        pushValue("total_tokens", totalTokens);
        pushValue("cost_usd", cost?.amountUsd);
        if (usage.model && !modelFromTrace) {
          pushValue("model", model);
        }
      }
    }
    if (hasCredentialLogHeaders(responseCredentialHeaders) || hasCredentialLogHeaders(requestCredentialHeaders)) {
      const credentialInfo = readCredentialLogInfo(responseCredentialHeaders, requestCredentialHeaders);
      pushValue("credential_id", credentialInfo.id);
      pushValue("credential_chain", credentialInfo.chain.join(","));
      pushValue("credential_saturated", credentialInfo.saturated ? 1 : 0);
    }
    const hasStreamSignal =
      input.isStream !== undefined ||
      input.path !== undefined ||
      input.url !== undefined ||
      input.requestBodyText !== undefined ||
      input.requestHeaders !== undefined ||
      input.responseBodyContentType !== undefined ||
      input.responseHeaders !== undefined;
    if (hasStreamSignal) {
      pushValue("is_stream", inferRequestLogIsStream({
        path,
        requestBodyText: input.requestBodyText,
        requestHeaders: mergedRequestHeaders,
        responseBodyContentType: input.responseBodyContentType,
        responseHeaders,
        responseWasStream: input.isStream,
        url
      }) ? 1 : 0);
    }
    const shouldApplyRequestBody = input.requestBodyText !== undefined ||
      Boolean(input.requestBodyRef && (!input.requestBodyTruncated || !existingOutcome.hasRequestBody));
    if (shouldApplyRequestBody && (
      captureResolution.bodiesSuppressed || Boolean(input.requestBodyRef) || (input.requestBodyText?.length ?? 0) > 0 || !existingOutcome.hasRequestBody
    )) {
      const requestBody = bodyFromText(
        input.requestBodyText ?? "",
        input.requestBodyContentType ?? headerValue(mergedRequestHeaders ?? {}, "content-type"),
        Boolean(input.requestBodyTruncated),
        input.requestBodySizeBytes,
        rawTraceHardMaxBodyBytes,
        { bodyDir: this.bodyDir, bodyRef: input.requestBodyRef, side: "request" }
      );
      pushBodyValues(sets, params, "request", requestBody);
    }
    const shouldApplyResponseBody = input.responseBodyText !== undefined ||
      Boolean(input.responseBodyRef && (!input.responseBodyTruncated || !existingOutcome.hasResponseBody));
    if (shouldApplyResponseBody && (
      captureResolution.bodiesSuppressed || Boolean(input.responseBodyRef) || (input.responseBodyText?.length ?? 0) > 0 || !existingOutcome.hasResponseBody
    )) {
      const responseBody = bodyFromText(
        input.responseBodyText ?? "",
        responseBodyContentType,
        Boolean(input.responseBodyTruncated),
        input.responseBodySizeBytes,
        rawTraceHardMaxBodyBytes,
        { bodyDir: this.bodyDir, bodyRef: input.responseBodyRef, side: "response" }
      );
      pushBodyValues(sets, params, "response", responseBody);
    }

    const update = () => {
      if (sets.length > 0) {
        database.prepare(`UPDATE request_logs SET ${sets.join(", ")} WHERE request_id = ?`).run(...params, requestId);
      }
    };
    if (database.inTransaction) update();
    else database.transaction(update)();
    if (sets.length > 0) {
      this.revision += 1;
    }
    return true;
  }

  async list(filter: RequestLogListFilter = {}): Promise<RequestLogPage> {
    const database = await this.getDatabase();
    this.pruneOldRequestLogs(database);
    const pageSize = clampInteger(filter.pageSize, 1, 100, 25);
    const page = clampInteger(filter.page, 1, Number.MAX_SAFE_INTEGER, 1);
    const query = buildLogWhereClause(filter);
    const count = firstNumber(queryRows(database, `SELECT COUNT(*) AS total FROM request_logs ${query.where}`, query.params), "total");
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const offset = (normalizedPage - 1) * pageSize;
    const rows = queryRows(
      database,
        `
          SELECT
            rowid AS id,
            created_at,
            completed_at,
            request_id,
            client,
            method,
            path,
            url,
            provider,
            credential_id,
            credential_chain,
            credential_saturated,
            model,
            requested_model,
            resolved_model,
            response_model,
            route_trace_version,
            route_hop_count,
            route_attempt_count,
            route_trace_truncated,
            is_stream,
            status_code,
            ok,
            duration_ms,
            input_tokens,
            output_tokens,
            reasoning_tokens,
            cache_read_tokens,
            cache_write_tokens,
            total_tokens,
            cost_usd,
            request_headers,
            response_headers,
            ${requestLogBodyMetadataSelect},
            request_body_encoding,
            request_body_content_type,
            request_body_size_bytes,
            request_body_truncated,
            response_body_encoding,
            response_body_content_type,
            response_body_size_bytes,
            response_body_truncated,
            error
          FROM request_logs
          ${query.where}
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?
        `,
        [...query.params, pageSize, offset]
    ).map(toRequestLogEntry);

    return {
      generatedAt: new Date().toISOString(),
      items: rows,
      options: await this.getFilterOptions(),
      page: normalizedPage,
      pageSize,
      total: count,
      totalPages
    };
  }

  async getDetail(request: RequestLogDetailRequest): Promise<RequestLogEntry | undefined> {
    const database = await this.getDatabase();
    const requestLogId = normalizeCount(request.id);
    if (requestLogId <= 0) {
      return undefined;
    }
    const entry = readRequestLogById(database, requestLogId);
    if (!entry) {
      return undefined;
    }
    entry.routeTrace = readRequestRouteTrace(database, requestLogId);
    return entry;
  }

  async getBodyChunk(request: RequestLogBodyChunkRequest): Promise<RequestLogBodyChunk | undefined> {
    const database = await this.getDatabase();
    const requestLogId = normalizeCount(request.id);
    const side = request.side === "response" ? "response" : "request";
    if (requestLogId <= 0) {
      return undefined;
    }

    const row = queryRows(
      database,
      `
        SELECT
          ${side}_body_text AS body_text,
          ${side}_body_encoding AS body_encoding,
          ${side}_body_content_type AS body_content_type,
          ${side}_body_size_bytes AS body_size_bytes,
          ${side}_body_truncated AS body_truncated,
          ${side}_body_ref AS body_ref
        FROM request_logs
        WHERE rowid = ?
        LIMIT 1
      `,
      [requestLogId]
    )[0];
    if (!row) {
      return undefined;
    }

    const offset = clampInteger(request.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const length = clampInteger(request.length, 1, requestLogBodyChunkMaxBytes, requestLogBodyChunkMaxBytes);
    const encoding = String(row.body_encoding ?? "utf8") === "base64" ? "base64" : "utf8";
    const contentType = normalizeFilterValue(String(row.body_content_type ?? ""));
    const sizeBytes = normalizeCount(row.body_size_bytes);
    const truncated = normalizeCount(row.body_truncated) === 1;
    const bodyRef = normalizeFilterValue(String(row.body_ref ?? ""));

    if (bodyRef) {
      const filePath = requestLogBodyPath(this.bodyDir, bodyRef);
      if (filePath && existsSync(filePath)) {
        return readRequestLogBodyChunkFromFile({
          bodyRef,
          contentType,
          encoding,
          filePath,
          length,
          offset,
          sizeBytes,
          truncated
        });
      }
    }

    const text = String(row.body_text ?? "");
    const visible = text.slice(offset, offset + length);
    const nextOffset = offset + visible.length;
    return {
      ...(bodyRef ? { bodyRef } : {}),
      contentType,
      encoding,
      eof: nextOffset >= text.length,
      length: visible.length,
      ...(nextOffset < text.length ? { nextOffset } : {}),
      offset,
      sizeBytes: Math.max(sizeBytes, text.length),
      text: visible,
      truncated
    };
  }

  async analyze(filter: AgentAnalysisFilter = {}): Promise<AgentAnalysisSnapshot> {
    const database = await this.getDatabase();
    this.pruneOldRequestLogs(database);
    const now = new Date();
    const filterKey = agentAnalysisCacheKey(filter);
    if (this.analysisCache?.revision === this.revision && this.analysisCache.filterKey === filterKey) {
      return {
        ...this.analysisCache.snapshot,
        generatedAt: now.toISOString()
      };
    }
    const range = normalizeAgentAnalysisRange(filter.range);
    const since = getAgentAnalysisSince(range, now);
    const requestedAgent = normalizeAgentFilter(filter.agent);
    const analyzed: AnalyzedAgentRequest[] = [];
    let requestScanTruncated = false;
    let scannedRequestCount = 0;
    const rows = iterateRows(
      database,
        `
          SELECT
            rowid AS id,
            created_at,
            completed_at,
            request_id,
            client,
            method,
            path,
            url,
            provider,
            credential_id,
            credential_chain,
            credential_saturated,
            model,
            requested_model,
            resolved_model,
            response_model,
            is_stream,
            status_code,
            ok,
            duration_ms,
            input_tokens,
            output_tokens,
            reasoning_tokens,
            cache_read_tokens,
            cache_write_tokens,
            total_tokens,
            cost_usd,
            request_headers,
            response_headers,
            request_body_text,
            request_body_encoding,
            request_body_content_type,
            request_body_size_bytes,
            request_body_truncated,
            request_body_ref,
            response_body_text,
            response_body_encoding,
            response_body_content_type,
            response_body_size_bytes,
            response_body_truncated,
            response_body_ref,
            error
          FROM request_logs
          WHERE source_usage_id IS NULL
            AND path NOT LIKE ?
            AND created_at >= ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        `,
        ["%/count_tokens%", since.toISOString(), maxAgentAnalysisRows + 1]
    );
    // Consume and compact each body before advancing so the query never retains all body text at once.
    for (const row of rows) {
      if (scannedRequestCount >= maxAgentAnalysisRows) {
        requestScanTruncated = true;
        continue;
      }
      scannedRequestCount += 1;
      const request = toAnalyzedAgentRequest(toRequestLogEntry(row));
      if (requestedAgent === "all" || request.agent === requestedAgent) {
        analyzed.push(request);
      }
    }

    analyzed.reverse();
    const requests = applyRequestConcurrency(analyzed);
    const sessionScopedRequests = selectAgentSessionRequests(requests, filter);
    const analysisRequests = sessionScopedRequests
      ? applyRequestConcurrency(sessionScopedRequests)
      : requests;
    const selectedSession = sessionScopedRequests
      ? buildAgentSessionDetail(analysisRequests, this.bodyDir)
      : undefined;

    const snapshot: AgentAnalysisSnapshot = {
      agents: buildAgentRows(analysisRequests),
      clients: buildAgentClientRows(analysisRequests),
      concurrency: buildAgentConcurrencySeries(range, now, analysisRequests),
      endpoints: buildAgentEndpointRows(analysisRequests),
      errors: buildAgentErrorRows(analysisRequests),
      generatedAt: now.toISOString(),
      range,
      recentRequests: analysisRequests.slice(-50).reverse().map(stripAnalysisInternals),
      routes: buildAgentRouteRows(analysisRequests),
      requestScanLimit: maxAgentAnalysisRows,
      requestScanTruncated,
      scannedRequestCount,
      ...(selectedSession ? { selectedSession } : {}),
      sessions: buildAgentSessionRows(requests),
      subagents: buildAgentSubagentRows(analysisRequests),
      tools: buildAgentToolRows(analysisRequests),
      totals: buildAgentAnalysisTotals(analysisRequests)
    };
    this.analysisCache = {
      filterKey,
      revision: this.revision,
      snapshot
    };
    return snapshot;
  }

  async getTracePayload(request: AgentAnalysisTracePayloadRequest): Promise<AgentAnalysisTracePayloadFullResult> {
    const database = await this.getDatabase();
    const requestLogId = normalizeCount(request.requestLogId);
    if (requestLogId <= 0) {
      return emptyTracePayloadResult();
    }
    const entry = readRequestLogById(database, requestLogId);
    if (!entry) {
      return emptyTracePayloadResult();
    }

    const body = hydrateRequestLogBodyFromRef(this.bodyDir, request.part === "tool-input" ? entry.responseBody : entry.requestBody);
    if (!body || body.encoding !== "utf8") {
      return emptyTracePayloadResult(Boolean(body?.truncated));
    }

    const payloads = parseLogBodyPayloads(body);
    const found = request.part === "tool-input"
      ? findToolCallPayload(payloads, request.callId)
      : findToolResultPayload(payloads, request.callId);
    if (!found.found) {
      return emptyTracePayloadResult(body.truncated);
    }
    return fullPayloadResult(found.value, body.truncated);
  }

  private async getFilterOptions(): Promise<RequestLogFilterOptions> {
    const database = await this.getDatabase();
    return {
      credentials: readDistinctValues(database, "credential_id"),
      models: readDistinctValues(database, "model"),
      providers: readDistinctValues(database, "provider")
    };
  }

  private async getDatabase(): Promise<SqlDatabase> {
    if (this.database) {
      return this.database;
    }

    this.initPromise ??= this.open();
    return this.initPromise;
  }

  private async open(): Promise<SqlDatabase> {
    mkdirSync(dirname(this.dbFile), { recursive: true });
    const database = createBetterSqliteDatabase(this.dbFile);
    configureSqliteDatabase(database);

    database.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_usage_id INTEGER,
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT '',
        request_id TEXT NOT NULL DEFAULT '',
        event_id TEXT NOT NULL DEFAULT '',
        client TEXT NOT NULL DEFAULT 'unknown',
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT 'unknown',
        credential_id TEXT NOT NULL DEFAULT '',
        credential_chain TEXT NOT NULL DEFAULT '',
        credential_saturated INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL DEFAULT 'unknown',
        requested_model TEXT NOT NULL DEFAULT '',
        resolved_model TEXT NOT NULL DEFAULT '',
        response_model TEXT NOT NULL DEFAULT '',
        route_trace_version INTEGER NOT NULL DEFAULT 0,
        route_hop_count INTEGER NOT NULL DEFAULT 0,
        route_attempt_count INTEGER NOT NULL DEFAULT 0,
        route_trace_truncated INTEGER NOT NULL DEFAULT 0,
        is_stream INTEGER NOT NULL DEFAULT 0,
        status_code INTEGER NOT NULL DEFAULT 0,
        ok INTEGER NOT NULL DEFAULT 0,
        gateway_status_code INTEGER NOT NULL DEFAULT 0,
        gateway_ok INTEGER NOT NULL DEFAULT 0,
        gateway_error TEXT NOT NULL DEFAULT '',
        gateway_final_attempt INTEGER NOT NULL DEFAULT 1,
        gateway_body_capture_policy TEXT NOT NULL DEFAULT 'none',
        gateway_body_capture_max_bytes INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        pricing_json TEXT NOT NULL DEFAULT '',
        request_headers TEXT NOT NULL DEFAULT '{}',
        response_headers TEXT NOT NULL DEFAULT '{}',
        request_body_text TEXT NOT NULL DEFAULT '',
        request_body_encoding TEXT NOT NULL DEFAULT 'utf8',
        request_body_content_type TEXT NOT NULL DEFAULT '',
        request_body_size_bytes INTEGER NOT NULL DEFAULT 0,
        request_body_truncated INTEGER NOT NULL DEFAULT 0,
        request_body_ref TEXT NOT NULL DEFAULT '',
        response_body_text TEXT NOT NULL DEFAULT '',
        response_body_encoding TEXT NOT NULL DEFAULT 'utf8',
        response_body_content_type TEXT NOT NULL DEFAULT '',
        response_body_size_bytes INTEGER NOT NULL DEFAULT 0,
        response_body_truncated INTEGER NOT NULL DEFAULT 0,
        response_body_ref TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS request_route_traces (
        request_log_id INTEGER PRIMARY KEY,
        request_id TEXT NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        complete INTEGER NOT NULL DEFAULT 1,
        ingress_snapshot_json TEXT NOT NULL DEFAULT '{}',
        final_snapshot_json TEXT NOT NULL DEFAULT '{}',
        hop_count INTEGER NOT NULL DEFAULT 0,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        truncated INTEGER NOT NULL DEFAULT 0,
        trace_json TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(request_log_id) REFERENCES request_logs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS request_route_hops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_log_id INTEGER NOT NULL,
        request_id TEXT NOT NULL DEFAULT '',
        seq INTEGER NOT NULL,
        phase TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        attempt_no INTEGER,
        started_offset_ms INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ok',
        decision_json TEXT NOT NULL DEFAULT '{}',
        target_json TEXT NOT NULL DEFAULT '{}',
        changes_json TEXT NOT NULL DEFAULT '[]',
        outcome_json TEXT NOT NULL DEFAULT '{}',
        truncated INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(request_log_id) REFERENCES request_logs(id) ON DELETE CASCADE,
        UNIQUE(request_log_id, seq)
      );

      CREATE TABLE IF NOT EXISTS request_log_pending_updates (
        request_id TEXT PRIMARY KEY,
        received_at INTEGER NOT NULL,
        update_bytes INTEGER NOT NULL DEFAULT 0,
        update_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS request_route_hops_request_idx
      ON request_route_hops(request_log_id, seq);

      CREATE INDEX IF NOT EXISTS request_route_traces_request_id_idx
      ON request_route_traces(request_id);
    `);
    ensureRequestLogSchema(database);
    ensureRequestRouteTraceSchema(database);
    ensurePendingRawTraceUpdateSchema(database);
    ensureRawTraceEventSchema(database);
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS request_logs_event_id_idx
      ON request_logs(event_id)
      WHERE event_id <> '';
    `);
    backfillRequestLogStreamFlags(database);

    this.database = database;
    this.pruneOldRequestLogs(database);
    return database;
  }

  private pruneOldRequestLogs(database: SqlDatabase): void {
    const now = new Date();
    const dayKey = formatLocalDayKey(now);
    if (this.lastRetentionCleanupDay === dayKey) {
      return;
    }
    pruneRawTraceEvents(database, now.getTime());

    const cutoff = floorDay(now).toISOString();
    const staleCount = firstNumber(
      queryRows(
        database,
        "SELECT COUNT(*) AS total FROM request_logs WHERE source_usage_id IS NULL AND created_at < ?",
        [cutoff]
      ),
      "total"
    );

    if (staleCount === 0) {
      this.lastRetentionCleanupDay = dayKey;
      return;
    }

    const refs = queryRows(
      database,
      `
        SELECT request_body_ref, response_body_ref
        FROM request_logs
        WHERE source_usage_id IS NULL AND created_at < ?
      `,
      [cutoff]
    ).flatMap((row) => [
      normalizeFilterValue(String(row.request_body_ref ?? "")),
      normalizeFilterValue(String(row.response_body_ref ?? ""))
    ]).filter((value): value is string => Boolean(value));

    database.prepare(
      "DELETE FROM request_logs WHERE source_usage_id IS NULL AND created_at < ?",
    ).run(cutoff);
    deleteRequestLogBodyRefs(this.bodyDir, refs);
    this.lastRetentionCleanupDay = dayKey;
  }

  private storePendingRawTraceUpdate(database: SqlDatabase, input: RequestLogRawTraceUpdateInput): void {
    const requestId = input.requestId.trim();
    if (!requestId) return;
    const now = Date.now();
    const serialized = serializePendingRawTraceUpdate(input);
    if (serialized) {
      database.prepare(`
        INSERT INTO request_log_pending_updates (request_id, received_at, update_bytes, update_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(request_id) DO UPDATE SET
          received_at = excluded.received_at,
          update_bytes = excluded.update_bytes,
          update_json = excluded.update_json
      `).run(requestId, now, serialized.bytes, serialized.json);
    }
    prunePendingRawTraceUpdates(database, now, this.bodyDir);
  }

  private takePendingRawTraceUpdate(database: SqlDatabase, requestId: string): RequestLogRawTraceUpdateInput | undefined {
    const row = queryRows(
      database,
      "SELECT update_json FROM request_log_pending_updates WHERE request_id = ? LIMIT 1",
      [requestId]
    )[0];
    if (!row) return undefined;
    database.prepare("DELETE FROM request_log_pending_updates WHERE request_id = ?").run(requestId);
    const parsed = parseJson(String(row.update_json ?? ""));
    return isRecord(parsed) ? parsed as RequestLogRawTraceUpdateInput : undefined;
  }

  private prepareRawTraceInput(
    input: RequestLogRawTraceUpdateInput,
    rawTraceFiles?: RequestLogRawTraceFiles
  ): RequestLogRawTraceUpdateInput {
    const next: RequestLogRawTraceUpdateInput = { ...input };
    const requestBody = storeRawTraceBodyFile(this.bodyDir, rawTraceFiles?.requestBody);
    if (requestBody) {
      next.requestBodyRef = requestBody.bodyRef;
      if (!requestBody.truncated) next.requestBodyText ??= requestBody.previewText;
      next.requestBodyContentType ??= requestBody.contentType;
      next.requestBodySizeBytes = Math.max(normalizeCount(next.requestBodySizeBytes), requestBody.sizeBytes);
      next.requestBodyTruncated = Boolean(next.requestBodyTruncated) || requestBody.truncated;
    }
    const responseBody = storeRawTraceBodyFile(this.bodyDir, rawTraceFiles?.responseBody);
    if (responseBody) {
      next.responseBodyRef = responseBody.bodyRef;
      if (!responseBody.truncated) next.responseBodyText ??= responseBody.previewText;
      next.responseBodyContentType ??= responseBody.contentType;
      next.responseBodySizeBytes = Math.max(normalizeCount(next.responseBodySizeBytes), responseBody.sizeBytes);
      next.responseBodyTruncated = Boolean(next.responseBodyTruncated) || responseBody.truncated;
    }
    return this.prepareRawTraceTextBodies(next);
  }

  private prepareRawTraceTextBodies(input: RequestLogRawTraceUpdateInput): RequestLogRawTraceUpdateInput {
    const next: RequestLogRawTraceUpdateInput = { ...input };
    if (!next.requestBodyRef && next.requestBodyText !== undefined) {
      const stored = storeBodyBuffer(this.bodyDir, Buffer.from(next.requestBodyText), next.requestBodyRef);
      if (stored) {
        next.requestBodyRef = stored.bodyRef;
        next.requestBodySizeBytes = Math.max(Buffer.byteLength(next.requestBodyText), normalizeCount(next.requestBodySizeBytes));
      }
    }
    if (!next.responseBodyRef && next.responseBodyText !== undefined) {
      const stored = storeBodyBuffer(this.bodyDir, Buffer.from(next.responseBodyText), next.responseBodyRef);
      if (stored) {
        next.responseBodyRef = stored.bodyRef;
        next.responseBodySizeBytes = Math.max(Buffer.byteLength(next.responseBodyText), normalizeCount(next.responseBodySizeBytes));
      }
    }
    return next;
  }
}

export const requestLogStore = new RequestLogStore(REQUEST_LOGS_DB_FILE);
export const requestLogRuntime = createRequestLogRuntime({ dbFile: REQUEST_LOGS_DB_FILE });
export { createRequestLogRuntime } from "@ccr/core/observability/request-log-runtime";

export function recordGatewayRequestLog(input: RequestLogRecordInput): RequestLogEnqueueResult {
  return requestLogRuntime.enqueueRecord(input);
}

export function markGatewayRequestLogDropped(requestId: string, reason = "sampled"): void {
  requestLogRuntime.rejectRecord(requestId, reason);
}

export function enqueueGatewayRequestLogFromRawTrace(
  input: RequestLogRawTraceUpdateInput,
  rawTraceFiles?: RequestLogRawTraceFiles
): RequestLogEnqueueResult {
  return requestLogRuntime.enqueueRawTrace(input, rawTraceFiles);
}

export async function updateGatewayRequestLogFromRawTrace(
  input: RequestLogRawTraceUpdateInput,
  rawTraceFiles?: RequestLogRawTraceFiles
): Promise<boolean> {
  return enqueueGatewayRequestLogFromRawTrace(input, rawTraceFiles).accepted;
}

export async function getRequestLogs(filter?: RequestLogListFilter): Promise<RequestLogPage> {
  try {
    return await requestLogRuntime.list(filter);
  } catch (error) {
    console.warn(`[request-log] Failed to read request logs: ${formatError(error)}`);
    throw error;
  }
}

export async function getRequestLogDetail(request: RequestLogDetailRequest): Promise<RequestLogEntry | undefined> {
  try {
    return await requestLogRuntime.getDetail(request);
  } catch (error) {
    console.warn(`[request-log] Failed to read request log detail: ${formatError(error)}`);
    throw error;
  }
}

export async function getRequestLogBodyChunk(request: RequestLogBodyChunkRequest): Promise<RequestLogBodyChunk | undefined> {
  try {
    return await requestLogRuntime.getBodyChunk(request);
  } catch (error) {
    console.warn(`[request-log] Failed to read request log body chunk: ${formatError(error)}`);
    throw error;
  }
}

export async function getAgentAnalysis(filter?: AgentAnalysisFilter): Promise<AgentAnalysisSnapshot> {
  try {
    return await requestLogRuntime.analyze(filter);
  } catch (error) {
    console.warn(`[request-log] Failed to analyze agent logs: ${formatError(error)}`);
    throw error;
  }
}

export async function getAgentTracePayload(request: AgentAnalysisTracePayloadRequest): Promise<AgentAnalysisTracePayloadFullResult> {
  try {
    return await requestLogRuntime.getTracePayload(request);
  } catch (error) {
    console.warn(`[request-log] Failed to read agent trace payload: ${formatError(error)}`);
    throw error;
  }
}

export async function flushRequestLogRuntime(timeoutMs = 2_000): Promise<{ pending: number; timedOut: boolean }> {
  return await requestLogRuntime.flush({ timeoutMs });
}

export async function closeRequestLogRuntime(timeoutMs = 2_000): Promise<void> {
  await requestLogRuntime.close({ timeoutMs });
}

function toAnalyzedAgentRequest(entry: StoredRequestLogEntry): AnalyzedAgentRequest {
  const details = extractAgentLogDetails(entry);
  const startedAtMs = parseDateMs(entry.createdAt);
  const completedAtMs = parseDateMs(entry.completedAt);
  const endedAtMs = Math.max(
    startedAtMs + 1,
    completedAtMs > startedAtMs ? completedAtMs : startedAtMs + Math.max(0, entry.durationMs)
  );

  return {
    agent: details.agent,
    cacheReadTokens: entry.cacheReadTokens,
    cacheWriteTokens: entry.cacheWriteTokens,
    client: entry.client,
    completedAt: entry.completedAt,
    concurrentRequests: 1,
    ...(details.conversationMessages ? { conversation: buildAgentConversationTurn(entry, details) } : {}),
    costUsd: entry.costUsd,
    createdAt: entry.createdAt,
    durationMs: entry.durationMs,
    endedAtMs,
    error: entry.error || undefined,
    id: entry.id,
    inputTokens: entry.inputTokens,
    method: entry.method,
    model: entry.model,
    ok: entry.ok,
    outputTokens: entry.outputTokens,
    path: entry.path,
    provider: entry.provider,
    requestBody: bodyMetaForAnalysis(entry.requestBody) ?? emptyBody(),
    requestId: entry.requestId,
    routeReason: details.routeReason,
    sessionId: details.sessionId,
    startedAtMs,
    statusCode: entry.statusCode,
    responseBody: bodyMetaForAnalysis(entry.responseBody),
    subagentModel: details.subagentModel,
    toolCallCount: details.tools.length,
    toolCalls: details.toolCalls,
    toolResults: details.toolResults,
    tools: details.tools,
    totalTokens: entry.totalTokens,
    userAgent: details.userAgent
  };
}

function agentAnalysisCacheKey(filter: AgentAnalysisFilter): string {
  return JSON.stringify({
    agent: normalizeAgentFilter(filter.agent),
    range: normalizeAgentAnalysisRange(filter.range),
    sessionAgent: normalizeAgentFilter(filter.sessionAgent),
    sessionId: normalizeFilterValue(filter.sessionId)
  });
}

function extractAgentLogDetails(entry: StoredRequestLogEntry): AgentLogDetails {
  const requestPayloads = parseLogBodyPayloads(entry.requestBody);
  const responsePayloads = parseLogBodyPayloads(entry.responseBody);
  const routeReason = readHeaderValue(entry.requestHeaders, "x-ccr-route-reason");
  const routedModel = readHeaderValue(entry.requestHeaders, "x-ccr-routed-model");
  const subagentModel = extractSubagentModel(entry, requestPayloads, routeReason, routedModel);
  const agent = inferAgentKind(entry, requestPayloads, responsePayloads);
  const toolCalls = extractToolCalls(responsePayloads);
  const toolResults = extractToolResults([...requestPayloads, ...responsePayloads], entry);
  const conversationMessages = extractConversationMessages(entry, requestPayloads, responsePayloads, toolCalls);

  return {
    agent,
    conversationMessages,
    routeReason,
    sessionId: extractAgentSessionId(entry, requestPayloads, agent),
    subagentModel,
    toolCalls,
    toolResults,
    tools: toolCalls.map((tool) => tool.name),
    userAgent: readAgentUserAgent(entry.requestHeaders)
  };
}

function buildAgentConversationTurn(
  entry: StoredRequestLogEntry,
  details: AgentLogDetails
): AgentAnalysisConversationTurn {
  return {
    agent: details.agent,
    ...(details.conversationMessages?.assistant ? { assistant: details.conversationMessages.assistant } : {}),
    createdAt: entry.createdAt,
    durationMs: entry.durationMs,
    id: entry.id,
    ...(details.conversationMessages?.messages ? { messages: details.conversationMessages.messages } : {}),
    model: entry.model,
    provider: entry.provider,
    requestId: entry.requestId,
    sessionId: details.sessionId,
    statusCode: entry.statusCode,
    ...(details.conversationMessages?.user ? { user: details.conversationMessages.user } : {})
  };
}

function inferAgentKind(
  entry: StoredRequestLogEntry,
  requestPayloads: unknown[],
  responsePayloads: unknown[]
): AgentKind {
  const headerAgent = inferAgentFromText(readAgentHeaderSignals(entry.requestHeaders));
  if (headerAgent) {
    return headerAgent;
  }

  const haystack = [
    entry.path,
    entry.url,
    JSON.stringify(entry.responseHeaders),
    stringifyForSearch(requestPayloads),
    stringifyForSearch(responsePayloads)
  ].join(" ").toLowerCase();

  const bodyAgent = inferAgentFromText(haystack, {
    allowStandaloneCodex: false,
    allowStandaloneGrok: false,
    allowStandaloneKilo: false,
    allowStandaloneKimi: false,
    allowStandaloneOpenCode: false
  });
  if (bodyAgent) {
    return bodyAgent;
  }
  if (
    Boolean(readHeaderValue(entry.requestHeaders, "x-claude-code-session-id")) ||
    requestPayloads.some(hasClaudeCodeSessionMetadata)
  ) {
    return "claude-code";
  }

  return "unknown";
}

function readAgentHeaderSignals(headers: Record<string, string | string[]>): string {
  const values: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === "user-agent" ||
      normalizedKey === "x-user-agent" ||
      normalizedKey === "x-client-user-agent" ||
      normalizedKey === "x-ccr-client" ||
      normalizedKey === "x-client-name" ||
      normalizedKey.includes("user-agent") ||
      normalizedKey.endsWith("-ua")
    ) {
      values.push(Array.isArray(value) ? value.join(" ") : value);
    }
  }
  return values.join(" ").toLowerCase();
}

function readAgentUserAgent(headers: Record<string, string | string[]>): string | undefined {
  return (
    readHeaderValue(headers, "user-agent") ||
    readHeaderValue(headers, "x-user-agent") ||
    readHeaderValue(headers, "x-client-user-agent")
  );
}

function inferAgentFromText(value: string, options: AgentTextSignalOptions = {}): AgentKind | undefined {
  const normalized = value.toLowerCase();
  const allowStandaloneCodex = options.allowStandaloneCodex ?? true;
  const allowStandaloneGrok = options.allowStandaloneGrok ?? true;
  const allowStandaloneKilo = options.allowStandaloneKilo ?? true;
  const allowStandaloneKimi = options.allowStandaloneKimi ?? true;
  const allowStandaloneOpenCode = options.allowStandaloneOpenCode ?? true;
  if (normalized.includes("claude design") || normalized.includes("claude-design") || normalized.includes("claude.ai/design")) {
    return "claude-design";
  }
  if (
    normalized.includes("zcode") ||
    normalized.includes("z-code") ||
    normalized.includes("z code") ||
    /(^|[^a-z0-9])zcode([/_\s-]|$)/.test(normalized)
  ) {
    return "zcode";
  }
  if (
    allowStandaloneOpenCode && (
      normalized.includes("opencode") ||
      normalized.includes("open-code") ||
      normalized.includes("open code") ||
      /(^|[^a-z0-9])opencode([/_\s-]|$)/.test(normalized)
    )
  ) {
    return "opencode";
  }
  if (
    normalized === "pi" ||
    normalized.includes("pi-coding-agent") ||
    normalized.includes("pi coding agent") ||
    normalized.includes("pi_coding_agent")
  ) {
    return "pi";
  }
  if (
    normalized.includes("xai-grok-cli") ||
    (allowStandaloneGrok && (
      normalized.includes("grok-cli") ||
      normalized.includes("grok cli") ||
      /(^|[^a-z0-9])grok([/_\s-]|$)/.test(normalized)
    ))
  ) {
    return "grok";
  }
  if (
    normalized.includes("kimi-code-cli") ||
    normalized.includes("kimi_code_cli") ||
    (allowStandaloneKimi && (
      normalized.includes("kimi-cli") ||
      normalized.includes("kimi cli") ||
      /(^|[^a-z0-9])kimi([/_\s-]|$)/.test(normalized)
    ))
  ) {
    return "kimi";
  }
  if (
    normalized.includes("kilo-code-cli") ||
    normalized.includes("kilo_code_cli") ||
    normalized.includes("kilocode") ||
    (allowStandaloneKilo && (
      normalized.includes("kilo-cli") ||
      normalized.includes("kilo cli") ||
      /(^|[^a-z0-9])kilo([/_\s-]|$)/.test(normalized)
    ))
  ) {
    return "kilo";
  }
  if (
    normalized.includes("workbuddy") ||
    normalized.includes("work-buddy") ||
    normalized.includes("work buddy") ||
    /(^|[^a-z0-9])workbuddy([/_\s-]|$)/.test(normalized)
  ) {
    return "workbuddy";
  }
  if (
    normalized.includes("openai-codex") ||
    normalized.includes("codex_cli") ||
    normalized.includes("codex-cli") ||
    (allowStandaloneCodex && /(^|[^a-z0-9])codex([/_\s-]|$)/.test(normalized))
  ) {
    return "codex";
  }
  if (
    normalized.includes("@anthropic-ai/claude-code") ||
    normalized.includes("claude-code") ||
    normalized.includes("claude code") ||
    normalized.includes("claude_cli") ||
    normalized.includes("claude-cli")
  ) {
    return "claude-code";
  }
  return undefined;
}

function extractAgentSessionId(entry: StoredRequestLogEntry, requestPayloads: unknown[], agent: AgentKind): string {
  const fromHeaders = readAgentSessionHeader(entry.requestHeaders, agent);
  if (fromHeaders) {
    return fromHeaders;
  }

  for (const payload of requestPayloads) {
    const fromPayload = extractSessionIdFromPayload(payload);
    if (fromPayload) {
      return fromPayload;
    }
  }

  return `request:${entry.requestId || entry.id}`;
}

function readAgentSessionHeader(headers: Record<string, string | string[]>, agent: AgentKind): string | undefined {
  const commonHeaders = [
    "x-agent-session-id",
    "x-session-id",
    "session-id",
    "x-conversation-id",
    "conversation-id",
    "x-thread-id",
    "thread-id",
    "x-chat-id",
    "chat-id"
  ];
  const claudeCodeHeaders = [
    "x-claude-code-session-id",
    "x-claude-session-id",
    "claude-code-session-id",
    "claude-session-id"
  ];
  const codexHeaders = [
    "x-codex-session-id",
    "codex-session-id",
    "x-codex-conversation-id",
    "codex-conversation-id",
    "x-openai-session-id",
    "openai-session-id",
    "x-openai-conversation-id",
    "openai-conversation-id",
    "x-openai-thread-id",
    "openai-thread-id"
  ];
  const zcodeHeaders = [
    "x-zcode-session-id",
    "zcode-session-id",
    "x-zcode-conversation-id",
    "zcode-conversation-id",
    "x-zcode-thread-id",
    "zcode-thread-id",
    "x-z-code-session-id",
    "z-code-session-id"
  ];
  const workbuddyHeaders = [
    "x-workbuddy-session-id",
    "workbuddy-session-id",
    "x-workbuddy-conversation-id",
    "workbuddy-conversation-id",
    "x-workbuddy-thread-id",
    "workbuddy-thread-id",
    "x-work-buddy-session-id",
    "work-buddy-session-id"
  ];
  const piHeaders = [
    "x-pi-session-id",
    "pi-session-id",
    "x-pi-conversation-id",
    "pi-conversation-id",
    "x-pi-thread-id",
    "pi-thread-id"
  ];
  const orderedHeaders = agent === "zcode"
    ? [...zcodeHeaders, ...codexHeaders, ...commonHeaders, ...claudeCodeHeaders]
    : agent === "workbuddy"
      ? [...workbuddyHeaders, ...codexHeaders, ...commonHeaders, ...claudeCodeHeaders]
    : agent === "pi"
      ? [...piHeaders, ...commonHeaders, ...codexHeaders, ...claudeCodeHeaders]
    : agent === "codex"
    ? [...codexHeaders, ...commonHeaders, ...claudeCodeHeaders]
    : agent === "claude-code"
      ? [...claudeCodeHeaders, ...commonHeaders, ...codexHeaders, ...zcodeHeaders]
      : [...claudeCodeHeaders, ...codexHeaders, ...zcodeHeaders, ...commonHeaders];

  for (const name of orderedHeaders) {
    const value = readHeaderValue(headers, name);
    if (value) {
      return value;
    }
  }

  return readFuzzySessionHeader(headers);
}

function readFuzzySessionHeader(headers: Record<string, string | string[]>): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();
    if (!isSessionLikeKey(normalizedKey) || isRequestScopedKey(normalizedKey)) {
      continue;
    }
    const normalizedValue = normalizeFilterValue(Array.isArray(value) ? value[0] : value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }
  return undefined;
}

function extractSessionIdFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const direct =
    asString(payload.session_id) ||
    asString(payload.sessionId) ||
    asString(payload.conversation_id) ||
    asString(payload.conversationId) ||
    asString(payload.chat_id) ||
    asString(payload.chatId) ||
    asString(payload.thread_id) ||
    asString(payload.threadId);
  if (direct) {
    return direct;
  }

  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  const metadataSession =
    asString(metadata?.session_id) ||
    asString(metadata?.sessionId) ||
    asString(metadata?.conversation_id) ||
    asString(metadata?.conversationId) ||
    asString(metadata?.chat_id) ||
    asString(metadata?.chatId);
  if (metadataSession) {
    return metadataSession;
  }

  const userId = asString(metadata?.user_id);
  if (userId?.includes("_session_")) {
    return userId.split("_session_").at(-1)?.trim() || undefined;
  }

  return findSessionIdInPayload(payload);
}

function findSessionIdInPayload(value: unknown, depth = 0): string | undefined {
  if (depth > 4) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSessionIdInPayload(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (isSessionLikeKey(normalizedKey) && !isRequestScopedKey(normalizedKey)) {
      const candidate = asString(item);
      if (candidate) {
        return candidate;
      }
    }
  }
  for (const item of Object.values(value)) {
    const found = findSessionIdInPayload(item, depth + 1);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function isSessionLikeKey(key: string): boolean {
  return (
    key.includes("session") ||
    key.includes("conversation") ||
    key.includes("thread") ||
    key === "chat_id" ||
    key === "chatid" ||
    key === "chat-id"
  );
}

function isRequestScopedKey(key: string): boolean {
  return (
    key.includes("request") ||
    key.includes("trace") ||
    key.includes("span") ||
    key.includes("message") ||
    key.includes("event") ||
    key.includes("parent")
  );
}

function hasClaudeCodeSessionMetadata(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  return Boolean(asString(metadata?.user_id)?.includes("_session_"));
}

function extractSubagentModel(
  entry: StoredRequestLogEntry,
  requestPayloads: unknown[],
  routeReason: string | undefined,
  routedModel: string | undefined
): string | undefined {
  if (routeReason?.toLowerCase().includes("subagent")) {
    return routedModel || entry.model;
  }

  for (const payload of requestPayloads) {
    const model = extractPayloadSubagentModel(payload);
    if (model) {
      return model;
    }
  }

  return undefined;
}

function extractPayloadSubagentModel(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const systemModel = extractSubagentModelFromContent(payload.system);
  if (systemModel) {
    return systemModel;
  }

  if (!Array.isArray(payload.messages)) {
    return undefined;
  }
  for (const message of payload.messages.slice(0, 2)) {
    if (!isRecord(message) || message.role !== "user") {
      continue;
    }
    const model = extractSubagentModelFromContent(message.content);
    if (model) {
      return model;
    }
  }
  return undefined;
}

function extractSubagentModelFromContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return extractSubagentModelFromText(content);
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const block of content) {
    const text = typeof block === "string"
      ? block
      : isRecord(block) && typeof block.text === "string"
        ? block.text
        : undefined;
    const model = text ? extractSubagentModelFromText(text) : undefined;
    if (model) {
      return model;
    }
  }
  return undefined;
}

function extractSubagentModelFromText(text: string): string | undefined {
  const match = text.match(/<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s);
  const model = match?.[1]?.trim();
  return model && model.toLowerCase() !== "provider/model" ? model : undefined;
}

function parseLogBodyPayloads(body: RequestLogBody | undefined): unknown[] {
  if (!body || body.encoding !== "utf8" || !body.text.trim()) {
    return [];
  }

  const parsed = parseJson(body.text.trim());
  if (parsed !== undefined) {
    return [parsed];
  }

  return parseStreamPayloads(body.text);
}

function extractConversationMessages(
  entry: StoredRequestLogEntry,
  requestPayloads: unknown[],
  responsePayloads: unknown[],
  toolCalls: AgentToolCallDetail[]
): AgentConversationMessages | undefined {
  const userText = latestUserText(requestPayloads);
  const assistantText = assistantTextFromPayloads(responsePayloads) ?? toolCallConversationText(toolCalls);
  const user = conversationMessagePreview(userText, entry.requestBody);
  const assistant = conversationMessagePreview(assistantText, entry.responseBody);
  const messages = conversationItemsFromPayloads(entry, requestPayloads, assistantText);
  if (!user && !assistant && messages.length === 0) {
    return undefined;
  }
  return {
    ...(assistant ? { assistant } : {}),
    ...(messages.length > 0 ? { messages } : {}),
    ...(user ? { user } : {})
  };
}

function latestUserText(payloads: unknown[]): string | undefined {
  const candidates = payloads.flatMap(userTextCandidates);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = normalizeConversationText(candidates[index]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function userTextCandidates(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return [];
  }

  const candidates: string[] = [];
  if (Array.isArray(payload.messages)) {
    for (const message of payload.messages) {
      if (!isRecord(message) || asString(message.role) !== "user") {
        continue;
      }
      const text = contentText(message.content ?? message.text);
      if (text) candidates.push(text);
    }
  }

  if (typeof payload.input === "string") {
    candidates.push(payload.input);
  } else if (Array.isArray(payload.input)) {
    for (const item of payload.input) {
      if (typeof item === "string") {
        candidates.push(item);
      } else if (isRecord(item) && asString(item.role) === "user") {
        const text = contentText(item.content ?? item.text ?? item.input);
        if (text) candidates.push(text);
      }
    }
  }

  if (Array.isArray(payload.contents)) {
    candidates.push(...geminiContentTexts(payload.contents, "user"));
  }

  const prompt = asString(payload.prompt);
  if (prompt) {
    candidates.push(prompt);
  }
  return candidates;
}

function conversationItemsFromPayloads(
  entry: StoredRequestLogEntry,
  requestPayloads: unknown[],
  assistantText: string | undefined
): AgentAnalysisConversationItem[] {
  const items: AgentAnalysisConversationItem[] = [];

  requestPayloads.forEach((payload, payloadIndex) => {
    items.push(...requestConversationItems(payload, entry.requestBody, `request:${payloadIndex}`));
  });

  if (items.length === 0) {
    const latestUser = latestUserText(requestPayloads);
    const user = conversationItemPreview("user", latestUser, entry.requestBody, "request:fallback:user");
    if (user) {
      items.push(user);
    }
  }

  const assistant = conversationItemPreview("assistant", assistantText, entry.responseBody, "response:assistant");
  if (assistant) {
    items.push(assistant);
  }

  return dedupeConversationItems(items);
}

function requestConversationItems(
  payload: unknown,
  body: RequestLogBody | undefined,
  idPrefix: string
): AgentAnalysisConversationItem[] {
  if (!isRecord(payload)) {
    return [];
  }

  const items: AgentAnalysisConversationItem[] = [];
  const systemText = contentText(payload.system ?? payload.system_prompt ?? payload.systemPrompt ?? payload.instructions);
  const system = conversationItemPreview("system", systemText, body, `${idPrefix}:system`);
  if (system) {
    items.push(system);
  }

  if (Array.isArray(payload.messages)) {
    payload.messages.forEach((message, index) => {
      const item = conversationItemFromMessage(message, body, `${idPrefix}:messages:${index}`);
      if (item) {
        items.push(item);
      }
    });
  }

  if (Array.isArray(payload.input)) {
    payload.input.forEach((message, index) => {
      const item = conversationItemFromMessage(message, body, `${idPrefix}:input:${index}`);
      if (item) {
        items.push(item);
      }
    });
  } else if (typeof payload.input === "string") {
    const item = conversationItemPreview("user", payload.input, body, `${idPrefix}:input`);
    if (item) {
      items.push(item);
    }
  }

  if (Array.isArray(payload.contents)) {
    payload.contents.forEach((message, index) => {
      const item = conversationItemFromGeminiContent(message, body, `${idPrefix}:contents:${index}`);
      if (item) {
        items.push(item);
      }
    });
  }

  const prompt = asString(payload.prompt);
  if (prompt) {
    const item = conversationItemPreview("user", prompt, body, `${idPrefix}:prompt`);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

function conversationItemFromMessage(
  value: unknown,
  body: RequestLogBody | undefined,
  id: string
): AgentAnalysisConversationItem | undefined {
  if (typeof value === "string") {
    return conversationItemPreview("user", value, body, id);
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const role = normalizeConversationRole(asString(value.role) ?? asString(value.type));
  const content = contentText(value.content ?? value.text ?? value.input ?? value.output);
  return conversationItemPreview(conversationRoleForContent(role, content), content, body, id);
}

function conversationItemFromGeminiContent(
  value: unknown,
  body: RequestLogBody | undefined,
  id: string
): AgentAnalysisConversationItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const role = normalizeConversationRole(asString(value.role));
  const content = contentText(value.parts ?? value.content ?? value.text);
  return conversationItemPreview(conversationRoleForContent(role, content), content, body, id);
}

function conversationItemPreview(
  role: AgentAnalysisConversationRole,
  value: string | undefined,
  body: RequestLogBody | undefined,
  id: string
): AgentAnalysisConversationItem | undefined {
  const normalized = normalizeConversationText(value);
  if (!normalized) {
    return undefined;
  }
  return {
    content: normalized,
    id,
    role,
    sourcePreview: Boolean(body?.preview),
    sourceTruncated: Boolean(body?.truncated),
    truncated: false
  };
}

function normalizeConversationRole(value: string | undefined): AgentAnalysisConversationRole {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "assistant" || normalized === "model") return "assistant";
  if (normalized === "developer") return "developer";
  if (normalized === "system") return "system";
  if (normalized === "tool" || normalized === "function" || normalized === "function_call_output" || normalized === "tool_result") return "tool";
  if (normalized === "context" || normalized === "system-reminder") return "context";
  return "user";
}

function conversationRoleForContent(role: AgentAnalysisConversationRole, content: string | undefined): AgentAnalysisConversationRole {
  if (role !== "user") {
    return role;
  }
  const normalized = content?.trim().toLowerCase() ?? "";
  if (
    normalized.startsWith("<system-reminder>") ||
    normalized.startsWith("current runtime context.") ||
    normalized.startsWith("this snapshot supersedes earlier runtime-context snapshots.")
  ) {
    return "context";
  }
  return role;
}

function dedupeConversationItems(items: AgentAnalysisConversationItem[]): AgentAnalysisConversationItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.role}\n${item.content}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function assistantTextFromPayloads(payloads: unknown[]): string | undefined {
  let streamed = "";
  const fullTexts: string[] = [];
  for (const payload of payloads) {
    streamed += assistantStreamText(payload);
    fullTexts.push(...assistantFullTextCandidates(payload));
  }

  const streamedText = normalizeConversationText(streamed);
  if (streamedText) {
    return streamedText;
  }
  return normalizeConversationText(fullTexts.join("\n\n")) || undefined;
}

function assistantStreamText(payload: unknown): string {
  if (Array.isArray(payload)) {
    return payload.map(assistantStreamText).join("");
  }
  if (!isRecord(payload)) {
    return "";
  }

  const chunks: string[] = [];
  const type = asString(payload.type);
  const delta = isRecord(payload.delta) ? payload.delta : undefined;
  if ((type === "content_block_start" || type === "content_block_delta") && delta) {
    const text = asString(delta.text) || asString(delta.partial_json);
    if (text && asString(delta.type) !== "input_json_delta") {
      chunks.push(text);
    }
  }
  if (type === "content_block_start" && isRecord(payload.content_block)) {
    const text = contentText(payload.content_block);
    if (text) chunks.push(text);
  }
  if (
    type === "response.output_text.delta" ||
    type === "response.refusal.delta" ||
    type === "response.output_text.done" ||
    type === "response.refusal.done"
  ) {
    const text = asString(payload.delta) || asString(payload.text);
    if (text) chunks.push(text);
  }
  if (type === "response.content_part.done" && isRecord(payload.part)) {
    const text = contentText(payload.part);
    if (text) chunks.push(text);
  }
  if (type === "response.output_item.done" && isRecord(payload.item)) {
    chunks.push(...assistantFullTextCandidates(payload.item));
  }

  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      if (!isRecord(choice)) continue;
      const choiceDelta = isRecord(choice.delta) ? choice.delta : undefined;
      const text = contentText(choiceDelta?.content ?? choiceDelta?.text);
      if (text) chunks.push(text);
    }
  }
  return chunks.join("");
}

function assistantFullTextCandidates(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.flatMap(assistantFullTextCandidates);
  }
  if (!isRecord(payload)) {
    return [];
  }

  const candidates: string[] = [];
  const payloadType = asString(payload.type);
  const outputText = asString(payload.output_text);
  if (outputText) {
    candidates.push(outputText);
    return candidates;
  }
  if (payloadType === "response.output_text.done" || payloadType === "response.refusal.done") {
    const text = asString(payload.text);
    if (text) candidates.push(text);
  }

  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      if (!isRecord(choice)) continue;
      const message = isRecord(choice.message) ? choice.message : undefined;
      const text = contentText(message?.content ?? message?.text);
      if (text) candidates.push(text);
    }
  }

  const message = isRecord(payload.message) ? payload.message : undefined;
  if (message && (asString(message.role) === "assistant" || message.content !== undefined || message.text !== undefined)) {
    const text = contentText(message.content ?? message.text);
    if (text) candidates.push(text);
  }

  const role = asString(payload.role);
  if (role === "assistant") {
    const text = contentText(payload.content ?? payload.text);
    if (text) candidates.push(text);
  } else if (payload.content !== undefined && !Array.isArray(payload.messages)) {
    const text = contentText(payload.content);
    if (text) candidates.push(text);
  }

  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!isRecord(item)) continue;
      const itemType = asString(item.type);
      const itemRole = asString(item.role);
      if (itemType === "message" || itemRole === "assistant") {
        const text = contentText(item.content ?? item.text);
        if (text) candidates.push(text);
      } else if (itemType === "output_text") {
        const text = contentText(item.text ?? item.content);
        if (text) candidates.push(text);
      }
    }
  }

  if (isRecord(payload.response)) {
    const responseText = asString(payload.response.output_text);
    if (responseText) {
      candidates.push(responseText);
    } else {
      candidates.push(...assistantFullTextCandidates(payload.response));
    }
  }

  if (isRecord(payload.part)) {
    const text = contentText(payload.part);
    if (text) candidates.push(text);
  }

  if (isRecord(payload.item)) {
    candidates.push(...assistantFullTextCandidates(payload.item));
  }

  if (Array.isArray(payload.candidates)) {
    for (const candidate of payload.candidates) {
      if (!isRecord(candidate)) continue;
      const content = isRecord(candidate.content) ? candidate.content : undefined;
      const text = contentText(content?.parts ?? content?.content ?? content);
      if (text) candidates.push(text);
    }
  }

  return candidates;
}

function geminiContentTexts(contents: unknown[], role: "model" | "user"): string[] {
  const texts: string[] = [];
  for (const content of contents) {
    if (!isRecord(content) || asString(content.role) !== role) {
      continue;
    }
    const text = contentText(content.parts ?? content.content ?? content.text);
    if (text) texts.push(text);
  }
  return texts;
}

function contentText(value: unknown): string | undefined {
  const parts: string[] = [];
  collectContentText(value, parts);
  return normalizeConversationText(parts.join("\n"));
}

function collectContentText(value: unknown, parts: string[]): void {
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectContentText(item, parts);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const type = asString(value.type)?.toLowerCase() ?? "";
  if (type === "tool_result" || type === "function_call_output" || type === "tool_call_output") {
    return;
  }
  if (type.includes("image")) {
    parts.push("[image]");
    return;
  }
  if (type.includes("audio")) {
    parts.push("[audio]");
    return;
  }
  if (isRecord(value.inline_data) || isRecord(value.inlineData)) {
    parts.push("[media]");
    return;
  }

  const text =
    asString(value.text) ??
    asString(value.input_text) ??
    asString(value.output_text);
  if (text) {
    parts.push(text);
    return;
  }
  if (value.content !== undefined) {
    collectContentText(value.content, parts);
    return;
  }
  if (Array.isArray(value.parts)) {
    collectContentText(value.parts, parts);
  }
}

function toolCallConversationText(toolCalls: AgentToolCallDetail[]): string | undefined {
  if (toolCalls.length === 0) {
    return undefined;
  }
  return toolCalls.map((tool) => {
    const input = tool.input?.preview.trim();
    return input ? `Tool call: ${tool.name}\n${input}` : `Tool call: ${tool.name}`;
  }).join("\n\n");
}

function conversationMessagePreview(
  value: string | undefined,
  body: RequestLogBody | undefined
): AgentAnalysisConversationMessage | undefined {
  const normalized = normalizeConversationText(value);
  if (!normalized) {
    return undefined;
  }
  return {
    content: normalized,
    sourcePreview: Boolean(body?.preview),
    sourceTruncated: Boolean(body?.truncated),
    truncated: false
  };
}

function normalizeConversationText(value: string | undefined): string {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function extractToolCalls(payloads: unknown[]): AgentToolCallDetail[] {
  const calls = new Map<string, AgentToolCallDetail>();
  for (const payload of payloads) {
    collectToolCalls(payload, calls);
  }
  for (const [id, tool] of collectStreamedToolCallInputs(payloads)) {
    const input = payloadPreview(tool.input);
    const existing = calls.get(id);
    calls.set(id, {
      id,
      input: input ?? existing?.input,
      name: existing?.name || tool.name || "tool"
    });
  }
  return Array.from(calls.values());
}

function collectToolCalls(value: unknown, calls: Map<string, AgentToolCallDetail>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolCalls(item, calls);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const type = asString(value.type);
  const functionRecord = isRecord(value.function) ? value.function : undefined;
  const functionArguments = functionRecord
    ? functionRecord.arguments ?? functionRecord.parameters ?? functionRecord.input
    : undefined;
  const name =
    asString(value.name) ||
    asString(value.tool) ||
    asString(value.tool_name) ||
    asString(functionRecord?.name);
  const looksLikeToolCall =
    type === "tool_use" ||
    type === "server_tool_use" ||
    type === "mcp_tool_use" ||
    type === "function_call" ||
    type === "tool_call" ||
    type === "tool_block_complete" ||
    type === "tool_delta" ||
    Boolean(functionRecord?.name);

  if (looksLikeToolCall && name) {
    const explicitKey =
      asString(value.id) ||
      asString(value.call_id) ||
      asString(value.tool_call_id);
    if (!explicitKey && functionRecord && streamIndexKey(value.index)) {
      return;
    }
    const key = explicitKey || `${name}:${calls.size}`;
    calls.set(key, {
      id: key,
      input: payloadPreview(value.input ?? value.arguments ?? value.parameters ?? functionArguments),
      name
    });
  }

  for (const item of Object.values(value)) {
    collectToolCalls(item, calls);
  }
}

function collectStreamedToolCallInputs(payloads: unknown[]): Map<string, StreamedToolCallInput> {
  const state: ToolCallStreamState = {
    calls: new Map(),
    indexToId: new Map()
  };
  for (const payload of payloads) {
    collectStreamedToolCallInput(payload, state);
  }

  const resolved = new Map<string, StreamedToolCallInput>();
  for (const [id, tool] of state.calls) {
    const joined = tool.fragments.join("");
    const input = joined.trim()
      ? parseJsonLikeValue(joined)
      : tool.input;
    if (input === undefined) {
      continue;
    }
    resolved.set(id, {
      ...tool,
      input
    });
  }
  return resolved;
}

function collectStreamedToolCallInput(value: unknown, state: ToolCallStreamState): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStreamedToolCallInput(item, state);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  collectAnthropicStreamToolInput(value, state);
  collectOpenAiStreamToolInput(value, state);

  for (const item of Object.values(value)) {
    collectStreamedToolCallInput(item, state);
  }
}

function collectAnthropicStreamToolInput(value: Record<string, unknown>, state: ToolCallStreamState): void {
  const type = asString(value.type);
  const index = streamIndexKey(value.index);
  if (type === "content_block_start" && index && isRecord(value.content_block)) {
    const block = value.content_block;
    const blockType = asString(block.type);
    if (blockType === "tool_use" || blockType === "server_tool_use" || blockType === "mcp_tool_use") {
      const id = asString(block.id);
      if (id) {
        state.indexToId.set(index, id);
        const tool = ensureStreamedToolCall(state, id, asString(block.name));
        if (block.input !== undefined) {
          tool.input = block.input;
        }
      }
    }
    return;
  }

  if (type !== "content_block_delta" || !index || !isRecord(value.delta)) {
    return;
  }

  const delta = value.delta;
  if (asString(delta.type) !== "input_json_delta" || typeof delta.partial_json !== "string") {
    return;
  }

  const id = state.indexToId.get(index);
  if (!id) {
    return;
  }
  ensureStreamedToolCall(state, id).fragments.push(delta.partial_json);
}

function collectOpenAiStreamToolInput(value: Record<string, unknown>, state: ToolCallStreamState): void {
  const functionRecord = isRecord(value.function) ? value.function : undefined;
  if (!functionRecord) {
    return;
  }

  const rawIndex = streamIndexKey(value.index);
  const id = asString(value.id) || asString(value.call_id) || asString(value.tool_call_id);
  const mappedId = rawIndex ? state.indexToId.get(rawIndex) : undefined;
  const key = id || mappedId || (rawIndex ? `tool-index:${rawIndex}` : undefined);
  if (!key) {
    return;
  }

  if (rawIndex && !id && !mappedId) {
    state.indexToId.set(rawIndex, key);
  }
  if (id && rawIndex) {
    remapStreamedToolCall(state, rawIndex, id);
  }

  const tool = ensureStreamedToolCall(state, id || key, asString(functionRecord.name) || asString(value.name));
  const argumentsValue = functionRecord.arguments ?? functionRecord.parameters ?? functionRecord.input;
  if (typeof argumentsValue === "string") {
    tool.fragments.push(argumentsValue);
  } else if (argumentsValue !== undefined) {
    tool.input = argumentsValue;
  }
}

function ensureStreamedToolCall(state: ToolCallStreamState, id: string, name?: string): StreamedToolCallInput {
  const existing = state.calls.get(id);
  if (existing) {
    if (!existing.name && name) {
      existing.name = name;
    }
    return existing;
  }

  const tool: StreamedToolCallInput = {
    fragments: [],
    id,
    name
  };
  state.calls.set(id, tool);
  return tool;
}

function remapStreamedToolCall(state: ToolCallStreamState, index: string, id: string): void {
  const previousId = state.indexToId.get(index);
  state.indexToId.set(index, id);
  if (!previousId || previousId === id) {
    return;
  }

  const previous = state.calls.get(previousId);
  if (!previous) {
    return;
  }

  const next = ensureStreamedToolCall(state, id, previous.name);
  next.fragments.push(...previous.fragments);
  if (next.input === undefined) {
    next.input = previous.input;
  }
  state.calls.delete(previousId);
}

function extractToolResults(payloads: unknown[], entry: AgentToolResultSource): AgentToolResultDetail[] {
  const results = new Map<string, AgentToolResultDetail>();
  for (const payload of payloads) {
    collectToolResults(payload, entry, results);
  }
  return Array.from(results.values());
}

function collectToolResults(
  value: unknown,
  entry: AgentToolResultSource,
  results: Map<string, AgentToolResultDetail>
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolResults(item, entry, results);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const type = asString(value.type);
  const role = asString(value.role);
  const id =
    asString(value.tool_use_id) ||
    asString(value.tool_call_id) ||
    asString(value.call_id) ||
    asString(value.id);
  const looksLikeToolResult =
    isToolResultPayloadType(type) ||
    (role === "tool" && Boolean(value.tool_call_id));

  if (looksLikeToolResult) {
    const result = payloadPreview(value.content ?? value.output ?? value.result ?? value.text);
    if (result) {
      const key = id || `tool-result:${results.size}`;
      results.set(key, {
        id: key,
        requestId: entry.requestId,
        requestLogId: entry.id,
        result
      });
    }
  }

  for (const item of Object.values(value)) {
    collectToolResults(item, entry, results);
  }
}

function isToolResultPayloadType(value: string | undefined): boolean {
  const type = value?.trim().toLowerCase();
  return (
    type === "tool_result" ||
    type === "function_call_output" ||
    type === "tool_call_output" ||
    type === "custom_tool_call_output"
  );
}

function payloadPreview(value: unknown): AgentAnalysisTracePayloadPreview | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = parseJsonLikeValue(value);
  const isText = typeof normalized === "string";
  const kind = isText ? "text" : "json";
  const text = isText ? normalized : stringifyPretty(normalized);
  const sizeBytes = Buffer.byteLength(text, "utf8");
  const truncated = text.length > maxTracePayloadPreviewChars;
  return {
    kind,
    preview: truncated ? `${text.slice(0, maxTracePayloadPreviewChars)}\n...` : text,
    sizeBytes,
    truncated
  };
}

function emptyTracePayloadResult(sourceTruncated = false): AgentAnalysisTracePayloadFullResult {
  return {
    content: "",
    found: false,
    kind: "empty",
    sizeBytes: 0,
    sourceTruncated
  };
}

function fullPayloadResult(value: unknown, sourceTruncated: boolean): AgentAnalysisTracePayloadFullResult {
  if (value === undefined || value === null) {
    return {
      content: "",
      found: true,
      kind: "empty",
      sizeBytes: 0,
      sourceTruncated
    };
  }
  const normalized = parseJsonLikeValue(value);
  const isText = typeof normalized === "string";
  const content = isText ? normalized : stringifyPretty(normalized);
  return {
    content,
    found: true,
    kind: isText ? "text" : "json",
    sizeBytes: Buffer.byteLength(content, "utf8"),
    sourceTruncated
  };
}

function findToolCallPayload(payloads: unknown[], callId: string | undefined): { found: boolean; value?: unknown } {
  const streamedCalls = collectStreamedToolCallInputs(payloads);
  if (callId && streamedCalls.has(callId)) {
    return { found: true, value: streamedCalls.get(callId)?.input };
  }
  if (!callId && streamedCalls.size === 1) {
    return { found: true, value: Array.from(streamedCalls.values())[0].input };
  }

  const calls = new Map<string, unknown>();
  for (const payload of payloads) {
    collectToolCallPayloads(payload, calls);
  }
  if (callId && calls.has(callId)) {
    return { found: true, value: calls.get(callId) };
  }
  if (!callId && calls.size === 1) {
    return { found: true, value: Array.from(calls.values())[0] };
  }
  return { found: false };
}

function collectToolCallPayloads(value: unknown, calls: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolCallPayloads(item, calls);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const type = asString(value.type);
  const functionRecord = isRecord(value.function) ? value.function : undefined;
  const functionArguments = functionRecord
    ? functionRecord.arguments ?? functionRecord.parameters ?? functionRecord.input
    : undefined;
  const name =
    asString(value.name) ||
    asString(value.tool) ||
    asString(value.tool_name) ||
    asString(functionRecord?.name);
  const looksLikeToolCall =
    type === "tool_use" ||
    type === "server_tool_use" ||
    type === "mcp_tool_use" ||
    type === "function_call" ||
    type === "tool_call" ||
    type === "tool_block_complete" ||
    type === "tool_delta" ||
    Boolean(functionRecord?.name);

  if (looksLikeToolCall && name) {
    const key =
      asString(value.id) ||
      asString(value.call_id) ||
      asString(value.tool_call_id) ||
      `${name}:${calls.size}`;
    calls.set(key, value.input ?? value.arguments ?? value.parameters ?? functionArguments);
  }

  for (const item of Object.values(value)) {
    collectToolCallPayloads(item, calls);
  }
}

function findToolResultPayload(payloads: unknown[], callId: string | undefined): { found: boolean; value?: unknown } {
  const results = new Map<string, unknown>();
  for (const payload of payloads) {
    collectToolResultPayloads(payload, results);
  }
  if (callId && results.has(callId)) {
    return { found: true, value: results.get(callId) };
  }
  if (results.size === 1) {
    return { found: true, value: Array.from(results.values())[0] };
  }
  return { found: false };
}

function collectToolResultPayloads(value: unknown, results: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolResultPayloads(item, results);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const type = asString(value.type);
  const role = asString(value.role);
  const id =
    asString(value.tool_use_id) ||
    asString(value.tool_call_id) ||
    asString(value.call_id) ||
    asString(value.id);
  const looksLikeToolResult =
    isToolResultPayloadType(type) ||
    (role === "tool" && Boolean(value.tool_call_id));

  if (looksLikeToolResult) {
    const result = value.content ?? value.output ?? value.result ?? value.text;
    if (result !== undefined) {
      results.set(id || `tool-result:${results.size}`, result);
    }
  }

  for (const item of Object.values(value)) {
    collectToolResultPayloads(item, results);
  }
}

function parseJsonLikeValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || !/^[{\[]/.test(trimmed)) {
    return value;
  }

  return parseJson(trimmed) ?? value;
}

function streamIndexKey(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function stringifyPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return stringifyForSearch(value);
  }
}

function applyRequestConcurrency(requests: AnalyzedAgentRequest[]): AnalyzedAgentRequest[] {
  return requests.map((request) => ({
    ...request,
    concurrentRequests: countConcurrentAt(requests, request.startedAtMs)
  }));
}

function countConcurrentAt(requests: AnalyzedAgentRequest[], timeMs: number): number {
  return requests.filter((request) => request.startedAtMs <= timeMs && request.endedAtMs > timeMs).length || 1;
}

function buildAgentRows(requests: AnalyzedAgentRequest[]): AgentAnalysisAgentRow[] {
  const grouped = groupBy(requests, (request) => request.agent);
  const rows = Array.from(grouped.entries()).map(([agent, items]) => ({
    ...buildAgentAnalysisTotals(items),
    agent,
    key: agent,
    label: agentDisplayName(agent),
    maxShare: 0
  }));
  const max = Math.max(...rows.map((row) => row.totalTokens || row.requestCount), 0);
  return rows
    .map((row) => ({
      ...row,
      maxShare: max > 0 ? (row.totalTokens || row.requestCount) / max : 0
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens || b.requestCount - a.requestCount);
}

function buildAgentClientRows(requests: AnalyzedAgentRequest[]): AgentObservabilityClientRow[] {
  const grouped = groupBy(requests, (request) => `${request.agent}:${request.client}:${request.userAgent ?? ""}`);
  return Array.from(grouped.values())
    .map((items) => {
      const first = items[0];
      const last = items.at(-1) ?? first;
      return {
        ...buildAgentAnalysisTotals(items),
        agent: first.agent,
        key: `${first.agent}:${first.client}:${first.userAgent ?? ""}`,
        label: first.client || first.userAgent || "unknown",
        lastSeenAt: last.completedAt || last.createdAt,
        userAgent: first.userAgent
      };
    })
    .sort(compareObservabilityRows)
    .slice(0, 100);
}

function buildAgentEndpointRows(requests: AnalyzedAgentRequest[]): AgentObservabilityEndpointRow[] {
  const grouped = groupBy(requests, (request) => `${request.agent}:${request.method}:${request.path}:${request.provider}:${request.model}`);
  return Array.from(grouped.values())
    .map((items) => {
      const first = items[0];
      const last = items.at(-1) ?? first;
      return {
        ...buildAgentAnalysisTotals(items),
        agent: first.agent,
        key: `${first.agent}:${first.method}:${first.path}:${first.provider}:${first.model}`,
        lastSeenAt: last.completedAt || last.createdAt,
        method: first.method,
        model: first.model,
        path: first.path,
        provider: first.provider,
        statusCodes: buildStatusCodeCounts(items)
      };
    })
    .sort(compareObservabilityRows)
    .slice(0, 100);
}

function buildAgentRouteRows(requests: AnalyzedAgentRequest[]): AgentObservabilityRouteRow[] {
  const grouped = groupBy(requests, (request) => `${request.agent}:${request.routeReason || "unknown"}:${request.provider}:${request.model}`);
  return Array.from(grouped.values())
    .map((items) => {
      const first = items[0];
      const last = items.at(-1) ?? first;
      const totals = buildAgentAnalysisTotals(items);
      return {
        agent: first.agent,
        cacheRatio: totals.cacheRatio,
        errorCount: totals.errorCount,
        key: `${first.agent}:${first.routeReason || "unknown"}:${first.provider}:${first.model}`,
        lastSeenAt: last.completedAt || last.createdAt,
        model: first.model,
        p95DurationMs: totals.p95DurationMs,
        provider: first.provider,
        requestCount: totals.requestCount,
        routeReason: first.routeReason || "unknown",
        successRate: totals.successRate,
        totalTokens: totals.totalTokens
      };
    })
    .sort((a, b) => b.errorCount - a.errorCount || b.p95DurationMs - a.p95DurationMs || b.requestCount - a.requestCount)
    .slice(0, 100);
}

function buildAgentErrorRows(requests: AnalyzedAgentRequest[]): AgentObservabilityErrorRow[] {
  return requests
    .filter((request) => !request.ok || Boolean(request.error))
    .slice(-100)
    .reverse()
    .map((request) => ({
      agent: request.agent,
      client: request.client,
      createdAt: request.createdAt,
      durationMs: request.durationMs,
      error: request.error,
      id: request.id,
      method: request.method,
      model: request.model,
      path: request.path,
      provider: request.provider,
      requestId: request.requestId,
      routeReason: request.routeReason,
      sessionId: request.sessionId,
      statusCode: request.statusCode,
      userAgent: request.userAgent
    }));
}

function buildAgentSessionRows(requests: AnalyzedAgentRequest[]): AgentAnalysisSessionRow[] {
  const grouped = groupBy(requests, (request) => `${request.agent}:${request.sessionId}`);
  return Array.from(grouped.values())
    .map(buildAgentSessionRow)
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, 100);
}

function buildAgentSessionRow(items: AnalyzedAgentRequest[]): AgentAnalysisSessionRow {
  const first = items[0];
  const last = items.at(-1) ?? first;
  const totals = buildAgentAnalysisTotals(items);
  return {
    ...totals,
    agent: first.agent,
    client: first.client,
    durationMs: Math.max(0, last.endedAtMs - first.startedAtMs),
    id: first.sessionId,
    lastRequestId: last.requestId,
    lastSeenAt: last.completedAt || last.createdAt,
    models: uniqueNonEmpty(items.map((item) => item.model)).slice(0, 8),
    providers: uniqueNonEmpty(items.map((item) => item.provider)).slice(0, 8),
    startedAt: first.createdAt,
    topTools: topToolCounts(items, 5),
    userAgent: first.userAgent
  };
}

function selectAgentSessionRequests(
  requests: AnalyzedAgentRequest[],
  filter: AgentAnalysisFilter
): AnalyzedAgentRequest[] | undefined {
  const sessionId = normalizeFilterValue(filter.sessionId);
  if (!sessionId) {
    return undefined;
  }

  const sessionAgent = normalizeSessionAgentFilter(filter.sessionAgent);
  return requests.filter((request) =>
    request.sessionId === sessionId &&
    (!sessionAgent || request.agent === sessionAgent)
  );
}

function buildAgentSessionDetail(
  sessionRequests: AnalyzedAgentRequest[],
  bodyDir?: string
): AgentAnalysisSessionDetail | undefined {
  if (sessionRequests.length === 0) {
    return undefined;
  }
  const extraToolResults = bodyDir
    ? collectSessionToolResultsFromFullBodies(sessionRequests, bodyDir)
    : [];

  return {
    conversation: buildAgentConversationTurns(sessionRequests),
    endpoints: buildAgentEndpointRows(sessionRequests),
    errors: buildAgentErrorRows(sessionRequests),
    models: buildAgentSessionModelRows(sessionRequests),
    requests: [...sessionRequests].reverse().map(stripAnalysisInternals),
    routes: buildAgentRouteRows(sessionRequests),
    session: buildAgentSessionRow(sessionRequests),
    statusCodes: buildStatusCodeCounts(sessionRequests),
    subagents: buildAgentSubagentRows(sessionRequests),
    tools: buildAgentToolRows(sessionRequests),
    totals: buildAgentAnalysisTotals(sessionRequests),
    trace: buildAgentTrace(sessionRequests, extraToolResults)
  };
}

function collectSessionToolResultsFromFullBodies(
  requests: AnalyzedAgentRequest[],
  bodyDir: string
): AgentToolResultDetail[] {
  const neededCallIds = new Set(
    requests.flatMap((request) => request.toolCalls.map((tool) => tool.id).filter((id): id is string => Boolean(id)))
  );
  if (neededCallIds.size === 0) {
    return [];
  }

  const results = new Map<string, AgentToolResultDetail>();
  const orderedRequests = [...requests]
    .filter((request) => Boolean(request.requestBody.bodyRef))
    .sort((a, b) => b.startedAtMs - a.startedAtMs || b.id - a.id);

  for (const request of orderedRequests) {
    const body = hydrateRequestLogBodyFromRef(bodyDir, request.requestBody);
    if (!body || body === request.requestBody || body.encoding !== "utf8") {
      continue;
    }

    const payloads = parseLogBodyPayloads(body);
    const extracted = extractToolResults(payloads, {
      id: request.id,
      requestId: request.requestId
    });
    for (const result of extracted) {
      const existing = results.get(result.id);
      if (!existing || (!existing.result && result.result)) {
        results.set(result.id, result);
      }
      neededCallIds.delete(result.id);
    }
    if (neededCallIds.size === 0) {
      break;
    }
  }

  return Array.from(results.values());
}

function buildAgentConversationTurns(requests: AnalyzedAgentRequest[]): AgentAnalysisConversationTurn[] {
  return [...requests]
    .sort((a, b) => a.startedAtMs - b.startedAtMs || a.id - b.id)
    .map((request) => request.conversation)
    .filter((turn): turn is AgentAnalysisConversationTurn => Boolean(turn));
}

function buildAgentTrace(
  requests: AnalyzedAgentRequest[],
  extraToolResults: AgentToolResultDetail[] = []
): AgentAnalysisTrace {
  const ordered = [...requests].sort((a, b) => a.startedAtMs - b.startedAtMs || a.id - b.id);
  const first = ordered[0];
  const sessionId = first.sessionId;
  const startMs = Math.min(...ordered.map((request) => request.startedAtMs));
  const endMs = Math.max(...ordered.map((request) => request.endedAtMs));
  const durationMs = Math.max(0, endMs - startMs);
  const totals = buildAgentAnalysisTotals(ordered);
  const rootRunId = `agent:${first.agent}:${sessionId}`;
  const toolResults = buildToolResultLookup(ordered, extraToolResults);
  let toolCallSequenceIndex = 0;
  const runs: AgentAnalysisTraceRun[] = [
    {
      agent: first.agent,
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      concurrentRequests: totals.maxConcurrentRequests,
      costUsd: totals.costUsd,
      depth: 0,
      durationMs,
      endedAt: isoFromMs(endMs),
      id: rootRunId,
      inputTokens: totals.inputTokens,
      kind: "agent",
      name: `${agentDisplayName(first.agent)} session`,
      offsetMs: 0,
      outputTokens: totals.outputTokens,
      sessionId,
      startedAt: isoFromMs(startMs),
      status: totals.errorCount === 0
        ? "success"
        : totals.errorCount === totals.requestCount
          ? "error"
          : "partial",
      totalTokens: totals.totalTokens
    }
  ];

  for (const request of ordered) {
    let parentId = rootRunId;
    let depth = 1;

    if (request.subagentModel) {
      const run = requestTraceRun({
        depth,
        kind: "subagent",
        name: `Subagent: ${request.subagentModel}`,
        parentId,
        request,
        startMs
      });
      runs.push(run);
      parentId = run.id;
      depth += 1;
    }

    if (shouldCreateRouteTraceRun(request.routeReason)) {
      const run = requestTraceRun({
        depth,
        kind: "route",
        name: `Route: ${request.routeReason}`,
        parentId,
        request,
        startMs
      });
      runs.push(run);
      parentId = run.id;
      depth += 1;
    }

    const llmRun = requestTraceRun({
      depth,
      kind: "llm",
      name: request.model && request.model !== "unknown" ? request.model : request.path,
      parentId,
      request,
      startMs
    });
    runs.push(llmRun);

    request.toolCalls.forEach((toolCall, index) => {
      runs.push(toolTraceRun({
        depth: depth + 1,
        index,
        parentId: llmRun.id,
        request,
        startMs,
        tool: toolDetailForCall(toolCall, toolResults, toolCallSequenceIndex)
      }));
      toolCallSequenceIndex += 1;
    });
  }

  return {
    agent: first.agent,
    durationMs,
    endedAt: isoFromMs(endMs),
    errorCount: runs.filter((run) => run.status === "error").length,
    id: `${first.agent}:${sessionId}`,
    llmRunCount: runs.filter((run) => run.kind === "llm").length,
    maxDepth: Math.max(...runs.map((run) => run.depth), 0),
    rootRunId,
    runCount: runs.length,
    runs,
    sessionId,
    startedAt: isoFromMs(startMs),
    subagentRunCount: runs.filter((run) => run.kind === "subagent").length,
    toolRunCount: runs.filter((run) => run.kind === "tool").length
  };
}

function shouldCreateRouteTraceRun(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "default" && normalized !== "inline-model");
}

function buildToolResultLookup(
  requests: AnalyzedAgentRequest[],
  extraResults: AgentToolResultDetail[] = []
): AgentToolResultLookup {
  const byId = new Map<string, AgentToolResultDetail>();
  const ordered: AgentToolResultDetail[] = [];
  const seenOrderedResults = new Set<string>();
  const allResults = [
    ...requests.flatMap((request) => request.toolResults),
    ...extraResults
  ];
  for (const result of allResults) {
    byId.set(result.id, result);
    const orderedKey = result.id.startsWith("tool-result:")
      ? `${result.result?.kind ?? "empty"}:${result.result?.preview ?? ""}`
      : result.id;
    if (!seenOrderedResults.has(orderedKey)) {
      seenOrderedResults.add(orderedKey);
      ordered.push(result);
    }
  }
  return { byId, ordered };
}

function toolDetailForCall(
  call: AgentToolCallDetail,
  results: AgentToolResultLookup,
  sequenceIndex: number
): AgentAnalysisTraceToolDetail {
  const result = (call.id ? results.byId.get(call.id) : undefined) ?? results.ordered[sequenceIndex];
  return {
    callId: call.id,
    input: call.input,
    result: result?.result,
    resultRequestId: result?.requestId,
    resultRequestLogId: result?.requestLogId
  };
}

function requestTraceRun({
  depth,
  kind,
  name,
  parentId,
  request,
  startMs
}: {
  depth: number;
  kind: AgentAnalysisTraceRunKind;
  name: string;
  parentId: string;
  request: AnalyzedAgentRequest;
  startMs: number;
}): AgentAnalysisTraceRun {
  return {
    agent: request.agent,
    cacheReadTokens: request.cacheReadTokens,
    cacheWriteTokens: request.cacheWriteTokens,
    concurrentRequests: request.concurrentRequests,
    costUsd: request.costUsd,
    depth,
    durationMs: request.durationMs,
    endedAt: isoFromMs(request.endedAtMs),
    error: request.error,
    id: `${kind}:${request.id}`,
    inputTokens: request.inputTokens,
    kind,
    model: request.model,
    name,
    offsetMs: Math.max(0, request.startedAtMs - startMs),
    outputTokens: request.outputTokens,
    parentId,
    path: request.path,
    provider: request.provider,
    requestId: request.requestId,
    requestLogId: request.id,
    routeReason: request.routeReason,
    sessionId: request.sessionId,
    startedAt: request.createdAt,
    status: request.ok && !request.error ? "success" : "error",
    statusCode: request.statusCode,
    totalTokens: request.totalTokens
  };
}

function toolTraceRun({
  depth,
  index,
  parentId,
  request,
  startMs,
  tool
}: {
  depth: number;
  index: number;
  parentId: string;
  request: AnalyzedAgentRequest;
  startMs: number;
  tool: AgentAnalysisTraceToolDetail;
}): AgentAnalysisTraceRun {
  const timestampMs = request.endedAtMs;
  const toolName = request.toolCalls[index]?.name || "tool";
  return {
    agent: request.agent,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    concurrentRequests: request.concurrentRequests,
    depth,
    durationMs: 0,
    endedAt: isoFromMs(timestampMs),
    id: `tool:${request.id}:${index}:${toolName}`,
    inputTokens: 0,
    kind: "tool",
    model: request.model,
    name: toolName,
    offsetMs: Math.max(0, timestampMs - startMs),
    outputTokens: 0,
    parentId,
    path: request.path,
    provider: request.provider,
    requestId: request.requestId,
    requestLogId: request.id,
    routeReason: request.routeReason,
    sessionId: request.sessionId,
    startedAt: isoFromMs(timestampMs),
    status: "success",
    tool,
    toolName,
    totalTokens: 0
  };
}

function buildAgentSessionModelRows(requests: AnalyzedAgentRequest[]): AgentAnalysisSessionModelRow[] {
  const grouped = groupBy(requests, (request) => `${request.provider}:${request.model}`);
  return Array.from(grouped.values())
    .map((items) => {
      const first = items[0];
      const last = items.at(-1) ?? first;
      return {
        ...buildAgentAnalysisTotals(items),
        key: `${first.provider}:${first.model}`,
        lastSeenAt: last.completedAt || last.createdAt,
        model: first.model,
        provider: first.provider
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens || b.requestCount - a.requestCount || a.model.localeCompare(b.model))
    .slice(0, 50);
}

function buildAgentToolRows(requests: AnalyzedAgentRequest[]): AgentAnalysisToolRow[] {
  const grouped = new Map<string, {
    agents: Set<AgentKind>;
    count: number;
    lastSeenAt: string;
    requests: Set<number>;
    sessions: Set<string>;
  }>();

  for (const request of requests) {
    const requestTools = new Set(request.tools);
    for (const tool of request.tools) {
      const row = grouped.get(tool) ?? {
        agents: new Set<AgentKind>(),
        count: 0,
        lastSeenAt: request.createdAt,
        requests: new Set<number>(),
        sessions: new Set<string>()
      };
      row.agents.add(request.agent);
      row.count += 1;
      row.lastSeenAt = request.createdAt;
      row.sessions.add(`${request.agent}:${request.sessionId}`);
      grouped.set(tool, row);
    }
    for (const tool of requestTools) {
      grouped.get(tool)?.requests.add(request.id);
    }
  }

  return Array.from(grouped.entries())
    .map(([name, row]) => ({
      agents: Array.from(row.agents).sort(),
      count: row.count,
      lastSeenAt: row.lastSeenAt,
      name,
      requestCount: row.requests.size,
      sessions: row.sessions.size
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 100);
}

function buildAgentSubagentRows(requests: AnalyzedAgentRequest[]): AgentAnalysisSubagentRow[] {
  const grouped = new Map<string, AgentAnalysisSubagentRow>();
  for (const request of requests) {
    if (!request.subagentModel) {
      continue;
    }
    const key = `${request.agent}:${request.sessionId}:${request.provider}:${request.subagentModel}`;
    const current = grouped.get(key) ?? {
      agent: request.agent,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      count: 0,
      lastSeenAt: request.createdAt,
      model: request.subagentModel,
      provider: request.provider,
      sessionId: request.sessionId,
      totalTokens: 0
    };
    current.cacheReadTokens += request.cacheReadTokens;
    current.cacheWriteTokens += request.cacheWriteTokens;
    current.count += 1;
    current.lastSeenAt = request.createdAt;
    current.totalTokens += request.totalTokens;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.count - a.count || Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, 100);
}

function buildAgentConcurrencySeries(
  range: UsageStatsRange,
  now: Date,
  requests: AnalyzedAgentRequest[]
): Array<{ bucket: string; label: string; maxConcurrentRequests: number; requestCount: number }> {
  const buckets = buildAgentAnalysisBuckets(range, now);
  const grouped = groupBy(requests, (request) => formatAnalysisBucketKey(new Date(request.createdAt), range === "today" || range === "24h" ? "hour" : "day"));
  return buckets.map(({ key, label }) => {
    const items = grouped.get(key) ?? [];
    return {
      bucket: key,
      label,
      maxConcurrentRequests: maxConcurrentRequests(items),
      requestCount: items.length
    };
  });
}

function buildAgentAnalysisTotals(requests: AnalyzedAgentRequest[]): AgentAnalysisTotals {
  if (requests.length === 0) {
    return { ...emptyAgentAnalysisTotals };
  }

  const inputTokens = sum(requests, (request) => request.inputTokens);
  const outputTokens = sum(requests, (request) => request.outputTokens);
  const cacheReadTokens = sum(requests, (request) => request.cacheReadTokens);
  const cacheWriteTokens = sum(requests, (request) => request.cacheWriteTokens);
  const cacheTokens = cacheReadTokens;
  const costUsd = sum(requests, (request) => request.costUsd ?? 0);
  const totalTokens = sum(requests, agentAnalysisTotalTokenCount);
  const promptTokens = sum(requests, agentAnalysisPromptTokenCount);
  const successfulRequests = requests.filter((request) => request.ok).length;
  const sessionCount = new Set(requests.map((request) => `${request.agent}:${request.sessionId}`)).size;
  const durations = requests.map((request) => request.durationMs).sort((a, b) => a - b);

  return {
    avgDurationMs: Math.round(sum(requests, (request) => request.durationMs) / requests.length),
    cacheRatio: ratio(cacheTokens, promptTokens),
    cacheReadTokens,
    cacheTokens,
    cacheWriteTokens,
    costUsd,
    errorCount: requests.length - successfulRequests,
    inputTokens,
    maxConcurrentRequests: maxConcurrentRequests(requests),
    maxDurationMs: durations.at(-1) ?? 0,
    outputTokens,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    p99DurationMs: percentile(durations, 0.99),
    requestCount: requests.length,
    sessionCount,
    subagentCallCount: requests.filter((request) => Boolean(request.subagentModel)).length,
    successRate: successfulRequests / requests.length,
    toolCallCount: sum(requests, (request) => request.toolCallCount),
    totalTokens
  };
}

function agentAnalysisPromptTokenCount(request: AnalyzedAgentRequest): number {
  const cacheTokens = request.cacheReadTokens + request.cacheWriteTokens;
  const promptTokensFromTotal = request.totalTokens - request.outputTokens;
  return Math.max(request.inputTokens + cacheTokens, promptTokensFromTotal);
}

function agentAnalysisTotalTokenCount(request: AnalyzedAgentRequest): number {
  return Math.max(
    request.totalTokens,
    request.inputTokens + request.outputTokens + request.cacheReadTokens + request.cacheWriteTokens
  );
}

function buildStatusCodeCounts(requests: AnalyzedAgentRequest[]): Array<{ count: number; statusCode: number }> {
  const counts = new Map<number, number>();
  for (const request of requests) {
    counts.set(request.statusCode, (counts.get(request.statusCode) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([statusCode, count]) => ({ count, statusCode }))
    .sort((a, b) => b.count - a.count || a.statusCode - b.statusCode)
    .slice(0, 6);
}

function compareObservabilityRows(a: AgentAnalysisTotals, b: AgentAnalysisTotals): number {
  return b.errorCount - a.errorCount || b.p95DurationMs - a.p95DurationMs || b.requestCount - a.requestCount;
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.ceil(sortedValues.length * percentileValue) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))] ?? 0;
}

function maxConcurrentRequests(requests: AnalyzedAgentRequest[]): number {
  if (requests.length === 0) {
    return 0;
  }
  const points = requests.flatMap((request) => [
    { delta: 1, time: request.startedAtMs },
    { delta: -1, time: request.endedAtMs }
  ]);
  points.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let current = 0;
  let max = 0;
  for (const point of points) {
    current += point.delta;
    max = Math.max(max, current);
  }
  return max;
}

function stripAnalysisInternals(request: AnalyzedAgentRequest): AgentAnalysisRequestRow {
  const {
    completedAt: _completedAt,
    conversation: _conversation,
    endedAtMs: _endedAtMs,
    requestBody: _requestBody,
    responseBody: _responseBody,
    startedAtMs: _startedAtMs,
    toolCalls: _toolCalls,
    toolResults: _toolResults,
    ...row
  } = request;
  return row;
}

function topToolCounts(requests: AnalyzedAgentRequest[], limit: number): Array<{ count: number; name: string }> {
  const counts = new Map<string, number>();
  for (const request of requests) {
    for (const tool of request.tools) {
      counts.set(tool, (counts.get(tool) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ count, name }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function buildAgentAnalysisBuckets(
  range: UsageStatsRange,
  now: Date
): Array<{ key: string; label: string }> {
  if (range === "today" || range === "24h") {
    const start = range === "today" ? floorDay(now) : floorHour(now);
    if (range === "24h") {
      start.setHours(start.getHours() - 23);
    }
    const count = range === "today" ? floorHour(now).getHours() + 1 : 24;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(start);
      date.setHours(start.getHours() + index);
      return {
        key: formatAnalysisBucketKey(date, "hour"),
        label: `${String(date.getHours()).padStart(2, "0")}:00`
      };
    });
  }

  const count = range === "7d" ? 7 : 30;
  const start = floorDay(now);
  start.setDate(start.getDate() - (count - 1));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: formatAnalysisBucketKey(date, "day"),
      label: `${date.getMonth() + 1}/${date.getDate()}`
    };
  });
}

function formatAnalysisBucketKey(date: Date, precision: "day" | "hour"): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const base = `${date.getFullYear()}-${month}-${day}`;
  if (precision === "day") {
    return base;
  }
  return `${base} ${String(date.getHours()).padStart(2, "0")}:00`;
}

function floorHour(date: Date): Date {
  const result = new Date(date);
  result.setMinutes(0, 0, 0);
  return result;
}

function floorDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoFromMs(value: number): string {
  return new Date(value).toISOString();
}

function getAgentAnalysisSince(range: UsageStatsRange, now: Date): Date {
  const date = new Date(now);
  if (range === "today") {
    return floorDay(date);
  }
  if (range === "24h") {
    date.setHours(date.getHours() - 24);
  } else if (range === "7d") {
    date.setDate(date.getDate() - 7);
  } else {
    date.setDate(date.getDate() - 30);
  }
  return date;
}

function normalizeAgentAnalysisRange(value: UsageStatsRange | undefined): UsageStatsRange {
  return value === "today" || value === "24h" || value === "30d" ? value : "7d";
}

function normalizeAgentFilter(value: AgentAnalysisFilter["agent"] | undefined): AgentKind | "all" {
  return value === "claude-code" || value === "codex" || value === "grok" || value === "kimi" || value === "kilo" || value === "opencode" || value === "pi" || value === "workbuddy" || value === "zcode" || value === "claude-design" || value === "unknown" ? value : "all";
}

function normalizeSessionAgentFilter(value: AgentAnalysisFilter["sessionAgent"] | undefined): AgentKind | undefined {
  return value === "claude-code" || value === "codex" || value === "grok" || value === "kimi" || value === "kilo" || value === "opencode" || value === "pi" || value === "workbuddy" || value === "zcode" || value === "claude-design" || value === "unknown" ? value : undefined;
}

function agentDisplayName(agent: AgentKind): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  if (agent === "claude-design") {
    return "Claude Design";
  }
  if (agent === "codex") {
    return "Codex";
  }
  if (agent === "grok") {
    return "Grok CLI";
  }
  if (agent === "kimi") {
    return "Kimi CLI";
  }
  if (agent === "kilo") {
    return "Kilo CLI";
  }
  if (agent === "opencode") {
    return "OpenCode";
  }
  if (agent === "pi") {
    return "Pi";
  }
  if (agent === "workbuddy") {
    return "Workbuddy";
  }
  if (agent === "zcode") {
    return "ZCode";
  }
  return "Unknown";
}

function uniqueNonEmpty(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "unknown" || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function groupBy<T, K>(values: T[], keyFn: (value: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFn(value);
    const bucket = grouped.get(key) ?? [];
    bucket.push(value);
    grouped.set(key, bucket);
  }
  return grouped;
}

function readHeaderValue(headers: HeaderRecord, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return normalizeFilterValue(value[0]);
  }
  return normalizeFilterValue(value);
}

function hasCredentialLogHeaders(headers: HeaderRecord): boolean {
  return Boolean(
    readHeaderValue(headers, "x-ccr-provider-credential-id") ||
    readHeaderValue(headers, "x-ccr-provider-credential-chain") ||
    readHeaderValue(headers, "x-ccr-provider-credential-saturated")
  );
}

function readCredentialLogInfo(
  responseHeaders: HeaderRecord,
  requestHeaders: HeaderRecord
): { chain: string[]; id: string; saturated: boolean } {
  const responseChain = parseCredentialChain(readHeaderValue(responseHeaders, "x-ccr-provider-credential-chain"));
  const requestChain = parseCredentialChain(readHeaderValue(requestHeaders, "x-ccr-provider-credential-chain"));
  const id = normalizeLabel(
    readHeaderValue(responseHeaders, "x-ccr-provider-credential-id") ??
      readHeaderValue(requestHeaders, "x-ccr-provider-credential-id") ??
      responseChain[0] ??
      requestChain[0],
    ""
  );
  const chain = responseChain.length > 0
    ? responseChain
    : requestChain.length > 0
      ? requestChain
      : id
        ? [id]
        : [];
  const saturated = readHeaderFlag(
    readHeaderValue(responseHeaders, "x-ccr-provider-credential-saturated") ??
      readHeaderValue(requestHeaders, "x-ccr-provider-credential-saturated")
  );
  return { chain, id, saturated };
}

function parseRequestLogRetryAttempts(
  responseHeaders: Record<string, string | string[]>,
  finalStatusCode: number
): RequestLogRetryAttempt[] {
  const attemptCount = asNumber(readHeaderValue(responseHeaders, "x-ccr-fallback-attempts")) ?? 0;
  if (attemptCount <= 1) {
    return [];
  }

  const failures = splitHeaderCsv(readHeaderValue(responseHeaders, "x-ccr-fallback-failures"));
  const delays = splitHeaderCsv(readHeaderValue(responseHeaders, "x-ccr-fallback-delays-ms"))
    .map((value) => asNumber(value) ?? 0);
  const attempts: RequestLogRetryAttempt[] = [];

  for (let index = 0; index < attemptCount - 1; index += 1) {
    attempts.push({
      attempt: index + 1,
      delayMs: delays[index] ?? 0,
      final: false,
      status: failures[index] || "failed"
    });
  }

  attempts.push({
    attempt: attemptCount,
    delayMs: 0,
    final: true,
    status: finalStatusCode > 0 ? String(finalStatusCode) : undefined
  });
  return attempts;
}

function splitHeaderCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCredentialChain(value: string | undefined): string[] {
  return uniqueNonEmpty((value ?? "").split(","));
}

function readHeaderFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function stringifyForSearch(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) || "";
  } catch {
    return "";
  }
}

function parseDateMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function migrateRequestLogModelSummaries(database: SqlDatabase): void {
  const rows = queryRows(database, `
    SELECT
      rowid AS id,
      model,
      path,
      request_body_text,
      response_body_text
    FROM request_logs
  `);
  if (rows.length === 0) {
    return;
  }

  const update = database.prepare(`
    UPDATE request_logs
    SET requested_model = ?, resolved_model = ?, response_model = ?
    WHERE rowid = ?
  `);
  database.transaction(() => {
    for (const row of rows) {
      const requestedModel = requestLogRequestedModel(
        String(row.request_body_text ?? ""),
        String(row.path ?? "")
      ) ?? "";
      const resolvedModel = normalizeFilterValue(String(row.model ?? "")) ?? "";
      const responseModel = requestLogResponseModel(String(row.response_body_text ?? "")) ?? "";
      update.run(requestedModel, resolvedModel, responseModel, normalizeCount(row.id));
    }
  })();
}

function ensureRequestLogSchema(database: SqlDatabase): void {
  const columns = new Set(
    queryRows(database, "PRAGMA table_info(request_logs)")
      .map((row) => String(row.name ?? ""))
      .filter(Boolean)
  );
  const needsModelSummaryMigration = !columns.has("requested_model") ||
    !columns.has("resolved_model") ||
    !columns.has("response_model");
  const addColumn = (name: string, definition: string) => {
    if (!columns.has(name)) {
      database.exec(`ALTER TABLE request_logs ADD COLUMN ${name} ${definition}`);
      columns.add(name);
    }
  };

  addColumn("source_usage_id", "INTEGER");
  addColumn("created_at", "TEXT NOT NULL DEFAULT ''");
  addColumn("completed_at", "TEXT NOT NULL DEFAULT ''");
  addColumn("request_id", "TEXT NOT NULL DEFAULT ''");
  addColumn("event_id", "TEXT NOT NULL DEFAULT ''");
  addColumn("client", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumn("method", "TEXT NOT NULL DEFAULT ''");
  addColumn("path", "TEXT NOT NULL DEFAULT ''");
  addColumn("url", "TEXT NOT NULL DEFAULT ''");
  addColumn("provider", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumn("credential_id", "TEXT NOT NULL DEFAULT ''");
  addColumn("credential_chain", "TEXT NOT NULL DEFAULT ''");
  addColumn("credential_saturated", "INTEGER NOT NULL DEFAULT 0");
  addColumn("model", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumn("requested_model", "TEXT NOT NULL DEFAULT ''");
  addColumn("resolved_model", "TEXT NOT NULL DEFAULT ''");
  addColumn("response_model", "TEXT NOT NULL DEFAULT ''");
  addColumn("route_trace_version", "INTEGER NOT NULL DEFAULT 0");
  addColumn("route_hop_count", "INTEGER NOT NULL DEFAULT 0");
  addColumn("route_attempt_count", "INTEGER NOT NULL DEFAULT 0");
  addColumn("route_trace_truncated", "INTEGER NOT NULL DEFAULT 0");
  addColumn("is_stream", "INTEGER NOT NULL DEFAULT 0");
  addColumn("status_code", "INTEGER NOT NULL DEFAULT 0");
  addColumn("ok", "INTEGER NOT NULL DEFAULT 0");
  addColumn("gateway_status_code", "INTEGER NOT NULL DEFAULT 0");
  addColumn("gateway_ok", "INTEGER NOT NULL DEFAULT 0");
  addColumn("gateway_error", "TEXT NOT NULL DEFAULT ''");
  addColumn("gateway_final_attempt", "INTEGER NOT NULL DEFAULT 1");
  addColumn("gateway_body_capture_policy", "TEXT NOT NULL DEFAULT 'none'");
  addColumn("gateway_body_capture_max_bytes", "INTEGER NOT NULL DEFAULT 0");
  addColumn("duration_ms", "INTEGER NOT NULL DEFAULT 0");
  addColumn("input_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("output_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("reasoning_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("cache_read_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("cache_write_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("total_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("cost_usd", "REAL");
  addColumn("pricing_json", "TEXT NOT NULL DEFAULT ''");
  addColumn("request_headers", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("response_headers", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("request_body_text", "TEXT NOT NULL DEFAULT ''");
  addColumn("request_body_encoding", "TEXT NOT NULL DEFAULT 'utf8'");
  addColumn("request_body_content_type", "TEXT NOT NULL DEFAULT ''");
  addColumn("request_body_size_bytes", "INTEGER NOT NULL DEFAULT 0");
  addColumn("request_body_truncated", "INTEGER NOT NULL DEFAULT 0");
  addColumn("request_body_ref", "TEXT NOT NULL DEFAULT ''");
  addColumn("response_body_text", "TEXT NOT NULL DEFAULT ''");
  addColumn("response_body_encoding", "TEXT NOT NULL DEFAULT 'utf8'");
  addColumn("response_body_content_type", "TEXT NOT NULL DEFAULT ''");
  addColumn("response_body_size_bytes", "INTEGER NOT NULL DEFAULT 0");
  addColumn("response_body_truncated", "INTEGER NOT NULL DEFAULT 0");
  addColumn("response_body_ref", "TEXT NOT NULL DEFAULT ''");
  addColumn("error", "TEXT NOT NULL DEFAULT ''");

  if (needsModelSummaryMigration) {
    migrateRequestLogModelSummaries(database);
  }

  ensureRequestLogMigrationSchema(database);
  migrateGatewayOutcome(database);
  migrateGatewayFinalAttempt(database);

  database.exec("CREATE INDEX IF NOT EXISTS request_logs_created_at_idx ON request_logs(created_at)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_credential_id_idx ON request_logs(credential_id)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_model_idx ON request_logs(model)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_provider_idx ON request_logs(provider)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_request_id_idx ON request_logs(request_id)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_source_usage_id_idx ON request_logs(source_usage_id)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_status_idx ON request_logs(ok, status_code)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_list_idx ON request_logs(source_usage_id, created_at DESC, id DESC)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_credential_created_at_idx ON request_logs(credential_id, created_at DESC)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_model_created_at_idx ON request_logs(model, created_at DESC)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_provider_created_at_idx ON request_logs(provider, created_at DESC)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_status_created_at_idx ON request_logs(ok, created_at DESC)");
}

const requestLogMigrationBatchSize = 500;
const gatewayOutcomeMigrationName = "gateway-outcome-v1";
const gatewayFinalAttemptMigrationName = "gateway-final-attempt-v1";

function ensureRequestLogMigrationSchema(database: SqlDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS request_log_schema_migrations (
      migration TEXT PRIMARY KEY,
      last_id INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `);
}

function requestLogMigrationState(
  database: SqlDatabase,
  migration: string
): { completed: boolean; lastId: number } {
  database.prepare(`
    INSERT OR IGNORE INTO request_log_schema_migrations (migration, last_id, completed, updated_at)
    VALUES (?, 0, 0, ?)
  `).run(migration, Date.now());
  const row = database.prepare(`
    SELECT last_id, completed
    FROM request_log_schema_migrations
    WHERE migration = ?
  `).get(migration) as Record<string, SqlValue> | undefined;
  return {
    completed: normalizeCount(row?.completed) === 1,
    lastId: normalizeCount(row?.last_id)
  };
}

function completeRequestLogMigration(database: SqlDatabase, migration: string, lastId: number): void {
  database.prepare(`
    UPDATE request_log_schema_migrations
    SET last_id = ?, completed = 1, updated_at = ?
    WHERE migration = ?
  `).run(lastId, Date.now(), migration);
}

function migrateGatewayOutcome(database: SqlDatabase): void {
  const state = requestLogMigrationState(database, gatewayOutcomeMigrationName);
  if (state.completed) return;
  const selectBatch = database.prepare(`
    SELECT id
    FROM request_logs
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `);
  const updateBatch = database.prepare(`
    UPDATE request_logs
    SET gateway_status_code = status_code, gateway_ok = ok, gateway_error = error
    WHERE id > ? AND id <= ?
      AND gateway_status_code = 0 AND gateway_ok = 0 AND gateway_error = ''
      AND (status_code <> 0 OR ok <> 0 OR error <> '')
  `);
  const updateProgress = database.prepare(`
    UPDATE request_log_schema_migrations
    SET last_id = ?, updated_at = ?
    WHERE migration = ?
  `);
  let lastId = state.lastId;
  while (true) {
    const rows = selectBatch.all(lastId, requestLogMigrationBatchSize) as Record<string, SqlValue>[];
    if (rows.length === 0) {
      completeRequestLogMigration(database, gatewayOutcomeMigrationName, lastId);
      return;
    }
    const batchLastId = normalizeCount(rows.at(-1)?.id);
    database.exec("BEGIN IMMEDIATE");
    try {
      updateBatch.run(lastId, batchLastId);
      updateProgress.run(batchLastId, Date.now(), gatewayOutcomeMigrationName);
      database.exec("COMMIT");
      lastId = batchLastId;
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }
}

function migrateGatewayFinalAttempt(database: SqlDatabase): void {
  const state = requestLogMigrationState(database, gatewayFinalAttemptMigrationName);
  if (state.completed) return;
  const selectBatch = database.prepare(`
    SELECT id, response_headers
    FROM request_logs
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `);
  const updateFinalAttempt = database.prepare(
    "UPDATE request_logs SET gateway_final_attempt = ? WHERE id = ?"
  );
  const updateProgress = database.prepare(`
    UPDATE request_log_schema_migrations
    SET last_id = ?, updated_at = ?
    WHERE migration = ?
  `);
  let lastId = state.lastId;
  while (true) {
    const rows = selectBatch.all(lastId, requestLogMigrationBatchSize) as Record<string, SqlValue>[];
    if (rows.length === 0) {
      completeRequestLogMigration(database, gatewayFinalAttemptMigrationName, lastId);
      return;
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        const id = normalizeCount(row.id);
        updateFinalAttempt.run(
          finalAttemptFromHeaders(parseHeaderJson(String(row.response_headers ?? "{}"))),
          id
        );
        lastId = id;
      }
      updateProgress.run(lastId, Date.now(), gatewayFinalAttemptMigrationName);
      database.exec("COMMIT");
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }
}

function ensureRawTraceEventSchema(database: SqlDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS request_log_raw_trace_events (
      bundle_id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      processed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS request_log_raw_trace_events_processed_idx
      ON request_log_raw_trace_events(processed_at);
  `);
  pruneRawTraceEvents(database);
}

function pruneRawTraceEvents(database: SqlDatabase, now = Date.now()): void {
  database.prepare("DELETE FROM request_log_raw_trace_events WHERE processed_at < ?")
    .run(now - rawTraceEventRetentionMs);
}

function ensureRequestRouteTraceSchema(database: SqlDatabase): void {
  const columns = new Set(
    queryRows(database, "PRAGMA table_info(request_route_traces)")
      .map((row) => String(row.name ?? ""))
      .filter(Boolean)
  );
  if (!columns.has("trace_json")) {
    database.exec("ALTER TABLE request_route_traces ADD COLUMN trace_json TEXT NOT NULL DEFAULT ''");
  }
}

function ensurePendingRawTraceUpdateSchema(database: SqlDatabase): void {
  const columns = new Set(
    queryRows(database, "PRAGMA table_info(request_log_pending_updates)")
      .map((row) => String(row.name ?? ""))
      .filter(Boolean)
  );
  if (!columns.has("update_bytes")) {
    database.exec("ALTER TABLE request_log_pending_updates ADD COLUMN update_bytes INTEGER NOT NULL DEFAULT 0");
  }
  database.exec(`
    UPDATE request_log_pending_updates
    SET update_bytes = length(CAST(update_json AS BLOB))
    WHERE update_bytes <= 0
  `);
  prunePendingRawTraceUpdates(database, Date.now());
}

function backfillRequestLogStreamFlags(database: SqlDatabase): void {
  const rows = queryRows(
    database,
      `
        SELECT
          rowid AS id,
          path,
          url,
          request_headers,
          response_headers,
          request_body_text,
          request_body_encoding,
          response_body_content_type
        FROM request_logs
        WHERE source_usage_id IS NULL
          AND is_stream = 0
          AND (
            path LIKE '%stream%' OR
            url LIKE '%stream%' OR
            request_body_text LIKE '%stream%' OR
            response_headers LIKE '%event-stream%' OR
            response_body_content_type LIKE '%event-stream%'
          )
      `
  );
  if (rows.length === 0) {
    return;
  }

  const statement = database.prepare("UPDATE request_logs SET is_stream = 1 WHERE rowid = ?");
  for (const row of rows) {
    const requestBodyText = String(row.request_body_encoding ?? "utf8") === "utf8"
      ? String(row.request_body_text ?? "")
      : undefined;
    const isStream = inferRequestLogIsStream({
      path: String(row.path ?? ""),
      requestBodyText,
      requestHeaders: parseHeaderJson(row.request_headers),
      responseBodyContentType: String(row.response_body_content_type ?? ""),
      responseHeaders: parseHeaderJson(row.response_headers),
      url: String(row.url ?? "")
    });
    if (isStream) {
      statement.run(normalizeCount(row.id));
    }
  }
}

type RequestLogStreamInferenceInput = {
  path?: string;
  requestBodyText?: string;
  requestHeaders?: Record<string, string | string[]>;
  responseBodyContentType?: string;
  responseHeaders?: Record<string, string | string[]>;
  responseWasStream?: boolean;
  url?: string;
};

function inferRequestLogIsStream(input: RequestLogStreamInferenceInput): boolean {
  return Boolean(
    input.responseWasStream ||
    requestPathLooksStreaming(input.path) ||
    requestPathLooksStreaming(input.url) ||
    contentTypeLooksStreaming(input.responseBodyContentType) ||
    contentTypeLooksStreaming(headerValue(input.responseHeaders ?? {}, "content-type")) ||
    contentTypeLooksStreaming(headerValue(input.requestHeaders ?? {}, "accept")) ||
    requestBodyHasStreamFlag(input.requestBodyText)
  );
}

function requestPathLooksStreaming(value: string | undefined): boolean {
  const normalized = value?.toLowerCase() ?? "";
  return normalized.includes(":streamgeneratecontent");
}

function contentTypeLooksStreaming(value: string | undefined): boolean {
  const normalized = value?.toLowerCase() ?? "";
  return normalized.includes("text/event-stream") || normalized.includes("application/x-ndjson");
}

function requestBodyHasStreamFlag(text: string | undefined): boolean {
  const trimmed = text?.trim();
  if (!trimmed) {
    return false;
  }

  const parsed = parseJson(trimmed);
  return payloadHasStreamFlag(parsed);
}

function payloadHasStreamFlag(value: unknown, depth = 0): boolean {
  if (depth > 3) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => payloadHasStreamFlag(item, depth + 1));
  }
  if (!isRecord(value)) {
    return false;
  }
  if (value.stream === true || value.stream === "true") {
    return true;
  }
  return Object.values(value).some((item) => payloadHasStreamFlag(item, depth + 1));
}

function buildLogWhereClause(filter: RequestLogListFilter): { params: SqlValue[]; where: string } {
  const where: string[] = ["source_usage_id IS NULL", "path NOT LIKE ?"];
  const params: SqlValue[] = ["%/count_tokens%"];
  const status = normalizeStatusFilter(filter.status);
  const credential = normalizeFilterValue(filter.credential);
  const model = normalizeFilterValue(filter.model);
  const provider = normalizeFilterValue(filter.provider);
  const query = normalizeFilterValue(filter.query);

  if (status === "success") {
    where.push("ok = 1");
  } else if (status === "error") {
    where.push("ok = 0");
  }
  if (model) {
    where.push("model = ?");
    params.push(model);
  }
  if (provider) {
    where.push("provider = ?");
    params.push(provider);
  }
  if (credential) {
    where.push("credential_id = ?");
    params.push(credential);
  }
  if (query) {
    const like = `%${query}%`;
    where.push(`(
      request_id LIKE ? OR
      client LIKE ? OR
      method LIKE ? OR
      path LIKE ? OR
      url LIKE ? OR
      provider LIKE ? OR
      credential_id LIKE ? OR
      credential_chain LIKE ? OR
      model LIKE ? OR
      request_body_text LIKE ? OR
      response_body_text LIKE ? OR
      error LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like, like, like);
  }

  return {
    params,
    where: where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
  };
}

function configureSqliteDatabase(database: SqlDatabase): void {
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
}

function insertRequestRouteTrace(
  statement: BetterSqliteStatement,
  requestLogId: number,
  requestId: string,
  trace: RequestRouteTrace
): void {
  statement.run(
    requestLogId,
    requestId,
    trace.version,
    trace.complete ? 1 : 0,
    JSON.stringify(trace.ingressSnapshot ?? {}),
    JSON.stringify(trace.finalSnapshot ?? {}),
    trace.hopCount,
    trace.attemptCount,
    trace.truncated ? 1 : 0,
    JSON.stringify(trace)
  );
}

function prepareRequestRouteTraceInsert(database: SqlDatabase): BetterSqliteStatement {
  return database.prepare(`
    INSERT INTO request_route_traces (
      request_log_id,
      request_id,
      version,
      complete,
      ingress_snapshot_json,
      final_snapshot_json,
      hop_count,
      attempt_count,
      truncated,
      trace_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

function readRequestRouteTrace(database: SqlDatabase, requestLogId: number): RequestRouteTrace | undefined {
  const traceRow = queryRows(
    database,
    `
      SELECT
        version,
        complete,
        ingress_snapshot_json,
        final_snapshot_json,
        hop_count,
        attempt_count,
        truncated,
        trace_json
      FROM request_route_traces
      WHERE request_log_id = ?
      LIMIT 1
    `,
    [requestLogId]
  )[0];
  if (!traceRow) {
    return undefined;
  }

  const storedTrace = parseRequestRouteTrace(traceRow.trace_json);
  if (storedTrace) return storedTrace;

  const hops = queryRows(
    database,
    `
      SELECT
        seq,
        phase,
        name,
        kind,
        attempt_no,
        started_offset_ms,
        duration_ms,
        status,
        decision_json,
        target_json,
        changes_json,
        outcome_json,
        truncated
      FROM request_route_hops
      WHERE request_log_id = ?
      ORDER BY seq ASC
    `,
    [requestLogId]
  ).map(requestRouteHopFromRow);
  const ingressSnapshot = parseRouteTraceSnapshot(traceRow.ingress_snapshot_json);
  const finalSnapshot = parseRouteTraceSnapshot(traceRow.final_snapshot_json);
  return {
    attemptCount: normalizeCount(traceRow.attempt_count),
    complete: normalizeCount(traceRow.complete) === 1,
    ...(finalSnapshot ? { finalSnapshot } : {}),
    hopCount: Math.max(normalizeCount(traceRow.hop_count), hops.length),
    hops,
    ...(ingressSnapshot ? { ingressSnapshot } : {}),
    truncated: normalizeCount(traceRow.truncated) === 1,
    version: normalizeCount(traceRow.version) === 2 ? 2 : 1
  };
}

function parseRequestRouteTrace(value: SqlValue): RequestRouteTrace | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = parseJson(value);
  if (!isRecord(parsed) || !Array.isArray(parsed.hops)) return undefined;
  return parsed as RequestRouteTrace;
}

function requestRouteHopFromRow(row: Record<string, SqlValue>): RequestRouteTraceHop {
  const decision = parseJson(String(row.decision_json ?? ""));
  const target = parseJson(String(row.target_json ?? ""));
  const changes = parseJson(String(row.changes_json ?? ""));
  const outcome = parseJson(String(row.outcome_json ?? ""));
  const attempt = normalizeCount(row.attempt_no);
  return {
    ...(attempt > 0 ? { attempt } : {}),
    changes: Array.isArray(changes) ? changes as RequestRouteTraceHop["changes"] : [],
    ...(isRecord(decision) && Object.keys(decision).length > 0
      ? { decision: decision as RequestRouteTraceHop["decision"] }
      : {}),
    durationMs: normalizeCount(row.duration_ms),
    kind: requestRouteHopKind(row.kind),
    name: String(row.name ?? "route-hop"),
    ...(isRecord(outcome) && Object.keys(outcome).length > 0
      ? { outcome: outcome as RequestRouteTraceHop["outcome"] }
      : {}),
    phase: requestRouteTracePhase(row.phase),
    seq: normalizeCount(row.seq),
    startedOffsetMs: normalizeCount(row.started_offset_ms),
    status: requestRouteHopStatus(row.status),
    ...(isRecord(target) && Object.keys(target).length > 0
      ? { target: target as RequestRouteTraceHop["target"] }
      : {}),
    ...(normalizeCount(row.truncated) === 1 ? { truncated: true } : {})
  };
}

function parseRouteTraceSnapshot(value: SqlValue): RequestRouteTraceSnapshot | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = parseJson(value);
  if (!isRecord(parsed) || typeof parsed.method !== "string" || typeof parsed.url !== "string") {
    return undefined;
  }
  return parsed as RequestRouteTraceSnapshot;
}

function requestRouteHopKind(value: SqlValue): RequestRouteTraceHop["kind"] {
  const kind = String(value ?? "");
  return kind === "attempt" || kind === "decision" || kind === "outcome" || kind === "snapshot"
    ? kind
    : "mutation";
}

function requestRouteHopStatus(value: SqlValue): RequestRouteTraceHop["status"] {
  const status = String(value ?? "");
  return status === "error" || status === "noop" ? status : "ok";
}

function requestRouteTracePhase(value: SqlValue): RequestRouteTraceHop["phase"] {
  const phase = String(value ?? "");
  return phase === "ingress" || phase === "compatibility" || phase === "routing" ||
    phase === "capability" || phase === "enrichment" || phase === "planning" ||
    phase === "attempt" || phase === "core" || phase === "outcome"
    ? phase
    : "routing";
}

function queryRows(database: SqlDatabase, sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  return database.prepare(sql).all(...params) as Record<string, SqlValue>[];
}

function iterateRows(
  database: SqlDatabase,
  sql: string,
  params: SqlValue[] = []
): IterableIterator<Record<string, SqlValue>> {
  return database.prepare(sql).iterate(...params) as IterableIterator<Record<string, SqlValue>>;
}

function firstNumber(rows: Record<string, SqlValue>[], column: string): number {
  const row = rows[0];
  return normalizeCount(row?.[column]);
}

function readRequestLogById(database: SqlDatabase, id: number): StoredRequestLogEntry | undefined {
  const row = queryRows(
    database,
    `
      SELECT
        rowid AS id,
        created_at,
        completed_at,
        request_id,
        client,
        method,
        path,
        url,
        provider,
        credential_id,
        credential_chain,
        credential_saturated,
        model,
        requested_model,
        resolved_model,
        response_model,
        route_trace_version,
        route_hop_count,
        route_attempt_count,
        route_trace_truncated,
        is_stream,
        status_code,
        ok,
        duration_ms,
        input_tokens,
        output_tokens,
        reasoning_tokens,
        cache_read_tokens,
        cache_write_tokens,
        total_tokens,
        cost_usd,
        request_headers,
        response_headers,
        request_body_text,
        request_body_encoding,
        request_body_content_type,
        request_body_size_bytes,
        request_body_truncated,
        request_body_ref,
        response_body_text,
        response_body_encoding,
        response_body_content_type,
        response_body_size_bytes,
        response_body_truncated,
        response_body_ref,
        error
      FROM request_logs
      WHERE rowid = ?
      LIMIT 1
    `,
    [id]
  )[0];
  return row ? toRequestLogEntry(row) : undefined;
}

function toRequestLogEntry(row: Record<string, SqlValue>): StoredRequestLogEntry {
  const costUsd = asFloat(row.cost_usd);
  const requestBody = bodyFromRow(row, "request") ?? emptyBody();
  const responseBody = bodyFromRow(row, "response");
  const requestHeaders = parseHeaderJson(row.request_headers);
  const responseHeaders = parseHeaderJson(row.response_headers);
  const isStream = normalizeCount(row.is_stream) === 1 || inferRequestLogIsStream({
    path: String(row.path ?? ""),
    requestBodyText: requestBody.encoding === "utf8" ? requestBody.text : undefined,
    requestHeaders,
    responseBodyContentType: responseBody?.contentType,
    responseHeaders,
    url: String(row.url ?? "")
  });
  return {
    cacheReadTokens: normalizeCount(row.cache_read_tokens),
    cacheWriteTokens: normalizeCount(row.cache_write_tokens),
    client: normalizeLabel(String(row.client ?? ""), "unknown"),
    completedAt: String(row.completed_at ?? ""),
    costUsd,
    createdAt: String(row.created_at ?? ""),
    credentialChain: parseCredentialChain(String(row.credential_chain ?? "")),
    credentialId: normalizeLabel(String(row.credential_id ?? ""), ""),
    credentialSaturated: normalizeCount(row.credential_saturated) === 1,
    durationMs: normalizeCount(row.duration_ms),
    error: String(row.error ?? ""),
    id: normalizeCount(row.id),
    inputTokens: normalizeCount(row.input_tokens),
    isStream,
    method: String(row.method ?? ""),
    model: normalizeLabel(String(row.model ?? ""), "unknown"),
    ok: normalizeCount(row.ok) === 1,
    outputTokens: normalizeCount(row.output_tokens),
    path: normalizeLabel(String(row.path ?? ""), "/"),
    provider: normalizeLabel(String(row.provider ?? ""), "unknown"),
    reasoningTokens: normalizeCount(row.reasoning_tokens),
    requestedModel: normalizeLabel(String(row.requested_model ?? ""), ""),
    requestBody,
    requestHeaders,
    requestId: String(row.request_id ?? ""),
    routeAttemptCount: normalizeCount(row.route_attempt_count),
    routeHopCount: normalizeCount(row.route_hop_count),
    routeTraceTruncated: normalizeCount(row.route_trace_truncated) === 1,
    retryAttempts: parseRequestLogRetryAttempts(responseHeaders, normalizeCount(row.status_code)),
    resolvedModel: normalizeLabel(String(row.resolved_model ?? ""), ""),
    responseBody,
    responseHeaders,
    responseModel: normalizeLabel(String(row.response_model ?? ""), ""),
    statusCode: normalizeCount(row.status_code),
    totalTokens: normalizeCount(row.total_tokens),
    url: String(row.url ?? "")
  };
}

function bodyFromRow(row: Record<string, SqlValue>, prefix: "request" | "response"): RequestLogBody | undefined {
  const text = String(row[`${prefix}_body_text`] ?? "");
  const sizeBytes = normalizeCount(row[`${prefix}_body_size_bytes`]);
  if (!text && sizeBytes === 0 && prefix === "response") {
    return undefined;
  }

  const encoding = String(row[`${prefix}_body_encoding`] ?? "utf8") === "base64" ? "base64" : "utf8";
  const contentType = normalizeFilterValue(String(row[`${prefix}_body_content_type`] ?? ""));
  const bodyRef = normalizeFilterValue(String(row[`${prefix}_body_ref`] ?? ""));
  return {
    ...(bodyRef ? { bodyRef, preview: true } : {}),
    contentType,
    encoding,
    sizeBytes,
    text,
    truncated: normalizeCount(row[`${prefix}_body_truncated`]) === 1
  };
}

function hydrateRequestLogBodyFromRef(bodyDir: string, body: RequestLogBody | undefined): RequestLogBody | undefined {
  if (!body?.bodyRef || body.encoding !== "utf8") {
    return body;
  }
  const filePath = requestLogBodyPath(bodyDir, body.bodyRef);
  if (!filePath || !existsSync(filePath)) {
    return body;
  }
  const buffer = readFileSync(filePath);
  return {
    ...body,
    preview: false,
    sizeBytes: Math.max(body.sizeBytes, buffer.byteLength),
    text: new StringDecoder("utf8").write(buffer)
  };
}

function bodyMetaForAnalysis(body: RequestLogBody | undefined): RequestLogBody | undefined {
  if (!body) {
    return undefined;
  }
  return {
    ...(body.bodyRef ? { bodyRef: body.bodyRef, preview: true } : {}),
    contentType: body.contentType,
    encoding: body.encoding,
    sizeBytes: body.sizeBytes,
    text: "",
    truncated: body.truncated
  };
}

function emptyBody(): RequestLogBody {
  return {
    encoding: "utf8",
    sizeBytes: 0,
    text: "",
    truncated: false
  };
}

function parseHeaderJson(value: SqlValue): Record<string, string | string[]> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }
    const result: Record<string, string | string[]> = {};
    for (const [key, headerValue] of Object.entries(parsed)) {
      if (Array.isArray(headerValue)) {
        result[key] = headerValue.map(String);
      } else if (typeof headerValue === "string") {
        result[key] = headerValue;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function readDistinctValues(database: SqlDatabase, column: "credential_id" | "model" | "provider"): string[] {
  return queryRows(
    database,
      `
        SELECT DISTINCT ${column} AS value
        FROM request_logs
        WHERE source_usage_id IS NULL AND path NOT LIKE ? AND ${column} <> '' AND ${column} <> 'unknown'
        ORDER BY ${column} COLLATE NOCASE ASC
        LIMIT 100
      `,
      ["%/count_tokens%"]
  )
    .map((row) => String(row.value ?? ""))
    .filter(Boolean);
}

type RequestLogBodyStorageOptions = {
  bodyDir: string;
  bodyRef?: string;
  side: RequestLogBodySide;
};

function bodyFromBuffer(
  buffer: Buffer,
  contentType?: string,
  storage?: RequestLogBodyStorageOptions
): RequestLogBody {
  const compacted = compactBase64ImagePayloads(buffer);
  const exceedsCaptureLimit = compacted.buffer.byteLength > maxBodyBytes;
  const data = exceedsCaptureLimit ? compacted.buffer.subarray(0, maxBodyBytes) : compacted.buffer;
  const textLike = isTextLikeContentType(contentType);
  const stored = textLike && storage
    ? storeBodyBuffer(storage.bodyDir, buffer, storage.bodyRef, compacted.buffer)
    : undefined;
  const text = textLike
    ? stored?.previewText ?? data.toString("utf8")
    : data.toString("base64");
  const truncated = !stored && (compacted.compacted || exceedsCaptureLimit);
  return {
    ...(stored ? { bodyRef: stored.bodyRef, preview: true } : {}),
    contentType,
    encoding: textLike ? "utf8" : "base64",
    sizeBytes: buffer.byteLength,
    text,
    truncated
  };
}

function bodyFromText(
  text: string,
  contentType?: string,
  alreadyTruncated = false,
  originalSizeBytes?: number,
  captureLimitBytes = maxBodyBytes,
  storage?: RequestLogBodyStorageOptions
): RequestLogBody {
  const buffer = Buffer.from(text);
  const sizeBytes = Math.max(buffer.byteLength, normalizeCount(originalSizeBytes));
  const compacted = compactBase64ImagePayloads(buffer);
  const exceedsCaptureLimit = compacted.buffer.byteLength > captureLimitBytes;
  const data = exceedsCaptureLimit ? compacted.buffer.subarray(0, captureLimitBytes) : compacted.buffer;
  const stored = storage
    ? storeBodyBuffer(storage.bodyDir, buffer, storage.bodyRef, compacted.buffer)
    : undefined;
  const truncated = alreadyTruncated || (!stored && (
    compacted.compacted ||
    buffer.byteLength < sizeBytes ||
    exceedsCaptureLimit
  ));
  const bodyText = stored?.previewText ?? (exceedsCaptureLimit ? new StringDecoder("utf8").write(data) : data.toString("utf8"));
  return {
    ...(stored ? { bodyRef: stored.bodyRef, preview: true } : {}),
    contentType,
    encoding: "utf8",
    sizeBytes,
    text: bodyText,
    truncated
  };
}

function pushBodyValues(
  sets: string[],
  params: SqlValue[],
  prefix: "request" | "response",
  body: RequestLogBody
): void {
  sets.push(`${prefix}_body_text = ?`);
  params.push(body.text);
  sets.push(`${prefix}_body_encoding = ?`);
  params.push(body.encoding);
  sets.push(`${prefix}_body_content_type = ?`);
  params.push(body.contentType ?? "");
  sets.push(`${prefix}_body_size_bytes = ?`);
  params.push(body.sizeBytes);
  sets.push(`${prefix}_body_truncated = ?`);
  params.push(body.truncated ? 1 : 0);
  sets.push(`${prefix}_body_ref = ?`);
  params.push(body.bodyRef ?? "");
}

type StoredRequestLogBodyFile = {
  bodyRef: string;
  contentType?: string;
  previewText: string;
  sizeBytes: number;
  truncated: boolean;
};

function storeRawTraceBodyFile(
  bodyDir: string,
  file: RequestLogRawTraceFile | undefined
): StoredRequestLogBodyFile | undefined {
  if (!file || file.sizeBytes <= 0 || !existsSync(file.filePath)) {
    return undefined;
  }
  const bodyRef = createRequestLogBodyRef();
  const target = requestLogBodyPath(bodyDir, bodyRef, true);
  if (!target) {
    return undefined;
  }
  copyFileSync(file.filePath, target);
  const storedBytes = statSync(target).size;
  const sizeBytes = Math.max(file.sizeBytes, storedBytes);
  return {
    bodyRef,
    contentType: file.contentType,
    previewText: readRequestLogBodyPreview(target),
    sizeBytes,
    truncated: Boolean(file.truncated) || storedBytes < sizeBytes
  };
}

function storeBodyBuffer(
  bodyDir: string,
  buffer: Buffer,
  existingBodyRef?: string,
  previewBuffer = buffer
): { bodyRef: string; previewText: string } | undefined {
  const shouldStore = Boolean(existingBodyRef) || buffer.byteLength > requestLogInlineBodyBytes;
  if (!shouldStore) {
    return undefined;
  }
  const bodyRef = normalizeBodyRef(existingBodyRef) ?? createRequestLogBodyRef();
  const target = requestLogBodyPath(bodyDir, bodyRef, true);
  if (!target) {
    return undefined;
  }
  if (existingBodyRef && existsSync(target)) {
    return {
      bodyRef,
      previewText: previewBuffer.byteLength > 0
        ? createRequestLogBodyPreviewText(previewBuffer)
        : readRequestLogBodyPreview(target)
    };
  }
  if (!existingBodyRef || !existsSync(target)) {
    writeFileSync(target, buffer);
  }
  return {
    bodyRef,
    previewText: createRequestLogBodyPreviewText(buffer)
  };
}

function readRequestLogBodyChunkFromFile({
  bodyRef,
  contentType,
  encoding,
  filePath,
  length,
  offset,
  sizeBytes,
  truncated
}: {
  bodyRef: string;
  contentType?: string;
  encoding: "base64" | "utf8";
  filePath: string;
  length: number;
  offset: number;
  sizeBytes: number;
  truncated: boolean;
}): RequestLogBodyChunk {
  const descriptor = openSync(filePath, "r");
  try {
    const storedBytes = fstatSync(descriptor).size;
    const boundedOffset = Math.max(0, Math.min(offset, storedBytes));
    const readLength = Math.max(0, Math.min(
      encoding === "utf8" ? Math.max(length, 4) : length,
      storedBytes - boundedOffset
    ));
    const buffer = Buffer.allocUnsafe(readLength);
    let bytesRead = 0;
    while (bytesRead < readLength) {
      const count = readSync(descriptor, buffer, bytesRead, readLength - bytesRead, boundedOffset + bytesRead);
      if (count === 0) break;
      bytesRead += count;
    }
    const data = bytesRead === buffer.byteLength ? buffer : buffer.subarray(0, bytesRead);
    const safeLength = encoding === "utf8" && boundedOffset + data.byteLength < storedBytes
      ? validUtf8PrefixLength(data)
      : data.byteLength;
    const safeData = safeLength > 0 ? data.subarray(0, safeLength) : data;
    const nextOffset = boundedOffset + safeData.byteLength;
    return {
      bodyRef,
      contentType,
      encoding,
      eof: nextOffset >= storedBytes,
      length: safeData.byteLength,
      ...(nextOffset < storedBytes ? { nextOffset } : {}),
      offset: boundedOffset,
      sizeBytes: Math.max(sizeBytes, storedBytes),
      text: encoding === "base64" ? safeData.toString("base64") : new StringDecoder("utf8").write(safeData),
      truncated
    };
  } finally {
    closeSync(descriptor);
  }
}

function validUtf8PrefixLength(buffer: Buffer): number {
  if (buffer.byteLength === 0) return 0;
  let leadIndex = buffer.byteLength - 1;
  while (leadIndex >= 0 && (buffer[leadIndex] & 0xc0) === 0x80) {
    leadIndex -= 1;
  }
  if (leadIndex < 0) return 0;
  const lead = buffer[leadIndex];
  if ((lead & 0x80) === 0) return buffer.byteLength;
  const continuationBytes = buffer.byteLength - leadIndex - 1;
  const expectedContinuationBytes = (lead & 0xe0) === 0xc0
    ? 1
    : (lead & 0xf0) === 0xe0
      ? 2
      : (lead & 0xf8) === 0xf0
        ? 3
        : 0;
  if (expectedContinuationBytes === 0) return leadIndex;
  return continuationBytes >= expectedContinuationBytes ? buffer.byteLength : leadIndex;
}

function readRequestLogBodyPreview(filePath: string): string {
  const descriptor = openSync(filePath, "r");
  try {
    const size = fstatSync(descriptor).size;
    if (size <= requestLogInlineBodyBytes) {
      const buffer = Buffer.allocUnsafe(size);
      readSync(descriptor, buffer, 0, size, 0);
      return new StringDecoder("utf8").write(buffer);
    }
    const headBytes = Math.floor(requestLogInlineBodyBytes * 0.65);
    const tailBytes = requestLogInlineBodyBytes - headBytes;
    const head = Buffer.allocUnsafe(headBytes);
    const tail = Buffer.allocUnsafe(tailBytes);
    const headRead = readSync(descriptor, head, 0, headBytes, 0);
    const tailRead = readSync(descriptor, tail, 0, tailBytes, Math.max(0, size - tailBytes));
    return createRequestLogPreviewFromParts(
      head.subarray(0, headRead),
      tail.subarray(0, tailRead),
      Math.max(0, size - headRead - tailRead)
    );
  } finally {
    closeSync(descriptor);
  }
}

function createRequestLogBodyPreviewText(buffer: Buffer): string {
  if (buffer.byteLength <= requestLogInlineBodyBytes) {
    return new StringDecoder("utf8").write(buffer);
  }
  const headBytes = Math.floor(requestLogInlineBodyBytes * 0.65);
  const tailBytes = requestLogInlineBodyBytes - headBytes;
  return createRequestLogPreviewFromParts(
    buffer.subarray(0, headBytes),
    buffer.subarray(Math.max(0, buffer.byteLength - tailBytes)),
    Math.max(0, buffer.byteLength - headBytes - tailBytes)
  );
}

function createRequestLogPreviewFromParts(head: Buffer, tail: Buffer, omittedBytes: number): string {
  return [
    new StringDecoder("utf8").write(head),
    "",
    `... ${omittedBytes} bytes omitted from preview ...`,
    "",
    new StringDecoder("utf8").write(tail)
  ].join("\n");
}

function createRequestLogBodyRef(): string {
  return randomUUID();
}

function requestLogBodyPath(bodyDir: string, bodyRef: string, createDirectory = false): string | undefined {
  const normalized = normalizeBodyRef(bodyRef);
  if (!normalized) {
    return undefined;
  }
  const shard = normalized.slice(0, 2);
  const directory = join(bodyDir, shard);
  if (createDirectory) {
    mkdirSync(directory, { recursive: true });
  }
  return join(directory, normalized);
}

function normalizeBodyRef(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function deleteRequestLogBodyRefs(bodyDir: string, refs: string[]): void {
  for (const ref of refs) {
    const filePath = requestLogBodyPath(bodyDir, ref);
    if (!filePath) continue;
    rmSync(filePath, { force: true });
  }
}

function isTextLikeContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return true;
  }
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("json") ||
    normalized.includes("text") ||
    normalized.includes("xml") ||
    normalized.includes("x-www-form-urlencoded") ||
    normalized.includes("event-stream")
  );
}

function hasRequestLogWithRequestId(database: SqlDatabase, requestId: string): boolean {
  return firstNumber(
    queryRows(database, "SELECT COUNT(*) AS total FROM request_logs WHERE request_id = ?", [requestId]),
    "total"
  ) > 0;
}

function hasProcessedRawTraceBundle(database: SqlDatabase, bundleId: string): boolean {
  return firstNumber(
    queryRows(
      database,
      "SELECT COUNT(*) AS total FROM request_log_raw_trace_events WHERE bundle_id = ?",
      [bundleId]
    ),
    "total"
  ) > 0;
}

function rememberProcessedRawTraceBundle(
  database: SqlDatabase,
  bundleId: string,
  requestId: string
): void {
  database.prepare(`
    INSERT OR IGNORE INTO request_log_raw_trace_events (bundle_id, request_id, processed_at)
    VALUES (?, ?, ?)
  `).run(bundleId, requestId, Date.now());
}

function readRequestLogStoredOutcome(database: SqlDatabase, requestId: string): RequestLogStoredOutcome {
  const row = queryRows(
    database,
    `
      SELECT
        error,
        gateway_error,
        gateway_ok,
        gateway_status_code,
        length(request_body_text) AS request_body_chars,
        length(response_body_text) AS response_body_chars,
        request_body_ref,
        response_body_ref,
        ok,
        status_code
      FROM request_logs
      WHERE request_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [requestId]
  )[0];
  return {
    error: String(row?.error ?? ""),
    gatewayError: String(row?.gateway_error ?? ""),
    gatewayOk: normalizeCount(row?.gateway_ok) === 1,
    gatewayStatusCode: normalizeCount(row?.gateway_status_code),
    hasRequestBody: normalizeCount(row?.request_body_chars) > 0 || Boolean(normalizeFilterValue(String(row?.request_body_ref ?? ""))),
    hasResponseBody: normalizeCount(row?.response_body_chars) > 0 || Boolean(normalizeFilterValue(String(row?.response_body_ref ?? ""))),
    ok: normalizeCount(row?.ok) === 1,
    statusCode: normalizeCount(row?.status_code)
  };
}

function applyRawTraceBodyCapturePolicy(
  input: RequestLogRawTraceUpdateInput,
  successful: boolean
): RawTraceBodyCaptureResolution {
  const bodiesSuppressed = input.bodyCapturePolicy === "none" ||
    (input.bodyCapturePolicy === "errors" && successful);
  return {
    bodiesSuppressed,
    input: bodiesSuppressed ? suppressRequestLogRawTraceBodies(input) : input
  };
}

function serializePendingRawTraceUpdate(
  input: RequestLogRawTraceUpdateInput
): { bytes: number; json: string } | undefined {
  // Bound each body before serializing the whole update. Besides enforcing the
  // persisted body limit, this avoids first allocating a JSON string for a raw
  // trace that may contain two maximum-sized bodies.
  let candidate = withBoundedRawTraceBodyTexts(input, maxPendingRawTraceRetainedBodyBytes);
  let json = JSON.stringify(candidate);
  let bytes = Buffer.byteLength(json);
  if (bytes > maxPendingRawTraceEntryBytes && rawTraceHasBodyText(candidate)) {
    candidate = withoutRawTraceBodyTexts(candidate);
    json = JSON.stringify(candidate);
    bytes = Buffer.byteLength(json);
  }
  return bytes <= maxPendingRawTraceEntryBytes ? { bytes, json } : undefined;
}

function withBoundedRawTraceBodyTexts(
  input: RequestLogRawTraceUpdateInput,
  bodyBudgetBytes: number
): RequestLogRawTraceUpdateInput {
  const requestBytes = Buffer.byteLength(input.requestBodyText ?? "");
  const responseBytes = Buffer.byteLength(input.responseBodyText ?? "");
  const requestBodyText = input.requestBodyText === undefined
    ? undefined
    : boundedUtf8Text(input.requestBodyText, bodyBudgetBytes);
  const responseBodyText = input.responseBodyText === undefined
    ? undefined
    : boundedUtf8Text(input.responseBodyText, bodyBudgetBytes);
  return {
    ...input,
    ...(requestBodyText === undefined ? {} : {
      requestBodySizeBytes: Math.max(requestBytes, normalizeCount(input.requestBodySizeBytes)),
      requestBodyText,
      requestBodyTruncated: Boolean(input.requestBodyTruncated) ||
        (!input.requestBodyRef && Buffer.byteLength(requestBodyText) < requestBytes)
    }),
    ...(responseBodyText === undefined ? {} : {
      responseBodySizeBytes: Math.max(responseBytes, normalizeCount(input.responseBodySizeBytes)),
      responseBodyText,
      responseBodyTruncated: Boolean(input.responseBodyTruncated) ||
        (!input.responseBodyRef && Buffer.byteLength(responseBodyText) < responseBytes)
    })
  };
}

function boundedUtf8Text(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const buffer = Buffer.allocUnsafe(maxBytes);
  const written = buffer.write(value, 0, maxBytes, "utf8");
  return new StringDecoder("utf8").write(buffer.subarray(0, written));
}

function withoutRawTraceBodyTexts(input: RequestLogRawTraceUpdateInput): RequestLogRawTraceUpdateInput {
  const {
    requestBodyText,
    responseBodyText,
    ...metadata
  } = input;
  return {
    ...metadata,
    ...(requestBodyText === undefined ? {} : {
      requestBodySizeBytes: Math.max(
        Buffer.byteLength(requestBodyText),
        normalizeCount(input.requestBodySizeBytes)
      ),
      requestBodyTruncated: Boolean(input.requestBodyTruncated) || !input.requestBodyRef
    }),
    ...(responseBodyText === undefined ? {} : {
      responseBodySizeBytes: Math.max(
        Buffer.byteLength(responseBodyText),
        normalizeCount(input.responseBodySizeBytes)
      ),
      responseBodyTruncated: Boolean(input.responseBodyTruncated) || !input.responseBodyRef
    })
  };
}

function rawTraceHasBodyText(input: RequestLogRawTraceUpdateInput): boolean {
  return input.requestBodyText !== undefined || input.responseBodyText !== undefined;
}

function prunePendingRawTraceUpdates(database: SqlDatabase, now: number, bodyDir?: string): void {
  const expiredRows = queryRows(
    database,
    "SELECT update_json FROM request_log_pending_updates WHERE received_at < ?",
    [now - pendingRawTraceTtlMs]
  );
  if (bodyDir) deleteRequestLogBodyRefs(bodyDir, bodyRefsFromPendingRawTraceRows(expiredRows));
  database.prepare("DELETE FROM request_log_pending_updates WHERE received_at < ?")
    .run(now - pendingRawTraceTtlMs);
  const rows = queryRows(
    database,
    `
      SELECT request_id, update_bytes, update_json
      FROM request_log_pending_updates
      ORDER BY received_at DESC, request_id DESC
    `
  );
  const remove = database.prepare("DELETE FROM request_log_pending_updates WHERE request_id = ?");
  let retainedBytes = 0;
  let retainedEntries = 0;
  for (const row of rows) {
    const bytes = normalizeCount(row.update_bytes);
    if (retainedEntries >= maxPendingRawTraceEntries ||
      retainedBytes + bytes > maxPendingRawTraceTotalBytes) {
      if (bodyDir) deleteRequestLogBodyRefs(bodyDir, bodyRefsFromPendingRawTraceRows([row]));
      remove.run(String(row.request_id ?? ""));
      continue;
    }
    retainedEntries += 1;
    retainedBytes += bytes;
  }
}

function bodyRefsFromPendingRawTraceRows(rows: Record<string, SqlValue>[]): string[] {
  return rows.flatMap((row) => {
    const parsed = parseJson(String(row.update_json ?? ""));
    if (!isRecord(parsed)) return [];
    return bodyRefsFromRawTraceInput(parsed as RequestLogRawTraceUpdateInput);
  });
}

function bodyRefsFromRawTraceInput(input: RequestLogRawTraceUpdateInput): string[] {
  return [
    normalizeFilterValue(String(input.requestBodyRef ?? "")),
    normalizeFilterValue(String(input.responseBodyRef ?? ""))
  ].filter((value): value is string => Boolean(value));
}

function readRequestHeadersForRequestId(database: SqlDatabase, requestId: string): Record<string, string | string[]> {
  const row = queryRows(database, "SELECT request_headers FROM request_logs WHERE request_id = ? LIMIT 1", [requestId])[0];
  return row ? parseHeaderJson(row.request_headers) : {};
}

function readRequestLogFinalAttempt(database: SqlDatabase, requestId: string): number {
  const row = queryRows(
    database,
    "SELECT gateway_final_attempt FROM request_logs WHERE request_id = ? ORDER BY id DESC LIMIT 1",
    [requestId]
  )[0];
  const value = Number(row?.gateway_final_attempt);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function finalAttemptFromHeaders(
  headers: Record<string, string | string[]>,
  routeAttemptCount?: number
): number {
  const value = Number(headerValue(headers, "x-ccr-fallback-attempts"));
  if (Number.isFinite(value) && value >= 1) return Math.floor(value);
  return Number.isFinite(routeAttemptCount) && Number(routeAttemptCount) >= 1
    ? Math.floor(Number(routeAttemptCount))
    : 1;
}

function readRequestLogUsageContext(database: SqlDatabase, requestId: string): RequestLogUsageContext {
  const row = queryRows(database, "SELECT model, path, pricing_json, provider FROM request_logs WHERE request_id = ? LIMIT 1", [requestId])[0];
  return {
    model: normalizeLabel(String(row?.model ?? ""), "unknown"),
    path: normalizeLabel(String(row?.path ?? ""), ""),
    pricing: parseStoredModelPricing(row?.pricing_json),
    provider: normalizeLabel(String(row?.provider ?? ""), "unknown")
  };
}

function parseStoredModelPricing(value: unknown): ProviderModelPricing | undefined {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(parsed)) {
    return undefined;
  }
  const pricing: ProviderModelPricing = {};
  const fields: Array<keyof ProviderModelPricing> = [
    "cacheReadUsdPerMillionTokens",
    "cacheWriteUsdPerMillionTokens",
    "cacheWrite1hUsdPerMillionTokens",
    "cacheWrite5mUsdPerMillionTokens",
    "inputUsdPerMillionTokens",
    "outputUsdPerMillionTokens"
  ];
  for (const field of fields) {
    const candidate = parsed[field];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      pricing[field] = candidate;
    }
  }
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function mergeRequestHeadersForRawTrace(
  existingHeaders: Record<string, string | string[]>,
  upstreamHeaders: Record<string, string | string[]>
): Record<string, string | string[]> {
  return {
    ...upstreamHeaders,
    ...existingHeaders
  };
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

function sanitizeHeaders(headers: HeaderRecord): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    const normalizedKey = key.toLowerCase();
    if (isSensitiveRequestLogHeaderName(normalizedKey)) {
      result[normalizedKey] = "[redacted]";
      continue;
    }
    result[normalizedKey] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return result;
}

function headersToRecord(headers: Headers | HeaderRecord | undefined): HeaderRecord {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    const result: HeaderRecord = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return headers;
}

function headerValue(headers: Record<string, string | string[]>, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function batchNeedsUsagePricing(
  database: SqlDatabase,
  commands: RequestLogStoreWriteCommand[]
): boolean {
  for (const command of commands) {
    if (command.kind === "raw-trace-update") {
      if (rawTraceHasBillableUsage(command.input)) return true;
      continue;
    }
    if (recordHasBillableUsage(command.input) && !hasCompleteCustomPricing(command.input.pricing)) return true;
    const requestId = command.input.requestId?.trim();
    if (!requestId) continue;
    const row = queryRows(
      database,
      "SELECT update_json FROM request_log_pending_updates WHERE request_id = ? LIMIT 1",
      [requestId]
    )[0];
    const pending = parseJson(String(row?.update_json ?? ""));
    if (isRecord(pending) && rawTraceHasBillableUsage(pending as RequestLogRawTraceUpdateInput)) {
      return true;
    }
  }
  return false;
}

function recordHasBillableUsage(input: RequestLogRecordInput): boolean {
  const bodyUsage = extractUsageFromBody(input.responseBodyText ?? "");
  return hasBillableUsageComponents(
    mergeUsageSnapshots(extractUsageFromBillingHeaders(input.responseHeaders), bodyUsage) ?? {}
  );
}

function hasCompleteCustomPricing(pricing: ProviderModelPricing | undefined): boolean {
  return typeof pricing?.inputUsdPerMillionTokens === "number" &&
    Number.isFinite(pricing.inputUsdPerMillionTokens) &&
    pricing.inputUsdPerMillionTokens >= 0 &&
    typeof pricing.outputUsdPerMillionTokens === "number" &&
    Number.isFinite(pricing.outputUsdPerMillionTokens) &&
    pricing.outputUsdPerMillionTokens >= 0;
}

function rawTraceHasBillableUsage(input: RequestLogRawTraceUpdateInput): boolean {
  const bodyUsage = extractUsageFromBody(input.responseBodyText ?? "");
  return hasBillableUsageComponents(
    mergeUsageSnapshots(extractUsageFromBillingHeaders(input.responseHeaders), bodyUsage) ?? {}
  );
}

function hasBillableUsageComponents(usage: UsageNumbers): boolean {
  return normalizeCount(usage.inputTokens) +
    normalizeCount(usage.outputTokens) +
    normalizeCount(usage.cacheReadTokens) +
    normalizeCount(usage.cacheWrite1hTokens) +
    normalizeCount(usage.cacheWrite5mTokens) +
    normalizeCount(usage.cacheWriteTokens) > 0;
}

function extractUsageFromBillingHeaders(headers: Headers | HeaderRecord | undefined): UsageNumbers | undefined {
  const inputTokens = readNumberResponseHeader(headers, "x-gateway-billing-input-tokens");
  const outputTokens = readNumberResponseHeader(headers, "x-gateway-billing-output-tokens");
  const reasoningTokens =
    readNumberResponseHeader(headers, "x-gateway-billing-reasoning-tokens") ??
    readNumberResponseHeader(headers, "x-gateway-billing-thinking-tokens");
  const cacheReadTokens = readNumberResponseHeader(headers, "x-gateway-billing-cache-read-tokens");
  const cacheWrite1hTokens = readNumberResponseHeader(headers, "x-gateway-billing-cache-write-1h-tokens");
  const cacheWrite5mTokens = readNumberResponseHeader(headers, "x-gateway-billing-cache-write-5m-tokens");
  const cacheWriteTokens = readNumberResponseHeader(headers, "x-gateway-billing-cache-write-tokens") ??
    sumOptionalNumbers(cacheWrite5mTokens, cacheWrite1hTokens);
  const totalTokens = readNumberResponseHeader(headers, "x-gateway-billing-total-tokens");

  if ([inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWrite1hTokens, cacheWrite5mTokens, cacheWriteTokens, totalTokens].every((value) => value === undefined)) {
    return undefined;
  }

  return {
    cacheReadTokens,
    cacheWrite1hTokens,
    cacheWrite5mTokens,
    cacheWriteTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens
  };
}

function extractUsageFromBody(text: string): UsageSnapshot | undefined {
  const snapshots: UsageSnapshot[] = [];
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = parseJson(trimmed);
  if (parsed !== undefined) {
    const snapshot = extractUsageSnapshot(parsed);
    return snapshot && hasUsageNumbers(snapshot) ? snapshot : undefined;
  }

  for (const payload of parseStreamPayloads(trimmed)) {
    const snapshot = extractUsageSnapshot(payload);
    if (snapshot && hasUsageNumbers(snapshot)) {
      snapshots.push(snapshot);
    }
  }

  let merged: UsageSnapshot | undefined;
  for (const snapshot of snapshots) {
    merged = mergeUsageSnapshots(snapshot, merged);
  }
  return merged;
}

function parseStreamPayloads(text: string): unknown[] {
  const payloads: unknown[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line.startsWith("{") ? line : "";
    if (!payload || payload === "[DONE]") {
      continue;
    }
    const parsed = parseJson(payload);
    if (parsed !== undefined) {
      payloads.push(parsed);
    }
  }
  return payloads;
}

export function detectSseError(text: string, contentType?: string): string | undefined {
  if (!text || (!contentTypeLooksSse(contentType) && !textLooksSse(text))) {
    return undefined;
  }
  const detector = createSseErrorDetector(contentType, true);
  detector.append(text);
  return detector.finish();
}

export function createSseErrorDetector(contentType?: string, force = false): SseErrorDetector {
  const active = force || contentTypeLooksSse(contentType);
  const decoder = new StringDecoder("utf8");
  let currentEvent = "";
  let dataLines: string[] = [];
  let detectedError: string | undefined;
  let finished = false;
  let pendingLine = "";
  let terminalEventSeen = false;

  const read = () => detectedError;
  const flushEvent = () => {
    const eventError = detectSseEventError(currentEvent, dataLines);
    terminalEventSeen ||= Boolean(eventError) || isSseTerminalEvent(currentEvent, dataLines);
    detectedError ??= eventError;
    currentEvent = "";
    dataLines = [];
  };
  const processLine = (line: string) => {
    if (!active || detectedError) {
      return;
    }
    if (line === "") {
      flushEvent();
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") {
      currentEvent = value.trim();
    } else if (field === "data") {
      dataLines.push(value);
    }
  };
  const processText = (textChunk: string) => {
    pendingLine += textChunk;
    while (true) {
      const newlineIndex = pendingLine.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const rawLine = pendingLine.slice(0, newlineIndex);
      pendingLine = pendingLine.slice(newlineIndex + 1);
      processLine(rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine);
    }
  };

  return {
    append(chunk: Buffer | string) {
      if (!active || detectedError || finished) {
        return detectedError;
      }
      processText(Buffer.isBuffer(chunk) ? decoder.write(chunk) : chunk);
      return detectedError;
    },
    finish() {
      if (!active || finished) {
        return detectedError;
      }
      finished = true;
      processText(decoder.end());
      if (pendingLine) {
        processLine(pendingLine.endsWith("\r") ? pendingLine.slice(0, -1) : pendingLine);
        pendingLine = "";
      }
      if (currentEvent || dataLines.length > 0) {
        flushEvent();
      }
      return detectedError;
    },
    hasTerminalEvent() {
      return terminalEventSeen;
    },
    read
  };
}

function isSseTerminalEvent(eventName: string, dataLines: string[]): boolean {
  const event = eventName.trim().toLowerCase();
  const data = dataLines.join("\n").trim();
  if (data === "[DONE]") {
    return true;
  }

  const payload = data ? parseJson(data) : undefined;
  const payloadType = isRecord(payload) ? asString(payload.type)?.toLowerCase() : undefined;
  const response = isRecord(payload) && isRecord(payload.response) ? payload.response : undefined;
  const responseStatus = asString(response?.status)?.toLowerCase();

  return (
    terminalSseEventNames.has(event) ||
    Boolean(payloadType && terminalSseEventNames.has(payloadType)) ||
    Boolean(responseStatus && terminalSseResponseStatuses.has(responseStatus))
  );
}

function detectSseEventError(eventName: string, dataLines: string[]): string | undefined {
  const event = eventName.trim().toLowerCase();
  const data = dataLines.join("\n").trim();
  const payload = data && data !== "[DONE]" ? parseJson(data) : undefined;
  if (event === "error") {
    return formatSseErrorPayload(payload, data || "SSE error event");
  }
  if (event === "response.failed" || event === "response.error") {
    return formatSseErrorPayload(payload, event);
  }
  if (isRecord(payload)) {
    const payloadType = asString(payload.type)?.toLowerCase();
    if (payloadType === "error" || payloadType === "response.failed" || payloadType === "response.error") {
      return formatSseErrorPayload(payload, payloadType);
    }
    if (payload.error !== undefined && payload.error !== null) {
      return formatSseErrorPayload(payload, event || "SSE error");
    }
    const response = isRecord(payload.response) ? payload.response : undefined;
    const responseStatus = asString(response?.status)?.toLowerCase();
    if (
      (responseStatus === "failed" || responseStatus === "error") &&
      response?.error !== undefined &&
      response.error !== null
    ) {
      return formatSseErrorPayload(response, responseStatus);
    }
  }
  return undefined;
}

function formatSseErrorPayload(payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    const response = isRecord(payload.response) ? payload.response : undefined;
    const error = payload.error ?? response?.error;
    const message = sseErrorMessage(error) ?? sseErrorMessage(payload);
    const type = sseErrorType(error) ?? sseErrorType(payload);
    const code = isRecord(error) ? asString(error.code) : undefined;
    const label = uniqueStrings([type, code]).join(" ");
    if (message && label && message !== label) {
      return `${label}: ${message}`;
    }
    if (message) {
      return message;
    }
    if (label) {
      return label;
    }
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  return fallback;
}

function sseErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeFilterValue(value);
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return (
    asString(value.message) ??
    asString(value.detail) ??
    asString(value.reason) ??
    asString(value.error_description) ??
    asString(value.error)
  );
}

function sseErrorType(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return asString(value.type) ?? asString(value.code) ?? asString(value.status);
}

function contentTypeLooksSse(contentType: string | undefined): boolean {
  return Boolean(contentType?.toLowerCase().includes("event-stream"));
}

function textLooksSse(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("event:") || trimmed.startsWith("data:");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function extractUsageSnapshot(payload: unknown): UsageSnapshot | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const response = isRecord(payload.response) ? payload.response : payload;
  const message = isRecord(payload.message) ? payload.message : undefined;
  const usage = isRecord(response.usage)
    ? response.usage
    : isRecord(payload.usage)
      ? payload.usage
      : isRecord(message?.usage)
        ? message.usage
      : undefined;
  const usageMetadata = isRecord(response.usageMetadata)
    ? response.usageMetadata
    : isRecord(payload.usageMetadata)
      ? payload.usageMetadata
      : undefined;

  if (usageMetadata) {
    return {
      cacheReadTokens: asNumber(usageMetadata.cachedContentTokenCount),
      inputIncludesCacheTokens: true,
      inputTokens: asNumber(usageMetadata.promptTokenCount),
      model: asString(response.modelVersion) ?? asString(payload.modelVersion),
      outputTokens: asNumber(usageMetadata.candidatesTokenCount),
      totalTokens: asNumber(usageMetadata.totalTokenCount)
    };
  }

  if (!usage) {
    return undefined;
  }

  const inputDetails = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details
    : isRecord(usage.prompt_tokens_details)
      ? usage.prompt_tokens_details
      : undefined;
  const outputDetails = isRecord(usage.output_tokens_details)
    ? usage.output_tokens_details
    : isRecord(usage.completion_tokens_details)
      ? usage.completion_tokens_details
      : undefined;
  const hasAnthropicCacheFields =
    usage.cache_read_input_tokens !== undefined ||
    usage.cache_creation_input_tokens !== undefined;
  const hasOpenAiCacheFields =
    inputDetails?.cached_tokens !== undefined ||
    inputDetails?.cache_creation_tokens !== undefined ||
    usage.cached_tokens !== undefined ||
    usage.prompt_tokens !== undefined;
  const cacheCreation = isRecord(usage.cache_creation) ? usage.cache_creation : undefined;
  const cacheWrite5mTokens = asNumber(cacheCreation?.ephemeral_5m_input_tokens);
  const cacheWrite1hTokens = asNumber(cacheCreation?.ephemeral_1h_input_tokens);

  return {
    cacheReadTokens:
      asNumber(usage.cache_read_tokens) ??
      asNumber(usage.cache_read_input_tokens) ??
      asNumber(usage.cached_tokens) ??
      asNumber(inputDetails?.cached_tokens),
    cacheWrite1hTokens,
    cacheWrite5mTokens,
    cacheWriteTokens:
      asNumber(usage.cache_write_tokens) ??
      asNumber(usage.cache_creation_tokens) ??
      asNumber(usage.cache_creation_input_tokens) ??
      asNumber(inputDetails?.cache_creation_tokens) ??
      sumOptionalNumbers(cacheWrite5mTokens, cacheWrite1hTokens),
    inputIncludesCacheTokens: hasAnthropicCacheFields ? false : hasOpenAiCacheFields ? true : undefined,
    inputTokens: asNumber(usage.input_tokens) ?? asNumber(usage.prompt_tokens),
    model:
      asString(response.model) ??
      asString(payload.model) ??
      asString(message?.model) ??
      asString(response.modelVersion) ??
      asString(payload.modelVersion),
    outputTokens: asNumber(usage.output_tokens) ?? asNumber(usage.completion_tokens),
    reasoningTokens:
      asNumber(outputDetails?.reasoning_tokens) ??
      asNumber(outputDetails?.thinking_tokens) ??
      asNumber(usage.reasoning_tokens) ??
      asNumber(usage.thinking_tokens),
    totalTokens: asNumber(usage.total_tokens)
  };
}

function hasUsageNumbers(snapshot: UsageNumbers): boolean {
  return [
    snapshot.cacheReadTokens,
    snapshot.cacheWrite1hTokens,
    snapshot.cacheWrite5mTokens,
    snapshot.cacheWriteTokens,
    snapshot.inputTokens,
    snapshot.outputTokens,
    snapshot.reasoningTokens,
    snapshot.totalTokens
  ].some((value) => value !== undefined);
}

function mergeUsageSnapshots(primary: UsageNumbers | undefined, fallback: UsageSnapshot | undefined): UsageSnapshot | undefined {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    ...fallback,
    ...Object.fromEntries(Object.entries(primary).filter(([, value]) => value !== undefined))
  };
}

function sumOptionalNumbers(...values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : undefined;
}

function readResponseHeader(headers: Headers | HeaderRecord | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return normalizeFilterValue(headers.get(name) ?? undefined);
  }
  return normalizeFilterValue(headerValue(headersToRecord(headers) as Record<string, string | string[]>, name));
}

function readNumberResponseHeader(headers: Headers | HeaderRecord | undefined, name: string): number | undefined {
  return asNumber(readResponseHeader(headers, name));
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function decodedClaudeAppGatewayRouteParts(value: string | undefined): { model?: string; provider?: string } | undefined {
  const decoded = decodeClaudeAppGatewayRouteId(value ?? "");
  return decoded ? splitRouteSelector(decoded) : undefined;
}

function requestLogStorageModel(value: string | undefined): string | undefined {
  return decodedClaudeAppGatewayRouteParts(value)?.model ?? normalizeFilterValue(value);
}

function requestLogStorageModelSelector(value: string | undefined): string | undefined {
  return normalizeFilterValue(decodeClaudeAppGatewayRouteId(value ?? "") ?? value);
}

function splitRequestLogRouteSelector(value: string | undefined): { model?: string; provider?: string } {
  return splitRouteSelector(decodeClaudeAppGatewayRouteId(value ?? "") ?? value);
}

function splitRouteSelector(value: string | undefined): { model?: string; provider?: string } {
  const trimmed = value?.trim();
  if (!trimmed) {
    return {};
  }

  const separator = trimmed.indexOf("/");
  if (separator <= 0 || separator >= trimmed.length - 1) {
    return { model: trimmed };
  }

  return {
    model: trimmed.slice(separator + 1).trim(),
    provider: trimmed.slice(0, separator).trim()
  };
}

function normalizeStatusFilter(value: RequestLogStatusFilter | undefined): RequestLogStatusFilter {
  return value === "success" || value === "error" ? value : "all";
}

function normalizeFilterValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeLabel(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function normalizeCount(value: unknown): number {
  return asNumber(value) ?? 0;
}

function asNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
}

function asFloat(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSuccessStatus(statusCode: number, error: string | undefined): boolean {
  return !error && statusCode >= 200 && statusCode < 400;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}

function sum<T>(items: T[], read: (item: T) => number): number {
  return items.reduce((total, item) => total + read(item), 0);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
