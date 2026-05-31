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
import { checkHallucination, analyzeReasoning } from "../engines/reasoning-engine";

export interface MiddlewareConfig {
  semanticCache: Partial<CacheConfig>;
  memoryBridge: Partial<MemoryConfig>;
  ragEnricher: Partial<RAGConfig>;
  contextCapture: Partial<CaptureConfig>;
}

export class MiddlewareOrchestrator {
  public hookManager: HookManager;
  public semanticCache: SemanticCache;
  public memoryBridge: MemoryBridge;
  public ragEnricher: RAGEnricher;
  public contextCapture: ContextCaptureEngine;
  public healthMonitor: HealthMonitor | null = null;

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

    // If provider registry is available, set up health monitor
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
        endpoint: this.configService.get("MEM0_ENDPOINT"),
        apiKey: this.configService.get("MEM0_API_KEY"),
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
        },
        memoryEndpoint: this.configService.get("MEMORY_MCP_ENDPOINT"),
        clawMemEndpoint: this.configService.get("CLAWMEM_ENDPOINT"),
      },
      contextCapture: {
        enabled: this.configService.get("CONTEXT_CAPTURE_ENABLED") !== false,
        storageMode: this.configService.get("CONTEXT_CAPTURE_STORAGE") || "jsonl",
        postgresConnectionString: this.configService.get("PG_CONNECTION_STRING"),
        jsonlPath: this.configService.get("CONTEXT_CAPTURE_JSONL_PATH") || "./dev/captures.jsonl",
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
      this.logger.info("  HealthMonitor: started");
    }

    // Register built-in hooks
    this.registerBuiltInHooks();

    this.initialized = true;
    this.logger.info("MiddlewareOrchestrator: initialized");
  }

  /**
   * Shutdown all middleware.
   */
  async shutdown(): Promise<void> {
    if (this.healthMonitor) {
      this.healthMonitor.stop();
    }
    this.initialized = false;
    this.logger.info("MiddlewareOrchestrator: shutdown");
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
      // Execute onRequest hooks
      const hookCtx = this.hookManager.createContext(req);
      const hookResult = await this.hookManager.execute("onRequest", hookCtx);

      if (hookResult instanceof Response) {
        return hookResult;
      }

      // Check semantic cache
      const context = this.extractContext(req);
      const cachedResponse = await this.semanticCache.lookup(
        req.body,
        context
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
    } catch (error: any) {
      this.logger.debug(`MiddlewareOrchestrator onPreRoute error: ${error.message}`);
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
      const isProModel = modelId.includes('pro');
      const shouldEnrich = tokenCount >= 500 || 
        scenarioType === 'think' || 
        scenarioType === 'reasoning_pro_max' ||
        scenarioType === 'reasoning_flash' ||
        isProModel ||
        (context.agentName && !['_default', 'unknown', 'Explore'].includes(context.agentName));

      if (shouldEnrich) {
        // Enrich system prompt with RAG context
        const enrichmentResult = await this.ragEnricher.enrich(
          req.body.system,
          context
        );

        if (enrichmentResult.enrichments.length > 0) {
          req.body.system = enrichmentResult.system;
          (req as any)._ragEnriched = true;
        }
      }

      // Retrieve and inject memory context
      const memories = await this.memoryBridge.retrieve(context);
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

      // Execute onRouteDecision hooks
      const hookCtx = this.hookManager.createContext(req);
      hookCtx.tokenCount = (req as any).tokenCount;
      hookCtx.scenarioType = (req as any).scenarioType;
      await this.hookManager.execute("onRouteDecision", hookCtx);

    } catch (error: any) {
      this.logger.debug(`MiddlewareOrchestrator onPostRoute error: ${error.message}`);
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
        });
      }

      // Extract memories from conversation (fire-and-forget)
      await this.memoryBridge.extractFromConversation(
        req.body,
        responseBody,
        context
      );

      // Capture full context for HSE/SkillClaw (fire-and-forget)
      const usage = responseBody?.usage || {};
      const reasoningCtx = checkHallucination(
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        responseBody,
        (req as any)._httpStatus || 200,
        (req as any).provider
      );
      this.contextCapture.capture({
        sessionId: context.sessionId,
        agentType: (req as any).gatewayAgentName || detectAgentFromReq(req),
        modelTier: (req as any).routeTier || 'unknown',
        provider: (req as any).provider || 'unknown',
        modelId: (req as any).model || 'unknown',
        tokenCount: (req as any).tokenCount,
        requestBody: req.body,
        responseBody,
        usage,
        startTime: (req as any)._startTime,
        endTime: Date.now(),
        scenarioType: (req as any).scenarioType || 'unknown',
        hallucinationRisk: reasoningCtx.hallucinationRisk,
        cacheHit: !!(req as any)._cacheHit,
        ragEnriched: !!(req as any)._ragEnriched,
      }).catch(() => {});

      // Log hallucination warnings
      if (reasoningCtx.hallucinationRisk > 0.5) {
        this.logger?.warn(
          `Hallucination risk=${reasoningCtx.hallucinationRisk.toFixed(2)} ` +
          `flags=[${reasoningCtx.flags.join(',')}] ` +
          `session=${context.sessionId}`
        );
      }

      // Execute onResponse hooks
      const hookCtx = this.hookManager.createContext(req);
      hookCtx.responseBody = responseBody;
      await this.hookManager.execute("onResponse", hookCtx);

      // Update provider health based on this response
      if (this.healthMonitor && (req as any).provider) {
        this.healthMonitor.checkProvider((req as any).provider);
      }

    } catch (error: any) {
      this.logger.debug(`MiddlewareOrchestrator onPostResponse error: ${error.message}`);
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
    } catch {}
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
    } catch {}
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
  } {
    return {
      cache: this.semanticCache.getStats(),
      memory: { pending: (this.memoryBridge as any).pendingMemories?.length || 0 },
      context: this.contextCapture.getStats(),
      hooks: this.hookManager.getSummary(),
      health: this.healthMonitor?.getSummary() || [],
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
  } catch {
    return 'unknown';
  }
}
