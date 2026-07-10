import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const qiniuAiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["qiniu", "qiniu ai", "qiniu cloud ai", "qiniu yun ai", "qiniu yun", "七牛云", "七牛云ai", "七牛云 ai", "modelink"],
  endpoints: [
    {
      baseUrl: "https://api.qnaigc.com",
      label: "China mainland OpenAI",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://s.qiniu.com/AVjMVf"
    },
    {
      baseUrl: "https://api.qnaigc.com/bypass/openai/v1",
      label: "China mainland OpenAI Responses",
      protocols: ["openai_responses"],
      websiteUrl: "https://s.qiniu.com/AVjMVf"
    },
    {
      baseUrl: "https://api.qnaigc.com",
      label: "China mainland Anthropic",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://s.qiniu.com/AVjMVf"
    },
    {
      baseUrl: "https://api.qnaigc.com/bypass/vertex/v1",
      label: "China mainland Gemini Generate",
      protocols: ["gemini_generate_content"],
      websiteUrl: "https://s.qiniu.com/AVjMVf"
    }
  ],
  id: "qiniu-ai",
  name: "七牛云 AI",
  websiteUrl: "https://s.qiniu.com/AVjMVf"
};
