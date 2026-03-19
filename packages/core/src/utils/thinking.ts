import { ThinkLevel } from "@/types/llm";

export function getThinkLevel(effort?: string): ThinkLevel {
  switch (effort) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "max":
      return "xhigh";
    case "none":
      return "none";
    default:
      return "medium";
  }
}
