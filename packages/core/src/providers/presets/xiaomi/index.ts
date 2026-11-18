import type { ProviderAccountConfig } from "@ccr/core/contracts/app";
import type { ProviderPreset } from "@ccr/core/providers/presets/types";

const xiaomiMimoDefaultModels = ["mimo-v2.5-pro", "mimo-v2.5"];
const xiaomiMimoWebsiteUrl = "https://platform.xiaomimimo.com/";

// MiMo documents two read-only account endpoints, and the key kinds are
// mutually exclusive: a pay-as-you-go key (`sk-`) can only read the account
// balance, a Token Plan key (`tp-`) can only read that plan's credit quota.
// So each preset points at the endpoint its own keys can reach.
//
// * `GET /v1/platform/balance` — balance_infos carries the account currency
//   once for every amount, so `unit` reads it from the same element as the
//   value instead of hardcoding CNY/USD.
// * `GET /v1/platform/token_plan` — quota is reported in credits, and the
//   current billing period ends at `period.end_at`. All three Token Plan
//   regions serve the same path.
const xiaomiMimoPaygAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.xiaomimimo.com/v1/platform/balance",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.balance_infos[0].total_available",
            unit: "$.balance_infos[0].currency"
          },
          {
            id: "cash_balance",
            kind: "balance",
            label: "Cash balance",
            remaining: "$.balance_infos[0].cash_balance",
            unit: "$.balance_infos[0].currency"
          },
          {
            id: "gift_balance",
            kind: "balance",
            label: "Granted balance",
            remaining: "$.balance_infos[0].gift_balance",
            unit: "$.balance_infos[0].currency"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

function xiaomiMimoTokenPlanAccountConfig(origin: string): ProviderAccountConfig {
  return {
    connectors: [
      {
        auth: "provider-api-key",
        endpoint: `${origin}/v1/platform/token_plan`,
        mapping: {
          meters: [
            {
              id: "plan_credits",
              kind: "quota",
              label: "Plan credits",
              limit: "$.quota.total_credits",
              remaining: "$.quota.remaining_credits",
              resetAt: "$.period.end_at",
              unit: "credits",
              used: "$.quota.used_credits"
            }
          ]
        },
        type: "http-json"
      }
    ],
    enabled: true
  };
}

function createXiaomiMimoProviderPreset(input: {
  account: ProviderAccountConfig;
  aliases: string[];
  anthropicBaseUrl: string;
  id: string;
  name: string;
  openAiBaseUrl: string;
}): ProviderPreset {
  return {
    account: input.account,
    aliases: input.aliases,
    defaultModels: xiaomiMimoDefaultModels,
    endpoints: [
      {
        baseUrl: input.openAiBaseUrl,
        label: "OpenAI",
        protocols: ["openai_responses", "openai_chat_completions"]
      },
      {
        baseUrl: input.anthropicBaseUrl,
        label: "Anthropic",
        protocols: ["anthropic_messages"]
      }
    ],
    id: input.id,
    name: input.name,
    websiteUrl: xiaomiMimoWebsiteUrl
  };
}

export const xiaomiMimoProviderPreset = createXiaomiMimoProviderPreset({
  account: xiaomiMimoPaygAccountConfig,
  aliases: ["mimo", "xiaomi", "xiaomi mimo", "小米", "小米 mimo"],
  anthropicBaseUrl: "https://api.xiaomimimo.com/anthropic",
  id: "xiaomi",
  name: "Xiaomi MiMo",
  openAiBaseUrl: "https://api.xiaomimimo.com/v1"
});

export const xiaomiMimoTokenPlanChinaProviderPreset = createXiaomiMimoProviderPreset({
  account: xiaomiMimoTokenPlanAccountConfig("https://token-plan-cn.xiaomimimo.com"),
  aliases: ["mimo token plan china", "xiaomi token plan china", "xiaomi token plan cn"],
  anthropicBaseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
  id: "xiaomi-token-plan-cn",
  name: "Xiaomi Token Plan (China)",
  openAiBaseUrl: "https://token-plan-cn.xiaomimimo.com/v1"
});

export const xiaomiMimoTokenPlanSingaporeProviderPreset = createXiaomiMimoProviderPreset({
  account: xiaomiMimoTokenPlanAccountConfig("https://token-plan-sgp.xiaomimimo.com"),
  aliases: ["mimo token plan singapore", "xiaomi token plan singapore", "xiaomi token plan sgp"],
  anthropicBaseUrl: "https://token-plan-sgp.xiaomimimo.com/anthropic",
  id: "xiaomi-token-plan-sgp",
  name: "Xiaomi Token Plan (Singapore)",
  openAiBaseUrl: "https://token-plan-sgp.xiaomimimo.com/v1"
});

export const xiaomiMimoTokenPlanEuropeProviderPreset = createXiaomiMimoProviderPreset({
  account: xiaomiMimoTokenPlanAccountConfig("https://token-plan-ams.xiaomimimo.com"),
  aliases: ["mimo token plan europe", "xiaomi token plan ams", "xiaomi token plan europe"],
  anthropicBaseUrl: "https://token-plan-ams.xiaomimimo.com/anthropic",
  id: "xiaomi-token-plan-ams",
  name: "Xiaomi Token Plan (Europe)",
  openAiBaseUrl: "https://token-plan-ams.xiaomimimo.com/v1"
});
