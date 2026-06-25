import { defaultProviderAccountConfig, type ProviderPreset } from "../../../shared/provider-presets";

export const anthropicProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["anthropic", "claude"],
  defaultModels: ["claude-sonnet-4-20250514"],
  endpoints: [
    {
      baseUrl: "https://api.anthropic.com",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "anthropic",
  name: "Anthropic",
  officialApiKeyPatterns: [
    { flags: "i", source: "^sk-ant-[a-z0-9_-]+$" }
  ]
};
