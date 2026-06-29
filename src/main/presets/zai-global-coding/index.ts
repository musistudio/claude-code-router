import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "../../../shared/app";
import type { ProviderPreset } from "../../../shared/provider-presets";

const zaiQuotaMapping: ProviderAccountMappingConfig = {
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

const zaiGlobalProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zaiQuotaMapping,
      type: "http-json"
    }
  ],
  enabled: true
};

export const zaiGlobalCodingProviderPreset: ProviderPreset = {
  account: zaiGlobalProviderAccountConfig,
  aliases: ["z.ai", "zai", "z ai", "z-ai", "glm global"],
  defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
  endpoints: [
    {
      baseUrl: "https://api.z.ai/api/coding/paas/v4",
      protocols: ["openai_chat_completions"]
    },
    {
      baseUrl: "https://api.z.ai/api/anthropic",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "zai-global-coding",
  name: "Z.ai (Global) - Coding Plan",
  websiteUrl: "https://z.ai/"
};
