import fp from 'fastify-plugin';
import { CCRPlugin, CCRPluginOptions } from './types';
import { SSEParserTransform } from '../utils/sse';
import { OutputHandlerConfig, OutputOptions, outputManager } from './output';
import { ITokenizer, TokenizerConfig } from '../types/tokenizer';

/**
 * Token statistics interface
 */
interface TokenStats {
  requestId: string;
  sessionId?: string;
  startTime: number;
  firstTokenTime?: number;
  lastTokenTime: number;
  tokenCount: number;
  tokensPerSecond: number;
  timeToFirstToken?: number;
  stream: boolean; // Whether this is a streaming request
  tokenTimestamps: number[]; // Store timestamps of each token for per-second calculation
}

/**
 * Plugin options
 */
interface TokenSpeedOptions extends CCRPluginOptions {
  /**
   * Reporter type(s) to use for output
   * Can be a single type or an array of types: 'console' | 'temp-file' | 'webhook'
   * Default: ['console', 'temp-file']
   */
  reporter?: string | string[];

  /**
   * Output handler configurations
   * Supports console, webhook, and other output handlers
   */
  outputHandlers?: OutputHandlerConfig[];

  /**
   * Default output options (format, prefix, etc.)
   */
  outputOptions?: OutputOptions;
}

// Store request-level statistics
const requestStats = new Map<string, TokenStats>();

// Cache tokenizers by provider and model to avoid repeated initialization
const tokenizerCache = new Map<string, ITokenizer>();

/**
 * Token speed measurement plugin
 */
export const tokenSpeedPlugin: CCRPlugin = {
  name: 'token-speed',
  version: '1.0.0',
  description: 'Statistics for streaming response token generation speed',

  // Use fp() to break encapsulation and apply hooks globally
  register: fp(async (fastify, options: TokenSpeedOptions) => {
    const opts = {
      reporter: ['console', 'temp-file'],
      ...options
    };

    // Normalize reporter to array
    const reporters = Array.isArray(opts.reporter) ? opts.reporter : [opts.reporter];

    // Initialize output handlers based on reporters if not explicitly configured
    if (opts.outputHandlers && opts.outputHandlers.length > 0) {
      outputManager.registerHandlers(opts.outputHandlers);
    } else {
      // Auto-register handlers based on reporter types
      const handlersToRegister: OutputHandlerConfig[] = [];

      for (const reporter of reporters) {
        if (reporter === 'console') {
          handlersToRegister.push({
            type: 'console',
            enabled: true,
            config: {
              colors: true,
              level: 'log'
            }
          });
        } else if (reporter === 'temp-file') {
          handlersToRegister.push({
            type: 'temp-file',
            enabled: true,
            config: {
              subdirectory: 'claude-code-router',
              extension: 'json',
              includeTimestamp: true,
              prefix: 'session'
            }
          });
        } else if (reporter === 'webhook') {
          // Webhook requires explicit config, skip auto-registration
          console.warn(`[TokenSpeedPlugin] Webhook reporter requires explicit configuration in outputHandlers`);
        }
      }

      if (handlersToRegister.length > 0) {
        outputManager.registerHandlers(handlersToRegister);
      }
    }

    // Set default output options
    if (opts.outputOptions) {
      outputManager.setDefaultOptions(opts.outputOptions);
    }

    /**
     * Get or create tokenizer for a specific provider and model
     */
    const getTokenizerForRequest = async (request: any): Promise<ITokenizer | null> => {
      const tokenizerService = (fastify as any).tokenizerService;
      if (!tokenizerService) {
        fastify.log?.warn('TokenizerService not available');
        return null;
      }

      // Extract provider and model from request
      // Format: "provider,model" or just "model"
      if (!request.provider || !request.model) {
        return null;
      }
      const providerName = request.provider;
      const modelName = request.model;

      // Create cache key
      const cacheKey = `${providerName}:${modelName}`;

      // Check cache first
      if (tokenizerCache.has(cacheKey)) {
        return tokenizerCache.get(cacheKey)!;
      }

      // Get tokenizer config for this model
      const tokenizerConfig = tokenizerService.getTokenizerConfigForModel(providerName, modelName);

      if (!tokenizerConfig) {
        // No specific config, use fallback
        fastify.log?.debug(`No tokenizer config for ${providerName}:${modelName}, using fallback`);
        return null;
      }

      try {
        // Create and cache tokenizer
        const tokenizer = await tokenizerService.getTokenizer(tokenizerConfig);
        tokenizerCache.set(cacheKey, tokenizer);
        fastify.log?.info(`Created tokenizer for ${providerName}:${modelName} - ${tokenizer.name}`);
        return tokenizer;
      } catch (error: any) {
        fastify.log?.warn(`Failed to create tokenizer for ${providerName}:${modelName}: ${error.message}`);
        return null;
      }
    };

    // Add onRequest hook to capture actual request start time (before processing)
    fastify.addHook('onRequest', async (request) => {
      const url = new URL(`http://127.0.0.1${request.url}`);
      if (!url.pathname.endsWith("/v1/messages")) return;
      (request as any).requestStartTime = performance.now();
    });

    // Add onSend hook to intercept both streaming and non-streaming responses
    fastify.addHook('onSend', async (request, _reply, payload) => {
      const startTime = (request as any).requestStartTime;
      if (!startTime) return;
      const requestId = (request as any).id || Date.now().toString();

      // Extract session ID from request body metadata
      let sessionId: string | undefined;
      try {
        const userId = (request.body as any)?.metadata?.user_id;
        if (userId && typeof userId === 'string') {
          const match = userId.match(/_session_([a-f0-9-]+)/i);
          sessionId = match ? match[1] : undefined;
        }
      } catch (error) {
      }
      if (!sessionId) return;

      // Get tokenizer for this specific request
      const tokenizer = await getTokenizerForRequest(request);

      // Handle streaming responses
      if (payload instanceof ReadableStream) {
        // Mark this request as streaming
        requestStats.set(requestId, {
          requestId,
          sessionId,
          startTime,
          lastTokenTime: startTime,
          tokenCount: 0,
          tokensPerSecond: 0,
          tokenTimestamps: [],
          stream: true
        });

        // Tee the stream: one for stats, one for the client
        const [originalStream, statsStream] = payload.tee();

        // Process stats in background
        const processStats = async () => {
          let outputTimer: NodeJS.Timeout | null = null;

          // Output stats function - calculate current speed using sliding window
          const doOutput = async (isFinal: boolean) => {
            const stats = requestStats.get(requestId);
            if (!stats) return;

            const now = performance.now();

            if (!isFinal) {
              // For streaming output, use sliding window: count tokens in last 1 second
              const oneSecondAgo = now - 1000;
              stats.tokenTimestamps = stats.tokenTimestamps.filter(ts => ts > oneSecondAgo);
              stats.tokensPerSecond = stats.tokenTimestamps.length;
            } else {
              // For final output, use average speed over entire request
              const duration = (stats.lastTokenTime - stats.startTime) / 1000; // seconds
              if (duration > 0) {
                stats.tokensPerSecond = Math.round(stats.tokenCount / duration);
              }
            }

            await outputStats(stats, reporters, opts.outputOptions, isFinal).catch(err => {
              fastify.log?.warn(`Failed to output streaming stats: ${err.message}`);
            });
          };

          try {
            // Decode byte stream to text, then parse SSE events
            const eventStream = statsStream
              .pipeThrough(new TextDecoderStream())
              .pipeThrough(new SSEParserTransform());
            const reader = eventStream.getReader();

            // Start timer immediately - output every 1 second
            outputTimer = setInterval(async () => {
              const stats = requestStats.get(requestId);
              if (stats) {
                await doOutput(false);
              }
            }, 1000);

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const data = value;
              const stats = requestStats.get(requestId);
              if (!stats) continue;

              const now = performance.now();

              // Record first token time when we receive any content-related event
              // This includes: content_block_start, content_block_delta, text_block
              if (!stats.firstTokenTime && (
                data.event === 'content_block_start' ||
                data.event === 'content_block_delta' ||
                data.event === 'text_block' ||
                data.event === 'content_block'
              )) {
                stats.firstTokenTime = now;
                stats.timeToFirstToken = Math.round(now - stats.startTime);
              }

              // Detect content_block_delta event (incremental tokens)
              // Support multiple delta types: text_delta, input_json_delta, thinking_delta
              if (data.event === 'content_block_delta' && data.data?.delta) {
                const deltaType = data.data.delta.type;
                let text = '';

                // Extract text based on delta type
                if (deltaType === 'text_delta') {
                  text = data.data.delta.text || '';
                } else if (deltaType === 'input_json_delta') {
                  text = data.data.delta.partial_json || '';
                } else if (deltaType === 'thinking_delta') {
                  text = data.data.delta.thinking || '';
                }

                // Calculate tokens if we have text content
                if (text) {
                  const tokenCount = tokenizer
                    ? (tokenizer.encodeText ? tokenizer.encodeText(text).length : estimateTokens(text))
                    : estimateTokens(text);

                  stats.tokenCount += tokenCount;
                  stats.lastTokenTime = now;

                  // Record timestamps for each token (for sliding window calculation)
                  for (let i = 0; i < tokenCount; i++) {
                    stats.tokenTimestamps.push(now);
                  }
                }
              }

              // Output final statistics when message ends
              if (data.event === 'message_stop') {
                // Clear timer
                if (outputTimer) {
                  clearInterval(outputTimer);
                  outputTimer = null;
                }

                await doOutput(true);

                requestStats.delete(requestId);
              }
            }
          } catch (error: any) {
            // Clean up timer on error
            if (outputTimer) {
              clearInterval(outputTimer);
            }
            if (error.name !== 'AbortError' && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
              fastify.log?.warn(`Error processing token stats: ${error.message}`);
            }
          }
        };

        // Start background processing without blocking
        processStats().catch((error) => {
          console.log(error);
          fastify.log?.warn(`Background stats processing failed: ${error.message}`);
        });

        // Return original stream to client
        return originalStream;
      }

      // Handle non-streaming responses
      // Try to extract token count from the response payload
      const endTime = performance.now();
      let tokenCount = 0;

      // Payload should be a string or object for non-streaming responses
      if (payload && typeof payload === 'string') {
        try {
          const response = JSON.parse(payload);

          // Prefer usage.output_tokens if available (most accurate)
          if (response.usage?.output_tokens) {
            tokenCount = response.usage.output_tokens;
          } else {
            // Fallback: calculate from content
            const content = response.content || response.message?.content || '';

            if (tokenizer) {
              if (Array.isArray(content)) {
                tokenCount = content.reduce((sum: number, block: any) => {
                  if (block.type === 'text') {
                    const text = block.text || '';
                    return sum + (tokenizer.encodeText ? tokenizer.encodeText(text).length : estimateTokens(text));
                  }
                  return sum;
                }, 0);
              } else if (typeof content === 'string') {
                tokenCount = tokenizer.encodeText ? tokenizer.encodeText(content).length : estimateTokens(content);
              }
            } else {
              const text = Array.isArray(content) ? content.map((c: any) => c.text).join('') : content;
              tokenCount = estimateTokens(text);
            }
          }
        } catch (error) {
          // Could not parse or extract tokens
        }
      }

      // Only output stats if we found tokens
      if (tokenCount > 0) {
        const duration = (endTime - startTime) / 1000; // seconds

        const stats: TokenStats = {
          requestId,
          sessionId,
          startTime,
          lastTokenTime: endTime,
          tokenCount,
          tokensPerSecond: duration > 0 ? Math.round(tokenCount / duration) : 0,
          timeToFirstToken: Math.round(endTime - startTime),
          stream: false,
          tokenTimestamps: []
        };

        await outputStats(stats, reporters, opts.outputOptions, true);
      }

      // Return payload as-is
      return payload;
    });
  }),
};

/**
 * Estimate token count (fallback method)
 */
function estimateTokens(text: string): number {
  // Rough estimation: English ~4 chars/token, Chinese ~1.5 chars/token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * Output single request statistics
 */
async function outputStats(
  stats: TokenStats,
  reporters: string[],
  options?: OutputOptions,
  isFinal = false
) {
  const prefix = isFinal ? '[Token Speed Final]' : '[Token Speed]';

  const logData = {
    requestId: stats.requestId.substring(0, 8),
    sessionId: stats.sessionId,
    stream: stats.stream,
    tokenCount: stats.tokenCount,
    tokensPerSecond: stats.tokensPerSecond,
    timeToFirstToken: stats.timeToFirstToken ? `${stats.timeToFirstToken}ms` : 'N/A',
    duration: `${((stats.lastTokenTime - stats.startTime) / 1000).toFixed(2)}s`,
    timestamp: Date.now()
  };

  const outputOptions = {
    prefix,
    metadata: {
      sessionId: stats.sessionId
    },
    ...options
  };

  // Output to each specified reporter type
  for (const reporter of reporters) {
    try {
      await outputManager.outputToType(reporter, logData, outputOptions);
    } catch (error) {
      console.error(`[TokenSpeedPlugin] Failed to output to ${reporter}:`, error);
    }
  }
}
