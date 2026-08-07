---
title: AgentClaw usage and configuration
pageTitle: AgentClaw usage and configuration
eyebrow: AgentClaw
lead: "The full setup flow: create an IM bot, bind it to an Agent Config, and choose forwarding or handoff. Follow this page when setting up AgentClaw for the first time or changing bot options."
---

## Prerequisites

1. CCR Desktop is running and the gateway service is available.
2. A usable model is configured in **Provider Config**, or the Fusion model you want is ready.
3. An **Agent Config** exists whose **entry mode** includes App. Full AgentClaw relay currently supports Claude App, Codex/ChatGPT App, OpenCode App, and ZCode App; CLI-only agents do not forward Bot messages.
4. The target IM platform has Bot credentials, app permissions, or QR login ready.

## Configuration flow

1. Open **Bot Management** and click **Add Bot**.
2. Choose a platform and fill in the token, secret, signing secret, robot code, OAuth fields, or QR login.
3. Save the Bot.
4. Open the target **Agent Config**.
5. Confirm **Entry mode** includes `App`, such as `App only` or `CLI & APP`.
6. Turn on **Bot** and select the Bot you saved.
7. Configure forwarding, handoff, language, timeout, attachments, streaming, and **Allow Agent shell tools** as needed.
8. Save the Agent Config.
9. Reopen Claude App, Codex/ChatGPT App, OpenCode App, or ZCode App from CCR. AgentClaw is online only while the managed App is alive.

## Choose a mode

| Mode | Toggle combination | Use case |
| --- | --- | --- |
| Full forwarding | Enable **Forward agent messages** | Keep complete agent output in IM, or let a team observe |
| Lock-screen handoff | Enable **Handoff** and disable **Forward agent messages** | Receive and reply to the agent only after leaving the computer |
| IM-initiated turns | Disable both **Handoff** and **Forward agent messages** | Let users start turns from IM without mirroring desktop output |

Handoff currently uses screen lock and idle time. Wi-Fi / Bluetooth phone targets are experimental settings and do not affect runtime handoff yet.

## Key settings

| Setting | Recommendation |
| --- | --- |
| Bot language | Use `Auto` to follow the conversation; pin Chinese or English for team channels |
| Maximum turn time | Match the expected task duration; CCR interrupts timed-out turns and reports the final state |
| Session idle reset | Use `0` to disable automatic reset; set minutes only when you want a fresh Session after inactivity |
| Message chunk size | Match platform length limits; Slack/Discord can be larger, Weixin/LINE should stay conservative |
| Attachment limit | Bound inbound files before they are handed to the agent |
| Send and receive attachments | Enable when users need images, files, or workspace artifacts |
| Streaming replies | Enable for real-time output; disable when platform update limits are strict |
| Allow Agent shell tools | Controls agent tool permission only; it does not add a shell command to the Bot |

## How to use it

After opening the Agent App from CCR, choose a workspace from IM:

```text
/project list
/project use 1
/session list
/session use 1
```

Then send natural-language messages directly. To start a new Session:

```text
/session new Fix login issue
```

When the agent asks for permission or input, use platform buttons when available, or text commands:

```text
/session approve
/session deny
/session answer Use the second option
```

Inspect state and diagnostics:

```text
/session status
/session doctor
/session deliveries
```

## Verification

1. Open the target Agent App from CCR.
2. Send `/project current` from IM and confirm the Bot is online and can read the current Project.
3. Send `/session list` and confirm Sessions are listed for the current Project.
4. Send one plain message and confirm the agent runs and replies in the same IM conversation.
5. Lock the computer, wait past the handoff idle seconds, and confirm later agent messages enter IM.
6. Close the Agent App and confirm the Bot moves offline.

The Profile card shows connection state, the last event and delivery, pending outbox count, and redacted errors. `/session doctor` returns the same kind of runtime diagnostics.

## State and safety boundary

AgentClaw keeps bounded deduplication records, pending turns, a durable outbox, and recent delivery results on the local machine. Event idempotency gives each agent turn one execution, and pending delivery resumes while the App is online again.

Only `/project` and `/session` are Bot command domains. Plain messages become agent prompts, and attachments enter the agent only when enabled and under the size limit. Shell permission is still controlled by the Agent Config; enable it only for trusted agents, trusted workspaces, and trusted IM conversations.
