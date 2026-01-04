# CLI 基础配置

CLI 使用与 Server 相同的配置文件：`~/.claude-code-router/config.json`

## 配置文件位置

```bash
~/.claude-code-router/config.json
```

## 快速配置

使用交互式命令配置：

```bash
ccr model
```

这将引导你完成：
1. 选择 LLM 提供商
2. 配置 API Key
3. 选择模型
4. 设置路由规则

## 手动配置

### 编辑配置文件

```bash
# 打开配置文件
nano ~/.claude-code-router/config.json
```

### 最小配置示例

```json5
{
  // API 密钥（可选，用于保护服务）
  "APIKEY": "your-api-key-here",

  // LLM 提供商
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],

  // 默认路由
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

## 环境变量

配置支持环境变量插值：

```json5
{
  "Providers": [
    {
      "apiKey": "$OPENAI_API_KEY"  // 从环境变量读取
    }
  ]
}
```

在 `.bashrc` 或 `.zshrc` 中设置：

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

## 常用配置项

### HOST 和 PORT

```json5
{
  "HOST": "127.0.0.1",  // 监听地址
  "PORT": 3456          // 监听端口
}
```

### 日志配置

```json5
{
  "LOG": true,          // 启用日志
  "LOG_LEVEL": "info"   // 日志级别
}
```

### 路由配置

```json5
{
  "Router": {
    "default": "openai,gpt-4",
    "background": "openai,gpt-3.5-turbo",
    "think": "openai,gpt-4",
    "longContext": "anthropic,claude-3-opus"
  }
}
```

## 配置验证

配置文件会自动验证。常见错误：

- **缺少 Providers**：必须至少配置一个提供商
- **API Key 缺失**：如果配置了 Providers，必须提供 API Key
- **模型不存在**：确保模型在提供商的 models 列表中

## 配置备份

每次更新配置时会自动备份：

```
~/.claude-code-router/config.backup.{timestamp}.json
```

## 重新加载配置

修改配置后需要重启服务：

```bash
ccr restart
```

## 查看当前配置

```bash
# 通过 API 查看
curl http://localhost:3456/api/config

# 或查看配置文件
cat ~/.claude-code-router/config.json
```

## 示例配置

### OpenAI

```json5
{
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

### Anthropic

```json5
{
  "Providers": [
    {
      "name": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1",
      "apiKey": "$ANTHROPIC_API_KEY",
      "models": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"]
    }
  ],
  "Router": {
    "default": "anthropic,claude-3-5-sonnet-20241022"
  }
}
```

### 多提供商

```json5
{
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    },
    {
      "name": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1",
      "apiKey": "$ANTHROPIC_API_KEY",
      "models": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4",
    "think": "anthropic,claude-3-5-sonnet-20241022",
    "background": "openai,gpt-3.5-turbo"
  }
}
```
