import type { ProviderAccountConfig } from "../../../shared/app";
import type { ProviderPreset } from "../../../shared/provider-presets";

const deepSeekProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.deepseek.com/user/balance",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.balance_infos[0].total_balance",
            unit: "$.balance_infos[0].currency"
          },
          {
            id: "granted_balance",
            kind: "balance",
            label: "Granted balance",
            remaining: "$.balance_infos[0].granted_balance",
            unit: "$.balance_infos[0].currency"
          },
          {
            id: "topped_up_balance",
            kind: "balance",
            label: "Topped-up balance",
            remaining: "$.balance_infos[0].topped_up_balance",
            unit: "$.balance_infos[0].currency"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

export const deepSeekProviderPreset: ProviderPreset = {
  account: deepSeekProviderAccountConfig,
  aliases: ["deepseek"],
  endpoints: [
    {
      baseUrl: "https://api.deepseek.com",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "deepseek",
  name: "DeepSeek",
  websiteUrl: "https://www.deepseek.com/"
};
