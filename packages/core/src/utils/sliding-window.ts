/**
 * Sliding Window Manager - 滑动窗口摘要与长对话压缩
 *
 * Manages context window overflow by:
 * - Detecting when token count exceeds threshold
 * - Summarizing old messages into a compact form
 * - Preserving recent messages in full
 * - Injecting summary as system context
 *
 * Design: Uses the proxy itself for summarization (self-call).
 */

export interface SlidingWindowConfig {
  enabled: boolean;
  /** Max tokens before triggering compression */
  maxTokens: number;
  /** Number of recent messages to keep in full */
  keepRecentMessages: number;
  /** Model to use for summarization */
  summaryModel: string;
  /** Proxy port for self-calls */
  proxyPort: number;
  /** API key for self-calls */
  apiKey: string;
  /** Timeout for summarization in ms */
  summaryTimeoutMs: number;
}

const DEFAULT_CONFIG: SlidingWindowConfig = {
  enabled: false,
  maxTokens: 100000,
  keepRecentMessages: 6,
  summaryModel: 'openai,gpt-4o-mini',
  proxyPort: 3456,
  apiKey: '',
  summaryTimeoutMs: 10000,
};

export interface CompressionResult {
  compressed: boolean;
  messages: any[];
  summary?: string;
  originalTokenCount: number;
  compressedTokenCount: number;
}

export class SlidingWindowManager {
  private config: SlidingWindowConfig;
  private logger?: any;

  constructor(config: Partial<SlidingWindowConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Compress messages if they exceed the token limit.
   * Returns the (possibly compressed) messages array.
   */
  async compress(messages: any[], system?: string | any[]): Promise<CompressionResult> {
    if (!this.config.enabled) {
      return {
        compressed: false,
        messages,
        originalTokenCount: this.estimateTokens(messages, system),
        compressedTokenCount: this.estimateTokens(messages, system),
      };
    }

    const tokenCount = this.estimateTokens(messages, system);

    if (tokenCount <= this.config.maxTokens) {
      return {
        compressed: false,
        messages,
        originalTokenCount: tokenCount,
        compressedTokenCount: tokenCount,
      };
    }

    this.logger?.info(`SlidingWindow: token count ${tokenCount} exceeds ${this.config.maxTokens}, compressing...`);

    // Split into old (to summarize) and recent (to keep)
    const keepCount = Math.min(this.config.keepRecentMessages, messages.length);
    const oldMessages = messages.slice(0, messages.length - keepCount);
    const recentMessages = messages.slice(messages.length - keepCount);

    // Generate summary of old messages
    const summary = await this.summarize(oldMessages);

    if (!summary) {
      this.logger?.warn('SlidingWindow: summarization failed, returning original messages');
      return {
        compressed: false,
        messages,
        originalTokenCount: tokenCount,
        compressedTokenCount: tokenCount,
      };
    }

    // Build compressed message list
    const compressedMessages = [
      {
        role: 'user',
        content: `[Previous conversation summary]\n${summary}`,
      },
      ...recentMessages,
    ];

    const compressedTokenCount = this.estimateTokens(compressedMessages, system);

    this.logger?.info(
      `SlidingWindow: compressed ${tokenCount} → ${compressedTokenCount} tokens ` +
      `(${oldMessages.length} messages → summary + ${keepCount} recent)`
    );

    return {
      compressed: true,
      messages: compressedMessages,
      summary,
      originalTokenCount: tokenCount,
      compressedTokenCount,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<SlidingWindowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async summarize(messages: any[]): Promise<string | null> {
    const conversationText = messages
      .map(m => {
        const content = typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.filter((c: any) => c.type === 'text').map((c: any) => c.text || '').join(' ')
            : JSON.stringify(m.content);
        return `${m.role}: ${content}`;
      })
      .join('\n')
      .slice(0, 8000); // Limit input to summarize

    const prompt = `Summarize the following conversation in 200-400 words, preserving key context, decisions, and technical details:

${conversationText}

Summary:`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.summaryTimeoutMs);

    try {
      const response = await fetch(`http://127.0.0.1:${this.config.proxyPort}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'x-internal-summary': 'true', // Prevent infinite recursion
        },
        body: JSON.stringify({
          model: this.config.summaryModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;
      const data = await response.json();
      return data.content?.[0]?.text || null;
    } catch (e: any) {
      clearTimeout(timeout);
      this.logger?.warn(`SlidingWindow summarize failed: ${e?.message}`);
      return null;
    }
  }

  private estimateTokens(messages: any[], system?: string | any[]): number {
    let chars = 0;

    if (system) {
      if (typeof system === 'string') {
        chars += system.length;
      } else if (Array.isArray(system)) {
        chars += JSON.stringify(system).length;
      }
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        chars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        chars += msg.content.reduce((sum: number, c: any) => sum + (c.text?.length || 0), 0);
      }
    }

    return Math.ceil(chars / 4);
  }
}

let globalSlidingWindow: SlidingWindowManager | null = null;

export function getSlidingWindow(config?: Partial<SlidingWindowConfig>, logger?: any): SlidingWindowManager {
  if (!globalSlidingWindow) {
    globalSlidingWindow = new SlidingWindowManager(config, logger);
  } else if (config) {
    globalSlidingWindow.updateConfig(config);
  }
  return globalSlidingWindow;
}
