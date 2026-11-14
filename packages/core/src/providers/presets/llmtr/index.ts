import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const llmtrProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["llmtr", "llm tr"],
  endpoints: [
    {
      baseUrl: "https://llmtr.com/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "llmtr",
  name: "LLMTR",
  websiteUrl: "https://llmtr.com"
};
