import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const gmiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["gmi", "gmicloud", "gmi cloud"],
  endpoints: [
    {
      baseUrl: "https://api.gmi-serving.com/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "gmi",
  name: "GMI Cloud",
  websiteUrl: "https://www.gmicloud.ai/"
};
