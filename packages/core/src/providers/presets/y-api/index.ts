import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const yApiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["y-api", "yapi", "y api"],
  endpoints: [
    {
      baseUrl: "https://api.y-api.bestvirtualgoods.com/v1",
      protocols: ["anthropic_messages", "openai_chat_completions"]
    }
  ],
  id: "y-api",
  name: "Y-API",
  websiteUrl: "https://y-api.bestvirtualgoods.com/"
};
