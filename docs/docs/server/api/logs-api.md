---
title: Logs API
---

# Logs API

## GET /api/logs/files

Get list of all available log files.

### Request Example

```bash
curl http://localhost:3456/api/logs/files \
  -H "x-api-key: your-api-key"
```

### Response Example

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

### Field Description

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | File name |
| `path` | string | Complete file path |
| `size` | integer | File size (bytes) |
| `lastModified` | string | Last modification time (ISO 8601) |

Files are sorted by modification time in descending order.

## GET /api/logs

Get content of specified log file.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | string | No | Log file path (default uses app.log) |

### Request Example (Get Default Log)

```bash
curl "http://localhost:3456/api/logs" \
  -H "x-api-key: your-api-key"
```

### Request Example (Get Specific File)

```bash
curl "http://localhost:3456/api/logs?file=/home/user/.claude-code-router/logs/ccr-20241226143022.log" \
  -H "x-api-key: your-api-key"
```

### Response Example

```json
[
  "{\"level\":30,\"time\":1703550622000,\"pid\":12345,\"hostname\":\"server\",\"msg\":\"Incoming request\",\"req\":{\"id\":1,\"method\":\"POST\",\"url\":\"/v1/messages\",\"remoteAddress\":\"127.0.0.1\"}}",
  "{\"level\":30,\"time\":1703550622500,\"pid\":12345,\"hostname\":\"server\",\"msg\":\"Request completed\",\"res\":{\"statusCode\":200,\"responseTime\":500}}",
  "..."
]
```

Returns an array of log lines, each line is a JSON string.

### Log Format

Logs use Pino format:

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

### Log Levels

| Level | Value | Description |
|-------|-------|-------------|
| `trace` | 10 | Most verbose logs |
| `debug` | 20 | Debug information |
| `info` | 30 | General information |
| `warn` | 40 | Warning information |
| `error` | 50 | Error information |
| `fatal` | 60 | Fatal error |

## DELETE /api/logs

Clear content of specified log file.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | string | No | Log file path (default uses app.log) |

### Request Example (Clear Default Log)

```bash
curl -X DELETE "http://localhost:3456/api/logs" \
  -H "x-api-key: your-api-key"
```

### Request Example (Clear Specific File)

```bash
curl -X DELETE "http://localhost:3456/api/logs?file=/home/user/.claude-code-router/logs/ccr-20241226143022.log" \
  -H "x-api-key: your-api-key"
```

### Response Example

```json
{
  "success": true,
  "message": "Logs cleared successfully"
}
```

## Log Locations

### Server Logs

Location: `~/.claude-code-router/logs/`

File naming: `ccr-{YYYYMMDD}{HH}{MM}{SS}.log`

Content: HTTP requests, API calls, server events

### Application Logs

Location: `~/.claude-code-router/claude-code-router.log`

Content: Routing decisions, business logic events

## Log Rotation

Server logs use rotating-file-stream for automatic rotation:

- **maxFiles**: 3 - Keep last 3 log files
- **interval**: 1d - Rotate daily
- **maxSize**: 50M - Maximum 50MB per file
