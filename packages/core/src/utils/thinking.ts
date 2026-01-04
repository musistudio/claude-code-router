import { ThinkLevel } from "@/types/llm";

export const getThinkLevel = (thinking_budget: number): ThinkLevel => {
  if (thinking_budget <= 0) return "none";
  if (thinking_budget <= 1024) return "low";
  if (thinking_budget <= 8192) return "medium";
  return "high";
};
