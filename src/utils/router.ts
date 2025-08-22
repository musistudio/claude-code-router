import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { log } from "./log";
import { sessionUsageCache, Usage } from "./cache";

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

const getUseModel = async (
  req: any,
  tokenCount: number,
  config: any,
  lastUsage?: Usage | undefined
) => {
  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const finalProvider = config.Providers.find(
      (p: any) => p.name.toLowerCase() === provider
    );
    const finalModel = finalProvider?.models?.find(
      (m: any) => m.toLowerCase() === model
    );
    if (finalProvider && finalModel) {
      return `${finalProvider.name},${finalModel}`;
    }
    return req.body.model;
  }
  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if (
    (lastUsageThreshold || tokenCountThreshold) &&
    config.Router.longContext
  ) {
    log(
      "Using long context model due to token count:",
      tokenCount,
      "threshold:",
      longContextThreshold
    );
    return config.Router.longContext;
  }
  if (
    req.body?.system?.length > 1 &&
    req.body?.system[1]?.text?.startsWith("<CCR-SUBAGENT-MODEL>")
  ) {
    const model = req.body?.system[1].text.match(
      /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s
    );
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(
        `<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`,
        ""
      );
      return model[1];
    }
  }
  // If the model is claude-3-5-haiku, use the background model
  if (
    req.body.model?.startsWith("claude-3-5-haiku") &&
    config.Router.background
  ) {
    log("Using background model for ", req.body.model);
    return config.Router.background;
  }
  // if exits thinking, use the think model
  if (req.body.thinking && config.Router.think) {
    log("Using think model for ", req.body.thinking);
    return config.Router.think;
  }
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    config.Router.webSearch
  ) {
    return config.Router.webSearch;
  }
  return config.Router!.default;
};

export const router = async (req: any, _res: any, config: any) => {
  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
    }
  }
  const lastMessageUsage = sessionUsageCache.get(req.sessionId);
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  
  // Process inline reasoning tokens in messages
  if (messages && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user' && typeof lastMessage.content === 'string') {
      const content = lastMessage.content;
      
      // Define token mappings
      const tokenMap = {
        'Quick:': { effort: 'low', verbosity: 'low', thinking: { budget_tokens: 500, type: 'enabled' } },
        'Deep:': { effort: 'high', verbosity: 'medium', thinking: { budget_tokens: 2000, type: 'enabled' } },
        'Explain:': { effort: 'medium', verbosity: 'high', thinking: { budget_tokens: 1000, type: 'enabled' } },
        'Brief:': { effort: 'medium', verbosity: 'low', thinking: { budget_tokens: 1000, type: 'enabled' } }
      };
      
      const colonMap = {
        ':quick': { effort: 'low', verbosity: 'low', thinking: { budget_tokens: 500, type: 'enabled' } },
        ':deep': { effort: 'high', verbosity: 'medium', thinking: { budget_tokens: 2000, type: 'enabled' } },
        ':explain': { effort: 'medium', verbosity: 'high', thinking: { budget_tokens: 1000, type: 'enabled' } },
        ':brief': { effort: 'medium', verbosity: 'low', thinking: { budget_tokens: 1000, type: 'enabled' } }
      };
      
      let updatedContent = content;
      let foundToken = false;
      
      // Process prefix tokens (strip from beginning)
      for (const [token, params] of Object.entries(tokenMap)) {
        if (content.startsWith(token)) {
          if (!req.body.reasoning_effort) req.body.reasoning_effort = params.effort;
          if (!req.body.verbosity) req.body.verbosity = params.verbosity;
          if (!req.body.thinking) req.body.thinking = params.thinking;
          updatedContent = content.substring(token.length).trim();
          foundToken = true;
          log(`Applied reasoning token "${token}" -> effort: ${params.effort}, verbosity: ${params.verbosity}`);
          break;
        }
      }
      
      // Process colon tokens (strip from anywhere)
      if (!foundToken) {
        for (const [colon, params] of Object.entries(colonMap)) {
          if (content.includes(colon)) {
            if (!req.body.reasoning_effort) req.body.reasoning_effort = params.effort;
            if (!req.body.verbosity) req.body.verbosity = params.verbosity;
            if (!req.body.thinking) req.body.thinking = params.thinking;
            updatedContent = updatedContent.replace(colon, '').trim();
            foundToken = true;
            log(`Applied reasoning colon token "${colon}" -> effort: ${params.effort}, verbosity: ${params.verbosity}`);
            break;
          }
        }
      }
      
      // Update message content if we found and stripped tokens
      if (foundToken) {
        lastMessage.content = updatedContent;
      }
    }
  }
  try {
    const tokenCount = calculateTokenCount(
      messages as MessageParam[],
      system,
      tools as Tool[]
    );

    let model;
    if (config.CUSTOM_ROUTER_PATH) {
      try {
        const customRouter = require(config.CUSTOM_ROUTER_PATH);
        req.tokenCount = tokenCount; // Pass token count to custom router
        model = await customRouter(req, config);
      } catch (e: any) {
        log("failed to load custom router", e.message);
      }
    }
    if (!model) {
      model = await getUseModel(req, tokenCount, config, lastMessageUsage);
    }
    req.body.model = model;
    
    // Note: GPT-5 specific parameter transformations have been moved to LLMS OpenAI transformer
    // CCR should only handle routing, not provider-specific transformations
  } catch (error: any) {
    log("Error in router middleware:", error.message);
    req.body.model = config.Router!.default;
  }
  return;
};
