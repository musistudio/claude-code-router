/**
 * Intent Router - 意图识别与知识库路由
 *
 * Classifies user queries by intent and routes to appropriate knowledge bases:
 * - Trading queries → trading knowledge base
 * - Code queries → code documentation
 * - General queries → general knowledge
 * - Data queries → data sources
 *
 * Design: Zero external dependencies. Keyword-based classification with optional LLM.
 */

export interface IntentRouterConfig {
  enabled: boolean;
  /** Intent definitions */
  intents: Array<{
    name: string;
    keywords: string[];
    knowledgeBase: string;
    priority: number;
  }>;
  /** Default intent when no match */
  defaultIntent: string;
  /** Use LLM for ambiguous queries */
  useLlmClassification: boolean;
  /** Proxy port for LLM classification */
  proxyPort: number;
  /** API key for LLM classification */
  apiKey: string;
}

const DEFAULT_CONFIG: IntentRouterConfig = {
  enabled: true,
  intents: [
    {
      name: 'trading',
      keywords: ['stock', 'trade', 'trading', 'position', 'order', 'buy', 'sell', 'market',
        '股票', '交易', '持仓', '买入', '卖出', '行情', '止损', '止盈'],
      knowledgeBase: 'trading_docs',
      priority: 10,
    },
    {
      name: 'code',
      keywords: ['code', 'function', 'class', 'api', 'debug', 'error', 'implement',
        '代码', '函数', '类', '接口', '调试', '错误', '实现'],
      knowledgeBase: 'code_docs',
      priority: 8,
    },
    {
      name: 'data',
      keywords: ['data', 'csv', 'json', 'database', 'query', 'analyze', 'statistics',
        '数据', '分析', '统计', '查询', '数据库'],
      knowledgeBase: 'data_docs',
      priority: 6,
    },
    {
      name: 'strategy',
      keywords: ['strategy', 'backtest', 'indicator', 'signal', 'factor', 'alpha',
        '策略', '回测', '指标', '信号', '因子'],
      knowledgeBase: 'strategy_docs',
      priority: 9,
    },
    {
      name: 'risk',
      keywords: ['risk', 'drawdown', 'sharpe', 'var', 'volatility', 'exposure',
        '风险', '回撤', '波动率', '敞口', '风控'],
      knowledgeBase: 'risk_docs',
      priority: 9,
    },
  ],
  defaultIntent: 'general',
  useLlmClassification: false,
  proxyPort: 3456,
  apiKey: '',
};

export interface IntentResult {
  intent: string;
  knowledgeBase: string;
  confidence: number;
  matchedKeywords: string[];
}

export class IntentRouter {
  private config: IntentRouterConfig;
  private logger?: any;

  constructor(config: Partial<IntentRouterConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Classify a query and return the matched intent.
   */
  async classify(query: string): Promise<IntentResult> {
    if (!this.config.enabled) {
      return {
        intent: this.config.defaultIntent,
        knowledgeBase: 'general',
        confidence: 1,
        matchedKeywords: [],
      };
    }

    const queryLower = query.toLowerCase();
    const scores: Array<{ intent: string; score: number; matched: string[] }> = [];

    for (const intent of this.config.intents) {
      const matched: string[] = [];
      for (const keyword of intent.keywords) {
        if (queryLower.includes(keyword.toLowerCase())) {
          matched.push(keyword);
        }
      }

      if (matched.length > 0) {
        scores.push({
          intent: intent.name,
          score: matched.length * intent.priority,
          matched,
        });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    if (scores.length > 0) {
      const best = scores[0];
      const intentConfig = this.config.intents.find(i => i.name === best.intent);
      const confidence = Math.min(best.matched.length / 3, 1);

      return {
        intent: best.intent,
        knowledgeBase: intentConfig?.knowledgeBase || 'general',
        confidence,
        matchedKeywords: best.matched,
      };
    }

    // No keyword match - try LLM classification if enabled
    if (this.config.useLlmClassification) {
      const llmResult = await this.llmClassify(query);
      if (llmResult) return llmResult;
    }

    return {
      intent: this.config.defaultIntent,
      knowledgeBase: 'general',
      confidence: 0.5,
      matchedKeywords: [],
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<IntentRouterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async llmClassify(query: string): Promise<IntentResult | null> {
    const intentNames = this.config.intents.map(i => i.name).join(', ');
    const prompt = `Classify this query into one of these intents: ${intentNames}

Query: ${query.slice(0, 200)}

Reply with ONLY the intent name.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`http://127.0.0.1:${this.config.proxyPort}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          model: 'openai,gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;
      const data = await response.json();
      const text = (data.content?.[0]?.text || '').trim().toLowerCase();

      const matched = this.config.intents.find(i => i.name === text);
      if (matched) {
        return {
          intent: matched.name,
          knowledgeBase: matched.knowledgeBase,
          confidence: 0.7,
          matchedKeywords: [],
        };
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }
}

let globalIntentRouter: IntentRouter | null = null;

export function getIntentRouter(config?: Partial<IntentRouterConfig>, logger?: any): IntentRouter {
  if (!globalIntentRouter) {
    globalIntentRouter = new IntentRouter(config, logger);
  } else if (config) {
    globalIntentRouter.updateConfig(config);
  }
  return globalIntentRouter;
}
