import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const orcaRouterProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["orcarouter", "orca router", "orca"],
  defaultModels: [
    "anthropic/claude-opus-4.8",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.5",
    "google/gemini-3.5-flash"
  ],
  endpoints: [
    {
      baseUrl: "https://api.orcarouter.ai/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "orcarouter",
  name: "OrcaRouter",
  officialApiKeyPatterns: [
    { flags: "i", source: "^sk-orca-[a-z0-9_-]+$" }
  ],
  websiteUrl: "https://www.orcarouter.ai/"
};
