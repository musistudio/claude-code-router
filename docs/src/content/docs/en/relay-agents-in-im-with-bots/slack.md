---
title: Slack Bot Setup
pageTitle: Slack Bot
eyebrow: Bots And IM Agent Relay
lead: Route agent messages into Slack channels or DMs, and relay them to Slack after your screen locks. This page walks you from creating the Slack app all the way to a working setup in CCR.
---

## Who This Is For

Slack is for teams that want agent messages in an existing channel, DM, or workspace app. You need a Bot Token and an App Token.

> New to bots? Start with the "Bots And IM Agent Relay" section in Detailed Configuration to understand the overall flow and the Forward agent messages and Handoff modes, then come back here for a single platform.

## The Fields You'll Use

| Name in the Slack dashboard | CCR field | Looks like | When you need it |
| --- | --- | --- | --- |
| Bot User OAuth Token | Bot Token | `xoxb-...` | Required — lets the bot send and receive |
| App-Level Token | App Token | `xapp-...` | Lets Socket Mode establish the connection |

## Step 1: Create The Slack App

1. Open [Slack API Apps](https://api.slack.com/apps).
2. Click `Create New App`.
3. Choose `From scratch`.
4. Name it, e.g. `CCR`.
5. Pick the Slack workspace to connect.
6. Click `Create App`.

## Step 2: Turn On Socket Mode

1. Open `Socket Mode` on the left.
2. Enable `Socket Mode`.
3. When prompted for an App-Level Token, create one.
4. Name it anything, e.g. `ccr-socket`.
5. Choose the `connections:write` scope.
6. Copy the `xapp-...` App-Level Token for CCR's App Token.

## Step 3: Add Bot Scopes And Install

1. Open `OAuth & Permissions`.
2. Find `Bot Token Scopes` under `Scopes`.
3. Add at least: `app_mentions:read`, `channels:history`, `channels:read`, `chat:write`, `im:history`, `im:read`, `im:write`.
4. Add `files:read` and `files:write` to send/receive files.
5. Add `groups:history` and `groups:read` for private channels.
6. Click `Install to Workspace` at the top and authorize.
7. Copy the `Bot User OAuth Token` (starts with `xoxb-`) for CCR's Bot Token.

## Step 4: Invite The Bot Into A Channel

Skip this if you only use DMs.

1. Open the target Slack channel.
2. Type `/invite @YourBotName` in the message box.
3. Send it and confirm the bot appears in the member list.

> Without an invite, the bot usually only gets DMs — not channel messages.

## Wire It Up In CCR

1. Open CCR's **Bot Management** page and click **Add Bot**.
2. Pick **Slack** as the platform.
3. Keep the default **Bot Token** auth (unless you specifically need OAuth).
4. Paste `xoxb-...` into **Bot Token**.
5. Paste `xapp-...` into **App Token**.
6. Save the bot.
7. Open **Agent Profiles** and edit the Agent Profiles you want to attach it to.
8. Turn on **Bot** and select the bot you just saved.
9. Optionally enable **Forward agent messages** or **Handoff** (next section).
10. Reopen the agent from CCR.

## Message Relay: Forward Or Handoff

- **Forward agent messages**: forwards every new agent message to Slack regardless of screen lock. Good for full logs or debugging.
- **Handoff**: only forwards after the screen locks. Pair it with **Idle seconds** and a Wi-Fi/Bluetooth target device.

> For lock-screen-only alerts, use **Handoff** without **Forward agent messages**.

## Test It

1. Open the agent from CCR and trigger a message.
2. Check Slack to confirm the bot received it and replied.
3. If you use a channel, make sure the bot is in it.

> **How to tell it worked:** Slack shows the agent's message, and when you reply, the agent continues.

## Common Issues

- **No messages reach Slack**: confirm the Bot Token is still valid and the app is in the target channel.
- **Socket Mode won't connect**: check that the App Token starts with `xapp-` and has `connections:write`.
- **Channel silent but DMs work**: the bot isn't in the channel, or it lacks `channels:*` / `groups:*` scopes. Reinstall to the workspace after adding scopes.
- **Too many messages**: use Handoff without Forward agent messages.
