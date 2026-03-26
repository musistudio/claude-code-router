import {
  RouteValue,
  RoutePoolConfig,
  RouteHealthConfig,
  PoolState,
  TargetState,
  isPoolConfig
} from './types'

/**
 * Default health configuration values
 * Applied when not specified in the pool configuration
 */
const DEFAULT_HEALTH_CONFIG: Required<RouteHealthConfig> = {
  cooldown_ms: 60000,        // 1 minute cooldown
  recovery_interval_ms: 30000, // 30 seconds between recovery steps
  recovery_step: 1           // Weight increment per step
}

/**
 * Validate provider,model string format
 * Ensures the format is "provider,model"
 */
function validateModelString(model: string): void {
  if (!model || typeof model !== 'string') {
    throw new Error(`Invalid model: expected string, got ${typeof model}`)
  }
  const parts = model.split(',')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid model format "${model}": expected "provider,model"`
    )
  }
}

/**
 * Validate RoutePoolConfig at startup
 * Throws clear error messages for invalid configurations
 */
export function validatePoolConfig(pool: RoutePoolConfig): void {
  // Check strategy
  if (!pool.strategy) {
    throw new Error('Pool missing required field: strategy')
  }
  if (pool.strategy !== 'weighted_round_robin') {
    throw new Error(`Unsupported strategy: ${pool.strategy}`)
  }

  // Check targets
  if (!Array.isArray(pool.targets)) {
    throw new Error('Pool targets must be an array')
  }
  if (pool.targets.length === 0) {
    throw new Error('Pool must have at least one target')
  }

  // Validate each target
  const seen = new Set<string>()
  let hasPositiveWeight = false

  for (const target of pool.targets) {
    // Check model
    if (!target.model) {
      throw new Error('Target missing required field: model')
    }
    validateModelString(target.model)

    // Check weight
    if (typeof target.weight !== 'number' || !Number.isInteger(target.weight)) {
      throw new Error(
        `Target ${target.model}: weight must be an integer, got ${target.weight}`
      )
    }
    if (target.weight < 0) {
      throw new Error(
        `Target ${target.model}: weight must be >= 0, got ${target.weight}`
      )
    }

    // Check duplicate
    if (seen.has(target.model)) {
      throw new Error(`Duplicate model in pool: ${target.model}`)
    }
    seen.add(target.model)

    // Track if any weight > 0
    if (target.weight > 0) {
      hasPositiveWeight = true
    }
  }

  if (!hasPositiveWeight) {
    throw new Error('Pool must have at least one target with weight > 0')
  }

  // Validate health config if present
  if (pool.health) {
    const h = pool.health
    if (h.cooldown_ms !== undefined && h.cooldown_ms < 0) {
      throw new Error(`cooldown_ms must be >= 0, got ${h.cooldown_ms}`)
    }
    if (h.recovery_interval_ms !== undefined && h.recovery_interval_ms < 0) {
      throw new Error(
        `recovery_interval_ms must be >= 0, got ${h.recovery_interval_ms}`
      )
    }
    if (h.recovery_step !== undefined && h.recovery_step < 0) {
      throw new Error(`recovery_step must be >= 0, got ${h.recovery_step}`)
    }
  }
}

/**
 * Parse RouteValue into PoolState or legacy string
 * Returns PoolState if pool config, string if legacy format
 */
export function parseRouteValue(
  scenario: string,
  value: RouteValue
): PoolState | string {
  // Legacy: string route
  if (typeof value === 'string') {
    validateModelString(value)
    return value
  }

  // New: pool config
  if (isPoolConfig(value)) {
    validatePoolConfig(value)

    const health = {
      ...DEFAULT_HEALTH_CONFIG,
      ...(value.health || {})
    }

    const targets = new Map<string, TargetState>(
      value.targets.map(t => [
        t.model,
        {
          model: t.model,
          defaultWeight: t.weight,
          effectiveWeight: t.weight,
          suppressedUntil: undefined,
          lastFailureAt: undefined,
          lastRecoveryStartedAt: undefined,
          consecutiveFailures: 0,
          currentWeight: 0  // WRR accumulator starts at 0
        }
      ])
    )

    return {
      scenario,
      targets,
      strategy: 'weighted_round_robin',
      health
    }
  }

  throw new Error(
    `Invalid route value for ${scenario}: ` +
    `expected string or pool object, got ${typeof value}`
  )
}

/**
 * Parse all routes from router configuration
 * Returns map of scenario -> (PoolState | string)
 */
export function parseAllRoutes(
  routerConfig: Record<string, RouteValue>
): Map<string, PoolState | string> {
  const result = new Map<string, PoolState | string>()

  for (const [scenario, value] of Object.entries(routerConfig)) {
    // Skip non-route fields (numbers, booleans, etc.)
    // Route values must be strings or pool config objects
    if (typeof value !== 'string' && typeof value !== 'object') {
      continue
    }

    try {
      result.set(scenario, parseRouteValue(scenario, value))
    } catch (err: any) {
      throw new Error(
        `Invalid route config for scenario "${scenario}": ${err.message}`
      )
    }
  }

  return result
}