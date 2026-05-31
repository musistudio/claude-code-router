/**
 * ReasoningCache - Reasoning chain cache for think/reasoning scenarios.
 *
 * When a response contains a thinking block, extracts and stores the
 * reasoning chain in pgvector. On subsequent similar queries, retrieves
 * the most relevant reasoning chain and injects it as a hint in the
 * system prompt — helping the model reason faster and more accurately.
 *
 * This is NOT a response cache (which would be too aggressive).
 * It's a reasoning-chain hint system: "here's how a similar problem
 * was approached before".
 *
 * Storage: pgvector (reasoning_chains table).
 * Fallback: In-memory Map if Postgres unavailable.
 */
import { createHash } from "crypto";

export interface ReasoningCacheConfig {
  enabled: boolean;
  postgresConnectionString?: string;
  maxChainLength: number;
  maxResults: number;
  similarityThreshold: number;
  ttlMs: number;
}

const DEFAULT_CONFIG: ReasoningCacheConfig = {
  enabled: true,
  maxChainLength: 8000,
  maxResults: 3,
  similarityThreshold: 0.7,
  ttlMs: 3600000,
};

interface ReasoningChain {
  id: string;
  query: string;
  reasoningContent: string;
  model: string;
  outputTokens: number;
  createdAt: number;
}

export class ReasoningCache {
  private config: ReasoningCacheConfig;
  private pool: any = null;
  private memoryStore: Map<string, ReasoningChain> = new Map();
  private initialized = false;

  constructor(config: Partial<ReasoningCacheConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled || !this.config.postgresConnectionString) return;

    try {
      const { Pool }: any = require("pg");
      this.pool = new Pool({
        connectionString: this.config.postgresConnectionString,
        max: 3,
        idleTimeoutMillis: 30000,
      });

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS reasoning_chains (
          id TEXT PRIMARY KEY,
          query TEXT NOT NULL,
          reasoning_content TEXT NOT NULL,
          model TEXT NOT NULL,
          output_tokens INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reasoning_chains_expires
        ON reasoning_chains (expires_at)
      `);

      try {
        await this.pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS idx_reasoning_chains_query_trgm
          ON reasoning_chains USING GIN (query gin_trgm_ops)
        `);
      } catch {
        this.logger?.debug("pg_trgm extension not available, falling back to word overlap");
      }

      this.initialized = true;
      this.logger?.info("ReasoningCache: initialized with pgvector");
    } catch (error: any) {
      this.logger?.warn(`ReasoningCache init failed (falling back to memory): ${error.message}`);
      this.pool = null;
    }
  }

  /**
   * Store a reasoning chain from a thinking block.
   */
  async store(params: {
    query: string;
    reasoningContent: string;
    model: string;
    outputTokens?: number;
  }): Promise<void> {
    if (!this.config.enabled) return;
    if (!params.reasoningContent || params.reasoningContent.length < 50) return;

    const truncatedReasoning = params.reasoningContent.slice(0, this.config.maxChainLength);
    const id = createHash("sha256")
      .update(`${params.query}:${truncatedReasoning.slice(0, 200)}`)
      .digest("hex")
      .slice(0, 16);

    const chain: ReasoningChain = {
      id,
      query: params.query.slice(0, 500),
      reasoningContent: truncatedReasoning,
      model: params.model,
      outputTokens: params.outputTokens || 0,
      createdAt: Date.now(),
    };

    if (this.pool && this.initialized) {
      try {
        const expiresAt = new Date(Date.now() + this.config.ttlMs).toISOString();
        await this.pool.query(
          `INSERT INTO reasoning_chains (id, query, reasoning_content, model, output_tokens, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             reasoning_content = EXCLUDED.reasoning_content,
             output_tokens = EXCLUDED.output_tokens,
             expires_at = EXCLUDED.expires_at`,
          [id, chain.query, chain.reasoningContent, chain.model, chain.outputTokens, expiresAt]
        );
      } catch (error: any) {
        this.logger?.debug(`ReasoningCache pg store failed: ${error.message}`);
        this.memoryStore.set(id, chain);
      }
    } else {
      this.memoryStore.set(id, chain);
      if (this.memoryStore.size > 200) {
        const firstKey = this.memoryStore.keys().next().value;
        if (firstKey) this.memoryStore.delete(firstKey);
      }
    }
  }

  /**
   * Retrieve relevant reasoning chains for a query.
   * Returns reasoning hints (not full answers) for injection into system prompt.
   */
  async retrieve(query: string, limit?: number): Promise<string[]> {
    if (!this.config.enabled) return [];

    const maxResults = limit || this.config.maxResults;

    if (this.pool && this.initialized) {
      try {
        const now = new Date().toISOString();
        const result = await this.pool.query(
          `SELECT query, reasoning_content, model,
                  similarity(query, $2) AS sim_score
           FROM reasoning_chains
           WHERE expires_at > $1
             AND similarity(query, $2) > $3
           ORDER BY sim_score DESC
           LIMIT $4`,
          [now, query.slice(0, 500), this.config.similarityThreshold, maxResults]
        );
        return result.rows.map((r: any) => r.reasoning_content);
      } catch (error: any) {
        this.logger?.debug(`ReasoningCache pg retrieve failed: ${error.message}`);
      }
    }

    const results: string[] = [];
    const queryLower = query.toLowerCase();
    for (const chain of this.memoryStore.values()) {
      const sim = this.computeTrigramSimilarity(queryLower, chain.query.toLowerCase());
      if (sim > this.config.similarityThreshold) {
        results.push(chain.reasoningContent);
        if (results.length >= maxResults) break;
      }
    }
    return results;
  }

  /**
   * Build a reasoning hint string for system prompt injection.
   */
  buildReasoningHint(chains: string[]): string | null {
    if (!chains.length) return null;

    const hints = chains
      .slice(0, 2)
      .map((chain, i) => {
        const preview = chain.slice(0, 1500);
        return `<reasoning_hint index="${i + 1}">\n${preview}\n</reasoning_hint>`;
      })
      .join("\n");

    return `\n<previous_reasoning>\nThe following reasoning chains from similar queries may help guide your thinking:\n${hints}\n</previous_reasoning>`;
  }

  /**
   * Cleanup expired entries.
   */
  async cleanup(): Promise<void> {
    if (this.pool && this.initialized) {
      try {
        await this.pool.query(
          `DELETE FROM reasoning_chains WHERE expires_at <= NOW()`
        );
      } catch {}
    }

    const now = Date.now();
    for (const [key, chain] of this.memoryStore.entries()) {
      if (now - chain.createdAt > this.config.ttlMs) {
        this.memoryStore.delete(key);
      }
    }
  }

  private computeWordOverlap(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
    const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let overlap = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) overlap++;
    }
    return overlap / Math.min(wordsA.size, wordsB.size);
  }

  private computeTrigramSimilarity(a: string, b: string): number {
    const trigramsA = this.getTrigrams(a.toLowerCase());
    const trigramsB = this.getTrigrams(b.toLowerCase());
    if (trigramsA.size === 0 || trigramsB.size === 0) return 0;
    let overlap = 0;
    for (const t of trigramsA) {
      if (trigramsB.has(t)) overlap++;
    }
    return overlap / (trigramsA.size + trigramsB.size - overlap);
  }

  private getTrigrams(text: string): Set<string> {
    const trigrams = new Set<string>();
    const padded = `  ${text} `;
    for (let i = 0; i < padded.length - 2; i++) {
      trigrams.add(padded.slice(i, i + 3));
    }
    return trigrams;
  }
}
