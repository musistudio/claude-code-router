/**
 * MemoryBridge - Mem0 记忆桥接中间件
 *
 * Bridges proxy_local (CCR) request/response data with Mem0 persistent memory.
 * Enables cross-session memory for Claude Code agents.
 *
 * Architecture:
 *   onResponse hook: Extract decisions, patterns, errors → write to Mem0
 *   onRequest hook: Retrieve relevant memories → inject into system prompt
 *   onSessionEnd hook: Consolidate session memories
 *
 * Graceful degradation: All Mem0 operations are fire-and-forget.
 * Mem0 unavailability never blocks the request pipeline.
 */
import { EventEmitter } from "events";

export interface MemoryConfig {
  enabled: boolean;
  endpoint?: string; // Mem0 API endpoint (http://127.0.0.1:8000)
  apiKey?: string; // Mem0 API key
  userPrefix: string; // Prefix for Mem0 user_id (default: "pineapple")
  maxMemoriesPerRequest: number; // Max memories to retrieve per request
  extractionEnabled: boolean; // Auto-extract memories from conversations
  consolidationInterval: number; // Consolidate sessions every N requests
}

const DEFAULT_CONFIG: MemoryConfig = {
  enabled: false,
  userPrefix: "pineapple",
  maxMemoriesPerRequest: 5,
  extractionEnabled: true,
  consolidationInterval: 50,
};

interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, any>;
  created_at: string;
}

export class MemoryBridge extends EventEmitter {
  private config: MemoryConfig;
  private enabled = false;
  private requestCount = 0;
  private pendingMemories: any[] = [];

  constructor(config: Partial<MemoryConfig> = {}, private logger?: any) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = this.config.enabled;
  }

  /**
   * Retrieve relevant memories for the current request context.
   * Returns array of memory entries, or empty array if Mem0 is unavailable.
   */
  async retrieve(context: {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
    query?: string;
  }): Promise<MemoryEntry[]> {
    if (!this.enabled || !this.config.endpoint) return [];

    try {
      const userId = this.buildUserId(context.sessionId);
      const query = context.query || this.buildQuery(context);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.config.endpoint}/v2/memories/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          user_id: userId,
          query,
          limit: this.config.maxMemoriesPerRequest,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return [];

      const data = await response.json();
      const memories = data.results || data.memories || [];

      if (memories.length > 0) {
        this.logger?.info(
          `MemoryBridge: retrieved ${memories.length} memories for user=${userId}`
        );
        this.emit("memory:retrieved", {
          userId,
          count: memories.length,
        });
      }

      return memories;
    } catch (error: any) {
      this.logger?.warn(`MemoryBridge retrieve error: ${error.message}`);
      return [];
    }
  }

  /**
   * Store a memory from the current conversation.
   * Fire-and-forget - never blocks the request.
   */
  async store(memory: {
    sessionId?: string;
    agentName?: string;
    content: string;
    category?: string; // decision, pattern, error, insight, etc.
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.enabled) return;

    this.pendingMemories.push({
      ...memory,
      timestamp: new Date().toISOString(),
    });

    // Batch write every N memories
    if (this.pendingMemories.length >= 5) {
      await this.flushPending();
    }
  }

  /**
   * Extract key memories from a completed request/response cycle.
   * Called from onResponse hook in the CCR.
   */
  async extractFromConversation(requestBody: any, responseBody: any, context: {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
  }): Promise<void> {
    if (!this.enabled || !this.config.extractionEnabled) return;

    try {
      const extractions: any[] = [];

      // Extract user decisions (from assistant responses with tool calls)
      if (responseBody?.content) {
        const content = Array.isArray(responseBody.content)
          ? responseBody.content.map((c: any) => c.text || "").join("\n")
          : responseBody.content;

        // Simple pattern extraction
        extractions.push(
          ...this.extractPatterns(content, context)
        );
      }

      // Extract tool usage patterns
      if (requestBody?.messages) {
        const toolCalls = this.extractToolCalls(requestBody.messages);
        if (toolCalls.length > 0) {
          extractions.push({
            content: `Used tools: ${toolCalls.map((t) => t.name).join(", ")}`,
            category: "tool_usage",
            metadata: { tools: toolCalls },
          });
        }
      }

      // Store each extraction
      for (const extraction of extractions) {
        await this.store({
          sessionId: context.sessionId,
          agentName: context.agentName,
          content: extraction.content,
          category: extraction.category,
          metadata: extraction.metadata,
        });
      }
    } catch (error: any) {
      this.logger?.warn(`MemoryBridge extract error: ${error.message}`);
    }
  }

  /**
   * Called when a session ends to consolidate memories.
   */
  async onSessionEnd(sessionId: string): Promise<void> {
    if (!this.enabled) return;

    await this.flushPending();
    this.logger?.info(`MemoryBridge: session ended for ${sessionId}`);

    this.emit("session:ended", { sessionId });
  }

  /**
   * Build enriched system prompt with relevant memories.
   */
  async enrichSystemPrompt(system: any, context: {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
  }): Promise<any> {
    if (!this.enabled) return system;

    const memories = await this.retrieve(context);
    if (memories.length === 0) return system;

    const memorySection = [
      "\n<relevant_memories>",
      ...memories.map(
        (m, i) => `[${i + 1}] ${m.content}`
      ),
      "</relevant_memories>",
    ].join("\n");

    // Inject into system prompt
    if (typeof system === "string") {
      return system + memorySection;
    }

    if (Array.isArray(system)) {
      return [...system, { type: "text", text: memorySection }];
    }

    return system;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildUserId(sessionId?: string): string {
    const base = this.config.userPrefix;
    return sessionId ? `${base}_${sessionId}` : base;
  }

  private buildQuery(context: any): string {
    const parts: string[] = [];
    if (context.agentName) parts.push(context.agentName);
    if (context.taskType) parts.push(context.taskType);
    return parts.join(" ") || "recent activity";
  }

  private async flushPending(): Promise<void> {
    if (this.pendingMemories.length === 0 || !this.config.endpoint) return;

    const batch = [...this.pendingMemories];
    this.pendingMemories = [];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.endpoint}/v2/memories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          messages: batch.map((m) => ({
            role: "user",
            content: `[${m.category || "general"}] ${m.content}`,
          })),
          user_id: this.buildUserId(batch[0]?.sessionId),
          metadata: batch[0]?.metadata || {},
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        this.logger?.info(`MemoryBridge: flushed ${batch.length} memories`);
        this.emit("memory:flushed", { count: batch.length });
      }
    } catch (error: any) {
      this.logger?.warn(`MemoryBridge flush error: ${error.message}`);
      // Re-queue on failure
      this.pendingMemories = [...batch, ...this.pendingMemories].slice(0, 100);
    }
  }

  private extractPatterns(
    text: string,
    context: any
  ): Array<{ content: string; category: string; metadata: any }> {
    const patterns: Array<{ content: string; category: string; metadata: any }> = [];

    // Decision patterns
    const decisionMatches = text.match(/(?:decided|chose|selected|opted)\s+(?:to\s+)?([\w\s]+?)(?:\.|$)/gi);
    if (decisionMatches) {
      for (const match of decisionMatches.slice(0, 3)) {
        patterns.push({
          content: match.trim(),
          category: "decision",
          metadata: { agent: context.agentName },
        });
      }
    }

    // Error patterns
    const errorMatches = text.match(/(?:error|failed|exception|cannot|unable)\s+(?:to\s+)?([\w\s]+?)(?:\.|$)/gi);
    if (errorMatches) {
      for (const match of errorMatches.slice(0, 2)) {
        patterns.push({
          content: match.trim(),
          category: "error_pattern",
          metadata: { agent: context.agentName },
        });
      }
    }

    return patterns;
  }

  private extractToolCalls(messages: any[]): Array<{ name: string; count: number }> {
    const toolCount: Record<string, number> = {};

    for (const msg of messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
      for (const block of msg.content) {
        if (block.type === "tool_use") {
          toolCount[block.name] = (toolCount[block.name] || 0) + 1;
        }
      }
    }

    return Object.entries(toolCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }
}
