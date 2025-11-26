interface TextContent {
  type: 'text';
  text: string;
}

interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
  partialInput?: string;
}

interface RedactedThinkingContent {
  type: 'redacted_thinking';
  text: string;
}

type ContentBlock = TextContent | ToolUseContent | RedactedThinkingContent;

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
      const data: SSEData = JSON.parse(eventData);
      
      switch (data.type) {
        case 'message_start':
          return this.handleMessageStart(data);
        case 'content_block_start':
          this.handleContentBlockStart(data);
          break;
        case 'content_block_delta':
          this.handleContentBlockDelta(data);
          break;
        case 'content_block_stop':
          this.handleContentBlockStop(data);
          break;
        case 'message_stop':
          return this.handleMessageStop(data);
        case 'ping':
          // 忽略心跳包，但保持当前状态
          break;
        default:
          console.warn('未知的 SSE 事件类型:', data.type);
      }
    } catch (error) {
      console.error('解析 SSE 事件数据失败:', error, '原始数据:', eventData);
    }
    
    return null;
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
      case 'text':
        this.currentContentBlock = {
          type: 'text',
          text: contentBlock.text || ''
        };
        break;
      
      case 'tool_use':
        this.currentContentBlock = {
          type: 'tool_use',
          id: contentBlock.id || '',
          name: contentBlock.name || '',
          input: contentBlock.input || {},
          partialInput: ''
        };
        break;
      
      case 'redacted_thinking':
        this.currentContentBlock = {
          type: 'redacted_thinking',
          text: contentBlock.text || ''
        };
        break;
      
      default:
        console.warn('未知的内容块类型:', contentBlock.type);
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
      case 'text':
        if (delta.text) {
          this.currentContentBlock.text += delta.text;
        }
        break;
      
      case 'tool_use':
        if (delta.type === 'input_json_delta' && delta.partial_json) {
          // 累积部分 JSON 输入
          if (!this.currentContentBlock.partialInput) {
            this.currentContentBlock.partialInput = '';
          }
          this.currentContentBlock.partialInput += delta.partial_json;
          
          // 尝试解析为完整对象（可能失败，因为 JSON 还不完整）
          try {
            this.currentContentBlock.input = JSON.parse(this.currentContentBlock.partialInput);
          } catch (e) {
            // JSON 还不完整，继续累积
          }
        }
        break;
      
      case 'redacted_thinking':
        if (delta.text) {
          this.currentContentBlock.text += delta.text;
        }
        break;
    }

    // 更新消息中的对应块
    this.currentMessage.content[this.currentIndex] = this.currentContentBlock;
  }

  private handleContentBlockStop(data: SSEData): void {
    if (this.currentContentBlock?.type === 'tool_use' && this.currentContentBlock.partialInput) {
      // 对于工具调用，在块结束时尝试最终解析
      try {
        this.currentContentBlock.input = JSON.parse(this.currentContentBlock.partialInput);
        delete this.currentContentBlock.partialInput;
      } catch (e) {
        console.error('工具调用输入 JSON 解析失败:', e, '原始数据:', this.currentContentBlock.partialInput);
        // 保留部分输入以便调试
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

// 主函数 - 直接使用这个函数
export function parseSSEContent(events: string[]): CompleteMessage | null {
  const assembler = new SSEMessageAssembler();
  let finalMessage: CompleteMessage | null = null;

  for (const event of events) {
    // 清理事件数据（移除 "data: " 前缀等）
    const cleanEvent = event.replace(/^data: /, '').trim();
    
    // 跳过空行和注释
    if (!cleanEvent || cleanEvent.startsWith(':')) continue;
    
    const result = assembler.processEvent(cleanEvent);
    if (result) {
      finalMessage = result;
    }
  }

  // 如果没有收到 message_stop 事件，但想强制获取当前状态
  if (!finalMessage) {
    const state = assembler.getCurrentState();
    finalMessage = state.message;
  }

  return finalMessage;
}

// 工具函数：从完整消息中提取特定类型的内容
export function extractContentByType(message: CompleteMessage, type: 'text' | 'tool_use' | 'redacted_thinking'): any[] {
  return message.content.filter(block => block.type === type);
}

// 工具函数：获取所有文本内容（合并所有 text 块）
export function getAllTextContent(message: CompleteMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

// 工具函数：获取所有工具调用
export function getAllToolCalls(message: CompleteMessage): ToolUseContent[] {
  return message.content.filter((block): block is ToolUseContent => block.type === 'tool_use');
}

export function getFullContent(events: string[]): string {
  const result = parseSSEContent(events);
  if( result != null )
      return  getAllTextContent(result) + '\n' +  JSON.stringify( getAllToolCalls(result) );
  return JSON.stringify(events);
}


// 使用示例
/*
const sseEvents = [
  `data: {"type": "message_start", "message": {"id": "msg_123", "role": "assistant", "model": "claude-3-sonnet"}}`,
  `data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}`,
  `data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}`,
  `data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " World"}}`,
  `data: {"type": "content_block_stop", "index": 0}`,
  `data: {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "id": "toolu_001", "name": "get_weather"}}`,
  `data: {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "{\\"location\\":\\"Beijing\\""}}`,
  `data: {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": ",\\"unit\\":\\"celsius\\"}"}}`,
  `data: {"type": "content_block_stop", "index": 1}`,
  `data: {"type": "message_stop"}`,
];

const result = parseSSEContent(sseEvents);
if (result) {
  console.log('完整消息:', JSON.stringify(result, null, 2));
  console.log('所有文本:', getAllTextContent(result));
  console.log('工具调用:', getAllToolCalls(result));
}
*/