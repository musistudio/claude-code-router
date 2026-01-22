# Custom Router Lifecycle Hooks

## Overview

Custom routers can now implement lifecycle hooks to track request execution and manage stateful resources like concurrency limits. This allows for advanced scenarios like queueing, rate limiting, and detailed logging directly within your routing logic.

## Basic Usage

### Function-Based Router (Backward Compatible)

Existing function-based routers continue to work without any changes.

```javascript
// old-router.js
module.exports = async function(req, config) {
  // Simple routing logic
  if (req.body.messages.some(m => m.content.includes('image'))) {
    return 'anthropic,claude-3-haiku-20240307';
  }
  return 'anthropic,claude-3-sonnet-20240229';
}
```

### Object-Based Router with Hooks

For lifecycle tracking, export an object with a `route` method and optional hook functions.

```javascript
// new-router-with-hooks.js
module.exports = {
  route: async (req, config) => {
    // Make routing decision
    return 'zai,glm-4.7';
  },

  onRequestStart: (routeKey) => {
    console.log(`Request started for provider: ${routeKey}`);
  },

  onRequestComplete: (routeKey) => {
    console.log(`Request successfully completed for: ${routeKey}`);
  },

  onRequestError: (routeKey, error) => {
    console.error(`Request failed for ${routeKey}:`, error);
  }
};
```

## Advanced: Queue Management with `canAcquireSlot`

The `canAcquireSlot` hook enables powerful concurrency management. If it returns `false`, the router will be asked for a `failover` route.

Here is a practical example for a provider that only allows one concurrent request.

```javascript
// stateful-queue-router.js
let activeRequests = 0;
const MAX_CONCURRENT = 1;
const queue = [];
const QUEUE_TIMEOUT = 10000; // 10 seconds

module.exports = {
  route: (req, config) => {
    if (config.failover) {
      console.log('[Router] Failover activated, routing to Gemini Flash');
      return 'gemini,gemini-flash-latest'; // Failover provider
    }
    return 'zai,glm-4.7'; // Primary provider with concurrency limit
  },

  canAcquireSlot: async (routeKey) => {
    // This logic only applies to the 'zai' provider
    if (!routeKey.startsWith('zai,')) {
      return true;
    }

    if (activeRequests < MAX_CONCURRENT) {
      console.log('[Router] Slot available for Z.ai, proceeding.');
      return true; // Slot available
    }

    console.log(`[Router] Z.ai is busy (Active: ${activeRequests}). Queuing request.`);

    // Wait in queue for a free slot
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const idx = queue.findIndex(item => item.resolve === resolve);
        if (idx > -1) queue.splice(idx, 1);
        console.warn(`[Router] Request for Z.ai timed out. Triggering failover.`);
        resolve(false); // Timeout - trigger failover
      }, QUEUE_TIMEOUT);

      queue.push({ resolve, timeout });
    });
  },

  onRequestStart: (routeKey) => {
    if (routeKey.startsWith('zai,')) {
      activeRequests++;
      console.log(`[Router] onRequestStart. Active Z.ai requests: ${activeRequests}`);
    }
  },

  onRequestComplete: (routeKey) => {
    if (routeKey.startsWith('zai,')) {
      activeRequests--;
      console.log(`[Router] onRequestComplete. Active Z.ai requests: ${activeRequests}`);
      // A slot is free, process the next item in the queue
      if (queue.length > 0) {
        const next = queue.shift();
        clearTimeout(next.timeout);
        console.log('[Router] Granting slot to next in queue.');
        next.resolve(true);
      }
    }
  },

  onRequestError: (routeKey, error) => {
    if (routeKey.startsWith('zai,')) {
      activeRequests--;
      console.error(`[Router] onRequestError: ${error.message}. Active Z.ai requests: ${activeRequests}`);
      // Also process next item on failure
      if (queue.length > 0) {
        const next = queue.shift();
        clearTimeout(next.timeout);
        console.log('[Router] Granting slot to next in queue after error.');
        next.resolve(true);
      }
    }
  }
};
```

## Hook Execution Order

The hooks are called in a specific order during the request lifecycle:

1.  `route(req, config)`: Called first to determine the initial provider and model (`routeKey`).
2.  `canAcquireSlot(routeKey)`: If implemented, called immediately after `route`.
    *   If it returns `false`, `route(req, { ...config, failover: true })` is called again to get a fallback provider. The new `routeKey` is then used for the request.
3.  `onRequestStart(routeKey)`: Called just before the request is sent to the provider.
4.  The request stream is processed.
5.  `onRequestComplete(routeKey)` OR `onRequestError(routeKey, error)`: One of these is called when the request is finished.
    *   `onRequestComplete` is called when the response stream ends successfully.
    *   `onRequestError` is called if there is an execution error, if the stream emits an error, or if the client disconnects mid-request.
