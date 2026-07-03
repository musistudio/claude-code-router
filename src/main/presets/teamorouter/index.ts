import { defaultProviderAccountConfig, type ProviderPreset } from "../../../shared/provider-presets";

export const teamoRouterProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["teamorouter", "teamo router", "teamo"],
  endpoints: [
    {
      baseUrl: "https://api.teamorouter.com",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "teamorouter",
  name: "TeamoRouter",
  websiteUrl: "https://teamorouter.com/"
};
