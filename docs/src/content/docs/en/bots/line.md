---
title: LINE Bot Setup
pageTitle: LINE Bot
eyebrow: Bot Platforms
lead: Route agent messages into LINE friends, groups, or an Official Account, and relay them after your screen locks. This page walks you from creating a LINE Messaging API channel to a working setup in CCR.
---

## Who This Is For

LINE is for routing agent messages into an existing LINE friend list, group chat, or LINE Official Account. CCR uses a Channel Access Token as the primary auth field.

> New to bots? Start with the "Relay Agent Messages Into IM With Bots" section of the main guide to understand the overall flow and the Forward/Handoff distinction, then come back here.

## The Fields You'll Use

In CCR, LINE's auth type is labeled **Bot Token**, but you don't paste a Telegram-style token — you fill in these two channel fields:

| Name in the LINE dashboard | CCR field | Required | Notes |
| --- | --- | --- | --- |
| Channel access token | Channel Access Token | Required | Lets the bot call the LINE Messaging API |
| Channel secret | Channel Secret | Recommended | Used to verify requests from LINE |

## Step 1: Create A Messaging API Channel

1. Open the [LINE Developers Console](https://developers.line.biz/console/).
2. Log in with your LINE account.
3. Create a Provider, or pick an existing one.
4. Click `Create a new channel`.
5. Choose `Messaging API`.
6. Fill in the Channel name, description, icon, category, etc.
7. Open the channel after it's created.

> If you already have a LINE Official Account, you can enable Messaging API in its settings, then come back to the console to copy credentials.

## Step 2: Copy The Channel Secret

1. Open the Messaging API channel you just created.
2. Open `Basic settings`.
3. Find `Channel secret` and copy it for CCR's Channel Secret.

## Step 3: Issue A Channel Access Token

1. Open the `Messaging API` tab.
2. Find `Channel access token`.
3. Click `Issue` or `Reissue`.
4. Copy the generated token for CCR's Channel Access Token.

> Prefer a long-lived token. Reissuing invalidates the old token, so update CCR at the same time.

## Step 4: Open The Chat Entry

1. For groups, turn on `Allow bot to join group chats`.
2. Consider disabling the LINE Official Account auto-reply so users don't get both the default reply and the agent's.

## Wire It Up In CCR

1. Open CCR's **Bots** page and click **Add Bot**.
2. Pick **LINE** as the platform.
3. Auth is **Bot Token** (this is LINE's fixed auth type in CCR).
4. Paste the token into **Channel Access Token**.
5. Paste the secret into **Channel Secret**.
6. Save the bot.
7. Open **Profiles** and edit the agent profile you want to attach it to.
8. Turn on **Bot** and select the bot.
9. Optionally enable **Forward agent messages** or **Handoff**.
10. Reopen the agent from CCR.

## Forward vs Handoff

- **Forward agent messages**: forwards regardless of lock state. Good when you want full output in LINE.
- **Handoff**: only forwards after the screen locks. Pair with Idle seconds and a target device.

> Only want lock-screen alerts? Skip Forward.

## Test It

1. Open the agent from CCR and trigger a message.
2. Check LINE to confirm the bot received it and replied.
3. For groups, confirm the bot has joined and can post.

> **How to tell it worked:** LINE shows the agent's message, and replies keep the agent going.

## Common Issues

- **Auth fails**: re-copy the Channel Access Token.
- **Can send but can't receive**: confirm the Channel Access Token is valid and CCR is running and connected to LINE.
- **Groups don't work**: confirm `Allow bot to join group chats` is on, then re-add the bot to the group.
- **Only want lock-screen alerts**: skip Forward, use Handoff only.
