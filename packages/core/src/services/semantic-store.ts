import { ConfigService } from './config';

/**
 * Semantic store service backed by Postgres + pgvector.
 * Provides document storage with vector embeddings for similarity search.
 *
 * Graceful degradation: if Postgres is unavailable, all operations
 * return empty results instead of crashing the gateway.
 */

export interface SemanticDocument {
  id?: number;
  scope: 'session' | 'project' | 'reference';
  topic: string;
  depth?: string;
  trust?: string;
  source?: string;
  content: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface SearchResult extends SemanticDocument {
  similarity: number;
}

export interface SemanticStoreConfig {
  postgresUrl: string;
  semanticStore: {
    enabled: boolean;
    embeddingModel: string;
    embeddingEndpoint?: string;
    dimension: number;
  };
}

interface Pool {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
  end: () => Promise<void>;
}

export class SemanticStoreService {
  private pool: Pool | null = null;
  private connected = false;
  private connecting = false;
  private config: SemanticStoreConfig | null = null;

  constructor(private readonly configService: ConfigService, private readonly logger: any) {
    this.loadConfig();
  }

  private loadConfig(): void {
    const storage = this.configService.get<SemanticStoreConfig>('Storage');
    if (storage?.postgresUrl && storage?.semanticStore?.enabled) {
      this.config = storage;
    }
  }

  async connect(): Promise<boolean> {
    if (this.connected && this.pool) return true;
    if (this.connecting) return false;
    if (!this.config) return false;

    this.connecting = true;
    try {
      // Dynamic import of pg to avoid hard dependency
      const pg = await import('pg');
      const { Pool } = pg;
      this.pool = new Pool({
        connectionString: this.config.postgresUrl,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }) as unknown as Pool;

      // Test connection
      await this.pool.query('SELECT 1');
      this.connected = true;
      this.logger.info('SemanticStore: connected to Postgres');
      return true;
    } catch (error: any) {
      this.logger.warn(`SemanticStore: failed to connect to Postgres: ${error.message}`);
      this.pool = null;
      this.connected = false;
      return false;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch {}
      this.pool = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Upsert a document into the semantic store.
   * If an embedding endpoint is configured, generates an embedding automatically.
   */
  async upsert(doc: SemanticDocument): Promise<{ id: number } | null> {
    if (!this.connected || !this.pool) {
      const connected = await this.connect();
      if (!connected) return null;
    }

    try {
      let embedding: number[] | null = null;

      // Generate embedding if endpoint is configured
      if (this.config?.semanticStore?.embeddingEndpoint && doc.content) {
        embedding = await this.generateEmbedding(doc.content);
      }

      const depth = doc.depth || 's1';
      const trust = doc.trust || 'raw';
      const source = doc.source || '';
      const metadata = doc.metadata || {};

      const result = await this.pool!.query(
        `INSERT INTO semantic_documents (scope, topic, depth, trust, source, content, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          doc.scope,
          doc.topic,
          depth,
          trust,
          source,
          doc.content,
          embedding ? `[${embedding.join(',')}]` : null,
          JSON.stringify(metadata),
        ]
      );

      return { id: result.rows[0].id };
    } catch (error: any) {
      this.logger.error(`SemanticStore upsert error: ${error.message}`);
      return null;
    }
  }

  /**
   * Search for similar documents using cosine similarity.
   * If no embedding endpoint is configured, falls back to text-based search.
   */
  async search(
    query: string,
    options: {
      scope?: string;
      topic?: string;
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<SearchResult[]> {
    if (!this.connected || !this.pool) {
      const connected = await this.connect();
      if (!connected) return [];
    }

    try {
      const limit = options.limit || 10;
      const threshold = options.threshold || 0.5;

      // If we have an embedding endpoint, use vector search
      if (this.config?.semanticStore?.embeddingEndpoint) {
        const embedding = await this.generateEmbedding(query);
        if (!embedding) return [];

        let sql = `
          SELECT id, scope, topic, depth, trust, source, content, metadata, created_at,
                 1 - (embedding <=> $1::vector) AS similarity
          FROM semantic_documents
          WHERE embedding IS NOT NULL`;
        const params: any[] = [`[${embedding.join(',')}]`];

        if (options.scope) {
          params.push(options.scope);
          sql += ` AND scope = $${params.length}`;
        }
        if (options.topic) {
          params.push(options.topic);
          sql += ` AND topic = $${params.length}`;
        }

        sql += ` AND 1 - (embedding <=> $1::vector) >= $${params.length + 1}`;
        params.push(threshold);
        sql += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await this.pool!.query(sql, params);
        return result.rows.map(this.mapRowToSearchResult);
      }

      // Fallback: text-based search using ILIKE
      let sql = `
        SELECT id, scope, topic, depth, trust, source, content, metadata, created_at,
               0.5 AS similarity
        FROM semantic_documents
        WHERE content ILIKE $1`;
      const params: any[] = [`%${query}%`];

      if (options.scope) {
        params.push(options.scope);
        sql += ` AND scope = $${params.length}`;
      }
      if (options.topic) {
        params.push(options.topic);
        sql += ` AND topic = $${params.length}`;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.pool!.query(sql, params);
      return result.rows.map(this.mapRowToSearchResult);
    } catch (error: any) {
      this.logger.error(`SemanticStore search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete documents by scope and topic.
   */
  async delete(scope: string, topic: string): Promise<number> {
    if (!this.connected || !this.pool) {
      const connected = await this.connect();
      if (!connected) return 0;
    }

    try {
      const result = await this.pool!.query(
        'DELETE FROM semantic_documents WHERE scope = $1 AND topic = $2',
        [scope, topic]
      );
      return result.rowCount;
    } catch (error: any) {
      this.logger.error(`SemanticStore delete error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check the health of the Postgres connection.
   */
  async healthCheck(): Promise<{ connected: boolean; documentCount?: number; error?: string }> {
    try {
      if (!this.pool) {
        const connected = await this.connect();
        if (!connected) {
          return { connected: false, error: 'Not connected' };
        }
      }

      const result = await this.pool!.query('SELECT COUNT(*) as count FROM semantic_documents');
      return {
        connected: true,
        documentCount: Number(result.rows[0].count),
      };
    } catch (error: any) {
      return { connected: false, error: error.message };
    }
  }

  /**
   * Generate an embedding vector using the configured endpoint.
   * Supports Ollama /api/embed format.
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    const endpoint = this.config?.semanticStore?.embeddingEndpoint;
    const model = this.config?.semanticStore?.embeddingModel || 'nomic-embed-text';

    if (!endpoint) return null;

    try {
      // Truncate text to avoid excessive payload size
      const truncated = text.slice(0, 8000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: truncated }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`Embedding endpoint returned ${response.status}`);
        return null;
      }

      const data = await response.json() as any;

      // Ollama format: { embedding: [...] }
      if (Array.isArray(data.embedding)) {
        return data.embedding;
      }

      // OpenAI format: { data: [{ embedding: [...] }] }
      if (data.data?.[0]?.embedding) {
        return data.data[0].embedding;
      }

      this.logger.warn('Unknown embedding response format');
      return null;
    } catch (error: any) {
      this.logger.warn(`Embedding generation failed: ${error.message}`);
      return null;
    }
  }

  private mapRowToSearchResult(row: any): SearchResult {
    return {
      id: row.id,
      scope: row.scope,
      topic: row.topic,
      depth: row.depth,
      trust: row.trust,
      source: row.source,
      content: row.content,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      created_at: row.created_at,
      similarity: Number(row.similarity),
    };
  }
}