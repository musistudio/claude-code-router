/**
 * Reasoning Engine - context-aware hallucination reduction.
 *
 * Extended task classifier that:
 *   1. Detects MCP reasoning tool patterns
 *   2. Routes external-API-relay tasks to flash (cheap, fast, deterministic)
 *   3. Routes deep-reasoning tasks to pro max WITH context injection
 *   4. Adds hallucination fence: flags responses where output >> input tokens
 *
 * Design: Complements task-classifier.ts, not replaces.
 * Imported by router.ts to add reasoning-aware tier decisions.
 */

import { ModelTier } from '../config/provider-registry';

/** MCP reasoning tools that may relay external API results */
const REASONING_MCP_TOOLS = new Set([
  'mcp__sequential_thinking__sequentialthinking',
  'mcp__mcp_reasoning__reason',
  'mcp__ultrabrain__think',
  'mcp__yggdrasil__reason',
  'mcp__structured_thinking__think',
]);

/** MCP tools that purely relay results (hallucination risk) */
const RELAY_MCP_TOOLS = new Set([
  'mcp__memory__search_nodes',
  'mcp__memory__read_graph',
  'mcp__repowise__analyze',
  'mcp__codegraphcontext__query',
  'mcp__clawmem__memory_retrieve',
  'mcp__clawmem__search',
  'mcp__finance_mcp__*',
  'mcp__openbb__*',
]);

/** Tools that need deep reasoning (expensive but worth it) */
const DEEP_REASONING_TOOLS = new Set([
  'mcp__sequential_thinking__sequentialthinking',
  'mcp__mcp_reasoning__reason',
  'mcp__yggdrasil__reason',
]);

export interface ReasoningContext {
  contextInjectedTokens: number;
  contextInjected: boolean;
  outputTokens: number;
  inputTokens: number;
  hallucinationRisk: number; // 0.0 - 1.0
  flags: string[];
}

/**
 * Analyze the reasoning characteristics of a request.
 * Called BEFORE routing to decide flash vs pro max.
 */
export function analyzeReasoning(reqBody: any, tokenCount: number): {
  isReasoningTask: boolean;
  isRelayTask: boolean;
  needsDeepReasoning: boolean;
  mcpToolsDetected: string[];
  recommendation: 'flash' | 'pro' | 'pro_max';
  reason: string;
} {
  const mcpTools: string[] = [];
  const tools = Array.isArray(reqBody.tools) ? reqBody.tools : [];

  for (const tool of tools) {
    const name = (tool.name || '').toLowerCase();
    if (name.startsWith('mcp__')) {
      mcpTools.push(name);

      // Check relay pattern
      for (const relayPattern of RELAY_MCP_TOOLS) {
        if (relayPattern.endsWith('*')) {
          if (name.startsWith(relayPattern.slice(0, -2))) return {
            isReasoningTask: false, isRelayTask: true,
            needsDeepReasoning: false, mcpToolsDetected: mcpTools,
            recommendation: 'flash',
            reason: `MCP relay tool ${name} → deterministic results, flash sufficient`,
          };
        } else if (name.startsWith(relayPattern)) {
          return {
            isReasoningTask: false, isRelayTask: true,
            needsDeepReasoning: false, mcpToolsDetected: mcpTools,
            recommendation: 'flash',
            reason: `MCP relay tool ${name} → deterministic results, flash sufficient`,
          };
        }
      }
    }
  }

  // Check deep reasoning tools
  for (const tool of mcpTools) {
    if (REASONING_MCP_TOOLS.has(tool) || DEEP_REASONING_TOOLS.has(tool)) {
      // Deep reasoning with sufficient context → pro max
      if (tokenCount >= 2000) {
        return {
          isReasoningTask: true, isRelayTask: false,
          needsDeepReasoning: true, mcpToolsDetected: mcpTools,
          recommendation: 'pro_max',
          reason: `Deep reasoning tool ${tool} + ${tokenCount} tokens context → pro max`,
        };
      }
      // Deep reasoning with too little context → pro + inject context
      return {
        isReasoningTask: true, isRelayTask: false,
        needsDeepReasoning: true, mcpToolsDetected: mcpTools,
        recommendation: 'pro',
        reason: `Deep reasoning tool ${tool} but only ${tokenCount} tokens → pro with context injection needed`,
      };
    }
  }

  // General MCP tool usage → flash if context is small
  if (mcpTools.length > 0 && tokenCount < 8000) {
    return {
      isReasoningTask: false, isRelayTask: true,
      needsDeepReasoning: false, mcpToolsDetected: mcpTools,
      recommendation: 'flash',
      reason: `${mcpTools.length} MCP tools, ${tokenCount} tokens → flash`,
    };
  }

  return {
    isReasoningTask: false, isRelayTask: false,
    needsDeepReasoning: false, mcpToolsDetected: mcpTools,
    recommendation: 'pro',
    reason: 'Standard task → pro',
  };
}

/**
 * Check response for hallucination indicators.
 * Called AFTER receiving response from upstream.
 */
export function checkHallucination(
  inputTokens: number,
  outputTokens: number,
  responseContent: any
): ReasoningContext {
  const flags: string[] = [];
  let risk = 0.0;

  // Rule 1: Output far exceeds input → suspicious
  if (inputTokens > 0 && outputTokens > inputTokens * 3) {
    flags.push(`output_ratio_high(${outputTokens}/${inputTokens}=${(outputTokens/inputTokens).toFixed(1)}x)`);
    risk = Math.min(1.0, risk + 0.4);
  }

  // Rule 1b: Very low input, high output → high hallucination risk
  if (inputTokens < 500 && outputTokens > 3000) {
    flags.push(`low_context_high_output(in=${inputTokens},out=${outputTokens})`);
    risk = Math.min(1.0, risk + 0.5);
  }

  // Rule 2: Response contains fabricated API patterns
  const contentText = extractText(responseContent);
  if (contentText) {
    const fabricationPatterns = [
      /import\s+['"]@anthropic-ai\/sdk['"]/,
      /from\s+['"]claude-code['"]/,
      /MCP server.*not found/i,
      /function\s+doesNotExist/,
    ];
    for (const pattern of fabricationPatterns) {
      if (pattern.test(contentText)) {
        flags.push('fabricated_import_detected');
        risk = Math.min(1.0, risk + 0.3);
        break;
      }
    }
  }

  return {
    contextInjectedTokens: 0,
    contextInjected: false,
    outputTokens,
    inputTokens,
    hallucinationRisk: risk,
    flags,
  };
}

/**
 * Build context injection for low-context reasoning tasks.
 * Injects project documentation to ground the LLM.
 */
export function buildContextInjection(
  projectRoot: string,
  agentName: string
): string {
  const sections: string[] = [];

  // TODO: Load from RAG cache or file system
  // For now: minimal template that gets enriched by RAGEnricher
  sections.push('<ground_truth_context>');
  sections.push(`Agent: ${agentName}`);
  sections.push('You are working in the pineapple project (puzzle_lab).');
  sections.push('Key constraints: zero LLM/MCP tokens in core runtime.');
  sections.push('All strategy execution is deterministic.');
  sections.push('Refer to AGENTS.md for full architecture rules.');
  sections.push('</ground_truth_context>');

  return sections.join('\n');
}

function extractText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c.text || '')
      .join('\n');
  }
  return JSON.stringify(content);
}
