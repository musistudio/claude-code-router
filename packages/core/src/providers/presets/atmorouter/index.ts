import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const atmoRouterProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["atmorouter", "atmorouter.dev", "atmo router"],
  endpoints: [
    {
      baseUrl: "https://atmorouter.dev/v1",
      protocols: ["anthropic_messages", "openai_chat_completions"]
    }
  ],
  id: "atmorouter",
  name: "AtmoRouter",
  websiteUrl: "https://atmorouter.dev/"
};
