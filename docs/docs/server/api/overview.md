---
title: API Overview
---

# API Overview

Claude Code Router Server provides a complete HTTP API with support for:

- **Messages API**: Message interface compatible with Anthropic Claude API
- **Configuration API**: Read and update server configuration
- **Logs API**: View and manage service logs
- **Tools API**: Calculate token counts

## Basic Information

**Base URL**: `http://localhost:3456`

**Authentication**: API Key (via `x-api-key` header)

```bash
curl -H "x-api-key: your-api-key" http://localhost:3456/api/config
```

## API Endpoints

### Messages

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/messages` | POST | Send message (compatible with Anthropic API) |
| `/v1/messages/count_tokens` | POST | Count tokens in messages |

### Configuration Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get current configuration |
| `/api/config` | POST | Update configuration |
| `/api/transformers` | GET | Get list of available transformers |

### Log Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/logs/files` | GET | Get list of log files |
| `/api/logs` | GET | Get log content |
| `/api/logs` | DELETE | Clear logs |

### Service Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/restart` | POST | Restart service |
| `/ui` | GET | Web management interface |
| `/ui/` | GET | Web management interface (redirect) |

## Authentication

### API Key Authentication

Add API Key in request header:

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '...'
```

## Streaming Responses

The Messages API supports streaming responses (Server-Sent Events):

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{"stream": true, ...}'
```

Streaming response format:

```
event: message_start
data: {"type":"message_start","message":{...}}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}

event: message_stop
data: {"type":"message_stop"}
```
