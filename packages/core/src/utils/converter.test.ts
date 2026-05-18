import { describe, it, expect } from 'vitest';
import { sanitizeToolsForMoonshot } from './converter';

describe('sanitizeToolsForMoonshot', () => {
  it('should convert #/definitions/ refs to #/$defs/', () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              completed_subtitle: {
                $ref: '#/definitions/CompletedSubtitle',
              },
            },
            definitions: {
              CompletedSubtitle: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                },
              },
            },
          },
        },
      },
    ];

    const result = sanitizeToolsForMoonshot(tools);
    expect(result[0].function.parameters.properties.completed_subtitle.$ref).toBe(
      '#/$defs/CompletedSubtitle'
    );
    expect(result[0].function.parameters.$defs).toBeDefined();
    expect(result[0].function.parameters.$defs?.CompletedSubtitle).toBeDefined();
    expect(result[0].function.parameters.definitions).toBeUndefined();
  });

  it('should convert #/components/schemas/ refs to #/$defs/', () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              user: {
                $ref: '#/components/schemas/User',
              },
            },
            definitions: {
              User: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
              },
            },
          },
        },
      },
    ];

    const result = sanitizeToolsForMoonshot(tools);
    expect(result[0].function.parameters.properties.user.$ref).toBe(
      '#/$defs/User'
    );
  });

  it('should handle relative refs by prefixing with #/$defs/', () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              item: {
                $ref: 'SomeSchema',
              },
            },
          },
        },
      },
    ];

    const result = sanitizeToolsForMoonshot(tools);
    expect(result[0].function.parameters.properties.item.$ref).toBe(
      '#/$defs/SomeSchema'
    );
  });

  it('should keep #/$defs/ refs unchanged', () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              item: {
                $ref: '#/$defs/SomeSchema',
              },
            },
          },
        },
      },
    ];

    const result = sanitizeToolsForMoonshot(tools);
    expect(result[0].function.parameters.properties.item.$ref).toBe(
      '#/$defs/SomeSchema'
    );
  });

  it('should move type into anyOf sub-schemas', () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                anyOf: [
                  { format: 'uuid' },
                  { format: 'uri' },
                ],
              },
            },
          },
        },
      },
    ];

    const result = sanitizeToolsForMoonshot(tools);
    const valueSchema = result[0].function.parameters.properties.value;
    expect(valueSchema.type).toBeUndefined();
    expect(valueSchema.anyOf[0].type).toBe('string');
    expect(valueSchema.anyOf[1].type).toBe('string');
  });

  it('should handle deeply nested $ref and definitions', () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              nested: {
                type: 'object',
                properties: {
                  deep: {
                    $ref: '#/definitions/DeepSchema',
                  },
                },
                definitions: {
                  DeepSchema: { type: 'string' },
                },
              },
            },
          },
        },
      },
    ];

    const result = sanitizeToolsForMoonshot(tools);
    const nested = result[0].function.parameters.properties.nested;
    expect(nested.properties.deep.$ref).toBe('#/$defs/DeepSchema');
    expect(nested.$defs?.DeepSchema).toBeDefined();
    expect(nested.definitions).toBeUndefined();
  });

  it('should handle tools without parameters', () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'simple_tool',
          description: 'A simple tool',
        },
      },
    ];

    const result = sanitizeToolsForMoonshot(tools);
    expect(result[0].function.parameters).toBeUndefined();
    expect(result[0].function.name).toBe('simple_tool');
  });

  it('should handle empty tools array', () => {
    const result = sanitizeToolsForMoonshot([]);
    expect(result).toEqual([]);
  });
});
