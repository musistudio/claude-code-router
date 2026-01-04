# 项目级配置

除了全局配置，`ccr` 还支持为特定项目设置不同的路由规则。

## 项目配置文件

项目配置文件位于：

```
~/.claude/projects/<project-id>/claude-code-router.json
```

其中 `<project-id>` 是 Claude Code 项目的唯一标识符。

## 项目配置结构

```json5
{
  "Router": {
    "default": "openai,gpt-4",
    "background": "openai,gpt-3.5-turbo"
  }
}
```

## 查找项目 ID

### 方法一：使用 CLI

```bash
# 在项目目录中运行
ccr status
```

输出会显示当前项目 ID：

```
Project: my-project (abc123def456)
```

### 方法二：查看 Claude Code 配置

```bash
cat ~/.claude.json
```

找到你的项目 ID：

```json
{
  "projects": {
    "abc123def456": {
      "path": "/path/to/your/project",
      "name": "my-project"
    }
  }
}
```

## 创建项目配置

### 手动创建

```bash
# 创建项目配置目录
mkdir -p ~/.claude/projects/abc123def456

# 创建配置文件
cat > ~/.claude/projects/abc123def456/claude-code-router.json << 'EOF'
{
  "Router": {
    "default": "anthropic,claude-3-5-sonnet-20241022",
    "background": "openai,gpt-3.5-turbo"
  }
}
EOF
```

### 使用 ccr model 命令

```bash
# 在项目目录中运行
cd /path/to/your/project
ccr model --project
```

## 配置优先级

路由配置的优先级（从高到低）：

1. **自定义路由函数** (`CUSTOM_ROUTER_PATH`)
2. **项目级配置** (`~/.claude/projects/<id>/claude-code-router.json`)
3. **全局配置** (`~/.claude-code-router/config.json`)
4. **内置路由规则**

## 使用场景

### 场景一：不同项目使用不同模型

```json5
// Web 项目使用 GPT-4
~/.claude/projects/web-project-id/claude-code-router.json:
{
  "Router": {
    "default": "openai,gpt-4"
  }
}

// AI 项目使用 Claude
~/.claude/projects/ai-project-id/claude-code-router.json:
{
  "Router": {
    "default": "anthropic,claude-3-5-sonnet-20241022"
  }
}
```

### 场景二：测试项目使用低成本模型

```json5
~/.claude/projects/test-project-id/claude-code-router.json:
{
  "Router": {
    "default": "openai,gpt-3.5-turbo",
    "background": "openai,gpt-3.5-turbo"
  }
}
```

### 场景三：长上下文项目

```json5
~/.claude/projects/long-context-project-id/claude-code-router.json:
{
  "Router": {
    "default": "anthropic,claude-3-opus-20240229",
    "longContext": "anthropic,claude-3-opus-20240229"
  }
}
```

## 验证项目配置

```bash
# 查看当前项目使用的路由
ccr status

# 查看日志确认路由决策
tail -f ~/.claude-code-router/claude-code-router.log
```

## 删除项目配置

```bash
rm ~/.claude/projects/<project-id>/claude-code-router.json
```

删除后会回退到全局配置。

## 完整示例

假设你有两个项目：

### 全局配置（`~/.claude-code-router/config.json`）

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
      "models": ["claude-3-5-sonnet-20241022"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4",
    "background": "openai,gpt-3.5-turbo"
  }
}
```

### Web 项目配置

```json5
{
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

### AI 项目配置

```json5
{
  "Router": {
    "default": "anthropic,claude-3-5-sonnet-20241022",
    "think": "anthropic,claude-3-5-sonnet-20241022"
  }
}
```

这样：
- Web 项目使用 GPT-4
- AI 项目使用 Claude
- 所有项目的后台任务使用 GPT-3.5-turbo（继承全局配置）
