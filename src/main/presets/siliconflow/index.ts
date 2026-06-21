import type { ProviderAccountConfig } from "../../../shared/app";
import type { ProviderPreset } from "../../../shared/provider-presets";

const siliconFlowProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.siliconflow.cn/v1/user/info",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.data.totalBalance",
            unit: "CNY"
          },
          {
            id: "current_balance",
            kind: "balance",
            label: "Current balance",
            remaining: "$.data.balance",
            unit: "CNY"
          },
          {
            id: "charge_balance",
            kind: "balance",
            label: "Charge balance",
            remaining: "$.data.chargeBalance",
            unit: "CNY"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

export const siliconFlowProviderPreset: ProviderPreset = {
  account: siliconFlowProviderAccountConfig,
  aliases: ["siliconflow"],
  endpoints: [
    {
      baseUrl: "https://api.siliconflow.cn/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "siliconflow",
  name: "SiliconFlow"
};
