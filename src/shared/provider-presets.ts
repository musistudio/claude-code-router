import type { GatewayProviderProtocol } from "./app";

export type ProviderPresetEndpoint = {
  baseUrl: string;
  label?: string;
  protocols: GatewayProviderProtocol[];
};

export type ProviderPreset = {
  aliases: string[];
  defaultModels?: string[];
  endpoints: ProviderPresetEndpoint[];
  id: string;
  name: string;
};

export const customProviderPresetId = "custom";

export const providerPresets: ProviderPreset[] = [
  {
    aliases: ["openai", "chatgpt"],
    defaultModels: ["gpt-4o"],
    endpoints: [
      {
        baseUrl: "https://api.openai.com/v1",
        protocols: ["openai_responses", "openai_chat_completions"]
      }
    ],
    id: "openai",
    name: "OpenAI"
  },
  {
    aliases: ["anthropic", "claude"],
    defaultModels: ["claude-sonnet-4-20250514"],
    endpoints: [
      {
        baseUrl: "https://api.anthropic.com",
        protocols: ["anthropic_messages"]
      }
    ],
    id: "anthropic",
    name: "Anthropic"
  },
  {
    aliases: ["gemini", "google"],
    endpoints: [
      {
        baseUrl: "https://generativelanguage.googleapis.com",
        protocols: ["gemini_generate_content"]
      }
    ],
    id: "gemini",
    name: "Google Gemini"
  },
  {
    aliases: ["openrouter"],
    endpoints: [
      {
        baseUrl: "https://openrouter.ai/api/v1",
        protocols: ["openai_chat_completions", "openai_responses"]
      }
    ],
    id: "openrouter",
    name: "OpenRouter"
  },
  {
    aliases: ["deepseek"],
    defaultModels: ["deepseek-chat"],
    endpoints: [
      {
        baseUrl: "https://api.deepseek.com",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "deepseek",
    name: "DeepSeek"
  },
  {
    aliases: ["zhipu", "bigmodel", "glm", "智谱", "智谱ai", "智谱清言"],
    defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
    endpoints: [
      {
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        protocols: ["openai_chat_completions"]
      },
      {
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        protocols: ["anthropic_messages"]
      }
    ],
    id: "zhipu-cn-coding",
    name: "Zhipu AI (China) - Coding Plan"
  },
  {
    aliases: ["zhipu", "bigmodel", "glm", "智谱", "智谱ai", "智谱清言"],
    defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
    endpoints: [
      {
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "zhipu-cn-general",
    name: "Zhipu AI (China) - General Endpoint"
  },
  {
    aliases: ["z.ai", "zai", "z ai", "z-ai", "glm global"],
    defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
    endpoints: [
      {
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        protocols: ["openai_chat_completions"]
      },
      {
        baseUrl: "https://api.z.ai/api/anthropic",
        protocols: ["anthropic_messages"]
      }
    ],
    id: "zai-global-coding",
    name: "Z.ai (Global) - Coding Plan"
  },
  {
    aliases: ["z.ai", "zai", "z ai", "z-ai", "glm global"],
    defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
    endpoints: [
      {
        baseUrl: "https://api.z.ai/api/paas/v4",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "zai-global-general",
    name: "Z.ai (Global) - General Endpoint"
  },
  {
    aliases: ["mistral"],
    endpoints: [
      {
        baseUrl: "https://api.mistral.ai/v1",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "mistral",
    name: "Mistral"
  },
  {
    aliases: ["kimi", "moonshot"],
    defaultModels: ["moonshot-v1-8k"],
    endpoints: [
      {
        baseUrl: "https://api.moonshot.cn/v1",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "moonshot",
    name: "Moonshot Kimi"
  },
  {
    aliases: ["qwen", "dashscope", "bailian", "alibaba"],
    endpoints: [
      {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "bailian",
    name: "Alibaba Bailian"
  },
  {
    aliases: ["siliconflow"],
    endpoints: [
      {
        baseUrl: "https://api.siliconflow.cn/v1",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "siliconflow",
    name: "SiliconFlow"
  }
];

export function findProviderPreset(id: string | undefined): ProviderPreset | undefined {
  if (!id || id === customProviderPresetId) {
    return undefined;
  }
  return providerPresets.find((preset) => preset.id === id);
}

export function findProviderPresetByBaseUrl(baseUrl: string): ProviderPreset | undefined {
  const normalized = normalizePresetUrl(baseUrl);
  if (!normalized) {
    return undefined;
  }

  return providerPresets.find((preset) =>
    preset.endpoints.some((endpoint) => normalized.startsWith(normalizePresetUrl(endpoint.baseUrl)))
  );
}

export function primaryProviderPresetEndpoint(preset: ProviderPreset): ProviderPresetEndpoint | undefined {
  return preset.endpoints[0];
}

function normalizePresetUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}
