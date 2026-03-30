import {
  RouteValue,
  RoutePoolConfig,
  RouteHealthConfig,
  PoolState,
  TargetState,
  isPoolConfig,
  RouteTargetInput
} from './types'

/**
 * Default health configuration values
 * Applied when not specified in the pool configuration
 */
const DEFAULT_HEALTH_CONFIG: Required<RouteHealthConfig> = {
  cooldown_ms: 120000,        // 2 minutes cooldown
  recovery_interval_ms: 60000, // 1 minute between recovery steps
  recovery_step: 1             // Weight increment per step
}

/**
 * Default weight for targets when not specified
 */
const DEFAULT_WEIGHT = 1

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
 * Normalize target input to RouteTarget with weight
 * Converts string to object with default weight
 */
function normalizeTarget(target: RouteTargetInput): { model: string; weight: number } {
  if (typeof target === 'string') {
    validateModelString(target)
    return { model: target, weight: DEFAULT_WEIGHT }
  }

  validateModelString(target.model)
  return {
    model: target.model,
    weight: target.weight ?? DEFAULT_WEIGHT
  }
}

/**
 * Validate RoutePoolConfig at startup
 * Throws clear error messages for invalid configurations
 */
export function validatePoolConfig(pool: RoutePoolConfig): void {
  // Strategy is optional, default to weighted_round_robin
  if (pool.strategy !== undefined && pool.strategy !== 'weighted_round_robin') {
    throw new Error(`Unsupported strategy: ${pool.strategy}`)
  }

  // Check targets (required for object form)
  if (!Array.isArray(pool.targets)) {
    throw new Error('Pool targets must be an array')
  }
  if (pool.targets.length === 0) {
    throw new Error('Pool must have at least one target')
  }

  // Validate and normalize each target
  const seen = new Set<string>()
  let hasPositiveWeight = false

  for (const targetInput of pool.targets) {
    // Normalize target (convert string to object if needed)
    const target = normalizeTarget(targetInput)

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
    // Note: weight: 0 is valid and means permanently disabled
    // - Excluded from routing selection entirely
    // - Never participates in recovery

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
 *
 * Supports:
 * - Legacy: "provider,model"
 * - Pool object: { targets: [...], health?: {...} }
 * - Array shorthand: ["provider,model1", "provider,model2"]
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

  // New: pool config (object or array)
  if (isPoolConfig(value)) {
    // Convert array shorthand to object format
    const config: RoutePoolConfig = Array.isArray(value)
      ? { targets: value }
      : value

    validatePoolConfig(config)

    const health = {
      ...DEFAULT_HEALTH_CONFIG,
      ...(config.health || {})
    }

    // Normalize targets (convert strings to objects, apply default weights)
    const normalizedTargets = config.targets!.map(t => normalizeTarget(t))

    const targets = new Map<string, TargetState>(
      normalizedTargets.map(t => [
        t.model,
        {
          model: t.model,
          defaultWeight: t.weight,
          effectiveWeight: t.weight,
          baseCooldown: health.cooldown_ms,
          suppressedUntil: undefined,
          lastFailureAt: undefined,
          lastRecoveryStartedAt: undefined,
          consecutiveFailures: 0,
          currentWeight: 0
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
    `expected string or pool config, got ${typeof value}`
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