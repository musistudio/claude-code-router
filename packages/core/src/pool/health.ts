import { TargetState, FailureType, RouteHealthConfig, MAX_COOLDOWN_MS } from './types'

/**
 * Classify HTTP status + error into failure type
 * Returns null if not a health-relevant failure
 */
export function classifyFailure(
  httpStatus?: number,
  errorMessage?: string
): FailureType | null {
  // HTTP 429: rate limit
  if (httpStatus === 429) {
    return '429'
  }

  // HTTP 5xx: server error
  if (httpStatus && httpStatus >= 500 && httpStatus < 600) {
    return '5xx'
  }

  // Network/timeout errors
  if (errorMessage) {
    const msg = errorMessage.toLowerCase()
    if (
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('network') ||
      msg.includes('socket')
    ) {
      return 'network'
    }
  }

  // 4xx errors do NOT count as health failures by default
  // (they indicate client misconfiguration, not transient provider outage)
  return null
}

/**
 * Apply failure to target: suppress and mark
 * Uses exponential backoff: cooldown doubles with each consecutive failure
 */
export function applyFailure(
  target: TargetState,
  httpStatus?: number,
  errorMessage?: string,
  health?: Required<RouteHealthConfig>
): void {
  const now = Date.now()

  // Hard drop to 0
  target.effectiveWeight = 0

  // Increment failure count BEFORE calculating backoff
  target.consecutiveFailures += 1

  // Exponential backoff: baseCooldown * 2^(failures-1)
  // Capped at MAX_COOLDOWN_MS
  const baseCooldown = target.baseCooldown ?? health?.cooldown_ms ?? 60000
  const backoffMultiplier = Math.pow(2, target.consecutiveFailures - 1)
  const exponentialCooldown = Math.min(
    baseCooldown * backoffMultiplier,
    MAX_COOLDOWN_MS
  )

  target.suppressedUntil = now + exponentialCooldown
  target.lastFailureAt = now

  // Log is done by caller (has context for structured logging)
}

/**
 * Update recovery state (lazy evaluation on access)
 *
 * Phase 1: Suppression
 *   - While now < suppressedUntil, do nothing
 *
 * Phase 2: Recovery
 *   - After suppressedUntil, start recovery
 *   - Every recovery_interval_ms, increase effectiveWeight by recovery_step
 *   - Cap at defaultWeight
 */
export function updateRecovery(
  target: TargetState,
  health: Required<RouteHealthConfig>
): void {
  const now = Date.now()

  // If suppressed, do nothing
  if (target.suppressedUntil !== undefined && now < target.suppressedUntil) {
    return
  }

  // If suppression just ended, start recovery
  if (
    target.suppressedUntil !== undefined &&
    target.effectiveWeight === 0 &&
    target.lastRecoveryStartedAt === undefined
  ) {
    target.lastRecoveryStartedAt = now
    // Give initial recovery weight immediately
    target.effectiveWeight = Math.min(target.defaultWeight, health.recovery_step)
    return  // Early return - recovery just started
  }

  // If not in recovery, nothing to do
  if (target.lastRecoveryStartedAt === undefined) {
    return
  }

  // If already at default weight, stop recovery
  if (target.effectiveWeight >= target.defaultWeight) {
    target.effectiveWeight = target.defaultWeight
    target.lastRecoveryStartedAt = undefined  // recovery complete
    return
  }

  // Calculate time elapsed since recovery started
  const elapsedMs = now - target.lastRecoveryStartedAt
  const interval = health.recovery_interval_ms
  const step = health.recovery_step

  // How many recovery steps should have happened?
  const stepsCompleted = Math.floor(elapsedMs / interval)
  const newWeight = Math.min(
    target.defaultWeight,
    target.consecutiveFailures === 0
      ? target.defaultWeight  // if no longer failing, jump to default
      : stepsCompleted * step  // otherwise, step by step
  )

  target.effectiveWeight = newWeight

  // If reached default, mark recovery as done
  if (target.effectiveWeight >= target.defaultWeight) {
    target.effectiveWeight = target.defaultWeight
    target.lastRecoveryStartedAt = undefined
    target.consecutiveFailures = 0
  }
}

/**
 * Reset target to healthy state (on success)
 *
 * For MVP, just clear consecutive failures counter
 * Recovery is purely time-based
 */
export function applySuccess(target: TargetState): void {
  target.consecutiveFailures = 0
  // Note: we don't auto-restore on success in MVP
  // Recovery is purely time-based
}

/**
 * Check if target is in cooldown (suppressed)
 */
export function isSuppressed(target: TargetState, now: number = Date.now()): boolean {
  return target.suppressedUntil !== undefined && now < target.suppressedUntil
}

/**
 * Check if target is in recovery phase
 */
export function isRecovering(target: TargetState): boolean {
  return target.lastRecoveryStartedAt !== undefined &&
    target.effectiveWeight < target.defaultWeight
}

/**
 * Get time until target is eligible again (for logging)
 */
export function getTimeUntilEligible(
  target: TargetState,
  now: number = Date.now()
): number {
  if (target.suppressedUntil !== undefined && now < target.suppressedUntil) {
    return target.suppressedUntil - now
  }
  return 0  // eligible now
}