import { info, error, warn } from './log';

// --- Configurare ---
const GLOBAL_REQUEST_DELAY_MS = 200; // Max 5 cereri/secundă
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;
const JITTER_MS = 500;

let lastRequestTimestamp = 0;
const originalFetch = global.fetch;

async function throttledAndRetriedFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  // --- Pasul 1: Throttling (Frânare) ---
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTimestamp;
  if (timeSinceLastRequest < GLOBAL_REQUEST_DELAY_MS) {
    const waitTime = GLOBAL_REQUEST_DELAY_MS - timeSinceLastRequest;
    await new Promise<void>(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTimestamp = Date.now();

  // --- Pasul 2: Retry cu Exponential Backoff ---
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await originalFetch(url, options);

      if (!response.ok) {
        const error: any = new Error(`Request failed with status ${response.status}`);
        error.response = response;
        error.status = response.status;
        throw error;
      }

      return response; // Succes!

    } catch (err: any) {
      attempt++;
      const status = err.status || err.response?.status;
      const retryableStatusCodes = [429, 500, 502, 503, 504];

      if (attempt >= MAX_RETRIES || !retryableStatusCodes.includes(status)) {
        error(`[FetchInterceptor] Final attempt failed or error not retryable (Status: ${status}). Error: ${err.message}`);
        throw err; // Aruncă eroarea finală
      }

      const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      const jitter = Math.random() * JITTER_MS;
      const waitTime = Math.round(backoffTime + jitter);

      warn(`[FetchInterceptor] Attempt ${attempt}/${MAX_RETRIES} failed with status ${status}. Retrying in ${waitTime}ms...`);
      await new Promise<void>(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Fetch interceptor failed after max retries.');
}

export function applyFetchInterceptor() {
  if (global.fetch === originalFetch) {
    global.fetch = throttledAndRetriedFetch;
  } else {
    // Fetch seems to be already patched. Skipping.
  }
}
