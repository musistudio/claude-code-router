---
title: 用量 API
---

# 用量 API

用量 API 提供端点用于查询、导出和管理 Token 使用量统计数据。

:::info 需要插件

用量 API 由 `usage-tracking` 插件提供，**默认启用**。如果插件被禁用，所有用量 API 端点将返回 404。

:::

## 插件配置

`usage-tracking` 插件默认启用。您可以在 `config.json` 中配置：

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

### 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | 启用或禁用插件 |
| `options.retentionDays` | number | `90` | 保留用量记录的天数 |

### 禁用用量跟踪

要禁用用量跟踪：

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

禁用后：
- 不收集任何用量数据
- 所有 `/api/usage/*` 端点返回 404
- UI 中的用量页面显示禁用提示

### 从环境变量迁移

:::warning 重大变更

`USAGE_TRACKING_ENABLED` 环境变量已不再支持。请使用插件配置代替。

:::

**之前（已弃用）：**
```bash
export USAGE_TRACKING_ENABLED=false
```

**现在：**
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

## 插件状态 API

可以通过 `/api/plugins/status` 端点检查插件状态：

```
GET /api/plugins/status
```

### 响应

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

## 端点概览

| 端点 | 方法 | 说明 |
|----------|--------|-------------|
| `/api/usage` | GET | 分页查询用量记录 |
| `/api/usage/summary` | GET | 获取聚合统计数据 |
| `/api/usage/daily` | GET | 获取每日总量趋势 |
| `/api/usage/hourly` | GET | 获取小时分布用于时段分析 |
| `/api/usage/performance` | GET | 获取性能指标时间序列 |
| `/api/usage/filters` | GET | 获取可选的提供商/模型过滤条件 |
| `/api/usage/export` | GET | 导出用量数据 |
| `/api/usage/cleanup` | DELETE | 清理旧数据 |

## 查询用量记录

```
GET /api/usage
```

检索分页的用量记录。

### 查询参数

| 参数 | 类型 | 说明 |
|-----------|------|-------------|
| `startDate` | string | 开始日期 (YYYY-MM-DD) |
| `endDate` | string | 结束日期 (YYYY-MM-DD) |
| `provider` | string | 按提供商名称过滤 |
| `model` | string | 按模型名称过滤 |
| `limit` | number | 返回记录数量（默认：100） |
| `offset` | number | 跳过的记录数量（默认：0） |

### 响应

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

### 示例

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage?startDate=2025-03-01&endDate=2025-03-31&limit=50"
```

## 获取用量摘要

```
GET /api/usage/summary
```

获取按提供商和模型细分的聚合用量统计数据。

### 查询参数

| 参数 | 类型 | 说明 |
|-----------|------|-------------|
| `startDate` | string | 开始日期 (YYYY-MM-DD) |
| `endDate` | string | 结束日期 (YYYY-MM-DD) |
| `provider` | string | 按提供商名称过滤 |
| `model` | string | 按模型名称过滤 |

### 响应

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
  "avgLatency": 1500,
  "avgTimeToFirstToken": 200,
  "avgSpeed": 42,
  "cacheHitRatio": 0.15,
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
      "avgLatency": 1200,
      "avgSpeed": 45,
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
      "avgLatency": 1200,
      "avgSpeed": 45,
      "hourlyBreakdown": [
        {
          "hour": 0,
          "requests": 5,
          "inputTokens": 5000,
          "outputTokens": 1500,
          "avgLatency": 1000,
          "avgSpeed": 40
        }
      ]
    }
  ]
}
```

### 示例

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/summary?startDate=2025-03-25&endDate=2025-03-25"
```

## 获取每日总量

```
GET /api/usage/daily
```

获取每日聚合总量用于趋势可视化。

### 查询参数

| 参数 | 类型 | 说明 |
|-----------|------|-------------|
| `startDate` | string | **必填** 开始日期 (YYYY-MM-DD) |
| `endDate` | string | **必填** 结束日期 (YYYY-MM-DD) |

### 响应

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

### 示例

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/daily?startDate=2025-03-01&endDate=2025-03-31"
```

## 获取小时分布

```
GET /api/usage/hourly
```

获取按小时聚合的数据用于时段分析，支持按提供商和模型过滤。

### 查询参数

| 参数 | 类型 | 说明 |
|-----------|------|-------------|
| `startDate` | string | **必填** 开始日期 (YYYY-MM-DD) |
| `endDate` | string | **必填** 结束日期 (YYYY-MM-DD) |
| `provider` | string | 按提供商名称过滤 |
| `model` | string | 按模型名称过滤 |

### 响应

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

### 示例

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/hourly?startDate=2025-03-01&endDate=2025-03-31&provider=zhipu"
```

## 获取性能指标

```
GET /api/usage/performance
```

获取用于图表展示的性能指标时间序列数据，可按天或小时分组。

### 查询参数

| 参数 | 类型 | 说明 |
|-----------|------|-------------|
| `startDate` | string | **必填** 开始日期 (YYYY-MM-DD) |
| `endDate` | string | **必填** 结束日期 (YYYY-MM-DD) |
| `groupBy` | string | 按 `day` 或 `hour` 分组（默认：`day`） |
| `provider` | string | 按提供商名称过滤 |
| `model` | string | 按模型名称过滤 |

### 响应

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

### 示例

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/performance?startDate=2025-03-01&endDate=2025-03-31&groupBy=day"
```

## 获取可用过滤器

```
GET /api/usage/filters
```

获取可用于过滤的提供商列表、模型列表和日期范围。

### 查询参数

| 参数 | 类型 | 说明 |
|-----------|------|-------------|
| `startDate` | string | 可选的日期范围开始 |
| `endDate` | string | 可选的日期范围结束 |

### 响应

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

### 示例

```bash
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/filters"
```

## 导出用量数据

```
GET /api/usage/export
```

将用量数据导出为 JSON 或 CSV 文件。

### 查询参数

| 参数 | 类型 | 说明 |
|-----------|------|-------------|
| `format` | string | 导出格式：`json` 或 `csv`（默认：`json`） |
| `startDate` | string | 开始日期 (YYYY-MM-DD) |
| `endDate` | string | 结束日期 (YYYY-MM-DD) |
| `provider` | string | 按提供商名称过滤 |
| `model` | string | 按模型名称过滤 |

### 响应

返回文件内容，带有相应的下载头。

- **JSON**: `Content-Type: application/json`
- **CSV**: `Content-Type: text/csv`

### 示例

```bash
# 导出为 JSON
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/export?format=json" \
  -o usage-export.json

# 导出为 CSV
curl -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/export?csv&startDate=2025-03-01" \
  -o usage-export.csv
```

## 清理旧数据

```
DELETE /api/usage/cleanup
```

删除旧的用量记录以释放磁盘空间。

### 查询参数

| 参数 | 类型 | 说明 |
|-----------|------|-------------|
| `beforeDate` | string | 删除此日期之前的记录 |
| `retentionDays` | number | 保留 N 天的记录（默认：90） |
| `dryRun` | boolean | 预览而不删除（默认：false） |

### 响应

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

### 示例

```bash
# 预览清理（试运行）
curl -X DELETE -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/cleanup?dryRun=true&retentionDays=30"

# 实际删除旧记录
curl -X DELETE -H "x-api-key: your-api-key" \
  "http://localhost:3456/api/usage/cleanup?retentionDays=90"
```

## 数据模型

### UsageRecord

```typescript
interface UsageRecord {
  id: string;                           // UUID
  timestamp: string;                    // ISO 8601
  date: string;                         // YYYY-MM-DD
  sessionId?: string;                   // Session 标识符
  requestId: string;                    // 请求标识符
  provider: string;                      // 提供商名称
  model: string;                        // 模型名称

  // Token 使用量
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  reasoningTokens?: number;

  // 请求元数据
  stream: boolean;
  success: boolean;
  errorMessage?: string;
  duration?: number;                    // 请求耗时（毫秒）
  timeToFirstToken?: number;            // 首 token 耗时（毫秒）
}
```

## 错误响应

| 状态码 | 说明 |
|-------------|-------------|
| 400 | 无效的查询参数 |
| 401 | 未授权（API 密钥无效或缺失） |
| 500 | 服务器错误 |

```json
{
  "error": "Invalid date format. Use YYYY-MM-DD."
}
```
