/**
 * Router Unit Tests
 * Tests for src/utils/router.ts
 */

import { calculateTokenCount } from '../../src/utils/router';

describe('Router - Token Calculation', () => {
  describe('calculateTokenCount', () => {
    it('should calculate tokens from simple text messages', () => {
      const messages: any[] = [
        { role: 'user', content: 'Hello world' },
      ];
      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(0);
    });

    it('should return 0 for empty messages', () => {
      const count = calculateTokenCount([], [], []);
      expect(count).toBe(0);
    });

    it('should handle multiple messages', () => {
      const messages: any[] = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' },
        { role: 'user', content: 'Third message' },
      ];
      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(5);
    });

    it('should handle array content with text blocks', () => {
      const messages: any[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        },
      ];
      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle tool_use content', () => {
      const messages: any[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'test_tool',
              input: { query: 'test query with some length' },
            },
          ],
        },
      ];
      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle tool_result content with string', () => {
      const messages: any[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_123',
              content: 'Tool result text',
            },
          ],
        },
      ];
      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle tool_result content with object', () => {
      const messages: any[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_123',
              content: { result: 'Complex object result' },
            },
          ],
        },
      ];
      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(0);
    });

    it('should count system prompt tokens (string)', () => {
      const system = 'You are a helpful assistant';
      const count = calculateTokenCount([], system, []);
      expect(count).toBeGreaterThan(0);
    });

    it('should count system prompt tokens (array)', () => {
      const system = [
        { type: 'text', text: 'You are a helpful assistant' },
        { type: 'text', text: 'Be concise and clear' },
      ];
      const count = calculateTokenCount([], system, []);
      expect(count).toBeGreaterThan(0);
    });

    it('should count tool definition tokens', () => {
      const tools: any[] = [
        {
          name: 'test_tool',
          description: 'A test tool for unit testing',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
          },
        },
      ];
      const count = calculateTokenCount([], [], tools);
      expect(count).toBeGreaterThan(0);
    });

    it('should combine all token sources', () => {
      const messages: any[] = [
        { role: 'user', content: 'Hello' },
      ];
      const system = 'You are helpful';
      const tools: any[] = [
        {
          name: 'tool',
          description: 'desc',
          input_schema: { type: 'object' },
        },
      ];
      const count = calculateTokenCount(messages, system, tools);
      expect(count).toBeGreaterThan(10);
    });
  });
});
