import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@ccr/core/contracts/app";
import type { ProviderPreset } from "@ccr/core/providers/presets/types";

// Same endpoint and same payload shape as the China coding plan preset:
// `percentage` is the CONSUMED share (so `remaining` is `100 - percentage`)
// and the windows are discriminated by `unit` (3 = rolling 5 h window,
// 6 = weekly window) rather than by the limit `type`, whose spelling differs
// between the China and global endpoints.
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

export const zhipuCnGeneralProviderPreset: ProviderPreset = {
  account: zhipuCnProviderAccountConfig,
  aliases: ["zhipu", "bigmodel", "glm", "智谱", "智谱ai", "智谱清言"],
  defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
  endpoints: [
    {
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "zhipu-cn-general",
  name: "Zhipu AI (China) - General Endpoint",
  websiteUrl: "https://www.bigmodel.cn/"
};
