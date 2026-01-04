# 日志 API

## GET /api/logs/files

获取所有可用的日志文件列表。

### 请求示例

```bash
curl http://localhost:3456/api/logs/files \
  -H "x-api-key: your-api-key"
```

### 响应示例

```json
[
  {
    "name": "ccr-20241226143022.log",
    "path": "/home/user/.claude-code-router/logs/ccr-20241226143022.log",
    "size": 1024000,
    "lastModified": "2024-12-26T14:30:22.000Z"
  },
  {
    "name": "ccr-20241226143021.log",
    "path": "/home/user/.claude-code-router/logs/ccr-20241226143021.log",
    "size": 980000,
    "lastModified": "2024-12-26T14:30:21.000Z"
  }
]
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 文件名 |
| `path` | string | 完整文件路径 |
| `size` | integer | 文件大小（字节） |
| `lastModified` | string | 最后修改时间（ISO 8601） |

文件按修改时间倒序排列。

## GET /api/logs

获取指定日志文件的内容。

### 查询参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `file` | string | 否 | 日志文件路径（默认使用 app.log） |

### 请求示例（获取默认日志）

```bash
curl "http://localhost:3456/api/logs" \
  -H "x-api-key: your-api-key"
```

### 请求示例（获取指定文件）

```bash
curl "http://localhost:3456/api/logs?file=/home/user/.claude-code-router/logs/ccr-20241226143022.log" \
  -H "x-api-key: your-api-key"
```

### 响应示例

```json
[
  "{\"level\":30,\"time\":1703550622000,\"pid\":12345,\"hostname\":\"server\",\"msg\":\"Incoming request\",\"req\":{\"id\":1,\"method\":\"POST\",\"url\":\"/v1/messages\",\"remoteAddress\":\"127.0.0.1\"}}",
  "{\"level\":30,\"time\":1703550622500,\"pid\":12345,\"hostname\":\"server\",\"msg\":\"Request completed\",\"res\":{\"statusCode\":200,\"responseTime\":500}}",
  "..."
]
```

返回的是日志行数组，每行是一个 JSON 字符串。

### 日志格式

日志使用 Pino 格式：

```json
{
  "level": 30,
  "time": 1703550622000,
  "pid": 12345,
  "hostname": "server",
  "msg": "Incoming request",
  "req": {
    "id": 1,
    "method": "POST",
    "url": "/v1/messages",
    "remoteAddress": "127.0.0.1"
  }
}
```

### 日志级别

| 级别 | 值 | 说明 |
|------|------|------|
| `trace` | 10 | 最详细的日志 |
| `debug` | 20 | 调试信息 |
| `info` | 30 | 一般信息 |
| `warn` | 40 | 警告信息 |
| `error` | 50 | 错误信息 |
| `fatal` | 60 | 致命错误 |

## DELETE /api/logs

清除指定日志文件的内容。

### 查询参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `file` | string | 否 | 日志文件路径（默认使用 app.log） |

### 请求示例（清除默认日志）

```bash
curl -X DELETE "http://localhost:3456/api/logs" \
  -H "x-api-key: your-api-key"
```

### 请求示例（清除指定文件）

```bash
curl -X DELETE "http://localhost:3456/api/logs?file=/home/user/.claude-code-router/logs/ccr-20241226143022.log" \
  -H "x-api-key: your-api-key"
```

### 响应示例

```json
{
  "success": true,
  "message": "Logs cleared successfully"
}
```

## 日志位置

### 服务器日志

位置：`~/.claude-code-router/logs/`

文件命名：`ccr-{YYYYMMDD}{HH}{MM}{SS}.log`

内容：HTTP 请求、API 调用、服务器事件

### 应用日志

位置：`~/.claude-code-router/claude-code-router.log`

内容：路由决策、业务逻辑事件

## 日志轮转

服务器日志使用 rotating-file-stream 自动轮转：

- **maxFiles**: 3 - 保留最近 3 个日志文件
- **interval**: 1d - 每天轮转
- **maxSize**: 50M - 单个文件最大 50MB
