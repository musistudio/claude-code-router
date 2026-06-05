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
  thinking?: { type: string };
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

export function thinkingToGlm(config: ReturnType<typeof parseThinkingConfig>): {
  thinking?: { type: "enabled" };
} | {} {
  if (!config.enabled) return {};
  return { thinking: { type: "enabled" } } as any;
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

const EFFORT_TO_BUDGET: Record<string, number> = {
  low: 1024,
  medium: 8192,
  high: 32000,
};

export function resolveReasoningEffort(body: any): { effort?: string; budgetTokens?: number } {
  if (body.reasoning_effort) {
    return {
      effort: body.reasoning_effort,
      budgetTokens: EFFORT_TO_BUDGET[body.reasoning_effort] || 8192,
    };
  }
  if (body.thinking?.type === 'enabled') {
    const budget = body.thinking.budget_tokens || 8192;
    return {
      effort: budget <= 1024 ? 'low' : budget <= 8192 ? 'medium' : 'high',
      budgetTokens: budget,
    };
  }
  return {};
}
