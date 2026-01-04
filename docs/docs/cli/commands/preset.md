---
sidebar_position: 5
---

# ccr preset

Manage presets - configuration templates that can be shared and reused.

## Overview

Presets allow you to:
- Save your current configuration as a reusable template
- Share configurations with others
- Install pre-configured setups from the community
- Switch between different configurations easily

## Commands

### export

Export your current configuration as a preset.

```bash
ccr preset export <name> [options]
```

**Options:**
- `--output <path>` - Custom output directory path
- `--description <text>` - Preset description
- `--author <name>` - Preset author
- `--tags <tags>` - Comma-separated keywords
- `--include-sensitive` - Include API keys and sensitive data (not recommended)

**Example:**
```bash
ccr preset export my-config --description "My production setup" --author "Your Name"
```

**What happens:**
1. Reads current configuration from `~/.claude-code-router/config.json`
2. Prompts for description, author, and keywords (if not provided)
3. Sanitizes sensitive fields (API keys become placeholders)
4. Creates preset directory at `~/.claude-code-router/presets/<name>/`
5. Generates `manifest.json` with configuration and metadata

### install

Install a preset from a local directory.

```bash
ccr preset install <source>
```

**Sources:**
- Local directory path: `/path/to/preset-directory`
- Preset name (for reconfiguring an already installed preset): `preset-name`

**Example:**
```bash
# Install from directory
ccr preset install ./my-preset

# Reconfigure an installed preset
ccr preset install my-preset
```

**What happens:**
1. Reads `manifest.json` from the preset directory
2. Validates the preset structure
3. If the preset has a `schema`, prompts for required values (API keys, etc.)
4. Copies preset to `~/.claude-code-router/presets/<name>/`
5. Saves user inputs in `manifest.json`

**Note:** URL installation is not currently supported. Download the preset directory first.

### list

List all installed presets.

```bash
ccr preset list
```

**Example output:**
```
Available presets:

• my-config (v1.0.0)
  My production setup
  by Your Name

• openai-setup
  Basic OpenAI configuration
```

### info

Show detailed information about a preset.

```bash
ccr preset info <name>
```

**Shows:**
- Version, description, author, keywords
- Configuration summary (Providers, Router rules)
- Required inputs (if any)

**Example:**
```bash
ccr preset info my-config
```

### delete / rm / remove

Delete an installed preset.

```bash
ccr preset delete <name>
ccr preset rm <name>
ccr preset remove <name>
```

**Example:**
```bash
ccr preset delete my-config
```

## Preset Structure

A preset is a directory containing a `manifest.json` file:

```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "My configuration",
  "author": "Author Name",
  "keywords": ["openai", "production"],

  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "{{apiKey}}",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],

  "Router": {
    "default": "openai,gpt-4"
  },

  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "OpenAI API Key",
      "prompt": "Enter your OpenAI API key"
    }
  ]
}
```

### Schema System

The `schema` field defines inputs that users must provide during installation:

**Field types:**
- `password` - Hidden input (for API keys)
- `input` - Text input
- `select` - Single selection from options
- `multiselect` - Multiple selection
- `confirm` - Yes/No confirmation
- `editor` - Multi-line text
- `number` - Numeric input

**Dynamic options:**
```json
{
  "id": "provider",
  "type": "select",
  "label": "Select Provider",
  "options": {
    "type": "providers"
  }
}
```

**Conditional fields:**
```json
{
  "id": "model",
  "type": "select",
  "label": "Select Model",
  "when": {
    "field": "provider",
    "operator": "exists"
  },
  "options": {
    "type": "models",
    "providerField": "#{selectedProvider}"
  }
}
```

## Sharing Presets

To share a preset:

1. **Export your configuration:**
   ```bash
   ccr preset export my-preset
   ```

2. **Share the directory:**
   ```bash
   ~/.claude-code-router/presets/my-preset/
   ```

3. **Distribution methods:**
   - Upload to GitHub repository
   - Create a GitHub Gist
   - Share as a zip file
   - Publish on npm (future feature)

4. **Users install with:**
   ```bash
   ccr preset install /path/to/my-preset
   ```

## Security

### Automatic Sanitization

By default, `export` sanitizes sensitive fields:
- Fields named `api_key`, `apikey`, `password`, `secret` are replaced with `{{fieldName}}` placeholders
- These placeholders become required inputs in the schema
- Users are prompted to provide their own values during installation

### Include Sensitive Data

To include actual values (not recommended):
```bash
ccr preset export my-preset --include-sensitive
```

**Warning:** Never share presets containing sensitive data!

## Related Documentation

- [Configuration Guide](/docs/cli/config/basic) - Basic configuration
- [Project-Level Configuration](/docs/cli/config/project-level) - Project-specific settings
- [Presets](/docs/presets/intro) - Advanced preset topics
