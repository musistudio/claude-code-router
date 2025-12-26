import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { existsSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';

// Create test-specific directories to avoid affecting real config
const TEST_HOME_DIR = path.join(os.tmpdir(), '.claude-code-router-test-auth-' + process.pid);
const TEST_RUNTIME_FILE = path.join(TEST_HOME_DIR, '.runtime');

// Mock the constants module
vi.mock('../constants', () => ({
  PID_FILE: path.join(os.tmpdir(), '.claude-code-router-test-auth-' + process.pid, '.pid'),
  REFERENCE_COUNT_FILE: path.join(os.tmpdir(), '.claude-code-router-test-auth-' + process.pid, '.ref_count'),
  RUNTIME_FILE: path.join(os.tmpdir(), '.claude-code-router-test-auth-' + process.pid, '.runtime'),
  CONFIG_FILE: path.join(os.tmpdir(), '.claude-code-router-test-auth-' + process.pid, 'config.json'),
  HOME_DIR: path.join(os.tmpdir(), '.claude-code-router-test-auth-' + process.pid),
  DEFAULT_CONFIG: { PORT: 3456 },
  PLUGINS_DIR: path.join(os.tmpdir(), '.claude-code-router-test-auth-' + process.pid, 'plugins'),
}));

// Import after mocking
import { getAllowedOrigins, isOriginAllowed } from './auth';
import { saveRuntimeState, cleanupRuntimeState, RuntimeState } from '../utils/runtimeState';

describe('Auth Middleware CORS', () => {
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
    [TEST_RUNTIME_FILE].forEach(file => {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch (e) {
          // Ignore
        }
      }
    });
  }

  // Arbitrary for generating valid HTTP origins
  const httpOriginArbitrary = fc.tuple(
    fc.constantFrom('http', 'https'),
    fc.stringMatching(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/),
    fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined })
  ).map(([protocol, domain, port]) => 
    port ? `${protocol}://${domain}:${port}` : `${protocol}://${domain}`
  );

  /**
   * Feature: port-configuration-fix, Property 6: CORS allows configured origins
   * 
   * *For any* origin in the `ALLOWED_ORIGINS` config array, requests from that
   * origin SHALL be allowed (not return 403).
   * 
   * **Validates: Requirements 5.2**
   */
  describe('Property 6: CORS allows configured origins', () => {
    it('should allow any origin that is in ALLOWED_ORIGINS config', () => {
      fc.assert(
        fc.property(
          // Generate a list of custom allowed origins
          fc.array(httpOriginArbitrary, { minLength: 1, maxLength: 10 }),
          // Generate a config port
          fc.integer({ min: 1, max: 65535 }),
          (customOrigins, configPort) => {
            // Setup: No runtime state, use config port
            cleanupRuntimeState();

            const config = {
              PORT: configPort,
              ALLOWED_ORIGINS: customOrigins,
            };

            const allowedOrigins = getAllowedOrigins(config);

            // Verify: All custom origins should be in the allowed list
            for (const origin of customOrigins) {
              expect(isOriginAllowed(origin, allowedOrigins)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always allow default localhost origins', () => {
      fc.assert(
        fc.property(
          // Generate a config port
          fc.integer({ min: 1, max: 65535 }),
          // Generate optional custom origins
          fc.array(httpOriginArbitrary, { minLength: 0, maxLength: 5 }),
          (configPort, customOrigins) => {
            // Setup: No runtime state
            cleanupRuntimeState();

            const config = {
              PORT: configPort,
              ALLOWED_ORIGINS: customOrigins,
            };

            const allowedOrigins = getAllowedOrigins(config);

            // Verify: Default localhost origins should always be allowed
            expect(isOriginAllowed(`http://127.0.0.1:${configPort}`, allowedOrigins)).toBe(true);
            expect(isOriginAllowed(`http://localhost:${configPort}`, allowedOrigins)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow runtime port origins when runtime state exists', () => {
      fc.assert(
        fc.property(
          // Generate runtime port
          fc.integer({ min: 1, max: 65535 }),
          // Generate config port (different from runtime)
          fc.integer({ min: 1, max: 65535 }),
          (runtimePort, configPort) => {
            // Setup: Save runtime state
            const state: RuntimeState = {
              port: runtimePort,
              host: '127.0.0.1',
              startTime: new Date().toISOString(),
            };
            saveRuntimeState(state);

            const config = {
              PORT: configPort,
              ALLOWED_ORIGINS: [],
            };

            const allowedOrigins = getAllowedOrigins(config);

            // Verify: Runtime port origins should be allowed
            expect(isOriginAllowed(`http://127.0.0.1:${runtimePort}`, allowedOrigins)).toBe(true);
            expect(isOriginAllowed(`http://localhost:${runtimePort}`, allowedOrigins)).toBe(true);

            // Cleanup
            cleanupRuntimeState();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: port-configuration-fix, Property 7: CORS denies unconfigured origins
   * 
   * *For any* origin NOT in the allowed origins list (default + custom), and when
   * no APIKEY is set, requests from that origin SHALL return 403 Forbidden.
   * 
   * **Validates: Requirements 5.3**
   */
  describe('Property 7: CORS denies unconfigured origins', () => {
    it('should deny origins not in allowed list', () => {
      fc.assert(
        fc.property(
          // Generate a config port
          fc.integer({ min: 1, max: 65535 }),
          // Generate custom allowed origins
          fc.array(httpOriginArbitrary, { minLength: 0, maxLength: 5 }),
          // Generate a random origin to test (that won't match defaults)
          fc.tuple(
            fc.constantFrom('http', 'https'),
            fc.stringMatching(/^random-[a-z0-9]{5,10}\.example\.com$/),
            fc.integer({ min: 10000, max: 60000 })
          ).map(([protocol, domain, port]) => `${protocol}://${domain}:${port}`),
          (configPort, customOrigins, randomOrigin) => {
            // Setup: No runtime state
            cleanupRuntimeState();

            const config = {
              PORT: configPort,
              ALLOWED_ORIGINS: customOrigins,
            };

            const allowedOrigins = getAllowedOrigins(config);

            // Only test if the random origin is not accidentally in the allowed list
            if (!allowedOrigins.includes(randomOrigin)) {
              // Verify: Random origin should be denied
              expect(isOriginAllowed(randomOrigin, allowedOrigins)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow requests with no origin header (same-origin requests)', () => {
      fc.assert(
        fc.property(
          // Generate a config port
          fc.integer({ min: 1, max: 65535 }),
          (configPort) => {
            // Setup: No runtime state
            cleanupRuntimeState();

            const config = {
              PORT: configPort,
              ALLOWED_ORIGINS: [],
            };

            const allowedOrigins = getAllowedOrigins(config);

            // Verify: No origin (undefined) should be allowed (same-origin request)
            expect(isOriginAllowed(undefined, allowedOrigins)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should deny origins with wrong port', () => {
      fc.assert(
        fc.property(
          // Generate a config port
          fc.integer({ min: 1, max: 32767 }),
          (configPort) => {
            // Setup: No runtime state
            cleanupRuntimeState();

            const config = {
              PORT: configPort,
              ALLOWED_ORIGINS: [],
            };

            const allowedOrigins = getAllowedOrigins(config);
            
            // Use a different port (add 32768 to ensure it's different and valid)
            const wrongPort = configPort + 32768;

            // Verify: localhost with wrong port should be denied
            expect(isOriginAllowed(`http://127.0.0.1:${wrongPort}`, allowedOrigins)).toBe(false);
            expect(isOriginAllowed(`http://localhost:${wrongPort}`, allowedOrigins)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getAllowedOrigins edge cases', () => {
    it('should handle empty ALLOWED_ORIGINS array', () => {
      cleanupRuntimeState();
      const config = { PORT: 3456, ALLOWED_ORIGINS: [] };
      const origins = getAllowedOrigins(config);
      
      expect(origins).toContain('http://127.0.0.1:3456');
      expect(origins).toContain('http://localhost:3456');
      expect(origins.length).toBe(2);
    });

    it('should handle missing ALLOWED_ORIGINS field', () => {
      cleanupRuntimeState();
      const config = { PORT: 3456 };
      const origins = getAllowedOrigins(config);
      
      expect(origins).toContain('http://127.0.0.1:3456');
      expect(origins).toContain('http://localhost:3456');
    });

    it('should handle invalid ALLOWED_ORIGINS (not an array)', () => {
      cleanupRuntimeState();
      const config = { PORT: 3456, ALLOWED_ORIGINS: 'not-an-array' };
      const origins = getAllowedOrigins(config);
      
      // Should still have default origins
      expect(origins).toContain('http://127.0.0.1:3456');
      expect(origins).toContain('http://localhost:3456');
    });

    it('should filter out invalid origins in ALLOWED_ORIGINS', () => {
      cleanupRuntimeState();
      const config = { 
        PORT: 3456, 
        ALLOWED_ORIGINS: ['http://valid.com', '', null, undefined, 123, 'http://also-valid.com'] 
      };
      const origins = getAllowedOrigins(config);
      
      expect(origins).toContain('http://valid.com');
      expect(origins).toContain('http://also-valid.com');
      expect(origins).not.toContain('');
      expect(origins).not.toContain(null);
      expect(origins).not.toContain(undefined);
      expect(origins).not.toContain(123);
    });

    it('should deduplicate origins', () => {
      cleanupRuntimeState();
      const config = { 
        PORT: 3456, 
        ALLOWED_ORIGINS: ['http://127.0.0.1:3456', 'http://custom.com', 'http://custom.com'] 
      };
      const origins = getAllowedOrigins(config);
      
      // Count occurrences
      const customCount = origins.filter(o => o === 'http://custom.com').length;
      const localhostCount = origins.filter(o => o === 'http://127.0.0.1:3456').length;
      
      expect(customCount).toBe(1);
      expect(localhostCount).toBe(1);
    });
  });
});
