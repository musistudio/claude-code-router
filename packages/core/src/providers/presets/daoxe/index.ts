import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const daoxeProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["daoxe", "dao xe"],
  endpoints: [
    {
      // Host root: CCR appends /v1 for OpenAI protocols and uses root+/v1/messages for Anthropic.
      baseUrl: "https://daoxe.com",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "daoxe",
  name: "DaoXE",
  websiteUrl: "https://daoxe.com/?utm_source=github&utm_medium=organic&utm_campaign=ccr_provider"
};
