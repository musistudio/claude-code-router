import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { RegisterProviderRequest, LLMProvider } from "@/types/llm";
import { sendUnifiedRequest } from "@/utils/request";
import { createApiError } from "./middleware";
import { version } from "../../package.json";
import { ConfigService } from "@/services/config";
import { ProviderService } from "@/services/provider";
import { TransformerService } from "@/services/transformer";
import { Transformer } from "@/types/transformer";
import { getCircuitBreaker, CircuitState } from "@/utils/circuit-breaker";
import { withRetry, getRetryConfig } from "@/utils/retry";
import { getMetrics, MODEL_COST_TABLE } from "@/utils/metrics";
import { getRateLimiter } from "@/utils/rate-limiter";
import { getIdempotencyGuard } from "@/utils/idempotency";
import { getBudgetManager } from "@/utils/budget";
import { getPermissionGuard } from "@/utils/permission-guard";
import { getMockServer } from "@/utils/mock-server";
import { getStructuredOutputProcessor } from "@/utils/structured-output";
import { getWsPush } from "@/utils/ws-push";
import { getTenantManager } from "@/utils/tenant-isolation";
import { getKeyRotator } from "@/utils/key-rotator";
import { getFeedbackStore } from "@/utils/feedback-store";
import { getAuditLogger } from "@/utils/audit-logger";
import { getQualityScorer } from "@/utils/quality-scorer";
import { getSlidingWindow } from "@/utils/sliding-window";
import { getDocLoader } from "@/utils/doc-loader";
import { getCascadeChain } from "@/utils/cascade-chain";
import { getTaskScheduler } from "@/utils/task-scheduler";
import { getMultimodalProcessor } from "@/utils/multimodal-processor";
import { getComplianceDisclaimer } from "@/utils/compliance-disclaimer";
import { getCacheReportAggregator } from "@/utils/cache-report";
import { getOllamaFallback } from "@/utils/ollama-fallback";
import { getProxyDiffTracker } from "@/utils/proxy-diff";
import { getCodeExtractor } from "@/utils/code-extractor";
import { getIntentRouter } from "@/utils/intent-router";
import { getEmbeddingService, EmbeddingService } from "@/utils/embedding";
import { getFinancialDataService } from "@/utils/financial-data";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const SETUP_CONFIG_DIR = join(homedir(), ".claude-code-router");
const SETUP_CONFIG_FILE = join(SETUP_CONFIG_DIR, "config.json");

// Extend FastifyInstance to include custom services
declare module "fastify" {
  interface FastifyInstance {
    configService: ConfigService;
    providerService: ProviderService;
    transformerService: TransformerService;
  }

  interface FastifyRequest {
    provider?: string;
  }
}

/**
 * Main handler for transformer endpoints
 * Coordinates the entire request processing flow: rate limit check, validate provider,
 * handle request transformers, send request, handle response transformers, format response
 */
async function handleTransformerEndpoint(
  req: FastifyRequest,
  reply: FastifyReply,
  fastify: FastifyInstance,
  transformer: any
) {
  const body = req.body as any;
  const providerName = req.provider!;
  const provider = fastify.providerService.getProvider(providerName);

  // Validate provider exists
  if (!provider) {
    throw createApiError(
      `Provider '${providerName}' not found`,
      404,
      "provider_not_found"
    );
  }

  // Rate limiting check
  const rateLimiter = getRateLimiter();
  const rateLimitResult = rateLimiter.check({
    ip: req.ip,
    apiKey: req.headers['x-api-key'] as string || req.headers['authorization'] as string,
    userId: req.headers['x-user-id'] as string,
    estimatedTokens: body.messages?.length ? body.messages.length * 100 : undefined,
  });
  if (!rateLimitResult.allowed) {
    const metrics = getMetrics(fastify.log);
    metrics.recordRateLimitHit();
    reply.header('Retry-After', Math.ceil((rateLimitResult.retryAfterMs || 60000) / 1000));

    // Push rate limit alert via WebSocket
    try {
      const wsPush = getWsPush();
      if (wsPush) {
        wsPush.broadcast('rate_limit_alert', {
          ip: req.ip,
          userId: req.headers['x-user-id'] as string,
          reason: rateLimitResult.reason,
          retryAfterMs: rateLimitResult.retryAfterMs,
        });
      }
    } catch {}

    throw createApiError(
      `Rate limit exceeded: ${rateLimitResult.reason}`,
      429,
      "rate_limit_exceeded"
    );
  }

  // Tenant-aware rate limiting
  const tenantManager = getTenantManager();
  if (tenantManager) {
    const tenantId = req.headers['x-tenant-id'] as string || req.headers['x-user-id'] as string;
    if (tenantId) {
      const tenantConfig = tenantManager.getTenantConfig(tenantId);
      if (tenantConfig) {
        // Check tenant-specific model allowlist
        if (tenantConfig.modelAllowlist && tenantConfig.modelAllowlist.length > 0) {
          const requestedModel = body.model || '';
          const allowed = tenantConfig.modelAllowlist.some((m: string) => requestedModel.includes(m));
          if (!allowed) {
            throw createApiError(
              `Model '${requestedModel}' not allowed for tenant '${tenantId}'`,
              403,
              "tenant_model_denied"
            );
          }
        }
      }
    }
  }

  // Budget check
  const budget = getBudgetManager();
  const budgetResult = budget.check({
    sessionId: (req as any).sessionId,
    userId: req.headers['x-user-id'] as string,
    provider: providerName,
  });
  if (!budgetResult.allowed) {
    reply.code(402);

    // Push budget alert via WebSocket
    try {
      const wsPush = getWsPush();
      if (wsPush) {
        wsPush.broadcast('budget_alert', {
          sessionId: (req as any).sessionId,
          userId: req.headers['x-user-id'] as string,
          provider: providerName,
          type: 'hard_limit_exceeded',
        });
      }
    } catch {}

    throw createApiError(
      `Budget limit exceeded`,
      402,
      "budget_exceeded"
    );
  }

  // Budget soft-limit warning (throttle)
  if (budgetResult.throttle) {
    try {
      const wsPush = getWsPush();
      if (wsPush) {
        wsPush.broadcast('budget_warning', {
          sessionId: (req as any).sessionId,
          userId: req.headers['x-user-id'] as string,
          provider: providerName,
          type: 'soft_limit_approaching',
        });
      }
    } catch {}
  }

  // Permission guard check (on request body content)
  const permGuard = getPermissionGuard();
  const bodyText = JSON.stringify(body.messages || '');
  const permResult = permGuard.check(bodyText);
  if (!permResult.allowed) {
    throw createApiError(
      `Request blocked by permission guard: ${permResult.violations.map(v => v.pattern).join(', ')}`,
      403,
      "permission_denied"
    );
  }

  // Idempotency check
  const idempotency = getIdempotencyGuard();
  const idempotencyResult = idempotency.check(body, req.headers as Record<string, string>);
  if (idempotencyResult.isDuplicate && idempotencyResult.cachedResponse) {
    fastify.log.info(`Idempotency: returning cached response for duplicate request`);
    return formatResponse(
      { ok: () => true, json: () => Promise.resolve(idempotencyResult.cachedResponse), status: 200, body: null } as any,
      reply,
      body
    );
  }

  // Mock server check
  const mockServer = getMockServer();
  if (mockServer.shouldMock(body)) {
    const mockResp = await mockServer.getResponse(body);
    if (mockResp) {
      if (mockResp.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, mockResp.delayMs));
      }
      fastify.log.info(`Mock: returning mock response`);
      reply.code(mockResp.statusCode);
      return mockResp.response;
    }
  }

  try {
    // Process request transformer chain
    const { requestBody, config, bypass } = await processRequestTransformers(
      body,
      provider,
      transformer,
      req.headers,
      {
        req,
      }
    );

    // Send request to LLM provider
    const response = await sendRequestToProvider(
      requestBody,
      config,
      provider,
      fastify,
      bypass,
      transformer,
      {
        req,
      }
    );

    // Process response transformer chain
    const finalResponse = await processResponseTransformers(
      requestBody,
      response,
      provider,
      transformer,
      bypass,
      {
        req,
      }
    );

    // Format and return response
    const orchestrator = (fastify as any)._server?.orchestrator;
    const finalResult = await formatResponse(finalResponse, reply, body, req, orchestrator);

    // Cache response for idempotency
    if (idempotencyResult.fingerprint) {
      try {
        const responseBody = typeof finalResult === 'object' ? finalResult : JSON.parse(finalResult);
        idempotency.storeResponse(idempotencyResult.fingerprint, responseBody, 200);
      } catch {}
    }

    // Record budget spending
    try {
      const responseBody = typeof finalResult === 'object' ? finalResult : JSON.parse(finalResult);
      const usage = responseBody?.usage;
      if (usage) {
        const model = body.model || 'unknown';
        const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
        const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
        const costTable = MODEL_COST_TABLE[model] || MODEL_COST_TABLE['_default'];
        const costUsd = (inputTokens * costTable.input + outputTokens * costTable.output) / 1_000_000;
        budget.record({
          costUsd,
          sessionId: (req as any).sessionId,
          userId: req.headers['x-user-id'] as string,
          provider: providerName,
          model,
        });
      }
    } catch {}

    return finalResult;
  } catch (error: any) {
    // Handle fallback if error occurs
    if (error.code === 'provider_response_error') {
      const fallbackResult = await handleFallback(req, reply, fastify, transformer, error);
      if (fallbackResult) {
        return fallbackResult;
      }
    }
    throw error;
  }
}

/**
 * Handle fallback logic when request fails
 * Tries each fallback model in sequence until one succeeds
 */
async function handleFallback(
  req: FastifyRequest,
  reply: FastifyReply,
  fastify: FastifyInstance,
  transformer: any,
  error: any
): Promise<any> {
  const scenarioType = (req as any).scenarioType || 'default';
  const fallbackConfig = fastify.configService.get<any>('fallback');

  if (!fallbackConfig || !fallbackConfig[scenarioType]) {
    return null;
  }

  const fallbackList = fallbackConfig[scenarioType] as string[];
  if (!Array.isArray(fallbackList) || fallbackList.length === 0) {
    return null;
  }

  req.log.warn(`Request failed for ${(req as any).scenarioType}, trying ${fallbackList.length} fallback models`);

  // Try each fallback model in sequence
  for (const fallbackModel of fallbackList) {
    try {
      req.log.info(`Trying fallback model: ${fallbackModel}`);

      // Update request with fallback model
      const newBody = structuredClone(req.body as any);
      const [fallbackProvider, ...fallbackModelName] = fallbackModel.split(',');
      newBody.model = fallbackModelName.join(',');

      // Create new request object with updated provider and body
      const newReq = {
        ...req,
        provider: fallbackProvider,
        body: newBody,
      };

      const provider = fastify.providerService.getProvider(fallbackProvider);
      if (!provider) {
        req.log.warn(`Fallback provider '${fallbackProvider}' not found, skipping`);
        continue;
      }

      // Process request transformer chain
      const { requestBody, config, bypass } = await processRequestTransformers(
        newBody,
        provider,
        transformer,
        req.headers,
        { req: newReq }
      );

      // Send request to LLM provider
      const response = await sendRequestToProvider(
        requestBody,
        config,
        provider,
        fastify,
        bypass,
        transformer,
        { req: newReq }
      );

      // Process response transformer chain
      const finalResponse = await processResponseTransformers(
        requestBody,
        response,
        provider,
        transformer,
        bypass,
        { req: newReq }
      );

      req.log.info(`Fallback model ${fallbackModel} succeeded`);

      // Format and return response
      const orchestrator = (fastify as any)._server?.orchestrator;
      return formatResponse(finalResponse, reply, newBody, req, orchestrator);
    } catch (fallbackError: any) {
      req.log.warn(`Fallback model ${fallbackModel} failed: ${fallbackError.message}`);
      continue;
    }
  }

  req.log.error(`All fallback models failed for ${scenarioType}`);
  return null;
}

/**
 * Process request transformer chain
 * Sequentially execute transformRequestOut, provider transformers, model-specific transformers
 * Returns processed request body, config, and flag indicating whether to skip transformers
 */
async function processRequestTransformers(
  body: any,
  provider: any,
  transformer: any,
  headers: any,
  context: any
) {
  let requestBody = body;
  let config: any = {};
  let bypass = false;

  // Check if transformers should be bypassed (passthrough mode)
  bypass = shouldBypassTransformers(provider, transformer, body);

  if (bypass) {
    if (headers instanceof Headers) {
      headers.delete("content-length");
    } else {
      delete headers["content-length"];
    }
    config.headers = headers;
  }

  // Execute transformer's transformRequestOut method
  if (!bypass && typeof transformer.transformRequestOut === "function") {
    const transformOut = await transformer.transformRequestOut(requestBody);
    if (transformOut.body) {
      requestBody = transformOut.body;
      config = transformOut.config || {};
    } else {
      requestBody = transformOut;
    }
  }

  // Execute provider-level transformers
  if (!bypass && provider.transformer?.use?.length) {
    for (const providerTransformer of provider.transformer.use) {
      if (
        !providerTransformer ||
        typeof providerTransformer.transformRequestIn !== "function"
      ) {
        continue;
      }
      const transformIn = await providerTransformer.transformRequestIn(
        requestBody,
        provider,
        context
      );
      if (transformIn.body) {
        requestBody = transformIn.body;
        config = { ...config, ...transformIn.config };
      } else {
        requestBody = transformIn;
      }
    }
  }

  // Execute model-specific transformers
  if (!bypass && provider.transformer?.[body.model]?.use?.length) {
    for (const modelTransformer of provider.transformer[body.model].use) {
      if (
        !modelTransformer ||
        typeof modelTransformer.transformRequestIn !== "function"
      ) {
        continue;
      }
      requestBody = await modelTransformer.transformRequestIn(
        requestBody,
        provider,
        context
      );
    }
  }

  return { requestBody, config, bypass };
}

/**
 * Determine if transformers should be bypassed (passthrough mode)
 * Skip other transformers when provider only uses one transformer and it matches the current one
 */
function shouldBypassTransformers(
  provider: any,
  transformer: any,
  body: any
): boolean {
  return (
    provider.transformer?.use?.length === 1 &&
    provider.transformer.use[0].name === transformer.name &&
    (!provider.transformer?.[body.model]?.use?.length ||
      (provider.transformer?.[body.model]?.use.length === 1 &&
        provider.transformer?.[body.model]?.use[0].name === transformer.name))
  );
}

/**
 * Send request to LLM provider
 * Handle authentication, build request config, send request and handle errors
 * Integrates: Circuit Breaker + Retry + Metrics
 */
async function sendRequestToProvider(
  requestBody: any,
  config: any,
  provider: any,
  fastify: FastifyInstance,
  bypass: boolean,
  transformer: any,
  context: any
) {
  const metrics = getMetrics(fastify.log);
  const providerName = provider.name;
  const startTime = Date.now();

  // Circuit breaker check
  const breaker = getCircuitBreaker(providerName, {}, fastify.log);
  if (!breaker.canExecute()) {
    metrics.recordCircuitOpen();
    throw createApiError(
      `Circuit breaker OPEN for provider '${providerName}' - temporarily unavailable`,
      503,
      "circuit_breaker_open"
    );
  }

  const url = config.url || new URL(provider.baseUrl);

  if (requestBody.stream === true && provider.name?.toLowerCase().includes('openai')) {
    requestBody.stream_options = { include_usage: true };
  }

  // Handle authentication in passthrough mode
  if (bypass && typeof transformer.auth === "function") {
    const auth = await transformer.auth(requestBody, provider);
    if (auth.body) {
      requestBody = auth.body;
      let headers = config.headers || {};
      if (auth.config?.headers) {
        headers = {
          ...headers,
          ...auth.config.headers,
        };
        delete headers.host;
        delete auth.config.headers;
      }
      config = {
        ...config,
        ...auth.config,
        headers,
      };
    } else {
      requestBody = auth;
    }
  }

  // Prepare headers
  const requestHeaders: Record<string, string> = {
    ...(config?.headers || {}),
  };
  
  // Use key rotator for API key selection (multi-key support)
  const keyRotator = getKeyRotator();
  let currentApiKey = provider.apiKey;
  try {
    const rotatedKey = keyRotator.getKey(providerName);
    if (rotatedKey) {
      currentApiKey = rotatedKey;
    }
  } catch {}

  // Only add Bearer authorization if not already set by transformer auth
  if (!requestHeaders["authorization"] && !requestHeaders["Authorization"] && !requestHeaders["x-api-key"]) {
    requestHeaders["Authorization"] = `Bearer ${currentApiKey}`;
  }

  for (const key in requestHeaders) {
    if (requestHeaders[key] === "undefined") {
      delete requestHeaders[key];
    } else if (
      ["authorization", "Authorization"].includes(key) &&
      requestHeaders[key]?.includes("undefined")
    ) {
      delete requestHeaders[key];
    }
  }

  // Execute with retry logic
  const retryConfig = getRetryConfig(fastify.configService);
  let retryCount = 0;

  const response = await withRetry(
    async () => {
      metrics.incrementActive();
      try {
        const res = await sendUnifiedRequest(
          url,
          requestBody,
          {
            httpsProxy: fastify.configService.getHttpsProxy(),
            ...config,
            headers: JSON.parse(JSON.stringify(requestHeaders)),
          },
          context,
          fastify.log
        );

        // Handle request errors
        if (!res.ok) {
          const errorText = await res.text();
          const error = createApiError(
            `Error from provider(${providerName},${requestBody.model}: ${res.status}): ${errorText}`,
            res.status,
            "provider_response_error"
          );
          (error as any).statusCode = res.status;
          throw error;
        }

        breaker.recordSuccess();
        // Report key success to rotator
        try {
          keyRotator.reportSuccess(providerName, currentApiKey);
        } catch {}
        return res;
      } catch (error: any) {
        const statusCode = error.statusCode || error.status || 0;
        breaker.recordFailure(statusCode, error.message);
        // Report key failure to rotator
        try {
          keyRotator.reportFailure(providerName, currentApiKey, error.message);
        } catch {}
        throw error;
      } finally {
        metrics.decrementActive();
      }
    },
    retryConfig,
    (ctx) => {
      retryCount = ctx.attempt;
      fastify.log.warn(
        `Retrying request to ${providerName} (attempt ${ctx.attempt}/${ctx.totalAttempts}), ` +
        `last error: ${ctx.lastError}, elapsed: ${ctx.totalElapsedMs}ms`
      );
    }
  );

  // Record metrics with token counts from response
  const latencyMs = Date.now() - startTime;
  const usage = (response as any)?.usage || {};
  metrics.recordRequest({
    provider: providerName,
    model: requestBody.model || 'unknown',
    statusCode: 200,
    latencyMs,
    inputTokens: usage.input_tokens || usage.prompt_tokens || 0,
    outputTokens: usage.output_tokens || usage.completion_tokens || 0,
    retryCount,
  });

  return response;
}

/**
 * Process response transformer chain
 * Sequentially execute provider transformers, model-specific transformers, transformer's transformResponseIn
 */
async function processResponseTransformers(
  requestBody: any,
  response: any,
  provider: any,
  transformer: any,
  bypass: boolean,
  context: any
) {
  let finalResponse = response;

  // Execute provider-level response transformers
  if (!bypass && provider.transformer?.use?.length) {
    for (const providerTransformer of Array.from(
      provider.transformer.use
    ).reverse() as Transformer[]) {
      if (
        !providerTransformer ||
        typeof providerTransformer.transformResponseOut !== "function"
      ) {
        continue;
      }
      finalResponse = await providerTransformer.transformResponseOut!(
        finalResponse,
        context
      );
      // Debug: log after provider transformer
      try {
        const clone = finalResponse.clone();
        const txt = await clone.text();
        const parsed = JSON.parse(txt);
        context.req?.log?.debug({ 
          stage: `after_provider_${providerTransformer.name}`,
          content: parsed?.choices?.[0]?.message?.content?.substring(0, 100)
        });
      } catch {}
    }
  }

  // Execute model-specific response transformers
  if (!bypass && provider.transformer?.[requestBody.model]?.use?.length) {
    for (const modelTransformer of Array.from(
      provider.transformer[requestBody.model].use
    ).reverse() as Transformer[]) {
      if (
        !modelTransformer ||
        typeof modelTransformer.transformResponseOut !== "function"
      ) {
        continue;
      }
      finalResponse = await modelTransformer.transformResponseOut!(
        finalResponse,
        context
      );
      // Debug: log after model transformer
      try {
        const clone = finalResponse.clone();
        const txt = await clone.text();
        const parsed = JSON.parse(txt);
        context.req?.log?.debug({ 
          stage: `after_model_${modelTransformer.name}`,
          content: parsed?.choices?.[0]?.message?.content?.substring(0, 100)
        });
      } catch {}
    }
  }

  // Execute transformer's transformResponseIn method
  if (!bypass && transformer.transformResponseIn) {
    finalResponse = await transformer.transformResponseIn(
      finalResponse,
      context
    );
    // Debug: log after main transformer
    try {
      const clone = finalResponse.clone();
      const txt = await clone.text();
      const parsed = JSON.parse(txt);
      context.req?.log?.debug({ 
        stage: `after_main_${transformer.name}`,
        contentTypes: parsed?.content?.map((c:any) => c.type),
        contentTexts: parsed?.content?.map((c:any) => c.text?.substring(0, 50)),
        stop_reason: parsed?.stop_reason,
      });
    } catch {}
  }

  return finalResponse;
}

/**
 * Format and return response
 * Handle HTTP status codes, format streaming and regular responses
 */
function parseSSEToMessage(fullPayload: string): any | null {
  const lines = fullPayload.split('\n');
  let finalMessage: any = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'message_start') {
          finalMessage = { ...parsed.message, content: [] };
        } else if (parsed.type === 'content_block_start' && finalMessage) {
          finalMessage.content.push(parsed.content_block);
        } else if (parsed.type === 'content_block_delta' && finalMessage?.content) {
          const block = finalMessage.content[parsed.index];
          if (block) {
            if (parsed.delta?.type === 'text_delta') block.text = (block.text || '') + parsed.delta.text;
            else if (parsed.delta?.type === 'thinking_delta') block.thinking = (block.thinking || '') + parsed.delta.thinking;
            else if (parsed.delta?.type === 'input_json_delta') block.input = (block.input || '') + parsed.delta.partial_json;
          }
        } else if (parsed.type === 'message_delta' && finalMessage) {
          Object.assign(finalMessage, parsed.delta);
          if (parsed.usage) finalMessage.usage = parsed.usage;
        }
      } catch {}
    }
  }
  return finalMessage;
}

function formatResponse(response: any, reply: FastifyReply, body: any, req?: any, orchestrator?: any) {
  // Set HTTP status code
  if (!response.ok) {
    reply.code(response.status);
  }

  // Handle streaming response
  const isStream = body.stream === true;
  if (isStream) {
    reply.header("Content-Type", "text/event-stream");
    reply.header("Cache-Control", "no-cache");
    reply.header("Connection", "keep-alive");

    if (req && orchestrator && response.body) {
      const originalStream = response.body;
      const collectedChunks: string[] = [];
      const decoder = new TextDecoder();

      const wrappedStream = new ReadableStream({
        start(controller) {
          const reader = originalStream.getReader();
          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  try {
                    const fullPayload = collectedChunks.join('');
                    const finalMessage = parseSSEToMessage(fullPayload);
                    if (finalMessage && !finalMessage.error) {
                      orchestrator.onPostResponse(req, finalMessage).catch(() => {});
                    }
                  } catch {}
                  controller.close();
                  return;
                }
                collectedChunks.push(decoder.decode(value, { stream: true }));
                controller.enqueue(value);
              }
            } catch (err) {
              controller.error(err);
            }
          };
          pump();
        }
      });
      return reply.send(wrappedStream);
    }

    return reply.send(response.body);
  } else {
    // Handle regular JSON response
    return response.json();
  }
}

export const registerApiRoutes = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('onRequest', async (req: any, reply: any) => {
    if (!req.url?.startsWith('/api/')) return;
    if (req.url === '/api/health') return;
    if (req.url === '/api/config' && req.method === 'GET') return;
    if (req.url === '/api/setup/status' && req.method === 'GET') return;
    if (req.url === '/api/setup' && req.method === 'POST') return;
    const configuredApiKey = fastify.configService?.get('APIKEY');
    if (!configuredApiKey) return;
    const providedKey = req.headers['x-api-key'] ||
                        (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);
    if (providedKey !== configuredApiKey) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Valid API key required' });
      return reply;
    }
  });

  // Health and info endpoints
  fastify.get("/", async () => {
    return { message: "LLMs API", version };
  });

  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  fastify.get("/api/setup/status", async () => {
    const providers = fastify.configService.get('Providers') || fastify.configService.get('providers') || [];
    return {
      needsSetup: providers.length === 0,
      hasProviders: providers.length > 0,
      providerCount: providers.length,
      apiKey: fastify.configService.get('APIKEY') || '',
    };
  });

  fastify.post("/api/setup", async (request: any, reply: any) => {
    try {
      const body = request.body;
      if (!body.providers || !Array.isArray(body.providers) || body.providers.length === 0) {
        return reply.code(400).send({ error: 'At least one provider is required' });
      }

      for (const p of body.providers) {
        if (!p.name || !p.api_base_url || !p.api_key) {
          return reply.code(400).send({ error: `Provider "${p.name || 'unnamed'}" missing required fields (name, api_base_url, api_key)` });
        }
      }

      const defaultProvider = body.providers[0];
      const defaultModel = defaultProvider.models?.[0] || '';
      const defaultRoute = defaultModel ? `${defaultProvider.name},${defaultModel}` : '';

      const config = {
        HOST: "127.0.0.1",
        PORT: 3456,
        APIKEY: "local-dev-key",
        LOG: true,
        LOG_LEVEL: "info",
        API_TIMEOUT_MS: 600000,
        Providers: body.providers.map((p: any) => ({
          name: p.name,
          api_base_url: p.api_base_url,
          api_key: p.api_key,
          models: p.models || [],
          ...(p.transformer ? { transformer: p.transformer } : {}),
          ...(p.priority ? { priority: p.priority } : {}),
          ...(p.cost_tier ? { cost_tier: p.cost_tier } : {}),
          ...(p.concurrency_limit ? { concurrency_limit: p.concurrency_limit } : {}),
        })),
        Router: body.router || {
          default: defaultRoute,
          background: defaultRoute,
          think: defaultRoute,
          longContext: defaultRoute,
          longContextThreshold: 60000,
          reasoningFlash: defaultRoute,
          reasoningProMax: defaultRoute,
        },
        ModelMapping: body.modelMapping || {},
        Concurrency: {
          global: 10,
          providers: body.providers.reduce((acc: any, p: any) => {
            acc[p.name] = p.concurrency_limit || 5;
            return acc;
          }, {}),
          queueTimeoutMs: 120000,
        },
        fallback: {},
      };

      await mkdir(SETUP_CONFIG_DIR, { recursive: true });
      await writeFile(SETUP_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

      return { success: true, message: 'Configuration saved. The service will reload automatically.' };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Prometheus metrics endpoint
  fastify.get("/metrics", async (req, reply) => {
    const metrics = getMetrics(fastify.log);
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return metrics.toPrometheus();
  });

  // JSON stats endpoint for dashboard
  fastify.get("/api/stats", async (req, reply) => {
    const metrics = getMetrics(fastify.log);
    return metrics.getStats();
  });

  // Circuit breaker status
  fastify.get("/api/circuit-breakers", async () => {
    const { getAllCircuitBreakers } = await import("@/utils/circuit-breaker");
    const breakers = getAllCircuitBreakers();
    const result: Record<string, any> = {};
    for (const [name, breaker] of breakers) {
      result[name] = breaker.getState();
    }
    return result;
  });

  // Rate limiter status
  fastify.get("/api/rate-limiter", async () => {
    const rateLimiter = getRateLimiter();
    return rateLimiter.getStats();
  });

  // Budget status
  fastify.get("/api/budget", async () => {
    const budget = getBudgetManager();
    return budget.getStatus();
  });

  // Mock server status
  fastify.get("/api/mock", async () => {
    const mock = getMockServer();
    return mock.getStats();
  });

  // Tenant manager status
  fastify.get("/api/tenants", async () => {
    const tenantManager = getTenantManager();
    if (!tenantManager) return { enabled: false };
    return tenantManager.getStats();
  });

  // WebSocket push status
  fastify.get("/api/ws-push", async () => {
    const wsPush = getWsPush();
    if (!wsPush) return { enabled: false };
    return wsPush.getStats();
  });

  // Redis cache status
  fastify.get("/api/redis-cache", async () => {
    try {
      const { getRedisCache } = await import("@musistudio/llms");
      const redisCache = getRedisCache();
      if (!redisCache) return { connected: false };
      return { connected: true, ...redisCache.getStats() };
    } catch {
      return { connected: false };
    }
  });

  // Key rotator status
  fastify.get("/api/key-rotator", async () => {
    const keyRotator = getKeyRotator();
    return keyRotator.getStats();
  });

  // Feedback API
  fastify.post("/api/feedback", async (req: any, reply: any) => {
    const feedbackStore = getFeedbackStore();
    const { sessionId, userId, provider, model, rating, comment, requestFingerprint, qualityScore } = req.body;
    if (!provider || !model || rating === undefined) {
      throw createApiError("provider, model, and rating are required", 400, "invalid_request");
    }
    const id = await feedbackStore.submit({
      sessionId, userId, provider, model, rating: Math.max(1, Math.min(5, rating)),
      comment, requestFingerprint, qualityScore,
    });
    return { success: true, id };
  });

  fastify.get("/api/feedback", async (req: any) => {
    const feedbackStore = getFeedbackStore();
    const { sessionId, userId, provider, model, minRating, limit } = req.query as any;
    return feedbackStore.query({ sessionId, userId, provider, model, minRating: minRating ? Number(minRating) : undefined, limit: limit ? Number(limit) : undefined });
  });

  fastify.get("/api/feedback/stats", async () => {
    const feedbackStore = getFeedbackStore();
    return feedbackStore.getStats();
  });

  // Audit log API
  fastify.get("/api/audit", async (req: any) => {
    const auditLogger = getAuditLogger();
    const { sessionId, userId, provider, model, from, to, limit } = req.query as any;
    return auditLogger.query({
      sessionId, userId, provider, model,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  });

  fastify.get("/api/audit/stats", async () => {
    const auditLogger = getAuditLogger();
    return auditLogger.getStats();
  });

  // Quality scorer status
  fastify.get("/api/quality-scorer", async () => {
    const scorer = getQualityScorer();
    return { enabled: true };
  });

  // Sliding window status
  fastify.get("/api/sliding-window", async () => {
    const sw = getSlidingWindow();
    return { enabled: true };
  });

  // Document loader status
  fastify.get("/api/doc-loader", async () => {
    const loader = getDocLoader();
    return { enabled: true };
  });

  // Cascade chain status
  fastify.get("/api/cascade-chain", async () => {
    const chain = getCascadeChain();
    return { enabled: true };
  });

  // Task scheduler status
  fastify.get("/api/task-scheduler", async () => {
    const scheduler = getTaskScheduler();
    return scheduler.getStats();
  });

  // Multimodal processor status
  fastify.get("/api/multimodal", async () => {
    const processor = getMultimodalProcessor();
    return { enabled: true };
  });

  // Cache report API
  fastify.get("/api/cache-report", async () => {
    const reportAgg = getCacheReportAggregator();
    const metrics = getMetrics(fastify.log);
    const stats = metrics.getStats();
    return reportAgg.generateReport({
      l1: { hits: stats.cache?.hits || 0, misses: stats.cache?.misses || 0, entries: stats.cache?.size || 0 },
      l2: { hits: stats.redis?.hits || 0, misses: stats.redis?.misses || 0, connected: !!stats.redis?.connected },
    });
  });

  fastify.get("/api/cache-report/cumulative", async () => {
    const reportAgg = getCacheReportAggregator();
    return reportAgg.getCumulativeStats();
  });

  // Proxy diff API
  fastify.get("/api/proxy-diff", async (req: any) => {
    const tracker = getProxyDiffTracker();
    const limit = Number((req.query as any)?.limit) || 20;
    return tracker.getRecentDiffs(limit);
  });

  fastify.get("/api/proxy-diff/:id", async (req: any) => {
    const tracker = getProxyDiffTracker();
    const diff = tracker.getDiff((req.params as any).id);
    if (!diff) throw createApiError("Diff not found", 404, "not_found");
    return diff;
  });

  fastify.get("/api/proxy-diff-stats", async () => {
    const tracker = getProxyDiffTracker();
    return tracker.getStats();
  });

  // Code extractor API
  fastify.post("/api/code-extract", async (req: any) => {
    const extractor = getCodeExtractor();
    const { text, firstOnly } = req.body;
    if (!text) throw createApiError("text is required", 400, "invalid_request");
    const results = extractor.extract(text);
    return { results, count: results.length };
  });

  // Intent router API
  fastify.post("/api/intent-classify", async (req: any) => {
    const intentRouter = getIntentRouter();
    const { query } = req.body;
    if (!query) throw createApiError("query is required", 400, "invalid_request");
    return await intentRouter.classify(query);
  });

  // Compliance disclaimer API
  fastify.get("/api/compliance", async () => {
    const disclaimer = getComplianceDisclaimer();
    return { enabled: true };
  });

  // Ollama fallback API
  fastify.get("/api/ollama-fallback", async () => {
    const fallback = getOllamaFallback();
    return { enabled: true };
  });

  // Comprehensive dashboard endpoint
  fastify.get("/api/dashboard", async () => {
    const metrics = getMetrics(fastify.log);
    const budget = getBudgetManager();
    const rateLimiter = getRateLimiter();
    const keyRotator = getKeyRotator();
    const feedbackStore = getFeedbackStore();
    const auditLogger = getAuditLogger();
    const cacheReportAgg = getCacheReportAggregator();
    const diffTracker = getProxyDiffTracker();

    const stats = metrics.getStats();
    const cacheReport = cacheReportAgg.generateReport({
      l1: { hits: stats.cache?.hits || 0, misses: stats.cache?.misses || 0, entries: stats.cache?.size || 0 },
      l2: { hits: stats.redis?.hits || 0, misses: stats.redis?.misses || 0, connected: !!stats.redis?.connected },
    });

    return {
      timestamp: new Date().toISOString(),
      metrics: stats,
      budget: budget.getStatus(),
      rateLimiter: rateLimiter.getStats(),
      keyRotator: keyRotator.getStats(),
      feedback: feedbackStore.getStats(),
      audit: auditLogger.getStats(),
      cacheReport: cacheReport.savings,
      proxyDiff: diffTracker.getStats(),
    };
  });

  // UNIFIED dashboard-full endpoint - all subsystems in one call
  fastify.get("/api/dashboard-full", async () => {
    const startTime = Date.now();
    const result: Record<string, any> = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    // 1. Metrics
    try {
      const metrics = getMetrics(fastify.log);
      result.metrics = metrics.getStats();
    } catch (e: any) {
      result.metrics = { error: e.message };
    }

    // 2. Budget
    try {
      const budget = getBudgetManager();
      result.budget = budget.getStatus();
    } catch (e: any) {
      result.budget = { error: e.message };
    }

    // 3. Circuit Breakers
    try {
      const { getAllCircuitBreakers } = await import("@/utils/circuit-breaker");
      const breakers = getAllCircuitBreakers();
      const cbResult: Record<string, any> = {};
      for (const [name, breaker] of breakers) {
        cbResult[name] = breaker.getState();
      }
      result.circuitBreakers = cbResult;
    } catch (e: any) {
      result.circuitBreakers = { error: e.message };
    }

    // 4. Rate Limiter
    try {
      const rateLimiter = getRateLimiter();
      result.rateLimiter = rateLimiter.getStats();
    } catch (e: any) {
      result.rateLimiter = { error: e.message };
    }

    // 5. Cache Report
    try {
      const cacheReportAgg = getCacheReportAggregator();
      const metrics = getMetrics(fastify.log);
      const stats = metrics.getStats();
      const report = cacheReportAgg.generateReport({
        l1: { hits: stats.cache?.hits || 0, misses: stats.cache?.misses || 0, entries: stats.cache?.size || 0 },
        l2: { hits: stats.redis?.hits || 0, misses: stats.redis?.misses || 0, connected: !!stats.redis?.connected },
      });
      result.cacheReport = {
        layers: report.layers,
        total: report.total,
        savings: report.savings,
      };
    } catch (e: any) {
      result.cacheReport = { error: e.message };
    }

    // 6. Quality Scorer
    try {
      const scorer = getQualityScorer();
      result.quality = { enabled: true };
    } catch (e: any) {
      result.quality = { error: e.message };
    }

    // 7. Providers (from health monitor)
    try {
      const orchestrator = (fastify as any)._server?.orchestrator;
      if (orchestrator?.healthMonitor) {
        result.providers = orchestrator.healthMonitor.getSummary();
      } else {
        const providers = fastify.providerService.getProviders();
        result.providers = providers.map((p: any) => ({
          name: p.name,
          enabled: p.enabled !== false,
          models: p.models?.length || 0,
        }));
      }
    } catch (e: any) {
      result.providers = { error: e.message };
    }

    // 8. Audit Logger
    try {
      const auditLogger = getAuditLogger();
      result.audit = auditLogger.getStats();
    } catch (e: any) {
      result.audit = { error: e.message };
    }

    // 9. Feedback
    try {
      const feedbackStore = getFeedbackStore();
      result.feedback = feedbackStore.getStats();
    } catch (e: any) {
      result.feedback = { error: e.message };
    }

    // 10. Embedding Service
    try {
      const embeddingService = getEmbeddingService();
      result.embedding = embeddingService.getStats();
    } catch (e: any) {
      result.embedding = { error: e.message };
    }

    // 11. Ollama Fallback
    try {
      const fallback = getOllamaFallback();
      result.ollamaFallback = { enabled: true };
    } catch (e: any) {
      result.ollamaFallback = { error: e.message };
    }

    // 12. Task Scheduler
    try {
      const scheduler = getTaskScheduler();
      result.tasks = scheduler.getStats();
    } catch (e: any) {
      result.tasks = { error: e.message };
    }

    // 13. Tenant Manager
    try {
      const tenantManager = getTenantManager();
      result.tenants = tenantManager ? tenantManager.getStats() : { enabled: false };
    } catch (e: any) {
      result.tenants = { error: e.message };
    }

    // 14. Key Rotator
    try {
      const keyRotator = getKeyRotator();
      result.keyRotator = keyRotator.getStats();
    } catch (e: any) {
      result.keyRotator = { error: e.message };
    }

    // 15. Proxy Diff
    try {
      const diffTracker = getProxyDiffTracker();
      result.proxyDiff = diffTracker.getStats();
    } catch (e: any) {
      result.proxyDiff = { error: e.message };
    }

    result.responseTimeMs = Date.now() - startTime;
    return result;
  });

  // Metrics history endpoint - ring buffer of last 100 snapshots
  fastify.get("/api/metrics/history", async () => {
    const metrics = getMetrics(fastify.log);
    return {
      snapshots: metrics.getHistory(),
      count: metrics.getHistory().length,
    };
  });

  // Cache clear endpoint - clears L1 semantic + L2 Redis
  fastify.post("/api/cache/clear", async () => {
    const results: Record<string, any> = {};

    try {
      const orchestrator = (fastify as any)._server?.orchestrator;
      if (orchestrator?.semanticCache) {
        orchestrator.semanticCache.clear();
        results.l1Semantic = { cleared: true };
      } else {
        results.l1Semantic = { cleared: false, reason: "not_available" };
      }
    } catch (e: any) {
      results.l1Semantic = { cleared: false, error: e.message };
    }

    try {
      const { getRedisCache } = await import("@/utils/redis-cache");
      const redisCache = getRedisCache();
      if (redisCache && (redisCache as any).connected && (redisCache as any).client) {
        const prefix = (redisCache as any).config?.keyPrefix || 'ccr:';
        const stream = (redisCache as any).client.scanStream({ match: `${prefix}*`, count: 100 });
        let deletedCount = 0;
        await new Promise<void>((resolve, reject) => {
          stream.on('data', (keys: string[]) => {
            if (keys.length > 0) {
              deletedCount += keys.length;
              (redisCache as any).client.del(...keys);
            }
          });
          stream.on('end', () => resolve());
          stream.on('error', () => resolve());
          setTimeout(() => resolve(), 5000);
        });
        results.l2Redis = { cleared: true, deletedKeys: deletedCount };
      } else {
        results.l2Redis = { cleared: false, reason: "not_connected" };
      }
    } catch (e: any) {
      results.l2Redis = { cleared: false, error: e.message };
    }

    try {
      const embeddingService = getEmbeddingService();
      results.embeddingCache = { cleared: true, previousSize: embeddingService.getStats().cacheSize };
    } catch (e: any) {
      results.embeddingCache = { cleared: false, error: e.message };
    }

    return { timestamp: new Date().toISOString(), results };
  });

  // Pipeline status endpoint - which middleware are active
  fastify.get("/api/pipeline/status", async () => {
    const orchestrator = (fastify as any)._server?.orchestrator;
    if (!orchestrator) {
      return { error: "orchestrator not available", middleware: [] };
    }

    const middleware: Array<{ name: string; enabled: boolean; details?: any }> = [];

    const getEnabled = (obj: any): boolean => {
      if (!obj) return false;
      if (typeof obj.isEnabled === 'function') return obj.isEnabled();
      if (obj.config?.enabled !== undefined) return obj.config.enabled;
      return !!obj;
    };

    try {
      middleware.push({
        name: "SemanticCache",
        enabled: getEnabled(orchestrator.semanticCache),
        details: orchestrator.semanticCache?.getStats?.(),
      });
    } catch {}

    try {
      middleware.push({
        name: "MemoryBridge",
        enabled: getEnabled(orchestrator.memoryBridge),
      });
    } catch {}

    try {
      middleware.push({
        name: "RAGEnricher",
        enabled: getEnabled(orchestrator.ragEnricher),
      });
    } catch {}

    try {
      middleware.push({
        name: "ContextCapture",
        enabled: getEnabled(orchestrator.contextCapture),
      });
    } catch {}

    try {
      middleware.push({
        name: "ReasoningCache",
        enabled: getEnabled(orchestrator.reasoningCache),
      });
    } catch {}

    try {
      middleware.push({
        name: "SessionBridge",
        enabled: !!orchestrator.sessionBridge,
      });
    } catch {}

    try {
      middleware.push({
        name: "EvolutionBridge",
        enabled: getEnabled(orchestrator.evolutionBridge),
      });
    } catch {}

    try {
      middleware.push({
        name: "HealthMonitor",
        enabled: orchestrator.healthMonitor !== null,
      });
    } catch {}

    try {
      const summary = orchestrator.hookManager?.getSummary?.() ?? {};
      middleware.push({
        name: "HookManager",
        enabled: !!orchestrator.hookManager,
        details: summary,
      });
    } catch {}

    const activeCount = middleware.filter(m => m.enabled).length;
    return {
      totalMiddleware: middleware.length,
      activeCount,
      middleware,
    };
  });

  // Embedding service API
  fastify.get("/api/embedding", async () => {
    const service = getEmbeddingService();
    return service.getStats();
  });

  fastify.post("/api/embedding/init", async () => {
    const service = getEmbeddingService();
    const available = await service.initialize();
    return { available, ...service.getStats() };
  });

  fastify.post("/api/embedding/embed", async (req: any) => {
    const service = getEmbeddingService();
    const { text } = req.body;
    if (!text) throw createApiError("text is required", 400, "invalid_request");
    const embedding = await service.embed(text);
    if (!embedding) return { embedding: null, dimensions: 0 };
    return { embedding: embedding.slice(0, 10), dimensions: embedding.length, available: true };
  });

  fastify.post("/api/embedding/similarity", async (req: any) => {
    const { textA, textB } = req.body;
    if (!textA || !textB) throw createApiError("textA and textB required", 400, "invalid_request");
    const service = getEmbeddingService();
    const [embA, embB] = await service.embedBatch([textA, textB]);
    if (!embA || !embB) return { similarity: null, reason: "embedding_unavailable" };
    return { similarity: EmbeddingService.cosineSimilarity(embA, embB) };
  });

  // Financial data APIs
  fastify.get("/api/finance/quote/:symbol", async (req: any) => {
    const service = getFinancialDataService();
    const quote = await service.getStockQuote(req.params.symbol);
    if (!quote) throw createApiError("Quote not found", 404, "not_found");
    return quote;
  });

  fastify.post("/api/finance/quotes", async (req: any) => {
    const { symbols } = req.body;
    if (!Array.isArray(symbols)) throw createApiError("symbols array required", 400, "invalid_request");
    const service = getFinancialDataService();
    return await service.getStockQuotes(symbols);
  });

  fastify.get("/api/finance/indices", async () => {
    const service = getFinancialDataService();
    return await service.getMarketIndices();
  });

  fastify.get("/api/finance/history/:symbol", async (req: any) => {
    const { period, interval } = req.query as any;
    const service = getFinancialDataService();
    return await service.getStockHistory(
      req.params.symbol,
      period || "1mo",
      interval || "1d"
    );
  });

  fastify.get("/api/finance/stats", async () => {
    const service = getFinancialDataService();
    return service.getStats();
  });

  fastify.post("/api/finance/enter", async (req: any) => {
    const { type, data } = req.body;
    if (!type || !data) throw createApiError("type and data required", 400, "invalid_request");
    const service = getFinancialDataService();
    return service.enterData(type, data);
  });

  fastify.get("/api/finance/entries", async (req: any) => {
    const { type } = req.query as any;
    const service = getFinancialDataService();
    return service.getManualEntries(type);
  });

  fastify.delete("/api/finance/entries/:id", async (req: any) => {
    const service = getFinancialDataService();
    const deleted = service.deleteManualEntry(req.params.id);
    if (!deleted) throw createApiError("Entry not found", 404, "not_found");
    return { deleted: true };
  });

  fastify.post("/api/finance/cache/clear", async () => {
    const service = getFinancialDataService();
    service.clearCache();
    return { cleared: true };
  });

  fastify.get("/api/finance/futures/contracts", async (req: any) => {
    const { exchange } = req.query as any;
    const service = getFinancialDataService();
    return service.getFuturesContracts(exchange);
  });

  fastify.get("/api/finance/futures/contracts/:symbol", async (req: any) => {
    const service = getFinancialDataService();
    const contract = service.getFuturesContract(req.params.symbol);
    if (!contract) throw createApiError("Contract not found", 404, "not_found");
    return contract;
  });

  fastify.post("/api/finance/futures/margin", async (req: any) => {
    const { symbol, price, contracts } = req.body;
    if (!symbol || !price || !contracts) throw createApiError("symbol, price, contracts required", 400, "invalid_request");
    const service = getFinancialDataService();
    return service.computeMargin({ symbol, price: Number(price), contracts: Number(contracts) });
  });

  fastify.post("/api/finance/futures/risk", async (req: any) => {
    const { symbol, position, direction, entryPrice, currentPrice } = req.body;
    if (!symbol || !position || !direction || !entryPrice || !currentPrice)
      throw createApiError("symbol, position, direction, entryPrice, currentPrice required", 400, "invalid_request");
    const service = getFinancialDataService();
    return service.computePositionRisk({
      symbol, position: Number(position), direction,
      entryPrice: Number(entryPrice), currentPrice: Number(currentPrice),
    });
  });

  const transformersWithEndpoint =
    fastify.transformerService.getTransformersWithEndpoint();

  for (const { transformer } of transformersWithEndpoint) {
    if (transformer.endPoint) {
      fastify.post(
        transformer.endPoint,
        async (req: FastifyRequest, reply: FastifyReply) => {
          return handleTransformerEndpoint(req, reply, fastify, transformer);
        }
      );
    }
  }

  fastify.post(
    "/providers",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["openai", "anthropic"] },
            baseUrl: { type: "string" },
            apiKey: { type: "string" },
            models: { type: "array", items: { type: "string" } },
          },
          required: ["id", "name", "type", "baseUrl", "apiKey", "models"],
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: RegisterProviderRequest }>,
      reply: FastifyReply
    ) => {
      // Validation
      const { name, baseUrl, apiKey, models } = request.body;

      if (!name?.trim()) {
        throw createApiError(
          "Provider name is required",
          400,
          "invalid_request"
        );
      }

      if (!baseUrl || !isValidUrl(baseUrl)) {
        throw createApiError(
          "Valid base URL is required",
          400,
          "invalid_request"
        );
      }

      try {
        const parsed = new URL(baseUrl);
        if (isPrivateIP(parsed.hostname)) {
          throw createApiError(
            "Private network URLs are not allowed",
            400,
            "ssrf_blocked"
          );
        }
      } catch (e: any) {
        if (e.statusCode) throw e;
        throw createApiError("Invalid URL format", 400, "invalid_request");
      }

      if (!apiKey?.trim()) {
        throw createApiError("API key is required", 400, "invalid_request");
      }

      if (!models || !Array.isArray(models) || models.length === 0) {
        throw createApiError(
          "At least one model is required",
          400,
          "invalid_request"
        );
      }

      // Check if provider already exists
      if (fastify.providerService.getProvider(request.body.name)) {
        throw createApiError(
          `Provider with name '${request.body.name}' already exists`,
          400,
          "provider_exists"
        );
      }

      return fastify.providerService.registerProvider(request.body);
    }
  );

  fastify.get("/providers", async () => {
    const providers = fastify.providerService.getProviders();
    return sanitizeProviders(providers);
  });

  fastify.get(
    "/providers/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const provider = fastify.providerService.getProvider(
        request.params.id
      );
      if (!provider) {
        throw createApiError("Provider not found", 404, "provider_not_found");
      }
      return sanitizeProvider(provider);
    }
  );

  fastify.put(
    "/providers/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["openai", "anthropic"] },
            baseUrl: { type: "string" },
            apiKey: { type: "string" },
            models: { type: "array", items: { type: "string" } },
            enabled: { type: "boolean" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<LLMProvider>;
      }>,
      reply
    ) => {
      const provider = fastify.providerService.updateProvider(
        request.params.id,
        request.body
      );
      if (!provider) {
        throw createApiError("Provider not found", 404, "provider_not_found");
      }
      return sanitizeProvider(provider);
    }
  );

  fastify.delete(
    "/providers/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const success = fastify.providerService.deleteProvider(
        request.params.id
      );
      if (!success) {
        throw createApiError("Provider not found", 404, "provider_not_found");
      }
      return { message: "Provider deleted successfully" };
    }
  );

  fastify.patch(
    "/providers/:id/toggle",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"],
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { enabled: boolean };
      }>,
      reply
    ) => {
      const success = fastify.providerService.toggleProvider(
        request.params.id,
        request.body.enabled
      );
      if (!success) {
        throw createApiError("Provider not found", 404, "provider_not_found");
      }
      return {
        message: `Provider ${
          request.body.enabled ? "enabled" : "disabled"
        } successfully`,
      };
    }
  );
};

// Helper function
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateIP(hostname: string): boolean {
  if (/^0[0-7]+(\.[0-7]+){0,3}$/.test(hostname)) {
    try {
      const parts = hostname.split('.').map(p => parseInt(p, 8));
      hostname = parts.join('.');
    } catch {}
  }
  if (/^\d{8,10}$/.test(hostname)) {
    const n = parseInt(hostname, 10);
    const a = (n >>> 24) & 0xff;
    const b = (n >>> 16) & 0xff;
    const c = (n >>> 8) & 0xff;
    const d = n & 0xff;
    hostname = `${a}.${b}.${c}.${d}`;
  }
  const hexMatch = hostname.match(/^0x([0-9a-f]+)$/i);
  if (hexMatch) {
    const n = parseInt(hexMatch[1], 16);
    if (n > 0) {
      const a = (n >>> 24) & 0xff;
      const b = (n >>> 16) & 0xff;
      const c = (n >>> 8) & 0xff;
      const d = n & 0xff;
      hostname = `${a}.${b}.${c}.${d}`;
    }
  }
  if (hostname.includes(':')) {
    const v6 = hostname.toLowerCase();
    if (v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') ||
        v6.startsWith('fe80') || v6.startsWith('fe90') || v6.startsWith('fea') || v6.startsWith('feb') ||
        v6 === '::' || v6 === '0:0:0:0:0:0:0:0' ||
        /^::ffff:/.test(v6)) return true;
  }
  return /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|localhost)/i.test(hostname);
}

function sanitizeProvider(provider: any): any {
  if (!provider) return provider;
  const sanitized = { ...provider };
  if (sanitized.apiKey) {
    sanitized.apiKey = sanitized.apiKey.length > 8
      ? sanitized.apiKey.slice(0, 4) + '***' + sanitized.apiKey.slice(-4)
      : '***';
  }
  if (sanitized.api_key) {
    sanitized.api_key = sanitized.api_key.length > 8
      ? sanitized.api_key.slice(0, 4) + '***' + sanitized.api_key.slice(-4)
      : '***';
  }
  return sanitized;
}

function sanitizeProviders(providers: any[]): any[] {
  if (!Array.isArray(providers)) return providers;
  return providers.map(sanitizeProvider);
}
