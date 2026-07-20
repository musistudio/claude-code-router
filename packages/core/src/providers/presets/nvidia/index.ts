import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const nvidiaProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["nvidia", "nvidia nim", "nvidia api catalog", "build.nvidia.com"],
  defaultModels: [
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3-ultra-550b-a55b"
  ],
  endpoints: [
    {
      baseUrl: "https://integrate.api.nvidia.com/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "nvidia",
  name: "NVIDIA",
  officialApiKeyPatterns: [
    { flags: "i", source: "^nvapi-[a-z0-9_-]+$" }
  ],
  websiteUrl: "https://build.nvidia.com/models"
};
