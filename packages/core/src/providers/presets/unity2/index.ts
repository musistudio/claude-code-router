import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const unity2ProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["unity2", "unity2.ai", "unity2 ai", "unity 2"],
  endpoints: [
    {
      baseUrl: "https://unity2.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "unity2",
  name: "Unity2.Ai",
  websiteUrl: "https://unity2.ai/register?source=claudecoderouter"
};
