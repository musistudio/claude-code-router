import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TEST_CONFIG_DIR = join(homedir(), '.claude-code-router-test');

describe('CLI Commands', () => {
  beforeEach(() => {
    // Create test config directory
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
    // Set environment variable to use test config
    process.env.CCR_CONFIG_DIR = TEST_CONFIG_DIR;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    // Clean up test config directory
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    delete process.env.CCR_CONFIG_DIR;
  });

  // Basic smoke test - just ensure the test setup works
  it('should set up test environment correctly', () => {
    expect(process.env.CCR_CONFIG_DIR).toBe(TEST_CONFIG_DIR);
    expect(existsSync(TEST_CONFIG_DIR)).toBe(true);
  });
});
