---
title: AgentClaw
pageTitle: AgentClaw
eyebrow: AgentClaw
lead: "AgentClaw connects an agent running locally under CCR to your IM apps: the agent keeps working with your projects, tools, and sessions on your own computer, while an IM bot handles remote viewing, handoff, and replies. This page covers how it works, the three message modes, and when to use it."
---

AgentClaw is CCR's agent relay capability. A local agent managed by CCR keeps its workspace, login state, config files, model routing, and tool permissions; AgentClaw exposes a remote entry point for it through an IM bot. From Slack, Discord, Telegram, LINE, Weixin, WeCom, Feishu, or DingTalk, you can watch agent output, continue the conversation, answer permission requests, or take over after your computer locks.

Handoff means that after your screen locks and the idle threshold passes, further agent interaction moves to IM, where you can continue from your phone or another device. Handoff relies on a companion worker that follows the App lifecycle: opening an Agent App from CCR starts its worker, and closing the App stops the worker and the Bot connection. CLI-only agents can still route model requests through CCR, but they do not forward messages to IM.

## When to use it

| Scenario | How AgentClaw works |
| --- | --- |
| Continue after leaving your desk | After the screen locks and the idle threshold passes, new agent messages go to IM and you can reply there |
| Keep a remote-visible record | With forwarding enabled, visible agent output is mirrored into the selected conversation |
| Team collaboration | Attach one local agent to a team channel and let members use `/project` and `/session` commands |
| Keep local capability | The agent still runs on your computer with local repos, credentials, MCP, Skills, shell permissions, and native sessions |

## Core concepts

| Concept | Meaning |
| --- | --- |
| AgentClaw | The IM access layer CCR provides for local agents, with an interface styled after [OpenClaw](https://openclaw.ai) (an open-source personal AI assistant that runs on your own machine and interacts through IM platforms) |
| Local agent | A Claude Code, Codex, OpenCode, ZCode, or similar agent opened through a CCR Agent Config |
| Bot | The IM message entry; the CCR UI still calls this **Bot Management** |
| Project | An agent-native project or working directory |
| Session | An agent-native conversation inside a Project |
| Companion worker | The relay process that follows the managed Agent App lifecycle and handles IM messages, Projects/Sessions, queueing, attachments, and diagnostics |

AgentClaw shares the lifecycle of the Agent App opened by CCR. Opening Claude, Codex, ZCode, or OpenCode App starts its companion worker; closing the App stops both the worker and the Bot connection. CLI-only agents can route model requests through CCR but do not forward Bot messages.

## Support matrix

| Agent | AgentClaw status |
| --- | --- |
| Claude App | Full Bot forwarding, handoff, Projects/Sessions, permission requests, and attachments |
| Codex / ChatGPT App | Full Bot forwarding, handoff, Projects/Sessions, queueing, model settings, usage, and attachments |
| OpenCode App | Full Bot forwarding, handoff, and Projects/Sessions; messages run through OpenCode CLI under the same config |
| ZCode App | Full Bot forwarding, handoff, and native Session discovery |
| Claude Code, Codex CLI | Can use CCR model routing; Bot forwarding is not active yet |
| Grok CLI, Kimi CLI | Can use CCR model routing; these are CLI-only and do not enter AgentClaw relay |
| Other local agents | They need a CCR-managed App entry plus a companion worker before they can act as AgentClaw executors |

## Three modes

- **Forward agent messages**: continuously mirror visible agent output into IM. Use this for full records, team visibility, or debugging.
- **Handoff**: after the desktop locks and the idle threshold passes, relay later interaction into IM. Use this when you only want to take over while away.
- **Reply only**: with forwarding and handoff disabled, the Bot replies only to turns initiated from IM.

Natural-language turns are serialized per IM conversation. `/project`, `/session status`, and `/session cancel` remain immediately responsive; queueing, timeout, cancellation, and worker-restart recovery have explicit states.

## Project and Session commands

AgentClaw exposes only `/project` and `/session` as public command domains. Other slash commands return the unknown-command response, while plain natural language such as `help` or `list` enters the agent as a prompt.

### Project commands

| Command | Purpose |
| --- | --- |
| `/project` | Show Project help and the App-online boundary |
| `/project list [page]` | List known agent projects with pagination |
| `/project find <text>` | Search project names and paths |
| `/project current` | Show the current Project |
| `/project use <n>` | Change Project and clear the previous Session selection |
| `/project name <label>` | Set the Bot display label for this Project |

### Session commands

| Command | Purpose |
| --- | --- |
| `/session` | Show all Session commands |
| `/session list [page]`, `/session find <text>` | Browse Sessions only in the current Project |
| `/session current`, `new [title]`, `use <n>`, `reset` | Inspect, create, continue, or clear a Session selection |
| `/session status`, `cancel` | Inspect the active turn/queue, or cancel it and clear the queue |
| `/session approve [session]`, `deny`, `answer <text>` | Answer an agent-generated permission or input request; text commands work everywhere, and card-capable platforms also show buttons |
| `/session name <label>` | Rename the current Session |
| `/session archive <n>`, `restore <n>`, `delete <n> confirm` | Archive, restore, or permanently delete with confirmation |
| `/session history [count]`, `usage` | Show recent history and token/cache/cost summaries |
| `/session models`, `model`, `effort`, `mode` | Inspect or change this conversation's Session runtime settings |
| `/session memory ...`, `skills`, `skill`, `shortcut ...` | Manage persistent context, Agent Skills, and shortcuts |
| `/session doctor`, `deliveries` | Show connection, outbox, recent-delivery, and redacted-error diagnostics |

## Next steps

1. Read [usage and configuration](/en/agentclaw/setup/) to set up the Bot, the Agent Config binding, modes, attachments, timeout, and shell permission.
2. Open the platform page for [Slack](/en/agentclaw/slack/), [Discord](/en/agentclaw/discord/), [Telegram](/en/agentclaw/telegram/), [LINE](/en/agentclaw/line/), [Weixin](/en/agentclaw/weixin-ilink/), [WeCom](/en/agentclaw/wecom/), [Feishu](/en/agentclaw/feishu/), or [DingTalk](/en/agentclaw/dingtalk/) and fill in the platform credentials.
3. Reopen the target Agent App from CCR, then validate with `/project current`, `/session list`, and one plain message.
