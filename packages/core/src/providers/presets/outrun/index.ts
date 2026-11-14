import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const outrunProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["outrun", "outrun ai", "outrun.to"],
  endpoints: [
    {
      baseUrl: "https://api.outrun.to/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "outrun",
  name: "Outrun",
  websiteUrl: "https://outrun.to/"
};
