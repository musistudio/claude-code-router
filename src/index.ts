import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { initConfig, initDir } from './utils';
import { createServer } from './server';
import { router } from './utils/router';
import { apiKeyAuth } from './middleware/auth';
import { cleanupPidFile, isServiceRunning, savePid } from './utils/processCheck';
import { CONFIG_FILE } from './constants';
import { logger, loggers, enableDebugMode } from './utils/logger';
import { validateConfigOrThrow, ConfigWatcher, migrateConfig } from './utils/configValidator';
import { circuitBreaker, retryWithBackoff, ApiError } from './utils/errorHandler';

async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, '.claude.json');
  if (!existsSync(configPath)) {
    const userID = Array.from({ length: 64 }, () => Math.random().toString(16)[2]).join('');
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: 'enabled',
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: '1.0.17',
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
  providers?: any[];
  transformers?: Record<string, any>;
}

async function run(options: RunOptions = {}) {
  // Check if service is already running
  if (isServiceRunning()) {
    console.log('✅ Service is already running in the background.');
    return;
  }

  await initializeClaudeConfig();
  await initDir();
  let config = await initConfig();

  // Migrate old config format if needed
  config = migrateConfig(config);

  // Validate configuration
  try {
    validateConfigOrThrow(config);
  } catch (error) {
    logger.error('Configuration validation failed', { error });
    throw error;
  }

  // Enable debug mode if configured
  if (config.LOG_LEVEL === 'debug') {
    enableDebugMode();
  }

  // Merge command line options with config
  if (options.providers && options.providers.length > 0) {
    // Merge providers from command line with existing providers
    const existingProviders = config.Providers || config.providers || [];
    for (const newProvider of options.providers) {
      // Apply transformer if specified
      if (options.transformers && options.transformers[newProvider.name]) {
        newProvider.transformer = options.transformers[newProvider.name];
      }

      // Check if provider already exists and update it
      const existingIndex = existingProviders.findIndex((p: any) => p.name === newProvider.name);
      if (existingIndex >= 0) {
        existingProviders[existingIndex] = { ...existingProviders[existingIndex], ...newProvider };
      } else {
        existingProviders.push(newProvider);
      }
    }
    config.Providers = existingProviders;
    config.providers = existingProviders; // Support both cases
  }

  let HOST = config.HOST;

  if (config.HOST && !config.APIKEY) {
    HOST = '127.0.0.1';
    console.warn('⚠️ API key is not set. HOST is forced to 127.0.0.1.');
  }

  const port = config.PORT || 3456;

  // Use port from environment variable if set (for background process)
  const servicePort = process.env.SERVICE_PORT ? parseInt(process.env.SERVICE_PORT, 10) : port;

  logger.debug('Server configuration', { HOST, port: servicePort });

  // Save the PID of the background process
  savePid(process.pid);

  // Set up configuration hot reload
  const configWatcher = new ConfigWatcher(CONFIG_FILE, async newConfig => {
    try {
      config = migrateConfig(newConfig);
      validateConfigOrThrow(config);
      logger.info('Configuration reloaded successfully');

      // Update server configuration
      // Note: Some changes may require server restart
      if (newConfig.LOG_LEVEL) {
        logger.level = newConfig.LOG_LEVEL;
      }
    } catch (error) {
      logger.error('Failed to reload configuration', { error });
    }
  });

  if (config.HOT_RELOAD !== false) {
    configWatcher.start();
  }

  // Handle SIGINT (Ctrl+C) to clean up
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    configWatcher.stop();
    cleanupPidFile();
    process.exit(0);
  });

  // Handle SIGTERM to clean up
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    configWatcher.stop();
    cleanupPidFile();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', error => {
    logger.error('Uncaught exception', { error });
    configWatcher.stop();
    cleanupPidFile();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
  });

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      // ...config,
      providers: config.Providers || config.providers,
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(homedir(), '.claude-code-router', 'claude-code-router.log'),
    },
  });

  // Add error handling middleware
  server.addHook('onError', async (request, reply, error) => {
    loggers.server.error('Request error', {
      method: request.method,
      url: request.url,
      error: error.message,
      stack: error.stack,
    });

    // Record failure for circuit breaker if applicable
    if (request.body?.model) {
      const [provider] = request.body.model.split(',');
      circuitBreaker.recordFailure(provider);
    }
  });

  // Add response logging
  server.addHook('onSend', async (request, reply, payload) => {
    const responseTime = Date.now() - (request as any).startTime;
    loggers.server.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime}ms`,
    });

    // Record success for circuit breaker if applicable
    if (reply.statusCode < 400 && request.body?.model) {
      const [provider] = request.body.model.split(',');
      circuitBreaker.recordSuccess(provider);
    }

    return payload;
  });

  // Add request timing
  server.addHook('onRequest', async request => {
    (request as any).startTime = Date.now();
  });

  server.addHook('preHandler', apiKeyAuth(config));
  server.addHook('preHandler', async (req, reply) => router(req, reply, config));

  server.start();

  // Display full configuration on start
  console.log('\n🚀 Claude Code Router Configuration:');
  console.log('=====================================');
  console.log(`📡 Server: http://${HOST}:${servicePort}`);
  console.log(`📝 Log Level: ${config.LOG_LEVEL || 'info'}`);
  console.log(`⏱️  API Timeout: ${config.API_TIMEOUT_MS || 600000}ms`);

  if (config.Providers && config.Providers.length > 0) {
    console.log('\n📦 Providers:');
    config.Providers.forEach((provider: any, index: number) => {
      console.log(`\n  ${index + 1}. ${provider.name}`);
      console.log(`     URL: ${provider.api_base_url}`);
      console.log(`     Models: ${provider.models.join(', ')}`);

      if (provider.transformer) {
        console.log(`     Transformers:`);
        if (provider.transformer.use) {
          const transformerList = provider.transformer.use
            .map((t: any) => {
              if (Array.isArray(t)) {
                return `${t[0]} (with options)`;
              }
              return t;
            })
            .join(', ');
          console.log(`       - Global: ${transformerList}`);
        }

        // Show model-specific transformers
        Object.keys(provider.transformer).forEach(key => {
          if (key !== 'use' && provider.models.includes(key)) {
            const modelTransformers = provider.transformer[key].use
              .map((t: any) => {
                if (Array.isArray(t)) {
                  return `${t[0]} (with options)`;
                }
                return t;
              })
              .join(', ');
            console.log(`       - ${key}: ${modelTransformers}`);
          }
        });
      }
    });
  }

  if (config.Router) {
    console.log('\n🔀 Routing Rules:');
    Object.entries(config.Router).forEach(([key, value]) => {
      if (key !== 'longContextThreshold') {
        console.log(`   ${key}: ${value}`);
      }
    });
    if (config.Router.longContextThreshold) {
      console.log(`   Long Context Threshold: ${config.Router.longContextThreshold} tokens`);
    }
  }

  if (config.CUSTOM_ROUTER_PATH) {
    console.log(`\n🔧 Custom Router: ${config.CUSTOM_ROUTER_PATH}`);
  }

  console.log('\n=====================================\n');

  logger.info('Claude Code Router started', {
    host: HOST,
    port: servicePort,
    providers: config.Providers?.length || 0,
    logLevel: config.LOG_LEVEL || 'info',
  });
}

export { run };
// run();
