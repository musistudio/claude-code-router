import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyDiffTracker } from './proxy-diff';

describe('ProxyDiffTracker', () => {
  let tracker: ProxyDiffTracker;

  beforeEach(() => {
    tracker = new ProxyDiffTracker({ enabled: true, maxEntries: 100, ttlMs: 60000 });
  });

  it('should record and retrieve diff entries', () => {
    tracker.startRequest('req-1', {
      body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }] },
      provider: 'openai',
      sessionId: 'sess-1',
    });
    const diff = tracker.getDiff('req-1');
    expect(diff).not.toBeNull();
    expect(diff!.provider).toBe('openai');
    expect(diff!.originalRequest.model).toBe('gpt-4o');
  });

  it('should record modifications', () => {
    tracker.startRequest('req-1', {
      body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }] },
      provider: 'openai',
    });
    tracker.recordModification('req-1', {
      model: 'deepseek-chat',
      enrichments: ['rag_context'],
    });
    const diff = tracker.getDiff('req-1');
    expect(diff!.modifiedRequest).toBeDefined();
    expect(diff!.modifiedRequest!.model).toBe('deepseek-chat');
    expect(diff!.modifiedRequest!.enrichments).toContain('rag_context');
  });

  it('should record response', () => {
    tracker.startRequest('req-1', {
      body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }] },
      provider: 'openai',
    });
    tracker.recordResponse('req-1', {
      statusCode: 200,
      latencyMs: 500,
      contentSummary: 'Hello!',
      cacheHit: false,
    });
    const diff = tracker.getDiff('req-1');
    expect(diff!.response).toBeDefined();
    expect(diff!.response!.statusCode).toBe(200);
  });

  it('should return recent diffs sorted by time', () => {
    for (let i = 0; i < 5; i++) {
      tracker.startRequest(`req-${i}`, {
        body: { model: 'gpt-4o', messages: [{ role: 'user', content: `msg-${i}` }] },
        provider: 'openai',
      });
    }
    const recent = tracker.getRecentDiffs(3);
    expect(recent).toHaveLength(3);
    // All created in same ms, so Map insertion order preserved
    expect(recent[0].id).toMatch(/req-/);
  });

  it('should evict old entries when over max', () => {
    const small = new ProxyDiffTracker({ enabled: true, maxEntries: 2, ttlMs: 60000 });
    small.startRequest('req-1', { body: { model: 'a', messages: [] }, provider: 'a' });
    small.startRequest('req-2', { body: { model: 'b', messages: [] }, provider: 'b' });
    small.startRequest('req-3', { body: { model: 'c', messages: [] }, provider: 'c' });
    expect(small.getStats().totalEntries).toBe(2);
    expect(small.getDiff('req-1')).toBeNull(); // evicted
  });

  it('should return null for unknown diff', () => {
    expect(tracker.getDiff('nonexistent')).toBeNull();
  });

  it('should return stats', () => {
    tracker.startRequest('req-1', { body: { model: 'a', messages: [] }, provider: 'a' });
    const stats = tracker.getStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.enabled).toBe(true);
  });
});
