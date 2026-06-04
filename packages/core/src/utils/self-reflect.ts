/**
 * Self-Reflection - 自我反思循环
 *
 * Implements a critique-and-revise loop:
 * 1. Generate initial response
 * 2. Ask a model to critique the response
 * 3. Revise based on critique
 * 4. Repeat until quality threshold met or max iterations reached
 *
 * Design: Zero external dependencies. Uses the proxy itself for model calls.
 */

export interface ReflectionConfig {
  enabled: boolean;
  /** Max reflection iterations */
  maxIterations: number;
  /** Quality threshold (0-1, stop if confidence exceeds this) */
  qualityThreshold: number;
  /** Model to use for reflection (defaults to same model) */
  reflectionModel?: string;
  /** Whether to include reflection chain in final response */
  includeChain: boolean;
  /** Timeout per reflection iteration in ms */
  iterationTimeoutMs: number;
}

const DEFAULT_CONFIG: ReflectionConfig = {
  enabled: false,
  maxIterations: 2,
  qualityThreshold: 0.8,
  includeChain: false,
  iterationTimeoutMs: 15000,
};

export interface ReflectionResult {
  /** Final refined response */
  response: any;
  /** Number of iterations performed */
  iterations: number;
  /** Reflection chain (if includeChain=true) */
  chain?: Array<{ iteration: number; critique: string; revision: string; confidence: number }>;
  /** Final confidence score */
  finalConfidence: number;
  /** Total elapsed time */
  totalElapsedMs: number;
}

export class SelfReflector {
  private config: ReflectionConfig;
  private proxyPort: number;
  private apiKey: string;
  private logger?: any;

  constructor(
    config: Partial<ReflectionConfig> = {},
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
   * Execute a self-reflection loop.
   * @param body The original request body
   * @param initialResponse The initial model response
   * @returns Refined response with reflection chain
   */
  async reflect(body: any, initialResponse: any): Promise<ReflectionResult | null> {
    if (!this.config.enabled) return null;

    const startTime = Date.now();
    const chain: Array<{ iteration: number; critique: string; revision: string; confidence: number }> = [];

    let currentResponse = initialResponse;
    let currentConfidence = 0.5;

    for (let i = 0; i < this.config.maxIterations; i++) {
      // Critique the current response
      const critique = await this.getCritique(body, currentResponse);
      if (!critique) break;

      const confidence = critique.confidence;
      currentConfidence = confidence;

      this.logger?.debug(`SelfReflection: iteration ${i + 1}, confidence=${confidence.toFixed(2)}`);

      // Check if quality threshold met
      if (confidence >= this.config.qualityThreshold) {
        this.logger?.info(`SelfReflection: quality threshold met (${confidence.toFixed(2)} >= ${this.config.qualityThreshold})`);
        break;
      }

      // Revise based on critique
      const revision = await this.getRevision(body, currentResponse, critique.feedback);
      if (!revision) break;

      chain.push({
        iteration: i + 1,
        critique: critique.feedback,
        revision: this.extractText(revision),
        confidence,
      });

      currentResponse = revision;
    }

    const elapsed = Date.now() - startTime;

    return {
      response: currentResponse,
      iterations: chain.length,
      chain: this.config.includeChain ? chain : undefined,
      finalConfidence: currentConfidence,
      totalElapsedMs: elapsed,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<ReflectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async getCritique(body: any, response: any): Promise<{ feedback: string; confidence: number } | null> {
    const responseText = this.extractText(response);
    const userQuestion = this.extractUserMessage(body);

    const critiquePrompt = `You are a quality reviewer. Evaluate this AI response for correctness, completeness, and helpfulness.

User question: ${userQuestion}

AI response: ${responseText}

Rate the response quality from 0.0 to 1.0 and provide specific feedback on what could be improved.
Format your response as:
CONFIDENCE: <0.0-1.0>
FEEDBACK: <your feedback>`;

    try {
      const result = await this.queryModel(critiquePrompt);
      if (!result) return null;

      const text = this.extractText(result);
      const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
      const feedbackMatch = text.match(/FEEDBACK:\s*([\s\S]+)/i);

      return {
        feedback: feedbackMatch?.[1]?.trim() || text,
        confidence: Math.max(0, Math.min(1, parseFloat(confidenceMatch?.[1] || '0.5') || 0.5)),
      };
    } catch (error: any) {
      this.logger?.warn(`SelfReflection critique failed: ${error.message}`);
      return null;
    }
  }

  private async getRevision(body: any, response: any, critique: string): Promise<any | null> {
    const responseText = this.extractText(response);
    const userQuestion = this.extractUserMessage(body);

    const revisionPrompt = `You are improving an AI response based on feedback.

User question: ${userQuestion}

Current response: ${responseText}

Feedback: ${critique}

Provide an improved response that addresses the feedback. Return ONLY the improved response, no meta-commentary.`;

    try {
      return await this.queryModel(revisionPrompt);
    } catch (error: any) {
      this.logger?.warn(`SelfReflection revision failed: ${error.message}`);
      return null;
    }
  }

  private async queryModel(prompt: string): Promise<any> {
    const model = this.config.reflectionModel || 'openai,gpt-4o-mini';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.iterationTimeoutMs);

    try {
      const response = await fetch(`http://127.0.0.1:${this.proxyPort}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'x-self-reflect': 'true', // Prevent infinite recursion
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
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
          return content.filter((c: any) => c.type === 'text').map((c: any) => c.text || '').join(' ').slice(0, 500);
        }
      }
    }
    return '';
  }
}

let globalReflector: SelfReflector | null = null;

export function getSelfReflector(
  config?: Partial<ReflectionConfig>,
  proxyPort?: number,
  apiKey?: string,
  logger?: any
): SelfReflector {
  if (!globalReflector) {
    globalReflector = new SelfReflector(config, proxyPort, apiKey, logger);
  } else if (config) {
    globalReflector.updateConfig(config);
  }
  return globalReflector;
}
