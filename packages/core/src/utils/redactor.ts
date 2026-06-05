/**
 * Redactor - 敏感信息脱敏
 *
 * Detects and masks sensitive information in request/response payloads:
 * - API keys, tokens, secrets
 * - Credit card numbers
 * - Email addresses
 * - IP addresses
 * - Custom patterns (configurable)
 *
 * Design: Zero external dependencies. Regex-based pattern matching.
 * Applied to logs and context capture, NOT to actual LLM requests.
 */

export interface RedactorConfig {
  enabled: boolean;
  /** Mask API keys (default: true) */
  maskApiKeys: boolean;
  /** Mask email addresses (default: false) */
  maskEmails: boolean;
  /** Mask IP addresses (default: false) */
  maskIps: boolean;
  /** Mask credit card numbers (default: true) */
  maskCreditCards: boolean;
  /** Mask Chinese mobile phone numbers */
  maskChinesePhones: boolean;
  /** Mask Chinese ID card numbers */
  maskChineseIds: boolean;
  /** Mask Chinese stock codes */
  maskStockCodes: boolean;
  /** Mask bank card numbers */
  maskBankCards: boolean;
  /** Custom patterns to mask */
  customPatterns: Array<{ name: string; pattern: string; replacement: string }>;
  /** Fields to always redact in JSON objects */
  sensitiveFields: string[];
}

const DEFAULT_CONFIG: RedactorConfig = {
  enabled: true,
  maskApiKeys: true,
  maskEmails: false,
  maskIps: false,
  maskCreditCards: true,
  maskChinesePhones: true,
  maskChineseIds: true,
  maskStockCodes: false,
  maskBankCards: true,
  customPatterns: [],
  sensitiveFields: [
    'api_key', 'apiKey', 'api-key', 'authorization', 'Authorization',
    'password', 'secret', 'token', 'access_token', 'refresh_token',
    'x-api-key', 'x-auth-token', 'private_key', 'secret_key',
    'id_card', 'idCard', 'id_number', 'phone', 'mobile', 'cellphone',
    'bank_card', 'bankCard', 'account_number',
  ],
};

/**
 * Redact sensitive information from a string.
 */
export function redactString(input: string, config: Partial<RedactorConfig> = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.enabled) return input;

  let result = input;

  // API keys (common patterns: sk-..., key-..., bearer ...)
  if (cfg.maskApiKeys) {
    result = result.replace(/\b(sk-[a-zA-Z0-9]{20,})\b/g, 'sk-****REDACTED****');
    result = result.replace(/\b(key-[a-zA-Z0-9]{20,})\b/g, 'key-****REDACTED****');
    result = result.replace(/\b(ghp_[a-zA-Z0-9]{36})\b/g, 'ghp_****REDACTED****');
    result = result.replace(/\b(gsk_[a-zA-Z0-9]{40,})\b/g, 'gsk_****REDACTED****');
    // Generic long alphanumeric strings that look like keys
    result = result.replace(/(?<![a-zA-Z0-9])[a-zA-Z0-9]{40,}(?![a-zA-Z0-9])/g, (match) => {
      // Don't redact common non-sensitive strings
      if (match.length < 40) return match;
      return match.slice(0, 6) + '****REDACTED****';
    });
  }

  // Credit card numbers
  if (cfg.maskCreditCards) {
    result = result.replace(/\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g, '****-****-****-****');
  }

  // Email addresses
  if (cfg.maskEmails) {
    result = result.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '****@****.***');
  }

  // IP addresses (v4)
  if (cfg.maskIps) {
    result = result.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '***.***.***.***');
  }

  // Chinese mobile phone numbers (1xx-xxxx-xxxx, with or without separators)
  if (cfg.maskChinesePhones) {
    result = result.replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, (match) => match.slice(0, 3) + '****' + match.slice(7));
    // With separators: 138-1234-5678 or 138 1234 5678
    result = result.replace(/(?<!\d)1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g, (match) => match.slice(0, 3) + '****' + match.slice(-4));
  }

  // Chinese ID card numbers (18 digits, last may be X)
  if (cfg.maskChineseIds) {
    result = result.replace(/(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g,
      (match) => match.slice(0, 6) + '********' + match.slice(-4));
  }

  // Chinese stock codes (6 digits with common prefixes)
  if (cfg.maskStockCodes) {
    // SH: 600xxx, 601xxx, 603xxx, 605xxx, 688xxx; SZ: 000xxx, 001xxx, 002xxx, 003xxx, 300xxx, 301xxx
    result = result.replace(/\b(6[08]\d{4}|[03]\d{5})\b/g, (match) => match.slice(0, 2) + '****');
  }

  // Bank card numbers (16-19 digits, common patterns)
  if (cfg.maskBankCards) {
    result = result.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}(?:[-\s]?\d{1,3})?\b/g, (match) => {
      const digits = match.replace(/[-\s]/g, '');
      if (digits.length >= 16 && digits.length <= 19) {
        return '****-****-****-' + digits.slice(-4);
      }
      return match;
    });
  }

  // Custom patterns
  for (const custom of cfg.customPatterns) {
    try {
      const regex = new RegExp(custom.pattern, 'gi');
      result = result.replace(regex, custom.replacement);
    } catch {
      // Skip invalid patterns
    }
  }

  return result;
}

/**
 * Redact sensitive fields from a JSON object (recursive).
 * Creates a new object, does not mutate the original.
 */
export function redactObject<T>(obj: T, config: Partial<RedactorConfig> = {}): T {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.enabled || !obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, cfg)) as T;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    const lowerKey = key.toLowerCase();

    // Check if field name is sensitive
    const isSensitiveField = cfg.sensitiveFields.some(
      (field) => lowerKey === field.toLowerCase() || lowerKey.includes(field.toLowerCase())
    );

    if (isSensitiveField && typeof value === 'string') {
      result[key] = maskValue(value);
    } else if (typeof value === 'string') {
      result[key] = redactString(value, cfg);
    } else if (value && typeof value === 'object') {
      result[key] = redactObject(value, cfg);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Check if a string contains sensitive information.
 */
export function containsSensitiveInfo(input: string, config: Partial<RedactorConfig> = {}): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.enabled) return false;

  if (cfg.maskApiKeys) {
    if (/\bsk-[a-zA-Z0-9]{20,}\b/.test(input)) return true;
    if (/\bkey-[a-zA-Z0-9]{20,}\b/.test(input)) return true;
  }

  if (cfg.maskCreditCards) {
    if (/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/.test(input)) return true;
  }

  if (cfg.maskChinesePhones) {
    if (/1[3-9]\d{9}/.test(input)) return true;
  }

  if (cfg.maskChineseIds) {
    if (/[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/.test(input)) return true;
  }

  return false;
}

/**
 * Mask a value string (keep first 4 and last 4 chars).
 */
function maskValue(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}
