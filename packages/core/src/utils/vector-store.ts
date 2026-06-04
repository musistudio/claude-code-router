/**
 * Vector Store - Qdrant向量数据库集成
 *
 * Provides vector storage and similarity search for:
 * - Semantic cache (embedding-based lookup)
 * - RAG document retrieval
 * - Reasoning chain storage
 *
 * Dependencies: @qdrant/js-client-rest (optional, graceful fallback)
 */

export interface VectorStoreConfig {
  enabled: boolean;
  /** Qdrant HTTP endpoint */
  url: string;
  /** Collection name */
  collectionName: string;
  /** Vector dimension (model-dependent) */
  dimension: number;
  /** Distance metric */
  distance: 'Cosine' | 'Euclid' | 'Dot';
  /** Default search limit */
  defaultLimit: number;
  /** Similarity threshold for cache hits */
  similarityThreshold: number;
}

const DEFAULT_CONFIG: VectorStoreConfig = {
  enabled: true,
  url: 'http://127.0.0.1:16333',
  collectionName: 'ccr-vectors',
  dimension: 1536,
  distance: 'Cosine',
  defaultLimit: 5,
  similarityThreshold: 0.92,
};

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

export class VectorStore {
  private config: VectorStoreConfig;
  private logger?: any;
  private baseUrl: string;
  private initialized = false;

  constructor(config: Partial<VectorStoreConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
    this.baseUrl = this.config.url;
  }

  /**
   * Initialize collection if it doesn't exist.
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) return false;

    try {
      // Check if collection exists
      const response = await fetch(`${this.baseUrl}/collections/${this.config.collectionName}`);

      if (response.status === 404) {
        // Create collection
        const createResponse = await fetch(`${this.baseUrl}/collections/${this.config.collectionName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: this.config.dimension,
              distance: this.config.distance,
            },
          }),
        });

        if (!createResponse.ok) {
          throw new Error(`Failed to create collection: ${createResponse.status}`);
        }

        this.logger?.info(`VectorStore: created collection '${this.config.collectionName}'`);
      }

      this.initialized = true;
      return true;
    } catch (error: any) {
      this.logger?.warn(`VectorStore init failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Insert or update a vector point.
   */
  async upsert(point: VectorPoint): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.config.collectionName}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{
            id: point.id,
            vector: point.vector,
            payload: point.payload,
          }],
        }),
      });

      return response.ok;
    } catch (error: any) {
      this.logger?.debug(`VectorStore upsert error: ${error.message}`);
      return false;
    }
  }

  /**
   * Batch insert/update vector points.
   */
  async upsertBatch(points: VectorPoint[]): Promise<boolean> {
    if (!this.initialized || points.length === 0) return false;

    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.config.collectionName}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: points.map(p => ({
            id: p.id,
            vector: p.vector,
            payload: p.payload,
          })),
        }),
      });

      return response.ok;
    } catch (error: any) {
      this.logger?.debug(`VectorStore batch upsert error: ${error.message}`);
      return false;
    }
  }

  /**
   * Search for similar vectors.
   */
  async search(
    vector: number[],
    limit?: number,
    filter?: Record<string, any>
  ): Promise<SearchResult[]> {
    if (!this.initialized) return [];

    try {
      const body: any = {
        vector,
        limit: limit || this.config.defaultLimit,
        with_payload: true,
      };

      if (filter) {
        body.filter = {
          must: Object.entries(filter).map(([key, value]) => ({
            key,
            match: { value },
          })),
        };
      }

      const response = await fetch(`${this.baseUrl}/collections/${this.config.collectionName}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) return [];

      const data = await response.json();
      return (data.result || []).map((r: any) => ({
        id: r.id,
        score: r.score,
        payload: r.payload || {},
      }));
    } catch (error: any) {
      this.logger?.debug(`VectorStore search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete a vector point.
   */
  async delete(id: string): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.config.collectionName}/points/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: [id] }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get collection info.
   */
  async getInfo(): Promise<Record<string, any> | null> {
    if (!this.initialized) return null;

    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.config.collectionName}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Get stats.
   */
  getStats(): { initialized: boolean; collection: string; dimension: number } {
    return {
      initialized: this.initialized,
      collection: this.config.collectionName,
      dimension: this.config.dimension,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<VectorStoreConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let globalVectorStore: VectorStore | null = null;

export function getVectorStore(config?: Partial<VectorStoreConfig>, logger?: any): VectorStore {
  if (!globalVectorStore) {
    globalVectorStore = new VectorStore(config, logger);
  } else if (config) {
    globalVectorStore.updateConfig(config);
  }
  return globalVectorStore;
}
