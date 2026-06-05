import Fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyPluginAsync,
  FastifyPluginCallback,
  FastifyPluginOptions,
  FastifyRegisterOptions,
  preHandlerHookHandler,
  onRequestHookHandler,
  preParsingHookHandler,
  preValidationHookHandler,
  preSerializationHookHandler,
  onSendHookHandler,
  onResponseHookHandler,
  onTimeoutHookHandler,
  onErrorHookHandler,
  onRouteHookHandler,
  onRegisterHookHandler,
  onReadyHookHandler,
  onListenHookHandler,
  onCloseHookHandler,
  FastifyBaseLogger,
  FastifyLoggerOptions,
  FastifyServerOptions,
} from "fastify";
import cors from "@fastify/cors";
import { ConfigService, AppConfig } from "./services/config";
import { errorHandler } from "./api/middleware";
import { registerApiRoutes } from "./api/routes";
import { ProviderService } from "./services/provider";
import { TransformerService } from "./services/transformer";
import { TokenizerService } from "./services/tokenizer";
import { router, calculateTokenCount, searchProjectBySession } from "./utils/router";
import { sessionUsageCache } from "./utils/cache";
import { resolveReasoningEffort } from "./utils/thinking";
import { MiddlewareOrchestrator } from "./middleware/orchestrator";
import { acquireConcurrencySlots, releaseWhenResponseCompletes } from "./utils/concurrency";

// Extend FastifyRequest to include custom properties
declare module "fastify" {
  interface FastifyRequest {
    provider?: string;
    model?: string;
    scenarioType?: string;
  }
  interface FastifyInstance {
    _server?: Server;
  }
}

interface ServerOptions extends FastifyServerOptions {
  initialConfig?: AppConfig;
}

// Application factory
function createApp(options: FastifyServerOptions = {}): FastifyInstance {
  const fastify = Fastify({
    bodyLimit: 10 * 1024 * 1024,
    requestTimeout: 300000,
    keepAliveTimeout: 72000,
    connectionTimeout: 60000,
    maxRequestsPerSocket: 1000,
    ...options,
  });

  // Register error handler
  fastify.setErrorHandler(errorHandler);

  // Register CORS
  fastify.register(cors, {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      try {
        const parsed = new URL(origin);
        const allowed = ['127.0.0.1', 'localhost'];
        if (allowed.includes(parsed.hostname)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      } catch {
        callback(null, false);
      }
    },
  });
  return fastify;
}

// Server class
class Server {
  private app: FastifyInstance;
  configService: ConfigService;
  providerService!: ProviderService;
  transformerService: TransformerService;
  tokenizerService: TokenizerService;
  orchestrator: MiddlewareOrchestrator;
  private _initPromise: Promise<void>;

  constructor(options: ServerOptions = {}) {
    const { initialConfig, ...fastifyOptions } = options;
    this.app = createApp({
      ...fastifyOptions,
      logger: fastifyOptions.logger ?? true,
    });
    this.configService = new ConfigService(options);
    this.transformerService = new TransformerService(
      this.configService,
      this.app.log
    );
    this.tokenizerService = new TokenizerService(
      this.configService,
      this.app.log
    );
    this.orchestrator = new MiddlewareOrchestrator(
      this.configService,
      undefined, // ProviderRegistry created later in providerService
      this.app.log
    );
    this._initPromise = Promise.all([
      this.transformerService.initialize(),
      this.tokenizerService.initialize().catch((error) => {
        this.app.log.error(`Failed to initialize TokenizerService: ${error}`);
      }),
    ]).then(() => {
      this.providerService = new ProviderService(
        this.configService,
        this.transformerService,
        this.app.log
      );
    });
  }

  async register<Options extends FastifyPluginOptions = FastifyPluginOptions>(
    plugin: FastifyPluginAsync<Options> | FastifyPluginCallback<Options>,
    options?: FastifyRegisterOptions<Options>
  ): Promise<void> {
    await (this.app as any).register(plugin, options);
  }

  addHook(hookName: "onRequest", hookFunction: onRequestHookHandler): void;
  addHook(hookName: "preParsing", hookFunction: preParsingHookHandler): void;
  addHook(
    hookName: "preValidation",
    hookFunction: preValidationHookHandler
  ): void;
  addHook(hookName: "preHandler", hookFunction: preHandlerHookHandler): void;
  addHook(
    hookName: "preSerialization",
    hookFunction: preSerializationHookHandler
  ): void;
  addHook(hookName: "onSend", hookFunction: onSendHookHandler): void;
  addHook(hookName: "onResponse", hookFunction: onResponseHookHandler): void;
  addHook(hookName: "onTimeout", hookFunction: onTimeoutHookHandler): void;
  addHook(hookName: "onError", hookFunction: onErrorHookHandler): void;
  addHook(hookName: "onRoute", hookFunction: onRouteHookHandler): void;
  addHook(hookName: "onRegister", hookFunction: onRegisterHookHandler): void;
  addHook(hookName: "onReady", hookFunction: onReadyHookHandler): void;
  addHook(hookName: "onListen", hookFunction: onListenHookHandler): void;
  addHook(hookName: "onClose", hookFunction: onCloseHookHandler): void;
  public addHook(hookName: string, hookFunction: any): void {
    this.app.addHook(hookName as any, hookFunction);
  }

  public async registerNamespace(name: string, options?: any) {
    if (!name) throw new Error("name is required");
    if (name === '/') {
      await this.app.register(async (fastify) => {
        fastify.decorate('configService', this.configService);
        fastify.decorate('transformerService', this.transformerService);
        fastify.decorate('providerService', this.providerService);
        fastify.decorate('tokenizerService', this.tokenizerService);
        await registerApiRoutes(fastify);
      });
      return
    }
    if (!options) throw new Error("options is required");
    const configService = new ConfigService({
      initialConfig: {
        providers: options.Providers,
        Router: options.Router,
      }
    });
    const transformerService = new TransformerService(
      configService,
      this.app.log
    );
    await transformerService.initialize();
    const providerService = new ProviderService(
      configService,
      transformerService,
      this.app.log
    );
    const tokenizerService = new TokenizerService(
      configService,
      this.app.log
    );
    await tokenizerService.initialize();
    await this.app.register(async (fastify) => {
      fastify.decorate('configService', configService);
      fastify.decorate('transformerService', transformerService);
      fastify.decorate('providerService', providerService);
      fastify.decorate('tokenizerService', tokenizerService);
      // Add router hook for namespace
      fastify.addHook('preHandler', async (req: any, reply: any) => {
        const url = new URL(`http://127.0.0.1${req.url}`);
        if (url.pathname.endsWith("/v1/messages")) {
          await router(req, reply, {
            configService,
            tokenizerService,
          });
        }
      });
      await registerApiRoutes(fastify);
    }, { prefix: name });
  }

  async start(): Promise<void> {
    try {
      this.app._server = this;

      // Initialize middleware orchestrator
      await this.orchestrator.initialize().catch((e: any) => {
        this.app.log.warn(`MiddlewareOrchestrator init skipped: ${e.message}`);
      });

      this.app.addHook("preHandler", (req, reply, done) => {
        const url = new URL(`http://127.0.0.1${req.url}`);
        if (url.pathname === "/v1/messages" && req.body) {
          const body = req.body as any;
          req.log.info({ data: body, type: "request body" });
          if (!body.stream) {
            body.stream = false;
          }
        }
        done();
      });

      await this._initPromise;
      await this.registerNamespace('/')

      this.app.addHook(
        "preHandler",
        async (req: FastifyRequest, reply: FastifyReply) => {
          const url = new URL(`http://127.0.0.1${req.url}`);
          if (url.pathname === "/v1/messages" && req.body) {
            try {
              const body = req.body as any;

              await router(req as any, reply, {
                configService: this.configService,
                tokenizerService: this.tokenizerService,
              });

              if (reply.sent) return;
              if (!body || !body.model) {
                return reply
                  .code(400)
                  .send({ error: "Missing model in request body" });
              }
              const [provider, ...model] = body.model.split(",");
              body.model = model.join(",");
              req.provider = provider;
              req.model = model.join(",");

              if (provider === "deepseek") {
                const reasoning = resolveReasoningEffort(body);
                if (reasoning.effort) {
                  body.output_config = { effort: reasoning.effort };
                } else {
                  body.output_config = { effort: this.classifyThinkingEffort(body) };
                }
              }

              const concurrencyConfig = this.configService.get('Concurrency');
              if (concurrencyConfig && provider) {
                try {
                  const release = await acquireConcurrencySlots(provider, concurrencyConfig);
                  (req as any)._releaseConcurrency = release;
                } catch (err: any) {
                  req.log.warn(`Concurrency limit reached for ${provider}: ${err.message}`);
                  return reply.code(429).send({
                    type: "error",
                    error: {
                      type: "rate_limit_error",
                      message: `Too many concurrent requests to ${provider}. Please retry later.`
                    }
                  });
                }
              }
              return;
            } catch (err) {
              req.log.error({error: err}, "Error in modelProviderMiddleware:");
              return reply.code(500).send({ error: "Internal server error" });
            }
          }
        }
      );

      // Orchestrator post-route hook (RAG enrichment + memory injection)
      this.app.addHook("preHandler", async (req: any) => {
        if (req.provider && req.scenarioType) {
          await this.orchestrator.onPostRoute(req).catch(() => {});
        }
      });

      // Orchestrator post-response hook (cache store + context capture + memory extraction)
      this.app.addHook("onSend", async (req: any, reply: any, payload: any) => {
        if (req.url?.includes("/v1/messages") && payload) {
          try {
            if (typeof payload !== "string") return payload;
            const isSSE = payload.startsWith('event:') || payload.startsWith('data:');
            if (isSSE) return payload;
            const parsed = JSON.parse(payload);
            if (parsed && !parsed.error && parsed.content) {
              await this.orchestrator.onPostResponse(req, parsed).catch(() => {});
            }
          } catch {}
        }
        return payload;
      });

      // Orchestrator error hook
      this.app.addHook("onError", async (req: any, reply: any, error: Error) => {
        await this.orchestrator.onError(req, error).catch(() => {});
      });

      // Orchestrator session start/end tracking
      this.app.addHook("onRequest", async (req: any) => {
        if (req.url?.startsWith("/v1/messages")) {
          req._startTime = Date.now();
        }
      });

      this.app.addHook("onResponse", async (req: any, reply: any) => {
        if (!req._releaseConcurrency) return;
        const release = req._releaseConcurrency;
        delete req._releaseConcurrency;
        const raw = reply.raw;
        if (raw && !raw.writableEnded && !raw.finished) {
          raw.once("close", () => release());
          raw.once("error", () => release());
        } else {
          release();
        }
      });


      const address = await this.app.listen({
        port: parseInt(this.configService.get("PORT") || "3000", 10),
        host: this.configService.get("HOST") || "127.0.0.1",
      });

      this.app.log.info(`🚀 LLMs API server listening on ${address}`);
      console.log(`\n  🚀 Claude Code Router running at ${address}`);
      console.log(`  📊 Dashboard: ${address}/api/health`);
      console.log(`  ⚙️  Setup:    ${address}/ (first time)\n`);

      const shutdown = async (signal: string) => {
        this.app.log.info(`Received ${signal}, shutting down gracefully...`);
        await this.orchestrator.shutdown().catch(() => {});
        await this.app.close();
        process.exit(0);
      };

      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    } catch (error) {
      this.app.log.error(`Error starting server: ${error}`);
      process.exit(1);
    }
  }

  private classifyThinkingEffort(body: any): string {
    const messages = body.messages || [];
    const system = body.system;
    const tools = body.tools || [];

    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const userContent = typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? lastUserMsg.content.filter((c: any) => c.type === "text").map((c: any) => c.text || "").join(" ")
        : "";

    const systemText = typeof system === "string" ? system
      : Array.isArray(system) ? system.filter((s: any) => s.type === "text").map((s: any) => s.text || "").join(" ")
      : "";

    const hasTools = tools.length > 0;
    const hasLongContext = messages.length > 10 || userContent.length > 2000;
    const hasAgentPattern = systemText.includes("<CCR-SUBAGENT") || systemText.includes("agent");
    const hasComplexQuery = userContent.length > 500 || /analyz|design|architect|implement|debug|refactor|explain/i.test(userContent);

    if (hasAgentPattern || hasTools || hasLongContext || hasComplexQuery) {
      return "max";
    }
    return "high";
  }
}

// Export for external use
export default Server;
export { sessionUsageCache };
export { router };
export { calculateTokenCount };
export { searchProjectBySession };
export type { RouterScenarioType, RouterFallbackConfig } from "./utils/router";
export { ConfigService } from "./services/config";
export { ProviderService } from "./services/provider";
export { TransformerService } from "./services/transformer";
export { TokenizerService } from "./services/tokenizer";
export { SemanticStoreService } from "./services/semantic-store";
export { MiddlewareOrchestrator } from "./middleware/orchestrator";
export { ReasoningCache } from "./middleware/reasoning-cache";
export { pluginManager, tokenSpeedPlugin, getTokenSpeedStats, getGlobalTokenSpeedStats, CCRPlugin, CCRPluginOptions, PluginMetadata } from "./plugins";
export { SSEParserTransform, SSESerializerTransform, rewriteStream } from "./utils/sse";
export { getCircuitBreaker, getAllCircuitBreakers, CircuitState, CircuitBreaker } from "./utils/circuit-breaker";
export { withRetry, getRetryConfig, RetryConfig, RetryContext } from "./utils/retry";
export { getMetrics, MetricsRegistry, MODEL_COST_TABLE } from "./utils/metrics";
export { getRateLimiter, RateLimiter, RateLimiterConfig } from "./utils/rate-limiter";
export { redactString, redactObject, containsSensitiveInfo, RedactorConfig } from "./utils/redactor";
export { getBudgetManager, BudgetManager, BudgetConfig, BudgetAlert } from "./utils/budget";
export { getIdempotencyGuard, IdempotencyGuard, IdempotencyConfig } from "./utils/idempotency";
export { getStructuredOutputProcessor, StructuredOutputProcessor, StructuredOutputConfig } from "./utils/structured-output";
export { getPermissionGuard, PermissionGuard, PermissionGuardConfig } from "./utils/permission-guard";
export { getPromptTemplateEngine, PromptTemplateEngine, PromptTemplateConfig } from "./utils/prompt-template";
export { getMockServer, MockServer, MockConfig } from "./utils/mock-server";
export { getMultiModelVoter, MultiModelVoter, VoteConfig } from "./utils/multi-model-vote";
export { getSelfReflector, SelfReflector, ReflectionConfig } from "./utils/self-reflect";
export { getReplayManager, ReplayManager, ReplayConfig } from "./utils/replay";
export { getRedisCache, RedisCache, RedisCacheConfig } from "./utils/redis-cache";
export { getVectorStore, VectorStore, VectorStoreConfig } from "./utils/vector-store";
export { getTaskQueue, TaskQueue, TaskQueueConfig } from "./utils/task-queue";
export { getWsPush, WsPush, WsPushConfig } from "./utils/ws-push";
export { getCacheWarmer, CacheWarmer, CacheWarmerConfig } from "./utils/cache-warmer";
export { getABTester, ABTester, ABTestConfig } from "./utils/ab-test";
export { getTaskSplitter, TaskSplitter, TaskSplitterConfig } from "./utils/task-splitter";
export { getTenantManager, TenantManager, TenantConfig } from "./utils/tenant-isolation";
export { getKeyRotator, KeyRotator, KeyRotatorConfig } from "./utils/key-rotator";
export { getQualityScorer, QualityScorer, QualityScoreConfig } from "./utils/quality-scorer";
export { getAuditLogger, AuditLogger, AuditLogConfig } from "./utils/audit-logger";
export { getSlidingWindow, SlidingWindowManager, SlidingWindowConfig } from "./utils/sliding-window";
export { getDocLoader, DocLoader, DocLoaderConfig } from "./utils/doc-loader";
export { getCascadeChain, CascadeChain, CascadeChainConfig } from "./utils/cascade-chain";
export { getTaskScheduler, TaskScheduler, TaskSchedulerConfig } from "./utils/task-scheduler";
export { getFeedbackStore, FeedbackStore, FeedbackStoreConfig } from "./utils/feedback-store";
export { getMultimodalProcessor, MultimodalProcessor, MultimodalConfig } from "./utils/multimodal-processor";
export { getComplianceDisclaimer, ComplianceDisclaimer, DisclaimerConfig } from "./utils/compliance-disclaimer";
export { getCacheReportAggregator, CacheReportAggregator, CacheReportConfig } from "./utils/cache-report";
export { getOllamaFallback, OllamaFallback, OllamaFallbackConfig } from "./utils/ollama-fallback";
export { getProxyDiffTracker, ProxyDiffTracker, ProxyDiffConfig } from "./utils/proxy-diff";
export { getCodeExtractor, CodeExtractor, CodeExtractorConfig } from "./utils/code-extractor";
export { getIntentRouter, IntentRouter, IntentRouterConfig } from "./utils/intent-router";
export { getEmbeddingService, EmbeddingService, EmbeddingConfig } from "./utils/embedding";
export { getFinancialDataService, FinancialDataService, FinancialDataConfig } from "./utils/financial-data";
export { VaultManager, getVaultManager, VaultConfig } from "./services/vault";
export { AdaptiveRouter, getAdaptiveRouter, AdaptiveRouterConfig, AdaptiveRouteResult } from "./utils/adaptive-router";
export { MultiLevelCache, getMultiLevelCache, L1MemoryCache, L2RedisCache, MultiLevelCacheConfig, CacheKey, CacheEntry, CacheStats } from "./utils/multi-level-cache";
export { SecurityHardener, getSecurityHardener, SecurityConfig } from "./utils/security-hardener";
export { PrometheusExporter, getPrometheusExporter, PrometheusMetric } from "./utils/prometheus";
export { ReasoningChainEngine, getReasoningChainEngine, ChainStep, ChainOutput, ChainTemplate } from "./engines/reasoning-chain";
export { TrafficMirror, getTrafficMirror, TrafficMirrorConfig } from "./utils/traffic-mirror";
export { ContextStore, getContextStore, ContextEntry, ContextQuery, ContextStoreConfig } from "./services/context-store";
