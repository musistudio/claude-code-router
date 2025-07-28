import pRetry, { AbortError } from 'p-retry';
import { logger } from './logger';

export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  onFailedAttempt?: (error: any) => void;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public provider?: string,
    public model?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public provider: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private readonly threshold = 5;
  private readonly timeout = 60000; // 1 minute
  private readonly halfOpenRequests = 3;
  private halfOpenAttempts: Map<string, number> = new Map();

  isOpen(key: string): boolean {
    const state = this.states.get(key);
    if (!state) return false;

    if (state.state === 'open') {
      const timeSinceLastFailure = Date.now() - state.lastFailure;
      if (timeSinceLastFailure > this.timeout) {
        state.state = 'half-open';
        this.halfOpenAttempts.set(key, 0);
        logger.info(`Circuit breaker half-open for ${key}`);
      }
    }

    return state.state === 'open';
  }

  recordSuccess(key: string): void {
    const state = this.states.get(key);
    if (!state) return;

    if (state.state === 'half-open') {
      const attempts = (this.halfOpenAttempts.get(key) || 0) + 1;
      this.halfOpenAttempts.set(key, attempts);

      if (attempts >= this.halfOpenRequests) {
        this.states.delete(key);
        this.halfOpenAttempts.delete(key);
        logger.info(`Circuit breaker closed for ${key}`);
      }
    } else {
      this.states.delete(key);
    }
  }

  recordFailure(key: string): void {
    const state = this.states.get(key) || {
      failures: 0,
      lastFailure: 0,
      state: 'closed' as const,
    };

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.threshold) {
      state.state = 'open';
      logger.warn(`Circuit breaker opened for ${key} after ${state.failures} failures`);
    }

    this.states.set(key, state);
  }

  reset(key: string): void {
    this.states.delete(key);
    this.halfOpenAttempts.delete(key);
  }
}

export const circuitBreaker = new CircuitBreaker();

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const defaultOptions: Required<RetryOptions> = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 30000,
    onFailedAttempt: (error) => {
      logger.warn(`Retry attempt failed: ${error.message}`, {
        attemptNumber: error.attemptNumber,
        retriesLeft: error.retriesLeft,
      });
    },
  };

  const mergedOptions = { ...defaultOptions, ...options };

  return pRetry(operation, {
    retries: mergedOptions.retries,
    factor: mergedOptions.factor,
    minTimeout: mergedOptions.minTimeout,
    maxTimeout: mergedOptions.maxTimeout,
    onFailedAttempt: mergedOptions.onFailedAttempt,
  });
}

export function shouldRetry(error: any): boolean {
  if (error instanceof AbortError) return false;
  
  if (error instanceof ApiError) {
    // Don't retry client errors (4xx) except for 429 (rate limit)
    if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
      return false;
    }
  }

  // Retry on network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // Retry on server errors (5xx)
  if (error.statusCode >= 500) {
    return true;
  }

  return true;
}

export function formatErrorMessage(error: any): string {
  if (error instanceof ApiError) {
    return `API Error (${error.statusCode}): ${error.message}${
      error.provider ? ` [Provider: ${error.provider}]` : ''
    }${error.model ? ` [Model: ${error.model}]` : ''}`;
  }

  if (error instanceof ConfigurationError) {
    return `Configuration Error: ${error.message}${
      error.field ? ` [Field: ${error.field}]` : ''
    }`;
  }

  if (error instanceof CircuitBreakerError) {
    return `Circuit Breaker Error: ${error.message} [Provider: ${error.provider}]`;
  }

  if (error.code === 'ECONNREFUSED') {
    return 'Connection refused. Please check if the API endpoint is accessible.';
  }

  if (error.code === 'ETIMEDOUT') {
    return 'Request timed out. Please try again or increase the timeout setting.';
  }

  if (error.code === 'ENOTFOUND') {
    return 'DNS lookup failed. Please check the API URL.';
  }

  return error.message || 'An unknown error occurred';
}

export function createErrorResponse(error: any, context?: any) {
  const formattedMessage = formatErrorMessage(error);
  logger.error(formattedMessage, { error, context });

  return {
    error: {
      message: formattedMessage,
      type: error.name || 'Error',
      code: error.code || error.statusCode || 'UNKNOWN',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
  };
}