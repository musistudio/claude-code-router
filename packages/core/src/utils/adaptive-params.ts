export interface AdaptiveParams {
  max_tokens: number;
  temperature: number;
  top_p: number;
  thinking_budget?: number;
}

export interface ComplexitySignal {
  tokenCount: number;
  messageCount: number;
  hasTools: boolean;
  hasSystemPrompt: boolean;
  hasLongContent: boolean;
  hasCodeRequest: boolean;
  hasAgentPattern: boolean;
  hasWebSearch: boolean;
}

export class AdaptiveParameterTuner {
  private logger?: any;

  constructor(logger?: any) {
    this.logger = logger;
  }

  analyzeComplexity(body: any, tokenCount: number): ComplexitySignal {
    const messages = body.messages || [];
    const system = body.system;
    const tools = body.tools || [];

    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    const userText = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? lastUserMsg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text || '').join(' ')
        : '';

    const systemText = typeof system === 'string' ? system
      : Array.isArray(system)
        ? system.filter((s: any) => s.type === 'text').map((s: any) => s.text || '').join(' ')
        : '';

    return {
      tokenCount,
      messageCount: messages.length,
      hasTools: tools.length > 0,
      hasSystemPrompt: !!system,
      hasLongContent: userText.length > 2000,
      hasCodeRequest: /code|implement|function|class|debug|refactor|fix/i.test(userText),
      hasAgentPattern: /<CCR-SUBAGENT|agent|subagent/i.test(systemText),
      hasWebSearch: tools.some((t: any) => t.type?.startsWith('web_search')),
    };
  }

  tune(body: any, tokenCount: number, provider: string, model: string): AdaptiveParams {
    const complexity = this.analyzeComplexity(body, tokenCount);

    let max_tokens = 4096;
    let temperature = 0.7;
    let top_p = 1.0;

    const isReasoning = model.includes('reasoner') || model.includes('deepthink');
    const isFlash = model.includes('flash') || model.includes('haiku') || model.includes('mini');
    const isPro = model.includes('pro') || model.includes('opus');

    if (complexity.hasAgentPattern || complexity.hasTools) {
      max_tokens = isFlash ? 4096 : isPro ? 16384 : 8192;
      temperature = 0.5;
    }

    if (complexity.hasCodeRequest) {
      max_tokens = Math.max(max_tokens, 8192);
      temperature = 0.4;
    }

    if (complexity.hasLongContent || complexity.tokenCount > 50000) {
      max_tokens = Math.min(max_tokens * 2, 32768);
    }

    if (complexity.messageCount > 20) {
      temperature = Math.max(temperature - 0.1, 0.3);
    }

    if (isReasoning) {
      temperature = 1.0;
      top_p = 0.95;
    }

    if (complexity.hasWebSearch) {
      temperature = 0.3;
      max_tokens = Math.max(max_tokens, 2048);
    }

    const result: AdaptiveParams = {
      max_tokens: Math.min(max_tokens, 65536),
      temperature: Math.round(temperature * 100) / 100,
      top_p: Math.round(top_p * 100) / 100,
    };

    if (isReasoning && complexity.tokenCount > 30000) {
      result.thinking_budget = 10000;
    } else if (isReasoning) {
      result.thinking_budget = 5000;
    }

    return result;
  }

  applyTuning(body: any, params: AdaptiveParams): any {
    const tuned = { ...body };

    if (!tuned.max_tokens || tuned.max_tokens > params.max_tokens) {
      tuned.max_tokens = params.max_tokens;
    }

    if (tuned.temperature === undefined || tuned.temperature === null) {
      tuned.temperature = params.temperature;
    }

    if (params.thinking_budget && body.thinking) {
      tuned.thinking = { ...tuned.thinking, budget_tokens: params.thinking_budget };
    }

    return tuned;
  }
}

let _tuner: AdaptiveParameterTuner | null = null;

export function getAdaptiveParameterTuner(logger?: any): AdaptiveParameterTuner {
  if (!_tuner) {
    _tuner = new AdaptiveParameterTuner(logger);
  }
  return _tuner;
}
