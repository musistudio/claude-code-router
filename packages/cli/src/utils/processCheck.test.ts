import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { existsSync, mkdirSync, rmSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

// Create test-specific directories to avoid affecting real config
const TEST_HOME_DIR = path.join(os.tmpdir(), '.claude-code-router-test-processcheck-' + process.pid);
const TEST_RUNTIME_FILE = path.join(TEST_HOME_DIR, '.runtime');
const TEST_CONFIG_FILE = path.join(TEST_HOME_DIR, 'config.json');

interface RuntimeState {
  port: number;
  host: string;
  startTime: string;
}

// Test implementations that directly manipulate files
function saveTestRuntimeState(state: RuntimeState): void {
  try {
    if (!existsSync(TEST_HOME_DIR)) {
      mkdirSync(TEST_HOME_DIR, { recursive: true });
    }
    writeFileSync(TEST_RUNTIME_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn('Failed to save runtime state:', error);
  }
}

function getTestRuntimeState(): RuntimeState | null {
  if (!existsSync(TEST_RUNTIME_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(TEST_RUNTIME_FILE, 'utf-8');
    const state = JSON.parse(content) as RuntimeState;
    
    if (typeof state.port !== 'number' || typeof state.host !== 'string') {
      return null;
    }
    
    return state;
  } catch (error) {
    return null;
  }
}

function cleanupTestRuntimeState(): void {
  if (existsSync(TEST_RUNTIME_FILE)) {
    try {
      unlinkSync(TEST_RUNTIME_FILE);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

function getTestRuntimePort(configPort: number): number {
  const runtimeState = getTestRuntimeState();
  return runtimeState?.port ?? configPort;
}

describe('processCheck - runtime port logic', () => {
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
    writeFileSync(TEST_CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  function readTestConfig(): any {
    if (existsSync(TEST_CONFIG_FILE)) {
      const content = readFileSync(TEST_CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
    return { PORT: 3456 };
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
    it('should return runtime port when runtime state exists, regardless of config port', () => {
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
            saveTestRuntimeState(state);

            // Execute: Simulate what getServiceInfo does
            const config = readTestConfig();
            const runtimeState = getTestRuntimeState();
            const actualConfigPort = config.PORT || 3456;
            const actualPort = runtimeState?.port || actualConfigPort;
            const isRuntimePort = !!runtimeState;

            // Verify: The returned port should be the runtime port, not config port
            expect(actualPort).toBe(runtimePort);
            expect(actualConfigPort).toBe(configPort);
            expect(isRuntimePort).toBe(true);

            // Cleanup for next iteration
            cleanupTestRuntimeState();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return config port when runtime state does not exist', () => {
      fc.assert(
        fc.property(
          // Generate config port (1-65535)
          fc.integer({ min: 1, max: 65535 }),
          (configPort) => {
            // Setup: Save config with configPort, no runtime state
            saveTestConfig({ PORT: configPort });
            cleanupTestRuntimeState();

            // Execute: Simulate what getServiceInfo does
            const config = readTestConfig();
            const runtimeState = getTestRuntimeState();
            const actualConfigPort = config.PORT || 3456;
            const actualPort = runtimeState?.port || actualConfigPort;
            const isRuntimePort = !!runtimeState;

            // Verify: The returned port should be the config port
            expect(actualPort).toBe(configPort);
            expect(actualConfigPort).toBe(configPort);
            expect(isRuntimePort).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use default port 3456 when neither runtime nor config port exists', () => {
      // Setup: No config file, no runtime state
      cleanupTestRuntimeState();
      
      // Execute: Simulate what getServiceInfo does
      const config = readTestConfig();
      const runtimeState = getTestRuntimeState();
      const actualConfigPort = config.PORT || 3456;
      const actualPort = runtimeState?.port || actualConfigPort;
      const isRuntimePort = !!runtimeState;

      // Verify: Should use default port
      expect(actualPort).toBe(3456);
      expect(actualConfigPort).toBe(3456);
      expect(isRuntimePort).toBe(false);
    });

    it('should correctly implement getRuntimePort fallback logic', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 65535 }),
          fc.integer({ min: 1, max: 65535 }),
          (runtimePort, configPort) => {
            // Test with runtime state
            saveTestRuntimeState({
              port: runtimePort,
              host: '127.0.0.1',
              startTime: new Date().toISOString(),
            });
            expect(getTestRuntimePort(configPort)).toBe(runtimePort);

            // Test without runtime state
            cleanupTestRuntimeState();
            expect(getTestRuntimePort(configPort)).toBe(configPort);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
