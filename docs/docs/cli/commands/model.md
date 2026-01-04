---
sidebar_position: 2
---

# ccr model

Interactive model selection and configuration.

## Usage

```bash
ccr model [command]
```

## Commands

### Select Model

Interactively select a model:

```bash
ccr model
```

This will display an interactive menu with available providers and models.

### Set Default Model

Set the default model directly:

```bash
ccr model set <provider>,<model>
```

Example:

```bash
ccr model set deepseek,deepseek-chat
```

### List Models

List all configured models:

```bash
ccr model list
```

### Add Model

Add a new model to configuration:

```bash
ccr model add <provider>,<model>
```

Example:

```bash
ccr model add groq,llama-3.3-70b-versatile
```

### Remove Model

Remove a model from configuration:

```bash
ccr model remove <provider>,<model>
```

## Examples

### Interactive selection

```bash
$ ccr model

? Select a provider: deepseek
? Select a model: deepseek-chat

Default model set to: deepseek,deepseek-chat
```

### Direct configuration

```bash
ccr model set deepseek,deepseek-chat
```

### View current configuration

```bash
ccr model list
```

Output:

```
Configured Models:
  deepseek,deepseek-chat (default)
  groq,llama-3.3-70b-versatile
  gemini,gemini-1.5-pro
```

## Related Commands

- [ccr start](/docs/cli/start) - Start the server
- [ccr config](/docs/cli/other-commands#ccr-config) - Edit configuration
