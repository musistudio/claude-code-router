import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyRotator } from './key-rotator';

describe('KeyRotator', () => {
  let rotator: KeyRotator;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
    rotator = new KeyRotator({
      enabled: true,
      strategy: 'round_robin',
      cooldownMs: 100,
      maxFailures: 2,
    }, mockLogger);
  });

  it('should return single key for provider', () => {
    rotator.registerKeys('openai', ['sk-key1']);
    expect(rotator.getKey('openai')).toBe('sk-key1');
  });

  it('should rotate keys round-robin', () => {
    rotator.registerKeys('openai', ['key1', 'key2', 'key3']);
    expect(rotator.getKey('openai')).toBe('key1');
    expect(rotator.getKey('openai')).toBe('key2');
    expect(rotator.getKey('openai')).toBe('key3');
    expect(rotator.getKey('openai')).toBe('key1'); // wraps
  });

  it('should mark key unhealthy after max failures', () => {
    rotator.registerKeys('openai', ['key1', 'key2']);
    rotator.reportFailure('openai', 'key1', 'err');
    rotator.reportFailure('openai', 'key1', 'err');
    // key1 should be unhealthy, key2 should be returned
    const key = rotator.getKey('openai');
    expect(key).toBe('key2');
  });

  it('should recover unhealthy keys after cooldown', async () => {
    rotator.registerKeys('openai', ['key1']);
    rotator.reportFailure('openai', 'key1', 'err');
    rotator.reportFailure('openai', 'key1', 'err');
    // key1 is unhealthy, but only 1 key → uses least recently failed
    expect(rotator.getKey('openai')).toBe('key1');

    await new Promise(r => setTimeout(r, 150));
    // After cooldown, key1 should be healthy again
    rotator.getKey('openai'); // triggers recovery
    const stats = rotator.getStats();
    expect(stats.openai.healthyKeys).toBe(1);
  });

  it('should reset failures on success', () => {
    rotator.registerKeys('openai', ['key1']);
    rotator.reportFailure('openai', 'key1', 'err');
    rotator.reportSuccess('openai', 'key1');
    const stats = rotator.getStats();
    expect(stats.openai.keys[0].failures).toBe(0);
  });

  it('should return null for unknown provider', () => {
    expect(rotator.getKey('unknown')).toBeNull();
  });

  it('should return stats', () => {
    rotator.registerKeys('openai', ['k1', 'k2']);
    rotator.registerKeys('deepseek', ['d1']);
    const stats = rotator.getStats();
    expect(stats.openai.totalKeys).toBe(2);
    expect(stats.deepseek.totalKeys).toBe(1);
  });

  it('should work with least_used strategy', () => {
    const leastUsed = new KeyRotator({
      enabled: true,
      strategy: 'least_used',
    }, mockLogger);
    leastUsed.registerKeys('openai', ['key1', 'key2']);
    // Both 0 uses → reduce picks key2 (same uses, but key2 is second in array)
    const first = leastUsed.getKey('openai');
    expect(['key1', 'key2']).toContain(first);
    // After first call, the selected key has 1 use, other has 0
    const second = leastUsed.getKey('openai');
    expect(['key1', 'key2']).toContain(second);
  });

  it('should accept string key (not array)', () => {
    rotator.registerKeys('openai', 'single-key');
    expect(rotator.getKey('openai')).toBe('single-key');
  });
});
