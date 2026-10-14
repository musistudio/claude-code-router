import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const onomeoProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["onomeo", "onomeo.com"],
  endpoints: [
    {
      baseUrl: "https://onomeo.com/v1",
      protocols: ["anthropic_messages", "openai_chat_completions"]
    }
  ],
  id: "onomeo",
  name: "onomeo",
  websiteUrl: "https://onomeo.com/"
};
