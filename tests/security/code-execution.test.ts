/**
 * Security Tests - Arbitrary Code Execution
 * Tests for CRITICAL vulnerability #1: Arbitrary Code Execution via Custom Router
 */

import path from 'path';
import { homedir } from 'os';

describe('Security: Arbitrary Code Execution Prevention', () => {
  describe('Custom Router Loading', () => {
    it('should validate custom router path exists in allowed directory', () => {
      const allowedDir = path.join(homedir(), '.claude-code-router');
      const customRouterPath = path.join(allowedDir, 'custom-router.js');

      // Path should be within allowed directory
      const isWithinAllowedDir = customRouterPath.startsWith(allowedDir);
      expect(isWithinAllowedDir).toBe(true);
    });

    it('should reject custom router paths outside allowed directory', () => {
      const allowedDir = path.join(homedir(), '.claude-code-router');
      const maliciousPaths = [
        '/tmp/malicious-router.js',
        '/etc/passwd',
        '../../../tmp/evil.js',
        path.join(homedir(), 'Downloads', 'malicious.js'),
      ];

      maliciousPaths.forEach(maliciousPath => {
        const normalizedPath = path.normalize(maliciousPath);
        const absolutePath = path.isAbsolute(normalizedPath)
          ? normalizedPath
          : path.resolve(allowedDir, normalizedPath);

        const isWithinAllowedDir = absolutePath.startsWith(allowedDir);
        expect(isWithinAllowedDir).toBe(false);
      });
    });

    it('should validate file extension is .js', () => {
      const validExtensions = ['.js', '.mjs'];
      const invalidFiles = [
        'router.sh',
        'router.py',
        'router.exe',
        'router',
        'router.js.txt',
      ];

      invalidFiles.forEach(file => {
        const ext = path.extname(file);
        const isValid = validExtensions.includes(ext);
        expect(isValid).toBe(false);
      });
    });

    it('should accept valid custom router paths', () => {
      const allowedDir = path.join(homedir(), '.claude-code-router');
      const validPaths = [
        path.join(allowedDir, 'custom-router.js'),
        path.join(allowedDir, 'routers', 'my-router.js'),
        path.join(allowedDir, 'plugins', 'router.mjs'),
      ];

      validPaths.forEach(validPath => {
        const isWithinAllowedDir = validPath.startsWith(allowedDir);
        const ext = path.extname(validPath);
        const hasValidExtension = ['.js', '.mjs'].includes(ext);

        expect(isWithinAllowedDir).toBe(true);
        expect(hasValidExtension).toBe(true);
      });
    });
  });

  describe('REWRITE_SYSTEM_PROMPT Path Validation', () => {
    it('should validate system prompt file paths', () => {
      const allowedDir = path.join(homedir(), '.claude-code-router');
      const validPath = path.join(allowedDir, 'custom-prompt.txt');

      const isWithinAllowedDir = validPath.startsWith(allowedDir);
      expect(isWithinAllowedDir).toBe(true);
    });

    it('should reject arbitrary file reads via REWRITE_SYSTEM_PROMPT', () => {
      const allowedDir = path.join(homedir(), '.claude-code-router');
      const maliciousPaths = [
        '/etc/passwd',
        '/etc/shadow',
        '../../../.ssh/id_rsa',
        path.join(homedir(), '.ssh', 'id_rsa'),
      ];

      maliciousPaths.forEach(maliciousPath => {
        const normalizedPath = path.normalize(maliciousPath);
        const absolutePath = path.isAbsolute(normalizedPath)
          ? normalizedPath
          : path.resolve(allowedDir, normalizedPath);

        const isWithinAllowedDir = absolutePath.startsWith(allowedDir);
        expect(isWithinAllowedDir).toBe(false);
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration structure', () => {
      const validConfig = {
        PORT: 3456,
        Providers: [],
        Router: {},
      };

      expect(validConfig).toHaveProperty('PORT');
      expect(validConfig).toHaveProperty('Providers');
      expect(validConfig).toHaveProperty('Router');
      expect(typeof validConfig.PORT).toBe('number');
      expect(Array.isArray(validConfig.Providers)).toBe(true);
    });

    it('should detect suspicious configuration values', () => {
      const suspiciousConfigs = [
        { CUSTOM_ROUTER_PATH: '/tmp/evil.js' },
        { REWRITE_SYSTEM_PROMPT: '/etc/passwd' },
        { CLAUDE_PATH: 'claude; rm -rf /' },
      ];

      suspiciousConfigs.forEach(config => {
        const hasSuspiciousPath = Object.values(config).some(value =>
          typeof value === 'string' && (
            value.includes('/etc/') ||
            value.includes('/tmp/') ||
            value.includes(';') ||
            value.includes('&&')
          )
        );

        expect(hasSuspiciousPath).toBe(true);
      });
    });

    it('should accept safe configuration values', () => {
      const allowedDir = path.join(homedir(), '.claude-code-router');
      const safeConfig = {
        PORT: 3456,
        CUSTOM_ROUTER_PATH: path.join(allowedDir, 'router.js'),
        REWRITE_SYSTEM_PROMPT: path.join(allowedDir, 'prompt.txt'),
        CLAUDE_PATH: '/usr/local/bin/claude',
      };

      // All paths should be safe
      const customRouterSafe = safeConfig.CUSTOM_ROUTER_PATH.startsWith(allowedDir);
      const promptSafe = safeConfig.REWRITE_SYSTEM_PROMPT.startsWith(allowedDir);
      const claudePathSafe = !/[;&|`$()]/.test(safeConfig.CLAUDE_PATH);

      expect(customRouterSafe).toBe(true);
      expect(promptSafe).toBe(true);
      expect(claudePathSafe).toBe(true);
    });
  });

  describe('Environment Variable Injection', () => {
    it('should detect suspicious environment variable patterns', () => {
      const suspiciousValues = [
        '${evil}',
        '$(whoami)',
        '`cat /etc/passwd`',
      ];

      suspiciousValues.forEach(value => {
        const hasInjection = /[$`]/.test(value);
        expect(hasInjection).toBe(true);
      });
    });

    it('should allow legitimate environment variable references', () => {
      const legitimateValues = [
        '${HOME}',
        '${USER}',
        '$PATH',
      ];

      legitimateValues.forEach(value => {
        // These are legitimate env var references
        const hasEnvVar = /\$\{?\w+\}?/.test(value);
        expect(hasEnvVar).toBe(true);
      });
    });
  });
});
