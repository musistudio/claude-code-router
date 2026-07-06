import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@ccr/core/contracts/app";
import type { ProviderPreset } from "@ccr/core/providers/presets/types";

const zhipuQuotaMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: "100 - $.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==3)].percentage",
      resetAt: "$.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==3)].nextResetTime",
      unit: "%",
      used: "$.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==3)].percentage",
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: "100 - $.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==6)].percentage",
      resetAt: "$.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==6)].nextResetTime",
      unit: "%",
      used: "$.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==6)].percentage",
      window: "weekly"
    }
  ]
};

const zhipuCnProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zhipuQuotaMapping,
      type: "http-json"
    }
  ],
  enabled: true
};

export const zhipuCnCodingProviderPreset: ProviderPreset = {
  account: zhipuCnProviderAccountConfig,
  aliases: ["zhipu", "bigmodel", "glm", "智谱", "智谱ai", "智谱清言"],
  defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
  endpoints: [
    {
      baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
      protocols: ["openai_chat_completions"]
    },
    {
      baseUrl: "https://open.bigmodel.cn/api/anthropic",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "zhipu-cn-coding",
  name: "Zhipu AI (China) - Coding Plan",
  websiteUrl: "https://www.bigmodel.cn/"
};
