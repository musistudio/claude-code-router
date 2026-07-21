---
title: AgentClaw Slack setup
pageTitle: AgentClaw Slack
eyebrow: AgentClaw
lead: "Connect agent messages to Slack channels or DMs, with optional handoff after your screen locks. Covers creating the Slack app, the two tokens CCR needs, and verifying the connection."
---

## Who this is for

Slack is for teams that want agent messages in an existing channel, DM, or workspace app. You need a Bot Token and an App Token.

> New to AgentClaw? Read the AgentClaw overview and usage and configuration first, then come back here for a single platform.

## The fields you'll use

| Name in the Slack dashboard | CCR field | Looks like | When you need it |
| --- | --- | --- | --- |
| Bot User OAuth Token | Bot Token | `xoxb-...` | Required — lets the bot send and receive |
| App-Level Token | App Token | `xapp-...` | Lets Socket Mode establish the connection |

## Step 1: Create the Slack app

1. Open [Slack API Apps](https://api.slack.com/apps).
2. Click `Create New App`.
3. Choose `From scratch`.
4. Name it, e.g. `CCR`.
5. Pick the Slack workspace to connect.
6. Click `Create App`.

## Step 2: Turn on Socket Mode

1. Open `Socket Mode` on the left.
2. Enable `Socket Mode`.
3. When prompted for an App-Level Token, create one.
4. Name it anything, e.g. `ccr-socket`.
5. Choose the `connections:write` scope.
6. Copy the `xapp-...` App-Level Token for CCR's App Token.

## Step 3: Add bot scopes and install

1. Open `OAuth & Permissions`.
2. Find `Bot Token Scopes` under `Scopes`.
3. Add at least: `app_mentions:read`, `channels:history`, `channels:read`, `chat:write`, `im:history`, `im:read`, `im:write`.
4. Add `files:read` and `files:write` to send/receive files.
5. Add `groups:history` and `groups:read` for private channels.
6. Click `Install to Workspace` at the top and authorize.
7. Copy the `Bot User OAuth Token` (starts with `xoxb-`) for CCR's Bot Token.

## Step 4: Invite the bot into a channel

Skip this if you only use DMs.

1. Open the target Slack channel.
2. Type `/invite @YourBotName` in the message box.
3. Send it and confirm the bot appears in the member list.

> Without an invite, the bot usually only gets DMs — not channel messages.

## Wire it up in CCR

1. Open CCR's **Bot Management** page and click **Add Bot**.
2. Pick **Slack** as the platform.
3. Keep the default **Bot Token** auth (unless you specifically need OAuth).
4. Paste `xoxb-...` into **Bot Token**.
5. Paste `xapp-...` into **App Token**.
6. Save the bot.
7. Open **Agent Config** and edit the Agent Config you want to attach it to.
8. Turn on **Bot** and select the bot you just saved.
9. Optionally enable **Forward agent messages** or **Handoff** (next section).
10. Reopen the agent from CCR.

## Forward or handoff

- **Forward agent messages**: forwards every new agent message to Slack regardless of screen lock. Good for full logs or debugging.
- **Handoff**: only forwards after the screen locks. Pair it with **Idle seconds** and a Wi-Fi/Bluetooth target device.

> For lock-screen-only alerts, use **Handoff** without **Forward agent messages** — otherwise message volume gets noisy.

## Test it

1. Open the agent from CCR and trigger a message.
2. Check Slack to confirm the bot received it and replied.
3. If you use a channel, make sure the bot is in it.

> **How to tell it worked:** Slack shows the agent's message, and when you reply, the agent continues.

## Common issues

- **No messages reach Slack**: confirm the Bot Token is still valid and the app is in the target channel.
- **Socket Mode won't connect**: check that the App Token starts with `xapp-` and has `connections:write`.
- **Channel silent but DMs work**: the bot isn't in the channel, or it lacks `channels:*` / `groups:*` scopes. Reinstall to the workspace after adding scopes.
- **Too many messages**: use Handoff without Forward agent messages.
