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

Choose **Node.js script** as the rule type when a single condition is not enough. After selecting a local script file, it can return the target model, rewrites, and fallback dynamically. The dialog reads and compiles the file before saving and includes a JSON request editor for testing it without sending a real upstream model request.

### Node.js Script Rules

Use a Node.js script rule when ordinary conditions cannot express multi-field decisions, gradual rollouts, external policy lookups, or dynamic request rewrites. A script runs as asynchronous JavaScript in a reusable Worker: it reads the complete request, uses the controlled `api` object to access the network, filesystem, and environment, and returns whether the rule matched together with its model, rewrites, and fallback behavior.

Scripts run in rule-list order. A non-match continues to the next rule; a match uses the routing decision returned by the script. Exceptions, timeouts, and invalid results are fail-open: CCR records a routing diagnostic and continues to the next rule.

#### Create A Script File

1. Create a local file with a `.js`, `.mjs`, or `.cjs` extension.
2. Set **Rule type** to **Node.js script** in the routing rule editor.
3. Select the script file, choose a timeout from 10 to 30000 milliseconds, and use **Validate** or **Test script** to check it.
4. Save the rule. CCR reads the file before every execution, so later file edits do not require saving the rule again.

The Desktop file picker stores an absolute path. A Web UI cannot obtain the real local path selected by the browser, so enter an absolute, relative, or `~/...` path on the machine running CCR. Relative paths resolve from the CCR process working directory. A script file may be at most 64 KiB.

The script file is an **async function body**, not a CommonJS or ES module. Use the injected `input`, `api`, and `return` directly:

```js
if (input.body.model !== "Provider/original-model") {
  return null;
}

return {
  model: "Provider/target-model"
};
```

Top-level `await` is supported. Do not add `module.exports`, `export default`, or `import`, and do not use `require`, `process`, `Buffer`, or native `fetch`; use the APIs documented below for network and file operations. Both `input` and `api` are frozen. Return `rewrites` instead of mutating `input.body` or `input.headers`.

#### `input`: Request Parameters

Each execution receives its own read-only `input` object:

| Field | Type | Description |
| --- | --- | --- |
| `input.body` | `Record<string, unknown>` | Complete JSON request body. |
| `input.headers` | `Record<string, string \| string[]>` | Complete request headers, potentially including authentication, cookies, API keys, and CCR-internal headers. |
| `input.method` | `string` | HTTP method, such as `POST`. |
| `input.url` | `string` | Gateway-relative request URL, such as `/v1/messages`. |
| `input.model` | `string \| undefined` | Shortcut for `input.body.model` when that value is a string. |
| `input.tokenCount` | `number` | CCR's estimated input token count, or `0` when unavailable. |
| `input.sessionId` | `string \| undefined` | Session ID when CCR can resolve it. |
| `input.apiKeyId` | `string \| undefined` | CCR API-key identifier from `x-auth-api-key-id`; this is not the raw key. |
| `input.builtInSubagentModel` | `string \| undefined` | Built-in subagent model when CCR can identify it. |
| `input.summary.lastUserText` | `string` | Text from the last user message, limited to 16 KiB characters. |
| `input.summary.systemText` | `string` | Text from the system content, limited to 8 KiB characters. |
| `input.summary.messageCount` | `number` | Number of elements in `body.messages`. |
| `input.summary.toolNames` | `string[]` | Tool names extracted from `body.tools`, limited to 128 entries. |
| `input.summary.hasImage` | `boolean` | Whether image content was detected anywhere in the request body. |

Header names should normally be read in lowercase. A value can be an array of strings, so handle both forms when needed:

```js
const rawTenant = input.headers["x-tenant-id"];
const tenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
```

#### Test Request JSON

The rule editor's **Test request JSON** builds one script input without sending a real model-upstream request. `body` must be a JSON object; the remaining fields are optional:

| Field | Type | Default |
| --- | --- | --- |
| `body` | JSON object | Required |
| `headers` | `Record<string, string \| string[]>` | `{}` |
| `method` | `string` | `POST` |
| `url` | `string` | `/v1/messages` |
| `sessionId` | `string` | None |
| `tokenCount` | `number` | `0` |

Headers and the body can be supplied together:

```json
{
  "headers": {
    "authorization": "Bearer test-token",
    "x-tenant-id": "enterprise",
    "x-tags": ["review", "production"]
  },
  "body": {
    "model": "Provider/original-model",
    "messages": [
      { "role": "user", "content": "Review this code" }
    ]
  },
  "method": "POST",
  "url": "/v1/messages",
  "sessionId": "test-session",
  "tokenCount": 1200
}
```

The test does not call a model, but `api.fetch`, filesystem reads, and filesystem writes made by the script are real. Use dedicated test endpoints and files when the script has side effects.

#### `api.fetch`: Network Access

```js
const response = await api.fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tenant: "enterprise" })
});
```

- `url` must be an `http:` or `https:` URL without embedded credentials. Local and private-network services are allowed.
- `method` defaults to `GET`; `headers` accepts string values only; `body` must be a string.
- Redirects are not followed automatically, and all network operations share the script's overall timeout.
- The request body is limited to 256 KiB and the response body to 1 MiB. The body is always returned as a UTF-8 string; call `JSON.parse` yourself for JSON.

The returned object has this shape:

```js
{
  ok: true,                  // Whether the HTTP status is 2xx
  status: 200,
  statusText: "OK",
  url: "https://example.com/policy",
  headers: { "content-type": "application/json" },
  body: "{\"model\":\"Provider/target-model\"}",
  redirected: false
}
```

#### `api.fs`: Filesystem Access

Paths may be absolute, relative, or start with `~/...`. There is no path allowlist, but access is still limited by the operating-system permissions of the CCR process.

| API | Returns | Description |
| --- | --- | --- |
| `await api.fs.exists(path)` | `boolean` | Whether a file or directory is accessible. |
| `await api.fs.readText(path)` | `string` | Read a file as UTF-8 text. |
| `await api.fs.readJson(path)` | `unknown` | Read UTF-8 text and apply `JSON.parse`. |
| `await api.fs.list(path)` | `Array<{ name, isFile, isDirectory, isSymbolicLink }>` | List one directory level, up to 256 entries. |
| `await api.fs.stat(path)` | `{ size, modifiedAt, isFile, isDirectory }` | Return byte size, ISO modification time, and file type. |
| `await api.fs.writeText(path, value)` | `void` | Write a UTF-8 string; parent directories are not created. |
| `await api.fs.writeJson(path, value)` | `void` | Write two-space-indented JSON with a trailing newline. |

Each file read or write is limited to 1 MiB.

#### `api.env` And `api.hash`

| API | Returns | Description |
| --- | --- | --- |
| `api.env(name)` | `string \| undefined` | Read any environment variable visible to the CCR process. |
| `api.hash(value)` | `number` | Return a stable unsigned 32-bit hash of the string form, useful for stable rollout buckets. It is not cryptographic. |

#### Return Values

Except for `undefined`, the script result must be JSON-serializable and at most 64 KiB.

| Return value | Routing behavior |
| --- | --- |
| `null`, `undefined`, or `false` | This rule does not match; continue to the next rule. |
| `{ match: false }` | This rule does not match; other fields in the object are ignored. |
| `true` | This rule matches and uses the rule or global default fallback. |
| `{ match?, model?, rewrites?, fallback? }` | This rule matches and uses the dynamic decision in the object. |

A dynamic decision object supports:

| Field | Type | Description |
| --- | --- | --- |
| `match` | `boolean` | Only `false` is special and means no match. |
| `model` | `string` | Target model selector; it must identify a currently configured CCR model. |
| `rewrites` | `Rewrite[]` | Request rewrites, limited to 32 and applied in array order. |
| `fallback` | `Fallback` | Override the rule or global default fallback behavior. |

A string, number, or array is not a valid routing result. Unknown object fields do not participate in routing.

##### Rewrite Shape

```js
{
  key: "request.body.temperature",
  operation: "set",
  value: 0.2
}
```

`key` must start with `request.body.`, `request.header.`, or `request.headers.`. Body paths use dot-separated segments, and numeric segments address array indexes. Header names are converted to lowercase. Header rewrites should use only `set` or `delete`, and a header `set` value must be a string.

| `operation` | Required fields | Behavior |
| --- | --- | --- |
| `set` | `value` | Set or create a field. This is the default when `operation` is omitted. |
| `delete` | None | Delete a field or array index. |
| `array-append` | `value` | Add an element to the end; start from an empty array when the current value is not an array. |
| `array-prepend` | `value` | Add an element to the beginning. |
| `array-remove` | `value` | Remove array elements that match `value`. |
| `array-replace` | `match`, `value` | Replace array elements that match `match` with `value`. |

Rewrite `value` and `match` properties must be JSON values. Unsafe path segments such as `__proto__`, `constructor`, and `prototype` are rejected. Scripts cannot rewrite authentication, cookie, host, content-length, connection-control, `x-auth-*`, `x-ccr-*`, and other protected headers.

##### Fallback Shape

```js
{
  mode: "model-chain",
  models: ["Provider/backup-one", "Provider/backup-two"],
  retryCount: 0
}
```

| `mode` | Behavior |
| --- | --- |
| `off` | Attempt only the selected model. |
| `retry` | Retry the selected model `retryCount` times after the first failure. |
| `model-chain` | Try models in `models` order after the selected model fails. |

`mode` is required. `models` is optional and defaults to `[]`; every entry must be a configured model selector. `retryCount` is optional and defaults to `0`; it must be an integer from 0 to 9999.

#### Complete Example: Tenant Policy, Rollout, And Rewrites

The following `enterprise-route.js` reads a tenant header, obtains policy from a local JSON file and an optional remote service, uses the session ID for stable rollout bucketing, and returns a model, request rewrites, and a fallback model chain:

```js
const rawTenant = input.headers["x-tenant-id"];
const tenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;

// Let later rules handle requests without tenant information.
if (!tenant) {
  return null;
}

// Local file example: { "enterprise": { "model": "Provider/primary" } }
const policyFile = api.env("CCR_ROUTING_POLICY_FILE")
  ?? "~/.config/ccr/routing-policy.json";
let policy = {};
if (await api.fs.exists(policyFile)) {
  const policies = await api.fs.readJson(policyFile);
  policy = policies?.[tenant] ?? {};
}

// If a policy service is configured, its result overrides local policy.
const policyUrl = api.env("CCR_ROUTING_POLICY_URL");
if (policyUrl) {
  const response = await api.fetch(policyUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${api.env("CCR_ROUTING_POLICY_TOKEN") ?? ""}`
    },
    body: JSON.stringify({
      tenant,
      model: input.model,
      sessionId: input.sessionId,
      tokenCount: input.tokenCount,
      lastUserText: input.summary.lastUserText
    })
  });

  if (!response.ok) {
    throw new Error(`Policy service returned HTTP ${response.status}`);
  }
  policy = { ...policy, ...JSON.parse(response.body) };
}

if (!policy.model || policy.enabled === false) {
  return { match: false };
}

// The same session maps to the same 0-99 bucket.
const bucketKey = input.sessionId ?? `${tenant}:${input.summary.lastUserText}`;
const bucket = api.hash(bucketKey) % 100;
const rolloutPercent = Number(policy.rolloutPercent ?? 100);
if (bucket >= rolloutPercent) {
  return null;
}

return {
  model: policy.model,
  rewrites: [
    {
      key: "request.body.temperature",
      operation: "set",
      value: Number(policy.temperature ?? 0.2)
    },
    {
      key: "request.header.x-route-policy",
      operation: "set",
      value: `tenant:${tenant}`
    }
  ],
  fallback: {
    mode: "model-chain",
    models: Array.isArray(policy.fallbackModels)
      ? policy.fallbackModels
      : ["Provider/backup-model"],
    retryCount: 0
  }
};
```

The example's `policy.model` and `policy.fallbackModels` values must identify models already configured in CCR. Otherwise, the rule emits a diagnostic and is treated as a non-match.

#### Saved Configuration And Runtime Limits

The saved rule has the following shape. It is normally generated by the UI and does not need to be edited manually:

```json
{
  "id": "enterprise-policy",
  "name": "Enterprise tenant policy",
  "enabled": true,
  "type": "script",
  "script": {
    "apiVersion": 1,
    "file": "/Users/example/.config/ccr/enterprise-route.js",
    "language": "javascript",
    "timeoutMs": 2000
  }
}
```

| Limit | Current value |
| --- | --- |
| Script file | 64 KiB maximum |
| Execution timeout | 10-30000 ms; 2000 ms by default |
| Fetch request / response body | 256 KiB / 1 MiB |
| Individual file read or write | 1 MiB |
| Directory listing | 256 entries maximum |
| Dynamic rewrites | 32 maximum |
| Script result | 64 KiB maximum and JSON-serializable |

Workers enforce heap, stack, pending-queue, and hard-timeout resource limits. Three failures for the same rule within 60 seconds open its circuit breaker for 30 seconds. A changed script file is recompiled and treated as a new script version for circuit-breaker accounting.

Worker isolation is not an operating-system security sandbox. `api.fetch`, `api.fs`, and `api.env` have no allowlist and inherit the network, file, and environment access available to the CCR process. Run trusted scripts only.

Legacy inline `source` continues to run. Selecting a script file for the rule and saving it migrates the rule to the local `file` shape above. Legacy `readPaths`, `permissions`, and static script-rule `rewrites` are no longer needed; return `model` or `rewrites` from the script when a request must be changed.

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

Before moving to the next attempt, CCR waits for every fallback-triggering failure, including network errors. It honors a positive `Retry-After` header when the upstream provides one; otherwise it uses exponential backoff starting at 1 second and capped at 30 seconds per attempt.

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
