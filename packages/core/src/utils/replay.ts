/**
 * Replay - 请求回放与回归测试
 *
 * Records real requests and replays them for regression testing.
 * Compares responses to detect quality degradation.
 *
 * Design: Zero external dependencies. JSONL-based storage.
 */

import { createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

export interface ReplayConfig {
  enabled: boolean;
  /** Directory to store recordings */
  recordingDir: string;
  /** Max recordings to keep */
  maxRecordings: number;
  /** Fields to compare in responses */
  compareFields: string[];
  /** Similarity threshold for pass (0-1) */
  similarityThreshold: number;
}

const DEFAULT_CONFIG: ReplayConfig = {
  enabled: false,
  recordingDir: './dev/replays',
  maxRecordings: 1000,
  compareFields: ['content', 'stop_reason'],
  similarityThreshold: 0.8,
};

export interface RecordedRequest {
  id: string;
  timestamp: number;
  fingerprint: string;
  requestBody: any;
  responseBody: any;
  statusCode: number;
  latencyMs: number;
  model: string;
  provider: string;
  metadata: Record<string, any>;
}

export interface ReplayResult {
  /** Total requests replayed */
  total: number;
  /** Passed (response similar enough) */
  passed: number;
  /** Failed (response diverged) */
  failed: number;
  /** Errors during replay */
  errors: number;
  /** Detailed results */
  details: Array<{
    id: string;
    original: RecordedRequest;
    replayed: { response: any; statusCode: number; latencyMs: number };
    similarity: number;
    passed: boolean;
    error?: string;
  }>;
}

export class ReplayManager {
  private config: ReplayConfig;
  private recordings: RecordedRequest[] = [];
  private logger?: any;

  constructor(config: Partial<ReplayConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Record a request/response pair.
   */
  async record(params: {
    body: any;
    response: any;
    statusCode: number;
    latencyMs: number;
    model: string;
    provider: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.config.enabled) return;

    const recorded: RecordedRequest = {
      id: this.generateId(),
      timestamp: Date.now(),
      fingerprint: this.computeFingerprint(params.body),
      requestBody: params.body,
      responseBody: params.response,
      statusCode: params.statusCode,
      latencyMs: params.latencyMs,
      model: params.model,
      provider: params.provider,
      metadata: params.metadata || {},
    };

    this.recordings.push(recorded);

    // Trim old recordings
    if (this.recordings.length > this.config.maxRecordings) {
      this.recordings = this.recordings.slice(-this.config.maxRecordings);
    }

    // Save to file
    await this.saveRecordings();
  }

  /**
   * Load recordings from file.
   */
  async loadRecordings(): Promise<void> {
    const filePath = join(this.config.recordingDir, 'recordings.jsonl');
    if (!existsSync(filePath)) return;

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      this.recordings = lines.map((line) => JSON.parse(line));
      this.logger?.info(`Replay: loaded ${this.recordings.length} recordings`);
    } catch (error: any) {
      this.logger?.warn(`Replay: failed to load recordings: ${error.message}`);
    }
  }

  /**
   * Replay all recordings against the proxy.
   * @param proxyUrl The proxy URL to replay against
   * @param apiKey The API key for authentication
   */
  async replayAll(proxyUrl: string, apiKey: string): Promise<ReplayResult> {
    const details: ReplayResult['details'] = [];
    let passed = 0;
    let failed = 0;
    let errors = 0;

    for (const recording of this.recordings) {
      try {
        const startTime = Date.now();
        const response = await fetch(`${proxyUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(recording.requestBody),
        });

        const latencyMs = Date.now() - startTime;
        const statusCode = response.status;
        const responseBody = await response.json();

        const similarity = this.computeSimilarity(recording.responseBody, responseBody);
        const isPassed = similarity >= this.config.similarityThreshold;

        if (isPassed) passed++;
        else failed++;

        details.push({
          id: recording.id,
          original: recording,
          replayed: { response: responseBody, statusCode, latencyMs },
          similarity,
          passed: isPassed,
        });
      } catch (error: any) {
        errors++;
        details.push({
          id: recording.id,
          original: recording,
          replayed: { response: null, statusCode: 0, latencyMs: 0 },
          similarity: 0,
          passed: false,
          error: error.message,
        });
      }
    }

    return {
      total: this.recordings.length,
      passed,
      failed,
      errors,
      details,
    };
  }

  /**
   * Get recording stats.
   */
  getStats(): { count: number; models: string[]; providers: string[] } {
    const models = new Set<string>();
    const providers = new Set<string>();
    for (const r of this.recordings) {
      models.add(r.model);
      providers.add(r.provider);
    }
    return {
      count: this.recordings.length,
      models: Array.from(models),
      providers: Array.from(providers),
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<ReplayConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async saveRecordings(): Promise<void> {
    try {
      const dir = this.config.recordingDir;
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      const filePath = join(dir, 'recordings.jsonl');
      const content = this.recordings.map((r) => JSON.stringify(r)).join('\n');
      await writeFile(filePath, content, 'utf-8');
    } catch (error: any) {
      this.logger?.warn(`Replay: failed to save recordings: ${error.message}`);
    }
  }

  private computeSimilarity(original: any, replayed: any): number {
    const originalText = this.extractText(original);
    const replayedText = this.extractText(replayed);

    if (originalText === replayedText) return 1.0;

    // Simple word-level Jaccard similarity
    const originalWords = new Set(originalText.toLowerCase().split(/\s+/));
    const replayedWords = new Set(replayedText.toLowerCase().split(/\s+/));

    const intersection = new Set([...originalWords].filter((w) => replayedWords.has(w)));
    const union = new Set([...originalWords, ...replayedWords]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private extractText(response: any): string {
    if (!response) return '';
    if (typeof response === 'string') return response;
    if (response.content) {
      if (typeof response.content === 'string') return response.content;
      if (Array.isArray(response.content)) {
        return response.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text || '')
          .join('\n');
      }
    }
    return JSON.stringify(response);
  }

  private computeFingerprint(body: any): string {
    const sanitized = { ...body };
    delete sanitized.stream;
    delete sanitized.metadata;
    return createHash('sha256').update(JSON.stringify(sanitized)).digest('hex').slice(0, 32);
  }

  private generateId(): string {
    return `replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

let globalReplay: ReplayManager | null = null;

export function getReplayManager(config?: Partial<ReplayConfig>, logger?: any): ReplayManager {
  if (!globalReplay) {
    globalReplay = new ReplayManager(config, logger);
  } else if (config) {
    globalReplay.updateConfig(config);
  }
  return globalReplay;
}
