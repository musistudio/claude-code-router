import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const topxAiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["topxai", "topx ai"],
  endpoints: [
    {
      baseUrl: "https://api.topxai.xyz/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "topxai",
  name: "TopxAI",
  websiteUrl: "https://api.topxai.xyz/"
};
