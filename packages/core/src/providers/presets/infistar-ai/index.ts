import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const infistarAiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["infistar", "infistar ai", "无限星河", "无限星河ai", "无限星河 ai"],
  defaultModels: ["gpt-4o"],
  endpoints: [
    {
      baseUrl: "https://infistar.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "infistar-ai",
  name: "无限星河",
  websiteUrl: "https://www.infistar.cc/register?aff=CCRCCR&ref_source=link"
};
