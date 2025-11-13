/**
 * Anthropic API Mock Utilities
 * Based on actual request/response formats from the codebase
 */

export interface MockAnthropicRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<any>;
  }>;
  system?: Array<{ type: 'text'; text: string }> | string;
  tools?: Array<any>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  metadata?: { user_id?: string };
  thinking?: any;
}

export interface MockAnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence: null | string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Create a mock Anthropic API response
 */
export function createMockResponse(
  text: string = 'Mock response',
  overrides?: Partial<MockAnthropicResponse>
): MockAnthropicResponse {
  return {
    id: 'msg_mock_' + Math.random().toString(36).substr(2, 9),
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text,
      },
    ],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 150,
      output_tokens: 50,
    },
    ...overrides,
  };
}

/**
 * Create a mock streaming SSE response
 */
export function createMockSSEStream(text: string = 'Hello'): string {
  return [
    'event: message_start',
    `data: {"type":"message_start","message":{"id":"msg_${Date.now()}","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}`,
    '',
    'event: content_block_start',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    '',
    'event: content_block_delta',
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${text}"}}`,
    '',
    'event: content_block_stop',
    'data: {"type":"content_block_stop","index":0}',
    '',
    'event: message_delta',
    `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":${text.split(' ').length}}}`,
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    '',
  ].join('\n');
}

/**
 * Create a mock tool use response
 */
export function createMockToolUseResponse(
  toolName: string,
  toolInput: any,
  toolId: string = 'tool_mock_123'
): MockAnthropicResponse {
  return {
    id: 'msg_mock_' + Math.random().toString(36).substr(2, 9),
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: toolId,
        name: toolName,
        input: toolInput,
      },
    ],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 200,
      output_tokens: 100,
    },
  };
}
