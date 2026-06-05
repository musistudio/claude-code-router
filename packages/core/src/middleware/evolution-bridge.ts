/**
 * EvolutionBridge - Evolution/SkillClaw 集成桥接模块
 *
 * 将 proxy_local 的请求/响应上下文桥接到 evolution HSE pipeline:
 *   1. 技能感知路由 — 检测请求中涉及的 skill，调整路由策略
 *   2. 上下文注入 — 从 evolution trace 数据注入相关 skill 上下文
 *   3. Trace 收集 — 将完整上下文发送到 evolution Hermes tracer
 *   4. GEP 反馈 — 从质量评分反哺 evolution GEP 验证引擎
 *
 * Data flow:
 *   proxy_local → EvolutionBridge → Hermes(trace) → SkillClaw(curate) → Evolver(validate)
 *
 * 与 RAGEnricher 配合使用，提供 skill-aware 的上下文增强。
 */

import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";

export interface EvolutionConfig {
  enabled: boolean;
  hermesEndpoint?: string;
  skillClawEndpoint?: string;
  evolutionRoot?: string;
  traceStoragePath: string;
  maxTraceBatchSize: number;
  flushIntervalMs: number;
  skillAwareRouting: boolean;
  contextInjection: boolean;
}

export interface SkillRef {
  name: string;
  category: string;
  version: string;
  confidence: number;
  source: "detected" | "inferred" | "config";
}

export interface EvolutionTrace {
  traceId: string;
  sessionId: string;
  turnNumber: number;
  timestamp: string;
  skills: SkillRef[];
  routingDecision: {
    provider: string;
    model: string;
    tier: string;
    scenarioType: string;
    routeReason: string;
  };
  quality: {
    hallucinationRisk: number;
    qualityScore: number;
    latencyMs: number;
  };
  context: {
    ragEnriched: boolean;
    memoryEnriched: boolean;
    cacheHit: boolean;
    preservedContexts: number;
    toolChainsActive: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  };
}

export interface SkillContext {
  skillName: string;
  category: string;
  relevantPatterns: string[];
  contextInjection: string;
  routingHints: {
    preferredTier: string;
    preferredModel: string;
    maxBudgetTokens: number;
  };
}

const DEFAULT_CONFIG: EvolutionConfig = {
  enabled: true,
  traceStoragePath: "./dev/evolution_traces.jsonl",
  maxTraceBatchSize: 50,
  flushIntervalMs: 30000,
  skillAwareRouting: true,
  contextInjection: true,
};

const KNOWN_SKILL_PATTERNS: Array<{
  pattern: RegExp;
  skillName: string;
  category: string;
  preferredTier: string;
  contextHint: string;
}> = [
  { pattern: /backtest|temporal.integrity|latency.simulation/i, skillName: "backtest-temporal-integrity", category: "quant", preferredTier: "pro", contextHint: "Backtest temporal integrity validation prevents future data leakage in strategy backtests." },
  { pattern: /strategy.?graph|graph.?compiler|compile.?plan/i, skillName: "strategygraph-compiler", category: "core", preferredTier: "pro", contextHint: "StrategyGraphCompiler compiles strategy graphs through deterministic passes: Parse → Resolve → TypeCheck → CapabilityCheck → CycleCheck → CausalityCheck → RiskBeforeExecutionCheck → LifecycleCheck → BudgetCheck → CompilePlan." },
  { pattern: /puzzle.?contract|puzzle.?package|port.?schema/i, skillName: "puzzle-contract-author", category: "core", preferredTier: "pro", contextHint: "PuzzleContract defines unit of composition: inputs, outputs, capabilities, side effects, resource budgets. PuzzleKind: data, feature, signal, sizing, risk, execution." },
  { pattern: /circuit.?breaker|retry|rate.?limit/i, skillName: "resilience-patterns", category: "infra", preferredTier: "flash", contextHint: "Standard resilience patterns: circuit breaker (closed/open/half-open), exponential backoff retry, token bucket rate limiting." },
  { pattern: /risk.?metric|VaR|CVaR|max.?drawdown|sharpe|sortino/i, skillName: "risk-metrics", category: "quant", preferredTier: "pro", contextHint: "Quantitative risk metrics: VaR (Value at Risk), CVaR (Conditional VaR), max drawdown, Sharpe ratio, Sortino ratio, calibration tests." },
  { pattern: /semantic.?cache|embedding|vector.?store|qdrant/i, skillName: "semantic-cache-embeddings", category: "infra", preferredTier: "flash", contextHint: "Semantic cache uses embedding cosine similarity (≥0.92 threshold) with L1 memory + L2 Redis layers." },
  { pattern: /gate.?system|quick.?gate|standard.?gate|evidence/i, skillName: "gate-evidence-runner", category: "core", preferredTier: "pro", contextHint: "GateSystem aggregates evidence (compiler + harness). QuickGate: compiler evidence only. StandardGate: compiler + harness. GateDecision: PENDING, PASS, FAIL, BLOCKED." },
  { pattern: /artifact.?digest|sha256|provenance|CAS/i, skillName: "artifact-digest", category: "core", preferredTier: "flash", contextHint: "ArtifactStore: canonical JSON with SHA-256 digest. Machine-readable JSON is authoritative, markdown is non-authoritative." },
  { pattern: /claw.?mem|memory.?layer|clawmem/i, skillName: "memory-layer-orchestrator", category: "infra", preferredTier: "flash", contextHint: "Two-layer memory: L2 (clawmem, deep retrieval) → L3 (Memory MCP, structured data). Session traces collected by Hermes." },
  { pattern: /reasoning.?mcp|sequential.?thinking|ultrabrain/i, skillName: "reasoning-mcp-usage", category: "infra", preferredTier: "pro", contextHint: "MCP reasoning servers: Sequential-Thinking for multi-step analysis, UltraBrain for structured engineering validation." },
  { pattern: /session.?bridge|compaction|sliding.?window/i, skillName: "session-protocol-bridge", category: "infra", preferredTier: "flash", contextHint: "SessionBridge detects Claude Code compaction events, preserves critical context across compaction, tracks tool chains across turns." },
  { pattern: /financial.?data|futures|margin|期货|合约/i, skillName: "financial-data-futures", category: "quant", preferredTier: "flash", contextHint: "FinancialDataService: Yahoo Finance quotes, 16 CHINA_FUTURES contracts (CFFEX/SHFE/CZCE/DCE), margin calculation, position risk assessment." },
  { pattern: /converter|anthropic|openai|format.?convert/i, skillName: "format-converter", category: "infra", preferredTier: "flash", contextHint: "Bidirectional format conversion between Anthropic and OpenAI formats: system field, tool_use/tool_calls, thinking blocks." },
];

export class EvolutionBridge {
  private config: EvolutionConfig;
  private traceBatch: EvolutionTrace[] = [];
  private skillCache: Map<string, SkillContext[]> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private logger?: any;

  constructor(config: Partial<EvolutionConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  initialize(): void {
    if (this.config.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        this.flushTraces().catch((e: any) => {
          this.logger?.debug(`EvolutionBridge periodic flush failed: ${e?.message}`);
        });
      }, this.config.flushIntervalMs);
    }
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushTraces().catch(() => {});
  }

  detectSkills(requestBody: any): SkillRef[] {
    const skills: SkillRef[] = [];
    const text = this.extractAllText(requestBody);
    if (!text) return skills;

    for (const { pattern, skillName, category } of KNOWN_SKILL_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        skills.push({
          name: skillName,
          category,
          version: "1.0.0",
          confidence: matches.length > 1 ? 0.9 : 0.7,
          source: "detected",
        });
      }
    }

    const systemText = this.extractSystemText(requestBody);
    const skillTagMatch = systemText.match(/<CCR-SKILL>([^<]+)<\/CCR-SKILL>/g);
    if (skillTagMatch) {
      for (const tag of skillTagMatch) {
        const name = tag.replace(/<\/?CCR-SKILL>/g, "").trim();
        if (!skills.find(s => s.name === name)) {
          skills.push({
            name,
            category: "tagged",
            version: "1.0.0",
            confidence: 1.0,
            source: "config",
          });
        }
      }
    }

    return skills;
  }

  getSkillContexts(skills: SkillRef[]): SkillContext[] {
    const contexts: SkillContext[] = [];

    for (const skill of skills) {
      const cached = this.skillCache.get(skill.name);
      if (cached) {
        contexts.push(...cached);
        continue;
      }

      const pattern = KNOWN_SKILL_PATTERNS.find(p => p.skillName === skill.name);
      if (pattern) {
        const ctx: SkillContext = {
          skillName: skill.name,
          category: skill.category,
          relevantPatterns: [pattern.pattern.source],
          contextInjection: pattern.contextHint,
          routingHints: {
            preferredTier: pattern.preferredTier,
            preferredModel: "",
            maxBudgetTokens: pattern.preferredTier === "pro" ? 32000 : 10000,
          },
        };
        contexts.push(ctx);
        this.skillCache.set(skill.name, [ctx]);
      }
    }

    return contexts;
  }

  getRoutingHints(skills: SkillRef[]): {
    preferredTier: string;
    preferredModel: string;
    maxBudgetTokens: number;
  } {
    if (!this.config.skillAwareRouting || skills.length === 0) {
      return { preferredTier: "", preferredModel: "", maxBudgetTokens: 0 };
    }

    const contexts = this.getSkillContexts(skills);
    if (contexts.length === 0) {
      return { preferredTier: "", preferredModel: "", maxBudgetTokens: 0 };
    }

    const proContexts = contexts.filter(c => c.routingHints.preferredTier === "pro");
    if (proContexts.length > 0) {
      const maxBudget = Math.max(...proContexts.map(c => c.routingHints.maxBudgetTokens));
      return { preferredTier: "pro", preferredModel: "", maxBudgetTokens: maxBudget };
    }

    return { preferredTier: "flash", preferredModel: "", maxBudgetTokens: 10000 };
  }

  buildContextInjection(skills: SkillRef[]): string {
    if (!this.config.contextInjection || skills.length === 0) return "";

    const contexts = this.getSkillContexts(skills);
    if (contexts.length === 0) return "";

    const lines = [
      "<evolution_context>",
      "Relevant skill context from Evolution/SkillClaw pipeline:",
    ];

    for (const ctx of contexts) {
      lines.push(`  <skill name="${ctx.skillName}" category="${ctx.category}">`);
      lines.push(`    ${ctx.contextInjection}`);
      lines.push(`  </skill>`);
    }

    lines.push("</evolution_context>");
    return lines.join("\n");
  }

  recordTrace(params: {
    sessionId: string;
    turnNumber: number;
    skills: SkillRef[];
    routing: {
      provider: string;
      model: string;
      tier: string;
      scenarioType: string;
      routeReason: string;
    };
    quality: {
      hallucinationRisk: number;
      qualityScore: number;
      latencyMs: number;
    };
    context: {
      ragEnriched: boolean;
      memoryEnriched: boolean;
      cacheHit: boolean;
      preservedContexts: number;
      toolChainsActive: number;
    };
    usage: {
      inputTokens: number;
      outputTokens: number;
      model: string;
    };
  }): void {
    if (!this.config.enabled) return;

    const trace: EvolutionTrace = {
      traceId: createHash("sha256")
        .update(`${params.sessionId}:${params.turnNumber}:${Date.now()}`)
        .digest("hex")
        .slice(0, 16),
      sessionId: params.sessionId,
      turnNumber: params.turnNumber,
      timestamp: new Date().toISOString(),
      skills: params.skills,
      routingDecision: params.routing,
      quality: params.quality,
      context: params.context,
      usage: params.usage,
    };

    this.traceBatch.push(trace);

    if (this.traceBatch.length >= this.config.maxTraceBatchSize) {
      this.flushTraces().catch(() => {});
    }
  }

  async flushTraces(): Promise<void> {
    if (this.traceBatch.length === 0) return;

    const batch = [...this.traceBatch];
    this.traceBatch = [];

    try {
      const dir = dirname(this.config.traceStoragePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      const lines = batch.map(t => JSON.stringify(t)).join("\n") + "\n";
      await appendFile(this.config.traceStoragePath, lines);

      if (this.config.hermesEndpoint) {
        await this.sendToHermes(batch);
      }

      this.logger?.debug(`EvolutionBridge: flushed ${batch.length} traces`);
    } catch (e: any) {
      this.logger?.debug(`EvolutionBridge flush failed: ${e?.message}`);
      this.traceBatch = [...batch, ...this.traceBatch].slice(0, 200);
    }
  }

  getStats(): {
    totalTraces: number;
    pendingBatch: number;
    skillsDetected: Record<string, number>;
    topSkills: Array<{ name: string; count: number }>;
  } {
    const skillCounts: Record<string, number> = {};
    for (const trace of this.traceBatch) {
      for (const skill of trace.skills) {
        skillCounts[skill.name] = (skillCounts[skill.name] || 0) + 1;
      }
    }

    const topSkills = Object.entries(skillCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      totalTraces: this.traceBatch.length,
      pendingBatch: this.traceBatch.length,
      skillsDetected: skillCounts,
      topSkills,
    };
  }

  private async sendToHermes(traces: EvolutionTrace[]): Promise<void> {
    if (!this.config.hermesEndpoint) return;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      await fetch(`${this.config.hermesEndpoint}/traces/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traces }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (e: any) {
      this.logger?.debug(`EvolutionBridge Hermes send failed: ${e?.message}`);
    }
  }

  private extractAllText(body: any): string {
    if (!body) return "";
    const parts: string[] = [];

    if (typeof body.system === "string") parts.push(body.system);
    if (Array.isArray(body.system)) {
      parts.push(...body.system.filter((s: any) => s.type === "text").map((s: any) => s.text || ""));
    }

    if (Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        if (typeof msg.content === "string") parts.push(msg.content);
        if (Array.isArray(msg.content)) {
          parts.push(...msg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text || ""));
        }
      }
    }

    return parts.join(" ");
  }

  private extractSystemText(body: any): string {
    if (!body) return "";
    if (typeof body.system === "string") return body.system;
    if (Array.isArray(body.system)) {
      return body.system.filter((s: any) => s.type === "text").map((s: any) => s.text || "").join("\n");
    }
    return "";
  }
}
