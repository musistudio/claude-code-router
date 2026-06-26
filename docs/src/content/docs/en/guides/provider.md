---
title: Add A Provider
pageTitle: Add A Provider
eyebrow: Quick Start
lead: Add an upstream model service, then run protocol, model, and usage checks before saving.
---

## Add The Provider

1. Open **Providers** and click **Add Provider**.
2. Choose a built-in preset under **Preset providers**. Presets fill common Base URLs, protocols, and icons automatically.
3. If the service is not listed, choose **Other / custom API endpoint**.
4. Fill in **Name**, **Base URL**, **Protocol**, **API Key**, and **Models**.

## Choose A Protocol

| Protocol | Best For |
| --- | --- |
| OpenAI Chat Completions | Most OpenAI-compatible services |
| OpenAI Responses | Services that support the Responses API |
| Anthropic Messages | Anthropic official or Anthropic-compatible services |
| Gemini Generate Content | Gemini official or Gemini-compatible services |

If you are unsure, run protocol probing in the app first, then use the model connectivity check to confirm.

## Check These Before Saving

1. **Protocol probing**: confirm which protocols the Base URL supports.
2. **Model connectivity check**: send test requests to one or two models.
3. **Account usage test**: if you want balance or quota display, confirm the usage API and field mapping.

Save the provider after these checks pass.

## Multiple Keys And Usage Panel

For teams or high-frequency usage, add multiple credentials in the provider form and configure priority, weight, and limits.

If you want the overview to show balance or remaining quota, open the provider's **Account / Usage** section, configure the usage integration, and test field mapping.
