import type { ProviderPreset } from "@ccr/core/providers/presets/types";
import { standardProviderAccountConfig } from "@ccr/core/providers/presets/types";

export const kenariProviderPreset: ProviderPreset = {
  account: standardProviderAccountConfig,
  aliases: ["kenari", "kenari.id", "kenari cloud"],
  defaultModels: ["claude-sonnet-5", "kimi-k2-7-code", "deepseek-v4-flash"],
  endpoints: [
    {
      baseUrl: "https://kenari.id/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"],
      websiteUrl: "https://kenari.id/docs"
    }
  ],
  id: "kenari",
  name: "Kenari",
  officialApiKeyPatterns: [{ source: "^kn-[0-9a-f]{48}$" }],
  websiteUrl: "https://kenari.id/"
};
