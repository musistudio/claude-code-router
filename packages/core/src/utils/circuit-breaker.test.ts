import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitState } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
    breaker = new CircuitBreaker('test-provider', {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 100,
      monitoringWindowMs: 1000,
    }, mockLogger);
  });

  it('should start in CLOSED state', () => {
    expect(breaker.canExecute()).toBe(true);
    expect(breaker.getState().state).toBe(CircuitState.CLOSED);
  });

  it('should open after failure threshold', () => {
    breaker.recordFailure(500, 'error');
    breaker.recordFailure(500, 'error');
    expect(breaker.getState().state).toBe(CircuitState.CLOSED);

    breaker.recordFailure(500, 'error');
    expect(breaker.getState().state).toBe(CircuitState.OPEN);
    expect(breaker.canExecute()).toBe(false);
  });

  it('should transition to HALF_OPEN after reset timeout', async () => {
    breaker.recordFailure(500, 'e');
    breaker.recordFailure(500, 'e');
    breaker.recordFailure(500, 'e');
    expect(breaker.getState().state).toBe(CircuitState.OPEN);

    await new Promise(r => setTimeout(r, 150));
    expect(breaker.canExecute()).toBe(true);
    expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);
  });

  it('should close after success threshold in HALF_OPEN', async () => {
    breaker.recordFailure(500, 'e');
    breaker.recordFailure(500, 'e');
    breaker.recordFailure(500, 'e');

    await new Promise(r => setTimeout(r, 150));
    breaker.canExecute(); // triggers HALF_OPEN
    breaker.recordSuccess();
    breaker.recordSuccess();
    expect(breaker.getState().state).toBe(CircuitState.CLOSED);
  });

  it('should reopen on failure in HALF_OPEN', async () => {
    breaker.recordFailure(500, 'e');
    breaker.recordFailure(500, 'e');
    breaker.recordFailure(500, 'e');

    await new Promise(r => setTimeout(r, 150));
    breaker.canExecute(); // triggers HALF_OPEN
    breaker.recordFailure(500, 'e');
    expect(breaker.getState().state).toBe(CircuitState.OPEN);
  });

  it('should reset on forceClose', () => {
    breaker.recordFailure(500, 'e');
    breaker.recordFailure(500, 'e');
    breaker.recordFailure(500, 'e');
    expect(breaker.getState().state).toBe(CircuitState.OPEN);

    breaker.forceClose();
    expect(breaker.getState().state).toBe(CircuitState.CLOSED);
    expect(breaker.canExecute()).toBe(true);
  });

  it('should track consecutive successes', () => {
    breaker.recordSuccess();
    breaker.recordSuccess();
    expect(breaker.getState().consecutiveSuccesses).toBe(2);

    breaker.recordFailure(500, 'e');
    expect(breaker.getState().consecutiveSuccesses).toBe(0);
  });
});
