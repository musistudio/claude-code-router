import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { logger } from './logger';
import { ConfigurationError } from './errorHandler';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { resolveSecurePath, validateFilePath } from './pathSecurity';

const ajv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(ajv);

// Configuration schema
const configSchema = {
  type: 'object',
  properties: {
    PROXY_URL: {
      type: 'string',
      format: 'uri',
      description: 'HTTP proxy URL for API requests',
    },
    LOG: {
      type: 'boolean',
      default: false,
      description: 'Enable logging',
    },
    LOG_LEVEL: {
      type: 'string',
      enum: ['error', 'warn', 'info', 'debug'],
      default: 'info',
      description: 'Logging level',
    },
    APIKEY: {
      type: 'string',
      minLength: 10,
      description: 'API key for authentication',
    },
    HOST: {
      type: 'string',
      default: '127.0.0.1',
      description: 'Server host address',
    },
    PORT: {
      type: 'number',
      minimum: 1,
      maximum: 65535,
      default: 3456,
      description: 'Server port',
    },
    API_TIMEOUT_MS: {
      type: 'number',
      minimum: 1000,
      maximum: 3600000,
      default: 600000,
      description: 'API request timeout in milliseconds',
    },
    CUSTOM_ROUTER_PATH: {
      type: 'string',
      description: 'Path to custom router script',
    },
    Providers: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'api_base_url', 'api_key', 'models'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            description: 'Provider name',
          },
          api_base_url: {
            type: 'string',
            format: 'uri',
            description: 'API base URL',
          },
          api_key: {
            type: 'string',
            description: 'API key for this provider',
          },
          models: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string',
              minLength: 1,
            },
            description: 'Available models',
          },
          transformer: {
            type: 'object',
            properties: {
              use: {
                type: 'array',
                items: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'array',
                      minItems: 2,
                      maxItems: 2,
                      items: [
                        { type: 'string' },
                        { type: 'object' },
                      ],
                    },
                  ],
                },
              },
            },
            additionalProperties: {
              type: 'object',
              properties: {
                use: {
                  type: 'array',
                  items: {
                    oneOf: [
                      { type: 'string' },
                      {
                        type: 'array',
                        minItems: 2,
                        maxItems: 2,
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    Router: {
      type: 'object',
      required: ['default'],
      properties: {
        default: {
          type: 'string',
          pattern: '^[^,]+,[^,]+$',
          description: 'Default provider,model',
        },
        background: {
          type: 'string',
          pattern: '^[^,]+,[^,]+$',
          description: 'Background tasks provider,model',
        },
        think: {
          type: 'string',
          pattern: '^[^,]+,[^,]+$',
          description: 'Thinking/reasoning provider,model',
        },
        longContext: {
          type: 'string',
          pattern: '^[^,]+,[^,]+$',
          description: 'Long context provider,model',
        },
        longContextThreshold: {
          type: 'number',
          minimum: 1000,
          default: 60000,
          description: 'Token threshold for long context',
        },
        webSearch: {
          type: 'string',
          pattern: '^[^,]+,[^,]+$',
          description: 'Web search provider,model',
        },
      },
    },
    transformers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path'],
        properties: {
          path: {
            type: 'string',
            description: 'Path to transformer module',
          },
          options: {
            type: 'object',
            description: 'Transformer options',
          },
        },
      },
    },
  },
  required: ['Providers', 'Router'],
  additionalProperties: false,
};

const validate = ajv.compile(configSchema);

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export function validateConfig(config: any): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Run JSON schema validation
  const valid = validate(config);
  if (!valid && validate.errors) {
    result.valid = false;
    result.errors = validate.errors.map((err) => {
      const field = err.instancePath || 'root';
      return `${field}: ${err.message}`;
    });
  }

  // Additional business logic validation
  if (result.valid) {
    // Check if APIKEY is set when HOST is not localhost
    if (config.HOST && config.HOST !== '127.0.0.1' && config.HOST !== 'localhost' && !config.APIKEY) {
      result.warnings!.push(
        'HOST is set to a non-localhost address but APIKEY is not set. This may be a security risk.'
      );
    }

    // Validate provider references in Router
    const providerNames = new Set(config.Providers.map((p: any) => p.name));
    const routerEntries = Object.entries(config.Router).filter(([key]) => key !== 'longContextThreshold');
    
    for (const [routeType, routeValue] of routerEntries) {
      if (typeof routeValue === 'string') {
        const [provider, model] = routeValue.split(',');
        if (!providerNames.has(provider)) {
          result.valid = false;
          result.errors!.push(`Router.${routeType}: Provider '${provider}' not found in Providers list`);
        } else {
          // Check if model exists in provider
          const providerConfig = config.Providers.find((p: any) => p.name === provider);
          if (providerConfig && !providerConfig.models.includes(model)) {
            result.warnings!.push(
              `Router.${routeType}: Model '${model}' not found in provider '${provider}' models list`
            );
          }
        }
      }
    }

    // Validate custom router path
    if (config.CUSTOM_ROUTER_PATH) {
      try {
        const resolvedPath = resolveSecurePath(config.CUSTOM_ROUTER_PATH);
        if (!validateFilePath(resolvedPath)) {
          result.valid = false;
          result.errors!.push(`CUSTOM_ROUTER_PATH: File not found or not readable at ${resolvedPath}`);
        }
      } catch (error: any) {
        result.valid = false;
        result.errors!.push(`CUSTOM_ROUTER_PATH: ${error.message}`);
      }
    }

    // Validate transformer paths
    if (config.transformers) {
      for (const transformer of config.transformers) {
        try {
          const resolvedPath = resolveSecurePath(transformer.path);
          if (!validateFilePath(resolvedPath)) {
            result.valid = false;
            result.errors!.push(`Transformer path not found or not readable: ${resolvedPath}`);
          }
        } catch (error: any) {
          result.valid = false;
          result.errors!.push(`Transformer path error: ${error.message}`);
        }
      }
    }
  }

  return result;
}

// Configuration file watcher for hot reload
export class ConfigWatcher {
  private configPath: string;
  private lastHash: string | null = null;
  private watcher: fs.FSWatcher | null = null;
  private onChange: (config: any) => void;

  constructor(configPath: string, onChange: (config: any) => void) {
    this.configPath = configPath;
    this.onChange = onChange;
  }

  start() {
    if (this.watcher) {
      this.stop();
    }

    // Initial hash
    this.lastHash = this.getFileHash();

    // Watch for changes
    this.watcher = fs.watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        this.checkForChanges();
      }
    });

    logger.info(`Configuration watcher started for ${this.configPath}`);
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info('Configuration watcher stopped');
    }
  }

  private getFileHash(): string | null {
    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      return createHash('md5').update(content).digest('hex');
    } catch (error) {
      logger.error('Failed to read config file for hashing', { error });
      return null;
    }
  }

  private checkForChanges() {
    const currentHash = this.getFileHash();
    if (currentHash && currentHash !== this.lastHash) {
      this.lastHash = currentHash;
      
      try {
        const content = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(content);
        
        const validation = validateConfig(config);
        if (validation.valid) {
          logger.info('Configuration file changed and validated successfully');
          this.onChange(config);
        } else {
          logger.error('Configuration validation failed after change', {
            errors: validation.errors,
          });
        }
      } catch (error) {
        logger.error('Failed to parse configuration file after change', { error });
      }
    }
  }
}

// Helper to migrate old config format to new format
export function migrateConfig(oldConfig: any): any {
  const newConfig = { ...oldConfig };

  // Add default values for new fields
  if (!newConfig.LOG_LEVEL) {
    newConfig.LOG_LEVEL = 'info';
  }

  if (!newConfig.PORT) {
    newConfig.PORT = 3456;
  }

  // Migrate old logging field
  if (newConfig.LOG === true && !newConfig.LOG_LEVEL) {
    newConfig.LOG_LEVEL = 'info';
  }

  return newConfig;
}

// Validate and throw on error
export function validateConfigOrThrow(config: any): void {
  const validation = validateConfig(config);
  
  if (!validation.valid) {
    throw new ConfigurationError(
      `Configuration validation failed:\n${validation.errors!.join('\n')}`
    );
  }

  if (validation.warnings && validation.warnings.length > 0) {
    validation.warnings.forEach((warning) => {
      logger.warn(`Configuration warning: ${warning}`);
    });
  }
}