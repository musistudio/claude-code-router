import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const runApiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["runapi"],
  endpoints: [
    {
      baseUrl: "https://runapi.co/v1",
      protocols: ["openai_responses", "openai_chat_completions"]
    }
  ],
  id: "runapi",
  name: "RunAPI",
  websiteUrl: "https://runapi.co/register?aff=IX1t"
};
