/**
 * MemoryBridge - Local JSONL 记忆桥接中间件
 *
 * Bridges proxy_local (CCR) request/response data with local JSONL persistent memory.
 * Enables cross-session memory for Claude Code agents.
 *
 * Architecture:
 *   onResponse hook: Extract decisions, patterns, errors → write to JSONL
 *   onRequest hook: Retrieve relevant memories → inject into system prompt
 *   onSessionEnd hook: Consolidate session memories
 *
 * Graceful degradation: All file operations are fire-and-forget.
 * File I/O errors never block the request pipeline.
 */
import { EventEmitter } from "events";
import { readFile, appendFile, mkdir } from "fs/promises";
import { dirname } from "path";

export interface MemoryConfig {
  enabled: boolean;
  storagePath?: string;
  maxFileSize?: number;
  userPrefix: string;
  maxMemoriesPerRequest: number;
  extractionEnabled: boolean;
  consolidationInterval: number;
}

const DEFAULT_CONFIG: MemoryConfig = {
  enabled: false,
  storagePath: "./dev/memories.jsonl",
  maxFileSize: 10 * 1024 * 1024,
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
  private storagePath: string;
  private cachedMemories: any[] = [];
  private lastReadTime = 0;
  private readonly CACHE_TTL = 5000;

  constructor(config: Partial<MemoryConfig> = {}, private logger?: any) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = this.config.enabled;
    this.storagePath = this.config.storagePath || "./dev/memories.jsonl";
  }

  async retrieve(context: {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
    query?: string;
  }): Promise<MemoryEntry[]> {
    if (!this.enabled) return [];

    try {
      const now = Date.now();
      if (now - this.lastReadTime > this.CACHE_TTL) {
        const content = await readFile(this.storagePath, "utf-8").catch(() => "");
        this.cachedMemories = content.trim().split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
        this.lastReadTime = now;
      }

      const userId = this.buildUserId(context.sessionId);
      const query = context.query || [context.agentName, context.taskType].filter(Boolean).join(" ");
      const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

      if (keywords.length === 0) return this.cachedMemories.slice(0, this.config.maxMemoriesPerRequest);

      const scored = this.cachedMemories
        .filter(m => m.user_id === userId || (m.user_id && m.user_id.startsWith("pineapple_")))
        .map(m => {
          const text = (m.content || "").toLowerCase();
          const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
          return { ...m, score };
        })
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const results = scored.slice(0, this.config.maxMemoriesPerRequest);

      if (results.length > 0) {
        this.logger?.info(
          `MemoryBridge: retrieved ${results.length} memories for user=${userId}`
        );
        this.emit("memory:retrieved", {
          userId,
          count: results.length,
        });
      }

      return results;
    } catch (error: any) {
      this.logger?.warn(`MemoryBridge retrieve error: ${error.message}`);
      return [];
    }
  }

  async store(memory: {
    sessionId?: string;
    agentName?: string;
    content: string;
    category?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.enabled) return;

    this.pendingMemories.push({
      ...memory,
      timestamp: new Date().toISOString(),
    });

    if (this.pendingMemories.length >= 5) {
      await this.flushPending();
    }
  }

  async extractFromConversation(requestBody: any, responseBody: any, context: {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
  }): Promise<void> {
    if (!this.enabled || !this.config.extractionEnabled) return;

    try {
      const extractions: any[] = [];

      if (responseBody?.content) {
        const content = Array.isArray(responseBody.content)
          ? responseBody.content.map((c: any) => c.text || "").join("\n")
          : responseBody.content;

        extractions.push(
          ...this.extractPatterns(content, context)
        );
      }

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

  async onSessionEnd(sessionId: string): Promise<void> {
    if (!this.enabled) return;

    await this.flushPending();
    this.logger?.info(`MemoryBridge: session ended for ${sessionId}`);

    this.emit("session:ended", { sessionId });
  }

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

  private async flushPending(): Promise<void> {
    if (this.pendingMemories.length === 0) return;

    const batch = this.pendingMemories.splice(0, this.pendingMemories.length);

    try {
      const dir = dirname(this.storagePath);
      await mkdir(dir, { recursive: true });
      const lines = batch.map(m => JSON.stringify({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        user_id: m.user_id || this.buildUserId(m.sessionId),
        content: m.content,
        category: m.category,
        metadata: m.metadata || {},
        created_at: new Date().toISOString(),
      })).join("\n") + "\n";
      await appendFile(this.storagePath, lines, "utf-8");

      this.logger?.info(`MemoryBridge: flushed ${batch.length} memories`);
      this.emit("memory:flushed", { count: batch.length });
    } catch (error: any) {
      this.logger?.warn(`MemoryBridge flush error: ${error.message}`);
      if (this.pendingMemories.length < 200) {
        this.pendingMemories.unshift(...batch);
      }
    }
  }

  private extractPatterns(
    text: string,
    context: any
  ): Array<{ content: string; category: string; metadata: any }> {
    const patterns: Array<{ content: string; category: string; metadata: any }> = [];

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
