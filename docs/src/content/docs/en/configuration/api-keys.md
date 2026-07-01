---
title: API Keys
pageTitle: API Keys
eyebrow: Detailed Configuration
lead: Manage API keys that clients use to access the CCR gateway, with expiration and local limits.
---

## List Fields

| Field | Capability |
| --- | --- |
| Search API keys | Filters the list by key name or key value. |
| Add API key | Opens the create dialog and generates a new client access key. |
| Name | Display name for the key. Use it to identify a client, team, purpose, or automation. |
| Key | Masked access key. Use `Copy API key` to copy the full key. |
| Expires | Expiration time. After expiration, clients can no longer use the key to access CCR. |
| Limits | Local limit summary. Shows `No limits configured` when no limits are set. |
| Edit API key | Edits expiration and limits. The key value itself is not shown again. |
| Remove API key | Deletes the client access key. Deleted keys stop working immediately. |

## Create And Edit

| Field | Capability |
| --- | --- |
| Name | Display name for the new key. Examples: `Claude Code - laptop`, `CI`, or a team name. |
| Expiration | Selects the validity period: `Never`, `7 days`, `30 days`, `90 days`, or `Custom`. |
| Expires at | Appears for `Custom` expiration and sets the exact date and time. |
| API key created | Confirmation dialog after creation. It displays the full key. |
| Copy this key now. It may not be shown again. | Reminder to copy the key immediately because CCR will not show it again after the dialog closes. |

## Advanced Settings

`Advanced settings` adds local limits to a client key. When a limit is reached, requests using that key are rejected or limited; provider-side quota is not changed.

| Field | Capability |
| --- | --- |
| Advanced settings | Expands or collapses limit editing. |
| No limits configured | The key has no local limits. |
| Requests | Limits by request count. |
| Tokens | Limits by token count. |
| Images | Limits by image count. |
| per minute | Uses a 1-minute limit window. |
| per hour | Uses a 1-hour limit window. |
| per day | Uses a 1-day limit window. |
| Add limit | Adds one limit rule. |
| Remove limit | Removes the current limit rule. |
