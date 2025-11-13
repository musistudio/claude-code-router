/**
 * Filesystem Mock Utilities
 */
import { vol } from 'memfs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

/**
 * Create a mock filesystem with common directories
 */
export function createMockFilesystem(customFiles: Record<string, string> = {}) {
  const homeDir = homedir();
  const configDir = join(homeDir, '.claude-code-router');
  const logDir = join(configDir, 'logs');
  const pluginsDir = join(configDir, 'plugins');

  const defaultFiles = {
    // Default config file
    [join(configDir, 'config.json')]: JSON.stringify({
      PORT: 3456,
      APIKEY: 'test-api-key',
      Providers: [
        {
          name: 'test-provider',
          baseURL: 'http://test.com',
          apiKey: 'test-key',
          models: ['test-model'],
        },
      ],
      Router: {
        default: 'test-provider,test-model',
      },
    }, null, 2),

    // Default log file
    [join(logDir, 'app.log')]: 'Test log entry\n',

    // PID file
    [join(configDir, '.claude-code-router.pid')]: '12345',

    // Reference count file
    [join(tmpdir(), 'claude-code-reference-count.txt')]: '1',
  };

  vol.reset();
  vol.fromJSON({
    ...defaultFiles,
    ...customFiles,
  });

  return vol;
}

/**
 * Get the mock config file path
 */
export function getMockConfigPath(): string {
  return join(homedir(), '.claude-code-router', 'config.json');
}

/**
 * Get the mock log directory path
 */
export function getMockLogDir(): string {
  return join(homedir(), '.claude-code-router', 'logs');
}

/**
 * Create a mock config object
 */
export function createMockConfig(overrides: Record<string, any> = {}) {
  return {
    PORT: 3456,
    APIKEY: 'test-api-key',
    LOG: false,
    Providers: [
      {
        name: 'test-provider',
        baseURL: 'http://test.com',
        apiKey: 'test-key',
        models: ['test-model'],
      },
    ],
    Router: {
      default: 'test-provider,test-model',
      background: 'test-provider,test-model',
      longContext: 'test-provider,test-model',
      think: 'test-provider,test-model',
      webSearch: 'test-provider,test-model',
      longContextThreshold: 60000,
    },
    ...overrides,
  };
}
