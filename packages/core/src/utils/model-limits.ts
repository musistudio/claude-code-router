export interface ModelLimits {
  maxOutputTokens: number;
  contextWindow: number;
}

export const MODEL_LIMITS: Record<string, ModelLimits> = {
  'claude-opus-4': { maxOutputTokens: 32000, contextWindow: 200000 },
  'claude-sonnet-4': { maxOutputTokens: 64000, contextWindow: 200000 },
  'claude-haiku-4': { maxOutputTokens: 64000, contextWindow: 200000 },
  'grok-3': { maxOutputTokens: 64000, contextWindow: 131072 },
  'grok-3-mini': { maxOutputTokens: 64000, contextWindow: 131072 },
  'gpt-4.1': { maxOutputTokens: 32768, contextWindow: 1047576 },
  'gpt-5.4': { maxOutputTokens: 128000, contextWindow: 1000000 },
  'gpt-5.4-mini': { maxOutputTokens: 128000, contextWindow: 400000 },
  'gpt-5.4-nano': { maxOutputTokens: 128000, contextWindow: 400000 },
  'kimi-k2.5': { maxOutputTokens: 16384, contextWindow: 256000 },
  'kimi-k1.5': { maxOutputTokens: 16384, contextWindow: 256000 },
  'qwen-max': { maxOutputTokens: 8192, contextWindow: 131072 },
  'qwen-plus': { maxOutputTokens: 8192, contextWindow: 131072 },
  'deepseek-v4-pro': { maxOutputTokens: 64000, contextWindow: 128000 },
  'deepseek-v4-flash': { maxOutputTokens: 64000, contextWindow: 128000 },
  'glm-5.1': { maxOutputTokens: 128000, contextWindow: 200000 },
  'glm-4.7': { maxOutputTokens: 64000, contextWindow: 128000 },
  'glm-4': { maxOutputTokens: 4096, contextWindow: 128000 },
};

export function getModelLimits(model: string): ModelLimits {
  for (const [prefix, limits] of Object.entries(MODEL_LIMITS)) {
    if (model.startsWith(prefix) || model === prefix) return limits;
  }
  return { maxOutputTokens: 64000, contextWindow: 200000 };
}

export function checkTokenBudget(model: string, estimatedTokens: number): { ok: boolean; excess: number } {
  const limits = getModelLimits(model);
  return { ok: estimatedTokens <= limits.contextWindow, excess: Math.max(0, estimatedTokens - limits.contextWindow) };
}
