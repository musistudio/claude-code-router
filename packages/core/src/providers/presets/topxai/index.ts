import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const topxAiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["topxai", "topx ai", "topxea"],
  endpoints: [
    {
      baseUrl: "https://ai.topxea.com/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "topxai",
  name: "TopxAI",
  websiteUrl: "https://ai.topxea.com/"
};
