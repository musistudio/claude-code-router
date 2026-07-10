import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const claudeApiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["claudeapi", "claudeapi.com", "www.claudeapi.com"],
  endpoints: [
    {
      baseUrl: "https://gw.claudeapi.com",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "claudeapi",
  name: "claudeapi",
  websiteUrl: "https://console.claudeapi.com/agent/register/LbmB7Y9kPloyzhwF?utm_source=claudecoderouter&utm_medium=partner&utm_campaign=claudecoderouter_2026&utm_content=default"
};
