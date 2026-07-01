---
title: Routing Config
pageTitle: Routing Config
eyebrow: Detailed Configuration
lead: Choose the model for a request, then automatically retry or switch to fallback models when the request fails.
---

## Built-In Routing

### Claude Code

The built-in Claude Code route detects requests from Claude Code and routes main requests to the Claude Code Agent Config model.

Claude Code **main requests** use the Claude Code Agent Config model. If that model is unset, the built-in route remains inactive. CCR also automatically removes the first `x-anthropic-billing-header` system message injected by Claude Code so that billing helper messages do not affect later routing decisions. Claude Code Subagent, Task, and Workflow-created agents can still choose different models through the tag mechanism below.

#### Subagent / Workflow Auto-Routing

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

##### Pairing It With The Models Page

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

### Codex

The built-in Codex route adapts Codex's `apply_patch` file-editing tool for third-party or non-GPT models. The goal is for those models to edit files through the patch tool instead of generating commands or scripts such as `cat >`, `sed -i`, `python`, or `node`.

Technically, this is a tool protocol bridge. Native Codex `apply_patch` is a custom/freeform tool whose input is raw patch text, while many OpenAI-compatible third-party models handle ordinary function tools more reliably. CCR rewrites `apply_patch` into an upstream-visible `virtual_apply_patch` function tool and injects the full `apply_patch.lark` grammar into the tool description, requiring the model to put the patch in the `patch` field.

When the model returns `virtual_apply_patch`, CCR rewrites it back to Codex's expected shape: `custom_tool_call` with `name = apply_patch` and `input = raw patch text`. CCR does not edit files directly; Codex still executes the resulting patch. This adaptation follows the built-in **Codex** route and has no separate switch. GPT-named models keep using Codex's native freeform `apply_patch` path.

## Custom Routing

Custom routes are configured in the Routing page rule list. The top **Search routing rules** field filters by rule name, condition, request action, and related row text; the top-right **Add** button opens the **Add Routing Rule** dialog. The table shows each rule under **Name**, **Condition**, **Request action**, **Status**, and **Action**.

Custom rules match in list order, and the first enabled matching rule rewrites the request. Use the move up and move down buttons to adjust priority. Use the edit button to open **Edit Routing Rule**, and the delete button to open a confirmation dialog. Turning off the **Status** toggle keeps the rule in the list but removes it from matching.

### Add Or Edit A Rule

The dialog fields map directly to the saved rule:

| UI field | How to fill it | Saved meaning |
| --- | --- | --- |
| **Name** | Enter a recognizable rule name. This field is required. | Shown in the **Name** column and included in search. |
| **Condition** | Choose `request.header` or `request.body`, then fill in field, operator, and value. | Builds `condition.left`, `condition.operator`, and `condition.right`. |
| **Rewrite request parameters** | Keep at least one rewrite row. Each row chooses an operation, target key, and required value fields. | Builds `rewrites`, applied when the rule matches. |
| **Enabled** | Turn the rule on or off. | Controls `enabled`; disabled rules do not match. |
| **On failure** | Configure fallback behavior for this rule. | Overrides **Default on failure** when this rule matches. |

The **Add** or **Save** button is enabled only when the form is valid: name, condition field, and condition value are required; every rewrite row must have a key. **Delete** only requires a key. **Replace in array** requires both **Match value** and **Value**. Other operations require **Value**.

### Condition

The **Condition** area has four controls: source, field, operator, and value.

| Source | Field examples | Matched path |
| --- | --- | --- |
| `request.header` | `user-agent`, `x-api-key`, `x-client-name` | `request.header.user-agent` |
| `request.body` | `model`, `messages`, `messages.0.role`, `tools` | `request.body.model` |

Header names are case-insensitive. Body fields use dot-path lookup, and numeric segments address array indexes; for example, `messages.0.role` reads the first message role. For nested arrays such as `messages` or `tools`, `contains deep` is usually more robust than a fixed index.

The value field is parsed as a common literal when possible: `true`, `false`, `null`, numbers, JSON objects, and JSON arrays compare as their corresponding types. Other input is treated as a string. To force a value to stay string-like, wrap it as `"123"` or `'123'`.

| Operator | Use |
| --- | --- |
| `==` / `!=` | Compare actual and expected values. Numbers compare numerically; other values compare by comparable text. |
| `>` / `>=` / `<` / `<=` | Compare numerically when both sides are numbers; otherwise compare text order. |
| `starts with` | Check whether the actual value starts with the input value. Useful for model-prefix routing. |
| `contains` | Check substring containment for strings; for arrays, check direct array elements. |
| `contains deep` | Recursively checks objects and arrays. Useful for searching `messages` and `tools`. |
| `not contains` | The inverse of `contains`. |

### Rewrite Request Parameters

The **Rewrite request parameters** area starts with one `request.body.model` row. This is the common model-routing path: choose **Set**, use key `request.body.model`, and set the value to a target `provider/model` or Fusion model.

Click **Add parameter** to add more rewrite rows. The trash button removes a row, but the last row cannot be removed. When the rule matches, CCR applies the rewrite rows in order.

| Operation | Required fields | Behavior |
| --- | --- | --- |
| **Set** | key, value | Sets a request field, such as `request.body.model = provider/model` or `request.body.temperature = 0.2`. |
| **Delete** | key | Deletes a request field. Deleting `request.header.x-test` removes that header; deleting `request.body.foo` removes that body field. |
| **Append to array** | key, value | Appends the value to the target array. If the target is not an array, CCR starts from an empty array. |
| **Prepend to array** | key, value | Prepends the value to the target array. |
| **Remove from array** | key, value | Removes array elements equal to the value. |
| **Replace in array** | key, match value, value | Replaces array elements matching **Match value** with the new value. |

Rewrite values are also parsed as literals, so `0.2` becomes a number, `true` becomes a boolean, and `{"type":"web_search"}` becomes an object. Only `request.body.model` receives additional CCR model-selector normalization.

### On Failure

The dialog **On failure** control is the same control used by the page-level **Default on failure** setting. Choose **Off** to avoid fallback. Choose **Retry** to reveal **Retries**. Choose **Fallback targets** to reveal the **Fallback target** input and **Add** button. Added targets appear as tags with move up, move down, and remove buttons for ordering the fallback chain.

When a rule matches, its **On failure** setting is used. Requests that do not match a rule continue to use the page-level default.

### Examples

| Goal | Condition source | Field | Operator | Value | Rewrite request parameters |
| --- | --- | --- | --- | --- | --- |
| Route by client header | `request.header` | `x-client-name` | `==` | `claude-code` | **Set** `request.body.model = provider/model` |
| Route by original model prefix | `request.body` | `model` | `starts with` | `claude-` | **Set** `request.body.model = provider/model` |
| Route message content to a vision model | `request.body` | `messages` | `contains deep` | `image` | **Set** `request.body.model = vision-provider/model` |
| Remove a debug header | `request.header` | `x-debug-route` | `==` | `1` | **Delete** `request.header.x-debug-route` |

After saving, the rule appears in the list. Use request logs, especially `request model`, `resolved provider`, `resolved model`, and route reason, to verify that it matched.

## Fallback Handling

Fallback is the failure strategy after a model or upstream request fails. Routing picks the first model; Fallback decides whether CCR should keep trying after the current target fails.

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

Global Fallback applies to routing rules that do not define their own Fallback.

### Rule-Level Fallback

When adding or editing a routing rule, configure **On failure** for that rule.

Rule-level Fallback is useful for high-risk or expensive targets. For example, route image tasks to a Fusion vision model first, then fall back to another multimodal model; or route complex tasks to a strong model first, then fall back to a stable model.

## Verification

After saving, send a request and inspect Logs:

- `request model`: the original model from the client.
- `resolved provider`: the final provider.
- `resolved model`: the final model.
- status code and error details.

When Fallback runs, response headers include `x-ccr-fallback-attempts`, `x-ccr-fallback-failures`, `x-ccr-fallback-delays-ms` for delayed attempts, and the final `x-ccr-fallback-model`. Request log details also show the related retry attempt list.
