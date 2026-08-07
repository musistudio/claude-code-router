---
title: AgentClaw Weixin setup
pageTitle: AgentClaw Weixin
eyebrow: AgentClaw
lead: "Connect agent messages to WeChat (Weixin), with optional handoff after your screen locks. QR Login is recommended — no token copying; a Bot Token from a third-party WeChat bot service also works."
---

## Who this is for

Weixin is for individuals who want agent messages in their everyday chat window. The simplest method is QR Login, which needs no manual token.

> New to AgentClaw? Read the AgentClaw overview and usage and configuration first, then come back here for a single platform.

## Two login methods

| Method | What you need | Who it's for |
| --- | --- | --- |
| QR Login | A WeChat account that can scan and confirm | Most individuals |
| Bot Token | A token from an external WeChat bot service or iLink plugin | Users who already run a third-party WeChat bot service |

> **Prefer QR Login.** A WeChat session is tightly bound to account safety — use a dedicated bot account, not your main account that handles payments, customer service, or important contacts.

## Method 1: QR Login (recommended)

1. Open CCR's **Bot Management** page and click **Add Bot**.
2. Pick **Weixin iLink** as the platform.
3. Choose **QR Login** (the default).
4. CCR opens a QR code window.
5. Scan the code with your phone's WeChat.
6. Confirm the login on your phone.
7. Wait for CCR to show login success.
8. Save the bot.

> QR codes expire. If the scan page says it's expired, close the login window and start over.

## Method 2: Bot Token

Use this only if you already have a token from an external WeChat bot service, an iLink service, or a plugin.

1. Copy the `Bot Token` from the provider's dashboard or local plugin output.
2. If the provider also gave an `Account ID`, copy it.
3. If it gave a `User ID`, copy that too.
4. Open CCR's **Bot Management** page and click **Add Bot**.
5. Pick **Weixin iLink** and choose **Bot Token** auth.
6. Fill in **Bot Token**, and **Account ID** / **User ID** if you have them.
7. Save the bot.

## Wire it up in CCR

Whichever login you used, bind the bot to an Agent Config:

1. Open **Agent Config** and edit the Agent Config you want to attach it to.
2. Turn on **Bot** and select the bot you just saved.
3. Optionally enable **Forward agent messages** or **Handoff** (next section).
4. Reopen the agent from CCR.

## Forward or handoff

- **Forward agent messages**: forwards every new agent message to WeChat regardless of lock state. Good when you want every line of output in WeChat.
- **Handoff**: only forwards after the screen locks. Pair with **Idle seconds** and a Wi-Fi/Bluetooth target device.

> For lock-screen-only alerts, use **Handoff** without **Forward agent messages**.

## Test it

1. Open the agent from CCR and trigger a message.
2. Check WeChat to confirm the bot received it and replied.
3. Lock the screen, wait past your idle threshold, and confirm new agent messages arrive in WeChat.

> **How to tell it worked:** WeChat shows the agent's message, and replies keep the agent going.

## Common issues

- **QR code expired**: close the login window and scan again.
- **Scan succeeded but nothing forwards**: confirm the agent was reopened from CCR after Agent Config changes and the Bot toggle is still on.
- **Drops shortly after scanning**: check that phone and computer networks are stable; verify WeChat didn't log in elsewhere and invalidate the session.
- **Token mode won't connect**: re-copy the Bot Token — avoid expired values or stray spaces.
- **Third-party service needs Account ID / User ID**: make sure these come from the same account — don't mix a token and IDs from different accounts.
