import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@ccr/core/contracts/app";
import type { ProviderPreset } from "@ccr/core/providers/presets/types";

const openCodeGoUsageEndpoint = "https://opencode.ai/zen/go/v1/usage";

const openCodeGoUsageMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "opencode_go_5h",
      kind: "quota",
      label: "5h limit",
      limit: 100,
      remaining: "100 - $.usage.rolling.percent",
      resetAt: "$.usage.rolling.resetsAt",
      unit: "%",
      used: "$.usage.rolling.percent",
      window: "5h"
    },
    {
      id: "opencode_go_weekly",
      kind: "quota",
      label: "Weekly limit",
      limit: 100,
      remaining: "100 - $.usage.weekly.percent",
      resetAt: "$.usage.weekly.resetsAt",
      unit: "%",
      used: "$.usage.weekly.percent",
      window: "weekly"
    },
    {
      id: "opencode_go_monthly",
      kind: "quota",
      label: "Monthly limit",
      limit: 100,
      remaining: "100 - $.usage.monthly.percent",
      resetAt: "$.usage.monthly.resetsAt",
      unit: "%",
      used: "$.usage.monthly.percent",
      window: "monthly"
    }
  ]
};

export function openCodeGoProviderAccountConfig(): ProviderAccountConfig {
  return {
    connectors: [
      {
        auth: "provider-api-key",
        endpoint: openCodeGoUsageEndpoint,
        mapping: openCodeGoUsageMapping,
        type: "http-json"
      }
    ],
    enabled: true
  };
}

export const openCodeGoProviderPreset: ProviderPreset = {
  account: openCodeGoProviderAccountConfig(),
  aliases: ["opencode go", "opencode-go", "zen go"],
  endpoints: [
    {
      baseUrl: "https://opencode.ai/zen/go/v1",
      protocols: [
        "openai_responses",
        "anthropic_messages",
        "openai_chat_completions",
        "gemini_generate_content"
      ],
      websiteUrl: "https://opencode.ai/docs/go/"
    }
  ],
  id: "opencode-go",
  name: "OpenCode Go",
  websiteUrl: "https://opencode.ai/docs/go/"
};
