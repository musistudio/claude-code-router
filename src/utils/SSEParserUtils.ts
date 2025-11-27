// Content block types
interface TextContent {
  type: 'text';
  text: string;
}

interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  partialInput?: string;
}

interface RedactedThinkingContent {
  type: 'redacted_thinking';
  text: string;
}

type ContentBlock = TextContent | ToolUseContent | RedactedThinkingContent;

// Event type constants for better maintainability
const SSE_EVENT_TYPES = {
  MESSAGE_START: 'message_start',
  CONTENT_BLOCK_START: 'content_block_start',
  CONTENT_BLOCK_DELTA: 'content_block_delta',
  CONTENT_BLOCK_STOP: 'content_block_stop',
  MESSAGE_DELTA: 'message_delta',
  MESSAGE_STOP: 'message_stop',
  PING: 'ping'
} as const;

// Content block type constants
const CONTENT_BLOCK_TYPES = {
  TEXT: 'text',
  TOOL_USE: 'tool_use',
  REDACTED_THINKING: 'redacted_thinking'
} as const;

// Delta type constants
const DELTA_TYPES = {
  TEXT_DELTA: 'text_delta',
  INPUT_JSON_DELTA: 'input_json_delta'
} as const;

// Message and SSE data types
interface CompleteMessage {
  id: string | null;
  role: string | null;
  content: ContentBlock[];
  model: string | null;
}

interface SSEData {
  type: string;
  message?: {
    id: string;
    role: string;
    model: string;
    content?: any[];
  };
  index?: number;
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: any;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
  };
}

// =============================================================================
// SSE Message Assembler Class
// =============================================================================

class SSEMessageAssembler {
  private currentMessage: CompleteMessage | null = null;
  private currentContentBlock: ContentBlock | null = null;
  private currentIndex: number | null = null;

  public reset(): void {
    this.currentMessage = null;
    this.currentContentBlock = null;
    this.currentIndex = null;
  }

  public processEvent(eventData: string): CompleteMessage | null {
    try {
      const processedEventData = this.fixTruncatedData(eventData);
      const data: SSEData = JSON.parse(processedEventData);

      switch (data.type) {
        case SSE_EVENT_TYPES.MESSAGE_START:
          return this.handleMessageStart(data);
        case SSE_EVENT_TYPES.CONTENT_BLOCK_START:
          this.handleContentBlockStart(data);
          break;
        case SSE_EVENT_TYPES.CONTENT_BLOCK_DELTA:
          this.handleContentBlockDelta(data);
          break;
        case SSE_EVENT_TYPES.CONTENT_BLOCK_STOP:
          this.handleContentBlockStop(data);
          break;
        case SSE_EVENT_TYPES.MESSAGE_DELTA:
          // message_delta 事件包含使用信息，但不需要处理为内容块
          break;
        case SSE_EVENT_TYPES.MESSAGE_STOP:
          return this.handleMessageStop(data);
        case SSE_EVENT_TYPES.PING:
          // 忽略心跳包，但保持当前状态
          break;
        default:
          console.warn(`Unknown SSE event type: ${data.type}`);
      }
    } catch (error) {
      console.error(`Failed to parse SSE event data:`, error, `Raw data:`, eventData);
      return null;
    }

    return null;
  }

  /**
   * Fix common truncated JSON data patterns
   */
  private fixTruncatedData(eventData: string): string {
    if (eventData.includes('"output_to"') && !eventData.includes('"output_tokens"')) {
      return eventData.replace('"output_to"', '"output_tokens"');
    }
    return eventData;
  }

  private handleMessageStart(data: SSEData): null {
    this.currentMessage = {
      id: data.message?.id || null,
      role: data.message?.role || null,
      content: [],
      model: data.message?.model || null
    };
    return null;
  }

  private handleContentBlockStart(data: SSEData): void {
    if (!this.currentMessage) return;

    this.currentIndex = data.index ?? 0;

    const contentBlock = data.content_block;
    if (!contentBlock) return;

    switch (contentBlock.type) {
      case CONTENT_BLOCK_TYPES.TEXT:
        this.currentContentBlock = {
          type: CONTENT_BLOCK_TYPES.TEXT,
          text: contentBlock.text || ''
        };
        break;

      case CONTENT_BLOCK_TYPES.TOOL_USE:
        this.currentContentBlock = {
          type: CONTENT_BLOCK_TYPES.TOOL_USE,
          id: contentBlock.id || '',
          name: contentBlock.name || '',
          input: contentBlock.input as Record<string, unknown> || {},
          partialInput: ''
        };
        break;

      case CONTENT_BLOCK_TYPES.REDACTED_THINKING:
        this.currentContentBlock = {
          type: CONTENT_BLOCK_TYPES.REDACTED_THINKING,
          text: contentBlock.text || ''
        };
        break;

      default:
        console.warn(`Unknown content block type: ${(contentBlock as any).type}`);
        this.currentContentBlock = null;
        return;
    }

    if (this.currentContentBlock && this.currentIndex !== null) {
      this.currentMessage.content[this.currentIndex] = this.currentContentBlock;
    }
  }

  private handleContentBlockDelta(data: SSEData): void {
    if (!this.currentContentBlock || !this.currentMessage || this.currentIndex === null) return;

    const delta = data.delta;
    if (!delta) return;

    switch (this.currentContentBlock.type) {
      case CONTENT_BLOCK_TYPES.TEXT:
        if (delta.text) {
          this.currentContentBlock.text += delta.text;
        }
        break;

      case CONTENT_BLOCK_TYPES.TOOL_USE:
        if (delta.type === DELTA_TYPES.INPUT_JSON_DELTA && delta.partial_json) {
          this.accumulatePartialJsonInput(delta.partial_json);
        }
        break;

      case CONTENT_BLOCK_TYPES.REDACTED_THINKING:
        if (delta.text) {
          this.currentContentBlock.text += delta.text;
        }
        break;
    }

    // 更新消息中的对应块
    this.currentMessage.content[this.currentIndex] = this.currentContentBlock;
  }

  /**
   * Accumulate partial JSON input for tool calls
   */
  private accumulatePartialJsonInput(partialJson: string): void {
    if (!this.currentContentBlock || this.currentContentBlock.type !== CONTENT_BLOCK_TYPES.TOOL_USE) {
      return;
    }

    if (!this.currentContentBlock.partialInput) {
      this.currentContentBlock.partialInput = '';
    }
    this.currentContentBlock.partialInput += partialJson;

    try {
      this.currentContentBlock.input = JSON.parse(this.currentContentBlock.partialInput);
    } catch (e) {
      // JSON parsing incomplete, continue accumulation
    }
  }

  private handleContentBlockStop(data: SSEData): void {
    if (this.currentContentBlock?.type === CONTENT_BLOCK_TYPES.TOOL_USE && this.currentContentBlock.partialInput) {
      try {
        this.currentContentBlock.input = JSON.parse(this.currentContentBlock.partialInput);
        delete this.currentContentBlock.partialInput;
      } catch (e) {
        console.error(`Failed to parse tool call input JSON:`, e, `Raw data:`, this.currentContentBlock.partialInput);
      }
    }

    this.currentContentBlock = null;
    this.currentIndex = null;
  }

  private handleMessageStop(data: SSEData): CompleteMessage | null {
    if (!this.currentMessage) return null;

    const completeMessage = { ...this.currentMessage };
    this.reset();
    
    return completeMessage;
  }

  public getCurrentState(): { message: CompleteMessage | null; currentBlock: ContentBlock | null } {
    return {
      message: this.currentMessage ? { ...this.currentMessage } : null,
      currentBlock: this.currentContentBlock ? { ...this.currentContentBlock } : null
    };
  }
}

// =============================================================================
// Main SSE Parser Functions
// =============================================================================

/**
 * Parse SSE content from an array of SSE event strings
 * Main function for SSE parsing - use this directly
 */
export function parseSSEContent(events: string[]): CompleteMessage | null {
  const assembler = new SSEMessageAssembler();
  let finalMessage: CompleteMessage | null = null;

  const sseEvents = parseSSEEvents(events);

  for (const sseEvent of sseEvents) {
    const eventData = extractEventData(sseEvent);

    if (!eventData) {
      continue;
    }

    const result = assembler.processEvent(eventData);
    if (result) {
      finalMessage = result;
    }
  }

  // If no message_stop event received, get current state
  if (!finalMessage) {
    const state = assembler.getCurrentState();
    finalMessage = state.message;
  }

  return finalMessage;
}

/**
 * Parses and filters SSE events from raw event strings
 */
function parseSSEEvents(events: string[]): string[] {
  const fullSSEStream = events.join('\n');

  return fullSSEStream
    .split('\n\n')
    .filter(event => event.trim())
    .filter(sseEvent => !isPingEvent(sseEvent));
}

/**
 * Checks if SSE event is a ping event
 */
function isPingEvent(sseEvent: string): boolean {
  const lines = sseEvent.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('event:')) {
      const eventType = trimmedLine.replace(/^event:\s*/, '').trim();
      return eventType === SSE_EVENT_TYPES.PING;
    }
  }
  return false;
}

/**
 * Extracts event data from SSE event string
 */
function extractEventData(sseEvent: string): string {
  const lines = sseEvent.split('\n');
  let eventData = '';

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('data:')) {
      eventData = trimmedLine.replace(/^data:\s*/, '').trim();
    }
  }

  return eventData;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract content blocks by type from a complete message
 */
export function extractContentByType(
  message: CompleteMessage,
  contentType: ContentBlock['type']
): ContentBlock[] {
  return message.content.filter(block => block.type === contentType);
}

/**
 * Get all text content from a complete message (joins all text blocks)
 */
export function getAllTextContent(message: CompleteMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === CONTENT_BLOCK_TYPES.TEXT)
    .map(block => block.text)
    .join('\n')
    .trim();
}

/**
 * Get all tool calls from a complete message
 */
export function getAllToolCalls(message: CompleteMessage): ToolUseContent[] {
  return message.content
    .filter((block): block is ToolUseContent => block.type === CONTENT_BLOCK_TYPES.TOOL_USE);
}

/**
 * Format tool calls for output with proper error handling
 */
function formatToolCalls(toolCalls: ToolUseContent[]): Array<Record<string, unknown>> {
  return toolCalls.map(toolCall => {
    const sanitized: Record<string, unknown> = {
      type: toolCall.type,
      id: toolCall.id,
      name: toolCall.name
    };

    // Use complete input if available and not empty, otherwise try partialInput
    if (toolCall.input && Object.keys(toolCall.input).length > 0) {
      sanitized.input = toolCall.input;
    } else if (toolCall.partialInput && toolCall.partialInput.trim()) {
      sanitized.input = parsePartialInput(toolCall.partialInput);
    } else {
      sanitized.input = {};
    }

    return sanitized;
  });
}

/**
 * Parse partial input with error handling
 */
function parsePartialInput(partialInput: string): unknown {
  try {
    const parsedInput = JSON.parse(partialInput);
    // Return parsed input if it's a non-empty object
    return parsedInput && Object.keys(parsedInput as Record<string, unknown>).length > 0
      ? parsedInput
      : partialInput;
  } catch (e) {
    // Return raw string if parsing fails
    return partialInput;
  }
}

/**
 * Create error response for failed SSE parsing
 */
function createErrorResponse(events: string[]): string {
  return `Error: Failed to parse SSE events. Original events:\n${JSON.stringify(events, null, 2)}`;
}

/**
 * Main export function: Parse SSE events and return formatted content
 */
export function getFullContent(events: string[]): Record<string, unknown> | string {
  const result = parseSSEContent(events);

  if (!result) {
    return createErrorResponse(events);
  }

  const textContent = getAllTextContent(result);
  const toolCalls = getAllToolCalls(result);

  const output: Record<string, unknown> = {};

  // Only add text content if it's not empty
  if (textContent) {
    output.text = textContent;
  }

  // Format tool calls output
  if (toolCalls.length > 0) {
    output.toolCalls = formatToolCalls(toolCalls);
  }

  return output;
}