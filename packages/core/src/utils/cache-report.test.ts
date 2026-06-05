import { describe, it, expect, beforeEach } from 'vitest';
import { CacheReportAggregator } from './cache-report';

describe('CacheReportAggregator', () => {
  let aggregator: CacheReportAggregator;

  beforeEach(() => {
    aggregator = new CacheReportAggregator({
      enabled: true,
      avgInputCostPer1k: 0.005,
      avgOutputCostPer1k: 0.015,
      avgLatencyMs: 2000,
    });
  });

  it('should generate report with L1 stats', () => {
    const report = aggregator.generateReport({
      l1: { hits: 10, misses: 5, entries: 20 },
    });
    expect(report.layers).toHaveLength(1);
    expect(report.layers[0].name).toContain('L1');
    expect(report.layers[0].hits).toBe(10);
    expect(report.total.hits).toBe(10);
    expect(report.total.misses).toBe(5);
  });

  it('should calculate hit rate', () => {
    const report = aggregator.generateReport({
      l1: { hits: 75, misses: 25, entries: 100 },
    });
    expect(report.total.hitRate).toBe(0.75);
  });

  it('should calculate cost savings', () => {
    const report = aggregator.generateReport({
      l1: { hits: 100, misses: 0, entries: 100 },
    });
    expect(report.savings.estimatedCostUsd).toBeGreaterThan(0);
    expect(report.savings.estimatedTokens).toBeGreaterThan(0);
    expect(report.savings.estimatedLatencyMs).toBeGreaterThan(0);
  });

  it('should aggregate multiple layers', () => {
    const report = aggregator.generateReport({
      l1: { hits: 10, misses: 5, entries: 20 },
      l2: { hits: 3, misses: 2, connected: true },
    });
    expect(report.layers).toHaveLength(2);
    expect(report.total.hits).toBe(13);
    expect(report.total.misses).toBe(7);
  });

  it('should handle empty stats', () => {
    const report = aggregator.generateReport({});
    expect(report.total.hits).toBe(0);
    expect(report.total.hitRate).toBe(0);
  });

  it('should track cumulative stats', () => {
    aggregator.generateReport({ l1: { hits: 10, misses: 5, entries: 20 } });
    aggregator.generateReport({ l1: { hits: 5, misses: 0, entries: 20 } });
    const cumulative = aggregator.getCumulativeStats();
    expect(cumulative.totalHits).toBe(15);
    expect(cumulative.totalMisses).toBe(5);
  });
});
