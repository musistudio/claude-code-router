import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const code0ProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["code0", "code0.ai", "code 0"],
  endpoints: [
    {
      baseUrl: "https://console.code0.ai",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "code0",
  name: "code0.ai",
  websiteUrl: "https://code0.ai?source=claudecoderouter"
};
