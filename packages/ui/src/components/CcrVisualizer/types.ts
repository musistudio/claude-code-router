// All interfaces and constants shared across CcrVisualizer modules

export interface FallbackEntry {
  model: string;
  status: 'success' | 'failed' | 'pending';
  httpStatus: number | null;
  errorBody: string | null;
  isPrimary: boolean;
}

export interface InjectedContextItem {
  label: string;
  body: string;
}

export interface ConvBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'image';
  preview?: string;
  /** Full text (up to 5000 chars) when the block text exceeds the 400-char preview limit. */
  fullText?: string;
  name?: string;
  id?: string;
  tool_use_id?: string;
  media_type?: string;
  data?: string;
  size_kb?: number;
  /** Images nested inside a tool_result content array. */
  nestedImages?: Array<{ media_type: string; size_kb: number }>;
}

export interface ConvMessage {
  role: string;
  blocks: ConvBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: object;
}

export interface ToolCallDetail {
  name: string;
  id: string;
  input: string;
}

export interface OutgoingToolId {
  id: string;
  name: string;
}

export interface LogEvent {
  time: number;
  type: string;
  detail: string;
  errorBody?: string;
}

export interface ParallelGroup {
  role: 'fork' | 'branch' | 'join';
  groupId: string;
  branchCount?: number;
  localTools?: OutgoingToolId[];
  subagentTools?: OutgoingToolId[];
  forkRid?: string;
  joinRid?: string;
}

export interface CcrRequest {
  reqId: string;
  startTime: number;
  endTime: number | null;
  method: string;
  url: string;
  messageCount: number;
  toolCount: number;
  maxTokens: number | null;
  temperature: number | null;
  originalModel: string | null;
  thinkingBudget: number | null;   // token budget when type=enabled
  thinkingMode: 'enabled' | 'adaptive' | null; // thinking/reasoning mode
  systemPrompt: string | null;
  userQuery: string | null;
  injectedContext: InjectedContextItem[];
  toolDefinitions: ToolDefinition[];
  conversationSummary: ConvMessage[] | null;
  incomingToolIds: string[];
  scenario: string;
  routedModel: string | null;
  routedUrl: string | null;
  provider: string | null;
  statusCode: number | null;
  responseTime: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingChars: number;
  responseText: string | null;
  thinkingText: string | null;
  toolCallDetails: ToolCallDetail[];
  outgoingToolIds: OutgoingToolId[];
  finalToolCount: number;
  requestCost: number | null;
  fallbackChain: FallbackEntry[];
  hasFallback: boolean;
  allFallbacksFailed: boolean;
  routingError: string | null;
  events: LogEvent[];
  parallelGroup: ParallelGroup | null;
  _responseChunks: string[];
  _thinkingChunks: string[];
  _blockMap: Map<number, { name: string; id: string }>;
  _toolCallInputChunks: Map<number, string[]>;
}

export const INJECTED_PREFIXES = ['<system-reminder', '<local-command', '[SUGGESTION MODE', '[CLAUDE'];
