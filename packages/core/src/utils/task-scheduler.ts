/**
 * Task Scheduler - 定时任务调度器
 *
 * Cron-like task scheduling for periodic operations:
 * - Cache warming
 * - Health checks
 * - Metric aggregation
 * - Data refresh
 * - Cleanup tasks
 *
 * Design: Zero external dependencies. Uses setInterval with cron-like expressions.
 */

export interface TaskSchedulerConfig {
  enabled: boolean;
  /** Scheduled tasks */
  tasks: Array<{
    name: string;
    /** Cron expression (simplified format) */
    schedule: string;
    /** Task type */
    type: 'cache_warm' | 'health_check' | 'metric_aggregate' | 'cleanup' | 'custom';
    /** Whether task is enabled */
    enabled: boolean;
    /** Custom handler name (for 'custom' type) */
    handler?: string;
  }>;
}

const DEFAULT_CONFIG: TaskSchedulerConfig = {
  enabled: false,
  tasks: [],
};

interface ScheduledTask {
  name: string;
  intervalMs: number;
  type: string;
  enabled: boolean;
  handler?: () => Promise<void>;
  intervalId?: ReturnType<typeof setInterval>;
  lastRun: number;
  runCount: number;
  lastError?: string;
}

export class TaskScheduler {
  private config: TaskSchedulerConfig;
  private logger?: any;
  private tasks: Map<string, ScheduledTask> = new Map();

  constructor(config: Partial<TaskSchedulerConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Start all scheduled tasks.
   */
  start(): void {
    if (!this.config.enabled) return;

    for (const taskConfig of this.config.tasks) {
      if (!taskConfig.enabled) continue;

      const intervalMs = this.parseCron(taskConfig.schedule);
      if (intervalMs <= 0) {
        this.logger?.warn(`TaskScheduler: invalid schedule for ${taskConfig.name}: ${taskConfig.schedule}`);
        continue;
      }

      const task: ScheduledTask = {
        name: taskConfig.name,
        intervalMs,
        type: taskConfig.type,
        enabled: true,
        lastRun: 0,
        runCount: 0,
      };

      task.intervalId = setInterval(async () => {
        await this.runTask(task);
      }, intervalMs);

      this.tasks.set(taskConfig.name, task);
      this.logger?.info(`TaskScheduler: scheduled ${taskConfig.name} every ${intervalMs}ms`);
    }
  }

  /**
   * Stop all scheduled tasks.
   */
  stop(): void {
    for (const task of this.tasks.values()) {
      if (task.intervalId) {
        clearInterval(task.intervalId);
        task.intervalId = undefined;
      }
    }
    this.tasks.clear();
  }

  /**
   * Register a custom task handler.
   */
  registerHandler(name: string, handler: () => Promise<void>): void {
    const task = this.tasks.get(name);
    if (task) {
      task.handler = handler;
    }
  }

  /**
   * Get scheduler stats.
   */
  getStats(): { tasks: Array<{ name: string; type: string; enabled: boolean; lastRun: number; runCount: number; lastError?: string }> } {
    return {
      tasks: Array.from(this.tasks.values()).map(t => ({
        name: t.name,
        type: t.type,
        enabled: t.enabled,
        lastRun: t.lastRun,
        runCount: t.runCount,
        lastError: t.lastError,
      })),
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<TaskSchedulerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async runTask(task: ScheduledTask): Promise<void> {
    const startTime = Date.now();
    task.lastRun = startTime;
    task.runCount++;

    try {
      if (task.handler) {
        await task.handler();
      } else {
        await this.runBuiltinTask(task.type);
      }
      task.lastError = undefined;
      this.logger?.debug(`TaskScheduler: ${task.name} completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      task.lastError = error.message;
      this.logger?.warn(`TaskScheduler: ${task.name} failed: ${error.message}`);
    }
  }

  private async runBuiltinTask(type: string): Promise<void> {
    switch (type) {
      case 'health_check':
        // Built-in health check
        break;
      case 'cleanup':
        // Built-in cleanup
        break;
      default:
        this.logger?.debug(`TaskScheduler: no handler for task type ${type}`);
    }
  }

  private parseCron(expr: string): number {
    // Simplified cron parser: "*/N * * * *" → N * 60000
    const match = expr.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
    if (match) {
      return parseInt(match[1], 10) * 60000;
    }

    // Fixed intervals: "30s", "5m", "1h"
    const fixedMatch = expr.match(/^(\d+)([smh])$/);
    if (fixedMatch) {
      const val = parseInt(fixedMatch[1], 10);
      switch (fixedMatch[2]) {
        case 's': return val * 1000;
        case 'm': return val * 60000;
        case 'h': return val * 3600000;
      }
    }

    return 0;
  }
}

let globalScheduler: TaskScheduler | null = null;

export function getTaskScheduler(config?: Partial<TaskSchedulerConfig>, logger?: any): TaskScheduler {
  if (!globalScheduler) {
    globalScheduler = new TaskScheduler(config, logger);
  } else if (config) {
    globalScheduler.updateConfig(config);
  }
  return globalScheduler;
}
