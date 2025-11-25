import agentsManager from "../agents";
import { SSEParserTransform } from "./SSEParser.transform";
import { SSESerializerTransform } from "./SSESerializer.transform";
import { rewriteStream } from "./rewriteStream";
import JSON5 from "json5";
import {
  AgentProcessingState,
  AssistantMessage,
  ToolMessage
} from "./types";

/**
 * Handle agent stream processing with tool calls
 */
export function handleAgentStreamProcessing(
  payload: ReadableStream,
  req: any,
  config: any
): ReadableStream {
  const abortController = new AbortController();
  const eventStream = payload.pipeThrough(new SSEParserTransform());
  const agentState = createInitialAgentState();

  return rewriteStream(eventStream, async (data, controller) => {
    try {
      const result = await processStreamEvent(data, agentState, req, config);

      if (result === 'continue') {
        return undefined;
      }

      if (result === 'retry_with_tools') {
        await retryRequestWithToolResults(agentState, req, config, controller, abortController);
        return undefined;
      }

      return data;
    } catch (error: any) {
      handleStreamProcessingError(error, abortController);
    }
  }).pipeThrough(new SSESerializerTransform());
}

/**
 * Create initial agent processing state
 */
function createInitialAgentState(): AgentProcessingState {
  return {
    currentAgent: undefined,
    currentToolIndex: -1,
    currentToolName: '',
    currentToolArgs: '',
    currentToolId: '',
    toolMessages: [],
    assistantMessages: []
  };
}

/**
 * Process individual stream events
 */
async function processStreamEvent(
  data: any,
  agentState: AgentProcessingState,
  req: any,
  config: any
): Promise<'continue' | 'retry_with_tools' | 'pass_through'> {
  // Handle tool call start
  if (isToolCallStart(data)) {
    const agent = findAgentForTool(data.data.content_block.name, req);
    if (agent) {
      updateAgentStateForToolStart(agentState, agent, data);
      return 'continue';
    }
  }

  // Collect tool arguments
  if (isToolArgumentCollection(data, agentState)) {
    collectToolArguments(agentState, data);
    return 'continue';
  }

  // Handle tool call completion
  if (isToolCallCompletion(data, agentState)) {
    await processToolCall(agentState, req, config);
    return 'continue';
  }

  // Handle message delta with tool results
  if (isMessageDeltaWithToolResults(data, agentState)) {
    return 'retry_with_tools';
  }

  return 'pass_through';
}

/**
 * Check if event is tool call start
 */
function isToolCallStart(data: any): boolean {
  return data.event === 'content_block_start' &&
         data?.data?.content_block?.name;
}

/**
 * Find agent that can handle the tool
 */
function findAgentForTool(toolName: string, req: any): string | undefined {
  return req.agents.find((name: string) =>
    agentsManager.getAgent(name)?.tools.get(toolName)
  );
}

/**
 * Update agent state when tool call starts
 */
function updateAgentStateForToolStart(
  agentState: AgentProcessingState,
  agentName: string,
  data: any
): void {
  const agent = agentsManager.getAgent(agentName);
  agentState.currentAgent = agent;
  agentState.currentToolIndex = data.data.index;
  agentState.currentToolName = data.data.content_block.name;
  agentState.currentToolId = data.data.content_block.id;
}

/**
 * Check if event is for collecting tool arguments
 */
function isToolArgumentCollection(data: any, agentState: AgentProcessingState): boolean {
  return agentState.currentToolIndex > -1 &&
         data.data.index === agentState.currentToolIndex &&
         data.data?.delta?.type === 'input_json_delta';
}

/**
 * Collect tool arguments from delta
 */
function collectToolArguments(agentState: AgentProcessingState, data: any): void {
  agentState.currentToolArgs += data.data?.delta?.partial_json;
}

/**
 * Check if event is tool call completion
 */
function isToolCallCompletion(data: any, agentState: AgentProcessingState): boolean {
  return agentState.currentToolIndex > -1 &&
         data.data.index === agentState.currentToolIndex &&
         data.data.type === 'content_block_stop';
}

/**
 * Process a completed tool call
 */
async function processToolCall(
  agentState: AgentProcessingState,
  req: any,
  config: any
): Promise<void> {
  try {
    const args = JSON5.parse(agentState.currentToolArgs);

    const assistantMessage = createAssistantMessage(agentState);
    agentState.assistantMessages.push(assistantMessage);

    const toolResult = await executeTool(agentState, args, req, config);
    const toolMessage = createToolMessage(agentState.currentToolId, toolResult);
    agentState.toolMessages.push(toolMessage);

    resetAgentToolState(agentState);
  } catch (error) {
    console.error('Error processing tool call:', error);
  }
}

/**
 * Create assistant message for tool use
 */
function createAssistantMessage(agentState: AgentProcessingState): AssistantMessage {
  return {
    type: "tool_use",
    id: agentState.currentToolId,
    name: agentState.currentToolName,
    input: JSON5.parse(agentState.currentToolArgs)
  };
}

/**
 * Execute tool and get result
 */
async function executeTool(
  agentState: AgentProcessingState,
  args: any,
  req: any,
  config: any
): Promise<string> {
  const tool = agentState.currentAgent?.tools.get(agentState.currentToolName);
  if (!tool) {
    throw new Error(`Tool ${agentState.currentToolName} not found`);
  }

  return await tool.handler(args, { req, config });
}

/**
 * Create tool result message
 */
function createToolMessage(toolUseId: string, toolResult: string): ToolMessage {
  return {
    tool_use_id: toolUseId,
    type: "tool_result",
    content: toolResult
  };
}

/**
 * Reset agent tool-specific state
 */
function resetAgentToolState(agentState: AgentProcessingState): void {
  agentState.currentAgent = undefined;
  agentState.currentToolIndex = -1;
  agentState.currentToolName = '';
  agentState.currentToolArgs = '';
  agentState.currentToolId = '';
}

/**
 * Check if event is message delta with tool results
 */
function isMessageDeltaWithToolResults(data: any, agentState: AgentProcessingState): boolean {
  return data.event === 'message_delta' && agentState.toolMessages.length > 0;
}

/**
 * Retry request with tool results
 */
async function retryRequestWithToolResults(
  agentState: AgentProcessingState,
  req: any,
  config: any,
  controller: any,
  abortController: AbortController
): Promise<void> {
  addToolMessagesToRequest(req, agentState);

  const response = await makeRetryRequest(req, config);
  if (!response.ok) {
    return;
  }

  await processRetryResponse(response, controller, abortController);
}

/**
 * Add tool messages to request body
 */
function addToolMessagesToRequest(req: any, agentState: AgentProcessingState): void {
  req.body.messages.push({
    role: 'assistant',
    content: agentState.assistantMessages
  });

  req.body.messages.push({
    role: 'user',
    content: agentState.toolMessages
  });
}

/**
 * Make retry request with tool results
 */
async function makeRetryRequest(req: any, config: any): Promise<Response> {
  return await fetch(`http://127.0.0.1:${config.PORT || 3456}/v1/messages`, {
    method: "POST",
    headers: {
      'x-api-key': config.APIKEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(req.body),
  });
}

/**
 * Process retry response stream
 */
async function processRetryResponse(
  response: Response,
  controller: any,
  abortController: AbortController
): Promise<void> {
  const stream = response.body!.pipeThrough(new SSEParserTransform());
  const reader = stream.getReader();

  while (true) {
    try {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      if (shouldSkipEvent(value)) {
        continue;
      }

      if (!controller.desiredSize) {
        break;
      }

      controller.enqueue(value);
    } catch (readError: any) {
      handleRetryStreamError(readError, abortController);
      break;
    }
  }
}

/**
 * Check if event should be skipped
 */
function shouldSkipEvent(value: any): boolean {
  return ['message_start', 'message_stop'].includes(value.event);
}

/**
 * Handle retry stream errors
 */
function handleRetryStreamError(readError: any, abortController: AbortController): void {
  if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
    abortController.abort();
  } else {
    throw readError;
  }
}

/**
 * Handle stream processing errors
 */
function handleStreamProcessingError(error: any, abortController: AbortController): void {
  console.error('Unexpected error in stream processing:', error);

  if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
    abortController.abort();
    return;
  }

  throw error;
}