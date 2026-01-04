/**
 * Configuration merge strategies
 */

import { MergeStrategy, ProviderConfig, RouterConfig, TransformerConfig } from './types';

/**
 * Merge Provider configuration
 * Overwrite if provider exists, otherwise add
 */
function mergeProviders(
  existing: ProviderConfig[],
  incoming: ProviderConfig[]
): ProviderConfig[] {
  const result = [...existing];
  const existingNames = new Map(existing.map(p => [p.name, result.findIndex(x => x.name === p.name)]));

  for (const provider of incoming) {
    const existingIndex = existingNames.get(provider.name);
    if (existingIndex !== undefined) {
      // Provider exists, overwrite directly
      result[existingIndex] = provider;
    } else {
      // New provider, add directly
      result.push(provider);
    }
  }

  return result;
}

/**
 * Merge Router configuration
 */
async function mergeRouter(
  existing: RouterConfig,
  incoming: RouterConfig,
  strategy: MergeStrategy,
  onRouterConflict?: (key: string, existingValue: any, newValue: any) => Promise<boolean>
): Promise<RouterConfig> {
  const result = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null) {
      continue;
    }

    const existingValue = result[key];

    if (existingValue === undefined || existingValue === null) {
      // No such routing rule in existing config, add directly
      result[key] = value;
    } else {
      // Conflict exists
      if (strategy === MergeStrategy.ASK && onRouterConflict) {
        const shouldOverwrite = await onRouterConflict(key, existingValue, value);
        if (shouldOverwrite) {
          result[key] = value;
        }
      } else if (strategy === MergeStrategy.OVERWRITE) {
        result[key] = value;
      } else if (strategy === MergeStrategy.MERGE) {
        // For Router, merge strategy equals skip, keep existing value
        // Or can ask user
      }
      // skip strategy: keep existing value, do nothing
    }
  }

  return result;
}

/**
 * Merge Transformer configuration
 */
async function mergeTransformers(
  existing: TransformerConfig[],
  incoming: TransformerConfig[],
  strategy: MergeStrategy,
  onTransformerConflict?: (transformerPath: string) => Promise<'keep' | 'overwrite' | 'skip'>
): Promise<TransformerConfig[]> {
  if (!existing || existing.length === 0) {
    return incoming;
  }

  if (!incoming || incoming.length === 0) {
    return existing;
  }

  // Transformer merge logic: match by path
  const result = [...existing];
  const existingPaths = new Set(existing.map(t => t.path));

  for (const transformer of incoming) {
    if (!transformer.path) {
      // Transformer without path, add directly
      result.push(transformer);
      continue;
    }

    if (existingPaths.has(transformer.path)) {
      // Transformer with same path already exists
      if (strategy === MergeStrategy.ASK && onTransformerConflict) {
        const action = await onTransformerConflict(transformer.path);
        if (action === 'overwrite') {
          const index = result.findIndex(t => t.path === transformer.path);
          result[index] = transformer;
        }
        // keep and skip do nothing
      } else if (strategy === MergeStrategy.OVERWRITE) {
        const index = result.findIndex(t => t.path === transformer.path);
        result[index] = transformer;
      }
      // merge and skip strategies: keep existing
    } else {
      // New transformer, add directly
      result.push(transformer);
    }
  }

  return result;
}

/**
 * Merge other top-level configurations
 */
async function mergeOtherConfig(
  existing: any,
  incoming: any,
  strategy: MergeStrategy,
  onConfigConflict?: (key: string) => Promise<boolean>,
  excludeKeys: string[] = ['Providers', 'Router', 'transformers']
): Promise<any> {
  const result = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    if (excludeKeys.includes(key)) {
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    const existingValue = result[key];

    if (existingValue === undefined || existingValue === null) {
      // No such field in existing config, add directly
      result[key] = value;
    } else {
      // Conflict exists
      if (strategy === MergeStrategy.ASK && onConfigConflict) {
        const shouldOverwrite = await onConfigConflict(key);
        if (shouldOverwrite) {
          result[key] = value;
        }
      } else if (strategy === MergeStrategy.OVERWRITE) {
        result[key] = value;
      }
      // merge and skip strategies: keep existing值
    }
  }

  return result;
}

/**
 * Merge interaction callback interface
 */
export interface MergeCallbacks {
  onRouterConflict?: (key: string, existingValue: any, newValue: any) => Promise<boolean>;
  onTransformerConflict?: (transformerPath: string) => Promise<'keep' | 'overwrite' | 'skip'>;
  onConfigConflict?: (key: string) => Promise<boolean>;
}

/**
 * Main configuration merge function
 * @param baseConfig Base configuration (existing configuration)
 * @param presetConfig Preset configuration
 * @param strategy Merge strategy
 * @param callbacks Interactive callback functions
 * @returns Merged configuration
 */
export async function mergeConfig(
  baseConfig: any,
  presetConfig: any,
  strategy: MergeStrategy = MergeStrategy.ASK,
  callbacks?: MergeCallbacks
): Promise<any> {
  const result = { ...baseConfig };

  // Merge Providers
  if (presetConfig.Providers) {
    result.Providers = mergeProviders(
      result.Providers || [],
      presetConfig.Providers
    );
  }

  // Merge Router
  if (presetConfig.Router) {
    result.Router = await mergeRouter(
      result.Router || {},
      presetConfig.Router,
      strategy,
      callbacks?.onRouterConflict
    );
  }

  // Merge transformers
  if (presetConfig.transformers) {
    result.transformers = await mergeTransformers(
      result.transformers || [],
      presetConfig.transformers,
      strategy,
      callbacks?.onTransformerConflict
    );
  }

  // Merge other configurations
  const otherConfig = await mergeOtherConfig(
    result,
    presetConfig,
    strategy,
    callbacks?.onConfigConflict
  );

  return otherConfig;
}
