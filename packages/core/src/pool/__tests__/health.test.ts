import {
  classifyFailure,
  applyFailure,
  updateRecovery,
  isSuppressed,
  isRecovering
} from '../health'
import { TargetState } from '../types'

function makeTarget(): TargetState {
  return {
    model: 'ollama,glm-4',
    defaultWeight: 5,
    effectiveWeight: 5,
    consecutiveFailures: 0,
    currentWeight: 0
  }
}

// Helper to create suppressed target
function makeSuppressedTarget(failures: number = 1): TargetState {
  const target = makeTarget()
  target.effectiveWeight = 0
  target.consecutiveFailures = failures
  target.suppressedUntil = Date.now() + 60000
  return target
}

const defaultHealth = {
  cooldown_ms: 60000,
  recovery_interval_ms: 30000,
  recovery_step: 1
}

describe('pool/health', () => {
  describe('classifyFailure', () => {
    it('classifies 429 as failure', () => {
      expect(classifyFailure(429)).toBe('429')
    })

    it('classifies 5xx as failure', () => {
      expect(classifyFailure(500)).toBe('5xx')
      expect(classifyFailure(502)).toBe('5xx')
      expect(classifyFailure(503)).toBe('5xx')
      expect(classifyFailure(599)).toBe('5xx')
    })

    it('classifies timeout as network', () => {
      expect(classifyFailure(undefined, 'Request timeout')).toBe('network')
      expect(classifyFailure(undefined, 'Connection timeout')).toBe('network')
    })

    it('classifies ECONNREFUSED as network', () => {
      expect(classifyFailure(undefined, 'ECONNREFUSED')).toBe('network')
    })

    it('classifies ECONNRESET as network', () => {
      expect(classifyFailure(undefined, 'ECONNRESET')).toBe('network')
    })

    it('classifies ENOTFOUND as network', () => {
      expect(classifyFailure(undefined, 'ENOTFOUND')).toBe('network')
    })

    it('classifies network error messages', () => {
      expect(classifyFailure(undefined, 'Network error')).toBe('network')
      expect(classifyFailure(undefined, 'Socket hangup')).toBe('network')
    })

    it('ignores 400 errors', () => {
      expect(classifyFailure(400)).toBeNull()
    })

    it('ignores 401 errors', () => {
      expect(classifyFailure(401)).toBeNull()
    })

    it('ignores 403 errors', () => {
      expect(classifyFailure(403)).toBeNull()
    })

    it('ignores 404 errors', () => {
      expect(classifyFailure(404)).toBeNull()
    })

    it('ignores 422 errors', () => {
      expect(classifyFailure(422)).toBeNull()
    })

    it('ignores unknown error messages', () => {
      expect(classifyFailure(undefined, 'Invalid request')).toBeNull()
      expect(classifyFailure(undefined, 'Bad parameter')).toBeNull()
    })

    it('handles case-insensitive error messages', () => {
      expect(classifyFailure(undefined, 'TIMEOUT')).toBe('network')
      expect(classifyFailure(undefined, 'Timeout')).toBe('network')
    })
  })

  describe('applyFailure', () => {
    it('sets effective weight to 0', () => {
      const target = makeTarget()

      applyFailure(target, 429, undefined, defaultHealth)

      expect(target.effectiveWeight).toBe(0)
    })

    it('sets suppressed until', () => {
      const target = makeTarget()
      const before = Date.now()

      applyFailure(target, 429, undefined, defaultHealth)

      const after = Date.now()
      expect(target.suppressedUntil).toBeGreaterThanOrEqual(before + 60000)
      expect(target.suppressedUntil).toBeLessThanOrEqual(after + 60000)
    })

    it('increments consecutive failures', () => {
      const target = makeTarget()

      applyFailure(target, 429, undefined, defaultHealth)
      expect(target.consecutiveFailures).toBe(1)

      applyFailure(target, 500, undefined, defaultHealth)
      expect(target.consecutiveFailures).toBe(2)
    })

    it('sets last failure time', () => {
      const target = makeTarget()
      const before = Date.now()

      applyFailure(target, 429, undefined, defaultHealth)

      const after = Date.now()
      expect(target.lastFailureAt).toBeGreaterThanOrEqual(before)
      expect(target.lastFailureAt).toBeLessThanOrEqual(after)
    })

    it('uses custom cooldown', () => {
      const target = makeTarget()
      const customHealth = { ...defaultHealth, cooldown_ms: 120000 }
      const before = Date.now()

      applyFailure(target, 429, undefined, customHealth)

      const after = Date.now()
      expect(target.suppressedUntil).toBeGreaterThanOrEqual(before + 120000)
      expect(target.suppressedUntil).toBeLessThanOrEqual(after + 120000)
    })

    it('works with network error', () => {
      const target = makeTarget()

      applyFailure(target, undefined, 'ECONNREFUSED', defaultHealth)

      expect(target.effectiveWeight).toBe(0)
      expect(target.suppressedUntil).toBeDefined()
    })

    it('works with 5xx error', () => {
      const target = makeTarget()

      applyFailure(target, 503, undefined, defaultHealth)

      expect(target.effectiveWeight).toBe(0)
      expect(target.suppressedUntil).toBeDefined()
    })
  })

  describe('updateRecovery', () => {
    it('does nothing during cooldown', () => {
      const target = makeTarget()
      const now = Date.now()
      target.suppressedUntil = now + 60000
      target.effectiveWeight = 0
      target.consecutiveFailures = 1

      updateRecovery(target, defaultHealth)

      expect(target.effectiveWeight).toBe(0)
      expect(target.lastRecoveryStartedAt).toBeUndefined()
    })

    it('starts recovery after cooldown', () => {
      const target = makeSuppressedTarget()
      target.suppressedUntil = Date.now() - 1000  // cooldown expired

      updateRecovery(target, defaultHealth)

      expect(target.effectiveWeight).toBeGreaterThan(0)
      expect(target.lastRecoveryStartedAt).toBeDefined()
    })

    it('restores gradually', () => {
      const target = makeTarget()
      const cooldownEnd = Date.now() - 60000  // cooldown ended 60s ago

      target.suppressedUntil = cooldownEnd
      target.effectiveWeight = 0
      target.consecutiveFailures = 1
      target.lastRecoveryStartedAt = cooldownEnd

      // Simulate 60s of recovery with 30s interval, 1 step
      // Should have 2 steps completed
      updateRecovery(target, defaultHealth)

      expect(target.effectiveWeight).toBe(2)
    })

    it('caps at default weight', () => {
      const target = makeTarget()
      target.defaultWeight = 3
      target.suppressedUntil = Date.now() - 1000
      target.effectiveWeight = 0
      target.consecutiveFailures = 1
      target.lastRecoveryStartedAt = Date.now() - 1000000  // very long ago

      updateRecovery(target, defaultHealth)

      expect(target.effectiveWeight).toBe(3)  // capped at default
      expect(target.lastRecoveryStartedAt).toBeUndefined()
      expect(target.consecutiveFailures).toBe(0)
    })

    it('does nothing if not suppressed', () => {
      const target = makeTarget()
      target.effectiveWeight = 5

      updateRecovery(target, defaultHealth)

      expect(target.lastRecoveryStartedAt).toBeUndefined()
    })

    it('uses custom recovery config', () => {
      const target = makeTarget()
      const customHealth = {
        cooldown_ms: 10000,
        recovery_interval_ms: 5000,
        recovery_step: 2
      }

      target.suppressedUntil = Date.now() - 10000  // ended 10s ago
      target.effectiveWeight = 0
      target.consecutiveFailures = 1
      target.lastRecoveryStartedAt = Date.now() - 10000

      updateRecovery(target, customHealth)

      // 10s / 5s = 2 steps * 2 weight per step = 4
      expect(target.effectiveWeight).toBe(4)
    })
  })

  describe('isSuppressed', () => {
    it('returns true if suppressed until future', () => {
      const target = makeTarget()
      target.suppressedUntil = Date.now() + 60000

      expect(isSuppressed(target)).toBe(true)
    })

    it('returns false if suppression expired', () => {
      const target = makeTarget()
      target.suppressedUntil = Date.now() - 1000

      expect(isSuppressed(target)).toBe(false)
    })

    it('returns false if never suppressed', () => {
      const target = makeTarget()

      expect(isSuppressed(target)).toBe(false)
    })

    it('uses provided timestamp', () => {
      const target = makeTarget()
      const fixedTime = 1000000
      target.suppressedUntil = fixedTime + 60000

      expect(isSuppressed(target, fixedTime)).toBe(true)
      expect(isSuppressed(target, fixedTime + 120000)).toBe(false)
    })
  })

  describe('isRecovering', () => {
    it('returns true if in recovery phase', () => {
      const target = makeTarget()
      target.lastRecoveryStartedAt = Date.now() - 10000
      target.effectiveWeight = 2
      target.defaultWeight = 5

      expect(isRecovering(target)).toBe(true)
    })

    it('returns false if not in recovery', () => {
      const target = makeTarget()

      expect(isRecovering(target)).toBe(false)
    })

    it('returns false if recovery complete', () => {
      const target = makeTarget()
      target.lastRecoveryStartedAt = Date.now() - 10000
      target.effectiveWeight = 5
      target.defaultWeight = 5

      // After updateRecovery, should clear lastRecoveryStartedAt
      expect(isRecovering(target)).toBe(false)
    })

    it('returns false if recovery not started', () => {
      const target = makeTarget()
      target.effectiveWeight = 0
      target.suppressedUntil = Date.now() + 60000

      expect(isRecovering(target)).toBe(false)
    })
  })
})