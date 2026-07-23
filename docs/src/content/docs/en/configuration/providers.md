---
title: Provider Config
pageTitle: Provider Config
eyebrow: Detailed Configuration
lead: Configure upstream model services, credentials, protocols, base URLs, and model lists.
---

## Import Local Agent Login

When you add a provider, CCR scans for reusable local agent login state. If usable credentials are found, the add dialog shows the matching import entry. Importing creates a normal provider plus provider plugins, so CCR can reuse the local agent authorization without requiring a pasted API key.

### Claude Code

Claude Code import reads local Claude Code OAuth credentials. When a usable access token is available, CCR can import it as a `Claude Code API` provider.

After import:

1. The protocol is `anthropic_messages`.
2. The default model list includes `claude-sonnet-4-20250514`; you can later add or remove models in the provider model list.
3. CCR creates OAuth provider plugins that convert requests to use the Claude Code login state.
4. Account usage uses the Anthropic OAuth usage endpoint, so quota state can appear in the provider list, tray, and account panels.

If CCR only detects login traces but no usable access token, the import entry shows why it cannot be imported. Re-authenticate in Claude Code, then return to CCR and add the provider again.

### Codex

Codex import reads the local Codex auth file and model cache. When a Codex access token or refresh token is available, CCR can import it as a `Codex API` provider.

After import:

1. The protocol is `openai_responses`.
2. The API endpoint points to the Codex backend. The model list always includes at least `gpt-5-codex` and also merges models and display names from the local model cache.
3. CCR creates Codex OAuth provider plugins and refreshes access credentials when needed.
4. Account usage reads Codex quota, balance, and token-stat endpoints.

After import, select `Codex API/model-name` in routing or Agent Profiles. If the model cache is stale, open Codex first so it refreshes the model list, then return to CCR to import again or edit the models.

### ZCode

ZCode import reads provider API keys, API endpoints, and model lists from local ZCode config. It can be imported as a `ZCode API` provider only when CCR finds a usable provider key and Base URL.

After import:

1. The protocol is `anthropic_messages`.
2. Models come from local ZCode config first; if none are configured, CCR uses the ZCode runtime cache or default models.
3. CCR creates API-key provider plugins that use the key from local ZCode config for request authentication.
4. If the API endpoint matches a built-in CCR preset, account usage settings are reused from that preset.

If CCR detects ZCode login state but no usable provider API key, the import entry remains unavailable. Configure a usable model provider in ZCode first, then return to CCR and add the provider.

## Main Fields

| Field | Capability |
| --- | --- |
| Select preset provider | Applies a built-in provider template, including default endpoint, supported protocols, default models, icon, provider website, and sometimes account usage settings. Choose `Other / custom API endpoint` for any OpenAI, Anthropic, or Gemini compatible upstream. |
| Name | Internal CCR display name. It is also used by routing, model selectors, logs, and config references. Names must be unique. |
| API endpoint | Upstream API base URL. It controls where requests are sent, and is also used for protocol probing, model discovery, icon detection, and safety checks. Preset providers hide it by default while adding, but it can be overridden in Advanced settings. Custom providers must provide it. |
| API key | Default provider credential. When the credential pool is empty, model requests use this key. Protocol probing, model discovery, connection checks, and default usage fetching also use it. Only use a key issued for the selected endpoint. |
| Models | Model IDs exposed by CCR. Routing rules, profile model selectors, the model catalog, and client `/models` responses all use this list. |
| Search models / All / Clear | When CCR can discover models from the upstream or catalog, you can search, select all, clear, and choose models. Selected models are saved to the provider. |
| Custom models | Manually adds model IDs that discovery did not return. Use this when the provider lacks a `/models` endpoint or a new model is not in the catalog yet. |
| Check Connection | Sends real test requests with the current endpoint, API key, protocol, and selected models. It verifies key, model name, and protocol usability. |
| Models to check | Model selection inside the connection-check confirmation dialog. Use it to test only some models. |
| Check results | Shows whether each model is available, which protocol matched, and the upstream diagnostic message. Results are diagnostic. Add models through the main model selection when you want them saved. |

## Connectivity Checks

`Check Connection` sends real model requests for the models you select. It verifies whether the endpoint, API key, protocol, and model IDs are usable. The check limits generated output, but it can still create extra token usage or count against provider-side request limits.

If the provider bills by request, input tokens, or output tokens, select only the models you need to verify. Checking every model at once can create unnecessary usage. Review the diagnostics, then adjust the model list or usage-fetching settings manually when needed.

## Credentials

`API key` is the simplest single-key setup. For multiple upstream keys, expand `Credential pool` in Advanced settings.

| Field | Capability |
| --- | --- |
| Show credential settings | Expands or collapses credential pool editing. Collapsing does not remove saved credentials. |
| Import JSON | Imports credentials from a JSON file. CCR accepts a top-level array, or an object with a `credentials`, `keys`, or `apiKeys` array. |
| Add key | Adds one upstream API key row. |
| Enable | Controls whether this credential participates in request forwarding and usage fetching. Disabled credentials are kept but not selected. |
| Name | Display name for the credential. It appears in account usage, logs, and diagnostics, so use a recognizable purpose or quota source. |
| API key | The actual key sent to the upstream for this credential. When a credential pool is configured, CCR expands enabled credentials into internal upstream targets and prefers the pool over the main form API key for model requests. |
| Remove | Deletes the credential row. |
| Advanced key options | Expands per-key scheduling and limit fields. |
| Priority | Credential priority. Lower numbers are tried first. If omitted, the row order is used. |
| Weight | Tie-break weight among credentials with the same priority and similar usage. Higher numbers are preferred. Defaults to `1`. |
| Limits JSON | Local limit rules for this key. CCR tracks request, token, or image usage windows and skips a key once it would exceed its limit, then tries another key on the same provider. |

Common `Limits JSON` fields:

| Field | Meaning |
| --- | --- |
| `rpm` / `rph` / `rpd` | Max requests per minute / hour / day |
| `tpm` / `tph` / `tpd` | Max tokens per minute / hour / day |
| `ipm` / `iph` / `ipd` | Max images per minute / hour / day |
| `maxRequests` + `windowMs` | Max requests in a custom time window |
| `maxTokens` + `quotaWindowMs` | Max tokens in a custom time window |

Example:

```json
{
  "rpm": 60,
  "tpm": 100000
}
```

The credential pool is an upstream provider key pool. It is separate from the client access keys configured on the API Keys page.

## Usage Fetching

`Fetch usage` lets CCR show balance, subscription quota, status, and messages in the provider list, tray, and account panels. It does not affect whether models can be requested.

| Field | Capability |
| --- | --- |
| Fetch usage | Enables or disables account usage fetching for this provider. |
| Usage mode | Usage connector mode. `Standard usage endpoint` uses CCR standard account endpoints; `HTTP JSON request` maps a custom JSON endpoint; `Raw connector JSON` edits the connector array directly. |
| Refresh interval ms | Usage refresh interval in milliseconds. Empty uses the default interval. The minimum effective interval is 30000ms. |

### Standard Usage Endpoint

This mode tries provider-hosted CCR account endpoints such as `/.well-known/ccr/account` and `/v1/account/limits`. It is best for providers or presets that already implement CCR's standard account format.

### HTTP JSON Request

Use this mode when the provider has a balance or quota endpoint that returns a custom JSON shape.

| Field | Capability |
| --- | --- |
| Method | Usage request method, `GET` or `POST`. |
| Usage request URL | Usage endpoint URL. It can be a full URL. The request includes the provider API key unless changed through raw connector JSON. |
| Headers | Extra headers for the usage endpoint. Avoid hard-coding sensitive auth headers here; prefer provider API key auth. |
| Body | `POST` request body. Must be valid JSON. |
| Balance remaining field | JSON path for remaining balance. |
| Balance total field | JSON path for total balance or total credits. |
| Balance used field | JSON path for used balance. |
| Balance unit | Balance unit, such as `USD`, `CNY`, or `%`. |
| Subscription remaining field | JSON path for remaining subscription, token, quota, or package amount. |
| Subscription limit field | JSON path for subscription, token, quota, or package limit. |
| Subscription reset field | JSON path for reset time. It may resolve to an ISO string, seconds timestamp, or milliseconds timestamp. |
| Subscription unit | Subscription unit, such as `tokens`, `requests`, or `hours`. |
| Status field | JSON path for account status. Supported values are `ok`, `warning`, `critical`, `error`, and `unsupported`. |
| Message field | JSON path for account message. Useful for provider errors, plan notes, or risk-control messages. |
| Test usage request | Requests and parses the usage endpoint before saving. |
| Response fields | Lists selectable paths from the response. Buttons such as `Balance rem`, `Balance total`, `Balance used`, `Sub rem`, `Sub limit`, and `Reset` fill the matching field. |

Field paths use CCR's lightweight JSONPath syntax:

| Syntax | Meaning |
| --- | --- |
| `$` | Whole response object |
| `$.balance.remaining` | Object field |
| `$.items[0].value` | Array index |
| `$["weird-key"]` | Field name with special characters |
| `$.limits[?(@.type=="TOKENS")].remaining` | First array item matching simple equality filters |
| `100 - $.data.percentage` | Numeric subtraction expression, often used to convert used percent into remaining percent |

### Raw Connector JSON

`Connectors JSON` edits the `account.connectors` array directly for more complex provider setups.

| Connector type | Capability |
| --- | --- |
| `standard` | Uses CCR standard account endpoints. |
| `http-json` | Requests a JSON endpoint and maps balance, subscription, status, and message fields. |
| `plugin` | Calls an account usage connector registered by an installed plugin. |
| `local-estimate` | Shows estimated quota from local time-window config without a remote request. |

`Insert example` fills an example connector array containing `standard`, `http-json`, `plugin`, and `local-estimate` connectors.
