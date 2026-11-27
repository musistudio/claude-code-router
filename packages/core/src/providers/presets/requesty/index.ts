import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const requestyProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["requesty", "requesty router", "router.requesty.ai"],
  defaultModels: [
    "anthropic/claude-sonnet-4-6",
    "openai/gpt-4o-mini",
    "google/gemini-2.5-flash"
  ],
  endpoints: [
    {
      baseUrl: "https://router.requesty.ai/v1",
      protocols: ["openai_chat_completions", "openai_responses", "anthropic_messages"]
    }
  ],
  id: "requesty",
  name: "Requesty",
  websiteUrl: "https://app.requesty.ai/api-keys"
};
