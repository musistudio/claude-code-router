import { IAgent } from "../agents/type";

/**
 * Agent processing state for handling tool calls
 */
export interface AgentProcessingState {
  currentAgent?: IAgent;
  currentToolIndex: number;
  currentToolName: string;
  currentToolArgs: string;
  currentToolId: string;
  toolMessages: ToolMessage[];
  assistantMessages: AssistantMessage[];
}

/**
 * Tool message structure
 */
export interface ToolMessage {
  tool_use_id: string;
  type: "tool_result";
  content: string;
}

/**
 * Assistant message structure for tool use
 */
export interface AssistantMessage {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

/**
 * Stream processing metadata
 */
export interface StreamMetadata {
  totalChunks: number;
  duration: number;
  method: string;
  url: string;
  statusCode: number;
  timestamp: string;
}

/**
 * Parsed SSE response structure
 */
export interface PSSEResponse {
  type: "parsed_sse_response";
  body: string;
  summary: {
    totalEvents: number;
    hasUsage: boolean;
    textEvents: number;
  };
}

/**
 * Stream error information
 */
export interface StreamErrorInfo {
  error: string;
  stack: string;
  metadata: {
    chunksCollected: number;
    duration: number;
    method: string;
    url: string;
    timestamp: string;
  };
}