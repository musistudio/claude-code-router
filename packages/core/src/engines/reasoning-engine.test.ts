/**
 * Tests for ReasoningEngine — hallucination detection and task classification.
 */
import { describe, it, expect } from 'vitest';
import { checkHallucination, analyzeReasoning } from './reasoning-engine';

describe('checkHallucination', () => {
  it('should detect provider errors (Layer 0)', () => {
    const ctx = checkHallucination(100, 50, 'Internal Server Error', 500, 'deepseek');
    expect(ctx.hallucinationRisk).toBe(0);
    expect(ctx.flags).toContain('provider_error_http_500');
  });

  it('should detect empty responses (Layer 1)', () => {
    const ctx = checkHallucination(100, 0, '', 200, 'deepseek');
    expect(ctx.hallucinationRisk).toBe(0);
    expect(ctx.flags).toContain('empty_response');
  });

  it('should flag high output ratio (Layer 2)', () => {
    const ctx = checkHallucination(100, 500, 'A very long response...'.repeat(100), 200, 'deepseek');
    expect(ctx.hallucinationRisk).toBeGreaterThan(0);
    expect(ctx.flags.some((f) => f.startsWith('output_ratio_high'))).toBe(true);
  });

  it('should detect fabrication patterns (Layer 3)', () => {
    const ctx = checkHallucination(
      500,
      200,
      `import { something } from "@anthropic-ai/sdk"; console.log("test");`,
      200,
      'deepseek'
    );
    expect(ctx.flags).toContain('fabricated_import_detected');
    expect(ctx.hallucinationRisk).toBeGreaterThan(0);
  });

  it('should extract text from content array', () => {
    const content = [{ type: 'text', text: 'Hello' }, { type: 'text', text: 'World' }];
    const ctx = checkHallucination(10, 5, content, 200, 'deepseek');
    expect(ctx.hallucinationRisk).toBe(0);
    expect(ctx.flags.length).toBe(0);
  });

  it('should handle null response gracefully', () => {
    const ctx = checkHallucination(10, 0, null as any, 200, 'deepseek');
    expect(ctx.hallucinationRisk).toBe(0);
  });

  it('should not flag normal responses', () => {
    const ctx = checkHallucination(1000, 200, 'This is a normal response.', 200, 'openai');
    expect(ctx.hallucinationRisk).toBe(0);
    expect(ctx.flags.length).toBe(0);
  });

  it('should detect low context high output pattern', () => {
    const ctx = checkHallucination(100, 5000, 'A'.repeat(10000), 200, 'deepseek');
    expect(ctx.hallucinationRisk).toBeGreaterThan(0);
    expect(ctx.flags).toContain('low_context_high_output(in=100,out=5000)');
  });
});

describe('analyzeReasoning', () => {
  it('should detect reasoning MCP tools', () => {
    const result = analyzeReasoning(
      {
        messages: [],
        tools: [{ name: 'mcp__sequential_thinking__sequentialthinking' }],
      },
      500
    );
    expect(result.isReasoningTask).toBe(true);
    expect(result.mcpToolsDetected).toContain('mcp__sequential_thinking__sequentialthinking');
  });

  it('should recommend pro for standard tasks without tools', () => {
    const result = analyzeReasoning(
      {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      },
      10
    );
    // No MCP tools → default recommendation is 'pro'
    expect(result.recommendation).toBe('pro');
    expect(result.isRelayTask).toBe(false);
    expect(result.isReasoningTask).toBe(false);
  });

  it('should detect relay tasks (relay MCP tools)', () => {
    const result = analyzeReasoning(
      {
        messages: [],
        tools: [{ name: 'mcp__memory__search_nodes' }],
      },
      100
    );
    expect(result.isRelayTask).toBe(true);
    expect(result.recommendation).toBe('flash');
  });

  it('should recommend pro_max for deep reasoning with sufficient context', () => {
    const result = analyzeReasoning(
      {
        messages: [
          {
            role: 'user',
            content: 'Design a comprehensive architecture'.repeat(20),
          },
        ],
        tools: [{ name: 'mcp__sequential_thinking__sequentialthinking' }],
      },
      2000
    );
    expect(result.needsDeepReasoning).toBe(true);
    expect(result.recommendation).toBe('pro_max');
  });

  it('should recommend pro for deep reasoning with low context', () => {
    const result = analyzeReasoning(
      {
        messages: [],
        tools: [{ name: 'mcp__sequential_thinking__sequentialthinking' }],
      },
      100
    );
    expect(result.isReasoningTask).toBe(true);
    expect(result.needsDeepReasoning).toBe(true);
    expect(result.recommendation).toBe('pro');
  });

  it('should recommend flash for MCP tools with small context', () => {
    const result = analyzeReasoning(
      {
        messages: [],
        tools: [{ name: 'mcp__some_custom__tool' }],
      },
      500
    );
    expect(result.recommendation).toBe('flash');
    expect(result.isRelayTask).toBe(true);
  });

  it('should handle no tools gracefully', () => {
    const result = analyzeReasoning(
      { messages: [{ role: 'user', content: 'test' }] },
      100
    );
    expect(result.recommendation).toBe('pro');
    expect(result.mcpToolsDetected).toEqual([]);
  });

  it('should handle missing tools array', () => {
    const result = analyzeReasoning({ messages: [] }, 0);
    expect(result.recommendation).toBe('pro');
  });
});
