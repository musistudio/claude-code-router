import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@ccr/core/contracts/app";
import type { ProviderPreset } from "@ccr/core/providers/presets/types";

// The China endpoint mirrors the global one: `percentage` is the CONSUMED
// share of the window (so `remaining` is `100 - percentage`) and the windows
// are discriminated by `unit` (3 = rolling 5 h window, 6 = weekly window).
//
// The mapping filters on `unit` alone instead of on the limit `type`: the type
// name differs between the China and global endpoints (`TOKENS_LIMIT` vs
// `CREDIT_LIMIT`) and has already been renamed once, so depending on it made
// the meters empty whenever the endpoint changed spelling.
//
// The key is sent raw (`Authorization: <key>`), which is what the Zhipu AI
// API expects.
const zhipuQuotaMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: "100 - $.data.limits[?(@.unit==3)].percentage",
      resetAt: "$.data.limits[?(@.unit==3)].nextResetTime",
      unit: "%",
      used: "$.data.limits[?(@.unit==3)].percentage",
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: "100 - $.data.limits[?(@.unit==6)].percentage",
      resetAt: "$.data.limits[?(@.unit==6)].nextResetTime",
      unit: "%",
      used: "$.data.limits[?(@.unit==6)].percentage",
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
