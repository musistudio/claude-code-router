import { createHash } from 'crypto';

export interface RAGDocument {
  id: string;
  content: string;
  source: string;
  tags: string[];
  metadata?: Record<string, any>;
  createdAt: number;
}

export interface RAGQueryResult {
  document: RAGDocument;
  score: number;
  snippet: string;
}

export interface RAGPipelineConfig {
  ollamaEndpoint: string;
  ollamaModel: string;
  qdrantUrl: string;
  qdrantCollection: string;
  embeddingDimension: number;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  minScore: number;
}

const DEFAULT_CONFIG: RAGPipelineConfig = {
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'nomic-embed-text',
  qdrantUrl: 'http://127.0.0.1:16333',
  qdrantCollection: 'ccr_rag',
  embeddingDimension: 768,
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 5,
  minScore: 0.5,
};

export class RAGPipeline {
  private config: RAGPipelineConfig;
  private logger?: any;
  private initialized = false;

  constructor(config: Partial<RAGPipelineConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.ensureCollection();
      this.initialized = true;
      this.logger?.info(`RAGPipeline: initialized (ollama=${this.config.ollamaModel}, qdrant=${this.config.qdrantCollection})`);
    } catch (e: any) {
      this.logger?.warn(`RAGPipeline: initialization partial — ${e.message}`);
    }
  }

  async ingestDocument(doc: Omit<RAGDocument, 'id' | 'createdAt'>): Promise<string[]> {
    if (!this.initialized) await this.initialize();

    const chunks = this.chunkText(doc.content);
    const ids: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const id = this.generateDocId(doc.source, i);

      const embedding = await this.getEmbedding(chunk);
      if (embedding.length === 0) continue;

      await this.upsertPoint(id, embedding, {
        content: chunk,
        source: doc.source,
        tags: doc.tags,
        metadata: doc.metadata,
        chunkIndex: i,
        totalChunks: chunks.length,
        createdAt: Date.now(),
      });

      ids.push(id);
    }

    this.logger?.debug(`RAGPipeline: ingested ${ids.length} chunks from ${doc.source}`);
    return ids;
  }

  async query(queryText: string, filter?: { tags?: string[]; source?: string }): Promise<RAGQueryResult[]> {
    if (!this.initialized) await this.initialize();

    const embedding = await this.getEmbedding(queryText);
    if (embedding.length === 0) return [];

    try {
      const must: any[] = [];
      if (filter?.tags && filter.tags.length > 0) {
        must.push({
          should: filter.tags.map(tag => ({
            key: 'tags',
            match: { value: tag },
          })),
        });
      }
      if (filter?.source) {
        must.push({
          key: 'source',
          match: { value: filter.source },
        });
      }

      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: embedding,
            limit: this.config.topK,
            score_threshold: this.config.minScore,
            with_payload: true,
            filter: must.length > 0 ? { must } : undefined,
          }),
        }
      );

      if (!response.ok) return [];

      const data = await response.json();
      if (!data.result) return [];

      return data.result.map((point: any) => ({
        document: {
          id: point.id,
          content: point.payload.content,
          source: point.payload.source,
          tags: point.payload.tags || [],
          metadata: point.payload.metadata,
          createdAt: point.payload.createdAt,
        },
        score: point.score,
        snippet: point.payload.content.substring(0, 200),
      }));
    } catch (e: any) {
      this.logger?.debug(`RAGPipeline query failed: ${e.message}`);
      return [];
    }
  }

  async enrichSystemPrompt(
    systemPrompt: any,
    queryText: string,
    maxTokens: number = 2000
  ): Promise<{ enriched: any; injections: number; totalChars: number }> {
    const results = await this.query(queryText);
    if (results.length === 0) {
      return { enriched: systemPrompt, injections: 0, totalChars: 0 };
    }

    let totalChars = 0;
    const injectionLines: string[] = ['\n<rag_context>'];

    for (const result of results) {
      const entry = `[${result.score.toFixed(2)}] ${result.snippet}`;
      if (totalChars + entry.length > maxTokens * 4) break;
      injectionLines.push(entry);
      totalChars += entry.length;
    }

    injectionLines.push('</rag_context>');
    const injection = injectionLines.join('\n');

    if (typeof systemPrompt === 'string') {
      return { enriched: systemPrompt + injection, injections: results.length, totalChars };
    }

    if (Array.isArray(systemPrompt)) {
      return {
        enriched: [...systemPrompt, { type: 'text', text: injection }],
        injections: results.length,
        totalChars,
      };
    }

    return { enriched: systemPrompt, injections: 0, totalChars: 0 };
  }

  async deleteBySource(source: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              must: [{ key: 'source', match: { value: source } }],
            },
          }),
        }
      );
      if (!response.ok) return 0;
      return 1;
    } catch {
      return 0;
    }
  }

  getStats(): { initialized: boolean; collection: string; ollamaModel: string } {
    return {
      initialized: this.initialized,
      collection: this.config.qdrantCollection,
      ollamaModel: this.config.ollamaModel,
    };
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    const words = text.split(/\s+/);
    let current = '';

    for (const word of words) {
      if (current.length + word.length > this.config.chunkSize) {
        if (current) chunks.push(current.trim());
        const overlapWords = current.split(/\s+/).slice(-Math.ceil(this.config.chunkOverlap / 5));
        current = overlapWords.join(' ') + ' ' + word;
      } else {
        current += ' ' + word;
      }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  private async getEmbedding(text: string): Promise<number[]> {
    try {
      const truncated = text.substring(0, 2000);
      const response = await fetch(`${this.config.ollamaEndpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.ollamaModel, prompt: truncated }),
      });

      if (!response.ok) return [];
      const data = await response.json();
      return data.embedding || [];
    } catch {
      return [];
    }
  }

  private async ensureCollection(): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}`
      );
      if (response.ok) return;

      await fetch(`${this.config.qdrantUrl}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { size: this.config.embeddingDimension, distance: 'Cosine' },
        }),
      });
    } catch (e: any) {
      this.logger?.debug(`RAGPipeline ensureCollection: ${e.message}`);
    }
  }

  private async upsertPoint(id: string, vector: number[], payload: Record<string, any>): Promise<void> {
    await fetch(`${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{ id, vector, payload }],
      }),
    });
  }

  private generateDocId(source: string, chunkIndex: number): string {
    return createHash('sha256')
      .update(`${source}:${chunkIndex}`)
      .digest('hex')
      .substring(0, 16);
  }
}

let _pipeline: RAGPipeline | null = null;

export function getRAGPipeline(config?: Partial<RAGPipelineConfig>, logger?: any): RAGPipeline {
  if (!_pipeline) {
    _pipeline = new RAGPipeline(config, logger);
  }
  return _pipeline;
}
