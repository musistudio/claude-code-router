/**
 * custom-router-v3.cjs - Agent-Aware Task Router for CCR
 *
 * Replaces custom-router-v2.cjs. Zero hardcoded model names.
 * All routing decisions driven by config (routes.yaml → CCR config.json).
 *
 * Architecture:
 *   1. AgentDetection: Identify which pineaple agent is active
 *   2. TaskClassification: Classify the task type and complexity
 *   3. RuleMatching: Find the best routing rule from config
 *   4. ScenarioFallback: Fall back to scenario routing if no rule matches
 *
 * Config (from CCR config.json):
 *   - RoutingRules[] - Array of agent/task-aware routing rules
 *   - Router.scenarios - Scenario-based routing (think/background/longContext)
 *   - ModelMapping - Model name aliases
 *   - fallback - Fallback chains per scenario
 *
 * @param {object} req - Fastify request object (with body, headers, etc.)
 * @param {object} config - Full CCR config (from ConfigService.getAll())
 * @param {object} context - { event: any }
 * @returns {string|undefined} - "provider,model" string or undefined to use default
 */

// =============================================================================
// Agent Detection
// =============================================================================

/**
 * Common pineaple agent names and their signatures in system prompts.
 * Extracted from .claude/agents/*.md and scripts/agent_api/.
 */
const AGENT_SIGNATURES = {
  "glm51-coordinator": [
    "glm51-coordinator",
    "GLM-5.1 coordinator",
    "autonomous coordination",
  ],
  "core-implementer": [
    "core-implementer",
    "implementation task",
    "implement features",
    "p0-core-implementation",
  ],
  "security-reviewer": [
    "security-reviewer",
    "security audit",
    "vulnerability",
    "security boundary audit",
  ],
  "reasoning-orchestrator": [
    "reasoning-orchestrator",
    "complex reasoning",
    "multi-step reasoning",
    "deep reasoning",
  ],
  "pre-dev-researcher": [
    "pre-dev-researcher",
    "research before implementation",
    "open source research",
    "find existing solutions",
  ],
  "test-automator": [
    "test-automator",
    "test generation",
    "write tests",
    "test coverage",
  ],
  "graph-compiler-specialist": [
    "graph-compiler",
    "compiler pass",
    "GraphCompiler",
    "graph IR",
  ],
  "review-coordinator": [
    "review-coordinator",
    "iterative review",
    "code review",
    "review loop",
  ],
  "evidence-runner": [
    "evidence-runner",
    "gate evidence",
    "quick gate",
    "standard gate",
    "backtest validation",
  ],
  "mcp-auditor": [
    "mcp-auditor",
    "mcp config audit",
    "mcp boundary",
    "tool poisoning",
  ],
  "architecture-governor": [
    "architecture-governor",
    "architecture review",
    "dependency graph",
    "module boundary",
  ],
};

/**
 * Detect which agent is currently active by scanning system prompts.
 */
function detectAgent(req) {
  const systemContent = extractSystemText(req);
  if (!systemContent) return null;

  const lowerContent = systemContent.toLowerCase();

  for (const [agentName, signatures] of Object.entries(AGENT_SIGNATURES)) {
    for (const sig of signatures) {
      if (lowerContent.includes(sig.toLowerCase())) {
        return agentName;
      }
    }
  }

  return null;
}

// =============================================================================
// Task Classification
// =============================================================================

const TASK_PATTERNS = {
  architecture: [
    "architecture",
    "design system",
    "system design",
    "blueprint",
    "ADR",
  ],
  analysis: [
    "analyze",
    "analysis",
    "investigate",
    "diagnose",
    "profile",
    "benchmark",
  ],
  complex: ["complex", "multi-step", "orchestrate", "pipeline", "refactor"],
  deep_review: [
    "deep review",
    "thorough review",
    "comprehensive review",
    "security audit",
    "vulnerability",
  ],
  root_cause: [
    "root cause",
    "why is this happening",
    "debug",
    "troubleshoot",
  ],
  multi_step_planning: [
    "plan",
    "roadmap",
    "milestone",
    "phase 1",
    "multi-phase",
  ],
  conflict_resolution: [
    "conflict",
    "merge conflict",
    "resolve conflict",
    "rebase",
  ],
  implementation: [
    "implement",
    "create",
    "build",
    "add feature",
    "write code",
    "develop",
  ],
  edit: ["edit", "modify", "update", "change", "fix", "patch", "correct"],
  write: ["write", "create file", "new file", "generate"],
  refactor: ["refactor", "rewrite", "restructure", "clean up"],
  debug: ["debug", "fix bug", "error", "exception", "crash"],
  planning: ["plan", "design", "propose", "draft", "outline"],
  design: ["design", "UI", "UX", "interface", "component design"],
  format: ["format", "lint", "style", "prettify", "indent"],
  lookup: ["find", "locate", "search", "where is", "look up", "grep"],
  simple_edit: ["typo", "rename", "add comment", "update doc"],
  review: [
    "review",
    "PR review",
    "code review",
    "examine",
    "inspect",
    "check",
  ],
  test: ["test", "pytest", "unit test", "integration test", "golden test"],
  research: [
    "research",
    "search github",
    "find library",
    "what library",
    "is there a tool",
  ],
  documentation: [
    "document",
    "docstring",
    "README",
    "docs",
    "write documentation",
  ],
};

/**
 * Classify the task type by analyzing the user's messages/prompt.
 */
function classifyTask(req) {
  const messages = req.body?.messages || [];
  const systemText = extractSystemText(req);

  // Collect all text content
  const allText = [];
  if (systemText) allText.push(systemText);
  for (const msg of messages) {
    if (!msg || msg.role !== "user") continue;
    const content =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .filter((c) => c && c.type === "text")
              .map((c) => c.text)
              .join(" ")
          : "";
    if (content) allText.push(content);
  }

  const combinedText = allText.join(" ").toLowerCase();

  // Score each task type
  const scores = {};
  for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
    let score = 0;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = combinedText.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    scores[taskType] = score;
  }

  // Find best match
  let bestType = "implementation";
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Determine complexity
  const tokenCount = req.tokenCount || 0;
  const toolCount = (req.body?.tools || []).length;
  const messageCount = (req.body?.messages || []).length;

  let complexity = "medium";
  if (
    bestType === "architecture" ||
    bestType === "deep_review" ||
    bestType === "conflict_resolution" ||
    tokenCount > 40000 ||
    toolCount > 8
  ) {
    complexity = "high";
  } else if (
    bestType === "format" ||
    bestType === "lookup" ||
    bestType === "simple_edit" ||
    (tokenCount < 10000 && toolCount <= 2)
  ) {
    complexity = "low";
  }

  return {
    type: bestType,
    complexity,
    tokenCount,
    toolCount,
    messageCount,
    thinkingEnabled: !!req.body?.thinking,
  };
}

// =============================================================================
// Routing Rule Matching
// =============================================================================

/**
 * Match request context against configured routing rules.
 * Returns the first matching rule (rules are pre-sorted by priority).
 */
function matchRoutingRule(agentName, task, routingRules) {
  if (!routingRules || !Array.isArray(routingRules)) return null;

  for (const rule of routingRules) {
    if (!rule || !rule.condition || !rule.target) continue;
    const c = rule.condition;

    // Agent patterns
    if (c.agent_patterns && c.agent_patterns.length > 0) {
      if (
        !agentName ||
        !c.agent_patterns.some((p) =>
          agentName.toLowerCase().includes(p.toLowerCase())
        )
      ) {
        continue;
      }
    }

    // Task types
    if (c.task_types && c.task_types.length > 0) {
      if (
        !c.task_types.some(
          (t) => task.type.toLowerCase() === t.toLowerCase()
        )
      ) {
        continue;
      }
    }

    // Token count
    if (c.token_count_min !== undefined && task.tokenCount < c.token_count_min)
      continue;
    if (c.token_count_max !== undefined && task.tokenCount > c.token_count_max)
      continue;

    // Tool count
    if (c.tool_count_min !== undefined && task.toolCount < c.tool_count_min)
      continue;
    if (c.tool_count_max !== undefined && task.toolCount > c.tool_count_max)
      continue;

    // Thinking mode
    if (
      c.thinking_enabled !== undefined &&
      task.thinkingEnabled !== c.thinking_enabled
    )
      continue;

    // Time window
    if (c.time_window) {
      if (!isInTimeWindow(c.time_window)) continue;
    }

    return rule;
  }

  return null;
}

// =============================================================================
// Scenario Routing (fallback when no rule matches)
// =============================================================================

/**
 * Use scenario-based routing (think/background/longContext/default).
 * This is the traditional CCR routing behavior.
 */
function scenarioRoute(req, config) {
  const router = config.Router || {};
  const tokenCount = req.tokenCount || 0;

  // Long context
  const threshold = router.longContextThreshold || 60000;
  if (tokenCount > threshold && router.longContext) {
    return { model: router.longContext, scenario: "longContext" };
  }

  // Subagent model tag
  const subagentModel = extractSubagentModelDirect(req);
  if (subagentModel) {
    return { model: subagentModel, scenario: "subagent" };
  }

  // Background (Haiku detection)
  if (
    req.body.model?.includes("haiku") &&
    router.background
  ) {
    return { model: router.background, scenario: "background" };
  }

  // Web search
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((t) => t.type?.startsWith("web_search")) &&
    router.webSearch
  ) {
    return { model: router.webSearch, scenario: "webSearch" };
  }

  // Think mode
  if (req.body.thinking && router.think) {
    return { model: router.think, scenario: "think" };
  }

  // Default
  return { model: router.default, scenario: "default" };
}

// =============================================================================
// Main Router Function
// =============================================================================

async function route(req, config, context) {
  const startTime = Date.now();
  let result = null;

  try {
    // Step 1: Detect active agent
    const agentName = detectAgent(req);

    // Step 2: Classify task
    const task = classifyTask(req);

    // Step 3: Try routing rules (highest priority)
    const routingRules = config.RoutingRules || [];
    const matchedRule = matchRoutingRule(agentName, task, routingRules);

    if (matchedRule) {
      result = {
        model: `${matchedRule.target.provider},${matchedRule.target.model}`,
        scenario: "rule:" + matchedRule.name,
        fallbackChain: matchedRule.target.fallback_chain || [],
      };
    } else {
      // Step 4: Fall back to scenario routing
      const scenarioResult = scenarioRoute(req, config);
      result = {
        model: scenarioResult.model,
        scenario: scenarioResult.scenario,
        fallbackChain: (config.fallback || {})[scenarioResult.scenario] || [],
      };
    }

    const elapsed = Date.now() - startTime;

    // Log routing decision
    if (req.log) {
      req.log.info({
        router: "v3",
        agent: agentName || "unknown",
        taskType: task.type,
        taskComplexity: task.complexity,
        model: result.model,
        scenario: result.scenario,
        tokenCount: task.tokenCount,
        toolCount: task.toolCount,
        elapsedMs: elapsed,
      });
    }

    // Store routing metadata on request for downstream middleware
    req.gatewayScenario = result.scenario;
    req.gatewayTaskType = task.type;
    req.gatewayAgentName = agentName;
    req.gatewayFallbackChain = result.fallbackChain;
    req.gatewayComplexity = task.complexity;

    // Emit event for logging/analytics
    if (context && context.event) {
      context.event.emit("route:decision", {
        requestId: req.id,
        sessionId: req.sessionId,
        agent: agentName,
        task: task.type,
        complexity: task.complexity,
        model: result.model,
        scenario: result.scenario,
        tokenCount: task.tokenCount,
        elapsedMs: elapsed,
      });
    }

    return result.model;
  } catch (error) {
    if (req.log) {
      req.log.error(`custom-router-v3 error: ${error.message}`);
    }

    // Always return something - never leave Claude Code hanging
    const router = config.Router || {};
    return router.default || "xfyun,astron-code-latest";
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractSystemText(req) {
  const system = req.body?.system;
  if (!system) return "";

  if (typeof system === "string") return system;

  if (Array.isArray(system)) {
    return system
      .filter((s) => s && s.type === "text" && s.text)
      .map((s) => s.text)
      .join("\n");
  }

  return "";
}

function extractSubagentModelDirect(req) {
  const system = req.body?.system;
  if (!Array.isArray(system) || system.length <= 1) return undefined;

  const text = typeof system[1]?.text === "string" ? system[1].text : "";
  if (!text.startsWith("<CCR-SUBAGENT-MODEL>")) return undefined;

  const match = text.match(
    /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s
  );
  if (!match) return undefined;

  // Remove tag from original
  req.body.system[1].text = text.replace(
    `<CCR-SUBAGENT-MODEL>${match[1]}</CCR-SUBAGENT-MODEL>`,
    ""
  );

  return match[1];
}

function isInTimeWindow(window) {
  const [startStr, endStr] = window.split("-");
  if (!startStr || !endStr) return true;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = startStr.split(":").map(Number);
  const [endH, endM] = endStr.split(":").map(Number);

  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  if (endMinutes < startMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// =============================================================================
// Export
// =============================================================================

module.exports = route;
