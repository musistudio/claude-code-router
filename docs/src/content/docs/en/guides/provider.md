---
title: Add a provider
pageTitle: Add a provider
eyebrow: Quick start
lead: "Add an upstream model provider to CCR: choose a protocol, enter credentials and models, and run protocol probing, model connectivity, and account usage checks before saving."
---

## Add the provider

1. Open **Providers** and click **Add Provider**.
2. Choose a built-in preset under **Preset providers**. Presets fill common Base URLs, protocols, and icons automatically.
3. If the service is not listed, choose **Other / custom API endpoint**.
4. Fill in **Name**, **Base URL**, **Protocol**, **API Key**, and **Models**.

## Choose a protocol

| Protocol | Best for |
| --- | --- |
| OpenAI Chat Completions | Most OpenAI-compatible services |
| OpenAI Responses | Services that support the Responses API |
| Anthropic Messages | Anthropic official or Anthropic-compatible services |
| Gemini Generate Content | Gemini official or Gemini-compatible services |

If you are unsure, run protocol probing in the app first, then use the model connectivity check to confirm.

## Run these checks before saving

1. **Protocol probing**: confirm which protocols the Base URL supports.
2. **Model connectivity check**: send test requests to one or two models.
3. **Account usage test**: if you want balance or quota display, confirm the usage API and field mapping.

Save the provider after these checks pass.

## Multiple keys and the usage panel

For teams or high-frequency usage, add multiple credentials in the provider form and configure priority, weight, and limits.

If you want the overview to show balance or remaining quota, open the provider's **Account / Usage** section, configure the usage integration, and test field mapping.
