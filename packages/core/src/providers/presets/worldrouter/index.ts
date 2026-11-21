import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const worldRouterProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["worldrouter", "world router", "worldclaw"],
  defaultModels: ["claude-opus-5-5", "claude-sonnet-5-5", "gpt-6.1-sol", "gpt-6.1-terra", "gemini-4-carbon", "gpt-5.4-mini"],
  endpoints: [
    {
      baseUrl: "https://inference-api.worldrouter.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "worldrouter",
  name: "WorldRouter",
  websiteUrl: "https://router.worldclaw.ai/"
};
