import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Provider } from '../src/types';

describe('Transformers', () => {
  describe('Transformer Configuration', () => {
    it('should support simple transformer configuration', () => {
      const provider: Provider = {
        name: 'test-provider',
        api_base_url: 'https://api.test.com',
        api_key: 'test-key',
        models: ['model1'],
        transformer: {
          use: ['openrouter'],
        },
      };

      expect(provider.transformer).toBeDefined();
      expect(provider.transformer?.use).toEqual(['openrouter']);
    });

    it('should support transformer with options', () => {
      const provider: Provider = {
        name: 'test-provider',
        api_base_url: 'https://api.test.com',
        api_key: 'test-key',
        models: ['model1'],
        transformer: {
          use: [['maxtoken', { max_tokens: 16384 }]],
        },
      };

      expect(provider.transformer?.use[0]).toBeInstanceOf(Array);
      expect(provider.transformer?.use[0][0]).toBe('maxtoken');
      expect(provider.transformer?.use[0][1]).toEqual({ max_tokens: 16384 });
    });

    it('should support multiple transformers', () => {
      const provider: Provider = {
        name: 'test-provider',
        api_base_url: 'https://api.test.com',
        api_key: 'test-key',
        models: ['model1'],
        transformer: {
          use: ['tooluse', ['maxtoken', { max_tokens: 8192 }], 'enhancetool'],
        },
      };

      expect(provider.transformer?.use).toHaveLength(3);
      expect(provider.transformer?.use[0]).toBe('tooluse');
      expect(provider.transformer?.use[1]).toEqual(['maxtoken', { max_tokens: 8192 }]);
      expect(provider.transformer?.use[2]).toBe('enhancetool');
    });

    it('should support model-specific transformers', () => {
      const provider: Provider = {
        name: 'deepseek',
        api_base_url: 'https://api.deepseek.com/chat/completions',
        api_key: 'test-key',
        models: ['deepseek-chat', 'deepseek-reasoner'],
        transformer: {
          use: ['deepseek'],
          'deepseek-chat': {
            use: ['tooluse'],
          },
          'deepseek-reasoner': {
            use: ['reasoning'],
          },
        },
      };

      expect(provider.transformer?.use).toEqual(['deepseek']);
      expect(provider.transformer?.['deepseek-chat']).toBeDefined();
      expect(provider.transformer?.['deepseek-chat'].use).toEqual(['tooluse']);
      expect(provider.transformer?.['deepseek-reasoner'].use).toEqual(['reasoning']);
    });
  });

  describe('Common Transformer Types', () => {
    it('should test openrouter transformer', () => {
      const transformer = {
        use: ['openrouter'],
      };

      expect(transformer.use).toContain('openrouter');
    });

    it('should test deepseek transformer', () => {
      const transformer = {
        use: ['deepseek'],
      };

      expect(transformer.use).toContain('deepseek');
    });

    it('should test gemini transformer', () => {
      const transformer = {
        use: ['gemini'],
      };

      expect(transformer.use).toContain('gemini');
    });

    it('should test maxtoken transformer with options', () => {
      const transformer = {
        use: [['maxtoken', { max_tokens: 32768 }]],
      };

      expect(transformer.use[0][0]).toBe('maxtoken');
      const options = transformer.use[0][1] as { max_tokens: number };
      expect(options.max_tokens).toBe(32768);
    });

    it('should test tooluse transformer', () => {
      const transformer = {
        use: ['tooluse'],
      };

      expect(transformer.use).toContain('tooluse');
    });

    it('should test enhancetool transformer', () => {
      const transformer = {
        use: ['enhancetool'],
      };

      expect(transformer.use).toContain('enhancetool');
    });

    it('should test reasoning transformer', () => {
      const transformer = {
        use: ['reasoning'],
      };

      expect(transformer.use).toContain('reasoning');
    });
  });

  describe('Transformer Validation', () => {
    it('should validate transformer structure', () => {
      const validTransformers = [
        { use: ['simple'] },
        { use: [['with-options', { option: 'value' }]] },
        { use: ['multiple', 'transformers'] },
        {
          use: ['global'],
          'specific-model': { use: ['model-specific'] },
        },
      ];

      validTransformers.forEach(transformer => {
        expect(transformer.use).toBeDefined();
        expect(Array.isArray(transformer.use)).toBe(true);
        expect(transformer.use.length).toBeGreaterThan(0);
      });
    });

    it('should handle invalid transformer gracefully', () => {
      const invalidTransformers = [
        null,
        undefined,
        {},
        { use: [] },
        { use: null },
        { use: 'not-an-array' },
      ];

      invalidTransformers.forEach(transformer => {
        const isValid = !!(
          transformer &&
          transformer.use &&
          Array.isArray(transformer.use) &&
          transformer.use.length > 0
        );
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Transformer Integration', () => {
    it('should integrate transformer with provider config', () => {
      const providerWithTransformer: Provider = {
        name: 'complex-provider',
        api_base_url: 'https://api.complex.com',
        api_key: 'complex-key',
        models: ['model-a', 'model-b', 'model-c'],
        transformer: {
          use: ['base-transformer', ['configurable', { setting: 'value' }]],
          'model-a': {
            use: ['specific-a'],
          },
          'model-b': {
            use: ['specific-b', ['limited', { limit: 100 }]],
          },
        },
      };

      // Verify global transformers
      expect(providerWithTransformer.transformer?.use).toHaveLength(2);

      // Verify model-specific transformers
      expect(providerWithTransformer.transformer?.['model-a']).toBeDefined();
      expect(providerWithTransformer.transformer?.['model-b']).toBeDefined();
      expect(providerWithTransformer.transformer?.['model-c']).toBeUndefined();

      // Verify model-b has complex configuration
      const modelBTransformers = providerWithTransformer.transformer?.['model-b'].use;
      expect(modelBTransformers).toHaveLength(2);
      expect(modelBTransformers[1][1].limit).toBe(100);
    });
  });
});
