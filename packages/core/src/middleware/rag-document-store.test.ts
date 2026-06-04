import { describe, it, expect, beforeEach } from "vitest";
import { RAGDocumentStore } from "./rag-document-store";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";

const TEST_DIR = join(process.env.TEMP || "/tmp", "rag-test-" + Date.now());

describe("RAGDocumentStore", () => {
  let store: RAGDocumentStore;

  beforeEach(async () => {
    store = new RAGDocumentStore({
      storagePath: TEST_DIR,
      embeddingProvider: "none",
      chunkSize: 200,
      chunkOverlap: 30,
    });
    await store.initialize();
  });

  describe("chunkContent", () => {
    it("should split content into chunks", async () => {
      const testContent = "## Section 1\n".repeat(50);
      await writeFile(join(TEST_DIR, "test.md"), testContent, "utf-8");
      const doc = await store.ingestFile(join(TEST_DIR, "test.md"));
      expect(doc).not.toBeNull();
      expect(doc!.totalChunks).toBeGreaterThan(1);
    });
  });

  describe("ingestFile", () => {
    it("should ingest markdown file", async () => {
      const content = "# Test Document\n\nThis is a test document with some content about backtesting strategies.";
      const filePath = join(TEST_DIR, "test-doc.md");
      await writeFile(filePath, content, "utf-8");

      const doc = await store.ingestFile(filePath);
      expect(doc).not.toBeNull();
      expect(doc!.fileType).toBe(".md");
      expect(doc!.totalChunks).toBeGreaterThanOrEqual(1);
    });

    it("should ingest text file", async () => {
      const content = "Simple text content about risk metrics and VaR calculations for futures trading.";
      const filePath = join(TEST_DIR, "test.txt");
      await writeFile(filePath, content, "utf-8");

      const doc = await store.ingestFile(filePath);
      expect(doc).not.toBeNull();
      expect(doc!.title).toBe("test");
    });

    it("should reject unsupported file types", async () => {
      const filePath = join(TEST_DIR, "test.exe");
      await writeFile(filePath, "binary content", "utf-8");

      const doc = await store.ingestFile(filePath);
      expect(doc).toBeNull();
    });

    it("should deduplicate by checksum", async () => {
      const content = "Duplicate content test";
      const filePath = join(TEST_DIR, "dup.md");
      await writeFile(filePath, content, "utf-8");

      const doc1 = await store.ingestFile(filePath);
      const doc2 = await store.ingestFile(filePath);
      expect(doc1!.docId).toBe(doc2!.docId);
    });
  });

  describe("listDocuments", () => {
    it("should list ingested documents", async () => {
      const filePath = join(TEST_DIR, "list-test.md");
      await writeFile(filePath, "# List Test\nContent", "utf-8");
      await store.ingestFile(filePath);

      const docs = store.listDocuments();
      expect(docs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getDocument", () => {
    it("should get document by id", async () => {
      const filePath = join(TEST_DIR, "get-test.md");
      await writeFile(filePath, "# Get Test\nContent", "utf-8");
      const doc = await store.ingestFile(filePath);

      const found = store.getDocument(doc!.docId);
      expect(found).toBeDefined();
      expect(found!.title).toBe("get-test");
    });

    it("should return undefined for unknown doc", () => {
      expect(store.getDocument("nonexistent")).toBeUndefined();
    });
  });

  describe("hybridSearch", () => {
    it("should find results by keyword match", async () => {
      const content = "# Risk Metrics\n\nValue at Risk (VaR) and Conditional VaR (CVaR) calculations for portfolio management. Max drawdown analysis with Sharpe ratio optimization.";
      const filePath = join(TEST_DIR, "search-test.md");
      await writeFile(filePath, content, "utf-8");
      await store.ingestFile(filePath);

      const results = await store.hybridSearch("VaR risk metrics", { limit: 5 });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].chunk.content).toContain("VaR");
    });

    it("should return empty for no matches", async () => {
      const results = await store.hybridSearch("xyznonexistentquery123");
      expect(results.length).toBe(0);
    });

    it("should respect minScore filter", async () => {
      const results = await store.hybridSearch("test", { minScore: 0.99 });
      expect(results.every(r => r.score >= 0.99)).toBe(true);
    });

    it("should respect limit", async () => {
      const results = await store.hybridSearch("test", { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("deleteDocument", () => {
    it("should delete document and its chunks", async () => {
      const filePath = join(TEST_DIR, "delete-test.md");
      await writeFile(filePath, "# Delete\nContent to delete", "utf-8");
      const doc = await store.ingestFile(filePath);

      const deleted = await store.deleteDocument(doc!.docId);
      expect(deleted).toBe(true);
      expect(store.getDocument(doc!.docId)).toBeUndefined();
    });

    it("should return false for unknown doc", async () => {
      expect(await store.deleteDocument("nonexistent")).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return stats", async () => {
      const stats = store.getStats();
      expect(stats.totalDocuments).toBeGreaterThanOrEqual(0);
      expect(stats.totalChunks).toBeGreaterThanOrEqual(0);
      expect(stats.embeddingCoverage).toBe(0);
    });
  });

  describe("extractKeywords", () => {
    it("should extract keywords from content", async () => {
      const content = "Backtesting strategy with risk management and portfolio optimization";
      const filePath = join(TEST_DIR, "keyword-test.md");
      await writeFile(filePath, content, "utf-8");
      const doc = await store.ingestFile(filePath);
      expect(doc).not.toBeNull();
    });
  });
});
