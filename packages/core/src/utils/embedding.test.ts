import { describe, it, expect, beforeEach } from "vitest";
import { EmbeddingService, cosineSimilarity, resetEmbeddingService } from "./embedding";

describe("EmbeddingService", () => {
  let service: EmbeddingService;

  beforeEach(() => {
    resetEmbeddingService();
    service = new EmbeddingService({ enabled: true, provider: "none" });
  });

  describe("cosineSimilarity", () => {
    it("should return 1 for identical vectors", () => {
      const vec = [1, 0, 0, 0];
      expect(EmbeddingService.cosineSimilarity(vec, vec)).toBeCloseTo(1);
    });

    it("should return 0 for orthogonal vectors", () => {
      expect(EmbeddingService.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it("should return -1 for opposite vectors", () => {
      expect(EmbeddingService.cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it("should handle empty vectors", () => {
      expect(EmbeddingService.cosineSimilarity([], [])).toBe(0);
    });

    it("should handle mismatched lengths", () => {
      expect(EmbeddingService.cosineSimilarity([1, 2], [1])).toBe(0);
    });

    it("should compute partial similarity", () => {
      const sim = EmbeddingService.cosineSimilarity([1, 1], [1, 0]);
      expect(sim).toBeCloseTo(1 / Math.sqrt(2));
    });
  });

  describe("embed", () => {
    it("should return null when provider is none", async () => {
      const result = await service.embed("hello world");
      expect(result).toBeNull();
    });

    it("should return null for empty text", async () => {
      const svc = new EmbeddingService({ enabled: true, provider: "none" });
      const result = await svc.embed("");
      expect(result).toBeNull();
    });

    it("should return null for whitespace-only text", async () => {
      const svc = new EmbeddingService({ enabled: true, provider: "none" });
      const result = await svc.embed("   ");
      expect(result).toBeNull();
    });
  });

  describe("embedBatch", () => {
    it("should return nulls when unavailable", async () => {
      const results = await service.embedBatch(["hello", "world"]);
      expect(results).toEqual([null, null]);
    });
  });

  describe("isAvailable", () => {
    it("should be false when provider is none", () => {
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      const stats = service.getStats();
      expect(stats.available).toBe(false);
      expect(stats.provider).toBe("none");
      expect(stats.cacheSize).toBe(0);
    });
  });
});
