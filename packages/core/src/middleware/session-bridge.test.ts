import { describe, it, expect, beforeEach } from "vitest";
import { SessionBridge, SessionState, CompactionEvent } from "./session-bridge";

describe("SessionBridge", () => {
  let bridge: SessionBridge;

  beforeEach(() => {
    bridge = new SessionBridge({
      maxPreservedContexts: 10,
      maxToolChainHistory: 20,
      sessionTimeoutMs: 60000,
    });
  });

  describe("getOrCreateSession", () => {
    it("should create a new session", () => {
      const session = bridge.getOrCreateSession("test-1");
      expect(session.sessionId).toBe("test-1");
      expect(session.turnCount).toBe(0);
      expect(session.preservedContext).toEqual([]);
    });

    it("should return existing session", () => {
      const s1 = bridge.getOrCreateSession("test-1");
      s1.turnCount = 5;
      const s2 = bridge.getOrCreateSession("test-1");
      expect(s2.turnCount).toBe(5);
    });
  });

  describe("processRequest", () => {
    it("should increment turn count", () => {
      bridge.processRequest("s1", { messages: [] });
      bridge.processRequest("s1", { messages: [] });
      expect(bridge.getSession("s1")!.turnCount).toBe(2);
    });

    it("should detect no compaction with few messages", () => {
      const result = bridge.processRequest("s1", {
        messages: [
          { role: "system", content: "test" },
          { role: "user", content: "hello" },
        ],
      });
      expect(result.isCompaction).toBe(false);
    });

    it("should extract preserved context from user goals", () => {
      bridge.processRequest("s1", {
        messages: [
          {
            role: "user",
            content: "My goal: Build a trading strategy that maximizes Sharpe ratio while keeping drawdown under 15%",
          },
        ],
      });
      const session = bridge.getSession("s1")!;
      expect(session.preservedContext.length).toBeGreaterThan(0);
      expect(session.preservedContext[0].value).toContain("trading strategy");
    });

    it("should return active chains", () => {
      const result = bridge.processRequest("s1", { messages: [] });
      expect(result.activeChains).toEqual([]);
    });

    it("should track thinking budget from request", () => {
      bridge.processRequest("s1", {
        messages: [],
        thinking: { type: "enabled", budget_tokens: 32000 },
      });
      const session = bridge.getSession("s1")!;
      expect(session.thinkingBudgetTotal).toBe(32000);
    });
  });

  describe("processResponse", () => {
    it("should track tool_use blocks in response", () => {
      bridge.getOrCreateSession("s1");
      const result = bridge.processResponse("s1", {
        content: [
          { type: "text", text: "Let me check that file" },
          { type: "tool_use", id: "tu-1", name: "Read", input: { filePath: "/src/test.ts" } },
        ],
      });
      expect(result.toolCalls.length).toBe(1);
      expect(result.toolCalls[0].toolName).toBe("Read");
    });

    it("should count thinking blocks", () => {
      bridge.getOrCreateSession("s1");
      const result = bridge.processResponse("s1", {
        content: [
          { type: "thinking", thinking: "Let me analyze..." },
          { type: "redacted_thinking" },
          { type: "text", text: "Done" },
        ],
      });
      expect(result.thinkingBlocks).toBe(2);
    });

    it("should assess compaction risk as 0 for new sessions", () => {
      bridge.getOrCreateSession("s1");
      const result = bridge.processResponse("s1", { content: [] });
      expect(result.compactionRisk).toBeGreaterThanOrEqual(0);
      expect(result.compactionRisk).toBeLessThanOrEqual(1);
    });

    it("should handle empty response", () => {
      bridge.getOrCreateSession("s1");
      const result = bridge.processResponse("s1", {});
      expect(result.toolCalls).toEqual([]);
      expect(result.thinkingBlocks).toBe(0);
    });
  });

  describe("tool chains", () => {
    it("should create and track tool chains", () => {
      bridge.getOrCreateSession("s1");

      bridge.processResponse("s1", {
        content: [
          { type: "tool_use", id: "tu-1", name: "Read", input: { filePath: "/a.ts" } },
        ],
      });

      const session = bridge.getSession("s1")!;
      const chains = Array.from(session.activeToolChains.values());
      expect(chains.length).toBe(1);
      expect(chains[0].toolName).toBe("Read");
      expect(chains[0].steps.length).toBe(1);
    });

    it("should reuse chain for same tool name", () => {
      bridge.getOrCreateSession("s1");

      bridge.processResponse("s1", {
        content: [{ type: "tool_use", id: "tu-1", name: "Read", input: {} }],
      });
      bridge.processResponse("s1", {
        content: [{ type: "tool_use", id: "tu-2", name: "Read", input: {} }],
      });

      const chains = Array.from(bridge.getSession("s1")!.activeToolChains.values());
      expect(chains.length).toBe(1);
      expect(chains[0].steps.length).toBe(2);
    });

    it("should complete chain when tool results received", () => {
      bridge.getOrCreateSession("s1");

      bridge.processResponse("s1", {
        content: [{ type: "tool_use", id: "tu-1", name: "Grep", input: { pattern: "test" } }],
      });

      bridge.processRequest("s1", {
        messages: [
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "tu-1", content: "found 3 matches" }],
          },
        ],
      });

      const chains = Array.from(bridge.getSession("s1")!.activeToolChains.values());
      expect(chains[0].status).toBe("completed");
      expect(chains[0].steps[0].output).toContain("found 3 matches");
    });
  });

  describe("getSessionStats", () => {
    it("should return empty stats for no sessions", () => {
      const stats = bridge.getSessionStats();
      expect(stats.activeSessions).toBe(0);
      expect(stats.totalCompactions).toBe(0);
    });

    it("should track active sessions", () => {
      bridge.getOrCreateSession("s1");
      bridge.getOrCreateSession("s2");
      const stats = bridge.getSessionStats();
      expect(stats.activeSessions).toBe(2);
    });
  });

  describe("cleanup", () => {
    it("should remove expired sessions", async () => {
      const shortBridge = new SessionBridge({ sessionTimeoutMs: 1 });
      shortBridge.getOrCreateSession("s1");
      await new Promise(r => setTimeout(r, 5));
      shortBridge.cleanup();
      expect(shortBridge.getSession("s1")).toBeUndefined();
    });
  });
});
