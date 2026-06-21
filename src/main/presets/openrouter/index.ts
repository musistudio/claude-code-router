import type { ProviderAccountConfig } from "../../../shared/app";
import type { ProviderPreset } from "../../../shared/provider-presets";

const openRouterProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://openrouter.ai/api/v1/credits",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.data.total_credits - $.data.total_usage",
            unit: "USD"
          },
          {
            id: "total_credits",
            kind: "balance",
            label: "Total credits",
            limit: "$.data.total_credits",
            unit: "USD"
          },
          {
            id: "total_usage",
            kind: "balance",
            label: "Total usage",
            unit: "USD",
            used: "$.data.total_usage"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

export const openRouterProviderPreset: ProviderPreset = {
  account: openRouterProviderAccountConfig,
  aliases: ["openrouter"],
  endpoints: [
    {
      baseUrl: "https://openrouter.ai/api/v1",
      protocols: ["openai_chat_completions", "openai_responses"]
    }
  ],
  id: "openrouter",
  name: "OpenRouter",
  officialApiKeyPatterns: [
    { flags: "i", source: "^sk-or-v1-[a-z0-9_-]+$" }
  ]
};
