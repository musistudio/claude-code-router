import { createHash } from "crypto";

export interface QdrantCacheConfig {
  enabled: boolean;
  url: string;
  collection: string;
  similarityThreshold: number;
  vectorSize: number;
  ttlMs: number;
}

interface CachePayload {
  query: string;
  response: any;
  hash: string;
  timestamp: number;
  metadata: Record<string, any>;
}

const DEFAULT_CONFIG: QdrantCacheConfig = {
  enabled: true,
  url: "http://localhost:6333",
  collection: "ccr_semantic_cache",
  similarityThreshold: 0.92,
  vectorSize: 1536,
  ttlMs: 600000,
};

export class QdrantCache {
  private config: QdrantCacheConfig;
  private available = false;
  private collectionReady = false;

  constructor(config: Partial<QdrantCacheConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.logger?.info("QdrantCache: disabled");
      return;
    }

    try {
      const health = await this.request("GET", "/healthz");
      if (!health) throw new Error("health check failed");
      await this.ensureCollection();
      this.available = true;
      this.logger?.info(`QdrantCache: connected to ${this.config.url}`);
    } catch (error: any) {
      this.logger?.warn(`QdrantCache: unavailable, running without vector cache: ${error.message}`);
      this.available = false;
    }
  }

  async lookup(query: string, vector: number[]): Promise<any | null> {
    if (!this.available) return null;

    try {
      const exactHash = createHash("sha256").update(query).digest("hex");

      const scrollResult = await this.request("POST", `/collections/${this.config.collection}/points/scroll`, {
        filter: { must: [{ key: "hash", match: { value: exactHash } }] },
        limit: 1,
        with_payload: true,
      });

      if (scrollResult?.result?.points?.length > 0) {
        const point = scrollResult.result.points[0];
        if (this.isNotExpired(point.payload)) {
          this.logger?.info("QdrantCache: exact hash HIT");
          return point.payload.response;
        }
      }

      if (!vector || vector.length === 0) return null;

      const searchResult = await this.request("POST", `/collections/${this.config.collection}/points/search`, {
        vector,
        limit: 1,
        score_threshold: this.config.similarityThreshold,
        with_payload: true,
      });

      if (searchResult?.result?.length > 0) {
        const hit = searchResult.result[0];
        if (this.isNotExpired(hit.payload)) {
          this.logger?.info(`QdrantCache: vector HIT (score=${hit.score?.toFixed(3)})`);
          return hit.payload.response;
        }
      }

      return null;
    } catch (error: any) {
      this.logger?.warn(`QdrantCache: lookup error: ${error.message}`);
      return null;
    }
  }

  async store(query: string, vector: number[], response: any, metadata: Record<string, any> = {}): Promise<void> {
    if (!this.available) return;

    try {
      const hash = createHash("sha256").update(query).digest("hex");
      const pointId = this.generatePointId(hash);

      const payload: CachePayload = {
        query,
        response,
        hash,
        timestamp: Date.now(),
        metadata,
      };

      await this.request("PUT", `/collections/${this.config.collection}/points`, {
        points: [{ id: pointId, vector, payload }],
      });

      this.logger?.debug(`QdrantCache: stored entry (hash=${hash.slice(0, 12)})`);
    } catch (error: any) {
      this.logger?.warn(`QdrantCache: store error: ${error.message}`);
    }
  }

  async clear(): Promise<void> {
    if (!this.available) return;

    try {
      await this.request("POST", `/collections/${this.config.collection}/points/delete`, {
        filter: { match_all: {} },
      });
      this.logger?.info("QdrantCache: cleared all entries");
    } catch (error: any) {
      this.logger?.warn(`QdrantCache: clear error: ${error.message}`);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  getStats(): { enabled: boolean; available: boolean; collection: string } {
    return { enabled: this.config.enabled, available: this.available, collection: this.config.collection };
  }

  shutdown(): void {
    this.available = false;
  }

  private async ensureCollection(): Promise<void> {
    if (this.collectionReady) return;

    const exists = await this.request("GET", `/collections/${this.config.collection}`);
    if (exists?.result?.status === "green" || exists?.result?.status === "yellow") {
      this.collectionReady = true;
      return;
    }

    await this.request("POST", "/collections", {
      create_collection: {
        collection_name: this.config.collection,
        vectors: { size: this.config.vectorSize, distance: "Cosine" },
      },
    });

    this.collectionReady = true;
    this.logger?.info(`QdrantCache: created collection ${this.config.collection}`);
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.config.url}${path}`;
    const opts: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    };
    if (body) opts.body = JSON.stringify(body);

    const resp = await fetch(url, opts);
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`Qdrant ${resp.status}: ${await resp.text().catch(() => "unknown")}`);
    }
    return resp.json();
  }

  private isNotExpired(payload: any): boolean {
    return payload.timestamp && Date.now() - payload.timestamp < this.config.ttlMs;
  }

  private generatePointId(hash: string): string {
    return hash.slice(0, 16) + Date.now().toString(36).padStart(8, "0");
  }
}
