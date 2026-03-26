import { selectTarget, getCandidates } from '../selection'
import { PoolState, TargetState } from '../types'

function makePoolState(targets: Array<{ model: string; weight: number }>): PoolState {
  const map = new Map<string, TargetState>(
    targets.map(t => [
      t.model,
      {
        model: t.model,
        defaultWeight: t.weight,
        effectiveWeight: t.weight,
        consecutiveFailures: 0,
        currentWeight: 0
      } as TargetState
    ])
  )

  return {
    scenario: 'default',
    targets: map,
    strategy: 'weighted_round_robin',
    health: {
      cooldown_ms: 60000,
      recovery_interval_ms: 30000,
      recovery_step: 1
    }
  }
}

describe('pool/selection', () => {
  describe('weighted round-robin', () => {
    it('selects by weight ratio', () => {
      const pool = makePoolState([
        { model: 'a', weight: 3 },
        { model: 'b', weight: 1 }
      ])

      const selections: string[] = []
      for (let i = 0; i < 40; i++) {
        const result = selectTarget(pool)
        selections.push(result.target.model)
      }

      // Rough ratio check: 'a' should be ~3x more frequent than 'b'
      const countA = selections.filter(m => m === 'a').length
      const countB = selections.filter(m => m === 'b').length

      expect(countA).toBeGreaterThan(countB)
      expect(countA / countB).toBeCloseTo(3, 0)  // tolerance of ±0.5
    })

    it('is deterministic', () => {
      const pool1 = makePoolState([
        { model: 'a', weight: 2 },
        { model: 'b', weight: 1 }
      ])

      const pool2 = makePoolState([
        { model: 'a', weight: 2 },
        { model: 'b', weight: 1 }
      ])

      const selections1: string[] = []
      const selections2: string[] = []

      for (let i = 0; i < 10; i++) {
        selections1.push(selectTarget(pool1).target.model)
      }

      for (let i = 0; i < 10; i++) {
        selections2.push(selectTarget(pool2).target.model)
      }

      expect(selections1).toEqual(selections2)
    })

    it('distributes evenly when weights are equal', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1 },
        { model: 'b', weight: 1 }
      ])

      const selections: string[] = []
      for (let i = 0; i < 20; i++) {
        const result = selectTarget(pool)
        selections.push(result.target.model)
      }

      const countA = selections.filter(m => m === 'a').length
      const countB = selections.filter(m => m === 'b').length

      // Should be exactly equal for smooth WRR with equal weights
      expect(countA).toBe(countB)
    })

    it('returns selectedFrom as healthy', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1 },
        { model: 'b', weight: 1 }
      ])

      const result = selectTarget(pool)
      expect(result.selectedFrom).toBe('healthy')
    })
  })

  describe('effective weight filtering', () => {
    it('excludes targets with weight 0', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1 },
        { model: 'b', weight: 1 }
      ])

      const targetB = pool.targets.get('b')!
      targetB.effectiveWeight = 0

      for (let i = 0; i < 10; i++) {
        const result = selectTarget(pool)
        expect(result.target.model).toBe('a')
      }
    })

    it('excludes all suppressed targets', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1 },
        { model: 'b', weight: 1 },
        { model: 'c', weight: 1 }
      ])

      // Suppress 'a' and 'b'
      pool.targets.get('a')!.effectiveWeight = 0
      pool.targets.get('b')!.effectiveWeight = 0

      for (let i = 0; i < 10; i++) {
        const result = selectTarget(pool)
        expect(result.target.model).toBe('c')
      }
    })

    it('includes recovering targets', () => {
      const pool = makePoolState([
        { model: 'a', weight: 5 },
        { model: 'b', weight: 1 }
      ])

      // 'a' is recovering with weight 2 (not fully restored)
      pool.targets.get('a')!.effectiveWeight = 2

      const selections: string[] = []
      for (let i = 0; i < 30; i++) {
        const result = selectTarget(pool)
        selections.push(result.target.model)
      }

      const countA = selections.filter(m => m === 'a').length
      const countB = selections.filter(m => m === 'b').length

      // Ratio should be 2:1 (effective weights)
      expect(countA).toBeGreaterThan(countB)
      expect(countA / countB).toBeCloseTo(2, 0)
    })
  })

  describe('fail-open policy', () => {
    it('selects earliest recovery when all suppressed', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1 },
        { model: 'b', weight: 1 }
      ])

      const now = Date.now()
      const targetA = pool.targets.get('a')!
      const targetB = pool.targets.get('b')!

      // Suppress both
      targetA.effectiveWeight = 0
      targetA.suppressedUntil = now + 100000
      targetB.effectiveWeight = 0
      targetB.suppressedUntil = now + 50000  // earlier

      const result = selectTarget(pool)
      expect(result.target.model).toBe('b')
      expect(result.selectedFrom).toBe('fail_open')
    })

    it('uses lastFailureAt when suppressedUntil not set', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1 },
        { model: 'b', weight: 1 }
      ])

      const now = Date.now()
      const targetA = pool.targets.get('a')!
      const targetB = pool.targets.get('b')!

      // Suppress both without suppressedUntil
      targetA.effectiveWeight = 0
      targetA.lastFailureAt = now - 10000  // failed 10s ago
      targetB.effectiveWeight = 0
      targetB.lastFailureAt = now - 20000  // failed 20s ago (earlier)

      const result = selectTarget(pool)
      expect(result.target.model).toBe('b')
      expect(result.selectedFrom).toBe('fail_open')
    })

    it('picks any target when no failure info', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1 },
        { model: 'b', weight: 1 }
      ])

      // Suppress both without setting any timestamps
      pool.targets.get('a')!.effectiveWeight = 0
      pool.targets.get('b')!.effectiveWeight = 0

      const result = selectTarget(pool)
      expect(['a', 'b']).toContain(result.target.model)
      expect(result.selectedFrom).toBe('fail_open')
    })
  })

  describe('getCandidates', () => {
    it('reports all targets with eligibility', () => {
      const pool = makePoolState([
        { model: 'a', weight: 2 },
        { model: 'b', weight: 1 }
      ])

      pool.targets.get('a')!.effectiveWeight = 0

      const candidates = getCandidates(pool)
      expect(candidates).toEqual([
        { model: 'a', effectiveWeight: 0, isEligible: false },
        { model: 'b', effectiveWeight: 1, isEligible: true }
      ])
    })

    it('reports all targets as eligible when healthy', () => {
      const pool = makePoolState([
        { model: 'a', weight: 2 },
        { model: 'b', weight: 1 }
      ])

      const candidates = getCandidates(pool)
      expect(candidates.every(c => c.isEligible)).toBe(true)
    })

    it('preserves order from targets map', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1 },
        { model: 'b', weight: 2 },
        { model: 'c', weight: 3 }
      ])

      const candidates = getCandidates(pool)
      expect(candidates.map(c => c.model)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('edge cases', () => {
    it('handles single target pool', () => {
      const pool = makePoolState([
        { model: 'only', weight: 1 }
      ])

      for (let i = 0; i < 5; i++) {
        const result = selectTarget(pool)
        expect(result.target.model).toBe('only')
        expect(result.selectedFrom).toBe('healthy')
      }
    })

    it('handles very large weights', () => {
      const pool = makePoolState([
        { model: 'a', weight: 1000 },
        { model: 'b', weight: 1 }
      ])

      const result = selectTarget(pool)
      expect(result.target.model).toBeDefined()
    })

    it('handles many targets', () => {
      const targets = []
      for (let i = 0; i < 100; i++) {
        targets.push({ model: `target-${i}`, weight: i + 1 })
      }
      const pool = makePoolState(targets)

      const result = selectTarget(pool)
      expect(result.target.model).toMatch(/^target-\d+$/)
    })
  })
})