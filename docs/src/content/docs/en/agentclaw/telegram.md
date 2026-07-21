---
title: AgentClaw Telegram setup
pageTitle: AgentClaw Telegram
eyebrow: AgentClaw
lead: "Connect agent messages to Telegram chats or groups, with optional handoff after your screen locks. Telegram needs only a Bot Token and is the simplest platform to set up."
---

## Who this is for

Telegram is for individuals or small teams who want agent messages fast. It has the fewest fields — just a `Bot Token`. If you want the quickest possible bot, start here.

> New to AgentClaw? Read the AgentClaw overview and usage and configuration first, then come back here for a single platform.

## The fields you'll use

| Name in Telegram | CCR field | Required | Notes |
| --- | --- | --- | --- |
| HTTP API token | Bot Token | Required | The token `@BotFather` returns after creating the bot |

## Step 1: Create the bot with BotFather

1. Open Telegram.
2. Search `@BotFather` and confirm the username matches exactly (the official bot).
3. In the chat, send `/newbot`.
4. Enter a display name when prompted, e.g. `CCR Assistant`.
5. Enter a username — it must end in `bot`, e.g. `ccr_demo_bot`.
6. On success, `@BotFather` returns an HTTP API token.
7. Copy it for CCR's Bot Token.

> **Never share this token.** Anyone who has it has full control of your Telegram bot.

## Step 2: Set up group support (optional)

Skip this if you only use DMs.

To use it in groups:

1. Send `/setjoingroups` to `@BotFather`.
2. Pick your bot.
3. Choose to allow joining groups.
4. To let the bot see all group messages, send `/setprivacy`.
5. Pick the bot again.
6. Choose `Disable` to turn off privacy mode.
7. Add the bot to the target group.

> With privacy mode on, the bot usually only sees commands, @-mentions, and some service messages. After disabling it, kick and re-add the bot so the change takes effect immediately.

## Wire it up in CCR

1. Open CCR's **Bot Management** page and click **Add Bot**.
2. Pick **Telegram** as the platform.
3. Auth is **Bot Token**.
4. Paste the token into **Bot Token**.
5. Save the bot.
6. Open **Agent Config** and edit the Agent Config you want to attach it to.
7. Turn on **Bot** and select the bot.
8. Optionally enable **Forward agent messages** or **Handoff** (next section).
9. Reopen the agent from CCR.

## Forward or handoff

- **Forward agent messages**: forwards regardless of lock state. Good when you want full output in Telegram.
- **Handoff**: only forwards after the screen locks. Pair with Idle seconds and a target device.

> For lock-screen-only alerts, use **Handoff** without **Forward agent messages**.

## Test it

1. Open the agent from CCR and trigger a message.
2. Check Telegram to confirm the bot received it and replied.
3. For groups, confirm the bot is in the group and can read/write.

> **How to tell it worked:** Telegram shows the agent's message, and replies keep the agent going.

## Common issues

- **Auth fails**: re-copy the Bot Token.
- **DMs work but groups don't**: check that the bot is in the group and group permissions let it read.
- **Only `/command` triggers the bot in a group**: check `/setprivacy` in `@BotFather`, or promote the bot to group admin.
- **You reset the token**: the old token dies instantly — update CCR and restart.
- **Too many messages**: use Handoff without Forward agent messages.
