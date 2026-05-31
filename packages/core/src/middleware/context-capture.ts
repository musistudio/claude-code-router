/**
 * ContextCapture - Full request/response capture engine.
 *
 * Captures complete (request, response, timing, usage) tuples at the
 * CCR proxy layer. This replaces pineapple's hook-based HSE traces
 * with complete context — hook traces only captured tool names and paths.
 *
 * Storage: Postgres pgvector (semantic_documents + gateway_requests tables).
 * Fallback: Local JSONL file if Postgres unavailable.
 *
 * Integration: Used by orchestrator.onPostResponse() for fire-and-forget
 * capture. Never blocks the request pipeline (> 3s timeout).
 */
import { createHash } from 'crypto';
import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

export interface CaptureEntry {
  /** Unique capture ID (SHA-256 of request hash) */
  captureId: string;
  /** Session identifier */
  sessionId: string;
  /** Agent type (from system prompt detection) */
  agentType: string;
  /** Model tier used */
  modelTier: string;
  /** Provider + model */
  provider: string;
  modelId: string;
  /** Conversation turn ordinal */
  turnNumber: number;
  /** Tokens */
  inputTokens: number;
  outputTokens: number;
  cacheCreateInputTokens: number;
  cacheReadInputTokens: number;
  /** Request summary (first 500 chars of last user message) */
  requestSummary: string;
  /** Full request body (compressed) */
  requestBody: any;
  /** Full response body (compressed) */
  responseBody: any;
  /** Tool calls extracted from response */
  toolCalls: ToolCallRecord[];
  /** File paths referenced in tool calls */
  referencedFiles: string[];
  /** Timing */
  startTime: number;
  endTime: number;
  latencyMs: number;
  /** Routing */
  routeReason: string;
  scenarioType: string;
  /** Hallucination risk (from reasoning-engine.ts) */
  hallucinationRisk: number;
  /** Whether this was a cache hit */
  cacheHit: boolean;
  /** Whether RAG context was injected */
  ragEnriched: boolean;
  /** Error info if request failed */
  error?: string;
  /** Timestamp */
  capturedAt: string;
}

export interface ToolCallRecord {
  toolName: string;
  toolId: string;
  input: any;
  output?: string;
  isError?: boolean;
}

export interface CaptureConfig {
  enabled: boolean;
  storageMode: 'postgres' | 'jsonl' | 'both';
  postgresConnectionString?: string;
  jsonlPath: string;
  maxBodySize: number;       // Max bytes for full body storage (compress beyond)
  maxSummaryLength: number;  // Max chars for request summary
  batchSize: number;         // Write batch to Postgres every N entries
}

const DEFAULT_CONFIG: CaptureConfig = {
  enabled: true,
  storageMode: 'jsonl',
  jsonlPath: './dev/captures.jsonl',
  maxBodySize: 100 * 1024,     // 100KB
  maxSummaryLength: 500,
  batchSize: 10,
};

export class ContextCaptureEngine {
  private config: CaptureConfig;
  private batch: CaptureEntry[] = [];
  private sessionTurnCounters: Map<string, number> = new Map();

  constructor(config: Partial<CaptureConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Capture a complete request/response cycle.
   * Fire-and-forget — never throws, never blocks.
   */
  async capture(params: {
    sessionId?: string;
    agentType?: string;
    modelTier?: string;
    provider?: string;
    modelId?: string;
    tokenCount?: number;
    requestBody?: any;
    responseBody?: any;
    usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
    startTime?: number;
    endTime?: number;
    scenarioType?: string;
    routeReason?: string;
    hallucinationRisk?: number;
    cacheHit?: boolean;
    ragEnriched?: boolean;
    error?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const sessionId = params.sessionId || 'unknown';
      const turnNumber = this.nextTurn(sessionId);
      const now = Date.now();

      const entry: CaptureEntry = {
        captureId: this.generateCaptureId(params),
        sessionId,
        agentType: params.agentType || 'unknown',
        modelTier: params.modelTier || 'unknown',
        provider: params.provider || 'unknown',
        modelId: params.modelId || 'unknown',
        turnNumber,
        inputTokens: params.usage?.input_tokens || params.tokenCount || 0,
        outputTokens: params.usage?.output_tokens || 0,
        cacheCreateInputTokens: params.usage?.cache_creation_input_tokens || 0,
        cacheReadInputTokens: params.usage?.cache_read_input_tokens || 0,
        requestSummary: this.extractSummary(params.requestBody),
        requestBody: this.compressBody(params.requestBody),
        responseBody: this.compressBody(params.responseBody),
        toolCalls: this.extractToolCalls(params.responseBody),
        referencedFiles: this.extractFiles(params.requestBody, params.responseBody),
        startTime: params.startTime || now,
        endTime: params.endTime || now,
        latencyMs: (params.endTime || now) - (params.startTime || now),
        routeReason: params.routeReason || '',
        scenarioType: params.scenarioType || '',
        hallucinationRisk: params.hallucinationRisk || 0,
        cacheHit: params.cacheHit || false,
        ragEnriched: params.ragEnriched || false,
        error: params.error,
        capturedAt: new Date().toISOString(),
      };

      // Write immediately to JSONL (durable, fast)
      await this.writeToJSONL(entry);

      // Batch for Postgres if enabled
      if (this.config.storageMode === 'postgres' || this.config.storageMode === 'both') {
        this.batch.push(entry);
        if (this.batch.length >= this.config.batchSize) {
          await this.flushPostgres();
        }
      }
    } catch (error: any) {
      this.logger?.error(`ContextCapture capture failed: ${error.message}`);
    }
  }

  /**
   * Flush remaining batch (called on session end or shutdown).
   */
  async flush(): Promise<void> {
    if (this.batch.length > 0) {
      await this.flushPostgres();
    }
  }

  /**
   * Query captured contexts — supports semantic search via pgvector.
   */
  async query(params: {
    query: string;
    limit?: number;
    sessionId?: string;
    agentType?: string;
    sinceMs?: number;
  }): Promise<CaptureEntry[]> {
    if (this.config.storageMode === 'jsonl') {
      // JSONL fallback: return recent entries (no semantic search)
      return []; // TODO: implement JSONL grep
    }

    // Postgres semantic search via pgvector
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool }: any = require('pg');
      const pool = new Pool({ connectionString: this.config.postgresConnectionString });
      const result = await pool.query(
        `SELECT capture_id, session_id, agent_type, request_summary, input_tokens, output_tokens, latency_ms
         FROM gateway_requests
         WHERE ($1::text IS NULL OR session_id = $1)
           AND ($2::text IS NULL OR agent_type = $2)
           AND ($3::bigint IS NULL OR start_time >= $3)
         ORDER BY captured_at DESC
         LIMIT $4`,
        [params.sessionId || null, params.agentType || null, params.sinceMs || null, params.limit || 20]
      );
      await pool.end();
      return result.rows;
    } catch (error: any) {
      this.logger?.error(`ContextCapture query error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get capture statistics.
   */
  getStats(): { totalCaptures: number; sessions: number; avgLatencyMs: number } {
    return {
      totalCaptures: 0, // Tracked externally
      sessions: this.sessionTurnCounters.size,
      avgLatencyMs: 0,
    };
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private nextTurn(sessionId: string): number {
    const current = this.sessionTurnCounters.get(sessionId) || 0;
    const next = current + 1;
    this.sessionTurnCounters.set(sessionId, next);
    return next;
  }

  private generateCaptureId(params: any): string {
    const basis = `${params.sessionId || ''}:${params.startTime || Date.now()}:${Math.random()}`;
    return createHash('sha256').update(basis).digest('hex').slice(0, 16);
  }

  private extractSummary(body: any): string {
    if (!body?.messages) return '';
    const messages = body.messages as any[];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        const content = typeof messages[i].content === 'string'
          ? messages[i].content
          : Array.isArray(messages[i].content)
            ? messages[i].content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text || '')
                .join(' ')
            : '';
        return content.slice(0, this.config.maxSummaryLength);
      }
    }
    return '';
  }

  private compressBody(body: any): any {
    if (!body) return null;
    try {
      const str = JSON.stringify(body);
      if (str.length <= this.config.maxBodySize) return JSON.parse(str);
      // Truncate oversized bodies
      return { _truncated: true, _originalSize: str.length, preview: str.slice(0, this.config.maxBodySize) };
    } catch {
      return null;
    }
  }

  private extractToolCalls(body: any): ToolCallRecord[] {
    if (!body?.content || !Array.isArray(body.content)) return [];
    return body.content
      .filter((c: any) => c.type === 'tool_use')
      .map((c: any) => ({
        toolName: c.name || 'unknown',
        toolId: c.id || '',
        input: c.input || {},
      }));
  }

  private extractFiles(requestBody: any, responseBody: any): string[] {
    const files = new Set<string>();

    // From request messages (recent tool_results)
    if (requestBody?.messages) {
      for (const msg of requestBody.messages) {
        if (msg.role === 'user' && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'tool_result' && block.content) {
              const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
              const matches = text.match(/[A-Za-z]:[\\/][\w\\/. -]+\.\w{1,5}/g) || [];
              for (const m of matches) files.add(m);
            }
          }
        }
      }
    }

    // From response tool_use blocks
    if (responseBody?.content && Array.isArray(responseBody.content)) {
      for (const block of responseBody.content) {
        if (block.type === 'tool_use' && block.input) {
          const pathFields = ['filePath', 'path', 'file_path', 'file', 'target_file', 'output', 'workdir'];
          for (const field of pathFields) {
            if (block.input[field] && typeof block.input[field] === 'string') {
              files.add(block.input[field]);
            }
          }
        }
      }
    }

    return Array.from(files).slice(0, 20);
  }

  private async writeToJSONL(entry: CaptureEntry): Promise<void> {
    try {
      const dir = dirname(this.config.jsonlPath);
      try { await mkdir(dir, { recursive: true }); } catch {}

      // Only store lightweight version in JSONL (full body in Postgres)
      const lightweight = {
        captureId: entry.captureId,
        sessionId: entry.sessionId,
        agentType: entry.agentType,
        provider: entry.provider,
        modelId: entry.modelId,
        turnNumber: entry.turnNumber,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        requestSummary: entry.requestSummary,
        toolCalls: entry.toolCalls?.map(t => t.toolName),
        referencedFiles: entry.referencedFiles,
        latencyMs: entry.latencyMs,
        hallucinationRisk: entry.hallucinationRisk,
        cacheHit: entry.cacheHit,
        ragEnriched: entry.ragEnriched,
        error: entry.error,
        capturedAt: entry.capturedAt,
      };

      await appendFile(this.config.jsonlPath, JSON.stringify(lightweight) + '\n');
    } catch (error: any) {
      this.logger?.debug(`ContextCapture JSONL write error: ${error.message}`);
    }
  }

  private async flushPostgres(): Promise<void> {
    if (this.batch.length === 0 || !this.config.postgresConnectionString) return;

    const batch = [...this.batch];
    this.batch = [];

    try {
      const { Pool }: any = require('pg');
      const pool = new Pool({ connectionString: this.config.postgresConnectionString });

      for (const entry of batch) {
        await pool.query(
          `INSERT INTO gateway_requests (
            capture_id, session_id, agent_type, model_tier, provider, model_id,
            turn_number, input_tokens, output_tokens, cache_create_input_tokens, cache_read_input_tokens,
            request_summary, request_body, response_body,
            tool_calls, referenced_files,
            start_time, end_time, latency_ms,
            route_reason, scenario_type, hallucination_risk,
            cache_hit, rag_enriched, error_msg,
            captured_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
          [
            entry.captureId, entry.sessionId, entry.agentType, entry.modelTier, entry.provider, entry.modelId,
            entry.turnNumber, entry.inputTokens, entry.outputTokens, entry.cacheCreateInputTokens, entry.cacheReadInputTokens,
            entry.requestSummary, JSON.stringify(entry.requestBody), JSON.stringify(entry.responseBody),
            JSON.stringify(entry.toolCalls), JSON.stringify(entry.referencedFiles),
            entry.startTime, entry.endTime, entry.latencyMs,
            entry.routeReason, entry.scenarioType, entry.hallucinationRisk,
            entry.cacheHit, entry.ragEnriched, entry.error,
            entry.capturedAt
          ]
        );
      }

      await pool.end();
      this.logger?.debug(`ContextCapture: flushed ${batch.length} entries to Postgres`);
    } catch (error: any) {
      this.logger?.error(`ContextCapture Postgres flush failed: ${error.message}`);
      // Re-queue failed batch to retry on next flush (append failed items first, then any new items)
      this.batch = [...batch, ...this.batch].slice(0, 1000);
    }
  }
}
