import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@ccr/core/contracts/app";
import type { ProviderPreset } from "@ccr/core/providers/presets/types";

// Same endpoint and same payload shape as the coding plan preset.
//
// `percentage` is the CONSUMED share of the window (6 % consumed = 94 % left),
// so `remaining` is `100 - percentage`. The windows are discriminated by
// `unit` (3 = rolling 5 h window, 6 = weekly window) rather than by `type`:
// Z.ai renamed the limit type from `TOKENS_LIMIT` to `CREDIT_LIMIT` when the
// plans moved from tokens to credits, so filtering on the type name made every
// meter come back empty.
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

export const zaiGlobalGeneralProviderPreset: ProviderPreset = {
  account: zaiGlobalProviderAccountConfig,
  aliases: ["z.ai", "zai", "z ai", "z-ai", "glm global"],
  defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
  endpoints: [
    {
      baseUrl: "https://api.z.ai/api/paas/v4",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "zai-global-general",
  name: "Z.ai (Global) - General Endpoint",
  websiteUrl: "https://z.ai/"
};
