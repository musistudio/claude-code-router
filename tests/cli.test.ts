import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TEST_CONFIG_DIR = join(homedir(), '.claude-code-router-test');
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, 'config.json');

// Mock the modules
jest.mock('../src/utils/cliEnhancer');
jest.mock('../src/utils/status');
jest.mock('../src/utils/serviceControl');

describe('CLI Commands', () => {
  let originalArgv: string[];
  let originalExit: any;
  let exitCode: number | undefined;
  let consoleOutput: string[] = [];
  let originalConsoleLog: any;

  beforeEach(() => {
    // Create test config directory
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
    // Set environment variable to use test config
    process.env.CCR_CONFIG_DIR = TEST_CONFIG_DIR;
    process.env.NODE_ENV = 'test';

    // Save original values
    originalArgv = process.argv;
    originalExit = process.exit;
    originalConsoleLog = console.log;

    // Mock process.exit
    exitCode = undefined;
    process.exit = jest.fn((code?: number) => {
      exitCode = code;
      throw new Error('process.exit');
    }) as any;

    // Mock console.log to capture output
    consoleOutput = [];
    console.log = jest.fn((...args: any[]) => {
      consoleOutput.push(args.join(' '));
    }) as any;
  });

  afterEach(() => {
    // Clean up test config directory
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    delete process.env.CCR_CONFIG_DIR;

    // Restore original values
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalConsoleLog;

    // Clear all mocks
    jest.clearAllMocks();
  });

  async function runCommand(args: string[]) {
    process.argv = ['node', 'cli.js', ...args];
    consoleOutput = [];
    exitCode = undefined;

    try {
      // Import fresh instance
      jest.resetModules();
      await import('../src/cli');
    } catch (error: any) {
      if (error.message !== 'process.exit') {
        throw error;
      }
    }

    return {
      stdout: consoleOutput.join('\n'),
      exitCode: exitCode ?? 0,
    };
  }

  describe('ccr help', () => {
    it('should display help text', async () => {
      const result = await runCommand(['help']);
      expect(result.stdout).toContain('Usage: ccr [command] [options]');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('stop');
      expect(result.stdout).toContain('provider');
      expect(result.exitCode).toBe(0);
    });

    it('should display help for -h flag', async () => {
      const result = await runCommand(['-h']);
      expect(result.stdout).toContain('Usage: ccr [command] [options]');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('ccr version', () => {
    it('should display version', async () => {
      const result = await runCommand(['version']);
      expect(result.stdout).toContain('Claude Code Router v');
      expect(result.exitCode).toBe(0);
    });

    it('should display version for -v flag', async () => {
      const result = await runCommand(['-v']);
      expect(result.stdout).toContain('Claude Code Router v');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('ccr provider', () => {
    describe('add', () => {
      it('should add a new provider', async () => {
        const { addProvider } = await import('../src/utils/cliEnhancer');
        (addProvider as any).mockResolvedValue(undefined);

        const result = await runCommand([
          'provider',
          'add',
          'test-provider',
          'https://api.test.com',
          'sk-test123',
          'model1,model2',
        ]);

        expect(addProvider).toHaveBeenCalledWith(
          'test-provider',
          'https://api.test.com',
          'sk-test123',
          ['model1', 'model2'],
          undefined
        );
        expect(result.exitCode).toBe(0);
      });

      it('should add provider with transformer', async () => {
        const { addProvider } = await import('../src/utils/cliEnhancer');
        (addProvider as any).mockResolvedValue(undefined);

        const result = await runCommand([
          'provider',
          'add',
          'test-provider',
          'https://api.test.com',
          'sk-test123',
          'model1,model2',
          '--transformer',
          'openai',
        ]);

        expect(addProvider).toHaveBeenCalledWith(
          'test-provider',
          'https://api.test.com',
          'sk-test123',
          ['model1', 'model2'],
          'openai'
        );
        expect(result.exitCode).toBe(0);
      });

      it('should fail with invalid arguments', async () => {
        const result = await runCommand(['provider', 'add', 'test-provider']);
        expect(result.stdout).toContain('Invalid usage');
        expect(result.exitCode).toBe(1);
      });
    });

    describe('list', () => {
      it('should list providers', async () => {
        const { listProviders } = await import('../src/utils/cliEnhancer');
        (listProviders as any).mockResolvedValue(undefined);

        const result = await runCommand(['provider', 'list']);
        expect(listProviders).toHaveBeenCalled();
        expect(result.exitCode).toBe(0);
      });
    });
  });

  describe('ccr status', () => {
    it('should show status', async () => {
      const { showStatus } = await import('../src/utils/status');
      (showStatus as any).mockResolvedValue(undefined);

      const result = await runCommand(['status']);
      expect(showStatus).toHaveBeenCalled();
      expect(result.exitCode).toBe(0);
    });
  });

  describe('unknown command', () => {
    it('should show error and help for unknown command', async () => {
      const result = await runCommand(['unknown']);
      expect(result.stdout).toContain('Unknown command: unknown');
      expect(result.stdout).toContain('Usage: ccr [command] [options]');
      expect(result.exitCode).toBe(1);
    });
  });
});