# Bug Analysis: `Cannot read properties of undefined (reading 'input_tokens')`

## Overview

This document records the root cause analysis for the recurring error:

```
Cannot read properties of undefined (reading 'input_tokens')
```

The error is caused by two bugs in the session usage cache logic that prevent `input_tokens` from ever being correctly stored.

---

## Background: Session Usage Cache

The router uses a LRU cache (`sessionUsageCache`) to track the token usage of each session. This enables **long-context routing** — if the previous request's `input_tokens` exceeded `longContextThreshold`, the next request is routed to a long-context model.

```ts
// packages/core/src/utils/router.ts
const lastUsage = sessionUsageCache.get(req.sessionId);
const lastUsageThreshold =
  lastUsage &&
  lastUsage.input_tokens > longContextThreshold &&
  tokenCount > 20000;
```

For this to work correctly, `sessionUsageCache` must store a `Usage` object with both `input_tokens` and `output_tokens`.

---

## Bug #1 — Non-Streaming Responses: `payload` is a String

**File**: `packages/server/src/index.ts`, line 408

**Code**:
```ts
sessionUsageCache.put(req.sessionId, payload.usage);
```

**Problem**: In Fastify's `onSend` hook, for non-streaming responses `payload` is a **serialized JSON string**, not a JavaScript object. Accessing `.usage` on a string returns `undefined`. This means the usage cache always stores `undefined` for all non-streaming responses.

**Evidence**: The `token-speed.ts` plugin (same `onSend` hook, same `payload`) correctly handles this:
```ts
// packages/core/src/plugins/token-speed.ts:342-350
if (payload && typeof payload === 'string') {
  const response = JSON.parse(payload);
  if (response.usage?.output_tokens) { ... }
}
```

**Fix**: Parse `payload` as JSON before accessing `.usage`:
```ts
// Non-streaming path
if (typeof payload === 'string') {
  try {
    const parsed = JSON.parse(payload);
    sessionUsageCache.put(req.sessionId, parsed.usage);
  } catch {}
} else if (typeof payload === 'object' && payload?.usage) {
  sessionUsageCache.put(req.sessionId, payload.usage);
}
```

---

## Bug #2 — Streaming Responses: Only `output_tokens` is Captured

**File**: `packages/server/src/index.ts`, lines 385–393

**Code**:
```ts
const dataStr = new TextDecoder().decode(value);
if (!dataStr.startsWith("event: message_delta")) {
  continue;
}
const str = dataStr.slice(27);  // magic number
try {
  const message = JSON.parse(str);
  sessionUsageCache.put(req.sessionId, message.usage);
} catch {}
```

**Two problems**:

### 2a. Native Anthropic `message_delta` does not contain `input_tokens`

The Anthropic SSE protocol distributes `usage` across two events:

| Event | `usage` contents |
|---|---|
| `message_start` | `{ input_tokens: X, output_tokens: 0 }` |
| `message_delta` | `{ output_tokens: Y }` — no `input_tokens` |

The code only captures `message_delta`, so `message.usage = { output_tokens: Y }`. Storing this in the cache means `lastUsage.input_tokens` is `undefined` for all native Anthropic streaming responses.

### 2b. Fragile magic-number slice

`dataStr.slice(27)` assumes exactly one newline between the event line and data line. Actual SSE format:
```
event: message_delta\ndata: {...}\n\n
```
The string `"event: message_delta\n"` is 21 characters, and `"data: "` is 6 characters, giving offset 27. However, any variation in whitespace or chunk boundaries silently breaks the JSON parse (caught and discarded by the empty `catch {}`).

**Fix**: Capture `input_tokens` from `message_start` instead (or in addition), and use robust SSE parsing:
```ts
if (dataStr.includes("event: message_start")) {
  const dataLine = dataStr.split('\n').find(l => l.startsWith('data: '));
  if (dataLine) {
    try {
      const message = JSON.parse(dataLine.slice(6));
      // message_start contains full usage: {input_tokens, output_tokens}
      if (message.message?.usage) {
        sessionUsageCache.put(req.sessionId, message.message.usage);
      }
    } catch {}
  }
}
```

---

## Downstream Effect: Long-Context Routing Silently Broken

Because of Bugs #1 and #2, the `sessionUsageCache` either stores `undefined` or `{ output_tokens: Y }` (missing `input_tokens`). The router guard:

```ts
const lastUsageThreshold =
  lastUsage &&                                    // truthy even for {output_tokens: Y}
  lastUsage.input_tokens > longContextThreshold && // undefined > 60000 = false
  tokenCount > 20000;
```

- **Non-streaming**: `lastUsage` is `undefined` → guard short-circuits → `longContext` routing never triggered
- **Streaming (native Anthropic)**: `lastUsage = {output_tokens: Y}` is truthy → `undefined > threshold` → `false` → `longContext` routing never triggered
- **Streaming (OpenAI transformer)**: The transformer enriches `message_delta.usage` with `input_tokens`, so this path works correctly

The `longContext` routing feature is effectively dead for all non-OpenAI-transformer scenarios.

---

## Potential Crash: Vertex AI Unguarded `usage` Access

**File**: `packages/core/src/utils/vertex-claude.util.ts`, lines 277–282

```ts
usage: {
  completion_tokens: jsonResponse.usage.output_tokens,  // line 278
  prompt_tokens: jsonResponse.usage.input_tokens,        // line 279
  total_tokens: jsonResponse.usage.input_tokens + jsonResponse.usage.output_tokens,
},
```

If `jsonResponse.usage` is `undefined` (e.g., unexpected Vertex AI response format), this throws:

```
Cannot read properties of undefined (reading 'output_tokens')
```

Note: the error mentions `'output_tokens'` (line 278), not `'input_tokens'` (line 279), because line 278 is evaluated first. If someone reports `'input_tokens'`, this path is NOT the source — the error must originate elsewhere.

**Fix**: Add optional chaining:
```ts
usage: {
  completion_tokens: jsonResponse.usage?.output_tokens,
  prompt_tokens: jsonResponse.usage?.input_tokens,
  total_tokens: (jsonResponse.usage?.input_tokens ?? 0) + (jsonResponse.usage?.output_tokens ?? 0),
},
```

---

## Summary

| # | File | Line | Bug | Impact |
|---|---|---|---|---|
| 1 | `packages/server/src/index.ts` | 408 | `payload.usage` on JSON string → always `undefined` | Usage never cached for non-streaming responses |
| 2a | `packages/server/src/index.ts` | 386–392 | Only `message_delta` captured; no `input_tokens` in Anthropic `message_delta` | `input_tokens` never cached for native Anthropic streaming |
| 2b | `packages/server/src/index.ts` | 389 | Magic-number `slice(27)` is fragile | Silent parse failures on any whitespace variation |
| 3 | `packages/core/src/utils/vertex-claude.util.ts` | 278–281 | Unguarded `jsonResponse.usage` access | Crash for Vertex AI users if `usage` is absent |

**To locate the exact throw site**: check `~/.claude-code-router/logs/ccr-*.log` for the full stack trace.
