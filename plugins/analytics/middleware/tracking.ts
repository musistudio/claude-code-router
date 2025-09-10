import type { FastifyRequest, FastifyReply } from 'fastify';
import { analytics } from '../manager';
import { get_encoding } from "tiktoken";

const enc = get_encoding("cl100k_base");

// Helper to detect which route was actually used (mirrors router.ts logic)
function detectRouteUsed(request: TrackedRequest, config: any, tokenCount: number): string {
  const body = request.body as any;
  
  if (!config?.Router) return 'default';
  
  // Check for long context (same logic as router.ts)
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  if (tokenCount > longContextThreshold && config.Router.longContext) {
    return 'longContext';
  }
  
  // Check for CCR-SUBAGENT-MODEL in system
  if (body?.system?.length > 1 && 
      body?.system[1]?.text?.includes('<CCR-SUBAGENT-MODEL>')) {
    return 'subagent';
  }
  
  // Check for haiku -> background routing
  if (body?.model?.startsWith("claude-3-5-haiku") && config.Router.background) {
    return 'background';
  }
  
  // Check for thinking mode
  if (body?.thinking && config.Router.think) {
    return 'think';
  }
  
  // Check for web search tools
  if (Array.isArray(body?.tools) && 
      body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
      config.Router.webSearch) {
    return 'webSearch';
  }
  
  // Check for image routing (if there are image-related tools or content)
  if (body?.tools?.some((tool: any) => tool.name?.includes('image') || tool.type?.includes('image')) ||
      body?.messages?.some((msg: any) => 
        Array.isArray(msg.content) && msg.content.some((c: any) => c.type === 'image')
      )) {
    if (config.Router.image) {
      return 'image';
    }
  }
  
  return 'default';
}

interface TrackedRequest extends FastifyRequest {
  startTime?: number;
  modelInfo?: {
    model: string;
    provider: string;
  };
  selectedProvider?: string;
  routeUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokenCount?: number;
}

// Helper to extract model info from request
function extractModelInfo(request: FastifyRequest): { model: string; provider: string } {
  const body = request.body as any;
  
  // Check if it's a chat completion request
  if (body?.model) {
    return {
      model: body.model,
      provider: 'unknown' // Will be determined by routing logic
    };
  }

  // Default fallback
  return {
    model: 'unknown',
    provider: 'unknown'
  };
}

// Helper to estimate token count using tiktoken
function calculateTokenCountFromText(text: string): number {
  return enc.encode(text).length;
}

// Token calculation function (copied from router.ts for consistency)
const calculateTokenCount = (
  messages: any[],
  system: any,
  tools: any[] = []
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(contentPart.input)).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      }
    });
  }
  if (tools) {
    tools.forEach((tool: any) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};

// Helper to extract token info from response
function extractTokenInfo(request: FastifyRequest, response: any) {
  const body = request.body as any;
  
  let inputTokens = 0;
  let outputTokens = 0;

  // Priority 1: Calculate input tokens using the same method as router.ts
  if (body?.messages && Array.isArray(body.messages)) {
    try {
      inputTokens = calculateTokenCount(body.messages as any[], body.system, body.tools);
    } catch (error) {
      console.warn('Error calculating input tokens, falling back to estimation:', error);
      // Fallback estimation
      const inputText = body.messages.map((m: any) => m.content || '').join(' ');
      inputTokens = calculateTokenCountFromText(inputText);
    }
  }

  // Priority 2: Extract output tokens from response
  if (response?.choices && Array.isArray(response.choices)) {
    const outputText = response.choices.map((c: any) => 
      c.message?.content || c.text || ''
    ).join(' ');
    outputTokens = calculateTokenCountFromText(outputText);
  }

  // Priority 3: Use exact usage info from response if available
  if (response?.usage) {
    inputTokens = response.usage.prompt_tokens || inputTokens;
    outputTokens = response.usage.completion_tokens || outputTokens;
  }

  // Handle streaming responses with usage info
  if (response?.usage && typeof response.usage === 'object') {
    inputTokens = response.usage.input_tokens || response.usage.prompt_tokens || inputTokens;
    outputTokens = response.usage.output_tokens || response.usage.completion_tokens || outputTokens;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

// Middleware to track request start
export function trackingStartMiddleware(request: TrackedRequest, reply: FastifyReply, done: any) {
  // Only track API requests to AI endpoints
  if (!request.url.includes('/v1/') && !request.url.includes('/api/')) {
    return done();
  }

  request.startTime = Date.now();
  request.modelInfo = extractModelInfo(request);
  
  // **CAPTURE ORIGINAL MODEL BEFORE ROUTER PROCESSING**
  const body = request.body as any;
  if (body?.model) {
    (request as any).originalRequestModel = body.model;
  }
  
  done();
}

// Middleware to track request completion
export function trackingEndMiddleware(request: TrackedRequest, reply: FastifyReply, payload: any, done: any) {
  // Only track if we have start time
  if (!request.startTime) {
    return done(null, payload);
  }

  const endTime = Date.now();
  const responseTime = endTime - request.startTime;

  // Get config for provider detection
  let config: any = null;
  try {
    // Get config passed from plugin
    config = (request as any)._pluginConfig || null;
    if (!config) {
      // Fallback: try to get from server instance
      config = (request.server as any).config || null;
    }
  } catch (e) {
    // Ignore config access errors
  }

  try {
    // Parse response if it's JSON
    let responseData = payload;
    if (typeof payload === 'string') {
      try {
        responseData = JSON.parse(payload);
      } catch (e) {
        // Not JSON, use as is
      }
    }

    // Extract token information
    const tokenInfo = extractTokenInfo(request, responseData);

    // Set token information on request object for access in onResponse hook and other tracking
    (request as any).inputTokens = tokenInfo.inputTokens;
    (request as any).outputTokens = tokenInfo.outputTokens;
    (request as any).tokenCount = tokenInfo.totalTokens;

        // **DYNAMIC SOLUTION: Build provider mapping from config**
    const originalModel = (request as any).originalRequestModel || 'unknown';
    const routerModel = (request.body as any)?.model || 'unknown';
    
    let modelInfo = { model: routerModel, provider: 'unknown' };
    
    // If router processed the model and it's still in provider,model format
    if (routerModel.includes(',')) {
      const [provider, model] = routerModel.split(',', 2);
      modelInfo = { model: model.trim(), provider: provider.trim() };
    }
    // Build dynamic mapping from config Router section
    else if (config?.Router) {
      // Create a reverse mapping: finalModel -> provider
      const modelToProviderMap: Record<string, string> = {};
      
      for (const [routeName, routeModel] of Object.entries(config.Router)) {
        if (typeof routeModel === 'string' && routeModel.includes(',')) {
          const [routeProvider, finalModel] = routeModel.split(',', 2);
          modelToProviderMap[finalModel.trim()] = routeProvider.trim();
        }
      }
      
      // Check if our current model matches any configured final model
      if (modelToProviderMap[routerModel]) {
        modelInfo = { model: routerModel, provider: modelToProviderMap[routerModel] };
      }
    }
    
    // **DETECT ACTUAL ROUTE USED - Based on router.ts logic**
    const routeUsed = detectRouteUsed(request, config, tokenInfo.totalTokens);

    // Track the request with enhanced token tracking for all routes
    analytics.trackRequest({
      model: routerModel, // Keep full format for display
      provider: modelInfo.provider,
      endpoint: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      responseTime,
      tokenCount: tokenInfo.totalTokens,
      inputTokens: tokenInfo.inputTokens,
      outputTokens: tokenInfo.outputTokens,
      cost: estimateCost(modelInfo.model, tokenInfo),
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
      error: reply.statusCode >= 400 ? getErrorMessage(responseData) : undefined,
      route: routeUsed,
      originalModel: request.modelInfo?.model || 'unknown',
      actualModel: modelInfo.model
    });

  } catch (error) {
    console.error('Error tracking request:', error);
  }

  done(null, payload);
}

// Helper to estimate cost (rough estimation)
function estimateCost(model: string, tokenInfo: { inputTokens: number; outputTokens: number }): number {
  // Rough cost estimation based on known pricing (as of 2024)
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
    'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 },
    'claude-3-opus': { input: 0.015 / 1000, output: 0.075 / 1000 },
    'claude-3-sonnet': { input: 0.003 / 1000, output: 0.015 / 1000 },
    'claude-3-haiku': { input: 0.00025 / 1000, output: 0.00125 / 1000 },
    'claude-3-5-sonnet': { input: 0.003 / 1000, output: 0.015 / 1000 }
  };

  const modelPricing = pricing[model] || { input: 0.001 / 1000, output: 0.002 / 1000 };
  
  return (tokenInfo.inputTokens * modelPricing.input) + (tokenInfo.outputTokens * modelPricing.output);
}

// Helper to extract error message
function getErrorMessage(response: any): string {
  if (typeof response === 'object') {
    return response.error?.message || response.message || 'Unknown error';
  }
  return 'Unknown error';
}
