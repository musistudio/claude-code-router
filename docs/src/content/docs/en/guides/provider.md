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


## Responses Reasoning History

For an OpenAI Responses capability, **Reasoning history** controls what CCR asks ai-gateway to send on later turns:

- **Native history (including encrypted reasoning)** keeps the complete provider-native workflow when the route remains compatible. The saved configuration value is still `encrypted` for backward compatibility.
- **Replay readable reasoning** removes ciphertext and signatures and sends only text or summaries to compatible services.
- **Do not send reasoning history** explicitly accepts removing reasoning-dependent history. This can discard context for which a compaction item is the only remaining representation, so use it only when that context loss is acceptable.
- **Auto** selects a policy from the endpoint. If Auto safely degrades to strip, it does not count as explicit permission to discard unique compacted context.

Provider-native carriers are intended for trusted local clients and single-tenant deployments. Their source fields are compatibility provenance, not credentials. Do not expose carrier replay to untrusted clients through a public multi-tenant proxy.

For other protocols (Anthropic Messages, Gemini generateContent, Gemini Interactions, OpenAI Chat Completions), reasoning history is handled automatically by CCR protocol rules; the provider card shows this as a read-only note and no configuration is needed.

### Reasoning history handling matrix

How reasoning state from each source protocol is treated when the upstream target uses a given protocol:

| Source ↓ / Target → | Responses (native policy) | Responses (plaintext policy) | Anthropic Messages | Gemini generateContent | Gemini Interactions | Plaintext Chat vendors |
| --- | --- | --- | --- | --- | --- | --- |
| Responses native state | Native replay¹ | Readable text/summary only | Dropped² | Dropped² | Dropped² | Readable text/summary only |
| Responses plaintext reasoning | Discarded (encrypted items are never fabricated) | Sent as plaintext | Dropped² | Dropped² | Dropped² | Sent as plaintext |
| Anthropic thinking + signature | Dropped² | Readable text extracted | Native replay¹ | Dropped² | Dropped² | Readable text only |
| Gemini generateContent part + signature | Dropped² | Readable text extracted | Dropped² | Native replay¹ | Dropped² | Readable text only |
| Gemini Interactions signed steps | Dropped² | Text/summary extracted | Dropped² | Dropped² | Native replay¹ ³ | Text/summary sent |
| Plaintext Chat reasoning | Discarded (encrypted items are never constructed) | Sent as plaintext | Dropped² | Dropped² | Dropped² | Sent per vendor adapter |
| Reasoning of unknown origin | Never | Never by default | Never | Never | Never | Never by default |

Notes:

1. Native replay requires the same provider family, endpoint, account credential scope, and model, plus a complete capture of the original state.
2. "Dropped" is atomic at the dependency-group level: when reasoning is grouped with tool calls, a closed historical group is dropped as a whole and an active group fails the request with an explicit error — partial tool call/result pairs are never sent upstream.
3. Gemini Interactions is the exception: official cross-model replay between Gemini models on the same service is allowed.
4. A same-protocol request without any carrier may pass through unchanged only while the route is unchanged (compatibility passthrough — this does not count as verified same-origin replay).

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
