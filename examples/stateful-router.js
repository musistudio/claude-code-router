// examples/stateful-router.js
let zaiActive = 0;
const zaiQueue = [];
const MAX_CONCURRENT = 1;
const QUEUE_TIMEOUT = 10000; // 10 seconds

module.exports = {
  route(req, config) {
    if (config.failover) {
      // If the primary provider fails or times out, use a reliable fallback
      console.log('[Router] Failover activated, routing to Gemini Flash');
      return 'gemini,gemini-flash-latest';
    }
    // Default to the provider that needs concurrency control
    return 'zai,glm-4.7';
  },

  async canAcquireSlot(routeKey) {
    // This logic only applies to the 'zai' provider
    if (!routeKey.startsWith('zai,')) {
      return true;
    }

    if (zaiActive < MAX_CONCURRENT) {
      console.log('[Router] Slot available for Z.ai, proceeding.');
      return true; // Slot is available, request can proceed immediately
    }

    console.log(`[Router] Z.ai is busy (Active: ${zaiActive}). Queuing request.`);

    // Slot is not available, wait in a queue for a free slot
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Remove resolver from queue to prevent memory leaks
        const idx = zaiQueue.indexOf(resolve);
        if (idx > -1) {
          zaiQueue.splice(idx, 1);
        }
        console.warn(`[Router] Request for Z.ai timed out after ${QUEUE_TIMEOUT / 1000}s. Triggering failover.`);
        resolve(false); // Timeout reached, trigger failover logic
      }, QUEUE_TIMEOUT);

      // Add a function to the queue that will be called when a slot is free
      const queueResolver = (canProceed) => {
        clearTimeout(timeout);
        resolve(canProceed);
      };

      zaiQueue.push(queueResolver);
    });
  },

  onRequestStart(routeKey) {
    if (routeKey.startsWith('zai,')) {
      zaiActive++;
      console.log(`[Router] onRequestStart: Z.ai request started. Active requests: ${zaiActive}`);
    }
  },

  onRequestComplete(routeKey) {
    if (routeKey.startsWith('zai,')) {
      zaiActive--;
      console.log(`[Router] onRequestComplete: Z.ai request completed. Active requests: ${zaiActive}`);
      // A slot is now free, process the next item in the queue if any
      if (zaiQueue.length > 0) {
        const nextInQueue = zaiQueue.shift();
        if (nextInQueue) {
          console.log('[Router] Granting slot to next in queue.');
          nextInQueue(true); // Signal that the waiting request can now proceed
        }
      }
    }
  },

  onRequestError(routeKey, error) {
    if (routeKey.startsWith('zai,')) {
      zaiActive--;
      console.error(`[Router] onRequestError: Z.ai request failed: ${error.message}. Active requests: ${zaiActive}`);
      // Also process the next item in the queue on failure
      if (zaiQueue.length > 0) {
        const nextInQueue = zaiQueue.shift();
        if (nextInQueue) {
          console.log('[Router] Granting slot to next in queue after error.');
          nextInQueue(true);
        }
      }
    }
  }
};
