import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const unirouteProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["uniroute", "uniroute.app"],
  defaultModels: [
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-2",
    "gpt-6.1-sol",
    "gemini-3.8-flash",
    "deepseek-v4-pro"
  ],
  endpoints: [
    {
      baseUrl: "https://api.uniroute.app/v1",
      protocols: [
        "anthropic_messages",
        "openai_responses",
        "openai_chat_completions",
        "gemini_generate_content"
      ]
    }
  ],
  id: "uniroute",
  name: "UniRoute",
  websiteUrl: "https://uniroute.app/"
};
