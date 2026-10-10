import { standardProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

const sensenovaDefaultModels = [
  "deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
];

export const sensenovaProviderPreset: ProviderPreset = {
  account: standardProviderAccountConfig,
  aliases: ["sensenova", "sense nova", "sense-nova", "商汤", "日日商"],
  defaultModels: sensenovaDefaultModels,
  endpoints: [
    {
      baseUrl: "https://token.sensenova.cn/v1",
      protocols: ["openai_chat_completions"],
    },
  ],
  id: "sensenova",
  name: "SenseNova",
  websiteUrl: "https://www.sensechat.com.cn/",
};