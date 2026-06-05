/**
 * Cascade Chain - 级联模型链
 *
 * Implements draft→refine pipeline:
 * 1. Fast model generates draft response
 * 2. Strong model refines/polishes the draft
 * 3. Optional: third model validates the final output
 *
 * Design: Zero external dependencies. Uses proxy self-calls.
 */

export interface CascadeChainConfig {
  enabled: boolean;
  /** Draft model (fast, cheap) */
  draftModel: string;
  /** Refine model (strong, expensive) */
  refineModel: string;
  /** Validate model (optional, for quality check) */
  validateModel?: string;
  /** Proxy port for self-calls */
  proxyPort: number;
  /** API key for self-calls */
  apiKey: string;
  /** Timeout per stage in ms */
  stageTimeoutMs: number;
  /** Skip refinement if draft quality is high enough */
  skipRefineThreshold: number;
}

const DEFAULT_CONFIG: CascadeChainConfig = {
  enabled: false,
  draftModel: 'openai,gpt-4o-mini',
  refineModel: 'openai,gpt-4o',
  proxyPort: 3456,
  apiKey: '',
  stageTimeoutMs: 15000,
  skipRefineThreshold: 0.9,
};

export interface CascadeResult {
  draft: any;
  refined?: any;
  validated?: any;
  finalResponse: any;
  stagesCompleted: string[];
  totalElapsedMs: number;
  skippedRefinement: boolean;
}

export class CascadeChain {
  private config: CascadeChainConfig;
  private logger?: any;

  constructor(config: Partial<CascadeChainConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Execute cascade chain on a request body.
   */
  async execute(body: any): Promise<CascadeResult> {
    if (!this.config.enabled) {
      // Just pass through to draft model
      const draft = await this.queryModel(body, this.config.draftModel);
      return {
        draft,
        finalResponse: draft,
        stagesCompleted: ['draft'],
        totalElapsedMs: 0,
        skippedRefinement: false,
      };
    }

    const startTime = Date.now();
    const stagesCompleted: string[] = [];

    // Stage 1: Draft
    this.logger?.info(`CascadeChain: draft stage with ${this.config.draftModel}`);
    const draft = await this.queryModel(body, this.config.draftModel);
    stagesCompleted.push('draft');

    if (!draft) {
      return {
        draft: null,
        finalResponse: null,
        stagesCompleted,
        totalElapsedMs: Date.now() - startTime,
        skippedRefinement: false,
      };
    }

    // Stage 2: Refine
    this.logger?.info(`CascadeChain: refine stage with ${this.config.refineModel}`);
    const refinePrompt = this.buildRefinePrompt(body, draft);
    const refined = await this.queryModel(
      { ...body, messages: [{ role: 'user', content: refinePrompt }], stream: false },
      this.config.refineModel
    );
    stagesCompleted.push('refine');

    let finalResponse = refined || draft;

    // Stage 3: Validate (optional)
    if (this.config.validateModel) {
      this.logger?.info(`CascadeChain: validate stage with ${this.config.validateModel}`);
      const validatePrompt = this.buildValidatePrompt(body, finalResponse);
      const validated = await this.queryModel(
        { ...body, messages: [{ role: 'user', content: validatePrompt }], stream: false },
        this.config.validateModel
      );
      if (validated) {
        stagesCompleted.push('validate');
      }
    }

    return {
      draft,
      refined,
      finalResponse,
      stagesCompleted,
      totalElapsedMs: Date.now() - startTime,
      skippedRefinement: false,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<CascadeChainConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private buildRefinePrompt(originalBody: any, draftResponse: any): string {
    const userQuery = this.extractUserQuery(originalBody);
    const draftText = this.extractText(draftResponse);

    return `You are a quality editor. Improve the following AI response for accuracy, clarity, and completeness.

Original user query: ${userQuery}

Draft response:
${draftText}

Provide an improved version that:
1. Fixes any errors or inaccuracies
2. Improves clarity and readability
3. Adds missing important details
4. Maintains the original intent

Improved response:`;
  }

  private buildValidatePrompt(originalBody: any, response: any): string {
    const userQuery = this.extractUserQuery(originalBody);
    const responseText = this.extractText(response);

    return `Validate this AI response for correctness and completeness.

User query: ${userQuery}

Response: ${responseText}

Is this response accurate and complete? Reply with:
VALID: yes/no
ISSUES: <any issues found>
CORRECTIONS: <suggested corrections if any>`;
  }

  private async queryModel(body: any, model: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.stageTimeoutMs);

    try {
      const response = await fetch(`http://127.0.0.1:${this.config.proxyPort}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
        },
        body: JSON.stringify({ ...body, model, stream: false }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;
      return await response.json();
    } catch (e: any) {
      clearTimeout(timeout);
      this.logger?.warn(`CascadeChain query failed (${model}): ${e?.message}`);
      return null;
    }
  }

  private extractUserQuery(body: any): string {
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

  private extractText(response: any): string {
    if (!response) return '';
    if (typeof response === 'string') return response;
    if (response.content) {
      if (typeof response.content === 'string') return response.content;
      if (Array.isArray(response.content)) {
        return response.content.filter((c: any) => c.type === 'text').map((c: any) => c.text || '').join('\n');
      }
    }
    return JSON.stringify(response);
  }
}

let globalCascade: CascadeChain | null = null;

export function getCascadeChain(config?: Partial<CascadeChainConfig>, logger?: any): CascadeChain {
  if (!globalCascade) {
    globalCascade = new CascadeChain(config, logger);
  } else if (config) {
    globalCascade.updateConfig(config);
  }
  return globalCascade;
}
