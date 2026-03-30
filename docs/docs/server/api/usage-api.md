---
title: Usage API
---

# Usage API

The Usage API provides endpoints to query, export, and manage token usage statistics.

:::info Plugin Required

The Usage API is provided by the `usage-tracking` plugin, which is **enabled by default**. If the plugin is disabled, all usage API endpoints will return 404.

:::

## Plugin Configuration

The `usage-tracking` plugin is enabled by default. You can configure it in your `config.json`:

```json
{
  "Plugins": [
    {
      "name": "usage-tracking",
      "enabled": true,
      "options": {
        "retentionDays": 90
      }
    }
  ]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable or disable the plugin |
| `options.retentionDays` | number | `90` | Number of days to keep usage records |

### Disabling Usage Tracking

To disable usage tracking:

```json
{
  "Plugins": [
    {
      "name": "usage-tracking",
      "enabled": false
    }
  ]
}
```

When disabled:
- No usage data is collected
- All `/api/usage/*` endpoints return 404
- The Usage page in the UI shows a disabled message

### Migration from Environment Variables

:::warning Breaking Change

The `USAGE_TRACKING_ENABLED` environment variable is no longer supported. Use the plugin configuration instead.

:::

**Before (deprecated):**
```bash
export USAGE_TRACKING_ENABLED=false
```

**After:**
```json
{
  "Plugins": [
    {
      "name": "usage-tracking",
      "enabled": false
    }
  ]
}
```

## Plugin Status API

You can check plugin status via the `/api/plugins/status` endpoint:

```
GET /api/plugins/status
```

### Response

```json
{
  "plugins": [
    {
      "name": "usage-tracking",
      "enabled": true,
      "hasOptions": true
    },
    {
      "name": "token-speed",
      "enabled": true,
      "hasOptions": true
    }
  ]
}
```

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/usage` | GET | Query usage records with pagination |
| `/api/usage/summary` | GET | Get aggregated statistics |
| `/api/usage/daily` | GET | Get daily totals for trends |
| `/api/usage/hourly` | GET | Get hourly aggregation for time-of-day analysis |
| `/api/usage/performance` | GET | Get performance metrics time series |
| `/api/usage/filters` | GET | Get available providers/models |
| `/api/usage/export` | GET | Export usage data |
| `/api/usage/cleanup` | DELETE | Clean up old usage data |

## Query Usage Records

```
GET /api/usage
```

Retrieve paginated usage records.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | Start date (YYYY-MM-DD) |
| `endDate` | string | End date (YYYY-MM-DD) |
| `provider` | string | Filter by provider name |
| `model` | string | Filter by model name |
| `limit` | number | Number of records to return (default: 100) |
| `offset` | number | Number of records to skip (default: 0) |

### Response

```json
{
  "records": [
    {
      "id": "uuid",
      "timestamp": "2025-03-25T10:30:00.000Z",
      "date": "2025-03-25",
      "sessionId": "session-uuid",
      "requestId": "req-uuid",
      "provider": "zhipu",
      "model": "glm-4.6",
      "inputTokens": 1000,
      "outputTokens": 500,
      "cacheCreationInputTokens": 100,
      "cacheReadInputTokens": 50,
      "reasoningTokens": 200,
      "stream": true,
      "success": true,
      "duration": 2500,
      "timeToFirstToken": 150
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

### Example

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage?startDate=2025-03-01&endDate=2025-03-31&limit=50"
```

## Get Usage Summary

```
GET /api/usage/summary
```

Get aggregated usage statistics with breakdowns by provider and model.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | Start date (YYYY-MM-DD) |
| `endDate` | string | End date (YYYY-MM-DD) |
| `provider` | string | Filter by provider name |
| `model` | string | Filter by model name |

### Response

```json
{
  "startDate": "2025-03-01",
  "endDate": "2025-03-31",
  "totalRequests": 1500,
  "successRequests": 1450,
  "failedRequests": 50,
  "totalInputTokens": 1250000,
  "totalOutputTokens": 450000,
  "totalCacheCreationTokens": 50000,
  "totalCacheReadTokens": 25000,
  "totalReasoningTokens": 100000,
  "byProvider": [
    {
      "provider": "zhipu",
      "requests": 800,
      "successRequests": 780,
      "failedRequests": 20,
      "inputTokens": 700000,
      "outputTokens": 250000,
      "cacheCreationTokens": 30000,
      "cacheReadTokens": 15000,
      "reasoningTokens": 50000,
      "models": [
        {
          "model": "glm-4.6",
          "provider": "zhipu",
          "requests": 500,
          "inputTokens": 450000,
          "outputTokens": 150000
        }
      ]
    }
  ],
  "byModel": [
    {
      "model": "glm-4.6",
      "provider": "zhipu",
      "requests": 500,
      "inputTokens": 450000,
      "outputTokens": 150000
    }
  ],
  "byDate": [
    {
      "date": "2025-03-25",
      "provider": "zhipu",
      "model": "glm-4.6",
      "totalRequests": 50,
      "totalInputTokens": 45000,
      "totalOutputTokens": 15000,
      "hourlyBreakdown": [
        {
          "hour": 0,
          "requests": 5,
          "inputTokens": 5000,
          "outputTokens": 1500
        }
      ]
    }
  ]
}
```

### Example

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/summary?startDate=2025-03-25&endDate=2025-03-25"
```

## Get Daily Totals

```
GET /api/usage/daily
```

Get daily aggregated totals for trend visualization.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | **Required** Start date (YYYY-MM-DD) |
| `endDate` | string | **Required** End date (YYYY-MM-DD) |

### Response

```json
{
  "data": [
    {
      "date": "2025-03-01",
      "requests": 45,
      "inputTokens": 12000,
      "outputTokens": 5000,
      "totalTokens": 17000
    },
    {
      "date": "2025-03-02",
      "requests": 52,
      "inputTokens": 15000,
      "outputTokens": 6000,
      "totalTokens": 21000
    }
  ]
}
```

### Example

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/daily?startDate=2025-03-01&endDate=2025-03-31"
```

## Get Hourly Aggregation

```
GET /api/usage/hourly
```

Get hourly aggregated data for time-of-day analysis, with optional filtering by provider and model.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | **Required** Start date (YYYY-MM-DD) |
| `endDate` | string | **Required** End date (YYYY-MM-DD) |
| `provider` | string | Filter by provider name |
| `model` | string | Filter by model name |

### Response

```json
{
  "data": [
    {
      "hour": 9,
      "requests": 45,
      "inputTokens": 12000,
      "outputTokens": 5000,
      "cacheCreationTokens": 1000,
      "cacheReadTokens": 2000,
      "avgLatency": 1500,
      "avgSpeed": 42
    }
  ]
}
```

### Example

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/hourly?startDate=2025-03-01&endDate=2025-03-31&provider=zhipu"
```

## Get Performance Metrics

```
GET /api/usage/performance
```

Get performance metrics time series data for charting, grouped by day or hour.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | **Required** Start date (YYYY-MM-DD) |
| `endDate` | string | **Required** End date (YYYY-MM-DD) |
| `groupBy` | string | Group by `day` or `hour` (default: `day`) |
| `provider` | string | Filter by provider name |
| `model` | string | Filter by model name |

### Response

```json
{
  "data": [
    {
      "timestamp": "2025-03-25",
      "date": "2025-03-25",
      "provider": "zhipu",
      "model": "glm-4.6",
      "requests": 50,
      "inputTokens": 45000,
      "outputTokens": 15000,
      "avgLatency": 1200,
      "avgTimeToFirstToken": 200,
      "avgSpeed": 45
    }
  ]
}
```

### Example

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/performance?startDate=2025-03-01&endDate=2025-03-31&groupBy=day"
```

## Get Available Filters

```
GET /api/usage/filters
```

Get lists of available providers, models, and date range for filtering.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | Optional date range start |
| `endDate` | string | Optional date range end |

### Response

```json
{
  "providers": ["zhipu", "deepseek", "minimax"],
  "models": ["glm-4.6", "glm-4.7", "deepseek-v3.2", "abab-6.5"],
  "dateRange": {
    "startDate": "2025-01-15",
    "endDate": "2025-03-25"
  }
}
```

### Example

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/filters"
```

## Export Usage Data

```
GET /api/usage/export
```

Export usage data as JSON or CSV file.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | Export format: `json` or `csv` (default: `json`) |
| `startDate` | string | Start date (YYYY-MM-DD) |
| `endDate` | string | End date (YYYY-MM-DD) |
| `provider` | string | Filter by provider name |
| `model` | string | Filter by model name |

### Response

Returns the file content with appropriate headers for download.

- **JSON**: `Content-Type: application/json`
- **CSV**: `Content-Type: text/csv`

### Example

```bash
# Export as JSON
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/export?format=json" \
  -o usage-export.json

# Export as CSV
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/export?format=csv&startDate=2025-03-01" \
  -o usage-export.csv
```

## Cleanup Old Data

```
DELETE /api/usage/cleanup
```

Delete old usage records to free up disk space.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `beforeDate` | string | Delete records before this date |
| `retentionDays` | number | Keep records for N days (default: 90) |
| `dryRun` | boolean | Preview without deleting (default: false) |

### Response

```json
{
  "success": true,
  "deletedCount": 1234,
  "deletedFiles": [
    "/path/to/usage-2024-12.jsonl"
  ],
  "freedBytes": 262144,
  "dryRun": false
}
```

### Example

```bash
# Preview cleanup (dry run)
curl -X DELETE -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/cleanup?dryRun=true&retentionDays=30"

# Actually delete old records
curl -X DELETE -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/cleanup?retentionDays=90"
```

## Data Model

### UsageRecord

```typescript
interface UsageRecord {
  id: string;                           // UUID
  timestamp: string;                    // ISO 8601
  date: string;                         // YYYY-MM-DD
  sessionId?: string;                   // Session identifier
  requestId: string;                    // Request identifier
  provider: string;                     // Provider name
  model: string;                        // Model name

  // Token usage
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  reasoningTokens?: number;

  // Request metadata
  stream: boolean;
  success: boolean;
  errorMessage?: string;
  duration?: number;                    // Request duration in ms
  timeToFirstToken?: number;            // Time to first token in ms
}
```

## Error Responses

| Status Code | Description |
|-------------|-------------|
| 400 | Invalid query parameters |
| 401 | Unauthorized (invalid or missing API key) |
| 500 | Server error |

```json
{
  "error": "Invalid date format. Use YYYY-MM-DD."
}
```