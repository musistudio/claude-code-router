/**
 * Configuration types (read from config.json, immutable)
 */

/**
 * Maximum cooldown time for exponential backoff
 * After this cap, cooldown stops doubling
 */
export const MAX_COOLDOWN_MS = 12 * 60 * 60 * 1000  // 12 hours in milliseconds

/**
 * Represents a single target in a weighted round-robin pool
 */
export type RouteTarget = {
  model: string
  weight: number
}

/**
 * Health configuration for a pool
 * These settings control how targets recover from failures
 */
export type RouteHealthConfig = {
  cooldown_ms?: number            // Time to wait before starting recovery (default: 60000)
  recovery_interval_ms?: number   // Time between recovery steps (default: 30000)
  recovery_step?: number          // Weight increment per recovery step (default: 1)
}

/**
 * Pool configuration for a route
 * Enables weighted round-robin load balancing with health suppression
 */
export type RoutePoolConfig = {
  strategy: 'weighted_round_robin'
  targets: RouteTarget[]
  health?: RouteHealthConfig
}

/**
 * Route value can be either a legacy string (provider,model) or a pool configuration
 */
export type RouteValue = string | RoutePoolConfig

/**
 * Type guard to check if a route value is a pool configuration
 */
export function isPoolConfig(value: any): value is RoutePoolConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.strategy === 'weighted_round_robin' &&
    Array.isArray(value.targets)
  )
}

/**
 * Runtime types (mutable, process-local)
 */

/**
 * State for a single target within a pool
 * Tracks both configuration and runtime health status
 */
export type TargetState = {
  model: string                    // From config: "provider,model"
  defaultWeight: number            // From config, never changes. 0 = permanently disabled
  effectiveWeight: number          // Runtime weight, can be 0 (suppressed) or recovering
  baseCooldown?: number            // Original cooldown from config (for exponential backoff)
  suppressedUntil?: number         // Timestamp in ms when suppression ends, undefined = not suppressed
  lastFailureAt?: number          // Timestamp in ms of last failure
  lastRecoveryStartedAt?: number  // Timestamp in ms when recovery phase started
  consecutiveFailures: number     // Used for exponential backoff calculation
  currentWeight: number           // Internal WRR accumulator (starts at 0)
}

/**
 * State for an entire pool, comprising multiple targets
 */
export type PoolState = {
  scenario: string                           // Route scenario name (e.g., "default", "think")
  targets: Map<string, TargetState>          // Keyed by model string
  strategy: 'weighted_round_robin'
  health: Required<RouteHealthConfig>        // Health config with defaults applied
}

/**
 * Types of failures that can suppress a target
 */
export type FailureType = '429' | '5xx' | 'timeout' | 'network'

/**
 * Context information about a failure
 */
export type FailureContext = {
  type: FailureType
  httpStatus?: number
  error?: Error
  errorMessage?: string
}

/**
 * Result of target selection from a pool
 */
export type SelectionResult = {
  target: TargetState
  selectedFrom: 'healthy' | 'fail_open'
}

/**
 * Health update information for logging and events
 */
export type HealthUpdate = {
  action: 'suppressed' | 'recovering' | 'restored'
  prevWeight: number
  newWeight: number
  suppressedUntil?: number
}