import { ConfigService } from '../services/config';

/**
 * Model alias resolution system.
 * Uses builtin aliases first, then falls back to the ModelMapping config.
 *
 * Resolution order:
 * 1. BUILTIN_ALIASES (hardcoded, ships with the proxy)
 * 2. ModelMapping config (user-defined, overrides builtins on conflict)
 *
 * The ModelMapping config section is a simple key→value map:
 * {
 *   "claude-opus-4-20250514": "deepseek,deepseek-v4-pro",
 *   "opus": "deepseek,deepseek-v4-pro",
 *   ...
 * }
 */

const BUILTIN_ALIASES: Record<string, string> = {
  'opus': 'claude-opus-4-6',
  'sonnet': 'claude-sonnet-4-6',
  'haiku': 'claude-haiku-4-5-20251213',
  'grok': 'grok-3',
  'grok-mini': 'grok-3-mini',
  'kimi': 'kimi-k2.5',
};

/**
 * Attempt to resolve a model name through builtin aliases first,
 * then through the ModelMapping config.
 * Returns the mapped string if a mapping exists, or null if not found.
 *
 * Resolution strategy:
 * 1. BUILTIN_ALIASES exact match (case-insensitive)
 * 2. Config ModelMapping exact match
 * 3. Config ModelMapping progressive prefix stripping
 * 4. Config ModelMapping case-insensitive fallback
 */
export function resolveModelAlias(model: string, configService: ConfigService): string | null {
  // 0. Builtin aliases (checked first, config overrides on conflict below)
  const lowerModel = model.toLowerCase();
  const builtinMatch = BUILTIN_ALIASES[lowerModel];

  const mapping = configService.get<Record<string, string>>('ModelMapping') || {};

  // 1. Config exact match (overrides builtin)
  if (mapping[model]) {
    return mapping[model];
  }

  // 2. Config case-insensitive match (overrides builtin)
  for (const [key, value] of Object.entries(mapping)) {
    if (key.toLowerCase() === lowerModel) {
      return value;
    }
  }

  // 3. Return builtin match if no config override found
  if (builtinMatch) {
    return builtinMatch;
  }

  // 4. Try stripping version date suffixes progressively
  const parts = model.split('-');
  if (parts.length > 2) {
    for (let i = parts.length - 1; i > 1; i--) {
      const prefix = parts.slice(0, i).join('-');
      if (mapping[prefix]) {
        return mapping[prefix];
      }
    }
  }

  return null;
}