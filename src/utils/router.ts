import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { log } from "./log";

const enc = get_encoding("cl100k_base");

const calculateTokenCount = (
  messages: MessageParam[],
  system: any,
  tools: Tool[]
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
            tokenCount += enc.encode(
              JSON.stringify(contentPart.input)
            ).length;
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
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
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

const transformClaudeToOpenAI = (claudeRequest: any, config: any) => {
  // Transform Claude's /v1/messages format to OpenAI's /v1/chat/completions format
  const { messages, system, tools, model, max_tokens, temperature, ...rest } = claudeRequest;
  
  const openAIMessages = [];
  
  // Add system message if present
  if (system) {
    if (typeof system === "string") {
      openAIMessages.push({ role: "system", content: system });
    } else if (Array.isArray(system)) {
      const systemContent = system.map(item => item.text || "").join(" ");
      openAIMessages.push({ role: "system", content: systemContent });
    }
  }
  
  // Transform messages
  if (Array.isArray(messages)) {
    messages.forEach((message: any) => {
      if (typeof message.content === "string") {
        openAIMessages.push({
          role: message.role,
          content: message.content
        });
      } else if (Array.isArray(message.content)) {
        // For complex content, convert to text for now
        const textContent = message.content
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join(" ");
        openAIMessages.push({
          role: message.role,
          content: textContent
        });
      }
    });
  }
  
  // Base request structure
  const openAIRequest = {
    messages: openAIMessages,
    stream: false,
    ...rest
  };
  
  // Add global custom parameters
  if (config.protocol_manager_config) {
    openAIRequest.protocol_manager_config = config.protocol_manager_config;
  }
  
  if (config.semantic_cache) {
    openAIRequest.semantic_cache = config.semantic_cache;
  }
  
  if (config.fallback_mode) {
    openAIRequest.fallback_mode = config.fallback_mode;
  }
  
  return openAIRequest;
};

const transformOpenAIToClaude = (openAIResponse: any) => {
  // Transform OpenAI response back to Claude format
  const { choices, usage } = openAIResponse;
  
  if (!choices || choices.length === 0) {
    throw new Error("No choices in OpenAI response");
  }
  
  const choice = choices[0];
  const message = choice.message;
  
  return {
    id: openAIResponse.id || `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: message.content || ""
      }
    ],
    model: openAIResponse.model,
    stop_reason: choice.finish_reason === "stop" ? "end_turn" : choice.finish_reason,
    stop_sequence: null,
    usage: usage ? {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0
    } : {
      input_tokens: 0,
      output_tokens: 0
    }
  };
};


const forwardToOpenAI = async (req: any, reply: any, config: any) => {
  try {
    const autoRouterConfig = config.AutoRouter;
    if (!autoRouterConfig || !autoRouterConfig.enabled) {
      throw new Error("AutoRouter not configured or disabled");
    }

    // Use global configuration
    const globalConfig = autoRouterConfig.global || {};
    
    // Transform Claude request to OpenAI format with global config
    const openAIRequest = transformClaudeToOpenAI(req.body, globalConfig);
    
    log("Forwarding request to OpenAI API:", autoRouterConfig.endpoint);
    
    // Call OpenAI-compatible API
    const response = await fetch(autoRouterConfig.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${autoRouterConfig.api_key}`,
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code-router/1.0'
      },
      body: JSON.stringify(openAIRequest),
      signal: AbortSignal.timeout(autoRouterConfig.timeout || 30000)
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Transform OpenAI response to Claude format
    const claudeResponse = transformOpenAIToClaude(result);
    
    reply.send(claudeResponse);
    log("Successfully forwarded request to OpenAI API");
  } catch (error: any) {
    log("Error forwarding to OpenAI API:", error.message);
    
    reply.code(500).send({
      type: "error",
      error: {
        type: "api_error",
        message: `Router error: ${error.message}`
      }
    });
  }
};

export const router = async (req: any, reply: any, config: any) => {
  await forwardToOpenAI(req, reply, config);
};