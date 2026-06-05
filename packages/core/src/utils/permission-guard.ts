/**
 * Permission Guard - 操作权限校验
 *
 * Blocks dangerous operations in LLM outputs:
 * - Financial operations (order placement, position close)
 * - System commands (rm -rf, DROP TABLE, etc.)
 * - Data exfiltration patterns
 * - Custom blocklist patterns
 *
 * Design: Zero external dependencies. Regex-based pattern matching.
 * Applied to both request prompts and response outputs.
 */

export interface PermissionGuardConfig {
  enabled: boolean;
  /** Block financial trading operations */
  blockTrading: boolean;
  /** Block system destructive commands */
  blockSystemDestructive: boolean;
  /** Block data exfiltration patterns */
  blockDataExfiltration: boolean;
  /** Block SQL injection patterns */
  blockSqlInjection: boolean;
  /** Custom block patterns */
  customBlockPatterns: Array<{ name: string; pattern: string; severity: 'warn' | 'block' }>;
  /** Custom allow patterns (override blocks) */
  customAllowPatterns: string[];
  /** Log blocked attempts */
  logBlocked: boolean;
}

const DEFAULT_CONFIG: PermissionGuardConfig = {
  enabled: true,
  blockTrading: true,
  blockSystemDestructive: true,
  blockDataExfiltration: true,
  blockSqlInjection: true,
  customBlockPatterns: [],
  customAllowPatterns: [],
  logBlocked: true,
};

export interface PermissionCheckResult {
  allowed: boolean;
  violations: Array<{
    pattern: string;
    severity: 'warn' | 'block';
    matched: string;
    position: number;
  }>;
  sanitized?: string;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

const TRADING_PATTERNS = [
  { pattern: /\b(place|submit|execute|send)\s+(an?\s+)?(order|trade)/i, name: 'order_placement' },
  { pattern: /\b(buy|sell|short|long)\s+\d+/i, name: 'trade_execution' },
  { pattern: /\b(close|liquidate|exit)\s+(all\s+)?(position|trade)/i, name: 'position_close' },
  { pattern: /\b(market|limit|stop)\s+(order|buy|sell)/i, name: 'order_type' },
  { pattern: /\b(leverage|margin)\s+(trade|position)/i, name: 'leverage_trade' },
  { pattern: /\bapi[_-]?key.*\b(trade|order|execute)/i, name: 'api_trading' },
];

const SYSTEM_DESTRUCTIVE_PATTERNS = [
  { pattern: /\brm\s+-rf?\s+[\/~]/i, name: 'rm_rf' },
  { pattern: /\b(rmdir|rd)\s+\/[sq]/i, name: 'rmdir_force' },
  { pattern: /\bformat\s+[a-z]:/i, name: 'format_drive' },
  { pattern: /\bdel\s+\/[fq]/i, name: 'del_force' },
  { pattern: /\bmkfs\b/i, name: 'mkfs' },
  { pattern: /\bdd\s+if=.*of=\/dev/i, name: 'dd_device' },
  { pattern: /\bchmod\s+777\s+\//i, name: 'chmod_root' },
  { pattern: /\b(shutdown|reboot|halt)\s*(-[fh])?/i, name: 'shutdown' },
  { pattern: /\bkill\s+-9\s+1\b/i, name: 'kill_init' },
  { pattern: /\b:\(\)\{\s*:\|:&\s*\};:/i, name: 'fork_bomb' },
];

const DATA_EXFILTRATION_PATTERNS = [
  { pattern: /\b(curl|wget|fetch)\s+.*\b(upload|post|send)\b/i, name: 'http_exfil' },
  { pattern: /\b(nc|netcat|ncat)\s+-[elv]/i, name: 'netcat_exfil' },
  { pattern: /\bssh\s+.*@\w+\..*\s+.*>/i, name: 'ssh_exfil' },
  { pattern: /\bscp\s+.*@\w+:/i, name: 'scp_exfil' },
  { pattern: /\b(base64|xxd)\s+.*\|.*\b(curl|wget)\b/i, name: 'encoded_exfil' },
  { pattern: /\bdns\s+tunnel/i, name: 'dns_tunnel' },
];

const SQL_INJECTION_PATTERNS = [
  { pattern: /\b(DROP|DELETE|TRUNCATE)\s+TABLE/i, name: 'sql_drop' },
  { pattern: /\bUNION\s+(ALL\s+)?SELECT/i, name: 'sql_union' },
  { pattern: /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER)/i, name: 'sql_multi_statement' },
  { pattern: /\bEXEC(\s|\()+/i, name: 'sql_exec' },
  { pattern: /\bxp_cmdshell/i, name: 'sql_cmdshell' },
];

export class PermissionGuard {
  private config: PermissionGuardConfig;
  private logger?: any;

  constructor(config: Partial<PermissionGuardConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Check if text contains dangerous patterns.
   */
  check(text: string): PermissionCheckResult {
    if (!this.config.enabled || !text) {
      return { allowed: true, violations: [] };
    }

    // Normalize whitespace to prevent multi-line bypass attacks
    const normalizedText = text.replace(/\s+/g, ' ');
    const violations: PermissionCheckResult['violations'] = [];

    // Check trading patterns
    if (this.config.blockTrading) {
      for (const { pattern, name } of TRADING_PATTERNS) {
        const match = pattern.exec(normalizedText);
        if (match) {
          violations.push({
            pattern: name,
            severity: 'block',
            matched: match[0],
            position: match.index,
          });
        }
      }
    }

    // Check system destructive patterns
    if (this.config.blockSystemDestructive) {
      for (const { pattern, name } of SYSTEM_DESTRUCTIVE_PATTERNS) {
        const match = pattern.exec(normalizedText);
        if (match) {
          violations.push({
            pattern: name,
            severity: 'block',
            matched: match[0],
            position: match.index,
          });
        }
      }
    }

    // Check data exfiltration patterns
    if (this.config.blockDataExfiltration) {
      for (const { pattern, name } of DATA_EXFILTRATION_PATTERNS) {
        const match = pattern.exec(normalizedText);
        if (match) {
          violations.push({
            pattern: name,
            severity: 'warn',
            matched: match[0],
            position: match.index,
          });
        }
      }
    }

    // Check SQL injection patterns
    if (this.config.blockSqlInjection) {
      for (const { pattern, name } of SQL_INJECTION_PATTERNS) {
        const match = pattern.exec(normalizedText);
        if (match) {
          violations.push({
            pattern: name,
            severity: 'block',
            matched: match[0],
            position: match.index,
          });
        }
      }
    }

    // Check custom patterns
    for (const { pattern, name, severity } of this.config.customBlockPatterns) {
      try {
        const regex = new RegExp(pattern, 'gi');
        const match = regex.exec(normalizedText);
        if (match) {
          // Check if allowed by custom allow patterns
          const isAllowed = this.config.customAllowPatterns.some((allowPattern) => {
            try {
              return new RegExp(allowPattern, 'gi').test(match[0]);
            } catch {
              return false;
            }
          });

          if (!isAllowed) {
            violations.push({
              pattern: name,
              severity,
              matched: match[0],
              position: match.index,
            });
          }
        }
      } catch {
        // Skip invalid patterns
      }
    }

    const hasBlock = violations.some((v) => v.severity === 'block');

    if (hasBlock && this.config.logBlocked) {
      this.logger?.warn(`Permission guard BLOCKED: ${violations.map((v) => v.pattern).join(', ')}`);
    }

    return {
      allowed: !hasBlock,
      violations,
    };
  }

  /**
   * Sanitize text by replacing dangerous patterns.
   */
  sanitize(text: string): string {
    if (!this.config.enabled) return text;

    let sanitized = text;

    // Replace matched patterns with [BLOCKED]
    const allPatterns = [
      ...(this.config.blockTrading ? TRADING_PATTERNS : []),
      ...(this.config.blockSystemDestructive ? SYSTEM_DESTRUCTIVE_PATTERNS : []),
      ...(this.config.blockDataExfiltration ? DATA_EXFILTRATION_PATTERNS : []),
      ...(this.config.blockSqlInjection ? SQL_INJECTION_PATTERNS : []),
    ];

    for (const { pattern } of allPatterns) {
      sanitized = sanitized.replace(pattern, '[BLOCKED]');
    }

    return sanitized;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<PermissionGuardConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let globalGuard: PermissionGuard | null = null;

export function getPermissionGuard(config?: Partial<PermissionGuardConfig>, logger?: any): PermissionGuard {
  if (!globalGuard) {
    globalGuard = new PermissionGuard(config, logger);
  } else if (config) {
    globalGuard.updateConfig(config);
  }
  return globalGuard;
}
