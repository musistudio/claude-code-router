import { EventEmitter } from "node:events";
import { IAgent } from "../agents/type";
import agentsManager from "../agents";
import { sessionUsageCache } from "./cache";
import { apiKeyAuth } from "../middleware/auth";
import { router } from "./router";
import { SSEParserTransform } from "./SSEParser.transform";
import { SSESerializerTransform } from "./SSESerializer.transform";
import { rewriteStream } from "./rewriteStream";
import {getFullContent} from "./SSEParserUtils"
import JSON5 from "json5";

/**
 * Agent processing state for handling tool calls
 */
interface AgentProcessingState {
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
interface ToolMessage {
  tool_use_id: string;
  type: "tool_result";
  content: string;
}

/**
 * Assistant message structure for tool use
 */
interface AssistantMessage {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

/**
 * Stream processing metadata
 */
interface StreamMetadata {
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
interface PSSEResponse {
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
interface StreamErrorInfo {
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

/**
 * Setup request logging hook
 */
export function setupRequestLoggingHook(server: any): void {
  server.addHook("preHandler", async (req, reply) => {
    const requestData = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    };

    req.log.info({
      requestData,
      msg: "Request details"
    }, "Incoming request");
  });
}

/**
 * Setup response logging hook
 */
export function setupResponseLoggingHook(server: any): void {
  server.addHook("onSend", async (req, reply, payload) => {
    const responseData = {
      method: req.method,
      url: req.url,
      statusCode: reply.statusCode,
      headers: reply.getHeaders(),
      timestamp: new Date().toISOString()
    };

    const responseBody = extractResponseBody(payload);

    if (payload instanceof ReadableStream) {
      responseData.body = {
        type: "ReadableStream",
        readable: true,
        note: "Streaming response - complete content will be logged when stream ends"
      };
      payload = createLoggingWrappedStream(payload, req, reply);
    } else {
      responseData.body = responseBody;
    }

    req.log.info({
      responseData,
      msg: "Response details"
    }, "Response completed");

    return payload;
  });
}

/**
 * Extract response body for logging
 */
function extractResponseBody(payload: any): any {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }

  if (typeof payload === 'object') {
    return payload;
  }

  return { type: typeof payload, content: payload };
}

/**
 * Setup authentication hook
 */
export function setupAuthHook(server: any, config: any): void {
  server.addHook("preHandler", async (req, reply) => {
    return new Promise((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });
}

/**
 * Setup agent and routing hook
 */
export function setupAgentAndRoutingHook(server: any, config: any, event: EventEmitter): void {
  server.addHook("preHandler", async (req, reply) => {
    if (isMessagesEndpoint(req)) {
      const activeAgents = processActiveAgents(req, config);

      if (activeAgents.length) {
        req.agents = activeAgents;
      }

      await router(req, reply, { config, event });
    }
  });
}

/**
 * Check if request is for messages endpoint
 */
function isMessagesEndpoint(req: any): boolean {
  return req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens");
}

/**
 * Process active agents and update request
 */
function processActiveAgents(req: any, config: any): string[] {
  const activeAgents: string[] = [];

  for (const agent of agentsManager.getAllAgents()) {
    if (agent.shouldHandle(req, config)) {
      activeAgents.push(agent.name);
      agent.reqHandler(req, config);
      addAgentToolsToRequest(agent, req);
    }
  }

  return activeAgents;
}

/**
 * Add agent tools to request body
 */
function addAgentToolsToRequest(agent: IAgent, req: any): void {
  if (agent.tools.size) {
    if (!req.body?.tools?.length) {
      req.body.tools = [];
    }
    const tools = Array.from(agent.tools.values()).map(item => ({
      name: item.name,
      description: item.description,
      input_schema: item.input_schema
    }));
    req.body.tools.unshift(...tools);
  }
}

/**
 * Setup error event hook
 */
export function setupErrorEventHook(server: any, event: EventEmitter): void {
  server.addHook("onError", async (request, reply, error) => {
    event.emit('onError', request, reply, error);
  });
}

/**
 * Setup send event hook
 */
export function setupSendEventHook(server: any, event: EventEmitter): void {
  server.addHook("onSend", async (req, reply, payload) => {
    event.emit('onSend', req, reply, payload);
    return payload;
  });
}

/**
 * Setup agent processing hook for handling agent interactions
 */
export function setupAgentProcessingHook(server: any, config: any): void {
  server.addHook("onSend", async (req, reply, payload) => {
    if (shouldProcessAgentRequest(req)) {
      return await processAgentRequest(req, payload, config);
    }

    return handleErrorResponse(payload);
  });
}

/**
 * Check if request should be processed by agent
 */
function shouldProcessAgentRequest(req: any): boolean {
  return req.sessionId && isMessagesEndpoint(req);
}

/**
 * Process agent request
 */
async function processAgentRequest(req: any, payload: any, config: any): Promise<any> {
  if (payload instanceof ReadableStream) {
    return handleStreamPayload(payload, req, config);
  }

  return handleNonStreamPayload(payload, req);
}

/**
 * Handle stream payload
 */
function handleStreamPayload(payload: ReadableStream, req: any, config: any): ReadableStream {
  if (req.agents) {
    return handleAgentStreamProcessing(payload, req, config);
  }

  const [originalStream, clonedStream] = payload.tee();
  readSessionUsageFromStream(clonedStream, req.sessionId);
  return originalStream;
}

/**
 * Handle non-stream payload
 */
function handleNonStreamPayload(payload: any, req: any): any {
  sessionUsageCache.put(req.sessionId, payload.usage);

  if (typeof payload === 'object') {
    if (payload.error) {
      throw payload.error;
    }
    return payload;
  }
}

/**
 * Handle error payload
 */
function handleErrorResponse(payload: any): any {
  if (typeof payload === 'object' && payload.error) {
    throw payload.error;
  }

  return payload;
}

/**
 * Setup session usage hook
 * @deprecated This functionality is now integrated in setupAgentProcessingHook
 */
export function setupSessionUsageHook(server: any, config: any): void {
  // Session usage tracking is now handled in setupAgentProcessingHook
}

/**
 * Setup error payload hook
 * @deprecated This functionality is now integrated in setupAgentProcessingHook
 */
export function setupErrorPayloadHook(server: any): void {
  // Error payload handling is now integrated in setupAgentProcessingHook
}

// ============= Stream Utilities =============

/**
 * Pads a number with leading zero if needed
 */
function padZero(num: number): string {
  return (num > 9 ? "" : "0") + num;
}

/**
 * Generates log file names with timestamp
 */
export function generateLogFileName(time?: Date, index?: number): string {
  if (!time) {
    time = new Date();
  }

  const yearAndMonth = time.getFullYear() + "" + padZero(time.getMonth() + 1);
  const day = padZero(time.getDate());
  const hour = padZero(time.getHours());
  const minute = padZero(time.getMinutes());
  const second = padZero(time.getSeconds());

  return `./logs/ccr-${yearAndMonth}${day}${hour}${minute}${second}${index ? `_${index}` : ''}.log`;
}


/**
 * Create a wrapped stream that logs complete response content
 */
function createLoggingWrappedStream(
  originalStream: ReadableStream,
  req: any,
  reply: any
): ReadableStream {
  const loggedChunks: string[] = [];
  const startTime = Date.now();

  return new ReadableStream({
    async start(controller) {
      const reader = originalStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            await handleStreamCompletion(loggedChunks, startTime, req, reply, controller);
            break;
          }

          const chunkText = new TextDecoder().decode(value);
          loggedChunks.push(chunkText);
          controller.enqueue(value);
        }
      } catch (error) {
        handleStreamError(error as Error, loggedChunks, startTime, req, controller);
      }
    }
  });
}

/**
 * Handle stream completion and logging
 */
async function handleStreamCompletion(
  loggedChunks: string[],
  startTime: number,
  req: any,
  reply: any,
  controller: ReadableStreamDefaultController
): Promise<void> {
  const endTime = Date.now();
  const duration = endTime - startTime;

  req.log.info({
    streamCompleteResponse: {
      type: "ReadableStream_complete_response",
      content: getFullContent(loggedChunks),
      metadata: createStreamMetadata(loggedChunks.length, duration, req, reply),
    },
    msg: "Complete stream response"
  }, "Stream response completed - full body");

  controller.close();
}

/**
 * Handle stream errors
 */
function handleStreamError(
  error: Error,
  loggedChunks: string[],
  startTime: number,
  req: any,
  controller: ReadableStreamDefaultController
): void {
  const endTime = Date.now();
  const duration = endTime - startTime;

  req.log.error({
    streamError: createStreamErrorInfo(error, loggedChunks.length, duration, req),
  }, "Stream reading error");

  controller.error(error);
}

/**
 * Create stream metadata for logging
 */
function createStreamMetadata(
  totalChunks: number,
  duration: number,
  req: any,
  reply: any
): StreamMetadata {
  return {
    totalChunks,
    duration,
    method: req.method,
    url: req.url,
    statusCode: reply.statusCode,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create stream error information for logging
 */
function createStreamErrorInfo(
  error: Error,
  chunksCollected: number,
  duration: number,
  req: any
): StreamErrorInfo {
  return {
    error: error.message,
    stack: error.stack || '',
    metadata: {
      chunksCollected,
      duration,
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Read session usage from stream in background
 */
function readSessionUsageFromStream(stream: ReadableStream, sessionId: string): void {
  const read = async (stream: ReadableStream) => {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const dataStr = new TextDecoder().decode(value);
        if (!dataStr.startsWith("event: message_delta")) {
          continue;
        }

        const str = dataStr.slice(27);
        try {
          const message = JSON.parse(str);
          sessionUsageCache.put(sessionId, message.usage);
        } catch {
          // Ignore parsing errors
        }
      }
    } catch (readError: any) {
      handleBackgroundReadError(readError);
    } finally {
      reader.releaseLock();
    }
  };

  read(stream);
}

/**
 * Handle background read stream errors
 */
function handleBackgroundReadError(readError: any): void {
  if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
    console.error('Background read stream closed prematurely');
  } else {
    console.error('Error in background stream reading:', readError);
  }
}

// ============= Agent Stream Processing =============

/**
 * Handle agent stream processing with tool calls
 */
function handleAgentStreamProcessing(
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