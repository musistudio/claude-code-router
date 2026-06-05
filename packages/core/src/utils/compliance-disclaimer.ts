/**
 * Compliance Disclaimer - 合规免责声明自动追加
 *
 * Automatically appends financial disclaimers to system prompts:
 * - Investment risk warnings
 * - Not financial advice disclaimers
 * - Data accuracy notices
 * - Regulatory compliance notices
 *
 * Design: Zero external dependencies. Configurable templates.
 */

export interface DisclaimerConfig {
  enabled: boolean;
  /** Disclaimer text to append */
  disclaimer: string;
  /** Only append for financial/trading related queries */
  financialOnly: boolean;
  /** Keywords that trigger financial disclaimer */
  financialKeywords: string[];
  /** Where to inject: 'system' | 'user_message' */
  injectTarget: 'system' | 'user_message';
}

const DEFAULT_CONFIG: DisclaimerConfig = {
  enabled: true,
  disclaimer: `\n\n<compliance_notice>
重要声明：本回复仅供参考，不构成任何投资建议、交易指导或承诺。金融市场存在风险，投资需谨慎。过往表现不代表未来收益。请在做出任何投资决策前咨询持牌专业人士。数据可能存在延迟或误差，请以官方数据源为准。
</compliance_notice>`,
  financialOnly: true,
  financialKeywords: [
    'stock', 'trade', 'trading', 'invest', 'investment', 'portfolio',
    'position', 'order', 'buy', 'sell', 'market', 'price', 'chart',
    'technical analysis', 'fundamental', 'risk', 'profit', 'loss',
    '股票', '交易', '投资', '持仓', '买入', '卖出', '行情', 'K线',
    '技术分析', '基本面', '风控', '盈亏', '止损', '止盈', '策略',
    '基金', '期货', '期权', '外汇', '加密', '量化',
  ],
  injectTarget: 'system',
};

export class ComplianceDisclaimer {
  private config: DisclaimerConfig;
  private logger?: any;

  constructor(config: Partial<DisclaimerConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Process a request body and inject disclaimer if needed.
   */
  process(body: any): { modified: boolean; body: any } {
    if (!this.config.enabled) return { modified: false, body };

    // Check if this is a financial query
    if (this.config.financialOnly && !this.isFinancialQuery(body)) {
      return { modified: false, body };
    }

    const modified = { ...body };

    if (this.config.injectTarget === 'system') {
      if (typeof modified.system === 'string') {
        modified.system += this.config.disclaimer;
      } else if (Array.isArray(modified.system)) {
        const lastItem = modified.system[modified.system.length - 1];
        if (lastItem?.type === 'text') {
          modified.system[modified.system.length - 1] = {
            ...lastItem,
            text: lastItem.text + this.config.disclaimer,
          };
        } else {
          modified.system.push({ type: 'text', text: this.config.disclaimer });
        }
      } else {
        modified.system = this.config.disclaimer;
      }
    } else if (this.config.injectTarget === 'user_message') {
      // Append to last user message
      const messages = modified.messages || [];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          if (typeof messages[i].content === 'string') {
            messages[i] = { ...messages[i], content: messages[i].content + this.config.disclaimer };
          }
          break;
        }
      }
    }

    return { modified: true, body: modified };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<DisclaimerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private isFinancialQuery(body: any): boolean {
    const text = this.extractText(body).toLowerCase();
    return this.config.financialKeywords.some(kw => text.includes(kw.toLowerCase()));
  }

  private extractText(body: any): string {
    const parts: string[] = [];

    if (typeof body.system === 'string') {
      parts.push(body.system);
    } else if (Array.isArray(body.system)) {
      for (const item of body.system) {
        if (item.type === 'text') parts.push(item.text || '');
      }
    }

    const messages = body.messages || [];
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        parts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c.type === 'text') parts.push(c.text || '');
        }
      }
    }

    return parts.join(' ');
  }
}

let globalDisclaimer: ComplianceDisclaimer | null = null;

export function getComplianceDisclaimer(config?: Partial<DisclaimerConfig>, logger?: any): ComplianceDisclaimer {
  if (!globalDisclaimer) {
    globalDisclaimer = new ComplianceDisclaimer(config, logger);
  } else if (config) {
    globalDisclaimer.updateConfig(config);
  }
  return globalDisclaimer;
}
