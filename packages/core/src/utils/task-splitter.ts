/**
 * Task Splitter - 长任务拆分并行
 *
 * Splits large requests into smaller parallel chunks:
 * - Long context splitting
 * - Multi-file analysis
 * - Batch processing
 */

export interface TaskSplitterConfig {
  enabled: boolean;
  /** Max chunk size in tokens */
  maxChunkTokens: number;
  /** Max parallel chunks */
  maxParallel: number;
  /** Merge strategy */
  mergeStrategy: 'concat' | 'reduce' | 'vote';
}

const DEFAULT_CONFIG: TaskSplitterConfig = {
  enabled: false,
  maxChunkTokens: 50000,
  maxParallel: 3,
  mergeStrategy: 'reduce',
};

export interface SplitResult {
  chunks: Array<{ index: number; content: string; tokenEstimate: number }>;
  totalTokens: number;
  mergeStrategy: string;
}

export class TaskSplitter {
  private config: TaskSplitterConfig;
  private logger?: any;

  constructor(config: Partial<TaskSplitterConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  splitText(text: string): SplitResult {
    if (!this.config.enabled) {
      return { chunks: [{ index: 0, content: text, tokenEstimate: Math.ceil(text.length / 4) }], totalTokens: Math.ceil(text.length / 4), mergeStrategy: 'concat' };
    }

    const maxChars = this.config.maxChunkTokens * 4;
    const chunks: SplitResult['chunks'] = [];

    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const para of paragraphs) {
      if ((currentChunk + para).length > maxChars && currentChunk.length > 0) {
        chunks.push({
          index: chunkIndex++,
          content: currentChunk.trim(),
          tokenEstimate: Math.ceil(currentChunk.length / 4),
        });
        currentChunk = para;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        index: chunkIndex,
        content: currentChunk.trim(),
        tokenEstimate: Math.ceil(currentChunk.length / 4),
      });
    }

    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);
    return { chunks, totalTokens, mergeStrategy: this.config.mergeStrategy };
  }

  mergeResults(results: string[]): string {
    switch (this.config.mergeStrategy) {
      case 'concat':
        return results.join('\n\n---\n\n');
      case 'reduce':
        return results.join('\n\n');
      case 'vote':
        // Return the longest result
        return results.reduce((best, r) => r.length > best.length ? r : best, '');
      default:
        return results.join('\n\n');
    }
  }

  getStats(): { enabled: boolean; maxChunkTokens: number; maxParallel: number } {
    return { enabled: this.config.enabled, maxChunkTokens: this.config.maxChunkTokens, maxParallel: this.config.maxParallel };
  }

  updateConfig(config: Partial<TaskSplitterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let globalSplitter: TaskSplitter | null = null;
export function getTaskSplitter(config?: Partial<TaskSplitterConfig>, logger?: any): TaskSplitter {
  if (!globalSplitter) globalSplitter = new TaskSplitter(config, logger);
  else if (config) globalSplitter.updateConfig(config);
  return globalSplitter;
}
