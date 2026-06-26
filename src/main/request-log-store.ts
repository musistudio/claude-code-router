import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { REQUEST_LOGS_DB_FILE } from "./constants";
import { estimateUsageCostUsd } from "./model-pricing-service";
import { createBetterSqliteDatabase, type BetterSqliteDatabase } from "./sqlite-native";
import { normalizeUsageInputTokens } from "./usage-normalization";
import type {
  AgentAnalysisAgentRow,
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
  RequestLogBody,
  RequestLogFilterOptions,
  RequestLogListFilter,
  RequestLogPage,
  RequestLogRetryAttempt,
  RequestLogStatusFilter,
  UsageStatsRange
} from "../shared/app";

type SqlDatabase = BetterSqliteDatabase;
type SqlValue = bigint | Buffer | number | string | null;

type HeaderRecord = Record<string, string | string[] | undefined>;

type UsageNumbers = {
  cacheReadTokens?: number;
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
  provider: string;
};

type RequestLogRecordInput = {
  client?: string;
  completedAt?: string;
  durationMs: number;
  error?: string;
  fallbackModel?: string;
  method: string;
  path: string;
  providerProtocol?: GatewayProviderProtocol;
  requestBody: Buffer;
  requestHeaders: HeaderRecord;
  requestId?: string;
  responseBodyText?: string;
  responseBodyTruncated?: boolean;
  responseHeaders?: Headers | HeaderRecord;
  startedAt: string;
  statusCode: number;
  url: string;
};

export type RequestLogRawTraceUpdateInput = {
  method?: string;
  model?: string;
  path?: string;
  provider?: string;
  requestBodyContentType?: string;
  requestBodyText?: string;
  requestBodyTruncated?: boolean;
  requestHeaders?: HeaderRecord;
  requestId: string;
  isStream?: boolean;
  responseBodyContentType?: string;
  responseBodyText?: string;
  responseBodyTruncated?: boolean;
  responseHeaders?: HeaderRecord;
  statusCode?: number;
  url?: string;
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
  requestBody: RequestLogBody;
  requestHeaders: Record<string, string | string[]>;
  requestId: string;
  retryAttempts: RequestLogRetryAttempt[];
  responseBody?: RequestLogBody;
  responseHeaders: Record<string, string | string[]>;
  statusCode: number;
  totalTokens: number;
  url: string;
};

type AnalyzedAgentRequest = AgentAnalysisRequestRow & {
  client: string;
  completedAt: string;
  endedAtMs: number;
  startedAtMs: number;
  toolCalls: AgentToolCallDetail[];
  toolResults: AgentToolResultDetail[];
};

type AgentLogDetails = {
  agent: AgentKind;
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

type StreamedToolCallInput = {
  fragments: string[];
  id: string;
  input?: unknown;
  name?: string;
};

export type SseErrorDetector = {
  append: (chunk: Buffer | string) => string | undefined;
  finish: () => string | undefined;
  read: () => string | undefined;
};

type ToolCallStreamState = {
  calls: Map<string, StreamedToolCallInput>;
  indexToId: Map<string, string>;
};

const maxBodyBytes = 2 * 1024 * 1024;
const maxAgentAnalysisRows = 5000;
const maxAgentSessionDetailRequests = 250;
const maxTracePayloadPreviewChars = 1600;
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
const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-auth-api-key-id",
  "x-auth-sub"
]);

class RequestLogStore {
  private database?: SqlDatabase;
  private initPromise?: Promise<SqlDatabase>;
  private lastRetentionCleanupDay?: string;

  constructor(private readonly dbFile: string) {}

  async record(input: RequestLogRecordInput): Promise<void> {
    const database = await this.getDatabase();
    this.pruneOldRequestLogs(database);
    const requestHeaders = sanitizeHeaders(input.requestHeaders);
    const responseHeaders = sanitizeHeaders(headersToRecord(input.responseHeaders));
    const responseBodyText = input.responseBodyText ?? "";
    const responseError = normalizeFilterValue(input.error) ??
      detectSseError(responseBodyText, headerValue(responseHeaders, "content-type"));
    const bodyUsage = extractUsageFromBody(responseBodyText);
    const usage: UsageSnapshot = normalizeUsageInputTokens(extractUsageFromBillingHeaders(input.responseHeaders) ?? bodyUsage, {
      path: input.path,
      providerProtocol: input.providerProtocol,
      usageHint: bodyUsage
    }) ?? {};
    const route = splitRouteSelector(input.fallbackModel);
    const requestModel = extractModelFromBody(input.requestBody.toString("utf8"));
    const provider =
      readResponseHeader(input.responseHeaders, "x-gateway-target-provider-name") ??
      readResponseHeader(input.responseHeaders, "x-gateway-target-provider") ??
      route.provider;
    const inputTokens = normalizeCount(usage.inputTokens);
    const outputTokens = normalizeCount(usage.outputTokens);
    const reasoningTokens = normalizeCount(usage.reasoningTokens);
    const cacheReadTokens = normalizeCount(usage.cacheReadTokens);
    const cacheWriteTokens = normalizeCount(usage.cacheWriteTokens);
    const totalTokens =
      normalizeCount(usage.totalTokens) ||
      inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
    const model = normalizeLabel(usage.model ?? route.model ?? requestModel ?? input.fallbackModel, "unknown");
    const providerName = normalizeLabel(provider, "unknown");
    const credentialInfo = readCredentialLogInfo(responseHeaders, requestHeaders);
    const cost = await estimateUsageCostUsd({
      cacheReadTokens,
      cacheWriteTokens,
      inputTokens,
      model,
      outputTokens,
      provider: providerName
    });
    const requestBody = bodyFromBuffer(
      input.requestBody,
      headerValue(requestHeaders, "content-type")
    );
    const responseBody = bodyFromText(
      responseBodyText,
      headerValue(responseHeaders, "content-type"),
      Boolean(input.responseBodyTruncated)
    );
    const isStream = inferRequestLogIsStream({
      path: input.path,
      requestBodyText: requestBody.encoding === "utf8" ? requestBody.text : undefined,
      requestHeaders,
      responseBodyContentType: responseBody.contentType,
      responseHeaders,
      url: input.url
    });

    const statement = database.prepare(`
      INSERT INTO request_logs (
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
        response_body_text,
        response_body_encoding,
        response_body_content_type,
        response_body_size_bytes,
        response_body_truncated,
        error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    statement.run(
      input.startedAt,
      input.completedAt ?? new Date().toISOString(),
      input.requestId ?? "",
      normalizeLabel(input.client, "unknown"),
      input.method,
      input.path,
      input.url,
      providerName,
      credentialInfo.id,
      credentialInfo.chain.join(","),
      credentialInfo.saturated ? 1 : 0,
      model,
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
      JSON.stringify(requestHeaders),
      JSON.stringify(responseHeaders),
      requestBody.text,
      requestBody.encoding,
      requestBody.contentType ?? "",
      requestBody.sizeBytes,
      requestBody.truncated ? 1 : 0,
      responseBody.text,
      responseBody.encoding,
      responseBody.contentType ?? "",
      responseBody.sizeBytes,
      responseBody.truncated ? 1 : 0,
      responseError ?? ""
    );
  }

  async updateFromRawTrace(input: RequestLogRawTraceUpdateInput): Promise<boolean> {
    const requestId = input.requestId.trim();
    if (!requestId) {
      return false;
    }

    const database = await this.getDatabase();
    this.pruneOldRequestLogs(database);
    if (!hasRequestLogWithRequestId(database, requestId)) {
      return false;
    }
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
    const modelFromTrace = normalizeFilterValue(input.model);
    const providerFromTrace = normalizeFilterValue(input.provider);
    const statusCode = input.statusCode === undefined ? undefined : normalizeCount(input.statusCode);
    const requestHeaders = input.requestHeaders === undefined ? undefined : sanitizeHeaders(input.requestHeaders);
    const responseHeaders = input.responseHeaders === undefined ? undefined : sanitizeHeaders(input.responseHeaders);
    const responseBodyContentType = input.responseBodyContentType ?? headerValue(responseHeaders ?? {}, "content-type");
    const sseError = input.responseBodyText === undefined
      ? undefined
      : detectSseError(input.responseBodyText, responseBodyContentType);
    const mergedRequestHeaders = requestHeaders
      ? mergeRequestHeadersForRawTrace(readRequestHeadersForRequestId(database, requestId), requestHeaders)
      : undefined;

    pushValue("method", normalizeFilterValue(input.method));
    pushValue("path", path);
    pushValue("url", url);
    pushValue("provider", providerFromTrace);
    pushValue("model", modelFromTrace);
    if (statusCode !== undefined && statusCode > 0) {
      pushValue("status_code", statusCode);
      pushValue("ok", isSuccessStatus(statusCode, sseError) ? 1 : 0);
    }
    if (sseError) {
      pushValue("error", sseError);
      if (statusCode === undefined) {
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
      const usage: UsageSnapshot = normalizeUsageInputTokens<UsageSnapshot>(extractUsageFromBillingHeaders(responseHeaders) ?? bodyUsage, {
        path: usagePath,
        usageHint: bodyUsage
      }) ?? {};
      if (hasUsageNumbers(usage)) {
        const inputTokens = normalizeCount(usage.inputTokens);
        const outputTokens = normalizeCount(usage.outputTokens);
        const reasoningTokens = normalizeCount(usage.reasoningTokens);
        const cacheReadTokens = normalizeCount(usage.cacheReadTokens);
        const cacheWriteTokens = normalizeCount(usage.cacheWriteTokens);
        const totalTokens =
          normalizeCount(usage.totalTokens) ||
          inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
        const model = normalizeLabel(usage.model ?? modelFromTrace ?? existingUsageContext.model, "unknown");
        const provider = normalizeLabel(providerFromTrace ?? existingUsageContext.provider, "unknown");
        const cost = await estimateUsageCostUsd({
          cacheReadTokens,
          cacheWriteTokens,
          inputTokens,
          model,
          outputTokens,
          provider
        });

        pushValue("input_tokens", inputTokens);
        pushValue("output_tokens", outputTokens);
        pushValue("reasoning_tokens", reasoningTokens);
        pushValue("cache_read_tokens", cacheReadTokens);
        pushValue("cache_write_tokens", cacheWriteTokens);
        pushValue("total_tokens", totalTokens);
        pushValue("cost_usd", cost?.amountUsd ?? null);
        if (usage.model && !modelFromTrace) {
          pushValue("model", model);
        }
      }
    }
    if (hasCredentialLogHeaders(responseHeaders ?? {}) || hasCredentialLogHeaders(mergedRequestHeaders ?? {})) {
      const credentialInfo = readCredentialLogInfo(responseHeaders ?? {}, mergedRequestHeaders ?? {});
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
    if (input.requestBodyText !== undefined) {
      const requestBody = bodyFromText(
        input.requestBodyText,
        input.requestBodyContentType ?? headerValue(mergedRequestHeaders ?? {}, "content-type"),
        Boolean(input.requestBodyTruncated)
      );
      pushBodyValues(sets, params, "request", requestBody);
    }
    if (input.responseBodyText !== undefined) {
      const responseBody = bodyFromText(
        input.responseBodyText,
        responseBodyContentType,
        Boolean(input.responseBodyTruncated)
      );
      pushBodyValues(sets, params, "response", responseBody);
    }

    if (sets.length === 0) {
      return true;
    }

    database.prepare(`UPDATE request_logs SET ${sets.join(", ")} WHERE request_id = ?`).run(...params, requestId);
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
            response_body_text,
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

  async analyze(filter: AgentAnalysisFilter = {}): Promise<AgentAnalysisSnapshot> {
    const database = await this.getDatabase();
    this.pruneOldRequestLogs(database);
    const now = new Date();
    const range = normalizeAgentAnalysisRange(filter.range);
    const since = getAgentAnalysisSince(range, now);
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
            response_body_text,
            response_body_encoding,
            response_body_content_type,
            response_body_size_bytes,
            response_body_truncated,
            error
          FROM request_logs
          WHERE source_usage_id IS NULL
            AND path NOT LIKE ?
            AND created_at >= ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        `,
        ["%/count_tokens%", since.toISOString(), maxAgentAnalysisRows]
    )
      .map(toRequestLogEntry)
      .reverse();

    const requestedAgent = normalizeAgentFilter(filter.agent);
    const analyzed = rows
      .map(toAnalyzedAgentRequest)
      .filter((request) => requestedAgent === "all" || request.agent === requestedAgent);
    const requests = applyRequestConcurrency(analyzed);
    const sessionScopedRequests = selectAgentSessionRequests(requests, filter);
    const analysisRequests = sessionScopedRequests
      ? applyRequestConcurrency(sessionScopedRequests)
      : requests;
    const selectedSession = sessionScopedRequests
      ? buildAgentSessionDetail(analysisRequests)
      : undefined;

    return {
      agents: buildAgentRows(analysisRequests),
      clients: buildAgentClientRows(analysisRequests),
      concurrency: buildAgentConcurrencySeries(range, now, analysisRequests),
      endpoints: buildAgentEndpointRows(analysisRequests),
      errors: buildAgentErrorRows(analysisRequests),
      generatedAt: now.toISOString(),
      range,
      recentRequests: analysisRequests.slice(-50).reverse().map(stripAnalysisInternals),
      routes: buildAgentRouteRows(analysisRequests),
      scannedRequestCount: rows.length,
      ...(selectedSession ? { selectedSession } : {}),
      sessions: buildAgentSessionRows(requests),
      subagents: buildAgentSubagentRows(analysisRequests),
      tools: buildAgentToolRows(analysisRequests),
      totals: buildAgentAnalysisTotals(analysisRequests)
    };
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

    const body = request.part === "tool-input" ? entry.responseBody : entry.requestBody;
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
        client TEXT NOT NULL DEFAULT 'unknown',
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT 'unknown',
        credential_id TEXT NOT NULL DEFAULT '',
        credential_chain TEXT NOT NULL DEFAULT '',
        credential_saturated INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL DEFAULT 'unknown',
        is_stream INTEGER NOT NULL DEFAULT 0,
        status_code INTEGER NOT NULL DEFAULT 0,
        ok INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        request_headers TEXT NOT NULL DEFAULT '{}',
        response_headers TEXT NOT NULL DEFAULT '{}',
        request_body_text TEXT NOT NULL DEFAULT '',
        request_body_encoding TEXT NOT NULL DEFAULT 'utf8',
        request_body_content_type TEXT NOT NULL DEFAULT '',
        request_body_size_bytes INTEGER NOT NULL DEFAULT 0,
        request_body_truncated INTEGER NOT NULL DEFAULT 0,
        response_body_text TEXT NOT NULL DEFAULT '',
        response_body_encoding TEXT NOT NULL DEFAULT 'utf8',
        response_body_content_type TEXT NOT NULL DEFAULT '',
        response_body_size_bytes INTEGER NOT NULL DEFAULT 0,
        response_body_truncated INTEGER NOT NULL DEFAULT 0,
        error TEXT NOT NULL DEFAULT ''
      );
    `);
    ensureRequestLogSchema(database);
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

    database.prepare(
      "DELETE FROM request_logs WHERE source_usage_id IS NULL AND created_at < ?",
    ).run(cutoff);
    this.lastRetentionCleanupDay = dayKey;
  }
}

export const requestLogStore = new RequestLogStore(REQUEST_LOGS_DB_FILE);

export async function recordGatewayRequestLog(input: RequestLogRecordInput): Promise<void> {
  try {
    await requestLogStore.record(input);
  } catch (error) {
    console.warn(`[request-log] Failed to record request log: ${formatError(error)}`);
  }
}

export async function updateGatewayRequestLogFromRawTrace(input: RequestLogRawTraceUpdateInput): Promise<boolean> {
  try {
    return await requestLogStore.updateFromRawTrace(input);
  } catch (error) {
    console.warn(`[request-log] Failed to update request log from raw trace: ${formatError(error)}`);
    return false;
  }
}

export async function getRequestLogs(filter?: RequestLogListFilter): Promise<RequestLogPage> {
  try {
    return await requestLogStore.list(filter);
  } catch (error) {
    console.warn(`[request-log] Failed to read request logs: ${formatError(error)}`);
    throw error;
  }
}

export async function getAgentAnalysis(filter?: AgentAnalysisFilter): Promise<AgentAnalysisSnapshot> {
  try {
    return await requestLogStore.analyze(filter);
  } catch (error) {
    console.warn(`[request-log] Failed to analyze agent logs: ${formatError(error)}`);
    throw error;
  }
}

export async function getAgentTracePayload(request: AgentAnalysisTracePayloadRequest): Promise<AgentAnalysisTracePayloadFullResult> {
  try {
    return await requestLogStore.getTracePayload(request);
  } catch (error) {
    console.warn(`[request-log] Failed to read agent trace payload: ${formatError(error)}`);
    throw error;
  }
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
    requestId: entry.requestId,
    routeReason: details.routeReason,
    sessionId: details.sessionId,
    startedAtMs,
    statusCode: entry.statusCode,
    subagentModel: details.subagentModel,
    toolCallCount: details.tools.length,
    toolCalls: details.toolCalls,
    toolResults: details.toolResults,
    tools: details.tools,
    totalTokens: entry.totalTokens,
    userAgent: details.userAgent
  };
}

function extractAgentLogDetails(entry: StoredRequestLogEntry): AgentLogDetails {
  const requestPayloads = parseLogBodyPayloads(entry.requestBody);
  const responsePayloads = parseLogBodyPayloads(entry.responseBody);
  const routeReason = readHeaderValue(entry.requestHeaders, "x-ccr-route-reason");
  const routedModel = readHeaderValue(entry.requestHeaders, "x-ccr-routed-model");
  const subagentModel = extractSubagentModel(entry, requestPayloads, routeReason, routedModel);
  const agent = inferAgentKind(entry, requestPayloads, responsePayloads);
  const toolCalls = extractToolCalls(responsePayloads);
  const toolResults = extractToolResults(requestPayloads, entry);

  return {
    agent,
    routeReason,
    sessionId: extractAgentSessionId(entry, requestPayloads, agent),
    subagentModel,
    toolCalls,
    toolResults,
    tools: toolCalls.map((tool) => tool.name),
    userAgent: readAgentUserAgent(entry.requestHeaders)
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

  const bodyAgent = inferAgentFromText(haystack, { allowStandaloneCodex: false });
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
  const orderedHeaders = agent === "zcode"
    ? [...zcodeHeaders, ...codexHeaders, ...commonHeaders, ...claudeCodeHeaders]
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
    const match = stringifyForSearch(payload).match(/<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return undefined;
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

function extractToolResults(payloads: unknown[], entry: StoredRequestLogEntry): AgentToolResultDetail[] {
  const results = new Map<string, AgentToolResultDetail>();
  for (const payload of payloads) {
    collectToolResults(payload, entry, results);
  }
  return Array.from(results.values());
}

function collectToolResults(
  value: unknown,
  entry: StoredRequestLogEntry,
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
    type === "tool_result" ||
    type === "function_call_output" ||
    type === "tool_call_output" ||
    (role === "tool" && Boolean(value.tool_call_id));

  if (looksLikeToolResult && id) {
    results.set(id, {
      id,
      requestId: entry.requestId,
      requestLogId: entry.id,
      result: payloadPreview(value.content ?? value.output ?? value.result ?? value.text)
    });
  }

  for (const item of Object.values(value)) {
    collectToolResults(item, entry, results);
  }
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
  if (!callId && results.size === 1) {
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
    type === "tool_result" ||
    type === "function_call_output" ||
    type === "tool_call_output" ||
    (role === "tool" && Boolean(value.tool_call_id));

  if (looksLikeToolResult && id) {
    results.set(id, value.content ?? value.output ?? value.result ?? value.text);
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
  sessionRequests: AnalyzedAgentRequest[]
): AgentAnalysisSessionDetail | undefined {
  if (sessionRequests.length === 0) {
    return undefined;
  }

  return {
    endpoints: buildAgentEndpointRows(sessionRequests),
    errors: buildAgentErrorRows(sessionRequests),
    models: buildAgentSessionModelRows(sessionRequests),
    requests: sessionRequests.slice(-maxAgentSessionDetailRequests).reverse().map(stripAnalysisInternals),
    routes: buildAgentRouteRows(sessionRequests),
    session: buildAgentSessionRow(sessionRequests),
    statusCodes: buildStatusCodeCounts(sessionRequests),
    subagents: buildAgentSubagentRows(sessionRequests),
    tools: buildAgentToolRows(sessionRequests),
    totals: buildAgentAnalysisTotals(sessionRequests),
    trace: buildAgentTrace(sessionRequests)
  };
}

function buildAgentTrace(requests: AnalyzedAgentRequest[]): AgentAnalysisTrace {
  const ordered = [...requests].sort((a, b) => a.startedAtMs - b.startedAtMs || a.id - b.id);
  const first = ordered[0];
  const sessionId = first.sessionId;
  const startMs = Math.min(...ordered.map((request) => request.startedAtMs));
  const endMs = Math.max(...ordered.map((request) => request.endedAtMs));
  const durationMs = Math.max(0, endMs - startMs);
  const totals = buildAgentAnalysisTotals(ordered);
  const rootRunId = `agent:${first.agent}:${sessionId}`;
  const toolResults = buildToolResultMap(ordered);
  const runs: AgentAnalysisTraceRun[] = [
    {
      agent: first.agent,
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      concurrentRequests: totals.maxConcurrentRequests,
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
      status: totals.errorCount > 0 ? "error" : "success",
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

    if (request.routeReason && !isInlineModelRouteReason(request.routeReason)) {
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
        tool: toolDetailForCall(toolCall, toolResults)
      }));
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

function isInlineModelRouteReason(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "inline-model";
}

function buildToolResultMap(requests: AnalyzedAgentRequest[]): Map<string, AgentToolResultDetail> {
  const results = new Map<string, AgentToolResultDetail>();
  for (const request of requests) {
    for (const result of request.toolResults) {
      results.set(result.id, result);
    }
  }
  return results;
}

function toolDetailForCall(
  call: AgentToolCallDetail,
  results: Map<string, AgentToolResultDetail>
): AgentAnalysisTraceToolDetail {
  const result = call.id ? results.get(call.id) : undefined;
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
  const totalTokens = sum(requests, (request) => request.totalTokens || request.inputTokens + request.outputTokens + request.cacheReadTokens + request.cacheWriteTokens);
  const promptTokens = sum(requests, (request) => {
    const promptTokensFromTotal = request.totalTokens - request.outputTokens;
    return promptTokensFromTotal > 0
      ? Math.max(request.inputTokens, promptTokensFromTotal)
      : request.inputTokens + request.cacheReadTokens + request.cacheWriteTokens;
  });
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
    endedAtMs: _endedAtMs,
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
  return value === "claude-code" || value === "codex" || value === "zcode" || value === "claude-design" || value === "unknown" ? value : "all";
}

function normalizeSessionAgentFilter(value: AgentAnalysisFilter["sessionAgent"] | undefined): AgentKind | undefined {
  return value === "claude-code" || value === "codex" || value === "zcode" || value === "claude-design" || value === "unknown" ? value : undefined;
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

function readHeaderValue(headers: Record<string, string | string[]>, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return normalizeFilterValue(value[0]);
  }
  return normalizeFilterValue(value);
}

function hasCredentialLogHeaders(headers: Record<string, string | string[]>): boolean {
  return Boolean(
    readHeaderValue(headers, "x-ccr-provider-credential-id") ||
    readHeaderValue(headers, "x-ccr-provider-credential-chain") ||
    readHeaderValue(headers, "x-ccr-provider-credential-saturated")
  );
}

function readCredentialLogInfo(
  responseHeaders: Record<string, string | string[]>,
  requestHeaders: Record<string, string | string[]>
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

function ensureRequestLogSchema(database: SqlDatabase): void {
  const columns = new Set(
    queryRows(database, "PRAGMA table_info(request_logs)")
      .map((row) => String(row.name ?? ""))
      .filter(Boolean)
  );
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
  addColumn("client", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumn("method", "TEXT NOT NULL DEFAULT ''");
  addColumn("path", "TEXT NOT NULL DEFAULT ''");
  addColumn("url", "TEXT NOT NULL DEFAULT ''");
  addColumn("provider", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumn("credential_id", "TEXT NOT NULL DEFAULT ''");
  addColumn("credential_chain", "TEXT NOT NULL DEFAULT ''");
  addColumn("credential_saturated", "INTEGER NOT NULL DEFAULT 0");
  addColumn("model", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumn("is_stream", "INTEGER NOT NULL DEFAULT 0");
  addColumn("status_code", "INTEGER NOT NULL DEFAULT 0");
  addColumn("ok", "INTEGER NOT NULL DEFAULT 0");
  addColumn("duration_ms", "INTEGER NOT NULL DEFAULT 0");
  addColumn("input_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("output_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("reasoning_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("cache_read_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("cache_write_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("total_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn("cost_usd", "REAL");
  addColumn("request_headers", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("response_headers", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("request_body_text", "TEXT NOT NULL DEFAULT ''");
  addColumn("request_body_encoding", "TEXT NOT NULL DEFAULT 'utf8'");
  addColumn("request_body_content_type", "TEXT NOT NULL DEFAULT ''");
  addColumn("request_body_size_bytes", "INTEGER NOT NULL DEFAULT 0");
  addColumn("request_body_truncated", "INTEGER NOT NULL DEFAULT 0");
  addColumn("response_body_text", "TEXT NOT NULL DEFAULT ''");
  addColumn("response_body_encoding", "TEXT NOT NULL DEFAULT 'utf8'");
  addColumn("response_body_content_type", "TEXT NOT NULL DEFAULT ''");
  addColumn("response_body_size_bytes", "INTEGER NOT NULL DEFAULT 0");
  addColumn("response_body_truncated", "INTEGER NOT NULL DEFAULT 0");
  addColumn("error", "TEXT NOT NULL DEFAULT ''");

  database.exec("CREATE INDEX IF NOT EXISTS request_logs_created_at_idx ON request_logs(created_at)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_credential_id_idx ON request_logs(credential_id)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_model_idx ON request_logs(model)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_provider_idx ON request_logs(provider)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_source_usage_id_idx ON request_logs(source_usage_id)");
  database.exec("CREATE INDEX IF NOT EXISTS request_logs_status_idx ON request_logs(ok, status_code)");
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
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
}

function queryRows(database: SqlDatabase, sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  return database.prepare(sql).all(...params) as Record<string, SqlValue>[];
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
        response_body_text,
        response_body_encoding,
        response_body_content_type,
        response_body_size_bytes,
        response_body_truncated,
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
    requestBody,
    requestHeaders,
    requestId: String(row.request_id ?? ""),
    retryAttempts: parseRequestLogRetryAttempts(responseHeaders, normalizeCount(row.status_code)),
    responseBody,
    responseHeaders,
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
  return {
    contentType,
    encoding,
    sizeBytes,
    text,
    truncated: normalizeCount(row[`${prefix}_body_truncated`]) === 1
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

function bodyFromBuffer(buffer: Buffer, contentType?: string): RequestLogBody {
  const truncated = buffer.byteLength > maxBodyBytes;
  const data = truncated ? buffer.subarray(0, maxBodyBytes) : buffer;
  const textLike = isTextLikeContentType(contentType);
  return {
    contentType,
    encoding: textLike ? "utf8" : "base64",
    sizeBytes: buffer.byteLength,
    text: textLike ? data.toString("utf8") : data.toString("base64"),
    truncated
  };
}

function bodyFromText(text: string, contentType?: string, alreadyTruncated = false): RequestLogBody {
  const buffer = Buffer.from(text);
  const truncated = alreadyTruncated || buffer.byteLength > maxBodyBytes;
  const data = truncated ? buffer.subarray(0, maxBodyBytes) : buffer;
  return {
    contentType,
    encoding: "utf8",
    sizeBytes: buffer.byteLength,
    text: data.toString("utf8"),
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

function readRequestHeadersForRequestId(database: SqlDatabase, requestId: string): Record<string, string | string[]> {
  const row = queryRows(database, "SELECT request_headers FROM request_logs WHERE request_id = ? LIMIT 1", [requestId])[0];
  return row ? parseHeaderJson(row.request_headers) : {};
}

function readRequestLogUsageContext(database: SqlDatabase, requestId: string): RequestLogUsageContext {
  const row = queryRows(database, "SELECT model, path, provider FROM request_logs WHERE request_id = ? LIMIT 1", [requestId])[0];
  return {
    model: normalizeLabel(String(row?.model ?? ""), "unknown"),
    path: normalizeLabel(String(row?.path ?? ""), ""),
    provider: normalizeLabel(String(row?.provider ?? ""), "unknown")
  };
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
    if (sensitiveHeaderNames.has(normalizedKey)) {
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

function extractUsageFromBillingHeaders(headers: Headers | HeaderRecord | undefined): UsageNumbers | undefined {
  const inputTokens = readNumberResponseHeader(headers, "x-gateway-billing-input-tokens");
  const outputTokens = readNumberResponseHeader(headers, "x-gateway-billing-output-tokens");
  const reasoningTokens =
    readNumberResponseHeader(headers, "x-gateway-billing-reasoning-tokens") ??
    readNumberResponseHeader(headers, "x-gateway-billing-thinking-tokens");
  const cacheReadTokens = readNumberResponseHeader(headers, "x-gateway-billing-cache-read-tokens");
  const cacheWriteTokens = readNumberResponseHeader(headers, "x-gateway-billing-cache-write-tokens");
  const totalTokens = readNumberResponseHeader(headers, "x-gateway-billing-total-tokens");

  if ([inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, totalTokens].every((value) => value === undefined)) {
    return undefined;
  }

  return {
    cacheReadTokens,
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

  return snapshots.at(-1);
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
  let pendingLine = "";

  const read = () => detectedError;
  const flushEvent = () => {
    if (!detectedError) {
      detectedError = detectSseEventError(currentEvent, dataLines);
    }
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
      if (!active || detectedError) {
        return detectedError;
      }
      processText(Buffer.isBuffer(chunk) ? decoder.write(chunk) : chunk);
      return detectedError;
    },
    finish() {
      if (!active || detectedError) {
        return detectedError;
      }
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
    read
  };
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
  const usage = isRecord(response.usage)
    ? response.usage
    : isRecord(payload.usage)
      ? payload.usage
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

  return {
    cacheReadTokens:
      asNumber(usage.cache_read_tokens) ??
      asNumber(usage.cache_read_input_tokens) ??
      asNumber(usage.cached_tokens) ??
      asNumber(inputDetails?.cached_tokens),
    cacheWriteTokens:
      asNumber(usage.cache_write_tokens) ??
      asNumber(usage.cache_creation_tokens) ??
      asNumber(usage.cache_creation_input_tokens) ??
      asNumber(inputDetails?.cache_creation_tokens),
    inputIncludesCacheTokens: hasAnthropicCacheFields ? false : hasOpenAiCacheFields ? true : undefined,
    inputTokens: asNumber(usage.input_tokens) ?? asNumber(usage.prompt_tokens),
    model:
      asString(response.model) ??
      asString(payload.model) ??
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

function extractModelFromBody(text: string): string | undefined {
  const parsed = parseJson(text.trim());
  if (!isRecord(parsed)) {
    return undefined;
  }
  return asString(parsed.model);
}

function hasUsageNumbers(snapshot: UsageNumbers): boolean {
  return [
    snapshot.cacheReadTokens,
    snapshot.cacheWriteTokens,
    snapshot.inputTokens,
    snapshot.outputTokens,
    snapshot.reasoningTokens,
    snapshot.totalTokens
  ].some((value) => value !== undefined);
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
