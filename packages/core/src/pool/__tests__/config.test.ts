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

    it('rejects missing model field', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: '', weight: 1 }]
        })
      ).toThrow(/Invalid model format/)
    })

    it('rejects non-integer weight', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'ollama,glm-4', weight: 1.5 }]
        })
      ).toThrow(/weight must be an integer/)
    })

    it('rejects negative weight', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'ollama,glm-4', weight: -1 }]
        })
      ).toThrow(/weight must be >= 0/)
    })

    it('rejects invalid strategy', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'invalid',
          targets: [{ model: 'ollama,glm-4', weight: 1 }]
        })
      ).toThrow(/Unsupported strategy/)
    })

    it('accepts custom health config', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'ollama,glm-4', weight: 1 }],
          health: {
            cooldown_ms: 120000,
            recovery_interval_ms: 45000,
            recovery_step: 2
          }
        })
      ).not.toThrow()
    })

    it('rejects negative cooldown_ms', () => {
      expect(() =>
        validatePoolConfig({
          strategy: 'weighted_round_robin',
          targets: [{ model: 'ollama,glm-4', weight: 1 }],
          health: { cooldown_ms: -1000 }
        })
      ).toThrow(/cooldown_ms must be >= 0/)
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
      expect(result.health.recovery_interval_ms).toBe(30000)  // default
      expect(result.health.recovery_step).toBe(1)  // default
    })

    it('applies custom health config', () => {
      const result = parseRouteValue('default', {
        strategy: 'weighted_round_robin',
        targets: [{ model: 'ollama,glm-4', weight: 1 }],
        health: { cooldown_ms: 120000 }
      }) as PoolState

      expect(result.health.cooldown_ms).toBe(120000)
      expect(result.health.recovery_interval_ms).toBe(30000)  // default
      expect(result.health.recovery_step).toBe(1)  // default
    })

    it('initializes target state correctly', () => {
      const result = parseRouteValue('default', {
        strategy: 'weighted_round_robin',
        targets: [
          { model: 'ollama,glm-4', weight: 5 }
        ]
      }) as PoolState

      const target = result.targets.get('ollama,glm-4')
      expect(target).toBeDefined()
      expect(target?.model).toBe('ollama,glm-4')
      expect(target?.defaultWeight).toBe(5)
      expect(target?.effectiveWeight).toBe(5)
      expect(target?.suppressedUntil).toBeUndefined()
      expect(target?.lastFailureAt).toBeUndefined()
      expect(target?.lastRecoveryStartedAt).toBeUndefined()
      expect(target?.consecutiveFailures).toBe(0)
      expect(target?.currentWeight).toBe(0)
    })

    it('rejects invalid legacy string', () => {
      expect(() =>
        parseRouteValue('default', 'invalid')
      ).toThrow(/expected "provider,model"/)
    })

    it('rejects invalid pool config', () => {
      expect(() =>
        parseRouteValue('default', {
          strategy: 'weighted_round_robin',
          targets: []
        })
      ).toThrow(/Invalid route config/)
    })
  })

  describe('parseAllRoutes', () => {
    it('handles mixed legacy and pool routes', () => {
      const config = {
        default: {
          strategy: 'weighted_round_robin' as const,
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

    it('handles empty router config', () => {
      const routes = parseAllRoutes({})
      expect(routes.size).toBe(0)
    })

    it('handles all pool routes', () => {
      const config = {
        default: {
          strategy: 'weighted_round_robin' as const,
          targets: [{ model: 'ollama,glm-4', weight: 3 }]
        },
        background: {
          strategy: 'weighted_round_robin' as const,
          targets: [
            { model: 'ollama,gag0/glm-4.7-flash:q4_m', weight: 1 },
            { model: 'ollama,qwen3.5-fast:1b', weight: 1 }
          ]
        }
      }

      const routes = parseAllRoutes(config)
      expect(routes.size).toBe(2)
      expect(routes.get('default')).toHaveProperty('strategy')
      expect(routes.get('background')).toHaveProperty('strategy')
    })
  })
})