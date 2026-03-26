import { RouteValue, PoolState, TargetState, FailureContext } from './types'
import { parseAllRoutes } from './config'
import { selectTarget, getCandidates } from './selection'
import { applyFailure, updateRecovery, classifyFailure } from './health'

/**
 * Global pool state store
 * Keyed by scenario (e.g., "default", "think", "background")
 */
const poolStore = new Map<string, PoolState>()

/**
 * Initialize pool state from router config
 * Call this at startup
 */
export function initializePools(routerConfig: Record<string, RouteValue>): void {
  const parsed = parseAllRoutes(routerConfig)

  for (const [scenario, route] of parsed) {
    if (typeof route === 'object' && route.strategy === 'weighted_round_robin') {
      poolStore.set(scenario, route)
    }
    // Legacy string routes are not stored
  }
}

/**
 * Get pool state for scenario, or null if not a pool
 */
export function getPoolState(scenario: string): PoolState | null {
  return poolStore.get(scenario) ?? null
}

/**
 * Get all pool scenarios
 */
export function getPoolScenarios(): string[] {
  return Array.from(poolStore.keys())
}

/**
 * Select target from pool
 * Returns { target, selectedFrom, candidates, policy }
 */
export function selectTargetFromPool(scenario: string) {
  const pool = poolStore.get(scenario)
  if (!pool) {
    throw new Error(`No pool for scenario: ${scenario}`)
  }

  const result = selectTarget(pool)
  const candidates = getCandidates(pool)

  return {
    target: result.target,
    selectedFrom: result.selectedFrom,
    candidates,
    policy: pool.health
  }
}

/**
 * Record failure for target
 * Updates health state, logs handled by caller
 */
export function recordFailure(
  scenario: string,
  model: string,
  httpStatus?: number,
  errorMessage?: string
): { suppressed: boolean; suppressedUntil?: number } {
  const pool = poolStore.get(scenario)
  if (!pool) {
    return { suppressed: false }
  }

  const target = pool.targets.get(model)
  if (!target) {
    return { suppressed: false }
  }

  // Classify failure
  const failureType = classifyFailure(httpStatus, errorMessage)
  if (!failureType) {
    return { suppressed: false }  // not a health failure
  }

  // Apply failure
  const prevWeight = target.effectiveWeight
  applyFailure(target, httpStatus, errorMessage, pool.health)

  return {
    suppressed: true,
    suppressedUntil: target.suppressedUntil
  }
}

/**
 * Update recovery state (call on every selection or periodically)
 */
export function updateTargetRecovery(scenario: string, model: string): void {
  const pool = poolStore.get(scenario)
  if (!pool) return

  const target = pool.targets.get(model)
  if (!target) return

  updateRecovery(target, pool.health)
}

/**
 * Reset all pools to default state (for testing or restart)
 */
export function resetPoolState(): void {
  for (const pool of poolStore.values()) {
    for (const target of pool.targets.values()) {
      target.effectiveWeight = target.defaultWeight
      target.suppressedUntil = undefined
      target.lastFailureAt = undefined
      target.lastRecoveryStartedAt = undefined
      target.consecutiveFailures = 0
      target.currentWeight = 0
    }
  }
}

/**
 * Export state for debugging/observability
 */
export function getPoolDebugInfo(scenario: string) {
  const pool = poolStore.get(scenario)
  if (!pool) return null

  return {
    scenario,
    strategy: pool.strategy,
    health: pool.health,
    targets: Array.from(pool.targets.values()).map(t => ({
      model: t.model,
      defaultWeight: t.defaultWeight,
      effectiveWeight: t.effectiveWeight,
      suppressed: t.suppressedUntil !== undefined && t.suppressedUntil > Date.now(),
      recovering: t.lastRecoveryStartedAt !== undefined,
      consecutiveFailures: t.consecutiveFailures,
      suppressedUntil: t.suppressedUntil,
      lastFailureAt: t.lastFailureAt,
      lastRecoveryStartedAt: t.lastRecoveryStartedAt
    }))
  }
}

/**
 * Get status summary for all pools
 */
export function getPoolStatusSummary() {
  const summary: Record<string, any> = {}

  for (const scenario of getPoolScenarios()) {
    const debug = getPoolDebugInfo(scenario)
    if (!debug) continue

    summary[scenario] = {
      totalTargets: debug.targets.length,
      healthy: debug.targets.filter(t => !t.suppressed && !t.recovering).length,
      recovering: debug.targets.filter(t => t.recovering).length,
      failed: debug.targets.filter(t => t.suppressed).length
    }
  }

  return summary
}