---
sidebar_position: 5
---

# ccr usage

View token usage statistics for your API requests.

## Overview

The `ccr usage` command provides detailed statistics about token consumption across your LLM providers and models. This helps you monitor costs, analyze usage patterns, and optimize your configuration.

## Usage

```bash
ccr usage                    # Show today's usage
ccr usage --date YYYY-MM-DD  # Show usage for a specific date
ccr usage --start DATE --end DATE  # Show usage for a date range
ccr usage export [options]   # Export usage data
ccr usage cleanup [options]  # Clean up old usage data
```

## Commands

### Show Usage

Display usage statistics for a specific time period.

```bash
# Today's usage
ccr usage

# Specific date
ccr usage --date 2025-03-25

# Date range
ccr usage --start 2025-03-01 --end 2025-03-31
```

#### Options

| Option | Description |
|--------|-------------|
| `--date <date>` | Show usage for a specific date (YYYY-MM-DD format) |
| `--start <date>` | Start date for range query |
| `--end <date>` | End date for range query |
| `--provider <name>` | Filter by provider name |
| `--model <name>` | Filter by model name |

#### Output Example

```
═══════════════════════════════════════════════
Usage for 2025-03-25:
═══════════════════════════════════════════════

Summary:
  Total Requests:  150
  Success:         145
  Failed:          5

  Input Tokens:    125,000 (125K)
  Output Tokens:   45,000 (45K)
  Total Tokens:    170,000 (170K)

By Provider:
  zhipu:
    80 requests, 95,000 tokens
      - glm-4.6: 50 requests, 60,000 tokens
      - glm-4.7: 30 requests, 35,000 tokens
  deepseek:
    50 requests, 55,000 tokens
      - deepseek-v3.2: 50 requests, 55,000 tokens
  minimax:
    20 requests, 20,000 tokens

By Model:
  glm-4.6 (zhipu):
    50 requests, 60,000 tokens
  deepseek-v3.2 (deepseek):
    50 requests, 55,000 tokens
  glm-4.7 (zhipu):
    30 requests, 35,000 tokens
```

### Export Usage

Export usage data to JSON or CSV format.

```bash
ccr usage export                    # Export all data as JSON
ccr usage export --format csv       # Export as CSV
ccr usage export --start 2025-03-01 --end 2025-03-31  # Export specific range
ccr usage export --output ./my-usage.json  # Specify output file
```

#### Options

| Option | Description |
|--------|-------------|
| `--format <format>` | Export format: `json` (default) or `csv` |
| `--output <path>` | Output file path |
| `--start <date>` | Start date for export |
| `--end <date>` | End date for export |
| `--provider <name>` | Filter by provider |
| `--model <name>` | Filter by model |

### Cleanup Old Data

Delete old usage records to free up disk space.

```bash
ccr usage cleanup                   # Delete records older than 90 days
ccr usage cleanup --retention 30    # Delete records older than 30 days
ccr usage cleanup --before 2025-01-01  # Delete records before specific date
ccr usage cleanup --dry-run         # Preview without deleting
```

#### Options

| Option | Description |
|--------|-------------|
| `--retention <days>` | Keep records for N days (default: 90) |
| `--before <date>` | Delete records before this date |
| `--dry-run` | Preview what would be deleted without actually deleting |

#### Output Example

```
✓ Cleanup complete:
  Records deleted: 1,234
  Files affected:  3
  Space freed:     256.5 KB
```

## Data Storage

Usage data is stored in:

```
~/.claude-code-router/usage/
├── usage-2025-01.jsonl
├── usage-2025-02.jsonl
├── usage-2025-03.jsonl
└── ...
```

- **Format**: JSON Lines (one JSON object per line)
- **Rotation**: New file created each month
- **Retention**: Configurable via plugin options (default: 90 days)

## Plugin Configuration

Usage tracking is provided by the `usage-tracking` plugin. Configure it in your `config.json`:

```json
{
  "plugins": [
    {
      "name": "usage-tracking",
      "enabled": true,
      "options": {
        "retentionDays": 90
      }
    }
  ]
}
```

| Option | Default | Description |
|----------|---------|-------------|
| `enabled` | `true` | Enable/disable usage tracking |
| `options.retentionDays` | `90` | Days to keep usage records |

When disabled, no usage data is collected and all `/api/usage/*` endpoints return 404.

## Web UI

Usage statistics are also available in the Web UI at `/usage`:

```bash
ccr ui
# Navigate to http://localhost:3456/ui/usage
```

The Web UI provides:
- Interactive date range selection
- Visual charts and graphs
- Provider and model filtering
- Export functionality
- Cleanup management

## Related

- [Web UI](/docs/server/intro#web-ui) - Access usage statistics via web interface
- [API Reference](/docs/server/api/usage-api) - Query usage via HTTP API