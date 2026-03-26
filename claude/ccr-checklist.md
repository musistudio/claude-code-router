# Claude Code Router: Implementation Checklist

## Day 1: Core Logic (6 hours)

### Morning: Setup & Foundations (2 hours)

- [ ] Create feature branch
  ```bash
  cd ~/dev/my/claude-code-router
  git checkout -b feature/pool-load-balancing
  git pull origin main
  mkdir -p packages/server/src/pool/__tests__
  ```

- [ ] Review existing router.ts structure
  - [ ] Find `resolveRoute()` function signature
  - [ ] Identify request context mechanism
  - [ ] Note error handling paths
  - [ ] Check how scenarios are resolved

- [ ] Create `packages/server/src/pool/types.ts`
  - [ ] Define `RouteTarget`, `RoutePoolConfig`, `RouteValue`
  - [ ] Define `TargetState`, `PoolState`
  - [ ] Define `FailureType`, `FailureContext`
  - [ ] Add `isPoolConfig()` type guard
  - [ ] Add JSDoc comments
  - [ ] ~150 lines

- [ ] **Commit:** `feat(pool): config and runtime type definitions`

### Midday: Config Validation (2 hours)

- [ ] Create `packages/server/src/pool/config.ts`
  - [ ] Implement `validatePoolConfig()`
  - [ ] Implement `validateModelString()`
  - [ ] Implement `parseRouteValue()`
  - [ ] Implement `parseAllRoutes()`
  - [ ] Error messages for all validation rules
  - [ ] ~250 lines

- [ ] Create `packages/server/src/pool/__tests__/config.test.ts`
  - [ ] Test valid pool acceptance
  - [ ] Test invalid schema rejection (empty targets, duplicate models, bad weights)
  - [ ] Test legacy string preservation
  - [ ] Test default health config merging
  - [ ] ~80 lines, ~12 test cases
  
- [ ] Run tests: `npm test -- pool/__tests__/config.test.ts`
  - [ ] All pass ✓

- [ ] **Commit:** `feat(pool): config parsing and validation`

### Afternoon: Selection Algorithm (2 hours)

- [ ] Create `packages/server/src/pool/selection.ts`
  - [ ] Implement `selectTarget()` - smooth WRR
  - [ ] Implement `selectFailOpen()`
  - [ ] Implement helper functions (getRecoveryTime, getCandidates)
  - [ ] ~150 lines

- [ ] Create `packages/server/src/pool/__tests__/selection.test.ts`
  - [ ] Test WRR distribution by weight
  - [ ] Test determinism
  - [ ] Test weight 0 filtering
  - [ ] Test fail-open policy
  - [ ] ~100 lines, ~10 test cases

- [ ] Run tests: `npm test -- pool/__tests__/selection.test.ts`
  - [ ] All pass ✓

- [ ] **Commit:** `feat(pool): weighted round-robin selection`

---

## Day 2: Integration & Health (5 hours)

### Morning: Health Management (2 hours)

- [ ] Create `packages/server/src/pool/health.ts`
  - [ ] Implement `classifyFailure()` - 429, 5xx, timeout, network
  - [ ] Implement `applyFailure()` - suppress + mark
  - [ ] Implement `updateRecovery()` - lazy eval, time-based
  - [ ] Implement helper functions (isSuppressed, isRecovering, getTimeUntilEligible)
  - [ ] ~200 lines

- [ ] Create `packages/server/src/pool/__tests__/health.test.ts`
  - [ ] Test failure classification (429, 5xx, timeout, ignore 4xx)
  - [ ] Test suppression (weight to 0, timer set)
  - [ ] Test recovery phases (cooldown, restoration)
  - [ ] Test helper functions
  - [ ] ~120 lines, ~15 test cases

- [ ] Run tests: `npm test -- pool/__tests__/health.test.ts`
  - [ ] All pass ✓

- [ ] **Commit:** `feat(pool): health classification and recovery`

### Midday: Public API (1.5 hours)

- [ ] Create `packages/server/src/pool/index.ts`
  - [ ] Global `poolStore` Map
  - [ ] `initializePools()` - startup hook
  - [ ] `selectTargetFromPool()` - selection API
  - [ ] `recordFailure()` - failure hook
  - [ ] `updateTargetRecovery()` - recovery API
  - [ ] `resetPoolState()` - testing utility
  - [ ] `getPoolDebugInfo()` - observability
  - [ ] ~200 lines

- [ ] **Commit:** `feat(pool): public API and state management`

### Afternoon: Router Integration (1.5 hours)

- [ ] Modify `packages/server/src/utils/router.ts`
  - [ ] Add imports: `pool`, `isPoolConfig`
  - [ ] Add `initializeRouter()` call to initialize pools from config
  - [ ] Modify `resolveRoute()` to handle pool configs
  - [ ] Add pool info to request context for error handling
  - [ ] Add logging for selections
  - [ ] Implement `recordRouteFailure()` hook
  - [ ] Add logging for failures
  - [ ] ~100 lines added

- [ ] Create `packages/server/src/pool/__tests__/integration.test.ts`
  - [ ] Test pool route selection
  - [ ] Test failure suppression cascade
  - [ ] Test gradual recovery
  - [ ] Test fail-open on all suppressed
  - [ ] Test mixed config (string + pool)
  - [ ] ~150 lines, ~8 test cases

- [ ] Run all tests: `npm test -- pool/`
  - [ ] All 40+ tests pass ✓

- [ ] **Commit:** `feat(pool): router integration`

---

## Day 3: Testing, Docs & Polish (3 hours)

### Morning: Testing & Validation (1.5 hours)

- [ ] Run full test suite
  ```bash
  npm test -- packages/server/src/utils/router.test.ts
  npm test -- packages/server/src/pool/__tests__
  ```
  - [ ] Regression tests pass (existing routes unchanged)
  - [ ] All new tests pass (40+)
  - [ ] Coverage > 80%

- [ ] Manual testing
  - [ ] Create test config with pools
  - [ ] Start server: `npm start`
  - [ ] Send requests to routes
  - [ ] Check logs for `pool_target_selected`
  - [ ] Verify distribution pattern
  - [ ] Trigger failures (429, 500)
  - [ ] Verify suppression in logs
  - [ ] Wait and verify recovery

- [ ] Edge case validation
  - [ ] Single target pool works
  - [ ] All zero weights rejected at startup
  - [ ] Duplicate models rejected at startup
  - [ ] Invalid model string rejected
  - [ ] Bad health config rejected

### Midday: Documentation (1 hour)

- [ ] Update `docs/config.md` or similar
  - [ ] Add pooled routes section
  - [ ] Add example config
  - [ ] Document health settings
  - [ ] Document behavior (distribution, suppression, recovery)
  - [ ] Add troubleshooting section

- [ ] Add code comments
  - [ ] JSDoc on all public functions
  - [ ] Algorithm explanation (WRR, recovery)
  - [ ] Edge cases noted

- [ ] Update README or docs
  - [ ] Link to new pool feature
  - [ ] Quick start example

### Afternoon: Final Polish (0.5 hours)

- [ ] Code review yourself
  - [ ] No console.log (use logger)
  - [ ] No TODO/FIXME (unless documented)
  - [ ] Types are complete
  - [ ] No unused imports
  - [ ] Error messages are helpful

- [ ] Clean up
  - [ ] Remove any test-only code
  - [ ] Verify no breaking changes
  - [ ] Ensure backward compatibility

- [ ] **Commit:** `docs: pool configuration and troubleshooting guide`

### Final: Prepare PR

- [ ] Push branch
  ```bash
  git push origin feature/pool-load-balancing
  ```

- [ ] Create PR with:
  - [ ] Description linking to MVP spec
  - [ ] List of acceptance criteria (all checked ✓)
  - [ ] Test results
  - [ ] Known limitations / future work
  - [ ] Manual test evidence (log samples)

- [ ] Checklist items to mention:
  - [ ] ✓ Existing routes unchanged (regression pass)
  - [ ] ✓ Pools distribute by weight
  - [ ] ✓ 429/5xx/timeout → suppressed
  - [ ] ✓ Suppressed target not selected during cooldown
  - [ ] ✓ Recovery gradual (time-based steps)
  - [ ] ✓ All suppressed → fail-open to earliest recovery
  - [ ] ✓ Logs show selection, suppression, recovery
  - [ ] ✓ Config validation at startup
  - [ ] ✓ State resets on restart
  - [ ] ✓ No new dependencies

---

## Testing Checklist

### Unit Tests

- [ ] **config.test.ts** (12 tests)
  - [ ] Valid pool
  - [ ] Empty targets
  - [ ] All zero weights
  - [ ] Duplicate models
  - [ ] Invalid model string
  - [ ] Bad weight type
  - [ ] Legacy string
  - [ ] Custom health config
  - [ ] Default health config
  - [ ] parseAllRoutes mixed config
  - [ ] Validation error messages
  - [ ] Edge cases

- [ ] **selection.test.ts** (10 tests)
  - [ ] WRR by weight ratio
  - [ ] Determinism
  - [ ] Exclude weight 0
  - [ ] All zero filtered
  - [ ] Fail-open selects earliest
  - [ ] Candidates report
  - [ ] Large pool performance
  - [ ] Single target

- [ ] **health.test.ts** (15 tests)
  - [ ] 429 failure
  - [ ] 5xx failure
  - [ ] Timeout failure
  - [ ] Network failure
  - [ ] 400 ignored
  - [ ] 401 ignored
  - [ ] 403 ignored
  - [ ] 404 ignored
  - [ ] Apply failure sets weight 0
  - [ ] Apply failure sets timer
  - [ ] Recovery phases
  - [ ] Gradual restoration
  - [ ] Cap at default
  - [ ] isSuppressed
  - [ ] isRecovering

### Integration Tests

- [ ] **integration.test.ts** (8 tests)
  - [ ] Pool selection works
  - [ ] Distribution ratio
  - [ ] Failure suppression
  - [ ] Recovery timeline
  - [ ] Fail-open behavior
  - [ ] Mixed config (string + pool)
  - [ ] Custom router + pool
  - [ ] Project override + pool

### Regression Tests

- [ ] Existing router tests pass
- [ ] Legacy string routes unchanged
- [ ] Custom router still works
- [ ] Project-level override still works
- [ ] No performance degradation

---

## Logging Checkpoints

After each major section, verify logging:

```bash
# After config parsing
npm test -- pool/__tests__/config.test.ts
# ✓ No warnings

# After selection
npm test -- pool/__tests__/selection.test.ts
# ✓ Deterministic results

# After health
npm test -- pool/__tests__/health.test.ts
# ✓ Correct state transitions

# After integration
npm start &
curl http://localhost:8000/...
tail -f /var/log/ccr.log | grep pool_
# ✓ See: pool_target_selected events
# ✓ See: pool_target_failed events (when appropriate)
# ✓ See: recovery steps (after waiting)
```

---

## File Size Expectations

| File | LOC | Tests | Status |
|------|-----|-------|--------|
| types.ts | 150 | — | |
| config.ts | 250 | 80 | |
| selection.ts | 150 | 100 | |
| health.ts | 200 | 120 | |
| index.ts | 200 | — | |
| router.ts (changes) | +100 | — | |
| **Total** | **~1050** | **~400** | |

Expectation: Tight, focused code. No bloat.

---

## Git Commits Summary

```
feat(pool): config and runtime type definitions
feat(pool): config parsing and validation
feat(pool): weighted round-robin selection
feat(pool): health classification and recovery
feat(pool): public API and state management
feat(pool): router integration
docs: pool configuration and troubleshooting guide
```

**PR Title:** `feat: add pooled route load balancing with health suppression and recovery`

---

## Quick Reference: Key Functions

### config.ts
- `validatePoolConfig()` - throws on bad config
- `parseRouteValue()` - converts config to PoolState or legacy string
- `parseAllRoutes()` - parses all router scenarios

### selection.ts
- `selectTarget()` - WRR selection, returns { target, selectedFrom }
- `getCandidates()` - list of targets with eligibility

### health.ts
- `classifyFailure()` - maps error to FailureType or null
- `applyFailure()` - marks target suppressed
- `updateRecovery()` - advances recovery state (lazy eval)
- `isSuppressed()` - boolean check
- `isRecovering()` - boolean check

### pool/index.ts
- `initializePools()` - startup, parse config
- `selectTargetFromPool()` - route selection hook
- `recordFailure()` - error handling hook
- `getPoolDebugInfo()` - observability

### router.ts (modified)
- `resolveRoute()` - add pool selection
- `recordRouteFailure()` - add failure hook

---

## Common Pitfalls to Avoid

- [ ] Don't forget to update recovery state on every selection (lazy eval)
- [ ] Don't start recovery until cooldown expires
- [ ] Don't use background timers (use lazy eval instead)
- [ ] Don't treat all 4xx as health failures (only 429)
- [ ] Don't fail requests when all targets down (fail open instead)
- [ ] Don't reset state when target recovers (time-based only)
- [ ] Don't store request-specific state in PoolState (use request context)
- [ ] Don't forget backward compatibility (legacy strings must work)
- [ ] Don't change existing log format (extend, don't replace)
- [ ] Don't add new npm dependencies (none needed)

---

## Success Metrics

At end of Day 3:
- [ ] ✓ 40+ tests passing
- [ ] ✓ 0 regressions
- [ ] ✓ Config validates correctly
- [ ] ✓ Pools distribute by weight
- [ ] ✓ Failures suppressed immediately
- [ ] ✓ Recovery is gradual and time-based
- [ ] ✓ Logs are clear and useful
- [ ] ✓ Code is clean, documented, reviewed
- [ ] ✓ PR ready for merge
- [ ] ✓ Backward compatible (existing configs unchanged)

---

