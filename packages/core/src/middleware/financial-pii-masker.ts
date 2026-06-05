export interface FinancialPIIMaskerConfig {
  enabled: boolean;
  patterns?: string[];
}

interface MaskPattern {
  name: string;
  regex: RegExp;
  mask: (match: string) => string;
}

interface MaskResult {
  maskedText: string;
  maskMap: Map<string, string>;
}

const ALL_PATTERN_NAMES = [
  "chinese_phone",
  "chinese_id",
  "bank_card",
  "chinese_name",
  "stock_account",
  "api_key",
  "bearer_token",
];

export class FinancialPIIMasker {
  private config: FinancialPIIMaskerConfig;
  private patterns: MaskPattern[];
  private stats = { masked: 0, itemsMasked: 0 };

  constructor(config: FinancialPIIMaskerConfig) {
    this.config = config;
    const enabledPatterns = config.patterns ?? ALL_PATTERN_NAMES;

    const allPatterns: MaskPattern[] = [
      {
        name: "chinese_phone",
        regex: /1[3-9]\d{9}/g,
        mask: (m) => m.slice(0, 3) + "****" + m.slice(-4),
      },
      {
        name: "chinese_id",
        regex: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
        mask: (m) => m.slice(0, 3) + "***********" + m.slice(-4),
      },
      {
        name: "bank_card",
        regex: /\d{16,19}/g,
        mask: (m) => "**** **** **** " + m.slice(-4),
      },
      {
        name: "chinese_name",
        regex: /[^\x00-\xff]{2,3}(?:先生|女士|总)/g,
        mask: (m) => m[0] + "**" + m.slice(-1),
      },
      {
        name: "stock_account",
        regex: /\d{6,12}(?:账户|账号|资金)/g,
        mask: (m) => "******" + m.slice(-2),
      },
      {
        name: "api_key",
        regex: /sk-[a-zA-Z0-9]{20,}/g,
        mask: (m) => m.slice(0, 5) + "****" + "****" + m.slice(-4),
      },
      {
        name: "bearer_token",
        regex: /Bearer\s+\S+/gi,
        mask: (m) => "Bearer ****",
      },
    ];

    this.patterns = allPatterns.filter((p) => enabledPatterns.includes(p.name));
  }

  mask(text: string): MaskResult {
    if (!this.config.enabled) {
      return { maskedText: text, maskMap: new Map() };
    }

    let maskedText = text;
    const maskMap = new Map<string, string>();
    const placeholderPool: string[] = [];

    for (const pattern of this.patterns) {
      maskedText = maskedText.replace(pattern.regex, (match) => {
        const masked = pattern.mask(match);
        maskMap.set(masked, match);
        this.stats.itemsMasked++;
        return masked;
      });
    }

    if (maskedText !== text) {
      this.stats.masked++;
    }

    return { maskedText, maskMap };
  }

  maskBody(body: any): { body: any; maskMap: Map<string, string> } {
    if (!this.config.enabled || !body) {
      return { body, maskMap: new Map() };
    }

    const globalMaskMap = new Map<string, string>();
    const cloned = JSON.parse(JSON.stringify(body));

    if (typeof cloned.system === "string") {
      const result = this.mask(cloned.system);
      cloned.system = result.maskedText;
      for (const [k, v] of result.maskMap) globalMaskMap.set(k, v);
    }

    if (Array.isArray(cloned.messages)) {
      for (const msg of cloned.messages) {
        if (typeof msg.content === "string") {
          const result = this.mask(msg.content);
          msg.content = result.maskedText;
          for (const [k, v] of result.maskMap) globalMaskMap.set(k, v);
        }
      }
    }

    return { body: cloned, maskMap: globalMaskMap };
  }

  unmask(maskedText: string, maskMap: Map<string, string>): string {
    let result = maskedText;
    for (const [masked, original] of maskMap) {
      result = result.split(masked).join(original);
    }
    return result;
  }

  getStats() {
    return { ...this.stats, patterns: this.patterns.map((p) => p.name) };
  }
}
