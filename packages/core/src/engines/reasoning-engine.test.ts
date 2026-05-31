/**
 * Tests for ReasoningEngine — hallucination detection and task classification.
 */
import { describe, it, expect } from 'vitest';
import { checkHallucination, analyzeReasoning } from './reasoning-engine';

describe('checkHallucination', () => {
  it('should detect provider errors (Layer 0)', () => {
    const ctx = checkHallucination(100, 50, 'Internal Server Error', 500, 'xfyun');
    expect(ctx.hallucinationRisk).toBe(0);
    expect(ctx.flags).toContain('provider_error_http_500');
  });

  it('should detect empty responses (Layer 1)', () => {
    const ctx = checkHallucination(100, 0, '', 200, 'deepseek');
    expect(ctx.hallucinationRisk).toBe(0);
    expect(ctx.flags).toContain('empty_response');
  });

  it('should flag high output ratio (Layer 2)', () => {
    const ctx = checkHallucination(100, 500, 'A very long response...'.repeat(100), 200, 'xfyun');
    expect(ctx.hallucinationRisk).toBeGreaterThan(0);
    expect(ctx.flags.some((f) => f.startsWith('output_ratio_high'))).toBe(true);
  });

  it('should detect fabrication patterns (Layer 3)', () => {
    const ctx = checkHallucination(
      500,
      200,
      `import { something } from '@anthropic-ai/sdk'; console.log("test");`,
      200,
      'xfyun'
    );
    expect(ctx.flags).toContain('fabricated_import_detected');
    expect(ctx.hallucinationRisk).toBeGreaterThan(0);
  });

  it('should extract text from content array', () => {
    const content = [{ type: 'text', text: 'Hello' }, { type: 'text', text: 'World' }];
    const ctx = checkHallucination(10, 5, content, 200, 'xfyun');
    expect(ctx.hallucinationRisk).toBe(0);
    expect(ctx.flags.length).toBe(0);
  });

  it('should handle null response gracefully', () => {
    const ctx = checkHallucination(10, 0, null as any, 200, 'xfyun');
    expect(ctx.hallucinationRisk).toBe(0);
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

  it('should recommend flash for simple tasks', () => {
    const result = analyzeReasoning(
      {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      },
      10
    );
    expect(result.recommendation).toBe('flash');
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
  });

  it('should recommend pro for deep reasoning tasks', () => {
    const result = analyzeReasoning(
      {
        messages: [
          {
            role: 'user',
            content: 'Design a comprehensive architecture'.repeat(20),
          },
        ],
      },
      2000
    );
    expect(result.needsDeepReasoning).toBe(true);
    expect(result.recommendation).toMatch(/pro/);
  });
});
