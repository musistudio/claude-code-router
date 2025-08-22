import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { resolveEnvVars, resolveEnvVarsInObject, redactApiKey } from '../src/utils/env-resolver';

describe('Environment Variable Resolver', () => {
  // Store original env vars to restore after tests
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    // Reset process.env for each test
    process.env = { ...originalEnv };
    // Set test environment variables
    process.env.TEST_API_KEY = 'sk-test123456789abcdef';
    process.env.OPENAI_API_KEY = 'sk-openai123456789abcdef';
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('resolveEnvVars', () => {
    it('should resolve $VAR format', () => {
      const result = resolveEnvVars('$TEST_API_KEY');
      expect(result).to.equal('sk-test123456789abcdef');
    });

    it('should resolve ${VAR} format', () => {
      const result = resolveEnvVars('${OPENAI_API_KEY}');
      expect(result).to.equal('sk-openai123456789abcdef');
    });

    it('should return literal strings unchanged when not env var pattern', () => {
      const literals = [
        'sk-literal123456789',
        'some-api-key-with-$-inside',
        '$PARTIAL_match_here',
        '${UNCLOSED_brace',
        'MISSING_DOLLAR_PREFIX}',
        '$lowercase_var',
        '${with-dashes}',
        'prefix-$TEST_API_KEY-suffix'
      ];

      literals.forEach(literal => {
        expect(resolveEnvVars(literal)).to.equal(literal);
      });
    });

    it('should throw error for missing environment variable', () => {
      expect(() => {
        resolveEnvVars('$MISSING_VAR');
      }).to.throw("Environment variable 'MISSING_VAR' is not set");
    });

    it('should preserve original string when throwOnMissing is false', () => {
      const result = resolveEnvVars('$MISSING_VAR', { throwOnMissing: false });
      expect(result).to.equal('$MISSING_VAR');
    });

    it('should preserve original string when resolveEnvVariables is false', () => {
      const result = resolveEnvVars('$TEST_API_KEY', { resolveEnvVariables: false });
      expect(result).to.equal('$TEST_API_KEY');
    });

    it('should handle empty environment variable', () => {
      process.env.EMPTY_VAR = '';
      expect(() => {
        resolveEnvVars('$EMPTY_VAR');
      }).to.throw("Environment variable 'EMPTY_VAR' is not set");
    });

    it('should handle whitespace-only environment variable', () => {
      process.env.WHITESPACE_VAR = '   ';
      // Whitespace is considered a valid value, should not throw
      const result = resolveEnvVars('$WHITESPACE_VAR');
      expect(result).to.equal('   ');
    });

    it('should handle special characters in environment variable value', () => {
      process.env.SPECIAL_VAR = 'sk-1234!@#$%^&*()';
      const result = resolveEnvVars('$SPECIAL_VAR');
      expect(result).to.equal('sk-1234!@#$%^&*()');
    });

    it('should only match exact environment variable patterns', () => {
      // These should NOT be resolved (not exact matches)
      const nonMatches = [
        'PREFIX_$TEST_API_KEY',  // Prefix before variable
        '$test_api_key',         // Lowercase (our pattern is uppercase only)
        '${TEST_API_KEY}_SUFFIX' // Suffix after brace
      ];

      nonMatches.forEach(str => {
        expect(resolveEnvVars(str)).to.equal(str);
      });
      
      // This one would be resolved if the env var existed, but it doesn't
      expect(() => {
        resolveEnvVars('$TEST_API_KEY_EXTRA');
      }).to.throw("Environment variable 'TEST_API_KEY_EXTRA' is not set");
    });
  });

  describe('resolveEnvVarsInObject', () => {
    it('should resolve environment variables in object values', () => {
      const input = {
        apiKey: '$TEST_API_KEY',
        otherKey: '${OPENAI_API_KEY}',
        literalValue: 'literal-string',
        numberValue: 123
      };

      const result = resolveEnvVarsInObject(input);

      expect(result).to.deep.equal({
        apiKey: 'sk-test123456789abcdef',
        otherKey: 'sk-openai123456789abcdef', 
        literalValue: 'literal-string',
        numberValue: 123
      });
    });

    it('should throw error with field context for missing variables', () => {
      const input = {
        validKey: '$TEST_API_KEY',
        invalidKey: '$MISSING_VAR'
      };

      expect(() => {
        resolveEnvVarsInObject(input);
      }).to.throw("Failed to resolve environment variable in field 'invalidKey'");
    });

    it('should preserve non-string values unchanged', () => {
      const input = {
        stringValue: '$TEST_API_KEY',
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
        undefinedValue: undefined,
        objectValue: { nested: 'value' }
      };

      const result = resolveEnvVarsInObject(input);

      expect(result).to.deep.equal({
        stringValue: 'sk-test123456789abcdef',
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
        undefinedValue: undefined,
        objectValue: { nested: 'value' }
      });
    });
  });

  describe('redactApiKey', () => {
    it('should redact long API keys', () => {
      const apiKey = 'sk-1234567890abcdefghijk';
      const result = redactApiKey(apiKey);
      expect(result).to.equal('sk-1****************hijk');
    });

    it('should redact short API keys completely', () => {
      expect(redactApiKey('short')).to.equal('***');
      expect(redactApiKey('12345678')).to.equal('***'); // exactly 8 chars
    });

    it('should handle empty string', () => {
      expect(redactApiKey('')).to.equal('***');
    });

    it('should handle very short strings', () => {
      expect(redactApiKey('a')).to.equal('***');
      expect(redactApiKey('ab')).to.equal('***');
    });

    it('should handle exact boundary length (9 chars)', () => {
      const result = redactApiKey('123456789');
      expect(result).to.equal('1234*6789');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical OpenAI API key format', () => {
      process.env.OPENAI_API_KEY = 'sk-proj-abc123def456ghi789jkl';
      const result = resolveEnvVars('$OPENAI_API_KEY');
      expect(result).to.equal('sk-proj-abc123def456ghi789jkl');
    });

    it('should handle provider configuration object', () => {
      process.env.OPENAI_KEY = 'sk-openai-key';
      process.env.ANTHROPIC_KEY = 'sk-ant-key';
      
      const config = {
        name: 'openai',
        api_base_url: 'https://api.openai.com/v1/responses',
        api_key: '$OPENAI_KEY',
        models: ['gpt-5']
      };

      const resolved = resolveEnvVarsInObject(config);

      expect(resolved.api_key).to.equal('sk-openai-key');
      expect(resolved.name).to.equal('openai');
      expect(resolved.api_base_url).to.equal('https://api.openai.com/v1/responses');
    });

    it('should not resolve API keys that happen to contain dollar signs', () => {
      // Real API key that happens to contain $ (shouldn't be resolved)
      const realApiKey = 'sk-1234$abcd$5678';
      expect(resolveEnvVars(realApiKey)).to.equal(realApiKey);
    });
  });
});