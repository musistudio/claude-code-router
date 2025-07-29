import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import path from 'path';

const TEST_CONFIG_DIR = join(homedir(), '.claude-code-router-test');
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, 'config.json');
const CLI_PATH = join(__dirname, '..', 'src', 'cli.ts');

describe('CLI Commands', () => {
  beforeEach(() => {
    // Create test config directory
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
    // Set environment variable to use test config
    process.env.CCR_CONFIG_DIR = TEST_CONFIG_DIR;
  });

  afterEach(() => {
    // Clean up test config directory
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    delete process.env.CCR_CONFIG_DIR;
  });

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
        const result = await runCommand([
          'provider',
          'add',
          'test-provider',
          'https://api.test.com/v1/chat',
          'sk-test123',
          'model1,model2',
        ]);

        expect(result.stdout).toContain('Provider added successfully');
        expect(result.exitCode).toBe(0);

        // Verify config file was created
        const config = JSON.parse(readFileSync(TEST_CONFIG_FILE, 'utf-8'));
        expect(config.Providers).toHaveLength(1);
        expect(config.Providers[0]).toMatchObject({
          name: 'test-provider',
          api_base_url: 'https://api.test.com/v1/chat',
          api_key: 'sk-test123',
          models: ['model1', 'model2'],
        });
      });

      it('should add provider with transformer', async () => {
        const result = await runCommand([
          'provider',
          'add',
          'test-provider',
          'https://api.test.com/v1/chat',
          'sk-test123',
          'model1,model2',
          '--transformer',
          'custom-transformer',
        ]);

        expect(result.stdout).toContain('Provider added successfully');
        expect(result.exitCode).toBe(0);

        const config = JSON.parse(readFileSync(TEST_CONFIG_FILE, 'utf-8'));
        expect(config.Providers[0].transformer).toEqual({
          use: ['custom-transformer'],
        });
      });

      it('should update existing provider', async () => {
        // First add a provider
        const initialConfig = {
          Providers: [
            {
              name: 'test-provider',
              api_base_url: 'https://old-api.test.com',
              api_key: 'old-key',
              models: ['old-model'],
            },
          ],
          Router: {},
          APIKEY: '',
          HOST: '0.0.0.0',
          API_TIMEOUT_MS: 600000,
        };
        writeFileSync(TEST_CONFIG_FILE, JSON.stringify(initialConfig, null, 2));

        // Update the provider
        const result = await runCommand([
          'provider',
          'add',
          'test-provider',
          'https://new-api.test.com',
          'new-key',
          'new-model1,new-model2',
        ]);

        expect(result.stdout).toContain('Provider added successfully');
        expect(result.exitCode).toBe(0);

        const config = JSON.parse(readFileSync(TEST_CONFIG_FILE, 'utf-8'));
        expect(config.Providers[0]).toMatchObject({
          name: 'test-provider',
          api_base_url: 'https://new-api.test.com',
          api_key: 'new-key',
          models: ['new-model1', 'new-model2'],
        });
      });

      it('should fail with invalid arguments', async () => {
        const result = await runCommand(['provider', 'add', 'test-provider']);
        expect(result.stdout).toContain('Invalid usage');
        expect(result.exitCode).toBe(1);
      });
    });

    describe('list', () => {
      it('should show warning when no config exists', async () => {
        const result = await runCommand(['provider', 'list']);
        expect(result.stdout).toContain('No configuration file found');
        expect(result.exitCode).toBe(0);
      });

      it('should list configured providers', async () => {
        const config = {
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
              api_key: '',
              models: ['model3'],
              transformer: { use: ['transformer1'] },
            },
          ],
          Router: {
            default: 'provider1,model1',
            background: 'provider2,model3',
            think: '',
            longContext: '',
            longContextThreshold: 60000,
            webSearch: '',
          },
          APIKEY: 'test-api-key',
          HOST: '0.0.0.0',
          API_TIMEOUT_MS: 300000,
        };
        writeFileSync(TEST_CONFIG_FILE, JSON.stringify(config, null, 2));

        const result = await runCommand(['provider', 'list']);
        expect(result.stdout).toContain('Claude Code Router Configuration');
        expect(result.stdout).toContain('provider1');
        expect(result.stdout).toContain('provider2');
        expect(result.stdout).toContain('✓'); // API key configured
        expect(result.stdout).toContain('✗'); // API key not configured
        expect(result.stdout).toContain('transformer1');
        expect(result.exitCode).toBe(0);
      });
    });
  });

  describe('ccr status', () => {
    it('should show not running status', async () => {
      const result = await runCommand(['status']);
      expect(result.stdout).toContain('Not Running');
      expect(result.stdout).toContain('ccr start');
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

// Helper function to run CLI commands
function runCommand(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise(resolve => {
    // Use tsx or ts-node if available, otherwise assume compiled JS
    const nodeArgs = existsSync(join(__dirname, '..', 'dist', 'cli.js'))
      ? [join(__dirname, '..', 'dist', 'cli.js'), ...args]
      : ['-r', 'ts-jest', CLI_PATH, ...args];

    const child = spawn('node', nodeArgs, {
      env: { ...process.env, NODE_ENV: 'test', CCR_CONFIG_DIR: TEST_CONFIG_DIR },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      resolve({ stdout, stderr, exitCode: code });
    });

    child.on('error', error => {
      stderr += error.message;
      resolve({ stdout, stderr, exitCode: 1 });
    });
  });
}
