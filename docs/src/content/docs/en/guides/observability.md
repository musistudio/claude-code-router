---
title: Enable logging and observability
pageTitle: Enable logging and observability
eyebrow: Quick start
lead: "The first-run verification path after connecting CCR: enable request logs and Agent observability in Settings, send one request, then confirm the trace appears in the request logs and on the Observability page."
---

## Enable logging and observability

Open **Settings → Logs & Observability**:

1. Enable **Request logs**.
2. Enable **Agent observability**.

## View the Observability page

The Observability page is for inspecting an agent's execution trace and performance: when each step happened, which tool it called, what result the tool returned, how long it took, whether it failed, and how the following steps continued.

It helps diagnose stuck agents, unexpected tool results, slow steps, or context flow that does not match expectations. Request logs provide request bodies, response bodies, and error details for individual model requests.

## Request logs

Request logs record model request details passing through CCR, including request time, request ID, client, path, requested model, final provider and model, credential, status code, duration, tokens, cost estimate, request body, response body, and errors.

The Logs page supports filtering by status, provider, model, credential, request ID, model name, request body, or response body. A single record shows the main request and response fields, including `request model`, `resolved provider`, `resolved model`, status code, response body, errors, duration, tokens, and cost estimate.

Regular request logs are kept locally for the current day. When the local date changes, the next request-log read or write cleans up the previous day's regular logs; they are useful for same-day troubleshooting, not long-term audit archiving.

See the [logs and observability configuration reference](../../configuration/observability/) for the full set of switches and page capabilities.
