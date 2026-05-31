/**
 * Tests for SemanticCache middleware.
 *
 * Run: pnpm vitest run
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// We test the cache logic in isolation — no Fastify or Express needed.
// The SemanticCache module uses a local Map, making it fully testable.

describe('SemanticCache', () => {
  let cache: any;
  let mockLogger: any;

  beforeEach(async () => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };
    // Dynamic import to avoid module hoisting issues
    const mod = await import('./semantic-cache');
    const { SemanticCache } = mod;
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

    cache.store(requestBody, responseBody, {
      agentName: 'core-implementer',
      taskType: 'coding',
      model: 'claude-sonnet-4-6',
    });

    const result = await cache.lookup(requestBody, {
      agentName: 'core-implementer',
      taskType: 'coding',
    });
    expect(result).toBeDefined();
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

  it('should skip requests matching skip patterns', () => {
    // Load with skipPattern
    cache = new (require('./semantic-cache').SemanticCache)(
      {
        enabled: true,
        ttlMs: 60000,
        maxEntries: 100,
        similarityThreshold: 0.92,
        skipPatterns: ['/api/health', 'ping'],
      },
      mockLogger
    );

    const requestBody = {
      messages: [{ role: 'user', content: 'ping' }],
    };

    cache.store(requestBody, { ok: true }, {});
    expect(cache.getStats().totalEntries).toBe(0);
  });

  it('should evict oldest entry when over maxEntries', async () => {
    // Create a cache with max 2 entries
    const smallCache = new (require('./semantic-cache').SemanticCache)(
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
    // Use a very short TTL
    const shortCache = new (require('./semantic-cache').SemanticCache)(
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

  it('should handle JSON parse errors gracefully', async () => {
    // sanitizeResponse should not throw on circular references
    const badResponse: any = {};
    badResponse.self = badResponse;
    expect(() => cache.sanitizeResponse?.(badResponse)).not.toThrow();
  });
});
