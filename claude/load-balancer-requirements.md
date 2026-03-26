# Claude Code Router: Pooled Routes & Health Suppression
## Simplified MVP Spec

**Version:** 1.0-MVP  
**Status:** Specification for implementation  
**Scope:** Load balance requests, suppress unhealthy targets, auto-recover  

---

## 1. Problem

Currently each route resolves to a single `provider,model` string. We need:
- Distribute requests across multiple backends
- Suppress backends that fail (429, 5xx, timeout/network errors)
- Automatically restore them over time
- Require zero manual intervention

---

## 2. Design Decisions (to keep scope tight)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Selection algorithm | Smooth weighted round-robin | Standard, proven, simple |
| Health state | In-memory only | No distributed state complexity |
| Recovery timing | Fixed schedule (no backoff) | Predictable, no tuning |
| Failure types | 429, 5xx, transport errors only | Simple classification, common cases |
| All targets down | Fail open to earliest recovery | Graceful degradation |
| Config hotload | Not supported (restart required) | Matches current behavior |
| Observability | Structured log events | Debugging without instrumentation |

---

## 3. Configuration: Backward Compatible

### Legacy (unchanged)
```json
{
  "Router": {
    "default": "ollama,glm-4:cloud"
  }
}
```

### New: Pooled Route
```json
{
  "Router": {
    "default": {
      "strategy": "weighted_round_robin",
      "targets": [
        { "model": "ollama,glm-4:cloud", "weight": 3 },
        { "model": "ollama,qwen3.5:35b", "weight": 2 }
      ]
    }
  }
}
```

### Optional: Health Configuration (sensible defaults)
```json
{
  "Router": {
    "default": {
      "strategy": "weighted_round_robin",
      "targets": [
        { "model": "ollama,glm-4:cloud", "weight": 3 },
        { "model": "ollama,qwen3.5:35b", "weight": 2 }
      ],
      "health": {
        "cooldown_ms": 60000,
        "recovery_interval_ms": 30000,
        "recovery_step": 1
      }
    }
  }
}
```

**Defaults for health** (if not specified):
```
cooldown_ms: 60000 (1 minute)
recovery_interval_ms: 30000 (30 seconds)
recovery_step: 1
```

---

## 4. Functional Specification

### 4.1 Config Validation at Startup

**Errors (fail startup):**
- Pool missing `strategy` or `targets`
- `strategy` is not `"weighted_round_robin"`
- `targets` is empty or has duplicate models
- Any weight < 0 or non-integer
- All targets have weight = 0
- Invalid `provider,model` string format

**Warnings (log but continue):**
- Single target pool (works but provides no failover)

### 4.2 Runtime State per Target

```typescript
type TargetState = {
  model: string                  // from config
  defaultWeight: number          // from config, never changes
  effectiveWeight: number        // runtime, can be 0 or restored
  suppressedUntil?: number       // timestamp in ms, null = not suppressed
  lastFailureAt?: number         // for recovery calculation
  consecutiveFailures: number    // for logging, not used in algorithm
}
```

State is **per-scenario-per-model**, stored in-memory in a map.

### 4.3 Selection: Weighted Round-Robin

**For each request:**

1. Resolve route normally (legacy string or pool object)
2. If pool:
   - Filter to targets where `effectiveWeight > 0`
   - Run smooth WRR selection (see algorithm below)
   - If no eligible targets: apply all-targets-down policy
3. Attach selected target to request context

**Smooth WRR algorithm** (proven, deterministic):
```
Per target, maintain currentWeight (internal accumulator).

On each selection:
  for each eligible target:
    currentWeight += effectiveWeight
  
  selected = target with max currentWeight
  selected.currentWeight -= sum(all eligible effectiveWeights)
  
  return selected
```

This ensures proportional distribution without clustering.

### 4.4 Failure Classification

**Mark target unhealthy (set effectiveWeight = 0):**
- HTTP 429 (rate limit)
- HTTP 5xx (server error)
- Network/DNS failure
- Connection refused
- Request timeout
- Stream disconnect during completion

**Do NOT mark unhealthy (continue using):**
- HTTP 400, 401, 403, 404, 422
- Malformed provider response (may be config issue, not provider health)

**Rationale:** 4xx errors are usually client misconfiguration, not transient provider failures.

### 4.5 Suppression & Recovery

**On failure:**
1. Set `effectiveWeight = 0`
2. Set `suppressedUntil = now + cooldown_ms`
3. Increment `consecutiveFailures`
4. Log `pool_target_failed` event

**Recovery (lazy evaluation on every selection):**

Check if `now >= suppressedUntil`:
- If yes, move to recovery phase
- Every `recovery_interval_ms` since recovery started, increment `effectiveWeight` by `recovery_step`
- Cap at `defaultWeight`
- Stop recovery once `effectiveWeight == defaultWeight`

**No exponential backoff** in MVP (too complex, can add later if repeated storms are a problem).

### 4.6 All Targets Suppressed

**Policy: Fail open to oldest recovery target**

If `effectiveWeight == 0` for all targets in pool:
- Select the target whose `suppressedUntil` is earliest (will recover soonest)
- Log `pool_all_targets_unhealthy` event
- Continue normal routing (do not fail the request)

---

## 5. Implementation Structure

### TypeScript Types

```typescript
// config/types.ts
type RouteTarget = {
  model: string
  weight: number
}

type RouteHealthConfig = {
  cooldown_ms?: number            // default 60000
  recovery_interval_ms?: number   // default 30000
  recovery_step?: number          // default 1
}

type RoutePoolConfig = {
  strategy: "weighted_round_robin"
  targets: RouteTarget[]
  health?: RouteHealthConfig
}

type RouteValue = string | RoutePoolConfig

// runtime/types.ts
type TargetState = {
  model: string
  defaultWeight: number
  effectiveWeight: number
  suppressedUntil?: number
  lastFailureAt?: number
  lastRecoveryStartedAt?: number
  consecutiveFailures: number
  currentWeight: number  // internal WRR accumulator
}

type PoolState = {
  scenario: string
  targets: Map<string, TargetState>
  strategy: "weighted_round_robin"
  health: RouteHealthConfig
}
```

### Core Modules

**`packages/server/src/pool/config.ts`**
- `parseRouteValue(scenario: string, value: string | RoutePoolConfig): PoolState | string`
- `validatePoolConfig(pool: RoutePoolConfig): void` (throws on error)

**`packages/server/src/pool/selection.ts`**
- `selectTarget(pool: PoolState): TargetState` (WRR + health filtering)

**`packages/server/src/pool/health.ts`**
- `classifyFailure(error, httpStatus): boolean` (true = mark unhealthy)
- `applyFailure(target: TargetState, error): void`
- `updateRecovery(target: TargetState): void` (lazy eval)

**`packages/server/src/pool/index.ts`**
- `initializePoolState(config: Record<string, RouteValue>): Map<string, PoolState>`
- `getRoute(scenario: string, customRouter?): PoolState | string`

**`packages/server/src/utils/router.ts` (modified)**
- Integrate pool selection into existing `resolveRoute` logic
- Call health.applyFailure() and health.updateRecovery() at appropriate hooks

### Logging (structured)

Add to existing pino logger:

```javascript
// On pool target selection
logger.info({
  event: "pool_target_selected",
  scenario,
  pool_size: pool.targets.size,
  selected_model,
  selected_weight: target.effectiveWeight,
  weights_before_selection: Array.from(pool.targets.values()).map(t => ({
    model: t.model,
    effective: t.effectiveWeight
  }))
})

// On failure
logger.warn({
  event: "pool_target_failed",
  scenario,
  model,
  error_type: "429" | "5xx" | "timeout" | "network",
  http_status,
  prev_effective_weight: target.effectiveWeight,
  new_effective_weight: 0,
  suppressed_until: suppressedUntil,
  consecutive_failures: target.consecutiveFailures
})

// On recovery phase start
logger.info({
  event: "pool_target_recovery_started",
  scenario,
  model,
  suppressed_for_ms: cooldown_ms,
  recovery_schedule_ms: recovery_interval_ms
})

// On recovery step
logger.debug({
  event: "pool_target_recovered_step",
  scenario,
  model,
  new_effective_weight,
  default_weight: target.defaultWeight
})

// All targets down
logger.warn({
  event: "pool_all_targets_unhealthy",
  scenario,
  policy: "fail_open_oldest_recovery",
  selected_for_recovery: earliest_target.model
})
```

---

## 6. Integration Points

### In existing `packages/server/src/utils/router.ts`

**At route resolution time:**
```typescript
function resolveRoute(scenario: string): { provider: string, model: string } {
  // ... existing custom router check ...
  
  const route = Router[scenario] || Router.default
  
  // NEW: Check if pooled
  if (typeof route === 'object' && route.strategy === 'weighted_round_robin') {
    const poolState = pools.get(scenarioKey(scenario))
    const selected = selectTarget(poolState)
    
    // Attach to request context for later failure reporting
    req.context = { ...req.context, poolTarget: selected, poolState }
    
    return selected.model.split(',')
  }
  
  // EXISTING: legacy string handling
  return route.split(',')
}
```

**At completion/error handling:**
```typescript
// When request completes or errors:
if (req.context?.poolTarget) {
  const { poolTarget, poolState } = req.context
  
  if (wasError && shouldMarkUnhealthy(error)) {
    applyFailure(poolTarget, error)
    selectTarget(poolState)  // update WRR for next request
  }
  
  // Update recovery state (lazy eval)
  updateRecovery(poolTarget)
}
```

---

## 7. Test Plan

### Unit Tests

```
pool/config.test.ts
  ✓ parse legacy string route unchanged
  ✓ parse pool config with weights
  ✓ reject pool with no targets
  ✓ reject pool with all weights = 0
  ✓ reject duplicate model in same pool
  ✓ use defaults for health config

pool/selection.test.ts
  ✓ WRR selects by weight ratio
  ✓ WRR is deterministic
  ✓ suppress target with weight = 0
  ✓ select from healthy targets only
  ✓ fail open to earliest recovery when all suppressed

pool/health.test.ts
  ✓ classify 429 as failure
  ✓ classify 5xx as failure
  ✓ classify timeout as failure
  ✓ do not classify 400/401/403 as failure
  ✓ apply failure sets effectiveWeight = 0
  ✓ apply failure sets suppressedUntil
  ✓ recovery after cooldown increases weight
  ✓ recovery caps at defaultWeight
  ✓ recovery is lazy (no background timer)
```

### Integration Tests

```
router.integration.test.ts
  ✓ request routes through pool
  ✓ failure suppresses target
  ✓ restored target gradually re-enters
  ✓ all targets suppressed → fail open
  ✓ mixed config (some string, some pool) works
  ✓ custom router + pool interaction works
  ✓ project-level override + pool works
```

### Regression Tests

```
router.regression.test.ts
  ✓ legacy string routes unchanged
  ✓ scenario routing unchanged (default, think, background, etc)
  ✓ custom router still works
  ✓ project override still works
```

---

## 8. Acceptance Criteria

- [ ] Existing single-target routes work exactly as before
- [ ] Pool routes distribute according to weights (verified in test)
- [ ] 429/5xx/timeout errors suppress target immediately
- [ ] Suppressed target not selected during cooldown
- [ ] After cooldown, target gradually recovers (step by step)
- [ ] Recovery completes when effectiveWeight == defaultWeight
- [ ] All targets suppressed → fail open to oldest recovery target
- [ ] Logs show selection, suppression, recovery, all-targets-down events
- [ ] Config startup validates; invalid config fails with clear error
- [ ] Restart resets all effectiveWeights to config defaults
- [ ] No new dependencies added (use existing logger, no external libs)

---

## 9. Non-Functional Spec

- **Performance:** O(n) per selection, where n = pool size (typically 2-5 targets)
- **Memory:** ~200 bytes per TargetState, negligible
- **Startup time:** config validation is fast
- **Determinism:** given same state, same request order yields same selections
- **State isolation:** each CCR process maintains its own health state

---

## 10. Future Enhancements (NOT in MVP)

- Exponential backoff on repeated failures
- Success-assisted recovery (accelerate on wins)
- Persistent health state across restarts
- Background periodic health probes
- UI display of pool status
- Config hotload without restart
- Per-user fairness
- Latency-based weighting

---

## 11. Migration & Rollout

**Day 1:** Deploy with all pools disabled in config (all string routes).

**Day 2:** Add one test pool to non-critical scenario, monitor logs.

**Week 1:** Expand pools based on observed health patterns.

**No breaking changes:** Old configs work as-is. Pools are opt-in.

---

## 12. Estimated Effort

- **Config & types:** 1-2 hours
- **Core selection + health:** 2-3 hours
- **Router integration:** 1-2 hours
- **Tests:** 2-3 hours
- **Logging & docs:** 1 hour

**Total:** ~8-12 hours, or 1-2 days solo.

---

## 13. Quick Reference: Default Values

```json
{
  "cooldown_ms": 60000,
  "recovery_interval_ms": 30000,
  "recovery_step": 1,
  "failure_types": ["429", "5xx", "timeout", "network"],
  "all_unhealthy_policy": "fail_open_oldest_recovery"
}
```

---

## 14. Config Example: Production Mix

```json
{
  "Router": {
    "default": {
      "strategy": "weighted_round_robin",
      "targets": [
        { "model": "ollama,glm-4:cloud", "weight": 3 },
        { "model": "ollama,qwen3.5:35b", "weight": 2 },
        { "model": "openrouter,openrouter/auto", "weight": 1 }
      ],
      "health": {
        "cooldown_ms": 120000,
        "recovery_interval_ms": 45000,
        "recovery_step": 1
      }
    },
    "think": "ollama,glm-4-extended:cloud",
    "background": {
      "strategy": "weighted_round_robin",
      "targets": [
        { "model": "ollama,gag0/glm-4.7-flash:q4_m", "weight": 1 },
        { "model": "ollama,qwen3.5-fast:1b", "weight": 1 }
      ]
    }
  }
}
```

---

## 15. Success Metrics (Observable)

- Logs show round-robin selection across targets
- Failed targets disappear from selection for cooldown duration
- Recovery logs show gradual weight increase
- Zero request failures due to all targets being down (fail-open works)
- Config validation catches errors before deployment
