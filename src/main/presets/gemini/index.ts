import { defaultProviderAccountConfig, type ProviderPreset } from "../../../shared/provider-presets";

export const geminiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["gemini", "google"],
  endpoints: [
    {
      baseUrl: "https://generativelanguage.googleapis.com",
      protocols: ["gemini_generate_content"]
    }
  ],
  id: "gemini",
  name: "Google Gemini",
  officialApiKeyPatterns: [
    { flags: "i", source: "^AIza[a-z0-9_-]{20,}$" }
  ]
};
