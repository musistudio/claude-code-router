/**
 * Retry - 自动重试 + 指数退避
 *
 * Wraps HTTP requests with configurable retry logic.
 * Uses exponential backoff with jitter to avoid thundering herd.
 *
 * Design: Zero external dependencies. Integrates with CircuitBreaker
 * to skip retries when circuit is open.
 */

export interface RetryConfig {
  maxRetries: number;            // Max retry attempts (default: 3)
  baseDelayMs: number;           // Base delay for exponential backoff (default: 1000)
  maxDelayMs: number;            // Max delay cap (default: 30000)
  jitterFactor: number;          // Jitter factor 0-1 (default: 0.3)
  retryableStatusCodes: number[]; // HTTP codes that trigger retry (default: [429, 500, 502, 503, 504])
  retryableErrors: string[];     // Error codes that trigger retry
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'UND_ERR_HEADERS_TIMEOUT'],
};

export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastError?: string;
  lastStatusCode?: number;
  totalElapsedMs: number;
}

/**
 * Execute a function with retry logic.
 *
 * @param fn The async function to execute
 * @param config Retry configuration
 * @param onRetry Callback before each retry (for logging)
 * @returns The result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (ctx: RetryContext) => void
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: any;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      const result = await fn();

      // If we get here after retries, log recovery
      if (attempt > 0) {
        onRetry?.({
          attempt,
          totalAttempts: cfg.maxRetries + 1,
          totalElapsedMs: Date.now() - startTime,
        });
      }

      return result;
    } catch (error: any) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt >= cfg.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryable(error, cfg)) {
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = calculateDelay(attempt, cfg);

      onRetry?.({
        attempt: attempt + 1,
        totalAttempts: cfg.maxRetries + 1,
        lastError: error.message || String(error),
        lastStatusCode: error.statusCode || error.status,
        totalElapsedMs: Date.now() - startTime,
      });

      // Wait before retry
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable based on config.
 */
function isRetryable(error: any, config: RetryConfig): boolean {
  // Check HTTP status codes
  const statusCode = error.statusCode || error.status || error.code;
  if (typeof statusCode === 'number' && config.retryableStatusCodes.includes(statusCode)) {
    return true;
  }

  // Check error codes (network errors)
  const errorCode = error.code || error.cause?.code;
  if (typeof errorCode === 'string' && config.retryableErrors.includes(errorCode)) {
    return true;
  }

  // Check error message for common patterns
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('socket hang up')) {
    return true;
  }

  // Check for provider_response_error with retryable status
  if (error.message) {
    const statusMatch = error.message.match(/status[:\s]*(\d{3})/i);
    if (statusMatch) {
      const code = parseInt(statusMatch[1], 10);
      if (config.retryableStatusCodes.includes(code)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter.
 * delay = min(baseDelay * 2^attempt + jitter, maxDelay)
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = exponentialDelay * config.jitterFactor * (Math.random() * 2 - 1);
  const delay = Math.min(exponentialDelay + jitter, config.maxDelayMs);
  return Math.max(0, Math.round(delay));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the Retry config from the global config service.
 */
export function getRetryConfig(configService: any): Partial<RetryConfig> {
  return {
    maxRetries: configService.get('RETRY_MAX_RETRIES') ?? 3,
    baseDelayMs: configService.get('RETRY_BASE_DELAY_MS') ?? 1000,
    maxDelayMs: configService.get('RETRY_MAX_DELAY_MS') ?? 30000,
    jitterFactor: configService.get('RETRY_JITTER_FACTOR') ?? 0.3,
    retryableStatusCodes: configService.get('RETRYABLE_STATUS_CODES') ?? [429, 500, 502, 503, 504],
  };
}
