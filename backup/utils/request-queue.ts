/**
 * Request Queue Manager pentru smooth traffic flow
 * Evită burst-urile care cauzează 429 errors
 */

import { log } from './log';

interface QueuedRequest {
  id: string;
  timestamp: number;
  keyId: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  fn: () => Promise<any>;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private readonly minDelay: number; // Minimum delay between requests
  private lastRequestTime = 0;
  
  // Stats tracking
  private stats = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    totalWaitTime: 0,
    averageWaitTime: 0,
    queuedRequests: 0,
    lastResetTime: Date.now()
  };

  constructor(minDelayMs: number = 1000) {
    this.minDelay = minDelayMs;
  }

  /**
   * Add request to queue with automatic processing
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    keyId: string,
    context: string = 'request'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        timestamp: Date.now(),
        keyId,
        resolve,
        reject,
        fn
      };

      this.queue.push(request);
      this.stats.totalRequests++;
      this.stats.queuedRequests = this.queue.length;
      log(`[RequestQueue] Queued ${context} (${request.id}). Queue size: ${this.queue.length}`);
      
      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    log(`[RequestQueue] Starting queue processing. Queue size: ${this.queue.length}`);

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      
      try {
        // Ensure minimum delay between requests
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minDelay) {
          const delayNeeded = this.minDelay - timeSinceLastRequest;
          log(`[RequestQueue] Rate limiting: waiting ${delayNeeded}ms before processing ${request.id}`);
          await this.sleep(delayNeeded);
        }

        log(`[RequestQueue] Processing request ${request.id} for key ${request.keyId}`);
        this.lastRequestTime = Date.now();
        
        const startTime = Date.now();
        const result = await request.fn();
        const waitTime = startTime - request.timestamp;
        
        this.stats.completedRequests++;
        this.stats.totalWaitTime += waitTime;
        this.stats.averageWaitTime = this.stats.totalWaitTime / this.stats.completedRequests;
        this.stats.queuedRequests = this.queue.length;
        
        request.resolve(result);
        log(`[RequestQueue] Completed request ${request.id}. Queue size: ${this.queue.length}`);
        
      } catch (error) {
        this.stats.failedRequests++;
        this.stats.queuedRequests = this.queue.length;
        log(`[RequestQueue] Request ${request.id} failed: ${error}`);
        request.reject(error);
      }
    }

    this.processing = false;
    log(`[RequestQueue] Queue processing completed`);
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      lastRequestTime: this.lastRequestTime,
      nextProcessTime: this.lastRequestTime + this.minDelay
    };
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    return {
      ...this.stats,
      queuedRequests: this.queue.length,
      uptime: Date.now() - this.stats.lastResetTime
    };
  }

  /**
   * Reset statistics and queue
   */
  reset() {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      totalWaitTime: 0,
      averageWaitTime: 0,
      queuedRequests: 0,
      lastResetTime: Date.now()
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instances pentru different use cases
export const defaultRequestQueue = new RequestQueue(1000); // 1 second between requests
export const conservativeRequestQueue = new RequestQueue(3000); // 3 seconds for problem keys

// Primary singleton for API usage
export const requestQueue = defaultRequestQueue;