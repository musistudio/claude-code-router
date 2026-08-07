import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const apiTokenProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["apitoken", "apitoken.sale", "api token sale"],
  defaultModels: [
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5"
  ],
  endpoints: [
    {
      baseUrl: "https://api.apitoken.sale",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "apitoken",
  name: "apiToken.sale",
  officialApiKeyPatterns: [
    { source: "^sk-pool-[A-Za-z0-9._-]+$" }
  ],
  websiteUrl: "https://apitoken.sale"
};
