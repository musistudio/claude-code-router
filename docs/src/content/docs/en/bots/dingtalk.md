---
title: DingTalk Bot Setup
pageTitle: DingTalk Bot
eyebrow: Bot Platforms
lead: Route agent messages into DingTalk's enterprise collaboration environment, with relay after your screen locks. This page walks you from creating an app in the DingTalk developer backend to a working setup in CCR.
---

## Who This Is For

DingTalk is for bringing agent messages into an enterprise collaboration environment. CCR connects to DingTalk apps using App Secret auth.

> New to bots? Start with the "Relay Agent Messages Into IM With Bots" section of the main guide to understand the overall flow and the Forward/Handoff distinction, then come back here.

## The Fields You'll Use

| Name in the DingTalk dashboard | CCR field | Required | Notes |
| --- | --- | --- | --- |
| Client ID / AppKey | App Key | Required | App identifier |
| Client Secret / AppSecret | App Secret | Required | App secret |
| RobotCode | Robot Code | Optional | May be needed for multi-bot or media scenarios |

> Newer DingTalk configures the bot as an "app capability" — don't start from the old standalone "bot" entry.

## Step 1: Create A DingTalk App

1. Open the [DingTalk developer backend](https://open-dev.dingtalk.com/).
2. Log in with your DingTalk account.
3. Pick the dev organization to connect.
4. Open `应用开发` (App Development) at the top.
5. Click `创建应用` (Create App).
6. Name it, e.g. `CCR`.
7. Fill in the description; leave other options default.
8. Click create.

## Step 2: Copy The App Key And App Secret

1. Open the app you just created.
2. On the left, open `应用信息` (App Info) or `凭证与基础信息` (Credentials & Basic Info).
3. Copy `Client ID` for CCR's App Key.
4. Copy `Client Secret` for CCR's App Secret.

> The dashboard may still show the old names `AppKey` / `AppSecret` — map them by field name.

## Step 3: Enable The Bot Capability

1. In the app, open `机器人与消息推送` (Bot & Message Push), or open `应用能力` (App Capabilities) and choose `机器人` (Bot).
2. Enable `机器人配置` (Bot Config).
3. Fill in the bot name, avatar, and description.
4. Choose **Stream mode** for message receiving.
5. Save.
6. If the page shows a `RobotCode`, copy it for CCR's Robot Code.

## Step 4: Publish The App And Join A Chat

1. Open `版本管理与发布` (Version Management & Release) and create a new version.
2. Set the visibility scope — for testing, choose just yourself or a test group.
3. Submit for release.
4. After release, search the bot name in the DingTalk client.
5. Open the bot chat, or add the bot to the target group via group settings.

## Wire It Up In CCR

1. Open CCR's **Bots** page and click **Add Bot**.
2. Pick **DingTalk** as the platform.
3. Auth is **App Secret**.
4. Paste the Client ID into **App Key**.
5. Paste the Client Secret into **App Secret**.
6. If you copied a RobotCode, paste it into **Robot Code**.
7. Save the bot.
8. Open **Profiles** and edit the agent profile you want to attach it to.
9. Turn on **Bot** and select the bot.
10. Optionally enable **Forward agent messages** or **Handoff**.
11. Reopen the agent from CCR.

## Forward vs Handoff

- **Forward agent messages**: forwards regardless of lock state. Good when you want full output in DingTalk.
- **Handoff**: only forwards after the screen locks. Pair with Idle seconds and a target device.

> Only want lock-screen alerts? Skip Forward.

## Test It

1. Open the agent from CCR and trigger a message.
2. Check DingTalk to confirm the app received it and replied.
3. For groups, confirm the app or bot is in the target group and can post.

> **How to tell it worked:** DingTalk shows the agent's message, and replies keep the agent going.

## Common Issues

- **Auth fails**: re-copy App Key and App Secret.
- **Bot-identifier errors**: check that Robot Code matches the platform dashboard.
- **Bot receives nothing**: confirm the bot capability is enabled in the app and the receive mode matches CCR's config.
- **Users can't find the bot**: check that the app is published and the visibility scope includes the current user or group members.
- **Handoff doesn't trigger**: confirm the screen is locked, and check the Handoff toggle, idle time, and target device.
