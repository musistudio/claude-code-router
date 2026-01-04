/**
 * Sensitive field identification and sanitization functionality
 */

import { SanitizeResult } from './types';

// Sensitive field pattern list
const SENSITIVE_PATTERNS = [
  'api_key', 'apikey', 'apiKey', 'APIKEY',
  'api_secret', 'apisecret', 'apiSecret',
  'secret', 'SECRET',
  'token', 'TOKEN', 'auth_token',
  'password', 'PASSWORD', 'passwd',
  'private_key', 'privateKey',
  'access_key', 'accessKey',
];

// Environment variable placeholder regex
const ENV_VAR_REGEX = /^\$\{?[A-Z_][A-Z0-9_]*\}?$/;

/**
 * Check if field name is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();
  return SENSITIVE_PATTERNS.some(pattern =>
    lowerFieldName.includes(pattern.toLowerCase())
  );
}

/**
 * Generate environment variable name
 * @param fieldType Field type (provider, transformer, global)
 * @param entityName Entity name (e.g., provider name)
 * @param fieldName Field name
 */
export function generateEnvVarName(
  fieldType: 'provider' | 'transformer' | 'global',
  entityName: string,
  fieldName: string
): string {
  // Generate uppercase environment variable name
  // e.g., DEEPSEEK_API_KEY, CUSTOM_TRANSFORMER_SECRET
  const prefix = entityName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const field = fieldName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

  // If prefix and field name are the same (e.g., API_KEY), avoid duplication
  if (prefix === field) {
    return prefix;
  }

  return `${prefix}_${field}`;
}

/**
 * Check if value is already an environment variable placeholder
 */
function isEnvPlaceholder(value: any): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return ENV_VAR_REGEX.test(value.trim());
}

/**
 * Extract variable name from environment variable placeholder
 * @param value Environment variable value (e.g., $VAR or ${VAR})
 */
function extractEnvVarName(value: string): string | null {
  const trimmed = value.trim();

  // Match ${VAR_NAME} format
  const bracedMatch = trimmed.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
  if (bracedMatch) {
    return bracedMatch[1];
  }

  // Match $VAR_NAME format
  const unbracedMatch = trimmed.match(/^\$([A-Z_][A-Z0-9_]*)$/);
  if (unbracedMatch) {
    return unbracedMatch[1];
  }

  return null;
}

/**
 * Recursively traverse object to identify and sanitize sensitive fields
 * @param config Configuration object
 * @param path Current field path
 * @param sanitizedCount Sanitized field count
 */
function sanitizeObject(
  config: any,
  path: string = '',
  sanitizedCount: number = 0
): { sanitized: any; count: number } {
  if (!config || typeof config !== 'object') {
    return { sanitized: config, count: sanitizedCount };
  }

  if (Array.isArray(config)) {
    const sanitizedArray: any[] = [];
    for (let i = 0; i < config.length; i++) {
      const result = sanitizeObject(
        config[i],
        path ? `${path}[${i}]` : `[${i}]`,
        sanitizedCount
      );
      sanitizedArray.push(result.sanitized);
      sanitizedCount = result.count;
    }
    return { sanitized: sanitizedArray, count: sanitizedCount };
  }

  const sanitizedObj: any = {};
  for (const [key, value] of Object.entries(config)) {
    const currentPath = path ? `${path}.${key}` : key;

    // Check if this is a sensitive field
    if (isSensitiveField(key) && typeof value === 'string') {
      // If value is already an environment variable, keep unchanged
      if (isEnvPlaceholder(value)) {
        sanitizedObj[key] = value;
      } else {
        // Sanitize: replace with environment variable placeholder
        // Try to infer entity name from path
        let entityName = 'CONFIG';
        const pathParts = currentPath.split('.');

        // If path contains Providers or transformers, try to extract entity name
        for (let i = 0; i < pathParts.length; i++) {
          if (pathParts[i] === 'Providers' || pathParts[i] === 'transformers') {
            // Find name field
            if (i + 1 < pathParts.length && pathParts[i + 1].match(/^\d+$/)) {
              // This is array index, find name field at same level
              const parentPath = pathParts.slice(0, i + 2).join('.');
              // Find name in current context
              const context = config;
              if (context.name) {
                entityName = context.name;
              }
            }
            break;
          }
        }

        const envVarName = generateEnvVarName('global', entityName, key);
        sanitizedObj[key] = `\${${envVarName}}`;

        sanitizedCount++;
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively process nested objects
      const result = sanitizeObject(value, currentPath, sanitizedCount);
      sanitizedObj[key] = result.sanitized;
      sanitizedCount = result.count;
    } else {
      // Keep original value
      sanitizedObj[key] = value;
    }
  }

  return { sanitized: sanitizedObj, count: sanitizedCount };
}

/**
 * Sanitize configuration object
 * @param config Original configuration
 * @returns Sanitization result
 */
export async function sanitizeConfig(config: any): Promise<SanitizeResult> {
  // Deep copy configuration to avoid modifying original object
  const configCopy = JSON.parse(JSON.stringify(config));

  const result = sanitizeObject(configCopy);

  return {
    sanitizedConfig: result.sanitized,
    sanitizedCount: result.count,
  };
}

/**
 * Fill sensitive information into configuration
 * @param config Preset configuration (containing environment variable placeholders)
 * @param inputs User input sensitive information
 * @returns Filled configuration
 */
export function fillSensitiveInputs(config: any, inputs: Record<string, string>): any {
  const configCopy = JSON.parse(JSON.stringify(config));

  function fillObject(obj: any, path: string = ''): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) =>
        fillObject(item, path ? `${path}[${index}]` : `[${index}]`)
      );
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string' && isEnvPlaceholder(value)) {
        // Check if there is user input
        const input = inputs[currentPath];
        if (input) {
          result[key] = input;
        } else {
          result[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = fillObject(value, currentPath);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  return fillObject(configCopy);
}
