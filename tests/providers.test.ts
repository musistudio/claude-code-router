import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { validateConfig } from '../src/utils/configValidator';
import { Config, Provider } from '../src/types';

describe('Provider Configuration', () => {
  describe('Provider Validation', () => {
    it('should validate a valid provider configuration', () => {
      const provider: Provider = {
        name: 'test-provider',
        api_base_url: 'https://api.test.com/v1/chat/completions',
        api_key: 'sk-test123',
        models: ['model1', 'model2'],
      };

      const config: Config = {
        Providers: [provider],
        Router: {
          default: 'test-provider,model1',
          background: '',
          think: '',
          longContext: '',
          longContextThreshold: 60000,
          webSearch: '',
        },
        APIKEY: 'test-api-key-123456',
        HOST: '0.0.0.0',
        API_TIMEOUT_MS: 600000,
      };

      const result = validateConfig(config);
      if (!result.valid) {
        console.log('Test 1 - Validation errors:', result.errors);
      }
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate provider with transformer', () => {
      const provider: Provider = {
        name: 'test-provider',
        api_base_url: 'https://api.test.com/v1/chat/completions',
        api_key: 'sk-test123',
        models: ['model1', 'model2'],
        transformer: {
          use: ['openrouter'],
        },
      };

      const config: Config = {
        Providers: [provider],
        Router: {
          default: 'test-provider,model1',
          background: '',
          think: '',
          longContext: '',
          longContextThreshold: 60000,
          webSearch: '',
        },
        APIKEY: 'test-api-key-123456',
        HOST: '0.0.0.0',
        API_TIMEOUT_MS: 600000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate provider with complex transformer', () => {
      const provider: Provider = {
        name: 'test-provider',
        api_base_url: 'https://api.test.com/v1/chat/completions',
        api_key: 'sk-test123',
        models: ['model1', 'model2'],
        transformer: {
          use: ['tooluse', ['maxtoken', { max_tokens: 16384 }]],
          model1: {
            use: ['reasoning'],
          },
        },
      };

      const config: Config = {
        Providers: [provider],
        Router: {
          default: 'test-provider,model1',
          background: '',
          think: '',
          longContext: '',
          longContextThreshold: 60000,
          webSearch: '',
        },
        APIKEY: 'test-api-key-123456',
        HOST: '0.0.0.0',
        API_TIMEOUT_MS: 600000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject provider without required fields', () => {
      const invalidProvider: any = {
        name: 'test-provider',
        // Missing api_base_url, api_key, models
      };

      const config: any = {
        Providers: [invalidProvider],
        Router: {
          default: '',
          background: '',
          think: '',
          longContext: '',
          longContextThreshold: 60000,
          webSearch: '',
        },
        APIKEY: 'test-api-key-123456',
        HOST: '0.0.0.0',
        API_TIMEOUT_MS: 600000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors?.length || 0).toBeGreaterThan(0);
    });
  });

  describe('Provider Mock Tests', () => {
    it('should mock OpenRouter provider', () => {
      const openRouterProvider: Provider = {
        name: 'openrouter',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        api_key: 'sk-or-v1-test',
        models: [
          'google/gemini-2.5-pro-preview',
          'anthropic/claude-sonnet-4',
          'anthropic/claude-3.5-sonnet',
        ],
        transformer: {
          use: ['openrouter'],
        },
      };

      expect(openRouterProvider.name).toBe('openrouter');
      expect(openRouterProvider.models).toContain('anthropic/claude-3.5-sonnet');
      expect(openRouterProvider.transformer?.use).toContain('openrouter');
    });

    it('should mock DeepSeek provider', () => {
      const deepSeekProvider: Provider = {
        name: 'deepseek',
        api_base_url: 'https://api.deepseek.com/chat/completions',
        api_key: 'sk-deepseek-test',
        models: ['deepseek-chat', 'deepseek-reasoner'],
        transformer: {
          use: ['deepseek'],
          'deepseek-chat': {
            use: ['tooluse'],
          },
        },
      };

      expect(deepSeekProvider.name).toBe('deepseek');
      expect(deepSeekProvider.models).toContain('deepseek-chat');
      expect(deepSeekProvider.transformer?.['deepseek-chat']).toBeDefined();
    });

    it('should mock Ollama provider', () => {
      const ollamaProvider: Provider = {
        name: 'ollama',
        api_base_url: 'http://localhost:11434/v1/chat/completions',
        api_key: 'ollama',
        models: ['qwen2.5-coder:latest', 'llama3:latest'],
      };

      expect(ollamaProvider.name).toBe('ollama');
      expect(ollamaProvider.api_base_url).toContain('localhost');
      expect(ollamaProvider.transformer).toBeUndefined();
    });

    it('should mock Gemini provider', () => {
      const geminiProvider: Provider = {
        name: 'gemini',
        api_base_url: 'https://generativelanguage.googleapis.com/v1beta/models/',
        api_key: 'AIza-test-key',
        models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        transformer: {
          use: ['gemini'],
        },
      };

      expect(geminiProvider.name).toBe('gemini');
      expect(geminiProvider.models).toContain('gemini-2.5-flash');
      expect(geminiProvider.transformer?.use).toContain('gemini');
    });
  });

  describe('Router Configuration', () => {
    it('should validate router with provider references', () => {
      const config: Config = {
        Providers: [
          {
            name: 'provider1',
            api_base_url: 'https://api1.test.com',
            api_key: 'key1',
            models: ['model1', 'model2'],
          },
          {
            name: 'provider2',
            api_base_url: 'https://api2.test.com',
            api_key: 'key2',
            models: ['model3'],
          },
        ],
        Router: {
          default: 'provider1,model1',
          background: 'provider2,model3',
          think: 'provider1,model2',
          longContext: 'provider1,model1',
          longContextThreshold: 100000,
          webSearch: 'provider2,model3',
        },
        APIKEY: 'test-api-key-123456',
        HOST: '0.0.0.0',
        API_TIMEOUT_MS: 600000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should handle empty router routes', () => {
      const config: Config = {
        Providers: [
          {
            name: 'provider1',
            api_base_url: 'https://api.test.com',
            api_key: 'key1',
            models: ['model1'],
          },
        ],
        Router: {
          default: 'provider1,model1',
          background: '',
          think: '',
          longContext: '',
          longContextThreshold: 60000,
          webSearch: '',
        },
        APIKEY: 'test-api-key-123456',
        HOST: '0.0.0.0',
        API_TIMEOUT_MS: 600000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });
});
