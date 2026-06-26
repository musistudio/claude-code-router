---
title: Routing Config
pageTitle: Routing Config
eyebrow: Detailed Configuration
lead: Choose the model for a request, then automatically retry or switch to fallback models when the request fails.
---

## How Routing Works

CCR first decides which model the request should use, then forwards the request upstream. The current implementation follows this order:

1. If the incoming `model` is already a known `provider/model` selector, CCR uses it directly.
2. If a custom router script is configured, the model returned by that script takes priority over UI routing rules.
3. Routing rules are evaluated from top to bottom. The first matching rule applies its request rewrite.
4. If no rule matches, CCR uses the default route. If no default is configured, it keeps the original request model.

The core shape of a rule is **Condition + Request action**. The condition decides whether the rule matches; the request action changes request fields. The most common action is setting `request.body.model` to a provider model or Fusion model.

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

When Fallback runs, response headers include `x-ccr-fallback-attempts`, `x-ccr-fallback-failures`, and the final `x-ccr-fallback-model`.
