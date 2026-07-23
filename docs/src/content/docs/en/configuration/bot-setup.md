---
title: Setup
pageTitle: Bot Setup
eyebrow: Bots
lead: Add a Bot, bind it to Agent Config, and choose message forwarding or handoff.
---

## Steps

1. Open **Bot Management** and click **Add Bot**.
2. Select a platform and fill in the required token, secret, signing secret, robot code, or OAuth fields.
3. Save the Bot.
4. Open the target **Agent Config** and enable **Bot**.
5. Configure forwarding, handoff, language, timeout, attachments, streaming, and **Allow Agent shell tools** as needed.
6. Reopen Claude, Codex, ZCode, or OpenCode App from CCR. The Bot is online only while the App is alive.

## Verification

Open the Agent App from CCR, then send `/project current`, `/session list`, and one plain message from IM. The Profile card shows connection state, the last event and delivery, pending outbox count, and redacted errors; `/session doctor` provides the same runtime diagnostics. Closing the App should move the Bot to offline state.
