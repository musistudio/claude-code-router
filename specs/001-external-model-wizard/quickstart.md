# Quickstart Guide: External Model Configuration Wizard

**Feature**: `001-external-model-wizard`
**Date**: 2025-12-06

## Overview

The External Model Configuration Wizard provides an interactive chat-based interface for configuring external LLM providers (Gemini, Qwen) without manually editing configuration files.

---

## Prerequisites

1. **Running Claude Code Router**: Service must be running (`ccr start` or `ccr status`)
2. **API Key**: Obtain an API key from your chosen provider before starting the wizard
3. **Chat Interface**: Access to Claude Code CLI or compatible chat client

---

## Getting API Keys

### Gemini (Google AI Studio)

1. Visit: https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Click "Create API Key"
4. Copy the generated key (format: `AIza...`)

**Requirements**: Google account (free tier available)

### Qwen (Alibaba Cloud DashScope)

1. Visit: https://dashscope.console.aliyun.com/
2. Sign in or create Alibaba Cloud account
3. Navigate to API Keys section
4. Create new API key
5. Copy the generated key (format: `sk-...`)

**Requirements**: Alibaba Cloud account (may require regional availability)

---

## Using the Wizard

### Step-by-Step Instructions

#### 1. Start the Wizard

In your chat interface, type:

```
/external-model
```

**Expected Response**:
```
Select Provider:
1. Gemini
2. Qwen

Enter 1 or 2, or type /cancel to exit.
```

#### 2. Select Provider

Reply with the number corresponding to your choice:

**For Gemini**: Type `1`
**For Qwen**: Type `2`

**Expected Response**:
```
Enter your [Provider] API key:

Get your API key at: [provider-specific URL]

Paste your key below, or type /cancel to exit.
```

#### 3. Enter API Key

Paste your API key exactly as copied from the provider website.

**Example (Gemini)**:
```
AIzaSyD-abcdefghijklmnopqrstuvwxyz1234567
```

**Example (Qwen)**:
```
sk-1234567890abcdefghijklmnopqrstuvwxyz
```

**Note**: API key will be masked in logs (displayed as `***`) for security.

**Expected Response**:
```
Configuration Preview:
  Provider: [Provider Name]
  API URL: [api_base_url]
  Models: [model1, model2, model3]

Save this configuration?
(y)es / (n)o
```

#### 4. Confirm Configuration

Review the configuration preview and confirm:

**To save**: Type `y` or `yes`
**To restart**: Type `n` or `no` (returns to provider menu)
**To cancel**: Type `/cancel`

**Expected Response (on success)**:
```
✓ Configuration saved successfully!

Provider "[Provider Name]" added to config.

To apply changes, restart the service:
  ccr restart

or manually:
  ccr stop
  ccr start
```

#### 5. Restart Service

Apply the configuration changes by restarting:

```bash
ccr restart
```

**Verification**: Check service status:
```bash
ccr status
```

---

## Wizard Commands

| Command | Action | Available At |
|---------|--------|--------------|
| `/external-model` | Start wizard | Any time (not in wizard) |
| `/cancel` | Exit wizard without saving | Any wizard step |
| `1` or `2` | Select provider | Provider menu step |
| `y` or `yes` | Confirm and save | Confirmation step |
| `n` or `no` | Reject and restart | Confirmation step |

---

## Error Handling

### Common Errors and Solutions

#### Invalid Provider Selection

**Error**: `Invalid selection. Please enter 1 or 2.`

**Cause**: Entered value other than `1` or `2`

**Solution**: Type exactly `1` or `2` (no extra characters)

---

#### Empty API Key

**Error**: `API key cannot be empty. Please try again.`

**Cause**: Submitted empty input or whitespace-only

**Solution**: Paste valid API key (check for accidental spaces)

---

#### Too Many Invalid Attempts

**Error**: `Too many invalid attempts. Restarting wizard.`

**Cause**: More than 3 invalid inputs at a single step

**Solution**: Wizard returns to provider menu; re-select and continue

---

#### Permission Denied

**Error**: `Permission denied. Check ~/.claude-code-router/ permissions.`

**Cause**: Insufficient write permissions to config directory

**Solution**:
```bash
# Check permissions
ls -la ~/.claude-code-router/

# Fix permissions (if needed)
chmod 755 ~/.claude-code-router/
chmod 644 ~/.claude-code-router/config.json
```

---

#### Config File Locked

**Error**: `Config file in use. Please try again in a moment.`

**Cause**: Another process has config file open (rare)

**Solution**: Wait a few seconds and retry wizard

---

#### Config Directory Missing

**Error**: `Config directory not found. Creating...`

**Cause**: First-time setup or manually deleted directory

**Solution**: Wizard auto-creates directory; no action needed

---

#### Invalid JSON in Config

**Error**: `Config file corrupted. Creating backup and resetting...`

**Cause**: Manually edited config with syntax errors

**Solution**: Wizard backs up corrupted file and creates fresh config

**Recovery**: Check `~/.claude-code-router/config.json.backup-*` for old settings

---

## Session Timeout

**Behavior**: Wizard sessions expire after 15 minutes of inactivity

**Impact**: If inactive, next message starts new wizard session from beginning

**Workaround**: Complete wizard promptly or restart `/external-model` if timed out

---

## Configuration File Location

**Path**: `~/.claude-code-router/config.json`

**Backups**: `~/.claude-code-router/config.json.backup-{timestamp}`

**Backup Retention**: Last 3 backups kept automatically

---

## Manual Configuration (Alternative)

If wizard is unavailable, manually edit `~/.claude-code-router/config.json`:

### Gemini Example

```json
{
  "Providers": [
    {
      "name": "Gemini",
      "api_base_url": "https://generativelanguage.googleapis.com/v1beta",
      "models": ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]
    }
  ]
}
```

### Qwen Example

```json
{
  "Providers": [
    {
      "name": "Qwen",
      "api_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "models": ["qwen-turbo", "qwen-plus", "qwen-max"]
    }
  ]
}
```

**After manual edit**: Restart service (`ccr restart`)

---

## FAQ

### Can I configure multiple providers?

Yes! Run `/external-model` wizard multiple times, selecting different providers each time. All providers are preserved in `config.json`.

### How do I update an existing provider?

Run `/external-model` and select the same provider again. Wizard will update (replace) the existing configuration.

### Is my API key stored securely?

API key is stored in plaintext in `~/.claude-code-router/config.json`. Ensure appropriate file permissions (readable only by your user):
```bash
chmod 600 ~/.claude-code-router/config.json
```

### Can I remove a provider?

Currently, providers must be removed by manually editing `config.json` and removing the provider object from the `Providers` array. Restart service after editing.

### What happens if I cancel mid-wizard?

Wizard state is discarded immediately. No changes are made to `config.json`. You can restart `/external-model` at any time.

### Do I need to restart after every configuration change?

Yes. Provider configurations are loaded at startup. Changes require restart to take effect.

### Can I run multiple wizards simultaneously?

Each wizard session is independent. Multiple terminal windows can run separate wizards concurrently (last save wins if same provider).

---

## Troubleshooting

### Wizard Not Responding

1. Check service status: `ccr status`
2. Review logs: `ccr logs` or check `~/.claude-code-router/logs/`
3. Restart service: `ccr restart`
4. Retry wizard: `/external-model`

### Configuration Not Applied

1. Verify config saved: `cat ~/.claude-code-router/config.json`
2. Confirm service restarted: `ccr status` (check uptime)
3. Check for errors in logs: `ccr logs`

### Provider Not Working After Configuration

1. Verify API key validity (test with provider's web console)
2. Check API endpoint accessibility (network/firewall issues)
3. Review service logs for authentication errors
4. Confirm model names are correct for provider

---

## Next Steps

After configuring providers:

1. **Test Provider**: Send a test message to verify routing works
2. **Configure Routing** (optional): Edit routing rules in config.json to use new provider
3. **Monitor Usage**: Check logs for provider API calls and responses

For advanced configuration and routing setup, see main documentation.

---

## Support

**Issues**: Report bugs or request features at project repository
**Logs**: Check `~/.claude-code-router/logs/` for detailed error messages
**Config**: Backup your config before major changes
