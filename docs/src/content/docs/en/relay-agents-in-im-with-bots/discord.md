---
title: Discord Bot Setup
pageTitle: Discord Bot
eyebrow: Relay Agents In IM With Bots
lead: Route agent messages into Discord server channels or DMs, and relay them after your screen locks. This page walks you from creating the Discord app to a working setup in CCR.
---

## Who This Is For

Discord is for routing agent messages into a server channel, a private collab server, or a personal DM. A Bot Token is the most common setup and is straightforward.

> New to bots? Start with the "Relay Agent Messages Into IM With Bots" section of the main guide to understand the overall flow and the Forward/Handoff distinction, then come back here.

## The Fields You'll Use

| Name in the Discord dashboard | CCR field | Required | Notes |
| --- | --- | --- | --- |
| Token | Bot Token | Required | The bot token from the Bot page |
| Application ID | Application ID | Optional | App ID from General Information |
| Public Key | Public Key | Optional | May be needed for interaction callbacks |

A Bot Token is usually enough. Only choose OAuth 2.0 if your flow explicitly requires it.

## Step 1: Create The Discord App And Bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click `New Application`.
3. Name it, e.g. `CCR`.
4. Open the app after it's created.
5. Open `Bot` on the left.
6. If there's no bot yet, click `Add Bot`.
7. Set the avatar and username.

## Step 2: Enable The Required Intents

1. Still on the `Bot` page, find `Privileged Gateway Intents`.
2. Enable **Message Content Intent**. Without it, the bot likely can't see message bodies.
3. Enable **Server Members Intent** if you gate on members, roles, or usernames.
4. **Presence Intent** is usually unnecessary unless you read online status.

## Step 3: Copy The Bot Token

1. On the `Bot` page, find `Token`.
2. Click `Reset Token` or `Copy`.
3. On first creation, `Reset Token` generates the first token — it doesn't mean you broke anything.
4. Copy the token for CCR's Bot Token.

> This token is effectively the bot's password. Don't post it in Discord or paste it into an agent prompt.

## Step 4: Invite The Bot Into A Server

1. Open `OAuth2` on the left.
2. Open `URL Generator`.
3. In `Scopes`, tick `bot` and `applications.commands`.
4. In `Bot Permissions`, tick at least `View Channels`, `Send Messages`, `Read Message History`, `Embed Links`, `Attach Files`.
5. Tick `Add Reactions` if you want reactions on approval messages.
6. Copy the generated URL, open it in a browser, and authorize into the target server.

## Step 5: Copy Optional Fields (If Needed)

If something asks for Application ID or Public Key:

1. Back in the Developer Portal, open `General Information`.
2. Copy `Application ID` and `Public Key`.

## Wire It Up In CCR

1. Open CCR's **Bots** page and click **Add Bot**.
2. Pick **Discord** as the platform.
3. Keep the default **Bot Token** auth.
4. Paste the token into **Bot Token**.
5. Add **Application ID** and **Public Key** if needed.
6. Save the bot.
7. Open **Profiles** and edit the agent profile you want to attach it to.
8. Turn on **Bot** and select the bot.
9. Optionally enable **Forward agent messages** or **Handoff**.
10. Reopen the agent from CCR.

## Forward vs Handoff

- **Forward agent messages**: forwards regardless of lock state. Good for debugging or full-record channels.
- **Handoff**: only forwards after the screen locks. Pair with Idle seconds and a target device.

> Only want lock-screen alerts? Skip Forward.

## Test It

1. Open the agent from CCR and trigger a message.
2. Check Discord to confirm the bot received it and replied.
3. For server channels, confirm the bot is in the server and can post.

> **How to tell it worked:** Discord shows the agent's message, and replies keep the agent going.

## Common Issues

- **Bot doesn't respond**: confirm the Bot Token was copied correctly.
- **Bot is online but can't see your messages**: check that Message Content Intent is on.
- **No messages in a channel**: confirm the bot is in that server and channel permissions let it post.
- **No permission options in the invite URL**: make sure the OAuth2 URL Generator has `bot` scoped.
- **Handoff doesn't trigger**: confirm the screen is locked, Handoff is on, and idle time/target device are set.
