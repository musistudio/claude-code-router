---
title: Claude Design setup and configuration
pageTitle: Claude Design
eyebrow: Detailed configuration
lead: "Connect Claude Design to CCR. Claude Design is App-only."
---

## Who this is for

Claude Design is Anthropic's design agent, run as a desktop app. In CCR it is **App only** and is opened from CCR Desktop.

Use this page to register a Claude Design profile and, optionally, add routing rules.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Claude Design is available through CCR Desktop.
3. You are on **Agent Config** and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Claude Design**.
2. Enter a **Config name** (for example `Claude Design`).
3. Optionally add routing rules (see below).
4. **Save**, then open Claude Design from CCR Desktop.

## Configuration reference

Claude Design is fixed to **App only** and **Only opened from CCR**. Most agent fields do not apply.

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Claude Design** | Registers an App-only, CCR-managed profile. |
| Config name | Free text, e.g. `Claude Design` | Identifies the profile in CCR. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Routing | Optional routing rules | Rules that affect how this profile's requests are routed. See [Routing](/en/routing/). |

## Routing

You can attach routing rules to a Claude Design profile to control which provider or model handles its requests (for example, to pin a specific provider or add failover). The enhanced-route toggle does not apply to Claude Design (it is always on); only explicit rules have an effect. See [Routing](/en/routing/) for how rules work.

## Open and use

Open Claude Design from CCR Desktop. It cannot be launched with a terminal profile command.

## Verify

1. Open Claude Design from CCR Desktop.
2. Send one request and confirm it completes.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.

## Common issues

- **Cannot open from the terminal:** Claude Design is App-only and is opened from CCR Desktop.
- **Requests bypass CCR:** confirm the profile is **Enabled** and you opened Claude Design from CCR Desktop.
- **Routing rules have no effect:** only explicit rules apply; the enhanced-route toggle is always on for Claude Design.
