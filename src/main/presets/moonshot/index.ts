import type { ProviderAccountConfig } from "../../../shared/app";
import type { ProviderPreset } from "../../../shared/provider-presets";

const moonshotProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.moonshot.cn/v1/users/me/balance",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.data.available_balance",
            unit: "CNY"
          },
          {
            id: "voucher_balance",
            kind: "balance",
            label: "Voucher balance",
            remaining: "$.data.voucher_balance",
            unit: "CNY"
          },
          {
            id: "cash_balance",
            kind: "balance",
            label: "Cash balance",
            remaining: "$.data.cash_balance",
            unit: "CNY"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

export const moonshotProviderPreset: ProviderPreset = {
  account: moonshotProviderAccountConfig,
  aliases: ["kimi", "moonshot"],
  defaultModels: ["moonshot-v1-8k"],
  endpoints: [
    {
      baseUrl: "https://api.moonshot.cn/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "moonshot",
  name: "Moonshot Kimi"
};
