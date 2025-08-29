import { executionGuard } from '../utils/ExecutionGuard';
import { info, warn, error } from '../utils/log';
import { trackKeyUsage } from '../routes/api-keys';

/**
 * Gemini Rate Limit Middleware
 * 
 * This middleware ensures that all requests to the Gemini provider are properly
 * rate-limited and queued to prevent 429 errors.
 */

// Store the original fetch function
let originalFetch: typeof fetch | null = null;

/**
 * Initialize Gemini rate limiting
 * This should be called during application startup
 */
export function initializeGeminiRateLimit() {
  info('[GeminiRateLimit] Initializing Gemini rate limiting middleware');
  
  // Store original fetch if not already stored
  if (!originalFetch) {
    originalFetch = globalThis.fetch;
  }
  
  // Override the global fetch function with our rate-limited version
  globalThis.fetch = async function (...args: Parameters<typeof fetch>) {
    const [url, options] = args;
    
    // Check if this is a Gemini API request
    const urlString = typeof url === 'string' ? url : url?.toString() || '';
    const isGeminiRequest = urlString.includes('generativelanguage.googleapis.com') || 
                           urlString.includes('googleapis.com/generateContent') ||
                           urlString.includes('googleapis.com/streamGenerateContent');
    
    if (isGeminiRequest) {
      info(`[GeminiRateLimit] Intercepting Gemini request to: ${urlString}`);
      
      try {
        // Use ExecutionGuard to queue and rate-limit this request
        return await executionGuard.execute(
          async ({ apiKey }) => {
            const startTime = Date.now();
            let usedApiKey = apiKey;
            
            try {
              // If we have a rotated API key, use it
              let finalOptions = options;
              if (apiKey) {
                info(`[GeminiRateLimit] Using rotated API key for request`);
                const headers = new Headers(options?.headers || {});
                headers.set('x-goog-api-key', apiKey);
                // Remove Authorization header to avoid conflicts
                headers.delete('Authorization');
                finalOptions = { ...options, headers };
              }
              
              // Make the actual request (ExecutionGuard handles delays and queuing)
              const response = await originalFetch!(url, finalOptions);
              
              // Track successful usage
              if (usedApiKey) {
                const responseTime = Date.now() - startTime;
                trackKeyUsage(usedApiKey, response.ok, responseTime);
              }
              
              return response;
            } catch (err) {
              // Track failed usage
              if (usedApiKey) {
                const responseTime = Date.now() - startTime;
                trackKeyUsage(usedApiKey, false, responseTime);
              }
              throw err;
            }
          },
          {
            req: { url: urlString, method: options?.method || 'GET', body: options?.body },
            providerName: 'gemini',
            skipDeduplication: false,
            skipQueue: false
          }
        );
      } catch (err) {
        error(`[GeminiRateLimit] Error processing Gemini request: ${err}`);
        throw err;
      }
    }
    
    // For non-Gemini requests, proceed normally
    return await originalFetch!(url, options);
  };
  
  info('[GeminiRateLimit] Gemini rate limiting middleware initialized');
}

/**
 * Configure specific rate limiting for Gemini
 * @param config Configuration options for rate limiting
 */
export function configureGeminiRateLimit(config: {
  minDelayMs?: number;
  maxRetries?: number;
  maxQueueSize?: number;
  apiKeyRotation?: boolean;
  apiKeys?: string[];
}) {
  info(`[GeminiRateLimit] Configuring Gemini rate limiting: ${JSON.stringify(config)}`);
  
  // Update ExecutionGuard configuration
  executionGuard.updateConfig({
    queue: {
      enabled: true,
      minDelayMs: config.minDelayMs || 5000, // Default to 5 seconds between requests
      maxQueueSize: config.maxQueueSize || 50
    },
    retry: {
      enabled: true,
      maxRetries: config.maxRetries || 3,
      initialBackoffMs: 1000,
      maxBackoffMs: 30000,
      jitterMs: 500,
      retryableStatusCodes: [429, 500, 502, 503, 504]
    },
    keyManagement: config.apiKeyRotation && config.apiKeys?.length ? {
      enabled: true,
      providers: {
        'gemini': {
          keys: config.apiKeys,
          strategy: 'round-robin',
          fallbackBehavior: 'fail'
        }
      }
    } : {
      enabled: false,
      providers: {}
    }
  });
  
  info('[GeminiRateLimit] Gemini rate limiting configuration updated');
}

/**
 * Restore original fetch function
 * This should be called during application shutdown
 */
export function restoreOriginalFetch() {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    info('[GeminiRateLimit] Restored original fetch function');
  }
}

/**
 * Get current rate limiting statistics
 */
export function getGeminiRateLimitStats() {
  return executionGuard.getStats();
}