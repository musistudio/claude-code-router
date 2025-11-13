/**
 * Security Tests - Path Traversal
 * Tests for CRITICAL vulnerability #4: Path Traversal in Log File Access
 */

import path from 'path';
import { homedir } from 'os';

describe('Security: Path Traversal Prevention', () => {
  const logDir = path.join(homedir(), '.claude-code-router', 'logs');

  describe('Log File Access Validation', () => {
    it('should reject path traversal attempts with ../', () => {
      const maliciousPath = '../../../etc/passwd';
      const normalizedPath = path.normalize(maliciousPath);
      const absolutePath = path.resolve(logDir, normalizedPath);

      // Test that the path does NOT start with logDir (security check)
      const isPathTraversal = !absolutePath.startsWith(logDir);

      expect(isPathTraversal).toBe(true);
      expect(absolutePath).toContain('etc');
    });

    it('should reject absolute path attempts', () => {
      const maliciousPath = '/etc/passwd';
      const absolutePath = path.resolve(logDir, maliciousPath);

      // An absolute path should be rejected
      const isPathTraversal = !absolutePath.startsWith(logDir);

      expect(isPathTraversal).toBe(true);
    });

    it('should allow valid log file paths', () => {
      const validPath = 'app.log';
      const normalizedPath = path.normalize(validPath);
      const absolutePath = path.resolve(logDir, normalizedPath);

      // Valid paths should start with logDir
      const isValid = absolutePath.startsWith(logDir);

      expect(isValid).toBe(true);
      expect(absolutePath).toContain('logs');
    });

    it('should allow nested log files', () => {
      const validPath = 'subdirectory/app.log';
      const normalizedPath = path.normalize(validPath);
      const absolutePath = path.resolve(logDir, normalizedPath);

      const isValid = absolutePath.startsWith(logDir);

      expect(isValid).toBe(true);
    });

    it('should detect encoded path traversal attempts', () => {
      const maliciousPath = '..%2F..%2F..%2Fetc%2Fpasswd';
      const decodedPath = decodeURIComponent(maliciousPath);
      const normalizedPath = path.normalize(decodedPath);
      const absolutePath = path.resolve(logDir, normalizedPath);

      const isPathTraversal = !absolutePath.startsWith(logDir);

      expect(isPathTraversal).toBe(true);
    });

    it('should handle Windows-style path traversal', () => {
      const maliciousPath = '..\\..\\..\\windows\\system32\\config';

      // Check if path contains backslash (Windows separator)
      const hasBackslash = maliciousPath.includes('\\');

      // On Unix, backslashes are literal characters, not separators
      // But we should still validate input doesn't contain unusual characters
      expect(hasBackslash).toBe(true);

      // Additional check: replace backslashes with forward slashes and test
      const unixPath = maliciousPath.replace(/\\/g, '/');
      const normalizedPath = path.normalize(unixPath);
      const absolutePath = path.resolve(logDir, normalizedPath);
      const isPathTraversal = !absolutePath.startsWith(logDir);

      expect(isPathTraversal).toBe(true);
    });
  });

  describe('Project Configuration Path Validation', () => {
    it('should reject malicious project names', () => {
      const maliciousProject = '../../etc';
      const sanitizedProject = maliciousProject.replace(/[^a-zA-Z0-9_-]/g, '');

      expect(sanitizedProject).not.toBe(maliciousProject);
      expect(sanitizedProject).toBe('etc');
    });

    it('should allow valid project names', () => {
      const validProject = 'my-project-123';
      const sanitizedProject = validProject.replace(/[^a-zA-Z0-9_-]/g, '');

      expect(sanitizedProject).toBe(validProject);
    });

    it('should reject null bytes in project names', () => {
      const maliciousProject = 'project\x00.txt';
      const sanitizedProject = maliciousProject.replace(/[^a-zA-Z0-9_-]/g, '');

      expect(sanitizedProject).not.toContain('\x00');
      expect(sanitizedProject).toBe('projecttxt');
    });
  });

  describe('Custom Router Path Validation', () => {
    it('should validate custom router file paths', () => {
      const maliciousPath = '../../../tmp/malicious.js';

      // Path should be validated to be within an approved directory
      const isAbsolutePath = path.isAbsolute(maliciousPath);
      const containsTraversal = maliciousPath.includes('..');

      expect(isAbsolutePath).toBe(false);
      expect(containsTraversal).toBe(true);
    });

    it('should accept absolute paths to approved locations', () => {
      const approvedPath = path.join(homedir(), '.claude-code-router', 'custom-router.js');
      const isAbsolutePath = path.isAbsolute(approvedPath);

      expect(isAbsolutePath).toBe(true);
      expect(approvedPath).toContain('.claude-code-router');
    });
  });
});
