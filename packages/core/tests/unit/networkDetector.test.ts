import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkDetector } from '../../src/services/networkDetector';
import { ConfigService } from '../../src/services/config';

// Mock dns/promises
vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'dns/promises';

function createMockConfigService(config: Record<string, any>) {
  return {
    get: vi.fn((key: string) => config[key]),
    set: vi.fn(),
    reload: vi.fn(),
    getAll: vi.fn(() => config),
    has: vi.fn((key: string) => key in config),
  } as unknown as ConfigService;
}

function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };
}

describe('NetworkDetector', () => {
  let configService: ConfigService;
  let logger: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('start()', () => {
    it('should skip when NetworkRouter is not configured', async () => {
      configService = createMockConfigService({});
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('NetworkRouter enabled')
      );
      expect(detector.getState()).toBe('unknown');
    });

    it('should skip when enabled is false', async () => {
      configService = createMockConfigService({
        NetworkRouter: { enabled: false },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();

      expect(detector.getState()).toBe('unknown');
    });

    it('should detect intranet on start when DNS resolves to 10.x', async () => {
      (lookup as any).mockResolvedValue({ address: '10.3.42.43', family: 4 });
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          hostname: 'w3.huawei.com',
          checkInterval: 30,
          states: {
            intranet: {
              Router: { default: 'volcengine,deepseek-v3' },
            },
            external: {
              Router: { default: 'openrouter,claude-sonnet-4' },
            },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();

      expect(detector.getState()).toBe('intranet');
      expect(configService.set).toHaveBeenCalledWith('Router', {
        default: 'volcengine,deepseek-v3',
      });
    });

    it('should detect external on start when DNS resolution fails', async () => {
      (lookup as any).mockRejectedValue(new Error('ENOTFOUND'));
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          hostname: 'w3.huawei.com',
          checkInterval: 30,
          states: {
            intranet: {
              Router: { default: 'volcengine,deepseek-v3' },
            },
            external: {
              Router: { default: 'openrouter,claude-sonnet-4' },
            },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();

      expect(detector.getState()).toBe('external');
      expect(configService.set).toHaveBeenCalledWith('Router', {
        default: 'openrouter,claude-sonnet-4',
      });
    });
  });

  describe('detect() - periodic checks', () => {
    it('should switch to external when DNS starts failing after intranet', async () => {
      (lookup as any).mockResolvedValue({ address: '10.3.42.43', family: 4 });
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          checkInterval: 10,
          states: {
            intranet: {
              Router: { default: 'intranet,model' },
            },
            external: {
              Router: { default: 'external,model' },
            },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();
      expect(detector.getState()).toBe('intranet');

      // DNS starts failing (xgate disconnected)
      (lookup as any).mockRejectedValue(new Error('ENOTFOUND'));

      // Advance timer by checkInterval
      await vi.advanceTimersByTimeAsync(10000);

      expect(detector.getState()).toBe('external');
      expect(configService.set).toHaveBeenCalledWith('Router', {
        default: 'external,model',
      });
    });

    it('should switch to intranet when DNS resolves to 10.x after external', async () => {
      (lookup as any).mockRejectedValue(new Error('ENOTFOUND'));
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          checkInterval: 10,
          states: {
            intranet: {
              Router: { default: 'intranet,model' },
            },
            external: {
              Router: { default: 'external,model' },
            },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();
      expect(detector.getState()).toBe('external');

      // DNS starts resolving to intranet (xgate connected)
      (lookup as any).mockResolvedValue({ address: '10.3.42.43', family: 4 });

      await vi.advanceTimersByTimeAsync(10000);

      expect(detector.getState()).toBe('intranet');
    });

    it('should not call set when state does not change', async () => {
      (lookup as any).mockResolvedValue({ address: '10.3.42.43', family: 4 });
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          checkInterval: 10,
          states: {
            intranet: { Router: { default: 'intranet,model' } },
            external: { Router: { default: 'external,model' } },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();
      const setCallCount = (configService.set as any).mock.calls.length;

      // Same state on next check
      await vi.advanceTimersByTimeAsync(10000);

      // No additional set calls
      expect((configService.set as any).mock.calls.length).toBe(setCallCount);
    });
  });

  describe('stop()', () => {
    it('should restore original Router config on stop', async () => {
      (lookup as any).mockResolvedValue({ address: '10.3.42.43', family: 4 });
      const originalRouter = { default: 'original,default' };
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          checkInterval: 30,
          states: {
            intranet: { Router: { default: 'intranet,model' } },
            external: { Router: { default: 'external,model' } },
          },
        },
        Router: originalRouter,
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();
      detector.stop();

      // Should restore original Router
      expect(configService.set).toHaveBeenCalledWith('Router', originalRouter);
    });

    it('should stop periodic checks', async () => {
      (lookup as any).mockResolvedValue({ address: '10.3.42.43', family: 4 });
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          checkInterval: 10,
          states: {
            intranet: { Router: { default: 'intranet,model' } },
            external: { Router: { default: 'external,model' } },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();
      detector.stop();

      const lookupCallCount = (lookup as any).mock.calls.length;;

      await vi.advanceTimersByTimeAsync(30000);

      // No additional DNS calls after stop
      expect((lookup as any).mock.calls.length).toBe(lookupCallCount);
    });
  });

  describe('defaults', () => {
    it('should use default hostname w3.huawei.com when not specified', async () => {
      (lookup as any).mockResolvedValue({ address: '10.3.42.43', family: 4 });
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          states: {
            intranet: { Router: { default: 'intranet,model' } },
            external: { Router: { default: 'external,model' } },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();

      expect(lookup).toHaveBeenCalledWith('w3.huawei.com');
    });

    it('should use default checkInterval 30s when not specified', async () => {
      (lookup as any).mockResolvedValue({ address: '10.3.42.43', family: 4 });
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          states: {
            intranet: { Router: { default: 'intranet,model' } },
            external: { Router: { default: 'external,model' } },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();

      // Advance less than 30s - should not trigger another check
      await vi.advanceTimersByTimeAsync(29000);
      expect((lookup as any).mock.calls.length).toBe(1);

      // Advance to 30s - should trigger another check
      await vi.advanceTimersByTimeAsync(2000);
      expect((lookup as any).mock.calls.length).toBe(2);
    });

    it('should use custom hostname and intranetPattern', async () => {
      (lookup as any).mockResolvedValue({ address: '172.16.0.1', family: 4 });
      configService = createMockConfigService({
        NetworkRouter: {
          enabled: true,
          hostname: 'internal.company.com',
          intranetPattern: '^172\\.',
          states: {
            intranet: { Router: { default: 'intranet,model' } },
            external: { Router: { default: 'external,model' } },
          },
        },
        Router: { default: 'original,default' },
      });
      logger = createMockLogger();
      const detector = new NetworkDetector(configService, logger);

      await detector.start();

      expect(lookup).toHaveBeenCalledWith('internal.company.com');
      expect(detector.getState()).toBe('intranet');
    });
  });
});
