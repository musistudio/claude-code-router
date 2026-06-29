import { defaultProviderAccountConfig, type ProviderPreset } from "../../../shared/provider-presets";

export const openaiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["openai", "chatgpt"],
  defaultModels: ["gpt-4o"],
  endpoints: [
    {
      baseUrl: "https://api.openai.com/v1",
      protocols: ["openai_responses", "openai_chat_completions"]
    }
  ],
  id: "openai",
  name: "OpenAI",
  officialApiKeyPatterns: [
    { flags: "i", source: "^sk-(?:proj|svcacct)-[a-z0-9_-]+$" }
  ],
  websiteUrl: "https://openai.com/"
};
