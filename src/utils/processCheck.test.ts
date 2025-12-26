import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { existsSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';

// Create test-specific directories to avoid affecting real config
const TEST_HOME_DIR = path.join(os.tmpdir(), '.claude-code-router-test-processcheck-' + process.pid);
const TEST_RUNTIME_FILE = path.join(TEST_HOME_DIR, '.runtime');
const TEST_CONFIG_FILE = path.join(TEST_HOME_DIR, 'config.json');
const TEST_PID_FILE = path.join(TEST_HOME_DIR, '.pid');
const TEST_REF_COUNT_FILE = path.join(TEST_HOME_DIR, '.ref_count');

// Mock the constants module
vi.mock('../constants', () => ({
  PID_FILE: path.join(os.tmpdir(), '.claude-code-router-test-processcheck-' + process.pid, '.pid'),
  REFERENCE_COUNT_FILE: path.join(os.tmpdir(), '.claude-code-router-test-processcheck-' + process.pid, '.ref_count'),
  RUNTIME_FILE: path.join(os.tmpdir(), '.claude-code-router-test-processcheck-' + process.pid, '.runtime'),
  CONFIG_FILE: path.join(os.tmpdir(), '.claude-code-router-test-processcheck-' + process.pid, 'config.json'),
  HOME_DIR: path.join(os.tmpdir(), '.claude-code-router-test-processcheck-' + process.pid),
}));

// Mock readConfigFile to use our test config
vi.mock('.', async () => {
  const testConfigFile = path.join(os.tmpdir(), '.claude-code-router-test-processcheck-' + process.pid, 'config.json');
  return {
    readConfigFile: async () => {
      if (existsSync(testConfigFile)) {
        const content = require('fs').readFileSync(testConfigFile, 'utf-8');
        return JSON.parse(content);
      }
      return { PORT: 3456 };
    },
  };
});

// Import after mocking
import { getServiceInfo } from './processCheck';
import { saveRuntimeState, cleanupRuntimeState, RuntimeState } from './runtimeState';

describe('processCheck', () => {
  beforeEach(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_HOME_DIR)) {
      mkdirSync(TEST_HOME_DIR, { recursive: true });
    }
    // Clean up any existing files
    cleanupTestFiles();
  });

  afterEach(() => {
    // Clean up after each test
    cleanupTestFiles();
    // Remove test directory
    if (existsSync(TEST_HOME_DIR)) {
      rmSync(TEST_HOME_DIR, { recursive: true, force: true });
    }
  });

  function cleanupTestFiles() {
    [TEST_RUNTIME_FILE, TEST_CONFIG_FILE, TEST_PID_FILE, TEST_REF_COUNT_FILE].forEach(file => {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch (e) {
          // Ignore
        }
      }
    });
  }

  function saveTestConfig(config: Record<string, unknown>) {
    writeFileSync(TEST_CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  // Helper to generate valid IPv4 addresses
  const ipv4Arbitrary = fc.tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

  /**
   * Feature: port-configuration-fix, Property 3: Status command port consistency
   * 
   * *For any* service started with a custom port (via SERVICE_PORT), the `ccr status`
   * command SHALL display that exact port, not the config file port.
   * 
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 3: Status command port consistency', () => {
    it('should return runtime port when runtime state exists, regardless of config port', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate runtime port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          // Generate config port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          // Generate valid host
          ipv4Arbitrary,
          async (runtimePort, configPort, host) => {
            // Setup: Save config with configPort
            saveTestConfig({ PORT: configPort });

            // Setup: Save runtime state with runtimePort (simulating SERVICE_PORT usage)
            const state: RuntimeState = {
              port: runtimePort,
              host,
              startTime: new Date().toISOString(),
            };
            saveRuntimeState(state);

            // Execute: Get service info (what ccr status uses)
            const info = await getServiceInfo();

            // Verify: The returned port should be the runtime port, not config port
            expect(info.port).toBe(runtimePort);
            expect(info.configPort).toBe(configPort);
            expect(info.isRuntimePort).toBe(true);
            expect(info.endpoint).toBe(`http://127.0.0.1:${runtimePort}`);

            // Cleanup for next iteration
            cleanupRuntimeState();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return config port when runtime state does not exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate config port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          async (configPort) => {
            // Setup: Save config with configPort, no runtime state
            saveTestConfig({ PORT: configPort });
            cleanupRuntimeState();

            // Execute: Get service info
            const info = await getServiceInfo();

            // Verify: The returned port should be the config port
            expect(info.port).toBe(configPort);
            expect(info.configPort).toBe(configPort);
            expect(info.isRuntimePort).toBe(false);
            expect(info.endpoint).toBe(`http://127.0.0.1:${configPort}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use default port 3456 when neither runtime nor config port exists', async () => {
      // Setup: No config file, no runtime state
      cleanupRuntimeState();
      
      // Execute: Get service info
      const info = await getServiceInfo();

      // Verify: Should use default port
      expect(info.port).toBe(3456);
      expect(info.configPort).toBe(3456);
      expect(info.isRuntimePort).toBe(false);
    });
  });
});
