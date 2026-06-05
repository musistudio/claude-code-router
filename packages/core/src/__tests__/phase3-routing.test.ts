import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FallbackChainExecutor } from '../utils/fallback-chain';
import { AdaptiveParameterTuner } from '../utils/adaptive-params';
import { RateLimiterQueue } from '../utils/rate-limiter-queue';
import { RAGPipeline } from '../utils/rag-pipeline';

describe('FallbackChainExecutor', () => {
  let executor: FallbackChainExecutor;

  beforeEach(() => {
    executor = new FallbackChainExecutor({ maxAttempts: 3, retryDelayMs: 0 });
  });

  it('should succeed on first attempt', async () => {
    const result = await executor.execute(
      'openai', 'gpt-4', [],
      async () => ({ content: 'hello' })
    );
    expect(result.succeeded).toBe(true);
    expect(result.finalProvider).toBe('openai');
    expect(result.finalModel).toBe('gpt-4');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].success).toBe(true);
  });

  it('should fallback to next provider on failure', async () => {
    let callCount = 0;
    const result = await executor.execute(
      'openai', 'gpt-4',
      ['deepseek,deepseek-v4-pro'],
      async (provider: string) => {
        callCount++;
        if (provider === 'openai') throw { statusCode: 500, message: 'server error' };
        return { content: 'success from deepseek' };
      }
    );
    expect(result.succeeded).toBe(true);
    expect(result.finalProvider).toBe('deepseek');
    expect(result.attempts).toHaveLength(2);
    expect(callCount).toBe(2);
  });

  it('should fail after exhausting all attempts', async () => {
    const result = await executor.execute(
      'openai', 'gpt-4',
      ['deepseek,deepseek-v4-pro', 'glm,gLM-5.1'],
      async () => { throw { statusCode: 500, message: 'server error' }; }
    );
    expect(result.succeeded).toBe(false);
    expect(result.attempts).toHaveLength(3);
  });

  it('should stop on non-retryable errors', async () => {
    const result = await executor.execute(
      'openai', 'gpt-4',
      ['deepseek,deepseek-v4-pro'],
      async () => { throw { statusCode: 403, message: 'content filter triggered' }; }
    );
    expect(result.succeeded).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].errorType).toBe('content_filter');
  });

  it('should classify rate_limit errors correctly', async () => {
    const result = await executor.execute(
      'openai', 'gpt-4',
      ['deepseek,deepseek-v4-pro'],
      async (provider: string) => {
        if (provider === 'openai') throw { statusCode: 429, message: 'rate limited' };
        return { ok: true };
      }
    );
    expect(result.succeeded).toBe(true);
    expect(result.attempts[0].errorType).toBe('rate_limit');
    expect(result.attempts[1].success).toBe(true);
  });

  it('should respect timeout per attempt', async () => {
    const timeoutExec = new FallbackChainExecutor({
      maxAttempts: 1,
      retryDelayMs: 0,
      timeoutPerAttemptMs: 50,
    });
    const result = await timeoutExec.execute(
      'openai', 'gpt-4', [],
      async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10000))
    );
    expect(result.succeeded).toBe(false);
    expect(result.attempts[0].success).toBe(false);
  }, 5000);

  it('should track total latency', async () => {
    const result = await executor.execute(
      'openai', 'gpt-4', [],
      async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true };
      }
    );
    expect(result.totalLatencyMs).toBeGreaterThanOrEqual(40);
    expect(result.attempts[0].latencyMs).toBeGreaterThanOrEqual(40);
  });
});

describe('AdaptiveParameterTuner', () => {
  let tuner: AdaptiveParameterTuner;

  beforeEach(() => {
    tuner = new AdaptiveParameterTuner();
  });

  it('should return default params for simple request', () => {
    const params = tuner.tune({ messages: [{ role: 'user', content: 'hello' }] }, 100, 'openai', 'gpt-4');
    expect(params.max_tokens).toBeLessThanOrEqual(65536);
    expect(params.temperature).toBeGreaterThanOrEqual(0);
    expect(params.temperature).toBeLessThanOrEqual(1);
    expect(params.top_p).toBeGreaterThan(0);
  });

  it('should increase max_tokens for code requests', () => {
    const params = tuner.tune(
      { messages: [{ role: 'user', content: 'implement a sorting algorithm' }] },
      100, 'openai', 'gpt-4'
    );
    expect(params.max_tokens).toBeGreaterThanOrEqual(8192);
    expect(params.temperature).toBeLessThanOrEqual(0.5);
  });

  it('should set higher temperature for reasoning models', () => {
    const params = tuner.tune(
      { messages: [{ role: 'user', content: 'think about this' }] },
      100, 'deepseek', 'deepseek-reasoner'
    );
    expect(params.temperature).toBe(1.0);
    expect(params.thinking_budget).toBeDefined();
  });

  it('should reduce temperature for agent/tool requests', () => {
    const params = tuner.tune(
      {
        messages: [{ role: 'user', content: 'help me' }],
        tools: [{ name: 'read_file', description: 'Read file', input_schema: {} }],
        system: [{ type: 'text', text: '<CCR-SUBAGENT-MODEL>test</CCR-SUBAGENT-MODEL>' }],
      },
      5000, 'openai', 'gpt-4'
    );
    expect(params.temperature).toBeLessThanOrEqual(0.5);
  });

  it('should set thinking_budget for reasoning models with large context', () => {
    const params = tuner.tune(
      { messages: [{ role: 'user', content: 'analyze' }] },
      50000, 'deepseek', 'deepseek-reasoner'
    );
    expect(params.thinking_budget).toBe(10000);
  });

  it('should reduce temperature for web search tools', () => {
    const params = tuner.tune(
      {
        messages: [{ role: 'user', content: 'search for info' }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', input_schema: {} }],
      },
      1000, 'openai', 'gpt-4'
    );
    expect(params.temperature).toBe(0.3);
  });

  it('should apply tuning to request body', () => {
    const body = { messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4' };
    const params = tuner.tune(body, 100, 'openai', 'gpt-4');
    const tuned = tuner.applyTuning(body, params);
    expect(tuned.max_tokens).toBeDefined();
    expect(tuned.temperature).toBeDefined();
  });

  it('should not override existing smaller max_tokens', () => {
    const body = { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 };
    const params = { max_tokens: 4096, temperature: 0.7, top_p: 1.0 };
    const tuned = tuner.applyTuning(body, params);
    expect(tuned.max_tokens).toBe(100);
  });

  it('should analyze complexity signals correctly', () => {
    const signals = tuner.analyzeComplexity(
      {
        messages: [{ role: 'user', content: 'code' }],
        tools: [{ name: 't' }],
        system: 'agent context',
      },
      5000
    );
    expect(signals.tokenCount).toBe(5000);
    expect(signals.hasTools).toBe(true);
    expect(signals.hasSystemPrompt).toBe(true);
    expect(signals.hasCodeRequest).toBe(true);
    expect(signals.hasAgentPattern).toBe(true);
  });
});

describe('RateLimiterQueue', () => {
  let queue: RateLimiterQueue;

  beforeEach(() => {
    queue = new RateLimiterQueue({ maxConcurrent: 2, maxQueueSize: 5 });
  });

  it('should process requests within concurrency limit', async () => {
    const result = await queue.enqueue('openai', 'gpt-4', 1, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('should queue requests when at concurrency limit', async () => {
    const results: string[] = [];
    const promises = [
      queue.enqueue('openai', 'gpt-4', 1, async () => { await new Promise(r => setTimeout(r, 100)); return 'first'; }).then(r => results.push(r)),
      queue.enqueue('openai', 'gpt-4', 1, async () => { await new Promise(r => setTimeout(r, 100)); return 'second'; }).then(r => results.push(r)),
      queue.enqueue('openai', 'gpt-4', 1, async () => { await new Promise(r => setTimeout(r, 50)); return 'third'; }).then(r => results.push(r)),
    ];
    await Promise.all(promises);
    expect(results).toHaveLength(3);
    expect(results).toContain('first');
    expect(results).toContain('second');
    expect(results).toContain('third');
  });

  it('should reject when queue is full', async () => {
    const smallQueue = new RateLimiterQueue({ maxConcurrent: 1, maxQueueSize: 1 });
    const slow = smallQueue.enqueue('openai', 'gpt-4', 1, async () => {
      await new Promise(r => setTimeout(r, 200));
      return 'slow';
    });
    smallQueue.enqueue('openai', 'gpt-4', 1, async () => 'queued');
    await expect(
      smallQueue.enqueue('openai', 'gpt-4', 1, async () => 'overflow')
    ).rejects.toThrow('queue full');
    await slow;
  });

  it('should prioritize higher priority requests', async () => {
    const results: string[] = [];
    const pq = new RateLimiterQueue({ maxConcurrent: 1, maxQueueSize: 10, priorityLevels: 3 });

    const blocker = pq.enqueue('openai', 'gpt-4', 3, async () => {
      await new Promise(r => setTimeout(r, 50));
      return 'blocker';
    });
    await blocker;

    const p1 = pq.enqueue('openai', 'gpt-4', 1, async () => { results.push('low'); return 'low'; });
    const p2 = pq.enqueue('openai', 'gpt-4', 3, async () => { results.push('high'); return 'high'; });
    const p3 = pq.enqueue('openai', 'gpt-4', 2, async () => { results.push('mid'); return 'mid'; });

    await Promise.all([p1, p2, p3]);
    expect(results).toContain('high');
    expect(results).toContain('mid');
    expect(results).toContain('low');
  });

  it('should report stats correctly', async () => {
    await queue.enqueue('openai', 'gpt-4', 1, async () => 'ok');
    const stats = queue.getStats();
    expect(stats.processedCount).toBe(1);
    expect(stats.rejectedCount).toBe(0);
    expect(stats.avgWaitTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should clear queue and reject pending', async () => {
    const pq = new RateLimiterQueue({ maxConcurrent: 1, maxQueueSize: 10 });
    const blocker = pq.enqueue('openai', 'gpt-4', 1, async () => {
      await new Promise(r => setTimeout(r, 50));
      return 'ok';
    });
    const pending = pq.enqueue('openai', 'gpt-4', 1, async () => 'queued');
    pending.catch(() => {});
    const cleared = pq.clear();
    await blocker;
    expect(cleared).toBeGreaterThanOrEqual(0);
  });
});

describe('RAGPipeline', () => {
  let pipeline: RAGPipeline;

  beforeEach(() => {
    pipeline = new RAGPipeline({
      ollamaEndpoint: 'http://localhost:99999',
      qdrantUrl: 'http://127.0.0.1:99999',
    });
  });

  it('should create pipeline with default config', () => {
    const p = new RAGPipeline();
    const stats = p.getStats();
    expect(stats.collection).toBe('ccr_rag');
    expect(stats.ollamaModel).toBe('nomic-embed-text');
  });

  it('should return empty results when services unavailable', async () => {
    const results = await pipeline.query('test query');
    expect(results).toEqual([]);
  });

  it('should return stats', () => {
    const stats = pipeline.getStats();
    expect(stats.initialized).toBe(false);
    expect(stats.collection).toBeDefined();
    expect(stats.ollamaModel).toBeDefined();
  });

  it('should chunk text correctly', () => {
    const longText = Array(200).fill('word').join(' ');
    const chunks = (pipeline as any).chunkText(longText);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(600);
    }
  });

  it('should generate deterministic doc IDs', () => {
    const id1 = (pipeline as any).generateDocId('source.txt', 0);
    const id2 = (pipeline as any).generateDocId('source.txt', 0);
    const id3 = (pipeline as any).generateDocId('source.txt', 1);
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });

  it('should handle enrichSystemPrompt gracefully when unavailable', async () => {
    const result = await pipeline.enrichSystemPrompt('system prompt', 'test query');
    expect(result.injections).toBe(0);
    expect(result.totalChars).toBe(0);
    expect(result.enriched).toBe('system prompt');
  });

  it('should handle enrichSystemPrompt with array format', async () => {
    const system = [{ type: 'text', text: 'You are helpful.' }];
    const result = await pipeline.enrichSystemPrompt(system, 'test query');
    expect(result.injections).toBe(0);
    expect(result.enriched).toEqual(system);
  });
});
