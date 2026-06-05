/**
 * MiddlewareOrchestrator - 中间件编排器
 *
 * Wraps the middleware stack around the CCR request pipeline.
 * Manages initialization, configuration, and lifecycle of all middleware.
 *
 * Usage (in server.ts):
 *   const orchestrator = new MiddlewareOrchestrator(configService, logger);
 *   await orchestrator.initialize();
 *
 *   // In preHandler hook, before routing:
 *   await orchestrator.onPreRoute(req);
 *
 *   // In onResponse hook:
 *   await orchestrator.onPostResponse(req, responseBody);
 *
 * Design: Non-blocking. Cache hit returns early. All others are fire-and-forget
 * or additive (enriching prompt). Never adds >100ms latency.
 */
import { ConfigService } from "../services/config";
import { ProviderRegistry } from "../services/provider-registry";
import { HealthMonitor } from "../services/health-monitor";

import { SemanticCache, CacheConfig } from "./semantic-cache";
import { MemoryBridge, MemoryConfig } from "./memory-bridge";
import { RAGEnricher, RAGConfig } from "./rag-enricher";
import { HookManager } from "./hooks";
import { ContextCaptureEngine, CaptureConfig } from "./context-capture";
import { ReasoningCache, ReasoningCacheConfig } from "./reasoning-cache";
import { SessionBridge } from "./session-bridge";
import { EvolutionBridge, EvolutionConfig } from "./evolution-bridge";
import { LangfuseTracer, LangfuseConfig } from "./langfuse-tracer";
import { ToolCompressor, ToolCompressorConfig } from "./tool-compressor";
import { IdempotencyGuard, IdempotencyConfig } from "./idempotency-guard";
import { KeyManager, KeyConfig } from "./key-manager";
import { QdrantCache, QdrantCacheConfig } from "./qdrant-cache";
import { PromptCaching, PromptCachingConfig } from "./prompt-caching";
import { SummaryInjector, SummaryInjectorConfig } from "./summary-injector";
import { MultiModelVoter, MultiVoterConfig } from "./multi-voter";
import { RequestReplay, ReplayConfig } from "./request-replay";
import { StructuredOutputEnforcer, StructuredOutputConfig } from "./structured-output";
import { ABTestingFramework, ABTestConfig } from "./ab-testing";
import { FinancialPIIMasker, FinancialPIIMaskerConfig } from "./financial-pii-masker";
import { checkHallucination, analyzeReasoning } from "../engines/reasoning-engine";
import type { ReasoningContext } from "../engines/reasoning-engine";
import { MultiLevelCache, getMultiLevelCache, type CacheKey } from "../utils/multi-level-cache";
import { SecurityHardener, getSecurityHardener } from "../utils/security-hardener";
import { PrometheusExporter, getPrometheusExporter } from "../utils/prometheus";
import { TrafficMirror, getTrafficMirror } from "../utils/traffic-mirror";
import { AdaptiveRouter, getAdaptiveRouter } from "../utils/adaptive-router";
import { getRedisCache } from "../utils/redis-cache";
import { redactObject } from "../utils/redactor";
import { getPromptTemplateEngine } from "../utils/prompt-template";
import { getWsPush } from "../utils/ws-push";
import { getCacheWarmer } from "../utils/cache-warmer";
import { getTaskQueue } from "../utils/task-queue";
import { getSelfReflector } from "../utils/self-reflect";
import { getTenantManager } from "../utils/tenant-isolation";
import { getQualityScorer } from "../utils/quality-scorer";
import { getAuditLogger } from "../utils/audit-logger";
import { getSlidingWindow } from "../utils/sliding-window";
import { getFeedbackStore } from "../utils/feedback-store";
import { getComplianceDisclaimer } from "../utils/compliance-disclaimer";
import { getCacheReportAggregator } from "../utils/cache-report";
import { getOllamaFallback } from "../utils/ollama-fallback";
import { getProxyDiffTracker } from "../utils/proxy-diff";
import { getFallbackChainExecutor, FallbackChainExecutor } from "../utils/fallback-chain";
import { getRAGPipeline, RAGPipeline } from "../utils/rag-pipeline";
import { getAdaptiveParameterTuner, AdaptiveParameterTuner } from "../utils/adaptive-params";
import { getRateLimiterQueue, RateLimiterQueue } from "../utils/rate-limiter-queue";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, label: string, logger?: any): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      logger?.warn(`MiddlewareOrchestrator: ${label} timed out after ${ms}ms`);
      resolve(fallback);
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); logger?.debug(`MiddlewareOrchestrator: ${label} failed: ${err?.message}`); resolve(fallback); }
    );
  });
}

export interface MiddlewareConfig {
  semanticCache: Partial<CacheConfig>;
  memoryBridge: Partial<MemoryConfig>;
  ragEnricher: Partial<RAGConfig>;
  contextCapture: Partial<CaptureConfig>;
  reasoningCache: Partial<ReasoningCacheConfig>;
  redisCache: { enabled: boolean };
  selfReflect: { enabled: boolean; maxIterations: number };
  wsPush: { enabled: boolean };
  cacheWarmer: { enabled: boolean };
  qualityScorer: { enabled: boolean };
  auditLogger: { enabled: boolean };
  slidingWindow: { enabled: boolean; maxTokens: number };
  complianceDisclaimer: { enabled: boolean };
  cacheReport: { enabled: boolean };
  ollamaFallback: { enabled: boolean };
  langfuse: Partial<LangfuseConfig>;
  toolCompressor: Partial<ToolCompressorConfig>;
  idempotencyGuard: Partial<IdempotencyConfig>;
  keyManager: { enabled: boolean; providers: Record<string, KeyConfig> };
  qdrantCache: Partial<QdrantCacheConfig>;
  promptCaching: Partial<PromptCachingConfig>;
  summaryInjector: Partial<SummaryInjectorConfig>;
  multiVoter: Partial<MultiVoterConfig>;
  requestReplay: Partial<ReplayConfig>;
  structuredOutput: Partial<StructuredOutputConfig>;
  abTesting: Partial<ABTestConfig>;
  financialPIIMasker: Partial<FinancialPIIMaskerConfig>;
  multiLevelCache: { enabled: boolean; l1MaxSize: number; l2Enabled: boolean; l3Enabled: boolean };
  securityHardener: { enabled: boolean };
  prometheus: { enabled: boolean };
  trafficMirror: { enabled: boolean; targets: any[] };
  adaptiveRouter: { enabled: boolean };
  fallbackChain: { enabled: boolean; maxAttempts: number };
  ragPipeline: { enabled: boolean; ollamaEndpoint: string; qdrantUrl: string };
  adaptiveParams: { enabled: boolean };
  rateLimiterQueue: { enabled: boolean; maxConcurrent: number; maxQueueSize: number };
}

export class MiddlewareOrchestrator {
  public hookManager: HookManager;
  public semanticCache: SemanticCache;
  public memoryBridge: MemoryBridge;
  public ragEnricher: RAGEnricher;
  public contextCapture: ContextCaptureEngine;
  public reasoningCache: ReasoningCache;
  public sessionBridge: SessionBridge;
  public evolutionBridge: EvolutionBridge;
  public langfuseTracer: LangfuseTracer;
  public toolCompressor: ToolCompressor;
  public idempotencyGuard: IdempotencyGuard;
  public keyManager: KeyManager;
  public qdrantCache: QdrantCache;
  public promptCaching: PromptCaching;
  public summaryInjector: SummaryInjector;
  public multiVoter: MultiModelVoter;
  public requestReplay: RequestReplay;
  public structuredOutput: StructuredOutputEnforcer;
  public abTesting: ABTestingFramework;
  public financialPIIMasker: FinancialPIIMasker;
  public healthMonitor: HealthMonitor | null = null;
  public multiLevelCache: MultiLevelCache | null = null;
  public securityHardener: SecurityHardener | null = null;
  public prometheusExporter: PrometheusExporter | null = null;
  public trafficMirror: TrafficMirror | null = null;
  public adaptiveRouter: AdaptiveRouter | null = null;
  public fallbackChainExecutor: FallbackChainExecutor | null = null;
  public ragPipeline: RAGPipeline | null = null;
  public adaptiveParameterTuner: AdaptiveParameterTuner | null = null;
  public rateLimiterQueue: RateLimiterQueue | null = null;

  private configService: ConfigService;
  private logger: any;
  private initialized = false;

  constructor(
    configService: ConfigService,
    providerRegistry?: ProviderRegistry,
    logger?: any
  ) {
    this.configService = configService;
    this.logger = logger || console;

    // Initialize from config
    const middlewareConfig = this.loadConfig();

    // Create middleware instances
    this.hookManager = new HookManager(this.logger);
    this.semanticCache = new SemanticCache(
      middlewareConfig.semanticCache,
      this.logger
    );
    this.memoryBridge = new MemoryBridge(
      middlewareConfig.memoryBridge,
      this.logger
    );
    this.ragEnricher = new RAGEnricher(
      middlewareConfig.ragEnricher,
      this.logger
    );
    this.contextCapture = new ContextCaptureEngine(
      middlewareConfig.contextCapture || {},
      this.logger
    );
    this.reasoningCache = new ReasoningCache(
      middlewareConfig.reasoningCache || {},
      this.logger
    );
    this.sessionBridge = new SessionBridge({}, this.logger);
    this.evolutionBridge = new EvolutionBridge({}, this.logger);

    this.langfuseTracer = new LangfuseTracer(middlewareConfig.langfuse || {}, this.logger);
    this.toolCompressor = new ToolCompressor(middlewareConfig.toolCompressor || {}, this.logger);
    this.idempotencyGuard = new IdempotencyGuard(middlewareConfig.idempotencyGuard || {}, this.logger);
    this.keyManager = new KeyManager(middlewareConfig.keyManager || { enabled: false, providers: {} }, this.logger);
    this.qdrantCache = new QdrantCache(middlewareConfig.qdrantCache || {}, this.logger);
    this.promptCaching = new PromptCaching(middlewareConfig.promptCaching || {}, this.logger);
    this.summaryInjector = new SummaryInjector(middlewareConfig.summaryInjector || {}, this.logger);
    this.multiVoter = new MultiModelVoter(middlewareConfig.multiVoter || {}, this.logger);
    this.requestReplay = new RequestReplay(middlewareConfig.requestReplay || {}, this.logger);
    this.structuredOutput = new StructuredOutputEnforcer(middlewareConfig.structuredOutput || {}, this.logger);
    this.abTesting = new ABTestingFramework(middlewareConfig.abTesting || {}, this.logger);
    this.financialPIIMasker = new FinancialPIIMasker(middlewareConfig.financialPIIMasker || {}, this.logger);

    if (providerRegistry) {
      this.healthMonitor = new HealthMonitor(
        providerRegistry,
        { checkIntervalMs: 30000 },
        this.logger
      );
    }
  }

  private loadConfig(): MiddlewareConfig {
    return {
      semanticCache: {
        enabled: this.configService.get("SEMANTIC_CACHE_ENABLED") !== false,
        ttlMs: this.configService.get("SEMANTIC_CACHE_TTL_MS") || 600000,
        maxEntries: this.configService.get("SEMANTIC_CACHE_MAX_ENTRIES") || 1000,
        similarityThreshold:
          this.configService.get("SEMANTIC_CACHE_THRESHOLD") || 0.92,
        endpoint: this.configService.get("GPTCACHE_ENDPOINT"),
      },
      memoryBridge: {
        enabled: this.configService.get("MEMORY_BRIDGE_ENABLED") !== false,
        storagePath: this.configService.get("MEMORY_STORAGE_PATH") || "./dev/memories.jsonl",
        extractionEnabled:
          this.configService.get("MEMORY_EXTRACTION_ENABLED") !== false,
      },
      ragEnricher: {
        enabled: this.configService.get("RAG_ENRICHER_ENABLED") !== false,
        projectRoot: this.configService.get("PROJECT_ROOT") || process.cwd(),
        maxEnrichmentTokens:
          this.configService.get("RAG_MAX_ENRICHMENT_TOKENS") || 2000,
        sources: {
          projectDocs:
            this.configService.get("RAG_SOURCE_PROJECT_DOCS") !== false,
          memoryMCP:
            this.configService.get("RAG_SOURCE_MEMORY_MCP") === true,
          clawMem:
            this.configService.get("RAG_SOURCE_CLAWMEM") === true,
          recentSessions:
            this.configService.get("RAG_SOURCE_SESSIONS") === true,
          codeGraph:
            this.configService.get("RAG_SOURCE_CODEGRAPH") === true,
          vectorStore:
            this.configService.get("RAG_SOURCE_VECTOR_STORE") === true,
        },
        memoryEndpoint: this.configService.get("MEMORY_MCP_ENDPOINT"),
        clawMemEndpoint: this.configService.get("CLAWMEM_ENDPOINT"),
        vectorStoreCollection: this.configService.get("RAG_VECTOR_STORE_COLLECTION") || "rag_documents",
      },
      contextCapture: {
        enabled: this.configService.get("CONTEXT_CAPTURE_ENABLED") !== false,
        storageMode: this.configService.get("CONTEXT_CAPTURE_STORAGE") || "jsonl",
        postgresConnectionString: this.configService.get("PG_CONNECTION_STRING"),
        jsonlPath: this.configService.get("CONTEXT_CAPTURE_JSONL_PATH") || "./dev/captures.jsonl",
      },
      reasoningCache: {
        enabled: this.configService.get("REASONING_CACHE_ENABLED") !== false,
        postgresConnectionString: this.configService.get("PG_CONNECTION_STRING"),
        maxChainLength: this.configService.get("REASONING_CACHE_MAX_CHAIN_LENGTH") || 8000,
        maxResults: this.configService.get("REASONING_CACHE_MAX_RESULTS") || 3,
        similarityThreshold: this.configService.get("REASONING_CACHE_THRESHOLD") || 0.7,
        ttlMs: this.configService.get("REASONING_CACHE_TTL_MS") || 3600000,
      },
      redisCache: {
        enabled: this.configService.get("REDIS_ENABLED") !== false,
      },
      selfReflect: {
        enabled: this.configService.get("SELF_REFLECT_ENABLED") === true,
        maxIterations: this.configService.get("SELF_REFLECT_MAX_ITERATIONS") || 2,
      },
      wsPush: {
        enabled: this.configService.get("WS_PUSH_ENABLED") === true,
      },
      cacheWarmer: {
        enabled: this.configService.get("CACHE_WARMER_ENABLED") === true,
      },
      qualityScorer: {
        enabled: this.configService.get("QUALITY_SCORER_ENABLED") !== false,
      },
      auditLogger: {
        enabled: this.configService.get("AUDIT_LOGGER_ENABLED") !== false,
      },
      slidingWindow: {
        enabled: this.configService.get("SLIDING_WINDOW_ENABLED") === true,
        maxTokens: this.configService.get("SLIDING_WINDOW_MAX_TOKENS") || 100000,
      },
      complianceDisclaimer: {
        enabled: this.configService.get("COMPLIANCE_DISCLAIMER_ENABLED") !== false,
      },
      cacheReport: {
        enabled: this.configService.get("CACHE_REPORT_ENABLED") !== false,
      },
      ollamaFallback: {
        enabled: this.configService.get("OLLAMA_FALLBACK_ENABLED") === true,
      },
      langfuse: {
        enabled: this.configService.get("LANGFUSE_ENABLED") === true,
        publicKey: this.configService.get("LANGFUSE_PUBLIC_KEY") || "",
        secretKey: this.configService.get("LANGFUSE_SECRET_KEY") || "",
        baseUrl: this.configService.get("LANGFUSE_BASE_URL") || "https://cloud.langfuse.com",
      },
      toolCompressor: {
        enabled: this.configService.get("TOOL_COMPRESSOR_ENABLED") !== false,
        maxToolResultLength: this.configService.get("TOOL_COMPRESSOR_MAX_LENGTH") || 2000,
        truncateTo: this.configService.get("TOOL_COMPRESSOR_TRUNCATE_TO") || 1500,
      },
      idempotencyGuard: {
        enabled: this.configService.get("IDEMPOTENCY_GUARD_ENABLED") === true,
        maxEntries: this.configService.get("IDEMPOTENCY_MAX_ENTRIES") || 1000,
        ttlMs: this.configService.get("IDEMPOTENCY_TTL_MS") || 300000,
      },
      keyManager: {
        enabled: this.configService.get("KEY_MANAGER_ENABLED") === true,
        providers: this.configService.get("KEY_MANAGER_PROVIDERS") || {},
      },
      qdrantCache: {
        enabled: this.configService.get("QDRANT_CACHE_ENABLED") === true,
        url: this.configService.get("QDRANT_URL") || "http://localhost:6333",
        collection: this.configService.get("QDRANT_CACHE_COLLECTION") || "ccr_semantic_cache",
        similarityThreshold: this.configService.get("QDRANT_CACHE_THRESHOLD") || 0.92,
      },
      promptCaching: {
        enabled: this.configService.get("PROMPT_CACHING_ENABLED") !== false,
        maxCachedSystemLength: this.configService.get("PROMPT_CACHING_MAX_LENGTH") || 50000,
      },
      summaryInjector: {
        enabled: this.configService.get("SUMMARY_INJECTOR_ENABLED") === true,
        maxTokens: this.configService.get("SUMMARY_INJECTOR_MAX_TOKENS") || 100000,
        preserveRecentMessages: this.configService.get("SUMMARY_INJECTOR_PRESERVE") || 4,
      },
      multiVoter: {
        enabled: this.configService.get("MULTI_VOTER_ENABLED") === true,
        models: this.configService.get("MULTI_VOTER_MODELS") || [],
        strategy: this.configService.get("MULTI_VOTER_STRATEGY") || "majority",
      },
      requestReplay: {
        enabled: this.configService.get("REQUEST_REPLAY_ENABLED") === true,
        storagePath: this.configService.get("REQUEST_REPLAY_PATH") || "./dev/replay-snapshots.jsonl",
      },
      structuredOutput: {
        enabled: this.configService.get("STRUCTURED_OUTPUT_ENABLED") !== false,
      },
      abTesting: {
        enabled: this.configService.get("AB_TESTING_ENABLED") === true,
        experiments: this.configService.get("AB_TESTING_EXPERIMENTS") || {},
      },
      financialPIIMasker: {
        enabled: this.configService.get("FINANCIAL_PII_MASKER_ENABLED") !== false,
      },
      fallbackChain: {
        enabled: this.configService.get("FALLBACK_CHAIN_ENABLED") !== false,
        maxAttempts: this.configService.get("FALLBACK_CHAIN_MAX_ATTEMPTS") || 3,
      },
      ragPipeline: {
        enabled: this.configService.get("RAG_PIPELINE_ENABLED") === true,
        ollamaEndpoint: this.configService.get("OLLAMA_ENDPOINT") || "http://localhost:11434",
        qdrantUrl: this.configService.get("QDRANT_URL") || "http://127.0.0.1:16333",
      },
      adaptiveParams: {
        enabled: this.configService.get("ADAPTIVE_PARAMS_ENABLED") !== false,
      },
      rateLimiterQueue: {
        enabled: this.configService.get("RATE_LIMITER_QUEUE_ENABLED") === true,
        maxConcurrent: this.configService.get("RATE_LIMITER_QUEUE_MAX_CONCURRENT") || 5,
        maxQueueSize: this.configService.get("RATE_LIMITER_QUEUE_MAX_SIZE") || 100,
      },
    };
  }

  /**
   * Initialize all middleware.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info("MiddlewareOrchestrator: initializing...");

    // Start health monitoring
    if (this.healthMonitor) {
      this.healthMonitor.start();
      this.configService.set("_healthMonitor", this.healthMonitor);
      this.logger.info("  HealthMonitor: started");
    }

    // Initialize reasoning cache
    await this.reasoningCache.initialize();

    // Initialize Redis cache L2
    try {
      const redisCache = getRedisCache();
      if (redisCache) {
        this.logger.info("  RedisCache L2: available");
      }
    } catch (e: any) {
      this.logger.debug(`  RedisCache L2: not available (${e?.message})`);
    }

    // Initialize cache warmer
    try {
      const warmer = getCacheWarmer();
      if (warmer) {
        this.logger.info("  CacheWarmer: available");
      }
    } catch (e: any) {
      this.logger.debug(`  CacheWarmer: not available (${e?.message})`);
    }

    // Initialize task queue
    try {
      const queue = getTaskQueue();
      if (queue) {
        this.logger.info("  TaskQueue: available");
      }
    } catch (e: any) {
      this.logger.debug(`  TaskQueue: not available (${e?.message})`);
    }

    // Initialize WebSocket push
    try {
      const wsPush = getWsPush();
      if (wsPush) {
        this.logger.info("  WsPush: available");
      }
    } catch (e: any) {
      this.logger.debug(`  WsPush: not available (${e?.message})`);
    }

    // Register built-in hooks
    this.registerBuiltInHooks();

    // Initialize evolution bridge
    this.evolutionBridge.initialize();

    this.langfuseTracer.initialize();
    this.logger.info(`  LangfuseTracer: ${this.langfuseTracer['config']?.enabled ? 'enabled' : 'disabled'}`);

    if ((this.toolCompressor as any).config?.enabled !== false) {
      this.logger.info("  ToolCompressor: enabled");
    }

    this.idempotencyGuard.initialize();
    this.logger.info(`  IdempotencyGuard: ${this.idempotencyGuard['config']?.enabled ? 'enabled' : 'disabled'}`);

    this.keyManager.initialize();
    this.logger.info(`  KeyManager: ${this.keyManager['config']?.enabled ? 'enabled' : 'disabled'}`);

    await this.qdrantCache.initialize();
    this.logger.info(`  QdrantCache: ${this.qdrantCache['config']?.enabled ? 'enabled' : 'disabled'}`);

    this.logger.info(`  PromptCaching: ${this.promptCaching['config']?.enabled ? 'enabled' : 'disabled'}`);
    this.logger.info(`  SummaryInjector: ${this.summaryInjector['config']?.enabled ? 'enabled' : 'disabled'}`);
    this.logger.info(`  MultiModelVoter: ${this.multiVoter.isEnabled() ? 'enabled' : 'disabled'}`);
    this.logger.info(`  RequestReplay: ${this.requestReplay.getStats().enabled ? 'enabled' : 'disabled'}`);
    this.logger.info(`  StructuredOutput: ${this.structuredOutput.getStats().enabled ? 'enabled' : 'disabled'}`);
    this.logger.info(`  ABTesting: ${this.abTesting.getStats().enabled ? 'enabled' : 'disabled'}`);
    this.logger.info(`  FinancialPIIMasker: ${this.financialPIIMasker.getStats().enabled ? 'enabled' : 'disabled'}`);

    // Initialize v2 infrastructure modules
    try {
      const mlcConfig = middlewareConfig.multiLevelCache || { enabled: true, l1MaxSize: 1000, l2Enabled: true, l3Enabled: false };
      if (mlcConfig.enabled) {
        this.multiLevelCache = getMultiLevelCache({
          l1: { maxSize: mlcConfig.l1MaxSize },
          l2: { maxSize: 10000 },
          l3Enabled: mlcConfig.l3Enabled,
        }, this.logger);
        await this.multiLevelCache.initialize();
        this.logger.info(`  MultiLevelCache: L1(memory) + L2(redis:${this.multiLevelCache.l2.isConnected()}) + L3(qdrant:${mlcConfig.l3Enabled})`);
      }
    } catch (e: any) {
      this.logger.debug(`  MultiLevelCache: skipped (${e?.message})`);
    }

    try {
      if (middlewareConfig.securityHardener?.enabled !== false) {
        this.securityHardener = getSecurityHardener(undefined, this.logger);
        this.logger.info(`  SecurityHardener: enabled (auto-redact + audit)`);
      }
    } catch (e: any) {
      this.logger.debug(`  SecurityHardener: skipped (${e?.message})`);
    }

    try {
      if (middlewareConfig.prometheus?.enabled !== false) {
        this.prometheusExporter = getPrometheusExporter(this.logger);
        this.logger.info(`  PrometheusExporter: enabled (/metrics endpoint)`);
      }
    } catch (e: any) {
      this.logger.debug(`  PrometheusExporter: skipped (${e?.message})`);
    }

    try {
      const mirrorConfig = middlewareConfig.trafficMirror || { enabled: false, targets: [] };
      if (mirrorConfig.enabled) {
        this.trafficMirror = getTrafficMirror(mirrorConfig, this.logger);
        this.logger.info(`  TrafficMirror: enabled (${mirrorConfig.targets.length} targets)`);
      }
    } catch (e: any) {
      this.logger.debug(`  TrafficMirror: skipped (${e?.message})`);
    }

    try {
      if (middlewareConfig.adaptiveRouter?.enabled) {
        const fallbackConfig = this.configService.get<any>('fallback') || {};
        this.adaptiveRouter = getAdaptiveRouter(undefined, fallbackConfig, this.logger);
        this.logger.info(`  AdaptiveRouter: enabled`);
      }
    } catch (e: any) {
      this.logger.debug(`  AdaptiveRouter: skipped (${e?.message})`);
    }

    // Phase 3: Fallback chain executor
    try {
      const fbConfig = middlewareConfig.fallbackChain || { enabled: true, maxAttempts: 3 };
      if (fbConfig.enabled) {
        this.fallbackChainExecutor = getFallbackChainExecutor({
          maxAttempts: fbConfig.maxAttempts || 3,
        }, this.logger);
        this.logger.info(`  FallbackChainExecutor: enabled (maxAttempts=${fbConfig.maxAttempts || 3})`);
      }
    } catch (e: any) {
      this.logger.debug(`  FallbackChainExecutor: skipped (${e?.message})`);
    }

    // Phase 3: RAG pipeline (Ollama + Qdrant)
    try {
      const ragConfig = middlewareConfig.ragPipeline || { enabled: false, ollamaEndpoint: 'http://localhost:11434', qdrantUrl: 'http://127.0.0.1:16333' };
      if (ragConfig.enabled) {
        this.ragPipeline = getRAGPipeline({
          ollamaEndpoint: ragConfig.ollamaEndpoint,
          qdrantUrl: ragConfig.qdrantUrl,
        }, this.logger);
        await this.ragPipeline.initialize();
        this.logger.info(`  RAGPipeline: enabled (ollama+qdrant)`);
      }
    } catch (e: any) {
      this.logger.debug(`  RAGPipeline: skipped (${e?.message})`);
    }

    // Phase 3: Adaptive parameter tuner
    try {
      const apConfig = middlewareConfig.adaptiveParams || { enabled: true };
      if (apConfig.enabled) {
        this.adaptiveParameterTuner = getAdaptiveParameterTuner(this.logger);
        this.logger.info(`  AdaptiveParameterTuner: enabled`);
      }
    } catch (e: any) {
      this.logger.debug(`  AdaptiveParameterTuner: skipped (${e?.message})`);
    }

    // Phase 3: Rate limiter queue
    try {
      const rlConfig = middlewareConfig.rateLimiterQueue || { enabled: false, maxConcurrent: 5, maxQueueSize: 100 };
      if (rlConfig.enabled) {
        this.rateLimiterQueue = getRateLimiterQueue({
          maxConcurrent: rlConfig.maxConcurrent || 5,
          maxQueueSize: rlConfig.maxQueueSize || 100,
        }, this.logger);
        this.logger.info(`  RateLimiterQueue: enabled (maxConcurrent=${rlConfig.maxConcurrent || 5})`);
      }
    } catch (e: any) {
      this.logger.debug(`  RateLimiterQueue: skipped (${e?.message})`);
    }

    this.initialized = true;
    this.logger.info("MiddlewareOrchestrator: initialized (v2)");
  }

  /**
   * Shutdown all middleware.
   */
  async shutdown(): Promise<void> {
    if (this.healthMonitor) {
      this.healthMonitor.stop();
    }
    try { await this.reasoningCache.cleanup(); } catch {}

    this.sessionBridge.cleanup();
    this.evolutionBridge.shutdown();
    this.langfuseTracer.shutdown();
    this.idempotencyGuard.shutdown();
    this.qdrantCache.shutdown();

    // Shutdown Redis cache
    try {
      const redisCache = getRedisCache();
      if (redisCache) await redisCache.shutdown();
    } catch {}

    // Shutdown task queue
    try {
      const queue = getTaskQueue();
      if (queue) await queue.shutdown();
    } catch {}

    // Shutdown cache warmer
    try {
      const warmer = getCacheWarmer();
      if (warmer) warmer.stop();
    } catch {}

    // Shutdown WebSocket push
    try {
      const wsPush = getWsPush();
      if (wsPush) wsPush.shutdown();
    } catch {}

    this.initialized = false;

    if (this.trafficMirror) {
      this.trafficMirror.updateConfig({ enabled: false });
    }

    if (this.adaptiveRouter) {
      this.adaptiveRouter.stopHealthChecks();
    }

    if (this.securityHardener) {
      this.securityHardener.destroy();
    }

    this.logger.info("MiddlewareOrchestrator: shutdown (v2)");
  }

  /**
   * PRE-ROUTE hook: Called before routing decision.
   * Checks semantic cache. If hit, returns cached response (short-circuit).
   * If miss, continues to routing.
   *
   * @returns Cached response if hit, null if miss
   */
  async onPreRoute(req: any): Promise<any | null> {
    if (!this.initialized) return null;

    try {
      if (this.securityHardener) {
        (req as any)._traceId = this.securityHardener.generateTraceId();
      }

      const hookCtx = this.hookManager.createContext(req);
      const hookResult = await this.hookManager.execute("onRequest", hookCtx);

      if (hookResult instanceof Response) {
        return hookResult;
      }

      if (this.idempotencyGuard['config']?.enabled) {
        const idempResult = this.idempotencyGuard.checkRequest(req.body);
        if (idempResult.isDuplicate) {
          (req as any)._idempotentHit = true;
          this.logger.debug(`IdempotencyGuard: duplicate detected`);
          return idempResult.response || { status: 'processing' };
        }
      }

      if (this.toolCompressor['config']?.enabled !== false) {
        req.body = this.toolCompressor.compressRequest(req.body);
        (req as any)._toolCompressed = true;
      }

      if (this.langfuseTracer['config']?.enabled) {
        this.langfuseTracer.onPreRoute(req);
      }

      const context = this.extractContext(req);
      const cachedResponse = await withTimeout(
        this.semanticCache.lookup(req.body, context),
        100,
        null,
        "semanticCache.lookup",
        this.logger
      );

      if (cachedResponse) {
        // Cache HIT - short circuit
        (req as any)._cacheHit = true;
        (req as any)._cachedResponse = cachedResponse;
        this.logger.debug(
          `MiddlewareOrchestrator: cache HIT for session ${context.sessionId}`
        );
        return cachedResponse;
      }

      // L2 Redis cache lookup (if L1 missed)
      try {
        const redisCache = getRedisCache();
        if (redisCache) {
          const redisCached = await withTimeout(
            redisCache.get(JSON.stringify(req.body)),
            50,
            null,
            "redisCache.get",
            this.logger
          );
          if (redisCached) {
            (req as any)._cacheHit = true;
            (req as any)._cachedResponse = redisCached;
            (req as any)._cacheSource = 'redis';
            this.logger.debug(
              `MiddlewareOrchestrator: Redis L2 cache HIT for session ${context.sessionId}`
            );
            return redisCached;
          }
        }
      } catch (e: any) {
        this.logger.debug(`Redis L2 lookup failed: ${e?.message}`);
      }

      if (this.qdrantCache['config']?.enabled) {
        try {
          const queryText = this.extractQuerySummary(req.body);
          const qdrantResult = await withTimeout(
            this.qdrantCache.lookup(queryText, []),
            150,
            null,
            "qdrantCache.lookup",
            this.logger
          );
          if (qdrantResult) {
            (req as any)._cacheHit = true;
            (req as any)._cachedResponse = qdrantResult;
            (req as any)._cacheSource = 'qdrant';
            this.logger.debug(`Qdrant L3 cache HIT for session ${context.sessionId}`);
            return qdrantResult;
          }
        } catch (e: any) {
          this.logger.debug(`Qdrant L3 lookup failed: ${e?.message}`);
        }
      }
    } catch (error: any) {
      this.logger.warn(`MiddlewareOrchestrator onPreRoute error: ${error.message}`);
    }

    return null; // Cache miss, continue normal flow
  }

  /**
   * POST-ROUTE hook: Called after routing decision, before sending.
   * Enriches the system prompt and injects memory context.
   */
  async onPostRoute(req: any): Promise<void> {
    if (!this.initialized) return;

    try {
      const context = this.extractContext(req);
      const tokenCount = (req as any).tokenCount || 0;
      const scenarioType = (req as any).scenarioType || '';

      // Gate RAG injection: skip trivial/simple flash queries only
      // Always inject for: pro models, thinking/reasoning, named agents, or large context
      const modelId = Array.isArray((req as any).model) 
        ? (req as any).model.join(',') 
        : ((req as any).model || req.body?.model || '');
      const routeTier = (req as any).routeTier || '';
      const isProModel = modelId.includes('pro') || modelId.includes('opus') || routeTier === 'pro' || routeTier === 'pro_max';
      const shouldEnrich = tokenCount >= 500 || 
        scenarioType === 'think' || 
        scenarioType === 'reasoning_pro_max' ||
        scenarioType === 'reasoning_flash' ||
        isProModel ||
        (context.agentName && !['_default', 'unknown', 'Explore'].includes(context.agentName));

      if (shouldEnrich) {
        // Enrich system prompt with RAG context (100ms budget)
        const enrichmentResult = await withTimeout(
          this.ragEnricher.enrich(req.body.system, context),
          100,
          { enrichments: [], system: req.body.system, totalTokens: 0 },
          "ragEnricher.enrich",
          this.logger
        );

        if (enrichmentResult.enrichments.length > 0) {
          req.body.system = enrichmentResult.system;
          (req as any)._ragEnriched = true;
        }
      }

      // Retrieve and inject memory context (100ms budget)
      const memories = await withTimeout(
        this.memoryBridge.retrieve(context),
        100,
        [],
        "memoryBridge.retrieve",
        this.logger
      );
      if (memories.length > 0) {
        // Append memory hints to system prompt
        const memoryHint = [
          "\n<memory_hints>",
          ...memories.map((m: any, i: number) => `[${i + 1}] ${m.content || m.memory}`),
          "</memory_hints>",
        ].join("\n");

        if (typeof req.body.system === "string") {
          req.body.system += memoryHint;
        } else if (Array.isArray(req.body.system)) {
          req.body.system.push({ type: "text", text: memoryHint });
        }
        (req as any)._memoryEnriched = true;
      }

      // Retrieve reasoning hints for think/reasoning scenarios
      if (scenarioType === 'think' || scenarioType === 'reasoning_pro_max' || isProModel) {
        const query = this.extractQuerySummary(req.body);
        const chains = await withTimeout(
          this.reasoningCache.retrieve(query),
          50,
          [],
          "reasoningCache.retrieve",
          this.logger
        );
        const hint = this.reasoningCache.buildReasoningHint(chains);
        if (hint) {
          if (typeof req.body.system === "string") {
            req.body.system += hint;
          } else if (Array.isArray(req.body.system)) {
            req.body.system.push({ type: "text", text: hint });
          }
          (req as any)._reasoningHintEnriched = true;
        }
      }

      // Execute onRouteDecision hooks
      const hookCtx = this.hookManager.createContext(req);
      hookCtx.tokenCount = (req as any).tokenCount;
      hookCtx.scenarioType = (req as any).scenarioType;
      await this.hookManager.execute("onRouteDecision", hookCtx);

      // Apply prompt template injection (if configured)
      try {
        const promptEngine = getPromptTemplateEngine();
        if (promptEngine) {
          const templateResult = promptEngine.processSystemPrompt(
            req.body.system,
            {
              sessionId: context.sessionId,
              agentName: context.agentName,
              taskType: context.taskType,
              model: (req as any).model || req.body?.model,
            }
          );
          if (templateResult.modified) {
            req.body.system = templateResult.prompt;
            (req as any)._templateApplied = true;
          }
        }
      } catch (e: any) {
        this.logger.debug(`PromptTemplate failed: ${e?.message}`);
      }

      // Apply compliance disclaimer for financial queries
      try {
        const disclaimer = getComplianceDisclaimer();
        if (disclaimer) {
          const result = disclaimer.process(req.body);
          if (result.modified) {
            req.body = result.body;
            (req as any)._complianceDisclaimer = true;
          }
        }
      } catch (e: any) {
        this.logger.debug(`ComplianceDisclaimer failed: ${e?.message}`);
      }

      if (this.promptCaching['config']?.enabled !== false) {
        req.body = this.promptCaching.injectCacheControl(req.body);
      }

      if (this.financialPIIMasker.getStats().enabled) {
        const maskResult = this.financialPIIMasker.maskBody(req.body);
        if (maskResult.masked) {
          req.body = maskResult.body;
          (req as any)._piiMasked = maskResult.maskedCount;
        }
      }

      if (this.abTesting.getStats().enabled) {
        const sessionId = context.sessionId || "default";
        const abVariant = this.abTesting.assignVariant(sessionId, "default");
        if (abVariant) {
          (req as any)._abVariant = abVariant;
        }
      }

      if (this.summaryInjector['config']?.enabled && this.summaryInjector.shouldCompact(req.body)) {
        const result = this.summaryInjector.buildCompactionPayload(req.body);
        if (result.summaryAdded) {
          req.body.messages = result.messages;
          (req as any)._compactionInjected = true;
          this.logger.info(`SummaryInjector: injected compacted messages`);
        }
      }

      // SessionBridge: process request for compaction detection and context preservation
      try {
        const sessionResult = this.sessionBridge.processRequest(
          context.sessionId || "unknown",
          req.body
        );
        if (sessionResult.isCompaction) {
          (req as any)._compactionDetected = true;
          this.logger?.info(`SessionBridge: compaction detected for ${context.sessionId}`);
        }
        if (sessionResult.preservedContextToInject.length > 0) {
          const preservedHint = [
            "\n<preserved_context>",
            ...sessionResult.preservedContextToInject.map(c => `[${c.source}] ${c.value}`),
            "</preserved_context>",
          ].join("\n");
          if (typeof req.body.system === "string") {
            req.body.system += preservedHint;
          } else if (Array.isArray(req.body.system)) {
            req.body.system.push({ type: "text", text: preservedHint });
          }
          (req as any)._contextPreserved = true;
        }
      } catch (e: any) {
        this.logger.debug(`SessionBridge request processing failed: ${e?.message}`);
      }

      // EvolutionBridge: detect skills and inject evolution context
      try {
        const skills = this.evolutionBridge.detectSkills(req.body);
        if (skills.length > 0) {
          (req as any)._detectedSkills = skills;

          const evolutionContext = this.evolutionBridge.buildContextInjection(skills);
          if (evolutionContext && typeof req.body.system === "string") {
            req.body.system += "\n" + evolutionContext;
            (req as any)._evolutionEnriched = true;
          } else if (evolutionContext && Array.isArray(req.body.system)) {
            req.body.system.push({ type: "text", text: evolutionContext });
            (req as any)._evolutionEnriched = true;
          }
        }
      } catch (e: any) {
        this.logger.debug(`EvolutionBridge skill detection failed: ${e?.message}`);
      }

    } catch (error: any) {
      this.logger.warn(`MiddlewareOrchestrator onPostRoute error: ${error.message}`);
    }
  }

  /**
   * POST-RESPONSE hook: Called after receiving response from upstream.
   * Stores response in cache, extracts memories, records session data.
   */
  async onPostResponse(req: any, responseBody: any): Promise<void> {
    if (!this.initialized) return;

    try {
      const context = this.extractContext(req);

      // Store in semantic cache (fire-and-forget)
      if (!(req as any)._cacheHit) {
        this.semanticCache.store(req.body, responseBody, {
          sessionId: context.sessionId,
          agentName: context.agentName,
          taskType: context.taskType,
          model: (req as any).body?.model || "unknown",
          tokenCount: (req as any).tokenCount,
        }).catch((err) => {
          this.logger?.debug(`SemanticCache store failed: ${err?.message}`);
        });

        // L2 Redis cache store (fire-and-forget)
        try {
          const redisCache = getRedisCache();
          if (redisCache) {
            const ttlMs = this.configService.get("REDIS_CACHE_TTL_MS") || 600000;
            redisCache.set(
              JSON.stringify(req.body),
              responseBody,
              Math.round(ttlMs / 1000) // convert ms to seconds
            ).catch((e: any) => this.logger.debug(`Redis L2 store failed: ${e?.message}`));
          }
        } catch (e: any) {
          this.logger.debug(`Redis L2 store error: ${e?.message}`);
        }

        if (this.qdrantCache['config']?.enabled) {
          const queryText = this.extractQuerySummary(req.body);
          this.qdrantCache.store(queryText, [], responseBody, {
            model: (req as any).model || 'unknown',
            provider: (req as any).provider || 'unknown',
            sessionId: context.sessionId,
          }).catch((e: any) => this.logger.debug(`Qdrant L3 store failed: ${e?.message}`));
        }
      }

      if (this.idempotencyGuard['config']?.enabled) {
        this.idempotencyGuard.markCompleted(req.body, responseBody);
      }

      if (this.langfuseTracer['config']?.enabled) {
        this.langfuseTracer.onPostResponse(req, responseBody);
      }

      if (this.structuredOutput.getStats().enabled) {
        const enforced = this.structuredOutput.enforce(req.body, responseBody);
        if (enforced !== responseBody) {
          (req as any)._structuredOutputFixed = true;
        }
      }

      if (this.keyManager['config']?.enabled) {
        const provider = (req as any).provider;
        const statusCode = (req as any)._httpStatus || 200;
        const usedKey = (req as any)._usedApiKey;
        if (usedKey) {
          if (statusCode >= 400) {
            this.keyManager.reportError(provider, usedKey, statusCode);
          } else {
            this.keyManager.reportSuccess(provider, usedKey);
          }
        }
      }

      // Extract memories from conversation (fire-and-forget, don't await)
      this.memoryBridge.extractFromConversation(
        req.body,
        responseBody,
        context
      ).catch((err: any) => {
        this.logger?.debug(`Memory extraction failed: ${err?.message}`);
      });

      // Capture full context for HSE/SkillClaw (fire-and-forget)
      const usage = responseBody?.usage || {};
      let reasoningCtx: ReasoningContext;
      try {
        reasoningCtx = checkHallucination(
          usage.input_tokens || 0,
          usage.output_tokens || 0,
          responseBody,
          (req as any)._httpStatus || 200,
          (req as any).provider
        );
      } catch (e: any) {
        this.logger?.warn(`checkHallucination failed: ${e?.message}`);
        reasoningCtx = {
          contextInjectedTokens: 0,
          contextInjected: false,
          outputTokens: usage.output_tokens || 0,
          inputTokens: usage.input_tokens || 0,
          hallucinationRisk: 0,
          flags: ['check_hallucination_exception'],
        };
      }

      // Redact sensitive data before capture
      let redactedBody = req.body;
      let redactedResponse = responseBody;
      try {
        redactedBody = redactObject(req.body);
        redactedResponse = redactObject(responseBody);
      } catch {}

      this.contextCapture.capture({
        sessionId: context.sessionId,
        agentType: (req as any).gatewayAgentName || detectAgentFromReq(req),
        modelTier: (req as any).routeTier || 'unknown',
        provider: (req as any).provider || 'unknown',
        modelId: (req as any).model || 'unknown',
        tokenCount: (req as any).tokenCount,
        requestBody: redactedBody,
        responseBody: redactedResponse,
        usage,
        startTime: (req as any)._startTime,
        endTime: Date.now(),
        scenarioType: (req as any).scenarioType || 'unknown',
        hallucinationRisk: reasoningCtx.hallucinationRisk,
        cacheHit: !!(req as any)._cacheHit,
        ragEnriched: !!(req as any)._ragEnriched,
      }).catch((err) => {
        this.logger?.warn(`Context capture failed: ${err?.message}`);
      });

      // WebSocket push for high hallucination risk
      if (reasoningCtx.hallucinationRisk > 0.5) {
        try {
          const wsPush = getWsPush();
          if (wsPush) {
            wsPush.broadcast('risk_alert', {
              type: 'hallucination_risk',
              sessionId: context.sessionId,
              risk: reasoningCtx.hallucinationRisk,
              flags: reasoningCtx.flags,
              provider: (req as any).provider,
              model: (req as any).model,
            });
          }
        } catch {}
      }

      // Self-reflection loop (if enabled, for non-streaming responses)
      try {
        const selfReflector = getSelfReflector();
        if (selfReflector && !(req as any)._cacheHit && !req.body?.stream) {
          const reflectResult = await withTimeout(
            selfReflector.reflect(req.body, responseBody),
            2000,
            null,
            "selfReflector.reflect",
            this.logger
          );
          if (reflectResult && reflectResult.improved) {
            this.logger?.debug(`Self-reflection improved response for session ${context.sessionId}`);
            (req as any)._selfReflected = true;
          }
        }
      } catch (e: any) {
        this.logger.debug(`Self-reflection skipped: ${e?.message}`);
      }

      // Store reasoning chain for future hint retrieval
      const thinkingContent = this.extractThinkingContent(responseBody);
      if (thinkingContent) {
        const query = this.extractQuerySummary(req.body);
        this.reasoningCache.store({
          query,
          reasoningContent: thinkingContent,
          model: (req as any).model || 'unknown',
          outputTokens: usage.output_tokens || 0,
        }).catch((err: any) => {
          this.logger?.debug(`ReasoningCache store failed: ${err?.message}`);
        });
      }

      // Log hallucination warnings
      if (reasoningCtx.hallucinationRisk > 0.5) {
        this.logger?.warn(
          `Hallucination risk=${reasoningCtx.hallucinationRisk.toFixed(2)} ` +
          `flags=[${reasoningCtx.flags.join(',')}] ` +
          `session=${context.sessionId}`
        );
      }

      // Quality scoring (fire-and-forget)
      try {
        const qualityScorer = getQualityScorer();
        if (qualityScorer) {
          const query = this.extractQuerySummary(req.body);
          const responseText = this.extractResponseText(responseBody);
          qualityScorer.score(query, responseText).then(score => {
            if (score.overall < 0.3) {
              this.logger?.warn(`Low quality score=${score.overall.toFixed(2)} session=${context.sessionId}`);
            }
            // Log to audit
            try {
              const auditLogger = getAuditLogger();
              if (auditLogger) {
                const usage = responseBody?.usage || {};
                auditLogger.log({
                  sessionId: context.sessionId,
                  provider: (req as any).provider || 'unknown',
                  model: (req as any).model || 'unknown',
                  scenarioType: (req as any).scenarioType,
                  inputTokens: usage.input_tokens || 0,
                  outputTokens: usage.output_tokens || 0,
                  costUsd: 0,
                  latencyMs: Date.now() - ((req as any)._startTime || Date.now()),
                  statusCode: (req as any)._httpStatus || 200,
                  cacheHit: !!(req as any)._cacheHit,
                  qualityScore: score.overall,
                  hallucinationRisk: reasoningCtx.hallucinationRisk,
                  flags: reasoningCtx.flags,
                  requestSummary: this.extractQuerySummary(req.body).slice(0, 200),
                  responseSummary: responseText.slice(0, 200),
                });
              }
            } catch {}
          }).catch(() => {});
        }
      } catch {}

      // SessionBridge: process response for tool chain tracking
      try {
        this.sessionBridge.processResponse(
          context.sessionId || "unknown",
          responseBody
        );
      } catch (e: any) {
        this.logger.debug(`SessionBridge response processing failed: ${e?.message}`);
      }

      // EvolutionBridge: record trace for HSE pipeline
      try {
        const skills = (req as any)._detectedSkills || [];
        if (skills.length > 0 || (req as any)._evolutionEnriched) {
          const session = this.sessionBridge.getSession(context.sessionId || "unknown");
          this.evolutionBridge.recordTrace({
            sessionId: context.sessionId || "unknown",
            turnNumber: session?.turnCount || 0,
            skills,
            routing: {
              provider: (req as any).provider || "unknown",
              model: (req as any).model || "unknown",
              tier: (req as any).routeTier || "unknown",
              scenarioType: (req as any).scenarioType || "unknown",
              routeReason: "",
            },
            quality: {
              hallucinationRisk: reasoningCtx.hallucinationRisk,
              qualityScore: 0,
              latencyMs: Date.now() - ((req as any)._startTime || Date.now()),
            },
            context: {
              ragEnriched: !!(req as any)._ragEnriched,
              memoryEnriched: !!(req as any)._memoryEnriched,
              cacheHit: !!(req as any)._cacheHit,
              preservedContexts: session?.preservedContext?.length || 0,
              toolChainsActive: session?.activeToolChains?.size || 0,
            },
            usage: {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              model: (req as any).model || "unknown",
            },
          });
        }
      } catch (e: any) {
        this.logger.debug(`EvolutionBridge trace recording failed: ${e?.message}`);
      }

      // Execute onResponse hooks
      const hookCtx = this.hookManager.createContext(req);
      hookCtx.responseBody = responseBody;
      await this.hookManager.execute("onResponse", hookCtx);

      // Update provider health based on this response
      if (this.healthMonitor && (req as any).provider) {
        this.healthMonitor.checkProvider((req as any).provider);
      }

      // v2: Prometheus metrics recording
      if (this.prometheusExporter) {
        const usage = responseBody?.usage || {};
        const latencyMs = Date.now() - ((req as any)._startTime || Date.now());
        this.prometheusExporter.recordRequest({
          provider: (req as any).provider || 'unknown',
          model: (req as any).model || 'unknown',
          scenario: (req as any).scenarioType || 'default',
          status: (req as any)._httpStatus === 200 ? 'success' : 'error',
          durationMs: latencyMs,
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cost: 0,
          cacheHit: !!(req as any)._cacheHit,
          cacheLevel: (req as any)._cacheSource || undefined,
        });
      }

      // v2: AdaptiveRouter health feedback
      if (this.adaptiveRouter && (req as any).provider) {
        const latencyMs = Date.now() - ((req as any)._startTime || Date.now());
        const statusCode = (req as any)._httpStatus || 200;
        if (statusCode >= 200 && statusCode < 400) {
          this.adaptiveRouter.reportSuccess((req as any).provider, latencyMs);
        } else {
          this.adaptiveRouter.reportFailure((req as any).provider, statusCode >= 500 ? 'server_error' : 'unknown');
        }
      }

      // v2: TrafficMirror (async, fire-and-forget)
      if (this.trafficMirror) {
        this.trafficMirror.mirrorRequest(
          req.body,
          (req as any).provider || 'unknown',
          (req as any).model || 'unknown',
          responseBody
        ).catch(() => {});
      }

      // v2: Security audit entry
      if (this.securityHardener) {
        const usage = responseBody?.usage || {};
        const latencyMs = Date.now() - ((req as any)._startTime || Date.now());
        this.securityHardener.addAuditEntry({
          traceId: (req as any)._traceId || 'unknown',
          sessionId: context.sessionId,
          provider: (req as any).provider || 'unknown',
          model: (req as any).model || 'unknown',
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          latencyMs,
          cacheHit: !!(req as any)._cacheHit,
          cacheLevel: (req as any)._cacheSource,
          success: !((req as any)._httpStatus >= 400),
          estimatedCost: 0,
          redactedAuth: '(redacted)',
          sourceIp: req.ip || '127.0.0.1',
        });
      }

    } catch (error: any) {
      this.logger.warn(`MiddlewareOrchestrator onPostResponse error: ${error.message}`);
    }
  }

  /**
   * ON-ERROR hook: Called on pipeline errors.
   */
  async onError(req: any, error: Error): Promise<void> {
    if (!this.initialized) return;

    try {
      const hookCtx = this.hookManager.createContext(req);
      hookCtx.metadata.error = error.message;
      await this.hookManager.execute("onError", hookCtx);

      // Push error alert via WebSocket
      try {
        const wsPush = getWsPush();
        if (wsPush) {
          wsPush.broadcast('error_alert', {
            sessionId: (req as any).sessionId,
            provider: (req as any).provider,
            model: (req as any).model,
            error: error.message,
            scenarioType: (req as any).scenarioType,
          });
        }
      } catch {}
    } catch (e: any) {
      this.logger?.error(`MiddlewareOrchestrator onError hook failed: ${e?.message}`);
    }
  }

  /**
   * ON-SESSION-END hook: Called when session ends.
   */
  async onSessionEnd(sessionId: string): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.memoryBridge.onSessionEnd(sessionId);
      await this.contextCapture.flush();

      const hookCtx = {
        sessionId,
        metadata: {},
      } as any;
      await this.hookManager.execute("onSessionEnd", hookCtx);
    } catch (e: any) {
      this.logger?.error(`MiddlewareOrchestrator onSessionEnd failed: ${e?.message}`);
    }
  }

  /**
   * Get middleware stats for monitoring/dashboard.
   */
  getStats(): {
    cache: { totalEntries: number; totalHits: number; hitRate: number };
    memory: { pending: number };
    context: { totalCaptures: number; sessions: number; avgLatencyMs: number };
    hooks: Record<string, number>;
    health: { name: string; healthy: boolean; latency: number }[];
    redis: { connected: boolean; hits: number; misses: number };
  } {
    let redisStats = { connected: false, hits: 0, misses: 0 };
    try {
      const redisCache = getRedisCache();
      if (redisCache) {
        const stats = redisCache.getStats();
        redisStats = { connected: true, ...stats };
      }
    } catch {}

    return {
      cache: this.semanticCache.getStats(),
      memory: { pending: (this.memoryBridge as any).pendingMemories?.length || 0 },
      context: this.contextCapture.getStats(),
      hooks: this.hookManager.getSummary(),
      health: this.healthMonitor?.getSummary() || [],
      redis: redisStats,
      langfuse: { enabled: this.langfuseTracer['config']?.enabled || false },
      toolCompressor: { enabled: this.toolCompressor['config']?.enabled !== false },
      idempotency: this.idempotencyGuard.getStats(),
      keyManager: this.keyManager.getStats(),
      qdrantCache: this.qdrantCache.getStats(),
      cacheReport: (() => {
        try {
          const reportAgg = getCacheReportAggregator();
          if (reportAgg) {
            return reportAgg.generateReport({
              l1: this.semanticCache.getStats(),
              l2: redisStats,
            });
          }
        } catch {}
        return null;
      })(),
      v2: {
        multiLevelCache: this.multiLevelCache?.getAllStats() || null,
        securityHardener: this.securityHardener ? { enabled: true } : null,
        prometheus: this.prometheusExporter ? { enabled: true } : null,
        trafficMirror: this.trafficMirror?.getComparisonStats() || null,
        adaptiveRouter: this.adaptiveRouter?.getAllMetrics() || null,
        fallbackChain: this.fallbackChainExecutor ? { enabled: true } : null,
        ragPipeline: this.ragPipeline?.getStats() || null,
        adaptiveParams: this.adaptiveParameterTuner ? { enabled: true } : null,
        rateLimiterQueue: this.rateLimiterQueue?.getStats() || null,
      },
    };
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private extractContext(req: any): {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
    query?: string;
    recentFiles?: string[];
  } {
    return {
      sessionId: (req as any).sessionId,
      agentName: (req as any).gatewayAgentName,
      taskType: (req as any).gatewayTaskType,
    };
  }

  private extractThinkingContent(responseBody: any): string | null {
    if (!responseBody?.content || !Array.isArray(responseBody.content)) return null;
    const thinkingBlocks = responseBody.content
      .filter((c: any) => c.type === "thinking")
      .map((c: any) => c.thinking || "");
    return thinkingBlocks.length > 0 ? thinkingBlocks.join("\n") : null;
  }

  private extractQuerySummary(body: any): string {
    if (!body?.messages) return "";
    const messages = body.messages as any[];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") {
        const content = messages[i].content;
        if (typeof content === "string") return content.slice(0, 500);
        if (Array.isArray(content)) {
          return content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text || "")
            .join(" ")
            .slice(0, 500);
        }
      }
    }
    return "";
  }

  private extractResponseText(responseBody: any): string {
    if (!responseBody) return '';
    if (typeof responseBody === 'string') return responseBody;
    if (responseBody.content) {
      if (typeof responseBody.content === 'string') return responseBody.content;
      if (Array.isArray(responseBody.content)) {
        return responseBody.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text || '')
          .join('\n');
      }
    }
    return JSON.stringify(responseBody).slice(0, 500);
  }

  private registerBuiltInHooks(): void {
    // Log all routing decisions
    this.hookManager.register(
      "onRouteDecision",
      "log-routing-decision",
      async (ctx) => {
        if (this.logger) {
          this.logger.info({
            hook: "route-decision",
            sessionId: ctx.sessionId,
            scenario: ctx.scenarioType,
            tokenCount: ctx.tokenCount,
          });
        }
      },
      "last"
    );

    // Track session start
    this.hookManager.register(
      "onRequest",
      "track-session-start",
      async (ctx) => {
        if (ctx.sessionId) {
          this.logger?.debug(`Session active: ${ctx.sessionId}`);
        }
      },
      "first"
    );
  }
}

/** Detect agent type from request body without importing agent_detector */
function detectAgentFromReq(req: any): string {
  try {
    const body = req?.body || {};
    const system = body.system;
    const text = typeof system === 'string' ? system
      : Array.isArray(system) ? system.filter((s: any) => s.type === 'text').map((s: any) => s.text || '').join('\n')
      : '';
    if (!text) return 'unknown';

    // CCR subagent tag
    const ccrMatch = text.match(/<CCR-SUBAGENT-MODEL>([^<]+)<\/CCR-SUBAGENT-MODEL>/);
    if (ccrMatch) return ccrMatch[1].trim();

    // Common agent patterns
    const patterns: Record<string, string> = {
      'reasoning-orchestrator': 'reasoning-orchestrator',
      'architecture-governor': 'architecture-governor',
      'security-reviewer': 'security-reviewer',
      'core-implementer': 'core-implementer',
      'p0-planner': 'p0-planner',
    };
    const lower = text.toLowerCase();
    for (const [pattern, agent] of Object.entries(patterns)) {
      if (lower.includes(pattern)) return agent;
    }
    return '_default';
  } catch (e: any) {
    return 'unknown';
  }
}
