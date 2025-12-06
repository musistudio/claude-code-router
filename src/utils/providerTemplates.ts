import { ProviderType } from '../types/wizard.types';
import type { ProviderConfig } from '../types/wizard.types';

export interface ProviderTemplate {
  providerType: ProviderType;
  config: ProviderConfig;
  apiKeyPrompt: string;
  apiKeyInstructions: string;
}

export const PROVIDER_TEMPLATES: Record<ProviderType, ProviderTemplate> = {
  [ProviderType.GEMINI]: {
    providerType: ProviderType.GEMINI,
    config: {
      name: 'Gemini',
      api_base_url: 'https://generativelanguage.googleapis.com/v1beta',
      models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'],
    },
    apiKeyPrompt: 'Enter your Gemini API key:',
    apiKeyInstructions: 'Get your API key at: https://makersuite.google.com/app/apikey',
  },
  [ProviderType.QWEN]: {
    providerType: ProviderType.QWEN,
    config: {
      name: 'Qwen',
      api_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    },
    apiKeyPrompt: 'Enter your Qwen API key:',
    apiKeyInstructions: 'Get your API key at: https://dashscope.console.aliyun.com/',
  },
};
