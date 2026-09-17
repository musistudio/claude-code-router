import type { ProviderPreset } from "@ccr/core/providers/presets/types";

export const trustedRouterProviderPreset: ProviderPreset = {
  aliases: ["trustedrouter"],
  endpoints: [
    {
      baseUrl: "https://api.trustedrouter.com/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "trustedrouter",
  name: "TrustedRouter",
  websiteUrl: "https://trustedrouter.com/"
};
