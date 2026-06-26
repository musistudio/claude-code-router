---
title: Logs & Observability
pageTitle: Logs & Observability
eyebrow: Quick Start
lead: Enable request logs and Agent observability in settings, inspect request details, and analyze the agent execution trace and performance.
---

## Enable The Switches

Open **Settings → Logs & Observability**:

1. Enable **Request logs**.
2. Enable **Agent observability**.

## View The Observability Panel

The observability panel is for inspecting an agent's execution trace and performance: when each step happened, which tool it called, what result the tool returned, how long it took, whether it failed, and how the following steps continued.

It helps diagnose stuck agents, unexpected tool results, slow steps, or context flow that does not match expectations. Request logs provide request bodies, response bodies, and error details for individual model requests.

## Request Logs

Request logs record model request details passing through CCR, including request time, request ID, client, path, requested model, final provider and model, credential, status code, duration, tokens, cost estimate, request body, response body, and errors.

The Logs page supports filtering by status, provider, model, credential, request ID, model name, request body, or response body. A single record shows the main request and response fields, including `request model`, `resolved provider`, `resolved model`, status code, response body, errors, duration, tokens, and cost estimate.

Regular request logs are kept locally for the current day. When the local date changes, the next request-log read or write cleans up the previous day's regular logs; they are useful for same-day troubleshooting, not long-term audit archiving.
