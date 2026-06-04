/**
 * RAGDocumentStore - RAG 文档存储与混合搜索
 *
 * 增强版 RAG 系统，支持:
 *   1. PDF 解析 — 提取文本、表格、代码块
 *   2. 本地嵌入生成 — Ollama/OpenAI
 *   3. 混合搜索 — 关键词 BM25 + 向量余弦相似度
 *   4. 文档分块 — 智能按段落/标题分割
 *
 * 与 RAGEnricher 配合使用。RAGEnricher 负责查询和注入，
 * 本模块负责文档摄取、嵌入生成和混合索引。
 */

import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, extname, basename } from "path";
import { createHash } from "crypto";

export interface DocumentChunk {
  chunkId: string;
  docId: string;
  source: string;
  title: string;
  content: string;
  embedding?: number[];
  keywords: string[];
  chunkIndex: number;
  totalChunks: number;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface DocumentRecord {
  docId: string;
  source: string;
  title: string;
  fileType: string;
  totalChunks: number;
  totalTokens: number;
  checksum: string;
  ingestedAt: string;
  metadata: Record<string, any>;
}

export interface HybridSearchResult {
  chunk: DocumentChunk;
  score: number;
  vectorScore: number;
  keywordScore: number;
  matchType: "vector" | "keyword" | "hybrid";
}

export interface DocumentStoreConfig {
  storagePath: string;
  embeddingProvider: "ollama" | "openai" | "none";
  embeddingEndpoint: string;
  embeddingModel: string;
  embeddingDimensions: number;
  chunkSize: number;
  chunkOverlap: number;
  maxDocuments: number;
  bm25K1: number;
  bm25B: number;
  vectorWeight: number;
  keywordWeight: number;
}

interface BM25Index {
  docFreqs: Map<string, number>;
  termFreqs: Map<string, Map<string, number>>;
  docLengths: Map<string, number>;
  avgDocLength: number;
  totalDocs: number;
}

const DEFAULT_CONFIG: DocumentStoreConfig = {
  storagePath: "./dev/rag_store",
  embeddingProvider: "ollama",
  embeddingEndpoint: "http://localhost:11434",
  embeddingModel: "nomic-embed-text",
  embeddingDimensions: 768,
  chunkSize: 512,
  chunkOverlap: 64,
  maxDocuments: 1000,
  bm25K1: 1.2,
  bm25B: 0.75,
  vectorWeight: 0.7,
  keywordWeight: 0.3,
};

export class RAGDocumentStore {
  private config: DocumentStoreConfig;
  private documents: Map<string, DocumentRecord> = new Map();
  private chunks: Map<string, DocumentChunk> = new Map();
  private bm25Index: BM25Index;
  private embeddingCache: Map<string, number[]> = new Map();
  private initialized = false;
  private logger?: any;

  constructor(config: Partial<DocumentStoreConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
    this.bm25Index = this.createEmptyBM25();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!existsSync(this.config.storagePath)) {
        await mkdir(this.config.storagePath, { recursive: true });
      }
      await this.loadIndex();
      this.initialized = true;
      this.logger?.info(`RAGDocumentStore: initialized with ${this.documents.size} docs, ${this.chunks.size} chunks`);
    } catch (e: any) {
      this.logger?.debug(`RAGDocumentStore init failed: ${e?.message}`);
      this.initialized = true;
    }
  }

  async ingestFile(filePath: string): Promise<DocumentRecord | null> {
    const ext = extname(filePath).toLowerCase();
    let content: string;

    try {
      if (ext === ".pdf") {
        content = await this.parsePDF(filePath);
      } else if (ext === ".md" || ext === ".txt") {
        content = await readFile(filePath, "utf-8");
      } else if (ext === ".json" || ext === ".jsonl") {
        content = await readFile(filePath, "utf-8");
      } else {
        this.logger?.debug(`RAGDocumentStore: unsupported file type ${ext}`);
        return null;
      }
    } catch (e: any) {
      this.logger?.debug(`RAGDocumentStore: failed to read ${filePath}: ${e?.message}`);
      return null;
    }

    const checksum = createHash("sha256").update(content).digest("hex").slice(0, 16);
    const docId = `doc-${checksum}`;

    if (this.documents.has(docId)) {
      return this.documents.get(docId)!;
    }

    const title = basename(filePath, ext);
    const fileChunks = this.chunkContent(content, title);

    const doc: DocumentRecord = {
      docId,
      source: filePath,
      title,
      fileType: ext,
      totalChunks: fileChunks.length,
      totalTokens: fileChunks.reduce((sum, c) => sum + Math.ceil(c.length / 4), 0),
      checksum,
      ingestedAt: new Date().toISOString(),
      metadata: {},
    };

    this.documents.set(docId, doc);

    for (let i = 0; i < fileChunks.length; i++) {
      const chunkId = `${docId}-chunk-${i}`;
      const keywords = this.extractKeywords(fileChunks[i]);

      const chunk: DocumentChunk = {
        chunkId,
        docId,
        source: filePath,
        title,
        content: fileChunks[i],
        keywords,
        chunkIndex: i,
        totalChunks: fileChunks.length,
        metadata: { fileType: ext },
        createdAt: new Date().toISOString(),
      };

      if (this.config.embeddingProvider !== "none") {
        const embedding = await this.generateEmbedding(chunk.content);
        if (embedding) {
          chunk.embedding = embedding;
        }
      }

      this.chunks.set(chunkId, chunk);
    }

    this.rebuildBM25Index();
    await this.saveIndex();

    this.logger?.info(`RAGDocumentStore: ingested ${filePath} → ${fileChunks.length} chunks`);
    return doc;
  }

  async ingestDirectory(dirPath: string, recursive = true): Promise<DocumentRecord[]> {
    const results: DocumentRecord[] = [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory() && recursive) {
          const subResults = await this.ingestDirectory(fullPath, recursive);
          results.push(...subResults);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if ([".md", ".txt", ".pdf", ".json"].includes(ext)) {
            const doc = await this.ingestFile(fullPath);
            if (doc) results.push(doc);
          }
        }
      }
    } catch (e: any) {
      this.logger?.debug(`RAGDocumentStore: directory scan failed: ${e?.message}`);
    }

    return results;
  }

  async hybridSearch(query: string, options?: {
    limit?: number;
    minScore?: number;
    filter?: { source?: string; docId?: string };
  }): Promise<HybridSearchResult[]> {
    const limit = options?.limit || 10;
    const minScore = options?.minScore || 0.3;

    let queryEmbedding: number[] | undefined;
    if (this.config.embeddingProvider !== "none") {
      queryEmbedding = await this.generateEmbedding(query);
    }

    const results: HybridSearchResult[] = [];
    const queryTerms = this.tokenize(query);

    for (const [chunkId, chunk] of this.chunks) {
      if (options?.filter?.source && chunk.source !== options.filter.source) continue;
      if (options?.filter?.docId && chunk.docId !== options.filter.docId) continue;

      let vectorScore = 0;
      let keywordScore = 0;
      let matchType: HybridSearchResult["matchType"] = "keyword";

      if (queryEmbedding && chunk.embedding) {
        vectorScore = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      }

      keywordScore = this.bm25Score(queryTerms, chunk);

      const hasVector = vectorScore > 0.1;
      const hasKeyword = keywordScore > 0;

      if (hasVector && hasKeyword) {
        matchType = "hybrid";
      } else if (hasVector) {
        matchType = "vector";
      } else if (hasKeyword) {
        matchType = "keyword";
      } else {
        continue;
      }

      const score = vectorScore * this.config.vectorWeight + keywordScore * this.config.keywordWeight;

      if (score >= minScore) {
        results.push({ chunk, score, vectorScore, keywordScore, matchType });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  getDocument(docId: string): DocumentRecord | undefined {
    return this.documents.get(docId);
  }

  listDocuments(): DocumentRecord[] {
    return Array.from(this.documents.values());
  }

  async deleteDocument(docId: string): Promise<boolean> {
    const doc = this.documents.get(docId);
    if (!doc) return false;

    for (const [chunkId, chunk] of this.chunks) {
      if (chunk.docId === docId) {
        this.chunks.delete(chunkId);
      }
    }

    this.documents.delete(docId);
    this.rebuildBM25Index();
    await this.saveIndex();
    return true;
  }

  getStats(): {
    totalDocuments: number;
    totalChunks: number;
    totalTokens: number;
    embeddingCoverage: number;
    indexSize: number;
  } {
    const chunksWithEmbeddings = Array.from(this.chunks.values())
      .filter(c => c.embedding && c.embedding.length > 0).length;

    return {
      totalDocuments: this.documents.size,
      totalChunks: this.chunks.size,
      totalTokens: Array.from(this.documents.values())
        .reduce((sum, d) => sum + d.totalTokens, 0),
      embeddingCoverage: this.chunks.size > 0
        ? Math.round(chunksWithEmbeddings / this.chunks.size * 100)
        : 0,
      indexSize: this.bm25Index.totalDocs,
    };
  }

  private async parsePDF(filePath: string): Promise<string> {
    try {
      const buffer = await readFile(filePath);
      const text = this.extractTextFromPDFBuffer(buffer);
      if (text.length > 0) return text;
    } catch {}

    try {
      const pdfParse = require("pdf-parse");
      const buffer = await readFile(filePath);
      const data = await pdfParse(buffer);
      return data.text || "";
    } catch {
      this.logger?.debug(`RAGDocumentStore: pdf-parse not available, using raw text extraction for ${filePath}`);
    }

    return `[PDF file: ${basename(filePath)} - content extraction requires pdf-parse package]`;
  }

  private extractTextFromPDFBuffer(buffer: Buffer): string {
    const content = buffer.toString("latin1");
    const textBlocks: string[] = [];

    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(content)) !== null) {
      const streamContent = match[1];
      const textMatches = streamContent.match(/\(([^)]*)\)/g);
      if (textMatches) {
        for (const tm of textMatches) {
          const text = tm.slice(1, -1)
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")");
          if (text.trim().length > 0 && /[a-zA-Z\u4e00-\u9fff]/.test(text)) {
            textBlocks.push(text);
          }
        }
      }
    }

    return textBlocks.join(" ").replace(/\s+/g, " ").trim();
  }

  private chunkContent(content: string, title: string): string[] {
    const chunks: string[] = [];
    const lines = content.split("\n");
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const line of lines) {
      const isHeading = /^#{1,6}\s/.test(line) || /^={3,}$/.test(line) || /^-{3,}$/.test(line);

      if (isHeading && currentChunk.length > 0 && currentLength > this.config.chunkSize * 0.3) {
        chunks.push(currentChunk.join("\n").trim());
        const overlapLines = currentChunk.slice(-Math.ceil(this.config.chunkOverlap / 80));
        currentChunk = [...overlapLines];
        currentLength = overlapLines.join("\n").length;
      }

      currentChunk.push(line);
      currentLength += line.length + 1;

      if (currentLength >= this.config.chunkSize) {
        chunks.push(currentChunk.join("\n").trim());
        const overlapLines = currentChunk.slice(-Math.ceil(this.config.chunkOverlap / 80));
        currentChunk = [...overlapLines];
        currentLength = overlapLines.join("\n").length;
      }
    }

    if (currentChunk.length > 0) {
      const lastChunk = currentChunk.join("\n").trim();
      if (lastChunk.length > 0) {
        chunks.push(lastChunk);
      }
    }

    return chunks.filter(c => c.length > 20);
  }

  private extractKeywords(text: string): string[] {
    const tokens = this.tokenize(text);
    const freqs = new Map<string, number>();
    for (const token of tokens) {
      freqs.set(token, (freqs.get(token) || 0) + 1);
    }
    return Array.from(freqs.entries())
      .filter(([, freq]) => freq >= 1)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([term]) => term);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  private createEmptyBM25(): BM25Index {
    return {
      docFreqs: new Map(),
      termFreqs: new Map(),
      docLengths: new Map(),
      avgDocLength: 0,
      totalDocs: 0,
    };
  }

  private rebuildBM25Index(): void {
    this.bm25Index = this.createEmptyBM25();
    const index = this.bm25Index;

    for (const [chunkId, chunk] of this.chunks) {
      const tokens = this.tokenize(chunk.content);
      index.docLengths.set(chunkId, tokens.length);
      index.totalDocs++;

      const termFreqs = new Map<string, number>();
      for (const token of tokens) {
        termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
      }
      index.termFreqs.set(chunkId, termFreqs);

      for (const term of termFreqs.keys()) {
        index.docFreqs.set(term, (index.docFreqs.get(term) || 0) + 1);
      }
    }

    const totalLength = Array.from(index.docLengths.values()).reduce((s, l) => s + l, 0);
    index.avgDocLength = index.totalDocs > 0 ? totalLength / index.totalDocs : 1;
  }

  private bm25Score(queryTerms: string[], chunk: DocumentChunk): number {
    const index = this.bm25Index;
    const chunkId = chunk.chunkId;
    const docLength = index.docLengths.get(chunkId) || 0;
    const termFreqs = index.termFreqs.get(chunkId);
    if (!termFreqs) return 0;

    let score = 0;
    const k1 = this.config.bm25K1;
    const b = this.config.bm25B;

    for (const term of queryTerms) {
      const tf = termFreqs.get(term) || 0;
      if (tf === 0) continue;

      const df = index.docFreqs.get(term) || 0;
      const idf = Math.log((index.totalDocs - df + 0.5) / (df + 0.5) + 1);
      const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / index.avgDocLength)));
      score += idf * tfNorm;
    }

    return Math.max(0, score);
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

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dotProduct / denominator;
  }

  private async generateEmbedding(text: string): Promise<number[] | undefined> {
    const cacheKey = createHash("sha256").update(text.slice(0, 200)).digest("hex").slice(0, 16);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    try {
      const truncated = text.slice(0, 2000);
      let embedding: number[];

      if (this.config.embeddingProvider === "ollama") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${this.config.embeddingEndpoint}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.config.embeddingModel, prompt: truncated }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) return undefined;
        const data = await response.json();
        embedding = data.embedding || data.embeddings?.[0] || [];
      } else if (this.config.embeddingProvider === "openai") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${this.config.embeddingEndpoint}/v1/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.config.embeddingModel, input: truncated }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) return undefined;
        const data = await response.json();
        embedding = data.data?.[0]?.embedding || [];
      } else {
        return undefined;
      }

      if (embedding.length > 0) {
        this.embeddingCache.set(cacheKey, embedding);
        if (this.embeddingCache.size > 5000) {
          const firstKey = this.embeddingCache.keys().next().value;
          if (firstKey) this.embeddingCache.delete(firstKey);
        }
        return embedding;
      }
    } catch (e: any) {
      this.logger?.debug(`RAGDocumentStore embedding failed: ${e?.message}`);
    }

    return undefined;
  }

  private async saveIndex(): Promise<void> {
    try {
      const indexPath = join(this.config.storagePath, "index.json");
      const data = {
        documents: Array.from(this.documents.entries()),
        chunks: Array.from(this.chunks.entries()).map(([id, chunk]) => [
          id,
          { ...chunk, embedding: chunk.embedding ? `[${chunk.embedding.length} floats]` : undefined },
        ]),
        savedAt: new Date().toISOString(),
      };
      await writeFile(indexPath, JSON.stringify(data, null, 2));
    } catch (e: any) {
      this.logger?.debug(`RAGDocumentStore save failed: ${e?.message}`);
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      const indexPath = join(this.config.storagePath, "index.json");
      if (!existsSync(indexPath)) return;

      const raw = await readFile(indexPath, "utf-8");
      const data = JSON.parse(raw);

      if (data.documents) {
        for (const [id, doc] of data.documents) {
          this.documents.set(id, doc);
        }
      }

      if (data.chunks) {
        for (const [id, chunk] of data.chunks) {
          this.chunks.set(id, chunk);
        }
      }

      this.rebuildBM25Index();
    } catch (e: any) {
      this.logger?.debug(`RAGDocumentStore load failed: ${e?.message}`);
    }
  }
}
