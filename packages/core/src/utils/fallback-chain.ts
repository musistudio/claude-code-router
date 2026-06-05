import { createHash } from 'crypto';

export interface FallbackStep {
  provider: string;
  model: string;
}

export interface FallbackResult {
  succeeded: boolean;
  finalProvider: string;
  finalModel: string;
  attempts: Array<{
    provider: string;
    model: string;
    success: boolean;
    errorType?: string;
    latencyMs: number;
  }>;
  totalLatencyMs: number;
}

export interface FallbackChainConfig {
  maxAttempts: number;
  retryDelayMs: number;
  timeoutPerAttemptMs: number;
  retryableErrors: string[];
}

const DEFAULT_CONFIG: FallbackChainConfig = {
  maxAttempts: 3,
  retryDelayMs: 100,
  timeoutPerAttemptMs: 60000,
  retryableErrors: ['timeout', 'rate_limit', 'server_error', 'connection_error'],
};

type ErrorClassifier = (error: any) => 'timeout' | 'rate_limit' | 'server_error' | 'content_filter' | 'connection_error' | 'unknown';

const defaultErrorClassifier: ErrorClassifier = (error: any) => {
  const status = error?.statusCode || error?.status || error?.response?.status;
  const message = (error?.message || '').toLowerCase();

  if (status === 429) return 'rate_limit';
  if (status === 403 && message.includes('content')) return 'content_filter';
  if (status >= 500) return 'server_error';
  if (message.includes('timeout') || message.includes('timed out') || message.includes('ECONNREFUSED')) return 'timeout';
  if (message.includes('connection') || message.includes('socket') || message.includes('network')) return 'connection_error';
  return 'unknown';
};

export class FallbackChainExecutor {
  private config: FallbackChainConfig;
  private classifyError: ErrorClassifier;
  private logger?: any;

  constructor(config: Partial<FallbackChainConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.classifyError = defaultErrorClassifier;
    this.logger = logger;
  }

  async execute(
    primaryProvider: string,
    primaryModel: string,
    fallbackChain: string[],
    callFn: (provider: string, model: string) => Promise<any>,
    circuitBreaker?: { canExecute: (name: string) => boolean; recordFailure: (name: string, statusCode?: number, error?: string) => void; recordSuccess: (name: string) => void }
  ): Promise<FallbackResult> {
    const startTime = Date.now();
    const attempts: FallbackResult['attempts'] = [];

    const candidates: FallbackStep[] = [
      { provider: primaryProvider, model: primaryModel },
      ...fallbackChain.map(entry => {
        const [provider, model] = entry.split(',');
        return { provider, model };
      }),
    ];

    for (let i = 0; i < Math.min(candidates.length, this.config.maxAttempts); i++) {
      const candidate = candidates[i];

      if (circuitBreaker && !circuitBreaker.canExecute(candidate.provider)) {
        this.logger?.debug(`FallbackChain: skipping ${candidate.provider} (circuit open)`);
        attempts.push({
          provider: candidate.provider,
          model: candidate.model,
          success: false,
          errorType: 'circuit_open',
          latencyMs: 0,
        });
        continue;
      }

      const attemptStart = Date.now();

      try {
        const result = await Promise.race([
          callFn(candidate.provider, candidate.model),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Attempt timeout')), this.config.timeoutPerAttemptMs)
          ),
        ]);

        const latencyMs = Date.now() - attemptStart;
        attempts.push({ provider: candidate.provider, model: candidate.model, success: true, latencyMs });

        if (circuitBreaker) {
          circuitBreaker.recordSuccess(candidate.provider);
        }

        this.logger?.info(
          `FallbackChain: ${candidate.provider}/${candidate.model} succeeded on attempt ${i + 1} (${latencyMs}ms)`
        );

        return {
          succeeded: true,
          finalProvider: candidate.provider,
          finalModel: candidate.model,
          attempts,
          totalLatencyMs: Date.now() - startTime,
        };
      } catch (error: any) {
        const latencyMs = Date.now() - attemptStart;
        const errorType = this.classifyError(error);

        attempts.push({
          provider: candidate.provider,
          model: candidate.model,
          success: false,
          errorType,
          latencyMs,
        });

        if (circuitBreaker) {
          const statusCode = error?.statusCode || error?.status;
          circuitBreaker.recordFailure(candidate.provider, statusCode, errorType);
        }

        this.logger?.warn(
          `FallbackChain: ${candidate.provider}/${candidate.model} failed (${errorType}) on attempt ${i + 1}: ${error?.message}`
        );

        if (!this.config.retryableErrors.includes(errorType)) {
          this.logger?.info(`FallbackChain: error type '${errorType}' is not retryable, stopping chain`);
          break;
        }

        if (i < candidates.length - 1 && this.config.retryDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
        }
      }
    }

    return {
      succeeded: false,
      finalProvider: attempts[attempts.length - 1]?.provider || primaryProvider,
      finalModel: attempts[attempts.length - 1]?.model || primaryModel,
      attempts,
      totalLatencyMs: Date.now() - startTime,
    };
  }
}

let _executor: FallbackChainExecutor | null = null;

export function getFallbackChainExecutor(config?: Partial<FallbackChainConfig>, logger?: any): FallbackChainExecutor {
  if (!_executor) {
    _executor = new FallbackChainExecutor(config, logger);
  }
  return _executor;
}
