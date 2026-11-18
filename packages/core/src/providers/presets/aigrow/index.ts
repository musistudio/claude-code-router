import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const aigrowProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["aigrow", "aigrow.gg"],
  endpoints: [
    {
      baseUrl: "https://aigrow.gg/v1",
      protocols: ["anthropic_messages", "openai_chat_completions"]
    }
  ],
  id: "aigrow",
  name: "AIGROW",
  websiteUrl: "https://aigrow.gg/ai-api"
};
