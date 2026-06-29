import type { ProviderAccountConfig } from "../../../shared/app";
import type { ProviderPreset } from "../../../shared/provider-presets";

const kimiCodingProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.kimi.com/coding/v1/usages",
      mapping: {
        meters: []
      },
      parser: "kimi-code-usages",
      type: "http-json"
    }
  ],
  enabled: true
};

export const kimiCodingProviderPreset: ProviderPreset = {
  account: kimiCodingProviderAccountConfig,
  aliases: ["kimi code", "kimi coding", "kimi coding plan", "kimi-for-coding"],
  defaultModelDisplayNames: {
    "kimi-for-coding": "K2.7 Code"
  },
  defaultModels: ["kimi-for-coding"],
  endpoints: [
    {
      baseUrl: "https://api.kimi.com/coding/v1",
      protocols: ["openai_chat_completions"]
    },
    {
      baseUrl: "https://api.kimi.com/coding/",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "kimi-coding",
  name: "Kimi Code - Coding Plan",
  websiteUrl: "https://www.kimi.com/code/docs/"
};
