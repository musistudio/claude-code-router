import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const atlasCloudProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["atlascloud", "atlas cloud", "atlas"],
  defaultModels: ["deepseek-ai/deepseek-v4-pro"],
  endpoints: [
    {
      baseUrl: "https://api.atlascloud.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "atlascloud",
  name: "Atlas Cloud",
  officialApiKeyPatterns: [{ flags: "i", source: "^apikey-[a-z0-9_-]+$" }],
  websiteUrl: "https://www.atlascloud.ai/docs/api-keys"
};
