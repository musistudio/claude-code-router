---
title: Routing Config
pageTitle: Routing Config
eyebrow: Detailed Configuration
lead: Choose the model for a request, then automatically retry or switch to fallback models when the request fails.
---

## How Routing Works

CCR first decides which model the request should use, then forwards the request upstream. The current implementation has two layers:

1. **Request preprocessing**: when the built-in Claude Code route matches, CCR processes the Claude Code Agent / Task / Workflow tool descriptions, removes the first billing system text block from Claude Code subagent requests, and extracts any `<CCR-SUBAGENT-MODEL>...</CCR-SUBAGENT-MODEL>` model tag.
2. **Model decision**: if a custom router script returns a model, that model wins. Otherwise CCR tries, in order, a Claude Code subagent tag, a known `provider/model` inline selector, built-in agent routes, UI routing rules, and finally the default route.

The core shape of a rule is **Condition + Request action**. The condition decides whether the rule matches; the request action changes request fields. The most common action is setting `request.body.model` to a provider model or Fusion model.

## Built-In Claude Code Routing

The Routing page shows built-in **Claude Code** and **Codex** routes. Built-in routes are not normal routing rules: they cannot be moved, edited, or deleted. You can only enable or disable them. The info icon next to the name explains what each built-in route does.

The built-in Claude Code route detects requests from Claude Code and routes main requests to the Claude Code Agent Config model or the default route model:

| Item | Behavior |
| --- | --- |
| Match condition | Request header `user-agent` contains `claude` |
| Required setup | An enabled Claude Code config exists in **Agent Config** |
| Target model | The Claude Code config model first; if unset, the Routing page default model |
| Request action | Set `request.body.model` to the target model |
| Log reason | Main requests usually show `builtin:claude-code` |

This built-in route handles the default model for Claude Code **main requests**. Claude Code Subagent, Task, and Workflow-created agents can still choose different models through the tag mechanism below.

## Claude Code Subagent / Workflow Auto-Routing

Claude Code Agent / Task / Workflow can spawn additional model requests. CCR uses tag injection to let those spawned requests choose a more appropriate CCR model:

```text
<CCR-SUBAGENT-MODEL>provider/model</CCR-SUBAGENT-MODEL>
```

The full flow is:

1. A Claude Code main request matches the built-in route, so CCR inspects the current tool list.
2. If at least one model has a **Description**, CCR injects the available models and descriptions into the `Agent` / `Task` tool description and `prompt` field description.
3. If the tool list includes `Workflow`, CCR appends a Workflow-specific instruction: whenever the workflow creates an `Agent` / `Task`, each spawned agent prompt must start with the same model tag.
4. When Claude Code calls `Agent` / `Task`, or when a Workflow creates an agent, the prompt starts with `<CCR-SUBAGENT-MODEL>provider/model</CCR-SUBAGENT-MODEL>`.
5. When the spawned request reaches CCR, CCR extracts and removes the tag from the system prompt or the first two user messages, then routes that request to the tagged model.

Subagent / Workflow auto-routing therefore does not use headers such as `x-claude-code-agent-id` as the model selector. Those headers can help with observation, but the actual model selection comes from the prompt tag.

### Pairing It With The Models Page

The **Description** field on the Models page is both the enablement switch and the selection guide for this mechanism. If no model has a Description, CCR does not inject Agent / Task / Workflow routing instructions, so it does not write an empty model list into tool descriptions.

Recommended setup:

1. Add usable models under **Providers**, and verify that the model IDs can be requested.
2. Open **Models** and fill Description for the models you want Subagents to choose automatically. Describe task fit, speed, cost, and limits.
3. Enable a Claude Code config under **Agent Config**, and choose the main model. This model handles the main Claude Code conversation.
4. Confirm that the built-in **Claude Code** route is enabled on the **Routing** page.
5. Use Agent, Task, or Workflow in Claude Code. When Claude Code spawns an agent, it can choose a CCR model from the descriptions and write the tag.

Write descriptions around tasks instead of only naming the provider. For example:

| Model purpose | Description example |
| --- | --- |
| Fast low-cost model | Good for code search, file triage, summaries, small edits, and low-cost parallel Subagents. |
| Strong reasoning model | Good for complex architecture analysis, large refactor planning, cross-file reasoning, and high-risk code review. |
| Long-context model | Good for reading large logs, long documents, repository-scale context gathering, and Workflow summaries. |

After saving, CCR formats those descriptions as “Configured CCR gateway models” in the injected Claude Code instructions. When Claude Code picks a model, request logs should show `builtin:claude-code-subagent`, and the tagged model becomes the final `resolved model`.

## What Fallback Does

Fallback is the failure strategy after a model or upstream request fails. It does not pick the first model; it decides whether CCR should keep trying after the current target fails.

The **Default on failure** control at the top of the Routing page is the global Fallback. Each rule also has **On failure**. When a rule matches, its rule-level Fallback overrides the global Fallback.

## Fallback Modes

| Mode | Behavior |
| --- | --- |
| Off | Do not fallback; send the request once to the current model |
| Retry | Retry the same model up to `Retries` times |
| Fallback targets | Try the current model first, then switch through configured fallback models in order |

Use **Retry** for transient timeout, rate-limit, or network failures. Use **Fallback targets** when the primary model or provider should fail over to another model or provider.

## Failure Triggers

Network errors move to the next attempt. Status-code fallback depends on the mode:

| Mode | Triggering status codes |
| --- | --- |
| Retry | `408`, `409`, `429`, `5xx` |
| Fallback targets | Any `4xx` or `5xx` |

For `429` rate-limit responses, CCR waits before the next attempt. It honors `Retry-After` when the upstream provides it; otherwise it uses exponential backoff starting at 1 second and capped at 30 seconds per attempt.

**Fallback targets** also switches on `4xx` because model-not-found, auth, or provider-side rejection errors may only affect the current target. If the fallback model works, the request can still succeed.

## How To Configure

### Global Fallback

Configure **Default on failure** at the top of the Routing page:

1. Choose **Retry** or **Fallback targets**.
2. If you choose **Retry**, set `Retries`.
3. If you choose **Fallback targets**, add backup models in priority order.

Global Fallback applies to the default route and to rules that do not define their own Fallback.

### Rule-Level Fallback

When adding or editing a routing rule, configure **On failure** for that rule.

Rule-level Fallback is useful for high-risk or expensive targets. For example, route image tasks to a Fusion vision model first, then fall back to another multimodal model; or route complex tasks to a strong model first, then fall back to a stable model.

### Conditional Routing

The current UI primarily creates conditional rules. Conditions can read request headers or the request body:

| Source | Example |
| --- | --- |
| `request.header` | `x-client-name == claude-code` |
| `request.body` | `model starts-with claude-` |
| `request.body` | `messages contains-deep image` |

After a match, the request action can set, delete, or modify request fields. The most common action is:

```text
set request.body.model = provider/model
```

The model can also be a Fusion model, so routing can send selected requests to vision, search, or tool-augmented models.

## Verification

After saving, send a request and inspect Logs:

- `request model`: the original model from the client.
- `resolved provider`: the final provider.
- `resolved model`: the final model.
- status code and error details.

When Fallback runs, response headers include `x-ccr-fallback-attempts`, `x-ccr-fallback-failures`, `x-ccr-fallback-delays-ms` for delayed attempts, and the final `x-ccr-fallback-model`. Request log details also show the related retry attempt list.
