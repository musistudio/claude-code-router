# Claude Code Router: Pooled Routes Implementation Plan

**Target Completion:** 3-4 days (solo developer)  
**Complexity:** Medium (straightforward types + state machine + integration)  
**Risk Level:** Low (backward compatible, isolated concerns)

---

## Part A: Project Structure & File Layout

### New Files to Create

```
packages/server/src/pool/
├── types.ts              # Config + runtime types
├── config.ts             # Parsing + validation
├── selection.ts          # WRR algorithm
├── health.ts             # Failure classification + recovery
├── index.ts              # Public API
└── __tests__/
    ├── config.test.ts
    ├── selection.test.ts
    ├── health.test.ts
    └── integration.test.ts
```

### Modified Files

```
packages/server/src/utils/router.ts      # Integration hooks
packages/server/src/index.ts              # Initialize pools at startup
package.json                              # No new deps needed
```

---

## Part B: Detailed Task Breakdown

### Phase 0: Setup & Planning (0.5 hours)

**Task 0.1: Create branch**
```bash
cd ~/dev/my/claude-code-router
git checkout -b feature/pool-load-balancing
git pull origin main
mkdir -p packages/server/src/pool/__tests__
```

**Task 0.2: Review current router.ts**
- Understand existing `resolveRoute()` signature
- Identify where failures are caught
- Find completion/error handling hooks
- Note how request context flows

**Task 0.3: Plan state storage**
- Decide: Global `Map<string, PoolState>` vs per-router instance?
- Recommendation: Module-level Map (simplest, matches current router pattern)
- Location: `pool/index.ts`

---

### Phase 1: Type Definitions (1 hour)

**File: `packages/server/src/pool/types.ts`**

```typescript
/**
 * Configuration types (read from config.json, immutable)
 */

export type RouteTarget = {
  model: string
  weight: number
}

export type RouteHealthConfig = {
  cooldown_ms?: number
  recovery_interval_ms?: number
  recovery_step?: number
}

export type RoutePoolConfig = {
  strategy: 'weighted_round_robin'
  targets: RouteTarget[]
  health?: RouteHealthConfig
}

export type RouteValue = string | RoutePoolConfig

// Type guard
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

export type TargetState = {
  model: string
  defaultWeight: number
  effectiveWeight: number
  suppressedUntil?: number        // timestamp ms, undefined = not suppressed
  lastFailureAt?: number          // timestamp ms
  lastRecoveryStartedAt?: number  // timestamp ms when entered recovery phase
  consecutiveFailures: number
  currentWeight: number           // internal WRR accumulator
}

export type PoolState = {
  scenario: string
  targets: Map<string, TargetState>  // keyed by model
  strategy: 'weighted_round_robin'
  health: Required<RouteHealthConfig> // with defaults applied
}

export type FailureType = '429' | '5xx' | 'timeout' | 'network'

export type FailureContext = {
  type: FailureType
  httpStatus?: number
  error?: Error
}

/**
 * Result types
 */

export type SelectionResult = {
  target: TargetState
  selectedFrom: 'healthy' | 'fail_open'
}

export type HealthUpdate = {
  action: 'suppressed' | 'recovering' | 'restored'
  prevWeight: number
  newWeight: number
  suppressedUntil?: number
}
```

**Task 1.1: Implement `types.ts`**
- Define all TypeScript types above
- Add JSDoc comments for clarity
- Add type guards (`isPoolConfig`)
- Add exports

**Task 1.2: Create `.test.ts` stub for types**
```typescript
// pool/__tests__/types.test.ts
import { isPoolConfig } from '../types'

describe('pool/types', () => {
  it('identifies pool config', () => {
    expect(isPoolConfig('string')).toBe(false)
    expect(isPoolConfig({
      strategy: 'weighted_round_robin',
      targets: [{ model: 'a,b', weight: 1 }]
    })).toBe(true)
  })
})
```

---

### Phase 2: Config Validation (1.5 hours)

**File: `packages/server/src/pool/config.ts`**

```typescript
import {
  RouteValue,
  RoutePoolConfig,
  RouteHealthConfig,
  PoolState,
  isPoolConfig
} from './types'

// Defaults
const DEFAULT_HEALTH_CONFIG: Required<RouteHealthConfig> = {
  cooldown_ms: 60000,
  recovery_interval_ms: 30000,
  recovery_step: 1
}

/**
 * Validate provider,model string format
 */
function validateModelString(model: string): void {
  if (!model || typeof model !== 'string') {
    throw new Error(`Invalid model: expected string, got ${typeof model}`)
  }
  const [provider, modelName] = model.split(',')
  if (!provider || !modelName) {
    throw new Error(
      `Invalid model format "${model}": expected "provider,model"`
    )
  }
}

/**
 * Validate RoutePoolConfig at startup
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
      throw new Error(
        `Duplicate model in pool: ${target.model}`
      )
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

    const targets = new Map(
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
 * Parse all routes from config
 * Returns map of scenario -> (PoolState | string)
 */
export function parseAllRoutes(
  routerConfig: Record<string, RouteValue>
): Map<string, PoolState | string> {
  const result = new Map<string, PoolState | string>()

  for (const [scenario, value] of Object.entries(routerConfig)) {
    try {
      result.set(scenario, parseRouteValue(scenario, value))
    } catch (err) {
      throw new Error(
        `Invalid route config for scenario "${scenario}": ${err.message}`
      )
    }
  }

  return result
}
```

**Task 2.1: Implement `config.ts`**
- Validation functions
- Type guards
- Default merging
- Error messages

**Task 2.2: Write config tests**

```typescript
// pool/__tests__/config.test.ts
import { validatePoolConfig, parseRouteValue, parseAllRoutes } from '../config'
import { PoolState } from '../types'

describe('pool/config', () => {
  describe('validatePoolConfig', () => {
    it('accepts valid pool', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'ollama,glm-4', weight: 1 }]
        })
      ).not.toThrow()
    })

    it('rejects pool with no targets', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: []
        })
      ).toThrow(/at least one target/)
    })

    it('rejects pool with all zero weights', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [
            { model: 'ollama,glm-4', weight: 0 },
            { model: 'ollama,qwen', weight: 0 }
          ]
        })
      ).toThrow(/at least one target with weight > 0/)
    })

    it('rejects duplicate models', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [
            { model: 'ollama,glm-4', weight: 1 },
            { model: 'ollama,glm-4', weight: 1 }
          ]
        })
      ).toThrow(/Duplicate model/)
    })

    it('rejects invalid model string', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'invalid', weight: 1 }]
        })
      ).toThrow(/expected "provider,model"/)
    })
  })

  describe('parseRouteValue', () => {
    it('preserves legacy string', () => {
      const result = parseRouteValue('default', 'ollama,glm-4')
      expect(result).toBe('ollama,glm-4')
    })

    it('converts pool config to PoolState', () => {
      const result = parseRouteValue('default', {
        strategy: 'weighted_round_robin',
        targets: [
          { model: 'ollama,glm-4', weight: 3 },
          { model: 'ollama,qwen', weight: 2 }
        ]
      }) as PoolState

      expect(result.scenario).toBe('default')
      expect(result.targets.size).toBe(2)
      expect(result.health.cooldown_ms).toBe(60000)  // default
    })

    it('applies custom health config', () => {
      const result = parseRouteValue('default', {
        strategy: 'weighted_round_robin',
        targets: [{ model: 'ollama,glm-4', weight: 1 }],
        health: { cooldown_ms: 120000 }
      }) as PoolState

      expect(result.health.cooldown_ms).toBe(120000)
      expect(result.health.recovery_interval_ms).toBe(30000)  // default
    })
  })

  describe('parseAllRoutes', () => {
    it('handles mixed legacy and pool routes', () => {
      const config = {
        default: {
          strategy: 'weighted_round_robin',
          targets: [{ model: 'ollama,glm-4', weight: 1 }]
        },
        think: 'ollama,glm-extended'
      }

      const routes = parseAllRoutes(config)

      expect(routes.get('default')).toHaveProperty('strategy')
      expect(routes.get('think')).toBe('ollama,glm-extended')
    })

    it('reports scenario on validation error', () => {
      expect(() =>
        parseAllRoutes({
          default: {
            strategy: 'weighted_round_robin',
            targets: []
          }
        })
      ).toThrow(/Invalid route config for scenario "default"/)
    })
  })
})
```

---

### Phase 3: Selection Algorithm (1.5 hours)

**File: `packages/server/src/pool/selection.ts`**

```typescript
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
  // Filter eligible targets (effective weight > 0)
  const eligibleTargets = Array.from(pool.targets.values()).filter(
    t => t.effectiveWeight > 0
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
 * - If suppressedUntil is set, use that
 * - Otherwise use lastFailureAt + cooldown_ms
 * - If neither exists, pick any (shouldn't happen)
 */
function selectFailOpen(pool: PoolState): SelectionResult {
  let earliest = Array.from(pool.targets.values())[0]

  for (const target of pool.targets.values()) {
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
): Array<{ model: string; effectiveWeight: number; isEligible: boolean }> {
  return Array.from(pool.targets.values()).map(t => ({
    model: t.model,
    effectiveWeight: t.effectiveWeight,
    isEligible: t.effectiveWeight > 0
  }))
}
```

**Task 3.1: Implement `selection.ts`**
- WRR algorithm
- Fail-open logic
- Helper functions

**Task 3.2: Write selection tests**

```typescript
// pool/__tests__/selection.test.ts
import { selectTarget, getCandidates } from '../selection'
import { PoolState, TargetState } from '../types'

function makePoolState(targets: Array<{ model: string; weight: number }>): PoolState {
  const map = new Map(
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
  })
})
```

---

### Phase 4: Health Management (2 hours)

**File: `packages/server/src/pool/health.ts`**

```typescript
import { TargetState, FailureContext, FailureType, RouteHealthConfig } from './types'

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
 */
export function applyFailure(
  target: TargetState,
  context: FailureContext,
  health: RouteHealthConfig
): void {
  const now = Date.now()

  // Set effective weight to 0
  target.effectiveWeight = 0

  // Set suppression timer
  const cooldown = health.cooldown_ms ?? 60000
  target.suppressedUntil = now + cooldown

  // Update tracking
  target.lastFailureAt = now
  target.consecutiveFailures += 1

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
  health: RouteHealthConfig
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
  const interval = health.recovery_interval_ms ?? 30000
  const step = health.recovery_step ?? 1

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
 * Optional: accelerate recovery on success
 * For MVP, just clear consecutive failures counter
 */
export function applySuccess(target: TargetState): void {
  target.lastSuccessAt = Date.now()
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
```

**Task 4.1: Implement `health.ts`**
- Failure classification
- Suppression logic
- Recovery algorithm (lazy eval)
- Helper functions

**Task 4.2: Write health tests**

```typescript
// pool/__tests__/health.test.ts
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

describe('pool/health', () => {
  describe('classifyFailure', () => {
    it('classifies 429 as failure', () => {
      expect(classifyFailure(429)).toBe('429')
    })

    it('classifies 5xx as failure', () => {
      expect(classifyFailure(500)).toBe('5xx')
      expect(classifyFailure(502)).toBe('5xx')
      expect(classifyFailure(599)).toBe('5xx')
    })

    it('classifies timeout as network', () => {
      expect(classifyFailure(undefined, 'Request timeout')).toBe('network')
    })

    it('classifies ECONNREFUSED as network', () => {
      expect(classifyFailure(undefined, 'ECONNREFUSED')).toBe('network')
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
  })

  describe('applyFailure', () => {
    it('sets effective weight to 0', () => {
      const target = makeTarget()
      const health = { cooldown_ms: 60000 }

      applyFailure(target, { type: '429' }, health)

      expect(target.effectiveWeight).toBe(0)
    })

    it('sets suppressed until', () => {
      const target = makeTarget()
      const health = { cooldown_ms: 60000 }
      const before = Date.now()

      applyFailure(target, { type: '429' }, health)

      const after = Date.now()
      expect(target.suppressedUntil).toBeGreaterThanOrEqual(before + 60000)
      expect(target.suppressedUntil).toBeLessThanOrEqual(after + 60000)
    })

    it('increments consecutive failures', () => {
      const target = makeTarget()
      const health = { cooldown_ms: 60000 }

      applyFailure(target, { type: '429' }, health)
      expect(target.consecutiveFailures).toBe(1)

      applyFailure(target, { type: '429' }, health)
      expect(target.consecutiveFailures).toBe(2)
    })
  })

  describe('updateRecovery', () => {
    it('does nothing during cooldown', () => {
      const target = makeTarget()
      const now = Date.now()
      target.suppressedUntil = now + 60000
      target.effectiveWeight = 0

      const health = { recovery_interval_ms: 30000, recovery_step: 1 }
      updateRecovery(target, health)

      expect(target.effectiveWeight).toBe(0)
    })

    it('starts recovery after cooldown', () => {
      const target = makeTarget()
      const now = Date.now()
      target.suppressedUntil = now - 1000  // cooldown expired
      target.effectiveWeight = 0

      const health = { recovery_interval_ms: 30000, recovery_step: 1 }
      updateRecovery(target, health)

      expect(target.effectiveWeight).toBeGreaterThan(0)
      expect(target.lastRecoveryStartedAt).toBeDefined()
    })

    it('restores gradually', () => {
      const target = makeTarget()
      const cooldownEnd = Date.now() - 60000  // cooldown ended 60s ago

      target.suppressedUntil = cooldownEnd
      target.effectiveWeight = 0
      target.lastRecoveryStartedAt = cooldownEnd

      // Simulate 60s of recovery with 30s interval, 1 step
      // Should have 2 steps completed
      const health = { recovery_interval_ms: 30000, recovery_step: 1 }
      updateRecovery(target, health)

      // After 60s with 30s interval = 2 steps
      expect(target.effectiveWeight).toBe(2)
    })

    it('caps at default weight', () => {
      const target = makeTarget()
      target.defaultWeight = 3
      target.suppressedUntil = Date.now() - 1000
      target.effectiveWeight = 0
      target.lastRecoveryStartedAt = Date.now() - 1000000  // very long ago

      const health = { recovery_interval_ms: 30000, recovery_step: 1 }
      updateRecovery(target, health)

      expect(target.effectiveWeight).toBe(3)  // capped at default
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

      expect(isRecovering(target)).toBe(false)
    })
  })
})
```

---

### Phase 5: Public API & State Management (1 hour)

**File: `packages/server/src/pool/index.ts`**

```typescript
import { Router } from '../utils/router'  // or wherever router config comes from
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
  context: FailureContext
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
  const failureType = classifyFailure(context.httpStatus, context.error?.message)
  if (!failureType) {
    return { suppressed: false }  // not a health failure
  }

  // Apply failure
  const prevWeight = target.effectiveWeight
  applyFailure(target, { type: failureType, ...context }, pool.health)

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
      consecutiveFailures: t.consecutiveFailures
    }))
  }
}
```

**Task 5.1: Implement `pool/index.ts`**
- Global state management
- Integration API
- Debug functions

---

### Phase 6: Router Integration (2 hours)

**File: `packages/server/src/utils/router.ts` (modifications)**

```typescript
// At top of file
import * as pool from '../pool'
import { isPoolConfig } from '../pool/types'

// In router initialization / setup
export function initializeRouter(config: any): void {
  // ... existing initialization ...

  // NEW: Initialize pools from config
  if (config.Router) {
    try {
      pool.initializePools(config.Router)
      logger.info('Pool load balancing initialized', {
        poolScenarios: pool.getPoolScenarios()
      })
    } catch (err) {
      logger.error('Failed to initialize pools', { error: err.message })
      throw err
    }
  }
}

// Modify resolveRoute to integrate pooling
export async function resolveRoute(
  scenario: string,
  request: any  // context to attach pool info
): Promise<{ provider: string; model: string }> {
  // ... existing custom router logic ...
  
  let route = Router[scenario] || Router.default

  // NEW: Check if this is a pool route
  if (typeof route === 'object' && isPoolConfig(route)) {
    try {
      const {
        target,
        selectedFrom,
        candidates
      } = pool.selectTargetFromPool(scenario)

      // Attach pool info to request for later error handling
      request.poolInfo = {
        scenario,
        selectedTarget: target.model,
        selectedFrom,
        candidates
      }

      // Log selection
      logger.info('pool_target_selected', {
        event: 'pool_target_selected',
        scenario,
        model: target.model,
        effectiveWeight: target.effectiveWeight,
        selectedFrom,
        candidates: candidates.map(c => ({
          model: c.model,
          effectiveWeight: c.effectiveWeight,
          eligible: c.isEligible
        }))
      })

      // Update recovery state (lazy eval)
      pool.updateTargetRecovery(scenario, target.model)

      return { provider: target.model.split(',')[0], model: target.model.split(',')[1] }
    } catch (err) {
      logger.error('Pool selection failed', { scenario, error: err.message })
      throw err
    }
  }

  // EXISTING: Legacy string route
  const [provider, model] = route.split(',')
  return { provider, model }
}

// NEW: Hook at error/completion time
export async function recordRouteFailure(
  request: any,
  error: any,
  httpStatus?: number
): Promise<void> {
  if (!request.poolInfo) {
    return  // not a pool route
  }

  const { scenario, selectedTarget } = request.poolInfo

  const result = pool.recordFailure(scenario, selectedTarget, {
    type: 'unknown',  // will be classified by recordFailure
    httpStatus,
    error
  })

  if (result.suppressed) {
    logger.warn('pool_target_failed', {
      event: 'pool_target_failed',
      scenario,
      model: selectedTarget,
      httpStatus,
      errorType: error?.code || 'unknown',
      suppressedUntil: result.suppressedUntil
    })
  }
}
```

**Task 6.1: Review existing router.ts**
- Find `resolveRoute` function
- Identify error handling paths
- Identify request context mechanism

**Task 6.2: Integrate pool selection**
- Modify `resolveRoute` to check for pool configs
- Call `pool.selectTargetFromPool`
- Attach metadata to request

**Task 6.3: Integrate error handling**
- Find completion/error hooks
- Call `pool.recordFailure`
- Log failures

**Task 6.4: Test integration**

```typescript
// router.integration.test.ts
import { initializeRouter, resolveRoute, recordRouteFailure } from '../router'
import * as pool from '../pool'

describe('router + pool integration', () => {
  beforeEach(() => {
    pool.resetPoolState()
  })

  it('routes through pool when configured', async () => {
    const config = {
      Router: {
        default: {
          strategy: 'weighted_round_robin',
          targets: [
            { model: 'ollama,glm-4', weight: 1 },
            { model: 'ollama,qwen', weight: 1 }
          ]
        }
      }
    }

    initializeRouter(config)

    const request: any = {}
    const route = await resolveRoute('default', request)

    expect(request.poolInfo).toBeDefined()
    expect(['glm-4', 'qwen']).toContain(route.model)
  })

  it('suppresses target on 429', async () => {
    const config = {
      Router: {
        default: {
          strategy: 'weighted_round_robin',
          targets: [
            { model: 'ollama,glm-4', weight: 1 },
            { model: 'ollama,qwen', weight: 1 }
          ]
        }
      }
    }

    initializeRouter(config)

    const request: any = {}
    await resolveRoute('default', request)
    const firstTarget = request.poolInfo.selectedTarget

    // Record 429 error
    await recordRouteFailure(request, new Error('Rate limited'), 429)

    // Next request should avoid the suppressed target
    const request2: any = {}
    await resolveRoute('default', request2)
    const secondTarget = request2.poolInfo.selectedTarget

    expect(secondTarget).not.toBe(firstTarget)
  })

  it('recovers target gradually', async () => {
    const config = {
      Router: {
        default: {
          strategy: 'weighted_round_robin',
          targets: [
            { model: 'ollama,glm-4', weight: 1 },
            { model: 'ollama,qwen', weight: 1 }
          ],
          health: {
            cooldown_ms: 100,
            recovery_interval_ms: 50,
            recovery_step: 1
          }
        }
      }
    }

    initializeRouter(config)

    // Get initial route
    const request: any = {}
    await resolveRoute('default', request)
    const target = request.poolInfo.selectedTarget

    // Fail it
    await recordRouteFailure(request, new Error('Server error'), 500)

    // Should be suppressed immediately
    await new Promise(r => setTimeout(r, 150))  // wait past cooldown

    // Trigger recovery
    const request2: any = {}
    await resolveRoute('default', request2)

    // Over time, should see it come back
    const request3: any = {}
    await new Promise(r => setTimeout(r, 100))
    await resolveRoute('default', request3)

    // Check pool debug state
    const debugInfo = pool.getPoolDebugInfo('default')
    const recoveredTarget = debugInfo.targets.find(t => t.model === target)
    expect(recoveredTarget.effectiveWeight).toBeGreaterThan(0)
  })
})
```

---

### Phase 7: Logging & Observability (0.5 hours)

**Task 7.1: Add structured logging**

Add these log events to `router.ts` and `pool/index.ts`:

```typescript
// On pool selection
logger.info({
  event: 'pool_target_selected',
  scenario: string,
  model: string,
  effectiveWeight: number,
  selectedFrom: 'healthy' | 'fail_open',
  candidates: Array<{ model, effectiveWeight, eligible }>
})

// On failure
logger.warn({
  event: 'pool_target_failed',
  scenario: string,
  model: string,
  httpStatus?: number,
  errorType: string,
  prevWeight: number,
  newWeight: 0,
  suppressedUntil: number,
  consecutiveFailures: number
})

// On recovery step
logger.debug({
  event: 'pool_target_recovery_step',
  scenario: string,
  model: string,
  prevWeight: number,
  newWeight: number,
  targetWeight: number
})

// On all targets down
logger.warn({
  event: 'pool_all_targets_unhealthy',
  scenario: string,
  policy: 'fail_open_oldest_recovery',
  selectedModel: string
})
```

**Task 7.2: Add observability function**

```typescript
// In pool/index.ts
export function getPoolStatusSummary() {
  const summary: any = {}

  for (const scenario of getPoolScenarios()) {
    const debug = getPoolDebugInfo(scenario)
    summary[scenario] = {
      totalTargets: debug.targets.length,
      healthy: debug.targets.filter(t => !t.suppressed).length,
      recovering: debug.targets.filter(t => t.recovering).length,
      failed: debug.targets.filter(t => t.suppressed).length
    }
  }

  return summary
}
```

---

### Phase 8: Tests & Validation (2 hours)

**Task 8.1: Run all unit tests**

```bash
npm test -- packages/server/src/pool/__tests__
```

Expected: 30+ passing tests

**Task 8.2: Integration test**

Create `packages/server/src/pool/__tests__/integration.test.ts` with end-to-end scenarios:
- Mixed config (string + pool)
- Failure suppression cascade
- Recovery timeline
- Fail-open behavior

**Task 8.3: Regression tests**

```bash
npm test -- packages/server/src/utils/router.test.ts
```

Ensure existing tests still pass.

**Task 8.4: Manual testing**

```bash
# Start server with config containing pools
npm start

# Check logs for pool_target_selected, etc
# Use curl to trigger failures
curl http://localhost:8000/api/...  # generates errors
tail -f /var/log/ccr.log | grep pool_
```

---

### Phase 9: Documentation (1 hour)

**Task 9.1: Update config.md**

Add section:
```markdown
## Pooled Routes

Each scenario can be either:
1. Legacy string: `"provider,model"`
2. Pool configuration:

```json
{
  "strategy": "weighted_round_robin",
  "targets": [
    { "model": "ollama,glm-4", "weight": 3 },
    { "model": "ollama,qwen", "weight": 2 }
  ],
  "health": {
    "cooldown_ms": 60000,
    "recovery_interval_ms": 30000,
    "recovery_step": 1
  }
}
```

### Behavior

- Requests are distributed by weight ratio
- Failed targets (429, 5xx, timeout) are suppressed for `cooldown_ms`
- After cooldown, targets recover gradually until reaching default weight
- If all targets suppressed, the one recovering soonest is used (fail-open)
- All state is in-memory and resets on server restart
```

**Task 9.2: Add troubleshooting section**

```markdown
## Troubleshooting Pools

Check pool status:
```bash
curl http://localhost:8000/api/pool-status
```

View logs:
```bash
tail -f /var/log/ccr.log | grep pool_
```

If all targets down:
- Check provider health
- Review cooldown settings
- Restart if stuck
```

---

## Part C: File Dependency Map

```
pool/
  ├─ types.ts (no deps)
  ├─ config.ts (dep: types)
  ├─ selection.ts (dep: types)
  ├─ health.ts (dep: types)
  ├─ index.ts (dep: config, selection, health, types)
  └─ __tests__/
      ├─ config.test.ts
      ├─ selection.test.ts
      ├─ health.test.ts
      └─ integration.test.ts

router.ts (dep: pool/index)
```

**Build order:**
1. types.ts
2. config.ts, selection.ts, health.ts (parallel)
3. index.ts
4. Update router.ts
5. Write tests
6. Integration test

---

## Part D: Git Workflow

```bash
# Start feature branch
git checkout -b feature/pool-load-balancing
git pull origin main

# Phase 1-2: Type definitions + config
git add packages/server/src/pool/types.ts
git add packages/server/src/pool/config.ts
git add packages/server/src/pool/__tests__/config.test.ts
git commit -m "feat(pool): config types and validation"

# Phase 3-4: Selection + health
git add packages/server/src/pool/selection.ts
git add packages/server/src/pool/health.ts
git add packages/server/src/pool/__tests__/selection.test.ts
git add packages/server/src/pool/__tests__/health.test.ts
git commit -m "feat(pool): selection algorithm and health management"

# Phase 5-6: Public API + integration
git add packages/server/src/pool/index.ts
git add packages/server/src/utils/router.ts
git add packages/server/src/pool/__tests__/integration.test.ts
git commit -m "feat(pool): router integration and public API"

# Phase 7-9: Logging + docs
git add packages/server/src/pool/__tests__/
git add docs/config.md
git commit -m "docs: pool configuration and troubleshooting guide"

# Push and create PR
git push origin feature/pool-load-balancing
# Create PR with link to MVP spec
```

---

## Part E: Time Estimate Breakdown

| Phase | Task | Hours | Status |
|-------|------|-------|--------|
| 0 | Setup & planning | 0.5 | |
| 1 | Type definitions | 1.0 | |
| 2 | Config validation | 1.5 | |
| 3 | Selection algorithm | 1.5 | |
| 4 | Health management | 2.0 | |
| 5 | Public API | 1.0 | |
| 6 | Router integration | 2.0 | |
| 7 | Logging | 0.5 | |
| 8 | Tests & validation | 2.0 | |
| 9 | Documentation | 1.0 | |
| | **Total** | **12.5 hours** | |

**Realistic schedule:**
- Day 1: Phases 0-4 (6 hours) → Core logic done
- Day 2: Phases 5-6 (3 hours) + tests (2 hours) → Integration complete
- Day 3: Tests (1 hour) + docs (1 hour) + polish (1 hour) → Ready for PR

---

## Part F: Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Router integration breaks existing routes | Write regression tests first, integrate incrementally, test with legacy config before pools |
| Performance regression | No loops added, O(n) selection where n=pool size (2-5 typical) |
| State leaks / memory | Module-level Map, reset on init, no leaked references |
| Logging overhead | Structured logging is fast; gated behind info/debug levels |
| Complex recovery math | Fixed schedule (no backoff), lazy evaluation (no timers), simple algorithm |

---

## Part G: Success Checklist

After implementation:

- [ ] All 30+ unit tests pass
- [ ] Integration test passes (distributed requests, failures suppressed, recovery works)
- [ ] Regression tests pass (existing routes unchanged)
- [ ] Config validation catches errors
- [ ] Pool logs are clear and useful
- [ ] Code review: no TODO comments, well-documented
- [ ] Backward compatibility verified (old config still works)
- [ ] Manual test with real config
- [ ] PR description links to spec
- [ ] Documentation merged

---

## Part H: Post-MVP Enhancements

Once merged, consider (not in scope):
- [ ] Exponential backoff on repeated failures
- [ ] Success-assisted recovery
- [ ] Persistent state (localStorage or DB)
- [ ] Background health probes
- [ ] UI dashboard for pool status
- [ ] Config hotload
- [ ] Latency-based weighting

---

