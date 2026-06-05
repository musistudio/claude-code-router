/**
 * Tests for SemanticCache middleware.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemanticCache } from './semantic-cache';

describe('SemanticCache', () => {
  let cache: SemanticCache;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };
    cache = new SemanticCache(
      {
        enabled: true,
        ttlMs: 60000,
        maxEntries: 100,
        similarityThreshold: 0.92,
      },
      mockLogger
    );
  });

  it('should return null on cache miss', async () => {
    const result = await cache.lookup(
      {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Write a test' }],
        system: 'You are a helpful assistant',
        max_tokens: 100,
        stream: false,
      },
      { agentName: 'core-implementer', taskType: 'test' }
    );
    expect(result).toBeNull();
  });

  it('should store and retrieve a cached response', async () => {
    const requestBody = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Write a hello world' }],
      system: 'You are a helpful assistant',
      max_tokens: 100,
      stream: false,
    };
    const responseBody = {
      id: 'msg-1',
      model: 'claude-sonnet-4-6',
      content: [{ type: 'text', text: 'Hello World!' }],
      usage: { input_tokens: 10, output_tokens: 3 },
    };

    const context = {
      agentName: 'core-implementer',
      taskType: 'coding',
      model: 'claude-sonnet-4-6',
    };

    cache.store(requestBody, responseBody, context);
    expect(cache.getStats().totalEntries).toBe(1);

    const result = await cache.lookup(requestBody, context);
    expect(result).not.toBeNull();
    expect(result.content[0].text).toBe('Hello World!');
  });

  it('should skip streaming requests', () => {
    const requestBody = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
    };

    cache.store(requestBody, { content: 'streamed' }, {});
    expect(cache.getStats().totalEntries).toBe(0);
  });

  it('should skip requests matching skip patterns', async () => {
    const skipCache = new SemanticCache(
      {
        enabled: true,
        ttlMs: 60000,
        maxEntries: 100,
        temperatureThreshold: 0.5,
      },
      mockLogger
    );

    // High temperature request should be skipped
    const requestBody = {
      messages: [{ role: 'user', content: 'creative writing' }],
      temperature: 0.9,
    };

    skipCache.store(requestBody, { ok: true }, {});
    expect(skipCache.getStats().totalEntries).toBe(0);
  });

  it('should evict oldest entry when over maxEntries', async () => {
    const smallCache = new SemanticCache(
      {
        enabled: true,
        ttlMs: 60000,
        maxEntries: 2,
        similarityThreshold: 0,
      },
      mockLogger
    );

    for (let i = 0; i < 3; i++) {
      const body = { messages: [{ role: 'user', content: `msg-${i}` }] };
      smallCache.store(body, { content: `response-${i}` }, { agentName: 'test', taskType: 'test', model: 'test' });
    }

    expect(smallCache.getStats().totalEntries).toBe(2);
  });

  it('should expire entries after TTL', async () => {
    const shortCache = new SemanticCache(
      {
        enabled: true,
        ttlMs: 1,
        maxEntries: 10,
        similarityThreshold: 0,
      },
      mockLogger
    );

    const body = { messages: [{ role: 'user', content: 'ephemeral' }] };
    shortCache.store(body, { content: 'gone' }, { agentName: 'test', taskType: 'test', model: 'test' });

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 5));

    const result = await shortCache.lookup(body, { agentName: 'test', taskType: 'test' });
    expect(result).toBeNull();
  });

  it('should handle JSON parse errors gracefully', () => {
    const badResponse: any = {};
    badResponse.self = badResponse;
    // sanitizeResponse should not throw on circular references
    expect(() => cache['sanitizeResponse']?.(badResponse)).not.toThrow();
  });

  it('should return null when disabled', async () => {
    const disabledCache = new SemanticCache({ enabled: false }, mockLogger);
    const body = { messages: [{ role: 'user', content: 'test' }] };
    disabledCache.store(body, { content: 'stored' }, { model: 'test' });
    const result = await disabledCache.lookup(body, {});
    expect(result).toBeNull();
  });

  it('should track hit count', async () => {
    const body = { messages: [{ role: 'user', content: 'repeat' }] };
    const response = { content: 'cached' };
    const context = { agentName: 'test', taskType: 'test', model: 'test' };

    cache.store(body, response, context);

    await cache.lookup(body, context);
    await cache.lookup(body, context);
    await cache.lookup(body, context);

    const stats = cache.getStats();
    expect(stats.totalHits).toBe(3);
  });

  it('should clear all entries', () => {
    const body = { messages: [{ role: 'user', content: 'test' }] };
    cache.store(body, { content: 'data' }, { model: 'test' });
    expect(cache.getStats().totalEntries).toBe(1);

    cache.clear();
    expect(cache.getStats().totalEntries).toBe(0);
  });

  it('should skip high temperature requests in both store and lookup', async () => {
    const body = {
      messages: [{ role: 'user', content: 'creative' }],
      temperature: 0.9,
    };
    // shouldSkip now checks temperature, so store also skips
    cache.store(body, { content: 'result' }, { model: 'test' });
    expect(cache.getStats().totalEntries).toBe(0);

    // lookup should also skip
    const result = await cache.lookup(body, {});
    expect(result).toBeNull();
  });

  it('should generate different cache keys for different agents', async () => {
    const body = { messages: [{ role: 'user', content: 'same query' }] };
    cache.store(body, { content: 'response1' }, { agentName: 'agent-a', model: 'test' });

    const result = await cache.lookup(body, { agentName: 'agent-b' });
    expect(result).toBeNull();
  });
});
