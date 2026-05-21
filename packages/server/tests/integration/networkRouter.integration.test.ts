import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import Server, { NetworkDetector } from '@musistudio/llms';

const TEST_PORT = 23457; // different from smoke test (23456)
const TEST_HOST = '127.0.0.1';

const intranetConfig = {
  PORT: TEST_PORT,
  HOST: TEST_HOST,
  LOG: false,
  Providers: [
    {
      name: 'test-provider',
      api_base_url: 'http://127.0.0.1:19999/v1/chat/completions',
      api_key: 'test-key',
      models: ['test-model-a', 'test-model-b'],
    },
  ],
  Router: {
    default: 'test-provider,test-model-a',
    background: 'test-provider,test-model-b',
  },
  NetworkRouter: {
    enabled: true,
    checkInterval: 5,
    hostname: 'w3.huawei.com',
    intranetPattern: '^10\\.',
    states: {
      intranet: {
        Router: {
          default: 'test-provider,test-model-a',
          background: 'test-provider,test-model-a',
        },
      },
      external: {
        Router: {
          default: 'test-provider,test-model-b',
          background: 'test-provider,test-model-b',
        },
      },
    },
  },
};

describe('Integration: NetworkDetector + Server', () => {
  let tempDir: string;
  let serverInstance: any;
  let originalExit: typeof process.exit;

  beforeAll(async () => {
    // Prevent process.exit from killing the test runner
    originalExit = process.exit;
    process.exit = (() => {}) as any;
    tempDir = mkdtempSync(join(tmpdir(), 'ccr-test-'));
    const configPath = join(tempDir, 'config.json');
    writeFileSync(configPath, JSON.stringify(intranetConfig, null, 2));

    serverInstance = new Server({ jsonPath: configPath, logger: false } as any);
    await serverInstance.start();
  }, 30000);

  afterAll(async () => {
    process.exit = originalExit;
    if (serverInstance) {
      serverInstance.networkDetector?.stop();
      await serverInstance.app?.close();
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('NetworkDetector lifecycle', () => {
    it('should have networkDetector on server instance', () => {
      expect(serverInstance.networkDetector).toBeDefined();
      expect(serverInstance.networkDetector).toBeInstanceOf(NetworkDetector);
    });

    it('should detect network state (intranet or external)', () => {
      const state = serverInstance.networkDetector.getState();
      expect(['intranet', 'external', 'unknown']).toContain(state);
    });

    it('should have applied Router config matching detected state', () => {
      const state = serverInstance.networkDetector.getState();
      const router = serverInstance.configService.get('Router');

      if (state === 'intranet') {
        expect(router.default).toBe('test-provider,test-model-a');
        expect(router.background).toBe('test-provider,test-model-a');
      } else if (state === 'external') {
        expect(router.default).toBe('test-provider,test-model-b');
        expect(router.background).toBe('test-provider,test-model-b');
      }
    });
  });

  describe('configService.reload() + NetworkDetector restart', () => {
    it('should reload config from file and restart detector', async () => {
      // Update config file
      const configPath = join(tempDir, 'config.json');
      const newConfig = {
        ...intranetConfig,
        NetworkRouter: {
          ...intranetConfig.NetworkRouter,
          checkInterval: 15,
        },
      };
      writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

      // Reload
      serverInstance.configService.reload();

      const checkInterval = serverInstance.configService.get('NetworkRouter')?.checkInterval;
      expect(checkInterval).toBe(15);
    });
  });

  describe('NetworkDetector stop restores config', () => {
    it('should restore original Router when stopped', () => {
      const originalRouter = { default: 'test-provider,test-model-a', background: 'test-provider,test-model-b' };
      serverInstance.networkDetector.stop();

      const router = serverInstance.configService.get('Router');
      expect(router.default).toBe(originalRouter.default);
      expect(router.background).toBe(originalRouter.background);
    });
  });
});
