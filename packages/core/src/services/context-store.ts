import { createHash } from 'crypto';

export interface ContextEntry {
  id: string;
  content: string;
  tags: string[];
  source: string;
  createdAt: number;
  expiresAt?: number;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export interface ContextQuery {
  text: string;
  tags?: string[];
  topK?: number;
  minSimilarity?: number;
  since?: number;
  until?: number;
}

export interface ContextStoreConfig {
  backend: 'postgres' | 'qdrant' | 'memory';
  postgresUrl?: string;
  qdrantUrl?: string;
  embeddingEndpoint?: string;
  defaultTtlMs: number;
  maxEntries: number;
}

const DEFAULT_CONFIG: ContextStoreConfig = {
  backend: 'memory',
  qdrantUrl: 'http://127.0.0.1:16333',
  embeddingEndpoint: 'http://localhost:11434/api/embeddings',
  defaultTtlMs: 86400000,
  maxEntries: 10000,
};

export class ContextStore {
  private config: ContextStoreConfig;
  private entries: Map<string, ContextEntry> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private logger?: any;

  constructor(config: Partial<ContextStoreConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  async store(entry: Omit<ContextEntry, 'id' | 'createdAt'>): Promise<string> {
    const id = this.generateId(entry.content, entry.source);

    const fullEntry: ContextEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
      expiresAt: entry.expiresAt || Date.now() + this.config.defaultTtlMs,
    };

    if (!fullEntry.embedding && this.config.embeddingEndpoint) {
      try {
        fullEntry.embedding = await this.getEmbedding(fullEntry.content);
      } catch {
        // Embedding failure is non-critical
      }
    }

    this.entries.set(id, fullEntry);

    for (const tag of fullEntry.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(id);
    }

    if (this.entries.size > this.config.maxEntries) {
      this.evictExpired();
    }

    return id;
  }

  async query(query: ContextQuery): Promise<ContextEntry[]> {
    const topK = query.topK || 5;
    let candidates: ContextEntry[] = [];

    if (query.tags && query.tags.length > 0) {
      const candidateIds = new Set<string>();
      for (const tag of query.tags) {
        const ids = this.tagIndex.get(tag);
        if (ids) {
          for (const id of ids) {
            candidateIds.add(id);
          }
        }
      }
      candidates = Array.from(candidateIds)
        .map(id => this.entries.get(id))
        .filter((e): e is ContextEntry => {
          if (!e) return false;
          if (e.expiresAt && Date.now() > e.expiresAt) return false;
          if (query.since && e.createdAt < query.since) return false;
          if (query.until && e.createdAt > query.until) return false;
          return true;
        });
    } else {
      candidates = Array.from(this.entries.values()).filter(e => {
        if (e.expiresAt && Date.now() > e.expiresAt) return false;
        if (query.since && e.createdAt < query.since) return false;
        if (query.until && e.createdAt > query.until) return false;
        return true;
      });
    }

    if (query.text && candidates.length > 0) {
      const scored = await Promise.all(
        candidates.map(async (entry) => {
          let score = 0;
          if (entry.embedding) {
            const queryEmbedding = await this.getEmbedding(query.text).catch(() => null);
            if (queryEmbedding) {
              score = this.cosineSimilarity(queryEmbedding, entry.embedding);
            }
          }
          if (score === 0) {
            const textLower = query.text.toLowerCase();
            const contentLower = entry.content.toLowerCase();
            const overlap = textLower.split(/\s+/).filter(w => contentLower.includes(w)).length;
            score = overlap / textLower.split(/\s+/).length;
          }
          return { entry, score };
        })
      );

      scored.sort((a, b) => b.score - a.score);

      const minSimilarity = query.minSimilarity || 0.3;
      return scored
        .filter(s => s.score >= minSimilarity)
        .slice(0, topK)
        .map(s => s.entry);
    }

    candidates.sort((a, b) => b.createdAt - a.createdAt);
    return candidates.slice(0, topK);
  }

  async delete(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;

    for (const tag of entry.tags) {
      this.tagIndex.get(tag)?.delete(id);
    }

    this.entries.delete(id);
    return true;
  }

  async deleteByTag(tag: string): Promise<number> {
    const ids = this.tagIndex.get(tag);
    if (!ids) return 0;

    const count = ids.size;
    for (const id of ids) {
      this.entries.delete(id);
    }
    this.tagIndex.delete(tag);
    return count;
  }

  getStats(): { totalEntries: number; totalTags: number; expiredEntries: number } {
    let expired = 0;
    const now = Date.now();
    for (const entry of this.entries.values()) {
      if (entry.expiresAt && now > entry.expiresAt) expired++;
    }
    return {
      totalEntries: this.entries.size,
      totalTags: this.tagIndex.size,
      expiredEntries: expired,
    };
  }

  private generateId(content: string, source: string): string {
    return createHash('sha256')
      .update(`${content.substring(0, 200)}:${source}:${Date.now()}`)
      .digest('hex')
      .substring(0, 16);
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const truncated = text.substring(0, 2000);
    const response = await fetch(this.config.embeddingEndpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: truncated }),
    });

    if (!response.ok) {
      throw new Error(`Embedding failed: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding || [];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.delete(id);
      }
    }
  }
}

let _store: ContextStore | null = null;

export function getContextStore(config?: Partial<ContextStoreConfig>, logger?: any): ContextStore {
  if (!_store) {
    _store = new ContextStore(config, logger);
  }
  return _store;
}
