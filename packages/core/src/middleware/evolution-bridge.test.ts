import { describe, it, expect, beforeEach } from "vitest";
import { EvolutionBridge, SkillRef } from "./evolution-bridge";

describe("EvolutionBridge", () => {
  let bridge: EvolutionBridge;

  beforeEach(() => {
    bridge = new EvolutionBridge({
      enabled: true,
      traceStoragePath: "./test-traces.jsonl",
      skillAwareRouting: true,
      contextInjection: true,
    });
  });

  describe("detectSkills", () => {
    it("should detect backtest skill from messages", () => {
      const skills = bridge.detectSkills({
        messages: [
          { role: "user", content: "Run backtest temporal integrity validation" },
        ],
      });
      expect(skills.length).toBeGreaterThanOrEqual(1);
      expect(skills.some(s => s.name === "backtest-temporal-integrity")).toBe(true);
    });

    it("should detect strategy graph skill", () => {
      const skills = bridge.detectSkills({
        system: "You are working on strategy graph compiler passes",
        messages: [],
      });
      expect(skills.some(s => s.name === "strategygraph-compiler")).toBe(true);
    });

    it("should detect financial data skill", () => {
      const skills = bridge.detectSkills({
        messages: [
          { role: "user", content: "计算IF期货合约的保证金" },
        ],
      });
      expect(skills.some(s => s.name === "financial-data-futures")).toBe(true);
    });

    it("should detect CCR-SKILL tags", () => {
      const skills = bridge.detectSkills({
        system: "<CCR-SKILL>custom-skill-name</CCR-SKILL>",
        messages: [],
      });
      expect(skills.some(s => s.name === "custom-skill-name" && s.source === "config")).toBe(true);
    });

    it("should return empty for no matches", () => {
      const skills = bridge.detectSkills({
        messages: [{ role: "user", content: "hello world" }],
      });
      expect(skills).toEqual([]);
    });

    it("should detect multiple skills", () => {
      const skills = bridge.detectSkills({
        messages: [
          { role: "user", content: "Run circuit breaker and retry on the semantic cache" },
        ],
      });
      expect(skills.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getSkillContexts", () => {
    it("should return context for detected skills", () => {
      const skills: SkillRef[] = [
        { name: "backtest-temporal-integrity", category: "quant", version: "1.0.0", confidence: 0.9, source: "detected" },
      ];
      const contexts = bridge.getSkillContexts(skills);
      expect(contexts.length).toBe(1);
      expect(contexts[0].skillName).toBe("backtest-temporal-integrity");
      expect(contexts[0].routingHints.preferredTier).toBe("pro");
      expect(contexts[0].contextInjection.length).toBeGreaterThan(0);
    });

    it("should return empty for unknown skills", () => {
      const skills: SkillRef[] = [
        { name: "unknown-skill", category: "other", version: "1.0.0", confidence: 0.5, source: "inferred" },
      ];
      const contexts = bridge.getSkillContexts(skills);
      expect(contexts).toEqual([]);
    });
  });

  describe("getRoutingHints", () => {
    it("should prefer pro tier for quant skills", () => {
      const skills: SkillRef[] = [
        { name: "risk-metrics", category: "quant", version: "1.0.0", confidence: 0.9, source: "detected" },
      ];
      const hints = bridge.getRoutingHints(skills);
      expect(hints.preferredTier).toBe("pro");
    });

    it("should return flash for infra skills", () => {
      const skills: SkillRef[] = [
        { name: "semantic-cache-embeddings", category: "infra", version: "1.0.0", confidence: 0.8, source: "detected" },
      ];
      const hints = bridge.getRoutingHints(skills);
      expect(hints.preferredTier).toBe("flash");
    });

    it("should return empty when no skills", () => {
      const hints = bridge.getRoutingHints([]);
      expect(hints.preferredTier).toBe("");
    });

    it("should return empty when skillAwareRouting disabled", () => {
      const noRoute = new EvolutionBridge({ skillAwareRouting: false });
      const skills: SkillRef[] = [
        { name: "risk-metrics", category: "quant", version: "1.0.0", confidence: 0.9, source: "detected" },
      ];
      const hints = noRoute.getRoutingHints(skills);
      expect(hints.preferredTier).toBe("");
    });
  });

  describe("buildContextInjection", () => {
    it("should build XML context for skills", () => {
      const skills: SkillRef[] = [
        { name: "puzzle-contract-author", category: "core", version: "1.0.0", confidence: 0.9, source: "detected" },
      ];
      const ctx = bridge.buildContextInjection(skills);
      expect(ctx).toContain("<evolution_context>");
      expect(ctx).toContain("puzzle-contract-author");
      expect(ctx).toContain("</evolution_context>");
    });

    it("should return empty string when no skills", () => {
      const ctx = bridge.buildContextInjection([]);
      expect(ctx).toBe("");
    });

    it("should return empty when contextInjection disabled", () => {
      const noCtx = new EvolutionBridge({ contextInjection: false });
      const skills: SkillRef[] = [
        { name: "puzzle-contract-author", category: "core", version: "1.0.0", confidence: 0.9, source: "detected" },
      ];
      const ctx = noCtx.buildContextInjection(skills);
      expect(ctx).toBe("");
    });
  });

  describe("recordTrace", () => {
    it("should record trace to batch", () => {
      bridge.recordTrace({
        sessionId: "test-session",
        turnNumber: 1,
        skills: [{ name: "risk-metrics", category: "quant", version: "1.0.0", confidence: 0.9, source: "detected" }],
        routing: { provider: "openai", model: "gpt-4", tier: "pro", scenarioType: "think", routeReason: "skill-aware" },
        quality: { hallucinationRisk: 0.1, qualityScore: 0.9, latencyMs: 500 },
        context: { ragEnriched: true, memoryEnriched: false, cacheHit: false, preservedContexts: 3, toolChainsActive: 1 },
        usage: { inputTokens: 1000, outputTokens: 500, model: "gpt-4" },
      });

      const stats = bridge.getStats();
      expect(stats.pendingBatch).toBe(1);
      expect(stats.skillsDetected["risk-metrics"]).toBe(1);
    });

    it("should not record when disabled", () => {
      const disabled = new EvolutionBridge({ enabled: false });
      disabled.recordTrace({
        sessionId: "test", turnNumber: 1, skills: [],
        routing: { provider: "test", model: "test", tier: "test", scenarioType: "", routeReason: "" },
        quality: { hallucinationRisk: 0, qualityScore: 0, latencyMs: 0 },
        context: { ragEnriched: false, memoryEnriched: false, cacheHit: false, preservedContexts: 0, toolChainsActive: 0 },
        usage: { inputTokens: 0, outputTokens: 0, model: "" },
      });
      expect(disabled.getStats().pendingBatch).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should return empty stats initially", () => {
      const stats = bridge.getStats();
      expect(stats.totalTraces).toBe(0);
      expect(stats.topSkills).toEqual([]);
    });
  });

  describe("initialize/shutdown", () => {
    it("should initialize and shutdown without error", () => {
      bridge.initialize();
      bridge.shutdown();
    });
  });
});
