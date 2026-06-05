/**
 * EmbeddingService - Local embedding via Ollama nomic-embed-text
 *
 * Provides vector embeddings for semantic similarity matching.
 * Falls back to simple hash-based similarity if Ollama is unavailable.
 *
 * Supported backends:
 *   - Ollama (nomic-embed-text, 768-dim)
 *   - OpenAI-compatible (/v1/embeddings)
 *   - Simple hash fallback (no embedding)
 *
 * Design: Zero external deps. Configurable endpoint. Graceful degradation.
 */

export interface EmbeddingConfig {
  enabled: boolean;
  provider: "ollama" | "openai" | "none";
  baseUrl: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
  cacheSize: number;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  enabled: true,
  provider: "ollama",
  baseUrl: "http://localhost:11434",
  model: "nomic-embed-text",
  dimensions: 768,
  timeoutMs: 10000,
  cacheSize: 2000,
};

export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache: Map<string, number[]> = new Map();
  private available: boolean = false;
  private lastCheckTime: number = 0;
  private checkIntervalMs: number = 60000;
  private logger?: any;

  constructor(config: Partial<EmbeddingConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  async initialize(): Promise<boolean> {
    if (!this.config.enabled || this.config.provider === "none") {
      this.available = false;
      return false;
    }
    return this.checkAvailability();
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.available || this.config.provider === "none") return null;
    if (!text || text.trim().length === 0) return null;

    const cacheKey = this.hashText(text);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    try {
      let embedding: number[] | null = null;

      if (this.config.provider === "ollama") {
        embedding = await this.embedOllama(text);
      } else if (this.config.provider === "openai") {
        embedding = await this.embedOpenAI(text);
      }

      if (embedding) {
        this.cacheEmbedding(cacheKey, embedding);
        return embedding;
      }
      return null;
    } catch (e: any) {
      this.logger?.warn(`Embedding failed: ${e.message}`);
      return null;
    }
  }

  async embedBatch(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.available) return texts.map(() => null);

    const results: (number[] | null)[] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  isAvailable(): boolean {
    return this.available;
  }

  getStats(): {
    available: boolean;
    provider: string;
    model: string;
    cacheSize: number;
    dimensions: number;
  } {
    return {
      available: this.available,
      provider: this.config.provider,
      model: this.config.model,
      cacheSize: this.cache.size,
      dimensions: this.config.dimensions,
    };
  }

  private async checkAvailability(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      if (this.config.provider === "ollama") {
        const res = await fetch(`${this.config.baseUrl}/api/tags`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json() as any;
          const models = (data.models || []) as Array<{ name: string }>;
          const found = models.some(m => m.name.startsWith(this.config.model));
          this.available = found;
          if (found) {
            this.logger?.info(`EmbeddingService: Ollama ${this.config.model} available`);
          } else {
            this.logger?.warn(`EmbeddingService: ${this.config.model} not found in Ollama. Available: ${models.map(m => m.name).join(', ')}`);
          }
        } else {
          this.available = false;
        }
      } else if (this.config.provider === "openai") {
        const res = await fetch(`${this.config.baseUrl}/v1/models`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        this.available = res.ok;
      }

      this.lastCheckTime = Date.now();
      return this.available;
    } catch {
      this.available = false;
      this.lastCheckTime = Date.now();
      this.logger?.warn(`EmbeddingService: ${this.config.provider} not available at ${this.config.baseUrl}`);
      return false;
    }
  }

  private async embedOllama(text: string): Promise<number[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(`${this.config.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          input: text.slice(0, 8192),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json() as any;
      const embeddings = data.embeddings as number[][];
      return embeddings?.[0] || null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async embedOpenAI(text: string): Promise<number[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(`${this.config.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          input: text.slice(0, 8192),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json() as any;
      return data.data?.[0]?.embedding || null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private cacheEmbedding(key: string, embedding: number[]): void {
    if (this.cache.size >= this.config.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, embedding);
  }

  private hashText(text: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  }
}

let _instance: EmbeddingService | null = null;

export function getEmbeddingService(config?: Partial<EmbeddingConfig>, logger?: any): EmbeddingService {
  if (!_instance) {
    _instance = new EmbeddingService(config, logger);
  }
  return _instance;
}

export function resetEmbeddingService(): void {
  _instance = null;
}
