---
title: Overview Dashboard
pageTitle: Overview Dashboard
eyebrow: Detailed Configuration
lead: Customize the CCR home dashboard for system status, account balance, requests, tokens, cost, model distribution, and share cards.
---

## Top Controls

| Field | Capability |
| --- | --- |
| Usage over time | Changes the statistics range used by the dashboard. |
| Today / 24h / 7d / 30d | Available time windows. Widgets recalculate requests, tokens, cost, and trends for the selected range. |
| Edit widgets | Enters layout editing mode. |
| Reset layout | Restores the default overview layout. |
| Done | Leaves editing mode and keeps the current widget configuration. |

## Widget Editing

In editing mode, the left `Components` panel adds widgets, the middle `Preview` panel shows the current layout, and the right `Component properties` panel edits the selected widget.

| Field | Capability |
| --- | --- |
| Components | List of widgets that can be added. |
| Preview | Current dashboard layout. Widgets can be dragged to reorder. |
| Component properties | Configuration for the selected widget. |
| Component category | Changes the widget category, such as status, account, metric, trend, activity, breakdown, analysis, or share card. |
| Data | Selects the data shown by the widget, such as requests, tokens, cost, account, client analysis, or provider analysis. |
| Widget size | Controls the widget's grid width and height. |
| Style | Changes visual style, such as cards, compact, bar, line, ring, and more. |
| Remove widget | Removes the selected widget from the overview. |

## Widget Types

| Widget | Capability |
| --- | --- |
| Status component | Shows a system status timeline for recent gateway health. |
| Account component | Shows provider account balance, quota, or usage. Requires provider `Fetch usage`. |
| Metric component | Shows requests, total tokens, input tokens, output tokens, cache tokens, cache ratio, estimated cost, success rate, errors, or average latency. |
| Trend component | Shows usage trend over time. |
| Activity component | Shows token activity as a heatmap. |
| Breakdown component | Shows Token mix or Model distribution. |
| Analysis component | Shows Client Analysis or Provider Analysis. |
| Share card | Generates shareable PNG cards such as AI Usage Wrapped, CCR Route Map, Model Leaderboard, AI Fuel Cockpit, Token Calendar Poster, and Spend Receipt. |

## Data Sources

| Data | Source |
| --- | --- |
| Requests, tokens, cost, success rate, latency | Request logs and usage stats. |
| Account balance, quota, status messages | Provider `Fetch usage` configuration. |
| Client analysis, provider analysis, model distribution | Client, provider, model, and token data from request logs. |
| Agent analysis data | Agent observability settings and agent execution traces. |
