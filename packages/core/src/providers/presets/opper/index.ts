import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const opperProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["opper", "opper ai"],
  endpoints: [
    {
      baseUrl: "https://api.opper.ai/v3/compat",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "opper",
  name: "Opper",
  websiteUrl: "https://opper.ai/"
};
