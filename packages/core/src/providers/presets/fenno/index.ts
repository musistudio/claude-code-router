import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const fennoProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["fenno", "fenno.ai", "fenno ai"],
  endpoints: [
    {
      baseUrl: "https://api.fenno.ai",
      protocols: ["openai_chat_completions", "openai_responses", "anthropic_messages"]
    }
  ],
  id: "fenno",
  name: "Fenno.ai",
  websiteUrl: "https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=9HHHAB5QLAES"
};
