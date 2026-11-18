import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const lazuProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["lazu", "lazu.ai", "lazu-ai"],
  endpoints: [
    {
      baseUrl: "https://api.lazu.ai/v1",
      protocols: [
        "anthropic_messages",
        "openai_responses",
        "openai_chat_completions",
        "gemini_generate_content"
      ]
    }
  ],
  id: "lazu",
  name: "Lazu",
  officialApiKeyPatterns: [
    { flags: "i", source: "^sk-lazu-[a-z0-9_-]+$" }
  ],
  websiteUrl: "https://lazu.ai/"
};
