import type { ProviderAccountConfig } from "../../../shared/app";
import type { ProviderPreset } from "../../../shared/provider-presets";

const mistralProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.mistral.ai/v1/billing/subscription",
      mapping: {
        meters: [
          {
            id: "credit_balance",
            kind: "balance",
            label: "Credit balance",
            remaining: "$.credit_balance",
            unit: "EUR"
          },
          {
            id: "monthly_budget",
            kind: "quota",
            label: "Monthly budget",
            limit: "$.monthly_budget",
            unit: "EUR",
            window: "monthly"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

export const mistralProviderPreset: ProviderPreset = {
  account: mistralProviderAccountConfig,
  aliases: ["mistral"],
  endpoints: [
    {
      baseUrl: "https://api.mistral.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "mistral",
  name: "Mistral"
};
