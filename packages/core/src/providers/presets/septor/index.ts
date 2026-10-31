import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const septorProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["septor", "septor-labs", "septorlabs", "septor labs"],
  endpoints: [
    {
      baseUrl: "https://api.septorlabs.com/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "septor",
  name: "Septor Labs",
  websiteUrl: "https://septorlabs.com/"
};
