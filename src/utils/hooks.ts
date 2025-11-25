import { EventEmitter } from "node:events";
import { IAgent } from "../agents/type";
import agentsManager from "../agents";
import { sessionUsageCache } from "./cache";
import { SSEParserTransform } from "./SSEParser.transform";
import { SSESerializerTransform } from "./SSESerializer.transform";
import { rewriteStream } from "./rewriteStream";
import JSON5 from "json5";
import { apiKeyAuth } from "../middleware/auth";
import { router } from "./router";

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

    let responseBody: any;

    if (payload instanceof ReadableStream) {
      responseBody = {
        type: "ReadableStream",
        readable: true,
        note: "Streaming response - complete content will be logged when stream ends"
      };

      payload = createLoggingWrappedStream(payload, req, reply);
    } else if (payload === null || payload === undefined) {
      responseBody = null;
    } else if (typeof payload === 'string') {
      responseBody = payload;
    } else if (Buffer.isBuffer(payload)) {
      responseBody = payload.toString('utf8');
    } else if (typeof payload === 'object') {
      responseBody = payload;
    } else {
      responseBody = { type: typeof payload, content: payload };
    }

    responseData.body = responseBody;

    req.log.info({
      responseData,
      msg: "Response details"
    }, "Response completed");

    return payload;
  });
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
    if (req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      const activeAgents: string[] = [];

      for (const agent of agentsManager.getAllAgents()) {
        if (agent.shouldHandle(req, config)) {
          activeAgents.push(agent.name);
          agent.reqHandler(req, config);

          if (agent.tools.size) {
            if (!req.body?.tools?.length) {
              req.body.tools = [];
            }
            req.body.tools.unshift(...Array.from(agent.tools.values()).map(item => ({
              name: item.name,
              description: item.description,
              input_schema: item.input_schema
            })));
          }
        }
      }

      if (activeAgents.length) {
        req.agents = activeAgents;
      }

      await router(req, reply, { config, event });
    }
  });
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
    if (req.sessionId && req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      if (payload instanceof ReadableStream) {
        if (req.agents) {
          return handleAgentStreamProcessing(payload, req, config);
        }

        const [originalStream, clonedStream] = payload.tee();
        readSessionUsageFromStream(clonedStream, req.sessionId);
        return originalStream;
      }

      sessionUsageCache.put(req.sessionId, payload.usage);
      if (typeof payload === 'object') {
        if (payload.error) {
          throw payload.error;
        }
        return payload;
      }
    }

    if (typeof payload === 'object' && payload.error) {
      throw payload.error;
    }

    return payload;
  });
}

/**
 * Setup session usage hook
 */
export function setupSessionUsageHook(server: any, config: any): void {
  // Session usage tracking is now handled in setupAgentProcessingHook
}

/**
 * Setup error payload hook
 */
export function setupErrorPayloadHook(server: any): void {
  // Error payload handling is now integrated in setupAgentProcessingHook
}

/**
 * Pads a number with leading zero if needed
 */
function padZero(num: number): string {
  return (num > 9 ? "" : "0") + num;
}

/**
 * Generates log file names with timestamp
 */
function logFileNameGenerator(time?: Date, index?: number): string {
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
 * Parse SSE content to extract structured information
 */
function parseSSEContent(fullContent: string): any {
  try {
    const events = fullContent.split('\n\n').filter(event => event.trim());
    const messages = [];

    for (const event of events) {
      const lines = event.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line.length > 6) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.type === 'message_delta' && data.usage) {
              messages.push({ type: 'usage', data: data.usage });
            } else if (data.type === 'content_block_delta' && data.delta?.text) {
              messages.push({ type: 'text', data: data.delta.text });
            } else if (data.type === 'content_block_start' && data.content_block?.type === 'text') {
              messages.push({ type: 'text_start' });
            }
          } catch (e) {
            // Ignore parsing errors and continue processing other data
          }
        }
      }
    }

    if (messages.length > 0) {
      return {
        type: "parsed_sse_response",
        events: messages,
        fullSSEContent: fullContent,
        summary: {
          totalEvents: events.length,
          hasUsage: messages.some(m => m.type === 'usage'),
          textEvents: messages.filter(m => m.type === 'text').length
        }
      };
    }
  } catch (parseError) {
    console.warn('Failed to parse SSE content:', parseError.message);
  }

  return fullContent;
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
            const fullContent = loggedChunks.join('');
            const endTime = Date.now();
            const duration = endTime - startTime;
            const parsedContent = parseSSEContent(fullContent);

            req.log.info({
              streamCompleteResponse: {
                type: "ReadableStream_complete_response",
                content: parsedContent,
                metadata: {
                  totalChunks: loggedChunks.length,
                  contentSize: fullContent.length,
                  duration: duration,
                  method: req.method,
                  url: req.url,
                  statusCode: reply.statusCode,
                  timestamp: new Date().toISOString()
                }
              },
              msg: "Complete stream response"
            }, "Stream response completed - full body");

            controller.close();
            break;
          }

          const chunkText = new TextDecoder().decode(value);
          loggedChunks.push(chunkText);
          controller.enqueue(value);
        }
      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        req.log.error({
          streamError: {
            error: error.message,
            stack: error.stack,
            metadata: {
              chunksCollected: loggedChunks.length,
              duration: duration,
              method: req.method,
              url: req.url,
              timestamp: new Date().toISOString()
            }
          }
        }, "Stream reading error");

        controller.error(error);
      }
    }
  });
}

/**
 * Handle agent stream processing with tool calls
 */
function handleAgentStreamProcessing(payload: ReadableStream, req: any, config: any): ReadableStream {
  const abortController = new AbortController();
  const eventStream = payload.pipeThrough(new SSEParserTransform());

  const agentState = {
    currentAgent: undefined as IAgent | undefined,
    currentToolIndex: -1,
    currentToolName: '',
    currentToolArgs: '',
    currentToolId: '',
    toolMessages: [] as any[],
    assistantMessages: [] as any[]
  };

  return rewriteStream(eventStream, async (data, controller) => {
    try {
      // Handle tool call start
      if (data.event === 'content_block_start' && data?.data?.content_block?.name) {
        const agent = req.agents.find((name: string) =>
          agentsManager.getAgent(name)?.tools.get(data.data.content_block.name)
        );

        if (agent) {
          agentState.currentAgent = agentsManager.getAgent(agent);
          agentState.currentToolIndex = data.data.index;
          agentState.currentToolName = data.data.content_block.name;
          agentState.currentToolId = data.data.content_block.id;
          return undefined;
        }
      }

      // Collect tool arguments
      if (agentState.currentToolIndex > -1 &&
          data.data.index === agentState.currentToolIndex &&
          data.data?.delta?.type === 'input_json_delta') {
        agentState.currentToolArgs += data.data?.delta?.partial_json;
        return undefined;
      }

      // Handle tool call completion
      if (agentState.currentToolIndex > -1 &&
          data.data.index === agentState.currentToolIndex &&
          data.data.type === 'content_block_stop') {
        await processToolCall(agentState, req, config);
        return undefined;
      }

      // Handle message delta with tool results
      if (data.event === 'message_delta' && agentState.toolMessages.length) {
        return await retryRequestWithToolResults(agentState, req, config, controller, abortController);
      }

      return data;
    } catch (error: any) {
      handleStreamProcessingError(error, abortController);
    }
  }).pipeThrough(new SSESerializerTransform());
}

/**
 * Process a completed tool call
 */
async function processToolCall(agentState: any, req: any, config: any): Promise<void> {
  try {
    const args = JSON5.parse(agentState.currentToolArgs);

    agentState.assistantMessages.push({
      type: "tool_use",
      id: agentState.currentToolId,
      name: agentState.currentToolName,
      input: args
    });

    const toolResult = await agentState.currentAgent?.tools.get(agentState.currentToolName)?.handler(args, {
      req,
      config
    });

    agentState.toolMessages.push({
      "tool_use_id": agentState.currentToolId,
      "type": "tool_result",
      "content": toolResult
    });

    // Reset agent state
    agentState.currentAgent = undefined;
    agentState.currentToolIndex = -1;
    agentState.currentToolName = '';
    agentState.currentToolArgs = '';
    agentState.currentToolId = '';
  } catch (e) {
    console.error('Error processing tool call:', e);
  }
}

/**
 * Retry request with tool results
 */
async function retryRequestWithToolResults(
  agentState: any,
  req: any,
  config: any,
  controller: any,
  abortController: AbortController
): Promise<void> {
  req.body.messages.push({
    role: 'assistant',
    content: agentState.assistantMessages
  });

  req.body.messages.push({
    role: 'user',
    content: agentState.toolMessages
  });

  const response = await fetch(`http://127.0.0.1:${config.PORT || 3456}/v1/messages`, {
    method: "POST",
    headers: {
      'x-api-key': config.APIKEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(req.body),
  });

  if (!response.ok) {
    return undefined;
  }

  const stream = response.body!.pipeThrough(new SSEParserTransform());
  const reader = stream.getReader();

  while (true) {
    try {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      if (['message_start', 'message_stop'].includes(value.event)) {
        continue;
      }

      if (!controller.desiredSize) {
        break;
      }

      controller.enqueue(value);
    } catch (readError: any) {
      if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        abortController.abort();
        break;
      }
      throw readError;
    }
  }

  return undefined;
}

/**
 * Handle stream processing errors
 */
function handleStreamProcessingError(error: any, abortController: AbortController): void {
  console.error('Unexpected error in stream processing:', error);

  if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
    abortController.abort();
    return undefined;
  }

  throw error;
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
      if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.error('Background read stream closed prematurely');
      } else {
        console.error('Error in background stream reading:', readError);
      }
    } finally {
      reader.releaseLock();
    }
  };

  read(stream);
}