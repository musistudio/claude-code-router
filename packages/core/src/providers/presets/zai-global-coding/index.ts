import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@ccr/core/contracts/app";
import type { ProviderPreset } from "@ccr/core/providers/presets/types";

// The quota endpoint reports `percentage` as the CONSUMED share of the window:
// 6 % consumed means 94 % left on the 5 h window. `remaining` is therefore
// `100 - percentage` — mapping it the other way round would invert every meter
// and make a provider with headroom look exhausted.
//
// The windows are discriminated by `unit` (3 = rolling 5 h window, 6 = weekly
// window) and not by `type`: Z.ai renamed the limit type from `TOKENS_LIMIT`
// to `CREDIT_LIMIT` when the plans moved from tokens to credits, so filtering
// on the type name made every meter come back empty. `unit` alone is stable
// across both spellings.
//
// The key is sent raw (`Authorization: <key>`), like the Zhipu AI presets:
// api.z.ai accepts that form — and the Bearer form — interchangeably.
const zaiQuotaMapping: ProviderAccountMappingConfig = {
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
