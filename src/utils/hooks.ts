import { EventEmitter } from "node:events";
import { IAgent } from "../agents/type";
import agentsManager from "../agents";
import { sessionUsageCache } from "./cache";
import { apiKeyAuth } from "../middleware/auth";
import { router } from "./router";
import {
  createLoggingWrappedStream,
  readSessionUsageFromStream,
  parseSSEContent
} from "./streamUtils";
import { handleAgentStreamProcessing } from "./agentProcessor";

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