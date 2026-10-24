import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const runcrateProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["runcrate", "runcrate.ai"],
  defaultModels: [
    "deepseek-ai/DeepSeek-V4.1-Flash",
    "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    "zai-org/GLM-5.3",
    "zai-org/GLM-5.3-Flash",
    "Qwen/Qwen3.8-Flash",
    "openai/gpt-oss-120b"
  ],
  endpoints: [
    {
      baseUrl: "https://api.runcrate.ai/v1",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "runcrate",
  name: "Runcrate",
  websiteUrl: "https://www.runcrate.ai/inference/free?utm_source=claude-code-router&utm_medium=directory&utm_campaign=gpu_pricing"
};
