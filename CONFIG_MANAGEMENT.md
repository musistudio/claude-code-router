# 配置管理优化功能

本文档介绍了 Claude Code Router 项目中新增的配置管理优化功能。

## 新增功能概览

### 1. 配置验证 (Configuration Validation)
- 自动验证配置文件的完整性和正确性
- 提供详细的错误和警告信息
- 支持多种验证规则（必填字段、URL格式、模型匹配等）

### 2. 配置热重载 (Hot Reload)
- 监听配置文件变化，自动重新加载
- 防抖处理，避免频繁重载
- 保持服务运行状态下更新配置

### 3. 交互式配置设置
- 提供多种预设模板（DeepSeek、OpenRouter、Ollama）
- 引导式配置创建流程
- 自动验证生成的配置

## 使用方法

### 1. 交互式配置设置
```bash
# 启动交互式配置向导
ccr setup
```

这将引导你完成以下步骤：
- 选择提供商模板（DeepSeek/OpenRouter/Ollama/自定义）
- 输入必要的 API 密钥和配置信息
- 自动验证配置并保存

### 2. 验证现有配置
```bash
# 验证当前配置文件
ccr validate
```

输出示例：
```
✅ Configuration is valid!

⚠️  Configuration warnings:
  - Router.background: Router model should be in format 'provider,model'
```

### 3. 查看当前配置
```bash
# 显示当前配置内容
ccr config
```

### 4. 测试热重载功能
```bash
# 启动热重载测试
ccr test-reload
```

然后编辑配置文件，保存后会看到实时的变化检测。

## 配置验证规则

### 提供商验证
- ✅ 提供商名称不能为空
- ✅ API 基础 URL 必须是有效的 URL 格式
- ✅ 模型列表不能为空
- ✅ 提供商名称不能重复

### 路由验证
- ✅ 默认路由配置是必需的
- ✅ 路由格式应为 'provider,model'
- ✅ 引用的提供商必须存在
- ✅ 引用的模型必须在提供商的模型列表中

### 转换器验证
- ✅ 转换器配置必须包含 'use' 字段
- ✅ 'use' 字段必须是数组格式

## 配置模板

### DeepSeek 模板
```json
{
  "LOG": true,
  "Providers": [{
    "name": "deepseek",
    "api_base_url": "https://api.deepseek.com/chat/completions",
    "api_key": "your-api-key",
    "models": ["deepseek-chat", "deepseek-reasoner"],
    "transformer": {
      "use": ["deepseek"],
      "deepseek-chat": {
        "use": ["tooluse"]
      }
    }
  }],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "think": "deepseek,deepseek-reasoner"
  }
}
```

### OpenRouter 模板
```json
{
  "LOG": true,
  "Providers": [{
    "name": "openrouter",
    "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
    "api_key": "your-api-key",
    "models": [
      "google/gemini-2.5-pro-preview",
      "anthropic/claude-3.5-sonnet"
    ],
    "transformer": {
      "use": ["openrouter"]
    }
  }],
  "Router": {
    "default": "openrouter,anthropic/claude-3.5-sonnet",
    "longContext": "openrouter,google/gemini-2.5-pro-preview"
  }
}
```

### Ollama 模板
```json
{
  "LOG": true,
  "Providers": [{
    "name": "ollama",
    "api_base_url": "http://localhost:11434/v1/chat/completions",
    "api_key": "ollama",
    "models": ["qwen2.5-coder:latest"]
  }],
  "Router": {
    "default": "ollama,qwen2.5-coder:latest",
    "background": "ollama,qwen2.5-coder:latest"
  }
}
```

## 热重载工作原理

1. **文件监听**: 使用 Node.js 的 `fs.watch` API 监听配置文件变化
2. **防抖处理**: 使用 1 秒的防抖延迟，避免频繁的文件变化触发多次重载
3. **配置验证**: 重载前先验证新配置的有效性
4. **差异检测**: 比较新旧配置，只在实际内容变化时触发更新
5. **事件通知**: 通过 EventEmitter 通知应用程序配置已更新

## 错误处理

### 配置验证失败
- 显示详细的错误信息
- 保持当前配置不变
- 提供修复建议

### 热重载失败
- 记录错误日志
- 保持服务运行
- 发出错误事件通知

### 文件访问错误
- 优雅降级处理
- 提供用户友好的错误信息
- 自动重试机制

## 最佳实践

1. **配置备份**: 系统会自动备份配置文件，避免意外丢失
2. **渐进式验证**: 先验证后应用，确保配置的有效性
3. **日志记录**: 详细记录配置变化和错误信息
4. **模板使用**: 优先使用预设模板，减少配置错误
5. **定期验证**: 定期运行 `ccr validate` 检查配置健康状态

## 技术实现细节

### 配置验证器 (ConfigValidator)
- 使用策略模式实现不同类型的验证规则
- 支持错误和警告两个级别的验证结果
- 可扩展的验证规则系统

### 配置管理器 (ConfigManager)
- 继承 EventEmitter，支持事件驱动的配置更新
- 实现防抖机制，优化性能
- 提供配置差异检测功能

### 配置 CLI (ConfigCli)
- 交互式命令行界面
- 支持多种配置模板
- 集成配置验证和测试功能

这些优化显著提升了项目的配置管理能力，使得用户可以更安全、更便捷地管理和更新配置。