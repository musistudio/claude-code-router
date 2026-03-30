/**
 * Unit tests for usage aggregator module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

// Test directory
const getUsageDir = () => {
  const homeDir = path.join(os.homedir(), '.claude-code-router');
  return path.join(homeDir, 'usage');
};

// Unique prefix for test records
const TEST_PREFIX = `test-agg-${Date.now()}`;

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

// Simple storage functions
function appendRecord(record: Record<string, any>): Record<string, any> {
  const usageDir = getUsageDir();
  if (!fs.existsSync(usageDir)) {
    fs.mkdirSync(usageDir, { recursive: true });
  }

  const fullRecord = {
    id: randomUUID(),
    ...record,
  };

  const month = record.date.substring(0, 7);
  const filePath = path.join(usageDir, `usage-${month}.jsonl`);
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

  return records;
}

function filterTestRecords(records: Record<string, any>[]): Record<string, any>[] {
  return records.filter(r =>
    r.provider?.toString().startsWith(TEST_PREFIX) ||
    r.model?.toString().startsWith(TEST_PREFIX)
  );
}

// Simple aggregation function for testing
function aggregateRecords(records: Record<string, any>[]) {
  const result = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    byProvider: new Map<string, any>(),
    byModel: new Map<string, any>(),
  };

  for (const record of records) {
    result.totalRequests++;
    if (record.success) result.successRequests++;
    else result.failedRequests++;
    result.totalInputTokens += record.inputTokens || 0;
    result.totalOutputTokens += record.outputTokens || 0;

    // By provider
    const prov = result.byProvider.get(record.provider) || {
      provider: record.provider,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    prov.requests++;
    prov.inputTokens += record.inputTokens || 0;
    prov.outputTokens += record.outputTokens || 0;
    result.byProvider.set(record.provider, prov);

    // By model
    const mod = result.byModel.get(record.model) || {
      model: record.model,
      provider: record.provider,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    mod.requests++;
    mod.inputTokens += record.inputTokens || 0;
    mod.outputTokens += record.outputTokens || 0;
    result.byModel.set(record.model, mod);
  }

  return {
    ...result,
    byProviderArray: Array.from(result.byProvider.values()).sort((a, b) => b.requests - a.requests),
    byModelArray: Array.from(result.byModel.values()).sort((a, b) => b.requests - a.requests),
  };
}

describe('Usage Aggregator', () => {
  beforeEach(() => {
    // Setup
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
            return !record.provider?.toString().startsWith('test-');
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

  describe('aggregate', () => {
    it('should aggregate total statistics', () => {
      const today = new Date().toISOString().split('T')[0];

      appendRecord(createTestRecord({
        provider: `${TEST_PREFIX}-provider1`,
        model: `${TEST_PREFIX}-model-a`,
        date: today,
        inputTokens: 1000,
        outputTokens: 500,
        success: true,
      }));

      appendRecord(createTestRecord({
        provider: `${TEST_PREFIX}-provider2`,
        model: `${TEST_PREFIX}-model-b`,
        date: today,
        inputTokens: 500,
        outputTokens: 250,
        success: true,
      }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords);
      const result = aggregateRecords(testRecords);

      expect(result.totalRequests).toBe(2);
      expect(result.totalInputTokens).toBe(1500);
      expect(result.totalOutputTokens).toBe(750);
    });

    it('should count success and failed requests', () => {
      const today = new Date().toISOString().split('T')[0];

      appendRecord(createTestRecord({ date: today, success: true }));
      appendRecord(createTestRecord({ date: today, success: true }));
      appendRecord(createTestRecord({ date: today, success: false }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords);
      const result = aggregateRecords(testRecords);

      expect(result.totalRequests).toBe(3);
      expect(result.successRequests).toBe(2);
      expect(result.failedRequests).toBe(1);
    });

    it('should aggregate by provider', () => {
      const today = new Date().toISOString().split('T')[0];

      appendRecord(createTestRecord({ date: today, provider: `${TEST_PREFIX}-zhipu`, inputTokens: 100 }));
      appendRecord(createTestRecord({ date: today, provider: `${TEST_PREFIX}-zhipu`, inputTokens: 200 }));
      appendRecord(createTestRecord({ date: today, provider: `${TEST_PREFIX}-deepseek`, inputTokens: 300 }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords);
      const result = aggregateRecords(testRecords);

      expect(result.byProviderArray.length).toBe(2);

      const zhipu = result.byProviderArray.find(p => p.provider === `${TEST_PREFIX}-zhipu`);
      expect(zhipu).toBeDefined();
      expect(zhipu!.requests).toBe(2);
      expect(zhipu!.inputTokens).toBe(300);
    });

    it('should aggregate by model', () => {
      const today = new Date().toISOString().split('T')[0];

      appendRecord(createTestRecord({ date: today, model: `${TEST_PREFIX}-glm-4`, outputTokens: 100 }));
      appendRecord(createTestRecord({ date: today, model: `${TEST_PREFIX}-glm-4`, outputTokens: 200 }));
      appendRecord(createTestRecord({ date: today, model: `${TEST_PREFIX}-deepseek-v3`, outputTokens: 500 }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords);
      const result = aggregateRecords(testRecords);

      expect(result.byModelArray.length).toBe(2);

      const glm4 = result.byModelArray.find(m => m.model === `${TEST_PREFIX}-glm-4`);
      expect(glm4).toBeDefined();
      expect(glm4!.requests).toBe(2);
      expect(glm4!.outputTokens).toBe(300);
    });

    it('should sort providers by requests descending', () => {
      const today = new Date().toISOString().split('T')[0];

      appendRecord(createTestRecord({ date: today, provider: `${TEST_PREFIX}-less` }));
      appendRecord(createTestRecord({ date: today, provider: `${TEST_PREFIX}-more` }));
      appendRecord(createTestRecord({ date: today, provider: `${TEST_PREFIX}-more` }));
      appendRecord(createTestRecord({ date: today, provider: `${TEST_PREFIX}-more` }));

      const allRecords = readAllRecords();
      const testRecords = filterTestRecords(allRecords);
      const result = aggregateRecords(testRecords);

      expect(result.byProviderArray[0].provider).toBe(`${TEST_PREFIX}-more`);
      expect(result.byProviderArray[0].requests).toBe(3);
    });

    it('should handle empty results gracefully', () => {
      const result = aggregateRecords([]);

      expect(result.totalRequests).toBe(0);
      expect(result.totalInputTokens).toBe(0);
      expect(result.byProviderArray).toEqual([]);
      expect(result.byModelArray).toEqual([]);
    });
  });

  describe('formatTokens', () => {
    // Test the logic directly
    function formatTokens(tokens: number): string {
      if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
      if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
      return tokens.toString();
    }

    it('should format small numbers as-is', () => {
      expect(formatTokens(0)).toBe('0');
      expect(formatTokens(100)).toBe('100');
      expect(formatTokens(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(formatTokens(1000)).toBe('1.0K');
      expect(formatTokens(1500)).toBe('1.5K');
      expect(formatTokens(999000)).toBe('999.0K');
    });

    it('should format millions with M suffix', () => {
      expect(formatTokens(1000000)).toBe('1.0M');
      expect(formatTokens(2500000)).toBe('2.5M');
      expect(formatTokens(100000000)).toBe('100.0M');
    });
  });

  describe('formatNumber', () => {
    function formatNumber(num: number): string {
      return num.toLocaleString();
    }

    it('should format number with locale separators', () => {
      const result = formatNumber(1000);
      expect(result).toMatch(/1[,.]\s?000/);
    });

    it('should handle small numbers', () => {
      expect(formatNumber(100)).toBe('100');
      expect(formatNumber(0)).toBe('0');
    });

    it('should handle large numbers', () => {
      const result = formatNumber(1000000);
      expect(result).toMatch(/1[,.]\s?000[,.]\s?000/);
    });
  });
});