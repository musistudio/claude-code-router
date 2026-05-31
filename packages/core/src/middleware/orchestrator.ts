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
import { checkHallucination, analyzeReasoning } from "../engines/reasoning-engine";
import type { ReasoningContext } from "../engines/reasoning-engine";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, label: string, logger?: any): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        logger?.warn(`MiddlewareOrchestrator: ${label} timed out after ${ms}ms`);
        resolve(fallback);
      }, ms)
    ),
  ]);
}

export interface MiddlewareConfig {
  semanticCache: Partial<CacheConfig>;
  memoryBridge: Partial<MemoryConfig>;
  ragEnricher: Partial<RAGConfig>;
  contextCapture: Partial<CaptureConfig>;
  reasoningCache: Partial<ReasoningCacheConfig>;
}

export class MiddlewareOrchestrator {
  public hookManager: HookManager;
  public semanticCache: SemanticCache;
  public memoryBridge: MemoryBridge;
  public ragEnricher: RAGEnricher;
  public contextCapture: ContextCaptureEngine;
  public reasoningCache: ReasoningCache;
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
    this.reasoningCache = new ReasoningCache(
      middlewareConfig.reasoningCache || {},
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
      reasoningCache: {
        enabled: this.configService.get("REASONING_CACHE_ENABLED") !== false,
        postgresConnectionString: this.configService.get("PG_CONNECTION_STRING"),
        maxChainLength: this.configService.get("REASONING_CACHE_MAX_CHAIN_LENGTH") || 8000,
        maxResults: this.configService.get("REASONING_CACHE_MAX_RESULTS") || 3,
        similarityThreshold: this.configService.get("REASONING_CACHE_THRESHOLD") || 0.7,
        ttlMs: this.configService.get("REASONING_CACHE_TTL_MS") || 3600000,
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
    await this.reasoningCache.cleanup();
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

      // Check semantic cache (100ms budget)
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
      }).catch((err) => {
        this.logger?.warn(`Context capture failed: ${err?.message}`);
      });

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

      // Execute onResponse hooks
      const hookCtx = this.hookManager.createContext(req);
      hookCtx.responseBody = responseBody;
      await this.hookManager.execute("onResponse", hookCtx);

      // Update provider health based on this response
      if (this.healthMonitor && (req as any).provider) {
        this.healthMonitor.checkProvider((req as any).provider);
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
