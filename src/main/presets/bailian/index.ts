import { defaultProviderAccountConfig, type ProviderPreset } from "../../../shared/provider-presets";

export const bailianProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["qwen", "dashscope", "bailian", "alibaba"],
  endpoints: [
    {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "bailian",
  name: "Alibaba Bailian"
};
