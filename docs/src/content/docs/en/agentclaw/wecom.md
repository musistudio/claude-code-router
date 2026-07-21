---
title: AgentClaw WeCom setup
pageTitle: AgentClaw WeCom
eyebrow: AgentClaw
lead: "Connect agent messages to WeCom (Enterprise WeChat) so your team can receive and reply there, with optional handoff after your screen locks. Covers creating a self-built app, the credentials CCR needs, and verifying the connection."
---

## Who this is for

WeCom is for bringing the agent into an enterprise messaging environment, so team members can receive and reply to agent messages inside WeCom.

> New to AgentClaw? Read the AgentClaw overview and usage and configuration first, then come back here for a single platform.

## The fields you'll use

| Name in the WeCom dashboard | CCR field | Required | Notes |
| --- | --- | --- | --- |
| `企业ID` (CorpID) | Corp ID | Required | Enterprise-level ID, under "My Enterprise" |
| AgentId | Agent ID | Required | The self-built app's ID |
| Secret | Secret | Required | App secret — admins usually confirm on their phone to view it |

> CCR exchanges Corp ID and the app Secret for a WeCom access_token for you — you don't fetch it manually.

## Step 1: Get the Corp ID

1. Open the [WeCom admin console](https://work.weixin.qq.com/wework_admin/frame).
2. Log in as an admin.
3. Open `我的企业` (My Enterprise) at the top.
4. Go to `企业信息` (Enterprise Info).
5. Find `企业ID` (CorpID) and copy it for CCR's Corp ID.

## Step 2: Create a self-built app

1. In the admin console, open `应用管理` (App Management).
2. Find the `自建` (Self-built) section.
3. Click `创建应用` (Create App).
4. Name it, e.g. `CCR`.
5. Upload a logo.
6. Pick a visibility scope — for testing, choose just yourself or a small test department.
7. Click create.

## Step 3: Copy the Agent ID and Secret

1. Open the self-built app you just created.
2. Copy `AgentId` for CCR's Agent ID.
3. Find `Secret` and click to view it.
4. Confirm on your phone's WeCom as prompted.
5. Copy the displayed `Secret`.

> If WeCom asks for `企业可信IP` (Trusted Enterprise IPs), add the outbound public IP of the machine running the CCR Bot Gateway (or your relay service's outbound IP).

## Wire it up in CCR

1. Open CCR's **Bot Management** page and click **Add Bot**.
2. Pick **WeCom** as the platform.
3. Auth is **App Secret**.
4. Fill in **Corp ID**, **Agent ID**, and **Secret**.
5. Save the bot.
6. Open **Agent Config** and edit the Agent Config you want to attach it to.
7. Turn on **Bot** and select the bot.
8. Optionally enable **Forward agent messages** or **Handoff** (next section).
9. Reopen the agent from CCR.

## Forward or handoff

- **Forward agent messages**: forwards regardless of lock state. Increases message volume — use only for full logs or troubleshooting.
- **Handoff**: only forwards after the screen locks. Pair with Idle seconds and a target device.

> For lock-screen-only alerts, use **Handoff** without **Forward agent messages**.

## Test it

1. Open the agent from CCR and trigger a message.
2. Check WeCom to confirm the app received it and replied.
3. Lock the screen, wait past your idle threshold, and confirm new agent messages arrive via handoff.

> **How to tell it worked:** WeCom shows the agent's message, and replies keep the agent going.

## Common issues

- **Auth fails**: re-copy Corp ID, Agent ID, and Secret.
- **Starts but receives nothing**: check that the WeCom app is allowed to receive messages and that the current member has access.
- **Send fails with an untrusted IP**: configure `企业可信IP` in the WeCom dashboard.
- **Some members can't see the app**: check the self-built app's visibility scope.
- **Handoff doesn't trigger**: confirm the screen is locked, and check the Handoff toggle, idle time, and target device.
