import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const outerLabsProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["outerlabs", "outer-labs", "outer labs"],
  defaultModels: [
    "claude-fable-5",
    "claude-fable-5-1",
    "claude-fable-5-2",
    "claude-opus-5",
    "claude-opus-5-5",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
    "claude-sonnet-5-5",
    "claude-haiku-4-5",
    "claude-haiku-5-5",
    "gpt-6-astra",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-6.1-terra",
    "gpt-5.6-luna",
    "gpt-6-luna"
  ],
  endpoints: [
    {
      baseUrl: "https://api.outerlabs.ai/v1",
      protocols: ["anthropic_messages", "openai_chat_completions"]
    }
  ],
  id: "outerlabs",
  name: "Outer Labs",
  websiteUrl: "https://outerlabs.ai"
};
