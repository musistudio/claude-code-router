/**
 * HookManager - Request/Response Hook 插件系统
 *
 * Allows registering hooks at various stages of the request lifecycle.
 * Hooks can inspect, modify, or short-circuit requests and responses.
 *
 * Lifecycle hooks:
 *   onRequest        - Before routing decision (can modify body)
 *   onRouteDecision  - After routing decision (can modify target model)
 *   onPreSend        - Before sending to upstream (can modify final request)
 *   onResponse       - After receiving from upstream (can modify response)
 *   onResponseSend   - Before sending response to Claude Code
 *   onError          - On any error in the pipeline
 *   onSessionStart   - When a new session is detected
 *   onSessionEnd     - When a session ends
 *   onCompact        - When compaction is detected
 *
 * Each hook receives a context object and can either:
 *   - Return void (pass-through, no modification)
 *   - Return a modified context (to alter request/response)
 *   - Return a Response (to short-circuit and return immediately)
 *   - Throw an error (which gets caught by onError hooks)
 */
import { EventEmitter } from "events";

export type HookPriority = "first" | "normal" | "last";

export interface HookContext {
  // Request info
  requestId: string;
  sessionId?: string;
  scenarioType?: string;
  provider?: string;
  model?: string;

  // Request data
  body: any;
  headers: Record<string, string>;

  // Response data (only available in onResponse hooks)
  response?: Response;
  responseBody?: any;
  responseHeaders?: Record<string, string>;

  // Timing
  startTime: number;
  routeTime?: number;
  sendTime?: number;
  responseTime?: number;

  // Metadata
  tokenCount?: number;
  cacheHit?: boolean;
  metadata: Record<string, any>;
}

export type HookHandler = (
  context: HookContext
) => Promise<HookContext | Response | void>;

interface HookRegistration {
  name: string;
  handler: HookHandler;
  priority: HookPriority;
}

export class HookManager extends EventEmitter {
  private hooks: Map<string, HookRegistration[]> = new Map();

  constructor(private logger?: any) {
    super();
    this.initializeHookStages();
  }

  private initializeHookStages(): void {
    const stages = [
      "onRequest",
      "onRouteDecision",
      "onPreSend",
      "onResponse",
      "onResponseSend",
      "onError",
      "onSessionStart",
      "onSessionEnd",
      "onCompact",
    ];
    for (const stage of stages) {
      this.hooks.set(stage, []);
    }
  }

  /**
   * Register a hook for a specific lifecycle stage.
   *
   * @param stage - Lifecycle stage name
   * @param name - Unique hook name (for removal)
   * @param handler - Hook callback
   * @param priority - Execution order: 'first', 'normal' (default), 'last'
   */
  register(
    stage: string,
    name: string,
    handler: HookHandler,
    priority: HookPriority = "normal"
  ): void {
    if (!this.hooks.has(stage)) {
      this.logger?.warn(`HookManager: unknown stage '${stage}', creating new`);
      this.hooks.set(stage, []);
    }

    // Remove existing hook with same name
    this.unregister(stage, name);

    const stageHooks = this.hooks.get(stage)!;
    stageHooks.push({ name, handler, priority });

    // Sort by priority: first → normal → last
    stageHooks.sort((a, b) => {
      const order: Record<HookPriority, number> = {
        first: 0,
        normal: 1,
        last: 2,
      };
      return order[a.priority] - order[b.priority];
    });

    this.logger?.debug(`HookManager: registered hook '${name}' on stage '${stage}'`);
    this.emit("hook:registered", { stage, name, priority });
  }

  /**
   * Unregister a hook.
   */
  unregister(stage: string, name: string): boolean {
    const stageHooks = this.hooks.get(stage);
    if (!stageHooks) return false;

    const idx = stageHooks.findIndex((h) => h.name === name);
    if (idx === -1) return false;

    stageHooks.splice(idx, 1);
    this.logger?.debug(`HookManager: unregistered hook '${name}' from stage '${stage}'`);
    this.emit("hook:unregistered", { stage, name });
    return true;
  }

  /**
   * Execute all hooks for a given stage.
   *
   * Hooks execute in priority order. If a hook returns a Response,
   * execution stops and that response is returned (short-circuit).
   * If a hook returns a modified HookContext, subsequent hooks receive
   * the modified context.
   *
   * @returns The final HookContext (possibly modified by hooks), or a Response
   */
  async execute(
    stage: string,
    context: HookContext
  ): Promise<HookContext | Response> {
    const stageHooks = this.hooks.get(stage);
    if (!stageHooks || stageHooks.length === 0) {
      return context;
    }

    let currentContext = { ...context };

    for (const hook of stageHooks) {
      try {
        const result = await hook.handler(currentContext);

        if (result instanceof Response) {
          // Short-circuit: hook returned a direct response
          this.logger?.info(
            `HookManager: stage '${stage}', hook '${hook.name}' short-circuited with response`
          );
          return result;
        }

        if (result && typeof result === "object" && "body" in result) {
          // Hook modified the context
          currentContext = result;
        }
        // result is void → pass-through, keep current context
      } catch (error: any) {
        this.logger?.error(
          `HookManager: stage '${stage}', hook '${hook.name}' failed: ${error.message}`
        );
        // Execute onError hooks
        try {
          await this.execute("onError", {
            ...currentContext,
            metadata: {
              ...currentContext.metadata,
              hookError: error.message,
              failedHook: hook.name,
              failedStage: stage,
            },
          });
        } catch {
          // onError hooks can fail too, just log
        }
        // Don't rethrow - continue with next hook
      }
    }

    return currentContext;
  }

  /**
   * Convenience method to create a HookContext from a Fastify request.
   */
  createContext(req: any): HookContext {
    const body = req.body || {};
    return {
      requestId: req.id || `req_${Date.now()}`,
      sessionId: (req as any).sessionId,
      scenarioType: (req as any).scenarioType,
      provider: (req as any).provider,
      model: (req as any).model,
      body: { ...body },
      headers: { ...(req.headers || {}) },
      startTime: Date.now(),
      tokenCount: (req as any).tokenCount,
      metadata: {},
    };
  }

  /**
   * Get all registered hook names for a stage.
   */
  getHooks(stage: string): string[] {
    const stageHooks = this.hooks.get(stage);
    return stageHooks ? stageHooks.map((h) => h.name) : [];
  }

  /**
   * Get all registered stages with hook counts.
   */
  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const [stage, hooks] of this.hooks.entries()) {
      summary[stage] = hooks.length;
    }
    return summary;
  }
}
