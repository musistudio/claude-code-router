/**
 * RAGEnricher - RAG 上下文注入中间件
 *
 * Enriches outgoing requests with relevant context retrieved from:
 *   - Local knowledge base (pineaple Memory MCP / ClawMem / Claude-Mem)
 *   - Project files (ARCHITECTURE.md, CLAUDE.md, AGENTS.md)
 *   - Session history patterns
 *
 * The enrichment is added as additional system prompt content.
 * Designed to be lightweight (< 200ms overhead) and non-blocking.
 *
 * Design: Graceful degradation. If any enrichment source fails,
 * the request proceeds without that enrichment.
 */
import { EventEmitter } from "events";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export interface RAGConfig {
  enabled: boolean;
  projectRoot?: string; // Pineapple project root path
  maxEnrichmentTokens: number; // Maximum tokens to add (to not blow context)
  sources: {
    projectDocs: boolean; // Read AGENTS.md, CLAUDE.md, ARCHITECTURE.md
    memoryMCP: boolean; // Query Memory MCP
    clawMem: boolean; // Query ClawMem
    recentSessions: boolean; // Load recent session summaries
    codeGraph: boolean; // Query code graph context
  };
  memoryEndpoint?: string; // Memory MCP endpoint
  clawMemEndpoint?: string; // ClawMem endpoint
}

const DEFAULT_CONFIG: RAGConfig = {
  enabled: true,
  maxEnrichmentTokens: 2000,
  sources: {
    projectDocs: true,
    memoryMCP: false,
    clawMem: false,
    recentSessions: false,
    codeGraph: false,
  },
};

interface EnrichmentResult {
  source: string;
  content: string;
  relevance: number; // 0-1
  tokenCount: number;
}

export class RAGEnricher extends EventEmitter {
  private config: RAGConfig;
  private projectDocCache: string | null = null;
  private projectDocCacheTime = 0;
  private projectDocCacheTTL = 300000; // 5 minutes

  constructor(config: Partial<RAGConfig> = {}, private logger?: any) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enrich a system prompt with relevant context.
   * Returns the enriched system prompt (or original if enrichment fails).
   */
  async enrich(system: any, context: {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
    query?: string;
    recentFiles?: string[];
  }): Promise<{
    system: any;
    enrichments: EnrichmentResult[];
    totalTokens: number;
  }> {
    if (!this.config.enabled) {
      return { system, enrichments: [], totalTokens: 0 };
    }

    const enrichments: EnrichmentResult[] = [];
    let tokenBudget = this.config.maxEnrichmentTokens;

    // 1. Project documentation
    if (this.config.sources.projectDocs) {
      const docs = await this.getProjectDocs();
      if (docs && tokenBudget > 0) {
        const truncated = this.truncateToTokens(docs, tokenBudget);
        enrichments.push({
          source: "project_docs",
          content: truncated,
          relevance: 0.8,
          tokenCount: this.estimateTokens(truncated),
        });
        tokenBudget -= this.estimateTokens(truncated);
      }
    }

    // 2. Query Memory MCP
    if (this.config.sources.memoryMCP && tokenBudget > 100) {
      const memories = await this.queryMemoryMCP(context);
      if (memories && tokenBudget > 0) {
        const truncated = this.truncateToTokens(memories, tokenBudget);
        enrichments.push({
          source: "memory_mcp",
          content: truncated,
          relevance: 0.6,
          tokenCount: this.estimateTokens(truncated),
        });
        tokenBudget -= this.estimateTokens(truncated);
      }
    }

    // 3. Query ClawMem
    if (this.config.sources.clawMem && tokenBudget > 100) {
      const clawFindings = await this.queryClawMem(context);
      if (clawFindings && tokenBudget > 0) {
        const truncated = this.truncateToTokens(clawFindings, tokenBudget);
        enrichments.push({
          source: "clawmem",
          content: truncated,
          relevance: 0.5,
          tokenCount: this.estimateTokens(truncated),
        });
        tokenBudget -= this.estimateTokens(truncated);
      }
    }

    // Build enriched system prompt
    if (enrichments.length > 0) {
      const enrichedSystem = this.buildEnrichedSystem(
        system,
        enrichments
      );

      this.logger?.info(
        `RAGEnricher: added ${enrichments.length} enrichments (${this.estimateTokens(JSON.stringify(enrichments))} tokens)`
      );
      this.emit("rag:enriched", {
        enrichments: enrichments.map((e) => ({ source: e.source, tokens: e.tokenCount })),
      });

      return {
        system: enrichedSystem,
        enrichments,
        totalTokens: this.estimateTokens(JSON.stringify(enrichments)),
      };
    }

    return { system, enrichments: [], totalTokens: 0 };
  }

  // ==========================================================================
  // Source: Project Documentation
  // ==========================================================================

  private async getProjectDocs(): Promise<string | null> {
    const projectRoot = this.config.projectRoot;
    if (!projectRoot) return null;

    // Use cache if fresh
    if (
      this.projectDocCache &&
      Date.now() - this.projectDocCacheTime < this.projectDocCacheTTL
    ) {
      return this.projectDocCache;
    }

    try {
      const docFiles = ["AGENTS.md", "CLAUDE.md", "ARCHITECTURE.md"];
      const contents: string[] = [];

      for (const file of docFiles) {
        const path = join(projectRoot, file);
        if (existsSync(path)) {
          const content = await readFile(path, "utf-8");
          // Extract key sections (first 200 lines per doc)
          const lines = content.split("\n").slice(0, 200);
          contents.push(`## ${file}\n${lines.join("\n")}`);
        }
      }

      this.projectDocCache = contents.join("\n\n");
      this.projectDocCacheTime = Date.now();
      return this.projectDocCache;
    } catch (error: any) {
      this.logger?.debug(`RAGEnricher project docs error: ${error.message}`);
      return null;
    }
  }

  // ==========================================================================
  // Source: Memory MCP
  // ==========================================================================

  private async queryMemoryMCP(context: any): Promise<string | null> {
    if (!this.config.memoryEndpoint) return null;

    try {
      const query = context.query || context.taskType || "recent";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(this.config.memoryEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "search_memory",
            arguments: { query, limit: 5 },
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      if (data.result?.content) {
        return data.result.content
          .map((c: any) => c.text || "")
          .join("\n");
      }
      return null;
    } catch (e: any) {
      this.logger?.warn(`RAGEnricher memory MCP query failed: ${e?.message}`);
      return null;
    }
  }

  // ==========================================================================
  // Source: ClawMem
  // ==========================================================================

  private async queryClawMem(context: any): Promise<string | null> {
    if (!this.config.clawMemEndpoint) return null;

    try {
      const query = context.query || context.taskType || "development";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.config.clawMemEndpoint}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 3 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      return data.results?.join("\n") || null;
    } catch (e: any) {
      this.logger?.warn(`RAGEnricher ClawMem query failed: ${e?.message}`);
      return null;
    }
  }

  // ==========================================================================
  // System Prompt Building
  // ==========================================================================

  private buildEnrichedSystem(
    system: any,
    enrichments: EnrichmentResult[]
  ): any {
    const ragSection = [
      "\n<rag_context>",
      "The following context is available to assist with this task:",
      ...enrichments.map(
        (e) =>
          `<context source="${e.source}" relevance="${e.relevance}">\n${e.content}\n</context>`
      ),
      "</rag_context>",
    ].join("\n");

    if (typeof system === "string") {
      return system + ragSection;
    }

    if (Array.isArray(system)) {
      return [...system, { type: "text", text: ragSection }];
    }

    // If system is an object/text block
    if (system && system.text) {
      return { ...system, text: system.text + ragSection };
    }

    return ragSection;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private truncateToTokens(text: string, maxTokens: number): string {
    // Rough estimate: 1 token ≈ 4 characters for English text
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;

    // Try to break at a sentence boundary
    const truncated = text.slice(0, maxChars);
    const lastPeriod = truncated.lastIndexOf(".");
    const lastNewline = truncated.lastIndexOf("\n");

    const breakPoint = Math.max(lastPeriod, lastNewline);
    if (breakPoint > maxChars * 0.5) {
      return truncated.slice(0, breakPoint + 1) + "\n[truncated]";
    }

    return truncated + "\n[truncated]";
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 chars
    return Math.ceil(text.length / 4);
  }
}
