import type { ProviderPreset } from "@ccr/core/providers/presets/types";
import { standardProviderAccountConfig } from "@ccr/core/providers/presets/types";

export const minimaxGlobalProviderPreset: ProviderPreset = {
  account: standardProviderAccountConfig,
  aliases: ["minimax", "minimax global"],
  defaultModels: ["MiniMax-M3", "MiniMax-M2.7"],
  endpoints: [
    {
      baseUrl: "https://api.minimax.io/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.minimax.io/docs"
    },
    {
      baseUrl: "https://api.minimax.io/anthropic",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://platform.minimax.io/docs"
    }
  ],
  id: "minimax-global",
  name: "MiniMax (Global)",
  websiteUrl: "https://platform.minimax.io/docs"
};

export const minimaxChinaProviderPreset: ProviderPreset = {
  account: standardProviderAccountConfig,
  aliases: ["minimax", "minimaxi", "minimax china"],
  defaultModels: ["MiniMax-M3", "MiniMax-M2.7"],
  endpoints: [
    {
      baseUrl: "https://api.minimaxi.com/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.minimaxi.com/docs"
    },
    {
      baseUrl: "https://api.minimaxi.com/anthropic",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://platform.minimaxi.com/docs"
    }
  ],
  id: "minimax-cn",
  name: "MiniMax (China)",
  websiteUrl: "https://platform.minimaxi.com/docs"
};
