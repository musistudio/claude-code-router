# API 概览

Claude Code Router Server 提供了完整的 HTTP API，支持：

- **消息 API**：兼容 Anthropic Claude API 的消息接口
- **配置 API**：读取和更新服务器配置
- **日志 API**：查看和管理服务日志
- **工具 API**：计算 Token 数量

## 基础信息

**Base URL**: `http://localhost:3456`

**认证方式**: API Key（通过 `x-api-key` 请求头）

```bash
curl -H "x-api-key: your-api-key" http://localhost:3456/api/config
```

## API 端点列表

### 消息相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/v1/messages` | POST | 发送消息（兼容 Anthropic API） |
| `/v1/messages/count_tokens` | POST | 计算消息的 Token 数量 |

### 配置管理

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/config` | GET | 获取当前配置 |
| `/api/config` | POST | 更新配置 |
| `/api/transformers` | GET | 获取可用的转换器列表 |

### 日志管理

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/logs/files` | GET | 获取日志文件列表 |
| `/api/logs` | GET | 获取日志内容 |
| `/api/logs` | DELETE | 清除日志 |

### 服务管理

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/restart` | POST | 重启服务 |
| `/ui` | GET | Web 管理界面 |
| `/ui/` | GET | Web 管理界面（重定向） |

## 认证

### API Key 认证

在请求头中添加 API Key：

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '...'
```

## 流式响应

消息 API 支持流式响应（Server-Sent Events）：

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{"stream": true, ...}'
```

流式响应格式：

```
event: message_start
data: {"type":"message_start","message":{...}}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}

event: message_stop
data: {"type":"message_stop"}
```
