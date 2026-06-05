/**
 * Task Queue - 异步任务队列
 *
 * In-memory async task queue for background processing:
 * - Memory extraction
 * - Context capture
 * - Cache warming
 * - Metric aggregation
 *
 * Design: Zero external dependencies. Priority queue with concurrency control.
 */

export interface TaskQueueConfig {
  enabled: boolean;
  /** Max concurrent workers */
  concurrency: number;
  /** Max queue size */
  maxQueueSize: number;
  /** Task timeout in ms */
  taskTimeoutMs: number;
  /** Retry failed tasks */
  maxRetries: number;
  /** Retry delay in ms */
  retryDelayMs: number;
}

const DEFAULT_CONFIG: TaskQueueConfig = {
  enabled: true,
  concurrency: 3,
  maxQueueSize: 1000,
  taskTimeoutMs: 30000,
  maxRetries: 2,
  retryDelayMs: 1000,
};

export interface Task {
  id: string;
  type: string;
  priority: number; // Higher = more urgent
  payload: any;
  handler: (payload: any) => Promise<any>;
  createdAt: number;
  retries: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  elapsedMs: number;
  retries: number;
}

export class TaskQueue {
  private config: TaskQueueConfig;
  private logger?: any;
  private queue: Task[] = [];
  private active = 0;
  private stats = { submitted: 0, completed: 0, failed: 0, retried: 0 };
  private results: Map<string, TaskResult> = new Map();
  private processing = false;

  constructor(config: Partial<TaskQueueConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Submit a task to the queue.
   */
  submit(task: Omit<Task, 'id' | 'createdAt' | 'retries'>): string {
    if (!this.config.enabled) return '';

    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (this.queue.length >= this.config.maxQueueSize) {
      this.logger?.warn(`TaskQueue: queue full, dropping task`);
      return '';
    }

    const fullTask: Task = {
      ...task,
      id,
      createdAt: Date.now(),
      retries: 0,
    };

    // Insert by priority (higher priority first)
    const insertIndex = this.queue.findIndex((t) => t.priority < task.priority);
    if (insertIndex === -1) {
      this.queue.push(fullTask);
    } else {
      this.queue.splice(insertIndex, 0, fullTask);
    }

    this.stats.submitted++;
    this.processNext();

    return id;
  }

  /**
   * Submit and wait for result.
   */
  async submitAndWait(task: Omit<Task, 'id' | 'createdAt' | 'retries'>, timeoutMs?: number): Promise<TaskResult> {
    const taskId = this.submit(task);
    if (!taskId) {
      return { taskId: '', success: false, error: 'Queue disabled or full', elapsedMs: 0, retries: 0 };
    }

    const timeout = timeoutMs || this.config.taskTimeoutMs;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = this.results.get(taskId);
      if (result) {
        this.results.delete(taskId);
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return { taskId, success: false, error: 'Timeout waiting for result', elapsedMs: timeout, retries: 0 };
  }

  /**
   * Get task result (non-blocking).
   */
  getResult(taskId: string): TaskResult | null {
    const result = this.results.get(taskId);
    if (result) {
      this.results.delete(taskId);
      return result;
    }
    return null;
  }

  /**
   * Get queue stats.
   */
  getStats(): {
    queueSize: number;
    active: number;
    submitted: number;
    completed: number;
    failed: number;
    retried: number;
  } {
    return {
      queueSize: this.queue.length,
      active: this.active,
      ...this.stats,
    };
  }

  /**
   * Clear the queue.
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<TaskQueueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async processNext(): Promise<void> {
    if (this.active >= this.config.concurrency) return;
    if (this.queue.length === 0) return;

    const task = this.queue.shift();
    if (!task) return;

    this.active++;

    const startTime = Date.now();
    try {
      const result = await Promise.race([
        task.handler(task.payload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), this.config.taskTimeoutMs)
        ),
      ]);

      const elapsed = Date.now() - startTime;
      this.stats.completed++;

      this.results.set(task.id, {
        taskId: task.id,
        success: true,
        result,
        elapsedMs: elapsed,
        retries: task.retries,
      });
    } catch (error: any) {
      const elapsed = Date.now() - startTime;

      // Retry if under limit
      if (task.retries < this.config.maxRetries) {
        task.retries++;
        this.stats.retried++;

        setTimeout(() => {
          this.queue.unshift(task);
          this.processNext();
        }, this.config.retryDelayMs);
      } else {
        this.stats.failed++;

        this.results.set(task.id, {
          taskId: task.id,
          success: false,
          error: error.message,
          elapsedMs: elapsed,
          retries: task.retries,
        });
      }
    } finally {
      this.active--;
      this.processNext();
    }
  }
}

let globalQueue: TaskQueue | null = null;

export function getTaskQueue(config?: Partial<TaskQueueConfig>, logger?: any): TaskQueue {
  if (!globalQueue) {
    globalQueue = new TaskQueue(config, logger);
  } else if (config) {
    globalQueue.updateConfig(config);
  }
  return globalQueue;
}
