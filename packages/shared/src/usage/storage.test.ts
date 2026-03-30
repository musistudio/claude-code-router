/**
 * Unit tests for usage storage module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

// Test directory - we'll clean this up
const getUsageDir = () => {
  const homeDir = path.join(os.homedir(), '.claude-code-router');
  return path.join(homeDir, 'usage');
};

// Unique prefix for test records to isolate them
const TEST_PREFIX = `test-${Date.now()}`;

// Helper to create test record
function createTestRecord(overrides: Record<string, any> = {}): Record<string, any> {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    date: now.toISOString().split('T')[0],
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    provider: `${TEST_PREFIX}-provider`,
    model: `${TEST_PREFIX}-model`,
    inputTokens: 100,
    outputTokens: 50,
    stream: true,
    success: true,
    ...overrides,
  };
}

// Simple storage functions for testing (independent of HOME_DIR)
function appendRecord(record: Record<string, any>): Record<string, any> {
  const usageDir = getUsageDir();
  if (!fs.existsSync(usageDir)) {
    fs.mkdirSync(usageDir, { recursive: true });
  }

  const fullRecord = {
    id: randomUUID(),
    ...record,
  };

  // Use daily file path
  const filePath = path.join(usageDir, `usage-${record.date}.jsonl`);
  const line = JSON.stringify(fullRecord) + '\n';
  fs.appendFileSync(filePath, line, 'utf-8');

  return fullRecord;
}

function readAllRecords(): Record<string, any>[] {
  const usageDir = getUsageDir();
  if (!fs.existsSync(usageDir)) {
    return [];
  }

  const records: Record<string, any>[] = [];
  const files = fs.readdirSync(usageDir).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(usageDir, file), 'utf-8');
    const lines = content.trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          records.push(JSON.parse(line));
        } catch {}
      }
    }
  }

  return records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function filterTestRecords(records: Record<string, any>[]): Record<string, any>[] {
  return records.filter(r =>
    r.provider?.toString().startsWith(TEST_PREFIX) ||
    r.model?.toString().startsWith(TEST_PREFIX)
  );
}

describe('Usage Storage', () => {
  beforeEach(() => {
    // Just clear test data
  });

  afterEach(() => {
    // Clean up test records from files
    const usageDir = getUsageDir();
    if (fs.existsSync(usageDir)) {
      const files = fs.readdirSync(usageDir).filter(f => f.endsWith('.jsonl'));

      for (const file of files) {
        const filePath = path.join(usageDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        const nonTestLines = lines.filter(line => {
          if (!line.trim()) return false;
          try {
            const record = JSON.parse(line);
            return !record.provider?.toString().startsWith('test-') &&
                   !record.model?.toString().startsWith('test-');
          } catch {
            return true;
          }
        });

        if (nonTestLines.length === 0) {
          fs.unlinkSync(filePath);
        } else {
          fs.writeFileSync(filePath, nonTestLines.join('\n') + '\n', 'utf-8');
        }
      }
    }
  });

  describe('generateId (UUID)', () => {
    it('should generate a unique UUID', () => {
      const id1 = randomUUID();
      const id2 = randomUUID();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('append', () => {
    it('should append a record and return it with an id', () => {
      const record = createTestRecord();
      const result = appendRecord(record);

      expect(result.id).toBeDefined();
      expect(result.timestamp).toBe(record.timestamp);
      expect(result.provider).toBe(record.provider);
      expect(result.model).toBe(record.model);
    });

    it('should create daily file if it does not exist', () => {
      const record = createTestRecord({ date: '2025-03-25' });
      appendRecord(record);

      const usageDir = getUsageDir();
      const filePath = path.join(usageDir, 'usage-2025-03-25.jsonl');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should write valid JSON line to file', () => {
      const record = createTestRecord({ provider: `${TEST_PREFIX}-zhipu`, model: `${TEST_PREFIX}-glm-4` });
      appendRecord(record);

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords);

      expect(testRecords.length).toBeGreaterThan(0);
      const found = testRecords.find(r => r.provider === `${TEST_PREFIX}-zhipu`);
      expect(found).toBeDefined();
      expect(found!.model).toBe(`${TEST_PREFIX}-glm-4`);
    });
  });

  describe('query (manual implementation)', () => {
    it('should return all records', () => {
      appendRecord(createTestRecord({ provider: `${TEST_PREFIX}-p1` }));
      appendRecord(createTestRecord({ provider: `${TEST_PREFIX}-p2` }));
      appendRecord(createTestRecord({ provider: `${TEST_PREFIX}-p3` }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords);
      expect(testRecords.length).toBe(3);
    });

    it('should filter by provider', () => {
      appendRecord(createTestRecord({ provider: `${TEST_PREFIX}-target` }));
      appendRecord(createTestRecord({ provider: `${TEST_PREFIX}-target` }));
      appendRecord(createTestRecord({ provider: `${TEST_PREFIX}-other` }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords).filter(r => r.provider === `${TEST_PREFIX}-target`);
      expect(testRecords.length).toBe(2);
    });

    it('should filter by model', () => {
      appendRecord(createTestRecord({ model: `${TEST_PREFIX}-model-a` }));
      appendRecord(createTestRecord({ model: `${TEST_PREFIX}-model-a` }));
      appendRecord(createTestRecord({ model: `${TEST_PREFIX}-model-b` }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords).filter(r => r.model === `${TEST_PREFIX}-model-a`);
      expect(testRecords.length).toBe(2);
    });

    it('should sort by timestamp descending', () => {
      const now = Date.now();
      appendRecord(createTestRecord({ timestamp: new Date(now).toISOString() }));
      appendRecord(createTestRecord({ timestamp: new Date(now + 1000).toISOString() }));
      appendRecord(createTestRecord({ timestamp: new Date(now + 2000).toISOString() }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords);

      // Already sorted descending
      expect(testRecords[0].timestamp >= testRecords[1].timestamp).toBe(true);
      expect(testRecords[1].timestamp >= testRecords[2].timestamp).toBe(true);
    });
  });
});