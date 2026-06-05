import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VaultManager } from '../services/vault';
import { AdaptiveRouter } from '../utils/adaptive-router';
import { L1MemoryCache, MultiLevelCache, computeMessagesHash, computeParamsHash } from '../utils/multi-level-cache';
import { SecurityHardener } from '../utils/security-hardener';
import { PrometheusExporter } from '../utils/prometheus';
import { ReasoningChainEngine, ChainTemplate } from '../engines/reasoning-chain';
import { TrafficMirror } from '../utils/traffic-mirror';
import { ContextStore } from '../services/context-store';

describe('VaultManager', () => {
  it('should create and initialize vault', async () => {
    const vault = new VaultManager({
      vaultPath: `${process.env.TEMP || '/tmp'}/test-vault-${Date.now()}.enc`,
    });
    await vault.initialize('test-password-123');
    expect(vault.getStats().initialized).toBe(true);
    expect(vault.getStats().secretCount).toBe(0);
  });

  it('should store and retrieve secrets', async () => {
    const vault = new VaultManager({
      vaultPath: `${process.env.TEMP || '/tmp'}/test-vault-${Date.now()}.enc`,
    });
    await vault.initialize('test-password-123');
    await vault.setSecret('OPENAI_API_KEY', 'sk-test-key-12345678');
    const value = await vault.getSecret('OPENAI_API_KEY');
    expect(value).toBe('sk-test-key-12345678');
  });

  it('should reject short passwords', async () => {
    const vault = new VaultManager({
      vaultPath: `${process.env.TEMP || '/tmp'}/test-vault-${Date.now()}.enc`,
    });
    await expect(vault.initialize('short')).rejects.toThrow('at least 8 characters');
  });

  it('should list stored keys', async () => {
    const vault = new VaultManager({
      vaultPath: `${process.env.TEMP || '/tmp'}/test-vault-${Date.now()}.enc`,
    });
    await vault.initialize('test-password-123');
    await vault.setSecret('KEY_A', 'value-a');
    await vault.setSecret('KEY_B', 'value-b');
    const keys = await vault.listKeys();
    expect(keys).toContain('KEY_A');
    expect(keys).toContain('KEY_B');
  });

  it('should delete secrets', async () => {
    const vault = new VaultManager({
      vaultPath: `${process.env.TEMP || '/tmp'}/test-vault-${Date.now()}.enc`,
    });
    await vault.initialize('test-password-123');
    await vault.setSecret('TO_DELETE', 'value');
    const deleted = await vault.deleteSecret('TO_DELETE');
    expect(deleted).toBe(true);
    const value = await vault.getSecret('TO_DELETE');
    expect(value).toBeNull();
  });

  it('should persist across instances', async () => {
    const path = `${process.env.TEMP || '/tmp'}/test-vault-persist-${Date.now()}.enc`;
    const vault1 = new VaultManager({ vaultPath: path });
    await vault1.initialize('test-password-123');
    await vault1.setSecret('PERSIST_KEY', 'persistent-value');

    const vault2 = new VaultManager({ vaultPath: path });
    await vault2.initialize('test-password-123');
    const value = await vault2.getSecret('PERSIST_KEY');
    expect(value).toBe('persistent-value');
  });
});

describe('AdaptiveRouter', () => {
  let router: AdaptiveRouter;

  beforeEach(() => {
    router = new AdaptiveRouter(
      { strategy: 'least-latency' },
      { default: ['provider-b,model-b'] }
    );
  });

  it('should register providers', () => {
    router.registerProvider('provider-a', 100);
    router.registerProvider('provider-b', 80);
    const metrics = router.getAllMetrics();
    expect(Object.keys(metrics)).toHaveLength(2);
  });

  it('should route single candidate directly', () => {
    const result = router.route([
      { provider: 'provider-a', model: 'model-a', weight: 100 },
    ]);
    expect(result.provider).toBe('provider-a');
    expect(result.reason).toBe('single-candidate');
  });

  it('should select higher scored provider', () => {
    router.registerProvider('fast', 100);
    router.registerProvider('slow', 50);
    router.reportSuccess('fast', 100);
    router.reportSuccess('slow', 2000);

    const result = router.route([
      { provider: 'fast', model: 'm1', weight: 100 },
      { provider: 'slow', model: 'm2', weight: 50 },
    ]);
    expect(result.provider).toBe('fast');
  });

  it('should penalize failing providers', () => {
    router.registerProvider('reliable', 100);
    router.registerProvider('flaky', 100);
    router.reportFailure('flaky', 'server_error');
    router.reportFailure('flaky', 'server_error');
    router.reportSuccess('reliable', 100);

    const result = router.route([
      { provider: 'reliable', model: 'm1', weight: 100 },
      { provider: 'flaky', model: 'm2', weight: 100 },
    ]);
    expect(result.provider).toBe('reliable');
  });

  it('should return fallback chain', () => {
    const result = router.route([
      { provider: 'a', model: 'm1', weight: 100 },
    ], 'default');
    expect(result.fallbackChain).toEqual(['provider-b,model-b']);
  });

  it('should track metrics', () => {
    router.registerProvider('test', 100);
    router.reportSuccess('test', 150);
    router.reportFailure('test', 'timeout');
    const metrics = router.getProviderMetrics('test');
    expect(metrics?.totalRequests).toBe(2);
    expect(metrics?.failureCount).toBe(1);
  });
});

describe('L1MemoryCache', () => {
  let cache: L1MemoryCache;

  beforeEach(() => {
    cache = new L1MemoryCache({ maxSize: 100, defaultTtlMs: 60000 });
  });

  it('should build consistent cache keys', () => {
    const key1 = cache.buildKey('gpt-4', [{ role: 'user', content: 'hello' }], { temperature: 0.7 });
    const key2 = cache.buildKey('gpt-4', [{ role: 'user', content: 'hello' }], { temperature: 0.7 });
    expect(cache.toCacheKeyString(key1)).toBe(cache.toCacheKeyString(key2));
  });

  it('should cache and retrieve responses', () => {
    const key = cache.buildKey('gpt-4', [{ role: 'user', content: 'test' }]);
    cache.set(key, { content: 'response' }, 'openai', 'gpt-4');
    const entry = cache.get(key);
    expect(entry).not.toBeNull();
    expect(entry?.response.content).toBe('response');
  });

  it('should report cache miss for missing keys', () => {
    const key = cache.buildKey('gpt-4', [{ role: 'user', content: 'miss' }]);
    const entry = cache.get(key);
    expect(entry).toBeNull();
  });

  it('should track stats', () => {
    const key = cache.buildKey('gpt-4', [{ role: 'user', content: 'stats' }]);
    cache.set(key, { content: 'r' }, 'openai', 'gpt-4');
    cache.get(key);
    cache.get(cache.buildKey('gpt-4', [{ role: 'user', content: 'other' }]));
    const stats = cache.getStats();
    expect(stats.hitCount).toBe(1);
    expect(stats.missCount).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  it('should invalidate by pattern', () => {
    const key = cache.buildKey('gpt-4', [{ role: 'user', content: 'inv' }]);
    cache.set(key, { content: 'r' }, 'openai', 'gpt-4');
    const count = cache.invalidate('gpt-4');
    expect(count).toBe(1);
    expect(cache.get(key)).toBeNull();
  });
});

describe('SecurityHardener', () => {
  let hardener: SecurityHardener;

  beforeEach(() => {
    hardener = new SecurityHardener();
  });

  it('should redact Authorization headers', () => {
    const result = hardener.redactHeaders({
      'Authorization': 'Bearer sk-abc123def456ghi789',
      'Content-Type': 'application/json',
    });
    expect(result['Authorization']).toBe('Bearer...i789');
    expect(result['Content-Type']).toBe('application/json');
  });

  it('should redact API keys in strings', () => {
    const result = hardener.redactString('key=sk-abc123def456ghi789jkl012mno345');
    expect(result).not.toContain('sk-abc123def456ghi789jkl012mno345');
    expect(result).toContain('...');
  });

  it('should redact sensitive body fields', () => {
    const result = hardener.redactBody({
      model: 'gpt-4',
      apiKey: 'sk-super-secret-key-1234567890',
      messages: [],
    });
    expect(result.apiKey).not.toBe('sk-super-secret-key-1234567890');
    expect(result.apiKey).toContain('...');
  });

  it('should detect sensitive data', () => {
    const result = hardener.scanForLeaks('my api key is sk-abc123def456ghi789jkl012mno345pqr678', 'test');
    expect(result.hasLeak).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('should generate unique trace IDs', () => {
    const id1 = hardener.generateTraceId();
    const id2 = hardener.generateTraceId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^trace-/);
  });
});

describe('PrometheusExporter', () => {
  let exporter: PrometheusExporter;

  beforeEach(() => {
    exporter = new PrometheusExporter();
  });

  it('should export metrics in Prometheus format', () => {
    exporter.increment('ccr_requests_total', 1, {
      provider: 'openai', model: 'gpt-4', scenario: 'default', status: 'success',
    });
    const output = exporter.export();
    expect(output).toContain('ccr_requests_total');
    expect(output).toContain('# HELP');
    expect(output).toContain('# TYPE');
  });

  it('should record request metrics', () => {
    exporter.recordRequest({
      provider: 'deepseek',
      model: 'deepseek-chat',
      scenario: 'default',
      status: 'success',
      durationMs: 1500,
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.05,
      cacheHit: false,
    });

    const output = exporter.export();
    expect(output).toContain('ccr_requests_total');
    expect(output).toContain('ccr_tokens_total');
    expect(output).toContain('ccr_cost_total');
  });

  it('should track histograms', () => {
    exporter.observe('ccr_request_duration_seconds', 1.5, { provider: 'openai', model: 'gpt-4' });
    const output = exporter.export();
    expect(output).toContain('ccr_request_duration_seconds_bucket');
    expect(output).toContain('ccr_request_duration_seconds_sum');
  });
});

describe('ContextStore', () => {
  let store: ContextStore;

  beforeEach(() => {
    store = new ContextStore({ backend: 'memory', embeddingEndpoint: '' });
  });

  it('should store and query entries', async () => {
    const id = await store.store({
      content: 'This is a test context about React hooks',
      tags: ['react', 'hooks'],
      source: 'test',
    });
    expect(id).toBeTruthy();

    const results = await store.query({ text: 'React hooks', tags: ['react'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('React hooks');
  });

  it('should filter by tags', async () => {
    await store.store({ content: 'Python code', tags: ['python'], source: 'test' });
    await store.store({ content: 'TypeScript code', tags: ['typescript'], source: 'test' });

    const results = await store.query({ text: 'code', tags: ['python'] });
    expect(results.every(r => r.tags.includes('python'))).toBe(true);
  });

  it('should delete entries', async () => {
    const id = await store.store({ content: 'To delete', tags: [], source: 'test' });
    const deleted = await store.delete(id);
    expect(deleted).toBe(true);
  });

  it('should report stats', async () => {
    await store.store({ content: 'Entry 1', tags: ['a'], source: 'test' });
    await store.store({ content: 'Entry 2', tags: ['b'], source: 'test' });
    const stats = store.getStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.totalTags).toBe(2);
  });
});

describe('TrafficMirror', () => {
  it('should mirror requests to targets', async () => {
    const mirror = new TrafficMirror({
      enabled: true,
      targets: [{ name: 'test-mirror', provider: 'test', model: 'test-model', percentage: 100 }],
      maxQueueSize: 100,
      flushIntervalMs: 1000,
      compareOutput: true,
    });

    mirror.setUpstreamCaller(async () => ({ content: 'mirrored response' }));
    await mirror.mirrorRequest(
      { model: 'original', messages: [] },
      'openai',
      'gpt-4',
      { content: 'original response' }
    );

    await new Promise(resolve => setTimeout(resolve, 200));

    const stats = mirror.getComparisonStats();
    expect(stats.totalMirrored).toBeGreaterThan(0);
  });
});

describe('computeMessagesHash', () => {
  it('should produce consistent hashes', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const hash1 = computeMessagesHash(messages);
    const hash2 = computeMessagesHash(messages);
    expect(hash1).toBe(hash2);
  });

  it('should differ for different messages', () => {
    const hash1 = computeMessagesHash([{ role: 'user', content: 'hello' }]);
    const hash2 = computeMessagesHash([{ role: 'user', content: 'world' }]);
    expect(hash1).not.toBe(hash2);
  });
});
