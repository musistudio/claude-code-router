import { FastifyRequest, FastifyReply } from 'fastify';
import { analytics } from '../utils/analytics';
import { get_encoding } from "tiktoken";

const enc = get_encoding("cl100k_base");

interface TrackedRequest extends FastifyRequest {
  startTime?: number;
  modelInfo?: {
    model: string;
    provider: string;
  };
  selectedProvider?: string;
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

// Helper to extract token info from response
function extractTokenInfo(request: FastifyRequest, response: any) {
  const body = request.body as any;
  
  let inputTokens = 0;
  let outputTokens = 0;

  // Estimate input tokens
  if (body?.messages && Array.isArray(body.messages)) {
    const inputText = body.messages.map((m: any) => m.content || '').join(' ');
    inputTokens = calculateTokenCountFromText(inputText);
  }

  // Extract output tokens from response
  if (response?.choices && Array.isArray(response.choices)) {
    const outputText = response.choices.map((c: any) => 
      c.message?.content || c.text || ''
    ).join(' ');
    outputTokens = calculateTokenCountFromText(outputText);
  }

  // Check if response has usage info
  if (response?.usage) {
    inputTokens = response.usage.prompt_tokens || inputTokens;
    outputTokens = response.usage.completion_tokens || outputTokens;
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

    // Get model info from the actual routing (if available in response)
    let modelInfo = request.modelInfo || { model: 'unknown', provider: 'unknown' };
    if (responseData?.model) {
      modelInfo = {
        model: responseData.model,
        provider: modelInfo.provider
      };
    }

    // Determine provider from routing
    const provider = determineProvider(request, responseData);

    // Track the request
    analytics.trackRequest({
      model: modelInfo?.model || 'unknown',
      provider: provider,
      endpoint: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      responseTime,
      tokenCount: tokenInfo.totalTokens,
      inputTokens: tokenInfo.inputTokens,
      outputTokens: tokenInfo.outputTokens,
      cost: estimateCost(modelInfo?.model || '', tokenInfo),
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
      error: reply.statusCode >= 400 ? getErrorMessage(responseData) : undefined
    });

  } catch (error) {
    console.error('Error tracking request:', error);
  }

  done(null, payload);
}

// Helper to determine provider based on routing
function determineProvider(request: TrackedRequest, response: any): string {
    // The provider is now determined by the router and added to the request object
    // Use the value from request.selectedProvider if available
    const provider = request.selectedProvider || 'unknown';

    return provider;
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
