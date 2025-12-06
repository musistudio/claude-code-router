# How to Use the External Model Configuration Wizard

**Quick Setup Guide for Claude Code Router**

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Guide](#step-by-step-guide)
4. [Supported Providers](#supported-providers)
5. [Troubleshooting](#troubleshooting)
6. [FAQ](#faq)
7. [Advanced Usage](#advanced-usage)

---

## Overview

The External Model Configuration Wizard is an interactive chat-based tool that helps you configure external LLM providers (like Gemini or Qwen) without manually editing configuration files.

### What It Does
- ✅ Guides you through provider setup step-by-step
- ✅ Validates your input at each step
- ✅ Automatically updates your configuration file
- ✅ Creates backups before making changes

### What You'll Need
- 5 minutes of time
- An API key from your chosen provider (Gemini or Qwen)
- Claude Code Router installed and running

---

## Prerequisites

### 1. Get an API Key

Choose one of the supported providers and get an API key:

#### **Gemini (Google AI Studio)**
1. Visit: https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key (format: `AIza...`)

**Free Tier**: Yes, generous free quota available

#### **Qwen (Alibaba Cloud DashScope)**
1. Visit: https://dashscope.console.aliyun.com/
2. Sign in or create an Alibaba Cloud account
3. Navigate to API Keys section
4. Create new API key
5. Copy the key (format: `sk-...`)

**Free Tier**: May vary by region

### 2. Ensure Claude Code Router is Running

```bash
# Check if service is running
ccr status

# If not running, start it
ccr start
```

---

## Step-by-Step Guide

### Step 1: Launch the Wizard

In your Claude Code chat interface, type:

```
/external-model
```

**What You'll See:**
```
Select Provider:
1. Gemini
2. Qwen

Enter 1 or 2, or type /cancel to exit.
```

### Step 2: Select Your Provider

Type `1` for Gemini or `2` for Qwen, then press Enter.

**Example:**
```
User: 1
```

**What You'll See:**
```
Enter your Gemini API key:

Get your API key at: https://makersuite.google.com/app/apikey

Paste your API key below, or type /cancel to exit.
```

### Step 3: Enter Your API Key

Paste your API key exactly as you copied it from the provider's website.

**Example:**
```
User: AIzaSyD-abcdefghijklmnopqrstuvwxyz1234567
```

**What You'll See:**
```
Configuration Preview:
  Provider: Gemini
  API URL: https://generativelanguage.googleapis.com/v1beta
  Models: gemini-1.5-flash, gemini-1.5-pro, gemini-pro
  API Key: AIza...4567

Save this configuration?
(y)es / (n)o
```

**Note**: Your API key is automatically masked for security (only first/last 4 chars shown)

### Step 4: Confirm Configuration

Review the configuration and confirm:

- Type `y` or `yes` to save
- Type `n` or `no` to go back to the menu
- Type `/cancel` to exit without saving

**Example:**
```
User: y
```

**What You'll See:**
```
✓ Configuration saved successfully!

Provider "Gemini" added to config.

To apply changes, restart the service:
  ccr restart

or manually:
  ccr stop
  ccr start
```

### Step 5: Restart the Service

Apply your configuration by restarting:

```bash
ccr restart
```

**Verify It's Working:**
```bash
# Check service status
ccr status

# Should show "Status: Running"
```

---

## Supported Providers

### Gemini (Google AI Studio)

**API URL**: `https://generativelanguage.googleapis.com/v1beta`

**Default Models**:
- `gemini-1.5-flash` - Fast, efficient for most tasks
- `gemini-1.5-pro` - Advanced reasoning, complex tasks
- `gemini-pro` - Stable production model

**Best For**: General-purpose AI tasks, coding assistance, content generation

**Cost**: Free tier available with generous quotas

### Qwen (Alibaba Cloud DashScope)

**API URL**: `https://dashscope.aliyuncs.com/compatible-mode/v1`

**Default Models**:
- `qwen-turbo` - Fast, cost-effective
- `qwen-plus` - Enhanced capabilities
- `qwen-max` - Most capable Qwen model

**Best For**: Multilingual tasks (especially Chinese), code generation, reasoning

**Cost**: Pay-as-you-go, may require Alibaba Cloud account

---

## Troubleshooting

### Issue: "Invalid selection. Please enter 1 or 2."

**Cause**: You entered something other than `1` or `2`

**Solution**:
- Type exactly `1` (for Gemini) or `2` (for Qwen)
- Don't add extra text or spaces

**Example:**
```
❌ Wrong: "1 for Gemini"
✅ Right: "1"
```

---

### Issue: "API key cannot be empty. Please try again."

**Cause**: You submitted empty input or whitespace

**Solution**:
- Copy the full API key from provider's website
- Paste it completely (don't type it manually)
- Check for accidental spaces at the beginning or end

**Example:**
```
❌ Wrong: "   " (spaces only)
❌ Wrong: "" (empty)
✅ Right: "AIzaSyD-abcdefghijklmnopqrstuvwxyz1234567"
```

---

### Issue: "Too many invalid attempts. Restarting wizard."

**Cause**: You made more than 3 invalid inputs at a single step

**Solution**:
- The wizard automatically returns to the provider menu
- Start again and be careful with inputs
- Use copy-paste for API keys to avoid typos

---

### Issue: "Permission denied. Check ~/.claude-code-router/ permissions."

**Cause**: Insufficient write permissions to config directory

**Solution (macOS/Linux)**:
```bash
# Check permissions
ls -la ~/.claude-code-router/

# Fix permissions
chmod 755 ~/.claude-code-router/
chmod 644 ~/.claude-code-router/config.json
```

**Solution (Windows)**:
- Right-click on `C:\Users\<YourName>\.claude-code-router\`
- Properties → Security
- Ensure your user has "Modify" permissions

---

### Issue: "Config file in use. Please try again in a moment."

**Cause**: Another process has the config file open (rare)

**Solution**:
- Wait a few seconds
- Close any text editors that have `config.json` open
- Try running the wizard again

---

### Issue: Wizard session expired / started over

**Cause**: 15 minutes of inactivity

**Solution**:
- Complete the wizard promptly (takes ~1 minute normally)
- If interrupted, simply restart with `/external-model`
- No data is lost - config only saves on final confirmation

---

### Issue: Configuration not working after restart

**Possible Causes & Solutions**:

1. **Service didn't restart properly**
   ```bash
   # Stop completely, then start
   ccr stop
   ccr start
   ```

2. **Invalid API key**
   - Verify the key is active at provider's website
   - Some keys expire after creation
   - Generate a new key and run wizard again

3. **API endpoint inaccessible**
   - Check your internet connection
   - Verify no firewall blocking HTTPS requests
   - Test provider's website in browser

4. **Config file corrupted**
   - Backups are created automatically
   - Check `~/.claude-code-router/config.json.backup-*`
   - Restore from most recent backup if needed

---

## FAQ

### Can I configure multiple providers?

**Yes!** Run the wizard multiple times:
```
1. Type /external-model
2. Select Gemini, enter API key, confirm
3. Restart: ccr restart
4. Type /external-model again
5. Select Qwen, enter API key, confirm
6. Restart: ccr restart
```

Both providers will be saved in your config.

---

### How do I update an existing provider?

Run the wizard and select the same provider again:
```
/external-model
→ Select "1" (Gemini)
→ Enter new API key
→ Confirm "y"
→ Restart: ccr restart
```

The old configuration will be replaced.

---

### Is my API key stored securely?

**Partially**:
- ✅ API keys are **never logged** in plaintext (masked in logs)
- ⚠️ API keys are **not currently stored** in config.json (wizard collects but doesn't persist)
- ⚠️ You'll need to manage API keys separately via environment variables

**Future Enhancement**: Secure API key storage coming soon

---

### Can I cancel the wizard mid-way?

**Yes!** Type `/cancel` at any step:
```
User: /cancel

Wizard cancelled. No changes were made to your configuration.
```

No changes are saved until you confirm at the final step.

---

### What if I make a mistake?

**During wizard**:
- Invalid inputs: You get 3 retry attempts per step
- After 3 retries: Wizard returns to provider menu
- You can always type `/cancel` and start over

**After confirmation**:
- Config backups are created automatically
- Find them at: `~/.claude-code-router/config.json.backup-<timestamp>`
- Last 3 backups are kept
- Restore manually if needed

---

### How long does my wizard session last?

**15 minutes** of inactivity before timeout.

Typical completion time: **1-2 minutes**

If you get interrupted:
- Session expires after 15 minutes
- Simply restart with `/external-model`
- No partial data is saved

---

### Can I use the wizard while other users are configuring?

**Yes!** The wizard supports concurrent sessions:
- Each chat session is isolated
- Up to 100 concurrent wizards supported
- Session IDs track which wizard belongs to whom

---

### What happens to my existing config?

**Automatically preserved**:
- ✅ Backup created before any changes
- ✅ Other providers remain untouched
- ✅ Router settings preserved
- ✅ Only selected provider is added/updated

**Atomicity guarantee**: Either all changes apply, or none (no partial writes)

---

## Advanced Usage

### Manual Configuration (Alternative)

If the wizard isn't available, manually edit `~/.claude-code-router/config.json`:

**Gemini Example**:
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

**Qwen Example**:
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

**After manual edit**: Restart with `ccr restart`

---

### Checking Configuration

**View current config**:
```bash
# macOS/Linux
cat ~/.claude-code-router/config.json

# Windows
type %USERPROFILE%\.claude-code-router\config.json
```

**Check for backups**:
```bash
# macOS/Linux
ls -la ~/.claude-code-router/config.json.backup-*

# Windows
dir %USERPROFILE%\.claude-code-router\config.json.backup-*
```

---

### Restoring from Backup

**Find backup files**:
```bash
~/.claude-code-router/config.json.backup-2025-12-06T10-30-45-123Z
~/.claude-code-router/config.json.backup-2025-12-06T10-25-30-456Z
~/.claude-code-router/config.json.backup-2025-12-06T10-20-15-789Z
```

**Restore (macOS/Linux)**:
```bash
# Copy backup to restore it
cp ~/.claude-code-router/config.json.backup-2025-12-06T10-30-45-123Z \
   ~/.claude-code-router/config.json

# Restart service
ccr restart
```

**Restore (Windows)**:
```cmd
copy %USERPROFILE%\.claude-code-router\config.json.backup-2025-12-06T10-30-45-123Z ^
     %USERPROFILE%\.claude-code-router\config.json

ccr restart
```

---

### Removing a Provider

Currently, providers must be removed manually:

**Steps**:
1. Open `~/.claude-code-router/config.json`
2. Find the provider in the `Providers` array
3. Delete the entire provider object (including braces and comma)
4. Save the file
5. Restart: `ccr restart`

**Example**:
```json
{
  "Providers": [
    {
      "name": "Gemini",
      "api_base_url": "...",
      "models": [...]
    },
    // Delete this entire block ↓
    {
      "name": "Qwen",
      "api_base_url": "...",
      "models": [...]
    }
  ]
}
```

---

### Debugging

**Enable debug logs** (if service runs in terminal):

Look for structured logs:
```
[WizardManager] New wizard session started: abc123 → menu
[WizardManager] Session abc123: menu → api_key (provider: gemini)
[WizardManager] Session abc123: api_key → confirm (API key: AIza...4567)
[ConfigManager] Reading config from: /path/to/config.json
[ConfigManager] Config loaded successfully (1 providers)
```

**Check service logs**:
```bash
# If running as daemon
ccr logs

# Or check log files
tail -f ~/.claude-code-router/logs/*.log
```

---

## Quick Reference Card

### Wizard Commands

| Command | Action |
|---------|--------|
| `/external-model` | Start wizard |
| `1` | Select Gemini |
| `2` | Select Qwen |
| `y` or `yes` | Confirm configuration |
| `n` or `no` | Go back to menu |
| `/cancel` | Exit wizard (no changes) |

### Service Commands

| Command | Action |
|---------|--------|
| `ccr start` | Start service |
| `ccr stop` | Stop service |
| `ccr restart` | Restart service (apply changes) |
| `ccr status` | Check if running |

### File Locations

| File | Location |
|------|----------|
| Config | `~/.claude-code-router/config.json` |
| Backups | `~/.claude-code-router/config.json.backup-*` |
| Logs | `~/.claude-code-router/logs/` |

---

## Getting Help

### Documentation
- **Feature Spec**: `specs/001-external-model-wizard/spec.md`
- **Quickstart**: `specs/001-external-model-wizard/quickstart.md`
- **Implementation**: `specs/001-external-model-wizard/IMPLEMENTATION_SUMMARY.md`

### Support
- Check service logs: `ccr logs`
- Review backup files if config corrupted
- Verify API key at provider's website
- Ensure service has write permissions

### Report Issues
- Provide error message from wizard
- Include relevant logs (with API keys redacted)
- Describe steps to reproduce

---

**Happy configuring! 🚀**

*This wizard makes external provider setup simple and error-free. If you encounter any issues, refer to the troubleshooting section above.*
