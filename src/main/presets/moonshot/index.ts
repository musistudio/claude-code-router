import type { ProviderAccountConfig } from "../../../shared/app";
import type { ProviderPreset } from "../../../shared/provider-presets";

const moonshotGlobalProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.moonshot.ai/v1/users/me/balance",
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

const moonshotChinaProviderAccountConfig: ProviderAccountConfig = {
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

export const moonshotChinaProviderPreset: ProviderPreset = {
  account: moonshotChinaProviderAccountConfig,
  aliases: ["kimi", "kimi api", "moonshot", "moonshot kimi"],
  defaultModels: ["moonshot-v1-8k"],
  endpoints: [
    {
      baseUrl: "https://api.moonshot.cn/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.kimi.com/?aff=ccr"
    }
  ],
  id: "moonshot",
  name: "Kimi API (China)",
  websiteUrl: "https://platform.kimi.com/?aff=ccr"
};

export const moonshotGlobalProviderPreset: ProviderPreset = {
  account: moonshotGlobalProviderAccountConfig,
  aliases: ["kimi", "kimi api", "moonshot", "moonshot kimi"],
  defaultModels: ["moonshot-v1-8k"],
  endpoints: [
    {
      baseUrl: "https://api.moonshot.ai/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.kimi.ai/?aff=ccr"
    }
  ],
  id: "moonshot-global",
  name: "Kimi API (Global)",
  websiteUrl: "https://platform.kimi.ai/?aff=ccr"
};
