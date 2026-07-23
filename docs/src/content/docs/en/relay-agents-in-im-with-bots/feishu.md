---
title: Feishu Bot Setup
pageTitle: Feishu Bot
eyebrow: Bots And IM Agent Relay
lead: Route agent messages into Feishu (Lark) groups or app chats, with relay after your screen locks. This page walks you from creating an enterprise self-built app on the Feishu Open Platform to a working setup in CCR.
---

## Who This Is For

Feishu is for teams that want agent messages in a Feishu group or app chat. CCR connects to Feishu apps using App Secret auth.

> New to bots? Start with the "Bots And IM Agent Relay" section in Detailed Configuration to understand the overall flow and the Forward agent messages and Handoff modes, then come back here.

## The Fields You'll Use

| Name in the Feishu dashboard | CCR field | Required | Notes |
| --- | --- | --- | --- |
| App ID | App ID | Required | App identifier, usually starts with `cli_` |
| App Secret | App Secret | Required | App secret |
| Feishu / Lark domain | Domain | Optional | Usually blank for mainland Feishu; fill for Lark or special domains |

## Step 1: Create An Enterprise Self-Built App

1. Open the [Feishu Open Platform](https://open.feishu.cn/).
2. Go to the developer backend.
3. Click `创建应用` (Create App).
4. Choose `企业自建应用` (Enterprise Self-Built App).
5. Name it, e.g. `CCR`.
6. Fill in the description and upload an icon.
7. Create the app.

## Step 2: Copy The App ID And App Secret

1. Open the app you just created.
2. Open `基础信息` (Basic Info).
3. Go to `凭证与基础信息` (Credentials & Basic Info).
4. Copy `App ID`.
5. Copy `App Secret`.

These two are the required fields in CCR.

## Step 3: Enable The Bot Capability

1. In the app backend, open `应用能力` (App Capabilities).
2. Click `添加应用能力` (Add App Capability).
3. Find `机器人` (Bot) and add or enable it.
4. Set the bot name and avatar.

> Without the bot capability, the Feishu chat may show no input box and won't receive user messages.

## Step 4: Request Message Permissions

1. Open `开发配置` (Development Config).
2. Go to `权限管理` (Permission Management).
3. Add application identity permissions.
4. At minimum, enable "read single-chat messages sent to the bot".
5. To support @-mentions in groups, enable "read group messages that @-mention the bot".
6. To let the agent reply, enable "send messages as the app".
7. Save.

> Permission names vary slightly across tenants. When you see identifiers like `im:message.p2p_msg:readonly`, `im:message.group_at_msg:readonly`, `im:message:send_as_bot`, prefer those message-related ones.

## Step 5: Configure Event Subscriptions

1. Open `事件与回调` (Events & Callbacks).
2. Choose long-connection (or WebSocket) mode.
3. Add the event `im.message.receive_v1`.
4. Save.

## Step 6: Publish Or Install The App

1. Open `版本管理与发布` (Version Management & Release) and create a new version.
2. Confirm the visibility scope — for testing, choose just yourself or a small range.
3. Submit for release.
4. If the enterprise requires review, wait for approval.
5. Find the app in the Feishu client, or add the bot to the target group.

## Wire It Up In CCR

1. Open CCR's **Bot Management** page and click **Add Bot**.
2. Pick **Feishu** as the platform.
3. Auth is **App Secret**.
4. Fill in **App ID** and **App Secret**.
5. For Lark or a special domain, fill in **Domain**.
6. Save the bot.
7. Open **Agent Profiles** and edit the Agent Profiles you want to attach it to.
8. Turn on **Bot** and select the bot.
9. Optionally enable **Forward agent messages** or **Handoff**.
10. Reopen the agent from CCR.

## Message Relay: Forward Or Handoff

- **Forward agent messages**: forwards regardless of lock state. Good when you want full output in Feishu.
- **Handoff**: only forwards after the screen locks. Pair with Idle seconds and a target device.

> For lock-screen-only alerts, use **Handoff** without **Forward agent messages**.

## Test It

1. Open the agent from CCR and trigger a message.
2. Check Feishu to confirm the app received it and replied.
3. For groups, add the app to the target group first and confirm members can see it.

> **How to tell it worked:** Feishu shows the agent's message, and replies keep the agent going.

## Common Issues

- **Auth fails**: re-copy App ID and App Secret.
- **No input box in chat**: check the bot capability, event subscription, and that the app is published to the current member's visibility scope.
- **No response in a group**: @-mention the bot first, and confirm the event subscription includes `im.message.receive_v1`.
- **Lark / special domain**: confirm Domain is the value the platform requires.
