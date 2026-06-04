import { describe, it, expect } from "vitest";
import { getThinkLevel, parseThinkingConfig, thinkingToOpenAI, thinkingToAnthropic } from "./thinking";

describe("thinking", () => {
  describe("getThinkLevel", () => {
    it("should return none for zero", () => {
      expect(getThinkLevel(0)).toBe("none");
    });

    it("should return none for negative", () => {
      expect(getThinkLevel(-100)).toBe("none");
    });

    it("should return low for 1024", () => {
      expect(getThinkLevel(1024)).toBe("low");
    });

    it("should return medium for 8192", () => {
      expect(getThinkLevel(8192)).toBe("medium");
    });

    it("should return high for large budget", () => {
      expect(getThinkLevel(32000)).toBe("high");
    });
  });

  describe("parseThinkingConfig", () => {
    it("should handle null input", () => {
      const result = parseThinkingConfig(null);
      expect(result.enabled).toBe(false);
      expect(result.level).toBe("none");
    });

    it("should handle undefined input", () => {
      const result = parseThinkingConfig(undefined);
      expect(result.enabled).toBe(false);
    });

    it("should handle disabled type", () => {
      const result = parseThinkingConfig({ type: "disabled" });
      expect(result.enabled).toBe(false);
    });

    it("should handle enabled type with budget", () => {
      const result = parseThinkingConfig({ type: "enabled", budget_tokens: 16000 });
      expect(result.enabled).toBe(true);
      expect(result.level).toBe("high");
      expect(result.budgetTokens).toBe(16000);
    });

    it("should handle auto type", () => {
      const result = parseThinkingConfig({ type: "auto" });
      expect(result.enabled).toBe(true);
      expect(result.budgetTokens).toBe(8192);
    });

    it("should default to 8192 when budget_tokens missing", () => {
      const result = parseThinkingConfig({ type: "enabled" });
      expect(result.budgetTokens).toBe(8192);
    });

    it("should clamp negative budget to 0", () => {
      const result = parseThinkingConfig({ type: "enabled", budget_tokens: -500 });
      expect(result.budgetTokens).toBe(0);
      expect(result.enabled).toBe(true);
      expect(result.level).toBe("none");
    });
  });

  describe("thinkingToOpenAI", () => {
    it("should return empty for disabled", () => {
      const result = thinkingToOpenAI({ enabled: false, level: "none", budgetTokens: 0 });
      expect(result).toEqual({});
    });

    it("should return reasoning effort for enabled", () => {
      const result = thinkingToOpenAI({ enabled: true, level: "high", budgetTokens: 32000 }) as any;
      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.effort).toBe("high");
    });
  });

  describe("thinkingToAnthropic", () => {
    it("should return empty for disabled", () => {
      const result = thinkingToAnthropic({ enabled: false, level: "none", budgetTokens: 0 });
      expect(result).toEqual({});
    });

    it("should return thinking config for enabled", () => {
      const result = thinkingToAnthropic({ enabled: true, level: "high", budgetTokens: 16000 }) as any;
      expect(result.thinking).toBeDefined();
      expect(result.thinking.type).toBe("enabled");
      expect(result.thinking.budget_tokens).toBe(16000);
    });
  });
});
