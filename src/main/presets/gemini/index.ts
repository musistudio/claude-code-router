import { defaultProviderAccountConfig, type ProviderPreset } from "../../../shared/provider-presets";

export const geminiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["gemini", "google"],
  endpoints: [
    {
      baseUrl: "https://generativelanguage.googleapis.com",
      protocols: ["gemini_generate_content", "gemini_interactions"]
    }
  ],
  id: "gemini",
  name: "Google Gemini",
  officialApiKeyPatterns: [
    { flags: "i", source: "^AIza[a-z0-9_-]{20,}$" }
  ],
  websiteUrl: "https://gemini.google.com/"
};
