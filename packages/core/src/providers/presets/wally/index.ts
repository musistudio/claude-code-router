import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const wallyProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["wally", "runwally", "runanywhere"],
  defaultModels: ["deepseek-v4.1-flash", "glm-5.3-flash"],
  endpoints: [
    {
      baseUrl: "https://inference.runanywhere.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "wally",
  name: "Wally",
  websiteUrl: "https://www.runwally.com/"
};
