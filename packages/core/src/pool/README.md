# Pool Load Balancing

This module provides **weighted round-robin load balancing** with **health-based failover** for routing requests across multiple LLM providers.

## Features

- **Weighted Round-Robin**: Distribute requests proportionally based on target weights
- **Health Suppression**: Automatically suppress failing targets with exponential backoff
- **Gradual Recovery**: Restore targets to full capacity after cooldown period
- **Fail-Open**: Fall back to least-recently-failed target when all are unhealthy
- **Flexible Configuration**: Simple string targets or full object configuration

## Configuration

### Minimal Configuration

```json
{
  "Router": {
    "default": {
      "targets": ["openrouter,model1", "openrouter,model2"]
    }
  }
}
```

### Full Configuration

```json
{
  "Router": {
    "default": {
      "strategy": "weighted_round_robin",
      "targets": [
        { "model": "openrouter,anthropic/claude-sonnet-4", "weight": 5 },
        { "model": "openrouter,google/gemini-2.5-pro-preview", "weight": 3 },
        { "model": "openrouter,anthropic/claude-3.5-sonnet", "weight": 2 },
        { "model": "deepseek,deepseek-chat", "weight": 1 }
      ],
      "health": {
        "cooldown_ms": 120000,
        "recovery_interval_ms": 60000,
        "recovery_step": 1
      }
    },
    "think": {
      "targets": [
        { "model": "openrouter,anthropic/claude-opus-4", "weight": 3 },
        { "model": "deepseek,deepseek-reasoner", "weight": 2 }
      ],
      "health": {
        "cooldown_ms": 30000,
        "recovery_interval_ms": 10000,
        "recovery_step": 1
      }
    },
    "background": {
      "targets": ["ollama,qwen2.5-coder:latest", "ollama,llama3.1:latest"]
    },
    "webSearch": {
      "targets": [
        { "model": "openrouter,google/gemini-2.5-flash:online", "weight": 2 },
        { "model": "gemini,gemini-2.5-flash:online", "weight": 1 }
      ]
    },
    "longContext": {
      "targets": [
        { "model": "openrouter,google/gemini-2.5-pro-preview", "weight": 3 },
        { "model": "openrouter,anthropic/claude-sonnet-4", "weight": 2 }
      ]
    },
    "longContextThreshold": 60000
  }
}
```

## Configuration Options

### Targets

Targets can be specified in two formats:

**String format** (defaults to weight: 1):
```json
"targets": ["provider,model1", "provider,model2"]
```

**Object format** (explicit weight):
```json
"targets": [
  { "model": "provider,model1", "weight": 5 },
  { "model": "provider,model2", "weight": 3 }
]
```

### Weight Semantics

- `weight: 0` - Permanently disabled (never selected, never recovers)
- `weight: 1+` - Normal participation in weighted selection
- Higher weights = selected more frequently (proportional to weight/total)

### Health Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `cooldown_ms` | 120000 (2 min) | Time to wait after failure before starting recovery |
| `recovery_interval_ms` | 60000 (1 min) | Time between weight increments during recovery |
| `recovery_step` | 1 | Amount of weight to restore per recovery interval |

## How It Works

### 1. Target Selection (Weighted Round-Robin)

The algorithm maintains a running sum and selects targets proportionally:

```
Selection probability = target_weight / sum_of_all_weights
```

Example with weights [5, 3, 2]:
- Target A (weight 5): 50% of requests
- Target B (weight 3): 30% of requests
- Target C (weight 2): 20% of requests

### 2. Health Suppression

When a target fails (rate limit, 5xx, network error):

1. **Immediate suppression**: `effectiveWeight` drops to 0
2. **Exponential backoff**: Cooldown doubles with each consecutive failure
   - 1st failure: 2 minutes
   - 2nd failure: 4 minutes
   - 3rd failure: 8 minutes
   - ...up to 12 hour maximum
3. **Failure tracking**: Consecutive failures counter increments

### 3. Recovery Process

After cooldown period ends:

1. **Initial recovery**: Target receives `recovery_step` weight immediately
2. **Gradual restoration**: Every `recovery_interval_ms`, add `recovery_step` weight
3. **Full restoration**: When weight reaches `defaultWeight`, target is fully recovered
4. **Success reset**: On successful request, clear consecutive failure counter

### 4. Fail-Open Behavior

If all targets are suppressed:

- Select the target with the earliest `suppressedUntil` time
- Log the fail-open event for monitoring
- Continue attempting recovery on all targets

## Failure Classification

The following failures trigger health suppression:

| Type | Trigger |
|------|---------|
| `429` | HTTP 429 Rate Limit |
| `5xx` | HTTP 500-599 Server Errors |
| `timeout` | Request timeout |
| `network` | Network errors (ECONNREFUSED, ECONNRESET, ENOTFOUND, etc.) |

**Note**: 4xx errors (except 429) do NOT trigger suppression as they indicate client misconfiguration, not provider issues.

## API Usage

### Programmatic Access

```typescript
import { selectTargetFromPool, recordFailure, getPoolStatus } from '@CCR/core/pool';

// Select a target from a pool
const { target, selectedFrom } = selectTargetFromPool('default');
console.log(`Selected: ${target.model} (weight: ${target.effectiveWeight})`);

// Record a failure for health tracking
recordFailure('default', 'openrouter,model1', 429, 'rate limited');

// Get pool status summary
const status = getPoolStatus();
console.log(status);
// {
//   default: {
//     targetCount: 3,
//     healthyCount: 2,
//     suppressedCount: 1,
//     recoveringCount: 0,
//     targets: [...]
//   }
// }
```

### Pool State Structure

```typescript
interface TargetState {
  model: string;                    // "provider,model"
  defaultWeight: number;            // Original configured weight
  effectiveWeight: number;          // Current weight (0 = suppressed)
  suppressedUntil?: number;       // Timestamp when suppression ends
  lastFailureAt?: number;          // Timestamp of last failure
  consecutiveFailures: number;     // For exponential backoff
  currentWeight: number;            // Internal WRR accumulator
}
```

## Monitoring

When a target is selected from a pool, the following is logged:

```json
{
  "event": "pool_target_selected",
  "scenario": "default",
  "model": "openrouter,anthropic/claude-sonnet-4",
  "effectiveWeight": 5,
  "selectedFrom": "healthy"
}
```

Health state changes are also logged for observability.

## Migration from Legacy Routing

Legacy string routing is fully supported and coexists with pool configuration:

```json
{
  "Router": {
    // Legacy: simple string
    "default": "deepseek,deepseek-chat",

    // New: pool configuration
    "think": {
      "targets": ["openrouter,claude-opus-4", "deepseek,deepseek-reasoner"]
    }
  }
}
```

The router automatically detects pool configuration by checking for the `targets` array property.
