import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const kunavoProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["kunavo", "kunavo.com"],
  defaultModelDisplayNames: {
    "claude-opus-5": "Claude Opus 5",
    "claude-sonnet-5": "Claude Sonnet 5",
    "gemini-3-7-flash": "Gemini 3.7 Flash",
    "gpt-5-6-sol": "GPT-5.6 Sol"
  },
  defaultModels: ["claude-opus-5", "claude-sonnet-5", "gemini-3-7-flash", "gpt-5-6-sol"],
  endpoints: [
    {
      baseUrl: "https://api.kunavo.com/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "kunavo",
  name: "Kunavo",
  websiteUrl: "https://kunavo.com/"
};
