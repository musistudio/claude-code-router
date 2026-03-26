# CCR Pool Implementation: Code Templates

Ready-to-use boilerplate. Copy, fill in blanks, adapt as needed.

---

## 1. types.ts - Complete Template

```typescript
// packages/server/src/pool/types.ts

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

/**
 * Type guard to check if value is a pool config (not legacy string)
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
 * Runtime types (mutable, process-local, in-memory only)
 */

export type TargetState = {
  model: string                  // from config, never changes
  defaultWeight: number          // from config, static
  effectiveWeight: number        // runtime mutable, 0 if suppressed
  suppressedUntil?: number       // timestamp ms, undefined = not suppressed
  lastFailureAt?: number         // timestamp ms of last failure
  lastRecoveryStartedAt?: number // timestamp ms when entered recovery phase
  consecutiveFailures: number    // counter for logging
  currentWeight: number          // internal WRR accumulator
}

export type PoolState = {
  scenario: string                           // e.g., 'default', 'think'
  targets: Map<string, TargetState>         // keyed by model string
  strategy: 'weighted_round_robin'
  health: Required<RouteHealthConfig>       // defaults applied
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

---

## 2. config.ts - Complete Template

```typescript
// packages/server/src/pool/config.ts

import {
  RouteValue,
  RoutePoolConfig,
  RouteHealthConfig,
  PoolState,
  TargetState,
  isPoolConfig
} from './types'

const DEFAULT_HEALTH_CONFIG: Required<RouteHealthConfig> = {
  cooldown_ms: 60000,
  recovery_interval_ms: 30000,
  recovery_step: 1
}

/**
 * Validate "provider,model" format
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
 * Validate RoutePoolConfig structure and values
 */
export function validatePoolConfig(pool: RoutePoolConfig): void {
  // Strategy
  if (!pool.strategy) {
    throw new Error('Pool missing required field: strategy')
  }
  if (pool.strategy !== 'weighted_round_robin') {
    throw new Error(`Unsupported strategy: "${pool.strategy}"`)
  }

  // Targets array
  if (!Array.isArray(pool.targets)) {
    throw new Error('Pool.targets must be an array')
  }
  if (pool.targets.length === 0) {
    throw new Error('Pool must have at least one target')
  }

  // Validate each target
  const seenModels = new Set<string>()
  let hasPositiveWeight = false

  for (let i = 0; i < pool.targets.length; i++) {
    const target = pool.targets[i]

    // Model format
    if (!target.model) {
      throw new Error(`Target[${i}]: missing required field "model"`)
    }
    validateModelString(target.model)

    // Weight type and value
    if (typeof target.weight !== 'number' || !Number.isInteger(target.weight)) {
      throw new Error(
        `Target[${i}] (${target.model}): weight must be integer, got ${target.weight}`
      )
    }
    if (target.weight < 0) {
      throw new Error(
        `Target[${i}] (${target.model}): weight must be >= 0, got ${target.weight}`
      )
    }

    // Duplicate check
    if (seenModels.has(target.model)) {
      throw new Error(
        `Duplicate model in pool: "${target.model}"`
      )
    }
    seenModels.add(target.model)

    // Track if any weight > 0
    if (target.weight > 0) {
      hasPositiveWeight = true
    }
  }

  if (!hasPositiveWeight) {
    throw new Error('Pool must have at least one target with weight > 0')
  }

  // Health config
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
 * Parse single route value: legacy string → string, pool → PoolState
 */
export function parseRouteValue(
  scenario: string,
  value: RouteValue
): PoolState | string {
  // Legacy string format
  if (typeof value === 'string') {
    validateModelString(value)
    return value
  }

  // Pool config
  if (isPoolConfig(value)) {
    validatePoolConfig(value)

    const health = {
      ...DEFAULT_HEALTH_CONFIG,
      ...(value.health || {})
    }

    const targets = new Map<string, TargetState>(
      value.targets.map(target => [
        target.model,
        {
          model: target.model,
          defaultWeight: target.weight,
          effectiveWeight: target.weight,  // starts at default
          suppressedUntil: undefined,
          lastFailureAt: undefined,
          lastRecoveryStartedAt: undefined,
          consecutiveFailures: 0,
          currentWeight: 0  // WRR accumulator
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
    `Invalid route value for scenario "${scenario}": ` +
    `expected string or pool object, got ${typeof value}`
  )
}

/**
 * Parse entire Router config (all scenarios)
 */
export function parseAllRoutes(
  routerConfig: Record<string, RouteValue>
): Map<string, PoolState | string> {
  const result = new Map<string, PoolState | string>()

  for (const [scenario, value] of Object.entries(routerConfig)) {
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
```

---

## 3. selection.ts - Complete Template

```typescript
// packages/server/src/pool/selection.ts

import { PoolState, TargetState, SelectionResult } from './types'

/**
 * Smooth weighted round-robin selection
 *
 * Algorithm:
 * 1. For each eligible target (effectiveWeight > 0):
 *    - Increment currentWeight by effectiveWeight
 * 2. Select the target with highest currentWeight
 * 3. Decrease selected's currentWeight by sum of all eligible effectiveWeights
 *
 * This ensures proportional distribution without bursting.
 * See: https://en.wikipedia.org/wiki/Weighted_round_robin#Smooth_weighted_round-robin_scheduling
 */
export function selectTarget(pool: PoolState): SelectionResult {
  // Filter: only targets with effectiveWeight > 0
  const eligibleTargets = Array.from(pool.targets.values()).filter(
    t => t.effectiveWeight > 0
  )

  // All targets suppressed: fail-open
  if (eligibleTargets.length === 0) {
    return selectFailOpen(pool)
  }

  // WRR: increment currentWeight for each eligible target
  for (const target of eligibleTargets) {
    target.currentWeight += target.effectiveWeight
  }

  // Select: pick target with max currentWeight
  let selected = eligibleTargets[0]
  for (const target of eligibleTargets.slice(1)) {
    if (target.currentWeight > selected.currentWeight) {
      selected = target
    }
  }

  // Decrement: subtract sum of weights from selected's accumulator
  const sumWeights = eligibleTargets.reduce(
    (sum, t) => sum + t.effectiveWeight,
    0
  )
  selected.currentWeight -= sumWeights

  return {
    target: selected,
    selectedFrom: 'healthy'
  }
}

/**
 * Fail-open: select target that will recover soonest
 * (suppressedUntil is earliest in the future)
 */
function selectFailOpen(pool: PoolState): SelectionResult {
  const targets = Array.from(pool.targets.values())
  
  let selectedTarget = targets[0]
  let earliestRecovery = getRecoveryTime(selectedTarget, pool.health.cooldown_ms)

  for (const target of targets.slice(1)) {
    const recovery = getRecoveryTime(target, pool.health.cooldown_ms)
    if (recovery < earliestRecovery) {
      selectedTarget = target
      earliestRecovery = recovery
    }
  }

  return {
    target: selectedTarget,
    selectedFrom: 'fail_open'
  }
}

/**
 * Get timestamp when target will be eligible for normal selection
 */
function getRecoveryTime(target: TargetState, cooldownMs: number): number {
  if (target.suppressedUntil !== undefined) {
    return target.suppressedUntil
  }
  if (target.lastFailureAt !== undefined) {
    return target.lastFailureAt + cooldownMs
  }
  return 0
}

/**
 * Get list of candidates for logging/observability
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

---

## 4. health.ts - Complete Template

```typescript
// packages/server/src/pool/health.ts

import {
  TargetState,
  FailureContext,
  FailureType,
  RouteHealthConfig
} from './types'

/**
 * Classify error into health-relevant failure type
 * Returns null if not a transient provider issue (e.g., client error)
 */
export function classifyFailure(
  httpStatus?: number,
  errorMessage?: string
): FailureType | null {
  // 429: rate limit
  if (httpStatus === 429) {
    return '429'
  }

  // 5xx: server error
  if (httpStatus && httpStatus >= 500 && httpStatus < 600) {
    return '5xx'
  }

  // Network/transport errors
  if (errorMessage) {
    const msg = errorMessage.toLowerCase()
    if (
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('enetunreach') ||
      msg.includes('network') ||
      msg.includes('socket')
    ) {
      return 'network'
    }
  }

  // 4xx errors (except 429): do not mark as health failure
  // (usually client misconfiguration, not provider outage)
  return null
}

/**
 * Apply failure: mark target suppressed and update state
 */
export function applyFailure(
  target: TargetState,
  context: FailureContext,
  health: RouteHealthConfig
): void {
  const now = Date.now()
  const cooldown = health.cooldown_ms ?? 60000

  // Mark unhealthy
  target.effectiveWeight = 0
  target.suppressedUntil = now + cooldown
  target.lastFailureAt = now
  target.consecutiveFailures += 1

  // Note: recovery phase will start after cooldown expires, on next access
}

/**
 * Update recovery state (call on every selection)
 *
 * Phases:
 * 1. Suppression: while now < suppressedUntil, do nothing (weight stays 0)
 * 2. Recovery: after cooldown, gradually increase weight until reaching default
 *
 * Recovery is purely time-based and lazy (no background timers).
 */
export function updateRecovery(
  target: TargetState,
  health: RouteHealthConfig
): void {
  const now = Date.now()
  const cooldown = health.cooldown_ms ?? 60000
  const interval = health.recovery_interval_ms ?? 30000
  const step = health.recovery_step ?? 1

  // Phase 1: Suppressed
  if (target.suppressedUntil !== undefined && now < target.suppressedUntil) {
    return  // still suppressed, do nothing
  }

  // Phase 1→2 transition: cooldown just ended, start recovery
  if (
    target.suppressedUntil !== undefined &&
    target.lastRecoveryStartedAt === undefined
  ) {
    target.lastRecoveryStartedAt = now
    target.effectiveWeight = 0  // explicitly set to 0 to start recovery
  }

  // Phase 2: Recovery
  if (target.lastRecoveryStartedAt !== undefined) {
    const elapsedMs = now - target.lastRecoveryStartedAt
    const stepsCompleted = Math.floor(elapsedMs / interval)
    const newWeight = Math.min(
      target.defaultWeight,
      stepsCompleted * step
    )

    target.effectiveWeight = newWeight

    // Recovery complete: back to default
    if (target.effectiveWeight >= target.defaultWeight) {
      target.effectiveWeight = target.defaultWeight
      target.lastRecoveryStartedAt = undefined
      target.consecutiveFailures = 0
    }
  }
}

/**
 * Record success (optional, for future enhancements)
 */
export function applySuccess(target: TargetState): void {
  target.lastSuccessAt = Date.now()
  // Note: In MVP, success does not accelerate recovery (purely time-based)
}

/**
 * Check if target is currently suppressed
 */
export function isSuppressed(
  target: TargetState,
  now: number = Date.now()
): boolean {
  return target.suppressedUntil !== undefined && now < target.suppressedUntil
}

/**
 * Check if target is in active recovery phase
 */
export function isRecovering(target: TargetState): boolean {
  return (
    target.lastRecoveryStartedAt !== undefined &&
    target.effectiveWeight < target.defaultWeight
  )
}

/**
 * Time until target is eligible for selection again (for logging)
 */
export function getTimeUntilEligible(
  target: TargetState,
  now: number = Date.now()
): number {
  if (target.suppressedUntil !== undefined && now < target.suppressedUntil) {
    return target.suppressedUntil - now
  }
  return 0
}
```

---

## 5. pool/index.ts - Complete Template

```typescript
// packages/server/src/pool/index.ts

import { RouteValue, PoolState, TargetState, FailureContext } from './types'
import { parseAllRoutes } from './config'
import { selectTarget, getCandidates } from './selection'
import { applyFailure, updateRecovery, classifyFailure } from './health'

/**
 * Global in-memory pool state store
 * Keyed by scenario name (e.g., 'default', 'think', 'background')
 */
const poolStore = new Map<string, PoolState>()

/**
 * Initialize pools from router config at startup
 * Throws if config is invalid
 */
export function initializePools(routerConfig: Record<string, RouteValue>): void {
  const parsed = parseAllRoutes(routerConfig)

  for (const [scenario, route] of parsed) {
    if (typeof route === 'object') {
      poolStore.set(scenario, route)
    }
    // Legacy string routes are not stored (handled directly in router)
  }
}

/**
 * Get pool state for scenario, or null if not a pool
 */
export function getPoolState(scenario: string): PoolState | null {
  return poolStore.get(scenario) ?? null
}

/**
 * Get list of all pool scenarios
 */
export function getPoolScenarios(): string[] {
  return Array.from(poolStore.keys())
}

/**
 * Select target from pool
 * Used by router at selection time
 */
export function selectTargetFromPool(scenario: string) {
  const pool = poolStore.get(scenario)
  if (!pool) {
    throw new Error(`No pool configured for scenario: ${scenario}`)
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
 * Returns { suppressed: boolean, suppressedUntil?: number }
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

  // Classify if this is a health failure
  const failureType = classifyFailure(context.httpStatus, context.error?.message)
  if (!failureType) {
    return { suppressed: false }  // not a transient failure
  }

  // Apply suppression
  applyFailure(target, { type: failureType, ...context }, pool.health)

  return {
    suppressed: true,
    suppressedUntil: target.suppressedUntil
  }
}

/**
 * Update recovery state for target
 * Call on every selection or periodically
 */
export function updateTargetRecovery(scenario: string, model: string): void {
  const pool = poolStore.get(scenario)
  if (!pool) return

  const target = pool.targets.get(model)
  if (!target) return

  updateRecovery(target, pool.health)
}

/**
 * Reset all pools to initial state
 * Used for testing or manual reset
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
 * Export runtime state for debugging/observability
 */
export function getPoolDebugInfo(scenario: string) {
  const pool = poolStore.get(scenario)
  if (!pool) return null

  const now = Date.now()

  return {
    scenario,
    strategy: pool.strategy,
    health: pool.health,
    targets: Array.from(pool.targets.values()).map(t => ({
      model: t.model,
      defaultWeight: t.defaultWeight,
      effectiveWeight: t.effectiveWeight,
      suppressed: t.suppressedUntil !== undefined && t.suppressedUntil > now,
      recovering: t.lastRecoveryStartedAt !== undefined,
      consecutiveFailures: t.consecutiveFailures
    }))
  }
}

/**
 * Get summary of all pools
 */
export function getPoolStatusSummary() {
  const summary: Record<string, any> = {}

  for (const scenario of getPoolScenarios()) {
    const debug = getPoolDebugInfo(scenario)
    if (debug) {
      summary[scenario] = {
        totalTargets: debug.targets.length,
        healthy: debug.targets.filter(t => !t.suppressed && !t.recovering).length,
        recovering: debug.targets.filter(t => t.recovering).length,
        suppressed: debug.targets.filter(t => t.suppressed).length
      }
    }
  }

  return summary
}
```

---

## 6. Router Integration Snippet

```typescript
// packages/server/src/utils/router.ts

// ADD IMPORTS
import * as pool from '../pool'
import { isPoolConfig } from '../pool/types'

// MODIFY: Add initialization hook
export function initializeRouter(config: any): void {
  // ... existing code ...

  if (config.Router) {
    try {
      pool.initializePools(config.Router)
      logger.info('Initialized pool load balancing', {
        poolScenarios: pool.getPoolScenarios()
      })
    } catch (err: any) {
      logger.error('Failed to initialize pools', { error: err.message })
      throw err
    }
  }
}

// MODIFY: Update resolveRoute to handle pools
export async function resolveRoute(
  scenario: string,
  request: any
): Promise<{ provider: string; model: string }> {
  // ... existing custom router logic ...

  let route = Router[scenario] || Router.default

  // NEW: Pool route handling
  if (typeof route === 'object' && isPoolConfig(route)) {
    try {
      const { target, selectedFrom, candidates } = pool.selectTargetFromPool(scenario)

      // Attach pool metadata to request for error handling
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

      const [provider, modelName] = target.model.split(',')
      return { provider, model: modelName }
    } catch (err: any) {
      logger.error('Pool selection failed', { scenario, error: err.message })
      throw err
    }
  }

  // EXISTING: Legacy string handling
  const [provider, modelName] = route.split(',')
  return { provider, model: modelName }
}

// NEW: Add failure recording hook
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

// CALL in error path:
// try {
//   await executeRequest(...)
// } catch (err) {
//   await recordRouteFailure(request, err, err.statusCode)
//   throw err
// }
```

---

## 7. Test Template: config.test.ts

```typescript
// packages/server/src/pool/__tests__/config.test.ts

import {
  validatePoolConfig,
  parseRouteValue,
  parseAllRoutes
} from '../config'
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

    it('rejects missing strategy', () => {
      expect(() =>
        validatePoolConfig({
          strategy: undefined as any,
          targets: [{ model: 'ollama,glm-4', weight: 1 }]
        })
      ).toThrow(/missing required field/)
    })

    it('rejects empty targets', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: []
        })
      ).toThrow(/at least one target/)
    })

    it('rejects all zero weights', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [
            { model: 'a,b', weight: 0 },
            { model: 'c,d', weight: 0 }
          ]
        })
      ).toThrow(/at least one target with weight > 0/)
    })

    it('rejects duplicate models', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [
            { model: 'a,b', weight: 1 },
            { model: 'a,b', weight: 1 }
          ]
        })
      ).toThrow(/Duplicate model/)
    })

    it('rejects invalid model format', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'invalid', weight: 1 }]
        })
      ).toThrow(/expected "provider,model"/)
    })

    it('rejects negative weight', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'a,b', weight: -1 }]
        })
      ).toThrow(/weight must be >= 0/)
    })

    it('rejects non-integer weight', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'a,b', weight: 1.5 }]
        })
      ).toThrow(/weight must be integer/)
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
      expect(result.strategy).toBe('weighted_round_robin')
      expect(result.targets.size).toBe(2)
    })

    it('initializes targets with default weight', () => {
      const result = parseRouteValue('default', {
        strategy: 'weighted_round_robin',
        targets: [{ model: 'a,b', weight: 5 }]
      }) as PoolState

      const target = result.targets.get('a,b')!
      expect(target.defaultWeight).toBe(5)
      expect(target.effectiveWeight).toBe(5)
      expect(target.consecutiveFailures).toBe(0)
    })

    it('merges health config with defaults', () => {
      const result = parseRouteValue('default', {
        strategy: 'weighted_round_robin',
        targets: [{ model: 'a,b', weight: 1 }],
        health: { cooldown_ms: 120000 }
      }) as PoolState

      expect(result.health.cooldown_ms).toBe(120000)
      expect(result.health.recovery_interval_ms).toBe(30000)  // default
      expect(result.health.recovery_step).toBe(1)  // default
    })
  })

  describe('parseAllRoutes', () => {
    it('handles mixed string and pool routes', () => {
      const config = {
        default: {
          strategy: 'weighted_round_robin',
          targets: [{ model: 'a,b', weight: 1 }]
        },
        think: 'c,d'
      }

      const routes = parseAllRoutes(config)

      expect(routes.get('default')).toHaveProperty('strategy')
      expect(routes.get('think')).toBe('c,d')
    })

    it('reports scenario in error message', () => {
      expect(() =>
        parseAllRoutes({
          myScenario: {
            strategy: 'weighted_round_robin',
            targets: []
          }
        })
      ).toThrow(/Invalid route config for scenario "myScenario"/)
    })
  })
})
```

---

## Quick Copy-Paste Checklist

```bash
# 1. Create files
touch packages/server/src/pool/{types,config,selection,health,index}.ts
touch packages/server/src/pool/__tests__/{config,selection,health,integration}.test.ts

# 2. Copy templates into each file (sections 1-6 above)

# 3. Install/check dependencies (none needed)
npm list | grep -E "typescript|jest"

# 4. Test structure
npm test -- packages/server/src/pool/__tests__/config.test.ts

# 5. Integrate router
# (modify packages/server/src/utils/router.ts per section 6)

# 6. Run all tests
npm test -- packages/server/src/pool/
npm test -- packages/server/src/utils/router.test.ts

# 7. Commit
git add packages/server/src/pool/
git commit -m "feat(pool): load balancing with health management"
```

---

