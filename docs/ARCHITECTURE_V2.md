# Proxy Local v2.0 Architecture Design

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Claude Code / Downstream Client                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP/SSE (OpenAI-compatible)
┌──────────────────────────────▼──────────────────────────────────────┐
│                         API Gateway Layer                             │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────────┐    │
│  │  Auth    │ │ RateLimit│ │Idempotency│ │ Request Validation │    │
│  └──────────┘ └──────────┘ └───────────┘ └────────────────────┘    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    Intelligent Router Layer                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐    │
│  │ IntentRouter │ │ HealthRouter │ │ CascadeChain (fallback)  │    │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐    │
│  │ ModelAlias   │ │ ReasonEngine │ │ AdaptiveRouter (WRR/LB)  │    │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                  Middleware Pipeline (Orchestrator)                   │
│                                                                      │
│  Phase 1: Pre-Route          Phase 2: Post-Route                    │
│  ┌─────────────────┐        ┌─────────────────┐                    │
│  │ Cache Lookup    │        │ RAG Enricher    │                    │
│  │ (L1/L2/L3)     │        │ Context Inject  │                    │
│  └─────────────────┘        │ Memory Bridge   │                    │
│                              └─────────────────┘                    │
│  Phase 3: Pre-Send           Phase 4: Post-Response                │
│  ┌─────────────────┐        ┌─────────────────┐                    │
│  │ PII Masker      │        │ Cache Store     │                    │
│  │ Compliance      │        │ Context Capture │                    │
│  │ Structured Out  │        │ Audit Log       │                    │
│  └─────────────────┘        │ Quality Score   │                    │
│                              └─────────────────┘                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                   Upstream Provider Layer                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ OpenAI   │ │ DeepSeek │ │  GLM     │ │ Gemini   │  ...         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                      │
│  Transformer: Request/Response format conversion per provider       │
│  KeyManager: Multi-key rotation per provider with cooldown          │
│  CircuitBreaker: Per-provider health tracking                       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                      Infrastructure Layer                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐    │
│  │ Redis    │ │ Qdrant   │ │ Postgres │ │ Local Vault (enc)  │    │
│  │ 16379    │ │ 16333    │ │ 55432    │ │ ~/.ccr/vault.enc   │    │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Module Inventory

### Existing Modules (to be enhanced)

| Module | Location | Enhancement |
|--------|----------|-------------|
| Router | `utils/router.ts` | Add AdaptiveRouter (WRR), integrate CircuitBreaker |
| Cache (L1) | `utils/cache.ts` | Add LRU+TTL hybrid, semantic invalidation |
| Cache (L2) | `utils/redis-cache.ts` | Add Redis-backed distributed cache |
| Cache (L3) | `middleware/qdrant-cache.ts` | Vector semantic cache via Qdrant |
| CircuitBreaker | `utils/circuit-breaker.ts` | Already solid, add health probe scheduler |
| KeyRotator | `utils/key-rotator.ts` | Integrate with Vault |
| Redactor | `utils/redactor.ts` | Extend patterns for API keys, tokens |
| Metrics | `utils/metrics.ts` | Add Prometheus exposition format |
| Orchestrator | `middleware/orchestrator.ts` | Add phase-based pipeline with isolation |

### New Modules (to be built)

| Module | Location | Purpose |
|--------|----------|---------|
| VaultManager | `services/vault.ts` | Encrypted local vault for API keys |
| AdaptiveRouter | `utils/adaptive-router.ts` | Weighted-round-robin with latency/cost weights |
| ReasoningChain | `engines/reasoning-chain.ts` | Multi-step reasoning orchestration |
| TrafficMirror | `utils/traffic-mirror.ts` | Async request mirroring for A/B evaluation |
| ContextStore | `services/context-store.ts` | Unified context storage/retrieval API |
| PrometheusExporter | `utils/prometheus.ts` | /metrics endpoint for Prometheus |
| ChainTemplates | `engines/chain-templates/` | Pre-built reasoning chain templates |

## 3. Data Flow

```
Request → Auth → RateLimit → Idempotency → Cache Lookup
                                              │
                                    ┌─────────┴──────────┐
                                    │ HIT                 │ MISS
                                    ▼                     ▼
                                 Response           Router (Intent → Model)
                                                         │
                                                  RAG Enrichment
                                                  Memory Injection
                                                  PII Masking
                                                         │
                                                  Provider Selection
                                                  Key Rotation
                                                  Circuit Check
                                                         │
                                                  ┌──────┴──────┐
                                                  │ Upstream Call
                                                  │ + Retry/Fallback
                                                  └──────┬──────┘
                                                         │
                                                  Response Processing
                                                  ├─ Structured Output Check
                                                  ├─ Quality Scoring
                                                  ├─ Cache Store (L1/L2/L3)
                                                  ├─ Audit Log
                                                  ├─ Cost Recording
                                                  └─ Traffic Mirror (async)
                                                         │
                                                     Response
```

## 4. Core Interfaces

### 4.1 Unified Request Context

```typescript
interface ProxyRequestContext {
  traceId: string;
  sessionId?: string;
  provider: string;
  model: string;
  scenarioType: RouterScenarioType;
  tokenCount: number;
  startTime: number;
  
  // Pipeline state
  cacheHit: boolean;
  cacheLevel?: 'L1' | 'L2' | 'L3';
  fallbackChain?: string[];
  retryCount: number;
  
  // Cost tracking
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  
  // Internal context (not forwarded downstream)
  _internalContext: Map<string, any>;
}
```

### 4.2 Cache Layer Interface

```typescript
interface ICacheLayer {
  readonly level: 'L1' | 'L2' | 'L3';
  get(key: CacheKey): Promise<CacheEntry | null>;
  set(key: CacheKey, value: CacheEntry, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<number>;
  stats(): CacheStats;
}

interface CacheKey {
  model: string;
  messagesHash: string;
  paramsHash: string;
  semanticHash?: string;  // For L3 vector cache
}
```

### 4.3 Router Interface

```typescript
interface IRouter {
  route(ctx: ProxyRequestContext): Promise<RouteDecision>;
  reportHealth(provider: string, latency: number, success: boolean): void;
  getStats(): RouterStats;
}

interface RouteDecision {
  provider: string;
  model: string;
  fallbackChain: string[];
  reason: string;
  estimatedLatency: number;
}
```

### 4.4 Reasoning Chain Interface

```typescript
interface IReasoningChain {
  readonly chainId: string;
  readonly steps: ChainStep[];
  execute(input: ChainInput): Promise<ChainOutput>;
}

interface ChainStep {
  role: 'generator' | 'reviewer' | 'reviser' | 'aggregator';
  model: string;
  prompt: string | ((prev: ChainStepResult) => string);
  timeout: number;
}

interface ChainOutput {
  finalResponse: any;        // Only this goes to downstream
  _internalSteps: any[];     // Isolated, never exposed
  totalTokens: number;
  totalLatency: number;
}
```

### 4.5 Vault Interface

```typescript
interface IVault {
  initialize(masterPassword: string): Promise<void>;
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
  rotateMasterPassword(oldPwd: string, newPwd: string): Promise<void>;
}
```

## 5. Security Architecture

### 5.1 Key Management Flow

```
Startup:
  1. Check ~/.ccr/vault.enc exists
  2. If not, create with master password from env VAULT_PASSWORD
  3. Load all provider keys from vault
  4. Fall back to env vars (OPENAI_API_KEY, etc.) if vault empty
  
Runtime:
  - KeyManager loads keys from VaultManager
  - Keys never appear in logs (Redactor strips them)
  - Key rotation happens in vault, hot-reloaded
  
Audit:
  - All key access logged with redacted values (sk-...abcd)
  - Vault file encrypted with AES-256-GCM
  - Master password never stored on disk
```

### 5.2 Request Sanitization

```
Outbound Log:  Authorization: Bearer sk-abc...wxyz  (6+4)
Outbound Log:  x-api-key: 933a...SqDD  (3+4)
Error Stack:   No key material included
Response:      No provider headers leaked
```

## 6. Implementation Phases

### Phase 1 (PR #1): Core Infrastructure + Security
- VaultManager (AES-256-GCM encrypted vault)
- AdaptiveRouter (weighted routing with health feedback)
- Multi-level cache integration (L1 memory + L2 Redis + L3 Qdrant)
- Security hardening (auto-redact, vault-only keys, audit trail)
- Prometheus metrics endpoint
- Full integration test suite

### Phase 2 (PR #2): Semantic + Reasoning
- Enhanced RAG pipeline (Qdrant + Ollama embeddings)
- Context store API
- Reasoning chain engine
- Chain templates (code-review, plan-generate)

### Phase 3 (PR #3): Advanced Features
- Traffic mirroring
- Request replay regression
- Adaptive parameter tuning
- Multi-model voting (enhanced)
- Dashboard UI updates

## 7. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Proxy overhead (no cache) | < 50ms | p99 latency minus upstream |
| Cache hit (L1 memory) | < 5ms | p99 |
| Cache hit (L2 Redis) | < 15ms | p99 |
| Cache hit (L3 Qdrant) | < 50ms | p99 |
| Routing decision | < 5ms | p99 |
| Vault decrypt | < 10ms | per access |
| Total memory | < 512MB | RSS under load |
