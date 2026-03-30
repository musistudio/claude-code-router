# Token Usage Page - Technical Specification

## Overview

The usage page tracks and displays LLM API usage data: tokens consumed, latency, cache hits, and reasoning tokens.

---

## Data Flow

```
LLM Request (Claude Code)
        │
        ▼
Server: onSend Hook (persistUsage)
        │
        ▼
~/.claude-code-router/usage/usage-YYYY-MM.jsonl
        │
        ▼
Query API → aggregator.ts (computed on query time)
        │
        ▼
UsagePage.tsx → StatsTable / HourlyTable / RecordsTable / PerformanceChart
```

---

## Step 1: Request Interception

**File:** `packages/server/src/index.ts` — `persistUsage()` function

Captured from request:
| Field | Source | Description |
|-------|--------|-------------|
| `provider` | `req.provider` | Routing destination provider name |
| `model` | `req.model` | Model name |
| `sessionId` | `req.sessionId` | Session identifier |
| `requestId` | `req.id` | Request identifier |

Captured from LLM response (`usage` object):
| Field | API Field | Description |
|-------|-----------|-------------|
| `inputTokens` | `usage.input_tokens` | Input token count (prompt) |
| `outputTokens` | `usage.output_tokens` | Output token count (response) |
| `cacheCreationInputTokens` | `usage.cache_creation_input_tokens` | Tokens consumed creating prompt cache |
| `cacheReadInputTokens` | `usage.cache_read_input_tokens` | Tokens read from prompt cache (1/10 rate) |
| `reasoningTokens` | `usage.reasoning_tokens` | Tokens consumed by extended thinking (reasoning models only) |

Captured from token-speed plugin:
| Field | Source | Description |
|-------|--------|-------------|
| `duration` | `lastTokenTime - startTime` (ms) | Total request duration |
| `timeToFirstToken` | `tokenStats.current.timeToFirstToken` (ms) | Time to first token |

Additional fields:
| Field | Description |
|-------|-------------|
| `success` | Stream parse success / error response |
| `stream` | Whether streaming response |
| `errorMessage` | Error message on failure |

---

## Step 2: Storage

**File:** `packages/shared/src/usage/storage.ts`

- **Directory:** `~/.claude-code-router/usage/`
- **File pattern:** `usage-YYYY-MM.jsonl` (monthly files)
- **Format:** JSON Lines (one JSON object per line)

Example record:
```json
{
  "id": "uuid",
  "timestamp": "2026-03-27T10:30:00.000Z",
  "date": "2026-03-27",
  "provider": "minimax",
  "model": "MiniMax-M2.7",
  "inputTokens": 1200,
  "outputTokens": 3400,
  "cacheCreationInputTokens": 500,
  "cacheReadInputTokens": 300,
  "reasoningTokens": 0,
  "stream": true,
  "success": true,
  "duration": 15230,
  "timeToFirstToken": 820
}
```

---

## Step 3: API Endpoints

**File:** `packages/server/src/server.ts`

| Endpoint | Query Params | Returns |
|----------|-------------|---------|
| `GET /api/usage` | `startDate`, `endDate`, `provider`, `model`, `limit`, `offset` | Paginated raw records |
| `GET /api/usage/summary` | `startDate`, `endDate`, `provider`, `model` | Global + byProvider + byModel aggregations |
| `GET /api/usage/daily` | `startDate`, `endDate` | Daily totals (for sidebar) |
| `GET /api/usage/hourly` | `startDate`, `endDate`, `provider?`, `model?` | Hourly breakdown |
| `GET /api/usage/performance` | `startDate`, `endDate`, `groupBy`, `provider?`, `model?` | Performance time series |
| `GET /api/usage/filters` | `startDate?`, `endDate?` | Available providers/models |
| `GET /api/usage/export` | `format`, `startDate`, `endDate`, `provider?`, `model?` | CSV/JSON export |
| `DELETE /api/usage/cleanup` | `beforeDate?`, `retentionDays?`, `dryRun?` | Delete old records |

---

## Step 4: Aggregation Formulas

**File:** `packages/shared/src/usage/aggregator.ts`

All metrics are **computed on query time**, not pre-calculated.

| Displayed Field | Formula | Notes |
|----------------|---------|-------|
| `totalInputTokens` | `Σ inputTokens` | Sum of all input tokens |
| `totalOutputTokens` | `Σ outputTokens` | Sum of all output tokens |
| `totalRequests` | `count(records)` | Total request count |
| `avgLatency` | `Σ (duration - timeToFirstToken) / count` | Avg output latency (excludes TTFT) |
| `avgSpeed` | `Σ outputTokens / Σ (duration - timeToFirstToken) / 1000` | Tokens per second |
| `avgTimeToFirstToken` | `Σ timeToFirstToken / count` | Avg TTFT |
| `cacheHitRatio` | `cacheReadTokens / (inputTokens + cacheReadTokens)` | Cache utilization rate |

**By Provider/Model:** Same formulas applied to the filtered subset of records.

**By Hour:** Same formulas applied per hourly bucket (0-23).

---

## Step 5: UI Components

**File:** `packages/ui/src/components/UsagePage.tsx`

Four parallel API calls on each data fetch:
```
getUsageSummary()   → StatsTable + Summary Cards
getUsageRecords()  → RecordsTable (paginated)
getUsageHourly()   → HourlyTable
getUsagePerformance() → PerformanceChart
```

### StatsTable

Groups by provider/model with expandable rows. Columns: Provider, Requests, Net Input, Cache Hit, Reasoning, Output Tokens, Consumed Tokens, Avg Latency, Avg Speed.

### HourlyTable

Hourly breakdown with three drill-down levels: Hour only → Provider/Hour → Provider/Model/Hour. Columns: Hour, Requests, Net Input, Cache Hit, Reasoning, Output Tokens, Consumed Tokens, Avg Latency, Avg Speed.

### RecordsTable

Paginated list of individual raw records. Columns: Time, Provider, Model, Net Input, Cache Hit, Reasoning, Output Tokens, Consumed Tokens, TTFT, Output Duration, Speed, Status.

### PerformanceChart

Line chart (speed or latency vs time) per provider, from hourly performance data.

---

## Field Definitions

### inputTokens vs cacheReadInputTokens

**On first request (cache miss, with prompt caching):**
```
inputTokens = uncacheable tokens + cacheable tokens (all charged at full rate)
cacheCreationInputTokens = extra charge for creating cache blocks (~10% of input rate)
```

**On subsequent requests (cache hit):**
```
inputTokens = uncacheable tokens only (full rate)
cacheReadInputTokens = tokens read from cache (~10% of input rate)
```

Model processes the full context (uncacheable + cached), but billing only charges uncacheable at full rate + cached at cache rate.

### reasoningTokens

Tokens consumed by the model's internal reasoning process (e.g., Claude 3.7 with extended thinking). These are separate from output tokens and have their own pricing. Only present on reasoning/thinking-capable models.

### avgLatency

Output duration (total time minus time to first token), excluding the TTFT. This measures how fast the model produces output after starting, not including the initial think time.

### avgSpeed

Output tokens per second = `outputTokens / (duration - timeToFirstToken) / 1000`

---

## Glossary

| Term | Description |
|------|-------------|
| Input Tokens | Tokens sent to the model in the prompt |
| Output Tokens | Tokens generated by the model in the response |
| Cache Read Input Tokens | Tokens read from prompt cache (discounted rate) |
| Cache Creation Input Tokens | Tokens consumed when creating prompt cache blocks |
| Reasoning Tokens | Tokens consumed by internal reasoning/thinking process |
| Consumed Tokens | inputTokens + outputTokens (does NOT include cache read) |
| Output Duration | duration - timeToFirstToken (ms), pure output time |
| TTFT | Time To First Token (ms) |
| Speed | Output tokens per second |

---

*Last updated: 2026-03-27*
