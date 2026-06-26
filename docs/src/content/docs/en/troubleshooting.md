---
title: Claude Code Router Q&A
pageTitle: Q&A
eyebrow: Q&A
lead: Start here when an agent does not go through CCR, a provider fails, routing picks the wrong model, Fusion fails, or Bot messages do not arrive.
---

## Q&A

### Q: The agent does not go through CCR. Where is the relevant information?

A: Service status, agent launch method, Agent Config application status, and effect scope all affect whether the agent goes through CCR.

### Q: What if a request hits the wrong model?

A: Request logs show `request model`, `resolved provider`, and `resolved model`. The Routing Config page contains default routing, rule order, match conditions, and fallback.

### Q: Why does a provider return 401 or 403?

A: Related fields include API Key, credential enabled state, Base URL, protocol, and extra request headers. The provider page provides model connectivity checks.

### Q: How do I diagnose `model not found`?

A: The provider model list, the model selected by routing, and the model in Agent Config can all affect `model not found`.

### Q: What if Fusion does not call a tool?

A: Related information includes Fusion tool enabled state, Vision model or search-service key, MCP Discover tools, and timeout settings.

### Q: What information is related to request timeout?

A: Request logs record duration and error information. Upstream latency, Fusion tool duration, and timeout settings can also affect timeout behavior.

### Q: How do I locate a sudden cost increase?

A: Request logs support filtering by model, provider, or credential, and show token composition, request-body size, and the final model used.

### Q: What if a specific key keeps failing?

A: Request logs support filtering by credential. A credential's quota, permission, and provider-side account state can all affect whether a single key is usable.

### Q: How do I diagnose a Bot not receiving messages?

A: Related information includes the Bot switch, message-forwarding settings, platform token, callback configuration, and whether the agent was opened from CCR.

### Q: What if the observability panel has no agent execution trace?

A: Open **Settings → Logs & Observability** and confirm **Request logs** and **Agent observability** are enabled, then start a new agent task. The observability panel records steps, tool calls, tool results, and duration during new agent execution.
