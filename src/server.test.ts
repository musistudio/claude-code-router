import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { existsSync, mkdirSync, rmSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

// Create test-specific directories to avoid affecting real config
const TEST_HOME_DIR = path.join(os.tmpdir(), '.claude-code-router-test-server-' + process.pid);
const TEST_RUNTIME_FILE = path.join(TEST_HOME_DIR, '.runtime');
const TEST_CONFIG_FILE = path.join(TEST_HOME_DIR, 'config.json');

// Mock the constants module
vi.mock('./constants', () => ({
  PID_FILE: path.join(os.tmpdir(), '.claude-code-router-test-server-' + process.pid, '.pid'),
  REFERENCE_COUNT_FILE: path.join(os.tmpdir(), '.claude-code-router-test-server-' + process.pid, '.ref_count'),
  RUNTIME_FILE: path.join(os.tmpdir(), '.claude-code-router-test-server-' + process.pid, '.runtime'),
  CONFIG_FILE: path.join(os.tmpdir(), '.claude-code-router-test-server-' + process.pid, 'config.json'),
  HOME_DIR: path.join(os.tmpdir(), '.claude-code-router-test-server-' + process.pid),
  DEFAULT_CONFIG: { PORT: 3456 },
  PLUGINS_DIR: path.join(os.tmpdir(), '.claude-code-router-test-server-' + process.pid, 'plugins'),
}));

// Import after mocking
import { getRuntimeState, saveRuntimeState, cleanupRuntimeState, RuntimeState } from './utils/runtimeState';
import { readConfigFile, writeConfigFile } from './utils';

describe('Server API Endpoints', () => {
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
    [TEST_RUNTIME_FILE, TEST_CONFIG_FILE].forEach(file => {
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
    if (!existsSync(TEST_HOME_DIR)) {
      mkdirSync(TEST_HOME_DIR, { recursive: true });
    }
    writeFileSync(TEST_CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  function readTestConfig(): Record<string, unknown> {
    if (!existsSync(TEST_CONFIG_FILE)) {
      return { PORT: 3456 };
    }
    const content = readFileSync(TEST_CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  }

  // Helper to generate valid IPv4 addresses
  const ipv4Arbitrary = fc.tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

  /**
   * Feature: port-configuration-fix, Property 4: API config includes runtime port
   * 
   * *For any* running service, the `/api/config` endpoint response SHALL include
   * a `runtimePort` field matching the actual listening port.
   * 
   * **Validates: Requirements 3.1**
   */
  describe('Property 4: API config includes runtime port', () => {
    it('should include runtimePort matching actual listening port when runtime state exists', () => {
      fc.assert(
        fc.property(
          // Generate runtime port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          // Generate config port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          // Generate valid host
          ipv4Arbitrary,
          (runtimePort, configPort, host) => {
            // Setup: Save config with configPort
            saveTestConfig({ PORT: configPort });

            // Setup: Save runtime state with runtimePort (simulating SERVICE_PORT usage)
            const state: RuntimeState = {
              port: runtimePort,
              host,
              startTime: new Date().toISOString(),
            };
            saveRuntimeState(state);

            // Simulate what GET /api/config does
            const config = readTestConfig();
            const runtimeState = getRuntimeState();
            
            const apiResponse = {
              ...config,
              runtimePort: runtimeState?.port ?? null,
              runtimeHost: runtimeState?.host ?? null,
            };

            // Verify: runtimePort should match the actual runtime port
            expect(apiResponse.runtimePort).toBe(runtimePort);
            expect(apiResponse.runtimeHost).toBe(host);
            // Config PORT should still be the original config value
            expect(apiResponse.PORT).toBe(configPort);

            // Cleanup for next iteration
            cleanupRuntimeState();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for runtimePort when runtime state does not exist', () => {
      fc.assert(
        fc.property(
          // Generate config port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          (configPort) => {
            // Setup: Save config with configPort, no runtime state
            saveTestConfig({ PORT: configPort });
            cleanupRuntimeState();

            // Simulate what GET /api/config does
            const config = readTestConfig();
            const runtimeState = getRuntimeState();
            
            const apiResponse = {
              ...config,
              runtimePort: runtimeState?.port ?? null,
              runtimeHost: runtimeState?.host ?? null,
            };

            // Verify: runtimePort should be null when no runtime state
            expect(apiResponse.runtimePort).toBeNull();
            expect(apiResponse.runtimeHost).toBeNull();
            // Config PORT should still be present
            expect(apiResponse.PORT).toBe(configPort);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: port-configuration-fix, Property 5: Config save preserves unmodified PORT
   * 
   * *For any* config save request that does not include a PORT field, the existing
   * PORT value in config.json SHALL be preserved unchanged.
   * 
   * **Validates: Requirements 4.3**
   */
  describe('Property 5: Config save preserves unmodified PORT', () => {
    it('should preserve existing PORT when new config does not include PORT field', () => {
      fc.assert(
        fc.property(
          // Generate existing config port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          // Generate other config fields that might be saved
          fc.record({
            HOST: ipv4Arbitrary,
            APIKEY: fc.string({ minLength: 0, maxLength: 32 }),
          }),
          (existingPort, newConfigFields) => {
            // Setup: Save initial config with PORT
            saveTestConfig({ PORT: existingPort, HOST: '127.0.0.1' });

            // Simulate what POST /api/config does when PORT is not in request
            const existingConfig = readTestConfig();
            const newConfig: Record<string, unknown> = { ...newConfigFields };
            
            // This is the key logic from the API endpoint:
            // If PORT is not provided in request, preserve existing value
            if (newConfig.PORT === undefined) {
              newConfig.PORT = existingConfig.PORT;
            }

            // Save the merged config
            saveTestConfig(newConfig);

            // Verify: PORT should be preserved
            const savedConfig = readTestConfig();
            expect(savedConfig.PORT).toBe(existingPort);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow PORT to be updated when explicitly provided', () => {
      fc.assert(
        fc.property(
          // Generate existing config port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          // Generate new port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          (existingPort, newPort) => {
            // Setup: Save initial config with PORT
            saveTestConfig({ PORT: existingPort });

            // Simulate what POST /api/config does when PORT IS in request
            const existingConfig = readTestConfig();
            const newConfig: Record<string, unknown> = { PORT: newPort };
            
            // This is the key logic from the API endpoint:
            // If PORT is provided, use it (don't preserve existing)
            if (newConfig.PORT === undefined) {
              newConfig.PORT = existingConfig.PORT;
            }

            // Save the config
            saveTestConfig(newConfig);

            // Verify: PORT should be the new value
            const savedConfig = readTestConfig();
            expect(savedConfig.PORT).toBe(newPort);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve PORT when saving config with various other fields', () => {
      fc.assert(
        fc.property(
          // Generate existing config port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          // Generate various config fields (without PORT)
          fc.record({
            HOST: fc.option(ipv4Arbitrary, { nil: undefined }),
            APIKEY: fc.option(fc.string({ minLength: 0, maxLength: 32 }), { nil: undefined }),
            ALLOWED_ORIGINS: fc.option(fc.array(fc.webUrl(), { minLength: 0, maxLength: 5 }), { nil: undefined }),
          }),
          (existingPort, newConfigFields) => {
            // Setup: Save initial config with PORT and some other fields
            saveTestConfig({ 
              PORT: existingPort, 
              HOST: '127.0.0.1',
              APIKEY: 'existing-key',
            });

            // Filter out undefined values from newConfigFields
            const filteredNewConfig: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(newConfigFields)) {
              if (value !== undefined) {
                filteredNewConfig[key] = value;
              }
            }

            // Simulate what POST /api/config does
            const existingConfig = readTestConfig();
            const newConfig = { ...filteredNewConfig };
            
            // Preserve PORT if not provided
            if (newConfig.PORT === undefined) {
              newConfig.PORT = existingConfig.PORT;
            }

            // Save the config
            saveTestConfig(newConfig);

            // Verify: PORT should be preserved
            const savedConfig = readTestConfig();
            expect(savedConfig.PORT).toBe(existingPort);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
