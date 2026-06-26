---
title: Logs & Observability
pageTitle: Logs & Observability
eyebrow: Detailed Configuration
lead: Configure Request logs and Agent observability to inspect request details, execution traces, tool calls, tool results, and performance.
---

## How To Enable

Open **Settings → Logs & Observability**:

1. Enable **Request logs** to record same-day CCR request details.
2. Enable **Agent observability** to populate the observability panel with agent execution traces.

## View The Observability Panel

Enable **Agent observability** when you need to inspect an agent's execution trace and performance. The panel shows which step called which tool, what result the tool returned, how long each step took, and where an agent may have stalled or failed.

It helps diagnose agents getting stuck, unexpected tool results, slow steps, or context flow that does not match expectations. Request logs provide the request body, response body, and error details for individual model requests.

## Request Logs

Request logs record model request details passing through CCR, including request time, request ID, client, path, requested model, resolved provider and model, credential, status code, success state, duration, tokens, cost estimate, request headers, request body, response headers, response body, and errors.

The Logs page supports filtering by status, provider, model, credential, request ID, model name, request body, or response body. A single record shows the main request and response fields, including `request model`, `resolved provider`, `resolved model`, status code, response body, errors, duration, tokens, and cost estimate.

Regular request logs are kept locally for the current day. When the local date changes, the next request-log read or write cleans up the previous day's regular logs. They are useful for same-day troubleshooting, not long-term audit archiving.
