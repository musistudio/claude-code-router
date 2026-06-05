import { createHash } from 'crypto';

export interface ChainStep {
  id: string;
  role: 'generator' | 'reviewer' | 'reviser' | 'aggregator';
  model: string;
  provider: string;
  systemPrompt: string | ((context: ChainContext) => string);
  maxTokens: number;
  timeout: number;
}

export interface ChainContext {
  originalRequest: any;
  previousResults: Map<string, StepResult>;
  metadata: Record<string, any>;
}

export interface StepResult {
  stepId: string;
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface ChainOutput {
  finalResponse: string;
  chainId: string;
  totalSteps: number;
  successfulSteps: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  totalCost: number;
}

export interface ChainTemplate {
  name: string;
  description: string;
  steps: ChainStep[];
  aggregation: 'last' | 'best_quality' | 'concat';
}

export class ReasoningChainEngine {
  private templates: Map<string, ChainTemplate> = new Map();
  private logger?: any;
  private callUpstream: (provider: string, model: string, request: any) => Promise<{ content: string; inputTokens: number; outputTokens: number }>;

  constructor(
    callUpstream: (provider: string, model: string, request: any) => Promise<{ content: string; inputTokens: number; outputTokens: number }>,
    logger?: any
  ) {
    this.callUpstream = callUpstream;
    this.logger = logger;
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates(): void {
    this.registerTemplate({
      name: 'generate-review-revise',
      description: 'Generate initial draft, review for issues, revise based on feedback',
      aggregation: 'last',
      steps: [
        {
          id: 'generate',
          role: 'generator',
          model: 'deepseek-chat',
          provider: 'deepseek',
          systemPrompt: 'You are an expert code generator. Generate high-quality code based on the requirements.',
          maxTokens: 8192,
          timeout: 60000,
        },
        {
          id: 'review',
          role: 'reviewer',
          model: 'deepseek-reasoner',
          provider: 'deepseek',
          systemPrompt: (ctx) => {
            const genResult = ctx.previousResults.get('generate');
            return `You are a senior code reviewer. Review the following code for bugs, security issues, performance problems, and style issues. Provide specific, actionable feedback.\n\nCode to review:\n${genResult?.content || ''}`;
          },
          maxTokens: 4096,
          timeout: 60000,
        },
        {
          id: 'revise',
          role: 'reviser',
          model: 'deepseek-chat',
          provider: 'deepseek',
          systemPrompt: (ctx) => {
            const genResult = ctx.previousResults.get('generate');
            const reviewResult = ctx.previousResults.get('review');
            return `You are revising code based on review feedback. Apply all suggested fixes and improvements.\n\nOriginal code:\n${genResult?.content || ''}\n\nReview feedback:\n${reviewResult?.content || ''}\n\nProvide the revised code only.`;
          },
          maxTokens: 8192,
          timeout: 60000,
        },
      ],
    });

    this.registerTemplate({
      name: 'plan-execute-verify',
      description: 'Plan approach, execute plan, verify results',
      aggregation: 'last',
      steps: [
        {
          id: 'plan',
          role: 'generator',
          model: 'deepseek-reasoner',
          provider: 'deepseek',
          systemPrompt: 'You are a planning expert. Analyze the task and create a detailed step-by-step plan. Focus on correctness and edge cases.',
          maxTokens: 4096,
          timeout: 60000,
        },
        {
          id: 'execute',
          role: 'generator',
          model: 'deepseek-chat',
          provider: 'deepseek',
          systemPrompt: (ctx) => {
            const plan = ctx.previousResults.get('plan');
            return `Follow this plan precisely to implement the solution:\n\n${plan?.content || ''}\n\nProvide the complete implementation.`;
          },
          maxTokens: 8192,
          timeout: 90000,
        },
        {
          id: 'verify',
          role: 'reviewer',
          model: 'deepseek-chat',
          provider: 'deepseek',
          systemPrompt: (ctx) => {
            const execute = ctx.previousResults.get('execute');
            return `Verify this implementation is correct. Check for:\n1. Logic errors\n2. Edge cases\n3. Error handling\n4. Type safety\n\nImplementation:\n${execute?.content || ''}\n\nIf issues found, provide corrected code. If correct, confirm.`;
          },
          maxTokens: 8192,
          timeout: 60000,
        },
      ],
    });

    this.registerTemplate({
      name: 'multi-perspective',
      description: 'Generate from multiple perspectives and select best',
      aggregation: 'best_quality',
      steps: [
        {
          id: 'perspective_a',
          role: 'generator',
          model: 'deepseek-chat',
          provider: 'deepseek',
          systemPrompt: 'You are a pragmatic engineer. Focus on simplicity, readability, and maintainability.',
          maxTokens: 4096,
          timeout: 60000,
        },
        {
          id: 'perspective_b',
          role: 'generator',
          model: 'qwen2.5-coder:7b',
          provider: 'ollama',
          systemPrompt: 'You are a performance-focused engineer. Optimize for speed and memory efficiency.',
          maxTokens: 4096,
          timeout: 90000,
        },
      ],
    });
  }

  registerTemplate(template: ChainTemplate): void {
    this.templates.set(template.name, template);
  }

  listTemplates(): Array<{ name: string; description: string; stepCount: number }> {
    return Array.from(this.templates.values()).map(t => ({
      name: t.name,
      description: t.description,
      stepCount: t.steps.length,
    }));
  }

  async executeChain(
    templateName: string,
    request: any,
    metadata: Record<string, any> = {}
  ): Promise<ChainOutput> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Unknown chain template: ${templateName}`);
    }

    const chainId = this.generateChainId();
    const context: ChainContext = {
      originalRequest: request,
      previousResults: new Map(),
      metadata,
    };

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;
    let successfulSteps = 0;

    for (const step of template.steps) {
      const stepStart = Date.now();

      try {
        const systemPrompt = typeof step.systemPrompt === 'function'
          ? step.systemPrompt(context)
          : step.systemPrompt;

        const upstreamRequest = {
          ...request,
          model: `${step.provider},${step.model}`,
          system: [{ type: 'text', text: systemPrompt }],
          max_tokens: step.maxTokens,
        };

        const result = await this.executeWithTimeout(
          this.callUpstream(step.provider, step.model, upstreamRequest),
          step.timeout
        );

        const stepResult: StepResult = {
          stepId: step.id,
          content: result.content,
          model: step.model,
          provider: step.provider,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: Date.now() - stepStart,
          success: true,
        };

        context.previousResults.set(step.id, stepResult);
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        totalLatencyMs += Date.now() - stepStart;
        successfulSteps++;

        this.logger?.info(
          `Chain[${chainId}] step '${step.id}' completed: ${result.outputTokens} output tokens in ${Date.now() - stepStart}ms`
        );
      } catch (error: any) {
        const stepResult: StepResult = {
          stepId: step.id,
          content: '',
          model: step.model,
          provider: step.provider,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - stepStart,
          success: false,
          error: error.message,
        };

        context.previousResults.set(step.id, stepResult);
        totalLatencyMs += Date.now() - stepStart;

        this.logger?.error(
          `Chain[${chainId}] step '${step.id}' FAILED: ${error.message}`
        );

        if (step.role === 'generator') {
          break;
        }
      }
    }

    const finalResponse = this.aggregateResults(template, context);

    return {
      finalResponse,
      chainId,
      totalSteps: template.steps.length,
      successfulSteps,
      totalInputTokens,
      totalOutputTokens,
      totalLatencyMs,
      totalCost: 0,
    };
  }

  private aggregateResults(template: ChainTemplate, context: ChainContext): string {
    const results = Array.from(context.previousResults.values())
      .filter(r => r.success);

    switch (template.aggregation) {
      case 'last':
        return results.length > 0 ? results[results.length - 1].content : '';

      case 'best_quality': {
        if (results.length === 0) return '';
        return results.reduce((best, current) => {
          const bestScore = this.scoreResponse(best.content);
          const currentScore = this.scoreResponse(current.content);
          return currentScore > bestScore ? current : best;
        }).content;
      }

      case 'concat':
        return results.map(r => r.content).join('\n\n---\n\n');

      default:
        return results.length > 0 ? results[results.length - 1].content : '';
    }
  }

  private scoreResponse(content: string): number {
    let score = 0;
    if (content.length > 100) score += 1;
    if (content.includes('```')) score += 2;
    if (/function|class|def |import /.test(content)) score += 1;
    if (/error|exception|catch/.test(content.toLowerCase())) score += 1;
    if (content.length > 500) score += 1;
    score += Math.min(3, Math.floor(content.length / 500));
    return score;
  }

  private generateChainId(): string {
    return `chain-${Date.now().toString(36)}-${createHash('sha256')
      .update(`${Math.random()}-${process.pid}`)
      .digest('hex')
      .substring(0, 8)}`;
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Step timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

let _engine: ReasoningChainEngine | null = null;

export function getReasoningChainEngine(
  callUpstream: (provider: string, model: string, request: any) => Promise<{ content: string; inputTokens: number; outputTokens: number }>,
  logger?: any
): ReasoningChainEngine {
  if (!_engine) {
    _engine = new ReasoningChainEngine(callUpstream, logger);
  }
  return _engine;
}
