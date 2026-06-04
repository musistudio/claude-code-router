import { ThinkLevel } from "@/types/llm";

export const getThinkLevel = (thinking_budget: number): ThinkLevel => {
  if (thinking_budget <= 0) return "none";
  if (thinking_budget <= 1024) return "low";
  if (thinking_budget <= 8192) return "medium";
  return "high";
};

export interface ThinkingConfig {
  type: "enabled" | "disabled" | "auto";
  budget_tokens?: number;
}

export function parseThinkingConfig(thinking: any): {
  enabled: boolean;
  level: ThinkLevel;
  budgetTokens: number;
} {
  if (!thinking || typeof thinking !== "object") {
    return { enabled: false, level: "none", budgetTokens: 0 };
  }

  const type = thinking.type || "disabled";

  if (type === "disabled") {
    return { enabled: false, level: "none", budgetTokens: 0 };
  }

  if (type === "auto") {
    return { enabled: true, level: "medium", budgetTokens: 8192 };
  }

  const budget = typeof thinking.budget_tokens === "number"
    ? Math.max(0, thinking.budget_tokens)
    : 8192;

  return {
    enabled: true,
    level: getThinkLevel(budget),
    budgetTokens: budget,
  };
}

export function thinkingToOpenAI(config: ReturnType<typeof parseThinkingConfig>): {
  reasoning?: { effort: string };
} | {} {
  if (!config.enabled) return {};
  const effortMap: Record<ThinkLevel, string> = {
    none: "none",
    low: "low",
    medium: "medium",
    high: "high",
  };
  return { reasoning: { effort: effortMap[config.level] || "medium" } };
}

export function thinkingToAnthropic(config: ReturnType<typeof parseThinkingConfig>): {
  thinking?: { type: string; budget_tokens: number };
} | {} {
  if (!config.enabled) return {};
  return {
    thinking: {
      type: "enabled",
      budget_tokens: config.budgetTokens,
    },
  };
}
