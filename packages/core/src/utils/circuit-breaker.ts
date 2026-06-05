/**
 * Circuit Breaker - 断路器模式
 *
 * Prevents cascading failures by tracking provider error rates
 * and temporarily blocking requests to failing providers.
 *
 * States: CLOSED (normal) → OPEN (blocking) → HALF_OPEN (testing)
 *
 * Design: Zero external dependencies. Per-provider circuit breakers
 * with configurable thresholds and recovery timeouts.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening (default: 5)
  successThreshold: number;      // Successes in half-open before closing (default: 2)
  resetTimeoutMs: number;        // Time before half-open (default: 30000)
  monitoringWindowMs: number;    // Rolling window for failure counting (default: 60000)
  halfOpenMaxRequests: number;   // Max concurrent requests in half-open (default: 1)
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  monitoringWindowMs: 60000,
  halfOpenMaxRequests: 1,
};

interface FailureRecord {
  timestamp: number;
  statusCode?: number;
  error?: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private consecutiveSuccesses = 0;
  private lastStateChange = Date.now();
  private halfOpenActive = 0;
  private config: CircuitBreakerConfig;
  private name: string;
  private logger?: any;
  private stateChangeCallback?: (name: string, from: CircuitState, to: CircuitState) => void;

  constructor(
    name: string,
    config: Partial<CircuitBreakerConfig> = {},
    logger?: any,
    onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void
  ) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
    this.stateChangeCallback = onStateChange;
  }

  /**
   * Check if a request is allowed through the circuit breaker.
   * Throws if circuit is OPEN.
   */
  canExecute(): boolean {
    this.cleanOldFailures();

    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        if (this.shouldAttemptReset()) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return this.halfOpenActive < this.config.halfOpenMaxRequests;
        }
        return false;

      case CircuitState.HALF_OPEN:
        return this.halfOpenActive < this.config.halfOpenMaxRequests;

      default:
        return true;
    }
  }

  /**
   * Record a successful request.
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
    // In CLOSED state, success just resets consecutive count
    if (this.state === CircuitState.CLOSED) {
      this.consecutiveSuccesses++;
    }
  }

  /**
   * Record a failed request.
   * @param statusCode HTTP status code (429/5xx are considered failures)
   * @param error Error message
   */
  recordFailure(statusCode?: number, error?: string): void {
    const record: FailureRecord = {
      timestamp: Date.now(),
      statusCode,
      error,
    };
    this.failures.push(record);
    this.consecutiveSuccesses = 0;

    this.cleanOldFailures();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      const recentFailures = this.getRecentFailureCount();
      if (recentFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Record a request entering half-open state.
   */
  recordHalfOpenAttempt(): void {
    this.halfOpenActive++;
  }

  /**
   * Release a half-open request slot.
   */
  releaseHalfOpenAttempt(): void {
    this.halfOpenActive = Math.max(0, this.halfOpenActive - 1);
  }

  /**
   * Get current state info for monitoring.
   */
  getState(): {
    name: string;
    state: CircuitState;
    recentFailures: number;
    consecutiveSuccesses: number;
    lastStateChange: number;
    timeInStateMs: number;
    isOpen: boolean;
  } {
    this.cleanOldFailures();
    return {
      name: this.name,
      state: this.state,
      recentFailures: this.getRecentFailureCount(),
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastStateChange: this.lastStateChange,
      timeInStateMs: Date.now() - this.lastStateChange,
      isOpen: this.state === CircuitState.OPEN,
    };
  }

  /**
   * Force reset to CLOSED (for manual recovery).
   */
  forceClose(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = [];
    this.consecutiveSuccesses = 0;
  }

  // =========================================================================
  // Private
  // =========================================================================

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === CircuitState.CLOSED) {
      this.failures = [];
      this.consecutiveSuccesses = 0;
      this.halfOpenActive = 0;
    }
    if (newState === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses = 0;
      this.halfOpenActive = 0;
    }

    this.logger?.warn(
      `CircuitBreaker[${this.name}]: ${oldState} → ${newState}`
    );

    this.stateChangeCallback?.(this.name, oldState, newState);
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastStateChange >= this.config.resetTimeoutMs;
  }

  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.config.monitoringWindowMs;
    this.failures = this.failures.filter((f) => f.timestamp > cutoff);
  }

  private getRecentFailureCount(): number {
    this.cleanOldFailures();
    return this.failures.length;
  }
}

/**
 * Global circuit breaker registry - one per provider.
 */
const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  providerName: string,
  config?: Partial<CircuitBreakerConfig>,
  logger?: any,
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void
): CircuitBreaker {
  let breaker = breakers.get(providerName);
  if (!breaker) {
    breaker = new CircuitBreaker(providerName, config, logger, onStateChange);
    breakers.set(providerName, breaker);
  }
  return breaker;
}

export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  return breakers;
}
