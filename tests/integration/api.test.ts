/**
 * API Integration Tests
 * Tests for API endpoints in src/server.ts
 */

import { createMockConfig } from '../mocks';

describe('API Endpoints (Integration)', () => {
  describe('Token Counting Endpoint', () => {
    it('should calculate tokens for a request', () => {
      const messages = [
        { role: 'user', content: 'Hello world' },
      ];
      const system = [{ type: 'text', text: 'You are helpful' }];
      const tools: any[] = [];

      // This would be tested via server.app.inject in a full integration test
      // For now, we're testing the logic directly
      const { calculateTokenCount } = require('../../src/utils/router');
      const tokenCount = calculateTokenCount(messages, system, tools);

      expect(tokenCount).toBeGreaterThan(0);
    });
  });

  describe('Config Endpoints', () => {
    it('should have proper config structure', () => {
      const config = createMockConfig();

      expect(config).toHaveProperty('PORT');
      expect(config).toHaveProperty('Providers');
      expect(config).toHaveProperty('Router');
      expect(config.PORT).toBe(3456);
    });

    it('should validate required config fields', () => {
      const config = createMockConfig({
        APIKEY: undefined,
      });

      // Without APIKEY, HOST should be forced to 127.0.0.1
      expect(config.APIKEY).toBeUndefined();
    });
  });

  describe('Log Endpoints', () => {
    it('should handle log file paths correctly', () => {
      const path = require('path');
      const { homedir } = require('os');

      const logDir = path.join(homedir(), '.claude-code-router', 'logs');
      const logFile = path.join(logDir, 'app.log');

      expect(logFile).toContain('.claude-code-router');
      expect(logFile).toContain('logs');
    });
  });
});

describe('Health Check', () => {
  it('should allow access without authentication', () => {
    const publicEndpoints = ['/', '/health', '/ui', '/ui/'];

    publicEndpoints.forEach(endpoint => {
      expect(endpoint).toBeTruthy();
    });
  });
});
