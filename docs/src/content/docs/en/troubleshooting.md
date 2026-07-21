---
title: Claude Code Router Q&A
pageTitle: Q&A
eyebrow: Q&A
lead: Start here when an agent bypasses CCR, a provider returns an error, routing hits the wrong model, Fusion does not call tools, or the Bot stops receiving messages. Issues are grouped by symptom; each answer gives the conclusion first, then the checks to run.
---

## Q&A

### Agent setup and observability

#### Q: The agent does not go through CCR. Where do I check?

A: Four things decide whether requests pass through CCR: service status, how the agent was launched, whether the Agent Config is applied, and its scope. If any of them is wrong, requests bypass CCR. Check in order:

1. Confirm the CCR service is running.
2. Confirm the agent was launched from CCR, not opened directly.
3. On the Agent Config page, confirm the config is applied and its scope covers the current project.

#### Q: The Observability page shows no agent execution trace.

A: The observability switches are off. Open **Settings → Logs & Observability**, enable **Request logs** and **Agent observability**, then start a new agent task. The Observability page only records tasks that run after the switches are on: steps, tool calls, tool results, and duration.

### Connection and authentication errors

#### Q: A provider returns 401 or 403.

A: This is a credential problem, not a routing problem. Check in order:

1. The API Key is correct and the credential is enabled.
2. The Base URL and protocol match what the provider requires.
3. Any extra request headers the provider needs.

Then verify with the model connectivity check on the provider page.

#### Q: Requests fail with `model not found`.

A: The model name routing resolved is not in the provider's model list. A model name appears in three places: the provider model list, the model selected in the routing config, and the model in the Agent Config. Compare all three and fix the one that does not match.

#### Q: One key keeps failing.

A: Filter the request logs by credential first to confirm the failures concentrate on that key. If they do, the problem is the key itself: check its quota, permissions, and account state in the provider's console instead of changing the CCR config.

#### Q: Requests time out.

A: Start with the duration and error in the request logs to see which stage timed out. Upstream latency, Fusion tool execution time, and timeout settings can all cause timeouts. If the time goes to tool calls, raise the corresponding timeout.

### Routing and cost

#### Q: A request hits the wrong model.

A: Compare `request model`, `resolved provider`, and `resolved model` in the request logs to see where routing sent the request. Then check rule order, match conditions, and the fallback rule on the Routing Config page — rules match in order, so a wrong order or condition sends requests to the wrong model.

#### Q: Costs spiked suddenly.

A: Locate it in the request logs instead of guessing. Filter by model, provider, or credential, and look at token composition, request-body size, and the final model used to find which requests account for the increase.

### Fusion and tool calls

#### Q: Fusion does not call any tool.

A: Usually one link in the tool chain is not configured. Check in order:

1. Fusion tools are enabled.
2. The Vision model or search-service key is set.
3. MCP Discover tools returns tools.
4. The timeout is not too short.

### Bot and messages

#### Q: The Bot does not receive messages.

A: Any broken link in the message chain shows up as no messages. Check in order: the Bot switch, message-forwarding settings, platform token, callback configuration, and whether the agent was opened from CCR.
