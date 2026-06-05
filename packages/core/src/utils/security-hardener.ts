import { createHash } from 'crypto';

export interface SecurityConfig {
  redactPatterns: RegExp[];
  auditLogPath: string;
  auditEnabled: boolean;
  maxAuditLogSizeMb: number;
  sensitiveHeaders: string[];
  sensitiveBodyFields: string[];
}

interface AuditEntry {
  timestamp: string;
  traceId: string;
  sessionId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cacheHit: boolean;
  cacheLevel?: string;
  success: boolean;
  errorCode?: string;
  estimatedCost: number;
  redactedAuth: string;
  sourceIp: string;
}

const DEFAULT_CONFIG: SecurityConfig = {
  redactPatterns: [
    /sk-[a-zA-Z0-9]{20,}/g,
    /Bearer\s+[a-zA-Z0-9\-_.~!#$&'()*+,/:;=?@[\]]+/g,
    /api[_-]?key[=:]\s*['"]?[a-zA-Z0-9\-_.]{20,}['"]?/gi,
    /token[=:]\s*['"]?[a-zA-Z0-9\-_.]{20,}['"]?/gi,
    /secret[=:]\s*['"]?[a-zA-Z0-9\-_.]{20,}['"]?/gi,
    /password[=:]\s*['"]?[a-zA-Z0-9\-_.@!#$%^&*]{8,}['"]?/gi,
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
    /ghp_[a-zA-Z0-9]{36,}/g,
    /github_pat_[a-zA-Z0-9_]{70,}/g,
  ],
  auditLogPath: '',
  auditEnabled: true,
  maxAuditLogSizeMb: 100,
  sensitiveHeaders: ['authorization', 'x-api-key', 'api-key', 'cookie', 'set-cookie'],
  sensitiveBodyFields: ['api_key', 'apiKey', 'secret', 'password', 'token'],
};

export class SecurityHardener {
  private config: SecurityConfig;
  private logger?: any;
  private auditBuffer: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<SecurityConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;

    if (this.config.auditEnabled) {
      this.flushTimer = setInterval(() => this.flushAuditLog(), 5000);
    }
  }

  redactHeaders(headers: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (this.config.sensitiveHeaders.includes(key.toLowerCase())) {
        redacted[key] = this.redactSecret(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  redactBody(body: any): any {
    if (typeof body === 'string') {
      return this.redactString(body);
    }
    if (typeof body === 'object' && body !== null) {
      const redacted = Array.isArray(body) ? [...body] : { ...body };
      for (const field of this.config.sensitiveBodyFields) {
        if (redacted[field]) {
          redacted[field] = this.redactSecret(String(redacted[field]));
        }
      }
      return redacted;
    }
    return body;
  }

  redactString(text: string): string {
    let result = text;
    for (const pattern of this.config.redactPatterns) {
      result = result.replace(pattern, (match) => this.redactSecret(match));
    }
    return result;
  }

  redactSecret(value: string): string {
    if (!value || value.length < 10) {
      return '***';
    }
    const prefix = value.substring(0, 6);
    const suffix = value.substring(value.length - 4);
    return `${prefix}...${suffix}`;
  }

  containsSensitiveData(text: string): boolean {
    for (const pattern of this.config.sensitivePatterns || []) {
      if (pattern.test(text)) return true;
    }

    for (const pattern of this.config.redactPatterns) {
      const clone = new RegExp(pattern.source, pattern.flags);
      if (clone.test(text)) return true;
    }
    return false;
  }

  addAuditEntry(entry: Omit<AuditEntry, 'timestamp'>): void {
    if (!this.config.auditEnabled) return;

    this.auditBuffer.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    if (this.auditBuffer.length >= 100) {
      this.flushAuditLog();
    }
  }

  async flushAuditLog(): Promise<void> {
    if (this.auditBuffer.length === 0) return;

    const entries = [...this.auditBuffer];
    this.auditBuffer = [];

    if (this.logger) {
      for (const entry of entries) {
        this.logger.info({
          msg: 'AUDIT',
          ...entry,
        });
      }
    }
  }

  scanForLeaks(content: string, context: string): { hasLeak: boolean; findings: string[] } {
    const findings: string[] = [];

    for (const pattern of [
      /sk-[a-zA-Z0-9]{20,}/,
      /Bearer\s+[a-zA-Z0-9\-_.]{20,}/,
      /api[_-]?key[=:'"]+[a-zA-Z0-9]{20,}/i,
      /ghp_[a-zA-Z0-9]{36,}/,
      /github_pat_[a-zA-Z0-9_]{70,}/,
      /-----BEGIN.*PRIVATE KEY-----/,
    ]) {
      if (pattern.test(content)) {
        findings.push(`Potential leak detected by pattern ${pattern.source} in ${context}`);
      }
    }

    return {
      hasLeak: findings.length > 0,
      findings,
    };
  }

  generateTraceId(): string {
    const timestamp = Date.now().toString(36);
    const random = createHash('sha256')
      .update(`${timestamp}-${Math.random()}-${process.pid}`)
      .digest('hex')
      .substring(0, 12);
    return `trace-${timestamp}-${random}`;
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushAuditLog();
  }
}

let _hardener: SecurityHardener | null = null;

export function getSecurityHardener(config?: Partial<SecurityConfig>, logger?: any): SecurityHardener {
  if (!_hardener) {
    _hardener = new SecurityHardener(config, logger);
  }
  return _hardener;
}
