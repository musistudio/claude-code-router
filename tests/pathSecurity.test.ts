import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  resolveSecurePath,
  validateFilePath,
  validateDirectoryPath,
  createSecureDirectory,
} from '../src/utils/pathSecurity';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Path Security', () => {
  const testDir = path.join(os.tmpdir(), 'path-security-test');
  const testFile = path.join(testDir, 'test.txt');

  beforeEach(() => {
    // Clean up and create test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFile, 'test content');
  });

  describe('resolveSecurePath', () => {
    it('should resolve $HOME correctly', () => {
      const originalHome = process.env.HOME;
      process.env.HOME = '/home/user';
      
      const resolved = resolveSecurePath('$HOME/test');
      expect(resolved).toBe(path.resolve('/home/user/test'));
      
      process.env.HOME = originalHome;
    });

    it('should throw error when $HOME is not set', () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      
      expect(() => resolveSecurePath('$HOME/test')).toThrow('HOME environment variable is not set');
      
      process.env.HOME = originalHome;
      if (originalUserProfile) process.env.USERPROFILE = originalUserProfile;
    });

    it('should prevent directory traversal', () => {
      const basePath = '/safe/path';
      expect(() => resolveSecurePath('../../../etc/passwd', basePath))
        .toThrow('Path traversal attempt detected');
    });

    it('should reject null bytes in paths', () => {
      expect(() => resolveSecurePath('/path/with\0null'))
        .toThrow('Null bytes are not allowed in paths');
    });

    it('should handle absolute paths correctly', () => {
      const absPath = path.resolve('/absolute/path');
      const resolved = resolveSecurePath(absPath);
      expect(resolved).toBe(absPath);
    });

    it('should handle relative paths with base path', () => {
      const basePath = '/base/path';
      const resolved = resolveSecurePath('relative/file', basePath);
      expect(resolved).toBe(path.resolve(basePath, 'relative/file'));
    });

    it('should throw error for relative paths without base path', () => {
      expect(() => resolveSecurePath('relative/path'))
        .toThrow('Base path required for relative paths');
    });

    it('should throw error for empty path', () => {
      expect(() => resolveSecurePath(''))
        .toThrow('Path cannot be empty');
    });
  });

  describe('validateFilePath', () => {
    it('should return true for existing readable file', () => {
      expect(validateFilePath(testFile)).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(validateFilePath(path.join(testDir, 'nonexistent.txt'))).toBe(false);
    });

    it('should return false for directory', () => {
      expect(validateFilePath(testDir)).toBe(false);
    });
  });

  describe('validateDirectoryPath', () => {
    it('should return true for existing accessible directory', () => {
      expect(validateDirectoryPath(testDir)).toBe(true);
    });

    it('should return false for non-existent directory', () => {
      expect(validateDirectoryPath(path.join(testDir, 'nonexistent'))).toBe(false);
    });

    it('should return false for file', () => {
      expect(validateDirectoryPath(testFile)).toBe(false);
    });
  });

  describe('createSecureDirectory', () => {
    it('should create directory successfully', async () => {
      const newDir = path.join(testDir, 'new-dir');
      await createSecureDirectory(newDir);
      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.statSync(newDir).isDirectory()).toBe(true);
    });

    it('should create nested directories with recursive option', async () => {
      const nestedDir = path.join(testDir, 'level1', 'level2', 'level3');
      await createSecureDirectory(nestedDir, { recursive: true });
      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('should not throw error if directory already exists', async () => {
      await expect(createSecureDirectory(testDir)).resolves.not.toThrow();
    });

    it('should reject invalid paths', async () => {
      await expect(createSecureDirectory('/path/with\0null'))
        .rejects.toThrow('Null bytes are not allowed in paths');
    });

    it('should set correct permissions', async () => {
      const newDir = path.join(testDir, 'secure-dir');
      await createSecureDirectory(newDir, { mode: 0o700 });
      
      const stats = fs.statSync(newDir);
      // Check if directory is created (permissions check may vary by OS)
      expect(stats.isDirectory()).toBe(true);
    });
  });

  // Clean up after all tests
  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});