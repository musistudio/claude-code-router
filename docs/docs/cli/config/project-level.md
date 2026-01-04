---
title: Project-Level Configuration
---

# Project-Level Configuration

In addition to global configuration, `ccr` also supports setting different routing rules for specific projects.

## Project Configuration File

Project configuration file is located at:

```
~/.claude/projects/<project-id>/claude-code-router.json
```

Where `<project-id>` is the unique identifier of the Claude Code project.

## Project Configuration Structure

```json5
{
  "Router": {
    "default": "openai,gpt-4",
    "background": "openai,gpt-3.5-turbo"
  }
}
```

## Finding Project ID

### Method 1: Using CLI

```bash
# Run in project directory
ccr status
```

Output will show current project ID:

```
Project: my-project (abc123def456)
```

### Method 2: Check Claude Code Configuration

```bash
cat ~/.claude.json
```

Find your project ID:

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

## Creating Project Configuration

### Manual Creation

```bash
# Create project configuration directory
mkdir -p ~/.claude/projects/abc123def456

# Create configuration file
cat > ~/.claude/projects/abc123def456/claude-code-router.json << 'EOF'
{
  "Router": {
    "default": "anthropic,claude-3-5-sonnet-20241022",
    "background": "openai,gpt-3.5-turbo"
  }
}
EOF
```

### Using ccr model Command

```bash
# Run in project directory
cd /path/to/your/project
ccr model --project
```

## Configuration Priority

Routing configuration priority (from high to low):

1. **Custom routing function** (`CUSTOM_ROUTER_PATH`)
2. **Project-level configuration** (`~/.claude/projects/<id>/claude-code-router.json`)
3. **Global configuration** (`~/.claude-code-router/config.json`)
4. **Built-in routing rules**

## Use Cases

### Scenario 1: Different Projects Use Different Models

```json5
// Web project uses GPT-4
~/.claude/projects/web-project-id/claude-code-router.json:
{
  "Router": {
    "default": "openai,gpt-4"
  }
}

// AI project uses Claude
~/.claude/projects/ai-project-id/claude-code-router.json:
{
  "Router": {
    "default": "anthropic,claude-3-5-sonnet-20241022"
  }
}
```

### Scenario 2: Test Projects Use Low-Cost Models

```json5
~/.claude/projects/test-project-id/claude-code-router.json:
{
  "Router": {
    "default": "openai,gpt-3.5-turbo",
    "background": "openai,gpt-3.5-turbo"
  }
}
```

### Scenario 3: Long Context Projects

```json5
~/.claude/projects/long-context-project-id/claude-code-router.json:
{
  "Router": {
    "default": "anthropic,claude-3-opus-20240229",
    "longContext": "anthropic,claude-3-opus-20240229"
  }
}
```

## Verify Project Configuration

```bash
# View routing used by current project
ccr status

# Check logs to confirm routing decisions
tail -f ~/.claude-code-router/claude-code-router.log
```

## Delete Project Configuration

```bash
rm ~/.claude/projects/<project-id>/claude-code-router.json
```

After deletion, falls back to global configuration.

## Complete Example

Assume you have two projects:

### Global Configuration (`~/.claude-code-router/config.json`)

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

### Web Project Configuration

```json5
{
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

### AI Project Configuration

```json5
{
  "Router": {
    "default": "anthropic,claude-3-5-sonnet-20241022",
    "think": "anthropic,claude-3-5-sonnet-20241022"
  }
}
```

This way:
- Web project uses GPT-4
- AI project uses Claude
- All projects' background tasks use GPT-3.5-turbo (inherit global configuration)
