export interface RateLimiterQueueConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  priorityLevels: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

interface QueuedRequest {
  id: string;
  priority: number;
  provider: string;
  model: string;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  executeFn: () => Promise<any>;
  enqueuedAt: number;
}

export class RateLimiterQueue {
  private config: RateLimiterQueueConfig;
  private queue: QueuedRequest[] = [];
  private activeCount = 0;
  private processedCount = 0;
  private rejectedCount = 0;
  private totalWaitTimeMs = 0;
  private logger?: any;

  constructor(config: Partial<RateLimiterQueueConfig> = {}, logger?: any) {
    this.config = {
      maxConcurrent: 5,
      maxQueueSize: 100,
      priorityLevels: 3,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      ...config,
    };
    this.logger = logger;
  }

  async enqueue<T>(
    provider: string,
    model: string,
    priority: number,
    executeFn: () => Promise<T>
  ): Promise<T> {
    if (this.queue.length >= this.config.maxQueueSize) {
      this.rejectedCount++;
      throw new Error(`Rate limiter queue full (${this.config.maxQueueSize}). Provider: ${provider}`);
    }

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        priority: Math.max(0, Math.min(priority, this.config.priorityLevels - 1)),
        provider,
        model,
        resolve: resolve as any,
        reject,
        executeFn,
        enqueuedAt: Date.now(),
      };

      this.queue.push(request);
      this.queue.sort((a, b) => b.priority - a.priority);

      this.processNext();
    });
  }

  private processNext(): void {
    if (this.activeCount >= this.config.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.activeCount++;
    const waitTime = Date.now() - request.enqueuedAt;
    this.totalWaitTimeMs += waitTime;

    request.executeFn()
      .then((result) => {
        request.resolve(result);
      })
      .catch((error) => {
        request.reject(error);
      })
      .finally(() => {
        this.activeCount--;
        this.processedCount++;
        this.processNext();
      });
  }

  getStats(): {
    queueLength: number;
    activeCount: number;
    processedCount: number;
    rejectedCount: number;
    avgWaitTimeMs: number;
  } {
    return {
      queueLength: this.queue.length,
      activeCount: this.activeCount,
      processedCount: this.processedCount,
      rejectedCount: this.rejectedCount,
      avgWaitTimeMs: this.processedCount > 0 ? this.totalWaitTimeMs / this.processedCount : 0,
    };
  }

  clear(): number {
    const count = this.queue.length;
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'));
    }
    this.queue = [];
    return count;
  }
}

let _queue: RateLimiterQueue | null = null;

export function getRateLimiterQueue(config?: Partial<RateLimiterQueueConfig>, logger?: any): RateLimiterQueue {
  if (!_queue) {
    _queue = new RateLimiterQueue(config, logger);
  }
  return _queue;
}
