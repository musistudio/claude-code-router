import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const teapotRouterProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["teapotrouter", "teapot router", "teapotrouter.com", "www.teapotrouter.com"],
  endpoints: [
    {
      baseUrl: "https://api.teapotrouter.com",
      protocols: ["anthropic_messages"]
    },
    {
      baseUrl: "https://api.teapotrouter.com/v1",
      protocols: ["openai_chat_completions", "openai_responses"]
    }
  ],
  id: "teapotrouter",
  name: "TeapotRouter",
  websiteUrl: "https://teapotrouter.com"
};
