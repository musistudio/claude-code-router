import { PoolState, TargetState, SelectionResult } from './types'

/**
 * Smooth weighted round-robin selection
 *
 * Algorithm:
 * 1. For each eligible target, increment currentWeight by effectiveWeight
 * 2. Select the target with highest currentWeight
 * 3. Decrease selected target's currentWeight by sum of all effective weights
 *
 * This ensures proportional distribution without clustering.
 */
export function selectTarget(pool: PoolState): SelectionResult {
  // Filter eligible targets:
  // - effectiveWeight > 0 (not temporarily suppressed)
  // - defaultWeight > 0 (not permanently disabled)
  const eligibleTargets = Array.from(pool.targets.values()).filter(
    t => t.effectiveWeight > 0 && t.defaultWeight > 0
  )

  // If no eligible targets, use fail-open policy
  if (eligibleTargets.length === 0) {
    return selectFailOpen(pool)
  }

  // WRR: increment all, select max, decrement selected
  for (const target of eligibleTargets) {
    target.currentWeight += target.effectiveWeight
  }

  let selected = eligibleTargets[0]
  for (const target of eligibleTargets) {
    if (target.currentWeight > selected.currentWeight) {
      selected = target
    }
  }

  // Decrement selected by sum of effective weights
  const sumEffectiveWeights = eligibleTargets.reduce(
    (sum, t) => sum + t.effectiveWeight,
    0
  )
  selected.currentWeight -= sumEffectiveWeights

  return {
    target: selected,
    selectedFrom: 'healthy'
  }
}

/**
 * Fail-open policy: select target with earliest suppression recovery time
 *
 * Logic:
 * - Skip targets with defaultWeight === 0 (permanently disabled)
 * - If suppressedUntil is set, use that
 * - Otherwise use lastFailureAt + cooldown_ms
 * - If neither exists, pick any (shouldn't happen)
 */
function selectFailOpen(pool: PoolState): SelectionResult {
  // Filter out permanently disabled targets
  const candidates = Array.from(pool.targets.values()).filter(
    t => t.defaultWeight > 0
  )

  if (candidates.length === 0) {
    throw new Error('No eligible targets: all targets have weight 0 (permanently disabled)')
  }

  let earliest = candidates[0]

  for (const target of candidates) {
    const earliestRecoveryTime = getRecoveryTime(target, pool.health.cooldown_ms)
    const candidateRecoveryTime = getRecoveryTime(earliest, pool.health.cooldown_ms)

    if (earliestRecoveryTime < candidateRecoveryTime) {
      earliest = target
    }
  }

  return {
    target: earliest,
    selectedFrom: 'fail_open'
  }
}

/**
 * Get timestamp when target will be eligible for selection again
 */
function getRecoveryTime(
  target: TargetState,
  cooldownMs: number
): number {
  if (target.suppressedUntil !== undefined) {
    return target.suppressedUntil
  }
  if (target.lastFailureAt !== undefined) {
    return target.lastFailureAt + cooldownMs
  }
  return 0  // no failure, eligible now
}

/**
 * Get candidates for selection (for logging)
 */
export function getCandidates(
  pool: PoolState
): Array<{ model: string; defaultWeight: number; effectiveWeight: number; isEligible: boolean; isDisabled: boolean }> {
  return Array.from(pool.targets.values()).map(t => ({
    model: t.model,
    defaultWeight: t.defaultWeight,
    effectiveWeight: t.effectiveWeight,
    isEligible: t.effectiveWeight > 0 && t.defaultWeight > 0,
    isDisabled: t.defaultWeight === 0
  }))
}