import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const uberLlmProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["uberllm", "uber llm", "uber-llm"],
  endpoints: [
    {
      baseUrl: "https://api.uberllm.dev/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "uberllm",
  name: "UberLLM",
  websiteUrl: "https://uberllm.dev/"
};
