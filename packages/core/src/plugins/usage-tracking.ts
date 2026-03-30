import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { CCRPlugin, CCRPluginOptions } from './types';
import {
  appendAsync,
  query,
  count,
  aggregate,
  cleanup,
  getProviders,
  getModels,
  getAvailableDateRange,
  getDailyTotals,
  getHourlyAggregation,
  getPerformanceMetrics,
  isLLMApiPath,
  type UsageRecord,
  type UsageQuery,
  type CleanupOptions,
} from '@CCR/shared';
import { SSEParserTransform } from '../utils/sse';

/**
 * Usage tracking plugin options
 */
interface UsageTrackingOptions extends CCRPluginOptions {
  /**
   * Number of days to keep usage records
   * Default: 90
   */
  retentionDays?: number;
}

/**
 * Usage tracking plugin
 * Captures token usage from LLM API responses and provides statistics API
 */
export const usageTrackingPlugin: CCRPlugin = {
  name: 'usage-tracking',
  version: '1.0.0',
  description: 'Token usage tracking and statistics',

  register: fp(async (fastify: FastifyInstance, options: UsageTrackingOptions) => {
    const retentionDays = options.retentionDays || 90;

    // Register onSend hook for usage persistence
    fastify.addHook('onSend', async (request, _reply, payload) => {
      const req = request as any;

      // Only process requests with sessionId and known API paths
      if (!req.sessionId) {
        return payload;
      }

      // Support multiple API path patterns
      const pathname = req.pathname || '';
      if (!isLLMApiPath(pathname)) {
        fastify.log?.debug(`Skipping usage tracking for unknown path: ${pathname}`);
        return payload;
      }

      // Handle streaming responses
      if (payload instanceof ReadableStream) {
        const [originalStream, statsStream] = payload.tee();

        // Process stream in background to extract usage
        processStreamUsage(statsStream, req, fastify).catch(err => {
          fastify.log?.error({ err }, 'Failed to process stream usage');
        });

        return originalStream;
      }

      // Handle non-streaming responses
      if (payload && typeof payload === 'object') {
        const responsePayload = payload as Record<string, any>;
        let usage: any = null;
        let success = true;
        let errorMessage: string | undefined;

        // Check for errors
        if (responsePayload.error) {
          success = false;
          errorMessage = responsePayload.error.message || 'Unknown error';
        }

        usage = responsePayload.usage;

        if (usage) {
          await persistUsageRecord(req, usage, false, success, errorMessage, fastify.log);
        }
      }

      return payload;
    });

    // Register API routes
    await registerUsageRoutes(fastify, retentionDays);

    fastify.log?.info('Usage tracking plugin registered');
  }),
};

/**
 * Process streaming response to extract usage data
 */
async function processStreamUsage(
  stream: ReadableStream,
  req: any,
  fastify: FastifyInstance
): Promise<void> {
  const reader = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new SSEParserTransform())
    .getReader();

  let usage: any = null;
  let success = true;
  let errorMessage: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Extract usage from message_delta event
      if (value.event === 'message_delta' && value.data?.usage) {
        usage = value.data.usage;
      }

      // Check for errors
      if (value.event === 'error' || value.data?.error) {
        success = false;
        errorMessage = value.data?.error?.message || 'Stream error';
      }
    }

    if (usage) {
      await persistUsageRecord(req, usage, true, success, errorMessage, fastify.log);
    }
  } catch (err: any) {
    // Handle premature stream closure gracefully
    if (err.name === 'AbortError' || err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      fastify.log?.debug('Stream closed prematurely while processing usage');
    } else {
      fastify.log?.error({ err }, 'Error processing stream usage');
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Persist a usage record to storage
 */
async function persistUsageRecord(
  req: any,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    reasoning_tokens?: number;
  },
  isStreaming: boolean,
  success: boolean,
  errorMessage: string | undefined,
  log: any
): Promise<void> {
  if (!usage) return;

  try {
    const now = new Date();

    // Get performance metrics from token-speed plugin via request object
    let duration: number | undefined;
    let timeToFirstToken: number | undefined;

    // Stats are saved to request object by token-speed plugin before stream ends
    const tokenStats = req.tokenSpeedStats;
    if (tokenStats) {
      duration = Math.round(tokenStats.lastTokenTime - tokenStats.startTime);
      timeToFirstToken = tokenStats.timeToFirstToken;
    } else {
      // Fallback: token-speed plugin may not be enabled
      log?.debug('Token-speed stats not available, performance metrics will be incomplete');
      // Use request start time as fallback if available
      const startTime = req.requestStartTime;
      if (startTime) {
        duration = Math.round(Date.now() - startTime);
      }
    }

    // Normalize model field to string (handle both array and string formats)
    let normalizedModel: string;
    if (Array.isArray(req.model)) {
      normalizedModel = req.model.join(', ');
    } else {
      normalizedModel = req.model || 'unknown';
    }

    const record: Omit<UsageRecord, 'id'> = {
      timestamp: now.toISOString(),
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      sessionId: req.sessionId,
      requestId: req.id || `req-${Date.now()}`,
      provider: req.provider || 'unknown',
      model: normalizedModel,
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens,
      cacheReadInputTokens: usage.cache_read_input_tokens,
      reasoningTokens: usage.reasoning_tokens,
      stream: isStreaming,
      success,
      errorMessage,
      duration,
      timeToFirstToken,
    };

    await appendAsync(record);
  } catch (err) {
    log?.error({ err }, 'Failed to persist usage');
  }
}

/**
 * Register usage API routes
 */
async function registerUsageRoutes(
  fastify: FastifyInstance,
  retentionDays: number
): Promise<void> {
  // Maximum limit for pagination to prevent memory exhaustion attacks
  const MAX_LIMIT = 1000;

  /**
   * Safely parse integer from query parameter with optional max limit
   * Returns defaultValue if parsing fails or value is not a pure integer string
   */
  const parseSafeInt = (value: any, defaultValue: number, maxValue?: number): number => {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    // Check if it's a valid integer string (no trailing non-numeric chars)
    if (!/^-?\d+$/.test(String(value))) {
      fastify.log?.warn(`Invalid integer parameter: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    const num = Number(value);
    if (isNaN(num)) {
      fastify.log?.warn(`NaN result for parameter: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    // Apply max limit if specified
    if (maxValue !== undefined) {
      return Math.min(Math.max(1, num), maxValue);
    }
    return num;
  };
  // GET /api/usage - Get usage records with pagination
  fastify.get('/api/usage', async (req, reply) => {
    try {
      const queryObj: UsageQuery = {
        startDate: (req.query as any).startDate,
        endDate: (req.query as any).endDate,
        provider: (req.query as any).provider,
        model: (req.query as any).model,
        limit: parseSafeInt((req.query as any).limit, 100, MAX_LIMIT),
        offset: parseSafeInt((req.query as any).offset, 0),
      };

      const records = query(queryObj);
      const total = count(queryObj);

      return {
        records,
        pagination: {
          total,
          limit: queryObj.limit,
          offset: queryObj.offset,
          hasMore: (queryObj.offset || 0) + records.length < total,
        },
      };
    } catch (error: any) {
      fastify.log?.error({ err: error }, 'Failed to get usage records');
      reply.status(500).send({ error: error.message || 'Failed to get usage records' });
    }
  });

  // GET /api/usage/summary - Get usage summary (aggregated statistics)
  fastify.get('/api/usage/summary', async (req, reply) => {
    try {
      const queryObj: UsageQuery = {
        startDate: (req.query as any).startDate,
        endDate: (req.query as any).endDate,
        provider: (req.query as any).provider,
        model: (req.query as any).model,
        groupBy: (req.query as any).groupBy as UsageQuery['groupBy'],
      };

      const result = aggregate(queryObj);
      return result;
    } catch (error: any) {
      fastify.log?.error({ err: error }, 'Failed to get usage summary');
      reply.status(500).send({ error: error.message || 'Failed to get usage summary' });
    }
  });

  // GET /api/usage/daily - Get daily totals for trend charts
  fastify.get('/api/usage/daily', async (req, reply) => {
    try {
      const { startDate, endDate } = req.query as any;

      if (!startDate || !endDate) {
        reply.status(400).send({ error: 'startDate and endDate are required' });
        return;
      }

      const dailyTotals = getDailyTotals(startDate, endDate);
      return { data: dailyTotals };
    } catch (error: any) {
      fastify.log?.error({ err: error }, 'Failed to get daily totals');
      reply.status(500).send({ error: error.message || 'Failed to get daily totals' });
    }
  });

  // GET /api/usage/hourly - Get hourly aggregation for time-of-day analysis
  fastify.get('/api/usage/hourly', async (req, reply) => {
    try {
      const { startDate, endDate, provider, model } = req.query as any;

      if (!startDate || !endDate) {
        reply.status(400).send({ error: 'startDate and endDate are required' });
        return;
      }

      const hourlyData = getHourlyAggregation(startDate, endDate, provider, model);
      return { data: hourlyData };
    } catch (error: any) {
      fastify.log?.error({ err: error }, 'Failed to get hourly aggregation');
      reply.status(500).send({ error: error.message || 'Failed to get hourly aggregation' });
    }
  });

  // GET /api/usage/performance - Get performance metrics time series for charting
  fastify.get('/api/usage/performance', async (req, reply) => {
    try {
      const { startDate, endDate, groupBy, provider, model } = req.query as any;

      if (!startDate || !endDate) {
        reply.status(400).send({ error: 'startDate and endDate are required' });
        return;
      }

      const metrics = getPerformanceMetrics(
        startDate,
        endDate,
        groupBy || 'day',
        provider,
        model
      );
      return { data: metrics };
    } catch (error: any) {
      fastify.log?.error({ err: error }, 'Failed to get performance metrics');
      reply.status(500).send({ error: error.message || 'Failed to get performance metrics' });
    }
  });

  // GET /api/usage/filters - Get available providers and models
  fastify.get('/api/usage/filters', async (req, reply) => {
    try {
      const { startDate, endDate } = req.query as any;

      const providers = getProviders(startDate, endDate);
      const models = getModels(startDate, endDate);
      const dateRange = getAvailableDateRange();

      return {
        providers,
        models,
        dateRange,
      };
    } catch (error: any) {
      fastify.log?.error({ err: error }, 'Failed to get usage filters');
      reply.status(500).send({ error: error.message || 'Failed to get usage filters' });
    }
  });

  // GET /api/usage/export - Export usage data
  fastify.get('/api/usage/export', async (req, reply) => {
    try {
      const format = (req.query as any).format || 'json';
      const queryObj: UsageQuery = {
        startDate: (req.query as any).startDate,
        endDate: (req.query as any).endDate,
        provider: (req.query as any).provider,
        model: (req.query as any).model,
      };

      const records = query(queryObj);

      if (format === 'csv') {
        const headers = [
          'id', 'timestamp', 'date', 'sessionId', 'requestId',
          'provider', 'model', 'inputTokens', 'outputTokens',
          'cacheCreationInputTokens', 'cacheReadInputTokens', 'reasoningTokens',
          'stream', 'success', 'errorMessage', 'duration', 'timeToFirstToken'
        ];

        const csvLines = [
          headers.join(','),
          ...records.map(r => headers.map(h => {
            const val = (r as any)[h];
            if (val === undefined || val === null) return '';
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
          }).join(','))
        ];

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename="usage-export.csv"');
        return csvLines.join('\n');
      } else {
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', 'attachment; filename="usage-export.json"');
        return JSON.stringify(records, null, 2);
      }
    } catch (error: any) {
      fastify.log?.error({ err: error }, 'Failed to export usage');
      reply.status(500).send({ error: error.message || 'Failed to export usage' });
    }
  });

  // DELETE /api/usage/cleanup - Cleanup old usage data
  fastify.delete('/api/usage/cleanup', async (req, reply) => {
    try {
      const options: CleanupOptions = {
        beforeDate: (req.query as any).beforeDate,
        retentionDays: parseSafeInt((req.query as any).retentionDays, retentionDays),
        dryRun: (req.query as any).dryRun === 'true',
      };

      const result = cleanup(options);
      return {
        success: true,
        ...result,
        dryRun: options.dryRun,
      };
    } catch (error: any) {
      fastify.log?.error({ err: error }, 'Failed to cleanup usage');
      reply.status(500).send({ error: error.message || 'Failed to cleanup usage' });
    }
  });
}