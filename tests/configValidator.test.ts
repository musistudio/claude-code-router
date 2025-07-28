import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { validateConfig, migrateConfig, ConfigWatcher } from '../src/utils/configValidator';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Configuration Validator', () => {
  describe('validateConfig', () => {
    it('should validate a minimal valid configuration', () => {
      const config = {
        Providers: [{
          name: 'test',
          api_base_url: 'https://api.test.com',
          api_key: 'test-key',
          models: ['model1'],
        }],
        Router: {
          default: 'test,model1',
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject configuration without providers', () => {
      const config = {
        Router: {
          default: 'test,model1',
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('root: must have required property \'Providers\'');
    });

    it('should reject configuration without router', () => {
      const config = {
        Providers: [{
          name: 'test',
          api_base_url: 'https://api.test.com',
          api_key: 'test-key',
          models: ['model1'],
        }],
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('root: must have required property \'Router\'');
    });

    it('should validate provider references in router', () => {
      const config = {
        Providers: [{
          name: 'provider1',
          api_base_url: 'https://api.test.com',
          api_key: 'test-key',
          models: ['model1'],
        }],
        Router: {
          default: 'provider2,model1', // Invalid provider
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Router.default: Provider \'provider2\' not found in Providers list');
    });

    it('should warn about models not in provider list', () => {
      const config = {
        Providers: [{
          name: 'provider1',
          api_base_url: 'https://api.test.com',
          api_key: 'test-key',
          models: ['model1'],
        }],
        Router: {
          default: 'provider1,model2', // Model not in list
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Router.default: Model \'model2\' not found in provider \'provider1\' models list');
    });

    it('should validate router entry format', () => {
      const config = {
        Providers: [{
          name: 'test',
          api_base_url: 'https://api.test.com',
          api_key: 'test-key',
          models: ['model1'],
        }],
        Router: {
          default: 'invalid-format', // Should be provider,model
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.includes('pattern'))).toBe(true);
    });

    it('should warn about non-localhost HOST without APIKEY', () => {
      const config = {
        HOST: '0.0.0.0',
        Providers: [{
          name: 'test',
          api_base_url: 'https://api.test.com',
          api_key: 'test-key',
          models: ['model1'],
        }],
        Router: {
          default: 'test,model1',
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('HOST is set to a non-localhost address but APIKEY is not set. This may be a security risk.');
    });
  });

  describe('migrateConfig', () => {
    it('should add default LOG_LEVEL if missing', () => {
      const oldConfig = {
        LOG: true,
      };

      const newConfig = migrateConfig(oldConfig);
      expect(newConfig.LOG_LEVEL).toBe('info');
    });

    it('should add default PORT if missing', () => {
      const oldConfig = {};

      const newConfig = migrateConfig(oldConfig);
      expect(newConfig.PORT).toBe(3456);
    });

    it('should preserve existing values', () => {
      const oldConfig = {
        LOG_LEVEL: 'debug',
        PORT: 8080,
        customField: 'value',
      };

      const newConfig = migrateConfig(oldConfig);
      expect(newConfig.LOG_LEVEL).toBe('debug');
      expect(newConfig.PORT).toBe(8080);
      expect(newConfig.customField).toBe('value');
    });
  });

  describe('ConfigWatcher', () => {
    const testConfigPath = path.join(os.tmpdir(), 'test-config.json');
    let watcher: ConfigWatcher;

    beforeEach(() => {
      // Create initial config file
      const config = {
        Providers: [{
          name: 'test',
          api_base_url: 'https://api.test.com',
          api_key: 'test-key',
          models: ['model1'],
        }],
        Router: {
          default: 'test,model1',
        },
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(config));
    });

    afterEach(() => {
      if (watcher) {
        watcher.stop();
      }
      if (fs.existsSync(testConfigPath)) {
        fs.unlinkSync(testConfigPath);
      }
    });

    it('should detect configuration changes', (done) => {
      let changeDetected = false;

      watcher = new ConfigWatcher(testConfigPath, (newConfig) => {
        changeDetected = true;
        expect(newConfig.Providers[0].api_key).toBe('new-key');
        done();
      });

      watcher.start();

      // Update config file after a delay
      setTimeout(() => {
        const updatedConfig = {
          Providers: [{
            name: 'test',
            api_base_url: 'https://api.test.com',
            api_key: 'new-key',
            models: ['model1'],
          }],
          Router: {
            default: 'test,model1',
          },
        };
        fs.writeFileSync(testConfigPath, JSON.stringify(updatedConfig));
      }, 100);
    });

    it('should not trigger onChange for invalid configuration', (done) => {
      let changeDetected = false;

      watcher = new ConfigWatcher(testConfigPath, () => {
        changeDetected = true;
      });

      watcher.start();

      // Write invalid config
      setTimeout(() => {
        fs.writeFileSync(testConfigPath, '{ invalid json }');
      }, 100);

      // Check that onChange was not called
      setTimeout(() => {
        expect(changeDetected).toBe(false);
        done();
      }, 200);
    });
  });
});