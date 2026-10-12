---
title: Add a provider
pageTitle: Add a provider
eyebrow: Quick start
lead: "The interactive panel at the top of this page connects to your running CCR to add a provider directly. Prefer the desktop app? The steps below cover choosing a preset or custom endpoint, entering credentials, letting CCR auto-detect protocols and models, and verifying with a connectivity check."
---

## Add the provider

1. Open **Providers** and click **Add Provider**.
2. Choose a built-in preset under **Select preset provider**. Presets fill common API endpoints, protocols, and icons automatically.
3. If the service is not listed, choose **Other / custom API endpoint** and enter a **Name** and **API endpoint**.
4. In the **Add credentials** step, enter the **API key**.

After you enter the API endpoint and key, CCR automatically detects the protocols and models the endpoint supports. Preset providers hide the API endpoint field by default; override it in **Advanced settings** if needed.

## Protocols

The protocol decides which request format CCR uses to talk to the upstream. It is chosen by auto-detection by default; use the table below when you need to pick manually.

| Protocol | Best for |
| --- | --- |
| OpenAI Chat | Most OpenAI-compatible services |
| OpenAI Responses | Services that support the Responses API |
| Anthropic Messages | Anthropic official or Anthropic-compatible services |
| Gemini Generate | Gemini official or Gemini-compatible services |
| Gemini Interactions | Services that support the Gemini Interactions protocol |

If auto-detection misses the mark, turn it off in **Advanced settings**, choose a protocol manually, and confirm with a connectivity check.

## OpenAI-compatible custom endpoints

When you choose **Other / custom API endpoint**, two details are easy to get wrong on hosts that speak OpenAI Chat Completions but also expose other routes:

1. **Use the `/v1` root as the API endpoint**, not `/v1/chat/completions`. CCR appends the route for the selected protocol and discovers models with `GET /v1/models`.
2. **Pick OpenAI Chat**, not OpenAI Responses or Anthropic Messages. Auto-detect may choose **OpenAI Responses** when `POST /v1/responses` exists on the host — even if unauthenticated calls return `401` rather than `404`. Hosts that only support Chat Completions need **OpenAI Chat** manually.

If auto-detect picked the wrong protocol, turn it off in **Advanced settings**, select **OpenAI Chat**, and confirm with **Check Connection**.

### Worked example

The following steps work against an OpenAI-compatible host whose catalog is available at `GET https://api.example.com/v1/models`:

1. **Providers** → **Add Provider** → **Other / custom API endpoint**
2. **Name**: any internal label (for example `my-gateway`)
3. **API endpoint**: `https://api.example.com/v1`
4. **API key**: your Bearer token
5. **Protocol**: **OpenAI Chat** (disable auto-detect in **Advanced settings** if it selected Responses)
6. **Models**: auto-fetch or add a model ID from the catalog
7. **Check Connection** on one text model (this sends a real request)

Do not append `/chat/completions` to the endpoint. Do not choose **Anthropic Messages** for an OpenAI-compatible wire.

## Verify connectivity

Once credentials and models are in place, click **Check Connection**: CCR sends a real request with the current API endpoint, key, protocol, and selected models to confirm the full path works. Output is length-limited, but it may still consume a few tokens or count toward provider-side request limits, so select only the models you need to confirm.

Save the provider once the check passes.

## Multiple keys and usage

For teams or high-frequency usage, switch to the **Credential pool** tab in the credentials step, add multiple upstream keys, and configure priority, weight, and limits. CCR rotates between them according to your rules.

To show balance or remaining quota in the provider list, tray, or overview, turn on **Fetch usage** in the form, choose a usage mode, and test the field mapping.

For full details on credential limits and usage field mapping, see [Provider config](../../configuration/providers/).

## Related pages

- [Install and start CCR](../install/)
- [Connect Agent Config](../agent-profile/)
- [Provider config](../../configuration/providers/)
- [Routing](../../configuration/routing/)
