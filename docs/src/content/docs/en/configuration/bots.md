---
title: Bots And IM Agent Relay
pageTitle: Bots And IM Agent Relay
eyebrow: Detailed Configuration
lead: Forward agent messages to instant-messaging platforms or hand off active work after desktop idle.
---

CCR App Relay shares the lifecycle of an Agent App opened by CCR. Opening Claude, Codex, ZCode, or OpenCode App starts its companion worker; closing the App stops both the worker and Bot connection.

## Common Modes

- **Forward agent messages**: mirror agent messages into IM.
- **Handoff**: relay the interaction into IM after desktop idle.
- **Reply only**: with forwarding and handoff disabled, reply only to turns initiated from IM.

Natural-language turns are serialized per IM conversation. `/project`, `/session status`, and `/session cancel` remain immediately responsive; queueing, timeout, cancellation, and worker-restart recovery have explicit states.

## Projects And Sessions

A Project is an Agent-native project or working directory, and a Session is an Agent-native conversation inside that Project.

### Project Commands

| Command | Purpose |
| --- | --- |
| `/project` | Show Project help and the App-online boundary. |
| `/project list [page]` | List known Agent projects with pagination. |
| `/project find <text>` | Search project names and paths. |
| `/project current` | Show the current Project. |
| `/project use <n>` | Change Project and clear the previous Session selection. |
| `/project name <label>` | Set the Bot display label for this Project. |

### Session Commands

| Command | Purpose |
| --- | --- |
| `/session` | Show all Session commands. |
| `/session list [page]`, `/session find <text>` | Browse Sessions only in the current Project. |
| `/session current`, `new [title]`, `use <n>`, `reset` | Inspect, create, continue, or clear a Session selection. |
| `/session status`, `cancel` | Inspect the active turn/queue, or cancel it and clear the queue. |
| `/session approve [session]`, `deny`, `answer <text>` | Answer an Agent-generated permission or input request; every platform has text commands, and card-capable platforms also show action buttons. |
| `/session name <label>` | Rename the current Session. |
| `/session archive <n>`, `restore <n>`, `delete <n> confirm` | Archive, restore, or permanently delete with confirmation. |
| `/session history [count]`, `usage` | Show recent history and token/cache/cost summaries. |
| `/session models`, `model`, `effort`, `mode` | Inspect or change this conversation's Session runtime settings. |
| `/session memory ...`, `skills`, `skill`, `shortcut ...` | Manage persistent context, Agent skills, and shortcuts. |
| `/session doctor`, `deliveries` | Show connection, outbox, recent-delivery, and redacted-error diagnostics. |

The public Bot command domains are `/project` and `/session`. Other slash commands return the unknown-command response, while plain natural language such as `help` or `list` enters the Agent as a prompt.

## Bot Settings

- **Bot language**: automatic, English, or Simplified Chinese.
- **Maximum turn time**: interrupt timed-out turns and return a final state.
- **Session idle reset**: prepare a new Session in the same Project after inactivity; `0` disables it.
- **Message chunk and attachment limits**: adapt to platform limits and bound inbound files.
- **Streaming replies and progress**: forward visible text and tool stages.
- **Send and receive attachments**: accept inbound images/files and return artifacts from the current workspace.
- **Allow Agent shell tools**: controls Agent shell-tool permission; the Bot command surface remains `/project` and `/session`.

The local state keeps bounded deduplication records, pending turns, a durable outbox, and recent delivery results. Event idempotency gives each Agent turn one execution, and pending delivery resumes while the App is online again.

## Platform Pages

Slack, Discord, Telegram, LINE, Weixin, WeCom, Feishu, and DingTalk each have a dedicated page; iMessage uses a local integration. The SDK selects Markdown, cards, streaming updates, file messages, or text according to platform capabilities.
