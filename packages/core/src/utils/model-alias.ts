import { ConfigService } from '../services/config';

/**
 * Model alias resolution system.
 * Reads the ModelMapping config from the ConfigService and
 * resolves model names (e.g. "claude-opus-4" → "deepseek,deepseek-v4-pro").
 *
 * The ModelMapping config section is a simple key→value map:
 * {
 *   "claude-opus-4-20250514": "deepseek,deepseek-v4-pro",
 *   "opus": "deepseek,deepseek-v4-pro",
 *   ...
 * }
 *
 * This lets users remap any model name to a provider,model pair.
 * The config is 100% data-driven; adding a new model mapping only requires
 * editing config.json, *not* code changes.
 */

/**
 * Attempt to resolve a model name through the ModelMapping.
 * Returns the mapped "provider,model" string if a mapping exists,
 * or null if no mapping is found.
 *
 * Resolution strategy:
 * 1. Exact match (e.g. "claude-opus-4-20250514")
 * 2. Progressive prefix stripping (e.g. "claude-opus-4-20250514" → "claude-opus-4")
 * 3. Case-insensitive fallback
 */
export function resolveModelAlias(model: string, configService: ConfigService): string | null {
  const mapping = configService.get<Record<string, string>>('ModelMapping') || {};

  // 1. Exact match
  if (mapping[model]) {
    return mapping[model];
  }

  // 2. Try stripping version date suffixes progressively
  // e.g. "claude-opus-4-20250514" → try "claude-opus-4-20250514", "claude-opus-4-202505", "claude-opus-4-20250", etc.
  // More practically: split on '-' and try progressively shorter prefixes
  const parts = model.split('-');
  if (parts.length > 2) {
    for (let i = parts.length - 1; i > 1; i--) {
      const prefix = parts.slice(0, i).join('-');
      if (mapping[prefix]) {
        return mapping[prefix];
      }
    }
  }

  // 3. Case-insensitive lookup
  const lowerModel = model.toLowerCase();
  for (const [key, value] of Object.entries(mapping)) {
    if (key.toLowerCase() === lowerModel) {
      return value;
    }
  }

  return null;
}