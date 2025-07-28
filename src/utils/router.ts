import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { loggers } from "./logger";
import { ApiError, circuitBreaker, retryWithBackoff } from "./errorHandler";
import { resolveSecurePath } from "./pathSecurity";

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

const getUseModel = async (req: any, tokenCount: number, config: any) => {
  if (req.body.model.includes(",")) {
    return req.body.model;
  }
  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  if (tokenCount > longContextThreshold && config.Router.longContext) {
    loggers.router.info("Using long context model", {
      tokenCount,
      threshold: longContextThreshold,
      model: config.Router.longContext,
    });
    return config.Router.longContext;
  }
  // If the model is claude-3-5-haiku, use the background model
  if (
    req.body.model?.startsWith("claude-3-5-haiku") &&
    config.Router.background
  ) {
    loggers.router.info("Using background model", {
      originalModel: req.body.model,
      backgroundModel: config.Router.background,
    });
    return config.Router.background;
  }
  // if exits thinking, use the think model
  if (req.body.thinking && config.Router.think) {
    loggers.router.info("Using think model", {
      thinkModel: config.Router.think,
    });
    return config.Router.think;
  }
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    config.Router.webSearch
  ) {
    loggers.router.info("Using web search model", {
      webSearchModel: config.Router.webSearch,
    });
    return config.Router.webSearch;
  }
  return config.Router!.default;
};

export const router = async (req: any, _res: any, config: any) => {
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  try {
    const tokenCount = calculateTokenCount(
      messages as MessageParam[],
      system,
      tools as Tool[]
    );

    let model;
    if (config.CUSTOM_ROUTER_PATH) {
      try {
        const customRouterPath = resolveSecurePath(config.CUSTOM_ROUTER_PATH);
        const customRouter = require(customRouterPath);
        model = await customRouter(req, config);
        if (model) {
          loggers.router.debug("Custom router selected model", { model });
        }
      } catch (e: any) {
        loggers.router.error("Failed to load custom router", {
          error: e.message,
          path: config.CUSTOM_ROUTER_PATH,
        });
      }
    }
    if (!model) {
      model = await getUseModel(req, tokenCount, config);
    }
    
    // Check circuit breaker before proceeding
    const [provider] = model.split(',');
    if (circuitBreaker.isOpen(provider)) {
      loggers.router.warn("Circuit breaker open for provider", { provider });
      // Try to use fallback if available
      if (config.Router.fallback && config.Router.fallback !== model) {
        model = config.Router.fallback;
        loggers.router.info("Using fallback model", { fallbackModel: model });
      } else {
        throw new ApiError(
          `Provider ${provider} is temporarily unavailable due to repeated failures`,
          503,
          provider
        );
      }
    }
    
    req.body.model = model;
    loggers.router.info("Route selected", {
      model,
      tokenCount,
      hasTools: !!tools && tools.length > 0,
      hasThinking: !!req.body.thinking,
    });
  } catch (error: any) {
    loggers.router.error("Error in router middleware", {
      error: error.message,
      stack: error.stack,
    });
    req.body.model = config.Router!.default;
  }
  return;
};
