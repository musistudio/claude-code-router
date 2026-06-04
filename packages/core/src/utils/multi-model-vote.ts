/**
 * Multi-Model Vote - 多模型投票/辩论
 *
 * Queries multiple models simultaneously and selects the best response via:
 * - Majority voting (most common answer)
 * - Best-of-N (longest/most detailed)
 * - LLM arbitration (ask a judge model to pick the best)
 *
 * Design: Zero external dependencies. Uses concurrent fetch for parallel queries.
 */

export interface VoteConfig {
  enabled: boolean;
  /** Voting strategy */
  strategy: 'majority' | 'best_of_n' | 'llm_arbitration';
  /** Models to query (provider,model pairs) */
  models: string[];
  /** Judge model for llm_arbitration strategy */
  judgeModel?: string;
  /** Timeout for all votes in ms */
  timeoutMs: number;
  /** Minimum votes required */
  minVotes: number;
}

const DEFAULT_CONFIG: VoteConfig = {
  enabled: false,
  strategy: 'best_of_n',
  models: [],
  timeoutMs: 30000,
  minVotes: 2,
};

export interface VoteResult {
  /** The winning response */
  winner: any;
  /** All responses from all models */
  responses: Array<{ model: string; response: any; latencyMs: number; error?: string }>;
  /** Strategy used */
  strategy: string;
  /** Total elapsed time */
  totalElapsedMs: number;
  /** Number of successful votes */
  successCount: number;
}

export class MultiModelVoter {
  private config: VoteConfig;
  private proxyPort: number;
  private apiKey: string;
  private logger?: any;

  constructor(
    config: Partial<VoteConfig> = {},
    proxyPort: number = 3456,
    apiKey: string = '',
    logger?: any
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.proxyPort = proxyPort;
    this.apiKey = apiKey;
    this.logger = logger;
  }

  /**
   * Execute a multi-model vote.
   * @param body The original request body (messages, system, etc.)
   * @returns The winning response
   */
  async vote(body: any): Promise<VoteResult | null> {
    if (!this.config.enabled || this.config.models.length < this.config.minVotes) {
      return null;
    }

    const startTime = Date.now();
    this.logger?.info(`MultiModelVote: querying ${this.config.models.length} models with strategy=${this.config.strategy}`);

    // Query all models in parallel
    const responses = await this.queryAllModels(body);

    const successResponses = responses.filter((r) => !r.error);
    if (successResponses.length < this.config.minVotes) {
      this.logger?.warn(`MultiModelVote: only ${successResponses.length} successful responses (need ${this.config.minVotes})`);
      return null;
    }

    // Select winner based on strategy
    let winner: any;
    switch (this.config.strategy) {
      case 'majority':
        winner = this.majorityVote(successResponses);
        break;
      case 'best_of_n':
        winner = this.bestOfN(successResponses);
        break;
      case 'llm_arbitration':
        winner = await this.llmArbitration(successResponses, body);
        break;
    }

    const elapsed = Date.now() - startTime;
    this.logger?.info(`MultiModelVote: completed in ${elapsed}ms, winner=${winner?.model}`);

    return {
      winner: winner?.response,
      responses,
      strategy: this.config.strategy,
      totalElapsedMs: elapsed,
      successCount: successResponses.length,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<VoteConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async queryAllModels(body: any): Promise<Array<{ model: string; response: any; latencyMs: number; error?: string }>> {
    const promises = this.config.models.map(async (model) => {
      const startTime = Date.now();
      try {
        const response = await this.queryModel(body, model);
        return {
          model,
          response,
          latencyMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          model,
          response: null,
          latencyMs: Date.now() - startTime,
          error: error.message,
        };
      }
    });

    return Promise.all(promises);
  }

  private async queryModel(body: any, model: string): Promise<any> {
    const modifiedBody = { ...body, model, stream: false };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`http://127.0.0.1:${this.proxyPort}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(modifiedBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private majorityVote(responses: Array<{ model: string; response: any }>): { model: string; response: any } | null {
    // Group by similar text content
    const groups = new Map<string, Array<{ model: string; response: any }>>();

    for (const item of responses) {
      const text = this.extractText(item.response);
      const key = this.normalizeForComparison(text);

      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }

    // Find largest group
    let maxSize = 0;
    let winner: { model: string; response: any } | null = null;

    for (const group of groups.values()) {
      if (group.length > maxSize) {
        maxSize = group.length;
        winner = group[0];
      }
    }

    return winner;
  }

  private bestOfN(responses: Array<{ model: string; response: any }>): { model: string; response: any } | null {
    if (responses.length === 0) return null;

    // Select the longest/most detailed response
    let best = responses[0];
    let bestLength = 0;

    for (const item of responses) {
      const text = this.extractText(item.response);
      if (text.length > bestLength) {
        bestLength = text.length;
        best = item;
      }
    }

    return best;
  }

  private async llmArbitration(
    responses: Array<{ model: string; response: any }>,
    originalBody: any
  ): Promise<{ model: string; response: any } | null> {
    if (!this.config.judgeModel) {
      return this.bestOfN(responses);
    }

    // Build arbitration prompt
    const candidates = responses.map((r, i) => {
      const text = this.extractText(r.response);
      return `Candidate ${i + 1} (${r.model}):\n${text}`;
    }).join('\n\n---\n\n');

    const judgePrompt = `You are a judge evaluating AI responses. Given the original question and multiple candidate responses, select the BEST response. Return ONLY the candidate number (1-${responses.length}).

Original question: ${this.extractUserMessage(originalBody)}

${candidates}

Which candidate is the best? Return ONLY the number:`;

    try {
      const judgeResponse = await this.queryModel(
        {
          messages: [{ role: 'user', content: judgePrompt }],
          stream: false,
        },
        this.config.judgeModel
      );

      const judgeText = this.extractText(judgeResponse);
      const match = judgeText.match(/(\d+)/);
      if (match) {
        const index = parseInt(match[1], 10) - 1;
        if (index >= 0 && index < responses.length) {
          return responses[index];
        }
      }
    } catch (error: any) {
      this.logger?.warn(`LLM arbitration failed: ${error.message}`);
    }

    // Fallback to best-of-N
    return this.bestOfN(responses);
  }

  private extractText(response: any): string {
    if (!response) return '';
    if (typeof response === 'string') return response;

    if (response.content) {
      if (typeof response.content === 'string') return response.content;
      if (Array.isArray(response.content)) {
        return response.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text || '')
          .join('\n');
      }
    }

    return JSON.stringify(response);
  }

  private extractUserMessage(body: any): string {
    const messages = body.messages || [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        if (typeof content === 'string') return content.slice(0, 500);
        if (Array.isArray(content)) {
          return content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || '')
            .join(' ')
            .slice(0, 500);
        }
      }
    }
    return '';
  }

  private normalizeForComparison(text: string): string {
    // Normalize for fuzzy comparison
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim()
      .slice(0, 200);
  }
}

let globalVoter: MultiModelVoter | null = null;

export function getMultiModelVoter(
  config?: Partial<VoteConfig>,
  proxyPort?: number,
  apiKey?: string,
  logger?: any
): MultiModelVoter {
  if (!globalVoter) {
    globalVoter = new MultiModelVoter(config, proxyPort, apiKey, logger);
  } else if (config) {
    globalVoter.updateConfig(config);
  }
  return globalVoter;
}
