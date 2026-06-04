/**
 * SessionBridge - Claude Code session protocol bridging.
 *
 * Detects Claude Code internal mechanisms:
 *   1. Compaction markers (compact.rs output with 4 recent msgs + 10K token limit)
 *   2. Tool_use protocol patterns (subagent spawning, tool_result chains)
 *   3. Session ID tracking across JSONL storage
 *   4. Thinking block patterns (redacted_thinking blocks from extended thinking)
 *
 * Coordinates with sliding-window middleware to:
 *   - Preserve critical context across compaction events
 *   - Maintain session continuity markers
 *   - Track tool call chains across turns
 *
 * Integration: Used by orchestrator.onPostResponse() alongside ContextCapture.
 */

export interface SessionState {
  sessionId: string;
  turnCount: number;
  lastCompactionTurn: number;
  activeToolChains: Map<string, ToolChain>;
  preservedContext: PreservedContext[];
  thinkingBudgetUsed: number;
  thinkingBudgetTotal: number;
  subagentSpawns: SubagentSpawn[];
  createdAt: number;
  lastActivityAt: number;
}

export interface ToolChain {
  chainId: string;
  toolName: string;
  startedAtTurn: number;
  status: "active" | "completed" | "failed";
  steps: ToolChainStep[];
}

export interface ToolChainStep {
  turn: number;
  toolUseId: string;
  toolName: string;
  input: Record<string, any>;
  output?: string;
  isError?: boolean;
  latencyMs?: number;
}

export interface PreservedContext {
  key: string;
  value: string;
  priority: number;
  preservedAt: number;
  source: "user" | "system" | "tool_result";
}

export interface SubagentSpawn {
  turn: number;
  parentToolId: string;
  subagentType: string;
  task: string;
  status: "running" | "completed" | "failed";
}

export interface CompactionEvent {
  sessionId: string;
  turn: number;
  messagesBefore: number;
  messagesAfter: number;
  tokensPreserved: number;
  detectedAt: number;
}

interface BridgeConfig {
  maxPreservedContexts: number;
  maxToolChainHistory: number;
  maxSubagentHistory: number;
  compactionDetectionWindow: number;
  sessionTimeoutMs: number;
}

const DEFAULT_CONFIG: BridgeConfig = {
  maxPreservedContexts: 50,
  maxToolChainHistory: 100,
  maxSubagentHistory: 50,
  compactionDetectionWindow: 5,
  sessionTimeoutMs: 30 * 60 * 1000,
};

export class SessionBridge {
  private config: BridgeConfig;
  private sessions: Map<string, SessionState> = new Map();
  private compactionEvents: CompactionEvent[] = [];
  private logger?: any;

  constructor(config: Partial<BridgeConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  getOrCreateSession(sessionId: string): SessionState {
    let session = this.sessions.get(sessionId);
    if (!session || Date.now() - session.lastActivityAt > this.config.sessionTimeoutMs) {
      session = {
        sessionId,
        turnCount: 0,
        lastCompactionTurn: -1,
        activeToolChains: new Map(),
        preservedContext: [],
        thinkingBudgetUsed: 0,
        thinkingBudgetTotal: 0,
        subagentSpawns: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }
    session.lastActivityAt = Date.now();
    return session;
  }

  processRequest(sessionId: string, requestBody: any): {
    isCompaction: boolean;
    preservedContextToInject: PreservedContext[];
    activeChains: ToolChain[];
  } {
    const session = this.getOrCreateSession(sessionId);
    session.turnCount++;

    const isCompaction = this.detectCompaction(session, requestBody);
    const preservedContextToInject = isCompaction
      ? session.preservedContext.slice(0, this.config.maxPreservedContexts)
      : [];

    this.extractPreservedContext(session, requestBody);
    this.trackToolUseInRequest(session, requestBody);
    this.trackSubagentSpawns(session, requestBody);
    this.trackThinkingBudget(session, requestBody);

    return {
      isCompaction,
      preservedContextToInject,
      activeChains: Array.from(session.activeToolChains.values())
        .filter(c => c.status === "active"),
    };
  }

  processResponse(sessionId: string, responseBody: any): {
    toolCalls: ToolChainStep[];
    thinkingBlocks: number;
    compactionRisk: number;
  } {
    const session = this.getOrCreateSession(sessionId);

    const toolCalls = this.trackToolUseInResponse(session, responseBody);
    const thinkingBlocks = this.countThinkingBlocks(responseBody);
    const compactionRisk = this.assessCompactionRisk(session);

    return { toolCalls, thinkingBlocks, compactionRisk };
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionStats(): {
    activeSessions: number;
    totalCompactions: number;
    avgToolChainLength: number;
    avgPreservedContexts: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const activeChains = sessions.flatMap(s => Array.from(s.activeToolChains.values()));
    const avgChainLen = activeChains.length > 0
      ? activeChains.reduce((sum, c) => sum + c.steps.length, 0) / activeChains.length
      : 0;

    return {
      activeSessions: sessions.length,
      totalCompactions: this.compactionEvents.length,
      avgToolChainLength: Math.round(avgChainLen * 10) / 10,
      avgPreservedContexts: sessions.length > 0
        ? Math.round(sessions.reduce((s, sess) => s + sess.preservedContext.length, 0) / sessions.length * 10) / 10
        : 0,
    };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > this.config.sessionTimeoutMs) {
        this.sessions.delete(id);
      }
    }
  }

  private detectCompaction(session: SessionState, body: any): boolean {
    if (!body?.messages) return false;

    const messages = body.messages as any[];
    if (messages.length < 2 || messages.length > 6) return false;

    const prevCount = session.turnCount;
    const window = this.config.compactionDetectionWindow;

    if (prevCount > window * 2) {
      const hasSystem = messages[0]?.role === "system";
      const systemText = typeof messages[0]?.content === "string"
        ? messages[0].content : "";
      const hasCompactionMarker = systemText.includes("[compacted]") ||
        systemText.includes("<compaction>") ||
        systemText.includes("Context window compacted");
      const assistantMsgs = messages.filter((m: any) => m.role === "assistant").length;
      const userMsgs = messages.filter((m: any) => m.role === "user").length;

      if (hasSystem && (hasCompactionMarker || (userMsgs <= 2 && assistantMsgs === 0))) {
        const event: CompactionEvent = {
          sessionId: session.sessionId,
          turn: session.turnCount,
          messagesBefore: prevCount,
          messagesAfter: messages.length,
          tokensPreserved: session.preservedContext.length,
          detectedAt: Date.now(),
        };
        this.compactionEvents.push(event);
        session.lastCompactionTurn = session.turnCount;
        this.logger?.info(`SessionBridge: compaction detected for ${session.sessionId} at turn ${session.turnCount}`);
        return true;
      }
    }
    return false;
  }

  private extractPreservedContext(session: SessionState, body: any): void {
    if (!body?.messages) return;

    const messages = body.messages as any[];

    for (const msg of messages) {
      if (msg.role === "user" && typeof msg.content === "string") {
        const content = msg.content as string;
        const patterns: Array<{ regex: RegExp; source: PreservedContext["source"] }> = [
          { regex: /(?:goal|objective|task|target)\s*[:：]\s*(.{10,200})/i, source: "user" },
          { regex: /(?:constraint|requirement|must|shall)\s*[:：]\s*(.{10,200})/i, source: "user" },
          { regex: /(?:architecture|design|pattern)\s*[:：]\s*(.{10,200})/i, source: "user" },
        ];

        for (const { regex, source } of patterns) {
          const match = content.match(regex);
          if (match) {
            this.addPreservedContext(session, {
              key: `${source}-${Date.now()}-${session.preservedContext.length}`,
              value: match[1].trim(),
              priority: source === "user" ? 10 : 5,
              preservedAt: Date.now(),
              source,
            });
          }
        }
      }

      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_result" && typeof block.content === "string") {
            const text = block.content as string;
            if (text.length > 100 && text.length < 5000) {
              const hasKeyInfo = /(?:error|fail|success|result|output|config)/i.test(text);
              if (hasKeyInfo) {
                this.addPreservedContext(session, {
                  key: `tool-result-${block.tool_use_id || Date.now()}`,
                  value: text.slice(0, 500),
                  priority: 3,
                  preservedAt: Date.now(),
                  source: "tool_result",
                });
              }
            }
          }
        }
      }
    }
  }

  private addPreservedContext(session: SessionState, ctx: PreservedContext): void {
    const existing = session.preservedContext.findIndex(c =>
      c.value === ctx.value || (c.key === ctx.key && ctx.key.startsWith("tool-result"))
    );
    if (existing >= 0) {
      session.preservedContext[existing] = ctx;
    } else {
      session.preservedContext.push(ctx);
    }

    session.preservedContext.sort((a, b) => b.priority - a.priority);
    if (session.preservedContext.length > this.config.maxPreservedContexts) {
      session.preservedContext = session.preservedContext.slice(0, this.config.maxPreservedContexts);
    }
  }

  private trackToolUseInRequest(session: SessionState, body: any): void {
    if (!body?.messages) return;
    const messages = body.messages as any[];

    for (const msg of messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_result") {
            for (const [chainId, chain] of session.activeToolChains) {
              const pendingStep = chain.steps.find(
                s => s.toolUseId === block.tool_use_id && !s.output
              );
              if (pendingStep) {
                pendingStep.output = typeof block.content === "string"
                  ? block.content.slice(0, 1000)
                  : JSON.stringify(block.content).slice(0, 1000);
                pendingStep.isError = block.is_error || false;
              }
            }
          }
        }
      }
    }

    for (const [chainId, chain] of session.activeToolChains) {
      if (chain.steps.every(s => s.output !== undefined)) {
        chain.status = chain.steps.some(s => s.isError) ? "failed" : "completed";
      }
    }
  }

  private trackToolUseInResponse(session: SessionState, body: any): ToolChainStep[] {
    if (!body?.content || !Array.isArray(body.content)) return [];

    const newSteps: ToolChainStep[] = [];

    for (const block of body.content) {
      if (block.type === "tool_use") {
        const toolName = block.name || "unknown";
        const toolId = block.id || "";

        let chain = this.findOrCreateChain(session, toolName, toolId);

        const step: ToolChainStep = {
          turn: session.turnCount,
          toolUseId: toolId,
          toolName,
          input: block.input || {},
        };
        chain.steps.push(step);
        newSteps.push(step);

        if (chain.steps.length > this.config.maxToolChainHistory) {
          chain.steps = chain.steps.slice(-this.config.maxToolChainHistory);
        }
      }
    }

    return newSteps;
  }

  private findOrCreateChain(session: SessionState, toolName: string, toolId: string): ToolChain {
    for (const [, chain] of session.activeToolChains) {
      if (chain.status === "active" && chain.toolName === toolName) {
        return chain;
      }
    }

    const chain: ToolChain = {
      chainId: `chain-${toolName}-${Date.now()}`,
      toolName,
      startedAtTurn: session.turnCount,
      status: "active",
      steps: [],
    };
    session.activeToolChains.set(chain.chainId, chain);

    if (session.activeToolChains.size > 20) {
      const oldest = Array.from(session.activeToolChains.entries())
        .filter(([, c]) => c.status !== "active")
        .sort(([, a], [, b]) => a.startedAtTurn - b.startedAtTurn);
      if (oldest.length > 0) {
        session.activeToolChains.delete(oldest[0][0]);
      }
    }

    return chain;
  }

  private trackSubagentSpawns(session: SessionState, body: any): void {
    if (!body?.messages) return;

    const lastMsg = (body.messages as any[]).at(-1);
    if (!lastMsg?.content) return;

    const text = typeof lastMsg.content === "string"
      ? lastMsg.content
      : Array.isArray(lastMsg.content)
        ? lastMsg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ")
        : "";

    if (text.includes("Task") || text.includes("subagent")) {
      const typeMatch = text.match(/(?:subagent_type|agent_type|type)\s*[:=]\s*["']?(\w+)/);
      if (typeMatch) {
        session.subagentSpawns.push({
          turn: session.turnCount,
          parentToolId: "",
          subagentType: typeMatch[1],
          task: text.slice(0, 200),
          status: "running",
        });

        if (session.subagentSpawns.length > this.config.maxSubagentHistory) {
          session.subagentSpawns = session.subagentSpawns.slice(-this.config.maxSubagentHistory);
        }
      }
    }
  }

  private trackThinkingBudget(session: SessionState, body: any): void {
    if (!body?.thinking) return;

    if (typeof body.thinking === "object") {
      session.thinkingBudgetTotal = body.thinking.budget_tokens || 0;
    }

    if (body.thinking?.type === "enabled" || body.thinking?.type === "auto") {
      const budget = body.thinking.budget_tokens || 10000;
      session.thinkingBudgetTotal = Math.max(session.thinkingBudgetTotal, budget);
    }
  }

  private countThinkingBlocks(body: any): number {
    if (!body?.content || !Array.isArray(body.content)) return 0;
    return body.content.filter(
      (c: any) => c.type === "thinking" || c.type === "redacted_thinking"
    ).length;
  }

  private assessCompactionRisk(session: SessionState): number {
    const turnsSinceCompaction = session.turnCount - session.lastCompactionTurn;
    if (turnsSinceCompaction < 5) return 0;

    const activeChains = Array.from(session.activeToolChains.values())
      .filter(c => c.status === "active").length;
    const preservedCount = session.preservedContext.length;

    let risk = 0;
    risk += Math.min(turnsSinceCompaction / 20, 1) * 0.4;
    risk += Math.min(preservedCount / this.config.maxPreservedContexts, 1) * 0.3;
    risk += Math.min(activeChains / 10, 1) * 0.3;

    return Math.round(risk * 100) / 100;
  }
}
